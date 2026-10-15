"""Run one agent session through the claude CLI with only one MCP server's tools.

The field and eval sessions get the four corpus tools. The summary session gets
the three card tools (card_server.py) and never sees the report pages.

Each session gets its own MCP config (so the server knows its session id and
log file), runs from an empty scratch folder outside any repo, and saves the
raw stream-json transcript plus the server's tool log under
data/private/runs/<run_id>/.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

AGENT = Path(__file__).resolve().parent
ROOT = AGENT.parent
PRIVATE = ROOT / "data" / "private"
PROMPTS = AGENT / "prompts"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
if not PYTHON.exists():
    PYTHON = Path(sys.executable)

MODEL = "claude-opus-5-5"
EFFORT = "high"
MAX_TURNS = 60
TOOLS = ["mcp__corpus__search", "mcp__corpus__open_page", "mcp__corpus__propose_claim", "mcp__corpus__refuse"]
FROZEN = ["prompts/system.md", "prompts/field.md", "prompts/question.md", "prompts/fields.json",
          "corpus_server.py", "checker.py", "corpus.py", "textnorm.py"]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def frozen_hashes() -> dict[str, str]:
    return {f: sha256_file(AGENT / f) for f in FROZEN}


def scratch_dir() -> Path:
    """An empty folder outside the repo, so no project CLAUDE.md is picked up."""
    base = Path(os.environ.get("AGENT_SCRATCH") or (Path.home() / ".iron-lake-agent-cwd"))
    base.mkdir(parents=True, exist_ok=True)
    return base


def command(mcp_config: Path, tools: list[str] = TOOLS, system: Path = PROMPTS / "system.md") -> list[str]:
    return [
        "claude", "-p",
        "--model", MODEL,
        "--effort", EFFORT,
        "--tools", "",
        "--strict-mcp-config", "--mcp-config", str(mcp_config),
        "--allowedTools", " ".join(tools),
        "--system-prompt-file", str(system),
        "--setting-sources", "",
        "--disable-slash-commands",
        "--output-format", "stream-json", "--verbose",
        "--no-session-persistence",
        "--max-turns", str(MAX_TURNS),
    ]


def run_session(run_dir: Path, session: str, prompt: str, timeout_s: int = 1800, server: str = "corpus",
                tools: list[str] = TOOLS, system: Path = PROMPTS / "system.md") -> dict:
    run_dir.mkdir(parents=True, exist_ok=True)
    tools_log = run_dir / f"{session}.tools.jsonl"
    stream = run_dir / f"{session}.stream.jsonl"
    for f in (tools_log, stream):
        f.unlink(missing_ok=True)
    cfg = {"mcpServers": {server: {
        "type": "stdio", "command": str(PYTHON), "args": [str(AGENT / f"{server}_server.py")],
        "env": {"CORPUS_SESSION": session, "CORPUS_LOG": str(tools_log), "PYTHONIOENCODING": "utf-8"}}}}
    cfg_path = run_dir / f"{session}.mcp.json"
    cfg_path.write_text(json.dumps(cfg, indent=1), encoding="utf-8")

    cmd = command(cfg_path, tools, system)
    started = dt.datetime.now(dt.timezone.utc)
    t0 = time.time()
    with stream.open("w", encoding="utf-8") as out:
        proc = subprocess.run(cmd, input=prompt, stdout=out, stderr=subprocess.PIPE, text=True,
                              encoding="utf-8", cwd=scratch_dir(), timeout=timeout_s, shell=False)
    events = [json.loads(ln) for ln in stream.read_text(encoding="utf-8").splitlines() if ln.strip().startswith("{")]
    init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), {})
    result = next((e for e in reversed(events) if e.get("type") == "result"), {})
    meta = {
        "session": session,
        "prompt": prompt,
        "started": started.isoformat(),
        "seconds": round(time.time() - t0, 1),
        "returncode": proc.returncode,
        "stderr_tail": proc.stderr[-2000:] if proc.stderr else "",
        "init_tools": init.get("tools"),
        "init_mcp": init.get("mcp_servers"),
        "init_model": init.get("model"),
        "cli_version": init.get("claude_code_version"),
        "result_subtype": result.get("subtype"),
        "is_error": result.get("is_error"),
        "num_turns": result.get("num_turns"),
        "final_text": result.get("result"),
        "usage": result.get("usage"),
        "total_cost_usd": result.get("total_cost_usd"),
        "command": [f"{session}.mcp.json" if c == str(cfg_path) else c for c in cmd],
    }
    (run_dir / f"{session}.meta.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    return meta
