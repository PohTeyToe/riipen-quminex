import { fields, run } from '../../data/core'
import { claim, clean, rejected, scores, summary } from '../../data/run'
import { conflicts } from '../../data/fieldModel'
import { WALL, clock, sessionById, sessions, timeline } from '../../data/timeline'
import type { StageId } from '../../inspect'
import { useInspect, usePickCall } from '../../inspect'
import { Link } from '../../router'
import { sessionLabel } from '../RunChart'
import { CheckIcon, CrossIcon, PageChip, Who } from '../bits'
import { evalPassed, evalTotal } from '../RunConsole'

const nf = new Intl.NumberFormat('en-CA')

// Failure types the quote checker can throw a claim out for; the rest of scores.failure_counts score answers.
const CHECKER = ['quote_not_found', 'wrong_page', 'value_not_in_quote', 'unit_not_in_quote', 'grade_not_with_element', 'hole_not_with_row', 'quote_too_long', 'quote_too_short', 'page_not_in_corpus']

function Sessions() {
  const { open } = useInspect()
  const agentTime = sessions.reduce((n, s) => n + (s.end - s.start), 0)
  const ordered = [...sessions].sort((a, b) => a.start - b.start)
  return (
    <>
      <dl className="facts">
        <div>
          <dt>Wall clock</dt>
          <dd className="num">{clock(WALL)}</dd>
        </div>
        <div>
          <dt>Agent time</dt>
          <dd className="num">{clock(agentTime)}</dd>
        </div>
        <div>
          <dt>Speed-up</dt>
          <dd className="num">{(agentTime / WALL).toFixed(1)}×</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd className="num">${timeline.cost_usd.toFixed(2)}</dd>
        </div>
      </dl>
      <p className="tools">
        {run.tools_listed_in_first_event.map((t) => (
          <span key={t} className="tool mono">
            {t.replace('mcp__corpus__', '')}
          </span>
        ))}
        <span className="hint">No web, files or shell.</span>
      </p>
      <p className="hint">Each pool ran four at a time. The log doesn't name threads, so lanes pack sessions by start time.</p>
      <table className="mini">
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Lane</th>
            <th scope="col" className="num-col">Ran</th>
            <th scope="col" className="num-col">Calls</th>
            <th scope="col" className="num-col">Out</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((s) => {
            const out = s.calls.filter(([, c]) => c === 'x').length
            return (
              <tr key={s.id}>
                <th scope="row">
                  <button type="button" className="link-btn" onClick={() => open({ kind: 'session', id: s.id })}>
                    {sessionLabel(s)}
                  </button>
                </th>
                <td className="mono">
                  {s.kind === 'field' ? 'F' : 'E'}
                  {s.lane + 1}
                </td>
                <td className="num-col num">
                  {clock(s.start)}–{clock(s.end)}
                </td>
                <td className="num-col num">{s.calls.length}</td>
                <td className={`num-col num${out ? ' red-n' : ''}`}>{out || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

function Checker() {
  const pickCall = usePickCall()
  const counts = scores.failure_counts.filter((f) => CHECKER.includes(f.code))
  const fixed = rejected.filter((r) => r.retry === 'fixed on retry').length
  return (
    <>
      <p className="lede">
        Runs inside every <span className="mono">propose_claim</span> call, before the agent hears back. A claim stays only if its quote is on the cited
        page and its value is in the quote.
      </p>
      <dl className="facts">
        <div>
          <dt>Proposed</dt>
          <dd className="num">{nf.format(run.claims_accepted + run.claims_rejected)}</dd>
        </div>
        <div>
          <dt>Kept</dt>
          <dd className="num">{nf.format(run.claims_accepted)}</dd>
        </div>
        <div>
          <dt>Thrown out</dt>
          <dd className="num red-n">{run.claims_rejected}</dd>
        </div>
        <div>
          <dt>Fixed on retry</dt>
          <dd className="num">{fixed}</dd>
        </div>
      </dl>
      <table className="mini">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col" className="num-col">Thrown out</th>
          </tr>
        </thead>
        <tbody>
          {counts.map((f) => (
            <tr key={f.code}>
              <th scope="row">{f.label}</th>
              <td className={`num-col num${f.from_checker ? ' red-n' : ' zero'}`}>{f.from_checker}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="block-h">
        <h4>All {rejected.length}, in run order</h4>
        <span className="hint">Click one for its call</span>
      </div>
      <ul className="rejects">
        {[...rejected]
          .sort((a, b) => (sessionById(a.session)?.calls[a.call_index]?.[0] ?? 0) - (sessionById(b.session)?.calls[b.call_index]?.[0] ?? 0))
          .map((r) => {
            const s = sessionById(r.session)
            return (
              <li key={r.attempt_id}>
                <button type="button" className="reject-btn" onClick={() => pickCall(r.session, r.call_index)}>
                  <span className="mono reject-where">
                    {s ? sessionLabel(s) : r.session} · {s ? clock(s.calls[r.call_index]?.[0] ?? 0) : ''}
                  </span>
                  <span className="reject-why">{r.failure_label}</span>
                  <span className={`retry${r.retry === 'fixed on retry' ? ' is-fixed' : ''}`}>{r.retry === 'fixed on retry' ? 'Fixed on retry' : 'Dropped'}</span>
                </button>
              </li>
            )
          })}
      </ul>
    </>
  )
}

function Tables() {
  const { show, open } = useInspect()
  const rows = fields.flatMap((f) => {
    const out: { field: string; name: string; what: string; line: string; by: string }[] = []
    const add = (what: string, s?: { line: string; by: string }) => s && out.push({ field: f.id, name: f.name, what, line: s.line, by: s.by })
    if (!f.parts && f.state === 'disagree') add('Two places', f.settled_by)
    for (const p of f.parts ?? []) {
      if (p.rule === 'interval') p.groups.filter((g) => g.disagree).forEach((g) => add(`${clean(g.hole ?? '')}: ${(g.disagree_on ?? []).join(', ')}`, g.settled_by))
      else if (p.state === 'disagree') add('Total metres', p.settled_by)
    }
    return out
  })
  const gaps = fields.flatMap((f) => (f.parts ?? []).flatMap((p) => p.lab_summary?.differ ?? []))
  const all = fields.reduce((t, f) => {
    const c = conflicts(f)
    return { n: t.n + c.n, s: t.s + c.settled }
  }, { n: 0, s: 0 })
  return (
    <>
      <p className="lede">
        Where reports disagree, code reads their own collar tables and lab certificates and backs a side only when the numbers fit. The model never
        settles it.
      </p>
      <dl className="facts">
        <div>
          <dt>Conflicts</dt>
          <dd className="num">{all.n}</dd>
        </div>
        <div>
          <dt>Settled</dt>
          <dd className="num">{all.s}</dd>
        </div>
        <div>
          <dt>Lab gaps</dt>
          <dd className="num red-n">{gaps.length}</dd>
        </div>
        <div>
          <dt>Collars</dt>
          <dd className="num">26</dd>
        </div>
      </dl>
      <ul className="conflicts">
        {rows.map((r) => (
          <li key={r.field + r.what}>
            <button type="button" className="conflict-btn" onClick={() => show({ kind: 'field', id: r.field })}>
              <span className="conflict-h">
                <b>{r.name}</b> <span className="mono">{r.what}</span>
                <span className="state st-settled">by {r.by}</span>
              </span>
              <span className="conflict-line">{r.line}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="block-h">
        <h4>Rows the lab doesn't back</h4>
        <span className="hint">Shown next to the table, not picked</span>
      </div>
      <ul className="rejects">
        {gaps.map((g) => {
          const c = claim(g.claim)
          return (
            <li key={g.claim}>
              <button type="button" className="reject-btn" onClick={() => open({ kind: 'hole', id: g.hole, claim: g.claim })}>
                <span className="mono reject-where">
                  {clean(g.hole)} · {g.from_m}–{g.to_m} m
                </span>
                <span className="reject-why">{g.what.join('; ')}</span>
                {c && <span className="retry">{g.src}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Summary() {
  const { open, show } = useInspect()
  const pts = scores.summary_points
  return (
    <>
      <p className="lede">A second Claude session wrote this from the finished file only. Code kept a sentence only if every number in it is in what it cites.</p>
      <dl className="facts">
        <div>
          <dt>Ran</dt>
          <dd className="num">{clock(timeline.summary.seconds)}</dd>
        </div>
        <div>
          <dt>Calls</dt>
          <dd className="num">{timeline.summary.calls.length}</dd>
        </div>
        <div>
          <dt>Kept</dt>
          <dd className="num">
            {summary.sentences.length} of {summary.sentences.length + summary.thrown_out.length}
          </dd>
        </div>
        <div>
          <dt>Points made</dt>
          <dd className="num">{pts ? `${pts.n} of ${pts.of}` : ''}</dd>
        </div>
      </dl>
      <ol className="summary">
        {summary.sentences.map((s) => (
          <li key={s.id}>
            <p>{s.text}</p>
            <p className="chips">
              {s.cite.map((cid) => {
                if (cid.startsWith('code:')) {
                  const fid = cid.slice(5).split('.')[0]
                  return (
                    <button key={cid} type="button" className="chip-code" onClick={() => show({ kind: 'field', id: fid })}>
                      code: {fields.find((f) => f.id === fid)?.name.toLowerCase()}
                    </button>
                  )
                }
                if (cid.startsWith('refused:')) {
                  return (
                    <button key={cid} type="button" className="chip-code" onClick={() => show({ kind: 'field', id: cid.slice(8) })}>
                      refusal
                    </button>
                  )
                }
                const c = claim(cid)
                return c ? <PageChip key={cid} aris={c.source.aris} page={c.source.page} onClick={() => open({ kind: 'claim', id: cid })} /> : null
              })}
            </p>
          </li>
        ))}
      </ol>
      <div className="block-h">
        <h4>Thrown out by code</h4>
      </div>
      {summary.thrown_out.map((s) => (
        <div key={s.id} className="verdict is-out">
          <CrossIcon />
          <div>
            <p className="strike">{s.text}</p>
            <p className="verdict-sub">
              {s.failure_label}: {s.reason.replace('No cited claim or code line contains', 'nothing cited contains')}. Rewritten as {s.fixed_by}.
            </p>
          </div>
        </div>
      ))}
      {summary.points.filter((p) => !p.met).length > 0 && (
        <p className="hint">Missed: {summary.points.filter((p) => !p.met).map((p) => p.label).join('; ')}.</p>
      )}
    </>
  )
}

function Eval() {
  return (
    <>
      <p className="lede">Claude wrote 15 questions before the run. Fifteen sessions answered them, each seeing only its question, and code scored the answers.</p>
      <dl className="facts">
        <div>
          <dt>Right</dt>
          <dd className="num">
            {evalPassed} of {evalTotal}
          </dd>
        </div>
        <div>
          <dt>Answerable</dt>
          <dd className="num">
            {scores.answer_accuracy.n}/{scores.answer_accuracy.of}
          </dd>
        </div>
        <div>
          <dt>Refusals</dt>
          <dd className="num">
            {scores.correct_refusals.n}/{scores.correct_refusals.of}
          </dd>
        </div>
        <div>
          <dt>Conflicts</dt>
          <dd className="num">
            {scores.disagreements_flagged.n}/{scores.disagreements_flagged.of}
          </dd>
        </div>
      </dl>
      <p className="verdict is-ok">
        <CheckIcon />
        <span>
          Quotes it cited that code confirmed: {scores.citation_precision.n} of {scores.citation_precision.of}. False refusals:{' '}
          {scores.false_refusals.n} of {scores.false_refusals.of}.
        </span>
      </p>
      <Link className="btn-primary" to="/demo/eval">
        Every question, misses first
      </Link>
    </>
  )
}

const TITLES: Record<StageId, [string, 'Claude' | 'Code']> = {
  sessions: ['Reader sessions', 'Claude'],
  checker: ['Quote checker', 'Code'],
  tables: ['Drill tables', 'Code'],
  summary: ['Summary session', 'Claude'],
  eval: ['Eval', 'Code'],
}

export function StageView({ id }: { id: StageId }) {
  const [title, who] = TITLES[id]
  return (
    <div className="view">
      <h3 className="view-title with-who">
        <Who who={who} /> {title}
      </h3>
      {id === 'sessions' && <Sessions />}
      {id === 'checker' && <Checker />}
      {id === 'tables' && <Tables />}
      {id === 'summary' && <Summary />}
      {id === 'eval' && <Eval />}
    </div>
  )
}
