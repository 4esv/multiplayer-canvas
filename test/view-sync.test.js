// test/view-sync.test.js
// THE VIEW, SHARED.  What a visitor is looking
// at (a video's playback, the instrument up, a photograph, the sentence read
// aloud, the fan spread) rides the act bridge as one more
// channel, `view`, so the room's audience rules hold it unchanged: a follow
// hears the one followed, a session hears everyone (BIBLE.md section 2).
//
// This file holds the pieces a browser is not needed for: the grammar the
// room relays and the one the canvas reads (strict, and only for the page
// open here), the drift and echo rules, the throttle on a scrub, the bridge
// (stamping, repeats dropped, nothing said while a peer's view is applied,
// the fan held for the one followed), the media element's side (a peer's
// playback applied, its events never said back, a refused play told to the
// visitor rather than forced), the photo strip and the voice. The two
// browsers are scripts/verify, by hand: see the BIBLE row.
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

import { ACT_CHANNELS, actOf, isActData } from '../primitives/presence/presence-protocol.js'
import {
  viewOf,
  mediaState,
  isEcho,
  needsSeek,
  throttle,
  hear,
  say,
  shareView,
  onView,
  holdsFan,
  wireViewSync,
} from '../primitives/rooms/view-sync.js'
import { wireReader } from '../src/static/js/page-reader.js'

const ROOT = join(import.meta.dirname, '..')
// photoset.js is a module whose one import is the kit's walker; the stub page
// below hands it a recording walker in the import's place
const PHOTOSET = readFileSync(join(ROOT, 'src/static/js/photoset.js'), 'utf8').replace(
  /^import \{ wireScroll \} from 'multiplayer-canvas\/kit\/scroll'\n/m,
  ''
)
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')

// one of each kind, as a tab sends it
const EACH = [
  { what: 'media', pg: 'nao', n: 0, p: true, t: 12.3, r: 1 },
  { what: 'tab', pg: 'web-instruments', i: 'drums' },
  { what: 'photo', pg: 'hanoi', s: 0, i: 4 },
  { what: 'listen', pg: 'nao', on: 'play', i: 7 },
  { what: 'fan', s: 'work', i: 2 },
  { what: 'fan', s: null, i: -1 },
]

describe('the view: the grammar', () => {
  it('is an act channel, and every view a tab sends is a payload the room relays', () => {
    assert.ok(ACT_CHANNELS.includes('view'))
    for (const d of EACH) {
      assert.ok(isActData(d), JSON.stringify(d))
      assert.deepEqual(actOf({ ch: 'view', d }), { ch: 'view', d })
    }
  })

  // mutation: view-sync.other-page, view-sync.extra-keys
  it('is read strictly: exactly its keys, every value in range, and a page view only for the page open here', () => {
    for (const d of EACH) assert.deepEqual(viewOf(d, d.pg ?? null), d, JSON.stringify(d))
    // a ground view reads the same whatever page is open
    assert.ok(viewOf({ what: 'fan', s: null, i: -1 }, 'nao'))
    // another page's view is nobody's business here
    assert.equal(viewOf(EACH[0], 'hanoi'), null)
    assert.equal(viewOf(EACH[0], null), null)
    const BAD = [
      null,
      [],
      'media',
      {},
      { what: 'video', pg: 'nao' },
      { what: 'toString' },
      { what: '__proto__' },
      { ...EACH[0], x: 1 },
      { what: 'media', pg: 'nao', n: 0, p: true, t: 1 },
      { ...EACH[0], n: -1 },
      { ...EACH[0], n: 64 },
      { ...EACH[0], n: 0.5 },
      { ...EACH[0], p: 1 },
      { ...EACH[0], t: -0.1 },
      { ...EACH[0], t: 1e9 },
      { ...EACH[0], t: NaN },
      { ...EACH[0], r: 0 },
      { ...EACH[0], r: 17 },
      { ...EACH[0], pg: 'Nao' },
      { ...EACH[0], pg: 'nao#3' },
      { ...EACH[1], i: 3 },
      { ...EACH[1], i: '#drums' },
      { ...EACH[2], s: -1 },
      { ...EACH[2], i: 1000 },
      { ...EACH[3], on: 'resume' },
      { ...EACH[4], s: 'Work' },
      { ...EACH[4], i: -2 },
      { ...EACH[4], pg: 'nao' },
    ]
    for (const d of BAD) assert.equal(viewOf(d, d?.pg ?? 'nao'), null, JSON.stringify(d))
  })
})

