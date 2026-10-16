import { Link } from '../router'
import { corpus, corpusPages, fields, index, locationSummary, longDate, model, run } from '../data/core'
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

// What the reports' own tables settle, straight from the card's data, so the walkthrough never says more than it.
const intervalParts = fields.flatMap((f) => (f.parts ?? []).filter((p) => p.rule === 'interval'))
const labSettled = intervalParts.flatMap((p) => p.groups.filter((g) => g.settled_by && g.disagree_on?.some((w) => w !== 'width')))[0]
const labChecked = intervalParts.reduce((n, p) => n + (p.lab_summary?.checked ?? 0), 0)
const labMatch = intervalParts.reduce((n, p) => n + (p.lab_summary?.match ?? 0), 0)
const labPart = intervalParts.find((p) => p.groups.includes(labSettled ?? p.groups[0]))

const STEPS = [
  {
    to: '/demo#location',
    shot: '/shots/location.png',
    alt: 'The Location row on the property card: two sides marked Sources disagree, the one most pages give marked Backed by the drill collars, and the drill collar line under them.',
    body:
      loc.state === 'disagree' ? (
        <>
          <strong>Open Location.</strong> One report's title page puts the work about {Math.round(loc.km ?? 0)} km west of where {loc.restPages} other pages, from all{' '}
          {say(loc.restReports)} reports, put it.{' '}
          {loc.settled ? (
            <>
              Code settles it with the reports' own drill collar tables: all {loc.settled.collars} holes drilled in 2022 and 2023 sit within{' '}
              {loc.settled.farthest_km} km of those pages and at least {Math.round(loc.settled.other_km ?? 0)} km from the title page.
            </>
          ) : (
            'You see both sides and the page each came from.'
          )}{' '}
          Click any value for its quote and its page on BC's ARIS archive.
        </>
      ) : (
        <>
          <strong>Open Location.</strong> Every source the agent found puts the work in the same place.
        </>
      ),
  },
  ...(labSettled?.settled_by && labPart
    ? [
        {
          to: `/demo#${labPart.id.replace('.', '-')}-${(labSettled.row ?? '').replace('c-', '')}`,
          shot: '/shots/lab.png',
          alt: 'A drill interval where two pages of one report give different copper, the side the lab assays back marked, and the lab result under them.',
          body: (
            <>
              <strong>Open the lab check on {labSettled.hole}.</strong> {labSettled.settled_by.line} Code checks every claimed interval the assays reach the
              same way: {labMatch} of {labChecked} match.
            </>
          ),
        },
      ]
    : []),
  {
    to: '/demo',
    shot: '/shots/summary.png',
    alt: "The agent's summary at the top of the property card: numbered sentences, each followed by the source chips it cites.",
    body: (
      <>
        <strong>Read the summary at the top of the card.</strong> A second session wrote it from the card alone. Every number in it is in a claim or code line
        it cites, and a sentence that touches a disagreement cites every side. Where its words go past its quotes, a note says so.
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
          <p className="walk-sub">A track 1 agent for Quminex's Riipen project, run on public BC assessment reports, with code that checks every value it finds.</p>
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
            Your Riipen brief asks for property evaluations built from technical reports, scored on accuracy and provenance, with results that are explainable and
            testable. This is track 1 on public data: an agent read {say(corpus.reports.length)} BC assessment reports on the Iron Lake property, {corpusPages} pages in all,
            and every line it wrote points back to a quoted page.
          </p>
          <p>
            The agent has four tools: search the pages, open a page, propose a claim with a quote, or say "Not in these sources". Code checks every quote against the page it
            cites and decides where reports disagree. Then it reads the reports' own drill tables, the hole collars and the lab assays, to say which number they back. A
            second session reads only the resulting card and writes a short evaluation. A 15-question eval scores the run and lists what it got wrong.
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
              <strong>The drill tables.</strong> The collar and assay tables in the same reports, including appendix pages the agent never reads. Code reads them itself
              and uses them only to settle or check what the agent claimed.
            </li>
            <li>
              <strong>The eval numbers, from that same run.</strong> I had Claude write the 15 questions and expected answers from the pages before the run, then had Codex (
              <span className="mono">gpt-6.1-sol</span>) check each one against its page without seeing the agent. The points the summary should make were set the same
              way, before it ran. A geologist hasn't checked any of it yet.
            </li>
            <li>
              <strong>Not here:</strong> NI 43-101 or JORC reports, which your brief names. I used BC assessment reports because they're public and I can link every page.
              There's no geological interpretation either. Every value on the card is a quote or a number code worked out from the reports' own tables.
            </li>
          </ul>

          <h2>Why Iron Lake</h2>
          <p>
            It has a long public record: {index.count} reports from {say(index.operators)} operators since {index.years[0]}, with drilling in 2022 and 2023 and the drill
            tables to check it against. The property is one config file: its name, the ARIS filter that finds its reports and the pages to read. Another property needs
            its own file and its own eval questions.
          </p>

          <div className="byline">
            <p>
              I'm Abdallah Safi, Computer Engineering at TMU. I'm the lead developer on{' '}
              <span className="nowrap">
                <a className="text-link" href="https://www.mydocuflow.ca" target="_blank" rel="noopener noreferrer">
                  MyDocuFlow
                  <ExternalIcon />
                </a>
                ,
              </span>{' '}
              the AI paperwork app a Calgary real estate brokerage, MaxWell Canyon Creek, runs its live deals on. I run my own AI dev team on it: Claude agents build,
              Codex agents review, a separate agent certifies each release, and I make the calls. <strong>24 certified releases in 3 weeks.</strong> This demo was
              built the same way: Claude agents built it and Codex reviewed every round, under rules I set.
            </p>
            <p>
              BESI hired me back for a second term. There I prototyped an AI hiring assessment that rejects any evidence quote not found word for word, the rule this demo's
              checker starts from.{' '}
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
