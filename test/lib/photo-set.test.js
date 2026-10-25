// test/lib/photo-set.test.js
// The set builder and the markup it emits, without a server in the way.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { naturalCompare, photoSetHtml, readPhotoSet } from '../../src/lib/photo-set.js'

const STATIC = join(import.meta.dirname, '../../src/static')
let root

before(() => {
  root = mkdtempSync(join(tmpdir(), 'photo-set-lib-'))
  mkdirSync(join(root, 'set'), { recursive: true })
  // Numbered the way a phone numbers things, so the ordering claim is
  // tested against the case that breaks a plain sort.
  for (const name of ['2.png', '10.png', '1.png']) {
    copyFileSync(join(STATIC, 'img/og/default.png'), join(root, 'set', name))
  }
  writeFileSync(join(root, 'set', 'readme.txt'), 'not a picture')
  mkdirSync(join(root, 'empty'), { recursive: true })
})

after(() => rmSync(root, { recursive: true, force: true }))

describe('readPhotoSet', () => {
  it('sorts numbers the way a person wrote them', () => {
    assert.deepEqual(['10.png', '2.png', '1.png'].sort(naturalCompare), [
      '1.png',
      '2.png',
      '10.png',
    ])
  })

  it('is the pictures in the folder, in natural order, with their sizes', () => {
    const photos = readPhotoSet(root, 'set', { title: 'Set' })
    assert.deepEqual(
      photos.map((p) => p.src),
      ['/img/set/1.png', '/img/set/2.png', '/img/set/10.png']
    )
    for (const p of photos) assert.deepEqual([p.width, p.height], [1200, 630])
  })

  it('numbers the fallback alt against the whole set, not the folder', () => {
    const photos = readPhotoSet(root, 'set', { title: 'Set' })
    assert.equal(photos[0].alt, 'Set, photo 1 of 3')
    assert.equal(photos[2].alt, 'Set, photo 3 of 3')
  })

  it('returns nothing for a folder that is not there, rather than throwing', () => {
    // One bad entry must not take down every content surface: the loader
    // holds /, /feed, /work, /feed.xml and /sitemap.xml at once.
    assert.deepEqual(readPhotoSet(root, 'no-such-set', { title: 'Gone' }), [])
    assert.deepEqual(readPhotoSet(root, 'empty', { title: 'Empty' }), [])
  })
})

describe('photoSetHtml', () => {
  it('renders nothing at all for an empty set', () => {
    assert.equal(photoSetHtml({ slug: 'x', title: 'X', photos: [] }), '')
  })

  it('escapes the title and the alt text into the attributes it builds', () => {
    const html = photoSetHtml({
      slug: 'x',
      title: 'Ben & Jerry\'s "trip"',
      photos: [{ src: '/img/x/1.png', alt: 'a <script> in the alt', width: 2, height: 1 }],
    })
    assert.ok(!html.includes('<script>'))
    assert.ok(html.includes('&amp;'))
    assert.ok(html.includes('&quot;'))
  })

  it('omits the size attributes when the file could not be measured', () => {
    const html = photoSetHtml({
      slug: 'x',
      title: 'X',
      photos: [{ src: '/img/x/1.png', alt: 'one', width: null, height: null }],
    })
    assert.ok(!html.includes('width='))
    assert.ok(!html.includes('--photoset-ratio'))
  })
})

