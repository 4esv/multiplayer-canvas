// multiplayer-canvas/slime: a physarum slime mould in a round dish that finds the food you drop.
// Inputs: createSlime(seed), step(state), feed(state, x, y).
// Outputs: tones(state) per cell, foodCells(state), encode/decode for the wire, paintDish(ctx,
//   ...) to draw. Pure apart from paintDish, which takes a 2D context.
//
// slime.js: the slime mould, pure (BIBLE.md section 5).
// PORTED FROM sandbox/motion-lab/moves2.js, the `physarum` candidate, which
// is the picture that was wanted: "Slime mould finds the roads". The rules,
// the numbers and the three tones are the lab's, moved into a round dish
// with a wall instead of a torus and given food to find. Issue #254 records the
// attempt before this one, written from the Jones (2010) ground with the lab
// running ten lines away; it drew slabs. The rule since: port the neighbour,
// do not re-derive it.
//
// No DOM, no timers, no globals, no Math.random: same seed, same steps,
// same picture. The server runs the ONE copy that counts (services/slime.js),
// visitors or not, and ships the picture over the presence wire as cell
// data; the browser only decodes and paints. This file is in the static tree
// so node and the browser import the same arithmetic rather than a copy (the
// same arrangement as canvas/layout.js and js/textmode-settings.js).
import { PX } from '../grid.js'

// The dish is the circle that circumscribes a 5x5 square, on the cell:
// 240 * sqrt2 = 339.4px, so 86 cells (344px) is the smallest even cell
// count that holds it, and it sits inside the 8x8 tile (the snap,
// 2026-09-27; it was 102 cells round a 6x6 in a 9x9). Even, so the dish's
// centre is a cell corner and the picture is mirror-symmetric on the lattice.
export const DISH = 86
// seam: test/slime.test.js
export const DISH_PX = DISH * PX
// a CIRCLE, rasterised: a cell is inside when its centre is within the
// radius, so the rim is the staircase of whole cells every circle on this
// ground is (the exponent is here because the dish was a rounded square for an
// afternoon; two is a circle, and the 5x5 square sits on its diagonal)
const SHAPE_N = 2
// the name under the dish is two lines of the label hand, a gap of a cell
// and a half above them and one label pixel (half a cell) between them:
// the label hand's own pixel is half a cell, so both gaps sit on that grid.
// The dish is 344px in the 384px tile and the name hangs off its south
// edge past the tile's, an overhang the way the mark hangs off the
// hero (layout.js TILES 'slime': 8 x 8; test/slime.test.js holds that the
// overhang stays inside the air)
export const LABEL_GAP = PX + PX / 2
export const LINE_GAP = PX / 2

