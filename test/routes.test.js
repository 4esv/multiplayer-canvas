// test/routes.test.js
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'
import { buildFeedSheet } from '../src/lib/canvas-sheets.js'
import { FIXTURES } from './fixtures.js'

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

describe('Page routes', () => {
  it('GET / returns 200 HTML with the canvas stage (the V2 home)', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/html/)
    assert.ok(r.body.includes('id="stage"'), 'home is the infinite canvas')
    assert.ok(r.body.includes('/canvas/app.js'), 'canvas app is external (CSP: no inline scripts)')
    assert.ok(!r.body.includes('<script type="module">\n'), 'no inline module script survives')
  })

  it('GET / carries real section links and a no-js document', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    // The bar is the field (BIBLE.md section 8): no menu. The prelude is the
    // no-JS document and its links are real, so crawlers, middle-click and
    // no-JS browsers all go somewhere.
    assert.ok(!r.body.includes('id="menu"'), 'the menu is gone')
    assert.ok(!r.body.includes('id="logo"'), 'the home button is gone')
    assert.match(r.body, /href="\/work"/)
    assert.match(r.body, /href="\/about"/)
    assert.match(r.body, /href="\/feed"/)
    assert.match(
      r.body,
      /<noscript><style>[^<]*#prelude\{position:fixed/,
      'a noscript style reveals the prelude when js is off'
    )
    // Cascade pin: the reveal shares its selector with canvas-home.css's
    // display:none, so it only wins if its <style> comes after that
    // stylesheet's <link> in source order.
    const base = r.body.indexOf('/css/canvas-home')
    const reveal = r.body.indexOf('#prelude{position:fixed')
    assert.ok(base !== -1 && reveal > base, 'the noscript reveal must follow the canvas-home link')
  })

  it('GET / page sheet is dialog-shaped for assistive tech', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.match(r.body, /id="modal"[^>]*role="dialog"/)
    // Deliberately NOT aria-modal: the topbar (the close, the omni search)
    // stays interactive over an open sheet; the canvas is inerted instead.
    assert.ok(!/id="modal"[^>]*aria-modal/.test(r.body), 'aria-modal would hide the topbar')
    assert.match(r.body, /id="sheet"[^>]*tabindex="-1"/, 'the sheet is focusable on open')
  })

  it('GET / SSRs the boot payload the canvas tiles read', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    const m = r.body.match(/<script type="application\/json" id="boot">(.*?)<\/script>/s)
    assert.ok(m, 'the boot JSON tag is in the shell')
    // Structure only: values may be the snapshot or a completed live refresh.
    const boot = JSON.parse(m[1])
    for (const key of ['weather', 'pages', 'zones', 'slime']) {
      assert.ok(boot[key], `boot payload carries ${key}`)
    }
    // The routed-pages index replaced content.gen.js: sections plus entries.
    assert.ok(boot.pages.work && boot.pages.feed && boot.pages.about, 'section doors indexed')
    // Doors carry their sheet body so a client-side open paints whole even
    // if /api/sheet is unreachable.
    assert.ok(boot.pages.work.body.includes('Case Studies'), 'work door ships its body')
    assert.ok(boot.pages.about.body.includes('reach me'), 'about door ships its body')
    assert.ok(
      !boot.pages[FIXTURES.external],
      'external entries are tiles that link out, never routed pages'
    )
    assert.equal(
      boot.pages[FIXTURES.experiment].path,
      `/${FIXTURES.experiment}`,
      'experiments route at the root'
    )
    assert.equal(boot.pages[FIXTURES.caseStudy].path, `/work/${FIXTURES.caseStudy}`)
    assert.ok(!r.body.includes('content.gen.js'), 'the baked content script is gone')
  })

  it('GET /api/page/<experiment> returns the entry as data for the canvas', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/page/${FIXTURES.experiment}` })
    assert.equal(r.statusCode, 200)
    const page = JSON.parse(r.body)
    assert.equal(page.title, 'Web Instruments')
    assert.ok(page.html.includes('carousel'), 'payload carries the widget markup')
    assert.ok(page.css.includes('/css/entry.css'), 'the entry stylesheet chain rides along')
    assert.ok(page.css.includes('/css/instruments.css'), 'plus the entry-specific css')
    assert.deepEqual(page.js, ['/js/instruments.js'])
  })

  it('GET /api/page/<case-study> serves case studies too (real figures in the modal)', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/page/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 200)
    const page = JSON.parse(r.body)
    assert.equal(page.type, 'case-study')
    assert.ok(page.css.includes('/css/case-study.css'), 'case studies carry the case-study kit')
    assert.ok(page.html.includes('<svg'), 'figures are markup, not residue')
  })

  it('GET /work returns 200', async () => {
    const r = await app.inject({ method: 'GET', url: '/work' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/html/)
  })

  it('GET /work/:slug returns 200 for a case study', async () => {
    const r = await app.inject({ method: 'GET', url: `/work/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 200)
    assert.ok(
      r.body.includes('<a class="k-btn k-ico k-close" href="/work"'),
      'the SSRd sheet carries the way back to /work'
    )
  })

  it('GET /work/:slug returns 404 for an unknown slug', async () => {
    const r = await app.inject({ method: 'GET', url: '/work/not-a-real-case-study' })
    assert.equal(r.statusCode, 404)
  })

  it('GET /feed returns 200 with the feed sheet open on the canvas', async () => {
    const r = await app.inject({ method: 'GET', url: '/feed' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/html/)
    assert.ok(r.body.includes('id="stage"'), '/feed is the canvas shell for modern browsers')
    assert.ok(r.body.includes(FIXTURES.externalUrl), '/feed links external entries where they live')
  })

  it('GET /feed/:slug 302s an external entry to where it was published', async () => {
    const r = await app.inject({ method: 'GET', url: `/feed/${FIXTURES.external}` })
    assert.equal(r.statusCode, 302)
    assert.equal(r.headers.location, FIXTURES.externalUrl)
  })

  it('GET /<experiment> returns 200: experiments live at the root', async () => {
    const r = await app.inject({ method: 'GET', url: `/${FIXTURES.experiment}` })
    assert.equal(r.statusCode, 200)
  })

  it('GET /feed/:slug 404s for a web experiment (those live at the root)', async () => {
    const r = await app.inject({ method: 'GET', url: `/feed/${FIXTURES.experiment}` })
    assert.equal(r.statusCode, 404)
  })

  it('GET /feed/:slug 404s for a case-study slug (those live under /work)', async () => {
    const r = await app.inject({ method: 'GET', url: `/feed/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 404)
  })

  it('GET /feed.xml returns an RSS document listing essays at /feed', async () => {
    const r = await app.inject({ method: 'GET', url: '/feed.xml' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /application\/rss\+xml/)
    assert.ok(r.body.includes('<rss'), 'is an RSS document')
    assert.ok(
      r.body.includes(FIXTURES.externalUrl),
      'external items link straight to where they were published'
    )
    assert.ok(
      !r.body.includes(`${site.url}/feed/${FIXTURES.external}`),
      'no local link for an entry that moved off-site'
    )
    assert.ok(
      !r.body.includes(`/feed/${FIXTURES.caseStudy}`) &&
        !r.body.includes(`/feed/${FIXTURES.experiment}`),
      'excludes case studies and web-only experiments'
    )
  })

  it('GET /sitemap.xml returns application/xml with site URLs', async () => {
    const r = await app.inject({ method: 'GET', url: '/sitemap.xml' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /application\/xml/)
    assert.ok(r.body.includes('<urlset'))
    assert.ok(r.body.includes(`${site.url}/work`))
  })

  it('GET /about returns 200', async () => {
    const r = await app.inject({ method: 'GET', url: '/about' })
    assert.equal(r.statusCode, 200)
  })
})

describe('Retired routes 404 (clean break, no redirect)', () => {
  for (const url of ['/www', '/web', '/music', '/doing', '/listening', '/life']) {
    it(`GET ${url} returns 404`, async () => {
      const r = await app.inject({ method: 'GET', url })
      assert.equal(r.statusCode, 404)
    })
  }
})

describe('Error pages', () => {
  it('GET /nonexistent returns 404', async () => {
    const r = await app.inject({ method: 'GET', url: '/nonexistent' })
    assert.equal(r.statusCode, 404)
  })

  it('404 HTML includes the requested path and a dashboard link', async () => {
    const r = await app.inject({ method: 'GET', url: '/clearly-not-real' })
    assert.equal(r.statusCode, 404)
    assert.ok(r.body.includes('/clearly-not-real'), 'requested path is shown')
    assert.ok(r.body.includes('href="/"'), 'has a link back to the dashboard')
  })

  it('404 plain-text variant for terminal clients', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/missing',
      headers: { 'user-agent': 'curl/8.4.0' },
    })
    assert.equal(r.statusCode, 404)
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.ok(r.body.includes('404'))
  })
})

describe('Terminal detection', () => {
  it('serves HTML to a regular browser', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'user-agent': 'Mozilla/5.0' },
    })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/html/)
  })

  it('serves text/plain to curl', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'user-agent': 'curl/8.4.0' },
    })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/plain/)
  })
})

describe('API routes', () => {
  it('GET /health returns ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(r.statusCode, 200)
    assert.equal(r.json().status, 'ok')
  })
})

describe('the feed sheet survives a bad external_url', () => {
  it('a garbage external_url degrades to a plain label, never throws the boot', () => {
    // A typo'd frontmatter URL used to reach new URL() unguarded and 500 the
    // home page. It must now build a plain item with no host label instead.
    const entries = [
      {
        slug: 'oops',
        title: 'Bad link',
        summary: 'has a broken url',
        date: '2026-07-24',
        externalUrl: 'not a url',
      },
      {
        slug: 'ok',
        title: 'Good link',
        summary: 'fine',
        date: '2026-07-23',
        externalUrl: 'https://notebooks.example.org/x',
      },
    ]
    let sheet
    assert.doesNotThrow(() => {
      sheet = buildFeedSheet(entries)
    })
    // The garbage entry still renders (title + href), just without a host tag.
    assert.ok(sheet.body.includes('Bad link'))
    assert.ok(sheet.body.includes('href="not a url"'))
    // The valid neighbor still gets its host label.
    assert.ok(sheet.body.includes('notebooks.example.org'))
  })
})

describe('feed.xml answers a conditional GET', () => {
  // Readers poll hourly forever. Without a validator every one of those polls
  // re-sent the whole feed, because nothing offered the reader a way to ask
  // "changed?". The ETag is over the rendered bytes, so it moves when an entry
  // does and only then.
  let app

  before(async () => {
    app = await build({ logger: false })
  })

  after(async () => {
    await app.close()
  })

  it('ships an ETag and Last-Modified', async () => {
    const r = await app.inject({ method: 'GET', url: '/feed.xml' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers.etag, /^"[A-Za-z0-9_-]+"$/)
    assert.ok(r.headers['last-modified'])
  })

  // mutation: routes.etag-ignored
  it('304s a matching If-None-Match, with no body', async () => {
    const first = await app.inject({ method: 'GET', url: '/feed.xml' })
    const second = await app.inject({
      method: 'GET',
      url: '/feed.xml',
      headers: { 'if-none-match': first.headers.etag },
    })
    assert.equal(second.statusCode, 304)
    assert.equal(second.body, '')
  })

  it('serves the body again when the validator does not match', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/feed.xml',
      headers: { 'if-none-match': '"not-the-current-etag"' },
    })
    assert.equal(r.statusCode, 200)
    assert.match(r.body, /<rss/)
  })

  it('is stable across identical requests', async () => {
    // A body that hashes differently every call would make the ETag useless
    // and every conditional GET a full download.
    const a = await app.inject({ method: 'GET', url: '/feed.xml' })
    const b = await app.inject({ method: 'GET', url: '/feed.xml' })
    assert.equal(a.headers.etag, b.headers.etag)
  })
})
