// SHARED HIGHLIGHTING: the words other readers of this page have selected,
// drawn in each reader's hue (the cursor's, presence.js colorOf, the one
// sanctioned palette exception). The arithmetic is anchor.js (selOf,
// rangeOfSel); this is the DOM on either side of it.
//
// It reads the page and never writes it. A peer's selection is painted with
// the CSS Custom Highlight API: a Range over the page's own text nodes,
// registered by name in CSS.highlights and coloured by a ::highlight() rule,
// so no element is added, split or wrapped. A reader's own selection, a
// script on the page holding a node, a copy of the text: none of them can
// tell a highlight is there. A browser without the API draws nothing, and
// there is no fallback that marks up the page instead, because that
// fallback is the thing this module exists not to do
// (test/shared-highlight.test.js reads this file for it).
import { offsetOf, rangeOfSel, selOf, splitAt } from 'multiplayer-canvas/presence/anchor'

// every text node of a block, in document order
function textsIn(block) {
  const nodes = []
  const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  for (let t = walk.nextNode(); t; t = walk.nextNode()) nodes.push(t)
  return nodes
}
const lensOf = (nodes) => nodes.map((t) => t.data.length)
const textOf = (nodes) => nodes.map((t) => t.data).join('')

// A range boundary as a block and an offset into its text. A boundary
// between blocks (in a wrapper, or on the sheet itself) is pulled onto the
// nearest block on the selection's side of it: the start onto the next
// block's first character, the end onto the last block's close.
function pointIn(blocks, texts, container, offset, isEnd) {
  const at = document.createRange()
  at.setStart(container, offset)
  const order = isEnd ? blocks.map((_, k) => blocks.length - 1 - k) : blocks.map((_, k) => k)
  for (const i of order) {
    const b = blocks[i]
    if (b.contains(container)) {
      const nodes = texts[i]
      const lens = lensOf(nodes)
      if (container.nodeType === Node.TEXT_NODE) {
        const n = nodes.indexOf(container)
        return n < 0 ? null : { i, o: offsetOf(lens, n, offset) }
      }
      // an element boundary: the text of every node that ends at or before it
      let o = 0
      for (const t of nodes) if (at.comparePoint(t, t.data.length) <= 0) o += t.data.length
      return { i, o }
    }
    const whole = document.createRange()
    whole.selectNodeContents(b)
    const side = whole.comparePoint(container, offset)
    if (!isEnd && side < 0) return { i, o: 0 }
    if (isEnd && side > 0) return { i, o: textOf(texts[i]).length }
  }
  return null
}

/**
 * This reader's selection on the open page, as the wire carries it.
 * @param {Element} root the sheet (#sheetInner)
 * @param {Element[]} blocks its blocks, in document order (app.js sheetBlocks)
 * @param {string|null} slug the page open
 * @returns {object|null} anchor.js selOf, or null for nothing selected on it
 */
export function ownSelection(root, blocks, slug) {
  if (!slug || !blocks.length) return null
  const sel = getSelection()
  if (!sel || !sel.rangeCount || sel.isCollapsed) return null
  const r = sel.getRangeAt(0)
  // a selection that is not on the page (the search field, the bar) is not
  // one this page shares
  if (!root.contains(r.commonAncestorContainer)) return null
  const texts = blocks.map(textsIn)
  try {
    const s = pointIn(blocks, texts, r.startContainer, r.startOffset, false)
    const e = pointIn(blocks, texts, r.endContainer, r.endOffset, true)
    return selOf(
      slug,
      texts.map((nodes) => textOf(nodes)),
      s,
      e
    )
  } catch {
    return null // a node that left the page mid-read: nothing selected
  }
}

/**
 * A peer's selection as a Range over this reader's page, or null.
 * @param {Element[]} blocks
 * @param {string|null} slug
 * @param {object} sel off the wire
 * @returns {Range|null}
 */
export function rangeOnPage(blocks, slug, sel) {
  const texts = blocks.map(textsIn)
  const hit = rangeOfSel(
    sel,
    slug,
    texts.map((nodes) => textOf(nodes))
  )
  if (!hit) return null
  const s = splitAt(lensOf(texts[hit.i]), hit.a)
  const e = splitAt(lensOf(texts[hit.j]), hit.b)
  if (!s || !e) return null
  const r = document.createRange()
  r.setStart(texts[hit.i][s.n], s.o)
  r.setEnd(texts[hit.j][e.n], e.o)
  return r
}

/**
 * The painter: one named highlight per peer, coloured by one rule per peer.
 * @returns {{paint:(id:number, color:string, range:Range|null)=>void, clear:(id:number)=>void, ids:()=>number[]}}
 *
 * The rules live in a stylesheet this module builds and adopts, one
 * `::highlight(peer-<id>)` each, written the first time that peer paints:
 * the hue is generated per peer, so it cannot be a rule in canvas-home.css.
 */
export function createHighlights() {
  const able = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function'
  const painted = new Set()
  if (!able) return { paint: () => {}, clear: () => {}, ids: () => [] }
  const sheet = new CSSStyleSheet()
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  const ruled = new Set()
  const nameOf = (id) => `peer-${id}`
  const clear = (id) => {
    CSS.highlights.delete(nameOf(id))
    painted.delete(id)
  }
  const paint = (id, color, range) => {
    if (!range) return clear(id)
    if (!ruled.has(id)) {
      sheet.insertRule(`::highlight(${nameOf(id)}) { background-color: ${color}; }`)
      ruled.add(id)
    }
    CSS.highlights.set(nameOf(id), new Highlight(range))
    painted.add(id)
  }
  return { paint, clear, ids: () => [...painted] }
}
