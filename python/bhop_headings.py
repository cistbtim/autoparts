#!/usr/bin/env python3
"""Read the heading (vehicle name) above every table of the BHOP catalogue.
Writes <work>/headings.json: {"<page>|<side>|<tabletop>": "heading text"} and <work>/cell_table.json (cell index -> key).
Usage: python bhop_headings.py <BHOP.pdf> <work_dir>"""
import io, json, os, re, sys
import fitz, pytesseract
from PIL import Image, ImageChops

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
PDF, WORK = sys.argv[1], sys.argv[2]
doc = fitz.open(PDF)
cells = json.load(open(os.path.join(WORK, "cells.json"), encoding="utf-8"))

by_page = {}
for i, c in enumerate(cells):
    by_page.setdefault(c["page"], []).append((i, fitz.Rect(c["rect"])))

def darkest(img):
    r, g, b = img.convert("RGB").split()
    return ImageChops.darker(ImageChops.darker(r, g), b)

def read(page, rect):
    best = ""
    for scale in (5, 4):
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
        img = darkest(Image.open(io.BytesIO(pix.tobytes("png"))))
        for thr in (None, 150):
            im = img if thr is None else img.point(lambda v, t=thr: 0 if v < t else 255)
            t = " ".join(pytesseract.image_to_string(im, lang="eng", config="--psm 7").split())
            letters = len(re.findall(r"[A-Za-z]", t))
            if letters > len(re.findall(r"[A-Za-z]", best)) + 1:
                best = t
        if len(re.findall(r"[A-Za-z]", best)) >= 6:
            break
    return best

headings, cell_table = {}, {}
for pno, lst in sorted(by_page.items()):
    page = doc[pno - 1]
    for i, r in lst:
        side = 0 if r.x0 < page.rect.width / 2 else 1
        col = [rr for _, rr in lst if (0 if rr.x0 < page.rect.width / 2 else 1) == side]
        top = r.y0
        changed = True
        while changed:
            changed = False
            for c in col:
                if c.y1 <= top + 3 and top - c.y1 < 6:
                    top = min(top, c.y0); changed = True
        key = f"{pno}|{side}|{round(top)}"
        cell_table[i] = key
        if key not in headings:
            x0 = min(c.x0 for c in col); x1 = max(c.x1 for c in col)
            best = ""
            for dy0, dy1 in ((26, 8), (30, 5), (24, 11), (34, 3)):
                t = read(page, fitz.Rect(x0 - 2, top - dy0, x1 + 2, top - dy1))
                if len(re.findall(r"[A-Za-z]", t)) > len(re.findall(r"[A-Za-z]", best)):
                    best = t
                if re.search(r"[A-Za-z]{4,}", best) and re.search(r"\d|[A-Za-z]{5,}", best) and dy0 == 26:
                    break
            headings[key] = best
    print("page", pno, flush=True)
json.dump(headings, open(os.path.join(WORK, "headings.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(cell_table, open(os.path.join(WORK, "cell_table.json"), "w"))
print(len(headings), "headings")
