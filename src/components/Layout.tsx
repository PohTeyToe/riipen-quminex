import type { ReactNode } from 'react'
import { Link, useLocation } from '../router'
import { longDate, model, run } from '../data/core'
import { LINKS } from '../links'

const TABS = [
  { to: '/demo', label: 'Property card' },
  { to: '/demo/eval', label: 'Eval' },
  { to: '/demo/brief', label: 'Brief' },
]

export function DemoLayout({ title, children }: { title: string; children: ReactNode }) {
  const { path } = useLocation()
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark" aria-label="Iron Lake property file, walkthrough">
            <span className="long">Iron Lake property file</span>
            <span className="short">Iron Lake</span>
          </Link>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <Link key={t.to} to={t.to} className="tab" aria-current={path === t.to ? 'page' : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="page">
        <div className="page-head">
          <h1>{title}</h1>
          <p className="header-line">Built only from public BC government filings. Not affiliated with any company named in them.</p>
          <p className="run-label small">
            Agent output from {longDate(run.date)}, <span className="mono">{model}</span>. Code checked each quote against its page; quotes on scanned
            pages were checked against the page image.
          </p>
        </div>
        {children}
      </main>
      <footer className="footer">
        <div className="footer-inner small">
          <p>
            Report text belongs to its authors and is quoted from BC's ARIS archive. This site hosts no page images and no copies of the PDFs. Every
            page link opens the report on ARIS.
          </p>
          <p>
            Built by Abdallah Safi.
            {LINKS.repo && (
              <>
                {' '}
                <a href={LINKS.repo} target="_blank" rel="noopener noreferrer">
                  Code on GitHub
                </a>
              </>
            )}
          </p>
        </div>
      </footer>
    </>
  )
}
