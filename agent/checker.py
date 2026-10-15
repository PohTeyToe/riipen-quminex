"""Quote and value checks for one claim.

A claim passes when its quote is on the page it cites and its value is in its
quote. Quotes on scanned pages are matched against the OCR text, but the page
image is the source, so those claims are marked for a check against the image
and never count as code-checked.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

import corpus
from textnorm import normalize

MAX_QUOTE = 600
MIN_QUOTE = 12

TOKEN_RE = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|[^\W\d_]+|[^\w\s]")
INTERVAL_KEYS = ("hole", "from_m", "to_m", "width_m")


def tokens(text: str) -> list:
    """Normalized tokens; numbers become Decimals so 0.30 == 0.3 and 5,001.30 == 5001.30."""
    out: list = []
    for t in TOKEN_RE.findall(normalize(text)):
        if t[0].isdigit():
            out.append(Decimal(t.replace(",", "")))
        else:
            out.append(t)
    return out


def contains_seq(hay: list, needle: list) -> bool:
    if not needle:
        return False
    n = len(needle)
    return any(hay[i:i + n] == needle for i in range(len(hay) - n + 1))


def numbers(text: str) -> list[Decimal]:
    return [t for t in tokens(text) if isinstance(t, Decimal)]


def to_decimal(text: str | None) -> Decimal | None:
    if text is None:
        return None
    m = re.search(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?", str(text))
    if not m:
        return None
    try:
        return Decimal(m.group().replace(",", ""))
    except InvalidOperation:
        return None


def censored(value: str | None) -> dict | None:
    """'<10' stays '<10'. Returns the detection limit, never a number standing in for the value."""
    if value is None:
        return None
    s = str(value).strip()
    m = re.match(r"^(<|less than|below)\s*([\d.,]+)\s*(.*)$", s, re.I)
    if not m:
        return None
    return {"detection_limit": m.group(2), "unit": m.group(3).strip() or None}


def value_parts(kind: str, value) -> list[str]:
    if value is None:
        return []
    if kind == "interval":
        if not isinstance(value, dict):
            return []
        parts = [str(value[k]) for k in INTERVAL_KEYS if value.get(k) not in (None, "")]
        parts += [str(v) for v in (value.get("grades") or {}).values() if v not in (None, "")]
        return parts
    # "51° 57' N, 120° 54' W" or "Copper, Gold, PGM": each part must be in the quote.
    # Only a comma followed by a space splits, so 5,001.30 stays whole.
    return [p for p in re.split(r";\s*|,\s+", str(value)) if p.strip()]


def part_in_quote(part: str, quote_tokens: list) -> bool:
    return contains_seq(quote_tokens, tokens(part))


def pages_with(nq: str) -> list[dict]:
    return [{"aris": a, "page": n} for a, n in corpus.all_pages() if nq in corpus.normalized_page(a, n)]


def where(found: list[dict], aris: int) -> str:
    same = [f["page"] for f in found if f["aris"] == aris]
    if same:
        return "page " + ", ".join(str(p) for p in same[:3])
    f = found[0]
    return f"report {f['aris']} page {f['page']}"


def check_claim(kind: str, value, report: int, page: int, quote: str) -> dict:
    """Check one claim. Returns the result the agent sees and the data keeps."""
    res: dict = {"accepted": False, "by": "code", "quote_on_page": False, "value_in_quote": None,
                 "scanned": False, "found_on": [], "also_in": [], "failure": None, "reason": ""}
    try:
        report, page = int(report), int(page)
    except (TypeError, ValueError):
        res.update(failure="page_not_in_corpus", reason="Report and page must be numbers")
        return res
    p = corpus.page(report, page)
    if p is None:
        res.update(failure="page_not_in_corpus", reason=f"Report {report} page {page} is not in this corpus")
        return res
    quote = quote or ""
    nq = normalize(quote)
    if len(quote) > MAX_QUOTE:
        res.update(failure="quote_too_long", reason=f"Quote is {len(quote)} characters; the limit is {MAX_QUOTE}")
        return res
    if len(nq) < MIN_QUOTE:
        res.update(failure="quote_too_short", reason=f"Quote is too short to check (under {MIN_QUOTE} characters)")
        return res

    res["scanned"] = bool(p["scanned"])
    if p["scanned"]:
        res["by"] = "page image"

    if nq in corpus.normalized_page(report, page):
        res["quote_on_page"] = True
    else:
        found = pages_with(nq)
        if found:
            res.update(found_on=found, failure="wrong_page",
                       reason=f"Quote is real, but it's on {where(found, report)}, not page {page}"
                       if any(f["aris"] == report for f in found)
                       else f"Quote is real, but it's in {where(found, report)}, not report {report} page {page}")
        else:
            res.update(failure="quote_not_found", reason="Quote not found on any page of these reports")
        return res

    parts = value_parts(kind, value)
    if kind == "interval" and (not isinstance(value, dict) or not value.get("hole") or not value.get("grades")):
        res.update(value_in_quote=False, failure="value_not_in_quote",
                   reason="An interval needs its hole ID and at least one grade, and both must be in the quote. If a table row doesn't repeat the hole ID, quote from the row that names the hole down to this row")
        return res
    if parts:
        qt = tokens(quote)
        missing = [x for x in parts if not part_in_quote(x, qt)]
        if missing:
            res.update(value_in_quote=False, failure="value_not_in_quote",
                       reason="Not in the quote: " + ", ".join(repr(m) for m in missing))
            return res
        res["value_in_quote"] = True

    res["accepted"] = True
    res["also_in"] = [f for f in pages_with(nq) if not (f["aris"] == report and f["page"] == page)]
    if p["scanned"]:
        res["reason"] = ("Quote matches the OCR text of a scanned page. Code can't read scans reliably, "
                         "so this claim will be checked against the page image.")
    else:
        res["reason"] = "Quote found on the cited page" + (" and the value is in it" if parts else "")
    return res
