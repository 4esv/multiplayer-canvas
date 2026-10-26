// multiplayer-canvas/rooms: private rooms on the same socket: a short code, an optional PIN, idle
//   and age limits.
// Inputs: startSession({ kind, pin, code }), findSession(code), checkSessionPin(rec, attempt),
//   endSession(code).
// Outputs: session records, each holding its own presence room; onSessionEnd(fn) is told when one
//   ends on its own. Node.
//
// Sessions (2026-09-25): a room of the owner's own, on the same socket.
//
// The public room is everyone on the site at once (primitives/presence/presence-room.js
// presenceRoom). A room of the owner's own is a second room he opens on
// purpose, for a few people he has invited, and it is one of two KINDS
// (2026-09-26), each a superset of what comes before it:
//   follow    one to many. Everybody in it follows the owner, sees what he
//             sees and hears what he plays; what they play goes nowhere.
//   session   many to many, for jams, walk-throughs, demos and games:
//             everyone can do everything, and every act goes to all.
// Its tabs reach it on the same endpoint with `?session=<code>&kind=<kind>`
// (routes/presence.js), and in it they may say one more thing than in the
// public room, the act (presence-protocol.js actOf).
//
// A code is the owner's word or a generated one. He can name a room
// (`?session=jam` on the page: the door opens it with that code when it
// does not exist yet), or leave it bare and be handed six characters off
// the alphabet below. Anybody else only ever joins a code that is live.
//
// What this file owns is the registry: which sessions exist, their codes
// and PINs, the throttle on wrong PINs, and when a session ends. It is in
// memory and nothing else. A restart ends every session, which is the
// right answer for a room of people who are all in it right now: there is
// nothing to come back to. The one thing that persists is the desk's
// default for new sessions (services/rooms.js).
//
// A session ends three ways: the owner ends it from the desk, it has had
// nobody in it for IDLE_MS, or it is MAX_AGE_MS old. Ending tells every tab
// and closes each with 4404 (presence-room.js end).

import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

import { createRoom } from '../presence/presence-room.js'
import { ROOM_CODE_RE } from './finder-url.js'

// What a session that ends on its own (idle, age) is reported to. Nothing,
// until the host hands a function in: the site passes its audit trail.
let report = () => {}
/** @param {(ended: {target: string, why: string}) => void} fn */
export function onSessionEnd(fn) {
  report = fn
}

// seam: test/sessions.test.js
export const KINDS = Object.freeze(['follow', 'session'])
// Six from an alphabet with no lookalikes (no i, l, o, 0, 1): read off a
// screen across a room and typed on a phone without a second try.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const CODE_LEN = 6
// the grammar a code off the wire must match before it is looked up, or
// before the owner's own word becomes one. It is the address's grammar
// (primitives/rooms/finder-url.js ROOM_CODE_RE), stated there because the browser
// reads it too, and a generated code is a word of it.
export const CODE_RE = ROOM_CODE_RE
// seam: test/sessions.test.js
export const IDLE_MS = 20 * 60 * 1000
// seam: test/sessions.test.js
export const MAX_AGE_MS = 12 * 60 * 60 * 1000
// Wrong PINs per session code per window, then locked until the window
// ends. Four
// digits is ten thousand guesses, and twenty an hour makes that a year.
// seam: test/sessions.test.js
export const PIN_TRIES = 20
const PIN_WINDOW_MS = 60 * 60 * 1000
// A ceiling, not a quota: the owner is the only one who can open a session,
// and a script that opens them forever is the failure this catches.
// seam: test/sessions.test.js
export const MAX_SESSIONS = 20
const SWEEP_MS = 60 * 1000

const live = new Map() // code -> record
const pinTries = new Map() // code -> { count, resetAt }
let sweeper = null

function newCode() {
  for (;;) {
    let code = ''
    // rejection sampling: 248 is the largest multiple of 31 under 256, so
    // every letter is equally likely
    while (code.length < CODE_LEN) {
      for (const b of randomBytes(CODE_LEN * 2)) {
        if (b >= 248 || code.length === CODE_LEN) continue
        code += ALPHABET[b % ALPHABET.length]
      }
    }
    if (!live.has(code)) return code
  }
}

const newPin = () => String(randomInt(0, 10000)).padStart(4, '0')

/**
 * The PIN a room opens with, from what the owner asked for.
 * @param {unknown} ask the `pin` off the owner's query: absent or '' is
 *   the desk's default, four digits are that PIN, 'off' is none
 * @param {boolean} deskDefault services/rooms.js roomSettings().pin
 * @returns {boolean|string} what startSession takes as `pin`
 *
 * Anything else (three digits, a word) is read as not having asked, so a
 * slip in a typed address still opens a room behind the desk's door rather
 * than an open one.
 */
// seam: test/sessions.test.js
export function pinAsked(ask, deskDefault) {
  if (ask === 'off') return false
  if (typeof ask === 'string' && /^\d{4}$/.test(ask)) return ask
  return Boolean(deskDefault)
}

/**
 * Open a session. Owner only: the callers (the desk API and the socket's
 * door) have already checked.
 * @param {{kind?:string, pin?:boolean|string, code?:string}} opts pin is
 *   true (a new one), false (none) or four digits (that one); code is the
 *   owner's own word, and absent means a generated one
 * @param {number} [now]
 * @returns {object|null} the record, or null at the ceiling, for a code
 *   that is not a code, or for one already live (the caller joins that)
 */
