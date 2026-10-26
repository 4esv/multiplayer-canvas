// test/sheet-escaping.test.js
// A sheet's title and meta line are escaped wherever they become MARKUP, and
// left alone wherever they stay TEXT.
//
// The same entry opens two ways. A cold load SSRs the sheet through
// templates/canvas/home.njk, where Nunjucks `autoescape: true` escapes
// `{{ sheet.title }}` for free. A click inside the canvas mounts the same
// fields client-side, where a template literal escapes nothing unless it is
// told to. Those two paths are meant to be identical by construction. The
// failure mode: app.js interpolating `${p.title}` and `${p.meta}` raw into
// innerHTML while the template escapes them.
//
// Nobody could reach it: the only writer of those fields is frontmatter in
// this repo, committed to git. That is why it survived. A seam that is safe
// only because of who happens to be holding the pen is not sealed, it is
// unattended, and `/api/page` is a public endpoint whose title the client
// trusts.
//
// The rule has two halves and needs both, because the obvious one-sided
// version of this guard is wrong. `document.title` takes a string, not
// markup: escaping there would put a literal `&amp;` in the tab. So this
// reads the CONTEXT, and asserts the raw field in the places raw is correct.
//
// Body HTML is deliberately out of scope. `p.body` and `page.html` come from
// the server's sheet builders and the markdown renderer, which escape their
// own inputs and then emit markup on purpose; escaping those again would
// print tags at the reader.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = readFileSync(join(ROOT, 'src/static/canvas/app.js'), 'utf8')
const SHELL = readFileSync(join(ROOT, 'src/templates/canvas/home.njk'), 'utf8')

// The fields a sheet prints as words rather than as markup, and every name
// the sheet object goes by: `p` is a routed page out of the boot index,
// `s` is a section door's payload from /api/sheet. Both paint the same two
// fields into the same element, so a guard that knows only one of them
// enforces half a rule. It did, and the half it missed was live in the tree.
const TEXT_FIELDS = ['title', 'meta']
const RECEIVERS = ['p', 's']

// Strip comments first: this file's own prose quotes the unescaped form, and
// a guard that reads discussion instead of code fails on itself.
const CODE = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// Every template literal in the file, with the statement text that opens it.
// Walks `${}` depth so a nested literal does not close its parent early.
function templateLiterals(src) {
  const out = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '`') continue
    let depth = 0
    let j = i + 1
    for (; j < src.length; j++) {
      if (src[j] === '\\') j++
      else if (src[j] === '$' && src[j + 1] === '{') depth++
      else if (src[j] === '}' && depth) depth--
      else if (src[j] === '`' && !depth) break
    }
    // The statement head, back to the last thing that could END a statement.
    // Looking back only to the previous NEWLINE was the first version of this
    // and it was blind by exactly one line break: wrap the assignment onto two
    // lines and the literal stopped reading as markup while the guard stayed
    // green. A statement can be wrapped anywhere; it cannot cross a `;` or a
    // brace, so those are what the scan stops on.
    let from = i - 1
    while (from >= 0 && !';{}'.includes(src[from])) from--
    const head = src.slice(from + 1, i)
    out.push({ body: src.slice(i + 1, j), head })
    i = j
  }
  return out
}

const LITERALS = templateLiterals(CODE)
// the page head's builder writes markup too: it is where a meta line becomes
// markup, for every sheet (primitives/kit/tags.js sits beside it for the tags)
const MARKUP = LITERALS.filter((l) => /innerHTML|insertAdjacentHTML|metaMarkup/.test(l.head))

describe('the sheet title and meta are escaped wherever they become markup', () => {
  // tripwire: pins the sweep's own reach; if app.js stops writing markup in innerHTML literals the guards below read nothing, and that must be noticed and the sweep rethought, not passed
  it('the sweep found the markup literals (a guard over nothing is not a guard)', () => {
    assert.ok(MARKUP.length > 5, `only ${MARKUP.length} innerHTML template literals found`)
  })

  for (const recv of RECEIVERS) {
    for (const field of TEXT_FIELDS) {
      // mutation: sheet-escaping.raw-section-title
      it(`no innerHTML literal interpolates ${recv}.${field} raw`, () => {
        const offenders = MARKUP.filter((l) =>
          new RegExp(`\\$\\{\\s*${recv}\\.${field}\\s*\\}`).test(l.body)
        ).map((l) => l.head.trim().slice(0, 70))
        assert.deepEqual(
          offenders,
          [],
          `${recv}.${field} reaches innerHTML unescaped. The SSR path escapes it ` +
            `(canvas/home.njk); this one must too. Wrap it in esc().`
        )
      })

      // mutation: sheet-escaping.raw-section-title
      it(`${recv}.${field} still reaches innerHTML through esc(), so the guard has a subject`, () => {
        // Without this, deleting every use of the field would read as a pass.
        // The meta line reaches markup through the one head builder (metaMarkup),
        // which every sheet hands its page to, so that is its subject.
        const escaped = MARKUP.filter((l) =>
          new RegExp(`\\$\\{\\s*esc\\(${recv}\\.${field}\\)\\s*\\}`).test(l.body)
        )
        const viaBuilder = field === 'meta' && new RegExp(`metaMarkup\\(${recv},`).test(CODE)
        assert.ok(
          escaped.length > 0 || viaBuilder,
          `no escaped ${recv}.${field} left in any markup literal`
        )
      })
    }
  }

  // mutation: sheet-escaping.raw-meta-in-builder
  it('the head builder escapes the meta line it writes', () => {
    const builder = MARKUP.find((l) => /metaMarkup/.test(l.head))
    assert.ok(builder, 'the head builder is gone, so a head is built by hand again')
    assert.match(builder.body, /\$\{esc\(p\.meta\)\}/, 'the builder writes the meta line raw')
  })

  // mutation: sheet-escaping.tab-title-escaped
  it('document.title takes the raw field, because a tab title is not markup', () => {
    // The half of the rule that a one-sided guard gets wrong: escaping here
    // would print &amp; in the tab for any title carrying an ampersand.
    // There is more than one document.title assignment; this is the one that
    // falls back to the sheet's own title when no docTitle was supplied.
    const lines = CODE.split('\n').filter(
      (l) => l.includes('document.title') && l.includes('p.title')
    )
    assert.equal(lines.length, 1, 'expected exactly one document.title fallback on p.title')
    assert.ok(
      /\$\{\s*p\.title\s*\}/.test(lines[0]),
      `document.title should interpolate p.title raw, got: ${lines[0].trim()}`
    )
  })

  // mutation: sheet-escaping.shell-title-safe
  it('the shell prints sheet.title and sheet.meta without | safe', () => {
    for (const field of TEXT_FIELDS) {
      const printed = SHELL.match(new RegExp(`\\{\\{\\s*sheet\\.${field}[^}]*\\}\\}`, 'g')) || []
      assert.ok(printed.length > 0, `the shell never prints sheet.${field}`)
      for (const tag of printed) {
        assert.ok(
          !/\|\s*safe/.test(tag),
          `${tag} disables autoescape on a field the client escapes`
        )
      }
    }
  })
})
