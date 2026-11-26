#!/usr/bin/env python3
"""Build the BHOP import: SQL files (vehicles / parts+supplier / links), photos named by SKU, review CSV.
Usage: python bhop_build.py <work_dir> <vehicles_db.json> <out_docs_dir>"""
import collections, csv, json, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bhop_vehicles_spec import SPEC

WORK, VEH_DB, DOCS = sys.argv[1], sys.argv[2], sys.argv[3]
STORAGE = "https://lskouiyvdngdzaquurhk.supabase.co/storage/v1/object/public/cars_parts/parts"
parts = json.load(open(os.path.join(WORK, "parts.json"), encoding="utf-8"))
cell_table = json.load(open(os.path.join(WORK, "cell_table.json")))
db_veh = json.load(open(VEH_DB, encoding="utf-8"))

def label(k):
    p, sd, t = k.split("|")
    return f"{p}{'LR'[int(sd)]}{'' if t == '162' else '@' + t}"

# ---------------------------------------------------------------- names
FIX = [
    (r"\bfornt\b", "front"), (r"\bfende\b", "fender"), (r"\bfrontfender\b", "front fender"), (r"\bfenderinner\b", "fender inner"),
    (r"\bfrontbumper\b", "front bumper"), (r"\bfrontlongitudinal\b", "front longitudinal"), (r"\bfront ?longitudinal ?axis\b", "front longitudinal axis"),
    (r"\bcrossmeber ?compl\b|\bcrossmember ?compl\b|\bcrossmempercompl\b|\bcrossmembercompl\b|\bcrossmeber compl", "crossmember compl"),
    (r"\bcrossmeber\b", "crossmember"), (r"\brear dool\b", "rear door"), (r"\btrrunk\b|\brrunk\b", "trunk"), (r"\btaill\b", "tail"),
    (r"\blracket\b|\bracket\b|\bbraket\b|\bbrakect\b", "bracket"), (r"reinforcenient|rein for cement|reinfor- cement|reinfor-cement", "reinforcement"),
    (r"\breinforcementlower\b", "reinforcement lower"), (r"\bsupportt\b|\bsupporr\b|\bsuppor\b|\bsuppart\b", "support"), (r"\braidator\b|\bradaitor\b", "radiator"),
    (r"\bbumpert\b", "bumper"), (r"\broundproof\b", "soundproof"), (r"\bhold\b", "hood"), (r"\bhoodw/o\b", "hood w/o"), (r"\bfenderw/o\b", "fender w/o"),
    (r"\bfender2011\b", "fender 2011"), (r"\bhood gi8\b|\binsulator gi8\b", "insulator gl8"), (r"\bsupport for s56 bs\b", "support for s5"),
    (r"\bupper beam ofradiator\b", "upper beam of radiator"), (r"\bof radiatorsupport\b", "of radiator support"), (r"\bbeams ofradiator\b", "beams of radiator"),
    (r"\bfrontbumper\b", "front bumper"), (r"sub- ?assembly", "sub-assembly"), (r"asse mbly", "assembly"), (r"\bfront coaming sub- assembly\b", "front coaming sub-assembly"),
    (r"\bfrontreinforcement\b", "front reinforcement"), (r"reinforcement ?lower lower", "reinforcement lower"),
    (r"\bfrontbumper reinforcement\b", "front bumper reinforcement"), (r"\bfront bumper reinforcement\b", "front bumper reinforcement"),
    (r"\bwith whole\b", "with hole"), (r"\bwithout whole\b", "without hole"), (r"\bcoverplate\b", "cover plate"),
    (r"/with whole", "/with hole"),
]
def clean_name(n):
    n = re.sub(r"[^\x20-\x7E]", " ", n)
    n = re.sub(r"[#$@~|_{}\[\]<>*=]+.*$", "", n)                 # OCR junk from the Chinese label that follows
    n = re.sub(r"\s+", " ", n).strip(" -/").lower()
    for a, b in FIX:
        n = re.sub(a, b, n)
    n = re.sub(r"\s+(\d|[a-z]{1,2}\d?)$", lambda m: m.group(0) if re.search(r"\d{2}|w|usa|mt|at|gt", m.group(0)) else "", n) if False else n
    return re.sub(r"\s+", " ", n).strip().upper()

