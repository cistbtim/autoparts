"""Tutorial video: track a mechanic's time, record technician pay per labour item, see the job profit.

    python tutorial_time_profit.py [plate]   (use the 64-bit Python that has playwright)

Uses the wsdemo job for the plate (default DEMO128GP, which needs a labour line). Writes REAL rows
to the live database: ws_time_entries and ws_labour_pay. Delete the rows for that job before
re-recording. Needs the dev server on :3000.
"""

import re
import sys

from session import tutorial_session
from tutorial_book_in import say, step
from tutorial_common import close_top_modal, open_job, sign_in_wsdemo

URL = "http://localhost:3000/"
PLATE = sys.argv[1] if len(sys.argv) > 1 else "DEMO128GP"
MECHANIC = "Sipho"


def scroll_center(locator):
    locator.first.evaluate("e => e.scrollIntoView({block: 'center'})")


def run(page):
    say(page, "VelGenius workshop - mechanic time, technician pay and job profit", 3000)
    sign_in_wsdemo(page)
    open_job(page, PLATE)

    card = page.get_by_text("Time & profit").first
    scroll_center(card)
    page.wait_for_timeout(600)
    step(page, "On the job, click Time & profit", 2500)
    card.click()
    page.wait_for_timeout(1200)

    step(page, "Type the mechanic's name and click Start timer", 2500)
    name = page.locator("input[placeholder='Name']").first
    name.fill(MECHANIC)
    page.get_by_role("button", name=re.compile("Start timer")).click()
    page.get_by_text(re.compile("is working")).first.wait_for(state="visible", timeout=30000)
    step(page, "The clock runs while the mechanic works - several mechanics can have their own timer", 4500)

    step(page, "Click Stop timer when the work is done")
    page.get_by_role("button", name=re.compile("Stop timer")).click()
    page.wait_for_timeout(2000)

    step(page, "Forgot the timer? Add the time by hand", 2500)
    hours = page.locator("input[type=number]:visible").nth(0)
    minutes = page.locator("input[type=number]:visible").nth(1)
    hours.fill("1")
    minutes.fill("15")
    page.get_by_role("button", name="+ Add", exact=True).last.click()
    page.wait_for_timeout(2200)

    pay_title = page.get_by_text("Technician pay (per labour item)").first
    scroll_center(pay_title)
    page.wait_for_timeout(500)
    step(page, "Technician pay: for each labour item, choose who did it and type what you pay them", 3500)
    page.get_by_placeholder("Technician").first.fill(MECHANIC)
    page.get_by_placeholder("Pay").first.fill("120")
    page.wait_for_timeout(800)
    step(page, "You can see straight away how much you keep on that item", 2500)

    save = page.get_by_role("button", name=re.compile("Save technician pay"))
    step(page, "Click Save technician pay")
    save.click()
    page.wait_for_timeout(2500)

    profit = page.get_by_text("Job profit").first
    scroll_center(profit)
    page.wait_for_timeout(600)
    step(page, "Job profit: sales minus parts cost minus technician pay, plus what an hour of labour earns", 5000)

    close_top_modal(page)
    step(page, "The Report page adds it all up. Open Admin, then WS Report")
    page.get_by_text("Admin").first.click()
    page.wait_for_timeout(600)
    page.get_by_text(re.compile("WS Report")).first.click()
    page.get_by_text("Job profit & mechanic performance").first.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1500)
    section = page.get_by_text("Job profit & mechanic performance").first
    section.evaluate("e => e.scrollIntoView({block: 'start'})")
    page.wait_for_timeout(800)
    step(page, "Choose a period to see total profit, each mechanic's hours and pay, and your best jobs", 5000)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400,
                          typing_delay_ms=70, locale="en-GB", viewport=(1280, 800)) as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_time_profit.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
