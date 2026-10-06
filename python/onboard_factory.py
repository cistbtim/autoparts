#!/usr/bin/env python3
"""
Onboard a factory as a catalogue supplier — same setup as MCK.

  python onboard_factory.py <catalogue.xlsx|.csv> --code ABC --name "ABC Auto Parts Co" [options]

Creates (all idempotent — existing rows are reused / skipped):
  suppliers       code ABC, is_catalogue_supplier, margin + customer discount
  users           role=supplier login linked to that supplier (they log in and edit their own catalogue)
  parts           sku "ABC-<their part no>", oe_number, cost/sell price, make/model/year
  part_suppliers  links each part to the supplier with their part number + price

Catalogue link for customers afterwards:  https://velgenius.com/?catalog=ABC

Spreadsheet: row 1 = headers. Recognised (any of these spellings, case-insensitive):
  part no | oe | name | make | model | year | price | category | stock | brand

Options:
  --code      3-letter prefix (required)            --name      company name (required)
  --username  supplier login (default: code lower)  --password  default: random, printed once
  --markup    sell price = cost x (1 + markup/100)  default 100   (ignored if the file has a separate sell price column "sell price")
  --discount  customer discount %  default 10       --max-discount  default 20
  --phone --email --country --contact               --days  login valid for N days (default 60)
  --limit N   only import the first N rows (e.g. 10 samples)
  --apply     actually write to Supabase. Without it this is a DRY RUN (reads only).
"""
import argparse, csv, json, os, random, re, string, sys, urllib.parse, urllib.request, urllib.error
from datetime import date, timedelta

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_env():
    env = {}
    try:
        for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v.strip().strip('"')
    except FileNotFoundError:
        pass
    return env

