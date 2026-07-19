#!/usr/bin/env python3
"""
Launcher — Desktop UI
Lists every runnable script in this project's python/ folder (plus a few
extras) and lets you run them with one click instead of hunting down
filenames and typing commands.

Run:  python launcher.py
"""

import ast
import shlex
import subprocess
import sys
import threading
import tkinter as tk
from dataclasses import dataclass, field
from pathlib import Path
from tkinter import filedialog, scrolledtext, ttk

REPO_ROOT = Path(__file__).resolve().parent.parent
PYTHON_DIR = Path(__file__).resolve().parent

# Files that live in python/ but aren't meant to be run standalone from here,
# or that should never be surfaced in a generic "click to run" list.
EXCLUDE_NAMES = {"launcher.py", "migration_secrets.py"}

# Extra scripts outside python/'s top level worth surfacing here too.
EXTRA_SCRIPTS = [
    REPO_ROOT / "migrate_drive_to_supabase.py",
    PYTHON_DIR / "tutorial_recorder" / "record.py",
    PYTHON_DIR / "tutorial_recorder" / "replay.py",
]


@dataclass
class ScriptInfo:
    path: Path
    name: str
    description: str
    cwd: Path
    default_args: str = ""
    process: subprocess.Popen = field(default=None, repr=False)


# Pre-filled Args text for specific scripts (keyed by the label shown in the
# UI), so you don't have to remember/retype fixed values like the dev server
# URL before picking a folder.
DEFAULT_ARGS = {
    "tutorial_recorder/record": "http://localhost:5173",
}


def _resolve_interpreter(script_path: Path) -> str:
    """Prefer a virtualenv local to the script (or one of its parent dirs, up
    to python/) over whatever interpreter is running the launcher itself —
    e.g. tutorial_recorder/.venv has playwright installed even though the
    launcher's own interpreter doesn't."""
    venv_python = "python.exe" if sys.platform == "win32" else "python"
    venv_subdir = "Scripts" if sys.platform == "win32" else "bin"
    for folder in [script_path.parent, *script_path.parent.parents]:
        candidate = folder / ".venv" / venv_subdir / venv_python
        if candidate.exists():
            return str(candidate)
        if folder == PYTHON_DIR or folder == REPO_ROOT:
            break
    return sys.executable


def _first_doc_paragraph(path: Path) -> str:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        doc = ast.get_docstring(tree) or ""
    except SyntaxError:
        doc = ""
    doc = doc.strip()
    if not doc:
        return "(no description)"
    # First blank-line-separated paragraph, collapsed to one line.
    para = doc.split("\n\n", 1)[0]
    return " ".join(line.strip() for line in para.splitlines()).strip()


def discover_scripts() -> list[ScriptInfo]:
    found = []
    for path in sorted(PYTHON_DIR.glob("*.py")):
        if path.name in EXCLUDE_NAMES:
            continue
        found.append(ScriptInfo(
            path=path, name=path.stem,
            description=_first_doc_paragraph(path), cwd=REPO_ROOT,
        ))
    for path in EXTRA_SCRIPTS:
        if path.exists():
            label = path.stem if path.parent == REPO_ROOT else f"{path.parent.name}/{path.stem}"
            # Scripts in their own subfolder (e.g. tutorial_recorder) use
            # sibling imports and write relative output there, not at repo
            # root; only the root-level extras assume repo-root-relative paths.
            cwd = REPO_ROOT if path.parent == REPO_ROOT else path.parent
            found.append(ScriptInfo(
                path=path, name=label,
                description=_first_doc_paragraph(path), cwd=cwd,
                default_args=DEFAULT_ARGS.get(label, ""),
            ))
    return found


class LauncherApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        root.title("Car Parts App — Python Tools Launcher")
        root.geometry("880x640")

        self.scripts = discover_scripts()
        self.rows: dict[str, dict] = {}  # name -> {run_btn, script}

        toolbar = ttk.Frame(root, padding=8)
        toolbar.pack(fill="x")
        ttk.Button(toolbar, text="↻ Refresh list", command=self.refresh).pack(side="left")
        ttk.Label(toolbar, text=f"{len(self.scripts)} scripts found in {PYTHON_DIR}").pack(side="left", padx=10)

        body = ttk.Panedwindow(root, orient="vertical")
        body.pack(fill="both", expand=True)

        list_frame = ttk.Frame(body)
        body.add(list_frame, weight=3)

        canvas = tk.Canvas(list_frame, highlightthickness=0)
        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=canvas.yview)
        self.list_inner = ttk.Frame(canvas)
        self.list_inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.list_inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        log_frame = ttk.Frame(body, padding=(8, 4))
        body.add(log_frame, weight=2)
        ttk.Label(log_frame, text="Output log", font=("Segoe UI", 9, "bold")).pack(anchor="w")
        self.log = scrolledtext.ScrolledText(log_frame, height=10, state="disabled", font=("Consolas", 9))
        self.log.pack(fill="both", expand=True)

        self.render_rows()

    def refresh(self):
        for child in self.list_inner.winfo_children():
            child.destroy()
        self.scripts = discover_scripts()
        self.render_rows()

    def render_rows(self):
        for info in self.scripts:
            self._add_row(info)

    def _add_row(self, info: ScriptInfo):
        frame = ttk.LabelFrame(self.list_inner, text=info.name, padding=8)
        frame.pack(fill="x", padx=8, pady=4)

        desc = ttk.Label(frame, text=info.description, wraplength=760, foreground="#555")
        desc.pack(anchor="w")

        controls = ttk.Frame(frame)
        controls.pack(fill="x", pady=(6, 0))

        ttk.Label(controls, text="Args:").pack(side="left")
        args_entry = ttk.Entry(controls, width=40)
        args_entry.pack(side="left", padx=(4, 8))
        if info.default_args:
            args_entry.insert(0, info.default_args)

        def _append_arg(text: str):
            current = args_entry.get()
            sep = " " if current and not current.endswith(" ") else ""
            args_entry.insert("end", sep + text)
            args_entry.icursor("end")

        def browse_file():
            picked = filedialog.askopenfilename()
            if picked:
                _append_arg(shlex.quote(picked))

        def browse_folder():
            picked = filedialog.askdirectory()
            if picked:
                _append_arg(shlex.quote(picked))

        ttk.Button(controls, text="File...", command=browse_file, width=8).pack(side="left")
        ttk.Button(controls, text="Folder...", command=browse_folder, width=8).pack(side="left", padx=(4, 8))

        run_btn = ttk.Button(controls, text="▶ Run", command=lambda: self._toggle(info, args_entry, run_btn))
        run_btn.pack(side="right")

        self.rows[info.name] = {"run_btn": run_btn, "script": info}

    def _toggle(self, info: ScriptInfo, args_entry: ttk.Entry, run_btn: ttk.Button):
        if info.process and info.process.poll() is None:
            info.process.terminate()
            self._append_log(info.name, "--- stopped by user ---")
            return
        try:
            arg_list = shlex.split(args_entry.get())
        except ValueError as e:
            self._append_log(info.name, f"--- bad arguments: {e} ---")
            return
        self._run(info, arg_list, run_btn)

    def _run(self, info: ScriptInfo, arg_list: list[str], run_btn: ttk.Button):
        cmd = [_resolve_interpreter(info.path), str(info.path), *arg_list]
        self._append_log(info.name, f"$ {' '.join(cmd)}")
        try:
            proc = subprocess.Popen(
                cmd, cwd=str(info.cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1,
            )
        except OSError as e:
            self._append_log(info.name, f"--- failed to start: {e} ---")
            return
        info.process = proc
        run_btn.configure(text="⏹ Stop")
        threading.Thread(target=self._stream_output, args=(info, run_btn), daemon=True).start()

    def _stream_output(self, info: ScriptInfo, run_btn: ttk.Button):
        proc = info.process
        for line in proc.stdout:
            self._append_log(info.name, line.rstrip())
        proc.wait()
        self._append_log(info.name, f"--- exited (code {proc.returncode}) ---")
        self.root.after(0, lambda: run_btn.configure(text="▶ Run"))

    def _append_log(self, name: str, text: str):
        def do_append():
            self.log.configure(state="normal")
            self.log.insert("end", f"[{name}] {text}\n")
            self.log.see("end")
            self.log.configure(state="disabled")
        self.root.after(0, do_append)


def main():
    root = tk.Tk()
    LauncherApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
