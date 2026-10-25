// The photographs, dithered.
//
//   node scripts/img/bake-photos.mjs [baseUrl]
//
// Every picture the site owns is drawn through the one ditherer
// (scripts/img/textmode-bake.mjs): cells of the grey ramp, each a Bayer
// glyph of the lighter token over the darker, one px a dot, on the 4px cell.
// A photograph keeps its colour: each dot takes its cell's own hue and
// chroma at the lightness the dither gave it (atLightness), so the dots and
// the crop are the ditherer's and only the continuous tone is given up
// (the dither and the crop, not monochrome). A photograph is not an
// exception to the material, it is what the material was made to carry.
//
// PHOTOS below is the whole manual. Each picture names its original as a
// git blob (the file as it was first committed, so the original stays in
// history and nowhere else), the width the page shows it at, in px, and how
// far its midtones are lifted:
//
//   - the source is cut into square cells across that width, and its height
//     cut down to whole cells, centred: cropped to the cell, never stretched
//   - each cell is the mean of the px under it, weighted by their alpha (a
//     box, like pixelate.mjs's); a cell under half covered is clear, so a
//     cut-out keeps its outline, a cell at a time
//   - levels: the picture's own darkest and lightest cells meet the ramp's
//     ends (the first and the 99th percentile, so a lone glint or a speck of
//     black does not set the scale), and the rest fall between them by
//     lightness (CIE L*), so a mid grey lands between the mid greys rather
//     than wherever its bytes fall
//   - lift: a power on that, below 1 for a picture shot dark. Set by eye at
//     the page's size, the way a print is: a white thing dithered until it
//     reads as grey is a different thing
//
// The width is the one the page draws the picture at, so it is shown 1:1:
// a dithered picture resampled is a grey smear. 304 is a narrow figure's
// width (--cs-figure, and 1:1 on a 390px phone); the others keep the size
// the page already gave them. Change a width, rebake, and give the markup's
// width and height the numbers this prints.
//
// The browser only decodes the original (node has no WebP or JPEG decoder);
// everything after that is here or in the ditherer, and the PNG is the
// in-house encoder's, so it carries no metadata and a lossy codec never
// smears the dots into greys the ramp does not have. Runs against a served
// tree (npm run dev); WebGL headless needs swiftshader.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { encodePng } from '../icon/png.mjs'
import {
  CELL,
  atLightness,
  bandsOf,
  browser,
  dither,
  greyLightness,
  lab,
  lightness,
  rampPlace,
} from './textmode-bake.mjs'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PORT = Number(process.env.CDP_PORT || 9286)
const ROOT = join(import.meta.dirname, '../..')
const OUT = join(ROOT, 'src/static/img')

// seam: test/pictures.test.js
// One row a picture, e.g.
//   { file: 'my-photo.png', blob: '<git blob sha of the original>', width: 304, lift: 0.8 }
export const PHOTOS = []

const mimeOf = (buf) =>
  buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    ? 'image/jpeg'
    : buf.toString('ascii', 8, 12) === 'WEBP'
      ? 'image/webp'
      : 'image/png'

/**
 * The picture as cells: `width` px across, whole cells down, centred.
 * Each cell is [x, y, cover, lightness, colour].
 */
function cellsOf({ width: sw, height: sh, rgba }, width) {
  const cols = width / CELL
  const k = sw / cols // source px a cell, square
  const rows = Math.floor(sh / k)
  const top = (sh - rows * k) / 2
  const cells = []
  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor(top + cy * k)
    const y1 = Math.max(y0 + 1, Math.floor(top + (cy + 1) * k))
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor(cx * k)
      const x1 = Math.max(x0 + 1, Math.floor((cx + 1) * k))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * sw + x) * 4
          const al = rgba[i + 3] / 255
          r += rgba[i] * al
          g += rgba[i + 1] * al
          b += rgba[i + 2] * al
          a += al
        }
      const n = (y1 - y0) * (x1 - x0)
      const rgb = a ? [r / a, g / a, b / a] : [0, 0, 0]
      cells.push([cx, cy, a / n, a ? lightness(rgb) : 0, rgb])
    }
  }
  return { cols, rows, cells }
}

/** The lit cells, placed on the grey ramp: [x, y, 'grey', place]. */
function levels(cells, lift = 1, ls = greyLightness()) {
  const lit = cells.filter(([, , cover]) => cover >= 0.5)
  const sorted = lit.map((c) => c[3]).sort((p, q) => p - q)
  const lo = sorted[Math.floor(0.01 * (sorted.length - 1))]
  const hi = sorted[Math.ceil(0.99 * (sorted.length - 1))]
  const [dark, light] = [ls[0], ls[ls.length - 1]]
  const t = (l) => Math.min(1, Math.max(0, hi > lo ? (l - lo) / (hi - lo) : 0.5)) ** lift
  return lit.map(([x, y, , l]) => [x, y, 'grey', rampPlace(dark + t(l) * (light - dark), ls)])
}

/**
 * The dithered greys given back their colour: a dot keeps its lightness
 * (the ramp grey the dither chose) and takes its cell's hue and chroma.
 */
function inColour({ width, height, rgba }, grid) {
  const hue = new Map(grid.cells.map(([x, y, , , rgb]) => [`${x},${y}`, lab(rgb).slice(1)]))
  const memo = new Map()
  const out = Buffer.from(rgba)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (!out[i + 3]) continue
      const cell = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`
      const key = `${cell}:${out[i]},${out[i + 1]},${out[i + 2]}`
      if (!memo.has(key))
        memo.set(key, atLightness(lightness([out[i], out[i + 1], out[i + 2]]), hue.get(cell)))
      ;[out[i], out[i + 1], out[i + 2]] = memo.get(key)
    }
  return out
}

async function main() {
  let b = null
  try {
    b = await browser(PORT)
    for (const p of PHOTOS) {
      const src = execFileSync('git', ['cat-file', 'blob', p.blob], {
        cwd: ROOT,
        maxBuffer: 1 << 26,
      })
      // the original's px, decoded as they are, on a page with no policy to
      // refuse a data URL
      await b.send('Page.navigate', { url: 'about:blank' })
      const decoded = await b.evaluate(`(async () => {
        const blob = await (await fetch('data:${mimeOf(src)};base64,${src.toString('base64')}')).blob()
        const bm = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
        const c = document.createElement('canvas')
        c.width = bm.width
        c.height = bm.height
        const g = c.getContext('2d')
        g.drawImage(bm, 0, 0)
        const d = g.getImageData(0, 0, c.width, c.height).data
        let s = ''
        for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000))
        return { width: c.width, height: c.height, rgba: btoa(s) }
      })()`)
      const grid = cellsOf({ ...decoded, rgba: Buffer.from(decoded.rgba, 'base64') }, p.width)
      const cells = levels(grid.cells, p.lift)
      // the dots, on a page of the origin (the ditherer imports its modules)
      await b.send('Page.navigate', { url: `${BASE}/robots.txt` })
      await new Promise((r) => setTimeout(r, 500))
      const pic = await dither(b.evaluate, {
        cols: grid.cols,
        rows: grid.rows,
        bands: bandsOf(cells),
      })
      const png = encodePng(pic.width, pic.height, inColour(pic, grid))
      writeFileSync(join(OUT, p.file), png)
      console.log(
        `wrote img/${p.file} (${pic.width}x${pic.height}, ${cells.length} of ${grid.cols * grid.rows} cells lit, ${png.length} bytes)`
      )
    }
  } catch (err) {
    console.error('bake-photos could not run:', err.message)
    process.exitCode = 2
  } finally {
    b?.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
