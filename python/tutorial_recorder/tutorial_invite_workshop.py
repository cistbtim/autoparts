"""Tutorial video: invite another workshop with your personal link.

    python tutorial_invite_workshop.py   (use the 64-bit Python that has playwright)

Read-only: nothing is written to the database (the invited workshop's sign-up form is shown but
never submitted). Needs the dev server on :3000.
"""

import re
import sys

from session import tutorial_session
from tutorial_book_in import say, step
from tutorial_common import CAP_TOP_JS, hide_phone, open_bookings, show_phone, sign_in_wsdemo

URL = "http://localhost:3000/"


def run(page):
    page.on("dialog", lambda d: d.accept())  # the app shows a "Link copied!" alert
    say(page, "VelGenius workshop - invite another workshop and get the credit", 3000)
    sign_in_wsdemo(page)
    open_bookings(page)

    invite = page.get_by_text("Invite Another Workshop").first
    invite.evaluate("e => e.scrollIntoView({block: 'center'})")
    page.wait_for_timeout(500)
    step(page, "Find Invite Another Workshop - this is your personal invite link", 3000)
    link = page.locator("code", has_text="?ref=").first.inner_text()

    step(page, "Click Copy, or Share on a phone, and send it to the other workshop owner", 3000)
    page.get_by_role("button", name=re.compile("Copy")).last.click()
    page.wait_for_timeout(1200)

    step(page, "When they open your link, they go straight to the sign-up form", 2500)
    # The phone shows the page as a brand-new visitor. Same browser storage would sign it in as wsdemo,
    # so load it from the equivalent [::1] address (a different origin = separate storage, signed out).
    visitor_url = link.replace("//localhost:3000", "//[::1]:3000")
    frame = show_phone(page, visitor_url, "What the other workshop owner sees")
    frame.get_by_text(re.compile("Start Free Trial")).wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1500)
    page.evaluate(CAP_TOP_JS, True)
    step(page, "They fill in their workshop details and start their 30-day free trial", 3500)
    hide_phone(page)
    page.evaluate(CAP_TOP_JS, False)

    page.wait_for_timeout(500)
    step(page, "When they sign up with your link, the system records that they came from you", 4000)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400,
                          typing_delay_ms=70, locale="en-GB", viewport=(1280, 800)) as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_invite_workshop.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
