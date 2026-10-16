import { memo } from 'react'
import { fields } from '../data/core'
import { overview, type Overview } from '../data/fieldModel'
import { WALL, callsBy, clock, fieldSession, phaseAt, type Phase, type Session } from '../data/timeline'
import { useInspect } from '../inspect'
import type { Field } from '../data/types'

/** Interval rows whose own lab samples don't bear out the report's table. */
export function labGaps(f: Field): number {
  return (f.parts ?? []).reduce((n, p) => n + (p.lab_summary ? p.lab_summary.checked - p.lab_summary.match : 0), 0)
}

function Status({ o, gaps }: { o: Overview; gaps: number }) {
  return (
    <span className="status">
      {o.tone === 'settled' && (
        <span className="state st-settled" title={`by ${o.by}`}>
          {o.status}
          {!gaps && <span className="state-by">by {o.by}</span>}
        </span>
      )}
      {o.tone === 'agree' && <span className="state st-agree">Agree</span>}
      {o.tone === 'quotes' && <span className="state st-quotes">Quotes</span>}
      {o.tone === 'none' && <span className="state st-none">Not in sources</span>}
      {o.tone === 'conflict' && <span className="state st-conflict">{o.status}</span>}
      {gaps > 0 && <span className="state st-gap">{gaps} lab gaps</span>}
    </span>
  )
}

/** Where this field's session sat in the 7:32 run: a sliver of the run chart. t is the playhead, held to the
 * session's own span, so the row stays still while its session is queued or done. */
function Slot({ s, phase, t }: { s: Session; phase: Phase; t: number }) {
  const x0 = (s.start / WALL) * 100
  const x1 = (t / WALL) * 100
  const full = ((s.end - s.start) / WALL) * 100
  return (
    <span className="slot">
      <span className="slot-track" aria-hidden="true">
        <span className="slot-plan" style={{ left: `${x0}%`, width: `${full}%` }} />
        <span className={`slot-run is-${phase}`} style={{ left: `${x0}%`, width: `${Math.max(0, x1 - x0)}%` }} />
      </span>
      <span className="slot-n num">{phase === 'running' ? `${callsBy(s, t)} calls` : phase === 'queued' ? 'queued' : clock(s.end - s.start)}</span>
    </span>
  )
}

// What each row shows once its session is done never changes, so it is worked out once, not on every frame of a
// replay.
const ROWS = fields.map((f) => ({ f, o: overview(f), gaps: labGaps(f), s: fieldSession(f.id) }))

/** fresh: while a replay runs, how many run-seconds a just-finished row stays marked. */
export function FileTable({ t, fresh = 0 }: { t: number; fresh?: number }) {
  const { stack } = useInspect()
  const live = t < WALL
  const selected = [...stack].reverse().find((v) => v.kind === 'field')?.id ?? null
  return (
    <section className="file" aria-labelledby="file-h">
      <div className="file-head">
        <h2 id="file-h">Property file</h2>
        <p className="hint">Click a value for its page</p>
      </div>
      <table className="ftable">
        <colgroup>
          <col className="c-name" />
          <col />
          <col className="c-check" />
          <col className="c-pages" />
          <col className="c-slot" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">What the reports say</th>
            <th scope="col">Check</th>
            <th scope="col" className="num-col">Pages</th>
            <th scope="col" className="slot-col">Session</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ f, o, gaps, s }) => {
            const phase = s ? phaseAt(s, t) : 'done'
            return (
              <Row
                key={f.id}
                f={f}
                o={o}
                gaps={gaps}
                s={s}
                phase={phase}
                slotT={s ? Math.min(s.end, Math.max(t, s.start)) : 0}
                live={live}
                selected={selected === f.id}
                fresh={Boolean(s && fresh > 0 && phase === 'done' && t - s.end < fresh)}
              />
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// memo: a replay re-renders the table every frame, and only a row whose session is running changes then.
const Row = memo(function Row({
  f,
  o,
  gaps,
  s,
  phase,
  slotT,
  live,
  selected,
  fresh,
}: {
  f: Field
  o: Overview
  gaps: number
  s: Session | undefined
  phase: Phase
  slotT: number
  live: boolean
  selected: boolean
  fresh: boolean
}) {
  const { show, open } = useInspect()
  const ready = phase === 'done'
  return (
    <tr id={f.id} className={`frow${selected ? ' is-sel' : ''}${fresh ? ' is-fresh' : ''}`} onClick={() => show({ kind: 'field', id: f.id })}>
      <th scope="row">
        <button type="button" className="fname" aria-pressed={selected} onClick={(e) => (e.stopPropagation(), show({ kind: 'field', id: f.id }))}>
          {f.name}
        </button>
      </th>
      <td className="fval">
        {!ready ? (
          <span className={`pending is-${phase}`}>{phase === 'running' ? 'Reading' : 'Waiting for a worker'}</span>
        ) : o.value ? (
          <>
            <button
              type="button"
              className={`vbtn${o.tone === 'quotes' ? ' is-text' : ' mono'}`}
              onClick={(e) => {
                e.stopPropagation()
                show({ kind: 'field', id: f.id })
                open({ kind: 'claim', id: o.value!.id })
              }}
            >
              {o.value.text}
            </button>
            {o.extra && <span className="fextra">{o.extra}</span>}
          </>
        ) : (
          <span className="none-val">None stated</span>
        )}
      </td>
      <td className="fstat">{ready && !live ? <Status o={o} gaps={gaps} /> : null}</td>
      <td className="num-col num">{ready ? o.pages || '' : ''}</td>
      <td className="slot-col">{s && <Slot s={s} phase={phase} t={slotT} />}</td>
    </tr>
  )
})
