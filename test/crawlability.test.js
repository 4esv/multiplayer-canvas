// test/crawlability.test.js
// The two ways a page can be served but not reachable, guarded.
//
//   1. Trailing slash. `/work/` 404'd while `/work` served, so every
//      hand-typed or hand-written slash was a dead link and a Search Console
//      "Not found (404)" row. server.js 301s the slash away.
//   2. The home document's body. `/` is the only canvas route that SSRs no
//      sheet, so it shipped one h1 and three nav links: eighteen words. Every
//      LLM crawler (GPTBot, ClaudeBot, PerplexityBot) reads raw HTML and runs
//      no JS, and `/` is the page an assistant fetches first. routes/home.js
//      SSRs the same index the canvas paints, inside #prelude.
//
// Both are invisible from a browser - the canvas paints identically either
// way - which is exactly why they need a test rather than an eyeball.
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'
import { STATIC_ROUTES } from '../src/routes/sitemap.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { PHRASES } from '../src/static/canvas/hero-cycle.js'
import { COMMANDS } from '../src/static/canvas/commands.js'
import { pathFor } from '../src/lib/entry-kind.js'
import { FIXTURES } from './fixtures.js'

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

// A crawler-shaped client: no JS, reads what the server sent. The UA is a
// real one, and deliberately not a terminal or retro string - those get the
// text and HTML 3.2 variants, which were never the problem.
const CRAWLER = { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)' }

// What a public reader genuinely cannot act on (the reasons are in the
// test that walks every page, below).
const INTERNAL = [
  ['repo doc', /\b(BIBLE|README|DESIGN|CANVAS|MEMORY)\.md\b/],
  ['repo path', /\b(content\/feed\/|src\/(routes|static|templates|lib|services)\/|sandbox\/)/],
  ['test file', /\b[a-z-]+\.test\.js\b/],
  ['repo phrase', /\brepo root\b|\bcanvas-lab\b|\bnode_modules\b/],
  ['guard name', /\b(bible-sync|ink-chrome|px-tokens|og-freshness|page-furniture)\b/],
  ['comment tag', /\b(TODO|FIXME|HACK|XXX):/],
  ['dead stylesheet', /\b(foundation|skeuo)\.css\b/],
]

const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]*>/g, ' ')

describe('trailing slashes redirect to the canonical path', () => {
  // Driven off STATIC_ROUTES so a new static route arrives guarded, the same
  // way page-furniture derives its coverage.
  for (const { path } of STATIC_ROUTES.filter((r) => r.path !== '/')) {
    it(`301s ${path}/ to ${path}`, async () => {
      const r = await app.inject({ method: 'GET', url: `${path}/` })
      assert.equal(r.statusCode, 301)
      assert.equal(r.headers.location, path)
    })
  }

  it('301s a content detail path', async () => {
    const r = await app.inject({ method: 'GET', url: `/work/${FIXTURES.caseStudy}/` })
    assert.equal(r.statusCode, 301)
    assert.equal(r.headers.location, `/work/${FIXTURES.caseStudy}`)
  })

  it('keeps the query string across the redirect', async () => {
    const r = await app.inject({ method: 'GET', url: '/work/?view=text' })
    assert.equal(r.statusCode, 301)
    assert.equal(r.headers.location, '/work?view=text')
  })

  it('collapses a repeated slash rather than bouncing once per slash', async () => {
    const r = await app.inject({ method: 'GET', url: '/work///' })
    assert.equal(r.statusCode, 301)
    assert.equal(r.headers.location, '/work')
  })

  it('leaves the root alone (it is not a trailing slash)', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.equal(r.statusCode, 200)
  })

  it('the redirect target actually serves', async () => {
    const r = await app.inject({ method: 'GET', url: '/work/' })
    const followed = await app.inject({ method: 'GET', url: r.headers.location })
    assert.equal(followed.statusCode, 200)
  })
})

