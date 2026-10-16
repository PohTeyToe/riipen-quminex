"""Read the drill tables in each report PDF: hole collars and sample assays.

Code reads these to settle disagreements the way a geologist would. A collar table says where each
hole is and how deep it went. An assay table lists each sample's depths and lab results, so the
length-weighted average of the samples gives an interval's grade. Nothing here involves the agent.

A collar table is a page whose table heading has Hole, Easting and Northing. An assay table is a page
whose heading has Hole, Sample, From, To and Width, with element columns (Cu, Ni, ...) and their units
below them. Assay pages are often printed sideways, so words are read in the page's upright frame and
put in the column whose heading sits nearest above them.

Output (gitignored): data/private/tables/<aris>.json with the collars, the assays, and the text of each
page read, so build_data.py can count what the site ships of those pages too.

Usage: python agent/extract_tables.py
"""
from __future__ import annotations

import json
import re

import fitz  # PyMuPDF

from checker import ELEMENT_WORD, HOLE_RE
from corpus import CORPUS, PDF_DIR, PRIVATE

TABLES_DIR = PRIVATE / "tables"
ELEMENTS = {w.capitalize() for w in ELEMENT_WORD if len(w) == 2} | {"Mo", "Pb", "Zn", "As", "Ba", "Al", "B"}
UNITS = {"ppb", "ppm", "%", "g/t"}
NUM = re.compile(r"^-?\d+(?:\.\d+)?$")


def upright_words(page: fitz.Page) -> list[tuple[float, float, float, float, str]]:
    """Words in the page's upright frame (a sideways table reads left to right), duplicates dropped."""
    m = page.rotation_matrix
    out = []
    for w in page.get_text("words"):
        r = fitz.Rect(w[:4]) * m
        out.append((r.x0, r.y0, r.x1, r.y1, w[4]))
    # Some text layers draw a row twice, once with spaces where the decimal points are ("328 81" over
    # "328.81"). Keep the longest word at each spot and drop words that sit inside it.
    keep = []
    for w in sorted(out, key=lambda w: (-len(w[4]), w[0])):
        if not any(w[0] >= k[0] - 1.5 and w[2] <= k[2] + 1.5 and abs(w[1] - k[1]) < 2 for k in keep):
            keep.append(w)
    return keep


def rows(words: list) -> list[list]:
    """Words grouped into rows by their vertical centre, each row left to right."""
    out: list[list] = []
    for w in sorted(words, key=lambda w: (w[1] + w[3]) / 2):
        y = (w[1] + w[3]) / 2
        if out and abs(y - out[-1][0]) <= 4:
            out[-1][1].append(w)
        else:
            out.append([y, [w]])
    return [sorted(r, key=lambda w: w[0]) for _, r in out]


def cx(w) -> float:
    return (w[0] + w[2]) / 2


def assay_table(page: fitz.Page) -> list[dict]:
    return assay_rows(upright_words(page))


