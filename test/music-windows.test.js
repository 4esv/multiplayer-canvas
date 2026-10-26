// test/music-windows.test.js
// Windows on the ground, held (BIBLE.md sections 2, 5, 8 and 9):
//
//   - the kit's marquee: a line longer than its box walks a cell a step on
//     the one cadence and waits otherwise; the lines of a list take turns;
//     under reduced motion nothing walks
//   - the finder in the address: the bar's state REPLACES the entry, and a
//     URL carrying `?search=` is the canvas with a bare canonical
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cssRules } from './lib/cascade.js'
import { marqueeRun, marqueeMarkup } from '../primitives/kit/kit-marquee.js'
import { build } from '../src/server.js'
import site from '../site.config.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const KIT = read('primitives/kit/kit.css')
const APP = read('src/static/canvas/app.js')
const KIT_RULES = cssRules(KIT)
const declIn = (rules, sel, prop) =>
  rules
    .filter((r) => r.selectors.some((s) => s.trim() === sel))
    .flatMap((r) => r.decls)
    .find((d) => d.prop === prop)?.value
// a top-level function's source
const fn = (open) => {
  const i = APP.indexOf(open)
  assert.ok(i > -1, `${open} is gone`)
  return APP.slice(i, APP.indexOf('\n}\n', i))
}
// the recent tile's branch in mkTile

describe('the marquee (kit.css .k-marquee, primitives/kit/kit-marquee.js)', () => {
  it('a line walks whole cells: the distance is the overflow rounded up to the cell', () => {
    assert.equal(marqueeRun(100, 100), null, 'a line that fits walks')
    assert.equal(marqueeRun(100.4, 100), null, 'a subpixel overflow walks')
    assert.equal(marqueeRun(50, 0), null, 'a box with no size (off camera) was measured')
    assert.deepEqual(marqueeRun(101, 100), { d: 4, n: 1 })
    assert.deepEqual(marqueeRun(228, 100), { d: 128, n: 32 })
    assert.deepEqual(marqueeRun(229, 100), { d: 132, n: 33 })
    // the markup escapes what it carries and states its turn
    assert.equal(
      marqueeMarkup('R&B <3', { cls: 'tt', i: 3 }),
      '<span class="k-marquee tt" style="--mq-i:3"><span class="k-mq">R&amp;B &lt;3</span></span>'
    )
  })

  // mutation: music-windows.marquee-glides, music-windows.marquee-own-clock
  it('a longer line walks a cell a step on the one cadence, a tenth of it apart', () => {
    const anim = declIn(KIT_RULES, '.k-marquee.is-over .k-mq', 'animation') || ''
    assert.match(
      anim,
      /^k-marquee var\(--cv-dur-marquee\) steps\(var\(--mq-n, 1\), end\) infinite$/
    )
    assert.equal(
      declIn(KIT_RULES, '.k-marquee.is-over .k-mq', 'animation-delay'),
      'calc(var(--cv-dur-marquee) * var(--mq-i, 0) / 10)'
    )
    // the walk is sideways and ends where the line's end shows
    const kf = KIT.slice(KIT.indexOf('@keyframes k-marquee'))
    assert.match(kf, /translateX\(calc\(-1 \* var\(--mq-d, 0px\)\)\)/)
    // a line that fits is clipped with an ellipsis and never animates
    assert.equal(declIn(KIT_RULES, '.k-marquee', 'text-overflow'), 'ellipsis')
    assert.equal(declIn(KIT_RULES, '.k-marquee .k-mq', 'animation'), undefined)
  })

  // mutation: music-windows.marquee-walks-reduced
  it('under reduced motion nothing walks and the line ends in an ellipsis', () => {
    const at = KIT.indexOf('.k-marquee.is-over .k-mq {\n    display: inline;')
    assert.ok(at > -1, 'the reduced-motion marquee rule is gone')
    const block = KIT.slice(
      KIT.lastIndexOf('@media (prefers-reduced-motion: reduce)', at),
      at + 200
    )
    assert.match(block, /\.k-marquee\.is-over \.k-mq \{\s*display: inline;\s*animation: none;/)
    assert.match(block, /\.k-marquee\.is-over \{\s*text-overflow: ellipsis;/)
  })
})

describe('the finder in the address', () => {
  // mutation: music-windows.finder-pushes
  it('the bar replaces the entry it is on, never pushes one', () => {
    const w = fn('function addressSearch(){')
    assert.match(
      w,
      /history\.replaceState\(history\.state, '', location\.pathname \+ next \+ location\.hash\)/
    )
    assert.doesNotMatch(w, /pushState/)
    assert.match(w, /withSearch\(location\.search, q\)/)
  })

  describe('served', () => {
    let app
    before(async () => {
      app = await build({ logger: false })
      await app.ready()
    })
    after(async () => app.close())

    for (const url of ['/?search=slime', '/?search=', '/?search=case%20studies&diag']) {
      it(`GET ${url} is the canvas, canonical to the bare page`, async () => {
        const r = await app.inject({
          method: 'GET',
          url,
          headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120' },
        })
        assert.equal(r.statusCode, 200)
        assert.match(r.body, /id="boot"/)
        assert.ok(r.body.includes(`<link rel="canonical" href="${site.url}/">`), 'canonical')
        assert.ok(!r.body.includes('search=slime'), 'the query is echoed into the page')
      })
    }
  })
})
