import { useEffect, useMemo, useRef, useState } from 'react'
import { fields } from '../data/core'
import { claim, sessionSteps } from '../data/run'
import { type Filter } from '../data/timeline'
import { useInspect } from '../inspect'
import { useLocation } from '../router'
import { useReplay } from '../replay'
import { RunConsole } from '../components/RunConsole'
import { FileTable } from '../components/FileTable'
import { Inspector } from '../components/Inspector'
import type { ChartPick } from '../components/RunChart'

const FIELD_IDS = new Set(fields.map((f) => f.id))

/** The run and the file it made, on one screen: the chart and the file share one inspector. */
export default function RunPage() {
  const replay = useReplay()
  const [filter, setFilter] = useState<Filter | null>(null)
  const { top, show, open } = useInspect()
  const { hash } = useLocation()
  const first = useRef(true)

  // A field in the URL (/demo#drilling_2022) opens that field and brings its row into view.
  useEffect(() => {
    if (!FIELD_IDS.has(hash)) return
    show({ kind: 'field', id: hash })
    let tries = 0
    const go = () => {
      const row = document.getElementById(hash)
      if (row) row.scrollIntoView({ block: 'center' })
      else if (tries++ < 10) requestAnimationFrame(go)
    }
    requestAnimationFrame(go)
  }, [hash, show])

  // The open field goes in the URL, so the address bar always links to what's on screen.
  useEffect(() => {
    const initial = first.current
    first.current = false
    if (top?.kind !== 'field' || (initial && !window.location.hash)) return
    if (window.location.hash.slice(1) !== top.id) window.history.replaceState(null, '', `#${top.id}`)
  }, [top])

  // A tick in the chart opens its session with the call picked; a kept claim opens its page on top of that.
  function pick(p: ChartPick) {
    if (p.call === undefined) return show({ kind: 'session', id: p.session })
    show({ kind: 'session', id: p.session, call: p.call })
    const st = sessionSteps(p.session)[p.call]
    if (st?.tool === 'propose_claim' && st.claim) open({ kind: 'claim', id: st.claim })
  }

  const selected: ChartPick | null = useMemo(() => {
    if (!top) return null
    if (top.kind === 'session') return { session: top.id, call: top.call }
    if (top.kind === 'field') return { session: `field-${top.id}` }
    if (top.kind === 'claim') {
      const c = claim(top.id)
      return c ? { session: c.trace.session, call: c.trace.steps[c.trace.steps.length - 1] } : null
    }
    return null
  }, [top])

  return (
    <>
      <h1 className="sr-only">Iron Lake property file: the recorded agent run and the file it made</h1>
      <RunConsole
        replay={replay}
        filter={filter ?? (top?.kind === 'stage' && top.id === 'checker' ? 'x' : null)}
        onFilter={setFilter}
        selected={selected}
        onPick={pick}
      />
      <div className="work">
        <FileTable t={replay.t} fresh={replay.playing ? replay.speed * 1.2 : 0} />
        <Inspector empty="Pick a field, a bar or a tick." />
      </div>
    </>
  )
}
