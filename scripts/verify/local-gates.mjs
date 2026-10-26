// scripts/verify/local-gates.mjs
// THE GATES, BEFORE THE MERGE. A pull request's CI runs the `test` job and
// nothing else. The four gates that put a real browser in front of the site
// (the world is fixed, the DOM at boot, the page ground, the figures on a
// phone) run in the `smoke` job after a merge to main, so a change that only a
// browser can see is red on main before it is red anywhere else. This runs
// them on the working tree, in the layout the image has, while there is still
// nothing to revert:
//
//   npm run verify:gates                 all four
//   npm run verify:gates -- figure-fit   just the named ones
//
// It copies what the Dockerfile copies (src, content, scripts, the package
// files) into a scratch directory, builds the hashed assets there, boots the
// server the way the image does (NODE_ENV=production) on a free port with no
// account configured, runs the gates against it one after another, prints
// each verdict, and takes the scratch directory away. The working tree is read
// and never written.
//
// Needs the Node the package asks for (engines) and a Chrome: CHROME_PATH, or
// one of the places the gates look, or the Chromium the cloud sandbox ships.
// It does not do the first half of `smoke`, which curls the content routes of
// the built image: that half is the image's, and only CI has the image.
import { spawn, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const GATES = ['world-fixed', 'boot-dom', 'page-ground', 'figure-fit']
// longer than the slowest gate has ever taken, short enough that a wedged
// browser is a failure and not a wait
const GATE_MS = 10 * 60 * 1000
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

// before there is anything to clean up, a refusal is an exit; after, it is a
// throw, so the scratch directory and the server go with it
const die = (msg) => {
  console.error(`gates: ${msg}`)
  process.exit(2)
}
class Stop extends Error {}
const fail = (msg) => {
  throw new Stop(msg)
}

const wanted = process.argv.slice(2)
for (const g of wanted)
  if (!GATES.includes(g)) die(`no gate called ${g}; they are ${GATES.join(', ')}`)
const gates = wanted.length ? GATES.filter((g) => wanted.includes(g)) : GATES

const need = Number(
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines?.node?.match(/\d+/)?.[0]
)
if (need && Number(process.versions.node.split('.')[0]) < need)
  die(`needs Node ${need} or newer (package.json engines), this is ${process.version}`)

const chrome = CHROME_CANDIDATES.find((p) => p && existsSync(p))
if (!chrome)
  die(
    'no Chrome found; set CHROME_PATH. Tried:\n  ' + CHROME_CANDIDATES.filter(Boolean).join('\n  ')
  )

const freePort = () =>
  new Promise((done, bad) => {
    const s = createServer()
    s.once('error', bad)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => done(port))
    })
  })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const last = (s) => s.trim().split('\n').at(-1)?.slice(0, 160) ?? ''

const dir = mkdtempSync(join(tmpdir(), 'canvas-gates-'))
let server = null
const cleanup = () => {
  server?.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
}
for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, () => {
    cleanup()
    process.exit(130)
  })

try {
  for (const f of ['src', 'content', 'scripts', 'package.json', 'package-lock.json'])
    cpSync(join(ROOT, f), join(dir, f), { recursive: true })
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'))
  mkdirSync(join(dir, 'data'))

  const built = spawnSync(process.execPath, ['scripts/build-assets.mjs'], {
    cwd: dir,
    encoding: 'utf8',
  })
  if (built.status !== 0) fail(`the asset build failed:\n${built.stdout}${built.stderr}`)
  console.log(`gates: built (${last(built.stdout)})`)

  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  let log = ''
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: dir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      LOG_LEVEL: 'warn',
      // nothing configured that would reach a real account
    },
  })
  server.stdout.on('data', (d) => (log += d))
  server.stderr.on('data', (d) => (log += d))
  let up = false
  for (let i = 0; i < 150 && !up; i++) {
    if (server.exitCode !== null) break
    up = await fetch(`${base}/health`).then(
      (r) => r.ok,
      () => false
    )
    if (!up) await sleep(200)
  }
  if (!up) fail(`the server did not come up on ${base}:\n${log.split('\n').slice(-30).join('\n')}`)
  // the first background refresh of the canvas's data lands a moment after
  // listen; the smoke job has the curl checks to cover it, this has a pause
  await sleep(4000)
  console.log(`gates: ${base}, Chrome ${chrome}`)

  let red = 0
  for (const g of gates) {
    const t0 = Date.now()
    const verdict = await new Promise((done) => {
      let out = ''
      const p = spawn(process.execPath, [join(ROOT, 'scripts/verify', `${g}.mjs`), base], {
        env: { ...process.env, CHROME_PATH: chrome, BASE_URL: base },
        detached: true,
      })
      const clock = setTimeout(() => {
        try {
          process.kill(-p.pid, 'SIGKILL')
        } catch {
          p.kill('SIGKILL')
        }
      }, GATE_MS)
      p.stdout.on('data', (d) => (out += d))
      p.stderr.on('data', (d) => (out += d))
      p.on('close', (code, signal) => {
        clearTimeout(clock)
        done({ ok: code === 0, out, killed: signal === 'SIGKILL' })
      })
    })
    const secs = Math.round((Date.now() - t0) / 1000)
    if (verdict.ok) console.log(`${g}: PASS (${secs}s)  ${last(verdict.out)}`)
    else {
      red++
      console.log(
        `${g}: FAIL (${secs}s)${verdict.killed ? ` it did not finish in ${GATE_MS / 60000} minutes` : ''}\n${verdict.out.split('\n').slice(-25).join('\n')}`
      )
    }
  }
  console.log(red ? `gates: ${red} of ${gates.length} red` : `gates: all ${gates.length} green`)
  process.exitCode = red ? 1 : 0
} catch (e) {
  if (!(e instanceof Stop)) throw e
  console.error(`gates: ${e.message}`)
  process.exitCode = 2
} finally {
  cleanup()
}
