// test/lib/image-meta.test.js
// The byte readers, pinned against files whose real size is known
// independently (macOS `sips`, and since the pictures were dithered, PIL,
// was the second opinion when these numbers were taken) and against
// containers crafted here. The tree ships no JPEG or WebP any more (the one
// ditherer writes PNG), so those two are read off the crafted ones. A photo
// set reserves each slide's box from these numbers before a byte of the
// picture has arrived, so a wrong answer is a page that jumps while it loads.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { dimensionsOf, metadataIn, sniff } from '../../src/lib/image-meta.js'
import { exifSegment, tinyJpeg, tinyPng, tinyWebp } from './exif-fixture.js'

const STATIC = join(import.meta.dirname, '../../src/static')
const read = (rel) => readFileSync(join(STATIC, rel))

describe('sniff names the container', () => {
  it('reads the four raster signatures and svg', () => {
    assert.equal(sniff(read('img/og/default.png')), 'png')
    assert.equal(sniff(tinyJpeg()), 'jpeg')
    assert.equal(sniff(tinyWebp()), 'webp')
    assert.equal(sniff(read('img/dither-0.svg')), 'svg')
  })

  it('answers null for something that is not an image', () => {
    assert.equal(sniff(read('sw.js')), null)
    assert.equal(sniff(Buffer.alloc(0)), null)
  })
})

describe('dimensionsOf reads the size out of the header', () => {
  // Verified against an independent decoder when written.
  const KNOWN = [
    ['img/og/default.png', 1200, 630],
    ['favicon-32x32.png', 32, 32],
    ['img/canvas/maurice.png', 16, 12],
    ['img/canvas/web-instruments.png', 224, 168],
    ['img/instruments/rhodes.png', 476, 360],
  ]
  for (const [rel, width, height] of KNOWN) {
    it(`${rel} is ${width}x${height}`, () => {
      assert.deepEqual(dimensionsOf(read(rel)), { width, height })
    })
  }

  it('survives a truncated file instead of throwing', () => {
    const half = read('img/og/default.png').subarray(0, 6)
    assert.equal(dimensionsOf(half), null)
    assert.equal(metadataIn(half).readable, false)
  })

  // mutation: image-meta.segment-walk-off-by-two
  it('reads a size past a metadata block, not out of it', () => {
    // EXIF sits between SOI and the frame header, so a reader that stops at
    // the first segment reads the thumbnail's size, or nothing.
    assert.deepEqual(dimensionsOf(tinyJpeg([exifSegment()])), { width: 3, height: 2 })
    assert.deepEqual(dimensionsOf(tinyPng()), { width: 1, height: 1 })
    assert.deepEqual(dimensionsOf(tinyWebp()), { width: 3, height: 2 })
  })
})
