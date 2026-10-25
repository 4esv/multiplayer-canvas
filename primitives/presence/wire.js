// multiplayer-canvas/presence/wire: the words both ends of the socket say: send rate and server
//   push names.
// Inputs: none.
// Outputs: RATE_MS, SERVER_PUSH, changedKeys(prev, next). Pure.
//
// canvas/wire.js
// THE WORDS BOTH ENDS OF THE SOCKET SAY, stated once. The server's half of
// the wire (lib/presence-protocol.js, the room, the routes that gate and
// publish, services/canvas-data.js) lives where the browser is never
// served, so a word both ends need is stated here, in the tree that is, and
// the server imports it the way it imports the dish's size (canvas/slime.js
// DISH). Pure, no DOM. test/wire.test.js holds the move floor, the diff and
// the words a tab listens for to this one statement.

// The floor between two cursor moves, about thirty a second: the tab waits
// it out before it sends one (canvas/presence.js pumpMove) and the room
// drops a move that arrives sooner (routes/presence.js). One number, so the
// pace a tab keeps is the pace the room takes.
export const RATE_MS = 33

// Four of the frames the server pushes, by the word on their `type`: a
// pile's new front (the room's, and the hero's pager turns on it), the
// slime mould's next frame (services/slime.js), the weather window's
// offset (services/sky.js) and the names of the canvas data that moved
// (routes/api.js, the keys below). canvas/presence.js dispatches on them.
export const SERVER_PUSH = Object.freeze({
  front: 'front',
  play: 'play',
  slime: 'slime',
  sky: 'sky',
  stale: 'stale',
})

// The keys a canvas payload can move on (services/canvas-data.js), in the
// order the payload carries them.
const LIVE_KEYS = ['weather']

/**
 * Which keys actually changed between two canvas payloads.
 * @param {object|null} prev
 * @param {object|null} next
 * @returns {string[]} changed keys, empty when nothing moved
 *
 * The server asks it whether a refresh says anything at all (routes/api.js,
 * the stale push) and a tab asks it which tiles to rebuild when it re-reads
 * /api/canvas (canvas/app.js refreshCanvas). One diff, so the push and the
 * repaint cannot disagree about what moved.
 *
 * Both sides' objects come out of getCanvasData (a tab's through JSON,
 * which keeps key order), so their key order is identical by construction
 * and stringify comparison is exact rather than lucky. This is what makes
 * the socket push quiet: five minutes of unchanged weather broadcast
 * nothing at all.
 */
export function changedKeys(prev, next) {
  if (!prev || !next) return []
  return LIVE_KEYS.filter((key) => JSON.stringify(prev[key]) !== JSON.stringify(next[key]))
}
