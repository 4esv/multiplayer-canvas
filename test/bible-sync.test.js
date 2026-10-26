// test/bible-sync.test.js
// BIBLE.md's opening claim, mechanized: "one document, one runtime mirror
// (canvas-tokens.css), one geometry module (layout.js). When code and this
// file disagree, one of them is a bug." No prose parsing: the doc's YAML
// frontmatter is the machine layer, canvas-tokens.css is read by the shared
// token resolver (test/lib/css-tokens.js), and layout.js exports its constants
// for direct comparison.
//
// The resolver replaced a pair of regexes that read the stylesheet by luck:
// :root beat html.dark only because it came first in the file, and the dark
// view was re-matched with a non-greedy `}` that a nested at-rule would have
// truncated in silence. Light and dark now come out of one cascade-aware walk,
// and a value the doc claims is a length has to actually be one.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { PX, M, GUTTER, AIR, LADDER, HERO_STEPS, CHROME } from '../src/static/canvas/layout.js'
import { resolveTokens, asPx } from './lib/css-tokens.js'
import { RAMPS, readRamps } from '../src/lib/kit-parts.js'

const ROOT = join(import.meta.dirname, '..')
const BIBLE_SRC = matter(readFileSync(join(ROOT, 'BIBLE.md'), 'utf8'))
const bible = BIBLE_SRC.data
const BIBLE_BODY = BIBLE_SRC.content
const tokens = resolveTokens(readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8'), {
  prefix: '--cv-',
})
const { light, dark } = tokens

// --cv-* names that are runtime or derived, so they carry no frontmatter row:
// the border shorthand and the translucent inks (built FROM the two inks, not
// new colors: scrim), the fixed pair
// (documented by the ink pair itself), the faces
// (BIBLE names its faces in prose and the typography families, not as
// tokens), the prose/display line heights (ratios, not ladder steps), and the
// reading measure. Everything not here must appear in the frontmatter.
const DOC_EXEMPT = new Set([
  'bd',
  // the cut: the ground at the chrome's half-cell, composed from the ink pair
  // the way the border shorthand above is
  'bd-cut',
  'bd-ink',
  'line',
  // the lift vector, one cell of --cv-px each way (section 1 states it)
  'lift-x',
  'lift-y',
  // the drawn grid's two strengths: ink at a fraction, like `line`
  'grid',
  'grid-fine',
  'scrim',
  'ink-fixed',
  'ground-fixed',
  // the one fixed accent: Maurice's red, the daylight brick both ways
  'brick-fixed',
  'font',
  'font-code',
  // the smear: a glyph weight, not a colour (section 1 states it)
  'smear',
  'lh-display',
  'lh-prose',
  'reading',
])

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

// #abc and #aabbcc compare equal. A value that is not a hex color at all is a
// rename or a resolver miss, and says so rather than failing on undefined.
function hex6(value, label) {
  assert.ok(
    typeof value === 'string' && HEX.test(value),
    `${label}: expected a hex color, got ${JSON.stringify(value)}`
  )
  const h = value.toLowerCase()
  return h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h
}

// the frontmatter side of a length. The CSS side goes through pxValue().
function px(value, label) {
  const n = asPx(value)
  assert.ok(n !== null, `${label}: expected a px length, got ${JSON.stringify(value)}`)
  return n
}

