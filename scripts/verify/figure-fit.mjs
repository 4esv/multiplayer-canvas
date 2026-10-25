// scripts/verify/figure-fit.mjs
// Issue #300, in a real browser: EVERY FIGURE FITS A PHONE. The author's
// review of #311 (2026-09-24): at 390x844 in mobile emulation every figure
// must fit its column with no horizontal scroll and no clipped label, and
// scale down legibly. Measured before the fix: the board and the builder
// were drawn at 688 and 636 px and scrolled inside their boxes, a 342 px
// column away from being read.
//
// Every case study (content/feed, `type: case-study`) is loaded directly at
// 390x844, mobile, and at 1440x900, and for every picture in the prose (svg,
// img, video) that is painted, five readings:
//   fit      its box sits inside the column (.prose's content box)
//   scroll   no figure, the prose, the page's scroller or the document
//            scrolls sideways
//   clip     every word in a drawn figure (<text>) sits inside its drawing
//   legible  every word in a drawn figure paints at 11 px or more, after
//            whatever the drawing was scaled by to fit
//   centred  the picture sits in the middle of its figure's box, and a box
//            in the flow in the middle of the column (author, 2026-09-24:
//            every figure centred, every width). Measured before: the board
//            and the builder sat 384 and 436 px off centre at 1440, every
//            drawing 4 px off at 390.
// and, from the review after that (author, 2026-09-24, "one axis"), at 390,
// 768, 1280 and 1920 as asked, and 1440:
//   axis     the prose column itself is centred in the frame, so text and
//            figures share one axis: a column on the left of a wider page
//            with the figures centred in it is what the review threw out
//   hung     a figure the flow module hung (canvas/case-study.js) sits on the
//            column's right edge, no line of any paragraph crosses it, the
//            text beside it is at least 40ch wide, and it is outlasted by
//            the paragraphs it hangs in (its foot is above the run's foot,
//            and whatever comes after the run starts below it): no overlap,
//            no orphaned figure. Below the width for it (a phone, a tablet)
//            nothing is hung, and at 1280 and 1920 something is, across the
//            six studies: a guard that could pass on a flow that never ran
//            would be a guess
//   ui       a figure that is a UI (cf-ui: the board, the builder, the
//            modal) exists, three of them, and like every figure stands
//            unboxed (author: no container around a UI)
// and, from the review of that (author, 2026-09-24, measured at 1440: text
// 289..1005 with its centre at 647, figures centred at 720, code from 320):
//   measure  every paragraph and head spans the column, edge to edge: the
//            column IS the text's measure, so text, figures and code share
//            one centre
//   edges    every block in the flow (a code block, a figure, a grid) sits
//            inside the column and either spans it or is centred on it:
//            one rule for every block; a code block is text, so it spans
//            (the 50rem strip, centred 31px inside the text, fails)
//   frame    no figure has a border, padding or a ground of its own; its
//            title is a plain caption line UNDER its picture (#325: an
//            object stands alone, no frame, no label over it)
//   bar      the page bar is one, full width, stuck to the top once scrolled,
//            and the only previous/next on the page (#338)
//   foot     the way back to the top is never in the bar: a page over two
//            screens tall ends in exactly one, the last thing in its flow,
//            and a shorter page shows none
//
// Runs against a served build (the smoke container in CI, `npm start`
// locally). Usage:
//   node scripts/verify/figure-fit.mjs [baseUrl]
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9232)
const FEED = new URL('../../content/feed/', import.meta.url)
const STUDIES = readdirSync(FEED)
  .filter((f) => f.endsWith('.md'))
  .filter((f) =>
    /^type: case-study$/m.test(readFileSync(new URL(f, FEED), 'utf8').split(/^---$/m)[1] || '')
  )
  .map((f) => f.slice(0, -3))
const SIZES = [
  [390, 844, 3, true],
  [768, 1024, 2, false],
  [1280, 800, 1, false],
  [1440, 900, 1, false],
  [1920, 1080, 1, false],
]
const FLOOR = 11 // px, the smallest a figure's word may paint
const MIN_BESIDE_CH = 60 // the text beside a hung figure, canvas/case-study.js
const HANG_FROM = 1280 // the narrowest frame asked for that has the width to hang one

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
const profile = mkdtempSync(join(tmpdir(), 'figure-fit-'))
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