// ---- the lab's numbers, and two measured departures --------------------------------
// moves2.js: smell three cells at SA either side and SD ahead, turn 0.5
// toward the strongest, jitter 0.9 on a tie, step one cell, drop 1.4, and
// each tick the trail is the 3x3 mean times 0.92, with 900 agents on a
// card. Ported and measured (2026-09-17, headless, the lab's own page): the
// lab's colony is roads for its first hundred ticks and ONE slab by tick
// two hundred, and the lab hides that by restarting every three hundred. A
// dish that runs for days cannot restart, so two numbers moved, chosen by a
// sweep of 128 combinations against a thinness metric (ink perimeter over
// ink area) with five standing pellets at tick 2000: the trail forgets
// faster (0.85, not 0.92: every one of the ten thinnest dishes had it) and
// the colony is thinner (8.6% of the cells, against the lab's 12%). With
// those two, the veins stay veins and connect the food; with the lab's,
// they merge into a band whatever the food does. The share is the number,
// not the count: 700 agents in the 102-cell dish, 500 in the 86 (the snap,
// 2026-09-27; kept at 700 the smaller dish ran at 12% and measured thicker,
// the same metric over the mute and ink cells at tick 2000, five seeds,
// 0.407 against the old dish's 0.441, and at 500 it is 0.437).
export const PARAMS = Object.freeze({
  agents: 500,
  sensorAngle: 0.5, // SA
  sensorDist: 5, // SD, cells
  turn: 0.5,
  jitter: 0.9,
  deposit: 1.4,
  decay: 0.85,
  // the inoculation is the lab's: a clump of twelve cells at the centre,
  // so the colony grows out into roads rather than starting as a haze
  clump: 12,
  // FOOD is this file's addition (the lab has none). A pellet is a few
  // cells of mass. Food needs a gradient or it is invisible (a forager
  // smells five cells ahead, so a crumb across the dish would never be
  // found): each food cell feeds a SMELL field of its own that diffuses
  // like the trail and barely decays, and a forager steers on trail plus
  // smell. An agent standing on food eats a bite of it. Tuned offline so a
  // pellet across the dish is found within a few hundred ticks and lasts
  // several hundred more: a meal, not a monument (test/slime.test.js
  // measures both ends).
  // a pellet is a 3x3 crumb (2026-09-17, was a 21-cell blob: too big a
  // mark on a 102-cell dish). Fewer cells means less smell and fewer
  // mouths on it, so the mass per cell and the smell per cell both rose;
  // swept against the meal's length and the network's thinness together
  // (a minute, 0.65)
  pellet: 1.5,
  pelletRadius: 1,
  foodSmell: 1.6, // a food cell's addition to the smell field, a tick
  smellDecay: 0.998, // the smell field's forgetting: slow, so it reaches
  bite: 0.005,
})
// the lab's three tones, flat: ink over 2.4, mute over 1.1, mid over 0.45 (the grey ramp, #336; the lab drew it in sage)
// seam: test/slime.test.js
export const TONES = Object.freeze([0.45, 1.1, 2.4])

// ---- the dish mask -----------------------------------------------------------
// Which cells are inside the circle, and the list of them in row-major
// order: the wire carries only the inside cells, in this order, and both
// ends compute the order from this function rather than sending it.
const R = DISH / 2
export function inside(cx, cy) {
  // cell centres, measured from the dish's centre
  const x = Math.abs(cx + 0.5 - R) / R
  const y = Math.abs(cy + 0.5 - R) / R
  return x ** SHAPE_N + y ** SHAPE_N <= 1
}
// THE RIM IS CELL DATA (2026-09-17): the inside cells with a four-neighbour
// outside, as a boolean grid, the same shape gridOf() hands the label hand.
// app.js draws it with pathFromGrid and wires it to the dust like a label,
// so a cursor entering the dish breaks the rim the way it breaks a name.
export function rimGrid() {
  const g = Array.from({ length: DISH }, () => Array(DISH).fill(false))
  for (let y = 0; y < DISH; y++)
    for (let x = 0; x < DISH; x++)
      g[y][x] =
        inside(x, y) &&
        !(inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1))
  return g
}
// seam: test/slime.test.js
export const MASK = (() => {
  const m = new Uint8Array(DISH * DISH)
  for (let y = 0; y < DISH; y++)
    for (let x = 0; x < DISH; x++) m[y * DISH + x] = inside(x, y) ? 1 : 0
  return m
})()
// seam: test/slime.test.js, test/waste.test.js
export const CELLS = (() => {
  const c = []
  for (let i = 0; i < MASK.length; i++) if (MASK[i]) c.push(i)
  return Int32Array.from(c)
})()
// the wire length of one frame: two bits a cell, four cells a byte
// seam: test/slime.test.js
export const FRAME_BYTES = Math.ceil(CELLS.length / 4)

// ---- the rng: mulberry32, seeded, so a test can replay a run -----------------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- the state ------------------------------------------------------------------
/**
 * @param {number} seed
 * @param {Partial<typeof PARAMS>} [p]
 */
