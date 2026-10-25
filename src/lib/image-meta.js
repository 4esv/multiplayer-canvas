// Image containers, read as bytes. No codec, no dependency: PNG, JPEG and
// WebP all wrap their pixels in a chunk or segment list that can be walked
// with a cursor and two integer reads, and the two questions this file
// answers live entirely in that wrapper.
//
//   dimensionsOf   how big is the picture, so a photo can reserve its box
//                  in the layout before a single byte of it has arrived
//   metadataIn     what is this file carrying besides pixels
//
// The second question is the one that matters. A photo off a phone ships
// an EXIF block, and an EXIF block routinely holds the GPS coordinates
// where the shutter fired. Publishing a picture of a dog in a garden is a
// choice; publishing the garden's latitude is not one anybody makes on
// purpose. So the rule here is that a file must PROVE it is clean: the
// allowlists below name the chunks that carry rendering information and
// nothing else, and anything not on them is reported, including formats
// this file cannot read. An unreadable container is not a clean one.
//
// Byte layouts, for the reader who wants to check the cursor arithmetic:
//   PNG    8-byte signature, then [len:u32be][type:4][data:len][crc:u32be]*
//   JPEG   0xFFD8, then [0xFF][marker][len:u16be incl. len][data]*, entropy
//          data after SOS, 0xFFD9 at the end
//   WebP   'RIFF'[size:u32le]'WEBP', then ['fourcc'][size:u32le][data][pad]*
//   TIFF   ('II'|'MM')[42][ifd0:u32], IFD = [count:u16][entry:12]*[next:u32]

// PNG chunks that describe how to paint the image. Everything else is
// either a note somebody's software left behind or a metadata block.
//   iCCP is colour management, not identity: dropping it changes the
//   picture, so it stays. sRGB/gAMA/cHRM/sBIT are the same class.
const PNG_PIXEL_CHUNKS = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'sBIT',
  'bKGD',
  'hIST',
  'pHYs',
  'sPLT',
  // APNG: an animation is pixels over time
  'acTL',
  'fcTL',
  'fdAT',
])

// JPEG APP segments that carry rendering information. APP0/JFIF is the
// density header, APP2/ICC_PROFILE is colour management, APP14/Adobe is
// the colour-transform flag a CMYK or YCCK file needs to decode right.
const JPEG_PIXEL_APPS = new Set(['JFIF', 'JFXX', 'ICC_PROFILE', 'Adobe'])

// WebP chunks that are pixels, alpha, animation or colour.
const WEBP_PIXEL_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'])

// The EXIF tags worth naming when one turns up. The rest are reported by
// number: the point of the report is "this file knows things about you",
// and a bare tag number still says that.
const TIFF_TAGS = {
  0x010f: 'Make',
  0x0110: 'Model',
  0x0112: 'Orientation',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x8769: 'ExifIFD',
  0x8825: 'GPSInfo',
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
  0x927c: 'MakerNote',
  0x9286: 'UserComment',
  0xa430: 'CameraOwnerName',
  0xa431: 'BodySerialNumber',
  0xa433: 'LensMake',
  0xa434: 'LensModel',
  0xa435: 'LensSerialNumber',
}

const GPS_TAGS = {
  0x0001: 'GPSLatitudeRef',
  0x0002: 'GPSLatitude',
  0x0003: 'GPSLongitudeRef',
  0x0004: 'GPSLongitude',
  0x0005: 'GPSAltitudeRef',
  0x0006: 'GPSAltitude',
  0x0007: 'GPSTimeStamp',
  0x001d: 'GPSDateStamp',
}

const ascii = (buf, start, len) => buf.subarray(start, start + len).toString('latin1')

/**
 * @param {Buffer} buf
 * @returns {'png'|'jpeg'|'webp'|'gif'|'svg'|null}
 */
export function sniff(buf) {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    return 'png'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') return 'webp'
  if (buf.length >= 6 && ascii(buf, 0, 3) === 'GIF') return 'gif'
  // An SVG is text. Skip a BOM and any leading whitespace, xml declaration
  // or doctype before deciding.
  const head = buf
    .subarray(0, 512)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (head.startsWith('<?xml') || head.startsWith('<!DOCTYPE svg') || head.startsWith('<svg')) {
    return 'svg'
  }
  return null
}

