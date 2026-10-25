// test/retro.test.js
// The third output mode: minimal HTML 3.2 for ancient graphical browsers,
// alongside the curl text path and the modern site. The load-bearing
// invariant is that no modern client (browser OR scraper) is ever downgraded
// to retro; the rest verifies old browsers (the whole IE family included)
// do get it, that it is real navigable HTML, and that the web-only fix holds.
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'
import { FIXTURES } from './fixtures.js'
import { STATIC_ROUTES } from '../src/routes/sitemap.js'

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

const RETRO_DOCTYPE = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">'

function get(url, userAgent) {
  return app.inject({ method: 'GET', url, headers: userAgent ? { 'user-agent': userAgent } : {} })
}

// Real user-agent strings, kept verbatim so the test doubles as documentation
// of exactly which clients land where.
const UA = {
  ie6: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)',
  ie8: 'Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 5.1; Trident/4.0)',
  ie10: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)',
  ie11: 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
  netscape3: 'Mozilla/3.0 (Win95; I)',
  // The rest of the oldweb.today roster that is Mozilla/5.0 + an old token.
  netscape7: 'Mozilla/5.0 (Windows; U; Win98; en-US; rv:1.0.1) Gecko/20020823 Netscape/7.0',
  seamonkey: 'Mozilla/5.0 (X11; Linux i686; rv:1.8.1) Gecko/20061010 SeaMonkey/1.0',
  prestoOpera: 'Opera/9.80 (Windows NT 6.1; WOW64) Presto/2.12.388 Version/12.16',
  mosaic: 'NCSA_Mosaic/2.0 (Windows 3.1)',
  // Modern Firefox: the regression trap. It ships Gecko/20100101 forever, so
  // the Gecko/200x rule must NOT catch it.
  firefox: 'Mozilla/5.0 (Windows NT 10.0; rv:121.0) Gecko/20100101 Firefox/121.0',
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  twitter: 'Twitterbot/1.0',
  curl: 'curl/8.4.0',
}

describe('Retro mode: modern clients are never downgraded', () => {
  // The site's whole pitch is "same on a watch and a video wall." A current
  // browser getting the HTML 3.2 page would be the one true regression.
  for (const [name, ua] of [
    ['Chrome', UA.chrome],
    ['Safari', UA.safari],
    ['Modern Firefox (Gecko/20100101)', UA.firefox],
  ]) {
    it(`serves the full site to ${name}`, async () => {
      const r = await get('/', ua)
      assert.equal(r.statusCode, 200)
      assert.match(r.headers['content-type'], /text\/html/)
      assert.ok(!r.body.includes(RETRO_DOCTYPE), `${name} must not get the retro doctype`)
      assert.ok(r.body.includes('id="stage"'), `${name} gets the real modern home (the canvas)`)
    })
  }

  // OG/link scrapers need the modern <head> (canonical, og:*), so they must
  // stay on the full site too.
  for (const [name, ua] of [
    ['Googlebot', UA.googlebot],
    ['facebookexternalhit', UA.facebook],
    ['Twitterbot', UA.twitter],
  ]) {
    it(`serves the full site (with OG tags) to ${name}`, async () => {
      const r = await get('/', ua)
      assert.equal(r.statusCode, 200)
      assert.match(r.headers['content-type'], /text\/html/)
      assert.ok(!r.body.includes(RETRO_DOCTYPE), `${name} must not get retro`)
      assert.ok(r.body.includes('og:title'), `${name} still gets Open Graph meta`)
    })
  }
})

