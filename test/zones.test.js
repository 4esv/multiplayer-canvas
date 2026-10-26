// test/zones.test.js
// BIBLE.md section 5: what fits in a paragraph and a few links is a place on
// the ground. The zones are tiles the compass seats, their copy is the
// server's, and their paths land the camera on them.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  TILES,
  ZONES,
  TAG_DIR,
  LAND_ROUTES,
  landForPath,
  stackForPath,
  homeVec,
} from '../src/static/canvas/layout.js'
import { aboutZone, workBlocks } from '../src/lib/zones.js'
import { build } from '../src/server.js'

const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120' }

const WORK_TEXT = [
  'work',
  '====',
  '',
  'what i do',
  '---------',
  'First paragraph, verbatim.',
  '',
  'My best work is in:',
  '- Automation, letting the computers do the work.',
  '- Integration, connecting things.',
  '',
  'What I am looking to do next, one paragraph.',
  '',
  'Not clear enough? A long paragraph that does not ride the zone.',
  '',
  'get in touch',
  '------------',
  'you@example.com',
  'https://linkedin.com/in/your-handle',
  '',
  'case studies',
  '------------',
  '- something',
].join('\n')

describe('zones: the tiles', () => {
  it('one zone, on a bearing the compass has, with a home vector', () => {
    // contact is not a zone: the address is the envelope in the icon ring,
    // and a zone never repeats what the ring says
    assert.deepEqual(ZONES.map((z) => z.id).sort(), ['about'])
    for (const z of ZONES) {
      for (const tag of z.tags) assert.ok(TAG_DIR[tag], `${z.id}: no bearing for ${tag}`)
      assert.ok(homeVec(z), `${z.id} has no home vector`)
      assert.equal(z.tier, 1, `${z.id}: the person's own words ride the widget ring`)
      assert.ok(z.mw >= 6 && z.mh >= 6, `${z.id}: a zone holds a paragraph, it needs the room`)
    }
    assert.ok(TILES.includes(ZONES[0]), 'zones are seated by the world')
  })

  // mutation: zones.land-by-first-segment
  it('the paths land: /about, and nothing else', () => {
    // /work is not a zone: the WORK section lives in the about triptych and
    // the path is the case studies, which stackForPath answers. One zone, so
    // one land route, and /work must NOT land a camera or the visitor is
    // parked on bare ground.
    assert.deepEqual(LAND_ROUTES, { '/about': 'about' })
    assert.equal(landForPath('/about'), 'about')
    assert.equal(stackForPath('/work'), 'work', '/work is the studies now')
    for (const p of ['/', '/work', '/case-studies', '/about/x', '/feed', '/hire', '/contact'])
      assert.equal(landForPath(p), null)
  })
})

describe("zones: the copy is the server's", () => {
  it('about: two blocks, Me and This Site, from the about text; the Pages block stays off', () => {
    const text = [
      'about',
      '=====',
      '',
      'Me',
      '--',
      'My name is Ada.',
      '',
      'Second paragraph about me.',
      '',
      'This Site',
      '---------',
      'One canvas.',
      '',
      'Pages',
      '-----',
      'work        /work       what I do',
      '',
      'email       you@example.com',
      'github      https://github.com/your-handle',
      'gpg         https://example.com/key.asc',
    ].join('\n')
    const z = aboutZone(text, WORK_TEXT)
    assert.equal(z.title, 'ABOUT')
    assert.equal(z.split, true, 'the body is three blocks side by side')
    assert.match(
      z.html,
      /<h3>Me<\/h3><p>My name is Ada\.<\/p>\n<p>Second paragraph about me\.<\/p>/
    )
    assert.match(z.html, /<h3>Site<\/h3><p>One canvas\.<\/p>/)
    // Me, Work, Site: the triptych
    assert.equal((z.html.match(/class="zcol"/g) || []).length, 3)
    assert.match(z.html, /<h3>Work<\/h3>/)
    assert.ok(
      z.html.indexOf('<h3>Me</h3>') < z.html.indexOf('<h3>Work</h3>') &&
        z.html.indexOf('<h3>Work</h3>') < z.html.indexOf('<h3>Site</h3>'),
      'the panels read Me, Work, Site'
    )
    assert.doesNotMatch(
      z.html,
      /you@example\.com|github\.com|gpg|\/work/,
      'reach-me and the pages live elsewhere'
    )
  })
  it("work: the triptych's middle panel, every block up to the folded pitch", () => {
    const text = [
      'work',
      '====',
      '',
      'what i do',
      '---------',
      'First paragraph, verbatim.',
      '',
      'My best work is in:',
      '- Automation, letting the computers do the work.',
      '- Integration, connecting things.',
      '',
      'What I am looking to do next, one paragraph.',
      '',
      'Not clear enough? A long paragraph that does not ride the zone.',
      '',
      'get in touch',
      '------------',
      'you@example.com',
      'https://linkedin.com/in/your-handle',
      '',
      'case studies',
      '------------',
      '- something',
    ].join('\n')
    const z = { html: workBlocks(text) }
    assert.match(z.html, /First paragraph, verbatim\./)
    assert.match(z.html, /<li>Automation/)
    assert.match(z.html, /<li>Integration/)
    assert.match(
      z.html,
      /<\/ul><p>What I am looking to do next/,
      'the paragraph after the pillars rides too'
    )
    assert.doesNotMatch(
      z.html,
      /you@example\.com|linkedin/,
      "get-in-touch is the ring's, not the zone's"
    )
    assert.doesNotMatch(
      z.html,
      /Not clear enough/,
      "the long paragraph is the sheet's, not the zone's"
    )
    assert.doesNotMatch(z.html, /case studies/, "the index is the stack's")
  })
})

describe('zones: served', () => {
  let app
  before(async () => {
    app = await build({ logger: false })
    await app.ready()
  })
  after(async () => app.close())

  it('the boot payload carries the zone, and the prelude its words', async () => {
    const r = await app.inject({ method: 'GET', url: '/', headers: UA })
    const boot = JSON.parse(
      r.body.match(/<script type="application\/json" id="boot">([\s\S]*?)<\/script>/)[1]
    )
    assert.deepEqual(
      boot.zones.map((z) => z.id),
      ['about']
    )
    // the work copy is the triptych's middle panel now, not a zone of its own
    const about = boot.zones.find((z) => z.id === 'about')
    assert.match(about.html, /<h3>Me<\/h3>/)
    assert.match(about.html, /<h3>Work<\/h3>/)
    assert.match(about.html, /<h3>Site<\/h3>/)
    assert.match(about.html, /example copy for the work panel/, 'the work panel carries its text')
    assert.doesNotMatch(about.html, /Not clear enough/, 'and stops before the longer pitch')
    assert.ok(r.body.includes('id="preludeZones"'))
    assert.ok(r.body.includes('example copy for the work panel'), 'the words are in the document')
    // and nothing in the zones names a repo-internal thing
    for (const z of boot.zones) assert.doesNotMatch(z.html, /BIBLE|content\/feed|src\//)
  })
})
