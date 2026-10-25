// multiplayer-canvas/pixel-moves: the motion vocabulary on a canvas overlay: rects march, things
//   poof, surfaces fill.
// Inputs: elements or DOMRect-like boxes and options { done, beats, color }; inks come from
//   tokens.css (--cv-ink, --cv-ground, --cv-mute).
// Outputs: zoomRects, poof, bigBang, implode: each draws one move and calls done. Browser only;
//   honours prefers-reduced-motion.
//
// primitives/pixel-moves.js
// THE MOVES, as one mechanism, on every surface this site serves.
//
// BIBLE.md section 9 names a vocabulary: rects march out of the thing you
// clicked, destruction poofs, a surface fills by defragging. The insight that
// makes it one piece of code rather than three is that EVERY ONE OF THESE
// MOVES OPERATES ON A BOX, NEVER ON CONTENT. Zoom rects are four lines
// between two rectangles. A poof is a cloud of cells over one rectangle.
// Defrag fills one rectangle in scan order. None of them need to know what is
// inside the thing they are moving.
//
// So this is not "make the admin page a canvas". It is one fixed overlay per
// document that takes a getBoundingClientRect() and plays a move over it, and
// it therefore works identically on the canvas and on any page beside it.
// The tokens are shared by all of them (canvas-tokens.css is loaded by every
// one), so the cell, the two inks and the durations need no arguments.
//
// Everything here is whole-cell. The overlay's backing store is sized in
// CELLS and blown up by CSS with smoothing off, which is why a 1440x900
// viewport costs 81k bytes rather than a megapixel raster, and why a rect
// drawn here lands on the same lattice as everything else on the page.
//
// Reduced motion is not a variant: every entry point runs its callback at
// once and paints nothing.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

// ---- tokens, read from the live stylesheet ---------------------------------
// Durations and easings are tokens and component code never hardcodes either
// (BIBLE.md section 9). A frame count is arithmetic over a token, not a
// number somebody picked.
const root = () => getComputedStyle(document.documentElement)
const px = () => parseFloat(root().getPropertyValue('--cv-px')) || 4
const ms = (name) => {
  const v = root().getPropertyValue(`--cv-dur-${name}`).trim()
  return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000
}
// No literal fallback. A raw hex here would be a colour this file invented,
// which is exactly what the palette guard exists to stop, and a move that
// cannot read the ink is running on a page that never loaded the tokens: the
// right answer there is to paint nothing, not to guess a grey.
const ink = (name) => root().getPropertyValue(`--cv-${name}`).trim()

// ---- the overlay -----------------------------------------------------------
let cv = null
let ctx = null
let cell = 4

function overlay() {
  if (cv) return cv
  cv = document.createElement('canvas')
  cv.id = 'pxmoves'
  cv.setAttribute('aria-hidden', 'true')
  // above the sheet and the bar, deaf to the pointer, and it never takes a
  // layer until something is actually playing
  cv.style.cssText =
    'position:fixed;left:0;top:0;width:100%;height:100%;z-index:var(--cv-z-move);' +
    'pointer-events:none;image-rendering:pixelated;display:none'
  document.body.appendChild(cv)
  ctx = cv.getContext('2d')
  return cv
}

function size() {
  cell = px()
  const w = Math.ceil(innerWidth / cell)
  const h = Math.ceil(innerHeight / cell)
  if (cv.width !== w || cv.height !== h) {
    cv.width = w
    cv.height = h
  }
  ctx.imageSmoothingEnabled = false
  return { w, h }
}

