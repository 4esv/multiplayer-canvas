import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import { escapeHtml, numberedLines } from './code-lines.js'

// A fence is a numbered block (lib/code-lines.js: highlight.js tokens kept
// whole across the line breaks, a gutter drawn from data-n so a copy never
// carries the numbers). The info string names the language and may name
// the block:
//
//   ```python id=nao-loop
//
// and a named block's lines are addressable, `#nao-loop-L7` one line,
// `#nao-loop-L3-L4` a range, read
// on the client by js/line-ref.js. A case study points its prose at them
// with <a class="ref" href="#nao-loop-L7">…</a> (canvas/code-refs.js lights
// both ends; without the script the anchor still jumps and :target lights
// the line). The wrapper carries the id, the language and the gutter width;
// the <pre> keeps the exact opening tag the accessibility floor is held to.
//
// A code block scrolls sideways when its longest line is wider than the
// column, and a region that scrolls has to take the keyboard or a reader
// without a pointer can never see the end of the line (WCAG 2.1.1; axe
// scrollable-region-focusable found two on /work/nao). So every fence is a
// Tab stop, and case-study.css gives it the kit's focus ring.
const ID_RE = /^[a-z][a-z0-9-]*$/

// the info string past the language: `id=nao-loop`, space separated
// seam: test/code-blocks.test.js
export function fenceInfo(info) {
  const [lang = '', ...rest] = String(info || '')
    .trim()
    .split(/\s+/)
  const attrs = {}
  for (const kv of rest) {
    const eq = kv.indexOf('=')
    if (eq > 0) attrs[kv.slice(0, eq)] = kv.slice(eq + 1)
  }
  const id = ID_RE.test(attrs.id || '') ? attrs.id : null
  return { lang, id }
}

function renderFence(str, info) {
  const { lang, id } = fenceInfo(info)
  const { digits, body } = numberedLines(str, lang, id)
  const cls = lang ? ` class="language-${escapeHtml(lang)}"` : ''
  const open = `<div class="code"${id ? ` id="${id}"` : ''}${lang ? ` data-lang="${escapeHtml(lang)}"` : ''} style="--ln-d:${digits}">`
  return `${open}<pre class="hljs" tabindex="0"><code${cls}>${body}</code></pre></div>\n`
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})

md.renderer.rules.fence = (tokens, idx) => renderFence(tokens[idx].content, tokens[idx].info)

md.use(anchor, { permalink: anchor.permalink.headerLink({ safariReaderFix: true }) })

export function renderMarkdown(src) {
  return md.render(src || '')
}