describe('the home document is readable without JavaScript', () => {
  it('names the owner and the site in the served HTML', async () => {
    const r = await app.inject({ method: 'GET', url: '/', headers: CRAWLER })
    assert.equal(r.statusCode, 200)
    const text = textOf(r.body)
    assert.ok(text.includes(site.author.name), 'the owner is named')
    assert.ok(text.includes(site.description), 'the site says what it is')
  })

  it('carries every case study and feed entry as a real anchor', async () => {
    const r = await app.inject({ method: 'GET', url: '/', headers: CRAWLER })
    // The canvas paints these as tiles; a crawler that runs no JS has only
    // the SSR'd index. Anchors, not text: an orphaned title is not a link.
    for (const slug of [FIXTURES.caseStudy, FIXTURES.experiment]) {
      assert.ok(
        r.body.includes(`/work/${slug}"`) || r.body.includes(`/${slug}"`),
        `home SSR is missing a link to ${slug}`
      )
    }
    assert.ok(r.body.includes(FIXTURES.externalUrl), 'home SSR is missing the external entry link')
  })

  it('holds enough prose to summarise, not just a hero line', async () => {
    // The floor is a regression bar, not a target: the shipped index is
    // ~220 words and the pre-fix shell was 18. Anything near the shell means
    // the index stopped rendering.
    const r = await app.inject({ method: 'GET', url: '/', headers: CRAWLER })
    const words = textOf(r.body).split(/\s+/).filter(Boolean).length
    assert.ok(words > 120, `home SSR carries only ${words} words of text`)
  })

  it('does not double the index onto routes that SSR a sheet', async () => {
    // /work, /feed and /about render the same template with their sheet open.
    // They already ship their prose; a second copy would be duplicate content.
    for (const path of ['/work', '/feed', '/about']) {
      const r = await app.inject({ method: 'GET', url: path, headers: CRAWLER })
      assert.ok(!r.body.includes('id="preludeIndex"'), `${path} rendered the home index too`)
    }
  })

  // mutation: crawlability.phrases-reordered
  it('opens on the statement the phrase list opens on', async () => {
    // The h1 is SSR'd so no-JS readers and crawlers get a statement, and it is
    // PHRASES[0] so the document and the canvas are saying the same kind of
    // thing in the same words. It is read from the module rather than regexed
    // out of a source file, which is what the old version of this did and what
    // let it keep passing against a file the phrases had moved out of.
    //
    // NOTE: the canvas no longer boots ON this phrase. The statement runs on a
    // clock-derived schedule shared by every open tab (canvas/hero-cycle.js),
    // so a visitor joins it wherever the room has got to. There is no handoff
    // to protect: #prelude is held back 600ms and only ever paints when a boot
    // is slow enough to need it.
    const first = PHRASES[0]
    assert.ok(first, 'the phrase list is empty')

    // what the server sends, not what the template says: the template's own
    // text was the second copy that could agree with itself
    const r = await app.inject({ method: 'GET', url: '/', headers: CRAWLER })
    const h1 = r.body.match(/<h1>([^<]+)<\/h1>/)?.[1]
    assert.equal(h1, first, 'the SSR h1 and PHRASES[0] have drifted apart')
  })

  it('llms.txt lists every locally hosted page as a real markdown link', async () => {
    // The hand-kept file listed URL shapes (`/feed/<slug>`) instead of pages,
    // so it went stale on every publish and parsed as prose with no links in
    // it. Generated from the same loader the sitemap uses, it cannot drift -
    // this asserts that, and that the format stayed link-shaped.
    const r = await app.inject({ method: 'GET', url: '/llms.txt' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.ok(r.body.startsWith(`# ${site.name}\n`), 'llms.txt needs an H1 title')
    assert.match(r.body, /^> /m, 'llms.txt needs a blockquote summary')

    const links = [...r.body.matchAll(/\]\((https?:\/\/[^)]+|mailto:[^)]+)\)/g)].map((m) => m[1])
    assert.ok(links.length > 10, `llms.txt has only ${links.length} links`)

    // Every entry the site hosts or aggregates must appear.
    const entries = (await loadFeedEntries()).filter((e) => !e.hidden)
    for (const e of entries) {
      const want = e.externalUrl || `${site.url}${pathFor(e)}`
      assert.ok(links.includes(want), `llms.txt is missing ${e.slug} (${want})`)
    }
  })

  it('every link to the site itself in llms.txt actually serves', async () => {
    const r = await app.inject({ method: 'GET', url: '/llms.txt' })
    const paths = [...r.body.matchAll(/\]\((https?:\/\/[^)]+)\)/g)]
      .map((m) => m[1])
      .filter((u) => u.startsWith(site.url))
      .map((u) => u.slice(site.url.length) || '/')
    assert.ok(paths.length > 8)
    for (const p of new Set(paths)) {
      const res = await app.inject({ method: 'GET', url: p })
      assert.ok(res.statusCode < 400, `llms.txt points at ${p}, which returns ${res.statusCode}`)
    }
  })

  it('never names a repo-internal thing on a public surface', async () => {
    // llms.txt shipped "the design contract is BIBLE.md at the repo root" to
    // every crawler: a pointer at a file no reader outside the repo can open,
    // in the one document written to be machine-cached. The site is external.
    // Internal names belong in comments - the build strips them from CSS and
    // Nunjucks never renders its own - not in a response body.
    //
    // Trimmed to what a public reader genuinely cannot act on. Deliberately
    // NOT here: the stack (Fastify, Nunjucks) is named in /about on purpose,
    // because "no client-side framework" is why the terminal and retro paths
    // work at all, and sw-register.js tests location.hostname against
    // localhost as a real runtime guard. Both scanned as hits, both are
    // correct, so the pattern set excludes them rather than carrying
    // exceptions that would rot.
    // Every page the site publishes, derived rather than listed, so a new
    // route or entry is covered the day it ships.
    const entries = (await loadFeedEntries()).filter((e) => !e.hidden && !e.externalUrl)
    const paths = [
      ...STATIC_ROUTES.map((r) => r.path),
      ...entries.map(pathFor),
      '/llms.txt',
      '/robots.txt',
      '/humans.txt',
      '/feed.xml',
      '/sitemap.xml',
      '/manifest.json',
      '/.well-known/security.txt',
    ]

    // and the text front doors, as curl reads them
    const requests = paths.map((url) => ({ url, headers: {} }))
    for (const url of ['/', '/llms.txt', '/about'])
      requests.push({ url, headers: { 'user-agent': 'curl/8.7.1' } })

    for (const { url, headers } of requests) {
      const r = await app.inject({ method: 'GET', url, headers })
      if (r.statusCode >= 400) continue
      for (const [label, re] of INTERNAL) {
        const hit = r.body.match(re)
        assert.ok(!hit, `${headers.host || ''}${url} leaks a ${label}: "${hit?.[0]}"`)
      }
    }
  })

  it('the command roster says nothing a reader cannot act on', () => {
    // the bar's commands are served as they are written: their usage and
    // their few words show in the roster and in /help, to anybody
    for (const c of COMMANDS)
      for (const text of [c.usage, c.about])
        for (const [label, re] of INTERNAL)
          assert.ok(!re.test(text), `/${c.name} says a ${label}: "${text}"`)
  })

  it('offers a skip link past the tiles, aimed at what the page actually is', async () => {
    // The tiles mount into #scene, which precedes the topbar in the DOM, so a
    // keyboard user tabbed through two dozen tiles to reach the doors. The
    // target differs by route: a page that SSRs a sheet has real content to
    // skip TO, the bare canvas only has the nav.
    const home = await app.inject({ method: 'GET', url: '/', headers: CRAWLER })
    assert.match(
      home.body,
      /<a class="skip k-btn k-solid" href="#search"/,
      'the canvas needs a skip link to the field (the bar is the field)'
    )
    assert.match(home.body, /<input id="search"/, 'the jump target is the field itself')

    const feed = await app.inject({ method: 'GET', url: '/feed', headers: CRAWLER })
    assert.match(
      feed.body,
      /<a class="skip k-btn k-solid" href="#sheet"/,
      '/feed should skip to its sheet'
    )
    // /work is the work stack fanned out by the script and /about lands the
    // camera on a zone (BIBLE.md section 5): nothing is SSRd open, so the
    // skip aims at the field like the bare canvas does
    for (const path of ['/work', '/about']) {
      const r = await app.inject({ method: 'GET', url: path, headers: CRAWLER })
      assert.match(
        r.body,
        /<a class="skip k-btn k-solid" href="#search"/,
        `${path} skips to the field`
      )
    }
  })

  it('keeps the index out of the way of the canvas (hidden until noscript reveals it)', async () => {
    // app.js removes #prelude on boot; until then the stylesheet must keep it
    // display:none, or the index flashes over the canvas on every load.
    const r = await app.inject({ method: 'GET', url: '/', headers: CRAWLER })
    assert.ok(r.body.includes('id="prelude"'))
    assert.ok(r.body.includes('<noscript>'), 'the noscript reveal is what makes the index visible')
  })
})