// Walk PNG chunks. Yields { type, start, length, data } and stops at IEND
// or the first malformed length, so a truncated file cannot loop.
function* pngChunks(buf) {
  let at = 8
  while (at + 8 <= buf.length) {
    const length = buf.readUInt32BE(at)
    const type = ascii(buf, at + 4, 4)
    const end = at + 12 + length
    if (length > buf.length || end > buf.length) return
    yield { type, start: at, length, data: buf.subarray(at + 8, at + 8 + length) }
    if (type === 'IEND') return
    at = end
  }
}

// Walk JPEG marker segments up to the start of scan. Standalone markers
// (SOI, EOI, RST, TEM) carry no length; everything else does.
function* jpegSegments(buf, from = 2) {
  let at = from
  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff) return
    const marker = buf[at + 1]
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      at += 2
      continue
    }
    const length = buf.readUInt16BE(at + 2)
    if (length < 2 || at + 2 + length > buf.length) return
    yield { marker, start: at, length, data: buf.subarray(at + 4, at + 2 + length) }
    if (marker === 0xda) return // scan data follows; the caller takes over
    at += 2 + length
  }
}

// Walk RIFF chunks. Odd-sized chunks are padded to even.
function* riffChunks(buf) {
  let at = 12
  while (at + 8 <= buf.length) {
    const fourcc = ascii(buf, at, 4)
    const size = buf.readUInt32LE(at + 4)
    const end = at + 8 + size + (size % 2)
    if (size > buf.length || at + 8 + size > buf.length) return
    yield { fourcc, start: at, size, data: buf.subarray(at + 8, at + 8 + size) }
    at = end
  }
}

// Read a TIFF/EXIF block and name every tag it holds. Recurses into the
// Exif and GPS sub-IFDs, which is where the interesting things live: the
// top-level IFD of a phone photo is often innocuous while the GPS IFD
// underneath it holds six decimal places of where you live.
function readTiff(block, found, label) {
  if (block.length < 8) {
    found.push(`${label} (truncated)`)
    return
  }
  const order = ascii(block, 0, 2)
  if (order !== 'II' && order !== 'MM') {
    found.push(`${label} (unreadable byte order)`)
    return
  }
  const le = order === 'II'
  const u16 = (o) => (le ? block.readUInt16LE(o) : block.readUInt16BE(o))
  const u32 = (o) => (le ? block.readUInt32LE(o) : block.readUInt32BE(o))
  if (u16(2) !== 42) {
    found.push(`${label} (not a TIFF header)`)
    return
  }

  // Every IFD is visited at most once: a crafted file can point its "next"
  // offset back at itself, and this runs over untrusted bytes.
  const seen = new Set()
  const queue = [{ offset: u32(4), names: TIFF_TAGS, tag: label }]
  while (queue.length) {
    const { offset, names, tag } = queue.shift()
    if (seen.has(offset) || offset < 8 || offset + 2 > block.length) continue
    seen.add(offset)
    const count = u16(offset)
    if (offset + 2 + count * 12 + 4 > block.length) continue
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12
      const id = u16(at)
      const name = names[id]
      found.push(`${tag}.${name || `tag 0x${id.toString(16).padStart(4, '0')}`}`)
      if (names === TIFF_TAGS && (id === 0x8769 || id === 0x8825)) {
        queue.push({
          offset: u32(at + 8),
          names: id === 0x8825 ? GPS_TAGS : TIFF_TAGS,
          tag: id === 0x8825 ? `${label}.GPS` : `${label}.Exif`,
        })
      }
    }
    const next = u32(offset + 2 + count * 12)
    if (next) queue.push({ offset: next, names, tag })
  }
}

/**
 * Everything in this file that is not pixels.
 *
 * @param {Buffer} buf
 * @returns {{format: string|null, readable: boolean, findings: string[]}}
 *   `readable` false means the format has no reader here, which counts as a
 *   finding of its own: nothing proved the file clean.
 */
