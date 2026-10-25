// scripts/verify/frame-gesture.mjs
// BIBLE.md section 8, in a real browser: THE FRAME OWNS THE FINGER.
//
// `test/touch-affordance.test.js` proves the cause cannot come back: the entry
// declares `.owns-touch`, the stylesheet answers it, the sheet's listeners
// consult it. None of that says what a thumb gets. This does, on a phone-sized
// page with real touch input (Input.dispatchTouchEvent goes through the
// compositor, so `touch-action` decides the scroll exactly as it does on a
// device; a synthetic TouchEvent from script would prove nothing).
//
// Per entry, four drags, each read before and after:
//   in the frame, vertical    the sheet does not scroll, the page does not
//                             close, and the experiment answers (pixels change)
//   in the frame, sideways    the sheet does not walk to the next page
//   outside, vertical         the sheet scrolls (when it has anywhere to go)
//   outside, sideways         the sheet walks to the next page
// `elementFromPoint` at each start says whose ground the finger landed on.
//
// Runs against a served build, never against source. Usage:
//   node scripts/verify/frame-gesture.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9282)
const SHOTS = process.env.SHOTS // a directory: keep a png of each entry as opened
// an iPhone 14, and an SE: the short screen is the one the fit has to earn
const PHONES = [
  { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  { width: 375, height: 667, deviceScaleFactor: 2, mobile: true },
]
let PHONE

const ENTRIES = [
  // arm: what to press first so a drag in the frame leaves a mark to measure
  // foot: the last thing that has to be on screen with the frame (its controls)
  {
    slug: 'web-instruments',
    // the stage is the photograph on the ground above the index card
    frame: '.carousel-viewport',
    // ready when the kit's keys are down on the card: then pick the bass
    ready: '.carousel-slide .k-white',
    arm: '.k-cardtabs [data-index="1"]',
    // what you play is on screen with the picture: on a phone the surface
    // is the first thing in the card, under the tabs
    foot: '.carousel-slide:not([inert]) .surface',
    // a sideways swipe on the picture walks the tabs: the instrument changes
    answer: 'slide',
    sideways: '.stage',
    // ...and the board under it keeps its whole range and pans sideways in
    // its own scroller on a phone (#301), so a swipe there shows more frets
    // and leaves the instrument alone.
    pans: '.carousel-slide:not([inert]) .scroll',
  },
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
const profile = mkdtempSync(join(tmpdir(), 'frame-gesture-'))
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
const waitFor = async (expression, what, ms = 20000) => {
  for (let t = 0; t < ms; t += 200) {
    if (await evaluate(expression)) return
    await sleep(200)
  }
  throw new Error(`timed out waiting for ${what}`)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Emulation.setEmitTouchEventsForMouse', { enabled: false })

// one finger, down at a, across to b in steps the compositor reads as a drag
async function drag(a, b, steps = 12) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] })
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps
    const y = a.y + ((b.y - a.y) * i) / steps
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    await sleep(16)
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(500) // the fling settles, the page (if it walked) paints
}
async function tap(p) {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(300)
}

const STATE = `(() => {
  const m = document.getElementById('mscroll')
  return {
    path: location.pathname,
    open: document.getElementById('modal').classList.contains('open'),
    scrollTop: Math.round(m.scrollTop),
    range: m.scrollHeight - m.clientHeight,
  }
})()`
const at = (p) =>
  evaluate(`(() => {
    const el = document.elementFromPoint(${p.x}, ${p.y})
    if (!el) return 'nothing'
    const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    return name + (el.closest('.owns-touch') ? ' (in frame)' : ' (outside)')
  })()`)
const rectOf = (sel) =>
  evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })()`)
const shot = async (clip) =>
  (await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })).data
// how many pixels of the frame changed between two captures, counted in the
// page so this script needs no png decoder of its own
const changed = (a, b) =>
  evaluate(`(async () => {
    const px = async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const g = c.getContext('2d')
      g.drawImage(bmp, 0, 0)
      return g.getImageData(0, 0, bmp.width, bmp.height).data
    }
    const [p, q] = [await px(${JSON.stringify(a)}), await px(${JSON.stringify(b)})]
    let n = 0
    for (let i = 0; i < p.length; i += 4)
      if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 96) n++
    return n
  })()`)

const failures = []
const rows = []
function check(entry, name, ok, detail) {
  rows.push(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`)
  if (!ok) failures.push(`${entry}: ${name}: ${detail}`)
}

async function open(slug, ready) {
  await send('Page.navigate', { url: `${BASE}/${slug}` })
  await waitFor(
    `document.readyState === 'complete' && !!document.querySelector('#modal.open')`,
    `${slug} to open`
  )
  await waitFor(`!!document.querySelector(${JSON.stringify(ready)})`, `${slug} to be ready`, 60000)
  await sleep(800) // the cover pair plays out
}

