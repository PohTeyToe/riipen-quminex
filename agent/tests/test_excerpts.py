"""What each claim ships of its page: at most 400 characters, and no page more than half shipped."""
from __future__ import annotations

import json

import pytest

import build_data
import corpus
from build_data import EXCERPT_MAX, PAGE_SHARE, flat, plan_excerpts

# A made-up page in the reports' layout: short lines ending " \n", so a quote copied from it carries line breaks.
WORDS = ("The ultramafic rocks host disseminated sulphide with copper and nickel values that vary across the "
         "complex and the drilling tested several conductive zones along the margin of the intrusion ").split()
LINES = [" ".join(WORDS[(i * 7) % len(WORDS):][:9] or WORDS[:9]) + f" line {i}" for i in range(60)]
TEXT = "".join(line + " \n" for line in LINES)
# A second page laid out one word per line, the way OCR'd tables and forms come out.
COLUMN = [f"{WORDS[i % len(WORDS)]}{i}" for i in range(200)]
TEXT2 = "".join(w + " \n" for w in COLUMN)


@pytest.fixture()
def page(tmp_path, monkeypatch):
    d = tmp_path / "one"
    d.mkdir()
    pages = [{"page": 1, "scanned": False, "text": TEXT}, {"page": 2, "scanned": False, "text": TEXT2}]
    (d / "99999.json").write_text(json.dumps(pages), encoding="utf-8")
    monkeypatch.setattr(corpus, "PAGES_DIR", d)
    monkeypatch.setattr(corpus, "REPORTS", [99999])
    corpus.pages.cache_clear()
    corpus.normalized_page.cache_clear()
    yield
    corpus.pages.cache_clear()
    corpus.normalized_page.cache_clear()


def quote_of(first_line: int, n_lines: int) -> str:
    """A quote copied from page 1 as the agent copies it, line breaks and all."""
    return "".join(line + " \n" for line in LINES[first_line:first_line + n_lines]).rstrip(" \n")


def shipped(plan: dict, c: dict) -> str:
    """The quote as the site ships it: the part shown when it was cut, else the agent's quote."""
    return plan[c["id"]].get("quote_shown", c["quote"])


def claim(cid, quote, value=None, page=1):
    return {"id": cid, "kind": "statement", "value": value, "quote": quote, "source": {"aris": 99999, "page": page}}


def test_a_long_quote_is_cut_to_the_part_around_its_value(page):
    c = claim("c-1", quote_of(10, 9), value=LINES[13])
    plan = plan_excerpts(99999, 1, [c])
    assert len(flat(c["quote"])) > EXCERPT_MAX
    assert plan["c-1"].get("quote_cut")
    assert len(plan["c-1"]["text"]) <= EXCERPT_MAX
    assert len(shipped(plan, c)) <= EXCERPT_MAX
    assert LINES[13] in shipped(plan, c)


def test_the_cap_counts_a_quote_as_written_line_breaks_and_all(page):
    # Under the cap once the page is flattened, over it as the agent wrote it (a line break after every word).
    k = max(k for k in range(1, 200) if len(" ".join(COLUMN[:k])) <= EXCERPT_MAX - 5)
    quote = "".join(w + " \n" for w in COLUMN[:k]).rstrip(" \n")
    assert len(flat(quote)) <= EXCERPT_MAX < len(quote)
    c = claim("c-1", quote, value=COLUMN[3], page=2)
    plan = plan_excerpts(99999, 2, [c])
    assert len(plan["c-1"]["text"]) <= EXCERPT_MAX
    assert len(shipped(plan, c)) <= EXCERPT_MAX
    assert plan["c-1"].get("quote_cut")


def test_a_short_quote_ships_whole_inside_its_context(page):
    q = quote_of(5, 2)
    c = claim("c-1", q, value=LINES[5])
    plan = plan_excerpts(99999, 1, [c])
    ex = plan["c-1"]
    a, b = ex["highlight"]
    assert ex["text"][a:b] == flat(q).strip()
    assert "quote_cut" not in ex
    assert len(ex["text"]) <= EXCERPT_MAX


def test_a_page_never_ships_more_than_its_share_unless_the_quotes_alone_do(page):
    cs = [claim(f"c-{i}", quote_of(i * 3, 2), value=LINES[i * 3]) for i in range(19)]
    plan = plan_excerpts(99999, 1, cs)
    share = plan.pop("_share")
    quotes_alone = build_data.union_len([build_data.locate(c["quote"], flat(TEXT)) for c in cs])
    assert share["shipped_chars"] <= max(PAGE_SHARE * share["page_chars"], quotes_alone)
