import { useState } from 'react'
import { pageLink } from '../data/core'
import type { CodePage, SampleRow, Settled } from '../data/types'
import { ChevronIcon, ExternalIcon } from './Icons'

// What the reports' own tables say about a disagreement: code reads the drill collar and lab assay tables
// (agent/extract_tables.py) and backs a side only when that evidence agrees with it and not with the others.

const BY: Record<string, string> = {
  'drill collars': 'the drill collars',
  'collar table': 'the collar table',
  'lab assays': 'the lab assays',
}

export function settledBy(s: Settled): string {
  return BY[s.by] ?? s.by
}

function PageLink({ aris, page }: { aris: number; page: number }) {
  return (
    <a className="text-link mono" href={pageLink(aris, page)} target="_blank" rel="noopener noreferrer">
      {aris} p{page}
      <ExternalIcon />
    </a>
  )
}

function pagesOf(s: Settled): { aris: number; page: number }[] {
  const rows = [...(s.collars ?? []), ...(s.samples ?? []), ...(s.aris && s.page ? [{ aris: s.aris, page: s.page }] : [])]
  const seen = new Map(rows.map((r) => [`${r.aris}:${r.page}`, { aris: r.aris, page: r.page }]))
  return [...seen.values()]
}

function Samples({ rows }: { rows: SampleRow[] }) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.grades)))]
  const certs = [...new Set(rows.map((r) => r.certificate).filter(Boolean))]
  return (
    <div className="table-scroll">
      <table className="data-table evidence">
        <caption className="small muted">
          Lab results as the assay table gives them{certs.length ? `, certificate ${certs.join(', ')}` : ''}. Bold rows are inside the depths code
          averaged.
        </caption>
        <thead>
          <tr>
            <th scope="col">Sample</th>
            <th scope="col" className="r">
              From (m)
            </th>
            <th scope="col" className="r">
              To (m)
            </th>
            <th scope="col" className="r">
              Width (m)
            </th>
            {keys.map((k) => (
              <th key={k} scope="col" className="r">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sample} className={r.used ? 'is-used' : 'muted'}>
              <th scope="row" className="mono">
                {r.sample}
              </th>
              <td className="num r">{r.from_m}</td>
              <td className="num r">{r.to_m}</td>
              <td className="num r">{r.width_m}</td>
              {keys.map((k) => (
                <td key={k} className="num r">
                  {r.grades[k] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Evidence({ s }: { s: Settled }) {
  if (s.samples?.length) return <Samples rows={s.samples} />
  if (s.collars?.length) {
    return (
      <div className="table-scroll">
        <table className="data-table evidence">
          <caption className="small muted">Drill collars as the collar tables give them (UTM zone 10, NAD83, as the reports' maps state).</caption>
          <thead>
            <tr>
              <th scope="col">Hole</th>
              <th scope="col" className="r">
                Easting
              </th>
              <th scope="col" className="r">
                Northing
              </th>
              <th scope="col" className="r">
                Depth (m)
              </th>
              <th scope="col">Page</th>
            </tr>
          </thead>
          <tbody>
            {s.collars.map((c) => (
              <tr key={c.hole}>
                <th scope="row" className="mono">
                  {c.hole}
                </th>
                <td className="num r">{c.easting}</td>
                <td className="num r">{c.northing}</td>
                <td className="num r">{c.depth_m}</td>
                <td className="mono small">
                  {c.aris} p{c.page}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (s.holes?.length) {
    return (
      <p className="small mono evidence-holes">
        {s.holes.map((h) => `${h.hole} ${h.depth_m} m`).join(', ')}
      </p>
    )
  }
  return null
}

function evidenceLabel(s: Settled): string {
  if (s.samples?.length) return s.samples.length === 1 ? 'The lab sample at these depths' : `The ${s.samples.length} lab samples at these depths`
  if (s.collars?.length) return `The ${s.collars.length} drill collars code read`
  if (s.holes?.length) return `The ${s.holes.length} holes and their depths`
  return ''
}

/** The block under a disagreement (or a flagged row) that says what the reports' tables show. */
export function SettledBlock({ s, title }: { s: Settled; title: string }) {
  const [open, setOpen] = useState(false)
  const label = evidenceLabel(s)
  return (
    <div className="settled">
      <p className="settled-head">{title}</p>
      <p className="settled-line">{s.line}</p>
      {label && (
        <button type="button" className="disclosure small" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <ChevronIcon />
          {label}
        </button>
      )}
      {open && <Evidence s={s} />}
      <p className="small settled-from">
        <span className="muted">Read by code from </span>
        {pagesOf(s).map((p, i) => (
          <span key={`${p.aris}:${p.page}`}>
            {i > 0 && ', '}
            <PageLink aris={p.aris} page={p.page} />
          </span>
        ))}
        <span className="muted">.</span>
      </p>
      <p className="rule small">Rule, in code: {s.rule}</p>
    </div>
  )
}

/** Map sheet labels code read on pages no claim covers. */
export function CodePages({ pages }: { pages: CodePage[] }) {
  const [all, setAll] = useState(false)
  const scanned = pages.filter((p) => p.scanned)
  const shown = all ? pages : [...scanned, ...pages.filter((p) => !p.scanned)].slice(0, 3)
  return (
    <div className="code-pages small">
      <p>
        <span className="muted">Also labelled on {pages.length} {pages.length === 1 ? 'page' : 'pages'} no claim covers, read by code: </span>
        {shown.map((p, i) => (
          <span key={`${p.aris}:${p.page}`}>
            {i > 0 && ', '}
            <span className="mono">{p.written}</span> on <PageLink aris={p.aris} page={p.page} />
          </span>
        ))}
        {pages.length > shown.length && (
          <>
            {' '}
            <button type="button" className="text-button" onClick={() => setAll(true)}>
              +{pages.length - shown.length} more
            </button>
          </>
        )}
      </p>
      {scanned.map((p) => (
        <p key={`s-${p.aris}:${p.page}`} className="muted">
          {p.aris} p{p.page} is a scanned page. Claude ({p.checked_by}) checked its image on {p.checked_on}: it reads{' '}
          <span className="mono">{p.image_reads}</span>.{p.second_read_by ? ` ${p.second_read_by} read the same.` : ''}
        </p>
      ))}
    </div>
  )
}
