// The grammar for pointing at code, read on the client. lib/code-lines.js
// writes the ids it parses:
//
//   #<block>-L12        one line
//   #<block>-L3-L9      a range, either way round
//   #<block>            the whole block, or any other element (a figure)
//
// Pure, no DOM: a case study's refs (canvas/code-refs.js) read it, and
// test/code-blocks.test.js holds it.

const LINES = /^#?([a-z0-9][a-z0-9-]*?)-L(\d+)(?:-L(\d+))?$/i

// { id, lo, hi } for a line or a range, { id } for a whole target, null
// for anything that is not a fragment of ours (an empty hash, a URL).
export function parseRef(hash) {
  const h = String(hash || '')
  if (!h || h === '#' || /[/?:]/.test(h)) return null
  const m = LINES.exec(h)
  if (m) {
    let lo = Number(m[2])
    let hi = Number(m[3] || m[2])
    if (hi < lo) [lo, hi] = [hi, lo]
    return { id: m[1], lo, hi }
  }
  const id = h.replace(/^#/, '')
  return /^[a-z0-9][a-z0-9-]*$/i.test(id) ? { id } : null
}

// the fragment for a ref, the range folded when it is one line
// seam: test/code-blocks.test.js
export function refHash(id, lo, hi) {
  if (lo == null) return '#' + id
  if (hi == null || hi === lo) return '#' + id + '-L' + lo
  return '#' + id + '-L' + Math.min(lo, hi) + '-L' + Math.max(lo, hi)
}

// the element ids a ref lights: the lines of a range, or the target itself
export function targetIds(ref) {
  if (!ref) return []
  if (ref.lo == null) return [ref.id]
  const ids = []
  for (let n = ref.lo; n <= ref.hi; n++) ids.push(ref.id + '-L' + n)
  return ids
}