describe('the view: media, the drift and the echo', () => {
  it('a media element says whether it plays, its time to a tenth, and its rate', () => {
    assert.deepEqual(mediaState({ paused: false, currentTime: 12.34, playbackRate: 1.5 }), {
      p: true,
      t: 12.3,
      r: 1.5,
    })
    assert.equal(
      mediaState({ paused: false, ended: true, currentTime: 9, playbackRate: 1 }).p,
      false
    )
    assert.equal(mediaState({ paused: true, currentTime: NaN, playbackRate: 1 }).t, 0)
  })

  // mutation: view-sync.drift-zero
  it('a seek is made only past half a second', () => {
    assert.equal(needsSeek(10, 10.4), false)
    assert.equal(needsSeek(10.4, 10), false)
    assert.equal(needsSeek(10, 10.6), true)
    assert.equal(needsSeek(0, 5), true)
  })

  // mutation: view-sync.echo-blind
  it('a state is an echo of the one told while it matches where that one would be by now', () => {
    const told = { p: true, t: 10, r: 1, at: 1000 }
    // two seconds on, a playing video is at twelve
    assert.ok(isEcho({ p: true, t: 12.1, r: 1 }, told, 3000))
    assert.ok(!isEcho({ p: true, t: 10, r: 1 }, told, 3000), 'left behind is news')
    assert.ok(!isEcho({ p: false, t: 12, r: 1 }, told, 3000), 'a pause is news')
    assert.ok(!isEcho({ p: true, t: 12, r: 2 }, told, 3000), 'a rate is news')
    // a paused one stays put, at double speed it moves twice as far
    assert.ok(isEcho({ p: false, t: 10, r: 1 }, { ...told, p: false }, 3000))
    assert.ok(isEcho({ p: true, t: 14, r: 2 }, { ...told, r: 2 }, 3000))
    // and nothing is an echo for long
    assert.ok(!isEcho({ p: true, t: 14, r: 1 }, told, 5000))
    assert.ok(!isEcho({ p: true, t: 10, r: 1 }, undefined, 1000))
  })

  // mutation: view-sync.seek-unthrottled
  it('a scrub is said at most every quarter second, the last position last', () => {
    let clock = 0
    const timers = []
    const out = []
    const push = throttle(250, (v) => out.push(v), {
      now: () => clock,
      later: (f, ms) => timers.push({ f, at: clock + ms }),
    })
    push(1)
    for (const t of [50, 100, 150, 200]) {
      clock = t
      push(t)
    }
    assert.deepEqual(out, [1], 'the first went at once, the rest wait')
    assert.equal(timers.length, 1, 'one wait, not one per seek')
    clock = timers[0].at
    timers[0].f()
    assert.deepEqual(out, [1, 200])
  })
})

// THE BRIDGE, on a stub window and document: what goes out is what the
// window is told (`canvas:act`), what comes in is a listener called by hand.
const win = { on: {}, sent: [] }
const doc = {
  documentElement: { dataset: {}, lang: 'en' },
  on: {},
  addEventListener: (type, fn) => (doc.on[type] ||= []).push(fn),
  createElement: () => {
    const b = {
      on: {},
      removed: false,
      addEventListener: (type, fn) => (b.on[type] = fn),
      remove: () => (b.removed = true),
    }
    return b
  },
}
const state = { page: 'nao', following: null, sheet: null }
const fire = (bag, type, e) => (bag[type] || []).forEach((fn) => fn(e))
const acts = () => win.sent.filter((e) => e.type === 'canvas:act').map((e) => e.detail)
const tick = () => new Promise((r) => setTimeout(r, 0))

