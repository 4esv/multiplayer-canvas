// multiplayer-canvas/presence: live cursors in the browser: one same-origin WebSocket to
//   /ws/cursors, other tabs drawn on a wrapped world.
// Inputs: initPresence({ scene, wrapPos }) plus post(fx, fy) with world fractions and frame(view,
//   now) each animation frame.
// Outputs: a handle (post, frame, onCount, onPeers, onData, follow, select, act, now). Without
//   WebSocket it returns a no-op handle of the same shape.
//
// Live cursor presence. Opens a same-origin WebSocket, broadcasts this tab's
// pointer as a normalized world fraction, and paints every other tab's cursor
// onto the torus. No names, no storage: a peer exists only while its socket is
// open. Coordinates are fractions of the world (not pixels) so the seams line
// up across viewports, and remote cursors ride the same wrapPos the tiles do,
// so a cursor that leaves one edge reappears at the opposite one for free.
//
// The socket carries three more things.
//
// The HOVER KEY rides the move frame: what this tab's cursor is over, named
// by the thing rather than by where it is, so every other tab can light the
// same tile at the same moment. It is on the move frame and not a frame of
// its own because the inbound rate gate (RATE_MS) is shared by everything a
// client sends, and a hover frame would spend its life queued behind a cursor
// that is always moving (primitives/presence/presence-protocol.js says the rest). A cursor
// and what it is touching are one fact anyway.
//
// The SERVER'S CLOCK arrives once, in the welcome, and now() reads it: the
// dust's tick, the instant Maurice is back and the weather window's step
// are functions of the time, so tabs that agree about it draw them the same
// and nothing more is sent. The statement is not one of them: the hero is a
// pile, turned on the room's front like any other.
//
// The DATA NUDGE: when the server's own refresh lands changed widget data it
// sends {type:'stale', keys} to every open tab at once, and app.js re-reads
// /api/canvas. The tab never asks for this and never answers it, so the rate
// gate is untouched in both directions.
//
// And the ONE SHARED HAND: Maurice, the ladybug. squish() sends
// {type:'squish'} and the room tells every tab, this one included,
// {type:'squish', until}; onSquish hears it (and the welcome, which carries
// when he is back). The client squishes optimistically and keeps the room's
// `until`, so every tab revives him at the same instant. The other thing a
// tab changes for the room is a pile's front (front(): a stack's card, the
// hero's phrase), which the room keeps and hands to every
// tab that arrives (BIBLE.md section 2). There is one ground, so there is
// no theme to flip.
//
// A SESSION (2026-09-25) is the same socket into a room of its own, opened by
// the owner and joined by code (goRoom). It carries everything above and one
// thing more: ACTS, the things a session plays together (a note, a knob, an
// egg, a marked line), relayed to the rest of the session as they happen.
// The public room has no frame for an act. And in every room the move frame
// now says whom this tab follows, so a follower is drawn in line behind the
// one it follows (conga.js) rather than wherever its idle pointer was left.

// The pile index bound, mirroring primitives/presence/presence-protocol.js FRONT_MAX. It is
// stated here rather than imported because that module is the SERVER's (the
// browser never loads it), and a client that sent an index the room would
// drop is a client that thinks it shared something it did not.
// test/presence.test.js holds the two numbers together.
export const FRONT_CAP = 256

import { placeOf } from './anchor.js'
import { GAP_MS, linesOf, record, sampleAt } from './conga.js'
import { RATE_MS, SERVER_PUSH } from './wire.js'

// Geometry only, no colour: fill/stroke/position live in canvas-home.css so the
// cursor stays on the token palette. Tip sits at the top-left of the viewBox, so
// translate(-tip) lands the point on the peer's actual world coordinate.
//
// The arrow is drawn THREE TIMES, same grid: the mark, the mark grown one
// cell, and grown twice. One outline can never be right on every ground it
// crosses: the canvas is grey ground, a card on it is white, and a tile
// quoting a dark host carries that host's near-black. So the two grown copies
// take OPPOSITE inks, and whichever ground the cursor is over, one of them
// contrasts with it (test/cursor-ring.test.js measures every one of them).
// THE ARROW IS CELLS (2026-09-15, BIBLE.md section 10). It was a vector kite
// with a 4px and a 2px stroke around it, which is the one hand this canvas
// does not draw in: a pointer sitting on a 4px-cell world was the softest
// thing on the screen. So it became a sprite.
//
// THE POINTER IS A HAND, AND EVERY PIXEL OF IT IS DRAWN (2026-09-16).
//
// Four hands, three layers each, nothing derived. This replaced a sprite that
// was ONE bitmap grown outward twice: the colour was the drawing and the two
// rings were arithmetic. That arrangement is what every arrow draft fought,
// because it decides the outline for you and the outline is where a pointer
// reads. Here the colour, the black and the border are three things a hand
// placed, and grow() touches none of them.
//
// Two populations, and the split is the design (BIBLE.md section 2):
//   point, click   drawn for a PEER as DOM, and the visitor's own too. The
//                  click is the only thing that travels, as one boolean on
//                  the move frame.
//   grab           the visitor's own alone. It never travels: a drag is a
//                  continuous gesture with an audience of one, and nobody
//                  needs to watch somebody else haul the ground.
//
// There was an OPEN hand on the ground for a few hours and it went: "you may
// grab this" is what the closed hand says at the moment it matters, and an
// open one resting on the ground said it early and everywhere.
//
// Each hand carries its own HOT SPOT and they differ on purpose. A hot spot
// is the point the cursor aims at, so it stays put on the target while the
// drawing moves around it: a pointing hand bending into a click keeps the
// fingertip on the thing and recoils the body, which is what every system
// cursor does.
//
// Layers: '#' the peer's colour, '+' the black, 'o' the border, '.' nothing.
export const HANDS = {
  point: {
    hot: [6, 3],
    rows: [
      '..................',
      '......oo..........',
      '.....o++o.........',
      '....o+##+o........',
      '....o+##+o........',
      '....o+##+oooo.....',
      '....o+##+++++oo...',
      '..ooo+##+##+#++o..',
      '.o++o+##+##+#+#+o.',
      'o+##++#########+o.',
      'o+###+#########+o.',
      '.o+##+##+#+#+##+o.',
      '..o+####+#+#+##+o.',
      '..o+####+#+#+#+o..',
      '...o+###+#+#+#+o..',
      '....o+#######+o...',
      '.....o+######+o...',
      '......o++++++o....',
      '.......oooooo.....',
    ],
  },
  click: {
    hot: [3, 4],
    rows: [
      '..................',
      '..................',
      '....ooo...........',
      '...o+++o..........',
      '..o+##++o.........',
      '..o++###+oooo.....',
      '...oo+##+++++oo...',
      '..ooo+##+##+#++o..',
      '.o++o+##+##+#+#+o.',
      'o+##++#########+o.',
      'o+###+#########+o.',
      '.o+##+##+#+#+##+o.',
      '..o+####+#+#+##+o.',
      '..o+####+#+#+#+o..',
      '...o+###+#+#+#+o..',
      '....o+#######+o...',
      '.....o+######+o...',
      '......o++++++o....',
      '.......oooooo.....',
    ],
  },
  grab: {
    hot: [9, 10],
    rows: [
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '......ooooooo.....',
      '.....o+++++++oo...',
      '....o+##+##+#++o..',
      '....o+##+##+#+#+o.',
      '...o++#########+o.',
      '..o+#+#########+o.',
      '..o+#+##+#+#+##+o.',
      '..o+####+#+#+##+o.',
      '..o+####+#+#+#+o..',
      '...o+###+#+#+#+o..',
      '....o+#######+o...',
      '.....o+######+o...',
      '......o++++++o....',
      '.......oooooo.....',
    ],
  },
}
const HAND_W = HANDS.point.rows[0].length
const HAND_H = HANDS.point.rows.length
// ONE CSS px a cell: 18 x 19, against a system pointing hand's 20 x 26.
// The chrome's own pitch of two was tried on 2026-09-16 and is the one place
// this drawing is allowed to leave the site's ladder. At two a cell the hand
// is 36 x 38, roughly twice the area of anything else on the machine, and a
// pointer that large stops being a pointer: it is the one mark on a screen
// that must never be interesting. There is no size in between, because a
// pixel drawing scales by whole cells or it stops being one; anything else is
// a redraw on a bigger grid, not a scale factor.
const ARROW_CELL = 1

