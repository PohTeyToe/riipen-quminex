"""The run as it happened: when each session started and ended, and when each tool call was logged.

Usage: python agent/build_timeline.py [run_id] [summary_id]
Defaults: the run and summary named in data/run.json and data/summary.json.

Reads the corpus server's own call log (data/private/runs/<run_id>/<session>.tools.jsonl, one line per call
with the time it was logged) and each session's meta file (start time and length). Writes data/timeline.json,
which holds times, tool names and accept/reject results only: no page text, no quotes.

A call's index in its session matches its step in data/traces.json, so the site can show what each call was.
Workers are the four-at-a-time pools in run_agent.py (fields) and run_eval.py (eval), which ran side by side.
A session goes in the first worker of its pool that was free when it started.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PRIVATE = DATA / "private"
SLACK = 0.2  # seconds; see assign_lanes
WORKERS = 4  # run_agent.py and run_eval.py both default to --workers 4, and both ran with it

# One letter per call keeps the file small: the site has hundreds of calls to draw.
CODES = {"search": "s", "open_page": "o", "refuse": "r", "read_card": "c", "read_field": "f"}


def ts(iso: str) -> dt.datetime:
    return dt.datetime.fromisoformat(iso)


def code(call: dict) -> str:
    t = call["tool"]
    if t in ("propose_claim", "propose_sentence"):
        return "p" if call["result"].get("accepted") else "x"
    return CODES[t]


def lines(p: Path) -> list[dict]:
    return [json.loads(ln) for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]


def assign_lanes(sessions: list[dict], workers: int) -> None:
    """First free worker at each session's start. A pool of n never needs more than n. A session's length in its
    meta file is rounded to 0.1 s and counts the CLI shutting down, so the next session in the same worker can
    start up to a few hundredths of a second before it "ends"; SLACK allows for that."""
    free_at: list[float] = []
    for s in sorted(sessions, key=lambda x: x["start"]):
        lane = next((i for i, t in enumerate(free_at) if t <= s["start"] + SLACK), None)
        if lane is None:
            lane = len(free_at)
            free_at.append(0.0)
        if lane >= workers:
            raise SystemExit(f"{s['id']} needs worker {lane + 1} of a pool of {workers}: the logs don't fit the pool")
        free_at[lane] = s["end"]
        s["lane"] = lane


def build(run_id: str, summary_id: str) -> dict:
    run_dir = PRIVATE / "runs" / run_id
    metas = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(run_dir.glob("*.meta.json"))]
    t0 = min(ts(m["started"]) for m in metas)
    sessions = []
    for m in metas:
        sid = m["session"]
        calls = lines(run_dir / f"{sid}.tools.jsonl")
        start = (ts(m["started"]) - t0).total_seconds()
        end = start + m["seconds"]
        out = []
        for c in calls:
            t = (ts(c["ts"]) - t0).total_seconds()
            if not start - 0.01 <= t <= end + 0.01:
                raise SystemExit(f"{sid}: a call at {t:.1f} s falls outside the session ({start:.1f} to {end:.1f} s)")
            out.append([round(t, 2), code(c)])
        kind = "field" if sid.startswith("field-") else "eval"
        sessions.append({
            "id": sid,
            "kind": kind,
            "ref": sid.split("-", 1)[1],
            "start": round(start, 2),
            "end": round(end, 2),
            "turns": m.get("num_turns"),
            "result": m.get("result_subtype"),
            "cost_usd": round(m.get("total_cost_usd") or 0, 4),
            "output_tokens": m["usage"]["output_tokens"],
            "calls": out,
        })
    for kind in ("field", "eval"):
        assign_lanes([s for s in sessions if s["kind"] == kind], WORKERS)
    sessions.sort(key=lambda s: (s["kind"] != "field", s["lane"], s["start"]))

    sdir = PRIVATE / "summaries" / summary_id
    sm = json.loads((sdir / "summary.meta.json").read_text(encoding="utf-8"))
    s0 = ts(sm["started"])
    scalls = lines(sdir / "summary.tools.jsonl")
    summary = {
        "id": summary_id,
        "started": sm["started"],
        "seconds": sm["seconds"],
        "cost_usd": round(sm.get("total_cost_usd") or 0, 4),
        "output_tokens": sm["usage"]["output_tokens"],
        "calls": [[round((ts(c["ts"]) - s0).total_seconds(), 2), code(c)] for c in scalls],
    }

    all_calls = [c for s in sessions for c in s["calls"]]
    count = lambda k, xs=all_calls: sum(1 for c in xs if c[1] == k)  # noqa: E731
    wall = max(s["end"] for s in sessions)
    return {
        "run": run_id,
        "started": t0.isoformat(),
        "note": "Times come from the corpus server's call log and each session's start time; cost and tokens from each "
                "session's result message (the CLI's own count, at API list price). Nothing here was typed in.",
        "workers": WORKERS,
        "wall_seconds": round(wall, 1),
        "session_seconds": round(sum(s["end"] - s["start"] for s in sessions), 1),
        "cost_usd": round(sum(s["cost_usd"] for s in sessions), 2),
        "output_tokens": sum(s["output_tokens"] for s in sessions),
        "input_tokens": sum(m["usage"]["input_tokens"] + m["usage"]["cache_creation_input_tokens"]
                            + m["usage"]["cache_read_input_tokens"] for m in metas),
        "totals": {
            "sessions": len(sessions),
            "calls": len(all_calls),
            "search": count("s"),
            "open_page": count("o"),
            "accepted": count("p"),
            "rejected": count("x"),
            "refuse": count("r"),
        },
        "sessions": sessions,
        "summary": summary,
    }


def main() -> None:
    run_id = sys.argv[1] if len(sys.argv) > 1 else json.loads((DATA / "run.json").read_text(encoding="utf-8"))["run"]
    summary_id = sys.argv[2] if len(sys.argv) > 2 else json.loads((DATA / "summary.json").read_text(encoding="utf-8"))["summary"]
    out = build(run_id, summary_id)
    (DATA / "timeline.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    t = out["totals"]
    print(f"{run_id}: {t['sessions']} sessions, {t['calls']} calls over {out['wall_seconds']} s; "
          f"{t['accepted']} accepted, {t['rejected']} rejected")


if __name__ == "__main__":
    main()