before(() => {
  globalThis.document = doc
  globalThis.window = {
    CustomEvent,
    dispatchEvent: (e) => win.sent.push({ type: e.type, detail: e.detail }),
  }
  globalThis.addEventListener = (type, fn) => (win.on[type] ||= []).push(fn)
  globalThis.removeEventListener = (type, fn) => {
    win.on[type] = (win.on[type] || []).filter((f) => f !== fn)
  }
  globalThis.dispatchEvent = globalThis.window.dispatchEvent
  // the bridge's beat is not this test's business
  const every = globalThis.setInterval
  globalThis.setInterval = () => 0
  wireViewSync({
    page: () => state.page,
    sheet: () => state.sheet,
    following: () => state.following,
  })
  globalThis.setInterval = every
})

const listen = (on) => {
  if (on) doc.documentElement.dataset.session = 'session'
  else delete doc.documentElement.dataset.session
}
const peerAct = (d, id = 2) =>
  fire(win.on, 'canvas:peer-act', { detail: { ch: 'view', d, id, color: 'red' } })

describe('the view: the bridge', () => {
  // mutation: view-sync.say-repeats
  it("a page script's view goes out stamped with the page, once, and only while somebody listens", () => {
    win.sent.length = 0
    listen(false)
    assert.equal(
      say({ what: 'tab', i: 'bass' }, 'web-instruments', doc.documentElement.dataset),
      null
    )
    listen(true)
    fire(win.on, 'canvas:view', { detail: { what: 'tab', i: 'bass' } })
    fire(win.on, 'canvas:view', { detail: { what: 'tab', i: 'bass' } })
    fire(win.on, 'canvas:view', { detail: { what: 'tab', i: 'Bass' } })
    fire(win.on, 'canvas:view', { detail: { what: 'media', n: 0, p: true, t: 1, r: 1 } })
    assert.deepEqual(acts(), [{ ch: 'view', d: { what: 'tab', pg: 'nao', i: 'bass' } }])
    listen(false)
  })

  it("a peer's page view is handed to the page without its key, and a view for another page is dropped", () => {
    win.sent.length = 0
    peerAct({ what: 'photo', pg: 'nao', s: 0, i: 3 })
    peerAct({ what: 'photo', pg: 'hanoi', s: 0, i: 3 })
    const told = win.sent.filter((e) => e.type === 'canvas:peer-view').map((e) => e.detail)
    assert.deepEqual(told, [{ what: 'photo', s: 0, i: 3, id: 2, color: 'red' }])
    // and the photograph told is not news to say back
    listen(true)
    fire(win.on, 'canvas:view', { detail: { what: 'photo', s: 0, i: 3 } })
    assert.deepEqual(acts(), [])
    listen(false)
  })

  // mutation: view-sync.applies-while-telling
  it("a peer's ground view is applied, and nothing said while it is", () => {
    win.sent.length = 0
    listen(true)
    const seen = []
    onView('fan', (v, id) => {
      seen.push([v.s, v.i, id])
      // the hooks the applier trips say nothing, not even the state on the
      // way (app.js: the fan spreads, then its card opens)
      assert.equal(shareView({ what: 'fan', s: v.s, i: -1 }), false)
    })
    peerAct({ what: 'fan', s: 'work', i: 2 }, 5)
    assert.deepEqual(seen, [['work', 2, 5]])
    assert.deepEqual(acts(), [])
    // and the state told is not news afterwards either
    assert.equal(shareView({ what: 'fan', s: 'work', i: 2 }), false)
    assert.equal(shareView({ what: 'fan', s: null, i: -1 }), true)
    listen(false)
  })

  // mutation: view-sync.fan-unheld
  it('a fan the one followed spread is held while this tab follows them, and never against its own hand', async () => {
    const opened = []
    onView('fan', (v) => opened.push(v.s))
    state.following = 9
    peerAct({ what: 'fan', s: 'github', i: -1 }, 9)
    assert.deepEqual(opened, ['github'])
    assert.equal(holdsFan('github'), true)
    assert.equal(holdsFan('work'), false)
    // the follower's own click
    fire(win.on, 'click', {})
    assert.equal(holdsFan('github'), false, 'a click of their own folds it')
    await tick()
    assert.equal(holdsFan('github'), true)
    // let go of the one who spread it, or they fold it
    state.following = null
    assert.equal(holdsFan('github'), false)
    state.following = 9
    peerAct({ what: 'fan', s: null, i: -1 }, 9)
    assert.equal(holdsFan('github'), false)
    state.following = null
  })
})

