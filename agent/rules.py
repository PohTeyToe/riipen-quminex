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

from checker import censored, numbers, to_decimal
from textnorm import normalize

SAME_PLACE_KM = 5.0
WIDTH_TOL_M = Decimal("0.05")
ARITH_TOL_M = Decimal("0.01")
NUMBER_REL_TOL = Decimal("0.001")

RULE_TEXT = {
    "location": "Points within 5 km count as the same place, because each report gives its own centre of work "
                "to the nearest minute. Points farther apart are put on different sides.",
    "map_sheet": "Map sheets are compared on the four-character NTS map area, such as 092P.",
    "exact_text": "Values are compared as text, ignoring case, punctuation and the field's own label words.",
    "number": "Numbers within 0.1% of each other count as the same value, so rounding doesn't split them.",
    "interval": "Two intervals for the same hole with the same copper and nickel grades and overlapping depths "
                "describe the same interval. Their widths disagree if they differ by more than 0.05 m. Code also "
                "checks that to minus from equals the stated width, allowing for how precisely each number is written.",
    "none": "No disagreement check on text fields. Disagreement checks run on locations, map sheets, divisions, "
            "metres and drill intervals.",
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

ELEMENTS = {
    "Cu": ("cu", "copper"), "Ni": ("ni", "nickel"), "Au": ("au", "gold"), "Pt": ("pt", "platinum"),
    "Pd": ("pd", "palladium"), "Co": ("co", "cobalt"), "Ag": ("ag", "silver"),
}
TO_PCT = {"%": Decimal(1), "ppm": Decimal("0.0001"), "g/t": Decimal("0.0001"), "ppb": Decimal("0.0000001")}


def element_of(key: str) -> str | None:
    words = re.findall(r"[a-z]+", key.lower())
    for sym, names in ELEMENTS.items():
        if any(w in names for w in words):
            return sym
    return None


def unit_of(*texts: str) -> str | None:
    s = " ".join(t.lower() for t in texts if t)
    for u in ("ppm", "ppb", "g/t", "%"):
        if u in s:
            return u
    return None


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


def same_grades(a: dict, b: dict) -> bool:
    ga, gb = grades_by_element(a), grades_by_element(b)
    for el in ("Cu", "Ni"):
        if el not in ga or el not in gb:
            return False
        (va, ha), (vb, hb) = ga[el], gb[el]
        if abs(va - vb) > max(ha, hb):
            return False
    return True


def half_unit(raw) -> Decimal:
    """Half a unit of the last digit written: 318.3 -> 0.05, 2.36 -> 0.005, 47 cm -> 0.005 m."""
    d = to_decimal(raw)
    if d is None:
        return Decimal(0)
    exp = d.as_tuple().exponent
    half = Decimal(5).scaleb(exp - 1) if isinstance(exp, int) else Decimal(0)
    return half / 100 if re.search(r"\bcm\b", str(raw).lower()) else half


def depths_overlap(a: dict, b: dict) -> bool:
    fa, ta, fb, tb = (metres(a.get("from_m")), metres(a.get("to_m")), metres(b.get("from_m")), metres(b.get("to_m")))
    if None in (fa, ta, fb, tb):
        return True  # can't tell, so grades decide
    return fa < tb and fb < ta


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


def group_intervals(claims: list[dict]) -> dict:
    def close(a, b):
        return (hole_key(a["value"]["hole"]) == hole_key(b["value"]["hole"])
                and same_grades(a["value"], b["value"])
                and depths_overlap(a["value"], b["value"]))

    groups = single_link([c for c in claims if isinstance(c.get("value"), dict)], close)
    out = []
    for g in groups:
        widths = [(metres(c["value"].get("width_m")), c["id"]) for c in g]
        known = [w for w, _ in widths if w is not None]
        disagree = bool(known) and (max(known) - min(known)) > WIDTH_TOL_M
        sides = []
        if disagree:
            for w, cid in sorted(widths, key=lambda x: (x[0] is None, x[0] or 0)):
                side = next((s for s in sides if w is not None and s["width_m"] is not None
                             and abs(s["width_m"] - w) <= WIDTH_TOL_M), None)
                if side:
                    side["claims"].append(cid)
                else:
                    sides.append({"width_m": w, "claims": [cid]})
        out.append({
            "hole": g[0]["value"]["hole"],
            "claims": sorted(c["id"] for c in g),
            "disagree": disagree,
            "sides": [{"width_m": str(s["width_m"]), "claims": s["claims"]} for s in sides],
            "arithmetic": {c["id"]: a for c in g if (a := arithmetic(c["value"])) is not None},
        })
    return {"rule": "interval", "groups": out, "unplaced": []}


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
