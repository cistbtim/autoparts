"""Shared pieces for the tutorial recording scripts."""

import re

from cursor_overlay import move_to, pulse
from tutorial_book_in import say, step

PHONE_JS = """
(args) => {
  const o = document.createElement('div');
  o.id = 'cust-overlay';
  o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.74);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px';
  o.innerHTML = '<div style="color:#fff;font:700 15px sans-serif">' + args.label + '</div>' +
    '<div style="width:390px;height:660px;border:10px solid #111;border-radius:34px;overflow:hidden;background:#000;box-shadow:0 10px 40px rgba(0,0,0,.6)">' +
    '<iframe id="cust-frame" src="' + args.url + '" style="width:100%;height:100%;border:0"></iframe></div>';
  document.body.appendChild(o);
}
"""

CAP_TOP_JS = """
(top) => { const e = document.getElementById('tut-caption'); if (e) { e.style.bottom = top ? 'auto' : '28px'; e.style.top = top ? '24px' : 'auto'; } }
"""


def sign_in_wsdemo(page):
    """Sign in as the wsdemo workshop and skip the welcome tour if it appears."""
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


def open_bookings(page):
    step(page, "Open Bookings in the sidebar")
    page.get_by_text(re.compile(r"^Bookings$")).first.click()
    page.wait_for_timeout(1500)


def show_phone(page, url, label):
    """Show a page inside a phone-shaped overlay so it ends up in the same recording."""
    page.evaluate(PHONE_JS, {"url": url, "label": label})
    return page.frame_locator("#cust-frame")


def hide_phone(page):
    page.evaluate("() => document.getElementById('cust-overlay')?.remove()")


def open_job(page, plate):
    """Search the board for the plate and open its job card (click by position: the board re-renders constantly)."""
    step(page, "Find the job - search the board for the plate")
    page.get_by_placeholder(re.compile("Search board")).fill(plate)
    page.wait_for_timeout(1000)
    step(page, "Open the job card")
    box = None
    for _ in range(60):
        try:
            box = page.get_by_text(plate).first.bounding_box(timeout=1000)
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
        later.click()
    except Exception:
        pass
    page.wait_for_timeout(800)


def close_top_modal(page):
    """Close the topmost pop-up (scoped to it, because table rows have their own red x buttons)."""
    page.locator(".overlay").last.get_by_role("button", name="✕", exact=True).first.click()
    page.wait_for_timeout(800)
