// test/kit.test.js
// The kit: one set of controls in kit.css, every one a
// picture of its state, shown working on both grounds at /admin/kit. Three
// halves. The PARTS half holds the pictures to their toolchain: every kit PNG
// is baked from src/lib/kit-parts.js through the textmode Bayer preset, so it
// uses only the ramp's greys, sits on the cell, and every part has every
// state it claims. The STYLESHEET half holds the law the kit carries (every
// pressable thing answers hover, pressed, focus and disabled; every line is
// one cell; motion lands in steps; the face is the one token; the hands are
// the drawn ones; nothing is an SVG by hand). The PAGE half holds the
// specimen: owner-only, unindexed, and actually showing what it claims.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cssRules } from './lib/cascade.js'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-kit-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')
process.env.TOKENS_PATH = join(tmp, 'tokens.json')

const { build } = await import('../src/server.js')
const { createSession } = await import('../src/services/auth.js')
const { SESSION_COOKIE } = await import('../src/middleware/auth.js')
const { GROUNDS } = await import('../src/routes/kit.js')
const { PARTS, PART_FILES, RAMPS, cellsOf, readRamps } = await import('../src/lib/kit-parts.js')
const { PRESETS, bayerGlyph } = await import('../primitives/textmode-settings.js')
const { decodePng } = await import('../scripts/icon/png.mjs')
const { imgVersion } = await import('../src/lib/img-version.js')

const ROOT = join(import.meta.dirname, '..')
const KIT = readFileSync(join(ROOT, 'primitives/kit/kit.css'), 'utf8')
const RULES = cssRules(KIT)
const KIT_FILES = [
  'primitives/kit/kit.css',
  'src/static/css/kit-specimen.css',
  'src/static/js/kit.js',
  'src/templates/kit/index.njk',
  'src/routes/kit.js',
].map((f) => [f, readFileSync(join(ROOT, f), 'utf8')])
const KIT_JS = KIT_FILES.find(([f]) => f.endsWith('js/kit.js'))[1]
const PNGS = join(ROOT, 'src/static/img/kit')

