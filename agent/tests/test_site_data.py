"""The two files the site draws from the PDFs: drill tables (build_drill.py) and where each quote sits (build_page_maps.py)."""
from build_page_maps import find_span, value_tokens
from build_drill import collar
from corpus import tokenize


def test_collar_row_reads_hole_position_and_depth():
    c = collar("IL-22-001 645575 5756817 1026 273 -45 228", 41327, 30, "2022")
    assert (c["hole"], c["easting"], c["northing"], c["elevation"], c["azimuth"], c["dip"], c["depth_m"]) == (
        "IL-22-001", "645575", "5756817", "1026", "273", "-45", "228")
    assert c["marked"] is False and c["year"] == 2022


def test_collar_row_without_elevation_reads_from_the_right():
    # 41327 p30 prints IL-22-005 with no elevation, and an asterisk on the hole
    c = collar("IL-22-005* 649070 5756000 180 -55 36.3", 41327, 30, "2022")
    assert (c["hole"], c["marked"], c["elevation"], c["azimuth"], c["dip"], c["depth_m"]) == (
        "IL-22-005", True, None, "180", "-55", "36.3")


def test_quote_found_as_an_exact_run_of_words():
    page = tokenize("Table 3: Significant Intervals IL-22-20 209.50 211.00 2.50 0.02 0.001 13 <10 <10 and more")
    quote = tokenize("IL-22-20 209.50 211.00 2.50 0.02")
    lo, hi = find_span(page, quote)
    assert page[lo:hi] == quote


def test_quote_with_an_odd_glyph_still_placed_in_order():
    # a text layer that draws the degree sign with a stray glyph splits a token the quote has whole
    page = tokenize("CLINTON MINING DIVISION Latitude 51 x57 N Longitude 120 54 W GPS 645500E")
    quote = tokenize("Latitude 51 57 N, Longitude 120 54 W")
    lo, hi = find_span(page, quote)
    assert page[lo] == "latitude" and page[hi - 1] == "w"


def test_quote_not_on_the_page_is_not_placed():
    assert find_span(tokenize("nothing about drilling here at all"), tokenize("5,001.30 m of diamond drilling")) is None


def test_interval_value_marks_hole_depths_and_grades():
    c = {"kind": "interval", "value": {"hole": "IL-22-20", "from_m": "209.50", "to_m": "211.00", "width_m": "2.50",
                                       "grades": {"Cu (%)": "0.02"}}}
    assert ["il-22-20"] in value_tokens(c) and ["0.02"] in value_tokens(c)
