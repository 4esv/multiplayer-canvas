// test/abyss.test.js
// THE ABYSS (BIBLE.md section 10, canvas/abyss.js). The not-found page is thin
// ground: a pointer, or a finger, carves it away a cell at a time and what is
// under it is black. The brush takes the cells under its path, goes by the
// Bayer order at its rim, and throws off crumbs that hop away over the black;
// the words stand on a plate the carve is told to keep, to the cell.
//
// What is held: the buffer (the brush, the stroke, the page that stays, a
// page that changes size), the crumbs, the tiling of a cell on a screen of
// any ratio, the mount against a stand-in for the canvas and a clock the test
// turns by hand, and that the page runs it (the door's script, the 404's
// markup and its CSS, and the one pixel the carve and a door's title share).
import { describe, it, before, after, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BRUSH,
  BRUSH_TOUCH,
  CELL,
  CORE,
  CRUMB_CAP,
  CRUMB_MIN,
  CRUMB_SPREAD,
  SPRAY,
  cellRect,
  createAbyss,
  mountAbyss,
  spray,
} from '../src/static/canvas/abyss.js'
import { DUST_MS } from '../primitives/dust.js'
import { build } from '../src/server.js'

const ROOT = join(import.meta.dirname, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const DOOR = read('src/static/js/door.js')
const MODULE = read('src/static/canvas/abyss.js')
const CSS = read('src/static/css/canvas.css')

// rule bodies by their selector, from the first place the selector starts a line
const rule = (css, selector) => {
  const at = css.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'))
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1)
}

const pairs = (flat) => {
  const out = []
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  return out
}

afterEach(() => mock.timers.reset())

describe('the brush', () => {
  // mutation: abyss.rim-is-whole
  it('takes the core whole and the rim stippled, and nothing past its radius', () => {
    const a = createAbyss(40, 40)
    const r = BRUSH
    const taken = pairs(a.dig(20, 20, r))
    for (const [x, y] of taken)
      assert.ok(Math.hypot(x + 0.5 - 20, y + 0.5 - 20) <= r, `(${x}, ${y}) is past the radius`)
    let rim = 0
    let rimTaken = 0
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20)
        if (d <= r * CORE) assert.ok(a.has(x, y), `(${x}, ${y}) is in the core and is still there`)
        else if (d <= r) {
          rim++
          if (a.has(x, y)) rimTaken++
        }
      }
    assert.ok(rimTaken > 0 && rimTaken < rim, `the rim took ${rimTaken} of ${rim}: not a stipple`)
  })

  it('takes a cell once: a second pass over the same ground finds it gone', () => {
    const a = createAbyss(40, 40)
    assert.ok(a.dig(20, 20, BRUSH).length > 0)
    assert.deepEqual(a.dig(20, 20, BRUSH), [])
  })

  // mutation: abyss.stroke-dabs
  it('leaves a trail along a stroke, however far the hand went between two readings', () => {
    const a = createAbyss(70, 40)
    a.stroke(5, 20, 60, 20, BRUSH)
    for (let x = 5; x <= 60; x++)
      assert.ok(a.has(x, 19) && a.has(x, 20), `a gap in the trail at column ${x}`)
  })

  it('clamps to the page: a brush off an edge takes what is on it and nothing else', () => {
    const a = createAbyss(10, 10)
    assert.deepEqual(a.dig(-20, -20, BRUSH), [])
    for (const [cx, cy] of [
      [0.5, 0.5],
      [9.5, 9.5],
      [-1, 5],
      [5, 12],
    ])
      for (const [x, y] of pairs(a.dig(cx, cy, BRUSH)))
        assert.ok(x >= 0 && y >= 0 && x < 10 && y < 10, `(${x}, ${y}) is off the page`)
  })
})

