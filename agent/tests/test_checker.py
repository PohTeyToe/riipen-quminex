from checker import censored, check_claim
from conftest import claim
from rules import (arithmetic, attach_caveats, grade_pct, group_intervals, group_locations, group_map_sheets,
                   group_numbers, group_text, unbacked_numbers)
from textnorm import normalize

# ---------------------------------------------------------------- normalization


def test_calibri_ti_ligature():
    assert normalize("LaƟtude 51° 57' N") == "latitude 51 57' n"


def test_tt_ligature():
    assert normalize("Geological Seƫng") == "geological setting"


def test_symbol_font_degree_and_nbsp():
    assert normalize("Latitude 51 57' N") == "latitude 51 57' n"


def test_degree_lookalikes():
    for s in ("51º57'", "51˚57'", "51° 57’", "51 ° 57 '", "51 57'"):
        assert normalize(s) == "51 57'", s


def test_form_blanks_dropped():
    assert normalize("LATITUDE: _____51_____° __57________’") == "latitude: 51 57'"
    assert normalize("NAME ----------- here") == "name here"


def test_line_break_hyphen_in_hole_id_kept():
    assert normalize("while IL-22-\n011 intersected") == "while il-22-011 intersected"


def test_hyphens_between_letters_compare_equal():
    assert normalize("copper-\nnickel") == normalize("copper-nickel") == normalize("coppernickel")
    assert normalize("explo-\nration") == "exploration"


def test_private_use_glyph_the_model_cannot_see_is_ignored():
    # 36430 p1 draws its degree sign with a Symbol-font glyph (U+F0B0). The model copies it as nothing.
    page = "Latitude 51 57' N, Longitude 120 54' W"
    assert normalize(page) == normalize("Latitude 51 57' N, Longitude 120 54' W")


def test_quotes_and_dashes_unified():
    assert normalize("“IP” anomalies – north") == '"ip" anomalies - north'


def test_nfkc_ligature():
    assert normalize("Qualiﬁcations") == "qualifications"


# ---------------------------------------------------------------- quote and value checks

Q34 = ("IL-22-\n011 intersected massive sulphide mineralization between 175.36 and 177.53 m. The \n"
       "mineralization was similar to IL-22-009, consisting of massive net-textured magnetite, rarely \n"
       "replaced by hematite, along with bands and veinlets of pyrite, pyrrhotite and trace chalcopyrite. \n"
       "This zone returned 0.30% copper and 0.049% nickel over 2.36 m.")
V34 = {"hole": "IL-22-011", "from_m": "175.36", "to_m": "177.53", "width_m": "2.36",
       "grades": {"Cu (%)": "0.30", "Ni (%)": "0.049"}}
Q33 = "IL-22-011\n175.46 \n177.53\n2.07 \n0.30\n0.049"
V33 = {"hole": "IL-22-011", "from_m": "175.46", "to_m": "177.53", "width_m": "2.07",
       "grades": {"Cu (%)": "0.30", "Ni (%)": "0.049"}}


def test_quote_on_cited_page_passes():
    r = check_claim("interval", V34, 41327, 34, Q34)
    assert r["accepted"] and r["by"] == "code" and r["quote_on_page"] and r["value_in_quote"]


def test_wrong_page_is_found():
    r = check_claim("interval", V34, 41327, 33, Q34)
    assert not r["accepted"]
    assert r["failure"] == "wrong_page"
    assert r["found_on"] == [{"aris": 41327, "page": 34}]
    assert r["reason"] == "Quote is real, but it's on page 34, not page 33"


def test_quote_not_found_anywhere():
    r = check_claim("value", "2.20", 41327, 34, "This zone returned 0.30% copper over 2.20 m.")
    assert r["failure"] == "quote_not_found"


def test_value_not_in_quote_respects_number_boundaries():
    r = check_claim("value", "2.3", 41327, 34, "This zone returned 0.30% copper and 0.049% nickel over 2.36 m.")
    assert r["failure"] == "value_not_in_quote"


