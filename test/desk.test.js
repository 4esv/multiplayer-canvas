// test/desk.test.js
// The desk: one registry (src/lib/desk.js) reaches every owner page as the
// same navigation, the current tool marked, and the desk installs from
// its own manifest while the public doors keep the site's.
import site from '../site.config.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-desk-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')
process.env.ROOMS_STORE_PATH = join(tmp, 'rooms.json')

import { cssRules, computed, elementOf } from './lib/cascade.js'
const { build } = await import('../src/server.js')
const { createSession } = await import('../src/services/auth.js')
const { SESSION_COOKIE } = await import('../src/middleware/auth.js')
const { DESK_TOOLS, deskFor, glyphPath, glyphSvg, logoRows } = await import('../src/lib/desk.js')

let app
let cookie

before(async () => {
  app = await build({ logger: false })
  cookie = `${SESSION_COOKIE}=${await createSession('node:test desk')}`
})

after(async () => {
  await app.close()
})

const PAGES = [
  ['admin', '/admin'],
  ['kit', '/admin/kit'],
  ['rooms', '/admin/sessions'],
]

describe('the registry', () => {
  it('names every tool once, with a glyph that draws', () => {
    const ids = DESK_TOOLS.map((t) => t.id)
    assert.equal(new Set(ids).size, ids.length, 'tool ids are unique')
    for (const t of DESK_TOOLS) {
      assert.ok(t.label && t.href, `${t.id} has a label and an href`)
      assert.match(glyphSvg(t.glyph), /^<svg viewBox="0 0 11 11"/, `${t.id} draws on the 11 grid`)
    }
    assert.throws(() => glyphSvg('nope'), /no glyph/)
  })

  // mutation: desk.single-digit-cells
  it('wears the shipped logo as the mark, not a copy of it', () => {
    const logo = readFileSync(
      join(import.meta.dirname, '../src/static/img/icon/default.svg'),
      'utf8'
    )
    const cells = logo.match(/M\d+ \d+h1v1h-1z/g)
    assert.ok(cells.length > 20, 'the logo has ink')
    // every logo cell is a mark cell and nothing else is
    const rows = logoRows(logo)
    assert.equal(rows.join('').split('#').length - 1, cells.length)
    assert.ok(glyphSvg('mark').includes(glyphPath(rows)))
    assert.equal(DESK_TOOLS.find((t) => t.id === 'admin').glyph, 'mark')
    assert.equal(logoRows('<svg><path d="M0 0h1v1h-1zM10 10h1v1h-1z"/></svg>')[10], '..........#')
  })

  it('compiles rows of ink to one-cell rects', () => {
    assert.equal(glyphPath(['#.#', '.##']), 'M0 0h1v1h-1zM2 0h1v1h-1zM1 1h2v1h-2z')
  })

  it('every owner page has a tool, and the bar holds them all', () => {
    for (const [id] of PAGES)
      assert.ok(
        DESK_TOOLS.find((t) => t.id === id),
        `${id} is a tool`
      )
    assert.equal(DESK_TOOLS.filter((t) => t.bar).length, DESK_TOOLS.length)
  })
})

describe('the shell', () => {
  for (const [id, url] of PAGES) {
    it(`${url} wears the desk with ${id} current`, async () => {
      const r = await app.inject({ method: 'GET', url, headers: { cookie } })
      assert.equal(r.statusCode, 200)
      assert.ok(r.body.includes('class="dk-nav"'), 'the nav renders')
      assert.ok(r.body.includes('href="/desk.webmanifest"'), 'the desk manifest is linked')
      assert.ok(!r.body.includes('href="/manifest.json"'), 'not the public one')
      assert.ok(r.body.includes('data-logout'), 'log out is reachable')
      for (const t of DESK_TOOLS) {
        assert.ok(r.body.includes(`href="${t.href}"`), `${t.id} is linked from ${url}`)
      }
      const current =
        r.body.match(/<a class="dk-tab[^"]*" href="([^"]+)" aria-current="page"/g) || []
      assert.equal(current.length, 1, 'exactly one tab is current')
      assert.ok(current[0].includes(`href="${url}"`), `the current tab is ${url}`)
      // the desk's own script rides every page
      assert.ok(r.body.includes('/js/desk.js'))
    })
  }

  // mutation: desk.home-missing, desk.home-hidden-on-phone, desk.home-rail-lost
  it('every size has a way from the desk back to the site', async () => {
    // a phone's bar held the four tools and nothing that left the desk: the
    // mark was rail furniture, so the desk on a phone was a room with no door
    const r = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } })
    const rules = cssRules(
      readFileSync(join(import.meta.dirname, '../src/static/css/desk.css'), 'utf8')
    )
    // a phone: the head's home, before the title
    const home = elementOf(r.body, 'dk-home')
    assert.ok(home, 'the desk head has no way home')
    assert.equal(home.attrs.href, '/')
    assert.match(
      r.body,
      /<header class="dk-top">\s*(?:\{#[^]*?#\}\s*)?<a class="dk-home"/,
      'home is not first in the head'
    )
    const head = { tag: 'header', classes: ['dk-top'], attrs: {} }
    assert.notEqual(
      computed(rules, [head, home], 'display', 390),
      'none',
      'home is hidden on a phone'
    )
    // a desktop: the rail's mark
    const mark = elementOf(r.body, 'dk-mark')
    assert.equal(mark.attrs.href, '/')
    const nav = { tag: 'nav', classes: ['dk-nav'], attrs: {} }
    assert.notEqual(computed(rules, [nav, mark], 'display', 1280), 'none', 'the rail lost its mark')
  })

  // mutation: desk.login-no-way-out
  it('/login has a way out that is not the back button', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/login',
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/140' },
    })
    assert.match(r.body, new RegExp(`<p class="cv-wordmark"><a href="/">${site.name}</a></p>`))
  })

  it('/login keeps the public manifest', async () => {
    const r = await app.inject({ method: 'GET', url: '/login' })
    assert.equal(r.statusCode, 200)
    assert.ok(r.body.includes('href="/manifest.json"'))
    assert.ok(!r.body.includes('desk.webmanifest'))
  })

  it('the desk manifest installs standalone at /admin', async () => {
    const r = await app.inject({ method: 'GET', url: '/desk.webmanifest' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /manifest\+json/)
    assert.match(r.headers['cache-control'], /max-age=3600/)
    const m = JSON.parse(r.body)
    assert.equal(m.start_url, '/admin')
    assert.equal(m.display, 'standalone')
    assert.notEqual(m.id, '/', 'a different app from the public site')
  })
})
