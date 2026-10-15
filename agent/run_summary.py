"""Run the summary session: one claude session that reads the property card and writes a short,
cited evaluation of the property, one code-checked sentence at a time.

Usage: python agent/run_summary.py <summary_id>

Run build_data.py first: the session reads data/fields.json and data/private/card_claims.json.
It never reads data/eval/summary_gold.json; build_data.py scores the summary against it afterwards.
Writes data/private/summaries/<summary_id>/.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json

import corpus
from runner import AGENT, EFFORT, MODEL, PRIVATE, PROMPTS, run_session

TOOLS = ["mcp__card__read_card", "mcp__card__read_field", "mcp__card__propose_sentence"]
FROZEN = {"prompt": PROMPTS / "summary.md", "card.py": AGENT / "card.py", "card_server.py": AGENT / "card_server.py",
          "fields.json": corpus.DATA / "fields.json", "card_claims.json": PRIVATE / "card_claims.json",
          "summary_gold.json": corpus.DATA / "eval" / "summary_gold.json"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("summary_id")
    args = ap.parse_args()
    run_dir = PRIVATE / "summaries" / args.summary_id
    hashes = {k: hashlib.sha256(p.read_bytes()).hexdigest() for k, p in FROZEN.items()}
    meta = run_session(run_dir, "summary", "Write the summary of the Iron Lake property card.",
                       server="card", tools=TOOLS, system=PROMPTS / "summary.md")
    only_card = sorted(meta["init_tools"] or []) == sorted(TOOLS)
    (run_dir / "manifest.json").write_text(json.dumps({
        "finished": dt.datetime.now(dt.timezone.utc).isoformat(), "model": MODEL, "effort": EFFORT, "tools": TOOLS,
        "only_card_tools": only_card, "frozen_hashes": hashes}, indent=1), encoding="utf-8")
    print(f"summary: {meta['result_subtype']} in {meta['num_turns']} turns, {meta['seconds']}s, only card tools: {only_card}")


if __name__ == "__main__":
    main()
