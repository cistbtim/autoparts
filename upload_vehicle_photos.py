#!/usr/bin/env python3
"""
Upload vehicle photos to Google Drive and update Supabase vehicles table.

Usage:
    python upload_vehicle_photos.py <photos_folder>
    python upload_vehicle_photos.py <photos_folder> --overwrite

Image files must be named:  <CODE>_front.jpg / <CODE>_rear.jpg / <CODE>_side.jpg
    e.g.  AD01A_front.jpg   AD01A_rear.jpg   AD01A_side.jpg

The script will:
  1. Load the Apps Script URL from your Supabase settings
  2. Parse each filename  →  vehicle code  +  photo position (front/rear/side)
  3. Look up the vehicle in Supabase by code
  4. Upload the image to Google Drive via Apps Script
  5. Save the URL into vehicles.photo_front / photo_rear / photo_side
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

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co"
SUPABASE_KEY = "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
VALID_POSITIONS = {"front", "rear", "side"}
MAX_IMAGE_PX = 1200

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

def upload_to_gdrive(script_url: str, b64: str, filename: str,
                     retries: int = 3, retry_wait: int = 8) -> str:
    """Upload and return URL. Retries up to `retries` times if no valid URL comes back."""
    payload = json.dumps({"image": b64, "filename": filename, "mimeType": "image/png"}).encode()
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(script_url, data=payload, method="POST", headers={
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=120) as r:
                result = json.loads(r.read())

            url = result.get("url", "").strip()
            if result.get("success") and url:
                return url

            err = result.get("error", "no success flag or empty URL")
            print(f"  Attempt {attempt}/{retries} — bad response: {err}")
        except Exception as e:
            print(f"  Attempt {attempt}/{retries} — error: {e}")

        if attempt < retries:
            print(f"  Waiting {retry_wait}s before retry…")
            time.sleep(retry_wait)

    raise RuntimeError(f"Upload failed after {retries} attempts")

# ── Filename parser ───────────────────────────────────────────────────────────

def parse_filename(stem: str):
    """
    'AD01A_front'  →  ('AD01A', 'front')
    'AD01A_rear'   →  ('AD01A', 'rear')
    Returns (None, None) if the filename doesn't match the pattern.
    """
    parts = stem.rsplit("_", 1)
    if len(parts) != 2:
        return None, None
    code, position = parts[0].strip().upper(), parts[1].strip().lower()
    if position not in VALID_POSITIONS:
        return None, None
    return code, position

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

    # 1. Fetch Apps Script URL
    print("Fetching Apps Script URL from Supabase settings…")
    try:
        settings = sb_get("settings", {"id": "eq.1", "select": "apps_script_url,vehicle_script_url"})
    except Exception as e:
        print(f"ERROR: Could not reach Supabase: {e}")
        sys.exit(1)

    row = (settings or [{}])[0]
    # Prefer vehicle_script_url if set, otherwise fall back to apps_script_url
    script_url = row.get("vehicle_script_url") or row.get("apps_script_url") or ""
    if not script_url:
        print("ERROR: No Apps Script URL in Settings → System.")
        sys.exit(1)
    print(f"  Using: {script_url[:70]}…\n")

    # 2. Collect and parse image files
    images = sorted(
        f for f in folder.iterdir()
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not images:
        print(f"No supported image files found in '{folder}'")
        sys.exit(0)

    # Parse filenames
    valid = []
    for img in images:
        code, position = parse_filename(img.stem)
        if code and position:
            valid.append((img, code, position))
        else:
            print(f"SKIP (bad name) — '{img.name}'  (expected CODE_front/rear/side.jpg)")

    print(f"\nFound {len(valid)} valid vehicle photo(s) out of {len(images)} files.")
    print(f"Overwrite existing: {'yes' if overwrite else 'no'}\n")

    if not valid:
        sys.exit(0)

    # 3. Build vehicle code → id lookup (fetch all vehicles with codes)
    print("Loading vehicles from Supabase…")
    try:
        vehicles = sb_get("vehicles", {"select": "id,code,photo_front,photo_rear,photo_side",
                                        "code": "not.is.null"})
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    code_map = {v["code"].upper(): v for v in vehicles if v.get("code")}
    print(f"  {len(code_map)} vehicles with codes loaded\n")

    ok = skipped = failed = 0

    for i, (img_path, code, position) in enumerate(valid, 1):
        field = f"photo_{position}"
        print(f"[{i}/{len(valid)}] {img_path.name}  →  code={code}  field={field}")

        # Look up vehicle
        vehicle = code_map.get(code)
        if not vehicle:
            print(f"  SKIP — no vehicle with code '{code}' in database")
            skipped += 1
            continue

        # Skip if already has photo
        if vehicle.get(field) and not overwrite:
            print(f"  SKIP — already has {field} (use --overwrite to replace)")
            skipped += 1
            continue

        # Encode image
        try:
            b64 = encode_image(img_path)
        except Exception as e:
            print(f"  FAIL — cannot read image: {e}")
            failed += 1
            continue

        # Upload to Google Drive
        filename = f"vehicle_{code}_{position}.png"
        try:
            url = upload_to_gdrive(script_url, b64, filename)
            print(f"  Uploaded  → {url[:72]}")
        except Exception as e:
            print(f"  FAIL — upload error: {e}")
            failed += 1
            continue

        # Save URL to Supabase
        try:
            sb_patch("vehicles", {"id": f"eq.{vehicle['id']}"}, {field: url})
            print(f"  Supabase  ✓")
            ok += 1
        except Exception as e:
            print(f"  FAIL — Supabase update error: {e}")
            failed += 1
            continue

        if i < len(valid):
            time.sleep(2)

    print(f"\n── Result ────────────────────────────")
    print(f"  Updated : {ok}")
    print(f"  Skipped : {skipped}")
    print(f"  Failed  : {failed}")


if __name__ == "__main__":
    main()
