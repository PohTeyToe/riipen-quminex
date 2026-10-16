import { useEffect, useState } from 'react'
import { loadPageMaps, type PageMaps } from '../data/pageMaps'

// The cited page as a map: every text line a bar at its real place, the quote's lines in blue. Geometry only;
// the site ships no page images, so the page itself is one click away on ARIS.

/** Small beside the quote; one click draws it across the inspector, a second puts it back. */
export function PageMap({ claimId, page, big, onToggle }: { claimId: string; page: number; big: boolean; onToggle: () => void }) {
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
  const W = 150
  if (!maps) return <span className="pagemap is-loading" style={{ width: W, height: W * 1.29 }} aria-hidden="true" />
  if (!placed || !pm) return null
  const k = W / pm.w
  const top = placed.quote[0]?.[1] ?? 0
  const where = top < pm.h / 3 ? 'top third' : top < (2 * pm.h) / 3 ? 'middle third' : 'bottom third'
  return (
    <figure className={`pagemap-fig${big ? ' is-big' : ''}`}>
      <button
        type="button"
        className="pagemap"
        onClick={onToggle}
        aria-expanded={big}
        aria-label={`Page ${page}, its text lines drawn in place: the quote sits in the ${where}. ${big ? 'Shrink' : 'Enlarge'}.`}
      >
        <svg viewBox={`0 0 ${pm.w} ${pm.h}`} aria-hidden="true">
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
      </button>
      <figcaption className="hint">{big ? 'Text lines from the PDF; the quote in blue' : `The quote on p${page} · click to enlarge`}</figcaption>
    </figure>
  )
}
