#!/usr/bin/env python3
"""
Vehicle Photo Manager — Desktop UI
Run:  python photo_manager_ui.py
"""

import io
import subprocess
import sys
import tempfile
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

SCRIPT_DIR   = Path(__file__).parent
CLEANED_DIR  = SCRIPT_DIR / "cleaned_photos"
CLEANED_DIR.mkdir(exist_ok=True)

# ── colours ───────────────────────────────────────────────────────────────────
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

# ── shared helpers ────────────────────────────────────────────────────────────

def run_script(cmd, out, btn, btn_label="Run"):
    btn.config(state="disabled", text="Running…")
    out.config(state="normal")
    out.delete("1.0", tk.END)

    def _stream():
        try:
            proc = subprocess.Popen(
                [sys.executable] + cmd,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, cwd=str(SCRIPT_DIR),
                encoding="utf-8", errors="replace",
            )
            for line in proc.stdout:
                out.insert(tk.END, line)
                out.see(tk.END)
                out.update_idletasks()
            proc.wait()
            status = "✓ Finished." if proc.returncode == 0 else f"✗ Exit code {proc.returncode}"
            colour = GREEN if proc.returncode == 0 else RED_C
            out.insert(tk.END, f"\n{status}\n", "status")
            out.tag_config("status", foreground=colour)
        except Exception as exc:
            out.insert(tk.END, f"\nError: {exc}\n")
        finally:
            btn.config(state="normal", text=btn_label)

    threading.Thread(target=_stream, daemon=True).start()


def lbl(parent, text, size=9, bold=False, colour=FG, bg=None, **kw):
    f = ("Segoe UI", size, "bold") if bold else ("Segoe UI", size)
    return tk.Label(parent, text=text, bg=bg or BG, fg=colour, font=f, **kw)


def card(parent, title):
    outer = tk.Frame(parent, bg=SURFACE)
    outer.pack(fill="x", padx=16, pady=(10, 0))
    lbl(outer, title, bold=True, colour=ACCENT, bg=SURFACE).pack(anchor="w", padx=12, pady=(8, 2))
    inner = tk.Frame(outer, bg=SURFACE)
    inner.pack(fill="x", padx=12, pady=(0, 10))
    return inner


def ent(parent, var, width=40):
    return tk.Entry(parent, textvariable=var, width=width,
                    bg="#181825", fg=FG, insertbackground=FG, relief="flat", font=MONO)


def chk(parent, text, var):
    return tk.Checkbutton(parent, text=text, variable=var,
                          bg=SURFACE, fg=FG, selectcolor="#181825",
                          activebackground=SURFACE, activeforeground=FG, font=FONT)


def rad(parent, text, var, value):
    return tk.Radiobutton(parent, text=text, variable=var, value=value,
                          bg=SURFACE, fg=FG, selectcolor="#181825",
                          activebackground=SURFACE, activeforeground=FG, font=FONT)


# ── Paste & Clean tab ─────────────────────────────────────────────────────────

