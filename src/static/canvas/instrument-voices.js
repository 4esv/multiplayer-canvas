// The voices of /web-instruments (#301): every sound the page makes, as a
// function from an AudioContext, a destination and the instrument's options
// to a graph. PURE of the page: no DOM and no module state, so a test can run
// a voice on a context that only records, and prove that each control on the
// panel changes the graph it builds (test/web-instruments.test.js).
//
// A voice hands back what can happen to it after it starts: `hz`, the pitch
// the scope holds still on (null for a drum or noise); `release`, the key
// coming up (a damper, an envelope's R); `stop`, a new note on the same
// string cutting it (a hammer-on). Either may be absent.
//
// The recipes are the page's own, moved here unchanged; the options only
// scale them, and each option's default multiplies by one.

const NOTE_MAP = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}
const noteToSemi = (note) => {
  const m = /^([A-G][#b]?)(-?\d+)$/.exec(note)
  return m ? NOTE_MAP[m[1]] + (parseInt(m[2], 10) + 1) * 12 : 0
}
export const noteToFreq = (note) => 440 * Math.pow(2, (noteToSemi(note) - 69) / 12)

// tone: half an octave of brightness a step, the middle one untouched
const bright = (t) => 2 ** ((t - 4) / 2)
// a decay knob's eight lengths, in seconds; the middle one is the voice's own
const RHODES_DECAY = [0.6, 0.9, 1.2, 1.5, 1.8, 2.4, 3.2, 4.5]
const UKE_DECAY = [0.5, 0.8, 1.1, 1.35, 1.6, 2.0, 2.6, 3.4]

// A voice hands back what can happen to it after it starts: `release` is
// the key coming up (a damper, an envelope's R), `stop` a new note on the
// same string cutting it (a hammer-on). Either may be absent.
const fade = (param, at, tau = 0.03) => {
  param.cancelScheduledValues(at)
  param.setTargetAtTime(0.0001, at, tau)
}

// Rhodes electric piano: two 2-op FM stacks (a 1:1 body and a 7:1 tine),
// a sub octave, a hammer click and a filter that blooms open and settles.
// Tone scales the bloom, decay is the ring, and with the sustain off the
// key coming up lets the damper down.
export function rhodes(a, dest, o, { note = 'A4', gain = 0.2, velocity = 0.85 } = {}) {
  const f = noteToFreq(note)
  const v = Math.max(0.25, Math.min(1, velocity))
  const dur = RHODES_DECAY[o.decay]
  const p = {
    f,
    dur,
    v,
    bodyRatio: 1,
    bodyIndex: [0.65 * v, 0.22],
    tineRatio: 7,
    tineIndex: [1.6 * v, 0.05],
    tineIndexFall: 0.16,
    open: Math.min(12000, Math.max(2200, f * 10) * bright(o.tone)),
    rest: Math.min(8000, Math.max(1300, f * 5) * bright(o.tone)),
    bloom: 0.35,
    sub: 0.5,
    tremolo: 4.6,
    flutterCents: 12,
  }
  const now = a.currentTime

  const out = a.createGain()
  out.gain.value = gain
  const trem = a.createGain()
  const lfo = a.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = p.tremolo
  const lfoAmt = a.createGain()
  lfoAmt.gain.value = 0.05
  lfo.connect(lfoAmt).connect(trem.gain)
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(p.open, now)
  lp.frequency.exponentialRampToValueAtTime(p.rest, now + p.bloom)
  lp.Q.value = 0.4
  out.connect(trem).connect(lp).connect(dest)

  const bodyEnv = a.createGain()
  bodyEnv.gain.setValueAtTime(0.0001, now)
  bodyEnv.gain.exponentialRampToValueAtTime(0.95, now + 0.008)
  bodyEnv.gain.exponentialRampToValueAtTime(0.55, now + 0.25)
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, now + p.dur)
  bodyEnv.connect(out)
  const carBody = a.createOscillator()
  carBody.type = 'sine'
  carBody.frequency.value = p.f
  carBody.detune.setValueAtTime(p.flutterCents, now)
  carBody.detune.exponentialRampToValueAtTime(0.01, now + 0.05)
  carBody.connect(bodyEnv)
  const modBody = a.createOscillator()
  modBody.type = 'sine'
  modBody.frequency.value = p.f * p.bodyRatio
  const modBodyAmt = a.createGain()
  modBodyAmt.gain.setValueAtTime(p.f * p.bodyIndex[0], now)
  modBodyAmt.gain.exponentialRampToValueAtTime(p.f * p.bodyIndex[1], now + 1.6)
  modBody.connect(modBodyAmt).connect(carBody.frequency)

  const tineEnv = a.createGain()
  tineEnv.gain.setValueAtTime(0.0001, now)
  tineEnv.gain.exponentialRampToValueAtTime(0.45 * p.v, now + 0.004)
  tineEnv.gain.exponentialRampToValueAtTime(0.04, now + 0.14)
  tineEnv.gain.exponentialRampToValueAtTime(0.0001, now + p.dur * 0.85)
  tineEnv.connect(out)
  const carTine = a.createOscillator()
  carTine.type = 'sine'
  carTine.frequency.value = p.f
  carTine.connect(tineEnv)
  const modTine = a.createOscillator()
  modTine.type = 'sine'
  modTine.frequency.value = p.f * p.tineRatio
  const modTineAmt = a.createGain()
  modTineAmt.gain.setValueAtTime(p.f * p.tineIndex[0], now)
  modTineAmt.gain.exponentialRampToValueAtTime(p.f * p.tineIndex[1], now + p.tineIndexFall)
  modTine.connect(modTineAmt).connect(carTine.frequency)

  const sub = a.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = p.f * p.sub
  const subEnv = a.createGain()
  subEnv.gain.setValueAtTime(0.0001, now)
  subEnv.gain.exponentialRampToValueAtTime(0.32, now + 0.025)
  subEnv.gain.exponentialRampToValueAtTime(0.0001, now + p.dur * 0.85)
  sub.connect(subEnv).connect(out)

  const clickDur = 0.025
  const buf = a.createBuffer(1, Math.max(1, Math.ceil(a.sampleRate * clickDur)), a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const click = a.createBufferSource()
  click.buffer = buf
  const clickBp = a.createBiquadFilter()
  clickBp.type = 'bandpass'
  clickBp.frequency.value = 1600
  clickBp.Q.value = 0.9
  const clickG = a.createGain()
  clickG.gain.value = 0.07 * p.v
  click.connect(clickBp).connect(clickG).connect(out)
  click.start(now)

  const oscs = [carBody, modBody, carTine, modTine, sub, lfo]
  oscs.forEach((osc) => {
    osc.start(now)
    osc.stop(now + p.dur + 0.1)
  })
  return {
    hz: p.f,
    release() {
      if (o.sustain) return
      const t = a.currentTime
      fade(out.gain, t)
      oscs.forEach((osc) => osc.stop(t + 0.3))
    },
  }
}

// Nylon pluck (ukulele): a sine fundamental with four harmonics, each one
// detuned a little more than the last, which is what makes a real string
// inharmonic; a body resonance; a finger transient. Legato (a hammer-on or
// a pull-off) starts softer and has no finger in it.
export function nylonPluck(a, dest, o, { note = 'C4', gain = 0.22, legato = false } = {}) {
  const f = noteToFreq(note)
  const dur = UKE_DECAY[o.decay]
  const p = {
    f,
    dur,
    harmonics: [
      { mult: 1, amp: 1, decay: dur },
      { mult: 2, amp: 0.5, decay: dur * 0.7 },
      { mult: 3, amp: 0.25, decay: dur * 0.45 },
      { mult: 4, amp: 0.12, decay: dur * 0.3 },
      { mult: 5, amp: 0.06, decay: dur * 0.2 },
    ],
    detunePerHarmonic: 4,
    body: 700,
    bodyQ: 1.5,
    open: Math.min(12000, f * 14 * bright(o.tone)),
    rest: Math.max(900, f * 4) * bright(o.tone),
    bloom: 0.25,
    transient: 0.025,
    attack: legato ? 0.035 : 0.005,
  }
  const now = a.currentTime
  const out = a.createGain()
  out.gain.value = gain
  const bodyRes = a.createBiquadFilter()
  bodyRes.type = 'peaking'
  bodyRes.frequency.value = p.body
  bodyRes.Q.value = p.bodyQ
  bodyRes.gain.value = 3.5
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(p.open, now)
  lp.frequency.exponentialRampToValueAtTime(p.rest, now + p.bloom)
  lp.Q.value = 0.4
  out.connect(bodyRes).connect(lp).connect(dest)

  for (const { mult, amp, decay } of p.harmonics) {
    const osc = a.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = p.f * mult
    osc.detune.value = (Math.random() - 0.5) * p.detunePerHarmonic * mult
    const env = a.createGain()
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(amp * (legato ? 0.7 : 1), now + p.attack)
    env.gain.exponentialRampToValueAtTime(0.0001, now + decay)
    osc.connect(env).connect(out)
    osc.start(now)
    osc.stop(now + decay + 0.05)
  }

  if (!legato) {
    const buf = a.createBuffer(1, Math.max(1, Math.ceil(a.sampleRate * p.transient)), a.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
    const noise = a.createBufferSource()
    noise.buffer = buf
    const bp = a.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = Math.min(6000, p.f * 4)
    bp.Q.value = 1.2
    const ng = a.createGain()
    ng.gain.value = 0.2
    noise.connect(bp).connect(ng).connect(out)
    noise.start(now)
  }
  return { hz: p.f, stop: () => fade(out.gain, a.currentTime, 0.01) }
}

// Bass: one sawtooth through a lowpass that closes over the note, which is
// the whole of a subtractive pluck and all a StingRay needs here. Tone
// opens the filter, drive pushes the string into a soft clip after it,
// and mute is the palm on the bridge: a shorter, darker note.
export function sawPluck(
  a,
  dest,
  o,
  { note = 'A1', gain = 0.3, type = 'sawtooth', legato = false } = {}
) {
  const f = noteToFreq(note)
  const dur = o.mute ? 0.5 : 1.4
  const p = {
    f,
    dur,
    type,
    open: f * (legato ? 5 : 8) * bright(o.tone) * (o.mute ? 0.5 : 1),
    rest: Math.max(f * 1.5, 200),
    q: legato ? 2 : 4,
    attack: legato ? 0.035 : 0.008,
    peak: legato ? gain * 0.7 : gain,
  }
  const now = a.currentTime
  const osc = a.createOscillator()
  const filt = a.createBiquadFilter()
  const g = a.createGain()
  osc.type = p.type
  osc.frequency.value = p.f
  filt.type = 'lowpass'
  filt.frequency.setValueAtTime(Math.max(p.open, p.rest), now)
  filt.frequency.exponentialRampToValueAtTime(p.rest, now + p.dur)
  filt.Q.value = p.q
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(p.peak, now + p.attack)
  g.gain.exponentialRampToValueAtTime(0.0001, now + p.dur)
  osc.connect(filt)
  if (o.drive > 0) {
    // tanh, normalised so a full-scale string stays full scale
    const k = o.drive * 1.5
    const curve = new Float32Array(1024)
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1
      curve[i] = Math.tanh(k * x) / Math.tanh(k)
    }
    const shaper = a.createWaveShaper()
    shaper.curve = curve
    shaper.oversample = '2x'
    filt.connect(shaper).connect(g)
  } else filt.connect(g)
  g.connect(dest)
  osc.start(now)
  osc.stop(now + p.dur + 0.05)
  return { hz: p.f, stop: () => fade(g.gain, a.currentTime, 0.01) }
}

/* ---------- The kit: a pitch-swept sine and a band-limited noise burst,
   in the five combinations the six pads name. Tune moves every pitch
   together, a quarter octave a step; decay stretches every tail. ---------- */
function thump(a, dest, { freqStart, freqEnd, dur, gain, type }, tune, stretch) {
  const now = a.currentTime
  const d = dur * stretch
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart * tune, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd * tune, 1), now + d * 0.9)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(gain, now + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, now + d)
  osc.connect(g).connect(dest)
  osc.start(now)
  osc.stop(now + d + 0.05)
}
function noiseBurst(a, dest, { dur, gain, hp, lp }, tune, stretch) {
  const now = a.currentTime
  const d = dur * stretch
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * d), a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = a.createBufferSource()
  src.buffer = buf
  const hpF = a.createBiquadFilter()
  hpF.type = 'highpass'
  hpF.frequency.value = Math.min(18000, hp * tune)
  const lpF = a.createBiquadFilter()
  lpF.type = 'lowpass'
  lpF.frequency.value = Math.min(20000, lp * tune)
  const g = a.createGain()
  g.gain.setValueAtTime(gain, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + d)
  src.connect(hpF).connect(lpF).connect(g).connect(dest)
  src.start(now)
  src.stop(now + d + 0.02)
}

