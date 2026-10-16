// The recorded run in time: data/timeline.json, built by agent/build_timeline.py from the corpus server's own call
// log and each session's result message. Small, so the first screen loads it with everything else.
import timelineJson from '../../data/timeline.json'

/** s search, o open a page, p claim the checker accepted, x claim it threw out, r refuse; c and f read the file. */
export type Code = 's' | 'o' | 'p' | 'x' | 'r' | 'c' | 'f'

export interface Session {
  id: string
  kind: 'field' | 'eval'
  /** The field id or eval question id the session worked on. */
  ref: string
  start: number
  end: number
  turns: number
  result: string
  lane: number
  cost_usd: number
  output_tokens: number
  /** [seconds since the run started, what the call was]; index i is step i of the session in traces.json */
  calls: [number, Code][]
}

export interface Timeline {
  run: string
  started: string
  workers: number
  wall_seconds: number
  session_seconds: number
  cost_usd: number
  output_tokens: number
  input_tokens: number
  totals: { sessions: number; calls: number; search: number; open_page: number; accepted: number; rejected: number; refuse: number }
  sessions: Session[]
  summary: { id: string; started: string; seconds: number; cost_usd: number; output_tokens: number; calls: [number, Code][] }
}

export const timeline = timelineJson as unknown as Timeline
export const sessions = timeline.sessions
export const WALL = Math.max(...sessions.map((s) => s.end))

const byId = new Map(sessions.map((s) => [s.id, s]))
const byRef = new Map(sessions.map((s) => [`${s.kind}:${s.ref}`, s]))

export function sessionById(id: string): Session | undefined {
  return byId.get(id)
}

export function fieldSession(fieldId: string): Session | undefined {
  return byRef.get(`field:${fieldId}`)
}

export function evalSession(questionId: string): Session | undefined {
  return byRef.get(`eval:${questionId}`)
}

export type Filter = 'read' | 'p' | 'x' | 'r'

export function matches(code: Code, f: Filter | null): boolean {
  if (!f) return true
  if (f === 'read') return code === 's' || code === 'o'
  return code === f
}

export interface Counts {
  calls: number
  read: number
  search: number
  open: number
  accepted: number
  rejected: number
  refused: number
  running: number
  done: number
}

// Every call in time order with running totals, so the counts at any moment of a replay are one binary search.
const flat = sessions.flatMap((s) => s.calls.map(([t, c]) => ({ t, c }))).sort((a, b) => a.t - b.t)
type Tally = Omit<Counts, 'running' | 'done'>
const ZERO: Tally = { calls: 0, read: 0, search: 0, open: 0, accepted: 0, rejected: 0, refused: 0 }
const prefix: Tally[] = []
{
  const run = { ...ZERO }
  for (const { c } of flat) {
    run.calls++
    if (c === 's') run.search++
    if (c === 'o') run.open++
    if (c === 's' || c === 'o') run.read++
    else if (c === 'p') run.accepted++
    else if (c === 'x') run.rejected++
    else if (c === 'r') run.refused++
    prefix.push({ ...run })
  }
}

/** How many calls were logged at or before t (seconds), by kind, and how many sessions were running or done. */
export function countsAt(t: number): Counts {
  let lo = 0
  let hi = flat.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (flat[mid].t <= t) lo = mid + 1
    else hi = mid
  }
  const base = lo ? prefix[lo - 1] : ZERO
  let running = 0
  let done = 0
  for (const s of sessions) {
    if (s.end <= t) done++
    else if (s.start <= t) running++
  }
  return { ...base, running, done }
}

/** Calls a session had made by time t. */
export function callsBy(s: Session, t: number): number {
  let n = 0
  for (const [ct] of s.calls) if (ct <= t) n++
  return n
}

export type Phase = 'queued' | 'running' | 'done'

export function phaseAt(s: Session, t: number): Phase {
  return t < s.start ? 'queued' : t < s.end ? 'running' : 'done'
}

/** 85.4 to "1:25". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "0:09.3": a call's time to a tenth, for the call lists. */
export function clockTenths(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

