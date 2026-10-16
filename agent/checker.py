"""Quote and value checks for one claim.

A claim passes when its quote is on the page it cites and its value is in its
quote. A number only matches where the quote doesn't write it as a bound
("<10", "less than 10", "below 10"), so 10 never matches "<10". A value's unit
must follow its number in the quote, or head its column. For a drill interval,
the hole must be the one the quote names for those depths, and each grade must
sit with its own element: in the element's column of the table row, or next to
the element's name in a sentence. Quotes on scanned pages are matched against
the OCR text, but the page image is the source, so those claims are marked for
a check against the image and never count as code-checked.
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


def find_seq(hay: list, needle: list) -> list[int]:
    if not needle:
        return []
    n = len(needle)
    return [i for i in range(len(hay) - n + 1) if hay[i:i + n] == needle]


def contains_seq(hay: list, needle: list) -> bool:
    return bool(find_seq(hay, needle))


SIGNS = ("<", ">")
# How the reports write a bound. The same list decides what counts as censored (below detection).
BOUND_WORDS = {("<",): "<", ("less", "than"): "<", ("below",): "<",
               (">",): ">", ("greater", "than"): ">", ("more", "than"): ">", ("above",): ">"}


def sign_before(hay: list, i: int) -> str:
    """"<" or ">" when hay writes the number at i as a bound, else ""."""
    for words, sign in BOUND_WORDS.items():
        n = len(words)
        if i >= n and tuple(hay[i - n:i]) == words:
            return sign
    return ""


def seq_unsigned(hay: list, needle: list) -> list[int]:
    """Where needle sits in hay. A number matches only as written: 10 is never "<10" or "less than 10",
    and "<10" matches "<10", "less than 10" or "below 10"."""
    if not needle:
        return []
    if needle[0] in SIGNS and len(needle) > 1 and isinstance(needle[1], Decimal):
        return [i for i in find_seq(hay, needle[1:]) if sign_before(hay, i) == needle[0]]
    if isinstance(needle[0], Decimal):
        return [i for i in find_seq(hay, needle) if not sign_before(hay, i)]
    return find_seq(hay, needle)


def numbers(text: str) -> list[Decimal]:
    return [t for t in tokens(text) if isinstance(t, Decimal)]


def signed_numbers(text: str) -> list[tuple[str, Decimal]]:
    """Every number with how it is written: ("<", 10) for "<10" or "less than 10", ("", 10) for 10."""
    t = tokens(text)
    return [(sign_before(t, i), x) for i, x in enumerate(t) if isinstance(x, Decimal)]


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


LOWER_BOUND_RE = re.compile(r"^(" + "|".join(r"\s+".join(map(re.escape, w)) for w, sign in BOUND_WORDS.items()
                                               if sign == "<") + r")\s*([\d.,]+)\s*(.*)$", re.I)


def censored(value: str | None) -> dict | None:
    """'<10', 'less than 10' or 'below 10' stays a bound. Returns the detection limit, never a number standing
    in for the value."""
    if value is None:
        return None
    m = LOWER_BOUND_RE.match(str(value).strip())
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
    return bool(seq_unsigned(quote_tokens, tokens(part)))


# ---------------------------------------------------------------- grades and their elements

ELEMENTS = {
    "Cu": ("cu", "copper"), "Ni": ("ni", "nickel"), "Au": ("au", "gold"), "Pt": ("pt", "platinum"),
    "Pd": ("pd", "palladium"), "Co": ("co", "cobalt"), "Ag": ("ag", "silver"),
}
ELEMENT_WORD = {w: sym for sym, names in ELEMENTS.items() for w in names}
UNITS = ("ppm", "ppb", "g/t", "%")
UNIT_TOKENS = {"%", "ppm", "ppb", "g", "/", "t"}
HEADER_RE = re.compile(r"\b(cu|ni|au|pt|pd|co|ag) ?\( ?(%|ppm|ppb|g/t) ?\)")


def element_of(key: str) -> str | None:
    for w in re.findall(r"[a-z]+", str(key).lower()):
        if w in ELEMENT_WORD:
            return ELEMENT_WORD[w]
    return None


def unit_of(*texts: str) -> str | None:
    s = " ".join(str(t).lower() for t in texts if t)
    for u in UNITS:
        if u in s:
            return u
    return None


def cell(raw) -> tuple[str, Decimal] | None:
    """A grade as a table cell: its sign ("<", ">" or "") and its number."""
    nums = signed_numbers(str(raw))
    return nums[0] if len(nums) == 1 else None


def header_columns(page_norm: str, before: int) -> list[tuple[str, str]]:
    """The grade columns of the table heading closest above the quote, in order: [("Cu", "%"), ...]."""
    found = [m for m in HEADER_RE.finditer(page_norm) if m.start() < before]
    run: list = []
    for m in reversed(found):
        if run and run[0].start() - m.end() > 40:
            break
        run.insert(0, m)
    return [(ELEMENT_WORD[m.group(1)], m.group(2)) for m in run]


def row_cells(qt: list, value: dict, n_cols: int) -> list[tuple[str, Decimal]] | None:
    """The grade cells of the quoted table row, or None if that row isn't in the quote. With from, to and
    width all given, the grades are the cells right after them (the quote may stop mid-row). Otherwise the
    grades are the last cells of the row that holds the depths given."""
    keys = [to_decimal(value.get(k)) for k in ("from_m", "to_m", "width_m")]
    known = [k for k in keys if k is not None]
    if not known:
        return None
    runs, run = [], []
    for i, t in enumerate(qt):
        if isinstance(t, Decimal):
            run.append((qt[i - 1] if i and qt[i - 1] in SIGNS else "", t))
        elif t not in SIGNS or not (i + 1 < len(qt) and isinstance(qt[i + 1], Decimal)):
            if run:
                runs.append(run)
            run = []
    if run:
        runs.append(run)
    for run in reversed(runs):
        nums = [n for _, n in run]
        at = find_seq(nums, known)
        if not at:
            continue
        if len(known) == 3:
            return run[at[-1] + 3:]
        return run[-n_cols:] if len(run) - (at[-1] + len(known)) >= n_cols else None
    return None


FILLER = {"of", "at", ":", "=", "(", "<", ">"}  # what may sit between an element's name and its number: "copper of 1.17%"


CLAUSE_END = {".", ",", ";"}


def bound_elements(qt: list) -> dict[int, set[str]]:
    """The element each number in a sentence belongs to. Text names elements after their numbers ("0.42% Cu",
    "341 ppm nickel") or before them ("Cu 0.42%", "copper of 1.17%"). An element binds only within its clause
    (commas, semicolons and full stops end one), and where a clause could be read both ways, code takes the way
    that clause names more of them, both on a tie. So in "0.034% Cu, 0.42% Ni" the Cu belongs to 0.034."""
    out: dict[int, set[str]] = {}
    start = 0
    for end in [i for i, t in enumerate(qt) if t in CLAUSE_END] + [len(qt)]:
        after, before = [], []
        for k in range(start, end):
            el = ELEMENT_WORD.get(qt[k]) if isinstance(qt[k], str) else None
            if not el:
                continue
            j = k - 1
            while j >= start and qt[j] in UNIT_TOKENS:
                j -= 1
            if j >= start and isinstance(qt[j], Decimal):
                after.append((j, el))
            j, skipped = k + 1, 0
            while j < end and qt[j] in FILLER and skipped < 2:
                j, skipped = j + 1, skipped + 1
            if j < end and isinstance(qt[j], Decimal):
                before.append((j, el))
        for j, el in (after if len(after) > len(before) else before if len(before) > len(after) else after + before):
            out.setdefault(j, set()).add(el)
        start = end + 1
    return out


def written_unit(qt: list, i: int) -> str | None:
    """The grade unit written right after the number at i, if any."""
    after = []
    j = i + 1
    while j < len(qt) and len(after) < 4 and qt[j] in UNIT_TOKENS:
        after.append(qt[j])
        j += 1
    return unit_of("".join(str(x) for x in after)) if after else None


def in_sentence(qt: list, el: str, want: tuple[str, Decimal], unit: str | None) -> bool:
    """The grade sits with its element's name: "0.42% copper", "341 ppm nickel", "Cu 0.42%", "copper of 1.17%"."""
    sign, num = want
    bound = bound_elements(qt)
    for i, t in enumerate(qt):
        if not (isinstance(t, Decimal) and t == num and sign_before(qt, i) == sign):
            continue
        written = written_unit(qt, i)
        if unit and written and unit != written:
            continue
        if el in bound.get(i, set()):
            return True
    return False


