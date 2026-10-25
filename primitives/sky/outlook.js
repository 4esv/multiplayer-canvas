// multiplayer-canvas/sky: a weather window: a square of pixel sky for the hour and the weather.
// Inputs: frame(weather, nowMs, step, inks, push) with { cond, day, rise, set } and INKS resolved
//   to colours.
// Outputs: an RGBA Uint8ClampedArray, SIZE x SIZE, ready for ImageData. Pure.
//
// outlook.js: the weather tile is a window, and it is almost all sky (#305).
//
// A square of sky behind one ink line, drawn from the live payload and
// nothing else. Two things pick the picture, the way a sheet of pixel skies
// is laid out: the hour across (dawn, day, sunset, night) and the weather
// down (fine, clouds, overcast, rain, then snow and fog, which the code set
// has and a four-row sheet does not).
//
// THE HOUR is the visitor's clock against the day's real sunrise and sunset
// (Open-Meteo, epoch seconds). Both are read modulo a day, so a stale payload
// or the checked-in snapshot still gives the right hour to within the
// season's drift. With no sunrise in the payload the hour falls back to its
// is_day flag: day or night, never a guessed dawn.
//
// THE SKY is horizontal bands, never a gradient: each band is one flat
// colour, and the last part of each band steps into the next through the
// toolkit's ordered dither (BAYER4, js/textmode-settings.js, the site's one
// dither), a quarter and then a half. The edges between bands are ragged in
// long sideways runs of whole cells, the way layered air looks, and a low
// sun pulls the warm bands up round itself into a mound of glow. Cloud decks
// grey the bands, rain darkens and flattens them to two, fog washes them out.
//
// THE THINGS IN IT are drawn on whole cells. The sun is a plain bright disc
// with a dithered halo; the moon is a disc lit by the real phase of the moon
// on the visitor's date. Both ride an arc from the real hour (low at the
// horizon at dawn and sunset, high at noon). Clouds are a field, not
// stickers: long wisps on a fair sky, a mottled deck on a grey one, and the
// light obeys thickness (a thin fair cloud is brightest where it is densest;
// a thick deck is darkest where it is densest, because less light gets
// through). No shadow. A deck thin enough to see the sun through shows it as
// a pale disc on top of the grey, the way the sun looks through altostratus.
//
// MOTION is in whole steps on the wall clock (STEP_MS): clouds drift a cell
// every eight steps, rain falls two cells a step, snow a half cell and sways,
// and a star goes out for a step, rarely.
//
// THE SKY IS SHARED (round six). One layer answers a hand: the clouds. A
// push is an impulse on one offset the server holds for the whole room
// (services/sky.js); the offset springs home, the clouds rejoin their
// drift, and every tab watching draws the same whole cells from it. The
// arithmetic is here so both ends step the same spring. THE SUN AND THE
// MOON NEVER MOVE UNDER A HAND (round seven): wind moves clouds, nothing
// moves the sun, and a sky with no clouds has nothing to push. Nothing
// stands in for them.
//
// NOTHING IS WRITTEN ON THE SKY. The reading (temperature, condition, place)
// is the tile's label; the sky is the data.
//
// PURE. No DOM: frame() returns the RGBA of one SIZE x SIZE still for a
// payload, a moment and a step, so the page, the mock and the tests draw the
// same picture. test/outlook.test.js owns it.

import { BAYER4 } from '../textmode-settings.js'

// the tile is 5 x 5 modules, 60 x 60 cells, drawn at half a cell (the label
// face's pitch) so the dither is finer than the things it sits behind
const CELLS = 60
const RES = 2
export const SIZE = CELLS * RES
// the frame, in half cells: one ink line, one cell wide, and nothing else
// seam: test/outlook.test.js
export const FRAME = 2
const SKY0 = FRAME
const SKY1 = SIZE - FRAME
const SKY_H = SKY1 - SKY0
// the stepped clock: a step is one move of the weather
export const STEP_MS = 150
const DAY_S = 86400
// dawn and sunset are the forty-five minutes either side of the sun's edge
const TWILIGHT_S = 45 * 60
// the synodic month, and a new moon to count it from (2000-01-06 18:14 UTC)
const MONTH_S = 29.530588853 * DAY_S
const NEW_MOON_S = 947182440

