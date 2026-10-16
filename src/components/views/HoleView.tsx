import { useEffect, useMemo, useState } from 'react'
import { report } from '../../data/core'
import { holeKey, loadDrill, type Drill, type Hole, type Sample } from '../../data/drill'
import { cuWritten, intervalsForHole, type IntervalRow } from '../../data/intervals'
import { writtenRange } from '../../lib/assay'
import { useElementWidth } from '../../lib/hooks'
import { useInspect } from '../../inspect'
import { useCalls } from '../../calls'
import { ArisLink, CheckIcon, CrossIcon, PageChip, Who } from '../bits'
import { bin, gradeOf, labState, Legend, type Element } from '../CoreTray'

const LOG_MIN = 10
function logX(v: number, max: number, x0: number, w: number) {
  const lo = Math.log10(LOG_MIN)
  const hi = Math.log10(max)
  return x0 + ((Math.log10(Math.max(LOG_MIN, v)) - lo) / (hi - lo)) * w
}

/** The whole hole, depth down: each lab sample a bar out to its grade on a log scale, the report's intervals beside it. */
function HoleLog({ h, rows, sel, el, onSel, checks }: { h: Hole; rows: IntervalRow[]; sel: string | null; el: Element; onSel: (id: string) => void; checks: Drill['labChecks'] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const W = Math.max(width, 240)
  const top = 18
  const H = 300
  const sx = 30
  const sw = 12
  const bx = sx + sw + 10
  const bw = W - bx - 8
  const max = el === 'cu' ? 10000 : 10000
  const y = (d: number) => top + (d / h.depth) * H
  const step = h.depth > 500 ? 100 : 50
  const ticks = Array.from({ length: Math.floor(h.depth / step) + 1 }, (_, i) => i * step)
  const selRow = rows.find((r) => r.claim.id === sel)
  return (
    <div className="holelog" ref={ref}>
      {width > 0 && (
        <svg width={W} height={top + H + 22} role="img" aria-label={`${h.id}: ${h.samples.length} lab samples over ${h.depth} m`}>
          {ticks.map((d) => (
            <g key={d} className="tray-ax">
              <line x1={sx - 3} x2={W - 8} y1={y(d)} y2={y(d)} />
              <text x={sx - 6} y={y(d)} textAnchor="end" dominantBaseline="central">
                {d}
              </text>
            </g>
          ))}
          {[10, 100, 1000, 10000].map((v) => (
            <g key={v} className="tray-ax">
              <line x1={logX(v, max, bx, bw)} x2={logX(v, max, bx, bw)} y1={top} y2={top + H} className="vgrid" />
              <text x={logX(v, max, bx, bw)} y={top + H + 14} textAnchor="middle">
                {v >= 1000 ? `${v / 1000}k` : v}
              </text>
            </g>
          ))}
          <text x={bx} y={10} className="tray-unit">
            {el === 'cu' ? 'Cu' : 'Ni'} ppm, log scale
          </text>
          {selRow && selRow.from !== null && selRow.to !== null && (
            <rect x={sx - 4} y={y(selRow.from) - 2} width={W - sx - 4} height={Math.max(4, y(selRow.to) - y(selRow.from) + 4)} className="sel-band" />
          )}
          <rect x={sx} y={y(0)} width={sw} height={H} className="core-hole" />
          {h.samples.map((s) => {
            const g = gradeOf(s, el)
            if (!g) return null
            const y0 = y(s.from)
            const hh = Math.max(0.6, y(s.to) - y0)
            return (
              <g key={s.id}>
                <rect x={sx} y={y0} width={sw} height={hh} className={`b b${bin(el, g.value)}`} />
                <rect x={bx} y={y0} width={Math.max(0.5, logX(g.value, max, bx, bw) - bx)} height={hh} className={`bar-assay${g.below ? ' is-below' : ''}`} />
              </g>
            )
          })}
          {rows.map((r) => {
            if (r.from === null || r.to === null) return null
            const st = labState(r, checks)
            const y0 = y(r.from)
            const y1 = Math.max(y0 + 4, y(r.to))
            return (
              <g key={r.claim.id} className="br-g" onClick={() => onSel(r.claim.id)}>
                <rect x={sx - 14} y={y0 - 3} width={14} height={y1 - y0 + 6} className="br-hit" />
                <path d={`M${sx - 3} ${y0}h-4V${y1}h4`} className={`bracket br-${st}${sel === r.claim.id ? ' is-sel' : ''}`} />
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/** The samples around one interval, each a bar on the same log scale, with the report's figure marked. */
function Zoom({ h, row, el, checks }: { h: Hole; row: IntervalRow; el: Element; checks: Drill['labChecks'] }) {
  const lab = checks[row.claim.id]
  const from = row.from ?? 0
  const to = row.to ?? from
  const pad = Math.max(3, (to - from) * 0.4)
  const near = h.samples.filter((s) => s.to > from - pad && s.from < to + pad)
  const shown = near.length > 16 ? near.filter((s) => s.to > from - 0.01 && s.from < to + 0.01).slice(0, 16) : near
  const max = 10000
  const written = el === 'cu' ? cuWritten(row.value) : null
  const wr = written ? writtenRange(written) : null
  const writtenPpm = wr ? ((wr.lo + wr.hi) / 2) * 10000 : null
  const W = 100
  return (
    <div className="zoom">
      <div className="zoom-head">
        <span className="mono">
          {row.value.from_m} to {row.value.to_m} m
        </span>
        {row.value.width_m && <span className="mono">· {row.value.width_m} m wide</span>}
      </div>
      <table className="ztable">
        <thead>
          <tr>
            <th scope="col">Depth, m</th>
            <th scope="col">Sample</th>
            <th scope="col" className="zbar-col">
              {el === 'cu' ? 'Cu' : 'Ni'} ppm
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s: Sample) => {
            const g = gradeOf(s, el)
            const inside = s.from >= from - 0.01 && s.to <= to + 0.01
            const used = lab?.samples.includes(s.id)
            return (
              <tr key={s.id} className={used ? 'is-used' : inside ? 'is-inside' : ''}>
                <td className="mono">
                  {s.from.toFixed(2)}–{s.to.toFixed(2)}
                </td>
                <td className="mono">
                  <a className="sample-link" href={`https://apps.nrs.gov.bc.ca/pub/aris/Report/${h.aris}.pdf/#page=${s.page}`} target="_blank" rel="noopener noreferrer">
                    {s.id}
                  </a>
                </td>
                <td className="zbar-col">
                  <span className="zbar">
                    <svg viewBox={`0 0 ${W} 10`} preserveAspectRatio="none" aria-hidden="true">
                      {g && <rect x={0} y={1} width={Math.max(0.6, logX(g.value, max, 0, W))} height={8} className={`b b${bin(el, g.value)}`} />}
                      {writtenPpm !== null && used && <line x1={logX(writtenPpm, max, 0, W)} x2={logX(writtenPpm, max, 0, W)} y1={0} y2={10} className="zmark" />}
                    </svg>
                    <span className="mono znum">{g ? g.written : 'n/a'}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {lab && !lab.boundaries && (
        <div className="verdict is-out">
          <CrossIcon />
          <p>
            <Who who="Code" /> {lab.line}
          </p>
        </div>
      )}
      {lab?.boundaries && (
        <div className="compare">
          <p className="compare-h">
            <Who who="Code" /> The report against its own lab, {lab.samples.length} {lab.samples.length === 1 ? 'sample' : 'samples'}
          </p>
          <table className="ctable">
            <thead>
              <tr>
                <th scope="col">Grade</th>
                <th scope="col">Report</th>
                <th scope="col">Lab average</th>
                <th scope="col">
                  <span className="sr-only">Match</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lab.grades.map((g) => (
                <tr key={g.what} className={g.agree ? '' : 'is-off'}>
                  <th scope="row">{g.what}</th>
                  <td className="mono">{g.written}</td>
                  <td className="mono">{g.lab}</td>
                  <td>{g.agree ? <CheckIcon /> : <CrossIcon />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lab.width_off && (
            <p className="compare-off">
              Width {row.value.width_m} m, but its own depths give {(to - from).toFixed(2)} m.
            </p>
          )}
        </div>
      )}
      {lab?.boundaries && !lab.ok && !row.group.settled_by && <YourCall claimId={row.claim.id} />}
      {!lab && <p className="hint">The lab samples don't cover this interval, so code can't check it.</p>}
      {writtenPpm !== null && lab?.boundaries && (
        <p className="hint">
          <i className="zmark-key" aria-hidden="true" /> the report's figure
        </p>
      )}
    </div>
  )
}

/** Lab mismatches on copper first, then other mismatches, then rows the lab bears out. */
export function rank(r: IntervalRow, d: Drill): number {
  const c = d.labChecks[r.claim.id]
  if (!c) return 3
  if (c.ok) return 2
  return c.grades.some((g) => g.what === 'Cu' && !g.agree) || !c.boundaries ? 0 : 1
}

/** The one question this file asks a person: where the table and its own lab disagree, which figure it carries. */
function YourCall({ claimId }: { claimId: string }) {
  const { calls, set } = useCalls()
  const c = calls[claimId]
  return (
    <div className="yourcall">
      <p className="yc-h">Code won't pick. Which figures go in the file?</p>
      <div className="seg" role="group" aria-label="Your call">
        <button type="button" aria-pressed={c === 'table'} onClick={() => set(claimId, c === 'table' ? null : 'table')}>
          The report's
        </button>
        <button type="button" aria-pressed={c === 'lab'} onClick={() => set(claimId, c === 'lab' ? null : 'lab')}>
          The lab's
        </button>
      </div>
      <p className="hint">{c ? 'Your call, kept in this browser only. Click again to undo.' : 'Kept in this browser only.'}</p>
    </div>
  )
}

export function HoleView({ id, claim: claimId }: { id: string; claim?: string }) {
  const [drill, setDrill] = useState<Drill | null>(null)
  const [failed, setFailed] = useState(false)
  const [el, setEl] = useState<Element>('cu')
  const { open } = useInspect()
  useEffect(() => {
    let live = true
    loadDrill().then(
      (d) => live && setDrill(d),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])
  const key = holeKey(id)
  const rows = useMemo(() => intervalsForHole(key), [key])
  const firstDiffer = drill ? [...rows].sort((a, b) => rank(a, drill) - rank(b, drill))[0] : undefined
  const [sel, setSel] = useState<string | null>(claimId ?? null)
  const selected = sel ?? firstDiffer?.claim.id ?? rows[0]?.claim.id ?? null
  if (failed) return <p className="hint">The drill tables didn't load. Reload the page to try again.</p>
  if (!drill) return <div className="view skeleton" aria-busy="true" />
  const h = drill.byKey.get(key)
  if (!h) return <p className="hint">No collar row for {id}.</p>
  const r = report(h.aris)
  const row = rows.find((x) => x.claim.id === selected)
  return (
    <div className="view">
      <p className="eyebrow">
        <Who who="Code" /> Drill hole, from the reports' own tables
      </p>
      <h3 className="view-title mono">{h.id}</h3>
      <dl className="facts">
        <div>
          <dt>Depth</dt>
          <dd className="num">{h.depth} m</dd>
        </div>
        <div>
          <dt>Az / dip</dt>
          <dd className="num">
            {h.azimuth}° / {h.dip}°
          </dd>
        </div>
        <div>
          <dt>Lab samples</dt>
          <dd className="num">{h.samples.length}</dd>
        </div>
        <div>
          <dt>Year</dt>
          <dd className="num">{h.year}</dd>
        </div>
      </dl>
      <p className="src-sub">
        Collar <span className="mono">{h.easting} E, {h.northing} N</span> · <ArisLink aris={h.aris} page={h.page}>{r ? `${r.operator.split(' ')[0]} collar table` : 'Collar table'}</ArisLink>
      </p>
      <div className="row-between">
        <div className="seg" role="group" aria-label="Element">
          <button type="button" aria-pressed={el === 'cu'} onClick={() => setEl('cu')}>
            Copper
          </button>
          <button type="button" aria-pressed={el === 'ni'} onClick={() => setEl('ni')}>
            Nickel
          </button>
        </div>
        <span className="hint">Brackets: intervals the agent copied</span>
      </div>
      <HoleLog h={h} rows={rows} sel={selected} el={el} onSel={setSel} checks={drill.labChecks} />
      <Legend el={el} />
      {rows.length > 0 && (
        <>
          <div className="block-h">
            <h4>Intervals the report gives</h4>
          </div>
          <ul className="ivals">
            {rows.map((x) => {
              const st = labState(x, drill.labChecks)
              return (
                <li key={x.claim.id} className={selected === x.claim.id ? 'is-sel' : ''}>
                  <button type="button" className="ival-btn" onClick={() => setSel(x.claim.id)} aria-pressed={selected === x.claim.id}>
                    <span className="ival-top">
                      <span className="mono">
                        {x.value.from_m}–{x.value.to_m} m
                      </span>
                      <span className="mono ival-cu">{cuWritten(x.value) ?? ''}</span>
                    </span>
                    <span className={`lab-st ls-${st}`}>{st === 'ok' ? 'Lab agrees' : st === 'differ' ? 'Lab differs' : "Lab samples don't reach it"}</span>
                  </button>
                  <PageChip aris={x.claim.source.aris} page={x.claim.source.page} onClick={() => open({ kind: 'claim', id: x.claim.id })} />
                </li>
              )
            })}
          </ul>
          {row && <Zoom h={h} row={row} el={el} checks={drill.labChecks} />}
        </>
      )}
    </div>
  )
}
