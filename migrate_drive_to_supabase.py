#!/usr/bin/env python3
"""
Phase 2 — Bulk migration: Google Drive → Supabase Storage (cars_parts bucket)

Usage:
    python migrate_drive_to_supabase.py
    python migrate_drive_to_supabase.py --dry-run          # preview only, no changes
    python migrate_drive_to_supabase.py --table parts       # one table only
    python migrate_drive_to_supabase.py --table ws_vehicles

Set env vars before running (or edit the constants below):
    set SUPABASE_URL=https://xxxx.supabase.co
    set SUPABASE_KEY=your-service-role-key
"""

import os, re, sys, time, json, argparse
import requests
from urllib.parse import quote

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
BUCKET       = "cars_parts"
DELAY        = 0.3   # seconds between requests (Google rate limiting)
PAGE_SIZE    = 1000

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_KEY environment variables.")
    print("  set SUPABASE_URL=https://xxxx.supabase.co")
    print("  set SUPABASE_KEY=your-service-role-key")
    sys.exit(1)

DB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# ── Table / column definitions ─────────────────────────────────────────────────
# Format: (table_name, [(col_name, storage_subfolder, is_pdf)], extra_select_cols)
MIGRATION_TARGETS = [
    ("parts",                  [("image_url",  "parts",     False)], []),
    ("vehicles",               [("photo_front","catalogue", False),
                                ("photo_rear", "catalogue", False),
                                ("photo_side", "catalogue", False)], []),
    ("workshop_vehicles",      [("photo_front","ws_vehicles",False),
                                ("photo_rear", "ws_vehicles",False),
                                ("photo_side", "ws_vehicles",False)], []),
    ("workshop_job_photos",    [("url",        "bookings",  False)], ["job_id"]),
    ("workshop_job_checklist", [("photo_url",  "checklist", False)], ["item_key"]),
    ("workshop_documents",     [("file_url",   "documents", None)],  ["mime_type","file_type"]),
]

# ── Helpers ────────────────────────────────────────────────────────────────────
def is_drive_url(url):
    return bool(url and isinstance(url, str) and "drive.google.com" in url)

def extract_drive_id(url):
    if not url: return None
    m = re.search(r'/file/d/([^/?#\s]+)', url)
    if m: return m.group(1)
    m = re.search(r'[?&]id=([^&\s#]+)', url)
    if m: return m.group(1)
    return None

def download_drive(url, is_pdf=False):
    """Download a Google Drive file. Returns (bytes, content_type) or (None, None)."""
    drive_id = extract_drive_id(url)
    if not drive_id:
        return None, None

    if is_pdf:
        # Direct export URL for PDFs
        dl_url = f"https://drive.google.com/uc?export=download&id={drive_id}"
        content_type = "application/pdf"
    else:
        # High-res thumbnail — no auth needed for publicly shared images
        dl_url = f"https://drive.google.com/thumbnail?id={drive_id}&sz=w1200"
        content_type = "image/jpeg"

    try:
        r = requests.get(dl_url, timeout=30, allow_redirects=True,
                         headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200 and len(r.content) > 500:
            # Detect PDF from content even for image slots
            if r.content[:4] == b'%PDF':
                content_type = "application/pdf"
            return r.content, content_type
        return None, None
    except Exception as e:
        return None, None

def upload_to_storage(path, data, content_type, dry_run=False):
    """Upload bytes to Supabase Storage. Returns public URL or None."""
    if dry_run:
        return f"[DRY-RUN] {SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"

    encoded = "/".join(quote(part, safe="") for part in path.split("/"))
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{encoded}"
    r = requests.put(url, data=data, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }, timeout=60)
    if r.status_code in (200, 201):
        return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"
    print(f"    ❌ Upload failed ({r.status_code}): {r.text[:120]}")
    return None

def fetch_records(table, select_cols):
    """Fetch all records from a table, paginated."""
    cols = ",".join(["id"] + select_cols)
    records, offset = [], 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={cols}&limit={PAGE_SIZE}&offset={offset}"
        r = requests.get(url, headers=DB_HEADERS, timeout=30)
        if r.status_code != 200:
            print(f"  ⚠ Could not fetch {table} (status {r.status_code}): {r.text[:120]}")
            return []
        batch = r.json()
        if not isinstance(batch, list):
            print(f"  ⚠ Unexpected response for {table}: {str(batch)[:120]}")
            return []
        records.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return records

def patch_record(table, rec_id, patch, dry_run=False):
    if dry_run: return True
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{rec_id}"
    r = requests.patch(url, json=patch, headers={**DB_HEADERS, "Prefer": "return=minimal"}, timeout=30)
    return r.status_code in (200, 204)