// A media element on the page, driven by hand.
function media(play = () => Promise.resolve()) {
  const el = {
    tagName: 'VIDEO',
    paused: true,
    ended: false,
    currentTime: 0,
    playbackRate: 1,
    muted: false,
    played: 0,
    prompt: null,
    play() {
      el.played++
      const p = play(el)
      p.then(() => (el.paused = false)).catch(() => {})
      return p
    },
    pause() {
      el.paused = true
    },
    after: (b) => (el.prompt = b),
  }
  state.sheet = { querySelectorAll: () => [el], contains: (x) => x === el }
  return el
}
const event = (type, el) => fire(doc.on, type, { type, target: el })

describe('the view: a video plays along', () => {
  it("the visitor's play, pause and seek go out stamped with the page; alone nothing does", () => {
    win.sent.length = 0
    const v = media()
    v.paused = false
    v.currentTime = 3.26
    event('play', v)
    assert.deepEqual(acts(), [], 'nobody listening')
    listen(true)
    event('play', v)
    v.paused = true
    event('pause', v)
    v.currentTime = 40
    event('seeked', v)
    assert.deepEqual(
      acts().map((a) => a.d),
      [
        { what: 'media', pg: 'nao', n: 0, p: true, t: 3.3, r: 1 },
        { what: 'media', pg: 'nao', n: 0, p: false, t: 3.3, r: 1 },
        { what: 'media', pg: 'nao', n: 0, p: false, t: 40, r: 1 },
      ]
    )
    listen(false)
  })

  // mutation: view-sync.echo-blind
  it("a peer's playback is applied (rate, a seek past the drift, play) and the events it causes are not said back", async () => {
    win.sent.length = 0
    listen(true)
    const v = media()
    peerAct({ what: 'media', pg: 'nao', n: 0, p: true, t: 5, r: 1.5 })
    assert.equal(v.playbackRate, 1.5)
    assert.equal(v.currentTime, 5)
    assert.equal(v.played, 1)
    await tick()
    event('ratechange', v)
    event('seeked', v)
    event('play', v)
    assert.deepEqual(acts(), [], 'the peer heard its own play back')
    // a small difference is not worth a seek
    v.currentTime = 5.3
    peerAct({ what: 'media', pg: 'nao', n: 0, p: true, t: 5.6, r: 1.5 })
    assert.equal(v.currentTime, 5.3)
    // another page's video is not this one
    peerAct({ what: 'media', pg: 'hanoi', n: 0, p: false, t: 0, r: 1 })
    assert.equal(v.paused, false)
    listen(false)
  })

  // mutation: view-sync.silent-mute
  it('a play the browser refuses plays along muted and says so, and the tap turns the sound on', async () => {
    let refuse = true
    const v = media((el) => {
      if (refuse && !el.muted) {
        refuse = false
        const e = new Error('no gesture')
        e.name = 'NotAllowedError'
        return Promise.reject(e)
      }
      return Promise.resolve()
    })
    peerAct({ what: 'media', pg: 'nao', n: 0, p: true, t: 0, r: 1 })
    for (let k = 0; k < 4; k++) await tick()
    assert.equal(v.muted, true, 'it plays along muted')
    assert.ok(v.prompt, 'and says so beside the video')
    assert.equal(v.prompt.textContent, 'playing along, tap to hear')
    assert.equal(v.prompt.className, 'k-btn view-along')
    v.prompt.on.click()
    assert.equal(v.muted, false, 'the tap is the sound')
    assert.equal(v.prompt.removed, true)
  })
})

