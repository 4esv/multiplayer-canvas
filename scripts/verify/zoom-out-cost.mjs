// scripts/verify/zoom-out-cost.mjs
// In a real browser: WHAT THE WORLD IN VIEW COSTS. Pulls the
// camera out as far as it goes (cover, layout.js cameraBounds) and measures the page two ways: as
// the device's own mount floor leaves it (`plan`), and with every tile
// mounted all the way out (`mounted`, via __lab.mountAt). For each it
// reports the elements in the document, the tiles on screen, and
// a 120-frame pan across the world at that zoom: the renderer's own time per
// frame (render() is synchronous under __lab.setCam), the interval between
// animation frames, and Chrome's style + layout time over the pan
// (Performance.getMetrics). Headless Chrome on this machine is the
// instrument, not the device: it says what mounting costs relative to the
// plan, and the watch row is informational, since the wrist died of memory
// headless Chrome does not have to find.
//
// It gates nothing; it is the measurement the mount floors in layout.js
// (MOUNT_OUT) were set from. Usage:
//   node scripts/verify/zoom-out-cost.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9224)
const FRAMES = 120

// name, width, height, mobile, dpr: the watch as world-fixed.mjs has it
const VIEWPORTS = [
  ['laptop', 1440, 900, false, 1],
  ['phone', 390, 844, true, 3],
  ['watch', 320, 392, true, 2],
]

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
const profile = mkdtempSync(join(tmpdir(), 'zoom-out-cost-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
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
const metrics = async () =>
  Object.fromEntries((await send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))

await send('Page.enable')
await send('Runtime.enable')
await send('Performance.enable')
// the service worker caches the canvas scripts on the first load, which
// would measure the previous build on every load after it
await send('Network.enable')
await send('Network.setBypassServiceWorker', { bypass: true })

// all the way out, mounted or not, then settle so every image decodes
const OUT = (mountAll) => `(async () => {
  __lab.home()
  const z = __lab.zoom.min
  if (${mountAll}) __lab.mountAt(z)
  __lab.setZoom(z)
  await new Promise((r) => setTimeout(r, 1500))
  const els = [...document.querySelectorAll('#scene .el')].filter((el) => el.checkVisibility())
  return { z, mount: __lab.zoom.mount, dom: document.getElementsByTagName('*').length,
    tiles: els.length,
    plan: !document.getElementById('plan').hidden }
})()`
// a pan across the world, one step a frame
const PAN = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  const w = __lab.world.w, start = __lab.cam
  const render = [], gaps = []
  await frame()
  let last = performance.now()
  for (let i = 0; i < ${FRAMES}; i++) {
    const t0 = performance.now()
    __lab.setCam(start.x + (w * i) / ${FRAMES}, start.y + (w * i) / ${FRAMES} / 3)
    render.push(performance.now() - t0)
    await frame()
    const now = performance.now()
    gaps.push(now - last)
    last = now
  }
  const q = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]
  return { renderMed: q(render, 0.5), renderP95: q(render, 0.95),
    gapMed: q(gaps, 0.5), gapP95: q(gaps, 0.95), gapMax: Math.max(...gaps) }
})()`

const rows = []
try {
  for (const [name, w, h, mobile, dpr] of VIEWPORTS) {
    for (const mountAll of [false, true]) {
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
      await evaluate('__lab.reset()')
      const s = await evaluate(OUT(mountAll))
      const m0 = await metrics()
      const p = await evaluate(PAN)
      const m1 = await metrics()
      const ms = (k) => (m1[k] - m0[k]) * 1000
      rows.push({
        name,
        mode: mountAll ? 'mounted' : 'default',
        ...s,
        ...p,
        style: ms('RecalcStyleDuration'),
        layout: ms('LayoutDuration'),
        heapMB: m1.JSHeapUsedSize / 1048576,
      })
      const r = rows.at(-1)
      console.log(
        `  ${name.padEnd(7)} ${r.mode.padEnd(8)} z=${r.z.toFixed(4)} mount=${r.mount.toFixed(4)} ` +
          `${String(r.dom).padStart(5)} elements  ${String(r.tiles).padStart(3)} tiles  ` +
          `plan ${r.plan ? 'on ' : 'off'}  render ${r.renderMed.toFixed(1)}/${r.renderP95.toFixed(1)}ms  ` +
          `frame ${r.gapMed.toFixed(1)}/${r.gapP95.toFixed(1)}/${r.gapMax.toFixed(1)}ms  ` +
          `style ${r.style.toFixed(0)}ms layout ${r.layout.toFixed(0)}ms over ${FRAMES} frames  heap ${r.heapMB.toFixed(1)}MB`
      )
    }
  }
} catch (err) {
  console.error(err)
  cleanup(2)
}
console.log('\n(render and frame are median/p95[/max] per frame; style and layout are totals)')
cleanup(0)
