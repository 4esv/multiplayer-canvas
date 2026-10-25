// test/lib/css-tokens.test.js
// The resolver's own guard. Every capability is proved against a fixture
// string here BEFORE canvas-tokens.css is allowed to use it, because the two
// parsers this replaced both failed silently: one truncated a block at the
// first `}` it saw, the other dropped a token out of its allowed set and then
// blamed the wrong file. A capability that is not asserted below is not one
// the token guards may lean on.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTokens,
  evalCalc,
  asPx,
  isColorMix,
  parseColorMix,
  stripComments,
  splitTopLevel,
} from './css-tokens.js'

const cv = (css) => resolveTokens(css, { prefix: '--cv-' })

describe('the token resolver reads what the browser reads', () => {
  it('splits light-dark() by theme', () => {
    const t = cv(':root { --cv-ink: light-dark(#22252c, #edefe8); }')
    assert.equal(t.light.ink, '#22252c')
    assert.equal(t.dark.ink, '#edefe8')
  })

  it('nests light-dark() inside another function', () => {
    const t = cv(':root { --cv-line: rgba(light-dark(0, 255), 0, 0, 0.2); }')
    assert.equal(t.light.line, 'rgba(0, 0, 0, 0.2)')
    assert.equal(t.dark.line, 'rgba(255, 0, 0, 0.2)')
  })

  it('folds a calc() ladder step, round() and pow() included', () => {
    const t = cv(':root { --cv-fs-3: calc(round(16px * pow(1.2720196, 3), 1px)); }')
    assert.equal(t.light['fs-3'], '33px')
    assert.equal(t.pxValue('fs-3'), 33)
  })

  it('folds the whole ladder off one root and one ratio', () => {
    const steps = [1, 2, 3, 4, 5, 6]
      .map((n) => evalCalc(`round(16px * pow(1.2720196, ${n}), 1px)`))
      .map((v) => v.n)
    assert.deepEqual(steps, [20, 26, 33, 42, 53, 68])
  })

  it('keeps units honest in calc()', () => {
    assert.equal(evalCalc('16px * 2.5').n, 40)
    assert.equal(evalCalc('16px * 2.5').unit, 'px')
    assert.equal(evalCalc('(2 + 3) * 4px').n, 20)
    assert.equal(evalCalc('48px / 2').n, 24)
    assert.equal(evalCalc('96px / 48px').unit, '', 'like over like is a plain number')
    assert.equal(evalCalc('-8px + 16px').n, 8)
  })

  it('throws with the expression when calc() asks for something it cannot fold', () => {
    // NOTE: the point of the throw is that a guard never receives NaN. Each
    // message has to name the expression and the reason.
    assert.throws(() => evalCalc('clamp(1px, 2vw, 3px)'), /clamp\(\) is not supported/)
    assert.throws(() => evalCalc('100% - 16px'), /% - px/)
    assert.throws(() => evalCalc('16px * 2px'), /px \* px/)
    assert.throws(() => evalCalc('round(16px, 0px)'), /step is zero/)
    assert.throws(() => evalCalc('pow(16px, 2)'), /two plain numbers/)
  })

  it('leaves a calc() the browser owns verbatim instead of guessing', () => {
    const t = cv(':root { --cv-pad: calc(100% - var(--runtime-inset)); }')
    assert.equal(t.light.pad, 'calc(100% - var(--runtime-inset))')
    assert.throws(() => t.pxValue('pad'), /not a static px length/)
  })

  it('walks past a nested @media inside html.dark', () => {
    // WARNING: this is the shape that broke the old parser. Its non-greedy
    // /html\.dark\s*\{([\s\S]*?)\}/ stopped at the media query's closing
    // brace, so every declaration after it silently vanished from the dark
    // view and the test still passed.
    const t = cv(`
      :root { --cv-ink: #22252c; --cv-ground: #f3f4ef; --cv-mute: #666b64; }
      html.dark {
        --cv-ink: #edefe8;
        @media (min-width: 600px) { --cv-ground: #101216; }
        --cv-mute: #9ba095;
      }
    `)
    assert.equal(t.dark.ink, '#edefe8')
    assert.equal(t.dark.mute, '#9ba095', 'the declaration after the nested block survives')
    assert.equal(t.light.mute, '#666b64', 'and the light view is untouched by it')
  })

  it('reads a dark prefers-color-scheme block as dark', () => {
    const t = cv(`
      :root { --cv-ground: #f3f4ef; }
      @media (prefers-color-scheme: dark) { :root { --cv-ground: #15171b; } }
    `)
    assert.equal(t.light.ground, '#f3f4ef')
    assert.equal(t.dark.ground, '#15171b')
  })

  it('lets :root beat an @property initial-value', () => {
    // An initial-value is what the browser uses when nothing declares the
    // property. A walk that just took the last declaration would let the
    // descriptor win from below.
    const t = cv(`
      :root { --cv-cast-y: 6px; }
      @property --cv-cast-y { syntax: '<length>'; inherits: false; initial-value: 0px; }
    `)
    assert.equal(t.light['cast-y'], '6px')
    assert.equal(t.pxValue('cast-y'), 6)
  })

  it('still takes an @property initial-value when nothing else declares it', () => {
    const t = cv('@property --cv-cast-x { syntax: "<length>"; initial-value: 2px; }')
    assert.equal(t.pxValue('cast-x'), 2)
  })

  it('survives a comment carrying a brace, a semicolon and a quote', () => {
    const t = cv(`
      :root {
        /* the sheet's shoulders: } ; not a block, not a declaration */
        --cv-r-sheet: 12px;
      }
    `)
    assert.equal(t.pxValue('r-sheet'), 12)
    assert.equal(stripComments('a /* } */ b').replace(/\s+/g, ' '), 'a b')
    assert.equal(stripComments('content: "/* kept */"'), 'content: "/* kept */"')
  })

  it('normalizes a value prettier wrapped across lines', () => {
    const wrapped = cv(`
      :root {
        --cv-shadow:
          0 6px 16px rgba(34, 37, 44, 0.13),
          0 1px 3px rgba(34, 37, 44, 0.08);
      }
    `)
    const oneLine = cv(
      ':root { --cv-shadow: 0 6px 16px rgba(34, 37, 44, 0.13), 0 1px 3px rgba(34, 37, 44, 0.08); }'
    )
    assert.equal(wrapped.light.shadow, oneLine.light.shadow)
    assert.equal(
      wrapped.light.shadow,
      '0 6px 16px rgba(34, 37, 44, 0.13), 0 1px 3px rgba(34, 37, 44, 0.08)'
    )
  })

  it('follows a var() chain, per theme, with fallbacks', () => {
    const t = cv(`
      :root { --cv-ink: #22252c; --cv-a: var(--cv-ink); --cv-b: var(--cv-a); }
      html.dark { --cv-ink: #edefe8; }
    `)
    assert.equal(t.light.b, '#22252c')
    assert.equal(t.dark.b, '#edefe8', 'the chain re-resolves against the dark view')

    const fb = cv(':root { --cv-gap: var(--cv-missing, 24px); }')
    assert.equal(fb.pxValue('gap'), 24)

    const nested = cv(
      ':root { --cv-gap: var(--cv-missing, var(--cv-sp-6, 24px)); --cv-sp-6: 20px; }'
    )
    assert.equal(nested.pxValue('gap'), 20, 'the fallback resolves like any other value')
  })

  it('folds a var() into the calc that reads it', () => {
    const t = cv(':root { --cv-cast-y: 6px; --cv-lift: calc(var(--cv-cast-y) * 2.5); }')
    assert.equal(t.pxValue('lift'), 15)
  })

  it('refuses a var() cycle instead of hanging', () => {
    assert.throws(() => cv(':root { --cv-a: var(--cv-b); --cv-b: var(--cv-a); }'), /var\(\) cycle/)
  })

  it('leaves color-mix() as a string and reads its parts on request', () => {
    const t = cv(`
      :root { --cv-ink: #22252c; --cv-line: color-mix(in srgb, var(--cv-ink) 22%, transparent); }
      html.dark { --cv-ink: #edefe8; --cv-line: color-mix(in srgb, var(--cv-ink) 26%, transparent); }
    `)
    assert.equal(t.light.line, 'color-mix(in srgb, #22252c 22%, transparent)')
    assert.ok(isColorMix(t.dark.line))
    assert.deepEqual(parseColorMix(t.dark.line), {
      space: 'srgb',
      stops: [
        { color: '#edefe8', percent: 26 },
        { color: 'transparent', percent: null },
      ],
    })
    assert.equal(parseColorMix('#22252c'), null)
  })

  it('ignores custom properties scoped to a component', () => {
    // A tile rebinding an ink locally is not a token; only the root blocks are.
    const t = cv(':root { --cv-ink: #22252c; } .q-slime { --cv-ink: #dfdedc; }')
    assert.equal(t.light.ink, '#22252c')
  })

  // mutation: css-tokens.first-declaration-wins
  it('takes the last declaration when two root blocks collide', () => {
    const t = cv(':root { --cv-ink: #000000; } :root { --cv-ink: #22252c; }')
    assert.equal(t.light.ink, '#22252c')
  })

  it('names every token across both views', () => {
    const t = cv(':root { --cv-ink: #22252c; } html.dark { --cv-glow: #edefe8; }')
    assert.deepEqual(t.names, ['glow', 'ink'], 'a dark-only token is still a token')
  })

  it('keys by full name when no prefix is asked for, guests included', () => {
    const t = resolveTokens(':root { --cv-ink: #22252c; --guest-gh-acc: #0969da; }')
    assert.deepEqual(t.names, ['--cv-ink', '--guest-gh-acc'])
  })

  it('says which token failed when a length is claimed and not found', () => {
    const t = cv(':root { --cv-reading: 60ch; }')
    assert.throws(() => t.pxValue('reading'), /--cv-reading is not a static px length/)
    assert.throws(() => t.pxValue('nope'), /no token --cv-nope/)
  })

  it('reads a plain length and refuses everything else', () => {
    assert.equal(asPx('48px'), 48)
    assert.equal(asPx('0'), 0)
    assert.equal(asPx('-2px'), -2)
    assert.equal(asPx('1px solid var(--cv-line)'), null)
    assert.equal(asPx('120ms'), null)
    assert.equal(asPx('1.272'), null)
    assert.equal(asPx(undefined), null)
  })

  it('splits arguments at the top level only', () => {
    assert.deepEqual(splitTopLevel('in srgb, rgba(0, 0, 0, 1) 22%, transparent'), [
      'in srgb',
      'rgba(0, 0, 0, 1) 22%',
      'transparent',
    ])
  })

  it('refuses a truncated stylesheet rather than reading half of it', () => {
    assert.throws(() => cv(':root { --cv-ink: #22252c; /* unterminated'), /unterminated comment/)
    assert.throws(() => cv(':root { --cv-ink: #22252c; } }'), /unbalanced "}"/)
  })
})