def test_value_parts_may_be_comma_separated():
    r = check_claim("value", "51° 57' N, 120° 54' W", 36807, 3, "LaƟtude 51° 57' N, Longitude 120° 54' W")
    assert r["accepted"]


def test_scanned_page_is_never_code_checked():
    r = check_claim("value", "093N043", 36807, 1, "NTS/BCGS: 093N043")
    assert r["accepted"] and r["scanned"] and r["by"] == "page image"


def test_also_in_lists_identical_quotes():
    r = check_claim("value", "092P096", 36807, 3, "NTS: 092P096")
    assert {"aris": 36430, "page": 1} in r["also_in"]


def test_censored_value_keeps_its_detection_limit_and_never_becomes_zero():
    assert censored("<10") == {"detection_limit": "10", "unit": None}
    assert grade_pct("Pt (ppb)", "<10") is None
    g = group_numbers([claim("a", 41327, 33, "x", "<10"), claim("b", 41327, 33, "y", "10")])
    assert g["unplaced"] == ["a"]
    assert all("a" not in grp["claims"] for grp in g["groups"])
    r = check_claim("interval", {"hole": "IL-22-011", "width_m": "2.07", "grades": {"Pt (ppb)": "<10"}},
                    41327, 33, "IL-22-011\n175.46 \n177.53\n2.07 \n0.30\n0.049\n10\n<10\n<10")
    assert r["accepted"]


# ---------------------------------------------------------------- disagreement rules

def test_location_sixty_two_km_case():
    claims = [
        claim("form", 36807, 1, "LONGITUDE: 121 \no 48 \n'2 \n- --\nLATITUDE: \n51 \no 54 \n'9",
              "LONGITUDE: 121 o 48 '2 LATITUDE: 51 o 54 '9"),
        claim("cover", 36807, 3, "LaƟtude 51° 57' N, Longitude 120° 54' W", "51° 57' N, 120° 54' W"),
        claim("gps", 36430, 1, "GPS 645500E, 5757000N (NAD 83)", "645500E, 5757000N"),
        claim("form13", 34595, 1, "LATITUDE: _____51_____° __57________’ \nLONGITUDE: ___120_______° ____54______’",
              None),
    ]
    g = group_locations(claims)
    sides = sorted(sorted(x["claims"]) for x in g["groups"])
    assert sides == [["cover", "form13", "gps"], ["form"]]
    assert 61.5 <= g["distance_km"] <= 62.5


def test_unreadable_coordinates_are_not_placed():
    g = group_locations([claim("typo", 34595, 8, "longitude l20°54'w (utm 645500e 575700n)", None)])
    assert g["unplaced"] == ["typo"]


def test_map_sheet_compares_map_area():
    g = group_map_sheets([claim("a", 34595, 1, "NTS / BCGS: 093N034", "093N034"),
                          claim("b", 36807, 3, "NTS: 092P096", "092P096"),
                          claim("c", 41800, 5, "NTS: 092P/15", "092P/15")])
    assert [(x["key"], x["claims"]) for x in g["groups"]] == [("092P", ["b", "c"]), ("093N", ["a"])]


def test_exact_text_ignores_label_words():
    g = group_text([claim("a", 34595, 1, "MINING DIVISION: Clinton", "Clinton"),
                    claim("b", 36807, 3, "CLINTON MINING DIVISION, BC.", "CLINTON MINING DIVISION")],
                   ["mining", "division", "bc"])
    assert len(g["groups"]) == 1


def test_numbers_within_tolerance_group_and_others_split():
    g = group_numbers([claim("a", 1, 1, "", "5,001.30 m"), claim("b", 1, 1, "", "5,001 m"),
                       claim("c", 1, 1, "", "1,670 m"), claim("d", 1, 1, "", "1,680 m")])
    assert sorted(sorted(x["claims"]) for x in g["groups"]) == [["a", "b"], ["c"], ["d"]]


