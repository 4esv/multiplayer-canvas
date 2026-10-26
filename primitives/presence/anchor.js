// multiplayer-canvas/presence/anchor: a cursor place on a page of blocks, independent of the
//   reader width.
// Inputs: block boxes (rects) and a pointer position, or an anchor.
// Outputs: anchorOf / pointOf convert between a point and { i, fx, fy }; selections and page
//   places too. Pure.
//
// A cursor's place on a PAGE, and the way back. Pure: it reads
// boxes and returns numbers, so the same arithmetic runs in a test with
// rects written by hand and in the browser with rects read off the sheet.
//
// A page is a column of blocks (the heading, the meta line, a paragraph, a
// figure, a code block) and a block is the SAME block at every width: the
// paragraph that is third on a phone is third on a billboard, only its box
// is a different shape. So a position on a page is not a pixel and not a
// fraction of the document (which reflows), it is the nearest block and a
// fraction of that block's box. Two readers at different widths hand each
// other the same word.
//
// The wire form is one string, `slug#index`, the grammar the server checks
// (primitives/presence/presence-protocol.js isAt). That module is the server's and the
// browser never loads it, so the grammar is stated here as well and
// test/presence.test.js holds the two together.
const AT = /^([a-z0-9][a-z0-9-]{0,47})#([0-9]{1,3})$/

/**
 * The wire form of a page position.
 * @param {string} slug the page
 * @param {number} i the block index
 * @returns {string|null} `slug#i`, or null if either would not pass the server
 */
export function atOf(slug, i) {
  const at = `${slug}#${i}`
  return AT.test(at) ? at : null
}

/**
 * Read a wire anchor.
 * @param {string|null|undefined} at
 * @returns {{slug:string, i:number}|null}
 */
export function parseAt(at) {
  const m = typeof at === 'string' ? AT.exec(at) : null
  return m ? { slug: m[1], i: Number(m[2]) } : null
}

/**
 * The page part of an anchor, or '' for the canvas: the PLACE a peer is in,
 * which is what decides whether this tab draws it.
 * @param {string|null|undefined} at
 * @returns {string}
 */
export const placeOf = (at) =>
  typeof at === 'string' && at.includes('#') ? at.slice(0, at.indexOf('#')) : ''

// A fraction just under one: the server's range is [0,1) and a pointer on a
// block's far edge must stay inside it.
const TOP = 1 - 1 / 4096

/**
 * Anchor a point to the blocks of a page.
 * @param {{x:number, y:number, width:number, height:number}[]} rects the blocks' boxes, in document order, in any one coordinate space
 * @param {number} x a point in that same space
 * @param {number} y
 * @returns {{i:number, fx:number, fy:number}|null} the nearest block and the point as fractions of its box, or null with no blocks
 *
 * Nearest by vertical distance, because a page is a column: a pointer in
 * the gutter beside a paragraph is on that paragraph, at a fraction past
 * its edge, and clamped so the wire will carry it. A block of no height
 * (an empty script tag, a collapsed figure) is never nearest, since a
 * fraction of nothing is nowhere.
 */
export function anchorOf(rects, x, y) {
  let best = -1
  let dist = Infinity
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    if (!(r.height > 0) || !(r.width > 0)) continue
    const d = y < r.y ? r.y - y : y > r.y + r.height ? y - r.y - r.height : 0
    if (d < dist) {
      dist = d
      best = i
    }
  }
  if (best < 0) return null
  const r = rects[best]
  const clamp = (f) => Math.min(TOP, Math.max(0, f))
  return { i: best, fx: clamp((x - r.x) / r.width), fy: clamp((y - r.y) / r.height) }
}

/**
 * The point an anchor names, given the block's box in the reader's space.
 * @param {{x:number, y:number, width:number, height:number}} rect
 * @param {number} fx
 * @param {number} fy
 * @returns {{x:number, y:number}}
 */
export function pointOf(rect, fx, fy) {
  return { x: rect.x + fx * rect.width, y: rect.y + fy * rect.height }
}

// ---- a SELECTION on a page: shared highlighting ------------------------------
// A reader who selects words on a page shows them to everyone reading it, in
// their own hue. The position rides the same blocks as the pointer does, and
// for the same reason: a block is the same block at every width. Inside it,
// the place is not a fraction of the box but a count of characters into the
// block's text, which is the one measure a reflow cannot move: the phone
// breaks the paragraph into nine lines and the desktop into four, and the
// fortieth character is the fortieth on both.
//
// The wire form, all of it:
//   { at: 'slug#i', a, j, b, q, z }
// the first block and the character it starts at, the last block and the
// character it ends before, and a few characters of the words at each end.
// The quote is the check: a reader whose page says something else at those
// offsets (an edited entry, a block that renders live text of its own) draws
// nothing rather than the wrong words. A missing highlight is honest; a
// highlight on the wrong words tells the room something that is not true.
// The grammar is the server's (primitives/presence/presence-protocol.js parseSel), stated
// here too because the browser never loads that module, and
// test/presence.test.js holds the two together.

