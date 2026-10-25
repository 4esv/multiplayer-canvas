// multiplayer-canvas/rooms/view-sync: what a visitor is looking at (a video and its time, an
//   open tab) shared with the room.
// Inputs: wireViewSync({ page, sheet, following, presence }) once; a page shares with
//   shareView(d) and applies a peer's view with onView(kind, apply).
// Outputs: view payloads over the presence act channel, with echo suppression and seek
//   tolerance. Browser.
//
// THE VIEW, SHARED (2026-09-26). The author: "Ensure everything that can be
// synced (even video playback if possible) is."
//
// What a visitor is LOOKING AT on a page, besides where their hand is: the
// video playing and where in it, which instrument is up, which photograph of
// a set, the sentence being read aloud, which collection is spread over the
// ground and which of its cards is up. In a
// follow that goes one way, from the one followed to the tabs following it;
// in a session it goes from everyone to everyone. Both are the room's rules
// for an ACT (lib/presence-room.js act), and this rides that one bridge: a
// view is one more act channel, `view`, whose payload says WHAT it is in
// its `what` key (lib/presence-protocol.js ACT_CHANNELS). Nothing here
// touches the socket. It says `canvas:act` on the window like every page
// script does, and hears `canvas:peer-act` the same way (app.js, the page
// bridge), so who hears a view is exactly who hears a note.
//
// An act carries no page, and a view is meaningless on the wrong one: the
// third video of a case study is not the third video of the next. So a view
// of a page is stamped with the page's slug on the way out (`pg`) and a
// view for a page not open here is dropped on the way in. The page scripts
// never learn the slug. They say what they did with `canvas:view` and hear a
// peer's with `canvas:peer-view`, both on the window, and this module is the
// one place that stamps, checks and forwards. What belongs to the ground and
// not to a page (the fan) carries no page and is applied
// by app.js through onView.
//
// Every view is read strictly (viewOf): the kind from a closed list, exactly
// the keys that kind has and no other, every value in range. Anything else
// is dropped whole, the way the room's own grammar does one level up.
//
// ECHO. Applying a peer's view moves things that would otherwise speak: a
// video told to play fires `play`, a strip told to jump reports the photo it
// landed on. Those must not go back out. Two guards, one for each kind of
// echo. What a page script does synchronously while applying is held by the
// script's own `replaying` flag (the pattern of js/instruments.js), and the
// ground's by `applying` here. What arrives LATER (a media event, a scroll
// that settles, a history step) is caught by state: a view equal to the
// last one told here is not news, so it is not sent (`shared`, and for
// media the time-aware isEcho). The same rule breaks a loop from the other
// side: a peer's media state equal to what this tab last said is its own
// news coming back, and is not applied.
//
// What is NOT shared: a reader's settings (Dark Mode, Plain Type, the volume
// and whether a video is muted). Those are accessibility, not content, and
// stay each reader's own (js/page-reader.js).

// ---- the grammar ---------------------------------------------------------------
// A slug here is the act grammar's string without its `#`: a page, a stack,
// an instrument's name.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
const int = (lo, hi) => (v) => Number.isInteger(v) && v >= lo && v <= hi
const num = (lo, hi) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const slug = (v) => typeof v === 'string' && SLUG.test(v)
const bool = (v) => typeof v === 'boolean'

// The media elements a page may hold, and the playback a browser accepts:
// Chrome refuses a rate outside a sixteenth to sixteen, and a day of video is
// more than any page here will carry.
const MEDIA_MAX = 64
const T_MAX = 86400
const R_MIN = 0.0625
const R_MAX = 16
const LISTEN = ['play', 'pause', 'stop']

