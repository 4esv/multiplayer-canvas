// test/canvas-data.test.js
// The canvas data feed: live upstreams mapped into the exact shapes app.js
// consumes, degrading per key to the checked-in snapshot. Loaders are
// injected so nothing here touches the network; each block imports the
// module with a query string for fresh cache state.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const FALLBACK = JSON.parse(
  await readFile(new URL('../src/data/canvas-fallback.json', import.meta.url), 'utf8')
)

const CONFIG = { weather: { lat: 0, lon: 0, place: 'nowhere' } }

const fail = async () => {
  throw new Error('upstream down')
}
const allFail = { weather: fail }

describe('snapshot fallback', () => {
  it('every upstream down returns the checked-in snapshot verbatim', async () => {
    const { getCanvasData } = await import('../src/services/canvas-data.js?all-fail')
    const data = await getCanvasData(CONFIG, allFail)
    assert.deepEqual(data, FALLBACK)
  })

  it('a live key is mapped into the tile shape, its place from the config', async () => {
    const { getCanvasData } = await import('../src/services/canvas-data.js?per-key')
    const data = await getCanvasData(CONFIG, {
      ...allFail,
      weather: async () => ({
        tempF: 41,
        condition: 'drizzle',
        isDay: false,
        highF: 44,
        lowF: 33,
        sunrise: 1790160870,
        sunset: 1790204486,
      }),
    })
    assert.deepEqual(data.weather, {
      tempF: 41,
      cond: 'drizzle',
      place: 'nowhere',
      day: false,
      hi: 44,
      lo: 33,
      rise: 1790160870,
      set: 1790204486,
    })
  })
})

// The diff behind the live push (routes/api.js). It decides whether a refresh
// says anything at all to the open sockets, so a false positive is a broadcast
// storm and a false negative is a canvas that quietly goes stale.
describe('changedKeys: what the server tells the room about', () => {
  it('names only the key that actually moved', async () => {
    const { changedKeys } = await import('../src/services/canvas-data.js?diff')
    const after = { ...FALLBACK, weather: { ...FALLBACK.weather, tempF: 41 } }
    assert.deepEqual(changedKeys(FALLBACK, after), ['weather'])
  })

  // mutation: canvas-data.diff-by-identity
  it('stays silent when the refresh found the same data', async () => {
    const { changedKeys } = await import('../src/services/canvas-data.js?diff-quiet')
    assert.deepEqual(changedKeys(FALLBACK, { ...FALLBACK }), [])
    // a fresh object with the same contents is the same data: the diff reads
    // values, not identity, so five minutes of nothing broadcasts nothing
    assert.deepEqual(changedKeys(FALLBACK, JSON.parse(JSON.stringify(FALLBACK))), [])
  })

  it('holds its tongue when either side is missing', async () => {
    const { changedKeys } = await import('../src/services/canvas-data.js?diff-null')
    assert.deepEqual(changedKeys(null, FALLBACK), [])
    assert.deepEqual(changedKeys(FALLBACK, null), [])
  })

  it('ignores keys outside the live set: no tile reads them, so no tile moved', async () => {
    const { changedKeys } = await import('../src/services/canvas-data.js?diff-meta')
    assert.deepEqual(changedKeys(FALLBACK, { ...FALLBACK, meta: { fetchedAt: 'now' } }), [])
  })
})
