// layout.js: the canvas geometry, pure (BIBLE.md sections 2-3).
// No DOM, no globals, no randomness: same input, same output, at every
// viewport. app.js imports this for the real canvas; test/canvas-layout
// imports it in node and asserts the invariants (determinism, module snap,
// air/gutter, world bounds, resolver silence). The chrome is screen space,
// not world space (see CHROME below); test/chrome-fit holds that half.

import { PX, M } from 'multiplayer-canvas/grid'
import {
  zoomStep,
  snapZoom,
  stepZoom,
  snapCam,
  wrapPos,
  wrapSpots,
  seamAt,
  flightPath,
  flightAt,
  nearestWrap,
} from 'multiplayer-canvas/torus'
// the cell and the module, and the camera on the wrapped world, are the
// engine's (primitives/grid.js, primitives/torus.js); the site's geometry
// is everything below, and it re-exports them so one import serves both
// seam: test/chrome-fit.test.js, test/zoom-floor.test.js, test/zoom-keys.test.js
export {
  PX,
  M,
  zoomStep,
  snapZoom,
  stepZoom,
  snapCam,
  wrapPos,
  wrapSpots,
  seamAt,
  flightPath,
  flightAt,
  nearestWrap,
}

// seam: test/canvas-layout.test.js, test/pixel-type.test.js
export const MARK = 11 * PX // the maker's mark, the logo at one cell per pixel
// seam: test/bible-sync.test.js, test/canvas-layout.test.js
export const GUTTER = M // air INSIDE a block (siblings)
// seam: test/bible-sync.test.js, test/canvas-layout.test.js, test/slime.test.js
export const AIR = 2 * M // air floor BETWEEN blocks (strangers)

// the type ladder (BIBLE.md section 3): whole multiples of 16, because the
// face is drawn on a 16 grid and is crisp at those sizes and at nothing
// between. Kit and canvas read the one ladder. Line height is five quarters
// of the size, which lands every line on the cell (20, 40, 60, 80, 140).
export const LADDER = [16, 32, 48, 64, 112]
// seam: test/bible-sync.test.js
export const HERO_STEPS = [32, 48, 64]
// the slope that lands the ceiling step (64) on a desktop hero: type is the
// largest step under HERO_W * TYPE_SLOPE, never a continuous size
const TYPE_SLOPE = 0.058

/** Line height for a ladder size: five quarters, on the cell. */
export function lineHeightFor(fs) {
  return (fs * 5) / 4
}

export function heroType(heroW) {
  let fs = HERO_STEPS[0]
  for (const s of HERO_STEPS) if (s <= heroW * TYPE_SLOPE) fs = s
  return { fs, lh: lineHeightFor(fs) }
}

// hero: a screen-shaped atom, 75% of the viewport, snapped to the module.
// placeWorld puts the hero's ORIGIN on the grid (an odd module count would
// otherwise leave every centered edge half a module off).
function heroSize(vw, vh) {
  const toM = (px) => Math.max(2 * M, Math.round(px / M) * M)
  return { w: toM(vw * 0.75), h: toM(vh * 0.75) }
}

// ---- the tiles (dims in MODULE UNITS; declaration order is curation) --------
// Every tile is items-or-widgets (BIBLE.md section 5) and takes one of the
// six shapes (BIBLE.md section 3, the snap, 2026-09-27): 8x8 square, 8x5
// shelf, 5x8 portrait, 5x5 small square, 3x3 and the 2x2 icon, Fibonacci on
// the module. Each took the shape nearest the footprint it had, by aspect
// first and then area (both as log ratios), and its content refits to the
// shape, never the reverse. test/tile-vocabulary.test.js holds the list.
//
// A collection is ONE tile: a stack, which is a pile with a label and a
// count, and fans out as a route. The ground is where you meet a
// collection, the fan is where you read it. A stack's footprint is DECLARED from the
// vocabulary and the pile is composed inside it (pileGeometry below;
// test/stacks.test.js holds the arithmetic). The members keep their own
// card shapes and live in MEMBERS, seated by the fan and never by the
// world. `count` is the noun the label counts in.
export const TILES = [
  // The case studies: one stack, fanned out at /case-studies. The id stays
  // 'work' (the members, the routes and the way back out of a study all
  // name it); /work is this pile too.
  {
    id: 'work',
    type: 'stack',
    tier: 1,
    mw: 8,
    mh: 8,
    label: 'Case Studies',
    count: 'studies',
    one: 'study',
    route: '/case-studies',
    tags: ['work'],
  },
  // The zones (BIBLE.md section 5): what fits in a paragraph and a few links
  // is not a page, it is a place on the ground. Boxless, the title in the
  // display face, the doors fly the camera to them. The copy is the
  // server's (content/about.md, the text templates) and rides the boot
  // payload; the footprint is declared here and holds the longest of it.
  // about is a TRIPTYCH: three slots under the hero, side by side, the
  // ring's gap between them.
  { id: 'about', type: 'zone', tier: 1, mw: 31, mh: 8, span: 3, label: 'About', tags: ['self'] },
  // 5 x 5: the window IS the tile, sixty cells of sky square (canvas/
  // outlook.js draws it at that size and no other), and its name hangs
  // under it into the slot's slack.
  { id: 'weather', type: 'weather', mw: 5, mh: 5, label: 'The Sky', tags: ['sky'] },
  // THE SLIME MOULD (BIBLE.md section 5): a Physarum in a round dish, alive
  // on the server whether anyone is watching or not, fed by whoever taps
  // it. The tile is the 8 x 8 square and the dish is the circle that
  // circumscribes a 5 x 5 square (86 cells, 344px, canvas/slime.js DISH),
  // seated in the tile's top left corner. His name, two lines of the label
  // hand, hangs off the dish's south edge into the slot's slack. The name
  // breaks at the newline, one label line each.
  { id: 'slime', type: 'slime', mw: 8, mh: 8, label: 'Sisyphus\nthe Slime', tags: ['lab'] },
  // Maurice (BIBLE.md section 5): a ladybug the size of an icon's seat, in
  // the ground's bottom-right corner (placeWorld seats him there by hand,
  // off every ring). Click him and he is squished for everyone for five
  // minutes (the one shared hand on the presence wire).
  { id: 'maurice', type: 'bug', mw: 2, mh: 2, label: 'Maurice', tags: ['self'] },
  // the dock's marks: the feed and the address (canvas/marks.js)
  { id: 'ic-rss', type: 'icon', mw: 2, mh: 2, s: 'rss', label: 'RSS', tags: ['reading'] },
  { id: 'ic-mail', type: 'icon', mw: 2, mh: 2, s: 'mail', label: 'Mail', tags: ['self'] },
  // an experiment stands on the ground as itself (no card): its baked still
  // and its name
  {
    id: 'instruments',
    type: 'web',
    mw: 5,
    mh: 5,
    label: 'Web Instruments',
    slug: 'web-instruments',
    tags: ['music'],
  },
]

