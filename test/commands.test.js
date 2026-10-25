// test/commands.test.js
// BIBLE.md section 6: the bar is a command line. canvas/commands.js, held:
// the grammar (words, quotes, the three shapes of a flag, a flag's value
// only where the command says it takes one, the errors said instead of
// guessed), the completion the roster shows, who is shown and who may run
// what (/login is never listed and always runs; the owner's commands are
// neither shown nor run for a guest), the addresses the commands go to,
// the client's copy of the desk against the server's registry, and the
// owner hint's name and meaning against the server's.
// The browser half (a guest's roster, the owner's border, the navigations)
// is proved by hand against a development server; see the PR.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  COMMANDS,
  DESK,
  OWNER_HINT,
  ROOM_CODE,
  ROOM_PIN,
  commandsFor,
  complete,
  deskTool,
  hasOwnerHint,
  hintClears,
  leaveSearch,
  matchPage,
  randomPage,
  shareUrl,
  ownerFrom,
  parseCommand,
  roomSearch,
} from '../src/static/canvas/commands.js'
import { DESK_TOOLS } from '../src/lib/desk.js'
import { ROOM_CODE_RE } from '../primitives/rooms/finder-url.js'
import { OWNER_HINT as SERVER_HINT } from '../src/middleware/auth.js'

const names = (list) => list.map((c) => c.name)
const guest = commandsFor(false)
const owner = commandsFor(true)
const run = (line, set = owner.runnable) => {
  const p = parseCommand(line, set)
  return p && { name: p.name, args: p.args, flags: p.flags, error: p.error }
}

describe('the grammar', () => {
  it('a line that does not start with a slash is not a command', () => {
    for (const line of ['', 'slime', ' /home', 'home/', null, undefined])
      assert.equal(parseCommand(line), null, `${line} read as a command`)
  })

  it('words, any case for the name, and quotes that hold words together', () => {
    assert.deepEqual(run('/HOME'), { name: 'home', args: [], flags: {}, error: null })
    assert.deepEqual(run('/open  case   studies '), {
      name: 'open',
      args: ['case', 'studies'],
      flags: {},
      error: null,
    })
    assert.deepEqual(run('/open "case studies"').args, ['case studies'])
    assert.deepEqual(run('/open \'a "quoted" page\'').args, ['a "quoted" page'])
    // a quote in the middle of a word joins onto it, as a shell's does
    assert.deepEqual(run('/open ab"c d"e').args, ['abc de'])
    assert.equal(run('/open "never closed').error, 'a quote is left open')
  })

  // mutation: commands.flag-value-greedy, commands.flag-equals-ignored
  it('--flag value, --flag=value and a bare --flag, the value only where the command takes one', () => {
    assert.deepEqual(run('/join abcd --pin 1234').flags, { pin: '1234' })
    assert.deepEqual(run('/join --pin=1234 abcd'), {
      name: 'join',
      args: ['abcd'],
      flags: { pin: '1234' },
      error: null,
    })
    // --pin takes a value, so the word after it is the pin, not the code
    assert.deepEqual(run('/join --pin 1234 abcd').args, ['abcd'])
    // --open takes none, so the word after it is the id
    assert.deepEqual(run('/follow --open demo'), {
      name: 'follow',
      args: ['demo'],
      flags: { open: true },
      error: null,
    })
    assert.deepEqual(run('/session demo --end').flags, { end: true })
    // flag names read in any case; a quoted word is never a flag
    assert.deepEqual(run('/FOLLOW --OPEN --Pin "1234"').flags, {
      open: true,
      pin: '1234',
    })
    // and `--` ends the flags
    assert.deepEqual(run('/open -- --weird').args, ['--weird'])
  })

  // mutation: commands.unknown-flag-accepted
  it('a flag the command does not have, a missing value, a word too many: one line, never a guess', () => {
    assert.equal(run('/join abcd --pn 1234').error, '/join has no --pn')
    assert.equal(run('/home --fast').error, '/home has no --fast')
    assert.equal(run('/join abcd --pin').error, '--pin wants a value')
    assert.equal(run('/join abcd --pin --x').error, '--pin wants a value')
    assert.equal(run('/follow --open=yes').error, '--open takes no value')
    assert.equal(run('/join').error, '/join wants <code>')
    assert.equal(run('/leave now').error, 'too many words for /leave')
    assert.equal(run('/nope').error, 'no such command')
    assert.equal(run('/').error, 'no such command')
  })
})

