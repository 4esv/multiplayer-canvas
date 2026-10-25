// test/canvas-ssr.test.js
// Native canvas routes: a modern browser loading /work, /feed or /about gets
// the canvas shell with that sheet already open and its content SSR'd into
// the initial HTML (crawlers and no-JS readers get everything); terminal and
// retro clients keep their plain-text pages. /api/sheet serves the client
// router the same sheets.
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'
import { FIXTURES } from './fixtures.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const APP = readFileSync(join(import.meta.dirname, '../src/static/canvas/app.js'), 'utf8')

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

const sheetInner = (body) => {
  const m = body.match(/<div class="inner" id="sheetInner">([\s\S]*?)<\/div><\/div><\/div><\/div>/)
  assert.ok(m, 'the sheet container is in the shell')
  return m[1]
}

describe('section doors render the canvas shell with the sheet open', () => {
  it('GET /work is the canvas landing on the work zone, and /case-studies the pile fanned out', async () => {
    // BIBLE.md section 5 (2026-09-11): the work door goes to a section
    // beside the case studies, the way about does; the pile is its own page.
    const r = await app.inject({ method: 'GET', url: '/work' })
    assert.equal(r.statusCode, 200)
    assert.ok(r.body.includes('id="stage"'), 'the canvas shell is the document')
    assert.doesNotMatch(r.body, /id="modal" role="dialog" class="open[ "]/, 'no sheet is open')
    const boot = r.body.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)
    assert.ok(boot, 'the boot payload ships')
    const payload = JSON.parse(boot[1])
    // /work IS the case studies (2026-09-16): the WORK zone it used to land
    // the camera on was dropped into the about triptych.
    assert.equal(payload.fan, 'work', '/work fans the case studies')
    assert.ok(r.body.includes(`<title>work · ${site.name}</title>`), 'route meta rides the shell')
    assert.ok(r.body.includes(`href="${site.url}/work"`), 'canonical stays')
    const f = await app.inject({ method: 'GET', url: '/case-studies' })
    assert.equal(f.statusCode, 200)
    const fb = JSON.parse(
      f.body.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)[1]
    )
    assert.equal(fb.fan, 'work', '/case-studies spreads the pile before first paint')
    assert.ok(fb.pages[FIXTURES.caseStudy], 'the case studies ride the boot index the fan reads')
    assert.ok(f.body.includes(`href="${site.url}/case-studies"`), 'the pile has its own canonical')
  })

  it('GET /feed is the canvas with the feed sheet SSRd, articles only', async () => {
    const r = await app.inject({ method: 'GET', url: '/feed' })
    assert.equal(r.statusCode, 200)
    const inner = sheetInner(r.body)
    assert.ok(inner.includes('<h1>feed</h1>'))
    assert.ok(inner.includes(`href="${FIXTURES.externalUrl}"`))
    assert.ok(!inner.includes(FIXTURES.experiment), 'experiments live on the canvas, not the feed')
    assert.ok(!inner.includes(FIXTURES.caseStudy), 'case studies live behind /work')
    assert.ok(r.body.includes(`<title>feed · ${site.name}</title>`))
  })

  it('GET /about is the canvas landing on the about zone, its words in the prelude', async () => {
    // BIBLE.md section 5: about is a zone, not a sheet. The boot payload names
    // the landing, the zone's copy rides `zones`, and the same words stand in
    // the no-JS prelude for a reader without the script.
    const r = await app.inject({ method: 'GET', url: '/about' })
    assert.equal(r.statusCode, 200)
    assert.doesNotMatch(r.body, /id="modal" role="dialog" class="open[ "]/, 'no sheet is open')
    const boot = JSON.parse(
      r.body.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)[1]
    )
    assert.equal(boot.land, 'about')
    const about = boot.zones.find((z) => z.id === 'about')
    assert.ok(
      about && about.html.includes('This is example copy'),
      'the about zone carries the paragraph'
    )
    assert.ok(r.body.includes('id="preludeZones"'), 'the zones stand in the prelude')
    assert.ok(
      r.body.includes('This is example copy'),
      'the paragraph is in the document for a crawler'
    )
    assert.ok(r.body.includes(`<title>about · ${site.name}</title>`))
  })

  it('GET / still ships the modal closed', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.ok(!/id="modal"[^>]*class="open[ "]/.test(r.body))
    assert.match(r.body, /<div class="inner" id="sheetInner"><\/div>/)
  })

  it('terminal and retro keep their plain pages', async () => {
    const curl = await app.inject({
      method: 'GET',
      url: '/work',
      headers: { 'user-agent': 'curl/8.4.0' },
    })
    assert.match(curl.headers['content-type'], /text\/plain/)
    assert.ok(curl.body.includes('what i do'))
    const retro = await app.inject({
      method: 'GET',
      url: '/about',
      headers: { 'user-agent': 'Mozilla/4.0 (compatible; MSIE 5.5; Windows 98)' },
    })
    assert.match(retro.headers['content-type'], /text\/html/)
    assert.ok(!retro.body.includes('id="stage"'), 'retro never gets the canvas')
  })
})