// ---- the members: what the stacks hold ----------------------------------------
// Real tiles with real card shapes, built by the same builder the world uses,
// seated by the FAN (screen space, fitted to the viewport) and never by the
// world. `stack` names the pile each one lives in. A case study's `kind` is
// the label the card prints; the page path and copy come from the boot
// payload by slug, so a new case study is one row here and one markdown file
// under content/feed/.
export const MEMBERS = [
  {
    id: 'example-case-study',
    type: 'article',
    stack: 'work',
    mw: 5,
    mh: 5,
    kind: 'case study',
    label: 'An example case study',
    slug: 'example-case-study',
    tags: ['work'],
  },
]
// seam: test/stacks.test.js
export const STACKS = TILES.filter((t) => t.type === 'stack')
// the count a pile carries on the line under its name (#339): "10 Albums",
// "1 Dataset", in the name's own Title Case. `count` is the noun for many
// and `one`, when the pile can hold a single member, the noun for one.
export function countLine(stack, n) {
  const noun = n === 1 && stack.one ? stack.one : stack.count
  return noun ? `${n} ${noun.replace(/\b\w/g, (c) => c.toUpperCase())}` : ''
}
// the shape a stack's front card has, for the footprint arithmetic
// seam: test/stacks.test.js
export const FRONT_OF = {
  work: { mw: 5, mh: 5 },
}

// ---- the pile (BIBLE.md section 5) ---------------------------------------------
// The front card stands whole; `backs` cards step behind it at one even
// vector, each PILE.step cells up and sideways, ground with a hairline, so the
// pile says "several" without showing every one. Which way the backs step is
// the stack's own: down and to the right, along the cast, so the front card
// is the top of the pile and the deepest back is its base. Below, one label block:
// the name (a tile title) and the count (the label hand). Everything
// is whole cells and the whole composition is centred in the footprint on
// the cell lattice; the footprint is declared, and stackFits() is the guard
// that the composition actually fits inside it.
// THE FOOTPRINT WINS (the snap, 2026-09-27). The footprint used to be the
// card plus the pile plus the label, snapped up; it is one of the six
// shapes now, and the pile is composed inside it. The card keeps its
// member's shape on the largest module the footprint holds, a whole number
// of cells and never more than M: a 5 x 5 study stands at its own size in
// the 8 x 8 pile.
// step: two cells behind the front, which is all the declared footprints
// hold (stackFits is six px from overflowing at three, and a stack's
// footprint is capped by its slot on the ring). What made a pile read as
// slivers was never the step: it was that each back drew its own half-cell
// ink border inside an eight px band, so four of those eight px were line.
// The backs are solid blocks now (canvas-home.css), and the step stayed.
// THE LABEL BLOCK IS TWO LINES (2026-09-25, #339): the name, and under it
// the count (countLine above), each one line of the type face (six cells,
// kit.css .k-lbl), the count a step dimmer. It was one line from
// 2026-09-16, when the count went because the backs already said how many
// and a reader could count them; the number is said now. The
// pager stays at the pile's right edge, beside the thing it turns.
// seam: test/stacks.test.js
// pagerInset: the pager stands a few cells short of the pile at each end
// (#338): a bar flush with the cards read as one more card edge
export const PILE = {
  backs: 2,
  step: 2 * PX,
  labelH: 2 * 6 * PX,
  labelGap: 2 * PX,
  pagerW: 6 * PX,
  pagerInset: 4 * PX,
}
export function pileGeometry(stack, front = dims(FRONT_OF[stack.id] || FRONT_OF.work)) {
  const foot = dims(stack)
  const spread = PILE.backs * PILE.step
  const [mw, mh] = [front.w / M, front.h / M]
  const room = Math.min(
    (foot.w - spread - PILE.labelGap - PILE.pagerW) / mw,
    (foot.h - spread - PILE.labelGap - PILE.labelH) / mh
  )
  const unit = Math.min(M, Math.floor(room / PX) * PX)
  const card = { w: mw * unit, h: mh * unit }
  const pileW = card.w + spread
  const pileH = card.h + spread
  const blockH = pileH + PILE.labelGap + PILE.labelH
  const onCell = (v) => Math.round(v / PX) * PX
  // the pile is no longer the whole composition: the pager stands off its
  // right edge, so what centres in the footprint is pile + gap + pager. It
  // was the pile alone for an hour and the pager hung 16px outside every
  // stack, which stackFits did not catch because it did not know the pager
  // existed (it does now, below).
  const compW = pileW + PILE.labelGap + PILE.pagerW
  const x0 = onCell((foot.w - compW) / 2)
  const y0 = onCell((foot.h - blockH) / 2)
  // the pile sits on the ground and the front card floats on top of it
  // (2026-09-11): every card beneath sits one PILE.step further along the
  // cast, down and to the right, which is straight down once the world
  // stands up in isometric. The front is the one that lifts (canvas-home.css
  // .t-stack:hover), the pile never moves.
  const frontX = x0
  const frontY = y0
  const backs = []
  for (let i = 1; i <= PILE.backs; i++)
    backs.push({ x: frontX + i * PILE.step, y: frontY + i * PILE.step })
  return {
    card,
    front: { x: frontX, y: frontY },
    backs, // nearest first; the last is the deepest, the base
    // the label block spans the whole pile and centres in it (2026-09-11)
    // centred on the PILE, not on the composition: the pager is a control
    // standing beside the cards, and a name that shifted right to average it
    // in read as off-centre under the thing it names
    label: { x: x0, y: y0 + pileH + PILE.labelGap, w: pileW, h: PILE.labelH },
    // and the pager stands off the pile's RIGHT edge, centred on the cards:
    // beside the thing it turns rather than under it, which is what clears
    // the foot for the name alone
    // the pager's own height depends on how many members it shows, which this
    // does not know, so it is seated on the pile's CENTRE LINE and the
    // stylesheet pulls it back half its own height (translateY(-50%)). That
    // keeps it centred on the cards for a stack of three and a stack of six
    // alike, without this file learning to count members.
    // and its length is the pile's, short by the inset at each end
    pager: {
      x: x0 + pileW + PILE.labelGap,
      y: onCell(y0 + pileH / 2),
      h: pileH - 2 * PILE.pagerInset,
    },
    block: { x: x0, y: y0, w: compW, h: blockH },
  }
}
// does the declared footprint hold the composition, on the lattice
// seam: test/stacks.test.js
export function stackFits(stack) {
  const g = pileGeometry(stack)
  const foot = dims(stack)
  // the pager is part of the composition and has to be inside the footprint
  // like everything else: it hung 16px out of every stack on 2026-09-16
  // because this checked the block and the block did not include it
  if (g.pager.x + PILE.pagerW > foot.w || g.pager.x < 0) return false
  // vertical is a centre line, not a top edge: the stylesheet centres the
  // pager on it, so what has to hold is that the line itself is inside the
  // pile, which it is by construction, and that the footprint has room for a
  // pager of the tallest stack we ship either side of it
  if (g.pager.y < 0 || g.pager.y > foot.h) return false
  return (
    g.block.x >= 0 &&
    g.block.y >= 0 &&
    g.block.x + g.block.w <= foot.w &&
    g.block.y + g.block.h <= foot.h
  )
}

