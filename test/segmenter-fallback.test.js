// test/segmenter-fallback.test.js
// The canvas boots on an engine without Intl.Segmenter.
//
// THIS IS THE ROOT CAUSE of the pile photographed from an Apple Watch Ultra,
// found by scanning what the boot path actually calls rather than by guessing
// at it again. The vendored pretext constructed `new Intl.Segmenter(...)` in
// four places with no feature check and no fallback. Intl.Segmenter needs ICU
// segmentation data and Apple ships a reduced ICU on watchOS, so on a device
// without it the constructor throws and takes the whole boot down:
// buildPhraseLines() runs before render(), so every tile ends up CREATED but
// never PLACED, stacked at the scene's top-left corner at 1:1 with the doors
// row over the tiles. The buttons darken (:active is pure CSS) and do nothing
// (the router never got wired). That is the report, exactly.
//
// Reproduced by deleting Intl.Segmenter in desktop WebKit: canvas-failed set,
// zero tiles painting. With the shim: 10 tiles at 205x251, doors at 1730,1976
// w332, z 0.203, identical to a run WITH Intl.Segmenter, at both a watch and a
// laptop viewport. (The doors are derived rather than measured and read
// x=1440 w=912 on the same centre line; the shim result is unaffected, and
// the numbers above are what that run recorded.)
//
// The shim is a LOCAL PATCH to vendored code, so this guard also pins that the
// patch survives a re-vendor: a fresh copy of pretext would reintroduce the
// bare constructors and silently break the smallest devices again.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  makeSegmenter,
  hasIntlSegmenter,
} from '../src/static/canvas/vendor/pretext/segmenter-shim.js'

const DIR = join(import.meta.dirname, '../src/static/canvas/vendor/pretext')
const files = readdirSync(DIR).filter((f) => f.endsWith('.js'))

describe('pretext survives an engine with no Intl.Segmenter', () => {
  // mutation: segmenter-fallback.revendor-bare-constructor
  it('constructs no Intl.Segmenter without a guard, anywhere in pretext', () => {
    // The re-vendor guard. Every construction must go through the shim.
    for (const f of files) {
      if (f === 'segmenter-shim.js') continue
      const src = readFileSync(join(DIR, f), 'utf8')
      assert.doesNotMatch(
        src,
        /new Intl\.Segmenter\(/,
        `${f} constructs Intl.Segmenter directly: on an engine without ICU segmentation data that throws and takes the canvas boot with it`
      )
    }
    // and at least one file really does use the shim, so the check above
    // cannot pass by pretext having stopped segmenting altogether
    const users = files.filter(
      (f) => f !== 'segmenter-shim.js' && /makeSegmenter\(/.test(readFileSync(join(DIR, f), 'utf8'))
    )
    assert.ok(users.length >= 4, `only ${users.length} pretext files route through the shim`)
  })

  it('the fallback segments graphemes by code point, keeping surrogate pairs whole', () => {
    // Exercise the FALLBACK explicitly, not whichever branch this node happens
    // to take: an assertion that only ever runs the Intl path proves nothing
    // about the device that has no Intl path.
    const real = Intl.Segmenter
    try {
      // eslint-disable-next-line no-global-assign
      delete Intl.Segmenter
      const seg = makeSegmenter(undefined, { granularity: 'grapheme' })
      assert.deepEqual(
        [...seg.segment('abc')].map((s) => s.segment),
        ['a', 'b', 'c']
      )
      // a non-BMP code point must not split into two lone surrogates
      const parts = [...seg.segment('a\u{1F600}b')].map((s) => s.segment)
      assert.deepEqual(parts, ['a', '\u{1F600}', 'b'])
      // indices are code-unit offsets, the same units Intl.Segmenter reports
      assert.deepEqual(
        [...seg.segment('a\u{1F600}b')].map((s) => s.index),
        [0, 1, 3]
      )
    } finally {
      Intl.Segmenter = real
    }
  })

  it('the fallback segments words at letter/non-letter boundaries', () => {
    const real = Intl.Segmenter
    try {
      delete Intl.Segmenter
      const seg = makeSegmenter('en', { granularity: 'word' })
      const out = [...seg.segment('Ada makes things.')]
      assert.deepEqual(
        out.map((s) => s.segment),
        ['Ada', ' ', 'makes', ' ', 'things', '.']
      )
      assert.deepEqual(
        out.map((s) => s.isWordLike),
        [true, false, true, false, true, false]
      )
      // digits and marks count as word-like, so a version string stays whole
      assert.deepEqual(
        [...seg.segment('v2')].map((s) => s.segment),
        ['v2']
      )
    } finally {
      Intl.Segmenter = real
    }
  })

  it('uses the real Intl.Segmenter when the engine has one', () => {
    // The fallback is a floor, not a replacement: where ICU exists it must
    // still do the segmenting, or CJK and Thai silently regress everywhere.
    assert.equal(hasIntlSegmenter, typeof Intl.Segmenter === 'function')
    if (!hasIntlSegmenter) return
    assert.ok(makeSegmenter(undefined, { granularity: 'grapheme' }) instanceof Intl.Segmenter)
  })

  it('a locale the engine cannot serve degrades instead of throwing', () => {
    // Construction can throw on an engine that HAS the constructor but lacks
    // data, which is the shape a trimmed ICU actually takes.
    assert.doesNotThrow(() => makeSegmenter('zz-Nonsense', { granularity: 'word' }))
  })
})
