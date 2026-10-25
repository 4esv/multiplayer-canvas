// scripts/verify/page-ground.mjs
// Issue #300, in a real browser: THE PAGE GROUND REACHES THE BOTTOM. A case
// study or an experiment is a destination that takes the frame, and a short
// one scrolled to its end used to leave a strip of the canvas showing under
// it (author, 2026-09-23). That is a fact about the painted frame, not the
// stylesheet, so this loads each page, scrolls it to the bottom, and asks
// the browser what is painted on the last row of the viewport.
//
// Four readings per page, all must hold:
//   full     the page arrives on the full-page shell. Measured 2026-09-24
//            before the fix: a direct load of /web-instruments
//            was a bottom sheet (white, 90% of the frame over a 10% gap of
//            canvas, the canvas search bar floating on it) while the same
//            entry opened from the canvas was a full grey page. The server
//            and the canvas each had their own idea of "full".
//   ground   the page's ground (#sheet) ends at or below the viewport bottom
//   paint    the element hit on the bottom row, across the width, sits
//            inside #sheet, never the canvas or the bare modal under it
//   bounce   the page's scroller does not overscroll: headless Chrome has
//            no elastic scroll, so a trackpad or phone bouncing past the
//            end (and showing the canvas under the ground) cannot be painted
//            here; the property that forbids it is read instead
//   bar      the canvas's bar (#topbar, the search field in it) is not
//            painted: it sits at the collection layer at most (author,
//            2026-09-25). Read on the direct load AND on the same page
//            opened from the canvas (window.__lab.openPage), because on
//            main the two doors disagreed: the direct load was a sheet with
//            the bar floating over it, the canvas-opened one was not
//
// Pages: the shortest case study (fire-department) and both experiments,
// each at 1440x900 and at 390x844 in mobile emulation, loaded directly, then
// opened from the canvas. The collection layer is the control: /work and
// /feed must still paint the bar, so a rule that hid it everywhere fails.
//
// Runs against a served build (the smoke container in CI, `npm start`
// locally). Usage:
//   node scripts/verify/page-ground.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9231)

