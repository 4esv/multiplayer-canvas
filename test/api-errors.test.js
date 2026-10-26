// test/api-errors.test.js
// Every JSON error is { error: <word>, message?: <sentence> }. The
// word is what a program branches on, so a route may only say a word the
// vocabulary (lib/api-errors.js) holds, and
// an /api path answers JSON whatever went wrong, never the HTML door.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-api-errors-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')

const { build } = await import('../src/server.js')
const { createSession } = await import('../src/services/auth.js')
const { ERRORS } = await import('../src/lib/api-errors.js')

let app
let SESSION

before(async () => {
  app = await build({ logger: false })
  const token = await createSession('api-errors-test')
  SESSION = {
    host: 'example.com',
    'x-forwarded-proto': 'https',
    cookie: `canvas_key=${token}`,
    origin: 'https://example.com',
  }
})

after(async () => {
  await app.close()
  rmSync(tmp, { recursive: true, force: true })
})

// Every place a word is chosen: the third argument of fail() and the few
// words picked into a variable first.
const SOURCES = ['src/routes', 'src/middleware', 'src/errors']
const files = SOURCES.flatMap((p) =>
  p.endsWith('.js')
    ? [p]
    : readdirSync(p)
        .filter((f) => f.endsWith('.js'))
        .map((f) => join(p, f))
)
const text = files.map((f) => [f, readFileSync(f, 'utf-8')])

function wordsSaid() {
  const said = []
  const quoted = (s) => [...s.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
  for (const [file, src] of text) {
    for (const m of src.matchAll(/\bfail\(\s*reply,\s*[^,]+,\s*([^,)]+)/g))
      for (const w of quoted(m[1])) said.push([file, w])
    for (const m of src.matchAll(/\b(?:refused\(\d+,|deny\(|reason:)\s*'([a-z]+)'/g))
      said.push([file, m[1]])
    for (const m of src.matchAll(/\bconst word = ([^\n]+)/g))
      for (const w of quoted(m[1])) said.push([file, w])
  }
  return said
}

describe('the error shape', () => {
  // mutation: api-errors.word-off-the-list
  it('every word a route can send is one the vocabulary documents', () => {
    const said = wordsSaid()
    assert.ok(said.length >= 30, `found ${said.length} error words; the walker is broken`)
    const stray = said.filter(([, w]) => !(w in ERRORS))
    assert.deepEqual(stray, [], 'a route sends a word the vocabulary does not list')
  })

  it('an unknown /api path is JSON, not the HTML door', async () => {
    for (const url of ['/api/nope', '/api/rooms/nope/nope']) {
      const r = await app.inject({ url, headers: { host: 'example.com' } })
      assert.equal(r.statusCode, 404, url)
      assert.match(r.headers['content-type'], /^application\/json/, url)
      assert.equal(r.json().error, 'notfound')
    }
    // and a page path is still the page door
    const page = await app.inject({ url: '/nope', headers: { host: 'example.com' } })
    assert.equal(page.statusCode, 404)
    assert.doesNotMatch(page.headers['content-type'], /json/)
  })

  it('a body the parser refuses is a word too, with the reason as the message', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/admin/rooms',
      headers: { ...SESSION, 'content-type': 'application/json' },
      payload: '{"kind":',
    })
    assert.equal(r.statusCode, 400)
    assert.equal(r.json().error, 'invalid')
    assert.equal(typeof r.json().message, 'string')
  })

  it('a sentence is never the word: the reason stays in the message', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/admin/rooms',
      headers: { ...SESSION, 'content-type': 'application/json' },
      payload: { kind: 'nope' },
    })
    assert.equal(r.statusCode, 400)
    assert.equal(r.json().error, 'invalid')
    assert.match(r.json().message, /kind is one of/)
  })
})
