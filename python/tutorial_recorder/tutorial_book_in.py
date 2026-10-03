"""Tutorial video: log in to the workshop demo account, book a car in, and
follow the new job on the Jobs board.

    "C:\\Users\\Tim\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe" tutorial_book_in.py

The project's .venv is 32-bit Python (no Playwright wheels), so run this with
the 64-bit Python that has playwright installed. Needs the dev server on :3000.
"""

import re
import sys

from session import tutorial_session

URL = "http://localhost:3000/"
USER, PASSWORD = "wsdemo", "demo"
PLATE = sys.argv[1] if len(sys.argv) > 1 else "DEMO123GP"

CAPTION_JS = """
(text) => {
  let el = document.getElementById('tut-caption');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tut-caption';
    el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
      'z-index:2147483647;max-width:80%;padding:12px 22px;border-radius:12px;' +
      'background:rgba(15,18,28,.92);color:#fff;font:600 18px DM Sans,Segoe UI,sans-serif;' +
      'text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none;' +
      'transition:opacity .25s';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = text ? '1' : '0';
}
"""


# Viewers don't like waiting: every caption hold is shortened by this much (floor 500ms).
HOLD_TRIM_MS = 1000


def say(page, text, hold_ms=1800):
    page.evaluate(CAPTION_JS, text)
    if hold_ms:
        page.wait_for_timeout(max(500, hold_ms - HOLD_TRIM_MS))


_n = [0]


def step(page, text, hold_ms=1800):
    _n[0] += 1
    say(page, f"{_n[0]}. {text}", hold_ms)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400, typing_delay_ms=90) as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="scratch/fail.png")
            raise


def run(page):
    if True:
        say(page, "VelGenius workshop - how to book a car in", 2500)

        step(page, "Choose Workshop on the login screen")
        page.get_by_text(re.compile(r"^workshop$", re.I)).first.click()

        step(page, "Enter your username and password, then sign in")
        page.get_by_placeholder("Your login username").fill(USER)
        page.locator("input[type=password]").fill(PASSWORD)
        page.get_by_role("button", name=re.compile("Sign In .*")).click()
        say(page, "Signing in - the workspace takes a few seconds to load", 0)
        page.get_by_text(re.compile("loading your workspace", re.I)).wait_for(state="detached", timeout=120000)
        page.wait_for_timeout(1000)

        # The welcome tour auto-opens ~1s after first login on a fresh browser profile
        skip_tour = page.get_by_role("button", name="Skip tour")
        try:
            skip_tour.wait_for(state="visible", timeout=6000)
            say(page, "A welcome tour appears on first login - click Skip tour (replay it later from the sidebar)", 2500)
            skip_tour.click()
            page.wait_for_timeout(800)
        except Exception:
            pass  # tour already seen on this profile

        step(page, "This is the Jobs board - every car in the workshop is a card", 3000)

        step(page, "Click Book In Car")
        page.get_by_role("button", name="Book In Car").first.click()

        step(page, "Type the number plate and click Look Up")
        page.get_by_placeholder("JNJ808L").fill(PLATE)
        page.get_by_role("button", name="Look Up").click()
        say(page, "New plate - no record yet. Returning cars show their history here", 2500)
        page.get_by_role("button", name=re.compile("Create New Job")).click()

        step(page, "Fill in the car and customer details")
        page.get_by_placeholder("e.g. BMW").fill("BMW")
        page.get_by_placeholder("e.g. F30").fill("F30")
        page.get_by_placeholder("e.g. John Smith").fill("John Smith")
        page.get_by_placeholder("+27 82 000 0000").fill("+27 82 555 0123")
        page.get_by_placeholder("e.g. 120000").fill("120000")
        page.get_by_placeholder(re.compile("Check engine light")).fill("Service due, check engine light on")

        step(page, "Save - then take the reference photos")
        page.get_by_role("button", name=re.compile("Save & Take Photos")).click()
        page.wait_for_timeout(1000)

        say(page, "Photos are taken with the phone camera. For this demo we skip them", 2500)
        skip = page.get_by_role("button", name=re.compile(r"^Skip"))
        for _ in range(3):
            if skip.count():
                skip.first.click()
                page.wait_for_timeout(600)
        # After the 3 reference views the Done button may be needed; the modal can also close itself
        done = page.get_by_role("button", name=re.compile(r"^✅ Done"))
        if done.count():
            step(page, "Click Done")
            done.first.click()
        page.wait_for_timeout(1000)

        step(page, "Search the board for the plate to find the new job")
        page.get_by_placeholder(re.compile("Search board")).fill(PLATE)
        page.wait_for_timeout(1000)
        say(page, "The new job sits in the Pending column", 2500)

        step(page, "Click Start when work begins - the job moves to In Progress")
        page.get_by_role("button", name=re.compile("Start")).first.click()
        page.wait_for_timeout(1000)
        say(page, "That's it - the car is booked in and the job is under way", 3500)
        say(page, "", 300)


if __name__ == "__main__":
    sys.exit(main())
