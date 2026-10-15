"""Log every non-ASCII character in the corpus and what normalize() does with it.

Writes data/normalization.json. Run after extract_pages.py.
"""
from __future__ import annotations

import collections
import json
import re
import unicodedata

from corpus import DATA, REPORTS, pages
from textnorm import CHAR_MAP, DASHES, DEGREES, QUOTES, SPACES

# Characters seen on pages whose font has no usable text mapping. They are
# left alone: guessing a mapping could make a wrong quote pass.
LEFT_ALONE = {
    "Ϯ": "36430 p46 (appendix divider page): broken font encoding, not recoverable",
    "Ϭ": "36430 p46 (appendix divider page): broken font encoding, not recoverable",
    "ϭ": "36430 p46 (appendix divider page): broken font encoding, not recoverable",
    "ϲ": "36430 p46 (appendix divider page): broken font encoding, not recoverable",
    "Ç": "36430 p46 (appendix divider page): broken font encoding, not recoverable",
    "ó": "36430 p46 (appendix divider page): broken font encoding, not recoverable",
    "§": "OCR noise on scanned map pages in 36807",
    "£": "OCR noise on scanned map pages in 36807",
}


def action(ch: str) -> str:
    for name, table in (("odd glyph", CHAR_MAP), ("quote", QUOTES), ("dash", DASHES),
                        ("degree", DEGREES), ("space", SPACES)):
        if ch in table:
            return f"mapped ({name}) to {table[ch]!r}"
    for seq, dst in CHAR_MAP.items():
        if len(seq) > 1 and ch in seq:
            return f"mapped as part of the sequence {seq!r} to {dst!r}"
    if ch in LEFT_ALONE:
        return "left as is: " + LEFT_ALONE[ch]
    nfkc = unicodedata.normalize("NFKC", ch)
    if nfkc != ch:
        return f"NFKC to {nfkc!r}"
    return "kept (real character)"


def main() -> None:
    counts: collections.Counter = collections.Counter()
    where: dict[str, set] = collections.defaultdict(set)
    example: dict[str, str] = {}
    for aris in REPORTS:
        for pno, p in pages(aris).items():
            t = p["text"]
            for m in re.finditer(r"[^\x09\x0a\x0d\x20-\x7e]", t):
                ch = m.group()
                counts[ch] += 1
                where[ch].add(aris)
                example.setdefault(ch, f"{aris} p{pno}: " + t[max(0, m.start() - 20):m.end() + 20].replace("\n", " "))
    rows = [{
        "char": ch, "code": f"U+{ord(ch):04X}", "name": unicodedata.name(ch, "?"),
        "count": n, "reports": sorted(where[ch]), "example": example[ch], "action": action(ch),
    } for ch, n in counts.most_common()]
    multi = [{"from": k, "to": v, "why": "multi-character sequence"} for k, v in CHAR_MAP.items() if len(k) > 1]
    out = {"rules": [
        "Odd glyphs, quotes, dashes, degree marks and spaces are mapped first (table below)",
        "Unicode NFKC",
        "Runs of 2+ underscores or 3+ hyphens (form blanks) become a space",
        "A hyphen followed by a line break or spaces, between two letters or digits, is closed up (IL-22-\n011 becomes il-22-011)",
        "A hyphen between two letters is dropped (copper-nickel becomes coppernickel)",
        "Whitespace collapsed to one space",
        "Spaces before a degree, minute or second mark that follows a digit, and after a degree mark, are dropped",
        "Lowercase",
    ], "sequences": multi, "characters": rows}
    (DATA / "normalization.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    unhandled = [r for r in rows if r["action"] == "kept (real character)"]
    print(f"{len(rows)} distinct non-ASCII characters; kept as real characters: "
          + ", ".join(f"{r['code']} {r['name']}" for r in unhandled))


if __name__ == "__main__":
    main()