// ---- the fan (BIBLE.md section 5) --------------------------------------------
// A stack fans out in SCREEN space, fitted to the viewport: the members keep
// their world card shapes and share one scale, laid in a grid under a head
// line and above the bar's band. Of every column count that could hold them,
// the one that lets the cards be largest wins (ties to fewer rows), and the
// grid centres in what is left. Below FAN.minScale the cards stop shrinking
// and the fan scrolls instead: the width picks the columns at a readable
// scale and the cards take the largest size that count allows (one column at
// true size on a phone, the way the brief asked).
export const FAN = { margin: 24, gap: 24, head: 72, minScale: 0.75 }
/**
 * @param {number} n cards
 * @param {number} cardW
 * @param {number} cardH
 * @param {number} vw
 * @param {number} vh
 * @param {number} [band] the bar's strip, which the grid must clear
 * @param {boolean} [lane] one row, scrolled sideways: the phone's reading
 * @returns {object} the grid: scale, slots, and which way it scrolls
 *
 * THE LANE (2026-09-16). A phone used to get the same fitted grid a desktop
 * does, which on a narrow screen means either two columns of small cards or a
 * long vertical stack. Neither is how a phone reads a collection: a shelf of
 * things you push sideways is, and every app a visitor already uses agrees.
 *
 * So on a phone the cards go in ONE ROW at the size the HEIGHT allows, and
 * the row runs off the screen to be scrolled. The scale is picked from the
 * height alone, which is the point: width stops being a constraint the moment
 * the row is allowed to be longer than the screen, so a card can be as big as
 * it can be rather than as small as it must be.
 */
export function fanLayout(n, cardW, cardH, vw, vh, band = 0, lane = false) {
  const { margin, gap, head, minScale } = FAN
  const availW = Math.max(1, vw - 2 * margin)
  const availH = Math.max(1, vh - head - band - 2 * margin)
  let best = null
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const s = Math.min(
      1,
      (availW - (cols - 1) * gap) / (cols * cardW),
      (availH - (rows - 1) * gap) / (rows * cardH)
    )
    if (s <= 0) continue
    if (!best || s > best.s + 1e-9 || (Math.abs(s - best.s) < 1e-9 && rows < best.rows))
      best = { cols, rows, s }
  }
  if (!best) best = { cols: 1, rows: n, s: minScale }
  let s = best.s
  let cols = best.cols
  if (s < minScale) {
    // the floor: a card is never shrunk past reading. The most columns the
    // WIDTH holds at a readable scale, then the largest scale that count
    // allows; a frame too narrow for even one readable card (a watch) gets
    // one column at whatever fits
    cols = Math.max(1, Math.min(n, Math.floor((availW + gap) / (cardW * minScale + gap))))
    s = Math.min(1, (availW - (cols - 1) * gap) / (cols * cardW))
  }
  if (lane) {
    // one row, sized by the height it has; the width is the row's, however
    // far off the screen it runs. Capped at 1 because a card is never blown
    // up past its own drawing, and at the frame between its margins because
    // a card is read whole (the snap: an 8 x 5 shelf is 384, a phone 390)
    const ls = Math.min(1, availH / cardH, availW / cardW)
    const cw = cardW * ls
    const ch = cardH * ls
    // CENTRED IN WHAT IS LEFT. The scale caps at 1, so on a tall screen the
    // row is shorter than the space it has; seating it at the head hung the
    // shelf off the title with all the slack dumped underneath.
    const ly = head + margin + Math.max(0, (availH - ch) / 2)
    // AND THE ROW OPENS ON A CENTRED CARD. The lead is half the leftover
    // width rather than the margin, so scroll position zero already has the
    // first card in the middle of the screen instead of tucked against the
    // left edge waiting to be pushed. The same lead rides the tail, which is
    // what lets the LAST card reach the middle too: a snap target that can
    // never be centred is a card the shelf will not rest on.
    const lead = Math.max(margin, (vw - cw) / 2)
    const slots = []
    for (let i = 0; i < n; i++) slots.push({ x: lead + i * (cw + gap), y: ly, w: cw, h: ch })
    return {
      cols: n,
      rows: 1,
      s: ls,
      x0: lead,
      y0: ly,
      // the row plus both leads: what the scroller must be able to reach
      w: (n - 1) * (cw + gap) + cw + lead,
      h: ch,
      slots,
      scrolls: false,
      lane: true,
    }
  }

  const rows = Math.ceil(n / cols)
  const gridW = cols * cardW * s + (cols - 1) * gap
  const gridH = rows * cardH * s + (rows - 1) * gap
  const x0 = margin + Math.max(0, (availW - gridW) / 2)
  const y0 = head + margin + Math.max(0, (availH - gridH) / 2)
  const slots = []
  for (let i = 0; i < n; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    slots.push({
      x: x0 + c * (cardW * s + gap),
      y: y0 + r * (cardH * s + gap),
      w: cardW * s,
      h: cardH * s,
    })
  }
  return {
    cols,
    rows,
    s,
    x0,
    y0,
    w: gridW,
    h: gridH,
    slots,
    scrolls: gridH > availH + 1e-9,
    lane: false,
  }
}

