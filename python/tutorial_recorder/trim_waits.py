"""Cut the waiting out of a tutorial video.

    python trim_waits.py in.mp4 out.mp4

Finds stretches where the picture is essentially still (page loading, saving, the board
refreshing) and, for every stretch longer than LONG_IDLE seconds, keeps only its first KEEP
seconds - enough to read the caption and see typing finish - and drops the rest. Shorter
still stretches (caption reading time) are left untouched.
"""

import subprocess
import sys

import numpy as np

W, H, FPS = 192, 120, 4
STILL = 0.004      # fraction of pixels that may change between frames and still count as "still"
LONG_IDLE = 4.5    # only stretches longer than this are shortened
KEEP = 2.5         # seconds of each long stretch that survive


def activity(path):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-vf", f"fps={FPS},scale={W}:{H},format=gray",
           "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    n = len(raw) // (W * H)
    frames = np.frombuffer(raw[: n * W * H], dtype=np.uint8).reshape(n, H, W).astype(np.int16)
    diffs = np.abs(frames[1:] - frames[:-1]) > 14
    return diffs.reshape(len(diffs), -1).mean(axis=1)


def still_runs(act):
    flags = list(act < STILL) + [False]
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start / FPS, i / FPS))
            start = None
    return out


def main(src, dst):
    act = activity(src)
    cuts = [(s + KEEP, e) for s, e in still_runs(act) if e - s > LONG_IDLE]
    total = sum(e - s for s, e in cuts)
    print(f"{src}: {len(act) / FPS:.0f}s, cutting {len(cuts)} waits = {total:.0f}s")
    for s, e in cuts:
        print(f"   cut {s:6.1f}s -> {e:6.1f}s  ({e - s:.1f}s)")
    if not cuts:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-c", "copy", dst], check=True)
        return
    drop = "+".join(f"between(t,{s:.3f},{e:.3f})" for s, e in cuts)
    vf = f"select='not({drop})',setpts=N/FRAME_RATE/TB"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "27",
                    "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", dst], check=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
