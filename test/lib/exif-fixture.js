// test/lib/exif-fixture.js
// Builds real metadata blocks, so the privacy guard is tested against the
// thing it exists to catch rather than against a string that resembles it.
// A phone photo's EXIF is a TIFF document with a GPS sub-IFD hanging off
// it; this writes exactly that, byte for byte, and wraps it in the JPEG,
// PNG and WebP containers that carry it.
//
// Shared by test/lib/image-meta.test.js (unit) and test/image-metadata.test.js
// (the guard's own mutation check), because a guard that has never been
// shown a real offender is a guess.

const ASCII = 2
const LONG = 4
const RATIONAL = 5

// One 12-byte IFD entry. Values wider than 4 bytes live in a data area
// after the directory and the entry holds their offset, which is what the
// `heap` accumulator is for.
function entry(tag, type, values, heap, heapBase) {
  const buf = Buffer.alloc(12)
  buf.writeUInt16LE(tag, 0)
  buf.writeUInt16LE(type, 2)

  let payload
  let count
  if (type === ASCII) {
    payload = Buffer.from(values + '\0', 'latin1')
    count = payload.length
  } else if (type === LONG) {
    count = values.length
    payload = Buffer.alloc(4 * count)
    values.forEach((v, i) => payload.writeUInt32LE(v, i * 4))
  } else {
    // RATIONAL: numerator then denominator, both u32
    count = values.length
    payload = Buffer.alloc(8 * count)
    values.forEach(([n, d], i) => {
      payload.writeUInt32LE(n, i * 8)
      payload.writeUInt32LE(d, i * 8 + 4)
    })
  }
  buf.writeUInt32LE(count, 4)

  if (payload.length <= 4) {
    payload.copy(buf, 8)
  } else {
    buf.writeUInt32LE(heapBase + heap.length, 8)
    heap.push(payload)
  }
  return buf
}

function ifd(entries, heap, heapBase, next = 0) {
  const head = Buffer.alloc(2)
  head.writeUInt16LE(entries.length, 0)
  const tail = Buffer.alloc(4)
  tail.writeUInt32LE(next, 0)
  return Buffer.concat([head, ...entries, tail])
}

// A heap that reports where the next blob will land, so entries can point
// at it while it is still being filled.
function makeHeap(base) {
  const parts = []
  return {
    parts,
    get length() {
      return parts.reduce((n, p) => n + p.length, 0)
    },
    push: (p) => parts.push(p),
    base,
  }
}

/**
 * A TIFF/EXIF block carrying camera identity and GPS coordinates: the
 * shape a phone writes into every picture it takes.
 *
 * @param {{make?: string, model?: string, lat?: [number,number,number], lon?: [number,number,number]}} opts
 * @returns {Buffer}
 */
export function exifBlock({
  make = 'TestCorp',
  model = 'TestPhone 1',
  lat = [42, 26, 33],
  lon = [76, 30, 5],
} = {}) {
  const header = Buffer.alloc(8)
  header.write('II', 0, 'latin1')
  header.writeUInt16LE(42, 2)
  header.writeUInt32LE(8, 4)

  // Lay out: header | IFD0 | IFD0 heap | GPS IFD | GPS heap
  const ifd0Size = 2 + 3 * 12 + 4
  const ifd0HeapBase = 8 + ifd0Size
  const ifd0Heap = makeHeap(ifd0HeapBase)
  const makeEntry = entry(0x010f, ASCII, make, ifd0Heap, ifd0HeapBase)
  const modelEntry = entry(0x0110, ASCII, model, ifd0Heap, ifd0HeapBase)
  const gpsOffset = ifd0HeapBase + ifd0Heap.length
  const gpsEntry = entry(0x8825, LONG, [gpsOffset], ifd0Heap, ifd0HeapBase)
  const ifd0 = ifd([makeEntry, modelEntry, gpsEntry], ifd0Heap, ifd0HeapBase, 0)

  const gpsSize = 2 + 4 * 12 + 4
  const gpsHeapBase = gpsOffset + gpsSize
  const gpsHeap = makeHeap(gpsHeapBase)
  const dms = (v) => [
    [v[0], 1],
    [v[1], 1],
    [v[2], 1],
  ]
  const gpsEntries = [
    entry(0x0001, ASCII, 'N', gpsHeap, gpsHeapBase),
    entry(0x0002, RATIONAL, dms(lat), gpsHeap, gpsHeapBase),
    entry(0x0003, ASCII, 'W', gpsHeap, gpsHeapBase),
    entry(0x0004, RATIONAL, dms(lon), gpsHeap, gpsHeapBase),
  ]
  const gpsIfd = ifd(gpsEntries, gpsHeap, gpsHeapBase, 0)

  return Buffer.concat([header, ifd0, ...ifd0Heap.parts, gpsIfd, ...gpsHeap.parts])
}

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
export function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** A 1x1 grey PNG, valid enough to decode. */
export function tinyPng(extraChunks = []) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // greyscale
  // zlib stream for one filter byte + one sample, stored (uncompressed)
  const idat = Buffer.from([
    0x78, 0x01, 0x01, 0x02, 0x00, 0xfd, 0xff, 0x00, 0x80, 0x00, 0x81, 0x00, 0x81,
  ])
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    ...extraChunks,
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** A minimal baseline JPEG (SOI, APP0/JFIF, SOF0, SOS, EOI). */
export function tinyJpeg(extraSegments = []) {
  const seg = (marker, body) => {
    const head = Buffer.alloc(4)
    head[0] = 0xff
    head[1] = marker
    head.writeUInt16BE(body.length + 2, 2)
    return Buffer.concat([head, body])
  }
  const jfif = Buffer.concat([
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.from([0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
  ])
  const sof = Buffer.from([
    0x08, // precision
    0x00,
    0x02, // height 2
    0x00,
    0x03, // width 3
    0x01, // one component
    0x01,
    0x11,
    0x00,
  ])
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, jfif),
    ...extraSegments,
    seg(0xc0, sof),
    seg(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from([0x00, 0xff, 0xd9]),
  ])
}

/**
 * A minimal extended WebP (RIFF, WEBP, one VP8X chunk stating a 3x2 canvas).
 * No pixels: enough to be named and sized, which is all a header reader does.
 */
export function tinyWebp() {
  const vp8x = Buffer.alloc(10)
  vp8x.writeUIntLE(3 - 1, 4, 3) // canvas width, minus one
  vp8x.writeUIntLE(2 - 1, 7, 3) // canvas height, minus one
  const head = Buffer.alloc(8)
  head.write('VP8X', 0, 'latin1')
  head.writeUInt32LE(vp8x.length, 4)
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0, 'latin1')
  riff.writeUInt32LE(4 + head.length + vp8x.length, 4)
  riff.write('WEBP', 8, 'latin1')
  return Buffer.concat([riff, head, vp8x])
}

/** An APP1 segment carrying an EXIF block, ready to splice into a JPEG. */
export function exifSegment(block = exifBlock()) {
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), block])
  const head = Buffer.alloc(4)
  head[0] = 0xff
  head[1] = 0xe1
  head.writeUInt16BE(body.length + 2, 2)
  return Buffer.concat([head, body])
}
