"""Tutorial video: create a customer booking link and share it.

    python tutorial_booking_link.py   (use the 64-bit Python that has playwright)

The wsdemo profile must NOT have a booking link yet (booking_token is null), because the video
clicks "Generate Booking Link". The click writes a new random code to the live database; reset
booking_token to null on the wsdemo workshop_profiles row (id 24) before re-recording.
Needs the dev server on :3000.
"""

import re
import sys

from session import tutorial_session
from tutorial_book_in import say, step
from tutorial_common import CAP_TOP_JS, hide_phone, open_bookings, show_phone, sign_in_wsdemo

URL = "http://localhost:3000/"


def run(page):
    page.on("dialog", lambda d: d.accept())  # the app shows a "Link copied!" alert
    say(page, "VelGenius workshop - let customers book online with a link", 3000)
    sign_in_wsdemo(page)
    open_bookings(page)

    gen = page.get_by_role("button", name=re.compile("Generate Booking Link"))
    gen.evaluate("e => e.scrollIntoView({block: 'center'})")
    step(page, "In the Customer Booking Link box, click Generate Booking Link")
    gen.click()
    link_code = page.locator("code", has_text="wsbooking").first
    link_code.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(800)
    link = link_code.inner_text()

    step(page, "Your link is ready. Click Copy - on a phone, Share sends it by WhatsApp or SMS", 3000)
    page.get_by_role("button", name=re.compile("Copy")).first.click()
    page.wait_for_timeout(1200)
    say(page, "Link copied - paste it into a message, your website or a QR code", 2500)

    step(page, "The customer opens the link on their phone", 2000)
    frame = show_phone(page, link, "What the customer sees on their phone")
    frame.get_by_text(re.compile("Scan Your Licence Disc")).wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1500)
    page.evaluate(CAP_TOP_JS, True)
    step(page, "They scan their licence disc with the camera, or pick a photo from the gallery - no typing needed", 4000)
    step(page, "Then they add a few details and choose a date, and the booking is sent to you", 3500)
    hide_phone(page)
    page.evaluate(CAP_TOP_JS, False)

    page.get_by_text(re.compile("Bookings \\(")).first.evaluate("e => e.scrollIntoView({block: 'start'})")
    page.wait_for_timeout(600)
    step(page, "Their bookings appear in this list - confirm each one when you are ready", 3500)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400,
                          typing_delay_ms=70, locale="en-GB", viewport=(1280, 800)) as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_booking_link.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
