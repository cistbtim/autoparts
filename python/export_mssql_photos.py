#!/usr/bin/env python3
"""
Export DBPix images from MS SQL 2000 to individual JPEG files.

DBPix stores images inside an OLE wrapper in SQL Server's image column.
This script strips the OLE header by scanning for the real image bytes
(JPEG / BMP / PNG / GIF), then saves everything as .jpg.

Each image is saved as  <output_folder>/<part_number>.jpg
After export, run upload_part_photos.py on the output folder to push
them to Google Drive and update your Supabase parts table.

Requirements:
    pip install pyodbc pillow
    Windows ODBC driver "SQL Server" is built-in — no extra install needed.

Usage:
    python export_mssql_photos.py
    python export_mssql_photos.py --out C:\\Photos\\parts

Edit the CONFIG section below before running.
"""

import io
import sys
import pyodbc
from pathlib import Path
from PIL import Image as PILImage

# ── CONFIG — edit these ───────────────────────────────────────────────────────
SQL_SERVER   = r"YOUR_SERVER_NAME"   # e.g. "192.168.1.10" or "MYPC\\SQLEXPRESS"
SQL_DATABASE = "YOUR_DATABASE_NAME"
SQL_USER     = "sa"
SQL_PASSWORD = "YOUR_PASSWORD"

TABLE        = "Parts"               # table that holds parts + images
COL_PARTNO   = "PartNo"             # column with the part number (used as filename)
COL_IMAGE    = "Image"              # DBPix image column (image / varbinary type)

# Optional: filter out rows with no image
SKIP_EMPTY   = True
# ─────────────────────────────────────────────────────────────────────────────

# Known image format magic bytes → (signature_bytes, file_extension)
IMAGE_SIGS = [
    (b"\xff\xd8\xff",          "jpg"),   # JPEG
    (b"\x89PNG\r\n\x1a\n",    "png"),   # PNG
    (b"GIF87a",                "gif"),   # GIF87
    (b"GIF89a",                "gif"),   # GIF89
    (b"BM",                    "bmp"),   # BMP
]


def find_image(blob: bytes):
    """
    Scan blob for the first recognisable image header.
    DBPix wraps the real image in an OLE container — we skip that header
    by searching for the image magic bytes anywhere in the buffer.
    Returns (offset, extension) or (None, None) if not found.
    """
    for sig, ext in IMAGE_SIGS:
        idx = blob.find(sig)
        if idx != -1:
            return idx, ext
    return None, None


def safe_partno(raw) -> str:
    """Convert part number to a filesystem-safe string."""
    s = str(raw).strip()
    for ch in r'\/:*?"<>|':
        s = s.replace(ch, "_")
    return s


def main():
    out_dir = Path("exported_photos")
    for arg in sys.argv[1:]:
        if arg.startswith("--out"):
            parts = arg.split("=", 1)
            out_dir = Path(parts[1] if len(parts) == 2 else sys.argv[sys.argv.index(arg) + 1])

    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output folder : {out_dir.resolve()}")

    # Connect to MS SQL 2000
    conn_str = (
        f"DRIVER={{SQL Server}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        f"UID={SQL_USER};"
        f"PWD={SQL_PASSWORD};"
        "TrustServerCertificate=yes;"
    )
    print(f"Connecting to  {SQL_SERVER} / {SQL_DATABASE} …")
    try:
        conn = pyodbc.connect(conn_str, timeout=10)
    except Exception as e:
        print(f"ERROR: Cannot connect — {e}")
        print("\nCheck: server name, credentials, and that SQL Server is reachable.")
        sys.exit(1)

    cur = conn.cursor()

    # Count rows first
    cur.execute(f"SELECT COUNT(*) FROM [{TABLE}]")
    total = cur.fetchone()[0]
    print(f"Total rows     : {total}\n")

    cur.execute(f"SELECT [{COL_PARTNO}], [{COL_IMAGE}] FROM [{TABLE}]")

    ok = skipped = failed = no_image = 0

    for i, row in enumerate(cur, 1):
        partno_raw, blob = row
        partno = safe_partno(partno_raw)

        sys.stdout.write(f"\r[{i}/{total}] {partno[:40]:<40}")
        sys.stdout.flush()

        if blob is None or (SKIP_EMPTY and len(blob) == 0):
            no_image += 1
            continue

        # blob may come back as bytes or bytearray
        if isinstance(blob, (bytearray, memoryview)):
            blob = bytes(blob)

        offset, _ = find_image(blob)
        if offset is None:
            failed += 1
            print(f"\n  WARN: No image signature found in blob for {partno} (size={len(blob)})")
            continue

        image_data = blob[offset:]
        out_path = out_dir / f"{partno}.jpg"

        try:
            img = PILImage.open(io.BytesIO(image_data)).convert("RGB")
            img.save(out_path, "JPEG", quality=90)
            ok += 1
        except Exception as e:
            print(f"\n  FAIL: {partno} — {e}")
            failed += 1

    cur.close()
    conn.close()

    print(f"\n\n── Result ──────────────────────────────")
    print(f"  Exported  : {ok}")
    print(f"  No image  : {no_image}")
    print(f"  Failed    : {failed}")
    print(f"\nFiles saved to: {out_dir.resolve()}")
    if ok:
        print(f"\nNext step:")
        print(f"  python upload_part_photos.py \"{out_dir.resolve()}\"")


if __name__ == "__main__":
    main()
