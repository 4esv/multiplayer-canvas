// test/og-cards.test.js
// The Open Graph cards are DERIVED (scripts/og/cards.mjs): a card is a page of
// the site at billboard size, built from the page's own title, tags, impact and
// figure, so there is no list of cards to keep in step and a rename is a rerun.
// og.test.js holds the cards on disk (one per page, every px on the ramp); this
// holds what they are made from. A PNG cannot be read for its words, so the
// words are read where they are made.
//
// What is held: every page has a spec and every spec is a page; a card's title,
// tags and figure are its page's own; the figure is shown at twice its size and
// a page with none says what it was made of; a card is made of the site's own
// sheets and nothing from outside; the card's stylesheet is on whole cells and
// the one face at whole dots, in tokens; and the way in is render.sh.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { loadFeedEntries } from '../src/routes/feed.js'
import { MARK_A } from '../src/static/canvas/marks.js'
import { CARD, cardHtml, cardSpecs, leadFigure } from '../scripts/og/cards.mjs'
import { readStills } from '../scripts/og/tree.mjs'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const CSS = read('scripts/og/card.css')

const entries = await loadFeedEntries()
const stills = readStills(entries, ROOT)
const specs = cardSpecs({ entries, stills })
const bySlug = new Map(specs.map((s) => [s.slug, s]))
const DOORS = ['default', 'work', 'case-studies', 'about', 'feed', 'credits']
const escapeHtml = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
// the words pixelTitle keeps for readers are escaped for an attribute: no apostrophe
const escapeTitle = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

describe('a card for every page, and a page for every card', () => {
  // mutation: og-cards.case-study-uncarded, og-cards.experiment-uncarded
  it('is the doors and every entry that has a page of its own, read from the content', () => {
    const local = entries.filter((e) => !e.hidden && !e.externalUrl).map((e) => e.slug)
    assert.deepEqual([...bySlug.keys()].sort(), [...DOORS, ...local].sort())
    assert.equal(specs.length, bySlug.size, 'a slug is carded twice')
    // and each by its kind: a case study is a page of its own, never an
    // article's mark (an entry the case-study branch misses falls through to
    // the article's card, so the slugs alone cannot tell)
    const studies = entries.filter((e) => e.type === 'case-study' && !e.hidden)
    assert.ok(studies.length >= 1, 'the sweep found no case study')
    for (const e of studies)
      assert.equal(bySlug.get(e.slug).kind, 'page', `${e.slug} is not a page`)
  })

  // mutation: og-cards.kind-without-layout, og-cards.clock-in-card
  it('draws every spec, the same document every time', () => {
    for (const s of specs) {
      const html = cardHtml(s)
      assert.equal(cardHtml(s), html, `${s.slug} is not the same card twice`)
      assert.match(html, new RegExp(`<body class="og og-${s.kind}">`))
      assert.match(CSS, new RegExp(`\\.og-${s.kind}\\b`), `card.css has no .og-${s.kind}`)
    }
  })

  // mutation: og-cards.title-retyped
  it("a card's title is its page's title, so a rename is a rerun", () => {
    const pages = entries.filter((e) => !e.hidden && !e.externalUrl && bySlug.has(e.slug))
    assert.ok(pages.length >= 3, 'the sweep found almost no pages')
    for (const e of pages) {
      assert.equal(bySlug.get(e.slug).title, e.title, `${e.slug} has its own title`)
      assert.ok(
        cardHtml(bySlug.get(e.slug)).includes(`<span class="px-vh">${escapeTitle(e.title)}</span>`),
        `${e.slug}'s card does not set its page's title`
      )
    }
  })
})

