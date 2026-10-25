// THE ABYSS (BIBLE.md section 10): the not-found page is a piece of the ground,
// and the ground is thin. A cursor (or a finger) moving over it carves the
// page away a cell at a time, and what is under the page is black.
//
// It is the same grammar as everything else on the ground, run on the page
// itself: the page is a lattice of pixels, and the pixel is the one a door's
// title is drawn in (CELL cells of --cv-px, so the letters and the ground they
// stand on are one grain), a brush takes the cells under its path the way the
// dust takes the cells of a glyph, and the edge of the brush goes by the 4x4
// Bayer order the kit's dither is drawn in, so a hole has the stippled rim of
// a picture on a screen of cells and not the smooth one of a circle. A cell
// that is carved is gone for the visit: the page is made of the same cells it
// was and refills when it is loaded again.
//
// The words stand on a piece of the page that is never carved: the host says
// which boxes (the plate the title, the line and the ways out are set on) and
// they are kept to the cell, so the black stops at a lattice line and never
// meets a letter or a key. A key sitting on black would be ink on ink.
//
// This file is the buffer and the drawing of it. It holds no DOM of its own
// apart from the canvas it is handed, and takes everything it would read off
// the page (the cell, the two inks, the size, the boxes to keep, the clock,
// whether motion is wanted) as arguments, so that the same code is what the
// door runs and what the tests turn by hand (js/door.js is the page's side).
import { bayerLit } from 'multiplayer-canvas/dither'
import { DUST_MS, hash3 } from 'multiplayer-canvas/dust'

// the page's pixel, in cells of --cv-px: two, which is what a door's title is
// set at (--tpx in canvas.css), so a letter and the ground are one grain
// seam: test/abyss.test.js
export const CELL = 2
// the brush's radius, in page pixels: a mouse, and a finger, which is wider
// seam: test/abyss.test.js
export const BRUSH = 4
// seam: test/abyss.test.js
export const BRUSH_TOUCH = 6
// the share of the brush's radius that goes whole; beyond it the rim goes by
// the Bayer order, from most of its cells at the core's edge to none at the rim
// seam: test/abyss.test.js
export const CORE = 0.5
// a carved cell in SPRAY comes away as a crumb: it hops a cell a tick, away
// from the brush, for a few ticks, and is gone. Nothing fades.
// seam: test/abyss.test.js
export const SPRAY = 4
// seam: test/abyss.test.js
export const CRUMB_MIN = 4
// seam: test/abyss.test.js
export const CRUMB_SPREAD = 6
// the crumbs the page holds in the air at once
// seam: test/abyss.test.js
export const CRUMB_CAP = 360

/** The carved cells of a page of `cols` by `rows`. */
// seam: test/abyss.test.js
export function createAbyss(cols, rows) {
  let w = cols
  let h = rows
  let carved = new Uint8Array(w * h)
  let kept = new Uint8Array(w * h)

  const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && carved[y * w + x] === 1

  // The brush at (cx, cy), in cells, radius r: the cells it takes that were
  // not already gone, as a flat [x, y, x, y, ...]. Every cell whose centre is
  // within CORE of the radius goes; between that and the rim a cell goes if the
  // Bayer order says its coverage (1 at the core's edge, 0 at the rim) is lit.
  // A cell the page keeps is never taken.
  function dig(cx, cy, r) {
    const out = []
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        const i = y * w + x
        if (carved[i] || kept[i]) continue
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (d > r) continue
        const coverage = Math.min(1, (r - d) / (r * (1 - CORE)))
        if (!bayerLit(coverage, x, y)) continue
        carved[i] = 1
        out.push(x, y)
      }
    return out
  }

  // the brush along a line, a cell a step at most, so a fast hand leaves a
  // trail and not a row of dabs
  function stroke(x0, y0, x1, y1, r) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
    const out = []
    for (let i = 0; i <= n; i++) {
      const cells = dig(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, r)
      for (let j = 0; j < cells.length; j++) out.push(cells[j])
    }
    return out
  }

  // The page that stays: boxes of cells, [x0, y0, x1, y1) each, which the brush
  // never takes. What was carved inside one is page again. Each call says all
  // of them, so it replaces the last: a box moves when the layout does.
  function keep(boxes) {
    kept = new Uint8Array(w * h)
    for (const [x0, y0, x1, y1] of boxes)
      for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
          kept[y * w + x] = 1
          carved[y * w + x] = 0
        }
  }

  // a page that changes size keeps what was carved where it still is; the
  // boxes are the host's to say again, for they move with the layout
  function resize(cols2, rows2) {
    const next = new Uint8Array(cols2 * rows2)
    for (let y = 0; y < Math.min(h, rows2); y++)
      for (let x = 0; x < Math.min(w, cols2); x++) next[y * cols2 + x] = carved[y * w + x]
    carved = next
    kept = new Uint8Array(cols2 * rows2)
    w = cols2
    h = rows2
  }

  // every carved cell, for a repaint, as the same flat list
  function all() {
    const out = []
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (carved[y * w + x]) out.push(x, y)
    return out
  }

  return {
    has,
    dig,
    stroke,
    keep,
    resize,
    all,
    get cols() {
      return w
    },
    get rows() {
      return h
    },
  }
}