describe('the page that stays', () => {
  // mutation: abyss.kept-is-taken
  it('is never taken, and the black stops at its edge', () => {
    const a = createAbyss(20, 20)
    a.keep([[8, 8, 14, 14]])
    const taken = pairs(a.stroke(0, 11, 20, 11, BRUSH))
    assert.ok(taken.length > 0, 'the stroke took nothing at all')
    for (const [x, y] of taken)
      assert.ok(!(x >= 8 && x < 14 && y >= 8 && y < 14), `(${x}, ${y}) is inside the kept box`)
    assert.ok(a.has(7, 11) && a.has(14, 11), 'the black does not reach the box on either side')
  })

  // mutation: abyss.keep-leaves-the-black
  it('is page again if it was carved before the box came to it', () => {
    const a = createAbyss(20, 20)
    a.dig(7, 7, BRUSH)
    assert.ok(a.has(7, 7), 'nothing was carved to begin with')
    a.keep([[6, 6, 9, 9]])
    for (let y = 6; y < 9; y++)
      for (let x = 6; x < 9; x++) assert.ok(!a.has(x, y), `(${x}, ${y}) is still black`)
    assert.ok(a.has(5, 7) && a.has(7, 5), 'what is outside the box was put back too')
  })

  // mutation: abyss.keep-accumulates
  it('is said again in full: a new set of boxes replaces the last', () => {
    const a = createAbyss(20, 20)
    a.keep([[2, 2, 8, 8]])
    a.keep([[12, 12, 16, 16]])
    a.dig(5, 5, BRUSH)
    assert.ok(a.has(5, 5), 'the first box is still kept')
    for (const [x, y] of pairs(a.dig(14, 14, BRUSH)))
      assert.ok(!(x >= 12 && x < 16 && y >= 12 && y < 16), `(${x}, ${y}) is inside the second box`)
  })

  it('clamps to the page and takes boxes it half has', () => {
    const a = createAbyss(10, 10)
    a.keep([
      [-5, -5, 3, 3],
      [8, 8, 99, 99],
    ])
    assert.deepEqual(a.dig(1, 1, 1), [])
    assert.deepEqual(a.dig(9, 9, 1), [])
    assert.ok(pairs(a.dig(5, 5, 1)).length > 0)
  })
})

describe('a page that changes size', () => {
  // mutation: abyss.resize-forgets
  it('keeps what was carved where it still is, and loses what it no longer holds', () => {
    const a = createAbyss(20, 20)
    a.dig(5, 5, 1)
    a.resize(30, 25)
    assert.equal([a.cols, a.rows].join('x'), '30x25')
    assert.ok(a.has(5, 5), 'a bigger page forgot what was carved')
    a.resize(4, 4)
    assert.ok(!a.has(5, 5))
    a.resize(30, 25)
    assert.ok(!a.has(5, 5), 'a cell that was off the page came back')
  })

  it('says its boxes again after, for they move with the layout', () => {
    const a = createAbyss(20, 20)
    a.keep([[2, 2, 8, 8]])
    a.resize(20, 20)
    a.dig(5, 5, BRUSH)
    assert.ok(a.has(5, 5), 'a box outlived the size it was said for')
  })
})

