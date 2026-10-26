// test/pixel-type.test.js
// BIBLE.md section 10: the type on the ground is pixel type, and pixel type is
// data. So its correctness is arithmetic, and this file holds it:
//
//   - every glyph is a rectangle of '.' and '#' no taller than its face's
//     cell and no wider than the face's hand allows, with ink in it
//   - the display face's A IS the maker's mark: the logo is a glyph of the
//     face, pinned pixel for pixel against MARK_A in canvas/marks.js, so the alphabet
//     can never drift from the signature it was drawn to match
//   - the display hand keeps the mark's grammar: no lone one-pixel vertical
//     in a letter's body (stems are two wide), which is what makes a word
//     read as one weight
//   - every string the canvas sets in a face has every glyph it needs; the
//     renderer refuses the rest loudly
//   - the renderer is pure and its output is the unit-square idiom with
//     crispEdges, so the browser paints pixels and nothing between them
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  FACES,
  hasGlyphs,
  missingGlyphs,
  layoutText,
  pathFor,
  pixelText,
  gridOf,
  pathFromGrid,
  lifeStep,
  pixelTitle,
} from '../primitives/pixel-type.js'
import { PX, MARK } from '../src/static/canvas/layout.js'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const MARKS = readFileSync(join(ROOT, 'src/static/canvas/marks.js'), 'utf8')

// the strings app.js sets in each face. Kept here as a list rather than
// scraped, so a new string on the ground has to come and say which hand it
// wears; scraping template literals would pass whatever happened to parse.
const SET_IN = {
  // the titles on the ground and the heads of the fans, as words
  display: [
    'About',
    'Work',
    'Contact',
    'Case Studies',
    'GitHub',
    'Hugging Face',
    'Kaggle',
    'Top Tracks',
    'Found',
  ],
  label: [
    'drag, scroll and zoom to explore',
    'the site wraps around in every direction',
    'others here',
    'other here',
    'example.com',
    '0123456789',
    'GitHub',
    'Hugging Face',
    'Threads',
    'Kaggle',
    'RSS',
    'Sample',
    'Instagram',
    'Steam',
    'GPG',
    'Mail',
    'open',
    'E-Mail',
    'Web Instruments',
    '12. Qxf2# · white wins',
    'e8=Q+ · draw',
    '23/23',
  ],
}
const MAX_W = { display: 8, label: 5 }

