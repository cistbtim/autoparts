#!/usr/bin/env python3
"""
Extract the BHOP (jsbhqp.com) body-parts catalogue PDF into:
  - cells.json  : one record per part cell (page, make tab, "Apply to" heading, name, BH code, OE text)
  - photos/<BH-CODE>.jpg : the factory photo of each part

Usage:  python bhop_extract.py <BHOP.pdf> <out_dir>
Needs:  PyMuPDF, pytesseract, Pillow, Tesseract (eng + chi_sim traineddata; TESSDATA_PREFIX may point at a custom dir)
"""
import io, json, os, re, sys
import fitz
import pytesseract
from PIL import Image

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

pdf_path, out_dir = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out_dir, "photos"), exist_ok=True)
doc = fitz.open(pdf_path)

def ocr_clip(page, rect, lang="eng", scale=5, psm=6):
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return pytesseract.image_to_string(img, lang=lang, config=f"--psm {psm}").strip()

def text_in(page, rect):
    words = page.get_text("words", clip=rect)
    if not words:
        return None
    words.sort(key=lambda w: (round(w[1] / 3), w[0]))
    lines, cur, cy = [], [], None
    for w in words:
        y = round(w[1] / 3)
        if cy is None or y == cy:
            cur.append(w[4]); cy = y
        else:
            lines.append(" ".join(cur)); cur = [w[4]]; cy = y
    if cur:
        lines.append(" ".join(cur))
    return "\n".join(lines)

cells_out = []
for pno, page in enumerate(doc):
    make_tab = (page.get_text().split("\n")[0] or "").strip()
    # ---- cell rectangles
    rects = []
    for d in page.get_drawings():
        if d["type"] == "s" and len(d["items"]) == 1 and d["items"][0][0] == "re":
            r = d["rect"]
            if 85 <= r.width <= 220 and 95 <= r.height <= 140:
                rects.append(fitz.Rect(r))
    # dedupe near-identical rects
    uniq = []
    for r in rects:
        if not any(abs(r.x0 - u.x0) < 2 and abs(r.y0 - u.y0) < 2 and abs(r.x1 - u.x1) < 2 for u in uniq):
            uniq.append(r)
    uniq.sort(key=lambda r: (round(r.y0 / 20), r.x0))
    imgs = [i for i in page.get_image_info(xrefs=True) if i["bbox"][1] > 150 or True]
    # ---- table groups -> heading text above each table's top row
    # a table = cells that share the same left x0 column chain and are vertically contiguous
    tops = {}
    for r in uniq:
        side = 0 if r.x0 < page.rect.width / 2 else 1
        tops.setdefault(side, []).append(r)
    heading_cache = {}
    def heading_for(r):
        side = 0 if r.x0 < page.rect.width / 2 else 1
        # table top = the highest cell in this side that is contiguous upward from r
        col = sorted(tops[side], key=lambda c: c.y0)
        top = r.y0
        changed = True
        while changed:
            changed = False
            for c in col:
                if c.y1 <= top + 3 and top - c.y1 < 6 and abs(c.x0 - r.x0) < 400:
                    top = min(top, c.y0); changed = True
        key = (side, round(top))
        if key not in heading_cache:
            x0 = min(c.x0 for c in tops[side]); x1 = max(c.x1 for c in tops[side])
            txt = ""
            for (dy0, dy1, thr) in ((24, 8, 170), (28, 6, 170), (22, 10, 140), (32, 4, 200), (26, 12, 170)):
                rect = fitz.Rect(x0 - 2, top - dy0, x1 + 2, top - dy1)
                t = text_in(page, rect) or ""
                if "pply" not in t:
                    pix = page.get_pixmap(matrix=fitz.Matrix(5, 5), clip=rect, alpha=False)
                    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L").point(lambda v, thr=thr: 0 if v < thr else 255)
                    t = pytesseract.image_to_string(img, lang="eng", config="--psm 7").strip()
                if "pply" in t or "ppl" in t:
                    txt = t; break
            heading_cache[key] = " ".join(txt.split())
        return heading_cache[key]
    for r in uniq:
        inside = [i for i in imgs
                  if r.x0 - 3 <= (i["bbox"][0] + i["bbox"][2]) / 2 <= r.x1 + 3
                  and r.y0 - 3 <= (i["bbox"][1] + i["bbox"][3]) / 2 <= r.y1 + 3
                  and i["width"] * i["height"] > 2500]
        top_img = min((i["bbox"][1] for i in inside), default=r.y1)
        text_rect = fitz.Rect(r.x0 + 1, r.y0 + 1, r.x1 - 1, min(max(top_img - 1, r.y0 + 20), r.y1 - 1))
        txt = text_in(page, text_rect)
        src = "layer"
        if not txt or not re.search(r"B[HN]\W*[A-Z]{2}", txt):
            txt = ocr_clip(page, text_rect); src = "ocr"
        photo = None
        if inside:
            u = fitz.Rect(min(i["bbox"][0] for i in inside), min(i["bbox"][1] for i in inside),
                          max(i["bbox"][2] for i in inside), max(i["bbox"][3] for i in inside))
            nat = max(i["width"] for i in inside)
            scale = max(1.0, min(4.0, nat / max(1.0, inside[0]["bbox"][2] - inside[0]["bbox"][0])))
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=u, alpha=False)
            photo = pix.tobytes("jpeg", jpg_quality=88)
        cells_out.append({"page": pno + 1, "make_tab": make_tab, "heading": heading_for(r),
                          "rect": [round(v, 1) for v in r], "text": txt, "src": src,
                          "photo_bytes": photo})
    print("page", pno + 1, "cells", len(uniq), flush=True)

# write photos with provisional names; parse step renames by SKU
for i, c in enumerate(cells_out):
    b = c.pop("photo_bytes")
    c["photo"] = None
    if b:
        fn = f"cell_{i:05d}.jpg"
        with open(os.path.join(out_dir, "photos", fn), "wb") as f:
            f.write(b)
        c["photo"] = fn
json.dump(cells_out, open(os.path.join(out_dir, "cells.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("total cells", len(cells_out))
