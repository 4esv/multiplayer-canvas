// multiplayer-canvas/kit/scroll: the snap scrollbar: an index picker over N things, with steppers
//   that wrap.
// Inputs: scrollMarkup({ titles, at }) for the HTML; wireScroll(el, { titles, onCommit, onScrub
//   }).
// Outputs: markup strings and a handle { set, at }. Markup is pure; wiring is DOM. Style: kit.css.
//
// The snap scrollbar: the one way a collection is walked, on the
// canvas and on every full page. A classic scrollbar, a stepper at each
// end, a track between them and one thumb, read as an INDEX PICKER over N
// things: the thumb is the track's length over N and sits at slot i; it
// snaps, it never rests between slots. The steppers step by one and wrap,
// because a collection is a ring. Dragging the thumb scrubs slot to slot
// and shows the target's name in the host's label; releasing commits.
//
// Two halves in one file so nothing drifts: the MARKUP (a pure string, so
// the server SSRs a direct load with the same bar the canvas paints on a
// click, and node imports this file like layout.js) and the BEHAVIOUR
// (wireScroll, DOM only, never run at import). The drawing is kit.css
// `.k-scroll`; the /admin/kit specimen and the canvas both import this.
//
// The pixel chevrons live here now rather than in app.js, because the bar
// and the pile are drawn in one hand and the server needs the same marks.
// One mark per axis, transposed cell for cell (down and up are right and
// left turned a quarter), so the four cannot drift apart by hand.

export const RIGHT_GLYPH = `<svg viewBox='0 0 11 11' shape-rendering='crispEdges' aria-hidden='true'><path fill='currentColor' d='M3 1h2v1h-2zM4 2h2v1h-2zM5 3h2v1h-2zM6 4h2v1h-2zM7 5h2v1h-2zM6 6h2v1h-2zM5 7h2v1h-2zM4 8h2v1h-2zM3 9h2v1h-2z'/></svg>`
export const LEFT_GLYPH = `<svg viewBox='0 0 11 11' shape-rendering='crispEdges' aria-hidden='true'><path fill='currentColor' d='M6 1h2v1h-2zM5 2h2v1h-2zM4 3h2v1h-2zM3 4h2v1h-2zM2 5h2v1h-2zM3 6h2v1h-2zM4 7h2v1h-2zM5 8h2v1h-2zM6 9h2v1h-2z'/></svg>`
const DOWN_GLYPH = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M1 3h1v1h-1zM9 3h1v1h-1zM1 4h2v1h-2zM8 4h2v1h-2zM2 5h2v1h-2zM7 5h2v1h-2zM3 6h2v1h-2zM6 6h2v1h-2zM4 7h3v1h-3zM5 8h1v1h-1z"/></svg>`
export const UP_GLYPH = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M5 2h1v1h-1zM4 3h3v1h-3zM3 4h2v1h-2zM6 4h2v1h-2zM2 5h2v1h-2zM7 5h2v1h-2zM1 6h2v1h-2zM8 6h2v1h-2zM1 7h1v1h-1zM9 7h1v1h-1z"/></svg>`
// the close box, the same drawing the canvas bar's close wears (canvas/home.njk);
// the page bar alone uses it, on the lit tab and in its corner
const CLOSE_GLYPH = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M1 1h2v1h-2zM8 1h2v1h-2zM2 2h2v1h-2zM7 2h2v1h-2zM3 3h2v1h-2zM6 3h2v1h-2zM4 4h3v1h-3zM4 5h3v1h-3zM4 6h3v1h-3zM3 7h2v1h-2zM6 7h2v1h-2zM2 8h2v1h-2zM7 8h2v1h-2zM1 9h2v1h-2zM8 9h2v1h-2z"/></svg>`

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

const wrap = (i, n) => ((i % n) + n) % n

