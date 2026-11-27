# Afterlife Companion Kit

A self-hostable kit for adding a lightweight, character-led guide to a website. It includes a no-build Web Component, tours, theme controls, an optional FastAPI chat/TTS/STT backend, and a small ComfyUI/Krea 2 concept-generation helper.

> **Release scope (v0.1.0):** the website widget and local demo are available. The backend is an experimental self-hosted reference and is **not ready to expose to the public internet** without a separate security review. No model weights, voice recordings, credentials, or private endpoints are bundled. Desktop companion source is not included; see [the desktop status](docs/desktop-companion.md).

## Quick start: local install (about 10 minutes)

Requires Python 3.11+, `venv`, `curl`, and a systemd user session. The installer creates a virtual environment, writes a localhost-only systemd user service, and enables it. It does not download model weights by default.

```sh
./install.sh
# edit ~/.config/afterlife-guide/guide.env with your local OpenAI-compatible endpoint
systemctl --user restart afterlife-guide.service
curl http://localhost:8897/health
```

For an optional model file, pass `GUIDE_MODEL_URL`, `GUIDE_MODEL_SHA256` (64 hex characters, independently verified against the publisher), and optionally `GUIDE_MODEL_FILENAME` to the installer. It downloads to a temporary file and refuses installation unless SHA-256 matches. This generic hook deliberately does not invent upstream URLs or hashes; configure the exact artifact you are licensed to use. The browser-only demo remains available with `python3 -m http.server 8912 --directory guide-service`.

## Quick start: widget demo

Requires Python 3.11+ for the static server; Node.js is optional and only needed for the JavaScript syntax check.

```sh
python3 -m http.server 8912 --directory guide-service
```

Open `http://localhost:8912/`. The demo uses the built-in mock API (`data-mock="1"`), so it requires no model, account, credentials, or backend service. The tour, theme selector, responsive widget, reduced-motion behavior, and local Krea character art can be tried immediately.

## Embed on your website

Host `guide-service/widget/` on your website or guide API origin, then add:

```html
<script src="/widget/guide.js" data-tour="/widget/tours/tours.json"></script>
```

The widget registers `<afterlife-guide>` and injects its own Shadow DOM. It has no build step or third-party browser dependency. `data-api` can point to a separate API origin, `data-tour-site` selects a tour key, `data-avatar-src` chooses an image, and `data-style` / `data-mode` set the initial appearance. See [`guide-service/widget/README.md`](guide-service/widget/README.md) for the complete attributes and tour format.

## Optional local guide API

Install the lightweight API dependencies and run the service bound to the local machine:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app:app --app-dir guide-service --host localhost --port 8897
```

The API defaults to a local OpenAI-compatible endpoint. Set `GUIDE_CHAT_URL`, `GUIDE_CHAT_MODEL`, and optionally `GUIDE_CHAT_API_KEY` through your private environment/secret manager. Never commit a key. Add a public site map with `GUIDE_SITE_MAP`; do not put private or account-specific information in it. See [backend setup](docs/backend-install.md) and [security notes](SECURITY.md).

Speech engines and weights are optional, user-installed assets. The API code has Chatterbox-Turbo and ZONOS3 integration paths, plus optional Whisper-based STT/timing; model files and voice references are not included. A voice recording must be lawfully sourced and appropriately licensed. Do not use this kit for voice cloning without explicit rights and consent.

## Concept image generator

`tools/concept/` contains a generalized character YAML and a Krea 2 text-to-image ComfyUI helper. It sends a workflow only to the ComfyUI origin you configure and does not upload an input/reference image. Model files and custom nodes are not included. See [`tools/concept/README.md`](tools/concept/README.md) and [art provenance/licensing](docs/art-provenance.md).

## Desktop companion status

The private desktop-app source was checked before preparing this public release. GitHub reports no declared license for that repository, so its code is deliberately not copied or relicensed here. This v0.1.0 is a **website guide kit**, not an installable desktop app. See [desktop companion status](docs/desktop-companion.md).

## Security and privacy

- Keep the API local or behind an access-controlled network while evaluating it. `GUIDE_PUBLIC_MODE=1` is experimental and is not a production deployment recipe.
- Chat text is forwarded to the OpenAI-compatible endpoint you configure. Microphone recordings are sent to your API's STT endpoint when enabled.
- Uploaded voice reference files are stored by the API under its configured voice directory. No uploaded media is sent elsewhere by this repository's code except to the configured services.
- Configure exact HTTPS origins with `GUIDE_ALLOWED_ORIGINS` if testing cross-origin public mode. Do not rely on the LLM prompt or output sanitizer as a security boundary.
- Review [SECURITY.md](SECURITY.md) and the current limitations before deployment.

## Development and verification

```sh
python3 -m pip install -r requirements.txt -r requirements-dev.txt
make check
```

CI runs Ruff, pytest, a JavaScript syntax check, and Gitleaks secret scanning on pushes and pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

```text
guide-service/
  app.py, publicmode.py        # optional FastAPI reference backend
  widget/                      # drop-in web component, demo, tours, Krea art
  tests/                       # backend API and experimental public-mode tests
tools/concept/
  character.yaml               # editable character definition
  generate_krea2.py            # ComfyUI API workflow helper
docs/                          # installation, architecture, art, desktop status
```

## License

Software is MIT licensed; see [LICENSE](LICENSE). The included character image is separately attributed and is **not** covered by the software license; see [ART-LICENSE.md](ART-LICENSE.md). Model weights and their terms are governed by their respective publishers.