def grade_problems(value: dict, quote: str, page_norm: str) -> list[str]:
    """Grades that don't sit with their own element in the quote. Empty when every grade does."""
    qt = tokens(quote)
    grades = [(k, v, element_of(k) or element_of(v)) for k, v in (value.get("grades") or {}).items()
              if v not in (None, "")]
    grades = [(k, v, el) for k, v, el in grades if el]
    if not grades:
        return []
    at = page_norm.find(normalize(quote))
    cols = header_columns(page_norm, at if at >= 0 else len(page_norm))
    cells = row_cells(qt, value, len(cols)) if cols else None
    out = []
    for key, raw, el in grades:
        want, unit = cell(raw), unit_of(str(raw), key)
        if want is None:
            continue
        if cells:
            j = next((n for n, (e, _) in enumerate(cols) if e == el), None)
            if j is None or j >= len(cells):
                out.append(f"{key} {raw}: the table has no {el} column for this row")
            elif cells[j] != want:
                got = "".join(str(x) for x in cells[j])
                out.append(f"{key} {raw}: the {el} column of this row reads {got}")
            elif unit and unit != cols[j][1]:
                out.append(f"{key} {raw}: the {el} column is in {cols[j][1]}, not {unit}")
        elif not in_sentence(qt, el, want, unit):
            out.append(f"{key} {raw}: not next to {el} in the quote")
    return out