// The crumbs a brush at (cx, cy) throws off the cells it just took: one in
// SPRAY, each hopping away from the centre (with a turn to either side the
// hash decides) for CRUMB_MIN to CRUMB_MIN + CRUMB_SPREAD - 1 ticks. `room` is
// how many more the page will hold. The direction and the dwell are a hash of
// the cell and the tick, as the dust's are. Which cells come away is read off
// the hash's high bits: its low ones are only the cell's own residues, and a
// handful picked by them would stand on a lattice.
// seam: test/abyss.test.js
export function spray(cells, cx, cy, tick, room = CRUMB_CAP) {
  const out = []
  for (let i = 0; i < cells.length && out.length < room; i += 2) {
    const x = cells[i]
    const y = cells[i + 1]
    const r = hash3(x, y, tick)
    if ((r >>> 16) % SPRAY) continue
    const away = (v) => Math.sign(v) || 1
    const turn = (n) => ((r >>> n) % 3) - 1
    const ax = away(x + 0.5 - cx)
    const ay = away(y + 0.5 - cy)
    const dx = Math.max(-1, Math.min(1, ax + turn(3)))
    const dy = Math.max(-1, Math.min(1, ay + turn(5)))
    out.push({
      x,
      y,
      // a crumb that did not move is a cell that did not come away
      dx: dx || dy ? dx : ax,
      dy,
      ttl: CRUMB_MIN + ((r >>> 9) % CRUMB_SPREAD),
    })
  }
  return out
}

// A cell's box on the canvas in device pixels. The edges are rounded, not the
// size, so neighbours tile whatever the ratio: at 2.625 a cell of four is ten
// pixels or eleven, and never a seam or an overlap between two.
// seam: test/abyss.test.js
export function cellRect(x, y, cell, dpr) {
  const x0 = Math.round(x * cell * dpr)
  const y0 = Math.round(y * cell * dpr)
  return [x0, y0, Math.round((x + 1) * cell * dpr) - x0, Math.round((y + 1) * cell * dpr) - y0]
}

/**
 * Mount the abyss on a canvas that covers the page.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} host what the page hands over
 * @param {EventTarget} host.pointer where the pointer is heard (the root element, which hears it leave)
 * @param {() => {w: number, h: number, dpr: number}} host.size the canvas's box, in css px
 * @param {() => number[][]} [host.keep] the boxes of page that stay, [left, top, right, bottom] in css px from the canvas's corner
 * @param {number} host.cell the page's pixel, in css px (CELL cells of --cv-px)
 * @param {string} host.ink the black under the page
 * @param {string} host.ground the page's own colour, which a crumb is (it shows over the black)
 * @param {() => boolean} [host.reduced] no motion: the page is carved, and nothing flies
 * @param {() => number} [host.now]
 */
