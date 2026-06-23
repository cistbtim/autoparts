#!/usr/bin/env python3
"""
Catalogue Image Extractor
Renders every product row's Picture cell from the PDF, named by supplier part number.
Requirements:  pip install PyMuPDF
"""

import os
import re
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

try:
    import fitz
except ImportError:
    fitz = None

BG      = "#1e1e2e"
SURFACE = "#313244"
ACCENT  = "#89b4fa"
FG      = "#cdd6f4"
FG2     = "#a6adc8"
FONT    = ("Segoe UI", 9)
MONO    = ("Consolas", 9)

PART_PATTERN = re.compile(r'^[A-Z]{2,4}\d{4,6}[A-Z]?$')
SN_PATTERN   = re.compile(r'^\d+$')

HEADER_Y    = 155   # pt — skip rows above this (logo / column-header row)
OUR_NO_TOL  = 22    # pt — X tolerance for Our No. column
RENDER_DPI  = 200   # DPI for rendered PNG crops


def _detect_columns(doc, total_pages):
    """
    Returns (pic_x0, pic_x1, our_no_x):
      pic_x0    — left edge of Picture column  (median x0 of embedded product images)
      pic_x1    — right edge of Picture column (median x1 of embedded product images)
      our_no_x  — modal left-X of PART_PATTERN text closest to and right of pic_x1

    Embedded images are the authoritative source for picture-column X bounds because
    they are actual product photos placed exactly inside that column.
    S/N right edge is used only as a floor for pic_x0.
    """
    from collections import Counter
    import statistics

    sn_x1_max = 0
    img_x0_list = []
    img_x1_list = []
    part_x_counts = Counter()

    scan_pages = min(10, total_pages)
    for pn in range(scan_pages):
        page = doc[pn]
        pw   = page.rect.width

        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                mid_y = (line["bbox"][1] + line["bbox"][3]) / 2
                if mid_y < HEADER_Y:
                    continue
                for span in line["spans"]:
                    txt = span["text"].strip()
                    x0  = span["bbox"][0]
                    x1  = span["bbox"][2]
                    if PART_PATTERN.match(txt):
                        part_x_counts[round(x0 / 5) * 5] += 1
                    elif SN_PATTERN.match(txt) and x0 < pw * 0.15:
                        sn_x1_max = max(sn_x1_max, x1)

        for img_info in page.get_images(full=True):
            xref = img_info[0]
            w    = img_info[2]
            h    = img_info[3]
            if w < 30 or h < 30:
                continue
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            if (r.y0 + r.y1) / 2 < HEADER_Y:
                continue   # header / logo
            col_w = r.x1 - r.x0
            if col_w < 10 or col_w > pw * 0.6:
                continue   # too narrow or full-page scan
            img_x0_list.append(r.x0)
            img_x1_list.append(r.x1)

    # Picture column bounds from embedded images (median is robust to outliers)
    if img_x0_list and img_x1_list:
        pic_x0 = statistics.median(img_x0_list)
        pic_x1 = statistics.median(img_x1_list)
    else:
        sn_x1  = sn_x1_max if sn_x1_max > 0 else 45
        pic_x0 = sn_x1 + 8
        pic_x1 = pic_x0 + 90   # fallback: assume 90pt wide picture column

    # Our No. column = leftmost PART_PATTERN column clearly right of picture column
    our_no_x = 0
    for x, _ in sorted(part_x_counts.items()):
        if x > pic_x1 + 5:
            our_no_x = x
            break
    if our_no_x == 0:
        our_no_x = part_x_counts.most_common(1)[0][0] if part_x_counts else pic_x1 + 20

    # Ensure pic_x0 is right of S/N column
    sn_floor = sn_x1_max + 8 if sn_x1_max > 0 else 0
    if pic_x0 < sn_floor:
        pic_x0 = sn_floor

    return pic_x0, pic_x1, our_no_x


