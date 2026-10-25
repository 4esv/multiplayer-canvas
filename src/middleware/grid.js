// Decorates request with the output mode the page templates branch on.
//
//   grid.isTerminal  curl, wget, lynx, etc.     -> text/plain
//   grid.isRetro     ancient graphical browsers -> minimal HTML 3.2
//   (neither)        every modern browser        -> the full two-ink canvas
//
// A `?view=` query forces a mode (text | retro | full) so the variants stay
// previewable from any client. Kept as middleware for backwards compat with
// route handlers that read `request.grid`.
const TERMINAL_CLIENTS = /^(curl|wget|httpie|lynx|links|w3m)/i

// Graphical browsers too old for the modern stylesheet. The whole point is
// the oldweb.today roster: emulators where a friend can actually open the
// site in a period browser. Groups, each chosen to never match a current UA:
//   - Mozilla/1-4: Netscape 1-4 AND Windows-XP-era IE6/7/8, which still
//     announce `Mozilla/4.0 (compatible; MSIE ...)`.
//   - MSIE / Trident: the rest of Internet Explorer. IE9/10 carry `MSIE`,
//     IE11 dropped it for `Trident/`. Every IE is here on purpose: the
//     modern site is built on CSS custom properties, which no IE supports,
//     so even IE11 gets a broken site otherwise.
//   - Netscape/: Netscape 6/7 (Mozilla/5.0 + a Netscape token). No modern
//     browser says Netscape.
//   - Gecko/200x: the old Mozilla Suite, SeaMonkey, Camino, Firefox 1-3.5.
//     Modern Firefox froze its build token at Gecko/20100101, so the 200x
//     date is exclusively pre-2010 engines.
//   - Opera/ at the start: Presto-era Opera (<=12, EOL 2013). Modern Opera
//     is Mozilla/5.0 + OPR/, so it does not start with Opera/.
//   - the named relics (Mosaic, Amaya, ...): the aspirational flex.
// Bare Mozilla/5.0 -- every current engine, Googlebot, the social-card
// scrapers -- is excluded, so they always get the full site.
const RETRO_CLIENTS =
  /^Mozilla\/[1-4]\.|MSIE \d|Trident\/|Netscape\/|Gecko\/200[0-9]|^Opera\/|Mosaic|^Amaya|^Arena|^Cello|^IBrowse|^AWeb|^SkipStone/i

function isTerminalClient(userAgent) {
  if (!userAgent) return false
  return TERMINAL_CLIENTS.test(userAgent)
}

function isRetroClient(userAgent) {
  if (!userAgent) return false
  return RETRO_CLIENTS.test(userAgent)
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export function registerGridMiddleware(fastify) {
  fastify.decorateRequest('grid', null)

  fastify.addHook('preHandler', async (request) => {
    const ua = request.headers['user-agent']
    let isTerminal = isTerminalClient(ua)
    let isRetro = !isTerminal && isRetroClient(ua)

    // Explicit override wins, for demos and tests.
    switch (request.query?.view) {
      case 'text':
        isTerminal = true
        isRetro = false
        break
      case 'retro':
        isTerminal = false
        isRetro = true
        break
      case 'full':
        isTerminal = false
        isRetro = false
        break
    }

    request.grid = { isTerminal, isRetro }
  })
}