def test_il_22_011_groups_and_arithmetic_flags_the_text():
    g = group_intervals([claim("table", 41327, 33, Q33, V33, "interval"),
                         claim("text", 41327, 34, Q34, V34, "interval")])
    assert len(g["groups"]) == 1
    grp = g["groups"][0]
    assert grp["disagree"] and grp["disagree_on"] == ["width"]
    assert sorted(s["claims"] for s in grp["sides"]) == [["table"], ["text"]]
    assert grp["arithmetic"]["table"]["ok"]
    assert grp["arithmetic"]["text"]["line"] == "177.53 − 175.36 = 2.17 m. The report states 2.36 m."


# 41800: Table 4 on p37 and the text on p10 give the same IL-23-25 interval with different copper.
V37_25 = {"hole": "IL-23-25", "from_m": "318.25", "to_m": "342.29", "width_m": "24.04",
          "grades": {"Cu (%)": "0.002", "Ni (%)": "0.100", "Au (ppb)": "7", "Pt (ppb)": "21", "Pd (ppb)": "<5"}}
V10_25 = {"hole": "IL-23-025", "from_m": "318.3", "to_m": "342.3", "width_m": "24.04",
          "grades": {"Ni (ppm)": "1,002", "Cu (ppm)": "6"}}
Q37_25 = ("IL-23-25 \n16.47 \n750.00 \n733.53 \n0.002 \n0.030 \n5 \n29 \n10 \n"
          "Including \n318.25 \n342.29 \n24.04 \n0.002 \n0.100 \n7 \n21 \n<5")
Q10_25 = ("hole IL-23-025 predominantly intersected magnetite-bearing \npyroxenite. No massive sulphide intervals "
          "were encountered. The strongest interval returned \n24.04 m of 1,002 ppm nickel, with 6 ppm copper, "
          "from 318.3 m to 342.3 m.")


def test_same_interval_with_different_copper_is_a_disagreement():
    g = group_intervals([claim("table", 41800, 37, Q37_25, V37_25, "interval"),
                         claim("text", 41800, 10, Q10_25, V10_25, "interval")])
    assert len(g["groups"]) == 1
    grp = g["groups"][0]
    assert grp["disagree_on"] == ["Cu"]
    cu = next(x for x in grp["compared"] if x["what"] == "Cu")
    assert cu["line"] == "Cu: 0.002% and 6 ppm (0.0006%) differ by 0.0014%. Rounding allows 0.0005%."
    ni = next(x for x in grp["compared"] if x["what"] == "Ni")
    assert ni["agree"]


def test_sub_interval_is_listed_under_its_parent():
    main = {"hole": "IL-22-006", "from_m": "123.82", "to_m": "136.98", "width_m": "13.16",
            "grades": {"Cu (%)": "0.18", "Ni (%)": "0.027"}}
    sub = {"hole": "IL-22-006", "from_m": "123.82", "to_m": "133.02", "width_m": "9.20",
           "grades": {"Cu (%)": "0.21", "Ni (%)": "0.030"}}
    g = group_intervals([claim("main", 41327, 33, "x", main, "interval"),
                         claim("sub", 41327, 33, "IL-22-006 ... including 123.82 133.02 9.20", sub, "interval")])
    assert len(g["groups"]) == 2 and not any(x["disagree"] for x in g["groups"])
    sub_g = next(x for x in g["groups"] if x["claims"] == ["sub"])
    assert sub_g["inside"] == "main" and sub_g["inside_word"] == "including"


def test_whole_hole_composite_is_parent_of_both_sources_of_its_including_interval():
    whole = {"hole": "IL-23-25", "from_m": "16.47", "to_m": "750.00", "width_m": "733.53",
             "grades": {"Cu (%)": "0.002", "Ni (%)": "0.030"}}
    g = group_intervals([claim("whole", 41800, 37, "IL-23-25 16.47 750.00", whole, "interval"),
                         claim("table", 41800, 37, Q37_25, V37_25, "interval"),
                         claim("text", 41800, 10, Q10_25, V10_25, "interval")])
    assert sorted(x["claims"] for x in g["groups"]) == [["table", "text"], ["whole"]]
    inner = next(x for x in g["groups"] if x["claims"] == ["table", "text"])
    assert inner["inside"] == "whole" and inner["row"] == "table"


