// test/shared-highlight.test.js
// SHARED HIGHLIGHTING: the words a reader selects on a page are drawn for
// everyone reading that page, in the reader's hue, and nobody else.
//
// Four claims, one describe each:
//   - the anchor is the TEXT, not the layout: a selection taken at one width
//     names the same words at another, and a page whose words differ at
//     the anchor draws nothing rather than the wrong words (anchor.js)
//   - the frame is small and closed: a slug, three numbers and two short
//     quotes, or a clear, and anything else is dropped whole
//     (primitives/presence/presence-protocol.js parseSel)
//   - the room says a selection to the readers of its page only, at most
//     once a snapshot with the latest state, never on a page its sender is
//     not reading, and never for a spectator (primitives/presence/presence-room.js)
//   - the page is never touched: the highlight is a Range registered with
//     the Custom Highlight API, and no element is ever added to draw it
//     (canvas/highlight.js)
import './env.js' // first: no boot refresh over the network

import { describe, it, before, after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  QUOTE,
  SEL_OFF_MAX,
  offsetOf,
  rangeOfSel,
  selOf,
  splitAt,
} from '../primitives/presence/anchor.js'
import {
  PARTICIPANT_CAP,
  SEL_OFF_MAX as WIRE_OFF_MAX,
  SEL_QUOTE,
  parseFrame,
  parseSel,
} from '../primitives/presence/presence-protocol.js'
import { createRoom, presenceRoom } from '../primitives/presence/presence-room.js'
import { build } from '../src/server.js'

const ROOT = join(import.meta.dirname, '..')
const HIGHLIGHT = readFileSync(join(ROOT, 'src/static/canvas/highlight.js'), 'utf8')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')

// A page as two readers hold it. The TEXT of each block is the page's and
// the same on every screen; what differs is how the DOM happens to cut it
// into text nodes (an inline link, a code span, an emphasis) and how the
// browser wraps it, which is nothing the anchor reads. The phone's third
// paragraph is cut in four places and the desktop's in one.
const H1 = 'How the badge printer learned to talk'
const META = 'case study, 2025'
const P1 = 'The front desk printed every visitor badge by hand, one at a time.'
const P2 =
  'A vendor API with no documentation stood between them and the queue, so the move was to read the traffic and port the signing flow.'
const P3 = 'It has not paged anybody since.'
const texts = [H1, META, P1, P2, P3]
const phoneNodes = [
  [H1],
  [META],
  [P1],
  [
    'A vendor ',
    'API',
    ' with no documentation stood between them and the queue, so the move was to ',
    'read the traffic',
    ' and port the signing flow.',
  ],
  [P3],
]
const desktopNodes = [
  [H1],
  [META],
  [P1],
  [
    'A vendor API with no documentation stood between them and the queue, so the move was to read the traffic',
    ' and port the signing flow.',
  ],
  [P3],
]
const lens = (nodes) => nodes.map((t) => t.length)
// a point in the DOM (a text node and an offset into it) as the anchor
// reads it: a block and a character count into that block's text
const pointOn = (nodesOf, i, n, o) => ({ i, o: offsetOf(lens(nodesOf[i]), n, o) })
// and back: the words a reader would see highlighted, cut from ITS nodes
function wordsOn(nodesOf, hit) {
  const s = splitAt(lens(nodesOf[hit.i]), hit.a)
  const e = splitAt(lens(nodesOf[hit.j]), hit.b)
  const flat = (i) => nodesOf[i].join('')
  const start = offsetOf(lens(nodesOf[hit.i]), s.n, s.o)
  const end = offsetOf(lens(nodesOf[hit.j]), e.n, e.o)
  if (hit.i === hit.j) return flat(hit.i).slice(start, end)
  return [
    flat(hit.i).slice(start),
    ...nodesOf.slice(hit.i + 1, hit.j).map((n) => n.join('')),
    flat(hit.j).slice(0, end),
  ].join('|')
}

