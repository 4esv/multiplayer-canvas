// scripts/verify/interface.mjs
// THE INTERFACE, MEASURED (BIBLE.md section 8, interface standards): the
// site's sizes against the conventions people already know, read off the
// painted page in a real browser, because a stylesheet cannot say where a box
// lands or how big a word is drawn once the world has scaled it.
//
// Three readings, on the public pages, on a phone, a laptop and a desktop monitor:
//
//   targets  every pressable's hit area, the invisible pads counted, against
//            the tap floor (--cv-ctrl-h: 44px, Apple's and WCAG 2.5.5's, and
//            the hard floor of 24 that WCAG 2.5.8 sets). A press lands on the
//            top element at a point, so the hit area is found the way a
//            finger finds it: by asking the page what is under each point
//            around the element.
//   text     the size a word is DRAWN at on the screen (its font size times
//            every scale above it, the world's camera included) and how long
//            a line of running text runs, in characters (45 to 75 is the
//            comfortable range every typographer quotes).
//   (the windows and the keys are held by tests that know them: focus-ring,
//   page-bar, keys.)
//
// An audit, not a gate: it prints what it measured and what is exempt and
// why. `--strict` exits 1 on a pressable that is under the floor and has no
// reason, which is what a gate on it would run. Needs Chrome (CHROME_PATH or
// the usual places) and a served build:
//   node scripts/verify/interface.mjs [baseUrl] [--strict]
import { browser } from '../img/textmode-bake.mjs'

// the two probes below are functions run in the page, not here
/* global document, getComputedStyle, innerWidth, innerHeight, NodeFilter */

const BASE = process.argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:3000'
const STRICT = process.argv.includes('--strict')
const PORT = Number(process.env.CDP_PORT || 9227)
const FLOOR = 44
const HARD = 24

const PAGES = [
  ['home', '/'],
  ['the work pile', '/work'],
  ['a case study', '/work/nao'],
  ['the feed', '/feed'],
  ['about', '/about'],
  ['an experiment', '/web-instruments'],
  ['not found', '/nope-nothing-here'],
]
// name, width, height, mobile, dpr: an iPhone 14, a MacBook Air's default, a 1080p monitor.
// The density is part of the reading: the camera rests on a pixel ladder whose rungs
// are a device pixel to the cell, so the same width opens at another zoom on another
// density, and the size a word is drawn at moves with it.
const SCREENS = [
  ['phone', 390, 844, true, 3],
  ['laptop', 1440, 900, false, 2],
  ['desktop', 1920, 1080, false, 1],
]

// Why a pressable under the floor is let be. Each is a thing that is true of
// the page, not a list of names: the reading finds the element, and the reason
// is the rule it falls under.
const EXEMPT = {
  inline: 'a link in running text (WCAG 2.5.5 and 2.5.8 both except it)',
  track: 'a slider track: the steppers and the keys do what it does (WCAG 2.5.8, equivalent)',
  pager: "world furniture at the ground's edge: held by hit pads (test/touch-affordance.test.js)",
}

// in the page: every pressable in view with its painted box and its hit box
const TARGETS = `(${function () {
  const sel = (el) => {
    let s = el.tagName.toLowerCase()
    const c = typeof el.className === 'string' ? el.className.trim() : ''
    if (c) s += '.' + c.split(/\s+/).slice(0, 3).join('.')
    const r = el.getAttribute('role')
    return r ? s + `[role=${r}]` : s
  }
  const Q =
    'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=slider], [role=radio], [role=switch], [role=checkbox], [role=option], .openable'
  const out = []
  for (const el of new Set(document.querySelectorAll(Q))) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue
    if (el.closest('[hidden], [inert], [aria-hidden="true"]')) continue
    // a text field is pressed on its whole box, the field around the input
    const box = el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range])')
      ? el.closest('.k-field') || el
      : el.matches('a.k-tab-go')
        ? el.closest('.k-tab') || el
        : el
    const r = box.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue
    // really there: what is at its centre is it, or in it
    const cx = Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1)
    const cy = Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1)
    const top = document.elementFromPoint(cx, cy)
    if (!top || !(el === top || el.contains(top) || top.contains(el) || box.contains(top))) continue
    let hw = r.width
    let hh = r.height
    if (r.width < 44 || r.height < 44) {
      let x0 = 1e9
      let x1 = -1e9
      let y0 = 1e9
      let y1 = -1e9
      for (
        let y = Math.max(0, Math.floor(r.top - 48));
        y <= Math.min(innerHeight - 1, r.bottom + 48);
        y += 2
      )
        for (
          let x = Math.max(0, Math.floor(r.left - 48));
          x <= Math.min(innerWidth - 1, r.right + 48);
          x += 2
        ) {
          const t = document.elementFromPoint(x, y)
          if (t && (box === t || box.contains(t) || el === t || el.contains(t))) {
            x0 = Math.min(x0, x)
            x1 = Math.max(x1, x)
            y0 = Math.min(y0, y)
            y1 = Math.max(y1, y)
          }
        }
      if (x1 >= x0) {
        hw = Math.max(r.width, x1 - x0 + 2)
        hh = Math.max(r.height, y1 - y0 + 2)
      }
    }
    const inline =
      el.tagName === 'A' &&
      cs.display === 'inline' &&
      /^(P|LI|DD|BLOCKQUOTE|FIGCAPTION|H[1-6]|SPAN|EM|STRONG|SUP)$/.test(el.parentElement?.tagName)
    out.push({
      who: sel(el),
      label: (el.getAttribute('aria-label') || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 22),
      w: Math.round(r.width),
      h: Math.round(r.height),
      hw: Math.round(hw),
      hh: Math.round(hh),
      why: inline
        ? 'inline'
        : el.matches('.k-scroll > .k-track')
          ? 'track'
          : el.closest('.pager') && el.closest('#scene')
            ? 'pager'
            : null,
    })
  }
  return out
}})()`

