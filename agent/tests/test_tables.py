"""The reports' own tables: reading them, and what they settle. Rows are copied from the real pages."""
from decimal import Decimal

from extract_tables import assay_rows, collar_table
from rules import (collar_points, group_intervals, lab_check, lab_note, nts_area, settle_interval, settle_location,
                   settle_map_sheet, settle_total)
from conftest import claim
from test_checker import Q10_25, Q33, Q34, Q37_25, V10_25, V33, V34, V37_25

# 41800 p33, Table 3, as the text layer gives it.
P33_TEXT = ("Table 3: 2023 Iron Lake Diamond Drill Hole Parameters \n \nHole \nEasting \n(m) \nNorthing \n(m) \n"
            "Elevation \n(m) \nAzimuth (°) \nDip (°) \nDepth \n(m) \n"
            "IL-23-024 \n645362 \n5756889 \n1033 \n125 \n-55 \n606 \n"
            "IL-23-025 \n643289 \n5759109 \n1074 \n100 \n-65 \n750 \n"
            "IL-23-026 \n645605 \n5756678 \n1015 \n305 \n-60 \n324 \n \n")


def test_collar_table_keeps_hole_position_and_depth():
    cap, rows = collar_table(P33_TEXT)
    assert cap == "Table 3: 2023 Iron Lake Diamond Drill Hole Parameters"
    assert [(r["hole"], r["easting"], r["northing"], r["depth_m"]) for r in rows] == [
        ("IL-23-024", "645362", "5756889", "606"), ("IL-23-025", "643289", "5759109", "750"),
        ("IL-23-026", "645605", "5756678", "324")]


def words(y: float, cells: list[tuple[float, str]]) -> list[tuple]:
    return [(x, y, x + 4 * len(t), y + 8, t) for x, t in cells]


# 41800 p422, read in its upright frame: the heading, the element names, their units, then two sample rows.
P422 = (words(38, [(34, "Hole"), (81, "Sample"), (131, "From"), (173, "To"), (188, "Width"), (217, "Certificate")])
        + words(40, [(352, "Au"), (409, "Pd"), (438, "Pt"), (493, "Cu"), (521, "Cu"), (635, "Ni")])
        + words(50, [(349, "ppb"), (405, "ppb"), (433, "ppb"), (487, "ppm"), (524, "%"), (628, "ppm")])
        + words(90, [(34, "IL"), (41, "-23-025"), (81, "C367536"), (130, "318.25"), (163, "319.45"), (198, "1.20"),
                     (222, "A23-09720"), (357, "3"), (408, "<"), (413, "5"), (437, "18"), (492, "5.5"), (625, "1230.0")])
        + words(102, [(34, "IL"), (41, "-23-025"), (81, "C367537"), (130, "319.45"), (163, "320.14"), (198, "0.69"),
                      (222, "A23-09720"), (357, "3"), (408, "<"), (413, "5"), (437, "12"), (492, "7.2"), (625, "856.0")]))


def test_assay_rows_put_each_value_in_its_column():
    rows = assay_rows(P422)
    assert [r["sample"] for r in rows] == ["C367536", "C367537"]
    r = rows[0]
    assert (r["hole"], r["from_m"], r["to_m"], r["width_m"], r["certificate"]) == ("IL-23-025", "318.25", "319.45",
                                                                                   "1.20", "A23-09720")
    # The empty Cu (%) column stays empty, so 1230.0 lands under Ni, not one column to the left.
    assert r["grades"] == {"Au (ppb)": "3", "Pd (ppb)": "<5", "Pt (ppb)": "18", "Cu (ppm)": "5.5", "Ni (ppm)": "1230.0"}


def test_nts_area_from_coordinates():
    assert nts_area(51.94, -120.9)["key"] == "092P"      # the Iron Lake drill collars
    assert nts_area(49.28, -123.12)["key"] == "092G"     # Vancouver
    assert nts_area(55.5, -125.0)["key"] == "093N"
    assert nts_area(54.52, -128.6)["key"] == "103I"      # Terrace
    assert nts_area(51.5, -100.0) is None                # not in BC's series


