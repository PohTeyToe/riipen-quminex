import { Link } from '../router'
import { corpus, corpusPages, index, locationSummary, longDate, model, run } from '../data/core'
import { LINKS } from '../links'
import { ExternalIcon } from '../components/Icons'

const loc = locationSummary()
const proposed = run.claims_accepted + run.claims_rejected
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const say = (n: number) => words[n] ?? String(n)

const STEPS = [
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
        <strong>Click any value.</strong> You get the exact quote and a link to that page on BC's ARIS archive.
      </>
    ),
  },
  {
    to: '/demo#resource_estimate',
    shot: '/shots/resource.png',
    alt: 'The Resource estimate row, reading Not in these sources, with the searches the agent ran before it refused.',
    body: (
      <>
        <strong>Look at Resource estimate.</strong> It's blank, because none of these reports has one.
      </>
    ),
  },
  {
    to: '/demo/eval',
    shot: '/shots/eval.png',
    alt: 'The Eval tab: four scores as counts, then the questions, then every claim the checker threw out.',
    body: (
      <>
        <strong>Open the Eval tab.</strong> All 15 questions passed, which mostly says the set is too easy. Under them is every claim the checker threw out,{' '}
        {run.claims_rejected} of {proposed}, with the reason.
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
            <a href={LINKS.repo} className="button is-quiet" target="_blank" rel="noopener noreferrer">
              Code on GitHub
              <ExternalIcon />
            </a>
          </div>
        </header>

        <div className="prose">
          <p>
            Your Riipen brief asks for property evaluations built from technical reports, scored on accuracy and provenance. Summaries are the easy part. The hard part is the
            line where two reports disagree, the assay that came back below detection, and the question no report answers. If a geologist can't check a line in a few seconds,
            they won't trust the rest.
          </p>
          <p>
            So I pointed a small agent at {say(corpus.reports.length)} public reports on the Iron Lake property in BC, {corpusPages} pages in all. It has four tools: search the
            pages, open a page, propose a claim with a quote, or say "Not in these sources". Code checks every quote against the page it cites, and code decides where reports
            disagree. Then a 15-question eval scores the run and lists what it got wrong.
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
              <strong>The eval numbers, from that same run.</strong> Claude drafted the 15 questions and answers from the pages before the run, and Codex (
              <span className="mono">gpt-6.1-sol</span>) checked them against the pages. A geologist hasn't checked them yet.
            </li>
            <li>
              <strong>Not here:</strong> NI 43-101 or JORC reports, which your brief names. I used BC assessment reports because they're public and I can link every page.
              There's no geological interpretation either. Every line is quoted.
            </li>
          </ul>

          <h2>Why Iron Lake</h2>
          <p>
            It has {index.count} reports from {say(index.operators)} operators since {index.years[0]}, recent drilling, and a few places where the reports disagree. That's where a
            property synthesis gets hard. The same pipeline can point at any property you pick.
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
