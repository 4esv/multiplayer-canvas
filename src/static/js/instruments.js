/* ============================================================
   WEB INSTRUMENTS

   Four instruments and a synth on one index card (#301, the Synth board).
   The tab is the instrument; inside the card, one panel of kit parts along
   what the instrument does, and the playing surface on its lower edge. A
   mouse, a finger, the computer keyboard or a MIDI keyboard all land on
   the same keys, frets and pads.

   EVERY CONTROL CHANGES THE SOUND. A knob, a toggle, a fader, a radio
   button or a pin writes one value into OPT, and the voice reads OPT when
   it builds its graph; nothing on the panel is drawn that a voice ignores.

   THE SCOPE IS THE REAL OUTPUT. Every voice plays into one bus with an
   AnalyserNode on it, and the scope draws what that node hears, in lit
   cells, at most three times a second while there is sound and not at all
   when there is none (the motion guard, WCAG 2.3.1). At rest the synth's
   scope shows the wave its switches are about to make.

   IN A SESSION THE ROOM PLAYS TOGETHER. Outside one, playing is yours
   alone and nothing here goes on the wire (#327). Inside one, a note, a
   key let go and a control moved go out as an `canvas:act` window event
   (the canvas forwards it to the room and drops it anywhere else), and a
   peer's come back as `canvas:peer-act`: read strictly (peerAct in
   instrument-surfaces.js), played through this tab's own voices, lit on
   the part in the peer's hue, and never sent on again.

   THE TAB IS IN THE ADDRESS. #epiano, #bass, #uke, #drums or #synth lands
   on that instrument, and switching writes it back without a new history
   entry, so a link hands someone the instrument you were on. In a session,
   or while somebody follows this tab, the tab is shared too: a switch goes
   out as an `canvas:view` and a peer's is switched to (canvas/view-sync.js).
   ============================================================ */