// Each kind and the keys it carries besides `what` (and `pg` for a page's).
//   media   n the element's index among the page's media, p playing, t the
//           time in seconds to a tenth, r the rate
//   tab     i the instrument's name, the one its #hash carries
//   photo   s the strip's index among the page's photo sets, i the photograph
//   listen  on play, pause or stop, i the sentence being read
//   fan     s the stack spread over the ground or null, i the card up or -1
const SHAPES = {
  media: { n: int(0, MEDIA_MAX - 1), p: bool, t: num(0, T_MAX), r: num(R_MIN, R_MAX) },
  tab: { i: slug },
  photo: { s: int(0, 63), i: int(0, 999) },
  listen: { on: (v) => LISTEN.includes(v), i: int(0, 9999) },
  fan: { s: (v) => v === null || slug(v), i: int(-1, 999) },
}
// the kinds that belong to a page, and so carry its slug
const PAGED = new Set(['media', 'tab', 'photo', 'listen'])

/**
 * A view act read strictly, or null to drop it whole. A page's view is
 * accepted only for the page open here.
 * @param {unknown} d the act's payload
 * @param {string|null} page the slug open here, null on the ground
 * @returns {object|null} a fresh object with exactly the kind's keys
 */
// seam: test/view-sync.test.js
export function viewOf(d, page) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null
  if (typeof d.what !== 'string' || !Object.hasOwn(SHAPES, d.what)) return null
  const shape = SHAPES[d.what]
  const paged = PAGED.has(d.what)
  const want = ['what', ...(paged ? ['pg'] : []), ...Object.keys(shape)]
  const keys = Object.keys(d)
  if (keys.length !== want.length || !want.every((k) => Object.hasOwn(d, k))) return null
  if (paged && (!slug(d.pg) || d.pg !== page)) return null
  for (const [k, ok] of Object.entries(shape)) if (!ok(d[k])) return null
  const out = {}
  for (const k of want) out[k] = d[k]
  return out
}

// ---- media: the playback, and the two rules that keep it honest ----------------
// Half a second is where two screens side by side stop looking like one
// video; under it a seek costs more (a stall, a rebuffer) than it fixes.
const DRIFT_S = 0.5
// how long a told state can still come back as an echo: a play() on a video
// that has loaded nothing yet can take seconds to fire its events
const ECHO_MS = 3000
// a scrub fires `seeked` many times a second; the room hears four
const SEEK_MS = 250
// a playing video is said again at this pace (in beats of a second) by the
// tab that drives it, so the ones following stay within the drift, and one
// that arrived late catches up
const BEAT_S = 4

/**
 * What a media element says about itself, rounded for the wire.
 * @param {{paused:boolean, ended?:boolean, currentTime:number, playbackRate:number}} el
 * @returns {{p:boolean, t:number, r:number}}
 */
// seam: test/view-sync.test.js
export function mediaState(el) {
  const t = Number.isFinite(el.currentTime) ? Math.max(0, el.currentTime) : 0
  return { p: !el.paused && !el.ended, t: Math.round(t * 10) / 10, r: el.playbackRate }
}

// where a state told at `told.at` stands now: a playing one has moved on at
// its rate, a paused one has not
const projected = (told, now) => (told.p ? told.t + ((now - told.at) / 1000) * told.r : told.t)

/**
 * Whether a state is the one already told (or already said), come back: the
 * same playing, the same rate, and the time where the told one would be by
 * now, within twice the drift. Past ECHO_MS nothing is an echo.
 * @param {{p:boolean, t:number, r:number}} state
 * @param {{p:boolean, t:number, r:number, at:number}|undefined} told
 * @param {number} now ms on the same clock as told.at
 */
// seam: test/view-sync.test.js
export function isEcho(state, told, now) {
  if (!told || now < told.at || now - told.at > ECHO_MS) return false
  return (
    state.p === told.p &&
    state.r === told.r &&
    Math.abs(state.t - projected(told, now)) <= DRIFT_S * 2
  )
}

/**
 * The drift rule: a seek is worth it only past half a second.
 * @param {number} local
 * @param {number} target
 */
// seam: test/view-sync.test.js
export const needsSeek = (local, target) => Math.abs(local - target) > DRIFT_S