describe('Retro mode: old browsers get HTML 3.2', () => {
  for (const [name, ua] of [
    ['IE6 / Windows XP', UA.ie6],
    ['IE8 / Windows XP', UA.ie8],
    ['IE10', UA.ie10],
    ['IE11', UA.ie11],
    ['Netscape 3', UA.netscape3],
    ['Netscape 7', UA.netscape7],
    ['SeaMonkey / old Gecko', UA.seamonkey],
    ['Presto-era Opera', UA.prestoOpera],
    ['NCSA Mosaic', UA.mosaic],
  ]) {
    it(`serves retro HTML to ${name}`, async () => {
      const r = await get('/', ua)
      assert.equal(r.statusCode, 200)
      // Retro is HTML, not the curl text path.
      assert.match(r.headers['content-type'], /text\/html/)
      assert.ok(r.body.startsWith(RETRO_DOCTYPE), `${name} gets the HTML 3.2 doctype`)
    })
  }

  it('the retro page is real, navigable HTML', async () => {
    const r = await get('/', UA.ie6)
    // The ground via HTML 3.2 presentational attributes, no stylesheet; that
    // the literal is the token is test/palette.test.js's to prove.
    assert.ok(r.body.includes('<body bgcolor="#'), 'two-ink ground background')
    assert.ok(!r.body.includes('<link rel="stylesheet"'), 'no CSS the old browser cannot use')
    // The text nav is linkified into clickable anchors.
    assert.ok(r.body.includes('href="/work"'), 'nav paths are real links')
    assert.ok(r.body.includes(`href="mailto:${site.author.email}"`), 'email is a mailto link')
    assert.ok(r.body.includes(`href="${site.social.github}"`), 'bare URLs are linkified')
  })

  it('every static page renders in retro without error', async () => {
    for (const url of ['/', '/about', '/work', '/feed', `/work/${FIXTURES.caseStudy}`]) {
      const r = await get(url, UA.ie6)
      assert.equal(r.statusCode, 200, `${url} renders for IE6`)
      assert.ok(r.body.startsWith(RETRO_DOCTYPE), `${url} is retro HTML`)
    }
  })

  it('long lines are hard-wrapped so a relic never scrolls sideways', async () => {
    const r = await get(`/work/${FIXTURES.caseStudy}`, UA.ie6)
    const pre = r.body.slice(r.body.indexOf('<pre>') + 5, r.body.indexOf('</pre>'))
    // Anchors can legitimately exceed the wrap width (a single long URL token
    // is never broken); plain prose lines must not.
    const longProse = pre.split('\n').filter((line) => !line.includes('href=') && line.length > 78)
    assert.deepEqual(longProse, [], 'no un-linkified prose line exceeds 78 columns')
  })

  it('folds decorative glyphs to ASCII so a thin-font relic shows no mojibake', async () => {
    const r = await get(`/work/${FIXTURES.caseStudy}`, UA.ie6)
    const pre = r.body.slice(r.body.indexOf('<pre>') + 5, r.body.indexOf('</pre>'))
    // No glyph leaks into the page; the fold MAPPING itself is pinned by the
    // retroText unit test in test/lib/template-helpers.test.js.
    for (const glyph of ['→', '←', '·', '‘', '’', '“', '”', '—']) {
      assert.ok(!pre.includes(glyph), `decorative ${JSON.stringify(glyph)} is folded away`)
    }
  })

  // mutation: retro.no-vary
  it('carries Vary: User-Agent so caches keep the variants apart', async () => {
    const r = await get('/', UA.ie6)
    assert.equal(r.headers['vary'], 'User-Agent')
  })
})

describe('Web-only entries', () => {
  // The whole class of interactive-only pages, not just the one the user
  // named: each is the widget, so stripped of its markup there is no readable
  // prose to show. `leak` is a token from each page's interactive guts that
  // must NOT survive into the text/retro output.
  const WEB_ONLY = [
    { slug: FIXTURES.experiment, leak: '𝄞' }, // lone clef glyph, the entire pre-fix body
  ]

  for (const { slug, leak } of WEB_ONLY) {
    it(`curl gets a plain "web only" note for /${slug}, not markup soup`, async () => {
      const r = await get(`/${slug}`, UA.curl)
      assert.equal(r.statusCode, 200)
      assert.match(r.headers['content-type'], /text\/plain/)
      assert.ok(r.body.includes('web only'), 'says it is web only')
      assert.ok(!r.body.includes(leak), `no leaked widget internals (${leak})`)
    })

    it(`an old browser gets the same web-only note for /${slug}`, async () => {
      const r = await get(`/${slug}`, UA.ie6)
      assert.ok(r.body.startsWith(RETRO_DOCTYPE))
      assert.ok(r.body.includes('web only'))
      assert.ok(!r.body.includes(leak))
    })
  }

  it('a prose entry still renders its prose in retro', async () => {
    const r = await get(`/work/${FIXTURES.caseStudy}`, UA.ie6)
    assert.ok(r.body.includes('retyped each one by hand'), 'real prose text is present')
  })
})

