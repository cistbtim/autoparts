#!/usr/bin/env python3
"""
PDF Parts Extractor — Desktop UI
Run:  python pdf_parts_extracter_ui.py
"""

import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

SCRIPT_DIR = Path(__file__).parent

BG      = "#1e1e2e"
SURFACE = "#313244"
ACCENT  = "#89b4fa"
FG      = "#cdd6f4"
FG2     = "#a6adc8"
GREEN   = "#a6e3a1"
RED_C   = "#f38ba8"
FONT    = ("Segoe UI", 9)
MONO    = ("Consolas", 9)


def lbl(parent, text, size=9, bold=False, colour=FG, bg=None, **kw):
    f = ("Segoe UI", size, "bold") if bold else ("Segoe UI", size)
    return tk.Label(parent, text=text, bg=bg or BG, fg=colour, font=f, **kw)


def card(parent, title):
    outer = tk.Frame(parent, bg=SURFACE)
    outer.pack(fill="x", padx=16, pady=(8, 0))
    lbl(outer, title, bold=True, colour=ACCENT, bg=SURFACE).pack(anchor="w", padx=12, pady=(8, 2))
    inner = tk.Frame(outer, bg=SURFACE)
    inner.pack(fill="x", padx=12, pady=(0, 10))
    return inner


def ent(parent, var, width=44):
    return tk.Entry(parent, textvariable=var, width=width,
                    bg="#181825", fg=FG, insertbackground=FG, relief="flat", font=MONO)


def num_entry(parent, var, width=6):
    return tk.Entry(parent, textvariable=var, width=width,
                    bg="#181825", fg=FG, insertbackground=FG, relief="flat", font=MONO, justify="center")


def browse_btn(parent, cmd):
    return tk.Button(parent, text="Browse…", command=cmd,
                     bg=SURFACE, fg=ACCENT, font=FONT, relief="flat",
                     activebackground="#45475a", activeforeground=ACCENT,
                     cursor="hand2", padx=8, pady=3)


def row_browse(parent, label_text, var, cmd):
    lbl(parent, label_text, colour=FG2, bg=SURFACE).pack(anchor="w", pady=(4, 0))
    row = tk.Frame(parent, bg=SURFACE)
    row.pack(fill="x", pady=(2, 0))
    ent(row, var).pack(side="left", padx=(0, 8), ipady=4)
    browse_btn(row, cmd).pack(side="left")


def browse_file(var, title, filetypes=None):
    p = filedialog.askopenfilename(title=title, filetypes=filetypes or [("All", "*.*")])
    if p:
        var.set(p)


def browse_folder(var, title):
    p = filedialog.askdirectory(title=title)
    if p:
        var.set(p)


def browse_save(var, title, ext, filetypes):
    p = filedialog.asksaveasfilename(title=title, defaultextension=ext, filetypes=filetypes)
    if p:
        var.set(p)