def assay_rows(words: list) -> list[dict]:
    """The sample rows of an assay table, from its words in the upright frame."""
    rs = rows(words)
    head = next((i for i, r in enumerate(rs) if {"Hole", "Sample", "From", "To", "Width"} <= {w[4] for w in r}), None)
    if head is None:
        return []
    named = {w[4]: cx(w) for w in rs[head] if w[4] in ("Hole", "Sample", "From", "To", "Width")}
    # Element names sit on the heading row or the row under it; their units on the row below the names.
    el_row = next(i for i in (head, head + 1) if sum(w[4] in ELEMENTS for w in rs[i]) >= 3)
    els = [w for w in rs[el_row] if w[4] in ELEMENTS]
    units = [w for w in rs[el_row + 1] if w[4] in UNITS]
    cols = []
    for e in els:
        u = min(units, key=lambda u: abs(cx(u) - cx(e)), default=None)
        if u is not None and abs(cx(u) - cx(e)) < 12:
            cols.append({"x": cx(e), "key": f"{e[4]} ({u[4]})"})
    if not cols:
        return []
    gap = min((b["x"] - a["x"] for a, b in zip(cols, cols[1:])), default=30)
    found = []
    for r in rs[el_row + 2:]:
        left = " ".join(w[4] for w in r if cx(w) < named["Sample"] - 15)
        hole = HOLE_RE.search(left.upper().replace(" ", ""))
        if not hole:
            continue

        def at(name: str) -> str | None:
            w = min(r, key=lambda w: abs(cx(w) - named[name]))
            return w[4] if abs(cx(w) - named[name]) < 20 else None

        frm, to, width = at("From"), at("To"), at("Width")
        if not (frm and to and NUM.match(frm) and NUM.match(to)):
            continue
        grades: dict[str, str] = {}
        sign = ""
        for w in r:
            if w[0] < named["Width"] + 15:
                continue
            if w[4] in ("<", ">"):
                sign = w[4]
                continue
            c = min(cols, key=lambda c: abs(c["x"] - cx(w)))
            if abs(c["x"] - cx(w)) <= gap / 2 + 4 and NUM.match(w[4]) and c["key"] not in grades:
                grades[c["key"]] = sign + w[4]
            sign = ""
        cert = next((w[4] for w in r if re.fullmatch(r"[A-Z]\d{2}-\d{4,6}", w[4])), None)
        found.append({"hole": hole.group(), "sample": at("Sample"), "from_m": frm, "to_m": to, "width_m": width,
                      "certificate": cert, "grades": grades})
    return found


def collar_table(text: str) -> tuple[str, list[dict]] | None:
    """Rows of a table headed Hole, Easting, Northing: (caption, rows). Each row keeps the hole, easting,
    northing and depth (the row's last number) and the row as written."""
    lines = [ln.strip() for ln in text.splitlines()]
    head = next((i for i, ln in enumerate(lines) if ln == "Hole" and any(x.startswith("Easting") for x in lines[i + 1:i + 3])
                 and any(x.startswith("Northing") for x in lines[i + 1:i + 6])), None)
    if head is None:
        return None
    cap = next((ln for ln in reversed(lines[:head]) if re.match(r"Table \d+:", ln)), "")
    out, cur = [], None
    for ln in lines[head:]:
        h = HOLE_RE.fullmatch(ln.rstrip("*").strip())
        if h:
            cur = {"hole": h.group(), "numbers": [], "written": [ln]}
            out.append(cur)
        elif cur is not None and NUM.match(ln):
            cur["numbers"].append(ln)
            cur["written"].append(ln)
        elif cur is not None and ln:
            cur = None
    rows_ = []
    for r in out:
        e = next((n for n in r["numbers"] if re.fullmatch(r"\d{6}", n)), None)
        n = next((n for n in r["numbers"] if re.fullmatch(r"\d{7}", n)), None)
        if e and n and len(r["numbers"]) >= 3:
            rows_.append({"hole": r["hole"], "easting": e, "northing": n, "depth_m": r["numbers"][-1],
                          "row": " ".join(r["written"])})
    return (cap, rows_) if rows_ else None


def main() -> None:
    TABLES_DIR.mkdir(parents=True, exist_ok=True)
    for r in CORPUS:
        doc = fitz.open(PDF_DIR / f"{r['aris']}.pdf")
        collars, assays, pages = [], [], {}
        for i, page in enumerate(doc):
            pno = i + 1
            text = page.get_text("text")
            c = collar_table(text)
            if c:
                cap, rs = c
                collars.append({"page": pno, "caption": cap, "rows": rs})
                pages[pno] = text
            a = assay_table(page) if re.search(r"\bSample\b", text) and re.search(r"\bWidth\b", text) else []
            if a:
                assays.append({"page": pno, "rows": a})
                pages[pno] = text
        (TABLES_DIR / f"{r['aris']}.json").write_text(json.dumps(
            {"aris": r["aris"], "collars": collars, "assays": assays, "pages": pages}, ensure_ascii=False), encoding="utf-8")
        print(f"{r['aris']}: {sum(len(c['rows']) for c in collars)} collars on {len(collars)} pages, "
              f"{sum(len(a['rows']) for a in assays)} assay rows on {len(assays)} pages")


if __name__ == "__main__":
    main()
