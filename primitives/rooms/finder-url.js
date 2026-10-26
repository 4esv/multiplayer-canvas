// multiplayer-canvas/rooms/url: the room and the search state in the query string, so an address
//   can be shared.
// Inputs: a location.search string.
// Outputs: roomFromUrl, withRoom, searchFromUrl, withSearch -> the value or a new search string.
//   Pure.
//
// primitives/rooms/finder-url.js
// THE FINDER IN THE ADDRESS (BIBLE.md section 8). The bar's state is one
// flag in the query, so a find can be sent to someone and opens for them
// the way it was open here:
//   no `search` param   the bar is shut
//   `?search=`          the bar is open and empty
//   `?search=<query>`   the bar holds that query, and the find runs on load
// Only the one param is touched. Every other param in the address (the
// diagnostic flags, anything a link carried) stays byte for byte, in its
// order, because rewriting a bare `?safe` as `?safe=` is changing a link
// the visitor did not ask to change. The query is encodeURIComponent's, so
// a space is %20 and an ampersand cannot end the value early.
//
// Pure: strings in, strings out. app.js does the reading and the writing
// (history.replaceState, never a new entry per keystroke), and
// test/finder-url.test.js holds the arithmetic. The room's flag (below)
// rides the same way.

const KEY = 'search'

// the key of one `k=v` part, decoded the way URLSearchParams decodes it
const keyOf = (part) => {
  const k = part.split('=')[0].replace(/\+/g, ' ')
  try {
    return decodeURIComponent(k)
  } catch {
    return k
  }
}

/** The query the address carries: null when the bar is shut, '' when it is open and empty. */
export function searchFromUrl(search) {
  const p = new URLSearchParams(search || '')
  return p.has(KEY) ? p.get(KEY) : null
}

/** The address's search string with the bar's state written in (null shuts it). */
export function withSearch(search, q) {
  const parts = String(search || '')
    .replace(/^\?/, '')
    .split('&')
    .filter((p) => p && keyOf(p) !== KEY)
  if (q != null) parts.push(`${KEY}=${encodeURIComponent(q)}`)
  return parts.length ? '?' + parts.join('&') : ''
}

// THE ROOM IN THE ADDRESS (2026-09-26, BIBLE.md section 2). The room a tab
// is in is one flag in the query too, and the address is where it lives:
//   no flag                 the public room
//   `?follow` `?session`    a new room of that kind (the owner's alone)
//   `?follow=<code>`        that room: opened with that code by the owner
//                           when nobody has, joined by anybody when it is
//   `&pin=<digits|off>`     read once with it, then taken off the address
// Deleting the flag is leaving. The same rules as the finder's: only these
// keys are touched and every other param stays byte for byte.

// the kinds, the superset last: an address carrying both is in a session
const ROOM_KEYS = ['follow', 'session']
const PIN_KEY = 'pin'
// The grammar a room code has, in the address and at the server's door:
// lower case letters, digits and dashes, a letter or digit first, up to
// thirty-two. Wide enough for a name (`thursday-jam`), narrow enough to sit
// in an address and a log line as itself, with nothing to escape. Stated
// here, where the browser can load it, and nowhere else: primitives/rooms/sessions.js
// imports it as CODE_RE.
export const ROOM_CODE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

/**
 * The room the address names, or null for the public room (no flag, or a
 * code that is not a code).
 * @param {string} search location.search
 * @returns {{kind:string, code:string, pin:string|null}|null} code 'new'
 *   for a bare flag
 */
export function roomFromUrl(search) {
  const p = new URLSearchParams(search || '')
  const kind = [...ROOM_KEYS].reverse().find((k) => p.has(k))
  if (!kind) return null
  const code = (p.get(kind) || '').trim().toLowerCase() || 'new'
  if (code !== 'new' && !ROOM_CODE_RE.test(code)) return null
  const pin = p.get(PIN_KEY)
  return { kind, code, pin: pin || null }
}

/** The address's search string with the room written in (null takes it out), and never a PIN. */
export function withRoom(search, room) {
  const parts = String(search || '')
    .replace(/^\?/, '')
    .split('&')
    .filter((p) => p && !ROOM_KEYS.includes(keyOf(p)) && keyOf(p) !== PIN_KEY)
  if (room && ROOM_KEYS.includes(room.kind))
    parts.push(room.code && room.code !== 'new' ? `${room.kind}=${room.code}` : room.kind)
  return parts.length ? '?' + parts.join('&') : ''
}
