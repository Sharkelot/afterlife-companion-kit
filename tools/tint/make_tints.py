"""Theme-reactive avatar tinting for the companion widget (concepts-r2 option 01).

Input  : concepts-r2/seg/cutout.png        BiRefNet cutout (transparent bg), from segment_comfy.py
         concepts-r2/seg/crop-*.png        GroundingDINO+SAM2 part masks (goggles, drone, collar...)
Output : guide-tts/widget/avatars/
           liora-base.png                  the neutral cutout (no tint, transparent)
           mask-primary.png / mask-secondary.png / mask-tertiary.png
                                           disjoint alpha layer masks for the live CSS version
           liora-<style>-<mode>.png        pre-rendered fallback per theme (transparent bg)
           tint-tokens.json                token + tint colour per theme (live module input)
         concepts-r2/theme-tint-sheet.jpg  10 tiles, each on its own theme background + swatch chips

Mapping (tokens read from ~/Projects/afterlife-design/ds/v1/tokens.css, the
--color-primary / --color-secondary / --color-tertiary / --color-background
variables of each [data-theme][data-mode] block):
    neon trim, HUD lines, collar glow, device screen -> --color-primary
    hair + hair ties + pink suit piping              -> --color-secondary
    iris + goggle glow + drone                       -> --color-tertiary  (the pop)
Skin, face, eye whites, line art and the dark suit are never in a mask.

Tinting is the W3C "color" blend (hue+saturation of the accent, luminosity of
the pixel), so luminance is preserved exactly; identical maths to
`mix-blend-mode: color` in the live widget. The accent is only normalised in
lightness/saturation (its hue is the token hue), never the character.

Usage: python3 guide-tts/widget/dev/make_tints.py   (needs numpy + Pillow)
"""
from __future__ import annotations

import colorsys
import json
import re
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
SEG = ROOT / "concepts-r2" / "seg"
AVATARS = ROOT / "guide-tts" / "widget" / "avatars"
SHEET_OUT = ROOT / "concepts-r2" / "theme-tint-sheet.jpg"
TOKENS_CSS = Path.home() / "Projects" / "afterlife-design" / "ds" / "v1" / "tokens.css"
TOKENS_COPY = SEG / "tokens.css.snapshot"

STYLES = ["prism-mint", "signal-coral", "neon-magenta", "acid-volt", "holo-violet"]
MODES = ["dark", "light"]
NAMES = {"prism-mint": "Prism Mint", "signal-coral": "Signal Coral", "neon-magenta": "Neon Magenta",
         "acid-volt": "Acid Volt", "holo-violet": "Holo Violet"}
SIZE = 1024

# GroundingDINO+SAM2 crop jobs (must match segment_comfy.JOBS boxes)
BOXES = {
    "hair-head": (260, 0, 700, 330), "hair-braidL": (270, 220, 500, 780), "hair-braidR": (510, 220, 660, 760),
    "lens": (340, 140, 600, 290), "drone": (620, 130, 1010, 440),
    "collar": (420, 320, 600, 460), "device": (450, 790, 680, 960),
}
EYE_BOX = (350, 160, 560, 262)  # iris/brow/lash zone: owned by the iris gate only


# ---------------------------------------------------------------- tokens
def hex2rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def rgb2hex(c) -> str:
    return "#{:02X}{:02X}{:02X}".format(*tuple(int(round(max(0, min(1, v)) * 255)) for v in c))


def read_tokens() -> dict:
    if TOKENS_CSS.exists():
        css = TOKENS_CSS.read_text(encoding="utf-8")
        TOKENS_COPY.write_text(css, encoding="utf-8")
    else:
        css = TOKENS_COPY.read_text(encoding="utf-8")
    out: dict = {}
    for m in re.finditer(r':root\[data-theme="([\w-]+)"\]\[data-mode="(\w+)"\][^{]*\{(.*?)\n\}', css, re.DOTALL):
        style, mode, body = m.groups()
        got = dict(re.findall(r"--color-(background|primary|secondary|tertiary):\s*(#[0-9A-Fa-f]{6})", body))
        if len(got) == 4 and (style, mode) not in out:
            out[(style, mode)] = got
    missing = [(s, m) for s in STYLES for m in MODES if (s, m) not in out]
    if missing:
        raise SystemExit(f"tokens missing for {missing}")
    return out


def tint_colour(token_hex: str) -> tuple[float, float, float]:
    """Accent used in the colour blend: token HUE exactly, lightness/saturation normalised.

    The `color` blend takes the luminosity from the artwork, so the accent's own
    lightness only matters for gamut clipping. Light-theme tokens are near-black
    inks (L~0.2) that would clip to grey, hence the fixed mid lightness; hue never moves.
    """
    h, _l, s = colorsys.rgb_to_hls(*hex2rgb(token_hex))
    return colorsys.hls_to_rgb(h, 0.60, max(s, 0.55))


# ---------------------------------------------------------------- masks
def ramp(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)


