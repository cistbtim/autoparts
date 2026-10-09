"""Tutorial video: link parts to many similar vehicles at once (Vehicle Management).

    python tutorial_vehicle_linking.py   (use the 64-bit Python that has playwright)

Read-only: signs in with the shared read-only DEMO staff account (demo / 12345), whose writes are
blocked, so nothing is saved to the database (the screen still updates, which is what the video
shows). Needs the dev server on :3000.
"""

import re
import sys

from session import tutorial_session
from tutorial_book_in import say, step
from cursor_overlay import move_to, pulse

URL = "http://localhost:3000/"
MAKE = "BMW"
SEARCH = "f30"


def click_text(page, locator, hold=600):
    """Glide the fake cursor to the element, then click it."""
    box = locator.bounding_box()
    if box:
        move_to(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        pulse(page)
    locator.click()
    page.wait_for_timeout(hold)


def sign_in_demo(page):
    step(page, "Sign in as a staff user")
    page.get_by_role("button", name=re.compile("Team & Partners", re.I)).click()
    page.wait_for_timeout(600)
    page.get_by_text(re.compile(r"^Staff$", re.I)).first.click()
    page.get_by_placeholder("Username").fill("demo")
    page.locator("input[type=password]").fill("12345")
    page.get_by_role("button", name=re.compile("Sign In")).click()
    say(page, "Signing in - the catalogue takes a few seconds to load", 0)
    page.get_by_text(re.compile("loading your workspace|loading", re.I)).first.wait_for(state="detached", timeout=180000)
    page.wait_for_timeout(1500)
    skip = page.get_by_role("button", name="Skip tour")
    try:
        skip.wait_for(state="visible", timeout=4000)
        skip.click()
    except Exception:
        pass


def run(page):
    page.on("dialog", lambda d: d.accept())
    # The shop's default language is set to Chinese: pick English through this browser's own storage
    # (clicking the flag would also write the shop-wide default language to the database).
    page.evaluate("() => localStorage.setItem('ap_lang', 'en')")
    page.reload()
    page.wait_for_timeout(2500)
    say(page, "VelGenius - link one part to every variant of a car at once", 3200)
    sign_in_demo(page)

    step(page, "Open Vehicle Management in the sidebar", 2200)
    click_text(page, page.get_by_text(re.compile(r"^(Vehicles|Vehicle Management)$")).first, 1500)

    step(page, f"Pick the make - {MAKE}", 1800)
    click_text(page, page.get_by_text(re.compile(rf"^{MAKE}$")).first, 1500)

    step(page, f"Search the model - type {SEARCH.upper()} to see all its variants", 2200)
    page.get_by_placeholder(re.compile(r"^Search in ")).fill(SEARCH)
    page.wait_for_timeout(1800)
    say(page, "These are the F30 variants - they share most of their parts", 2800)

    # ── Part 1: copy parts from a sibling ────────────────────────────────
    step(page, "A new variant has few parts? Click Copy on it - here, the Sport Line", 3200)
    # The list is in a fixed order (Standard, Sport Line, M3, Fog Lamp): the 2nd row is the Sport Line.
    click_text(page, page.get_by_role("button", name=re.compile(r"^📋 Copy$")).nth(1), 1500)

    step(page, "Choose the vehicle to copy from - the same-family variants are listed first", 3200)
    click_text(page, page.locator(".overlay").last.get_by_role("button", name=re.compile("F30 3 SERIES STANDARD", re.I)).first, 1800)

    step(page, "It shows how many parts will be added, and which are already linked", 3500)
    step(page, "Untick anything that does not fit this variant - or use All / None", 3200)
    link_btn = page.locator(".overlay").last.get_by_role("button", name=re.compile(r"^📋 Link \d+ part"))
    step(page, "Then click Link - all the parts are added in one go", 3000)
    click_text(page, link_btn.first, 2200)
    say(page, "Done - the Sport Line now has the same parts (demo account: nothing is saved)", 3200)

    # ── Part 2: link one part to every variant ───────────────────────────
    step(page, "Linking a single part to several variants? Open Link Part on any of them", 3200)
    click_text(page, page.get_by_role("button", name=re.compile(r"Link Part")).nth(0), 1800)

    step(page, "The other variants are ticked automatically - untick the ones the part does not fit", 4200)
    step(page, "Search for the part, for example brake pad", 2200)
    page.locator(".overlay").last.get_by_placeholder(re.compile("Search part name")).fill("brake pad")
    page.wait_for_timeout(1800)

    step(page, "Tick several parts to link them together, or press Link on one part", 3500)
    boxes = page.locator(".overlay").last.locator("input[type=checkbox]")
    n_boxes = boxes.count()
    first_part = None
    for i in range(n_boxes):
        b = boxes.nth(i)
        # skip the variant tick-boxes at the top: part rows come after the search field
        if b.evaluate("e => !!e.closest('div[style*=\"border-radius: 8px\"]')"):
            first_part = b
            break
    if first_part is not None:
        click_text(page, first_part, 900)
    bottom = page.locator(".overlay").last.get_by_role("button", name=re.compile(r"^🔗 Link \d+ selected"))
    try:
        bottom.wait_for(state="visible", timeout=3000)
        step(page, "One button links every ticked part to every ticked variant", 3200)
        click_text(page, bottom.first, 2200)
    except Exception:
        link_one = page.locator(".overlay").last.get_by_role("button", name=re.compile(r"^🔗 Link")).first
        click_text(page, link_one, 2200)

    say(page, "The link counts on every variant go up together - far less clicking", 3500)
    say(page, "", 300)


def main():
    with tutorial_session(start_url=URL, output_dir="videos", pace_ms=400, headless=True,
                          typing_delay_ms=70, locale="en-GB", viewport=(1280, 800)) as page:
        try:
            run(page)
        except Exception:
            page.screenshot(path="fail_vehicle_linking.png")
            raise


if __name__ == "__main__":
    sys.exit(main())