/**
 * Trailing throttle: the first call goes at once, later ones within `ms`
 * collapse to one call at the end of the wait, with the last value given.
 * @param {number} ms
 * @param {(v:any)=>void} fn
 * @param {{now?:()=>number, later?:(f:Function, ms:number)=>any}} [clock]
 */
// seam: test/view-sync.test.js
export function throttle(ms, fn, { now = () => performance.now(), later = setTimeout } = {}) {
  let last = -Infinity
  let timer = null
  let pending
  const flush = () => {
    timer = null
    last = now()
    fn(pending)
  }
  return (v) => {
    pending = v
    if (timer !== null) return
    const wait = last + ms - now()
    if (wait <= 0) flush()
    else timer = later(flush, wait)
  }
}

// ---- the bridge ------------------------------------------------------------------
// The root says whether anybody is listening: a session, or somebody
// following this tab (app.js writes both). Nothing is built otherwise.
const listening = (ds) => !!ds && (ds.session !== undefined || ds.followed !== undefined)

// held true while a peer's view is being applied, so a hook that fires under
// it (app.js's fan hook) says nothing
let applying = false
// the ground's appliers and the state each would say again (app.js)
const handlers = new Map()
// the last state of each thing known to be shared, told or said, by key
const shared = new Map()
const keyOf = (v) => `${v.what}:${v.pg ?? ''}:${v.what === 'photo' ? v.s : ''}`
const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b)

function sendAct(d) {
  try {
    window.dispatchEvent(new window.CustomEvent('canvas:act', { detail: { ch: 'view', d } }))
  } catch {
    /* no room to tell */
  }
}

/**
 * Say a state of the ground's (the fan). Dropped while a
 * peer's is being applied, when nobody listens, when it is malformed and when
 * it is what is already shared.
 * @param {object} d
 * @param {boolean} [force] say it even if it is already shared
 * @returns {boolean} whether it went out
 */
export function shareView(d, force = false) {
  if (applying || typeof document === 'undefined') return false
  if (!listening(document.documentElement?.dataset)) return false
  const v = viewOf(d, null)
  if (!v || PAGED.has(v.what)) return false
  if (!force && same(shared.get(keyOf(v)), v)) return false
  shared.set(keyOf(v), v)
  sendAct(v)
  return true
}

/**
 * The ground's applier for one kind, and what it would say again for a new
 * audience. A second call replaces the first (a tile rebuilt).
 * @param {string} what
 * @param {(v:object, id:number)=>void} apply
 * @param {() => object|null} [now]
 */
export function onView(what, apply, now = () => null) {
  handlers.set(what, { apply, now })
}

// The fan a followed peer spread here. Following keeps the follower where
// the one followed is, and on the ground that folds any fan up (app.js
// driveFollow), so a fan the one followed opened is HELD while this tab
// still follows them: only the follower's own hand (a click, a key) or the
// one followed folding it closes it.
let held = null
let ownHand = false
let followingOf = () => null

/**
 * Whether the fan `id` is held for the one followed and nothing of the
 * visitor's own is closing it.
 * @param {string|null} id
 */
export function holdsFan(id) {
  return !!held && !ownHand && held.s === id && followingOf() === held.from
}

/**
 * A peer's view, off the page bridge: read, checked against the page open
 * here, and applied. Media goes to `to.media`, the ground's kinds to their
 * onView handler under `applying`, and a page script's kinds are handed on
 * through `to.tell` without the page key.
 * @param {{ch?:string, d?:unknown, id?:number, color?:string}} detail
 * @param {string|null} page
 * @param {{media:(v:object)=>void, tell:(detail:object)=>void}} to
 * @returns {object|null} the view applied, or null for one dropped
 */
