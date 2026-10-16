"""How much report text the site ships, counting everything it ships.

The site bundles every JSON file that src/ imports, and any string in them can carry page text:
excerpts, quotes, values, notes. Code finds each run of at least MIN_RUN letters and digits that also
appears on a report page, on every page that has it: the Tech-X reports repeat whole passages, so
text shipped from one report also counts against the others. Shares are in letters and digits
(spaces and punctuation don't count), per page and per report.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from textnorm import normalize

ROOT = Path(__file__).resolve().parent.parent
MIN_RUN = 24   # letters and digits in a row; shorter runs are too common to count as copied text
STEP = 8       # page runs are indexed every STEP characters, so any copied run of MIN_RUN + STEP is found
# static imports (from '../../data/x.json') and the ones the site loads on demand (import('../../data/x.json'))
IMPORT_RE = re.compile(r"""(?:from\s+|import\(\s*)['"]((?:\.\./)+[^'"]+\.json)['"]""")
PAGE_SHARE = 0.5  # no page ships more than this share of its text across all its claims

Page = tuple[int, int]
Span = tuple[int, int]


def squash(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", normalize(s))


def union_len(spans: list[Span]) -> int:
    total, end = 0, -1
    for a, b in sorted(spans):
        if b > end:
            total += b - max(a, end)
            end = b
    return total


class Matcher:
    """Finds where a text's words sit on the report pages."""

    def __init__(self, pages: dict[Page, str]):
        self.sq = {k: squash(v) for k, v in pages.items()}
        self.chars = {k: len(v) for k, v in self.sq.items()}
        self.index: dict[str, list[tuple[Page, int]]] = defaultdict(list)
        for k, t in self.sq.items():
            for o in range(0, max(len(t) - MIN_RUN + 1, 0), STEP):
                self.index[t[o:o + MIN_RUN]].append((k, o))

    def spans(self, text: str) -> dict[Page, list[Span]]:
        """The page spans (in letters and digits) that text copies. Each character of text counts at most once
        per page, so a row that repeats down a page isn't counted at every repeat."""
        q = squash(text)
        found: dict[Page, list[Span]] = defaultdict(list)
        used: dict[Page, list[Span]] = defaultdict(list)
        for i in range(len(q) - MIN_RUN + 1):
            for k, o in self.index.get(q[i:i + MIN_RUN], ()):
                if any(a <= i < b for a, b in used[k]):
                    continue
                t = self.sq[k]
                a, b, qa, qb = o, o + MIN_RUN, i, i + MIN_RUN  # grow the match both ways
                while qa > 0 and a > 0 and q[qa - 1] == t[a - 1]:
                    qa, a = qa - 1, a - 1
                while qb < len(q) and b < len(t) and q[qb] == t[b]:
                    qb, b = qb + 1, b + 1
                found[k].append((a, b))
                used[k].append((qa, qb))
        return found


def imported_json() -> list[Path]:
    """Every JSON file a source file under src/ imports."""
    out = set()
    for f in (ROOT / "src").rglob("*.ts*"):
        for m in IMPORT_RE.finditer(f.read_text(encoding="utf-8")):
            out.add((f.parent / m.group(1)).resolve())
    return sorted(out)


def strings_in(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from strings_in(k)
            yield from strings_in(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings_in(v)


def site_strings(skip: tuple[str, ...] = ()) -> list[str]:
    """Every string in the JSON files the site imports, leaving out files whose name is in skip."""
    return [s for f in imported_json() if f.name not in skip
            for s in strings_in(json.loads(f.read_text(encoding="utf-8")))]


def audit(m: Matcher, texts: list[str], body: set[Page] | None = None) -> dict:
    """Per report and per page: the share of letters and digits that texts ship. A report's share counts only the
    pages in body (the report text the agent reads), so long appendix tables don't water it down."""
    covered: dict[Page, list[Span]] = defaultdict(list)
    for s in set(texts):
        for k, v in m.spans(s).items():
            covered[k] += v
    cov = {k: union_len(v) for k, v in covered.items()}
    by_report: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for k, n in m.chars.items():
        if body is not None and k not in body:
            continue
        by_report[k[0]][0] += cov.get(k, 0)
        by_report[k[0]][1] += n
    return {
        "report_share": {str(a): round(s / n, 3) if n else 0 for a, (s, n) in sorted(by_report.items())},
        "page_share": {f"{a} p{p}": round(cov[(a, p)] / m.chars[(a, p)], 2) for a, p in sorted(cov) if m.chars[(a, p)]},
    }


def write(m: Matcher, body: set[Page]) -> dict:
    """Count what the site ships against every page and write data/shipped.json."""
    files = imported_json()
    counts = audit(m, site_strings(), body=body)
    over = {k: v for k, v in counts["page_share"].items() if v > PAGE_SHARE}
    out = {
        "note": "Letters and digits of each report's pages that appear in a run of at least "
                f"{MIN_RUN} in any file the site imports, on every page that carries the same words. "
                "report_share counts the report text the agent reads; pages_over_half also covers the drill tables "
                f"code reads. A page over {PAGE_SHARE:.0%} is over with every excerpt on it at its shortest.",
        "files": [str(f.relative_to(ROOT)).replace("\\", "/") for f in files],
        "report_share": counts["report_share"],
        "pages_over_half": over,
    }
    (ROOT / "data" / "shipped.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8",
                                               newline="\n")
    return out


def main() -> None:
    """Recount after a change to what the site imports, without rebuilding the run's data."""
    import build_data
    import corpus
    from textnorm import display_text

    tables = build_data.load_tables()
    pages = {(a, n): display_text(corpus.page(a, n)["text"]) for a, n in corpus.all_pages()}
    pages |= {k: display_text(v) for k, v in tables["pages"].items() if k not in pages}
    out = write(Matcher(pages), body=set(corpus.all_pages()))
    print(f"{len(out['files'])} files; {out['report_share']}; {len(out['pages_over_half'])} pages over {PAGE_SHARE:.0%}")


if __name__ == "__main__":
    main()