// The markup. `titles` names every slot (aria-valuetext, the steppers'
// labels); `hrefs`, when given, makes the steppers real links so a reader
// without scripts and a new-tab gesture still get a page, else they are
// buttons. `label` is the slider's accessible name.
export function scrollMarkup({ titles, at = 0, vert = false, hrefs = null, label = '' }) {
  const n = titles.length
  const i = Math.min(n - 1, Math.max(0, at))
  const prev = wrap(i - 1, n)
  const next = wrap(i + 1, n)
  const step = (cls, to, glyph, word) => {
    const aria = `aria-label="${word}: ${esc(titles[to])}"`
    return hrefs
      ? `<a class="k-btn k-ico k-step ${cls}" href="${esc(hrefs[to])}" ${aria}>${glyph}</a>`
      : `<button type="button" class="k-btn k-ico k-step ${cls}" ${aria}>${glyph}</button>`
  }
  return (
    `<div class="k-scroll${vert ? ' k-vert' : ''}" style="--k-n:${n};--k-at:${i}">` +
    step('k-prev', prev, vert ? UP_GLYPH : LEFT_GLYPH, 'previous') +
    `<div class="k-track" role="slider" tabindex="0" aria-orientation="${vert ? 'vertical' : 'horizontal'}"` +
    ` aria-label="${esc(label)}" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${i + 1}"` +
    ` aria-valuetext="${esc(titles[i])}"><div class="k-thumb"></div></div>` +
    step('k-next', next, vert ? DOWN_GLYPH : RIGHT_GLYPH, 'next') +
    `</div>`
  )
}

// THE PAGE BAR IS A ROW OF TABS, the way a browser holds pages: one
// tab a page of the ring, in the collection's order, each a real link to
// its page (a new-tab gesture still gets the page), the page you are on
// the lit one (aria-current). A page of a ring is one of many, so a tab is
// the kit's radio push-button, baked through textmode (kit.css .k-tab, the
// `tab` part): the lit tab is down, the rest stand up. The close box is ON
// the lit tab, as a browser tab's is, and no other tab carries one. How
// wide a tab is follows how near it is to the lit one: the lit tab and its
// neighbours (.k-near) keep room for their titles, the rest shrink toward
// the stub of theirs (canvas-home.css), so every tab is in view at once.
// The ring always holds the page itself.
//
// THE CORNER CLOSE. The bar ends in the kit's close box with its
// word, at the top right where a window's close is, going where the lit
// tab's close goes. The bar is stuck to the top of the scroll, so the
// corner close is always in reach. Nothing else rides the bar: the way
// back to the top is the page's foot, where the web puts it (app.js
// footTop). Both closes are named by what they do first ("Close"), so the
// name a voice user speaks is the word they see.
//
// EVERY PAGE OF THE RING, WHOLE. A desktop browser's strip ends in
// a small v, its tab search, that opens every tab as a list you can read
// whole; a phone browser draws no strip at all, only the tab you are on,
// that v and the close. So the bar carries
// the v between the strip and the corner close, and it opens the ring as
// a stack of the same tabs: every page by its full title, the page you are
// on lit. On a phone the other tabs step aside and the lit
// one takes the strip and opens the same list (canvas-home.css, app.js).
// The list is a native popover, so it opens, closes on Esc or a tap outside
// and lives above the page with no script, and each row is a real link. A
// ring of one has nothing to choose between and carries no v.
export function pageBarMarkup({ label, close, ring, at = 0 }) {
  const tabs = ring
    .map((r, i) => {
      const on = i === at
      const near = Math.abs(i - at) === 1
      const go =
        `<a class="k-tab-go" href="${esc(r.path)}" tabindex="${on ? 0 : -1}"` +
        `${on ? ' aria-current="page"' : ''}>${esc(r.title)}</a>`
      const x = on
        ? `<a class="k-btn k-ico k-close" href="${esc(close.path)}" aria-label="Close: back to ${esc(close.label)}">${CLOSE_GLYPH}</a>`
        : ''
      return `<div class="k-tab${on ? ' is-on' : near ? ' k-near' : ''}">${go}${x}</div>`
    })
    .join('')
  // a strip with a collection to name is named for it; one without (a
  // root-mounted page's ring) is a navigation and nothing more
  return (
    `<nav class="k-bar"${label ? ` aria-label="${esc(label)}"` : ''}>` +
    `<div class="k-tabs">${tabs}</div>` +
    ringListMarkup({ label, ring, at }) +
    `<a class="k-btn page-x" href="${esc(close.path)}" aria-label="Close: back to ${esc(close.label)}">${CLOSE_GLYPH}<span class="page-x-word">Close</span></a>` +
    `</nav>`
  )
}

