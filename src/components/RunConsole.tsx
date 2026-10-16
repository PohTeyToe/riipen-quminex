import { fields, longDate, model, run } from '../data/core'
import { scores } from '../data/run'
import { allConflicts, labTotals } from '../data/fieldModel'
import { WALL, clock, countsAt, sessions, timeline, type Filter } from '../data/timeline'
import { SPEEDS, type Replay } from '../replay'
import { useInspect, type StageId } from '../inspect'
import { RunChart, type ChartPick } from './RunChart'
import { Who } from './bits'

const nf = new Intl.NumberFormat('en-CA')
const conflicts = allConflicts(fields)
const lab = labTotals(fields)
const evalScored = [scores.answer_accuracy, scores.correct_refusals, scores.disagreements_flagged]
export const evalPassed = evalScored.reduce((n, s) => n + s.n, 0)
export const evalTotal = evalScored.reduce((n, s) => n + s.of, 0)

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 16 16" className="icon" aria-hidden="true">
      <path d="M5 3.5v9M11 3.5v9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="icon" aria-hidden="true">
      <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" />
    </svg>
  )
}

function Read({ n, label, f, filter, onFilter }: { n: number; label: string; f: Filter; filter: Filter | null; onFilter: (f: Filter | null) => void }) {
  const on = filter === f
  return (
    <button type="button" className={`ro ro-btn${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onFilter(on ? null : f)}>
      <span className="ro-n num">{nf.format(n)}</span>
      <span className="ro-l">
        <i className={`key k-${f}`} aria-hidden="true" />
        {label}
      </span>
    </button>
  )
}

export function RunConsole({
  replay,
  filter,
  onFilter,
  selected,
  onPick,
}: {
  replay: Replay
  filter: Filter | null
  onFilter: (f: Filter | null) => void
  selected: ChartPick | null
  onPick: (p: ChartPick) => void
}) {
  const { show, top } = useInspect()
  const { t, playing } = replay
  const live = t < WALL
  const c = countsAt(t)
  const stage = top?.kind === 'stage' ? top.id : null

  const steps: { id: StageId; who: 'Claude' | 'Code'; name: string; n: string; line: string; after?: boolean }[] = [
    { id: 'sessions', who: 'Claude', name: 'Reader sessions', n: live ? `${c.done}/${sessions.length}` : `${sessions.length}`, line: '4 tools, 8 workers' },
    { id: 'checker', who: 'Code', name: 'Quote checker', n: nf.format(c.accepted), line: `kept, ${c.rejected} thrown out` },
    { id: 'tables', who: 'Code', name: 'Drill tables', n: `${conflicts.settled}/${conflicts.n}`, line: `conflicts settled, ${lab.checked - lab.match} lab gaps`, after: true },
    { id: 'summary', who: 'Claude', name: 'Summary session', n: `${scores.summary_sentences?.n ?? 0}/${scores.summary_sentences?.of ?? 0}`, line: 'sentences kept', after: true },
    { id: 'eval', who: 'Code', name: 'Eval', n: `${evalPassed}/${evalTotal}`, line: 'questions right', after: true },
  ]

  return (
    <section className="console" aria-labelledby="run-h">
      <div className="console-head">
        <h2 id="run-h" className="console-title">
          Recorded run <span className="console-meta">{longDate(run.date)} · {model} · 4 field + 4 eval workers</span>
        </h2>
        <p className="hint on-night console-hint">Click a bar or tick; drag the axis</p>
        <div className="replay">
          <button type="button" className="btn-primary" onClick={playing ? replay.pause : replay.play}>
            <PlayIcon playing={playing} />
            {playing ? 'Pause' : live ? 'Resume' : 'Replay'}
          </button>
          <div className="seg is-dark" role="group" aria-label="Replay speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" aria-pressed={replay.speed === s} onClick={() => replay.setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <span className="clock num" aria-live="off">
            {clock(Math.min(t, WALL))}
            <span className="clock-of"> / {clock(WALL)}</span>
          </span>
        </div>
      </div>

      <div className="console-body">
        <div className="chart-col">
          <RunChart t={t} filter={filter} selected={selected} onPick={onPick} onSeek={replay.seek} />
        </div>
        <div className="readout" role="group" aria-label="Call counts, and filters for the chart">
          <div className="ro">
            <span className="ro-n num">{live ? c.running : sessions.length}</span>
            <span className="ro-l">{live ? `running, ${c.done} done` : 'sessions'}</span>
          </div>
          <div className="ro">
            <span className="ro-n num">{nf.format(c.calls)}</span>
            <span className="ro-l">tool calls</span>
          </div>
          <Read n={c.read} label="searches, opens" f="read" filter={filter} onFilter={onFilter} />
          <Read n={c.accepted} label="claims kept" f="p" filter={filter} onFilter={onFilter} />
          <Read n={c.rejected} label="thrown out" f="x" filter={filter} onFilter={onFilter} />
          <Read n={c.refused} label="refusals" f="r" filter={filter} onFilter={onFilter} />
          <div className="ro ro-wide">
            <span className="ro-n num">${timeline.cost_usd.toFixed(2)}</span>
            <span className="ro-l">at API list price, {Math.round(timeline.output_tokens / 1000)}k tokens out</span>
          </div>
        </div>
      </div>

      <ol className="pipeline" aria-label="What ran, in order">
        {steps.map((s, i) => (
          <li key={s.id} className={`step${s.after && live ? ' is-waiting' : ''}${stage === s.id ? ' is-on' : ''}`}>
            <button type="button" className="step-btn" onClick={() => show({ kind: 'stage', id: s.id })} aria-pressed={stage === s.id}>
              <span className="step-top">
                <Who who={s.who} night />
                <span className="step-name">{s.name}</span>
              </span>
              <span className="step-low">
                <span className="step-n num">{s.after && live ? '·' : s.n}</span>
                <span className="step-line">{s.after && live ? 'after the run' : s.line}</span>
              </span>
            </button>
            {i === 0 && (
              <svg className="step-arrow" viewBox="0 0 12 12" aria-label="checks each claim inside the call" role="img">
                <path d="M2 4.5h8M8 2.5l2 2-2 2M10 7.5H2M4 5.5l-2 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {i > 0 && i < steps.length - 1 && (
              <svg className="step-arrow" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 6h8M7 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
