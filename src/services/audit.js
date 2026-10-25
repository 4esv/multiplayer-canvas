// The audit trail: one line per privileged or destructive action, appended
// to a month file under data/audit/ (the prod volume). Who, what, on which
// target, how it went, from where.
//
// Application-level on purpose. The access log (Caddy's, since it is the
// one thing that sees the client address) can say a DELETE hit
// /api/etc/pages/snowknight at 15:52 and got a 200. It cannot say that the
// owner's session deleted the page rather than the sweep expiring it, and
// that is the question that came up first (#222: a live page vanished and
// it took directory mtimes and a source audit to answer). So every route
// that changes state writes one of these, and so does the sweep.
//
// One JSON object per line (NDJSON), so grep and jq both work on the file:
//
//   { at, action, actor, target, outcome, ip, ua, req, ...detail }
//
//   at       ISO timestamp
//   action   dotted and stable: 'etc.page.delete', 'auth.login'
//   actor    { kind, id }; kind is session | inbox | hook | anon | system
//   target   what the action was aimed at (a page code, a hook name)
//   outcome  one short word: ok | denied | missing | bad | locked | error
//   ip, ua   the caller, as far as the proxy told us (server.js trustProxy)
//   req      the request id, which is what the 500 page prints
//
// What never lands here: a session token, a PIN, a signing key, a setup
// code, an upload's bytes. A session is named by the hash the desk shows
// (the id the revoke endpoint takes), so a line matches a row on /admin
// and cannot be replayed. test/audit.test.js asserts the secrets it minted
// are absent from the file.
//
// Append-only. Nothing in the app reads it back except readAudit, which
// exists for the tests and for a desk view later; nothing rotates it, since
// a month of the owner's actions is kilobytes. A write failure is logged
// through the app logger and does not fail the request: an unwritable
// volume must page someone, not lock the owner out of their own desk.

import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import config from '../config.js'
import { sessionId } from './auth.js'
import { cookieValues, SESSION_COOKIE } from '../middleware/auth.js'

// seam: test/audit.test.js
export function auditPath(now = Date.now()) {
  return join(config.audit.dir, `${new Date(now).toISOString().slice(0, 7)}.ndjson`)
}

// Who is calling. A route behind requireAuth already resolved its session
// and left it on request.actor; the auth routes themselves (login, logout)
// run without the gate, so the cookie is read here as a fallback. A caller
// with no session is 'anon'; no request at all (the sweep) is 'system'.
async function actorOf(request) {
  if (!request) return { kind: 'system' }
  if (request.actor) return request.actor
  for (const token of cookieValues(request.headers?.cookie, SESSION_COOKIE)) {
    const id = await sessionId(token)
    if (id) return { kind: 'session', id }
  }
  return { kind: 'anon' }
}

// Writes are chained so two actions in one tick land in the order they
// happened, and so a burst of appends never interleaves partial lines.
let queue = Promise.resolve()

/**
 * Record one action.
 * @param {import('fastify').FastifyRequest | null} request  null for the sweep
 * @param {string} action   dotted, stable
 * @param {object} fields   target, outcome, actor (override), and any detail
 */
export function audit(request, action, fields = {}) {
  const at = new Date().toISOString()
  const { actor: override, ...detail } = fields
  // Resolved now, not when the write's turn comes: a logout line is asked
  // for while the session still exists and must name it.
  const actor = override ? Promise.resolve(override) : actorOf(request)
  const ip = request?.ip ?? null
  const ua = request ? String(request.headers?.['user-agent'] || '').slice(0, 200) : null
  const req = request?.id ?? null
  const log = request?.log
  queue = queue.then(async () => {
    const entry = {
      at,
      action,
      actor: await actor,
      target: detail.target ?? null,
      outcome: detail.outcome ?? 'ok',
      ip,
      ua,
      req,
      ...detail,
    }
    const path = auditPath()
    try {
      await mkdir(config.audit.dir, { recursive: true })
      await appendFile(path, JSON.stringify(entry) + '\n')
    } catch (err) {
      if (log) log.error({ err, path, action }, 'audit line lost')
      else console.error('audit line lost', path, action, err)
    }
  })
  return queue
}

// Every line of one month, oldest first. For the tests and the desk.
// seam: test/audit.test.js
export async function readAudit(now = Date.now()) {
  await queue
  let text
  try {
    text = await readFile(auditPath(now), 'utf-8')
  } catch {
    return []
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}
