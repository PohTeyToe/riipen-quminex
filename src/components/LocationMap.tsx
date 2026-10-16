import { useEffect, useMemo, useRef, useState } from 'react'
import type { Field } from '../data/types'
import { kmBetween, projector, utmToLatLon, type LatLon } from '../lib/geo'
import { useElementWidth, usePrefersReducedMotion } from '../lib/hooks'
import { useInspect } from '../inspect'

// Where each side of the location disagreement puts Iron Lake, drawn from the run's points, and the 26 drill
// collars from the reports' own collar tables that settle it. The maths runs here on the shipped numbers.

type Extent = 'all' | 'drill'
interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

function fit(pts: { x: number; y: number }[], pad: number): Box {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad }
}

const ease = (k: number) => 1 - (1 - k) ** 4

interface Spot extends LatLon {
  side: number
  claims: string[]
  written: string
}

export function LocationMap({ f, zone = 10 }: { f: Field; zone?: number }) {
  const { open } = useInspect()
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const reduced = usePrefersReducedMotion()
  const [extent, setExtent] = useState<Extent>('all')
  const groups = f.groups ?? []
  const backed = f.settled_by?.side
  const collarRows = f.settled_by?.collars ?? []

  const m = useMemo(() => {
    const collars = collarRows.map((c) => ({ ...c, ...utmToLatLon(zone, Number(c.easting), Number(c.northing)) }))
    const spots: Spot[] = []
    groups.forEach((g, side) => {
      for (const p of g.points ?? []) {
        const s = spots.find((x) => x.side === side && Math.abs(x.lat - p.lat) < 1e-4 && Math.abs(x.lon - p.lon) < 1e-4)
        if (s) s.claims.push(p.claim)
        else spots.push({ lat: p.lat, lon: p.lon, side, claims: [p.claim], written: p.written })
      }
    })
    const all = [...spots, ...collars]
    const centre = { lat: all.reduce((n, p) => n + p.lat, 0) / all.length, lon: all.reduce((n, p) => n + p.lon, 0) / all.length }
    const proj = projector(centre)
    let pair: [LatLon, LatLon] | null = null
    let best = Infinity
    if (groups.length === 2)
      for (const a of groups[0].points ?? [])
        for (const b of groups[1].points ?? []) {
          const d = kmBetween(a, b)
          if (d < best) {
            best = d
            pair = [a, b]
          }
        }
    const drillPts = [...collars, ...spots.filter((s) => s.side === backed)].map(proj.to)
    return { collars, spots, proj, pair, km: best, boxes: { all: fit(all.map(proj.to), 6), drill: fit(drillPts, 0.7) } as Record<Extent, Box> }
  }, [groups, collarRows, backed, zone])

  const [box, setBox] = useState<Box>(m.boxes.all)
  const from = useRef(box)
  useEffect(() => {
    const target = m.boxes[extent]
    if (reduced) {
      from.current = target
      setBox(target)
      return
    }
    const a = from.current
    const start = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 380)
      const e = ease(k)
      const b = { x0: a.x0 + (target.x0 - a.x0) * e, y0: a.y0 + (target.y0 - a.y0) * e, x1: a.x1 + (target.x1 - a.x1) * e, y1: a.y1 + (target.y1 - a.y1) * e }
      from.current = b
      setBox(b)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [extent, m, reduced])

  const W = Math.max(width, 1)
  const H = extent === 'all' ? Math.round(Math.min(220, Math.max(170, W * 0.45))) : Math.round(Math.min(300, Math.max(220, W * 0.7)))
  const bw = box.x1 - box.x0
  const bh = box.y1 - box.y0
  const s = Math.min(W / bw, H / bh)
  const ox = (W - bw * s) / 2 - box.x0 * s
  const oy = (H - bh * s) / 2 - box.y0 * s
  const at = (p: LatLon) => {
    const q = m.proj.to(p)
    return { x: q.x * s + ox, y: q.y * s + oy }
  }
  const target = W / 5 / s
  const bar = [0.5, 1, 2, 5, 10, 20].reduce((b, v) => (Math.abs(v - target) < Math.abs(b - target) ? v : b), 1)

  return (
    <figure className="map">
      <div className="map-bar">
        <div className="seg" role="group" aria-label="Map extent">
          <button type="button" aria-pressed={extent === 'all'} onClick={() => setExtent('all')}>
            Both sides
          </button>
          <button type="button" aria-pressed={extent === 'drill'} onClick={() => setExtent('drill')}>
            Drill area
          </button>
        </div>
        <span className="map-legend">
          <i className="lg lg-claim" aria-hidden="true" />
          claim
          <i className="lg lg-collar" aria-hidden="true" />
          collar
        </span>
      </div>
      <div className="map-frame" ref={wrap}>
        {width > 0 && (
          <svg width={W} height={H} role="group" aria-label="Map: where each side puts Iron Lake, and the drill collars">
            {m.pair && (
              <g className="map-gap">
                <line x1={at(m.pair[0]).x} y1={at(m.pair[0]).y} x2={at(m.pair[1]).x} y2={at(m.pair[1]).y} />
                {extent === 'all' && (
                  <text x={(at(m.pair[0]).x + at(m.pair[1]).x) / 2} y={(at(m.pair[0]).y + at(m.pair[1]).y) / 2 - 8} textAnchor="middle">
                    {m.km.toFixed(1)} km
                  </text>
                )}
              </g>
            )}
            {m.collars.map((c) => {
              const p = at(c)
              return (
                <rect
                  key={c.hole}
                  x={p.x - 3.5}
                  y={p.y - 3.5}
                  width={7}
                  height={7}
                  className="collar"
                  tabIndex={0}
                  role="button"
                  aria-label={`Collar ${c.hole}, open its core log`}
                  onClick={() => open({ kind: 'hole', id: c.hole })}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open({ kind: 'hole', id: c.hole }))}
                >
                  <title>{c.hole}</title>
                </rect>
              )
            })}
            {m.spots.map((sp, i) => {
              const p = at(sp)
              const lone = backed !== undefined && sp.side !== backed
              return (
                <g
                  key={i}
                  className={`spot${lone ? ' is-lone' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${sp.written}, ${sp.claims.length} ${sp.claims.length === 1 ? 'claim' : 'claims'}. Open the quote.`}
                  onClick={() => open({ kind: 'claim', id: sp.claims[0] })}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open({ kind: 'claim', id: sp.claims[0] }))}
                >
                  <circle cx={p.x} cy={p.y} r={14} className="spot-hit" />
                  <circle cx={p.x} cy={p.y} r={lone ? 7 : 5.5} />
                  {lone && (
                    <text x={p.x < 36 ? p.x - 8 : p.x} y={p.y - 13} textAnchor={p.x < 36 ? 'start' : 'middle'} className="spot-label">
                      {groups[sp.side].sources[0] ? `${groups[sp.side].sources[0].aris} p${groups[sp.side].sources[0].page}` : ''}
                    </text>
                  )}
                  <title>{sp.written}</title>
                </g>
              )
            })}
            {backed !== undefined && m.collars.length > 0 && (() => {
              const c = at(m.collars.reduce((a, b) => ({ lat: a.lat + b.lat / m.collars.length, lon: a.lon + b.lon / m.collars.length }), { lat: 0, lon: 0 }))
              return (
                <text x={Math.min(c.x + 10, W - 8)} y={c.y + 28} textAnchor="end" className="spot-label is-quiet">
                  {groups[backed].source_count} pages · {m.collars.length} collars
                </text>
              )
            })()}
            <g className="scale" transform={`translate(${12},${H - 14})`}>
              <line x1={0} x2={bar * s} y1={0} y2={0} />
              <line x1={0} x2={0} y1={-4} y2={0} />
              <line x1={bar * s} x2={bar * s} y1={-4} y2={0} />
              <text x={bar * s + 6} y={4}>
                {bar} km
              </text>
            </g>
          </svg>
        )}
      </div>
    </figure>
  )
}
