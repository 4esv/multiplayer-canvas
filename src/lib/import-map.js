// The import map: how a page's modules find the engine by its package name.
//
// The site imports its primitives the way a borrower would
// (`import { pixelText } from 'multiplayer-canvas/pixel-type'`). Node
// resolves that through package.json `exports` (a package may import
// itself by name); a browser needs this map, one line per JS export, each
// pointing at the file under /primitives/. The primitives are served
// unhashed (they import each other by relative path), so the map is the
// same in dev and in production and is computed once.
//
// It is an inline script, and the CSP allows scripts from 'self' only, so
// the header carries this exact text's hash (src/server.js), and the same
// for the speculation rules below.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PKG = JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8'))

// a module a browser can load: under primitives/, JavaScript, and not a
// server half (one that reaches for a node: builtin or the process, or
// imports the room that does)
const ROOT = join(import.meta.dirname, '../..')
const SERVER = /from '(node:|\.\/presence-room\.js|\.\.\/presence\/presence-room\.js)|process\.env/
const forBrowser = (file) =>
  file.startsWith('./primitives/') &&
  file.endsWith('.js') &&
  !SERVER.test(readFileSync(join(ROOT, file), 'utf8'))

const imports = Object.fromEntries(
  Object.entries(PKG.exports)
    .filter(([, file]) => forBrowser(file))
    .map(([key, file]) => [`${PKG.name}${key.slice(1)}`, file.slice(1)])
)

/** The map's text, exactly as the page carries it. */
export const IMPORT_MAP = JSON.stringify({ imports })

// The prefetch hint for the three doors. Chrome honours the
// 'inline-speculation-rules' keyword only while the policy carries no hash,
// and the import map's hash is one, so this text needs its own.
export const SPECULATION_RULES = JSON.stringify({
  prefetch: [{ urls: ['/work', '/feed', '/about'] }],
})

const sha = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`

/** The CSP sources that allow the two inline scripts and nothing else. */
export const INLINE_SCRIPTS_CSP = `${sha(IMPORT_MAP)} ${sha(SPECULATION_RULES)}`
