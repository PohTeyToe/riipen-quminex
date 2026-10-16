// The drill intervals the agent copied from the reports' tables and text, one row per claim, keyed by hole so the
// core strips and the hole log can find them.
import { fields } from './core'
import { claim, isInterval } from './run'
import { holeKey } from './drill'
import type { Claim, Field, Group, IntervalValue } from './types'

export interface IntervalRow {
  claim: Claim
  value: IntervalValue
  key: string
  from: number | null
  to: number | null
  fieldId: string
  group: Group
}

function num(s?: string): number | null {
  if (!s) return null
  const v = Number.parseFloat(s.replace(/,/g, ''))
  return Number.isNaN(v) ? null : v
}

export function intervalsOf(f: Field): IntervalRow[] {
  const out: IntervalRow[] = []
  for (const p of f.parts ?? []) {
    if (p.rule !== 'interval') continue
    for (const g of p.groups) {
      for (const id of g.claims) {
        const c = claim(id)
        if (!c || !isInterval(c.value)) continue
        out.push({ claim: c, value: c.value, key: holeKey(c.value.hole), from: num(c.value.from_m), to: num(c.value.to_m), fieldId: f.id, group: g })
      }
    }
  }
  return out
}

const all = fields.flatMap(intervalsOf)

export function intervalsForHole(key: string): IntervalRow[] {
  return all.filter((r) => r.key === key)
}

const ELEMENT = { cu: /^(cu|copper)\b/i, ni: /^(ni|nickel)\b/i }

/** "0.02%" from an interval's grades: one element's figure as the report wrote it, if it gives one. */
export function gradeWritten(v: IntervalValue, el: 'cu' | 'ni'): string | null {
  const k = Object.keys(v.grades ?? {}).find((x) => ELEMENT[el].test(x))
  if (!k) return null
  const unit = /\(([^)]+)\)/.exec(k)?.[1] ?? ''
  const raw = v.grades[k]
  return unit === '%' ? `${raw}%` : `${raw} ${unit}`.trim()
}

/** "Cu 0.02%": the figure with its element, for lists that sit beside a Cu/Ni switch. */
export function gradeLabel(v: IntervalValue, el: 'cu' | 'ni'): string {
  const w = gradeWritten(v, el)
  return w ? `${el === 'cu' ? 'Cu' : 'Ni'} ${w}` : ''
}
