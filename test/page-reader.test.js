// test/page-reader.test.js
// The page as a platform: "the platform I can later do
// articles/blogs/reports from that has all the bells and whistles of a
// page", and "make sure anyone can read it". A page that is read (a case
// study now) carries the reader's settings under its meta line, the same
// markup on a direct load and on a click: Dark Mode (the one stated
// exemption from ONE GROUND, held by test/one-ground.test.js), Plain Type
// and Listen. This file holds what the reader gets and what reaches them:
// the group is there on every read page and on no other, its words are
// capitalized labels on kit controls, the voice reads prose and never code
// or footnotes, lights the sentence it is on without touching the page,
// stops when the page goes, and is not offered where the browser cannot
// speak; the choices survive a browser that refuses storage. And the
// accessibility floor the audit set: a code block takes the keyboard, and
// what a full page covers leaves the keyboard's way.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from '../src/server.js'
import { loadFeedEntries } from '../src/routes/feed.js'
import { isCaseStudy, isFullPage, pathFor } from '../src/lib/entry-kind.js'
import { pickVoice, readerMarkup } from '../src/static/js/page-reader.js'
import { renderMarkdown } from '../src/lib/markdown.js'
import { cssRules } from './lib/cascade.js'

const ROOT = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const APP = read('src/static/canvas/app.js')
const READER = read('src/static/js/page-reader.js')
const CSS = read('src/static/css/page-reader.css')
const fn = (src, open) => {
  const i = src.indexOf(open)
  assert.ok(i > -1, `${open} is gone`)
  return src.slice(i, src.indexOf('\n}\n', i))
}

const entries = (await loadFeedEntries()).filter((e) => !e.hidden)
const read_ = entries.filter(isCaseStudy)
const other = entries.filter((e) => isFullPage(e) && !isCaseStudy(e))

let app
before(async () => {
  app = await build({ logger: false })
})
after(async () => {
  await app.close()
})

