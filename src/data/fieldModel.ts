// What a field shows before it opens, and the counting behind it: pure functions over the run's claims, so the
// field list, the detail pane and the tests read the same answer.
import type { Claim, Field, Group, Settled, Src } from './types'
import { claim, valueText } from './run'

export function claimsOf(ids: string[] = []): Claim[] {
  return ids.map((id) => claim(id)).filter((c): c is Claim => Boolean(c))
}

export function srcKey(s: Src) {
  return `${s.aris}:${s.page}`
}

export function sourceCounts(cs: Claim[]) {
  return {
    pages: new Set(cs.map((c) => srcKey(c.source))).size,
    reports: new Set(cs.map((c) => c.source.aris)).size,
  }
}

/** How messy a value looks as written: OCR dashes, stray marks. Cleaner forms are shown first. */
export function messiness(t: string) {
  return (t.match(/[_\-]{2,}|\s[-'o]\s/g) ?? []).length
}

/** Distinct written values, most-cited first. */
export function distinctValues(cs: Claim[]): { text: string; ids: string[] }[] {
  const m = new Map<string, string[]>()
  for (const c of cs) {
    const t = valueText(c)
    m.set(t, [...(m.get(t) ?? []), c.id])
  }
  return [...m.entries()]
    .map(([text, ids]) => ({ text, ids }))
    .sort((a, b) => b.ids.length - a.ids.length || messiness(a.text) - messiness(b.text))
}

/** Up to three quotes, from different reports where possible, clean text before scans and OCR noise. */
export function pickQuotes(cs: Claim[]): Claim[] {
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
  return pick
}

export function quoteIds(f: Field): string[] {
  return f.groups?.[0]?.claims ?? f.claims ?? []
}

const BY: Record<string, string> = {
  'drill collars': 'drill collars',
  'collar table': 'collar table',
  'lab assays': 'lab assays',
}

/** "drill collars", "lab assays": what settled a disagreement. */
export function settledBy(s: Settled): string {
  return BY[s.by] ?? s.by
}

/** The side the reports' tables back, or else the side most pages give. */
export function leadGroup(groups: Group[] = [], s?: Settled): Group | undefined {
  if (s && s.side !== undefined && groups[s.side]) return groups[s.side]
  return [...groups].sort((a, b) => b.source_count - a.source_count)[0]
}

export function leadValue(g?: Group): { id: string; text: string; siblings: string[] } | undefined {
  const v = g ? distinctValues(claimsOf(g.claims))[0] : undefined
  return v && g ? { id: v.ids[0], text: v.text, siblings: g.claims } : undefined
}

/** Every disagreement in a field, and how many the reports' own tables settle. */
export function conflicts(f: Field) {
  const by = new Set<string>()
  let n = 0
  let settled = 0
  const add = (s?: Settled) => {
    n++
    if (s) {
      settled++
      by.add(settledBy(s))
    }
  }
  if (f.parts) {
    for (const p of f.parts) {
      if (p.rule === 'interval') p.groups.filter((g) => g.disagree).forEach((g) => add(g.settled_by))
      else if (p.state === 'disagree') add(p.settled_by)
    }
  } else if (f.state === 'disagree') add(f.settled_by)
  return { n, settled, by: [...by] }
}

export type Tone = 'agree' | 'settled' | 'conflict' | 'quotes' | 'none'

export interface Overview {
  value?: { id: string; text: string; siblings: string[] }
  extra?: string
  tone: Tone
  status: string
  by?: string
  pages: number
}

export function overview(f: Field): Overview {
  const ids = f.parts ? f.parts.flatMap((p) => p.claims) : f.state === 'quotes' ? quoteIds(f) : (f.claims ?? [])
  const pages = sourceCounts(claimsOf(ids)).pages
  if (f.state === 'not_in_sources') return { tone: 'none', status: 'Not in sources', pages }
  if (f.state === 'quotes') {
    const first = pickQuotes(claimsOf(quoteIds(f)))[0]
    return { value: first && { id: first.id, text: valueText(first), siblings: [] }, tone: 'quotes', status: 'Quotes', pages }
  }
  let value: Overview['value']
  let extra: string | undefined
  if (f.parts) {
    const total = f.parts.find((p) => p.rule !== 'interval')
    const intervals = f.parts.find((p) => p.rule === 'interval')
    value = total && leadValue(leadGroup(total.groups, total.settled_by))
    if (intervals) extra = `${intervals.groups.length} intervals`
  } else {
    value = leadValue(leadGroup(f.groups, f.settled_by))
  }
  const c = conflicts(f)
  if (!c.n) return { value, extra, tone: 'agree', status: 'Agree', pages }
  if (c.settled === c.n) return { value, extra, tone: 'settled', status: c.n === 1 ? 'Settled' : `${c.n} settled`, by: c.by.join(', '), pages }
  return { value, extra, tone: 'conflict', status: c.settled ? `${c.settled} of ${c.n} settled` : c.n === 1 ? 'Conflict' : `${c.n} conflicts`, pages }
}

/** Every conflict on the card, and how many the reports' own tables settle. */
export function allConflicts(fields: Field[]) {
  return fields.reduce(
    (t, f) => {
      const c = conflicts(f)
      return { n: t.n + c.n, settled: t.settled + c.settled }
    },
    { n: 0, settled: 0 },
  )
}

/** The interval rows the lab assays reach, across every drilling field. */
export function labTotals(fields: Field[]) {
  return fields
    .flatMap((f) => f.parts ?? [])
    .reduce((t, p) => ({ match: t.match + (p.lab_summary?.match ?? 0), checked: t.checked + (p.lab_summary?.checked ?? 0) }), { match: 0, checked: 0 })
}
