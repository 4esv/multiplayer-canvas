// A raster onto the cell: clear px added round it until both sides are whole
// cells, the picture centred (an odd px goes right, or down).
//
//   node scripts/img/on-cell.mjs <png> [--cell N]
//
// For a picture with no source left to bake it from, only itself: Maurice
// (img/canvas/maurice.png) was his photograph cut to its bounds, and the
// photograph is not in the tree. Nothing inside the picture moves or is
// resampled, so a picture already on the cell comes out byte for byte the
// same, and running this twice is running it once. --cell is the cell in
// the picture's own px (default 4, the site's cell at one px a px; Maurice
// is drawn at two CSS px a px, which puts 16 px on the 4px cell as well).
import { readFileSync, writeFileSync } from 'node:fs'

import { decodePng, encodePng } from '../icon/png.mjs'

/** The picture padded to whole cells: { width, height, rgba }. */
function onCell({ width, height, rgba }, cell = 4) {
  const w = Math.ceil(width / cell) * cell
  const h = Math.ceil(height / cell) * cell
  const left = Math.floor((w - width) / 2)
  const top = Math.floor((h - height) / 2)
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < height; y++)
    rgba.copy(out, ((y + top) * w + left) * 4, y * width * 4, (y + 1) * width * 4)
  return { width: w, height: h, rgba: out }
}

const file = process.argv[2]
if (file && !file.startsWith('--')) {
  const at = process.argv.indexOf('--cell')
  const cell = at > -1 ? Number(process.argv[at + 1]) : 4
  const png = decodePng(readFileSync(file))
  const out = onCell(png, cell)
  if (out.width === png.width && out.height === png.height) {
    console.log(`${file}: ${png.width}x${png.height}, already on the cell`)
  } else {
    writeFileSync(file, encodePng(out.width, out.height, out.rgba))
    console.log(`${file}: ${png.width}x${png.height} -> ${out.width}x${out.height}`)
  }
}
