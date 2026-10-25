// scripts/verify/session-live.mjs
// BIBLE.md section 2, in real browsers: THREE MODES, EACH A SUPERSET OF THE
// LAST, and A ROOM OF THE OWNER'S OWN IS THE FLAG IN THE ADDRESS
// (2026-09-26).
//
// The pure guards hold the pieces: who may open a room, a named code and
// the PIN (test/sessions.test.js), the line and what lets a follow go
// (test/session-client.test.js), the flag's arithmetic
// (test/finder-url.test.js). Between them sits what only a browser can
// show: the owner's cookie on the socket's upgrade, the flag on the
// address as the room answers and as the canvas walks, a follow room's
// guest held on the host whatever it does, an act leaving one page's
// script and arriving (or not) in another's, a follower drawn behind the
// hand it follows, a line of text lit, a session's went tag and its [go],
// the PIN typed into the tag, and a click-follow let go by a hand walking
// off.
//
// Two browsers (a hidden headless tab has no animation frames, so one
// browser per visitor, as scripts/verify/page-presence.mjs found). The owner
// takes the development door (/api/auth/dev-session, loopback only), so this
// runs against a DEVELOPMENT server:
//   NODE_ENV=development PORT=3327 node src/server.js
//   node scripts/verify/session-live.mjs http://localhost:3327
//   SHOTS=dir   also writes screenshots of both screens at the end
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const PAGE = process.env.PAGE || '/work/nao'
const PORT = Number(process.env.CDP_PORT || 9233)
const PORTS = [PORT, PORT + 1]
const SHOTS = process.env.SHOTS || ''
const W = 1280
const H = 800

const CHROME = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
  .filter(Boolean)
  .find((p) => existsSync(p))
if (!CHROME) {
  console.error('no chrome binary found; set CHROME_PATH')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browsers = PORTS.map((port) => {
  const profile = mkdtempSync(join(tmpdir(), 'session-live-'))
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore' }
  )
  return { port, profile, chrome }
})
function cleanup(code) {
  for (const b of browsers) {
    try {
      b.chrome.kill()
    } catch {
      /* already gone */
    }
    try {
      rmSync(b.profile, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
  process.exit(code)
}

async function pageOf(port) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* not listening yet */
    }
    await sleep(200)
  }
  throw new Error(`chrome never opened a debugging port on ${port}`)
}
async function debug(name, wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (!m.id || !pending.has(m.id)) return
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  })
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq
      const t = setTimeout(() => {
        pending.delete(id)
        rej(new Error(`${name}: ${method} never answered`))
      }, 15000)
      pending.set(id, {
        res: (v) => (clearTimeout(t), res(v)),
        rej: (e) => (clearTimeout(t), rej(e)),
      })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400))
    return r.result.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  })
  return { name, send, evaluate }
}

const failures = []
const stage = (m) => console.error('  .. ' + m)
const fail = (msg) => {
  console.error('FAIL ' + msg)
  failures.push(msg)
}
const ok = (msg) => console.log('  ok   ' + msg)
async function until(tab, expr, ms = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await tab.evaluate(expr).catch(() => null)
    if (v) return v
    await sleep(120)
  }
  return null
}
const go = async (tab, path) => {
  await tab.send('Page.navigate', { url: BASE + path })
  const booted = await until(
    tab,
    'typeof window.__lab === "object" && document.readyState === "complete"',
    15000
  )
  if (!booted) throw new Error(`${tab.name}: ${path} never booted`)
}
const move = async (tab, x, y) => {
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await sleep(40)
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 1, y })
}

// what this tab's address says now
const search = (tab) => tab.evaluate('location.search')
const where = (tab) => tab.evaluate('location.pathname + location.search')
// a fresh word each run: rooms live in the server's memory, and a rerun
// against the same server must open its own rather than join the last one's
const RUN = Math.random().toString(36).slice(2, 7)
const SLUG = PAGE.split('/').filter(Boolean).pop()
// an act said on one page's bridge, and the acts one page has heard
const listen = (tab) =>
  tab.evaluate(
    `window.__got = []; addEventListener('canvas:peer-act', e => __got.push(e.detail)); 1`
  )
