// test/image-metadata.test.js
// The privacy guard: nothing shipped from src/static/ may carry metadata.
//
// A photo set is somebody's own pictures, and a picture off a phone arrives
// with an EXIF block bolted to it. That block routinely holds the GPS
// coordinates of the spot the shutter fired. Publishing a picture of a dog
// in a garden is a decision; publishing the garden's latitude to six
// decimal places is not a decision anyone makes on purpose, and it cannot
// be taken back once a crawler has the file. Camera model, serial number,
// the owner's name and the exact timestamp ride in the same block.
//
// So this reads the bytes. Not the filename, not a note in the commit
// message: the container is walked and every chunk that is not pixels is
// reported. It also fails on a format it cannot read, because the answer to
// "is this clean" is not allowed to be "no idea".
//
// Clear a failure with:  node scripts/img/strip-metadata.mjs <path>
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

import { metadataIn } from '../src/lib/image-meta.js'
import { stripMetadata } from '../scripts/img/strip-metadata.mjs'
import { exifBlock, exifSegment, pngChunk, tinyJpeg, tinyPng } from './lib/exif-fixture.js'

const ROOT = join(import.meta.dirname, '..')
const STATIC_DIR = join(ROOT, 'src/static')
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg'])

const images = readdirSync(STATIC_DIR, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile() && IMAGE_EXT.has(extname(e.name).toLowerCase()))
  .map((e) => relative(ROOT, join(e.parentPath, e.name)))
  .sort()

describe('no shipped image carries metadata', () => {
  it('the sweep found the image tree (a guard over nothing is not a guard)', () => {
    assert.ok(images.length > 20, `only ${images.length} images swept from src/static/`)
  })

  for (const rel of images) {
    it(rel, () => {
      const found = metadataIn(readFileSync(join(ROOT, rel)))
      assert.ok(
        found.readable,
        `${rel}: no metadata reader for this format (${found.format || 'unrecognised'}), ` +
          `so nothing proved it clean. Convert it, or teach src/lib/image-meta.js to read it.`
      )
      assert.deepEqual(
        found.findings,
        [],
        `${rel} ships metadata:\n  ${found.findings.join('\n  ')}\n` +
          `Clear it with: node scripts/img/strip-metadata.mjs ${rel}`
      )
    })
  }
})

// The guard above can only ever go green on a clean tree, which is exactly
// the shape of a guard that has quietly stopped working. These show it a
// real offender and watch it react.
describe('the guard reacts to the thing it exists to catch', () => {
  const carriers = {
    'a jpeg with an APP1 Exif block': tinyJpeg([exifSegment()]),
    'a png with an eXIf chunk': tinyPng([pngChunk('eXIf', exifBlock())]),
    'a jpeg with Exif appended past the end-of-image marker': Buffer.concat([
      tinyJpeg(),
      exifSegment(),
    ]),
    'a png with a text chunk': tinyPng([pngChunk('tEXt', Buffer.from('Software\0Camera App'))]),
    'a jpeg with a comment segment': tinyJpeg([
      Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0x08]), Buffer.from('Lavc62')]),
    ]),
  }

  for (const [what, buf] of Object.entries(carriers)) {
    it(`flags ${what}`, () => {
      const found = metadataIn(buf)
      assert.ok(found.readable)
      assert.ok(found.findings.length > 0, 'reported nothing')
    })
  }

  // mutation: image-metadata.gps-read-as-tiff
  it('names the GPS tags rather than just saying "metadata"', () => {
    // The report has to be actionable: which file, which tags. "Something
    // is in here" sends you to a hex editor.
    const found = metadataIn(tinyJpeg([exifSegment()]))
    assert.ok(
      found.findings.some((f) => f.includes('GPSLatitude')),
      `GPS latitude went unnamed: ${found.findings.join(', ')}`
    )
    assert.ok(
      found.findings.some((f) => f.includes('GPSLongitude')),
      `GPS longitude went unnamed: ${found.findings.join(', ')}`
    )
    assert.ok(
      found.findings.some((f) => f.endsWith('.Model')),
      'the camera model went unnamed'
    )
  })

  it('refuses to bless a format it cannot read', () => {
    const found = metadataIn(Buffer.from('not an image at all', 'utf8'))
    assert.equal(found.readable, false)
  })
})

describe('the stripper clears what the guard finds', () => {
  const dirty = {
    jpeg: tinyJpeg([exifSegment()]),
    png: tinyPng([
      pngChunk('eXIf', exifBlock()),
      pngChunk('tEXt', Buffer.from('date:create\0now')),
    ]),
  }

  for (const [format, buf] of Object.entries(dirty)) {
    it(`${format}: metadata out, picture intact`, () => {
      assert.ok(metadataIn(buf).findings.length, 'the fixture was not dirty to begin with')
      const clean = stripMetadata(buf)
      assert.deepEqual(metadataIn(clean).findings, [])
      // Same format, still decodable, and smaller by exactly the notes.
      assert.equal(metadataIn(clean).format, format)
      assert.ok(clean.length < buf.length)
    })
  }

  it('leaves an already-clean file byte-identical', () => {
    // Re-running the stripper on the shipped tree must be a no-op, or every
    // run would churn the repo and nobody would run it.
    for (const rel of images.slice(0, 12)) {
      const before = readFileSync(join(ROOT, rel))
      assert.deepEqual(stripMetadata(before), before, `${rel} changed on a second strip`)
    }
  })
})
