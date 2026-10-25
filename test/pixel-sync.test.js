// test/pixel-sync.test.js
// BIBLE.md section 10 (the pixel hand), mechanized. Three rules:
//
//   (a) The identity mark is one drawing, hand-copied to two surfaces
//       (favicon.svg, and MARK_A in canvas/marks.js, which the canvas and the
//       OG cards both draw). The icon tool is the only mint, but these are
//       inlined by hand, so a re-mint that updates one and not the other
//       ships a split-brain logo. Pin the two `d` strings identical, and keep
//       the OG cards on the one constant rather than a copy of their own.
//   (b) Every inline pixel SVG that draws with the unit-square idiom
//       (`h1v1h-1z`, one path square per pixel) carries shape-rendering
//       crispEdges, so it stays sharp at fractional raster sizes. The rule
//       keys on the IDIOM rather than on "every svg", which is what lets the
//       stroke-drawn SOURCES (the sky, the bulb, the octicon) stay in the file
//       as sources: since 2026-09-15 none of them is served as drawn, they are
//       rasterised through app.js pixelGlyph and it is the rasteriser's own
//       output, unit squares with crispEdges on it, that reaches the page.
//   (c) The dither frames exist (0..5) and lay down strictly more ink each
//       step, so the material-change mask really is a progression.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

const UNIT_SQUARE = 'h1v1h-1z'
const pathD = (block) => {
  const m = block.match(/<path[^>]*\bd="([^"]+)"/)
  return m ? m[1] : null
}
// each <svg>...</svg> block (no nested svgs on these surfaces)
const svgBlocks = (text) => [...text.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((m) => m[0])
const openTag = (svg) => svg.slice(0, svg.indexOf('>') + 1)

describe('the pixel hand (BIBLE.md section 10)', () => {
  // mutation: pixel-sync.favicon-remint-drift, pixel-sync.og-own-mark
  it('(a) the logo mark is one drawing across the canvas, favicon.svg, the OG cards', () => {
    // The one drawing is the MARK_A constant, and the OG cards must actually
    // USE it rather than merely declare it: a pinned constant nothing reaches
    // for is a drawing that has quietly left the site.
    const markBlock = read('src/static/canvas/marks.js').match(
      /export const MARK_A =\s*'([\s\S]*?)'/
    )
    assert.ok(markBlock, 'marks.js carries the MARK_A identity drawing')
    const stampD = pathD(markBlock[1])

    const favD = pathD(read('src/static/favicon.svg'))

    // the OG cards draw that constant, not a copy of it
    const cards = read('scripts/og/cards.mjs')
    assert.match(
      cards,
      /import \{[^}]*\bMARK_A\b[^}]*\} from '..\/..\/src\/static\/canvas\/marks\.js'/
    )
    assert.doesNotMatch(cards, /viewBox="0 0 11 11"/, 'the OG cards carry a mark of their own')
    assert.ok(
      (cards.match(/\bMARK_A\b/g) || []).length > 1,
      'nothing draws MARK_A any more; the identity is a constant nobody reads'
    )

    assert.ok(stampD && favD, 'each surface has a logo path with a d attribute')
    assert.equal(favD, stampD, 'favicon.svg logo path drifted from the canvas stamp')

    // (the bar's home button, which wore the icon tool's HOME variant, left with
    // the menu on 2026-09-10: the bar is the field, BIBLE.md section 8)
    assert.ok(
      !read('src/templates/canvas/home.njk').includes('id="logo"'),
      'the bar carries no home button any more'
    )
  })

  // mutation: pixel-sync.mark-soft-edges
  it('(b) every unit-square pixel SVG carries crispEdges', () => {
    const surfaces = [
      'src/templates/canvas/home.njk',
      'src/static/canvas/app.js', // 24-grid glyphs are rect/polygon art, not this idiom; scanned so a future pixel path arrives guarded
      'src/static/canvas/marks.js',
    ]
    const misses = []
    let pixelSvgCount = 0
    for (const rel of surfaces) {
      for (const svg of svgBlocks(read(rel))) {
        if (!svg.includes(UNIT_SQUARE)) continue
        pixelSvgCount += 1
        if (!/shape-rendering="crispEdges"/.test(openTag(svg))) misses.push(rel)
      }
    }
    assert.deepEqual(misses, [], `pixel SVGs missing crispEdges in: ${misses.join(', ')}`)
    // guard the guard: the logo and the dock's own glyphs must be here, so
    // the assertion above can never pass by the marks vanishing.
    assert.ok(pixelSvgCount >= 3, `expected the identity marks; found ${pixelSvgCount}`)
  })

  // mutation: pixel-sync.dither-frame-duplicated
  it('(c) dither-0..5 exist and lay down strictly more ink each frame', () => {
    const cells = []
    for (let k = 0; k <= 5; k++) {
      const rel = `src/static/img/dither-${k}.svg`
      assert.ok(existsSync(join(ROOT, rel)), `missing ${rel}`)
      cells.push((read(rel).match(/h1v1h-1z/g) || []).length)
    }
    assert.equal(cells[0], 0, 'dither-0 is bare ground')
    for (let k = 1; k <= 5; k++) {
      assert.ok(
        cells[k] > cells[k - 1],
        `dither-${k} (${cells[k]}) must add ink over ${cells[k - 1]}`
      )
    }
  })
})
