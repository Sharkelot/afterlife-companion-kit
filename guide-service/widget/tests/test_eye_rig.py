"""Eye rig for Tamsin: layer assets, the gaze maths (gaze.js, node --test) and how guide.js wires them."""

import colorsys
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

WIDGET = Path(__file__).resolve().parents[1]
TAMSIN = WIDGET / "avatars" / "tamsin"
EYES = TAMSIN / "eyes"
SRC = (WIDGET / "guide.js").read_text(encoding="utf-8")
GAZE_FRAMES = ["neutral", "smirk", "pout", "sad", "talk", "thinking", "m-closed", "m-A", "m-E", "m-I", "m-O", "m-U"]


@pytest.fixture(scope="module")
def rig():
    return json.loads((EYES / "eyes.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def tokens():
    return json.loads((TAMSIN / "tint-tokens.json").read_text(encoding="utf-8"))["themes"]


def _check_alpha():
    """Every eye layer is a real transparent RGBA with transparent and opaque areas (lids are art crops)."""
    pytest.importorskip("PIL")
    import numpy as np
    from PIL import Image

    errs = []
    for p in sorted(EYES.rglob("*.webp")):
        im = Image.open(p)
        if im.mode != "RGBA":
            errs.append(f"{p}: mode {im.mode}")
            continue
        a = np.asarray(im)[..., 3]
        if p.name.endswith("-mask.webp"):
            if a.min() > 5 or a.max() < 250:
                errs.append(f"{p}: mask not in 0..1 range")
            continue
        if (a < 10).mean() < 0.01:
            errs.append(f"{p}: no transparent area")
        if (a > 245).mean() < 0.03:
            errs.append(f"{p}: hardly opaque")
        if "-lid-" not in p.name and (a[0, 0] > 10 or a[-1, -1] > 10 or a[0, -1] > 10 or a[-1, 0] > 10):
            errs.append(f"{p}: corner not transparent")
    return errs


def test_rig_lists_every_gaze_frame_with_both_eyes(rig):
    assert sorted(rig["frames"]) == sorted(GAZE_FRAMES)
    assert rig["head"]["maxDeg"] == 6 and rig["frame"] == [1000, 1040]
    for frame, eyes in rig["frames"].items():
        assert set(eyes) == {"L", "R"}, frame
        for side, e in eyes.items():
            assert e["w"] > 30 and e["open_h"] > 8 and 8 < e["iris_r"] < 20 and 2 < e["pupil_r"] < e["iris_r"], (
                frame,
                side,
            )
            # the iris rests inside the sclera box
            sx, sy, sw, sh = e["sclera"]
            assert sx < e["rest"][0] < sx + sw and sy < e["rest"][1] < sy + sh


def test_every_layer_file_exists_per_theme(rig):
    themes = ["base", *rig["themes"]]
    assert len(rig["themes"]) == 10
    for frame in rig["frames"]:
        for side in "LR":
            for name in ("sclera", "pupil"):
                assert (EYES / frame / f"{side}-{name}.webp").exists(), (frame, side, name)
            for theme in themes:
                for kind in ("iris", "lid-up", "lid-low"):
                    assert (EYES / theme / f"{frame}-{side}-{kind}.webp").exists(), (theme, frame, side, kind)
    for frame in rig["masks"]:
        for name in ("head-mask", "body-mask"):
            assert (EYES / frame / f"{name}.webp").exists(), (frame, name)


def test_eye_layers_are_real_transparent_rgba():
    errs = _check_alpha()
    assert not errs, errs[:10]


def test_iris_tint_follows_theme_tokens(rig, tokens):
    """Every themed iris has the hue of that theme's tertiary tint colour; the untinted one does not."""
    pytest.importorskip("PIL")
    import numpy as np
    from PIL import Image

    def hue(path):
        a = np.asarray(Image.open(path).convert("RGBA"), np.float32) / 255
        px = a[a[..., 3] > 0.9][:, :3]
        mean = px.mean(0)
        return colorsys.rgb_to_hsv(*mean)[0] * 360, colorsys.rgb_to_hsv(*mean)[1]

    def circ(a, b):
        d = abs(a - b) % 360
        return min(d, 360 - d)

    for style, modes in tokens.items():
        for mode, t in modes.items():
            want = colorsys.rgb_to_hsv(*(int(t["tint-tertiary"][i : i + 2], 16) / 255 for i in (1, 3, 5)))[0] * 360
            h, s = hue(EYES / f"{style}-{mode}" / "neutral-L-iris.webp")
            assert circ(h, want) < 15 and s > 0.15, (style, mode, h, want, s)
    _, base_s = hue(EYES / "base" / "neutral-L-iris.webp")
    assert base_s < 0.2  # the art's own iris is a pale blue-grey


def test_iris_can_never_leave_the_sclera_mask(rig):
    """At the far end of the travel ellipse the iris centre is still inside the sclera mask."""
    pytest.importorskip("PIL")
    import numpy as np
    from PIL import Image

    ax, ay = 0.32, 0.22
    for frame, eyes in rig["frames"].items():
        for side, e in eyes.items():
            m = np.asarray(Image.open(EYES / frame / f"{side}-sclera.webp").convert("RGBA"))[..., 3] > 128
            sx, sy, sw, sh = e["sclera"]
            assert m.shape == (sh, sw), (frame, side)
            for fx, fy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (0.7, 0.7), (-0.7, -0.7)):
                x = e["rest"][0] + fx * ax * e["w"] - sx
                y = e["rest"][1] + fy * ay * e["open_h"] - sy
                assert m[round(y), round(x)], (frame, side, fx, fy)
            # the mask is the eye shape, not the whole box
            assert 0.35 < m.mean() < 0.9, (frame, side, m.mean())


def test_lids_open_over_the_eye_and_head_body_split_is_clean(rig):
    pytest.importorskip("PIL")
    import numpy as np
    from PIL import Image

    for frame, eyes in rig["frames"].items():
        head = np.asarray(Image.open(EYES / frame / "head-mask.webp").convert("RGBA"))[..., 3]
        for side, e in eyes.items():
            px = e["lid_px"]
            cx, cy = round(e["rest"][0] * 0.64), round(e["rest"][1] * 666 / 1040)
            up = np.asarray(Image.open(EYES / "base" / f"{frame}-{side}-lid-up.webp").convert("RGBA"))[..., 3]
            lo = np.asarray(Image.open(EYES / "base" / f"{frame}-{side}-lid-low.webp").convert("RGBA"))[..., 3]
            assert up.shape == lo.shape == (px[3] - px[1], px[2] - px[0])
            assert up[cy - px[1], cx - px[0]] == 0 and lo[cy - px[1], cx - px[0]] == 0, "eye shows through the lids"
            assert up.max() == 255 and lo.max() == 255
            assert head[cy, cx] == 0, "the head layer is punched out over the eye"
    body = np.asarray(Image.open(EYES / "neutral" / "body-mask.webp").convert("RGBA"))[..., 3]
    head = np.asarray(Image.open(EYES / "neutral" / "head-mask.webp").convert("RGBA"))[..., 3]
    assert body[100, 320] == 0 and body[600, 320] == 255 and head[100, 150] == 255 and head[600, 320] == 0
    # with no eyes punched out (happy) head + body composite to alpha 1 everywhere: no see-through seam at rest
    h = np.asarray(Image.open(EYES / "happy" / "head-mask.webp").convert("RGBA"))[..., 3] / 255
    b = np.asarray(Image.open(EYES / "happy" / "body-mask.webp").convert("RGBA"))[..., 3] / 255
    assert (h + b * (1 - h)).min() > 0.999


def test_collar_belongs_to_the_body(rig):
    pytest.importorskip("PIL")
    import numpy as np
    from PIL import Image

    head = np.asarray(Image.open(EYES / "neutral" / "head-mask.webp").convert("RGBA"))[..., 3]
    body = np.asarray(Image.open(EYES / "neutral" / "body-mask.webp").convert("RGBA"))[..., 3]
    x, y = round(380 * 0.64), round(390 * 666 / 1040)  # on the collar ridge beside the neck
    assert head[y, x] == 0 and body[y, x] == 255


def test_guide_js_wires_the_eye_rig():
    for marker in (
        "gaze.js",
        "AfterlifeGaze",
        "loadEyeRig",
        "buildEyes",
        "gazeStep",
        "addEventListener('pointermove'",
        "{ passive: true }",
        "focusin",
        "IntersectionObserver",
        "visibilitychange",
        "pupilScale",
        "lidOffsets",
        "head-mask.webp",
        "body-mask.webp",
        "mask-image",
        "translate3d",
        "rotate(",
    ):
        assert marker in SRC, marker
    # one rAF loop: the gaze step is driven from the existing animation loop, not a second chain
    assert SRC.count("requestAnimationFrame(this.loop)") == 2 and "requestAnimationFrame(this.gazeTick" not in SRC
    # only transforms are written per frame by the gaze step
    step = SRC[SRC.index("gazeStep(now) {") : SRC.index("/* ----- panel ----- */")]
    assert not re.search(r"style\.(left|top|width|height|margin)\b", step) and "getBoundingClientRect" not in step
    assert "this.hlEl.getBoundingClientRect" in SRC


def test_css_head_cut_matches_the_rig(rig):
    h = rig["head"]
    face = re.search(
        r"\.figure \.face\{-webkit-mask-image:linear-gradient\(to bottom,#000 ([\d.]+)%,transparent ([\d.]+)%\)", SRC
    )
    body = re.search(
        r"\.figure \.body\{-webkit-mask-image:linear-gradient\(to bottom,transparent ([\d.]+)%,#000 ([\d.]+)%\)", SRC
    )
    assert face and body
    assert abs(float(face[1]) - h["y0"] / 10.4) < 0.05 and abs(float(face[2]) - h["y1"] / 10.4) < 0.05
    assert abs(float(body[1]) - h["body"] / 10.4) < 0.05
    origin = re.search(r"transform-origin:([\d.]+)% ([\d.]+)%", SRC[SRC.index(".figure .hd{") :])
    assert abs(float(origin[1]) - h["pivot"][0] / 10) < 0.5 and abs(float(origin[2]) - h["pivot"][1] / 10.4) < 0.1


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_gaze_maths_node_tests_pass():
    r = subprocess.run(
        ["node", "--test", str(WIDGET / "tests" / "gaze.test.js")], capture_output=True, text=True, check=False
    )
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-1000:]
