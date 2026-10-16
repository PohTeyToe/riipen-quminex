import { useEffect, useState } from 'react'
import { PageHead } from '../components/Layout'
import { Inspector } from '../components/Inspector'
import { CheckIcon, CrossIcon, PageChip, Who } from '../components/bits'
import { longDate, run } from '../data/core'
import { answers, changes, claim, clean, goldById, goldMeta, missesNote, scores, sessionSteps, summary } from '../data/run'
import { clock, evalSession, type Session } from '../data/timeline'
import type { Answer } from '../data/types'
import { useInspect } from '../inspect'
import { useLocation } from '../router'

const CATEGORY: Record<Answer['category'], string> = {
  answerable: 'Answerable',
  unanswerable: 'Not in sources',
  conflict: 'Sources disagree',
}
const ORDER: Answer['category'][] = ['answerable', 'unanswerable', 'conflict']
const SCORE = { answerable: scores.answer_accuracy, unanswerable: scores.correct_refusals, conflict: scores.disagreements_flagged }

/** The session behind an answer, as a strip of its calls. */
function MiniStrip({ s }: { s: Session }) {
  const W = 120
  const H = 14
  const dur = s.end - s.start
  return (
    <svg className="ministrip" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x={0} y={0} width={W} height={H} rx={2} className="strip-bg" />
      {s.calls.map(([t, c], i) => {
        const x = 2 + ((t - s.start) / dur) * (W - 4)
        const h = c === 'x' ? H - 2 : c === 'p' ? 9 : c === 'r' ? 0 : 5
        return c === 'r' ? <circle key={i} cx={x} cy={H / 2} r={3} className="k-r" /> : <line key={i} x1={x} x2={x} y1={H - 1} y2={H - 1 - h} className={`k-${c}`} />
      })}
    </svg>
  )
}

