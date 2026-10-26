// test/lib/template-helpers.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import nunjucks from 'nunjucks'

import { htmlToText, registerFilters, registerGlobals } from '../../src/lib/template-helpers.js'

describe('asset() global', () => {
  it('is the identity function when no build manifest exists (dev, tests)', () => {
    const env = new nunjucks.Environment()
    registerGlobals(env)
    const out = env.renderString("{{ asset('/css/canvas.css') }}", {})
    assert.equal(out, '/css/canvas.css')
  })

  it('passes through paths it has never heard of', () => {
    const env = new nunjucks.Environment()
    registerGlobals(env)
    const out = env.renderString("{{ asset('/img/footer/scene.svg') }}", {})
    assert.equal(out, '/img/footer/scene.svg')
  })
})

describe('htmlToText: entry bodies to plain text', () => {
  // The terminal tier renders entry.html through this pass (feed/entry.njk).
  // Case studies mix prose with inline SVG diagrams, hljs code blocks, and
  // footnote chrome; each family below pins one of the transforms.

  it('drops svg subtrees entirely, labels included', () => {
    const out = htmlToText('<p>before</p><svg role="img"><text>not built</text></svg><p>after</p>')
    assert.equal(out, 'before\n\nafter')
  })

  it('drops figure sections with their captions (a caption without its diagram is noise)', () => {
    const html =
      '<p>prose</p>' +
      '<section class="figure fig-wide"><p class="figure-title">The builder</p>' +
      '<svg><text>candidate</text></svg>' +
      '<p class="figure-note">Redrawn from the live tool.</p></section>' +
      '<figure><img src="/x.webp"><figcaption>cap</figcaption></figure>'
    assert.equal(htmlToText(html), 'prose')
  })

  it('drops the footnotes section but keeps the [n] markers in prose', () => {
    const html =
      '<p>ported the flow into Node<sup class="footnote-ref"><a id="fnref-sig" href="#fn-sig">1</a></sup>.</p>' +
      '<section class="footnotes"><ol class="footnotes-list">' +
      '<li id="fn-sig" class="footnote-item"><p>The signing scheme. <a href="#fnref-sig" class="footnote-backref">↩</a></p></li>' +
      '</ol></section>'
    assert.equal(htmlToText(html), 'ported the flow into Node[1].')
  })

  it('numbers footnote markers by document order when the marker text is not a number', () => {
    const html =
      '<p>a<sup class="footnote-ref"><a href="#fn-a">*</a></sup> ' +
      'b<sup class="footnote-ref"><a href="#fn-b">†</a></sup></p>'
    assert.equal(htmlToText(html), 'a[1] b[2]')
  })

  // mutation: template-helpers.drop-ignores-nesting
  it('survives nested same-name elements inside a dropped subtree', () => {
    // the outer note after the nested close is the point: a drop that stops
    // at the first </section> leaks it, and the old fixture could not tell
    const html =
      '<section class="footnotes"><section><p>inner</p></section><p>outer note</p></section>' +
      '<p>tail</p>'
    assert.equal(htmlToText(html), 'tail')
  })

  it('keeps code blocks as indented text: hljs spans stripped, entities decoded', () => {
    const html =
      '<p>the loop:</p>' +
      '<pre class="hljs"><code class="language-js"><span class="hljs-keyword">const</span> a = ' +
      '<span class="hljs-string">&#x27;x&#x27;</span> &amp;&amp; b\n' +
      '  <span class="hljs-title function_">go</span>(a)\n</code></pre>' +
      '<p>done.</p>'
    assert.equal(htmlToText(html), "the loop:\n\n    const a = 'x' && b\n      go(a)\n\ndone.")
  })

  it('does not confuse digits in prose with code-block placeholders', () => {
    // The pre placeholders are NUL-delimited; a bare number in the prose
    // around a code block must come through untouched.
    const html = '<p>about 0 or 1 minutes</p><pre><code>x = 0</code></pre><p>then 0 again</p>'
    assert.equal(htmlToText(html), 'about 0 or 1 minutes\n\n    x = 0\n\nthen 0 again')
  })

  it('keeps paragraph breaks, collapses whitespace, and unwraps inline markup', () => {
    const html =
      '<p>one   with\n  a <code>cat /etc/os-release</code> and <em>emphasis</em></p>\n\n\n' +
      '<p>two &quot;quoted&quot; &amp; escaped</p>'
    assert.equal(
      htmlToText(html),
      'one with\na cat /etc/os-release and emphasis\n\ntwo "quoted" & escaped'
    )
  })

  it('renders list items as dashes', () => {
    const out = htmlToText('<ul>\n<li>first</li>\n<li>second</li>\n</ul>')
    assert.equal(out, '- first\n\n- second')
  })

  it('is registered as the htmlToText filter', () => {
    const env = new nunjucks.Environment()
    registerFilters(env)
    const out = env.renderString('{{ s | htmlToText | safe }}', {
      s: '<p>a<sup class="footnote-ref"><a href="#fn-x">1</a></sup></p><svg><text>leak</text></svg>',
    })
    assert.equal(out, 'a[1]')
  })
})

describe('retroText filter: decorative glyphs fold to ASCII', () => {
  // A relic with thin UTF-8 font coverage shows boxes for arrows and curly
  // punctuation. The fold map lives in RETRO_FOLDS; this pins its output
  // (the retro page tests only prove no glyph LEAKS, not the mapping itself).
  it('folds arrows, separators, dashes, and curly punctuation', () => {
    const env = new nunjucks.Environment()
    registerFilters(env)
    const out = env.renderString('{{ s | retroText }}', {
      s: 'view on x.com → item · next — end…',
    })
    assert.ok(out.includes('x.com -&gt;'), 'the external-link arrow folds to ->')
    assert.ok(out.includes('item - next -- end...'), 'middot, em dash, and ellipsis fold')
    for (const glyph of ['→', '·', '—', '…']) {
      assert.ok(!out.includes(glyph), `decorative ${JSON.stringify(glyph)} is folded away`)
    }
  })
})
