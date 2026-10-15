"""Text normalization shared by the quote checker and page search.

Order: map odd glyphs, unify quotes/dashes/degree marks (before NFKC, which
would turn some of them into combining marks), drop private-use glyphs, NFKC,
drop degree marks, drop form blanks, close up hyphens, collapse whitespace,
lowercase.

Every non-ASCII character in the corpus, and what happens to it, is logged in
data/normalization.json by agent/scan_chars.py.
"""
from __future__ import annotations

import re
import unicodedata

# Glyphs some of these PDFs emit in place of the real text. Each was found by
# agent/scan_chars.py and confirmed against the rendered page.
CHAR_MAP: dict[str, str] = {
    "\u019f": "ti",   # 36807: Calibri "ti" ligature, extracts as "LaƟtude"
    "\u01ab": "tti",  # 36807: Calibri "tti" ligature, extracts as "Seƫng" (Setting)
    "\uf0b0": "\u00b0",  # 36430, 38640: Symbol-font degree sign, "51 57' N"
    "\uf0b7": "\u2022",  # 40980: Symbol-font bullet
    "\u00e2\u02c6\u2019": "-",  # 38640 p57: UTF-8 minus sign read as cp1252
}

QUOTES = {
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'", "\u2032": "'", "\u00b4": "'", "`": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"', "\u2033": '"', "''": '"',
}
DASHES = {"\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2015": "-", "\u2212": "-"}
DEGREES = {"\u00ba": "\u00b0", "\u02da": "\u00b0", "\u2218": "\u00b0"}
SPACES = {"\u00a0": " ", "\u00ad": ""}

TABLES = (CHAR_MAP, QUOTES, DASHES, DEGREES, SPACES)
BREAK_HYPHEN = re.compile(r"(?<=\w)-\s+(?=\w)")
LETTER_HYPHEN = re.compile(r"(?<=[^\W\d_])-(?=[^\W\d_])")


PRIVATE_USE = re.compile("[\ue000-\uf8ff]")


def display_text(text: str) -> str:
    """Page text as the agent and the site see it: broken glyphs mapped, case and layout kept."""
    for table in (CHAR_MAP, SPACES, DEGREES):
        for src, dst in table.items():
            text = text.replace(src, dst)
    return unicodedata.normalize("NFKC", PRIVATE_USE.sub("", text))


def normalize(text: str) -> str:
    for table in TABLES:
        for src, dst in table.items():
            text = text.replace(src, dst)
    text = unicodedata.normalize("NFKC", PRIVATE_USE.sub("", text))
    # Degree marks are dropped: models often leave them out when they copy coordinates,
    # so "51°57'", "51° 57'" and "51 57'" all compare equal.
    text = text.replace("\u00b0", " ")
    # Form blanks: runs of underscores or 3+ hyphens.
    text = re.sub(r"_{2,}|-{3,}", " ", text)
    # A hyphen at a line break stays a hyphen: "IL-22-\n011" -> "IL-22-011".
    text = BREAK_HYPHEN.sub("-", text)
    # Hyphens between letters are dropped: "explo-ration", "exploration",
    # "copper-nickel" and "coppernickel" all compare equal. Digits are left
    # alone, so hole IDs like IL-22-011 and ranges like 175.36-177.53 keep theirs.
    text = LETTER_HYPHEN.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Minute and second marks: "57 '" (a filled form blank) and "57'" compare equal.
    text = re.sub(r"(?<=\d) (?=['\"])", "", text)
    return text.lower()
