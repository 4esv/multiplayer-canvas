// test/outlook.test.js
// BIBLE.md section 5, the window: the weather tile is a square of sky in a
// single ink frame (primitives/sky/outlook.js), set from the payload like a
// sheet of pixel skies, the hour across and the weather down.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  SIZE,
  FRAME,
  INKS,
  PHASES,
  ROWS,
  SUN_ROWS,
  RAGGED,
  rowOf,
  phaseOf,
  moonAge,
  moonLit,
  bands,
  dithered,
  arcAt,
  cloudCells,
  particles,
  twinkling,
  frame,
} from '../primitives/sky/outlook.js'
import { CONDITION_BY_CODE } from '../src/services/weather.js'
import { BAYER4 } from '../primitives/textmode-settings.js'

const ROOT = join(import.meta.dirname, '..')
const TOKENS = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')

const tok = (name) => TOKENS.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`))[1]
const inks = Object.fromEntries(Object.entries(INKS).map(([k, v]) => [k, tok(v)]))
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const C = Object.fromEntries(Object.entries(inks).map(([k, v]) => [k, rgb(v)]))
const px = (f, X, Y) => {
  const i = (Y * SIZE + X) * 4
  return [f[i], f[i + 1], f[i + 2]]
}
const key = (c) => c.join(',')
const same = (a, b) => key(a) === key(b)
const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b

// Ithaca, 2026-09-23, Open-Meteo's own sunrise and sunset
const RISE = 1790160870
const SET = 1790204486
const AT = {
  dawn: RISE + 600,
  day: Math.round((RISE + SET) / 2),
  sunset: SET - 600,
  night: SET + 4 * 3600,
}
const sky = (cond, phase, extra = {}) => ({
  tempF: 57,
  cond,
  place: 'ithaca, ny',
  day: phase !== 'night',
  rise: RISE,
  set: SET,
  ...extra,
})
const draw = (cond, phase, step = 0, extra) =>
  frame(sky(cond, phase, extra), AT[phase] * 1000, step, inks)
// every pixel of a still, as colour keys, inside the frame
const skyPixels = (f) => {
  const out = []
  for (let Y = FRAME; Y < SIZE - FRAME; Y++)
    for (let X = FRAME; X < SIZE - FRAME; X++) out.push([X, Y, px(f, X, Y)])
  return out
}

describe('outlook: the sheet has a row for every condition', () => {
  // mutation: outlook.snow-reads-as-rain
  it('every condition the service can send lands on its row', () => {
    const want = {
      clear: 'fine',
      'mostly clear': 'fine',
      'partly cloudy': 'clouds',
      overcast: 'overcast',
      fog: 'fog',
      drizzle: 'rain',
      'freezing drizzle': 'rain',
      rain: 'rain',
      'heavy rain': 'rain',
      'freezing rain': 'rain',
      showers: 'rain',
      thunder: 'rain',
      snow: 'snow',
      'heavy snow': 'snow',
      'snow grains': 'snow',
      'snow showers': 'snow',
    }
    for (const cond of new Set(Object.values(CONDITION_BY_CODE))) {
      assert.ok(cond in want, `the code table grew a condition the sheet has no row for: ${cond}`)
      assert.equal(rowOf(cond), want[cond], cond)
      assert.ok(ROWS.includes(rowOf(cond)))
    }
    // an empty or unknown payload claims neither sun nor rain
    assert.equal(rowOf(''), 'clouds')
    assert.equal(rowOf('unknown'), 'clouds')
    assert.equal(rowOf(null), 'clouds')
  })
})

describe('outlook: the hour is the real sun', () => {
  // mutation: outlook.no-dawn
  it('dawn and sunset are the forty-five minutes either side of the sun', () => {
    assert.equal(phaseOf(RISE - 1200, sky()).phase, 'dawn')
    assert.equal(phaseOf(RISE + 1200, sky()).phase, 'dawn')
    assert.equal(phaseOf(RISE + 3600, sky()).phase, 'day')
    assert.equal(phaseOf(SET - 1200, sky()).phase, 'sunset')
    assert.equal(phaseOf(SET + 1200, sky()).phase, 'sunset')
    assert.equal(phaseOf(SET + 3600, sky()).phase, 'night')
    assert.equal(phaseOf(RISE - 3600, sky()).phase, 'night')
    assert.deepEqual(PHASES, ['dawn', 'day', 'sunset', 'night'])
  })

  // mutation: outlook.stale-sunrise-unmodded
  it('a stale sunrise still tells the hour: it is read modulo a day', () => {
    // the checked-in snapshot is days old by the time anyone reads it
    const old = sky('clear', 'day', { rise: RISE - 30 * 86400, set: SET - 30 * 86400 })
    for (const [phase, t] of Object.entries(AT)) assert.equal(phaseOf(t, old).phase, phase)
  })

  it('with no sunrise, the day flag says day or night and no more', () => {
    assert.equal(phaseOf(AT.dawn, { day: true }).phase, 'day')
    assert.equal(phaseOf(AT.dawn, { day: false }).phase, 'night')
    assert.equal(phaseOf(AT.dawn, {}).phase, 'day')
  })

  // mutation: outlook.sun-stays-high
  it('the sun rides an arc: on the horizon at dawn, under it before, high at noon', () => {
    const y = (arc) => arcAt(SUN_ROWS, arc, 0.72)[1] + SUN_ROWS.length / 2
    const horizon = (SIZE - FRAME) / 2
    assert.ok(Math.abs(y(0) - horizon) <= 1, 'centred on the horizon at sunrise')
    assert.ok(y(-0.05) > horizon, 'under the horizon before sunrise')
    assert.ok(y(0.5) < horizon / 2, 'high at noon')
    assert.ok(arcAt(SUN_ROWS, 0, 0.72)[0] < arcAt(SUN_ROWS, 1, 0.72)[0], 'rises left, sets right')
  })
})

describe('outlook: the sky is bands, stepped through the Bayer map', () => {
  // mutation: outlook.gradient-not-bands
  it('a clear sky holds only its band colours, never a gradient', () => {
    for (const phase of ['dawn', 'day', 'sunset']) {
      const list = bands(phase, 'fine', C).map(key)
      assert.ok(new Set(list).size >= 4, `${phase} has at least four bands`)
      // the left column is clear of the sun and holds nothing but bands
      const f = draw('clear', phase === 'dawn' ? 'day' : phase)
      if (phase === 'dawn') continue
      for (let Y = FRAME + 20; Y < SIZE - FRAME; Y++) {
        const c = key(px(f, FRAME + 1, Y))
        assert.ok(list.includes(c), `${phase} y ${Y}: ${c} is not a band`)
      }
    }
  })

  // mutation: outlook.no-dither
  it('each band steps into the next through BAYER4, a quarter then a half', () => {
    const f = draw('clear', 'day')
    let mixed = 0
    for (let Y = FRAME + 20; Y < SIZE - FRAME; Y++) {
      const row = new Set()
      for (let X = FRAME; X < FRAME + 16; X++) row.add(key(px(f, X, Y)))
      if (row.size === 2) mixed++
    }
    assert.ok(mixed >= 8, `rows where two bands dither together: ${mixed}`)
    for (let lvl = 0; lvl <= 16; lvl += 4)
      for (let Y = 0; Y < 4; Y++)
        for (let X = 0; X < 4; X++) assert.equal(dithered(X, Y, lvl), BAYER4[Y * 4 + X] < lvl)
  })

  // mutation: outlook.straight-bands
  it('the edges between bands are ragged, in sideways runs', () => {
    assert.ok(RAGGED > 0)
    const f = draw('clear', 'day')
    const list = bands('day', 'fine', C).map(key)
    // where each column first reaches the third band, ignoring the dither
    const reach = new Set()
    for (let X = FRAME; X < SIZE - FRAME; X += 2) {
      for (let Y = FRAME; Y < SIZE - FRAME; Y += 2) {
        if (list.indexOf(key(px(f, X, Y))) >= 3) {
          reach.add(Y)
          break
        }
      }
    }
    assert.ok(reach.size >= 4, `the third band starts at ${[...reach]}`)
  })

  // mutation: outlook.no-glow
  it('a low sun pulls the warm bands up round itself', () => {
    const f = draw('clear', 'sunset')
    const list = bands('sunset', 'fine', C).map(key)
    const band = (X, Y) => list.indexOf(key(px(f, X, Y)))
    // at sunset the sun sets on the right; a third of the way up the sky,
    // the column over it is further into the warm end than the far column
    const Y = Math.round(SIZE * 0.66)
    let near = 0
    let far = 0
    for (let dy = -6; dy <= 6; dy += 2) {
      near += band(SIZE - 24, Y + dy)
      far += band(12, Y + dy)
    }
    assert.ok(near > far, `near the sun ${near}, far from it ${far}`)
  })

  // mutation: outlook.rain-not-flattened
  it('rain darkens the sky and flattens it to two bands', () => {
    for (const phase of PHASES) {
      const fine = bands(phase, 'fine', C)
      const wet = bands(phase, 'rain', C)
      assert.equal(wet.length, 2, `${phase} rain is two bands`)
      const top = (l) => Math.max(...l.map(luma))
      assert.ok(top(wet) < top(fine), `${phase} rain is darker than its brightest clear band`)
    }
  })
})

describe('outlook: what is in the sky', () => {
  const has = (f, c) => skyPixels(f).some(([, , p]) => same(p, c))
  // mutation: outlook.sun-in-rain
  it('the sun shows by a clear day and never through rain', () => {
    assert.ok(has(draw('clear', 'day'), C.sun), 'the clear day has its sun')
    // the sun is the one warm thing on a day sky, veiled or not
    const warm = (f) => skyPixels(f).filter(([, , [r, , b]]) => r - b > 25).length
    assert.ok(warm(draw('overcast', 'day')) > 0, 'a grey deck only dims it')
    assert.equal(warm(draw('rain', 'day')), 0, 'rain hides the sun')
    assert.ok(!has(draw('clear', 'night'), C.sun), 'no sun at night')
  })

  // mutation: outlook.sun-stays-high
  it('the low sun sits on the horizon at dawn and sunset', () => {
    for (const phase of ['dawn', 'sunset']) {
      const f = draw('clear', phase)
      // the sun is whatever in a clear sky is not a band
      const list = bands(phase, 'fine', C).map(key)
      const Ys = skyPixels(f)
        .filter(([, , p]) => !list.includes(key(p)))
        .map(([, Y]) => Y)
      assert.ok(Ys.length, `${phase}: the sun's rim is in view`)
      assert.ok(Math.min(...Ys) > SIZE * 0.75, `${phase}: the sun is low`)
    }
  })

  // mutation: outlook.stars-under-cloud-deck
  it('stars come out on a clear night and not under a grey deck', () => {
    const lit = (f) => skyPixels(f).filter(([, , p]) => same(p, C.surface)).length
    assert.ok(lit(draw('clear', 'night')) >= 20, 'a clear night has stars')
    assert.equal(lit(draw('overcast', 'night')), 0, 'an overcast night has none')
  })

  // mutation: outlook.moon-always-full
  it('the moon is lit by its real phase', () => {
    // a new moon (2000-01-06 18:14 UTC) and a full one (2024-01-25 17:54 UTC)
    assert.ok(moonAge(947182440) < 0.001 || moonAge(947182440) > 0.999)
    assert.ok(Math.abs(moonAge(1706205240) - 0.5) < 0.03, `${moonAge(1706205240)}`)
    const lit = (age) => {
      let n = 0
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) n += moonLit(x, y, age) ? 1 : 0
      return n
    }
    assert.equal(lit(0.01), 0, 'new: dark')
    assert.ok(lit(0.5) >= 55, `full: all of the disc, ${lit(0.5)}`)
    assert.ok(lit(0.25) > 25 && lit(0.25) < 55, `first quarter: half, ${lit(0.25)}`)
    // waxing lights the right, waning the left
    assert.ok(moonLit(8, 4, 0.25) && !moonLit(0, 4, 0.25))
    assert.ok(moonLit(0, 4, 0.75) && !moonLit(8, 4, 0.75))
    // and the picture follows: the same hour of night near full and near new
    const nights = Array.from({ length: 30 }, (_, d) => AT.night + d * 86400)
    const near = (want) =>
      nights.reduce((a, t) => (Math.abs(moonAge(t) - want) < Math.abs(moonAge(a) - want) ? t : a))
    const bright = (t) =>
      skyPixels(frame(sky('clear', 'night'), t * 1000, 0, inks)).filter(([, , p]) => luma(p) > 200)
        .length
    assert.ok(
      bright(near(0.5)) > bright(near(0.02)) + 40,
      `full ${bright(near(0.5))}, new ${bright(near(0.02))}`
    )
  })

  it('clouds thicken from clouds to overcast', () => {
    const n = (row) => cloudCells(row, 0).filter(Boolean).length
    assert.equal(n('fine'), 0)
    assert.ok(n('clouds') > 0)
    assert.ok(n('overcast') > 3 * n('clouds'), `${n('overcast')} vs ${n('clouds')}`)
  })
})

