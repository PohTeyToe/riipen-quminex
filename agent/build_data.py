"""Turn one agent run into the JSON the site imports.

Reads data/private/ (index dump, detail pages, page text, run logs) and the
hand-made inputs (eval questions and gold, image checks), and writes data/*.json.
Nothing here edits agent output: claims are the logged propose_claim calls,
checked by code; states and groups come from rules.py; scores from score.py.

Usage: python agent/build_data.py <run_id>
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict

import card
import corpus
import rules
from checker import censored, check_claim, to_decimal
from runner import PROMPTS
from score import FAILURES, SCORE_DEFS, alt_met, answer_line, score_question, squash
from textnorm import display_text, normalize

DATA = corpus.DATA
PRIVATE = corpus.PRIVATE
EXCERPT_MAX = 400   # characters of page text shipped per claim, quote included
PAGE_SHARE = 0.5    # no page ships more than this share of its text across all its claims
CORE_PAD = 60       # when a page is over its share, a text claim keeps its value and this much either side


def jload(p):
    return json.loads(p.read_text(encoding="utf-8"))


def jdump(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def size_label(n: int) -> str:
    return f"PDF, {round(n / 1_000_000)} MB"


# ---------------------------------------------------------------- index and corpus

def build_index() -> dict:
    wfs = jload(PRIVATE / "raw" / "wfs.json")
    detail = jload(PRIVATE / "raw" / "detail.json")
    in_corpus = {r["aris"] for r in corpus.CORPUS}
    recs = []
    for f in sorted(wfs["features"], key=lambda f: (f["properties"]["REPORT_YEAR"], f["properties"]["ARIS_NUMBER"])):
        p = f["properties"]
        n = p["ARIS_NUMBER"]
        d = detail[str(n)]
        has_file = bool(d["files"])
        recs.append({
            "aris": n,
            "report_year": p["REPORT_YEAR"],
            "operator": p["OPERATOR_NAMES"],
            "title": p["ASSESSMENT_REPORT_TITLE"],
            "author": p["AUTHOR_NAMES"],
            "general_work_types": p["GENERAL_WORK_TYPES"],
            "specific_work_types": p["SPECIFIC_WORK_TYPES"],
            "spent_reported": p["MERGE_SPENT_REPORTED"],
            "spent_label": "reported spend, ARIS index",
            "lat": p["LATITUDE_DECIMAL_NAD83"], "lon": p["LONGITUDE_DECIMAL_NAD83"],
            "nts": p["NTS_MAPSHEETS"], "bcgs": p["BCGS_MAPSHEETS"],
            "pages": d["pages"],
            "off_confidential": d["off_confidential"],
            "status": "corpus" if n in in_corpus else ("not_in_corpus" if has_file else "listed_no_file"),
            "status_label": "In the corpus" if n in in_corpus else
                            ("Not in the corpus" if has_file else "Listed on ARIS, no file posted yet"),
            "detail_url": d["url"],
            "pdf_url": f"https://apps.nrs.gov.bc.ca/pub/aris/Report/{n}.pdf/" if has_file else None,
        })
    ops = {r["operator"] for r in recs}
    return {
        "source": "BC ARIS index (WFS layer WHSE_MINERAL_TENURE.ARIS_MINERAL_REPORTS), PROPERTY_NAME like 'IRON LAKE'",
        "retrieved": jload(PRIVATE / "raw" / "fetch_log.json")["retrieved"],
        "count": len(recs),
        "operators": len(ops),
        "years": [min(r["report_year"] for r in recs), max(r["report_year"] for r in recs)],
        "spent_reported_total": round(sum(r["spent_reported"] or 0 for r in recs), 2),
        "pages_posted_total": sum(r["pages"] or 0 for r in recs),
        "records": recs,
    }


def build_corpus(index: dict) -> dict:
    log = jload(PRIVATE / "raw" / "fetch_log.json")
    by = {r["aris"]: r for r in index["records"]}
    reps = []
    for c in corpus.CORPUS:
        n = c["aris"]
        r = by[n]
        pdf = log["pdf"][str(n)]
        pages = corpus.pages(n)
        reps.append({
            "aris": n, "title": r["title"], "report_year": r["report_year"], "operator": r["operator"],
            "author": r["author"], "pages_total": r["pages"],
            "pages_used": [c["first_page"], c["last_page"]], "pages_used_count": len(pages),
            "scanned_pages": sorted(p for p, v in pages.items() if v["scanned"]),
            "pdf_url": pdf["url"], "pdf_bytes": pdf["bytes"], "pdf_size_label": size_label(pdf["bytes"]),
            "pdf_sha256": pdf["sha256"], "detail_url": r["detail_url"],
            "page_link": pdf["url"] + "#page={page}",
        })
    return {"reports": reps, "pages_used_total": sum(r["pages_used_count"] for r in reps),
            "page_numbers": "PDF page numbers (the page in the PDF file), not the numbers printed on the pages."}


# ---------------------------------------------------------------- run logs

def load_run(run_dir):
    sessions = {}
    for meta_p in sorted(run_dir.glob("*.meta.json")):
        meta = jload(meta_p)
        s = meta["session"]
        calls = [json.loads(ln) for ln in (run_dir / f"{s}.tools.jsonl").read_text(encoding="utf-8").splitlines() if ln.strip()]
        events = [json.loads(ln) for ln in (run_dir / f"{s}.stream.jsonl").read_text(encoding="utf-8").splitlines()
                  if ln.strip().startswith("{")]
        meta["model_turns"] = len({e["message"]["id"] for e in events if e.get("type") == "assistant"})
        sessions[s] = {"meta": meta, "calls": calls}
    return sessions


def locate(quote: str, text: str) -> tuple[int, int] | None:
    chars = squash(quote)
    if not chars:
        return None
    pat = r"[\W_]*".join(re.escape(ch) for ch in chars)
    m = re.search(pat, text, re.I)
    return (m.start(), m.end()) if m else None


def flat(x: str) -> str:
    return re.sub(r"\s+", " ", x)


def snap(text: str, a: int, b: int, lo: int, hi: int) -> tuple[int, int]:
    """Move a and b outward to whole words, staying inside lo..hi."""
    a, b = max(a, lo), min(b, hi)
    if a > lo and not text[a - 1].isspace():
        j = text.find(" ", a, b)
        a = j + 1 if j >= 0 else a
    if b < hi and not text[b].isspace():
        j = text.rfind(" ", a, b)
        b = j if j > a else b
    return a, b


def window(text: str, core: tuple[int, int], size: int, lo: int, hi: int) -> tuple[int, int]:
    """About size characters of text[lo:hi], centred on core, cut to whole words."""
    cs, ce = core
    pad = max(size - (ce - cs), 0)
    a = max(lo, cs - pad // 2)
    b = min(hi, a + max(size, ce - cs))
    a = max(lo, b - max(size, ce - cs))
    return snap(text, a, b, lo, hi)


def union_len(spans: list[tuple[int, int]]) -> int:
    total, end = 0, -1
    for a, b in sorted(spans):
        if b > end:
            total += b - max(a, end)
            end = b
    return total


def plan_excerpts(aris: int, page: int, claims: list[dict]) -> dict[str, dict]:
    """What each claim on one page ships: at most EXCERPT_MAX characters, the quote first, then a little
    page context. If the page's claims together would ship more than PAGE_SHARE of its text, context
    goes first, then long text quotes shrink to their value and CORE_PAD characters either side."""
    text = flat(display_text(corpus.page(aris, page)["text"]))
    plans = {}
    for c in claims:
        q = locate(c["quote"], text)
        if not q:
            continue
        core = None
        if isinstance(c.get("value"), str) and c["value"]:
            v = locate(c["value"], text[q[0]:q[1]])
            if v:
                core = (q[0] + v[0], q[0] + v[1])
        # A quote that ships whole ships as the agent wrote it, line breaks and all, so the cap counts
        # that length, not only the quote's span in the flattened page text.
        limit = EXCERPT_MAX - max(0, len(c["quote"]) - (q[1] - q[0]))
        if core is None:  # an interval's own row ends its quote; anything else starts it
            core = ((max(q[0], q[1] - limit), q[1]) if c["kind"] == "interval"
                    else (q[0], min(q[1], q[0] + limit)))
        bare = q if q[1] - q[0] <= limit else window(text, core, limit, *q)
        ctx = bare
        if bare == q and q[1] - q[0] < EXCERPT_MAX:
            ctx = window(text, q, EXCERPT_MAX, 0, len(text))
        plans[c["id"]] = {"claim": c, "quote": q, "core": core, "bare": bare, "shown": ctx}
    budget = PAGE_SHARE * len(text)
    if union_len([x["shown"] for x in plans.values()]) > budget:
        for x in plans.values():
            x["shown"] = x["bare"]
        for x in sorted(plans.values(), key=lambda x: x["bare"][0] - x["bare"][1]):
            if union_len([y["shown"] for y in plans.values()]) <= budget:
                break
            if x["claim"]["kind"] == "statement" and x["core"][1] - x["core"][0] < x["quote"][1] - x["quote"][0]:
                x["shown"] = window(text, x["core"], x["core"][1] - x["core"][0] + 2 * CORE_PAD, *x["quote"])
    out = {}
    for cid, x in plans.items():
        (a, b), (qs, qe) = x["shown"], x["quote"]
        hs, he = max(qs, a), min(qe, b)
        cut = hs > qs or he < qe
        out[cid] = {"text": text[a:b], "highlight": [hs - a, he - a],
                    **({"quote_cut": True, "quote_chars": len(flat(x["claim"]["quote"]).strip()),
                        "quote_shown": text[hs:he]} if cut else {})}
    out["_share"] = {"page_chars": len(text), "shipped_chars": union_len([x["shown"] for x in plans.values()])}
    return out


# ---------------------------------------------------------------- claims

def field_index():
    fields = jload(PROMPTS / "fields.json")
    ids = {}
    for f in fields:
        ids[f["id"]] = f
        for p in f.get("parts", []):
            ids[p["id"]] = f
    return fields, ids


def route_field(session: str, proposed: str, kind: str, fields_by_id: dict) -> str:
    """Keep the agent's field id when it names a real field or part. Otherwise use the session's
    field, and for a field with parts, the part whose kind matches."""
    if not session.startswith("field-"):
        return "answer"
    if proposed in fields_by_id:
        f = fields_by_id[proposed]
        if not (f.get("parts") and proposed == f["id"]):
            return proposed
    f = fields_by_id[session[len("field-"):]]
    for p in f.get("parts", []):
        if p["kind"] == kind:
            return p["id"]
    return f["id"]


def value_norm(kind, value):
    if kind != "value" or value is None or censored(value):
        return None
    d = to_decimal(value)
    return float(d) if d is not None and re.fullmatch(r"[\d,.]+\s*[a-zA-Z%/]*", str(value).strip()) else None


def similar(a: dict, b: dict) -> bool:
    if normalize(str(a["args"].get("value"))) == normalize(str(b["args"].get("value"))) and a["args"].get("value"):
        return True
    ta, tb = set(normalize(a["args"]["quote"] or "").split()), set(normalize(b["args"]["quote"] or "").split())
    return bool(ta and tb) and len(ta & tb) / len(ta | tb) >= 0.5


def summarize_call(c: dict, claim_ids: dict) -> dict:
    t, a, r = c["tool"], c["args"], c["result"]
    if t == "search":
        hits = r.get("hits", [])
        where = ", ".join(f"{h['report']} p{h['page']}" for h in hits[:8])
        return {"tool": "search", "query": a["query"], "report": a.get("report"),
                "result": f"{len(hits)} hits" + (f": {where}" if hits else "")}
    if t == "open_page":
        if "error" in r:
            return {"tool": "open_page", "report": a["report"], "page": a["page"], "result": r["error"]}
        return {"tool": "open_page", "report": a["report"], "page": a["page"],
                "result": f"opened {a['report']} p{a['page']}" + (", scanned" if r.get("scanned") else "")}
    if t == "propose_claim":
        return {"tool": "propose_claim", "attempt": r["claim_id"], "claim": claim_ids.get(r["claim_id"]),
                "field": a["field"], "kind": a["kind"], "value": a["value"], "report": a["report"], "page": a["page"],
                "result": "accepted" if r["accepted"] else "rejected: " + r["reason"],
                "check": "page image pending" if r["accepted"] and r["by"] == "page image" else
                         ("code" if r["accepted"] else r["failure"])}
    if t == "refuse":
        return {"tool": "refuse", "about": a["field_or_question"], "reason": a["reason"], "result": "Not in these sources"}
    return {"tool": t}


def build_claims(run_id: str, sessions: dict, fields_by_id: dict, image_checks: dict):
    claims, rejected, attempts, rechecked_out = [], [], [], []
    claim_ids: dict[str, str] = {}
    n = 0
    for s, sess in sessions.items():
        props = [(i, c) for i, c in enumerate(sess["calls"]) if c["tool"] == "propose_claim"]
        for k, (i, c) in enumerate(props):
            a, r = c["args"], c["result"]
            scope = "field" if s.startswith("field-") else "eval"
            base = {"attempt_id": r["claim_id"], "session": s, "scope": scope, "call_index": i,
                    "field_as_proposed": a["field"], "field": route_field(s, a["field"], a["kind"], fields_by_id),
                    "kind": a["kind"], "value": a["value"], "unit": a["unit"],
                    "source": {"aris": a["report"], "page": a["page"]}, "quote": a["quote"]}
            now = check_claim(a["kind"], a["value"], a["report"], a["page"], a["quote"])
            if r["accepted"] and not now["accepted"]:
                # The checker got stricter after the run. A claim it would now throw out is shown as thrown out.
                r = r | {"accepted": False, "failure": now["failure"], "found_on": now["found_on"],
                         "reason": "Thrown out on the recheck after the run: " + now["reason"]}
                rechecked_out.append(r["claim_id"])
            attempts.append(base | {"accepted": r["accepted"]})
            if r["accepted"]:
                n += 1
                cid = f"c-{n:04d}"
                claim_ids[r["claim_id"]] = cid
                cen = censored(a["value"]) if a["kind"] == "value" else None
                check = {"by": r["by"], "quote_on_page": r["quote_on_page"], "value_in_quote": r["value_in_quote"],
                         "scanned": r["scanned"]}
                if r["by"] == "page image":
                    ic = image_checks.get(r["claim_id"])
                    check |= ({"image_check": ic["result"], "image_reads": ic["image_reads"], "checked_by": ic["checked_by"],
                               "checked_on": ic["checked_on"], "note": ic.get("note", ""),
                               **({"second_read_by": ic["second_read_by"]} if ic.get("second_read_by") else {})} if ic else
                              {"image_check": "pending", "checked_by": None, "checked_on": None})
                grades = (a["value"].get("grades") or {}) if isinstance(a["value"], dict) else {}
                cen_grades = {k: censored(v) for k, v in grades.items() if censored(v)}
                claims.append(base | {
                    "id": cid, "track": 1, "censored": bool(cen),
                    **({"detection_limit": cen["detection_limit"]} if cen else {}),
                    **({"censored_grades": cen_grades} if cen_grades else {}),
                    **({"applies_to": sorted(rules.caveat_elements(a["quote"])) or "all assay values in this report"}
                       if a["kind"] == "caveat" else {}),
                    "value_norm": value_norm(a["kind"], a["value"]),
                    "caveats": [], "check": check,
                    "also_in": r["also_in"], "run": run_id,
                })
            else:
                later = [c2 for _, c2 in props[k + 1:k + 6] if similar(c, c2)]
                status, fixed_by = "not retried", None
                for c2 in later:
                    if c2["result"]["accepted"]:
                        status, fixed_by = "fixed on retry", c2["result"]["claim_id"]
                        break
                    status = "retried, still rejected"
                rejected.append(base | {"failure": r["failure"], "failure_label": FAILURES.get(r["failure"], r["failure"]),
                                        "reason": r["reason"], "found_on": r["found_on"][:5],
                                        "retry": status, "fixed_by_attempt": fixed_by})
    for rj in rejected:
        rj["fixed_by"] = claim_ids.get(rj.pop("fixed_by_attempt"))
    return claims, rejected, attempts, claim_ids, rechecked_out


def claim_trace(claim: dict, calls: list[dict], rejected_by_fix: dict) -> list[int]:
    """The calls that produced this claim: the last search that surfaced its page, the last open of
    that page, any rejected attempts it fixed, and the proposal itself."""
    i = claim["call_index"]
    a, p = claim["source"]["aris"], claim["source"]["page"]
    steps = []
    opens = [j for j in range(i) if calls[j]["tool"] == "open_page"
             and calls[j]["args"].get("report") == a and calls[j]["args"].get("page") == p]
    if opens:
        o = opens[-1]
        found = [j for j in range(o) if calls[j]["tool"] == "search"
                 and any(h["report"] == a and h["page"] == p for h in calls[j]["result"].get("hits", []))]
        if found:
            steps.append(found[-1])
        steps.append(o)
    steps += rejected_by_fix.get(claim["id"], [])
    steps.append(i)
    return sorted(set(steps))


# ---------------------------------------------------------------- fields

def field_state(f: dict, claims: list[dict], session: dict | None, default_zone: int, extra: list[dict] = ()) -> dict:
    """extra: claims from other sessions that the field's own rule should also see (the eval cross-check)."""
    def part_result(rule: str, cl: list[dict], extra: dict) -> dict:
        values = [c for c in cl if c["kind"] != "caveat"]
        if not values:
            return {"state": "not_in_sources", "claims": [], "caveat_claims": [c["id"] for c in cl]}
        if rule == "location":
            g = rules.group_locations(values, default_zone)
        elif rule == "map_sheet":
            g = rules.group_map_sheets(values)
        elif rule == "exact_text":
            g = rules.group_text(values, extra.get("ignore_words", []))
        elif rule == "number":
            g = rules.group_numbers(values)
        elif rule == "interval":
            g = rules.group_intervals(values)
        else:
            g = {"rule": "none", "groups": [{"claims": [c["id"] for c in values]}], "unplaced": []}
        if rule == "none":
            state = "quotes"
        elif rule == "interval":
            state = "disagree" if any(x["disagree"] for x in g["groups"]) else "settled"
        else:
            state = "disagree" if len(g["groups"]) > 1 else "settled"
        return {"state": state, "rule": rule, "rule_text": rules.RULE_TEXT[rule],
                "claims": [c["id"] for c in values], "caveat_claims": [c["id"] for c in cl if c["kind"] == "caveat"],
                **g}

    out = {"id": f["id"], "name": f["name"], "definition": f["definition"]}
    if f.get("parts"):
        out["parts"] = []
        for p in f["parts"]:
            cl = [c for c in claims if c["field"] == p["id"]]
            out["parts"].append({"id": p["id"], "name": p["name"]} | part_result(p["rule"], cl, p))
        out["caveat_claims"] = [c["id"] for c in claims if c["kind"] == "caveat"]
        out["other_claims"] = [c["id"] for c in claims if c["field"] == f["id"] and c["kind"] != "caveat"]
        states = [p["state"] for p in out["parts"]]
        out["state"] = "disagree" if "disagree" in states else ("settled" if "settled" in states else "not_in_sources")
    else:
        out |= part_result(f["rule"], [c for c in claims if c["field"] == f["id"]] + list(extra), f)
    if out["state"] == "not_in_sources" and session:
        calls = session["calls"]
        out["searches"] = [c["args"]["query"] for c in calls if c["tool"] == "search"]
        out["refusals"] = [c["args"]["reason"] for c in calls if c["tool"] == "refuse"]
        out["session"] = session["meta"]["session"]
    return out


