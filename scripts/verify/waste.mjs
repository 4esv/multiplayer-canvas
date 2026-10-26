// scripts/verify/waste.mjs
// WHAT THE DISH COSTS, IN NUMBERS. The pure half of the audit,
// no server and no browser: a node, a byte, an allocation and a scan are
// resources, and this prints what each one costs so a change can say what it
// moved. The browser half (DOM nodes at boot) is scripts/verify/boot-dom.mjs;
// the socket half (idle bytes/s) is test/waste.test.js.
//
// Measured over a seeded dish run for WARM ticks and then FRAMES frames of
// the service's shape (FRAME_MS / TICK_MS ticks apart), the same arithmetic
// primitives/slime/slime.js runs:
//   tick       ms per server tick (step + the standing-food count)
//   count      us per pelletCount
//   decode     heap bytes allocated per keyframe decode and per delta applied
//   paint      canvas calls per painted frame, full and (when paintDish
//              exists) delta-only
//
// Allocation is heapUsed across a run with the young generation made large
// enough that no scavenge lands inside it, so the delta is what was
// allocated, not what survived. It is JS HEAP: a typed array's backing
// store is external memory and is not in it, before or after, so the
// output arrays (8184 + 2046 bytes a keyframe) are the same on both sides
// and not counted. The script re-runs itself with the flags.
//
// Usage: node scripts/verify/waste.mjs
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'

if (!process.env.WASTE_CHILD) {
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-semi-space-size=256', import.meta.filename],
    { stdio: 'inherit', env: { ...process.env, WASTE_CHILD: '1' } }
  )
  process.exit(r.status ?? 1)
}

const S = await import('multiplayer-canvas/slime')
const { TICK_MS, FRAME_MS, STANDING } = await import('multiplayer-canvas/slime/server')

const WARM = 2000
const FRAMES = 200
const PER_FRAME = Math.round(FRAME_MS / TICK_MS)

const s = S.createSlime(264)
for (let i = 0; i < STANDING; i++) S.feed(s, ...S.randomCell(s.rand))
for (let i = 0; i < WARM; i++) S.step(s)

// ---- the frames the wire would carry ------------------------------------------
const keys = []
const deltas = []
const toneRuns = []
let prev = S.tones(s)
let prevFood = S.foodCells(s)
for (let f = 0; f < FRAMES; f++) {
  for (let i = 0; i < PER_FRAME; i++) S.step(s)
  const cur = S.tones(s)
  keys.push(S.encode(s))
  deltas.push(S.encodeDelta(prev, cur))
  const food = S.foodCells(s)
  toneRuns.push({ prev, cur, food, prevFood })
  prev = cur
  prevFood = food
}

// ---- ms per tick ----------------------------------------------------------------
const t0 = performance.now()
const TICKS = 1000
for (let i = 0; i < TICKS; i++) {
  S.step(s)
  S.pelletCount(s)
}
const tickMs = (performance.now() - t0) / TICKS
const c0 = performance.now()
const COUNTS = 20000
let sink = 0
for (let i = 0; i < COUNTS; i++) sink += S.pelletCount(s)
const countUs = ((performance.now() - c0) / COUNTS) * 1000

// ---- bytes allocated per decode ---------------------------------------------------
function allocated(fn, n) {
  globalThis.gc()
  const h0 = process.memoryUsage().heapUsed
  for (let i = 0; i < n; i++) fn(i)
  const h1 = process.memoryUsage().heapUsed
  return (h1 - h0) / n
}
// warm the JIT on both paths first, so a compile is not billed as a frame
for (let i = 0; i < FRAMES; i++) S.decode(keys[i].g, keys[i].f)
for (let i = 0; i < FRAMES; i++) S.applyDelta(toneRuns[i].prev, deltas[i])
const keyBytes = allocated((i) => S.decode(keys[i % FRAMES].g, keys[i % FRAMES].f), FRAMES)
const deltaBytes = allocated((i) => S.applyDelta(toneRuns[i].prev, deltas[i]), FRAMES)

// ---- canvas calls per painted frame ------------------------------------------------
// a context that only counts: the full paint is the one app.js did before
// the delta (clear, then every lit cell, then every food cell), counted the same
// way whether or not paintDish exists, so the before is measurable on main
const counter = () => {
  const c = { calls: 0 }
  c.clearRect = () => c.calls++
  c.fillRect = () => c.calls++
  return c
}
let full = 0
for (const r of toneRuns) {
  let n = 1
  for (let k = 0; k < r.cur.length; k++) if (r.cur[k]) n++
  full += n + r.food.length / 2
}
full /= FRAMES
let delta = null
let changed = 0
for (const r of toneRuns)
  for (let k = 0; k < r.cur.length; k++) if (r.cur[k] !== r.prev[k]) changed++
changed /= FRAMES
if (S.paintDish) {
  const ink = ['', 'sage', 'mute', 'ink']
  let n = 0
  for (const r of toneRuns) {
    const ctx = counter()
    S.paintDish(ctx, r.cur, r.food, ink, 'ochre', r.prev, r.prevFood)
    n += ctx.calls
  }
  delta = n / FRAMES
}

const fmt = (v, d = 1) => (v === null ? 'n/a' : v.toFixed(d))
console.log(`dish waste, seed 264, ${WARM} warm ticks, ${FRAMES} frames of ${PER_FRAME} ticks`)
console.log(`  tick           ${fmt(tickMs, 3)} ms (step + pelletCount)`)
console.log(`  pelletCount    ${fmt(countUs, 2)} us`)
console.log(`  keyframe       ${fmt(keyBytes, 0)} B heap allocated per decode`)
console.log(`  delta          ${fmt(deltaBytes, 0)} B heap allocated per applyDelta`)
console.log(`  cells changed  ${fmt(changed)} per frame`)
console.log(`  paint full     ${fmt(full)} canvas calls per frame`)
console.log(`  paint delta    ${fmt(delta)} canvas calls per frame`)
if (sink < 0) console.log(sink)
