"""The summary check: numbers must be in what a sentence cites, and a disagreement can't be cited one-sided."""
from card import Card
from conftest import claim


def field_claim(cid, aris, page, quote, value, field):
    return claim(cid, aris, page, quote, value) | {"scope": "field", "field": field}


CLAIMS = [
    field_claim("t1", 41800, 33, "In 2023, a total of 1,680 m of diamond drilling was completed in three holes", "1,680",
                "drilling_2023.total_metres"),
    field_claim("t2", 41800, 9, "In the 2023 core drilling program, a total of 1,670 m of diamond drilling was completed",
                "1,670", "drilling_2023.total_metres"),
    field_claim("d1", 34595, 1, "MINING DIVISION: Clinton", "Clinton", "mining_division"),
]
FIELDS = {"fields": [
    {"id": "mining_division", "name": "Mining division", "definition": "", "state": "settled", "rule": "exact_text",
     "claims": ["d1"], "groups": [{"key": "clinton", "claims": ["d1"]}]},
    {"id": "drilling_2023", "name": "2023 drilling", "definition": "", "state": "disagree", "parts": [
        {"id": "drilling_2023.total_metres", "name": "Total metres", "state": "disagree", "rule": "number",
         "claims": ["t1", "t2"], "caveat_claims": [],
         "groups": [{"key": "1680", "claims": ["t1"]}, {"key": "1670", "claims": ["t2"]}]}]},
    {"id": "resource_estimate", "name": "Resource estimate", "definition": "", "state": "not_in_sources", "refusals": []},
]}
INDEX = {"count": 22, "operators": 8, "years": [2001, 2025], "spent_reported_total": 1234.5}


def card():
    return Card(FIELDS, CLAIMS, INDEX)


def test_a_backed_sentence_is_kept():
    r = card().check_sentence("The property is in the Clinton Mining Division.", ["d1"])
    assert r["accepted"]


def test_a_number_nothing_cited_contains_is_thrown_out():
    r = card().check_sentence("In 2023, 1,700 m were drilled.", ["t1", "t2"])
    assert r["failure"] == "number_unbacked" and "1700" in r["reason"]


def test_citing_one_side_of_a_disagreement_is_thrown_out():
    r = card().check_sentence("In 2023, 1,680 m of diamond drilling was completed.", ["t1"])
    assert r["failure"] == "one_side" and "t2" in r["reason"]
    assert card().check_sentence("In 2023 the reports give 1,680 m and 1,670 m.", ["t1", "t2"])["accepted"]


def test_unknown_ids_and_empty_citations_are_thrown_out():
    assert card().check_sentence("The property is in Clinton.", [])["failure"] == "cites_nothing"
    assert card().check_sentence("The property is in Clinton.", ["c-9999"])["failure"] == "unknown_id"


def test_code_lines_and_refusals_can_be_cited():
    k = card()
    assert "code:drilling_2023.total_metres" in k.citable
    r = k.check_sentence("The 2023 totals of 1,680 m and 1,670 m differ by 0.60%.",
                         ["t1", "t2", "code:drilling_2023.total_metres"])
    assert r["accepted"]
    assert k.check_sentence("No report gives a resource estimate.", ["refused:resource_estimate"])["accepted"]
    assert k.check_sentence("ARIS lists 22 reports from 8 operators.", ["index:aris"])["accepted"]