export function createSlime(seed = 1, p = {}) {
  const params = { ...PARAMS, ...p }
  const rand = rng(seed)
  const n = params.agents
  const ax = new Float32Array(n)
  const ay = new Float32Array(n)
  const ah = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    ax[i] = R + (rand() - 0.5) * params.clump
    ay[i] = R + (rand() - 0.5) * params.clump
    ah[i] = rand() * Math.PI * 2
  }
  return {
    w: DISH,
    trail: new Float32Array(DISH * DISH),
    scratch: new Float32Array(DISH * DISH),
    food: new Float32Array(DISH * DISH),
    smell: new Float32Array(DISH * DISH),
    scratch2: new Float32Array(DISH * DISH),
    ax,
    ay,
    ah,
    rand,
    tick: 0,
    // how many cells hold food right now: feed() adds the cells it covers,
    // step() recounts in the smell pass it already runs over every cell, so
    // pelletCount is a division and not a scan of the dish (issue #264)
    fed: 0,
    p: params,
  }
}

// the lab's smell(), with the torus swapped for the dish and the food's
// own field added to the trail: a cell outside the circle smells of
// nothing, and less than nothing, so the wall is never the strongest of
// the three
const smell = (s, x, y) => {
  const cx = Math.floor(x)
  const cy = Math.floor(y)
  if (cx < 0 || cy < 0 || cx >= DISH || cy >= DISH) return -1
  const i = cy * DISH + cx
  return MASK[i] ? s.trail[i] + s.smell[i] : -1
}
// the 3x3 mean over the cells inside the dish (fewer than nine at the
// wall), times a decay, from `src` into `dst`
function blur(src, dst, decay) {
  for (let k = 0; k < CELLS.length; k++) {
    const i = CELLS[k]
    const x = i % DISH
    const y = (i - x) / DISH
    let sum = 0
    let cnt = 0
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= DISH) continue
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= DISH) continue
        const j = yy * DISH + xx
        if (!MASK[j]) continue
        sum += src[j]
        cnt++
      }
    }
    dst[i] = (sum / cnt) * decay
  }
}

/** Advance the dish one step (the lab's tick, minus the paint). */
export function step(s) {
  const { p, trail, food, ax, ay, ah, rand } = s
  const n = ax.length
  const { sensorAngle: SA, sensorDist: SD } = p
  for (let i = 0; i < n; i++) {
    let a = ah[i]
    const x = ax[i]
    const y = ay[i]
    const l = smell(s, x + Math.cos(a - SA) * SD, y + Math.sin(a - SA) * SD)
    const c = smell(s, x + Math.cos(a) * SD, y + Math.sin(a) * SD)
    const r = smell(s, x + Math.cos(a + SA) * SD, y + Math.sin(a + SA) * SD)
    if (c >= l && c >= r) {
      /* straight on */
    } else if (l > r) a -= p.turn
    else if (r > l) a += p.turn
    else a += (rand() - 0.5) * p.jitter
    const nx = x + Math.cos(a)
    const ny = y + Math.sin(a)
    const cx = Math.floor(nx)
    const cy = Math.floor(ny)
    if (cx >= 0 && cy >= 0 && cx < DISH && cy < DISH && MASK[cy * DISH + cx]) {
      ax[i] = nx
      ay[i] = ny
      ah[i] = a
      const ci = cy * DISH + cx
      trail[ci] += p.deposit
      if (food[ci] > 0) food[ci] = Math.max(0, food[ci] - p.bite)
    } else {
      // the wall (the lab wraps; a dish cannot): the agent stays and turns
      // back into the dish, the way one that smelled a stronger trail would
      ah[i] = a + Math.PI + (rand() - 0.5) * p.jitter
    }
  }
  // the food's smell: each food cell adds to the field, which diffuses
  // like the trail and barely decays, so a pellet is smelled from across
  // the dish and the colony sends a vein to it
  const sm = s.smell
  let fed = 0
  for (let k = 0; k < CELLS.length; k++) {
    const i = CELLS[k]
    if (food[i] > 0) {
      sm[i] += p.foodSmell * Math.min(1, food[i] / p.pellet)
      fed++
    }
  }
  s.fed = fed
  blur(sm, s.scratch2, p.smellDecay)
  s.smell = s.scratch2
  s.scratch2 = sm
  // diffuse and evaporate: "without the forgetting there are no roads, only
  // a field that is uniformly trodden"
  blur(trail, s.scratch, p.decay)
  s.trail = s.scratch
  s.scratch = trail
  s.tick++
  return s
}

