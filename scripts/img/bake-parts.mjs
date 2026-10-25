// The kit's parts, baked through textmode.
//
//   node scripts/img/bake-parts.mjs [baseUrl]
//
// Every picture kit.css wears comes from here, not from a drawing: each part
// in src/lib/kit-parts.js is a shading function, sampled to cells in node,
// then dithered by textmode.js in a browser through PRESETS.parts, the draw
// path the desk uses (js/textmode-draw.js). The site has one
// ditherer and this is it (scripts/img/textmode-bake.mjs, shared with every
// other picture the site owns); nothing here thresholds a pixel.
//
// A part is dithered one BAND of its ramp at a time: every cell whose grey
// falls between two neighbouring ramp greys is drawn as a Bayer glyph of the
// lighter over the darker, its level the cell's place in the band. All the
// parts sit on one sheet, so a ramp of six greys is five passes for the lot,
// and brick three more. The frame is read back, the band's cells are cut out
// of it, and each part is cropped to its own PNG under src/static/img/kit/,
// one px per dot, one cell per 4px, shown 1:1. Canvas PNGs carry no
// metadata, so there is nothing to strip.
//
// Deterministic: no clock, no randomness, so a rebake is byte-identical.
// Runs against a served tree (npm run dev); WebGL headless needs swiftshader.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PARTS, RAMPS, cellsOf } from '../../src/lib/kit-parts.js'
import { encodePng } from '../icon/png.mjs'
import { CELL, bandsOf, browser, dither } from './textmode-bake.mjs'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9285)
const OUT = join(import.meta.dirname, '../../src/static/img/kit')

// ---- the sheet: every state of every part, side by side, as cells ----
const slots = []
let at = 0
let rows = 0
for (const p of PARTS)
  for (const state of p.states) {
    const c = cellsOf(p, state)
    slots.push({ file: `${p.name}-${state}`, x: at, ...c })
    at += c.cols + 1
    rows = Math.max(rows, c.rows)
  }
const sheet = { cols: at, rows }

// each cell's place on its ramp: a part's grey, 0 dark to 1 light, walks
// the ramp's tokens evenly
const cells = []
for (const s of slots)
  s.cells.forEach((cell, i) => {
    if (!cell) return
    const n = RAMPS[cell.ramp].length
    cells.push([s.x + (i % s.cols), Math.floor(i / s.cols), cell.ramp, cell.v * (n - 1)])
  })

let b = null
try {
  b = await browser(PORT)
  // any page of the origin will do: the bake imports the modules itself
  await b.send('Page.navigate', { url: `${BASE}/robots.txt` })
  await new Promise((r) => setTimeout(r, 500))
  const whole = await dither(b.evaluate, { ...sheet, bands: bandsOf(cells) })
  mkdirSync(OUT, { recursive: true })
  for (const s of slots) {
    const w = s.cols * CELL
    const h = s.rows * CELL
    const rgba = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++)
      whole.rgba.copy(
        rgba,
        y * w * 4,
        (y * whole.width + s.x * CELL) * 4,
        (y * whole.width + s.x * CELL + w) * 4
      )
    const file = join(OUT, `${s.file}.png`)
    writeFileSync(file, encodePng(w, h, rgba))
    console.log(`wrote ${file} (${w}x${h})`)
  }
} catch (err) {
  console.error('bake-parts could not run:', err.message)
  process.exitCode = 2
} finally {
  b?.close()
}