// one table: what each pad is made of
export const KIT = {
  kick: {
    name: 'kick',
    tone: { freqStart: 110, freqEnd: 30, dur: 0.2, gain: 0.65, type: 'sine' },
  },
  snare: {
    name: 'snare',
    noise: { dur: 0.18, gain: 0.28, hp: 1500, lp: 9000 },
    tone: { freqStart: 220, freqEnd: 150, dur: 0.12, gain: 0.18, type: 'triangle' },
  },
  hat: { name: 'hat', noise: { dur: 0.06, gain: 0.22, hp: 7000, lp: 16000 } },
  tom1: {
    name: 'tom 1',
    noise: { dur: 0.035, gain: 0.18, hp: 1800, lp: 7000 },
    tone: { freqStart: 200, freqEnd: 95, dur: 0.3, gain: 0.42, type: 'triangle' },
  },
  tom2: {
    name: 'tom 2',
    noise: { dur: 0.035, gain: 0.18, hp: 2200, lp: 7500 },
    tone: { freqStart: 260, freqEnd: 130, dur: 0.28, gain: 0.42, type: 'triangle' },
  },
  crash: { name: 'ride', noise: { dur: 0.6, gain: 0.13, hp: 5500, lp: 13000 } },
}

export function drum(a, dest, o, kind) {
  const piece = KIT[kind]
  const tune = 2 ** ((o.tune - 4) / 4)
  const stretch = 2 ** ((o.decay - 4) / 3)
  if (piece.noise) noiseBurst(a, dest, piece.noise, tune, stretch)
  if (piece.tone) thump(a, dest, piece.tone, tune, stretch)
  return { hz: null }
}