/**
 * Drop a pellet of food centred on a cell. Outside the dish, nothing
 * happens and false comes back: the wire is public, so the caller's
 * coordinates are a claim, not a fact.
 * @returns {boolean}
 */
export function feed(s, cx, cy) {
  if (!Number.isInteger(cx) || !Number.isInteger(cy)) return false
  if (cx < 0 || cy < 0 || cx >= DISH || cy >= DISH || !inside(cx, cy)) return false
  const r = s.p.pelletRadius
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= DISH || y >= DISH || !inside(x, y)) continue
      const i = y * DISH + x
      if (!(s.food[i] > 0)) s.fed++
      s.food[i] = s.p.pellet
    }
  return true
}

// the cells one drop covers, counted from the shape feed() paints with the
// radius the STATE carries (issue #261: a dish with an override counted its
// pellets against the default shape). A rim drop paints fewer, so a pellet
// on the rim counts as a fraction; that is kept, the count is a measure of
// food and not of taps
// seam: test/slime.test.js
export function pelletCells(s) {
  const r = s.p.pelletRadius
  let n = 0
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) n++
  return n
}
/**
 * How many pellets the dish holds right now (a pellet is one drop's cells).
 * Read off the count feed() and step() keep, not a scan: the service asks
 * this every tick, eleven times a second, and the scan was 8184 cells to
 * learn a number step() had just walked past (issue #264). A caller that
 * writes s.food by hand is right again after the next step.
 */
export function pelletCount(s) {
  return s.fed / pelletCells(s)
}
// the default drop's cells, for anyone reasoning about the wire without a dish
// seam: test/slime.test.js
export const PELLET_CELLS = pelletCells({ p: PARAMS })

/** A cell inside the dish, at random: where the room drops food on its own. */
export function randomCell(rand) {
  for (;;) {
    const x = Math.floor(rand() * DISH)
    const y = Math.floor(rand() * DISH)
    if (inside(x, y)) return [x, y]
  }
}

