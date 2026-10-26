// A picture in, a sprite out.
//
//   node scripts/img/pixelate.mjs <png> --cells W --palette [accent]
//   node scripts/img/pixelate.mjs bass.png --cells 44 --palette brick --outline
//   node scripts/img/pixelate.mjs photo.png --cells 32 --palette --key --name UKE
//   node scripts/img/pixelate.mjs rhodes.png --cells 96 --palette --key --png out.png --scale 4
//   node scripts/img/pixelate.mjs uke.png --cells 96 --palette ochre --key 40 --flood --dither --png uke-px.png
//
// Quantises a photo or a silhouette to the cell and to the palette, and
// prints the rows in the text form a hand-set sprite is checked in as
// (SPLAT_ROWS in canvas/pixel-sprite.js): one string a row, one character
// a cell. With --png it writes the same cells out as an ordinary picture
// instead, which is what /web-instruments shows in an <img>.
//
//   .  nothing     k  ink     p  ground     b o m s  the one accent
//
// --cells W     how many cells wide the sprite is; the height follows the
//               picture's own proportions.
// --palette     ink, ground and ONE accent, which is the whole palette a
//               sprite gets (BIBLE.md sections 1 and 10). Name the accent
//               (brick, ochre, mute, sage) or leave it bare and the
//               one that costs the picture least is chosen and reported.
// --outline     ring the silhouette in ink, one cell, the way every sprite
//               here is closed. For a flat silhouette; a photo rarely wants it.
// --key [N]     the picture has no alpha: treat its top-left colour as the
//               background and drop it. N is how far a pixel may stray from
//               that colour and still count as background (default 24; a
//               photographed lawn or wall wants 60 or more).
// --flood       with --key: only the background that reaches the picture's
//               edge is dropped, filled in from the border. A white sweep
//               or a checkerboard someone baked into a "transparent" PNG
//               goes; the white of a drum head or a fret dot inside the
//               outline stays.
// --dither      order the cells between the two inks nearest each one on
//               the 4 x 4 Bayer matrix (primitives/textmode-settings.js, the one
//               source), so a photo's shading survives three inks as a
//               pattern of whole cells instead of a flat posterised field.
// --name NAME   print `export const NAME = [...]` instead of a bare array.
// --png FILE    write the cells as a PNG instead of printing rows. An empty
//               cell is transparent, so the picture sits on whatever ground
//               the page has.
// --scale N     px a cell in that PNG (default 4, the cell this site draws on).
// --trim        drop the empty border rows and columns first, so the picture
//               is the instrument and not the lawn it was photographed on.
//
// The colours are READ from canvas-tokens.css, never restated here, so a
// token that moves takes the quantiser with it. No image library: the PNG
// decoder is the page of code beside the encoder (scripts/icon/png.mjs).
//
// What comes out is a first draft. A box filter decides every cell by
// majority, and a majority is wrong exactly where a drawing is most itself
// (a horn tip, a tuner, a string), so the rows are meant to be corrected by
// hand afterwards. That is why they are text.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { bayerLit } from 'multiplayer-canvas/dither'
import { decodePng, encodePng } from '../icon/png.mjs'

const TOKENS = join(import.meta.dirname, '../../primitives/kit/canvas-tokens.css')

