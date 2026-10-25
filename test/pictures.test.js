// test/pictures.test.js
// Every picture the site owns lands on the cell (BIBLE.md sections 0 and 1),
// and every photograph baked by scripts/img/bake-photos.mjs is the width the
// page shows it at: a picture rebaked at another width, or resaved off the
// cell, fails here. The kit's parts are held in test/kit.test.js, and the
// OG cards in test/og.test.js.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { PHOTOS } from '../scripts/img/bake-photos.mjs'
import { decodePng } from '../scripts/icon/png.mjs'

const ROOT = join(import.meta.dirname, '..')
const IMG = join(ROOT, 'src/static/img')
const CELL = 4

// every raster under img/, but the OG cards (1200x630 is the platforms'
// size, not ours) and the plan's pictures (one px is one world cell there)
const RASTERS = readdirSync(IMG, { recursive: true })
  .filter((f) => /\.(png|jpe?g|webp|gif|avif)$/.test(f))
  .filter((f) => !/^(og|canvas\/plan)\//.test(f))
  .sort()

describe('the pictures the site owns (BIBLE.md sections 0 and 1)', () => {
  // tripwire: the example content bakes no photographs, so the width half has nothing to hold until a fork lists one in bake-photos.mjs; the cell half is a sweep of the rasters on disk
  it('each photograph is the width the page shows it at, and every picture is whole cells', () => {
    assert.ok(RASTERS.length > 5, `only ${RASTERS.length} rasters swept from src/static/img/`)
    for (const p of PHOTOS) {
      const png = decodePng(readFileSync(join(IMG, p.file)))
      assert.equal(
        png.width,
        p.width,
        `${p.file}: baked at ${png.width}, the page shows ${p.width}`
      )
    }
    const off = RASTERS.filter((f) => {
      const { width, height } = decodePng(readFileSync(join(IMG, f)))
      return width % CELL || height % CELL
    }).map((f) => `${relative(ROOT, join(IMG, f))}`)
    assert.deepEqual(off, [], `off the ${CELL}px cell:\n  ${off.join('\n  ')}`)
  })
})
