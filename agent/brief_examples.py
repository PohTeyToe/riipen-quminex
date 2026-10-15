"""Example claims for the Brief tab, one per track, all run through the same checker.

Track 1 is a real claim from the run. Tracks 2 and 3 are written by hand from
real pages to show the format; no track 2 or 3 agent exists.
Run after build_data.py. Writes data/brief_examples.json.
"""
from __future__ import annotations

import json

import corpus
import rules
from checker import check_claim

HAND = "Written by hand from a real page to show the format. No track 2 or 3 agent exists."

TRACK2 = {"track": 2, "field": "geophysical_surveys", "kind": "value", "value": "205 line-km", "unit": "line-km",
          "source": {"aris": 41800, "page": 38},
          "quote": "The survey consisted of one block totalling 205 line-km with a traverse line spacing of 100 m "
                   "(with some 50 m infill) and tie line spacing of 1,000 m."}
TRACK3_TEXT = {"track": 3, "field": "drilling_2022.intervals", "kind": "interval",
               "value": {"hole": "IL-22-011", "from_m": "175.36", "to_m": "177.53", "width_m": "2.36",
                         "grades": {"Cu (%)": "0.30", "Ni (%)": "0.049"}},
               "unit": None, "source": {"aris": 41327, "page": 34},
               "quote": "IL-22-011 intersected massive sulphide mineralization between 175.36 and 177.53 m. The "
                        "mineralization was similar to IL-22-009, consisting of massive net-textured magnetite, rarely "
                        "replaced by hematite, along with bands and veinlets of pyrite, pyrrhotite and trace "
                        "chalcopyrite. This zone returned 0.30% copper and 0.049% nickel over 2.36 m."}
TRACK3_TABLE = {"track": 3, "field": "drilling_2022.intervals", "kind": "interval",
                "value": {"hole": "IL-22-011", "from_m": "175.46", "to_m": "177.53", "width_m": "2.07",
                          "grades": {"Cu (%)": "0.30", "Ni (%)": "0.049"}},
                "unit": None, "source": {"aris": 41327, "page": 33},
                "quote": "IL-22-011 175.46 177.53 2.07 0.30 0.049"}


def checked(c: dict, cid: str) -> dict:
    r = check_claim(c["kind"], c["value"], c["source"]["aris"], c["source"]["page"], c["quote"])
    return {"id": cid, **c, "censored": False, "caveats": [],
            "check": {"by": r["by"], "quote_on_page": r["quote_on_page"], "value_in_quote": r["value_in_quote"]},
            "also_in": r["also_in"], "accepted": r["accepted"], "run": None}


def main() -> None:
    claims = json.loads((corpus.DATA / "claims.json").read_text(encoding="utf-8"))["claims"]
    field_claims = [c for c in claims if c["scope"] == "field" and c["field"] == "location" and c["check"]["by"] == "code"]
    t1 = next((c for c in field_claims if c["source"] == {"aris": 36807, "page": 3}), field_claims[0] if field_claims else None)
    t2 = checked(TRACK2, "example-t2")
    t3 = checked(TRACK3_TEXT, "example-t3")
    t3_table = checked(TRACK3_TABLE, "example-t3-table")
    g = rules.group_intervals([{"id": t3["id"], **TRACK3_TEXT}, {"id": t3_table["id"], **TRACK3_TABLE}])["groups"][0]
    out = {
        "note_hand_written": HAND,
        "examples": [
            {"track": 1, "label": "Track 1: a real claim from the run", "hand_written": False,
             "claim": {k: t1[k] for k in ("id", "track", "field", "kind", "value", "unit", "censored", "source", "quote",
                                          "caveats", "check", "also_in", "run")} if t1 else None},
            {"track": 2, "label": "Track 2: one geophysics fact", "hand_written": True, "note": HAND, "claim": t2},
            {"track": 3, "label": "Track 3: the IL-22-011 interval and its disagreement", "hand_written": True, "note": HAND,
             "claim": t3, "compared_with": t3_table,
             "code_result": {"same_interval": len(g["claims"]) == 2, "widths_disagree": g["disagree"],
                             "sides": g["sides"], "arithmetic": g["arithmetic"], "rule_text": rules.RULE_TEXT["interval"]}},
        ],
    }
    assert t2["accepted"] and t3["accepted"] and t3_table["accepted"], "hand-written examples must pass the checker"
    (corpus.DATA / "brief_examples.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("t1", t1["id"] if t1 else None, "| t2", t2["accepted"], "| t3", t3["accepted"], g["disagree"],
          [a["line"] for a in g["arithmetic"].values()])


if __name__ == "__main__":
    main()
