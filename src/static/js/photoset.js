// The photo-set carousel: the walker, the counter, and the loading policy.
//
// The walker is the kit's snap scrollbar (js/kit-scroll.js wireScroll, the
// one way a collection is walked, markup from lib/photo-set.js): a stepper
// at each end that steps and wraps, a slider between them, and whatever it
// commits drives the strip. A move of one photograph glides, anything
// further (a wrap, a jump along the slider) jumps, because gliding across
// the whole strip is a smear, not a transition.
//
// The scrolling itself is not here. A scroll-snap strip already handles the
// swipe, the fling, the trackpad and the rubber band, in the compositor, at
// the right speed on every device. Reimplementing that in JavaScript is how
// carousels come to feel wrong on a phone. This drives the same scroller a
// finger does, and reads its position back.
//
// Three things it deliberately does NOT do:
//
//   Escape. Closing belongs to the page's own ladder (a query releases, a
//   page closes, a menu folds, a wandered camera flies home). A second
//   dismissal path would make Escape mean different things depending on
//   where the focus happened to be sitting.
//
//   Focus trapping. Tab leaves, always. The strip is a region on a page,
//   not a room.
//
//   The CSS carousel pseudo-elements (::scroll-marker, ::scroll-button).
//   They are Blink-only, not behind a flag in either other engine, and not
//   in Interop 2026, so shipping them means shipping the fallback anyway
//   and maintaining two behaviours.
//
// Re-runnable on purpose: the canvas re-executes an entry's modules every
// time its sheet is opened (a fresh URL each time), so this binds to any
// strip not already marked ready and leaves the rest alone. A module, so it
// is bundled for production (scripts/build-assets.mjs).
//
// THE PHOTOGRAPH IS SHARED in a session, and from the one followed to the
// tabs following them (canvas/view-sync.js): the photograph a strip lands
// on goes out as an `canvas:view`, said once the strip has settled so a fling
// through six photographs is one word, and a peer's is jumped to, never
// glided (a glide would report every photograph it passed). A jump made for
// a peer is held under `replaying` so it is not said back.

import { wireScroll } from 'multiplayer-canvas/kit/scroll'
;(function () {
  var motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var SETTLE_MS = 200

  function listening() {
    var ds = document.documentElement && document.documentElement.dataset
    return !!ds && (ds.session !== undefined || ds.followed !== undefined)
  }

  function init(root, which) {
    if (root.hasAttribute('data-photoset-ready')) return
    var track = root.querySelector('.photoset-track')
    var slides = Array.prototype.slice.call(root.querySelectorAll('.photoset-slide'))
    if (!track || slides.length < 2) return
    var readout = root.querySelector('[data-photoset-at]')
    var bar = root.querySelector('.photoset-bar .k-scroll')
    var walker = null
    var at = 0
    var replaying = false
    var settle = 0

    function tell() {
      if (replaying || !listening()) return
      clearTimeout(settle)
      settle = setTimeout(function () {
        try {
          window.dispatchEvent(
            new window.CustomEvent('canvas:view', { detail: { what: 'photo', s: which, i: at } })
          )
        } catch {
          /* no room to tell */
        }
      }, SETTLE_MS)
    }

    // Only the picture on screen and the two either side are asked for. A
    // set of forty costs one download until somebody starts moving through
    // it. Flipping the attribute is what starts the fetch; with no script
    // at all the browser's own lazy loading does the same job on scroll.
    function warm(i) {
      for (var k = i - 1; k <= i + 1; k++) {
        var slide = slides[k]
        if (!slide) continue
        var img = slide.querySelector('img')
        if (img && img.loading === 'lazy') img.loading = 'eager'
      }
    }

    function mark(i) {
      if (i === at || i < 0 || i >= slides.length) return
      at = i
      if (readout) readout.textContent = String(i + 1)
      if (walker) walker.set(i)
      warm(i)
      tell()
    }

    function goTo(i, jump) {
      var n = slides.length
      var target = ((i % n) + n) % n
      // Measured, not computed from offsetLeft: the slide's offset parent
      // is not guaranteed to be the scroller, and a page inside a
      // transformed canvas has enough positioned ancestors to prove it.
      var delta = slides[target].getBoundingClientRect().left - track.getBoundingClientRect().left
      track.scrollTo({
        left: track.scrollLeft + delta,
        behavior: jump || !motionOk ? 'auto' : 'smooth',
      })
      mark(target)
    }

    // Position, read back from the scroller so a swipe moves the counter
    // too. scrollsnapchange is the precise answer where it exists (Blink
    // only, for now); the observer is the one that works everywhere, and
    // both write through the same mark().
    if ('onscrollsnapchange' in track) {
      track.addEventListener('scrollsnapchange', function (e) {
        var landed = e.snapTargetInline || e.snapTargetBlock
        if (landed) mark(slides.indexOf(landed))
      })
    }
    var seen = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) mark(slides.indexOf(entries[i].target))
        }
      },
      { root: track, threshold: 0.6 }
    )
    for (var s = 0; s < slides.length; s++) seen.observe(slides[s])

    // The walker commits a slot; the strip follows it. A wrap crosses the
    // whole strip, and so may a jump along the slider: gliding that is a
    // smear, not a transition, so only a step of one glides.
    if (bar) {
      walker = wireScroll(bar, {
        titles: slides.map(function (s, i) {
          var img = s.querySelector('img')
          return (img && img.alt) || String(i + 1)
        }),
        onCommit: function (i) {
          goTo(i, Math.abs(i - at) !== 1)
        },
      })
    }

    track.addEventListener('keydown', function (e) {
      var key = e.key
      // preventDefault because the browser's own arrow scroll steps by a
      // line and fights the snap points back and forth.
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        e.preventDefault()
        goTo(at + 1)
      } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
        e.preventDefault()
        goTo(at - 1)
      } else if (key === 'Home') {
        e.preventDefault()
        goTo(0, true)
      } else if (key === 'End') {
        e.preventDefault()
        goTo(slides.length - 1, true)
      }
    })

    // A peer's photograph, read strictly: this strip, a photograph it has.
    // A strip that has left the document takes its listeners with it.
    function onPeer(e) {
      if (!root.isConnected) {
        window.removeEventListener('canvas:peer-view', onPeer)
        window.removeEventListener('canvas:view-again', onAgain)
        return
      }
      var d = e.detail
      if (!d || d.what !== 'photo' || d.s !== which) return
      if (!Number.isInteger(d.i) || d.i < 0 || d.i >= slides.length) return
      replaying = true
      try {
        goTo(d.i, true)
      } finally {
        replaying = false
      }
    }
    function onAgain() {
      if (!root.isConnected || !listening()) return
      try {
        window.dispatchEvent(
          new window.CustomEvent('canvas:view', { detail: { what: 'photo', s: which, i: at } })
        )
      } catch {
        /* no room to tell */
      }
    }
    window.addEventListener('canvas:peer-view', onPeer)
    window.addEventListener('canvas:view-again', onAgain)

    warm(0)
    root.setAttribute('data-photoset-ready', '')
  }

  var strips = document.querySelectorAll('[data-photoset]')
  for (var i = 0; i < strips.length; i++) init(strips[i], i)
})()
