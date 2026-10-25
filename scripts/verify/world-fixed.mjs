// scripts/verify/world-fixed.mjs
// BIBLE.md section 2, in a real browser: THE PAINT AGREES WITH THE PLAN.
//
// Every other guard in this repo is pure. `canvas-layout.test.js` proves the
// world's arithmetic, `world-seat.test.js` proves the stylesheet does not
// re-seat a node, `px-tokens`/`bible-sync` read text. Between them sits a seam
// nothing could see: the plan is right, the CSS parses, and the browser still
// paints the node somewhere else. That is not hypothetical. A single
// `position: relative` at equal specificity dropped the whole icon ring out of
// its transform and into the flow of #scene, whose box is rewritten on every
// zoom; `layout.js` went on reporting the correct coordinates the entire time
// and every test stayed green while the ring visibly wandered under zoom and
// pan. On a canvas that syncs cursors against shared coordinates, two viewers
// had stopped looking at the same place.
//
// So this asks the one question no pure guard can: for every node the world
// claims to have placed, is the pixel where it says it is?
//
//   painted offset from the hero, divided back out by the camera scale
//     ==  planned offset from the hero, per window.__layout()
//
// The hero is the world origin (wx 0, wy 0), so offsets from it ARE world
// coordinates, and reading both sides from one synchronous frame means the
// camera cannot drift between them. `window.__lab` drives the camera and
// renders synchronously, which is what it was built for.
//
// Runs against a served build (the smoke container in CI, `npm start`
// locally), never against source. Usage:
//   node scripts/verify/world-fixed.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9222)
// the plan rounds to whole world px, so anything under a pixel is agreement
const TOLERANCE = 1.5

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!CHROME) {
  console.error(
    'no chrome binary found; set CHROME_PATH. Tried:\n  ' + CHROME_CANDIDATES.join('\n  ')
  )
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'world-fixed-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    // CI runs as root in a container; without these Chrome refuses to start
    // or dies partway through on the default 64MB /dev/shm
    '--no-sandbox',
    '--disable-dev-shm-usage',
    'about:blank',
  ],
  { stdio: 'ignore' }
)

function cleanup(code) {
  try {
    chrome.kill()
  } catch {
    /* already gone */
  }
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
  process.exit(code)
}

async function debuggerUrl() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* not listening yet */
    }
    await sleep(200)
  }
  throw new Error(`chrome never opened a debugging port on ${PORT}`)
}

const ws = new WebSocket(await debuggerUrl())
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (!m.id || !pending.has(m.id)) return
  const { res, rej } = pending.get(m.id)
  pending.delete(m.id)
  m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
})
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result.value
}

await send('Page.enable')
await send('Runtime.enable')

// One synchronous frame: the plan, the camera, and every painted box. Reading
// them together is the whole point; a camera that moved between the plan read
// and the paint read would manufacture a disagreement.
//
// The anchor is #scene's own box, never another node. Anchoring on the hero
// read beautifully at the opening camera and lied at every panned one: a node
// off camera is display:none, its rect is all zeros, and every offset measured
// from it inherits one constant bogus shift. #scene is always laid out, and
// because .el is absolute at 0,0 inside it, an element's screen x is exactly
// sceneRect.x + u * k for u its position in scene units.
const SAMPLE = `(() => {
  const plan = window.__layout()
  const scene = document.getElementById('scene')
  const box = scene.getBoundingClientRect()
  const k = new DOMMatrixReadOnly(getComputedStyle(scene).transform).a
  const painted = []
  // a cut tile's copy (canvas/mirror.js) is held to the plan like the node
  for (const el of document.querySelectorAll('.el[data-hk], #scene > .el.wrap-copy')) {
    if (getComputedStyle(el).display === 'none') continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    painted.push({
      id: el.dataset.hk || el.dataset.copyOf,
      seated: getComputedStyle(el).position,
      u: (r.x - box.x) / k,
      v: (r.y - box.y) / k,
    })
  }
  return { world: plan.world, view: plan.view, cam: plan.cam, tiles: plan.tiles, k, painted }
})()`