// seam: test/view-sync.test.js
export function hear(detail, page, to) {
  const { ch, d, id, color } = detail || {}
  if (ch !== 'view') return null
  const v = viewOf(d, page)
  if (!v) return null
  if (v.what === 'media') {
    to.media(v)
    return v
  }
  shared.set(keyOf(v), v)
  if (!PAGED.has(v.what)) {
    const h = handlers.get(v.what)
    if (!h) return null
    if (v.what === 'fan') held = v.s ? { s: v.s, from: id } : null
    applying = true
    try {
      h.apply(v, id)
    } finally {
      applying = false
    }
    return v
  }
  const rest = { ...v }
  delete rest.pg
  to.tell({ ...rest, id, color })
  return v
}

/**
 * A page script's view on its way out: stamped with the page, read, and
 * dropped when nobody listens or it is already what is shared.
 * @param {unknown} d the page script's `canvas:view` detail
 * @param {string|null} page
 * @param {object} ds the root's dataset
 * @returns {object|null} the act's payload, or null for nothing to send
 */
// seam: test/view-sync.test.js
export function say(d, page, ds) {
  if (!listening(ds) || !page || !d || typeof d !== 'object') return null
  const v = viewOf({ ...d, pg: page }, page)
  if (!v || v.what === 'media') return null
  if (same(shared.get(keyOf(v)), v)) return null
  shared.set(keyOf(v), v)
  return v
}

/**
 * Wire the bridge. Called once by app.js.
 * @param {{page:()=>string|null, sheet:()=>Element|null, following:()=>number|null, presence?:{onPeers:Function, selfId:Function}}} o
 */
