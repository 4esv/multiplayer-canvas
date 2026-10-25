// test/lib/markdown.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../../src/lib/markdown.js'

describe('renderMarkdown — code highlighting', () => {
  it('highlights a fenced js block with highlight.js', () => {
    const out = renderMarkdown('```js\nconst x = 1\n```')
    assert.ok(out.includes('hljs'), 'output carries the hljs class')
    assert.ok(out.includes('language-js'), 'the language is tagged on the code element')
    // highlight.js tokenizes keywords into spans rather than leaving bare text.
    assert.ok(out.includes('hljs-keyword'), 'js keywords are tokenized')
  })
})

describe('renderMarkdown — raw HTML passthrough', () => {
  // mutation: markdown.raw-html-escaped
  it('passes raw HTML through unescaped (html: true)', () => {
    const out = renderMarkdown('<div class="raw-x">hi</div>')
    assert.ok(out.includes('<div class="raw-x">'), 'the raw div is not escaped')
    assert.ok(!out.includes('&lt;div'), 'the angle brackets are not entity-encoded')
  })
})

describe('renderMarkdown — heading anchors', () => {
  it('gives a heading a slug id and a header-anchor link', () => {
    const out = renderMarkdown('# Title Here')
    assert.match(out, /<h1[^>]*\bid="title-here"/, 'heading gets a slugified id')
    assert.ok(out.includes('header-anchor'), 'anchor link is attached to the heading')
    assert.ok(out.includes('href="#title-here"'), 'anchor points at its own id')
  })
})

describe('renderMarkdown — footnote plugin removed', () => {
  it('does NOT process [^1] footnote syntax into a footnotes section', () => {
    const out = renderMarkdown('Some text[^1]\n\n[^1]: the note')
    assert.ok(
      !out.includes('class="footnotes"'),
      'no footnotes section wrapper is produced (plugin removed)'
    )
    assert.ok(out.includes('[^1]'), 'the bare footnote marker is left as literal text')
  })
})

describe('renderMarkdown — empty / nullish input', () => {
  it('returns an empty string for nullish input without throwing', () => {
    assert.equal(renderMarkdown(undefined), '')
    assert.equal(renderMarkdown(null), '')
    assert.equal(renderMarkdown(''), '')
  })
})