describe('shared highlighting: the anchor is the text, the same at every width', () => {
  // mutation: highlight.anchor-is-the-node
  it('a selection made on the phone names the same words on the desktop', () => {
    // the phone reader drags from the start of "read" (the fourth node of
    // the paragraph, offset 0) to the end of "traffic" (the same node, 16)
    const s = pointOn(phoneNodes, 3, 3, 0)
    const e = pointOn(phoneNodes, 3, 3, 16)
    const sel = selOf('badges', texts, s, e)
    assert.deepEqual(sel, { at: 'badges#3', a: 88, j: 3, b: 104, q: 'read the', z: ' traffic' })
    // the desktop reader's page cuts that paragraph somewhere else entirely
    const hit = rangeOfSel(sel, 'badges', texts)
    assert.deepEqual(hit, { i: 3, a: 88, j: 3, b: 104 })
    assert.equal(wordsOn(desktopNodes, hit), 'read the traffic')
    assert.equal(wordsOn(phoneNodes, hit), 'read the traffic')
    // and the way round: a desktop selection read on the phone
    const d = selOf('badges', texts, pointOn(desktopNodes, 3, 0, 2), pointOn(desktopNodes, 3, 0, 5))
    assert.equal(wordsOn(phoneNodes, rangeOfSel(d, 'badges', texts)), 'vendor'.slice(0, 3))
  })

  // mutation: highlight.end-not-pulled-in
  it('a selection across blocks keeps both ends, and a triple-click end steps back onto the words', () => {
    const sel = selOf('badges', texts, { i: 2, o: 4 }, { i: 3, o: 8 })
    assert.equal(wordsOn(desktopNodes, rangeOfSel(sel, 'badges', texts)), `${P1.slice(4)}|A vendor`)
    // a triple-click on the first paragraph ends at the very start of the
    // next block, which holds none of it: the end is the paragraph's close
    const triple = selOf('badges', texts, { i: 2, o: 0 }, { i: 3, o: 0 })
    assert.equal(triple.j, 2)
    assert.equal(triple.b, P1.length)
    assert.equal(wordsOn(phoneNodes, rangeOfSel(triple, 'badges', texts)), P1)
    // nothing selected is nothing
    assert.equal(selOf('badges', texts, { i: 2, o: 5 }, { i: 2, o: 5 }), null)
    assert.equal(selOf('badges', texts, null, { i: 2, o: 5 }), null)
  })

  // mutation: highlight.no-quote-check, highlight.head-quote-only
  it('a page whose words differ at the anchor draws nothing, never the wrong words', () => {
    const sel = selOf('badges', texts, { i: 3, o: 88 }, { i: 3, o: 104 })
    // the entry was edited: a word went in before the selection, so the
    // offsets now land four characters early
    const edited = [...texts]
    edited[3] = P2.replace('vendor API', 'vendor REST API')
    assert.equal(rangeOfSel(sel, 'badges', edited), null)
    // a block that renders live text of its own (a readout) at the anchor
    const live = [...texts]
    live[3] = P2.replace('traffic', 'packets')
    assert.equal(rangeOfSel(sel, 'badges', live), null, 'the tail quote is checked too')
    // another page, a block this page does not have, an offset past its end
    assert.equal(rangeOfSel(sel, 'nao', texts), null)
    assert.equal(rangeOfSel({ ...sel, j: 9 }, 'badges', texts), null)
    assert.equal(rangeOfSel({ ...sel, b: P2.length + 1 }, 'badges', texts), null)
    assert.equal(rangeOfSel(null, 'badges', texts), null)
    // and the untouched page still draws it
    assert.ok(rangeOfSel(sel, 'badges', texts))
  })

  // mutation: highlight.head-runs-past
  it('the quote is a few characters and the tail never reaches back past the head', () => {
    const sel = selOf('badges', texts, { i: 4, o: 3 }, { i: 4, o: 6 })
    assert.equal(sel.q, 'has', 'the head quote ran past the end of the selection')
    assert.equal(sel.z, 'has')
    const long = selOf('badges', texts, { i: 3, o: 0 }, { i: 3, o: P2.length })
    assert.equal(long.q.length, QUOTE)
    assert.equal(long.z.length, QUOTE)
  })
})

describe('shared highlighting: the frame is small and closed', () => {
  it('the client and the server read the same bounds', () => {
    assert.equal(QUOTE, SEL_QUOTE)
    assert.equal(SEL_OFF_MAX, WIRE_OFF_MAX)
  })

  // mutation: highlight.quote-unbounded
  it('a selection is a slug, three numbers and two short quotes, or a clear, and nothing else', () => {
    const good = { type: 'sel', at: 'nao#3', a: 4, j: 5, b: 9, q: 'the wor', z: 'ds' }
    assert.deepEqual(parseSel(JSON.stringify(good)), {
      sel: { at: 'nao#3', a: 4, j: 5, b: 9, q: 'the wor', z: 'ds' },
    })
    // a field of its own goes nowhere: the frame is its six fields
    const extra = parseFrame(JSON.stringify({ ...good, color: 'red', id: 7, html: '<mark>' }))
    assert.deepEqual(Object.keys(extra.sel).sort(), ['a', 'at', 'b', 'j', 'q', 'z'])
    assert.deepEqual(parseFrame(JSON.stringify({ type: 'sel', at: null })), {
      kind: 'sel',
      sel: null,
    })
    for (const bad of [
      { at: 'NAO#3' },
      { at: 'nao' },
      { a: -1 },
      { a: 1.5 },
      { b: SEL_OFF_MAX },
      { j: 2 }, // ends before it starts
      { j: 3, a: 9, b: 9 }, // one block, nothing in it
      { j: 1000 },
      { q: '' },
      { q: 'x'.repeat(SEL_QUOTE + 1) },
      { z: 42 },
    ])
      assert.equal(parseSel(JSON.stringify({ ...good, ...bad })), null, JSON.stringify(bad))
    // and a frame this size fits the socket's inbound cap with room over
    const worst = JSON.stringify({
      ...good,
      at: `${'a'.repeat(48)}#999`,
      a: SEL_OFF_MAX - 1,
      j: 999,
      b: SEL_OFF_MAX - 1,
      q: '\u0001'.repeat(8),
      z: '\u0001'.repeat(8),
    })
    assert.ok(worst.length < 512, `${worst.length} bytes`)
  })
})

