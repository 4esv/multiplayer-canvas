// Code as numbered lines, for every place the site shows a block of it: a
// case study's fence (lib/markdown.js). One splitter, one markup, one grammar for pointing at
// a line: `#<block id>-L12` is one line, `#<id>-L3-L9` a range (GitHub's,
// prefixed by the block because a page holds several). js/line-ref.js
// reads the same grammar on the client.
//
//   <span class="ln" id="<id>-L1"><a class="ln-n" href="#<id>-L1" data-n="1" aria-label="line 1"></a>…tokens…\n</span>
//
// The number is drawn from data-n by CSS (::before), so a copy of the code
// never picks it up; the trailing newline inside the span keeps the line
// breaks in that copy. A block without an id gets the same lines with a
// plain <span class="ln-n"> gutter: numbered, not addressable.

import hljs from 'highlight.js'

export const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )

// Split highlighted html into lines without breaking a token that spans a
// newline (a block comment, a template string): every span open at the
// break is closed before it and reopened after. hljs emits only <span>
// tags and entities, which is what makes the tag walk safe.
const TAG = /<span[^>]*>|<\/span>/g
// seam: test/code-blocks.test.js
export function splitHighlighted(html) {
  const lines = []
  const open = []
  let line = ''
  let last = 0
  const flush = (upto) => {
    let chunk = html.slice(last, upto)
    let nl
    while ((nl = chunk.indexOf('\n')) !== -1) {
      line += chunk.slice(0, nl) + '</span>'.repeat(open.length)
      lines.push(line)
      line = open.join('')
      chunk = chunk.slice(nl + 1)
    }
    line += chunk
  }
  for (const m of html.matchAll(TAG)) {
    flush(m.index)
    if (m[0] === '</span>') open.pop()
    else open.push(m[0])
    line += m[0]
    last = m.index + m[0].length
  }
  flush(html.length)
  lines.push(line)
  // a file that ends in a newline does not have an empty last line
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

// Highlight `text` as `lang` (or escape it when hljs has no such language
// or fails on it) and number the lines. Returns { lines, digits, body }:
// the count, the width of the widest number, and the inner html of the
// <code>. `id` makes the lines addressable; without it they are only
// numbered.
export function numberedLines(text, lang, id) {
  let html = null
  if (lang && hljs.getLanguage(lang)) {
    try {
      html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value
    } catch {
      html = null
    }
  }
  if (html == null) html = escapeHtml(text)
  const lines = splitHighlighted(html)
  const digits = String(lines.length).length
  const body = lines
    .map((l, i) => {
      const n = i + 1
      if (!id)
        return `<span class="ln"><span class="ln-n" data-n="${n}" aria-hidden="true"></span>${l}\n</span>`
      const at = `${id}-L${n}`
      return `<span class="ln" id="${at}"><a class="ln-n" href="#${at}" data-n="${n}" aria-label="line ${n}"></a>${l}\n</span>`
    })
    .join('')
  return { lines: lines.length, digits, body }
}
