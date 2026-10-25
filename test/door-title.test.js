// test/door-title.test.js
// THE DOORS' TITLES (BIBLE.md section 10, the dust): the 404, the 500 and the
// login each open on a real <h1> set in the canvas's pixel face, and a title
// in that face is something a cursor can disturb wherever it stands. Before
// this the 404 and the 500 drew their code as an image in a paragraph, which
// gave a reader no heading to land on, and the login had none.
//
// What is held: each door serves one h1 in the display face with its word for
// readers and links the part that dresses it and the script that stirs it; the
// part is one stylesheet (the canvas does not restate it); and a door sets its
// title on the lattice and gives its touch to the dust.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { build } from '../src/server.js'

const ROOT = join(import.meta.dirname, '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const PTITLE = read('src/static/css/ptitle.css')
const HOME_CSS = read('src/static/css/canvas-home.css')
const DOOR_CSS = read('src/static/css/canvas.css')
const HOME_NJK = read('src/templates/canvas/home.njk')

// rule bodies by their selector, from the first place the selector starts a line
const rule = (css, selector) => {
  const at = css.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'))
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1)
}

describe('the doors serve a pixel title', () => {
  let app
  before(async () => {
    app = await build({ logger: false })
    // a route that throws before the instance is ready, so the shared error
    // handler (set during build) catches it at request time
    app.get('/__boom-title__', async () => {
      throw new Error('boom-title')
    })
    await app.ready()
  })
  after(async () => {
    await app.close()
  })

  const doors = [
    ['the 404', '/nonexistent-door', 404, '404'],
    ['the 500', '/__boom-title__', 500, '500'],
    ['the login', '/login', 200, 'key'],
  ]
  for (const [name, url, status, word] of doors) {
    // mutation: door.template-title-lost, door.template-title-lost-500, door.template-title-lost-login
    it(`${name} opens on one h1 in the display face, with its word for readers`, async () => {
      const r = await app.inject({ method: 'GET', url })
      assert.equal(r.statusCode, status)
      assert.equal((r.body.match(/<h1\b/g) ?? []).length, 1, 'a door has one h1')
      assert.match(r.body, /<h1 class="ptitle ptitle-display"/)
      assert.match(r.body, new RegExp(`<span class="px-vh">${word}</span></h1>`))
      assert.match(r.body, /<svg class="pw"/)
      assert.doesNotMatch(r.body, /cv-error-code/, 'the code is no longer an image in a paragraph')
    })

    // mutation: door.shell-part-unlinked, door.shell-script-unlinked
    it(`${name} links the part that dresses the title and the script that stirs it`, async () => {
      const r = await app.inject({ method: 'GET', url })
      assert.match(r.body, /<link rel="stylesheet" href="\/css\/ptitle\.css">/)
      assert.match(r.body, /<script src="\/js\/door\.js" type="module"><\/script>/)
    })
  }
})

describe('the pixel title is one part', () => {
  // mutation: door.title-restated-on-the-canvas, door.title-restated-on-the-door
  it('is written in ptitle.css, and the canvas and the door do not restate it', () => {
    for (const sel of ['.px-vh', '.ptitle', '.ptitle .pw'])
      assert.ok(rule(PTITLE, sel), `ptitle.css has no ${sel}`)
    for (const [file, css] of [
      ['canvas-home.css', HOME_CSS],
      ['canvas.css', DOOR_CSS],
    ])
      for (const sel of ['.px-vh', '.ptitle', '.ptitle .pw'])
        assert.equal(rule(css, sel), null, `${file} restates ${sel}`)
  })

  // mutation: door.home-part-unlinked
  it('is linked by the canvas before its own sheet, so the card keeps its half cell', () => {
    const part = HOME_NJK.indexOf("asset('/css/ptitle.css')")
    const home = HOME_NJK.indexOf("asset('/css/canvas-home.css')")
    assert.ok(
      part > -1 && home > part,
      'the home shell does not link ptitle.css before canvas-home.css'
    )
    assert.ok(rule(HOME_CSS, '.cs-card .ptitle'), 'the card sets its own pitch')
  })
})

describe('a door sets its title on the lattice', () => {
  // mutation: door.title-pitch-off-lattice, door.title-scrolls-the-page, door.title-leaves-centre
  it('at two cells a glyph pixel, centred, and takes a finger rather than scrolling', () => {
    const r = rule(DOOR_CSS, '.cv-door .ptitle')
    assert.ok(r, 'canvas.css has no rule for a door title')
    assert.match(r, /--tpx: calc\(2 \* var\(--cv-px\)\);/)
    assert.match(r, /justify-content: center;/)
    assert.match(r, /touch-action: none;/)
  })
})
