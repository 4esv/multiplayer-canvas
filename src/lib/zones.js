// The zones (BIBLE.md section 5): what fits in a paragraph and a few links is
// not a page, it is a place on the ground. This builds their copy for the boot
// payload, from the same sources the terminal pages read, so the canvas and
// curl never say two different things:
//
//   about    a TRIPTYCH: Me, Work, Site, three blocks side by side under
//            the hero, the zone spanning three slots of the ring. Me is the
//            person, Work is what they do, Site answers "what am I looking
//            at".
//
// The words are the text templates', taken by selection and never
// rewritten here.
import { fmt, parseText, splitSections } from './canvas-sheets.js'
import { DOCS } from './docs.js'

// the two sections by their titles; the ways to reach the owner are the
// dock's job, and a zone never repeats what the
// ground says, so the Pages block and everything under it stay off
const ABOUT_BLOCKS = ['Me', 'This Site']
export function aboutZone(aboutText, workText, paths = {}) {
  const { body } = parseText(aboutText)
  const sections = splitSections(body)
  const col = (title, html) => `<div class="zcol"><h3>${title}</h3>${html}</div>`
  const pick = (title) => {
    const sec = sections.find((x) => x.title.toLowerCase() === title.toLowerCase())
    return fmt(sec?.body || '', paths)
  }
  // Me, then Work, then Site: the person, what they do, and what you are
  // looking at.
  // the site's documents (credits) stand at the foot of the panel that
  // answers "what am I looking at", as push buttons, not prose
  const docs =
    '<p class="zdocs">' +
    Object.keys(DOCS)
      .map((slug) => `<a class="k-btn" href="/${slug}">${slug}</a>`)
      .join('') +
    '</p>'
  const html =
    col('Me', pick(ABOUT_BLOCKS[0])) +
    col('Work', workBlocks(workText, paths)) +
    col('Site', pick(ABOUT_BLOCKS[1]) + docs)
  return { id: 'about', label: 'about', title: 'ABOUT', html, split: true }
}

// the work text's "what i do", up to the block that opens "Not clear
// enough?": that paragraph and everything below stay on the page. It is the
// about triptych's middle panel.
// seam: test/zones.test.js
export function workBlocks(workText, paths = {}) {
  const { body } = parseText(workText)
  const head = body.split(/case studies\n-{2,}\n/)[0]
  const sec = splitSections(head).find((x) => x.title === 'what i do')
  const blocks = (sec ? sec.body : '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  const at = blocks.findIndex((b) => b.startsWith('Not clear enough?'))
  return (at >= 0 ? blocks.slice(0, at) : blocks).map((b) => fmt(b, paths)).join('')
}
