import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

// What the inspector shows, as a stack, so "back" returns to where a click came from: a field, then one of its
// values, then the call that proposed it.

export type StageId = 'sessions' | 'checker' | 'tables' | 'summary' | 'eval'

export type View =
  | { kind: 'field'; id: string }
  | { kind: 'claim'; id: string }
  | { kind: 'session'; id: string; call?: number }
  | { kind: 'stage'; id: StageId }
  | { kind: 'hole'; id: string; claim?: string }

interface Inspect {
  stack: View[]
  top: View | null
  /** Open a view on top of the current one. */
  open: (v: View) => void
  /** Replace the whole stack with one view (a click in the file or the run chart). */
  show: (v: View) => void
  /** Swap the current view for another (picking a different call in the same session). */
  replace: (v: View) => void
  back: () => void
  close: () => void
}

const Ctx = createContext<Inspect | null>(null)

function same(a: View, b: View) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function InspectProvider({ initial = [], children }: { initial?: View[]; children: ReactNode }) {
  const [stack, setStack] = useState<View[]>(initial)
  const open = useCallback((v: View) => setStack((s) => (s.length && same(s[s.length - 1], v) ? s : [...s, v].slice(-12))), [])
  const show = useCallback((v: View) => setStack([v]), [])
  const replace = useCallback((v: View) => setStack((s) => [...s.slice(0, -1), v]), [])
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), [])
  const close = useCallback(() => setStack([]), [])
  const value = useMemo(
    () => ({ stack, top: stack[stack.length - 1] ?? null, open, show, replace, back, close }),
    [stack, open, show, replace, back, close],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useInspect(): Inspect {
  const v = useContext(Ctx)
  if (!v) throw new Error('useInspect outside InspectProvider')
  return v
}

/** Open one tool call: its session, with the call picked, which the run chart rings. */
export function usePickCall() {
  const { open } = useInspect()
  return useCallback(
    (session: string, call: number) => {
      open({ kind: 'session', id: session, call })
      const chart = document.querySelector('.console')
      if (chart && chart.getBoundingClientRect().bottom < 0) chart.scrollIntoView({ block: 'start' })
    },
    [open],
  )
}