class PasteCleanTab:
    CANVAS_W = 640
    CANVAS_H = 400

    def __init__(self, notebook):
        self.tab = ttk.Frame(notebook)
        notebook.add(self.tab, text="  ✂️  Paste & Clean  ")

        self.orig_pil  = None   # original PIL image
        self.work_pil  = None   # current working copy (after previous removes)
        self.scale     = 1.0
        self.rects     = []     # confirmed rectangles (canvas coords)
        self._drag_start = None
        self._cur_rect   = None

        self._build()
        # Bind Ctrl+V globally
        notebook.winfo_toplevel().bind("<Control-v>", lambda e: self._paste())
        notebook.winfo_toplevel().bind("<Control-V>", lambda e: self._paste())

    def _build(self):
        top = tk.Frame(self.tab, bg=BG)
        top.pack(fill="x", padx=16, pady=(10, 4))

        # Buttons row
        btn_row = tk.Frame(top, bg=BG)
        btn_row.pack(fill="x")

        self._btn("📋 Paste (Ctrl+V)", btn_row, self._paste, ACCENT).pack(side="left", padx=(0, 6))
        self._btn("🔍 Auto-detect Logo", btn_row, self._auto_detect, "#cba6f7").pack(side="left", padx=(0, 6))
        self._btn("✂️ Remove Selection", btn_row, self._remove_selection, YELLOW).pack(side="left", padx=(0, 6))
        self._btn("↩ Undo Last Remove", btn_row, self._undo, FG2).pack(side="left", padx=(0, 6))
        self._btn("🗑 Clear Selections", btn_row, self._clear_rects, FG2).pack(side="left", padx=(0, 6))

        btn_row2 = tk.Frame(top, bg=BG)
        btn_row2.pack(fill="x", pady=(6, 0))
        self._btn("💾 Save As…", btn_row2, self._save_as, GREEN).pack(side="left", padx=(0, 6))
        self._btn("📋 Copy to Clipboard", btn_row2, self._copy_clipboard, GREEN).pack(side="left", padx=(0, 6))

        self.status_var = tk.StringVar(value="Paste an image (Ctrl+V) or click Paste button")
        lbl(top, "", colour=FG2, textvariable=self.status_var).pack(anchor="w", pady=(6, 0))

        # Canvas
        canvas_frame = tk.Frame(self.tab, bg="#181825", relief="flat")
        canvas_frame.pack(fill="both", expand=True, padx=16, pady=(4, 16))

        self.canvas = tk.Canvas(canvas_frame,
                                bg="#181825", highlightthickness=0,
                                cursor="crosshair")
        self.canvas.pack(fill="both", expand=True)

        self.canvas.bind("<ButtonPress-1>",   self._on_press)
        self.canvas.bind("<B1-Motion>",       self._on_drag)
        self.canvas.bind("<ButtonRelease-1>", self._on_release)

    def _btn(self, text, parent, cmd, colour=ACCENT):
        return tk.Button(parent, text=text, command=cmd,
                         bg=colour, fg=BG, font=("Segoe UI", 9, "bold"),
                         relief="flat", padx=10, pady=4,
                         activebackground="#74c7ec", activeforeground=BG,
                         cursor="hand2")

    # ── paste ──────────────────────────────────────────────────────────────────

    def _paste(self):
        try:
            from PIL import ImageGrab
            img = ImageGrab.grabclipboard()
            if img is None:
                self._status("⚠  Nothing in clipboard. Copy an image first.", RED_C)
                return
            if not hasattr(img, "size"):
                self._status("⚠  Clipboard does not contain an image.", RED_C)
                return
            self.orig_pil  = img.convert("RGB")
            self.work_pil  = self.orig_pil.copy()
            self._history  = []
            self.rects     = []
            self._render()
            self._status(f"✓ Image pasted  ({img.width}×{img.height})  — drag to select area to remove", GREEN)
        except Exception as e:
            self._status(f"⚠  Paste failed: {e}", RED_C)

    # ── canvas rendering ───────────────────────────────────────────────────────

    def _render(self):
        if self.work_pil is None:
            return
        from PIL import ImageTk
        cw = self.canvas.winfo_width()  or self.CANVAS_W
        ch = self.canvas.winfo_height() or self.CANVAS_H
        img = self.work_pil.copy()
        sx = cw / img.width
        sy = ch / img.height
        self.scale = min(sx, sy, 1.0)
        nw = max(1, int(img.width  * self.scale))
        nh = max(1, int(img.height * self.scale))
        self._ox = (cw - nw) // 2   # offset x for centering
        self._oy = (ch - nh) // 2   # offset y for centering
        img = img.resize((nw, nh), resample=1)
        self._tk_img = ImageTk.PhotoImage(img)
        self.canvas.delete("all")
        self.canvas.create_image(self._ox, self._oy, anchor="nw", image=self._tk_img)
        # Redraw confirmed rects
        for r in self.rects:
            self.canvas.create_rectangle(*r, outline="#f9e2af", width=2, dash=(4, 2))

    # ── mouse drag ─────────────────────────────────────────────────────────────

    def _on_press(self, e):
        if self.work_pil is None:
            return
        self._drag_start = (e.x, e.y)
        if self._cur_rect:
            self.canvas.delete(self._cur_rect)
        self._cur_rect = None

    def _on_drag(self, e):
        if self._drag_start is None:
            return
        if self._cur_rect:
            self.canvas.delete(self._cur_rect)
        x0, y0 = self._drag_start
        self._cur_rect = self.canvas.create_rectangle(
            x0, y0, e.x, e.y,
            outline=YELLOW, width=2, dash=(4, 2)
        )

    def _on_release(self, e):
        if self._drag_start is None:
            return
        x0, y0 = self._drag_start
        x1, y1 = e.x, e.y
        if abs(x1 - x0) < 5 or abs(y1 - y0) < 5:
            self._drag_start = None
            return
        self.rects.append((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))
        self._drag_start = None
        self._status(f"{len(self.rects)} area(s) selected — click ✂️ Remove Selection", YELLOW)

    # ── remove ─────────────────────────────────────────────────────────────────

    def _canvas_to_img(self, cx, cy):
        return (cx - self._ox) / self.scale, (cy - self._oy) / self.scale

    def _remove_selection(self):
        if not self.rects:
            self._status("⚠  Draw a selection rectangle first.", RED_C)
            return
        if self.work_pil is None:
            return
        try:
            import cv2, numpy as np
            buf = io.BytesIO()
            self.work_pil.save(buf, "PNG")
            arr = np.frombuffer(buf.getvalue(), np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            h, w = img.shape[:2]
            mask = np.zeros((h, w), np.uint8)
            for (cx0, cy0, cx1, cy1) in self.rects:
                ix0, iy0 = self._canvas_to_img(cx0, cy0)
                ix1, iy1 = self._canvas_to_img(cx1, cy1)
                x0 = max(0, int(min(ix0, ix1)))
                y0 = max(0, int(min(iy0, iy1)))
                x1 = min(w, int(max(ix0, ix1)))
                y1 = min(h, int(max(iy0, iy1)))
                mask[y0:y1, x0:x1] = 255
            result = cv2.inpaint(img, mask, inpaintRadius=12, flags=cv2.INPAINT_TELEA)
            from PIL import Image
            if not hasattr(self, "_history"):
                self._history = []
            self._history.append(self.work_pil.copy())
            self.work_pil = Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))
            self.rects = []
            self._render()
            self._status("✓ Area removed. Draw more selections or Save.", GREEN)
        except ImportError:
            self._status("⚠  opencv not installed: pip install opencv-python", RED_C)
        except Exception as e:
            self._status(f"⚠  Error: {e}", RED_C)

    # ── auto-detect ────────────────────────────────────────────────────────────

    def _auto_detect(self):
        if self.work_pil is None:
            self._status("⚠  Paste an image first.", RED_C)
            return
        try:
            import cv2, numpy as np
            buf = io.BytesIO()
            self.work_pil.save(buf, "PNG")
            arr = np.frombuffer(buf.getvalue(), np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            h, w = img.shape[:2]
            search_top = int(h * 0.30)
            roi = img[search_top:, :]
            roi_area = roi.shape[0] * roi.shape[1]
            hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
            lower = np.array([5, 120, 100])
            upper = np.array([22, 255, 255])
            orange = cv2.inRange(hsv, lower, upper)
            ksm = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            klg = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
            orange = cv2.morphologyEx(orange, cv2.MORPH_OPEN,  ksm, iterations=1)
            orange = cv2.morphologyEx(orange, cv2.MORPH_CLOSE, klg, iterations=2)
            contours, _ = cv2.findContours(orange, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            valid = [c for c in contours if roi_area * 0.001 < cv2.contourArea(c) < roi_area * 0.05]
            if not valid:
                self._status("⚠  No orange logo detected automatically — draw selection manually.", YELLOW)
                return
            largest = max(valid, key=cv2.contourArea)
            x, y, bw, bh = cv2.boundingRect(largest)
            y += search_top
            px = min(int(bw * 0.8), 120)
            py = min(int(bh * 0.6), 50)
            ix0, iy0 = max(0, x - px), max(0, y - py)
            ix1, iy1 = min(w, x + bw + px), min(h, y + bh + py)
            # Convert image coords → canvas coords
            cx0 = ix0 * self.scale + self._ox
            cy0 = iy0 * self.scale + self._oy
            cx1 = ix1 * self.scale + self._ox
            cy1 = iy1 * self.scale + self._oy
            self.rects.append((cx0, cy0, cx1, cy1))
            self._render()
            self._status("✓ Logo detected! Click ✂️ Remove Selection to apply.", GREEN)
        except Exception as e:
            self._status(f"⚠  {e}", RED_C)

    # ── undo ───────────────────────────────────────────────────────────────────

    def _undo(self):
        if not hasattr(self, "_history") or not self._history:
            self._status("⚠  Nothing to undo.", FG2)
            return
        self.work_pil = self._history.pop()
        self.rects = []
        self._render()
        self._status("↩ Undone.", YELLOW)

    def _clear_rects(self):
        self.rects = []
        self._render()
        self._status("Selections cleared.", FG2)

    # ── save / clipboard ───────────────────────────────────────────────────────

    def _save_as(self):
        if self.work_pil is None:
            self._status("⚠  No image to save.", RED_C)
            return
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=[("PNG", "*.png"), ("JPEG", "*.jpg"), ("All", "*.*")],
            initialfile="cleaned.png",
            initialdir=str(CLEANED_DIR),
        )
        if path:
            self.work_pil.save(path)
            self._status(f"✓ Saved → {path}", GREEN)

    def _copy_clipboard(self):
        if self.work_pil is None:
            self._status("⚠  No image to copy.", RED_C)
            return
        try:
            import win32clipboard
            from PIL import ImageWin
            buf = io.BytesIO()
            self.work_pil.convert("RGB").save(buf, "BMP")
            bmp_data = buf.getvalue()[14:]   # strip BMP file header
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32clipboard.CF_DIB, bmp_data)
            win32clipboard.CloseClipboard()
            self._status("✓ Copied to clipboard!", GREEN)
        except ImportError:
            # Fallback: save to temp and tell user
            tmp = CLEANED_DIR / "clipboard_result.png"
            self.work_pil.save(str(tmp))
            self._status(f"⚠  pywin32 not installed — saved to {tmp}", YELLOW)
        except Exception as e:
            self._status(f"⚠  {e}", RED_C)

    def _status(self, msg, colour=FG2):
        self.status_var.set(msg)
        # also update colour — find the label widget
        for w in self.tab.winfo_children():
            if isinstance(w, tk.Frame):
                for c in w.winfo_children():
                    if isinstance(c, tk.Frame):
                        for cc in c.winfo_children():
                            if isinstance(cc, tk.Label) and cc.cget("textvariable") != "":
                                try:
                                    cc.config(fg=colour)
                                except Exception:
                                    pass


