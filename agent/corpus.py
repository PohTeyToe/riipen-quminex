"""The corpus: the property's ARIS reports and their page ranges (agent/property.json), and page search."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from rank_bm25 import BM25Okapi

from textnorm import display_text, normalize

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PRIVATE = DATA / "private"
PDF_DIR = PRIVATE / "pdf"
PAGES_DIR = PRIVATE / "pages"

# One property per config: its name, the ARIS filter that finds its reports, and the PDF pages the agent reads.
PROPERTY = json.loads((Path(__file__).resolve().parent / "property.json").read_text(encoding="utf-8"))
CORPUS = PROPERTY["reports"]
REPORTS = [r["aris"] for r in CORPUS]

TOKEN = re.compile(r"[a-z0-9]+(?:[.\-][a-z0-9]+)*")


def tokenize(text: str) -> list[str]:
    """Lexical tokens. Keeps hole IDs (il-22-011), decimals (2.36) and map sheets whole."""
    return TOKEN.findall(normalize(text))


@lru_cache(maxsize=None)
def pages(aris: int) -> dict[int, dict]:
    rows = json.loads((PAGES_DIR / f"{aris}.json").read_text(encoding="utf-8"))
    return {p["page"]: p for p in rows}


def page(aris: int, pno: int) -> dict | None:
    if aris not in REPORTS:
        return None
    return pages(aris).get(pno)


def page_text(aris: int, pno: int) -> str:
    """What the agent reads: the text layer with broken font glyphs mapped (see textnorm.CHAR_MAP)."""
    return display_text(page(aris, pno)["text"])


@lru_cache(maxsize=None)
def normalized_page(aris: int, pno: int) -> str:
    p = page(aris, pno)
    return normalize(p["text"]) if p else ""


def all_pages() -> list[tuple[int, int]]:
    return [(a, n) for a in REPORTS for n in sorted(pages(a))]


class Search:
    """BM25 over pages. Lexical on purpose: hole IDs, units and coordinates are exact strings."""

    def __init__(self) -> None:
        self.keys = all_pages()
        self.bm25 = BM25Okapi([tokenize(page(a, n)["text"]) or ["<empty>"] for a, n in self.keys])

    def query(self, q: str, report: int | None = None, k: int = 8) -> list[dict]:
        toks = tokenize(q)
        if not toks:
            return []
        scores = self.bm25.get_scores(toks)
        ranked = sorted(range(len(self.keys)), key=lambda i: -scores[i])
        hits = []
        for i in ranked:
            if scores[i] <= 0:
                break
            a, n = self.keys[i]
            if report is not None and a != report:
                continue
            hits.append({"report": a, "page": n, "score": round(float(scores[i]), 2),
                         "snippet": snippet(page_text(a, n), toks)})
            if len(hits) == k:
                break
        return hits


def snippet(text: str, toks: list[str], width: int = 200) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    low = flat.lower()  # not normalize(): that changes length and breaks the offsets
    pos = min((low.find(t) for t in toks if low.find(t) >= 0), default=0)
    start = max(0, pos - width // 3)
    return flat[start:start + width]
