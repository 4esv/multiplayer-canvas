// test/auth.test.js
// The passkey door. WebAuthn ceremony crypto belongs to
// @simplewebauthn/server; what this suite guards is everything around it:
// the redirect/401 gate on the private pages, the setup-code gate while
// unclaimed, session cookies, logout, ?next= sanitisation, and the page
// furniture (/login is a page like any other, just never indexed).
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Both stores point at a temp dir before src/config.js loads (dynamic
// imports below), so the suite never touches data/.
const tmp = mkdtempSync(join(tmpdir(), 'canvas-auth-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')

const { build } = await import('../src/server.js')
const { createSession } = await import('../src/services/auth.js')
const { OWNER_HINT, SESSION_COOKIE, safeNext } = await import('../src/middleware/auth.js')

// A response sets two cookies now (the session and the owner hint), so a
// test picks the one it is about by name.
const jarOf = (r) => [].concat(r.headers['set-cookie'] ?? [])
const named = (r, name) => jarOf(r).filter((c) => c.startsWith(`${name}=`))

let app

// What requestOrigin() computes for injected requests (http, host localhost:80).
// State-changing posts must carry it: a missing Origin header is refused.
const ORIGIN = 'http://localhost:80'

before(async () => {
  app = await build({ logger: false })
})

after(async () => {
  await app.close()
})

describe('the gate: private pages bounce, private APIs 401', () => {
  it('GET /admin/kit anonymous redirects to /login?next=', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin/kit' })
    assert.equal(r.statusCode, 302)
    assert.equal(r.headers.location, '/login?next=%2Fadmin%2Fkit')
    assert.match(r.headers['cache-control'], /no-store/)
    assert.match(r.headers['x-robots-tag'], /noindex/)
  })

  it('GET /api/whoami anonymous returns 401 JSON, not a redirect', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/whoami' })
    assert.equal(r.statusCode, 401)
    assert.equal(JSON.parse(r.body).error, 'unauthorized')
  })
})

describe('/login page furniture', () => {
  it('GET /login is 200 with title, description, canonical, and noindex', async () => {
    const r = await app.inject({ method: 'GET', url: '/login' })
    assert.equal(r.statusCode, 200)
    assert.match(r.body, new RegExp(`<title>key · ${site.name}</title>`))
    assert.match(r.body, /<meta name="description" content="[^"]+"/)
    assert.ok(r.body.includes(`<link rel="canonical" href="${site.url}/login"`))
    assert.match(r.body, /<meta name="robots" content="noindex, nofollow"/)
    assert.match(r.headers['x-robots-tag'], /noindex/)
  })

  it('serves the plain-text variant to terminal clients', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/login',
      headers: { 'user-agent': 'curl/8.4.0' },
    })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.match(r.body, /passkey/)
  })

  it('sanitises ?next=: protocol-relative and API paths fall back to /admin', async () => {
    const r = await app.inject({ method: 'GET', url: '/login?next=//evil.example/x' })
    assert.match(r.body, /data-next="\/admin"/)
    assert.equal(safeNext('/api/whoami'), '/admin')
    assert.equal(safeNext('/admin/kit?item=x'), '/admin/kit?item=x')
    // Browsers normalize backslash to slash in navigations, so a leading
    // /\ is protocol-relative in disguise.
    assert.equal(safeNext('/\\evil.example'), '/admin')
    assert.equal(safeNext('\\/evil.example'), '/admin')
  })
})

describe('the claim (registration) gate', () => {
  it('rejects a wrong setup code', async () => {
    await app.inject({ method: 'GET', url: '/login' }) // mints the code
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register/options',
      headers: { origin: ORIGIN },
      payload: { code: 'WRONG-CODE' },
    })
    assert.equal(r.statusCode, 403)
  })

  it('rejects a post with no Origin header at all', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/logout' })
    assert.equal(r.statusCode, 403)
    assert.equal(JSON.parse(r.body).error, 'origin')
  })

  it('rejects a cross-origin post outright', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register/options',
      headers: { origin: 'https://evil.example' },
      payload: { code: 'whatever' },
    })
    assert.equal(r.statusCode, 403)
    assert.equal(JSON.parse(r.body).error, 'origin')
  })

  it('accepts the real setup code and returns creation options', async () => {
    await app.inject({ method: 'GET', url: '/login' })
    const { setupCode } = JSON.parse(readFileSync(process.env.AUTH_STORE_PATH, 'utf-8'))
    assert.ok(setupCode, 'store carries a setup code while unclaimed')
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register/options',
      headers: { origin: ORIGIN },
      payload: { code: setupCode },
    })
    assert.equal(r.statusCode, 200)
    const options = JSON.parse(r.body)
    assert.ok(options.challenge, 'options carry a challenge')
    assert.equal(options.user.name, 'owner')
    assert.equal(options.authenticatorSelection.residentKey, 'required')
  })

  it('login options are 409 while unclaimed', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login/options',
      headers: { origin: ORIGIN },
    })
    assert.equal(r.statusCode, 409)
  })
})

