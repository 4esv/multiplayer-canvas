// Re-keys the passkey door from the shell: wipes the credential and every
// session, then mints a fresh setup code. Registration reopens until the
// new code is used once. Run it on the box that owns data/auth.json:
//
//   node scripts/auth/reset.mjs
//
// Apple Passwords keys the passkey on rpId + user handle, so re-claiming
// updates the saved entry instead of stacking a second one.

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import config from '../../src/config.js'
import { ensureSetupCode } from '../../src/services/auth.js'

const storePath = resolve(process.cwd(), config.auth.storePath)

let store = {}
try {
  store = JSON.parse(await readFile(storePath, 'utf-8'))
} catch {
  // no store yet: ensureSetupCode will create one
}

store.credential = null
store.sessions = {}
store.setupCode = null
await writeFile(storePath, JSON.stringify(store, null, 2) + '\n').catch(() => {})

const code = await ensureSetupCode()
console.log(`passkey reset. new setup code: ${code}`)
console.log('open /login and claim it with this code.')
