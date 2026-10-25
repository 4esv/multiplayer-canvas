// Minimal PNG encoder (and, at the foot, the decoder that reads a picture
// back): RGBA in, spec-compliant PNG out. Pixel-art icons
// need exactly one color type (8-bit RGBA, no filtering, no interlace), so
// the whole format fits in a page of code and the pipeline stays free of
// image dependencies.

import { deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba - width*height*4 bytes, row-major, top-down
 * @returns {Buffer} PNG file contents
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`rgba length ${rgba.length} != ${width}x${height}x4`)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  // compression 0, filter 0, interlace 0

  // Every scanline gets filter byte 0 (None): pixel art has no gradients
  // for the fancier filters to earn their bytes on.
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// The way back: a PNG file in, RGBA out. scripts/img/pixelate.mjs reads the
// pictures a person hands it, and those come from anywhere, so this takes
// every 8-bit non-interlaced colour type (grey, RGB, palette, grey+alpha,
// RGBA) and all five scanline filters. 16-bit and Adam7 are refused by name
// rather than decoded wrong.
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/**
 * @param {Buffer} file - PNG file contents
 * @returns {{ width: number, height: number, rgba: Buffer }}
 */
export function decodePng(file) {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let ihdr = null
  let plte = null
  let trns = null
  const idat = []
  for (let at = 8; at < file.length;) {
    const len = file.readUInt32BE(at)
    const type = file.toString('ascii', at + 4, at + 8)
    const data = file.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') ihdr = data
    else if (type === 'PLTE') plte = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + len
  }
  if (!ihdr) throw new Error('PNG has no IHDR')
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const [depth, color, , , interlace] = ihdr.subarray(8)
  if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not supported (8 only)`)
  if (interlace) throw new Error('interlaced PNG is not supported')
  const bpp = CHANNELS[color]
  if (!bpp) throw new Error(`PNG color type ${color} is not supported`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const px = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const b = y ? px[(y - 1) * stride + x] : 0
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0
      let pred = 0
      if (filter === 1) pred = a
      else if (filter === 2) pred = b
      else if (filter === 3) pred = (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      px[y * stride + x] = (line[x] + pred) & 0xff
    }
  }

  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp
    let r, g, b2, al
    if (color === 0) [r, g, b2, al] = [px[s], px[s], px[s], 255]
    else if (color === 2) [r, g, b2, al] = [px[s], px[s + 1], px[s + 2], 255]
    else if (color === 3) {
      const k = px[s]
      ;[r, g, b2] = [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2]]
      al = trns && k < trns.length ? trns[k] : 255
    } else if (color === 4) [r, g, b2, al] = [px[s], px[s], px[s], px[s + 1]]
    else [r, g, b2, al] = [px[s], px[s + 1], px[s + 2], px[s + 3]]
    rgba.set([r, g, b2, al], i * 4)
  }
  return { width, height, rgba }
}
