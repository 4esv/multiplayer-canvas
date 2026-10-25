// test/qr.test.js
// The QR encoder behind the rooms desk's share block. Pinned against a
// reference encoder (node-qrcode 1.5.4, forced byte mode, level M): the
// three hashes below are of ITS module matrices, taken once, so the pin is
// independent of this code. Every one of 144 forced-mask matrices across
// versions 1 to 10 matched module for module when the encoder was written,
// and the mask it picks matched the reference's on every input.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { MAX_VERSION, capacity, qrMatrix, qrSvg } from '../src/lib/qr.js'

function digest(m) {
  return createHash('sha256').update(Buffer.from(m.modules)).digest('hex').slice(0, 16)
}

const PINS = [
  ['https://example.com/?session=abc123', 3, 2, '8d6045855749274a'],
  [
    'https://example.com/?session=the-jam-from-tuesday-2026-09-05&kind=session',
    5,
    2,
    '69d701a370006ae5',
  ],
  ['x'.repeat(213), 10, 0, 'b27c5d8141e70c48'],
]

describe('qr: the matrix', () => {
  it('matches the reference encoder on the pinned inputs, version, mask and modules', () => {
    for (const [text, version, mask, hash] of PINS) {
      const m = qrMatrix(text)
      assert.equal(m.version, version, text.slice(0, 32))
      assert.equal(m.mask, mask, text.slice(0, 32))
      assert.equal(m.size, 17 + 4 * version)
      assert.equal(digest(m), hash, text.slice(0, 32))
    }
  })

  it('is deterministic', () => {
    assert.equal(digest(qrMatrix('hello')), digest(qrMatrix('hello')))
  })

  it('draws the three finders and the dark module where the spec puts them', () => {
    const m = qrMatrix('a')
    const at = (r, c) => m.modules[r * m.size + c]
    for (const [r0, c0] of [
      [0, 0],
      [0, m.size - 7],
      [m.size - 7, 0],
    ]) {
      for (let i = 0; i < 7; i++) {
        assert.equal(at(r0 + i, c0), 1)
        assert.equal(at(r0, c0 + i), 1)
      }
      assert.equal(at(r0 + 1, c0 + 1), 0)
      assert.equal(at(r0 + 3, c0 + 3), 1)
    }
    assert.equal(at(4 * m.version + 9, 8), 1, 'the dark module')
    // timing: alternating from the finders' edges
    assert.equal(at(6, 8), 1)
    assert.equal(at(6, 9), 0)
    assert.equal(at(8, 6), 1)
  })

  it('takes the smallest version that fits, and refuses past version 10', () => {
    const caps = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]
    caps.forEach((n, i) => {
      assert.equal(capacity(i + 1), n)
      assert.equal(qrMatrix('x'.repeat(n)).version, i + 1)
    })
    assert.equal(MAX_VERSION, 10)
    assert.throws(() => qrMatrix('x'.repeat(214)), RangeError)
  })

  // mutation: qr.counts-characters
  it('counts bytes, not characters', () => {
    // 13 two-byte characters are 26 bytes: version 2, not 1
    assert.equal(qrMatrix('é'.repeat(13)).version, 2)
  })
})

describe('qr: the renderings', () => {
  it('svg: one path in currentColor, a four-module quiet zone, a label', () => {
    const svg = qrSvg('https://example.com/?session=abc123', 'QR code of the page')
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 37 37"/)
    assert.match(svg, /shape-rendering="crispEdges"/)
    assert.match(svg, /role="img" aria-label="QR code of the page"/)
    assert.equal(svg.match(/<path/g).length, 1)
    assert.match(svg, /fill="currentColor"/)
    assert.doesNotMatch(svg, /<script|#[0-9a-f]{3,6}\b/i)
    // the top-left finder's corner sits at (4,4) once the quiet zone is on
    assert.match(svg, /M4 4h1v1h-1z/)
  })

  it('svg: escapes the label', () => {
    assert.match(qrSvg('a', 'x "<&'), /aria-label="x &quot;&lt;&amp;"/)
  })
})
