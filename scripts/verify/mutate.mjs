// scripts/verify/mutate.mjs
// A GUARD THAT HAS NEVER FAILED IS A GUESS, SO MAKE IT FAIL.
//
// A test that reads source text (a stylesheet, app.js, a template) and
// matches it is a text guard. A text guard earns its place one of two ways,
// and says which in a comment directly above its `it(`:
//
//   // mutation: <name>[, <name>...]
//       a plausible wrong implementation, registered by name in
//       mutations.json, turns this test red. This script proves it.
//   // tripwire: <reason>
//       the test holds wording on purpose (a phrase, a name, a claim in
//       prose) and the reason says why the wording is the thing.
//
// A text guard that can do neither goes.
//
// Two halves:
//   static   every text guard in test/ carries a tag, every mutation a tag
//            names is registered, every registered mutation is named by some
//            tag, and every edit's `find` occurs exactly once in its file.
//            Fast and pure; `npm run check` runs it (--static).
//   run      each mutation is applied in a scratch copy of the tree, and
//            every test that names it must report `not ok`. Each test file
//            involved is first run pristine and must pass, so a guard that is
//            already red cannot pass for a caught one.
//
// "Text guard" is computed, not declared: a test whose body reaches a
// binding that holds file text. The bindings are top-level names assigned
// from readFileSync/readFile (or from a helper that wraps them), and,
// transitively, top-level names and functions whose definition uses one.
//
// A run that does not end is a failure, not a wait. Every node --test run is
// killed (with whatever it started) after MUTATE_TIMEOUT_MS, 2 minutes unless
// set (the slowest file runs in 8 seconds), and the TAP it had printed is still
// read. A mutant that arms a timer nothing clears keeps the test process alive
// for good, and a CI job has no other clock to stop it. A caught mutation whose
// run timed out is listed all the same, for the guard is right and the test
// that should have failed first is slow.
//
// A mutation whose guard needs the whole git history says so ("needs":
// "history" in the registry) and is skipped on a shallow clone, where that
// guard skips itself and would be reported as a survivor that is not one. CI
// checks out with fetch-depth 0, so it runs there.
//
// Usage:
//   node scripts/verify/mutate.mjs            static, then every mutation
//   node scripts/verify/mutate.mjs --static   static half only
//   node scripts/verify/mutate.mjs --only a,b just the named mutations
//   node scripts/verify/mutate.mjs --only a.* every mutation with that prefix
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const REGISTRY = join(import.meta.dirname, 'mutations.json')
const args = process.argv.slice(2)
const STATIC_ONLY = args.includes('--static')
const onlyAt = args.indexOf('--only')
const ONLY_ARG = onlyAt > -1 ? args[onlyAt + 1].split(',') : null
const TIMEOUT_MS = Number(process.env.MUTATE_TIMEOUT_MS) || 2 * 60 * 1000

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' })
const tracked = git('ls-files', '-co', '--exclude-standard').split('\n').filter(Boolean)
const testFiles = tracked.filter((f) => f.startsWith('test/') && f.endsWith('.test.js'))
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

// ---------------------------------------------------------------- the scan

