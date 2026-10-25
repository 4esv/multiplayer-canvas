// canvas/quote-cards.js: the entry card, as markup. Pure strings, so app.js
// seats it in a tile and the OG cards can draw the same one: a card on a
// card is the card.
//
// The slots a card has (a summary, the tags) are drawn empty and filled by
// app.js from the boot payload, or drawn full by a caller that has them in
// hand. The string is the tile's `.cell`, whose rules are canvas-home.css
// `.t-article`.

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

const tagList = (tags) => (tags || []).map((t) => `<span class="k-tag">${esc(t)}</span>`).join('')
const summary = (s) => `<p class="summary">${esc(s)}</p>`

/**
 * The site's own entry card: the title first (the case-study card is the
 * page's title, smaller, in the same face), a rule, the summary, the tags.
 * `title` is markup the caller has already made safe.
 */
export function entryCard({ title, body = '', tags = [] }) {
  return `<div class="cell">${title}<div class="rule"></div>${summary(body)}<div class="k-tags">${tagList(tags)}</div></div>`
}
