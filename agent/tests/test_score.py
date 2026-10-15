from conftest import claim
from score import answer_line, score_question

CONFLICT = {"expected": [{"label": "Table: 2.07 m", "any_of": ["2.07"]}, {"label": "Text: 2.36 m", "any_of": ["2.36"]}],
            "required_caveats": []}
WITH_CAVEAT = {"expected": [{"label": "Width", "any_of": ["9.46"]}, {"label": "Nickel", "any_of": ["0.034", "341"]}],
               "required_caveats": [{"label": "Aqua regia", "all_of": ["aqua regia", "lower than actual"]}]}
TABLE = claim("t", 41800, 37, "IL-23-024 \n569.00 \n578.46 \n9.46 \n0.42 \n0.034", "9.46")
CAVEAT = claim("c", 41800, 37, "All samples from Iron Lake in 2023 were analyzed using an aqua regia digestion and "
                               "therefore may be expected to be lower than actual values.", None, "caveat")


def test_answer_line_is_the_last_answer_prefix():
    assert answer_line("thinking\nANSWER: first\nmore\nANSWER: 9.46 m") == "9.46 m"
    assert answer_line("no prefix here") is None


def test_refusal_passes_an_unanswerable_question():
    r = score_question("unanswerable", {"expected": [], "required_caveats": []}, "Not in these sources", True, [])
    assert r["passed"] and r["refusal"] and r["failures"] == []


def test_answering_an_unanswerable_question_is_a_miss():
    r = score_question("unanswerable", {"expected": [], "required_caveats": []}, "9.46 m", False, [TABLE])
    assert not r["passed"] and r["failures"] == ["should_have_refused"]


def test_refusing_an_answerable_question_is_a_false_refusal():
    r = score_question("answerable", WITH_CAVEAT, "Not in these sources", True, [])
    assert not r["passed"] and r["failures"] == ["false_refusal"]


def test_conflict_answer_missing_one_value_is_a_miss():
    c = claim("a", 41327, 33, "IL-22-011\n175.46 \n177.53\n2.07 \n0.30\n0.049", "2.07")
    r = score_question("conflict", CONFLICT, "IL-22-011 is 2.07 m wide.", False, [c])
    assert not r["passed"]
    assert r["failures"] == ["missed_disagreement"]
    assert r["reason"] == "Missing: Text: 2.36 m."


def test_missing_caveat_counts_as_a_miss():
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni", False, [TABLE])
    assert not r["passed"] and r["failures"] == ["missed_caveat"]


def test_full_answer_with_caveat_passes():
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni; aqua regia may read low", False, [TABLE, CAVEAT])
    assert r["passed"] and r["failures"] == []


def test_unbacked_number_is_flagged():
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni, about 12 m true width", False, [TABLE, CAVEAT])
    assert "number_unbacked" in r["failures"] and r["unbacked_numbers"] == ["12"]
