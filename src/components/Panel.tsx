import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fields, longDate, pageLink, report } from '../data/core'
import { checkWords, claim, clean, excerpt, gradeText, isInterval, srcLabel, traceSteps, valueText } from '../data/run'
import type { Claim, Src } from '../data/types'
import { ChevronIcon, CloseIcon, ExternalIcon } from './Icons'
import { ClaimTrace } from './Trace'

interface PanelState {
  id: string
  siblings?: string[]
}

const PanelContext = createContext<{ open: (id: string, siblings?: string[]) => void; current: string | null }>({
  open: () => {},
  current: null,
})

export function usePanel() {
  return useContext(PanelContext)
}

function setClaimParam(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('claim', id)
  else url.searchParams.delete('claim')
  window.history.replaceState(null, '', url)
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PanelState | null>(() => {
    const id = new URL(window.location.href).searchParams.get('claim')
    return id && claim(id) ? { id } : null
  })
  const opener = useRef<HTMLElement | null>(null)

  const open = useCallback((id: string, siblings?: string[]) => {
    if (!claim(id)) return
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('.panel')) {
      opener.current = document.activeElement
    }
    setState((prev) => ({ id, siblings: siblings ?? (prev?.siblings?.includes(id) ? prev.siblings : undefined) }))
    setClaimParam(id)
  }, [])

  const close = useCallback(() => {
    setState(null)
    setClaimParam(null)
    opener.current?.focus({ preventScroll: true })
  }, [])

  const wasOpen = useRef(false)
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('panel-open', Boolean(state))
    const justOpened = Boolean(state) && !wasOpen.current
    wasOpen.current = Boolean(state)
    const el = opener.current
    if (justOpened && el && window.matchMedia('(min-width: 1100px)').matches) {
      // The page narrows to make room for the panel; keep the clicked value in view.
      const r = el.getBoundingClientRect()
      if (r.top < 64 || r.bottom > window.innerHeight - 16) el.scrollIntoView({ block: 'center' })
    }
  }, [state])

  useEffect(() => () => document.documentElement.classList.remove('panel-open'), [])

  return (
    <PanelContext.Provider value={{ open, current: state?.id ?? null }}>
      {children}
      <SidePanel state={state} onClose={close} onOpen={open} />
    </PanelContext.Provider>
  )
}

/** A report-and-page chip. Opens the claim behind it. */
export function Chip({ id, src, siblings, scanned }: { id: string; src?: Src; siblings?: string[]; scanned?: boolean }) {
  const { open, current } = usePanel()
  const c = claim(id)
  const s = src ?? c?.source
  if (!s) return null
  const isScanned = scanned ?? c?.check.by === 'page image'
  return (
    <button
      type="button"
      className={`chip${isScanned ? ' is-scanned' : ''}${current === id ? ' is-current' : ''}`}
      onClick={() => open(id, siblings)}
      aria-label={`Open the quote from report ${s.aris}, PDF page ${s.page}${isScanned ? ', a scanned page' : ''}`}
    >
      {srcLabel(s)}
    </button>
  )
}

/** A value as written, which opens its quote. */
export function ValueButton({ id, siblings, children, className = '' }: { id: string; siblings?: string[]; children: ReactNode; className?: string }) {
  const { open, current } = usePanel()
  return (
    <button type="button" className={`value-button ${className}${current === id ? ' is-current' : ''}`} onClick={() => open(id, siblings)}>
      {children}
    </button>
  )
}

function fieldName(fieldId: string): string {
  if (fieldId === 'answer') return 'Eval answer'
  const [top, part] = fieldId.split('.')
  const f = fields.find((x) => x.id === top)
  if (!f) return fieldId
  const p = part ? f.parts?.find((x) => x.id === fieldId) : undefined
  return p ? `${f.name}: ${p.name.toLowerCase()}` : f.name
}

function Excerpt({ c }: { c: Claim }) {
  const ex = excerpt(c.id)
  const scanned = c.check.by === 'page image'
  if (!ex) {
    return <blockquote className="quote">{clean(c.quote)}</blockquote>
  }
  const [a, b] = ex.highlight
  return (
    <figure className="excerpt">
      <blockquote className="quote">
        <span className="ellipsis">… </span>
        {ex.text.slice(0, a)}
        <mark>{ex.text.slice(a, b)}</mark>
        {ex.text.slice(b)}
        <span className="ellipsis"> …</span>
      </blockquote>
      <figcaption className="small muted">
        {scanned ? 'From the OCR text layer of a scanned page. ' : ''}The quote is highlighted inside a short excerpt of its page.
      </figcaption>
    </figure>
  )
}

