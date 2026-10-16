"""Rules that group accepted claims and decide where sources disagree.

The agent only proposes per-source claims. Everything here is plain code:
coordinates, map areas, text, numbers and drill intervals are compared by
the rules below, and each rule explains itself in one sentence.
"""
from __future__ import annotations

import math
import re
from decimal import Decimal
from functools import lru_cache

import corpus
from checker import ELEMENTS, censored, element_of, hole_key, numbers, signed_numbers, to_decimal, unit_of
from textnorm import normalize

SAME_PLACE_KM = 5.0
SAME_INTERVAL_OVERLAP = Decimal("0.9")
WIDTH_TOL_M = Decimal("0.05")
ARITH_TOL_M = Decimal("0.01")
NUMBER_REL_TOL = Decimal("0.001")
LAB_REL_TOL = Decimal("0.01")

RULE_TEXT = {
    "location": "Points within 5 km count as the same place, because each report gives its own centre of work "
                "to the nearest minute. Points farther apart are put on different sides.",
    "map_sheet": "Map sheets are compared on the four-character NTS map area, such as 092P.",
    "exact_text": "Values are compared as text, ignoring case, punctuation and the field's own label words.",
    "number": "Lengths are compared in metres, with their units converted. Values within 0.1% of each other count "
              "as the same, so rounding doesn't split them.",
    "interval": "Two intervals for the same hole are the same interval when their depths overlap by at least 90% "
                "of the longer one. Code then compares them: widths more than 0.05 m apart disagree, and so does any "
                "grade both give that differs by more than the rounding of the numbers as written. An interval that "
                "lies inside a longer one is listed under it, the way reports write \"including\". Code also checks "
                "that to minus from equals the stated width, allowing for how precisely each number is written.",
    "none": "Text fields show quotes only. Code doesn't compare them, so they carry no settled or disagree label.",
}

# ---------------------------------------------------------------- location

# Normalized text has no degree marks ("51 57' n"); OCR'd forms read "51 o 54'9".
# A minute mark is required, so loose pairs of numbers aren't read as coordinates.
DMS_RE = re.compile(r"(?<![\d.])(\d{2,3})(?: o | )(\d{1,2}(?:\.\d+)?)'(?: ?(\d{1,2}(?:\.\d+)?)\"?)?")
UTM_EN_RE = re.compile(r"(?<!\d)(\d{6})(?:\.\d+)? ?m? ?e\b[ ,;]*(?:and )?(\d{7})(?:\.\d+)? ?m? ?n\b")
UTM_LABEL_RE = re.compile(r"easting:? ?(\d{6})(?:\.\d+)?\b.{0,40}?northing:? ?(\d{7})(?:\.\d+)?\b")
ZONE_RE = re.compile(r"zone:? ?(\d{1,2})\b")


@lru_cache(maxsize=None)
def _utm_to_lonlat(zone: int):
    from pyproj import Transformer
    return Transformer.from_crs(f"EPSG:{26900 + zone}", "EPSG:4326", always_xy=True)


def parse_points(text: str, default_zone: int = 10) -> list[dict]:
    """Coordinates written in a value or quote. BC only: latitude 48-60 N, longitude 114-140 W."""
    t = normalize(text)
    lats, lons = [], []
    for m in DMS_RE.finditer(t):
        deg, mins, secs = int(m.group(1)), float(m.group(2)), float(m.group(3) or 0)
        dd = deg + mins / 60 + secs / 3600
        written = m.group(0).strip()
        if 48 <= deg <= 60:
            lats.append((dd, written))
        elif 114 <= deg <= 140:
            lons.append((-dd, written))
    pts = [{"lat": la, "lon": lo, "how": "lat/long", "written": f"{lw}, {low}"}
           for (la, lw), (lo, low) in zip(lats, lons)]
    zone_m = ZONE_RE.search(t)
    zone = int(zone_m.group(1)) if zone_m and 7 <= int(zone_m.group(1)) <= 11 else default_zone
    for rx in (UTM_EN_RE, UTM_LABEL_RE):
        for m in rx.finditer(t):
            e, n = int(m.group(1)), int(m.group(2))
            lon, lat = _utm_to_lonlat(zone).transform(e, n)
            pts.append({"lat": lat, "lon": lon, "how": f"UTM zone {zone}", "written": m.group(0).strip()})
    return pts


def km_between(a: dict, b: dict) -> float:
    r = 6371.0088
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dphi, dlmb = p2 - p1, math.radians(b["lon"] - a["lon"])
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def claim_points(claim: dict, default_zone: int = 10) -> list[dict]:
    pts = parse_points(str(claim.get("value") or ""), default_zone)
    if not pts:
        pts = parse_points(claim["quote"], default_zone)
    return pts


