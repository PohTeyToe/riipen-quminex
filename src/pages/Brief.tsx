import { useState, type ReactNode } from 'react'
import { DemoLayout } from '../components/Layout'
import { ChevronIcon } from '../components/Icons'
import schemaJson from '../../agent/claim.schema.json'
import { briefExamples } from '../data/run'
import { useHashScroll } from '../router'
import { LINKS } from '../links'

const DELIVERABLES: [string, string, string][] = [
  ['Track 1 agent prototype', 'A field-by-field agent with four tools, run offline', 'Live runs on your reports, your framework'],
  ['Data, tool and agent framework package', 'Corpus loader, page search, claim schema, quote checker, disagreement rules, with tests', 'Packaging, tools for tracks 2 and 3'],
  ['Eval scripts', '15 questions and a scored summary, every miss listed', 'A larger set with answers your geologists write'],
  ['Technical report with hallucination risks', 'Failure counts by type from a real run', 'The written report'],
  ['Presentation', 'Not started', 'Not started'],
  ['Synthesis into property evaluations', 'A cited summary written from the card. Code checks its numbers and that it gives every side of a disagreement', 'Claims from tracks 2 and 3'],
]

const PLAN: [string, string, string][] = [
  ['Oct 26 to 30 (check-in Oct 30)', 'Agree on the starting reports with you. Agent running on them.', 'Propose the claim format. The three of us settle it.'],
  ['Nov 2 to 13', 'Framework package: loaders, tools, claim schema, quote checker, tests. Head start.', 'Other tracks can call the same checker.'],
  ['Nov 16 to 27', 'Eval set with answers your team writes. Hallucination-risk notes from real misses. Head start.', 'Share the eval format.'],
  ['Nov 30 to Dec 11 (spotlight Dec 11)', "One property evaluation from all three tracks' claims, disagreements flagged by code.", 'Joint.'],
  ['Dec 14 to 18 (submit Dec 18)', 'Technical report, presentation, handover.', 'Same.'],
]

const QUESTIONS = [
  "For track 1, should the corpus start from NI 43-101s on SEDAR+, government assessment reports, or client files we won't see?",
  'Do you already have a claim format, or should the three tracks agree on one in week one?',
  "What should accuracy be scored against: a geologist's own property summary, or checked questions like these?",
  'Do you already use LangGraph, AutoGen or CrewAI, or is the choice ours?',
  'When sources disagree, should the evaluation carry both values with a flag, or stop and ask a geologist?',
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
  const ex = briefExamples.examples[tab]
  const check = ex.claim.check as { quote_on_page?: boolean; value_in_quote?: boolean } | undefined
  return (
    <div className="examples">
      <div className="seg" role="tablist" aria-label="Example claims by track">
        {briefExamples.examples.map((e, i) => (
          <button
            key={e.track}
            type="button"
            role="tab"
            id={`ex-tab-${i}`}
            aria-selected={tab === i}
            aria-controls="ex-panel"
            className="seg-button"
            onClick={() => setTab(i)}
          >
            Track {e.track}
          </button>
        ))}
      </div>
      <div id="ex-panel" role="tabpanel" aria-labelledby={`ex-tab-${tab}`} className="ex-panel">
        <p className="ex-label">{ex.label}</p>
        {ex.hand_written ? (
          <p className="hand-note small">{ex.note ?? briefExamples.note_hand_written}</p>
        ) : (
          <p className="small muted">Copied from the run's output, unedited.</p>
        )}
        <p className="small">
          Checker: quote on the cited page {check?.quote_on_page ? 'confirmed' : 'not confirmed'}, value in the quote {check?.value_in_quote ? 'confirmed' : 'not confirmed'}.
        </p>
        <Json value={ex.claim} />
        {ex.compared_with && (
          <>
            <p className="small">Compared with the Table 3 row for the same hole, also written by hand from the page:</p>
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
            <p className="rule small">
              Same interval: {ex.code_result.same_interval ? 'yes' : 'no'}. Widths disagree: {ex.code_result.widths_disagree ? 'yes' : 'no'}. Rule, in code: {ex.code_result.rule_text}
            </p>
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
    <DemoLayout title="Your brief, mapped">
      <section className="block" aria-labelledby="map-h">
        <h2 id="map-h" className="section-title">
          What exists, and what doesn't yet
        </h2>
        <table className="data-table stack deliverables">
          <thead>
            <tr>
              <th scope="col">Your brief asks for</th>
              <th scope="col">Small version here</th>
              <th scope="col">Not built yet</th>
            </tr>
          </thead>
          <tbody>
            {DELIVERABLES.map(([ask, here, not]) => (
              <tr key={ask}>
                <th scope="row" data-label="Your brief asks for">
                  {ask}
                </th>
                <td data-label="Small version here" className={here === 'Not started' ? 'muted' : ''}>
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

      <section className="block" aria-labelledby="format-h">
        <h2 id="format-h" className="section-title">
          One claim format for all three tracks
        </h2>
        <p className="lede">
          Every track's agent writes the same record: one statement from one page, with the exact quote. Code checks the quote and compares claims across sources, so a
          disagreement between a track 2 survey and a track 3 drill table shows up the same way as one inside a single report.
        </p>
        <Examples />
        <button type="button" className="disclosure small schema-toggle" aria-expanded={keysOpen} onClick={() => setKeysOpen((v) => !v)}>
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
                  <td className="mono small">{typeOf(p)}</td>
                  <td className="small">{p.description ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <p className="small muted">
          {keysOpen ? 'Keys marked ? are optional. ' : ''}The full schema is <span className="mono">agent/claim.schema.json</span>
          {LINKS.repo ? (
            <>
              {' '}in the{' '}
              <a className="text-link" href={`${LINKS.repo}/blob/main/agent/claim.schema.json`} target="_blank" rel="noopener noreferrer">
                repo
              </a>
              .
            </>
          ) : (
            ' in the code.'
          )}
        </p>
      </section>

      <section className="block" aria-labelledby="plan-h">
        <h2 id="plan-h" className="section-title">
          How I'd run track 1
        </h2>
        <table className="data-table stack plan">
          <thead>
            <tr>
              <th scope="col">Weeks</th>
              <th scope="col">Track 1</th>
              <th scope="col">With tracks 2 and 3</th>
            </tr>
          </thead>
          <tbody>
            {PLAN.map(([w, t1, t23]) => (
              <tr key={w}>
                <th scope="row" data-label="Weeks" className="num">
                  {w}
                </th>
                <td data-label="Track 1">{t1}</td>
                <td data-label="With tracks 2 and 3">{t23}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small">
          Each student leads their own track. This is how I'd run mine. The framework is your call. This demo uses plain Claude tool calls so every part stays visible.
        </p>
      </section>

      <section className="block" aria-labelledby="ask-h">
        <h2 id="ask-h" className="section-title">
          Questions I'd bring to our first call
        </h2>
        <ol className="ask">
          {QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </section>
    </DemoLayout>
  )
}