describe('pixel type: the faces are well-formed data', () => {
  for (const [name, face] of Object.entries(FACES)) {
    it(`${name}: every glyph is a rectangle of ink inside the cell`, () => {
      for (const [ch, g] of Object.entries(face.glyphs)) {
        assert.ok(g.length >= 1 && g.length <= face.rows, `${name} ${ch}: ${g.length} rows`)
        const w = g[0].length
        assert.ok(w >= 1 && w <= MAX_W[name], `${name} ${ch}: ${w} wide`)
        for (const row of g) {
          assert.equal(row.length, w, `${name} ${ch}: ragged row "${row}"`)
          assert.match(row, /^[.#]+$/, `${name} ${ch}: row "${row}" is not pixels`)
        }
        assert.ok(
          g.some((r) => r.includes('#')),
          `${name} ${ch} is blank`
        )
      }
    })
  }

  it('the label hand has both cases, digits and the punctuation a name needs', () => {
    const g = FACES.label.glyphs
    for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?-')
      assert.ok(ch in g, `label lacks ${ch}`)
  })

  it('the display face has the capitals and digits a title needs', () => {
    const g = FACES.display.glyphs
    for (const ch of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-')
      assert.ok(ch in g, `display lacks ${ch}`)
  })

  // mutation: pixel-type.display-no-degree
  it('the display face sets a temperature reading, degree sign included', () => {
    for (const s of ['54°', '-7°', '104°'])
      assert.ok(
        hasGlyphs(s, 'display'),
        `display cannot set "${s}": ${missingGlyphs(s, 'display')}`
      )
  })

  // mutation: pixel-type.display-a-drift
  it("the display A is the maker's mark, pixel for pixel", () => {
    // MARK_A draws on an 11-grid with a one-cell margin top and left; the
    // glyph is that drawing with the margin removed
    const m = MARKS.match(/export const MARK_A =\s*'<svg viewBox="0 0 11 11"[\s\S]*?d="([^"]+)"/)
    assert.ok(m, 'marks.js carries MARK_A on the 11-grid')
    const px = new Set(
      [...m[1].matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((x) => `${+x[1] - 1},${+x[2] - 1}`)
    )
    const glyph = new Set()
    FACES.display.glyphs.A.forEach((row, y) =>
      [...row].forEach((c, x) => c === '#' && glyph.add(`${x},${y}`))
    )
    assert.deepEqual([...glyph].sort(), [...px].sort(), 'the display A drifted from MARK_A')
    assert.equal(FACES.display.glyphs.A.length, 9)
    assert.equal(FACES.display.glyphs.A[0].length, 8)
  })

  it('the display letters keep two-pixel stems: no one-pixel stem anywhere', () => {
    // A lone '#' with ground on both sides is fine as a CUT: a beak at the end
    // of an arm, a notch under a crossbar, a corner of a diagonal. The gothic
    // cut (2026-09-11) uses those on purpose and more than one to a row (the
    // T hangs two under its arm). What the two-pixel hand forbids is a lone
    // pixel that is a STEM: inked for three rows or more in its own column.
    // So the test follows the pixel down and up, not across.
    for (const [ch, g] of Object.entries(FACES.display.glyphs)) {
      if (!/[A-Za-z0-9]/.test(ch)) continue
      const ink = (r, c) => r >= 0 && r < g.length && g[r][c] === '#'
      g.forEach((row, r) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] !== '#' || ink(r, c - 1) || ink(r, c + 1)) continue
          // a lone pixel above a two-wide stem is that stem's shoulder, not a
          // stem of its own: only rows where the pixel is still lone count
          const lone = (k) => ink(k, c) && !ink(k, c - 1) && !ink(k, c + 1)
          let run = 1
          for (let k = r - 1; lone(k); k--) run++
          for (let k = r + 1; lone(k); k++) run++
          assert.ok(run < 3, `${ch}: a one-pixel stem at row ${r} col ${c} ("${row}")`)
        }
      })
    }
  })

  // A letter is one stroke. The display h, m and n shipped with the pixel
  // that joins the shoulder to the stem missing, so the hero spelled them as
  // loose strokes. A glyph that is several pieces by design names how
  // many here; everything else is one 8-connected component.
  const PIECES = {
    display: { i: 2, j: 2, ':': 2, '!': 2, '?': 2 },
    label: { i: 2, j: 2, ':': 2, ';': 2, '!': 2, '?': 2, '"': 2, '=': 2 },
  }
  const components = (g) => {
    const seen = new Set()
    let n = 0
    g.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c !== '#' || seen.has(`${x},${y}`)) return
        n++
        const todo = [[x, y]]
        seen.add(`${x},${y}`)
        while (todo.length) {
          const [cx, cy] = todo.pop()
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = cx + dx
              const ny = cy + dy
              if (g[ny]?.[nx] !== '#' || seen.has(`${nx},${ny}`)) continue
              seen.add(`${nx},${ny}`)
              todo.push([nx, ny])
            }
        }
      })
    )
    return n
  }
  for (const [name, face] of Object.entries(FACES)) {
    // mutation: pixel-type.display-n-shoulder-loose
    it(`${name}: every glyph is one 8-connected stroke unless it names its pieces`, () => {
      for (const [ch, g] of Object.entries(face.glyphs))
        assert.equal(components(g), PIECES[name][ch] ?? 1, `${name} ${JSON.stringify(ch)}`)
    })
  }
})

