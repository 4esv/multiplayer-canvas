// THE READER'S SETTINGS: what a page that is read (a case study now, the
// articles and reports after it) offers the one reading it. The author:
// "the platform I can later do articles/blogs/reports from that has all the
// bells and whistles of a page", and "make sure anyone can read it".
//
// Three things, one small group under the page's meta line, each a kit
// control with its word on it:
//
//   Dark Mode    the page's ground inverted: ink under bright words. The one
//                stated exemption from ONE GROUND (BIBLE.md section 1): the
//                page shell only, never the canvas, chosen by the reader and
//                starting from what their OS says (css/page-reader.css).
//   Plain Type   the prose in the reader's own system sans at a size meant
//                for long reading, for anyone the dot-matrix face is hard on.
//                The title stays in the pixel face: it is the page's mark.
//   Listen       the page read aloud by the browser's own voice (Web Speech,
//                no library, nothing leaves the device): the title, then the
//                prose in order, a figure by what it shows, never a code
//                block or the footnotes. The sentence being read is lit with
//                the Custom Highlight API, the way a peer's selection is
//                (canvas/highlight.js), so the page is never rewritten, and
//                kept in the middle third of the screen.
//
// Both choices are this reader's alone and live in this browser (BIBLE.md
// tenet IV: for everyone, or for you, never both). localStorage can throw
// (a private window, blocked site data), so every read and write is wrapped
// and the page works the same without it. They are accessibility, not
// content, so they stay the reader's own in a session and under a follow
// too.
//
// LISTENING IS SHARED (2026-09-26), the way a video is: in a session, and
// from the one followed to the tabs following them, starting, pausing and
// stopping go out as an `canvas:view` with the sentence being read, and a
// peer's is read along (canvas/view-sync.js stamps and checks the page).
// The reading order is a pure function of the page, so a sentence's index
// is the same sentence on every screen. A browser may refuse to speak for a
// page the visitor has not touched; then Listen says so ("Reading along,
// tap to hear") and the sentence is still lit, and the tap starts the voice
// at the sentence the room is on. A reading a peer started lights its
// sentence but never scrolls this reader's page: the scroll is theirs.
//
// Two halves in one file, as kit-scroll.js does it: the MARKUP (a pure
// string, so the server SSRs a direct load with the group the canvas paints
// on a click, and node imports this file) and the BEHAVIOUR (DOM only,
// never run at import).

// the pixel marks, on the 11 grid every kit glyph is drawn on
const PLAY_MARK = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M3 1h1v1h-1zM3 2h2v1h-2zM3 3h3v1h-3zM3 4h4v1h-4zM3 5h5v1h-5zM3 6h4v1h-4zM3 7h3v1h-3zM3 8h2v1h-2zM3 9h1v1h-1z"/></svg>`
const PAUSE_MARK = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 1h2v9h-2zM7 1h2v9h-2z"/></svg>`
const STOP_MARK = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 2h7v7h-7z"/></svg>`

/**
 * The group, as markup. Listen ships hidden: it is shown only where the
 * browser can speak (wireReader), so a reader without the API never sees a
 * button that does nothing.
 * @returns {string}
 */
export function readerMarkup() {
  const sw = (key, word) =>
    `<button type="button" class="k-switch" role="switch" aria-checked="false" data-reader="${key}"><span class="k-lever"></span>${word}</button>`
  return (
    `<div class="reader" role="group" aria-label="Reader settings">` +
    sw('ground', 'Dark Mode') +
    sw('plain', 'Plain Type') +
    `<span class="reader-listen" hidden>` +
    `<button type="button" class="k-btn" data-reader="listen">${PLAY_MARK}<span>Listen</span></button>` +
    `<button type="button" class="k-btn" data-reader="stop" hidden>${STOP_MARK}<span>Stop</span></button>` +
    `</span></div>`
  )
}

// ---- the choices, per reader ----
const KEY = 'canvas:reader'
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
function save(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* a private window: the choice lasts as long as the page */
  }
}
const osDark = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

/**
 * Put this reader's choices on the page shell, or take them off it. The
 * shell is #modal, and a stated choice is an attribute on it; no choice
 * leaves the ground to the OS (css/page-reader.css answers the query).
 * Called on every page change, so a page that is not read carries nothing.
 * @param {HTMLElement} shell
 * @param {boolean} reading
 */
export function applyReader(shell, reading) {
  shell.classList.toggle('reading', reading)
  const v = reading ? load() : {}
  if (v.ground === 'dark' || v.ground === 'light') shell.dataset.ground = v.ground
  else delete shell.dataset.ground
  if (v.plain) shell.dataset.type = 'plain'
  else delete shell.dataset.type
}