// The names the page reads its colours from (canvas-tokens.css). The mock
// and the tests read the same names from the same file.
export const INKS = {
  ink: '--cv-ink',
  ground: '--cv-ground',
  surface: '--cv-surface',
  mute: '--cv-mute',
  brick: '--cv-brick',
  day1: '--guest-sky-day-1',
  day2: '--guest-sky-day-2',
  night1: '--guest-sky-night-1',
  night2: '--guest-sky-night-2',
  rose: '--guest-sky-rose',
  glow: '--guest-sky-glow',
  sun: '--guest-sky-sun',
}

// ---- the sheet -----------------------------------------------------------------

// seam: test/outlook.test.js
export const PHASES = ['dawn', 'day', 'sunset', 'night']
// seam: test/outlook.test.js
export const ROWS = ['fine', 'clouds', 'overcast', 'rain', 'snow', 'fog']

// Which row of the sheet a condition is. Every name services/weather.js can
// send lands on a row; anything else (an empty or unknown payload) is
// 'clouds', the one sky that does not claim sun or rain it cannot see.
// seam: test/outlook.test.js
export function rowOf(cond) {
  const c = String(cond || '').toLowerCase()
  if (c.includes('snow')) return 'snow'
  if (c.includes('thunder') || c.includes('rain') || c.includes('drizzle') || c.includes('shower'))
    return 'rain'
  if (c.includes('fog')) return 'fog'
  if (c.includes('overcast')) return 'overcast'
  if (c.includes('partly')) return 'clouds'
  if (c.includes('clear')) return 'fine'
  return 'clouds'
}
// how hard it is coming down (1 light, 2, 3 heavy); thunder comes down heavy
const weight = (cond) => {
  const c = String(cond || '').toLowerCase()
  return c.includes('heavy') || c.includes('thunder')
    ? 3
    : c.includes('drizzle') || c.includes('grains')
      ? 1
      : 2
}

const mod = (a, n) => ((a % n) + n) % n

// Which column of the sheet the hour is, and how far through its arc the sun
// (by day) or the moon (by night) is, from -small at the start to 1 at the
// end. `now` is epoch seconds.
// seam: test/outlook.test.js
export function phaseOf(now, weather = {}) {
  const { rise, set } = weather
  const dayLen = Number.isFinite(rise) && Number.isFinite(set) ? mod(set - rise, DAY_S) : 0
  if (!dayLen) {
    // no sunrise in the payload: the flag says day or night and no more
    return weather.day === false ? { phase: 'night', arc: 0.35 } : { phase: 'day', arc: 0.5 }
  }
  const since = mod(now - rise, DAY_S)
  if (since > DAY_S - TWILIGHT_S) return { phase: 'dawn', arc: (since - DAY_S) / dayLen }
  if (since < TWILIGHT_S) return { phase: 'dawn', arc: since / dayLen }
  if (Math.abs(since - dayLen) < TWILIGHT_S) return { phase: 'sunset', arc: since / dayLen }
  if (since < dayLen) return { phase: 'day', arc: since / dayLen }
  return { phase: 'night', arc: (since - dayLen) / (DAY_S - dayLen) }
}

// How far through its month the moon is at `now` (epoch seconds): 0 new,
// 0.5 full, waxing before and waning after.
// seam: test/outlook.test.js
export const moonAge = (now) => mod((now - NEW_MOON_S) / MONTH_S, 1)

// ---- colour --------------------------------------------------------------------

const hex = (h) =>
  [1, 3, 5].map(
    (i) =>
      parseInt(
        String(h)
          .trim()
          .slice(i, i + 2),
        16
      ) || 0
  )
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t))
const lum = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255

