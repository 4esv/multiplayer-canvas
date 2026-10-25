// The camera flight contract: flightPath/flightAt (layout.js) implement
// van Wijk & Nuij's optimal pan-zoom path ("Smooth and Efficient Zooming
// and Panning", InfoVis 2003), and this guard holds them to the ground.
// The signs in eq 9 are easy to swap and the app's exact-landing snap
// masks a wrong path completely: the broken version still ARRIVES, it
// just travels garbage in between (negative arc length, a kilometer of
// landing error absorbed by the final frame). These assertions are what
// caught exactly that, so they stay.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { flightPath, flightAt, nearestWrap } from '../src/static/canvas/layout.js'

// a matrix of real camera moves: viewport widths in world units (w) and
// pan distances (u) the shipped world actually produces
const CASES = [
  ['pure pan at one zoom', 2016, 2016, 3000],
  ['short pan', 2016, 2016, 300],
  ['pan plus zoom in', 2016, 1800, 1200],
  ['cross-world dive', 2016, 1800, 3600],
  ['map to tile', 3840, 1800, 1500],
  ['tiny hop', 2016, 2016, 40],
  ['zoom only (degenerate ray)', 3840, 2016, 0],
]

describe('camera flights ride the van Wijk & Nuij geodesic', () => {
  for (const [name, w0, w1, u1] of CASES) {
    it(name, () => {
      const f = flightPath(w0, w1, u1)
      assert.ok(f.S >= 0, `arc length must be forward (got ${f.S})`)
      const N = 200
      let prevU = -1e-9
      let prevW = null
      let dir = 0
      let crest = 0
      for (let i = 0; i <= N; i++) {
        const { u, w } = flightAt(f, w0, (f.S * i) / N)
        if (u1 >= 1) assert.ok(u >= prevU - 1e-6, 'the ground track never walks backwards')
        if (prevW != null) {
          const d = Math.sign(w - prevW)
          if (d !== 0 && d !== dir) {
            crest++
            dir = d
          }
        }
        prevU = u
        prevW = w
      }
      // one crest at most: out, over, in. A second reversal is a wobble.
      assert.ok(crest <= 2, `the zoom profile wobbles (${crest} reversals)`)
      const end = flightAt(f, w0, f.S)
      if (u1 >= 1) assert.ok(Math.abs(end.u - u1) < 0.5, `lands ${end.u - u1} short on the pan`)
      assert.ok(Math.abs(end.w - w1) < 0.5, `lands ${end.w - w1} off on the zoom`)
    })
  }
})

// The other half of the flight contract, and the one /map broke: a target
// is a point on a TORUS, so before any path is measured the destination has
// to be resolved to the copy nearest the camera. Aim at the raw coordinate
// and the geodesic is computed correctly to the wrong point -- the flight
// still arrives, it just tours the world to get somewhere next door.
const WORLD = 6000
describe('flights resolve their target to the nearest copy', () => {
  // mutation: canvas-flight.wrap-takes-long-way
  it('never travels more than half a world', () => {
    for (let cur = -3 * WORLD; cur <= 3 * WORLD; cur += 137) {
      for (const target of [0, 500, 2999, 3000, 3001, 5900, WORLD - 1]) {
        const d = Math.abs(nearestWrap(target, cur, WORLD) - cur)
        assert.ok(d <= WORLD / 2 + 1e-9, `target ${target} from ${cur} travels ${d}`)
      }
    }
  })

  it('lands on a copy of the target, never beside one', () => {
    for (const [target, cur] of [
      [200, 5800],
      [5800, 200],
      [3000, 0],
      [42, 42],
      [42, 42 + 9 * WORLD],
    ]) {
      const got = nearestWrap(target, cur, WORLD)
      const off = (((got - target) % WORLD) + WORLD) % WORLD
      assert.ok(off < 1e-9 || Math.abs(off - WORLD) < 1e-9, `${got} is not a copy of ${target}`)
    }
  })

  it('crosses the seam instead of unwinding the world', () => {
    // the shipped symptom: the camera one screen past the right seam, home
    // sitting just behind it. The short way is backwards, not a lap forward.
    assert.equal(nearestWrap(100, WORLD - 100, WORLD), WORLD + 100)
    assert.equal(nearestWrap(WORLD - 100, 100, WORLD), -100)
  })

  it('holds still when it is already there', () => {
    assert.equal(nearestWrap(1234, 1234, WORLD), 1234)
    assert.equal(nearestWrap(1234, 1234 + WORLD, WORLD), 1234 + WORLD)
  })

  it('survives a world that has not been measured yet', () => {
    // boot order: a flight can be asked for before placeWorld has run, and a
    // modulo by zero would put the camera at NaN with no way back
    assert.equal(nearestWrap(700, 40, 0), 700)
  })
})