# English base name -> Chinese (only exact base matches; qualifiers like years / "for CAMRY" are ignored)
ZH = {
 "HOOD": "引擎盖", "ENGINE HOOD": "引擎盖", "FRONT FENDER": "前叶子板", "REAR FENDER": "后叶子板", "FRONT DOOR": "前门", "REAR DOOR": "后门",
 "TRUNK LID": "行李箱盖", "TAIL GATE": "尾门", "TAIL PANEL": "后围板", "FRONT BUMPER SUPPORT": "前保险杠骨架", "REAR BUMPER SUPPORT": "后保险杠骨架",
 "RADIATOR SUPPORT": "水箱框架", "HOOD INSULATOR": "引擎盖隔音棉", "CROSS MEMBER": "横梁", "ROOF": "车顶", "SUN-ROOF": "天窗", "SUNROOF": "天窗",
 "SUNROOF PANEL": "天窗板", "FRONT BUMPER": "前保险杠", "REAR BUMPER": "后保险杠", "FRONT REINFORCEMENT": "前防撞梁", "REAR REINFORCEMENT": "后防撞梁",
 "INNER FENDER": "内叶子板", "FUEL TANK CAP": "油箱盖", "THRESHOLD": "门槛", "LOWER BEAM": "下横梁", "UPPER BEAM": "上横梁",
 "UPPER BEAM OF RADIATOR SUPPORT": "水箱上横梁", "TAIL LAMP BRACKET": "尾灯支架", "TAIL LAMP HOLDER": "尾灯支架", "HEADLAMP SUPPORT": "大灯支架",
 "INNER RAIL": "内纵梁", "SIDE BODY PANEL": "侧围板", "REAR PANEL": "后围板", "SOUNDPROOF COTTON": "隔音棉", "WIPER WASH SUPPORT": "雨刮支架",
 "SPARE TIRE PANEL": "备胎板", "HOOD HINGE": "引擎盖铰链", "FRONT BUMPER BRACKET": "前保险杠支架", "FUEL TANK": "油箱", "MIDDLE PILLAR": "中柱",
 "FRONT COLUMN": "前柱", "A COLUMN PANEL": "A柱板", "FRONT PANEL A COLUMN": "A柱前板",
}
def base_for_zh(n):
    n = re.sub(r"\b(FOR|WITH|WITHOUT)\b.*$", "", n)
    n = re.sub(r"[-/ ]*\(?\b(\d{2,4}['’]?(-\d{2,4})?|USA|EUR|AT|MT|ALU|4D|5D|W/O.*|W .*)\)?\s*$", "", n)
    return n.strip(" -/()")

def lev(a, b):
    if abs(len(a) - len(b)) > 2:
        return 9
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]

def prune(tokens, counts):
    norm = [re.sub(r"^([LR]:)?", "", t.upper().replace("O", "0")) for t in tokens]
    keep = []
    for i, t in enumerate(tokens):
        if counts[i] <= 2 and any(j != i and counts[j] >= 3 and lev(norm[i], norm[j]) <= 2 for j in range(len(tokens))):
            continue
        keep.append(t)
    # unequal-length near-duplicates are OCR noise (true left/right numbers have equal length): keep the better voted / shorter one
    drop = set()
    for i in range(len(keep)):
        for j in range(i + 1, len(keep)):
            a = re.sub(r"^([LR]:)?", "", keep[i].upper().replace("O", "0")); b = re.sub(r"^([LR]:)?", "", keep[j].upper().replace("O", "0"))
            if len(a) != len(b) and lev(a, b) <= 2:
                ci, cj = counts[tokens.index(keep[i])], counts[tokens.index(keep[j])]
                drop.add(j if (ci, -len(a)) >= (cj, -len(b)) else i)
    return [t for k, t in enumerate(keep) if k not in drop]

