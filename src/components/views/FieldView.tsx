import { useEffect, useMemo, useState } from 'react'
import { fields } from '../../data/core'
import { claim, clean, sessionSteps, valueText } from '../../data/run'
import { claimsOf, distinctValues, leadGroup, messiness, sourceCounts, srcKey } from '../../data/fieldModel'
import { clock, fieldSession } from '../../data/timeline'
import { loadDrill, type Drill } from '../../data/drill'
import { gradeLabel, intervalsOf, type IntervalRow } from '../../data/intervals'
import type { Field, FieldPart, Group, Settled } from '../../data/types'
import { useInspect } from '../../inspect'
import { useCalls } from '../../calls'
import { LocationMap } from '../LocationMap'
import { CoreTray, labState, Legend, type Element } from '../CoreTray'
import { labGaps } from '../FileTable'
import { rank } from './HoleView'
import { PageChip, Who } from '../bits'

function SettledLine({ s, title, children }: { s: Settled; title?: string; children?: React.ReactNode }) {
  const [rule, setRule] = useState(false)
  return (
    <div className="settled">
      <p className="settled-h">
        <Who who="Code" /> {title ?? `Settled by ${s.by}`}
      </p>
      {children ?? <p>{s.line}</p>}
      <button type="button" className="disclose-btn small" aria-expanded={rule} onClick={() => setRule((v) => !v)}>
        The rule
      </button>
      {rule && <p className="hint">{s.rule}</p>}
    </div>
  )
}

function SessionLink({ id }: { id: string }) {
  const s = fieldSession(id)
  const { open } = useInspect()
  if (!s) return null
  const kept = s.calls.filter(([, c]) => c === 'p').length
  return (
    <button type="button" className="session-link" onClick={() => open({ kind: 'session', id: s.id })}>
      <Who who="Claude" />
      <span className="num">
        {clock(s.start)} to {clock(s.end)} · {s.calls.length} calls · {kept} kept
      </span>
      <span className="session-go">Session</span>
    </button>
  )
}

