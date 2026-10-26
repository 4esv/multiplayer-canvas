// test/motion-tokens.test.js
// BIBLE.md section 9, mechanized. Two things go wrong with motion on this
// site, and neither one of them shows up in a screenshot or a unit test:
//
//   1. A duration or an easing gets written as a literal. The contract says
//      "Durations and easings are tokens. Component CSS never hardcodes
//      either", and nothing was checking, so a rule could quietly pick its
//      own 300ms and its own curve.
//   2. A move gets DROPPED. A pixel pass that makes every surface
//      consistent and left three fades and one teleport behind it: the pile
//      turned by swapping innerHTML with no motion at all, the finder's
//      frame popped in and out, and the collection (the most-used move on
//      the canvas) still rode the camera's curve with an opacity crossfade
//      under it. Every guard in the repo was green the whole time, because
//      a missing animation is an absence and nothing was asserting presence.
//
// So this asserts both: no literals, and the named moves are WIRED. The
// registry below is the second half. It is deliberately a list of the moves
// the contract names, not of every keyframe in the file: a move that section
// 9 promises the reader is a move that has to exist.
//
// THE SNAP (BIBLE.md section 9) made the first half a law about MATERIAL,
// not about tokens: motion is a state machine. A thing holds a pose and
// snaps to the next on a frame, so a stylesheet times a move with one of
// three frame names (--cv-ease-hold, -step, -frames) and nothing else: no
// cubic-bezier, no ease, no linear, not the retired glide or spring, and no
// raw count (steps(3) and steps(6) fold into the three). A count read off
// the thing itself (the marquee walks as many frames as its line has cells
// over) is a frame count too. A move that names a duration and no timing
// function is a tween by default (the initial value is ease), so that is
// caught as well. And opacity never animates: not in a transition, not in a
// keyframe. This reads every stylesheet, the content widgets included,
// because a fade is a fade wherever it plays; the one curve left is the
// camera's, and it is arithmetic in layout.js, never a token.
//
// Escape hatch: `/* motion-ok: reason */` on the declaration's line or one
// of the two above it, same shape as ink-ok and px-ok. The reason is read by
// a person, so it has to say something: three words at least.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { cssFiles, cssPath, cssRel } from './lib/stylesheets.js'

const CANVAS_DIR = join(import.meta.dirname, '../src/static/canvas')
// the shared move module lives in the js tree because it is not the canvas's:
// the desk plays the same moves through it
// the content widgets bring their own motion vocabulary (an instrument's
// key travel, a shake): they are illustrations, not chrome
const EXEMPT = new Set(['highlight.css', 'instruments.css'])
const files = cssFiles().filter((f) => f.endsWith('.css') && !EXEMPT.has(f))
// the material law reads every stylesheet: a fade is a fade in a widget too
const ALL = cssFiles()
  .filter((f) => f.endsWith('.css'))
  .sort()

// keep line structure so an escape can look one line up; strip comment
// BODIES except the escape marker itself
function lines(css) {
  return css
    .replace(/\/\*(?!\s*motion-ok:)[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
}
// an escape counts when its reason is a reason: three words or more
const ESCAPE = /\/\*\s*motion-ok:\s*([^*]*?)\s*\*\//
const reasoned = (l) => {
  const m = ESCAPE.exec(l || '')
  return !!m && m[1].split(/\s+/).filter(Boolean).length >= 3
}
function violations(css, matcher) {
  const ls = lines(css)
  const out = []
  ls.forEach((line, i) => {
    const hit = matcher(line)
    if (!hit) return
    if (!(reasoned(line) || reasoned(ls[i - 1]) || reasoned(ls[i - 2])))
      out.push(`${i + 1}: ${hit}`)
  })
  return out
}

// Every transition and animation declaration WHOLE: a list the formatter
// wraps over several lines is one declaration, and each leg is reported on
// the line it starts on. (The line-at-a-time scan above cannot see a leg on
// the line after its `transition:`, which is where most of them are.)
const SPLIT = /,(?![^(]*\))/
function declarations(css) {
  const src = lines(css).join('\n')
  const lineAt = (i) => src.slice(0, i).split('\n').length
  const out = []
  const re = /(^|[;{\s])((?:transition|animation)(?:-timing-function|-property)?)\s*:\s*([^;{}]*)/g
  for (const m of src.matchAll(re)) {
    const at = m.index + m[1].length
    const valueAt = at + m[0].length - m[1].length - m[3].length
    const legs = []
    let off = 0
    for (const leg of m[3].split(SPLIT)) {
      const lead = leg.match(/^\s*/)[0].length
      legs.push({ text: leg.trim(), line: lineAt(valueAt + off + lead) })
      off += leg.length + 1
    }
    out.push({ prop: m[2], line: lineAt(at), legs })
  }
  return { decls: out, ls: src.split('\n') }
}
const escapedAt = (ls, line) =>
  reasoned(ls[line - 1]) || reasoned(ls[line - 2]) || reasoned(ls[line - 3])

// (no g flag: these are tested one leg at a time, and a global regex keeps
// its lastIndex between calls; the replaces below make their own)
const FRAME = /var\(--cv-ease-(hold|step|frames)\)/
const COUNTED = /\bsteps\(\s*var\(--[\w-]+(?:,[^)]*)?\)\s*(?:,\s*[\w-]+)?\)/
const all = (re) => new RegExp(re.source, 'g')
const CURVE =
  /\bcubic-bezier\([^)]*\)|\blinear\b(?:\([^)]*\))?|\bsteps\([^)]*\)|\bstep-(start|end)\b|\bease(-in-out|-in|-out)?\b|var\(--cv-ease-[\w-]+\)/g
