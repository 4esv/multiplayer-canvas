// test/stacks.test.js
// BIBLE.md section 5: a collection is one tile, a stack, and fans out as a
// route. The arithmetic behind that, held:
//
//   - every member names a stack that exists; no member is also a world tile;
//     ids are unique across both tables
//   - the declared footprint of every stack holds its composition (front
//     card, the pile's step, the label block) on the cell lattice
//   - the fan fits its cards into every viewport in the matrix without a
//     scroll for the collections that exist, and never scales a card past
//     reading
//   - the routes: each stack answers to its path, a case study's path is the
//     work fan, and nothing else fans
//   - the server serves each fan as a page with the furniture every page
//     carries, and as a list for curl
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  TILES,
  MEMBERS,
  STACKS,
  FRONT_OF,
  PILE,
  PX,
  M,
  dims,
  pileGeometry,
  countLine,
  stackFits,
  FAN,
  fanLayout,
  stackForPath,
  STACK_ROUTES,
  chromeBand,
} from '../src/static/canvas/layout.js'
import site from '../site.config.js'
import { FIXTURES } from './fixtures.js'
import { build } from '../src/server.js'

const MATRIX = [
  [184, 224],
  [205, 251],
  [320, 568],
  [390, 844],
  [768, 1024],
  [1440, 900],
  [1800, 900],
  [3840, 1100],
]

describe('stacks: the tables', () => {
  it('the case studies are a stack, and every member belongs to one', () => {
    assert.ok(
      STACKS.some((s) => s.id === 'work'),
      'the case studies are a pile'
    )
    const ids = new Set(STACKS.map((s) => s.id))
    for (const m of MEMBERS)
      assert.ok(ids.has(m.stack), `${m.id} names a stack that does not exist: ${m.stack}`)
    for (const s of STACKS)
      assert.ok(
        MEMBERS.some((m) => m.stack === s.id),
        `${s.id} holds nothing, so its pile has no front card`
      )
  })

  it('ids are unique across the world and the members, and a member is never seated', () => {
    const all = [...TILES.map((t) => t.id), ...MEMBERS.map((m) => m.id)]
    assert.equal(new Set(all).size, all.length, 'duplicate id')
    for (const m of MEMBERS) assert.ok(!TILES.some((t) => t.id === m.id))
  })

  it('every stack states the shape of its front card, and the members agree', () => {
    for (const s of STACKS) {
      const front = FRONT_OF[s.id]
      assert.ok(front, `${s.id} has no front shape`)
      const ms = MEMBERS.filter((m) => m.stack === s.id)
      for (const m of ms)
        assert.deepEqual(
          { mw: m.mw, mh: m.mh },
          { mw: front.mw, mh: front.mh },
          `${m.id} is not the shape of its stack's front`
        )
    }
  })
})

// a stack with a ground face of its own (layout.js `face`) stands no pile
const PILES = STACKS.filter((s) => !s.face)

