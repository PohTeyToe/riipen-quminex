import { useEffect, type ReactNode } from 'react'
import { PanelProvider } from '../components/Panel'
import PropertyCard from './PropertyCard'
import EvalPage from './Eval'

const TITLES: Record<string, string> = {
  '/demo': 'Property card',
  '/demo/eval': 'Eval',
}

export default function Demo({ path, fallback }: { path: string; fallback: ReactNode }) {
  useEffect(() => {
    if (!TITLES[path]) return // the not-found page names itself
    document.title = `${TITLES[path]} · Iron Lake property file`
    return () => {
      document.title = 'Iron Lake property file'
    }
  }, [path])

  const page = path === '/demo' ? <PropertyCard /> : path === '/demo/eval' ? <EvalPage /> : null
  if (!page) return <>{fallback}</>
  return <PanelProvider key={path}>{page}</PanelProvider>
}