describe('who is shown what, and who may run it', () => {
  // mutation: commands.login-listed
  it('/login is never listed, to a guest or to the owner, and runs for anybody', () => {
    assert.ok(!names(guest.listed).includes('login'), 'a guest is shown /login')
    assert.ok(!names(owner.listed).includes('login'), 'the owner is shown /login')
    assert.ok(names(guest.runnable).includes('login'), 'a guest cannot run /login')
    assert.equal(run('/login', guest.runnable).error, null)
    // never completed, even typed in full
    assert.deepEqual(complete('/login', guest.listed).hits, [])
    assert.deepEqual(complete('/log', guest.listed).hits, [])
  })

  // mutation: commands.owner-listed-to-guest, commands.owner-runnable-by-guest
  it("the owner's commands are neither shown nor run until the owner is confirmed", () => {
    const own = COMMANDS.filter((c) => c.owner)
    assert.ok(own.length >= 5, 'the owner has commands')
    for (const c of own) assert.ok(!guest.listed.includes(c), `a guest is shown /${c.name}`)
    // to a guest an owner command is the same "no such command" a typo gets;
    // the two doors stay what they always were: typed in full, they go
    for (const c of own) {
      const p = parseCommand(`/${c.name}${c.args?.[0] ? ' x' : ''}`, guest.runnable)
      if (c.door) assert.equal(p.error, null, `the door /${c.name} is shut to a guest`)
      else assert.equal(p.error, 'no such command', `a guest can run /${c.name}`)
    }
    // anything short of a confirmed true is a guest
    for (const maybe of [undefined, null, 1, 'yes', {}])
      assert.deepEqual(commandsFor(maybe), guest, `${maybe} counted as the owner`)
    // and the owner is shown every listed command, theirs included
    assert.deepEqual(
      names(owner.listed),
      names(COMMANDS.filter((c) => c.listed !== false)),
      'the owner is missing a command'
    )
  })

  it('the public commands the bar had are still there, in their order', () => {
    assert.deepEqual(names(guest.listed).slice(0, 5), ['home', 'map', 'contact', 'poof', 'who'])
    for (const n of ['help', 'open', 'random', 'listen', 'share', 'join', 'leave'])
      assert.ok(names(guest.listed).includes(n), `a guest cannot see /${n}`)
  })
})

describe('the roster', () => {
  it('names while the name is typed: the ones that start so first', () => {
    assert.deepEqual(names(complete('/', guest.listed).hits), names(guest.listed))
    assert.deepEqual(names(complete('/h', guest.listed).hits), ['home', 'help', 'who', 'share'])
    assert.deepEqual(names(complete('/ho', owner.listed).hits), ['home', 'who'])
    // holding it next, then the fuzzy net
    assert.deepEqual(names(complete('/oo', guest.listed).hits), ['poof'])
    assert.deepEqual(names(complete('/cntc', guest.listed).hits), ['contact'])
    assert.equal(complete('/h', guest.listed).mode, 'names')
    assert.equal(complete('slime', guest.listed), null)
  })

  it('a whole name shows its usage line, with or without words after it', () => {
    for (const line of ['/join', '/join ', '/JOIN abc --p']) {
      const c = complete(line, guest.listed)
      assert.equal(c.mode, 'usage', line)
      assert.deepEqual(names(c.hits), ['join'], line)
    }
    assert.equal(complete('/join', guest.listed).hits[0].usage, '/join <code> [--pin 1234]')
    assert.deepEqual(complete('/nope x', guest.listed).hits, [])
  })
})