# ── main App ──────────────────────────────────────────────────────────────────

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Vehicle Photo Manager")
        self.geometry("780x720")
        self.configure(bg=BG)
        self.resizable(True, True)
        self._apply_style()
        self._build_header()

        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=16, pady=4)

        self._build_upload_tab(nb)
        self._build_remove_tab(nb)
        self.paste_tab = PasteCleanTab(nb)

        self._build_output()

    # ── style ─────────────────────────────────────────────────────────────────

    def _apply_style(self):
        s = ttk.Style(self)
        s.theme_use("clam")
        s.configure("TNotebook",     background=BG,      borderwidth=0)
        s.configure("TNotebook.Tab", background=SURFACE, foreground=FG2, padding=[12, 6])
        s.map("TNotebook.Tab",
              background=[("selected", ACCENT)],
              foreground=[("selected", BG)])
        s.configure("TFrame",  background=BG)
        s.configure("Run.TButton", background=ACCENT, foreground=BG,
                    font=("Segoe UI", 10, "bold"), padding=[16, 6])
        s.map("Run.TButton", background=[("active", "#74c7ec"), ("disabled", SURFACE)])

    # ── header ────────────────────────────────────────────────────────────────

    def _build_header(self):
        hdr = tk.Frame(self, bg=BG)
        hdr.pack(fill="x", padx=16, pady=(12, 2))
        lbl(hdr, "🚗  Vehicle Photo Manager", size=14, bold=True).pack(side="left")
        lbl(hdr, "Auto-remove branding · Upload to Drive · Paste & Clean",
            colour=FG2).pack(side="left", padx=14)

    # ── Upload tab ────────────────────────────────────────────────────────────

    def _build_upload_tab(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text="  📤  Upload New Photos  ")

        c = card(tab, "📁  Photo Folder")
        self.upload_folder = tk.StringVar()
        row = tk.Frame(c, bg=SURFACE)
        row.pack(fill="x")
        ent(row, self.upload_folder, width=46).pack(side="left", padx=(0, 8), ipady=4)
        ttk.Button(row, text="Browse…", command=self._browse_upload).pack(side="left")
        lbl(c, "Files must be named:  CODE_front.jpg · CODE_rear.jpg · CODE_side.jpg",
            colour=FG2, bg=SURFACE).pack(anchor="w", pady=(6, 0))

        c2 = card(tab, "⚙️  Options")
        self.upload_clean     = tk.BooleanVar(value=True)
        self.upload_overwrite = tk.BooleanVar(value=False)
        chk(c2, "Auto-remove dealer logos before upload  (--clean)",
            self.upload_clean).pack(anchor="w", pady=2)
        chk(c2, "Overwrite existing photos  (--overwrite)",
            self.upload_overwrite).pack(anchor="w", pady=2)

        self.upload_btn = ttk.Button(tab, text="Upload Photos",
                                     style="Run.TButton", command=self._run_upload)
        self.upload_btn.pack(pady=12)

    # ── Remove branding tab ───────────────────────────────────────────────────

    def _build_remove_tab(self, nb):
        tab = ttk.Frame(nb)
        nb.add(tab, text="  🧹  Remove Branding (Existing)  ")

        c = card(tab, "🚘  Vehicle Filter  (leave blank to process all)")
        row1 = tk.Frame(c, bg=SURFACE)
        row1.pack(fill="x", pady=(0, 6))
        lbl(row1, "Code:", bg=SURFACE).pack(side="left", padx=(0, 8))
        self.remove_code = tk.StringVar()
        ent(row1, self.remove_code, width=22).pack(side="left", ipady=4)
        lbl(row1, "e.g. BZ50C  or  BZ50C,BZ50B", colour=FG2, bg=SURFACE).pack(side="left", padx=10)

        row2 = tk.Frame(c, bg=SURFACE)
        row2.pack(fill="x")
        lbl(row2, "Limit:", bg=SURFACE).pack(side="left", padx=(0, 8))
        self.remove_limit = tk.StringVar()
        ent(row2, self.remove_limit, width=6).pack(side="left", ipady=4)
        lbl(row2, "vehicles  (blank = all)", colour=FG2, bg=SURFACE).pack(side="left", padx=8)

        c2 = card(tab, "⚙️  Mode")
        self.remove_mode = tk.StringVar(value="run")
        for val, txt in [
            ("run",     "Full run — remove logos, re-upload to Drive, update Supabase"),
            ("dry-run", "Dry-run — save cleaned images to cleaned_photos/ (no upload)"),
            ("preview", "Preview — save red-mask images to see what will be removed"),
        ]:
            rad(c2, txt, self.remove_mode, val).pack(anchor="w", pady=3)

        self.remove_btn = ttk.Button(tab, text="Run",
                                     style="Run.TButton", command=self._run_remove)
        self.remove_btn.pack(pady=12)

    # ── Output (shared, only shown on Upload / Remove tabs) ───────────────────

    def _build_output(self):
        self.out_frame = tk.Frame(self, bg=BG)
        self.out_frame.pack(fill="both", expand=False, padx=16, pady=(0, 12))

        hdr = tk.Frame(self.out_frame, bg=BG)
        hdr.pack(fill="x")
        lbl(hdr, "Output", colour=FG2).pack(side="left")
        ttk.Button(hdr, text="Clear",
                   command=lambda: (self.output.config(state="normal"),
                                    self.output.delete("1.0", tk.END),
                                    self.output.config(state="disabled"))
                   ).pack(side="right")

        self.output = scrolledtext.ScrolledText(
            self.out_frame, height=7, state="disabled",
            bg="#181825", fg=FG, font=MONO, relief="flat", padx=8, pady=8,
        )
        self.output.pack(fill="both", expand=True, pady=(4, 0))

    # ── actions ───────────────────────────────────────────────────────────────

    def _browse_upload(self):
        folder = filedialog.askdirectory(title="Select photo folder")
        if folder:
            self.upload_folder.set(folder)

    def _run_upload(self):
        folder = self.upload_folder.get().strip()
        if not folder:
            messagebox.showwarning("No folder", "Please select a photo folder first.")
            return
        cmd = ["upload_vehicle_photos.py", folder]
        if self.upload_clean.get():     cmd.append("--clean")
        if self.upload_overwrite.get(): cmd.append("--overwrite")
        run_script(cmd, self.output, self.upload_btn, "Upload Photos")

    def _run_remove(self):
        cmd = ["remove_plate_branding.py"]
        mode = self.remove_mode.get()
        if mode in ("dry-run", "preview"):
            cmd.append(f"--{mode}")
        code = self.remove_code.get().strip()
        if code:  cmd.append(f"--code={code}")
        limit = self.remove_limit.get().strip()
        if limit: cmd.append(f"--limit={limit}")
        run_script(cmd, self.output, self.remove_btn, "Run")


if __name__ == "__main__":
    App().mainloop()
