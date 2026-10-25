// test/lib/content.test.js
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadMarkdownDir, loadMarkdownFile } from '../../src/lib/content.js'

// A unique temp dir holding the markdown fixtures, torn down in `after`.
let dir

// `older.md`: unquoted YAML date -> gray-matter yields a Date, exercising
// normalizeDate's `instanceof Date` branch. Carries case-study frontmatter.
const OLDER_MD = `---
title: Older Entry
slug: older
date: 2026-01-01
type: case-study
tags:
  - infra
  - automation
repo: https://example.com/older
summary: the older one
---

This is the **older** body.
`

// `newer.md`: should sort ahead of `older.md` (newest-first).
const NEWER_MD = `---
title: Newer Entry
date: 2026-03-01
summary: the newer one
---

This is the *newer* body.
`

// `undated.md`: no date field -> normalizeDate returns null.
const UNDATED_MD = `---
title: Undated Entry
---

An **undated** body with no date frontmatter.
`

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'content-test-'))
  await writeFile(join(dir, 'older.md'), OLDER_MD)
  await writeFile(join(dir, 'newer.md'), NEWER_MD)
  await writeFile(join(dir, 'undated.md'), UNDATED_MD)
  // Non-.md file: must be ignored by loadMarkdownDir.
  await writeFile(join(dir, 'notes.txt'), 'plain text, not markdown')
})

after(async () => {
  await rm(dir, { recursive: true, force: true })
})

// mutation: content.oldest-first
test('loadMarkdownDir sorts items newest-first by date', async () => {
  const load = loadMarkdownDir(dir)
  const items = await load()
  const slugs = items.map((i) => i.slug)
  // newer (2026-03-01) before older (2026-01-01); undated (null date) sorts last.
  assert.deepEqual(slugs, ['newer', 'older', 'undated'])
  assert.equal(items[0].date, '2026-03-01')
  assert.equal(items[1].date, '2026-01-01')
})

test('loadMarkdownDir ignores non-.md files', async () => {
  const load = loadMarkdownDir(dir)
  const items = await load()
  // Three .md files; the .txt is excluded.
  assert.equal(items.length, 3)
  assert.ok(!items.some((i) => i.slug === 'notes'), 'the .txt file should not appear as an item')
})

test('loadMarkdownDir derives slug from filename and pulls base frontmatter', async () => {
  const load = loadMarkdownDir(dir)
  const items = await load()
  const newer = items.find((i) => i.slug === 'newer')
  assert.equal(newer.title, 'Newer Entry')
  assert.equal(newer.summary, 'the newer one')
})

test('loadMarkdownDir renders body markdown to html', async () => {
  const load = loadMarkdownDir(dir)
  const items = await load()
  const older = items.find((i) => i.slug === 'older')
  assert.ok(
    older.html.includes('<strong>older</strong>'),
    'inline bold markdown is rendered to <strong>'
  )
  // raw keeps the unrendered markdown source.
  assert.ok(older.raw.includes('**older**'))
})

test('mapFrontmatter callback pulls through extra frontmatter (type, tags, repo)', async () => {
  const load = loadMarkdownDir(dir, (base, data) => ({
    ...base,
    type: data.type || null,
    tags: data.tags || [],
    repo: data.repo || null,
  }))
  const items = await load()
  const older = items.find((i) => i.slug === 'older')
  const newer = items.find((i) => i.slug === 'newer')

  assert.equal(older.type, 'case-study')
  assert.deepEqual(older.tags, ['infra', 'automation'])
  assert.equal(older.repo, 'https://example.com/older')

  // The entry without those fields gets the callback's fallbacks.
  assert.equal(newer.type, null)
  assert.deepEqual(newer.tags, [])
  assert.equal(newer.repo, null)
})

test('normalizeDate returns null when no date frontmatter is present', async () => {
  const load = loadMarkdownDir(dir)
  const items = await load()
  const undated = items.find((i) => i.slug === 'undated')
  assert.equal(undated.date, null)
})

test('loadMarkdownFile reads one file: slug from filename, html rendered, mapped frontmatter, null date', async () => {
  const load = loadMarkdownFile(join(dir, 'undated.md'), (base, data) => ({
    ...base,
    type: data.type || 'note',
  }))
  const item = await load()
  assert.equal(item.slug, 'undated')
  assert.equal(item.title, 'Undated Entry')
  assert.equal(item.date, null)
  assert.equal(item.type, 'note')
  assert.ok(item.html.includes('<strong>undated</strong>'))
})

test('loadMarkdownDir skips a file whose frontmatter cannot be parsed', async (t) => {
  // Own temp dir: the shared fixture dir asserts exact item counts elsewhere.
  const badDir = await mkdtemp(join(tmpdir(), 'content-bad-'))
  t.after(() => rm(badDir, { recursive: true, force: true }))
  await writeFile(join(badDir, 'good.md'), NEWER_MD)
  await writeFile(join(badDir, 'broken.md'), '---\ndate: [unclosed\ntitle: "Broken\n---\n\nbody\n')

  const warns = []
  t.mock.method(console, 'warn', (...args) => warns.push(args.join(' ')))

  const load = loadMarkdownDir(badDir)
  const items = await load()
  assert.deepEqual(
    items.map((i) => i.slug),
    ['good'],
    'the parseable entry survives, the broken one is skipped'
  )
  assert.ok(
    warns.some((w) => w.includes('broken.md')),
    'the skip warns with the offending filename'
  )
})

// USE_CACHE is a module-level const, read once at import time from
// process.env.NODE_ENV. To exercise both branches we re-evaluate the module
// under different env values via a query-string specifier (a distinct entry
// in Node's ESM module map).
test('in production a single loader caches and returns the identical array', async () => {
  process.env.NODE_ENV = 'production'
  try {
    const mod = await import('../../src/lib/content.js?env=prod')
    const load = mod.loadMarkdownDir(dir)
    const first = await load()
    const second = await load()
    assert.strictEqual(first, second, 'second call returns the cached array')
  } finally {
    delete process.env.NODE_ENV
  }
})

test('outside production the cache is bypassed and each call re-reads', async () => {
  // NODE_ENV is unset here (development).
  assert.notEqual(process.env.NODE_ENV, 'production')
  const mod = await import('../../src/lib/content.js?env=dev')
  const load = mod.loadMarkdownDir(dir)
  const first = await load()
  const second = await load()
  assert.notStrictEqual(first, second, 'each call produces a fresh array in dev')
  // ...but the freshly-read content is equivalent.
  assert.deepEqual(
    first.map((i) => i.slug),
    second.map((i) => i.slug)
  )
})
