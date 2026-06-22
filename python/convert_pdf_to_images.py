"""Run this once to convert the PDF pages to PNG images."""
import fitz, os

PDF_PATH     = r"C:\Users\Tim\Desktop\2021.pdf.pdf"
OUTPUT_FOLDER = r"C:\Users\Tim\Desktop\pdfimage"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)
doc = fitz.open(PDF_PATH)
mat = fitz.Matrix(200/72, 200/72)

print(f"Converting {len(doc)} pages...")
for i, page in enumerate(doc):
    out = os.path.join(OUTPUT_FOLDER, f"page_{i+1:04d}.png")
    if not os.path.isfile(out):
        page.get_pixmap(matrix=mat, colorspace=fitz.csRGB).save(out)
    if (i+1) % 50 == 0:
        print(f"  {i+1}/{len(doc)}")

doc.close()
print(f"Done — {len(doc)} images saved to {OUTPUT_FOLDER}")