def sides_summary(fs: dict, claims_by_id: dict) -> None:
    """For each group, list distinct sources and a count (what the card shows side by side)."""
    groups = fs.get("groups") or []
    for g in groups:
        ids = g.get("claims", [])
        srcs = []
        for cid in ids:
            s = claims_by_id[cid]["source"]
            if s not in srcs:
                srcs.append(s)
        g["sources"] = srcs
        g["source_count"] = len(srcs)
        g["report_count"] = len({x["aris"] for x in srcs})
        if "points" in g:
            g["values"] = sorted({claims_by_id[cid]["value"] if isinstance(claims_by_id[cid]["value"], str) else ""
                                  for cid in ids} - {""})
            g["points"] = [{k: (round(v, 5) if isinstance(v, float) else v) for k, v in p.items()} for p in g["points"]]
            g["centre"] = {k: round(v, 5) for k, v in g["centre"].items()}


def cross_check(rule: str, fs: dict, eval_claims: list[dict], by_id: dict, zone: int) -> dict:
    """Run this field's rule over the eval sessions' claims too. Anything they found that the field
    session didn't is listed here; the field's own state is left as the field session produced it."""
    found = []
    if rule == "map_sheet":
        have = {g["key"] for g in fs["groups"]}
        for c in eval_claims:
            new = [a for a in rules.map_areas(str(c.get("value") or "")) if a not in have]
            if new:
                found.append({"claim": c["id"], "session": c["session"], "source": c["source"], "map_areas": new})
    else:
        pts = [p for g in fs["groups"] for p in g["points"]]
        for c in eval_claims:
            for p in rules.claim_points(c, zone):
                if pts and min(rules.km_between(p, q) for q in pts) > rules.SAME_PLACE_KM:
                    found.append({"claim": c["id"], "session": c["session"], "source": c["source"],
                                  "km_from_nearest_field_point": round(min(rules.km_between(p, q) for q in pts), 1)})
    return {"note": "The same rule run over the eval sessions' claims. Anything they found that this field's own "
                    "session missed is folded into the row and marked as found by the eval.",
            "found": found}