function Grades({ c }: { c: Claim }) {
  if (!isInterval(c.value)) return null
  const v = c.value
  const entries = Object.entries(v.grades)
  if (!entries.length) return null
  return (
    <ul className="grades">
      {entries.map(([k, g]) => (
        <li key={k} className={c.censored_grades?.[k] ? 'is-censored' : ''}>
          {gradeText(k, g, Boolean(c.censored_grades?.[k]))}
        </li>
      ))}
    </ul>
  )
}

function SidePanel({ state, onClose, onOpen }: { state: PanelState | null; onClose: () => void; onOpen: (id: string, siblings?: string[]) => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<PanelState | null>(state)
  const [traceOpen, setTraceOpen] = useState(false)

  useEffect(() => {
    if (state) {
      setShown(state)
      setTraceOpen(false)
      body.current?.scrollTo(0, 0)
      requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
    }
  }, [state])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, onClose])

  const c = shown ? claim(shown.id) : undefined
  const isOpen = Boolean(state)
  const r = c ? report(c.source.aris) : undefined
  const check = c ? checkWords(c) : undefined
  const siblings = shown?.siblings?.filter((id) => id !== shown.id) ?? []
  const caveats = c?.caveats.map((id) => claim(id)).filter((x): x is Claim => Boolean(x)) ?? []

  return (
    <>
      <div className={`scrim${isOpen ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`panel${isOpen ? ' is-open' : ''}`} aria-label="Source for this value" aria-hidden={!isOpen} inert={!isOpen}>
        {c && r && check && (
          <>
            <header className="panel-head">
              <h2 ref={heading} tabIndex={-1} className="panel-title">
                {fieldName(c.field)}
                {c.kind === 'caveat' && <span className="tag">caveat</span>}
              </h2>
              <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </header>
            <div className="panel-body" ref={body}>
              <p className={`panel-value${c.kind === 'statement' || c.kind === 'caveat' ? ' is-text' : ''}`}>{valueText(c)}</p>
              <Grades c={c} />
              <Excerpt c={c} />

              <div className={`check-box${check.scanned ? ' is-scanned' : ''}`}>
                <p>{check.text}</p>
                {check.imageReads && (
                  <p>
                    <span className="muted">The page image reads:</span> <span className="mono">{check.imageReads}</span>
                  </p>
                )}
              </div>

              <a className="aris-link" href={pageLink(c.source.aris, c.source.page)} target="_blank" rel="noopener noreferrer">
                Open page {c.source.page} on ARIS ({r.pdf_size_label})
                <ExternalIcon />
              </a>

              <dl className="meta">
                <div>
                  <dt>Report</dt>
                  <dd>
                    <span className="mono">ARIS {r.aris}</span>, {r.title}
                  </dd>
                </div>
                <div>
                  <dt>Year</dt>
                  <dd className="num">{r.report_year}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>{r.author}</dd>
                </div>
                <div>
                  <dt>Page</dt>
                  <dd>
                    <span className="mono">PDF page {c.source.page}</span>
                    <span className="muted"> of the PDF file, not the number printed on the page</span>
                  </dd>
                </div>
              </dl>

              {c.also_in.length > 0 && (
                <p className="small">
                  Same wording also in <span className="mono">{c.also_in.map(srcLabel).join(', ')}</span>
                </p>
              )}

              {caveats.length > 0 && (
                <section className="panel-section">
                  <h3 className="label">Caveats attached by rule</h3>
                  <p className="small muted">A caveat about an element in a report attaches to every value of that element from that report.</p>
                  <ul className="caveat-list">
                    {caveats.map((cv) => (
                      <li key={cv.id}>
                        <blockquote className="quote small-quote">{clean(cv.quote)}</blockquote>
                        <Chip id={cv.id} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {siblings.length > 0 && (
                <section className="panel-section">
                  <h3 className="label">Grouped with this by code</h3>
                  <div className="chips">
                    {siblings.map((id) => {
                      const s = claim(id)
                      return s ? (
                        <button key={id} type="button" className={`chip${s.check.by === 'page image' ? ' is-scanned' : ''}`} onClick={() => onOpen(id, shown?.siblings)}>
                          {srcLabel(s.source)}
                        </button>
                      ) : null
                    })}
                  </div>
                </section>
              )}

              <section className="panel-section">
                <button type="button" className="disclosure" aria-expanded={traceOpen} onClick={() => setTraceOpen((v) => !v)}>
                  <ChevronIcon />
                  How the agent got this
                </button>
                {traceOpen && <ClaimTrace session={c.trace.session} steps={traceSteps(c)} />}
              </section>

              <p className="small muted panel-foot">
                Claim <span className="mono">{c.id}</span>, run {c.run}, agent output from {longDate(c.run.slice(0, 10))}.
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
