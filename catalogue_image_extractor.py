#!/usr/bin/env python3
"""
Catalogue Image Extractor
Reads a supplier catalogue PDF, extracts each product image,
names it after the supplier part number (e.g. AK00001.jpg),
and saves to a chosen output folder.

Requirements:
    pip install PyMuPDF
"""

import os
import re
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

# ── Try import PyMuPDF ────────────────────────────────────────────────────────
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

# ── Colours (match existing apps) ────────────────────────────────────────────
BG      = "#1e1e2e"
SURFACE = "#313244"
ACCENT  = "#89b4fa"
FG      = "#cdd6f4"
FG2     = "#a6adc8"
GREEN   = "#a6e3a1"
RED_C   = "#f38ba8"
YELLOW  = "#f9e2af"
FONT    = ("Segoe UI", 9)
MONO    = ("Consolas", 9)

# Part number pattern: 2-4 uppercase letters followed by 4-6 digits (e.g. AK00001, ABP30007)
PART_PATTERN = re.compile(r'^[A-Z]{2,4}\d{4,6}[A-Z]?$')

HEADER_Y        = 155    # PDF points — table content starts below this
RENDER_DPI      = 200    # DPI for page rendering
BLANK_THRESHOLD = 247    # average pixel ≥ this → cell is white/empty, skip it
MIN_EMBED_PX    = 30     # ignore embedded images smaller than this (px)


def _detect_picture_column(doc, total_pages):
    """
    Detect the Picture column X bounds using two methods in priority order:

    1. Modal X range of all non-header embedded images across first 20 pages.
       These are guaranteed to be in the picture column.

    2. First horizontal text-free gap between 30–250 pt wide (skipping the
       right-margin gap which is typically very wide).

    Returns (x0, x1) or (None, None).
    """
    from collections import Counter

    # ── Method 1: embedded image bounding rects ───────────────────────────────
    x0c, x1c = Counter(), Counter()
    for pn in range(min(20, total_pages)):
        page = doc[pn]
        for img_info in page.get_images(full=True):
            xref, _sm, w, h = img_info[0], img_info[1], img_info[2], img_info[3]
            if w < MIN_EMBED_PX or h < MIN_EMBED_PX:
                continue
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            if (r.y0 + r.y1) / 2 < HEADER_Y:
                continue   # skip company header / logo
            col_w = r.x1 - r.x0
            if col_w < 10:
                continue
            x0c[round(r.x0 / 5) * 5] += 1
            x1c[round(r.x1 / 5) * 5] += 1

    if x0c and x1c:
        pic_x0 = x0c.most_common(1)[0][0]
        pic_x1 = x1c.most_common(1)[0][0]
        if pic_x1 > pic_x0 + 15:
            return pic_x0 - 3, pic_x1 + 3

    # ── Method 2: first text-free gap of sensible width ───────────────────────
    try:
        page = doc[0]
        pw   = int(page.rect.width)
        occ  = bytearray(pw)
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                if (line["bbox"][1] + line["bbox"][3]) / 2 < HEADER_Y:
                    continue
                for x in range(max(0, int(line["bbox"][0])),
                               min(pw, int(line["bbox"][2]) + 1)):
                    occ[x] = 1
        in_gap, g_start = False, 0
        for x in range(15, pw):
            if not occ[x]:
                if not in_gap:
                    in_gap, g_start = True, x
            else:
                if in_gap:
                    g_len = x - g_start
                    if 30 <= g_len <= 250:   # realistic picture-column width
                        return g_start - 2, x + 2
                    in_gap = False
    except Exception:
        pass

    return None, None


def _is_blank(pix, threshold=BLANK_THRESHOLD):
    """True if the rendered pixmap is mostly white (no product photo)."""
    raw = pix.samples
    if not raw:
        return True
    step   = (pix.n or 3) * 8   # sample every 8th pixel
    sample = raw[::step]
    return (sum(sample) / len(sample)) > threshold if sample else True


# ── Core extraction logic ─────────────────────────────────────────────────────

