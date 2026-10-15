import { useState } from 'react'
import type { TraceStep } from '../data/types'
import { clean, isInterval, sessionSteps, valueText } from '../data/run'

function args(s: TraceStep): string {
  switch (s.tool) {
    case 'search':
      return `"${s.query ?? ''}"${s.report ? `, report ${s.report}` : ''}`
    case 'open_page':
      return `${s.report}, page ${s.page}`
    case 'propose_claim': {
      const v = s.value ?? null
      const shown = isInterval(v) ? valueText({ value: v, unit: null, censored: false }) : clean(String(v ?? ''))
      const short = shown.length > 90 ? `${shown.slice(0, 88)}…` : shown
      return `${s.field}, "${short}", ${s.report} p${s.page}`
    }
    case 'refuse':
      return `"${clean(s.about ?? '')}"`
  }
}

function result(s: TraceStep): string {
  if (s.tool === 'propose_claim') {
    if (s.result === 'accepted') {
      return s.check === 'code' ? 'Accepted. Code found the quote on the page.' : `Accepted. ${s.check === 'page image pending' ? 'Scanned page, so the page image check comes after the run.' : s.check ?? ''}`
    }
    return s.result.charAt(0).toUpperCase() + s.result.slice(1)
  }
  if (s.tool === 'refuse') return `Not in these sources. ${clean(s.reason ?? '')}`
  return s.result.charAt(0).toUpperCase() + s.result.slice(1)
}

export function TraceList({ steps, highlight }: { steps: TraceStep[]; highlight?: Set<number> }) {
  return (
    <ol className="trace">
      {steps.map((s) => (
        <li
          key={s.i}
          className={`trace-step${highlight?.has(s.i) ? ' is-mine' : ''}${s.tool === 'propose_claim' && s.result !== 'accepted' ? ' is-rejected' : ''}`}
        >
          <span className="trace-n">{s.i + 1}</span>
          <div>
            <code className="trace-call">
              <span className="trace-tool">{s.tool}</span>({args(s)})
            </code>
            <p className="trace-result">{result(s)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** The calls behind one claim, with the rest of its session one click away. */
export function ClaimTrace({ session, steps }: { session: string; steps: TraceStep[] }) {
  const [all, setAll] = useState(false)
  const full = sessionSteps(session)
  const mine = new Set(steps.map((s) => s.i))
  return (
    <div className="trace-wrap">
      <p className="small muted">
        Session <code>{session}</code>. These are the calls that led to this claim.
      </p>
      <TraceList steps={all ? full : steps} highlight={all ? mine : undefined} />
      <button type="button" className="text-button" onClick={() => setAll((v) => !v)} aria-expanded={all}>
        {all ? "Show only this claim's calls" : `Show all ${full.length} calls in this session`}
      </button>
    </div>
  )
}
