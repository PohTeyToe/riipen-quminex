import { describe, expect, test } from 'vitest'
import runJson from '../../data/run.json'
import tracesJson from '../../data/traces.json'
import summaryJson from '../../data/summary.json'
import { WALL, clock, countsAt, fieldSession, sessions, timeline } from './timeline'

const run = runJson as unknown as { claims_accepted: number; claims_rejected: number; sessions: { fields: number; eval: number }; session_results: Record<string, { tool_calls: number; seconds: number }> }
const traces = (tracesJson as unknown as { sessions: Record<string, { tool: string; result: string }[]> }).sessions

describe('the recorded run', () => {
  test('its totals are the run record’s totals', () => {
    expect(timeline.totals.accepted).toBe(run.claims_accepted)
    expect(timeline.totals.rejected).toBe(run.claims_rejected)
    expect(sessions.filter((s) => s.kind === 'field')).toHaveLength(run.sessions.fields)
    expect(sessions.filter((s) => s.kind === 'eval')).toHaveLength(run.sessions.eval)
  })

  test('every session has the calls and length the run record gives it', () => {
    for (const s of sessions) {
      const r = run.session_results[s.id]
      expect(s.calls).toHaveLength(r.tool_calls)
      expect(s.end - s.start).toBeCloseTo(r.seconds, 1)
    }
  })

  test('call i of a session is step i of its trace', () => {
    const word = { s: 'search', o: 'open_page', p: 'propose_claim', x: 'propose_claim', r: 'refuse' } as Record<string, string>
    for (const s of sessions) {
      const steps = traces[s.id]
      expect(steps).toHaveLength(s.calls.length)
      s.calls.forEach(([, c], i) => {
        expect(steps[i].tool).toBe(word[c])
        if (c === 'p') expect(steps[i].result).toBe('accepted')
        if (c === 'x') expect(steps[i].result.startsWith('rejected')).toBe(true)
      })
    }
  })

  test('no pool ran more than four sessions at once, and every call sits inside its session', () => {
    for (const kind of ['field', 'eval'] as const) {
      const pool = sessions.filter((s) => s.kind === kind)
      expect(Math.max(...pool.map((s) => s.lane))).toBeLessThan(timeline.workers)
      for (const s of pool) for (const [t] of s.calls) expect(t >= s.start - 0.01 && t <= s.end + 0.01).toBe(true)
    }
  })

  test('counts at the start, the middle and the end', () => {
    expect(countsAt(-1).calls).toBe(0)
    const end = countsAt(WALL)
    expect(end.calls).toBe(timeline.totals.calls)
    expect(end.accepted + end.rejected).toBe(run.claims_accepted + run.claims_rejected)
    expect(end.done).toBe(sessions.length)
    const mid = countsAt(60)
    expect(mid.calls).toBeGreaterThan(0)
    expect(mid.calls).toBeLessThan(end.calls)
    expect(mid.running).toBeGreaterThan(0)
    expect(mid.running).toBeLessThanOrEqual(timeline.workers * 2)
  })

  test('the summary session is the one data/summary.json came from', () => {
    const s = summaryJson as unknown as { summary: string; seconds: number; trace: unknown[] }
    expect(timeline.summary.id).toBe(s.summary)
    expect(timeline.summary.seconds).toBe(s.seconds)
    expect(timeline.summary.calls).toHaveLength(s.trace.length)
  })

  test('helpers', () => {
    expect(clock(85.4)).toBe('1:25')
    expect(clock(451.8)).toBe('7:32')
    expect(fieldSession('location')?.id).toBe('field-location')
  })
})
