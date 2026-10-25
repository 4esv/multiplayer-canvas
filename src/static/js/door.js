// The doors' titles are the canvas's pixel face, and the canvas's dust runs
// on them: a cursor (or a finger) crossing the 404, the 500 or the key
// disturbs the cells under its path exactly as it disturbs the statement on
// the home screen. The dust is the canvas's own module (canvas/dust.js); a
// door hands it the clock and the visitor's choice about motion.
import { createDust } from 'multiplayer-canvas/dust'
import { CELL, mountAbyss } from '/canvas/abyss.js'

const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const dust = createDust({ enabled: () => !reduced.matches })

const titles = [...document.querySelectorAll('.ptitle')]
for (const h of titles) dust.title(h)

// dust.under bails on a point outside a glyph's own box (and its reach), so
// every title is asked and the one the pointer is over answers
if (titles.length)
  addEventListener(
    'pointermove',
    (e) => {
      for (const h of titles) dust.under(h, e.clientX, e.clientY)
    },
    { passive: true }
  )

// The 404 is thin ground (canvas/abyss.js): a pointer carves the page away
// and under it is black. The page's side of that is what the module reads off
// it: the canvas that fills the page, the pixel (CELL cells of --cv-px, which
// is what a door's title is set at), the two inks, and the plate the words
// stand on, which is kept. A forced palette cannot reach a canvas of two inks
// of its own, so under one the page is left whole.
const field = document.querySelector('.cv-abyss')
const plate = document.querySelector('.cv-plate')
if (field && plate && !matchMedia('(forced-colors: active)').matches) {
  const root = getComputedStyle(document.documentElement)
  const token = (name) => root.getPropertyValue(name).trim()
  // a box on the page, from the canvas's corner, which is where the lattice starts
  const from = (el) => {
    const c = field.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    return [r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top]
  }
  const abyss = mountAbyss(field, {
    pointer: document.documentElement,
    size: () => {
      const b = field.getBoundingClientRect()
      return { w: b.width, h: b.height, dpr: window.devicePixelRatio || 1 }
    },
    keep: () => [from(plate)],
    cell: CELL * (parseFloat(token('--cv-px')) || 4),
    ink: token('--cv-ink'),
    ground: token('--cv-ground'),
    reduced: () => reduced.matches,
  })
  // the page's size changes with the window, and the plate's with its fonts
  const watch = new ResizeObserver(() => abyss.fit())
  watch.observe(field)
  watch.observe(plate)
}
