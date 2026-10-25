// scripts/verify/sky-wire.mjs
// Issue #305 round six, against a real socket: WHAT THE SHARED SKY COSTS A TAB.
//
// Four clients on /ws/cursors over the same window, the sky pushed once a
// second by the `hand` for the middle third and left alone either side:
//   absent    never says it can see the window
//   watching  says {type:'watch', on:true, of:'sky'} and holds it
//   spectator the same watch, and pushes too; its pushes must move nothing
//   hand      a participant that pushes (and watches)
// Prints bytes/s of sky frames per client, and the bytes in the quiet
// thirds, which must be zero for everyone after the first frame.
//
// Runs against a served build (`npm start` locally). The spectator is only
// a spectator in a full room, so it is checked when the server says so.
// Usage: node scripts/verify/sky-wire.mjs [baseUrl] [seconds]
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const SECONDS = Number(process.argv[3] || 18)
const url = BASE.replace(/^http/, 'ws') + '/ws/cursors'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function client(name) {
  const ws = new WebSocket(url)
  const c = { name, ws, open: false, spectator: false, bytes: 0, frames: 0, quiet: 0, seen: [] }
  c.phase = 'before'
  ws.addEventListener('open', () => (c.open = true))
  ws.addEventListener('message', (e) => {
    const text = String(e.data)
    let m
    try {
      m = JSON.parse(text)
    } catch {
      return
    }
    if (m.type === 'welcome') c.spectator = !!m.spectator
    if (m.type !== 'sky') return
    c.seen.push(`${m.x},${m.y}`)
    if (c.phase === 'before') return
    c.bytes += text.length
    c.frames++
    if (c.phase === 'quiet') c.quiet += text.length
  })
  c.watch = (on) => ws.send(JSON.stringify({ type: 'watch', on, of: 'sky' }))
  c.push = (dx, dy) => ws.send(JSON.stringify({ type: 'push', dx, dy }))
  return c
}

const absent = client('absent')
const watching = client('watching')
const hand = client('hand')
const all = [absent, watching, hand]
for (let i = 0; i < 50 && !all.every((c) => c.open); i++) await sleep(100)
if (!all.every((c) => c.open)) {
  console.error(`no socket opened on ${url}`)
  process.exit(2)
}
watching.watch(true)
hand.watch(true)
// let any earlier push settle and the first frame arrive
await sleep(8000)
const third = (SECONDS * 1000) / 3
const t0 = Date.now()
for (const c of all) c.phase = 'quiet'
await sleep(third)
for (const c of all) c.phase = 'pushed'
for (let t = 0; t < third; t += 1000) {
  hand.push(6, -3)
  await sleep(1000)
}
// the spring's settle is part of the push's cost, then the quiet counts again
await sleep(7000)
for (const c of all) c.phase = 'quiet'
await sleep(third)
const secs = (Date.now() - t0) / 1000
for (const c of all) c.phase = 'before'

let bad = false
console.log(`sky wire over ${secs.toFixed(1)}s against ${BASE}`)
for (const c of all) {
  console.log(
    `  ${c.name.padEnd(9)} ${(c.bytes / secs).toFixed(1).padStart(6)} B/s  ${c.frames} frames` +
      `  mean ${c.frames ? (c.bytes / c.frames).toFixed(0) : 0} B  quiet ${c.quiet} B`
  )
  if (c.quiet) bad = true
}
if (absent.bytes) bad = true
if (!watching.frames || watching.seen.join() !== hand.seen.join()) bad = true
console.log(`  watching and hand saw the same sky: ${watching.seen.join() === hand.seen.join()}`)
for (const c of all) c.ws.close()
if (bad) {
  console.error(
    'FAIL: an absent tab was sent the sky, a quiet sky talked, or two watchers disagreed'
  )
  process.exit(1)
}