// A response shaped like the browser's credential JSON, signed by nobody. The
// route pulls the challenge out of clientDataJSON itself and hands everything
// after that to @simplewebauthn, so junk past the challenge is all these cases
// need to reach the gates the site actually owns.
function fakeCeremony(type, challenge) {
  const clientDataJSON = Buffer.from(JSON.stringify({ type, challenge, origin: ORIGIN })).toString(
    'base64url'
  )
  return {
    id: 'AAAAAAAAAAAAAAAAAAAAAA',
    rawId: 'AAAAAAAAAAAAAAAAAAAAAA',
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON, attestationObject: 'bm90LWFuLWF0dGVzdGF0aW9u' },
  }
}

function storeSessions() {
  const store = JSON.parse(readFileSync(process.env.AUTH_STORE_PATH, 'utf-8'))
  return Object.keys(store.sessions || {})
}

// The assertion that carries the weight: a refused ceremony hands back no
// bearer cookie and writes no session to disk. Either one alone is a door.
function assertNothingMinted(reply) {
  assert.equal(reply.headers['set-cookie'], undefined, 'a refused ceremony sets no cookie')
  assert.deepEqual(storeSessions(), [], 'a refused ceremony leaves no session in the store')
}

// Placement is deliberate. This sits after the claim gate (which leaves the
// store unclaimed with an empty sessions map) and ahead of both the sessions
// suite, which mints tokens, and the throttle hammer, which spends the login
// budget. The invariants above only say anything while the store is empty.
//
// The signature checking is @simplewebauthn's, but every gate in front of it
// is ours: the one-time challenge, the origin check, and the order they run
// in. A ceremony that fails and still mints a session is the bug worth
// catching, so each case asserts the rejection and the absence together.
describe('ceremony rejection paths', () => {
  let setupCode
  let minted

  before(async () => {
    await app.inject({ method: 'GET', url: '/login' })
    setupCode = JSON.parse(readFileSync(process.env.AUTH_STORE_PATH, 'utf-8')).setupCode
    assert.ok(setupCode, 'the door is still unclaimed, so a setup code exists')
  })

  it('register/verify: a challenge nobody minted is stale', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register/verify',
      headers: { origin: ORIGIN },
      payload: {
        code: setupCode,
        response: fakeCeremony('webauthn.create', 'a-challenge-nobody-minted'),
      },
    })
    assert.equal(r.statusCode, 400)
    assert.deepEqual(JSON.parse(r.body), { error: 'challenge', message: 'stale challenge' })
    assertNothingMinted(r)
  })

  it('register/verify: a real challenge with an unsigned attestation fails verification', async () => {
    const options = await app.inject({
      method: 'POST',
      url: '/api/auth/register/options',
      headers: { origin: ORIGIN },
      payload: { code: setupCode },
    })
    assert.equal(options.statusCode, 200)
    minted = JSON.parse(options.body).challenge

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register/verify',
      headers: { origin: ORIGIN },
      payload: { code: setupCode, response: fakeCeremony('webauthn.create', minted) },
    })
    // Past the challenge gate, so the failure is the crypto's and the error
    // string changes with it: holding a live challenge buys nothing.
    assert.equal(r.statusCode, 400)
    assert.deepEqual(JSON.parse(r.body), { error: 'verification', message: 'verification failed' })
    assertNothingMinted(r)
  })

  it('register/verify: replaying that same challenge is stale, not a second attempt', async () => {
    assert.ok(minted, 'the previous case minted one')
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register/verify',
      headers: { origin: ORIGIN },
      payload: { code: setupCode, response: fakeCeremony('webauthn.create', minted) },
    })
    // A failed verify still burns the challenge, so the retry lands on the
    // stale branch rather than getting a fresh run at the crypto.
    assert.equal(r.statusCode, 400)
    assert.deepEqual(JSON.parse(r.body), { error: 'challenge', message: 'stale challenge' })
    assertNothingMinted(r)
  })

  it('register/verify: a foreign Origin never reaches the ceremony', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/register/verify',
      headers: { origin: 'https://evil.example' },
      payload: {
        code: setupCode,
        response: fakeCeremony('webauthn.create', 'a-challenge-nobody-minted'),
      },
    })
    assert.equal(r.statusCode, 403)
    assert.equal(JSON.parse(r.body).error, 'origin')
    assertNothingMinted(r)
  })

  it('login/verify: the unclaimed door answers before it looks at the challenge', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login/verify',
      headers: { origin: ORIGIN },
      payload: { response: fakeCeremony('webauthn.get', 'a-challenge-nobody-minted') },
    })
    // The credential check sits ahead of the challenge check, so an unclaimed
    // store says 409 and tells a caller nothing about which challenges are
    // live. Minting a credential here to reach the 400 would claim the door
    // for every suite after this one, so the 409 is what gets pinned.
    assert.equal(r.statusCode, 409)
    assert.equal(JSON.parse(r.body).error, 'unclaimed')
    assertNothingMinted(r)
  })

  it('login/verify: a foreign Origin is refused ahead of everything', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login/verify',
      headers: { origin: 'https://evil.example' },
      payload: { response: fakeCeremony('webauthn.get', 'a-challenge-nobody-minted') },
    })
    assert.equal(r.statusCode, 403)
    assert.equal(JSON.parse(r.body).error, 'origin')
    assertNothingMinted(r)
  })
})