describe('stacks: the pile fits its footprint on the lattice', () => {
  for (const s of PILES) {
    it(`${s.id}: ${s.mw}x${s.mh} holds the front card, the pile and the label`, () => {
      assert.ok(stackFits(s), `${s.id} overflows its footprint`)
      const g = pileGeometry(s)
      const foot = dims(s)
      // (the footprint is declared from the vocabulary, the snap, so it is
      // not tight around the composition; the composition centres in it)
      // the card keeps its member's shape, on a module of whole cells no
      // larger than M
      const f = dims(FRONT_OF[s.id])
      assert.equal(g.card.w * f.h, g.card.h * f.w, `${s.id}: the card is not its member's shape`)
      assert.equal((g.card.w / (f.w / M)) % PX, 0, `${s.id}: the card's module is off the cell`)
      assert.ok(g.card.w <= f.w, `${s.id}: the card is larger than its member`)
      // everything on the cell lattice
      for (const p of [g.front, ...g.backs, g.label, g.block])
        for (const v of [p.x, p.y]) assert.equal(v % PX, 0, `${s.id}: ${v} is off the cell`)
      // the backs step one even vector, PILE.step per card, down and to
      // the right along the cast: the front card is the top of the pile
      g.backs.forEach((b, i) => {
        assert.equal(b.x - g.front.x, (i + 1) * PILE.step)
        assert.equal(b.y - g.front.y, (i + 1) * PILE.step)
      })
      assert.ok(g.block.w <= foot.w && g.block.h <= foot.h)
    })
  }

  // The stacks shipped here hold a 5 x 5 front in an 8 x 8 footprint, which
  // holds the card at its member's own size, so the cut is never exercised by
  // them. A shelf, an 8 x 5 member in an 8 x 5 footprint, is the case where
  // the card has to come down to the module the footprint holds.
  // mutation: stacks.pile-card-at-member-size
  it('a pile whose member is as big as its footprint draws its card smaller, on the module', () => {
    const shelf = { mw: 8, mh: 5 }
    const f = dims(shelf)
    const g = pileGeometry(shelf, f)
    const foot = dims(shelf)
    assert.ok(g.card.w < f.w, 'the card is drawn at its member size')
    assert.equal(g.card.w * f.h, g.card.h * f.w, "the card is not its member's shape")
    assert.equal((g.card.w / (f.w / M)) % PX, 0, "the card's module is off the cell")
    assert.ok(g.block.x >= 0 && g.block.y >= 0, 'the block starts outside the footprint')
    assert.ok(g.block.x + g.block.w <= foot.w, 'the pile runs past its footprint')
    assert.ok(g.block.y + g.block.h <= foot.h, 'the pile runs past its footprint')
    assert.ok(g.pager.x + PILE.pagerW <= foot.w, 'the pager hangs out of the footprint')
  })

  it('every pile sits the same way: the front floats over the base (2026-09-11)', () => {
    // one physics for every stack, the cast's: the deepest back is the
    // lowest and rightmost, the front the highest and leftmost
    for (const s of PILES) {
      const g = pileGeometry(s)
      const base = g.backs[g.backs.length - 1]
      assert.ok(
        base.x > g.front.x && base.y > g.front.y,
        `${s.id}: the pile is not under its front`
      )
      assert.deepEqual(pileGeometry(s), pileGeometry(s))
    }
  })
})

