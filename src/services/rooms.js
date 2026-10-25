// The desk's one setting for sessions (lib/sessions.js): whether a new
// session gets a PIN unless told otherwise. One small file under data/ (the
// prod volume), so the choice survives a deploy while the sessions
// themselves, which live in memory, do not.
//
//   { "pin": true }
//
// A missing or unreadable file is the default, which is a PIN: a session
// link that travels further than meant should meet a door. The path is an
// env var like the other stores so a test never writes into the real data
// directory.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const DEFAULTS = Object.freeze({ pin: true })

function storePath() {
  return process.env.ROOMS_STORE_PATH || join(import.meta.dirname, '../../data/rooms.json')
}

/** @returns {Promise<{pin:boolean}>} */
export async function roomSettings() {
  try {
    const stored = JSON.parse(await readFile(storePath(), 'utf-8'))
    return { pin: typeof stored.pin === 'boolean' ? stored.pin : DEFAULTS.pin }
  } catch {
    return { ...DEFAULTS }
  }
}

/**
 * @param {{pin?:unknown}} fields
 * @returns {Promise<{settings:{pin:boolean}}|{error:string}>}
 */
export async function setRoomSettings(fields = {}) {
  if (typeof fields.pin !== 'boolean') return { error: 'pin is true or false' }
  const settings = { pin: fields.pin }
  const path = storePath()
  await mkdir(dirname(path), { recursive: true })
  // atomic, like the credential store: a crash mid-write leaves the old file
  const tmp = join(dirname(path), `.rooms.${process.pid}.${Date.now()}.tmp`)
  await writeFile(tmp, JSON.stringify(settings, null, 2) + '\n')
  await rename(tmp, path)
  return { settings }
}
