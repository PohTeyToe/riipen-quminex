// The reports' drill tables (data/drill.json, from agent/build_drill.py): 26 collars and every lab sample, as
// the lab wrote them. Parsing here is pure, so the core strips and their tests read the same numbers.

export type RawSample = [string, string, string, number, ...(string | null)[]]

export interface HoleRow {
  hole: string
  marked: boolean
  year: number
  easting: string
  northing: string
  elevation: string | null
  azimuth: string
  dip: string
  depth_m: string
  aris: number
  page: number
  samples: RawSample[]
  sample_pages: number[]
}

export interface LabCheck {
  ok: boolean
  from_m: string
  to_m: string
  boundaries: boolean
  line: string | null
  width_off: boolean
  samples: string[]
  grades: { what: string; written: string; agree: boolean; lab: string }[]
}

export interface DrillFile {
  note: string
  grades: string[]
  holes: HoleRow[]
  lab_checks: Record<string, LabCheck>
  totals: { holes: number; samples: number }
}

export interface Grade {
  /** In the element's display unit: ppm for Cu and Ni, ppb for Au, Pt, Pd. */
  value: number
  /** Below the lab's detection limit; value is the limit. */
  below: boolean
  written: string
}

export interface Sample {
  from: number
  to: number
  id: string
  page: number
  cu: Grade | null
  ni: Grade | null
  au: Grade | null
  pt: Grade | null
  pd: Grade | null
}

/** "<2" to {value 2, below}; "0.326%" (the lab's % column) to ppm; null or unreadable to null. */
export function parseGrade(raw: string | null | undefined): Grade | null {
  if (raw == null) return null
  const s = raw.trim()
  const below = s.startsWith('<')
  const pct = s.endsWith('%')
  const v = Number.parseFloat(s.replace(/^[<>]/, '').replace(/%$/, '').replace(/,/g, ''))
  if (Number.isNaN(v)) return null
  return { value: pct ? v * 10000 : v, below, written: s }
}

export function parseSample(r: RawSample): Sample {
  const [from, to, id, page, cu, ni, au, pt, pd] = r
  return {
    from: Number(from),
    to: Number(to),
    id,
    page,
    cu: parseGrade(cu as string | null),
    ni: parseGrade(ni as string | null),
    au: parseGrade(au as string | null),
    pt: parseGrade(pt as string | null),
    pd: parseGrade(pd as string | null),
  }
}

export interface Hole {
  id: string
  /** Match key: IL-22-20, IL-22-020 and "IL-22-\n011" compare by their parts, as checker.hole_key does. */
  key: string
  year: number
  easting: number
  northing: number
  azimuth: number
  dip: number
  depth: number
  aris: number
  page: number
  samples: Sample[]
  samplePages: number[]
}

export function holeKey(hole: string): string {
  return (hole.toLowerCase().match(/[a-z]+|\d+/g) ?? []).map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p)).join('-')
}

export function toHoles(file: DrillFile): Hole[] {
  return file.holes.map((h) => ({
    id: h.hole,
    key: holeKey(h.hole),
    year: h.year,
    easting: Number(h.easting),
    northing: Number(h.northing),
    azimuth: Number(h.azimuth),
    dip: Number(h.dip),
    depth: Number(h.depth_m),
    aris: h.aris,
    page: h.page,
    samples: h.samples.map(parseSample),
    samplePages: h.sample_pages,
  }))
}

export interface Drill {
  holes: Hole[]
  byKey: Map<string, Hole>
  labChecks: Record<string, LabCheck>
  samples: number
}

let cache: Promise<Drill> | null = null

/** The tables load on first use: only the drilling views draw them. */
export function loadDrill(): Promise<Drill> {
  cache ??= import('../../data/drill.json').then((m) => {
    const file = m.default as unknown as DrillFile
    const holes = toHoles(file)
    return { holes, byKey: new Map(holes.map((h) => [h.key, h])), labChecks: file.lab_checks, samples: file.totals.samples }
  })
  return cache
}
