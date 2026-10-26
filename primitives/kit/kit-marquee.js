// multiplayer-canvas/kit/marquee: a line longer than its box walks through it a cell at a time.
// Inputs: marqueeMarkup(text) for the HTML; wireMarquees(root) to measure.
// Outputs: markup strings and measured walks; marqueeRun is the pure arithmetic. Style: kit.css.
//
// The marquee: one line of type longer than its box walks through it (the
// drawing and the walk are kit.css `.k-marquee`; this is the measuring).
//
// Two halves in one file, the way primitives/kit/kit-scroll.js keeps them: the MARKUP
// and the arithmetic are pure (node imports this file and the tests hold
// them), the WIRING is DOM only and never runs at import.
//
// A line is measured, never guessed: the run's own width against the box's,
// in layout px (a camera's scale is a transform and does not enter into
// it). Once per TEXT, not once a frame: when the line is built, when its
// box first has a size (an off-camera tile is display:none and measures
// nothing until it is shown), and once the face has loaded, because a
// fallback face is a different width. Nothing measures while a line walks.

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

// The cell the walk steps on (layout.js PX, kit.css --cv-px).
const CELL = 4

/** One marquee line: `cls` for its host's hooks, `i` its turn in the cadence. */
export function marqueeMarkup(text, { cls = '', i = 0 } = {}) {
  return `<span class="k-marquee${cls ? ' ' + cls : ''}" style="--mq-i:${i}"><span class="k-mq">${esc(text)}</span></span>`
}

/** How far a line walks and in how many steps: whole cells, or null when it fits. */
// seam: test/music-windows.test.js
export function marqueeRun(runW, boxW, cell = CELL) {
  const over = runW - boxW
  if (!(boxW > 0) || !(over > 0.5)) return null
  const n = Math.ceil((over - 0.5) / cell)
  return { d: n * cell, n }
}

// ---- the wiring (DOM) -----------------------------------------------------
// the text and the box width each line was last measured at: a second
// sighting of the same line in the same box costs nothing
const seen = new WeakMap()
function measure(box) {
  const run = box.firstElementChild
  const w = box.clientWidth
  if (!run || !w) return // not shown: measured when it is
  const key = run.textContent + '|' + w
  if (seen.get(box) === key) return
  seen.set(box, key)
  const r = marqueeRun(run.offsetWidth, w)
  box.classList.toggle('is-over', !!r)
  if (r) {
    box.style.setProperty('--mq-d', `${r.d}px`)
    box.style.setProperty('--mq-n', String(r.n))
  } else {
    box.style.removeProperty('--mq-d')
    box.style.removeProperty('--mq-n')
  }
}
let ro = null
const all = new Set()
function observer() {
  if (ro || typeof ResizeObserver === 'undefined') return ro
  ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      // a rebuilt list leaves its old lines behind: let them go
      if (!e.target.isConnected) {
        ro.unobserve(e.target)
        all.delete(e.target)
      } else measure(e.target)
    }
  })
  // the face arriving late changes every width at once
  document.fonts?.ready?.then(() => {
    for (const box of all) {
      if (!box.isConnected) {
        all.delete(box)
        ro.unobserve(box)
        continue
      }
      seen.delete(box)
      measure(box)
    }
  })
  return ro
}

/** Measure every marquee under `root` now, and again whenever its box is shown. */
export function wireMarquees(root) {
  const o = observer()
  for (const box of root.querySelectorAll('.k-marquee')) {
    all.add(box)
    o?.observe(box)
    measure(box)
  }
}

/** A line whose text changed in place: set it and measure it again. */
export function setMarquee(box, text) {
  const run = box.firstElementChild
  if (!run || run.textContent === text) return
  // the new line keeps the cadence's phase: the list takes turns as before
  run.textContent = text
  measure(box)
}