describe('where the commands go', () => {
  it('/open finds a page by its slug or its title', () => {
    const pages = [
      { slug: 'case-studies', title: 'Case Studies' },
      { slug: 'web-instruments', title: 'Web Instruments' },
      { slug: 'about', title: 'about' },
    ]
    assert.equal(matchPage('case studies', pages), 'case-studies')
    assert.equal(matchPage('Web', pages), 'web-instruments')
    assert.equal(matchPage('instruments', pages), 'web-instruments')
    assert.equal(matchPage('wi', pages), 'web-instruments')
    assert.equal(matchPage('about', pages), 'about')
    assert.equal(matchPage('zzz', pages), null)
    assert.equal(matchPage('  ', pages), null)
  })

  // mutation: commands.desk-drift, commands.desk-server-drift
  it("the bar's copy of the desk is the server's registry", () => {
    assert.deepEqual(
      DESK,
      DESK_TOOLS.map(({ id, label, title, href }) => ({ id, label, ...(title && { title }), href }))
    )
    assert.equal(deskTool('kit').href, '/admin/kit')
    assert.equal(deskTool('sessions').href, '/admin/sessions')
    assert.equal(deskTool('rooms').href, '/admin/sessions')
    assert.equal(deskTool('nope'), null)
  })

  it('a room is written into the address, every other param byte for byte', () => {
    assert.equal(roomSearch('', 'follow', { id: 'demo', pin: '1234' }), '?follow=demo&pin=1234')
    assert.equal(roomSearch('', 'follow'), '?follow')
    assert.equal(roomSearch('?safe&search=', 'session', { pin: 'off' }), '?safe&session&pin=off')
    assert.equal(roomSearch('?session=old&pin=9&x=1', 'follow', { id: 'new1' }), '?x=1&follow=new1')
    assert.equal(leaveSearch('?follow=demo&pin=1234&diag'), '?diag')
    assert.equal(leaveSearch('?session=abcd'), '')
    assert.ok(ROOM_CODE.test('abcd1234') && ROOM_CODE.test('jam-x') && !ROOM_CODE.test('ABCD'))
    // one grammar for a room's name, the rooms layer's own
    assert.equal(ROOM_CODE, ROOM_CODE_RE)
    assert.ok(ROOM_PIN.test('1234') && !ROOM_PIN.test('123456'))
  })
})

describe('/random and /share', () => {
  it('/random is any page but the one already open', () => {
    const pages = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }]
    for (const r of [0, 0.34, 0.5, 0.99, 0.999999])
      assert.notEqual(randomPage(pages, 'b', r), 'b', `landed on the open page at ${r}`)
    assert.deepEqual(
      [0, 0.5, 0.99].map((r) => randomPage(pages, null, r)),
      ['a', 'b', 'c'],
      'every page can come up'
    )
    assert.equal(randomPage([{ slug: 'a' }], 'a', 0.5), null)
  })

  // mutation: commands.share-leaks-pin
  it('/share carries the page, the room and the find, never the pin', () => {
    const o = 'https://example.com'
    assert.equal(shareUrl(o, '/', ''), 'https://example.com/')
    assert.equal(shareUrl(o, '/work/x', '?diag&safe'), 'https://example.com/work/x')
    assert.equal(
      shareUrl(o, '/', '?follow=demo&pin=1234&search=top%20slime'),
      'https://example.com/?follow=demo&search=top%20slime'
    )
    assert.equal(shareUrl(o, '/', '?session=abcd&pin=off'), 'https://example.com/?session=abcd')
    assert.equal(shareUrl(o, '/', '?follow'), 'https://example.com/?follow')
    // an empty find is no find
    assert.equal(shareUrl(o, '/', '?search='), 'https://example.com/')
  })
})

describe('the owner hint', () => {
  // mutation: commands.hint-name-drift
  it("carries the server's name, and only the exact hint counts", () => {
    assert.equal(OWNER_HINT, SERVER_HINT)
    assert.ok(hasOwnerHint('canvas_owner=1'))
    assert.ok(hasOwnerHint('a=b; canvas_owner=1; c=d'))
    for (const jar of ['', 'canvas_owner=0', 'xcanvas_owner=1', 'canvas_owner=10', 'canvas_key=1'])
      assert.ok(!hasOwnerHint(jar), `${jar} read as the hint`)
  })

  it("whoami's answer: the owner's own session, a definite no, or nothing to go on", () => {
    assert.equal(ownerFrom(200, { actor: { kind: 'session', id: 'x' } }), true)
    assert.equal(ownerFrom(200, { actor: { kind: 'credential', id: 'k' } }), false)
    assert.equal(ownerFrom(200, null), false)
    assert.equal(ownerFrom(401, { error: 'unauthorized' }), false)
    assert.equal(ownerFrom(403, null), false)
    assert.equal(ownerFrom(500, null), null)
    assert.equal(ownerFrom(429, null), null)
  })

  it('a page wipes the hint in every shape the server may have set it', () => {
    assert.deepEqual(hintClears(), ['canvas_owner=; Path=/; Max-Age=0; SameSite=Lax'])
  })
})