def make_path(subfolder, rec_id, col, mime_type, ext_hint):
    ts = int(time.time() * 1000)
    if mime_type and "pdf" in mime_type:
        ext = ".pdf"
    elif ext_hint:
        ext = ext_hint
    else:
        ext = ".jpg"
    safe_id = str(rec_id).replace("/", "_")[:40]
    return f"{subfolder}/{safe_id}/{col}_{ts}{ext}"

# ── Migration runner ───────────────────────────────────────────────────────────
def migrate_table(table, col_defs, extra_cols, dry_run=False):
    all_cols = [c for c, _, _ in col_defs] + extra_cols
    print(f"\n{'='*62}")
    print(f"  {table}")
    print(f"{'='*62}")

    records = fetch_records(table, all_cols)
    # Filter to those that have at least one Drive URL
    pending = [r for r in records if any(is_drive_url(r.get(c)) for c, _, _ in col_defs)]

    print(f"  Total records:      {len(records)}")
    print(f"  Have Drive URLs:    {len(pending)}")

    ok = fail = already = 0

    for i, rec in enumerate(pending, 1):
        rec_id = rec.get("id")
        patch  = {}

        for col, subfolder, is_pdf_flag in col_defs:
            url = rec.get(col)
            if not is_drive_url(url):
                already += 1
                continue

            # Determine if this is a PDF
            if is_pdf_flag is None:
                # Auto-detect from mime_type / file_type columns
                mt = rec.get("mime_type", "") or ""
                ft = rec.get("file_type", "") or ""
                is_pdf = "pdf" in mt.lower() or "pdf" in ft.lower()
            else:
                is_pdf = is_pdf_flag

            status = "[DRY]" if dry_run else "    "
            print(f"  [{i:>4}/{len(pending)}] {col:<14} id={str(rec_id)[:18]}", end=" ", flush=True)

            data, content_type = download_drive(url, is_pdf=is_pdf)
            if not data:
                print("→ ⚠ SKIP (download failed — file may be private)")
                fail += 1
                continue

            ext_hint = ".pdf" if is_pdf else ".jpg"
            path = make_path(subfolder, rec_id, col, content_type, ext_hint)
            new_url = upload_to_storage(path, data, content_type, dry_run=dry_run)

            if new_url:
                patch[col] = new_url
                size_kb = len(data) // 1024
                print(f"→ ✅ {size_kb}KB → {path}")
                ok += 1
            else:
                fail += 1

            time.sleep(DELAY)

        if patch:
            if not patch_record(table, rec_id, patch, dry_run=dry_run):
                print(f"    ⚠ DB patch failed for id={rec_id}")

    print(f"\n  ✅ Migrated: {ok}   ❌ Failed: {fail}   ⏭ Already Supabase: {already}")
    return ok, fail

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Migrate Google Drive photos to Supabase Storage")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be migrated without making changes")
    parser.add_argument("--table",   type=str, default=None,
                        help="Migrate a single table only. Options: parts, vehicles, ws_vehicles, job_photos, checklist, documents")
    args = parser.parse_args()

    TABLE_ALIASES = {
        "parts":      "parts",
        "vehicles":   "vehicles",
        "catalogue":  "vehicles",
        "ws_vehicles":"workshop_vehicles",
        "workshop_vehicles":"workshop_vehicles",
        "job_photos": "workshop_job_photos",
        "checklist":  "workshop_job_checklist",
        "documents":  "workshop_documents",
    }

    print("=" * 62)
    print("  Phase 2: Google Drive → Supabase Storage Migration")
    print(f"  Bucket:   {BUCKET}")
    print(f"  Target:   {SUPABASE_URL}")
    if args.dry_run:
        print("  MODE:     DRY RUN — no changes will be made")
    print("=" * 62)

    total_ok = total_fail = 0

    for table, col_defs, extra_cols in MIGRATION_TARGETS:
        # Filter by --table if specified
        if args.table:
            alias = TABLE_ALIASES.get(args.table.lower())
            if alias != table:
                continue

        ok, fail = migrate_table(table, col_defs, extra_cols, dry_run=args.dry_run)
        total_ok += ok
        total_fail += fail

    print(f"\n{'='*62}")
    print(f"  MIGRATION COMPLETE")
    print(f"  ✅ Total migrated : {total_ok}")
    print(f"  ❌ Total failed   : {total_fail}")
    if total_fail > 0:
        print(f"\n  Failed files are likely private Google Drive files.")
        print(f"  Those records still show fine via the old Drive URL.")
    print("=" * 62)

if __name__ == "__main__":
    main()