# ---------------------------------------------------------------- holes and units

HOLE_RE = re.compile(r"\b([A-Z]{1,4}) ?-? ?(\d{2}) ?-\s*(\d{1,3})\b")
NUMBER_RE = re.compile(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?")


def hole_key(hole: str) -> tuple:
    """IL-23-25, IL-23-025 and "IL-22-\n011" compare by their parts: ("il", 23, 25)."""
    parts = re.findall(r"[a-z]+|\d+", normalize(hole))
    return tuple(int(p) if p.isdigit() else p for p in parts)


def hole_problem(value: dict, quote: str) -> str | None:
    """The hole must be the one the quote names for these depths: the nearest hole ID before them (in a
    table, the row's own hole, or the hole an "including" row sits under), else the nearest after."""
    holes = [(m.start(), m.end(), (m.group(1).lower(), int(m.group(2)), int(m.group(3))), m.group())
             for m in HOLE_RE.finditer(quote)]
    if not holes:
        return None
    nums = [(m.start(), Decimal(m.group().replace(",", ""))) for m in NUMBER_RE.finditer(quote)
            if not any(a <= m.start() < b for a, b, _, _ in holes)]
    known = [d for k in ("from_m", "to_m", "width_m") if (d := to_decimal(value.get(k))) is not None]
    if not known:
        return None
    vals = [d for _, d in nums]
    runs = find_seq(vals, known)
    at = nums[runs[-1]][0] if runs else next((o for o, d in nums if d == known[0]), None)
    if at is None:
        return None
    before = [h for h in holes if h[1] <= at]
    named = before[-1] if before else min(holes, key=lambda h: h[0] - at)
    if named[2] != hole_key(value.get("hole") or "")[:3]:
        written = re.sub(r"\s+", "", named[3])
        return f"the quote names {written} for these depths, not {value.get('hole')}"
    return None


def unit_problem(value, unit: str | None, quote: str) -> str | None:
    """A value's unit must follow its number in the quote, as in "5,001.30 m", or head it, as in "Grid Total (m)
    67600". A unit heading elsewhere in the quote belongs to another column."""
    if not unit or not str(unit).strip():
        return None
    want = signed_numbers(str(value))
    ut = tokens(unit)
    if not want or not ut:
        return None
    qt = tokens(quote)
    sign, num = want[0]
    head = ["("] + ut + [")"]
    for i, t in enumerate(qt):
        if not (isinstance(t, Decimal) and t == num and sign_before(qt, i) == sign):
            continue
        if qt[i + 1:i + 1 + len(ut)] == ut or qt[max(0, i - len(head)):i] == head:
            return None
    return f"the quote doesn't write {str(unit).strip()!r} after {value}"


def pages_with(nq: str) -> list[dict]:
    return [{"aris": a, "page": n} for a, n in corpus.all_pages() if nq in corpus.normalized_page(a, n)]


def where(found: list[dict], aris: int) -> str:
    same = [f["page"] for f in found if f["aris"] == aris]
    if same:
        return "page " + ", ".join(str(p) for p in same[:3])
    f = found[0]
    return f"report {f['aris']} page {f['page']}"


def check_claim(kind: str, value, report: int, page: int, quote: str, unit: str | None = None) -> dict:
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
        if kind == "interval":
            wrong_hole = hole_problem(value, quote)
            if wrong_hole:
                res.update(value_in_quote=False, failure="hole_not_with_row",
                           reason="The hole must be the one the quote names for these depths: " + wrong_hole)
                return res
            loose = grade_problems(value, quote, corpus.normalized_page(report, page))
            if loose:
                res.update(value_in_quote=False, failure="grade_not_with_element",
                           reason="Each grade must sit with its own element. " + "; ".join(loose))
                return res
        elif kind == "value":
            no_unit = unit_problem(value, unit, quote)
            if no_unit:
                res.update(value_in_quote=False, failure="unit_not_in_quote",
                           reason="The unit must follow the number in the quote, or head its column: " + no_unit)
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
