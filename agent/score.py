"""Score eval answers against the gold. Pure functions; build_data.py calls them.

Verdicts come from code only. An expected value counts only when the answer
line itself states it; a quote the agent cited but didn't use doesn't count.
A number in the answer that no cited quote contains fails the question. Each
miss carries failure codes from this list, shown in plain words on the Eval tab.
"""
from __future__ import annotations

import re

from checker import contains_seq, numbers
from rules import unbacked_numbers
from textnorm import normalize

FAILURES = {
    "quote_not_found": "Quote not found anywhere",
    "wrong_page": "Real quote, wrong page",
    "value_not_in_quote": "Value not in the quote",
    "number_unbacked": "Number not backed by a claim",
    "false_refusal": "Refused when the answer was there",
    "should_have_refused": "Answered when it should have refused",
    "missed_caveat": "Missed a required caveat",
    "missed_disagreement": "Missed a disagreement",
    "missing_value": "Answer missed an expected value",
    "answer_missing": "No answer line",
    "grade_not_with_element": "Grade not with its element",
    "quote_too_long": "Quote over 600 characters",
    "quote_too_short": "Quote too short to check",
    "page_not_in_corpus": "Cited a page outside these reports",
}

SCORE_DEFS = {
    "citation_precision": "Cited quotes the checker confirmed on the cited page, out of every quote the agent cited "
                          "while answering, including ones it later fixed. A quote on a scanned page counts only "
                          "once it is confirmed against the page image.",
    "answer_accuracy": "Answerable questions whose answer line states every expected value and every required caveat, "
                       "with no number that its cited quotes don't contain, out of 8.",
    "correct_refusals": "Unanswerable questions the agent refused, out of 4.",
    "false_refusals": "Answerable or conflict questions the agent refused anyway, out of 11.",
    "disagreements_flagged": "Conflict questions whose answer line states every side's value, with no number that its "
                             "cited quotes don't contain, out of 3.",
}


def squash(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize(s))


def alt_met(alt: str, answer: str) -> bool:
    """An expected value is met only by the answer line itself, never by a quote the answer didn't use."""
    if re.search(r"[a-z]", alt, re.I):
        return squash(alt) in squash(answer)
    return contains_seq(numbers(answer), numbers(alt))


def caveat_met(cav: dict, answer: str, claims: list[dict]) -> bool:
    """The answer names the caveat (its first phrase) and a cited quote states it in full."""
    named = squash(cav["all_of"][0]) in squash(answer)
    backed = any(all(squash(p) in squash(c["quote"]) for p in cav["all_of"]) for c in claims)
    return named and backed


def answer_line(final_text: str | None) -> str | None:
    if not final_text:
        return None
    lines = [ln.strip() for ln in final_text.splitlines() if ln.strip().upper().startswith("ANSWER:")]
    return lines[-1][len("ANSWER:"):].strip() if lines else None


def is_refusal(answer: str | None, refused: bool, claims: list[dict]) -> bool:
    if answer and normalize(answer).startswith("not in these sources"):
        return True
    return refused and not claims


def score_question(category: str, gold: dict, answer: str | None, refused: bool, claims: list[dict]) -> dict:
    """claims: this session's accepted claims. Returns verdict, failure codes and per-item detail."""
    refusal = is_refusal(answer, refused, claims)
    text = answer or ""
    items = [{"label": e["label"], "met": any(alt_met(a, text) for a in e["any_of"])} for e in gold["expected"]]
    caveats = [{"label": c["label"], "met": caveat_met(c, text, claims)} for c in gold["required_caveats"]]
    unbacked = [] if refusal else unbacked_numbers(text, claims)
    failures: list[str] = []
    if category == "unanswerable":
        passed = refusal
        if not refusal:
            failures.append("should_have_refused")
    elif refusal:
        passed = False
        failures.append("false_refusal")
    elif answer is None:
        passed = False
        failures.append("answer_missing")
    else:
        missing = [i for i in items if not i["met"]]
        missed_cav = [c for c in caveats if not c["met"]]
        if missing:
            failures.append("missed_disagreement" if category == "conflict" else "missing_value")
        if missed_cav:
            failures.append("missed_caveat")
        passed = not missing and not missed_cav and not unbacked
    if unbacked:
        failures.append("number_unbacked")
    return {"passed": passed, "refusal": refusal, "items": items, "caveats": caveats, "unbacked_numbers": unbacked,
            "failures": failures, "reason": reason(category, passed, refusal, answer, items, caveats, unbacked)}


def reason(category: str, passed: bool, refusal: bool, answer: str | None, items: list[dict], caveats: list[dict],
           unbacked: list[str]) -> str:
    if category == "unanswerable":
        return "Refused, and nothing in these reports answers it." if passed else \
            "Gave an answer, but these reports don't answer this question."
    if refusal:
        return "Refused, but the answer is in these reports."
    if answer is None:
        return "The session ended without an answer line."
    missing = [i["label"] for i in items if not i["met"]] + [c["label"] for c in caveats if not c["met"]]
    bits = []
    if missing:
        bits.append("Missing from the answer: " + "; ".join(missing) + ".")
    if unbacked:
        bits.append("Numbers no cited quote contains: " + ", ".join(unbacked) + ".")
    if not bits:
        return "The answer states every expected value" + (" and the required caveat." if caveats else ".")
    return " ".join(bits)
