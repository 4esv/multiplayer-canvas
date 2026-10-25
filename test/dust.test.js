// test/dust.test.js
// THE DUST (BIBLE.md section 10, canvas/dust.js). A cursor crossing a glyph
// or a title disturbs the cells under its path: each lit cell within reach
// hops one cell the clock decides, stays away for its dwell, comes home whole,
// and rests before it can be lifted again. The canvas and the door pages run
// this one module; what a host owns is the clock and whether it is on.
//
// What is held: the behaviour, against a stand-in for the svg and a clock the
// test turns by hand; and that the dust is written once (the canvas keeps no
// copy, the door runs the module and not a version of it).
import { describe, it, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createDust,
  DUST_MS,
  DUST_REACH,
  DUST_REST,
  DUST_TTL_MIN,
  DUST_TTL_SPREAD,
  hash3,
} from '../primitives/dust.js'
import { pathFromGrid } from '../primitives/pixel-type.js'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const DOOR = readFileSync(join(ROOT, 'src/static/js/door.js'), 'utf8')

const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]

const grid = (rows) => rows.map((r) => [...r].map((c) => c === '#'))
const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill(false))

// just what the module touches of an svg: a path, a class list, a viewBox and
// a box on the screen ten pixels to the cell
function fakeSvg(g, x = 0) {
  const w = g[0].length
  const h = g.length
  const path = {
    d: pathFromGrid(g),
    getAttribute() {
      return this.d
    },
    setAttribute(_, v) {
      this.d = v
    },
  }
  const classes = new Set()
  return {
    path,
    classes,
    classList: { add: (c) => classes.add(c) },
    querySelector: (s) => (s === 'path' ? path : null),
    getAttribute: (n) => (n === 'viewBox' ? `0 0 ${w} ${h}` : null),
    getBoundingClientRect: () => ({ x, y: 0, width: w * 10, height: h * 10 }),
  }
}

// one lit cell in the middle of seven by seven
const lone = () => {
  const g = blank(7, 7)
  g[3][3] = true
  return g
}

// the clock the host hands over, in ms; a tick is DUST_MS
const clockAt = (tick) => {
  const c = { ms: tick * DUST_MS }
  c.now = () => c.ms
  return c
}

afterEach(() => mock.timers.reset())

describe('wiring a glyph', () => {
  // mutation: dust.off-switch-ignored
  it('marks the svg when the host has the dust on, and leaves it alone when it is off', () => {
    const on = fakeSvg(lone())
    createDust({ enabled: () => true }).wire(on, lone())
    assert.ok(on.classes.has('dust'))
    const off = fakeSvg(lone())
    createDust({ enabled: () => false }).wire(off, lone())
    assert.ok(!off.classes.has('dust'), 'a host with the dust off got it anyway')
  })

  it('needs an svg with a path and a grid', () => {
    const dust = createDust()
    const noPath = { ...fakeSvg(lone()), querySelector: () => null }
    dust.wire(noPath, lone())
    assert.ok(!noPath.classes.has('dust'))
    const svg = fakeSvg(lone())
    dust.wire(svg, null)
    assert.ok(!svg.classes.has('dust'))
    assert.doesNotThrow(() => dust.wire(null, lone()))
  })
})

