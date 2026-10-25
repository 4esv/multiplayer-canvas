// Time, for the owner pages. Absolute stamps are UTC to the minute; the
// relative form is what a phone screen has room for ("in 23h", "3d ago").

export function fmtWhen(ms) {
  if (ms === null || ms === undefined) return null
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

const UNITS = [
  ['d', 86400e3],
  ['h', 3600e3],
  ['m', 60e3],
]

export function fmtRelative(ms, now = Date.now()) {
  if (ms === null || ms === undefined) return 'never'
  const delta = ms - now
  const abs = Math.abs(delta)
  if (abs < 60e3) return delta >= 0 ? 'in under a minute' : 'just now'
  const [unit, size] = UNITS.find(([, s]) => abs >= s) || UNITS[UNITS.length - 1]
  const n = Math.round(abs / size)
  return delta >= 0 ? `in ${n}${unit}` : `${n}${unit} ago`
}