function ScoreStrip({ onPick }: { onPick: (id: string) => void }) {
  return (
    <div className="scorestrip" role="group" aria-label="Every question, pass or miss">
      {ORDER.map((cat) => {
        const qs = answers.filter((a) => a.category === cat)
        const s = SCORE[cat]
        return (
          <div key={cat} className="sgroup">
            <p className="sgroup-h">
              <span>{CATEGORY[cat]}</span>
              <span className="num sgroup-n">
                {s.n}/{s.of}
              </span>
            </p>
            <div className="cells">
              {qs.map((a) => (
                <button key={a.id} type="button" className={`cell ${a.passed ? 'is-pass' : 'is-miss'}`} onClick={() => onPick(a.id)} aria-label={`${a.id.toUpperCase()}: ${a.passed ? 'right' : 'missed'}`}>
                  <span className="cell-id mono">{a.id.replace('q', '')}</span>
                  {a.passed ? <CheckIcon /> : <CrossIcon />}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Question({ a, open, onToggle }: { a: Answer; open: boolean; onToggle: () => void }) {
  const ins = useInspect()
  const g = goldById.get(a.id)
  const s = evalSession(a.id)
  const reason = a.refused ? sessionSteps(a.session).find((x) => x.tool === 'refuse')?.reason : undefined
  const expected = [...a.items, ...a.caveats.map((c) => ({ ...c, label: `Caveat: ${c.label}` }))]
  return (
    <li className={`q${a.passed ? '' : ' is-miss'}${open ? ' is-open' : ''}`} id={a.id}>
      <button type="button" className="q-head" aria-expanded={open} onClick={onToggle}>
        <span className="mono q-id">{a.id.toUpperCase()}</span>
        <span className="q-text">{a.question}</span>
        <span className="q-cat">{CATEGORY[a.category]}</span>
        {s && (
          <span className="q-run">
            <MiniStrip s={s} />
            <span className="num">{clock(s.end - s.start)}</span>
          </span>
        )}
        <span className={`verdict-tag ${a.passed ? 'is-pass' : 'is-miss'}`}>
          {a.passed ? <CheckIcon /> : <CrossIcon />}
          {a.passed ? 'Right' : 'Missed'}
        </span>
      </button>
      {open && (
        <div className="q-body">
          <div className="q-cols">
            <div>
              <p className="label">
                <Who who="Claude" /> Answer
              </p>
              <p className={a.refused || a.answer === null ? 'muted' : ''}>{a.refused ? 'Not in these sources' : a.answer === null ? 'No answer line.' : clean(a.answer)}</p>
              {a.claims.length > 0 && (
                <p className="chips">
                  {a.claims.slice(0, 8).map((id) => {
                    const c = claim(id)
                    return c ? <PageChip key={id} aris={c.source.aris} page={c.source.page} onClick={() => ins.show({ kind: 'claim', id })} /> : null
                  })}
                </p>
              )}
              {reason && <p className="hint">Its reason: {clean(reason)}</p>}
            </div>
            {g && (
              <div>
                <p className="label">Expected, written before the run</p>
                <p>{g.answer}</p>
                {expected.length > 0 && (
                  <ul className="checklist">
                    {expected.map((it) => (
                      <li key={it.label} className={it.met ? 'is-met' : 'is-unmet'}>
                        {it.met ? <CheckIcon /> : <CrossIcon />} {it.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <p className={`q-reason${a.passed ? '' : ' is-miss'}`}>
            <Who who="Code" /> {a.reason}
          </p>
          {s && (
            <button type="button" className="btn-quiet" onClick={() => ins.show({ kind: 'session', id: s.id })}>
              Its {s.calls.length} calls
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function SummaryScore() {
  const abouts = [...new Set(summary.points.map((p) => p.about))]
  return (
    <section className="block" aria-labelledby="sum-h" id="summary-score">
      <div className="block-head">
        <h2 id="sum-h">The summary, scored</h2>
        <p className="hint">
          {scores.summary_points?.n} of {scores.summary_points?.of} points, set before it ran
        </p>
      </div>
      <div className="points">
        {abouts.map((about) => (
          <div key={about}>
            <p className="label">{about}</p>
            <ul className="checklist">
              {summary.points
                .filter((p) => p.about === about)
                .map((p) => (
                  <li key={p.label} className={p.met ? 'is-met' : 'is-unmet'}>
                    {p.met ? <CheckIcon /> : <CrossIcon />} {p.label}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function Notes() {
  const [which, setWhich] = useState<null | 'misses' | 'runs'>(null)
  return (
    <section className="block" aria-label="Notes">
      <div className="note-btns">
        <button type="button" className="disclose-btn" aria-expanded={which === 'misses'} onClick={() => setWhich((w) => (w === 'misses' ? null : 'misses'))}>
          Notes on the misses
        </button>
        <button type="button" className="disclose-btn" aria-expanded={which === 'runs'} onClick={() => setWhich((w) => (w === 'runs' ? null : 'runs'))}>
          Why there were two runs
        </button>
      </div>
      {which === 'misses' && (
        <>
          <p className="hint">Written by Claude after the run.</p>
          <ul className="plain-list">
            {missesNote.sentences.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {which === 'runs' && (
        <>
          <p>{run.full_runs_note}</p>
          <ol className="plain-list">
            {changes.changes.map((c) => (
              <li key={c.what}>
                {c.what} <span className="hint">{c.why}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

export default function EvalPage() {
  const misses = answers.filter((a) => !a.passed)
  const rest = ORDER.flatMap((cat) => answers.filter((a) => a.category === cat && a.passed))
  const list = [...misses, ...rest]
  const { hash } = useLocation()
  const { top } = useInspect()
  const [open, setOpen] = useState<Set<string>>(() => new Set(misses.map((a) => a.id)))
  const right = scores.answer_accuracy.n + scores.correct_refusals.n + scores.disagreements_flagged.n
  const total = scores.answer_accuracy.of + scores.correct_refusals.of + scores.disagreements_flagged.of

  function pick(id: string) {
    setOpen((s) => new Set(s).add(id))
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }
  useEffect(() => {
    if (/^q\d\d$/.test(hash)) pick(hash)
  }, [hash])

  const pass1 = /(\d+) agree, (\d+) disputed/.exec(goldMeta.second_reader.result)
  return (
    <div className={`work is-doc${top ? ' has-insp' : ''}`}>
      <div className="doc-col">
        <PageHead
          title={`${right} of ${total} right`}
          meta={
            <>
              {answers.length} questions set before the run · recorded {longDate(run.date)}
            </>
          }
        />
        <ScoreStrip onPick={pick} />
        <p className="scoreline">
          <span>
            Cited quotes confirmed{' '}
            <b className="num">
              {scores.citation_precision.n}/{scores.citation_precision.of}
            </b>
          </span>
          <span>
            False refusals{' '}
            <b className="num">
              {scores.false_refusals.n}/{scores.false_refusals.of}
            </b>
          </span>
        </p>
        <p className="caveat">
          Claude wrote the expected answers before the run. Codex checked each on its page{pass1 ? `: ${pass1[1]} agreed, ${pass1[2]} disputed, all settled` : ''}. No
          geologist has yet.
        </p>
        <section className="block" aria-labelledby="q-h">
          <div className="block-head">
            <h2 id="q-h">Misses first</h2>
            <p className="hint">Each session saw only its question</p>
          </div>
          <ol className="qs">
            {list.map((a) => (
              <Question
                key={a.id}
                a={a}
                open={open.has(a.id)}
                onToggle={() =>
                  setOpen((s) => {
                    const n = new Set(s)
                    if (n.has(a.id)) n.delete(a.id)
                    else n.add(a.id)
                    return n
                  })
                }
              />
            ))}
          </ol>
        </section>
        <SummaryScore />
        <Notes />
      </div>
      <Inspector hideEmpty />
    </div>
  )
}