describe('a cell under the cursor', () => {
  // mutation: dust.clock-ignored
  it('hops one cell the way the clock says and is home again after its dwell', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    // five different ticks, so a dust that read some other clock cannot match them all
    for (const tick of [1234, 1235, 99, 7, 40000]) {
      const dust = createDust({ now: clockAt(tick).now })
      const svg = fakeSvg(lone())
      const rest = svg.path.d
      dust.wire(svg, lone())
      dust.at(svg, 3.5, 3.5)
      const r = hash3(3, 3, tick)
      const dir = r % 8
      const ttl = DUST_TTL_MIN + ((r >> 3) % DUST_TTL_SPREAD)
      const moved = lone()
      moved[3][3] = false
      moved[3 + DY[dir]][3 + DX[dir]] = true
      // it stays away until the tick its dwell runs out on
      for (let n = 1; n < ttl; n++) {
        mock.timers.tick(DUST_MS)
        assert.equal(
          svg.path.d,
          pathFromGrid(moved),
          `tick ${tick}: not displaced on ${n} of ${ttl}`
        )
      }
      mock.timers.tick(DUST_MS)
      assert.equal(svg.path.d, rest, `tick ${tick}: not home after its dwell`)
    }
  })

  // mutation: dust.reach-ignored
  it('is lifted only inside the reach', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    // a row of nine lit cells, the cursor on the middle one: the cells the reach
    // takes are 2 to 6 (their centres are no more than DUST_REACH from 4.5), and
    // 0, 1, 7 and 8 are further off than that
    const g = blank(9, 1)
    for (let x = 0; x < 9; x++) g[0][x] = true
    const dust = createDust({ now: clockAt(7).now })
    const svg = fakeSvg(g)
    dust.wire(svg, g)
    dust.at(svg, 4.5, 0.5)
    mock.timers.tick(DUST_MS)
    const lit = new Set(
      [...svg.path.d.matchAll(/M(\d+) 0h(\d+)v1/g)].flatMap((m) =>
        Array.from({ length: +m[2] }, (_, i) => +m[1] + i)
      )
    )
    for (const x of [0, 1, 7, 8]) assert.ok(lit.has(x), `cell ${x} is out of reach and was lifted`)
    assert.notEqual(svg.path.d, pathFromGrid(g), 'nothing lifted under the cursor')
    // and a cursor that is nowhere near the glyph lifts nothing
    const quiet = fakeSvg(g)
    const d2 = createDust({ now: clockAt(7).now })
    d2.wire(quiet, g)
    d2.at(quiet, 40, 40)
    mock.timers.tick(DUST_MS * 3)
    assert.equal(quiet.path.d, pathFromGrid(g))
  })

  // mutation: dust.rest-ignored
  it('rests after it lands: the same cell is not lifted again for DUST_REST ticks', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const clock = clockAt(50)
    const dust = createDust({ now: clock.now })
    const svg = fakeSvg(lone())
    const rest = svg.path.d
    dust.wire(svg, lone())
    dust.at(svg, 3.5, 3.5)
    const r = hash3(3, 3, 50)
    const ttl = DUST_TTL_MIN + ((r >> 3) % DUST_TTL_SPREAD)
    for (let n = 0; n < ttl; n++) mock.timers.tick(DUST_MS) // home, and resting from this tick
    assert.equal(svg.path.d, rest)
    dust.at(svg, 3.5, 3.5)
    mock.timers.tick(DUST_MS * 2)
    assert.equal(svg.path.d, rest, 'a landed cell was lifted again while it rested')
    // the rest is over once the clock has gone on past it
    clock.ms += (DUST_REST + 1) * DUST_MS
    dust.at(svg, 3.5, 3.5)
    mock.timers.tick(DUST_MS)
    assert.notEqual(svg.path.d, rest, 'a rested cell was not lifted')
  })

  it('draws the same dust for the same clock, whoever asks', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const one = createDust({ now: clockAt(99).now })
    const two = createDust({ now: clockAt(99).now })
    const a = fakeSvg(lone())
    const b = fakeSvg(lone())
    one.wire(a, lone())
    two.wire(b, lone())
    one.at(a, 3.5, 3.5)
    two.at(b, 3.5, 3.5)
    mock.timers.tick(DUST_MS)
    assert.equal(a.path.d, b.path.d)
    // and the clock is what decides: eight ticks show more than one direction
    const seen = new Set()
    for (let t = 0; t < 8; t++) {
      const d = createDust({ now: clockAt(1000 + t).now })
      const s = fakeSvg(lone())
      d.wire(s, lone())
      d.at(s, 3.5, 3.5)
      mock.timers.tick(DUST_MS)
      seen.add(s.path.d)
    }
    assert.ok(seen.size > 1, 'every tick drew the same dust')
  })
})

