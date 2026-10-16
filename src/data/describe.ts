// One tool call in plain words, from the summarized trace (data/traces.json) and its time (data/timeline.json).
import { clean, isInterval, sessionSteps, valueText } from './run'
import { sessionById, type Code } from './timeline'
import type { TraceStep } from './types'

export interface CallLine {
  code: Code
  t: number
  tool: string
  /** "kept", "thrown out", "refused" */
  verdict?: string
  text: string
  step: TraceStep
}

export function shorten(s: string, n = 110): string {
  const c = clean(s)
  return c.length > n ? `${c.slice(0, n - 1).trimEnd()}…` : c
}

export function stepValue(st: TraceStep): string {
  if (st.value == null) return ''
  if (isInterval(st.value)) return valueText({ value: st.value, unit: null, censored: false })
  return clean(String(st.value))
}

export function callLine(sessionId: string, i: number): CallLine | null {
  const s = sessionById(sessionId)
  const st = sessionSteps(sessionId)[i]
  if (!s || !st) return null
  const [t, code] = s.calls[i]
  const where = st.report ? `${st.report}${st.page ? ` p${st.page}` : ''}` : ''
  if (st.tool === 'search') {
    const hits = /^(\d+) hits?/.exec(st.result)?.[1]
    return { code, t, tool: 'search', text: `"${shorten(st.query ?? '', 70)}"${st.report ? ` in ${st.report}` : ''} · ${hits ?? 0} hits`, step: st }
  }
  if (st.tool === 'open_page') return { code, t, tool: 'open_page', text: where, step: st }
  // a refusal's reason is the point of the call, so it stays whole
  if (st.tool === 'refuse') return { code, t, tool: 'refuse', verdict: 'Not in these sources', text: clean(st.reason ?? ''), step: st }
  const kept = st.result === 'accepted'
  return {
    code,
    t,
    tool: 'propose_claim',
    verdict: kept ? 'kept' : 'thrown out',
    text: kept ? `${shorten(stepValue(st), 80)} · ${where}` : shorten(st.result.replace(/^rejected:\s*/, ''), 120),
    step: st,
  }
}
