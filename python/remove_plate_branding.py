#!/usr/bin/env python3
"""
remove_plate_branding.py — Remove WeBuyCars branding from vehicle photos.

Fetches vehicle photos from Supabase, detects the orange WeBuyCars logo,
removes it with AI inpainting (LaMa model), re-uploads, and updates Supabase.

Usage:
    python remove_plate_branding.py                  # process all vehicles
    python remove_plate_branding.py --dry-run        # save cleaned images locally, no upload
    python remove_plate_branding.py --preview        # save mask previews to verify detection
    python remove_plate_branding.py --limit=10       # process first 10 vehicles only
    python remove_plate_branding.py --id=12,34,56    # process specific vehicle IDs

Requirements:
    pip install simple-lama-inpainting opencv-python pillow
"""

import base64
import io
import json
import sys
import time
import urllib.request
import urllib.parse
import re
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co"
SUPABASE_KEY = "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW"
PHOTO_FIELDS = ["photo_front", "photo_rear", "photo_side"]
OUTPUT_DIR   = Path("cleaned_photos")

# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_get(path, params=None):
    url = SUPABASE_URL + "/rest/v1/" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_get_all(path, params=None):
    """Paginate through all rows — same as app's fetchAll."""
    PAGE = 1000
    results = []
    offset = 0
    while True:
        p = dict(params or {})
        p["limit"]  = PAGE
        p["offset"] = offset
        page = sb_get(path, p)
        results.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
    return results

def sb_patch(path, params, data):
    url = SUPABASE_URL + "/rest/v1/" + path + "?" + urllib.parse.urlencode(params)
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status

# ── Google Drive helpers ──────────────────────────────────────────────────────

def extract_drive_id(url):
    for pat in [r'thumbnail[?]id=([^&]+)', r'/file/d/([^/?]+)', r'[?&]id=([^&]+)']:
        m = re.search(pat, url or "")
        if m:
            return m.group(1)
    return None

