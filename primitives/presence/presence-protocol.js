// multiplayer-canvas/presence/protocol: what counts as a valid inbound frame on the public socket.
// Inputs: a raw message string.
// Outputs: parseFrame(raw) -> { kind, ... } or null, plus one parser per frame kind and rosterOf.
//   Pure; the server and the tests read the same rules.
//
// Pure, testable core of the live-cursor wire protocol. routes/presence.js owns
// the sockets and the fan-out; this owns the one security-relevant decision
// (what counts as a valid inbound frame) and the participant/spectator boundary.
// The socket is public and unauthenticated, so the server and its test read the
// same rules from here.
import { DISH } from '../slime/slime.js'
import { PUSH_IN } from '../sky/outlook.js'

// The first PARTICIPANT_CAP connections broadcast their cursor; this bounds the
// O(N^2) fan-out that dominates cost. Connections past it are spectators: they
// see all participants but their own moves are never relayed, so they add no
// fan-out among participants. Role is fixed at connect (no promotion when a
// participant slot frees).
// seam: test/presence.test.js
export const PARTICIPANT_CAP = 100

/**
 * @param {number} participantCount - current broadcasting participants
 * @returns {boolean} true if the next connection should spectate
 */
export function spectatesAt(participantCount) {
  return participantCount >= PARTICIPANT_CAP
}

// A hover key names a thing on the canvas that everyone can see: a tile by
// its layout.js id, or one row inside a tile (`work#3`). The grammar is deliberately narrower than "a
// string": lowercase, digits and dashes, one optional two-digit row,
// bounded length. That bound is the
// point. The key is stored per peer for the life of the socket and echoed to
// the room, so an unbounded one would be unbounded memory and an unbounded
// echo, and a key with markup in it would be a key that reached the DOM.
// seam: test/presence.test.js
export const HOVER_KEY_MAX = 48
const HOVER_KEY = /^[a-z0-9][a-z0-9-]{0,46}(#[0-9]{1,2})?$/

/**
 * @param {unknown} k
 * @returns {boolean} true if k is a hover key this room will carry
 */
// seam: test/presence.test.js, test/shared-hover.test.js
export function isHoverKey(k) {
  return typeof k === 'string' && k.length <= HOVER_KEY_MAX && HOVER_KEY.test(k)
}

// THE ANCHOR: where a cursor is on a PAGE. A page is a column
// of blocks (a heading, a paragraph, a figure) and a block is the same block
// on a phone and on a billboard, so a position on a page travels as the
// page's slug, the block's index and a fraction of that block's box. The
// grammar is the hover key's with the index made mandatory and given room
// for a long document: `nao#14`. Nothing about the visitor rides here, and
// nothing that names a visitor could: it is a slug and a number.
// seam: test/presence.test.js
export const AT_MAX = 52
const AT_KEY = /^[a-z0-9][a-z0-9-]{0,47}#[0-9]{1,3}$/

/**
 * @param {unknown} v
 * @returns {boolean} true if v is an anchor this room will carry
 */
// seam: test/presence.test.js
export function isAt(v) {
  return typeof v === 'string' && v.length <= AT_MAX && AT_KEY.test(v)
}

/**
 * Parse one inbound frame from a client.
 * @param {string} raw - the raw text frame
 * @returns {{fx:number, fy:number, k:string|null}|null} the move, or null to drop it
 *
 * A frame is a move only if it is JSON `{type:'move', fx, fy}` with both
 * coordinates finite numbers in [0,1) (normalized world fractions). Anything
 * else (other types, wrong shapes, NaN, out-of-range, non-JSON) is dropped so
 * a scripted client can never place a peer off its own torus or inject state.
 *
 * `k` rides along optionally: what this peer's cursor is over right now, or
 * null for nothing. It is on the MOVE frame rather than a frame of its own,
 * and that is the design, not a shortcut. A move passes a floor (RATE_MS,
 * primitives/presence/wire.js) and a pointer that is moving is always at it, so a
 * separate hover frame would be a second stream racing the first, and the
 * highlight it carried could land before or after the cursor it belongs to.
 * Hover only ever changes BECAUSE the pointer moved, so the move frame is
 * where the news already is.
 *
 * A malformed key is dropped to null rather than dropping the whole frame:
 * the cursor is the load-bearing half and a peer should not vanish because
 * its highlight was junk.
 *
 * A move carries three facts about the sender and NO request:
 * where it is, what it is over, and whether its button is down. That is not enforced by convention somewhere upstream,
 * it is enforced here, by there being no other field to read
 * (test/presence.test.js).
 */
// seam: test/presence.test.js
export function parseMove(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'move') return null
  return moveOf(m)
}

