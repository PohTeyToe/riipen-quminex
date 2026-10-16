import { memo, useEffect, useRef } from 'react'
import { fields } from '../data/core'
import { claim, valueText } from '../data/run'
import { sessionById } from '../data/timeline'
import { useInspect, type View } from '../inspect'
import { useMedia } from '../lib/hooks'
import { sessionLabel } from './RunChart'
import { BackIcon } from './bits'
import { CloseIcon } from './Icons'
import { ClaimView } from './views/ClaimView'
import { FieldView } from './views/FieldView'
import { HoleView } from './views/HoleView'
import { SessionView } from './views/SessionView'
import { StageView } from './views/StageView'

function label(v: View): string {
  if (v.kind === 'field') return fields.find((f) => f.id === v.id)?.name ?? 'Field'
  if (v.kind === 'claim') {
    const c = claim(v.id)
    const t = c ? valueText(c) : 'Claim'
    return t.length > 28 ? `${t.slice(0, 27)}…` : t
  }
  if (v.kind === 'session') {
    const s = sessionById(v.id)
    return s ? `${sessionLabel(s)} session` : 'Session'
  }
  if (v.kind === 'hole') return v.id
  return { sessions: 'Reader sessions', checker: 'Quote checker', tables: 'Drill tables', summary: 'Summary', eval: 'Eval' }[v.id]
}

const KIND: Record<View['kind'], string> = { field: 'Field', claim: 'Value and its page', session: 'Session', stage: 'Step', hole: 'Drill hole' }

function render(v: View) {
  switch (v.kind) {
    case 'field':
      return <FieldView id={v.id} />
    case 'claim':
      return <ClaimView id={v.id} />
    case 'session':
      return <SessionView id={v.id} call={v.call} />
    case 'stage':
      return <StageView id={v.id} />
    case 'hole':
      return <HoleView id={v.id} claim={v.claim} />
  }
}

/** One thing at a time, with a way back. A right-hand column on wide screens, a sheet from the bottom on narrow ones. */
// memo: the run page re-renders every frame of a replay, and an open core tray has thousands of marks.
export const Inspector = memo(function Inspector({ empty, hideEmpty }: { empty?: string; hideEmpty?: boolean }) {
  const { stack, top, back, close } = useInspect()
  const body = useRef<HTMLDivElement>(null)
  const narrow = useMedia('(max-width: 899px)')
  const key = top ? JSON.stringify(top) : 'empty'
  const prevKind = useRef<string | null>(null)
  useEffect(() => {
    // a new subject starts at its top; picking another call in the same session keeps the list where it is
    const kind = top ? `${top.kind}:${'id' in top ? top.id : ''}` : null
    if (kind !== prevKind.current) body.current?.scrollTo({ top: 0 })
    prevKind.current = kind
  }, [key, top])
  useEffect(() => {
    if (!narrow || !top) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [narrow, top, close])
  if ((narrow || hideEmpty) && !top) return null
  return (
    <aside className={`inspector${narrow ? ' is-sheet' : ''}`} aria-label="Inspector">
      <div className="insp-bar">
        {stack.length > 1 ? (
          <button type="button" className="insp-back" onClick={back}>
            <BackIcon />
            {label(stack[stack.length - 2])}
          </button>
        ) : (
          <span className="insp-kicker">{top ? KIND[top.kind] : 'Inspector'}</span>
        )}
        {(narrow || top) && (
          <button type="button" className="insp-close" onClick={close} aria-label="Close the inspector">
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="insp-body" ref={body}>
        {top ? <div key={key}>{render(top)}</div> : empty && <p className="hint insp-empty">{empty}</p>}
      </div>
    </aside>
  )
})
