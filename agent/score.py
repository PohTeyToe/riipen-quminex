"""Score eval answers against the gold. Pure functions; build_data.py calls them.

Verdicts come from code only. Each miss carries failure codes from this list,
shown in plain words on the Eval tab.
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
    "quote_too_long": "Quote over 600 characters",
    "quote_too_short": "Quote too short to check",
    "page_not_in_corpus": "Cited a page outside these reports",
}

SCORE_DEFS = {
    "citation_precision": "Cited quotes the checker confirmed on the cited page, out of every quote the agent cited "
                          "while answering, including ones it later fixed. A quote on a scanned page counts only "
                          "once it is confirmed against the page image.",
    "answer_accuracy": "Answerable questions whose answer has every expected value and every required caveat, out of 8.",
    "correct_refusals": "Unanswerable questions the agent refused, out of 4.",
    "false_refusals": "Answerable or conflict questions the agent refused anyway, out of 11.",
    "disagreements_flagged": "Conflict questions whose answer carries every stated value, out of 3.",
}


def squash(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize(s))


def alt_met(alt: str, hay: list[str]) -> bool:
    if re.search(r"[a-z]", alt, re.I):
        a = squash(alt)
        return any(a in squash(h) for h in hay)
    want = numbers(alt)
    return any(contains_seq(numbers(h), want) for h in hay)


def haystack(answer_text: str, claims: list[dict]) -> list[str]:
    hay = [answer_text or ""]
    for c in claims:
        hay += [c["quote"], str(c.get("value") or "")]
    return hay


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
    hay = haystack(answer or "", claims)
    items = [{"label": e["label"], "met": any(alt_met(a, hay) for a in e["any_of"])} for e in gold["expected"]]
    caveats = [{"label": c["label"],
                "met": any(all(squash(p) in squash(cl["quote"]) for p in c["all_of"]) for cl in claims)}
               for c in gold["required_caveats"]]
    unbacked = [] if refusal else unbacked_numbers(answer or "", claims)
    failures: list[str] = []
    if category == "unanswerable":
        passed = refusal
        if not refusal:
            failures.append("should_have_refused")
    elif refusal:
        passed = False
        failures.append("false_refusal")
    else:
        missing = [i for i in items if not i["met"]]
        missed_cav = [c for c in caveats if not c["met"]]
        if missing:
            failures.append("missed_disagreement" if category == "conflict" else "missing_value")
        if missed_cav:
            failures.append("missed_caveat")
        passed = not missing and not missed_cav
    if unbacked:
        failures.append("number_unbacked")
    return {"passed": passed, "refusal": refusal, "items": items, "caveats": caveats,
            "unbacked_numbers": unbacked, "failures": failures, "reason": reason(category, passed, refusal, items, caveats)}


def reason(category: str, passed: bool, refusal: bool, items: list[dict], caveats: list[dict]) -> str:
    if category == "unanswerable":
        return "Refused, and nothing in these reports answers it." if passed else \
            "Gave an answer, but these reports don't answer this question."
    if refusal:
        return "Refused, but the answer is in these reports."
    missing = [i["label"] for i in items if not i["met"]] + [c["label"] for c in caveats if not c["met"]]
    if not missing:
        return "Has every expected value" + (" and the required caveat." if caveats else ".")
    return "Missing: " + "; ".join(missing) + "."