export function metadataIn(buf) {
  const format = sniff(buf)
  const findings = []

  if (format === 'png') {
    for (const { type, data } of pngChunks(buf)) {
      if (PNG_PIXEL_CHUNKS.has(type)) continue
      if (type === 'eXIf') {
        readTiff(data, findings, 'eXIf')
        continue
      }
      if (type === 'tEXt' || type === 'zTXt') {
        findings.push(
          `${type} "${data
            .subarray(0, data.indexOf(0) + 1 || 80)
            .toString('latin1')
            .replace(/\0/g, '')}"`
        )
        continue
      }
      if (type === 'iTXt') {
        findings.push(
          `iTXt "${data
            .subarray(0, data.indexOf(0) + 1 || 80)
            .toString('utf8')
            .replace(/\0/g, '')}"`
        )
        continue
      }
      if (type === 'tIME') {
        findings.push('tIME (when the file was last written)')
        continue
      }
      findings.push(`${type} (unrecognised chunk)`)
    }
    return { format, readable: true, findings }
  }

  if (format === 'jpeg') {
    const walk = (from) => {
      for (const { marker, data } of jpegSegments(buf, from)) {
        if (marker === 0xfe) {
          findings.push(`COM "${data.subarray(0, 60).toString('latin1').replace(/\0/g, '')}"`)
          continue
        }
        if (marker < 0xe0 || marker > 0xef) continue // not an APP segment
        const id = data
          .subarray(0, data.indexOf(0) === -1 ? 16 : data.indexOf(0))
          .toString('latin1')
        if (JPEG_PIXEL_APPS.has(id)) continue
        const app = `APP${marker - 0xe0}`
        if (id === 'Exif') {
          readTiff(data.subarray(6), findings, `${app}/Exif`)
          continue
        }
        findings.push(`${app} "${id.slice(0, 40)}"`)
      }
    }
    walk(2)
    // EXIF is also legal, and common, AFTER the image: some editors append
    // a second block past the end-of-image marker rather than rewrite the
    // front of the file. Walking only the head would call that file clean.
    const eoi = buf.lastIndexOf(Buffer.from([0xff, 0xd9]))
    if (eoi !== -1 && eoi + 2 < buf.length) walk(eoi + 2)
    return { format, readable: true, findings }
  }

  if (format === 'webp') {
    for (const { fourcc, data } of riffChunks(buf)) {
      if (WEBP_PIXEL_CHUNKS.has(fourcc)) continue
      if (fourcc === 'EXIF') {
        readTiff(data, findings, 'EXIF')
        continue
      }
      findings.push(`${fourcc.trim() || fourcc} (unrecognised chunk)`)
    }
    return { format, readable: true, findings }
  }

  if (format === 'svg') {
    // An SVG is a document, so its metadata is markup: the <metadata>
    // element, and the RDF/XMP blocks editors bury inside it.
    const text = buf.toString('utf8')
    for (const [re, label] of [
      [/<metadata[\s>]/i, '<metadata> element'],
      [/<[a-z0-9]*:?RDF[\s>]/i, 'RDF block'],
      [/xmpmeta/i, 'XMP block'],
      [/\bexif:/i, 'exif: namespace'],
      [/\b(sodipodi|inkscape):/i, 'editor namespace'],
    ]) {
      if (re.test(text)) findings.push(label)
    }
    return { format, readable: true, findings }
  }

  return { format, readable: false, findings: [] }
}

/**
 * @param {Buffer} buf
 * @returns {{width: number, height: number}|null}
 */
export function dimensionsOf(buf) {
  const format = sniff(buf)

  if (format === 'png') {
    for (const { type, data } of pngChunks(buf)) {
      if (type !== 'IHDR' || data.length < 8) break
      return { width: data.readUInt32BE(0), height: data.readUInt32BE(4) }
    }
    return null
  }

  if (format === 'jpeg') {
    // Size lives in the frame header. Every SOFn carries it except DHT
    // (C4), JPG (C8) and DAC (CC), which share the 0xC0-0xCF block.
    for (const { marker, data } of jpegSegments(buf)) {
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
      if (!isFrame || data.length < 5) continue
      return { width: data.readUInt16BE(3), height: data.readUInt16BE(1) }
    }
    return null
  }

  if (format === 'webp') {
    for (const { fourcc, data } of riffChunks(buf)) {
      // Extended format states the canvas size outright, minus one.
      if (fourcc === 'VP8X' && data.length >= 10) {
        return {
          width: 1 + (data[4] | (data[5] << 8) | (data[6] << 16)),
          height: 1 + (data[7] | (data[8] << 8) | (data[9] << 16)),
        }
      }
      // Lossy: 3-byte frame tag, the 3-byte start code, then two 14-bit
      // dimensions with 2 scale bits on top of each.
      if (fourcc === 'VP8 ' && data.length >= 10) {
        if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null
        return {
          width: data.readUInt16LE(6) & 0x3fff,
          height: data.readUInt16LE(8) & 0x3fff,
        }
      }
      // Lossless: signature byte, then 14 bits of width-1 and 14 of
      // height-1 packed little-endian across the next four bytes.
      if (fourcc === 'VP8L' && data.length >= 5) {
        if (data[0] !== 0x2f) return null
        const bits = data.readUInt32LE(1)
        return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
      }
    }
    return null
  }

  if (format === 'gif' && buf.length >= 10) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }

  return null
}
