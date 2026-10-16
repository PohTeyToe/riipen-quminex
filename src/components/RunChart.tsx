import { memo, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { WALL, clock, matches, sessions, type Code, type Filter, type Session } from '../data/timeline'
import { useElementWidth } from '../lib/hooks'
import { callLine, shorten } from '../data/describe'
import { feedEvents } from '../data/feed'

// The run as it happened: eight worker lanes, every session a bar at its logged start and end, every tool call
// a tick at its logged time. Ticks are drawn as one path per kind, so 1,045 calls cost five DOM nodes.

export const SHORT: Record<string, string> = {
  location: 'Location',
  map_sheet: 'Map sheet',
  mining_division: 'Mining div.',
  access: 'Access',
  commodities: 'Commodities',
  geological_setting: 'Geological setting',
  mineralization: 'Mineralization',
  geophysical_surveys: 'Geophysical surveys',
  drilling_2022: '2022 drilling',
  drilling_2023: '2023 drilling',
  recommended_next_work: 'Next work',
  resource_estimate: 'Resource est.',
}

export function sessionLabel(s: Session): string {
  return s.kind === 'field' ? SHORT[s.ref] ?? s.ref : s.ref.toUpperCase()
}

interface Geo {
  W: number
  H: number
  left: number
  right: number
  laneH: number
  laneY: (s: Pick<Session, 'kind' | 'lane'>) => number
  x: (t: number) => number
  tAt: (x: number) => number
  axisY: number
  compact: boolean
}

const GAP = 3
const GROUP_GAP = 14
const AXIS = 22

function geometry(width: number): Geo {
  const compact = width < 640
  const W = Math.max(width, 280)
  const left = compact ? 26 : 70
  const right = 6
  const laneH = compact ? 17 : 27
  const laneY = (s: Pick<Session, 'kind' | 'lane'>) => (s.kind === 'field' ? 0 : 4 * (laneH + GAP) + GROUP_GAP) + s.lane * (laneH + GAP)
  const axisY = 8 * (laneH + GAP) + GROUP_GAP + 4
  const span = W - left - right
  return {
    W,
    H: axisY + AXIS,
    left,
    right,
    laneH,
    laneY,
    x: (t: number) => left + (t / WALL) * span,
    tAt: (x: number) => ((x - left) / span) * WALL,
    axisY,
    compact,
  }
}

const KINDS: Code[] = ['s', 'o', 'p', 'x', 'r']

/** One path per kind of call: read ticks short, kept claims taller, thrown-out claims full height. */
const Ticks = memo(function Ticks({ g, filter }: { g: Geo; filter: Filter | null }) {
  const d = useMemo(() => {
    const out: Record<string, string> = { s: '', o: '', p: '', x: '', r: '' }
    for (const s of sessions) {
      // on a wide chart the bar's top carries its label, so ticks keep to the lower part
      const top = g.laneY(s) + (g.compact ? 2 : 12)
      const bottom = g.laneY(s) + g.laneH - 3
      const h = bottom - top
      for (const [t, c] of s.calls) {
        const x = Math.round(g.x(t) * 2) / 2
        if (c === 's' || c === 'o') out[c] += `M${x} ${bottom}V${bottom - h * 0.36}`
        else if (c === 'p') out.p += `M${x} ${bottom}V${bottom - h * 0.7}`
        else if (c === 'x') out.x += `M${x} ${bottom}V${top}`
        else if (c === 'r') out.r += `M${x + 3.5} ${top + h / 2}a3.5 3.5 0 1 0 -7 0a3.5 3.5 0 1 0 7 0`
      }
    }
    return out
  }, [g])
  return (
    <g className="ticks">
      {KINDS.map((k) => (
        <path key={k} d={d[k]} className={`tick t-${k}`} opacity={matches(k, filter) ? 1 : 0.14} />
      ))}
    </g>
  )
})

export interface ChartPick {
  session: string
  call?: number
}

export function RunChart({
  t,
  filter,
  selected,
  onPick,
  onSeek,
  pulse = 0,
}: {
  t: number
  filter: Filter | null
  selected: ChartPick | null
  onPick: (p: ChartPick) => void
  onSeek: (t: number) => void
  /** While a replay plays: how many run-seconds a throw-out or refusal keeps its ring. */
  pulse?: number
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const g = useMemo(() => geometry(width), [width])
  const [hover, setHover] = useState<{ s: Session; i: number | null; x: number; y: number } | null>(null)
  const drag = useRef(false)
  const live = t < WALL
  const px = g.x(Math.min(t, WALL))

  function hit(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const s = sessions.find((s) => {
      const top = g.laneY(s)
      return y >= top && y <= top + g.laneH && x >= g.x(s.start) - 3 && x <= g.x(s.end) + 3
    })
    if (!s) return { x, y, s: null, i: null }
    // the label band at the top of a wide bar picks the session, not a call; on a phone-width chart the ticks are
    // too close for a finger, so a tap picks the session unless a filter has thinned them
    if (!g.compact && y < g.laneY(s) + 11) return { x, y, s, i: null }
    if (g.compact && !filter) return { x, y, s, i: null }
    let best: number | null = null
    let bestD = 5
    s.calls.forEach(([ct, c], i) => {
      if (live && ct > t) return
      if (!matches(c, filter)) return
      const d = Math.abs(g.x(ct) - x)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return { x, y, s, i: best }
  }

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (drag.current) {
      const box = e.currentTarget.getBoundingClientRect()
      onSeek(g.tAt(e.clientX - box.left))
      return
    }
    const h = hit(e)
    setHover(h.s ? { s: h.s, i: h.i, x: h.x, y: h.y } : null)
  }

  function onDown(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - box.top
    if (y >= g.axisY - 4) {
      drag.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      onSeek(g.tAt(e.clientX - box.left))
      return
    }
    const h = hit(e)
    if (h.s) onPick({ session: h.s.id, call: h.i ?? undefined })
  }

  function onUp() {
    drag.current = false
  }

  function onSliderKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 30 : 5
    const to = { ArrowRight: t + step, ArrowLeft: t - step, Home: 0, End: WALL, PageUp: t + 60, PageDown: t - 60 }[e.key]
    if (to === undefined) return
    e.preventDefault()
    onSeek(to)
  }

  const sel = selected ? sessions.find((s) => s.id === selected.session) : undefined
  const selCall = sel && selected?.call !== undefined ? sel.calls[selected.call] : undefined
  const minutes = Array.from({ length: Math.floor(WALL / 60) + 1 }, (_, i) => i * 60)

  return (
    <div className="runchart" ref={ref}>
      {width > 0 && (
        <svg
          width={g.W}
          height={g.H}
          viewBox={`0 0 ${g.W} ${g.H}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onDown}
          onPointerUp={onUp}
          role="group"
          aria-label={`Recorded run: ${sessions.length} sessions across eight workers over ${clock(WALL)}. Each session bar is a button.`}
        >
          <defs>
            <clipPath id="played">
              <rect x={0} y={0} width={live ? px : g.W} height={g.H} />
            </clipPath>
          </defs>
          {(['field', 'eval'] as const).map((kind) =>
            [0, 1, 2, 3].map((lane) => {
              const y = g.laneY({ kind, lane })
              return (
                <g key={`${kind}${lane}`}>
                  <rect x={g.left} y={y} width={g.W - g.left - g.right} height={g.laneH} className="lane" rx={3} />
                  <text x={g.left - 8} y={y + g.laneH / 2} className="lane-label" textAnchor="end" dominantBaseline="central">
                    {g.compact ? `${kind === 'field' ? 'F' : 'E'}${lane + 1}` : `${kind === 'field' ? 'Field' : 'Eval'} ${lane + 1}`}
                  </text>
                </g>
              )
            }),
          )}
          {sessions.map((s) => {
            const x0 = g.x(s.start)
            const w = Math.max(2, g.x(s.end) - x0)
            const y = g.laneY(s)
            const label = sessionLabel(s)
            const fits = w > label.length * 5.8 + 10
            const isSel = sel?.id === s.id
            return (
              <g key={s.id}>
                <rect
                  x={x0 + 0.5}
                  y={y + 0.5}
                  width={w - 1}
                  height={g.laneH - 1}
                  rx={3}
                  className={`bar${isSel ? ' is-sel' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${s.kind === 'field' ? 'Field' : 'Eval'} session ${label}, ${clock(s.start)} to ${clock(s.end)}, ${s.calls.length} calls`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onPick({ session: s.id })
                    }
                  }}
                />
                {fits && !g.compact && (
                  <text x={x0 + 6} y={y + 7} className="bar-label">
                    {label}
                  </text>
                )}
              </g>
            )
          })}
          <g clipPath="url(#played)">
            <Ticks g={g} filter={filter} />
          </g>
          {live && <rect x={px} y={0} width={Math.max(0, g.W - g.right - px)} height={g.axisY - 6} className="future" />}
          {pulse > 0 &&
            feedEvents.map((e) => {
              const age = (t - e.t) / pulse
              if (age < 0 || age > 1) return null
              return (
                <circle
                  key={`${e.session.id}#${e.i}`}
                  cx={g.x(e.t)}
                  cy={g.laneY(e.session) + g.laneH / 2}
                  r={4 + age * (g.compact ? 8 : 14)}
                  className={`pulse k-${e.code}`}
                  opacity={1 - age}
                />
              )
            })}
          {selCall && (
            <circle cx={g.x(selCall[0])} cy={g.laneY(sel!) + g.laneH / 2} r={6} className="sel-call" />
          )}
          <g className="axis">
            <line x1={g.left} x2={g.W - g.right} y1={g.axisY} y2={g.axisY} />
            {minutes.map((m) => (
              <g key={m}>
                <line x1={g.x(m)} x2={g.x(m)} y1={g.axisY} y2={g.axisY + 4} />
                {(!g.compact || m % 120 === 0) && (
                  <text x={g.x(m)} y={g.axisY + 15} textAnchor={m === 0 ? 'start' : 'middle'}>
                    {clock(m)}
                  </text>
                )}
              </g>
            ))}
            <text x={g.x(WALL)} y={g.axisY + 15} textAnchor="end" className="axis-end">
              {clock(WALL)}
            </text>
          </g>
          {live && (
            <g className="playhead">
              <line x1={px} x2={px} y1={-2} y2={g.axisY} />
              <circle cx={px} cy={g.axisY} r={4.5} />
            </g>
          )}
        </svg>
      )}
      <div
        className="scrub"
        role="slider"
        tabIndex={0}
        aria-label="Replay position"
        aria-valuemin={0}
        aria-valuemax={Math.round(WALL)}
        aria-valuenow={Math.round(Math.min(t, WALL))}
        aria-valuetext={`${clock(Math.min(t, WALL))} of ${clock(WALL)}`}
        onKeyDown={onSliderKey}
        style={{ left: g.left, width: Math.max(0, g.W - g.left - g.right), top: g.axisY - 8 }}
      />
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(hover.x + 12, Math.max(0, g.W - 280)), top: hover.y + 14 }} aria-hidden="true">
          <p className="tip-head">
            <span className="mono">{sessionLabel(hover.s)}</span>
            <span className="tip-time mono">{hover.i !== null ? clock(hover.s.calls[hover.i][0]) : `${clock(hover.s.start)} to ${clock(hover.s.end)}`}</span>
          </p>
          {hover.i !== null ? <TipCall s={hover.s} i={hover.i} /> : <p className="tip-sub">{hover.s.calls.length} calls. Click for the session.</p>}
        </div>
      )}
    </div>
  )
}

function TipCall({ s, i }: { s: Session; i: number }) {
  const line = callLine(s.id, i)
  if (!line) return null
  return (
    <>
      <p className={`tip-call k-${line.code}`}>
        <span className="mono">{line.tool}</span> {line.verdict && <b>{line.verdict}</b>}
      </p>
      {line.text && <p className="tip-sub mono">{shorten(line.text, 150)}</p>}
    </>
  )
}