// Back to the top of the sheet, and staying there: the drag above ends in a
// fling that keeps scrolling after a single reset, and the sideways swipe
// then started on the canvas gap above the sheet, not on the sheet.
async function home3() {
  for (let i = 0; i < 20; i++) {
    const top = await evaluate(`(() => {
      const m = document.getElementById('mscroll')
      m.scrollTop = 0
      return m.scrollTop
    })()`)
    await sleep(150)
    if (top === 0 && (await evaluate(`document.getElementById('mscroll').scrollTop`)) === 0) return
  }
}

try {
  // A cold headless browser drops its first compositor scroll: whichever
  // page opens first loses one scroll-owned row, the instruments' or the board's
  // pan when the order is swapped, and the same drag scrolls every time
  // after it. One throwaway scroll on the first page warms it, and nothing
  // is measured until it has.
  {
    PHONE = PHONES[0]
    await send('Emulation.setDeviceMetricsOverride', PHONE)
    await open(ENTRIES[0].slug, ENTRIES[0].ready)
    const x = PHONE.width / 2
    await drag({ x, y: PHONE.height - 120 }, { x, y: PHONE.height - 360 })
    await home3()
  }
  for (const phone of PHONES)
    for (const e of ENTRIES) {
      PHONE = phone
      await send('Emulation.setDeviceMetricsOverride', PHONE)
      await open(e.slug, e.ready)
      const home = `/${e.slug}`
      const f = await rectOf(e.frame)
      const clip = {
        x: f.x,
        y: Math.max(0, f.y),
        width: f.w,
        height: Math.min(f.h, PHONE.height - Math.max(0, f.y)),
      }
      if (SHOTS)
        writeFileSync(
          join(SHOTS, `${e.slug}-${PHONE.width}x${PHONE.height}.png`),
          Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')
        )
      const s0 = await evaluate(STATE)
      rows.push(
        `${e.slug}  frame ${Math.round(f.w)}x${Math.round(f.h)} at y ${Math.round(f.y)} of ${PHONE.width}x${PHONE.height}, sheet scroll range ${s0.range}px`
      )
      const touch = await evaluate(
        `getComputedStyle(document.querySelector(${JSON.stringify(e.frame)})).touchAction`
      )
      check(
        e.slug,
        'frame state',
        touch === 'none',
        `touch-action ${touch}, class ${await evaluate(`document.querySelector(${JSON.stringify(e.frame)}).classList.contains('owns-touch')`)}`
      )

      // the frame and its controls are on screen together, clear of the bar;
      // a full page has no bar (html.fullpage-open), so the screen's foot is
      // the limit
      const foot = await rectOf(e.foot)
      const barShown = await evaluate(
        `getComputedStyle(document.getElementById('topbar')).display !== 'none'`
      )
      const limit = barShown ? (await rectOf('#topbar')).y : PHONE.height
      check(
        e.slug,
        'fits the screen',
        f.y >= 0 && foot.y + foot.h <= limit,
        `frame top ${Math.round(f.y)}, controls end ${Math.round(foot.y + foot.h)}, ${barShown ? 'bar starts' : 'no bar, screen ends'} ${Math.round(limit)}`
      )

      if (e.arm) {
        const b = await rectOf(e.arm)
        await tap({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
      }

      // ---- 1. in the frame, vertical -----------------------------------------
      const cx = f.x + f.w / 2
      const mid = clip.y + clip.height / 2
      // stay on the figure: a short frame has ground where a tall one has chest
      const reach = Math.min(110, clip.height * 0.3)
      const a1 = { x: cx, y: mid + reach }
      const b1 = { x: cx, y: mid - reach }
      // the noise floor: the thing idles, so two captures of nothing differ too
      const idleA = await shot(clip)
      await sleep(600)
      const idle = await changed(idleA, await shot(clip))
      const before1 = await evaluate(STATE)
      const pic1 = await shot(clip)
      const hit1 = await at(a1)
      await drag(a1, b1)
      const after1 = await evaluate(STATE)
      const pic1b = await shot(clip)
      const ink = await changed(pic1, pic1b)
      if (SHOTS)
        writeFileSync(
          join(SHOTS, `${e.slug}-${PHONE.width}x${PHONE.height}-dragged.png`),
          Buffer.from(pic1b, 'base64')
        )
      check(
        e.slug,
        `frame, drag up ${Math.round(reach * 2)}px`,
        after1.scrollTop === before1.scrollTop && after1.path === home && after1.open,
        `start on ${hit1}; scrollTop ${before1.scrollTop} -> ${after1.scrollTop}; path ${after1.path}`
      )
      if (e.answer === 'ink')
        check(
          e.slug,
          'frame, the experiment answered',
          ink > idle * 2 + 50,
          `${ink} px changed in the frame (idle floor ${idle})`
        )

      // down from the top of the sheet is the close swipe everywhere else
      const before1d = await evaluate(STATE)
      await drag(b1, a1)
      const after1d = await evaluate(STATE)
      check(
        e.slug,
        `frame, drag down ${Math.round(reach * 2)}px`,
        after1d.open && after1d.path === home && after1d.scrollTop === before1d.scrollTop,
        `scrollTop ${before1d.scrollTop} -> ${after1d.scrollTop}; open ${after1d.open}; path ${after1d.path}`
      )

      // ---- 2. in the frame, sideways -----------------------------------------
      const lane = e.sideways ? await rectOf(e.sideways) : null
      const y2 = lane ? lane.y + lane.h / 2 : mid
      const a2 = { x: f.x + f.w - 40, y: y2 }
      const b2 = { x: f.x + 40, y: y2 }
      const hit2 = await at(a2)
      const SLIDE = `[...document.querySelectorAll('.carousel-slide')].findIndex((s) => !s.inert)`
      const slide0 = e.answer === 'slide' ? await evaluate(SLIDE) : null
      await drag(a2, b2)
      const after2 = await evaluate(STATE)
      if (e.answer === 'slide') {
        const slide1 = await evaluate(SLIDE)
        check(
          e.slug,
          'frame, the experiment answered',
          slide1 !== slide0,
          `instrument ${slide0} -> ${slide1}`
        )
      }
      check(
        e.slug,
        `frame, swipe left ${Math.round(a2.x - b2.x)}px`,
        after2.path === home,
        `start on ${hit2}; path ${home} -> ${after2.path}`
      )
      if (after2.path !== home) await open(e.slug, e.ready)

      // ---- 2b. a board that pans owns its sideways swipe ---------------------
      if (e.pans) {
        const p = await rectOf(e.pans)
        const PAN = `document.querySelector(${JSON.stringify(e.pans)}).scrollLeft`
        const slideP = await evaluate(SLIDE)
        const left0 = await evaluate(PAN)
        const yp = p.y + p.h / 2
        await drag({ x: p.x + p.w - 30, y: yp }, { x: p.x + 30, y: yp })
        await sleep(400)
        const left1 = await evaluate(PAN)
        const slideQ = await evaluate(SLIDE)
        check(
          e.slug,
          'board, swipe left pans it',
          left1 > left0 && slideQ === slideP,
          `scrollLeft ${left0} -> ${left1}; instrument ${slideP} -> ${slideQ}`
        )
      }

      // ---- 3. outside, vertical ----------------------------------------------
      // the strip the sheet leaves above the frame, beside the nav's two doors
      const f3 = await rectOf(e.frame)
      const gx = PHONE.width / 2
      const before3 = await evaluate(STATE)
      const a3 = { x: gx, y: Math.min(PHONE.height - 8, Math.max(8, f3.y - 12)) }
      const hit3 = await at(a3)
      if (before3.range > 0) {
        // nowhere to start a long drag above the frame: go from under it instead
        const under = f3.y + f3.h + 12
        const from = a3.y > 260 ? a3 : { x: gx, y: Math.min(PHONE.height - 60, under) }
        const hitFrom = from === a3 ? hit3 : await at(from)
        await drag(from, { x: from.x, y: Math.max(8, from.y - 240) })
        const after3 = await evaluate(STATE)
        check(
          e.slug,
          'outside, drag up',
          after3.scrollTop > before3.scrollTop && !/in frame/.test(hitFrom),
          `start on ${hitFrom} at y ${Math.round(from.y)}; scrollTop ${before3.scrollTop} -> ${after3.scrollTop} of ${before3.range}`
        )
        await home3()
      } else {
        rows.push(
          `  --   outside, drag up: the page fits the screen (scroll range 0), there is nothing to scroll`
        )
      }

      // ---- 4. outside, sideways ----------------------------------------------
      const f4 = await rectOf(e.frame)
      const y4 = Math.max(8, f4.y - 12)
      const a4 = { x: PHONE.width - 30, y: y4 }
      const b4 = { x: 30, y: y4 }
      const hit4 = await at(a4)
      await drag(a4, b4)
      const after4 = await evaluate(STATE)
      check(
        e.slug,
        `outside, swipe left ${a4.x - b4.x}px`,
        after4.path !== home && !/in frame/.test(hit4),
        `start on ${hit4} at y ${Math.round(y4)}; path ${home} -> ${after4.path}`
      )
    }
} catch (err) {
  console.error(rows.join('\n'))
  console.error('frame-gesture could not run:', err.message)
  cleanup(2)
}

console.log(rows.join('\n'))
if (failures.length) {
  console.error(
    `\n${failures.length} gesture(s) went to the wrong owner:\n  ` + failures.join('\n  ')
  )
  cleanup(1)
}
console.log('\nevery finger went to its owner')
cleanup(0)
