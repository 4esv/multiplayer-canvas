// test/jsonld.test.js
// The machine-readable identity, guarded end to end:
//
//   1. Every served application/ld+json block parses as JSON. A typo here is
//      invisible in a browser and fatal to a crawler, which is exactly the
//      kind of drift that needs a test instead of an eyeball.
//   2. The home page carries the Person: right name, right title, and a
//      sameAs roster that names every profile the identity module owns.
//   3. /about is a ProfilePage whose main entity is that same person.
//   4. Every case study and locally hosted article carries an Article node
//      whose headline and datePublished match the entry's own frontmatter.
//   5. The rel="me" head links and the served manifest stay inside the
//      identity the site config names, so no surface tells a different
//      story about who the owner is or where else they live.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from '../src/server.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { STATIC_ROUTES } from '../src/routes/sitemap.js'
import { PERSON, PROFILES } from '../src/lib/identity.js'
import { isCaseStudy, isWriting, pathFor } from '../src/lib/entry-kind.js'
import site from '../site.config.js'

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

const get = async (url) => {
  const r = await app.inject({ method: 'GET', url })
  assert.equal(r.statusCode, 200, `${url} should return 200`)
  return r.body
}

const blocksOf = (body) =>
  [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])

// A parsed page's nodes, flattened whether the doc is a single node or @graph.
const nodesOf = (body) =>
  blocksOf(body).flatMap((raw) => {
    const doc = JSON.parse(raw)
    assert.equal(doc['@context'], 'https://schema.org')
    return doc['@graph'] || [doc]
  })

const entries = (await loadFeedEntries()).filter((e) => !e.hidden && !e.externalUrl)
const PAGES = [...STATIC_ROUTES.map((r) => r.path), ...entries.map((e) => pathFor(e))]

describe('JSON-LD is valid wherever it ships', () => {
  for (const url of PAGES) {
    it(`${url}: every ld+json block parses and cannot close its own tag`, async () => {
      const body = await get(url)
      for (const raw of blocksOf(body)) {
        JSON.parse(raw)
        // The serializer escapes `<`, so no payload can smuggle </script>.
        assert.ok(!raw.includes('<'), `${url} ld+json contains a raw '<'`)
      }
    })
  }
})

describe('the home page says who the site is', () => {
  it('the title leads with the name', async () => {
    const body = await get('/')
    assert.ok(body.includes(`<title>${site.name}</title>`))
  })

  it('carries the Person with the full profile roster', async () => {
    const person = nodesOf(await get('/')).find((n) => n['@type'] === 'Person')
    assert.ok(person, 'home page has a Person node')
    // The config, not PERSON.*: comparing the served value against the
    // module it was built from can never fail.
    assert.equal(person.name, site.author.name)
    assert.equal(person.jobTitle, site.author.jobTitle)
    assert.equal(person.description, site.description)
    assert.equal(person.email, `mailto:${site.author.email}`)
    // the roster is the config's, verbatim
    assert.deepEqual(person.sameAs, Object.values(site.social))
  })

  it('carries the WebSite published by that person', async () => {
    const node = nodesOf(await get('/')).find((n) => n['@type'] === 'WebSite')
    assert.ok(node, 'home page has a WebSite node')
    assert.equal(node.name, site.name)
    assert.equal(node.publisher['@id'], `${site.url}/#person`)
  })

  it('the rel="me" links stay inside the identity roster', async () => {
    const body = await get('/')
    const me = [...body.matchAll(/<link rel="me" href="([^"]+)">/g)].map((m) => m[1])
    assert.equal(me.length, Object.keys(site.social).length, 'one rel="me" per profile')
    const known = new Set(Object.values(PROFILES))
    for (const href of me) {
      assert.ok(known.has(href), `rel="me" ${href} is not in identity PROFILES`)
    }
  })
})

describe('/about is the profile page', () => {
  it('is a ProfilePage whose main entity is the person', async () => {
    const page = nodesOf(await get('/about')).find((n) => n['@type'] === 'ProfilePage')
    assert.ok(page, '/about has a ProfilePage node')
    assert.equal(page.mainEntity['@type'], 'Person')
    assert.equal(page.mainEntity.name, PERSON.name)
  })
})

describe('articles say who wrote them and when', () => {
  // Case studies and locally hosted writing are the article surfaces; both
  // derive from the loader, so a new entry arrives guarded.
  const articles = entries.filter((e) => isCaseStudy(e) || isWriting(e))

  it('the derivation found a case study and an article', () => {
    assert.ok(articles.some(isCaseStudy), 'a case study is covered')
    assert.ok(articles.some(isWriting), 'an article is covered')
  })

  for (const entry of articles) {
    it(`${pathFor(entry)}: Article matches the entry's frontmatter`, async () => {
      const article = nodesOf(await get(pathFor(entry))).find((n) => n['@type'] === 'Article')
      assert.ok(article, 'page has an Article node')
      assert.equal(article.headline, entry.title)
      assert.equal(article.datePublished, entry.date)
      assert.equal(article.author.name, PERSON.name)
      assert.equal(article.author['@id'], `${site.url}/#person`)
      assert.equal(article.mainEntityOfPage, `${site.url}${pathFor(entry)}`)
    })
  }
})

// The PWA manifest's icons and colours are static JSON; its identity fields
// are added from the config when it is served (routes/meta.js).
describe('the manifest does not fork the identity line', () => {
  it('carries the site description verbatim', async () => {
    const manifest = JSON.parse(await get('/manifest.json'))
    assert.equal(manifest.description, PERSON.description)
    assert.equal(manifest.name, site.name)
    const file = JSON.parse(
      await readFile(new URL('../src/static/manifest.json', import.meta.url), 'utf8')
    )
    assert.equal(file.name, undefined, 'the static file carries no identity of its own')
  })
})