function parseJson(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
function moveOf(m) {
  const { fx, fy } = m
  if (typeof fx !== 'number' || typeof fy !== 'number') return null
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null
  // `d` is whether that peer's button is down right now, which picks which of
  // the two hands the room draws for them (primitives/presence/presence.js). It rides the
  // move frame for the same reason the hover key does: it is a fact about
  // where a pointer IS, not a request to change anything, and the inbound
  // rate gate is shared, so a frame of its own would queue behind a cursor
  // that is always moving. Coerced to a boolean rather than validated: there
  // is no malformed value, only true and everything else.
  // `at` says the peer is on a page, and WHICH block of it:
  // with it set, fx and fy are fractions of that block's box instead of the
  // world's. Malformed drops to null like a bad key: a peer reading a page
  // does not vanish because its anchor was junk, it shows on the canvas
  // where its last world position was.
  // `f` (the conga, 2026-09-25) is who the sender follows: a peer id, or 0
  // for nobody. It is the one field on the move that names somebody else,
  // and it names them without reaching them: nothing on the followed tab
  // changes because of it, and the view a follower keeps is still its own
  // (primitives/rooms/follow.js). It rides the move for the reason `k` and `d` do.
  // Anything that is not a peer id is nobody, rather than a dropped frame.
  return {
    fx,
    fy,
    k: isHoverKey(m.k) ? m.k : null,
    d: m.d === true,
    at: isAt(m.at) ? m.at : null,
    f: isPeerId(m.f) ? m.f : 0,
  }
}

// A peer id as the room hands them out: a positive whole number, below the
// 31-bit line so it is the same number in every JSON reader on the way.
// seam: test/presence.test.js
export const isPeerId = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2 ** 31

// The squish (2026-09-11): Maurice, the ladybug on the ground, squished for
// everyone by whoever clicks him. The frame carries NOTHING: no id, no time,
// no who; the room decides how long (presence-room.js SQUISH_MS) and tells
// every tab when he is back.
// The front (2026-09-11): a pile turned to one of its members, for
// everyone. The frame names the pile and the member; the room keeps one
// index per pile and tells every tab. The stack id is a short slug, the
// index a small whole number, and anything else is dropped whole.
// A pile's index bound. A replay shares its step through this frame, so the
// bound is generous: 256 covers a long replay and is still a bound: the point
// of one is that an index off the wire can never be used to address something
// unbounded, not that the number is small.
// seam: test/presence.test.js
export const FRONT_MAX = 256
const STACK_ID = /^[a-z][a-z0-9-]{0,31}$/
/**
 * Parse one inbound front.
 * @param {string} raw
 * @returns {{stack:string, i:number}|null}
 */
// seam: test/presence.test.js
export function parseFront(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'front') return null
  return frontOf(m)
}
function frontOf(m) {
  const { stack, i } = m
  if (typeof stack !== 'string' || !STACK_ID.test(stack)) return null
  if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= FRONT_MAX) return null
  return { stack, i }
}
// The play (2026-10-03): a game's replay running, the room's like its front.
// `n` is the game's last ply, so the room knows where the tick stops.
/**
 * Parse one inbound play.
 * @param {string} raw
 * @returns {{stack:string, on:boolean, n:number}|null}
 */
