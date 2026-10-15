"""Run the eval: one agent session per question, given only the question text.

This script reads data/eval/questions.json and nothing else from data/eval/.
It never opens the gold answers; score.py does that afterwards.

Usage: python agent/run_eval.py <run_id> [--workers 4] [--only q01,q02]
"""
from __future__ import annotations

import argparse
import json

import corpus
from run_agent import manifest, run_all
from runner import PRIVATE, PROMPTS


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_id")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    run_dir = PRIVATE / "runs" / args.run_id
    questions = json.loads((corpus.DATA / "eval" / "questions.json").read_text(encoding="utf-8"))
    only = {x for x in args.only.split(",") if x}
    tpl = (PROMPTS / "question.md").read_text(encoding="utf-8")
    jobs = [(f"eval-{q['id']}", tpl.format(question=q["question"])) for q in questions if not only or q["id"] in only]
    sessions = run_all(run_dir, jobs, args.workers)
    manifest(run_dir, "eval", sessions)


if __name__ == "__main__":
    main()
