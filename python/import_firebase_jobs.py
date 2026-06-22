#!/usr/bin/env python3
"""
Import JobCard records from Firebase → Supabase workshop_jobs
Reads all vehicles under Company_Cars/SPEEDGRAND AUTO SPARES, then imports
each JobCard entry as a workshop_job row.

Usage:
  python import_firebase_jobs.py

Set env vars or edit CONFIG below:
  SUPABASE_URL, SUPABASE_KEY, WORKSHOP_ID
"""

import os, json, time, sys, re
import urllib.request, urllib.parse, urllib.error
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── CONFIG ──────────────────────────────────────────────────────────────────
SUPABASE_URL    = os.environ.get("SUPABASE_URL",  "https://lskouiyvdngdzaquurhk.supabase.co")
SUPABASE_KEY    = os.environ.get("SUPABASE_KEY",  "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW")
WORKSHOP_ID     = os.environ.get("WORKSHOP_ID",   "9")
CUSTOMER_ID     = "WSC-1777310685291-1"   # SPEEDGRAND AUTO SPARES
JOB_STATUS      = "Done"                  # historical jobs — set to Done
FIREBASE_BASE   = "https://carslicense.firebaseio.com"
FIREBASE_PATH   = "Company_Cars/SPEEDGRAND AUTO SPARES"
# ────────────────────────────────────────────────────────────────────────────

_counter = 0
def make_id(prefix="WSJ"):
    global _counter
    _counter += 1
    return f"{prefix}-{int(time.time()*1000)}-{_counter}"

def clean(val):
    """Strip surrounding quotes, escaped quotes, and whitespace."""
    if val is None: return ""
    s = str(val).strip()
    # Remove surrounding double-quotes added by Firebase
    if s.startswith('"') and s.endswith('"'):
        s = s[1:-1]
    s = s.replace('\\"', '').replace('\\n', ' ').replace('\n', ' ').strip()
    return s

def parse_date(val):
    """Convert '2026/4/8' or '2026\\/4\\/8' → '2026-04-08'."""
    s = clean(val).replace('\\/', '/')
    m = re.match(r'(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})', s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None

def fetch_firebase():
    path = urllib.parse.quote(FIREBASE_PATH, safe="/")
    url  = f"{FIREBASE_BASE}/{path}.json"
    req  = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def supabase_get(path):
    req = urllib.request.Request(SUPABASE_URL + path, headers={
        "apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def supabase_post(path, data, method="POST"):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(SUPABASE_URL + path, data=body, method=method,
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, b""
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def main():
    # ── 1. Fetch Firebase data ────────────────────────────────────────────
    print("Fetching from Firebase...")
    raw = fetch_firebase()
    print(f"  {len(raw)} vehicles found\n")

    # ── 2. Fetch existing workshop_vehicles to map reg → vehicle id ───────
    print("Fetching existing workshop_vehicles from Supabase...")
    vehicles = supabase_get(f"/rest/v1/workshop_vehicles?workshop_id=eq.{WORKSHOP_ID}&select=id,reg")
    reg_to_vid = {(v["reg"] or "").upper().strip(): v["id"] for v in vehicles}
    print(f"  {len(reg_to_vid)} vehicles in Supabase\n")

    # ── 3. Build job rows ─────────────────────────────────────────────────
    jobs = []
    for reg_key, car_data in raw.items():
        if not isinstance(car_data, dict): continue
        details  = car_data.get("Details", {})
        job_cards = car_data.get("JobCard", {})
        if not job_cards or not isinstance(job_cards, dict): continue

        reg        = (details.get("VelRegNo") or reg_key).upper().strip()
        vehicle_id = reg_to_vid.get(reg)

        for fb_job_id, jc in job_cards.items():
            if not isinstance(jc, dict): continue
            cust_name  = clean(jc.get("Customer", ""))
            cust_phone = clean(jc.get("Customer_Number", ""))
            job_date   = parse_date(jc.get("Job_Date")) or ""
            description = clean(jc.get("Job_Description", ""))
            section    = clean(jc.get("Job_Section", ""))

            job = {
                "id":                   make_id("JOB"),
                "workshop_id":          int(WORKSHOP_ID),
                "workshop_customer_id": CUSTOMER_ID,
                "workshop_vehicle_id":  vehicle_id,
                "customer_name":        cust_name or "SPEEDGRAND AUTO SPARES",
                "customer_phone":       cust_phone if cust_phone != "000" else "",
                "vehicle_reg":          reg,
                "vehicle_make":         details.get("Make", "").strip(),
                "vehicle_model":        details.get("Model", "").strip(),
                "vehicle_color":        details.get("Color", "").strip(),
                "vin":                  details.get("Vin", "").strip().upper(),
                "engine_no":            details.get("EngineNo", "").strip().upper(),
                "mileage":              None,
                "complaint":            description,
                "diagnosis":            None,
                "mechanic":             None,
                "date_in":              job_date or None,
                "date_out":             None,
                "status":               JOB_STATUS,
                "return_reason":        None,
                "parent_job_id":        None,
            }
            jobs.append((fb_job_id, job))

    print(f"{len(jobs)} job cards to import:\n")
    for fb_id, j in jobs[:5]:
        print(f"  {fb_id} | {j['vehicle_reg']} | {j['customer_name']} | {j['date_in']} | {j['complaint'][:50]}")
    if len(jobs) > 5:
        print(f"  ... and {len(jobs)-5} more")

    confirm = input(f"\nInsert {len(jobs)} jobs into workshop_jobs? [y/N] ").strip().lower()
    if confirm != "y":
        print("Aborted.")
        return

    # ── 4. Insert jobs ────────────────────────────────────────────────────
    inserted = errors = 0
    for fb_id, j in jobs:
        status, body = supabase_post("/rest/v1/workshop_jobs", j)
        if status in (200, 201):
            print(f"  [OK]    {fb_id} | {j['vehicle_reg']} | {j['date_in']}")
            inserted += 1
        else:
            print(f"  [ERROR] {fb_id} | {j['vehicle_reg']}: {status} {body.decode()[:120]}")
            errors += 1

    print(f"\nDone. Inserted: {inserted}  Errors: {errors}")

if __name__ == "__main__":
    main()
