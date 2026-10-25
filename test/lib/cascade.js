// test/lib/cascade.js
// The cascade, small enough to trust, for guards that ask what a stylesheet
// DOES to an element rather than what it says.
//
// A guard that matches rule text passes as long as the rule is still written
// down, even when a later rule overrides it. This one answers the question
// the browser answers: of every rule whose selector matches this element at
// this width, which declaration wins (importance, then specificity, then
// source order, last one wins).
//
// What it models, and what it does not:
//   - selectors: type, .class, #id, [attr], [attr='v'], joined by descendant
//     or child combinators (a child combinator is read as a descendant, which
//     can only match MORE, so a guard that wants display:none is not fooled).
//     A compound with a pseudo-class or pseudo-element never matches: the
//     element is modelled at rest, not hovered, focused or ::before.
//   - @media: min-width and max-width against the width asked for; any other
//     feature (forced-colors, prefers-*, print) is false, as on a default
//     screen. Other at-rules (@font-face, @keyframes, @supports) are skipped.
//   - the element's own stylesheet only. The UA sheet and other stylesheets
//     on the page are out of scope; `initial` means nothing here matched.
import { stripComments, splitTopLevel } from './css-tokens.js'

// flat rules: { selectors, decls, media, order }
export function cssRules(css) {
  const src = stripComments(css)
  const rules = []
  const walk = (text, media) => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf('{', i)
      if (open === -1) break
      // a statement at-rule (@import ...;) ends before the head starts
      const head = text.slice(i, open).split(';').pop().trim()
      let depth = 1
      let j = open + 1
      for (; j < text.length && depth; j++) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') depth--
      }
      const body = text.slice(open + 1, j - 1)
      if (/^@media\b/.test(head)) walk(body, [...media, head.slice(6).trim()])
      else if (!head.startsWith('@'))
        rules.push({
          selectors: splitTopLevel(head),
          decls: declarations(body),
          media,
          order: rules.length,
        })
      i = j
    }
  }
  walk(src, [])
  return rules
}

function declarations(body) {
  const out = []
  for (const part of splitTopLevel(body, ';')) {
    const at = part.indexOf(':')
    if (at === -1) continue
    const prop = part.slice(0, at).trim()
    let value = part.slice(at + 1).trim()
    const important = /!\s*important$/.test(value)
    if (important) value = value.replace(/!\s*important$/, '').trim()
    out.push({ prop, value, important })
  }
  return out
}

function mediaApplies(query, width) {
  return splitTopLevel(query).some((alt) =>
    alt
      .split(/\band\b/)
      .map((f) => f.trim())
      .filter(Boolean)
      .every((f) => {
        const m = f.match(/^\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)$/)
        if (!m) return false
        return m[1] === 'min' ? width >= Number(m[2]) : width <= Number(m[2])
      })
  )
}

// a compound selector, parsed: { tag, ids, classes, attrs, pseudo }
function compound(text) {
  const c = { tag: null, ids: [], classes: [], attrs: [], pseudo: false }
  const re =
    /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(['"]?)([^'"\]]*)\5)?\]|(::?[\w-]+(?:\([^)]*\))?)|(\*)/g
  let m
  let seen = 0
  while ((m = re.exec(text))) {
    seen += m[0].length
    if (m[1]) c.tag = m[1].toLowerCase()
    else if (m[2]) c.ids.push(m[2])
    else if (m[3]) c.classes.push(m[3])
    else if (m[4]) c.attrs.push({ name: m[4], value: m[6] })
    else if (m[7]) c.pseudo = true
  }
  // anything the pattern could not read is a selector this model does not know
  if (seen !== text.length) c.pseudo = true
  return c
}

function parseSelector(sel) {
  return sel
    .trim()
    .replace(/\s*>\s*/g, ' ')
    .split(/\s+/)
    .map(compound)
}

function specificity(parts) {
  let a = 0
  let b = 0
  let c = 0
  for (const p of parts) {
    a += p.ids.length
    b += p.classes.length + p.attrs.length
    if (p.tag) c++
  }
  return a * 1e6 + b * 1e3 + c
}

// el: { tag, id?, classes: [], attrs: { name: value } }
function matchesCompound(p, el) {
  if (p.pseudo) return false
  if (p.tag && p.tag !== el.tag) return false
  if (p.ids.some((id) => id !== el.id)) return false
  if (p.classes.some((k) => !el.classes.includes(k))) return false
  const attrs = el.attrs || {}
  return p.attrs.every(
    (a) => a.name in attrs && (a.value === undefined || attrs[a.name] === a.value)
  )
}

// descendant-only chains match greedily: the nearest ancestor that fits a
// compound is never a worse choice than a farther one
function matches(parts, chain) {
  let k = chain.length - 1
  if (!matchesCompound(parts[parts.length - 1], chain[k])) return false
  for (let i = parts.length - 2; i >= 0; i--) {
    do k--
    while (k >= 0 && !matchesCompound(parts[i], chain[k]))
    if (k < 0) return false
  }
  return true
}

// The winning value of `prop` for the LAST element of `chain` (ancestors
// first) at `width` css pixels, or 'initial' when no rule matched.
export function computed(rules, chain, prop, width) {
  let best = null
  for (const r of rules) {
    if (!r.media.every((q) => mediaApplies(q, width))) continue
    const decl = r.decls.findLast((d) => d.prop === prop)
    if (!decl) continue
    for (const sel of r.selectors) {
      const parts = parseSelector(sel)
      if (!matches(parts, chain)) continue
      const rank = [decl.important ? 1 : 0, specificity(parts), r.order]
      if (
        !best ||
        rank[0] > best.rank[0] ||
        (rank[0] === best.rank[0] &&
          (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] >= best.rank[2])))
      )
        best = { rank, value: decl.value }
    }
  }
  return best ? best.value : 'initial'
}

// The opening tag of the first element carrying `cls` in rendered html, as
// an element for computed(): the page decides what the element is, not a
// copy of the template in the test.
export function elementOf(html, cls) {
  const m = html.match(
    new RegExp(`<([a-zA-Z][\\w-]*)\\b([^>]*\\bclass="[^"]*(?<![\\w-])${cls}(?![\\w-])[^"]*"[^>]*)>`)
  )
  if (!m) return null
  const attrs = {}
  for (const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? ''
  return {
    tag: m[1].toLowerCase(),
    id: attrs.id,
    classes: (attrs.class || '').split(/\s+/).filter(Boolean),
    attrs,
  }
}