// seam: test/shared-highlight.test.js
/** characters of quote at each end of a selection */
export const QUOTE = 8
// seam: test/shared-highlight.test.js
/** a character offset past this is not an offset anybody's page has */
export const SEL_OFF_MAX = 1 << 20

/**
 * Where a character offset into a block falls among the block's text nodes.
 * @param {number[]} lens the lengths of the block's text nodes, in document order
 * @param {number} o the offset into the block's text
 * @returns {{n:number, o:number}|null} the node and the offset into it, or null past the end
 *
 * An offset on a seam between two nodes is the end of the first: the same
 * point in the text either way, and the one that exists when the second
 * node is the last.
 */
export function splitAt(lens, o) {
  let acc = 0
  for (let n = 0; n < lens.length; n++) {
    if (o <= acc + lens[n]) return { n, o: o - acc }
    acc += lens[n]
  }
  return null
}

/**
 * The way back: a node and an offset into it, as an offset into the block.
 * @param {number[]} lens
 * @param {number} n
 * @param {number} o
 * @returns {number}
 */
export function offsetOf(lens, n, o) {
  let acc = 0
  for (let k = 0; k < n; k++) acc += lens[k]
  return acc + o
}

// the words at the head and the tail of a selection, cut the same way on
// both sides of the wire and never past the selection itself (the head
// stops at its end, the tail never reaches back past its start)
const headOf = (texts, i, a, j, b) =>
  texts[i].slice(a, i === j ? Math.min(a + QUOTE, b) : a + QUOTE)
const tailOf = (texts, i, a, j, b) => texts[j].slice(Math.max(i === j ? a : 0, b - QUOTE), b)

/**
 * A selection on a page, as the wire carries it.
 * @param {string} slug the page
 * @param {string[]} texts every block's text, in document order
 * @param {{i:number, o:number}|null} s where the selection starts: a block and an offset into its text
 * @param {{i:number, o:number}|null} e where it ends
 * @returns {{at:string, a:number, j:number, b:number, q:string, z:string}|null} null for nothing selected
 *
 * Ends that sit on nothing are pulled in first: a triple-click selects a
 * paragraph up to the very start of the next block, and that next block
 * holds none of the selection, so the end steps back to the close of the
 * last block that does (and a start on the close of a block steps on).
 */
export function selOf(slug, texts, s, e) {
  if (!s || !e) return null
  let { i, o: a } = s
  let { i: j, o: b } = e
  if (!(i >= 0 && j < texts.length && i <= j)) return null
  while (j > i && b === 0) b = texts[--j].length
  while (i < j && a >= texts[i].length) {
    i++
    a = 0
  }
  if (i === j && a >= b) return null
  if (a > texts[i].length || b > texts[j].length || b >= SEL_OFF_MAX) return null
  const at = atOf(slug, i)
  if (!at || j > 999) return null
  return { at, a, j, b, q: headOf(texts, i, a, j, b), z: tailOf(texts, i, a, j, b) }
}

/**
 * Read a selection back onto THIS reader's page, or refuse.
 * @param {{at:string, a:number, j:number, b:number, q:string, z:string}|null} sel off the wire
 * @param {string|null} slug the page this reader has open
 * @param {string[]} texts its blocks' text, in document order
 * @returns {{i:number, a:number, j:number, b:number}|null} the blocks and offsets, or null to draw nothing
 *
 * Null for another page, for blocks this page does not have, for offsets
 * past a block's end, and for any page whose words at the two ends are not
 * the words the selector saw.
 */
export function rangeOfSel(sel, slug, texts) {
  const at = parseAt(sel?.at)
  if (!at || at.slug !== slug) return null
  const { i } = at
  const { a, j, b, q, z } = sel
  if (!(j >= i && j < texts.length)) return null
  if (!(a <= texts[i].length && b <= texts[j].length) || (i === j && a >= b)) return null
  if (headOf(texts, i, a, j, b) !== q || tailOf(texts, i, a, j, b) !== z) return null
  return { i, a, j, b }
}
