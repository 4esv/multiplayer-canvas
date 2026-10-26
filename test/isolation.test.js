// test/isolation.test.js
// This repo is one isolated unit: nothing tracked in it points at anything
// outside it. A reader with only a clone cannot open an issue number, a note
// in someone's home directory, a file that was moved or deleted, or the
// private site this code was lifted from. So every tracked text file is
// scanned for:
//   - issue and pull-request numbers (a tracker nobody can see)
//   - words from the world the code came from (features and hosts that are
//     not here), with the exact allowlist below
//   - editor and agent files and local absolute paths
//   - calendar dates (YYYY-MM-DD) in comments and docs: a stamp dates the
//     private site's history, not the code (content frontmatter and test
//     inputs are data and are not comments, so they are not scanned)
//   - repo paths (primitives/, src/, scripts/, test/, content/, examples/ and
//     the older short forms canvas/, js/, css/, lib/, routes/, services/) that
//     do not resolve to a tracked file
// Third-party text (vendored code, font licences) is not ours to edit and is
// skipped. A line that asserts a path is
// gone says so with the marker `isolation-ok`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

const TRACKED = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const TRACKED_SET = new Set(TRACKED)

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|eot|mp3|mp4|webm|pdf|zip|gz)$/i
// third-party text: vendored code, licences, package-lock
const THIRD_PARTY = /(^|\/)vendor\/|(^|\/)LICENSE[^/]*$|(^|\/)package-lock\.json$/
// this file spells every pattern it hunts for
const SELF = 'test/isolation.test.js'

