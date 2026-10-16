import type { ReactNode } from 'react'
import { pageLink, report } from '../data/core'
import { ExternalIcon } from './Icons'

/** Who did a step: the model or plain code. Every step carries one, so code is never taken for the model. */
export function Who({ who, night }: { who: 'Claude' | 'Code'; night?: boolean }) {
  return <span className={`who who-${who.toLowerCase()}${night ? ' on-night' : ''}`}>{who}</span>
}

export function isScanned(aris: number, page: number): boolean {
  return report(aris)?.scanned_pages.includes(page) ?? false
}

/** "41327 p33", opening the claim behind it. */
export function PageChip({ aris, page, onClick, label }: { aris: number; page: number; onClick?: () => void; label?: string }) {
  const scan = isScanned(aris, page)
  const text = (
    <>
      {aris} p{page}
      {scan && <span className="chip-scan">scan</span>}
    </>
  )
  if (!onClick) return <span className={`chip-page${scan ? ' is-scan' : ''}`}>{text}</span>
  return (
    <button type="button" className={`chip-page${scan ? ' is-scan' : ''}`} onClick={onClick} aria-label={label ?? `Open the quote on ${aris} page ${page}`}>
      {text}
    </button>
  )
}

/** The page on ARIS, BC's assessment report archive. */
export function ArisLink({ aris, page, children }: { aris: number; page: number; children?: ReactNode }) {
  return (
    <a className="aris-link" href={pageLink(aris, page)} target="_blank" rel="noopener noreferrer">
      {children ?? (
        <>
          {aris} p{page} on ARIS
        </>
      )}
      <ExternalIcon />
    </a>
  )
}

export function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m4.5 4.5 7 7m0-7-7 7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
