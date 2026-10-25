// canvas/commands.js
// THE COMMAND LINE IN THE BAR (BIBLE.md section 6 and section 8). A line
// typed into the field that starts with a slash is a command, and this is
// what a command IS: one table of every command the bar knows, the grammar a
// line is read with, which commands a viewer is shown and which they may
// run, and the few addresses the commands go to. app.js binds each name to
// what it does (it owns the camera, the page and the network); everything
// here is pure, strings and tables in and out, and test/commands.test.js
// holds it.
//
// THE GRAMMAR is a shell's, cut down to what a bar needs. Words are split on
// whitespace; "double" or 'single' quotes hold a group of words together
// (and a quoted word is never read as a flag, so a title can start with two
// dashes); `--flag value`, `--flag=value`, and a bare `--flag` that means
// yes. Whether the word after a flag is its value is the command's own
// business, so each command states its flags and which of them take one:
// `/follow --open demo` is the flag and then the id, `/join --pin 1234 abc`
// is the pin and then the code. `--` alone ends the flags. A flag the
// command does not have is an error, said in one line under the field,
// never guessed at. Command names are read in any case.
//
// WHO SEES WHAT. A command is listed (suggested, completed, in /help) or it
// is not, and it is the owner's or it is everybody's:
//   public, listed     everybody sees it and can run it.
//   /login             everybody can run it and nobody is ever shown it:
//                      it works for the owner on a machine that is not
//                      signed in, and to anyone else it is not there.
//   the owner's        shown and run only once the page has confirmed the
//                      owner's session (app.js asks /api/whoami, and only
//                      when the hint cookie says it is worth asking). To
//                      anyone else they are "no such command", the same
//                      words a typo gets, so the bar does not say they exist.
//   a door             /admin is the bar's unlisted door: typed in full by
//                      anybody it goes, and the server's own gate decides
//                      what is behind it.

import { ROOM_CODE_RE } from 'multiplayer-canvas/rooms/url'

/** @typedef {{value?: boolean}} FlagSpec */
/**
 * @typedef {object} Command
 * @property {string} name        what is typed after the slash
 * @property {string} usage       the line /help and the completion show
 * @property {string} about       what it does, in a few words
 * @property {[number, number]} [args]  how many words it takes, least and most
 * @property {Record<string, FlagSpec>} [flags]
 * @property {boolean} [owner]    the owner's alone
 * @property {boolean} [listed]   false: never suggested, completed or helped
 * @property {boolean} [door]     an owner command anybody may still run
 */

const ANY = Infinity
const PIN = { value: true }

/** @type {Command[]} */
// seam: test/commands.test.js, test/crawlability.test.js
export const COMMANDS = [
  { name: 'home', usage: '/home', about: 'back to the hero' },
  { name: 'map', usage: '/map', about: 'the whole world' },
  { name: 'contact', usage: '/contact', about: 'the ways to reach me' },
  { name: 'poof', usage: '/poof', about: 'blow it all up' },
  { name: 'who', usage: '/who', about: "who's here, follow anyone" },
  { name: 'open', usage: '/open <page>', about: 'a page by its name', args: [1, ANY] },
  { name: 'random', usage: '/random', about: 'a page, any page' },
  {
    name: 'listen',
    usage: '/listen [page]',
    about: 'a page read aloud, or the reading stopped',
    args: [0, ANY],
  },
  { name: 'share', usage: '/share', about: "a link to what's on screen" },
  {
    name: 'join',
    usage: '/join <code> [--pin 1234]',
    about: 'a room by its code',
    args: [1, 1],
    flags: { pin: PIN },
  },
  { name: 'leave', usage: '/leave', about: 'out of the room, back to everyone' },
  { name: 'help', usage: '/help', about: 'every command there is' },
  { name: 'keys', usage: '/keys', about: 'every key there is' },
  { name: 'login', usage: '/login', about: 'the door', listed: false },
  {
    name: 'admin',
    usage: '/admin [tool]',
    about: 'the desk, or one tool on it',
    args: [0, 1],
    owner: true,
    door: true,
  },
  {
    name: 'follow',
    usage: '/follow [id] [--pin 1234] [--open] [--end]',
    about: 'lead the room, everyone follows',
    args: [0, 1],
    flags: { pin: PIN, open: {}, end: {} },
    owner: true,
  },
  {
    name: 'session',
    usage: '/session [id] [--pin 1234] [--open] [--end]',
    about: 'a room where everyone plays',
    args: [0, 1],
    flags: { pin: PIN, open: {}, end: {} },
    owner: true,
  },
  { name: 'rooms', usage: '/rooms', about: 'every live room, pick one to join', owner: true },
  { name: 'logout', usage: '/logout', about: 'shut the door', owner: true },
]