const FILES = []
for (const f of TRACKED) {
  if (f === SELF || BINARY.test(f) || THIRD_PARTY.test(f)) continue
  let text
  try {
    text = readFileSync(join(ROOT, f), 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue
  let lines = text.split('\n')
  // the mutation registry holds the wrong code it plants, on purpose
  if (f === 'scripts/verify/mutations.json')
    lines = lines.map((l) => (/^\s*"(find|replace)":/.test(l) ? '' : l))
  FILES.push({ f, lines })
}

// [file, exact line text] pairs that are allowed to name what the rule bans
const ALLOWED_LINES = [
  { file: 'LICENSE', re: /^Copyright \(c\) 2026 Axel Stevens$/ },
  { file: 'README.md', re: /^Built by Axel Stevens\. Third-party$/ },
  { file: 'README.md', re: /github:4esv\/multiplayer-canvas/ },
  { file: /^content\/feed\/.*\.md$/, re: /^credit: Axel Stevens$/ },
]
const allowed = (file, line) =>
  ALLOWED_LINES.some(
    (a) => (a.file instanceof RegExp ? a.file.test(file) : a.file === file) && a.re.test(line)
  )

function hits(re, { skipLine } = {}) {
  const out = []
  for (const { f, lines } of FILES) {
    lines.forEach((line, i) => {
      if (skipLine && skipLine(line)) return
      if (allowed(f, line)) return
      const m = line.match(re)
      if (m) out.push(`${f}:${i + 1}: ${m[0]}`)
    })
  }
  return out
}

// Colours: #000 .. #999 written as one repeated digit are hex, not issues.
const REPEATED_DIGIT_COLOUR = /^#(\d)\1\1$/
const ISSUE_REF = new RegExp(
  [
    String.raw`\b(?:issues?|PRs?|pull requests?)\s*#\d+`,
    String.raw`\b(?:issue|PR)\s+\d{2,}\b`,
    String.raw`(?<![\w&;"'#=/%-])#\d{2,4}\b(?!;)`,
  ].join('|'),
  'gi'
)

function issueHits() {
  const out = []
  for (const { f, lines } of FILES) {
    lines.forEach((line, i) => {
      for (const m of line.matchAll(ISSUE_REF)) {
        if (REPEATED_DIGIT_COLOUR.test(m[0])) continue
        out.push(`${f}:${i + 1}: ${m[0]}`)
      }
    })
  }
  return out
}

const REMOVED_WORLD = new RegExp(
  '\\b(?:' +
    [
      'webhooks?',
      'web ?push',
      'file\\.(?:aesv|localhost)',
      'studio',
      'textmode desk',
      'hmac',
      'credentials?\\.js',
      'spotify',
      'albums?',
      'chess\\.com',
      'github\\.js',
      'umami',
      'e-?ffigy',
      'qntty',
      'strava',
      'hetzner',
      'caddy',
      'porkbun',
      'cornell',
      'ithaca',
      'birdie',
      'just heard',
      'aesv',
      'axel',
      'personal site',
      'the author',
      "author's",
    ].join('|') +
    ')\\b|\\(author\\b|\\bAuthor, \\d{4}',
  'i'
)

// A date stamp in a comment or doc line. Comments are pulled out per file
// kind; a date in code (a fixture, an expected value) is data and is left.
const DATE = /\b20\d\d-[01]\d-[0-3]\d\b/
const LINE_COMMENT_FILES = /\.(m?js|cjs|ts)$/
const BLOCK_COMMENT_FILES = /\.(m?js|cjs|ts|css)$/
const HASH_COMMENT_FILES =
  /(^|\/)(\.gitignore|\.prettierignore|\.dockerignore|\.editorconfig|\.env\.example|Dockerfile)$|\.ya?ml$/
const NJK_FILES = /\.(njk|html)$/
// frontmatter in a doc is data: `date:` and `updated:` keys
const DATA_KEY = /^\s*(date|updated):\s/

function commentText(f, lines) {
  const out = []
  let block = null // the close marker of the block comment we are inside
  lines.forEach((line, i) => {
    let text = ''
    let rest = line
    while (rest.length) {
      if (block) {
        const end = rest.indexOf(block)
        if (end < 0) {
          text += rest
          rest = ''
        } else {
          text += rest.slice(0, end)
          rest = rest.slice(end + block.length)
          block = null
        }
        continue
      }
      const opens = []
      if (BLOCK_COMMENT_FILES.test(f)) opens.push([rest.indexOf('/*'), '/*', '*/'])
      if (NJK_FILES.test(f)) {
        opens.push([rest.indexOf('{#'), '{#', '#}'], [rest.indexOf('<!--'), '<!--', '-->'])
      }
      if (LINE_COMMENT_FILES.test(f)) {
        const m = rest.match(/(^|\s)\/\//)
        if (m) opens.push([m.index + m[1].length, '//', null])
      }
      if (HASH_COMMENT_FILES.test(f)) {
        const m = rest.match(/(^|\s)#/)
        if (m) opens.push([m.index + m[1].length, '#', null])
      }
      const live = opens.filter((o) => o[0] >= 0).sort((a, b) => a[0] - b[0])
      if (!live.length) break
      const [at, open, close] = live[0]
      if (close === null) {
        text += rest.slice(at + open.length)
        rest = ''
      } else {
        block = close
        rest = rest.slice(at + open.length)
      }
    }
    if (text) out.push([i + 1, text])
  })
  return out
}

function dateHits() {
  const out = []
  for (const { f, lines } of FILES) {
    // frontmatter and the mutation payloads are data
    if (/^content\//.test(f) || f === 'scripts/verify/mutations.json') continue
    if (/\.md$/.test(f)) {
      lines.forEach((line, i) => {
        if (DATE.test(line) && !DATA_KEY.test(line))
          out.push(`${f}:${i + 1}: ${line.match(DATE)[0]}`)
      })
      continue
    }
    for (const [n, text] of commentText(f, lines)) {
      const m = text.match(DATE)
      if (m) out.push(`${f}:${n}: ${m[0]}`)
    }
  }
  return out
}

const LOCAL_WORLD = /CLAUDE\.md|\.claude\b|\/Users\/|\/private\/tmp|\bscratchpad\b/

const PATH_REF =
  /(?<![\w./@-])((?:primitives|src|scripts|test|content|examples|canvas|js|css|lib|routes|services|templates)\/[\w./-]*[\w-]\.(?:mjs|js|json|css|njk|md|html|sh|svg|txt))(?![\w-])/g

const resolves = (p) =>
  TRACKED_SET.has(p) ||
  TRACKED.some((t) => t.endsWith('/' + p)) ||
  TRACKED_SET.has('src/static/' + p)

describe('this repo points at nothing outside itself', () => {
  // mutation: isolation.issue-ref
  it('no issue or pull-request number anywhere', () => {
    assert.deepEqual(issueHits(), [])
  })

  // mutation: isolation.removed-world, isolation.the-author
  it('no word from the world this code was lifted out of', () => {
    assert.deepEqual(hits(REMOVED_WORLD), [])
  })

  // mutation: isolation.agent-file
  it('no agent file, home directory or scratch path', () => {
    assert.deepEqual(hits(LOCAL_WORLD), [])
  })

  // mutation: isolation.dated-comment
  it('no calendar date in a comment or a doc line', () => {
    assert.deepEqual(dateHits(), [])
  })

  // mutation: isolation.dead-path
  it('every repo path a file names is a tracked file', () => {
    const dead = []
    for (const { f, lines } of FILES) {
      lines.forEach((line, i) => {
        // a line that asserts a path is ABSENT names a file that must not exist
        // and says so with the marker, on the line or the line under it
        if (/isolation-ok/.test(line) || /isolation-ok/.test(lines[i + 1] ?? '')) return
        for (const m of line.matchAll(PATH_REF)) {
          if (m[1].includes('${') || m[1].includes('*')) continue
          if (!resolves(m[1])) dead.push(`${f}:${i + 1}: ${m[1]}`)
        }
      })
    }
    assert.deepEqual(dead, [])
  })

  // tripwire: the allowlist is the contract, so its size is the claim
  it('the allowlist is exactly the licence line, the credit line and the install line', () => {
    assert.equal(ALLOWED_LINES.length, 4)
  })
})