describe('sessions', () => {
  it('a minted session opens the workshop; logout closes it again', async () => {
    const token = await createSession('node:test')
    const cookie = `${SESSION_COOKIE}=${token}`

    const icon = await app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie } })
    assert.equal(icon.statusCode, 200)
    assert.match(icon.body, /icon/)

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, origin: ORIGIN },
    })
    assert.equal(logout.statusCode, 200)
    assert.match(named(logout, SESSION_COOKIE)[0], /Max-Age=0/)

    const again = await app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie } })
    assert.equal(again.statusCode, 302)
  })

  it('an authenticated /login bounces straight to ?next=', async () => {
    const token = await createSession('node:test')
    const r = await app.inject({
      method: 'GET',
      url: '/login?next=%2Fadmin%2Fkit',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    assert.equal(r.statusCode, 302)
    assert.equal(r.headers.location, '/admin/kit')
  })

  it('a garbage cookie is just anonymous', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/admin/kit',
      headers: { cookie: `${SESSION_COOKIE}=not-a-token` },
    })
    assert.equal(r.statusCode, 302)
  })
})

// The session cookie is host-only everywhere. A clear only deletes the
// cookie whose shape it names, so logout sends exactly the shape it sets.
describe('session cookie scope', () => {
  it('logout on localhost clears host-only, exactly as it sets', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: ORIGIN },
    })
    assert.equal(r.statusCode, 200)
    const jars = named(r, SESSION_COOKIE)
    assert.equal(jars.length, 1, 'one clear: there is one shape in dev')
    assert.doesNotMatch(jars[0], /Domain=/)
  })
})

// An authenticated /login re-issues the presented token (the same token,
// never a rotation), and the cookie parser tries every canvas_key in the
// jar instead of whichever the browser sent last.
describe('session re-issue', () => {
  it('an authenticated /login re-issues the same token, host-only', async () => {
    const token = await createSession('node:test migration')
    const r = await app.inject({
      method: 'GET',
      url: '/login?next=%2Fadmin%2Fkit',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    assert.equal(r.statusCode, 302)
    assert.equal(r.headers.location, '/admin/kit')
    const [jar] = named(r, SESSION_COOKIE)
    assert.ok(jar.includes(`${SESSION_COOKIE}=${token};`))
    assert.doesNotMatch(jar, /Domain=/)
  })

  it('two canvas_key cookies: the live token opens the door wherever it sits', async () => {
    const token = await createSession('node:test migration')
    for (const jar of [
      `${SESSION_COOKIE}=${token}; ${SESSION_COOKIE}=stale-pre-gate-token`,
      `${SESSION_COOKIE}=stale-pre-gate-token; ${SESSION_COOKIE}=${token}`,
    ]) {
      const r = await app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie: jar } })
      assert.equal(r.statusCode, 200, 'cookie order must not matter')
    }
  })

  it('two dead canvas_key cookies are still just anonymous', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/admin/kit',
      headers: { cookie: `${SESSION_COOKIE}=dead-one; ${SESSION_COOKIE}=dead-two` },
    })
    assert.equal(r.statusCode, 302)
  })
})

