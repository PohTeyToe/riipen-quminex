// The run's output: claims, rejections, traces, excerpts and the eval. Loaded with the /demo pages only.
import claimsJson from '../../data/claims.json'
import rejectedJson from '../../data/rejected.json'
import tracesJson from '../../data/traces.json'
import excerptsJson from '../../data/excerpts.json'
import imageChecksJson from '../../data/image_checks.json'
import briefExamplesJson from '../../data/brief_examples.json'
import answersJson from '../../data/eval/answers.json'
import goldJson from '../../data/eval/gold.json'
import scoresJson from '../../data/eval/scores.json'
import changesJson from '../../data/eval/changes.json'
import missesNoteJson from '../../data/eval/misses_note.json'
import summaryJson from '../../data/summary.json'
import summaryReviewJson from '../../data/eval/summary_review.json'
import searchLogJson from '../../data/eval/search_log.json'
import secondReaderJson from '../../data/eval/second_reader.json'
import type {
  Answer,
  Change,
  Claim,
  FailureCount,
  GoldQuestion,
  IntervalValue,
  Rejected,
  Score,
  SearchLog,
  Summary,
  TraceStep,
} from './types'

export const claims = (claimsJson as unknown as { claims: Claim[] }).claims
export const rejected = (rejectedJson as unknown as { rejected: Rejected[] }).rejected
const sessions = (tracesJson as unknown as { sessions: Record<string, TraceStep[]> }).sessions
const excerpts = (excerptsJson as unknown as {
  excerpts: Record<string, { text: string; highlight: [number, number] }>
}).excerpts

export const imageChecks = imageChecksJson as unknown as {
  checked_by_label: string
  owner_check: { done: boolean; by: string | null; date: string | null; aris?: number; page?: number }
}

export const briefExamples = briefExamplesJson as unknown as {
  note_hand_written: string
  examples: {
    track: number
    label: string
    hand_written: boolean
    note?: string
    claim: Record<string, unknown>
    compared_with?: Record<string, unknown>
    code_result?: {
      same_interval: boolean
      widths_disagree: boolean
      arithmetic: Record<string, { ok: boolean; line: string }>
      rule_text: string
    }
  }[]
}

export const answers = (answersJson as unknown as { answers: Answer[] }).answers
const gold = goldJson as unknown as {
  written: string
  written_by: string
  questions: GoldQuestion[]
  second_reader: { reader: string; result: string }
  second_reader_pass_2: { result: string }
}
export const goldMeta = gold
export const goldById = new Map(gold.questions.map((q) => [q.id, q]))

export const scores = scoresJson as unknown as {
  citation_precision: Score
  answer_accuracy: Score
  correct_refusals: Score
  false_refusals: Score
  disagreements_flagged: Score
  summary_points?: Score
  summary_sentences?: Score
  failure_counts: FailureCount[]
  failure_counts_note: string
}

export const changes = changesJson as unknown as {
  full_runs: number
  why_two_runs: string
  first_run: { proposed: number; accepted: number; rejected: number }
  changes: Change[]
  after_run_2: Change[]
}

export const missesNote = missesNoteJson as unknown as { written_by: string; sentences: string[] }
export const summary = summaryJson as unknown as Summary
export const summaryReview = summaryReviewJson as unknown as { written_by: string; checked: string; notes: { sentence: string; note: string }[] }
export const searchLog = new Map((searchLogJson as unknown as SearchLog[]).map((s) => [s.id, s]))
export const secondReader = secondReaderJson as unknown as {
  reader: string
  verdicts: { id: string; verdict: string; notes: string }[]
}

const claimsById = new Map(claims.map((c) => [c.id, c]))

export function claim(id: string): Claim | undefined {
  return claimsById.get(id)
}

export function excerpt(id: string) {
  return excerpts[id]
}

export function traceSteps(c: Claim): TraceStep[] {
  const all = sessions[c.trace.session] ?? []
  return c.trace.steps.map((i) => all[i]).filter(Boolean)
}

export function sessionSteps(session: string): TraceStep[] {
  return sessions[session] ?? []
}

/** Display form of text as written: PDF line breaks become spaces, form blanks drop out. */
export function clean(s: string): string {
  return s
    .replace(/(\w)-\n(?=\w)/g, '$1-')
    .replace(/_{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isInterval(v: Claim['value']): v is IntervalValue {
  return typeof v === 'object' && v !== null && 'hole' in v
}

const GRADE_KEY = /^(.*?)\s*\(([^)]+)\)\s*$/

/** One grade as written. A value below detection reads "<10 ppb, below detection" and never 0. */
export function gradeText(key: string, value: string, censored: boolean): string {
  const m = GRADE_KEY.exec(key)
  const name = m ? m[1] : key
  const unit = m ? m[2] : ''
  const v = unit === '%' ? `${value}%` : unit ? `${value} ${unit}` : value
  const below = censored || value.trim().startsWith('<')
  return `${name} ${v}${below ? ', below detection' : ''}`
}

export function valueText(c: Pick<Claim, 'value' | 'unit' | 'censored'>): string {
  const v = c.value
  if (v === null) return ''
  if (isInterval(v)) {
    const depth = v.from_m && v.to_m ? `${v.from_m} to ${v.to_m} m` : ''
    const width = v.width_m ? `${v.width_m} m` : ''
    return [clean(v.hole), depth, width].filter(Boolean).join(', ')
  }
  const text = clean(v)
  const unit = c.unit ? clean(c.unit) : null
  const withUnit = unit && /^[<>\d.,\s]+$/.test(text) ? `${text} ${unit}` : text
  return c.censored ? `${withUnit}, below detection` : withUnit
}

export function srcLabel(s: { aris: number; page: number }): string {
  return `${s.aris} p${s.page}`
}

/** Plain-words check result for a claim. */
export function checkWords(c: Claim): { text: string; scanned: boolean; imageReads?: string } {
  const { check } = c
  if (check.by === 'page image') {
    const owner = imageChecks.owner_check
    const ownerPage = (owner.aris ?? 36807) === c.source.aris && (owner.page ?? 1) === c.source.page
    if (owner.done && ownerPage && owner.by && owner.date) {
      return { text: `Checked by eye against the page image (${owner.by}, ${owner.date}).`, scanned: true, imageReads: check.image_reads }
    }
    if (check.image_check === 'confirmed') {
      return {
        text:
          `Scanned page. Code can't read it reliably, so Claude (${check.checked_by}) checked it against the page image on ${check.checked_on}.` +
          (check.second_read_by ? ` ${check.second_read_by} read the same page image separately and got the same values.` : ''),
        scanned: true,
        imageReads: check.image_reads,
      }
    }
    return { text: 'Scanned page. Not yet checked against the page image.', scanned: true }
  }
  const valuePart = check.value_in_quote ? ' The value is in the quote.' : ''
  return { text: `Code found this exact quote on ${srcLabel(c.source)}.${valuePart}`, scanned: false }
}
