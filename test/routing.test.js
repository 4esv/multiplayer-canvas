// test/routing.test.js
// The collection routing fork after unification:
//   /work     case studies only  -> essay / web-only slug 404s
//   /feed      everything else     -> case-study slug 404s
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from '../src/server.js'
import { FIXTURES } from './fixtures.js'

let app

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

describe('collection routing fork', () => {
  it('GET /work/<case-study> returns 200', async () => {
    const r = await app.inject({ method: 'GET', url: `/work/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 200)
  })

  // mutation: routing.work-serves-any-entry
  it('GET /work/<external> (not a case study) returns 404', async () => {
    // work.js: non-case-study slug calls reply.callNotFound().
    const r = await app.inject({ method: 'GET', url: `/work/${FIXTURES.external}` })
    assert.equal(r.statusCode, 404)
  })

  it('GET /feed/<external> (an external entry) 302s to where it lives', async () => {
    // The essay lives on Kaggle (external_url); the local URL stays a
    // permanent handle that forwards. 302 keeps the hop repointable; the
    // tile and the index carry the one-line summary, so no page is needed.
    const r = await app.inject({ method: 'GET', url: `/feed/${FIXTURES.external}` })
    assert.equal(r.statusCode, 302)
    assert.equal(r.headers.location, FIXTURES.externalUrl)
  })

  it('GET /<experiment> (a web-only experiment) returns 200 at the root', async () => {
    const r = await app.inject({ method: 'GET', url: `/${FIXTURES.experiment}` })
    assert.equal(r.statusCode, 200)
  })

  it('GET /feed/<case-study> returns 404', async () => {
    // feed.js: a case-study slug calls reply.callNotFound() under /feed.
    const r = await app.inject({ method: 'GET', url: `/feed/${FIXTURES.caseStudy}` })
    assert.equal(r.statusCode, 404)
  })

  it('GET /feed/not-a-real-thing (unknown slug) returns 404', async () => {
    const r = await app.inject({ method: 'GET', url: '/feed/not-a-real-thing' })
    assert.equal(r.statusCode, 404)
  })
})