// seam: test/sessions.test.js
export function startSession({ kind = 'session', pin = true, code } = {}, now = Date.now()) {
  if (live.size >= MAX_SESSIONS) return null
  if (code !== undefined && (typeof code !== 'string' || !CODE_RE.test(code) || live.has(code)))
    return null
  const rec = {
    code: code ?? newCode(),
    kind: KINDS.includes(kind) ? kind : 'session',
    pin: typeof pin === 'string' && /^\d{4}$/.test(pin) ? pin : pin === true ? newPin() : null,
    started: now,
    // empty from the moment it opens: the owner's own tab is usually a
    // moment behind, and a session nobody ever entered still ends
    idleSince: now,
    room: null,
  }
  rec.room = createRoom({
    session: rec,
    onSize: (size) => {
      if (size) rec.idleSince = null
      else if (rec.idleSince === null) rec.idleSince = Date.now()
    },
  })
  live.set(rec.code, rec)
  ensureSweep()
  return rec
}

/**
 * The live session behind a code, or null (unknown, malformed, ended, or
 * past its age, which ends it on the way).
 * @param {unknown} code
 * @param {number} [now]
 */
// seam: test/sessions.test.js
export function findSession(code, now = Date.now()) {
  if (typeof code !== 'string' || !CODE_RE.test(code)) return null
  const rec = live.get(code)
  if (!rec) return null
  if (now - rec.started >= MAX_AGE_MS) {
    endSession(code, 'age')
    return null
  }
  return rec
}

/**
 * End a session: every tab is told and closed with 4404.
 * @param {string} code
 * @param {string} [why] owner | idle | age (the last two are audited here as
 *   the system; the owner's line is the route's) | reset (the tests)
 * @returns {boolean} false if there was no such session
 */
// seam: test/sessions.test.js
export function endSession(code, why = 'owner') {
  const rec = live.get(code)
  if (!rec) return false
  live.delete(code)
  pinTries.delete(code)
  rec.room.end()
  // the owner's own ending is audited by the route that did it, with the
  // owner as the actor; the other two are the system's
  if (why === 'idle' || why === 'age') report({ target: code, why })
  return true
}

/** every live session, newest first, as the desk shows it */
// seam: test/sessions.test.js
export function listSessions() {
  return [...live.values()]
    .map((r) => ({
      code: r.code,
      kind: r.kind,
      pin: r.pin,
      people: r.room.size,
      hosts: r.room.hosts,
      started: r.started,
      idleSince: r.idleSince,
    }))
    .sort((a, b) => b.started - a.started)
}

function pinTryAllowed(code, now) {
  const state = pinTries.get(code)
  if (!state || now > state.resetAt) return true
  return state.count < PIN_TRIES
}
function countPinTry(code, now) {
  const state = pinTries.get(code)
  if (!state || now > state.resetAt) pinTries.set(code, { count: 1, resetAt: now + PIN_WINDOW_MS })
  else state.count += 1
  for (const [k, v] of pinTries) if (now > v.resetAt) pinTries.delete(k)
}

/**
 * Check a guest's PIN against a session.
 * @param {object} rec a live session record
 * @param {unknown} attempt the `pin` off the query string
 * @param {number} [now]
 * @returns {'ok'|'missing'|'bad'|'locked'}
 *
 * 'ok' for a session with no PIN. 'missing' (no PIN offered at all) is not
 * counted: it is how every guest's first knock looks, before they have been
 * asked. A lock answers before anything else, so a locked session tells a
 * guesser nothing more, right PIN or wrong. Timing-safe: both sides are
 * four ASCII digits by the time they are compared.
 */
// seam: test/sessions.test.js
export function checkSessionPin(rec, attempt, now = Date.now()) {
  if (!rec.pin) return 'ok'
  if (!pinTryAllowed(rec.code, now)) return 'locked'
  if (attempt === undefined || attempt === '') return 'missing'
  const got = typeof attempt === 'string' && /^\d{4}$/.test(attempt) ? attempt : null
  if (got && timingSafeEqual(Buffer.from(got), Buffer.from(rec.pin))) {
    pinTries.delete(rec.code)
    return 'ok'
  }
  countPinTry(rec.code, now)
  return 'bad'
}

/**
 * End what has been empty for IDLE_MS or open for MAX_AGE_MS.
 * @param {number} [now]
 * @returns {string[]} the codes ended
 */
// seam: test/sessions.test.js
export function sweepSessions(now = Date.now()) {
  const gone = []
  for (const rec of [...live.values()]) {
    const why =
      now - rec.started >= MAX_AGE_MS
        ? 'age'
        : rec.idleSince !== null && now - rec.idleSince >= IDLE_MS
          ? 'idle'
          : null
    if (why && endSession(rec.code, why)) gone.push(rec.code)
  }
  return gone
}

// The sweep runs while any session exists and stops when none do, so an
// ordinary process holds no timer for a feature nobody is using. Unref'd:
// it never holds the process (or a test) open.
function ensureSweep() {
  if (sweeper) return
  sweeper = setInterval(() => {
    sweepSessions()
    if (!live.size) {
      clearInterval(sweeper)
      sweeper = null
    }
  }, SWEEP_MS)
  sweeper.unref?.()
}

// For the tests: every session ended, every throttle forgotten.
// seam: test/sessions.test.js
export function resetSessions() {
  for (const code of [...live.keys()]) endSession(code, 'reset')
  pinTries.clear()
}