const TEST_START = /^[ \t]*(?:it|test)(?:\.\w+)?\(\s*(?:(['"])((?:\\.|(?!\1).)*)\1|`([^`$]*)`)?/
const TITLE_ALONE = /^\s*(?:(['"])((?:\\.|(?!\1).)*)\1|`([^`$]*)`)\s*,/
const TAG = /^\s*\/\/\s*(mutation|tripwire):\s*(.*)$/

// top-level statements: a line at column 0 that is not a closer or comment
// starts one, and it runs until the next
function topLevel(lines) {
  const out = []
  let cur = null
  lines.forEach((line, i) => {
    if (/^[A-Za-z]/.test(line)) {
      cur = { start: i, text: line }
      out.push(cur)
    } else if (cur && !/^\/\//.test(line)) cur.text += '\n' + line
  })
  return out
}

function textBindings(src) {
  const names = new Set()
  const stmts = topLevel(src.split('\n'))
    .map((s) => {
      const m = s.text.match(
        /^(?:export\s+)?(?:const|let|var|function\*?|async\s+function)\s+([A-Za-z_$][\w$]*)/
      )
      return m && { name: m[1], text: s.text }
    })
    .filter(Boolean)
  let grew = true
  while (grew) {
    grew = false
    for (const s of stmts) {
      if (names.has(s.name)) continue
      const body = s.text.slice(s.text.indexOf(s.name) + s.name.length)
      if (
        readsText(body) ||
        [...names].some((n) => new RegExp(`(?<![\\w$.])${escape(n)}(?![\\w$])`).test(body))
      ) {
        names.add(s.name)
        grew = true
      }
    }
  }
  return names
}

// A read is of source text when it decodes a file as text and keeps it as
// text. JSON.parse over a read is data, a read of a process.env path is the
// run's own state, and a read with no encoding is bytes (an image, a font).
function readsText(code) {
  for (const m of code.matchAll(READ)) {
    const [, parsed, argsText] = m
    if (!parsed && /['"]utf-?8['"]/i.test(argsText) && !/process\.env/.test(argsText)) return true
  }
  return false
}
const READ =
  /(JSON\.parse\(\s*(?:await\s+)?)?\breadFile(?:Sync)?\s*\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// every test in a file: its title, whether it is a text guard, its tags
function scan(src) {
  const lines = src.split('\n')
  const names = textBindings(src)
  const uses = new RegExp(
    [...names].map((n) => `(?<![\\w$.])${escape(n)}(?![\\w$])`).join('|') || '(?!)'
  )
  const starts = []
  lines.forEach((line, i) => {
    const m = line.match(TEST_START)
    if (!m) return
    // prettier puts a long title on the line after `it(`
    const t = m[0].endsWith('(') ? (lines[i + 1] ?? '').match(TITLE_ALONE) : m
    const title = t && (t[2] ?? t[3])
    starts.push({ i, title: title == null ? null : title.replace(/\\(.)/g, '$1') })
  })
  const boundaries = lines
    .map((l, i) =>
      /^[ \t]*(?:it|test|describe)(?:\.\w+)?\(/.test(l) || /^[A-Za-z]/.test(l) ? i : -1
    )
    .filter((i) => i > -1)
  return starts.map(({ i, title }) => {
    const end = boundaries.find((b) => b > i) ?? lines.length
    const body = lines.slice(i, end).join('\n')
    const tags = []
    for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) {
      const t = lines[j].match(TAG)
      if (t) tags.push({ kind: t[1], value: t[2].trim() })
    }
    return {
      line: i + 1,
      title,
      text: readsText(body) || uses.test(body),
      mutations: tags
        .filter((t) => t.kind === 'mutation')
        .flatMap((t) => t.value.split(',').map((s) => s.trim()))
        .filter(Boolean),
      tripwire: tags.find((t) => t.kind === 'tripwire')?.value ?? null,
    }
  })
}

// ---------------------------------------------------------------- static

// MUTATIONS_EXTRA=a.json,b.json merges drafts in, for trying a mutation
// before it is registered
const registry = [
  REGISTRY,
  ...(process.env.MUTATIONS_EXTRA?.split(',').filter(Boolean) ?? []),
].flatMap((f) => JSON.parse(readFileSync(resolve(f), 'utf8')))
// --only takes names, or a name ending in * for every mutation that starts so.
// A prefix that matches nothing stays as itself and is refused below as not
// registered, the way a misspelt name is.
const expandOnly = (p) => {
  if (!p.endsWith('*')) return [p]
  const hit = registry.filter((m) => m.name.startsWith(p.slice(0, -1))).map((m) => m.name)
  return hit.length ? hit : [p]
}
const ONLY = ONLY_ARG && new Set(ONLY_ARG.flatMap(expandOnly))
const byName = new Map()
const problems = []
for (const m of registry) {
  if (byName.has(m.name)) problems.push(`mutations.json: ${m.name} is registered twice`)
  byName.set(m.name, m)
  if (!m.wrong)
    problems.push(`mutations.json: ${m.name} does not say what wrong implementation it is`)
  if (!m.edits?.length) problems.push(`mutations.json: ${m.name} has no edits`)
  for (const e of m.edits ?? []) {
    let text
    try {
      text = read(e.file)
    } catch {
      problems.push(`mutations.json: ${m.name} edits ${e.file}, which does not exist`)
      continue
    }
    const n = text.split(e.find).length - 1
    if (n !== 1)
      problems.push(
        `mutations.json: ${m.name}: find occurs ${n} times in ${e.file}, wants exactly 1`
      )
    if (e.find === e.replace)
      problems.push(`mutations.json: ${m.name}: an edit that changes nothing`)
  }
}

const named = new Map() // mutation name -> [{ file, title, line }]
let textGuards = 0
let tripwires = 0
for (const f of testFiles) {
  for (const t of scan(read(f))) {
    for (const n of t.mutations) {
      if (!byName.has(n))
        problems.push(`${f}:${t.line}: names mutation "${n}", which is not registered`)
      if (!named.has(n)) named.set(n, [])
      named.get(n).push({ file: f, title: t.title, line: t.line })
    }
    if (t.tripwire === '') problems.push(`${f}:${t.line}: a tripwire with no reason`)
    if (!t.text) continue
    textGuards++
    if (t.tripwire) tripwires++
    if (!t.mutations.length && !t.tripwire)
      problems.push(
        `${f}:${t.line}: text guard "${t.title ?? '?'}" says neither mutation: nor tripwire:`
      )
  }
}
for (const m of registry)
  if (!named.has(m.name)) problems.push(`mutations.json: ${m.name} is named by no test`)

console.log(
  `mutate: ${textGuards} text guards (${tripwires} tripwires), ${registry.length} mutations, ${testFiles.length} test files`
)
// --only is for working on a few mutations while the rest of the tree is
// mid-edit: only the static problems that mention its names stop it
const blocking = ONLY ? problems.filter((p) => [...ONLY].some((n) => p.includes(n))) : problems
if (ONLY && problems.length > blocking.length)
  console.log(
    `mutate: ${problems.length - blocking.length} static problems elsewhere, ignored under --only`
  )
if (blocking.length) {
  console.error(blocking.map((p) => '  ' + p).join('\n'))
  process.exit(1)
}
if (STATIC_ONLY) process.exit(0)

// ---------------------------------------------------------------- run

// A scratch copy per worker: the working tree is never touched, so an
// interrupted run cannot leave a mutation behind. node_modules is linked,
// and git is pointed back at the real repository (test/sitemap.test.js asks
// it for history).
const GIT_DIR = resolve(ROOT, git('rev-parse', '--git-dir').trim())
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'canvas-mutate-'))
  for (const f of tracked) {
    mkdirSync(join(dir, dirname(f)), { recursive: true })
    try {
      cpSync(join(ROOT, f), join(dir, f))
    } catch {
      // listed by git but deleted in the working tree
    }
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'))
  return dir
}

// node --test with TAP, reduced to the titles that failed and whether
// anything did. node --test runs each file in a child of its own, so the run
// is a process group and the clock kills the group: killing only the parent
// leaves the file that is hanging, running, after the harness has gone.
function runTests(dir, file) {
  return new Promise((done) => {
    const p = spawn(process.execPath, ['--test', '--test-reporter=tap', file], {
      cwd: dir,
      env: { ...process.env, NODE_ENV: 'test', GIT_DIR, GIT_WORK_TREE: dir },
      detached: true,
    })
    let out = ''
    let timedOut = false
    const clock = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-p.pid, 'SIGKILL')
      } catch {
        p.kill('SIGKILL')
      }
    }, TIMEOUT_MS)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => {
      clearTimeout(clock)
      const failed = new Set()
      for (const m of out.matchAll(/^\s*not ok \d+ - (.*?)(?:\s+# .*)?$/gm))
        failed.add(m[1].replace(/\\#/g, '#').replace(/\\\\/g, '\\'))
      done({ code, failed, out, timedOut })
    })
  })
}
const seconds = `${TIMEOUT_MS / 1000}s`

const wanted = registry.filter((m) => !ONLY || ONLY.has(m.name))
if (ONLY)
  for (const n of ONLY)
    if (!byName.has(n) || !named.has(n)) {
      console.error(`  --only ${n}: not registered, or named by no test`)
      process.exit(1)
    }
const shallow = git('rev-parse', '--is-shallow-repository').trim() === 'true'
const skipped = shallow ? wanted.filter((m) => m.needs === 'history') : []
const todo = wanted.filter((m) => !skipped.includes(m))
if (skipped.length)
  console.log(
    `mutate: ${skipped.length} skipped, they need the full git history and this clone is shallow: ${skipped.map((m) => m.name).join(', ')}`
  )

// pristine first: every file a mutation leans on must pass untouched
const workers = Math.max(1, Math.min(todo.length, availableParallelism() - 1, 8))
const dirs = Array.from({ length: workers }, scratch)
const files = [...new Set(todo.flatMap((m) => named.get(m.name).map((t) => t.file)))]
const red = []
await pool(files, async (file, dir) => {
  const r = await runTests(dir, file)
  if (r.code !== 0)
    red.push(
      `${file} ${r.timedOut ? `did not finish in ${seconds}, before any mutation` : 'fails before any mutation'}:\n${tail(r.out)}`
    )
})
if (red.length) {
  console.error(red.join('\n'))
  cleanup()
  process.exit(1)
}

const survived = []
const slow = []
await pool(todo, async (m, dir) => {
  const originals = m.edits.map((e) => [e.file, readFileSync(join(dir, e.file), 'utf8')])
  try {
    for (const e of m.edits) {
      const text = readFileSync(join(dir, e.file), 'utf8')
      writeFileSync(
        join(dir, e.file),
        text.replace(e.find, () => e.replace)
      )
    }
    const tests = named.get(m.name)
    for (const file of new Set(tests.map((t) => t.file))) {
      const r = await runTests(dir, file)
      for (const t of tests.filter((x) => x.file === file)) {
        const caught = t.title == null ? r.code !== 0 : r.failed.has(t.title)
        if (!caught)
          survived.push(
            `${m.name} survived ${t.file}:${t.line} "${t.title ?? '?'}"${r.timedOut ? ` (its run did not finish in ${seconds}: the mutant keeps the process alive and the test did not fail first)` : ''}`
          )
      }
      if (r.timedOut) slow.push(`${m.name} in ${file}`)
    }
  } finally {
    for (const [f, text] of originals) writeFileSync(join(dir, f), text)
  }
})
cleanup()

console.log(
  `mutate: ${todo.length - new Set(survived.map((s) => s.split(' ')[0])).size}/${todo.length} mutations caught`
)
if (slow.length)
  console.log(
    `mutate: ${slow.length} runs did not finish in ${seconds} and were killed (the test process outlived its tests): ${slow.join(', ')}`
  )
if (survived.length) {
  console.error(survived.map((s) => '  ' + s).join('\n'))
  process.exit(1)
}

async function pool(items, fn) {
  const queue = [...items]
  await Promise.all(
    dirs.map(async (dir) => {
      while (queue.length) await fn(queue.shift(), dir)
    })
  )
}

function cleanup() {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}

function tail(s) {
  return s.split('\n').slice(-30).join('\n')
}
