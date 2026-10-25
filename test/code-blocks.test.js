// Code blocks in a case study (issue #360) and the mapping between prose
// and code (issue #361): the numbered fence lib/markdown.js renders, the
// line splitter (lib/code-lines.js), and the ref
// grammar the client reads (js/line-ref.js). Behaviour, not text: every
// assertion is on what the renderer or the parser returns.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown, fenceInfo } from '../src/lib/markdown.js'
import { splitHighlighted, numberedLines } from '../src/lib/code-lines.js'
import { parseRef, refHash, targetIds } from '../src/static/js/line-ref.js'

describe('a fence is numbered lines', () => {
  it('numbers every line, keeps the pre the accessibility floor holds, and names none without an id', () => {
    const html = renderMarkdown('```js\nconst a = 1\nconst b = 2\n```')
    assert.match(
      html,
      /^<div class="code" data-lang="js" style="--ln-d:1"><pre class="hljs" tabindex="0"><code class="language-js">/
    )
    assert.equal((html.match(/<span class="ln">/g) || []).length, 2)
    assert.match(
      html,
      /<span class="ln-n" data-n="1" aria-hidden="true"><\/span><span class="hljs-keyword">const<\/span> a = <span class="hljs-number">1<\/span>\n<\/span>/
    )
    assert.doesNotMatch(html, / id="/, 'an unnamed block has no anchors')
    assert.doesNotMatch(html, /<a /, 'and no links')
  })

  it('a named block makes each line a target and each number a link to it', () => {
    const html = renderMarkdown('```python id=nao-loop\nx = 1\ny = 2\n```')
    assert.match(html, /^<div class="code" id="nao-loop" data-lang="python" style="--ln-d:1">/)
    assert.match(
      html,
      /<span class="ln" id="nao-loop-L2"><a class="ln-n" href="#nao-loop-L2" data-n="2" aria-label="line 2"><\/a>y = <span class="hljs-number">2<\/span>\n<\/span>/
    )
  })

  it('the info string: language first, id only when it is a safe slug', () => {
    assert.deepEqual(fenceInfo('python id=nao-loop'), { lang: 'python', id: 'nao-loop' })
    assert.deepEqual(fenceInfo('js'), { lang: 'js', id: null })
    assert.deepEqual(fenceInfo(''), { lang: '', id: null })
    assert.deepEqual(fenceInfo('js id=Bad_Id'), { lang: 'js', id: null })
    assert.deepEqual(fenceInfo('js id="x"'), { lang: 'js', id: null })
    assert.deepEqual(fenceInfo('js id=x onclick=1'), { lang: 'js', id: 'x' })
  })

  it('an unknown language and no language both come out escaped, still numbered', () => {
    for (const info of ['', 'nosuchlang']) {
      const html = renderMarkdown('```' + info + '\n<b>\n```')
      assert.match(
        html,
        /<span class="ln"><span class="ln-n" data-n="1" aria-hidden="true"><\/span>&lt;b&gt;\n<\/span>/
      )
      assert.doesNotMatch(html, /<b>/)
    }
    assert.match(
      renderMarkdown('```\nx\n```'),
      /<pre class="hljs" tabindex="0"><code>/,
      'no language, no class'
    )
  })

  it('the gutter width follows the line count', () => {
    const many = Array.from({ length: 120 }, (_, i) => 'line ' + i).join('\n')
    assert.match(renderMarkdown('```\n' + many + '\n```'), /style="--ln-d:3"/)
  })

  it('a token that spans lines is closed and reopened, never left open', () => {
    const lines = splitHighlighted(
      '<span class="a">one\ntwo\n<span class="b">three</span>\nfour</span>\n'
    )
    assert.deepEqual(lines, [
      '<span class="a">one</span>',
      '<span class="a">two</span>',
      '<span class="a"><span class="b">three</span></span>',
      '<span class="a">four</span>',
    ])
    assert.deepEqual(splitHighlighted('a\n\nb'), ['a', '', 'b'], 'a blank line is a line')
    assert.deepEqual(splitHighlighted(''), [''], 'an empty file is one empty line')
  })

  it('numberedLines highlights when it can and escapes when it cannot', () => {
    const js = numberedLines('let x = "<"', 'js', null)
    assert.equal(js.lines, 1)
    assert.match(js.body, /<span class="hljs-keyword">let<\/span>/)
    assert.match(js.body, /&quot;&lt;&quot;/)
    const none = numberedLines('a < b', 'nosuchlang', 'id1')
    assert.equal(
      none.body,
      '<span class="ln" id="id1-L1"><a class="ln-n" href="#id1-L1" data-n="1" aria-label="line 1"></a>a &lt; b\n</span>'
    )
  })
})

describe('the ref grammar', () => {
  it('reads a line, a range either way round, a whole target, and nothing else', () => {
    assert.deepEqual(parseRef('#nao-loop-L7'), { id: 'nao-loop', lo: 7, hi: 7 })
    assert.deepEqual(parseRef('#nao-loop-L3-L9'), { id: 'nao-loop', lo: 3, hi: 9 })
    assert.deepEqual(parseRef('#nao-loop-L9-L3'), { id: 'nao-loop', lo: 3, hi: 9 })
    assert.deepEqual(
      parseRef('nao-loop-L2'),
      { id: 'nao-loop', lo: 2, hi: 2 },
      'with or without the hash'
    )
    assert.deepEqual(parseRef('#fig-dispatch'), { id: 'fig-dispatch' })
    assert.deepEqual(
      parseRef('#8296808dbbd6-L1'),
      { id: '8296808dbbd6', lo: 1, hi: 1 },
      'a file id starts with a digit'
    )
    assert.equal(parseRef(''), null)
    assert.equal(parseRef('#'), null)
    assert.equal(parseRef('https://x.y/#a-L1'), null)
    assert.equal(parseRef('#a b'), null)
  })

  it('writes the fragment it reads', () => {
    assert.equal(refHash('nao-loop', 7), '#nao-loop-L7')
    assert.equal(refHash('nao-loop', 9, 3), '#nao-loop-L3-L9')
    assert.equal(refHash('nao-loop', 4, 4), '#nao-loop-L4')
    assert.equal(refHash('fig-dispatch'), '#fig-dispatch')
    for (const h of ['#nao-loop-L7', '#nao-loop-L3-L9', '#fig-dispatch']) {
      const r = parseRef(h)
      assert.equal(refHash(r.id, r.lo, r.hi), h)
    }
  })

  it('names the elements a ref lights', () => {
    assert.deepEqual(targetIds(parseRef('#a-L2-L4')), ['a-L2', 'a-L3', 'a-L4'])
    assert.deepEqual(targetIds(parseRef('#fig')), ['fig'])
    assert.deepEqual(targetIds(null), [])
  })
})

describe('the example study points its prose at its code', () => {
  // mutation: code-blocks.study-ref-dangles
  it('every ref on the page has a target on the page', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(
      new URL('../content/feed/example-case-study.md', import.meta.url),
      'utf8'
    )
    const html = renderMarkdown(src.replace(/^---[\s\S]*?---/, ''))
    const refs = [...html.matchAll(/<a class="ref" href="(#[^"]+)"/g)].map((m) => m[1])
    assert.ok(refs.length >= 2, `expected refs in the study, found ${refs.length}`)
    for (const href of refs) {
      const ids = targetIds(parseRef(href))
      assert.ok(ids.length, `${href} is not a ref`)
      for (const id of ids)
        assert.match(html, new RegExp(` id="${id}"`), `${href}: no element ${id}`)
    }
  })
})