// a node may legitimately paint on the far side of the seam, so compare on the
// torus: pick the representative of the painted delta nearest the planned one
const onTorus = (painted, planned, size) =>
  size > 0 ? painted - size * Math.round((painted - planned) / size) : painted

// Zooming in without steering lands on empty ground: the first pass of this
// script checked ZERO nodes at zoom max and reported it as a clean camera,
// which is the shape of a guard that passes loudest when it has stopped
// looking. The close cameras centre on a node first so there is always
// something in frame to disagree with.
const CAMERAS = [
  ['home', '__lab.home()'],
  ['zoom 1:1', "__lab.centerOn('work'); __lab.setZoom(1)"],
  ['zoom max', "__lab.centerOn('instruments'); __lab.setZoom(__lab.zoom.max)"],
  // the lowest zoom that still mounts tiles; past it the plan paints the
  // world and nothing mounts (#303), which the all-the-way-out probe below holds
  ['mount floor', '__lab.setZoom(__lab.zoom.mount)'],
  // a quarter across and three quarters down: an UNSTEERED camera deep in
  // the world that still lands on the ring. A quarter down used to work and
  // stopped on 2026-09-15, when the 16:9 ground made the hero's hole wide
  // enough that (0.25, 0.25) is bare ground on a watch: the camera proved
  // nothing and the run said so, which is the floor below doing its job.
  ['panned +quarter', '__lab.setCam(__lab.world.w * 0.25, __lab.world.h * 0.75)'],
  ['panned -third', '__lab.setCam(-__lab.world.w / 3, -__lab.world.h / 3)'],
  ['across the seam', '__lab.setCam(__lab.world.w * 0.95, __lab.world.h * 0.95)'],
]
// A floor on the work done, so an empty run cannot read as a clean one. Well
// under the ~200 a healthy world produces, so ordinary content churn does not
// trip it, and far above what any degenerate boot would.
const MIN_PLACEMENTS = 100
const MIN_PER_CAMERA = 1
// name, width, height, mobile, device pixel ratio. The watch is what watchOS
// actually lays the page out at (320 css px, adapted, at 2x), not the panel.
const VIEWPORTS = [
  ['phone', 390, 844, true, 3],
  ['laptop', 1440, 900, false, 1],
  ['watch', 320, 392, true, 2],
]

// ---- the crown does not shiver (2026-09-12) --------------------------------
// At the watch density #stage is the Digital Crown's scroller (app.js
// initCrown). watchOS paints the 320px page on a 205pt screen, so a written
// scrollTop reads back on the nearest device pixel, and the first crown
// handler took that fraction for a turn: zoomed by it, re-parked, read back
// another fraction, and shivered until the page was killed. Chrome reads back
// exactly, so this quantises the readback itself, then turns the crown one
// notch each way. A notch must zoom once and stop, and the scroller's height
// must not move with the zoom (it used to: the scene sat in its flow).
const CROWN = `(async () => {
  const st = document.getElementById('stage')
  if (!document.documentElement.classList.contains('crown')) return { crown: false }
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  Object.defineProperty(st, 'scrollTop', { configurable: true,
    get() { return Math.round(d.get.call(this) * 1.28) / 1.28 },
    set(v) { d.set.call(this, v) } })
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const sh0 = st.scrollHeight, z0 = window.__layout().view.z
  let events = 0
  st.addEventListener('scroll', () => events++)
  st.scrollTop -= 24
  await wait(1900)
  const zIn = window.__layout().view.z, eventsIn = events
  st.scrollTop += 24
  await wait(1900)
  return { crown: true, sh0, sh1: st.scrollHeight, z0, zIn, zOut: window.__layout().view.z, eventsIn, eventsOut: events - eventsIn }
})()`

