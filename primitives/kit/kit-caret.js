// multiplayer-canvas/kit/caret: a block caret that stands at the insertion point of a .k-field
//   input.
// Inputs: wireCarets() over the document; caretX and caretMode are the pure arithmetic.
// Outputs: positioned .k-caret elements. Style: kit.css.
//
// The field's caret (kit.css `.k-field .k-caret`) stands at the insertion
// point, the way every caret since the teletype has. It used to be a flex
// sibling after a flex:1 input, so it sat at the far end of the rule
// whatever the text and wherever the insertion point was: a picture of a
// caret, not a caret.
//
// Two halves in one file, the way js/kit-scroll.js keeps them: the
// arithmetic is pure (node imports this file and the tests hold it), the
// WIRING is DOM only and runs once, from the entries that load it (kit.js
// for the doors and the desk; canvas/app.js for the bar).
//
// The block is the caret at the END of the words, where the next letter
// lands. Inside the words it narrows to one cell, a bar between two
// letters, because a block there stands on a letter and hides it: the
// insert/overtype split every editor keeps. While a range is selected the
// block steps aside and the selection is the mark. Without this script the
// field keeps the platform's own caret in ink (kit.css): a working caret
// before a drawn one.

/**
 * Where the caret stands in the field, in layout px from the field's left
 * edge: the words before the insertion point, less what the input has
 * scrolled, held inside the input's box with the caret's own width.
 */
// seam: test/kit-caret.test.js
export function caretX({ inputLeft, inputWidth, textWidth, scrollLeft, caretWidth = 0 }) {
  const x = textWidth - scrollLeft
  return inputLeft + Math.max(0, Math.min(inputWidth - caretWidth, x))
}

/** What the caret draws: 'block' after the words, 'bar' inside them, 'none' over a range. */
// seam: test/kit-caret.test.js
export function caretMode({ start, end, length }) {
  if (start == null || end == null) return 'none'
  if (start !== end) return 'none'
  return end >= length ? 'block' : 'bar'
}

// the input types whose insertion point the platform reports (an email or
// number field's selectionStart is null) and whose words are the value
// as typed (a password's are dots in the platform's own face)
const TRACKED = new Set(['text', 'search', 'url', 'tel', ''])

const fieldOf = (el) => {
  if (el?.tagName !== 'INPUT' || !TRACKED.has(el.type)) return null
  const field = el.closest('.k-field')
  return field && field.querySelector(':scope > .k-caret') ? field : null
}

let ruler = null
const measure = (input, text) => {
  if (!ruler) {
    ruler = document.createElement('span')
    ruler.setAttribute('aria-hidden', 'true')
    ruler.style.cssText =
      'position:fixed;left:-9999px;top:0;visibility:hidden;white-space:pre;pointer-events:none'
    document.body.append(ruler)
  }
  const cs = getComputedStyle(input)
  ruler.style.font = cs.font
  ruler.style.letterSpacing = cs.letterSpacing
  ruler.style.textTransform = cs.textTransform
  ruler.textContent = text
  return ruler.getBoundingClientRect().width
}

const place = (input) => {
  const field = fieldOf(input)
  if (!field) return
  const caret = field.querySelector(':scope > .k-caret')
  field.classList.add('k-tracked')
  const mode = caretMode({
    start: input.selectionStart,
    end: input.selectionEnd,
    length: input.value.length,
  })
  field.dataset.caret = mode
  if (mode === 'none') return
  const x = caretX({
    inputLeft: input.offsetLeft,
    inputWidth: input.clientWidth,
    textWidth: measure(input, input.value.slice(0, input.selectionEnd)),
    scrollLeft: input.scrollLeft,
    caretWidth: caret.offsetWidth,
  })
  if (caret.style.getPropertyValue('--k-caret-x') !== `${x}px`) {
    caret.style.setProperty('--k-caret-x', `${x}px`)
    // a caret that moved is lit: the blink starts over from on
    for (const a of caret.getAnimations()) a.currentTime = 0
  }
}

let queued = null
const soon = (input) => {
  if (queued) return
  queued = input
  requestAnimationFrame(() => {
    const el = queued
    queued = null
    if (el === document.activeElement) place(el)
  })
}

/** Wire every field on the page, now and later: one set of listeners on the document. */
export function wireCarets() {
  // two bundles can carry this file onto one page (kit.js and canvas/app.js
  // are separate entries), so the mark is on the document, not the module
  const root = document.documentElement
  if (root.dataset.carets) return
  root.dataset.carets = 'on'
  const onActive = () => {
    const el = document.activeElement
    if (fieldOf(el)) soon(el)
  }
  document.addEventListener('focusin', (e) => fieldOf(e.target) && soon(e.target))
  document.addEventListener('selectionchange', onActive)
  for (const type of ['input', 'keydown', 'keyup', 'pointerup', 'select'])
    document.addEventListener(type, onActive, true)
  // an input scrolls its own words when they outrun it
  document.addEventListener('scroll', (e) => fieldOf(e.target) && soon(e.target), true)
  addEventListener('resize', onActive)
  // a fallback face is a different width: measure again once the real one is in
  document.fonts?.ready.then(onActive)
}
