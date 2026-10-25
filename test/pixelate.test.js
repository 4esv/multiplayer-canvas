// test/pixelate.test.js
// scripts/img/pixelate.mjs: a picture in, sprite rows out. The pictures here
// are synthetic (built with the repo's own PNG encoder), so the right answer
// is known cell for cell and nothing with a licence is vendored to test on.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deflateSync } from 'node:zlib'

import { encodePng, decodePng } from '../scripts/icon/png.mjs'
import {
  pixelate,
  formatRows,
  readPalette,
  trimRows,
  rowsToPng,
  ACCENTS,
} from '../scripts/img/pixelate.mjs'

const palette = readPalette()

// a w x h picture at `scale` px a cell, painted by cell(x, y) -> [r, g, b, a]
function picture(w, h, scale, cell) {
  const rgba = Buffer.alloc(w * scale * h * scale * 4)
  for (let y = 0; y < h * scale; y++)
    for (let x = 0; x < w * scale; x++)
      rgba.set(cell(Math.floor(x / scale), Math.floor(y / scale)), (y * w * scale + x) * 4)
  return { width: w * scale, height: h * scale, rgba }
}

describe('pixelate: the PNG decoder', () => {
  it('round-trips the encoder', () => {
    const src = picture(5, 3, 2, (x, y) => [x * 40, y * 80, 200, (x + y) % 2 ? 255 : 0])
    const back = decodePng(encodePng(src.width, src.height, src.rgba))
    assert.equal(back.width, src.width)
    assert.equal(back.height, src.height)
    assert.deepEqual(back.rgba, src.rgba)
  })

  it('undoes every scanline filter (a hand-built RGB file, one filter a row)', () => {
    // 3 x 5, RGB, rows filtered None, Sub, Up, Average, Paeth over known pixels
    const w = 3
    const px = [...Array(5)].map((_, y) => [...Array(w * 3)].map((_, i) => (y * 37 + i * 11) % 256))
    const raw = []
    px.forEach((row, y) => {
      raw.push(y)
      row.forEach((v, i) => {
        const a = i >= 3 ? row[i - 3] : 0
        const b = y ? px[y - 1][i] : 0
        const c = i >= 3 && y ? px[y - 1][i - 3] : 0
        const p = a + b - c
        const paeth =
          Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
            ? a
            : Math.abs(p - b) <= Math.abs(p - c)
              ? b
              : c
        raw.push((v - [0, a, b, (a + b) >> 1, paeth][y] + 256) % 256)
      })
    })
    // borrow the encoder's framing: encode a dummy, then swap IHDR colour type and IDAT
    const dummy = encodePng(w, 5, Buffer.alloc(w * 5 * 4))
    const chunks = []
    for (let at = 8; at < dummy.length;) {
      const len = dummy.readUInt32BE(at)
      chunks.push({
        type: dummy.toString('ascii', at + 4, at + 8),
        data: Buffer.from(dummy.subarray(at + 8, at + 8 + len)),
      })
      at += 12 + len
    }
    chunks[0].data[9] = 2
    chunks[1].data = deflateSync(Buffer.from(raw))
    const file = Buffer.concat([
      dummy.subarray(0, 8),
      ...chunks.map(({ type, data }) => {
        const out = Buffer.alloc(12 + data.length)
        out.writeUInt32BE(data.length, 0)
        out.write(type, 4, 'ascii')
        data.copy(out, 8)
        return out // the decoder does not check CRCs, so the zeroes stand
      }),
    ])
    const { rgba } = decodePng(file)
    px.forEach((row, y) => {
      for (let x = 0; x < w; x++)
        assert.deepEqual(
          [...rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 3)],
          row.slice(x * 3, x * 3 + 3),
          `row ${y}`
        )
    })
  })
})