// ---- all the way out: the honest torus --------------------------------------
// Every screen pulls out to cover and no further: the view is never larger
// than the world in either axis, so no place is on screen twice. A tile the
// view's edge cuts shows its other part at the opposite edge as a live copy
// (canvas/mirror.js). A desktop and a phone mount the real world all the way
// out (layout.js MOUNT_OUT, from scripts/verify/zoom-out-cost.mjs); a watch
// mounts down to its floor and past it the plan paints the world on one
// canvas. This is the measurement, at the floor and across a sweep of
// cameras there: the view against the world, every node and its copies
// clipped to the screen and read back as parts of the tile (no two may
// overlap: one place, painted once), every copy cut by a screen edge, one
// seam line per axis, and the plan's pictures held to the same rule.
const FULL_WIDTH = `(async () => {
  const mountedNow = () => [...document.querySelectorAll('#scene > .el:not(.wrap-copy)')]
    .filter((el) => el.checkVisibility()).length
  __lab.home()
  __lab.setZoom(__lab.zoom.mount)
  const atMount = mountedNow()
  __lab.setZoom(__lab.zoom.min)
  // the plan loads its pictures on its first draw: a beat, then draw again
  await new Promise((r) => setTimeout(r, 1500))
  __lab.setCam(__lab.cam.x, __lab.cam.y)
  const L = window.__layout()
  const plan = document.getElementById('plan')
  let inked = 0
  if (!plan.hidden && plan.width) {
    const px = plan.getContext('2d').getImageData(0, 0, plan.width, plan.height).data
    for (let i = 0; i < px.length; i += 4)
      if (px[i] !== px[0] || px[i + 1] !== px[1] || px[i + 2] !== px[2]) inked++
  }
  const W = innerWidth, H = innerHeight, k = L.view.z
  // the part of a tile a rect shows, in the tile's own world px
  const part = (r) => ({
    x0: (Math.max(0, r.x) - r.x) / k, x1: (Math.min(W, r.x + r.width) - r.x) / k,
    y0: (Math.max(0, r.y) - r.y) / k, y1: (Math.min(H, r.y + r.height) - r.y) / k,
  })
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  const cut = (r) => r.x < -0.5 || r.y < -0.5 || r.x + r.width > W + 0.5 || r.y + r.height > H + 0.5
  const twice = new Set(), uncut = new Set()
  let copies = 0, seamsMax = 0, strays = 0
  const probe = () => {
    const groups = {}
    for (const el of document.querySelectorAll('#scene > .el')) {
      if (!el.checkVisibility()) continue
      const id = el.dataset.hk || el.dataset.copyOf
      if (!id) { if (el.inert) strays++; continue }
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || r.x >= W || r.y >= H || r.x + r.width <= 0 || r.y + r.height <= 0) continue
      ;(groups[id] = groups[id] || []).push({ r, copy: el.classList.contains('wrap-copy') })
    }
    for (const [id, g] of Object.entries(groups)) {
      for (const c of g.filter((c) => c.copy)) { copies++; if (!cut(c.r)) uncut.add(id) }
      const own = g.find((c) => !c.copy)
      if (g.some((c) => c.copy) && (!own || !cut(own.r))) uncut.add(id)
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++)
        if (overlap(part(g[i].r), part(g[j].r)) > 1) twice.add(id)
    }
    // the plan's pictures, one place painted once as well
    const byId = {}
    for (const p of window.__layout().plan) (byId[p.id] = byId[p.id] || []).push({ x: p.x, y: p.y, width: p.w, height: p.h })
    for (const [id, g] of Object.entries(byId))
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++)
        if (overlap(part(g[i]), part(g[j])) > 1) twice.add('plan ' + id)
    const seams = [...document.querySelectorAll('#scene .seam')].filter((el) => el.style.display !== 'none').length
    seamsMax = Math.max(seamsMax, seams)
  }
  const cam0 = __lab.cam
  probe()
  // a sweep across the world at the floor, both seams crossed
  for (let i = 1; i <= 16; i++) {
    __lab.setCam(cam0.x + (L.world.w * i) / 17, cam0.y + (L.world.h * i * 5) / 17)
    probe()
  }
  __lab.setCam(cam0.x, cam0.y)
  return { z: L.view.z, mount: L.view.mountZ, viewW: L.view.w / L.view.z, viewH: L.view.h / L.view.z,
    worldW: L.world.w, worldH: L.world.h, twice: [...twice], uncut: [...uncut], copies, strays,
    seams: seamsMax, atMount, atFull: mountedNow(), plan: !plan.hidden, inked }
})()`

