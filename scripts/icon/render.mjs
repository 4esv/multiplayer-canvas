// Rasterises an 11x11 pixel grid into an RGBA frame. Integer scale only,
// centered: pixel art stays crisp and honest at every favicon size; the
// SVG variants cover fractional rendering in modern browsers.

import { GRID } from '../../src/lib/pixel-icon.js'

// the native pair, mirrored from canvas-tokens.css (--cv-ink / --cv-ground):
// blue-black on the ground. Rasters BAKE the ground in (see wire.mjs): an icon
// that carries its own ground is legible on any launcher, light or dark.
const INK = [0x22, 0x25, 0x2c, 0xff]
export const GROUND = [0xf3, 0xf4, 0xef, 0xff]

/**
 * @param {number[][]} pixels - 11x11 grid of 0/1
 * @param {object} opts
 * @param {number} opts.size - output frame edge in px
 * @param {number} opts.scale - device px per art px (size >= 11 * scale)
 * @param {number[]} [opts.ink] - RGBA for lit pixels
 * @param {number[]|null} [opts.bg] - RGBA fill, or null for transparent
 * @returns {Buffer} size*size*4 RGBA, top-down
 */
export function renderRgba(pixels, { size, scale, ink = INK, bg = null }) {
  const art = GRID * scale
  if (art > size) throw new Error(`scale ${scale} overflows ${size}px frame`)
  const offset = Math.floor((size - art) / 2)
  const rgba = Buffer.alloc(size * size * 4)

  if (bg) {
    for (let i = 0; i < size * size; i++) rgba.set(bg, i * 4)
  }

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!pixels[y][x]) continue
      for (let dy = 0; dy < scale; dy++) {
        const row = (offset + y * scale + dy) * size
        for (let dx = 0; dx < scale; dx++) {
          rgba.set(ink, (row + offset + x * scale + dx) * 4)
        }
      }
    }
  }

  return rgba
}

// The largest integer scale whose art (plus a margin on both sides) fits.
export function fitScale(size, margin = 0) {
  return Math.max(1, Math.floor((size - margin * 2) / GRID))
}
