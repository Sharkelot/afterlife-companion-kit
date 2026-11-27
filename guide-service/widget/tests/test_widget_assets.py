import json
import re
import shutil
import subprocess
from pathlib import Path

WIDGET = Path(__file__).resolve().parents[1]


def test_tour_schema_has_generic_defaults_and_demo():
    tours = json.loads((WIDGET / "tours" / "tours.json").read_text(encoding="utf-8"))
    assert set(tours["sites"]) == {"default", "demo"}
    for key, site in tours["sites"].items():
        assert site["steps"], key
        for step in site["steps"]:
            assert step["title"] and step["selector"] and step["say"] and step["say_plain"]
            assert step["emotion"] in {
                "neutral",
                "happy",
                "angry",
                "tsundere",
                "embarrassed",
                "surprised",
                "sigh",
                "whisper",
            }


def test_only_selected_krea_character_art_is_bundled():
    avatars = WIDGET / "avatars"
    assert sorted(path.name for path in avatars.iterdir() if path.is_file()) == ["tamsin-rook.png"]
    assert (avatars / "tamsin-rook.png").stat().st_size > 500_000


def test_widget_contract_and_themes():
    src = (WIDGET / "guide.js").read_text(encoding="utf-8")
    for marker in (
        "/api/chat/stream",
        "/v1/tts/stream",
        "/v1/tts",
        "/v1/stt",
        "attachShadow",
        "prefers-reduced-motion",
        "MediaRecorder",
    ):
        assert marker in src
    for style in ("prism-mint", "signal-coral", "neon-magenta", "acid-volt", "holo-violet"):
        assert len(re.findall(rf"'{style}':", src)) == 1
    assert "innerHTML = text" not in src and "innerHTML=text" not in src
    assert "tamsin-rook.png" in src
    assert "liora-" not in src and "option-01" not in src


def test_public_source_has_no_private_source_identifiers_or_addresses():
    # Repo root = the directory holding pyproject.toml (never walk above it: an earlier
    # parents[2] scanned the whole ~/Projects tree into one string and OOM-killed the host).
    root = next(p for p in WIDGET.parents if (p / "pyproject.toml").exists())
    skip = {".git", ".venv", "venv", "node_modules", "__pycache__", "generated", "models"}
    exts = {".py", ".js", ".json", ".md", ".yaml", ".yml", ".toml", ".html", ".txt"}
    forbidden = ("afterlifehigh" + ".com", "/home/" + "coreys/", "127.0.0." + "1", "Liora" + " Senn", "Qwen3" + ".8")
    for p in root.rglob("*"):
        if p.resolve() == Path(__file__).resolve():
            continue
        if skip.intersection(p.parts) or not p.is_file() or p.suffix.lower() not in exts:
            continue
        if p.stat().st_size > 2_000_000:
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")  # one file at a time, bounded memory
        for word in forbidden:
            assert word not in text, f"{word!r} found in {p.relative_to(root)}"


def test_widget_js_parses_when_node_is_available():
    node = shutil.which("node")
    if node:
        subprocess.run([node, "--check", str(WIDGET / "guide.js")], check=True)