// ---- the routes a fan answers to -----------------------------------------------
// A fanned-out stack is a page: /case-studies. A
// case study's own path (/work/<slug>) is the work fan with that card open:
// the studies keep their addresses under work, the section they belong to.
// seam: test/stacks.test.js
export const STACK_ROUTES = Object.fromEntries(STACKS.map((t) => [t.route, t.id]))
// a zone's path lands the CAMERA on it (section 5): the page is a place.
// /work is the case studies, which is what a visitor typing it is after, and
// stackForPath below answers it.
// seam: test/zones.test.js
export const LAND_ROUTES = { '/about': 'about' }
export const LAND_PATHS = Object.fromEntries(Object.entries(LAND_ROUTES).map(([p, id]) => [id, p]))
export const landForPath = (path) => LAND_ROUTES[path.replace(/\/+$/, '') || '/'] || null
// seam: test/zones.test.js
export const ZONES = TILES.filter((t) => t.type === 'zone')
export function stackForPath(path) {
  const p = path.replace(/\/+$/, '') || '/'
  if (STACK_ROUTES[p]) return STACK_ROUTES[p]
  // /work is the studies, so the door, the path and the command all land on
  // the same pile
  if (p === '/work') return 'work'
  const m = p.match(/^\/work\/[a-z0-9-]+$/)
  return m ? 'work' : null
}

// ---- the compass (BIBLE.md section 3): neighborhoods have directions -------
// Swiping from home: up finds the made things, down finds writing,
// left finds music, right finds life (play, body, sky). A tile's home
// vector is the normalized sum of its tags' directions, so a dual-citizen
// (repo+play, music+reading) seats on the diagonal between its two
// neighborhoods instead of deep inside either. Screen y grows downward,
// so north is -1.
// THE COMPASS FOLLOWS THE LAYOUT, not the other way round: a bearing that
// points somewhere other than where the thing actually sits is worse than
// no bearing at all. A seat is a hand table (SLOTS below) and a bearing is
// arithmetic; when a seat moves, its bearing moves with it.
// seam: test/zones.test.js
export const TAG_DIR = {
  repo: [-1, 1],
  work: [1, 1],
  reading: [1, -1],
  music: [-1, 0],
  play: [1, 0],
  body: [1, 0],
  sky: [1, 0],
  // the lab: the dish where something is grown. Northwest, and the one
  // bearing that points at a corner of the ring.
  lab: [-1, -1],
  // the zones (section 5): the person's own words on the ground. The about
  // triptych is seated by hand in the middle of the foot, so its bearing
  // places nothing.
  self: [-1, 1],
}
// seam: test/canvas-layout.test.js, test/zones.test.js
export function homeVec(t) {
  let x = 0,
    y = 0
  for (const tag of t.tags || []) {
    const d = TAG_DIR[tag]
    if (d) {
      x += d[0]
      y += d[1]
    }
  }
  const n = Math.hypot(x, y)
  return n ? [x / n, y / n] : null
}

// px dims for a tile (module units x M)
export const dims = (t) => ({ w: t.mw * M, h: t.mh * M })

// ---- the fixed world --------------------------------------------------------
// One world for every device: the solve is deterministic and viewport-blind.
// DESIGN_VIEW sizes only the home-camera chrome band and the view floors;
// devices adapt by zooming the camera, not by reshaping the world, so world
// coordinates mean the same thing on a phone and a billboard and cursor sync
// is a straight fraction.
const DESIGN_VIEW = { w: 1800, h: 900 }
// the hero is the design-view atom slimmed to 2/3 on both axes (the fit
// zoom frames its width, the height hugs statement + doors)
export function heroFixed() {
  const h = heroSize(DESIGN_VIEW.w, DESIGN_VIEW.h)
  const toM = (v) => Math.round(v / M) * M
  return { w: toM((h.w * 2) / 3), h: toM((h.h * 2) / 3) }
}
const snap = (v) => Math.round(v / M) * M

// ---- placement: tiered shells (BIBLE.md sections 2-3) -----------------------
// The world is concentric: radius is importance, angle is the tag compass.
// Icons ring the hero tightest (the old satellite ring, made law for every
// tier), then widgets, then feed items on the outermost. Within a (tier,
// direction) group tiles fan evenly across their wedge, sorted by id:
// wedges, not stacks, and no randomness anywhere. A
// toroidal push-apart with the strangers' AIR (plus one module so the snap
// can never pull a pair back under the floor) settles the rings around the
// hero, the only fixed body; the ground is then CUT to the settled content
// plus a seam per side, so the torus reads as things, a corridor, things
// again, with no ocean on any axis.
// Placement is VERIFIED, not hoped: a pairwise min-image gap check counts
// every pair under the floor, and a nonzero count widens the seam and
// re-verifies. Same input, same world, every time.

