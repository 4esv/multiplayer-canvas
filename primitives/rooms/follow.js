// multiplayer-canvas/rooms/follow: follow somebody cursor: who is followed, and what lets go.
// Inputs: createFollow(on, headOf); pick(id), pointer(x, y), input(), left(id).
// Outputs: a state handle { id, held, pick, release, ... }; calls on(id) on every change. Pure.
//
// Following (issue #327): take somebody's cursor and go where they go. Pure
// state, so the rules can be held in a test: who is followed, and what lets
// go. The camera, the sheet and the scroll that act on it live in app.js.
//
// The VIEW is individual (BIBLE.md section 2, tenet IV): only the
// follower's own camera, sheet and scroll move, and nothing anybody sends
// moves anybody else's. WHO follows whom is not (2026-09-25): app.js hands
// the id to presence.js, the move frame carries it, and every tab draws the
// follower in line behind the one it follows (conga.js). Their cursor is
// the only thing followed, since it is the only thing the room knows about
// them: where it is on the ground, or which block of which page it rests on.
//
// What lets go, and each one is a rule rather than a happenstance:
//   - the follower's own steering (a pan, a wheel, a scroll): a view you
//     are steering is yours, so the first move of your own is the end of
//     theirs
//   - the follower's own hand walking away (2026-09-26): past FOLLOW_SLACK
//     from where it was when the follow began, the follower has gone to
//     do something of their own. A key is NOT steering any more: a
//     follower plays along on the instrument the one followed opened,
//     and a note is not a wish to leave
//   - Escape, the top rung of the ladder
//   - the x on the following tag
//   - the followed peer leaving the room: there is nobody to follow
//   - picking another peer: a follow replaces a follow
//
// HELD (2026-09-26). In a follow room (lib/sessions.js KINDS) following the
// host is what the guest came for, so none of the follower's own input
// lets go: steering and the hand walking off are both the follower's own
// business while the host keeps the frame. Only leaving the room ends it
// (app.js), and `release` stays the way to say so.
//
// `on` is told of every change with the id now followed (or null), once per
// change and never for a no-op, so a tag can paint from it.
//
// ONE QUEUE PER LINE (2026-09-25). Following somebody who is following
// somebody else attaches to THEIR head instead: the pick is resolved up the
// chain before it is taken, so the camera, the wire's `f` and the line all
// name the same head and a line never grows a branch. `headOf` is app.js's
// walk of the roster (whom each peer follows); it answers null when the
// chain comes back to this tab, since following your own follower is a loop,
// not a line. `reattach` is the same rule applied after the fact: the one
// you follow has since picked somebody, so you move to the head with them.

import { M } from '../grid.js'

// How far the follower's own hand may wander, in CSS px on the screen,
// before the follow is theirs to have ended. Three modules: a hand resting
// on a mouse or a trackpad drifts a module at most while its owner watches,
// and reaching for anything on the screen (a tile, the bar, a link) is
// further than three. Screen px, not world: the camera is the one followed,
// and the zoom has nothing to say about where a hand went.
// seam: test/session-client.test.js
export const FOLLOW_SLACK = 3 * M

/**
 * @param {(id:number|null)=>void} [on] told on every change
 * @param {(id:number)=>number|null} [headOf] the head of the line a peer is in
 * @returns {{id:number|null, held:boolean, hold:(on:boolean)=>void, pick:(id:number)=>boolean, release:()=>boolean, input:()=>boolean, pointer:(x:number, y:number)=>boolean, left:(id:number)=>boolean, reattach:()=>boolean}}
 */
export function createFollow(on = () => {}, headOf = (who) => who) {
  let id = null
  let held = false
  // where the follower's own hand was when the follow began: the first
  // pointer() after a pick says it, and every later one is measured from it
  let anchor = null
  const set = (next) => {
    if (next === id) return false
    id = next
    if (id === null) anchor = null
    on(id)
    return true
  }
  return {
    get id() {
      return id
    },
    get held() {
      return held
    },
    /** a follow room: the follower's own input no longer lets go */
    hold(yes) {
      held = yes === true
    },
    /** follow this peer's line; picking the one already followed changes nothing */
    pick(who) {
      if (!Number.isInteger(who) || who <= 0) return false
      const head = headOf(who)
      if (!(Number.isInteger(head) && head > 0) || head === id) return false
      // a new follow measures the hand from where it is now, not from
      // where it was for the last one
      anchor = null
      return set(head)
    },
    /** let go, whoever it was */
    release: () => set(null),
    /** the follower steered the view: let go if following, unless held */
    input: () => (held ? false : set(null)),
    /**
     * the follower's own hand is at (x, y) on the screen: the first one
     * after a pick is where the follow began, and one past FOLLOW_SLACK
     * from it lets go, unless held
     */
    pointer(x, y) {
      if (id === null || held || !Number.isFinite(x) || !Number.isFinite(y)) return false
      if (!anchor) {
        anchor = { x, y }
        return false
      }
      return Math.hypot(x - anchor.x, y - anchor.y) > FOLLOW_SLACK ? set(null) : false
    },
    /** a peer left; let go only if it was the one followed */
    left: (who) => (who === id ? set(null) : false),
    /** the one followed has joined a line of their own: move to its head */
    reattach() {
      if (id === null) return false
      const head = headOf(id)
      return Number.isInteger(head) && head > 0 && head !== id ? set(head) : false
    },
  }
}