// seam: test/presence.test.js
export function parsePlay(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'play') return null
  return playOf(m)
}
function playOf(m) {
  const { stack, on, n } = m
  if (typeof stack !== 'string' || !STACK_ID.test(stack)) return null
  if (typeof on !== 'boolean') return null
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n >= FRONT_MAX) return null
  return { stack, on, n }
}
/**
 * Parse one inbound squish.
 * @param {string} raw
 * @returns {{}|null} an empty frame, or null to drop it
 */
// seam: test/presence.test.js
export function parseSquish(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'squish') return null
  return {}
}

// The feed (2026-09-17): food dropped in the slime mould's dish, for
// everyone, since the dish is one dish. The frame names a cell, two whole
// numbers inside the dish's square (primitives/slime/slime.js DISH); whether the cell
// is inside the circle is the arithmetic's call on the other side, and a
// frame off the square is dropped whole here.
/**
 * Parse one inbound feed.
 * @param {string} raw
 * @returns {{x:number, y:number}|null}
 */
// seam: test/presence.test.js
export function parseFeed(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'feed') return null
  return feedOf(m)
}
const isCell = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < DISH
function feedOf(m) {
  const { x, y } = m
  if (!isCell(x) || !isCell(y)) return null
  return { x, y }
}

// The watch: whether this tab can SEE the slime
// mould's dish right now (document visible and the dish on camera). It is a
// fact about the sender, like `k` and `d` on the move, and not a mutation:
// nothing on anybody else's canvas changes because of it. It is a frame of
// its own and not a field on the move because it changes when the TAB
// changes (hidden, shown, panned) and a hidden tab sends no moves at all.
// One boolean, coerced: there is no malformed watch, only true and
// everything else.
/**
 * Parse one inbound watch.
 * @param {string} raw
 * @returns {{on:boolean}|null}
 */
// seam: test/presence.test.js
export function parseWatch(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'watch') return null
  return watchOf(m)
}
// The same frame says it for the weather window,
// with of:'sky'. A watch without it is the dish's, as it always was, so a
// tab running yesterday's script still watches the dish and nothing else.
const watchOf = (m) => (m.of === 'sky' ? { on: m.on === true, of: 'sky' } : { on: m.on === true })

// The push: a hand on the weather window, whole
// cells either way, each within PUSH_IN (primitives/sky/outlook.js). A push of
// nothing is no push. Like the feed it is a shared mutation, of a thing on
// the ground, so the route takes it from participants only.
/**
 * Parse one inbound push.
 * @param {string} raw
 * @returns {{dx:number, dy:number}|null}
 */
// seam: test/sky.test.js
export function parsePush(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'push') return null
  return pushOf(m)
}
const isStep = (v) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= PUSH_IN
function pushOf(m) {
  const { dx, dy } = m
  if (!isStep(dx) || !isStep(dy) || (!dx && !dy)) return null
  return { dx, dy }
}

