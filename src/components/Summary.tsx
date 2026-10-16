import { fields } from '../data/core'
import { summary, summaryReview } from '../data/run'
import { Link } from '../router'
import { SourceChips } from './FieldRow'

/** Where a citation that isn't a claim points on the card, and what to call it. */
function otherCite(id: string): { href: string; label: string } | null {
  const [kind, ref] = id.split(':')
  const field = fields.find((f) => f.id === ref?.split('.')[0])
  if (kind === 'code' && field) return { href: `#${field.id}`, label: `code line, ${field.name.toLowerCase()}` }
  if (kind === 'refused' && field) return { href: `#${field.id}`, label: `${field.name.toLowerCase()}: not in these sources` }
  if (kind === 'index') return { href: '#tl-h', label: 'ARIS index' }
  return null
}

const notes = new Map(summaryReview.notes.map((n) => [n.sentence, n.note]))

export function SummaryBlock() {
  const points = summary.points.filter((p) => p.met).length
  const proposed = summary.sentences.length + summary.thrown_out.length
  return (
    <section className="summary" aria-labelledby="summary-h">
      <div className="section-head">
        <h2 id="summary-h" className="label">
          The agent's summary
        </h2>
        <p className="small muted">
          A separate session read only this card and wrote it. Code kept a sentence only if every number in it is in a claim or code line it cites, and only if it
          cites every side of any disagreement it touches. Code can't check the words between the numbers: click a chip to read the quote behind a sentence. Claude
          read every sentence against its quotes after the run; where the words go past them, a note says so.
        </p>
      </div>
      <ol className="summary-list">
        {summary.sentences.map((s) => {
          const claimIds = s.cite.filter((id) => id.startsWith('c-'))
          const others = s.cite.map(otherCite).filter((x): x is { href: string; label: string } => Boolean(x))
          return (
            <li key={s.id}>
              <span className="summary-text">{s.text}</span>{' '}
              <span className="summary-cites">
                {claimIds.length > 0 && <SourceChips ids={claimIds} siblings={claimIds} max={3} context="Also cited by this sentence" />}
                {others.map((o) => (
                  <a key={o.label} className="tag cite-tag" href={o.href}>
                    {o.label}
                  </a>
                ))}
              </span>
              {notes.get(s.id) && (
                <p className="review-note small">
                  <span className="review-who">Claude's note after the run:</span> {notes.get(s.id)}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <p className="small summary-foot">
        <Link to="/demo/eval#summary-score" className="text-link">
          Scored on the Eval tab
        </Link>
        <span className="muted">
          : {points} of {summary.points.length} points it should make, {summary.sentences.length} of {proposed} sentences kept.
        </span>
      </p>
    </section>
  )
}
