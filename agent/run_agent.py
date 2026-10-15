"""Run the agent: one session per field, then (with --eval) one per eval question.

Usage: python agent/run_agent.py <run_id> [--workers 4] [--only location,map_sheet] [--eval]

The eval sessions get only the question text (see run_eval.py). Outputs go to
data/private/runs/<run_id>/; agent/build_data.py turns them into data/*.json.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json

import corpus
from runner import EFFORT, MAX_TURNS, MODEL, PRIVATE, PROMPTS, TOOLS, frozen_hashes, run_session


def reports_block() -> str:
    wfs = json.loads((PRIVATE / "raw" / "wfs.json").read_text(encoding="utf-8"))
    rec = {f["properties"]["ARIS_NUMBER"]: f["properties"] for f in wfs["features"]}
    lines = []
    for r in corpus.CORPUS:
        p = rec[r["aris"]]
        op = p["OPERATOR_NAMES"].split(" (")[0]
        lines.append(f"- {r['aris']}: {p['ASSESSMENT_REPORT_TITLE']} (report year {p['REPORT_YEAR']}, {op}), "
                     f"PDF pages {r['first_page']} to {r['last_page']}")
    return "\n".join(lines)


def parts_block(field: dict) -> str:
    if not field.get("parts"):
        return ""
    bits = [f'`{p["id"]}` for {p["name"].lower()} (kind "{p["kind"]}")' for p in field["parts"]]
    return "This field has parts. Use these ids in propose_claim: " + ", and ".join(bits) + "."


def field_prompt(field: dict, reports: str) -> str:
    tpl = (PROMPTS / "field.md").read_text(encoding="utf-8")
    return tpl.format(name=field["name"], id=field["id"], definition=field["definition"],
                      parts=parts_block(field), reports=reports).replace("\n\n", "\n")


def manifest(run_dir, kind: str, sessions: list[dict]) -> None:
    path = run_dir / "manifest.json"
    m = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    m.setdefault("runs", []).append({
        "kind": kind, "finished": dt.datetime.now(dt.timezone.utc).isoformat(),
        "model": MODEL, "effort": EFFORT, "max_turns": MAX_TURNS, "tools": TOOLS,
        "frozen_hashes": frozen_hashes(), "sessions": [s["session"] for s in sessions]})
    path.write_text(json.dumps(m, indent=1), encoding="utf-8")


def run_all(run_dir, jobs: list[tuple[str, str]], workers: int) -> list[dict]:
    out = []
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(run_session, run_dir, s, p): s for s, p in jobs}
        for f in cf.as_completed(futs):
            m = f.result()
            out.append(m)
            print(f"{m['session']}: {m['result_subtype']} in {m['num_turns']} turns, {m['seconds']}s, "
                  f"tools={len(m['init_tools'] or [])}", flush=True)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_id")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    run_dir = PRIVATE / "runs" / args.run_id
    fields = json.loads((PROMPTS / "fields.json").read_text(encoding="utf-8"))
    only = {x for x in args.only.split(",") if x}
    reports = reports_block()
    jobs = [(f"field-{f['id']}", field_prompt(f, reports)) for f in fields if not only or f["id"] in only]
    sessions = run_all(run_dir, jobs, args.workers)
    manifest(run_dir, "fields", sessions)


if __name__ == "__main__":
    main()