def single_link(items: list, close) -> list[list]:
    """Group items so that any two items closer than the rule allows end up together."""
    groups: list[list] = []
    for it in items:
        hits = [g for g in groups if any(close(it, x) for x in g)]
        merged = [it]
        for g in hits:
            merged += g
            groups.remove(g)
        groups.append(merged)
    return groups


def group_locations(claims: list[dict], default_zone: int = 10) -> dict:
    pts, unplaced = [], []
    for c in claims:
        cp = claim_points(c, default_zone)
        if not cp:
            unplaced.append(c["id"])
        for p in cp:
            pts.append(p | {"claim": c["id"]})
    groups = single_link(pts, lambda a, b: km_between(a, b) <= SAME_PLACE_KM)
    out = {"rule": "location", "groups": [], "unplaced": unplaced}
    for g in groups:
        out["groups"].append({"claims": sorted({p["claim"] for p in g}), "points": g,
                              "centre": {"lat": sum(p["lat"] for p in g) / len(g),
                                         "lon": sum(p["lon"] for p in g) / len(g)}})
    if len(groups) > 1:
        nearest = min(km_between(a, b) for i, g in enumerate(groups) for h in groups[i + 1:] for a in g for b in h)
        out["distance_km"] = round(nearest, 1)
        out["code_line"] = f"The nearest points on the two sides are {nearest:.1f} km apart (more than {SAME_PLACE_KM:g} km)."
    return out


# ---------------------------------------------------------------- map sheet

# An NTS map area as written: 092P, 93N, 092P/15, 092P096, 092P.086. The letter must be a capital
# A to P not followed by another letter, and the number must be a series that covers BC (82 to 114),
# so "30 m" or "51 o" are never read as map sheets.
MAP_AREA_RE = re.compile(r"(?<![\d.,])0?(\d{2,3}) ?([A-P])(?![A-Za-z])")


def map_areas(text: str) -> list[str]:
    out = set()
    for m in MAP_AREA_RE.finditer(text):
        n = int(m.group(1))
        if 82 <= n <= 114:
            out.add(f"{n:03d}{m.group(2)}")
    return sorted(out)


def group_map_sheets(claims: list[dict]) -> dict:
    by_area: dict[str, list] = {}
    unplaced = []
    for c in claims:
        areas = map_areas(str(c.get("value") or "")) or map_areas(c["quote"])
        if not areas:
            unplaced.append(c["id"])
        for a in areas:
            by_area.setdefault(a, []).append(c["id"])
    return {"rule": "map_sheet", "unplaced": unplaced,
            "groups": [{"key": a, "claims": sorted(set(ids))} for a, ids in sorted(by_area.items())]}


# ---------------------------------------------------------------- text and numbers

def text_key(value: str, ignore_words: list[str]) -> str:
    words = re.findall(r"[a-z0-9]+", normalize(value))
    return " ".join(w for w in words if w not in ignore_words)


def group_text(claims: list[dict], ignore_words: list[str]) -> dict:
    by: dict[str, list] = {}
    for c in claims:
        by.setdefault(text_key(str(c.get("value") or c["quote"]), ignore_words), []).append(c["id"])
    return {"rule": "exact_text", "groups": [{"key": k, "claims": v} for k, v in by.items()], "unplaced": []}


LENGTH_M = {"m": 1, "metre": 1, "metres": 1, "meter": 1, "meters": 1,
            "km": 1000, "kilometre": 1000, "kilometres": 1000, "kilometer": 1000, "kilometers": 1000}


def in_metres(claim: dict) -> Decimal | None:
    """A length claim in metres, from its number and its unit ("5,001.30" with unit "m", or "1.68 km").
    None when code can't read the number, the number is a bound, or the unit isn't a length."""
    v = claim.get("value")
    nums = signed_numbers(str(v or ""))
    if len(nums) != 1 or nums[0][0]:
        return None
    unit = claim.get("unit") or re.sub(r"[\d.,\s]+", " ", str(v)).strip()
    factor = LENGTH_M.get(normalize(unit).strip())
    return None if factor is None else nums[0][1] * factor


def group_numbers(claims: list[dict]) -> dict:
    items, unplaced = [], []
    for c in claims:
        d = in_metres(c)
        if d is None:
            unplaced.append(c["id"])
        else:
            items.append((d, c["id"]))

    def close(a, b):
        hi = max(a[0], b[0])
        return hi == 0 or abs(a[0] - b[0]) / hi <= NUMBER_REL_TOL

    groups = single_link(items, close)
    return {"rule": "number", "unplaced": unplaced,
            "groups": [{"key": str(max(x[0] for x in g)), "claims": sorted(x[1] for x in g)} for g in groups]}


# ---------------------------------------------------------------- intervals