describe('the crumbs', () => {
  const block = () => {
    const cells = []
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) cells.push(x, y)
    return cells
  }

  // mutation: abyss.spray-all
  it('come off one cell in SPRAY, each on a cell it was given', () => {
    const cells = block()
    let n = 0
    for (let tick = 0; tick < 20; tick++) {
      const crumbs = spray(cells, 20, 20, tick, Infinity)
      n += crumbs.length
      for (const c of crumbs) assert.ok(c.x >= 0 && c.x < 40 && c.y >= 0 && c.y < 40)
    }
    const share = n / (20 * 1600)
    assert.ok(Math.abs(share - 1 / SPRAY) < 0.03, `${share.toFixed(3)} of the cells came away`)
  })

  // mutation: abyss.spray-dwell-signed
  it('hop for CRUMB_MIN to CRUMB_MIN + CRUMB_SPREAD - 1 ticks, whatever the hash', () => {
    const seen = new Set()
    for (let tick = 0; tick < 60; tick++)
      for (const c of spray(block(), 20, 20, tick)) {
        assert.ok(
          c.ttl >= CRUMB_MIN && c.ttl < CRUMB_MIN + CRUMB_SPREAD,
          `a dwell of ${c.ttl} ticks`
        )
        seen.add(c.ttl)
      }
    assert.equal(seen.size, CRUMB_SPREAD, 'not every dwell in the range is ever drawn')
  })

  // mutation: abyss.spray-toward, abyss.spray-stands-still
  it('hop away from the brush, never toward it, and never stand still', () => {
    for (let tick = 0; tick < 30; tick++)
      for (const c of spray(block(), 20, 20, tick)) {
        assert.ok(c.dx || c.dy, 'a crumb that did not move')
        assert.ok(Math.abs(c.dx) <= 1 && Math.abs(c.dy) <= 1, 'a crumb that hopped two')
        if (c.x + 0.5 > 20) assert.ok(c.dx >= 0, `(${c.x}, ${c.y}) hops toward the brush`)
        if (c.x + 0.5 < 20) assert.ok(c.dx <= 0, `(${c.x}, ${c.y}) hops toward the brush`)
        if (c.y + 0.5 > 20) assert.ok(c.dy >= 0, `(${c.x}, ${c.y}) hops toward the brush`)
        if (c.y + 0.5 < 20) assert.ok(c.dy <= 0, `(${c.x}, ${c.y}) hops toward the brush`)
      }
  })

  // mutation: abyss.spray-clock-ignored
  it('are the cell and the tick: the same hand at another moment throws another handful', () => {
    const key = (tick) =>
      spray(block(), 20, 20, tick)
        .map((c) => `${c.x},${c.y},${c.dx},${c.dy},${c.ttl}`)
        .join('|')
    assert.equal(key(7), key(7))
    for (const tick of [8, 99, 40000]) assert.notEqual(key(tick), key(7))
  })

  // mutation: abyss.spray-cap-ignored
  it('are no more than the page has room for', () => {
    assert.equal(spray(block(), 20, 20, 3, 0).length, 0)
    assert.equal(spray(block(), 20, 20, 3, 5).length, 5)
    assert.ok(spray(block(), 20, 20, 3).length <= CRUMB_CAP)
  })
})

describe('a cell on a screen', () => {
  // mutation: abyss.cell-seams
  it('tiles with its neighbours at any ratio: edges are rounded, never the size', () => {
    for (const [cell, dpr] of [
      [8, 1],
      [8, 1.3],
      [4, 2.625],
      [6, 1.25],
      [8, 2],
      [10, 1.5],
      [8, 3],
    ]) {
      let edge = 0
      for (let x = 0; x < 60; x++) {
        const [x0, , w] = cellRect(x, 0, cell, dpr)
        assert.equal(x0, edge, `cell ${x} at ${cell}px x ${dpr} starts off the last one's edge`)
        assert.ok(
          w === Math.floor(cell * dpr) || w === Math.ceil(cell * dpr),
          `cell ${x} is ${w} wide at ${cell}px x ${dpr}`
        )
        edge = x0 + w
        const [, y0, , h] = cellRect(0, x, cell, dpr)
        const [, y1] = cellRect(0, x + 1, cell, dpr)
        assert.equal(y0 + h, y1, `rows ${x} and ${x + 1} do not meet at ${cell}px x ${dpr}`)
      }
      assert.equal(edge, Math.round(60 * cell * dpr), 'sixty cells are not sixty cells wide')
    }
  })
})

// a stand-in for just what the mount touches of a canvas, its context and the
// pointer it listens on; the page is 800 by 480 and a cell is 8
function stage({ left = 0, top = 0, w = 800, h = 480, dpr = 1, ...host } = {}) {
  const ops = []
  const ctx = {
    fillStyle: '',
    fillRect(x, y, wd, ht) {
      ops.push({ op: 'fill', color: this.fillStyle, x, y, w: wd, h: ht })
    },
    clearRect(x, y, wd, ht) {
      ops.push({ op: 'clear', x, y, w: wd, h: ht })
    },
  }
  // nothing fades
  Object.defineProperty(ctx, 'globalAlpha', {
    set() {
      throw new Error('the page does not fade')
    },
  })
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      left,
      top,
      right: left + w,
      bottom: top + h,
      width: w,
      height: h,
    }),
  }
  const pointer = new EventTarget()
  const size = { w, h, dpr }
  const mount = mountAbyss(canvas, {
    pointer,
    size: () => ({ ...size }),
    cell: 8,
    ink: INK,
    ground: GROUND,
    // the same tick on every run, so the crumbs a stroke throws are the same
    now: () => 20000 * DUST_MS,
    ...host,
  })
  const fire = (type, x = 0, y = 0, pointerType = 'mouse') =>
    pointer.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, pointerType }))
  return {
    canvas,
    ops,
    size,
    mount,
    abyss: mount.abyss,
    fire,
    move: (x, y, pointerType) => fire('pointermove', x, y, pointerType),
  }
}
const INK = '#111111'
const GROUND = '#cccccc'

