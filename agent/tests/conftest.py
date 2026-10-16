"""A tiny fixture corpus: short excerpts of real pages, so tests run without the PDFs.

Each excerpt is quoted from the named ARIS report and PDF page, with the
line breaks and odd glyphs the text layer actually has.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

AGENT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AGENT))

import corpus  # noqa: E402

PAGES = {
    34595: [
        {"page": 1, "scanned": False, "text": (
            "MINING DIVISION:  Clinton \nNTS / BCGS: 093N034 \n"
            "LATITUDE: _____51_____° __57________’ \n"
            "LONGITUDE: ___120_______° ____54______’ (at centre of work) \n"
            "UTM Zone:       NAD 83           EASTING: 645500                    NORTHING: 5757000 \n")},
    ],
    36430: [
        {"page": 1, "scanned": False, "text": (
            "CLINTON MINING DIVISION, BC. \nNTS: 092P096 \n"
            "Latitude 51 57' N, Longitude 120 54' W \n"
            "GPS 645500E, 5757000N (NAD 83) \n")},
    ],
    36807: [
        {"page": 1, "scanned": True, "text": (
            "MINING DIVISION: Clinton \nNTS/BCGS: 093N043 \n------------------\n- - ----------------\n"
            "LONGITUDE: 121 \no 48 \n'2 \n- --\nLATITUDE: \n51 \no 54 \n'9 \n---\n(at centre of work) \n")},
        {"page": 3, "scanned": False, "text": (
            "CLINTON MINING DIVISION, BC. \nNTS: 092P096 \nLaƟtude 51° 57' N, Longitude 120° 54' W \n"
            "GPS 645500E, 5757000N (NAD 83) \n")},
    ],
    41327: [
        {"page": 33, "scanned": False, "text": (
            "Table 3: Significant Intervals from the 2022 Drill Program \nHole \nFrom (m) \nTo (m) \nInterval \n(m) \n"
            "Cu (%) \nNi (%) \nAu (ppb) \nPt (ppb) \nPd (ppb) \n"
            "IL-22-001\n123.48 \n125.87\n2.39 \n0.30\n0.045\n10\n18\n24\n"
            "IL-22-006\n123.82 \n136.98\n13.16 \n0.18\n0.027\n10\n23\n<10\n"
            "including\n123.82 \n133.02\n9.20 \n0.21\n0.030\n<10\n29\n<10\n"
            "IL-22-011\n175.46 \n177.53\n2.07 \n0.30\n0.049\n10\n<10\n<10\n")},
        {"page": 34, "scanned": False, "text": (
            "IL-22-010 was drilled to 261 m and did not encounter any significant mineralization, while IL-22-\n"
            "011 intersected massive sulphide mineralization between 175.36 and 177.53 m. The \n"
            "mineralization was similar to IL-22-009, consisting of massive net-textured magnetite, rarely \n"
            "replaced by hematite, along with bands and veinlets of pyrite, pyrrhotite and trace chalcopyrite. \n"
            "This zone returned 0.30% copper and 0.049% nickel over 2.36 m. \n")},
    ],
    40980: [
        {"page": 17, "scanned": False, "text": (
            "diamond drill program for 694 metres in 1974 (Buskas, 1989). Less than 10% of the core was \n"
            "split and assayed; however, large amounts of magnetite were intersected. \n")},
    ],
    41800: [
        {"page": 10, "scanned": False, "text": (
            "Within the northwest zone, hole IL-23-025 predominantly intersected magnetite-bearing \n"
            "pyroxenite. No massive sulphide intervals were encountered. The strongest interval returned \n"
            "24.04 m of 1,002 ppm nickel, with 6 ppm copper, from 318.3 m to 342.3 m. Elevated nickel \n")},
        {"page": 37, "scanned": False, "text": (
            "acid digestion method. All samples from Iron Lake in 2023 were analyzed using an aqua regia \n"
            "digestion and therefore may be expected to be lower than actual values. All of the standards \n"
            "showed consistent nickel values and within expected ranges considering an aqua regia \ndigestion. \n"
            "Table 4: Significant Intervals from the 2023 Drill Program \n \nHole \nFrom \n(m) \n"
            "To (m) Interval (m) Cu (%) Ni (%) \nAu (ppb) \nPt \n(ppb) \nPd \n(ppb) \n"
            "IL-23-024 \n569.00 \n578.46 \n9.46 \n0.42 \n0.034 \n29 \n13 \n31 \n"
            "Including \n570.81 \n571.31 \n0.50 \n1.17 \n0.056 \n39 \n15 \n16 \n"
            "IL-23-25 \n16.47 \n750.00 \n733.53 \n0.002 \n0.030 \n5 \n29 \n10 \n"
            "Including \n318.25 \n342.29 \n24.04 \n0.002 \n0.100 \n7 \n21 \n<5 \n")},
        {"page": 38, "scanned": False, "text": (
            "In 2023, Tech-X completed a total of 1,680 m of diamond drilling in 3 holes. \n"
            "Hole IL-23-024 intersected a 9.46 m interval grading 0.42% copper and 341 ppm \n"
            "nickel, from 569 m to 578.46 m. \n")},
    ],
}


@pytest.fixture(autouse=True)
def fixture_corpus(tmp_path, monkeypatch):
    d = tmp_path / "pages"
    d.mkdir()
    for aris, pages in PAGES.items():
        (d / f"{aris}.json").write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(corpus, "PAGES_DIR", d)
    monkeypatch.setattr(corpus, "REPORTS", list(PAGES))
    corpus.pages.cache_clear()
    corpus.normalized_page.cache_clear()
    yield
    corpus.pages.cache_clear()
    corpus.normalized_page.cache_clear()


def claim(cid, aris, page, quote, value=None, kind="value"):
    return {"id": cid, "kind": kind, "value": value, "quote": quote, "source": {"aris": aris, "page": page}}
