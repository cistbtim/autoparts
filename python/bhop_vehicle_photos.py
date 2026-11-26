#!/usr/bin/env python3
"""Extract the car photos printed above each BHOP table heading -> vehicle front/rear photos.
Usage: python bhop_vehicle_photos.py <BHOP.pdf> <work_dir> <out_dir>   (writes <out>/<VEHCODE>_front.jpg/_rear.jpg + vehicle_photos.json)"""
import io, json, os, sys
import fitz
from PIL import Image
PDF, WORK, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)
doc = fitz.open(PDF)
cells = json.load(open(os.path.join(WORK, "cells.json"), encoding="utf-8"))
cell_table = json.load(open(os.path.join(WORK, "cell_table.json")))
label_veh = json.load(open(os.path.join(WORK, "label_veh.json")))
def label(k):
    p, sd, t = k.split("|"); return f"{p}{'LR'[int(sd)]}{'' if t == '162' else '@' + t}"
tables = {}
for i, k in cell_table.items():
    tables.setdefault(k, []).append(fitz.Rect(cells[int(i)]["rect"]))
def load(xref):
    pix = fitz.Pixmap(doc, xref); info = doc.extract_image(xref)
    if pix.colorspace and pix.colorspace.n >= 4: pix = fitz.Pixmap(fitz.csRGB, pix)
    if info.get("smask"):
        try: pix = fitz.Pixmap(pix, fitz.Pixmap(doc, info["smask"]))
        except Exception: pass
    im = Image.open(io.BytesIO(pix.tobytes("png")))
    if im.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", im.size, "white"); bg.paste(im, mask=im.split()[-1]); return bg
    return im.convert("RGB")
res = {}
for k, rects in tables.items():
    p, sd, top = k.split("|"); p = int(p); top = float(top)
    page = doc[p - 1]; mid = page.rect.width / 2
    allcells = [fitz.Rect(c["rect"]) for c in cells if c["page"] == p]
    x0, x1 = (0, mid) if sd == "0" else (mid, page.rect.width)
    cand = []
    for im in page.get_image_info(xrefs=True):
        b = fitz.Rect(im["bbox"]); cx, cy = (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2
        if im["width"] * im["height"] < 8000 or b.width < 60 or not (x0 < cx < x1): continue
        if any(c.x0 - 3 <= cx <= c.x1 + 3 and c.y0 - 3 <= cy <= c.y1 + 3 for c in allcells): continue
        if not (top - 200 <= b.y1 <= top + 15 and b.y0 >= top - 200): continue
        if b.y0 < 15 and b.width > 150 and b.x0 > x1 - 300: pass
        cand.append((b, im["xref"]))
    # keep the two nearest-above (largest y1 band), left-to-right
    if not cand: continue
    ymax = max(b.y1 for b, _ in cand)
    cand = sorted([c for c in cand if c[0].y1 > ymax - 60], key=lambda c: c[0].x0)[:2]
    code = label_veh.get(label(k))
    if not code: continue
    names = []
    for n, (b, xr) in zip(("front", "rear"), cand):
        f = f"{code}_{n}.jpg"
        if os.path.exists(os.path.join(OUT, f)) and code in res: continue
        load(xr).save(os.path.join(OUT, f), "JPEG", quality=90); names.append(f)
    res.setdefault(code, []).append({"key": k, "files": names})
json.dump(res, open(os.path.join(OUT, "vehicle_photos.json"), "w"), indent=1)
print(len(res), "vehicles with photos;", len(set(label_veh.values())), "vehicles total")
