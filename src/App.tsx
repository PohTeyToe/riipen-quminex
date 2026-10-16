import { lazy, Suspense, useEffect } from 'react'
import { useLocation, Link } from './router'
import Walkthrough from './pages/Walkthrough'

// The property card and eval share the run data, so they load together, after the walkthrough. The brief shows
// no claims, so it loads on its own without the run data.
const Demo = lazy(() => import('./pages/Demo'))
const Brief = lazy(() => import('./pages/Brief'))

function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · Iron Lake property file'
    return () => {
      document.title = 'Iron Lake property file'
    }
  }, [])
  return (
    <main className="walk not-found">
      <h1>Nothing at this address</h1>
      <p>
        <Link to="/" className="text-link">
          Start at the walkthrough
        </Link>{' '}
        or{' '}
        <Link to="/demo" className="text-link">
          open the property file
        </Link>
        .
      </p>
    </main>
  )
}

export default function App() {
  const { path } = useLocation()
  if (path === '/') return <Walkthrough />
  if (path === '/demo/brief') {
    return (
      <Suspense fallback={<div className="loading" aria-busy="true" />}>
        <Brief />
      </Suspense>
    )
  }
  if (path === '/demo' || path.startsWith('/demo/')) {
    return (
      <Suspense fallback={<div className="loading" aria-busy="true" />}>
        <Demo path={path} fallback={<NotFound />} />
      </Suspense>
    )
  }
  return <NotFound />
}