// in the page: the size each run of text is drawn at, and the length of lines
const TEXT = `(${function () {
  const runs = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim()
    if (t.length < 3) continue
    const el = n.parentElement
    if (
      !el ||
      seen.has(el) ||
      el.closest('script, style, noscript, svg, [hidden], [aria-hidden="true"]')
    )
      continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    const r = [...range.getClientRects()].find((x) => x.width > 0 && x.height > 0)
    if (!r || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight)
      continue
    // really on the screen: the world's words sit under a page that is open over it
    const top = document.elementFromPoint(
      Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1),
      Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1)
    )
    if (!top || !(el === top || el.contains(top) || top.contains(el))) continue
    seen.add(el)
    // the scale above it: how wide the box is drawn against how wide it is laid out
    const drawn = el.getBoundingClientRect().width
    const scale = el.offsetWidth > 0 ? drawn / el.offsetWidth : 1
    runs.push({
      px: Math.round(parseFloat(cs.fontSize) * scale * 10) / 10,
      who:
        el.tagName.toLowerCase() +
        (typeof el.className === 'string' && el.className.trim()
          ? '.' + el.className.trim().split(/\s+/)[0]
          : ''),
      text: t.slice(0, 24),
    })
  }
  const lines = []
  for (const p of document.querySelectorAll('.prose p, #sheetInner p')) {
    const lh = parseFloat(getComputedStyle(p).lineHeight)
    const r = p.getBoundingClientRect()
    if (!lh || r.height < lh * 3 - 1 || r.width < 1) continue
    lines.push(Math.round(p.textContent.trim().length / Math.round(r.height / lh)))
  }
  return { runs, lines }
}})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = await browser(PORT, ['--hide-scrollbars', '--font-render-hinting=none'])
await chrome.send('Page.enable')
let unexplained = 0
try {
  for (const [screen, w, h, mobile, dpr] of SCREENS) {
    console.log(`\n######## ${screen} ${w}x${h}`)
    await chrome.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: dpr,
      mobile,
    })
    await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: mobile })
    for (const [name, path] of PAGES) {
      await chrome.send('Page.navigate', { url: 'about:blank' })
      await sleep(150)
      await chrome.send('Page.navigate', { url: BASE + path })
      await sleep(3500)
      const targets = await chrome.evaluate(TARGETS)
      const { runs, lines } = await chrome.evaluate(TEXT)
      const under = targets.filter((t) => t.hw < FLOOR || t.hh < FLOOR)
      const bare = under.filter((t) => !t.why)
      unexplained += bare.length
      const hard = under.filter((t) => t.hw < HARD || t.hh < HARD).length
      lines.sort((a, b) => a - b)
      const med = lines.length ? lines[Math.floor(lines.length / 2)] : null
      const small = runs.filter((r) => r.px < 12)
      console.log(
        `\n${name} ${path}\n  targets  ${targets.length} in view, ${under.length} under ${FLOOR} (${hard} under ${HARD}), ${bare.length} with no reason`
      )
      for (const t of under)
        console.log(
          `    ${t.why ? 'exempt ' : 'UNDER  '} ${t.who.slice(0, 44).padEnd(44)} hit ${t.hw}x${t.hh} (drawn ${t.w}x${t.h}) "${t.label}"${t.why ? `  ${EXEMPT[t.why]}` : ''}`
        )
      const least = runs.reduce((m, r) => (r.px < m.px ? r : m), runs[0] ?? { px: 0, text: '' })
      console.log(
        `  text     ${runs.length} runs, smallest ${least.px}px "${least.text}", ${small.length} under 12px${med ? `; running text ${med} characters a line (longest ${lines[lines.length - 1]})${lines[lines.length - 1] > 75 ? ', over 75' : ''}` : ''}`
      )
      const groups = new Map()
      for (const r of small)
        groups.set(`${r.px}px ${r.who}`, (groups.get(`${r.px}px ${r.who}`) ?? 0) + 1)
      for (const [k, n] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, 4))
        console.log(`           under 12: ${String(n).padStart(2)} x ${k}`)
    }
  }
} finally {
  chrome.close()
}
console.log(
  `\n${unexplained} pressable${unexplained === 1 ? '' : 's'} under ${FLOOR}px with no reason${STRICT ? '' : ' (an audit: --strict makes it a gate)'}`
)
process.exit(STRICT && unexplained ? 1 : 0)
