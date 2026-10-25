// /contact was a place on the ground and is nothing now (2026-09-11): the
// address is the envelope in the icon ring, a mailto and nothing behind it.
// Renames and retirements are clean breaks here, so the path 404s rather
// than redirecting, and the endpoint the form once posted to stays gone.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { build } from '../src/server.js'
import { TILES } from '../src/static/canvas/layout.js'
import site from '../site.config.js'

const UA = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
}

describe('contact: retired', () => {
  let app
  before(async () => {
    app = await build({ logger: false })
    await app.ready()
  })
  after(async () => {
    await app.close()
  })

  it('/contact is gone, for the canvas and for curl alike', async () => {
    for (const headers of [UA, { 'user-agent': 'curl/8' }]) {
      const r = await app.inject({ method: 'GET', url: '/contact', headers })
      assert.equal(r.statusCode, 404)
    }
  })

  it('there is no endpoint behind it either', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/contact', payload: { from: 'a@b.co' } })
    assert.equal(r.statusCode, 404)
  })

  it('the address is an icon in the ring, on the self bearing with the key', () => {
    const mail = TILES.find((t) => t.id === 'ic-mail')
    assert.ok(mail, 'no envelope in the ring')
    assert.equal(mail.type, 'icon')
    assert.deepEqual(mail.tags, ['self'])
    assert.ok(!TILES.some((t) => t.id === 'contact'), 'the contact zone is still seated')
  })

  // mutation: contact.prelude-drops-mail
  it('the home document still says the address, in the prelude', async () => {
    // the prelude, not the page: the Person JSON-LD carries the same mailto,
    // so a whole-body match passed with the visible line gone
    const r = await app.inject({ method: 'GET', url: '/', headers: UA })
    const at = r.body.indexOf('<div id="prelude">')
    assert.ok(at > -1, 'the home document has no prelude')
    const prelude = r.body.slice(at).replace(/<script[\s\S]*?<\/script>/g, ' ')
    assert.ok(
      prelude.includes(`<a href="mailto:${site.author.email}">`),
      'the prelude lost the address'
    )
  })
})
