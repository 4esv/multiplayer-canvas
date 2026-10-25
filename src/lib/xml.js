// Minimal XML entity escaper shared by the two XML surfaces on the site: the
// sitemap (routes/sitemap.js) and the RSS feed (routes/feed.js). One escaper
// so the two can never drift on which entities they cover.
export function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