const play = (tab, n) =>
  tab.evaluate(
    `dispatchEvent(new CustomEvent('canvas:act', {detail: {ch: 'note', d: {i: 'synth', n: ${n}, v: 0.8}}})); 1`
  )
const key = async (tab, k) => {
  await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k })
  await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k })
}
const end = (tab, code) =>
  tab.evaluate(`fetch('/api/admin/rooms/${code}', {method: 'DELETE'}).then(r => r.status)`)

try {
  const [p0, p1] = await Promise.all(PORTS.map(pageOf))
  const owner = await debug('owner', p0.webSocketDebuggerUrl)
  const guest = await debug('guest', p1.webSocketDebuggerUrl)
  stage('both browsers up')

  // ---- the door: the owner takes the development session ----------------------
  await owner.send('Page.navigate', { url: `${BASE}/api/auth/dev-session` })
  await sleep(800)
  await go(owner, '/')
  stage('owner signed in')

  // ---- a FOLLOW room, named in the owner's own address --------------------------
  const fcode = `demo-${RUN}`
  await go(owner, `${PAGE}?follow=${fcode}&pin=off`)
  const fhost = await until(
    owner,
    `__lab.session() && __lab.session().host && __lab.session().kind === 'follow' && __lab.session().code === ${JSON.stringify(fcode)}`
  )
  if (!fhost) fail(`the owner's ?follow=${fcode} did not open a follow room with that code`)
  else ok(`the owner's ?follow=${fcode} opens a follow room of that name, as its host`)
  const fq = await search(owner)
  if (fq !== `?follow=${fcode}`)
    fail(`the owner's address is "${fq}", not the flag without the pin`)
  else ok(`the flag stays on the owner's address and the pin comes off it: "${fq}"`)

  // the guest asks for it as a session: the room's own kind wins, and the
  // address is made to say so
  await go(guest, `${PAGE}?session=${fcode}`)
  const fin = await until(
    guest,
    `__lab.session() && __lab.session().kind === 'follow' && !__lab.session().host`
  )
  if (!fin) fail('the guest did not join the follow room')
  const gq = await until(guest, `location.search === '?follow=${fcode}' && location.search`)
  if (!gq) fail(`the guest's address did not become ?follow=${fcode}: "${await search(guest)}"`)
  else ok(`a guest's ?session=${fcode} joins the follow room and its address reads "${gq}"`)

  const ownerId = await owner.evaluate('__lab.me().id')
  const guestId = await guest.evaluate('__lab.me().id')
  const led = await until(guest, `__lab.me().following === ${ownerId}`)
  if (!led) fail('the follow room guest did not follow the host on arrival')
  else ok('the guest follows the host on arrival')

  // the guest's own input does not let go in a follow room
  await guest.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: 400,
    y: 400,
    deltaX: 0,
    deltaY: 200,
  })
  await move(guest, 100, 100)
  await move(guest, 900, 600)
  await key(guest, 'Escape')
  await sleep(300)
  if ((await guest.evaluate('__lab.me().following')) !== ownerId)
    fail("the guest's own wheel, hand or Escape let go of the host in a follow room")
  else ok("the guest's wheel, a hand walked across the screen and Escape all keep it following")

  // acts go from the host to the guest, and never the other way
  await listen(owner)
  await listen(guest)
  await play(owner, 60)
  const got = await until(guest, `__got.length && __got[0]`)
  if (!got || got.ch !== 'note' || got.d.n !== 60 || got.id !== ownerId)
    fail(`the guest did not hear the host's note: ${JSON.stringify(got)}`)
  else
    ok(
      `the host's key reaches the guest: ${JSON.stringify({ ch: got.ch, d: got.d, from: got.id })}`
    )
  await play(guest, 62)
  await sleep(800)
  const heard = await owner.evaluate('__got.length')
  if (heard) fail(`the host heard the follow room guest's note (${heard})`)
  else ok("the guest's key does not reach the host")

  // ---- the conga: the guest is drawn in line behind the host's hand -------------
  const blocks = await owner.evaluate('__lab.blocks()')
  const target = blocks.findIndex((b) => b.y > 150 && b.y + b.h < H - 150 && b.h > 20)
  if (target < 0) throw new Error('no block on the owner screen to point at')
  const b = blocks[target]
  const tip = { x: Math.round(b.x + b.w / 3), y: Math.round(b.y + b.h / 2) }
  // a walk to the right, then a rest: the line stays strung out BEHIND the
  // resting hand (to its left, on the path it walked), never stacked on it.
  // The first run of this check measured 0px here and called it a pass,
  // which was the bug: a wall clock walked the line into the head.
  for (let k = 0; k < 12; k++) await move(owner, tip.x - 120 + k * 10, tip.y)
  await move(owner, tip.x, tip.y)
  await sleep(1800)
  const behind = await owner.evaluate(`__lab.peers().find(p => p.id === ${guestId})`)
  if (!behind || behind.x === null)
    fail(`the owner does not draw the following guest at all: ${JSON.stringify(behind)}`)
  else {
    const dx = behind.x + 6 - (tip.x + 1)
    const dy = behind.y + 3 - tip.y
    if (dx > -8 || dx < -140 || Math.abs(dy) > 10)
      fail(
        `the follower is not in line behind the resting hand: ${dx.toFixed(0)}px across, ${dy.toFixed(0)}px down from its tip`
      )
    else
      ok(
        `the guest waits in line behind the host's resting hand, ${(-dx).toFixed(0)}px back along its path (${dy.toFixed(0)}px off it)`
      )
  }
  const mine = await guest.evaluate('__lab.me()')
  if (mine.following !== ownerId || mine.x === null)
    fail(`the guest does not see its own hand in the line: ${JSON.stringify(mine)}`)
  else ok('the guest sees its own hand walking in the line')

  // ---- a selection crosses, inside the room (highlight.js) ----------------------
  const para = await owner.evaluate(
    `(() => { const p = [...document.querySelectorAll('#sheetInner p')].find(p => p.textContent.length > 40); if(!p) return false; const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode(); getSelection().setBaseAndExtent(t, 0, t, Math.min(20, t.length)); return true })()`
  )
  if (!para) fail('no paragraph on the page to mark')
  const lit = await until(
    guest,
    `[...CSS.highlights.keys()] && [...CSS.highlights.keys()].includes('peer-${ownerId}')`
  )
  if (!lit) fail("the guest does not show the host's marked line")
  else ok("the host's marked line is lit on the guest's page")
  await owner.evaluate('getSelection().removeAllRanges(); 1')

  // the host's hand leaves the window, and the window loses focus: the host
  // is still reading the page, so the guest must still be on it. Both used
  // to post "on the ground", which closed every follower's page.
  const pageNow = await guest.evaluate('__lab.fan.sheet')
  await owner.evaluate(
    `document.dispatchEvent(new PointerEvent('pointerleave')); dispatchEvent(new Event('blur')); 1`
  )
  await sleep(1500)
  const stayed = await guest.evaluate('__lab.fan.sheet')
  if (!pageNow || stayed !== pageNow)
    fail(`the host's hand left the window and the guest went from ${pageNow} to ${stayed}`)
  else ok(`the host's hand leaves the window and the guest stays on ${stayed}`)

  // the host closes the page and the guest is wherever the host lands. A
  // case study closes back to its collection's fan (the one navigation for
  // every collection), and the fan is part of the view a follow carries
  // (view-sync.js), so the guest must be on that same fan at the same address,
  // not on the bare ground while the host looks at the fan: that was the old
  // outcome, and it was the guest being somewhere the host was not.
  await key(owner, 'Escape')
  const hostAt = await until(
    owner,
    `__lab.fan.sheet === null && location.pathname + location.search`
  )
  const hostFan = await owner.evaluate('__lab.fan.id')
  const both = await until(
    guest,
    `__lab.fan.sheet === null && location.pathname + location.search === ${JSON.stringify(hostAt)} && __lab.fan.id === ${JSON.stringify(hostFan)}`
  )
  if (!both)
    fail(
      `the host closed the page to ${hostAt} (fan ${hostFan}) and the guest is at ${await where(guest)} (fan ${JSON.stringify(await guest.evaluate('__lab.fan.id'))})`
    )
  else
    ok(
      `the host closes the page and the guest lands with them, at "${hostAt}" on the ${hostFan} fan`
    )

  // ---- deleting the flag is leaving ---------------------------------------------
  await go(guest, '/')
  const left = await until(guest, `__lab.session() === null && __lab.me().following === null`)
  if (!left) fail('a load without the flag did not leave the follow room')
  const gone = await until(owner, `!__lab.peers().some(p => p.id === ${guestId})`)
  if (!left || !gone) fail('the guest is still in the follow room after its flag went')
  else ok('a load without the flag leaves the room: the tab is public and the host sees it go')
  await end(owner, fcode)

  // ---- a SESSION: many to many ------------------------------------------------
  const scode = `jam-${RUN}`
  await go(owner, `/?session=${scode}&pin=off`)
  if (
    !(await until(
      owner,
      `__lab.session() && __lab.session().kind === 'session' && __lab.session().host`
    ))
  )
    fail(`the owner's ?session=${scode} did not open a session`)
  await go(guest, `/?session=${scode}`)
  if (!(await until(guest, `__lab.session() && __lab.session().code === ${JSON.stringify(scode)}`)))
    fail('the guest did not join the session')
  const sOwner = await owner.evaluate('__lab.me().id')
  const sGuest = await guest.evaluate('__lab.me().id')
  if (!(await until(guest, `__lab.peers().some(p => p.id === ${sOwner} && p.host)`)))
    fail('the guest does not see the host in the session')
  if ((await guest.evaluate('__lab.me().following')) !== null)
    fail('a session guest follows somebody it never picked')
  await listen(owner)
  await listen(guest)
  await play(owner, 64)
  await play(guest, 65)
  const toGuest = await until(guest, `__got.find(a => a.id === ${sOwner} && a.d.n === 64)`)
  const toOwner = await until(owner, `__got.find(a => a.id === ${sGuest} && a.d.n === 65)`)
  if (!toGuest || !toOwner)
    fail(`acts did not cross both ways: host heard ${!!toOwner}, guest heard ${!!toGuest}`)
  else ok('in a session both play and both hear it')

  // the host goes somewhere: the guest is asked, never moved
  await owner.evaluate(`__lab.openPage(${JSON.stringify(SLUG)}); 1`)
  const asked = await until(
    guest,
    `(() => { const w = document.querySelector('#went'); return w && !w.hidden && w.textContent })()`
  )
  if (!asked) fail('the guest was not asked to go where the host went')
  else if ((await guest.evaluate('__lab.fan.sheet')) !== null)
    fail('the guest was moved without being asked')
  else ok(`the guest is asked, not moved: "${asked.replace(/\s+/g, ' ').trim()}"`)
  await guest.evaluate(`document.querySelector('#went .go').click(); 1`)
  const went = await until(guest, `__lab.fan.sheet === ${JSON.stringify(SLUG)}`)
  if (!went) fail('[go] did not take the guest to the page')
  else if ((await guest.evaluate('__lab.me().following')) !== null) fail('[go] started a follow')
  else ok(`[go] takes the guest there without following anybody, at "${await where(guest)}"`)
  if ((await search(guest)) !== `?session=${scode}`)
    fail(`the flag did not ride the walk to the page: "${await where(guest)}"`)
  else ok('the flag rides the walk to the page')

  // deleting the flag while on a page is leaving too
  await go(guest, PAGE)
  if (!(await until(guest, `__lab.session() === null`)))
    fail('a load of the page without the flag stayed in the session')
  else ok('a load of the page without the flag leaves the session')
  await end(owner, scode)

  // ---- a PIN: asked, refused wrong, right lets in; the end sends it home --------
  const pcode = `pin-${RUN}`
  const pin = String(1000 + Math.floor(Math.random() * 9000))
  await go(owner, `${PAGE}?session=${pcode}&pin=${pin}`)
  const shown = await until(
    owner,
    `__lab.session() && document.querySelector('#session')?.textContent`
  )
  if (!shown || !shown.includes(pcode) || !shown.includes(pin))
    fail(`the owner's tag does not show the code and the PIN: "${shown}"`)
  else ok(`the owner's tag shows "${shown.replace(/\s+/g, ' ').trim()}"`)
  if ((await search(owner)) !== `?session=${pcode}`) fail('the PIN stayed on the address')
  await go(guest, `${PAGE}?session=${pcode}`)
  if (!(await until(guest, `!!document.querySelector('#sessPin')`)))
    fail('the guest was never asked for the PIN')
  const typePin = (p) =>
    guest.evaluate(
      `(() => { const i = document.querySelector('#sessPin'); i.value = ${JSON.stringify(p)}; i.form.requestSubmit(); })()`
    )
  await typePin(pin === '1111' ? '2222' : '1111')
  await sleep(800)
  if (await guest.evaluate(`!!__lab.session()`)) fail('a wrong PIN let the guest in')
  if (!(await until(guest, `!!document.querySelector('#sessPin')`)))
    fail('after a wrong PIN the guest was not asked again')
  await typePin(pin)
  const pin_in = await until(
    guest,
    `__lab.session() && __lab.session().code === ${JSON.stringify(pcode)} && !__lab.session().host`
  )
  if (!pin_in) fail('the right PIN did not let the guest in')
  else ok('a wrong PIN is refused, the right one lets the guest in')
  if (await guest.evaluate(`__lab.session() && __lab.session().pin !== null`))
    fail('the guest was told the PIN')
  await end(owner, pcode)
  const home = await until(
    guest,
    `__lab.session() === null && /over/.test(document.querySelector('#session')?.textContent || '') && location.search === ''`
  )
  if (!home) fail('ending the session did not send the guest home, flag off, with word of it')
  else ok('ending the session sends the guest to the public room, takes the flag off, and says so')

  // ---- a CLICK-FOLLOW in the public room breaks when the hand walks off ------------
  await go(owner, '/')
  await go(guest, '/')
  const pOwner = await owner.evaluate('__lab.me().id')
  if (!(await until(guest, `__lab.peers().some(p => p.id === ${pOwner})`)))
    fail('the guest does not see the owner in the public room')
  await move(guest, 600, 400)
  await guest.evaluate(`__lab.follow.pick(${pOwner}); 1`)
  await move(guest, 600, 400)
  await key(guest, 'a')
  await move(guest, 680, 440)
  await sleep(200)
  if ((await guest.evaluate('__lab.me().following')) !== pOwner)
    fail('a key or a small drift let go of a click-follow')
  else ok('a key and a drift inside the slack keep a click-follow')
  await move(guest, 800, 460)
  const broke = await until(guest, `__lab.me().following === null`, 2000)
  if (!broke) fail('a hand walked 200px off did not let go of a click-follow')
  else ok('a hand walked past the slack lets go of a click-follow')

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    for (const t of [owner, guest]) {
      const shot = await t.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(join(SHOTS, `session-${t.name}.png`), Buffer.from(shot.data, 'base64'))
    }
    console.log(`  screenshots in ${SHOTS}`)
  }
} catch (e) {
  fail(`the check itself threw: ${e.message}`)
}

if (failures.length) {
  console.error(`\nsession-live: ${failures.length} failure(s)`)
  cleanup(1)
}
console.log(
  '\nsession-live: a follow room, a session, the flag as the room, a PIN, acts, a line, a mark, the went tag, the slack'
)
cleanup(0)
