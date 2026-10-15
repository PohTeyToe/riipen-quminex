import { Link } from '../router'
import { corpus, corpusPages, index, locationSummary, longDate, model, run } from '../data/core'
import { LINKS } from '../links'
import { ExternalIcon } from '../components/Icons'
import scoresJson from '../../data/eval/scores.json'
import summaryJson from '../../data/summary.json'

const scores = scoresJson as unknown as Record<'answer_accuracy' | 'disagreements_flagged' | 'correct_refusals', { n: number; of: number }>
const summaryRun = summaryJson as unknown as { date: string; model: string; sentences: unknown[] }

const loc = locationSummary()
const proposed = run.claims_accepted + run.claims_rejected
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const say = (n: number) => words[n] ?? String(n)

const STEPS = [
  {
    to: '/demo',
    shot: '/shots/summary.png',
    alt: 'The agent\'s summary at the top of the property card: numbered sentences, each followed by the source chips it cites.',
    body: (
      <>
        <strong>Read the summary at the top of the card.</strong> A second session wrote it from the card alone. Every number in it is in a claim it cites, and a
        sentence that touches a disagreement has to cite every side. Click a source chip to see the quote.
      </>
    ),
  },
  {
    to: '/demo#location',
    shot: '/shots/location.png',
    alt: 'The Location row on the property card: two groups side by side marked Sources disagree, with the 62 km code line under them.',
    body:
      loc.state === 'disagree' ? (
        <>
          <strong>Open Location.</strong> One report's title page puts the work about {Math.round(loc.km ?? 0)} km west of where {loc.restPages} other pages, from all{' '}
          {say(loc.restReports)} reports, put it. That includes the same report's own cover page. You see both sides and the page each came from.
        </>
      ) : (
        <>
          <strong>Open Location.</strong> Every source the agent found puts the work in the same place.
        </>
      ),
  },
  {
    to: loc.lone ? `/demo?claim=${loc.lone.claims[0]}#location` : '/demo#location',
    shot: '/shots/panel.png',
    alt: 'The side panel for one value: the quote highlighted in its excerpt, the check result and a link to the page on ARIS.',
    body: (
      <>
        <strong>Click any value.</strong> You get the exact quote, a link to that page on BC's ARIS archive and the tool calls that produced it.
      </>
    ),
  },
  {
    to: '/demo/eval',
    shot: '/shots/eval.png',
    alt: 'The Eval tab: the scores as counts, then the questions with the misses first.',
    body: (
      <>
        <strong>Open the Eval tab.</strong> {scores.answer_accuracy.n} of {scores.answer_accuracy.of} answerable questions pass, {scores.disagreements_flagged.n} of{' '}
        {scores.disagreements_flagged.of} disagreement questions and {scores.correct_refusals.n} of {scores.correct_refusals.of} refusals. The misses come first, with what
        they show, and below them every claim the checker threw out, {run.claims_rejected} of {proposed}.
      </>
    ),
  },
]

export default function Walkthrough() {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <main id="main" className="walk">
        <header className="walk-head">
          <h1>Iron Lake property file</h1>
          <p className="walk-sub">A small track 1 agent for Quminex's Riipen project, run on public BC assessment reports.</p>
          <div className="walk-actions">
            <Link to="/demo" className="button is-primary">
              Open the property file
            </Link>
            <Link to="/demo/brief" className="button">
              How it maps to your brief
            </Link>
            {LINKS.repo && (
              <a href={LINKS.repo} className="button is-quiet" target="_blank" rel="noopener noreferrer">
                Code on GitHub
                <ExternalIcon />
              </a>
            )}
          </div>
        </header>

        <div className="prose">
          <p>
            Your Riipen brief asks for property evaluations built from technical reports, scored on accuracy and provenance. This is a small track 1 version on public data: an
            agent read {say(corpus.reports.length)} BC assessment reports on the Iron Lake property, {corpusPages} pages in all, and every line it wrote points back to a
            quoted page.
          </p>
          <p>
            The agent has four tools: search the pages, open a page, propose a claim with a quote, or say "Not in these sources". Code checks every quote against the page it
            cites and decides where reports disagree. A second session reads only the resulting card and writes a short evaluation, and code keeps a sentence only if its
            numbers are in what it cites. A 15-question eval scores the run and lists what it got wrong.
          </p>
        </div>

        <section className="try" aria-labelledby="try-h">
          <h2 id="try-h">Try this first</h2>
          <ol className="try-list">
            {STEPS.map((s, i) => (
              <li key={s.shot} className="try-step">
                <div className="try-text">
                  <span className="try-n num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <p>{s.body}</p>
                  <Link to={s.to} className="text-link small">
                    Go there
                  </Link>
                </div>
                <Link to={s.to} className="try-shot" aria-label={`Go to step ${i + 1}`} tabIndex={-1}>
                  <img src={s.shot} alt={s.alt} width={720} height={450} loading="lazy" />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <div className="prose">
          <h2>What's real</h2>
          <ul className="real">
            <li>
              <strong>The reports, quotes and page numbers.</strong> All public on ARIS. I quote and link them. I don't rehost them.
            </li>
            <li>
              <strong>The agent run.</strong> Claude (<span className="mono">{model}</span>) ran it on {longDate(run.date)} with only those four tools. Nothing on the card was
              edited by hand. There were {say(run.full_runs)} full runs. {run.full_runs_note}
            </li>
            <li>
              <strong>The summary.</strong> A second session (<span className="mono">{summaryRun.model}</span>) wrote it on {longDate(summaryRun.date)} from the card alone,
              with three tools: read the card, read a field, propose a sentence. Nobody edited its {summaryRun.sentences.length} sentences.
            </li>
            <li>
              <strong>The eval numbers, from that same run.</strong> Claude drafted the 15 questions and answers from the pages before the run, and Codex (
              <span className="mono">gpt-6.1-sol</span>) checked them against the pages. Claude also listed the points the summary should make before it ran. A geologist hasn't checked any of it yet.
            </li>
            <li>
              <strong>Not here:</strong> NI 43-101 or JORC reports, which your brief names. I used BC assessment reports because they're public and I can link every page.
              There's no geological interpretation either. Every value on the card is a quote, and the summary only restates the claims it cites.
            </li>
          </ul>

          <h2>Why Iron Lake</h2>
          <p>
            It has a long public record: {index.count} reports from {say(index.operators)} operators since {index.years[0]}, with drilling in 2022 and 2023. The same pipeline
            can point at any property you pick.
          </p>

          <p className="byline">
            I'm Abdallah Safi, a 4th-year Computer Engineering student at TMU. At JobJoy this spring I built an extraction pipeline with retrieval, evidence checks and
            deterministic scoring. It reached 94% recall against the expert's picks the first time we measured it.{' '}
            <a className="text-link" href={LINKS.github} target="_blank" rel="noopener noreferrer">
              GitHub
              <ExternalIcon />
            </a>{' '}
            <a className="text-link" href={LINKS.linkedin} target="_blank" rel="noopener noreferrer">
              LinkedIn
              <ExternalIcon />
            </a>
          </p>
        </div>
      </main>
      <footer className="footer">
        <div className="footer-inner is-walk small">
          <p>
            Built by Abdallah Safi for Quminex's Riipen project. Not made or endorsed by Quminex. Report text belongs to its authors and is quoted from BC's ARIS archive.
          </p>
        </div>
      </footer>
    </>
  )
}
