#!/usr/bin/env python3
"""Alpha QA for the Tamsin widget assets.

Checks every PNG/WebP given (files or dirs):
  1. all four corner pixels (5x5 patch) have alpha 0
  2. no opaque pixel looks like the old flat yellow background (R,G high, B low)
  3. the edge fringe (0 < alpha < 1) has no yellow cast: mean (min(R,G)-B)/255 below 0.12
  4. transparent pixels carry no yellow colour either (premultiplied / mipmap safe)
  5. a real cutout: 3%..90% of pixels opaque
Exit 1 on any failure. Usage: check_alpha.py <path> [path ...]
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image


def yellowness(rgb):
    return (np.minimum(rgb[..., 0], rgb[..., 1]) - rgb[..., 2]) / 255


def check(p: Path) -> list[str]:
    im = Image.open(p)
    if im.mode != "RGBA":
        return [f"mode {im.mode}, not RGBA"]
    a = np.asarray(im, np.float32)
    rgb, al = a[..., :3], a[..., 3] / 255
    errs = []
    h, w = al.shape
    for name, sl in (("tl", (slice(0, 5), slice(0, 5))), ("tr", (slice(0, 5), slice(w - 5, w))),
                     ("bl", (slice(h - 5, h), slice(0, 5))), ("br", (slice(h - 5, h), slice(w - 5, w)))):
        if al[sl].max() > 0:
            errs.append(f"corner {name} alpha {al[sl].max():.2f}")
    opaque = al > 0.9
    # the old flat background is ~(237,245,45); genuine neon-lime accents on the art peak at about (215,230,60)
    bgish = opaque & (rgb[..., 0] > 228) & (rgb[..., 1] > 236) & (rgb[..., 2] < 80)
    if bgish.sum() > 60:
        errs.append(f"{int(bgish.sum())} opaque pixels look like yellow bg")
    fr = (al > 0.02) & (al < 0.98)
    if fr.sum() > 50:
        y = float(yellowness(rgb[fr]).mean())
        if y > 0.12:
            errs.append(f"edge fringe yellow cast {y:.3f}")
    tr = al == 0
    if tr.sum() > 50:
        y = float(yellowness(rgb[tr]).mean())
        if y > 0.12:
            errs.append(f"transparent px yellow colour {y:.3f}")
    cov = float(opaque.mean())
    if not 0.03 < cov < 0.9:
        errs.append(f"opaque coverage {cov:.2f}")
    return errs


def main():
    files = []
    for arg in sys.argv[1:]:
        p = Path(arg)
        files += sorted(x for x in p.rglob("*") if x.suffix.lower() in (".png", ".webp")) if p.is_dir() else [p]
    bad = 0
    for f in files:
        e = check(f)
        if e:
            bad += 1
            print("FAIL", f, "; ".join(e))
    print(f"checked {len(files)} files, {bad} failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
