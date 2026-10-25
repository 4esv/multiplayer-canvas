// test/kit-tag.test.js
// The tag (BIBLE.md section 1): what a thing is about, a word in the code face
// in a block whose edge is one cell of the line tone. The sheet drew it first
// (the surfaces plate) and the site wears it now: on a card, under a page's
// title, on a list row. It is ONE drawing in kit.css and ONE builder in
// js/tags.js, so a tag reads the same wherever it stands and a place that
// wants tags cannot draw its own.
//
// What is held: the drawing (the code face, a cell of frame, the surface, an
// eight-cell height the card's one-row box counts on), that it answers nothing
// (a tag is read, never pressed), the builder (the kind is not said twice, a
// word is escaped, nothing to say draws nothing), and that every place that
// shows tags goes through the builder or the kit's classes. The painted half
// (a tag on the ground, on a card and on a white page) is measured in a
// browser, because a stylesheet cannot say where a box lands.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { build } from '../src/server.js'
import { buildFeedSheet, buildWorkSheet } from '../src/lib/canvas-sheets.js'
import { tagsMarkup, visibleTags } from '../primitives/kit/tags.js'
import { cssRules } from './lib/cascade.js'
import { FIXTURES } from './fixtures.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const KIT = cssRules(read('primitives/kit/kit.css'))
const decl = (sel, prop, rules = KIT) =>
  rules
    .filter((r) => r.selectors.some((s) => s.trim() === sel))
    .flatMap((r) => r.decls)
    .find((d) => d.prop === prop)?.value

describe('the tag is one drawing', () => {
  // mutation: kit-tag.not-code-face, kit-tag.frame-off-cell, kit-tag.no-fill, kit-tag.can-wrap
  it('is a word in the code face, framed in a cell of the line tone, on the surface', () => {
    assert.equal(decl('.k-tag', 'font-family'), 'var(--cv-font-code)')
    assert.equal(decl('.k-tag', 'font-size'), 'var(--cv-fs-0)')
    assert.equal(decl('.k-tag', 'border'), 'var(--cv-px) solid var(--cv-line)')
    assert.equal(decl('.k-tag', 'background'), 'var(--cv-surface)')
    assert.equal(decl('.k-tag', 'color'), 'var(--cv-ink)')
    assert.equal(decl('.k-tag', 'padding'), '0 var(--cv-sp-2)')
    assert.equal(decl('.k-tag', 'text-shadow'), 'none', 'the code face is not smeared')
    assert.equal(decl('.k-tag', 'white-space'), 'nowrap', 'a tag is one word and never breaks')
  })

  // mutation: kit-tag.height-off-cells
  it('is eight cells tall: six of line and a cell of frame either side', () => {
    // the card's one-row box is built on this number (canvas-widgets-kit)
    assert.equal(decl('.k-tag', 'line-height'), 'calc(6 * var(--cv-px))')
    assert.equal(decl('.k-tag', 'border'), 'var(--cv-px) solid var(--cv-line)')
  })

  // mutation: kit-tag.row-no-wrap, kit-tag.row-gap-off-ladder
  it('stands in a row that wraps on a two-cell gap and is not a bulleted list', () => {
    assert.equal(decl('.k-tags', 'display'), 'flex')
    assert.equal(decl('.k-tags', 'flex-wrap'), 'wrap')
    assert.equal(decl('.k-tags', 'gap'), 'var(--cv-sp-2)')
    assert.equal(decl('.k-tags', 'list-style'), 'none')
    assert.equal(decl('.k-tags', 'margin'), '0')
    assert.equal(decl('.k-tags', 'padding'), '0')
  })

  // mutation: kit-tag.answers-hover
  it('answers nothing: a tag is read and never pressed', () => {
    const states = KIT.flatMap((r) => r.selectors).filter(
      (s) => /\.k-tag(?![\w-])/.test(s) && /:(hover|active|focus|focus-visible|disabled)/.test(s)
    )
    assert.deepEqual(states, [], 'a tag grew a state, so it is a control and wants its four')
    assert.equal(decl('.k-tag', 'cursor'), undefined)
  })

  // mutation: kit-tag.sheet-own-rule
  it('is the only tag: the sheet draws none of its own', () => {
    const sheet = cssRules(read('src/static/css/sheet.css'))
    assert.equal(
      sheet.filter((r) => r.selectors.some((s) => /\.ks-tag/.test(s))).length,
      0,
      'a plate has its own tag again'
    )
    const plates = read('src/templates/kit/plates.njk')
    assert.doesNotMatch(plates, /ks-tag/)
    assert.equal((plates.match(/class="k-tag"/g) || []).length, 3)
    // and the hardware plate shows it beside the chip, on both grounds
    assert.match(read('src/templates/kit/index.njk'), /<div class="k-tags">.*class="k-tag"/)
  })
})

