# Iron Lake property file

A track 1 agent for Quminex's Riipen project (Mineral Prospectivity Analysis Using Machine Learning), run on seven public BC assessment reports about the Iron Lake property, 566 pages in all. It has four tools: search the pages, open a page, propose a claim with a quote, or refuse. Code checks every quote against the page it cites and decides where the reports disagree. Then it reads the reports' own drill tables, the hole collars and the lab assays, and says which side they back: the collars settle the location and map sheet, a collar table settles the 2023 total, and the lab assays settle two drill intervals and catch a 2022 table row whose width and copper don't match its own lab sample. A second session reads only the resulting property card and writes a short cited evaluation; code keeps a sentence only if every number in it is in what it cites and it cites every side of any disagreement it touches. A 15-question eval scores the agent, 21 points written beforehand score the summary, and every claim and sentence the checks threw out is listed.

This site shows one run of it. Nothing on it is live and nothing the agent wrote was edited by hand.

Built by Abdallah Safi. Not made or endorsed by Quminex or by any company named in the reports.

## The pages

| Route | What it shows |
|---|---|
| `/`, `/demo` | The run and the file it made, on one screen. On top, the recorded run: 27 sessions in eight worker lanes over 7:32, every tool call a tick at its logged time (reads grey, kept claims blue, thrown-out claims red, refusals as rings), with Replay at 10, 30 or 60 times real time, counts and cost that move with it, a feed under the chart (every throw-out with the retry that fixed it, every refusal, and the latest call at the playhead), and the steps after the run (quote checker, drill tables, summary session, eval). Below, the property file's 12 fields with their status and when each field's session ran. One inspector on the right (a sheet on phones) opens whatever is clicked: a field (the location map, the drill holes as core strips with the lab's copper, the agent's refusal), a value (where the quote sits on its page, drawn larger on a click, the quote, the checker's verdict, the calls that made it), a session (every call), a drill hole (its lab samples against the report's intervals) or a step. "How it works" in the header holds the method. |
| `/demo/eval` | The 15 questions as a pass/miss strip by category, then each question (misses first, open) with the agent's answer, the expected one, what code found missing, and the session's calls; the summary's points; notes on the misses and why there were two runs |
| `/demo/brief` | The Riipen deliverables mapped to what exists here, and the claim format with one example per track |

`/demo#location` (any field id) opens that field. `/demo?claim=c-0337` opens one value, so a single claim can be linked. `/demo/eval#q08` opens one question.

Where a 2022 or 2023 table row and its own lab samples disagree and code can't settle it, the hole view asks the reader which figures the file should carry. That pick is the reader's own and stays in their browser (`localStorage`); nothing is sent anywhere.

## Run it

Needs Node 20 or later.

```bash
npm install
npm run dev        # http://localhost:5101
npm run build      # type-check, then a static build in dist/
npm run preview    # serve dist/ on port 5101
```

It is a static Vite + React + TypeScript app. No backend and no secrets. Two optional build-time variables: `VITE_REPO_URL` overrides the code link (default: the public repo on GitHub), and `SITE_URL` sets the absolute URL in the link-preview tags (on Vercel, `VERCEL_PROJECT_PRODUCTION_URL` does this without setting anything). The only network calls are the outbound links to BC's ARIS archive. `vercel.json` rewrites every route to `index.html` so deep links survive a refresh, and sends `X-Robots-Tag: noindex`. Deploying it to Vercel as-is works: framework preset Vite, build command `npm run build`, output `dist`.

`.npmrc` sets `legacy-peer-deps=true` because npm 10.8 crashes resolving Vite 8's optional peer dependencies without it.

## Rerun the agent

The agent, its checker and the scripts that turn a run into `data/` are in `agent/`. The full pipeline is in `agent/README.md`. In short:

```bash
pip install -r agent/requirements.txt     # Python 3.12
python agent/fetch_corpus.py              # downloads the PDFs into data/private/ (gitignored)
python agent/extract_pages.py
python agent/extract_tables.py            # the drill collar and lab assay tables, from every page of each PDF
python agent/run_agent.py <run_id>        # one claude CLI session per field
python agent/run_eval.py <run_id>         # one session per eval question, given only the question
python agent/build_data.py <run_id>       # claims, rejections, traces, excerpts, field states, scores
python agent/run_summary.py <summary_id>  # one session that reads only the card and writes the summary
python agent/build_data.py <run_id>       # again, to pick up and score the summary
python -m pytest agent/tests              # runs on a small fixture corpus, no PDFs needed
```

The property is one config file, `agent/property.json`: its name, the ARIS filter that finds its reports, and the pages the agent reads. Another property needs its own file and its own eval questions.

The runs need the `claude` CLI. Each session gets only the four corpus tools (`--tools ""`, `--strict-mcp-config`), and the runner checks the first stream event lists exactly those four. Search is BM25 over page text, lexical on purpose: hole IDs, units and coordinates are exact strings, and embeddings can come later if recall needs them.

The site reads `data/*.json` at build time. After a new run, rebuild the site; nothing in the app needs to change.

## What's real, what's computed, what's written by hand