describe('entry routes render the canvas shell with the entry sheet open', () => {
  it('GET /work/<case-study> SSRs the case study with its css chain', async () => {
    const r = await app.inject({ method: 'GET', url: `/work/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 200)
    assert.ok(r.body.includes('id="stage"'))
    // a case study is a full page on a direct load too (#300)
    assert.match(r.body, /id="modal" role="dialog" class="open fullpage( reading)?"/)
    assert.ok(r.body.includes('<article class="prose">'), 'the real markup is in the document')
    assert.match(r.body, /<link rel="stylesheet" href="[^"]*case-study[^"]*\.css" data-sheet-css>/)
    // the way back is the page bar's close box (#338)
    assert.ok(
      r.body.includes('<a class="k-btn k-ico k-close" href="/work"'),
      'the way back is real'
    )
    assert.ok(r.body.includes(`· work · ${site.name}</title>`), 'the entry meta rides the shell')
  })

  it('GET /<experiment> SSRs the entry with its script chain as real tags', async () => {
    const r = await app.inject({ method: 'GET', url: `/${FIXTURES.experiment}` })
    assert.equal(r.statusCode, 200)
    assert.match(
      r.body,
      /<script[^>]*src="[^"]*instruments[^"]*\.js"/,
      'extra_js rides the shell as a real script tag'
    )
  })

  it('GET /<experiment> SSRs the experiment at the root with a way back to the canvas', async () => {
    const r = await app.inject({ method: 'GET', url: `/${FIXTURES.experiment}` })
    assert.equal(r.statusCode, 200)
    assert.ok(r.body.includes('<article class="prose">'))
    // Experiments used to ship no backlink at all, which left a small touch
    // screen (a watch) trapped in the sheet: no Escape, no reachable gap.
    // The way back is the page bar's close box now (#338), a real link.
    assert.ok(
      r.body.includes(
        '<a class="k-btn k-ico k-close" href="/" aria-label="Close: back to canvas">'
      ),
      'the way back to the canvas is real'
    )
  })

  it('the shell lets the watch adapt the page, like every other site', async () => {
    // This assertion used to run the other way. The meta opted the watch out
    // of watchOS's adapted layout, because the adapted page broke
    // position:fixed and put the sheet beside the canvas instead of over it.
    //
    // What it bought instead was a true device width WIDER than the watch
    // threshold in canvas-home.css, so the watch stopped matching the watch
    // density and was served the phone build: bar, menu, a booting canvas and
    // two fixed layers, on a screen none of it fits. That is the pile the
    // photos kept showing, and no amount of fixing the pile reached the line
    // that caused it.
    //
    // The position:fixed failure it was hired to prevent has since been
    // retired by construction: under the watch density nothing on the page is
    // fixed or transformed at all, and no canvas boots (canvas/boot.js). So
    // the tag has nothing left to protect and one thing left to break, and
    // the watch gets the adaptation every other site on the web gets.
    for (const url of ['/', '/login']) {
      const r = await app.inject({ method: 'GET', url })
      assert.ok(
        !r.body.includes('disabled-adaptations'),
        `${url} opts the watch out of its own adaptation again`
      )
    }
  })

  it('a route that SSRs a sheet says so on <html>, not on boot', async () => {
    // The watch's one-layer rules key on html.sheet-open. app.js used to add
    // it, which left a direct load of an entry unarmed until a script it does
    // not otherwise need decided to run.
    const entry = await app.inject({ method: 'GET', url: `/work/${FIXTURES.caseStudy}` })
    assert.match(
      entry.body,
      /<html[^>]*class="[^"]*\bsheet-open\b/,
      'the SSR sheet is not declared'
    )
    const home = await app.inject({ method: 'GET', url: '/' })
    assert.doesNotMatch(
      home.body,
      /<html[^>]*class="[^"]*\bsheet-open\b/,
      'the bare canvas claims a sheet it does not have'
    )
  })

  // mutation: canvas-ssr.full-page-direct-as-sheet, canvas-ssr.adopt-keeps-bar
  it('a direct load of a full page opens as one, the way a click does: no bar over it', async () => {
    // A case study or an experiment typed into the address bar used to adopt
    // the SSR'd sheet as a card, with the canvas's search bar floating over
    // it; clicked open from the canvas, the same page filled the frame, and
    // the search should not be visible over a page that fills it.
    for (const url of [`/work/${FIXTURES.caseStudy}`, `/${FIXTURES.experiment}`]) {
      const r = await app.inject({ method: 'GET', url })
      assert.match(r.body, /<html[^>]*class="[^"]*\bfullpage-open\b/, `${url}: the bar shows`)
      assert.match(
        r.body,
        /<div id="modal" role="dialog" class="open fullpage( reading)?"/,
        `${url}: a card`
      )
    }
    const feed = await app.inject({ method: 'GET', url: '/feed' })
    assert.doesNotMatch(
      feed.body,
      /<html[^>]*class="[^"]*\bfullpage-open\b/,
      'a section sheet is a card, not a destination'
    )
    // and the script that adopts it keeps it one: the page bar at its top,
    // repainted from the canvas's ring (#338)
    const adopt = APP.match(/function adoptSsrSheet\(slug\)\{[\s\S]*?\n\}/)?.[0] ?? ''
    assert.match(
      adopt,
      /classList\.toggle\('fullpage-open', full\)/,
      'adopting drops the full page'
    )
    assert.match(adopt, /if\(full\) paintPageBar\(slug\)/, 'a direct load has no way onward')
  })

  it('terminal keeps the plain entry page', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/work/${FIXTURES.caseStudy}`,
      headers: { 'user-agent': 'curl/8.4.0' },
    })
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.ok(!r.body.includes('id="stage"'))
  })
})