ENV = load_env()
URL = ENV.get("VITE_SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
KEY = ENV.get("VITE_SUPABASE_KEY") or os.environ.get("VITE_SUPABASE_KEY")
if not URL or not KEY:
    sys.exit("Missing VITE_SUPABASE_URL / VITE_SUPABASE_KEY (.env.local)")

def call(method, path, body=None):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                 "Content-Type": "application/json", "Prefer": "return=representation"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else []
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed: {e.code} {e.read().decode()[:300]}")

ALIASES = {
    "part_no":  ["part no", "part number", "partno", "part_no", "item no", "item code", "code", "sku", "factory part no", "零件号", "品号"],
    "oe":       ["oe", "oe no", "oe number", "oem", "oem no", "oem number", "原厂号", "oe号"],
    "name":     ["name", "description", "part name", "品名", "名称"],
    "make":     ["make", "brand name", "car make", "车型品牌"],
    "model":    ["model", "car model", "vehicle", "车型"],
    "year":     ["year", "years", "year range", "年份"],
    "price":    ["price", "cost", "unit price", "fob", "fob price", "价格", "单价"],
    "sell":     ["sell price", "selling price", "retail", "retail price"],
    "category": ["category", "type", "类别"],
    "stock":    ["stock", "qty", "quantity", "库存"],
    "brand":    ["brand", "part brand"],
}

def read_rows(path):
    if path.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        ws = openpyxl.load_workbook(path, data_only=True, read_only=True).worksheets[0]
        rows = [[("" if c is None else str(c).strip()) for c in r] for r in ws.iter_rows(values_only=True)]
    else:
        with open(path, encoding="utf-8-sig", newline="") as f:
            rows = [[c.strip() for c in r] for r in csv.reader(f)]
    rows = [r for r in rows if any(r)]
    if not rows:
        sys.exit("Empty file")
    head = [h.lower() for h in rows[0]]
    col = {}
    for field, names in ALIASES.items():
        for n in names:
            if n in head:
                col[field] = head.index(n); break
    return col, rows[1:]

def num(v):
    m = re.sub(r"[^0-9.]", "", v or "")
    try: return float(m) if m else None
    except ValueError: return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file"); ap.add_argument("--code", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--username"); ap.add_argument("--password")
    ap.add_argument("--markup", type=float, default=100); ap.add_argument("--discount", type=float, default=10)
    ap.add_argument("--max-discount", type=float, default=20)
    ap.add_argument("--phone", default=""); ap.add_argument("--email", default="")
    ap.add_argument("--country", default="China"); ap.add_argument("--contact", default="")
    ap.add_argument("--days", type=int, default=60); ap.add_argument("--limit", type=int)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    code = a.code.strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{2,5}", code):
        sys.exit("--code must be 2-5 letters/digits (e.g. ABC)")
    username = (a.username or code.lower()).strip()
    password = a.password or "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(8))

    col, rows = read_rows(a.file)
    if "part_no" not in col:
        sys.exit(f"No part-number column found. Recognised headers: {ALIASES['part_no']}")
    print("Columns detected:", {k: v for k, v in col.items()})
    if a.limit: rows = rows[:a.limit]

    def cell(r, f): return r[col[f]] if f in col and col[f] < len(r) else ""
    items = []
    for r in rows:
        pn = cell(r, "part_no")
        if not pn: continue
        cost = num(cell(r, "price"))
        sell = num(cell(r, "sell")) or (round(cost * (1 + a.markup / 100)) if cost else 0)
        items.append(dict(part_no=pn, oe=cell(r, "oe"), name=cell(r, "name") or pn, make=cell(r, "make"),
                          model=cell(r, "model"), year=cell(r, "year"), cost=cost, sell=sell,
                          category=cell(r, "category") or "Other", stock=int(num(cell(r, "stock")) or 0),
                          brand=cell(r, "brand") or "Aftermarket"))
    print(f"{len(items)} parts read from {os.path.basename(a.file)}")

    # ── what already exists ──
    sup = call("GET", f"suppliers?select=id,name&code=eq.{urllib.parse.quote(code)}")
    user = call("GET", f"users?select=id&username=eq.{urllib.parse.quote(username)}")
    existing = {p["sku"] for p in call("GET", f"parts?select=sku&sku=like.{urllib.parse.quote(code)}-*&limit=10000")}
    main_branch = (call("GET", "branches?select=id&is_main=eq.true&limit=1") or [{}])[0].get("id")
    new_items = [i for i in items if f"{code}-{i['part_no']}" not in existing]

    print(f"Supplier {code}: {'exists (id %s) — reused' % sup[0]['id'] if sup else 'will be CREATED'}")
    print(f"Login '{username}': {'ALREADY EXISTS — not touched' if user else 'will be CREATED'}")
    print(f"Parts: {len(new_items)} new, {len(items) - len(new_items)} already there (skipped)")
    for i in new_items[:5]:
        print(f"   {code}-{i['part_no']:<18} OE {i['oe'] or '-':<18} cost {i['cost']} → sell {i['sell']}  {i['name'][:40]}")

    if not a.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply to create everything.")
        return

    if sup: sid = sup[0]["id"]
    else:
        sid = call("POST", "suppliers", {
            "name": code, "code": code, "full_name": a.name, "phone": a.phone, "email": a.email,
            "country": a.country, "contact_person": a.contact, "supplier_origin": "international" if a.country.lower() != "south africa" else "local",
            "supplier_types": ["new"], "margin_options": [120, 100, 90], "customer_discount_pct": a.discount,
            "max_discount_pct": a.max_discount, "is_catalogue_supplier": True})[0]["id"]
        print(f"Created supplier {code} (id {sid})")

    if not user:
        call("POST", "users", {"username": username, "password": password, "name": code, "role": "supplier", "supplier_id": sid,
                               "subscription_status": "active", "subscription_expires_at": str(date.today() + timedelta(days=a.days))})
        print(f"Created login  username: {username}   password: {password}   (valid {a.days} days)")

    for n in range(0, len(new_items), 200):
        chunk = new_items[n:n + 200]
        made = call("POST", "parts", [{
            "sku": f"{code}-{i['part_no']}", "name": i["name"], "category": i["category"], "brand": i["brand"],
            "price": i["sell"], "cost_price": i["cost"] or 0, "stock": 0, "min_stock": 1, "image": "🔩",
            "make": i["make"], "model": i["model"], "year_range": i["year"], "oe_number": i["oe"],
            "branch_id": main_branch, "lifecycle_status": "in_stock", "current_holder": "shelf"} for i in chunk])
        by_sku = {p["sku"]: p["id"] for p in made}
        call("POST", "part_suppliers", [{
            "part_id": by_sku[f"{code}-{i['part_no']}"], "supplier_id": sid, "supplier_part_no": i["part_no"],
            "supplier_price": i["cost"], "min_order": 1, "stock": i["stock"]} for i in chunk])
        print(f"  imported {n + len(chunk)}/{len(new_items)}")

    print(f"\nDone. Customer catalogue link:  https://velgenius.com/?catalog={code}")

if __name__ == "__main__":
    main()