// THE PHOTO STRIP (js/photoset.js), run on a stub DOM: five photographs, a
// scroller that records what it is told, an observer the test drives the
// way a swipe would, and the kit's walker, whose commit is a step.
function loadStrip({ session = false } = {}) {
  let walker = null
  const on = {}
  const sent = []
  const timers = []
  const scrolls = []
  let io = null
  const listeners = {}
  const node = (extra = {}) => ({
    attrs: {},
    on: {},
    setAttribute(k, v) {
      this.attrs[k] = v
    },
    hasAttribute(k) {
      return k in this.attrs
    },
    addEventListener(type, fn) {
      this.on[type] = fn
    },
    ...extra,
  })
  const track = node({
    scrollLeft: 0,
    getBoundingClientRect: () => ({ left: 0 }),
    scrollTo(o) {
      scrolls.push(o)
      track.scrollLeft = o.left
    },
  })
  const slides = [0, 1, 2, 3, 4].map((i) =>
    node({
      getBoundingClientRect: () => ({ left: i * 100 - track.scrollLeft }),
      querySelector: () => ({ loading: 'lazy' }),
    })
  )
  const readout = { textContent: '1' }
  const bar = node()
  const root = node({
    isConnected: true,
    querySelector: (q) =>
      q === '.photoset-track'
        ? track
        : q === '[data-photoset-at]'
          ? readout
          : q === '.photoset-bar .k-scroll'
            ? bar
            : null,
    querySelectorAll: () => slides,
  })
  const document = {
    documentElement: { dataset: session ? { session: 'session' } : {} },
    querySelectorAll: () => [root],
  }
  const window = {
    matchMedia: () => ({ matches: false }),
    CustomEvent: class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    },
    dispatchEvent: (e) => sent.push(e),
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: (type) => delete listeners[type],
  }
  vm.runInNewContext(PHOTOSET, {
    window,
    document,
    IntersectionObserver: class {
      constructor(cb) {
        io = cb
      }
      observe() {}
    },
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => timers.splice(0),
    wireScroll: (el, opts) => {
      walker = { el, ...opts }
      return { set: () => {} }
    },
    Number,
    Array,
    String,
    Math,
  })
  const settle = () => timers.splice(0).forEach((f) => f())
  const said = () => JSON.parse(JSON.stringify(sent.map((e) => [e.type, e.detail])))
  return {
    root,
    track,
    slides,
    readout,
    scrolls,
    sent,
    said,
    settle,
    on: listeners,
    swipe: (i) => io([{ isIntersecting: true, target: slides[i] }]),
    step: (i) => walker.onCommit(i),
  }
}

