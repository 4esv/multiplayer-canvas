// test/headers.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { build } from '../src/server.js'

const BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

describe('Site-wide security headers (onSend hook)', () => {
  it('GET / carries the env-independent security headers', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.equal(r.statusCode, 200)

    const csp = r.headers['content-security-policy']
    assert.ok(csp, 'content-security-policy is present')
    assert.ok(csp.includes("default-src 'none'"), "CSP locks default-src to 'none'")
    assert.ok(csp.includes("script-src 'self'"), "CSP allows scripts from 'self'")
    assert.ok(
      csp.includes("'inline-speculation-rules'"),
      'CSP allows the inline speculation-rules prefetch JSON'
    )
  })

  // mutation: headers.inline-script-unhashed
  it('every inline script on the canvas page is allowed by its hash', async () => {
    // a hash in script-src switches 'inline-speculation-rules' off in Chrome,
    // so each inline script must be named by its own hash or it is blocked
    const r = await app.inject({ method: 'GET', url: '/', headers: { 'user-agent': BROWSER } })
    const csp = r.headers['content-security-policy']
    const inline = [...r.body.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    assert.ok(inline.length >= 2, `found ${inline.length} inline scripts`)
    for (const [tag, text] of inline) {
      // a data block (JSON-LD, the boot payload) is never run, so the policy
      // does not govern it; these types are the ones the browser acts on
      const type = /\btype="([^"]*)"/.exec(tag)?.[1] ?? ''
      if (!['', 'module', 'text/javascript', 'importmap', 'speculationrules'].includes(type))
        continue
      const hash = `'sha256-${createHash('sha256').update(text).digest('base64')}'`
      assert.ok(csp.includes(hash), `${tag.slice(0, 40)} is not in script-src`)
    }
  })

  it('GET / names no third-party image origin, so no pixel can slip off-site', async () => {
    // A third-party image origin in img-src is an extra DNS lookup and TLS
    // handshake on the boot path, and a request telling a third party about
    // every visitor. Adding an origin here is easy, noticing it is not.
    const csp = (await app.inject({ method: 'GET', url: '/' })).headers['content-security-policy']
    const imgSrc = csp.split('; ').find((d) => d.startsWith('img-src '))
    assert.equal(imgSrc, "img-src 'self' data:", 'images come from here and nowhere else')
  })

  // mutation: headers.hsts-preload
  it('GET / sets HSTS to one year + subdomains, deliberately without preload', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.equal(r.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains')
    assert.ok(
      !r.headers['strict-transport-security'].includes('preload'),
      'no-preload is a deliberate choice'
    )
  })

  it('GET / sets nosniff, frame-deny, and referrer policy', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    assert.equal(r.headers['x-content-type-options'], 'nosniff')
    assert.equal(r.headers['x-frame-options'], 'DENY')
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/)
    assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin')
  })

  it('GET / sets a permissions-policy that denies the camera', async () => {
    const r = await app.inject({ method: 'GET', url: '/' })
    const pp = r.headers['permissions-policy']
    assert.ok(pp, 'permissions-policy is present')
    assert.ok(pp.includes('camera=()'), 'camera is denied')
  })

  it('the hook also runs on static assets (GET /css/canvas.css)', async () => {
    const r = await app.inject({ method: 'GET', url: '/css/canvas.css' })
    assert.equal(r.statusCode, 200)

    const csp = r.headers['content-security-policy']
    assert.ok(csp, 'static asset carries content-security-policy')
    assert.ok(csp.includes("default-src 'none'"), 'static-asset CSP is the full policy')
    assert.equal(
      r.headers['x-content-type-options'],
      'nosniff',
      'static asset carries x-content-type-options'
    )
  })
})

describe('Cache policy on feeds and site metadata', () => {
  // These fell through the onSend chain with no cache-control at all:
  // generated XML got whatever the proxy defaulted to, and the two static
  // files matched none of the extension branches.
  for (const url of ['/feed.xml', '/sitemap.xml', '/robots.txt', '/manifest.json']) {
    it(`GET ${url} carries an explicit one-hour public cache`, async () => {
      const r = await app.inject({ method: 'GET', url })
      assert.equal(r.statusCode, 200)
      assert.equal(r.headers['cache-control'], 'public, max-age=3600')
    })
  }
})

describe('immutable is only promised where the URL moves with the content', () => {
  // `immutable` tells a client never to revalidate for a year. That is only
  // true of a URL that changes when its bytes do. Images are not hashed by
  // the build, so /img/og/<slug>.png keeps one URL across regenerations: it
  // had been served immutable, which meant og-freshness.test.js could hold a
  // card in sync with its title while every client that had already fetched
  // it keeps the stale one for a year.
  let app

  before(async () => {
    app = await build({ logger: false })
  })

  after(async () => {
    await app.close()
  })

  const cc = async (url) => (await app.inject({ method: 'GET', url })).headers['cache-control']

  it('promises it for content-hashed assets and fonts', async () => {
    assert.match(await cc('/fonts/dotgothic16-regular.woff2'), /immutable/)
  })

  it('never promises it for an asset whose URL cannot move', async () => {
    for (const url of [
      '/img/og/default.png',
      '/logo.png',
      '/favicon.svg',
      '/apple-touch-icon.png',
    ]) {
      const v = await cc(url)
      assert.doesNotMatch(v, /immutable/, `${url} promises immutability it cannot keep`)
      assert.match(v, /stale-while-revalidate/, `${url} should revalidate in the background`)
    }
  })
})
