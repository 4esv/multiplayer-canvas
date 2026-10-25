// test/errors.test.js
// Covers src/errors/handler.js (404 + 500 views, both stamped robots:noindex).
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'

describe('404 handler', () => {
  let app

  before(async () => {
    app = await build({ logger: false })
  })

  after(async () => {
    await app.close()
  })

  it('GET an unknown path returns 404 HTML with a robots noindex meta', async () => {
    const r = await app.inject({ method: 'GET', url: '/nonexistent-path' })
    assert.equal(r.statusCode, 404)
    assert.match(r.headers['content-type'], /text\/html/)
    assert.match(r.body, /<meta name="robots" content="noindex">/)
  })

  it('carries no canonical (an error page is not an alternate of home)', async () => {
    const r = await app.inject({ method: 'GET', url: '/nonexistent-path' })
    assert.ok(!r.body.includes('rel="canonical"'), '404 must not claim a canonical URL')
  })

  it('offers all three section doors, /feed included', async () => {
    const r = await app.inject({ method: 'GET', url: '/nonexistent-path' })
    for (const door of ['/work', '/feed', '/about']) {
      assert.ok(r.body.includes(`href="${door}"`), `404 offers the ${door} door`)
    }
  })
})

describe('500 handler logging', () => {
  let app
  const lines = []

  before(async () => {
    // Pins the contract that a server error reaches the logger. Production
    // boots with build()'s pino default (level from LOG_LEVEL); a logger
    // override in start() once made this a silent no-op.
    app = await build({
      logger: {
        level: 'error',
        stream: { write: (line) => lines.push(line) },
      },
    })
    app.get('/__boom-logged__', async () => {
      throw new Error('boom-logged')
    })
    await app.ready()
  })

  after(async () => {
    await app.close()
  })

  // mutation: errors.500-not-logged
  it('a throwing route logs the error', async () => {
    const r = await app.inject({ method: 'GET', url: '/__boom-logged__' })
    assert.equal(r.statusCode, 500)
    assert.ok(
      lines.some((l) => l.includes('boom-logged')),
      'error line should reach the log stream'
    )
  })
})

describe('500 handler', () => {
  let app

  before(async () => {
    app = await build({ logger: false })
    // Register a route that throws BEFORE the instance is ready so the
    // shared error handler (set during build) catches it at request time.
    app.get('/__boom__', async () => {
      throw new Error('boom')
    })
    await app.ready()
  })

  after(async () => {
    await app.close()
  })

  it('a throwing route returns 500 HTML with a robots noindex meta', async () => {
    const r = await app.inject({ method: 'GET', url: '/__boom__' })
    assert.equal(r.statusCode, 500)
    assert.match(r.headers['content-type'], /text\/html/)
    assert.match(r.body, /<meta name="robots" content="noindex">/)
  })

  it('carries no canonical (an error page is not an alternate of home)', async () => {
    const r = await app.inject({ method: 'GET', url: '/__boom__' })
    assert.ok(!r.body.includes('rel="canonical"'), '500 must not claim a canonical URL')
  })

  it('prints the request id as a code chip so a report can quote it', async () => {
    const r = await app.inject({ method: 'GET', url: '/__boom__' })
    assert.match(r.body, /<code class="cv-path">req-[^<]+<\/code>/)
  })

  it('the plain-text variant prints the request id too', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/__boom__',
      headers: { 'user-agent': 'curl/8.4.0' },
    })
    assert.equal(r.statusCode, 500)
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.match(r.body, /Quote req-\S+ if you write in\./)
  })
})