def norm_oe(tokens):
    out = []
    for t in tokens:
        t = re.sub(r"[^ -~]", "", t).upper()
        pre = ""
        m = re.match(r"^([LR]:)(.*)$", t)
        if m:
            pre, t = m.group(1), m.group(2)
        t = t.strip("_.,;:|/ ")
        t = t.replace("O", "0")
        t = re.sub(r"^(\d{5})-00([0-9A-Z]{4})(-[A-Z]{1,3})?$", lambda m_: m_.group(1) + "-0" + m_.group(2) + (m_.group(3) or ""), t)   # OCR doubled a zero: 53301-00R090 -> 53301-0R090
        if len(t) > 15:                                   # two OE numbers glued together
            parts_ = re.findall(r"[0-9A-Z]{5}-[0-9A-Z]{4,6}", t)
            if len(parts_) > 1:
                for q_ in parts_:
                    out.append(pre + q_); pre = ""
                continue
        if len(re.sub(r"\W", "", t)) < 5 or not re.search(r"\d", t):
            continue
        out.append(pre + t)
    seen, res = set(), []
    for t in out:
        if t not in seen:
            seen.add(t); res.append(t)
    if any(t.startswith(("L:", "R:")) for t in res):
        res = sorted(res, key=lambda t: (0 if t.startswith("L:") else 1 if t.startswith("R:") else 2))
    return res

# ---------------------------------------------------------------- vehicles
def vname(make, model, zh, yf, yt):
    return f"{model} ({zh})" if zh else model

veh_key = {}      # (make, model, zh, yf, yt) -> record
label_veh = {}
prefix_of = {"TOYOTA": "TY", "LEXUS": "LX", "TESLA": "TS", "MAZDA": "MZ", "HAIMA": "HA", "BUICK": "BU", "CHEVROLET": "CV", "HONDA": "HD", "NISSAN": "NS", "DAEWOO": "DW"}
maxn = collections.defaultdict(int)
used_codes = {v["code"] for v in db_veh if v.get("code")}
for v in db_veh:
    m = re.match(r"([A-Z]+)(\d+)", v.get("code") or "")
    if m:
        maxn[m.group(1)] = max(maxn[m.group(1)], int(m.group(2)))
for lab in sorted(SPEC, key=lambda l: (int(re.match(r"\d+", l).group()), l)):
    make, model, zh, yf, yt = SPEC[lab]
    k = (make, model, zh, yf, yt)
    if k not in veh_key:
        pre = prefix_of[make]
        maxn[pre] += 1
        code = f"{pre}{maxn[pre]:03d}A"
        assert code not in used_codes
        veh_key[k] = {"code": code, "make": make, "model": vname(*k), "yf": yf, "yt": yt}
    label_veh[lab] = veh_key[k]

def year_range(v):
    if v["yf"] and v["yt"]:
        return f"{v['yf']}-{v['yt']}" if v["yf"] != v["yt"] else str(v["yf"])
    if v["yf"]:
        return f"{v['yf']}+"
    return ""

