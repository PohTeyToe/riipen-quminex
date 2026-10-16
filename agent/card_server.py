"""Stdio MCP server `card`: the summary session's only three tools.

read_card, read_field, propose_sentence. The session sees the property card that build_data.py
made from the run, never the report pages. Every call is appended to the JSONL file named by
CORPUS_LOG, and the summary is rebuilt from that log.
"""
from __future__ import annotations

import datetime as dt
import json
import os
from typing import Any

from mcp.server.mcpserver import MCPServer

import card

SESSION = os.environ.get("CORPUS_SESSION", "dev")
LOG = os.environ.get("CORPUS_LOG")

server = MCPServer("card")
_sentences = 0


def log(tool: str, args: dict, result: Any) -> None:
    if not LOG:
        return
    row = {"ts": dt.datetime.now(dt.timezone.utc).isoformat(), "session": SESSION, "tool": tool,
           "args": args, "result": result}
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


@server.tool()
def read_card() -> dict:
    """The property card: every field, its state (settled, disagree, quotes, not_in_sources),
    the claims behind it with their ids and sources, the sides of each disagreement, and the code lines.
    Text fields list only a count; read them with read_field."""
    out = card.load().overview()
    log("read_card", {}, {"fields": len(out["fields"])})
    return out


@server.tool()
def read_field(field: str) -> dict:
    """Every claim on one field, with its id, source, value and (for text) the start of its quote."""
    out = card.load().field(field)
    log("read_field", {"field": field}, {"claims": len(out.get("claims", []))})
    return out


@server.tool()
def propose_sentence(text: str, cite: list[str]) -> dict:
    """Propose the next sentence of the summary. Code checks it at once.

    text: one plain sentence.
    cite: the ids it rests on: claim ids (c-0123), code lines (code:<field or part id>), refused
      fields (refused:<field id>) or the ARIS index (index:aris).
    Kept only if every number in it is in something it cites, and if it cites every side of any
    disagreement it touches. Rejected sentences are not kept; fix and propose again, or drop it.
    """
    global _sentences
    _sentences += 1
    sid = f"s{_sentences:02d}"
    res = card.load().check_sentence(text, cite)
    log("propose_sentence", {"text": text, "cite": cite}, res | {"sentence_id": sid})
    return {"sentence_id": sid, **res}


if __name__ == "__main__":
    server.run("stdio")
