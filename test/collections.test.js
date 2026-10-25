// test/collections.test.js
// The rows of a collection. The feed and the work sheet list entries in rows
// of one anatomy: the title that links, the line under it, the tags, ruled with
// the kit's one-cell rule. One builder draws a row (listRow in
// lib/canvas-sheets.js), so two collections' rows cannot be set two ways.
//
// What is held: both collections' rows have that anatomy, a word in a row is
// escaped, an entry that lives elsewhere says it leaves (a new tab, no opener),
// and a row is drawn in one place.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildFeedSheet, buildWorkSheet } from '../src/lib/canvas-sheets.js'

const read = (rel) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const entry = (o = {}) => ({
  slug: 'a-b',
  title: 'A <b> title',
  summary: 'one line',
  date: '2026-01-02',
  tags: ['ai', 'x&y'],
  type: 'article',
  ...o,
})

// a row, once it is cut out of its list (the last still carries the list's close): link, line, tags
const ROW =
  /^<a href="[^"]+"( target="_blank" rel="noopener")?><b>[^<]*<\/b><\/a><span class="k-meta">[^<]*<\/span>(<ul class="k-tags" aria-label="tags">(<li class="k-tag">[^<]*<\/li>)+<\/ul>)?<\/li>(<\/ul>)?\n?$/
const rowsOf = (html) => html.split('<li class="k-rb">').slice(1)

describe('a row is the same row in every collection', () => {
  // mutation: collections.row-meta-dropped, collections.title-unescaped
  it('is a link, a line and its tags, in the feed and on the work sheet alike', () => {
    const feed = buildFeedSheet([
      entry(),
      entry({ slug: 'out', title: 'Out', externalUrl: 'https://example.com/a/b' }),
    ]).body
    const work = buildWorkSheet('work\n====\n', [entry({ type: 'case-study' })], {
      'a-b': '/work/a-b',
    }).body
    const rows = [...rowsOf(feed), ...rowsOf(work)]
    assert.equal(rows.length, 3)
    for (const row of rows) assert.match(row, ROW, `a row is not the row: ${row.slice(0, 120)}`)
    // a word is escaped, in every collection
    for (const html of [feed, work]) {
      assert.match(html, /<b>A &lt;b&gt; title<\/b>/)
      assert.match(html, /<li class="k-tag">x&amp;y<\/li>/)
    }
  })

  it('says an entry that lives elsewhere leaves: a new tab, and the host on its line', () => {
    const rows = rowsOf(
      buildFeedSheet([
        entry({ slug: 'out', title: 'Out', externalUrl: 'https://example.com/a/b' }),
        entry({ slug: 'in', title: 'In' }),
      ]).body
    )
    assert.match(rows[0], /<a href="https:\/\/example\.com\/a\/b" target="_blank" rel="noopener">/)
    assert.match(rows[0], /<span class="k-meta">[^<]*example\.com<\/span>/)
    assert.doesNotMatch(rows[1], /target=/)
  })

  // mutation: collections.row-redrawn
  it('is drawn in one place', () => {
    const src = read('src/lib/canvas-sheets.js')
    assert.equal((src.match(/<li class="k-rb">/g) || []).length, 1, 'a row is drawn by hand')
    assert.equal((src.match(/listRow\(/g) || []).length, 3, 'both collections ask the builder')
  })
})