# ---------------------------------------------------------------- summary

SENTENCE_FAILURES = {
    "number_unbacked": "Number not in a cited claim",
    "one_side": "Cited one side of a disagreement",
    "unknown_id": "Cited something not on the card",
    "cites_nothing": "Cited nothing",
    "too_long": "Sentence too long",
    "empty": "Empty sentence",
}


def build_summary(fields: dict, claims: list[dict], index: dict) -> dict | None:
    """The summary session's sentences, rechecked against today's card, and scored against the summary gold."""
    root = PRIVATE / "summaries"
    runs = sorted(d for d in root.iterdir() if (d / "summary.meta.json").exists()) if root.exists() else []
    if not runs:
        return None
    d = runs[-1]
    meta, manifest = jload(d / "summary.meta.json"), jload(d / "manifest.json")
    calls = [json.loads(ln) for ln in (d / "summary.tools.jsonl").read_text(encoding="utf-8").splitlines() if ln.strip()]
    today = card.Card(fields, claims, index)
    kept, thrown, trace = [], [], []
    for i, c in enumerate(calls):
        if c["tool"] == "read_card":
            trace.append({"i": i, "tool": "read_card", "result": f"{c['result']['fields']} fields"})
        elif c["tool"] == "read_field":
            trace.append({"i": i, "tool": "read_field", "field": c["args"]["field"],
                          "result": f"{c['result']['claims']} claims"})
        elif c["tool"] == "propose_sentence":
            a, r = c["args"], c["result"]
            now = today.check_sentence(a["text"], a["cite"])
            row = {"id": r["sentence_id"], "text": a["text"], "cite": list(dict.fromkeys(a["cite"]))}
            if r["accepted"] and now["accepted"]:
                kept.append(row)
            else:
                why = r if not r["accepted"] else now | {"reason": "Thrown out on today's card: " + now["reason"]}
                thrown.append(row | {"failure": why["failure"], "failure_label": SENTENCE_FAILURES.get(why["failure"], why["failure"]),
                                     "reason": why["reason"]})
            trace.append({"i": i, "tool": "propose_sentence", "sentence": r["sentence_id"],
                          "result": "kept" if r["accepted"] else "thrown out: " + r["reason"]})
    for t in thrown:  # a later kept sentence that cites the same things is the fix
        later = [k for k in kept if k["id"] > t["id"] and set(k["cite"]) & set(t["cite"])]
        t["fixed_by"] = later[0]["id"] if later else None
    text = " ".join(k["text"] for k in kept)
    gold = jload(DATA / "eval" / "summary_gold.json")
    points = [{"about": g["about"], "label": g["label"], "met": any(alt_met(a, text) for a in g["any_of"])}
              for g in gold["points"]]
    frozen = manifest["frozen_hashes"]
    return {
        "summary": d.name, "date": meta["started"][:10], "model": meta["init_model"], "cli_version": meta["cli_version"],
        "effort": manifest["effort"], "tools": manifest["tools"], "only_card_tools": manifest["only_card_tools"],
        "result": meta["result_subtype"], "model_turns": meta.get("num_turns"), "seconds": meta["seconds"],
        "gold_unchanged_since_run": frozen.get("summary_gold.json") == hashlib.sha256(
            (DATA / "eval" / "summary_gold.json").read_bytes()).hexdigest(),
        "rule_text": card.__doc__.split("\n\n")[1].strip(),
        "sentences": kept, "thrown_out": thrown, "trace": trace,
        "points": points, "gold_written_by": gold["written_by"], "gold_what": gold["what"],
    }


