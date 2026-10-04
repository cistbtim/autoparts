"""Tutorial video: parts + labour quotation -> send for approval -> customer approves
-> invoice -> payment.

    python tutorial_quotation.py [plate]   (use the 64-bit Python that has playwright)

Runs on the wsdemo job for the plate (default DEMO128GP, a GWM Wingle 5 for Sarah Jones).
Each run writes REAL rows to the live database: stock item(s), job items, a quote, an invoice
and a payment. To re-record, first delete: the job's items/quote/invoice, the antifreeze stock
row (the video creates it), and reset the job status. The oil stock item must exist (the video
finds it by search). The customer's approval page is shown inside a phone-shaped overlay on the
same page, so it ends up in the one recording. Needs the dev server on :3000.
"""

import re
import sys

from cursor_overlay import move_to, pulse
from session import tutorial_session
from tutorial_book_in import say, step

URL = "http://localhost:3000/"
PLATE = sys.argv[1] if len(sys.argv) > 1 else "DEMO128GP"

PHONE_JS = """
(url) => {
  const o = document.createElement('div');
  o.id = 'cust-overlay';
  o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.74);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px';
  o.innerHTML = '<div style="color:#fff;font:700 15px sans-serif">What the customer sees on their phone</div>' +
    '<div style="width:390px;height:660px;border:10px solid #111;border-radius:34px;overflow:hidden;background:#000;box-shadow:0 10px 40px rgba(0,0,0,.6)">' +
    '<iframe id="cust-frame" src="' + url + '" style="width:100%;height:100%;border:0"></iframe></div>';
  document.body.appendChild(o);
}
"""
CAP_TOP_JS = """
(top) => { const e = document.getElementById('tut-caption'); if (e) { e.style.bottom = top ? 'auto' : '28px'; e.style.top = top ? '24px' : 'auto'; } }
"""


def wait_saved(page, button_pattern):
    """Add Part / Add Labour show 'Saving...' for a few seconds; wait until the button is usable again."""
    page.wait_for_timeout(800)
    btn = page.get_by_role("button", name=re.compile(button_pattern)).last
    for _ in range(40):
        try:
            if btn.is_enabled():
                break
        except Exception:
            pass
        page.wait_for_timeout(250)
    page.wait_for_timeout(500)


def open_job(page):
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


def scroll_to(page, locator, block="center"):
    locator.first.evaluate("e => e.scrollIntoView({block: '%s'})" % block)
    page.wait_for_timeout(500)