describe('a case study on a card', () => {
  const studies = entries.filter((e) => e.type === 'case-study' && !e.hidden)

  // mutation: og-cards.kind-said-on-card, og-cards.tags-dropped
  it('carries its tags, without its kind, and its own impact', () => {
    assert.ok(studies.length >= 1, 'the sweep found no case study')
    for (const e of studies) {
      const html = cardHtml(bySlug.get(e.slug))
      for (const t of e.tags.filter((t) => t !== 'case-study'))
        assert.ok(html.includes(`<li class="k-tag">${t}</li>`), `${e.slug} lost its tag ${t}`)
      assert.ok(
        !html.includes('<li class="k-tag">case-study</li>'),
        `${e.slug} says its kind twice`
      )
      assert.ok(html.includes(escapeHtml(e.impact)), `${e.slug} lost its impact line`)
    }
  })

  // mutation: og-cards.figure-at-one
  it('shows its own figure at twice its size, and says what it was made of when it has none', () => {
    for (const e of studies) {
      const html = cardHtml(bySlug.get(e.slug))
      const f = leadFigure(e.html)
      if (!f) {
        assert.ok(html.includes('class="og-made"'), `${e.slug} draws nothing and says nothing`)
        for (const u of e.used) assert.ok(html.includes(`>${escapeHtml(u.name)}<`))
        continue
      }
      assert.ok(html.includes('class="og-fig"'), `${e.slug} has a figure and no window for it`)
      // the narrow drawing is 152 units, and at four px a unit it is the window's width
      if (f.svg) assert.equal(f.w, 608, `${e.slug}: a drawing is not shown at twice its size`)
      assert.ok(html.includes(`width="${f.w}"`), `${e.slug}: the figure is not at its size`)
    }
  })

  // mutation: og-cards.photo-after-drawing, og-cards.figure-wide-first
  it('chooses a photograph that stands before the first drawing, else the narrow drawing', () => {
    const svg = (w, h) =>
      `<svg class="cellfig" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}"></svg>`
    const photo = '<img src="/img/a.png?v=1" width="304" height="420" alt="">'
    // a photograph before the drawing leads, at twice the size the page shows it
    assert.deepEqual(leadFigure(photo + svg(152, 100)), { img: '/img/a.png', w: 608, h: 840 })
    // a drawing before the photograph does
    assert.equal(leadFigure(svg(152, 100) + photo).w, 608)
    assert.ok(leadFigure(svg(152, 100) + photo).svg)
    // a place too small to cut a picture from leaves the photograph out
    assert.ok(leadFigure(photo + svg(152, 100), 2, { photos: false }).svg)
    // the wide drawing was made for a desk: the narrow one is taken
    const both = svg(318, 102) + svg(152, 172)
    assert.equal(leadFigure(both).h, 172 * 4)
    // and a page that draws nothing has none
    assert.equal(leadFigure('<p>words</p>'), null)
  })
})

describe('a card is made of the site', () => {
  // mutation: og-cards.external-asset, og-cards.own-mark-drawn
  it("links the site's own sheets, nothing from outside, and draws no mark of its own", () => {
    for (const s of specs) {
      const html = cardHtml(s)
      assert.ok(html.includes('href="/primitives/kit/canvas-tokens.css"'))
      assert.ok(html.includes('href="/primitives/kit/kit.css"'))
      const urls = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1])
      for (const u of urls) assert.ok(u.startsWith('/'), `${s.slug} reaches outside the site: ${u}`)
      assert.doesNotMatch(html, /https?:\/\//, `${s.slug} names a host`)
      // the marks on the 11 grid are the site's two (the maker's A and the way
      // out a quotation wears), whatever size they are drawn at
      const d = (svg) => svg.match(/<path[^>]*\bd="([^"]+)"/)?.[1]
      const known = new Set([d(MARK_A)])
      for (const svg of html.match(/<svg[^>]*viewBox="0 0 11 11"[\s\S]*?<\/svg>/g) || [])
        assert.ok(known.has(d(svg)), `${s.slug} draws a mark of its own`)
    }
  })

  // mutation: og-cards.card-size-drift
  it('is the size the unfurl wants', () => {
    assert.deepEqual({ ...CARD }, { w: 1200, h: 630 })
    assert.match(CSS, /width: 1200px;\s*height: 630px;/)
  })
})

describe("a card's stylesheet", () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

  // mutation: og-cards.css-off-cell
  it('is on whole half cells: every px length is even, and the cell is four', () => {
    const odd = [...css.matchAll(/(?<![\w.#-])(-?\d+(?:\.\d+)?)px\b/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n % 2 !== 0)
    assert.deepEqual(odd, [], 'a length is off the half cell')
    assert.match(css, /--og-cell: 4px;/)
  })

  // mutation: og-cards.css-off-dot
  it("sets type at whole dots of the face's sixteen", () => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]))
    assert.ok(sizes.length >= 4, 'the sweep found almost no type')
    assert.deepEqual(
      sizes.filter((n) => n % 16 !== 0),
      [],
      'a size is not a multiple of a dot'
    )
  })

  // mutation: og-cards.css-hex, og-cards.css-shadow
  it('is made of tokens and casts nothing but the smear', () => {
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'a colour is typed, not a token')
    assert.doesNotMatch(css, /box-shadow|drop-shadow|border-radius/)
    for (const m of css.matchAll(/text-shadow:\s*([^;]+);/g))
      assert.equal(m[1].trim(), 'calc(1em / 16) 0 0 currentColor', 'a shadow that is not the smear')
  })
})

describe('the way in', () => {
  // mutation: og-cards.render-sh-gone
  it('is render.sh, which hands everything to render.mjs', () => {
    const sh = join(ROOT, 'scripts/og/render.sh')
    assert.ok(statSync(sh).mode & 0o111, 'render.sh is not executable')
    assert.match(read('scripts/og/render.sh'), /exec node scripts\/og\/render\.mjs "\$@"/)
  })
})
