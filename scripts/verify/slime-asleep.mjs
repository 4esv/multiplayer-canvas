// scripts/verify/slime-asleep.mjs
// Issue #271, in a real browser: AN ABSENT TAB'S DISH LOSES LIFE.
//
// Drives headless Chrome over CDP (the harness is world-fixed.mjs's, ported)
// through the three states and screenshots the dish in each:
//   alive    the dish on camera, frames arriving
//   asleep   the dish panned off camera (the tab says no), then back on
//            camera with the room's frames HELD, so the beat before the
//            keyframe lasts long enough to photograph
//   revived  the held frames released: the keyframe lands, the colour returns
// and then the same for a hidden tab. The pixels are measured, not eyeballed:
// the most colourful pixel of the dish (max minus min channel) and its
// darkest one, read back from each screenshot.
//
// TWO INSTRUMENTS, NAMED: the hold is a WebSocket wrapper installed before
// the page's scripts that queues `slime` frames while window.__holdSlime is
// set; everything else on the wire passes. The hidden tab is a PROXY
// (document.hidden overridden and visibilitychange dispatched): headless
// Chrome has no real way to hide a tab. The off-camera pass is the real path.
//
// Runs against a served build (`npm start` locally). Usage:
//   node scripts/verify/slime-asleep.mjs [baseUrl] [outDir]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const OUT = process.argv[3] || join(tmpdir(), 'slime-asleep')
const PORT = Number(process.env.CDP_PORT || 9223)
mkdirSync(OUT, { recursive: true })

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
const profile = mkdtempSync(join(tmpdir(), 'slime-asleep-'))
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
const until = async (expression, ms = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await evaluate(expression)) return true
    await sleep(50)
  }
  return false
}

// the hold: `slime` frames queue while __holdSlime is set, and are handed on
// in order when it clears. Counts what it saw so a run with no frames at all
// cannot read as a pass.
const HOLD = `(() => {
  const Real = window.WebSocket
  window.__holdSlime = false
  window.__slimeSeen = { keys: 0, deltas: 0 }
  window.WebSocket = class extends Real {
    set onmessage(fn) {
      const held = []
      const pass = (ev) => {
        let m = null
        try { m = JSON.parse(ev.data) } catch { /* not ours */ }
        if (m && m.type === 'slime') {
          if (window.__holdSlime) { held.push(ev); return }
          if (typeof m.g === 'string') window.__slimeSeen.keys++
          else window.__slimeSeen.deltas++
        }
        fn.call(this, ev)
      }
      window.__releaseSlime = () => { window.__holdSlime = false; for (const ev of held.splice(0)) pass(ev) }
      super.onmessage = pass
    }
  }
})()`

const failures = []
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures.push(what)
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD })
await send('Page.navigate', { url: BASE + '/' })
if (!(await until('typeof window.__lab === "object"'))) {
  console.error('no __lab: is this the canvas?')
  cleanup(2)
}