// The opening frame, derived (no magic camera numbers): the first thing a
// visitor sees contains the hero with a gutter each side and the icon belt
// vertically, so the world is visibly a world from frame one; the widget
// ring peeks at the edges as the invitation to move. app.js fits the
// camera to whichever axis binds (a phone holds the statement, a desktop
// holds the belt) and the camera floors at cover as always.
export function openFrame() {
  const b = openBlock({ x: 0, y: 0, ...heroFixed() })
  return {
    w: b.w + 2 * GUTTER,
    h: b.h + 2 * GUTTER,
  }
}

// ---- the dock: the icons in a row under the hero ------------------------------
// The icons are a DOCK: rows of the 2x2 glyphs centred under the hero, as
// wide as it, an air below it, nothing behind them. The dock's box is a
// fixed body like the hero (the rings keep their air from it) and the
// icons are its furniture: seated on the cell inside it, never by the
// compass, and nothing else is measured against them. Its order is the
// hand's.
// seam: test/canvas-layout.test.js
export const DOCK = {
  rows: [2],
  pitch: 3 * M, // a glyph every three modules: the longest name fits its slot
  pad: 0, // nothing over or under the rows: the box is the rows
  order: ['ic-rss', 'ic-mail'],
}
// seam: test/canvas-layout.test.js
export const dockBox = (hero) => ({
  x: hero.x,
  y: hero.y + hero.h + AIR, // the etched tally overhangs the hero's foot; this clears it by an air

  w: hero.w,
  h: DOCK.rows.length * 2 * M + 2 * DOCK.pad,
})
// every icon's seat inside the dock, keyed by id; an icon the hand did not
// order rides last, and the guard says how many rows there are room for
// seam: test/canvas-layout.test.js
export function dockSlots(hero, icons) {
  const d = dockBox(hero)
  const rank = (t) => {
    const i = DOCK.order.indexOf(t.id)
    return i < 0 ? DOCK.order.length : i
  }
  const ordered = [...icons].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1))
  const out = {}
  let i = 0
  DOCK.rows.forEach((n, r) => {
    const row = ordered.slice(i, i + n)
    i += n
    // the row's footprint is (n - 1) pitches plus the last glyph's own width
    const x0 = d.x + Math.round((d.w - ((n - 1) * DOCK.pitch + 2 * M)) / 2 / PX) * PX
    row.forEach((t, j) => {
      out[t.id] = { x: x0 + j * DOCK.pitch, y: d.y + DOCK.pad + r * 2 * M }
    })
  })
  return { box: d, slots: out, overflow: ordered.slice(i).map((t) => t.id) }
}
// the hero and its dock, one block: what the opening frame holds and what
// the home camera centres on
export const openBlock = (hero) => {
  const d = dockBox(hero)
  return { x: hero.x, y: hero.y, w: hero.w, h: d.y + d.h - hero.y }
}

// ---- the hero's furniture (BIBLE.md section 4) ------------------------------
// The doors row and the etched mark ride the hero rather than the solver's
// shells. Until 2026-08 they were also the only two nodes in the world whose
// SEAT came out of a DOM measurement instead of a derivation: app.js read
// offsetWidth, and when the read came back 0 (offsetWidth is 0 on any
// display:none subtree, and the hero system hides when panned off screen)
// both seating functions returned early. That did not leave the row unplaced.
// It left it at its initialised 0,0, which is the WORLD ORIGIN, most of a
// world away from the hero and directly on top of whatever tile the shells
// seated there. "work and about landing on top of an entry" is that sentence.
//
// So the furniture is derived like everything else in this file, and the
// derivation costs nothing visually: each row spans the hero's FULL WIDTH and
// centres its own contents in CSS. The world box needs no text metric, the
// buttons still hug their labels, and the centre line lands where the
// measured version put it, because both centre on the hero.
// one line of the type face at the label's 16: six cells (kit.css .k-meta)
// seam: test/canvas-widgets-kit.test.js
export const TYPE_LINE = 6 * PX
const FURNITURE = {
  // THE DOORS ARE GONE (2026-09-16). Two buttons under the statement, work
  // and about, existed because the ground was not legible on its own: they
  // were shortcuts past a layout nobody could read. The layout says it now
  // (the studies stand beside the about triptych),
  // and a shortcut past a thing that is already obvious is furniture with
  // nothing behind it. The instruction and the tally move up into the space
  // they left, which is all the space they ever needed.
  south: 80, // the hero's south line, where the doors used to sit
  etchGap: 0, // the mark sits ON the south line now, not a row below it
  // the mark is the instruction block, sp-6, then the tally: two lines of
  // the type face (how the canvas moves, and that it wraps; #336, the pixel
  // face is for the hero alone), then the kit's small flaps, one type line
  // tall
  markH: 2 * TYPE_LINE + 24 + TYPE_LINE,
}
// The mark hangs off the hero's south line.
export const etchedBox = (hero) => ({
  x: hero.x,
  y: hero.y + hero.h - FURNITURE.south + FURNITURE.etchGap,
  w: hero.w,
  h: FURNITURE.markH,
})