TO_PCT = {"%": Decimal(1), "ppm": Decimal("0.0001"), "g/t": Decimal("0.0001"), "ppb": Decimal("0.0000001")}


def grade_value(key: str, raw: str) -> dict | None:
    """A grade as the range of % it allows. A number as written allows half a unit of its last digit either
    side (0.002% is 0.0015 to 0.0025%); a value below detection allows anything up to its limit ("<5 ppb" is
    0 to 5 ppb). None if code can't read the number or its unit."""
    nums = signed_numbers(str(raw))
    unit = unit_of(str(raw), key)
    if len(nums) != 1 or unit is None:
        return None
    sign, d = nums[0]
    pct = d * TO_PCT[unit]
    if sign == "<":
        return {"sign": "<", "value": pct, "lo": Decimal(0), "hi": pct}
    if sign == ">":
        return {"sign": ">", "value": pct, "lo": pct, "hi": None}
    h = half_unit(raw) * TO_PCT[unit]
    return {"sign": "", "value": pct, "lo": pct - h, "hi": pct + h}


def clash(a: dict, b: dict) -> bool:
    """Two values can't both be right: the ranges they allow don't overlap. A bound excludes its limit, so <10 and
    >10 clash, and <10 clashes with exactly 10."""
    def apart(x: dict, y: dict) -> bool:  # x lies wholly below y
        if x["hi"] is None:
            return False
        return x["hi"] < y["lo"] or (x["hi"] == y["lo"] and (x.get("sign") == "<" or y.get("sign") == ">"))
    return apart(a, b) or apart(b, a)


def grades_by_element(value: dict) -> dict[str, dict]:
    out = {}
    for k, v in (value.get("grades") or {}).items():
        el = element_of(k) or element_of(str(v))
        g = grade_value(k, str(v))
        if el and g:
            out[el] = g
    return out


def metres(raw) -> Decimal | None:
    if raw in (None, ""):
        return None
    d = to_decimal(raw)
    if d is None:
        return None
    return d / 100 if re.search(r"\bcm\b", str(raw).lower()) else d


def half_unit(raw) -> Decimal:
    """Half a unit of the last digit written: 318.3 -> 0.05, 2.36 -> 0.005, 47 cm -> 0.005 m."""
    d = to_decimal(raw)
    if d is None:
        return Decimal(0)
    exp = d.as_tuple().exponent
    half = Decimal(5).scaleb(exp - 1) if isinstance(exp, int) else Decimal(0)
    return half / 100 if re.search(r"\bcm\b", str(raw).lower()) else half


def depths(v: dict) -> tuple[Decimal, Decimal] | None:
    f, t = metres(v.get("from_m")), metres(v.get("to_m"))
    return (f, t) if f is not None and t is not None and t > f else None


def same_interval(a: dict, b: dict) -> bool:
    """Same hole, and the depths overlap by at least 90% of the longer interval. Without depths on
    both sides, the copper and nickel grades decide."""
    if hole_key(a["hole"]) != hole_key(b["hole"]):
        return False
    da, db = depths(a), depths(b)
    if da and db:
        overlap = min(da[1], db[1]) - max(da[0], db[0])
        longer = max(da[1] - da[0], db[1] - db[0])
        return overlap > 0 and overlap >= SAME_INTERVAL_OVERLAP * longer
    ga, gb = grades_by_element(a), grades_by_element(b)
    return all(el in ga and el in gb and ga[el]["sign"] == gb[el]["sign"] == "" and not clash(ga[el], gb[el])
               for el in ("Cu", "Ni"))


def inside(a: dict, b: dict) -> bool:
    """a lies inside the longer interval b of the same hole (allowing for rounding)."""
    da, db = depths(a), depths(b)
    if not (da and db) or hole_key(a["hole"]) != hole_key(b["hole"]):
        return False
    tol = sum(half_unit(x) for x in (a.get("from_m"), a.get("to_m"), b.get("from_m"), b.get("to_m")))
    return db[0] - tol <= da[0] and da[1] <= db[1] + tol and (db[1] - db[0]) - (da[1] - da[0]) > WIDTH_TOL_M


def fmt_pct(d: Decimal) -> str:
    return f"{d.normalize():f}%"


def written_grade(key: str, raw: str) -> str:
    """A grade with its unit, as the report writes it: "0.002%", "6 ppm"."""
    unit = unit_of(raw, key)
    if unit is None or unit in raw.lower():
        return raw
    return raw + ("%" if unit == "%" else f" {unit}")


def shown_values(vals: list[dict]) -> list[dict]:
    """Values as the JSON keeps them: the numbers as strings, so the card can show and compare them."""
    return [{k: (None if v[k] is None else str(v[k])) if k in ("value", "lo", "hi") else v[k] for k in v} for v in vals]