# ---------------------------------------------------------------- grades sit with their element

def test_table_grades_must_sit_in_their_column():
    v = {"hole": "IL-23-024", "from_m": "569.00", "to_m": "578.46", "width_m": "9.46",
         "grades": {"Cu (%)": "0.42", "Ni (%)": "0.034", "Au (ppb)": "29"}}
    q = "IL-23-024 \n569.00 \n578.46 \n9.46 \n0.42 \n0.034 \n29 \n13 \n31"
    assert check_claim("interval", v, 41800, 37, q)["accepted"]
    swapped = v | {"grades": {"Cu (%)": "0.034", "Ni (%)": "0.42", "Au (ppb)": "29"}}
    r = check_claim("interval", swapped, 41800, 37, q)
    assert not r["accepted"] and r["failure"] == "grade_not_with_element"
    assert "the Cu column of this row reads 0.42" in r["reason"]
    wrong_unit = v | {"grades": {"Cu (ppm)": "0.42"}}
    assert check_claim("interval", wrong_unit, 41800, 37, q)["failure"] == "grade_not_with_element"


def test_a_number_never_matches_its_censored_form():
    q = "IL-22-011\n175.46 \n177.53\n2.07 \n0.30\n0.049\n10\n<10\n<10"
    ok = {"hole": "IL-22-011", "from_m": "175.46", "to_m": "177.53", "width_m": "2.07", "grades": {"Pt (ppb)": "<10"}}
    assert check_claim("interval", ok, 41327, 33, q)["accepted"]
    bad = ok | {"grades": {"Pt (ppb)": "10"}}
    r = check_claim("interval", bad, 41327, 33, q)
    assert not r["accepted"] and "the Pt column of this row reads <10" in r["reason"]
    row = "including\n123.82 \n133.02\n9.20 \n0.21\n0.030\n<10\n29\n<10"
    assert check_claim("value", "29", 41327, 33, row)["accepted"]
    assert check_claim("value", "10", 41327, 33, row)["failure"] == "value_not_in_quote"


def test_sentence_grades_must_sit_next_to_their_element():
    assert check_claim("interval", V10_25, 41800, 10, Q10_25)["accepted"]
    swapped = V10_25 | {"grades": {"Ni (ppm)": "6", "Cu (ppm)": "1,002"}}
    r = check_claim("interval", swapped, 41800, 10, Q10_25)
    assert not r["accepted"] and r["failure"] == "grade_not_with_element"
    assert check_claim("interval", V34, 41327, 34, Q34)["accepted"]


def test_ppm_and_percent_grades_group_at_stated_precision():
    table = {"hole": "IL-23-024", "from_m": "569.00", "to_m": "578.46", "width_m": "9.46",
             "grades": {"Cu (%)": "0.42", "Ni (%)": "0.034"}}
    text = {"hole": "IL-23-024", "from_m": "569 m", "to_m": "578.46 m", "width_m": "9.46 m",
            "grades": {"copper": "0.42%", "nickel": "341 ppm"}}
    g = group_intervals([claim("t", 41800, 37, "x", table, "interval"), claim("s", 41800, 38, "y", text, "interval")])
    assert len(g["groups"]) == 1 and not g["groups"][0]["disagree"]


def test_width_in_centimetres():
    a = arithmetic({"from_m": "216.04", "to_m": "216.51", "width_m": "47 cm"})
    assert a["ok"]