COLLARS = collar_points([{"hole": h, "easting": e, "northing": n, "depth_m": d} for h, e, n, d in (
    ("IL-23-024", "645362", "5756889", "606"), ("IL-23-025", "643289", "5759109", "750"),
    ("IL-23-026", "645605", "5756678", "324"))], 10)


def test_collars_settle_the_location_by_a_clear_margin():
    rest = {"points": [{"lat": 51.95, "lon": -120.9}], "key": "092P"}
    form = {"points": [{"lat": 51.9025, "lon": -121.80056}], "key": "093N"}
    s = settle_location([form, rest], COLLARS)
    assert s["side"] == 1 and s["farthest_km"] < 5 < 50 < s["other_km"]
    # Collars split between two places settle nothing.
    far = collar_points([{"hole": "X-1", "easting": "580000", "northing": "5751000", "depth_m": "10"}], 10)
    assert settle_location([form, rest], COLLARS + far) is None


def test_collars_settle_the_map_sheet():
    s = settle_map_sheet([{"key": "092P"}, {"key": "093N"}], COLLARS)
    assert s["side"] == 0 and s["key"] == "092P" and "51° to 52° N, 120° to 122° W" in s["line"]
    assert settle_map_sheet([{"key": "093A"}, {"key": "093N"}], COLLARS) is None


def test_collar_depths_settle_a_drill_total():
    table = {"aris": 41800, "page": 33, "caption": "Table 3: 2023 Iron Lake Diamond Drill Hole Parameters",
             "rows": collar_table(P33_TEXT)[1]}
    s = settle_total([{"key": "1680"}, {"key": "1670"}], table)
    assert s["side"] == 0 and s["line"] == ("Table 3 on 41800 p33 lists 3 holes. Their depths add up to "
                                            "606 + 750 + 324 = 1,680 m.")
    assert settle_total([{"key": "1700"}], table) is None


def sample(sid, f, t, cu, ni, au="3"):
    return {"sample": sid, "from_m": f, "to_m": t, "width_m": str(Decimal(t) - Decimal(f)),
            "grades": {"Au (ppb)": au, "Cu (ppm)": cu, "Ni (ppm)": ni}}


# 41800 p422: the 17 samples of IL-23-025 from 318.25 to 342.29 m (Cu and Ni, ppm).
IL25 = [sample(s, f, t, cu, ni) for s, f, t, cu, ni in (
    ("C367536", "318.25", "319.45", "5.5", "1230.0"), ("C367537", "319.45", "320.14", "7.2", "856.0"),
    ("C367539", "320.14", "321.38", "7.8", "1060.0"), ("C367540", "321.38", "322.40", "13.3", "614.0"),
    ("C367541", "322.40", "322.93", "3.5", "49.4"), ("C367542", "322.93", "324.00", "5.1", "994.0"),
    ("C367543", "324.00", "326.00", "3.8", "1240.0"), ("C367544", "326.00", "327.77", "3.4", "1190.0"),
    ("C367546", "327.77", "328.81", "6.4", "1050.0"), ("C367547", "328.81", "330.37", "17.8", "1240.0"),
    ("C367548", "330.37", "332.57", "4.6", "1420.0"), ("C367549", "332.57", "333.90", "3.4", "1180.0"),
    ("C367550", "333.90", "335.89", "3.4", "897.0"), ("C367551", "335.89", "336.48", "2.1", "443.0"),
    ("C367552", "336.48", "338.58", "3.3", "735.0"), ("C367554", "338.58", "339.93", "10.4", "529.0"),
    ("C367555", "339.93", "342.29", "5.4", "1010.0"))]
SRC = {"table": "41800 p37", "text": "41800 p10", "t33": "41327 p33", "t34": "41327 p34", "row": "41327 p33"}


def test_the_lab_assays_settle_a_copper_disagreement():
    g = group_intervals([claim("table", 41800, 37, Q37_25, V37_25, "interval"),
                         claim("text", 41800, 10, Q10_25, V10_25, "interval")])["groups"][0]
    lab = {"table": lab_check(V37_25, IL25), "text": lab_check(V10_25, IL25)}
    assert not lab["table"]["ok"] and lab["text"]["ok"]
    s = settle_interval(g, lab, SRC)
    assert s["side"] == next(i for i, x in enumerate(g["sides"]) if x["claims"] == ["text"])
    assert s["line"] == ("The lab assayed 318.25 to 342.29 m (24.04 m) as 17 samples, which average Cu 6.09 ppm, "
                         "weighted by length. That matches 6 ppm (41800 p10). 41800 p37 gives 0.002%.")


