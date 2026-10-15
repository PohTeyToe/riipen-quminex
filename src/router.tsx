import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

// A four-route app doesn't need a router library. This keeps the URL, back button and deep links working.

interface Loc {
  path: string
  hash: string
  search: string
}

function read(): Loc {
  const { pathname, hash, search } = window.location
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return { path, hash: hash.slice(1), search }
}

const LocContext = createContext<Loc>(read())

export function useLocation() {
  return useContext(LocContext)
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = new URL(to, window.location.href)
  const samePage = url.pathname === window.location.pathname
  if (opts.replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new Event('app:navigate'))
  if (!url.hash && !samePage) window.scrollTo(0, 0)
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState(read)
  useEffect(() => {
    const update = () => setLoc(read())
    window.addEventListener('popstate', update)
    window.addEventListener('app:navigate', update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener('app:navigate', update)
    }
  }, [])
  return <LocContext.Provider value={loc}>{children}</LocContext.Provider>
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }

export function Link({ to, onClick, ...rest }: LinkProps) {
  function handle(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handle} {...rest} />
}

/** Scroll to the element named in the hash once it exists. */
export function useHashScroll(ready: boolean) {
  const { hash, path } = useLocation()
  useEffect(() => {
    if (!ready || !hash) return
    const el = document.getElementById(hash)
    if (el) {
      el.scrollIntoView({ block: 'start' })
    }
  }, [hash, path, ready])
}
