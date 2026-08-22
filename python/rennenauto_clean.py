#!/usr/bin/env python3
"""
rennenauto_clean.py — Strip the recurring "RENNEN AUTOTEILE" watermark ring
from scraped product photos using per-cluster template subtraction.

The supplier stamps a FIXED, pixel-identical watermark (ring, laurel wreath,
"RENNEN AUTOTEILE" arc text, "R" logo) onto a flat-color background, then
composites the product photo on top. Because the watermark+background is
byte-identical across every photo in a given (canvas size, background shade)
cluster, we can build a per-cluster template via per-pixel median across many
samples, then diff each photo against its cluster's template: pixels that
match the template are pure background/watermark → flattened to white;
pixels that differ are the actual product → kept as-is.

This does NOT remove the per-listing caption text (it's different on every
photo, so there's nothing fixed to diff against) — use the app's manual
Touch Up brush for that last step.

Usage:
    python rennenauto_clean.py                  # build templates, clean all matched images
    python rennenauto_clean.py --limit=20        # process first 20 matched images only
    python rennenauto_clean.py --min-cluster=40   # minimum images to bother building a template for

Requirements: pip install pillow numpy
"""

import os
import sys
import random

if sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import argparse
import collections
from pathlib import Path

from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

SRC_DIR = Path(r"C:\Users\Tim\Desktop\rennenauto_scrape\images")
OUT_DIR = Path(r"C:\Users\Tim\car-parts-app\cleaned_photos")
TEMPLATE_DIR = Path(r"C:\Users\Tim\car-parts-app\cleaned_photos\_templates")

DIFF_THRESHOLD = 45          # sum-of-abs-channel-diff below this = matches template
SAMPLE_PER_CLUSTER = 200     # images to sample when building each cluster's template
RING_MATCH_MIN = 0.60        # min fraction of template's ring/text pixels that must
                              # match for an image to be considered aligned to that
                              # template — see build_ring_mask()/ring_match_score()

# (2274, 2475) verified lower quality: this canvas is mostly used for bulky/glossy
# parts (headlamps etc.) that frequently extend into the ring area across many
# sample photos, contaminating that cluster's template near the ring — leftover
# gray/teal speckle survives cleaning. Excluded until that's solved separately;
# pass --include-large to force it anyway.
EXCLUDED_SIZES_DEFAULT = {(2274, 2475)}


def cluster_signature(path):
    """(size, corner_color) — corner color quantized to nearest 6 to absorb JPEG noise."""
    with Image.open(path) as im:
        im = im.convert("RGB")
        r, g, b = im.getpixel((5, 5))
        q = lambda v: round(v / 6) * 6
        return (im.size, (q(r), q(g), q(b)))


def build_template(files, size):
    random.seed(0)
    sample = random.sample(files, min(SAMPLE_PER_CLUSTER, len(files)))
    w, h = size
    stack = np.zeros((len(sample), h, w, 3), dtype=np.uint8)
    for i, f in enumerate(sample):
        im = Image.open(f).convert("RGB")
        if im.size != size:
            im = im.resize(size)
        stack[i] = np.array(im)
    return np.median(stack, axis=0).astype(np.uint8)


def build_ring_mask(template, corner_color):
    """Pixels where the template's fixed ring/logo/text art differs from the
    flat background color — i.e. the watermark's own footprint."""
    flat = np.array(corner_color, dtype=np.int16)
    return np.abs(template.astype(np.int16) - flat).sum(axis=2) > 20


def ring_match_score(img, template, ring_mask):
    """Fraction of the template's watermark-art pixels that this image matches.
    Low score means this photo's watermark is a different placement/version than
    the cluster's template (same corner color + canvas size, different render) —
    diffing against the wrong template corrupts the whole image (see module docs)."""
    diff = np.abs(img.astype(np.int16) - template.astype(np.int16)).sum(axis=2)
    return (diff[ring_mask] <= DIFF_THRESHOLD).mean()