// accent letter = the token's initial; pixelSprite paints a cell in the class
// its letter names.
// seam: test/pixelate.test.js
export const ACCENTS = { brick: 'b', ochre: 'o', mute: 'm', sage: 's' }

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** The palette as canvas-tokens.css states it: { ink, ground, brick, ... } to [r, g, b]. */
// seam: test/pixelate.test.js
export function readPalette(css = readFileSync(TOKENS, 'utf8')) {
  const out = {}
  for (const name of ['ink', 'ground', ...Object.keys(ACCENTS)]) {
    const m = new RegExp(`--cv-${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css)
    if (!m) throw new Error(`canvas-tokens.css has no six-digit --cv-${name}`)
    out[name] = hexToRgb(m[1])
  }
  return out
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

// The pixels --key drops: within `key` of the top-left colour anywhere, or,
// flooded, only where such pixels join up with the picture's edge.
function keyMask({ width, height, rgba }, key, flood = false) {
  const bg = [rgba[0], rgba[1], rgba[2]]
  const tol = (typeof key === 'number' ? key : 24) ** 2
  const near = (p) => dist2([rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]], bg) < tol
  const mask = new Uint8Array(width * height)
  if (!flood) {
    for (let p = 0; p < mask.length; p++) mask[p] = near(p) ? 1 : 0
    return mask
  }
  const stack = []
  const seed = (p) => {
    if (!mask[p] && near(p)) {
      mask[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }
  while (stack.length) {
    const p = stack.pop()
    const x = p % width
    if (x > 0) seed(p - 1)
    if (x < width - 1) seed(p + 1)
    if (p >= width) seed(p - width)
    if (p < mask.length - width) seed(p + width)
  }
  return mask
}

// One cell = the alpha-weighted mean of the pixels under it, and how much of
// it the picture covers.
function boxDown({ width, height, rgba }, cols, mask) {
  const rows = Math.max(1, Math.round((height / width) * cols))
  const cells = []
  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor((cy * height) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * height) / rows))
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor((cx * width) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * width) / cols))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          // keyed: a pixel within a small step of the background is background
          const al = mask && mask[i / 4] ? 0 : rgba[i + 3] / 255
          r += rgba[i] * al
          g += rgba[i + 1] * al
          b += rgba[i + 2] * al
          a += al
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      cells.push({ cover: a / n, rgb: a ? [r / a, g / a, b / a] : [0, 0, 0] })
    }
  }
  return { cells, rows }
}

/**
 * @param {{ width: number, height: number, rgba: Buffer }} image
 * @param {{ cells: number, accent?: string, outline?: boolean, key?: boolean | number, flood?: boolean, dither?: boolean, palette?: object }} opts
 * @returns {{ rows: string[], accent: string }}
 */
// seam: test/pixelate.test.js
export function pixelate(
  image,
  {
    cells: cols,
    accent,
    outline = false,
    key = false,
    flood = false,
    dither = false,
    palette = readPalette(),
  }
) {
  if (!Number.isInteger(cols) || cols < 1) throw new Error('--cells wants a whole number of cells')
  if (accent && !ACCENTS[accent])
    throw new Error(`no accent called ${accent}: ${Object.keys(ACCENTS).join(', ')}`)
  const { cells, rows: nRows } = boxDown(image, cols, key ? keyMask(image, key, flood) : null)
  const lit = cells.map((c) => c.cover >= 0.5)

  // the accent, when it was not named: the one that leaves the lit cells
  // closest to SOME ink of the three (a cell already near ink or ground costs
  // every candidate the same, so only the coloured cells decide)
  const cost = (name) =>
    cells.reduce((sum, c, i) => {
      if (!lit[i]) return sum
      return (
        sum +
        Math.min(
          dist2(c.rgb, palette.ink),
          dist2(c.rgb, palette.ground),
          dist2(c.rgb, palette[name])
        )
      )
    }, 0)
  const chosen =
    accent || Object.keys(ACCENTS).reduce((best, name) => (cost(name) < cost(best) ? name : best))

  const inks = [
    ['k', palette.ink],
    ['p', palette.ground],
    [ACCENTS[chosen], palette[chosen]],
  ]
  // dithered: the cell's place on the line between its two nearest inks,
  // against that cell's Bayer threshold. Undithered: the nearest ink.
  const grid = cells.map((c, i) => {
    if (!lit[i]) return '.'
    const [a, b] = [...inks].sort((m, n) => dist2(c.rgb, m[1]) - dist2(c.rgb, n[1]))
    if (!dither) return a[0]
    const ab = [0, 1, 2].map((k) => b[1][k] - a[1][k])
    const len2 = dist2(b[1], a[1])
    const t = len2 ? ab.reduce((sum, d, k) => sum + d * (c.rgb[k] - a[1][k]), 0) / len2 : 0
    const x = i % cols
    const y = (i - x) / cols
    return bayerLit(t, x, y) ? b[0] : a[0]
  })

  if (outline) {
    const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= nRows ? '.' : grid[y * cols + x])
    const edge = grid.map((ch, i) => {
      if (ch === '.') return false
      const x = i % cols
      const y = (i - x) / cols
      return (
        at(x - 1, y) === '.' || at(x + 1, y) === '.' || at(x, y - 1) === '.' || at(x, y + 1) === '.'
      )
    })
    edge.forEach((on, i) => {
      if (on) grid[i] = 'k'
    })
  }

  const rows = []
  for (let y = 0; y < nRows; y++) rows.push(grid.slice(y * cols, (y + 1) * cols).join(''))
  return { rows, accent: chosen }
}

/** Drop the fully empty border rows and columns. */
// seam: test/pixelate.test.js
export function trimRows(rows) {
  let top = 0
  let bot = rows.length
  while (top < bot && /^\.*$/.test(rows[top])) top++
  while (bot > top && /^\.*$/.test(rows[bot - 1])) bot--
  const body = rows.slice(top, bot)
  if (!body.length) return rows
  const w = body[0].length
  let left = 0
  let right = w
  const colEmpty = (x) => body.every((r) => r[x] === '.')
  while (left < right && colEmpty(left)) left++
  while (right > left && colEmpty(right - 1)) right--
  return body.map((r) => r.slice(left, right))
}

/** The cells as a picture: one cell = `scale` px, an empty cell transparent. */
// seam: test/pixelate.test.js
export function rowsToPng(rows, { scale = 4, palette = readPalette(), accent }) {
  const cols = rows[0].length
  const w = cols * scale
  const h = rows.length * scale
  const rgba = Buffer.alloc(w * h * 4)
  const colourOf = { k: palette.ink, p: palette.ground, [ACCENTS[accent]]: palette[accent] }
  rows.forEach((row, cy) => {
    for (let cx = 0; cx < cols; cx++) {
      const rgb = colourOf[row[cx]]
      if (!rgb) continue
      for (let y = cy * scale; y < (cy + 1) * scale; y++) {
        for (let x = cx * scale; x < (cx + 1) * scale; x++) {
          const i = (y * w + x) * 4
          rgba[i] = rgb[0]
          rgba[i + 1] = rgb[1]
          rgba[i + 2] = rgb[2]
          rgba[i + 3] = 255
        }
      }
    }
  })
  return { png: encodePng(w, h, rgba), width: w, height: h }
}

/** The rows as they are checked in: a JS array literal, one string a row. */
// seam: test/pixelate.test.js
export function formatRows(rows, name) {
  const body = rows.map((r) => `  '${r}',`).join('\n')
  return name ? `export const ${name} = [\n${body}\n]` : `[\n${body}\n]`
}

function main(argv) {
  const opts = {
    file: null,
    cells: 0,
    accent: undefined,
    outline: false,
    key: false,
    name: '',
    png: '',
    scale: 4,
    trim: false,
    flood: false,
    dither: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--cells') opts.cells = Number(argv[++i])
    else if (a === '--png') opts.png = argv[++i]
    else if (a === '--scale') opts.scale = Number(argv[++i])
    else if (a === '--trim') opts.trim = true
    else if (a === '--flood') opts.flood = true
    else if (a === '--dither') opts.dither = true
    else if (a === '--palette') {
      // the palette is the only mode there is (a sprite has three inks), so
      // the bare flag is accepted and the command reads as what it does
      if (argv[i + 1] && !argv[i + 1].startsWith('--') && ACCENTS[argv[i + 1]])
        opts.accent = argv[++i]
    } else if (a === '--outline') opts.outline = true
    else if (a === '--key')
      opts.key =
        argv[i + 1] && !argv[i + 1].startsWith('--') && Number(argv[i + 1])
          ? Number(argv[++i])
          : true
    else if (a === '--name') opts.name = argv[++i]
    else if (!a.startsWith('--') && !opts.file) opts.file = a
    else throw new Error(`unknown argument ${a}`)
  }
  if (!opts.file || !opts.cells) {
    console.error(
      'usage: node scripts/img/pixelate.mjs <png> --cells W --palette [accent] [--outline] [--key [N] [--flood]] [--dither] [--trim] [--png FILE [--scale N]] [--name NAME]'
    )
    process.exit(2)
  }
  const out = pixelate(decodePng(readFileSync(opts.file)), opts)
  const accent = out.accent
  const rows = opts.trim ? trimRows(out.rows) : out.rows
  console.error(`${rows[0].length} x ${rows.length} cells, ink + ground + ${accent}`)
  if (opts.png) {
    const { png, width, height } = rowsToPng(rows, { scale: opts.scale, accent })
    writeFileSync(opts.png, png)
    console.error(`${opts.png}: ${width} x ${height} px at ${opts.scale} px a cell`)
    return
  }
  console.log(formatRows(rows, opts.name))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2))
