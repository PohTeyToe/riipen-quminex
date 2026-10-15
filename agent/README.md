# agent/

The track 1 agent, its checker, and the scripts that turn one run into `data/`.

## Pipeline

```
python agent/fetch_corpus.py          # ARIS index, detail pages, 7 PDFs -> data/private/ (gitignored)
python agent/extract_pages.py         # per-page text with PyMuPDF, PDF page numbers, scanned-page flags
python agent/scan_chars.py            # every non-ASCII character and what normalization does -> data/normalization.json
python agent/check_gold.py            # every gold quote must pass the checker; logs unanswerable searches
python agent/second_reader.py <dir>   # Codex reads the gold against the pages, never the agent
python agent/run_agent.py <run_id>    # one claude session per field
python agent/run_eval.py <run_id>     # one claude session per eval question, given only the question
python agent/build_data.py <run_id>   # claims, rejections, traces, excerpts, field states, scores
python agent/run_summary.py <id>      # one claude session that reads only the card and writes the summary
python agent/build_data.py <run_id>   # again: rechecks and scores the summary
python agent/brief_examples.py        # one example claim per track, all through the same checker
python -m pytest agent/tests          # runs on a small fixture corpus, no PDFs needed
```

Needs Python 3.12 (`pip install -r agent/requirements.txt`) and the `claude` CLI. The agent runs need the local corpus from `fetch_corpus.py`; the site and the tests don't.

## The four tools

`corpus_server.py` is a stdio MCP server and the agent's only tools:

- `search(query, report?)`: BM25 over pages, top 8 hits with a 200-character snippet. Lexical on purpose: hole IDs, units and coordinates are exact strings. Embeddings can come later if recall needs them.
- `open_page(report, page)`: the page's text.
- `propose_claim(field, value, report, page, quote, unit?, kind?)`: runs the checker at once and tells the agent the result, including "found on page N instead".
- `refuse(field_or_question, reason)`: records "Not in these sources".

Each session runs `claude -p` with `--tools ""`, `--strict-mcp-config` and only these four tools allowed, from an empty folder outside the repo. `runner.py` checks the first stream event lists exactly these four tools. Every call is logged by the server, and the data is rebuilt from that log, not from anything the model says.

## Code, not the model

- `checker.py`: the quote must be on the cited page after normalization (`textnorm.py`); if it isn't, the whole corpus is searched for it. The value must be in the quote, and a number never matches where the quote puts `<` or `>` in front of it. Each drill grade must sit with its own element: in its column of the table row (columns read from the table heading above the quote) or next to its name in a sentence. Quotes on scanned pages are matched against the OCR text but are only confirmed against the page image.
- `rules.py`: coordinates (5 km), NTS map area, text, numbers (0.1%) and drill intervals: same hole and depths overlapping by at least 90% of the longer one make the same interval; then widths (0.05 m) and every shared grade (the rounding of the numbers as written) are compared. An interval inside a longer one is listed under it. To minus from must equal the width within the written precision. Caveats attach by report and element.
- `card.py` and `card_server.py`: the summary session's three tools (read the card, read a field, propose a sentence) and the sentence check: every number in a sentence must be in what it cites, and a sentence that cites one side of a disagreement must cite every side.
- `score.py`: verdicts from expected values and required caveats in `data/eval/gold.json`, which the run scripts never read. An expected value counts only when the answer line states it, and a number in the answer that no cited quote contains fails the question.

The prompts in `prompts/` and the tool code are hashed into `data/run.json`. Changes made after the first eval run are listed with reasons in `data/eval/changes.json`.