describe('the parts: baked, on the ramp, on the cell, every state', () => {
  const ramps = readRamps()
  const cell = PRESETS.parts.fontSize
  const hex = (rgba, i) =>
    '#' + [0, 1, 2].map((k) => rgba[i + k].toString(16).padStart(2, '0')).join('')

  it('the preset is the Bayer face at the site cell: the Bayer tileset, 4px, every level', () => {
    assert.equal(PRESETS.parts.fontId, 'bayer')
    assert.equal(cell, 4, 'the parts are drawn at the site cell')
    assert.equal(
      PRESETS.parts.glyphRamp.length,
      17,
      'the ramp walks every Bayer level, no blank tail'
    )
  })

  // mutation: kit.ramp-off-token
  it('the ramps are the tokens, and only greys and bricks', () => {
    // a part is dithered onto named tokens, so the picture and the page
    // cannot disagree about a grey; a ramp naming a colour the token file
    // does not hold fails in readRamps
    for (const [name, list] of Object.entries(ramps)) {
      assert.equal(list.length, RAMPS[name].length, name)
      for (const h of list) assert.match(h, /^#[0-9a-f]{6}$/)
    }
    // a grey is a grey: no channel more than a dozen off another; a brick is red
    const ch = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    for (const h of ramps.grey) {
      const c = ch(h)
      assert.ok(Math.max(...c) - Math.min(...c) <= 12, `${h} is not a grey`)
    }
    for (const h of ramps.brick) {
      const [r, g, b] = ch(h)
      assert.ok(r > g && r > b, `${h} is not a brick`)
    }
    assert.deepEqual(Object.keys(ramps).sort(), ['brick', 'grey'])
  })

  it('every part has every state it claims, as a PNG, and nothing else is in the folder', () => {
    for (const file of PART_FILES)
      assert.ok(existsSync(join(PNGS, `${file}.png`)), `${file}.png is not baked`)
    for (const p of PARTS)
      assert.ok(p.states.length >= 1 && p.w % 4 === 0 && p.h % 4 === 0, `${p.name}: whole cells`)
    const names = PARTS.map((p) => p.name)
    for (const need of [
      'knob',
      'toggle',
      'btn',
      'rbtn',
      'cap',
      'lamp',
      'call',
      'key',
      'white',
      'black',
      'pin',
    ])
      assert.ok(names.includes(need), `the ${need} is missing from the kit`)
    assert.equal(PARTS.find((p) => p.name === 'knob').states.length, 8, 'a knob has eight angles')
  })

  // mutation: kit.png-off-ramp, kit.png-off-cell
  it('every kit PNG uses only the ramp greys, sits on the cell, and is the dither of its cells', () => {
    const okGrey = new Set(ramps.grey)
    const okBrick = new Set(ramps.brick)
    for (const p of PARTS)
      for (const state of p.states) {
        const file = `${p.name}-${state}`
        const png = decodePng(readFileSync(join(PNGS, `${file}.png`)))
        const spec = cellsOf(p, state)
        assert.equal(
          `${png.width}x${png.height}`,
          `${spec.cols * cell}x${spec.rows * cell}`,
          `${file}: not the spec's cells`
        )
        for (let cy = 0; cy < spec.rows; cy++)
          for (let cx = 0; cx < spec.cols; cx++) {
            const want = spec.cells[cy * spec.cols + cx]
            const seen = new Map()
            const bits = []
            for (let py = 0; py < cell; py++)
              for (let px = 0; px < cell; px++) {
                const i = ((cy * cell + py) * png.width + cx * cell + px) * 4
                const a = png.rgba[i + 3]
                assert.ok(a === 0 || a === 255, `${file}: a half-clear pixel`)
                if (!want) {
                  assert.equal(a, 0, `${file} cell ${cx},${cy}: paint where the spec has no part`)
                  continue
                }
                assert.equal(a, 255, `${file} cell ${cx},${cy}: a hole in the part`)
                const h = hex(png.rgba, i)
                seen.set(h, (seen.get(h) || 0) + 1)
                bits.push(h)
              }
            if (!want) continue
            // the two colours of the cell are neighbours on its ramp
            const ramp = want.ramp === 'brick' ? ramps.brick : ramps.grey
            const ok = want.ramp === 'brick' ? okBrick : okGrey
            const colours = [...seen.keys()]
            for (const h of colours)
              assert.ok(ok.has(h), `${file} cell ${cx},${cy}: ${h} is not on the ${want.ramp} ramp`)
            assert.ok(
              colours.length <= 2,
              `${file} cell ${cx},${cy}: ${colours.length} colours in one cell`
            )
            if (colours.length === 2) {
              const [a, b] = colours.map((h) => ramp.indexOf(h)).sort((x, y) => x - y)
              assert.equal(
                b - a,
                1,
                `${file} cell ${cx},${cy}: ${colours.join(' and ')} are not neighbours`
              )
              // the lighter is the dots, and the dots are a Bayer glyph
              const light = ramp[b]
              const lit = bits.map((h) => (h === light ? 1 : 0))
              assert.deepEqual(
                lit,
                bayerGlyph(lit.reduce((s, v) => s + v, 0)),
                `${file} cell ${cx},${cy}: not a Bayer glyph`
              )
            }
          }
      }
  })
})

// the pressable primitives, and the state each must answer
const PRESSABLE = ['k-btn', 'k-hw', 'k-rk', 'k-part', 'k-check', 'k-key', 'k-switch']
const STATE_MARKS = {
  hover: /:hover/,
  pressed: /:active|\[aria-checked='true'\]|\.is-down/,
  focus: /:focus-visible/,
  disabled: /:disabled/,
}
const bare = (sel) => sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '')
function answers(cls, mark) {
  return RULES.some((r) =>
    r.selectors.some((s) => mark.test(bare(s)) && new RegExp(`\\.${cls}(?![\\w-])`).test(s))
  )
}

