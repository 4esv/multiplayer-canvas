// Arm, then act (primitives/kit/kit-arm.js): the one confirm a destructive button on this
// origin gets. The first press arms it (brick, "sure?"), the second acts, and
// an armed button nobody presses again disarms on its own. Before the snap
// the desk's pages carried five copies of this, and one of
// them (the textmode presets) never disarmed at all, so the same button went
// back on one page and sat armed forever on the next.
import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { arm, armed, disarm } from '../primitives/kit/kit-arm.js'

const ROOT = join(import.meta.dirname, '..')

// a button as far as the helper reaches into one
function button(label = 'delete') {
  const classes = new Set()
  const on = {}
  return {
    textContent: label,
    disabled: false,
    dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => (on[type] = fn),
    press: () => on.click(),
  }
}

describe('arm, then act', () => {
  // mutation: kit-arm.acts-on-first-press, kit-arm.never-disarms
  it('the first press arms, the second acts, and an armed button disarms on its own', () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      const b = button()
      assert.equal(arm(b), false, 'the first press acted')
      assert.ok(b.classList.contains('is-hot'), 'armed is the brick face')
      assert.equal(b.textContent, 'sure?')
      assert.equal(arm(b), true, 'the second press did not act')
      assert.ok(b.classList.contains('is-hot'), 'it stays armed while it acts')
      // the second press took the wait away: nothing disarms an act under way
      mock.timers.tick(10000)
      assert.ok(b.classList.contains('is-hot'))
      disarm(b)
      assert.equal(b.textContent, 'delete', 'disarmed, it says what it does again')

      const idle = button()
      arm(idle)
      mock.timers.tick(3999)
      assert.ok(idle.classList.contains('is-hot'), 'disarmed before its four seconds')
      mock.timers.tick(1)
      assert.ok(!idle.classList.contains('is-hot'), 'an armed button nobody pressed stayed armed')
      assert.equal(idle.textContent, 'delete')
      assert.equal(arm(idle), false, 'a disarmed button acts on the next press')
    } finally {
      mock.timers.reset()
    }
  })

  it('a wired button is disabled while it acts, and a refusal puts it back', async () => {
    const b = button('end')
    let acts = 0
    const failed = []
    armed(
      b,
      async () => {
        acts++
        assert.equal(b.disabled, true, 'it can be pressed again while it acts')
        throw new Error('refused')
      },
      (err) => failed.push(err.message)
    )
    await b.press()
    assert.equal(acts, 0, 'acted on the first press')
    await b.press()
    assert.equal(acts, 1)
    assert.deepEqual(failed, ['refused'], 'the refusal was not handed back')
    assert.equal(b.disabled, false)
    assert.ok(!b.classList.contains('is-hot'), 'a refused button stayed armed')
    assert.equal(b.textContent, 'end')
  })

  // mutation: kit-arm.second-arm
  it('no page arms a button its own way', () => {
    // Every script that arms a button does it through kit-arm.js (the
    // engine's, primitives/kit, which is read as well as the site). Two are
    // named here, each for its reason: the /admin/kit specimen's reset is the
    // kit part itself, armed until it loses focus, and the icon tool is a
    // classic script (its page loads it without type="module"), so it cannot
    // import until that changes.
    const OWN = new Set(['kit-arm.js', 'kit.js', 'icon.js'])
    const hits = []
    for (const dir of ['src/static/js', 'src/static/canvas', 'primitives']) {
      const walk = dir === 'primitives' ? { recursive: true } : {}
      for (const f of readdirSync(join(ROOT, dir), walk).filter((n) => n.endsWith('.js'))) {
        if (dir !== 'src/static/canvas' && OWN.has(basename(f))) continue
        readFileSync(join(ROOT, dir, f), 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/classList\.(add|toggle)\(\s*['"]is-hot['"]/.test(line))
              hits.push(`${dir}/${f}:${i + 1}: ${line.trim()}`)
          })
      }
    }
    assert.deepEqual(hits, [], `arms a button of its own:\n  ${hits.join('\n  ')}`)
  })
})