// ---- listening ----
// What is read, in order: the prose's leaf blocks and its figures. A
// figure is read by what it shows (its drawing's name, then its caption and
// note) and the rest of it is skipped; a code block, the footnotes and a
// footnote's marker are never read aloud.
const LEAF = 'p, h2, h3, h4, h5, h6, li, dt, dd, blockquote, figcaption, th, td'
const FIGURE = 'figure, .figure'
const NEVER = 'pre, .footnotes, sup.footnote-ref, .reader, .page-foot'

function textsOf(block) {
  const nodes = []
  const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (t) =>
      t.parentElement.closest(NEVER) || t.parentElement.closest('[aria-hidden="true"]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  for (let t = walk.nextNode(); t; t = walk.nextNode()) nodes.push(t)
  return nodes
}

// the sentences of a run of text, as [start, end) offsets, whitespace trimmed
function sentencesOf(text) {
  const out = []
  const push = (a, b) => {
    while (a < b && /\s/.test(text[a])) a++
    while (b > a && /\s/.test(text[b - 1])) b--
    if (b > a) out.push([a, b])
  }
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    for (const s of seg.segment(text)) push(s.index, s.index + s.segment.length)
  } else {
    // a browser without the segmenter (watchOS): split after a stop
    for (const m of text.matchAll(/[^.!?]+(?:[.!?]+["')\]]*|$)/g))
      push(m.index, m.index + m[0].length)
  }
  return out
}

// a [start, end) of a block's text as a DOM Range over its own text nodes
function rangeOf(nodes, a, b) {
  const r = document.createRange()
  let at = 0
  let started = false
  for (const t of nodes) {
    const len = t.data.length
    if (!started && a <= at + len) {
      r.setStart(t, a - at)
      started = true
    }
    if (started && b <= at + len) {
      r.setEnd(t, b - at)
      return r
    }
    at += len
  }
  return started ? r : null
}

/**
 * The page as a list of things to say, in reading order: the one place that
 * decides what is read and what is skipped.
 * @param {Element} root the page's prose (.prose)
 * @param {string} title
 * @returns {{text: string, range: Range|null, el: Element|null}[]}
 */
function readingQueue(root, title) {
  const q = []
  if (title) q.push({ text: title, range: null, el: null })
  const all = [...root.querySelectorAll(`${FIGURE}, ${LEAF}`)]
  for (const el of all) {
    if (el.closest(NEVER)) continue
    const fig = el.parentElement && el.parentElement.closest(FIGURE)
    if (fig && root.contains(fig)) continue // a figure is read as one thing
    if (el.matches(FIGURE)) {
      const pic = el.querySelector('svg[role="img"], img[alt], [role="img"]')
      const name = pic && (pic.getAttribute('aria-label') || pic.getAttribute('alt'))
      if (name) q.push({ text: name, range: null, el })
      for (const cap of el.querySelectorAll('.figure-title, .figure-note, figcaption')) {
        const nodes = textsOf(cap)
        const text = nodes.map((t) => t.data).join('')
        for (const [a, b] of sentencesOf(text))
          q.push({ text: text.slice(a, b), range: rangeOf(nodes, a, b), el: cap })
      }
      continue
    }
    // a leaf only: a list item holding paragraphs is read by its paragraphs
    if (el.querySelector(LEAF)) continue
    const nodes = textsOf(el)
    const text = nodes.map((t) => t.data).join('')
    for (const [a, b] of sentencesOf(text))
      q.push({ text: text.slice(a, b), range: rangeOf(nodes, a, b), el })
  }
  return q
}

// ---- the voice ----
// A browser left to itself reads with whatever voice the OS never chose:
// on a Mac that is the compact one, thin and robotic. The author wants one
// voice, male and steady at a natural pace, and the same voice on as many
// devices as possible (2026-10-01): the one listening should get the same
// page the next listener gets. The API says nothing about a voice but its
// name, so the rule is a list of names, in order, and the first one the
// device has wins: Daniel, who is on every Mac, iPhone and iPad out of the
// box and in every browser on them; Chrome's own British male where there
// is no Daniel (Windows, Linux, Android), spoken by Google, which is the
// price of one voice on a device without one; Windows's own after that.
// A device with none of them gets the best it has: never a novelty or a
// first generation voice, a richer voice (Premium, Enhanced, Natural,
// Neural) first, then a voice on the device over one on the network. The
// list is read per sentence because a browser fills it in late.
const PREFER = [
  'Daniel',
  'Google UK English Male',
  'Microsoft David',
  'Microsoft Mark',
  'Microsoft George',
]
const STEADY =
  /^(Daniel|Alex|Tom|Oliver|Aaron|Arthur|Reed|Eddy|Rocko|Lee|Rishi|Gordon|Microsoft (David|Mark|Guy|Ryan|Christopher|Eric|Roger|Brian|Andrew|Thomas|George)|Google UK English Male)\b/
const NOVELTY =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Fred|Good News|Hysterical|Jester|Junior|Kathy|Organ|Pipe Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/
const RICH = /premium|enhanced|natural|neural|^Google /i
// the voice's own pace: under it, every voice turns into a machine being
// patient with you
const RATE = 1

/**
 * The voice to read a page with, out of what the browser lists (the one
 * voice where the device has it), or null
 * when nothing fits the language (the browser then uses its own).
 * @param {{name: string, lang: string, localService?: boolean, default?: boolean}[]} voices
 * @param {string} lang the page's, e.g. "en" or "en-GB"
 */
// seam: test/page-reader.test.js
export function pickVoice(voices, lang) {
  const base = String(lang || 'en')
    .toLowerCase()
    .split(/[-_]/)[0]
  const pool = voices.filter(
    (v) =>
      String(v.lang || '')
        .toLowerCase()
        .split(/[-_]/)[0] === base && !NOVELTY.test(v.name)
  )
  if (!pool.length) return null
  // the one voice, where the device has it (a browser may list it with its
  // language after the name)
  for (const name of PREFER) {
    const hit = pool.find((v) => v.name === name || v.name.startsWith(name + ' '))
    if (hit) return hit
  }
  const score = (v) =>
    (RICH.test(v.name) ? 8 : 0) +
    (STEADY.test(v.name) ? 4 : 0) +
    (v.localService ? 2 : 0) +
    (v.default ? 1 : 0)
  return pool.reduce((best, v) => (score(v) > score(best) ? v : best))
}

const able = () =>
  typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance === 'function'
const lights = () =>
  typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'

// one voice at a time across the page: a new page's group takes over
let current = null

/**
 * Wire a group already in the document. Returns a handle whose stop() the
 * page calls when it closes or changes, so a voice never reads a page that
 * is no longer there.
 * @param {HTMLElement} group the .reader
 * @param {{shell: HTMLElement, title: string, prose: Element, scroller: () => Element, reduced: boolean}} o
 * @returns {{stop: () => void}}
 */
export function wireReader(group, { shell, title, prose, scroller, reduced }) {
  if (current) current.stop()
  const btn = (k) => group.querySelector(`[data-reader="${k}"]`)
  const ground = btn('ground')
  const plain = btn('plain')

  // the switches say what the page is doing, which with no stated choice is
  // what the OS said
  const paint = () => {
    const v = load()
    ground.setAttribute('aria-checked', String(v.ground ? v.ground === 'dark' : osDark()))
    plain.setAttribute('aria-checked', String(!!v.plain))
  }
  paint()
  ground.addEventListener('click', () => {
    const v = load()
    const dark = ground.getAttribute('aria-checked') !== 'true'
    v.ground = dark ? 'dark' : 'light'
    save(v)
    shell.dataset.ground = v.ground
    paint()
  })
  plain.addEventListener('click', () => {
    const v = load()
    v.plain = !v.plain
    save(v)
    if (v.plain) shell.dataset.type = 'plain'
    else delete shell.dataset.type
    paint()
  })
  // the OS changing its mind moves a switch nobody has touched
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
  mq?.addEventListener?.('change', paint)

  const listenBox = group.querySelector('.reader-listen')
  const listen = btn('listen')
  const stopBtn = btn('stop')
  let state = 'idle'
  let queue = []
  let at = 0
  // the room's side: `replaying` while a peer's view is applied (so nothing
  // applied is said back), `byPeer` for a reading a peer started (lit, never
  // scrolled), `along` while the browser refuses the voice, and `toldAt` the
  // sentence the room is on
  let replaying = false
  let byPeer = false
  let along = false
  let toldAt = 0
  const tell = () => {
    const ds = document.documentElement?.dataset
    if (replaying || !ds || (ds.session === undefined && ds.followed === undefined)) return
    const on = state === 'playing' ? 'play' : state === 'paused' ? 'pause' : 'stop'
    try {
      dispatchEvent(new CustomEvent('canvas:view', { detail: { what: 'listen', on, i: at } }))
    } catch {
      /* no room to tell */
    }
  }
  // every utterance knows which run it belongs to: cancel() fires `end` on
  // the one in flight, and a stale end must not start the next sentence
  let run = 0
  const setWord = (mark, word) => {
    listen.innerHTML = `${mark}<span>${word}</span>`
  }
  const setState = (s) => {
    state = s
    // Stop is there only while there is something to stop
    stopBtn.hidden = s === 'idle'
    listen.setAttribute('aria-pressed', String(s === 'playing'))
    if (s === 'playing') setWord(PAUSE_MARK, 'Pause')
    else if (s === 'paused') setWord(PLAY_MARK, 'Resume')
    else setWord(PLAY_MARK, along ? 'Reading along, tap to hear' : 'Listen')
  }
  const unlight = () => {
    if (lights()) CSS.highlights.delete('tts')
  }
  const light = (item) => {
    if (item.range && lights()) CSS.highlights.set('tts', new Highlight(item.range))
    else unlight()
    if (byPeer) return
    const box = item.range ? item.range.getBoundingClientRect() : item.el?.getBoundingClientRect()
    if (!box || !box.height) return
    // keep the words in the middle third of the screen
    const h = innerHeight
    if (box.top < h / 3 || box.bottom > (2 * h) / 3)
      scroller().scrollBy({
        top: box.top + box.height / 2 - h / 2,
        behavior: reduced ? 'auto' : 'smooth',
      })
  }
  const stop = () => {
    run++
    if (able() && state !== 'idle') speechSynthesis.cancel()
    unlight()
    setState('idle')
  }
  const say = (i, mine) => {
    if (mine !== run) return
    if (i >= queue.length) {
      stop()
      tell()
      return
    }
    at = i
    tell()
    const item = queue[i]
    const u = new SpeechSynthesisUtterance(item.text)
    u.lang = document.documentElement.lang || 'en'
    const v = pickVoice(speechSynthesis.getVoices(), u.lang)
    if (v) u.voice = v
    u.rate = RATE
    u.onstart = () => mine === run && light(item)
    u.onend = () => say(i + 1, mine)
    u.onerror = (e) => {
      // the browser will not speak for a page nobody has touched: say so on
      // Listen, which starts the voice where the room is
      if (e.error === 'not-allowed') {
        if (mine !== run) return
        run++
        along = true
        toldAt = i
        setState('idle')
        light(item)
        return
      }
      // an interruption is ours (stop, a new page); anything else skips on
      if (e.error !== 'interrupted' && e.error !== 'canceled') say(i + 1, mine)
    }
    speechSynthesis.speak(u)
  }
  if (able()) {
    listenBox.hidden = false
    listen.addEventListener('click', () => {
      if (state === 'playing') {
        speechSynthesis.pause()
        setState('paused')
      } else if (state === 'paused') {
        speechSynthesis.resume()
        setState('playing')
      } else {
        queue = readingQueue(prose, title)
        speechSynthesis.cancel()
        run++
        // reading along: the tap starts where the room is, and it is the
        // reader's own reading from here
        const from = along && toldAt < queue.length ? toldAt : 0
        along = false
        byPeer = false
        setState('playing')
        say(from, run)
        return
      }
      tell()
    })
    stopBtn.addEventListener('click', () => {
      along = false
      stop()
      tell()
    })
  }
  const onHide = () => {
    if (document.hidden) stop()
  }
  document.addEventListener('visibilitychange', onHide)
  addEventListener('pagehide', stop)

  // A peer's reading, read strictly: play, pause or stop, at a sentence this
  // page has. Applied under `replaying`, so the sentences it reads are said
  // on by the voice's own progress and never as an answer.
  function onPeer(e) {
    const d = e.detail
    if (!able() || !d || d.what !== 'listen') return
    if (!['play', 'pause', 'stop'].includes(d.on) || !Number.isInteger(d.i) || d.i < 0) return
    replaying = true
    try {
      if (d.on === 'stop') {
        along = false
        byPeer = false
        stop()
        return
      }
      if (state === 'idle' && !along) queue = readingQueue(prose, title)
      if (d.i >= queue.length) return
      toldAt = d.i
      if (along) {
        light(queue[d.i])
        return
      }
      if (d.on === 'pause') {
        if (state === 'playing') {
          speechSynthesis.pause()
          setState('paused')
        }
        return
      }
      if (state === 'paused') {
        speechSynthesis.resume()
        setState('playing')
      }
      // within a sentence of the room is reading along; further is a jump
      if (state === 'playing' && Math.abs(at - d.i) <= 1) return
      if (state === 'idle') byPeer = true
      speechSynthesis.cancel()
      run++
      setState('playing')
      say(d.i, run)
    } finally {
      replaying = false
    }
  }
  // and what this reader is doing, said again when the canvas asks (a new
  // follower, a page they have only just opened)
  const onAgain = () => state !== 'idle' && tell()
  addEventListener('canvas:peer-view', onPeer)
  addEventListener('canvas:view-again', onAgain)
  const handle = {
    stop() {
      stop()
      document.removeEventListener('visibilitychange', onHide)
      removeEventListener('pagehide', stop)
      removeEventListener('canvas:peer-view', onPeer)
      removeEventListener('canvas:view-again', onAgain)
      mq?.removeEventListener?.('change', paint)
      if (current === handle) current = null
    },
    at: () => at,
  }
  current = handle
  return handle
}