describe('the carousel joins the page ladder rather than inventing one', () => {
  // BIBLE.md section 6: Escape is the one way out and it walks a rung at a
  // time (a query releases, a page closes, a menu folds, the camera flies
  // home). A widget that also answered Escape would make the key mean
  // different things depending on where the focus sat, which is the one
  // thing a single way out cannot survive.
  //
  // These used to grep photoset.js for the words it must not say. Now the
  // script runs against a hand-built page that records what it does, so the
  // question is what the carousel DOES with a key, not how it spells it.
  let source
  before(async () => {
    source = await readFile(join(STATIC, 'js/photoset.js'), 'utf8')
  })

  function mount({ snap = false, reducedMotion = false } = {}) {
    const log = { listeners: [], focus: 0, scrolls: [], observers: 0 }
    const el = (props = {}) => ({
      attrs: {},
      hasAttribute(n) {
        return n in this.attrs
      },
      setAttribute(n, v) {
        this.attrs[n] = v
      },
      getAttribute(n) {
        return this.attrs[n] ?? null
      },
      addEventListener: (type, fn) => log.listeners.push({ type, fn }),
      focus: () => log.focus++,
      getBoundingClientRect: () => ({ left: 0 }),
      querySelector: () => null,
      querySelectorAll: () => [],
      ...props,
    })
    const slides = [0, 1, 2].map(() => el({ querySelector: () => ({ loading: 'lazy' }) }))
    const track = el({ scrollLeft: 0, scrollTo: (o) => log.scrolls.push(o) })
    // a browser with scrollsnapchange has the handler slot on the element
    if (snap) track.onscrollsnapchange = null
    const root = el({
      querySelector: (s) => (s === '.photoset-track' ? track : null),
      querySelectorAll: (s) => (s === '.photoset-slide' ? slides : []),
    })
    const doc = el({ querySelectorAll: (s) => (s === '[data-photoset]' ? [root] : []) })
    const win = el({ matchMedia: (q) => ({ matches: reducedMotion && /reduce/.test(q) }) })
    class Observer {
      constructor() {
        log.observers++
      }
      observe() {}
    }
    // a module: its one import (the kit's walker) is handed in, recording
    const body = source.replace(
      /^import \{ wireScroll \} from 'multiplayer-canvas\/kit\/scroll'\n/m,
      ''
    )
    assert.notEqual(body, source, 'photoset.js no longer imports the walker it is handed here')
    const wireScroll = () => ({ set: () => {} })
    new Function('window', 'document', 'IntersectionObserver', 'wireScroll', body)(
      win,
      doc,
      Observer,
      wireScroll
    )
    // every keydown listener the script bound, anywhere, hears the key; the
    // count is how many times one of them claimed it
    const key = (k) => {
      let claimed = 0
      const e = {
        key: k,
        target: track,
        preventDefault: () => claimed++,
        stopPropagation: () => claimed++,
        stopImmediatePropagation: () => claimed++,
      }
      for (const l of log.listeners) if (l.type === 'keydown') l.fn(e)
      return claimed
    }
    return { log, key }
  }

  // mutation: photo-set.escape-rewinds
  it('handles no Escape key of its own', () => {
    const { log, key } = mount()
    assert.ok(
      log.listeners.some((l) => l.type === 'keydown'),
      'the strip binds no keys at all'
    )
    assert.equal(key('Escape'), 0, 'the carousel claims Escape')
    assert.deepEqual(log.scrolls, [], 'Escape moved the strip')
  })

  // mutation: photo-set.focus-follows-slide
  it('traps no focus and steals no tab', () => {
    const { log, key } = mount()
    assert.equal(key('Tab'), 0, 'the carousel intercepts Tab')
    key('ArrowRight')
    key('End')
    key('Home')
    assert.equal(log.scrolls.length, 3, 'the arrows stopped driving the strip')
    assert.equal(log.focus, 0, 'the carousel moves focus')
  })

  // mutation: photo-set.scroll-marker
  it('uses no CSS carousel pseudo-element, in markup or in style', async () => {
    // ::scroll-marker and ::scroll-button() are Blink-only, absent behind a
    // flag in both other engines and absent from Interop 2026, so they
    // would ship as a carousel that works in one browser.
    // Comments out: both files explain WHY they avoid these, by name.
    const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '')
    const css = await readFile(join(STATIC, 'css/photoset.css'), 'utf8')
    for (const [name, text] of [
      ['photoset.css', bare(css)],
      ['photoset.js', bare(source)],
    ]) {
      assert.ok(
        !/scroll-marker|scroll-button|::column/.test(text),
        `${name} rides an unshipped API`
      )
    }
  })

  // mutation: photo-set.snap-assumed
  it('feature-detects scrollsnapchange rather than assuming it', () => {
    const without = mount({ snap: false }).log
    assert.ok(
      !without.listeners.some((l) => l.type === 'scrollsnapchange'),
      'listens for scrollsnapchange where the engine has none'
    )
    assert.equal(without.observers, 1, 'no fallback for engines without it')
    const withIt = mount({ snap: true }).log
    assert.ok(
      withIt.listeners.some((l) => l.type === 'scrollsnapchange'),
      'ignores scrollsnapchange where the engine has it'
    )
    assert.equal(withIt.observers, 1, 'the observer is the fallback everywhere')
  })

  // mutation: photo-set.glides-regardless
  it('collapses its motion when the reader asked for less', () => {
    const calm = mount({ reducedMotion: true })
    calm.key('ArrowRight')
    assert.equal(calm.log.scrolls[0]?.behavior, 'auto', 'a reduced-motion step still glides')
    const moving = mount()
    moving.key('ArrowRight')
    assert.equal(moving.log.scrolls[0]?.behavior, 'smooth', 'a step never glides at all')
  })
})
