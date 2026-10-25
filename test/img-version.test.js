// test/img-version.test.js
// Issue #319: every /img URL the site emits carries the hash of its bytes.
//
// Pictures keep their names across a re-bake, so a bare /img URL is the same
// URL before and after, and a returning visitor keeps the old picture for as
// long as the cache lets them. With `?v=<hash8>` taken from the file, a
// re-bake is a new URL and the warm cache is simply not asked. This sweeps
// what a browser receives (every route's HTML, the BOOT payload inside it,
// the entry bodies the canvas mounts over /api/page) and the one place the
// canvas writes picture URLs itself, and fails on any /img URL without its
// hash, or with a hash that is not the file's.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { build } from '../src/server.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { pathFor } from '../src/lib/entry-kind.js'
import { imgVersion } from '../src/lib/img-version.js'
import site from '../site.config.js'

const ORIGIN = site.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const STATIC = join(import.meta.dirname, '../src/static')
const APP_SRC = readFileSync(join(STATIC, 'canvas/app.js'), 'utf8')

// an /img URL as it sits in markup or in JSON: it ends at a quote, an
// escape, a bracket or whitespace
const IMG_URL = new RegExp(`(?:${ORIGIN})?/img/[^\\s"'<>()\\\\]+`, 'g')

// every /img URL in the text that lacks its hash, or carries a wrong one
function unversioned(text) {
  const bad = []
  for (const [url] of text.matchAll(IMG_URL)) {
    const path = url.startsWith(site.url) ? url.slice(site.url.length) : url
    const [rel, query = ''] = path.slice('/img/'.length).split('?')
    const want = imgVersion(rel)
    if (!want || query !== `v=${want}`) bad.push(url)
  }
  return bad
}

const bootOf = (html) => {
  const m = html.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)
  return m && JSON.parse(m[1])
}

describe('every /img URL the site emits carries its bytes’ hash (issue #319)', () => {
  let app, routes, local
  before(async () => {
    app = await build({ logger: false })
    local = (await loadFeedEntries()).filter((e) => !e.hidden && !e.externalUrl)
    routes = ['/', '/work', '/case-studies', '/feed', '/about', ...local.map(pathFor)]
  })
  after(async () => {
    await app.close()
  })

  // mutation: img-version.og-card-bare, img-version.entry-body-bare
  it('in the HTML of every route', async () => {
    let seen = 0
    for (const url of routes) {
      const r = await app.inject({ method: 'GET', url })
      assert.equal(r.statusCode, 200, `${url} should render a page`)
      seen += [...r.body.matchAll(IMG_URL)].length
      assert.deepEqual(unversioned(r.body), [], `${url} emits an /img URL without its hash`)
    }
    // the sweep saw pictures at all: an og card on every route, at least
    assert.ok(seen >= routes.length, `only ${seen} /img URLs across ${routes.length} routes`)
  })

  // mutation: img-version.boot-map-bare
  it('in BOOT, and BOOT names every picture the canvas asks for', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    const boot = bootOf(r.body)
    assert.ok(boot, 'the home page carries a boot payload')
    assert.deepEqual(unversioned(JSON.stringify(boot)), [], 'BOOT carries a bare /img URL')
    // the canvas builds its picture URLs from BOOT.img (app.js imgSrc), so
    // every file it names must be in the map
    for (const rel of ['canvas/maurice.png', 'og/default.png']) {
      assert.match(boot.img?.[rel] ?? '', /\?v=[0-9a-f]{8}$/, `BOOT.img has no ${rel}`)
    }
    const shots = Object.keys(boot.img).filter((k) => k.startsWith('canvas/plan/'))
    assert.ok(shots.length > 0, 'BOOT.img carries the plan pictures')
  })

  // mutation: img-version.entry-body-bare
  it('in every entry body the canvas mounts', async () => {
    for (const e of local) {
      const r = await app.inject({ method: 'GET', url: `/api/page/${e.slug}` })
      if (r.statusCode !== 200) continue
      assert.deepEqual(unversioned(r.body), [], `/api/page/${e.slug} carries a bare /img URL`)
    }
  })

  // mutation: img-version.canvas-shot-bare
  it('the canvas writes no /img URL but through the map', () => {
    // A picture URL built in app.js cannot know its hash; it must come from
    // BOOT.img through imgSrc. The one literal allowed is imgSrc's own
    // fallback for a page whose boot payload is missing.
    const code = APP_SRC.split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n')
    const literals = [...code.matchAll(/['"`]\/img\//g)]
    assert.equal(literals.length, 1, 'app.js builds an /img URL outside imgSrc')
    assert.match(code, /const imgSrc = p => BOOT\?\.img\?\.\[p\] \|\| '\/img\/'\+p;/)
  })
})

describe('an image at its hash is immutable, and nowhere else', () => {
  let app
  before(async () => {
    app = await build({ logger: false })
  })
  after(async () => {
    await app.close()
  })
  const cc = async (url) => (await app.inject({ method: 'GET', url })).headers['cache-control']

  // mutation: img-version.immutable-any-hash
  it('promises it only for the hash on disk', async () => {
    const v = imgVersion('canvas/maurice.png')
    assert.equal(await cc(`/img/canvas/maurice.png?v=${v}`), 'public, max-age=31536000, immutable')
    // a stale page asking for an old hash gets today's bytes, and must not
    // pin them for a year under a name that is not theirs
    for (const url of ['/img/canvas/maurice.png?v=00000000', '/img/canvas/maurice.png']) {
      assert.doesNotMatch(await cc(url), /immutable/, url)
    }
  })
})