// ---- screen-space chrome (BIBLE.md section 8) -------------------------------
// The bar is SCREEN furniture: fixed pixels that do not scale with the camera.
// So a WORLD reservation for it cannot be right at more than one zoom, and the
// retired one (a single 108-world-px band solved against DESIGN_VIEW) was not.
// Measured against the opening frame: a 184x224 watch opens at 0.1825 and
// needs 285 world px for the bar, a 1440x900 laptop opens at 0.8929 and needs
// 68. Reserving the worst case would have surrendered 28% of the opening
// frame on every device to serve the smallest one. So the world reserves
// NOTHING and the opening CAMERA fits into the screen minus this band
// instead: same tiles, same coordinates, every visitor, and the worst cost
// is a 6.7% apparent shrink (the laptop, where the height binds).
//
// Density is three discrete states, never a fluid scale. Discrete keeps the
// measures deterministic and guardable, which is the property the retired
// "nothing shrinks by viewport" law was actually protecting.
export const CHROME = {
  inset: 24, // --cv-sp-6: the bar's inset from the screen's sides
  foot: 48, // --cv-module: the bar's foot line, shared with the map (2026-09-11)
  gap: 12, // --cv-sp-3: between the field and the close button beside it
  h: 44, // --cv-ctrl-h: the control height at phone and desktop
  // the omni field's one fixed measure. Air comes from the inset, not from a
  // wider field: a wider field pushes a phone under BAR_MIN_W and loses its chrome
  searchW: 200,
  // the map: four modules, the world's 960 cells at ten to one on the map's
  // own 2px cell. Under the field's measure, so on a phone it takes the
  // field's slot rather than a slot of its own.
  mapW: 4 * M,
}
// The map is open on a desktop and on a phone, where it is the finger's
// trackpad: a phone's middle slot is the map's until a thumb taps the
// search icon, since most visits never search and one that wants to knows
// to reach for the icon first. No map at all on a watch, which has no chrome.
// seam: test/canvas-layout.test.js
export const mapOpenAt = (density) => density === 'desktop' || density === 'phone'
// Whether the field and the map take turns in one slot. Only a phone: a
// desktop's map has its own corner, so its toggle never touches the field
// (#303 review: toggling the map slid the search bar a module on a desktop).
// seam: test/canvas-layout.test.js
export const slotShared = (density) => density === 'phone'
// The width the bar needs. The bar is the field (2026-09-10: the logo and the
// menu left it, home is Esc or /home or a tap on the map, the doors are the
// sections, the bulb is on the ground), and a CLOSE joins it while a sheet or
// a fan is up. The field is absolutely CENTRED, so the close's column binds
// both sides: 200 + 2 x (24 + 44 + 12) = 360. Under it the close would land
// on the field, which is exactly the overlap the three-control bar had.
// seam: test/chrome-fit.test.js
export const BAR_MIN_W = CHROME.searchW + 2 * (CHROME.inset + CHROME.h + CHROME.gap)
// The height at which a full control plus its inset claims a quarter of the
// screen: 4 x (44 + 24) = 272. A 224px watch is over that line at 30.4%.
// seam: test/chrome-fit.test.js
export const BAR_MIN_H = 4 * (CHROME.h + CHROME.inset)
// Desktop begins where the viewport can hold the opening frame at 1:1.
// seam: test/chrome-fit.test.js
export const DESKTOP_MIN_W = openFrame().w
// watch when either axis fails the bar, then phone, then desktop. One ordered
// axis, three states; canvas-home.css mirrors these two thresholds in one
// media query and test/chrome-fit fails the build if they drift.
export function chromeDensity(vw, vh) {
  if (vw < BAR_MIN_W || vh < BAR_MIN_H) return 'watch'
  return vw < DESKTOP_MIN_W ? 'phone' : 'desktop'
}
// The strip the bar owns, in SCREEN px: the controls plus their inset from
// the screen's foot. The opening camera subtracts it, and the lens keeps its
// matches out of it.
//
// A watch owns NOTHING, and this is not a tuning. Two rounds of shrinking the
// bar to fit shipped and neither worked: on a real watch the chrome sat over
// the canvas and none of it did anything, which is the whole report. Nothing
// it offered was missing from the ground either (the mark is stamped over the
// hero, work and about ride under it, the lens serves a keyboard that screen
// does not have). So under either threshold the chrome is absent, not
// smaller, and the band is zero: the opening camera fits the frame to the
// WHOLE screen, which makes the smallest screen the only one that sees the
// world with nothing subtracted from it.
export const chromeBand = (vw, vh) =>
  chromeDensity(vw, vh) === 'watch' ? 0 : CHROME.foot + CHROME.h

// ---- camera flights: van Wijk & Nuij's optimal pan-zoom path ---------------
// "Smooth and Efficient Zooming and Panning" (InfoVis 2003). Pure math, no
// DOM: app.js drives it per frame and the unit tests hold it to the ground
// (exact landing, monotone ground track, one crest). w is the viewport
// width in world units, u the distance along the pan line; rho is the
// zoom/pan tradeoff at the ground's recommended sqrt(2). A hop with no
// ground to cover degenerates to a straight ray in zoom.
// ---- how far out a screen may pull ------------------------------------------
// Everywhere else the floor is COVER: zoom out until the world fills the
// screen and no further, so there is never void beyond the ground. A watch
// cannot afford that floor, and the reason is arithmetic rather than taste.
// Measured at 205x251 against the real world (3840x3408):
//
//   floor        z        tiles on screen   view/world
//   fit        0.2034           9              10%
//   fit/1.5    0.1356          17              21%
//   fit/2      0.1017          28              38%
//   cover      0.0737          32              72%
//
// Cover is only 2.76x out from the opening frame on that screen, because the
// world is nearly square and so is the watch. So "all the way out" puts the
// entire world on a 1.9 inch display: every tile mounted, every image decoded,
// and the view height (3405) within three pixels of the world height (3408),
// which is the exact condition under which the toroidal wrap emits a SECOND
// copy of every tile. Safari reloads the page, then gives up.
//
// The floor holds the opening frame at half its linear size, which is one
// honest step out rather than a tuned number, and lands on 17 tiles. The
// canvas is the same canvas: same world, same coordinates, same everything a
// bigger screen sees. A wrist just does not get to see all of it at once.
// seam: test/zoom-floor.test.js
export const WATCH_ZOOM_OUT = 1.5
// seam: test/zoom-floor.test.js
export function zoomFloor(vw, vh, world) {
  const cover = Math.max(vw / world.w, vh / world.h)
  if (chromeDensity(vw, vh) !== 'watch') return cover
  const frame = openFrame()
  const fit = Math.min(vw / frame.w, Math.max(1, vh - chromeBand(vw, vh)) / frame.h)
  // never BELOW cover: a floor that showed void would trade one bug for another
  return Math.max(cover, fit / WATCH_ZOOM_OUT)
}

