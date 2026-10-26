// test/kit-everywhere.test.js
// The kit outside the canvas: the doors, the error pages and the
// owner desk speak kit.css, and the door vocabulary that used to
// duplicate it (.cv-btn, .cv-chip, .cv-input, .cv-textarea in canvas.css)
// stays retired. Three text guards over the tree and one over the served
// pages:
//   1. the retired classes appear in no stylesheet, template or script;
//   2. no stylesheet of these surfaces picks its own hand (cursor: pointer):
//      the hands are js/kit.js's, set on <html>, and every control inherits;
//   3. every door and desk page ships kit.css, the parts map and js/kit.js.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cssPath } from './lib/stylesheets.js'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-kit-everywhere-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')

const { build } = await import('../src/server.js')
const { createSession } = await import('../src/services/auth.js')
const { SESSION_COOKIE } = await import('../src/middleware/auth.js')

const ROOT = join(import.meta.dirname, '..')
const RETIRED = /\.?\bcv-(btn|chip|input|textarea)\b/

function walk(dir, ext, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== 'vendor') walk(join(dir, e.name), ext, out)
    } else if (ext.test(e.name)) out.push(join(dir, e.name))
  }
  return out
}

// comments stay out: prose about the retired vocabulary is allowed, code is not
const strip = (text, rel) =>
  rel.endsWith('.njk')
    ? text.replace(/\{#[\s\S]*?#\}/g, '')
    : text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SOURCES = [
  ...walk('src/static/css', /\.css$/),
  ...walk('primitives', /\.(css|js)$/),
  ...walk('src/templates', /\.njk$/),
  ...walk('src/static/js', /\.js$/),
  ...walk('src/static/canvas', /\.js$/),
  ...walk('src/lib', /\.js$/),
  ...walk('src/routes', /\.js$/),
].map((rel) => [rel, readFileSync(join(ROOT, rel), 'utf8')])

// the stylesheets of the surfaces this guard covers: the doors, the desk
// and the kit itself
const SURFACE_CSS = ['canvas.css', 'desk.css', 'admin.css', 'kit.css', 'kit-specimen.css']

describe('the door vocabulary stays retired', () => {
  // mutation: kit-everywhere.door-button-returns, kit-everywhere.chip-in-template
  it('no stylesheet, template or script names .cv-btn, .cv-chip, .cv-input or .cv-textarea', () => {
    const hits = []
    for (const [rel, text] of SOURCES)
      strip(text, rel)
        .split('\n')
        .forEach((line, i) => {
          if (RETIRED.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`)
        })
    assert.deepEqual(
      hits,
      [],
      'the retired door vocabulary is back; it duplicated the kit (.k-btn, .k-rk, ' +
        '.k-field, .k-textarea) and the kit is the one set of controls:\n  ' +
        hits.join('\n  ')
    )
  })

  // mutation: kit-everywhere.own-hand
  it('no surface stylesheet picks its own hand: the cursor is inherited from the kit', () => {
    const hits = []
    for (const name of SURFACE_CSS)
      readFileSync(cssPath(name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .split('\n')
        .forEach((line, i) => {
          if (/cursor\s*:\s*pointer\b/.test(line)) hits.push(`${name}:${i + 1}: ${line.trim()}`)
        })
    assert.deepEqual(
      hits,
      [],
      'a control decides its own hand; the drawn hands are set on <html> by js/kit.js ' +
        'and every control inherits:\n  ' +
        hits.join('\n  ')
    )
  })
})

describe('every door and desk page wears the kit', () => {
  let app
  let cookie

  before(async () => {
    app = await build({ logger: false })
    app.get('/__boom__', async () => {
      throw new Error('boom')
    })
    await app.ready()
    cookie = `${SESSION_COOKIE}=${await createSession('node:test kit-everywhere')}`
  })

  after(async () => {
    await app.close()
  })

  // the door logged out, both error pages, and every desk page
  const pages = () => [
    ['/login', {}, 200],
    ['/nowhere-at-all', {}, 404],
    ['/__boom__', {}, 500],
    ['/admin', { cookie }, 200],
    ['/admin/sessions', { cookie }, 200],
    ['/admin/kit', { cookie }, 200],
  ]

  // mutation: kit-everywhere.base-drops-kit
  it('ships kit.css, the parts map and js/kit.js on each', async () => {
    for (const [url, h, status] of pages()) {
      const r = await app.inject({ method: 'GET', url, headers: h })
      const where = url
      assert.equal(r.statusCode, status, where)
      assert.match(
        r.body,
        /href="\/primitives\/kit\/kit(-[0-9a-f]{8})?\.css"/,
        `${where}: no kit.css`
      )
      assert.match(r.body, /--kp-btn-up: url\(/, `${where}: no parts map`)
      assert.match(r.body, /src="\/js\/kit(-[0-9a-f]{8})?\.js" type="module"/, `${where}: no hands`)
      assert.doesNotMatch(r.body, RETIRED, `${where}: the retired vocabulary is on the page`)
    }
  })
})