// A rect in the overlay's own cells. Accepts a DOMRect (width/height) or the
// canvas's own box shape (w/h), because both are real currency in this
// codebase and silently reading the wrong pair produces NaN coordinates,
// which fillRect accepts without complaint and draws nothing for.
const inCells = (r) => {
  const w = r.width ?? r.w
  const h = r.height ?? r.h
  return {
    x: Math.round(r.x / cell),
    y: Math.round(r.y / cell),
    w: Math.max(1, Math.round(w / cell)),
    h: Math.max(1, Math.round(h / cell)),
  }
}
// a rect is only usable if it has a real box: an off-camera node reports all
// zeros and rects marched to the origin would be a move to nowhere
const usable = (r) => !!r && Number.isFinite(r.x) && (r.width ?? r.w) > 0 && (r.height ?? r.h) > 0

// ONE LOOP, MANY PAINTERS.
//
// The first cut gave every call its own rAF loop, and every loop began by
// clearing the whole canvas. With one move at a time that is invisible; with
// twenty (the boot sweep defragging twenty tiles at once) each frame is
// whatever the last painter drew and the other nineteen are erased. So the
// overlay keeps a SET of painters and clears exactly once per frame, before
// any of them draw.
const painters = new Set()
let raf = 0

function frame(now) {
  ctx.clearRect(0, 0, cv.width, cv.height)
  for (const p of painters) {
    const k = Math.min(1, (now - p.t0) / p.ms)
    const f = Math.min(p.frames, Math.floor(k * p.frames))
    p.draw(f, p.frames)
    if (k >= 1) {
      painters.delete(p)
      p.done?.()
    }
  }
  if (painters.size) raf = requestAnimationFrame(frame)
  else {
    raf = 0
    cv.style.display = 'none'
    ctx.clearRect(0, 0, cv.width, cv.height)
  }
}

function run(frames, ms_, draw, done) {
  overlay()
  // only size the canvas when nothing is mid-flight: setting width/height
  // wipes the backing store, which would blank every painter already running
  if (!painters.size) size()
  cv.style.display = 'block'
  painters.add({ frames, ms: ms_, draw, done, t0: performance.now() })
  if (!raf) raf = requestAnimationFrame(frame)
}

// ---- ZOOM RECTS ------------------------------------------------------------
// System 1 through Mac OS 9: opening a window marched dotted outlines from the
// icon to the window, and closing ran them backwards. Four lines of cells, and
// they say exactly which thing became which, which is the whole job.
//
// The dots are every other cell. That is not decoration: an alternating
// outline stays visible over a light ground and a dark one, which is why the
// era drew every marquee this way and why it still works over a photograph.
export function zoomRects(from, to, { done, frames = 8 } = {}) {
  const a1 = ink('ink')
  const a2 = ink('ground')
  if (REDUCED || !usable(from) || !usable(to) || !a1 || !a2) return void done?.()
  const a = inCells(from)
  const b = inCells(to)
  const dur = ms('slide')
  run(
    frames,
    dur,
    (f) => {
      const k = f / frames
      const lerp = (p, q) => Math.round(p + (q - p) * k)
      const r = {
        x: lerp(a.x, b.x),
        y: lerp(a.y, b.y),
        w: lerp(a.w, b.w),
        h: lerp(a.h, b.h),
      }
      // TWO INKS, ALTERNATING, every cell of the outline filled.
      //
      // The first cut drew ink on every OTHER cell and left the rest clear,
      // and it was invisible: the collection's scrim is rgba(24,24,27,.55),
      // the ink is #18181b, and an ink outline over an ink scrim is an ink
      // rectangle nobody can see. The move ran perfectly for 320ms and read
      // as the page freezing and then jumping.
      //
      // No single colour fixes it either, because the backdrop CHANGES
      // during the move: it starts as the light ground of the world and ends
      // as the dark scrim, so whichever ink you pick vanishes into one end.
      // Alternating the two is why every marquee from MacPaint onward was
      // drawn this way, and it is what the comment here claimed to be doing
      // while the code did something else.
      const cell1 = (x, y) => {
        ctx.fillStyle = (x + y) % 2 === 0 ? a1 : a2
        ctx.fillRect(x, y, 1, 1)
      }
      for (let x = r.x; x < r.x + r.w; x++) {
        cell1(x, r.y)
        cell1(x, r.y + r.h - 1)
      }
      for (let y = r.y; y < r.y + r.h; y++) {
        cell1(r.x, y)
        cell1(r.x + r.w - 1, y)
      }
    },
    done
  )
}

