/** A rule code applied, one click away. */
export function Rule({ text }: { text?: string }) {
  if (!text) return null
  return (
    <details className="rule">
      <summary>Rule</summary>
      <p>{text}</p>
    </details>
  )
}