// The bands for a phase and a row, top to horizon. The clear sky is the
// phase's own keys: dawn cool, the night's blue lifting to a pale gold;
// sunset hot, maroon to red to orange to the sun's own yellow. Every other
// row pulls them toward its deck's grey, and rain flattens them to two.
// seam: test/outlook.test.js
export function bands(phase, row, C) {
  const keys = {
    dawn: [
      C.night1,
      C.night2,
      mix(C.night2, C.day1, 0.45),
      mix(C.day1, C.rose, 0.5),
      mix(C.rose, C.sun, 0.4),
      mix(C.glow, C.sun, 0.5),
    ],
    day: [
      mix(C.day1, C.night2, 0.25),
      mix(C.day1, C.night2, 0.1),
      C.day1,
      mix(C.day1, C.day2, 0.5),
      C.day2,
      mix(C.day2, C.surface, 0.4),
    ],
    sunset: [
      mix(C.night2, C.brick, 0.35),
      mix(C.brick, C.night1, 0.2),
      C.brick,
      mix(C.brick, C.glow, 0.5),
      C.glow,
      mix(C.glow, C.sun, 0.4),
    ],
    night: [
      mix(C.night1, C.ink, 0.25),
      C.night1,
      mix(C.night1, C.night2, 0.5),
      C.night2,
      mix(C.night2, C.day1, 0.18),
    ],
  }[phase]
  const dark = phase === 'night'
  const deck = dark
    ? mix(C.night1, C.mute, 0.45)
    : mix(C.ground, C.mute, phase === 'day' ? 0.15 : 0.35)
  if (row === 'fine' || row === 'clouds') return keys
  if (row === 'overcast') return keys.map((k) => mix(k, deck, 0.6))
  if (row === 'snow')
    return keys.map((k) => mix(k, dark ? deck : mix(C.ground, C.surface, 0.4), 0.7))
  if (row === 'fog') return keys.map((k) => mix(k, dark ? deck : C.ground, 0.8))
  // rain: dark and flat, two bands from the deck
  const wet = mix(deck, C.ink, dark ? 0.35 : 0.3)
  return [mix(wet, keys[0], 0.15), mix(wet, keys[keys.length - 1], 0.2)]
}

// the cell at (X, Y) of a tone at `lvl` sixteenths takes the next colour when
// its Bayer threshold is under the level: bayerGlyph(lvl), where the half
// cell falls in it
// seam: test/outlook.test.js
export const dithered = (X, Y, lvl) => BAYER4[(Y & 3) * 4 + (X & 3)] < lvl

// ---- noise ---------------------------------------------------------------------

// a stable pseudo-random number for an index and a salt, so every visitor
// and every tab sees the same sky
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
// the cloud field repeats every WRAP cells sideways, so a lump that drifts
// off one side comes back on the other whole, and a full lap comes home
const WRAP = 96
// Value noise on a lattice `sx` cells wide and `sy` tall, smoothed between
// its points, wrapping at WRAP across. Stretched sideways, it is the long
// runs of layered air and wisp.
function noise(x, y, sx, sy, salt) {
  const n = WRAP / sx
  const gx = x / sx
  const gy = y / sy
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const s = (t) => t * t * (3 - 2 * t)
  const fx = s(gx - x0)
  const fy = s(gy - y0)
  const v = (i, j) => hash(mod(i, n) + j * 131, salt)
  const a = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx
  const b = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx
  return a * (1 - fy) + b * fy
}

// how far a band edge is pushed, in bands, at a cell: ragged in sideways
// runs, still on whole cells (the sky's edges are drawn in the same cell as
// everything in it)
// seam: test/outlook.test.js
export const RAGGED = 0.45
// (the same for every frame, so it is worked out once, a cell at a time)
const RAG = Float32Array.from({ length: CELLS * CELLS }, (_, i) => {
  const x = i % CELLS
  const y = (i - x) / CELLS
  return (noise(x, y, 12, 2, 21) * 0.7 + noise(x, y, 4, 1, 23) * 0.3 - 0.5) * 2 * RAGGED
})
const ragged = (x, y) => RAG[y * CELLS + x]

// ---- sprites -------------------------------------------------------------------

// Row form (canvas/pixel-sprite.js), one character a cell: p the bright
// face, h its halo, dithered half into the sky round it, . sky.
// seam: test/outlook.test.js
export const SUN_ROWS = [
  '...hhhhh...',
  '.hhppppphh.',
  '.hppppppph.',
  'hhppppppphh',
  'hppppppppph',
  'hppppppppph',
  'hppppppppph',
  'hhppppppphh',
  '.hppppppph.',
  '.hhppppphh.',
  '...hhhhh...',
]

