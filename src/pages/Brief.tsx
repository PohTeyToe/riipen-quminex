import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { PageHead } from '../components/Layout'
import { Rule } from '../components/Rule'
import { ChevronIcon } from '../components/Icons'
import schemaJson from '../../agent/claim.schema.json'
import briefExamplesJson from '../../data/brief_examples.json'
import { useHashScroll } from '../router'
import { LINKS } from '../links'

// Imported straight from its JSON, so this page loads without the run's claims, traces and excerpts.
const briefExamples = briefExamplesJson as unknown as {
  note_hand_written: string
  examples: {
    track: number
    label: string
    hand_written: boolean
    note?: string
    claim: Record<string, unknown>
    compared_with?: Record<string, unknown>
    code_result?: {
      same_interval: boolean
      widths_disagree: boolean
      arithmetic: Record<string, { ok: boolean; line: string }>
      rule_text: string
    }
  }[]
}

const DELIVERABLES: [string, string, string][] = [
  ['Track 1 agent prototype', 'Field-by-field agent with four tools, run offline', 'Live runs on your reports, in your framework'],
  ['Data, tool and agent framework package', 'Corpus loader, page search, claim schema, quote checker, disagreement rules, tests', 'Packaging, and tools for tracks 2 and 3'],
  ['Eval scripts', '15 questions, scored, every miss listed', 'A larger set your geologists write'],
  ['Technical report with hallucination risks', 'Failure counts by type from a real run', 'The written report'],
  ['Presentation', 'Not started', 'Not started'],
  ['Synthesis into property evaluations', "A cited summary written from the file, with disagreements settled by the reports' drill tables", 'Claims from tracks 2 and 3'],
]

const schema = schemaJson as unknown as {
  required: string[]
  properties: Record<string, { type?: string | string[]; enum?: unknown[]; description?: string; oneOf?: unknown[] }>
}

function typeOf(p: (typeof schema.properties)[string]): string {
  if (p.enum) return p.enum.map(String).join(' | ')
  if (p.oneOf) return 'string | object | null'
  return Array.isArray(p.type) ? p.type.join(' | ') : p.type ?? ''
}

/** Pretty JSON that keeps small flat objects and arrays on one line, the way a person would write them. */
function oneLine(v: unknown): string | null {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) {
    const parts = v.map(oneLine)
    return parts.every((x) => x !== null) ? `[${parts.join(', ')}]` : null
  }
  const entries = Object.entries(v as Record<string, unknown>)
  if (!entries.every(([, x]) => x === null || typeof x !== 'object')) return null
  return entries.length ? `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(', ')} }` : '{}'
}

