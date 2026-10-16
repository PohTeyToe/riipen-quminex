import { useEffect, useRef } from 'react'
import { callLine } from '../data/describe'
import { feedCountAt, feedEvents, type FeedEvent } from '../data/feed'
import { WALL, clockTenths, latestCall, type Session } from '../data/timeline'
import { sessionLabel, type ChartPick } from './RunChart'

// Under the chart, what the agent was doing at the playhead: the latest call any worker made, and the log of
// the checker's throw-outs (each with the retry that fixed it) and the agent's refusals.

const lane = (s: Session) => `${s.kind === 'field' ? 'F' : 'E'}${s.lane + 1}`

function Fix({ e, t, onPick }: { e: FeedEvent; t: number; onPick: (p: ChartPick) => void }) {
  if (e.code === 'r') return <span className="fl-end" />
  if (!e.fix) return <span className="fl-end is-muted">Not retried</span>
  if (e.fix.t > t) return <span className="fl-end is-wait">Retrying…</span>
  return (
    <button type="button" className="fl-end fl-fix" onClick={() => onPick({ session: e.session.id, call: e.fix!.i })}>
      Fixed {(e.fix.t - e.t).toFixed(1)} s later
    </button>
  )
}

export function RunFeed({ t, playing, speed, onPick }: { t: number; playing: boolean; speed: number; onPick: (p: ChartPick) => void }) {
  // While playing, the latest-call line samples the playhead five times a second, so it can be read.
  const q = speed * 0.2
  const shownT = playing ? Math.floor(t / q) * q : t
  const now = latestCall(Math.min(shownT, WALL))
  const nowLine = now ? callLine(now.session.id, now.i) : null
  const n = feedCountAt(t)
  const log = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [n])

  return (
    <div className="feed" role="group" aria-label="What the agent was doing at the playhead">
      <p className="feed-h">Checker</p>
      <ol className="feed-log" ref={log}>
        {n === 0 && <li className="fl is-empty">Throw-outs and refusals appear here</li>}
        {feedEvents.slice(0, n).map((e) => {
          const line = callLine(e.session.id, e.i)
          return (
            <li key={`${e.session.id}#${e.i}`} className={`fl k-${e.code}`}>
              <button type="button" className="fl-main" onClick={() => onPick({ session: e.session.id, call: e.i })}>
                <span className="fl-t mono">{clockTenths(e.t)}</span>
                <span className="fl-lane mono">{lane(e.session)}</span>
                <span className="fl-who">{sessionLabel(e.session)}</span>
                <b className="fl-verdict">{e.code === 'x' ? 'Thrown out' : 'Refused'}</b>
                <span className="fl-text">{e.code === 'x' ? e.out?.reason ?? line?.text : line?.text}</span>
              </button>
              <Fix e={e} t={t} onPick={onPick} />
            </li>
          )
        })}
      </ol>
      <p className="feed-h">{playing ? 'Now' : 'Latest'}</p>
      {now && nowLine ? (
        <button type="button" className={`fl fl-now k-${now.c}`} onClick={() => onPick({ session: now.session.id, call: now.i })}>
          <span className="fl-t mono">{clockTenths(now.t)}</span>
          <span className="fl-lane mono">{lane(now.session)}</span>
          <span className="fl-who">{sessionLabel(now.session)}</span>
          <span className="fl-tool mono">{nowLine.tool}</span>
          <span className="fl-text">
            {nowLine.verdict && nowLine.code !== 'r' ? <b>{nowLine.verdict}</b> : null} {nowLine.text}
          </span>
        </button>
      ) : (
        <p className="fl fl-now is-empty">Waiting for the first call</p>
      )}
    </div>
  )
}
