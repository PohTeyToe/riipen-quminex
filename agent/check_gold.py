"""Check the hand-written gold answers against the pages, before any agent run.

Every gold quote must pass the same checker the agent faces. For each
unanswerable question, a full-text search of its key terms is logged to
data/eval/search_log.json so a second reader can confirm nothing answers it.
"""
from __future__ import annotations

import json
import sys

import corpus
from checker import check_claim
from textnorm import normalize

EVAL = corpus.DATA / "eval"


def main() -> int:
    gold = json.loads((EVAL / "gold.json").read_text(encoding="utf-8"))
    bad = 0
    for q in gold["questions"]:
        for s in q["sources"]:
            if "aris" not in s:  # an outside source such as an ARIS detail page
                print(f"{q['id']} outside source: {s['external']}")
                continue
            r = check_claim("statement", None, s["aris"], s["page"], s["quote"])
            ok = r["accepted"]
            bad += not ok
            tag = "page image" if r["by"] == "page image" else "code"
            print(f"{q['id']} {s['aris']} p{s['page']}: {'ok' if ok else 'FAIL'} ({tag}) {'' if ok else r['reason']}")
    log = []
    for q in gold["questions"]:
        if not q.get("search_terms"):
            continue
        hits = []
        for term in q["search_terms"]:
            nt = normalize(term)
            for a, n in corpus.all_pages():
                t = corpus.normalized_page(a, n)
                i = t.find(nt)
                if i >= 0:
                    hits.append({"term": term, "aris": a, "page": n,
                                 "context": t[max(0, i - 120): i + len(nt) + 120]})
        log.append({"id": q["id"], "terms": q["search_terms"], "pages_hit": len(hits), "hits": hits})
        print(f"{q['id']}: {len(hits)} page hits for {q['search_terms']}")
    (EVAL / "search_log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
