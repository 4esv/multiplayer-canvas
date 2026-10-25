// scripts/verify/off-cell.mjs
// Issue #299: WHAT IS STILL OFF THE CELL, COMPUTED FROM THE TREE. The site follows
// one toolkit (BIBLE.md section 10); this lists every surface that does not
// yet, so the follow-up issues work from a list and not from memory. It is
// an inventory, not a gate: it always exits 0.
//
// Five kinds of finding:
//   svg      an inline <svg> in content/ or src/templates/, or a .svg file
//            under src/static/img/ that is not on the cell (crispEdges, an
//            integer viewBox, no curve in any path)
//   soft     chrome that is not pixels: a border-radius that is not zero, a
//            box-shadow with a blur (a hard one-cell cast is the law's own),
//            a gradient, an opacity fade (a transition or keyframe on it)
//   font     a family other than the type face (DotGothic16) outside code (code is a selector
//            naming pre, code, kbd, samp or hljs, or highlight.css)
//   off-cell an image drawn at a width or height that is not a whole number
//            of cells (PX in layout.js)
//
// Then a per-surface table for the pages the follow-up issues name: the
// experiments, every case study, the case-study page and card, and the
// weather. A CSS finding belongs to a surface when its selector names the
// surface's class; a file finding when the file is the surface's own.
//
// Usage: node scripts/verify/off-cell.mjs [--all]
//   --all  prints every finding under the table, not just the table
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import matter from 'gray-matter'
import { PX } from '../../src/static/canvas/layout.js'
import { kindOf, CASE_STUDY, EXPERIMENT } from '../../src/lib/entry-kind.js'

const ROOT = resolve(import.meta.dirname, '..', '..')
const ALL = process.argv.includes('--all')
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.includes('/vendor/'))
const read = (f) => readFileSync(join(ROOT, f), 'utf8')
const lineAt = (text, i) => text.slice(0, i).split('\n').length

const findings = [] // { kind, file, line, what, selector }
const add = (kind, file, line, what, selector = '') =>
  findings.push({ kind, file, line, what: what.trim().replace(/\s+/g, ' '), selector })

// ---------------------------------------------------------------- svg

const onTheCell = (svg) =>
  /shape-rendering="crispEdges"/.test(svg) &&
  /viewBox="\d+ \d+ \d+ \d+"/.test(svg) &&
  ![...svg.matchAll(/\sd="([^"]*)"/g)].some((m) => /[cCsSqQtTaA]/.test(m[1])) &&
  !/<(circle|ellipse)\b/.test(svg)
// An inline drawing is held to the same test, plus what only markup can
// smuggle in: a face of its own, a rotation, a fade (#300: the case-study
// figures were redrawn by scripts/img/figures.mjs and leave the list by
// passing it). A word is <text> with no face on it: the page sets it in its
// body face (author, 2026-09-24), so a figure reads with the prose.
const inlineOnTheCell = (svg) =>
  onTheCell(svg) && !/<text\b[^>]*\b(font-family|font|style)=|\btransform=|opacity=/.test(svg)
const MARKUP = files.filter((f) => /^(content\/.*\.md|src\/templates\/.*\.njk)$/.test(f))
for (const f of MARKUP) {
  const t = read(f)
  for (const m of t.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g))
    if (!inlineOnTheCell(m[0])) add('svg', f, lineAt(t, m.index), m[0].slice(0, 80))
}
for (const f of files.filter((f) => /^src\/static\/img\/.*\.svg$/.test(f)))
  if (!onTheCell(read(f))) add('svg', f, 1, 'svg file off the cell')

// ---------------------------------------------------------------- css

// declarations with the selector they sit under and their line
function* declarations(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const stack = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      stack.push(text.slice(start, i).trim())
      start = i + 1
    } else if (ch === '}' || ch === ';') {
      const decl = text.slice(start, i)
      const m = decl.match(/^\s*([-\w]+)\s*:([\s\S]*)$/)
      if (m) {
        const at = start + decl.search(/\S/)
        yield {
          prop: m[1].toLowerCase(),
          value: m[2].trim(),
          selector: stack.join(' > '),
          line: lineAt(text, at),
        }
      }
      if (ch === '}') stack.pop()
      start = i + 1
    }
  }
}

const CODE = /\b(pre|code|kbd|samp|hljs)\b/

