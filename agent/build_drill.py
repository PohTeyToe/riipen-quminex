"""The reports' drill tables as the site draws them: every collar and every lab sample, for the core strips.

Usage: python agent/build_drill.py

Reads data/private/tables/<aris>.json (written by extract_tables.py from the PDFs) and writes data/drill.json.
Only numbers ship: hole, position, depth, sample depths, five grades as written, and the page each row is on.
No page text. Nothing here involves the agent.

A collar row reads "IL-22-001 645575 5756817 1026 273 -45 228": hole, easting, northing, elevation, azimuth,
dip, depth. IL-22-005 has no elevation on the page, so the numbers are read from the right.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TABLES = DATA / "private" / "tables"

# The collar table each drilling field is settled with (rules.settle_total): the one whose caption names the year.
COLLAR_TABLES = {41327: (30, "2022"), 41800: (33, "2023")}
# Grades the strips and the hole view use, in the lab's own units.
GRADES = ["Cu (ppm)", "Ni (ppm)", "Au (ppb)", "Pt (ppb)", "Pd (ppb)"]
NUM = re.compile(r"^-?\d+(?:\.\d+)?$")


def collar(row: str, aris: int, page: int, year: str) -> dict:
    hole, *rest = row.split()
    nums = [x for x in rest if NUM.match(x)]
    if len(nums) not in (6, 5):
        raise SystemExit(f"{aris} p{page}: can't read collar row {row!r}")
    easting, northing = nums[0], nums[1]
    depth, dip, azimuth = nums[-1], nums[-2], nums[-3]
    elevation = nums[2] if len(nums) == 6 else None
    return {"hole": hole.rstrip("*"), "marked": hole.endswith("*"), "year": int(year), "easting": easting,
            "northing": northing, "elevation": elevation, "azimuth": azimuth, "dip": dip, "depth_m": depth,
            "aris": aris, "page": page}


def grade(row: dict, key: str) -> str | None:
    v = row["grades"].get(key)
    # The lab fills the % column only when a sample runs over the ppm range; carry it in ppm as written in %.
    if key == "Cu (ppm)" and (v is None or v.startswith(">")) and row["grades"].get("Cu (%)"):
        return f'{row["grades"]["Cu (%)"]}%'
    return v


def build() -> dict:
    holes = []
    for aris, (page, year) in COLLAR_TABLES.items():
        t = json.loads((TABLES / f"{aris}.json").read_text(encoding="utf-8"))
        table = next(c for c in t["collars"] if c["page"] == page)
        if year not in table["caption"]:
            raise SystemExit(f"{aris} p{page}: caption {table['caption']!r} doesn't name {year}")
        # The same filter as build_data.load_tables: a sample interval listed twice (a reprinted page, or a field
        # duplicate) counts once, first listing wins; rows at zero width are the lab's standards and blanks.
        samples: dict[str, list] = {}
        seen = set()
        for a in t["assays"]:
            for r in a["rows"]:
                key = (r["hole"], r["from_m"], r["to_m"])
                if key in seen or not (r["sample"] and r["grades"] and float(r["to_m"]) > float(r["from_m"])):
                    continue
                seen.add(key)
                samples.setdefault(r["hole"], []).append(
                    [r["from_m"], r["to_m"], r["sample"], a["page"], *[grade(r, k) for k in GRADES]])
        for c in table["rows"]:
            h = collar(c["row"], aris, page, year)
            rows = sorted(samples.get(h["hole"], []), key=lambda s: float(s[0]))
            h["samples"] = rows
            h["sample_pages"] = sorted({s[3] for s in rows})
            holes.append(h)
    n = sum(len(h["samples"]) for h in holes)
    checks = lab_checks()
    return {
        "note": "Collar rows from each report's collar table; samples from its lab certificate pages, read by "
                "agent/extract_tables.py. Grades as the lab wrote them. Sample row: from_m, to_m, sample, page, "
                + ", ".join(GRADES) + ".",
        "grades": GRADES,
        "holes": holes,
        "lab_checks": checks,
        "lab_checks_note": "Every interval claim on the file against its hole's lab samples: rules.lab_check, the same "
                           "code build_data.py runs for the file's lab counts. ok is false when the depths aren't sample "
                           "boundaries, the width is off, or a grade doesn't match. Missing: the samples don't reach it.",
        "totals": {"holes": len(holes), "samples": n},
    }


def lab_checks() -> dict[str, dict]:
    """rules.lab_check for every interval claim the file shows, with the lab value in the report's own unit."""
    import build_data
    import rules

    tables = build_data.load_tables()
    fields = json.loads((DATA / "fields.json").read_text(encoding="utf-8"))["fields"]
    claims = {c["id"]: c for c in json.loads((DATA / "claims.json").read_text(encoding="utf-8"))["claims"]}
    out = {}
    for f in fields:
        for part in f.get("parts") or []:
            if part["rule"] != "interval":
                continue
            for g in part["groups"]:
                samples = tables["assays"].get(rules.hole_key(g["hole"]), [])
                for cid in g["claims"]:
                    r = rules.lab_check(claims[cid]["value"], samples)
                    if r is None:
                        continue
                    out[cid] = {
                        "ok": r["ok"],
                        "from_m": r["from_m"],
                        "to_m": r["to_m"],
                        "boundaries": r["boundaries"],
                        "line": r.get("line"),
                        "width_off": bool(r.get("width_off")),
                        "samples": r.get("samples", []),
                        "grades": [{"what": x["what"], "written": x["written"], "agree": x["agree"],
                                    "lab": rules.lab_value(r, x["what"], x["written"])} for x in r.get("grades", [])],
                    }
    return out


def main() -> None:
    out = build()
    (DATA / "drill.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    t = out["totals"]
    print(f"{t['holes']} holes, {t['samples']} lab samples")


if __name__ == "__main__":
    main()
