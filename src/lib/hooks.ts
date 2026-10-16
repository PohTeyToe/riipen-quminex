import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

/** A ref for an element and its current width, kept up to date as the layout changes. Measured before the
 * browser paints, so a chart drawn to this width is there in the first frame instead of pushing the page down. */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  const ref = useCallback((node: T | null) => setEl(node), [])
  return [ref, width]
}

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const update = () => setOn(m.matches)
    update()
    m.addEventListener('change', update)
    return () => m.removeEventListener('change', update)
  }, [query])
  return on
}

export function usePrefersReducedMotion(): boolean {
  return useMedia('(prefers-reduced-motion: reduce)')
}
