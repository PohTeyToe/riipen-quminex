import { useState, type ReactNode } from 'react'
import type { Claim, Field, FieldPart, Group, Src, State } from '../data/types'
import { claim, clean, gradeText, isInterval, sessionSteps, valueText } from '../data/run'
import { Chip, ValueButton } from './Panel'
import { ChevronIcon } from './Icons'
import { TraceList } from './Trace'

const nf = new Intl.NumberFormat('en-CA')

function claimsOf(ids: string[] = []): Claim[] {
  return ids.map((id) => claim(id)).filter((c): c is Claim => Boolean(c))
}

function srcKey(s: Src) {
  return `${s.aris}:${s.page}`
}

function countLabel(pages: number, reports: number) {
  return `${pages} ${pages === 1 ? 'page' : 'pages'} in ${reports} ${reports === 1 ? 'report' : 'reports'}`
}

function sourceCounts(cs: Claim[]) {
  return {
    pages: new Set(cs.map((c) => srcKey(c.source))).size,
    reports: new Set(cs.map((c) => c.source.aris)).size,
  }
}

/** Distinct written values, most-cited first. */
function distinctValues(cs: Claim[]): { text: string; ids: string[] }[] {
  const m = new Map<string, string[]>()
  for (const c of cs) {
    const t = valueText(c)
    m.set(t, [...(m.get(t) ?? []), c.id])
  }
  return [...m.entries()]
    .map(([text, ids]) => ({ text, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || messiness(a.text) - messiness(b.text))
}

function messiness(t: string) {
  return (t.match(/[_\-]{2,}|\s[-'o]\s/g) ?? []).length
}

/** One chip per page, first few shown, the rest one tap away. */
export function SourceChips({ ids, max = 3, siblings, context }: { ids: string[]; max?: number; siblings?: string[]; context?: string }) {
  const [all, setAll] = useState(false)
  const seen = new Set<string>()
  const unique: Claim[] = []
  for (const c of claimsOf(ids)) {
    const k = srcKey(c.source)
    if (!seen.has(k)) {
      seen.add(k)
      unique.push(c)
    }
  }
  const shown = all ? unique : unique.slice(0, max)
  const rest = unique.length - shown.length
  return (
    <span className="chips">
      {shown.map((c) => (
        <Chip key={c.id} id={c.id} siblings={siblings ?? ids} context={context} />
      ))}
      {rest > 0 && (
        <button type="button" className="chip is-more" onClick={() => setAll(true)} aria-label={`Show ${rest} more ${rest === 1 ? 'source' : 'sources'}`}>
          +{rest}
        </button>
      )}
    </span>
  )
}

const STATE_WORD: Record<State, string> = {
  settled: 'Settled',
  disagree: 'Sources disagree',
  not_in_sources: 'Not in these sources',
  quotes: 'Quotes, not compared',
}

export function StateLabel({ state, children }: { state: State; children?: ReactNode }) {
  const word = STATE_WORD[state]
  return (
    <p className={`state is-${state}`}>
      <span className="state-word">{word}</span>
      {children && <span className="state-detail">{children}</span>}
    </p>
  )
}

function ScannedNote({ c }: { c: Claim }) {
  if (c.check.by !== 'page image' || !c.check.image_reads) return null
  return (
    <p className="scanned-note small">
      <span className="muted">Scanned page. The page image reads</span> <span className="mono">{c.check.image_reads}</span>
    </p>
  )
}

function coord(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`
}

/** A side in a disagreement, or the one group of a settled field. */
function GroupValues({ g, max = 3, mono = true }: { g: Group; max?: number; mono?: boolean }) {
  const [all, setAll] = useState(false)
  const cs = claimsOf(g.claims)
  const values = distinctValues(cs)
  const shown = all ? values : values.slice(0, max)
  const rest = values.length - shown.length
  return (
    <ul className="values">
      {shown.map((v) => {
        const first = claim(v.ids[0])!
        const scanned = first.check.by === 'page image'
        return (
          <li key={v.text} className={scanned ? 'is-scanned' : ''}>
            {scanned && <span className="ocr-label">OCR text</span>}
            <ValueButton id={v.ids[0]} siblings={g.claims} className={mono ? 'mono' : ''}>
              {v.text}
            </ValueButton>
            <SourceChips ids={v.ids} siblings={g.claims} max={2} />
            <ScannedNote c={first} />
          </li>
        )
      })}
      {rest > 0 && (
        <li>
          <button type="button" className="text-button" onClick={() => setAll(true)}>
            {rest} more {rest === 1 ? 'way' : 'ways'} the reports write it
          </button>
        </li>
      )}
    </ul>
  )
}

function Sides({ groups, render, label }: { groups: Group[]; render: (g: Group) => ReactNode; label?: (g: Group) => string }) {
  return (
    <div className="sides" role="group" aria-label="The sides that disagree">
      {groups.map((g, i) => {
        const { pages, reports } = sourceCounts(claimsOf(g.claims))
        const name = label?.(g)
        return (
          <div className="side" key={i}>
            <p className="side-count">
              {name && <span className="mono">{name}: </span>}
              {countLabel(pages, reports)}
            </p>
            {render(g)}
          </div>
        )
      })}
    </div>
  )
}

function CodeLine({ lines, rule }: { lines: string[]; rule?: string }) {
  return (
    <div className="code-line">
      {lines.map((l) => (
        <p key={l} className="mono">
          {l}
        </p>
      ))}
      {rule && <p className="rule small">Rule, in code: {rule}</p>}
    </div>
  )
}

function Unplaced({ ids, what }: { ids: string[]; what: string }) {
  const [open, setOpen] = useState(false)
  const cs = claimsOf(ids)
  if (!cs.length) return null
  return (
    <div className="unplaced">
      <button type="button" className="disclosure small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronIcon />
        {cs.length} more {cs.length === 1 ? 'claim' : 'claims'} {what}
      </button>
      {open && (
        <ul className="values compact">
          {cs.map((c) => (
            <li key={c.id}>
              <ValueButton id={c.id} className="mono">
                {valueText(c)}
              </ValueButton>
              <Chip id={c.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** What an eval session found that this field's own session missed. Code folds it into the row; this says where it came from. */
function FromEval({ f }: { f: Field }) {
  const found = f.eval_cross_check?.found ?? []
  if (!found.length) return null
  return (
    <div className="cross-check">
      {found.map((x) => (
        <p key={x.claim} className="small">
          <span className="cross-check-head">Found by the eval, not this field's session.</span>{' '}
          {x.map_areas?.length ? <span className="mono">{x.map_areas.join(', ')}</span> : 'This value'} on <Chip id={x.claim} /> came from the{' '}
          <code>{x.session.replace('eval-', '')}</code> eval session. The {f.name.toLowerCase()} session never opened that page.
        </p>
      ))}
    </div>
  )
}

/* ---------- Field types ---------- */

function LocationBody({ f }: { f: Field }) {
  const groups = f.groups ?? []
  return (
    <>
      <div className={f.state === 'disagree' ? 'disagree-area' : ''}>
        <Sides
          groups={groups}
          render={(g) => (
            <>
              <GroupValues g={g} max={2} />
              {g.centre && (
                <p className="small muted code-read">
                  Code reads {g.points && g.points.length > 1 ? `the centre of ${g.points.length} points as` : 'it as'}{' '}
                  <span className="mono">{coord(g.centre.lat, g.centre.lon)}</span>
                </p>
              )}
            </>
          )}
        />
        {f.code_line && <CodeLine lines={[f.code_line]} rule={f.rule_text} />}
      </div>
      <Unplaced ids={f.unplaced ?? []} what="where code couldn't read a point, so they sit on neither side" />
      <FromEval f={f} />
    </>
  )
}

function GroupedBody({ f }: { f: Field | FieldPart }) {
  const groups = f.groups ?? []
  if (f.state === 'disagree' && groups.length > 1) {
    const keys = groups.map((g) => Number(g.key))
    const lines: string[] = []
    if (f.rule === 'number' && keys.every((k) => !Number.isNaN(k)) && keys.length === 2) {
      const [a, b] = keys
      const pct = (Math.abs(a - b) / Math.max(a, b)) * 100
      lines.push(`${nf.format(a)} and ${nf.format(b)} differ by ${pct.toFixed(2)}%. The rule allows 0.1%.`)
    }
    return (
      <>
        <div className="disagree-area">
          <Sides groups={groups} label={f.rule === 'map_sheet' ? (g) => g.key ?? '' : undefined} render={(g) => <GroupValues g={g} max={2} />} />
          <CodeLine lines={lines} rule={f.rule_text} />
        </div>
        {'eval_cross_check' in f && <FromEval f={f as Field} />}
      </>
    )
  }
  return (
    <>
      {groups.map((g, i) => (
        <div key={i} className="settled-group">
          {g.key && groups.length === 1 && f.rule !== 'number' && f.rule !== 'exact_text' && <p className="key mono">{g.key}</p>}
          <GroupValues g={g} max={f.rule === 'number' ? 3 : 2} />
        </div>
      ))}
      {f.rule_text && <p className="rule small">Rule, in code: {f.rule_text}</p>}
      {'eval_cross_check' in f && <FromEval f={f as Field} />}
    </>
  )
}

/** Up to three quotes from different reports, the rest one tap away. */
function QuotesBody({ f }: { f: Field }) {
  const [all, setAll] = useState(false)
  const ids = f.groups?.[0]?.claims ?? f.claims ?? []
  const cs = claimsOf(ids)
  const pick: Claim[] = []
  const seenText = new Set<string>()
  const seenReport = new Set<number>()
  for (const pass of [0, 1]) {
    for (const c of cs) {
      if (pick.length >= 3) break
      const t = valueText(c).toLowerCase()
      if (seenText.has(t) || pick.includes(c)) continue
      if (pass === 0 && (seenReport.has(c.source.aris) || c.check.by === 'page image' || messiness(t) > 0)) continue
      pick.push(c)
      seenText.add(t)
      seenReport.add(c.source.aris)
    }
  }
  const rest = cs.filter((c) => !pick.includes(c))
  const { pages, reports } = sourceCounts(cs)
  return (
    <>
      <StateLabel state={f.state}>
        {cs.length} quotes from {countLabel(pages, reports)}
      </StateLabel>
      <ul className="quotes">
        {(all ? [...pick, ...rest] : pick).map((c) => (
          <li key={c.id} className={c.check.by === 'page image' ? 'is-scanned' : ''}>
            <ValueButton id={c.id} className="serif">
              {valueText(c)}
            </ValueButton>
            <Chip id={c.id} />
            <ScannedNote c={c} />
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <button type="button" className="text-button" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show three' : `+${rest.length} more`}
        </button>
      )}
    </>
  )
}

function Caveats({ ids }: { ids: string[] }) {
  const cs = claimsOf(ids)
  if (!cs.length) return null
  return (
    <div className="caveats">
      <p className="label">Caveats the reports attach</p>
      <ul>
        {cs.map((c) => (
          <li key={c.id}>
            <ValueButton id={c.id} className="serif">
              {clean(c.quote)}
            </ValueButton>
            <Chip id={c.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Grades({ c }: { c: Claim }) {
  if (!isInterval(c.value)) return null
  return (
    <span className="grade-list">
      {Object.entries(c.value.grades).map(([k, v]) => {
        const censored = Boolean(c.censored_grades?.[k]) || v.trim().startsWith('<')
        return (
          <span key={k} className={censored ? 'is-censored' : ''}>
            {gradeText(k, v, censored)}
          </span>
        )
      })}
    </span>
  )
}

const ELEMENT_NAME: Record<string, string> = { Cu: 'copper', Ni: 'nickel', Au: 'gold', Pt: 'platinum', Pd: 'palladium', Co: 'cobalt', Ag: 'silver' }

function disagreeTitle(g: Group): string {
  const what = (g.disagree_on ?? []).map((w) => (w === 'width' ? 'widths' : `${ELEMENT_NAME[w] ?? w} grades`))
  return `${what.join(' and ')} disagree`
}

/** The hole as each source writes it, when they don't all write it the same way. */
function Spellings({ g }: { g: Group }) {
  const written = g.hole_written ?? []
  if (written.length < 2) return null
  return <span className="spellings small muted">written {written.join(' and ')}</span>
}

interface Row {
  g: Group
  c: Claim
  level: number
}

/** One row per interval. An interval inside a longer one follows it, indented, the way reports write "including". */
function orderRows(groups: Group[]): Row[] {
  const byRow = new Map(groups.map((g) => [g.row ?? g.claims[0], g]))
  const children = new Map<string, Group[]>()
  for (const g of groups) {
    if (g.inside && byRow.has(g.inside)) children.set(g.inside, [...(children.get(g.inside) ?? []), g])
  }
  const from = (g: Group) => {
    const v = claim(g.row ?? g.claims[0])?.value ?? null
    return isInterval(v) ? Number.parseFloat(v.from_m ?? '0') : 0
  }
  const hole = (g: Group) => clean(g.hole ?? '')
  const sort = (list: Group[]) => [...list].sort((a, b) => hole(a).localeCompare(hole(b), 'en', { numeric: true }) || from(a) - from(b))
  const out: Row[] = []
  const walk = (g: Group, level: number) => {
    const c = claim(g.row ?? g.claims[0])
    if (c) out.push({ g, c, level })
    for (const k of sort(children.get(g.row ?? '') ?? [])) walk(k, level + 1)
  }
  for (const g of sort(groups.filter((g) => !g.inside || !byRow.has(g.inside)))) walk(g, 0)
  return out
}

function conflictId(p: FieldPart, g: Group) {
  return `${p.id.replace('.', '-')}-${(g.row ?? '').replace('c-', '')}`
}

/** What a side says on the measures that disagree: "24.04 m", "Cu 6 ppm". */
function disputedValue(g: Group, c: Claim): string {
  const said = (g.compared ?? [])
    .filter((x) => !x.agree)
    .flatMap((x) => {
      const v = x.values.find((y) => y.claim === c.id)
      return v ? [x.what === 'width' ? `${v.written} m` : `${x.what} ${v.written}`] : []
    })
  return said.length ? said.join(', ') : isInterval(c.value) ? `${c.value.width_m} m` : valueText(c)
}

function IntervalsBody({ p }: { p: FieldPart }) {
  const [all, setAll] = useState(false)
  const conflicts = p.groups.filter((g) => g.disagree)
  const offByArithmetic = new Map(
    p.groups.flatMap((g) =>
      Object.entries(g.arithmetic ?? {})
        .filter(([, a]) => !a.ok)
        .map(([id, a]) => [id, { line: a.line, group: g }] as const),
    ),
  )
  const rows = orderRows(p.groups)
  const shown = all ? rows : rows.slice(0, 8)

  return (
    <>
      {conflicts.map((g) => (
        <div className="disagree-area" key={g.row} id={conflictId(p, g)}>
          <p className="disagree-title">
            <span className="mono">{clean(g.hole ?? '')}</span>: {disagreeTitle(g)} <Spellings g={g} />
          </p>
          <Sides
            groups={(g.sides ?? []).map((s) => ({ ...g, claims: s.claims }))}
            render={(side) => (
              <ul className="values">
                {claimsOf(side.claims).map((c) => (
                  <li key={c.id}>
                    <ValueButton id={c.id} siblings={g.claims} className="mono">
                      {disputedValue(g, c)}
                    </ValueButton>
                    <Chip id={c.id} siblings={g.claims} />
                    <p className="small muted interval-sub">
                      {isInterval(c.value) && `${clean(c.value.hole)}, ${c.value.from_m} to ${c.value.to_m} m, ${c.value.width_m} m. `}
                      <Grades c={c} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          />
          <CodeLine
            lines={[
              ...(g.compared ?? []).filter((x) => !x.agree).map((x) => x.line),
              ...Object.values(g.arithmetic ?? {})
                .filter((a) => !a.ok)
                .map((a) => a.line),
            ]}
            rule={p.rule_text}
          />
        </div>
      ))}

      <div className="table-scroll">
        <table className="data-table intervals">
          <caption className="sr-only">{p.name}, one row per interval, as the reports write them</caption>
          <thead>
            <tr>
              <th scope="col">Hole</th>
              <th scope="col" className="r">
                From (m)
              </th>
              <th scope="col" className="r">
                To (m)
              </th>
              <th scope="col" className="r">
                Width (m)
              </th>
              <th scope="col">Grades as written</th>
              <th scope="col">Sources</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ g, c, level }) => {
              const v = isInterval(c.value) ? c.value : null
              if (!v) return null
              const off = offByArithmetic.has(c.id)
              return (
                <tr key={c.id} className={`${level ? 'is-inside' : ''}${g.disagree ? ' is-disagree' : ''}`}>
                  <td data-label="Hole" style={level ? { paddingLeft: `${level * 16}px` } : undefined}>
                    {level > 0 && <span className="inside-word">{g.inside_word}</span>}
                    <ValueButton id={c.id} siblings={g.claims} className="mono">
                      {clean(v.hole)}
                    </ValueButton>
                  </td>
                  <td data-label="From" className="num r">
                    {v.from_m}
                  </td>
                  <td data-label="To" className="num r">
                    {v.to_m}
                  </td>
                  <td data-label="Width" className={`num r${off ? ' is-off' : ''}`}>
                    {v.width_m}
                    {off && (
                      <span className="off-mark" aria-label="to minus from gives a different width; see the code line below">
                        *
                      </span>
                    )}
                  </td>
                  <td data-label="Grades">
                    <Grades c={c} />
                    {c.caveats.length > 0 && <span className="tag">caveat</span>}
                  </td>
                  <td data-label="Sources">
                    <SourceChips ids={g.claims} siblings={g.claims} max={3} />
                    {g.disagree && (
                      <a className="tag is-disagree" href={`#${conflictId(p, g)}`}>
                        Sources disagree
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <button type="button" className="text-button" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${rows.length} intervals`}
        </button>
      )}

      {[...offByArithmetic.values()].some((a) => !a.group.disagree) && (
        <div className="code-line">
          {[...offByArithmetic.entries()]
            .filter(([, a]) => !a.group.disagree)
            .map(([id, a]) => (
              <p key={id} className="mono">
                * {clean(a.group.hole ?? '')}: {a.line}
              </p>
            ))}
          <p className="rule small">Code checks that to minus from equals the stated width, allowing for how precisely each number is written.</p>
        </div>
      )}
      <Caveats ids={p.caveat_claims} />
    </>
  )
}

function PartsBody({ f }: { f: Field }) {
  return (
    <div className="parts">
      {(f.parts ?? []).map((p) => {
        const cs = claimsOf(p.claims)
        const { pages, reports } = sourceCounts(cs)
        return (
          <div className="part" key={p.id}>
            <h4 className="part-name">{p.name}</h4>
            <StateLabel state={p.state}>{p.state !== 'disagree' && countLabel(pages, reports)}</StateLabel>
            {p.rule === 'interval' ? <IntervalsBody p={p} /> : <GroupedBody f={p} />}
          </div>
        )
      })}
      <Caveats ids={(f.caveat_claims ?? []).filter((id) => !(f.parts ?? []).some((p) => p.caveat_claims.includes(id)))} />
    </div>
  )
}

function RefusedBody({ f }: { f: Field }) {
  const [open, setOpen] = useState(false)
  const [traceOpen, setTraceOpen] = useState(false)
  const steps = f.session ? sessionSteps(f.session) : []
  return (
    <>
      <StateLabel state="not_in_sources" />
      <p className="muted refused-line">The agent found no estimate for Iron Lake itself in these reports and refused. The row stays blank.</p>
      <button type="button" className="disclosure small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronIcon />
        What the agent searched before it refused
      </button>
      {open && (
        <div className="refused-detail">
          <ul className="search-list">
            {(f.searches ?? []).map((s) => (
              <li key={s} className="mono">
                search("{s}")
              </li>
            ))}
          </ul>
          {(f.refusals ?? []).map((r) => (
            <div key={r} className="agent-reason">
              <p className="label">The agent's reason</p>
              <p>{clean(r)}</p>
            </div>
          ))}
          {steps.length > 0 && (
            <div>
              <button type="button" className="disclosure small" aria-expanded={traceOpen} onClick={() => setTraceOpen((v) => !v)}>
                <ChevronIcon />
                All {steps.length} calls in this session
              </button>
              {traceOpen && <TraceList steps={steps} />}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export function FieldRow({ f }: { f: Field }) {
  let body: ReactNode
  if (f.state === 'not_in_sources') body = <RefusedBody f={f} />
  else if (f.parts) {
    body = <PartsBody f={f} />
  } else if (f.rule === 'none') body = <QuotesBody f={f} />
  else {
    const cs = claimsOf(f.claims)
    const placed = cs.filter((c) => !(f.unplaced ?? []).includes(c.id))
    const { pages, reports } = sourceCounts(placed)
    body = (
      <>
        <StateLabel state={f.state}>{f.state !== 'disagree' && countLabel(pages, reports)}</StateLabel>
        {f.rule === 'location' ? <LocationBody f={f} /> : <GroupedBody f={f} />}
      </>
    )
  }
  return (
    <section className={`field is-${f.state}`} id={f.id} aria-labelledby={`${f.id}-h`}>
      <div className="field-key">
        <h3 id={`${f.id}-h`}>
          <a href={`#${f.id}`} className="anchor">
            {f.name}
          </a>
        </h3>
        <p className="field-def">{f.definition}</p>
      </div>
      <div className="field-body">{body}</div>
    </section>
  )
}