// one path per layer, straight off the grid: no growth, no inference
const pathOfLayer = (rows, ch) => {
  let d = ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (row[x] !== ch) {
        x++
        continue
      }
      let n = 0
      while (row[x + n] === ch) n++
      d += `M${x} ${y}h${n}v1h-${n}z`
      x += n
    }
  })
  return d
}
// Border, black, colour, in that order, because that is the order they sit
// in: the border is what separates the hand from a dark ground, the black
// from a light one, the colour is the identity on top. The same argument the
// two grown rings always carried, now carried by three drawn layers.
const spriteOf = (name, cls) => {
  const { rows } = HANDS[name]
  return (
    `<svg class="arrow ${cls}" width="${HAND_W * ARROW_CELL}" height="${HAND_H * ARROW_CELL}" viewBox="0 0 ${HAND_W} ${HAND_H}" shape-rendering="crispEdges" aria-hidden="true">` +
    `<path class="halo" d="${pathOfLayer(rows, 'o')}"/>` +
    `<path class="ring" d="${pathOfLayer(rows, '+')}"/>` +
    `<path class="mark" d="${pathOfLayer(rows, '#')}"/></svg>`
  )
}
// The peer's element carries both of its hands and the stylesheet shows one,
// so a press is a class toggle rather than two SVGs re-parsed mid-click. The
// element is seated on the POINTING hand's hot spot and the clicking one is
// nudged by the difference, so its own hot spot lands on the same screen
// point with one transform on the element rather than two: that transform is
// rewritten every animation frame for every peer, and is the one place here
// worth counting.
const HOT = { x: HANDS.point.hot[0], y: HANDS.point.hot[1] }
const NUDGE = {
  x: (HANDS.point.hot[0] - HANDS.click.hot[0]) * ARROW_CELL,
  y: (HANDS.point.hot[1] - HANDS.click.hot[1]) * ARROW_CELL,
}
const ARROW = spriteOf('point', 'up') + spriteOf('click', 'down')
const TIP_X = HOT.x * ARROW_CELL
const TIP_Y = HOT.y * ARROW_CELL
export const CLICK_NUDGE = NUDGE

// the burst: an 11-grid ring with four droplets flying off it, centred on
// the tip, in the peer's own hue
const BURST =
  '<svg class="burst" width="44" height="44" viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true">' +
  '<path fill="currentColor" d="M4 1h3v1h-3zM2 2h2v1h-2zM7 2h2v1h-2zM1 4h1v3h-1zM9 4h1v3h-1zM2 8h2v1h-2zM7 8h2v1h-2zM4 9h3v1h-3zM0 0h1v1h-1zM10 0h1v1h-1zM0 10h1v1h-1zM10 10h1v1h-1z"/></svg>'
// the edge marker: a peer on this page but above or below the
// part of it on screen shows as an arrow at that edge, in its hue. On the kit
// it is the face's own arrow in a cell of ground ruled one cell thick
// in the hue, not a hand-drawn chevron. Two marks, one shown, the same way
// the two hands are. EDGE_W is the cell: six --cv-px, as canvas-home.css
// sizes it.
const EDGE =
  '<span class="edge up" aria-hidden="true">↑</span><span class="edge down" aria-hidden="true">↓</span>'
const EDGE_W = 24
/**
 * The visitor's own hand, as a CSS cursor.
 * @param {string} which one of HANDS
 * @param {string} color the visitor's hue
 * @param {string} ink
 * @param {string} ground
 * @returns {string} a cursor value: url(...) hotspot, fallback
 *
 * An SVG data URI, the same shape the arrow used from 2026-09-11, because
 * that ran for a week on one element without costing anything. It was briefly
 * rasterised to a PNG here on a theory that SVG cursors are expensive to
 * swap; the theory was wrong, and the evidence against it is that the old
 * cursor was an SVG too. What actually made the canvas stutter was SCOPE: the
 * hand had been made the inherited default and put on 989 of 991 elements,
 * with a `:where(...) :active` rule swapping a fourth hand on every press,
 * which is the whole duration of a pan. Three rules in canvas-home.css now,
 * and the drawing is an SVG again.
 */