// A socket that records what it is sent (test/presence.test.js has the same)
function fake() {
  const s = {
    OPEN: 1,
    readyState: 1,
    sent: [],
    send: (text) => s.sent.push(text),
    ping: () => {},
    terminate: () => {
      s.readyState = 3
    },
    typed: (type) => s.sent.map((t) => JSON.parse(t)).filter((m) => m.type === type),
  }
  return s
}
const tick = () => new Promise((r) => setTimeout(r, 60))
const onPage = (at) => ({ fx: 0.1, fy: 0.1, k: null, d: false, at })
const selsOf = (s) => s.typed('sels').flatMap((f) => f.s)
const SEL = { at: 'nao#3', a: 4, j: 3, b: 9, q: 'the w', z: 'words' }

describe('shared highlighting: the room says a selection to its page, once a snapshot', () => {
  // mutation: highlight.sels-to-everyone
  it('goes to the readers of the page it is on and to nobody else', async () => {
    const room = createRoom()
    const [a, b, c] = [fake(), fake(), fake()]
    for (const s of [a, b, c]) room.join(s)
    room.move(a, onPage('nao#1'))
    room.move(b, onPage('nao#7'))
    room.move(c, onPage('red-blue#0'))
    await tick()
    assert.equal(room.select(a, SEL), true)
    await tick()
    assert.deepEqual(selsOf(b), [[1, 'nao#3', 4, 3, 9, 'the w', 'words']])
    assert.deepEqual(selsOf(c), [], 'a reader of another page was sent the selection')
    // collapsing is a clear, to the same page
    room.select(a, null)
    await tick()
    assert.deepEqual(selsOf(b).at(-1), [1, 0])
    assert.deepEqual(selsOf(c), [])
    room.stop()
  })

  // mutation: highlight.sel-unsnapped
  it('a burst costs one entry a snapshot, and the entry is the last state', async () => {
    const room = createRoom()
    const [a, b] = [fake(), fake()]
    room.join(a)
    room.join(b)
    room.move(a, onPage('nao#1'))
    room.move(b, onPage('nao#1'))
    await tick()
    for (let n = 0; n < 20; n++) room.select(a, { ...SEL, b: 10 + n, z: 'x' })
    await tick()
    assert.equal(
      b.typed('sels').length,
      1,
      'twenty selections in a tick went out as more than one frame'
    )
    assert.deepEqual(selsOf(b), [[1, 'nao#3', 4, 3, 29, 'the w', 'x']])
    // the same selection again is not news
    assert.equal(room.select(a, { ...SEL, b: 29, z: 'x' }), false)
    room.stop()
  })

  // mutation: highlight.sel-off-page
  it('a selection on a page its sender is not reading is dropped, and a place change drops it', async () => {
    const room = createRoom()
    const [a, b] = [fake(), fake()]
    room.join(a)
    room.join(b)
    room.move(a, onPage('red-blue#0'))
    room.move(b, onPage('nao#1'))
    await tick()
    assert.equal(room.select(a, SEL), false, 'a painted words on a page it is not on')
    room.move(a, onPage('nao#2'))
    room.select(a, SEL)
    await tick()
    assert.equal(selsOf(b).length, 1)
    // a leaves the page: its selection is not carried, and a reader who
    // arrives on nao after that is told of nothing
    room.move(a, { fx: 0.5, fy: 0.5, k: null, d: false, at: null })
    const late = fake()
    room.join(late)
    room.move(late, onPage('nao#0'))
    await tick()
    assert.deepEqual(selsOf(late), [])
    room.stop()
  })

  it('a reader arriving on a page is told what is already selected on it', async () => {
    const room = createRoom()
    const [a, b] = [fake(), fake()]
    room.join(a)
    room.join(b)
    room.move(a, onPage('nao#1'))
    room.select(a, SEL)
    await tick()
    room.move(b, onPage('nao#0'))
    assert.deepEqual(selsOf(b), [[1, 'nao#3', 4, 3, 9, 'the w', 'words']])
    room.stop()
  })
})