describe('the view: a photograph', () => {
  // mutation: view-sync.photo-unsaid
  it('in a session the photograph a strip settles on goes out, once for a fling; alone nothing does', () => {
    const s = loadStrip({ session: true })
    s.step(1)
    s.settle()
    // a fling through three photographs is the one it lands on
    s.swipe(2)
    s.swipe(3)
    s.swipe(4)
    s.settle()
    assert.deepEqual(s.said(), [
      ['canvas:view', { what: 'photo', s: 0, i: 1 }],
      ['canvas:view', { what: 'photo', s: 0, i: 4 }],
    ])
    const alone = loadStrip()
    alone.swipe(2)
    alone.settle()
    assert.deepEqual(alone.sent, [])
    assert.equal(alone.readout.textContent, '3')
  })

  // mutation: view-sync.photo-echoes, view-sync.photo-glides
  it("a peer's photograph is jumped to, never glided, and never said back; one the strip lacks is dropped", () => {
    const s = loadStrip({ session: true })
    s.on['canvas:peer-view']({ detail: { what: 'photo', s: 0, i: 3, id: 2 } })
    s.settle()
    assert.equal(s.readout.textContent, '4')
    assert.equal(s.scrolls.at(-1).behavior, 'auto')
    assert.deepEqual(s.sent, [], 'a peer photograph went back out')
    for (const bad of [
      { what: 'photo', s: 0, i: 5 },
      { what: 'photo', s: 1, i: 1 },
      { what: 'photo', s: 0, i: 1.5 },
      { what: 'tab', s: 0, i: 1 },
    ])
      s.on['canvas:peer-view']({ detail: bad })
    assert.equal(s.readout.textContent, '4')
    // asked again, it says the photograph it shows
    s.on['canvas:view-again']()
    assert.deepEqual(s.said(), [['canvas:view', { what: 'photo', s: 0, i: 3 }]])
  })
})

// THE VOICE (js/page-reader.js), wired on a stub page of two paragraphs, so
// the reading order is the title and four sentences.
function loadReader({ session = false } = {}) {
  const spoken = []
  const scrolled = []
  const button = () => {
    const b = {
      hidden: false,
      innerHTML: '',
      attrs: {},
      on: {},
      setAttribute: (k, v) => (b.attrs[k] = v),
      getAttribute: (k) => b.attrs[k] ?? null,
      addEventListener: (type, fn) => (b.on[type] = fn),
    }
    return b
  }
  const btns = { ground: button(), plain: button(), listen: button(), stop: button() }
  const box = { hidden: true }
  const group = {
    isConnected: true,
    querySelector: (q) => (q === '.reader-listen' ? box : btns[/data-reader="(\w+)"/.exec(q)[1]]),
  }
  const para = (text) => ({
    text,
    closest: () => null,
    parentElement: null,
    matches: () => false,
    querySelector: () => null,
  })
  const prose = { querySelectorAll: () => [para('One. Two.'), para('Three. Four.')] }
  doc.documentElement.dataset = session ? { session: 'session' } : {}
  doc.createTreeWalker = (el) => {
    const nodes = [{ data: el.text, parentElement: { closest: () => null } }]
    return { nextNode: () => nodes.shift() || null }
  }
  // the words sit low on the screen, so a reading of the visitor's own
  // scrolls them up and a peer's must not
  doc.createRange = () => ({
    setStart() {},
    setEnd() {},
    getBoundingClientRect: () => ({ top: 850, bottom: 870, height: 20 }),
  })
  doc.hidden = false
  doc.removeEventListener = () => {}
  globalThis.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 }
  globalThis.innerHeight = 900
  globalThis.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  globalThis.localStorage = { getItem: () => null, setItem() {} }
  globalThis.CSS = { highlights: new Map() }
  globalThis.Highlight = class {
    constructor(r) {
      this.r = r
    }
  }
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text
    }
  }
  globalThis.speechSynthesis = {
    speak: (u) => spoken.push(u),
    getVoices: () => [],
    cancel() {},
    pause() {},
    resume() {},
  }
  const before = win.sent.length
  const handle = wireReader(group, {
    shell: { dataset: {}, classList: { toggle() {} } },
    title: 'Title',
    prose,
    scroller: () => ({ scrollBy: (o) => scrolled.push(o) }),
    reduced: true,
  })
  const views = () =>
    win.sent
      .slice(before)
      .filter((e) => e.type === 'canvas:view')
      .map((e) => e.detail)
  const peer = (detail) => fire(win.on, 'canvas:peer-view', { detail })
  return { btns, spoken, scrolled, views, peer, handle }
}

