"""Cut out + segment the option-01 avatar with ComfyUI (BiRefNet + GroundingDINO/SAM2).

Dev tool. Talks to a running ComfyUI (default http://localhost:8189), refuses to
queue anything unless the queue is idle, and writes raw part masks to
concepts-r2/seg/ (cutout.png RGBA + one mask-<part>.png per prompt). The tint
script (make_tints.py) refines these with colour gates and renders the themes.

Usage: python3 guide-tts/widget/dev/segment_comfy.py
"""
from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "concepts-r2" / "option-01-portrait.png"
OUT = ROOT / "concepts-r2" / "seg"
HOST = os.environ.get("COMFY_URL", "http://localhost:8189").rstrip("/")
UPLOAD_NAME = "afterlife_avatar_option01_portrait.png"

# job name -> (crop box x0,y0,x1,y1 in source px, GroundingDINO text prompt).
# Whole-figure DINO boxes make SAM return the entire person, so every
# non-drone part is prompted on a tight crop and pasted back into place.
JOBS = {
    "hair-head": ((260, 0, 700, 330), "hair"),
    "hair-braidL": ((270, 220, 500, 780), "braided hair"),
    "hair-braidR": ((510, 220, 660, 760), "braided hair"),
    "iris": ((350, 150, 560, 260), "green eyes"),
    "lens": ((340, 140, 600, 290), "transparent goggles lens"),
    "drone": ((620, 130, 1010, 440), "small flying drone creature"),
    "collar": ((420, 320, 600, 460), "glowing transparent collar"),
    "device": ((450, 790, 680, 960), "handheld device screen"),
}


def req(path: str, data: bytes | None = None, headers: dict | None = None):
    r = urllib.request.Request(HOST + path, data=data, headers=headers or {})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.read()


def upload(name: str = UPLOAD_NAME, data: bytes | None = None) -> None:
    boundary = uuid.uuid4().hex
    body = b"".join([
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\n"
        "Content-Type: image/png\r\n\r\n".encode(), data if data is not None else SRC.read_bytes(),
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n".encode(),
    ])
    req("/upload/image", body, {"Content-Type": f"multipart/form-data; boundary={boundary}"})


def graph() -> dict:
    g = {
        "1": {"class_type": "LoadImage", "inputs": {"image": UPLOAD_NAME}},
        "2": {"class_type": "BiRefNetRMBG", "inputs": {
            "image": ["1", 0], "model": "BiRefNet-general", "sensitivity": 1.0,
            "mask_blur": 0, "mask_offset": 0, "invert_output": False, "refine_foreground": True,
            "background": "Alpha", "unload_model": True}},
        "3": {"class_type": "SaveImage", "inputs": {"images": ["2", 0], "filename_prefix": "afterlife-tint/cutout"}},
    }
    n = 10
    for job, (_box, prompt) in JOBS.items():
        g[str(n - 1)] = {"class_type": "LoadImage", "inputs": {"image": f"afterlife_crop_{job}.png"}}
        g[str(n)] = {"class_type": "SAM2Segment", "inputs": {
            "image": [str(n - 1), 0], "prompt": prompt, "sam2_model": "sam2.1_hiera_large",
            "dino_model": "GroundingDINO_SwinB (938MB)", "device": "Auto", "threshold": 0.25,
            "mask_blur": 0, "mask_offset": 0, "invert_output": False, "unload_model": True,
            "background": "Alpha"}}
        g[str(n + 1)] = {"class_type": "SaveImage", "inputs": {
            "images": [str(n), 2], "filename_prefix": f"afterlife-tint/crop-{job}"}}
        n += 3
    return g


def main() -> int:
    q = json.loads(req("/queue"))
    if q.get("queue_running") or q.get("queue_pending"):
        print("ComfyUI queue is busy; not queueing.", file=sys.stderr)
        return 2
    OUT.mkdir(parents=True, exist_ok=True)
    upload()
    from PIL import Image
    src = Image.open(SRC).convert("RGB")
    for job, (box, _p) in JOBS.items():
        buf = io.BytesIO()
        src.crop(box).save(buf, "PNG")
        upload(f"afterlife_crop_{job}.png", buf.getvalue())
    res = json.loads(req("/prompt", json.dumps({"prompt": graph()}).encode(), {"Content-Type": "application/json"}))
    pid = res["prompt_id"]
    print("queued", pid)
    while True:
        h = json.loads(req(f"/history/{pid}"))
        if pid in h and h[pid].get("status", {}).get("completed") is not None:
            if not h[pid]["status"].get("completed"):
                print(json.dumps(h[pid]["status"])[:2000], file=sys.stderr)
                return 1
            break
        time.sleep(2)
    for node, out in h[pid]["outputs"].items():
        for im in out.get("images", []):
            data = req("/view?" + "filename={filename}&subfolder={subfolder}&type={type}".format(**{k: im[k].replace(" ", "%20") for k in ("filename", "subfolder", "type")}))
            name = im["filename"].split("_0")[0].split("/")[-1]
            name = name.rsplit("_", 1)[0] if name[-5:-1].isdigit() else name
            (OUT / f"{name}.png").write_bytes(data)
            print("wrote", name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