// THE ACTS (sessions, 2026-09-25). A session is a room of its own that the
// owner opened (primitives/rooms/sessions.js), and in it a tab may say one more kind of
// thing: what it just DID, on a named channel, so the other tabs in the room
// can do it too (a note played, a knob turned). A
// selection on a page is not an act: it is everyone's, in every room, as the
// `sel` frame below.
//
// A FOLLOW IS A SESSION TOO (2026-09-25), in one direction: in the public
// room an act goes to the tabs following its sender and to nobody else
// (presence-room.js act). The follower chose to go where the other goes,
// so it hears what they play; the one followed never chose to hear a
// stranger, and a follower who plays anything has let go anyway (follow.js,
// their own input). So every room parses the word, and the ROOM decides
// who hears it.
//
// The server does not know what a note is. It checks the SHAPE, which is
// the whole of what it can promise the tabs it relays to: a channel from a
// closed list, and a flat object of at most eight short lowercase keys whose
// values are numbers, booleans, null, a short slug-like string, or a short
// list of numbers. No nesting, no markup, no unbounded anything. What the
// values mean is checked by the page script that receives them.
//
// THE VIEW (2026-09-26) is the fifth channel: what the sender is looking at
// on a page (a video's playback, the instrument up, a photograph, the
// sentence read aloud) or on the ground (the fan spread),
// its kind in a `what` key. It is an act like the others, so the room's
// audience rules hold it unchanged: a follow hears the one followed, a
// session hears everyone (primitives/rooms/view-sync.js reads the payload).
// seam: test/sessions.test.js
export const ACT_CHANNELS = Object.freeze(['note', 'off', 'patch', 'egg', 'view'])
const ACT_KEY = /^[a-z]{1,8}$/
const ACT_STR = /^[a-z0-9][a-z0-9#-]{0,63}$/
const ACT_KEYS = 8
const ACT_LIST = 6
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
function isActValue(v) {
  if (v === null || typeof v === 'boolean' || isNum(v)) return true
  if (typeof v === 'string') return ACT_STR.test(v)
  return Array.isArray(v) && v.length <= ACT_LIST && v.every(isNum)
}

/**
 * The act payload grammar.
 * @param {unknown} d
 * @returns {boolean} true if d is a payload the room will relay
 */
// seam: test/sessions.test.js
export function isActData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false
  if (Object.getPrototypeOf(d) !== Object.prototype) return false
  const keys = Object.keys(d)
  if (keys.length > ACT_KEYS) return false
  return keys.every((k) => ACT_KEY.test(k) && isActValue(d[k]))
}

/**
 * One act off a parsed frame, or null to drop it whole.
 * @param {{ch?:unknown, d?:unknown}} m
 * @returns {{ch:string, d:object}|null}
 */
// seam: test/sessions.test.js
export function actOf(m) {
  if (!m || !ACT_CHANNELS.includes(m.ch) || !isActData(m.d)) return null
  return { ch: m.ch, d: m.d }
}

// THE SELECTION (shared highlighting): the words a reader has selected on
// the page they are reading, so the other readers of that page can draw them
// in that reader's hue. Like `k` and `d` it is a fact about the sender and
// not a mutation: nothing on anybody's page changes but a highlight, and it
// is theirs to draw or not (a page whose words differ draws nothing). The
// frame is primitives/presence/anchor.js selOf and nothing more: the first block, the
// character it starts at, the last block, the character it ends before, and
// up to SEL_QUOTE characters of the words at each end for the reader's
// check. `at: null` is the selection collapsing. A frame with anything out
// of shape is dropped whole: half a selection is a highlight on the wrong
// words. The quote is only ever COMPARED on the other side, never drawn or
// inserted, and it is bounded here so it cannot grow the frame.
// seam: test/shared-highlight.test.js
export const SEL_QUOTE = 8
// seam: test/shared-highlight.test.js
export const SEL_OFF_MAX = 1 << 20
const isOff = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < SEL_OFF_MAX
const isQuote = (v) => typeof v === 'string' && v.length >= 1 && v.length <= SEL_QUOTE
function selOf(m) {
  if (m.at === null || m.at === undefined) return { sel: null }
  const { at, a, j, b, q, z } = m
  if (!isAt(at)) return null
  const i = Number(at.slice(at.indexOf('#') + 1))
  if (!isOff(a) || !isOff(b) || !Number.isInteger(j) || j < i || j > 999) return null
  if (j === i && a >= b) return null
  if (!isQuote(q) || !isQuote(z)) return null
  return { sel: { at, a, j, b, q, z } }
}
/**
 * Parse one inbound selection.
 * @param {string} raw
 * @returns {{sel:{at:string, a:number, j:number, b:number, q:string, z:string}|null}|null}
 */
// seam: test/shared-highlight.test.js
export function parseSel(raw) {
  const m = parseJson(raw)
  if (!m || m.type !== 'sel') return null
  return selOf(m)
}