// ---------------------------------------------------------------- the keys

/**
 * THE KEYS the page answers anywhere, in one table: what /keys lists and what
 * `?` opens, the shortcut sheet every web app has. `handles` is every
 * `event.key` the page's global key handler (app.js) reads for the row, so
 * test/keys.test.js can hold the sheet to the handler both ways: a key the
 * page answers that no row says is a key nobody finds, and a row for a key the
 * page does not answer is a promise it does not keep. Tab and Enter are the
 * browser's own and stand here because a legend that leaves them out reads as
 * if they were not there.
 * @type {{keys: string, does: string, handles: string[]}[]}
 */
export const KEYS = [
  { keys: '/', does: 'search or run a command', handles: ['/'] },
  { keys: 'Ctrl/Cmd K', does: 'the bar, from anywhere', handles: ['k', 'K'] },
  { keys: '?', does: 'this list', handles: ['?'] },
  { keys: 'Esc', does: 'one step back', handles: ['Escape'] },
  {
    keys: 'arrows',
    does: 'move, or walk a pile',
    handles: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  },
  { keys: '+ -', does: 'zoom', handles: ['+', '=', '-', '_'] },
  { keys: 'Tab', does: 'next thing to press', handles: [] },
  { keys: 'Enter', does: 'press it', handles: [] },
]

// ---------------------------------------------------------------- who sees what

const isListed = (c, owner) => c.listed !== false && (!c.owner || owner === true)
const isRunnable = (c, owner) => !c.owner || owner === true || c.door === true

/**
 * The commands this viewer is shown and the ones they may run. `owner` is
 * true only once the page has confirmed the session; anything else is a
 * guest.
 */
export function commandsFor(owner, commands = COMMANDS) {
  return {
    listed: commands.filter((c) => isListed(c, owner)),
    runnable: commands.filter((c) => isRunnable(c, owner)),
  }
}

// ---------------------------------------------------------------- the grammar

// the words of a line, each knowing whether it was quoted
function words(line) {
  const out = []
  let cur = null
  let quoted = false
  let quote = null
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      quoted = true
      cur = cur ?? ''
      continue
    }
    if (/\s/.test(ch)) {
      if (cur !== null) out.push({ t: cur, quoted })
      cur = null
      quoted = false
      continue
    }
    cur = (cur ?? '') + ch
  }
  if (quote) return null
  if (cur !== null) out.push({ t: cur, quoted })
  return out
}

// the first <thing> a usage line names, for "wants <code>"
const wanted = (c) => (c.usage.match(/<[^>]+>/) || ['a word'])[0]

/**
 * A line read as a command: null when it is not one (no leading slash),
 * else `{ name, args, flags, error }`, where `error` is the one line the bar
 * says instead of running anything, and `cmd` is the command when there is
 * no error. `commands` is what this viewer may run.
 */
