#!/usr/bin/env python3
"""
Import Company Cars from Firebase → Supabase workshop_vehicles

Usage:
  python import_firebase_vehicles.py

Required env vars (or edit the CONFIG section below):
  SUPABASE_URL   - e.g. https://xxxx.supabase.co
  SUPABASE_KEY   - service role key (Settings > API in Supabase dashboard)
  WORKSHOP_ID    - workshop_id to assign (find in Supabase users table)

Optional:
  FIREBASE_SECRET - Firebase database secret (if DB rules require auth)
  UPDATE_EXISTING - set to "1" to overwrite vehicles that already exist

If the Firebase database is private, export the JSON manually:
  Firebase console → three-dot menu → Export JSON → save as firebase_cars.json
"""

import os, json, time, sys
import urllib.request, urllib.parse, urllib.error

# ── CONFIG (edit here or use env vars) ─────────────────────────────────────
SUPABASE_URL    = os.environ.get("SUPABASE_URL",    "").rstrip("/")
SUPABASE_KEY    = os.environ.get("SUPABASE_KEY",    "")
WORKSHOP_ID     = os.environ.get("WORKSHOP_ID",     "")
FIREBASE_SECRET = os.environ.get("FIREBASE_SECRET", "")
UPDATE_EXISTING = os.environ.get("UPDATE_EXISTING", "0") == "1"

FIREBASE_BASE   = "https://carslicense.firebaseio.com"
FIREBASE_PATH   = "Company_Cars/SPEEDGRAND AUTO SPARES"
LOCAL_FALLBACK  = "firebase_cars.json"
# ────────────────────────────────────────────────────────────────────────────

_counter = 0
def make_id(prefix="WSV"):
    global _counter
    _counter += 1
    return f"{prefix}-{int(time.time()*1000)}-{_counter}"

def fetch_firebase():
    path = urllib.parse.quote(FIREBASE_PATH, safe="/")
    url  = f"{FIREBASE_BASE}/{path}.json"
    if FIREBASE_SECRET:
        url += f"?auth={FIREBASE_SECRET}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def supabase_get(endpoint, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{endpoint}{params}"
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def supabase_post(endpoint, data, method="POST", extra_headers=None):
    url  = f"{SUPABASE_URL}/rest/v1/{endpoint}"
    body = json.dumps(data).encode()
    hdrs = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }
    if extra_headers:
        hdrs.update(extra_headers)
    req = urllib.request.Request(url, data=body, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def map_vehicle(reg_key, details):
    return {
        "id":                  make_id("WSV"),
        "workshop_id":         WORKSHOP_ID or None,
        "reg":                 (details.get("VelRegNo") or reg_key).upper().strip(),
        "make":                details.get("Make", "").strip(),
        "model":               details.get("Model", "").strip(),
        "color":               details.get("Color", "").strip(),
        "vin":                 details.get("Vin", "").strip().upper(),
        "engine_no":           details.get("EngineNo", "").strip().upper(),
        "licence_disc_expiry": details.get("ExpireDate") or None,
        "notes":               details.get("ShapeDesc", "").strip(),
        "year":                None,
    }

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_KEY (env vars or edit the CONFIG section)")
        sys.exit(1)

    # ── 1. Fetch Firebase data ──────────────────────────────────────────────
    print("Fetching vehicles from Firebase...")
    raw = None
    try:
        raw = fetch_firebase()
        print(f"  Firebase returned {len(raw)} records")
    except Exception as e:
        print(f"  Firebase fetch failed: {e}")
        if os.path.exists(LOCAL_FALLBACK):
            print(f"  Reading from {LOCAL_FALLBACK} instead...")
            with open(LOCAL_FALLBACK, encoding="utf-8") as f:
                raw = json.load(f)
            # If the file contains the full Firebase export, dig into the path
            for part in FIREBASE_PATH.split("/"):
                if isinstance(raw, dict) and part in raw:
                    raw = raw[part]
        else:
            print(f"\nOption 1: Make the Firebase DB rules public (read: true) and retry.")
            print(f"Option 2: Export JSON from Firebase console → save as '{LOCAL_FALLBACK}' → retry.")
            sys.exit(1)

    if not raw:
        print("No data found.")
        sys.exit(0)

    # ── 2. Build vehicle list ───────────────────────────────────────────────
    vehicles = []
    for reg_key, car_data in raw.items():
        details = car_data.get("Details", {}) if isinstance(car_data, dict) else {}
        if not details:
            continue
        v = map_vehicle(reg_key, details)
        vehicles.append(v)

    print(f"\n{len(vehicles)} vehicles to import:")
    for v in vehicles:
        print(f"  {v['reg']:12} | {v['make']:6} {v['model']:12} | VIN: {v['vin']} | Exp: {v['licence_disc_expiry']}")

    # ── 3. Fetch existing vehicles from Supabase (by reg) ──────────────────
    print("\nChecking existing records in Supabase...")
    try:
        ws_filter = f"&workshop_id=eq.{WORKSHOP_ID}" if WORKSHOP_ID else ""
        existing  = supabase_get("workshop_vehicles", f"?select=id,reg{ws_filter}")
        existing_regs = {r["reg"].upper().strip(): r["id"] for r in existing}
        print(f"  {len(existing_regs)} vehicles already in workshop_vehicles")
    except Exception as e:
        print(f"  Could not fetch existing vehicles: {e}")
        existing_regs = {}

    # ── 4. Insert / update ─────────────────────────────────────────────────
    inserted = updated = skipped = errors = 0
    for v in vehicles:
        reg = v["reg"]
        if reg in existing_regs:
            if UPDATE_EXISTING:
                existing_id = existing_regs[reg]
                status, body = supabase_post(
                    f"workshop_vehicles?id=eq.{existing_id}",
                    {k: val for k, val in v.items() if k != "id"},
                    method="PATCH"
                )
                if status in (200, 204):
                    print(f"  [UPDATED]  {reg}")
                    updated += 1
                else:
                    print(f"  [ERROR]    {reg}: {status} {body.decode()[:120]}")
                    errors += 1
            else:
                print(f"  [SKIP]     {reg} (already exists)")
                skipped += 1
        else:
            status, body = supabase_post("workshop_vehicles", v)
            if status in (200, 201):
                print(f"  [OK]       {reg}")
                inserted += 1
            else:
                print(f"  [ERROR]    {reg}: {status} {body.decode()[:120]}")
                errors += 1

    # ── 5. Summary ─────────────────────────────────────────────────────────
    print(f"\nDone. Inserted: {inserted}  Updated: {updated}  Skipped: {skipped}  Errors: {errors}")

if __name__ == "__main__":
    main()
