// multiplayer-canvas/slime/server: one shared mould, run on a server clock and streamed to
//   watchers.
// Inputs: startSlime(), feedSlime(x, y), watchSlime(socket, on).
// Outputs: slime frames published to the presence room. Node.
//
// The slime mould's one live copy (BIBLE.md section 5). The dish runs in
// this process on its own clock, visitors or not: a mould that only grew
// while somebody watched would be an animation, and this is a thing that
// lives on the ground. The arithmetic is primitives/slime/slime.js, shared with the
// browser; this file owns the clock, the food the room drops on its own,
// and the frame that goes out over the presence wire.
//
// Nothing persists. A restart is a fresh inoculation, the same way it
// revives Maurice and turns every pile back to its first card: the dish is
// where the room left it, not a fact about anybody.
//
// THE WIRE IS COSTED LIKE A RESOURCE. Measured
// before this: every open tab, hidden ones included, took the whole picture
// four times a second, 11.1 KB/s a tab, 2.9 MB/s upstream at the socket cap.
// Now a tab is sent frames only while it says it is WATCHING (the `watch`
// frame: document visible and the dish on camera, canvas/app.js), and what
// it is sent is a KEYFRAME once, then DELTAS: the cells that changed since
// the last frame the room sent. The invariant that makes a delta safe is
// that every non-fresh watcher holds exactly `sent`, the last picture the
// room put out; a tab that cannot be sure it does (it just started watching,
// or a delta arrived against a base it does not hold) asks again and is
// fresh, which means the next frame it gets is a keyframe.
import {
  createSlime,
  step,
  feed as dropFood,
  encode,
  encodeDelta,
  tones,
  foodCells,
  randomCell,
  pelletCount,
} from './slime.js'
import { SERVER_PUSH } from '../presence/wire.js'
import { presenceRoom } from '../presence/presence-room.js'

// the clock: 90ms a tick, slowed from the lab's 55 after watching it live
//: a mould that keeps pace with a cursor reads as an
// animation, and at this pace the roads are seen forming. The picture goes
// out four times a second; the register is frames, not motion
// seam: test/slime.test.js
export const TICK_MS = 90
// seam: test/slime.test.js
export const FRAME_MS = 250
// STANDING FOOD. A colony with nothing to reach for merges into
// one band (measured: the lab's own page does it by tick two hundred), and a
// colony connecting several food sources stays a network, which is the
// Tero et al. picture the lab cites. So the dish keeps STANDING pellets:
// when it holds fewer than this many, the next one arrives after a slow
// random wait, so a dish nobody feeds is always on its way somewhere and
// never busy. A visitor's tap is the fast event; this is the weather.
// seam: test/slime.test.js
export const STANDING = 3
const SPAWN_MIN_MS = 30 * 1000
// seam: test/slime.test.js
export const SPAWN_MAX_MS = 90 * 1000
// the inoculation comes with its standing pellets so the first visitor
// after a restart meets a network and not a haze
const SEED_PELLETS = STANDING

const state = createSlime(Date.now() >>> 0)
for (let i = 0; i < SEED_PELLETS; i++) dropFood(state, ...randomCell(state.rand))

let timer = null
let lastFrame = 0
let dirty = false
// ONE CLOCK. While the dish holds its standing pellets the
// spawn clock is HELD, a sentinel set once at the count, and the tick draws
// nothing from the shared rng: that rng also drives the foragers' jitter, so
// a tick that rolled a wait it never used would put the service's dish out
// of step with a plain `step` from the same seed (test/slime.test.js holds
// them byte for byte). The wait is rolled ONCE, on the tick that first
// finds the dish short, and counts from the last full tick: the wait starts
// when a pellet is finished, not when the shortage is noticed
const HELD = -1
let nextSpawn = HELD
let fullAt = 0
// socket -> the clock at its last keyframe, 0 while it is FRESH (owed one).
// Only sockets in here are sent anything.
const watchers = new Map()
// A keyframe is the expensive frame, and `watch on` asks for one, so the
// ask is floored per socket: a tab that asks again inside this window keeps
// its deltas and gets its keyframe when the window ends. A scripted client
// cannot make the process encode the whole picture for it every tick.
// seam: test/slime.test.js
export const KEY_GATE_MS = 1000
// the last picture the room sent, which every non-fresh watcher holds
let sent = { t: -1, tones: null, food: '' }