// The v and the list it opens. The v is a glyph, so its name says what it
// opens and where you are in it ("Case Studies, 3 of 7").
function ringListMarkup({ label, ring, at }) {
  if (ring.length < 2) return ''
  const name = `${label || 'Pages'}, ${at + 1} of ${ring.length}`
  const rows = ring
    .map((r, i) => {
      const on = i === at
      return (
        `<a class="k-btn k-ring-go${on ? ' is-on' : ''}" href="${esc(r.path)}"${on ? ' aria-current="page"' : ''}>` +
        `<span class="k-ring-t">${esc(r.title)}</span>` +
        `</a>`
      )
    })
    .join('')
  return (
    `<button type="button" class="k-ring-v" popovertarget="k-ring" aria-label="${esc(name)}">${DOWN_GLYPH}</button>` +
    `<div class="k-menu k-ring" id="k-ring" popover${label ? ` aria-label="${esc(label)}"` : ''}>${rows}</div>`
  )
}

// The keys on a strip of tabs: one tab takes the Tab key's stop (the lit
// one, then whichever the arrows reach), the arrows walk the tabs and wrap,
// Home and End go to the ends, and Enter is the link's own. A roving
// tabindex, the way a tab list is walked.
export function wireTabs(strip) {
  const links = () => [...strip.querySelectorAll('.k-tab-go')]
  strip.addEventListener('keydown', (e) => {
    const all = links()
    const i = all.indexOf(document.activeElement)
    if (i < 0) return
    const n = all.length
    const to =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null
    if (to === null) return
    e.preventDefault()
    e.stopPropagation()
    all[i].tabIndex = -1
    all[to].tabIndex = 0
    all[to].focus()
  })
}

// The lit tab in view: a strip too long for its bar scrolls sideways (the
// tabs keep a readable width rather than shrink, canvas-home.css), so the
// page you are on is brought to the middle of the strip whenever the bar is
// painted, on an open and on a tab switch alike. Only the strip moves: the
// page under the bar is never scrolled to reach it, which scrollIntoView
// would do. offsetLeft is read against the strip (it is positioned), so a
// bar still growing out of its card, under a transform, measures the same.
// A strip that fits has nothing to scroll and is left at its start.
export function litIntoView(strip) {
  const lit = strip.querySelector('.k-tab.is-on')
  if (!lit) return
  const room = strip.scrollWidth - strip.clientWidth
  if (room <= 0) return
  const mid = lit.offsetLeft + lit.offsetWidth / 2 - strip.clientWidth / 2
  strip.scrollLeft = Math.max(0, Math.min(room, Math.round(mid)))
}