describe('pixelate: quantise to the cell and the palette', () => {
  // ink frame, brick inside, one ground cell, transparent corner; colours a
  // little OFF the tokens, the way a photo's are
  const near = ([r, g, b]) => [r + 9, g - 7, b + 5, 255]
  const art = ['.kkk', 'kbbk', 'kbpk', 'kkkk']
  const src = picture(4, 4, 8, (x, y) => {
    const ch = art[y][x]
    return ch === '.' ? [0, 0, 0, 0] : near(palette[{ k: 'ink', b: 'brick', p: 'ground' }[ch]])
  })

  it('finds the rows, and the accent, without being told', () => {
    const { rows, accent } = pixelate(src, { cells: 4 })
    assert.equal(accent, 'brick')
    assert.deepEqual(rows, art)
  })

  it('a named accent is the only accent: the brick lands on the nearest of ink, ground, ochre', () => {
    const { rows } = pixelate(src, { cells: 4, accent: 'ochre' })
    assert.ok(
      rows.every((r) => /^[.kpo]+$/.test(r)),
      rows.join('|')
    )
    assert.ok(!rows.join('').includes('b'))
  })

  // mutation: pixelate.quarter-cover-lights
  it('boxes down: a cell is lit when the picture covers half of it', () => {
    // 8 px wide, left 5 px opaque: at 2 cells the left cell is whole, the right is 1/4
    const half = picture(8, 4, 1, (x) => (x < 5 ? [...palette.ink, 255] : [0, 0, 0, 0]))
    assert.deepEqual(pixelate(half, { cells: 2 }).rows, ['k.'])
  })

  it('--outline rings a flat silhouette in ink, one cell', () => {
    const blob = picture(5, 5, 4, (x, y) =>
      x && y && x < 4 && y < 4 ? [...palette.ochre, 255] : [0, 0, 0, 0]
    )
    assert.deepEqual(pixelate(blob, { cells: 5, outline: true }).rows, [
      '.....',
      '.kkk.',
      '.kok.',
      '.kkk.',
      '.....',
    ])
  })

  it('--key drops an opaque background by its top-left colour', () => {
    const onWhite = picture(3, 3, 4, (x, y) =>
      x === 1 && y === 1 ? [...palette.ink, 255] : [255, 255, 255, 255]
    )
    assert.deepEqual(pixelate(onWhite, { cells: 3, key: true }).rows, ['...', '.k.', '...'])
  })

  // mutation: pixelate.flood-global
  it('--flood drops only the background that reaches the edge', () => {
    // a white field, an ink ring, and white INSIDE the ring (a drum head)
    const ring = ['.....', '.kkk.', '.k.k.', '.kkk.', '.....']
    const src = picture(5, 5, 4, (x, y) =>
      ring[y][x] === 'k' ? [...palette.ink, 255] : [255, 255, 255, 255]
    )
    assert.deepEqual(pixelate(src, { cells: 5, key: true }).rows, ring)
    assert.deepEqual(pixelate(src, { cells: 5, key: true, flood: true }).rows[2], '.kpk.')
  })

  it('--flood follows a checkerboard someone baked in, at a tolerance', () => {
    // 255 / 238 greys alternating, the "transparent" PNG a download ships
    const board = picture(6, 6, 2, (x, y) => {
      if (x > 1 && x < 4 && y > 1 && y < 4) return [...palette.brick, 255]
      const v = (x + y) % 2 ? 238 : 255
      return [v, v, v, 255]
    })
    assert.deepEqual(pixelate(board, { cells: 6, key: 40, flood: true, accent: 'brick' }).rows, [
      '......',
      '......',
      '..bb..',
      '..bb..',
      '......',
      '......',
    ])
  })

  // mutation: pixelate.dither-flat
  it('--dither orders a mid-tone into both inks, half and half, on the Bayer matrix', () => {
    // halfway from the ground to the brick: those two are its nearest inks
    const mid = palette.brick.map((v, i) => Math.round((v + palette.ground[i]) / 2))
    const field = picture(8, 8, 1, () => [...mid, 255])
    const flat = pixelate(field, { cells: 8, accent: 'brick' }).rows.join('')
    const dith = pixelate(field, { cells: 8, accent: 'brick', dither: true }).rows.join('')
    assert.equal(new Set(flat).size, 1, 'undithered, a flat field is one ink')
    const count = (ch) => [...dith].filter((c) => c === ch).length
    assert.equal(count('b') + count('p'), 64, 'dithered between its two nearest inks only')
    assert.ok(Math.abs(count('b') - 32) <= 4, `about half brick: ${count('b')} of 64`)
    // ordered, not random: the same field twice is the same cells
    assert.equal(dith, pixelate(field, { cells: 8, accent: 'brick', dither: true }).rows.join(''))
  })

  it('reads its colours from canvas-tokens.css and refuses an accent that is not one', () => {
    assert.deepEqual(Object.keys(palette).sort(), ['ink', 'ground', ...Object.keys(ACCENTS)].sort())
    assert.throws(() => pixelate(src, { cells: 4, accent: 'teal' }), /no accent called teal/)
    assert.throws(() => readPalette(':root { --cv-ink: #000000; }'), /--cv-ground/)
  })

  it('--trim drops the empty border, and only the border', () => {
    assert.deepEqual(trimRows(['....', '.k..', '..b.', '....']), ['k.', '.b'])
    assert.deepEqual(trimRows(['....']), ['....'], 'an empty picture is left alone')
  })

  it('--png writes each cell as a scale x scale square, an empty cell transparent', () => {
    const { png, width, height } = rowsToPng(['kb', '.p'], { scale: 3, accent: 'brick', palette })
    assert.deepEqual([width, height], [6, 6])
    const { rgba } = decodePng(png)
    const at = (x, y) => [...rgba.subarray((y * 6 + x) * 4, (y * 6 + x) * 4 + 4)]
    assert.deepEqual(at(2, 2), [...palette.ink, 255])
    assert.deepEqual(at(3, 0), [...palette.brick, 255])
    assert.deepEqual(at(5, 5), [...palette.ground, 255])
    assert.equal(at(1, 4)[3], 0)
    // and back through the quantiser at its own cells, it is the same rows
    assert.deepEqual(pixelate(decodePng(png), { cells: 2, accent: 'brick' }).rows, ['kb', '.p'])
  })

  it('prints the rows in the checked-in form', () => {
    assert.equal(formatRows(['.k', 'k.'], 'DOT'), "export const DOT = [\n  '.k',\n  'k.',\n]")
  })
})
