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
    assert r["reason"] == "Missing from the answer: Text: 2.36 m."


def test_missing_caveat_counts_as_a_miss():
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni", False, [TABLE])
    assert not r["passed"] and r["failures"] == ["missed_caveat"]


def test_full_answer_with_caveat_passes():
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni; aqua regia may read low", False, [TABLE, CAVEAT])
    assert r["passed"] and r["failures"] == []


def test_unbacked_number_fails_the_question():
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni, about 12 m true width; aqua regia may read low",
                       False, [TABLE, CAVEAT])
    assert not r["passed"] and r["failures"] == ["number_unbacked"] and r["unbacked_numbers"] == ["12"]
    assert r["reason"] == "Numbers no cited quote contains: 12."


def test_expected_values_must_be_in_the_answer_not_only_in_the_quotes():
    # The cited quotes hold 9.46 and 0.034, but the answer doesn't say them.
    r = score_question("answerable", WITH_CAVEAT, "Not much here; aqua regia may read low.", False, [TABLE, CAVEAT])
    assert not r["passed"] and r["failures"] == ["missing_value"]


def test_wrong_numbers_in_the_answer_fail_even_with_good_quotes():
    r = score_question("answerable", WITH_CAVEAT, "The interval is 999 m wide at 99% copper.", False, [TABLE, CAVEAT])
    assert not r["passed"] and "number_unbacked" in r["failures"] and "missing_value" in r["failures"]


def test_no_answer_line_is_a_miss():
    r = score_question("answerable", WITH_CAVEAT, None, False, [TABLE, CAVEAT])
    assert not r["passed"] and r["failures"] == ["answer_missing"]
    assert r["reason"] == "The session ended without an answer line."


def test_a_caveat_must_be_named_in_the_answer_and_backed_by_a_quote():
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni", False, [TABLE, CAVEAT])
    assert r["caveats"][0]["met"] is False
    r = score_question("answerable", WITH_CAVEAT, "9.46 m at 0.034% Ni; aqua regia may read low", False, [TABLE])
    assert r["caveats"][0]["met"] is False