// first pass over every stylesheet: the custom properties (so a radius of
// var(--cv-r) is judged by what --cv-r is) and how each keyframe is run (an
// opacity keyframe run on steps() is a blink, not a fade)
const CSS_FILES = files.filter((f) => /^src\/static\/css\/.*\.css$/.test(f))
const tokens = new Map()
const runs = new Map() // keyframe name -> [animation values]
for (const f of CSS_FILES)
  for (const d of declarations(read(f))) {
    if (d.prop.startsWith('--') && !tokens.has(d.prop)) tokens.set(d.prop, d.value)
    if (d.prop === 'animation' || d.prop === 'animation-name')
      for (const part of d.value.split(/,(?![^(]*\))/))
        for (const w of part.trim().split(/\s+/)) {
          if (!runs.has(w)) runs.set(w, [])
          runs.get(w).push(part)
        }
  }
const resolveVars = (v, depth = 0) =>
  depth > 8
    ? v
    : v.replace(/var\(\s*(--[-\w]+)\s*(?:,([^()]*))?\)/g, (_, name, fb) =>
        resolveVars(tokens.get(name) ?? fb ?? '', depth + 1)
      )
const stepped = (v) => /steps\(/.test(resolveVars(v))
const fadeValue = (v) =>
  v.split(/,(?![^(]*\))/).some((part) => /\b(opacity|all)\b/.test(part) && !stepped(part))
const fadingKeyframe = (name) => {
  const uses = runs.get(name) ?? []
  return !uses.length || uses.some((u) => !stepped(u))
}
const blurred = (v) =>
  v !== 'none' &&
  v.split(/,(?![^(]*\))/).some((s) => {
    // a calc() is a length; a colour function, a hex or a keyword is not
    const lens = s
      .replace(/\b(?:calc|min|max|clamp)\((?:[^()]|\([^()]*\))*\)/g, ' 1 ')
      .replace(/\b(inset)\b|#[0-9a-f]+|\w+\((?:[^()]|\([^()]*\))*\)|[a-z-]{3,}/gi, ' ')
      .trim()
      .split(/\s+/)
    return lens.length >= 3 && parseFloat(lens[2]) > 0
  })
const nonZeroRadius = (v) => !/^(0|0px|0%|none|initial|unset|)$/.test(v.trim())

function cssFindings(file, css) {
  for (const d of declarations(css)) {
    const sel = d.selector
    const kf = /@keyframes\s+([-\w]+)/.exec(sel)
    const inKeyframes = kf ? kf[1] : null
    if (d.prop === 'border-radius' || /^border-.*-radius$/.test(d.prop)) {
      if (
        resolveVars(d.value)
          .split(/\s+/)
          .some((r) => nonZeroRadius(r))
      )
        add('soft', file, d.line, `${d.prop}: ${d.value} (${resolveVars(d.value)})`, sel)
    } else if (d.prop === 'box-shadow') {
      if (blurred(resolveVars(d.value))) add('soft', file, d.line, `box-shadow: ${d.value}`, sel)
    } else if (/gradient\(/.test(d.value)) {
      add('soft', file, d.line, `${d.prop}: ${d.value.slice(0, 60)}`, sel)
    } else if (/^transition(-property)?$/.test(d.prop) && fadeValue(d.value)) {
      add('soft', file, d.line, `${d.prop}: ${d.value}`, sel)
    } else if (d.prop === 'opacity' && inKeyframes && fadingKeyframe(inKeyframes)) {
      add('soft', file, d.line, `@keyframes ${inKeyframes} opacity: ${d.value}`, sel)
    } else if (d.prop === 'font-family' || d.prop === 'font') {
      const v = d.value
      if (sel.startsWith('@font-face')) continue
      if (/var\(--cv-font\)|'DotGothic16'|\binherit\b/.test(v)) continue
      if (d.prop === 'font' && !/,|var\(|'|"|serif|sans|mono|system-ui/.test(v)) continue
      if (CODE.test(sel) || file.endsWith('highlight.css')) continue
      add('font', file, d.line, `${d.prop}: ${v}`, sel)
    } else if (/^(width|height)$/.test(d.prop) && /\bimg\b/.test(sel)) {
      for (const n of d.value.matchAll(/(\d+(?:\.\d+)?)px/g))
        if (Number(n[1]) % PX) add('off-cell', file, d.line, `${d.prop}: ${d.value}`, sel)
    }
  }
}
for (const f of CSS_FILES) cssFindings(f, read(f))

// inline <style> blocks and style="" attributes in markup
for (const f of MARKUP) {
  const t = read(f)
  for (const m of t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const before = findings.length
    cssFindings(f, m[1])
    const offset = lineAt(t, m.index) - 1
    for (const x of findings.slice(before)) x.line += offset
  }
  for (const m of t.matchAll(/\sstyle="([^"{]*)"/g)) {
    const before = findings.length
    cssFindings(f, `x{${m[1]}}`)
    for (const x of findings.slice(before)) {
      x.line = lineAt(t, m.index)
      x.selector = 'style=""'
    }
  }
}

// ---------------------------------------------------------------- js

// the canvas and page scripts: inline style strings, canvas fonts, and the
// width/height an <img> is drawn at
const SCRIPTS = files.filter(
  (f) => /^src\/static\/(canvas|js)\/.*\.js$/.test(f) || /^src\/lib\/.*\.js$/.test(f)
)
for (const f of SCRIPTS) {
  const t = read(f)
  for (const m of t.matchAll(/\.font\s*=\s*([`'"][^`'"]*[`'"])/g))
    if (!/DotGothic16|--cv-font\b/.test(m[1]))
      add('font', f, lineAt(t, m.index), `ctx.font = ${m[1]}`)
  for (const m of t.matchAll(/(?:border-radius|borderRadius)\s*[:=]\s*['"`]?([^;'"`,}]+)/g))
    if (nonZeroRadius(m[1])) add('soft', f, lineAt(t, m.index), m[0])
  for (const m of t.matchAll(
    /(?:linear|radial|conic)-gradient\(|create(?:Linear|Radial|Conic)Gradient\(/g
  ))
    add('soft', f, lineAt(t, m.index), m[0])
}

// ---------------------------------------------------------------- images

for (const f of [...MARKUP, ...SCRIPTS]) {
  const t = read(f)
  for (const m of t.matchAll(/<img\b[^>]*>/g)) {
    for (const a of m[0].matchAll(/\b(width|height)="(\d+)"/g))
      if (Number(a[2]) % PX)
        add('off-cell', f, lineAt(t, m.index), `${a[1]}="${a[2]}" on ${m[0].slice(0, 60)}`)
  }
}

// ---------------------------------------------------------------- surfaces

const entries = files
  .filter((f) => /^content\/feed\/.*\.md$/.test(f))
  .map((f) => {
    const { data } = matter(read(f))
    return {
      file: f,
      slug: f.split('/').pop().slice(0, -3),
      type: data.type,
      webOnly: data.web_only === true,
    }
  })
const own =
  (...paths) =>
  (x) =>
    paths.includes(x.file)
const bySelector = (re) => (x) => re.test(x.selector)
const SURFACES = [
  {
    name: 'web-instruments',
    has: own(
      'content/feed/web-instruments.md',
      'src/static/css/instruments.css',
      'src/static/js/instruments.js'
    ),
  },
  ...entries
    .filter((e) => kindOf(e) === EXPERIMENT && e.slug !== 'web-instruments')
    .map((e) => ({ name: e.slug, has: own(e.file) })),
  ...entries
    .filter((e) => kindOf(e) === CASE_STUDY)
    .map((e) => ({ name: `case study: ${e.slug}`, has: own(e.file) })),
  { name: 'case-study page (shared)', has: own('src/static/css/case-study.css') },
  { name: 'case-study card', has: bySelector(/\.t-article\b/) },
  {
    name: 'weather',
    has: (x) => bySelector(/[.-]weather\b/)(x) || own('src/services/weather.js')(x),
  },
]
const KINDS = ['svg', 'soft', 'font', 'off-cell']
const count = (list) => KINDS.map((k) => list.filter((x) => x.kind === k).length)

console.log(`# What is still off the cell (#299)\n`)
console.log(
  `Computed by \`node scripts/verify/off-cell.mjs\` at ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()}. Cell = ${PX}px.\n`
)
console.log(`## By surface\n`)
console.log(`| Surface | svg | soft | font | off-cell | where |`)
console.log(`| --- | --- | --- | --- | --- | --- |`)
for (const s of SURFACES) {
  const mine = findings.filter(s.has)
  const where = [...new Set(mine.map((x) => `${x.file}:${x.line}`))]
  const shown = where
    .slice(0, 6)
    .map((w) => `\`${w}\``)
    .join(' ')
  console.log(
    `| ${s.name} | ${count(mine).join(' | ')} | ${shown}${where.length > 6 ? ` +${where.length - 6}` : ''} |`
  )
}
console.log(`\n## By file (everything)\n`)
console.log(`| File | svg | soft | font | off-cell |`)
console.log(`| --- | --- | --- | --- | --- |`)
const byFile = Map.groupBy(findings, (x) => x.file)
for (const [f, list] of [...byFile].sort((a, b) => a[0].localeCompare(b[0])))
  console.log(`| \`${f}\` | ${count(list).join(' | ')} |`)
const totals = count(findings)
console.log(`| **total** | ${totals.join(' | ')} |`)
if (ALL) {
  console.log(`\n## Every finding\n`)
  for (const x of findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line))
    console.log(
      `- ${x.kind} \`${x.file}:${x.line}\` ${x.selector ? `\`${x.selector.slice(0, 50)}\` ` : ''}${x.what.slice(0, 100)}`
    )
}