describe('shared highlighting over the real socket: spectators see, never send', () => {
  let app
  let url
  before(async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('offline')
    })
    app = await build({ logger: false })
    await app.listen({ port: 0, host: '127.0.0.1' })
    url = `ws://127.0.0.1:${app.server.address().port}/ws/cursors`
  })
  after(async () => {
    await app.close()
    mock.restoreAll()
  })
  const opened = []
  const fakes = []
  afterEach(() => {
    for (const ws of opened.splice(0)) ws.close()
    for (const s of fakes.splice(0)) presenceRoom.leave(s)
  })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  function client() {
    const ws = new WebSocket(url)
    opened.push(ws)
    const seen = []
    ws.addEventListener('message', (ev) => seen.push(JSON.parse(ev.data)))
    const say = (m) => ws.send(JSON.stringify(m))
    return {
      seen,
      say,
      open: new Promise((res, rej) => {
        ws.addEventListener('open', res)
        ws.addEventListener('error', rej)
      }),
      sels: () => seen.filter((m) => m.type === 'sels').flatMap((m) => m.s),
      async welcome() {
        for (let n = 0; n < 250; n++) {
          const w = seen.find((m) => m.type === 'welcome')
          if (w) return w
          await sleep(20)
        }
        throw new Error('no welcome')
      },
    }
  }

  // mutation: highlight.spectator-sends
  it('a participant selection reaches a spectator on the page, and a spectator selection reaches nobody', async () => {
    const a = client()
    await a.open
    const hello = await a.welcome()
    a.say({ type: 'move', fx: 0.1, fy: 0.1, at: 'nao#1' })
    // fill the room so the next socket spectates
    while (presenceRoom.participants < PARTICIPANT_CAP) {
      const s = fake()
      presenceRoom.join(s)
      fakes.push(s)
    }
    const spec = client()
    await spec.open
    assert.equal((await spec.welcome()).spectator, true, 'the room was not full')
    spec.say({ type: 'move', fx: 0.2, fy: 0.2, at: 'nao#4' })
    await sleep(80)
    a.say({ type: 'sel', ...SEL })
    for (let n = 0; n < 50 && !spec.sels().length; n++) await sleep(20)
    assert.deepEqual(spec.sels(), [[hello.id, 'nao#3', 4, 3, 9, 'the w', 'words']])
    // the spectator selects: nothing goes anywhere
    spec.say({ type: 'sel', ...SEL, q: 'the q' })
    await sleep(150)
    assert.deepEqual(
      a.sels(),
      [[hello.id, 'nao#3', 4, 3, 9, 'the w', 'words']],
      'the spectator was heard'
    )
  })
})

describe('shared highlighting never touches the page', () => {
  // Every way a script adds, splits, wraps or rewrites a node. A highlight
  // drawn with any of them is a highlight that moves the reader's own
  // selection, breaks a script holding a node, and puts somebody else's
  // markup in the copy.
  const MUTATORS = [
    'createElement',
    'appendChild',
    'insertBefore',
    'replaceChild',
    'removeChild',
    'innerHTML',
    'outerHTML',
    'insertAdjacent',
    'surroundContents',
    'extractContents',
    'deleteContents',
    'insertNode',
    'splitText',
    'normalize(',
    'replaceWith',
    'execCommand',
    '<mark',
    '<span',
    '.data =',
    'textContent =',
    '.append(',
    '.prepend(',
    '.before(',
    '.after(',
  ]
  const code = (src) => src.replace(/\/\/.*$/gm, '')
  const paintSels = APP.slice(
    APP.indexOf('function paintSels(){'),
    APP.indexOf('\n}', APP.indexOf('function paintSels(){'))
  )

  // mutation: highlight.mark-fallback, highlight.app-wraps
  it('the painter and its caller write nothing into the DOM', () => {
    assert.ok(paintSels.length > 30, 'app.js lost paintSels')
    for (const m of MUTATORS) {
      assert.ok(!code(HIGHLIGHT).includes(m), `highlight.js uses ${m}`)
      assert.ok(!code(paintSels).includes(m), `app.js paintSels uses ${m}`)
    }
  })

  // mutation: highlight.not-the-api
  it('the highlight is a Range in CSS.highlights, and without the API it is nothing', () => {
    assert.match(code(HIGHLIGHT), /CSS\.highlights\.set\(/)
    assert.match(code(HIGHLIGHT), /new Highlight\(/)
    assert.match(
      code(HIGHLIGHT),
      /if \(!able\) return \{ paint: \(\) => \{\}, clear: \(\) => \{\}, ids: \(\) => \[\] \}/
    )
  })
})
