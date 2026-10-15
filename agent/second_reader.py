"""Second reader for the gold answers: a Codex model that never sees the agent.

Builds a packet (questions, gold answers, the cited page text, the full corpus
text for its own searches, the images of the pages the gold reads by eye, and
the ARIS entry for report 43017), runs `codex exec` read-only, and saves its
verdicts to data/eval/second_reader.json.

Usage: python agent/second_reader.py <packet_dir>
"""
from __future__ import annotations

import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import fitz

import corpus

MODEL = "gpt-6.1-sol"
EFFORT = "xhigh"
IMAGES = ((36807, 1), (38640, 1), (41800, 39))

PROMPT = """You are the second reader for a small evaluation set. Each question has a gold answer
written by someone else from public BC mineral assessment reports. Your job is to check the gold
against the pages, not to answer from memory. You have never seen any agent output and none is
included.

Files in this folder:
- questions_gold.json: 15 questions with their gold answer, expected values, required caveats and
  cited sources (report number, PDF page number, quote).
- cited/<report>_p<page>.txt: full text of every cited page.
- corpus/<report>/<page>.txt: full text of every page in the corpus (566 pages), for your own searches.
- search_log.json: the keyword searches already run for the four unanswerable questions.
- page images (attached): 36807_p1.png (a scanned title form; its OCR text is unreliable, so read it
  from the image), 38640_p1.png (a form whose typed values sit apart from their labels in the text
  layer) and 41800_p39.png (its text layer splits each line in two).
- aris_detail_43017.txt: the ARIS catalogue entry for report 43017, which is not in the corpus.

For each question:
- Answerable and conflict questions: is the gold answer correct and complete per the pages? Are the
  expected values right? Is a required caveat missing or wrong? Is any quote misattributed?
- Unanswerable questions: search the corpus text yourself for the key terms and reasonable synonyms.
  Does anything in these reports actually answer the question for the Iron Lake property? Statements
  about other properties or deposits do not count.
- For the images: read what the gold cites from each (on 36807 p1: latitude, longitude, NTS/BCGS map
  sheet, mining division and commodities sought) and compare with the gold.

Write ONLY a JSON array to your final message, one object per question:
{"id": "q01", "verdict": "agree" or "dispute", "notes": "one or two sentences citing report and page",
 "suggested_fix": "" or what to change}
Then nothing else."""


def strip_html(page: str) -> str:
    page = re.sub(r"(?is)<(script|style).*?</\1>", "", page)
    page = html.unescape(re.sub(r"(?s)<[^>]+>", "\n", page))
    return re.sub(r"\s*\n\s*", "\n", page)


def main() -> None:
    packet = Path(sys.argv[1]).resolve()
    (packet / "cited").mkdir(parents=True, exist_ok=True)
    eval_dir = corpus.DATA / "eval"
    questions = {q["id"]: q for q in json.loads((eval_dir / "questions.json").read_text(encoding="utf-8"))}
    gold = json.loads((eval_dir / "gold.json").read_text(encoding="utf-8"))
    merged = [questions[g["id"]] | g for g in gold["questions"]]
    (packet / "questions_gold.json").write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
    (packet / "search_log.json").write_text((eval_dir / "search_log.json").read_text(encoding="utf-8"), encoding="utf-8")
    for g in gold["questions"]:
        for s in g["sources"]:
            if "aris" not in s:  # an outside source, such as the ARIS entry for 43017
                continue
            p = corpus.page(s["aris"], s["page"])
            (packet / "cited" / f"{s['aris']}_p{s['page']}.txt").write_text(p["text"], encoding="utf-8")
    for a, n in corpus.all_pages():
        d = packet / "corpus" / str(a)
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{n}.txt").write_text(corpus.page(a, n)["text"], encoding="utf-8")
    images = []
    for aris, pno in IMAGES:
        img = packet / f"{aris}_p{pno}.png"
        fitz.open(corpus.PDF_DIR / f"{aris}.pdf")[pno - 1].get_pixmap(dpi=150).save(img)
        images.append(str(img))
    detail = strip_html((corpus.PRIVATE / "raw" / "detail" / "43017.html").read_text(encoding="utf-8"))
    (packet / "aris_detail_43017.txt").write_text(
        "Source: https://apps.nrs.gov.bc.ca/pub/aris/detail/43017, retrieved 2026-10-15\n" + detail, encoding="utf-8")

    out = packet / "second_reader_last.txt"
    cmd = [shutil.which("codex") or "codex", "exec", "-m", MODEL, "-c", f"model_reasoning_effort={EFFORT}",
           "-s", "read-only", "--skip-git-repo-check", "--ephemeral", "-C", str(packet),
           *[a for i in images for a in ("-i", i)], "-o", str(out), "-"]
    proc = subprocess.run(cmd, input=PROMPT, text=True, encoding="utf-8", capture_output=True, timeout=3600)
    (packet / "codex_stdout.txt").write_text(proc.stdout or "", encoding="utf-8")
    (packet / "codex_stderr.txt").write_text(proc.stderr or "", encoding="utf-8")
    text = out.read_text(encoding="utf-8") if out.exists() else ""
    start, end = text.find("["), text.rfind("]")
    verdicts = json.loads(text[start:end + 1]) if start >= 0 else []
    result = {"reader": f"codex exec, {MODEL}, reasoning {EFFORT}, read-only sandbox",
              "returncode": proc.returncode, "verdicts": verdicts}
    (eval_dir / "second_reader.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
