import { corpus, corpusPages, fields, fieldsFile } from '../data/core'
import { DemoLayout } from '../components/Layout'
import { FieldRow } from '../components/FieldRow'
import { Timeline } from '../components/Timeline'
import { SummaryBlock } from '../components/Summary'
import { useHashScroll } from '../router'

/** Which pages the agent read, and what code reads beyond them. */
function scope(): string {
  const cut = corpus.reports.filter((r) => r.pages_used_count < r.pages_total)
  const whole = corpus.reports.length - cut.length
  const parts = cut.map((r) => `${r.aris} (PDF pages ${r.pages_used[0]} to ${r.pages_used[1]} of ${r.pages_total.toLocaleString('en-CA')})`)
  return (
    `The agent read ${corpusPages} pages: ${whole} reports whole${cut.length ? `, and the report body of ${parts.join(' and ')}` : ''}. ` +
    (cut.length
      ? 'Their appendices hold the drill logs and lab certificates. The agent never reads them; code reads the collar and assay tables there to settle disagreements.'
      : '')
  )
}

export default function PropertyCard() {
  useHashScroll(true)
  return (
    <DemoLayout title="Property card">
      <SummaryBlock />
      <Timeline />
      <section className="fields-wrap" aria-labelledby="fields-h">
        <div className="section-head">
          <h2 id="fields-h" className="label">
            {fields.length} fields, one agent session each
          </h2>
          <p className="small muted">
            Click any value or source chip for the quote, its page and the calls behind it. {fieldsFile.text_field_note}
          </p>
          <p className="small muted">{scope()}</p>
        </div>
        <div className="fields">
          {fields.map((f) => (
            <FieldRow key={f.id} f={f} />
          ))}
        </div>
      </section>
    </DemoLayout>
  )
}