const count = (abyss) => abyss.all().length / 2
// what the canvas shows at each cell once every operation is replayed: the
// last thing drawn there, at the one pixel to the cell
const shown = (ops, cell = 8) => {
  const at = new Map()
  for (const o of ops) at.set(`${o.x / cell},${o.y / cell}`, o.op === 'fill' ? o.color : 'clear')
  return at
}
const tickFor = (n) => {
  for (let i = 0; i < n; i++) mock.timers.tick(DUST_MS)
}

describe('the page, mounted', () => {
  // no real timer is ever armed here: a crumb clock that never stops (a mutant's)
  // would otherwise keep the test process alive for good
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }))

  // mutation: abyss.canvas-css-size
  it('sizes its canvas to the page in device pixels, and its lattice to the cell', () => {
    const s = stage({ w: 390, h: 844, dpr: 2.625 })
    assert.equal(s.canvas.width, Math.round(390 * 2.625))
    assert.equal(s.canvas.height, Math.round(844 * 2.625))
    assert.equal(
      [s.abyss.cols, s.abyss.rows].join('x'),
      `${Math.ceil(390 / 8)}x${Math.ceil(844 / 8)}`
    )
  })

  // mutation: abyss.paint-forgotten
  it('carves under the pointer and paints what it took in the ink, a cell at a time', () => {
    const s = stage()
    s.move(200, 200)
    assert.ok(count(s.abyss) > 20, 'a pointer on the page took next to nothing')
    const fills = s.ops.filter((o) => o.op === 'fill')
    assert.equal(fills.length, count(s.abyss), 'a cell was painted twice or not at all')
    for (const o of fills) {
      assert.equal(o.color, INK)
      assert.ok(s.abyss.has(o.x / 8, o.y / 8), 'a cell was painted that is not carved')
      assert.deepEqual([o.w, o.h], [8, 8])
    }
    assert.ok(s.abyss.has(25, 25), 'the cell under the pointer is not carved')
  })

  // mutation: abyss.canvas-corner-ignored
  it('reads the pointer from the canvas`s corner, not the window`s', () => {
    const s = stage({ left: 100, top: 50 })
    s.move(100 + 8 * 5.5, 50 + 8 * 7.5)
    assert.ok(s.abyss.has(5, 7), 'the cell under the pointer is not carved')
    assert.ok(!s.abyss.has(18, 13), 'the carve is where the window says, not where the page is')
  })

  // mutation: abyss.touch-narrow
  it('takes a wider brush for a finger than for a mouse', () => {
    const mouse = stage()
    mouse.move(200, 200, 'mouse')
    const touch = stage()
    touch.move(200, 200, 'touch')
    assert.ok(BRUSH_TOUCH > BRUSH)
    assert.ok(count(touch.abyss) > count(mouse.abyss), 'a finger took no more than a mouse')
  })

  // mutation: abyss.down-ignored
  it('takes a cell where a finger lands, before it moves', () => {
    const s = stage()
    s.fire('pointerdown', 200, 200, 'touch')
    assert.ok(count(s.abyss) > 0, 'a landing did nothing')
  })

  // mutation: abyss.lift-forgets, abyss.leave-unheard
  it('does not draw a line back to where a hand was before it left the page or let go', () => {
    for (const lift of ['pointerleave', 'pointerup', 'pointercancel']) {
      const s = stage()
      s.move(40, 100)
      s.fire(lift)
      s.move(600, 100)
      assert.ok(!s.abyss.has(40, 12), `${lift}: a line was drawn between the two`)
    }
    const s = stage()
    s.move(40, 100)
    s.move(600, 100)
    assert.ok(s.abyss.has(40, 12), 'a hand that stays down leaves a trail')
  })

  // mutation: abyss.crumb-over-the-page, abyss.crumb-not-put-back
  it('throws crumbs of the page`s own colour that show only over the black and leave it whole', () => {
    const s = stage()
    s.move(200, 200)
    const carved = count(s.abyss)
    const from = s.ops.length
    tickFor(CRUMB_MIN + CRUMB_SPREAD + 2)
    const flown = s.ops.slice(from)
    const crumbs = flown.filter((o) => o.op === 'fill' && o.color === GROUND)
    assert.ok(crumbs.length > 0, 'nothing flew')
    for (const o of crumbs)
      assert.ok(
        s.abyss.has(o.x / 8, o.y / 8),
        `a crumb was drawn at (${o.x / 8}, ${o.y / 8}), over the page`
      )
    for (const o of flown) assert.ok(o.op === 'clear' || [INK, GROUND].includes(o.color))
    // and when the last has gone, every carved cell shows the black and nothing else shows a thing
    assert.equal(count(s.abyss), carved, 'a crumb took a cell of its own')
    for (const [cell, color] of shown(s.ops)) {
      const [x, y] = cell.split(',').map(Number)
      assert.equal(color, s.abyss.has(x, y) ? INK : 'clear', `(${x}, ${y}) is not as the page is`)
    }
  })

  // mutation: abyss.crumbs-never-land
  it('puts every crumb away: no timer is armed with nothing in the air, and the next stroke arms one', () => {
    const armed = []
    const real = globalThis.setTimeout
    globalThis.setTimeout = (...a) => (armed.push(a[1]), real(...a))
    try {
      const s = stage()
      s.move(200, 200)
      tickFor(CRUMB_MIN + CRUMB_SPREAD + 2)
      const settled = armed.length
      assert.ok(settled > 0, 'nothing was ever armed')
      tickFor(10)
      assert.equal(armed.length, settled, 'a timer is still armed with nothing in the air')
      s.move(400, 300)
      assert.ok(armed.length > settled, 'the next stroke did not arm one')
    } finally {
      globalThis.setTimeout = real
    }
  })

  // mutation: abyss.reduced-flies
  it('carves for a visitor who asked for no motion, and nothing flies', () => {
    const s = stage({ reduced: () => true })
    s.move(200, 200)
    assert.ok(count(s.abyss) > 20)
    tickFor(CRUMB_MIN + CRUMB_SPREAD + 2)
    assert.equal(
      s.ops.filter((o) => o.color === GROUND).length,
      0,
      'a crumb flew for a visitor who asked for no motion'
    )
  })

  // mutation: abyss.reduced-read-once
  it('asks again each time whether motion is wanted', () => {
    let reduced = true
    const s = stage({ reduced: () => reduced })
    s.move(100, 100)
    tickFor(CRUMB_MIN + CRUMB_SPREAD + 2)
    assert.equal(s.ops.filter((o) => o.color === GROUND).length, 0)
    reduced = false
    s.move(500, 300)
    tickFor(1)
    assert.ok(s.ops.filter((o) => o.color === GROUND).length > 0, 'it was asked once, at the mount')
  })

  // mutation: abyss.cap-ignored
  it('holds no more crumbs in the air than the page has room for', () => {
    const s = stage({ w: 4000, h: 800 })
    for (const y of [100, 300, 500]) {
      s.move(10, y)
      s.move(3900, y)
      s.fire('pointerleave')
    }
    assert.ok(count(s.abyss) > 10 * CRUMB_CAP, 'the strokes did not take enough to fill the air')
    const from = s.ops.length
    tickFor(1)
    const grounded = s.ops.slice(from).filter((o) => o.op === 'fill' && o.color === GROUND)
    assert.ok(grounded.length > 0 && grounded.length <= CRUMB_CAP, `${grounded.length} in the air`)
  })

  // mutation: abyss.fit-forgets-paint
  it('repaints what was carved when the page changes size, on the new lattice', () => {
    const s = stage()
    s.move(200, 200)
    const carved = count(s.abyss)
    s.size.w = 1000
    s.size.h = 600
    s.ops.length = 0
    s.mount.fit()
    assert.equal(s.canvas.width, 1000)
    assert.equal([s.abyss.cols, s.abyss.rows].join('x'), '125x75')
    assert.equal(count(s.abyss), carved, 'a bigger page forgot what was carved')
    assert.equal(
      s.ops.filter((o) => o.op === 'fill').length,
      carved,
      'the repaint is not the carve'
    )
  })

  // mutation: abyss.keep-rounds-in
  it('keeps the boxes it is told to, rounded outward to the cell', () => {
    // 83 to 157 is cells 10 to 19: the box is never less than what was said
    const s = stage({ keep: () => [[83, 83, 157, 157]] })
    s.move(8 * 9.5, 40)
    s.move(8 * 9.5, 200)
    s.fire('pointerleave')
    s.move(8 * 20.5, 40)
    s.move(8 * 20.5, 200)
    assert.ok(s.abyss.has(9, 14) && s.abyss.has(20, 14), 'the black does not reach the box')
    for (const [x, y] of [
      [10, 14],
      [11, 14],
      [19, 14],
      [18, 14],
    ])
      assert.ok(!s.abyss.has(x, y), `(${x}, ${y}) is inside the box and was taken`)
  })

  // mutation: abyss.keep-read-once
  it('asks again where the boxes are each time the page is fitted', () => {
    let box = [[0, 0, 80, 80]]
    const s = stage({ keep: () => box })
    s.move(20, 20)
    assert.equal(count(s.abyss), 0, 'the first box was not kept')
    box = [[400, 400, 480, 480]]
    s.mount.fit()
    s.move(20, 20)
    assert.ok(count(s.abyss) > 0, 'the old box is still kept')
  })
})

