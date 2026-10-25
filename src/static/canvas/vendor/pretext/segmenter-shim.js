// segmenter-shim.js — LOCAL PATCH to the vendored pretext, not upstream code.
//
// pretext constructs `new Intl.Segmenter(...)` in four places with no feature
// check and no fallback. Intl.Segmenter needs ICU segmentation data, and Apple
// ships a reduced ICU on watchOS, so on a device without it the constructor
// throws TypeError and pretext takes the whole canvas boot down with it:
// buildPhraseLines() runs before render(), so every tile ends up created but
// never placed, stacked at the scene's top-left corner at 1:1, doors over
// tiles. That is the pile photographed from an Apple Watch Ultra, and deleting
// Intl.Segmenter in a desktop WebKit reproduces it exactly.
//
// So: use the real thing when it exists, and degrade rather than throw when it
// does not. Both fallbacks are deliberately modest, because their only job is
// to keep Latin text laying out on a device that already told us it is missing
// its internationalization data:
//
//   graphemes — Array.from() iterates by CODE POINT, so surrogate pairs stay
//     whole and Latin text is exact. It does not join combining marks, ZWJ
//     emoji sequences or regional indicators into single clusters, so an emoji
//     family may measure as its parts. Nothing on this canvas is such a
//     string, and a slightly wide flag beats a blank page.
//   words — a regex boundary between runs of letters/digits/marks and
//     everything else. That is the right answer for scripts that space their
//     words, which is every script this site publishes in. It does NOT break
//     Chinese, Japanese or Thai, which is exactly the job Intl.Segmenter
//     exists for; a device missing ICU cannot have that, from us or anyone.
//
// The shape matches Intl.Segmenter's: an object with .segment(str) returning
// something iterable of { segment, index, input, isWordLike }.

const has = (() => {
  try {
    return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
  } catch {
    return false
  }
})()

function* graphemeParts(str) {
  let index = 0
  for (const ch of Array.from(str)) {
    yield { segment: ch, index, input: str, isWordLike: undefined }
    index += ch.length
  }
}

// letters, digits and combining marks are word-like; runs of anything else are
// not. \p{...} needs the u flag and has been in WebKit since Safari 10.
const WORDISH = /[\p{L}\p{N}\p{M}]/u

function* wordParts(str) {
  let start = 0
  while (start < str.length) {
    const wordLike = WORDISH.test(str[start])
    let end = start + 1
    while (end < str.length && WORDISH.test(str[end]) === wordLike) end++
    yield { segment: str.slice(start, end), index: start, input: str, isWordLike: wordLike }
    start = end
  }
}

const fallback = (granularity) => ({
  segment: (str) => (granularity === 'word' ? wordParts(String(str)) : graphemeParts(String(str))),
})

// Construction can still throw on an engine that HAS the constructor but lacks
// data for the locale asked for, so the try is not redundant with `has`.
export function makeSegmenter(locale, options) {
  const granularity = (options && options.granularity) || 'grapheme'
  if (!has) return fallback(granularity)
  try {
    return new Intl.Segmenter(locale, options)
  } catch {
    return fallback(granularity)
  }
}

// exported so a guard can assert the fallback is real rather than a stub
export const hasIntlSegmenter = has
