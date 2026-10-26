// canvas/case-study.js: the text flows round the figures where there is width
//
// A case study is ONE centred column (case-study.css, THE CASE-STUDY PAGE),
// and a narrow figure in it, a photo, a flow, a modal, is centred on its
// own line. On a desk that column is 864px wide and a narrow figure 304, so
// a figure on its own line leaves the width on either side of it empty. The
// old answer was a CSS float into a second track, and it looked broken. A float
// hangs beside WHATEVER comes next, a heading, a code block, one short
// paragraph, and a figure taller than the text beside it hangs on into the
// next thing with a hole beside it.
//
// So the decision is measured, not styled. For each narrow figure, the run
// of paragraphs that follows it is laid out by the vendored pretext
// (@chenglou/pretext, DOM-free: it segments the words, measures them once in
// a canvas and breaks the lines in arithmetic) at the width the text would
// have BESIDE the figure. The figure hangs (class `hung`, case-study.css
// floats it right of the column) only when
//   1. that width is at least MIN_BESIDE_CH of the prose (a line narrower
//      than that beside a picture reads as a caption, not the text), and
//   2. the run outlasts the figure: the paragraphs beside it reach past its
//      foot with SPARE_LINES more lines to come, so the figure never hangs
//      on into a heading or a code block and never sits with a hole beside
//      it (no orphaned figure, author).
// Otherwise the figure stays on its own line in the one column. A phone and
// a tablet never have the width, so they never hang one; a desk hangs the
// ones whose text can carry them. The measurement is what the browser is
// then held to: the hung figure takes exactly the width pretext was given,
// so the lines the browser breaks are the lines pretext counted. A run is
// PARAGRAPHS ONLY: a head, a list, a code block or the next figure ends it,
// and case-study.css clears every non-paragraph below any float besides.
//
// The font is READ from the paragraph, never retyped: pretext forwards the
// string to ctx.font, and a hand-copied stack measures one face while the
// page paints another (test/font-rule.test.js holds the same rule for
// app.js). Intl.Segmenter is guarded inside pretext by segmenter-shim.js,
// the local patch the hero's use of it left behind: on an engine without
// ICU segmentation data it degrades rather than throws.
//
// Served for every case study through canvas-sheets.js entryJsModules(),
// the SSR page and the /api embed alike, so a direct load and a page the
// canvas opens flow the same way, and no entry names it. mountEmbed
// re-injects it with a fresh ?v= on every open, so this runs once per
// mount; the previous mount's listeners are let go through window.__csFlow.
import { prepare, layout } from '/canvas/vendor/pretext/layout.js'

// the text beside a hung figure is at least this many ch of the prose: 480px
// at the 16px prose (DotGothic16's "0" is half an em)
const MIN_BESIDE_CH = 60
// and the run of text goes on at least this many lines past the figure's foot
const SPARE_LINES = 2

const $ = (s, r = document) => r.querySelector(s)
const px = (v) => parseFloat(v) || 0

// the run of paragraphs after a figure: the text it can hang beside
function runAfter(fig) {
  const run = []
  for (let el = fig.nextElementSibling; el && el.tagName === 'P'; el = el.nextElementSibling)
    run.push(el)
  return run
}

// the paragraph's own face, from its computed style: pretext measures in a
// canvas and takes a CSS font string
function fontOf(el) {
  const s = getComputedStyle(el)
  return {
    font: `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`,
    lh: px(s.lineHeight) || 1.5 * px(s.fontSize),
  }
}

// how tall the run stands at `width`, in px: every line pretext counts at
// the prose's line height, and the paragraphs' collapsed margins between
function runHeight(run, width, font, lh) {
  let h = 0
  run.forEach((p, i) => {
    h += layout(prepare(p.textContent, font), width, lh).height
    if (i) {
      const s = getComputedStyle(p),
        q = getComputedStyle(run[i - 1])
      h += Math.max(px(s.marginTop), px(q.marginBottom))
    }
  })
  return h
}

function flow(prose) {
  const figs = [...prose.querySelectorAll(':scope > .figure.fig-narrow')]
  figs.forEach((f) => f.classList.remove('hung'))
  if (!figs.length) return
  const ps = getComputedStyle(prose)
  const column = prose.clientWidth - px(ps.paddingLeft) - px(ps.paddingRight)
  if (!px(ps.getPropertyValue('--cs-figure'))) return // not the case-study page's column
  for (const fig of figs) {
    const run = runAfter(fig)
    if (!run.length) continue
    const { font, lh } = fontOf(run[0])
    const ch = px(getComputedStyle(run[0]).fontSize) * 0.5 // DotGothic16's "0" is half an em: the measure's ch
    // hang it to read its geometry from the stylesheet (its width, its gap
    // and its height at that width), then hold it to the text
    fig.classList.add('hung')
    const fs = getComputedStyle(fig)
    const beside = column - fig.offsetWidth - px(fs.marginLeft)
    const need = fig.offsetHeight + px(fs.marginTop) + px(fs.marginBottom)
    const have = beside < MIN_BESIDE_CH * ch ? 0 : runHeight(run, beside, font, lh)
    if (have < need + SPARE_LINES * lh) fig.classList.remove('hung')
  }
}

;(() => {
  if (typeof window.__csFlow === 'function') window.__csFlow()
  const prose = $('#sheetInner .prose')
  if (!prose) return
  let raf = 0
  const relayout = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => flow(prose))
  }
  window.addEventListener('resize', relayout)
  window.__csFlow = () => {
    window.removeEventListener('resize', relayout)
    cancelAnimationFrame(raf)
  }
  // the face has to be in before anything is measured in it
  ;(document.fonts ? document.fonts.ready : Promise.resolve()).then(relayout, relayout)
})()