// ---- POOF ------------------------------------------------------------------
// The Finder's gesture for "this is gone". Destruction poofs, everywhere on
// this origin (BIBLE.md section 9): the box bursts into its own cells and they
// fall out of the frame, and the seat it leaves stays empty.
//
// It is OPTIMISTIC by design. A poof that waits for a round trip is not a
// poof, so the caller hides the element now and puts it back if the server
// refuses.
// `beats` stretches the move to that many drift tokens. One is the flick a
// deleted row gets; the canvas's /poof asks for several, and the physics has
// to survive that, which is what the note below is about.
export function poof(target, { done, color, beats = 1 } = {}) {
  const r = target?.getBoundingClientRect ? target.getBoundingClientRect() : target
  const c = color || ink('ink')
  if (REDUCED || !usable(r) || !c) return void done?.()
  overlay()
  const { h: FRAME_H } = size()
  const b = inCells(r)
  const mute = ink('mute') || c
  const dur = ms('drift') * beats
  const frames = Math.max(1, Math.round(dur / 24))
  // THE PHYSICS IS DERIVED FROM THE RUN, NOT PICKED (2026-09-16).
  //
  // The constants here used to be literals tuned by eye against a 600ms
  // drift: 0.16 of gravity a frame, a burst speed of half a cell to two, a
  // drag of 0.96. Every one of them is a per-FRAME number, so they only mean
  // what they were tuned to mean at one length. Asked for a ten-second poof
  // they did not slow down, they overshot: at 0.16 a frame a particle falls
  // eighteen hundred cells in the first three seconds, so the cloud left the
  // screen almost immediately and the rest of the move was empty ground
  // pretending to be a poof.
  //
  // So the three of them are solved for instead. Gravity is whatever lands a
  // particle a frame-and-a-bit below the bottom ON THE LAST FRAME, the burst
  // speed is whatever opens the cloud about a sixth of the frame over the
  // same run, and the drag is the root that decays a particle's sideways
  // travel to a twentieth of it by the end however many frames there are.
  // The move now reads the same at any length: it is the same fall, watched
  // for longer.
  const fall = FRAME_H * 1.25
  const g = (2 * fall) / (frames * frames)
  const burst = (FRAME_H * 0.16) / frames
  const drag = Math.pow(0.05, 1 / frames)
  const parts = []
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  // every other cell, so a big row does not cost thousands of particles and
  // so the cloud reads as a cloud rather than as the box sliding
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      if ((x + y) % 2) continue
      const a = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.8
      const s = burst * (0.4 + Math.random() * 1.4)
      parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - burst * 0.9,
        // every particle falls at its OWN weight, within a fifth of the
        // solved one. Identical gravity drops the whole cloud as one sheet
        // with a flat bottom edge, which is a curtain rather than debris;
        // the spread is what makes it read as things falling.
        g: g * (0.8 + Math.random() * 0.4),
        c: Math.random() < 0.3 ? mute : c,
      })
    }
  run(
    frames,
    dur,
    () => {
      for (const p of parts) {
        p.vy += p.g
        p.x += p.vx
        p.y += p.vy
        p.vx *= drag
        ctx.fillStyle = p.c
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
      }
    },
    done
  )
}