describe('outlook: stepped motion', () => {
  // mutation: outlook.rain-still
  it('rain falls four half cells a step, every drop the same way', () => {
    const a = particles('rain', 'rain', 10)
    const b = particles('rain', 'rain', 11)
    assert.ok(a.length > 0)
    assert.equal(a.length, b.length)
    const H = SIZE - 2 * FRAME
    a.forEach(([X, Y], i) => {
      assert.equal(b[i][0], X)
      assert.equal((b[i][1] - FRAME - (Y - FRAME) + H) % H, 4)
    })
    assert.notDeepEqual(draw('rain', 'day', 10), draw('rain', 'day', 11))
  })

  // mutation: outlook.clouds-still
  it('clouds drift a cell every eight steps and wrap back whole', () => {
    assert.deepEqual(cloudCells('clouds', 0), cloudCells('clouds', 7))
    assert.notDeepEqual(cloudCells('clouds', 0), cloudCells('clouds', 8))
    assert.notDeepEqual(draw('partly cloudy', 'day', 0), draw('partly cloudy', 'day', 8))
    // the field wraps every 96 cells sideways: a full lap comes home
    const lap = 8 * 96
    assert.deepEqual(cloudCells('clouds', 0), cloudCells('clouds', lap))
  })

  // mutation: outlook.twinkle-always
  it('a star goes out rarely, and a clear day does not move at all', () => {
    let out = 0
    for (let s = 0; s < 6000; s++) out += twinkling(3, s) ? 1 : 0
    assert.ok(out > 0 && out < 6000 * 0.03, `a star is out ${out} steps in 6000`)
    assert.deepEqual(draw('clear', 'day', 0), draw('clear', 'day', 500))
  })

  // mutation: outlook.thunder-flash
  it('a thunderstorm never flashes: it is heavy rain, step for step', () => {
    const bytes = (f) => Buffer.from(f.buffer, f.byteOffset, f.byteLength)
    const lit = []
    for (let s = 0; s < 800; s++)
      if (!bytes(draw('thunderstorm', 'day', s)).equals(bytes(draw('heavy rain', 'day', s))))
        lit.push(s)
    assert.deepEqual(lit, [], 'the steps a thunderstorm drew differently from heavy rain')
  })

  // mutation: outlook.snow-random
  it('the same payload, moment and step draw the same picture', () => {
    assert.deepEqual(draw('snow', 'night', 42), draw('snow', 'night', 42))
  })
})

