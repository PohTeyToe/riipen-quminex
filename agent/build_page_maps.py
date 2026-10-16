"""Where each accepted claim's quote sits on its PDF page, as geometry only, so the site can draw the page.

Usage: python agent/build_page_maps.py

For every claim in data/claims.json, finds the quote's words on the cited page (the tokens the checker and
search use) and records the boxes of the lines they sit on. For every page a claim cites, records the box of
every text line on it. That is all: positions in PDF points, no page text and no page pictures, because the
site ships no page images (README, "Why there are no page images"). The site draws each line as a bar and
the quote's lines in place, with the quote text it already ships.

Writes data/page_maps.json. A quote that can't be placed gets no map, and the site shows its excerpt alone.
"""
from __future__ import annotations

import difflib
import json
from pathlib import Path

import fitz  # PyMuPDF

from checker import NUMBER_RE
from corpus import PDF_DIR, tokenize

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def r1(v: float) -> float:
    return round(v, 1)


def box(r: fitz.Rect) -> list[float]:
    return [r1(r.x0), r1(r.y0), r1(r.width), r1(r.height)]


def word_tokens(words: list[tuple]) -> tuple[list[str], list[int]]:
    """Every token on the page in text-layer order, and the word it came from."""
    toks, owner = [], []
    for i, w in enumerate(words):
        for t in tokenize(w[4]):
            toks.append(t)
            owner.append(i)
    return toks, owner


def find_span(page_toks: list[str], quote_toks: list[str]) -> tuple[int, int] | None:
    """Token range of the quote on the page: an exact run if there is one, else the tightest stretch that
    matches at least 80% of the quote's tokens in order (glyphs a text layer draws oddly, OCR noise)."""
    n = len(quote_toks)
    if not n:
        return None
    for i in range(len(page_toks) - n + 1):
        if page_toks[i:i + n] == quote_toks:
            return i, i + n
    sm = difflib.SequenceMatcher(None, page_toks, quote_toks, autojunk=False)
    blocks = [b for b in sm.get_matching_blocks() if b.size]
    best = None
    for a in range(len(blocks)):
        got = 0
        for b in range(a, len(blocks)):
            got += blocks[b].size
            lo, hi = blocks[a].a, blocks[b].a + blocks[b].size
            if hi - lo > 1.4 * n + 4:
                break
            if got >= 0.8 * n and (best is None or hi - lo < best[1] - best[0]):
                best = (lo, hi)
    return best


def value_tokens(c: dict) -> list[list[str]]:
    """The value's pieces to mark inside the quote: the whole value for text, each number and the hole for an
    interval."""
    v = c["value"]
    if v is None:
        return []
    if isinstance(v, dict):
        parts = [v.get("hole") or "", v.get("from_m") or "", v.get("to_m") or "", v.get("width_m") or ""]
        parts += list((v.get("grades") or {}).values())
        return [t for p in parts if (t := tokenize(str(p)))]
    t = tokenize(str(v))
    if c["kind"] in ("statement", "caveat") and len(t) > 12:
        return []  # the quote is the value; marking it twice says nothing
    return [t] if t else [tokenize(n) for n in NUMBER_RE.findall(str(v))]


def line_boxes(words: list[tuple], idx: set[int]) -> list[fitz.Rect]:
    """One box per text line for the chosen words."""
    lines: dict[tuple, fitz.Rect] = {}
    for i in sorted(idx):
        w = words[i]
        key = (w[5], w[6])
        r = fitz.Rect(w[:4])
        lines[key] = lines[key] | r if key in lines else r
    return sorted(lines.values(), key=lambda r: (round(r.y0), r.x0))


def page_lines(page: fitz.Page) -> list[list[float]]:
    """Every text line on the page as a box, top to bottom, kept inside the page (OCR can overhang an edge)."""
    words = page.get_text("words")
    return [box(r & page.rect) for r in line_boxes(words, set(range(len(words)))) if not (r & page.rect).is_empty]


def place(page: fitz.Page, c: dict) -> dict | None:
    words = page.get_text("words")
    toks, owner = word_tokens(words)
    span = find_span(toks, tokenize(c["quote"]))
    if not span:
        return None
    lo, hi = span
    quote_words = {owner[i] for i in range(lo, hi)}
    value_words: set[int] = set()
    for vt in value_tokens(c):
        for i in range(lo, hi - len(vt) + 1):
            if toks[i:i + len(vt)] == vt:
                value_words |= {owner[j] for j in range(i, i + len(vt))}
                break
    out = {"quote": [box(r & page.rect) for r in line_boxes(words, quote_words)],
           "value": [box(r & page.rect) for r in line_boxes(words, value_words)]}
    if hi - lo != len(tokenize(c["quote"])):
        out["near"] = True
    return out


def build() -> dict:
    claims = json.loads((DATA / "claims.json").read_text(encoding="utf-8"))["claims"]
    docs: dict[int, fitz.Document] = {}
    pages: dict[str, dict] = {}
    placed: dict[str, dict] = {}
    missed = []
    for c in claims:
        a, p = c["source"]["aris"], c["source"]["page"]
        doc = docs.setdefault(a, fitz.open(PDF_DIR / f"{a}.pdf"))
        page = doc[p - 1]
        if page.rotation:
            page.set_rotation(0)
        key = f"{a}:{p}"
        if key not in pages:
            pages[key] = {"w": r1(page.rect.width), "h": r1(page.rect.height), "lines": page_lines(page)}
        got = place(page, c)
        if got:
            placed[c["id"]] = {"page": key, **got}
        else:
            missed.append(c["id"])
    return {
        "note": "Geometry only: boxes are [x, y, w, h] in PDF points from the page's top left. lines: every text "
                "line on the page. quote and value: the lines the claim's quote and its value sit on. 'near' marks a "
                "quote placed by an in-order match of 80% or more of its words, not an exact run.",
        "pages": pages,
        "claims": placed,
        "missed": missed,
    }


def main() -> None:
    out = build()
    (DATA / "page_maps.json").write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(out['claims'])} quotes placed on {len(out['pages'])} pages; {len(out['missed'])} not placed")


if __name__ == "__main__":
    main()
