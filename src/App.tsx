import { lazy, Suspense, useEffect } from 'react'
import { useLocation, Link } from './router'
import { Shell } from './components/Layout'

// The run page and the eval share the run's claims, traces and excerpts, so they load as one chunk. The brief
// shows no claims, so it loads without them.
const Demo = lazy(() => import('./pages/Demo'))
const Brief = lazy(() => import('./pages/Brief'))

const NAME = 'Iron Lake property file'
const TITLES: Record<string, string> = {
  '/': NAME,
  '/demo': NAME,
  '/demo/eval': `Eval · ${NAME}`,
  '/demo/brief': `Brief · ${NAME}`,
}

function NotFound() {
  return (
    <div className="not-found">
      <h1>Nothing at this address</h1>
      <p>
        <Link to="/" className="text-link">
          Open the run
        </Link>
      </p>
    </div>
  )
}

export default function App() {
  const { path } = useLocation()
  useEffect(() => {
    document.title = TITLES[path] ?? `Page not found · ${NAME}`
  }, [path])

  let page
  if (path === '/demo/brief') page = <Brief />
  else if (path === '/' || path === '/demo' || path === '/demo/eval') page = <Demo path={path} />
  else page = <NotFound />

  return (
    <Shell>
      <Suspense fallback={<div className="loading" aria-busy="true" />}>{page}</Suspense>
    </Shell>
  )
}
