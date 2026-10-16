import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from '../router'
import { LINKS } from '../links'
import { ChevronIcon, ExternalIcon } from './Icons'

const TABS = [
  { to: '/', label: 'Run', match: ['/', '/demo'] },
  { to: '/demo/eval', label: 'Eval', match: ['/demo/eval'] },
  { to: '/demo/brief', label: 'Brief', match: ['/demo/brief'] },
]

/** The method, behind one click. 120 words at most. */
function HowItWorks({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.how-toggle')) onClose()
    }
    window.addEventListener('keydown', key)
    window.addEventListener('mousedown', click)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', click)
    }
  }, [onClose])
  return (
    <div className="how" id="how" ref={ref} role="region" aria-label="How it works">
      <ol>
        <li>
          <b>Claude reads.</b> One session per field and per eval question, eight at a time. Its only tools: search pages, open a page, propose a
          claim with its quote, refuse.
        </li>
        <li>
          <b>Code checks every claim inside the call.</b> The quote must be on the cited page and the value in the quote, or it goes back to the
          agent. On scanned pages, Claude rechecked each claim against the page image.
        </li>
        <li>
          <b>Code settles disagreements</b> from the reports' own collar tables and lab certificates, and backs a side only when the numbers fit.
        </li>
        <li>
          <b>A second session</b> writes the summary from the finished file. Claude wrote the eval answers before the run and Codex checked them. No
          geologist has yet.
        </li>
      </ol>
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { path } = useLocation()
  const [how, setHow] = useState(false)
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="brand">
          <Link to="/" className="brand-name">
            Iron Lake property file
          </Link>
          <p className="brand-line">Built by Abdallah Safi for Quminex's Level UP project.</p>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className="tab" aria-current={t.match.includes(path) ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-end">
          <button type="button" className="how-toggle" aria-expanded={how} aria-controls="how" onClick={() => setHow((v) => !v)}>
            How it works
            <ChevronIcon />
          </button>
          <a className="code-link" href={LINKS.repo} target="_blank" rel="noopener noreferrer">
            Code
            <ExternalIcon />
          </a>
        </div>
        {how && <HowItWorks onClose={() => setHow(false)} />}
      </header>
      <main id="main" className={`page page-${path === '/' || path === '/demo' ? 'run' : 'doc'}`}>
        {children}
      </main>
      <footer className="footer">
        <p>Pages from BC's ARIS archive; text belongs to its authors. Not made or endorsed by Quminex or any company named in the reports.</p>
      </footer>
    </>
  )
}

/** The title row of the Eval and Brief pages: a name, one line of facts, and an optional control on the right. */
export function PageHead({ title, meta, aside }: { title: string; meta: ReactNode; aside?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="page-meta">{meta}</p>
      </div>
      {aside}
    </div>
  )
}