export function cursorImage(which, color, ink, ground) {
  const hand = HANDS[which] || HANDS.point
  const fill = { o: ground, '+': ink, '#': color }
  const layers = ['o', '+', '#']
    .map((l) => `<path fill="${fill[l]}" d="${pathOfLayer(hand.rows, l)}"/>`)
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${HAND_W * ARROW_CELL}" height="${HAND_H * ARROW_CELL}" viewBox="0 0 ${HAND_W} ${HAND_H}" shape-rendering="crispEdges">` +
    layers +
    '</svg>'
  const fallback = which === 'grab' ? 'grabbing' : 'pointer'
  // the hot spot is in the RENDERED image's pixels, not the drawing's cells,
  // so it scales with the pitch. At one px a cell the two were the same
  // number and this was invisible; at two, leaving it in cells points every
  // cursor half a hand up and to the left of where it looks like it points.
  const hx = hand.hot[0] * ARROW_CELL
  const hy = hand.hot[1] * ARROW_CELL
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, ${fallback}`
}

const CURSOR = 28 // stage-unit footprint handed to wrapPos for the edge test (the sprite's own height in css px, so a cursor at the seam wraps on the box it actually occupies)
// Smoothing time constant (ms): remote cursors ease toward their latest known
// position over roughly this long. Larger = floatier glide, smaller = snappier.
// ~90ms reads as a smooth follow while staying close to live.
const SMOOTH_TAU = 90
// Idle ladder. A cursor unmoved for IDLE_MS is probably a parked tab: the
// .idle class fades it to 0.3 opacity (transition declared in canvas-home.css,
// riding --cv-dur-drift). At GONE_MS it leaves the DOM entirely; the peer still
// counts toward the live tally and repaints on its next move.
const IDLE_MS = 45000
const GONE_MS = 120000

// Position sentinel, client half. The welcome roster includes participants that
// have never moved with fx/fy -1 (primitives/presence/presence-room.js): they count toward the
// tally but must not paint a phantom at the world origin. Exported for test.
// seam: test/presence.test.js
export const hasPos = (q) => q.fx >= 0 && q.fy >= 0

// The hover key of one snapshot entry, client half (primitives/presence/presence-room.js
// flush). The room sends a key only when it changes, so an entry
// has THREE states and the length is what tells the first from the second:
//   [id, x, y, down]          unchanged: keep the key this tab already holds
//   [id, x, y, down, 0]       cleared: the peer is over nothing at all
//   [id, x, y, down, 'key']   a new key
// A missing field is not null. Null is a fact on this wire, and reading
// "nothing said" as "over nothing" would put a tile out 24 times a second
// under a hand that is resting on it. Exported for test.
// seam: test/presence.test.js
export const keyOf = (e, was) => (e.length < 5 ? (was ?? null) : e[4] || null)

// Peer colour is a generated hue, one per peer, derived from the id so every
// client paints a given peer the same colour with nothing to sync. This is a
// deliberate exception to the two-ink + five-accent palette (BIBLE.md): peers
// need unbounded distinct identity, so the palette must not cap how many
// cursors read as different people. The golden angle spaces successive ids as
// far apart on the wheel as possible; mid lightness keeps every hue legible on
// both the ground and ink canvas, and the ground-token halo (canvas-home.css)
// does the separating over content. Only the fill leaves the palette.
const hueOf = (id) => (((id - 1) * 137.508) % 360).toFixed(1)
const colorOf = (id) => `hsl(${hueOf(id)} 65% 57%)`

/**
 * @param {object} ctx
 * @param {HTMLElement} ctx.scene   the stage-unit layer tiles live in
 * @param {(pos:number,cam:number,worldSize:number,viewSize:number,size:number)=>number|null} ctx.wrapPos
 * @param {number|null} [ctx.others] how many others the public room held when
 *   the page was rendered (boot.others), the tally's first word
 * @returns {{post:Function, frame:Function, squish:Function, front:Function, play:Function, onPlay:Function, feed:Function, watch:Function, onWatch:Function, mayAct:Function, onSpectate:Function, onSlime:Function, watchSky:Function, onSky:Function, push:Function, onCount:Function, onData:Function, onHover:Function, onSquish:Function, onCursor:Function, follow:Function, goRoom:Function, onSession:Function, sessionNow:Function, selfId:Function, act:Function, onAct:Function, now:Function}}
 *   follow(id) says whom this tab follows (null for nobody); it rides the
 *   move frame so the room can draw the line (conga.js).
 *   goRoom({code, kind, pin}) moves this tab into a session (code 'new'
 *   opens one, owner only) and goRoom(null) back to the public room;
 *   onSession hears the room's answer (joined, pin, locked, ended, refused,
 *   public) with the session as the room describes it, sessionNow() is the
 *   same as a value.
 *   act(ch, d) shares one act with the rest of a session, or in the public
 *   room with the tabs following this one, and does nothing when nobody
 *   would hear it; onAct hears the peers' (ch, d, id, colour).
 *   post(fx, fy, k, down, at) hands over this tab's cursor, hover key,
 *   button and page anchor; all ride the same frame and the key and the
 *   anchor may be null. With an anchor, fx and fy are fractions of that
 *   block's box (anchor.js), not of the world.
 *   onPeers subscribes to the roster (id, anchor, colour) on every join,
 *   leave and place change; roster() is the same as a value; peerAt(id) is
 *   one peer's position for the follower; onPick fires with a peer's id
 *   when its cursor is clicked.
 *   watch(on, again) says whether this tab can see the slime mould's dish;
 *   sent on change, at once. The room sends the dish only to tabs that said
 *   yes. `again` repeats a yes to ask for a keyframe.
 *   onSlime subscribes to the dish's frames, keyframes and deltas alike,
 *   handed on as the room sent them.
 *   watchSky(on), onSky and push(dx, dy) are the same three for the
 *   weather window: its watch, its offset frames, and a hand's impulse.
 *   squish() asks the room to squish Maurice. Sent at once (not pumped): a
 *   squish is a click, and it must not queue behind the cursor. Spectators
 *   send nothing.
 *   mayAct() is that same fact as a value: false once the welcome has said
 *   this tab spectates. The optimistic paint behind squish, front and feed
 *   asks it first, so a spectator never sees a hand the room will undo.
 *   onSpectate subscribes to it and fires on every welcome.
 *   onSquish subscribes to the room's bug and fires with the server ms he
 *   is back at whenever the room says so (the welcome and every squish,
 *   this tab's own included). Like onData it does not fire on subscribe:
 *   the page booted with the instant in its payload.
 *   onCount subscribes to the live tally of other participants (self and
 *   spectators excluded); the callback fires immediately with the current
 *   value and again on every join/leave. The value is the last word this tab
 *   had: the page's (`others`), then the roster's, held when the socket
 *   drops. It is null while there is no word at all (no socket, a refused
 *   one, a room the page said nothing of), and never zero: an empty roster
 *   that has not been heard is not a count.
 *   onData subscribes to the server's data nudge and fires with the changed
 *   keys. Unlike onCount it does NOT fire on subscribe: a nudge is an event,
 *   not a value, and the page already booted with the payload it names.
 *   onHover subscribes to the room's highlights and fires (key, n) whenever
 *   the number of peers on a key changes. n, not a boolean, because three
 *   people can be on one row and the third leaving must not put it out.
 *   select(sel) hands over this tab's selection on its page (anchor.js
 *   selOf, or null), sent when it changes; onSels subscribes to the other
 *   readers' selections as one list of {id, sel, color} on every change.
 *   now() is the server's clock as best this tab can tell, for the dust,
 *   Maurice and the weather window.
 *
 *   onCount fires with NULL, once, where presence is impossible. That is not
 *   zero. Zero is "nobody else is here", which this tab is in no position to
 *   claim; null is "this tab cannot see company", and the tally hides rather
 *   than reporting a number it did not measure.
 */

// Presence is company, and company is the first thing you do without.
//
// This used to be load-bearing by accident. initPresence runs at app.js module
// scope, after the tiles are built and before boot() installs its catch, so
// `new WebSocket(...)` throwing took the entire canvas down with it, on every
// engine that does not have the constructor. watchOS Safari is one: it has no
// WebSocket at all, and reported itself in one line once the page was asked to
// say why it had not painted:
//
//   the canvas threw: Can't find variable: WebSocket (K1@/canvas/app.js:4:32316)
//
// So the socket is optional in the only way that counts: initPresence is TOTAL.
// It returns an API on every engine, and where it cannot connect, that API is
// this. The canvas loses live cursors and the tally, and keeps everything that
// makes it a canvas. Fresh data still lands, on the five-minute poll app.js
// already runs as the floor under the server's nudge.
const NO_PRESENCE = {
  post() {},
  frame() {},
  // no room to squish for; the bug is this tab's own until a socket exists
  squish() {},
  onSquish() {},
  front() {},
  play() {
    return false
  },
  onPlay() {},
  onFront() {},
  feed() {},
  watch() {},
  onWatch() {},
  onSlime() {},
  watchSky() {},
  onSky() {},
  push() {},
  onCursor() {},
  onSelf() {},
  // nobody to follow and nobody here: an empty roster, never a peer
  onPeers() {},
  onPick() {},
  peerAt: () => null,
  roster: () => [],
  // no socket, so no session to join and nobody to act for
  follow() {},
  goRoom() {},
  onSession() {},
  sessionNow: () => null,
  selfId: () => null,
  act() {},
  onAct() {},
  // alone, so nobody outranks this tab: it may act, and its paint stands
  mayAct: () => true,
  onSpectate() {},
  onCount(cb) {
    cb(null)
  },
  onData() {},
  // No company, so no highlights but your own, and no correction to make to
  // a clock nobody is comparing yours against: the dust and the sky run on
  // this machine's.
  onHover() {},
  // nobody to show a selection to, and nobody's to draw
  select() {},
  onSels() {},
  now: () => Date.now(),
}
// A constructor can be missing, and it can also be present and refuse: a
// blocked port, a policy, a proxy that does not speak Upgrade. Both are the
// same answer here, so both take the same door.
const canSocket = () => {
  try {
    return typeof WebSocket === 'function'
  } catch {
    return false
  }
}

export function initPresence({
  scene,
  wrapPos,
  pageLayer = null,
  locate = () => null,
  room = null,
  others = null,
}) {
  if (!canSocket()) return NO_PRESENCE
  const layer = document.createElement('div')
  layer.id = 'cursors'
  scene.appendChild(layer)
  // THE SECOND LAYER: peers on the same PAGE as this tab. It
  // rides the modal rather than the scene because a page is screen chrome,
  // not world: nothing in it pans, zooms or wraps. `locate` is app.js's
  // arithmetic from an anchor to a screen point (anchor.js pointOf on the
  // block's box); nothing here knows what a block is.
  const pageCursors = document.createElement('div')
  pageCursors.id = 'pcursors'
  if (pageLayer) pageLayer.appendChild(pageCursors)
  // where THIS tab is, '' for the canvas: set by post(), read by frame() to
  // decide which peers are drawn at all
  let myPlace = ''

  // id -> { fx, fy (target), cx, cy (rendered), el, placed, seen }
  const peers = new Map()

  // Live tally. Self and spectators never enter `peers`, so the count is the
  // other participants this tab knows about, moved or not. A constructor
  // that refused (connect() below) makes it null for good, as NO_PRESENCE
  // says: this tab measured nothing, which is not zero.
  //
  // The same holds wherever the roster is not heard. `said` is the last
  // count this tab had a word for: the page's (the public room as the server
  // rendered it), then the roster's. A closed socket leaves it standing,
  // because an empty `peers` after a drop is the cursors gone, not the room.
  // `heard` is whether the socket in hand has told this tab the room; only
  // then is the count what `peers` holds. No word at all is null.
  const countCbs = new Set()
  let refused = false
  let said = Number.isInteger(others) && others >= 0 ? others : null
  let heard = false
  const count = () => (refused ? null : heard ? peers.size : said)
  const emitCount = () => {
    for (const cb of countCbs) cb(count())
  }
  function onCount(cb) {
    countCbs.add(cb)
    cb(count())
  }

  // Data nudges. A Set of subscribers registered once at startup, never per
  // message: a push must cost the same on the thousandth refresh as on the
  // first. Spectators subscribe too, and the server sends to them too.
  const dataCbs = new Set()
  function onData(cb) {
    dataCbs.add(cb)
  }
  // This tab's own colour, once the room has named it. It went out on
  // 2026-09-16 with the visitor's own arrow and came back the same day with
  // the visitor's own HANDS, which is a different thing: the hue is not
  // mirroring what the room sees of you, it is so the hand you drag the ground
  // with is the one everybody else knows you by.
  const selfCbs = new Set()
  function onSelf(cb) {
    selfCbs.add(cb)
  }
  // The roster, for the who's-here list and the follower: who
  // is in the room and where. Told on every join, leave and place change,
  // never per move: a list that rebuilt at 24 a second would be the most
  // expensive thing on the screen. roster() is the same fact as a value.
  const peersCbs = new Set()
  function onPeers(cb) {
    peersCbs.add(cb)
  }
  // `host` marks the room's owner (a room of his own only), `f` whom that
  // peer follows: the who's-here list and a follow room's guests read both
  function roster() {
    const out = []
    for (const [id, p] of peers)
      out.push({ id, at: p.at, color: colorOf(id), host: p.host, f: p.f })
    return out
  }
  function emitPeers() {
    for (const cb of peersCbs) cb(roster())
  }
  // a cursor was clicked: the visitor wants to follow that peer. The layers
  // are pointer-transparent and the cursors are not (canvas-home.css), so
  // the click is the cursor's own.
  const pickCbs = new Set()
  function onPick(cb) {
    pickCbs.add(cb)
  }
  function picked(id) {
    for (const cb of pickCbs) cb(id)
  }
  /** where a peer is right now, for the follower: null if unknown */
  function peerAt(id) {
    const p = peers.get(id)
    return p && p.fx >= 0 ? { fx: p.fx, fy: p.fy, at: p.at } : null
  }
  // Whether this tab may ACT. The welcome names the role, and
  // squish/front/feed already return silently for a spectator; the fact is
  // exposed so app.js can gate the OPTIMISTIC paint on the same thing the
  // send is gated on. A spectator who painted a pellet saw it for a quarter
  // second and then saw the room's frame erase it: an illusion of a hand,
  // then a contradiction. Spectators get no illusion anywhere, so the paint
  // asks first. onSpectate fires on every welcome (a reconnect can change
  // the role) so the dish can read as not-tappable while it is not.
  const spectateCbs = new Set()
  function onSpectate(cb) {
    spectateCbs.add(cb)
  }
  function emitSpectate() {
    for (const cb of spectateCbs) cb(spectating)
  }
  // Peers' pointers, as they move: id, world fractions and the hover key.
  // app.js raises the dust under them (BIBLE.md section 10) so the room
  // sees one another's hands disturb the same glyphs.
  const cursorCbs = new Set()
  function onCursor(cb) {
    cursorCbs.add(cb)
  }
  function emitCursor(id, fx, fy, k) {
    for (const cb of cursorCbs) cb(id, fx, fy, k)
  }
  // The slime mould's dish: the frame the server painted, the room's word,
  // handed on whole. A KEYFRAME carries the picture (`g`, cell data through
  // primitives/slime/slime.js decode) and the food (`f`); a DELTA carries the changed
  // cells (`d`) against the tick it was cut from (`b`), and the food only
  // when it moved. Nothing is drawn or decoded here; app.js holds the
  // picture and knows which base it holds.
  const slimeCbs = new Set()
  function onSlime(cb) {
    slimeCbs.add(cb)
  }
  function emitSlime(m) {
    if (typeof m.g !== 'string' && typeof m.d !== 'string') return
    for (const cb of slimeCbs) cb(m)
  }
  // The piles' fronts: stack id and member index, the room's word.
  const frontCbs = new Set()
  function onFront(cb) {
    frontCbs.add(cb)
  }
  function emitFront(stack, i) {
    if (typeof stack !== 'string' || !Number.isInteger(i) || i < 0) return
    for (const cb of frontCbs) cb(stack, i)
  }
  // Which piles are being played through: the room's word, like the front.
  const playCbs = new Set()
  function onPlay(cb) {
    playCbs.add(cb)
  }
  function emitPlay(stack, on) {
    if (typeof stack !== 'string') return
    for (const cb of playCbs) cb(stack, !!on)
  }
  // Maurice. Same shape as the data nudge: subscribers registered once,
  // told the instant the room announces, nothing here knows what a bug is.
  const squishCbs = new Set()
  function onSquish(cb) {
    squishCbs.add(cb)
  }
  function emitSquish(until) {
    if (typeof until !== 'number' || !Number.isFinite(until) || until < 0) return
    for (const cb of squishCbs) cb(until)
  }

  // ---- the room's highlights -----------------------------------------------
  // key -> how many peers are on it. A COUNT and not a flag, because two
  // people can rest on the same tile and the first of them leaving must not
  // put it out. app.js is told the count and owns what to do with it; nothing
  // here knows a tile from a table row.
  const hoverCbs = new Set()
  const hoverN = new Map()
  function onHover(cb) {
    hoverCbs.add(cb)
  }
  function emitHover(key, n) {
    for (const cb of hoverCbs) cb(key, n)
  }
  // Move one peer off its old key and onto its new one, announcing only the
  // keys whose count actually crossed. A peer sending the same key on every
  // one of its 30 frames per second must cost nothing.
  function setHover(p, k) {
    const was = p.k ?? null
    const now = k ?? null
    if (was === now) return
    p.k = now
    if (was) {
      const n = (hoverN.get(was) || 1) - 1
      if (n > 0) hoverN.set(was, n)
      else hoverN.delete(was)
      emitHover(was, n > 0 ? n : 0)
    }
    if (now) {
      const n = (hoverN.get(now) || 0) + 1
      hoverN.set(now, n)
      emitHover(now, n)
    }
  }

  // SELECTIONS (shared highlighting): the words each peer has selected on
  // its page, as the room sent them (anchor.js selOf), handed on whole as
  // one list on every change. Nothing is drawn here: app.js holds the page
  // and knows whether the words are on it (highlight.js).
  const selCbs = new Set()
  function onSels(cb) {
    selCbs.add(cb)
  }
  function emitSels() {
    const list = []
    for (const [id, p] of peers) if (p.sel) list.push({ id, sel: p.sel, color: colorOf(id) })
    for (const cb of selCbs) cb(list)
  }
  function setSel(p, sel) {
    if (!p.sel && !sel) return
    p.sel = sel
    emitSels()
  }
  // one entry of a `sels` frame: [id, at, a, j, b, q, z], or [id, 0] for a
  // selection collapsed
  const selOfEntry = (e) =>
    e[1] ? { at: e[1], a: e[2], j: e[3], b: e[4], q: e[5], z: e[6] } : null

  // which of the two hands this peer is wearing. A class, not a redraw: both
  // sprites are already in the element and the stylesheet shows one.
  function setDown(p, down) {
    if (p.down === down) return
    p.down = down
    p.el.classList.toggle('pressing', down)
  }
  function ensurePeer(id) {
    let p = peers.get(id)
    if (!p) {
      const el = document.createElement('div')
      el.className = 'cursor'
      // fixed-world zoom trial: the layer scales with the scene, so the
      // frame() transform counter-scales about the tip to keep the arrow a
      // constant screen size; the origin must be the tip for that math
      el.style.transformOrigin = '0 0'
      el.style.color = colorOf(id)
      el.innerHTML = ARROW + EDGE
      // the id on the element is for the headless page check
      // (scripts/verify/page-presence.mjs) to find a peer by; no name, no
      // hue string, the same integer the wire already carries
      el.dataset.peer = id
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        picked(id)
      })
      // Detached until the first real position: a joined-but-unmoved peer
      // counts toward the tally but must not paint a phantom at the origin.
      // `at` is the page block it rests on, null on the canvas.
      // `f`/`fs` are whom it follows and when it joined that line (the
      // conga, conga.js), `host` whether it owns the session, `hist` the
      // path it has been drawn along, kept only while somebody follows it
      p = {
        fx: -1,
        fy: -1,
        cx: null,
        cy: null,
        k: null,
        at: null,
        f: null,
        fs: 0,
        host: false,
        hist: [],
        sel: null,
        down: false,
        el,
        placed: false,
        seen: 0,
      }
      peers.set(id, p)
      emitCount()
      emitPeers()
    }
    return p
  }
  // A real position arrived: seat the cursor (or re-seat it after an idle
  // park) and clear the fade. cx null makes frame() snap instead of sweeping
  // in from a stale spot.
  function setPos(p, fx, fy, now) {
    p.fx = fx
    p.fy = fy
    p.seen = now
    p.el.classList.remove('idle')
    if (!p.placed) {
      p.cx = null
      seat(p)
      p.placed = true
    }
  }
  // a cursor lives in the layer of its place: the scene's for the canvas,
  // the modal's for a page. Moving between them is a re-parent, and the
  // ease restarts from wherever it lands (cx null).
  function seat(p) {
    const host = p.at ? pageCursors : layer
    if (p.el.parentNode !== host) host.appendChild(p.el)
    p.cx = null
  }
  // the anchor changed: a new page, a new block, or back to the canvas
  function setAt(p, at) {
    at = at ?? null
    if (at === p.at) return
    const wasPlace = placeOf(p.at)
    p.at = at
    // a new block on the same page is a jump, not a glide: the ease runs
    // inside a block's box, and between two boxes is not a place
    p.cx = null
    if (p.placed) seat(p)
    if (placeOf(at) !== wasPlace) {
      // a selection stays on the page it was made on: a peer who left it
      // has nothing selected here any more. One that already names the page
      // just arrived at is kept, since the room may say the selection a
      // beat before it says the place.
      if (p.sel && placeOf(p.sel.at) !== placeOf(at)) setSel(p, null)
      emitPeers()
      // company arrived in this tab's place: it must be told where this
      // tab is, since a lone tab sends nothing (pump)
      if (placeOf(at) === myPlace) resend = true
    }
  }
  // whom a peer follows, and its place in that line (the room's sequence).
  // Told to the roster listeners, since the who's-here list and a follow
  // room's guests read it; never per move, because it changes only when
  // somebody picks or lets go.
  function setF(p, f, fs) {
    f = Number.isInteger(f) && f > 0 ? f : null
    fs = f && Number.isInteger(fs) ? fs : 0
    if (f === p.f && fs === p.fs) return
    p.f = f
    p.fs = fs
    emitPeers()
  }
  function dropPeer(id) {
    const p = peers.get(id)
    if (p) {
      // the highlight leaves with the peer: a tile still lit because someone
      // closed their laptop on it is the room lying about who is here
      setHover(p, null)
      // and so do the words they had selected
      const hadSel = !!p.sel
      p.sel = null
      // a leaving cursor POPS like a bubble (2026-09-11): the arrow swells
      // and goes in three frames while a ring of pixels bursts out of its
      // tip, then the element is gone. A tab that never placed its cursor
      // has nothing to pop.
      if (p.placed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const el = p.el
        el.insertAdjacentHTML('beforeend', BURST)
        el.classList.add('pop')
        setTimeout(() => el.remove(), 320)
      } else p.el.remove()
      peers.delete(id)
      emitCount()
      emitPeers()
      if (hadSel) emitSels()
    }
  }
  function clearAll() {
    for (const id of [...peers.keys()]) dropPeer(id)
  }

  // ---- socket, with reconnect backoff --------------------------------------
  let ws = null
  let selfId = null
  let spectating = false // set by the server when the room is full; observe-only
  let backoff = 500
  let retryTimer = null
  // server clock minus this machine's, from the welcome. 0 until then, which
  // is the right default: an uncorrected clock is a slightly-off clock, and
  // the dust would rather tick slightly off than not at all.
  let skew = 0

  // ---- which room (2026-09-25) ----------------------------------------------
  // A SESSION is a room of its own on the same socket: the owner opens one
  // (`?follow` or `?session` on any page, or the desk), and whoever has its
  // code (and its PIN, when it has one) is in it and in nothing else.
  // Nobody in the public room sees a session's hands and nobody in a session
  // sees the public's, which is what makes it a tunnel rather than a filter.
  // The room is chosen by the socket's query and nothing else, so leaving a
  // session is opening the public socket again.
  //
  // `want` is where this tab is trying to be: null for the public room, or
  // {code, kind, pin}, where a code of 'new' asks the room to open one (the
  // server refuses anybody but the owner) and a code nobody has opened is
  // opened with that code for the owner (routes/presence.js). The kind goes
  // with every code, since the owner's named room is opened as the kind his
  // address says; a room already open keeps its own. `sess` is what the
  // room said it is, from the welcome: {code, kind, host, pin}, pin only to
  // the host.
  let want = null
  let sess = null
  // the session's word, handed to app.js: 'joined' (sess is set), 'pin' (a
  // PIN is needed or was wrong), 'locked' (too many wrong), 'ended' (it is
  // over, or never was), 'refused' (only the owner opens one), 'public'
  const sessionCbs = new Set()
  function onSession(cb) {
    sessionCbs.add(cb)
  }
  function emitSession(state) {
    for (const cb of sessionCbs) cb(state, sess)
  }
  // a close this tab asked for, to change rooms: reconnect at once, not
  // after the backoff, and do not read the close as the room going away
  let switching = false
  const socketUrl = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const base = `${proto}://${location.host}/ws/cursors`
    if (!want) return base
    const q = new URLSearchParams({ session: want.code })
    if (want.kind) q.set('kind', want.kind === 'follow' ? 'follow' : 'session')
    if (want.pin) q.set('pin', want.pin)
    return `${base}?${q}`
  }
  /**
   * Go to a room: a session ({code, kind?, pin?}) or the public one (null).
   * The socket is closed and opened again on the new query; everything this
   * tab knew about the last room goes with it.
   * @param {{code:string, kind?:string, pin?:string}|null} next
   */
  function goRoom(next) {
    want = next && typeof next.code === 'string' ? { ...next } : null
    sess = null
    // the count held was the last room's, and the next has not spoken
    said = null
    heard = false
    emitCount()
    clearTimeout(retryTimer)
    if (ws && ws.readyState <= 1) {
      switching = true
      try {
        ws.close()
      } catch {
        switching = false
      }
      if (switching) return // onclose reconnects
    }
    connect()
  }

  // ---- acts: what a session shares besides hands -----------------------------
  // A note played, a knob turned, an egg thrown, a line of text marked. The
  // room relays them to the rest of the session as they happen (not on the
  // snapshot tick: a note that waits 40ms is a late note), and in the public
  // room to the tabs following this one, since a follow is a session of one
  // direction (primitives/presence/presence-protocol.js, the acts). Nobody following in the
  // public room is nobody to tell, so nothing is sent. What an act MEANS is
  // the page's business (app.js and the page scripts); here it is a
  // channel, a small object and who sent it.
  const actCbs = new Set()
  function onAct(cb) {
    actCbs.add(cb)
  }
  function followed() {
    for (const p of peers.values()) if (p.f === selfId) return true
    return false
  }
  // a follow room's guest plays to nobody: the room would drop it anyway
  // (presence-room.js act), so it is never sent
  const guestOfFollow = () => !!sess && sess.kind === 'follow' && !sess.host
  function act(ch, d) {
    if (spectating || !(sess || followed())) return
    if (guestOfFollow()) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'act', ch, d }))
  }

  function connect() {
    // The feature check above says the constructor EXISTS. It does not say
    // this call will return: a blocked port, a CSP connect-src, or a proxy
    // that will not upgrade all throw right here. A throw during the retry
    // ladder is no more allowed to reach the canvas than one on the first
    // attempt was, so it stops at the same place.
    try {
      ws = new WebSocket(socketUrl())
    } catch {
      ws = null
      refused = true
      emitCount()
      return // no retry: a constructor that refuses will refuse again
    }
    ws.onopen = () => {
      backoff = 500
      // a new socket knows nothing of this tab: what it can see is said
      // again, on the next frame, or the room would never send the dish
      sentWatch = null
      sentAt = null
      sentF = null
      resend = true
      sentSky = null
      // and a new room holds no selection of this tab's: it is said again
      sentSel = ''
    }
    ws.onmessage = (ev) => {
      let m
      try {
        m = JSON.parse(ev.data)
      } catch {
        return
      }
      if (m.type === 'welcome') {
        selfId = m.id
        spectating = !!m.spectator
        emitSpectate()
        for (const cb of selfCbs) cb(colorOf(selfId))
        // The clock correction, and the only state this tab keeps about
        // time. One sample, not a running estimate: the round trip is a few
        // ms on a socket that just opened, the finest thing read off the
        // clock is the dust's 110ms tick, and a correction that kept
        // re-estimating would jolt it every time the network hiccuped.
        if (typeof m.t === 'number' && Number.isFinite(m.t)) skew = m.t - Date.now()
        // where the room left the bug: a reconnecting tab may have missed
        // a squish, and this is how it catches up
        emitSquish(m.squish)
        if (m.fronts && typeof m.fronts === 'object')
          for (const [k, v] of Object.entries(m.fronts)) emitFront(k, v)
        if (Array.isArray(m.plays)) for (const k of m.plays) emitPlay(k, true)
        const now = performance.now()
        for (const q of m.peers) {
          const p = ensurePeer(q.id)
          // fx/fy -1 in the roster = connected but never moved: count, don't draw
          if (hasPos(q)) setPos(p, q.fx, q.fy, now)
          // highlights already lit when we arrived are part of the room
          setHover(p, q.k)
          // and so is a hand already held down
          setDown(p, q.d === true)
          // and the page it is reading
          setAt(p, q.at)
          // and the session's owner, and every line already dancing
          p.host = q.h === 1 || q.h === true
          setF(p, q.f, q.fs)
        }
        // the roster is in: from here the count is what the room holds, told
        // once and not once a peer
        heard = true
        emitCount()
        // the session this socket is in, as the room tells it: the code
        // becomes the one to come back to (a 'new' is a real code now)
        const s = m.session
        if (s && typeof s.code === 'string' && want) {
          sess = {
            code: s.code,
            kind: s.kind === 'follow' ? 'follow' : 'session',
            host: s.host === true,
            pin: typeof s.pin === 'string' ? s.pin : null,
          }
          want = { code: sess.code, kind: sess.kind, pin: want.pin || null }
          emitSession('joined')
        } else if (!want) emitSession('public')
        emitPeers()
      } else if (m.type === 'join') {
        const p = ensurePeer(m.id)
        if (m.h === 1 || m.h === true) {
          p.host = true
          emitPeers()
        }
      } else if (m.type === 'moves') {
        // ONE SNAPSHOT A TICK (primitives/presence/presence-room.js, 24fps): every peer who
        // moved since the last one, as [id, x, y, down, key] with the
        // coordinates as 12-bit integers and the key present only when it
        // changed (keyOf). The room ships the sender's own
        // entry too, because filtering it out per-recipient is exactly what
        // made this a message per peer; skipping it here costs one compare.
        const now2 = performance.now()
        for (const e of m.m) {
          const id = e[0]
          if (id === selfId) {
            // the one thing a tab reads off its own entry: its place in the
            // line it joined, which only the room can number
            if (e.length >= 8) selfFs = e[6] ? e[7] || 0 : 0
            continue
          }
          const p = ensurePeer(id)
          const fx = e[1] / 4096
          const fy = e[2] / 4096
          // the anchor is the sixth field, present only when it changed
          // (primitives/presence/presence-room.js flush): 0 says back on the canvas
          if (e.length >= 6) setAt(p, e[5] || null)
          // whom it follows, and its number in that line: the seventh and
          // eighth, present only when that changed (0 says nobody)
          if (e.length >= 8) setF(p, e[6], e[7])
          setPos(p, fx, fy, now2)
          setHover(p, keyOf(e, p.k))
          setDown(p, e[3] === 1)
          emitCursor(id, fx, fy, p.k)
        }
      } else if (m.type === 'sels') {
        // the words peers on this tab's page have selected, or collapsed
        // (primitives/presence/presence-room.js flushSels); this tab's own comes back in the
        // same frame, since the frame is the page's, and is skipped
        for (const e of Array.isArray(m.s) ? m.s : []) {
          if (!Array.isArray(e) || e[0] === selfId) continue
          setSel(ensurePeer(e[0]), selOfEntry(e))
        }
      } else if (m.type === 'leave') {
        dropPeer(m.id)
      } else if (m.type === 'act') {
        // an act, from a peer in this session or the one this tab follows
        // (the room sends it nowhere else): handed on with the peer's hue, so
        // a key lit by somebody else is lit in their colour
        if (Number.isInteger(m.id) && typeof m.ch === 'string' && m.d && typeof m.d === 'object')
          for (const cb of actCbs) cb(m.ch, m.d, m.id, colorOf(m.id))
      } else if (m.type === 'ended') {
        // the owner closed it (or it went quiet): the close that follows
        // is 4404, and that is where the tab goes home
        want = null
        sess = null
        emitSession('ended')
      } else if (m.type === 'squish') {
        emitSquish(m.until)
      } else if (m.type === SERVER_PUSH.front) {
        emitFront(m.stack, m.i)
      } else if (m.type === SERVER_PUSH.play) {
        emitPlay(m.stack, m.on)
      } else if (m.type === SERVER_PUSH.slime) {
        emitSlime(m)
      } else if (m.type === SERVER_PUSH.sky) {
        for (const cb of skyCbs) cb(m)
      } else if (m.type === SERVER_PUSH.stale) {
        // The server refreshed and something moved. It sends the key names,
        // not the data: /api/canvas stays the single source, and the page
        // re-reads it through the one path it already has.
        const keys = Array.isArray(m.keys) ? m.keys : []
        for (const cb of dataCbs) cb(keys)
      }
      // No trailing else on purpose: an unknown type is ignored, so a server
      // that learns a new frame never breaks a tab running yesterday's script.
    }
    ws.onclose = (ev) => {
      // the cursors go with the socket and the count does not: what this tab
      // last heard stands until the next welcome says otherwise
      if (heard) said = peers.size
      heard = false
      clearAll()
      clearTimeout(retryTimer)
      selfFs = 0
      if (switching) {
        switching = false
        connect()
        return
      }
      // A session's own refusals (primitives/rooms/sessions.js), each read once and never
      // retried blind: a wrong PIN offered again is a wrong PIN again, and a
      // session that ended is not coming back. A PIN keeps the tab out of
      // every room until one is offered (goRoom()) or the visitor gives up
      // (goRoom(null)); the rest put it back in the public room at once.
      if (ev.code >= 4400 && ev.code < 4500) {
        sess = null
        // that room is not this tab's, and the one it falls back to has not
        // spoken: no word, not the old room's count
        said = null
        emitCount()
        if (want && (ev.code === 4401 || ev.code === 4429)) {
          ws = null
          emitSession(ev.code === 4401 ? 'pin' : 'locked')
          return
        }
        if (want) emitSession(ev.code === 4403 ? 'refused' : 'ended')
        want = null
        connect()
        return
      }
      // 1013 = server full (primitives/presence/presence-room.js MAX_CONN): honor "try again
      // later" with a long wait instead of hammering a saturated room. Both
      // paths jitter so a fleet of tabs dropped together doesn't reconnect in
      // lockstep. A tab stuck here sees no cursors and no data nudges; the
      // /api/canvas poll in app.js is what keeps it correct meanwhile.
      const delay =
        ev.code === 1013 ? 60000 + Math.random() * 30000 : backoff * (0.75 + Math.random() * 0.5)
      retryTimer = setTimeout(connect, delay)
      backoff = Math.min(backoff * 2, 8000)
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* onclose handles retry */
      }
    }
  }

  // ---- the squish -> wire, at once -------------------------------------------
  // Not pumped with the cursor: the pump waits for the next animation frame
  // and the RATE_MS floor, and a click is news now. The server gates squishes
  // on their own floor (routes/presence.js SQUISH_GATE_MS) so this cannot
  // flood.
  function squish() {
    if (spectating) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'squish' }))
  }
  // a pile turned: at once, like the squish
  function front(stack, i) {
    if (spectating) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'front', stack, i }))
  }
  // a replay started or stopped: at once, like the front. False when there is
  // no room to tell, so the caller can say so.
  function play(stack, on, n) {
    if (spectating) return false
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: 'play', stack, on, n }))
    return true
  }
  // food in the dish: at once, like the squish. Cell coordinates, whole
  // numbers; the server drops the pellet and the next frame shows it.
  function feed(x, y) {
    if (spectating) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'feed', x, y }))
  }
  // ---- the watch: whether this tab can see the dish ------------
  // Sent on CHANGE only, and at once: the room sends the dish's frames to
  // the tabs that said yes and nothing to the rest, so the first frame of a
  // pan that brings the dish on screen must not wait behind the cursor.
  // `again` says the same yes a second time on purpose: app.js got a delta
  // against a picture it does not hold and wants a keyframe. Spectators
  // send this too, since they are sent the dish too.
  let sentWatch = null
  // What was SAID, handed on as it is said: a no means the room
  // stops sending this tab the dish, so app.js draws the dish asleep from
  // the same fact, and wakes it on the keyframe the next yes brings.
  const watchCbs = new Set()
  function onWatch(cb) {
    watchCbs.add(cb)
  }
  // the one watch frame, for the dish or (of:'sky') the window; the dish's
  // leaves `of` off, so its bytes are what they were
  function sayWatch(on, of) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: 'watch', on, of }))
    return true
  }
  function watch(on, again = false) {
    on = on === true
    if (!again && on === sentWatch) return
    if (!sayWatch(on)) return
    sentWatch = on
    for (const cb of watchCbs) cb(on)
  }
  // A hidden tab stops its animation frames, so the yes it last sent would
  // stand until it came back: the no goes here, on the event itself. The yes
  // is not its mirror: app.js says it on the next frame once it has
  // rendered and knows whether the dish is on camera.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      watch(false)
      // the room never watches a sky it was not told about: a no is owed
      // only where a yes went out
      if (sentSky) watchSky(false)
    }
  })

  // ---- the weather window ----------------------------
  // The same watch, said for the window with of:'sky', on change only, and
  // the push: a hand's impulse in whole cells, sent at once, never by a
  // spectator. The room answers every watcher with the sky's offset.
  let sentSky = null
  const skyCbs = new Set()
  function onSky(cb) {
    skyCbs.add(cb)
  }
  function watchSky(on) {
    on = on === true
    if (on === sentSky) return
    if (!sayWatch(on, 'sky')) return
    sentSky = on
  }
  function push(dx, dy) {
    if (spectating) return
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'push', dx, dy }))
  }

  // ---- local pointer -> wire, rAF-coalesced to ~30 Hz ----------------------
  let pendFx = -1
  let pendFy = -1
  let pendK = null
  let pendD = false
  let pendAt = null
  // the last real position this tab posted, whatever was sent: the place
  // a key change or a resend rides on
  let ownFx = -1
  let ownFy = -1
  // and the anchor it was posted on, which is what a line walking behind
  // this tab walks on (the pending one goes null when the pointer leaves the
  // window, and the hand has not left the page because of that)
  let ownAt = null
  let sentK = null
  let sentD = false
  let sentAt = null
  // WHOM THIS TAB FOLLOWS (the conga, 2026-09-25). follow.js decides it and
  // app.js hands it here; the room carries it so everyone can draw this tab
  // in line behind the one it follows. `selfFs` is this tab's number in that
  // line, which only the room can hand out (it reads it off its own entry).
  let myF = null
  let sentF = null
  let selfFs = 0
  // say it again even if nothing changed: company just arrived in this
  // tab's place and has never heard from it (setAt, join)
  let resend = false
  let lastSent = 0
  let lastFrameT = 0
  // `at` is the page block under the pointer, null on the
  // canvas; with it set, fx and fy are fractions of that block's box.
  function post(fx, fy, k = null, down = false, at = null) {
    pendFx = fx
    pendFy = fy
    pendK = k
    pendD = down === true
    pendAt = at ?? null
    myPlace = placeOf(pendAt)
    if (fx >= 0) {
      ownFx = fx
      ownFy = fy
      ownAt = pendAt
    }
  }
  /** say whom this tab follows now (an id), or that it follows nobody (null) */
  function follow(id) {
    myF = Number.isInteger(id) && id > 0 ? id : null
    if (!myF) selfFs = 0
  }
  // whether anybody else is in this tab's place: the room sends a lone
  // reader nothing (primitives/presence/presence-room.js flush), and a lone reader sends
  // the room nothing either, so an empty page costs no bytes in either
  // direction. A place CHANGE still goes: it is the one fact about this
  // tab the rest of the room needs.
  function company() {
    for (const p of peers.values()) if (placeOf(p.at) === myPlace) return true
    return false
  }
  function pump(now) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    pumpMove(now)
    if (!spectating) pumpSel()
  }
  function pumpMove(now) {
    if (now - lastSent < RATE_MS) return
    const moved = pendFx >= 0
    // a new line joined or left is news to everyone, like a new place
    const moving = pendAt !== sentAt || myF !== sentF
    // room full: watch, don't broadcast. The page it reads is the one thing
    // a spectator says, when it changes, so the room can send it that page;
    // the room notes it and tells nobody (primitives/presence/presence-room.js place)
    if (spectating && placeOf(pendAt) === placeOf(sentAt)) return
    // A hover change is news even when the pointer has not budged since the
    // last frame we sent, and it has to be, or the last thing a leaving
    // cursor does (falling off a tile, then stopping) would never reach the
    // room and the tile would stay lit. The position it rides is the last
    // one we knew, which is where the pointer still is.
    // A press is news with no movement behind it, exactly like a hover
    // change: you can click without the pointer budging a pixel, and if that
    // did not send, the room would keep drawing a pointing hand at somebody
    // who is holding the button down.
    const relit = (pendK !== sentK || pendD !== sentD || moving || resend) && (moved || ownFx >= 0)
    if (!moved && !relit) return
    if (!moving && !company()) return // alone here: nobody to tell
    const fx = moved ? pendFx : ownFx
    const fy = moved ? pendFy : ownFy
    // `f` only when following: nobody is the default, and absent says it
    // (JSON drops an undefined field)
    const f = myF || undefined
    ws.send(JSON.stringify({ type: 'move', fx, fy, k: pendK, d: pendD, at: pendAt, f }))
    sentK = pendK
    sentD = pendD
    sentAt = pendAt
    sentF = myF
    resend = false
    lastSent = now
    pendFx = -1
  }
  // ---- this tab's selection -> wire (shared highlighting) -------------------
  // app.js hands over the selection already debounced (~100 ms after the
  // last selectionchange) and already anchored (highlight.js ownSelection),
  // null for nothing selected on the page. It is sent only when it CHANGED,
  // and only once the room knows this tab is on the page it names: the room
  // drops a selection on a page its sender is not reading, so a selection
  // sent ahead of the place change that carries this tab there would be lost.
  let pendSel = null
  const NO_SEL = { at: null }
  let sentSel = '' // the selection the room holds, as its JSON; '' for none
  function select(sel) {
    pendSel = sel ?? null
  }
  function pumpSel() {
    const key = pendSel ? JSON.stringify(pendSel) : ''
    if (key === sentSel) return
    if (pendSel && placeOf(sentAt) !== placeOf(pendSel.at)) return
    // one frame, the selection's six fields, or a bare null `at` for none
    const s = pendSel || NO_SEL
    ws.send(JSON.stringify({ type: 'sel', at: s.at, a: s.a, j: s.j, b: s.b, q: s.q, z: s.z }))
    sentSel = key
  }

  // ---- per-frame: ease, line up, place -------------------------------------
  // THIS TAB'S OWN HAND, DRAWN. Normally it never is: the visitor's hand is
  // the system pointer wearing the hand (cursorImage), and a drawn copy of it
  // would be a second pointer. Two things put it somewhere the pointer is
  // not, and only then is it drawn: following (it walks in the line the room
  // sees it in, so the follower sees the conga it is part of).
  // Pointer-transparent: it is a picture of you, not something to click.
  let ghost = null
  const selfHist = []
  function ghostEl() {
    if (!ghost) {
      ghost = document.createElement('div')
      ghost.className = 'cursor self'
      ghost.style.transformOrigin = '0 0'
      ghost.innerHTML = ARROW
    }
    ghost.style.color = colorOf(selfId)
    return ghost
  }
  const put = (el, host) => {
    if (el.parentNode !== host) host.appendChild(el)
  }
  // a hand at a position {x, y, at}: on a page, fractions of a block's box
  // (and an edge marker when that is off the screen); on the ground, world
  // fractions placed through the torus with the zoom undone about the tip
  function draw(el, r, read) {
    const { camX, camY, WORLD_W, WORLD_H, VW, VH, Z = 1, edge = null } = read
    if (r.at) {
      put(el, pageCursors)
      const pt = locate(r.at, r.x, r.y)
      if (!pt) {
        el.style.display = 'none'
        return
      }
      const top = edge ? edge.top : 0
      const bottom = edge ? edge.bottom : VH
      const up = pt.y < top
      const down = pt.y > bottom
      el.style.display = ''
      el.classList.toggle('edge-up', up)
      el.classList.toggle('edge-down', down)
      const y = up ? top : down ? bottom : pt.y
      const x = Math.min(VW - 1, Math.max(0, pt.x))
      el.style.transform =
        up || down
          ? `translate(${x}px,${y}px) translate(${-EDGE_W / 2}px,${up ? 0 : -EDGE_W}px)`
          : `translate(${x}px,${y}px) translate(${-TIP_X}px,${-TIP_Y}px)`
      return
    }
    put(el, layer)
    const k = 1 / Z // counter-scale: cursors stay screen-sized under zoom
    el.classList.remove('edge-up', 'edge-down')
    const sx = wrapPos(r.x * WORLD_W, camX, WORLD_W, VW, CURSOR * k)
    const sy = wrapPos(r.y * WORLD_H, camY, WORLD_H, VH, CURSOR * k)
    if (sx === null || sy === null) {
      el.style.display = 'none'
    } else {
      el.style.display = ''
      // translate to the world point, undo the scene zoom about it, then
      // seat the tip: the arrow points at the same spot at any zoom
      el.style.transform = `translate(${sx}px,${sy}px) scale(${k}) translate(${-TIP_X}px,${-TIP_Y}px)`
    }
  }

  function frame(read, now) {
    pump(now)
    if (!peers.size) {
      if (ghost) ghost.remove()
      selfHist.length = 0
      return
    }
    // Frame-rate-independent ease: mobile rAF can run at 30fps or stutter, so
    // approach by wall-clock, not a fixed per-frame step. A long gap (returning
    // from a hidden tab) snaps rather than sweeping across the whole world.
    const dt = lastFrameT ? Math.min(now - lastFrameT, 200) : 16
    lastFrameT = now
    const a = 1 - Math.exp(-dt / SMOOTH_TAU)

    // 1. every peer's own hand, eased toward where the room last put it: on
    // a page inside the block's box, on the ground the short way round
    for (const p of peers.values()) {
      if (!p.placed) continue
      if (p.cx === null) {
        p.cx = p.fx
        p.cy = p.fy
      }
      if (p.at) {
        p.cx += (p.fx - p.cx) * a
        p.cy += (p.fy - p.cy) * a
      } else {
        p.cx = ringApproach(p.cx, p.fx, a)
        p.cy = ringApproach(p.cy, p.fy, a)
      }
    }

    // 2. THE LINES (conga.js): who walks behind whom, this tab included,
    // and each head's path recorded while anybody walks it
    const everyone = []
    for (const [id, p] of peers) everyone.push({ id, f: p.f, fs: p.fs })
    if (selfId !== null) everyone.push({ id: selfId, f: myF, fs: selfFs })
    const lines = linesOf(everyone)
    if (lines.has(selfId) && ownFx >= 0) record(selfHist, now, ownFx, ownFy, ownAt)
    else selfHist.length = 0
    for (const [id, p] of peers) {
      if (lines.has(id) && p.placed) record(p.hist, now, p.cx, p.cy, p.at)
      else if (p.hist.length) p.hist.length = 0
    }
    // where each dancer is: one beat behind the one in front, on the head's
    // own path
    const danced = new Map()
    for (const [head, ids] of lines) {
      const hist = head === selfId ? selfHist : peers.get(head)?.hist
      if (!hist || !hist.length) continue
      ids.forEach((id, i) => {
        const s = sampleAt(hist, (i + 1) * GAP_MS)
        if (s) danced.set(id, s)
      })
    }

    // 3. place every hand: a place in line, or its own position
    for (const [id, p] of peers) {
      if (id === selfId) continue
      const dance = danced.get(id)
      if (dance) {
        // somebody in line is not idle, however still their own pointer
        // is: following is what they are doing
        p.el.classList.remove('idle')
      } else {
        if (!p.placed) continue // no position yet, or parked idle: nothing to paint
        const still = now - p.seen
        if (still > GONE_MS) {
          // two minutes unmoved: leave the stage; setPos re-seats it on the next move
          p.el.remove()
          p.placed = false
          continue
        }
        if (still > IDLE_MS) p.el.classList.add('idle')
      }
      const r = dance || { x: p.cx, y: p.cy, at: p.at }
      // a peer somewhere else (on a page while this tab is on the canvas,
      // or the other way about) is in the room and not on this screen
      if (placeOf(r.at) !== myPlace) {
        p.el.style.display = 'none'
        continue
      }
      draw(p.el, r, read)
    }
    // and this tab's own, where the line puts it
    const myDance = danced.get(selfId)
    if (myDance && placeOf(myDance.at) === myPlace) draw(ghostEl(), myDance, read)
    else if (ghost) ghost.remove()
  }

  // the room this tab opens in: app.js knows a session from the URL or the
  // tab's memory before the first socket, so the tab never visits the
  // public room on its way to its own
  want = room && typeof room.code === 'string' ? { ...room } : null
  // the page's count is the public room's; an address that names a session
  // is a different room, and has to hear its own
  if (want) said = null
  connect()
  // pagehide is the reliable leaving signal (fires on bfcache entry, where
  // beforeunload may not); beforeunload stays as the fallback for engines
  // without it. Closing schedules a reconnect via onclose: on a real unload
  // the timer never fires, on a bfcache restore it fires and rejoins.
  const part = () => {
    try {
      ws.close()
    } catch {
      /* nothing to close */
    }
  }
  addEventListener('pagehide', part)
  addEventListener('beforeunload', part)
  return {
    post,
    frame,
    squish,
    front,
    play,
    onPlay,
    feed,
    watch,
    onWatch,
    onSlime,
    watchSky,
    onSky,
    push,
    onCount,
    onData,
    onHover,
    select,
    onSels,
    onSquish,
    onFront,
    onCursor,
    onSelf,
    onPeers,
    onPick,
    peerAt,
    roster,
    mayAct: () => !spectating,
    onSpectate,
    follow,
    goRoom,
    onSession,
    sessionNow: () => sess,
    selfId: () => selfId,
    act,
    onAct,
    now: () => Date.now() + skew,
  }
}

// Shortest-path ease on the [0,1) ring by fraction `a`: crossing the seam takes
// the short way (0.98 -> 0.02 eases forward through the edge, not backward
// across the world).
function ringApproach(cur, target, a) {
  let d = target - cur
  if (d > 0.5) d -= 1
  else if (d < -0.5) d += 1
  const v = cur + d * a
  return ((v % 1) + 1) % 1
}
