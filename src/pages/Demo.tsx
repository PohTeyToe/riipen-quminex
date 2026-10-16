import { InspectProvider, type View } from '../inspect'
import { fields } from '../data/core'
import { claim } from '../data/run'
import RunPage from './Run'
import EvalPage from './Eval'

const FIELD_IDS = new Set(fields.map((f) => f.id))

/** What the inspector opens on: a claim in the URL (?claim=c-0337), else the field in the hash, else (on a wide
 * screen) the location catch. */
function initialViews(path: string): View[] {
  const c = claim(new URLSearchParams(window.location.search).get('claim') ?? '')
  if (c) {
    const f = fields.find((x) => x.id === c.field || x.parts?.some((p) => p.id === c.field))
    return [...(f && path !== '/demo/eval' ? [{ kind: 'field', id: f.id } as View] : []), { kind: 'claim', id: c.id }]
  }
  if (path === '/demo/eval') return []
  const hash = window.location.hash.slice(1)
  if (FIELD_IDS.has(hash)) return [{ kind: 'field', id: hash }]
  return window.matchMedia('(min-width: 900px)').matches ? [{ kind: 'field', id: 'location' }] : []
}

export default function Demo({ path }: { path: string }) {
  const evalPage = path === '/demo/eval'
  return (
    <InspectProvider key={evalPage ? 'eval' : 'run'} initial={initialViews(path)}>
      {evalPage ? <EvalPage /> : <RunPage />}
    </InspectProvider>
  )
}