// The behaviour, on a `.k-scroll` already in the document. `onCommit(i)` is
// a chosen slot (a stepper, a click on the track, a key, a wheel notch, a
// released drag); `onScrub(i)` is the slot under a drag in flight, or null
// when the drag lets go. Returns a handle: set(i) repaints from outside (a
// remote change) without committing; at() reads the slot. A scrub that
// lands on a new slot ends in onCommit alone; one that lands where it
// began ends in onScrub(null).
export function wireScroll(el, { titles, hrefs = null, onCommit, onScrub }) {
  const n = titles.length
  const vert = el.classList.contains('k-vert')
  const track = el.querySelector('.k-track')
  let at = Number(el.style.getPropertyValue('--k-at')) || 0
  const paint = (i) => {
    at = i
    el.style.setProperty('--k-at', String(i))
    track.setAttribute('aria-valuenow', String(i + 1))
    track.setAttribute('aria-valuetext', titles[i])
    for (const [cls, to] of [
      ['.k-prev', wrap(i - 1, n)],
      ['.k-next', wrap(i + 1, n)],
    ]) {
      const s = el.querySelector(cls)
      s.setAttribute('aria-label', `${cls === '.k-prev' ? 'previous' : 'next'}: ${titles[to]}`)
      // the link, when it is one, points at where it now steps to
      if (hrefs) s.setAttribute('href', hrefs[to])
    }
  }
  const commit = (i) => {
    i = wrap(i, n)
    if (i === at) return
    paint(i)
    onCommit(i)
  }
  // steppers: a step, wrapping; a modifier click on a link stays the
  // browser's (a new tab gets the real page)
  for (const [cls, by] of [
    ['.k-prev', -1],
    ['.k-next', 1],
  ])
    el.querySelector(cls).addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      commit(at + by)
    })
  // the slot under a pointer along the track. A drag reads the track's box
  // as it was when the hand landed: a host's label may grow with the
  // target's title and squeeze the track, and a track that moves under the
  // finger would hand back a slot the finger never chose.
  const slotAt = (e) => {
    const r = (drag && drag.rect) || track.getBoundingClientRect()
    const f = vert ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width
    return Math.min(n - 1, Math.max(0, Math.floor(f * n)))
  }
  // THE GRAB HAND. Scrolling a collection uses the
  // grab hand cursor. A track is walked by dragging it, so over it the
  // hand offers the grab and a held scrub is a haul, the ground's own hand.
  // Both are states of the pointer written on the root, where every hand is
  // decided (canvas-home.css html.grabbable / html.hauling); nothing here
  // sets a cursor of its own.
  // A track rebuilt or hidden under the pointer never hears its leave, so
  // the first pointer over anything else lets the grab go as well.
  const root = document.documentElement
  const letGo = (e) => {
    if (e && track.contains(e.target)) return
    root.classList.remove('grabbable')
    document.removeEventListener('pointerover', letGo, true)
  }
  track.addEventListener('pointerenter', () => {
    root.classList.add('grabbable')
    document.addEventListener('pointerover', letGo, true)
  })
  track.addEventListener('pointerleave', () => letGo())
  // a press on the track jumps the thumb to that slot and takes the pointer;
  // while held the thumb follows, slot to slot, and the release commits
  let drag = null
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    track.setPointerCapture(e.pointerId)
    track.focus({ preventScroll: true })
    drag = { from: at, i: slotAt(e), rect: track.getBoundingClientRect() }
    el.classList.add('is-drag')
    root.classList.add('hauling')
    el.style.setProperty('--k-at', String(drag.i))
    if (onScrub) onScrub(drag.i)
  })
  track.addEventListener('pointermove', (e) => {
    if (!drag) return
    const i = slotAt(e)
    if (i === drag.i) return
    drag.i = i
    el.style.setProperty('--k-at', String(i))
    if (onScrub) onScrub(i)
  })
  // letting go: a changed slot commits (the host answers onCommit and
  // needs no second word), an unchanged or cancelled one is put back and
  // the host is told the scrub is over
  const release = (cancel) => {
    if (!drag) return
    const { from, i } = drag
    drag = null
    el.classList.remove('is-drag')
    root.classList.remove('hauling')
    if (cancel || i === from) {
      paint(from)
      if (onScrub) onScrub(null)
    } else commit(i)
  }
  track.addEventListener('pointerup', () => release(false))
  track.addEventListener('pointercancel', () => release(true))
  // a wheel notch over it steps; the page under it does not scroll
  el.addEventListener(
    'wheel',
    (e) => {
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (!d) return
      e.preventDefault()
      e.stopPropagation()
      commit(at + (d > 0 ? 1 : -1))
    },
    { passive: false }
  )
  // focused: the arrows step, Home and End go to the ends
  track.addEventListener('keydown', (e) => {
    const by =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : by ? at + by : null
    if (to === null) return
    e.preventDefault()
    e.stopPropagation()
    commit(to)
  })
  return { set: paint, at: () => at }
}