export function parseCommand(str, commands = COMMANDS) {
  if (typeof str !== 'string' || !str.startsWith('/')) return null
  const ws = words(str.slice(1))
  const name = ws && ws[0] ? ws[0].t.toLowerCase() : ''
  const out = { name, args: [], flags: {}, error: null }
  if (!ws) return { ...out, error: 'a quote is left open' }
  const cmd = commands.find((c) => c.name === name)
  if (!cmd) return { ...out, error: 'no such command' }
  const spec = cmd.flags || {}
  let flagsDone = false
  for (let i = 1; i < ws.length; i++) {
    const w = ws[i]
    if (flagsDone || w.quoted || !w.t.startsWith('--')) {
      out.args.push(w.t)
      continue
    }
    if (w.t === '--') {
      flagsDone = true
      continue
    }
    const eq = w.t.indexOf('=')
    const key = (eq > -1 ? w.t.slice(2, eq) : w.t.slice(2)).toLowerCase()
    const f = Object.hasOwn(spec, key) ? spec[key] : null
    if (!f) return { ...out, error: `/${name} has no --${key}` }
    if (eq > -1) {
      if (!f.value) return { ...out, error: `--${key} takes no value` }
      out.flags[key] = w.t.slice(eq + 1)
    } else if (f.value) {
      const next = ws[i + 1]
      if (!next || (!next.quoted && next.t.startsWith('--')))
        return { ...out, error: `--${key} wants a value` }
      out.flags[key] = next.t
      i++
    } else out.flags[key] = true
  }
  const [least, most] = cmd.args || [0, 0]
  if (out.args.length < least) return { ...out, error: `/${name} wants ${wanted(cmd)}` }
  if (out.args.length > most) return { ...out, error: `too many words for /${name}` }
  return { ...out, cmd }
}

// anchored subsequence: the letters in order, the first where a word starts
// (the same net the finder casts, app.js fuzzy)
function anchored(hay, q) {
  for (let w = 0; w < hay.length; w++) {
    if (w > 0 && hay[w - 1] !== ' ') continue
    if (hay[w] !== q[0]) continue
    let i = 1
    for (let k = w + 1; k < hay.length && i < q.length; k++) if (hay[k] === q[i]) i++
    if (i === q.length) return true
  }
  return false
}

/**
 * What the roster shows for a line: `names` while the name is being typed
 * (the names that start so first, then the ones that hold it, then the
 * fuzzy ones, in table order within each), `usage` once the name is a whole
 * command (the command's own usage line), null for a line that is not a
 * command. `visible` is what this viewer is shown, so an unlisted command is
 * never completed, even typed in full.
 */
export function complete(str, visible) {
  if (typeof str !== 'string' || !str.startsWith('/')) return null
  const m = str.slice(1).match(/^(\S*)(\s?)/)
  const q = m[1].toLowerCase()
  const whole = visible.find((c) => c.name === q)
  if (m[2]) return { mode: 'usage', hits: whole ? [whole] : [] }
  if (whole) return { mode: 'usage', hits: [whole] }
  const rank = (c) =>
    c.name.startsWith(q) ? 0 : c.name.includes(q) ? 1 : q && anchored(c.name, q) ? 2 : -1
  const hits = visible
    .map((c, i) => ({ c, i, r: rank(c) }))
    .filter((h) => h.r > -1)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((h) => h.c)
  return { mode: 'names', hits }
}

// ---------------------------------------------------------------- /open

const plain = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .trim()

/**
 * The page a few words name: the slug or the title, whole, then starting
 * so, then holding it, then the fuzzy net. Ties go to the shorter slug, the
 * more general page. `pages` is `[{ slug, title }]`; null when none answers.
 */
export function matchPage(q, pages) {
  q = plain(q)
  if (!q) return null
  let best = null
  for (const p of pages) {
    const names = [plain(p.slug), plain(p.title)]
    const s = Math.min(
      ...names.map((n) =>
        n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : anchored(n, q) ? 3 : 9
      )
    )
    if (s === 9) continue
    if (!best || s < best.s || (s === best.s && p.slug.length < best.slug.length))
      best = { s, slug: p.slug }
  }
  return best ? best.slug : null
}

/**
 * A page for /random: any of them but the one already open. `rand` is a
 * number in [0, 1), Math.random's, handed in so the pick can be held.
 */
export function randomPage(pages, current, rand) {
  const pool = pages.filter((p) => p.slug !== current)
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rand * pool.length))].slug : null
}

// ---------------------------------------------------------------- /share

// what a link carries of the tab: the room it is in and the find it holds.
// Never the pin (a link handed on is not the key), never the tab's own
// diagnostics, and an empty find is no find.
const SHARED = ['follow', 'session', 'search']