describe('the page runs it', () => {
  let app
  before(async () => {
    app = await build({ logger: false })
    app.get('/__boom-abyss__', async () => {
      throw new Error('boom-abyss')
    })
    await app.ready()
  })
  after(async () => {
    await app.close()
  })

  // mutation: abyss.template-canvas-lost, abyss.template-plate-lost, abyss.template-canvas-spoken
  it('the 404 is a canvas, aria-hidden, behind a plate that holds the title, the line and the keys', async () => {
    const r = await app.inject({ method: 'GET', url: '/nonexistent-door' })
    assert.equal(r.statusCode, 404)
    const main = r.body.match(/<main class="cv-door cv-lost">([\s\S]*?)<\/main>/)
    assert.ok(main, 'the 404 is not a lost door')
    const canvas = main[1].indexOf('<canvas class="cv-abyss" aria-hidden="true"></canvas>')
    const plate = main[1].indexOf('<div class="cv-plate">')
    assert.ok(canvas > -1, 'no canvas, or one a reader can find')
    assert.ok(plate > canvas, 'the plate is not after the canvas, so it would sit under it')
    for (const part of ['<h1 class="ptitle', 'class="cv-status"', 'class="k-bank"'])
      assert.ok(main[1].indexOf(part) > plate, `${part} is not on the plate`)
    assert.equal((main[1].match(/<canvas/g) ?? []).length, 1)
  })

  it('the 500 and the login are not carved', async () => {
    for (const url of ['/__boom-abyss__', '/login']) {
      const r = await app.inject({ method: 'GET', url })
      assert.doesNotMatch(r.body, /cv-abyss|cv-plate|cv-lost/, url)
    }
  })
})

