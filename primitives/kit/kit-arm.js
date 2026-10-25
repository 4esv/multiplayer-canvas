// multiplayer-canvas/kit/arm: arm, then act: a destructive button asks once by its own face, no
//   confirm() dialog.
// Inputs: armed(button, act, onFail).
// Outputs: the first press arms (.is-hot), the second runs act; it disarms after a few seconds.
//   DOM. Style: kit.css.
//
// ARM, THEN ACT: the one confirm a destructive button on this origin gets.
// No confirm() dialog (a phone draws it as a sheet that says nothing about
// the thing it deletes): the first press arms the button, the kit's brick
// face (kit.css .is-hot, brick means armed) with a word that asks, and it
// disarms on its own if the second press does not come within four seconds.
// The second press acts. Every page that arms a button arms it through
// here, so the word, the wait and the face cannot drift apart page by page.
//
// DOM only, no state of its own beyond a timer per button. `armed` wires a
// button whose act is its own; `arm` is the same step for a press a page has
// already caught (a delegated click), true when this press is the one that
// acts; `disarm` puts a button back.

const ASK = 'sure?'
const WAIT_MS = 4000
const timers = new WeakMap()

export function disarm(btn) {
  clearTimeout(timers.get(btn))
  timers.delete(btn)
  if (!btn.classList.contains('is-hot')) return
  btn.classList.remove('is-hot')
  if (btn.dataset.label) btn.textContent = btn.dataset.label
}

export function arm(btn) {
  if (btn.classList.contains('is-hot')) {
    // the second press: it acts, and stays armed while it does
    clearTimeout(timers.get(btn))
    timers.delete(btn)
    return true
  }
  btn.dataset.label = btn.textContent
  btn.textContent = ASK
  btn.classList.add('is-hot')
  timers.set(
    btn,
    setTimeout(() => disarm(btn), WAIT_MS)
  )
  return false
}

// The second press disables the button while `act` runs; a throw puts it
// back, enabled and disarmed, and hands the error to `onFail`.
export function armed(btn, act, onFail) {
  btn.addEventListener('click', async () => {
    if (!arm(btn)) return
    btn.disabled = true
    try {
      await act()
    } catch (err) {
      btn.disabled = false
      disarm(btn)
      if (onFail) onFail(err)
    }
  })
}