describe('/api/sheet/:slug serves the client router', () => {
  it('work: prose + live case-study list with real paths', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/sheet/work' })
    assert.equal(r.statusCode, 200)
    const sheet = JSON.parse(r.body)
    assert.equal(sheet.title, 'work')
    assert.equal(sheet.meta, 'index')
    assert.equal(sheet.docTitle, `work · ${site.name}`)
    assert.ok(sheet.body.includes('<h2>what i do</h2>'))
    assert.ok(sheet.body.includes('entryList'))
    assert.ok(sheet.body.includes(`href="/work/${FIXTURES.caseStudy}"`))
    assert.ok(sheet.body.includes(`href="mailto:${site.author.email}"`), 'get in touch mails')
    assert.match(
      sheet.body,
      /<a class="cta k-btn" href="https:\/\/github\.com[^"]*" target="_blank" rel="noopener">github<\/a>/,
      'a profile is the kit button and opens in a new tab'
    )
    assert.ok(
      sheet.body.includes(
        '<details class="more k-disc"><summary class="k-btn">Not clear enough?</summary>'
      ),
      "the longer pitch folds into the kit's disclosure"
    )
    // the keywords are a still list of the kit's tags, not a ribbon that
    // scrolls forever (#336)
    assert.match(
      sheet.body,
      /<ul class="k-tags kwList"[^>]*><li class="k-tag">/,
      'keywords stand still, as tags'
    )
    assert.doesNotMatch(sheet.body, /kwRibbon|kwTrack/, 'the ribbon came back')
  })

  it('feed: the article list, no case studies, no experiments', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/sheet/feed' })
    const sheet = JSON.parse(r.body)
    assert.equal(sheet.docTitle, `feed · ${site.name}`)
    assert.ok(sheet.body.includes(`href="${FIXTURES.externalUrl}"`))
    assert.ok(!sheet.body.includes(FIXTURES.experiment))
    assert.ok(!sheet.body.includes(FIXTURES.caseStudy))
  })

  // mutation: canvas-ssr.external-entry-same-tab
  it('feed: external entries link out in a new tab, host on the meta line', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/sheet/feed' })
    const sheet = JSON.parse(r.body)
    assert.ok(
      sheet.body.includes(`href="${FIXTURES.externalUrl}" target="_blank" rel="noopener"`),
      'external entry links straight to where it lives'
    )
    assert.ok(
      sheet.body.includes('developer.mozilla.org'),
      'external entries carry their host label'
    )
    assert.ok(
      !sheet.body.includes(`href="/feed/${FIXTURES.external}"`),
      'no local link for an external entry'
    )
  })

  it('about: contact block present, from the site config', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/sheet/about' })
    const sheet = JSON.parse(r.body)
    assert.ok(sheet.body.includes('<h2>reach me</h2>'))
    assert.ok(sheet.body.includes(site.author.email))
  })

  it('unknown sheets 404', async () => {
    const r = await app.inject({ method: 'GET', url: `/api/sheet/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 404)
  })
})
