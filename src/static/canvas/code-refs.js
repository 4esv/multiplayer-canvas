// canvas/code-refs.js: a code block's copy key, and the mapping between a
// case study's prose and what it describes.
//
// The page arrives complete: lib/markdown.js has numbered every fence and
// given a named one addressable lines, and the page marks the words
// that map to something in <a class="ref" href="#target">, where the target
// is a line (#nao-loop-L7), a range (#nao-loop-L3-L4), a whole block or a
// figure (#fig-dispatch). Without this script that anchor still jumps and
// :target lights the line. With it:
//
//   - every block grows a copy key (kit .k-btn) that copies the code and
//     never the numbers,
//     since the numbers are drawn from data-n and are not text;
//   - a ref lights its target while the pointer is over it, while it holds
//     focus, and after a tap until the next tap or Esc (a phone has no
//     hover, a keyboard has no pointer);
//   - the other way round, a lit-able line or figure under the pointer
//     lights every ref that names it, so the reader can start from either
//     end.
//
// One class, `is-lit`, on whichever end is lit; entry.css draws it: the
// tint on a line or a block, the ink ring on a figure, the inked words on a
// ref. Nothing here reads a colour or a size. Served for every case study
// through canvas-sheets.js entryJsModules(); mountEmbed re-injects it on
// each open, and the previous mount's listeners are let go through
// window.__csRefs, the way case-study.js does with its flow.
import { parseRef, targetIds } from '/js/line-ref.js'

const $$ = (s, r = document) => [...r.querySelectorAll(s)]

function copyKeys(prose) {
  for (const block of $$('.code', prose)) {
    if (block.querySelector('.code-copy')) continue
    const code = block.querySelector('code')
    if (!code) continue
    const key = document.createElement('button')
    key.type = 'button'
    key.className = 'k-btn code-copy'
    key.textContent = 'copy'
    key.setAttribute('aria-label', 'copy this code')
    let timer = 0
    key.addEventListener('click', async () => {
      // textContent of the lines: the gutter is ::before, so it is not in it
      const text = $$('.ln', code)
        .map((l) => l.textContent.replace(/\n$/, ''))
        .join('\n')
      try {
        await navigator.clipboard.writeText(text || code.textContent)
        key.textContent = 'copied'
      } catch {
        key.textContent = 'select it'
      }
      clearTimeout(timer)
      timer = setTimeout(() => {
        key.textContent = 'copy'
      }, 1500)
    })
    block.append(key)
  }
}

function wireRefs(prose) {
  const refs = $$('a.ref[href^="#"]', prose)
  if (!refs.length) return () => {}
  // ref -> the elements it lights; element -> the refs that name it
  const lightsOf = new Map()
  const namedBy = new Map()
  for (const ref of refs) {
    const parsed = parseRef(ref.getAttribute('href'))
    const els = targetIds(parsed)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
    if (!els.length) continue
    lightsOf.set(ref, els)
    for (const el of els) {
      if (!namedBy.has(el)) namedBy.set(el, [])
      namedBy.get(el).push(ref)
    }
  }
  let pinned = null
  const lit = new Set()
  // the first element of what a ref lights, brought into view; the sheet
  // scrolls smoothly (entry.css), so nothing is measured after this
  const reveal = (els) => els[0] && els[0].scrollIntoView({ block: 'center' })
  const clear = () => {
    for (const el of lit) el.classList.remove('is-lit')
    lit.clear()
  }
  const light = (els) => {
    for (const el of els) {
      el.classList.add('is-lit')
      lit.add(el)
    }
  }
  // what is lit right now: the pinned ref, or whatever is under the pointer
  const show = (ref) => {
    clear()
    if (!ref) return
    light([ref, ...(lightsOf.get(ref) || [])])
  }
  const showTarget = (el) => {
    clear()
    const named = namedBy.get(el)
    if (!named) return
    light([el, ...named])
  }
  const off = []
  const on = (el, ev, fn) => {
    el.addEventListener(ev, fn)
    off.push(() => el.removeEventListener(ev, fn))
  }
  for (const ref of lightsOf.keys()) {
    on(ref, 'pointerenter', () => show(ref))
    on(ref, 'pointerleave', () => show(pinned))
    on(ref, 'focus', () => show(ref))
    on(ref, 'blur', () => show(pinned))
    on(ref, 'click', (e) => {
      // a tap pins; the second tap on the same ref lets go. The scroll to
      // the target is done here rather than left to the href: the canvas
      // owns the address (app.js writes it with replaceState and keeps the
      // hash), so the ref is written the same way instead of navigated to.
      e.preventDefault()
      pinned = pinned === ref ? null : ref
      show(pinned)
      if (!pinned) return
      reveal(lightsOf.get(ref))
      try {
        history.replaceState(
          history.state,
          '',
          location.pathname + location.search + ref.getAttribute('href')
        )
      } catch {
        // a throttled history keeps the old address
      }
    })
  }
  for (const el of namedBy.keys()) {
    on(el, 'pointerenter', () => showTarget(el))
    on(el, 'pointerleave', () => show(pinned))
  }
  // Esc closes one layer per press, innermost first: a pinned ref is a
  // layer under the page, so while one is pinned Esc lets go of it and goes
  // no further (captured on the window, ahead of the canvas's own Esc that
  // would close the page).
  const esc = (e) => {
    if (e.key !== 'Escape' || !pinned) return
    e.stopPropagation()
    e.preventDefault()
    pinned = null
    show(null)
  }
  window.addEventListener('keydown', esc, true)
  off.push(() => window.removeEventListener('keydown', esc, true))
  // A page opened AT a target (a shared link to a line, or a figure) lights
  // it and the words that name it, and brings it into view once the canvas
  // has finished placing the sheet: the browser's own jump to the fragment
  // happens before that and is scrolled away.
  const fromHash = () => {
    const els = targetIds(parseRef(location.hash))
      .map((id) => document.getElementById(id))
      .filter(Boolean)
    if (!els.length) return
    const named = els.flatMap((el) => namedBy.get(el) || [])
    pinned = named[0] || null
    clear()
    light([...els, ...named])
    reveal(els)
  }
  window.addEventListener('hashchange', fromHash)
  off.push(() => window.removeEventListener('hashchange', fromHash))
  requestAnimationFrame(() => requestAnimationFrame(fromHash))
  return () => off.forEach((f) => f())
}

;(() => {
  if (typeof window.__csRefs === 'function') window.__csRefs()
  const prose = document.querySelector('#sheetInner .prose')
  if (!prose) return
  copyKeys(prose)
  window.__csRefs = wireRefs(prose)
})()