// ---- a cut tile's copy is live ------------------------------------------------
// At the floor, the camera is set so the view's edge cuts a live canvas tile
// (the slime, the weather) and its other part is a copy at the opposite edge.
// Read on animation frames for two seconds: the copy's canvas must match the
// node's, and the node must have repainted in that time, or liveness was not
// shown at all.
const LIVE_COPY = `(async () => {
  __lab.home()
  __lab.setZoom(__lab.zoom.min)
  const L = window.__layout()
  const vw = L.view.w / L.view.z, vh = L.view.h / L.view.z
  const out = []
  for (const [id, sel] of [['slime', 'canvas.dish'], ['weather', 'canvas.sky']]) {
    const t = L.tiles[id]
    if (!t) continue
    let cam = null
    // cut on whichever axis the view is long enough to show both parts
    if (vh > L.world.h - t.h) cam = [t.x + t.w / 2 - vw / 2, t.y + t.h - Math.min(t.h / 2, (vh - (L.world.h - t.h)) / 2)]
    else if (vw > L.world.w - t.w) cam = [t.x + t.w - Math.min(t.w / 2, (vw - (L.world.w - t.w)) / 2), t.y + t.h / 2 - vh / 2]
    if (!cam) { out.push({ id, skipped: true }); continue }
    __lab.setCam(cam[0], cam[1])
    const node = document.querySelector('#scene > .el[data-hk="' + id + '"]')
    const read = (el) => {
      const c = el && el.querySelector(sel)
      return c ? Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).join(',') : null
    }
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
    let same = 0, n = 0, changes = 0, last = null, seen = false
    const t0 = performance.now()
    while (performance.now() - t0 < 2000) {
      await frame()
      const cp = document.querySelector('#scene > .el.wrap-copy[data-copy-of="' + id + '"]')
      if (!cp) continue
      seen = true
      const a = read(node), b = read(cp)
      n++
      if (a === b) same++
      if (last !== null && a !== last) changes++
      last = a
    }
    out.push({ id, copy: seen, n, same, changes })
  }
  __lab.home()
  return out
})()`