// the moon is a disc; which of it is lit is the phase's business, not the
// sprite's. m is a sea, darker, and only shows on the lit side.
const MOON_ROWS = [
  '..ppppp..',
  '.ppppppp.',
  'ppmmppppp',
  'ppmmppmpp',
  'ppppppppp',
  'pppppmmpp',
  'ppmppmmpp',
  '.ppppppp.',
  '..ppppp..',
]

// where a sprite's top-left cell sits for an arc: across the sky left to
// right, highest at the middle, its centre on the horizon at 0 and 1 and
// under it before and after (a sine, carried on straight past its ends)
// seam: test/outlook.test.js
export function arcAt(rows, arc, peak) {
  const w = rows[0].length
  const h = rows.length
  const sky = SKY_H / RES
  const up = arc < 0 ? arc * Math.PI : arc > 1 ? (1 - arc) * Math.PI : Math.sin(Math.PI * arc)
  const inset = FRAME / RES + 9
  const x = Math.round(inset + Math.max(-0.1, Math.min(1.1, arc)) * (CELLS - 2 * inset) - w / 2)
  const y = Math.round(FRAME / RES + sky - up * sky * peak - h / 2)
  return [x, y]
}

// Is the cell at (x, y) of the moon disc lit, at an age through the month?
// The terminator is an ellipse across the disc; the lit side grows from the
// right while it waxes and shrinks to the left while it wanes (as seen from
// the northern hemisphere, which is where the window is).
// seam: test/outlook.test.js
export function moonLit(x, y, age) {
  const h = MOON_ROWS.length
  const w = MOON_ROWS[0].length
  const u = ((x + 0.5) / w) * 2 - 1
  const v = ((y + 0.5) / h) * 2 - 1
  const half = Math.sqrt(Math.max(0, 1 - v * v))
  if (Math.abs(u) > half) return false
  const edge = half * Math.cos(2 * Math.PI * age)
  return age < 0.5 ? u > edge : u < -edge
}

// ---- the weather ---------------------------------------------------------------

// How a row's clouds sit: `cover` is how much of the sky is cloud at the
// top and at the horizon (0 none, 1 all), `sx`/`sy` the grain of the field
// (long and thin for wisps and fog), and `thick` whether the densest part
// is the darkest (a deck) or the brightest (a fair cloud).
const DECK = {
  clouds: { cover: [0.14, 0.46], sx: 16, sy: 3, thick: false },
  overcast: { cover: [0.7, 0.6], sx: 16, sy: 3, thick: true },
  rain: { cover: [0.85, 0.7], sx: 16, sy: 2, thick: true },
  snow: { cover: [0.72, 0.55], sx: 16, sy: 3, thick: true },
  fog: { cover: [0.1, 0.6], sx: 32, sy: 2, thick: false },
}
// The deck at a step, on the cell grid: 0 sky, then 1 thin, 2 body, 3 the
// densest part. The field is two octaves of the wrapping noise, stretched
// sideways, with the cover eased from the top of the sky to the horizon.
// seam: test/outlook.test.js
export function cloudCells(row, step, px = 0, py = 0) {
  const g = new Uint8Array(CELLS * CELLS)
  const d = DECK[row]
  if (!d) return g
  const drift = Math.floor(step / (row === 'fog' ? 16 : 8))
  for (let y = 0; y < CELLS; y++) {
    const cover = d.cover[0] + (d.cover[1] - d.cover[0]) * (y / CELLS)
    const cut = 1 - cover
    for (let x = 0; x < CELLS; x++) {
      const X = x - drift - px
      const Y = y - py
      const salt = 31 + ROWS.indexOf(row) * 7
      const n =
        noise(X, Y, d.sx, d.sy, salt) * 0.68 + noise(X, Y, d.sx / 2, d.sy / 2, salt + 1) * 0.32
      if (n <= cut) continue
      const over = (n - cut) / Math.max(0.05, 1 - cut)
      g[y * CELLS + x] = over < 0.18 ? 1 : over < 0.5 ? 2 : 3
    }
  }
  return g
}

