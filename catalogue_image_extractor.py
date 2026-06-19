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


# ── Core extraction logic ─────────────────────────────────────────────────────

def extract_images_from_pdf(pdf_path: str, output_dir: str, log, progress_var, progress_max):
    """
    For each page in the PDF:
      1. Collect all text spans that look like part numbers (column C).
      2. Collect all embedded images with their on-page bounding boxes.
      3. Match each image to the nearest part number by Y coordinate.
      4. Save image as <part_no>.<ext> in output_dir.
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    progress_max.set(total_pages)

    saved   = 0
    skipped = 0
    no_match = 0

    for page_num in range(total_pages):
        page = doc[page_num]
        progress_var.set(page_num + 1)

        # ── 1. Collect part numbers with their Y-centre position ──────────────
        part_numbers = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:   # 0 = text block
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    text = span["text"].strip()
                    if PART_PATTERN.match(text):
                        bbox = span["bbox"]        # (x0, y0, x1, y1)
                        y_mid = (bbox[1] + bbox[3]) / 2
                        part_numbers.append({"no": text, "y": y_mid})

        # ── 2. Get all embedded images on this page ───────────────────────────
        img_list = page.get_images(full=True)

        for img_info in img_list:
            xref = img_info[0]

            # Get the rectangle(s) where this image is rendered on the page
            rects = page.get_image_rects(xref)
            if not rects:
                skipped += 1
                continue

            img_y_mid = (rects[0].y0 + rects[0].y1) / 2

            # ── 3. Find closest part number by Y ─────────────────────────────
            if not part_numbers:
                no_match += 1
                continue

            closest = min(part_numbers, key=lambda p: abs(p["y"] - img_y_mid))
            y_gap   = abs(closest["y"] - img_y_mid)

            # Reject if too far away (header logos, decorative images, etc.)
            if y_gap > 100:
                log(f"  ⊘ Page {page_num+1}: no match for image at y={img_y_mid:.0f} (nearest={closest['no']} gap={y_gap:.0f})")
                no_match += 1
                continue

            part_no = closest["no"]

            # ── 4. Extract & save ─────────────────────────────────────────────
            try:
                base_img = doc.extract_image(xref)
                img_bytes = base_img["image"]
                ext       = base_img["ext"]   # "jpeg", "png", etc.

                filename = f"{part_no}.{ext}"
                filepath = os.path.join(output_dir, filename)

                # Skip if already written (same part no appears on multiple pages)
                if os.path.exists(filepath):
                    log(f"  ↷ Page {page_num+1}: {filename} already exists — skipped")
                    skipped += 1
                    continue

                with open(filepath, "wb") as f:
                    f.write(img_bytes)

                log(f"  ✓ Page {page_num+1}: saved {filename}  ({len(img_bytes)//1024} KB)")
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
                 text="ℹ  Images are matched to part numbers (e.g. AK00001, ABP30007) by their row position on each page.",
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
