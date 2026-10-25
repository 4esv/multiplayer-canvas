// The plan's pictures (#303): every tile as it renders, pixelated once.
//
//   node scripts/img/bake-plan.mjs [baseUrl]
//
// Past the watch's mount floor nothing mounts and the plan (canvas/app.js
// drawPlan) paints the world on one canvas. It used to paint a flat fill
// per footprint, and a world of blobs makes no sense to look at, so it
// paints each tile's real picture instead: the tile exactly as the page
// renders it, captured headless at 1:1 with nothing else on the page (no
// ground, no chrome, no neighbours), then put through the toolkit's
// pixelate() at one cell per world cell, so a picture is the tile's own
// size in cells and in the sprite's three inks (BIBLE.md sections 1 and 10).
// Experiments come out as their canvas PNG, case studies as their card,
// widgets as a still of whatever they showed when this ran: a baked still,
// which is the trade. Re-run it when a tile's look changes; the plan loads
// whatever is here and skips a tile it has no picture for.
//
// One PNG per tile, one pixel per cell, in src/static/img/canvas/plan/.
// Runs against a served build (`npm start`); the camera is driven through
// window.__lab, the same handle the verify scripts use.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { decodePng, encodePng } from '../icon/png.mjs'
import { PX } from '../../src/static/canvas/layout.js'
import { ACCENTS, pixelate, readPalette } from './pixelate.mjs'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9225)
const OUT = join(import.meta.dirname, '../../src/static/img/canvas/plan')
// wide enough for the widest tile (the about triptych) at 1:1
const VIEW = { w: 1600, h: 1100 }

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
  console.error('no chrome binary found; set CHROME_PATH')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'bake-plan-'))
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
    '--hide-scrollbars',
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
    /* best effort: chrome may still be writing its profile */
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

// only the tile being baked is visible, and nothing paints behind it: the
// plan puts each picture on its own ground
const ISOLATE = `(() => {
  const s = document.createElement('style')
  s.textContent = 'html, body, #stage, #scene { background: transparent !important }' +
    ' * { visibility: hidden !important }' +
    ' .plan-bake, .plan-bake * { visibility: visible !important }'
  document.head.appendChild(s)
})()`
// every seated node the plan draws, as the page has it
const TILES = `Object.entries(__lab.nodes)
  .filter(([id, o]) => o.t && o.t.type !== 'stamp' && o.w > 0 && o.h > 0)
  .map(([id, o]) => ({ id, w: o.w, h: o.h }))`
const FRAME = (id) => `(async () => {
  document.querySelectorAll('.plan-bake').forEach((el) => el.classList.remove('plan-bake'))
  __lab.centerOn(${JSON.stringify(id)})
  __lab.setZoom(1)
  const o = __lab.nodes[${JSON.stringify(id)}]
  if (o.hidden) return null
  o.n.classList.add('plan-bake')
  await new Promise((r) => setTimeout(r, 400))
  const r = o.n.getBoundingClientRect()
  return { x: r.x, y: r.y }
})()`

const palette = readPalette()
const inkOf = { k: palette.ink, p: palette.ground }
for (const [name, letter] of Object.entries(ACCENTS)) inkOf[letter] = palette[name]

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Network.setBypassServiceWorker', { bypass: true })
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW.w,
    height: VIEW.h,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  await send('Page.navigate', { url: BASE + '/?nodust' })
  await sleep(4000)
  await evaluate('__lab.reset()')
  await evaluate(ISOLATE)
  mkdirSync(OUT, { recursive: true })
  const tiles = await evaluate(TILES)
  let baked = 0
  for (const t of tiles) {
    const at = await evaluate(FRAME(t.id))
    if (!at) {
      console.log(`  skip ${t.id}: not on the ground`)
      continue
    }
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: at.x, y: at.y, width: t.w, height: t.h, scale: 1 },
    })
    const cols = Math.round(t.w / PX)
    const { rows, accent } = pixelate(decodePng(Buffer.from(shot.data, 'base64')), {
      cells: cols,
      palette,
    })
    const rgba = Buffer.alloc(cols * rows.length * 4)
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return
        const i = (y * cols + x) * 4
        const [r, g, b] = inkOf[ch]
        rgba[i] = r
        rgba[i + 1] = g
        rgba[i + 2] = b
        rgba[i + 3] = 255
      })
    )
    writeFileSync(join(OUT, `${t.id}.png`), encodePng(cols, rows.length, rgba))
    baked++
    console.log(`  ${t.id.padEnd(16)} ${cols} x ${rows.length} cells, ink + ground + ${accent}`)
  }
  console.log(`${baked} pictures in ${OUT}`)
} catch (err) {
  console.error(err)
  cleanup(2)
}
cleanup(0)