# ---------------------------------------------------------------- main

def main(run_id: str) -> None:
    run_dir = PRIVATE / "runs" / run_id
    fields, fields_by_id = field_index()
    index = build_index()
    jdump(DATA / "index.json", index)
    corp = build_corpus(index)
    jdump(DATA / "corpus.json", corp)
    zones = Counter(f["properties"]["UTM_ZONE_NAD83"] for f in jload(PRIVATE / "raw" / "wfs.json")["features"])
    default_zone = zones.most_common(1)[0][0]

    sessions = load_run(run_dir)
    changes = jload(DATA / "eval" / "changes.json")
    image_checks_path = DATA / "image_checks.json"
    image_checks = {c["attempt_id"]: c for c in jload(image_checks_path)["checks"]} if image_checks_path.exists() else {}
    claims, rejected, attempts, claim_ids, rechecked_out = build_claims(run_id, sessions, fields_by_id, image_checks)
    by_id = {c["id"]: c for c in claims}

    # caveats attach by rule, within the card and within each eval answer
    for scope_claims in ([c for c in claims if c["scope"] == "field"],
                         *[[c for c in claims if c["session"] == s] for s in sessions if s.startswith("eval-")]):
        for cid, cav in rules.attach_caveats(scope_claims).items():
            by_id[cid]["caveats"] = cav

    # traces
    rejected_by_fix = defaultdict(list)
    for rj in rejected:
        if rj["fixed_by"]:
            rejected_by_fix[rj["fixed_by"]].append(rj["call_index"])
    traces = {}
    for s, sess in sessions.items():
        traces[s] = [dict(i=i, **summarize_call(c, claim_ids)) for i, c in enumerate(sess["calls"])]
    for c in claims:
        c["trace"] = {"session": c["session"], "steps": claim_trace(c, sessions[c["session"]]["calls"], rejected_by_fix)}
    jdump(DATA / "traces.json", {"run": run_id, "note": "Summarized tool calls. Full page text is never stored here.",
                                 "sessions": traces})

    # excerpts: what each claim ships of its page
    excerpts, shares = {}, []
    by_page = defaultdict(list)
    for c in claims:
        by_page[(c["source"]["aris"], c["source"]["page"])].append(c)
    for (aris, pno), cs in sorted(by_page.items()):
        plan = plan_excerpts(aris, pno, cs)
        share = plan.pop("_share")
        shares.append({"aris": aris, "page": pno, **share})
        excerpts |= plan
    missing = [c["id"] for c in claims if c["id"] not in excerpts]
    cut_quotes = {cid: ex.pop("quote_shown") for cid, ex in excerpts.items() if "quote_shown" in ex}
    report_chars = {r["aris"]: sum(len(flat(corpus.page_text(r["aris"], n))) for n in corpus.pages(r["aris"])
                                   if r["pages_used"][0] <= n <= r["pages_used"][1]) for r in corp["reports"]}
    shipped = Counter()
    for x in shares:
        shipped[x["aris"]] += x["shipped_chars"]
    over = [x for x in shares if x["shipped_chars"] > PAGE_SHARE * x["page_chars"]]
    jdump(DATA / "excerpts.json", {
        "max_chars": EXCERPT_MAX, "page_share": PAGE_SHARE,
        "note": f"Each claim ships at most {EXCERPT_MAX} characters of its page: the quote, then a little context if there "
                f"is room. A longer quote is cut to the part around its value. If a page's claims together would ship "
                f"more than {PAGE_SHARE:.0%} of its text, context goes first, then long text quotes shrink to their value.",
        "pages_over_share": [{k: x[k] for k in ("aris", "page")} | {"share": round(x["shipped_chars"] / x["page_chars"], 2)}
                             for x in over],
        "report_share": {str(a): round(shipped[a] / report_chars[a], 3) for a in report_chars},
        "excerpts": excerpts, "not_located": missing})

    # fields
    field_out = []
    eval_claims = [c for c in claims if c["scope"] == "eval" and c["kind"] != "caveat"]
    for f in fields:
        fc = [c for c in claims if c["scope"] == "field" and fields_by_id.get(c["field"], {}).get("id") == f["id"]]
        fs = field_state(f, fc, sessions.get(f"field-{f['id']}"), default_zone)
        if f.get("rule") in ("location", "map_sheet") and fs["state"] != "not_in_sources":
            cc = cross_check(f["rule"], fs, eval_claims, by_id, default_zone)
            if cc["found"]:
                extra = [by_id[x["claim"]] for x in cc["found"]]
                fs = field_state(f, fc, sessions.get(f"field-{f['id']}"), default_zone, extra)
                fs["from_eval"] = sorted(c["id"] for c in extra)
            fs["eval_cross_check"] = cc
        for part in fs.get("parts", [fs]):
            sides_summary(part, by_id)
            for g in part.get("groups") or []:
                if "hole" in g:  # the hole as each source writes it, line-break hyphens closed up
                    g["hole_written"] = sorted({re.sub(r"-\s+", "-", by_id[c]["value"]["hole"]).strip()
                                                for c in g["claims"]})
        field_out.append(fs)
    fields_file = {"run": run_id, "default_utm_zone": default_zone, "text_field_note": rules.RULE_TEXT["none"],
                   "fields": field_out}
    jdump(DATA / "fields.json", fields_file)
    summary = build_summary(fields_file, claims, index)
    if summary:
        # The hand notes under summary sentences are for one summary session. After a rerun they must be redone.
        review = jload(DATA / "eval" / "summary_review.json")
        kept = {s["id"] for s in summary["sentences"]}
        stale = [n["sentence"] for n in review["notes"] if n["sentence"] not in kept]
        if review.get("summary") != summary["summary"] or stale:
            sys.exit(f"data/eval/summary_review.json reviews summary {review.get('summary')}, but the card shows "
                     f"{summary['summary']} (notes on sentences it doesn't keep: {stale or 'none'}). Reread the new "
                     f"summary against its quotes, rewrite the notes and set \"summary\".")
        jdump(DATA / "summary.json", summary)

    # eval
    questions = jload(DATA / "eval" / "questions.json")
    gold = {g["id"]: g for g in jload(DATA / "eval" / "gold.json")["questions"]}
    answers = []
    for q in questions:
        s = f"eval-{q['id']}"
        sess = sessions.get(s)
        if not sess:
            continue
        qc = [c for c in claims if c["session"] == s]
        refused = any(c["tool"] == "refuse" for c in sess["calls"])
        ans = answer_line(sess["meta"]["final_text"])
        sc = score_question(q["category"], gold[q["id"]], ans, refused, qc)
        answers.append({"id": q["id"], "category": q["category"], "question": q["question"],
                        "answer": ans, "answer_missing": ans is None, "refused": refused,
                        "claims": [c["id"] for c in qc],
                        "rejected": [r["attempt_id"] for r in rejected if r["session"] == s],
                        "session": s, **sc})
    answers.sort(key=lambda a: (a["passed"], a["id"]))
    jdump(DATA / "eval" / "answers.json", {"run": run_id, "answers": answers})

    eval_attempts = [a for a in attempts if a["scope"] == "eval"]
    confirmed = 0
    for a in eval_attempts:
        if not a["accepted"]:
            continue
        cid = claim_ids.get(a["attempt_id"])
        ch = by_id[cid]["check"]
        if ch["by"] == "code" or ch.get("image_check") == "confirmed":
            confirmed += 1
    cat = Counter(a["category"] for a in answers)
    passed = Counter(a["category"] for a in answers if a["passed"])
    false_ref = sum(1 for a in answers if a["category"] != "unanswerable" and a["refusal"])
    fail_counts = Counter()
    for a in answers:
        fail_counts.update(a["failures"])
    for r in rejected:
        fail_counts[r["failure"]] += 1
    scores = {
        "run": run_id,
        "citation_precision": {"n": confirmed, "of": len(eval_attempts), "definition": SCORE_DEFS["citation_precision"]},
        "answer_accuracy": {"n": passed["answerable"], "of": cat["answerable"], "definition": SCORE_DEFS["answer_accuracy"]},
        "correct_refusals": {"n": passed["unanswerable"], "of": cat["unanswerable"], "definition": SCORE_DEFS["correct_refusals"]},
        "false_refusals": {"n": false_ref, "of": cat["answerable"] + cat["conflict"], "definition": SCORE_DEFS["false_refusals"]},
        "disagreements_flagged": {"n": passed["conflict"], "of": cat["conflict"], "definition": SCORE_DEFS["disagreements_flagged"]},
        "failure_counts": [{"code": k, "label": FAILURES[k], "count": fail_counts.get(k, 0),
                            "from_answers": sum(1 for a in answers if k in a["failures"]),
                            "from_checker": sum(1 for r in rejected if r["failure"] == k)} for k in FAILURES],
        "failure_counts_note": "Checker counts cover every rejected claim in the run, field sessions and eval sessions. "
                               "Answer counts cover the 15 eval answers.",
        **({"summary_points": {"n": sum(p["met"] for p in summary["points"]), "of": len(summary["points"]),
                               "definition": "Points a short evaluation of Iron Lake should make, written before the summary "
                                             "session ran, that the summary's own text states."},
            "summary_sentences": {"n": len(summary["sentences"]),
                                  "of": len(summary["sentences"]) + len(summary["thrown_out"]),
                                  "definition": "Sentences code kept, out of every sentence the summary session proposed. "
                                                "A sentence is kept only if every number in it is in what it cites and it "
                                                "cites every side of any disagreement it touches."}}
           if summary else {}),
        "changes_after_first_eval": changes["changes"],
    }
    jdump(DATA / "eval" / "scores.json", scores)

    # The summary session reads the card with full quotes; that copy stays private.
    jdump(PRIVATE / "card_claims.json", {"run": run_id, "claims": claims})
    # Everything above used the full quotes. The shipped claim carries only the part of its quote the site shows.
    for c in claims:
        if c["id"] in cut_quotes:
            c["quote"] = cut_quotes[c["id"]]
            c["quote_cut"] = {"chars": excerpts[c["id"]]["quote_chars"]}
    for r in rejected:
        if len(r["quote"] or "") > EXCERPT_MAX:
            full = len(r["quote"])
            r["quote"] = r["quote"][:EXCERPT_MAX].rsplit(" ", 1)[0]
            r["quote_cut"] = {"chars": full}
    jdump(DATA / "claims.json", {"run": run_id, "count": len(claims), "claims": claims})
    jdump(DATA / "rejected.json", {"run": run_id, "count": len(rejected), "rejected": rejected})

    # scanned pages
    scanned = []
    for r in corp["reports"]:
        for pno in r["scanned_pages"]:
            p = corpus.page(r["aris"], pno)
            cited = [c for c in claims if c["source"] == {"aris": r["aris"], "page": pno}]
            scanned.append({"aris": r["aris"], "page": pno, "image_cover": p["image_cover"],
                            "invisible_ocr_text": p["invisible_text"], "cited_by": [c["id"] for c in cited],
                            "image_checks": [{"claim": c["id"], **{k: c["check"].get(k) for k in
                                              ("image_check", "image_reads", "checked_by", "checked_on", "note")}} for c in cited]})
    jdump(DATA / "scanned_pages.json", {
        "method": "PyMuPDF: a page counts as scanned when one image covers at least 85% of the page and the page has "
                  "a text layer. invisible_ocr_text is true when that layer is drawn invisibly (render mode 3), the "
                  "usual sign of OCR. Claims on these pages are never counted as code-checked; each cited one is "
                  "checked against a rendering of the page image.",
        "pages": scanned})

    # run record
    manifest = jload(run_dir / "manifest.json")
    metas = [s["meta"] for s in sessions.values()]
    hashes = {r["kind"]: r["frozen_hashes"] for r in manifest["runs"]}
    gold_hash = (run_dir / "gold_frozen.sha256").read_text(encoding="utf-8") if (run_dir / "gold_frozen.sha256").exists() else ""
    run = {
        "run": run_id,
        "date": min(m["started"] for m in metas)[:10],
        "model": sorted({m["init_model"] for m in metas}),
        "cli_version": sorted({m["cli_version"] for m in metas}),
        "effort": manifest["runs"][0]["effort"],
        "max_turns_flag": manifest["runs"][0]["max_turns"],
        "model_turns": {"min": min(m["model_turns"] for m in metas), "max": max(m["model_turns"] for m in metas),
                        "note": "Assistant messages per session; one message can carry several tool calls."},
        "tools_listed_in_first_event": sorted({t for m in metas for t in (m["init_tools"] or [])}),
        "only_corpus_tools_every_session": all(sorted(m["init_tools"] or []) == sorted(manifest["runs"][0]["tools"]) for m in metas),
        "sessions": {"fields": sum(1 for s in sessions if s.startswith("field-")),
                     "eval": sum(1 for s in sessions if s.startswith("eval-"))},
        "session_results": {m["session"]: {"result": m["result_subtype"], "model_turns": m["model_turns"],
                                           "tool_calls": len(sessions[m["session"]]["calls"]), "seconds": m["seconds"]}
                            for m in metas},
        "prompt_and_tool_hashes": hashes,
        "hashes_identical_across_field_and_eval_runs": len({json.dumps(h, sort_keys=True) for h in hashes.values()}) == 1,
        "gold_frozen_before_eval": gold_hash.strip().splitlines(),
        "full_runs": changes["full_runs"],
        "full_runs_note": changes["why_two_runs"],
        "first_run": changes["first_run"],
        "changes_after_first_eval": changes["changes"],
        "claims_accepted": len(claims), "claims_rejected": len(rejected),
        "command": [c.replace(str(corpus.ROOT) + "\\", "").replace("\\", "/") for c in metas[0]["command"]],
        "post_processing_hashes": {f: hashlib.sha256((corpus.ROOT / "agent" / f).read_bytes()).hexdigest()
                                   for f in ("rules.py", "score.py", "build_data.py")},
        "changes_after_run_2": changes.get("after_run_2", []),
        "recheck": {"note": "Every claim the run accepted was checked again with the checker as it is now. Any it would "
                            "throw out is shown as thrown out.",
                    "claims": len(claims) + len(rechecked_out), "thrown_out": rechecked_out},
    }
    jdump(DATA / "run.json", run)
    print(f"claims {len(claims)}, rejected {len(rejected)}, excerpts missing {len(missing)}")
    for fs in field_out:
        print(f"  {fs['name']}: {fs['state']}")
    for k in ("citation_precision", "answer_accuracy", "correct_refusals", "false_refusals", "disagreements_flagged"):
        print(f"  {k}: {scores[k]['n']} of {scores[k]['of']}")


if __name__ == "__main__":
    main(sys.argv[1])