- **From BC's public records.** The ARIS index records, page counts, report text, quotes and PDF page numbers. Every quote links to its page on ARIS.
- **From the agent run.** Every claim, refusal and tool call on the property card and in the eval answers. Model `claude-opus-5-5` through the `claude` CLI, on 2026-10-15. There were two full runs; the site shows run 2. Why, and every change between them, is in `data/eval/changes.json` and on the Eval tab. The run chart's times are the corpus server's own call log and each session's start time, and its cost and tokens are each session's result message from the CLI (`agent/build_timeline.py` writes `data/timeline.json`). The log doesn't name threads, so the eight lanes pack each four-at-a-time pool by start time.
- **From the summary session.** The summary on the property file and every sentence it proposed (`data/summary.json`), written by `claude-opus-5-5` from the card alone with three tools (read the card, read a field, propose a sentence).
- **Computed by code.** Quote checks, field states, disagreement groups, distances and the to-minus-from arithmetic (`agent/checker.py`, `agent/rules.py`), what the reports' drill tables settle (`agent/extract_tables.py`, `agent/rules.py`), the summary checks (`agent/card.py`), and the scores (`agent/score.py`). Every claim the run accepted is checked again with the checker as it is now each time the data is built; `data/run.json` records the result. The core strips and hole logs draw `data/drill.json` (`agent/build_drill.py`): the 26 collars, the 2,980 lab samples the lab-check code reads, and `rules.lab_check` run on every interval the agent copied. The page maps draw `data/page_maps.json` (`agent/build_page_maps.py`): where each quote's lines sit on its page.
- **Written by hand, and labelled on the site.** The 15 eval questions and expected answers (written with Claude from the pages before the first run, checked by Codex `gpt-6.1-sol` without seeing the agent; no geologist has checked them), the 21 points the summary should make (`data/eval/summary_gold.json`, written before the summary ran), Claude's notes under two summary sentences (`data/eval/summary_review.json`, from reading every sentence against its quotes), the image checks of scanned pages (`data/image_checks.json`), the track 2 and track 3 example claims on the Brief tab, and "What the misses say" on the Eval tab (written by Claude after the run).

Claims on scanned pages are never counted as code-checked. Each one was checked against a rendering of the page image, and the value's panel in the inspector says who checked it and when. On 36807 p1, the lone source of the location disagreement, Codex also read the page image separately as second reader of the eval answers, and the panel says so. If Abdallah checks that page by eye too, set `owner_check.done`, `by` and `date` in `data/image_checks.json` and rebuild; the panel then says "Checked by eye against the page image".

## Why there are no page images

The ARIS dataset is licensed "Access Only" in the BC Data Catalogue, and the province's copyright page says its material "may not be reproduced or redistributed without the prior written permission of the Province of British Columbia." So this site ships no page images and no copies of the PDFs. Each claim ships at most 400 characters of its page, counting the quote as written: the quote, then a little context if there is room. A longer quote (the agent may quote up to 600) is cut to the part around its value, and the panel says so. If the site would ship more than half of a page's text, the context goes first, then long text quotes shrink to their value. That count covers every file the site imports (excerpts, quotes, values, gold quotes, notes), and a passage the reports repeat counts against every page that has it: the three Tech-X reports share whole sections. `data/shipped.json` has the result: 29% of the 41327 body and 28% of the 41800 body, at most 15% of the other five, and 14 pages still over half because their quotes alone are. The drill tables ship as values (hole, coordinates, depths, sample results). The page maps ship geometry only: the box of each text line on a cited page and which lines hold the quote, so the site can draw where a quote sits without shipping the page. Every page links to ARIS (`<pdf url>#page=N`). `python agent/shipped.py` recounts the shares after a change to what the site imports. Full page text, full quotes and the PDFs stay in `data/private/`, which is gitignored.

## Sources

Every source, URL and retrieval date is in `data/SOURCES.md`. The main ones:

- ARIS index, BC Geographic Warehouse WFS layer `WHSE_MINERAL_TENURE.ARIS_MINERAL_REPORTS`, filtered to property name Iron Lake: 22 reports, 2001 to 2025, 8 operators.
- ARIS detail pages and report PDFs for 34595, 36430, 36807, 38640, 40980, 41327 (PDF pages 5 to 49) and 41800 (PDF pages 5 to 45). Code also reads the drill tables elsewhere in 41327 and 41800: the collar tables (41327 p30 and p51, 41800 p33 and p162) and the lab assay tables (41327 p387 to p564, 41800 p411 to p436).
- BC Data Catalogue ARIS dataset `af68d1d1-b85e-4ea9-b5f3-e09fc83f3f4f`, and `gov.bc.ca/copyright`.

Report text belongs to its authors and is quoted from BC's ARIS archive.

## Layout

```
src/            the site (React, no router library, plain CSS)
  data/         typed readers for data/*.json, the drill tables and the page maps, and their tests
  components/   run chart and console, property file table, inspector and its views, location map, core strips
  pages/        run, eval, brief
data/           everything the site reads (see data/SOURCES.md)
agent/          the agent, the checker, the eval scripts, the site's data builders and their tests
```

`npm test` runs the site's tests (vitest); `python -m pytest agent/tests` runs the agent's.
