"""Static checks for the embeddable widget. Run: pytest guide-tts/widget/tests"""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

WIDGET = Path(__file__).resolve().parents[1]


def test_tours_schema():
    tours = json.loads((WIDGET / "tours" / "tours.json").read_text(encoding="utf-8"))
    sites = tours["sites"]
    assert "default" in sites
    for host in ("example.com", "crm.example.com", "tcg.example.com", "deckbox.example.com", "wiki.example.com"):
        assert host in sites, host
    for key, site in sites.items():
        assert site["steps"], key
        for step in site["steps"]:
            assert step["title"] and step["say"] and step["say_plain"], (key, step)
            assert step["emotion"] in {"neutral", "happy", "angry", "tsundere", "embarrassed", "surprised", "sigh", "whisper"}


def test_avatar_asset_present():
    assert (WIDGET / "avatars" / "option-01-portrait.jpg").stat().st_size > 10_000


def test_guide_js_contract_markers():
    src = (WIDGET / "guide.js").read_text(encoding="utf-8")
    for marker in ("/api/chat/stream", "/v1/tts/stream", "/v1/tts", "/v1/stt", "attachShadow", "prefers-reduced-motion", "MediaRecorder"):
        assert marker in src, marker
    # All five Prism Mint styles are present with dark and light variants.
    for style in ("prism-mint", "signal-coral", "neon-magenta", "acid-volt", "holo-violet"):
        assert len(re.findall(rf"'{style}':", src)) == 1
    # Theme-reactive avatar layer: swap to pre-tinted variants on style/mode change.
    for marker in ("avatarSrcFor", "swapAvatarImg", "liora-${style}-${mode}"):
        assert marker in src, marker
    # API text must never be injected as HTML.
    assert "innerHTML = text" not in src and "innerHTML=text" not in src


@pytest.mark.parametrize("style", ["prism-mint", "signal-coral", "neon-magenta", "acid-volt", "holo-violet"])
@pytest.mark.parametrize("mode", ["dark", "light"])
def test_avatar_tint_variants_present(style, mode):
    p = WIDGET / "avatars" / f"liora-{style}-{mode}.png"
    assert p.exists(), p
    assert p.stat().st_size > 20_000, f"{p.name} too small to be a real render"


def test_avatar_layer_masks_present():
    """Cutout + SAM-derived role masks for the live CSS tint (primary/secondary/tertiary)."""
    for name in ("liora-base", "mask-primary", "mask-secondary", "mask-tertiary"):
        p = WIDGET / "avatars" / f"{name}.png"
        assert p.exists(), p
        assert p.stat().st_size > 1000, f"{p.name} too small to be a real layer"
    tokens = json.loads((WIDGET / "avatars" / "tint-tokens.json").read_text(encoding="utf-8"))["themes"]
    assert len(tokens) == 5 and all(set(v) == {"dark", "light"} for v in tokens.values())


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_guide_js_parses():
    subprocess.run(["node", "--check", str(WIDGET / "guide.js")], check=True)
