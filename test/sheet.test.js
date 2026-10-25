// test/sheet.test.js
// THE SHEET (/admin/kit, src/lib/sheet.js): one page holding every piece the
// site is made of. A style guide typed beside the code rots, so this one is
// read off it, and this file is what keeps the part that cannot be read off
// it honest. Three halves. The REGISTRIES half holds what is written by hand
// (what a move is for, which gag lives where, which piece is missing) to the
// thing it describes: a keyframe nobody described, a described move that is
// gone, a gag whose file is gone, a composition that names a class its files
// never use. The DERIVED half holds what is read off the source to the
// source, read a second way. The PAGE half holds the page: every plate
// there, the display face only as a specimen, the code the case study's own,
// the swatches live tokens, and the same page for a terminal.
import { STACKS } from '../src/static/canvas/layout.js'
import './env.js'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cssFiles, cssPath } from './lib/stylesheets.js'

const tmp = mkdtempSync(join(tmpdir(), 'canvas-sheet-'))
process.env.AUTH_STORE_PATH = join(tmp, 'auth.json')
process.env.AUDIT_DIR = join(tmp, 'audit')
process.env.TOKENS_PATH = join(tmp, 'tokens.json')

const { build } = await import('../src/server.js')
const { createSession } = await import('../src/services/auth.js')
const { SESSION_COOKIE } = await import('../src/middleware/auth.js')
const { MOVES, WAVES, GAGS, GAG_KINDS, GAG_RULES, COMPOSITION, MISSING, VOICE, plates } =
  await import('../src/lib/sheet.js')
const { LADDER } = await import('../src/static/canvas/layout.js')
const { COMMANDS } = await import('../src/static/canvas/commands.js')

const ROOT = join(import.meta.dirname, '..')
const css = (f) => readFileSync(cssPath(f), 'utf8')
const SHEETS = cssFiles().filter((f) => f.endsWith('.css'))

// the same facts, read a second way: the sheet's own readers are not trusted
// to check themselves
const KEYFRAMES = new Set(
  SHEETS.flatMap((f) => [...css(f).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))
)
const USED = new Set(
  SHEETS.flatMap((f) =>
    [...css(f).matchAll(/^\s*animation(?:-name)?:\s*([\w-]+)\s/gm)].map((m) => m[1])
  )
)
const TOKENS = new Map(
  [...css('canvas-tokens.css').matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)].map((m) => [
    m[1],
    m[2].trim(),
  ])
)

const strings = (v) =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(strings)
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(strings)
        : []