const DURATION = /var\(--cv-dur-[\w-]+\)|(?<![\w.-])\d*\.?\d+m?s\b/

// what is wrong with one leg's timing, or null
function offFrame(prop, leg) {
  if (/^(none|initial|inherit|unset)$/.test(leg)) return null
  const rest = leg.replace(all(FRAME), ' ').replace(all(COUNTED), ' ')
  const curves = rest.match(CURVE)
  if (curves) return curves.join(' ')
  // a shorthand that moves over a duration and names no frames is a tween
  if (
    /^(transition|animation)$/.test(prop) &&
    DURATION.test(leg) &&
    !FRAME.test(leg) &&
    !COUNTED.test(leg)
  )
    return 'no timing function (the initial value is ease)'
  return null
}

// a declaration line that carries timing: the shorthands and the longhands
const TIMED = /\b(transition|animation)(-duration|-delay|-timing-function)?\s*:\s*([^;}]+)/
// 0 is not a duration, it is the absence of one
const ZERO = /^0(ms|s)?$/

describe('motion comes from the tokens (BIBLE.md section 9)', () => {
  for (const file of files) {
    const css = readFileSync(cssPath(file), 'utf8')

    // mutation: motion-tokens.css-literal-duration
    it(`${file}: durations and delays are --cv-dur-* tokens`, () => {
      const hits = violations(css, (line) => {
        const m = line.match(TIMED)
        if (!m) return null
        const bad = (m[3].match(/(?<![\w.-])\d+(\.\d+)?m?s\b/g) || []).filter((v) => !ZERO.test(v))
        return bad.length ? `${m[1]}${m[2] || ''}: ${bad.join(' ')}` : null
      })
      assert.deepEqual(hits, [], `${file} hardcodes a duration: ${hits.join(' | ')}`)
    })
  }

  for (const file of ALL) {
    const css = readFileSync(cssPath(file), 'utf8')
    const rel = cssRel(file)

    // mutation: motion-tokens.css-literal-easing, motion-tokens.glide-on-material, motion-tokens.linear-tween
    it(`${file}: every move is timed in frames (hold, step, frames), never a curve`, () => {
      const { decls, ls } = declarations(css)
      const hits = []
      for (const d of decls) {
        if (d.prop.endsWith('-property')) continue
        for (const leg of d.legs) {
          const why = offFrame(d.prop, leg.text)
          if (why && !escapedAt(ls, d.line) && !escapedAt(ls, leg.line))
            hits.push(`${rel}:${leg.line}: ${d.prop}: ${leg.text} (${why})`)
        }
      }
      assert.deepEqual(
        hits,
        [],
        `a move on a curve:\n  ${hits.join('\n  ')}\n` +
          `Time it with var(--cv-ease-hold), var(--cv-ease-step) or var(--cv-ease-frames).`
      )
    })

    // mutation: motion-tokens.opacity-keyframe, motion-tokens.fan-member-fades
    it(`${file}: opacity never animates, in a transition or a keyframe`, () => {
      const { decls, ls } = declarations(css)
      const hits = []
      for (const d of decls) {
        if (!/^transition(-property)?$/.test(d.prop)) continue
        for (const leg of d.legs)
          if (
            /^(opacity|all)\b/.test(leg.text) &&
            !escapedAt(ls, d.line) &&
            !escapedAt(ls, leg.line)
          )
            hits.push(`${rel}:${leg.line}: ${d.prop}: ${leg.text}`)
      }
      // every opacity inside a @keyframes block, found brace by brace
      const src = ls.join('\n')
      for (const k of src.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
        let depth = 1
        let i = k.index + k[0].length
        const start = i
        while (i < src.length && depth) {
          if (src[i] === '{') depth++
          else if (src[i] === '}') depth--
          i++
        }
        const kLine = src.slice(0, k.index).split('\n').length
        const body = src.slice(start, i)
        for (const o of body.matchAll(/(^|[;{\s])opacity\s*:/g)) {
          const line = src.slice(0, start + o.index + o[1].length).split('\n').length
          if (!escapedAt(ls, line) && !escapedAt(ls, kLine))
            hits.push(`${rel}:${line}: @keyframes ${k[1]} animates opacity`)
        }
      }
      assert.deepEqual(
        hits,
        [],
        `opacity animates:\n  ${hits.join('\n  ')}\n` +
          `Appear and leave with a cut or a wipe stepped on the cell.`
      )
    })

    // mutation: motion-tokens.thin-escape
    it(`${file}: every motion-ok escape gives a reason`, () => {
      const thin = []
      css.split('\n').forEach((l, i) => {
        if (ESCAPE.test(l) && !reasoned(l)) thin.push(`${rel}:${i + 1}: ${l.trim()}`)
      })
      assert.deepEqual(thin, [], `a motion-ok with no reason:\n  ${thin.join('\n  ')}`)
    })
  }

  // mutation: motion-tokens.move-literal-duration
  it('the move module reads every duration from a token', () => {
    // The JS scan below only sees inline transition strings. A move module
    // computes frame counts from a duration directly, so the duration itself
    // is the thing to pin: every `dur` in it must come out of ms(), which
    // reads --cv-dur-* off the live stylesheet.
    const bad = []
    MOVES_MOD.split('\n').forEach((line, i) => {
      const m = line.match(/\b(dur|duration)\s*=\s*(.+)$/)
      if (m && !/\bms\(/.test(m[2])) bad.push(`${i + 1}: ${line.trim().slice(0, 70)}`)
    })
    assert.deepEqual(bad, [], `pixel-moves.js hardcodes a duration: ${bad.join(' | ')}`)
  })

  // mutation: motion-tokens.script-literal-timing
  it('the canvas scripts never write a literal duration or easing', () => {
    // app.js sets transitions inline for the FLIPs (a member out of its pile,
    // a page out of its card), which is the one place a value is computed per
    // element. The value may be computed; the TIMING may not.
    const hits = []
    const scripts = [
      ...readdirSync(CANVAS_DIR)
        .filter((n) => n.endsWith('.js'))
        .map((n) => [CANVAS_DIR, n]),
      // the engine's scripts, the moves among them
      ...readdirSync(join(import.meta.dirname, '../primitives'), { recursive: true })
        .filter((n) => n.endsWith('.js'))
        .map((n) => [join(import.meta.dirname, '../primitives'), n]),
    ]
    for (const [dir, f] of scripts) {
      readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // an inline transition, or a duration computed in a move module:
          // both are timing and both have to come from a token
          const m = line.match(/style\.(transition|animation)\s*=\s*(.+)$/)
          if (!m) return
          const v = m[2]
          if (/^'none'|^"none"|^''|^""/.test(v.trim())) return
          const timing = (v.match(/(?<![\w.-])\d+(\.\d+)?m?s\b/g) || []).filter(
            (x) => !ZERO.test(x)
          )
          const curve = v.match(/cubic-bezier\(/)
          if (timing.length || curve) hits.push(`${f}:${i + 1}: ${v.trim().slice(0, 80)}`)
        })
    }
    assert.deepEqual(hits, [], `a canvas script hardcodes timing: ${hits.join(' | ')}`)
  })
})

// ---- the registry: the moves section 9 promises are WIRED --------------------
// Each entry is a move the contract names in prose. If one is deleted or
// quietly turned back into a fade, this fails and says which promise broke.
const HOME = readFileSync(cssPath('canvas-home.css'), 'utf8')
const APP = readFileSync(join(CANVAS_DIR, 'app.js'), 'utf8')
const MOVES_MOD = readFileSync(join(import.meta.dirname, '../primitives/pixel-moves.js'), 'utf8')

const MOVES = [
  [
    'a collection opens and closes on ZOOM RECTS, out of its pile and back',
    () =>
      /zoomRects\(pile, fanFrameRect\(\)\)/.test(APP) &&
      /zoomRects\(fanFrameRect\(\), stackRect\(kind\)\)/.test(APP),
  ],
  [
    'an item TRAVELS, and the marquee rides it rather than replacing it',
    () => {
      // Both halves, or neither works. Outline over a hidden target is a
      // teleport with a decoration on it; the element moving alone is ground
      // scaling on the ground. They run on the same path for the same eight
      // frames, which is the whole fix.
      const grow = APP.slice(APP.indexOf('function growFrom'), APP.indexOf('function shrinkTo'))
      return (
        /sheetEl\.style\.transform = `translate/.test(grow) && /zoomRects\(rect, to\)/.test(grow)
      )
    },
  ],
  [
    'walking to the next item goes back into the collection and out again',
    () => /zoomRects\(sheetBox, a,/.test(APP) && /zoomRects\(b, r2\.width/.test(APP),
  ],
  [
    'a FULL PAGE grows out of its card like everything else, with no cover',
    () => {
      // There were two vocabularies: rects for items, an iris for pages that
      // stand on their own. A visitor cannot tell which they are about to
      // get, and they watched themselves click the card either way, so the
      // cover is gone and growFrom accepts a full page.
      // the names, not the word: both files explain in prose why the iris
      // went, and a guard that cannot tell a call from an epitaph would make
      // the explanation unwritable
      const noCover = !/\b(irisOut|irisIn|pageSwap|spiralOut|spiralOrder)\s*[(=]/.test(
        MOVES_MOD + APP
      )
      const grow = APP.slice(APP.indexOf('function growFrom'), APP.indexOf('function shrinkTo'))
      return noCover && /contains\('fullpage'\)/.test(grow) && /const isFull =/.test(APP)
    },
  ],
  [
    'a full page closes back into the seat it came out of',
    () =>
      /m0\.contains\('preview'\) \|\| m0\.contains\('fullpage'\)/.test(APP) &&
      /shrinkTo\(seat, settle\)/.test(APP),
  ],
  [
    'a full page carries its way back and its way onward',
    () => /function paintPageBar/.test(APP) && /pageBarMarkup\(\{/.test(APP),
  ],
  [
    'a tab switches its page in place, top to bottom in frames on the quick token',
    () =>
      /@keyframes cv-tab-in \{/.test(HOME) &&
      /function switchTab\(/.test(APP) &&
      /inner\.classList\.add\('tab-in'\);/.test(APP),
  ],
  ['destruction POOFS', () => /export function poof/.test(MOVES_MOD)],
  [
    'the moves work on a BOX, so they run off the canvas too',
    () => /getBoundingClientRect/.test(MOVES_MOD) && /export function poof/.test(MOVES_MOD),
  ],
  [
    'a rect with no box is refused rather than marched to the origin',
    () => /const usable =/.test(MOVES_MOD) && /usable\(from\) \|\| !usable\(to\)/.test(MOVES_MOD),
  ],
  [
    'the marquee is TWO INKS, or it disappears into whatever is behind it',
    () => {
      // It was one ink on every other cell, and the collection's scrim is the
      // same colour as the ink: the move ran for 320ms and painted nothing
      // anybody could see. No single colour works, because the backdrop
      // changes from ground to scrim during the move.
      const zr = MOVES_MOD.slice(MOVES_MOD.indexOf('export function zoomRects'))
      return /const a1 = ink\('ink'\)/.test(zr) && /const a2 = ink\('ground'\)/.test(zr)
    },
  ],
  [
    'the tally digits BURN',
    () => /@keyframes cv-burn/.test(HOME) && /@keyframes cv-rise/.test(HOME),
  ],
  [
    'hover rings a card in its ink and a press rings it brick; nothing lifts',
    () => /\.openable:hover \.cell/.test(HOME) && /\.openable:active \.cell/.test(HOME),
  ],
  [
    'the pile TURNS: the next card rises out of the pile it was in',
    () =>
      /@keyframes cv-turn-up\s*\{/.test(HOME) &&
      /function turnUp\(/.test(APP) &&
      /if\(turning\) turnUp\(f\)/.test(APP),
  ],
  [
    'the bottom sheet slides up and back down (a move with a rendered first frame)',
    () =>
      /function slideUp\(/.test(APP) &&
      /function slideDown\(/.test(APP) &&
      /void mscroll\.offsetHeight/.test(APP),
  ],
  [
    'NOTHING arrives at boot, and the dither is gone for good',
    () => {
      // Both were tried and both came out. The guard names them so that
      // "material arrives through an ordered dither" cannot quietly return
      // as the answer to every question again.
      const noDither = !/cv-dither/.test(HOME) && !/materialize\(/.test(APP)
      return noDither && /function initialReveal\(\)\{\}/.test(APP)
    },
  ],
]

describe('the moves BIBLE.md section 9 promises are wired', () => {
  for (const [name, check] of MOVES) {
    // tripwire: each entry is a move BIBLE.md section 9 promises in prose, so
    // the list changes when the contract does and never quietly
    it(name, () => assert.ok(check(), `${name}: the move is gone`))
  }

  // mutation: motion-tokens.fan-member-fades
  it('nothing on the canvas fades', () => {
    // The fades this pass removed, named so they cannot come back by habit:
    // a member's opacity crossfade, the preview cycle's, and the roster's.
    assert.ok(
      !/#fan \.member\s*\{[^}]*opacity/.test(HOME),
      'a fan member fades again: material arrives through the dither'
    )
    assert.ok(
      !/sheet\.style\.opacity\s*=/.test(APP),
      'the preview cycle crossfades again: the geometry is the whole move'
    )
  })
})
