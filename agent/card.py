"""The property card as the summary session sees it, and the check on each summary sentence.

The summary agent reads only what build_data.py put on the card: accepted claims, field states,
the sides of each disagreement and the code lines. It writes one sentence at a time and cites what
each sentence rests on. Code checks every sentence before it is kept:

1. It cites at least one thing, and every id it cites is on the card.
2. Every number in it is in a cited claim's value or quote, or in a cited code line.
3. If it cites one side of a disagreement, it cites every side.
4. "Not in these sources" can only be cited for a field the agent refused.

Code can't check the words between the numbers. Each sentence opens the claims it cites, so a
reader can.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache

import corpus
from rules import unbacked_numbers

MAX_SENTENCE = 400
QUOTE_SHOWN = 300


def jload(p):
    return json.loads(p.read_text(encoding="utf-8"))


def src(c: dict) -> str:
    return f"{c['source']['aris']} p{c['source']['page']}"


def value_text(v) -> str:
    if isinstance(v, dict):
        grades = ", ".join(f"{k} {g}" for k, g in (v.get("grades") or {}).items())
        return f"{v.get('hole')} {v.get('from_m')} to {v.get('to_m')} m, {v.get('width_m')} m, {grades}"
    return "" if v is None else str(v)


def code_lines(part: dict) -> list[str]:
    lines = []
    if part.get("code_line"):
        lines.append(part["code_line"])
    for g in part.get("groups") or []:
        for x in g.get("compared") or []:
            if not x["agree"]:
                lines.append(f"{g['hole']}: {x['line']}")
        for a in (g.get("arithmetic") or {}).values():
            if not a["ok"]:
                lines.append(f"{g['hole']}: {a['line']}")
    if part.get("rule") == "number" and len(part.get("groups") or []) > 1:
        keys = [float(g["key"]) for g in part["groups"]]
        lines.append(f"{' and '.join(g['key'] for g in part['groups'])} differ by "
                     f"{abs(keys[0] - keys[1]) / max(keys) * 100:.2f}%. The rule allows 0.1%.")
    return lines


def sides(name: str, part: dict) -> list[dict]:
    """Each disagreement in a field or part, as its sides."""
    if part.get("state") != "disagree":
        return []
    if part.get("rule") == "interval":
        return [{"name": f"{name}, {g['hole']}", "sides": [set(s["claims"]) for s in g["sides"]]}
                for g in part["groups"] if g.get("disagree")]
    return [{"name": name, "sides": [set(g["claims"]) for g in part["groups"]]}]


class Card:
    def __init__(self, fields: dict, claims: list[dict], index: dict):
        self.fields = fields["fields"]
        self.claims = {c["id"]: c for c in claims if c["scope"] == "field" or c["id"] in self._eval_ids(fields)}
        self.citable: dict[str, dict] = {}
        for c in self.claims.values():
            self.citable[c["id"]] = {"quote": c["quote"], "value": value_text(c["value"]), "what": src(c)}
        self.disagreements: list[dict] = []
        self.refused: set[str] = set()
        for f in self.fields:
            for part in f.get("parts") or [f]:
                lines = code_lines(part)
                if lines:
                    self.citable[f"code:{part['id']}"] = {"quote": " ".join(lines), "value": "", "what": "code line"}
                name = f["name"] if part is f else f"{f['name']}, {part['name'].lower()}"
                self.disagreements += sides(name, part)
            if f["state"] == "not_in_sources":
                self.refused.add(f["id"])
                self.citable[f"refused:{f['id']}"] = {"quote": "", "value": "", "what": "Not in these sources"}
        self.citable["index:aris"] = {
            "quote": (f"The ARIS index lists {index['count']} Iron Lake reports from {index['operators']} operators, "
                      f"{index['years'][0]} to {index['years'][1]}, with C${index['spent_reported_total']:,.2f} "
                      f"reported spend."),
            "value": "", "what": "ARIS index"}
        self.index = index

    @staticmethod
    def _eval_ids(fields: dict) -> set[str]:
        return {cid for f in fields["fields"] for cid in f.get("from_eval", [])}

    # ------------------------------------------------------------ what the agent reads

    def overview(self) -> dict:
        out = {"index": self.citable["index:aris"]["quote"], "fields": []}
        for f in self.fields:
            row = {"field": f["id"], "name": f["name"], "definition": f["definition"], "state": f["state"]}
            if f["state"] == "not_in_sources":
                row["cite"] = f"refused:{f['id']}"
                row["refusals"] = f.get("refusals", [])
            elif f.get("parts"):
                row["parts"] = [self._part(p) for p in f["parts"]]
            elif f["state"] == "quotes":
                row["claims"] = len(f.get("claims") or [])
                row["note"] = f"Quotes only. Call read_field('{f['id']}') to read them."
            else:
                row |= self._part(f)
            out["fields"].append(row)
        return out

    def _part(self, p: dict) -> dict:
        row = {"part": p["id"], "name": p["name"], "state": p["state"]}
        if f"code:{p['id']}" in self.citable:
            row["code_line"] = {"cite": f"code:{p['id']}", "text": self.citable[f"code:{p['id']}"]["quote"]}
        if p.get("rule") == "interval":
            row["intervals"] = [{"hole": g["hole"], "claims": [self._brief(c) for c in g["claims"]],
                                 **({"inside": g["inside"], "inside_word": g["inside_word"]} if g.get("inside") else {}),
                                 **({"disagree_on": g["disagree_on"], "sides": [x["claims"] for x in g["sides"]]}
                                    if g.get("disagree") else {})}
                                for g in p["groups"]]
        else:
            row["groups"] = [{"key": g.get("key"), "claims": [self._brief(c) for c in g["claims"]]} for g in p.get("groups") or []]
        if p.get("caveat_claims"):
            row["caveats"] = [self._brief(c) for c in p["caveat_claims"]]
        return row

    def _brief(self, cid: str) -> dict:
        c = self.claims[cid]
        out = {"id": cid, "source": src(c), "value": value_text(c["value"])}
        if c["kind"] in ("caveat", "statement"):
            q = re.sub(r"\s+", " ", c["quote"]).strip()
            out["quote"] = q if len(q) <= QUOTE_SHOWN else q[:QUOTE_SHOWN].rsplit(" ", 1)[0] + " ..."
        return out

    def field(self, field_id: str) -> dict:
        f = next((x for x in self.fields if x["id"] == field_id), None)
        if f is None:
            return {"error": f"No field {field_id}. Fields: " + ", ".join(x["id"] for x in self.fields)}
        ids = f.get("claims") or [cid for p in f.get("parts") or [] for cid in p["claims"]]
        return {"field": f["id"], "name": f["name"], "state": f["state"], "claims": [self._brief(c) for c in ids]}

    # ------------------------------------------------------------ the check

    def check_sentence(self, text: str, cite: list[str]) -> dict:
        ids = list(dict.fromkeys(cite or []))
        text = (text or "").strip()
        if not text:
            return {"accepted": False, "failure": "empty", "reason": "The sentence is empty."}
        if len(text) > MAX_SENTENCE:
            return {"accepted": False, "failure": "too_long", "reason": f"Keep a sentence under {MAX_SENTENCE} characters."}
        if not ids:
            return {"accepted": False, "failure": "cites_nothing",
                    "reason": "Cite the claims, code lines or refused fields this sentence rests on."}
        unknown = [i for i in ids if i not in self.citable]
        if unknown:
            return {"accepted": False, "failure": "unknown_id", "reason": "Not on the card: " + ", ".join(unknown)}
        unbacked = unbacked_numbers(text, [self.citable[i] for i in ids])
        if unbacked:
            return {"accepted": False, "failure": "number_unbacked",
                    "reason": "No cited claim or code line contains: " + ", ".join(unbacked)}
        for d in self.disagreements:
            hit = [s for s in d["sides"] if s & set(ids)]
            if hit and len(hit) < len(d["sides"]):
                missing = [sorted(s)[:3] for s in d["sides"] if not s & set(ids)]
                return {"accepted": False, "failure": "one_side",
                        "reason": f"The sources disagree on {d['name']}, and this cites only one side. Cite a claim "
                                  f"from every side, for example " + "; ".join(", ".join(m) for m in missing) + "."}
        return {"accepted": True, "failure": None, "reason": "Every number is in a cited claim or code line."}


@lru_cache(maxsize=1)
def load() -> Card:
    """The card from the last build: data/fields.json, data/index.json and the full quotes kept in data/private."""
    return Card(jload(corpus.DATA / "fields.json"), jload(corpus.PRIVATE / "card_claims.json")["claims"],
                jload(corpus.DATA / "index.json"))
