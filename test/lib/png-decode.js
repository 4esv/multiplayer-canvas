// test/lib/png-decode.js
// Minimal PNG decoder, the read side of scripts/icon/png.mjs. It exists so a
// guard can assert things about the SHIPPED PIXELS rather than about the
// filename or the code that was supposed to write them: a manifest entry
// claiming `monochrome` is a claim about an alpha channel, and the only way
// to check it is to decode one.
//
// Scope is the same as the encoder's: 8-bit, non-interlaced, greyscale/RGB/
// greyscale+alpha/RGBA. Anything else throws by name, because a guard that
// silently skips an image it cannot read is worse than no guard.

import { inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

/**
 * @param {Buffer} buf - a whole PNG file
 * @returns {{width: number, height: number, rgba: Buffer}} rgba is
 *   width*height*4, row-major, top-down, alpha last.
 */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')

  let offset = 8
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  const idat = []

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      colorType = data[9]
      if (data[12] !== 0) throw new Error('interlaced PNG not supported')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }

  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`)
  const channels = CHANNELS[colorType]
  if (!channels) throw new Error(`unsupported color type ${colorType}`)

  // Undo the per-scanline filters. Every predictor works on the byte at the
  // same position in the previous pixel (a) and the previous row (b, c).
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const flat = Buffer.alloc(height * stride)
  let read = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[read++]
    const line = raw.subarray(read, read + stride)
    read += stride
    const cur = flat.subarray(y * stride, (y + 1) * stride)
    const prior = y ? flat.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prior ? prior[i] : 0
      const c = prior && i >= channels ? prior[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) {
        throw new Error(`unknown filter ${filter} on row ${y}`)
      }
      cur[i] = v & 0xff
    }
  }

  // Widen every color type to RGBA so callers have one shape to reason about.
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const d = i * 4
    if (channels >= 3) {
      rgba[d] = flat[s]
      rgba[d + 1] = flat[s + 1]
      rgba[d + 2] = flat[s + 2]
      rgba[d + 3] = channels === 4 ? flat[s + 3] : 0xff
    } else {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = flat[s]
      rgba[d + 3] = channels === 2 ? flat[s + 1] : 0xff
    }
  }

  return { width, height, rgba }
}

/**
 * What the image actually draws, measured against its own ground.
 *
 * "Ink" is every pixel that differs from the pixel at (0, 0). That one rule
 * reads both families the icon set ships: on a raster backed by the ground, the ground
 * is the ground-grey chip, on the monochrome it is transparency, and in both cases
 * ink is the mark. Radius is measured from pixel centres to the frame centre,
 * which is the number a circular crop cares about.
 *
 * @param {{width: number, height: number, rgba: Buffer}} img
 */
export function measureInk(img) {
  const { width, height, rgba } = img
  const ground = rgba.subarray(0, 4)
  const cx = width / 2
  const cy = height / 2

  let inkCount = 0
  let clear = 0
  let partial = 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxRadius = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const alpha = rgba[i + 3]
      if (alpha === 0) clear++
      else if (alpha !== 0xff) partial++
      if (rgba.compare(ground, 0, 4, i, i + 4) === 0) continue
      inkCount++
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      // the pixel's far corner, so a mark that ends AT the boundary is
      // measured as touching it rather than as one pixel short
      const dx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx))
      const dy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy))
      const r = Math.hypot(dx, dy)
      if (r > maxRadius) maxRadius = r
    }
  }

  const total = width * height
  return {
    ground: [...ground],
    inkCount,
    inkPct: (100 * inkCount) / total,
    clearPct: (100 * clear) / total,
    partialAlphaCount: partial,
    // null when nothing is drawn at all, so callers can say so instead of
    // reporting an empty icon as a very well framed one
    bbox: inkCount ? { minX, minY, maxX, maxY } : null,
    maxRadius,
    // the fraction of the half-frame the ink reaches: 1.0 touches the edge
    radiusFrac: maxRadius / (Math.min(width, height) / 2),
  }
}

/**
 * Ink pixels that a centred circular crop of `diameter / size` would remove.
 * The platform picks the mask shape for a maskable icon, and the smallest
 * region every shape is guaranteed to keep is the central 80% circle, so this
 * counts what a maskable would lose in the worst honest case.
 */
export function inkOutsideCircle(img, diameterFrac = 0.8) {
  const { width, height, rgba } = img
  const ground = rgba.subarray(0, 4)
  const cx = width / 2
  const cy = height / 2
  const radius = (diameterFrac * Math.min(width, height)) / 2
  let lost = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (rgba.compare(ground, 0, 4, i, i + 4) === 0) continue
      // a pixel survives only if it lies wholly inside the circle
      const dx = Math.max(Math.abs(x - cx), Math.abs(x + 1 - cx))
      const dy = Math.max(Math.abs(y - cy), Math.abs(y + 1 - cy))
      if (Math.hypot(dx, dy) > radius) lost++
    }
  }
  return lost
}