# ---------------------------------------------------------------- parts
os.makedirs(os.path.join(WORK, "photos_by_sku"), exist_ok=True)
cells = json.load(open(os.path.join(WORK, "cells.json"), encoding="utf-8"))
rows, review = [], []
for x in parts:
    ents = x["entries"]
    vlist = []
    for e in ents:
        v = label_veh[label(cell_table[str(e["i"])])]
        if v not in vlist:
            vlist.append(v)
    first = vlist[0]
    name = clean_name(x["name"])
    zh = ZH.get(base_for_zh(name), "")
    oe = " / ".join(norm_oe(prune(x["oe"], x["oe_cnt"])))
    photo = next((e["photo"] for e in ents if e["photo"]), None)
    if photo:
        raw = os.path.join(WORK, "photos_raw", photo)
        shutil.copyfile(raw if os.path.exists(raw) else os.path.join(WORK, "photos", photo), os.path.join(WORK, "photos_by_sku", x["sku"] + ".jpg"))
    why = []
    if x["conf"] < 4: why.append("code read by <4 of 5 OCR passes")
    if re.search(r"-[B-Z]$", x["sku"]): why.append("catalogue prints the same code twice for different parts")
    if not oe: why.append("no OE number found")
    elif x["oe_min"] < 3: why.append("OE number read by few OCR passes - check digits")
    if not photo: why.append("no photo")
    if re.search(r"[^A-Z0-9 ()/.,'&+-]", name) or len(name) < 3: why.append("odd name")
    if why:
        review.append((x["sku"], x["cat_code"], x["name"], name, oe, "; ".join(why), x["entries"][0]["page"]))
    rows.append({"sku": x["sku"], "cat_code": x["cat_code"], "name": name, "zh": zh, "oe": oe, "make": first["make"], "model": first["model"],
                 "yr": year_range(first), "photo": bool(photo), "veh": [v["code"] for v in vlist]})

def q(s):
    return "'" + str(s).replace("'", "''") + "'"
def qn(s):
    return q(s) if s not in (None, "") else "NULL"

# supplier part numbers must be unique per supplier (DB constraint part_suppliers_supplier_part_no_unique)
_seen = {}
for r in rows:
    code = r["cat_code"]
    m_ = re.search(r"-([B-Z])$", r["sku"])
    if m_:
        code = code + "-" + m_.group(1)                    # catalogue printed the same code twice
    elif r["sku"].startswith("BOH-NS-") and code.startswith("BH-NI-") and ("BOH-NI-" + code[6:]) in {x["sku"] for x in rows}:
        code = "BH-N1-" + code[6:]                         # Nissan code clashes with a Lexus 'NI' code
    r["cat_code"] = code
    assert code not in _seen, (code, r["sku"], _seen[code])
    _seen[code] = r["sku"]

# ---------------------------------------------------------------- SQL files
vlist_all = sorted(veh_key.values(), key=lambda v: v["code"])
with open(os.path.join(DOCS, "bhop_vehicles.sql"), "w", encoding="utf-8") as f:
    f.write("-- BHOP catalogue vehicles (%d). Run FIRST. Skips any code that already exists.\n" % len(vlist_all))
    f.write("INSERT INTO vehicles (code, make, model, year_from, year_to)\nSELECT v.code, v.make, v.model, v.yf, v.yt FROM (VALUES\n")
    f.write(",\n".join(f"  ({q(v['code'])},{q(v['make'])},{q(v['model'])},{v['yf'] or 'NULL'}::int,{v['yt'] or 'NULL'}::int)" for v in vlist_all))
    f.write("\n) AS v(code, make, model, yf, yt)\nWHERE NOT EXISTS (SELECT 1 FROM vehicles x WHERE x.code = v.code);\n\n")
    f.write("-- Check: expect %d\nSELECT count(*) FROM vehicles WHERE code IN (%s);\n" % (len(vlist_all), ",".join(q(v["code"]) for v in vlist_all)))

