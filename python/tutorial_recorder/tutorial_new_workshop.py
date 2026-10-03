"""Tutorial video: sign up a brand-new workshop, confirm its location, skip the
welcome tour, then add a booking.

    python tutorial_new_workshop.py [username]   (use the 64-bit Python that has playwright)

Creates a REAL workshop account (and a booking) on the live database, so pass
a fresh username each time. Needs the dev server on :3000.
"""

import re
import sys
import time

from session import tutorial_session
from tutorial_book_in import say, step

URL = "http://localhost:3000/?ref=9"
USERNAME = sys.argv[1] if len(sys.argv) > 1 else f"demo_ws_{int(time.time()) % 100000}"
PASSWORD = "demo1234"
WORKSHOP = "Sunrise Auto Care"


def run(page):
    say(page, "VelGenius - set up a new workshop and take your first booking", 2800)

    step(page, "Open the sign-up form (a referral link goes straight to it)", 2200)

    step(page, "Enter the workshop name, a username and a password")
    page.get_by_placeholder("e.g. ABC Auto Workshop").fill(WORKSHOP)
    page.get_by_placeholder("Choose a login username").fill(USERNAME)
    pw = page.locator("input[type=password]")
    pw.nth(0).fill(PASSWORD)
    pw.nth(1).fill(PASSWORD)
    page.get_by_placeholder("+27...").fill("+27 82 555 0199")

    step(page, "Confirm the location - click Auto-detect, then check the City and Country", 1500)
    page.get_by_role("button", name=re.compile("Auto-detect")).click()
    city, country = page.get_by_placeholder("City"), page.get_by_placeholder("Country")
    # Wait for the lookup to land (up to 20s) so a late result can't overwrite a typed fallback
    for _ in range(40):
        page.wait_for_timeout(500)
        if city.input_value().strip() and country.input_value().strip():
            break
    page.wait_for_timeout(1000)
    if not city.input_value().strip() or not country.input_value().strip():
        say(page, "Detection unavailable - type your City and Country instead", 1500)
        city.fill("Cape Town")
        country.fill("South Africa")
    print("Location:", city.input_value(), "/", country.input_value())
    say(page, f"Location: {city.input_value()}, {country.input_value()} - correct it if it is wrong", 3500)

    step(page, "Start the free trial")
    page.locator("button.btn-primary").last.click()
    say(page, "Creating your workshop - the workspace takes a few seconds to load", 0)
    page.get_by_text(re.compile("loading your workspace", re.I)).wait_for(state="detached", timeout=120000)

    skip_tour = page.get_by_role("button", name="Skip tour")
    skip_tour.wait_for(state="visible", timeout=15000)
    step(page, "A welcome tour appears for new workshops - click Skip tour", 2500)
    skip_tour.click()
    page.wait_for_timeout(800)

    step(page, "Open Bookings in the sidebar")
    page.get_by_text(re.compile(r"^Bookings$")).first.click()
    page.wait_for_timeout(1500)

    step(page, "Click + Booking to add a phone or walk-in booking")
    page.get_by_role("button", name=re.compile(r"\+ Booking")).click()

    step(page, "Fill in the customer, car and reason for the visit")
    page.get_by_placeholder("Customer name *").fill("John Smith")
    page.get_by_placeholder("Phone *").fill("+27 82 555 0123")
    page.get_by_placeholder("Vehicle reg").fill("DEMO200GP")
    page.locator("input[type=date]").fill("2026-10-08")
    page.get_by_placeholder("Make").fill("BMW")
    page.get_by_placeholder("Model").fill("F30")
    page.get_by_placeholder("Complaint / reason for visit").fill("Full service and brake check")

    step(page, "Click Save Booking")
    page.get_by_role("button", name=re.compile("Save Booking")).click()
    page.wait_for_timeout(2500)
    step(page, "The booking is saved - confirm it when the customer is ready to come in", 3500)
    say(page, "", 300)


def main():
    print("Username:", USERNAME, "Password:", PASSWORD)
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=700,
                          typing_delay_ms=90, locale="en-GB") as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_new_workshop.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