def clean_image(img_path, template, use_border_floodfill=False):
    img = np.array(Image.open(img_path).convert("RGB"))
    if img.shape[:2] != template.shape[:2]:
        img = np.array(Image.fromarray(img).resize((template.shape[1], template.shape[0])))
    diff = np.abs(img.astype(np.int16) - template.astype(np.int16)).sum(axis=2)
    candidate_bg = diff <= DIFF_THRESHOLD

    if use_border_floodfill:
        # Glossy/reflective parts (headlamps, chrome) can have highlight pixels
        # that coincidentally match the flat watermark-background color, punching
        # false "background" holes inside the product. Only trust a candidate-bg
        # region as real background if it's connected to the canvas border.
        # CAUTION: on ordinary photos, per-image JPEG noise can form a complete
        # ring of just-over-threshold pixels that seals the whole watermark off
        # from the border, causing total cleaning failure — worse than the holes
        # this is meant to fix. Only enable for clusters that actually need it.
        labeled, n = ndimage.label(candidate_bg)
        border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
        border_labels.discard(0)
        border_connected = np.isin(labeled, list(border_labels)) if border_labels else np.zeros_like(candidate_bg)
        mask = (~border_connected).astype(np.uint8) * 255  # 255 = keep (foreground)
    else:
        mask = (~candidate_bg).astype(np.uint8) * 255

    mask_img = Image.fromarray(mask, "L")
    mask_img = mask_img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    mask_img = mask_img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(1.2))
    m = np.array(mask_img).astype(np.float32) / 255.0
    m = np.clip((m - 0.35) / 0.3, 0, 1)
    white = np.full_like(img, 255)
    out = (img * m[..., None] + white * (1 - m[..., None])).astype(np.uint8)
    return Image.fromarray(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--min-cluster", type=int, default=40)
    ap.add_argument("--include-large", action="store_true", help="also process the lower-quality (2274,2475) cluster")
    args = ap.parse_args()

    files = sorted(SRC_DIR.iterdir())
    files = [f for f in files if f.suffix.lower() in (".jpg", ".jpeg", ".png")]
    print(f"Found {len(files)} source images")

    print("Clustering by (size, corner color)…")
    clusters = collections.defaultdict(list)
    errors = []
    for f in files:
        try:
            sig = cluster_signature(f)
            clusters[sig].append(f)
        except Exception as e:
            errors.append((f.name, str(e)))

    excluded = set() if args.include_large else EXCLUDED_SIZES_DEFAULT
    big_clusters = {k: v for k, v in clusters.items() if len(v) >= args.min_cluster and k[0] not in excluded}
    print(f"{len(big_clusters)} clusters >= {args.min_cluster} images "
          f"(covering {sum(len(v) for v in big_clusters.values())}/{len(files)} images)\n")
    for sig, flist in sorted(big_clusters.items(), key=lambda kv: -len(kv[1])):
        print(f"  {sig}: {len(flist)} images")

    OUT_DIR.mkdir(exist_ok=True)
    TEMPLATE_DIR.mkdir(exist_ok=True)

    templates = {}
    ring_masks = {}
    for sig, flist in big_clusters.items():
        size, corner = sig
        print(f"\nBuilding template for {sig} from {min(SAMPLE_PER_CLUSTER, len(flist))} samples…")
        tmpl = build_template(flist, size)
        templates[sig] = tmpl
        ring_masks[sig] = build_ring_mask(tmpl, corner)
        tname = f"tmpl_{size[0]}x{size[1]}_{corner[0]}-{corner[1]}-{corner[2]}.png"
        Image.fromarray(tmpl).save(TEMPLATE_DIR / tname)

    print("\nCleaning matched images…")
    done = 0
    skipped_misaligned = []
    matched_files = [f for flist in big_clusters.values() for f in flist]
    if args.limit:
        matched_files = matched_files[:args.limit]

    sig_by_file = {f: sig for sig, flist in big_clusters.items() for f in flist}
    for f in matched_files:
        sig = sig_by_file[f]
        try:
            img = np.array(Image.open(f).convert("RGB"))
            score = ring_match_score(img, templates[sig], ring_masks[sig])
            if score < RING_MATCH_MIN:
                # This photo's watermark doesn't line up with its cluster's template
                # (a different placement/version sharing the same corner color and
                # canvas size) — diffing against the wrong template would corrupt
                # the image rather than clean it, so leave it untouched instead.
                skipped_misaligned.append((f.name, score))
                continue
            cleaned = clean_image(f, templates[sig])
            cleaned.save(OUT_DIR / f"{f.stem}_clean.png")
            done += 1
        except Exception as e:
            errors.append((f.name, str(e)))
        if (done + len(skipped_misaligned)) % 50 == 0:
            print(f"  {done + len(skipped_misaligned)}/{len(matched_files)}…")

    unmatched = len(files) - len(matched_files)
    print(f"\n── Result ──────────────────────")
    print(f"  Cleaned            : {done}")
    print(f"  Skipped (misaligned): {len(skipped_misaligned)} (watermark doesn't match cluster template — use Touch Up)")
    print(f"  Unmatched (no cluster): {unmatched} (use Touch Up)")
    print(f"  Errors             : {len(errors)}")
    if skipped_misaligned:
        print("\n  Misaligned samples (name, ring-match score):")
        for name, score in skipped_misaligned[:15]:
            print(f"    {name}: {score:.2f}")
    if errors:
        for name, e in errors[:10]:
            print(f"    {name}: {e}")


if __name__ == "__main__":
    main()
