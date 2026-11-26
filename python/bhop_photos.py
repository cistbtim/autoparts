#!/usr/bin/env python3
"""Pull the ORIGINAL embedded factory photo of every BHOP catalogue cell (no page text / grid lines).
Usage: python bhop_photos.py <BHOP.pdf> <work_dir>   -> <work>/photos_raw/cell_XXXXX.jpg"""
import io, json, os, sys
import fitz
from PIL import Image

PDF, WORK = sys.argv[1], sys.argv[2]
doc = fitz.open(PDF)
cells = json.load(open(os.path.join(WORK, "cells.json"), encoding="utf-8"))
out = os.path.join(WORK, "photos_raw")
os.makedirs(out, exist_ok=True)

def load(xref):
    pix = fitz.Pixmap(doc, xref)
    info = doc.extract_image(xref)
    smask = info.get("smask")
    if pix.colorspace and pix.colorspace.n >= 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    if smask:
        m = fitz.Pixmap(doc, smask)
        if (m.width, m.height) != (pix.width, pix.height):
            m = fitz.Pixmap(m, 0) if False else m
        try:
            pix = fitz.Pixmap(pix, m)
        except Exception:
            pass
    im = Image.open(io.BytesIO(pix.tobytes("png")))
    if im.mode in ("RGBA", "LA"):
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")

page_imgs = {}
n = 0
for i, c in enumerate(cells):
    if not c["photo"]:
        continue
    pno = c["page"]
    if pno not in page_imgs:
        page_imgs[pno] = doc[pno - 1].get_image_info(xrefs=True)
    r = fitz.Rect(c["rect"])
    inside = [im for im in page_imgs[pno]
              if r.x0 - 3 <= (im["bbox"][0] + im["bbox"][2]) / 2 <= r.x1 + 3
              and r.y0 - 3 <= (im["bbox"][1] + im["bbox"][3]) / 2 <= r.y1 + 3
              and im["width"] * im["height"] > 2500]
    if not inside:
        continue
    u = fitz.Rect(min(im["bbox"][0] for im in inside), min(im["bbox"][1] for im in inside),
                  max(im["bbox"][2] for im in inside), max(im["bbox"][3] for im in inside))
    scale = max(1.0, min(4.0, max(im["width"] / max(1.0, im["bbox"][2] - im["bbox"][0]) for im in inside)))
    W, H = max(8, round(u.width * scale)), max(8, round(u.height * scale))
    canvas = Image.new("RGB", (W, H), "white")
    for im in sorted(inside, key=lambda z: -(z["bbox"][2] - z["bbox"][0]) * (z["bbox"][3] - z["bbox"][1])):
        try:
            pic = load(im["xref"])
        except Exception as ex:
            print("skip", i, ex); continue
        b = im["bbox"]
        w, h = max(1, round((b[2] - b[0]) * scale)), max(1, round((b[3] - b[1]) * scale))
        pic = pic.resize((w, h), Image.LANCZOS)
        canvas.paste(pic, (round((b[0] - u.x0) * scale), round((b[1] - u.y0) * scale)))
    canvas.save(os.path.join(out, c["photo"]), "JPEG", quality=88)
    n += 1
print(n, "photos")