describe('the builder', () => {
  // mutation: kit-tag.kind-said-twice
  it("does not say the kind twice: a case study's own word is its label already", () => {
    assert.deepEqual(visibleTags(['case-study', 'ai', 'robotics'], 'case-study'), [
      'ai',
      'robotics',
    ])
    assert.deepEqual(visibleTags(['case-study', 'ai'], 'Case Study'), ['ai'])
    assert.deepEqual(visibleTags(['football', 'data'], 'article'), ['football', 'data'])
    assert.deepEqual(visibleTags(undefined), [])
    assert.deepEqual(visibleTags(['', ' ', 'ai']), ['ai'])
  })

  // mutation: kit-tag.unescaped
  it('escapes a word and draws nothing when there is nothing to say', () => {
    assert.equal(
      tagsMarkup(['<b>', 'a & b']),
      '<ul class="k-tags" aria-label="tags"><li class="k-tag">&lt;b&gt;</li><li class="k-tag">a &amp; b</li></ul>'
    )
    assert.equal(tagsMarkup([]), '')
    assert.equal(tagsMarkup(['case-study'], 'case-study'), '')
  })
})

describe('every place that shows tags goes through the kit', () => {
  const entry = (over) => ({
    slug: 'x',
    title: 'X',
    summary: 's',
    date: '2026-01-01',
    tags: ['case-study', 'ai', 'robotics'],
    ...over,
  })

  // mutation: kit-tag.feed-row-bare
  it('a feed row carries its tags under its meta line', () => {
    const { body } = buildFeedSheet([entry({ tags: ['football', 'data'] })])
    assert.match(
      body,
      /<span class="k-meta">[^<]*<\/span><ul class="k-tags" aria-label="tags"><li class="k-tag">football<\/li><li class="k-tag">data<\/li><\/ul><\/li>/
    )
  })

  // mutation: kit-tag.work-row-bare
  it("a case study's row on the work sheet carries its tags, minus its kind", () => {
    const cs = entry({ type: 'case-study', slug: 'x' })
    const { body } = buildWorkSheet('work\n====\n', [cs], { x: '/work/x' })
    assert.match(body, /<li class="k-tag">ai<\/li><li class="k-tag">robotics<\/li>/)
    assert.doesNotMatch(body, /<li class="k-tag">case-study<\/li>/)
  })

  // mutation: kit-tag.keywords-drawn-by-hand
  it('the work sheet’s keywords are tags', () => {
    const text = 'work\n====\n\nkeywords\n--------\nPython · Rust\n'
    const { body } = buildWorkSheet(text, [], {})
    assert.match(
      body,
      /<ul class="k-tags kwList" aria-label="keywords"><li class="k-tag">Python<\/li><li class="k-tag">Rust<\/li><\/ul>/
    )
  })

  // mutation: kit-tag.client-meta-by-hand
  it('the canvas builds a page’s head in one place, and a card’s tags from the kit’s class', () => {
    const app = read('src/static/canvas/app.js')
    // one builder for the meta block and its tags, used by every sheet
    assert.equal((app.match(/<div class="meta">\$\{esc\(/g) || []).length, 1, 'a head by hand')
    assert.equal((app.match(/metaMarkup\(/g) || []).length, 5, 'every head uses the builder')
    assert.match(app, /import \{ tagsMarkup, visibleTags \} from 'multiplayer-canvas\/kit\/tags';/)
    assert.match(app, /tagsMarkup\(BOOT\?\.arts\?\.\[slug\]\?\.tags, p\.kind\)/)
  })
})

describe('a page’s head, served', () => {
  let app
  before(async () => {
    app = await build({ logger: false })
  })
  after(async () => {
    await app.close()
  })

  // mutation: kit-tag.ssr-head-bare
  it('a case study carries its tags inside its meta block, without its kind', async () => {
    const r = await app.inject({ method: 'GET', url: `/work/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 200)
    // the meta block holds no div, so its first close is its own
    const meta = r.body.match(/<div class="meta">([\s\S]*?)<\/div>/)
    assert.ok(meta, 'the head is in the document')
    const head = meta[1]
    assert.match(head, /^Case Study · \d{4}-\d{2}-\d{2}<ul class="k-tags" aria-label="tags">/)
    assert.match(head, /<li class="k-tag">automation<\/li>/)
    assert.doesNotMatch(head, /<li class="k-tag">case-study<\/li>/)
  })

  // mutation: kit-tag.experiment-labelled
  it('an experiment is the thing it is: no row of words over it', async () => {
    const r = await app.inject({ method: 'GET', url: `/${FIXTURES.experiment}` })
    assert.equal(r.statusCode, 200)
    const head = r.body.match(/<div class="meta">([\s\S]*?)<\/div>/)
    assert.ok(head, 'the head is in the document')
    assert.doesNotMatch(head[1], /k-tag/)
  })
})