/* ============================================================
   THE SYNTH: the switchboard's engine
   Along the signal path: an oscillator (two detuned ones, or noise),
   a lowpass, the level, the output. An envelope (A D S R), an LFO and a
   noise source are patched onto pitch, filter and level by the pins.
   Every switch on the board is read here.
   ============================================================ */
// a fader's nine stops, in seconds (A, D and R)
const TIMES = [0.003, 0.01, 0.03, 0.07, 0.15, 0.3, 0.6, 1.2, 2.4]
// a knob's eight stops
const CUTOFF = [120, 200, 350, 600, 1000, 1600, 2700, 4500]
const RESONANCE = [0.5, 1, 2, 3.5, 5, 7, 10, 14]
// how far each pin pushes its destination: pitch and filter in cents,
// level as a share of the level
const DEPTH = {
  lfo: { pitch: 25, filter: 600, level: 0.3 },
  env: { pitch: 700, filter: 2400 },
  noise: { pitch: 60, filter: 1200, level: 0.5 },
}
const LFO_HZ = 5.5
const GLIDE = 0.08
// one buffer of white noise per context, kept in the caller's `mem`
const noiseOf = (a, mem) => {
  if (!mem.noise || mem.noise.sampleRate !== a.sampleRate) {
    mem.noise = a.createBuffer(1, a.sampleRate * 2, a.sampleRate)
    const d = mem.noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return mem.noise
}
// cancel what is scheduled from `at` on and keep the value it had there
const hold = (param, at) => {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(at)
  else {
    param.cancelScheduledValues(at)
    param.setValueAtTime(param.value, at)
  }
}

export function synth(a, dest, S, { note = 'C4', velocity = 1 } = {}, mem = {}) {
  const P = S.patch
  const now = a.currentTime
  // the octave control moves the keys (the notes come in at their pitch),
  // so the voice transposes nothing
  const f = noteToFreq(note)
  const A = TIMES[S.a]
  const D = TIMES[S.d]
  const R = TIMES[S.r]
  const sus = S.s / 8
  const level = 0.3 * (S.level / 7) * (0.6 + 0.4 * Math.max(0, Math.min(1, velocity)))

  const out = a.createGain()
  out.gain.value = level
  const vca = a.createGain()
  const filt = a.createBiquadFilter()
  filt.type = 'lowpass'
  filt.frequency.value = CUTOFF[S.cutoff]
  filt.Q.value = RESONANCE[S.resonance]
  filt.connect(vca).connect(out).connect(dest)

  // the envelope, 0 to 1 to the sustain, as a signal the pins can carry
  const env = a.createConstantSource()
  env.offset.setValueAtTime(0, now)
  env.offset.linearRampToValueAtTime(1, now + A)
  env.offset.linearRampToValueAtTime(sus, now + A + D)

  // the oscillator: two a few cents apart, or noise
  const srcs = []
  const pitch = []
  if (S.wave === 'noise') {
    const n = a.createBufferSource()
    n.buffer = noiseOf(a, mem)
    n.loop = true
    n.connect(filt)
    srcs.push(n)
    pitch.push(n.detune)
  } else
    for (const cents of [0, 8]) {
      const o = a.createOscillator()
      o.type = S.wave
      if (S.glide && mem.lastHz) {
        o.frequency.setValueAtTime(mem.lastHz, now)
        o.frequency.exponentialRampToValueAtTime(f, now + GLIDE)
      } else o.frequency.value = f
      o.detune.value = cents
      o.connect(filt)
      srcs.push(o)
      pitch.push(o.detune)
    }
  mem.lastHz = f

  // the level follows the envelope when it is patched there; unpatched,
  // the level is a gate, open while the key is down
  if (P['env:level']) {
    vca.gain.value = 0
    env.connect(vca.gain)
  } else {
    vca.gain.setValueAtTime(0, now)
    vca.gain.linearRampToValueAtTime(1, now + 0.005)
  }

  // the modulation sources, made only when a pin uses them
  const mods = []
  const used = (src) => ['pitch', 'filter', 'level'].some((d) => P[`${src}:${d}`])
  const lfo = used('lfo') ? a.createOscillator() : null
  if (lfo) {
    lfo.frequency.value = LFO_HZ
    mods.push(lfo)
  }
  const noise = used('noise') ? a.createBufferSource() : null
  if (noise) {
    noise.buffer = noiseOf(a, mem)
    noise.loop = true
    mods.push(noise)
  }
  const sources = { lfo, env, noise }
  const patch = (src, dest, param, depth) => {
    if (!P[`${src}:${dest}`] || !sources[src]) return
    const g = a.createGain()
    g.gain.value = depth
    sources[src].connect(g).connect(param)
  }
  for (const src of ['lfo', 'env', 'noise']) {
    for (const param of pitch) patch(src, 'pitch', param, DEPTH[src].pitch)
    patch(src, 'filter', filt.detune, DEPTH[src].filter)
    if (src !== 'env') patch(src, 'level', out.gain, DEPTH[src].level * level)
  }

  env.start(now)
  ;[...srcs, ...mods].forEach((s) => s.start(now))
  const all = [env, ...srcs, ...mods]
  let done = false
  const release = () => {
    if (done) return
    done = true
    const t = a.currentTime
    hold(env.offset, t)
    env.offset.linearRampToValueAtTime(0, t + R)
    // the level closes over R when the envelope has it, at once when the
    // gate does
    let end = t + R
    if (!P['env:level']) {
      hold(vca.gain, t)
      vca.gain.linearRampToValueAtTime(0, t + 0.01)
      end = t + 0.01
    }
    all.forEach((s) => s.stop(end + 0.05))
  }
  // a key never let go (a lost pointer, a MIDI off that never came)
  // still lets go
  globalThis.setTimeout(release, 10000)
  return { hz: S.wave === 'noise' ? null : f, release }
}