;(() => {
  'use strict'

  /* ---------- Web Audio: one context, one bus, one ear on the bus ---------- */
  let actx = null
  let bus = null
  let ear = null
  function audio() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)()
        bus = actx.createGain()
        ear = actx.createAnalyser()
        ear.fftSize = 2048
        bus.connect(ear)
        ear.connect(actx.destination)
      } catch {
        actx = false
      }
    }
    if (actx && actx.state === 'suspended') actx.resume()
    return actx || null
  }

  /* ============================================================
     THE OPTIONS
     What each card's panel sets. The markup's own states are the defaults
     (read in wirePanel), and the defaults are the sound the page always
     made: a knob at 4 multiplies by one.
     ============================================================ */
  // A keyboard's `octave` is where its keys start (C4: two octaves from
  // C4): it moves the drawn keys, the typed keys and the sheet's window,
  // and the notes reach the voice at their pitch, so no voice reads it.
  const OPT = {
    rhodes: { tone: 4, decay: 4, sustain: true, octave: 4 },
    bass: { tone: 4, drive: 0, mute: false },
    ukulele: { tone: 4, decay: 4, strum: false },
    drums: { tune: 4, decay: 4 },
    synth: {
      wave: 'sawtooth',
      octave: 4,
      cutoff: 5,
      resonance: 2,
      a: 2,
      d: 4,
      s: 6,
      r: 3,
      level: 6,
      glide: false,
      patch: {},
    },
  }
  // The voices live in canvas/instrument-voices.js, loaded with the
  // layout; each is called with the context, the bus and its options.
  let V = null
  const mem = {}
  const play = (name, inst) => (args) => {
    const a = audio()
    return a && V ? V[name](a, bus, OPT[inst], args, mem) : null
  }
  const rhodes = play('rhodes', 'rhodes')
  const sawPluck = play('sawPluck', 'bass')
  const nylonPluck = play('nylonPluck', 'ukulele')
  const synth = play('synth', 'synth')
  const drum = (kind) => {
    const a = audio()
    return a && V ? V.drum(a, bus, OPT.drums, kind) : null
  }
  // each instrument's voice by its name in instrument-voices.js, for a
  // peer's note, which plays the same voice without going through the hand
  const VOICE_OF = { rhodes: 'rhodes', bass: 'sawPluck', ukulele: 'nylonPluck', synth: 'synth' }
  // the voice's own velocity for a hand, which has none: what a peer hears
  // for a click is what the clicker heard
  const HAND_VELOCITY = { rhodes: 0.85 }

  /* ============================================================
     THE ROOM: the act bridge
     What the visitor plays goes out as `canvas:act`, and only while this tab
     is in a session or somebody follows it (the canvas marks either on the
     root), so a note played alone costs two attribute reads and never
     builds an event. A peer's act
     is played by `replay`, which holds `replaying` for its whole length:
     anything a replay moves that would otherwise speak (a control, a key
     the octave pushed off the board) stays quiet, so an act is never
     echoed back into the room.
     ============================================================ */
  let replaying = false
  function act(ch, d) {
    const ds = document.documentElement?.dataset
    if (replaying || !ds || (ds.session === undefined && ds.followed === undefined)) return
    try {
      window.dispatchEvent(new window.CustomEvent('canvas:act', { detail: { ch, d } }))
    } catch {
      /* no room to tell */
    }
  }
  // What the visitor is LOOKING AT goes the same way, as a view: which
  // instrument is up. The canvas stamps it with the page and hands it to the
  // room (canvas/view-sync.js), and a peer's comes back as `canvas:peer-view`,
  // switched to under `replaying` so it is never said again.
  function view(d) {
    const ds = document.documentElement?.dataset
    const heard = !!ds && (ds.session !== undefined || ds.followed !== undefined)
    if (replaying || !heard) return
    try {
      window.dispatchEvent(new window.CustomEvent('canvas:view', { detail: d }))
    } catch {
      /* no room to tell */
    }
  }

  /* ============================================================
     THE SCREENS: the scope, the envelope view, the sheet
     ============================================================ */
  let lay = null
  const SCOPE = { W: 64, H: 20 }
  const ENV = { W: 44, H: 12 }

  // A screen is a grid of cells; `paint` lights exactly the given ones and
  // touches only the cells that change.
  function screen(el, W, H) {
    if (!el) return null
    const cells = []
    for (let i = 0; i < W * H; i++) {
      const c = document.createElement('span')
      c.className = 'k-cell'
      cells.push(c)
    }
    el.replaceChildren(...cells)
    const lit = new Uint8Array(W * H)
    return {
      paint(list) {
        const next = new Uint8Array(W * H)
        for (const [x, y] of list) if (x >= 0 && x < W && y >= 0 && y < H) next[y * W + x] = 1
        for (let i = 0; i < next.length; i++)
          if (next[i] !== lit[i]) cells[i].classList.toggle('is-ink', !!next[i])
        lit.set(next)
      },
    }
  }

  // the scope of each card, and what it shows at rest: the synth's is the
  // wave it is about to make; the others show the silence
  const scopes = new Map()
  const flat = () => {
    const row = Math.round((SCOPE.H - 1) / 2)
    return Array.from({ length: SCOPE.W }, (_, x) => [x, row])
  }
  function atRest(inst) {
    const s = scopes.get(inst)
    if (!s) return
    s.paint(inst === 'synth' && lay ? lay.previewTrace(SCOPE.W, SCOPE.H, OPT.synth) : flat())
  }

  // While there is sound, the scope redraws from the bus, three times a
  // second at most: a trace that moves at the note's tempo, never a strobe.
  // It stops, and goes back to rest, the moment the bus is silent.
  const REDRAW_MS = 340
  const SILENT = 0.003
  let watching = false
  let lastDraw = -Infinity
  let lastHz = null
  let samples = null
  function listen(hz) {
    lastHz = hz
    if (watching || !ear) return
    watching = true
    // the first picture once the note has filled a little of the ear
    lastDraw = performance.now() - REDRAW_MS + 50
    requestAnimationFrame(watch)
  }
  function watch(t) {
    if (t - lastDraw >= REDRAW_MS) {
      lastDraw = t
      samples = samples || new Float32Array(ear.fftSize)
      ear.getFloatTimeDomainData(samples)
      let peak = 0
      for (const v of samples) peak = Math.max(peak, Math.abs(v))
      const inst = slides[current]?.dataset.instrument
      if (peak < SILENT) {
        watching = false
        atRest(inst)
        return
      }
      scopes.get(inst)?.paint(lay.liveTrace(SCOPE.W, SCOPE.H, samples, actx.sampleRate, lastHz))
    }
    requestAnimationFrame(watch)
  }

  // The sheet: what the piano plays is written at its pitch on a staff, a
  // note a slot, left to right; a note holds 1.6 s and goes. The staff is a
  // window on the great staff that the octave control places (a bass clef
  // for a low board, a treble for a high one: instrument-surfaces.js
  // WINDOWS), redrawn when the control moves; a note still on the sheet is
  // written again where the new window has it. Nothing fades: a cell is lit
  // or it is not.
  const NOTE_LIFETIME_MS = 1600
  let sheet = null
  let sheetWindow = null
  function wireSheet(el) {
    if (!el) return
    const cell = (x, y) => {
      const c = document.createElement('span')
      c.className = 'k-cell is-ink'
      c.style.left = `calc(${x} * var(--cv-px))`
      c.style.top = `calc(${y} * var(--cv-px))`
      return c
    }
    let win = lay.windowFor(OPT.rhodes.octave)
    let staff = []
    const drawStaff = () => {
      for (const s of staff) s.remove()
      staff = lay.staffLines(win).map((row) => {
        const line = document.createElement('span')
        line.className = 'k-rt staff'
        line.style.top = `calc(${row} * var(--cv-px))`
        return line
      })
      const clef = document.createElement('span')
      clef.className = 'clef'
      clef.setAttribute('aria-hidden', 'true')
      for (const [x, y] of lay.clefCells(win)) clef.append(cell(x, y))
      staff.push(clef)
      el.append(...staff)
    }
    const slots = lay.STAFF.slots.map((x) => ({ x, el: null, timer: 0, note: null }))
    const write = (slot) => {
      slot.el?.remove()
      slot.el = null
      const g = lay.noteGlyph(slot.note, slot.x, win)
      if (!g) return
      const glyph = document.createElement('span')
      glyph.className = 'glyph'
      for (const [x, y] of g.cells) glyph.append(cell(x, y))
      for (const row of g.ledgers) {
        const l = document.createElement('span')
        l.className = 'k-rt ledger'
        l.style.left = `calc(${slot.x - 1} * var(--cv-px))`
        l.style.top = `calc(${row} * var(--cv-px))`
        glyph.append(l)
      }
      el.append(glyph)
      slot.el = glyph
    }
    drawStaff()
    let next = 0
    sheet = (note) => {
      const slot = slots[next]
      next = (next + 1) % slots.length
      clearTimeout(slot.timer)
      slot.note = note
      write(slot)
      el.setAttribute('aria-label', `the sheet: ${note}`)
      slot.timer = setTimeout(() => {
        slot.el?.remove()
        slot.el = null
        slot.note = null
        if (slots.every((s) => !s.note)) next = 0
      }, NOTE_LIFETIME_MS)
    }
    sheetWindow = (octave) => {
      const at = lay.windowFor(octave)
      if (at === win) return
      win = at
      drawStaff()
      for (const slot of slots) if (slot.note) write(slot)
    }
  }

  // The ukulele lets a quaver go from its soundhole when a string is
  // plucked (main's note glyph, back after #312's audit): ink cells on the
  // stage over the photograph, rising two cells a step, three steps under
  // three a second, then gone. One is in the air at a time; a pluck while it
  // flies lets none go. Under reduced motion it stands where it was let go.
  let quaver = null
  function letGo() {
    const shot = shots.find((img) => img.dataset.for === 'ukulele')
    if (!stage || !shot || shot.hidden || !shot.offsetWidth || quaver?.flying) return
    if (!quaver) {
      const el = document.createElement('span')
      el.className = 'float'
      el.setAttribute('aria-hidden', 'true')
      for (const [x, y] of lay.quaverCells()) {
        const c = document.createElement('span')
        c.className = 'k-cell is-ink'
        c.style.left = `${x}px`
        c.style.top = `${y}px`
        el.append(c)
      }
      el.hidden = true
      stage.append(el)
      quaver = { el, flying: false }
    }
    const at = lay.quaverAt({
      x: shot.offsetLeft,
      y: shot.offsetTop,
      w: shot.offsetWidth,
      h: shot.offsetHeight,
    })
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const { steps, cells, ms } = lay.FLIGHT
    const el = quaver.el
    el.style.left = `${at.x}px`
    el.style.top = `${at.y}px`
    el.hidden = false
    quaver.flying = true
    for (let n = 1; n <= steps; n++)
      setTimeout(() => {
        if (!still) el.style.top = `calc(${at.y}px - ${n * cells} * var(--cv-px))`
      }, n * ms)
    setTimeout(
      () => {
        el.hidden = true
        quaver.flying = false
      },
      (steps + 1) * ms
    )
  }

  /* ============================================================
     THE PANEL: knobs, toggles, radio buttons, faders, pins
     Each writes one value into OPT[instrument]; the synth's also redraw
     the pictures they change (its resting scope, the envelope view).
     ============================================================ */
  // A part's picture at its hash (#319): the entry names every one the
  // script swaps to in the rig's data-parts, and the server writes each
  // with its ?v=; the bare path is only for a page that lost the list.
  const PART_URL = new Map(
    (document.querySelector('.rig')?.dataset?.parts ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((url) => [url.split('?')[0], url])
  )
  const partSrc = (name, state) => {
    const path = `/img/kit/${name}-${state}.png`
    return PART_URL.get(path) || path
  }
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)))

  // What a peer may set on each panel and how it is shown, filled by
  // wirePanel from the controls it wires: CONTROLS[inst][key] is what the
  // control accepts (peerAct reads it), SHOW[inst][key] moves the control
  // and OPT without a word to the room. A key no control owns is not there,
  // so a peer can set nothing the page does not draw. A pin goes on the
  // wire as `lfo-pitch` for its `lfo:pitch`, since an act's strings take no
  // colon.
  const CONTROLS = {}
  const SHOW = {}
  const wireKey = (pin) => pin.replace(':', '-')

  function wirePanel(slide) {
    const inst = slide.dataset.instrument
    const o = OPT[inst]
    const accepts = (CONTROLS[inst] = {})
    const show = (SHOW[inst] = {})
    // the visitor moved a control: the room hears it once, if it moved
    const told = (k, v, was) => v !== was && act('patch', { i: inst, k, v })
    const changed = () => {
      if (inst !== 'synth') return
      if (!watching) atRest('synth')
      envView?.paint(lay.envelopeCells(ENV.W, ENV.H, o.a, o.d, o.s, o.r))
    }

    // knobs: a click steps the angle, a vertical drag turns it, arrows too
    for (const k of slide.querySelectorAll('[data-knob]')) {
      const key = k.dataset.knob
      const img = k.querySelector('img')
      const turn = (v) => {
        v = clampInt(v, 0, 7)
        o[key] = v
        img.src = partSrc('knob', v)
        k.setAttribute('aria-valuenow', String(v))
        k.setAttribute('aria-valuetext', `${v + 1} of 8`)
        changed()
      }
      const set = (v) => {
        const was = o[key]
        turn(v)
        told(key, o[key], was)
      }
      accepts[key] = { kind: 'int', lo: 0, hi: 7 }
      show[key] = turn
      o[key] = Number(k.getAttribute('aria-valuenow'))
      let start = null
      k.addEventListener('pointerdown', (e) => {
        start = { y: e.clientY, at: o[key], moved: false }
        k.setPointerCapture?.(e.pointerId)
      })
      k.addEventListener('pointermove', (e) => {
        if (!start) return
        const step = Math.round((start.y - e.clientY) / 12)
        if (step) start.moved = true
        if (start.at + step !== o[key]) set(start.at + step)
      })
      k.addEventListener('pointerup', () => {
        if (start && !start.moved) set((o[key] + 1) % 8)
        start = null
      })
      k.addEventListener('pointercancel', () => (start = null))
      k.addEventListener('keydown', (e) => {
        const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
        if (!d) return
        e.preventDefault()
        set(o[key] + d)
      })
    }

    // toggles: the lever is the state
    for (const t of slide.querySelectorAll('[data-toggle]')) {
      const key = t.dataset.toggle
      const flip = (v) => {
        o[key] = v
        t.setAttribute('aria-pressed', String(v))
        t.querySelector('img').src = partSrc('toggle', v ? 'down' : 'up')
      }
      o[key] = t.getAttribute('aria-pressed') === 'true'
      t.addEventListener('click', () => {
        flip(!o[key])
        told(key, o[key], !o[key])
      })
      accepts[key] = { kind: 'bool' }
      show[key] = flip
    }

    // one of many: the chosen push-button stays down. The octave row also
    // moves the keys (wireKeys), which is what its pictures say.
    for (const group of slide.querySelectorAll('[data-radio]')) {
      const key = group.dataset.radio
      const opts = [...group.querySelectorAll('[role="radio"]')]
      const value = (b) => (key === 'octave' ? Number(b.dataset.value) : b.dataset.value)
      const pick = (b, focus) => {
        for (const x of opts) {
          x.setAttribute('aria-checked', String(x === b))
          x.tabIndex = x === b ? 0 : -1
        }
        o[key] = value(b)
        if (focus) b.focus()
        if (key === 'octave') slide._octave?.(o[key])
        changed()
      }
      const choose = (b, focus) => {
        const was = o[key]
        pick(b, focus)
        told(key, o[key], was)
      }
      o[key] = value(opts.find((b) => b.getAttribute('aria-checked') === 'true') || opts[0])
      accepts[key] = { kind: 'one', of: opts.map(value) }
      show[key] = (v) => {
        const b = opts.find((x) => value(x) === v)
        if (b) pick(b)
      }
      for (const b of opts) {
        b.addEventListener('click', () => choose(b))
        b.addEventListener('keydown', (e) => {
          const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
          if (!d) return
          e.preventDefault()
          const i = opts.indexOf(b)
          choose(opts[(i + d + opts.length) % opts.length], true)
        })
      }
    }

    // faders: nine stops, up is more; drag, click on the track, or arrows
    for (const f of slide.querySelectorAll('[data-fader]')) {
      const key = f.dataset.fader
      const move = (v) => {
        v = clampInt(v, 0, 8)
        if (v === o[key]) return
        o[key] = v
        f.setAttribute('aria-valuenow', String(v))
        f.style.setProperty('--k-at', String(v / 8))
        changed()
      }
      const set = (v) => {
        const was = o[key]
        move(v)
        told(key, o[key], was)
      }
      o[key] = Number(f.getAttribute('aria-valuenow'))
      accepts[key] = { kind: 'int', lo: 0, hi: 8 }
      show[key] = move
      const fromEvent = (e) => {
        const r = f.getBoundingClientRect()
        const inset = r.height * (6 / 44)
        set((1 - (e.clientY - r.top - inset) / (r.height - 2 * inset)) * 8)
      }
      f.addEventListener('pointerdown', (e) => {
        f.setPointerCapture?.(e.pointerId)
        fromEvent(e)
      })
      f.addEventListener('pointermove', (e) => {
        if (e.buttons) fromEvent(e)
      })
      f.addEventListener('keydown', (e) => {
        const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]
        if (!d) return
        e.preventDefault()
        set(o[key] + d)
      })
    }

    // patch pins: many of many
    for (const p of slide.querySelectorAll('[data-pin]')) {
      const key = p.dataset.pin
      const plug = (v) => {
        o.patch[key] = v
        p.setAttribute('aria-pressed', String(v))
        p.querySelector('img').src = partSrc('pin', v ? 'in' : 'out')
      }
      o.patch[key] = p.getAttribute('aria-pressed') === 'true'
      p.addEventListener('click', () => {
        plug(!o.patch[key])
        told(wireKey(key), o.patch[key], !o.patch[key])
      })
      accepts[wireKey(key)] = { kind: 'bool' }
      show[wireKey(key)] = plug
    }

    const envView = slide.querySelector('[data-env]')
      ? screen(slide.querySelector('[data-env]'), ENV.W, ENV.H)
      : null
    scopes.set(inst, screen(slide.querySelector('[data-scope]'), SCOPE.W, SCOPE.H))
    changed()
    atRest(inst)
  }

  /* ============================================================
     THE SURFACES
     Kit parts on the rectangles instrument-surfaces.js lays out. A part is
     down while its note is held (a finger, a key, a MIDI note), so a note
     from the keyboard or a controller looks exactly like one by hand. A
     finger or a mouse dragged from one to the next plays each in turn: a
     glissando on the keys, a strum across the strings.
     ============================================================ */
  // one row a string, top string first, so the lowest string is the bottom row
  const FRET_KEYS = ['123456789', 'qwertyuio', 'asdfghjkl', 'zxcvbnm,.']
  const PAD_KEYS = { k: 'kick', s: 'snare', h: 'hat', t: 'tom1', y: 'tom2', r: 'crash' }
  // a press shows for at least this long, so the quickest tap is still seen
  const SEEN_MS = 100
  // each instrument's surface, once wired, and the part a peer's note lights:
  // SURF[inst] = { surface, idFor(n or part) }
  const SURF = {}

  const slides = Array.from(document.querySelectorAll('.carousel-slide'))
  const tabs = Array.from(document.querySelectorAll('.k-cardtab'))
  const shots = Array.from(document.querySelectorAll('.stage .shot'))
  const stage = document.querySelector('.stage')

  // the zone's own name for itself, which is also what a part is keyed by
  const idOf = (z) => z.part || (z.string === undefined ? z.note : `${z.string}:${z.fret}`)

  // One surface: a board of parts, one on each zone. `make(zone)` builds the
  // part, `look(button, down)` shows its state, `fire(zone, velocity)`
  // sounds it and hands back the voice. The board sits in a scroller: the
  // range never shrinks with the screen.
  function mountSurface(host, { layout, make, look, fire, deckClass = '', lip = false }) {
    const board = document.createElement('div')
    board.className = `deck ${deckClass}`.trim()
    const scroll = document.createElement('div')
    scroll.className = 'scroll'
    scroll.append(board)
    host.replaceChildren(scroll)
    const buttons = new Map()
    const zoneOf = new Map()
    let width = 0

    // lays the parts out for the column; `again` relays them when the
    // layout itself moved (the keys' octave), and a part whose zone is gone
    // goes with it
    function place(again) {
      const next = host.clientWidth
      if (next <= 0 || (next === width && again !== true)) return
      width = next
      const r = layout(width)
      board.style.width = `${r.w}px`
      board.style.height = `${r.h}px`
      zoneOf.clear()
      for (const z of r.zones) {
        const id = idOf(z)
        zoneOf.set(id, z)
        let b = buttons.get(id)
        if (!b) {
          b = make(z)
          b.type = 'button'
          b.dataset.id = id
          b.addEventListener('keydown', (e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
              e.preventDefault()
              press(id)
            }
          })
          b.addEventListener('keyup', (e) => {
            if (e.key === ' ' || e.key === 'Enter') release(id)
          })
          buttons.set(id, b)
          board.appendChild(b)
        }
        Object.assign(b.style, {
          left: `${z.x}px`,
          top: `${z.y}px`,
          width: `${z.w}px`,
          height: `${z.h}px`,
        })
        // a key's name stands in the deck at the key's column (wireKeys),
        // so it moves with the key when the board is relaid
        const name = b.querySelector('.cname')
        if (name) {
          name.style.left = `${z.x}px`
          name.style.width = `${z.w}px`
        }
      }
      for (const [id, b] of buttons)
        if (!zoneOf.has(id)) {
          release(id, true)
          b.remove()
          buttons.delete(id)
        }
    }

    const held = new Map()
    function press(id, velocity) {
      const z = zoneOf.get(id)
      if (!z) return null
      release(id, true)
      const voice = fire(z, velocity)
      const b = buttons.get(id)
      look(b, true)
      held.set(id, { voice, at: performance.now() })
      return voice
    }
    function release(id, now) {
      const h = held.get(id)
      if (!h) return
      held.delete(id)
      h.voice?.release?.()
      const b = buttons.get(id)
      const wait = now ? 0 : SEEN_MS - (performance.now() - h.at)
      if (wait > 0) setTimeout(() => !held.has(id) && look(b, false), wait)
      else look(b, false)
    }

    // the hand: down on a part plays it; dragged onto the next part, lets the
    // last go and plays the next
    let under = null
    const idAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]')
    board.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-id]')
      if (!b) return
      e.preventDefault()
      under = b.dataset.id
      press(under)
      board.setPointerCapture?.(e.pointerId)
    })
    board.addEventListener('pointermove', (e) => {
      if (under === null) return
      const b = idAt(e)
      if (!b || !board.contains(b) || b.dataset.id === under) return
      release(under)
      under = b.dataset.id
      press(under)
    })
    const end = () => {
      if (under !== null) release(under)
      under = null
    }
    board.addEventListener('pointerup', end)
    board.addEventListener('pointercancel', end)
    board.addEventListener('lostpointercapture', end)

    // A peer's note (a session): three cells on the part in the peer's
    // own hue, while it sounds (peerCells). They stand in the deck at the
    // part's rectangle, as a C's name does, so a white key static in its
    // row carries them too, and they never take the hand: a glissando
    // passes over them. Hands back the way to take them off.
    function mark(id, color) {
      const z = zoneOf.get(id)
      if (!z) return null
      const cells = lay.peerCells(z.w, z.h, lip).map(([x, y]) => {
        const c = document.createElement('span')
        c.className = color ? 'k-cell peer' : 'k-cell is-live peer'
        c.setAttribute('aria-hidden', 'true')
        c.style.left = `${z.x + x}px`
        c.style.top = `${z.y + y}px`
        if (color) c.style.background = color
        return c
      })
      board.append(...cells)
      return () => cells.forEach((c) => c.remove())
    }

    new ResizeObserver(() => place()).observe(host)
    place()
    return {
      press,
      release,
      mark,
      has: (id) => zoneOf.has(id),
      zones: () => [...zoneOf.values()],
      relayout: () => place(true),
    }
  }

  // a picture part's state is its picture
  const partButton = (cls, name, state, aria) => {
    const b = document.createElement('button')
    b.className = `k-part ${cls}`
    b.setAttribute('aria-label', aria)
    const img = document.createElement('img')
    img.className = 'k-px'
    img.alt = ''
    img.src = partSrc(name, state)
    b.append(img)
    return b
  }

  function wireKeys(slide, voice) {
    const inst = slide.dataset.instrument
    const host = slide.querySelector('[data-keys]')
    // where the keys start: the octave row on the panel is the one control
    // for it (wirePanel keeps OPT in step and calls slide._octave)
    const radios = [...slide.querySelectorAll('[data-radio="octave"] [role="radio"]')]
    let octave = OPT[inst].octave
    const surface = mountSurface(host, {
      layout: () => lay.keybed({ octave }),
      deckClass: 'k-piano',
      lip: true,
      make: (z) => {
        const b = z.black
          ? partButton('k-black', 'black', 'up', `Play ${z.note}`)
          : partButton('k-white', 'white', 'up', `Play ${z.note}`)
        // each C carries its name, so the keys say where they are; the name
        // stands in the deck at the key's column (a white key is static in
        // its row, instruments.css) and goes with the key
        if (!z.black && z.note.startsWith('C')) {
          const name = document.createElement('span')
          name.className = 'cname k-meta'
          name.setAttribute('aria-hidden', 'true')
          name.textContent = z.note
          b.append(name)
        }
        return b
      },
      look: (b, down) => {
        const name = b.classList.contains('k-black') ? 'black' : 'white'
        b.querySelector('img').src = partSrc(name, down ? 'down' : 'up')
        b.setAttribute('aria-pressed', String(down))
      },
      fire: (z, velocity) => sound(inst, voice, z.note, velocity),
    })
    // a peer's note lights its key when the key is on the board
    SURF[inst] = { surface, idFor: (n) => lay.midiToNote(n) }
    // a note on the drawn keys presses its key; any other still sounds
    const offBoard = new Map()
    const down = (note, velocity) => {
      if (surface.has(note)) return surface.press(note, velocity)
      offBoard.get(note)?.release?.()
      const v = sound(inst, voice, note, velocity)
      offBoard.set(note, v)
      return v
    }
    const up = (note) => {
      if (surface.has(note)) return surface.release(note)
      offBoard.get(note)?.release?.()
      offBoard.delete(note)
    }
    // the octave row moved: the keys move with it, and on the piano the
    // sheet's window
    slide._octave = (o) => {
      if (o === octave) return
      octave = o
      surface.relayout()
      if (inst === 'rhodes') sheetWindow?.(octave)
    }
    // z and x step the row itself, so it lights whichever way it moved
    const step = (to) => {
      const b = radios.find((r) => Number(r.dataset.value) === to)
      if (b) b.click()
      else slide._octave(to)
    }
    const typedNote = new Map()
    slide._down = (ch) => {
      const next = lay.shiftOctave(ch, octave)
      if (ch === lay.OCTAVE_DOWN || ch === lay.OCTAVE_UP) {
        if (next !== octave) step(next)
        return true
      }
      const note = lay.typed(ch, octave)
      if (!note) return false
      typedNote.set(ch, note)
      down(note)
      return true
    }
    slide._up = (ch) => {
      const note = typedNote.get(ch)
      if (!note) return
      typedNote.delete(ch)
      up(note)
    }
    slide._midi = ({ on, note, velocity }) => (on ? down(note, velocity) : up(note))
  }

  // what every surface does to sound a note: the voice, the scope, on the
  // piano the sheet, and in a session the room, which hears the key go up
  // too when the voice is one that holds (a damper, an envelope's R)
  function sound(inst, voice, note, velocity) {
    const v = voice({ note, velocity })
    if (inst === 'rhodes') sheet?.(note)
    listen(v?.hz ?? null)
    const n = lay.noteToMidi(note)
    act('note', { i: inst, n, v: velocity ?? HAND_VELOCITY[inst] ?? 1 })
    if (v?.release) {
      const up = v.release
      v.release = () => {
        act('off', { i: inst, n })
        return up()
      }
    }
    return v
  }

  function wireFrets(slide, voice) {
    const inst = slide.dataset.instrument
    const host = slide.querySelector('[data-frets]')
    const open = host.dataset.strings.split(',')
    // Legato: a new fret on a string that is still ringing (within 600 ms)
    // cuts the last note and slurs into the new one, a hammer-on going up,
    // a pull-off coming down; two frets on one string at once, the higher
    // wins, the way a finger stops a string.
    const SIMUL_WINDOW = 60
    const LEGATO_WINDOW = 600
    const ringing = new Map()
    const pluck = (z, velocity) => {
      const t = performance.now()
      const semi = lay.noteToMidi(z.note)
      const prev = ringing.get(z.string)
      const dt = prev ? t - prev.time : Infinity
      let legato = false
      if (prev && dt < SIMUL_WINDOW && semi <= prev.semi) return prev.voice
      if (prev && dt < LEGATO_WINDOW && semi !== prev.semi) {
        prev.voice?.stop?.()
        legato = true
      }
      const v = voice({ note: z.note, velocity, legato })
      ringing.set(z.string, { semi, voice: v, time: t })
      listen(v?.hz ?? null)
      if (inst === 'ukulele') letGo()
      act('note', { i: inst, n: semi, v: velocity ?? 1 })
      return v
    }
    let surface = null
    // strum: a fret is a barre, every string at it, the lowest first, 30 ms
    // apart; the strings it adds are only plucked, never strummed again
    const barre = new Set()
    const fire = (z, velocity) => {
      if (barre.delete(idOf(z))) return pluck(z, velocity)
      if (OPT[inst].strum)
        for (let s = open.length - 1; s >= 0; s--) {
          if (s === z.string) continue
          const id = `${s}:${z.fret}`
          const wait = (open.length - 1 - s) * 30
          setTimeout(() => {
            barre.add(id)
            surface.press(id)
          }, wait)
          setTimeout(() => surface.release(id), wait + 120)
        }
      return pluck(z, velocity)
    }
    surface = mountSurface(host, {
      layout: (w) => {
        const r = lay.fretboard(w, open)
        // a row of fret numbers under the neck
        return { ...r, h: r.h + 24 }
      },
      make: (z) => {
        const b = document.createElement('button')
        b.className = z.fret ? 'k-part fret k-rl' : 'k-part fret'
        b.setAttribute(
          'aria-label',
          `Play ${z.note}, string ${z.string + 1}, ${z.fret ? `fret ${z.fret}` : 'open'}`
        )
        const string = document.createElement('span')
        string.className = 'string k-rt'
        b.append(string)
        if (!z.fret) {
          const name = document.createElement('span')
          name.className = 'open k-lbl'
          name.textContent = z.note.replace(/-?\d+$/, '')
          b.append(name)
        }
        const lampImg = document.createElement('img')
        lampImg.className = 'k-px k-lamp'
        lampImg.alt = ''
        lampImg.src = partSrc('lamp', 'on')
        lampImg.hidden = true
        b.append(lampImg)
        return b
      },
      look: (b, down) => {
        b.querySelector('.k-lamp').hidden = !down
        b.setAttribute('aria-pressed', String(down))
      },
      fire,
    })
    // a peer's note lights the fret a MIDI note would press (below)
    SURF[inst] = { surface, idFor: (n) => fretFor(surface, lay.midiToNote(n)) }
    // the fret numbers, one under each fret
    const deck = host.querySelector('.deck')
    const numbers = () => {
      deck.querySelectorAll('.fret-no').forEach((n) => n.remove())
      const zs = surface.zones().filter((z) => z.string === 0 && z.fret > 0)
      for (const z of zs) {
        const n = document.createElement('span')
        n.className = 'fret-no k-meta'
        n.textContent = String(z.fret)
        n.style.left = `${z.x + z.w / 2 - 22}px`
        n.style.top = `${open.length * z.h}px`
        deck.append(n)
      }
    }
    numbers()
    new ResizeObserver(numbers).observe(host)

    const typed = new Map()
    slide._down = (ch) => {
      const s = FRET_KEYS.findIndex((row) => row.includes(ch))
      if (s < 0) return false
      const id = `${s}:${FRET_KEYS[s].indexOf(ch)}`
      typed.set(ch, id)
      surface.press(id)
      return true
    }
    slide._up = (ch) => {
      const id = typed.get(ch)
      if (!id) return
      typed.delete(ch)
      surface.release(id)
    }
    // MIDI: the lowest fret that has the note, on the string nearest the nut
    slide._midi = ({ on, note, velocity }) => {
      const id = fretFor(surface, note)
      if (id !== null) return on ? surface.press(id, velocity) : surface.release(id)
      if (!on) return
      listen(voice({ note, velocity })?.hz ?? null)
      act('note', { i: inst, n: lay.noteToMidi(note), v: velocity ?? 1 })
    }
  }
  // the lowest fret that has the note, on the string nearest the nut
  function fretFor(surface, note) {
    const z = surface
      .zones()
      .filter((q) => q.note === note)
      .sort((p, q) => p.fret - q.fret)[0]
    return z ? idOf(z) : null
  }

  function wirePads(slide) {
    const parts = Object.entries(V.KIT).map(([id, { name }]) => ({ id, name }))
    const surface = mountSurface(slide.querySelector('[data-pads]'), {
      layout: (w) => lay.pads(w, parts),
      make: (z) => {
        const b = document.createElement('button')
        b.className = 'k-hw'
        b.textContent = V.KIT[z.part].name
        // three sparks across its top, lit in brick while it is down, the
        // way a lamp is lit (main's ripples)
        for (const [x, y] of lay.sparks(z.w)) {
          const c = document.createElement('span')
          c.className = 'k-cell is-live spark'
          c.setAttribute('aria-hidden', 'true')
          c.style.left = `${x}px`
          c.style.top = `${y}px`
          b.append(c)
        }
        return b
      },
      look: (b, down) => {
        b.classList.toggle('is-down', down)
        b.setAttribute('aria-pressed', String(down))
      },
      fire: (z, velocity) => {
        const v = drum(z.part)
        listen(null)
        act('note', { i: 'drums', p: z.part, v: velocity ?? 1 })
        return v
      },
    })
    SURF.drums = { surface, idFor: (p) => p }
    slide._down = (ch) => {
      if (!PAD_KEYS[ch]) return false
      surface.press(PAD_KEYS[ch])
      return true
    }
    slide._up = (ch) => PAD_KEYS[ch] && surface.release(PAD_KEYS[ch])
    slide._midi = (msg, number) => {
      const part = lay.GM_DRUMS[number]
      if (!part) return
      if (msg.on) surface.press(part)
      else surface.release(part)
    }
  }

  const VOICE = { rhodes, bass: sawPluck, ukulele: nylonPluck, synth }

  // A peer's act, played here. The note sounds through this tab's own voice
  // whichever instrument is showing, but only on a context this tab's hand
  // has already unlocked: a peer never opens the audio (the browser would
  // refuse it anyway), so until the visitor touches the page a peer's note
  // is seen and not heard. It lights its part in the peer's hue for as long
  // as it sounds: a pluck or a pad for a moment, a held key until its `off`
  // (or ten seconds, the synth's own ceiling, if the `off` never comes).
  const HOLDS = new Set(['rhodes', 'synth'])
  const LIT_MS = 160
  const HELD_MS = 10000
  const heard = new Map()
  function letPeerGo(key) {
    const h = heard.get(key)
    if (!h) return
    heard.delete(key)
    clearTimeout(h.timer)
    h.voice?.release?.()
    const wait = SEEN_MS - (performance.now() - h.at)
    if (wait > 0) setTimeout(() => h.unmark?.(), wait)
    else h.unmark?.()
  }
  function replay(a) {
    if (a.ch === 'patch') return SHOW[a.i][a.k](a.v)
    const what = a.i === 'drums' ? a.p : a.n
    const key = `${a.id}|${a.i}|${what}`
    letPeerGo(key)
    if (a.ch === 'off') return
    const s = SURF[a.i]
    const id = s ? s.idFor(what) : null
    const unmark = id !== null && s.surface.has(id) ? s.surface.mark(id, a.color) : null
    let voice = null
    if (actx && actx.state === 'running') {
      if (a.i === 'drums') voice = V.drum(actx, bus, OPT.drums, a.p)
      else {
        const note = lay.midiToNote(a.n)
        voice = V[VOICE_OF[a.i]](actx, bus, OPT[a.i], { note, velocity: a.v }, mem)
        if (a.i === 'rhodes') sheet?.(note)
      }
      listen(voice?.hz ?? null)
    }
    const h = { voice, unmark, at: performance.now(), timer: 0 }
    h.timer = setTimeout(() => letPeerGo(key), HOLDS.has(a.i) ? HELD_MS : LIT_MS)
    heard.set(key, h)
  }
  // THE PAGE'S LISTENERS ARE THE PAGE'S (2026-09-25). This is a classic
  // script, and the canvas runs it again every time the sheet opens, so a
  // listener put on the document or the window outlives the card it was
  // made for. Two did, the keyboard's, and nothing ever took them off: after
  // one visit to the instruments every arrow key on a case
  // study walked tabs nobody could see, every letter played a note, and each
  // reopen stacked another copy. So every listener past the card's own
  // elements rides ONE signal, aborted the first time it finds the rig gone
  // from the document, and the keys ask `here()` before they do anything: a
  // rig still in the document but not on screen (the sheet closed, the
  // modal hidden) is a page nobody is at.
  // seam: test/web-instruments.test.js
  const rig = document.querySelector('.rig')
  const gone = new AbortController()
  const alive = () => {
    if (rig?.isConnected) return true
    gone.abort()
    return false
  }
  const here = () => alive() && rig.getClientRects().length > 0
  function onPeer(e) {
    if (!alive()) return
    if (!V || !lay) return
    const a = lay.peerAct(e.detail, { parts: Object.keys(V.KIT), controls: CONTROLS })
    if (!a) return
    replaying = true
    try {
      replay(a)
    } finally {
      replaying = false
    }
  }
  window.addEventListener('canvas:peer-act', onPeer, { signal: gone.signal })

  // The card is markup and reads without its script. The panel, the
  // surfaces and the screens are wired when the layout and the voices
  // arrive; a failed import leaves the card legible rather than the page
  // blank.
  Promise.all([import('/canvas/instrument-surfaces.js'), import('/canvas/instrument-voices.js')])
    .then(([surfaces, voices]) => {
      lay = surfaces
      V = voices
      for (const slide of slides) {
        const inst = slide.dataset.instrument
        wirePanel(slide)
        if (inst === 'rhodes') wireSheet(slide.querySelector('[data-sheet]'))
        if (inst === 'drums') wirePads(slide)
        else if (slide.querySelector('[data-keys]')) wireKeys(slide, VOICE[inst])
        else if (slide.querySelector('[data-frets]')) wireFrets(slide, VOICE[inst])
      }
      fitShots(lay.shotScale)
      wireMidi()
      // the panel's bar is the kit's snap scrollbar; a card without it
      // still plays, its panel panned by the finger alone
      import('multiplayer-canvas/kit/scroll')
        .then((kit) => slides.forEach((slide) => wirePan(slide, kit)))
        .catch(() => {})
    })
    .catch(() => {
      /* the panel stands without its surfaces */
    })

  // THE PANEL PANS (D7, BIBLE.md section 8). On a watch or a phone the
  // panel keeps the desk's one row (instruments.css) and the card is a
  // window on it, so no control shrinks under the tap floor. The kit's snap
  // scrollbar at the card's foot walks the row stop by stop
  // (instrument-surfaces.js panStops: each stop a window of whole controls,
  // named for its section), a finger pans it as the scroller it is, and the
  // bar follows the finger to the stop it is nearest. A control reached by
  // the keyboard is scrolled into the window by the browser, and the bar
  // follows that too. Where the row fits (a desk) there is one stop and no
  // bar. The stops are measured again whenever the row or a section in it
  // changes size (a slide shown, the MIDI lamp lit), and the bar is rebuilt
  // only when they moved.
  // what a window holds whole: a control with its label, a screen, the
  // patch with its row and column names, the MIDI lamp and its button
  const UNITS = '.stack, .k-scope, .patch, .lamp, .k-btn'
  function wirePan(slide, kit) {
    const strip = slide.querySelector('.panel')
    if (!strip) return
    const host = document.createElement('div')
    host.className = 'panel-bar'
    host.hidden = true
    strip.after(host)
    // the bar is named for the instrument, the name its tab already has
    const tab = document.getElementById(slide.getAttribute('aria-labelledby'))
    const label = tab?.getAttribute('aria-label') ?? ''
    let stops = []
    let bar = null
    const shown = (el) => el.getClientRects().length > 0
    const measure = () => {
      const base = strip.getBoundingClientRect().left - strip.scrollLeft
      const box = (el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left - base, w: r.width }
      }
      const secs = [...strip.children].filter(shown).map((sec) => ({
        ...box(sec),
        name: sec.querySelector('.k-lbl')?.textContent ?? '',
        units: [...sec.querySelectorAll(UNITS)].filter(shown).map(box),
      }))
      return lay.panStops(secs, strip.clientWidth)
    }
    const nearest = () => {
      let i = 0
      stops.forEach((s, j) => {
        if (Math.abs(s.x - strip.scrollLeft) < Math.abs(stops[i].x - strip.scrollLeft)) i = j
      })
      return i
    }
    const build = () => {
      if (!shown(slide)) return
      const next = measure()
      if (next.length === stops.length && next.every((s, i) => s.x === stops[i].x)) return
      stops = next
      host.hidden = stops.length < 2
      bar = null
      if (host.hidden) return host.replaceChildren()
      const titles = stops.map((s) => s.name)
      host.innerHTML = kit.scrollMarkup({ titles, at: nearest(), label })
      bar = kit.wireScroll(host.firstElementChild, {
        titles,
        onCommit: (i) => (strip.scrollLeft = stops[i].x),
      })
    }
    strip.addEventListener('scroll', () => bar?.set(nearest()), { passive: true })
    const ro = new ResizeObserver(build)
    ro.observe(strip)
    for (const sec of strip.children) ro.observe(sec)
  }

  // A photograph is shown at its bake, at half where the room is short, or
  // at a quarter where half is wider than the column (shotScale), and the
  // five are one set at one scale: the scale is the one the largest of them
  // needs. The stage is as tall as the tallest of them, so the tabs under
  // it never move when the instrument changes: a tab stays where the hand
  // left it. On a desk the room is what the window
  // leaves after everything above the stage (the page bar, the title line,
  // the rig's margin), the tallest card, and what the page keeps under the
  // rig, so the whole rig stands in the window with no page scroll; a
  // phone's or a watch's screen is short and may scroll, its pictures take
  // a sixth of it.
  // The top is measured, not summed from tokens: --page-bar-h is a calc(),
  // and a custom property reads back as its unresolved text, which
  // parseFloat turned into no bar at all. offsetTop is layout, so a sheet
  // still growing out of its card (a transform) does not skew it.
  const topOf = (el) => {
    let y = 0
    for (let e = el; e; e = e.offsetParent) y += e.offsetTop
    return y
  }
  function fitShots(shotScale) {
    const rig = document.querySelector('.rig')
    const tabs = rig.querySelector('.k-cardtabs')
    const card = rig.querySelector('.k-card')
    // the card with its tallest slide shown; hidden slides are display:none,
    // so each is shown for the measurement, inside one layout pass, and
    // nothing is painted between
    const tallestCard = () => {
      const was = slides.map((sl) => sl.hidden)
      let h = 0
      for (const sl of slides) {
        slides.forEach((s) => (s.hidden = s !== sl))
        h = Math.max(h, card.offsetHeight)
      }
      slides.forEach((sl, i) => (sl.hidden = was[i]))
      return h
    }
    const fit = () => {
      const column = stage.clientWidth
      if (column <= 0) return
      let room
      if (!lay.onDesk(window.innerWidth, window.innerHeight)) room = window.innerHeight * 0.17
      else {
        // under the rig: its own margin and the padding of the page it sits in
        const page = rig.parentElement.closest('#sheetInner') || rig.parentElement
        const below =
          (parseFloat(getComputedStyle(rig).marginBottom) || 0) +
          (parseFloat(getComputedStyle(page).paddingBottom) || 0) +
          (parseFloat(getComputedStyle(stage).marginBottom) || 0)
        room = window.innerHeight - topOf(stage) - below - tabs.offsetHeight - tallestCard()
      }
      let k = 1
      for (const img of shots)
        if (img.naturalWidth)
          k = Math.max(k, shotScale(img.naturalWidth, img.naturalHeight, column, room))
      let tall = 0
      for (const img of shots) {
        if (!img.naturalWidth) continue
        img.style.width = `${img.naturalWidth / k}px`
        img.style.height = `${img.naturalHeight / k}px`
        // the scale is the only size: the reading column fits its images to
        // itself (#sheetInner .prose img), which on a watch squeezed this one
        // on one axis and not the other
        img.style.maxWidth = 'none'
        tall = Math.max(tall, img.naturalHeight / k)
      }
      stage.style.height = `${tall}px`
    }
    for (const img of shots) if (!img.complete) img.addEventListener('load', fit, { once: true })
    fit()
    new ResizeObserver(fit).observe(stage)
    new ResizeObserver(fit).observe(card)
  }

  /* ============================================================
     MIDI: one lamp, and nothing where there is no Web MIDI
     Lit while a keyboard is connected (U2). A lamp is read, never pressed
     (the kit's grammar: a switch you throw, a lamp you read), so the one
     question the browser needs a gesture for is a push button beside it,
     "connect", shown only until MIDI is let in. If the browser already
     allows MIDI it connects on load, silently, and the button never shows.
     ============================================================ */
  function wireMidi() {
    if (!navigator.requestMIDIAccess) return
    const lamps = [...document.querySelectorAll('[data-lamp]')]
    const asks = [...document.querySelectorAll('[data-midi-connect]')]
    document.querySelectorAll('[data-midi]').forEach((s) => (s.hidden = false))
    const say = (n, refused) =>
      lamps.forEach((l) => {
        l.querySelector('img').src = partSrc('lamp', n ? 'on' : 'off')
        l.setAttribute(
          'aria-label',
          refused
            ? 'midi: not allowed'
            : n
              ? `midi: ${n} ${n === 1 ? 'keyboard' : 'keyboards'} connected`
              : access
                ? 'midi: no keyboard connected'
                : 'midi: not connected yet'
        )
      })
    const asking = (on) => asks.forEach((b) => (b.hidden = !on))
    let access = null
    const onMessage = (e) => {
      const msg = lay.midiMessage(e.data)
      if (!msg) return
      audio()
      slides[current]?._midi?.(msg, e.data[1])
    }
    const connect = async () => {
      access = await navigator.requestMIDIAccess()
      const hear = () => {
        const inputs = [...access.inputs.values()]
        inputs.forEach((i) => (i.onmidimessage = onMessage))
        say(inputs.length)
      }
      access.onstatechange = hear
      hear()
      asking(false)
    }
    say(0)
    asking(true)
    navigator.permissions
      ?.query({ name: 'midi' })
      .then((p) => p.state === 'granted' && connect())
      .catch(() => {})
    for (const b of asks)
      b.addEventListener('click', () => {
        if (!access) connect().catch(() => say(0, true))
      })
  }

  /* ============================================================
     THE TABS: one instrument at a time
     ============================================================ */
  // Each tab's name in the address, by the instrument it holds: the name on
  // the tab, where the tab has one of its own (the Rhodes is the epiano).
  const HASH = { rhodes: 'epiano', bass: 'bass', ukulele: 'uke', drums: 'drums', synth: 'synth' }
  // the tab a hash names, or -1 for none
  const tabOf = (hash) =>
    slides.findIndex((sl) => `#${HASH[sl.dataset.instrument]}` === String(hash || '').toLowerCase())
  // The address follows the tab without a new history entry and without a
  // fragment navigation (which would scroll to an id and fire hashchange):
  // replaceState, keeping the state the canvas's router keeps there. Only
  // while this card is on the page: a copy of this script left behind by an
  // earlier sheet must not write over the canvas's address.
  function writeHash(idx) {
    const name = HASH[slides[idx]?.dataset.instrument]
    if (!name || !rig?.isConnected || location.hash === `#${name}`) return
    try {
      history.replaceState(history.state, '', `${location.pathname}${location.search}#${name}`)
    } catch {
      /* an address that cannot be written stays as it was */
    }
  }
  // a hash typed or followed later walks to its tab; one naming no tab is
  // left alone, and a copy whose card is gone takes itself off
  function onHash() {
    if (!alive()) return
    const idx = tabOf(location.hash)
    if (idx > -1) goTo(idx)
  }
  window.addEventListener('hashchange', onHash, { signal: gone.signal })

  let current = -1
  function goTo(idx, focus) {
    const n = slides.length
    idx = ((idx % n) + n) % n
    if (idx === current) return
    const was = current
    // the first tab is the page's own, the address is only written on a move
    if (current > -1) writeHash(idx)
    slides.forEach((sl, i) => {
      sl.hidden = i !== idx
      sl.toggleAttribute('inert', i !== idx)
    })
    tabs.forEach((t, i) => {
      t.setAttribute('aria-selected', String(i === idx))
      t.tabIndex = i === idx ? 0 : -1
    })
    // where the five do not fit (a watch) their strip pans, and the lit one
    // is brought to its middle: a cut, like every move on the card
    const strip = tabs[idx].parentElement
    if (strip && strip.scrollWidth > strip.clientWidth)
      strip.scrollLeft = tabs[idx].offsetLeft + (tabs[idx].offsetWidth - strip.clientWidth) / 2
    const inst = slides[idx].dataset.instrument
    shots.forEach((img) => (img.hidden = img.dataset.for !== inst))
    if (focus) tabs[idx].focus()
    current = idx
    if (!watching) atRest(inst)
    // a move of the visitor's own is a view: the landing is the address's
    if (was > -1) view({ what: 'tab', i: HASH[inst] })
  }
  // A peer's instrument, read strictly: a name one of this card's tabs
  // carries, or nothing. And the one this tab shows, said again when the
  // canvas asks (a new follower, a page they have only just opened).
  function onPeerView(e) {
    if (!alive()) return
    const d = e.detail
    if (!d || d.what !== 'tab' || typeof d.i !== 'string') return
    const idx = tabOf(`#${d.i}`)
    if (idx < 0) return
    replaying = true
    try {
      goTo(idx)
    } finally {
      replaying = false
    }
  }
  window.addEventListener('canvas:peer-view', onPeerView, { signal: gone.signal })
  window.addEventListener(
    'canvas:view-again',
    () => {
      if (alive() && current > -1)
        view({ what: 'tab', i: HASH[slides[current].dataset.instrument] })
    },
    { signal: gone.signal }
  )
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => goTo(i))
    t.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
      if (to === undefined) return
      e.preventDefault()
      e.stopPropagation()
      goTo(to, true)
    })
  })

  // The frame owns the finger (BIBLE.md section 8): a sideways drag on the
  // photograph walks the tabs, and never the sheet's page swipe.
  if (stage) {
    let start = null
    stage.addEventListener(
      'pointerdown',
      (e) => {
        start = { x: e.clientX, y: e.clientY, t: performance.now() }
      },
      { passive: true }
    )
    const end = (e) => {
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      const dt = performance.now() - start.t
      start = null
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 900)
        goTo(current + (dx < 0 ? 1 : -1))
    }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', () => {
      start = null
    })
  }

  // a control that owns its arrows (a knob, a fader, a radio row, the tabs)
  // keeps them; anywhere else they walk the tabs
  const OWNS_ARROWS = '[role="slider"], [role="radio"], [role="tab"]'
  document.addEventListener(
    'keydown',
    (e) => {
      if (!here()) return
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (e.target.closest?.(OWNS_ARROWS)) return
        e.preventDefault()
        goTo(current + (e.key === 'ArrowLeft' ? -1 : 1))
        return
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && e.key.length === 1) {
        const down = slides[current] && slides[current]._down
        if (down && down(e.key.toLowerCase())) e.preventDefault()
      }
    },
    { signal: gone.signal }
  )
  document.addEventListener(
    'keyup',
    (e) => {
      if (here() && e.key.length === 1) slides[current]?._up?.(e.key.toLowerCase())
    },
    { signal: gone.signal }
  )

  // iOS only unlocks Web Audio when something audible starts inside a
  // gesture, so a one-sample buffer goes out on the first touch.
  const prime = () => {
    const a = audio()
    if (!a) return
    try {
      if (a.state === 'suspended') a.resume()
      const src = a.createBufferSource()
      src.buffer = a.createBuffer(1, 1, 22050)
      src.connect(a.destination)
      src.start(0)
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('pointerdown', prime, { once: true, signal: gone.signal })
  window.addEventListener('touchstart', prime, { once: true, passive: true, signal: gone.signal })
  window.addEventListener('keydown', prime, { once: true, signal: gone.signal })

  // land on the tab the address names, the first when it names none
  goTo(Math.max(0, tabOf(location.hash)))
})()