// ---- the wire ----------------------------------------------------------------------
// A frame is two things: the TRAIL as the inside cells in CELLS order, two
// bits each (0 ground, 1 mid, 2 mute, 3 ink: the lab's tones, so the wire
// carries what is drawn and nothing finer), four cells a byte, base64; and
// the FOOD as a flat list of cell coordinates, which is short because food
// is rare. ~3.2 KB of text a frame.
const toneOf = (v) => (v > TONES[2] ? 3 : v > TONES[1] ? 2 : v > TONES[0] ? 1 : 0)
export function tones(s) {
  const out = new Uint8Array(CELLS.length)
  for (let k = 0; k < CELLS.length; k++) out[k] = toneOf(s.trail[CELLS[k]])
  return out
}
export function foodCells(s) {
  const out = []
  for (let k = 0; k < CELLS.length; k++) {
    const i = CELLS[k]
    if (s.food[i] > 0) out.push(i % DISH, (i - (i % DISH)) / DISH)
  }
  return out
}
function pack(tn) {
  const b = new Uint8Array(FRAME_BYTES)
  for (let k = 0; k < tn.length; k++) b[k >> 2] |= (tn[k] & 3) << (6 - 2 * (k & 3))
  return b
}
function unpack(b) {
  const tn = new Uint8Array(CELLS.length)
  for (let k = 0; k < tn.length; k++) tn[k] = (b[k >> 2] >> (6 - 2 * (k & 3))) & 3
  return tn
}
// base64 without depending on Buffer or atob being present: both ends have
// one of them, neither has both, and the frame is small enough that a plain
// loop is not worth two code paths
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function toBase64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '='
    out += i + 2 < bytes.length ? B64[c & 63] : '='
  }
  return out
}
// the reverse table, char code to six bits (-1: not in the alphabet)
const B64_INV = (() => {
  const t = new Int8Array(128).fill(-1)
  for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i
  return t
})()
// ONE allocation, the output (issue #264): this ran four times a second on
// every watching tab and made an array per four characters, ~680 a frame,
// plus a trimmed copy of the string
function fromBase64(str) {
  let len = str.length
  while (len && str.charCodeAt(len - 1) === 61) len-- // trailing '='
  const out = new Uint8Array(Math.floor((len * 3) / 4))
  let o = 0
  for (let i = 0; i < len; i += 4) {
    let n = 0
    for (let k = 0; k < 4; k++) {
      let v = 0
      if (i + k < len) {
        const c = str.charCodeAt(i + k)
        v = c < 128 ? B64_INV[c] : -1
        if (v < 0) return null
      }
      n = (n << 6) | v
    }
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length) out[o++] = (n >> 8) & 255
    if (o < out.length) out[o++] = n & 255
  }
  return out
}
/** the frame as it rides the wire: { g: trail, f: food } */
export const encode = (s) => ({ g: toBase64(pack(tones(s))), f: foodCells(s) })
const G_LEN = toBase64(new Uint8Array(FRAME_BYTES)).length
/**
 * @param {unknown} g the trail half
 * @param {unknown} f the food half
 * @returns {{tones:Uint8Array, food:number[]}|null} or null for a frame that is not one
 */
export function decode(g, f = []) {
  if (typeof g !== 'string' || g.length !== G_LEN) return null
  const b = fromBase64(g)
  if (!b || b.length !== FRAME_BYTES) return null
  if (!Array.isArray(f) || f.length % 2) return null
  const food = []
  for (let k = 0; k < f.length; k += 2) {
    const x = f[k]
    const y = f[k + 1]
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inside(x, y)) return null
    food.push(x, y)
  }
  return { tones: unpack(b), food }
}

// ---- the delta (issue #259, 2026-09-17) ----------------------------------------
// A watching tab holds the last picture the room sent, so the next frame
// need only carry the cells that changed: measured at steady state, 250 to
// 600 of 8184 a frame. Each change is one varint, seven bits a byte, high
// bit for "more": the gap since the previous changed cell (in CELLS order,
// so the reader walks the same list the keyframe does) shifted up two, the
// new tone in the low two bits. Base64 like the keyframe. The food list is
// sent only when it changed (services/slime.js), since it is the long half
// of a quiet frame.
export function encodeDelta(prev, cur) {
  const out = []
  let last = -1
  for (let k = 0; k < cur.length; k++) {
    if (cur[k] === prev[k]) continue
    let v = ((k - last - 1) << 2) | (cur[k] & 3)
    last = k
    for (;;) {
      if (v < 128) {
        out.push(v)
        break
      }
      out.push((v & 127) | 128)
      v >>>= 7
    }
  }
  return toBase64(Uint8Array.from(out))
}
/**
 * Apply a delta to the picture it was cut against.
 * @param {Uint8Array} tn the tones this tab holds (unchanged on failure)
 * @param {unknown} d the delta half of the frame
 * @returns {Uint8Array|null} the new tones, or null for a delta that is not one
 */