def test_the_lab_assays_settle_a_width_by_the_sample_boundaries():
    samples = [sample("C119626", "174.96", "175.46", "178.0", "62.0"),
               sample("C119627", "175.46", "177.53", "3020.0", "486.0", "10")]
    g = group_intervals([claim("t33", 41327, 33, Q33, V33, "interval"),
                         claim("t34", 41327, 34, Q34, V34, "interval")])["groups"][0]
    lab = {c: lab_check(v, samples) for c, v in (("t33", V33), ("t34", V34))}
    assert lab["t34"]["boundaries"] is False
    s = settle_interval(g, lab, SRC)
    assert "That matches 2.07 m (41327 p33). 41327 p34: 175.36 m isn't a sample boundary." in s["line"]


def test_the_lab_explains_a_row_whose_width_misses_its_depths():
    # 41327 Table 3, IL-22-20: 209.50 to 211.00 m is one sample, 1.50 m, at 3,260 ppm copper.
    row = {"hole": "IL-22-20", "from_m": "209.50", "to_m": "211.00", "width_m": "2.50",
           "grades": {"Cu (%)": "0.02", "Ni (%)": "0.001", "Au (ppb)": "13"}}
    g = group_intervals([claim("row", 41327, 33, "x", row, "interval")])["groups"][0]
    lab = {"row": lab_check(row, [sample("B1118002", "209.50", "211.00", "3260.0", "13.1", "15.0")])}
    n = lab_note(g, lab, SRC)
    assert n["line"] == ("The lab assayed 209.50 to 211.00 m (1.50 m) as one sample, B1118002: Cu 0.326%, Au 15.0 ppb. "
                         "41327 p33 gives 2.50 m, Cu 0.02% and Au 13 ppb.")


def test_no_settlement_when_the_lab_backs_neither_side_or_both():
    g = group_intervals([claim("table", 41800, 37, Q37_25, V37_25, "interval"),
                         claim("text", 41800, 10, Q10_25, V10_25, "interval")])["groups"][0]
    both_off = [s | {"grades": s["grades"] | {"Cu (ppm)": "50"}} for s in IL25]
    lab = {"table": lab_check(V37_25, both_off), "text": lab_check(V10_25, both_off)}
    assert settle_interval(g, lab, SRC) is None
    assert lab_check(V37_25, IL25[:3]) is None  # the samples don't reach the interval's end


# ---------------------------------------------------------------- round 2 Codex read of the new code

def test_unsampled_stretches_and_missing_results_are_not_a_lab_match():
    no_results = [{"sample": None, "from_m": "0.00", "to_m": "16.47", "width_m": "16.47", "grades": {}}]
    claimed = {"hole": "IL-23-025", "from_m": "0.00", "to_m": "16.47", "width_m": "16.47", "grades": {"Cu (%)": "99.999"}}
    assert lab_check(claimed, no_results) is None
    gap = [s for s in IL25 if s["sample"] != "C367537"]  # 0.69 m of the interval missing
    assert lab_check(V10_25, gap) is None


def test_opposite_bounds_never_agree():
    from rules import clash, grade_value
    assert clash(grade_value("Au (ppb)", "<10"), grade_value("Au (ppb)", ">10"))
    assert clash(grade_value("Au (ppb)", "<10"), {"lo": Decimal("0.000001"), "hi": Decimal("0.000001")})
    assert not clash(grade_value("Au (ppb)", "<10"), grade_value("Au (ppb)", "6"))


def test_a_total_backs_a_side_only_when_one_side_matches():
    table = {"aris": 41800, "page": 33, "caption": "Table 3: x", "rows": collar_table(P33_TEXT)[1]}
    assert settle_total([{"key": "1679"}, {"key": "1681"}], table) is None
