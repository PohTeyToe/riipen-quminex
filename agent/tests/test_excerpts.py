"""What each claim ships of its page: at most 400 characters, and no page more than half shipped, counting
every copy of its words."""
from __future__ import annotations

import json

import pytest

import corpus
import shipped
from build_data import EXCERPT_MAX, PAGE_SHARE, flat, plan_excerpts
from textnorm import display_text

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


def plan(cs: list[dict], fixed: list[str] = ()) -> dict:
    """Plan every claim's excerpt, with the page share counted over all pages of the fixture."""
    by_page: dict = {}
    for c in cs:
        by_page.setdefault((99999, c["source"]["page"]), []).append(c)
    pages = {(a, n): display_text(corpus.page(a, n)["text"]) for a, n in corpus.all_pages()}
    return plan_excerpts(by_page, shipped.Matcher(pages), fixed)


def page_share(out: dict, page: int, fixed: list[str] = ()) -> float:
    pages = {(a, n): display_text(corpus.page(a, n)["text"]) for a, n in corpus.all_pages()}
    m = shipped.Matcher(pages)
    return shipped.audit(m, [x["text"] for x in out.values()] + list(fixed))["page_share"].get(f"99999 p{page}", 0)


def quote_of(first_line: int, n_lines: int) -> str:
    """A quote copied from page 1 as the agent copies it, line breaks and all."""
    return "".join(line + " \n" for line in LINES[first_line:first_line + n_lines]).rstrip(" \n")


def shown(plan: dict, c: dict) -> str:
    """The quote as the site ships it: the part shown when it was cut, else the agent's quote."""
    return plan[c["id"]].get("quote_shown", c["quote"])


def claim(cid, quote, value=None, page=1):
    return {"id": cid, "kind": "statement", "value": value, "quote": quote, "source": {"aris": 99999, "page": page}}


def test_a_long_quote_is_cut_to_the_part_around_its_value(page):
    c = claim("c-1", quote_of(10, 9), value=LINES[13])
    plan_ = plan([c])
    assert len(flat(c["quote"])) > EXCERPT_MAX
    assert plan_["c-1"].get("quote_cut")
    assert len(plan_["c-1"]["text"]) <= EXCERPT_MAX
    assert len(shown(plan_, c)) <= EXCERPT_MAX
    assert LINES[13] in shown(plan_, c)


def test_the_cap_counts_a_quote_as_written_line_breaks_and_all(page):
    # Under the cap once the page is flattened, over it as the agent wrote it (a line break after every word).
    k = max(k for k in range(1, 200) if len(" ".join(COLUMN[:k])) <= EXCERPT_MAX - 5)
    quote = "".join(w + " \n" for w in COLUMN[:k]).rstrip(" \n")
    assert len(flat(quote)) <= EXCERPT_MAX < len(quote)
    c = claim("c-1", quote, value=COLUMN[3], page=2)
    plan_ = plan([c])
    assert len(plan_["c-1"]["text"]) <= EXCERPT_MAX
    assert len(shown(plan_, c)) <= EXCERPT_MAX
    assert plan_["c-1"].get("quote_cut")


def test_a_short_quote_ships_whole_inside_its_context(page):
    q = quote_of(5, 2)
    c = claim("c-1", q, value=LINES[5])
    plan_ = plan([c])
    ex = plan_["c-1"]
    a, b = ex["highlight"]
    assert ex["text"][a:b] == flat(q).strip()
    assert "quote_cut" not in ex
    assert len(ex["text"]) <= EXCERPT_MAX


def test_a_page_never_ships_more_than_its_share_unless_the_quotes_alone_do(page):
    # 12 two-line quotes are 40% of the page; with their context they would be far over half.
    cs = [claim(f"c-{i}", quote_of(i * 5, 2), value=LINES[i * 5]) for i in range(12)]
    assert page_share({c["id"]: {"text": c["quote"]} for c in cs}, 1) < PAGE_SHARE
    assert page_share(plan(cs), 1) <= PAGE_SHARE
    # 19 of them are 63% on their own: every excerpt shrinks to its quote, and the page stays over.
    cs = [claim(f"c-{i}", quote_of(i * 3, 2), value=LINES[i * 3]) for i in range(19)]
    out = plan(cs)
    assert page_share(out, 1) == page_share({c["id"]: {"text": c["quote"]} for c in cs}, 1)


def test_the_share_counts_copies_of_the_page_shipped_from_anywhere(page):
    # The same claims, but the rest of the page already ships elsewhere (another report repeating it, a gold
    # quote): context has to go.
    cs = [claim(f"c-{i}", quote_of(i * 6, 1), value=LINES[i * 6]) for i in range(10)]
    alone = plan(cs)
    assert any(len(x["text"]) > len(flat(c["quote"])) for x, c in zip(alone.values(), cs))
    fixed = [quote_of(i * 6 + 2, 3) for i in range(10)]
    crowded = plan(cs, fixed)
    assert page_share(crowded, 1, fixed) <= PAGE_SHARE or all(
        x["text"] == flat(c["quote"]).strip() for x, c in zip(crowded.values(), cs))


def test_a_value_longer_than_the_cap_never_breaks_it(page):
    # A statement whose value is its whole quote, longer than the cap: the excerpt still ships at most EXCERPT_MAX.
    q = quote_of(10, 9)
    c = claim("c-1", q, value=q)
    plan_ = plan([c])
    assert len(flat(q)) > EXCERPT_MAX
    assert len(plan_["c-1"]["text"]) <= EXCERPT_MAX
    assert len(shown(plan_, c)) <= EXCERPT_MAX
