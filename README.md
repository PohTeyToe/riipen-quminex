# Iron Lake property file

A small track 1 agent for Quminex's Riipen project (Mineral Prospectivity Analysis Using Machine Learning), run on seven public BC assessment reports about the Iron Lake property, 566 pages in all. It has four tools: search the pages, open a page, propose a claim with a quote, or refuse. Code checks every quote against the page it cites and decides where the reports disagree. A second session reads only the resulting property card and writes a short cited evaluation; code keeps a sentence only if every number in it is in what it cites and it cites every side of any disagreement it touches. A 15-question eval scores the agent, 18 points written beforehand score the summary, and every claim and sentence the checks threw out is listed.

This site shows one run of it. Nothing on it is live and nothing the agent wrote was edited by hand.

Built by Abdallah Safi. Not made or endorsed by Quminex or by any company named in the reports.

## The pages

| Route | What it shows |
|---|---|
| `/` | Walkthrough for a cold reader: what this is, four things to try, what's real |
| `/demo` | Property card: the agent's summary, every Iron Lake report on ARIS as a timeline, then 12 fields. Compared fields read settled, disagreeing or "Not in these sources"; text fields show quotes, not compared. Every value opens its quote, its page on ARIS and the tool calls behind it. |
| `/demo/eval` | Five scores as counts, the 15 questions (misses first), the summary's points and the sentences code threw out, every claim the checker threw out, failure counts by type, what the misses say, and every change made after the first run |
| `/demo/brief` | The Riipen deliverables mapped to what exists here, the claim format with one example per track, a week-by-week plan and questions for a first call |

`/demo?claim=c-0337` opens the side panel on one claim, so a single value can be linked.

## Run it

Needs Node 20 or later.

```bash
npm install
npm run dev        # http://localhost:5101
npm run build      # type-check, then a static build in dist/
npm run preview    # serve dist/ on port 5101
```

