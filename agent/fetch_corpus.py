"""Fetch the property's public material from BC's ARIS archive (agent/property.json).

Writes everything to data/private/ (gitignored): the WFS index dump, the ARIS
detail pages, and the seven corpus PDFs. Polite: one request at a time with a
pause between them. Re-running skips files that are already present and the
same size as the server reports.

Usage: python agent/fetch_corpus.py [--pdf-cache DIR]
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import re
import shutil
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = ROOT / "data" / "private"
PROPERTY = json.loads((ROOT / "agent" / "property.json").read_text(encoding="utf-8"))
UA = "iron-lake-property-file/0.1 (student research; one request at a time)"
PAUSE_S = 1.5

WFS_URL = (
    "https://openmaps.gov.bc.ca/geo/pub/wfs?service=WFS&version=2.0.0&request=GetFeature"
    "&typeName=pub:WHSE_MINERAL_TENURE.ARIS_MINERAL_REPORTS&outputFormat=application/json"
    "&CQL_FILTER=" + urllib.parse.quote(f"PROPERTY_NAME ILIKE '%{PROPERTY['aris_property_filter']}%'")
)
DETAIL_URL = "https://apps.nrs.gov.bc.ca/pub/aris/detail/{n}"
PDF_URL = "https://apps.nrs.gov.bc.ca/pub/aris/Report/{n}.pdf/"

CORPUS = [r["aris"] for r in PROPERTY["reports"]]


def get(url: str, method: str = "GET") -> urllib.request.addinfourl:
    req = urllib.request.Request(url, headers={"User-Agent": UA}, method=method)
    time.sleep(PAUSE_S)
    return urllib.request.urlopen(req, timeout=120)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_detail(page: str) -> dict:
    """Pull the label/value pairs we use out of an ARIS detail page."""
    body = re.sub(r"(?is)<(script|style).*?</\1>", "", page)
    body = html.unescape(re.sub(r"(?s)<[^>]+>", "\n", body))
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()]

    def after(label: str) -> str | None:
        if label not in lines:
            return None
        i = lines.index(label) + 1
        return lines[i] if i < len(lines) else None

    pages = after("Number of Pages")
    files_i = lines.index("File(s)") + 1 if "File(s)" in lines else None
    files = []
    if files_i is not None:
        for ln in lines[files_i:]:
            if not ln.lower().endswith(".pdf"):
                break
            files.append(ln)
    return {
        "title": after("Title"),
        "report_year": after("Report Year"),
        "pages": int(pages) if pages and pages.isdigit() else None,
        "affidavit_date": after("Affidavit Date"),
        "off_confidential": after("Off Confidential"),
        "commodities": after("Commodities") if after("Commodities") not in ("Work Done",) else None,
        "files": files,
        "pending_review": "Pending review" in lines,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-cache", type=Path, action="append", default=[],
                    help="folder with PDFs already downloaded today, named <aris>.pdf")
    args = ap.parse_args()

    raw = PRIVATE / "raw"
    (raw / "detail").mkdir(parents=True, exist_ok=True)
    (PRIVATE / "pdf").mkdir(parents=True, exist_ok=True)
    today = dt.date.today().isoformat()
    log: dict = {"retrieved": today, "user_agent": UA, "wfs": None, "detail": {}, "pdf": {}}

    with get(WFS_URL) as r:
        wfs = json.loads(r.read().decode("utf-8"))
    (raw / "wfs.json").write_text(json.dumps(wfs, indent=1), encoding="utf-8")
    numbers = sorted(f["properties"]["ARIS_NUMBER"] for f in wfs["features"])
    log["wfs"] = {"url": WFS_URL, "records": len(numbers), "timeStamp": wfs.get("timeStamp")}
    print(f"WFS: {len(numbers)} records")

    details = {}
    for n in numbers:
        url = DETAIL_URL.format(n=n)
        with get(url) as r:
            page = r.read().decode("utf-8", errors="replace")
        (raw / "detail" / f"{n}.html").write_text(page, encoding="utf-8")
        details[n] = parse_detail(page) | {"url": url}
        log["detail"][n] = url
    (raw / "detail.json").write_text(json.dumps(details, indent=1), encoding="utf-8")
    print(f"detail pages: {len(details)}")

    for n in CORPUS:
        url = PDF_URL.format(n=n)
        dest = PRIVATE / "pdf" / f"{n}.pdf"
        with get(url, method="HEAD") as r:
            size = int(r.headers.get("Content-Length", "0"))
            ctype = r.headers.get("Content-Type")
            disp = r.headers.get("Content-Disposition")
        source = "downloaded"
        if not (dest.exists() and dest.stat().st_size == size):
            cached = next((c / f"{n}.pdf" for c in args.pdf_cache
                           if (c / f"{n}.pdf").exists() and (c / f"{n}.pdf").stat().st_size == size), None)
            if cached:
                shutil.copyfile(cached, dest)
                source = "same-day cache, size matches server"
            else:
                with get(url) as r, dest.open("wb") as f:
                    shutil.copyfileobj(r, f)
        else:
            source = "already present, size matches server"
        assert dest.stat().st_size == size, f"{n}: size mismatch"
        log["pdf"][n] = {"url": url, "bytes": size, "content_type": ctype,
                         "content_disposition": disp, "sha256": sha256(dest), "source": source}
        print(f"pdf {n}: {size:,} bytes ({source})")

    (raw / "fetch_log.json").write_text(json.dumps(log, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
