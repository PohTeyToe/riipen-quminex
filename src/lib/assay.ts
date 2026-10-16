// A grade as a report writes it, as the range its rounding allows. The hole view marks the report's figure on
// the lab's scale with it. The lab checks themselves come from agent/rules.py (data/drill.json lab_checks).

/** Grades are held as % so ppm, ppb and % compare directly. */
const TO_PCT: Record<string, number> = { '%': 1, ppm: 1e-4, 'g/t': 1e-4, ppb: 1e-7 }

export interface Range {
  lo: number
  hi: number
}

function decimals(s: string): number {
  const m = /\.(\d+)/.exec(s)
  return m ? m[1].length : 0
}

/** "0.002%", "6 ppm", "1,002 ppm", "<10 ppb" to the range its rounding allows, in %. */
export function writtenRange(written: string): Range | null {
  const m = /^\s*(<)?\s*([\d,]*\.?\d+)\s*(%|ppm|ppb|g\/t)?/.exec(written)
  if (!m) return null
  const f = TO_PCT[m[3] ?? '%']
  const v = Number.parseFloat(m[2].replace(/,/g, ''))
  if (m[1]) return { lo: 0, hi: v * f }
  const half = 0.5 * 10 ** -decimals(m[2])
  return { lo: (v - half) * f, hi: (v + half) * f }
}