// ---- the map's toggle leaves the field alone (#303 review) -----------------
// Changing the map must not move the search bar at all, unless the screen is
// narrow enough to share the slot. This clicks the toggle both ways and reads
// the field's rect every frame until the turn has settled, so a slide that
// ends where it started is still a move.
// ---- the plan's pictures sit on the tiles (#303) ----------------------------
// At the mount floor the camera is one step from the plan, so this holds
// the camera still, reads every mounted tile's screen rect, then has the
// plan draw the SAME camera (__lab.mountAt a hair above it) and reads where
// it put each picture. The switch is invisible only if the two agree.
const PLAN_AT_FLOOR = `(async () => {
  __lab.home()
  const m0 = __lab.zoom.mount
  __lab.setZoom(m0)
  const z = __lab.zoom.z
  const mounted = Object.entries(__lab.nodes)
    .filter(([id, o]) => !o.hidden && o.t && o.t.type !== 'stamp' && o.w && o.h)
    .map(([id, o]) => { const r = o.n.getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height } })
  __lab.mountAt(z + 1e-3)
  // the pictures load on the plan's first draw: give them a beat, then draw again
  await new Promise((r) => setTimeout(r, 1500))
  __lab.setCam(__lab.cam.x, __lab.cam.y)
  const plan = window.__layout().plan
  __lab.mountAt(m0)
  return { z, mounted, plan }
})()`
const TOGGLE = `(async () => {
  const wrap = document.getElementById('searchWrap')
  const map = document.getElementById('minimap')
  const btn = document.getElementById('mapBtn')
  const rect = (el) => {
    if (!el.checkVisibility()) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  const turn = async () => {
    btn.click()
    const seen = []
    const t0 = performance.now()
    while (performance.now() - t0 < 600) { seen.push(rect(wrap)); await frame() }
    return { seen, field: rect(wrap), map: rect(map), slot: document.getElementById('topbar').dataset.slot }
  }
  const before = { field: rect(wrap), map: rect(map), slot: document.getElementById('topbar').dataset.slot }
  const one = await turn()
  const two = await turn()
  return { vw: innerWidth, before, one, two }
})()`
const TOGGLE_VIEWPORTS = [
  ['laptop', 1440, 900, false, 1],
  ['desktop', 1024, 768, false, 1],
  ['phone', 390, 844, true, 3],
]
const sameRect = (a, b) =>
  !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5)

const failures = []
let checked = 0
let unseated = 0

