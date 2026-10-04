"""Tutorial video: set a next-service reminder and send it to the customer on WhatsApp.

    python tutorial_service_reminders.py [plate]   (use the 64-bit Python that has playwright)

Uses the wsdemo job for the plate (default DEMO128GP). Writes one reminder row to the live database
(ws_service_reminders) and marks it sent / done; delete that row before re-recording. The WhatsApp
tab the button opens is closed straight away - nothing is sent. Needs the dev server on :3000.
"""

import re
import sys

from session import tutorial_session
from tutorial_book_in import say, step
from tutorial_common import close_top_modal, open_job, sign_in_wsdemo

URL = "http://localhost:3000/"
PLATE = sys.argv[1] if len(sys.argv) > 1 else "DEMO128GP"


def close_popups(page):
    """Close any extra browser tab (the WhatsApp page) that a button opened."""
    for p in page.context.pages[1:]:
        try:
            p.close()
        except Exception:
            pass


def run(page):
    say(page, "VelGenius workshop - bring customers back for their next service", 3000)
    sign_in_wsdemo(page)
    open_job(page, PLATE)

    card = page.get_by_text("Next service reminder").first
    card.evaluate("e => e.scrollIntoView({block: 'center'})")
    page.wait_for_timeout(600)
    step(page, "At the bottom of the job, click Next service reminder", 2500)
    card.click()
    page.wait_for_timeout(1000)

    step(page, "Choose when the customer should come back - click +6 months, or pick any date", 2500)
    page.get_by_role("button", name=re.compile(r"\+6 months")).click()
    page.wait_for_timeout(600)

    step(page, "Or use the mileage - the car is at 88,000 km now, so click +10,000", 2500)
    page.get_by_role("button", name=re.compile(r"\+10,000")).click()
    page.wait_for_timeout(600)

    step(page, "The customer's name and phone are filled in. Add a note if you like", 2500)
    page.get_by_placeholder(re.compile("Full service")).fill("Full service + brake fluid")
    page.wait_for_timeout(500)

    step(page, "Click Save reminder")
    page.get_by_role("button", name=re.compile("Save reminder")).click()
    page.get_by_text(re.compile(r"Due \d+ \w+ \d{4}")).first.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1200)

    step(page, "All reminders are in Service Reminders in the sidebar", 2500)
    page.get_by_text("Service Reminders").first.click()
    page.get_by_text(re.compile(r"Upcoming \(\d+\)")).first.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(2000)

    step(page, "They are sorted: overdue first, then the next 30 days, then later", 3000)
    page.wait_for_timeout(500)

    send = page.locator(".card").get_by_role("button", name=re.compile("WhatsApp")).first
    step(page, "When it is time, click WhatsApp - the message to the customer is already written", 3500)
    send.click()
    page.wait_for_timeout(2500)
    close_popups(page)
    page.get_by_text(re.compile("Reminder sent")).first.wait_for(state="visible", timeout=30000)
    step(page, "The reminder is marked as sent, so you know who you have already contacted", 3000)

    step(page, "After the customer has been serviced, click Done")
    page.locator(".card").get_by_role("button", name=re.compile("Done")).first.click()
    page.wait_for_timeout(2000)
    step(page, "Finished reminders move to Done, where you can reopen them if you need to", 3500)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400,
                          typing_delay_ms=70, locale="en-GB", viewport=(1280, 800)) as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_service_reminders.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