function stringify(v: unknown, indent = ''): string {
  const short = oneLine(v)
  if (short !== null && short.length + indent.length <= 72) return short
  const nl = '\n'
  const inner = indent + '  '
  if (Array.isArray(v)) return `[${nl}${v.map((x) => inner + stringify(x, inner)).join(',' + nl)}${nl}${indent}]`
  if (v && typeof v === 'object') {
    const body = Object.entries(v as Record<string, unknown>).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${stringify(x, inner)}`)
    return `{${nl}${body.join(',' + nl)}${nl}${indent}}`
  }
  return JSON.stringify(v)
}

/** JSON with keys, strings and numbers told apart by weight and tone, not hue. */
function Json({ value }: { value: unknown }) {
  const text = stringify(value)
  const parts: ReactNode[] = []
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(-?\d+(?:\.\d+)?)\b|\b(true|false|null)\b/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] && m[2]) {
      parts.push(
        <span key={k++} className="j-key">
          {m[1]}
        </span>,
        m[2],
      )
    } else if (m[1]) {
      parts.push(
        <span key={k++} className="j-str">
          {m[1]}
        </span>,
      )
    } else {
      parts.push(
        <span key={k++} className="j-lit">
          {m[0]}
        </span>,
      )
    }
    last = re.lastIndex
  }
  parts.push(text.slice(last))
  return (
    <pre className="json" tabIndex={0}>
      <code>{parts}</code>
    </pre>
  )
}

function Examples() {
  const [tab, setTab] = useState(0)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const ex = briefExamples.examples[tab]
  const check = ex.claim.check as { quote_on_page?: boolean; value_in_quote?: boolean } | undefined
  const n = briefExamples.examples.length
  // Arrow keys move between tabs, Home and End go to the ends, as a tab list should.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key]
    if (to === undefined) return
    e.preventDefault()
    setTab(to)
    tabs.current[to]?.focus()
  }
  return (
    <div className="examples">
      <div className="seg" role="tablist" aria-label="Example claims by track">
        {briefExamples.examples.map((e, i) => (
          <button
            key={e.track}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`ex-tab-${i}`}
            aria-selected={tab === i}
            aria-controls="ex-panel"
            tabIndex={tab === i ? 0 : -1}
            className="seg-button"
            onClick={() => setTab(i)}
            onKeyDown={(ev) => onKey(ev, i)}
          >
            Track {e.track}
          </button>
        ))}
      </div>
      <div id="ex-panel" role="tabpanel" aria-labelledby={`ex-tab-${tab}`} className="ex-panel">
        <p className="ex-label">{ex.label}</p>
        <p className={ex.hand_written ? 'hand-note' : 'hint'}>{ex.hand_written ? ex.note ?? briefExamples.note_hand_written : "Copied from the run's output, unedited."}</p>
        <p className="hint">
          Checker: quote on the cited page {check?.quote_on_page ? 'confirmed' : 'not confirmed'}, value in the quote {check?.value_in_quote ? 'confirmed' : 'not confirmed'}.
        </p>
        <Json value={ex.claim} />
        {ex.compared_with && (
          <>
            <p className="hint">Compared with the Table 3 row for the same hole, also written by hand:</p>
            <Json value={ex.compared_with} />
          </>
        )}
        {ex.code_result && (
          <div className="code-line">
            {Object.values(ex.code_result.arithmetic).map((a) => (
              <p key={a.line} className="mono">
                {a.line}
              </p>
            ))}
            <p className="hint">
              Same interval: {ex.code_result.same_interval ? 'yes' : 'no'}. Widths disagree: {ex.code_result.widths_disagree ? 'yes' : 'no'}.
            </p>
            <Rule text={ex.code_result.rule_text} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function BriefPage() {
  useHashScroll(true)
  const [keysOpen, setKeysOpen] = useState(false)
  return (
    <div className="doc-page">
      <PageHead title="Your brief, mapped" meta="Riipen deliverables against what this demo has" />
      <section className="block" aria-labelledby="map-h">
        <h2 id="map-h" className="sr-only">
          What exists, and what doesn't yet
        </h2>
        <table className="data-table stack deliverables">
          <thead>
            <tr>
              <th scope="col">Your brief asks for</th>
              <th scope="col">Built here</th>
              <th scope="col">Not built yet</th>
            </tr>
          </thead>
          <tbody>
            {DELIVERABLES.map(([ask, here, not]) => (
              <tr key={ask}>
                <th scope="row" data-label="Your brief asks for">
                  {ask}
                </th>
                <td data-label="Built here" className={here === 'Not started' ? 'muted' : ''}>
                  {here}
                </td>
                <td data-label="Not built yet" className={not === 'Not started' ? 'muted' : ''}>
                  {not}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="block" id="format" aria-labelledby="format-h">
        <div className="block-head">
          <h2 id="format-h">One claim format for all three tracks</h2>
          <p className="hint">One value, one page, the exact quote. Same checker.</p>
        </div>
        <Examples />
        <button type="button" className="disclosure" aria-expanded={keysOpen} onClick={() => setKeysOpen((v) => !v)}>
          <ChevronIcon />
          Every key and what it means
        </button>
        {keysOpen && (
          <div className="table-scroll">
            <table className="data-table schema">
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Type</th>
                  <th scope="col">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(schema.properties).map(([key, p]) => (
                  <tr key={key}>
                    <th scope="row" className="mono">
                      {key}
                      {schema.required.includes(key) ? '' : '?'}
                    </th>
                    <td className="mono">{typeOf(p)}</td>
                    <td>{p.description ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">Keys marked ? are optional.</p>
          </div>
        )}
        <p className="hint">
          Full schema:{' '}
          <a className="text-link mono" href={`${LINKS.repo}/blob/main/agent/claim.schema.json`} target="_blank" rel="noopener noreferrer">
            agent/claim.schema.json
          </a>
        </p>
      </section>
    </div>
  )
}