with open(os.path.join(DOCS, "bhop_parts.sql"), "w", encoding="utf-8") as f:
    f.write("-- BHOP catalogue: supplier + %d parts. Run SECOND. Skips supplier/SKUs that already exist.\n" % len(rows))
    f.write("""INSERT INTO suppliers (name, full_name, country, supplier_origin, phone, search_url, notes, is_catalogue_supplier)
SELECT 'BHOP', 'BHOP Auto Parts (jsbhqp.com)', 'China', 'international', '+86 137 7642 8028', 'http://www.jsbhqp.com',
       'Foreign factory. Body panels catalogue (Toyota, Lexus, Tesla, Mazda, Haima, Buick, Chevrolet, Honda, Nissan, Daewoo). Contact via WhatsApp/WeChat. Catalogue codes BH-xx-nnn = our SKU BOH-xx-nnn.', true
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = 'BHOP');\n\n""")
    f.write("INSERT INTO parts (sku, name, chinese_desc, oe_number, make, model, year_range, category, stock, image_url)\nSELECT v.sku, v.name, v.zh, v.oe, v.make, v.model, v.yr, 'Body', 0, v.img FROM (VALUES\n")
    f.write(",\n".join(f"  ({q(r['sku'])},{q(r['name'])},{q(r['zh'])},{q(r['oe'])},{q(r['make'])},{q(r['model'])},{q(r['yr'])},{(q(STORAGE + '/' + r['sku'] + '/factory.jpg') if r['photo'] else 'NULL')})" for r in rows))
    f.write("\n) AS v(sku, name, zh, oe, make, model, yr, img)\nWHERE NOT EXISTS (SELECT 1 FROM parts p WHERE p.sku = v.sku);\n\n")
    f.write("-- Check: expect %d\nSELECT count(*) FROM parts WHERE sku LIKE 'BOH-%%';\n" % len(rows))

with open(os.path.join(DOCS, "bhop_links.sql"), "w", encoding="utf-8") as f:
    f.write("-- BHOP links: supplier part numbers + vehicle fitments. Run THIRD (after vehicles and parts).\n")
    f.write("INSERT INTO part_suppliers (part_id, supplier_id, supplier_part_no)\nSELECT p.id, s.id, v.cat_code FROM (VALUES\n")
    f.write(",\n".join(f"  ({q(r['sku'])},{q(r['cat_code'])})" for r in rows))
    f.write("\n) AS v(sku, cat_code)\nJOIN parts p ON p.sku = v.sku\nJOIN suppliers s ON s.name = 'BHOP'\n")
    f.write("WHERE NOT EXISTS (SELECT 1 FROM part_suppliers x WHERE x.part_id = p.id AND x.supplier_id = s.id);\n\n")
    fit = [(r["sku"], c) for r in rows for c in r["veh"]]
    f.write("INSERT INTO part_fitments (part_id, vehicle_id, notes)\nSELECT p.id, ve.id, NULL FROM (VALUES\n")
    f.write(",\n".join(f"  ({q(s)},{q(c)})" for s, c in fit))
    f.write("\n) AS f(sku, vcode)\nJOIN parts p ON p.sku = f.sku\nJOIN vehicles ve ON ve.code = f.vcode\n")
    f.write("WHERE NOT EXISTS (SELECT 1 FROM part_fitments x WHERE x.part_id = p.id AND x.vehicle_id = ve.id);\n\n")
    f.write("-- Check: expect %d part links and %d fitments\n" % (len(rows), len(fit)))
    f.write("SELECT (SELECT count(*) FROM part_suppliers ps JOIN suppliers s ON s.id=ps.supplier_id WHERE s.name='BHOP') AS supplier_links,\n")
    f.write("       (SELECT count(*) FROM part_fitments pf JOIN parts p ON p.id=pf.part_id WHERE p.sku LIKE 'BOH-%') AS fitments;\n")

with open(os.path.join(DOCS, "bhop_review.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["SKU", "Catalogue code", "Name as read", "Name used", "OE", "Why check", "PDF page"])
    w.writerows(review)

print(len(vlist_all), "vehicles;", len(rows), "parts;", len(fit), "fitments;", sum(1 for r in rows if r["photo"]), "photos;", sum(1 for r in rows if r["zh"]), "with Chinese;", len(review), "to review")
json.dump(rows, open(os.path.join(WORK, "final_rows.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump({k:v["code"] for k,v in label_veh.items()}, open(os.path.join(WORK,"label_veh.json"),"w"))