// the rain and snow lit at a step, as [X, Y] in half cells. Rain is a
// three-half-cell streak falling four a step; snow is a flake falling one a
// step and swaying a half cell either side.
// seam: test/outlook.test.js
export function particles(row, cond, step) {
  const out = []
  const n = weight(cond)
  if (row === 'rain') {
    for (let X = SKY0; X < SKY1; X++) {
      if (hash(X, 5) > n / 6) continue
      const Y = SKY0 + mod(Math.floor(hash(X, 6) * SKY_H) + step * 4, SKY_H)
      for (let k = 0; k < 3; k++) out.push([X, SKY0 + mod(Y - SKY0 + k, SKY_H)])
    }
  } else if (row === 'snow') {
    for (let i = 0; i < 14 * n; i++) {
      const sway = mod((step >> 3) + i, 4)
      const X = SKY0 + Math.floor(hash(i, 7) * (SKY_H - 2)) + (sway === 1 ? 1 : sway === 3 ? -1 : 0)
      const Y = SKY0 + mod(Math.floor(hash(i, 8) * SKY_H) + step, SKY_H)
      const big = hash(i, 9) < 0.5
      out.push([X, Y])
      if (big) out.push([X + 1, Y], [X, Y + 1], [X + 1, Y + 1])
    }
  }
  return out
}

// Stars, fixed in the upper sky and thinning toward the horizon: most a
// half cell, some a whole cell, a few a four-point sparkle. Each goes out
// for one step in about sixty.
const STARS = Array.from({ length: 44 }, (_, i) => {
  const r = hash(i, 12)
  return [
    SKY0 + 3 + Math.floor(hash(i, 10) * (SKY_H - 6)),
    SKY0 + 3 + Math.floor(hash(i, 11) ** 1.6 * SKY_H * 0.7),
    r < 0.12 ? 'spark' : r < 0.4 ? 'big' : 'dot',
  ]
})
// seam: test/outlook.test.js
export const twinkling = (i, step) => hash(i, 13 + step) < 1 / 60

// ---- the push ------------------------------------------------------------------

// The shared offset, in cells: where a push has put the clouds against
// where the weather has them. A push adds to its speed, a step moves
// it by its speed, and a spring pulls it home while the speed bleeds away,
// so a sweep throws the clouds and they ease back. It is capped both ways,
// so no hand can push the sky off the tile, and it snaps to rest when it is
// under half a cell, so a settled sky sends nothing.
// seam: test/outlook.test.js
export const PUSH_MAX = 24
// the most one push frame may say, either way, in cells
// seam: test/outlook.test.js
export const PUSH_IN = 6
const GAIN = 0.5
const SPRING = 0.06
const DAMP = 0.8
const VMAX = 4
const clamp = (v, a) => Math.max(-a, Math.min(a, v))

// seam: test/outlook.test.js
export const createPush = () => ({ x: 0, y: 0, vx: 0, vy: 0 })

/** A hand's impulse, whole cells either way, each capped at PUSH_IN. */
// seam: test/outlook.test.js
export function shove(p, dx, dy) {
  p.vx = clamp(p.vx + clamp(dx, PUSH_IN) * GAIN, VMAX)
  p.vy = clamp(p.vy + clamp(dy, PUSH_IN) * GAIN, VMAX)
}

/** One step of the spring; at rest it stays exactly at rest. */
// seam: test/outlook.test.js
export function settle(p) {
  p.vx = (p.vx - SPRING * p.x) * DAMP
  p.vy = (p.vy - SPRING * p.y) * DAMP
  p.x = clamp(p.x + p.vx, PUSH_MAX)
  p.y = clamp(p.y + p.vy, PUSH_MAX)
  if (Math.abs(p.x) < 0.5 && Math.abs(p.y) < 0.5 && Math.hypot(p.vx, p.vy) < 0.1)
    Object.assign(p, createPush())
}

/** the offset as the whole cells a tab draws */
// seam: test/outlook.test.js
export const cellsOf = (p) => [Math.round(p.x) || 0, Math.round(p.y) || 0]

// Which layer a row lets a hand move: its clouds, if it has any. A clear
// sky has nothing to push, and the sun and the moon are never it.
// seam: test/sky.test.js
export const pushed = (row) => (DECK[row] ? 'clouds' : null)

// ---- the frame -----------------------------------------------------------------

