import { describe, expect, test } from 'vitest'
import drillJson from '../../data/drill.json'
import { fields } from './core'
import { claims, rejected } from './run'
import { holeKey, parseGrade, toHoles, type DrillFile } from './drill'
import { intervalsOf, gradeLabel, gradeWritten } from './intervals'
import pageMapsJson from '../../data/page_maps.json'
import type { PageMaps } from './pageMaps'
import { markPieces } from '../components/views/ClaimView'
import { callLine } from './describe'
import { rank } from '../components/views/HoleView'

const file = drillJson as unknown as DrillFile
const holes = toHoles(file)
const byKey = new Map(holes.map((h) => [h.key, h]))

describe("the reports' drill tables", () => {
  test('26 collars: 23 from the 2022 table, 3 from the 2023 table', () => {
    expect(holes.filter((h) => h.year === 2022)).toHaveLength(23)
    expect(holes.filter((h) => h.year === 2023)).toHaveLength(3)
    // the collars the location rule used are the same holes at the same places
    const loc = fields.find((f) => f.id === 'location')!.settled_by!.collars!
    for (const c of loc) {
      const h = byKey.get(holeKey(c.hole))!
      expect([h.easting, h.northing, h.depth]).toEqual([Number(c.easting), Number(c.northing), Number(c.depth_m)])
    }
  })

  test('samples run down each hole without overlap, and none past its depth', () => {
    for (const h of holes) {
      h.samples.forEach((s, i) => {
        expect(s.to).toBeGreaterThan(s.from)
        if (i) expect(s.from).toBeGreaterThanOrEqual(h.samples[i - 1].to - 1e-6)
      })
      expect(h.samples[h.samples.length - 1].to).toBeLessThanOrEqual(h.depth + 0.01)
    }
  })

  test("IL-22-20's lab sample B1118002 is 3,260 ppm copper over 209.50 to 211.00 m", () => {
    const s = byKey.get(holeKey('IL-22-20'))!.samples.find((x) => x.id === 'B1118002')!
    expect([s.from, s.to, s.cu?.value]).toEqual([209.5, 211, 3260])
  })

  test('grades as written: below detection keeps its limit, the % column becomes ppm', () => {
    expect(parseGrade('<2')).toEqual({ value: 2, below: true, written: '<2' })
    expect(parseGrade('0.326%')?.value).toBeCloseTo(3260, 6)
    expect(parseGrade(null)).toBeNull()
    expect(holeKey('IL-22-20')).toBe(holeKey('IL-22-020'))
    expect(holeKey('IL-23-25')).toBe(holeKey('IL-23-025'))
  })
})

describe('lab checks on the intervals the agent copied', () => {
  const rows = fields.flatMap(intervalsOf)
  const checks = file.lab_checks

  test("give the same counts as the file's own lab summary", () => {
    for (const f of fields) {
      for (const p of f.parts ?? []) {
        if (!p.lab_summary) continue
        const mine = intervalsOf(f).filter((r) => checks[r.claim.id])
        expect(mine).toHaveLength(p.lab_summary.checked)
        expect(mine.filter((r) => checks[r.claim.id].ok)).toHaveLength(p.lab_summary.match)
        for (const d of p.lab_summary.differ) expect(checks[d.claim]?.ok).toBe(false)
      }
    }
  })

  test("IL-22-20: the table's 0.02% copper against its lab's 0.326%, and a width its depths don't give", () => {
    const r = rows.find((x) => holeKey(x.value.hole) === holeKey('IL-22-20'))!
    expect(gradeWritten(r.value, 'cu')).toBe('0.02%')
    const c = checks[r.claim.id]
    expect(c.grades.find((g) => g.what === 'Cu')).toMatchObject({ written: '0.02%', lab: '0.326%', agree: false })
    expect(c.width_off).toBe(true)
  })

  test('an interval list names the element it prints, so a nickel view never shows copper unlabelled', () => {
    const r = rows.find((x) => holeKey(x.value.hole) === holeKey('IL-22-20'))!
    expect(gradeLabel(r.value, 'cu')).toBe('Cu 0.02%')
    expect(gradeLabel(r.value, 'ni')).toBe('Ni 0.001%')
    // the one row that spells the elements out still finds both
    const spelled = rows.find((x) => Object.keys(x.value.grades ?? {}).some((k) => /^copper/i.test(k)))
    if (spelled) {
      expect(gradeLabel(spelled.value, 'cu')).toMatch(/^Cu /)
      expect(gradeLabel(spelled.value, 'ni')).toMatch(/^Ni /)
    }
  })

  test('the hole view leads with copper mismatches', () => {
    const d = { holes, byKey, labChecks: checks, samples: file.totals.samples }
    const first = [...rows.filter((r) => r.fieldId === 'drilling_2022')].sort((a, b) => rank(a, d) - rank(b, d))[0]
    expect(holeKey(first.value.hole)).not.toBe(holeKey('IL-22-006'))
    expect(checks[first.claim.id].ok).toBe(false)
  })
})

describe('page maps', () => {
  const maps = pageMapsJson as unknown as PageMaps

  test('every kept claim is placed on its own cited page', () => {
    for (const c of claims) {
      const p = maps.claims[c.id]
      expect(p, c.id).toBeDefined()
      expect(p.page).toBe(`${c.source.aris}:${c.source.page}`)
      expect(p.quote.length).toBeGreaterThan(0)
    }
  })

  test('every box sits on its page, and a value sits on a quote line', () => {
    for (const c of claims) {
      const p = maps.claims[c.id]
      const pg = maps.pages[p.page]
      for (const [x, y, w, h] of [...p.quote, ...p.value, ...pg.lines]) {
        expect(x).toBeGreaterThanOrEqual(-1)
        expect(y).toBeGreaterThanOrEqual(-1)
        expect(x + w).toBeLessThanOrEqual(pg.w + 1)
        expect(y + h).toBeLessThanOrEqual(pg.h + 1)
      }
      for (const [, vy, , vh] of p.value) expect(p.quote.some(([, qy, , qh]) => vy >= qy - 0.2 && vy + vh <= qy + qh + 0.2)).toBe(true)
    }
  })

  test('ships geometry only: no text on any page', () => {
    for (const pg of Object.values(maps.pages)) expect(Object.keys(pg).sort()).toEqual(['h', 'lines', 'w'])
  })
})

describe('the quote with its value marked', () => {
  test('marks each piece once, in order', () => {
    const out = markPieces('IL-22-20 209.50 211.00 2.50 0.02 0.001 13', ['IL-22-20', '209.50', '211.00', '2.50', '0.02'])
    const bold = out.filter((x) => typeof x === 'object').length
    expect(bold).toBe(5)
  })
})

describe('a call in plain words', () => {
  test('a thrown-out claim says why', () => {
    const r = rejected[0]
    const line = callLine(r.session, r.call_index)!
    expect(line.code).toBe('x')
    expect(line.verdict).toBe('thrown out')
    expect(line.text.length).toBeGreaterThan(0)
  })

  test("a refusal carries the agent's reason", () => {
    const line = callLine('field-resource_estimate', 9)!
    expect(line.verdict).toBe('Not in these sources')
    expect(line.text).toContain('Kevitsa')
  })
})
