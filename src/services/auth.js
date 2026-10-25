// Single-passkey auth store. There is exactly one credential (the owner's),
// file-backed at data/auth.json; a volume mounted at data/ keeps the key
// across deploys.
//
// Lifecycle:
//   unclaimed  no credential on disk. A setup code exists in the store and
//              is printed by the server on boot; /login shows the claim form
//              and the register endpoints require the code.
//   claimed    registration is closed entirely. Re-keying is a shell
//              decision, not a web one: scripts/auth/reset.mjs wipes the
//              credential + sessions and mints a fresh setup code.
//
// Sessions are opaque 256-bit bearer tokens delivered as an httpOnly cookie;
// only their sha256 lands on disk, so a leaked store file can't be replayed.
// WebAuthn challenges are one-time-use and live in memory: a restart between
// options and verify just means one retried ceremony.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import config from '../config.js'

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000
const CHALLENGE_TTL_MS = 2 * 60 * 1000

// Crockford-ish alphabet: no 0/O/1/I lookalikes, so the code survives being
// read off a server log and typed on a phone.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

function storePath() {
  return resolve(process.cwd(), config.auth.storePath)
}

const EMPTY_STORE = { credential: null, setupCode: null, sessions: {} }

async function loadStore() {
  try {
    const raw = await readFile(storePath(), 'utf-8')
    return { ...EMPTY_STORE, ...JSON.parse(raw) }
  } catch {
    return { ...EMPTY_STORE }
  }
}

async function saveStore(store) {
  await mkdir(dirname(storePath()), { recursive: true })
  await writeFile(storePath(), JSON.stringify(store, null, 2) + '\n')
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function pruneSessions(store, now = Date.now()) {
  for (const [hash, session] of Object.entries(store.sessions)) {
    if (!session || session.expiresAt <= now) delete store.sessions[hash]
  }
}

// --- claim state -------------------------------------------------------------

export async function isClaimed() {
  return Boolean((await loadStore()).credential)
}

// Returns the current setup code, minting one if the store is unclaimed and
// has none. Idempotent; a no-op once a credential exists.
export async function ensureSetupCode() {
  const store = await loadStore()
  if (store.credential) return null
  if (!store.setupCode) {
    const bytes = randomBytes(8)
    const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    store.setupCode = `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
    await saveStore(store)
  }
  return store.setupCode
}

export async function verifySetupCode(code) {
  const store = await loadStore()
  if (store.credential || !store.setupCode || typeof code !== 'string') return false
  const expected = Buffer.from(store.setupCode.toUpperCase())
  const given = Buffer.from(code.trim().toUpperCase())
  return expected.length === given.length && timingSafeEqual(expected, given)
}

// --- credential --------------------------------------------------------------

export async function getCredential() {
  return (await loadStore()).credential
}

// Claiming consumes the setup code and closes registration for good.
export async function saveCredential(credential) {
  const store = await loadStore()
  store.credential = credential
  store.setupCode = null
  await saveStore(store)
}

export async function updateCredentialCounter(counter) {
  const store = await loadStore()
  if (!store.credential) return
  store.credential.counter = counter
  await saveStore(store)
}

// --- sessions ----------------------------------------------------------------

export async function createSession(userAgent = '') {
  const token = randomBytes(32).toString('base64url')
  const store = await loadStore()
  pruneSessions(store)
  const now = Date.now()
  store.sessions[hashToken(token)] = {
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: String(userAgent).slice(0, 200),
  }
  await saveStore(store)
  return token
}

export async function getSession(token) {
  if (typeof token !== 'string' || !token) return null
  const store = await loadStore()
  const session = store.sessions[hashToken(token)]
  if (!session || session.expiresAt <= Date.now()) return null
  return session
}

// The name a live session goes by outside this file: its hash, the same id
// the desk lists and the revoke endpoint takes. What the audit trail writes
// for "who", since the token itself must never reach a log. Null for a
// token with no live session.
export async function sessionId(token) {
  return (await getSession(token)) ? hashToken(token) : null
}

// Read-only view for the owner dashboard: when each live session was minted,
// when it lapses, what user agent claimed it, and which one is the caller's
// own (`current`, when the caller's token is passed). Rows carry the token's
// hash as `id`: only hashes are on disk, a hash cannot be replayed, and it
// is what the revoke endpoint takes.
export async function listSessions(currentToken = null) {
  const store = await loadStore()
  pruneSessions(store)
  const mine = currentToken ? hashToken(currentToken) : null
  return Object.entries(store.sessions)
    .map(([id, s]) => ({ id, ...s, current: id === mine }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

// Revoke by id (the hash a dashboard row carries): a lost phone signs out
// from any other device. Returns whether anything was there to revoke.
export async function destroySessionById(id) {
  if (typeof id !== 'string' || !id) return false
  const store = await loadStore()
  pruneSessions(store)
  if (!store.sessions[id]) return false
  delete store.sessions[id]
  await saveStore(store)
  return true
}

// Every session but the caller's own: a lost phone and a shared machine in
// one tap. Returns how many went.
export async function destroyOtherSessions(currentToken) {
  const store = await loadStore()
  pruneSessions(store)
  const keep = typeof currentToken === 'string' && currentToken ? hashToken(currentToken) : null
  let gone = 0
  for (const id of Object.keys(store.sessions)) {
    if (id === keep) continue
    delete store.sessions[id]
    gone += 1
  }
  await saveStore(store)
  return gone
}

export async function destroySession(token) {
  if (typeof token !== 'string' || !token) return
  const store = await loadStore()
  pruneSessions(store)
  delete store.sessions[hashToken(token)]
  await saveStore(store)
}

// --- challenges (in-memory, one-time-use) ------------------------------------

const challenges = new Map()
// Bounded: login/options mints a challenge for any unauthenticated caller,
// so TTL pruning alone leaves a burst window where the map grows without
// limit. 64 outstanding ceremonies is far beyond one person's retries.
const MAX_CHALLENGES = 64

function pruneChallenges(now = Date.now()) {
  for (const [challenge, expiresAt] of challenges) {
    if (expiresAt <= now) challenges.delete(challenge)
  }
}

export function rememberChallenge(challenge) {
  pruneChallenges()
  // Map iteration order is insertion order: the first key is the oldest.
  while (challenges.size >= MAX_CHALLENGES) {
    challenges.delete(challenges.keys().next().value)
  }
  challenges.set(challenge, Date.now() + CHALLENGE_TTL_MS)
}

export function consumeChallenge(challenge) {
  pruneChallenges()
  if (!challenges.has(challenge)) return false
  challenges.delete(challenge)
  return true
}