def run_script(cmd, out_widget, btn, btn_label):
    btn.config(state="disabled", text="Running…")
    out_widget.config(state="normal")
    out_widget.delete("1.0", tk.END)

    def _stream():
        try:
            proc = subprocess.Popen(
                [sys.executable] + cmd,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, cwd=str(SCRIPT_DIR),
                encoding="utf-8", errors="replace",
            )
            for line in proc.stdout:
                out_widget.insert(tk.END, line)
                out_widget.see(tk.END)
                out_widget.update_idletasks()
            proc.wait()
            status = "✓ Done." if proc.returncode == 0 else f"✗ Exit {proc.returncode}"
            colour = GREEN if proc.returncode == 0 else RED_C
            out_widget.insert(tk.END, f"\n{status}\n", "s")
            out_widget.tag_config("s", foreground=colour)
        except Exception as e:
            out_widget.insert(tk.END, f"\nError: {e}\n")
        finally:
            btn.config(state="normal", text=btn_label)

    threading.Thread(target=_stream, daemon=True).start()


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("PDF Parts Extractor")
        self.geometry("860x820")
        self.configure(bg=BG)
        self.resizable(True, True)
        self._style()
        self._build()

    def _style(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        s.configure("TNotebook",     background=BG,      borderwidth=0)
        s.configure("TFrame",        background=BG)
        s.configure("Run.TButton",   background=ACCENT,  foreground=BG,
                    font=("Segoe UI", 10, "bold"), padding=[16, 6])
        s.map("Run.TButton", background=[("active", "#74c7ec"), ("disabled", SURFACE)])

    def _build(self):
        # Header
        hdr = tk.Frame(self, bg=BG)
        hdr.pack(fill="x", padx=16, pady=(12, 4))
        lbl(hdr, "📄  PDF Parts Extractor", size=14, bold=True).pack(side="left")
        lbl(hdr, "Image-folder → cropped part photos + Excel",
            colour=FG2).pack(side="left", padx=14)

        # ── Input ─────────────────────────────────────────────────────────────
        c = card(self, "📂  Input")
        self.img_folder = tk.StringVar()
        row_browse(c, "Page Images Folder  (PNG/JPG of each catalogue page)",
                   self.img_folder,
                   lambda: browse_folder(self.img_folder, "Select page images folder"))

        # ── Output ────────────────────────────────────────────────────────────
        c2 = card(self, "💾  Output")
        self.out_images = tk.StringVar()
        row_browse(c2, "Extracted Part Images Folder",
                   self.out_images,
                   lambda: browse_folder(self.out_images, "Select output images folder"))
        self.out_excel = tk.StringVar()
        row_browse(c2, "Output Excel File (.xlsx)",
                   self.out_excel,
                   lambda: browse_save(self.out_excel, "Save Excel as", ".xlsx",
                                       [("Excel", "*.xlsx"), ("All", "*.*")]))

        # ── Column positions ──────────────────────────────────────────────────
        c3 = card(self, "📐  Column Positions  (% of page width — adjust to match your catalogue)")

        # Header row for the table
        hrow = tk.Frame(c3, bg=SURFACE)
        hrow.pack(fill="x", pady=(4, 2))
        for txt, w in [("Column", 16), ("Left %", 7), ("Right %", 7)]:
            lbl(hrow, txt, colour=FG2, bg=SURFACE, width=w, anchor="w").pack(side="left", padx=(0, 4))

        # One row per column
        self._col_vars = {}
        defaults = [
            ("Picture",     "pic",    21,  32),
            ("Our No.",     "partno", 32, 65),
            ("Description", "desc",   65, 78),
            ("OEM Ref.",    "oem",    78, 91),
            ("Application", "app",    91, 98),
            ("Unit",        "unit",   98, 100),
        ]
        for label, key, x0_def, x1_def in defaults:
            v0 = tk.StringVar(value=str(x0_def))
            v1 = tk.StringVar(value=str(x1_def))
            self._col_vars[key] = (v0, v1)
            row = tk.Frame(c3, bg=SURFACE)
            row.pack(fill="x", pady=2)
            lbl(row, label, bg=SURFACE, colour=FG, width=16, anchor="w").pack(side="left", padx=(0, 4))
            num_entry(row, v0).pack(side="left", ipady=3, padx=(0, 4))
            num_entry(row, v1).pack(side="left", ipady=3)

        # ── Advanced ──────────────────────────────────────────────────────────
        c4 = card(self, "⚙️  Advanced")

        lbl(c4, "Part Number Pattern (regex):", colour=FG2, bg=SURFACE).pack(anchor="w", pady=(4, 0))
        self.pattern = tk.StringVar(value=r"^[A-Z]{1,5}\d{3,8}[A-Z0-9]?$")
        tk.Entry(c4, textvariable=self.pattern, width=46,
                 bg="#181825", fg=FG, insertbackground=FG, relief="flat", font=MONO
                 ).pack(anchor="w", ipady=4, pady=(2, 8))

        lbl(c4, "Tesseract path (blank if tesseract is in PATH):", colour=FG2, bg=SURFACE).pack(anchor="w")
        trow = tk.Frame(c4, bg=SURFACE)
        trow.pack(fill="x", pady=(2, 0))
        self.tesseract = tk.StringVar()
        ent(trow, self.tesseract).pack(side="left", padx=(0, 8), ipady=4)
        browse_btn(trow,
                   lambda: browse_file(self.tesseract, "Find tesseract.exe",
                                       [("Exe", "*.exe"), ("All", "*.*")])
                   ).pack(side="left")
        lbl(c4, "  e.g. C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
            colour=FG2, bg=SURFACE).pack(anchor="w")

        # ── Run ───────────────────────────────────────────────────────────────
        run_row = tk.Frame(self, bg=BG)
        run_row.pack(pady=10)
        self.run_btn = ttk.Button(run_row, text="▶  Extract Parts",
                                  style="Run.TButton", command=self._run)
        self.run_btn.pack(side="left", padx=(0, 16))

        self.preview_var = tk.BooleanVar(value=False)
        tk.Checkbutton(run_row, text="Save column preview image",
                       variable=self.preview_var,
                       bg=BG, fg=FG2, selectcolor="#181825",
                       activebackground=BG, activeforeground=FG,
                       font=FONT).pack(side="left")

        # ── Output console ────────────────────────────────────────────────────
        of = tk.Frame(self, bg=BG)
        of.pack(fill="both", expand=True, padx=16, pady=(0, 12))
        hdr2 = tk.Frame(of, bg=BG)
        hdr2.pack(fill="x")
        lbl(hdr2, "Output", colour=FG2).pack(side="left")
        ttk.Button(hdr2, text="Clear",
                   command=lambda: (self.output.config(state="normal"),
                                    self.output.delete("1.0", tk.END),
                                    self.output.config(state="disabled"))
                   ).pack(side="right")
        self.output = scrolledtext.ScrolledText(
            of, height=8, state="disabled",
            bg="#181825", fg=FG, font=MONO, relief="flat", padx=8, pady=8)
        self.output.pack(fill="both", expand=True, pady=(4, 0))

    def _run(self):
        imgs = self.img_folder.get().strip()
        oimg = self.out_images.get().strip()
        oxls = self.out_excel.get().strip()

        if not imgs:
            messagebox.showwarning("Missing", "Please select the page images folder.")
            return
        if not oimg:
            messagebox.showwarning("Missing", "Please select an output folder for part images.")
            return
        if not oxls:
            messagebox.showwarning("Missing", "Please specify the output Excel file path.")
            return

        cv = self._col_vars
        cmd = [
            "pdf_parts_extracter.py",
            "--images",          imgs,
            "--out-images",      oimg,
            "--out-excel",       oxls,
            "--pattern",         self.pattern.get().strip() or r"^[A-Z]{1,5}\d{3,8}[A-Z0-9]?$",
            "--pic-x0",          cv["pic"][0].get()    or "21",
            "--pic-x1",          cv["pic"][1].get()    or "32",
            "--col-partno-x0",   cv["partno"][0].get() or "32",
            "--col-partno-x1",   cv["partno"][1].get() or "65",
            "--col-desc-x0",     cv["desc"][0].get()   or "65",
            "--col-desc-x1",     cv["desc"][1].get()   or "78",
            "--col-oem-x0",      cv["oem"][0].get()    or "78",
            "--col-oem-x1",      cv["oem"][1].get()    or "91",
            "--col-app-x0",      cv["app"][0].get()    or "91",
            "--col-app-x1",      cv["app"][1].get()    or "98",
            "--col-unit-x0",     cv["unit"][0].get()   or "98",
            "--col-unit-x1",     cv["unit"][1].get()   or "100",
        ]
        tess = self.tesseract.get().strip()
        if tess:
            cmd += ["--tesseract", tess]

        if self.preview_var.get():
            cmd.append("--preview")

        run_script(cmd, self.output, self.run_btn, "▶  Extract Parts")


if __name__ == "__main__":
    App().mainloop()