// ---- THE BIG BANG ----------------------------------------------------------
// A singularity, an eruption, and then the world CONDENSES OUT OF THE EJECTA.
//
// The order is the whole point and it is the thing the first cut got wrong.
// That version inflated the finished tiles outward from a point, which is a
// zoom with a story attached: the matter arrived already assembled and the
// particles were decoration playing alongside. In a big bang nothing is
// assembled at the start. Everything that will ever exist is thrown out as
// dust first, and structure happens LATER, out of that dust, as it slows and
// gathers. So the dust is not an effect here, it is the material: every cell
// of every box is a particle, the particles are flung out of one point, and
// the boxes are what they eventually fall into.
//
// It takes boxes and a point, never elements, so it stays inside this
// module's one rule: a move here paints, and it tells the caller when a box
// has finished condensing (onArrive) so the caller can hand over the real
// thing. The caller reveals; this never knows what it is painting for.
//
// Three phases on one clock, because they are one event:
//
//   ERUPT    every particle leaves the point along its own ray, fast, on a
//            decelerating radius (t squared out, eased), so it tears away and
//            then coasts. At t=0 they are all one lit cell: the singularity.
//   COAST    the eruption's easing runs out and the cloud hangs, spread.
//   CONDENSE each particle crosses from wherever it drifted to the cell it
//            belongs to. It starts at its own staggered moment so the box
//            fills in as a gathering rather than a snap, and every particle
//            of a box lands by that box's own arrival time.
//
// Boxes arrive NEAREST THE POINT FIRST, so structure spreads outward from
// the middle the way the eruption did. When a box lands, its particles stop
// being painted and the caller is told: the dust does not sit on top of the
// thing it just became.
const easeOut = (x) => 1 - (1 - x) * (1 - x)
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)
// the particle ceiling. Every cell of every box would be the honest count and
// on a full frame it is six figures, which is a slideshow. A stride is taken
// across both axes so the cloud stays under this however much world is up;
// the dust is a sample of the thing, and at one cell a particle nobody can
// tell which cells were left out.
const BANG_MAX = 9000
//
// `boxesAt` and `originAt` are READ EVERY FRAME, never captured once, and
// that is what makes the move belong to the world rather than to the screen.
// The point is a place ON THE GROUND; pan during the eruption and the whole
// event travels with the ground, because that is what it would do if it were
// really happening there. A particle therefore remembers its home as a
// FRACTION of its box rather than as a pixel, so a camera that moves or zooms
// mid-flight re-aims every grain of dust for free.
//
// NOTHING IS REVEALED UNTIL IT IS ALL OVER. A box that finishes condensing
// keeps being painted as dust sitting in its own silhouette; the caller is
// told once, at the end, and swaps the whole world in at once. Revealing each
// box as it landed was the obvious thing and it was wrong: real tiles then
// stand around at full detail beside clouds that have not resolved, which
// says the world was there all along and the dust was a screensaver over it.
export function bigBang(boxesAt, { beats = 1, originAt, done } = {}) {
  const c = ink('ink')
  const mute = ink('mute') || c
  const first = boxesAt()
  if (REDUCED || !c || !first.length) return void done?.()
  overlay()
  const { w: W, h: H } = size()
  const org = () => {
    const o = originAt?.() || { x: (W * cell) / 2, y: (H * cell) / 2 }
    return { x: o.x / cell, y: o.y / cell }
  }
  const dur = ms('drift') * beats
  const frames = Math.max(1, Math.round(dur / 24))
  const reach = Math.hypot(W, H) * 0.7
  const o0 = org()
  // the boxes that have a box at all; order is the caller's and is kept, so
  // index i here is index i there for the whole run
  const live = []
  first.forEach((r, i) => {
    if (!usable(r)) return
    const b = inCells(r)
    live.push({ i, d: Math.hypot(b.x + b.w / 2 - o0.x, b.y + b.h / 2 - o0.y) })
  })
  if (!live.length) return void done?.()
  const ERUPT = 0.28
  const far = Math.max(1, ...live.map((s) => s.d))
  for (const s of live) s.arrive = 0.52 + 0.46 * (s.d / far)
  // one stride for the whole cloud, so a big tile is not sampled finer than a
  // small one and the dust has one grain everywhere
  const area = live.reduce((n, s) => {
    const b = inCells(first[s.i])
    return n + b.w * b.h
  }, 0)
  const stride = Math.max(2, Math.ceil(Math.sqrt(area / BANG_MAX)))
  for (const s of live) {
    const b = inCells(first[s.i])
    s.parts = []
    for (let y = 0; y < b.h; y += stride)
      for (let x = 0; x < b.w; x += stride) {
        const a = Math.random() * Math.PI * 2
        s.parts.push({
          // home, as a fraction of the box: re-aimed every frame off whatever
          // the box is now
          fx: x / b.w,
          fy: y / b.h,
          cos: Math.cos(a),
          sin: Math.sin(a),
          // THE CLOUD IS A DISC, NOT A SHELL. The speeds used to start at a
          // quarter, which punched a hole of exactly that radius through the
          // middle: every particle was past it by the same moment and the
          // eruption read as a smoke ring. Two things fill it in. The speed
          // now runs all the way down to nothing, weighted so that an even
          // spread of particles covers an even spread of AREA rather than of
          // radius (a uniform speed puts most of the cloud near the rim,
          // because a ring's area grows with r). And each grain leaves on its
          // own delay, so at any instant there is a continuum from the point
          // outward instead of one front. An explosion is full of the thing
          // that exploded; only the shock wave is a ring.
          sp: Math.pow(Math.random(), 0.65),
          d0: Math.random() * ERUPT * 0.55,
          // when this one stops drifting and starts going home: anywhere in
          // the first half of its box's window, so the box gathers
          s: ERUPT + Math.random() * (s.arrive - ERUPT) * 0.55,
          c: Math.random() < 0.3 ? mute : c,
        })
      }
  }
  run(
    frames,
    dur,
    (f) => {
      const t = f / frames
      const o = org()
      const now = boxesAt()
      for (const s of live) {
        const r = now[s.i]
        if (!usable(r)) continue
        const b = inCells(r)
        for (const p of s.parts) {
          const hx = b.x + p.fx * b.w
          const hy = b.y + p.fy * b.h
          const R = easeOut(Math.max(0, Math.min(1, (t - p.d0) / ERUPT))) * reach * p.sp
          const ex = o.x + p.cos * R
          const ey = o.y + p.sin * R
          const k = (t - p.s) / (s.arrive - p.s)
          const w = k <= 0 ? 0 : easeInOut(Math.min(1, k))
          ctx.fillStyle = p.c
          ctx.fillRect(Math.round(ex + (hx - ex) * w), Math.round(ey + (hy - ey) * w), 1, 1)
        }
      }
    },
    done
  )
}

