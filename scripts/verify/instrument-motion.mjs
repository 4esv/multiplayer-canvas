// scripts/verify/instrument-motion.mjs
// "the synth shakes enough that someone could
// think I'm trying to catch an epileptic". Nothing on /web-instruments may
// shake, strobe or flash (WCAG 2.3.1, three flashes a second at most).
//
// In a real browser, every element of the rig is read once a frame (rect,
// text luminance, background luminance, edge colours) while the page is (1)
// left alone, (2) played from the keyboard at 10 notes a second, (3) played
// with a fader pushed at 60 steps a second, and (4) played under
// prefers-reduced-motion. Then:
//   idle       nothing changes at all: there is no autonomous animation, and
//              the scope at rest is a still picture
//   played     nothing moves, grows or changes colour except the control
//              under the hand and the screens, and that control changes at
//              the hand's tempo (one press, one release) with no ramp
//              between. A screen (the scope, the envelope view, the sheet)
//              redraws its cells in place: none of them moves, and none
//              changes more than six times a second, three flashes, the
//              WCAG 2.3.1 line (a flash is an up-and-down pair). The
//              ukulele's quaver may drift: up only, a step at a time, under
//              three steps a second, which is a float and not a shake
//              (the rule: things may move by themselves;
//              nothing shakes, strobes or flashes)
// Elements are keyed by their place in the tree, not by identity, so a
// screen rebuilt on every note is still compared frame to frame (which
// catches a settle ramp that restarts on every note).
//
// Runs against a served build. Usage:
//   node scripts/verify/instrument-motion.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9391)
const CHROME = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
  .filter(Boolean)
  .find((p) => existsSync(p))
if (!CHROME) {
  console.error('no chrome binary found; set CHROME_PATH')
  process.exit(2)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'probe-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    // the scope draws what the bus hears: the audio has to run without a
    // real hand, or a typed run would prove nothing about the scope
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ],
  { stdio: 'ignore' }
)
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
  throw new Error('no cdp')
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600))
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
const setup = async (reduce) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }],
  })
  await send('Page.navigate', { url: `${BASE}/web-instruments` })
  await waitFor(`!!document.querySelector('.carousel-slide .k-white')`, 'the keys')
}
const pick = async (idx, ready) => {
  await evaluate(`document.querySelectorAll('.k-cardtab')[${idx}].click()`)
  await waitFor(`!!document.querySelector('.carousel-slide:not([inert]) ${ready}')`, `slide ${idx}`)
  await sleep(300)
}

const SAMPLE = `(async (stim, frames) => {
  const path = (e) => { const parts = []; while (e && e !== document.body) { let i = 0, s = e; while ((s = s.previousElementSibling)) i++; parts.push(e.tagName.toLowerCase() + ':' + i); e = e.parentElement } return parts.reverse().join('/') }
  const lum = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return 0; const [r,g,b] = m.map(Number); return 0.2126*r+0.7152*g+0.0722*b }
  const snap = () => { const out = new Map(); for (const e of document.querySelectorAll('.rig, .rig *')) { const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue; const cs = getComputedStyle(e); const where = e.closest('.sheet') ? 'sheet ' : e.closest('.env') ? 'env ' : e.closest('.k-scope') ? 'screen ' : e.closest('.float') ? 'float ' : ''; out.set(path(e), { rect: [r.x, r.y, r.width, r.height], lum: lum(cs.color), bg: lum(cs.backgroundColor), bd: cs.borderTopColor + cs.borderLeftColor, name: where + e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : '') }) } return out }
  const samples = []
  const t0 = performance.now()
  let stop = false
  const stimP = stim(t0).then(() => { stop = true })
  await new Promise((done) => { const f = () => { samples.push([performance.now() - t0, snap()]); if (samples.length >= frames && stop) return done(); requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await stimP
  const acc = new Map()
  for (let k = 1; k < samples.length; k++) {
    const [ta, A] = samples[k-1], [tb, B] = samples[k]
    for (const [key, b] of B) {
      const a = A.get(key); if (!a) continue
      let row = acc.get(key); if (!row) { row = { name: b.name, moves: 0, falls: 0, maxd: 0, size: 0, lum: 0, bg: 0, bd: 0, at: [] }; acc.set(key, row) }
      const d = Math.hypot(a.rect[0]-b.rect[0], a.rect[1]-b.rect[1])
      let hit = false
      if (d > 0.5) { row.moves++; row.maxd = Math.max(row.maxd, d); if (b.rect[1] - a.rect[1] > 0.5 || Math.abs(b.rect[0] - a.rect[0]) > 0.5) row.falls++; hit = true }
      if (Math.abs(a.rect[2]-b.rect[2]) > 0.5 || Math.abs(a.rect[3]-b.rect[3]) > 0.5) { row.size++; hit = true }
      if (Math.abs(a.lum-b.lum) > 2) { row.lum++; hit = true }
      if (Math.abs(a.bg-b.bg) > 2) { row.bg++; hit = true }
      if (a.bd !== b.bd) { row.bd++; hit = true }
      if (hit && row.at.length < 12) row.at.push(Math.round(tb))
    }
  }
  const report = [...acc.values()].filter(r => r.moves || r.size || r.lum || r.bg || r.bd).map(r => ({ ...r, maxd: +r.maxd.toFixed(1) }))
  const secs = (samples[samples.length-1][0] - samples[0][0]) / 1000
  return { frames: samples.length, secs: +secs.toFixed(2), report }
})`