await send('Page.enable')
await send('Runtime.enable')

const READ = `(async () => {
  await document.fonts.ready
  const prose = document.querySelector('#sheetInner .prose')
  if (!prose) return { error: 'no prose' }
  const pc = prose.getBoundingClientRect()
  const ps = getComputedStyle(prose)
  const left = pc.left + parseFloat(ps.paddingLeft), right = pc.right - parseFloat(ps.paddingRight)
  const r1 = (n) => Math.round(n * 10) / 10
  const wrong = []
  const sideways = (el, name) => {
    if (el && el.scrollWidth > el.clientWidth + 1) wrong.push(name + ' scrolls sideways (' + el.scrollWidth + ' > ' + el.clientWidth + ')')
  }
  sideways(document.documentElement, 'the document')
  sideways(document.getElementById('mscroll'), 'the page')
  sideways(prose, 'the prose')
  // one axis: the column in the middle of the frame
  const frame = document.getElementById('mscroll').clientWidth // the frame less its scrollbar
  const axis = pc.left - (frame - pc.right)
  if (Math.abs(axis) > 1) wrong.push('the column is ' + r1(axis) + 'px off the middle of the frame')
  const ch = parseFloat(getComputedStyle(prose).fontSize) * 0.5 // DotGothic16's "0" is half an em
  let hung = 0, ui = 0, footLong = 0
  const lineRects = (p) => { const rg = document.createRange(); rg.selectNodeContents(p); return [...rg.getClientRects()] }
  prose.querySelectorAll(':scope > .figure').forEach((fig) => {
    const f = fig.getBoundingClientRect(), fs = getComputedStyle(fig)
    const name = (fig.querySelector('.figure-title')?.textContent || fig.querySelector('img, video, svg')?.tagName.toLowerCase() || 'figure').trim()
    if (fig.querySelector(':scope > .cf-ui')) ui++
    // frame: no box, no ground, the caption under the picture
    if (parseFloat(fs.borderLeftWidth) || parseFloat(fs.paddingLeft) || parseFloat(fs.paddingTop))
      wrong.push(name + ': a figure in a box (border ' + fs.borderLeftWidth + ', padding ' + fs.paddingTop + ' ' + fs.paddingLeft + ')')
    if (fs.backgroundColor !== 'rgba(0, 0, 0, 0)') wrong.push(name + ': a figure on a ground of its own (' + fs.backgroundColor + ')')
    const pic = fig.querySelector(':scope > svg, :scope > img, :scope > video')
    const t = fig.querySelector('.figure-title')
    if (t && pic) {
      const ts = getComputedStyle(t), tb = t.getBoundingClientRect()
      const pics = [...fig.querySelectorAll(':scope > svg, :scope > img, :scope > video')].filter((e) => e.getClientRects().length)
      const picBottom = Math.max(...pics.map((e) => e.getBoundingClientRect().bottom))
      if (ts.display === 'none') wrong.push(name + ': its caption is hidden')
      else if (tb.top < picBottom - 0.5) wrong.push(name + ': its title is over the picture, not a caption under it')
      if (parseFloat(ts.borderTopWidth) || parseFloat(ts.borderBottomWidth)) wrong.push(name + ': its caption is boxed')
    }
    if (fs.float === 'none') return
    hung++
    if (Math.abs(f.right - right) > 1) wrong.push(name + ': hung ' + r1(right - f.right) + 'px short of the column edge')
    const beside = f.left - parseFloat(fs.marginLeft) - left
    if (beside < ${MIN_BESIDE_CH} * ch - 0.5) wrong.push(name + ': ' + r1(beside / ch) + 'ch of text beside it')
    const run = []
    for (let el = fig.nextElementSibling; el && el.tagName === 'P'; el = el.nextElementSibling) run.push(el)
    if (!run.length) { wrong.push(name + ': hung with no paragraph after it'); return }
    for (const p of run) for (const lr of lineRects(p))
      if (lr.right > f.left + 0.5 && lr.left < f.right - 0.5 && lr.bottom > f.top + 0.5 && lr.top < f.bottom - 0.5) {
        wrong.push(name + ': a line of text crosses it (' + r1(lr.left) + '..' + r1(lr.right) + ' at ' + r1(lr.top) + ')'); break
      }
    const foot = run[run.length - 1].getBoundingClientRect().bottom
    if (f.bottom > foot + 0.5) wrong.push(name + ': orphaned, its foot ' + r1(f.bottom - foot) + 'px below the text it hangs in')
    const after = run[run.length - 1].nextElementSibling
    if (after && after.getBoundingClientRect().top < f.bottom - 0.5)
      wrong.push(name + ': ' + after.tagName.toLowerCase() + ' after the run starts ' + r1(f.bottom - after.getBoundingClientRect().top) + 'px above its foot')
  })
  // measure: the text spans the column, so its centre is the column's
  let lines = 0
  prose.querySelectorAll(':scope > p, :scope > h2').forEach((p) => {
    const b = p.getBoundingClientRect()
    if (!b.height) return
    lines++
    if (Math.abs(b.left - left) > 1 || Math.abs(b.right - right) > 1)
      wrong.push(p.tagName.toLowerCase() + ' "' + p.textContent.trim().slice(0, 24) + '" runs ' + r1(b.left) + '..' + r1(b.right) + ' in a column ' + r1(left) + '..' + r1(right))
  })
  // edges: one rule for every block, the column's edges or centred on its axis
  let blocks = 0
  prose.querySelectorAll(':scope > *').forEach((el) => {
    if (el.tagName === 'P' || el.tagName === 'H2' || getComputedStyle(el).float !== 'none') return
    const b = el.getBoundingClientRect()
    if (!b.width || !b.height) return
    blocks++
    const tag = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')
    if (b.left < left - 0.5 || b.right > right + 0.5)
      wrong.push(tag + ' ' + r1(b.left) + '..' + r1(b.right) + ' outside the column ' + r1(left) + '..' + r1(right))
    const spans = Math.abs(b.left - left) <= 1 && Math.abs(b.right - right) <= 1
    const off = (b.left - left) - (right - b.right)
    if (!spans && Math.abs(off) > 1) wrong.push(tag + ': neither on the edges of the column nor centred (' + r1(off) + 'px off)')
    // code is text: it sits on the text's edges, never inset inside them
    else if (el.tagName === 'PRE' && !spans) wrong.push(tag + ' ' + r1(b.left) + '..' + r1(b.right) + ': code inset from the text edges ' + r1(left) + '..' + r1(right))
  })
  // the page bar (#338): one, the sheet's full width, stuck to the top of
  // the frame once the page is scrolled, its tabs the only previous/next
  const bars = document.querySelectorAll('#sheet > .k-bar')
  let row = bars.length
  if (row !== 1) wrong.push(row + ' page bars, expected one')
  else {
    const bar = bars[0], b = bar.getBoundingClientRect(), sh = document.getElementById('sheet').getBoundingClientRect()
    if (Math.abs(b.left - sh.left) > 0.5 || Math.abs(b.right - sh.right) > 0.5) wrong.push('the bar is not the full width of the sheet: ' + r1(b.left) + '..' + r1(b.right) + ' in ' + r1(sh.left) + '..' + r1(sh.right))
    const seats = [...bar.children].filter((e) => !e.hidden && e.getClientRects().length)
    // one row: every seat inside the bar's own height (the name is centred
    // on the row, so its top differs from the buttons' by design; a seat
    // that wrapped would sit below the bar)
    const off = seats.filter((e) => { const s = e.getBoundingClientRect(); return s.top < b.top - 0.5 || s.bottom > b.bottom + 0.5 })
    if (off.length) wrong.push('the bar is on more than one row: ' + off.map((e) => e.className).join(', ') + ' outside it')
    // the bar is a strip of tabs over the ring (#338): one lit, the close on
    // it alone. Every tab keeps a readable title (ten characters of its face
    // at the least) and a strip too long for the bar scrolls inside itself
    // rather than squeeze them, with the lit tab wholly in view and the
    // corner close outside the strip, in the bar
    const tabs = [...bar.querySelectorAll('.k-tabs > .k-tab')]
    if (tabs.length < 2) wrong.push('the bar has no tabs over the ring')
    if (bar.querySelectorAll('.k-tab.is-on [aria-current="page"]').length !== 1) wrong.push('the bar has no one lit tab')
    if (bar.querySelectorAll('.k-close').length !== 1 || !bar.querySelector('.k-tab.is-on .k-close')) wrong.push('the close is not on the lit tab alone')
    const strip = bar.querySelector('.k-tabs')
    if (strip) {
      const st = strip.getBoundingClientRect()
      if (st.left < b.left - 0.5 || st.right > b.right + 0.5) wrong.push('the tab strip overflows the bar')
      if (strip.scrollWidth > strip.clientWidth + 0.5 && getComputedStyle(strip).overflowX !== 'auto') wrong.push('the tabs overflow a strip that does not scroll')
      const probe = document.createElement('span')
      probe.textContent = 'x'.repeat(20)
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit'
      const go0 = strip.querySelector('.k-tab-go')
      go0.appendChild(probe)
      const cw = probe.getBoundingClientRect().width / 20
      probe.remove()
      const cut = tabs.filter((t) => { const go = t.querySelector('.k-tab-go'); return go.scrollWidth > go.clientWidth + 0.5 && go.clientWidth < 10 * cw })
      if (cut.length) wrong.push(cut.length + ' tabs cut to under ten characters of their title')
      const lit = strip.querySelector('.k-tab.is-on')
      const lr = lit && lit.getBoundingClientRect()
      if (lr && (lr.left < st.left - 0.5 || lr.right > st.right + 0.5)) wrong.push('the lit tab is scrolled out of the strip: ' + r1(lr.left) + '..' + r1(lr.right) + ' in ' + r1(st.left) + '..' + r1(st.right))
      const x = bar.querySelector(':scope > .page-x')
      const xr = x && x.getBoundingClientRect()
      if (!xr || xr.left < st.right - 0.5 || xr.right > b.right + 0.5) wrong.push('the corner close is not in the bar beside the strip')
    }
    const sc = document.getElementById('mscroll')
    sc.scrollTop = 600
    const stuck = bar.getBoundingClientRect().top
    sc.scrollTop = 0
    if (Math.abs(stuck) > 0.5) wrong.push('the bar does not stick to the top when scrolled (' + r1(stuck) + 'px)')
    if (document.querySelector('#sheetInner .k-dock, #pageNav, #toTop')) wrong.push('a second previous/next is on the page beside the bar')
    if (bar.querySelector('.k-top') || /back to the top/.test(bar.textContent + bar.innerHTML)) wrong.push('the way back to the top is in the bar')
    // the page's foot: a long page (over two screens of its scroll owner)
    // ends in exactly one way back to the top, the last thing in its flow;
    // a short one shows none
    const feet = [...document.querySelectorAll('#sheetInner .to-top')].filter((e) => e.getClientRects().length)
    const long = sc.scrollHeight > 2 * sc.clientHeight
    if (long && feet.length !== 1) wrong.push('a long page ends in ' + feet.length + ' ways back to the top, expected one')
    if (!long && feet.length) wrong.push('a short page shows a way back to the top')
    if (feet.length === 1) {
      const kids = [...document.getElementById('sheetInner').children].filter((e) => e.getClientRects().length)
      if (kids[kids.length - 1] !== feet[0].closest('.page-foot')) wrong.push('the way back to the top is not the foot of the page')
    }
    footLong += long ? 1 : 0
  }
  let pictures = 0, words = 0
  prose.querySelectorAll('svg, img, video').forEach((el) => {
    if (el.closest('svg') !== el && el.tagName.toLowerCase() === 'svg') return
    const b = el.getBoundingClientRect()
    if (!b.width || !el.getClientRects().length) return // not painted at this width
    pictures++
    const name = (el.closest('.figure')?.querySelector('.figure-title')?.textContent || el.tagName.toLowerCase()).trim()
    if (b.left < left - 0.5 || b.right > right + 0.5)
      wrong.push(name + ': ' + r1(b.left) + '..' + r1(b.right) + ' outside the column ' + r1(left) + '..' + r1(right))
    const fig = el.closest('.figure, figure')
    if (fig) {
      sideways(fig, name + "'s box")
      const f = fig.getBoundingClientRect(), fs = getComputedStyle(fig)
      const fl = f.left + parseFloat(fs.paddingLeft) + parseFloat(fs.borderLeftWidth)
      const fr = f.right - parseFloat(fs.paddingRight) - parseFloat(fs.borderRightWidth)
      const off = (b.left - fl) - (fr - b.right)
      if (Math.abs(off) > 1) wrong.push(name + ': ' + r1(off) + 'px off centre in its box')
      const boff = (f.left - left) - (right - f.right)
      if (fs.float === 'none' && Math.abs(boff) > 1) wrong.push(name + ': its box ' + r1(boff) + 'px off centre in the column')
    }
    if (el.tagName.toLowerCase() !== 'svg') return
    el.querySelectorAll('text').forEach((t) => {
      words++
      const tb = t.getBoundingClientRect()
      if (tb.left < b.left - 0.5 || tb.right > b.right + 0.5 || tb.top < b.top - 0.5 || tb.bottom > b.bottom + 0.5)
        wrong.push(name + ': "' + t.textContent + '" is cut by the drawing edge')
      const px = parseFloat(getComputedStyle(t).fontSize) * (b.width / el.viewBox.baseVal.width)
      if (px < ${FLOOR} - 0.05) wrong.push(name + ': "' + t.textContent + '" paints at ' + r1(px) + 'px')
    })
  })
  return { pictures, words, hung, ui, lines, blocks, row, footLong, column: r1(right - left), wrong }
})()`

