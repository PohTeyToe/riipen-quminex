// Small data files, used by every page including the walkthrough.
import runJson from '../../data/run.json'
import indexJson from '../../data/index.json'
import corpusJson from '../../data/corpus.json'
import fieldsJson from '../../data/fields.json'
import type { Field, IndexRecord, Report } from './types'

export const run = runJson as unknown as {
  run: string
  date: string
  model: string[]
  cli_version: string[]
  effort: string
  full_runs: number
  full_runs_note: string
  claims_accepted: number
  claims_rejected: number
  sessions: { fields: number; eval: number }
  tools_listed_in_first_event: string[]
}

export const index = indexJson as unknown as {
  retrieved: string
  count: number
  operators: number
  years: [number, number]
  spent_reported_total: number
  pages_posted_total: number
  records: IndexRecord[]
}

export const corpus = corpusJson as unknown as { reports: Report[] }

export const fieldsFile = fieldsJson as unknown as {
  run: string
  text_field_note: string
  fields: Field[]
}

export const fields = fieldsFile.fields

const reportsByAris = new Map(corpus.reports.map((r) => [r.aris, r]))

export function report(aris: number): Report | undefined {
  return reportsByAris.get(aris)
}

export function pageLink(aris: number, page: number): string {
  const r = report(aris)
  if (!r) return `https://apps.nrs.gov.bc.ca/pub/aris/detail/${aris}`
  return r.page_link.replace('{page}', String(page))
}

export const corpusPages = corpus.reports.reduce((n, r) => n + r.pages_used_count, 0)

export const model = run.model[0]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-15" to "Oct 15, 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** The location field's disagreement, in the numbers the walkthrough quotes. */
export function locationSummary() {
  const f = fields.find((x) => x.id === 'location')
  const groups = f?.groups ?? []
  const sorted = [...groups].sort((a, b) => a.source_count - b.source_count)
  const lone = sorted[0]
  const rest = sorted[sorted.length - 1]
  return {
    state: f?.state,
    km: f?.distance_km,
    lone,
    restPages: rest?.source_count ?? 0,
    restReports: rest?.report_count ?? 0,
  }
}
