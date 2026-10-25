// Take everything off an image that is not the picture.
//
//   node scripts/img/strip-metadata.mjs src/static/img/<set>
//   node scripts/img/strip-metadata.mjs src/static/img/<set>/01.jpg --check
//
// Run it on a directory or on files; --check reports without writing, which
// is the same answer the build guard gives.
//
// This needs no image library because it decodes no pixels. PNG metadata is
// whole chunks, JPEG metadata is whole marker segments, WebP metadata is
// whole RIFF chunks: in all three the compressed image data is a separate
// span that gets copied across byte for byte. What comes out is the same
// picture with the notes torn off, not a re-encode, so nothing is
// resampled and no generation of quality is lost.
//
// The point is the GPS coordinates. A phone writes the shutter's latitude
// and longitude into every frame, and the picture looks identical whether
// or not the address of the house it was taken in is riding along inside
// it. test/image-metadata.test.js fails the build if a file under
// src/static/img/ still carries any; this is how you clear it.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'

import { metadataIn, sniff } from '../../src/lib/image-meta.js'

const ascii = (buf, start, len) => buf.subarray(start, start + len).toString('latin1')

// Kept exactly as in src/lib/image-meta.js: what the guard calls pixels is
// what the stripper must keep, or the two disagree and one of them is wrong.
const PNG_KEEP = new Set([
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
  'acTL',
  'fcTL',
  'fdAT',
])
const JPEG_KEEP_APPS = new Set(['JFIF', 'JFXX', 'ICC_PROFILE', 'Adobe'])
const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'])

function stripPng(buf) {
  const out = [buf.subarray(0, 8)]
  let at = 8
  while (at + 8 <= buf.length) {
    const length = buf.readUInt32BE(at)
    const type = ascii(buf, at + 4, 4)
    const end = at + 12 + length
    if (end > buf.length) break
    if (PNG_KEEP.has(type)) out.push(buf.subarray(at, end))
    if (type === 'IEND') break
    at = end
  }
  return Buffer.concat(out)
}

function stripJpeg(buf) {
  const out = [Buffer.from([0xff, 0xd8])]
  let at = 2
  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff) break
    const marker = buf[at + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(at, at + 2))
      at += 2
      continue
    }
    if (marker === 0xd9) break
    const length = buf.readUInt16BE(at + 2)
    if (length < 2 || at + 2 + length > buf.length) break
    const end = at + 2 + length

    if (marker === 0xda) {
      // Start of scan: the compressed picture runs from here to the
      // end-of-image marker. Copy it whole and stop; anything appended
      // past EOI is a trailing metadata block and is dropped with it.
      const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), end)
      out.push(buf.subarray(at, eoi === -1 ? buf.length : eoi + 2))
      if (eoi === -1) out.push(Buffer.from([0xff, 0xd9]))
      return Buffer.concat(out)
    }

    const isApp = marker >= 0xe0 && marker <= 0xef
    if (isApp) {
      const body = buf.subarray(at + 4, end)
      const zero = body.indexOf(0)
      const id = body.subarray(0, zero === -1 ? 16 : zero).toString('latin1')
      if (JPEG_KEEP_APPS.has(id)) out.push(buf.subarray(at, end))
    } else if (marker !== 0xfe) {
      // Not an APP segment and not a comment: quantisation tables, Huffman
      // tables, the frame header. All of it is needed to decode.
      out.push(buf.subarray(at, end))
    }
    at = end
  }
  out.push(Buffer.from([0xff, 0xd9]))
  return Buffer.concat(out)
}

function stripWebp(buf) {
  const kept = []
  let at = 12
  while (at + 8 <= buf.length) {
    const fourcc = ascii(buf, at, 4)
    const size = buf.readUInt32LE(at + 4)
    const end = at + 8 + size + (size % 2)
    if (at + 8 + size > buf.length) break
    if (WEBP_KEEP.has(fourcc)) kept.push(buf.subarray(at, Math.min(end, buf.length)))
    at = end
  }
  const body = Buffer.concat(kept)
  // The extended header advertises which optional chunks follow. Dropping
  // EXIF/XMP without clearing bits 3 and 2 leaves a file that claims to
  // carry metadata a decoder will then go looking for.
  if (body.length >= 16 && ascii(body, 0, 4) === 'VP8X') {
    body[8] &= ~0b00001100
  }
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'latin1')
  head.writeUInt32LE(4 + body.length, 4)
  head.write('WEBP', 8, 'latin1')
  return Buffer.concat([head, body])
}

function stripSvg(buf) {
  return Buffer.from(
    buf
      .toString('utf8')
      .replace(/<metadata[\s\S]*?<\/metadata>\s*/gi, '')
      .replace(/<\?xpacket[\s\S]*?\?>\s*/gi, ''),
    'utf8'
  )
}

const STRIPPERS = { png: stripPng, jpeg: stripJpeg, webp: stripWebp, svg: stripSvg }

// seam: test/image-metadata.test.js
export function stripMetadata(buf) {
  const format = sniff(buf)
  const strip = STRIPPERS[format]
  if (!strip) return null
  return strip(buf)
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg'])

function filesUnder(path) {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && IMAGE_EXT.has(extname(e.name).toLowerCase()))
    .map((e) => join(e.parentPath, e.name))
    .sort()
}

function main(argv) {
  const check = argv.includes('--check')
  const targets = argv.filter((a) => !a.startsWith('--'))
  if (!targets.length) {
    console.error('usage: node scripts/img/strip-metadata.mjs <file|dir>... [--check]')
    process.exit(2)
  }

  let dirty = 0
  for (const target of targets.flatMap(filesUnder)) {
    const before = readFileSync(target)
    const found = metadataIn(before)
    if (!found.readable) {
      console.error(`${target}: no reader for this format, cannot prove it clean`)
      dirty++
      continue
    }
    if (!found.findings.length) continue
    dirty++
    console.log(`${target}\n  ${found.findings.join('\n  ')}`)
    if (check) continue
    const after = stripMetadata(before)
    writeFileSync(target, after)
    const left = metadataIn(after).findings
    if (left.length) {
      console.error(`  STILL CARRYING: ${left.join(', ')}`)
      continue
    }
    console.log(`  stripped, ${before.length} -> ${after.length} bytes`)
  }

  if (!dirty) console.log('clean')
  if (check && dirty) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2))
