// Session gate for the private canvas pages (/login is the only door).
// requireAuth is a route-level preHandler: HTML routes bounce to
// /login?next=<path> (which fires the passkey prompt on load), API routes
// get a bare 401. Protected responses are never cacheable.

import { fail } from '../lib/api-errors.js'
import { getSession, sessionId } from '../services/auth.js'

export const SESSION_COOKIE = 'canvas_key'
// The owner hint: set beside the session and cleared with it
// (routes/auth.js), readable by a page and carrying no authority. It only
// tells the canvas that asking /api/whoami is worth one request; the answer
// is what counts. canvas/commands.js reads it under the same name.
export const OWNER_HINT = 'canvas_owner'

// All the values a name arrives under, not just the last one. One name can
// really be two cookies (a stale one from another Path, say), and the
// browser sends both in an order RFC 6265 leaves unspecified. A map keyed by
// name would keep whichever came last; the caller needs to try each.
export function cookieValues(header, name) {
  const values = []
  if (typeof header !== 'string') return values
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) values.push(part.slice(eq + 1).trim())
  }
  return values
}

// The origin the browser actually hit: the proxy passes Host through and
// adds x-forwarded-proto; dev hits fastify directly over http. WebAuthn binds
// ceremonies to this value, so a spoofed Host fails verification rather
// than opening anything.
export function requestOrigin(request) {
  const proto = String(request.headers['x-forwarded-proto'] || request.protocol || 'http').split(
    ','
  )[0]
  return `${proto.trim()}://${request.headers.host}`
}

export function requestRpId(request) {
  return String(request.headers.host || 'localhost').split(':')[0]
}

// Cross-origin fetches can't read responses, but state-changing endpoints
// shouldn't even execute cross-site. Browsers send Origin on every POST, so
// a request without one is not a browser on our page; refuse it rather than
// waving it through.
export function sameOrigin(request) {
  const origin = request.headers.origin
  if (!origin) return false
  return origin === requestOrigin(request)
}

export async function sessionFromRequest(request) {
  for (const token of cookieValues(request.headers.cookie, SESSION_COOKIE)) {
    if (await getSession(token)) return token
  }
  return null
}

// Only paths shaped like a local page are honoured; anything else falls
// back, so ?next= can't bounce through to another origin or an API
// endpoint. Backslash counts as a separator because browsers normalize it
// to a slash in navigations, so /\\evil.example would otherwise read as
// protocol-relative.
export function safeNext(next) {
  if (typeof next !== 'string') return '/admin'
  if (/^\/(?![/\\])/.test(next)) return next.startsWith('/api/') ? '/admin' : next
  return '/admin'
}

// --- the gate ------------------------------------------------------------------
// One preHandler for everything private: a browser with the session cookie
// the passkey door set. A state-changing method must also arrive
// same-origin (a cross-site form can make a browser send the cookie; it
// cannot make it send our Origin). Passing leaves the caller on
// request.actor (the session by its hash), which is what every audit line
// downstream writes.
//
// `scope` names the surface the route belongs to ('owner', 'rooms'); it is
// a label for the reader today, and the seam a scoped key would plug into.

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function guard(scope) {
  if (!scope) throw new Error('guard needs a scope')
  return async function gate(request, reply) {
    reply.header('cache-control', 'private, no-store')
    reply.header('x-robots-tag', 'noindex, nofollow')
    const token = await sessionFromRequest(request)
    if (token) {
      request.actor = { kind: 'session', id: await sessionId(token) }
      if (MUTATING.has(request.method) && !sameOrigin(request)) {
        return fail(reply, 403, 'origin')
      }
      return
    }
    if (request.url.startsWith('/api/')) {
      return fail(reply, 401, 'unauthorized')
    }
    const next = encodeURIComponent(request.url)
    return reply.redirect(`/login?next=${next}`)
  }
}

// The desk pages and anything else that is the owner's alone.
export const requireAuth = guard('owner')