// ---- the camera's rest bounds, on the ladder --------------------------------
// The floor snaps UP the ladder (a rung below it would show a repeat) and the
// opening fit snaps DOWN (a rung above it would overflow the frame). Where
// the two land on different rungs the floor used to win the clamp and the
// opening frame overflowed the screen: a true 205px watch at 2x fits at
// 0.203, whose rung down is 0.125, while its watch floor (fit/1.5 = 0.136)
// climbed to 0.25, so the camera opened at 0.25 with the doors row off the
// screen. A screen is always allowed the frame it opens on, so the watch's
// extra step out yields to the fit's rung. COVER never yields: below it the
// view is longer than the world and would hold one place twice. But it only
// climbs the ladder where there is one: under a device pixel per cell
// nothing is crisp anyway, and it keeps its raw value there.
//
// THE WRIST'S CAP (2026-09-12). A watch that does not zoom out does not die:
// measured on the device after every other cause was struck off (zoom
// inputs, page weight, compositing layers, presence). What kills it is the
// world in view, so at the watch density the camera never holds more than
// WATCH_SLOTS slots across, whatever the opening frame would have fit. Two
// still died twice in a minute on the Ultra; one slot is the floor now. The
// hero overflows a 320px screen there and the wrist pans; the instruments run and
// the crown scrolls a sheet, which is the trade. (The device lies about
// itself: 320x240 at 2x is the adapted layout, the panel is 205x154 pt.)
// seam: test/zoom-floor.test.js
export const WATCH_SLOTS = 1
// THE HONEST TORUS. The world wraps, and the wrap is the point: a pan goes
// on forever in every direction. What it may never do is show one place
// twice. So the camera goes out as far as it logically can and no further:
// until the view first reaches the world's width or its height (cover), and
// the floor snaps UP the ladder, so the rung it rests on never shows past one
// world. A view no longer than the world holds each world point at most
// once, and freedom is the rest of the contract: nothing is held back for
// the look of it. What that costs is the tile the view's edge cuts: its
// remaining part is at the opposite edge, where the world starts again, so
// it is drawn there too, as a live copy that shows the other half of the
// same tile and never the same half twice (wrapSpots, app.js mirror).
// It used to go out to the whole width, past one world on every screen that
// is not the ground's shape: a phone held the hero three times over.
export function cameraBounds(vw, vh, world, dpr = 1, maxZ = 1.5) {
  const frame = openFrame()
  const fitRaw = Math.min(vw / frame.w, Math.max(1, vh - chromeBand(vw, vh)) / frame.h)
  const fit = Math.min(maxZ, snapZoom(fitRaw, dpr, 'down'))
  const cover = Math.max(vw / world.w, vh / world.h)
  const coverRest = cover < zoomStep(dpr) ? cover : snapZoom(cover, dpr, 'up')
  const floor = snapZoom(zoomFloor(vw, vh, world), dpr, 'up')
  let minZ = Math.min(maxZ, Math.max(coverRest, Math.min(floor, fit)))
  if (chromeDensity(vw, vh) === 'watch') {
    const span = WATCH_SLOTS * BENTO.unit + (WATCH_SLOTS - 1) * BENTO.gap
    minZ = Math.min(maxZ, Math.max(minZ, snapZoom(vw / span, dpr, 'up')))
  }
  // cover outranks the ceiling too: a screen wider than the world at maxZ
  // sits at cover and does not zoom at all
  minZ = Math.max(minZ, coverRest)
  // minZ is where TILES stop mounting, and on the wrist it stays exactly
  // where the crashes put it. The CAMERA goes on out to cover on every
  // screen; past minZ nothing mounts and the world is drawn as a plan
  // (app.js drawPlan), one canvas whatever is in view.
  const outZ = Math.min(minZ, coverRest)
  const mountZ = MOUNT_OUT[chromeDensity(vw, vh)] ? outZ : minZ
  return { minZ, fit: Math.max(minZ, fit), outZ, mountZ }
}
// WHO MOUNTS ALL THE WAY OUT (2026-09-23). Past minZ the plan used to paint
// one flat fill per footprint, and at full width that is all anyone saw:
// blobs. So the mount floor was measured instead of assumed
// (scripts/verify/zoom-out-cost.mjs, headless Chrome, every tile mounted at
// the full width the camera then reached, against the plan, a 120-frame pan
// across the world; the clones were the torus copies it faked then):
//
//   density   elements        tiles + clones   render/frame   style+layout
//   desktop   1161 -> 2493     26 +  49         0.3 ms         37 ms / 120
//   phone     1161 -> 4565     26 + 158         0.2 ms         72 ms / 120
//   watch     1161 -> 2154     26 +  50         0.2 ms         46 ms / 120
//
// Under a millisecond a frame everywhere, so a desktop and a phone mount the
// real world all the way out (cover holds no more of it than the world
// once) and minZ keeps only its other jobs (the opening fit, /map). The
// watch is the exception the numbers cannot clear: its crash was memory on
// the wrist, which headless Chrome never has to find, so it keeps
// WATCH_SLOTS and the plan draws past it.
// seam: test/zoom-floor.test.js
export const MOUNT_OUT = { desktop: true, phone: true, watch: false }
// whether a camera at z mounts tiles, or shows the plan
// seam: test/canvas-layout.test.js
export const mountsAt = (z, minZ) => z >= minZ - 1e-9

