// Generates the site's material-transition primitive: 8x8 Bayer ordered-
// dither frames as SVG, black unit squares on transparent.
//
//   node scripts/icon/dither.mjs
//
// Emits into src/static/img/:
//   dither-0.svg .. dither-5.svg   one tile-able 8x8 frame each, coverage
//                                  0/20/40/60/80/100% (frame k draws the
//                                  cells whose Bayer threshold < k/5); the
//                                  frames a steps() mask-image animation
//                                  swaps through for a stepped dither-in
//   dither-strip.svg               the 6 frames side by side (48x8), the
//                                  reference sheet for docs and previews
//
// The frames are consumed as CSS alpha masks (mask-image + mask-repeat),
// so the fill is arbitrary: #000 is opacity, not palette (the palette guard
// scans css/njk/js, not svg assets). Same unit-square path idiom as
// src/lib/pixel-icon.js pixelsToPath, 8-grid instead of 11.

import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { bayer } from 'multiplayer-canvas/dither'

const N = 8
const OUT = resolve('src/static/img')

// The 8x8 Bayer order, grown from the site's one 4x4 (js/textmode-settings.js).
// Values 0..63, each row and column a maximally spread threshold order,
// which is what makes every coverage level tile seamlessly.
const B = bayer(N)

// Frame k: cells whose normalized threshold (B/64) < k/5, as one path of
// unit squares (pixelsToPath idiom), offset dx units right in the strip.
function framePath(k, dx = 0) {
  const parts = []
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (B[y][x] / (N * N) < k / 5) parts.push(`M${x + dx} ${y}h1v1h-1z`)
    }
  return parts.join('')
}

const NOTE =
  '<!-- alpha MASK material, not palette: consumers read coverage only, the fill never renders as a color -->'

function frameSvg(k) {
  const d = framePath(k)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">` +
    `${NOTE}${d ? `<path fill="#000" d="${d}"/>` : ''}</svg>\n`
  )
}

function stripSvg() {
  const frames = []
  for (let k = 0; k <= 5; k++) {
    const d = framePath(k, k * N)
    if (d) frames.push(`<path fill="#000" d="${d}"/>`)
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${6 * N} ${N}" shape-rendering="crispEdges">` +
    `${NOTE}${frames.join('')}</svg>\n`
  )
}

async function main() {
  await mkdir(OUT, { recursive: true })
  for (let k = 0; k <= 5; k++) {
    const rel = `dither-${k}.svg`
    const body = frameSvg(k)
    await writeFile(join(OUT, rel), body)
    const cells = (body.match(/h1v1h-1z/g) || []).length
    console.log(`wrote img/${rel} (${cells}/64 cells, ${body.length} bytes)`)
  }
  await writeFile(join(OUT, 'dither-strip.svg'), stripSvg())
  console.log('wrote img/dither-strip.svg')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
