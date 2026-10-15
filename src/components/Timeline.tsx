import { useMemo, useState } from 'react'
import { index } from '../data/core'
import type { IndexRecord } from '../data/types'
import { ChevronIcon, ExternalIcon } from './Icons'

const [Y0, Y1] = index.years
const TICKS = [2001, 2005, 2010, 2015, 2020, 2025].filter((y) => y >= Y0 && y <= Y1)

const money = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const moneyWhole = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 })

export function operatorName(op: string): string {
  return op.replace(/\s*\([^)]*\)\s*$/, '')
}

function statusWord(r: IndexRecord): string {
  if (r.status === 'corpus') return 'In this corpus'
  if (r.status === 'listed_no_file') return 'Listed on ARIS, no file posted yet'
  return 'Not in this corpus'
}

function Mark({ status }: { status: IndexRecord['status'] }) {
  return <span className={`tl-dot is-${status}`} aria-hidden="true" />
}

function Detail({ r }: { r: IndexRecord }) {
  const work = [r.general_work_types, r.specific_work_types].filter(Boolean).join('; ')
  return (
    <div className="tl-detail" aria-live="polite">
      <p className="tl-detail-head">
        <span className="num tl-year">{r.report_year}</span>
        <span className="mono">ARIS {r.aris}</span>
        <span className={`tl-status is-${r.status}`}>
          <Mark status={r.status} /> {statusWord(r)}
        </span>
      </p>
      <p className="tl-title">{r.title}</p>
      <dl className="tl-meta">
        <div>
          <dt>Operator</dt>
          <dd>{operatorName(r.operator)}</dd>
        </div>
        <div>
          <dt>Work</dt>
          <dd>{work || <span className="muted">Not listed in the index</span>}</dd>
        </div>
        <div>
          <dt>Spend</dt>
          <dd>
            {r.spent_reported != null ? (
              <>
                <span className="num">C${money.format(r.spent_reported)}</span> <span className="muted">reported spend, ARIS index</span>
              </>
            ) : (
              <span className="muted">Not listed in the index</span>
            )}
          </dd>
        </div>
        {r.status === 'listed_no_file' && r.off_confidential && (
          <div>
            <dt>File</dt>
            <dd>Off confidential {r.off_confidential}. No file posted yet.</dd>
          </div>
        )}
      </dl>
      <a className="text-link" href={r.detail_url} target="_blank" rel="noopener noreferrer">
        ARIS record {r.aris}
        <ExternalIcon />
      </a>
    </div>
  )
}

export function Timeline() {
  const records = index.records
  const [pinned, setPinned] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [list, setList] = useState(false)

  // Stack reports filed in the same year.
  const placed = useMemo(() => {
    const seen = new Map<number, number>()
    return [...records]
      .sort((a, b) => a.report_year - b.report_year || a.aris - b.aris)
      .map((r) => {
        const row = seen.get(r.report_year) ?? 0
        seen.set(r.report_year, row + 1)
        return { r, row, x: (r.report_year - Y0) / (Y1 - Y0) }
      })
  }, [records])

  const counts = {
    corpus: records.filter((r) => r.status === 'corpus').length,
    out: records.filter((r) => r.status === 'not_in_corpus').length,
    listed: records.filter((r) => r.status === 'listed_no_file').length,
  }
  const shownAris = hover ?? pinned
  const shown = records.find((r) => r.aris === shownAris)

  return (
    <section className="timeline" aria-labelledby="tl-h">
      <div className="section-head">
        <h2 id="tl-h" className="label">
          Every Iron Lake report on ARIS
        </h2>
        <p className="small muted">
          {index.count} reports from {index.operators} operators, {Y0} to {Y1}. <span className="num">C${moneyWhole.format(index.spent_reported_total)}</span> reported spend, ARIS index.
        </p>
      </div>

      <ul className="tl-legend small" aria-label="Legend">
        <li>
          <Mark status="corpus" /> In this corpus ({counts.corpus})
        </li>
        <li>
          <Mark status="not_in_corpus" /> Not in this corpus ({counts.out})
        </li>
        <li>
          <Mark status="listed_no_file" /> Listed, no file yet ({counts.listed})
        </li>
      </ul>

      <div className="tl-strip" onMouseLeave={() => setHover(null)}>
        <div className="tl-track">
          <div className="tl-baseline" aria-hidden="true" />
          {placed.map(({ r, row, x }) => (
            <button
              key={r.aris}
              type="button"
              className={`tl-mark${pinned === r.aris ? ' is-pinned' : ''}`}
              style={{ left: `${x * 100}%`, bottom: `${row * 18}px` }}
              aria-pressed={pinned === r.aris}
              aria-label={`${r.report_year}, ARIS ${r.aris}, ${operatorName(r.operator)}. ${statusWord(r)}.`}
              onMouseEnter={() => setHover(r.aris)}
              onFocus={() => setHover(r.aris)}
              onBlur={() => setHover(null)}
              onClick={() => setPinned((p) => (p === r.aris ? null : r.aris))}
            >
              <Mark status={r.status} />
            </button>
          ))}
        </div>
        <div className="tl-axis" aria-hidden="true">
          {TICKS.map((y) => (
            <span key={y} className="num" style={{ left: `${((y - Y0) / (Y1 - Y0)) * 100}%` }}>
              {y}
            </span>
          ))}
        </div>
      </div>

      {shown ? <Detail r={shown} /> : <p className="tl-hint small muted">Select a mark for its year, operator, work and reported spend.</p>}

      <button type="button" className="disclosure small" aria-expanded={list} onClick={() => setList((v) => !v)}>
        <ChevronIcon />
        All {records.length} as a list
      </button>
      {list && (
        <div className="table-scroll">
          <table className="data-table tl-table">
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">ARIS</th>
                <th scope="col">Operator</th>
                <th scope="col">Title</th>
                <th scope="col" className="r">
                  Reported spend
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.aris}>
                  <td className="num">{r.report_year}</td>
                  <td>
                    <a className="mono" href={r.detail_url} target="_blank" rel="noopener noreferrer">
                      {r.aris}
                    </a>
                  </td>
                  <td>{operatorName(r.operator)}</td>
                  <td>{r.title}</td>
                  <td className="num r">{r.spent_reported != null ? `C$${money.format(r.spent_reported)}` : <span className="muted">not listed</span>}</td>
                  <td>
                    <span className="tl-status-cell">
                      <Mark status={r.status} /> {statusWord(r)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
