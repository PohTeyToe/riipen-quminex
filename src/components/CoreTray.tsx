import { useState } from 'react'
import type { Hole, LabCheck, Sample } from '../data/drill'
import type { IntervalRow } from '../data/intervals'
import { useElementWidth } from '../lib/hooks'

// The year's drill holes laid out like core in a tray: one strip per hole, depth down, every lab sample a band
// shaded by its copper (or nickel) assay. Beside each strip, the intervals the agent copied from the report, in
// ink when the hole's own lab samples bear them out and red when they don't.

export type Element = 'cu' | 'ni'

const BINS: Record<Element, number[]> = {
  cu: [30, 100, 300, 1000, 3000],
  ni: [300, 1000, 1500, 2000, 3000],
}

export function bin(el: Element, ppm: number): number {
  const edges = BINS[el]
  let i = 0
  while (i < edges.length && ppm >= edges[i]) i++
  return i
}

export function binLabels(el: Element): string[] {
  const e = BINS[el].map((v) => v.toLocaleString('en-CA'))
  return [`<${e[0]}`, ...e.slice(0, -1).map((v, i) => `${v} to ${e[i + 1]}`), `≥${e[e.length - 1]}`]
}

export function gradeOf(s: Sample, el: Element) {
  return el === 'cu' ? s.cu : s.ni
}

export type LabState = 'ok' | 'differ' | 'none'

export function labState(row: IntervalRow, checks: Record<string, LabCheck>): LabState {
  const c = checks[row.claim.id]
  return !c ? 'none' : c.ok ? 'ok' : 'differ'
}

export function Legend({ el }: { el: Element }) {
  return (
    <p className="ramp" aria-label={`${el === 'cu' ? 'Copper' : 'Nickel'} in ppm`}>
      <span className="ramp-name">{el === 'cu' ? 'Cu' : 'Ni'} ppm</span>
      {binLabels(el).map((l, i) => (
        <span key={l} className="ramp-step">
          <i className={`b b${i}`} aria-hidden="true" />
          {l}
        </span>
      ))}
    </p>
  )
}

export function CoreTray({
  holes,
  intervals,
  checks,
  el,
  onPick,
}: {
  holes: Hole[]
  intervals: Map<string, IntervalRow[]>
  checks: Record<string, LabCheck>
  el: Element
  onPick: (hole: Hole) => void
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<string | null>(null)
  const W = Math.max(width, 240)
  const left = 34
  const top = 22
  const H = 250
  const maxDepth = Math.max(...holes.map((h) => h.depth))
  const n = holes.length
  const slot = (W - left - 4) / n
  const sw = Math.min(26, Math.max(6, slot * 0.6))
  const y = (d: number) => top + (d / maxDepth) * H
  const step = maxDepth > 500 ? 200 : 100
  const ticks = Array.from({ length: Math.floor(maxDepth / step) + 1 }, (_, i) => i * step)
  const labelEvery = slot < 13 ? 2 : 1
  return (
    <div className="tray" ref={ref}>
      {width > 0 && (
        <svg width={W} height={top + H + 8} role="group" aria-label={`${n} drill holes, lab ${el === 'cu' ? 'copper' : 'nickel'} by depth`}>
          {ticks.map((d) => (
            <g key={d} className="tray-ax">
              <line x1={left - 4} x2={W} y1={y(d)} y2={y(d)} />
              <text x={left - 7} y={y(d)} textAnchor="end" dominantBaseline="central">
                {d}
              </text>
            </g>
          ))}
          <text x={2} y={10} className="tray-unit">
            m
          </text>
          {holes.map((h, i) => {
            const x = left + i * slot + (slot - sw) / 2 - 3
            const rows = intervals.get(h.key) ?? []
            const on = hover === h.key
            return (
              <g
                key={h.key}
                className={`core${on ? ' is-hover' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={`${h.id}, ${h.depth} m, ${h.samples.length} lab samples, ${rows.length} intervals from the report. Open its log.`}
                onClick={() => onPick(h)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(h))}
                onPointerEnter={() => setHover(h.key)}
                onPointerLeave={() => setHover(null)}
              >
                <rect x={x - 2} y={top - 20} width={sw + 10} height={H + 26} className="core-hit" />
                {i % labelEvery === 0 && (
                  <text x={x + sw / 2} y={top - 8} textAnchor="middle" className="core-id">
                    {Number(h.id.split('-').pop())}
                  </text>
                )}
                <rect x={x} y={y(0)} width={sw} height={y(h.depth) - y(0)} className="core-hole" />
                {h.samples.map((s) => {
                  const g = gradeOf(s, el)
                  if (!g) return null
                  return <rect key={s.id} x={x} y={y(s.from)} width={sw} height={Math.max(0.6, y(s.to) - y(s.from))} className={`b b${bin(el, g.value)}`} />
                })}
                {rows.map((r) => {
                  if (r.from === null || r.to === null) return null
                  const st = labState(r, checks)
                  const y0 = y(r.from)
                  const y1 = Math.max(y0 + 3, y(r.to))
                  return (
                    <path key={r.claim.id} d={`M${x + sw + 2} ${y0}h3V${y1}h-3`} className={`bracket br-${st}`} />
                  )
                })}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
