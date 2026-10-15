"""Extract per-page text from the corpus PDFs and flag scanned pages.

Output (gitignored): data/private/pages/<aris>.json, a list of
{"page": <PDF page number, 1-based>, "text": str, "scanned": bool, "image_cover": float,
 "invisible_text": bool}.

A page counts as scanned when one image covers at least 85% of the page and
the page has text. That text is usually an OCR layer (invisible_text records
render mode 3, the OCR signature), so the image is the source. The rule is
deliberately broad: a cover photo with a title over it also counts.
"""
from __future__ import annotations

import json
from pathlib import Path

import fitz  # PyMuPDF

from corpus import CORPUS, PAGES_DIR, PDF_DIR

SCAN_COVER = 0.85


def image_cover(page: fitz.Page) -> float:
    area = abs(page.rect)
    best = 0.0
    for info in page.get_image_info():
        r = fitz.Rect(info["bbox"]) & page.rect
        best = max(best, abs(r) / area if area else 0.0)
    return round(best, 3)


def has_invisible_text(page: fitz.Page) -> bool:
    # Render mode 3 (invisible) is how OCR tools lay text over a scan.
    return any(span.get("type") == 3 for span in page.get_texttrace())


def extract(aris: int, first: int, last: int) -> list[dict]:
    doc = fitz.open(PDF_DIR / f"{aris}.pdf")
    out = []
    for pno in range(first, last + 1):
        page = doc[pno - 1]
        text = page.get_text("text")
        cover = image_cover(page)
        invisible = has_invisible_text(page)
        out.append({
            "page": pno,
            "text": text,
            "scanned": bool(text.strip()) and cover >= SCAN_COVER,
            "image_cover": cover,
            "invisible_text": invisible,
        })
    return out


def main() -> None:
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    for r in CORPUS:
        pages = extract(r["aris"], r["first_page"], r["last_page"])
        (PAGES_DIR / f"{r['aris']}.json").write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")
        scanned = sum(p["scanned"] for p in pages)
        print(f"{r['aris']}: {len(pages)} pages, {scanned} scanned")


if __name__ == "__main__":
    main()