describe('Terminal tier: entry bodies are real text (the html-to-text pass)', () => {
  // feed/entry.njk renders entry.html through the htmlToText filter. The
  // transform itself is pinned unit-by-unit in test/lib/template-helpers.test.js;
  // this proves it against the real content on both the curl and retro paths.

  it('curl on a case study reads as clean prose', async () => {
    const r = await get(`/work/${FIXTURES.caseStudy}`, UA.curl)
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.ok(r.body.includes('Node[1]'), 'footnote marker renders as [n]')
    assert.ok(!r.body.includes('```'), 'no markdown fences leak')
    assert.ok(!r.body.includes('<p>'), 'no raw HTML leaks')
  })

  it('code blocks arrive as indented text, internals intact', async () => {
    const r = await get(`/work/${FIXTURES.caseStudy}`, UA.curl)
    assert.ok(r.body.includes('\n    function readOrder'), 'code is four-space indented')
    assert.ok(r.body.includes("source: 'email'"), 'hljs entities are decoded')
  })

  it('svg innards, figure captions, and footnote bodies are dropped', async () => {
    for (const [name, body] of [
      ['curl', (await get(`/work/${FIXTURES.caseStudy}`, UA.curl)).body],
      ['retro', (await get(`/work/${FIXTURES.caseStudy}`, UA.ie6)).body],
    ]) {
      // "file it in the system" is a step inside the figure's SVG; "Drawn on
      // the cell" is the figure-note; "pdf.js" lives only in the footnote body.
      assert.ok(!body.includes('file it in the system'), `${name}: svg text labels are dropped`)
      assert.ok(!body.includes('Drawn on the cell'), `${name}: figure captions dropped`)
      assert.ok(!body.includes('pdf.js'), `${name}: footnote bodies dropped`)
      assert.ok(body.includes('Node[1]'), `${name}: footnote marker survives`)
    }
  })
})

describe('Terminal tier: label columns are machined to one width', () => {
  // Every "label value" column across the text templates pads its label to
  // 12 characters, so the tier reads as one machined surface page to page.
  const LABELS = new Set([
    site.url.replace(/^https?:\/\//, ''),
    'work',
    'feed',
    'about',
    'email',
    'github',
    'prior',
    'next',
    'up',
    'code',
  ])
  const LABEL_LINE = /^([a-z@.]+)( +)\S/

  it('every label column starts its value at column 13', async () => {
    let seen = 0
    for (const url of ['/', '/feed', '/about', `/work/${FIXTURES.caseStudy}`]) {
      const r = await get(url, UA.curl)
      for (const line of r.body.split('\n')) {
        const m = line.match(LABEL_LINE)
        if (!m || !LABELS.has(m[1])) continue
        seen += 1
        assert.equal(
          (m[1] + m[2]).length,
          12,
          `${url}: ${JSON.stringify(line.slice(0, 20))} pads its label to 12`
        )
      }
    }
    // The pin is only worth something if the scan actually caught the columns.
    assert.ok(seen >= 12, `found ${seen} label lines across the tier (expected 12+)`)
  })
})

describe('Retro mode: ?view= override', () => {
  it('?view=retro forces retro for a modern browser', async () => {
    const r = await get('/?view=retro', UA.chrome)
    assert.ok(r.body.startsWith(RETRO_DOCTYPE))
  })

  it('?view=full forces the modern site for an old browser', async () => {
    const r = await get('/?view=full', UA.ie6)
    assert.ok(!r.body.includes(RETRO_DOCTYPE))
    assert.ok(r.body.includes('id="stage"'))
  })

  it('?view=text forces the plain-text path for a modern browser', async () => {
    const r = await get('/?view=text', UA.chrome)
    assert.match(r.headers['content-type'], /text\/plain/)
  })
})

// The text tier is text. An autoescaped value reaches curl as `O&#39;Sullivan`
// and the retro filter, escaping the block again, prints `O&amp;#39;Sullivan`;
// the live last-played line shipped exactly that until 2026-09-12. This bites
// only when the data carries such a character, so it is a tripwire rather
// than a proof: the fix is `| safe` on every value the text templates print.
describe('Text mode: no html entity survives into plain text', () => {
  for (const { path } of STATIC_ROUTES) {
    it(`${path} for curl carries no entities`, async () => {
      const r = await get(path, UA.curl)
      assert.equal(r.statusCode, 200)
      assert.doesNotMatch(
        r.body,
        /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i,
        `${path} leaks an entity`
      )
    })
  }
})
