from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

import yaml

DEFAULT_CHARACTER = Path(__file__).with_name("character.yaml")


def load_character(path: Path) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("character YAML must contain a mapping")
    for key in ("name", "prompt", "style", "negative_prompt", "width", "height"):
        if key not in data:
            raise ValueError(f"character YAML is missing {key!r}")
    if not isinstance(data["width"], int) or not isinstance(data["height"], int):
        raise ValueError("width and height must be integers")
    if not (64 <= data["width"] <= 2048 and 64 <= data["height"] <= 2048):
        raise ValueError("canvas dimensions must be between 64 and 2048 pixels")
    return data


def build_workflow(character: dict, seed: int) -> dict:
    """Build a text-to-image Krea 2 API graph; no input/reference image is loaded."""
    prompt = ", ".join((character["prompt"], character["style"], "single character, complete composition"))
    negative = character["negative_prompt"]
    return {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": "krea2_turbo_fp8_scaled.safetensors", "weight_dtype": "default"},
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"},
        },
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": negative}},
        "6": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": character["width"], "height": character["height"], "batch_size": 1},
        },
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0],
                "seed": seed,
                "steps": 8,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
            },
        },
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"images": ["8", 0], "filename_prefix": "companion-kit/concept"}},
    }


def checked_base_url(value: str) -> str:
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.netloc or parts.username or parts.password:
        raise ValueError("ComfyUI URL must be an HTTP(S) origin without embedded credentials")
    return value.rstrip("/")


def api(base: str, path: str, payload: dict | None = None, timeout: int = 60) -> dict:
    body = json.dumps(payload).encode() if payload is not None else None
    request = Request(base + path, body, {"Content-Type": "application/json"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def run(base: str, character: dict, seed: int, output_dir: Path, timeout_s: int = 900) -> Path:
    base = checked_base_url(base)
    deadline = time.monotonic() + timeout_s
    while True:
        queue = api(base, "/queue")
        if not queue.get("queue_running") and not queue.get("queue_pending"):
            break
        if time.monotonic() >= deadline:
            raise TimeoutError("ComfyUI did not become idle before the timeout")
        time.sleep(3)

    graph = build_workflow(character, seed)
    result = api(base, "/prompt", {"prompt": graph})
    if result.get("node_errors"):
        raise RuntimeError("ComfyUI rejected one or more workflow nodes")
    prompt_id = result.get("prompt_id")
    if not prompt_id:
        raise RuntimeError("ComfyUI did not return a prompt id")

    while time.monotonic() < deadline:
        history = api(base, f"/history/{prompt_id}")
        record = history.get(prompt_id)
        if record and (record.get("outputs") or record.get("status", {}).get("status_str") == "error"):
            break
        time.sleep(2)
    else:
        raise TimeoutError("ComfyUI generation did not finish before the timeout")

    if not record.get("outputs"):
        raise RuntimeError("ComfyUI reported generation failure")
    images = record["outputs"].get("9", {}).get("images", [])
    if not images:
        raise RuntimeError("ComfyUI returned no image output")
    image = images[0]
    query = urlencode({key: image[key] for key in ("filename", "subfolder", "type") if key in image})
    request = Request(f"{base}/view?{query}")
    with urlopen(request, timeout=60) as response:
        data = response.read()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("ComfyUI output was not a PNG")

    output_dir.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^a-z0-9-]+", "-", character["name"].lower()).strip("-") or "character"
    target = output_dir / f"{safe_name}-seed-{seed}.png"
    target.write_bytes(data)
    (output_dir / f"{safe_name}-seed-{seed}.workflow.json").write_text(
        json.dumps({"prompt": graph, "seed": seed}, indent=2), encoding="utf-8"
    )
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a concept image with your own ComfyUI + Krea 2 setup")
    parser.add_argument("--character", type=Path, default=DEFAULT_CHARACTER)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--base-url", default=os.getenv("COMFYUI_BASE_URL", "http://localhost:8189"))
    parser.add_argument("--output-dir", type=Path, default=Path("generated/concepts"))
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    character = load_character(args.character)
    result = run(args.base_url, character, args.seed, args.output_dir, args.timeout)
    print(f"saved {result}")


if __name__ == "__main__":
    main()