const failures = []
let checked = 0
const hungAt = {} // width -> figures hung across the studies
let uiSeen = 0
let longSeen = 0 // pages long enough to end in the way back to the top
try {
  for (const [W, H, DPR, mobile] of SIZES) {
    hungAt[W] = 0
    await send('Emulation.setDeviceMetricsOverride', {
      width: W,
      height: H,
      deviceScaleFactor: DPR,
      mobile,
    })
    for (const slug of STUDIES) {
      await send('Page.navigate', { url: 'about:blank' })
      await sleep(150)
      await send('Page.navigate', { url: `${BASE}/work/${slug}` })
      await sleep(2500)
      const r = await evaluate(READ.replace('WIDTH >= 768', `${W} >= 768`))
      checked++
      const wrong = r.error ? [r.error] : r.wrong
      hungAt[W] += r.hung || 0
      uiSeen += r.ui || 0
      longSeen += r.footLong || 0
      if (W < HANG_FROM && r.hung)
        wrong.push(`${r.hung} figure(s) hung in a ${r.column}px column: no width for it`)
      console.log(
        `  ${wrong.length ? 'FAIL' : 'ok  '} ${W}x${H} /work/${slug.padEnd(22)} ${r.pictures} pictures, ${r.words} words, ${r.lines} lines, ${r.blocks} blocks, column ${r.column}px, ${r.hung} hung, ${r.ui} ui, bars ${r.row}`
      )
      for (const w of wrong) console.log('         ' + w)
      if (wrong.length) failures.push(`${W}x${H} /work/${slug}: ${wrong.length} problem(s)`)
    }
  }
} catch (err) {
  console.error(err)
  cleanup(2)
}
// an empty run is not a clean one
if (!STUDIES.length || checked !== STUDIES.length * SIZES.length) {
  console.error(`FAIL: checked ${checked} pages of ${STUDIES.length * SIZES.length}`)
  cleanup(1)
}
// the flow ran: at the widths with room for it something hung, and the
// three UIs were seen unboxed (each page, each width)
for (const [W] of SIZES)
  if (W >= HANG_FROM && !hungAt[W])
    failures.push(`${W}: no figure hung in any study, the flow never ran`)
if (!longSeen) failures.push('no page was long enough to show its foot: the foot guard never ran')
if (uiSeen !== 3 * SIZES.length)
  failures.push(`${uiSeen} UI figures seen, expected ${3 * SIZES.length}`)
if (failures.length) {
  console.error(
    'FAIL: a figure does not fit its column, is off its axis, hangs wrong, wears a frame, a block is off the edge rule, or the page bar is not one, stuck, full-width row\n  ' +
      failures.join('\n  ')
  )
  cleanup(1)
}
console.log(
  `every figure in ${STUDIES.length} case studies fits, stands unframed on the text's own axis and hangs only in text, every block on one edge rule, one page bar, at ${SIZES.map((z) => z[0]).join(', ')}`
)
cleanup(0)