describe('the door starts it', () => {
  // mutation: abyss.door-forced-colours-mounts
  it('only where there is a canvas and a plate, and no forced palette', () => {
    assert.match(DOOR, /import \{ CELL, mountAbyss \} from '\/canvas\/abyss\.js'/)
    assert.match(
      DOOR,
      /if \(field && plate && !matchMedia\('\(forced-colors: active\)'\)\.matches\) \{/
    )
  })

  // mutation: abyss.door-pointer-is-the-canvas
  it('hears the pointer on the root element, which is where it is heard to leave', () => {
    assert.match(DOOR, /pointer: document\.documentElement,/)
  })

  // mutation: abyss.door-cell-off-lattice, abyss.door-hex-ink
  it('reads its pixel and its two inks off the page, and the pixel is CELL cells', () => {
    assert.match(DOOR, /cell: CELL \* \(parseFloat\(token\('--cv-px'\)\) \|\| 4\),/)
    assert.match(DOOR, /ink: token\('--cv-ink'\),/)
    assert.match(DOOR, /ground: token\('--cv-ground'\),/)
    for (const [name, text] of [
      ['door.js', DOOR],
      ['abyss.js', MODULE],
    ])
      assert.doesNotMatch(text, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${name} names a colour`)
  })

  // mutation: abyss.door-plate-not-kept
  it('keeps the plate, from the canvas`s corner', () => {
    assert.match(DOOR, /keep: \(\) => \[from\(plate\)\],/)
    assert.match(
      DOOR,
      /return \[r\.left - c\.left, r\.top - c\.top, r\.right - c\.left, r\.bottom - c\.top\]/
    )
  })

  // mutation: abyss.door-ignores-resize
  it('is fitted again when the page or the plate changes size', () => {
    assert.match(DOOR, /const watch = new ResizeObserver\(\(\) => abyss\.fit\(\)\)/)
    assert.match(DOOR, /watch\.observe\(field\)/)
    assert.match(DOOR, /watch\.observe\(plate\)/)
  })

  // mutation: abyss.door-motion-read-once
  it('asks again whether motion is wanted', () => {
    assert.match(DOOR, /reduced: \(\) => reduced\.matches,/)
  })
})

describe('the carve and a door`s title are one pixel', () => {
  // mutation: abyss.cell-and-title-apart
  it('CELL cells of --cv-px: the title is set at it, so a letter and the ground are one grain', () => {
    const title = rule(CSS, '.cv-door .ptitle')
    assert.ok(title, 'canvas.css has no rule for a door title')
    assert.ok(
      title.includes(`--tpx: calc(${CELL} * var(--cv-px));`),
      `a door's title is not set at ${CELL} cells`
    )
  })
})

describe('the lost door is set in CSS', () => {
  // mutation: abyss.css-canvas-in-flow
  it('the canvas fills the page behind the words', () => {
    const r = rule(CSS, '.cv-abyss')
    assert.ok(r, 'canvas.css has no .cv-abyss')
    assert.match(r, /position: absolute;/)
    assert.match(r, /inset: 0;/)
    assert.match(r, /width: 100%;/)
    assert.match(r, /height: 100%;/)
    assert.match(rule(CSS, '.cv-lost'), /position: relative;/)
  })

  // mutation: abyss.css-canvas-scrolls
  it('and takes the touch, so a finger carves rather than scrolls', () => {
    assert.match(rule(CSS, '.cv-abyss'), /touch-action: none;/)
    assert.doesNotMatch(rule(CSS, '.cv-plate'), /touch-action/, 'the words cannot be scrolled')
  })

  // mutation: abyss.css-plate-under
  it('the plate is positioned, so it paints over the canvas that came before it', () => {
    assert.match(rule(CSS, '.cv-plate'), /position: relative;/)
  })

  // mutation: abyss.css-plate-pushes-the-words
  it('the door`s padding is less the plate`s, so the words sit where they sat', () => {
    const plate = rule(CSS, '.cv-plate').match(/padding: (var\(--cv-sp-\d+\));/)
    assert.ok(plate, 'the plate has no padding from the ladder')
    assert.ok(
      rule(CSS, '.cv-lost').includes(`padding: calc(var(--cv-sp-8) - ${plate[1]});`),
      'the door and the plate are not the one gutter'
    )
    assert.match(rule(CSS, '.cv-door'), /padding: var\(--cv-sp-8\);/)
  })

  // mutation: abyss.css-forced-colours-canvas
  it('the canvas is left out under a forced palette', () => {
    assert.match(
      CSS,
      /@media \(forced-colors: active\) \{\n {2}\.cv-abyss \{\n {4}display: none;\n/
    )
  })
})
