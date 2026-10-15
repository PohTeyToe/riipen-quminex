import { fields, fieldsFile } from '../data/core'
import { DemoLayout } from '../components/Layout'
import { FieldRow } from '../components/FieldRow'
import { Timeline } from '../components/Timeline'
import { useHashScroll } from '../router'

export default function PropertyCard() {
  useHashScroll(true)
  return (
    <DemoLayout title="Property card">
      <Timeline />
      <section className="fields-wrap" aria-labelledby="fields-h">
        <div className="section-head">
          <h2 id="fields-h" className="label">
            {fields.length} fields, one agent session each
          </h2>
          <p className="small muted">
            Click any value or source chip for the quote, its page and the calls behind it. {fieldsFile.text_field_note.replace(/^No disagreement check on text fields\. /, '')} Text fields
            show quotes only.
          </p>
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
