"""Step 2 of 2: replay a recorded file automatically — no manual copy/paste.

Pass the file record.py saved, or leave it blank to auto-pick the newest
recorded_actions_*.py next to this script:

    python replay.py
    python replay.py C:\\Users\\Tim\\Desktop\\MyRecordings\\recorded_actions_20260101_120000.py
    python replay.py C:\\Users\\Tim\\Desktop\\MyRecordings\\recorded_actions_20260101_120000.py C:\\Users\\Tim\\Desktop\\Videos

Extracts just the page-interaction lines from the codegen output (skipping
the browser-launch/close boilerplate it also writes) and runs them through
tutorial_session, so you get cursor highlighting, human-paced typing, and a
video recording automatically.

The second argument is the folder to save the video into (defaults to the
same folder as the recording file itself, not this script's own folder).
"""

import ast
import re
import sys
from pathlib import Path

from playwright.sync_api import expect  # noqa: F401 — available to exec'd code below

from session import tutorial_session

# Codegen's own setup/teardown calls — never part of the actual procedure,
# so they're dropped rather than replayed.
_SKIP_MARKERS = (
    "chromium.launch", "webkit.launch", "firefox.launch",
    ".new_context(", ".new_page(", ".close()",
)


def find_latest_recording(folder: Path) -> Path | None:
    candidates = sorted(folder.glob("recorded_actions_*.py"), key=lambda p: p.stat().st_mtime)
    return candidates[-1] if candidates else None


def extract_actions(path: Path) -> str:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    func = next((n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)), None)
    body = func.body if func else tree.body

    lines = []
    for node in body:
        snippet = ast.get_source_segment(source, node)
        if not snippet or any(marker in snippet for marker in _SKIP_MARKERS):
            continue
        lines.append(snippet)
    return "\n".join(lines)


def main():
    if len(sys.argv) > 1:
        rec_path = Path(sys.argv[1])
    else:
        rec_path = find_latest_recording(Path(__file__).parent)
        if rec_path is None:
            raise SystemExit(
                "No recorded_actions_*.py found next to replay.py — run record.py "
                "first, or pass the file path as an argument."
            )

    if not rec_path.exists():
        raise SystemExit(f"File not found: {rec_path}")

    video_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else rec_path.parent

    code = extract_actions(rec_path)
    if not code.strip():
        raise SystemExit(f"No page actions found in {rec_path} — was anything recorded?")

    print(f"Replaying: {rec_path}")
    with tutorial_session(output_dir=str(video_dir)) as page:
        exec(compile(code, str(rec_path), "exec"), {"page": page, "expect": expect, "re": re})


if __name__ == "__main__":
    main()
