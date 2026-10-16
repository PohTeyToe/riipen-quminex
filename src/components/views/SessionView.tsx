import { useEffect, useRef } from 'react'
import { fields } from '../../data/core'
import { answers, sessionSteps } from '../../data/run'
import { callLine } from '../../data/describe'
import { clock, clockTenths, sessionById, type Session } from '../../data/timeline'
import { useInspect } from '../../inspect'
import { useElementWidth } from '../../lib/hooks'
import { Link } from '../../router'
import { ArisLink, Who } from '../bits'

const nf = new Intl.NumberFormat('en-CA')

/** This session alone, on its own time scale: every call as a tick, the picked one ringed. */
function Strip({ s, call, onPick }: { s: Session; call?: number; onPick: (i: number) => void }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const W = Math.max(width, 200)
  const H = 34
  const dur = s.end - s.start
  const x = (t: number) => 4 + ((t - s.start) / dur) * (W - 8)
  return (
    <div className="strip" ref={ref}>
      {width > 0 && (
        <svg width={W} height={H + 14} role="img" aria-label={`${s.calls.length} calls over ${clock(dur)}`}>
          <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={3} className="strip-bg" />
          {s.calls.map(([t, c], i) => {
            const h = c === 'x' ? H - 8 : c === 'p' ? (H - 8) * 0.7 : c === 'r' ? 0 : (H - 8) * 0.36
            const cx = x(t)
            return (
              <g key={i} className={`stick k-${c}${call === i ? ' is-sel' : ''}`} onClick={() => onPick(i)}>
                <rect x={cx - 3} y={2} width={6} height={H - 4} className="stick-hit" />
                {c === 'r' ? <circle cx={cx} cy={H / 2} r={4} /> : <line x1={cx} x2={cx} y1={H - 4} y2={H - 4 - h} />}
              </g>
            )
          })}
          {call !== undefined && s.calls[call] && <circle cx={x(s.calls[call][0])} cy={H / 2} r={7} className="stick-ring" />}
          <text x={2} y={H + 12} className="strip-ax">
            {clock(s.start)}
          </text>
          <text x={W - 2} y={H + 12} className="strip-ax" textAnchor="end">
            {clock(s.end)}
          </text>
        </svg>
      )}
    </div>
  )
}

/** Centre el in each scrolling box between it and stop (inclusive) that clips it, and leave the window alone.
 * For stop, only the part of it inside the viewport counts: on a wide screen the inspector runs below the fold. */
function reveal(el: HTMLElement, stop: HTMLElement | null) {
  for (let box = el.parentElement; box; box = box.parentElement) {
    if (box.scrollHeight > box.clientHeight && /auto|scroll/.test(getComputedStyle(box).overflowY)) {
      const r = el.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      const top = box === stop ? Math.max(b.top, 0) : b.top
      const bottom = box === stop ? Math.min(b.bottom, window.innerHeight) : b.bottom
      if (r.top < top || r.bottom > bottom) box.scrollTop += r.top - top - (bottom - top - r.height) / 2
    }
    if (box === stop) return
  }
}

export function SessionView({ id, call }: { id: string; call?: number }) {
  const s = sessionById(id)
  const { open, show, replace } = useInspect()
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (call === undefined) return
    // Bring the picked call into view in the call list and the inspector, never the window: scrollIntoView
    // would also scroll the page, which moves the chart under the cursor.
    const row = list.current?.querySelector<HTMLElement>(`[data-i="${call}"]`)
    if (row) reveal(row, row.closest<HTMLElement>('.insp-body'))
  }, [call, id])
  if (!s) return <p className="hint">No such session.</p>
  const steps = sessionSteps(id)
  const field = s.kind === 'field' ? fields.find((f) => f.id === s.ref) : undefined
  const answer = s.kind === 'eval' ? answers.find((a) => a.id === s.ref) : undefined
  const by = (k: string) => s.calls.filter(([, c]) => c === k).length
  // the picked call sits under the title too, so it shows without scrolling the page
  const picked = call !== undefined ? callLine(id, call) : null
  const pick = (i: number) => {
    const st = steps[i]
    if (st?.tool === 'propose_claim' && st.claim) open({ kind: 'claim', id: st.claim })
    else replace({ kind: 'session', id, call: i })
  }
  return (
    <div className="view">
      <p className="eyebrow">
        <Who who="Claude" /> {s.kind === 'field' ? 'Field session' : 'Eval session'} · lane {s.kind === 'field' ? 'F' : 'E'}
        {s.lane + 1}
      </p>
      <h3 className="view-title">{field ? field.name : answer ? answer.question : s.ref}</h3>
      {picked && (
        <div className="calls picked" role="group" aria-label="The picked call">
          <div className={`call k-${picked.code} is-sel`}>
            <div className="call-btn">
              <span className="call-t mono">{clockTenths(picked.t)}</span>
              <span className="call-tool mono">{picked.tool}</span>
              <span className="call-text">
                {picked.verdict ? <b>{picked.verdict}</b> : null} {picked.text}
                {picked.step.report && picked.step.page ? (
                  <>
                    {' · '}
                    <ArisLink aris={picked.step.report} page={picked.step.page}>
                      Open the page
                    </ArisLink>
                  </>
                ) : null}
              </span>
            </div>
          </div>
        </div>
      )}
      <dl className="facts">
        <div>
          <dt>Ran</dt>
          <dd className="num">
            {clock(s.start)} to {clock(s.end)}
          </dd>
        </div>
        <div>
          <dt>Calls</dt>
          <dd className="num">{s.calls.length}</dd>
        </div>
        <div>
          <dt>Kept / out</dt>
          <dd className="num">
            {by('p')} / <span className={by('x') ? 'red-n' : ''}>{by('x')}</span>
          </dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd className="num">${s.cost_usd.toFixed(2)}</dd>
        </div>
      </dl>
      <Strip s={s} call={call} onPick={(i) => replace({ kind: 'session', id, call: i })} />
      <ol className="calls is-long" ref={list}>
        {steps.map((_, i) => {
          const line = callLine(id, i)
          if (!line) return null
          return (
            <li key={i} data-i={i} className={`call k-${line.code}${call === i ? ' is-sel' : ''}`}>
              <button type="button" className="call-btn" onClick={() => pick(i)} aria-current={call === i ? 'true' : undefined}>
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
      <div className="view-actions">
        {field && (
          <button type="button" className="btn-quiet" onClick={() => show({ kind: 'field', id: field.id })}>
            Open {field.name.toLowerCase()} in the file
          </button>
        )}
        {answer && (
          <Link className="btn-quiet" to={`/demo/eval#${answer.id}`}>
            Its score on the Eval page
          </Link>
        )}
      </div>
      <p className="hint">{nf.format(s.output_tokens)} output tokens.</p>
    </div>
  )
}