describe('the view: reading along', () => {
  // mutation: view-sync.listen-unsaid
  it('in a session Listen says it reads, each sentence it reaches, a pause and a stop; alone nothing', () => {
    const r = loadReader({ session: true })
    r.btns.listen.on.click()
    r.spoken.at(-1).onend()
    r.btns.listen.on.click()
    r.btns.stop.on.click()
    assert.deepEqual(r.views(), [
      { what: 'listen', on: 'play', i: 0 },
      { what: 'listen', on: 'play', i: 1 },
      { what: 'listen', on: 'pause', i: 1 },
      { what: 'listen', on: 'stop', i: 1 },
    ])
    r.handle.stop()
    const alone = loadReader()
    alone.btns.listen.on.click()
    alone.spoken.at(-1).onend()
    assert.deepEqual(alone.views(), [])
    assert.equal(alone.spoken.length, 2, 'and still reads')
    alone.handle.stop()
  })

  // mutation: view-sync.listen-echoes, view-sync.listen-scrolls-peer
  it("a peer's reading is read along from its sentence, lit but never scrolled, and never said back", () => {
    const r = loadReader({ session: true })
    r.peer({ what: 'listen', on: 'play', i: 3, id: 2 })
    assert.equal(r.spoken.at(-1).text, 'Three.')
    r.spoken.at(-1).onstart()
    assert.ok(CSS.highlights.has('tts'), 'the sentence is lit')
    assert.deepEqual(r.scrolled, [], "a peer's reading scrolled this page")
    assert.deepEqual(r.views(), [], 'a peer reading went back out')
    // within a sentence of the room is reading along, further is a jump
    r.peer({ what: 'listen', on: 'play', i: 4, id: 2 })
    assert.equal(r.spoken.length, 1)
    r.peer({ what: 'listen', on: 'play', i: 1, id: 2 })
    assert.equal(r.spoken.at(-1).text, 'One.')
    r.peer({ what: 'listen', on: 'stop', i: 1, id: 2 })
    assert.equal(r.btns.stop.hidden, true)
    // and a reading of the visitor's own keeps its words in view (past the
    // title, which has no words on the page to keep)
    r.btns.listen.on.click()
    r.spoken.at(-1).onend()
    r.spoken.at(-1).onstart()
    assert.equal(r.scrolled.length, 1)
    r.handle.stop()
  })

  // mutation: view-sync.listen-refused-silent
  it('a voice the browser refuses says so on Listen, keeps the sentence lit, and the tap starts where the room is', () => {
    const r = loadReader({ session: true })
    r.peer({ what: 'listen', on: 'play', i: 1, id: 2 })
    r.spoken.at(-1).onerror({ error: 'not-allowed' })
    assert.match(r.btns.listen.innerHTML, /Reading along, tap to hear/)
    CSS.highlights.clear()
    r.peer({ what: 'listen', on: 'play', i: 2, id: 2 })
    assert.equal(r.spoken.length, 1, 'no second try without the tap')
    assert.ok(CSS.highlights.has('tts'), 'the sentence the room is on is lit')
    r.btns.listen.on.click()
    assert.equal(r.spoken.at(-1).text, 'Two.')
    assert.match(r.btns.listen.innerHTML, /Pause/)
    r.handle.stop()
  })
})

// A follower is taken off a page and put straight back on it whenever the
// one followed blinks off the page for a frame. The close's skin comes off
// only once the page has travelled home, so without this the late close
// shut the chrome of the page that had just reopened: painted, scrolled,
// playing, and invisible (found by the two-browser proof).
describe('the view: a page reopened', () => {
  // mutation: view-sync.skin-off-reopened
  it('a page opened again while the last close travelled home keeps its chrome', () => {
    const i = APP.indexOf('function paintSheet(slug){')
    const body = APP.slice(i, APP.indexOf('\n}\n', i))
    const settle = body.slice(body.indexOf('const settle = ()=>{'))
    assert.match(
      settle,
      /^const settle = \(\)=>\{\n(\s*\/\/.*\n)*\s*if\(curSheet\) return;\n\s*\$\('#modal'\)\.classList\.remove\('open'/
    )
  })
})
