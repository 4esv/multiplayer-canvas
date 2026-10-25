// /admin: one behavior, the per-session sign out (log out itself is the
// desk shell's, desk.js). Every readout is server-rendered. Sign out arms
// on the first tap and acts on the second: no confirm() dialogs on a phone.
import { poof } from 'multiplayer-canvas/pixel-moves'
import { armed } from 'multiplayer-canvas/kit/arm'
;(() => {
  // Sign out one other session, or every other session: the same two-tap
  // button pointed at a different URL (js/kit-arm.js arms it).
  const signOut = (b, url) =>
    armed(b, async () => {
      // DESTRUCTION POOFS (BIBLE.md section 9), and it poofs OPTIMISTICALLY:
      // the row bursts into its own cells the moment the second tap lands,
      // because a poof that waits for a round trip is not a poof. The row is
      // put back, intact and re-armable, if the server refuses.
      const row = b.closest('li, tr, .row, .card') || b
      const restore = row.style.visibility
      poof(row)
      row.style.visibility = 'hidden'
      const res = await fetch(url, { method: 'DELETE' }).catch(() => null)
      if (res && (res.ok || res.status === 404)) return location.reload()
      row.style.visibility = restore
      throw new Error('refused')
    })
  document
    .querySelectorAll('[data-revoke]')
    .forEach((b) => signOut(b, `/api/auth/sessions/${b.dataset.revoke}`))
  document.querySelectorAll('[data-revoke-others]').forEach((b) => signOut(b, '/api/auth/sessions'))
})()