/** The link /share copies: this path, and of the query only what says where the tab is. */
export function shareUrl(origin, pathname, search) {
  const q = new URLSearchParams(search || '')
  const parts = []
  for (const k of SHARED) {
    if (!q.has(k)) continue
    const v = q.get(k)
    if (k === 'search' && !v) continue
    parts.push(v ? `${k}=${encodeURIComponent(v)}` : k)
  }
  return `${origin}${pathname}${parts.length ? `?${parts.join('&')}` : ''}`
}

// ---------------------------------------------------------------- /admin

// The desk's tools as the bar knows them. The client cannot import the
// server's registry (src/lib/desk.js reads the logo off the disk), so this is
// a copy, and test/commands.test.js fails the moment it and DESK_TOOLS
// disagree.
// seam: test/commands.test.js
export const DESK = [
  { id: 'admin', label: 'admin', href: '/admin' },
  { id: 'rooms', label: 'sessions', href: '/admin/sessions' },
  { id: 'kit', label: 'sheet', href: '/admin/kit' },
]

/** The desk tool a word names, by its id, its label or its title; null when none does. */
export function deskTool(q, tools = DESK) {
  const w = String(q || '').toLowerCase()
  return tools.find((t) => t.id === w || t.label === w || t.title === w) || null
}

// ---------------------------------------------------------------- the rooms

/**
 * A room's code as the rooms layer reads it off the address: the rooms
 * layer's own grammar (finder-url.js), so a name the address accepts is a
 * name a command accepts, and no second copy can drift from it.
 */
export const ROOM_CODE = ROOM_CODE_RE
/** A room's PIN: four digits, the only PIN the room's door takes (lib/sessions.js). */
export const ROOM_PIN = /^[0-9]{4}$/

// every flag a room command writes, plus the finder's own (a command
// navigates, and the bar is clear when it lands)
const ROOM_KEYS = new Set(['follow', 'session', 'pin', 'search'])
const keyOf = (part) => {
  const k = part.split('=')[0].replace(/\+/g, ' ')
  try {
    return decodeURIComponent(k)
  } catch {
    return k
  }
}
// every other param, byte for byte and in its order (canvas/finder-url.js)
const others = (search) =>
  String(search || '')
    .replace(/^\?/, '')
    .split('&')
    .filter((p) => p && !ROOM_KEYS.has(keyOf(p)))

/**
 * The address's search with one room written in: `kind=id` (a bare `kind`
 * when there is no id, which asks for a fresh room) and `pin=` when a pin is
 * given (`off` for an open room). Every other param stays as it was.
 */
export function roomSearch(search, kind, { id = '', pin = null } = {}) {
  const parts = others(search)
  parts.push(id ? `${kind}=${encodeURIComponent(id)}` : kind)
  if (pin != null && pin !== '') parts.push(`pin=${encodeURIComponent(pin)}`)
  return `?${parts.join('&')}`
}

/** The address's search with every room flag taken off. */
export function leaveSearch(search) {
  const parts = others(search)
  return parts.length ? `?${parts.join('&')}` : ''
}

// ---------------------------------------------------------------- the owner

// THE HINT (src/routes/auth.js). The session cookie is HttpOnly, so a page
// cannot see that it is signed in. The server sets this second cookie beside
// it, readable and carrying no authority at all, so that the page knows it is
// worth ONE question to /api/whoami. A guest has no hint and never asks.
// test/commands.test.js holds the name to the server's.
// seam: test/commands.test.js
export const OWNER_HINT = 'canvas_owner'

/** Whether the page's cookies carry the hint. */
export function hasOwnerHint(cookie) {
  return String(cookie || '')
    .split(';')
    .some((p) => p.trim() === `${OWNER_HINT}=1`)
}

/**
 * What /api/whoami's answer means: true for the owner's own session, false
 * for a definite no (refused, or a caller that is not a session), null when
 * the answer says nothing (a server error, a throttle), which keeps the hint.
 */
export function ownerFrom(status, body) {
  if (status === 401 || status === 403) return false
  if (status !== 200) return null
  return body?.actor?.kind === 'session'
}

/**
 * The cookie strings that clear the hint from the page: the host-only one
 * the server sets (src/routes/auth.js). A list, so a deployment that widens
 * the cookie's Domain can add the second shape here.
 */
export function hintClears() {
  return [`${OWNER_HINT}=; Path=/; Max-Age=0; SameSite=Lax`]
}
