// test/audit.test.js
// The audit trail (services/audit.js), three ways:
//
//   1. the service: one NDJSON line per call, month-named file, in order,
//      a system actor when there is no request;
//   2. through the routes: a session revoke and a logout each leave the line
//      they should, naming the session by its hash and never by its token;
//   3. the guard: every mutating route registration under src/routes/
//      writes a line or says why not (`audit-ok: <reason>`), so the next
//      DELETE added to the desk cannot be the one nobody can explain later.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-audit-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')

const { build } = await import('../src/server.js')
const { createSession, sessionId } = await import('../src/services/auth.js')
const { audit, auditPath, readAudit } = await import('../src/services/audit.js')

let app
let token
let OWNER
const APEX = { host: 'example.com', 'x-forwarded-proto': 'https', origin: 'https://example.com' }

before(async () => {
  app = await build({ logger: false })
  token = await createSession('audit-test')
  OWNER = { ...APEX, cookie: `canvas_key=${token}` }
})

after(async () => {
  await app.close()
  rmSync(tmp, { recursive: true, force: true })
})

const raw = () => readFileSync(auditPath(), 'utf-8')
const linesFor = async (action) => (await readAudit()).filter((l) => l.action === action)

describe('the service', () => {
  // mutation: audit.day-named-file
  it('writes one JSON line per call to a month-named file, in order', async () => {
    for (let i = 0; i < 20; i++) audit(null, 'test.order', { target: String(i) })
    const lines = await linesFor('test.order')
    assert.equal(lines.length, 20)
    assert.deepEqual(
      lines.map((l) => l.target),
      Array.from({ length: 20 }, (_, i) => String(i))
    )
    assert.deepEqual(readdirSync(join(tmp, 'audit')), [
      `${new Date().toISOString().slice(0, 7)}.ndjson`,
    ])
    for (const l of raw().split('\n').filter(Boolean)) JSON.parse(l)
  })

  it('a call with no request is the system, with a null ip and request id', async () => {
    await audit(null, 'test.system', { target: 'x' })
    const [line] = await linesFor('test.system')
    assert.deepEqual(line.actor, { kind: 'system' })
    assert.equal(line.ip, null)
    assert.equal(line.req, null)
    assert.equal(line.outcome, 'ok')
    assert.match(line.at, /^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('through the routes', () => {
  // mutation: audit.actor-carries-token
  it('a revoke names the session by hash, never by token', async () => {
    const victim = await createSession('audit-victim')
    const target = await sessionId(victim)
    const r = await app.inject({
      method: 'DELETE',
      url: `/api/auth/sessions/${target}`,
      headers: OWNER,
    })
    assert.equal(r.statusCode, 200)
    const [line] = (await linesFor('auth.session.revoke')).filter((l) => l.target === target)
    assert.ok(line, 'the revoke left a line')
    assert.equal(line.outcome, 'ok')
    assert.equal(line.actor.kind, 'session')
    assert.equal(line.actor.id, await sessionId(token))
    assert.ok(!raw().includes(token), 'the token itself is never written')
  })

  it('a revoke of nothing is recorded as missing, not skipped', async () => {
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/auth/sessions/nope99',
      headers: OWNER,
    })
    assert.equal(r.statusCode, 404)
    const [line] = (await linesFor('auth.session.revoke')).filter((l) => l.target === 'nope99')
    assert.equal(line.outcome, 'missing')
  })

  it('a logout is recorded while the session still has a name', async () => {
    const t = await createSession('audit-logout')
    const id = await sessionId(t)
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...APEX, cookie: `canvas_key=${t}` },
    })
    assert.equal(r.statusCode, 200)
    const [line] = (await linesFor('auth.logout')).filter((l) => l.actor.id === id)
    assert.ok(line, 'the line names the session that logged out')
    assert.equal(line.outcome, 'ok')
    assert.equal(await sessionId(t), null, 'and the session is gone')
  })
})

describe('the guard', () => {
  // Every `x.post|put|patch|delete('/path', ...)` in src/routes/, with the
  // handler's body found by brace matching from its `async (` on. The
  // handler is the async arrow, not the first arrow after the path: the
  // hook path's options carry a sync errorHandler arrow before it.
  function mutatingHandlers(source) {
    const out = []
    const re = /\b(?:fastify|scope)\.(post|put|patch|delete)\(\s*'([^']+)'/g
    let m
    while ((m = re.exec(source))) {
      const handler = source.indexOf('async (', m.index)
      const arrow = source.indexOf('=>', handler)
      const open = source.indexOf('{', arrow)
      let depth = 0
      let i = open
      for (; i < source.length; i++) {
        if (source[i] === '{') depth++
        else if (source[i] === '}' && --depth === 0) break
      }
      out.push({ method: m[1].toUpperCase(), path: m[2], body: source.slice(open, i + 1) })
    }
    return out
  }

  // mutation: audit.route-without-line
  it('every mutating route writes an audit line or says why not', () => {
    const dir = new URL('../src/routes/', import.meta.url)
    const missing = []
    let seen = 0
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
      const source = readFileSync(new URL(file, dir), 'utf-8')
      for (const h of mutatingHandlers(source)) {
        seen++
        if (!/\baudit\(/.test(h.body) && !/audit-ok:/.test(h.body)) {
          missing.push(`${file}: ${h.method} ${h.path}`)
        }
      }
    }
    assert.ok(seen >= 8, `found ${seen} mutating routes; the walker is broken if this drops`)
    assert.deepEqual(missing, [], 'mutating routes with no audit line and no audit-ok reason')
  })
})

describe('the client address', () => {
  // Production trusts X-Forwarded-For from a private peer (the reverse proxy on the
  // Docker network) and from nobody else. A number would not do: Fastify 5
  // fails a hop count closed, which is how the first deploy of the trail
  // wrote the Docker peer as every caller's address.
  let prod
  before(async () => {
    prod = await build({ logger: false, trustProxy: 'uniquelocal' })
  })
  after(async () => {
    await prod.close()
  })

  async function ipSeenFrom(app, remoteAddress, tag) {
    const r = await app.inject({
      method: 'DELETE',
      url: `/api/auth/sessions/${tag}`,
      headers: { ...OWNER, 'x-forwarded-for': '203.0.113.9' },
      remoteAddress,
    })
    assert.equal(r.statusCode, 404)
    const [line] = (await linesFor('auth.session.revoke')).filter((l) => l.target === tag)
    return line.ip
  }

  it('a forwarded header from a private peer names the client', async () => {
    assert.equal(await ipSeenFrom(prod, '172.21.0.4', 'ip-private-peer'), '203.0.113.9')
  })

  it('the same header from a public peer is ignored', async () => {
    assert.equal(await ipSeenFrom(prod, '198.51.100.7', 'ip-public-peer'), '198.51.100.7')
  })

  it('and outside production the header is never believed', async () => {
    assert.equal(await ipSeenFrom(app, '172.21.0.4', 'ip-dev'), '172.21.0.4')
  })
})