def compare_widths(g: list[dict]) -> dict | None:
    known = [(w, c) for c in g if (w := metres(c["value"].get("width_m"))) is not None]
    if len(known) < 2:
        return None
    spread = max(w for w, _ in known) - min(w for w, _ in known)
    agree = spread <= WIDTH_TOL_M
    line = "Widths " + " and ".join(f"{w} m" for w, _ in known)
    line += " agree." if agree else f" differ by {spread} m. The rule allows {WIDTH_TOL_M} m."
    half = WIDTH_TOL_M / 2  # two widths clash when they are more than WIDTH_TOL_M apart
    return {"what": "width", "agree": agree, "line": line,
            "values": shown_values([{"claim": c["id"], "written": str(c["value"]["width_m"]), "sign": "",
                                     "value": w, "lo": w - half, "hi": w + half} for w, c in known])}


def compare_grades(g: list[dict]) -> list[dict]:
    by_el: dict[str, list] = {}
    for c in g:
        for k, raw in (c["value"].get("grades") or {}).items():
            el, gv = element_of(k) or element_of(str(raw)), grade_value(k, str(raw))
            if el and gv:
                by_el.setdefault(el, []).append({"claim": c["id"], "written": written_grade(k, str(raw)), **gv})
    out = []
    for el, vals in by_el.items():
        if len(vals) < 2:
            continue
        clashes = [(a, b) for i, a in enumerate(vals) for b in vals[i + 1:] if clash(a, b)]
        agree = not clashes
        shown = [v["written"] if v["written"].endswith("%") or v["sign"] else f"{v['written']} ({fmt_pct(v['value'])})"
                 for v in vals]
        line = f"{el}: " + " and ".join(shown)
        bounded = [v for v in vals if v["sign"]]
        if agree:
            line += " agree within rounding" + (" and detection limits." if bounded else ".")
        elif any(a["sign"] or b["sign"] for a, b in clashes):
            a, b = next((a, b) for a, b in clashes if a["sign"] or b["sign"])
            bound, plain = (a, b) if a["sign"] else (b, a)
            side = "above" if bound["sign"] == "<" else "below"
            line += f" disagree: {plain['written']} is {side} the limit of {bound['written']}."
        else:
            lo, hi = min(vals, key=lambda v: v["value"]), max(vals, key=lambda v: v["value"])
            allow = (hi["hi"] - hi["value"]) + (lo["value"] - lo["lo"])
            line += f" differ by {fmt_pct(hi['value'] - lo['value'])}. Rounding allows {fmt_pct(allow)}."
        out.append({"what": el, "agree": agree, "line": line, "values": shown_values(vals)})
    return out


def value_range(v: dict) -> dict:
    return {"lo": Decimal(v["lo"]), "hi": None if v["hi"] is None else Decimal(v["hi"]), "sign": v.get("sign", "")}


def sides_of(g: list[dict], compared: list[dict]) -> tuple[list[dict], list[str]]:
    """The sides of a disagreement. A claim joins a side only if it clashes with no claim on it on any
    measure that disagrees, and only if it states at least one of those measures: a claim that leaves out
    the disputed grade can't take a side, so it never joins the two sides into one."""
    off = [x for x in compared if not x["agree"]]
    if not off:
        return [], []
    vals = {(x["what"], v["claim"]): value_range(v) for x in off for v in x["values"]}

    def apart(a: str, b: str) -> bool:
        return any(clash(vals[(x["what"], a)], vals[(x["what"], b)]) for x in off
                   if (x["what"], a) in vals and (x["what"], b) in vals)

    sides: list[list[str]] = []
    unsided = []
    for cid in sorted(c["id"] for c in g):
        if not any((x["what"], cid) in vals for x in off):
            unsided.append(cid)
            continue
        side = next((s for s in sides if not any(apart(cid, m) for m in s)), None)
        if side is None:
            sides.append([cid])
        else:
            side.append(cid)
    return [{"claims": s} for s in sides], unsided


