// test/lib/entry-kind.test.js
// The taxonomy, pinned. Every routing surface reads kindOf/pathFor, so a
// wrong answer here is wrong on the sitemap, in llms.txt, on the canvas and
// at the URL itself, all at once and all consistently, which is the failure
// mode a shared fork trades for fifteen inconsistent ones. These assertions
// are the contract that makes the trade safe.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  backTo,
  isCaseStudy,
  isExperiment,
  isPhotoSet,
  isRootMounted,
  isWriting,
  kindLabel,
  kindOf,
  metaLine,
  pathFor,
} from '../../src/lib/entry-kind.js'

const CASE = { slug: 'interfolio', type: 'case-study' }
const ARTICLE = { slug: 'nao' }
const EXPERIMENT = { slug: 'web-instruments', webOnly: true }
const PHOTOS = { slug: 'dogs', type: 'photos' }

describe('kindOf reads the frontmatter fork', () => {
  it('names each kind', () => {
    assert.equal(kindOf(CASE), 'case-study')
    assert.equal(kindOf(ARTICLE), 'article')
    assert.equal(kindOf(EXPERIMENT), 'web-only')
    assert.equal(kindOf(PHOTOS), 'photos')
  })

  it('falls back to article for an unknown type', () => {
    // A typo in `type:` must land somewhere serveable, not throw or vanish.
    assert.equal(kindOf({ slug: 'x', type: 'case-studies' }), 'article')
    assert.equal(kindOf({ slug: 'x' }), 'article')
  })

  // mutation: entry-kind.web-only-checked-first
  it('an explicit type wins over web_only', () => {
    // Both flags set is authoring noise, not a fifth kind. The type is the
    // deliberate statement; web_only is the older, vaguer one.
    assert.equal(kindOf({ slug: 'x', type: 'photos', webOnly: true }), 'photos')
    assert.equal(kindOf({ slug: 'x', type: 'case-study', webOnly: true }), 'case-study')
  })
})

describe('pathFor is the one place a URL is decided', () => {
  it('routes each kind to its surface', () => {
    assert.equal(pathFor(CASE), '/work/interfolio')
    assert.equal(pathFor(ARTICLE), '/feed/nao')
    assert.equal(pathFor(EXPERIMENT), '/web-instruments')
    assert.equal(pathFor(PHOTOS), '/dogs')
  })

  it('never emits a double slash or a bare prefix', () => {
    for (const e of [CASE, ARTICLE, EXPERIMENT, PHOTOS]) {
      const p = pathFor(e)
      assert.ok(p.startsWith('/'), `${p} is not rooted`)
      assert.ok(!p.includes('//'), `${p} doubles a slash`)
      assert.ok(p.endsWith(e.slug), `${p} does not end in its slug`)
    }
  })
})

describe('the derived predicates agree with kindOf', () => {
  it('writing is articles and only articles', () => {
    assert.equal(isWriting(ARTICLE), true)
    for (const e of [CASE, EXPERIMENT, PHOTOS]) assert.equal(isWriting(e), false)
  })

  it('root-mounted is exactly the single-segment kinds', () => {
    for (const e of [EXPERIMENT, PHOTOS]) {
      assert.equal(isRootMounted(e), true)
      assert.equal(pathFor(e).split('/').filter(Boolean).length, 1)
    }
    for (const e of [CASE, ARTICLE]) assert.equal(isRootMounted(e), false)
  })

  it('the single-kind predicates are mutually exclusive', () => {
    for (const e of [CASE, ARTICLE, EXPERIMENT, PHOTOS]) {
      const hits = [isCaseStudy(e), isExperiment(e), isPhotoSet(e), isWriting(e)].filter(Boolean)
      assert.equal(hits.length, 1, `${e.slug} answered to ${hits.length} predicates`)
    }
  })
})

describe('labels and the way back', () => {
  it('every kind in a collection has a label, every kind a back link', () => {
    // a root-mounted thing is not filed under a word for its kind (author,
    // 2026-09-25): its label is empty and its meta line is its date alone
    for (const e of [CASE, ARTICLE, EXPERIMENT, PHOTOS]) {
      if (e === EXPERIMENT) assert.equal(kindLabel(e), '', 'an experiment is labelled')
      else assert.ok(kindLabel(e), `${kindOf(e)} has no label`)
      const back = backTo(e)
      assert.ok(back && back.path.startsWith('/') && back.label, `${kindOf(e)} has no way back`)
    }
    assert.equal(metaLine({ ...EXPERIMENT, date: '2026-01-02' }), '2026-01-02')
    assert.equal(metaLine({ ...CASE, date: '2026-01-02' }), 'Case Study · 2026-01-02')
  })

  it('a page on the canvas goes back to the canvas', () => {
    // The close affordances a phone cannot reach (Escape, backdrop, the gap)
    // are why every sheet carries this link.
    assert.deepEqual(backTo(EXPERIMENT), { path: '/', label: 'canvas' })
    assert.deepEqual(backTo(PHOTOS), { path: '/', label: 'canvas' })
    assert.deepEqual(backTo(CASE), { path: '/work', label: 'Case Studies' })
    assert.deepEqual(backTo(ARTICLE), { path: '/feed', label: 'feed' })
  })
})