describe('outlook: the window and the reading', () => {
  // mutation: outlook.frame-missing, outlook.frame-doubled
  it('a square, opaque tile in one ink frame, a cell wide, and sky inside it', () => {
    const f = draw('clear', 'day')
    assert.equal(f.length, SIZE * SIZE * 4)
    for (let i = 3; i < f.length; i += 4) assert.equal(f[i], 255)
    assert.equal(FRAME, 2, 'one cell is two half cells')
    const list = bands('day', 'fine', C).map(key)
    for (const Y of [10, 40, 80, 110]) {
      for (const X of [0, 1, SIZE - 2, SIZE - 1])
        assert.ok(same(px(f, X, Y), C.ink), `ink at ${X},${Y}`)
      // the first pixel in is sky, not a second line or a rail
      for (const X of [FRAME, SIZE - FRAME - 1])
        assert.ok(list.includes(key(px(f, X, Y))), `sky at ${X},${Y}`)
    }
    for (const X of [10, 60, 110]) {
      assert.ok(same(px(f, X, 0), C.ink) && same(px(f, X, SIZE - 1), C.ink))
      assert.ok(!same(px(f, X, FRAME), C.ink) && !same(px(f, X, SIZE - FRAME - 1), C.ink))
    }
  })

  // mutation: outlook.reading-in-sky
  it('nothing is written on the sky: the temperature does not change the picture', () => {
    const base = draw('clear', 'day')
    for (const tempF of [99, -12, '', undefined])
      assert.deepEqual(draw('clear', 'day', 0, { tempF }), base, `tempF ${tempF}`)
    // and junk never throws: a payload must not be able to stop the window
    assert.doesNotThrow(() => frame({ tempF: '5<7>%', cond: 42 }, 0, 0, inks))
    assert.doesNotThrow(() => frame(null, NaN, 0, inks))
    assert.doesNotThrow(() => frame({ tempF: -12, rise: 'x', set: {} }, Date.now(), 3, inks))
  })
})