// One still: the RGBA of the tile (SIZE x SIZE) for a payload, a moment
// (epoch ms) and a step. `c` is INKS resolved to hex strings. Every pixel is
// painted: the window is opaque. `push` is the room's offset in whole cells
// (cellsOf), moving the clouds and nothing else.
// seam: test/outlook.test.js
export function frame(weather, nowMs, step, c, push = [0, 0]) {
  const w = weather || {}
  const C = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, hex(v)]))
  const out = new Uint8ClampedArray(SIZE * SIZE * 4)
  const put = (X, Y, rgb) => {
    if (X < SKY0 || Y < SKY0 || X >= SKY1 || Y >= SKY1) return
    const i = (Y * SIZE + X) * 4
    out[i] = rgb[0]
    out[i + 1] = rgb[1]
    out[i + 2] = rgb[2]
    out[i + 3] = 255
  }
  const get = (X, Y) => {
    const i = (Y * SIZE + X) * 4
    return [out[i], out[i + 1], out[i + 2]]
  }
  const now = Number.isFinite(nowMs) ? nowMs / 1000 : 0
  const { phase, arc } = phaseOf(now, w)
  const row = rowOf(w.cond)
  const dark = phase === 'night'
  const low = phase === 'dawn' || phase === 'sunset'
  // thunder is heavy rain and no more: the sky never lights up on its own
  // (BIBLE.md section 0, nothing shakes, strobes or flashes)
  const list = bands(phase, row, C)
  const body = dark ? MOON_ROWS : SUN_ROWS
  const layer = pushed(row)
  const [px, py] = push.map((v) => clamp(Math.round(Number(v)) || 0, PUSH_MAX))
  // the disc sits on its arc: the push never reaches it
  const [bx, by] = arcAt(body, arc, dark ? 0.62 : 0.72)
  // the disc's centre, in cells
  const sx = bx + body[0].length / 2
  const sy = by + body.length / 2

  // the bands: the band index runs down the sky, pushed about by the ragged
  // edges, and pulled toward the warm end round a low sun (the mound)
  const n = list.length
  const lift = new Float32Array(CELLS * CELLS)
  if (low && row !== 'rain')
    for (let y = 0; y < CELLS; y++)
      for (let x = 0; x < CELLS; x++) {
        const d = Math.hypot((x - sx) / 1.5, y - sy) / (CELLS * 0.5)
        if (d < 1) lift[y * CELLS + x] = (1 - d) ** 1.2 * n * 0.5
      }
  for (let Y = SKY0; Y < SKY1; Y++)
    for (let X = SKY0; X < SKY1; X++) {
      const x = X >> 1
      const y = Y >> 1
      const p = ((Y - SKY0) / SKY_H) * n + (n > 2 ? ragged(x, y) : 0) + lift[y * CELLS + x]
      const k = Math.max(0, Math.min(n - 1, Math.floor(p)))
      const f = p - k
      const next = list[Math.min(n - 1, k + 1)]
      let c = list[k]
      if (f > 0.8) c = dithered(X, Y, 8) ? next : c
      else if (f > 0.6) c = dithered(X, Y, 4) ? next : c
      put(X, Y, c)
    }
  const horizon = list[n - 1]

  // the stars, under everything, only on a sky with gaps in it
  if (dark && (row === 'fine' || row === 'clouds'))
    STARS.forEach(([X, Y, kind], i) => {
      if (twinkling(i, step)) return
      const dim = mix(C.surface, C.night2, 0.5)
      if (kind === 'dot') return put(X, Y, C.surface)
      put(X, Y, C.surface)
      put(X + 1, Y, C.surface)
      put(X, Y + 1, C.surface)
      put(X + 1, Y + 1, C.surface)
      if (kind === 'spark')
        for (const [dx, dy] of [
          [-2, 0],
          [-1, 0],
          [2, 0],
          [3, 0],
          [0, -2],
          [0, -1],
          [0, 2],
          [0, 3],
        ])
          put(X + dx, Y + dy, dim)
    })

  // the sun by day (dawn and sunset included), the moon by night; rain
  // hides it. A fair cloud passes in front of it; a deck it shows through,
  // pale, so it is drawn after the deck.
  const age = moonAge(now)
  const disc = () => {
    const face = dark ? mix(C.surface, C.ground, 0.15) : low ? mix(C.sun, C.surface, 0.35) : C.sun
    const halo = low ? C.glow : mix(C.sun, C.day2, 0.4)
    const seas = mix(face, C.mute, 0.45)
    // the moon's dark side is the sky with a breath of earthshine
    const unlit = (rgb) => mix(rgb, face, 0.1)
    const veil = row === 'fine' || row === 'clouds' ? 0 : row === 'fog' ? 0.6 : 0.35
    body.forEach((r, y) =>
      [...r].forEach((ch, x) => {
        if (ch === '.') return
        const lit = !dark || moonLit(x, y, age)
        for (let j = 0; j < RES; j++)
          for (let i = 0; i < RES; i++) {
            const X = (bx + x) * RES + i
            const Y = (by + y) * RES + j
            if (X < SKY0 || Y < SKY0 || X >= SKY1 || Y >= SKY1) continue
            const under = get(X, Y)
            let rgb
            if (ch === 'h') rgb = dithered(X, Y, 8) ? halo : under
            else if (!lit) rgb = unlit(under)
            else rgb = ch === 'm' ? seas : face
            put(X, Y, veil ? mix(rgb, under, veil) : rgb)
          }
      })
    )
  }
  const hidden = row === 'rain'
  const behind = row === 'fine' || row === 'clouds'
  if (!hidden && behind) disc()

  // the deck, on whole cells, three tones from the light it sits in, each
  // mixed into the sky under it so a cloud takes the colour of its hour
  const g = layer === 'clouds' ? cloudCells(row, step, px, py) : cloudCells(row, step)
  const d = DECK[row]
  if (d) {
    const lit = dark
      ? mix(C.night2, C.mute, 0.45)
      : phase === 'day'
        ? C.surface
        : phase === 'dawn'
          ? mix(C.surface, C.rose, 0.35)
          : mix(C.glow, C.rose, 0.5)
    const shade = dark
      ? mix(C.night1, C.ink, 0.2)
      : row === 'rain'
        ? mix(horizon, C.ink, 0.3)
        : mix(C.mute, phase === 'day' ? C.day1 : C.rose, 0.3)
    const tone = (t, under) =>
      row === 'fog'
        ? mix(under, dark ? C.mute : C.ground, [0, 0.35, 0.6, 0.8][t])
        : d.thick
          ? t === 3
            ? mix(under, shade, 0.22)
            : mix(under, lit, t === 1 ? 0.2 : 0.4)
          : mix(under, lit, [0, 0.35, 0.65, 0.9][t])
    const seen = new Map()
    for (let y = 0; y < CELLS; y++)
      for (let x = 0; x < CELLS; x++) {
        const t = g[y * CELLS + x]
        if (!t) continue
        for (let j = 0; j < RES; j++)
          for (let i = 0; i < RES; i++) {
            const X = x * RES + i
            const Y = y * RES + j
            if (X < SKY0 || Y < SKY0 || X >= SKY1 || Y >= SKY1) continue
            const o = (Y * SIZE + X) * 4
            // the sky under a deck has a handful of colours: mix each once
            const at = t * 16777216 + out[o] * 65536 + out[o + 1] * 256 + out[o + 2]
            let rgb = seen.get(at)
            if (!rgb) seen.set(at, (rgb = tone(t, get(X, Y))))
            put(X, Y, rgb)
          }
      }
  }
  if (!hidden && !behind) disc()

  // what falls, clean over everything, because it is nearer than the sky
  const drop = lum(horizon) > 0.55 ? mix(C.day1, C.ink, 0.3) : mix(C.day2, C.surface, 0.4)
  for (const [X, Y] of particles(row, w.cond, step)) put(X, Y, row === 'snow' ? C.surface : drop)

  // the frame: one ink line, one cell wide
  for (let Y = 0; Y < SIZE; Y++)
    for (let X = 0; X < SIZE; X++) {
      if (Math.min(X, Y, SIZE - 1 - X, SIZE - 1 - Y) >= FRAME) continue
      const i = (Y * SIZE + X) * 4
      out[i] = C.ink[0]
      out[i + 1] = C.ink[1]
      out[i + 2] = C.ink[2]
      out[i + 3] = 255
    }
  return out
}
