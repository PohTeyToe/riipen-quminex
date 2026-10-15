import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fields, longDate, pageLink, report } from '../data/core'
import { checkWords, claim, clean, excerpt, gradeText, isInterval, srcLabel, traceSteps, valueText } from '../data/run'
import type { Claim, Src } from '../data/types'
import { ChevronIcon, CloseIcon, ExternalIcon } from './Icons'
import { ClaimTrace } from './Trace'

interface PanelState {
  id: string
  siblings?: string[]
  /** What the siblings are to this claim: grouped by code, or cited by the same summary sentence. */
  context?: string
}

type Open = (id: string, siblings?: string[], context?: string) => void

const PanelContext = createContext<{ open: Open; current: string | null }>({
  open: () => {},
  current: null,
})

export function usePanel() {
  return useContext(PanelContext)
}

const PANEL_ENTRY = 'claim-panel'

function claimUrl(id: string | null): URL {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('claim', id)
  else url.searchParams.delete('claim')
  return url
}

function claimInUrl(): string | null {
  const id = new URL(window.location.href).searchParams.get('claim')
  return id && claim(id) ? id : null
}

/**
 * The open claim lives in the URL (?claim=), so a value can be linked. Opening the panel adds a history
 * entry, so Back closes it, as people expect of a sheet on a phone. Moving between claims in an open
 * panel replaces that entry.
 */
export function PanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PanelState | null>(() => {
    const id = claimInUrl()
    return id ? { id } : null
  })
  const opener = useRef<HTMLElement | null>(null)
  const isOpen = useRef(Boolean(state))

  const open = useCallback<Open>((id, siblings, context) => {
    if (!claim(id)) return
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest('.panel')) {
      opener.current = document.activeElement
    }
    setState((prev) => {
      const keep = !siblings && prev?.siblings?.includes(id)
      return { id, siblings: siblings ?? (keep ? prev?.siblings : undefined), context: siblings ? context : keep ? prev?.context : undefined }
    })
    if (isOpen.current) window.history.replaceState(window.history.state, '', claimUrl(id))
    else window.history.pushState({ [PANEL_ENTRY]: true }, '', claimUrl(id))
    isOpen.current = true
  }, [])

  const close = useCallback(() => {
    isOpen.current = false
    setState(null)
    // Leave the entry the panel added, so Back after closing goes where it went before opening.
    if (window.history.state?.[PANEL_ENTRY]) window.history.back()
    else window.history.replaceState(window.history.state, '', claimUrl(null))
    opener.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const onPop = () => {
      const id = claimInUrl()
      isOpen.current = Boolean(id)
      setState((prev) => (id ? (prev?.id === id ? prev : { id }) : null))
      if (!id) opener.current?.focus({ preventScroll: true })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
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
export function Chip({ id, src, siblings, scanned, context }: { id: string; src?: Src; siblings?: string[]; scanned?: boolean; context?: string }) {
  const { open, current } = usePanel()
  const c = claim(id)
  const s = src ?? c?.source
  if (!s) return null
  const isScanned = scanned ?? c?.check.by === 'page image'
  return (
    <button
      type="button"
      className={`chip${isScanned ? ' is-scanned' : ''}${current === id ? ' is-current' : ''}`}
      onClick={() => open(id, siblings, context)}
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
        {scanned ? 'From the OCR text layer of a scanned page. ' : ''}
        {c.quote_cut
          ? `The agent quoted ${c.quote_cut.chars} characters here. The site shows the part around the value; the page link has the rest.`
          : 'The quote is highlighted inside a short excerpt of its page.'}
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

/** True on phones, where the panel is a bottom sheet that covers the page. */
function useSheet() {
  const query = '(max-width: 760px)'
  const [sheet, setSheet] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setSheet(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return sheet
}

function SidePanel({ state, onClose, onOpen }: { state: PanelState | null; onClose: () => void; onOpen: Open }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const sheet = useSheet()
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

  // As a sheet the panel is modal: the page behind it can't be reached until it closes.
  const modal = Boolean(state) && sheet
  useEffect(() => {
    if (!modal) return
    const behind = [...document.querySelectorAll<HTMLElement>('.skip, .topbar, #main, .footer')]
    behind.forEach((el) => (el.inert = true))
    return () => behind.forEach((el) => (el.inert = false))
  }, [modal])

  const c = shown ? claim(shown.id) : undefined
  const isOpen = Boolean(state)
  const r = c ? report(c.source.aris) : undefined
  const check = c ? checkWords(c) : undefined
  // One chip per page, as on the card: two claims from one page would otherwise show two identical chips.
  const pagesSeen = new Set(c ? [srcLabel(c.source)] : [])
  const siblings = (shown?.siblings ?? []).filter((id) => {
    const s = claim(id)
    const label = s ? srcLabel(s.source) : id
    if (id === shown?.id || pagesSeen.has(label)) return false
    pagesSeen.add(label)
    return true
  })
  const caveats = c?.caveats.map((id) => claim(id)).filter((x): x is Claim => Boolean(x)) ?? []

  return (
    <>
      <div className={`scrim${isOpen ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside
        className={`panel${isOpen ? ' is-open' : ''}`}
        aria-label="Source for this value"
        role={sheet ? 'dialog' : undefined}
        aria-modal={modal || undefined}
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
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
                  <h3 className="label">{shown?.context ?? 'Grouped with this by code'}</h3>
                  <div className="chips">
                    {siblings.map((id) => {
                      const s = claim(id)
                      return s ? (
                        <button
                          key={id}
                          type="button"
                          className={`chip${s.check.by === 'page image' ? ' is-scanned' : ''}`}
                          onClick={() => onOpen(id, shown?.siblings, shown?.context)}
                        >
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