export function wireViewSync({ page, sheet, following, presence }) {
  followingOf = following
  const root = () => document.documentElement
  const now = () => performance.now()
  const isMedia = (el) => !!el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')
  const mediaIn = (r) => (r ? [...r.querySelectorAll('video, audio')] : [])

  // the visitor's own hand, for as long as the event it arrived in lasts:
  // the fan's hold never outlasts a click or a key of theirs
  const mine = () => {
    ownHand = true
    setTimeout(() => (ownHand = false), 0)
  }
  addEventListener('click', mine, true)
  addEventListener('keydown', mine, true)

  // ---- media --------------------------------------------------------------
  const told = new WeakMap() // el: the state last applied here, with `at`
  const said = new WeakMap() // el: the state last said from here, with `at`
  const leads = new WeakSet() // the elements whose last change was this tab's
  const mutedByUs = new WeakSet()
  const prompts = new WeakMap()

  function sendMedia(el, force = false) {
    const pg = page()
    const n = mediaIn(sheet()).indexOf(el)
    if (!pg || n < 0 || !listening(root().dataset)) return
    const s = mediaState(el)
    const t = now()
    if (!force && isEcho(s, told.get(el), t)) return
    const d = viewOf({ what: 'media', pg, n, ...s }, pg)
    if (!d) return
    said.set(el, { ...s, at: t })
    sendAct(d)
  }
  // a change the visitor made: this tab drives the element now
  function lead(el) {
    if (isEcho(mediaState(el), told.get(el), now())) return
    leads.add(el)
    sendMedia(el)
  }
  const seekOut = new WeakMap()
  function onMedia(e) {
    const el = e.target
    if (!isMedia(el) || !sheet()?.contains(el)) return
    // the visitor unmuting (the video's own control, or the prompt) is the
    // prompt answered
    if (e.type === 'volumechange') {
      if (!el.muted) drop(el)
      return
    }
    if (!listening(root().dataset)) return
    if (e.type === 'seeked') {
      if (!seekOut.has(el)) seekOut.set(el, throttle(SEEK_MS, lead))
      seekOut.get(el)(el)
      return
    }
    lead(el)
  }
  for (const type of ['play', 'pause', 'seeked', 'ratechange', 'volumechange'])
    document.addEventListener(type, onMedia, true)

  // THE BROWSER'S GESTURE RULE. A page may not start sound the visitor did
  // not ask for, so a play() a peer caused can be refused. It is never
  // forced through in silence: the video plays along muted where the
  // browser allows that, and a small button beside it says so and turns the
  // sound on with the visitor's own tap. Where even that is refused, the
  // button starts it.
  function offer(el, word) {
    if (prompts.has(el)) return
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'k-btn view-along'
    b.textContent = word === 'hear' ? 'playing along, tap to hear' : 'playing along, tap to play'
    b.addEventListener('click', () => {
      if (mutedByUs.has(el)) el.muted = false
      if (el.paused) el.play()?.catch?.(() => {})
      drop(el)
    })
    el.after(b)
    prompts.set(el, b)
  }
  function drop(el) {
    prompts.get(el)?.remove()
    prompts.delete(el)
    mutedByUs.delete(el)
  }
  function playAlong(el) {
    let p = null
    try {
      p = el.play()
    } catch {
      /* an element that cannot play */
    }
    p?.catch?.((err) => {
      if (!err || err.name !== 'NotAllowedError') return
      if (el.muted) return offer(el, 'play')
      el.muted = true
      mutedByUs.add(el)
      el.play().then(
        () => offer(el, 'hear'),
        () => {
          el.muted = false
          mutedByUs.delete(el)
          offer(el, 'play')
        }
      )
    })
  }
  function applyMedia(v) {
    const el = mediaIn(sheet())[v.n]
    if (!el) return
    const t = now()
    // this tab's own news coming back from a peer that played along
    if (isEcho(v, said.get(el), t)) return
    told.set(el, { p: v.p, t: v.t, r: v.r, at: t })
    leads.delete(el)
    if (el.playbackRate !== v.r) el.playbackRate = v.r
    if (needsSeek(el.currentTime, v.t)) {
      try {
        el.currentTime = v.t
      } catch {
        /* no metadata yet: the next beat lands it */
      }
    }
    if (v.p && el.paused) playAlong(el)
    else if (!v.p && !el.paused) el.pause()
  }

  // ---- inbound and outbound -----------------------------------------------
  addEventListener('canvas:peer-act', (e) =>
    hear(e.detail, page(), {
      media: applyMedia,
      tell: (detail) => dispatchEvent(new CustomEvent('canvas:peer-view', { detail })),
    })
  )
  addEventListener('canvas:view', (e) => {
    const v = say(e.detail, page(), root().dataset)
    if (v) sendAct(v)
  })

  // ---- a new audience, a new page -----------------------------------------
  // Somebody who starts following, or a follower arriving on a page after
  // the one followed, has heard none of what was already true there. So it
  // is said again, twice: the follower's tab takes a beat to open the page
  // it was taken to, and a view for a page not yet open there is dropped.
  // The page scripts are asked with `canvas:view-again`.
  let againT = []
  function again() {
    for (const t of againT) clearTimeout(t)
    againT = [1200, 3500].map((ms) =>
      setTimeout(() => {
        if (!listening(root().dataset)) return
        for (const k of [...shared.keys()]) if (PAGED.has(k.split(':')[0])) shared.delete(k)
        for (const h of handlers.values()) {
          const v = h.now()
          if (v) shareView(v, true)
        }
        for (const el of mediaIn(sheet())) if (!el.paused || el.currentTime > 0) sendMedia(el, true)
        dispatchEvent(new CustomEvent('canvas:view-again'))
      }, ms)
    )
  }
  let audience = 0
  presence?.onPeers?.((list) => {
    const me = presence.selfId()
    const n = me == null ? 0 : list.filter((p) => p.f === me).length
    if (n > audience) again()
    audience = n
  })
  // the beat, once a second: a page change while somebody listens, and
  // every fourth a playing video said again by the tab that drives it
  let lastPage = page()
  let beat = 0
  setInterval(() => {
    const pg = page()
    if (pg !== lastPage) {
      lastPage = pg
      if (pg && listening(root().dataset)) again()
    }
    if (++beat % BEAT_S) return
    for (const el of mediaIn(sheet())) if (!el.paused && leads.has(el)) sendMedia(el, true)
  }, 1000)
}