describe('pixel type: the renderer', () => {
  it('sets every string the canvas uses, in the hand it wears', () => {
    for (const [face, strings] of Object.entries(SET_IN))
      for (const s of strings) {
        assert.ok(
          hasGlyphs(s, face),
          `${face} cannot set "${s}": missing ${missingGlyphs(s, face).join(' ')}`
        )
        assert.doesNotThrow(() => pixelText(s, face))
      }
  })

  it('refuses a string it cannot set, and names the holes', () => {
    // lowercase joined the face 2026-09-11, so the hole has to be a real one
    assert.throws(() => pixelText('WORK ~ play', 'display'), /no glyph for ~/)
    assert.throws(() => pixelText('é', 'label'), /no glyph for é/)
    assert.throws(() => pixelText('A', 'display', { scale: 1.5 }), /integer/)
  })

  it('advances by glyph width plus one gap, and the line owns no trailing gap', () => {
    const { run, cols } = layoutText('AI', 'display')
    assert.equal(run[0].x, 0)
    assert.equal(run[1].x, 8 + 1)
    assert.equal(cols, 9 + 4) // the redrawn I is four wide
    const sp = layoutText('A A', 'display')
    assert.equal(sp.cols, 8 + 1 + FACES.display.space + 1 + 8)
  })

  it('emits the unit-square idiom with crispEdges, fill currentColor, and its own world size', () => {
    const t = pixelText('A', 'display')
    assert.match(t.svg, /shape-rendering="crispEdges"/)
    assert.match(t.svg, /fill="currentColor"/)
    assert.match(t.svg, /aria-hidden="true"/)
    // the A is 35 pixels: 35 unit squares merged into row runs, all height 1
    assert.ok(/M\d+ \d+h\d+v1h-\d+z/.test(pathFor('A', 'display')))
    assert.equal(t.w, 8 * PX)
    // the display cell is 12 rows since the lowercase (three of descender);
    // the A keeps its nine and shares the baseline with the rest
    assert.equal(t.h, 12 * PX)
    const l = pixelText('a', 'label')
    // nine glyph rows (seven plus two descender rows) at half a cell each
    assert.equal(l.h, (9 * PX) / 2, 'a label line is nine half cells')
    assert.equal(l.w, 5 * (PX / 2))
    // scale is an integer multiple of the face pixel
    assert.equal(pixelText('A', 'display', { scale: 2 }).w, 16 * PX)
  })

  it('the path is the pixels: ink count agrees with the glyph', () => {
    const ink = FACES.display.glyphs.A.join('').split('#').length - 1
    assert.equal(ink, 35)
    const d = pathFor('A', 'display')
    const drawn = [...d.matchAll(/h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0)
    assert.equal(drawn, ink)
  })

  it('is pure: same input, same output', () => {
    assert.equal(pixelText('WORK', 'display').svg, pixelText('WORK', 'display').svg)
  })

  it('the mark is eleven cells: the glyph plus its margin', () => {
    assert.equal(MARK, 11 * PX)
  })
})

describe('pixel type: the buffer as a buffer', () => {
  it('a grid of a line draws back to the same path when unpadded', () => {
    // the same runs, in row order rather than glyph order
    const segs = (d) => d.match(/M\d+ \d+h\d+v1h-\d+z/g).sort()
    assert.deepEqual(
      segs(pathFromGrid(gridOf('WORK', 'display', 0))),
      segs(pathFor('WORK', 'display'))
    )
    const g = gridOf('A', 'display', 2)
    assert.equal(g.length, 12 + 4)
    assert.equal(g[0].length, 8 + 4)
    assert.equal(g.flat().filter(Boolean).length, 35, 'the padded grid holds the same 35 pixels')
  })

  it('life: a blinker oscillates and a block stands still', () => {
    const o = false
    const X = true
    const blinker = [
      [o, o, o, o, o],
      [o, o, X, o, o],
      [o, o, X, o, o],
      [o, o, X, o, o],
      [o, o, o, o, o],
    ]
    const once = lifeStep(blinker)
    assert.deepEqual(once[2], [o, X, X, X, o])
    assert.deepEqual(lifeStep(once), blinker)
    const block = [
      [o, o, o, o],
      [o, X, X, o],
      [o, X, X, o],
      [o, o, o, o],
    ]
    assert.deepEqual(lifeStep(block), block)
  })

  it('life is pure and never grows the grid', () => {
    const g = gridOf('ABOUT', 'display', 2)
    const before = JSON.stringify(g)
    const n = lifeStep(g)
    assert.equal(JSON.stringify(g), before)
    assert.equal(n.length, g.length)
    assert.equal(n[0].length, g[0].length)
  })
})

describe('pixel type: the title that wraps where it stands', () => {
  it('sets one svg a word at the face pitch, and keeps the words readable', () => {
    const html = pixelTitle('NAO robot embodying AI', 'display', { tag: 'h1' })
    assert.match(html, /^<h1 class="ptitle ptitle-display"/)
    const words = [
      ...html.matchAll(
        /<svg class="pw" viewBox="0 0 (\d+) (\d+)" width="(\d+)" height="(\d+)" style="--c:(\d+);--r:(\d+)"/g
      ),
    ]
    assert.equal(words.length, 4)
    for (const [, c, r, w, h, vc, vr] of words) {
      // the attributes are the face's own pitch: a title with no stylesheet
      // still draws on the cell, and --c/--r agree with the viewBox
      assert.equal(+w, +c * FACES.display.px)
      assert.equal(+h, +r * FACES.display.px)
      assert.equal(vc, c)
      assert.equal(vr, r)
    }
    assert.match(html, /<span class="px-vh">NAO robot embodying AI<\/span><\/h1>$/)
  })

  it('refuses a title it cannot set rather than dropping a glyph', () => {
    assert.throws(() => pixelTitle('café', 'display'), /no glyph for é/)
  })
})