/** Distinct values a group of claims gives, each opening its first claim, with the pages behind it. */
function Values({ g, max = 4 }: { g: Group; max?: number }) {
  const { open } = useInspect()
  const [all, setAll] = useState(false)
  const vals = distinctValues(claimsOf(g.claims)).sort((a, b) => messiness(a.text) - messiness(b.text) || b.ids.length - a.ids.length)
  const shown = all ? vals : vals.slice(0, max)
  return (
    <ul className="vals">
      {shown.map((v) => (
        <li key={v.text}>
          <button type="button" className="vbtn mono" onClick={() => open({ kind: 'claim', id: v.ids[0] })}>
            {v.text}
          </button>
          <span className="chips">
            {v.ids.slice(0, 3).map((id) => {
              const c = claim(id)!
              return <PageChip key={id} aris={c.source.aris} page={c.source.page} onClick={() => open({ kind: 'claim', id })} />
            })}
            {v.ids.length > 3 && <span className="more">+{v.ids.length - 3}</span>}
          </span>
        </li>
      ))}
      {vals.length > max && (
        <li>
          <button type="button" className="disclose-btn small" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Fewer' : `All ${vals.length} ways it's written`}
          </button>
        </li>
      )}
    </ul>
  )
}

function Side({ g, label, backed }: { g: Group; label: string; backed?: boolean }) {
  return (
    <div className={`side${backed ? ' is-backed' : ' is-other'}`}>
      <p className="side-h">
        <span className="side-name">{label}</span>
        <span className="side-n">
          {g.source_count} {g.source_count === 1 ? 'page' : 'pages'}, {g.report_count} {g.report_count === 1 ? 'report' : 'reports'}
        </span>
        {backed && <span className="state st-settled">Backed</span>}
      </p>
      <Values g={g} max={3} />
    </div>
  )
}

function LocationField({ f }: { f: Field }) {
  const groups = f.groups ?? []
  const backed = f.settled_by?.side
  const order = groups.map((g, i) => ({ g, i })).sort((a, b) => Number(b.i === backed) - Number(a.i === backed))
  const [main, other] = [order[0]?.g, order[1]?.g]
  const s = f.settled_by
  return (
    <>
      <dl className="facts">
        <div>
          <dt>Gap</dt>
          <dd className="num">{f.distance_km?.toFixed(1)} km</dd>
        </div>
        <div>
          <dt>Pages, side A</dt>
          <dd className="num">{main?.source_count}</dd>
        </div>
        <div>
          <dt>Pages, side B</dt>
          <dd className="num">{other?.source_count}</dd>
        </div>
        <div>
          <dt>Collars</dt>
          <dd className="num">{s?.collars?.length ?? 0}</dd>
        </div>
      </dl>
      <LocationMap f={f} />
      {s && (
        <SettledLine s={s} title="Settled by the drill collars: side A">
          <p className="settled-data">
            <span>
              Every collar within <b className="num">{s.farthest_km} km</b> of side A
            </span>
            <span>
              Nearest collar to side B <b className="num">{s.other_km} km</b>
            </span>
          </p>
        </SettledLine>
      )}
      {order.map(({ g, i }) => (
        <Side key={i} g={g} label={i === backed ? 'Side A' : 'Side B'} backed={i === backed} />
      ))}
    </>
  )
}

function MapSheetField({ f }: { f: Field }) {
  const groups = f.groups ?? []
  const backed = f.settled_by?.side
  const found = f.eval_cross_check?.found ?? []
  return (
    <>
      {f.settled_by && <SettledLine s={f.settled_by} title={`Settled: ${f.settled_by.key ?? ''}`} />}
      {groups.map((g, i) => (
        <Side key={i} g={g} label={g.key ?? `Side ${i + 1}`} backed={i === backed} />
      ))}
      {found.length > 0 && (
        <p className="hint">
          Eval session {found.map((x) => x.session.replace('eval-', '').toUpperCase()).join(', ')} found the{' '}
          {groups.find((g) => g.claims.includes(found[0].claim))?.key} side. This field's session missed it.
        </p>
      )}
    </>
  )
}

function AgreeField({ f }: { f: Field }) {
  const g = leadGroup(f.groups)
  if (!g) return null
  return (
    <>
      <p className="lede">
        Every page that names it agrees: <span className="state st-agree">{g.source_count} pages</span>
      </p>
      <Values g={g} />
    </>
  )
}

function QuotesField({ f }: { f: Field }) {
  const { open } = useInspect()
  const [n, setN] = useState(6)
  const ids = f.groups?.[0]?.claims ?? f.claims ?? []
  const cs = claimsOf(ids)
  const { pages, reports } = sourceCounts(cs)
  // one quote per page first, so the list spreads across the reports
  const ordered = useMemo(() => {
    const seen = new Set<string>()
    const first = cs.filter((c) => (seen.has(srcKey(c.source)) ? false : (seen.add(srcKey(c.source)), true)))
    return [...first, ...cs.filter((c) => !first.includes(c))]
  }, [cs])
  return (
    <>
      <p className="lede">
        <span className="state st-quotes">Quotes</span> {cs.length} quotes on {pages} pages in {reports} reports. Text isn't compared.
      </p>
      <ul className="quotes">
        {ordered.slice(0, n).map((c) => (
          <li key={c.id}>
            <button type="button" className="qbtn" onClick={() => open({ kind: 'claim', id: c.id })}>
              <span className="qt">{valueText(c)}</span>
            </button>
            <PageChip aris={c.source.aris} page={c.source.page} onClick={() => open({ kind: 'claim', id: c.id })} />
          </li>
        ))}
      </ul>
      {n < ordered.length && (
        <button type="button" className="btn-quiet" onClick={() => setN((v) => v + 20)}>
          Show more ({ordered.length - n} left)
        </button>
      )}
    </>
  )
}

function RefusedField({ f }: { f: Field }) {
  const [open, setOpen] = useState(false)
  const steps = f.session ? sessionSteps(f.session).filter((s) => s.tool === 'search') : []
  return (
    <>
      <p className="lede">
        <span className="state st-none">Not in these sources</span> The agent refused rather than fill it.
      </p>
      {(f.refusals ?? []).map((r) => (
        <blockquote key={r} className="said">
          <p className="said-h">
            <Who who="Claude" /> Its reason, as it wrote it
          </p>
          <p>{clean(r)}</p>
        </blockquote>
      ))}
      <button type="button" className="disclose-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        What the agent searched before it refused
      </button>
      {open && (
        <ol className="searches">
          {steps.map((s) => (
            <li key={s.i}>
              <span className="mono">"{s.query}"</span>
              {s.report ? <span className="hint"> in {s.report}</span> : null}
              <span className="hint"> · {s.result}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

/** Distinct intervals: two quotes of one interval (a table row and the text) count once. */
function intervalCount(f: Field): number {
  return (f.parts ?? []).filter((p) => p.rule === 'interval').reduce((n, p) => n + p.groups.length, 0)
}

function TotalPart({ p }: { p: FieldPart }) {
  const backed = p.settled_by?.side
  return (
    <div className="part">
      <p className="part-h">Total metres</p>
      {p.groups.length > 1 ? (
        p.groups.map((g, i) => <Side key={i} g={g} label={i === backed ? 'Backed by the collar table' : 'Other figure'} backed={i === backed} />)
      ) : p.groups[0] ? (
        <Values g={p.groups[0]} max={2} />
      ) : null}
      {p.settled_by && <SettledLine s={p.settled_by} title={p.groups.length > 1 ? 'Settled by the collar table' : 'Checked against the collar table'} />}
    </div>
  )
}

function DrillingField({ f }: { f: Field }) {
  const { open } = useInspect()
  const { calls } = useCalls()
  const [drill, setDrill] = useState<Drill | null>(null)
  const [failed, setFailed] = useState(false)
  const [el, setEl] = useState<Element>('cu')
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
  const year = Number(/\d{4}/.exec(f.id)?.[0])
  const rows = useMemo(() => intervalsOf(f), [f])
  const byKey = useMemo(() => {
    const m = new Map<string, IntervalRow[]>()
    for (const r of rows) m.set(r.key, [...(m.get(r.key) ?? []), r])
    return m
  }, [rows])
  const total = f.parts?.find((p) => p.rule !== 'interval')
  const gaps = labGaps(f)
  const sorted = drill ? [...rows].sort((a, b) => rank(a, drill) - rank(b, drill)) : rows
  const holes = drill?.holes.filter((h) => h.year === year) ?? []
  return (
    <>
      {total && <TotalPart p={total} />}
      <div className="part">
        <div className="row-between">
          <p className="part-h">
            {holes.length || ''} holes, {drill ? holes.reduce((n, h) => n + h.samples.length, 0).toLocaleString('en-CA') : '…'} lab samples
          </p>
          <div className="seg" role="group" aria-label="Element">
            <button type="button" aria-pressed={el === 'cu'} onClick={() => setEl('cu')}>
              Cu
            </button>
            <button type="button" aria-pressed={el === 'ni'} onClick={() => setEl('ni')}>
              Ni
            </button>
          </div>
        </div>
        {drill ? (
          <>
            <CoreTray holes={holes} intervals={byKey} checks={drill.labChecks} el={el} onPick={(h) => open({ kind: 'hole', id: h.id })} />
            <Legend el={el} />
            <p className="hint">
              <i className="br-key br-ok" aria-hidden="true" /> lab agrees <i className="br-key br-differ" aria-hidden="true" /> lab differs. Click a hole.
            </p>
          </>
        ) : failed ? (
          <p className="hint">The drill tables didn't load. Reload the page to try again.</p>
        ) : (
          <div className="tray skeleton" aria-busy="true" />
        )}
      </div>
      <div className="part">
        <p className="part-h">
          {intervalCount(f)} intervals the agent copied{gaps ? <span className="state st-gap">{gaps} the lab doesn't back</span> : null}
        </p>
        <ul className="ivals">
          {sorted.map((r) => {
            const st = drill ? labState(r, drill.labChecks) : 'none'
            const lab = drill?.labChecks[r.claim.id]
            const off = lab?.grades.filter((g) => !g.agree).map((g) => `${g.what} ${g.written}, lab ${g.lab}`)
            return (
              <li key={r.claim.id}>
                <button type="button" className="ival-btn" onClick={() => open({ kind: 'hole', id: r.value.hole, claim: r.claim.id })}>
                  <span className="ival-top">
                    <span className="mono ival-hole">{clean(r.value.hole)}</span>
                    <span className="mono">
                      {r.value.from_m}–{r.value.to_m} m
                    </span>
                    <span className="mono ival-cu">{gradeLabel(r.value, el)}</span>
                  </span>
                  {calls[r.claim.id] && <span className="lab-st ls-call">Your call: the {calls[r.claim.id] === 'lab' ? "lab's" : "report's"} figures</span>}
                  <span className={`lab-st ls-${st}`}>
                    {st === 'ok' ? 'Lab agrees' : st === 'differ' ? (lab && !lab.boundaries ? "Depth isn't a sample edge" : `${off?.join('; ') ?? ''}${lab?.width_off ? '; width off its depths' : ''}`) : "Lab samples don't reach it"}
                  </span>
                </button>
                <PageChip aris={r.claim.source.aris} page={r.claim.source.page} onClick={() => open({ kind: 'claim', id: r.claim.id })} />
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

export function FieldView({ id }: { id: string }) {
  const f = fields.find((x) => x.id === id)
  if (!f) return <p className="hint">No such field.</p>
  let body
  if (f.id === 'location') body = <LocationField f={f} />
  else if (f.rule === 'map_sheet') body = <MapSheetField f={f} />
  else if (f.state === 'not_in_sources') body = <RefusedField f={f} />
  else if (f.parts) body = <DrillingField f={f} />
  else if (f.state === 'quotes') body = <QuotesField f={f} />
  else body = <AgreeField f={f} />
  return (
    <div className="view">
      <h3 className="view-title">{f.name}</h3>
      <SessionLink id={f.id} />
      {body}
    </div>
  )
}