describe('outlook: the page', () => {
  // mutation: outlook.moves-when-reduced, outlook.moves-on-watch
  it('the tile stands still under reduced motion, ?bare, ?frozen and the watch', () => {
    assert.match(APP, /const OUTLOOK_STILL = REDUCED \|\| BARE;/)
    assert.match(APP, /const BARE = FLAGS\.has\('bare'\) \|\| FLAGS\.has\('frozen'\);/)
    assert.match(APP, /const still = OUTLOOK_STILL \|\| chromeDensity\(VW, VH\) === 'watch';/)
    assert.match(APP, /if\(!OUTLOOK_STILL\) setInterval\(/)
  })

  // mutation: outlook.tile-grows-dom
  it('the tile is one canvas, labelled with what the picture says, and its name under it', () => {
    const m = APP.match(/else if\(t\.type==='weather'\)\{[\s\S]*?n\.innerHTML = `([^`]*)`;/)
    assert.ok(m, 'the weather tile branch is found')
    // two elements: the window, and the name every thing on the ground
    // carries under it ("My Sky")
    assert.equal((m[1].match(/</g) || []).length - (m[1].match(/<\//g) || []).length, 2)
    assert.match(
      m[1],
      /^<canvas class="sky" [^>]*role="img" aria-label="\$\{esc\(outlookLabel\(\)\)\}"><\/canvas><div class="name k-lbl">\$\{esc\(t\.label\)\}<\/div>$/
    )
  })
})
