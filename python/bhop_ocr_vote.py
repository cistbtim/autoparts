#!/usr/bin/env python3
"""Re-OCR the text area of every BHOP catalogue cell with several settings so codes can be voted on.
Usage: python bhop_ocr_vote.py <BHOP.pdf> <work_dir>   (reads cells.json, writes cells_vote.json)"""
import io, json, os, re, sys
from multiprocessing import Pool
import fitz, pytesseract
from PIL import Image

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
PDF, WORK = sys.argv[1], sys.argv[2]
CODE = re.compile(r"B[HN]\s*[-_—–.]?\s*([A-Z]{2})\s*[-_—–.]?\s*(\d{2,4})")
doc = None

def init():
    global doc
    doc = fitz.open(PDF)

def run(job):
    i, page, rect = job
    pg = doc[page - 1]
    r = fitz.Rect(rect)
    clip = fitz.Rect(r.x0 + 1, r.y0 + 1, r.x1 - 1, r.y0 + r.height * 0.56)
    outs = []
    for scale, thr, psm in ((8, None, 6), (6, 150, 6), (7, 185, 4), (10, 160, 6)):
        pix = pg.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip, alpha=False)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("L")
        if thr:
            img = img.point(lambda v, t=thr: 0 if v < t else 255)
        txt = pytesseract.image_to_string(img, lang="eng", config=f"--psm {psm}")
        outs.append(txt.strip())
    return i, outs

if __name__ == "__main__":
    cells = json.load(open(os.path.join(WORK, "cells.json"), encoding="utf-8"))
    jobs = [(i, c["page"], c["rect"]) for i, c in enumerate(cells)]
    with Pool(6, initializer=init) as p:
        for n, (i, outs) in enumerate(p.imap_unordered(run, jobs, chunksize=8)):
            cells[i]["vote_text"] = outs
            if n % 200 == 0:
                print(n, flush=True)
    json.dump(cells, open(os.path.join(WORK, "cells_vote.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("done")
