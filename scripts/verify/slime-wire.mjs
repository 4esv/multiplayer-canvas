// scripts/verify/slime-wire.mjs
// Against a real socket: WHAT THE DISH COSTS A TAB.
//
// Three clients on /ws/cursors, measured over the same window:
//   absent   never says it can see the dish (a hidden tab, or one with the
//            dish off camera, after its first keyframe)
//   present  says {type:'watch', on:true} once and holds it
//   returns  says yes, then no for the middle of the window, then yes again
// and prints bytes/s of slime frames for each, frames counted by kind. The
// server end is what is measured here; the browser end (that a hidden tab
// says no, that an off-camera dish says no) is source-guarded in
// test/slime.test.js.
//
// The number this replaced (2026-09-17, same probe shape, before the
// change): every open tab 11.1 KB/s, 3.8 frames/s of 2855 bytes.
//
// Runs against a served build (`npm start` locally). Usage:
//   node scripts/verify/slime-wire.mjs [baseUrl] [seconds]
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const SECONDS = Number(process.argv[3] || 20)
const url = BASE.replace(/^http/, 'ws') + '/ws/cursors'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function client(name) {
  const ws = new WebSocket(url)
  const c = {
    name,
    ws,
    bytes: 0,
    frames: 0,
    keys: 0,
    deltas: 0,
    first: 0,
    open: false,
    counting: false,
  }
  ws.addEventListener('open', () => (c.open = true))
  ws.addEventListener('message', (e) => {
    const text = String(e.data)
    let m
    try {
      m = JSON.parse(text)
    } catch {
      return
    }
    if (m.type !== 'slime') return
    if (!c.first) c.first = text.length
    if (!c.counting) return
    c.bytes += text.length
    c.frames++
    if (typeof m.g === 'string') c.keys++
    else c.deltas++
  })
  c.watch = (on) => ws.send(JSON.stringify({ type: 'watch', on }))
  return c
}

const absent = client('absent')
const present = client('present')
const returns = client('returns')
const all = [absent, present, returns]
for (let i = 0; i < 50 && !all.every((c) => c.open); i++) await sleep(100)
if (!all.every((c) => c.open)) {
  console.error(`no socket opened on ${url}`)
  process.exit(2)
}
// one keyframe for the absent tab, as a tab that opened on the dish and
// then hid would have had; then it says no and is never heard from again
absent.watch(true)
await sleep(300)
absent.watch(false)
present.watch(true)
returns.watch(true)
await sleep(300)
for (const c of all) c.counting = true
const t0 = Date.now()
await sleep((SECONDS * 1000) / 3)
returns.watch(false)
await sleep((SECONDS * 1000) / 3)
returns.watch(true)
await sleep((SECONDS * 1000) / 3)
const secs = (Date.now() - t0) / 1000
for (const c of all) c.counting = false

let bad = false
console.log(`slime wire over ${secs.toFixed(1)}s against ${BASE}`)
for (const c of all) {
  const bps = c.bytes / secs
  console.log(
    `  ${c.name.padEnd(8)} ${bps.toFixed(0).padStart(6)} B/s  ${(c.frames / secs).toFixed(1)} frames/s  ` +
      `keyframes ${c.keys}  deltas ${c.deltas}  mean frame ${c.frames ? (c.bytes / c.frames).toFixed(0) : 0} B  first keyframe ${c.first} B`
  )
  if (c.name === 'absent' && c.bytes !== 0) bad = true
  if (c.name === 'present' && (c.keys !== 0 || c.deltas === 0)) bad = true
  if (c.name === 'returns' && c.keys !== 1) bad = true
}
const before = 11100
const per = present.bytes / secs
console.log(`  present tab against the 11.1 KB/s before: ${(before / per).toFixed(1)}x smaller`)
for (const c of all) c.ws.close()
if (bad) {
  console.error(
    'FAIL: an absent tab was sent frames, or a present tab was sent keyframes, or a returning tab did not get exactly one'
  )
  process.exit(1)
}