def band(h, lo, hi, soft=8.0):
    return ramp(h, lo - soft, lo) * (1 - ramp(h, hi, hi + soft))


def hsl(rgb: np.ndarray):
    mx, mn = rgb.max(-1), rgb.min(-1)
    c = mx - mn
    lum = (mx + mn) / 2
    sat = np.where(c > 0, c / (1 - np.abs(2 * lum - 1) + 1e-6), 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = np.zeros_like(mx)
    m = c > 1e-6
    hue = np.where(m & (mx == r), ((g - b) / (c + 1e-9)) % 6, hue)
    hue = np.where(m & (mx == g), (b - r) / (c + 1e-9) + 2, hue)
    hue = np.where(m & (mx == b), (r - g) / (c + 1e-9) + 4, hue)
    return hue * 60, sat, lum


def sam_mask(job: str) -> np.ndarray:
    m = Image.open(SEG / f"crop-{job}.png").convert("L")
    full = Image.new("L", (SIZE, SIZE), 0)
    full.paste(m, BOXES[job][:2])
    return np.asarray(full, dtype=np.float32) / 255


def _morph(b: np.ndarray, size: int, grow: bool) -> np.ndarray:
    im = Image.fromarray((b * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MaxFilter(size) if grow else ImageFilter.MinFilter(size))
    return np.asarray(im) > 127


def clean(mask: np.ndarray, min_px: int) -> np.ndarray:
    """Drop speckle: binary open (3px), keep 8-connected components >= min_px, restore soft edge near them."""
    core = _morph(_morph(mask > 0.5, 3, False), 3, True)
    h, w = core.shape
    lab = np.zeros((h, w), np.int32)
    keep = np.zeros((h, w), bool)
    n = 0
    for y, x in zip(*np.nonzero(core), strict=False):
        if lab[y, x]:
            continue
        n += 1
        lab[y, x] = n
        pts, q = [(y, x)], deque([(y, x)])
        while q:
            cy, cx = q.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and core[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        pts.append((ny, nx))
                        q.append((ny, nx))
        if len(pts) >= min_px:
            ys, xs = zip(*pts, strict=False)
            keep[ys, xs] = True
    return mask * _morph(keep, 5, True)


def build_masks(cut: np.ndarray) -> dict[str, np.ndarray]:
    rgb, alpha = cut[..., :3], cut[..., 3]
    hue, sat, lum = hsl(rgb)
    skin = band(hue, 5, 45, 6) * ramp(sat, 0.10, 0.18)
    lumgate = ramp(lum, 0.07, 0.16)  # never touch near-black line art
    eye = np.zeros_like(alpha)
    x0, y0, x1, y1 = EYE_BOX
    eye[y0:y1, x0:x1] = 1

    hair_reg = np.maximum.reduce([sam_mask("hair-head"), sam_mask("hair-braidL"), sam_mask("hair-braidR")])
    hair = (hair_reg * band(hue, 140, 211, 5) * ramp(sat, 0.20, 0.30) * (1 - ramp(lum, 0.30, 0.40))
            * lumgate * (1 - skin) * (1 - eye))
    hair = clean(hair, 600)
    pink = band(hue, 290, 355, 8) * ramp(sat, 0.25, 0.40) * ramp(lum, 0.22, 0.35) * (1 - eye)

    trim = band(hue, 135, 200, 8) * ramp(sat, 0.18, 0.30) * ramp(lum, 0.30, 0.45) * (1 - eye)
    # collar + device screen are SAM-segmented HUD objects: only their bright glow pixels
    hud = (np.maximum(sam_mask("collar"), sam_mask("device")) * band(hue, 135, 215, 8)
           * ramp(sat, 0.10, 0.20) * ramp(lum, 0.40, 0.50))
    trim = np.maximum(trim, hud)

    iris = eye * band(hue, 80, 175, 8) * ramp(sat, 0.18, 0.28) * ramp(lum, 0.18, 0.28)
    glow = np.zeros_like(alpha)  # LED glow on the goggle temple pad
    glow[115:185, 585:640] = 1
    iris = np.maximum(iris, glow * band(hue, 120, 200, 10) * ramp(sat, 0.35, 0.50) * ramp(lum, 0.60, 0.75))
    # goggle glow: SAM lens mask, only glare/iridescent pixels, never skin, never the eye zone
    glare = np.maximum(ramp(lum, 0.55, 0.70), ramp(sat, 0.25, 0.40) * ramp(lum, 0.30, 0.45))
    lens = sam_mask("lens") * (1 - skin) * glare * (1 - eye)
    drone = sam_mask("drone") * lumgate
    tert = np.maximum.reduce([iris, lens, drone])

    pri = trim * (1 - tert)
    sec = np.maximum(hair, pink) * (1 - tert) * (1 - pri)
    out = {"primary": pri, "secondary": sec, "tertiary": tert}
    return {k: np.clip(v * alpha, 0, 1).astype(np.float32) for k, v in out.items()}


# ---------------------------------------------------------------- blend
def _lum(c):
    return 0.3 * c[..., 0] + 0.59 * c[..., 1] + 0.11 * c[..., 2]


def set_lum(c, target):
    d = (target - _lum(c))[..., None]
    c = c + d
    lum = _lum(c)[..., None]
    mn, mx = c.min(-1, keepdims=True), c.max(-1, keepdims=True)
    c = np.where(mn < 0, lum + (c - lum) * lum / np.maximum(lum - mn, 1e-9), c)
    c = np.where(mx > 1, lum + (c - lum) * (1 - lum) / np.maximum(mx - lum, 1e-9), c)
    return np.clip(c, 0, 1)


def color_blend(rgb: np.ndarray, accent, mask: np.ndarray) -> np.ndarray:
    """W3C `color` blend (accent hue+sat, backdrop luminosity), weighted by mask. Same as CSS mix-blend-mode: color."""
    src = np.broadcast_to(np.asarray(accent, dtype=np.float32), rgb.shape)
    blended = set_lum(src, _lum(rgb))
    return rgb * (1 - mask[..., None]) + blended * mask[..., None]


def render(cut: np.ndarray, masks: dict, tok: dict) -> np.ndarray:
    rgb = cut[..., :3].copy()
    for role in ("primary", "secondary", "tertiary"):
        rgb = color_blend(rgb, tint_colour(tok[role]), masks[role])
    return np.dstack([rgb, cut[..., 3]])


def to_img(a: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- sheet
def font(size: int):
    for p in ("/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf",
              "/usr/share/fonts/noto/NotoSans-Regular.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def build_sheet(variants: dict, tokens: dict) -> None:
    tile, pad, chip_h, label_h = 340, 14, 22, 46
    cols, rows = 5, 2
    cell_w, cell_h = tile, tile + label_h + chip_h
    W = cols * cell_w + (cols + 1) * pad
    H = rows * cell_h + (rows + 1) * pad + 40
    sheet = Image.new("RGB", (W, H), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 10), "Liora - theme tint v2: BiRefNet cutout + SAM2 parts, W3C colour blend (luminance preserved)",
           fill=(230, 230, 235), font=font(15))
    f12, f11, f10 = font(13), font(11), font(10)
    for i, (style, mode) in enumerate((s, m) for m in MODES for s in STYLES):
        tok = tokens[(style, mode)]
        cx = pad + (i % cols) * (cell_w + pad)
        cy = 40 + pad + (i // cols) * (cell_h + pad)
        bg = Image.new("RGBA", (tile, tile), tuple(int(v * 255) for v in hex2rgb(tok["background"])) + (255,))
        bg.alpha_composite(variants[(style, mode)].resize((tile, tile), Image.Resampling.LANCZOS))
        sheet.paste(bg.convert("RGB"), (cx, cy))
        d.text((cx, cy + tile + 4), f"{NAMES[style]} / {mode}", fill=(235, 235, 240), font=f12)
        d.text((cx, cy + tile + 22), f"liora-{style}-{mode}.png", fill=(150, 150, 160), font=f11)
        sw = (cell_w - 3 * 6) // 4
        for j, key in enumerate(("background", "primary", "secondary", "tertiary")):
            x = cx + j * (sw + 6)
            y = cy + tile + label_h
            d.rectangle([x, y, x + sw, y + chip_h], fill=tok[key], outline=(110, 110, 120))
            ink = (0, 0, 0) if _lum(np.asarray(hex2rgb(tok[key]))) > 0.5 else (255, 255, 255)
            d.text((x + 3, y + 5), f"{key[:3]} {tok[key]}", fill=ink, font=f10)
    sheet.save(SHEET_OUT, quality=92)


def main() -> None:
    tokens = read_tokens()
    cut = np.asarray(Image.open(SEG / "cutout.png").convert("RGBA"), dtype=np.float32) / 255
    masks = build_masks(cut)
    AVATARS.mkdir(parents=True, exist_ok=True)
    to_img(cut).save(AVATARS / "liora-base.png", optimize=True)
    for role, m in masks.items():
        to_img(np.dstack([np.ones_like(m)] * 3 + [m])).save(AVATARS / f"mask-{role}.png", optimize=True)
    variants, meta = {}, {}
    for style in STYLES:
        for mode in MODES:
            tok = tokens[(style, mode)]
            img = to_img(render(cut, masks, tok))
            img.save(AVATARS / f"liora-{style}-{mode}.png", optimize=True)
            variants[(style, mode)] = img
            meta.setdefault(style, {})[mode] = {
                **tok, **{f"tint-{r}": rgb2hex(tint_colour(tok[r])) for r in ("primary", "secondary", "tertiary")}}
    (AVATARS / "tint-tokens.json").write_text(json.dumps(
        {"source": "afterlife-design/ds/v1/tokens.css", "themes": meta}, indent=2), encoding="utf-8")
    build_sheet(variants, tokens)
    print("wrote", len(variants), "variants + masks + sheet")
    for role, m in masks.items():
        print(role, "mask px", int((m > 0.5).sum()))


if __name__ == "__main__":
    main()