describe('kit.css: the law the kit carries', () => {
  // mutation: kit.part-never-disabled, kit.key-never-focused
  it('every pressable control answers hover, pressed, focus and disabled', () => {
    const missing = []
    for (const cls of PRESSABLE)
      for (const [state, mark] of Object.entries(STATE_MARKS))
        if (!answers(cls, mark)) missing.push(`.${cls} has no ${state} state`)
    assert.deepEqual(missing, [], missing.join('\n'))
  })

  // mutation: kit.curve-motion
  it('motion lands in steps: every transition and animation is stepped', () => {
    const curved = []
    for (const r of RULES)
      for (const d of r.decls) {
        if (!/^(transition|animation)$/.test(d.prop) || d.value === 'none') continue
        // stepped is one of the three frame tokens (hold, step, frames,
        // BIBLE.md section 9), or steps() counted off the thing itself (the
        // marquee walks as many steps as its line has cells)
        for (const leg of d.value.split(/,(?![^(]*\))/))
          if (!/var\(--cv-ease-(hold|step|frames)\)|\bsteps\(var\(--/.test(leg))
            curved.push(`${r.selectors.join(', ')}: ${d.prop}: ${leg.trim()}`)
      }
    assert.deepEqual(curved, [], `a state moves on a curve:\n  ${curved.join('\n  ')}`)
  })

  // mutation: kit.line-two-px
  it('every line is one cell: borders, rules, the track and the focus ring read --cv-px', () => {
    const off = []
    const LINE = /^(border(-(top|right|bottom|left))?|outline)$/
    for (const r of RULES)
      for (const d of r.decls) {
        const sel = r.selectors.join(', ')
        if (LINE.test(d.prop) && !/^(0|none)$/.test(d.value)) {
          if (!/^var\(--cv-px\) solid /.test(d.value)) off.push(`${sel}: ${d.prop}: ${d.value}`)
        } else if (/^(border|outline)(-\w+)?-width$/.test(d.prop)) {
          off.push(`${sel}: ${d.prop}: ${d.value}`)
        }
      }
    // the drawn lines that are boxes, not borders: the fader's track and tick
    const track = RULES.find((r) => r.selectors.some((s) => s.trim() === '.k-fader::before'))
    const tick = RULES.find((r) => r.selectors.some((s) => s.trim() === '.k-fader .k-tick'))
    const seam = RULES.find((r) => r.selectors.some((s) => s.trim() === '.k-flap::after'))
    for (const [rule, prop, name] of [
      [track, 'height', 'the fader track'],
      [tick, 'width', 'the fader tick'],
      [seam, 'height', 'the flap seam'],
    ])
      if (rule?.decls.find((d) => d.prop === prop)?.value !== 'var(--cv-px)')
        off.push(`${name} is not one cell thick`)
    assert.deepEqual(off, [], `a kit line that is not one cell:\n  ${off.join('\n  ')}`)
  })

  // mutation: kit.picture-off-part
  it('every picture the kit wears is a baked part, and every part is worn', () => {
    // a part is worn through --kp-<part>-<state>, which the page sets at the
    // file's hash (kit/parts.njk); kit.css names no picture URL of its own
    const worn = [...KIT.matchAll(/var\(--kp-([\w-]+)\)/g)].map((m) => m[1])
    const other = [...KIT.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1])
    assert.deepEqual(other, [], 'kit.css wears a picture that is not a baked part')
    for (const w of worn)
      assert.ok(PART_FILES.includes(w), `kit.css wears ${w}, which no part bakes`)
    // the parts the stylesheet does not name are swapped in by the script,
    // by part and state, so every baked file is reachable one way or the other
    assert.match(KIT_JS, /KIT_IMG\[`\$\{el\.dataset\.part\}-\$\{state\}`\]/)
    const njk = KIT_FILES.find(([f]) => f.endsWith('.njk'))[1]
    for (const p of PARTS)
      assert.ok(
        njk.includes(`'${p.name}'`) ||
          njk.includes(`/img/kit/' + p.name`) ||
          njk.includes(`/img/kit/${p.name}-`) ||
          worn.some((w) => w.startsWith(`${p.name}-`)),
        `the ${p.name} is baked but never shown`
      )
  })

  // mutation: kit.part-travels-on-press
  // A knob, a switch or a pin does not travel toward
  // you when you touch it; its state is its picture. A part may light under
  // the hand, and nothing on it may move.
  it('a part never travels under the hand: no offset on a knob, toggle, pin or lamp pressed', () => {
    const PART = /\.k-(part|knob|toggle|pin|lamp|call)\b[^,]*:active/
    const MOVES = /^(transform|translate|top|left|right|bottom|inset|margin|padding)(-[a-z-]+)?$/
    const travels = []
    for (const r of RULES)
      if (r.selectors.some((s) => PART.test(bare(s))))
        for (const d of r.decls)
          if (MOVES.test(d.prop)) travels.push(`${r.selectors.join(', ')}: ${d.prop}: ${d.value}`)
    assert.deepEqual(travels, [], `a part moves when pressed:\n  ${travels.join('\n  ')}`)
  })

  // mutation: kit.tap-floor-dropped
  it('nothing pressable is smaller than a fingertip, on a page or in the world', () => {
    const btn = RULES.find(
      (r) => r.selectors[0].trim() === '.k-btn' && r.decls.some((d) => d.prop === 'min-height')
    )
    assert.ok(btn, 'the outline button sets no floor')
    assert.equal(btn.decls.find((d) => d.prop === 'min-height')?.value, 'var(--cv-ctrl-h)')
    assert.equal(btn.decls.find((d) => d.prop === 'min-width')?.value, 'var(--cv-ctrl-h)')
    const check = RULES.find(
      (r) => r.selectors[0].trim() === '.k-check' && r.decls.some((d) => d.prop === 'min-height')
    )
    assert.equal(check?.decls.find((d) => d.prop === 'min-height')?.value, 'var(--cv-ctrl-h)')
    const fader = RULES.find(
      (r) => r.selectors[0].trim() === '.k-fader' && r.decls.some((d) => d.prop === 'height')
    )
    assert.equal(fader?.decls.find((d) => d.prop === 'height')?.value, 'var(--cv-ctrl-h)')
    // the world pad under a part: grown to the floor on the SCREEN
    const pad = RULES.find((r) => r.selectors.some((s) => s.trim() === '.k-part::after'))
    assert.ok(pad, 'the hit pad under a part is gone')
    for (const p of ['width', 'height'])
      assert.match(
        pad.decls.find((d) => d.prop === p)?.value || '',
        /--cv-ctrl-h\) \* var\(--cv-world-k/,
        `the pad's ${p} is not measured on the screen`
      )
  })

  // mutation: kit.smear-inverted
  it('dark on light is the smear, light on dark is regular', () => {
    const k = RULES.find((r) => r.selectors[0].trim() === '.k-ground')
    assert.equal(k?.decls.find((d) => d.prop === 'text-shadow')?.value, 'var(--cv-smear)')
    // every face that goes ink or brick resets it
    const reset = RULES.find((r) =>
      r.decls.some((d) => d.prop === 'text-shadow' && d.value === 'none')
    )
    for (const inv of [
      '.k-btn:hover',
      '.k-btn.k-solid',
      '.k-hw.is-down',
      '.k-hw.is-hot',
      '.k-rk.is-down',
      '.k-flap',
    ]) {
      const own = RULES.find((r) => r.selectors.some((s) => s.trim() === inv))
      const resets = RULES.some(
        (r) =>
          r.selectors.some((s) => s.trim() === inv) &&
          r.decls.some((d) => d.prop === 'text-shadow' && d.value === 'none')
      )
      assert.ok(
        own && (resets || reset?.selectors.some((s) => s.trim() === inv)),
        `${inv} keeps the smear on a dark face`
      )
    }
  })
})

// The one part of the kit set in the code face: a tag is a machine-literal
// word (BIBLE.md section 1, the tag), the way a path or a code chip is. Every
// other part speaks in the type face.
const CODE_FACE = new Set(['.k-tag'])

describe('the kit: one face, the real hands, no drawn-by-hand svg', () => {
  // mutation: kit.face-named, kit.code-face-spreads
  it('reads its face from --cv-font and names no family of its own', () => {
    const named = []
    for (const [f, text] of KIT_FILES.filter(([f]) => f.endsWith('.css')))
      for (const r of cssRules(text))
        for (const d of r.decls)
          if (
            d.prop === 'font-family' &&
            d.value !== 'var(--cv-font)' &&
            !(
              d.value === 'var(--cv-font-code)' && r.selectors.every((s) => CODE_FACE.has(s.trim()))
            )
          )
            named.push(`${f}: ${r.selectors.join(', ')}: font-family: ${d.value}`)
          else if (d.prop === 'font' && d.value !== 'inherit')
            named.push(`${f}: ${r.selectors.join(', ')}: font: ${d.value}`)
    assert.deepEqual(named, [], `the face is named twice:\n  ${named.join('\n  ')}`)
    // and the sizes are the three the face is drawn at
    const sizes = new Set(
      RULES.flatMap((r) => r.decls.filter((d) => d.prop === 'font-size').map((d) => d.value))
    )
    assert.deepEqual([...sizes].sort(), ['var(--cv-fs-0)', 'var(--cv-fs-3)', 'var(--cv-fs-6)'])
  })

  // mutation: kit.pixel-face-label
  it('the pixel face sets the hero title and nothing else: every other string is the type face', () => {
    const calls = []
    for (const [f, text] of KIT_FILES)
      for (const m of text.matchAll(/(\w+):\s*pixelText\(|pixelText\(/g))
        calls.push(`${f}: ${m[0]}`)
    assert.deepEqual(
      calls,
      ['src/routes/kit.js: title: pixelText('],
      'a string on /admin/kit other than the hero title is set in the pixel face'
    )
  })

  // mutation: kit.cursor-own, kit.cursor-system
  it('wears the drawn hands, and no control decides its own', () => {
    const own = RULES.flatMap((r) =>
      r.decls
        .filter((d) => d.prop === 'cursor' && d.value !== 'inherit')
        .map((d) => `${r.selectors.join(', ')}: cursor: ${d.value}`)
    )
    assert.deepEqual(own, [], `a control sets its own hand: ${own.join(' | ')}`)
    assert.match(KIT_JS, /import \{ cursorImage \} from 'multiplayer-canvas\/presence'/)
    assert.match(KIT_JS, /--cv-hand-\$\{which\}/, 'the page never hands the pictures over')
  })

  // mutation: kit.naive-svg
  it('draws nothing in svg by hand: the title is pixel-type, pictures are baked parts', () => {
    const drawn = []
    for (const [f, text] of KIT_FILES) {
      if (/<svg[\s>]/.test(text)) drawn.push(`${f}: an inline <svg>`)
      if (/data:image\/svg/.test(text)) drawn.push(`${f}: a data: svg`)
      for (const m of text.matchAll(/["'(]([^"'()\s]+\.svg)\b/g))
        if (!m[1].startsWith('/img/icon/')) drawn.push(`${f}: ${m[1]}`)
    }
    assert.deepEqual(drawn, [], drawn.join('\n'))
  })
})

// THE GRAMMAR. A state is
// drawn by what a person can do with it, so the brain reads it before the
// words: a binary you set is a flip switch, a binary you read is a lamp.
// Walked over every surface that draws a control (templates, entries and
// the scripts that build markup), the kit's own specimen aside, since it
// shows every part including the check box.
describe('the grammar: a switch you throw, a lamp you read', () => {
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? /vendor/.test(e.name)
          ? []
          : walk(join(d, e.name))
        : /\.(njk|js|md)$/.test(e.name)
          ? [join(d, e.name)]
          : []
    )
  const SURFACES = ['src/templates', 'src/static/js', 'src/static/canvas', 'content/feed']
    .flatMap((d) => walk(join(ROOT, d)))
    .filter((f) => !/templates\/kit\/|static\/js\/kit\.js$/.test(f))
    .map((f) => [f.slice(ROOT.length + 1), readFileSync(f, 'utf8')])

  // mutation: kit.grammar-checkbox-setting
  it('every binary a person sets is a flip switch, never a check box', () => {
    const boxes = SURFACES.flatMap(([f, text]) =>
      [...text.matchAll(/k-check\b|className = 'k-box'|class="k-box"/g)].map((m) => `${f}: ${m[0]}`)
    )
    assert.deepEqual(boxes, [], `a setting drawn as a check box:\n  ${boxes.join('\n  ')}`)
  })

  // mutation: kit.grammar-lamp-pressed
  it('a lamp is read, never pressed', () => {
    const pressed = SURFACES.flatMap(([f, text]) =>
      [...text.matchAll(/<button\b[^>]*\b(?:data-lamp|class="[^"]*\blamp\b)[^>]*>/g)].map(
        (m) => `${f}: ${m[0].slice(0, 80)}`
      )
    )
    assert.deepEqual(pressed, [], `a lamp that is a button:\n  ${pressed.join('\n  ')}`)
  })
})

describe('/admin/kit: the specimen', () => {
  let app
  let cookie

  before(async () => {
    app = await build({ logger: false })
    cookie = `${SESSION_COOKIE}=${await createSession('node:test kit')}`
  })

  after(async () => {
    await app.close()
  })

  it('is the owner’s, and a stranger is sent to the door', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin/kit' })
    assert.notEqual(r.statusCode, 200)
    assert.ok(!r.body.includes('k-part'), 'the kit leaked to a stranger')
  })

  it('is never indexed and never in the sitemap', async () => {
    const r = await app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie } })
    assert.equal(r.statusCode, 200)
    assert.match(r.body, /<meta name="robots" content="noindex, nofollow">/)
    const map = await app.inject({ method: 'GET', url: '/sitemap.xml' })
    assert.ok(!map.body.includes('/admin/kit'), 'the specimen is in the sitemap')
  })

  it('shows every part working on both grounds, and every state as baked', async () => {
    const { body } = await app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie } })
    for (const g of GROUNDS) {
      const at = body.indexOf(`ks-ground ks-${g.id}`)
      assert.ok(at > -1, `the ${g.id} ground is missing`)
      const board = body.slice(at, body.indexOf('</section>', at))
      for (const need of [
        'data-knob',
        'data-toggle',
        'data-play',
        'role="radio"',
        'role="checkbox"',
        'data-field',
        'data-fader',
        'data-call',
        'data-pin',
        'data-piano',
        'data-scope',
        'data-count',
        'k-dock',
        'k-panel',
        'disabled',
      ])
        assert.ok(board.includes(need), `${g.id}: no ${need}`)
    }
    for (const file of PART_FILES)
      assert.ok(body.includes(`/img/kit/${file}.png`), `${file} is not on the page`)
  })

  // mutation: img-version.kit-part-bare, img-version.kit-map-bare
  it('every kit picture on the page carries its bytes’ hash', async () => {
    // the kit is about to stand on public pages, so it keeps the rule the
    // public routes keep (test/img-version.test.js): no bare /img URL, and
    // the hash is the file's
    const { body } = await app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie } })
    const urls = [...body.matchAll(/\/img\/kit\/[^\s"'<>()\\]+/g)].map((m) => m[0])
    const bad = urls.filter((u) => {
      const [rel, query = ''] = u.slice('/img/'.length).split('?')
      return query !== `v=${imgVersion(rel)}`
    })
    assert.deepEqual(bad, [], 'the kit page emits a part URL without its hash')
    // the map kit.css and kit.js read names every part, hashed
    for (const file of PART_FILES) {
      assert.match(
        body,
        new RegExp(`--kp-${file}: url\\('/img/kit/${file}\\.png\\?v=[0-9a-f]{8}'\\)`)
      )
      assert.match(body, new RegExp(`"${file}":"/img/kit/${file}\\.png\\?v=[0-9a-f]{8}"`))
    }
    // and neither the stylesheet nor the script writes an /img URL itself
    for (const [f, src] of KIT_FILES.filter(([f]) => /\.(css|js)$/.test(f)))
      assert.deepEqual(
        [...src.matchAll(/url\(\s*['"]?\/img\/|['"`]\/img\//g)].map((m) => m[0]),
        [],
        `${f} writes an /img URL, which cannot know its hash`
      )
  })

  it('stands the kit on its own board, titled in the pixel face', async () => {
    const { body } = await app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie } })
    assert.ok(body.includes('/js/kit.js'), 'the board is dead')
    assert.match(body, /class="ks-title"><svg/, 'the title is not the pixel face')
  })
})
