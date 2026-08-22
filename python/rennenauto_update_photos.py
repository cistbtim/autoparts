#!/usr/bin/env python3
"""
rennenauto_update_photos.py — Swap watermarked photos on existing Rennen
Autoteile-sourced parts (sku LIKE 'RENN-%') for cleaned versions produced by
rennenauto_clean.py.

This catalog was already imported into the live `parts` table previously
(sku = "RENN-" + xlsx "SKU / Part Number", matched via rennenauto_products.xlsx
"Local Image File" -> cleaned_photos/{id}_clean.png). This script only updates
image_url on existing rows — it never inserts new parts.

Default is --dry-run: matches cleaned photos to existing parts by SKU and
writes a full report + JSON plan, without uploading or writing anything to
Supabase. Review the plan, then re-run with --live to execute it.

Usage:
    python rennenauto_update_photos.py                # dry run, writes plan JSON
    python rennenauto_update_photos.py --live          # actually upload + patch
    python rennenauto_update_photos.py --live --limit=10   # test on first 10 matches

Requirements: pip install openpyxl
"""

import sys
import json
import argparse
import urllib.request
import urllib.parse
import base64
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import openpyxl

SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co"
SUPABASE_KEY = "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW"
BUCKET = "cars_parts"

XLSX_PATH = Path(r"C:\Users\Tim\Desktop\rennenauto_scrape\rennenauto_products.xlsx")
CLEANED_DIR = Path(r"C:\Users\Tim\car-parts-app\cleaned_photos")
PLAN_PATH = CLEANED_DIR / "_update_plan.json"


def sb_get_all_renn_parts():
    results = []
    offset = 0
    while True:
        url = (SUPABASE_URL + "/rest/v1/parts?sku=like.RENN-*"
               "&select=id,sku,name,image_url&limit=1000&offset=" + str(offset))
        req = urllib.request.Request(url, headers={
            "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        })
        with urllib.request.urlopen(req, timeout=30) as r:
            page = json.loads(r.read())
        results.extend(page)
        if len(page) < 1000:
            break
        offset += 1000
    return results


def load_xlsx_rows():
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
    ws = wb.active
    rows = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        part_no, local_file = r[3], r[8]
        if part_no and local_file:
            rows[local_file] = {"id": r[0], "name": r[2], "part_no": str(part_no)}
    return rows


def upload_to_storage(path_in_bucket, file_bytes, content_type="image/png"):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path_in_bucket)}"
    req = urllib.request.Request(url, data=file_bytes, method="POST", headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        r.read()
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path_in_bucket}"


def sb_patch_image_url(part_id, new_url):
    url = f"{SUPABASE_URL}/rest/v1/parts?id=eq.{part_id}"
    body = json.dumps({"image_url": new_url}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json", "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="actually upload + patch (default is dry-run)")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    print("Loading xlsx rows…")
    xlsx_by_file = load_xlsx_rows()
    print(f"  {len(xlsx_by_file)} rows")

    print("Fetching existing RENN- parts from Supabase…")
    parts = sb_get_all_renn_parts()
    parts_by_sku = {p["sku"]: p for p in parts}
    print(f"  {len(parts)} existing parts\n")

    cleaned_files = sorted(CLEANED_DIR.glob("*_clean.png"))
    print(f"{len(cleaned_files)} cleaned photos found\n")

    matched, no_xlsx_row, no_part_match = [], [], []
    for f in cleaned_files:
        stem = f.stem.replace("_clean", "")
        # source file could have been .jpg or .png
        xlsx_row = xlsx_by_file.get(stem + ".jpg") or xlsx_by_file.get(stem + ".png")
        if not xlsx_row:
            no_xlsx_row.append(f.name)
            continue
        sku = "RENN-" + xlsx_row["part_no"]
        part = parts_by_sku.get(sku)
        if not part:
            no_part_match.append((f.name, sku))
            continue
        matched.append({
            "cleaned_file": str(f), "part_id": part["id"], "sku": sku,
            "name": part["name"], "old_image_url": part["image_url"],
            "new_storage_path": f"parts/renn/{stem}_clean.jpg",
        })

    print(f"── Match summary ────────────────")
    print(f"  Matched (ready to update) : {len(matched)}")
    print(f"  No xlsx row for file      : {len(no_xlsx_row)}")
    print(f"  No parts-table SKU match  : {len(no_part_match)}")
    if no_part_match:
        print("  Sample SKU mismatches (likely re-scrape drift):")
        for name, sku in no_part_match[:8]:
            print(f"    {name} -> {sku}")

    PLAN_PATH.write_text(json.dumps(matched, indent=2))
    print(f"\nFull plan written to {PLAN_PATH}")
    print("\nSample of what would change:")
    for row in matched[:5]:
        print(f"  [{row['part_id']}] {row['sku']} — {row['name'][:50]}")
        print(f"      old: {row['old_image_url']}")
        print(f"      new: storage://{BUCKET}/{row['new_storage_path']}")

    if not args.live:
        print("\nDRY RUN — nothing uploaded or changed. Re-run with --live to execute.")
        return

    todo = matched[: args.limit] if args.limit else matched
    print(f"\nLIVE MODE — uploading + patching {len(todo)} parts…")
    ok = failed = 0
    for row in todo:
        try:
            file_bytes = Path(row["cleaned_file"]).read_bytes()
            new_url = upload_to_storage(row["new_storage_path"], file_bytes)
            sb_patch_image_url(row["part_id"], new_url)
            ok += 1
        except Exception as e:
            failed += 1
            print(f"  FAIL [{row['part_id']}] {row['sku']}: {e}")
    print(f"\nDone. Updated: {ok}  Failed: {failed}")


if __name__ == "__main__":
    main()