export function mountAbyss(canvas, host) {
  const {
    pointer,
    size,
    keep = () => [],
    cell,
    ink,
    ground,
    reduced = () => false,
    now = () => Date.now(),
  } = host
  const ctx = canvas.getContext('2d')
  let dpr = 1
  const abyss = createAbyss(1, 1)
  let crumbs = []
  let timer = 0
  let last = null

  // a cell as the page is at it: ink if it is carved, the page showing through if not
  function paintCell(x, y) {
    const [px, py, pw, ph] = cellRect(x, y, cell, dpr)
    if (abyss.has(x, y)) {
      ctx.fillStyle = ink
      ctx.fillRect(px, py, pw, ph)
    } else ctx.clearRect(px, py, pw, ph)
  }
  function paintCells(cells) {
    ctx.fillStyle = ink
    for (let i = 0; i < cells.length; i += 2) {
      const [px, py, pw, ph] = cellRect(cells[i], cells[i + 1], cell, dpr)
      ctx.fillRect(px, py, pw, ph)
    }
  }

  // the canvas is the page's size and the lattice starts at its corner; the
  // boxes the page keeps are rounded outward to the cell, so what is kept is
  // never less than the box
  function fit() {
    const s = size()
    dpr = s.dpr
    canvas.width = Math.max(1, Math.round(s.w * dpr))
    canvas.height = Math.max(1, Math.round(s.h * dpr))
    abyss.resize(Math.ceil(s.w / cell), Math.ceil(s.h / cell))
    abyss.keep(
      keep().map(([l, t, r, b]) => [
        Math.floor(l / cell),
        Math.floor(t / cell),
        Math.ceil(r / cell),
        Math.ceil(b / cell),
      ])
    )
    paintCells(abyss.all())
  }

  // the crumbs, a cell a tick: first every one is put back as the page is
  // there, then every one that is still in the air is drawn where it now is,
  // so two crumbs that cross do not rub each other out
  function tickCrumbs() {
    for (const c of crumbs) paintCell(c.x, c.y)
    crumbs = crumbs.filter((c) => {
      c.x += c.dx
      c.y += c.dy
      return --c.ttl > 0 && c.x >= 0 && c.y >= 0 && c.x < abyss.cols && c.y < abyss.rows
    })
    // a crumb is the page's own colour, so it shows only over the black: over
    // the page that is left it is ground on ground, and there is nothing to draw
    ctx.fillStyle = ground
    for (const c of crumbs) {
      if (!abyss.has(c.x, c.y)) continue
      const [px, py, pw, ph] = cellRect(c.x, c.y, cell, dpr)
      ctx.fillRect(px, py, pw, ph)
    }
    timer = crumbs.length ? setTimeout(tickCrumbs, DUST_MS) : 0
  }

  function onMove(e) {
    const box = canvas.getBoundingClientRect()
    const at = { x: (e.clientX - box.left) / cell, y: (e.clientY - box.top) / cell }
    const r = e.pointerType === 'touch' ? BRUSH_TOUCH : BRUSH
    const from = last || at
    const cells = abyss.stroke(from.x, from.y, at.x, at.y, r)
    last = at
    if (!cells.length) return
    paintCells(cells)
    if (reduced()) return
    const room = CRUMB_CAP - crumbs.length
    if (room <= 0) return
    crumbs.push(...spray(cells, at.x, at.y, Math.floor(now() / DUST_MS), room))
    if (crumbs.length && !timer) timer = setTimeout(tickCrumbs, DUST_MS)
  }
  // a hand that leaves the page, or lets go, does not draw a line back to where it was
  const lift = () => {
    last = null
  }

  pointer.addEventListener('pointermove', onMove, { passive: true })
  pointer.addEventListener('pointerdown', onMove, { passive: true })
  pointer.addEventListener('pointerup', lift, { passive: true })
  pointer.addEventListener('pointercancel', lift, { passive: true })
  pointer.addEventListener('pointerleave', lift, { passive: true })
  fit()

  return { abyss, fit }
}
