# Concept image helper

`generate_krea2.py` reads the editable `character.yaml`, builds a text-to-image ComfyUI API graph, waits for your own ComfyUI queue, and downloads the generated PNG to an output directory. It does not upload or load a reference image. The workflow file is written next to the output for reproducibility.

## Prerequisites

- Python 3.11+ and the repo dependencies (`python -m pip install -r requirements.txt`).
- Your own ComfyUI server with the required Krea 2 Turbo, Qwen text encoder, and Qwen image VAE files and matching node classes already installed.
- Review the model publisher's current license before generating or using outputs. No model weights or custom nodes are bundled here.

## Run

```sh
python tools/concept/generate_krea2.py --seed 8202
```

Set `COMFYUI_BASE_URL` or pass `--base-url` to choose your server. The default is `http://localhost:8189`. The tool rejects URLs that embed usernames/passwords. You can provide your own character YAML with `--character`, and select a separate output folder with `--output-dir`. Generated files go into `generated/`, which is git-ignored.

The repository's Tamsin art is a selected Krea output documented in `docs/art-provenance.md`; it is not necessarily reproducible from this text-to-image graph because the selected art was made with a style-reference edit workflow. Reference inputs and their workflows are intentionally not redistributed.