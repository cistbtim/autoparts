"""Tutorial video: send a parts quotation request from a job to a supplier.

    python tutorial_supplier_quote.py [plate]   (use the 64-bit Python that has playwright)

Uses the wsdemo job for the plate (default DEMO127GP). Each run writes REAL rows to the live
database: two part lines on the job, one supplier request, and the job moves to Quoting. Undo
them before re-recording. A fake phone number is used on purpose, so no real supplier is
contacted (the WhatsApp tab that "Send via WhatsApp" opens is closed straight away).
Needs the dev server on :3000.
"""

import re
import sys

from cursor_overlay import move_to, pulse
from session import tutorial_session
from tutorial_book_in import say, step

URL = "http://localhost:3000/"
PLATE = sys.argv[1] if len(sys.argv) > 1 else "DEMO127GP"
FAKE_PHONE = "+27 83 000 0000"


def run(page):
    say(page, "VelGenius workshop - send a parts quotation request to a supplier", 2800)

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
    page.wait_for_timeout(1000)

    step(page, "Open the job card")
    # The board re-renders constantly, so click the plate's screen position instead of the element.
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

    step(page, "Click Parts Quotation")
    page.get_by_text("Parts Quotation").first.click()
    page.wait_for_timeout(1000)

    step(page, "Click Send Quote to ask a supplier for prices")
    page.get_by_role("button", name=re.compile("Send Quote")).first.click()
    page.wait_for_timeout(1000)

    step(page, "Type each part you need and press Enter - it is added to the job too", 2500)
    extra = page.get_by_placeholder(re.compile("Type extra part name"))
    for part in ("Front brake pad set", "Front brake discs (pair)"):
        extra.fill(part)
        extra.press("Enter")
        page.wait_for_timeout(700)

    step(page, "Choose a supplier from your list, or type a phone number", 2500)
    page.get_by_placeholder(re.compile("Or enter phone number")).fill(FAKE_PHONE)
    page.wait_for_timeout(1500)

    step(page, "Add a note if it is urgent (optional)")
    page.get_by_placeholder(re.compile("Urgent")).fill("Urgent - needed by tomorrow morning")

    send = page.get_by_text(re.compile("Send via WhatsApp")).first
    send.evaluate("e => e.scrollIntoView({block: 'center'})")
    step(page, "The message is ready: car, plate and the parts list. The supplier also gets a link to reply with prices", 3500)

    step(page, "Click Send via WhatsApp")
    try:
        with page.context.expect_page(timeout=6000) as popup:
            send.click()
        popup.value.close()  # don't leave the WhatsApp tab open
    except Exception:
        pass
    page.wait_for_timeout(1500)

    sent = page.get_by_role("button", name=re.compile("Enter Quote")).first
    sent.evaluate("e => e.scrollIntoView({block: 'center'})")
    page.evaluate("() => { const e = document.getElementById('tut-caption'); if (e) { e.style.bottom = 'auto'; e.style.top = '28px'; } }")
    step(page, "The request is saved here and the job moves to Quoting. When the supplier replies, enter or review their price", 4000)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400,
                          typing_delay_ms=90, locale="en-GB") as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_supplier_quote.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