for (const [vpName, w, h, mobile, dpr] of VIEWPORTS) {
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(150)
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: dpr,
    mobile,
  })
  await send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: mobile ? 5 : 1,
  })
  // the crown is opt-in (2026-09-12); the watch viewport asks for it so the
  // check below still exercises the scroller
  await send('Page.navigate', { url: BASE + '/' + (vpName === 'watch' ? '?crown' : '') })
  await sleep(3500)

  // a camera persisted by a previous run would restore under us and make the
  // first sample a different world than the one asked for
  const ready = await evaluate(
    'typeof window.__lab === "object" && typeof window.__layout === "function"'
  )
  if (!ready) {
    console.error(`FAIL ${vpName}: the canvas never booted its audit hooks at ${BASE}`)
    failures.push(`${vpName}: no __lab/__layout`)
    continue
  }
  await evaluate('__lab.reset()')

  for (const [camName, drive] of CAMERAS) {
    await evaluate(drive)
    await sleep(120)
    const s = await evaluate(SAMPLE)
    let worst = 0
    let worstId = ''
    let here = 0
    for (const p of s.painted) {
      const plan = s.tiles[p.id]
      if (!plan) continue // a node the world does not claim to place
      here++
      if (p.seated !== 'absolute') {
        unseated++
        failures.push(`${vpName} / ${camName}: ${p.id} is position:${p.seated}, not absolute`)
      }
      // where the world says this node should land in scene units, given
      // where the camera is: the same wrap the renderer does
      const ex = plan.x - s.cam.x
      const ey = plan.y - s.cam.y
      const d = Math.max(
        Math.abs(onTorus(p.u, ex, s.world.w) - ex),
        Math.abs(onTorus(p.v, ey, s.world.h) - ey)
      )
      checked++
      if (d > worst) {
        worst = d
        worstId = p.id
      }
      if (d > TOLERANCE)
        failures.push(
          `${vpName} / ${camName}: ${p.id} painted ${d.toFixed(1)} world px from where the plan puts it`
        )
    }
    console.log(
      `  ${vpName.padEnd(7)} ${camName.padEnd(16)} z=${s.view.z.toFixed(3)}  ` +
        `${here} nodes  worst ${worst.toFixed(2)}px${worstId ? ' (' + worstId + ')' : ''}`
    )
    if (here < MIN_PER_CAMERA)
      failures.push(`${vpName} / ${camName}: nothing in frame, so this camera proved nothing`)
  }
  const fw = await evaluate(FULL_WIDTH)
  console.log(
    `  ${vpName.padEnd(7)} all the way out z=${fw.z.toFixed(4)}  view ${Math.round(fw.viewW)}x${Math.round(fw.viewH)} ` +
      `of ${fw.worldW}x${fw.worldH}  ${fw.copies} copies over 17 cameras, ${fw.seams} seam lines at most  ` +
      `mounted ${fw.atMount} at the mount floor (z=${fw.mount.toFixed(3)}), ${fw.atFull} all the way out  plan ${fw.plan ? fw.inked + ' px inked' : 'off'}`
  )
  // the honest torus: the view never holds more than the world, in either axis
  if (fw.viewW > fw.worldW + 0.5 || fw.viewH > fw.worldH + 0.5)
    failures.push(
      `${vpName}: zoom-out sees ${Math.round(fw.viewW)}x${Math.round(fw.viewH)}, more than the world (${fw.worldW}x${fw.worldH})`
    )
  if (fw.twice.length)
    failures.push(`${vpName}: one place painted twice all the way out: ${fw.twice.join(', ')}`)
  if (fw.uncut.length)
    failures.push(`${vpName}: a copy of a tile no screen edge cuts: ${fw.uncut.join(', ')}`)
  if (fw.strays) failures.push(`${vpName}: ${fw.strays} inert copies outside the mirror`)
  if (fw.seams > 2) failures.push(`${vpName}: ${fw.seams} seam lines, one per axis at most`)
  for (const c of await evaluate(LIVE_COPY)) {
    if (c.skipped) {
      console.log(`  ${vpName.padEnd(7)} live copy       ${c.id}: the floor cannot cut it here`)
      continue
    }
    console.log(
      `  ${vpName.padEnd(7)} live copy       ${c.id}: ` +
        (c.copy
          ? `${c.same}/${c.n} frames match the node, it repainted ${c.changes} times`
          : 'no copy')
    )
    if (!c.copy) failures.push(`${vpName}: a cut ${c.id} has no copy at the opposite edge`)
    else if (c.same < c.n * 0.8)
      failures.push(`${vpName}: the copy of ${c.id} is stale (${c.same}/${c.n} frames match)`)
  }
  if (fw.z < fw.mount - 1e-9) {
    if (fw.atFull !== 0) failures.push(`${vpName}: ${fw.atFull} tiles mounted past the mount floor`)
    if (!fw.plan || !fw.inked)
      failures.push(`${vpName}: past the mount floor the plan painted nothing`)
  } else if (!fw.atFull || fw.plan)
    failures.push(`${vpName}: mounts all the way out, but shows the plan there`)
  const pf = await evaluate(PLAN_AT_FLOOR)
  let planWorst = 0
  let planWorstId = ''
  for (const t of pf.mounted) {
    const copies = pf.plan.filter((p) => p.id === t.id)
    if (!copies.length) {
      failures.push(`${vpName}: the plan has no picture of ${t.id} at the mount floor`)
      continue
    }
    const d = Math.min(
      ...copies.map((p) =>
        Math.max(Math.abs(p.x - t.x), Math.abs(p.y - t.y), Math.abs(p.w - t.w), Math.abs(p.h - t.h))
      )
    )
    if (d > planWorst) {
      planWorst = d
      planWorstId = t.id
    }
    if (d > TOLERANCE)
      failures.push(`${vpName}: the plan's ${t.id} sits ${d.toFixed(1)} screen px off the tile`)
  }
  if (!pf.mounted.length)
    failures.push(`${vpName}: nothing mounted at the floor to hold the plan to`)
  console.log(
    `  ${vpName.padEnd(7)} plan at floor   z=${pf.z.toFixed(3)}  ${pf.mounted.length} tiles vs ` +
      `${pf.plan.length} pictures  worst ${planWorst.toFixed(2)}px${planWorstId ? ' (' + planWorstId + ')' : ''}`
  )
  if (vpName === 'watch') {
    await evaluate('__lab.home()')
    await sleep(300)
    const c = await evaluate(CROWN)
    if (!c.crown) failures.push('watch: the crown scroller is not armed at the watch density')
    else {
      // a notch is one scroll event plus at most one park; a shiver is dozens
      if (c.eventsIn > 4 || c.eventsOut > 4)
        failures.push(
          `watch: the crown shivers (${c.eventsIn} / ${c.eventsOut} scroll events per notch)`
        )
      if (c.sh1 !== c.sh0)
        failures.push(
          `watch: the crown scroller's height moved with the zoom (${c.sh0} -> ${c.sh1})`
        )
      if (!(c.zIn > c.z0))
        failures.push(`watch: a crown notch in did not zoom in (${c.z0} -> ${c.zIn})`)
      if (!(c.zOut < c.zIn))
        failures.push(`watch: a crown notch out did not zoom out (${c.zIn} -> ${c.zOut})`)
      console.log(
        `  watch   crown            z ${c.z0.toFixed(3)} -> ${c.zIn.toFixed(3)} -> ${c.zOut.toFixed(3)}  ` +
          `${c.eventsIn}+${c.eventsOut} scroll events, track ${c.sh0}px both ways`
      )
    }
  }
}

