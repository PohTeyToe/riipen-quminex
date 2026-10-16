import { useCallback, useEffect, useState } from 'react'

// Where a report's table and its own lab disagree, code shows both and stops. The person reading picks which
// figure the file carries. The pick is the viewer's own and stays in this browser.

export type Call = 'table' | 'lab'
const KEY = 'iron-lake-calls-v1'
const EVENT = 'iron-lake-calls'

function read(): Record<string, Call> {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function write(v: Record<string, Call>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // private window or blocked storage: the pick still holds until the page reloads
  }
  memory = v
  window.dispatchEvent(new Event(EVENT))
}

let memory: Record<string, Call> | null = null

export function useCalls() {
  const [calls, setCalls] = useState<Record<string, Call>>(() => memory ?? (memory = read()))
  useEffect(() => {
    const sync = () => setCalls({ ...(memory ?? read()) })
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  const set = useCallback((claimId: string, c: Call | null) => {
    const next = { ...(memory ?? read()) }
    if (c) next[claimId] = c
    else delete next[claimId]
    write(next)
  }, [])
  return { calls, set }
}