/**
 * Parse any inbound frame. THIS IS THE WHOLE INBOUND VOCABULARY: a move
 * (where the client is and what it is looking at), a squish (carrying
 * nothing), a front (a pile and a member), a feed (a cell of the dish), a
 * push (a hand on the weather window) or a watch (whether the sender can
 * see the dish, or with of:'sky' the window) or a selection (the words the
 * sender has selected on the page it reads). Five shared mutations, all of
 * a thing on the ground and never of a visitor's own, and three facts a
 * client states about itself. Anything else, including a move carrying a
 * theme or a field of its own, parses to its plain
 * shape or to null. Flipping the theme is the visitor's own, and it stays
 * that way because no frame can ask for it.
 *
 * And the act (above), whose audience is the room's to decide: the rest of
 * a session, or in the public room the sender's followers.
 * @param {string} raw
 * @returns {{kind:'move', fx:number, fy:number, k:string|null, d:boolean, at:string|null, f:number}|{kind:'squish'}|{kind:'front', stack:string, i:number}|{kind:'play', stack:string, on:boolean, n:number}|{kind:'feed', x:number, y:number}|{kind:'push', dx:number, dy:number}|{kind:'watch', on:boolean, of?:'sky'}|{kind:'act', ch:string, d:object}|{kind:'sel', sel:object|null}|null}
 */
export function parseFrame(raw) {
  const m = parseJson(raw)
  if (!m) return null
  if (m.type === 'move') {
    const mv = moveOf(m)
    return mv ? { kind: 'move', ...mv } : null
  }
  if (m.type === 'squish') return { kind: 'squish' }
  if (m.type === 'sel') {
    const t = selOf(m)
    return t ? { kind: 'sel', ...t } : null
  }
  if (m.type === 'watch') return { kind: 'watch', ...watchOf(m) }
  if (m.type === 'push') {
    const p = pushOf(m)
    return p ? { kind: 'push', ...p } : null
  }
  if (m.type === 'front') {
    const f = frontOf(m)
    return f ? { kind: 'front', ...f } : null
  }
  if (m.type === 'play') {
    const p = playOf(m)
    return p ? { kind: 'play', ...p } : null
  }
  if (m.type === 'feed') {
    const f = feedOf(m)
    return f ? { kind: 'feed', ...f } : null
  }
  if (m.type === 'act') {
    const a = actOf(m)
    return a ? { kind: 'act', ...a } : null
  }
  return null
}

/**
 * Build the welcome roster from the room's peer records.
 * @param {Iterable<{id:number, fx:number, fy:number, k:string|null, spectator:boolean}>} peerValues
 * @returns {{id:number, fx:number, fy:number, k:string|null}[]}
 *
 * Participants only: spectators are never announced, so they never appear.
 * Positions ship as stored, including the fx/fy -1 never-moved sentinel, so a
 * joiner can count everyone present without painting phantoms at the world
 * origin (the client skips rendering until fx >= 0, see presence.js hasPos).
 *
 * The hover key ships too, and it has to: highlights already on the canvas
 * when you arrive are part of what the room looks like. Without it a peer
 * resting on a tile would stay invisible to you until they moved again,
 * which for a parked cursor could be never.
 */
export function rosterOf(peerValues) {
  const roster = []
  for (const p of peerValues) {
    if (p.spectator) continue
    // the button state ships too, for the same reason the hover key does: a
    // hand already held down when you arrive is part of what the room looks
    // like, and without it that peer would point until they moved again
    // and the anchor: a joiner has to know who is reading
    // which page, or the who's-here list would say everyone is on the canvas
    // and who follows whom, with the sequence the room stamped when they
    // started (0 for nobody): a joiner has to see the conga already
    // dancing, in the order it formed. `h` marks a session's host, and is
    // absent everywhere else, the public room included.
    const e = {
      id: p.id,
      fx: p.fx,
      fy: p.fy,
      k: p.k ?? null,
      d: p.d === true,
      at: p.at ?? null,
      f: p.f ?? 0,
      fs: p.fs ?? 0,
    }
    if (p.host) e.h = 1
    roster.push(e)
  }
  return roster
}
