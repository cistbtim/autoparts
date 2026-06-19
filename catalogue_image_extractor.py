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

HEADER_Y = 155   # PDF points — content below this is the table body
MIN_PX   = 30    # skip images smaller than 30×30 px
Y_MAX_GAP = 150  # reject match if part-number Y is more than 150pt from image Y


def _detect_picture_column(doc, total_pages):
    """
    Find the X bounds of the Picture column by looking at the first non-header
    embedded image.  Returns (pic_x0, pic_x1) or (None, None) if not found.
    """
    for pn in range(min(5, total_pages)):
        page = doc[pn]
        for img_info in page.get_images(full=True):
            xref, _sm, w, h = img_info[0], img_info[1], img_info[2], img_info[3]
            if w < MIN_PX or h < MIN_PX:
                continue
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r = rects[0]
            if (r.y0 + r.y1) / 2 < HEADER_Y:
                continue  # skip company logo / header row
            if r.x1 - r.x0 > 10:
                return r.x0 - 5, r.x1 + 5
    return None, None


# ── Core extraction logic ─────────────────────────────────────────────────────

def extract_images_from_pdf(pdf_path: str, output_dir: str, log, progress_var, progress_max):
    """
    For each page:
      1. Detect the Picture column X range from the first embedded product image.
      2. Collect part numbers that are NOT inside the Picture column.
         Determine whether 'Our No.' is to the left or right of Picture and
         keep only that side (eliminates OEM/cross-ref numbers on the other side).
      3. Extract each embedded image that falls inside the Picture column.
      4. Match image to nearest part number by Y distance.
      5. Save as <part_no>.<ext>  (jpeg/png, whatever is embedded).

    Note: this PDF has exactly 1 product photo per page (374 pages = 374 photos).
    Products without a photo in the PDF will not be extracted — that is expected.
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    progress_max.set(total_pages)

    saved    = 0
    skipped  = 0
    no_match = 0
    done_parts: set = set()

    # ── Detect Picture column X bounds from first embedded image ─────────────
    pic_x0, pic_x1 = _detect_picture_column(doc, total_pages)
    if pic_x0 is not None:
        log(f"  📐 Picture column detected: x=[{pic_x0:.0f} – {pic_x1:.0f}]")
    else:
        log("  ⚠  Could not auto-detect Picture column X — using Y-only matching")

    # Detect which side of Picture column 'Our No.' is on (left or right).
    # Check page 1 only; apply the same rule to all pages.
    our_no_left: bool | None = None  # True = Our No. is left of Picture
    if pic_x0 is not None:
        page0 = doc[0]
        left_count = right_count = 0
        for block in page0.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    if not PART_PATTERN.match(span["text"].strip()):
                        continue
                    x0 = span["bbox"][0]
                    if x0 < pic_x0:
                        left_count += 1
                    elif x0 > pic_x1:
                        right_count += 1
        our_no_left = left_count > right_count
        side_str = "LEFT" if our_no_left else "RIGHT"
        log(f"  📐 'Our No.' column is {side_str} of Picture  (L:{left_count} R:{right_count})")

    for page_num in range(total_pages):
        page = doc[page_num]
        progress_var.set(page_num + 1)

        # ── 1. Collect part numbers on the 'Our No.' side of Picture ─────────
        parts = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if not PART_PATTERN.match(text) or text in done_parts:
                        continue
                    x0   = span["bbox"][0]
                    y_mid = (span["bbox"][1] + span["bbox"][3]) / 2
                    # Filter by column side
                    if pic_x0 is not None:
                        if our_no_left and x0 >= pic_x0:
                            continue   # skip — not on the left side
                        if not our_no_left and x0 <= pic_x1:
                            continue   # skip — not on the right side
                    parts.append({"no": text, "y": y_mid})

        if not parts:
            continue

        # ── 2. Collect embedded images inside the Picture column ──────────────
        images = []
        seen_y: set = set()
        for img_info in page.get_images(full=True):
            xref, _sm, w, h = img_info[0], img_info[1], img_info[2], img_info[3]
            if w < MIN_PX or h < MIN_PX:
                continue
            rects = page.get_image_rects(xref)
            if not rects:
                continue
            r     = rects[0]
            y_mid = (r.y0 + r.y1) / 2
            if y_mid < HEADER_Y:
                continue   # skip header logo
            # Keep only images that overlap the Picture column
            if pic_x0 is not None and not (r.x0 < pic_x1 + 20 and r.x1 > pic_x0 - 20):
                continue
            y_key = round(y_mid / 10) * 10
            if y_key in seen_y:
                continue   # deduplicate JPEG + PNG at same position
            seen_y.add(y_key)
            images.append({"xref": xref, "y": y_mid})

        if not images:
            no_match += 1
            continue

        # ── 3. Match each image to nearest part number by Y ──────────────────
        for img in images:
            closest = min(parts, key=lambda p: abs(p["y"] - img["y"]))
            gap     = abs(closest["y"] - img["y"])
            part_no = closest["no"]

            if part_no in done_parts:
                continue
            if gap > Y_MAX_GAP:
                log(f"  ⊘ Page {page_num+1}: image y={img['y']:.0f} too far from {part_no} (gap={gap:.0f})")
                no_match += 1
                continue

            try:
                bi       = doc.extract_image(img["xref"])
                filename = f"{part_no}.{bi['ext']}"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(bi["image"])
                done_parts.add(part_no)
                log(f"  ✓ Page {page_num+1}: {filename}  ({len(bi['image'])//1024} KB)")
                saved += 1
            except Exception as e:
                log(f"  ✗ Page {page_num+1}: error saving {part_no} — {e}")
                skipped += 1

    doc.close()
    return saved, skipped, no_match


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
                 text="ℹ  Extracts embedded product images. Auto-detects the Picture column and filters to the supplier 'Our No.' column only (ignores OEM cross-ref numbers).",
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
            saved, skipped, no_match = extract_images_from_pdf(
                pdf, out,
                log=self._log,
                progress_var=type("V", (), {"set": lambda s, v: self._set_progress(v)})(),
                progress_max=self._prog_max,
            )
            self._log("─" * 60)
            self._log(f"✅  Done!  {saved} saved · {skipped} skipped · {no_match} unmatched")
            self.after(0, lambda: messagebox.showinfo(
                "Complete",
                f"{saved} images saved to:\n{out}\n\n"
                f"{skipped} skipped · {no_match} could not be matched to a part number"
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