export function applyDelta(tn, d) {
  if (typeof d !== 'string' || d.length % 4) return null
  const b = fromBase64(d)
  if (!b) return null
  const out = Uint8Array.from(tn)
  let k = -1
  let v = 0
  let shift = 0
  for (let i = 0; i < b.length; i++) {
    v |= (b[i] & 127) << shift
    if (b[i] & 128) {
      shift += 7
      if (shift > 21) return null
      continue
    }
    k += (v >>> 2) + 1
    if (k >= out.length) return null
    out[k] = v & 3
    v = 0
    shift = 0
  }
  if (shift) return null // a varint cut off mid-number
  return out
}

// ---- the paint (issue #264) ------------------------------------------------------
// One backing pixel a cell. A keyframe (no `prev`) clears and paints every
// lit cell; a delta paints only the cells whose tone moved, plus the cells
// the old food covered when the food moved, and the food on top. At steady
// state that is ~430 calls where the full paint was ~1750, and the picture
// is the same pixel for pixel (test/waste.test.js paints both and compares).
// Pure over a 2D context, so node can count and check it.
// cell index -> its place in CELLS order
const K_OF = (() => {
  const t = new Int32Array(DISH * DISH).fill(-1)
  for (let k = 0; k < CELLS.length; k++) t[CELLS[k]] = k
  return t
})()
// the cells one delta repaints, reused frame to frame
const DIRTY = new Int32Array(CELLS.length * 2)
const sameList = (a, b) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
/**
 * @param {CanvasRenderingContext2D} ctx the dish canvas, DISH x DISH
 * @param {Uint8Array} tn the tones to show, CELLS order
 * @param {number[]} food food cells, flat x,y pairs
 * @param {string[]} ink fill for tones 1..3 (index 0 unused: ground is clear)
 * @param {string} live the food's fill (brick: food is live)
 * @param {Uint8Array|null} [prev] the tones the canvas holds now; omit for a full paint
 * @param {number[]} [prevFood] the food the canvas holds now
 */
export function paintDish(ctx, tn, food, ink, live, prev = null, prevFood = []) {
  if (!prev) {
    ctx.clearRect(0, 0, DISH, DISH)
    for (let t = 1; t <= 3; t++) {
      ctx.fillStyle = ink[t]
      for (let k = 0; k < CELLS.length; k++) {
        if (tn[k] !== t) continue
        const i = CELLS[k]
        const x = i % DISH
        ctx.fillRect(x, (i - x) / DISH, 1, 1)
      }
    }
  } else {
    let n = 0
    for (let k = 0; k < tn.length; k++) if (tn[k] !== prev[k]) DIRTY[n++] = k
    // food that moved leaves its cells to the tone underneath
    if (!sameList(food, prevFood))
      for (let j = 0; j < prevFood.length; j += 2) {
        const k = K_OF[prevFood[j + 1] * DISH + prevFood[j]]
        if (k >= 0 && n < DIRTY.length) DIRTY[n++] = k
      }
    for (let t = 0; t <= 3; t++) {
      let styled = false
      for (let j = 0; j < n; j++) {
        const k = DIRTY[j]
        if (tn[k] !== t) continue
        const i = CELLS[k]
        const x = i % DISH
        const y = (i - x) / DISH
        if (!t) {
          ctx.clearRect(x, y, 1, 1)
          continue
        }
        if (!styled) {
          ctx.fillStyle = ink[t]
          styled = true
        }
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }
  ctx.fillStyle = live
  for (let k = 0; k < food.length; k += 2) ctx.fillRect(food[k], food[k + 1], 1, 1)
}

// the geometry the tile builder and the guard share: the dish sits in the
// top left corner of an 8 x 8 module tile, its top and left edges the
// tile's, and the name hangs under it, centred under the dish. It was
// centred across the tile for a week, which left the ring three cells in
// from the tile's west edge and flush with its north one, so the painted
// circle lined up with nothing (the author: "I want the top and left to be
// lined up with the top and left of the tile for cleaner alignment").
// seam: test/slime.test.js
export const TILE_M = 8
export const dishBox = () => ({
  x: 0,
  y: 0,
  w: DISH_PX,
  h: DISH_PX,
})
