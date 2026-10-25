// multiplayer-canvas/kit/tags: the tags a page, card or row wears.
// Inputs: a list of tag words and an optional kind.
// Outputs: tagsMarkup -> an HTML string, visibleTags -> the filtered list. Pure. Style: kit.css.
//
// js/tags.js: the tags a page, a card and a row wear (BIBLE.md section 1, the
// tag). One list of words, one filter, one drawing (.k-tag in kit.css). The
// server writes the same markup the canvas does, so a direct load and a click
// read alike.

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

// `case-study` and `Case Study` are one word
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim()

/**
 * The tags worth drawing: a tag that repeats the kind says it twice, since the
 * kind is already the page's label.
 * @param {string[]|undefined} tags
 * @param {string} [kind] the kind's id or its label
 * @returns {string[]}
 */
export function visibleTags(tags, kind = '') {
  const k = norm(kind)
  return (tags || []).filter((t) => norm(t) && norm(t) !== k)
}

/**
 * A row of tags as a list, for a page or a list row. A card builds its own
 * nodes from visibleTags and the same two classes.
 * @param {string[]|undefined} tags
 * @param {string} [kind]
 * @returns {string} the markup, or '' when there is nothing to say
 */
export function tagsMarkup(tags, kind = '') {
  const shown = visibleTags(tags, kind)
  if (!shown.length) return ''
  return (
    '<ul class="k-tags" aria-label="tags">' +
    shown.map((t) => `<li class="k-tag">${esc(t)}</li>`).join('') +
    '</ul>'
  )
}