for (const [vpName, w, h, mobile, dpr] of TOGGLE_VIEWPORTS) {
  await send('Page.navigate', { url: 'about:blank' })
  await sleep(150)
  await send('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: dpr,
    mobile,
  })
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(3500)
  const t = await evaluate(TOGGLE)
  const fmt = (r) => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}w` : 'gone')
  const shared = vpName === 'phone'
  if (!shared) {
    // the field holds still through both turns, every frame of them
    const moved = [...t.one.seen, ...t.two.seen].filter((r) => !sameRect(r, t.before.field))
    if (!t.before.field) failures.push(`${vpName} ${w}: no search bar to measure`)
    if (moved.length)
      failures.push(
        `${vpName} ${w}: the map's toggle moved the search bar in ${moved.length} frames ` +
          `(${fmt(t.before.field)} -> ${fmt(moved[0])})`
      )
    if (!!t.before.map === !!t.one.map)
      failures.push(`${vpName} ${w}: the toggle did not change the map`)
  } else {
    // the slot turns: the map holds it on arrival (#395), gives way to the
    // field, then comes back home
    if (!t.before.map || t.before.field)
      failures.push(`${vpName} ${w}: the slot does not open on the map`)
    if (t.one.map || !t.one.field || t.one.slot !== 'search')
      failures.push(`${vpName} ${w}: the toggle did not give the slot to the field`)
    if (!sameRect(t.two.map, t.before.map) || t.two.field)
      failures.push(`${vpName} ${w}: the map did not come back to its slot`)
  }
  console.log(
    `  ${vpName.padEnd(7)} map toggle ${String(w).padEnd(5)} field ${fmt(t.before.field)} -> ` +
      `${fmt(t.one.field)} -> ${fmt(t.two.field)}  map ${fmt(t.before.map)} -> ${fmt(t.one.map)}`
  )
}

console.log(
  `\n${checked} node placements checked across ${VIEWPORTS.length} viewports x ${CAMERAS.length} cameras`
)
if (checked < MIN_PLACEMENTS)
  failures.push(
    `only ${checked} placements checked, floor is ${MIN_PLACEMENTS}: the run went quiet rather than clean`
  )
if (failures.length) {
  console.error(
    `\nFAIL: the paint does not agree with the plan\n  ${failures.slice(0, 25).join('\n  ')}`
  )
  if (failures.length > 25) console.error(`  ...and ${failures.length - 25} more`)
  if (unseated)
    console.error(
      `\n${unseated} node(s) are not position:absolute. .el is the world's seat and app.js ` +
        `places it with a transform; a later rule at equal specificity re-seats it into the ` +
        `flow of #scene, whose box changes with the camera. See test/world-seat.test.js.`
    )
  cleanup(1)
}
console.log('PASS: every node is painted where the world says it is')
cleanup(0)
