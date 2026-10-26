// multiplayer-canvas/dust: a cursor crossing a pixel-type glyph knocks its cells loose; they hop
//   and settle back.
// Inputs: createDust({ now, enabled }); wire(svg, grid) with a pixelText svg and its gridOf grid;
//   under(node, clientX, clientY) on pointer moves.
// Outputs: a handle { wire, tick, at, under, title, scatter } that rewrites the svg path in place.
//   Browser only (setTimeout, the svg DOM).
//
// THE DUST (BIBLE.md section 10): a cursor crossing a glyph or a title
// disturbs the cells under its path. Each lit cell within reach hops one
// cell in a direction the tick decides and settles back a few ticks later;
// the drawing is redrawn from the grid every tick and put back whole when
// the last cell has settled. Nothing fades. The direction and the dwell are
// a hash of the cell and the ROOM's tick (the clock handed to createDust:
// presence.now() on the canvas), so every tab disturbed by the same cursor
// at the same moment draws the same dust: a peer's pointer (relayed with its
// hover key) raises it here exactly as your own does there.
//
// ONE MODULE, TWO HOSTS. The canvas (app.js) and the door pages (js/door.js:
// the 404, the 500 and the login, whose titles are the same pixel face) run
// the same dust. What a host owns is only the clock, which it passes in, and
// whether the dust is on at all (reduced motion, the canvas's ?bare and
// ?nodust), which it answers with `enabled`.
//
// THE DUST SETTLES SLOWLY, AND A SETTLED CELL RESTS. Two
// changes, one for the look and one for the worst case, and they happen to be
// the same change.
//
// A tick is DUST_MS (110ms) and a cell stays displaced for DUST_TTL_MIN to
// DUST_TTL_MIN + DUST_TTL_SPREAD - 1 ticks (18 to 35), so a disturbed letter
// takes two to four seconds to put itself back. A short ttl reassembled the
// glyph in a fraction of a second: less a drift than a twitch.
//
// The ttl is the knob, not the TICK RATE, and that is the whole trick. Slowing
// the clock instead would have made the same number of hops take longer each,
// which is a stutter rather than a drift; the ttl is how long a cell stays
// DISPLACED, so tripling it holds the scatter open without coarsening the
// motion. A cell hops once and waits, it does not wander: tick computes
// the displaced position from the cell's own key every tick, so a long ttl
// is a long absence, never a longer journey.
//
// The REST is the other half. A cell already in the air was skipped, but the
// instant it landed it was fair game again, so a pointer parked on a glyph
// (or a hundred of them crossing one) churned the same cells forever and
// pathFromGrid re-ran every tick for as long as anybody hovered. A landed
// cell now sits out DUST_REST ticks before it can be lifted again. Under one
// cursor that reads as the dust losing interest; under a hundred it is the
// difference between a glyph that settles and one that never stops.
import { gridOf, pathFromGrid } from './pixel-type.js'

export const DUST_MS = 110
// seam: test/dust.test.js
export const DUST_REACH = 2.5
// seam: test/dust.test.js
export const DUST_TTL_MIN = 18
// seam: test/dust.test.js
export const DUST_TTL_SPREAD = 18
// how long a cell stays put after landing, in ticks. It scales with the
// flight: a cell that took four seconds to come home should not be liftable
// half a second later, or a parked pointer churns the same glyph forever.
// seam: test/dust.test.js
export const DUST_REST = 12

// seam: test/dust.test.js
export const hash3 = (x, y, t) =>
  (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(t + 1, 83492791)) >>> 0

const DIR_X = [1, 1, 0, -1, -1, -1, 0, 1]
const DIR_Y = [0, 1, 1, 1, 0, -1, -1, -1]

/**
 * @param {{ now?: () => number, enabled?: () => boolean }} [host] the host's
 *   clock (ms) and whether the dust runs at all
 */
