"""Tutorial recording session: wraps a Playwright page so that any recorded
script (e.g. the output of `playwright codegen`) gets, for free:

  - a visible fake cursor that glides to each element before clicking it
  - human-paced, character-by-character typing instead of instant field fills
  - a short pause after every action, for a watchable pace
  - a video recording of the whole session (webm, converted to mp4 if
    ffmpeg is available on PATH)

Usage — record once with record.py, then paste the generated lines into
a `with tutorial_session(...) as page:` block unmodified. See
example_tutorial.py for a full example.
"""

import shutil
import subprocess
import urllib.request
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import Locator, sync_playwright

from cursor_overlay import install_cursor, move_to, pulse

# Vite tries 5173 first and climbs one port at a time whenever the previous
# one is already taken by another running dev server.
COMMON_DEV_PORTS = range(5173, 5183)


def find_dev_server(ports=COMMON_DEV_PORTS, host="localhost"):
    """Returns the first http://host:port that responds, or None. Saves
    having to check the terminal for which port Vite actually picked."""
    for port in ports:
        url = f"http://{host}:{port}/"
        try:
            urllib.request.urlopen(url, timeout=0.5)
            return url
        except Exception:
            continue
    return None


def _bounding_center(page, selector):
    try:
        box = page.locator(selector).first.bounding_box()
    except Exception:
        box = None
    if not box:
        return None
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def _instrument(page, pace_ms, typing_delay_ms):
    orig_click = page.click
    orig_fill = page.fill
    orig_press = page.keyboard.press

    def click(selector, *args, **kwargs):
        center = _bounding_center(page, selector)
        if center:
            move_to(page, *center)
            pulse(page)
        result = orig_click(selector, *args, **kwargs)
        page.wait_for_timeout(pace_ms)
        return result

    def fill(selector, value, *args, **kwargs):
        center = _bounding_center(page, selector)
        if center:
            move_to(page, *center)
            pulse(page)
        page.locator(selector).first.click()
        page.locator(selector).first.press("Control+A")
        page.keyboard.press("Delete")
        page.keyboard.type(value, delay=typing_delay_ms)
        page.wait_for_timeout(pace_ms)

    def key_press(key, *args, **kwargs):
        result = orig_press(key, *args, **kwargs)
        page.wait_for_timeout(pace_ms)
        return result

    page.click = click
    page.fill = fill
    page.keyboard.press = key_press


_locator_patched = False
_orig_locator_click = Locator.click
_orig_locator_fill = Locator.fill


def _instrument_locators(pace_ms, typing_delay_ms):
    """Patches the Locator class itself (not a specific page/locator
    instance), since `playwright codegen`'s default Python output almost
    always uses locator chains — page.get_by_placeholder(...).fill(...),
    page.get_by_role(...).click() — rather than page.click(selector).
    Global for the process lifetime, which is fine: each replay run is its
    own one-shot subprocess."""
    global _locator_patched
    if _locator_patched:
        return
    _locator_patched = True

    def click(self, *args, **kwargs):
        box = self.bounding_box()
        if box:
            move_to(self.page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            pulse(self.page)
        result = _orig_locator_click(self, *args, **kwargs)
        self.page.wait_for_timeout(pace_ms)
        return result

    def fill(self, value, *args, **kwargs):
        box = self.bounding_box()
        if box:
            move_to(self.page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            pulse(self.page)
        _orig_locator_click(self)
        self.page.keyboard.press("Control+A")
        self.page.keyboard.press("Delete")
        self.page.keyboard.type(value, delay=typing_delay_ms)
        self.page.wait_for_timeout(pace_ms)

    Locator.click = click
    Locator.fill = fill


def _convert_to_mp4(webm_path: Path) -> Path | None:
    if not shutil.which("ffmpeg"):
        return None
    mp4_path = webm_path.with_suffix(".mp4")
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(webm_path), "-pix_fmt", "yuv420p", str(mp4_path)],
        check=True, capture_output=True,
    )
    return mp4_path


@contextmanager
def tutorial_session(
    start_url: str = None,
    output_dir: str = "videos",
    headless: bool = False,
    viewport=(1280, 800),
    pace_ms: int = 400,
    typing_delay_ms: int = 60,
):
    """Yields a Playwright `page` already navigated to `start_url`, with
    cursor highlighting + human-paced typing + video recording wired up.
    Closing the `with` block finalizes and prints the video path.

    Leave `start_url` as None to auto-detect the dev server's port (Vite
    picks a new one each time 5173+ is already taken) instead of hardcoding
    it and hitting ERR_CONNECTION_REFUSED once it drifts."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    if start_url is None:
        start_url = find_dev_server()
        if start_url is None:
            raise RuntimeError(
                "No dev server found on localhost:5173-5182 — start it first "
                "with `npm run dev`, then re-run this."
            )
        print(f"Using dev server: {start_url}")

    with sync_playwright() as pw:
        # Drop Playwright's automation banner flags: --enable-automation sets
        # navigator.webdriver = true, which makes Cloudflare-protected sites
        # (e.g. partsouq.com) loop the "Verify you are human" check forever
        # even when a real person clicks it.
        browser = pw.chromium.launch(
            headless=headless, channel="chrome",
            ignore_default_args=["--enable-automation"],
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            record_video_dir=str(out),
            record_video_size={"width": viewport[0], "height": viewport[1]},
            viewport={"width": viewport[0], "height": viewport[1]},
        )
        # Pre-approve geolocation for the dev server so the native permission
        # bubble never blocks a replay — this fresh profile has no saved
        # site permissions the way a real day-to-day Chrome profile would.
        context.grant_permissions(["geolocation"], origin=start_url.rstrip("/"))
        page = context.new_page()
        install_cursor(page)
        _instrument(page, pace_ms, typing_delay_ms)
        _instrument_locators(pace_ms, typing_delay_ms)
        try:
            page.goto(start_url)
        except Exception as e:
            if "ERR_CONNECTION_REFUSED" in str(e):
                context.close()
                browser.close()
                raise RuntimeError(
                    f"Couldn't reach {start_url} — is `npm run dev` still running? "
                    "Leave start_url as None (the default) to auto-detect its port instead."
                ) from None
            raise
        page.wait_for_timeout(pace_ms)

        try:
            yield page
        finally:
            video = page.video
            context.close()
            browser.close()
            if video:
                webm_path = Path(video.path())
                print(f"Recorded: {webm_path}")
                mp4_path = _convert_to_mp4(webm_path)
                if mp4_path:
                    print(f"Converted: {mp4_path}")
                else:
                    print("ffmpeg not found on PATH — leaving .webm as-is "
                          "(install ffmpeg to auto-convert to .mp4)")