def test_caveat_attaches_to_same_report_only():
    cav = claim("cav", 41800, 37, "All samples from Iron Lake in 2023 were analyzed using an aqua regia digestion "
                                  "and therefore may be expected to be lower than actual values.", None, "caveat")
    v23 = claim("i23", 41800, 37, "x", {"hole": "IL-23-024", "grades": {"Cu (%)": "0.42", "Ni (%)": "0.034"}},
                "interval")
    v22 = claim("i22", 41327, 33, "y", V33, "interval")
    att = attach_caveats([cav, v23, v22])
    assert att == {"i23": ["cav"]}


def test_caveat_naming_an_element_attaches_only_to_that_element():
    cav = claim("cav", 41800, 37, "Nickel values were on average lower than the consensus value.", None, "caveat")
    ni = claim("ni", 41800, 37, "x", {"hole": "IL-23-024", "grades": {"Ni (%)": "0.034"}}, "interval")
    au = claim("au", 41800, 37, "y", {"hole": "IL-23-024", "grades": {"Au (ppb)": "29"}}, "interval")
    assert attach_caveats([cav, ni, au]) == {"ni": ["cav"]}


def test_answer_numbers_must_be_backed():
    c = [claim("a", 41327, 34, "This zone returned 0.30% copper and 0.049% nickel over 2.36 m.", "2.36 m")]
    assert unbacked_numbers("IL-22-011 returned 2.36 m (41327 p34).", c) == ["22", "11"]
    assert unbacked_numbers("2.36 m at 0.30% Cu", c) == []
    assert unbacked_numbers("2.36 m, or 2.17 m by subtraction", c) == ["2.17"]


def test_same_grades_at_different_depths_are_different_intervals():
    # 41327 Table 3, IL-22-015: two "and" rows both at 0.12% Cu, 0.003% Ni.
    a = {"hole": "IL-22-015", "from_m": "74.88", "to_m": "75.52", "width_m": "0.64",
         "grades": {"Cu (%)": "0.12", "Ni (%)": "0.003"}}
    b = {"hole": "IL-22-015", "from_m": "111.00", "to_m": "119.00", "width_m": "8.00",
         "grades": {"Cu (%)": "0.12", "Ni (%)": "0.003"}}
    g = group_intervals([claim("a", 41327, 33, "x", a, "interval"), claim("b", 41327, 33, "y", b, "interval")])
    assert len(g["groups"]) == 2 and not any(x["disagree"] for x in g["groups"])


def test_arithmetic_allows_for_rounded_depths_but_not_real_gaps():
    # 41800 p10 rounds 318.25-342.29 to 318.3-342.3 and keeps 24.04 m: rounding, not a disagreement.
    assert arithmetic({"from_m": "318.3", "to_m": "342.3", "width_m": "24.04"})["ok"]
    # 41327 Table 3 row IL-22-20: 209.50 to 211.00 is 1.50 m, the row says 2.50.
    bad = arithmetic({"from_m": "209.50", "to_m": "211.00", "width_m": "2.50"})
    assert not bad["ok"] and bad["line"] == "211.00 − 209.50 = 1.50 m. The report states 2.50 m."


def test_table_and_page_pointers_are_not_values():
    c = [claim("a", 41327, 34, "This zone returned 0.30% copper and 0.049% nickel over 2.36 m.", "2.36 m")]
    assert unbacked_numbers("Table 3 on page 33 and the text on p34 give 2.36 m.", c) == []


def test_map_area_ignores_units_and_ocr_degrees():
    from rules import map_areas
    assert map_areas("NTS / BCGS: 093N034") == ["093N"]
    assert map_areas("BCGS 092P.086, 087, 096, 097") == ["092P"]
    assert map_areas("NTS: 92P/15W") == ["092P"]
    assert map_areas("a total of 5,001.30 m of diamond drilling") == []
    assert map_areas("LONGITUDE: 121 o 48 '2") == []


def test_half_unit_scales_centimetres():
    from decimal import Decimal
    from rules import half_unit
    assert half_unit("318.3") == Decimal("0.05")
    assert half_unit("47 cm") == Decimal("0.005")
