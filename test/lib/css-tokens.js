// test/lib/css-tokens.js
// The one CSS reader the token guards share.
//
// It replaces two regex parsers that only worked by accident. bible-sync
// matched `html.dark { ... }` with a non-greedy `}`, so a nested at-rule or a
// brace inside a comment truncated the block silently, and it leaned on file
// order (first declaration wins) for :root to beat the dark block. px-tokens
// harvested `: <n>px` off the raw text, so a token rewritten as calc() dropped
// out of its allowed set and every consumer line went red naming the wrong
// file.
//
// What this does instead: strips comments and strings properly, walks blocks
// with a real depth counter, and resolves each value per theme (light-dark(),
// var() chains with fallbacks, calc() with round() and pow()). Cascade order
// is modelled as tiers, not luck: an @property initial-value is a default,
// :root is the base, and a dark context (html.dark, prefers-color-scheme)
// only ever writes the dark map.
//
// color-mix() is left as a string, since mixing is the browser's job;
// parseColorMix() reads one when a guard wants the parts.
//
// NOTE: a calc() this evaluator cannot fold statically (a percentage against
// layout, a var() the runtime writes) is left verbatim instead of throwing at
// file scope, because an unresolvable-at-parse-time calc is valid CSS, not bad
// input. The throw belongs where a number is actually claimed: evalCalc() and
// pxValue() both fail loudly and say why.

// cascade tiers, low to high. Within a tier the last declaration wins, which
// is what the browser does for equal specificity.
const TIER = { property: 0, base: 1, dark: 2 }

