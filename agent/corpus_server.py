"""Stdio MCP server `corpus`: the agent's only four tools.

search, open_page, propose_claim, refuse. No web, no files, no shell.
Every call is appended to the JSONL file named by CORPUS_LOG, so the run can
be rebuilt from the log without trusting anything the model says.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer

import corpus
from checker import check_claim

SESSION = os.environ.get("CORPUS_SESSION", "dev")
LOG = os.environ.get("CORPUS_LOG")

server = MCPServer("corpus")
_search: corpus.Search | None = None
_claims = 0


def log(tool: str, args: dict, result: Any) -> None:
    if not LOG:
        return
    row = {"ts": dt.datetime.now(dt.timezone.utc).isoformat(), "session": SESSION, "tool": tool,
           "args": args, "result": result}
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def search(query: str, report: int | None = None) -> list[dict]:
    global _search
    if _search is None:
        _search = corpus.Search()
    hits = _search.query(query, report)
    for h in hits:
        h["scanned"] = corpus.page(h["report"], h["page"])["scanned"]
    log("search", {"query": query, "report": report},
        {"hits": [{"report": h["report"], "page": h["page"]} for h in hits]})
    return hits


NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
_n = len(corpus.REPORTS)
search.__doc__ = f"""Search the pages of the {NUMBER_WORDS[_n] if _n <= 10 else _n} {corpus.PROPERTY['name']} assessment reports (BM25, lexical).

    Returns up to 8 hits, each with report (ARIS number), page (PDF page number),
    whether the page is a scan, and a 200-character snippet. Exact strings such as
    hole IDs, units and coordinates work well as queries. Optionally limit to one report.
    """
server.tool()(search)


@server.tool()
def open_page(report: int, page: int) -> dict:
    """Open one page and return its full text. Page numbers are PDF page numbers.

    Scanned pages return OCR text, which can contain reading errors.
    """
    p = corpus.page(int(report), int(page))
    if p is None:
        result = {"error": f"Report {report} page {page} is not in this corpus."}
        log("open_page", {"report": report, "page": page}, result)
        return result
    log("open_page", {"report": report, "page": page}, {"scanned": p["scanned"], "chars": len(p["text"])})
    return {"report": int(report), "page": int(page), "scanned": p["scanned"],
            "text": corpus.page_text(int(report), int(page))}


@server.tool()
def propose_claim(
    field: str,
    value: str | dict[str, Any] | None,
    report: int,
    page: int,
    quote: str,
    unit: str | None = None,
    kind: Literal["value", "interval", "statement", "caveat"] = "value",
) -> dict:
    """Propose one claim. Code checks it at once and returns the result.

    field: the field or question id you were given.
    value: exactly as written on the page. For kind "interval", an object:
      {"hole": "...", "from_m": "...", "to_m": "...", "width_m": "...", "grades": {"<element> (<unit>)": "..."}},
      every number copied as written (strings, not numbers). For "statement" or "caveat", a short
      span of the quote, or null.
    report, page: ARIS report number and PDF page number the quote is on.
    quote: copied exactly from that page, at most 600 characters, one contiguous span.
    unit: unit as written, if any.
    kind: value, interval, statement (descriptive text), or caveat (a sentence that qualifies values,
      such as a lab method or detection limit).
    The result says whether the quote is on the page and the value is in the quote. If the quote is
    elsewhere, it says where.
    """
    global _claims
    _claims += 1
    claim_id = f"{SESSION}-{_claims:03d}"
    res = check_claim(kind, value, report, page, quote, unit)
    args = {"field": field, "value": value, "report": report, "page": page, "quote": quote,
            "unit": unit, "kind": kind}
    log("propose_claim", args, res | {"claim_id": claim_id})
    out = {"claim_id": claim_id, "accepted": res["accepted"], "reason": res["reason"]}
    if res["found_on"]:
        out["found_on"] = res["found_on"][:5]
    return out


@server.tool()
def refuse(field_or_question: str, reason: str) -> dict:
    """Record that these reports do not state this. Say what you searched for in the reason."""
    log("refuse", {"field_or_question": field_or_question, "reason": reason}, {"recorded": True})
    return {"recorded": True, "label": "Not in these sources"}


if __name__ == "__main__":
    server.run("stdio")
