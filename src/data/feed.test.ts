import { describe, expect, test } from 'vitest'
import { feedCountAt, feedEvents } from './feed'
import { rejected } from './run'
import { WALL, clockTenths, latestCall, spentAt, timeline } from './timeline'

describe('the replay feed', () => {
  test('holds every thrown-out claim and every refusal, in time order', () => {
    const out = feedEvents.filter((e) => e.code === 'x')
    expect(out).toHaveLength(timeline.totals.rejected)
    expect(out).toHaveLength(rejected.length)
    expect(feedEvents.filter((e) => e.code === 'r')).toHaveLength(timeline.totals.refuse)
    for (let k = 1; k < feedEvents.length; k++) expect(feedEvents[k].t).toBeGreaterThanOrEqual(feedEvents[k - 1].t)
    // each thrown-out call found its own record
    for (const e of out) expect(e.out?.call_index).toBe(e.i)
  })

  test('a fix is the kept claim rejected.json names, sent later in the same session', () => {
    const fixed = feedEvents.filter((e) => e.fix)
    expect(fixed).toHaveLength(rejected.filter((r) => r.retry === 'fixed on retry').length)
    for (const e of fixed) {
      expect(e.fix!.claim).toBe(e.out!.fixed_by)
      expect(e.fix!.t).toBeGreaterThan(e.t)
      expect(e.session.calls[e.fix!.i][1]).toBe('p')
    }
  })

  test('counts by time', () => {
    expect(feedCountAt(-1)).toBe(0)
    expect(feedCountAt(WALL)).toBe(feedEvents.length)
  })
})

describe('the clock and the meters a replay moves', () => {
  test('call times round before they split into minutes', () => {
    expect(clockTenths(59.95)).toBe('1:00.0')
    expect(clockTenths(9.26)).toBe('0:09.3')
    expect(clockTenths(0)).toBe('0:00.0')
    expect(clockTenths(451.84)).toBe('7:31.8')
  })

  test('the latest call is the last one logged at or before the playhead', () => {
    expect(latestCall(-1)).toBeNull()
    const end = latestCall(WALL)!
    expect(end.session.calls[end.i][0]).toBe(end.t)
    const mid = latestCall(120)!
    expect(mid.t).toBeLessThanOrEqual(120)
  })

  test('cost counts a session once it has finished, and adds up to the run total', () => {
    expect(spentAt(0).usd).toBe(0)
    expect(spentAt(WALL).usd).toBeCloseTo(timeline.cost_usd, 1)
    expect(spentAt(WALL).tokens).toBe(timeline.output_tokens)
    expect(spentAt(120).usd).toBeLessThan(spentAt(300).usd)
  })
})