It is a static Vite + React + TypeScript app. No backend and no secrets. Two optional build-time variables: `VITE_REPO_URL` turns on the "Code on GitHub" links once the repo is public (until then the site doesn't link to it), and `SITE_URL` sets the absolute URL in the link-preview tags (on Vercel, `VERCEL_PROJECT_PRODUCTION_URL` does this without setting anything). The only network calls are the outbound links to BC's ARIS archive. `vercel.json` rewrites every route to `index.html` so deep links survive a refresh, and sends `X-Robots-Tag: noindex`. Deploying it to Vercel as-is works: framework preset Vite, build command `npm run build`, output `dist`.

`.npmrc` sets `legacy-peer-deps=true` because npm 10.8 crashes resolving Vite 8's optional peer dependencies without it.

## Rerun the agent

The agent, its checker and the scripts that turn a run into `data/` are in `agent/`. The full pipeline is in `agent/README.md`. In short:

```bash
pip install -r agent/requirements.txt     # Python 3.12
python agent/fetch_corpus.py              # downloads the 7 PDFs into data/private/ (gitignored)
python agent/extract_pages.py
python agent/run_agent.py <run_id>        # one claude CLI session per field
python agent/run_eval.py <run_id>         # one session per eval question, given only the question
python agent/build_data.py <run_id>       # claims, rejections, traces, excerpts, field states, scores
python agent/run_summary.py <summary_id>  # one session that reads only the card and writes the summary
python agent/build_data.py <run_id>       # again, to pick up and score the summary
python -m pytest agent/tests              # runs on a small fixture corpus, no PDFs needed
```

The runs need the `claude` CLI. Each session gets only the four corpus tools (`--tools ""`, `--strict-mcp-config`), and the runner checks the first stream event lists exactly those four. Search is BM25 over page text, lexical on purpose: hole IDs, units and coordinates are exact strings, and embeddings can come later if recall needs them.

The site reads `data/*.json` at build time. After a new run, rebuild the site; nothing in the app needs to change.

## What's real, what's computed, what's written by hand

- **From BC's public records.** The ARIS index records, page counts, report text, quotes and PDF page numbers. Every quote links to its page on ARIS.
- **From the agent run.** Every claim, refusal and tool call on the property card and in the eval answers. Model `claude-opus-5-5` through the `claude` CLI, on 2026-10-15. There were two full runs; the site shows run 2. Why, and every change between them, is in `data/eval/changes.json` and on the Eval tab.
- **From the summary session.** The summary at the top of the card and every sentence it proposed (`data/summary.json`), written by `claude-opus-5-5` from the card alone with three tools (read the card, read a field, propose a sentence).
- **Computed by code.** Quote checks, field states, disagreement groups, distances and the to-minus-from arithmetic (`agent/checker.py`, `agent/rules.py`), the summary checks (`agent/card.py`), and the scores (`agent/score.py`). Every claim the run accepted is checked again with the checker as it is now each time the data is built; `data/run.json` records the result.
- **Written by hand, and labelled on the site.** The 15 eval questions and expected answers (written by Claude from the pages before the first run, checked by Codex `gpt-6.1-sol` without seeing the agent; no geologist has checked them), the 18 points the summary should make (`data/eval/summary_gold.json`, written by Claude before the summary ran), Claude's notes under two summary sentences (`data/eval/summary_review.json`, from reading every sentence against its quotes), the track 2 and track 3 example claims on the Brief tab, and "What the misses say" on the Eval tab (written by Claude after the run).

Claims on scanned pages are never counted as code-checked. Each one was checked against a rendering of the page image, and the side panel says who checked it and when. On 36807 p1, the lone source of the location disagreement, Codex also read the page image separately as second reader of the eval answers, and the panel says so. If Abdallah checks that page by eye too, set `owner_check.done`, `by` and `date` in `data/image_checks.json` and rebuild; the panel then says "Checked by eye against the page image".

## Why there are no page images

The ARIS dataset is licensed "Access Only" in the BC Data Catalogue, and the province's copyright page says its material "may not be reproduced or redistributed without the prior written permission of the Province of British Columbia." So this site ships no page images and no copies of the PDFs. Each claim ships at most 400 characters of its page, counting the quote as written: the quote, then a little context if there is room. A longer quote (the agent may quote up to 600) is cut to the part around its value, and the panel says so. If a page's claims together would ship more than half of its text, the context goes first, then long text quotes shrink to their value. Three short pages stay over half because their quotes alone are; `data/excerpts.json` lists them and the share of each report the site ships (under 25% for every report; the most is the body of 41327). Every page links to ARIS (`<pdf url>#page=N`). Full page text, full quotes and the PDFs stay in `data/private/`, which is gitignored.

## Sources

Every source, URL and retrieval date is in `data/SOURCES.md`. The main ones:

- ARIS index, BC Geographic Warehouse WFS layer `WHSE_MINERAL_TENURE.ARIS_MINERAL_REPORTS`, filtered to property name Iron Lake: 22 reports, 2001 to 2025, 8 operators.
- ARIS detail pages and report PDFs for 34595, 36430, 36807, 38640, 40980, 41327 (PDF pages 5 to 49) and 41800 (PDF pages 5 to 45).
- BC Data Catalogue ARIS dataset `af68d1d1-b85e-4ea9-b5f3-e09fc83f3f4f`, and `gov.bc.ca/copyright`.

Report text belongs to its authors and is quoted from BC's ARIS archive.

## Layout

```
src/            the site (React, no router library, plain CSS)
  data/         typed readers for data/*.json and the display helpers
  components/   field rows, side panel, timeline, trace
  pages/        walkthrough, property card, eval, brief
public/shots/   screenshots of this site used on the walkthrough
data/           everything the site reads (see data/SOURCES.md)
agent/          the agent, the checker, the eval scripts and their tests
```
