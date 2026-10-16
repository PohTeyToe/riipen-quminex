import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, Link } from './router'
import { Shell } from './components/Layout'
import Demo from './pages/Demo'

// The run page is the front door, so it and the run's data (its own chunk, see vite.config.ts) start loading
// with the HTML instead of after the app's code. The brief shows no claims and loads on its own.
const Brief = lazy(() => import('./pages/Brief').catch(() => ({ default: BriefMissing })))

const RELOAD_KEY = 'brief-reload'

/** The brief's chunk didn't load: usually a deploy since this tab opened removed it. Reload onto the new build,
 * but only once the brief is on screen (the visitor may have gone back to the run meanwhile), and once per build,
 * so a chunk that keeps failing can't loop. */
function BriefMissing() {
  // storage blocked or full: no way to mark the try, so no reload (it could loop)
  const [tried, setTried] = useState(() => {
    try {
      return sessionStorage.getItem(RELOAD_KEY) === import.meta.url
    } catch {
      return true
    }
  })
  useEffect(() => {
    if (tried) return
    try {
      sessionStorage.setItem(RELOAD_KEY, import.meta.url)
    } catch {
      setTried(true)
      return
    }
    window.location.reload()
  }, [tried])
  if (!tried) return <div className="loading" aria-busy="true" />
  return (
    <div className="not-found">
      <h1>The brief didn't load</h1>
      <p>Reload the page to try again.</p>
    </div>
  )
}

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
