// test/admin.test.js
// The owner dashboard: behind the passkey, it says you are signed in and lists
// what the process and the session store hold.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-admin-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')

const { build } = await import('../src/server.js')
const { createSession, listSessions } = await import('../src/services/auth.js')
const { SESSION_COOKIE } = await import('../src/middleware/auth.js')

let app
let cookie

before(async () => {
  app = await build({ logger: false })
  cookie = `${SESSION_COOKIE}=${await createSession('node:test admin')}`
})

after(async () => {
  await app.close()
})

describe('/admin', () => {
  it('bounces to /login without a session', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin' })
    assert.equal(r.statusCode, 302)
    assert.equal(r.headers.location, '/login?next=%2Fadmin')
  })

  it('renders the readouts with a session', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/html/)
    for (const section of ['signed in', 'sessions', 'process']) {
      assert.ok(r.body.includes(section), `renders the ${section} section`)
    }
    // The session minted above is listed.
    assert.ok(r.body.includes('node:test admin'))
    // Never cacheable, never indexed.
    assert.match(r.headers['cache-control'], /no-store/)
  })

  it('names sessions as devices, marks the caller, and offers sign out on the others', async () => {
    const other = await createSession(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    )
    const r = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } })
    assert.ok(r.body.includes('Safari on iPhone'), 'the UA is read as a device')
    assert.ok(r.body.includes('this device'), 'the caller is marked')
    const rows = await listSessions()
    const otherRow = rows.find((s) => s.userAgent.includes('iPhone'))
    assert.ok(
      r.body.includes(`data-revoke="${otherRow.id}"`),
      'the other session can be signed out'
    )
    // Never the caller's own row: that is the log out button.
    const mine = rows.find((s) => s.userAgent === 'node:test admin')
    assert.ok(!r.body.includes(`data-revoke="${mine.id}"`))
    // Sign it out from here.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/auth/sessions/${otherRow.id}`,
      headers: { cookie, origin: 'http://localhost:80' },
    })
    assert.equal(del.statusCode, 200)
    const gone = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie: `${SESSION_COOKIE}=${other}` },
    })
    assert.equal(gone.statusCode, 302, 'the revoked session no longer opens the door')
    const again = await app.inject({
      method: 'DELETE',
      url: `/api/auth/sessions/${otherRow.id}`,
      headers: { cookie, origin: 'http://localhost:80' },
    })
    assert.equal(again.statusCode, 404)
  })

  it('signs out everywhere else in one call, keeping the caller', async () => {
    const a = await createSession('other-a')
    const b = await createSession('other-b')
    const page = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } })
    assert.ok(
      page.body.includes('data-revoke-others'),
      'the bulk button renders with more than one session'
    )
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/auth/sessions',
      headers: { cookie, origin: 'http://localhost:80' },
    })
    assert.equal(r.statusCode, 200)
    assert.ok(JSON.parse(r.body).gone >= 2)
    for (const t of [a, b]) {
      const gone = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { cookie: `${SESSION_COOKIE}=${t}` },
      })
      assert.equal(gone.statusCode, 302)
    }
    const mine = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } })
    assert.equal(mine.statusCode, 200, 'the caller is still in')
    assert.ok(!mine.body.includes('data-revoke-others'), 'alone now, no bulk button')
  })

  it('revoking needs the session and the origin', async () => {
    let r = await app.inject({ method: 'DELETE', url: '/api/auth/sessions/abc' })
    assert.equal(r.statusCode, 401)
    r = await app.inject({ method: 'DELETE', url: '/api/auth/sessions/abc', headers: { cookie } })
    assert.equal(r.statusCode, 403)
  })

  it('never ships an ad- class: content blockers cosmetic-filter that family', async () => {
    // A dashboard wearing .ad/.ad-section renders blank for
    // anyone running a blocklist, which is exactly its one intended reader.
    const r = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } })
    assert.doesNotMatch(r.body, /class="ad[" -]/, 'no ad or ad-* classes in the markup')
  })

  it('renders as text for terminal user agents', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie, 'user-agent': 'curl/8.7.1' },
    })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.ok(r.body.includes('admin'))
    assert.ok(r.body.includes('signed in'))
  })
})