// ---- THE COLLAPSE ----------------------------------------------------------
// The bang's mirror, and the thing that feeds it. Every cell of every box
// falls INTO the point: slowly at first, then faster the closer it gets, and
// turning as it goes, the way anything falling into a well turns. What
// arrives is not destroyed, it ACCUMULATES: a swallowed grain keeps being
// painted at the point, so the singularity visibly thickens as the world
// disappears into it, and the run ends holding that dot still. The stillness
// is part of this move rather than a gap after it, because a gap would have
// nothing on screen and the whole argument of the pair is that the thing the
// bang throws out is the thing the collapse swallowed.
//
// Same contract as the bang: boxes and origin are READ EVERY FRAME, homes are
// remembered as fractions, so it belongs to the ground and not to the window.
const TAU = Math.PI * 2
export function implode(boxesAt, { beats = 1, originAt, done } = {}) {
  const c = ink('ink')
  const mute = ink('mute') || c
  const first = boxesAt()
  if (REDUCED || !c || !first.length) return void done?.()
  overlay()
  const { w: W, h: H } = size()
  const org = () => {
    const o = originAt?.() || { x: (W * cell) / 2, y: (H * cell) / 2 }
    return { x: o.x / cell, y: o.y / cell }
  }
  const dur = ms('drift') * beats
  const frames = Math.max(1, Math.round(dur / 24))
  const o0 = org()
  // the last quarter is the SINGULARITY, held: everything is in by then and
  // the point simply sits there, which is the moment of stillness
  const IN = 0.75
  const live = []
  first.forEach((r, i) => {
    if (!usable(r)) return
    const b = inCells(r)
    live.push({ i, d: Math.hypot(b.x + b.w / 2 - o0.x, b.y + b.h / 2 - o0.y) })
  })
  if (!live.length) return void done?.()
  const far = Math.max(1, ...live.map((s) => s.d))
  // nearest goes first: a well eats what is closest to it, which is also the
  // order the bang gives it back
  for (const s of live) s.eaten = IN * (0.35 + 0.65 * (s.d / far))
  const area = live.reduce((n, s) => {
    const b = inCells(first[s.i])
    return n + b.w * b.h
  }, 0)
  const stride = Math.max(2, Math.ceil(Math.sqrt(area / BANG_MAX)))
  for (const s of live) {
    const b = inCells(first[s.i])
    s.parts = []
    for (let y = 0; y < b.h; y += stride)
      for (let x = 0; x < b.w; x += stride)
        s.parts.push({
          fx: x / b.w,
          fy: y / b.h,
          spin: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.75),
          s: Math.random() * s.eaten * 0.45,
          // where it comes to rest in the point: a couple of cells of scatter,
          // so the singularity is a dense knot rather than one lit pixel
          jx: Math.round((Math.random() - 0.5) * 5),
          jy: Math.round((Math.random() - 0.5) * 5),
          c: Math.random() < 0.3 ? mute : c,
        })
  }
  run(
    frames,
    dur,
    (f) => {
      const t = f / frames
      const o = org()
      const now = boxesAt()
      for (const s of live) {
        const r = now[s.i]
        if (!usable(r)) continue
        const b = inCells(r)
        for (const p of s.parts) {
          const k = (t - p.s) / (s.eaten - p.s)
          if (k >= 1) {
            // swallowed: it stays in the point and thickens it
            ctx.fillStyle = p.c
            ctx.fillRect(Math.round(o.x + p.jx), Math.round(o.y + p.jy), 1, 1)
            continue
          }
          const hx = b.x + p.fx * b.w
          const hy = b.y + p.fy * b.h
          const dx = hx - o.x
          const dy = hy - o.y
          const r0 = Math.hypot(dx, dy)
          const u = k <= 0 ? 0 : k
          // slow, then faster the closer it gets: the radius falls off as the
          // square and a bit, which is what "pulled harder from nearby" looks
          // like without pretending to be gravity
          const rr = 1 - Math.pow(u, 2.5)
          // and it TURNS on the way in, harder as the radius closes, the way
          // anything spiralling into a well does
          const a = Math.atan2(dy, dx) + p.spin * Math.pow(1 - rr, 2) * TAU
          ctx.fillStyle = p.c
          ctx.fillRect(
            Math.round(o.x + Math.cos(a) * r0 * rr),
            Math.round(o.y + Math.sin(a) * r0 * rr),
            1,
            1
          )
        }
      }
    },
    done
  )
}

// ---- ONE MOVE, EVERYWHERE (2026-09-16) -------------------------------------
// There was an IRIS here: a pair of doors that shut over the frame, let a
// full page swap behind them and opened again, on the argument that a
// destination does not grow out of a card because it did not come out of
// one. It is gone, and so is the argument.
//
// The visitor watched themselves click the card. Telling them the page came
// from nowhere is telling them something they know to be untrue, and it cost
// the site a second transition vocabulary to say it: two ways of changing
// what is on the screen, one for pages that stand on their own and one for
// everything else, with no rule a visitor could learn that says which they
// are about to get. The rects say which thing became which on any backdrop
// and at any size, which is the whole job, so they do it for the full page
// too (app.js growFrom / shrinkTo). Consistency was worth more than the
// second effect, and the second effect was the better-looking one.
//
// The cover itself is not missed: anything that needs one is hiding a swap,
// and nothing on this site swaps a page it cannot show arriving.
