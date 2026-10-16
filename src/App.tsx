import { lazy, Suspense, useEffect } from 'react'
import { useLocation, Link } from './router'
import { Shell } from './components/Layout'
import Demo from './pages/Demo'

// The run page is the front door, so it and the run's data (its own chunk, see vite.config.ts) start loading
// with the HTML instead of after the app's code. The brief shows no claims and loads on its own.
// A tab opened before a deploy asks for the brief's old chunk, which the deploy removed, and the page can't show
// without it: reload once onto the new build. Keyed to this build, so a chunk that keeps failing can't loop.
const Brief = lazy(() =>
  import('./pages/Brief').catch((err) => {
    try {
      if (sessionStorage.getItem('brief-reload') !== import.meta.url) {
        sessionStorage.setItem('brief-reload', import.meta.url)
        window.location.reload()
        return new Promise<never>(() => {})
      }
    } catch {
      // storage blocked: no way to know this isn't a second try, so don't reload
    }
    throw err
  }),
)

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