describe('BIBLE.md, canvas-tokens.css and layout.js agree', () => {
  // mutation: bible-sync.ink-drift
  it('the two inks and the mute', () => {
    assert.equal(hex6(light.ink, '--cv-ink'), hex6(bible.colors.ink, 'colors.ink'))
    assert.equal(hex6(light.ground, '--cv-ground'), hex6(bible.colors.ground, 'colors.ground'))
    assert.equal(hex6(light.mute, '--cv-mute'), hex6(bible.colors.mute, 'colors.mute'))
    assert.equal(hex6(light.surface, '--cv-surface'), hex6(bible.colors.surface, 'colors.surface'))
    // the second ground, by decision: case studies stand on white
    assert.equal(hex6(light.white, '--cv-white'), hex6(bible.colors.white, 'colors.white'))
    assert.equal(hex6(light.bright, '--cv-bright'), hex6(bible.colors.bright, 'colors.bright'))
  })

  // mutation: bible-sync.ramp-drift
  it('the ramps a part is dithered onto are named tokens, and written in both places', () => {
    // A part (src/lib/kit-parts.js) is baked onto the grey
    // ramp and the brick ramp, read off the token file by name. Every grey
    // has a frontmatter row, and the bake reads the same hex the page paints.
    const css = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
    const ramps = readRamps(css)
    for (const [ramp, names] of Object.entries(RAMPS))
      names.forEach((name, i) => {
        assert.equal(
          hex6(light[name], `--cv-${name}`),
          ramps[ramp][i],
          `--cv-${name} is not what the bake reads`
        )
        assert.equal(
          hex6(bible.colors[name], `colors.${name}`),
          ramps[ramp][i],
          `colors.${name} drifted`
        )
      })
    // darkest first, so the dither's lighter dots are always the next grey up
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lum = (h) =>
      [1, 3, 5]
        .map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0)
    for (const list of Object.values(ramps))
      for (let i = 1; i < list.length; i++)
        assert.ok(lum(list[i]) > lum(list[i - 1]), `the ramp is not darkest first at ${list[i]}`)
    // and no computed tone survives: a tone is a named grey now, never a step
    const TONE = /^(?:[a-z]+)-(?:shade|light|highlight)$/
    const extra = tokens.names.filter((t) => TONE.test(t) && t !== 'brick-light')
    assert.deepEqual(extra, [], `computed tones nobody bakes with: ${extra.join(', ')}`)
  })

  // mutation: bible-sync.font-drift
  it('the face is one token, the frontmatter names the same family, and the file is vendored with its licence', () => {
    // The face is swapped through --cv-font alone. The family
    // the token names is the one every typography row claims, its @font-face
    // points at a file under src/static/fonts, and the licence sits beside it.
    const family = light.font
      .split(',')[0]
      .trim()
      .replace(/^['"]|['"]$/g, '')
    for (const [name, row] of Object.entries(bible.typography))
      if (name !== 'code')
        assert.equal(row.fontFamily, family, `typography.${name} names another face`)
    const css = readFileSync(join(ROOT, 'primitives/kit/canvas-tokens.css'), 'utf8')
    const face = css.match(
      new RegExp(`font-family: '${family}';\\s*src: url\\('/fonts/([\\w-]+\\.woff2)'\\)`)
    )
    assert.ok(face, `no @font-face for ${family} in canvas-tokens.css`)
    assert.ok(existsSync(join(ROOT, 'src/static/fonts', face[1])), `${face[1]} is not vendored`)
    assert.ok(
      existsSync(join(ROOT, `src/static/fonts/LICENSE-${family}.txt`)),
      'the licence is not beside the file'
    )
    // the face is drawn on a 16 grid: every rung of the ladder is a whole
    // multiple of it, so the face is crisp at every size the site sets
    for (const step of LADDER) assert.equal(step % 16, 0, `${step} is not on the face's grid`)
  })

  // mutation: bible-sync.accent-drift
  it('the content accents and the syntax theme', () => {
    // One Dark is quoted whole (the syntax theme block of the tokens), so
    // every --cv-code-* hue has a frontmatter row and the two agree
    const code = tokens.names.filter((n) => n.startsWith('code-'))
    assert.ok(code.length >= 10, `only ${code.length} syntax tokens: the theme is not whole`)
    for (const name of ['brick', 'ochre', 'sage', ...code]) {
      assert.equal(
        hex6(light[name], `--cv-${name}`),
        hex6(bible.colors[name], `colors.${name}`),
        name
      )
    }
  })

  // mutation: bible-sync.dark-view-back
  it('there is ONE ground, and no second view hiding behind it', () => {
    // One ground, one value per token, no switch. So the guard does not
    // prove two views agree with two lists, it proves there is only one view: the cascade's
    // dark read and its light read must be identical, and the frontmatter
    // must carry no -dark key for anything to drift into.
    for (const name of Object.keys(bible.colors)) {
      assert.ok(!name.endsWith('-dark'), `colors.${name}: the second theme is back in the contract`)
    }
    for (const name of ['ink', 'ground', 'surface', 'mute', 'brick', 'recess']) {
      assert.equal(
        hex6(dark[name], `--cv-${name} (dark read)`),
        hex6(light[name], `--cv-${name} (light read)`),
        `${name}: a dark context still redeclares it, so two grounds survive`
      )
    }
  })

  // mutation: bible-sync.spacing-drift
  it('the spacing scale, the module trio and the control heights', () => {
    for (const [name, value] of Object.entries(bible.spacing)) {
      if (name === 'unit') continue
      assert.equal(tokens.pxValue(name), px(value, `spacing.${name}`), `spacing.${name}`)
    }
  })

  // mutation: bible-sync.ladder-drift
  it('the type ladder', () => {
    // the roles (meta, body, fs-1 to fs-6) each sit on a rung, and the
    // frontmatter and the token file agree role by role. fs-5 and jumbo
    // went with their last reader; the top rung is the postcard's alone
    // (src/lib/postcard.js walks LADDER), so it has no token.
    const roles = [
      ['meta', 'fs-meta'],
      ['body', 'fs-0'],
      ...[1, 2, 3, 4, 6].map((n) => [`fs-${n}`, `fs-${n}`]),
    ]
    const bibleSizes = roles.map(([name]) =>
      px(bible.typography[name].fontSize, `typography.${name}.fontSize`)
    )
    // NOTE: pxValue folds calc(), so a derived size is pinned the same way a
    // hand-typed one is. parseInt returned NaN here.
    const cssSizes = roles.map(([, token]) => tokens.pxValue(token))
    assert.deepEqual(bibleSizes, cssSizes, 'frontmatter typography and canvas-tokens agree')
    for (const size of cssSizes) assert.ok(LADDER.includes(size), `${size} is off the ladder`)
    assert.deepEqual(
      [...new Set(cssSizes)],
      LADDER.slice(0, -1),
      "every rung under the postcard's is a token, in order"
    )
    assert.ok(!('fs-5' in bible.typography) && !('jumbo' in bible.typography), 'a retired role')
    assert.ok(
      HERO_STEPS.every((s) => LADDER.includes(s)),
      'hero steps are ladder members'
    )
  })

  // mutation: bible-sync.air-drift
  it('the geometry constants', () => {
    // the cell (section 3): the logo's pixel, the atom the unit and the
    // module are built of. One number in three places, held here.
    assert.equal(px(bible.spacing.px, 'spacing.px'), PX)
    assert.equal(tokens.pxValue('px'), PX)
    assert.equal(px(bible.spacing.unit, 'spacing.unit'), 2 * PX)
    assert.equal(M % PX, 0, 'the module is whole cells')
    assert.equal(px(bible.spacing.module, 'spacing.module'), M)
    assert.equal(px(bible.spacing.gutter, 'spacing.gutter'), GUTTER)
    assert.equal(px(bible.spacing.air, 'spacing.air'), AIR)
    assert.equal(tokens.pxValue('module'), M)
    assert.equal(tokens.pxValue('gutter'), GUTTER)
    assert.equal(tokens.pxValue('air'), AIR)
  })

  // mutation: bible-sync.motion-drift
  it('the motion tokens (BIBLE.md section 9)', () => {
    // The frontmatter `motion` block mirrors the --cv-dur-* and the frame
    // tokens so a duration can never rot silently against section 9's prose.
    for (const name of ['press', 'quick', 'glide', 'slide', 'drift', 'marquee']) {
      assert.equal(light[`dur-${name}`], bible.motion[name], `motion.${name}`)
    }
    // The frames are three names and none is a curve (section 9): the spring
    // and the glide easing are retired in both places (section 12)
    const frames = tokens.names.filter((n) => n.startsWith('ease-'))
    assert.deepEqual(
      frames.sort(),
      ['ease-frames', 'ease-hold', 'ease-step'],
      'the frame vocabulary'
    )
    for (const name of frames) {
      assert.equal(light[name], bible.motion[name], `motion.${name}`)
      assert.match(light[name], /^steps\(\d+, end\)$/, `--cv-${name} is a count of frames`)
    }
    const easings = Object.keys(bible.motion).filter((k) => k.startsWith('ease-'))
    assert.deepEqual(easings.sort(), [...frames].sort(), 'the frontmatter names the same frames')
  })

  // mutation: bible-sync.chrome-hand-tuned
  it('layout CHROME mirrors the chrome tokens (inset, gap, the control height)', () => {
    // BIBLE.md section 8: the bar's measures read spacing tokens, not
    // hand-tuned numbers. No band is reserved in WORLD units: the bar is
    // screen furniture, so its measures are screen px per density and the
    // opening CAMERA subtracts them.
    assert.equal(CHROME.inset, tokens.pxValue('sp-6'))
    assert.equal(CHROME.foot, tokens.pxValue('module'))
    assert.equal(CHROME.gap, tokens.pxValue('sp-3'))
    assert.equal(CHROME.h, tokens.pxValue('ctrl-h'))
    // There is ONE control height. A control cannot go below the fingertip
    // that presses it, so shrinking never makes the bar fit, and the watch
    // density carries no chrome to size. A ctrl-h-sm token fails here
    // rather than passing quietly as an unused token.
    assert.equal(CHROME.hSm, undefined)
    assert.ok(!tokens.names.includes('ctrl-h-sm'), 'the small control height is retired')
  })

  // mutation: bible-sync.token-undocumented
  it('every --cv-* token is documented in the frontmatter or exempt', () => {
    // Completeness: a token added to canvas-tokens.css with no BIBLE row (and
    // no place on the exempt list) is drift. The type ladder is named meta/
    // body in the frontmatter, so the fs-meta/fs-0 aliases are spelled out;
    // motion tokens drop their `dur-` prefix. The layers (--cv-z-*) are
    // ordinals, not measures, so they are documented where section 8 names
    // each one in prose rather than by a number in the frontmatter. The name
    // list is the union of both views, so a dark-only token counts too.
    const documented = new Set([
      ...DOC_EXEMPT,
      ...Object.keys(bible.colors),
      ...Object.keys(bible.spacing),
      ...Object.keys(bible.typography),
      ...Object.keys(bible.motion).map((k) => (k.startsWith('ease-') ? k : `dur-${k}`)),
      // the radius tokens ride the frontmatter `rounded` map: DEFAULT is
      // --cv-r, every other key is --cv-r-<key>
      ...Object.keys(bible.rounded || {}).map((k) => (k === 'DEFAULT' ? 'r' : `r-${k}`)),
      'fs-meta',
      'fs-0',
      ...tokens.names.filter((n) => n.startsWith('z-') && BIBLE_BODY.includes(`\`--cv-${n}\``)),
    ])
    const undocumented = tokens.names.filter((n) => !documented.has(n))
    assert.deepEqual(undocumented, [], `undocumented tokens: ${undocumented.join(', ')}`)
  })
})