export function createDust({ now = () => Date.now(), enabled = () => true } = {}) {
  // svg -> { g, rest, path, live: Map('x,y' -> {dx, dy, ttl}), rested: Map('x,y' -> tick), timer }
  const dust = new WeakMap()

  function wire(svg, g) {
    if (!svg || !g || !enabled()) return
    const path = svg.querySelector('path')
    if (!path) return
    svg.classList.add('dust')
    dust.set(svg, {
      g,
      rest: path.getAttribute('d'),
      path,
      live: new Map(),
      rested: new Map(),
      timer: 0,
    })
  }

  function tick(svg) {
    const d = dust.get(svg)
    if (!d) return
    const h = d.g.length
    const w = h ? d.g[0].length : 0
    const t = Math.floor(now() / DUST_MS)
    const next = d.g.map((row) => row.slice())
    for (const [key, m] of d.live) {
      const [x, y] = key.split(',').map(Number)
      next[y][x] = false
      const xx = x + m.dx
      const yy = y + m.dy
      if (xx >= 0 && xx < w && yy >= 0 && yy < h) next[yy][xx] = true
      // landed: it is home, and it stays home for a while
      if (--m.ttl <= 0) {
        d.live.delete(key)
        d.rested.set(key, t + DUST_REST)
      }
    }
    d.path.setAttribute('d', d.live.size ? pathFromGrid(next) : d.rest)
    // the rest map is the only thing here that could grow without bound, so it
    // is swept on the tick that empties the glyph rather than kept forever
    if (!d.live.size) for (const [k, until] of d.rested) if (until <= t) d.rested.delete(k)
    d.timer = d.live.size ? setTimeout(() => tick(svg), DUST_MS) : 0
  }

  // the cursor at (px, py) in the glyph's own cells: every lit cell within
  // reach that is neither already in the air nor still resting takes off
  function at(svg, px, py) {
    const d = dust.get(svg)
    if (!d) return
    const h = d.g.length
    const w = h ? d.g[0].length : 0
    if (px < -DUST_REACH || py < -DUST_REACH || px > w + DUST_REACH || py > h + DUST_REACH) return
    const t = Math.floor(now() / DUST_MS)
    let raised = false
    for (
      let y = Math.max(0, Math.floor(py - DUST_REACH));
      y <= Math.min(h - 1, Math.ceil(py + DUST_REACH));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(px - DUST_REACH));
        x <= Math.min(w - 1, Math.ceil(px + DUST_REACH));
        x++
      ) {
        if (!d.g[y][x] || Math.hypot(x + 0.5 - px, y + 0.5 - py) > DUST_REACH) continue
        const key = x + ',' + y
        if (d.live.has(key)) continue // already in the air
        const until = d.rested.get(key)
        if (until !== undefined && until > t) continue // landed, and resting
        const r = hash3(x, y, t)
        const dir = r % 8 // one of the eight neighbours
        d.live.set(key, {
          dx: DIR_X[dir],
          dy: DIR_Y[dir],
          ttl: DUST_TTL_MIN + ((r >> 3) % DUST_TTL_SPREAD),
        })
        raised = true
      }
    if (raised && !d.timer) d.timer = setTimeout(() => tick(svg), DUST_MS)
  }

  // a pointer at a screen point over a node: the dust glyph it holds, if any
  // EVERY glyph the node holds, not the first one. A tile carries one and this
  // read the same either way; the hero carries one per wrapped LINE, so the
  // first-match version tore the top line of the statement and left the rest
  // alone. `at` bails on a point outside its own box, so handing it all of
  // them costs a bounds check each and lands on the one the cursor is over.
  function under(node, clientX, clientY) {
    const svgs = node?.querySelectorAll?.('svg.dust')
    if (!svgs || !svgs.length) return
    for (const svg of svgs) {
      const r = svg.getBoundingClientRect()
      if (!r.width) continue
      const [, , vw, vh] = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number)
      at(svg, ((clientX - r.x) / r.width) * vw, ((clientY - r.y) / r.height) * vh)
    }
  }

  // A PIXEL TITLE IS DUST TOO: the case-study title
  // behaves on its card and on its page the way every other title on the canvas
  // does, one wire per word. pixelTitle draws one svg a word from the words
  // it keeps for readers, so this splits the same words the same way.
  function title(h) {
    if (!h) return
    const words = (h.querySelector('.px-vh')?.textContent || '').split(' ').filter((w) => w !== '')
    h.querySelectorAll('svg.pw').forEach(
      (svg, i) => words[i] && wire(svg, gridOf(words[i], 'display', 0))
    )
  }

  // THE SCATTER, which is both halves of the hero's cycle and its hover.
  // It is the dust with a longer arm: tick already moves a cell by a fixed
  // (dx, dy) for ttl ticks and then puts it back, so a bigger vector is a
  // bigger absence and nothing else has to change. Blowing a glyph apart and
  // letting it come home is therefore the same mechanism as a cursor brushing
  // past it, which is why the hero and the mark scatter in one hand.
  function scatter(svg, spread, ttl) {
    const d = dust.get(svg)
    if (!d) return
    const h = d.g.length
    const w = h ? d.g[0].length : 0
    const t = Math.floor(now() / DUST_MS)
    let any = false
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!d.g[y][x]) continue
        const key = x + ',' + y
        if (d.live.has(key)) continue
        const r = hash3(x, y, t)
        // a vector anywhere in the square, never (0,0): a cell that does not
        // move is a cell that did not take part
        const dx = (r % (2 * spread + 1)) - spread || 1
        const dy = ((r >> 5) % (2 * spread + 1)) - spread || -1
        d.live.set(key, { dx, dy, ttl: ttl + ((r >> 11) % 6) })
        any = true
      }
    if (any && !d.timer) d.timer = setTimeout(() => tick(svg), DUST_MS)
  }

  return { wire, tick, at, under, title, scatter }
}