const STATE = `(() => {
  const n = document.querySelector('.t-slime')
  const d = n.querySelector('.dish')
  return {
    asleep: n.hasAttribute('data-asleep'),
    dish: getComputedStyle(d).filter,
    rim: getComputedStyle(n.querySelector('.rim')).filter,
    shown: getComputedStyle(n).display !== 'none',
  }
})()`
// the dish's pixels, read back from the screenshot itself (the filter is
// composited, so the canvas's own backing store would not show it)
async function shot(name) {
  const r = await evaluate(
    `(() => { const r = document.querySelector('.t-slime .dish').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()`
  )
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...r, scale: 1 },
  })
  const file = join(OUT, `${name}.png`)
  writeFileSync(file, Buffer.from(data, 'base64'))
  const px = await evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,${data}'
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const p = x.getImageData(0, 0, c.width, c.height).data
    let chroma = 0, dark = 255
    for (let i = 0; i < p.length; i += 4) {
      chroma = Math.max(chroma, Math.max(p[i], p[i+1], p[i+2]) - Math.min(p[i], p[i+1], p[i+2]))
      dark = Math.min(dark, Math.round(0.2126 * p[i] + 0.7152 * p[i+1] + 0.0722 * p[i+2]))
    }
    // the clip's corner is outside the circle: bare ground, which is cream
    // and so has a chroma of its own that a dimmed dish lets through
    const ground = Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2])
    return { chroma, dark, ground }
  })()`)
  console.log(
    `     ${name}: max chroma ${px.chroma} (ground ${px.ground}), darkest luma ${px.dark}  ->  ${file}`
  )
  return px
}
const onCamera = "__lab.centerOn('slime'); __lab.setZoom(1)"
const offCamera = (s) =>
  `(() => { const o = __lab.world; __lab.setCam(${s}.x + o.w / 2, ${s}.y + o.h / 2) })()`

// ---- alive ---------------------------------------------------------------------
await evaluate(onCamera)
check(
  await until('__slimeSeen.keys >= 1 && __slimeSeen.deltas >= 2'),
  'the dish on camera is sent a keyframe and deltas'
)
// at the opening camera the dish is off camera, so the tab's first word is
// a no and the dish is asleep until it is first seen: let that revival land
await until(`(${STATE}).dish === 'none'`, 2000)
let s = await evaluate(STATE)
check(
  s.shown && !s.asleep && s.dish === 'none' && s.rim === 'none',
  `alive: no state, no filter (${JSON.stringify(s)})`
)
const alive = await shot('1-alive')

// ---- off camera, then back with the keyframe held ----------------------------
const home = await evaluate(
  '(() => { const p = window.__layout(); return { x: p.cam.x, y: p.cam.y } })()'
)
await evaluate(offCamera(JSON.stringify(home)))
check(await until(`(${STATE}).asleep`), 'off camera: the no is said and the tile is marked asleep')
s = await evaluate(STATE)
check(!s.shown, 'off camera: the dish really is off camera (display none)')
await evaluate('window.__holdSlime = true')
await evaluate(onCamera)
await sleep(800) // longer than the whole revival would take, were it to start
s = await evaluate(STATE)
check(
  s.shown &&
    s.asleep &&
    /grayscale\(1\)/.test(s.dish) &&
    /opacity\(0\.4\)/.test(s.dish) &&
    s.rim === s.dish,
  `back on camera, keyframe held: asleep, dish and rim filtered alike (${JSON.stringify(s)})`
)
const asleep = await shot('2-asleep')
check(
  asleep.chroma <= asleep.ground + 1,
  `asleep is desaturated: nothing on the dish is more colourful than the ground under it (max chroma ${alive.chroma} -> ${asleep.chroma}, ground ${asleep.ground})`
)
check(
  asleep.dark > alive.dark + 40,
  `asleep black is dimmed (darkest luma ${alive.dark} -> ${asleep.dark})`
)

// ---- the keyframe lands: stepped back to colour ------------------------------
const before = await evaluate('__slimeSeen.keys')
await evaluate(`(() => {
  window.__steps = []
  const d = document.querySelector('.t-slime .dish')
  const t0 = performance.now()
  const tick = () => { window.__steps.push(getComputedStyle(d).filter); if (performance.now() - t0 < 900) requestAnimationFrame(tick) }
  __releaseSlime(); tick()
})()`)
await sleep(1100)
s = await evaluate(STATE)
const keys = await evaluate('__slimeSeen.keys')
check(keys > before, 'the return brought a keyframe')
check(!s.asleep && s.dish === 'none', `revived: state cleared, filter gone (${JSON.stringify(s)})`)
const distinct = [...new Set(await evaluate('__steps'))]
check(
  distinct.length >= 3 && distinct.length <= 5,
  `the colour comes back in frames, not a fade: ${distinct.length} distinct filter values over the move\n     ${distinct.join('\n     ')}`
)
const revived = await shot('3-revived')
check(
  revived.chroma >= alive.chroma - 2 && revived.dark <= alive.dark + 2,
  'revived is as alive as before'
)

// ---- a hidden tab (PROXY: document.hidden overridden) -----------------------
await evaluate(`(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden === true })
  window.__hidden = true
  document.dispatchEvent(new Event('visibilitychange'))
})()`)
s = await evaluate(STATE)
check(s.asleep, 'hidden (proxy): the no is said on the event and the tile is marked asleep')
await evaluate(
  'window.__holdSlime = true; window.__hidden = false; document.dispatchEvent(new Event("visibilitychange"))'
)
await sleep(800)
s = await evaluate(STATE)
check(s.asleep && /grayscale\(1\)/.test(s.dish), 'returned (proxy), keyframe held: still asleep')
await shot('4-returned-asleep')
await evaluate('__releaseSlime()')
await sleep(1100)
s = await evaluate(STATE)
check(!s.asleep && s.dish === 'none', 'returned (proxy), keyframe landed: alive')
await shot('5-returned-alive')

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall states verified')
cleanup(failures.length ? 1 : 0)