def extract_images_from_pdf(pdf_path: str, output_dir: str, log, progress_var, progress_max):
    """
    For each page:
      1. Detect the Picture column as the widest horizontal text-free gap (page 1).
      2. Collect part numbers from the 'Our No.' column (the correct side of Picture).
      3. For each part, render just its Picture-cell rectangle at RENDER_DPI.
      4. Skip blank/white cells (product has no photo).
      5. Save non-blank cells as <part_no>.png.

    This works for product images stored as any PDF content type (embedded XObjects,
    Form XObjects, inline images, etc.) because rendering handles them all.
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    progress_max.set(total_pages)

    saved    = 0
    skipped  = 0
    no_photo = 0
    done_parts: set = set()

    # ── 1. Detect Picture column ─────────────────────────────────────────────
    pic_x0, pic_x1 = _detect_picture_column(doc, total_pages)

    if pic_x0 is None:
        # Hard fallback: middle region of the page
        pw     = doc[0].rect.width
        pic_x0 = pw * 0.12
        pic_x1 = pw * 0.38
        log(f"  ⚠  Gap detection failed — using fallback Picture x=[{pic_x0:.0f}–{pic_x1:.0f}]")
    else:
        log(f"  📐 Picture column: x=[{pic_x0:.0f} – {pic_x1:.0f}]  (width {pic_x1-pic_x0:.0f} pt)")

    if pic_x1 <= pic_x0:
        log("  ✗  Detected picture column has zero or negative width — aborting")
        doc.close()
        return 0, 0, 0

    # ── 2. Determine which side of Picture column holds 'Our No.' ────────────
    page0 = doc[0]
    left_cnt = right_cnt = 0
    for block in page0.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                if not PART_PATTERN.match(span["text"].strip()):
                    continue
                x = span["bbox"][0]
                if x < pic_x0 - 5:
                    left_cnt += 1
                elif x > pic_x1 + 5:
                    right_cnt += 1
    our_no_left = left_cnt >= right_cnt
    log(f"  📐 'Our No.' is {'LEFT' if our_no_left else 'RIGHT'} of Picture  (L:{left_cnt} R:{right_cnt})")

    scale = RENDER_DPI / 72
    mat   = fitz.Matrix(scale, scale)
    COL_TOL = 25   # X tolerance when deciding column membership

    for page_num in range(total_pages):
        page  = doc[page_num]
        progress_var.set(page_num + 1)
        page_h = page.rect.height

        # ── 3. Collect part numbers on the 'Our No.' side ────────────────────
        parts = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if not PART_PATTERN.match(text) or text in done_parts:
                        continue
                    x0 = span["bbox"][0]
                    if our_no_left  and x0 >= pic_x0 - COL_TOL:
                        continue   # right side — not Our No.
                    if not our_no_left and x0 <= pic_x1 + COL_TOL:
                        continue   # left side — not Our No.
                    y_mid = (span["bbox"][1] + span["bbox"][3]) / 2
                    parts.append({"no": text, "y": y_mid})

        if not parts:
            continue

        parts.sort(key=lambda p: p["y"])

        # ── 4. Render each row's Picture cell; skip if blank ─────────────────
        for i, part in enumerate(parts):
            # Row boundaries: midpoints between adjacent part numbers
            y_top = HEADER_Y if i == 0 else (parts[i-1]["y"] + part["y"]) / 2
            y_bot = (page_h - 15) if i == len(parts)-1 else (part["y"] + parts[i+1]["y"]) / 2
            y_top = max(HEADER_Y, y_top - 3)
            y_bot = min(page_h,   y_bot + 3)

            if y_bot - y_top < 5 or pic_x1 - pic_x0 < 5:
                continue   # degenerate cell — skip

            clip = fitz.Rect(pic_x0, y_top, pic_x1, y_bot)
            try:
                pix = page.get_pixmap(matrix=mat, clip=clip, colorspace=fitz.csRGB)
            except Exception as e:
                log(f"  ✗ Page {page_num+1}: render error {part['no']} — {e}")
                skipped += 1
                continue

            if _is_blank(pix):
                no_photo += 1
                continue   # empty cell — this product has no photo in the PDF

            filename = f"{part['no']}.png"
            filepath = os.path.join(output_dir, filename)
            try:
                pix.save(filepath)
                done_parts.add(part["no"])
                log(f"  ✓ Page {page_num+1}: {filename}  ({pix.width}×{pix.height}px)")
                saved += 1
            except Exception as e:
                log(f"  ✗ Page {page_num+1}: error saving {part['no']} — {e}")
                skipped += 1

    doc.close()
    return saved, skipped, no_photo


# ── UI ────────────────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Catalogue Image Extractor")
        self.geometry("640x520")
        self.resizable(True, True)
        self.configure(bg=BG)

        self._pdf_path    = tk.StringVar()
        self._output_dir  = tk.StringVar(value=str(Path.home() / "catalogue_images"))
        self._progress    = tk.IntVar(value=0)
        self._prog_max    = tk.IntVar(value=100)
        self._running     = False

        self._build_ui()

        if fitz is None:
            self._log("⚠  PyMuPDF not installed.\n   Run:  pip install PyMuPDF\n   Then restart this app.\n")

    # ── layout ────────────────────────────────────────────────────────────────
    def _build_ui(self):
        pad = {"padx": 16, "pady": 6}

        # Title
        tk.Label(self, text="Catalogue Image Extractor", bg=BG, fg=ACCENT,
                 font=("Segoe UI", 14, "bold")).pack(anchor="w", padx=16, pady=(14, 2))
        tk.Label(self, text="Extracts product images from a PDF and names them by part number.",
                 bg=BG, fg=FG2, font=FONT).pack(anchor="w", padx=16, pady=(0, 10))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=16)

        # PDF file row
        frm1 = tk.Frame(self, bg=BG)
        frm1.pack(fill="x", **pad)
        tk.Label(frm1, text="PDF File:", bg=BG, fg=FG, font=FONT, width=12, anchor="w").pack(side="left")
        tk.Entry(frm1, textvariable=self._pdf_path, bg=SURFACE, fg=FG, insertbackground=FG,
                 relief="flat", font=FONT).pack(side="left", fill="x", expand=True, padx=(0, 8))
        tk.Button(frm1, text="Browse…", command=self._pick_pdf,
                  bg=SURFACE, fg=ACCENT, relief="flat", font=FONT, cursor="hand2").pack(side="left")

        # Output folder row
        frm2 = tk.Frame(self, bg=BG)
        frm2.pack(fill="x", **pad)
        tk.Label(frm2, text="Save To:", bg=BG, fg=FG, font=FONT, width=12, anchor="w").pack(side="left")
        tk.Entry(frm2, textvariable=self._output_dir, bg=SURFACE, fg=FG, insertbackground=FG,
                 relief="flat", font=FONT).pack(side="left", fill="x", expand=True, padx=(0, 8))
        tk.Button(frm2, text="Browse…", command=self._pick_dir,
                  bg=SURFACE, fg=ACCENT, relief="flat", font=FONT, cursor="hand2").pack(side="left")

        # Info box
        info_frm = tk.Frame(self, bg=SURFACE, bd=0)
        info_frm.pack(fill="x", padx=16, pady=(4, 8))
        tk.Label(info_frm,
                 text="ℹ  Renders each product row's Picture cell directly from the PDF. Blank cells are skipped automatically.",
                 bg=SURFACE, fg=FG2, font=FONT, wraplength=580, justify="left").pack(padx=10, pady=8)

        # Progress bar
        prog_frm = tk.Frame(self, bg=BG)
        prog_frm.pack(fill="x", padx=16, pady=(0, 4))
        self._prog_bar = ttk.Progressbar(prog_frm, variable=self._progress,
                                         maximum=100, mode="determinate", length=400)
        self._prog_bar.pack(side="left", fill="x", expand=True)
        self._prog_label = tk.Label(prog_frm, text="", bg=BG, fg=FG2, font=FONT, width=14)
        self._prog_label.pack(side="left", padx=(10, 0))

        # Buttons
        btn_frm = tk.Frame(self, bg=BG)
        btn_frm.pack(fill="x", padx=16, pady=(0, 8))
        self._start_btn = tk.Button(btn_frm, text="▶  Extract Images", command=self._start,
                                    bg=ACCENT, fg=BG, font=("Segoe UI", 10, "bold"),
                                    relief="flat", cursor="hand2", padx=18, pady=6)
        self._start_btn.pack(side="left")
        tk.Button(btn_frm, text="Open Output Folder", command=self._open_folder,
                  bg=SURFACE, fg=FG, font=FONT, relief="flat", cursor="hand2",
                  padx=12, pady=6).pack(side="left", padx=(10, 0))
        tk.Button(btn_frm, text="Clear Log", command=self._clear_log,
                  bg=SURFACE, fg=FG2, font=FONT, relief="flat", cursor="hand2",
                  padx=12, pady=6).pack(side="right")

        # Log
        self._log_box = scrolledtext.ScrolledText(self, bg=SURFACE, fg=FG, font=MONO,
                                                   relief="flat", state="disabled",
                                                   wrap="word", height=10)
        self._log_box.pack(fill="both", expand=True, padx=16, pady=(0, 14))

    # ── helpers ───────────────────────────────────────────────────────────────
    def _pick_pdf(self):
        path = filedialog.askopenfilename(title="Select supplier catalogue PDF",
                                          filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")])
        if path:
            self._pdf_path.set(path)

    def _pick_dir(self):
        path = filedialog.askdirectory(title="Select output folder")
        if path:
            self._output_dir.set(path)

    def _open_folder(self):
        folder = self._output_dir.get()
        if os.path.isdir(folder):
            os.startfile(folder)
        else:
            messagebox.showinfo("Not found", "Output folder doesn't exist yet — run extraction first.")

    def _clear_log(self):
        self._log_box.configure(state="normal")
        self._log_box.delete("1.0", "end")
        self._log_box.configure(state="disabled")

    def _log(self, msg: str):
        """Thread-safe log append."""
        def _append():
            self._log_box.configure(state="normal")
            self._log_box.insert("end", msg + "\n")
            self._log_box.see("end")
            self._log_box.configure(state="disabled")
        self.after(0, _append)

    def _set_progress(self, value: int):
        def _upd():
            self._progress.set(value)
            total = self._prog_max.get()
            self._prog_bar.configure(maximum=max(total, 1))
            self._prog_label.configure(text=f"Page {value} / {total}")
        self.after(0, _upd)

    # ── extraction ────────────────────────────────────────────────────────────
    def _start(self):
        if fitz is None:
            messagebox.showerror("Missing library", "Install PyMuPDF first:\n\n  pip install PyMuPDF")
            return

        pdf = self._pdf_path.get().strip()
        out = self._output_dir.get().strip()

        if not pdf or not os.path.isfile(pdf):
            messagebox.showerror("No file", "Please select a PDF file first.")
            return
        if not out:
            messagebox.showerror("No folder", "Please select an output folder.")
            return

        os.makedirs(out, exist_ok=True)
        self._running = True
        self._start_btn.configure(state="disabled", text="Extracting…")
        self._progress.set(0)
        self._prog_label.configure(text="")

        threading.Thread(target=self._run_extraction, args=(pdf, out), daemon=True).start()

    def _run_extraction(self, pdf: str, out: str):
        self._log(f"PDF:    {pdf}")
        self._log(f"Output: {out}")
        self._log("─" * 60)

        try:
            saved, skipped, no_photo = extract_images_from_pdf(
                pdf, out,
                log=self._log,
                progress_var=type("V", (), {"set": lambda s, v: self._set_progress(v)})(),
                progress_max=self._prog_max,
            )
            self._log("─" * 60)
            self._log(f"✅  Done!  {saved} saved · {skipped} errors · {no_photo} blank (no photo)")
            self.after(0, lambda: messagebox.showinfo(
                "Complete",
                f"{saved} images saved to:\n{out}\n\n"
                f"{skipped} errors · {no_photo} products had no photo in PDF"
            ))
        except Exception as e:
            self._log(f"✗ Error: {e}")
            self.after(0, lambda: messagebox.showerror("Error", str(e)))
        finally:
            self.after(0, lambda: self._start_btn.configure(state="normal", text="▶  Extract Images"))
            self._running = False


# ── entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = App()
    app.mainloop()
