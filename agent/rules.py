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

from checker import ELEMENTS, censored, element_of, numbers, to_decimal, unit_of
from textnorm import normalize

SAME_PLACE_KM = 5.0
SAME_INTERVAL_OVERLAP = Decimal("0.9")
WIDTH_TOL_M = Decimal("0.05")
ARITH_TOL_M = Decimal("0.01")
NUMBER_REL_TOL = Decimal("0.001")

RULE_TEXT = {
    "location": "Points within 5 km count as the same place, because each report gives its own centre of work "
                "to the nearest minute. Points farther apart are put on different sides.",
    "map_sheet": "Map sheets are compared on the four-character NTS map area, such as 092P.",
    "exact_text": "Values are compared as text, ignoring case, punctuation and the field's own label words.",
    "number": "Numbers within 0.1% of each other count as the same value, so rounding doesn't split them.",
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


def group_numbers(claims: list[dict]) -> dict:
    items, unplaced = [], []
    for c in claims:
        d = to_decimal(c.get("value"))
        if d is None or censored(c.get("value")):
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


def grade_pct(key: str, raw: str) -> tuple[Decimal, Decimal] | None:
    """A grade as % with half a unit of its last written digit, or None if censored or unreadable."""
    if censored(raw):
        return None
    d = to_decimal(raw)
    unit = unit_of(str(raw), key)
    if d is None or unit is None:
        return None
    return d * TO_PCT[unit], half_unit(raw) * TO_PCT[unit]


def grades_by_element(value: dict) -> dict[str, tuple]:
    out = {}
    for k, v in (value.get("grades") or {}).items():
        el = element_of(k) or element_of(str(v))
        g = grade_pct(k, str(v))
        if el and g:
            out[el] = g
    return out


def hole_key(hole: str) -> tuple:
    parts = re.findall(r"[a-z]+|\d+", normalize(hole))
    return tuple(int(p) if p.isdigit() else p for p in parts)


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
    return all(el in ga and el in gb and abs(ga[el][0] - gb[el][0]) <= max(ga[el][1], gb[el][1])
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


def compare_widths(g: list[dict]) -> dict | None:
    known = [(w, c) for c in g if (w := metres(c["value"].get("width_m"))) is not None]
    if len(known) < 2:
        return None
    spread = max(w for w, _ in known) - min(w for w, _ in known)
    agree = spread <= WIDTH_TOL_M
    line = "Widths " + " and ".join(f"{w} m" for w, _ in known)
    line += " agree." if agree else f" differ by {spread} m. The rule allows {WIDTH_TOL_M} m."
    return {"what": "width", "agree": agree, "line": line,
            "values": [{"claim": c["id"], "written": str(c["value"]["width_m"]), "value": str(w), "allow": str(WIDTH_TOL_M)}
                       for w, c in known]}


def compare_grades(g: list[dict]) -> list[dict]:
    by_el: dict[str, list] = {}
    for c in g:
        for k, raw in (c["value"].get("grades") or {}).items():
            el, pct = element_of(k) or element_of(str(raw)), grade_pct(k, str(raw))
            if el and pct:
                by_el.setdefault(el, []).append({"claim": c["id"], "written": written_grade(k, str(raw)),
                                                 "value": str(pct[0]), "allow": str(pct[1])})
    out = []
    for el, vals in by_el.items():
        if len(vals) < 2:
            continue
        nums = [Decimal(v["value"]) for v in vals]
        spread, allow = max(nums) - min(nums), max(Decimal(v["allow"]) for v in vals)
        agree = spread <= allow
        shown = [v["written"] if v["written"].endswith("%") else f"{v['written']} ({fmt_pct(Decimal(v['value']))})"
                 for v in vals]
        line = f"{el}: " + " and ".join(shown)
        line += " agree within rounding." if agree else f" differ by {fmt_pct(spread)}. Rounding allows {fmt_pct(allow)}."
        out.append({"what": el, "agree": agree, "line": line, "values": vals})
    return out


def sides_of(g: list[dict], compared: list[dict]) -> list[dict]:
    """Claims that agree with each other on every measure that disagrees share a side."""
    off = [x for x in compared if not x["agree"]]

    def close(a: dict, b: dict) -> bool:
        for x in off:
            va = next((v for v in x["values"] if v["claim"] == a["id"]), None)
            vb = next((v for v in x["values"] if v["claim"] == b["id"]), None)
            if va and vb and abs(Decimal(va["value"]) - Decimal(vb["value"])) > max(Decimal(va["allow"]), Decimal(vb["allow"])):
                return False
        return True

    return [{"claims": sorted(c["id"] for c in side)} for side in single_link(g, close)] if off else []


def group_intervals(claims: list[dict]) -> dict:
    items = [c for c in claims if isinstance(c.get("value"), dict)]
    out = []
    for g in single_link(items, lambda a, b: same_interval(a["value"], b["value"])):
        g = sorted(g, key=lambda c: c["id"])
        compared = [x for x in [compare_widths(g), *compare_grades(g)] if x]
        off = [x["what"] for x in compared if not x["agree"]]
        row = max(g, key=lambda c: len(c["value"].get("grades") or {}))  # the fullest claim stands for the group
        out.append({
            "hole": row["value"]["hole"],
            "claims": sorted(c["id"] for c in g),
            "row": row["id"],
            "disagree": bool(off),
            "disagree_on": off,
            "compared": compared,
            "sides": sides_of(g, compared),
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

# Report numbers and pointers into a report (page 33, Table 3, Figure 2) aren't values.
REPORT_REF_RE = re.compile(r"\b(?:aris\s*)?(?:34595|36430|36807|38640|40980|41327|41800)\b"
                           r"|\b(?:p|pp|page|pages|table|figure|fig|section|appendix)\.?\s?\d+\b")


def unbacked_numbers(answer: str, claims: list[dict]) -> list[str]:
    """Numbers in an answer line that no accepted claim (value or quote) contains."""
    text = REPORT_REF_RE.sub(" ", normalize(answer))
    backed: set[Decimal] = set()
    for c in claims:
        backed.update(numbers(c["quote"]))
        backed.update(numbers(str(c.get("value") or "")))
    return [str(n) for n in numbers(text) if n not in backed]
