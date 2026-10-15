// Shapes of the JSON files in data/. The app only reads them; it never edits them.

export interface Src {
  aris: number
  page: number
}

export interface IntervalValue {
  hole: string
  from_m?: string
  to_m?: string
  width_m?: string
  grades: Record<string, string>
}

export interface Check {
  by: 'code' | 'page image'
  quote_on_page: boolean
  value_in_quote: boolean | null
  scanned?: boolean
  image_check?: 'confirmed' | 'not confirmed' | 'pending'
  image_reads?: string
  checked_by?: string | null
  checked_on?: string | null
  note?: string
}

export interface Claim {
  id: string
  attempt_id: string
  session: string
  scope: 'field' | 'eval'
  call_index: number
  field: string
  kind: 'value' | 'interval' | 'statement' | 'caveat' | 'refusal'
  value: string | IntervalValue | null
  unit: string | null
  source: Src
  quote: string
  censored: boolean
  detection_limit?: string
  censored_grades?: Record<string, { detection_limit: string; unit: string | null }>
  applies_to?: string[] | string
  caveats: string[]
  check: Check
  also_in: Src[]
  run: string
  trace: { session: string; steps: number[] }
}

export interface Rejected {
  attempt_id: string
  session: string
  scope: 'field' | 'eval'
  field: string
  kind: string
  value: string | IntervalValue | null
  source: Src
  quote: string
  failure: string
  failure_label: string
  reason: string
  found_on: Src[] | number[]
  retry: 'fixed on retry' | 'not retried'
  fixed_by: string | null
}

export interface TraceStep {
  i: number
  tool: 'search' | 'open_page' | 'propose_claim' | 'refuse'
  query?: string
  report?: number | null
  page?: number
  result: string
  attempt?: string
  claim?: string | null
  field?: string
  kind?: string
  value?: string | IntervalValue | null
  check?: string
  about?: string
  reason?: string
}

export interface Report {
  aris: number
  title: string
  report_year: number
  operator: string
  author: string
  pages_total: number
  pages_used: [number, number]
  pages_used_count: number
  scanned_pages: number[]
  pdf_url: string
  pdf_bytes: number
  pdf_size_label: string
  detail_url: string
  page_link: string
}

export interface IndexRecord {
  aris: number
  report_year: number
  operator: string
  title: string
  author: string
  general_work_types: string | null
  specific_work_types: string | null
  spent_reported: number | null
  spent_label: string
  pages: number | null
  off_confidential: string | null
  status: 'corpus' | 'not_in_corpus' | 'listed_no_file'
  status_label: string
  detail_url: string
  pdf_url: string | null
}

export interface Point {
  lat: number
  lon: number
  how: string
  written: string
  claim: string
}

export interface Group {
  key?: string
  claims: string[]
  sources: Src[]
  source_count: number
  report_count: number
  points?: Point[]
  centre?: { lat: number; lon: number }
  values?: string[]
  // interval groups
  hole?: string
  disagree?: boolean
  sides?: { width_m: string; claims: string[] }[]
  arithmetic?: Record<string, { ok: boolean; computed_m: string; stated_m: string; line: string }>
}

export interface CrossCheck {
  note: string
  found: { claim: string; session: string; source: Src; map_areas?: string[] }[]
}

export interface FieldPart {
  id: string
  name: string
  state: State
  rule: string
  rule_text: string
  claims: string[]
  caveat_claims: string[]
  unplaced: string[]
  groups: Group[]
}

export type State = 'settled' | 'disagree' | 'not_in_sources'

export interface Field {
  id: string
  name: string
  definition: string
  state: State
  rule?: string
  rule_text?: string
  claims?: string[]
  caveat_claims: string[]
  groups?: Group[]
  unplaced?: string[]
  distance_km?: number
  code_line?: string
  eval_cross_check?: CrossCheck
  parts?: FieldPart[]
  other_claims?: string[]
  searches?: string[]
  refusals?: string[]
  session?: string
}

export interface Answer {
  id: string
  category: 'answerable' | 'unanswerable' | 'conflict'
  question: string
  answer: string
  refused: boolean
  claims: string[]
  rejected: string[]
  session: string
  passed: boolean
  items: { label: string; met: boolean }[]
  caveats: { label: string; met: boolean }[]
  unbacked_numbers: string[]
  failures: string[]
  reason: string
}

export interface GoldQuestion {
  id: string
  answer: string
  expected: { label: string; any_of: string[] }[]
  required_caveats: { label: string; all_of: string[] }[]
  sources: {
    aris?: number
    page?: number
    quote?: string
    role?: string
    scanned?: boolean
    read_on_page_image?: string
    note?: string
    external?: string
    retrieved?: string
  }[]
  search_terms?: string[]
}

export interface SearchLog {
  id: string
  terms: string[]
  pages_hit: number
}

export interface Score {
  n: number
  of: number
  definition: string
}

export interface FailureCount {
  code: string
  label: string
  count: number
  from_answers: number
  from_checker: number
}

export interface Change {
  what: string
  why: string
  files?: string[]
}
