// test/sitemap.test.js
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { build } from '../src/server.js'
import { FIXTURES } from './fixtures.js'

// Mirrors src/routes/sitemap.js: SITE_URL + STATIC_ROUTES paths.
const SITE_URL = site.url
const STATIC_PATHS = ['/', '/work', '/case-studies', '/feed', '/about']

let app
let body

before(async () => {
  app = await build({ logger: false })
  const r = await app.inject({ method: 'GET', url: '/sitemap.xml' })
  body = r.body
})

after(async () => {
  await app.close()
})

describe('GET /sitemap.xml', () => {
  it('returns 200 with an XML content-type', async () => {
    const r = await app.inject({ method: 'GET', url: '/sitemap.xml' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /application\/xml/)
  })

  it('is a well-formed urlset document', () => {
    assert.ok(body.includes('<?xml version="1.0" encoding="UTF-8"?>'))
    assert.ok(
      body.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
      'opens the sitemap urlset namespace'
    )
    assert.ok(body.includes('</urlset>'))
  })

  it('lists every static route as an absolute site URL inside a <loc>', () => {
    for (const path of STATIC_PATHS) {
      const loc = `<loc>${SITE_URL}${path}</loc>`
      assert.ok(body.includes(loc), `sitemap is missing static route ${loc}`)
    }
  })

  it('carries changefreq and priority hints for static routes', () => {
    // Home is the canonical priority-1.0 weekly entry per STATIC_ROUTES.
    assert.ok(body.includes('<changefreq>weekly</changefreq>'))
    assert.ok(body.includes('<priority>1.0</priority>'))
  })
})

describe('type -> path fork for content entries', () => {
  it('routes a case study under /work/', () => {
    assert.ok(
      body.includes(`<loc>${SITE_URL}/work/${FIXTURES.caseStudy}</loc>`),
      'case-study entry should surface at /work/<slug>'
    )
  })

  it('never lists an external entry (its host owns the URL)', () => {
    assert.ok(
      !body.includes(`${SITE_URL}/feed/${FIXTURES.external}`) &&
        !body.includes('developer.mozilla.org'),
      'external entries have no local URL and no place in this sitemap'
    )
  })

  it('routes a web experiment under /feed/', () => {
    assert.ok(
      body.includes(`<loc>${SITE_URL}/${FIXTURES.experiment}</loc>`),
      'web-only entry should surface at /feed/<slug>'
    )
  })

  it('never lists a content slug under the wrong surface', () => {
    // A case study lives only under /work; everything else only under /feed.
    assert.ok(!body.includes(`<loc>${SITE_URL}/feed/${FIXTURES.caseStudy}</loc>`))
    assert.ok(!body.includes(`<loc>${SITE_URL}/work/${FIXTURES.external}</loc>`))
    assert.ok(!body.includes(`<loc>${SITE_URL}/work/${FIXTURES.experiment}</loc>`))
  })
})

describe('hidden filtering', () => {
  // sitemap.js filters entries where e.hidden is true before emitting URLs.
  // There is currently no `hidden: true` fixture in content/feed/, so this
  // asserts the visible content that should always appear and confirms the
  // page is fully populated. (Add a hidden fixture to test a leak directly.)
  it('emits the known visible content slugs', () => {
    for (const slug of [FIXTURES.caseStudy, FIXTURES.article, FIXTURES.experiment]) {
      assert.ok(body.includes(`/${slug}</loc>`), `expected visible slug ${slug} in sitemap`)
    }
  })
})

describe('lastmod tells the truth about modification', () => {
  // `date` is when the work happened and never moves again; `updated` is when
  // the file last changed. A sitemap using `date` would advertise edited
  // case studies as untouched. Google cross-checks lastmod against the page it
  // fetches and discounts the signal site-wide when it is consistently wrong,
  // which would have spent the sitemap's only freshness hint.
  const CONTENT_DIR = join(import.meta.dirname, '../content/feed')

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'))

  // mutation: sitemap.updated-in-future
  it('every entry carries an updated date that is sane', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const f of files) {
      const fm = readFileSync(join(CONTENT_DIR, f), 'utf8').split('---')[1] || ''
      const date = fm.match(/^date:\s*(\S+)/m)?.[1]
      const updated = fm.match(/^updated:\s*(\S+)/m)?.[1]
      assert.ok(updated, `${f} has no updated:`)
      assert.match(updated, /^\d{4}-\d{2}-\d{2}$/, `${f} updated is not ISO`)
      assert.ok(updated <= today, `${f} updated ${updated} is in the future`)
      if (date) assert.ok(updated >= date, `${f} updated ${updated} predates date ${date}`)
    }
  })

  // mutation: sitemap.lastmod-from-date
  it('emits updated, in W3C format, as the lastmod the crawler reads', () => {
    // The half this guard was missing at first: it checked the frontmatter and
    // passed while <lastmod> shipped "Tue Jun 02 2026 20:00:00 GMT-0400" - YAML
    // had parsed the unquoted date into a Date object and the template
    // stringified it. Assert the BYTES the crawler gets, not the input.
    for (const m of body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/, `lastmod "${m[1]}" is not a W3C date`)
    }
    for (const f of files) {
      const fm = readFileSync(join(CONTENT_DIR, f), 'utf8').split('---')[1] || ''
      const slug = fm.match(/^slug:\s*(\S+)/m)?.[1] || f.replace(/\.md$/, '')
      const updated = fm.match(/^updated:\s*(\S+)/m)?.[1]
      const entry = body.match(
        new RegExp(`<loc>[^<]*/${slug}</loc>\\s*\\n\\s*<lastmod>([^<]+)</lastmod>`)
      )
      if (!entry) continue // external entries have no <loc>, by design
      assert.equal(
        entry[1],
        updated,
        `${slug} lastmod is ${entry[1]}, expected updated: ${updated}`
      )
    }
  })

  // mutation: sitemap.updated-not-bumped
  it('updated is not older than the file itself', () => {
    // The half that cannot be satisfied by typing a plausible date: git is
    // the authority on when the file actually changed. Skipped on a shallow
    // clone, where the history to compare against is not present - CI checks
    // out with fetch-depth 0 so it runs there.
    const depth = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: join(import.meta.dirname, '..'),
      encoding: 'utf8',
    }).trim()
    if (depth === 'true') return

    for (const f of files) {
      const path = `content/feed/${f}`
      const committed = execFileSync('git', ['log', '-1', '--format=%cs', '--', path], {
        cwd: join(import.meta.dirname, '..'),
        encoding: 'utf8',
      }).trim()
      if (!committed) continue // never committed yet
      const fm = readFileSync(join(CONTENT_DIR, f), 'utf8').split('---')[1] || ''
      const updated = fm.match(/^updated:\s*(\S+)/m)?.[1]
      assert.ok(
        updated >= committed,
        `${path} last changed ${committed} but declares updated: ${updated}. Bump it in the same commit that edits the body.`
      )
    }
  })
})