// THE OWNER HINT (canvas/commands.js, BIBLE.md section 8): the session
// cookie is HttpOnly, so the canvas cannot see its owner is signed in. A
// second cookie rides beside it, readable and carrying no authority, set
// and cleared with the session, and the canvas asks /api/whoami only when
// it holds one. The /login re-issue stands in for every sign-in here: the
// claim, a login and the dev session all come through the same setter.
describe('the owner hint', () => {
  const attr = (c, name) => (c.match(new RegExp(`;\\s*${name}=([^;]*)`)) || [])[1]

  // mutation: auth.hint-httponly, auth.hint-lifetime
  it('every session the door sets carries the hint: readable, with the same life and scope', async () => {
    const token = await createSession('node:test hint')
    for (const extra of [{}, { host: 'example.com', 'x-forwarded-proto': 'https' }]) {
      const r = await app.inject({
        method: 'GET',
        url: '/login?next=%2F',
        headers: { cookie: `${SESSION_COOKIE}=${token}`, ...extra },
      })
      const [session] = named(r, SESSION_COOKIE)
      const [hint] = named(r, OWNER_HINT)
      assert.ok(hint, 'a sign-in without the hint')
      assert.match(hint, new RegExp(`^${OWNER_HINT}=1;`))
      assert.doesNotMatch(hint, /HttpOnly/i, 'the page cannot read an HttpOnly hint')
      assert.match(hint, /;\s*Path=\/(;|$)/)
      assert.match(hint, /;\s*SameSite=Lax/)
      assert.equal(
        attr(hint, 'Max-Age'),
        attr(session, 'Max-Age'),
        'the hint outlives or dies first'
      )
      assert.equal(attr(hint, 'Domain'), attr(session, 'Domain'), 'the hint is scoped apart')
    }
  })

  // mutation: auth.hint-outlives-logout
  it('logout clears the hint in every shape it clears the session', async () => {
    for (const [headers, shapes] of [
      [{ origin: ORIGIN }, 1],
      [{ host: 'example.com', 'x-forwarded-proto': 'https', origin: 'https://example.com' }, 1],
    ]) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/logout', headers })
      assert.equal(r.statusCode, 200)
      const hints = named(r, OWNER_HINT)
      assert.equal(hints.length, shapes, 'a hint shape is left standing after logout')
      assert.ok(hints.every((c) => attr(c, 'Max-Age') === '0'))
      assert.deepEqual(
        hints.map((c) => attr(c, 'Domain')).sort(),
        named(r, SESSION_COOKIE)
          .map((c) => attr(c, 'Domain'))
          .sort()
      )
    }
  })

  it('the hint opens nothing: a forged one is a guest', async () => {
    const cookie = `${OWNER_HINT}=1`
    const who = await app.inject({ method: 'GET', url: '/api/whoami', headers: { cookie } })
    assert.equal(who.statusCode, 401)
    const desk = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } })
    assert.equal(desk.statusCode, 302)
  })

  it("whoami names the owner's session as a session, which is what the canvas asks", async () => {
    const token = await createSession('node:test hint')
    const r = await app.inject({
      method: 'GET',
      url: '/api/whoami',
      headers: { cookie: `${SESSION_COOKIE}=${token}; ${OWNER_HINT}=1` },
    })
    assert.equal(r.statusCode, 200)
    assert.equal(JSON.parse(r.body).actor.kind, 'session')
  })
})

// Declared last: the hammer spends the in-process login throttle budget, so
// nothing after it may POST the login endpoints.
describe('login ceremony throttle', () => {
  it('turns the tail of a login/options hammer into 429s', async () => {
    const results = []
    for (let i = 0; i < 30; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/login/options',
        headers: { origin: ORIGIN },
      })
      results.push(r.statusCode)
    }
    assert.equal(results[0], 409, 'under the limit the endpoint answers normally (unclaimed)')
    assert.equal(results.at(-1), 429, 'past the limit the endpoint throttles')
    const firstThrottled = results.indexOf(429)
    assert.ok(firstThrottled > 10, 'legitimate use has headroom before the throttle bites')
    assert.ok(
      results.slice(firstThrottled).every((s) => s === 429),
      'once throttled, stays throttled within the window'
    )
  })
})

describe('challenge store bounds', () => {
  it('evicts the oldest challenge once the cap is reached', async () => {
    const { rememberChallenge, consumeChallenge } = await import('../src/services/auth.js')
    rememberChallenge('the-first-challenge')
    for (let i = 0; i < 64; i++) rememberChallenge(`filler-${i}`)
    assert.equal(
      consumeChallenge('the-first-challenge'),
      false,
      'the oldest challenge was evicted to make room'
    )
    assert.equal(consumeChallenge('filler-63'), true, 'the newest challenge is still consumable')
  })
})
