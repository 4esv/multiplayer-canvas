// test/page-furniture.test.js
// Every page route must arrive fully dressed: a real <title>, a non-empty
// meta description, and an absolute canonical. base.njk only falls back to the
// site defaults for / and the error pages, so every other route has to declare
// its own meta block (the README's page furniture). This guards the one piece of
// furniture og.test.js and sitemap.test.js don't cover.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'
import { STATIC_ROUTES } from '../src/routes/sitemap.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { pathFor } from '../src/lib/entry-kind.js'
import { FIXTURES } from './fixtures.js'
import site from '../site.config.js'

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

// The furniture list is derived, not hand-kept: the static routes come from
// the sitemap's own table, the content routes from loadFeedEntries (the loader
// the routes use), so a new route or entry arrives guarded. home === true means
// the route may wear the site-default title/description (base.njk falls back
// only there and on the error pages); every other route must dress itself.
// External entries 302 (no head), so they are excluded.
const entries = (await loadFeedEntries()).filter((e) => !e.hidden && !e.externalUrl)
const PAGES = [
  ...STATIC_ROUTES.map((r) => ({ url: r.path, home: r.path === '/' })),
  ...entries.map((e) => ({ url: pathFor(e), home: false })),
  // The passkey door: private, noindex, so not in the sitemap, but still a page
  // and still dressed. Added explicitly.
  { url: '/login', home: false },
]

const DEFAULT_DESCRIPTION = site.description

function pick(re, body) {
  const m = body.match(re)
  return m ? m[1].trim() : null
}

describe('Page furniture: every route declares its meta', () => {
  it('the derived list covers the representative content routes', () => {
    // Guards the derivation itself: a fork that stopped emitting a kind would
    // silently shrink the coverage. The fixtures name what must be in the list.
    const urls = new Set(PAGES.map((p) => p.url))
    assert.ok(urls.has(`/work/${FIXTURES.caseStudy}`), 'a case study is guarded')
    assert.ok(urls.has(`/${FIXTURES.experiment}`), 'an experiment is guarded')
    // External entries 302 (no head to dress), so they must NOT be in the list.
    assert.ok(!urls.has(`/feed/${FIXTURES.external}`), 'external entries are not furniture routes')
  })

  for (const page of PAGES) {
    // mutation: page-furniture.bare-title
    it(`${page.url} carries title + description + canonical`, async () => {
      const r = await app.inject({ method: 'GET', url: page.url })
      assert.equal(r.statusCode, 200, `${page.url} should return 200`)

      const title = pick(/<title>([^<]*)<\/title>/, r.body)
      const description = pick(/<meta name="description" content="([^"]*)"/, r.body)
      const canonical = pick(/<link rel="canonical" href="([^"]*)"/, r.body)

      assert.ok(title, `${page.url} has a non-empty <title>`)
      assert.ok(description, `${page.url} has a non-empty meta description`)
      assert.ok(
        canonical && canonical.startsWith(site.url),
        `${page.url} has an absolute canonical (got ${canonical})`
      )

      if (!page.home) {
        assert.match(
          title,
          new RegExp(`·\\s*${site.name}`),
          `${page.url} declares its own "<name> · ${site.name}" title, not the bare default (got "${title}")`
        )
        assert.notEqual(
          description,
          DEFAULT_DESCRIPTION,
          `${page.url} declares its own meta description, not the site default`
        )
      }
    })
  }
})
