#!/usr/bin/env python3
"""
Upload part photos to Google Drive and update Supabase parts table.

Usage:
    python upload_part_photos.py <photos_folder>
    python upload_part_photos.py <photos_folder> --overwrite   # replace existing photos

Image files must be named by SKU, e.g.:
    ABC123.jpg
    XYZ-456.png
    PART001.jpeg

The script will:
  1. Load the Apps Script URL from your Supabase settings
  2. For each image, upload it to Google Drive via Apps Script
  3. Update the matching part's image_url in Supabase
"""

import base64
import json
import mimetypes
import os
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co"
SUPABASE_KEY = "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
MAX_IMAGE_PX = 1200  # matches app resize behaviour

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
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def sb_patch(path, params, data):
    url = SUPABASE_URL + "/rest/v1/" + path + "?" + urllib.parse.urlencode(params)
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req) as r:
        return r.status

# ── Image helpers ─────────────────────────────────────────────────────────────

def encode_image(path: Path) -> str:
    """Return base64 data URL (resized to MAX_IMAGE_PX if Pillow is available)."""
    try:
        from PIL import Image
        import io
        img = Image.open(path).convert("RGB")
        w, h = img.size
        if w > MAX_IMAGE_PX or h > MAX_IMAGE_PX:
            r = min(MAX_IMAGE_PX / w, MAX_IMAGE_PX / h)
            img = img.resize((round(w * r), round(h * r)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        raw = path.read_bytes()
        mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
        return f"data:{mime};base64," + base64.b64encode(raw).decode()

# ── Google Drive upload ───────────────────────────────────────────────────────

def upload_to_gdrive(script_url: str, b64: str, filename: str) -> str:
    payload = json.dumps({"image": b64, "filename": filename, "mimeType": "image/png"}).encode()
    req = urllib.request.Request(script_url, data=payload, method="POST", headers={
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        result = json.loads(r.read())
    if not result.get("success"):
        raise RuntimeError(result.get("error", "Upload failed (no success flag)"))
    return result["url"]

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    overwrite = "--overwrite" in args
    args = [a for a in args if a != "--overwrite"]

    if not args:
        print(__doc__)
        sys.exit(1)

    folder = Path(args[0])
    if not folder.is_dir():
        print(f"ERROR: '{folder}' is not a directory")
        sys.exit(1)

    # 1. Fetch Apps Script URL from Supabase settings
    print("Fetching Apps Script URL from Supabase settings…")
    try:
        settings = sb_get("settings", {"id": "eq.1", "select": "apps_script_url,vehicle_script_url"})
    except Exception as e:
        print(f"ERROR: Could not reach Supabase: {e}")
        sys.exit(1)

    script_url = (settings or [{}])[0].get("apps_script_url") or \
                 (settings or [{}])[0].get("vehicle_script_url") or ""
    if not script_url:
        print("ERROR: No Apps Script URL configured in Settings → System.")
        sys.exit(1)
    print(f"  Using: {script_url[:70]}…\n")

    # 2. Collect images
    images = sorted(
        f for f in folder.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not images:
        print(f"No supported image files found in '{folder}'")
        sys.exit(0)

    print(f"Found {len(images)} image(s). Overwrite existing: {'yes' if overwrite else 'no'}\n")

    ok = skipped = failed = 0

    for i, img_path in enumerate(images, 1):
        sku = img_path.stem
        print(f"[{i}/{len(images)}] SKU: {sku}")

        # 3. Look up part in Supabase
        try:
            parts = sb_get("parts", {"sku": f"eq.{sku}", "select": "id,sku,image_url"})
        except Exception as e:
            print(f"  SKIP — Supabase error: {e}")
            skipped += 1
            continue

        if not parts:
            print(f"  SKIP — SKU '{sku}' not found in database")
            skipped += 1
            continue

        if parts[0].get("image_url") and not overwrite:
            print(f"  SKIP — already has a photo (use --overwrite to replace)")
            skipped += 1
            continue

        # 4. Encode image
        try:
            b64 = encode_image(img_path)
        except Exception as e:
            print(f"  FAIL — cannot read image: {e}")
            failed += 1
            continue

        # 5. Upload to Google Drive
        try:
            url = upload_to_gdrive(script_url, b64, f"{sku}.png")
            print(f"  Uploaded  → {url[:72]}")
        except Exception as e:
            print(f"  FAIL — upload error: {e}")
            failed += 1
            continue

        # 6. Save URL to Supabase
        try:
            sb_patch("parts", {"sku": f"eq.{sku}"}, {"image_url": url})
            print(f"  Supabase  ✓")
            ok += 1
        except Exception as e:
            print(f"  FAIL — Supabase update error: {e}")
            failed += 1
            continue

        if i < len(images):
            time.sleep(0.5)  # avoid hammering Apps Script

    print(f"\n── Result ────────────────────────────")
    print(f"  Updated : {ok}")
    print(f"  Skipped : {skipped}")
    print(f"  Failed  : {failed}")

if __name__ == "__main__":
    main()
