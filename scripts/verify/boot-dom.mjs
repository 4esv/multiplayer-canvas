// scripts/verify/boot-dom.mjs
// In a real browser: A NODE IS A RESOURCE. Counts the elements
// in the document once the page has booted and settled, and fails above a
// recorded ceiling. The ceiling is the measured count plus room for content
// churn (a new tile, a longer feed), not a target: a node that nothing
// shows, like the zero-height doors row since deleted, is exactly
// the kind of thing that sits under a loose ceiling for a week, so the
// ceiling is kept close and moved on purpose, with the number that moved it.
//
// It also reports what the page's own presence socket carried while the
// page sat untouched, split by frame type. That half is informational: a
// tab with the dish on camera is WATCHING and is owed its deltas; the idle
// floor for a socket that is not watching is held by test/waste.test.js.
//
// Measured 2026-09-23, headless Chrome against `npm start`,
// the same before and after this pass (the zero-height doors row that was
// deleted had already gone, one node):
//   home  laptop 1440x900   1154 elements
//   home  phone  390x844    1154 elements
//
// Runs against a served build (the smoke container in CI, `npm start`
// locally). Usage:
//   node scripts/verify/boot-dom.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9223)
const IDLE_MS = Number(process.env.IDLE_MS || 10000)

// name, url, width, height, mobile, dpr, ceiling (elements at boot)
const PAGES = [
  ['home laptop', BASE + '/', 1440, 900, false, 1, 1250],
  ['home phone', BASE + '/', 390, 844, true, 3, 1250],
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
const profile = mkdtempSync(join(tmpdir(), 'boot-dom-'))
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
// frames the page's own sockets received, counted only while `counting`
let counting = false
const wire = { bytes: 0, byType: {} }
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Network.webSocketFrameReceived' && counting) {
    const text = m.params.response.payloadData || ''
    wire.bytes += text.length
    let type = 'other'
    try {
      type = JSON.parse(text).type || 'other'
    } catch {
      /* binary or not json */
    }
    wire.byType[type] = (wire.byType[type] || 0) + text.length
    return
  }
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
await send('Network.enable')

const failures = []
try {
  for (const [name, url, w, h, mobile, dpr, ceiling] of PAGES) {
    await send('Page.navigate', { url: 'about:blank' })
    await sleep(150)
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: dpr,
      mobile,
    })
    await send('Page.navigate', { url })
    // boot, then settle: the canvas seats its nodes on the first render and
    // the welcome and first dish frame arrive inside this window
    await sleep(3500)
    const n = await evaluate('document.getElementsByTagName("*").length')
    // a page that never rendered counts a handful of nodes and would pass
    // any ceiling; the floor makes an empty run fail loudly
    const floor = Math.floor(ceiling / 3)
    const ok = n <= ceiling && n >= floor
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} ${String(n).padStart(5)} elements (ceiling ${ceiling}, floor ${floor})`
    )
    if (!ok) failures.push(`${name}: ${n} elements, allowed ${floor}..${ceiling}`)
    if (name === 'home laptop') {
      wire.bytes = 0
      wire.byType = {}
      counting = true
      await sleep(IDLE_MS)
      counting = false
      const s = IDLE_MS / 1000
      const parts = Object.entries(wire.byType)
        .map(([t, b]) => `${t} ${(b / s).toFixed(0)}`)
        .join(', ')
      console.log(
        `  info ${name.padEnd(12)} page socket untouched for ${s}s: ${(wire.bytes / s).toFixed(0)} B/s (${parts || 'nothing'})`
      )
    }
  }
} catch (err) {
  console.error(err)
  cleanup(2)
}
if (failures.length) {
  console.error('FAIL: DOM node count at boot out of bounds\n  ' + failures.join('\n  '))
  cleanup(1)
}
console.log('boot DOM within ceilings')
cleanup(0)