describe('the scatter', () => {
  // mutation: dust.scatter-stands-still
  it('moves every lit cell, never by nothing', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    for (let t = 0; t < 200; t++) {
      const dust = createDust({ now: clockAt(t).now })
      const svg = fakeSvg(lone())
      const rest = svg.path.d
      dust.wire(svg, lone())
      dust.scatter(svg, 1, 9)
      mock.timers.tick(DUST_MS)
      assert.notEqual(svg.path.d, rest, `a cell stood still on tick ${t}`)
    }
  })
})

describe('a title', () => {
  it('is one wire a word, from the words it keeps for readers', () => {
    const dust = createDust()
    const svgs = [fakeSvg(lone()), fakeSvg(lone()), fakeSvg(lone())]
    const h = {
      querySelector: (s) => (s === '.px-vh' ? { textContent: '404 not found' } : null),
      querySelectorAll: (s) => (s === 'svg.pw' ? svgs : []),
    }
    dust.title(h)
    assert.deepEqual(
      svgs.map((s) => s.classes.has('dust')),
      [true, true, true]
    )
    // a title with no words, or no title at all, is nothing to wire
    const bare = [fakeSvg(lone())]
    dust.title({ querySelector: () => null, querySelectorAll: () => bare })
    assert.ok(!bare[0].classes.has('dust'))
    assert.doesNotThrow(() => dust.title(null))
  })
})

describe('a point on the screen', () => {
  it('goes to the glyph under it, and every glyph in the node is asked', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const dust = createDust({ now: clockAt(3).now })
    const left = fakeSvg(lone(), 0)
    const right = fakeSvg(lone(), 100)
    dust.wire(left, lone())
    dust.wire(right, lone())
    const node = { querySelectorAll: (s) => (s === 'svg.dust' ? [left, right] : []) }
    const restL = left.path.d
    const restR = right.path.d
    // ten pixels to the cell: the middle cell of the right-hand glyph
    dust.under(node, 100 + 35, 35)
    mock.timers.tick(DUST_MS)
    assert.equal(left.path.d, restL, 'the glyph the cursor was not over was disturbed')
    assert.notEqual(right.path.d, restR, 'the glyph the cursor was over was not')
    assert.doesNotThrow(() => dust.under(null, 0, 0))
    assert.doesNotThrow(() => dust.under({ querySelectorAll: () => [] }, 0, 0))
  })
})

describe('the dust is written once', () => {
  // mutation: dust.app-keeps-a-copy
  it('is the module in the canvas, with no second copy of its parts', () => {
    assert.match(APP, /import \{ createDust, DUST_MS \} from 'multiplayer-canvas\/dust';/)
    for (const copy of [
      /function dustTick\b/,
      /function dustAt\b/,
      /function wireDust\b/,
      /new WeakMap\(\); \/\/ svg ->/,
      /const DUST_REACH\b/,
    ])
      assert.doesNotMatch(APP, copy, 'the canvas keeps its own dust')
  })

  // mutation: dust.canvas-clock-lost, dust.canvas-switches-lost
  it('runs on the room clock, and stays off for a bare canvas, ?nodust and reduced motion', () => {
    assert.match(APP, /createDust\(\{\s*now: \(\) => presence\.now\(\),/)
    assert.match(APP, /enabled: \(\) => !\(BARE \|\| NODUST \|\| REDUCED\),/)
  })

  // mutation: door.title-unwired, door.pointer-unwired, door.reduced-motion-ignored, door.keeps-a-copy
  it('is the module on the door pages: titles wired, the pointer fed, reduced motion kept', () => {
    assert.match(DOOR, /import \{ createDust \} from 'multiplayer-canvas\/dust'/)
    assert.match(DOOR, /for \(const h of titles\) dust\.title\(h\)/)
    assert.match(DOOR, /addEventListener\(\s*'pointermove'/)
    assert.match(DOOR, /dust\.under\(h, e\.clientX, e\.clientY\)/)
    assert.match(DOOR, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
    assert.match(DOOR, /enabled: \(\) => !reduced\.matches/)
    assert.doesNotMatch(DOOR, /function (wire|tick|dustAt|dustTick)\b|hash3/)
  })
})
