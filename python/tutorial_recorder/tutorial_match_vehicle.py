"""Tutorial video: match a job's car to a car in the vehicle database.

    python tutorial_match_vehicle.py [plate]   (use the 64-bit Python that has playwright)

Needs a wsdemo job for the plate whose model is NOT yet a vehicle-database
code (e.g. booked in as BMW "F30"), otherwise it already shows as linked.
The match is saved to that job on the live database. Needs the dev server on :3000.
"""

import re
import sys

from cursor_overlay import move_to, pulse
from session import tutorial_session
from tutorial_book_in import say, step

URL = "http://localhost:3000/"
PLATE = sys.argv[1] if len(sys.argv) > 1 else "DEMO301GP"


def run(page):
    say(page, "VelGenius workshop - match a car to the vehicle database", 2800)

    step(page, "Sign in to the workshop")
    page.get_by_text(re.compile(r"^workshop$", re.I)).first.click()
    page.get_by_placeholder("Your login username").fill("wsdemo")
    page.locator("input[type=password]").fill("demo")
    page.get_by_role("button", name=re.compile("Sign In .*")).click()
    say(page, "Signing in - the workspace takes a few seconds to load", 0)
    page.get_by_text(re.compile("loading your workspace", re.I)).wait_for(state="detached", timeout=120000)

    skip_tour = page.get_by_role("button", name="Skip tour")
    try:
        skip_tour.wait_for(state="visible", timeout=8000)
        say(page, "Skip the welcome tour", 1800)
        skip_tour.click()
        page.wait_for_timeout(800)
    except Exception:
        pass

    step(page, "Find the job - search the board for the plate")
    page.get_by_placeholder(re.compile("Search board")).fill(PLATE)
    page.wait_for_timeout(1500)

    step(page, "Open the job card")
    # The board re-renders constantly, so an element click keeps losing its target:
    # glide to the plate's position and click the screen coordinates instead.
    box = None
    for _ in range(60):
        try:
            box = page.get_by_text(PLATE).first.bounding_box(timeout=1000)
        except Exception:
            box = None
        if box:
            break
        page.wait_for_timeout(250)
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    move_to(page, x, y)
    pulse(page)
    page.mouse.click(x, y)
    later = page.get_by_role("button", name="Later")
    try:
        later.wait_for(state="visible", timeout=5000)
        say(page, "No photos yet - click Later for now", 1800)
        later.click()
    except Exception:
        pass
    page.wait_for_timeout(800)

    link = page.get_by_text(re.compile("Link vehicle to browse")).first
    link.scroll_into_view_if_needed()
    step(page, "The car was booked in as BMW F30 - it is not matched to our vehicle database yet", 3200)
    step(page, "Click Link vehicle")
    link.click()

    step(page, "The database suggests matching vehicles - the closest match is listed first", 3500)
    search = page.get_by_placeholder(re.compile("Search model, code"))
    step(page, "Type the model or code to narrow the list")
    search.fill("F30")
    page.wait_for_timeout(1500)

    step(page, "Tap the right car - compare its photos with the customer's car")
    page.get_by_role("button", name=re.compile("F30 3 SERIES STANDARD")).first.click()
    page.wait_for_timeout(2500)

    step(page, "Click Confirm to link it")
    page.get_by_role("button", name=re.compile("Confirm —")).first.click()
    page.wait_for_timeout(3000)

    linked = page.get_by_text(re.compile("BM091A")).first
    linked.evaluate("e => e.scrollIntoView({block: 'center'})")  # keep it clear of the caption bar
    page.wait_for_timeout(600)
    # The linked card sits at the very bottom of the page, so move the caption to the top
    page.evaluate("() => { const e = document.getElementById('tut-caption'); if (e) { e.style.bottom = 'auto'; e.style.top = '28px'; } }")
    step(page, "Linked! The job now has the vehicle code, so you can browse spare parts for this exact car", 4000)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=700,
                          typing_delay_ms=90, locale="en-GB") as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_match_vehicle.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