const ROOTISH = /^(?::root|html|:host|\*)\b|^:where\(\s*(?::root|html)\b/
const DARK_SEL = /\.dark\b|\[data-theme\s*=\s*['"]?dark/
const DARK_AT = /prefers-color-scheme\s*:\s*dark/

// ---------------------------------------------------------------- scanning

// index just past the closing quote of the string starting at `i`
function readString(css, i) {
  const quote = css[i]
  let j = i + 1
  while (j < css.length) {
    if (css[j] === '\\') {
      j += 2
      continue
    }
    if (css[j] === quote) return j + 1
    j++
  }
  throw new Error('css-tokens: unterminated string')
}

// WARNING: comments are stripped before anything else looks at braces. A `}`
// or a `;` inside a comment is the exact shape that truncated the old
// html.dark regex.
export function stripComments(css) {
  let out = ''
  let i = 0
  while (i < css.length) {
    const c = css[i]
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      if (end === -1) throw new Error('css-tokens: unterminated comment')
      out += ' '
      i = end + 2
      continue
    }
    if (c === '"' || c === "'") {
      const j = readString(css, i)
      out += css.slice(i, j)
      i = j
      continue
    }
    out += c
    i++
  }
  return out
}

// index of the `)` matching the `(` at `open`
function matchParen(str, open) {
  let depth = 0
  let i = open
  while (i < str.length) {
    const c = str[i]
    if (c === '"' || c === "'") {
      i = readString(str, i)
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  throw new Error(`css-tokens: unbalanced "(" in ${JSON.stringify(str)}`)
}

// index of the first `sep` outside parens and strings, or -1
function indexOfTopLevel(str, sep) {
  let depth = 0
  let i = 0
  while (i < str.length) {
    const c = str[i]
    if (c === '"' || c === "'") {
      i = readString(str, i)
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === sep && depth === 0) return i
    i++
  }
  return -1
}

export function splitTopLevel(str, sep = ',') {
  const parts = []
  let rest = str
  for (;;) {
    const at = indexOfTopLevel(rest, sep)
    if (at === -1) break
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at + 1)
  }
  parts.push(rest.trim())
  return parts
}

const normalize = (value) => value.replace(/\s+/g, ' ').trim()

// Walks every declaration in `css`, brace-aware, and reports the block path it
// sits in (outermost first, the rule's own prelude last).
function walkDeclarations(css, visit) {
  const path = []
  let buf = ''
  let paren = 0
  let i = 0
  const flush = () => {
    const text = buf.trim()
    buf = ''
    if (!text) return
    const colon = indexOfTopLevel(text, ':')
    if (colon === -1) return
    visit({
      path: [...path],
      prop: text.slice(0, colon).trim(),
      value: normalize(text.slice(colon + 1)),
    })
  }
  while (i < css.length) {
    const c = css[i]
    if (c === '"' || c === "'") {
      const j = readString(css, i)
      buf += css.slice(i, j)
      i = j
      continue
    }
    if (c === '(') paren++
    else if (c === ')') paren--
    else if (paren === 0) {
      if (c === '{') {
        path.push(normalize(buf))
        buf = ''
        i++
        continue
      }
      if (c === '}') {
        flush()
        if (!path.length) throw new Error('css-tokens: unbalanced "}"')
        path.pop()
        i++
        continue
      }
      if (c === ';') {
        flush()
        i++
        continue
      }
    }
    buf += c
    i++
  }
  flush()
}

// ------------------------------------------------------------------- calc

const NUMBER = /^\d*\.?\d+(?:[eE][-+]?\d+)?/
const IDENT = /^[a-zA-Z%][a-zA-Z0-9%]*/

function tokenizeCalc(expr) {
  const out = []
  let i = 0
  while (i < expr.length) {
    const rest = expr.slice(i)
    if (/^\s/.test(rest)) {
      i++
      continue
    }
    const num = NUMBER.exec(rest)
    if (num) {
      i += num[0].length
      const unit = IDENT.exec(expr.slice(i))
      if (unit) i += unit[0].length
      out.push({ type: 'num', n: Number(num[0]), unit: unit ? unit[0] : '' })
      continue
    }
    const ident = IDENT.exec(rest)
    if (ident) {
      i += ident[0].length
      out.push({ type: 'fn', text: ident[0].toLowerCase() })
      continue
    }
    if ('()+-*/,'.includes(rest[0])) {
      out.push({ type: rest[0], text: rest[0] })
      i++
      continue
    }
    throw new Error(`css-tokens: cannot evaluate calc(${expr}): stray ${JSON.stringify(rest[0])}`)
  }
  return out
}

const unitOf = (a, b, op, expr) => {
  if (a.unit === b.unit) return a.unit
  if (a.n === 0) return b.unit
  if (b.n === 0) return a.unit
  throw new Error(
    `css-tokens: cannot evaluate calc(${expr}): ${a.unit || '<number>'} ${op} ${b.unit || '<number>'}`
  )
}

function parseSum(p) {
  let left = parseProduct(p)
  for (;;) {
    const t = p.tokens[p.i]
    if (!t || (t.type !== '+' && t.type !== '-')) return left
    p.i++
    const right = parseProduct(p)
    const unit = unitOf(left, right, t.type, p.expr)
    left = { n: t.type === '+' ? left.n + right.n : left.n - right.n, unit }
  }
}

function parseProduct(p) {
  let left = parseUnary(p)
  for (;;) {
    const t = p.tokens[p.i]
    if (!t || (t.type !== '*' && t.type !== '/')) return left
    p.i++
    const right = parseUnary(p)
    if (t.type === '*') {
      if (left.unit && right.unit) {
        throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): ${left.unit} * ${right.unit}`)
      }
      left = { n: left.n * right.n, unit: left.unit || right.unit }
      continue
    }
    if (right.n === 0)
      throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): divide by zero`)
    if (right.unit && right.unit !== left.unit) {
      throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): / ${right.unit}`)
    }
    left = { n: left.n / right.n, unit: right.unit ? '' : left.unit }
  }
}

function parseUnary(p) {
  const t = p.tokens[p.i]
  if (t && (t.type === '-' || t.type === '+')) {
    p.i++
    const v = parseUnary(p)
    return t.type === '-' ? { n: -v.n, unit: v.unit } : v
  }
  return parsePrimary(p)
}

function parseArgs(p, fn) {
  if (p.tokens[p.i]?.type !== '(') {
    throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): ${fn} without arguments`)
  }
  p.i++
  const args = [parseSum(p)]
  while (p.tokens[p.i]?.type === ',') {
    p.i++
    args.push(parseSum(p))
  }
  if (p.tokens[p.i]?.type !== ')') {
    throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): unclosed ${fn}()`)
  }
  p.i++
  return args
}

function parsePrimary(p) {
  const t = p.tokens[p.i]
  if (!t) throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): ran out of input`)
  if (t.type === 'num') {
    p.i++
    return { n: t.n, unit: t.unit }
  }
  if (t.type === '(') {
    p.i++
    const v = parseSum(p)
    if (p.tokens[p.i]?.type !== ')') {
      throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): unclosed "("`)
    }
    p.i++
    return v
  }
  if (t.type === 'fn') {
    p.i++
    const fn = t.text
    if (fn === 'calc') {
      const args = parseArgs(p, fn)
      if (args.length !== 1) {
        throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): calc() takes one expression`)
      }
      return args[0]
    }
    if (fn === 'pow') {
      const args = parseArgs(p, fn)
      if (args.length !== 2 || args[0].unit || args[1].unit) {
        throw new Error(
          `css-tokens: cannot evaluate calc(${p.expr}): pow() takes two plain numbers`
        )
      }
      return { n: Math.pow(args[0].n, args[1].n), unit: '' }
    }
    if (fn === 'round') {
      const args = parseArgs(p, fn)
      if (args.length !== 2) {
        throw new Error(
          `css-tokens: cannot evaluate calc(${p.expr}): round() takes a value and a step`
        )
      }
      const [v, step] = args
      if (step.n === 0) {
        throw new Error(`css-tokens: cannot evaluate calc(${p.expr}): round() step is zero`)
      }
      const unit = unitOf(v, step, 'round', p.expr)
      return { n: Math.round(v.n / step.n) * step.n, unit }
    }
    throw new Error(
      `css-tokens: cannot evaluate calc(${p.expr}): ${fn}() is not supported ` +
        '(round, pow, +, -, *, / only)'
    )
  }
  throw new Error(
    `css-tokens: cannot evaluate calc(${p.expr}): unexpected ${JSON.stringify(t.text)}`
  )
}

