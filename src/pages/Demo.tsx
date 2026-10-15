import { useEffect, type ReactNode } from 'react'
import { PanelProvider } from '../components/Panel'
import PropertyCard from './PropertyCard'
import EvalPage from './Eval'
import BriefPage from './Brief'

const TITLES: Record<string, string> = {
  '/demo': 'Property card',
  '/demo/eval': 'Eval',
  '/demo/brief': 'Your brief, mapped',
}

export default function Demo({ path, fallback }: { path: string; fallback: ReactNode }) {
  useEffect(() => {
    document.title = TITLES[path] ? `${TITLES[path]} · Iron Lake property file` : 'Iron Lake property file'
    return () => {
      document.title = 'Iron Lake property file'
    }
  }, [path])

  const page = path === '/demo' ? <PropertyCard /> : path === '/demo/eval' ? <EvalPage /> : path === '/demo/brief' ? <BriefPage /> : null
  if (!page) return <>{fallback}</>
  return <PanelProvider key={path}>{page}</PanelProvider>
}
