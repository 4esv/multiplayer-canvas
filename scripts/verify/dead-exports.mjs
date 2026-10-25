// scripts/verify/dead-exports.mjs
// Issue #263: AN EXPORT NOBODY IMPORTS IS A CORPSE OR A SEAM, AND IT SAYS WHICH.
//
// Every module under src/ and scripts/ (vendor excluded) is read for what it
// exports, and every module under src/, scripts/ and test/ for what it
// imports. An export with no importer outside test/ is one of two things:
//
//   a seam    only a test reaches it, on purpose. It carries an `_` prefix or
//             a `// seam:` line in the comment block directly above it.
//   a corpse  nothing reaches it, or only a test does and nobody said so.
//
// A corpse fails the run. The fix is to delete it, drop the `export` if the
// module still uses it, or mark it as a seam if a test is why it exists.
//
// Import resolution covers every shape the tree uses: relative specifiers,
// the server's static URLs (`/canvas/x.js`, `/js/x.js` under src/static),
// named, default and namespace imports (a namespace counts only the members
// it reads, unless it escapes whole), `export ... from`, and dynamic import
// (destructured counts its names, bound to a name reads like a namespace,
// anything else counts the module whole).
// Pure text, no parser: the tree's export statements are all top-level and
// one of a handful of shapes, and an unrecognised shape is simply not seen.
//
// Usage: node scripts/verify/dead-exports.mjs   (exit 1 on any corpse)
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const STATIC = join(ROOT, 'src', 'static')

const tracked = execFileSync('git', ['ls-files', 'src', 'scripts', 'test'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.m?js$/.test(f) && !/(^|\/)vendor\//.test(f))

const isTest = (f) => f.startsWith('test/')
const exporters = tracked.filter((f) => !isTest(f))

/** @type {Map<string, {name: string, line: number, seam: boolean}[]>} */
const exportsOf = new Map()

const exportedNames = (list) =>
  list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .split(/\s+as\s+/)
        .pop()
        .trim()
    )

function isSeam(lines, i, name) {
  if (name.startsWith('_')) return true
  for (let j = i - 1; j >= 0; j--) {
    const l = lines[j].trim()
    if (!/^(\/\/|\/\*|\*)/.test(l)) break
    if (/^\/\/\s*seam:/.test(l)) return true
  }
  return false
}

for (const file of exporters) {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
  const found = []
  lines.forEach((line, i) => {
    let m
    const names = []
    if ((m = /^export\s+(?:async\s+)?function\*?\s+([\w$]+)/.exec(line))) names.push(m[1])
    else if ((m = /^export\s+(?:const|let|var|class)\s+([\w$]+)/.exec(line))) names.push(m[1])
    else if ((m = /^export\s+(?:const|let|var)\s+\{([^}]*)\}/.exec(line)))
      names.push(...exportedNames(m[1].replace(/:\s*[\w$]+/g, '')))
    else if ((m = /^export\s*\{([^}]*)\}\s*;?\s*$/.exec(line))) names.push(...exportedNames(m[1]))
    else if (/^export\s+default\b/.test(line)) names.push('default')
    for (const name of names) found.push({ name, line: i + 1, seam: isSeam(lines, i, name) })
  })
  if (found.length) exportsOf.set(file, found)
}

function resolveSpec(from, spec) {
  const bare = spec.replace(/[?#].*$/, '')
  let abs
  if (bare.startsWith('.')) abs = resolve(ROOT, dirname(from), bare)
  else if (bare.startsWith('/')) abs = join(STATIC, bare)
  else return null
  return relative(ROOT, abs)
}

/** file -> Set of names used, '*' = the module whole; split by importer kind */
const used = { live: new Map(), test: new Map() }
const use = (kind, file, name) => {
  if (!file || !exportsOf.has(file)) return
  if (!used[kind].has(file)) used[kind].set(file, new Set())
  used[kind].get(file).add(name)
}

const importedNames = (list) =>
  list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+as\s+/)[0].trim())

for (const file of tracked) {
  const text = readFileSync(join(ROOT, file), 'utf8')
  const kind = isTest(file) ? 'test' : 'live'
  const add = (spec, name) => use(kind, resolveSpec(file, spec), name)
  // a namespace binding counts the members it reads, or the module whole if
  // it escapes: appears as a bare identifier anywhere but its own binding.
  // Comments go first, then string contents (a template keeps its ${} holes),
  // and a word inside a path, a slug or a regex (`/etc/`, `etc-test`,
  // `etc\.js`) is not an identifier either. Without that a binding named
  // like a common word counts every module whole.
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (str) =>
      str[0] === '`' ? (str.match(/\$\{[^}]*\}/g) || []).join(' ') : "''"
    )
  const namespace = (spec, ns) => {
    const reads = [...code.matchAll(new RegExp(`\\b${ns}\\.([\\w$]+)`, 'g'))]
    const bare = [...code.matchAll(new RegExp(`(?<![\\w$./\\\\-])${ns}(?![\\w$./\\\\-])`, 'g'))]
    if (bare.length > 1) add(spec, '*')
    for (const r of reads) add(spec, r[1])
  }

  for (const m of text.matchAll(/\bimport\s+([^'"`;]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const clause = m[1]
    const spec = m[2]
    const braces = /\{([^}]*)\}/.exec(clause)
    if (braces) for (const n of importedNames(braces[1])) add(spec, n)
    const ns = /\*\s+as\s+([\w$]+)/.exec(clause)
    if (ns) namespace(spec, ns[1])
    const def = /^([\w$]+)\s*(,|$)/.exec(clause.trim())
    if (def) add(spec, 'default')
  }
  for (const m of text.matchAll(/\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g)) add(m[1], '*')
  for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/g))
    for (const n of importedNames(m[1])) add(m[2], n)
  for (const m of text.matchAll(/\bimport\(\s*(['"`])([^'"`$]+)\1\s*\)/g)) {
    const before = text.slice(Math.max(0, m.index - 400), m.index)
    const destructured = /\{([^{}]*)\}\s*=\s*await\s*$/.exec(before)
    const bound = /\b(?:const|let)\s+([\w$]+)\s*=\s*await\s*$/.exec(before)
    if (destructured)
      for (const n of importedNames(destructured[1].replace(/:\s*[\w$]+/g, ''))) add(m[2], n)
    else if (bound) namespace(m[2], bound[1])
    else add(m[2], '*')
  }
  // a template-literal dynamic import with a query (`x.js?i=${n}`) still names
  // its module before the `$`
  for (const m of text.matchAll(/\bimport\(\s*`([^`$?]+)\?[^`]*`\s*\)/g)) add(m[1], '*')
}

const reaches = (kind, file, name) => {
  const s = used[kind].get(file)
  return !!s && (s.has('*') || s.has(name))
}

const corpses = []
let seams = 0
let total = 0
for (const [file, list] of exportsOf) {
  for (const e of list) {
    total++
    if (reaches('live', file, e.name)) continue
    if (e.seam) {
      seams++
      continue
    }
    corpses.push({ file, ...e, testOnly: reaches('test', file, e.name) })
  }
}

console.log(`dead-exports: ${total} exports, ${seams} marked seams, ${corpses.length} corpses`)
for (const c of corpses)
  console.log(
    `  ${c.file}:${c.line}  ${c.name}  ${c.testOnly ? '(test-only: mark it `// seam:`)' : '(no importer)'}`
  )
process.exit(corpses.length ? 1 : 0)