// Folds a calc() body to a number and a unit. Throws with the offending
// expression rather than handing back NaN.
export function evalCalc(expr) {
  const p = { tokens: tokenizeCalc(expr), i: 0, expr }
  const v = parseSum(p)
  if (p.i !== p.tokens.length) {
    throw new Error(
      `css-tokens: cannot evaluate calc(${expr}): unexpected ${JSON.stringify(p.tokens[p.i].text ?? String(p.tokens[p.i].n))}`
    )
  }
  return v
}

// 33.000000001 is 33; 0.1 + 0.2 is 0.3. Float noise never reaches a value.
const formatNumber = (n) => String(Number(n.toFixed(6)))
const formatLength = (v) => `${formatNumber(v.n)}${v.unit}`

// ---------------------------------------------------------------- values

// Expands one value against a theme: light-dark() picks a side, var() chains
// resolve (fallbacks included), calc() folds when it can, every other function
// keeps its shape with its arguments expanded.
function expand(value, ctx) {
  let out = ''
  let i = 0
  while (i < value.length) {
    const c = value[i]
    if (c === '"' || c === "'") {
      const j = readString(value, i)
      out += value.slice(i, j)
      i = j
      continue
    }
    const call = /^([-a-zA-Z_][-a-zA-Z0-9_]*)\(/.exec(value.slice(i))
    if (!call) {
      out += c
      i++
      continue
    }
    const open = i + call[0].length - 1
    const close = matchParen(value, open)
    const fn = call[1].toLowerCase()
    const inner = value.slice(open + 1, close)
    out += callValue(fn, inner, ctx)
    i = close + 1
  }
  return out
}

function callValue(fn, inner, ctx) {
  if (fn === 'var') {
    const at = indexOfTopLevel(inner, ',')
    const ref = (at === -1 ? inner : inner.slice(0, at)).trim()
    const fallback = at === -1 ? null : inner.slice(at + 1).trim()
    const hit = lookup(ref, ctx)
    if (hit !== null) return hit
    if (fallback !== null) return expand(fallback, ctx)
    // WARNING: an unknown custom property is left as written. The runtime may
    // set it on an element; a guard that needs a number gets its throw from
    // pxValue() instead, where the claim actually lives.
    return `var(${expand(inner, ctx)})`
  }
  if (fn === 'light-dark') {
    const args = splitTopLevel(inner)
    if (args.length !== 2) {
      throw new Error(`css-tokens: light-dark(${inner}) needs exactly two values`)
    }
    return expand(ctx.theme === 'dark' ? args[1] : args[0], ctx)
  }
  const body = expand(inner, ctx)
  if (fn === 'calc') {
    try {
      return formatLength(evalCalc(body))
    } catch {
      return `calc(${body})`
    }
  }
  return `${fn}(${body})`
}

function lookup(ref, ctx) {
  if (!ref.startsWith('--')) return null
  if (ctx.seen.has(ref)) throw new Error(`css-tokens: var() cycle through ${ref}`)
  const entry = ctx.raw.get(ref)
  if (!entry) return null
  ctx.seen.add(ref)
  const out = expand(entry.value, ctx)
  ctx.seen.delete(ref)
  return out
}

// --------------------------------------------------------------- helpers

const PX = /^(-?\d*\.?\d+)px$/

// The number a length token stands for, or null when the value is not a plain
// length (a shorthand, a duration, a ratio, a calc the browser owns).
export function asPx(value) {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (v === '0') return 0
  const m = PX.exec(v)
  return m ? Number(m[1]) : null
}

export const isColorMix = (value) =>
  typeof value === 'string' && /^color-mix\s*\(/i.test(value.trim())

// { space, stops: [{ color, percent }] } for a color-mix() value, else null.
export function parseColorMix(value) {
  if (!isColorMix(value)) return null
  const inner = value.trim().slice(value.trim().indexOf('(') + 1, -1)
  const [head, ...rest] = splitTopLevel(inner)
  const space = head.replace(/^in\s+/i, '').trim()
  const stops = rest.map((part) => {
    const m = /\s(-?\d*\.?\d+)%$/.exec(part)
    return {
      color: m ? part.slice(0, m.index).trim() : part,
      percent: m ? Number(m[1]) : null,
    }
  })
  return { space, stops }
}

// ----------------------------------------------------------------- public

// Reads every custom property in `css` and returns the resolved light and dark
// views of it. `prefix` filters and strips, so { prefix: '--cv-' } keys the
// maps by 'ink', 'sp-4', 'fs-6'.
export function resolveTokens(css, { prefix = '' } = {}) {
  const raw = { light: new Map(), dark: new Map() }
  let order = 0

  const put = (map, name, value, tier) => {
    const cur = map.get(name)
    if (cur && (cur.tier > tier || (cur.tier === tier && cur.order > order))) return
    map.set(name, { value, tier, order })
  }

  walkDeclarations(stripComments(css), ({ path, prop, value }) => {
    order++
    const owner = path[path.length - 1] ?? ''
    const property = /^@property\s+(--[-\w]+)$/.exec(owner)
    if (property) {
      // NOTE: an initial-value is the fallback a browser uses when nothing
      // declares the property. It must never outrank :root, which is exactly
      // what a naive "last declaration wins" walk would let it do.
      if (prop !== 'initial-value') return
      put(raw.light, property[1], value, TIER.property)
      put(raw.dark, property[1], value, TIER.property)
      return
    }
    if (!prop.startsWith('--')) return
    if (!splitTopLevel(owner).some((sel) => ROOTISH.test(sel))) return
    const isDark = DARK_SEL.test(owner) || path.some((p) => DARK_AT.test(p))
    if (isDark) {
      put(raw.dark, prop, value, TIER.dark)
      return
    }
    put(raw.light, prop, value, TIER.base)
    put(raw.dark, prop, value, TIER.base)
  })

  const view = (theme) => {
    const map = raw[theme]
    const out = Object.create(null)
    for (const [name, entry] of map) {
      if (!name.startsWith(prefix)) continue
      const ctx = { raw: map, theme, seen: new Set([name]) }
      out[name.slice(prefix.length)] = expand(entry.value, ctx)
    }
    return out
  }

  const light = view('light')
  const dark = view('dark')
  const names = [...new Set([...Object.keys(light), ...Object.keys(dark)])].sort()

  // The number a length token stands for. Throws on a missing token or a value
  // that is not a static length, so a rename or a runtime-only value says so
  // instead of arriving as NaN.
  const pxValue = (name, theme = 'light') => {
    const value = (theme === 'dark' ? dark : light)[name]
    if (value === undefined) throw new Error(`css-tokens: no token ${prefix}${name} (${theme})`)
    const n = asPx(value)
    if (n === null) {
      throw new Error(
        `css-tokens: ${prefix}${name} is not a static px length (${theme}: ${JSON.stringify(value)})`
      )
    }
    return n
  }

  return { light, dark, names, pxValue, raw }
}