def group_intervals(claims: list[dict]) -> dict:
    items = [c for c in claims if isinstance(c.get("value"), dict)]
    out = []
    for g in single_link(items, lambda a, b: same_interval(a["value"], b["value"])):
        g = sorted(g, key=lambda c: c["id"])
        compared = [x for x in [compare_widths(g), *compare_grades(g)] if x]
        off = [x["what"] for x in compared if not x["agree"]]
        row = max(g, key=lambda c: len(c["value"].get("grades") or {}))  # the fullest claim stands for the group
        sides, unsided = sides_of(g, compared)
        out.append({
            "hole": row["value"]["hole"],
            "claims": sorted(c["id"] for c in g),
            "row": row["id"],
            "disagree": bool(off),
            "disagree_on": off,
            "compared": compared,
            "sides": sides,
            **({"unsided": unsided} if unsided else {}),
            "arithmetic": {c["id"]: a for c in g if (a := arithmetic(c["value"])) is not None},
        })
    # An interval inside a longer one of the same hole is listed under the shortest such interval.
    value = {c["id"]: c["value"] for c in items}
    for o in out:
        parents = [p for p in out if p is not o and inside(value[o["row"]], value[p["row"]])]
        if parents:
            p = min(parents, key=lambda p: depths(value[p["row"]])[1] - depths(value[p["row"]])[0])
            quotes = " ".join(normalize(c["quote"]) for c in items if c["id"] in o["claims"])
            o["inside"] = p["row"]
            o["inside_word"] = "including" if re.search(r"\bincl", quotes) else "within"
    return {"rule": "interval", "groups": out, "unplaced": []}


def arithmetic(value: dict) -> dict | None:
    f, t, w = metres(value.get("from_m")), metres(value.get("to_m")), metres(value.get("width_m"))
    if f is None or t is None or w is None:
        return None
    diff = t - f
    # Rounded depths can't be held to 0.01 m: allow for the precision each number is written to.
    tol = ARITH_TOL_M + sum(half_unit(value.get(k)) for k in ("from_m", "to_m", "width_m"))
    ok = abs(diff - w) <= tol
    line = f"{value['to_m']} − {value['from_m']} = {diff} m."
    if not ok:
        line += f" The report states {value['width_m']}{'' if 'm' in str(value['width_m']) else ' m'}."
    return {"ok": ok, "computed_m": str(diff), "stated_m": str(value["width_m"]), "line": line}


# ---------------------------------------------------------------- caveats

def caveat_elements(quote: str) -> set[str]:
    words = set(re.findall(r"[a-z]+", normalize(quote)))
    return {sym for sym, names in ELEMENTS.items() if words & set(names)}


def claim_elements(claim: dict) -> set[str]:
    v = claim.get("value")
    if isinstance(v, dict):
        return {el for k, g in (v.get("grades") or {}).items() if (el := element_of(k) or element_of(str(g)))}
    return set()


def attach_caveats(claims: list[dict]) -> dict[str, list[str]]:
    """A caveat about an element attaches to every value of that element from the same report.
    A caveat that names no element attaches to every assay value from that report."""
    out: dict[str, list[str]] = {}
    caveats = [c for c in claims if c["kind"] == "caveat"]
    for c in claims:
        els = claim_elements(c)
        if not els:
            continue
        for cv in caveats:
            if cv["source"]["aris"] != c["source"]["aris"]:
                continue
            named = caveat_elements(cv["quote"])
            if not named or named & els:
                out.setdefault(c["id"], []).append(cv["id"])
    return out


# ---------------------------------------------------------------- answers

POINTER_RE = re.compile(r"\b(?:p|pp|page|pages|table|figure|fig|section|appendix)\.?\s?\d+\b")
VALUE_UNIT_RE = re.compile(r"\s?(?:%|ppm|ppb|g/t|m\b|cm\b|km\b|metres|meters|line|ha\b|hectares)")


def strip_refs(text: str) -> str:
    """Leave out pointers into a report (page 33, Table 3, Figure 2) and the numbers of the reports in this
    corpus. A report number with a unit after it ("41800 ppb") is a value, not a reference, and stays."""
    text = POINTER_RE.sub(" ", text)
    reports = "|".join(str(a) for a in corpus.REPORTS)
    return re.sub(rf"\b(?:aris\s*)?(?:{reports})\b(?!\.\d)",
                  lambda m: m.group() if VALUE_UNIT_RE.match(text, m.end()) else " ", text)


def unbacked_numbers(answer: str, claims: list[dict]) -> list[str]:
    """Numbers in an answer line that no accepted claim (value or quote) contains, as written: "10 ppb" isn't
    backed by a quote that says "<10 ppb"."""
    backed: set = set()
    for c in claims:
        backed.update(signed_numbers(c["quote"]))
        backed.update(signed_numbers(str(c.get("value") or "")))
    return [f"{sign}{n}" for sign, n in signed_numbers(strip_refs(normalize(answer))) if (sign, n) not in backed]


# ---------------------------------------------------------------- settled by the reports' own tables
# Code settles a disagreement only with other evidence from the same reports, read by agent/extract_tables.py:
# the drill collar tables (where each hole is and how deep it went) and the lab assay tables (each sample's
# depths and results). Each rule says what it read and what it found, and a side is backed only when the
# evidence agrees with it and not with the others.

NTS_LETTERS = ("ABCD", "HGFE", "IJKL", "PONM")  # map areas by row from the south, each row from the east


