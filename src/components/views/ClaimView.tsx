import type { ReactNode } from 'react'
import { fields, report } from '../../data/core'
import { checkWords, claim, clean, excerpt, isInterval, rejected, valueText } from '../../data/run'
import { callLine } from '../../data/describe'
import { clockTenths } from '../../data/timeline'
import type { Claim } from '../../data/types'
import { useInspect, usePickCall } from '../../inspect'
import { PageMap } from '../PageMap'
import { ArisLink, CheckIcon, CrossIcon, PageChip, Who } from '../bits'

/** The pieces of a claim's value to mark inside its quote: the whole value, or an interval's hole and numbers. */
function pieces(c: Claim): string[] {
  const v = c.value
  if (v == null) return []
  if (isInterval(v)) return [v.hole, v.from_m, v.to_m, v.width_m, ...Object.values(v.grades ?? {})].filter((x): x is string => Boolean(x))
  const t = clean(String(v))
  return t.length <= 80 ? [t] : []
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Text with the value's pieces in bold, each at its first place, matched loosely on spaces and case. */
export function markPieces(text: string, ps: string[]): ReactNode[] {
  const spans: [number, number][] = []
  for (const p of ps) {
    const re = new RegExp(p.split(/\s+/).map(esc).join('\\s*'), 'i')
    let from = 0
    // the next place this piece occurs that doesn't overlap one already marked
    for (;;) {
      const m = re.exec(text.slice(from))
      if (!m) break
      const a = from + m.index
      const b = a + m[0].length
      if (!spans.some(([x, y]) => a < y && b > x)) {
        spans.push([a, b])
        break
      }
      from = b
    }
  }
  spans.sort((x, y) => x[0] - y[0])
  const out: ReactNode[] = []
  let at = 0
  spans.forEach(([a, b], i) => {
    out.push(text.slice(at, a), <b key={i}>{text.slice(a, b)}</b>)
    at = b
  })
  out.push(text.slice(at))
  return out
}

function Quote({ c }: { c: Claim }) {
  const e = excerpt(c.id)
  if (!e) return null
  const [a, b] = e.highlight
  return (
    <blockquote className="quote-block">
      {e.text.slice(0, a)}
      <mark>{markPieces(e.text.slice(a, b), pieces(c))}</mark>
      {e.text.slice(b)}
    </blockquote>
  )
}

export function ClaimView({ id }: { id: string }) {
  const c = claim(id)
  const { open } = useInspect()
  const pickCall = usePickCall()
  if (!c) return <p className="hint">This claim isn't in the run.</p>
  const r = report(c.source.aris)
  const field = fields.find((f) => f.id === c.field || f.parts?.some((p) => p.id === c.field))
  const words = checkWords(c)
  const value = valueText(c)
  const tries = rejected.filter((x) => x.fixed_by === c.id)
  const steps = c.trace.steps
  return (
    <div className="view">
      <p className="eyebrow">
        {c.scope === 'eval' ? `Eval answer, ${c.session.replace('eval-', '').toUpperCase()}` : field?.name ?? c.field}
        <span className="eyebrow-sep">·</span>
        {c.kind}
      </p>
      <h3 className={`view-title${value.length > 60 ? ' is-long' : ' mono'}`}>{value || 'Quote'}</h3>

      <div className="src">
        <PageMap claimId={c.id} aris={c.source.aris} page={c.source.page} />
        <div className="src-meta">
          <p className="src-title">{r ? `${r.operator.split(' (')[0]}, ${r.report_year}` : `ARIS ${c.source.aris}`}</p>
          <p className="src-sub">
            <PageChip aris={c.source.aris} page={c.source.page} />
            <ArisLink aris={c.source.aris} page={c.source.page}>
              Open the page
            </ArisLink>
          </p>
          <Quote c={c} />
          {c.quote_cut && <p className="hint">Cut to the part around its value; the agent quoted {c.quote_cut.chars} characters.</p>}
        </div>
      </div>

      <div className={`verdict ${words.scanned ? 'is-scan' : 'is-ok'}`}>
        <CheckIcon />
        <div>
          <p>
            <Who who={words.scanned ? 'Claude' : 'Code'} /> {words.scanned ? words.text : words.text.replace(/^Code found/, 'Found')}
          </p>
          {words.imageReads && (
            <p className="verdict-read">
              Image reads <span className="mono">{words.imageReads}</span>
            </p>
          )}
        </div>
      </div>

      {tries.map((x) => (
        <div key={x.attempt_id} className="verdict is-out">
          <CrossIcon />
          <p>
            <Who who="Code" /> Threw out an earlier try: {x.failure_label.toLowerCase()}. The agent fixed it and sent this one.
          </p>
        </div>
      ))}

      <div className="block-h">
        <h4>How the agent got here</h4>
        <span className="hint">Times since the run began</span>
      </div>
      <ol className="calls">
        {steps.map((i) => {
          const line = callLine(c.trace.session, i)
          if (!line) return null
          return (
            <li key={i} className={`call k-${line.code}`}>
              <button type="button" className="call-btn" onClick={() => pickCall(c.trace.session, i)}>
                <span className="call-t mono">{clockTenths(line.t)}</span>
                <span className="call-tool mono">{line.tool}</span>
                <span className="call-text">
                  {line.verdict ? <b>{line.verdict}</b> : null} {line.text}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <button type="button" className="btn-quiet" onClick={() => open({ kind: 'session', id: c.trace.session, call: steps[steps.length - 1] })}>
        Open the whole session
      </button>

      {c.also_in.length > 0 && (
        <>
          <div className="block-h">
            <h4>Same quote also on</h4>
          </div>
          <p className="chips">
            {c.also_in.map((s) => (
              <PageChip key={`${s.aris}-${s.page}`} aris={s.aris} page={s.page} />
            ))}
          </p>
        </>
      )}
      {c.caveats.length > 0 && <p className="hint">Caveat: {c.caveats.map(clean).join(' ')}</p>}
    </div>
  )
}