def extract_images_from_pdf(pdf_path, output_dir, log, progress_var, progress_max):
    """
    For every page:
      1. Find all Our No. part numbers (modal X column) — these define the rows.
      2. Find all S/N numbers to help bound each row vertically.
      3. The Picture column is between the S/N right edge and the Our No. left edge.
      4. For each part, clip that row's Picture cell and save as {part_no}.png.
         ALL rows are saved — blank or not.
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    progress_max.set(total_pages)

    pic_x0, pic_x1, our_no_x = _detect_columns(doc, total_pages)

    log(f"  Picture column : x=[{pic_x0:.0f} — {pic_x1:.0f}]  ({pic_x1-pic_x0:.0f} pt wide)")
    log(f"  Our No. col    : x={our_no_x}")

    if pic_x1 - pic_x0 < 10:
        log("  ERROR: picture column too narrow — check PDF layout")
        doc.close()
        return 0, 0, 0

    scale = RENDER_DPI / 72
    mat   = fitz.Matrix(scale, scale)

    saved      = 0
    skipped    = 0
    done_parts = set()

    for page_num in range(total_pages):
        page   = doc[page_num]
        page_h = page.rect.height
        progress_var.set(page_num + 1)

        # Collect Our No. parts on this page (Our No. column only)
        parts = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    txt = span["text"].strip()
                    if not PART_PATTERN.match(txt):
                        continue
                    if txt in done_parts:
                        continue
                    if abs(span["bbox"][0] - our_no_x) > OUR_NO_TOL:
                        continue
                    y_mid = (span["bbox"][1] + span["bbox"][3]) / 2
                    if y_mid < HEADER_Y:
                        continue
                    parts.append({"no": txt, "y": y_mid})

        if not parts:
            continue

        parts.sort(key=lambda p: p["y"])

        # Crop picture cell for each row and save
        for i, part in enumerate(parts):
            y_top = HEADER_Y if i == 0 else (parts[i-1]["y"] + part["y"]) / 2
            y_bot = page_h - 5 if i == len(parts) - 1 else (part["y"] + parts[i+1]["y"]) / 2
            y_top = max(HEADER_Y, y_top - 2)
            y_bot = min(page_h,   y_bot + 2)

            clip = fitz.Rect(pic_x0, y_top, pic_x1, y_bot)
            if clip.width < 1 or clip.height < 1:
                continue

            try:
                pix = page.get_pixmap(matrix=mat, clip=clip, colorspace=fitz.csRGB)
            except Exception as e:
                log(f"  ERR p{page_num+1} {part['no']}: render — {e}")
                skipped += 1
                continue

            filename = f"{part['no']}.png"
            filepath = os.path.join(output_dir, filename)
            try:
                pix.save(filepath)
                done_parts.add(part["no"])
                log(f"  OK  p{page_num+1}: {filename}  ({pix.width}x{pix.height}px)")
                saved += 1
            except Exception as e:
                log(f"  ERR p{page_num+1} {part['no']}: save — {e}")
                skipped += 1

    doc.close()
    return saved, skipped, 0


# ── UI ────────────────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Catalogue Image Extractor")
        self.geometry("680x560")
        self.resizable(True, True)
        self.configure(bg=BG)

        self._pdf_path   = tk.StringVar()
        self._output_dir = tk.StringVar(value=str(Path.home() / "catalogue_images"))
        self._progress   = tk.IntVar(value=0)
        self._prog_max   = tk.IntVar(value=100)
        self._running    = False

        self._build_ui()

        if fitz is None:
            self._log("PyMuPDF not installed. Run:  pip install PyMuPDF  then restart.\n")

    def _build_ui(self):
        pad = {"padx": 16, "pady": 6}

        tk.Label(self, text="Catalogue Image Extractor", bg=BG, fg=ACCENT,
                 font=("Segoe UI", 14, "bold")).pack(anchor="w", padx=16, pady=(14, 2))
        tk.Label(self, text="Crops and saves every product photo from the PDF, named by part number.",
                 bg=BG, fg=FG2, font=FONT).pack(anchor="w", padx=16, pady=(0, 10))

        ttk.Separator(self, orient="horizontal").pack(fill="x", padx=16)

        frm1 = tk.Frame(self, bg=BG)
        frm1.pack(fill="x", **pad)
        tk.Label(frm1, text="PDF File:", bg=BG, fg=FG, font=FONT, width=12, anchor="w").pack(side="left")
        tk.Entry(frm1, textvariable=self._pdf_path, bg=SURFACE, fg=FG, insertbackground=FG,
                 relief="flat", font=FONT).pack(side="left", fill="x", expand=True, padx=(0, 8))
        tk.Button(frm1, text="Browse...", command=self._pick_pdf,
                  bg=SURFACE, fg=ACCENT, relief="flat", font=FONT, cursor="hand2").pack(side="left")

        frm2 = tk.Frame(self, bg=BG)
        frm2.pack(fill="x", **pad)
        tk.Label(frm2, text="Save To:", bg=BG, fg=FG, font=FONT, width=12, anchor="w").pack(side="left")
        tk.Entry(frm2, textvariable=self._output_dir, bg=SURFACE, fg=FG, insertbackground=FG,
                 relief="flat", font=FONT).pack(side="left", fill="x", expand=True, padx=(0, 8))
        tk.Button(frm2, text="Browse...", command=self._pick_dir,
                  bg=SURFACE, fg=ACCENT, relief="flat", font=FONT, cursor="hand2").pack(side="left")

        info_frm = tk.Frame(self, bg=SURFACE)
        info_frm.pack(fill="x", padx=16, pady=(4, 8))
        tk.Label(info_frm,
                 text="Renders each row's Picture cell by cropping between the S/N column and the Our No. column. All rows saved as PNG.",
                 bg=SURFACE, fg=FG2, font=FONT, wraplength=600, justify="left").pack(padx=10, pady=8)

        prog_frm = tk.Frame(self, bg=BG)
        prog_frm.pack(fill="x", padx=16, pady=(0, 4))
        self._prog_bar = ttk.Progressbar(prog_frm, variable=self._progress,
                                         maximum=100, mode="determinate")
        self._prog_bar.pack(side="left", fill="x", expand=True)
        self._prog_label = tk.Label(prog_frm, text="", bg=BG, fg=FG2, font=FONT, width=14)
        self._prog_label.pack(side="left", padx=(10, 0))

        btn_frm = tk.Frame(self, bg=BG)
        btn_frm.pack(fill="x", padx=16, pady=(0, 8))
        self._start_btn = tk.Button(btn_frm, text="Extract Images", command=self._start,
                                    bg=ACCENT, fg=BG, font=("Segoe UI", 10, "bold"),
                                    relief="flat", cursor="hand2", padx=18, pady=6)
        self._start_btn.pack(side="left")
        tk.Button(btn_frm, text="Open Folder", command=self._open_folder,
                  bg=SURFACE, fg=FG, font=FONT, relief="flat", cursor="hand2",
                  padx=12, pady=6).pack(side="left", padx=(10, 0))
        tk.Button(btn_frm, text="Clear Log", command=self._clear_log,
                  bg=SURFACE, fg=FG2, font=FONT, relief="flat", cursor="hand2",
                  padx=12, pady=6).pack(side="right")

        self._log_box = scrolledtext.ScrolledText(self, bg=SURFACE, fg=FG, font=MONO,
                                                   relief="flat", state="disabled",
                                                   wrap="word", height=12)
        self._log_box.pack(fill="both", expand=True, padx=16, pady=(0, 14))

    def _pick_pdf(self):
        p = filedialog.askopenfilename(filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")])
        if p:
            self._pdf_path.set(p)

    def _pick_dir(self):
        p = filedialog.askdirectory()
        if p:
            self._output_dir.set(p)

    def _open_folder(self):
        d = self._output_dir.get()
        if os.path.isdir(d):
            os.startfile(d)
        else:
            messagebox.showinfo("Not found", "Run extraction first.")

    def _clear_log(self):
        self._log_box.configure(state="normal")
        self._log_box.delete("1.0", "end")
        self._log_box.configure(state="disabled")

    def _log(self, msg):
        def _do():
            self._log_box.configure(state="normal")
            self._log_box.insert("end", msg + "\n")
            self._log_box.see("end")
            self._log_box.configure(state="disabled")
        self.after(0, _do)

    def _set_progress(self, v):
        def _do():
            total = self._prog_max.get()
            self._prog_bar.configure(maximum=max(total, 1))
            self._progress.set(v)
            self._prog_label.configure(text=f"Page {v} / {total}")
        self.after(0, _do)

    def _start(self):
        if fitz is None:
            messagebox.showerror("Missing", "pip install PyMuPDF")
            return
        pdf = self._pdf_path.get().strip()
        out = self._output_dir.get().strip()
        if not pdf or not os.path.isfile(pdf):
            messagebox.showerror("No file", "Select a PDF first.")
            return
        os.makedirs(out, exist_ok=True)
        self._running = True
        self._start_btn.configure(state="disabled", text="Extracting...")
        self._progress.set(0)
        self._prog_label.configure(text="")
        threading.Thread(target=self._run, args=(pdf, out), daemon=True).start()

    def _run(self, pdf, out):
        self._log(f"PDF:    {pdf}")
        self._log(f"Output: {out}")
        self._log("-" * 60)
        try:
            saved, skipped, _ = extract_images_from_pdf(
                pdf, out,
                log=self._log,
                progress_var=type("V", (), {"set": lambda s, v: self._set_progress(v)})(),
                progress_max=self._prog_max,
            )
            self._log("-" * 60)
            self._log(f"Done!  {saved} saved   {skipped} errors")
            self.after(0, lambda: messagebox.showinfo("Done", f"{saved} images saved to:\n{out}"))
        except Exception as e:
            self._log(f"ERROR: {e}")
            self.after(0, lambda: messagebox.showerror("Error", str(e)))
        finally:
            self.after(0, lambda: self._start_btn.configure(state="normal", text="Extract Images"))
            self._running = False


if __name__ == "__main__":
    App().mainloop()
