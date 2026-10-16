import { useState } from 'react'
import { DemoLayout } from '../components/Layout'
import { Chip } from '../components/Panel'
import { SourceChips } from '../components/FieldRow'
import { ChevronIcon, ExternalIcon } from '../components/Icons'
import { pageLink } from '../data/core'
import { answers, changes, clean, goldById, goldMeta, missesNote, rejected, scores, sessionSteps, summary, valueText } from '../data/run'
import type { Answer, Rejected, Score } from '../data/types'
import { useHashScroll } from '../router'

const CATEGORY: Record<Answer['category'], string> = {
  answerable: 'Answerable',
  unanswerable: 'Not in these sources',
  conflict: 'Sources disagree',
}

function count(s: Score) {
  return `${s.n} of ${s.of}`
}

function Scoreboard() {
  const rows: { name: string; s: Score; extra?: { name: string; s: Score } }[] = [
    { name: 'Citation precision', s: scores.citation_precision },
    { name: 'Answer accuracy', s: scores.answer_accuracy },
    { name: 'Correct refusals', s: scores.correct_refusals, extra: { name: 'False refusals', s: scores.false_refusals } },
    { name: 'Disagreements flagged', s: scores.disagreements_flagged },
    ...(scores.summary_points && scores.summary_sentences
      ? [{ name: 'Summary points made', s: scores.summary_points, extra: { name: 'Sentences code kept', s: scores.summary_sentences } }]
      : []),
  ]
  return (
    <section aria-labelledby="scores-h" className="block">
      <h2 id="scores-h" className="section-title">
        Scores
      </h2>
      <dl className="scoreboard">
        {rows.map((r) => (
          <div key={r.name} className="score">
            <dt>{r.name}</dt>
            <dd className="score-n num">{r.s ? count(r.s) : 'not measured'}</dd>
            {r.extra && (
              <dd className="score-extra small">
                {r.extra.name}: <span className="num">{count(r.extra.s)}</span>
              </dd>
            )}
            <dd className="score-def small muted">{r.s?.definition}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function refusalReason(a: Answer): string | undefined {
  const step = sessionSteps(a.session).find((s) => s.tool === 'refuse')
  return step?.reason
}

function Question({ a }: { a: Answer }) {
  const [open, setOpen] = useState(false)
  const g = goldById.get(a.id)
  const reason = a.refused ? refusalReason(a) : undefined
  const log = a.search
  const expected = [...a.items, ...a.caveats.map((c) => ({ ...c, label: `Caveat: ${c.label}` }))]
  return (
    <li className={`question${a.passed ? '' : ' is-miss'}`} id={a.id}>
      <div className="q-head">
        <span className="mono q-id">{a.id}</span>
        <p className="q-text">{a.question}</p>
        <span className={`verdict${a.passed ? ' is-pass' : ' is-miss'}`}>{a.passed ? 'Passed' : 'Missed'}</span>
      </div>
      <div className="q-body">
        <p className="label">Agent's answer</p>
        <p className={a.refused || a.answer === null ? 'muted' : ''}>
          {a.refused ? 'Not in these sources' : a.answer === null ? 'No answer line. The session ended without one.' : clean(a.answer)}
        </p>
        {a.claims.length > 0 && (
          <div>
            <SourceChips ids={a.claims} max={8} />
          </div>
        )}
        {g && (
          <>
            <p className="label">Expected</p>
            <p className="q-expected">{g.answer}</p>
          </>
        )}
        <p className="small q-reason">
          <span className="muted">Verdict: </span>
          {a.reason}
        </p>
        <button type="button" className="disclosure small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronIcon />
          {a.refused ? "What was searched, and the agent's reason" : 'Quotes, pages and what was checked'}
        </button>
        {open && g && (
          <div className="q-detail">
            {expected.length > 0 && (
              <ul className="checklist small">
                {expected.map((it) => (
                  <li key={it.label} className={it.met ? 'is-met' : 'is-unmet'}>
                    <span className="check-word">{it.met ? 'Found' : 'Missing'}</span> {it.label}
                  </li>
                ))}
              </ul>
            )}
            {g.sources.length > 0 && (
              <ul className="gold-sources">
                {g.sources.map((s, i) => (
                  <li key={i}>
                    {s.quote && <blockquote className="quote small-quote">{s.quote}</blockquote>}
                    {s.read_on_page_image && (
                      <p className="small">
                        <span className="muted">Page image reads</span> <span className="mono">{s.read_on_page_image}</span>
                      </p>
                    )}
                    {s.aris && s.page ? (
                      <a className="text-link small" href={pageLink(s.aris, s.page)} target="_blank" rel="noopener noreferrer">
                        <span className="mono">
                          {s.aris} p{s.page}
                        </span>
                        {s.role === 'caveat' ? ' (caveat)' : ''}
                        <ExternalIcon />
                      </a>
                    ) : s.external ? (
                      <p className="small">
                        {s.note}{' '}
                        <a className="text-link" href={s.external} target="_blank" rel="noopener noreferrer">
                          ARIS record
                          <ExternalIcon />
                        </a>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {log && (
              <p className="small muted">
                Before the run, a full-text search of all seven reports for {log.terms.map((t) => `"${t}"`).join(', ')} hit {log.pages_hit} pages. None of them answers it.
              </p>
            )}
            {reason && (
              <div className="agent-reason">
                <p className="label">The agent's reason for refusing</p>
                <p>{clean(reason)}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

function agreeCounts(result: string) {
  const m = /(\d+) agree, (\d+) disputed/.exec(result)
  return { agree: m ? Number(m[1]) : 0, disputed: m ? Number(m[2]) : 0 }
}

function Questions() {
  const pass1 = agreeCounts(goldMeta.second_reader.result)
  const pass2 = agreeCounts(goldMeta.second_reader_pass_2.result)
  const misses = answers.filter((a) => !a.passed)
  const cats: Answer['category'][] = ['answerable', 'unanswerable', 'conflict']
  return (
    <section aria-labelledby="q-h" className="block">
      <h2 id="q-h" className="section-title">
        The {answers.length} questions, misses first
      </h2>
      <p className="lede">
        I had Claude write the questions and expected answers from the report pages before the first run, and had Codex (<span className="mono">gpt-6.1-sol</span>)
        read each expected answer against its page without seeing the agent. Before the run it agreed with {pass1.agree} and disputed {pass1.disputed}; after run 2 it agreed with{' '}
        {pass2.agree} and disputed {pass2.disputed}. Each dispute was settled against the page. Each eval session got only the question text. An expected value counts only
        when the answer line itself states it. Three expected answers changed after a run, and all three are listed at the bottom with reasons. A geologist hasn't checked
        any of this yet.
      </p>
      {misses.length > 0 ? (
        <>
          <h3 className="sub-title">Misses ({misses.length})</h3>
          <ol className="questions">
            {misses.map((a) => (
              <Question key={a.id} a={a} />
            ))}
          </ol>
        </>
      ) : (
        <p className="no-miss">No misses in this run. All {answers.length} passed.</p>
      )}
      {cats.map((cat) => {
        const list = answers.filter((a) => a.category === cat && a.passed)
        if (!list.length) return null
        return (
          <div key={cat}>
            <h3 className="sub-title">
              {CATEGORY[cat]} <span className="muted num">({list.length})</span>
            </h3>
            <ol className="questions">
              {list.map((a) => (
                <Question key={a.id} a={a} />
              ))}
            </ol>
          </div>
        )
      })}
    </section>
  )
}

function sessionLabel(r: Rejected) {
  if (r.scope === 'eval') return `eval ${r.session.replace('eval-', '')}`
  return r.session.replace('field-', '').replace(/_/g, ' ')
}

function ThrownOut() {
  const order = [...rejected].sort((a, b) => (a.retry === b.retry ? 0 : a.retry === 'not retried' ? -1 : 1))
  const fixed = rejected.filter((r) => r.retry === 'fixed on retry').length
  return (
    <section aria-labelledby="out-h" className="block" id="thrown-out">
      <h2 id="out-h" className="section-title">
        Thrown out by the checker
      </h2>
      <p className="lede">
        Every claim the checker rejected, from field and eval sessions: {rejected.length} in all. The agent got the reason back at once and fixed {fixed} on a retry. Not retried
        comes first.
      </p>
      <ol className="thrown">
        {order.map((r) => {
          const shown = typeof r.value === 'string' || r.value === null ? clean(r.value ?? r.quote ?? '') : valueText({ value: r.value, unit: null, censored: false })
          const src = r.source
          return (
            <li key={r.attempt_id} className="thrown-item">
              <p className="thrown-value">
                <span className="muted small">The agent proposed </span>
                <s>“{shown.length > 180 ? `${shown.slice(0, 178)}…` : shown}”</s>
              </p>
              <p className="small">
                <strong className="thrown-reason">{r.failure_label}.</strong> {clean(r.reason.replace(/\\n/g, ' '))}
              </p>
              <p className="small thrown-meta">
                <span className="muted">Cited</span>{' '}
                <a className="mono text-link" href={pageLink(src.aris, src.page)} target="_blank" rel="noopener noreferrer">
                  {src.aris} p{src.page}
                </a>
                <span className="muted"> in {sessionLabel(r)}.</span>{' '}
                {r.retry === 'fixed on retry' && r.fixed_by ? (
                  <span className="retry is-fixed">
                    Fixed on retry: <Chip id={r.fixed_by} />
                  </span>
                ) : (
                  <span className="retry">Not retried.</span>
                )}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function WentWrong() {
  const rows = scores.failure_counts.filter((r) => r.count > 0).sort((a, b) => b.count - a.count)
  const zero = scores.failure_counts.filter((r) => r.count === 0)
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section aria-labelledby="wrong-h" className="block">
      <h2 id="wrong-h" className="section-title">
        Where it went wrong
      </h2>
      <p className="lede">{scores.failure_counts_note}</p>
      <table className="data-table failures">
        <thead>
          <tr>
            <th scope="col">Failure</th>
            <th scope="col" className="r">
              Checker
            </th>
            <th scope="col" className="r">
              Answers
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <th scope="row">
                {r.label}
                <span className="bar" aria-hidden="true" style={{ width: `${(r.count / max) * 100}%` }} />
              </th>
              <td className="num r">{r.from_checker}</td>
              <td className="num r">{r.from_answers}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {zero.length > 0 && (
        <p className="small muted zero-line">
          None in this run: {zero.map((r) => r.label.toLowerCase()).join('; ')}.
        </p>
      )}

      <div className="my-read">
        <h3 className="sub-title">What the misses say</h3>
        <p className="small muted">Written by Claude after the run, from the misses on this page and a read of the 2023 drilling pages.</p>
        <ul className="misses-note">
          {missesNote.sentences.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function SummaryScore() {
  const thrown = summary.thrown_out
  const abouts = [...new Set(summary.points.map((p) => p.about))]
  return (
    <section aria-labelledby="summary-h" className="block" id="summary-score">
      <h2 id="summary-h" className="section-title">
        The summary, scored
      </h2>
      <p className="lede">
        A separate session read only the property card and wrote the summary at the top of it, one sentence at a time. Before it ran, I had Claude list the{' '}
        {summary.points.length} points a short evaluation of Iron Lake should make. A point counts only when the summary's own words state it.
      </p>
      <ul className="checklist small summary-points">
        {abouts.map((about) => (
          <li key={about} className="points-group">
            <span className="label">{about}</span>
            <ul>
              {summary.points
                .filter((p) => p.about === about)
                .map((p) => (
                  <li key={p.label} className={p.met ? 'is-met' : 'is-unmet'}>
                    <span className="check-word">{p.met ? 'Made' : 'Missing'}</span> {p.label}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
      {thrown.length > 0 && (
        <>
          <h3 className="sub-title">Sentences code threw out ({thrown.length})</h3>
          <ol className="thrown">
            {thrown.map((t) => (
              <li key={t.id} className="thrown-item">
                <p className="thrown-value">
                  <s>{t.text}</s>
                </p>
                <p className="small">
                  <strong className="thrown-reason">{t.failure_label}.</strong> {t.reason}
                </p>
                <p className="small thrown-meta">
                  {t.fixed_by ? <span className="retry is-fixed">Rewritten and kept as sentence {summary.sentences.findIndex((x) => x.id === t.fixed_by) + 1}.</span> : <span className="retry">Dropped.</span>}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function Changes() {
  return (
    <section aria-labelledby="changes-h" className="block">
      <h2 id="changes-h" className="section-title">
        Changes after the first eval run
      </h2>
      <p className="lede">
        {changes.full_runs} full runs. {changes.why_two_runs} Run 1 proposed {changes.first_run.proposed} claims; the checker accepted {changes.first_run.accepted} and threw out{' '}
        {changes.first_run.rejected}.
      </p>
      <ol className="changes">
        {changes.changes.map((c) => (
          <li key={c.what}>
            <p>{c.what}</p>
            <p className="small muted">{c.why}</p>
            {c.files && <p className="small mono files">{c.files.join(', ')}</p>}
          </li>
        ))}
      </ol>
      <h3 className="sub-title">After run 2, without rerunning the agent</h3>
      <ol className="changes">
        {changes.after_run_2.map((c) => (
          <li key={c.what}>
            <p>{c.what}</p>
            <p className="small muted">{c.why}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function EvalPage() {
  useHashScroll(true)
  return (
    <DemoLayout title="Eval">
      <Scoreboard />
      <Questions />
      <SummaryScore />
      <ThrownOut />
      <WentWrong />
      <Changes />
    </DemoLayout>
  )
}