const spawnDelay = () => SPAWN_MIN_MS + Math.floor(state.rand() * (SPAWN_MAX_MS - SPAWN_MIN_MS))

/** the frame a fresh tab opens on, baked into the boot payload */
export function slimeFrame() {
  return { t: state.tick, ...encode(state) }
}

/**
 * Drop food where a visitor tapped. The route has parsed the frame, so the
 * coordinates are integers in range; whether they land INSIDE the dish is
 * the arithmetic's call, and outside is a quiet no.
 * @returns {boolean}
 */
export function feedSlime(x, y) {
  const ok = dropFood(state, x, y)
  if (ok) dirty = true
  return ok
}

/**
 * A tab says whether it can see the dish. `on` puts it among the watchers
 * as FRESH, so its next frame is a keyframe: a tab that was already
 * watching and asks again is a tab that lost the thread (a delta against a
 * base it did not hold), and a keyframe is the answer to that too. `off`
 * (and a closed socket, routes/presence.js) takes it out: nothing more is
 * sent until it asks.
 * @param {object} socket
 * @param {boolean} on
 * @param {number} [now] server ms (tests pass their own clock)
 */
export function watchSlime(socket, on, now = Date.now()) {
  if (!on) {
    watchers.delete(socket)
    return
  }
  const keyed = watchers.get(socket)
  if (keyed === undefined || now - keyed >= KEY_GATE_MS) watchers.set(socket, 0)
}
/** how many tabs are being sent frames right now */
// seam: test/slime.test.js
export const slimeWatchers = () => watchers.size

function tick(now = Date.now()) {
  step(state)
  // the standing pellets: at the count the clock is held; short of it, the
  // clock is armed once and runs, and each drop restarts it
  if (pelletCount(state) >= STANDING - 0.5) {
    nextSpawn = HELD
    fullAt = now
  } else {
    if (nextSpawn === HELD) nextSpawn = fullAt + spawnDelay()
    if (now >= nextSpawn) {
      dropFood(state, ...randomCell(state.rand))
      dirty = true
      nextSpawn = now + spawnDelay()
    }
  }
  if (!watchers.size) return
  // a fresh watcher is news: its keyframe goes out on this step rather than
  // waiting for the frame clock, as a feed does
  let fresh = false
  for (const keyedAt of watchers.values()) if (!keyedAt) fresh = true
  if (!fresh && !dirty && now - lastFrame < FRAME_MS) return
  // the picture is serialised only when somebody is there to see it
  const t = state.tick
  const tn = tones(state)
  const food = foodCells(state)
  const foodKey = food.join(',')
  const foodChanged = foodKey !== sent.food
  const keyed = []
  const delta = []
  for (const [s, keyedAt] of watchers) (keyedAt ? delta : keyed).push(s)
  if (delta.length && sent.tones) {
    const d = encodeDelta(sent.tones, tn)
    const msg = { type: SERVER_PUSH.slime, t, b: sent.t, d }
    if (foodChanged) msg.f = food
    presenceRoom.sendTo(delta, msg)
  } else if (delta.length) {
    // no base to cut against (the process has never sent): everybody is
    // fresh whether they said so or not
    keyed.push(...delta)
  }
  if (keyed.length) {
    presenceRoom.sendTo(keyed, { type: SERVER_PUSH.slime, t, ...encode(state) })
    for (const s of keyed) watchers.set(s, now || 1)
  }
  sent = { t, tones: tn, food: foodKey }
  lastFrame = now
  dirty = false
}

/** Start the clock (idempotent). Called from server start, not from build. */
export function startSlime() {
  if (timer) return
  // the inoculation counts as the last full tick: a seed pellet that landed
  // on the rim leaves the dish short, and its wait starts now, not at zero
  fullAt = Date.now()
  nextSpawn = HELD
  timer = setInterval(() => tick(), TICK_MS)
  timer.unref?.()
}

// the test seam: step the shared dish by hand, with a clock of the test's
export const _slime = { state, tick }
