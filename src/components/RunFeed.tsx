import { memo, useEffect, useRef } from 'react'
import { callLine } from '../data/describe'
import { feedCountAt, feedEvents, type FeedEvent } from '../data/feed'
import { WALL, clockTenths, latestCall, type Session } from '../data/timeline'
import { sessionLabel, type ChartPick } from './RunChart'

// Under the chart, what the agent was doing at the playhead: the latest call any worker made, and the log of
// the checker's throw-outs (each with the retry that fixed it) and the agent's refusals.

const lane = (s: Session) => `${s.kind === 'field' ? 'F' : 'E'}${s.lane + 1}`

type FixState = 'refused' | 'not-retried' | 'retrying' | 'fixed'

function fixState(e: FeedEvent, t: number): FixState {
  if (e.code === 'r') return 'refused'
  if (!e.fix) return 'not-retried'
  return e.fix.t > t ? 'retrying' : 'fixed'
}

function Fix({ e, state, onPick }: { e: FeedEvent; state: FixState; onPick: (p: ChartPick) => void }) {
  if (state === 'refused') return <span className="fl-end" />
  if (state === 'not-retried') return <span className="fl-end is-muted">Not retried</span>
  if (state === 'retrying') return <span className="fl-end is-wait">Retrying…</span>
  return (
    <button type="button" className="fl-end fl-fix" onClick={() => onPick({ session: e.session.id, call: e.fix!.i })}>
      Fixed {(e.fix!.t - e.t).toFixed(1)} s later
    </button>
  )
}

// memo: a replay re-renders the feed every frame; a logged row changes only when its retry lands.
const FeedRow = memo(function FeedRow({ e, fix, onPick }: { e: FeedEvent; fix: FixState; onPick: (p: ChartPick) => void }) {
  const line = callLine(e.session.id, e.i)
  return (
    <li className={`fl k-${e.code}`}>
      <button type="button" className="fl-main" onClick={() => onPick({ session: e.session.id, call: e.i })}>
        <span className="fl-t mono">{clockTenths(e.t)}</span>
        <span className="fl-lane mono">{lane(e.session)}</span>
        <span className="fl-who">{sessionLabel(e.session)}</span>
        <b className="fl-verdict">{e.code === 'x' ? 'Thrown out' : 'Refused'}</b>
        <span className="fl-text">{e.code === 'x' ? e.out?.reason ?? line?.text : line?.text}</span>
      </button>
      <Fix e={e} state={fix} onPick={onPick} />
    </li>
  )
})

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
        {feedEvents.slice(0, n).map((e) => (
          <FeedRow key={`${e.session.id}#${e.i}`} e={e} fix={fixState(e, t)} onPick={onPick} />
        ))}
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