describe('stacks: the count under the name', () => {
  // mutation: stacks.count-ignores-one
  it('every pile counts in its own noun, in Title Case, and a pile of one in the singular', () => {
    for (const s of STACKS) assert.ok(s.count, `${s.id} has no count noun`)
    const by = Object.fromEntries(STACKS.map((s) => [s.id, s]))
    assert.equal(countLine(by.work, 6), '6 Studies')
    assert.equal(countLine(by.work, 1), '1 Study')
    assert.equal(countLine({ count: 'notebooks' }, 1), '1 Notebooks', 'no singular, no guess')
    // the label block holds two lines of the type face, and every pile
    // still fits its footprint with it (the lattice suite above)
    assert.equal(PILE.labelH, 2 * 6 * PX)
  })

  // mutation: stacks.count-dropped, stacks.count-in-ink
  it('the pile sets the count on its own line under the name, same face and size, one step dimmer', () => {
    const app = readFileSync(join(import.meta.dirname, '../src/static/canvas/app.js'), 'utf8')
    const css = readFileSync(join(import.meta.dirname, '../src/static/css/canvas-home.css'), 'utf8')
    const at = app.indexOf('function buildStack(t, n){')
    const build = app.slice(at, app.indexOf('\n}\n', at))
    assert.match(build, /const count = countLine\(t, defs\.length\);/)
    assert.match(
      build,
      /<div class="name k-lbl">\$\{esc\(t\.label\)\}<\/div>\$\{count \? `<div class="count k-lbl">\$\{esc\(count\)\}<\/div>` : ''\}/
    )
    // the accessible name still says what the pile holds and how many; the
    // pile is the press, never the tile that holds its scrollbar too
    assert.match(
      build,
      /keyable\(pile, `\$\{t\.label\}: \$\{count \|\| defs\.length\}, open the collection`/
    )
    assert.match(
      css,
      /\.t-stack \.slabel \{[^}]*flex-direction: column;/,
      'the count is not under the name'
    )
    assert.match(
      css,
      /\.t-stack \.slabel \.count \{\s*color: var\(--cv-mute\);/,
      'the count is not a step dimmer'
    )
  })
})

describe('stacks: the fan fits the frame', () => {
  const held = (id) => MEMBERS.filter((m) => m.stack === id).length
  // the pile as it ships, and the piles a site grows into: six and ten
  // small squares, and six shelves (the 8 x 5, the widest card shape)
  const sizes = {
    work: [held('work'), dims(FRONT_OF.work)],
    'six studies': [6, dims({ mw: 5, mh: 5 })],
    'ten studies': [10, dims({ mw: 5, mh: 5 })],
    'six shelves': [6, dims({ mw: 8, mh: 5 })],
  }
  for (const [id, [n, d]] of Object.entries(sizes)) {
    it(`${id}: ${n} cards fit every viewport, or scroll at a readable size`, () => {
      for (const [vw, vh] of MATRIX) {
        const L = fanLayout(n, d.w, d.h, vw, vh, chromeBand(vw, vh))
        assert.equal(L.slots.length, n)
        assert.ok(L.cols >= 1 && L.rows * L.cols >= n)
        assert.ok(L.s <= 1 + 1e-9, 'never past true scale')
        // readable, or a single column on a frame too narrow for a readable card
        assert.ok(
          L.s >= FAN.minScale - 1e-9 || L.cols === 1,
          `${vw}x${vh}: cards shrink to ${L.s.toFixed(2)} across ${L.cols} columns`
        )
        // a phone scrolls the collection at a readable size in one column,
        // a card at true size where the width holds it and at the width's
        // scale where it does not (the snap: a shelf is 384, the phone 390)
        if (vw === 390 && n >= 4) {
          assert.ok(L.scrolls && L.s >= FAN.minScale - 1e-9, `${vw}: ${L.cols} cols at ${L.s}`)
          const s = Math.min(1, (vw - 2 * FAN.margin) / d.w)
          assert.ok(L.cols === 1 && Math.abs(L.s - s) < 1e-9, `${vw}: ${L.cols} cols at ${L.s}`)
        }
        for (const sl of L.slots) {
          assert.ok(sl.x >= 0 && sl.x + sl.w <= vw + 1e-6, `${vw}x${vh}: a card runs off the side`)
          assert.ok(sl.y >= 0, 'a card starts above the frame')
        }
        // no overlap between slots
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            const a = L.slots[i]
            const b = L.slots[j]
            const apart =
              a.x + a.w <= b.x + 1e-6 ||
              b.x + b.w <= a.x + 1e-6 ||
              a.y + a.h <= b.y + 1e-6 ||
              b.y + b.h <= a.y + 1e-6
            assert.ok(apart, `${vw}x${vh}: slots ${i} and ${j} overlap`)
          }
        // a desktop holds every collection without scrolling
        if (vw >= 1440) assert.ok(!L.scrolls, `${vw}x${vh}: ${id} scrolls on a desktop`)
      }
    })
  }

  // mutation: stacks.lane-past-margins
  it("a phone's lane holds every member whole between the margins, and opens on a centred card", () => {
    // the lane sizes its row by the height, and a card is never wider than
    // the frame between its margins: an 8 x 5 shelf is 384, a phone 390, and
    // at true size the first shelf ran 18px off the screen's edge
    // (the shipped fronts are 5 x 5, which the height binds first, so the
    // 8 x 5 shelf is walked as well: it is the shape the width binds)
    for (const [vw, vh] of MATRIX.filter(([w]) => w < 768)) {
      for (const f of [...Object.values(FRONT_OF), { mw: 8, mh: 5 }]) {
        const d = dims(f)
        const L = fanLayout(6, d.w, d.h, vw, vh, chromeBand(vw, vh), true)
        for (const sl of L.slots)
          assert.ok(sl.w <= vw - 2 * FAN.margin + 1e-6, `${vw}: a ${d.w} card is ${sl.w} wide`)
        const first = L.slots[0]
        assert.ok(Math.abs(first.x + first.w / 2 - vw / 2) < 1, `${vw}: the lane opens off centre`)
      }
    }
  })

  // mutation: stacks.fan-ties-to-more-rows
  it('prefers the arrangement with the largest cards, ties to fewer rows', () => {
    const L = fanLayout(6, 288, 288, 1440, 900, 76)
    assert.equal(L.cols, 3)
    assert.equal(L.rows, 2)
    // one card alone is centred and at true scale on a laptop
    const one = fanLayout(1, 288, 288, 1440, 900, 76)
    assert.equal(one.s, 1)
    assert.ok(Math.abs(one.slots[0].x + 144 - 720) < 1)
    // a real tie: four small cards fit at true scale in any arrangement, so
    // the scale cannot choose and the row count has to
    const tie = fanLayout(4, 100, 100, 1440, 900, 76)
    assert.equal(tie.s, 1)
    assert.equal(tie.rows, 1, 'a tie on scale went to more rows')
  })
})

describe('stacks: the routes', () => {
  it('each stack answers to its path, and a case study is the work fan', () => {
    for (const s of STACKS) assert.equal(stackForPath(s.route), s.id)
    assert.equal(stackForPath(`/work/${FIXTURES.caseStudy}`), 'work')
    assert.equal(stackForPath(`/work/${FIXTURES.caseStudy}/`), 'work')
    for (const p of [
      '/',
      '/feed',
      '/about',
      `/feed/${FIXTURES.article}`,
      `/${FIXTURES.experiment}`,
      '/works',
      '/case-studies/x',
    ])
      assert.equal(stackForPath(p), null, `${p} fans`)
    assert.deepEqual(Object.keys(STACK_ROUTES).sort(), ['/case-studies'])
  })

  describe('served', () => {
    let app
    before(async () => {
      app = await build({ logger: false })
      await app.ready()
    })
    after(async () => app.close())

    for (const s of STACKS) {
      it(`GET ${s.route} is the canvas with the ${s.id} fan in the boot payload`, async () => {
        const r = await app.inject({
          method: 'GET',
          url: s.route,
          headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120' },
        })
        assert.equal(r.statusCode, 200)
        const boot = r.body.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)
        assert.ok(boot, 'the canvas ships its boot payload')
        assert.equal(JSON.parse(boot[1]).fan, s.id)
        assert.ok(!/class="open[ "]/.test(r.body), 'no sheet is SSRd open: the fan is the page')
        assert.ok(r.body.includes(`href="${site.url}${s.route}"`), 'canonical')
      })

      it(`GET ${s.route} for curl is the collection as a list`, async () => {
        const r = await app.inject({
          method: 'GET',
          url: s.route,
          headers: { 'user-agent': 'curl/8.4.0' },
        })
        assert.equal(r.statusCode, 200)
        assert.match(r.body, /https:\/\//, 'the list carries links')
        // the canvas URL line is a link too, so a count is what proves the
        // list has members: a pile once printed "0 items" for a week because
        // the route read a frontmatter key the loader had already renamed
        assert.doesNotMatch(r.body, /^0 items/m, `${s.id} lists nothing`)
        assert.doesNotMatch(r.body, /&#\d+;|&amp;/, `${s.id} leaks an html entity into text`)
      })
    }
  })
})
