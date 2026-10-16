import { useEffect, useState } from 'react'
import { pageLink } from '../data/core'
import { loadPageMaps, type PageMaps } from '../data/pageMaps'

// The cited page as a map: every text line a bar at its real place, the quote's lines in blue. Geometry only;
// the site ships no page images, so the page itself is one click away on ARIS.

export function PageMap({ claimId, aris, page }: { claimId: string; aris: number; page: number }) {
  const [maps, setMaps] = useState<PageMaps | null>(null)
  useEffect(() => {
    let live = true
    loadPageMaps().then((m) => live && setMaps(m))
    return () => {
      live = false
    }
  }, [])
  const placed = maps?.claims[claimId]
  const pm = placed ? maps?.pages[placed.page] : undefined
  const W = 104
  if (!maps) return <span className="pagemap is-loading" style={{ width: W, height: W * 1.29 }} aria-hidden="true" />
  if (!placed || !pm) return null
  const H = (pm.h / pm.w) * W
  const k = W / pm.w
  const top = placed.quote[0]?.[1] ?? 0
  const where = top < pm.h / 3 ? 'top third' : top < (2 * pm.h) / 3 ? 'middle third' : 'bottom third'
  return (
    <a
      className="pagemap"
      href={pageLink(aris, page)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Page ${page} of ${aris}: the quote sits in the ${where}. Open the page on ARIS.`}
      title="Open the page on ARIS"
    >
      <svg width={W} height={H} viewBox={`0 0 ${pm.w} ${pm.h}`} aria-hidden="true">
        <rect x={0} y={0} width={pm.w} height={pm.h} className="pm-page" />
        {pm.lines.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y + h * 0.2} width={w} height={h * 0.6} rx={1 / k} className="pm-line" />
        ))}
        {placed.quote.map(([x, y, w, h], i) => (
          <rect key={`q${i}`} x={x - 2 / k} y={y - 1 / k} width={w + 4 / k} height={h + 2 / k} rx={1.5 / k} className="pm-quote" />
        ))}
        {placed.value.map(([x, y, w, h], i) => (
          <rect key={`v${i}`} x={x} y={y + h - 1.6 / k} width={w} height={1.6 / k} className="pm-value" />
        ))}
      </svg>
    </a>
  )
}