const PATHS = ['/work/fire-department', '/web-instruments']
const COLLECTIONS = ['/work', '/feed']
// name, width, height, mobile, dpr
const VIEWPORTS = [
  ['laptop', 1440, 900, false, 1],
  ['phone', 390, 844, true, 3],
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
const profile = mkdtempSync(join(tmpdir(), 'page-ground-'))
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

await send('Page.enable')
await send('Runtime.enable')

// Scroll every scroller the page could be using to its end, wait for the
// canvas strip to follow (canvasSlide runs on scroll), then read the bottom
// row. Nine probes across the width, one css px above the edge.
const READ = `(async () => {
  const sc = document.getElementById('mscroll')
  if (sc) sc.scrollTop = sc.scrollHeight
  window.scrollTo(0, document.documentElement.scrollHeight)
  await new Promise((r) => setTimeout(r, 300))
  const sheet = document.getElementById('sheet')
  const vh = window.innerHeight, vw = window.innerWidth
  const box = sheet ? sheet.getBoundingClientRect() : null
  const misses = []
  for (let i = 0; i < 9; i++) {
    const x = Math.round(((i + 0.5) / 9) * vw)
    const el = document.elementFromPoint(x, vh - 1)
    if (!sheet || !el || !sheet.contains(el)) {
      misses.push(x + ':' + (el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') : 'nothing'))
    }
  }
  return {
    vh,
    bottom: box ? Math.round(box.bottom * 10) / 10 : null,
    misses,
    full: document.getElementById('modal').classList.contains('fullpage'),
    bounce: sc ? getComputedStyle(sc).overscrollBehaviorY : null,
    bar: BAR(),
  }
})()`
// the bar is painted when it, or any control in it (the search field, the
// find and map buttons), has a box and is visible. The bar itself can be 0px
// tall at a desk while its field still paints: reading only the bar's own
// box missed the field floating over the instruments at 1440
const BAR_FN = `() => {
  const b = document.getElementById('topbar')
  if (!b) return false
  return [b, ...b.querySelectorAll('*')].some((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
  })
}`
const withBar = (src) => `(() => { const BAR = ${BAR_FN}; return ${src} })()`

const failures = []
let checked = 0
let barChecked = 0
try {
  for (const [vp, w, h, mobile, dpr] of VIEWPORTS) {
    for (const path of PATHS) {
      await send('Page.navigate', { url: 'about:blank' })
      await sleep(150)
      await send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: dpr,
        mobile,
      })
      await send('Page.navigate', { url: BASE + path })
      await sleep(3000)
      const r = await evaluate(withBar(READ))
      checked++
      const wrong = []
      if (!r.full) wrong.push('not a full page')
      if (r.bar) wrong.push('the bar is painted over the page')
      if (r.bottom === null || r.bottom < r.vh - 0.5)
        wrong.push(`sheet ends at ${r.bottom} of ${r.vh}`)
      if (r.misses.length) wrong.push('bottom row hits ' + r.misses.join(' '))
      if (r.bounce !== 'none') wrong.push(`scroller overscrolls (${r.bounce})`)
      console.log(
        `  ${wrong.length ? 'FAIL' : 'ok  '} ${vp.padEnd(6)} ${path.padEnd(22)} sheet bottom ${r.bottom} / viewport ${r.vh}${wrong.length ? '  ' + wrong.join('; ') : ''}`
      )
      if (wrong.length) failures.push(`${vp} ${path}: ${wrong.join('; ')}`)
    }
  }
  // the other door: the canvas opens the same page, and the bar still goes;
  // then the collection layer, which keeps it
  for (const [vp, w, h, mobile, dpr] of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: dpr,
      mobile,
    })
    for (const path of PATHS) {
      await send('Page.navigate', { url: BASE + '/' })
      await sleep(2500)
      const slug = path.split('/').pop()
      await evaluate(`window.__lab.openPage(${JSON.stringify(slug)})`)
      await sleep(1500)
      const bar = await evaluate(`(${BAR_FN})()`)
      barChecked++
      console.log(
        `  ${bar ? 'FAIL' : 'ok  '} ${vp.padEnd(6)} ${('canvas>' + slug).padEnd(22)} bar ${bar ? 'painted over the page' : 'gone'}`
      )
      if (bar) failures.push(`${vp} canvas>${slug}: the bar is painted over the page`)
    }
    for (const path of COLLECTIONS) {
      await send('Page.navigate', { url: BASE + path })
      await sleep(2500)
      const bar = await evaluate(`(${BAR_FN})()`)
      barChecked++
      console.log(
        `  ${bar ? 'ok  ' : 'FAIL'} ${vp.padEnd(6)} ${path.padEnd(22)} bar ${bar ? 'kept (collection layer)' : 'missing'}`
      )
      if (!bar) failures.push(`${vp} ${path}: the collection layer lost its bar`)
    }
  }
} catch (err) {
  console.error(err)
  cleanup(2)
}
// an empty run is not a clean one
if (
  checked !== PATHS.length * VIEWPORTS.length ||
  barChecked !== (PATHS.length + COLLECTIONS.length) * VIEWPORTS.length
) {
  console.error(
    `FAIL: checked ${checked} pages and ${barChecked} doors, expected ${PATHS.length * VIEWPORTS.length} and ${(PATHS.length + COLLECTIONS.length) * VIEWPORTS.length}`
  )
  cleanup(1)
}
if (failures.length) {
  console.error(
    'FAIL: the canvas shows under a page scrolled to its end, or the bar is over an item\n  ' +
      failures.join('\n  ')
  )
  cleanup(1)
}
console.log(
  'every page ground reaches the viewport bottom, and the bar sits at the collection layer at most'
)
cleanup(0)
