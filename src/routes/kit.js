// /admin/kit: THE SHEET, the one page every piece of the site is made of
// (src/lib/sheet.js). It began as the living specimen of the kit:
// every part of kit.css in every state, working, on both grounds (the ground,
// where experiments stand, and white, where case studies stand), beside the
// live instruments so the kit can be judged next to the thing that set its bar:
// digital but alive. It now holds the rest around it: the display, the type,
// how code looks, the surfaces the parts are made into, how things move,
// the gags we sneak in, the assets' gate, what is missing and what is
// surplus, and the voice. The address stays: it is the owner's door.
//
// Owner-only and unlisted like every desk page: the passkey session, no nav
// link from the public site, no sitemap row, noindex. It holds no data and
// syncs nothing; what it renders is the kit.

import { requireAuth } from '../middleware/auth.js'
import { renderPage } from '../lib/render.js'
import { PARTS } from '../lib/kit-parts.js'
import { plates } from '../lib/sheet.js'
import { pixelText } from 'multiplayer-canvas/pixel-type'

import config from '../config.js'
const SITE_URL = config.site.url
const SITE_NAME = config.site.name

// seam: test/kit.test.js
export const GROUNDS = [
  { id: 'grey', name: 'grey', note: 'the standalone pages stand here' },
  { id: 'white', name: 'white', note: 'case studies stand here' },
]

export async function registerKitRoutes(fastify) {
  fastify.get('/admin/kit', { preHandler: requireAuth }, async (request, reply) => {
    return renderPage(fastify, request, reply, 'kit/index.njk', {
      desk: 'kit',
      grounds: GROUNDS,
      // every part and every state it has, for the states board
      parts: PARTS.map((p) => ({ name: p.name, states: p.states, w: p.w * 2, h: p.h * 2 })),
      // the plates around the kit, and the same by id for the template
      plates: plates(),
      sheet: Object.fromEntries(plates().map((pl) => [pl.id, pl])),
      // the title is the site's pixel face; everything else on the page is
      // the type face at 16, 32 or 64
      title: pixelText('the sheet', 'display').svg,
      meta: {
        title: `sheet · ${SITE_NAME}`,
        description: 'Every piece the site is made of: parts, type, code, motion and gags.',
        canonical: `${SITE_URL}/admin/kit`,
        robots: 'noindex, nofollow',
      },
    })
  })
}