def nts_area(lat: float, lon: float) -> dict | None:
    """The NTS map area a point in BC falls in, such as 092P, with its corners. South of 68° N a map area is 1° of
    latitude by 2° of longitude; series 82, 92, 102 and 112 start at 48° N, and each step of 4° north adds one."""
    w = -lon
    if not (48 <= lat < 60 and 112 <= w < 144):
        return None
    band, row = divmod(int(lat - 48), 4)
    strip, col = divmod(int((w - 112) // 2), 4)
    s, south, east = 82 + 10 * strip + band, 48 + 4 * band + row, 112 + 8 * strip + 2 * col
    return {"key": f"{s:03d}{NTS_LETTERS[row][col]}", "lat": [south, south + 1], "lon_w": [east, east + 2]}


def collar_points(collars: list[dict], zone: int) -> list[dict]:
    out = []
    for c in collars:
        lon, lat = _utm_to_lonlat(zone).transform(int(c["easting"]), int(c["northing"]))
        out.append(c | {"lat": lat, "lon": lon})
    return out


def settle_location(groups: list[dict], collars: list[dict]) -> dict | None:
    """The drill collars settle where the work is: a side is backed when every collar is nearer to it than any
    collar is to another side."""
    if len(groups) < 2 or not collars:
        return None
    d = [[min(km_between(c, p) for p in g["points"]) for g in groups] for c in collars]
    near = {min(range(len(groups)), key=lambda i: row[i]) for row in d}
    if len(near) != 1:
        return None
    s = near.pop()
    farthest = max(row[s] for row in d)
    other = min(row[i] for row in d for i in range(len(groups)) if i != s)
    if farthest >= other:
        return None
    return {"by": "drill collars", "side": s, "farthest_km": round(farthest, 1), "other_km": round(other, 1),
            "line": f"All {len(collars)} drill collars sit within {farthest:.1f} km of this side's points. The nearest "
                    f"collar to the other side is {other:.1f} km from it.",
            "rule": "The reports' drill collar tables say where each hole was drilled. A side is backed when every "
                    "collar is nearer to it than any collar is to another side."}


def settle_map_sheet(groups: list[dict], collars: list[dict]) -> dict | None:
    """The drill collars settle the map sheet when they all fall in one NTS map area that one side gives."""
    areas = {a["key"]: a for c in collars if (a := nts_area(c["lat"], c["lon"]))}
    if len(areas) != 1 or len(groups) < 2:
        return None
    key, a = next(iter(areas.items()))
    side = next((i for i, g in enumerate(groups) if g["key"] == key), None)
    if side is None:
        return None
    return {"by": "drill collars", "side": side, "key": key,
            "line": f"All {len(collars)} drill collars fall in NTS map area {key} ({a['lat'][0]}° to {a['lat'][1]}° N, "
                    f"{a['lon_w'][0]}° to {a['lon_w'][1]}° W).",
            "rule": "Code works out the NTS map area of each drill collar from its coordinates. When every collar falls "
                    "in the area one side gives, that side is backed."}


def settle_total(groups: list[dict], table: dict | None) -> dict | None:
    """A drill program's total, checked against the hole depths in its own collar table."""
    if not table or not groups:
        return None
    total = sum(Decimal(r["depth_m"]) for r in table["rows"])
    match = [i for i, g in enumerate(groups) if abs(Decimal(g["key"]) - total) / max(Decimal(g["key"]), total) <= NUMBER_REL_TOL]
    if len(match) != 1:
        return None
    side = match[0]
    n = len(table["rows"])
    terms = " + ".join(r["depth_m"] for r in table["rows"]) + " = " if n <= 4 else ""
    return {"by": "collar table", "side": side, "total_m": str(total),
            "line": f"{table['caption'].split(':')[0]} on {table['aris']} p{table['page']} lists {n} holes. Their depths "
                    f"add up to {terms}{total:,} m.",
            "rule": "The collar table whose caption names the same year gives each hole's depth. Code adds them."}


def assay_grade(sample: dict, el: str) -> tuple[Decimal, Decimal] | None:
    """One sample's grade for an element as a range in %: a value below detection runs from 0 to its limit. Uses
    the ppm column, or the % column the lab fills when a sample is over the ppm range."""
    keys = [k for k in sample["grades"] if element_of(k) == el]
    for k in sorted(keys, key=lambda k: "%" in k):
        g = grade_value(k, sample["grades"][k])
        if g and g["sign"] != ">":
            return (g["lo"], g["hi"]) if g["sign"] else (g["value"], g["value"])
    return None


def lab_check(value: dict, samples: list[dict]) -> dict | None:
    """An interval against its hole's lab assays. Its depths must be sample boundaries (allowing for how precisely
    they are written); then each grade it gives must match the samples' length-weighted average, allowing for the
    rounding of the grade as written. None when the assays don't reach the interval."""
    d = depths(value)
    if not d or not samples:
        return None
    f, t = d
    tf, tt = half_unit(value["from_m"]) + Decimal("0.005"), half_unit(value["to_m"]) + Decimal("0.005")
    starts = {Decimal(s["from_m"]) for s in samples}
    ends = {Decimal(s["to_m"]) for s in samples}
    if min(starts) > f + tf or max(ends) < t - tt:
        return None
    bf = min(starts, key=lambda x: abs(x - f))
    bt = min(ends, key=lambda x: abs(x - t))
    out: dict = {"from_m": str(bf), "to_m": str(bt)}
    if abs(bf - f) > tf or abs(bt - t) > tt:
        off = value["from_m"] if abs(bf - f) > tf else value["to_m"]
        near = sorted(sorted(starts | ends, key=lambda x: abs(x - metres(off)))[:2])
        return out | {"ok": False, "boundaries": False,
                      "line": f"{off} m isn't a sample boundary. The nearest are {near[0]} m and {near[1]} m."}
    inside = [s for s in samples if Decimal(s["from_m"]) >= bf and Decimal(s["to_m"]) <= bt]
    length = sum(Decimal(s["to_m"]) - Decimal(s["from_m"]) for s in inside)
    if length < (bt - bf) - Decimal("0.01"):
        return None  # a stretch of the interval wasn't sampled, so its average can't be checked
    out |= {"boundaries": True, "samples": [s["sample"] for s in inside], "length_m": str(length), "grades": []}
    ok = True
    w = metres(value.get("width_m"))
    if w is not None and abs(w - (bt - bf)) > half_unit(value["width_m"]) + Decimal("0.005"):
        ok = False
        out["width_off"] = True
    for k, raw in (value.get("grades") or {}).items():
        el, g = element_of(k) or element_of(str(raw)), grade_value(k, str(raw))
        if not (el and g):
            continue
        parts = [(Decimal(s["to_m"]) - Decimal(s["from_m"]), assay_grade(s, el)) for s in inside]
        if any(r is None for _, r in parts):
            continue
        lo = sum(wt * r[0] for wt, r in parts) / length
        hi = sum(wt * r[1] for wt, r in parts) / length
        # Reports often work a composite out from rounded sample values, or cut it off instead of rounding it
        # (341 ppm for 341.6), so 1% of the lab average also counts as a match.
        agree = not clash(g, {"lo": lo, "hi": hi}) or (
            g["sign"] == "" and lo == hi and abs(g["value"] - lo) <= lo * LAB_REL_TOL)
        ok &= agree
        out["grades"].append({"what": el, "written": written_grade(k, str(raw)), "agree": agree,
                              "lab_pct": [f"{lo:.9f}", f"{hi:.9f}"]})
    if value.get("grades") and not out["grades"] and not out.get("width_off"):
        return None  # the samples report none of the grades this interval gives
    out["ok"] = ok
    return out


def in_unit(pct: Decimal, unit: str) -> str:
    """A grade held as % in a report's unit, to three significant figures: 0.00061% in ppm is 6.1 ppm."""
    if unit in ("ppm", "ppb", "g/t"):
        v = pct / TO_PCT[unit]
        return f"{v:,.{max(0, 2 - int(math.floor(math.log10(v))) if v else 0)}f} {unit}"
    return f"{pct:.{max(0, 2 - int(math.floor(math.log10(pct))) if pct else 0)}f}%"


def lab_value(check: dict, el: str, written: str) -> str:
    """The lab average for one element of a lab check, in the unit the report wrote it in."""
    g = next(x for x in check["grades"] if x["what"] == el)
    lo, hi = (Decimal(x) for x in g["lab_pct"])
    unit = unit_of(written) or "%"
    if lo == hi:
        return in_unit(lo, unit)
    # Samples below detection count as anything from 0 to their limit, so the average is a range.
    return f"<{in_unit(hi, unit)}" if lo == 0 else f"{in_unit(lo, unit)} to {in_unit(hi, unit)}"


def settle_interval(g: dict, lab: dict[str, dict], src: dict[str, str]) -> dict | None:
    """A disagreement between intervals of one hole, settled by the lab assays: one side matches the samples on
    every measure in dispute, and every other side doesn't. src names each claim's page ("41800 p37")."""
    if not g.get("disagree") or not g.get("sides"):
        return None

    def fits(cid: str) -> bool | None:
        r = lab.get(cid)
        if r is None:
            return None
        if not r["boundaries"] or ("width" in g["disagree_on"] and r.get("width_off")):
            return False
        return all(x["agree"] for x in r["grades"] if x["what"] in g["disagree_on"])

    verdict = [{fits(c) for c in s["claims"]} for s in g["sides"]]
    good = [i for i, v in enumerate(verdict) if v == {True}]
    if len(good) != 1 or any(v != {False} for i, v in enumerate(verdict) if i != good[0]):
        return None
    side = good[0]
    backed = g["sides"][side]["claims"]
    others = [c for i, s in enumerate(g["sides"]) if i != side for c in s["claims"]]
    written = {(x["what"], v["claim"]): v["written"] for x in g["compared"] for v in x["values"]}
    els = [w for w in g["disagree_on"] if w != "width"] or [x["what"] for x in lab[backed[0]]["grades"]
                                                            if x["what"] in ("Cu", "Ni")]
    line = lab_found(lab[backed[0]], {x["what"]: x["written"] for x in lab[backed[0]]["grades"] if x["what"] in els})
    said = "; ".join(f"{', '.join(written[(w, c)] + (' m' if w == 'width' else '') for w in g['disagree_on'])} ({src[c]})"
                     for c in backed)
    line += f" That matches {said}."
    for c in others:
        o = lab[c]
        if not o["boundaries"]:
            line += f" {src[c]}: {o['line']}"
        else:
            off = [f"{written[(w, c)]}{' m' if w == 'width' else ''}" for w in g["disagree_on"]
                   if (w == "width" and o.get("width_off")) or any(x["what"] == w and not x["agree"] for x in o["grades"])]
            line += f" {src[c]} gives {', '.join(off)}."
    return {"by": "lab assays", "side": side, "line": line,
            "rule": "The reports' assay tables list each sample's depths and lab results. Code averages the samples "
                    "inside an interval, weighted by length, and backs the side whose depths are sample boundaries "
                    "and whose disputed numbers match, allowing for how precisely each is written."}


def lab_found(check: dict, written: dict[str, str]) -> str:
    """What the lab found over an interval's depths, for the elements in written, each in the unit the report
    writes it in ({"Cu": "0.002%"} reads the lab's copper in %)."""
    n = len(check["samples"])
    head = f"The lab assayed {check['from_m']} to {check['to_m']} m ({check['length_m']} m) as " + (
        f"one sample, {check['samples'][0]}" if n == 1 else f"{n} samples")
    vals = [f"{el} {lab_value(check, el, w)}" for el, w in written.items()]
    if not vals:
        return head + "."
    return head + (f": {', '.join(vals)}." if n == 1 else f", which average {', '.join(vals)}, weighted by length.")


def lab_note(g: dict, lab: dict[str, dict], src: dict[str, str]) -> dict | None:
    """For an interval whose stated width doesn't match its own depths: what the lab sampled at those depths, and
    which of the row's numbers the samples don't bear out."""
    off = [cid for cid, a in (g.get("arithmetic") or {}).items() if not a["ok"] and lab.get(cid, {}).get("boundaries")]
    if not off:
        return None
    cid = off[0]
    r = lab[cid]
    misses = [x for x in r["grades"] if not x["agree"]]
    line = lab_found(r, {x["what"]: x["written"] for x in misses})
    gives = ([f"{g['arithmetic'][cid]['stated_m']} m"] if r.get("width_off") else []) + [f"{x['what']} {x['written']}"
                                                                                       for x in misses]
    if gives:
        line += f" {src[cid]} gives {', '.join(gives[:-1]) + ' and ' + gives[-1] if len(gives) > 1 else gives[0]}."
    return {"by": "lab assays", "line": line,
            "rule": "The reports' assay tables list each sample's depths and lab results. Code averages the samples inside "
                    "an interval, weighted by length, and compares each number the report gives, allowing for how "
                    "precisely it is written."}


# A map sheet label: NTS or BCGS with the sheet right after it, as in "NTS: 092P096", "NTS/BCGS: 093N043" or
# "N.T.S.  92P/15". Words between the label and a sheet ("BCGS Map Sheets 092P...") don't count.
NTS_LABEL_RE = re.compile(r"\b(?:N\.?\s?T\.?\s?S\.?|BCGS)(?:\s?/\s?(?:N\.?\s?T\.?\s?S\.?|BCGS))?[\s:|]*"
                          r"(0?(\d{2,3})\s?([A-P])(?![A-Za-z])(?:[./]?\d{1,3})?)")


def map_sheet_labels(text: str) -> list[dict]:
    """Every map sheet a page labels. Code reads these itself because they are exact labels, so a page no session
    opened still counts."""
    out = []
    for m in NTS_LABEL_RE.finditer(text):
        n = int(m.group(2))
        if 82 <= n <= 114:
            out.append({"key": f"{n:03d}{m.group(3)}", "written": re.sub(r"\s+", " ", m.group()).strip()})
    return out
