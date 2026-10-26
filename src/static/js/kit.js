// /admin/kit: the board under a hand. Every control on the specimen works,
// locally: a knob turns, a toggle lights its lamp, play latches, the radio
// row chooses one, the keys type into the field, the fader sets the wave
// the scope draws, the piano keys go down while held, the pins patch, the
// flaps count. Nothing is synced: the page is a specimen, and it says so.

import { cursorImage } from 'multiplayer-canvas/presence'
import { scrollMarkup, wireScroll } from 'multiplayer-canvas/kit/scroll'
import { wireCarets } from 'multiplayer-canvas/kit/caret'

// The real hands, not the system's: the same drawn sprites the canvas wears
// (presence.js), in the ink, set as custom properties on <html> and worn
// there as its cursor, so every page that loads this module (the doors,
// the desk, the specimen) has them without a stylesheet
// rule of its own: every control inherits (kit.css) and none picks its
// own. Pressing is a state of the pointer, so it is one class on the root,
// the way app.js does it, and the hand swaps with it.
{
  const root = document.documentElement
  const cs = getComputedStyle(root)
  const ink = cs.getPropertyValue('--cv-ink').trim()
  const ground = cs.getPropertyValue('--cv-ground').trim()
  // the grab is for a thing that is turned by dragging; a stylesheet
  // wears it as var(--cv-hand-grab)
  for (const which of ['point', 'click', 'grab'])
    root.style.setProperty(`--cv-hand-${which}`, cursorImage(which, ink, ink, ground))
  const wear = (which) => {
    root.classList.toggle('pressing', which === 'click')
    root.style.cursor = `var(--cv-hand-${which})`
  }
  wear('point')
  const up = () => wear('point')
  addEventListener('pointerdown', () => wear('click'))
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
  addEventListener('blur', up)
}

// every field's caret at its insertion point (primitives/kit/kit-caret.js)
wireCarets()

// the grammar's flip switches throw (the page's own settings wire theirs)
for (const s of document.querySelectorAll('[data-flip]'))
  s.addEventListener('click', () =>
    s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true'))
  )

// The form parts on the specimen: the native range fills the
// progress bar, and a drag over the file drop lights it, the way a page's
// own script does.
for (const r of document.querySelectorAll('[data-range]')) {
  const bar = document.getElementById(r.dataset.range)
  const follow = () => {
    if (bar) bar.value = r.value
  }
  r.addEventListener('input', follow)
  follow()
}
for (const drop of document.querySelectorAll('[data-drop]')) {
  const over = (on) => drop.classList.toggle('is-over', on)
  drop.addEventListener('dragover', (e) => {
    e.preventDefault()
    over(true)
  })
  drop.addEventListener('dragleave', () => over(false))
  drop.addEventListener('drop', (e) => {
    e.preventDefault()
    over(false)
  })
}

// a part's state is its picture, at the URL the page shipped for it (the
// file's hash rides it, kit/parts.njk), never one written here
const KIT_IMG = JSON.parse(document.getElementById('kit-img')?.textContent || '{}')
const setState = (el, state) => {
  el.dataset.state = state
  el.querySelector('img').src = KIT_IMG[`${el.dataset.part}-${state}`]
}
const lamp = (id, on, what) => {
  const el = id && document.getElementById(id)
  if (!el) return
  el.src = KIT_IMG[`lamp-${on ? 'on' : 'off'}`]
  el.alt = `${what} ${on ? 'on' : 'off'}`
}

