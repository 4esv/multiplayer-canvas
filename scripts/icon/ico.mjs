// Minimal ICO encoder wrapping 32-bit BMP entries (BITMAPINFOHEADER + BGRA
// bottom-up + AND mask). BMP entries, not embedded PNGs, so the file reads
// in every legacy client the site's retro path bothers to serve.

/**
 * @param {Array<{size: number, rgba: Buffer}>} images - square RGBA frames
 * @returns {Buffer} ICO file contents
 */
export function encodeIco(images) {
  const headerSize = 6 + images.length * 16
  const entries = []
  const bodies = []
  let offset = headerSize

  for (const { size, rgba } of images) {
    if (rgba.length !== size * size * 4) {
      throw new Error(`rgba length ${rgba.length} != ${size}x${size}x4`)
    }
    const maskRowBytes = Math.ceil(size / 32) * 4
    const body = Buffer.alloc(40 + size * size * 4 + maskRowBytes * size)

    body.writeUInt32LE(40, 0) // BITMAPINFOHEADER size
    body.writeInt32LE(size, 4)
    body.writeInt32LE(size * 2, 8) // XOR + AND heights, stacked
    body.writeUInt16LE(1, 12) // planes
    body.writeUInt16LE(32, 14) // bpp
    body.writeUInt32LE(size * size * 4, 20) // image size

    // XOR data: bottom-up BGRA. AND mask stays zero: 32bpp alpha governs.
    for (let y = 0; y < size; y++) {
      const srcRow = (size - 1 - y) * size * 4
      for (let x = 0; x < size; x++) {
        const src = srcRow + x * 4
        const dst = 40 + (y * size + x) * 4
        body[dst] = rgba[src + 2]
        body[dst + 1] = rgba[src + 1]
        body[dst + 2] = rgba[src]
        body[dst + 3] = rgba[src + 3]
      }
    }

    const entry = Buffer.alloc(16)
    entry[0] = size === 256 ? 0 : size
    entry[1] = size === 256 ? 0 : size
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bpp
    entry.writeUInt32LE(body.length, 8)
    entry.writeUInt32LE(offset, 12)

    entries.push(entry)
    bodies.push(body)
    offset += body.length
  }

  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  return Buffer.concat([header, ...entries, ...bodies])
}