// ---- THE BENTO (2026-09-11, BIBLE.md section 3) -------------------------------
// The world is a ring of SLOTS around the hero's block, on a coarse grid:
// a slot is nine modules square, the gutter between slots is the
// strangers' AIR, and the ring is seven slots across by four down with the
// hero and its dock in the hole. A tile keeps its own size and sits CENTRED
// in its slot, on the cell lattice; a slot may stay empty. Nothing is
// solved: SLOTS is the hand's table, (column, row) on the ring, chosen by
// the compass (TAG_DIR) and checked by the guard. Positions are arithmetic;
// the invariants are law.
export const BENTO = { unit: 9 * M, gap: AIR, cols: 7, rows: 4 }
// ---- THE GROUND IS A SCREEN (2026-09-15) --------------------------------------
// The world is 3840 x 2160: 16:9, and at one cell a pixel exactly 960 x 540
// CELLS. The ground is a 4K screen whose pixel is the logo's pixel, which is
// the whole point of a board you can paint on: a person can say where a
// thing is in whole cells, and the count is a number a person can hold.
//
// The ring is seated inside it at the NEAR corner of the wrap corridor, not
// centred in it, and that is arithmetic rather than taste: slot origins and
// the ground's own box both have to land on the 48px module (the guard holds
// both), and with a 9-module slot and the strangers' AIR between slots there
// is NO 16:9 ground whose leftover splits evenly into modules on both axes.
// So the leftover is spent as a corridor of 5 modules across and 3 down, and
// the ring sits 2 modules in from the west and 1 from the north; where the
// origin sits inside a corridor is invisible on a torus, only the corridor's
// width is seen. The wrap is tight on purpose: the board reads edge to edge.
const GROUND = { w: 3840, h: 2160 }
// seam: test/canvas-layout.test.js
export const SEAM = { x: 2 * M, y: 1 * M }
// THE CORNERS ARE MOSTLY EMPTY. A ring with its corners packed reads as a
// border around the hero, and the hole in the middle stops being a hole;
// leaving the corners as ground lets the shape breathe and gives the eye
// somewhere to rest at the turns. The northwest corner is the exception,
// and it is the shape that earns it: the slime mould's dish is the one
// round thing on the ground, and a round thing at a turn of the ring reads
// as the turn, not as a border.
// seam: test/canvas-layout.test.js, test/slime.test.js
// A seat is (column, row) on the ring, and an optional third number: a
// NUDGE in whole modules along the row, so a seat can leave its slot's
// centre without leaving the module lattice (the guard holds the slot's
// origin on the module either way). A fourth is the same nudge down the
// column (negative is up), whole modules too.
export const SLOTS = {
  // the northwest corner: the dish
  slime: [0, 0],
  // the top row, north: the made things over the hero, the case studies
  // beside them (the triptych below is wide, so the pile balances it up here)
  instruments: [3, 0],
  work: [5, 0],
  // the east side: the sky
  weather: [6, 1],
  // the foot: the about triptych in the middle (it spans three slots)
  about: [2, 3],
}
// a tile's seat inside its slot: centred, on the cell. A tile with `span`
// takes that many slots across (and the gaps between them) as one box and
// centres in that; the slots it covers stay unseated in SLOTS.
const onCell = (v) => Math.round(v / PX) * PX
// A ZONE'S NAME IS PART OF ITS SEAT (the snap, 2026-09-27). The name stands
// over the cut (canvas-home.css .ztitle): the display face's twelve rows at
// a cell a pixel (pixel-type.js FACES.display), and sp-4 of ground under
// them. The name and the cut centre in the slot as one block, the way a
// pile centres with its label: centring the cut alone left the name where
// the bar's top edge cut through it at a laptop's opening camera
// (test/chrome-fit.test.js walks the matrix).
// seam: test/chrome-fit.test.js, test/canvas-layout.test.js
export const ZONE_TITLE = { h: 12 * PX, gap: 4 * PX }
// seam: test/canvas-layout.test.js
export const spanBox = (t) => {
  const cols = t.span || 1
  return { w: cols * BENTO.unit + (cols - 1) * BENTO.gap, h: BENTO.unit }
}
const slotAt = (c, r, nudge = 0, drop = 0) => ({
  x: SEAM.x + c * (BENTO.unit + BENTO.gap) + nudge * M,
  y: SEAM.y + r * (BENTO.unit + BENTO.gap) + drop * M,
})
export function placeWorld({ tiles: all, hero }) {
  // the icons are the dock's furniture, and the bug lives in the corner
  const icons = all.filter((t) => t.type === 'icon')
  const bug = all.find((t) => t.id === 'maurice')
  const tiles = all.filter((t) => t.type !== 'icon' && t.id !== 'maurice')
  const ringW = BENTO.cols * BENTO.unit + (BENTO.cols - 1) * BENTO.gap
  const ringH = BENTO.rows * BENTO.unit + (BENTO.rows - 1) * BENTO.gap
  const { w: W, h: H } = GROUND
  // the hole: between the side columns and between the top and foot rows,
  // the hero's block centred in it (a whole number of modules each way,
  // which the unit, the gap and the hero's own measures guarantee)
  const block = openBlock({ x: 0, y: 0, w: hero.w, h: hero.h })
  const holeX = SEAM.x + BENTO.unit + BENTO.gap
  const holeW = ringW - 2 * (BENTO.unit + BENTO.gap)
  const holeY = SEAM.y + BENTO.unit + BENTO.gap
  const holeH = ringH - 2 * (BENTO.unit + BENTO.gap)
  const heroRect = {
    x: snap(holeX + (holeW - hero.w) / 2),
    y: snap(holeY + (holeH - block.h) / 2),
    w: hero.w,
    h: hero.h,
  }
  const out = {
    tiles: {},
    hero: { x: heroRect.x, y: heroRect.y },
    world: { w: W, h: H },
    violations: 0,
  }
  for (const t of tiles) {
    const s = SLOTS[t.id]
    if (!s) {
      out.violations++
      continue
    }
    const at = slotAt(s[0], s[1], s[2], s[3])
    const d = dims(t)
    const box = spanBox(t)
    const name = t.type === 'zone' ? ZONE_TITLE.h + ZONE_TITLE.gap : 0
    out.tiles[t.id] = {
      x: at.x + onCell((box.w - d.w) / 2),
      y: at.y + onCell((box.h - d.h - name) / 2) + name,
    }
  }
  out.tiles.dock = { x: dockBox(heroRect).x, y: dockBox(heroRect).y }
  const { slots } = dockSlots(heroRect, icons)
  for (const t of icons) out.tiles[t.id] = slots[t.id] || { x: 0, y: 0 }
  // Maurice: the ground's bottom-right corner, flush with both edges. Off
  // every ring, which is the whole point of him.
  if (bug) {
    const d = dims(bug)
    out.tiles[bug.id] = { x: W - d.w, y: H - d.h }
  }
  return out
}
