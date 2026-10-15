import { lazy, Suspense } from 'react'
import { useLocation, Link } from './router'
import Walkthrough from './pages/Walkthrough'

// The property card, eval and brief share the run data, so they load together, after the walkthrough.
const Demo = lazy(() => import('./pages/Demo'))

function NotFound() {
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
  if (path === '/demo' || path.startsWith('/demo/')) {
    return (
      <Suspense fallback={<div className="loading" aria-busy="true" />}>
        <Demo path={path} fallback={<NotFound />} />
      </Suspense>
    )
  }
  return <NotFound />
}