def run(page):
    say(page, "VelGenius workshop - quote parts and labour, get approval, invoice and payment", 3000)

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

    step(page, "Open the job card, then click Parts Quotation")
    open_job(page)
    later = page.get_by_role("button", name="Later")
    try:
        later.wait_for(state="visible", timeout=5000)
        later.click()
    except Exception:
        pass
    page.wait_for_timeout(600)
    page.get_by_text("Parts Quotation").first.click()
    page.wait_for_timeout(1000)

    # ---------- parts ----------
    step(page, "Click + Part, then search for the part - here, engine oil", 2500)
    page.get_by_role("button", name=re.compile(r"\+ Part")).first.click()
    page.wait_for_timeout(800)
    search = page.get_by_placeholder(re.compile("Search part name"))
    search.fill("oil")
    page.wait_for_timeout(1200)

    step(page, "It is in your workshop stock - click it and set the quantity (4 litres)", 2500)
    page.get_by_text("Engine oil 5W-30 (litre)").first.click()
    page.wait_for_timeout(500)
    page.locator("input[type=number]:visible").first.fill("4")
    page.wait_for_timeout(500)
    page.get_by_role("button", name=re.compile("Add Part")).last.click()
    wait_saved(page, "Add Part")

    step(page, "Not in stock yet? Search, then click Create New Part - it is saved for next time", 3000)
    search.fill("antifreeze")
    page.wait_for_timeout(1200)
    page.get_by_role("button", name=re.compile("Create New Part")).click()
    page.wait_for_timeout(600)
    page.get_by_placeholder("e.g. Oil Filter").fill("Antifreeze coolant (litre)")
    nums = page.locator("input[type=number]:visible")
    nums.nth(0).fill("45")
    nums.nth(1).fill("85")
    page.get_by_role("button", name=re.compile("Create & Select")).click()
    page.wait_for_timeout(1200)

    step(page, "Set the quantity to 2 litres and click Add Part")
    page.locator("input[type=number]:visible").first.fill("2")
    page.wait_for_timeout(500)
    page.get_by_role("button", name=re.compile("Add Part")).last.click()
    wait_saved(page, "Add Part")
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(1000)

    # ---------- labour ----------
    step(page, "Now click + Labour and enter the work and your rate")
    page.get_by_role("button", name=re.compile(r"\+ Labour")).first.click()
    page.wait_for_timeout(800)
    page.get_by_placeholder(re.compile("Labour e.g.")).fill("Oil change and coolant top-up")
    page.locator("input[type=number]:visible").nth(1).fill("350")
    page.wait_for_timeout(500)
    page.get_by_role("button", name=re.compile("Add Labour")).last.click()
    wait_saved(page, "Add Labour")
    page.get_by_role("button", name="Done", exact=True).click()
    page.wait_for_timeout(1000)
    page.get_by_text(re.compile(r"Total: R")).first.evaluate("e => e.scrollIntoView({block: 'center'})")
    step(page, "Parts R610 + labour R350 = R960 - the table adds it up for you", 3000)

    # ---------- quotation ----------
    create_q = page.get_by_role("button", name=re.compile("Create Quotation for Customer"))
    scroll_to(page, create_q)
    step(page, "Click Create Quotation for Customer")
    create_q.click()
    page.wait_for_timeout(1500)
    step(page, "Check the customer, the lines and the dates, then click Create Quote", 2500)
    page.get_by_role("button", name=re.compile("Create Quote$")).last.click()
    page.get_by_text(re.compile("Awaiting customer response")).first.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1000)

    # ---------- approval link ----------
    send_appr = page.get_by_role("button", name=re.compile("Send for Approval")).first
    scroll_to(page, send_appr)
    step(page, "Click Send for Approval - the customer approves online, no login needed")
    send_appr.click()
    page.wait_for_timeout(1000)
    # A default deposit message is pre-filled; clear it so approving needs only the terms tick
    page.get_by_placeholder(re.compile("deposit")).fill("")
    page.wait_for_timeout(500)
    page.get_by_role("button", name=re.compile("Generate Approval Link")).click()
    link_input = page.locator("input[value*='wsq=']").first
    link_input.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(800)
    link = link_input.input_value()
    step(page, "This is the approval link - copy it, or send it to the customer by WhatsApp", 3500)
    page.get_by_role("button", name=re.compile("Preview link")).first.hover()
    page.wait_for_timeout(600)

    # ---------- customer approves (phone overlay) ----------
    step(page, "The customer opens the link on their phone", 2000)
    page.evaluate(PHONE_JS, link)
    frame = page.frame_locator("#cust-frame")
    frame.get_by_text(re.compile("Workshop Quotation Approval")).wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1500)
    step(page, "They see every line and the total, and can download a PDF", 3000)
    frame.get_by_text(re.compile("Approve & Confirm")).first.evaluate("e => e.scrollIntoView({block: 'center'})")
    page.wait_for_timeout(800)
    page.evaluate(CAP_TOP_JS, True)
    step(page, "They tick the terms box and click Approve & Confirm")
    frame.locator("input[type=checkbox]").last.click()
    page.wait_for_timeout(500)
    frame.get_by_role("button", name=re.compile("Approve")).click()
    frame.get_by_text(re.compile("Quotation Approved")).wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1000)
    step(page, "Done - the customer sees a confirmation", 2000)
    page.evaluate("() => document.getElementById('cust-overlay')?.remove()")
    page.evaluate(CAP_TOP_JS, False)
    page.wait_for_timeout(600)

    # ---------- result in the quotation ----------
    # Close the approval window, then refresh the quotation (fall back to reopening Parts Quotation).
    # Always scope the close button to the topmost window - the table rows have red x buttons too.
    def close_top():
        page.locator(".overlay").last.get_by_role("button", name="✕", exact=True).first.click()
        page.wait_for_timeout(800)

    close_top()
    approved = page.get_by_text(re.compile("Customer Approved this quotation"))
    try:
        # the quotation card has its own small refresh button
        page.locator(".overlay").last.locator("button:has-text('🔄')").last.click()
        approved.first.wait_for(state="visible", timeout=10000)
    except Exception:
        close_top()
        page.get_by_text("Parts Quotation").first.click()
        page.wait_for_timeout(1500)
    approved.first.wait_for(state="visible", timeout=30000)
    scroll_to(page, approved)
    step(page, "Back in the workshop, the quotation shows Customer Approved, with the date and time", 3500)

    # ---------- invoice ----------
    accept = page.get_by_role("button", name=re.compile("Mark Accepted")).first
    scroll_to(page, accept)
    step(page, "Click Mark Accepted")
    accept.click()
    convert = page.get_by_role("button", name=re.compile("Convert to Invoice")).first
    convert.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(800)
    step(page, "Then click Convert to Invoice - everything is pre-filled from the quotation")
    convert.click()
    page.wait_for_timeout(1500)
    step(page, "Check the details and click Create Invoice", 2000)
    page.get_by_role("button", name=re.compile("Create Invoice")).first.click()
    page.get_by_role("button", name=re.compile("Record Payment")).first.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(1000)

    # ---------- payment ----------
    pay = page.get_by_role("button", name=re.compile("Record Payment")).first
    scroll_to(page, pay)
    step(page, "The invoice is created. When the customer pays, click Record Payment")
    pay.click()
    page.wait_for_timeout(1200)
    step(page, "The amount, method and date are filled in - change them if needed, then Confirm Payment", 3000)
    page.get_by_role("button", name=re.compile("Confirm Payment")).click()
    paid = page.get_by_text(re.compile("Fully Paid")).first
    paid.wait_for(state="visible", timeout=30000)
    scroll_to(page, paid)
    page.evaluate(CAP_TOP_JS, True)
    step(page, "Fully Paid - quote, invoice and payment are all done", 4000)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400,
                          typing_delay_ms=70, locale="en-GB", viewport=(1280, 800)) as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_quotation.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