for (const board of document.querySelectorAll('[data-board]')) {
  // knobs: a click steps the angle, a vertical drag turns it
  for (const k of board.querySelectorAll('[data-knob]')) {
    let start = null
    k.addEventListener('pointerdown', (e) => {
      start = { y: e.clientY, at: Number(k.dataset.state), moved: false }
      k.setPointerCapture(e.pointerId)
    })
    k.addEventListener('pointermove', (e) => {
      if (!start) return
      const step = Math.round((start.y - e.clientY) / 12)
      if (step) start.moved = true
      setState(k, String(Math.max(0, Math.min(7, start.at + step))))
    })
    k.addEventListener('pointerup', () => {
      if (start && !start.moved) setState(k, String((Number(k.dataset.state) + 1) % 8))
      start = null
    })
    k.addEventListener('keydown', (e) => {
      const d =
        e.key === 'ArrowUp' || e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
            ? -1
            : 0
      if (!d) return
      e.preventDefault()
      setState(k, String(Math.max(0, Math.min(7, Number(k.dataset.state) + d))))
    })
  }

  // toggles: the lever flips and the lamp follows
  for (const t of board.querySelectorAll('[data-toggle]'))
    t.addEventListener('click', () => {
      const on = t.getAttribute('aria-pressed') !== 'true'
      t.setAttribute('aria-pressed', String(on))
      setState(t, on ? 'down' : 'up')
      lamp(t.dataset.lamp, on, t.getAttribute('aria-label'))
    })

  // play latches, stop releases; the run lamp says which
  const play = board.querySelector('[data-play]')
  const stop = board.querySelector('[data-stop]')
  const running = (on) => {
    play.classList.toggle('is-down', on)
    play.setAttribute('aria-pressed', String(on))
    lamp(play.dataset.lamp, on, 'running')
  }
  play.addEventListener('click', () => running(true))
  stop.addEventListener('click', () => running(false))

  // the reset arms on the first press (brick, "sure?") and fires on the
  // second; leaving it disarms it
  const arm = board.querySelector('[data-arm]')
  const disarm = () => {
    arm.classList.remove('is-hot')
    arm.textContent = 'reset'
  }
  arm.addEventListener('click', () => {
    if (!arm.classList.contains('is-hot')) {
      arm.classList.add('is-hot')
      arm.textContent = 'sure?'
      return
    }
    disarm()
    running(false)
    for (const k of board.querySelectorAll('[data-knob]:not(:disabled)')) setState(k, '0')
    for (const t of board.querySelectorAll('[data-toggle]')) {
      t.setAttribute('aria-pressed', 'false')
      setState(t, 'up')
      lamp(t.dataset.lamp, false, t.getAttribute('aria-label'))
    }
    for (const c of board.querySelectorAll('[data-call], [data-pin]'))
      setState(c, c.dataset.part === 'pin' ? 'out' : 'off')
  })
  arm.addEventListener('blur', disarm)

  // one of many: the chosen radio button stays down
  for (const group of board.querySelectorAll('[role="radiogroup"]')) {
    const opts = [...group.querySelectorAll('[role="radio"]')]
    const choose = (o) => opts.forEach((x) => x.setAttribute('aria-checked', String(x === o)))
    for (const o of opts) {
      o.addEventListener('click', () => choose(o))
      o.addEventListener('keydown', (e) => {
        const i = opts.indexOf(o)
        const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null
        if (n === null) return
        e.preventDefault()
        const next = opts[(n + opts.length) % opts.length]
        choose(next)
        next.focus()
      })
    }
  }

  // many of many
  for (const c of board.querySelectorAll('[role="checkbox"]'))
    c.addEventListener('click', () =>
      c.setAttribute('aria-checked', String(c.getAttribute('aria-checked') !== 'true'))
    )

  // the keys type into the field; a e s v on the keyboard press them
  const field = board.querySelector('[data-field]')
  const keys = new Map([...board.querySelectorAll('[data-key]')].map((k) => [k.dataset.key, k]))
  const type = (c) => {
    if (c === '<') field.value = field.value.slice(0, -1)
    else field.value = (field.value + (c === '_' ? ' ' : c)).slice(-16)
  }
  for (const [c, k] of keys) k.addEventListener('click', () => type(c))
  board.addEventListener('keydown', (e) => {
    if (e.target === field || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
    const k = keys.get(e.key === ' ' ? '_' : e.key === 'Backspace' ? '<' : e.key.toLowerCase())
    if (!k) return
    k.classList.add('is-down')
    type(k.dataset.key)
  })
  board.addEventListener('keyup', (e) => {
    keys
      .get(e.key === ' ' ? '_' : e.key === 'Backspace' ? '<' : e.key.toLowerCase())
      ?.classList.remove('is-down')
  })

  // the fader: nine stops on the track, the cap on the nearest; the scope
  // draws the wave the level sets
  const fader = board.querySelector('[data-fader]')
  const cap = fader.querySelector('.k-cap')
  const scope = board.querySelector('[data-scope]')
  const COLS = Number(getComputedStyle(scope).getPropertyValue('--k-cols')) || 48
  const ROWS = 16
  const cells = []
  for (let i = 0; i < COLS * ROWS; i++) {
    const c = document.createElement('button')
    c.type = 'button'
    c.className = 'k-cell'
    c.tabIndex = -1
    c.setAttribute('aria-hidden', 'true')
    c.addEventListener('pointerdown', () => c.classList.toggle('is-ink'))
    cells.push(c)
  }
  scope.replaceChildren(...cells)
  const draw = (level) => {
    for (const c of cells) c.classList.remove('is-live')
    const amp = (level / 8) * (ROWS / 2 - 1)
    for (let x = 0; x < COLS; x++) {
      const y = Math.round(ROWS / 2 - 0.5 + amp * Math.sin((x / COLS) * Math.PI * 4))
      cells[y * COLS + x].classList.add('is-live')
    }
  }
  const setLevel = (level) => {
    level = Math.max(0, Math.min(8, Math.round(level)))
    fader.setAttribute('aria-valuenow', String(level))
    cap.style.left = `${level * 12.5}%`
    draw(level)
  }
  const fromEvent = (e) => {
    const r = fader.getBoundingClientRect()
    setLevel(((e.clientX - r.left) / r.width) * 8)
  }
  fader.addEventListener('pointerdown', (e) => {
    fader.setPointerCapture(e.pointerId)
    fromEvent(e)
  })
  fader.addEventListener('pointermove', (e) => {
    if (e.buttons) fromEvent(e)
  })
  fader.addEventListener('keydown', (e) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -1
          : 0
    if (!d) return
    e.preventDefault()
    setLevel(Number(fader.getAttribute('aria-valuenow')) + d)
  })
  draw(Number(fader.getAttribute('aria-valuenow')))

  // calls and pins latch
  for (const c of board.querySelectorAll('[data-call]'))
    c.addEventListener('click', () => setState(c, c.dataset.state === 'on' ? 'off' : 'on'))
  for (const p of board.querySelectorAll('[data-pin]'))
    p.addEventListener('click', () => setState(p, p.dataset.state === 'in' ? 'out' : 'in'))

  // piano keys go down while held
  for (const k of board.querySelectorAll('[data-piano] [data-note]')) {
    const up = () => setState(k, 'up')
    k.addEventListener('pointerdown', () => setState(k, 'down'))
    k.addEventListener('pointerup', up)
    k.addEventListener('pointerleave', up)
    k.addEventListener('pointercancel', up)
  }

  // the counter: three flaps, a visit at a time
  const count = board.querySelector('[data-count]')
  count.addEventListener('click', () => {
    const flaps = count.querySelectorAll('.k-flap')
    const n = (Number([...flaps].map((f) => f.textContent).join('')) + 1) % 1000
    String(n)
      .padStart(3, '0')
      .split('')
      .forEach((d, i) => (flaps[i].textContent = d))
  })

  // the dock: previous, all, next, over the ring of experiments
  const RING = ['web instruments', 'the slime', 'the kit']
  const name = board.querySelector('[data-ring-name]')
  for (const a of board.querySelectorAll('[data-ring]'))
    a.addEventListener('click', (e) => {
      e.preventDefault()
      const i = RING.indexOf(name.textContent)
      name.textContent = RING[(i + Number(a.dataset.ring) + RING.length) % RING.length]
    })

  // the snap scrollbar: the same ring as an index picker, across and
  // on end. The label beside the flat one shows the slot under a drag and
  // the chosen one after it, the way a page's bar does.
  for (const host of board.querySelectorAll('[data-scrollbar]')) {
    const vert = host.dataset.scrollbar === 'vert'
    const shown = host.querySelector('[data-scroll-name]')
    host.insertAdjacentHTML(
      'afterbegin',
      scrollMarkup({ titles: RING, at: 0, vert, label: 'the pages' })
    )
    const say = (i) => {
      if (shown) shown.textContent = RING[i]
    }
    wireScroll(host.querySelector('.k-scroll'), {
      titles: RING,
      onCommit: say,
      onScrub: (i) => {
        if (i !== null) say(i)
      },
    })
  }
}