const key = (ch) =>
  `document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(ch)}, bubbles: true }))`
const typing = (ch) =>
  `() => new Promise(done => { let n = 0; const iv = setInterval(() => { ${key(ch)}; if (++n >= 12) { clearInterval(iv); setTimeout(done, 300) } }, 100) })`
const idle = `() => new Promise(done => setTimeout(done, 1000))`
// the fader run: this many pushes, up eight stops and down eight, 60 a second
const PUSHES = 60
const fader = `() => new Promise(done => { const f = document.querySelector('#card-synth [data-fader="a"]'); let n = 0; const iv = setInterval(() => { f.dispatchEvent(new KeyboardEvent('keydown', { key: n % 16 < 8 ? 'ArrowUp' : 'ArrowDown', bubbles: true })); if (++n >= ${PUSHES}) { clearInterval(iv); setTimeout(done, 300) } }, 16) })`

// what a played surface may do: the struck part presses and releases (a
// key's picture, a pad's face, a fret's lamp); the fader's cap follows the
// hand. The screens redraw their cells. Anything else that moves or
// changes colour is a shake.
// (a pad's sparks are the pad's, there while it is down)
const HAND =
  /^(button\.k-part\.k-(white|black)|button\.k-hw|span\.k-cell\.is-live\.spark|button\.k-part\.fret|img\.k-px\.k-lamp|div\.k-fader)/
const SCREEN = /^(screen|sheet) /
// the ukulele's quaver: it rises and goes
const FLOAT = /^float /
// the fader's cap and the envelope view it draws follow the hand: one step
// per push, never more (a ramp or a jitter would be more)
const FOLLOWS = /^(img\.k-px\.k-cap|env )/
let failed = 0
const fail = (msg) => {
  failed++
  console.log(`  FAIL ${msg}`)
}
function judge(name, r, { played }) {
  console.log(
    `\n${name}: ${r.frames} frames over ${r.secs}s, ${r.report.length} element(s) changed`
  )
  for (const e of r.report) {
    const line = `${e.name} moves=${e.moves} d=${e.maxd} size=${e.size} lum=${e.lum} bg=${e.bg} edges=${e.bd}`
    if (!played) {
      fail(`idle, yet ${line}`)
      continue
    }
    if (HAND.test(e.name)) {
      // twelve strikes at 10 Hz: a press and a release each, no ramp between
      const flips = Math.max(e.bg, e.bd, e.lum)
      if (flips > 24) fail(`the struck control ramps: ${line}`)
      if (e.moves > 24) fail(`the struck control jitters: ${line}`)
      continue
    }
    if (FOLLOWS.test(e.name)) {
      if (Math.max(e.moves, e.bg, e.lum, e.bd) > PUSHES) fail(`it runs ahead of the hand: ${line}`)
      continue
    }
    if (FLOAT.test(e.name)) {
      // straight up, a step at a time, under three steps a second: never
      // down or sideways (a shake is back and forth), never faster
      if (e.falls) fail(`the quaver moves other than up: ${line}`)
      if (e.moves > 3 * r.secs) fail(`the quaver steps faster than three a second: ${line}`)
      const flips = Math.max(e.bg, e.lum, e.bd)
      if (flips > 6 * r.secs) fail(`the quaver strobes: ${line}`)
      continue
    }
    if (SCREEN.test(e.name)) {
      // cells are drawn in place (a note on the sheet is written once where
      // it goes, so the sheet's cells may take a new place in the tree);
      // no cell may change more than six times a second
      if (e.moves && !e.name.startsWith('sheet ')) fail(`a screen cell moves: ${line}`)
      const flips = Math.max(e.bg, e.lum, e.bd)
      if (flips > 6 * r.secs) fail(`a screen strobes: ${line}`)
      continue
    }
    fail(`something not under the hand changed: ${line}`)
  }
}

await setup(false)
await pick(4, '.k-white')
judge('synth, idle', await evaluate(`${SAMPLE}(${idle}, 60)`), { played: false })
judge('synth, typed at 10 Hz', await evaluate(`${SAMPLE}(${typing('a')}, 60)`), { played: true })
judge('synth, a fader at 60 Hz', await evaluate(`${SAMPLE}(${fader}, 60)`), { played: true })
for (const [idx, inst, ready, ch] of [
  [0, 'rhodes', '.k-white', 'a'],
  [1, 'bass', '.fret', 'a'],
  [2, 'ukulele', '.fret', 'a'],
  [3, 'drums', '.k-hw', 'k'],
]) {
  await pick(idx, ready)
  judge(`${inst}, typed at 10 Hz`, await evaluate(`${SAMPLE}(${typing(ch)}, 60)`), { played: true })
}
await setup(true)
await pick(4, '.k-white')
judge(
  'synth under prefers-reduced-motion, typed at 10 Hz',
  await evaluate(`${SAMPLE}(${typing('a')}, 60)`),
  { played: true }
)

console.log(
  failed
    ? `\ninstrument-motion: ${failed} failure(s)`
    : '\ninstrument-motion: nothing shakes, strobes or flashes'
)
chrome.kill()
await new Promise((r) => chrome.once('exit', r))
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
} catch {
  /* chrome still writing its profile as it exits: the tmp dir outlives us */
}
process.exit(failed ? 1 : 0)
