// test/page-ring.test.js
// An experiment never walks into a case study.
//
// The bug this exists for: pageRing() walked the open collection and fell
// back to every full page when there was none. An experiment opens straight
// off the ground, so there never is one, and a sideways swipe on an
// experiment stepped into a case study; a case study opened the same way stepped into an
// experiment. Two things that share a template and nothing else.
//
// Source-level, and on the real thing: isFull and pageRing are lifted out of
// app.js as written and run over the boot index the server actually ships.
// The verdict on each ring comes from kindOf over the real entries, NOT from
// the `kind` field on the wire, so a ring that is pure by the wire's word and
// wrong by the taxonomy's still goes red.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from '../src/server.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { kindOf, CASE_STUDY, EXPERIMENT } from '../src/lib/entry-kind.js'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')

// a top-level declaration as written, from its first line to its closer
const lift = (open, close) => {
  const i = APP.indexOf(open)
  if (i < 0) return ''
  return APP.slice(i, APP.indexOf(close, i) + close.length)
}
const IS_FULL = lift('const isFull =', ';\n')
const PAGE_RING = lift('function pageRing(slug){', '\n}\n')
// not in the tree any more; lifted when present so that putting it back (the
// mutation this guard is tested with) fails on the rule, not on a
// ReferenceError
const FULL_SLUGS = lift('const fullSlugs =', ';\n')

// pageRing closes over PAGES, curFan and fanDefs; hand it all three
const ringFor = (PAGES, curFan, fanDefs) =>
  new Function(
    'PAGES',
    'curFan',
    'fanDefs',
    `${IS_FULL}\n${FULL_SLUGS}\n${PAGE_RING}\nreturn pageRing`
  )(PAGES, curFan, fanDefs)

let app, pages, kinds, studies, experiments

before(async () => {
  app = await build({ logger: false })
  const r = await app.inject({ method: 'GET', url: '/' })
  const m = r.body.match(/<script type="application\/json" id="boot">(.*?)<\/script>/s)
  pages = JSON.parse(m[1]).pages
  kinds = Object.fromEntries((await loadFeedEntries()).map((e) => [e.slug, kindOf(e)]))
  const full = Object.keys(pages).filter((s) => pages[s].full)
  studies = full.filter((s) => kinds[s] === CASE_STUDY)
  experiments = full.filter((s) => kinds[s] === EXPERIMENT)
  // the example content carries one of each; a ring of one is pure by
  // accident, so each kind gets a second page cloned off its first, under
  // a slug no entry has, with its kind recorded as the taxonomy's
  for (const [list, kind] of [
    [studies, CASE_STUDY],
    [experiments, EXPERIMENT],
  ]) {
    const twin = `${list[0]}-twin`
    pages[twin] = { ...pages[list[0]] }
    kinds[twin] = kind
    list.push(twin)
  }
})

after(async () => {
  await app.close()
})

describe('the ring a full page walks stays inside its kind', () => {
  // mutation: page-ring.experiments-not-full
  it('lifts the real functions and has both kinds to tell apart', () => {
    assert.ok(IS_FULL && PAGE_RING, 'isFull and pageRing are in app.js as the guard expects')
    // without both kinds on the index every ring is pure by accident
    assert.ok(studies.length >= 2, 'the index carries case studies')
    assert.ok(experiments.length >= 2, 'the index carries experiments')
  })

  // mutation: page-ring.boot-kind-is-label
  it('the boot index ships the kind the ring reads', () => {
    for (const s of [...studies, ...experiments]) assert.equal(pages[s].kind, kinds[s], s)
  })

  // mutation: page-ring.ring-ignores-kind
  it('off a collection, a case study walks the case studies and only them', () => {
    const pageRing = ringFor(pages, null, {})
    for (const s of studies) assert.deepEqual([...pageRing(s)].sort(), [...studies].sort(), s)
  })

  // mutation: page-ring.ring-ignores-kind
  it('off a collection, an experiment walks the experiments and only them', () => {
    const pageRing = ringFor(pages, null, {})
    for (const s of experiments) {
      assert.deepEqual([...pageRing(s)].sort(), [...experiments].sort(), s)
    }
  })

  // mutation: page-ring.collection-sets-membership
  it('an open collection sets the order, never the membership', () => {
    // a pile that holds both kinds, which nothing on the ground does today:
    // the rule is "by any gesture or button", not "as long as the piles are
    // sorted"
    const mixed = [...studies, ...experiments].reverse().map((slug) => ({ slug }))
    const pageRing = ringFor(pages, 'pile', { pile: mixed })
    const inOrder = (set) => mixed.map((d) => d.slug).filter((s) => set.includes(s))
    for (const s of studies) assert.deepEqual(pageRing(s), inOrder(studies), s)
    for (const s of experiments) assert.deepEqual(pageRing(s), inOrder(experiments), s)
  })

  // mutation: page-ring.no-kind-walks-everything, page-ring.ring-ignores-kind
  it('a page with no kind goes nowhere rather than everywhere', () => {
    // a stale boot from before the index shipped `kind`
    const stale = Object.fromEntries(
      Object.entries(pages).map(([s, p]) => [s, { ...p, kind: undefined }])
    )
    const pageRing = ringFor(stale, null, {})
    for (const s of [...studies, ...experiments]) assert.deepEqual(pageRing(s), [], s)
  })
})