def download_photo(url):
    """Download vehicle photo at high resolution."""
    file_id = extract_drive_id(url)
    if not file_id:
        raise ValueError(f"Cannot extract Drive ID from: {url}")
    dl_url = f"https://drive.google.com/thumbnail?id={file_id}&sz=w1200"
    req = urllib.request.Request(dl_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

# ── WeBuyCars logo detection ──────────────────────────────────────────────────

def detect_webuycars_mask(img_bgr):
    """
    Detect the WeBuyCars orange oval logo using HSV color detection.
    Returns a binary uint8 mask (255=remove) or None if not found.
    """
    import cv2
    import numpy as np

    h, w = img_bgr.shape[:2]

    # License plates are always in the lower portion — only search bottom 70%
    search_top = int(h * 0.30)
    roi = img_bgr[search_top:, :]

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

    # Tight orange range — WeBuyCars logo is a vivid saturated orange
    lower = np.array([5,  120, 100])
    upper = np.array([22, 255, 255])
    orange = cv2.inRange(hsv, lower, upper)

    # Use small kernel — the logo's orange is a thin border stroke, not solid fill
    # OPEN with large kernel destroys it; just use CLOSE to fill small gaps
    kernel_sm = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    kernel_lg = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    orange = cv2.morphologyEx(orange, cv2.MORPH_OPEN,  kernel_sm, iterations=1)
    orange = cv2.morphologyEx(orange, cv2.MORPH_CLOSE, kernel_lg, iterations=2)

    contours, _ = cv2.findContours(orange, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    # WeBuyCars logo should be 0.1%–5% of the search ROI — reject anything outside that
    roi_area = w * (h - search_top)
    min_area = roi_area * 0.001
    max_area = roi_area * 0.05
    contours = [c for c in contours if min_area < cv2.contourArea(c) < max_area]
    if not contours:
        return None

    # Use the largest single orange blob
    largest = max(contours, key=cv2.contourArea)
    x, y, bw, bh = cv2.boundingRect(largest)
    y += search_top  # adjust back to full-image coordinates

    # Expand to cover the dark plate surround (keep expansion bounded)
    px = min(int(bw * 0.8), 120)
    py = min(int(bh * 0.6), 50)
    x1 = max(0, x - px)
    y1 = max(0, y - py)
    x2 = min(w, x + bw + px)
    y2 = min(h, y + bh + py)

    # Sanity check: reject if masked area is more than 15% of total image
    if (x2 - x1) * (y2 - y1) > w * h * 0.15:
        return None

    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y1:y2, x1:x2] = 255
    return mask

# ── Inpainting ────────────────────────────────────────────────────────────────

def inpaint(img_bytes, mask_np):
    """
    Remove masked area using OpenCV TELEA inpainting.
    Works well for license plates since the surrounding bumper area is uniform.
    """
    import cv2
    import numpy as np

    arr     = np.frombuffer(img_bytes, np.uint8)
    img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    # Use a larger radius to better blend the bumper area
    result = cv2.inpaint(img_bgr, mask_np, inpaintRadius=12, flags=cv2.INPAINT_TELEA)

    ok, buf = cv2.imencode(".png", result)
    if not ok:
        raise RuntimeError("Failed to encode result image")
    return buf.tobytes()

# ── Google Drive upload ───────────────────────────────────────────────────────

def upload_to_gdrive(script_url, img_bytes, filename, retries=3, wait=8):
    b64 = "data:image/png;base64," + base64.b64encode(img_bytes).decode()
    payload = json.dumps({"image": b64, "filename": filename, "mimeType": "image/png"}).encode()
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(script_url, data=payload, method="POST",
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                result = json.loads(r.read())
            url = result.get("url", "").strip()
            if result.get("success") and url:
                return url
            print(f"  Attempt {attempt}/{retries} — bad response: {result.get('error', '?')}")
        except Exception as e:
            print(f"  Attempt {attempt}/{retries} — error: {e}")
        if attempt < retries:
            time.sleep(wait)
    raise RuntimeError(f"Upload failed after {retries} attempts")

# ── Argument parsing ──────────────────────────────────────────────────────────

def parse_args():
    args = sys.argv[1:]
    opts = {"dry_run": "--dry-run" in args, "preview": "--preview" in args,
            "limit": None, "ids": None, "codes": None}
    for a in args:
        if a.startswith("--limit="):
            opts["limit"] = int(a.split("=", 1)[1])
        if a.startswith("--id="):
            opts["ids"] = [int(x) for x in a.split("=", 1)[1].split(",")]
        if a.startswith("--code="):
            opts["codes"] = [x.strip().upper() for x in a.split("=", 1)[1].split(",")]
    return opts

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    opts    = parse_args()
    dry_run = opts["dry_run"]
    preview = opts["preview"]

    if dry_run or preview:
        OUTPUT_DIR.mkdir(exist_ok=True)
        if preview:
            print("PREVIEW MODE — saving mask images to", OUTPUT_DIR, "(no changes made)\n")
        else:
            print("DRY-RUN MODE — saving cleaned images to", OUTPUT_DIR, "(no upload)\n")

    # 1. Fetch Apps Script URL
    print("Fetching settings from Supabase…")
    settings = sb_get("settings", {"id": "eq.1", "select": "vehicle_script_url,apps_script_url"})
    row = (settings or [{}])[0]
    script_url = row.get("vehicle_script_url") or row.get("apps_script_url") or ""
    if not dry_run and not preview and not script_url:
        print("ERROR: No Apps Script URL in Settings → System.")
        sys.exit(1)
    if script_url:
        print(f"  Upload URL: {script_url[:70]}…")

    # 2. Fetch vehicles
    print("\nFetching vehicles from Supabase…")
    params = {"select": "id,code,make,photo_front,photo_rear,photo_side", "order": "id"}
    if opts["ids"]:
        params["id"] = "in.(" + ",".join(str(i) for i in opts["ids"]) + ")"
    if opts["codes"]:
        params["code"] = "in.(" + ",".join(opts["codes"]) + ")"

    vehicles = sb_get_all("vehicles", params)
    vehicles = [v for v in vehicles if any(v.get(f) for f in PHOTO_FIELDS)]

    if opts["limit"]:
        vehicles = vehicles[:opts["limit"]]

    total_photos = sum(1 for v in vehicles for f in PHOTO_FIELDS if v.get(f))
    print(f"  {len(vehicles)} vehicles · {total_photos} photos to check\n")

    if not vehicles:
        print("Nothing to process.")
        return

    # 3. Import cv2 / numpy (already installed)
    import cv2
    import numpy as np

    # 4. Process each vehicle
    ok = skipped = failed = no_logo = 0

    for vi, vehicle in enumerate(vehicles, 1):
        vid   = vehicle["id"]
        vcode = vehicle.get("code") or str(vid)
        vmake = vehicle.get("make") or "?"
        print(f"\n[{vi}/{len(vehicles)}] {vcode} — {vmake} (id={vid})")

        updates = {}

        for field in PHOTO_FIELDS:
            url = vehicle.get(field)
            if not url:
                continue

            view = field.replace("photo_", "")  # front / rear / side
            print(f"  [{view}]", end=" ", flush=True)

            # Download
            try:
                img_bytes = download_photo(url)
            except Exception as e:
                print(f"SKIP — download error: {e}")
                skipped += 1
                continue

            # Decode
            arr     = np.frombuffer(img_bytes, np.uint8)
            img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img_bgr is None:
                print("SKIP — cannot decode image")
                skipped += 1
                continue

            # Detect logo
            mask = detect_webuycars_mask(img_bgr)
            if mask is None:
                print("no logo detected")
                no_logo += 1
                continue

            # Preview mode — save red-overlay image showing what will be removed
            if preview:
                overlay = img_bgr.copy()
                overlay[mask > 0] = [0, 0, 255]
                out = OUTPUT_DIR / f"{vcode}_{view}_preview.jpg"
                cv2.imwrite(str(out), overlay)
                print(f"preview saved → {out.name}")
                continue

            # Inpaint
            print("removing…", end=" ", flush=True)
            try:
                cleaned = inpaint(img_bytes, mask)
            except Exception as e:
                print(f"FAIL — {e}")
                failed += 1
                continue

            # Dry-run — save locally
            if dry_run:
                out = OUTPUT_DIR / f"{vcode}_{view}.png"
                out.write_bytes(cleaned)
                print(f"saved → {out.name}")
                ok += 1
                continue

            # Upload to Google Drive
            filename = f"vehicle_{vcode}_{view}_clean.png"
            try:
                new_url = upload_to_gdrive(script_url, cleaned, filename)
                updates[field] = new_url
                print(f"uploaded ✓")
            except Exception as e:
                print(f"FAIL — upload: {e}")
                failed += 1
                continue

        # Update Supabase
        if updates:
            try:
                sb_patch("vehicles", {"id": f"eq.{vid}"}, updates)
                print(f"  Supabase updated ({', '.join(updates)}) ✓")
                ok += len(updates)
            except Exception as e:
                print(f"  Supabase FAILED: {e}")
                failed += len(updates)

        if vi < len(vehicles):
            time.sleep(1)

    print(f"\n── Result {'(DRY RUN) ' if dry_run else ''}────────────────────")
    print(f"  Processed : {ok}")
    print(f"  No logo   : {no_logo}")
    print(f"  Skipped   : {skipped}")
    print(f"  Failed    : {failed}")


if __name__ == "__main__":
    main()
