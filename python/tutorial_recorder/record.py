"""Step 1 of 2: record the procedure once.

Opens a Chrome window with Playwright's recorder attached and pointed at a
URL. Click and type through the app normally; every action (click/fill/
press/navigate) is written as a Python script to a file in the output
folder. Close the browser window when you're done.

    python record.py http://localhost:5173
    python record.py http://localhost:5173 C:\\Users\\Tim\\Desktop\\MyRecordings

The second argument is the folder to save into (defaults to this folder);
the filename itself is auto-generated as recorded_actions_<timestamp>.py.

Unlike `playwright codegen`, this launches Chrome without the
--enable-automation flag (navigator.webdriver stays false), so
Cloudflare-protected sites like partsouq.com pass their "Verify you are
human" check instead of looping forever. The recorder itself is attached
through Playwright's internal enableRecorder protocol call — private API,
so pin the playwright version (works on 1.61) and re-test after upgrades.

Then run replay.py (step 2) — it extracts the action lines from the saved
file and replays them through tutorial_session for the highlighted, paced,
video-recorded version.
"""

import sys
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"recorded_actions_{datetime.now():%Y%m%d_%H%M%S}.py"

    with sync_playwright() as pw:
        # Same stealth launch as session.py: without these flags Chrome
        # advertises itself as automated and Cloudflare's human-verification
        # loops forever even when a real person clicks it.
        browser = pw.chromium.launch(
            headless=False, channel="chrome",
            ignore_default_args=["--enable-automation"],
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(no_viewport=True)
        # Private protocol call — the same thing `playwright codegen` does
        # internally. Channel.send(method, timeout_calculator, params).
        context._sync(context._impl_obj._channel.send(
            "enableRecorder", None,
            {
                "language": "python",
                "mode": "recording",
                "outputFile": str(out_file),
            },
        ))
        page = context.new_page()
        page.goto(url)
        print("Recording... close the browser window when you're done.")
        try:
            context.wait_for_event("close", timeout=0)
        except KeyboardInterrupt:
            context.close()
    print(f"Saved: {out_file}")


if __name__ == "__main__":
    main()
