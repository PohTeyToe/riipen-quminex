// The moments the replay feed shows as they happen: every claim the checker threw out, with the claim the agent
// sent in its place, and every refusal. Joined from data/timeline.json, data/rejected.json and data/claims.json.
import { claim, rejected } from './run'
import { sessions, type Session } from './timeline'
import type { Rejected } from './types'

export interface FeedEvent {
  t: number
  code: 'x' | 'r'
  session: Session
  /** the call's index in its session */
  i: number
  /** a thrown-out claim's record in rejected.json */
  out?: Rejected
  /** the kept claim that replaced it, and when the agent sent it */
  fix?: { claim: string; t: number; i: number }
}

const outByCall = new Map(rejected.map((r) => [`${r.session}#${r.call_index}`, r]))

function fixOf(out: Rejected, s: Session): FeedEvent['fix'] {
  const c = out.fixed_by ? claim(out.fixed_by) : undefined
  if (!c || c.trace.session !== s.id) return undefined
  const i = c.trace.steps[c.trace.steps.length - 1]
  const call = s.calls[i]
  return call ? { claim: c.id, t: call[0], i } : undefined
}

export const feedEvents: FeedEvent[] = sessions
  .flatMap((s) =>
    s.calls.flatMap(([t, c], i): FeedEvent[] => {
      if (c === 'r') return [{ t, code: 'r', session: s, i }]
      if (c !== 'x') return []
      const out = outByCall.get(`${s.id}#${i}`)
      return [{ t, code: 'x', session: s, i, out, fix: out ? fixOf(out, s) : undefined }]
    }),
  )
  .sort((a, b) => a.t - b.t)

/** How many feed events had happened by time t. */
export function feedCountAt(t: number): number {
  let n = 0
  while (n < feedEvents.length && feedEvents[n].t <= t) n++
  return n
}