describe('the registries say what is true', () => {
  // mutation: sheet.keyframe-undescribed
  it('every keyframe on the site is described, and every description is a keyframe', () => {
    assert.deepEqual(
      [...KEYFRAMES].filter((k) => !(k in MOVES)).sort(),
      [],
      'a move exists in a stylesheet and the sheet never says what it is for'
    )
    assert.deepEqual(
      Object.keys(MOVES)
        .filter((k) => !KEYFRAMES.has(k))
        .sort(),
      [],
      'the sheet describes a move no stylesheet has'
    )
    for (const [name, m] of Object.entries(MOVES)) {
      assert.ok(m.what && m.what.length > 4, `${name} has no description`)
      assert.ok([undefined, 'load'].includes(m.demo), `${name}: an unknown demo`)
    }
  })

  it('the three waveforms are the three frame tokens, with the frames they say', () => {
    for (const w of WAVES) {
      const v = TOKENS.get(`--cv-${w.token}`)
      assert.ok(v, `--cv-${w.token} is not a token`)
      assert.equal(
        Number(/steps\(\s*(\d+)/.exec(v)?.[1]),
        w.steps,
        `${w.token}: the sheet says ${w.steps} frames and the token says ${v}`
      )
    }
    const frames = [...TOKENS.keys()].filter((k) => k.startsWith('--cv-ease-'))
    assert.equal(frames.length, WAVES.length, 'a frame token the sheet does not show')
  })

  it('every gag is real: a kind it has, files that exist, nothing said twice', () => {
    const kinds = new Set(GAG_KINDS.map((k) => k.id))
    const ids = new Set()
    for (const g of GAGS) {
      assert.ok(!ids.has(g.id), `${g.id} is listed twice`)
      ids.add(g.id)
      assert.ok(kinds.has(g.kind), `${g.id}: no kind ${g.kind}`)
      for (const f of ['name', 'where', 'trigger', 'what'])
        assert.ok(g[f] && g[f].length > 2, `${g.id}: no ${f}`)
      assert.ok(g.refs.length > 0, `${g.id}: points at nothing`)
      for (const r of g.refs) assert.ok(existsSync(join(ROOT, r)), `${g.id}: ${r} is gone`)
    }
    for (const k of GAG_KINDS)
      assert.ok(
        GAGS.some((g) => g.kind === k.id),
        `a kind with no gag: ${k.id}`
      )
    assert.ok(GAG_RULES.length >= 3)
  })

  // mutation: sheet.composition-lies
  it('what the sheet says a surface is made of, its files use', () => {
    for (const c of COMPOSITION) {
      for (const f of c.files) assert.ok(existsSync(join(ROOT, f)), `${c.surface}: ${f} is gone`)
      const text = c.files.map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n')
      for (const part of c.parts)
        assert.ok(
          new RegExp(`(^|[^\\w-])${part}([^\\w-]|$)`).test(text),
          `${c.surface}: none of its files uses ${part}`
        )
    }
  })

  it('the missing list is a list: unique, with a reason and a status', () => {
    const ids = new Set()
    for (const m of MISSING) {
      assert.ok(!ids.has(m.id), `${m.id} is listed twice`)
      ids.add(m.id)
      assert.ok(m.name && m.why && m.why.length > 20, `${m.id}: no reason`)
      assert.ok(
        ['proposed', 'baked', 'part', 'open'].includes(m.status),
        `${m.id}: status ${m.status}`
      )
    }
  })

  it('the voice is the voice: no em-dash in anything the sheet says', () => {
    const said = strings([MOVES, WAVES, GAGS, GAG_KINDS, GAG_RULES, MISSING, VOICE, plates()])
    const bad = said.filter((s) => /—|–/.test(s))
    assert.deepEqual(bad.slice(0, 3), [], 'a dash for a pause')
  })
})

describe('what is derived is derived', () => {
  const P = Object.fromEntries(plates().map((p) => [p.id, p]))

  it('the plates are numbered P0 to P9, in a row', () => {
    assert.deepEqual(
      plates().map((p) => p.no),
      Array.from({ length: 10 }, (_, i) => `P${i}`)
    )
    assert.equal(new Set(plates().map((p) => p.id)).size, plates().length)
  })

  it('a swatch is a token that exists, and says what it resolves to', () => {
    const swatches = [
      ...P.display.ground,
      ...P.display.ramp,
      ...P.display.brick,
      ...P.display.content,
      ...P.display.guests.flatMap((g) => g.items),
      ...P.code.syntax,
      ...P.code.ground,
    ]
    assert.ok(swatches.length > 30)
    for (const s of swatches) {
      assert.ok(TOKENS.has(s.css), `${s.css} is not a token`)
      assert.equal(s.value, TOKENS.get(s.css).replace(/\s+/g, ' '))
    }
  })

  it('the ladder is the layout module’s, and the ramp is six greys darkest first', () => {
    assert.deepEqual(
      P.type.ladder.map((r) => r.px),
      [...LADDER]
    )
    assert.deepEqual(
      P.display.ramp.map((s) => s.name),
      ['cv-deep', 'cv-ink', 'cv-mute', 'cv-mid', 'cv-ground', 'cv-bright']
    )
    assert.equal(P.display.bayer.length, 17)
    assert.ok(P.display.bayer.every((g) => g.cells.length === 16))
  })

  // mutation: sheet.dead-keyframe-alive
  it('the motion plate lists every keyframe, and says which no rule uses', () => {
    assert.deepEqual(P.motion.moves.map((m) => m.name).sort(), [...KEYFRAMES].sort())
    for (const m of P.motion.moves) assert.equal(m.used, USED.has(m.name), `${m.name}: used?`)
    const unused = [...KEYFRAMES].filter((k) => !USED.has(k))
    for (const k of unused)
      assert.ok(
        P.missing.surplus.some((s) => s.name.includes(k)),
        `${k} has no user and the sheet does not say so`
      )
  })

  it('the roster is the bar’s: every command anyone can type, none of the owner’s', () => {
    const names = P.personality.commands.map((c) => c.name)
    assert.deepEqual(
      names,
      COMMANDS.filter((c) => c.listed !== false && !c.owner).map((c) => c.name)
    )
    assert.ok(!names.includes('login') && !names.includes('admin'))
  })

  it('the tile vocabulary is shown whole, and what no tile wears is said', () => {
    const keys = P.surfaces.shapes.filter((s) => s.vocabulary).map((s) => s.key)
    assert.deepEqual(keys, ['8x8', '8x5', '5x8', '5x5', '3x3', '2x2'])
    assert.equal(P.surfaces.stacks.length, STACKS.length)
  })
})

describe('/admin/kit: the sheet', () => {
  let app
  let cookie
  before(async () => {
    app = await build({ logger: false })
    cookie = `${SESSION_COOKIE}=${await createSession('node:test sheet')}`
  })
  after(async () => {
    await app.close()
  })
  const get = (headers = {}) =>
    app.inject({ method: 'GET', url: '/admin/kit', headers: { cookie, ...headers } })

  // mutation: sheet.plate-headless
  it('has every plate, each with its head and a way to it from the index', async () => {
    const { statusCode, body } = await get()
    assert.equal(statusCode, 200)
    for (const p of plates()) {
      assert.ok(body.includes(`id="${p.id}"`), `${p.no} ${p.id} has no head on the page`)
      assert.ok(body.includes(`href="#${p.id}"`), `${p.no} ${p.id} is not in the index`)
    }
    for (const sheetCss of ['sheet.css', 'entry.css', 'highlight.css'])
      assert.ok(body.includes(`/css/${sheetCss}`), `${sheetCss} is not loaded`)
  })

  it('sets the display face only as the hero title and as one marked specimen', async () => {
    const { body } = await get()
    const at = body.indexOf('data-specimen')
    assert.ok(at > -1, 'the display face has no specimen')
    const specimen = body.slice(at, body.indexOf('</span>', at))
    const all = [...body.matchAll(/class="px px-display"/g)].length
    const inSpecimen = [...specimen.matchAll(/class="px px-display"/g)].length
    assert.equal(inSpecimen, 6, 'the specimen is six lines of the face')
    assert.equal(all - inSpecimen, 1, 'the display face is set anywhere but the title')
  })

  it('shows code the way a case study does, on the real script’s shell', async () => {
    const { body } = await get()
    assert.match(body, /id="sheetInner"><div class="prose">/)
    assert.match(body, /<div class="code" id="sheet-js" data-lang="js"/)
    assert.match(body, /<pre class="hljs" tabindex="0">/)
    assert.match(body, /class="ln" id="sheet-js-L7"/)
    assert.match(body, /hljs-keyword/)
    assert.match(body, /<a class="ref" href="#sheet-js-L6-L8">/)
    assert.ok(body.includes('/canvas/code-refs.js'), 'the copy key never arrives')
  })

  it('draws every colour from a live token, never a literal', async () => {
    const { body } = await get()
    const vars = [...body.matchAll(/style="--sw: var\((--[\w-]+)\)"/g)].map((m) => m[1])
    assert.ok(vars.length > 30)
    for (const v of vars) assert.ok(TOKENS.has(v), `${v} on the page is not a token`)
  })

  it('answers a terminal with the same plates as text', async () => {
    const r = await get({ 'user-agent': 'curl/8.4.0' })
    assert.equal(r.statusCode, 200)
    assert.match(r.headers['content-type'], /text\/plain/)
    assert.match(r.body, /P5 motion/)
    assert.match(r.body, /cv-tab-in:/)
    assert.match(r.body, /Maurice the ladybug/)
    assert.match(r.body, /the page bar as a part/)
    assert.doesNotMatch(r.body, /<[a-z]+[\s>]/, 'markup in the text page')
  })
})