describe("the reader's settings", () => {
  // mutation: page-reader.ssr-not-reading, page-reader.ssr-no-group
  it('a page that is read arrives with the group under its meta line, and no other page does', async () => {
    // pages that are read and full pages that are not, to hold to this
    assert.ok(read_.length >= 1 && other.length >= 1)
    for (const e of [...read_, ...other]) {
      const r = await app.inject({ method: 'GET', url: pathFor(e) })
      assert.equal(r.statusCode, 200)
      const groups = r.body.match(/<div class="reader" role="group"/g) || []
      if (isCaseStudy(e)) {
        assert.equal(groups.length, 1, `${e.slug}: one group`)
        assert.match(r.body, /<div id="modal" role="dialog" class="open fullpage reading"/)
        // under the meta line, before the page's body, the string the
        // canvas paints
        assert.ok(
          r.body.includes(`</div>${readerMarkup()}<div class="exp-native">`),
          `${e.slug}: the group is not where the canvas paints it`
        )
      } else {
        assert.equal(groups.length, 0, `${e.slug} is not read, and carries the group`)
        assert.doesNotMatch(r.body, /class="open fullpage reading"/)
      }
    }
  })

  // mutation: page-reader.client-no-group, page-reader.client-not-wired
  it('the canvas paints the same group on a click and wires it', () => {
    const mount = fn(APP, 'async function mountEmbed(p, slug){')
    assert.match(
      mount,
      /\$\{metaMarkup\(p, slug\)\}\$\{isReading\(slug\) \? readerMarkup\(\) : ''\}<div class="exp-native">/
    )
    assert.match(mount, /pixelHead\(p\);\n\s*wirePageReader\(slug\);/)
    assert.match(fn(APP, 'function adoptSsrSheet(slug){'), /wirePageReader\(slug\);/)
    assert.match(
      APP,
      /const isReading = slug => !!\(slug && PAGES\[slug\] && PAGES\[slug\]\.kind === 'case-study'\);/
    )
  })

  it('each control is a kit control with its word on it, capitalized', () => {
    const m = readerMarkup()
    assert.match(m, /role="group" aria-label="Reader settings"/)
    for (const [key, word] of [
      ['ground', 'Dark Mode'],
      ['plain', 'Plain Type'],
    ])
      assert.ok(
        m.includes(
          `<button type="button" class="k-switch" role="switch" aria-checked="false" data-reader="${key}"><span class="k-lever"></span>${word}</button>`
        ),
        `${word} is not a labelled switch`
      )
    assert.match(m, /data-reader="listen">[^]*?<span>Listen<\/span>/)
    assert.match(m, /data-reader="stop" hidden>[^]*?<span>Stop<\/span>/)
    // offered only where the browser can speak (wireReader shows it)
    assert.match(m, /<span class="reader-listen" hidden>/)
  })

  // mutation: page-reader.listen-always, page-reader.reads-code, page-reader.reads-footnotes, page-reader.no-tts-light
  it('Listen reads the prose and never the code or the footnotes, lights its sentence, and is only offered where it can speak', () => {
    assert.match(READER, /const NEVER = 'pre, \.footnotes, sup\.footnote-ref/)
    // a figure is read by what it shows
    assert.match(READER, /pic\.getAttribute\('aria-label'\) \|\| pic\.getAttribute\('alt'\)/)
    // lit by the Custom Highlight API, the page never rewritten
    assert.match(READER, /CSS\.highlights\.set\('tts', new Highlight\(item\.range\)\)/)
    assert.match(CSS, /::highlight\(tts\) \{/)
    assert.doesNotMatch(
      fn(READER, 'export function wireReader('),
      /innerHTML = [^`]*item|\.wrap|<mark/
    )
    // kept in the middle third of the screen
    assert.match(READER, /if \(box\.top < h \/ 3 \|\| box\.bottom > \(2 \* h\) \/ 3\)/)
    // offered only where there is a voice
    assert.match(READER, /if \(able\(\)\) \{\n\s*listenBox\.hidden = false/)
  })

  // mutation: page-reader.voice-outlives-page, page-reader.voice-outlives-tab
  it('the voice stops when the page closes, switches, or the browser tab is left', () => {
    assert.match(fn(APP, 'function switchTab(slug){'), /reader\?\.stop\(\); reader = null;/)
    const close = fn(APP, 'function paintSheet(slug){')
    assert.match(close, /\} else \{\n\s*reader\?\.stop\(\); reader = null;/)
    assert.match(READER, /if \(document\.hidden\) stop\(\)/)
    assert.match(READER, /addEventListener\('pagehide', stop\)/)
  })

  // mutation: page-reader.storage-bare
  it("keeps the reader's choices in this browser, and works without them", () => {
    const uses = READER.split('\n').filter((l) => /localStorage\./.test(l))
    assert.equal(uses.length, 2, 'one read and one write')
    for (const l of uses) {
      const at = READER.indexOf(l)
      assert.match(READER.slice(at - 20, at), /try \{\n\s*$/, `${l.trim()} is not wrapped`)
    }
  })

  // mutation: page-reader.plain-pixel-face
  it('Plain Type sets the prose in the reader’s own sans, and leaves the title its pixels', () => {
    const plain = cssRules(CSS).find((r) =>
      r.selectors.some(
        (s) => s.trim() === "#modal.reading[data-type='plain'] #sheetInner:has(> h1.ptitle) .prose"
      )
    )
    assert.ok(plain, 'there is no Plain Type rule')
    const decl = Object.fromEntries(plain.decls.map((d) => [d.prop, d.value]))
    assert.equal(decl['font-family'], 'system-ui, sans-serif')
    assert.equal(decl['text-shadow'], 'none')
  })
})

describe('the accessibility floor a page stands on', () => {
  // mutation: page-reader.code-untabbable
  it('a code block takes the keyboard, since it can scroll sideways', () => {
    assert.match(renderMarkdown('```\nx\n```'), /<pre class="hljs" tabindex="0">/)
    assert.match(renderMarkdown('```js\nx\n```'), /<pre class="hljs" tabindex="0">/)
  })

  // mutation: page-reader.fan-under-page-reachable
  it('what a full page covers leaves the keyboard and the screen reader', () => {
    const cover = fn(APP, 'function coverUnder(full){')
    assert.match(cover, /fanN\.inert = full;/)
    assert.match(cover, /minimap\.inert = full;/)
    assert.match(fn(APP, 'function adoptSsrSheet(slug){'), /coverUnder\(full\);/)
    const sheet = fn(APP, 'function paintSheet(slug){')
    assert.match(sheet, /coverUnder\(full\);/)
    assert.match(sheet, /coverUnder\(false\);/)
  })
})

describe('the voice a page is read with', () => {
  const v = (name, lang, o = {}) => ({ name, lang, localService: true, default: false, ...o })
  it('is Daniel wherever he is, else the richest voice in the page language, never a novelty one', () => {
    const list = [
      v('Fred', 'en-US', { default: true }),
      v('Bells', 'en-US'),
      v('Samantha', 'en-US'),
      v('Ava (Premium)', 'en-US'),
      v('Google US English', 'en-US', { localService: false }),
      v('Amélie (Premium)', 'fr-CA'),
    ]
    assert.equal(pickVoice(list, 'en').name, 'Ava (Premium)')
    assert.equal(pickVoice(list, 'en-GB').name, 'Ava (Premium)')
    // the one voice beats a richer one, however it is listed
    assert.equal(pickVoice([...list, v('Daniel', 'en-GB')], 'en').name, 'Daniel')
    assert.equal(
      pickVoice([...list, v('Daniel (English (UK))', 'en-GB')], 'en').name,
      'Daniel (English (UK))'
    )
    assert.equal(
      pickVoice([...list, v('Daniela', 'en-GB')], 'en').name,
      'Ava (Premium)',
      'a prefix is not a name'
    )
    // without him, Chrome's British male, then Windows's own
    assert.equal(
      pickVoice(
        [
          ...list,
          v('Microsoft David', 'en-US'),
          v('Google UK English Male', 'en-GB', { localService: false }),
        ],
        'en'
      ).name,
      'Google UK English Male'
    )
    assert.equal(pickVoice([...list, v('Microsoft David', 'en-US')], 'en').name, 'Microsoft David')
    // and a richer voice that is not him: still him, so every Mac sounds the same
    assert.equal(
      pickVoice([...list, v('Daniel', 'en-GB'), v('Tom (Enhanced)', 'en-US')], 'en').name,
      'Daniel'
    )
    assert.equal(pickVoice(list, 'fr').name, 'Amélie (Premium)')
    // Chrome's own voice on the network beats a thin one on the device
    assert.equal(pickVoice([list[4], list[2]], 'en').name, 'Google US English')
    // two thin voices: the local one
    assert.equal(
      pickVoice([v('Thin', 'en-US', { localService: false }), list[2]], 'en').name,
      'Samantha'
    )
    // a network voice with a rich name still loses to a local one
    assert.equal(
      pickVoice(
        [v('Microsoft Aria Online (Natural)', 'en-US', { localService: false }), list[2]],
        'en'
      ).name,
      'Microsoft Aria Online (Natural)'
    )
    // nothing in the language: the browser keeps its own
    assert.equal(pickVoice(list, 'de'), null)
    assert.equal(pickVoice([list[0], list[1]], 'en'), null, 'novelty and first generation are out')
  })
})
