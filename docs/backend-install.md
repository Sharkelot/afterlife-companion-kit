# Optional backend setup

This is a reference backend for local evaluation, not a one-click public deployment. See [SECURITY.md](../SECURITY.md) first.

## Dependencies

From the repository root:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
```

Run from the repository root:

```sh
uvicorn app:app --app-dir guide-service --host localhost --port 8897
```

Open `http://localhost:8897/widget/`. Without a configured LLM, voice reference, and model files, backend calls will fail or report unavailable; the static demo works separately with `data-mock="1"`.

## Configure chat

Use environment variables or a secret manager, not a committed `.env` file:

```sh
export GUIDE_CHAT_URL='https://llm.example/v1/chat/completions'
export GUIDE_CHAT_MODEL='your-model-name'
export GUIDE_SITE_MAP='Public page names and information you want the guide to explain.'
# Optional: supply GUIDE_CHAT_API_KEY securely through your environment/secret manager.
```

The proxy uses OpenAI-compatible `messages` and `choices` JSON. Set `GUIDE_CHAT_API_KEY` only when your provider requires bearer authentication. The guide does not include a default third-party model service.

## Speech

The code has optional Chatterbox-Turbo and ZONOS3 integration paths, plus optional faster-whisper/soundfile STT and word timing. Install engines and weights from their official sources, review their individual licenses, and configure paths with environment variables (`CHATTERBOX_TURBO_CHECKPOINT`, `GUIDE_REFERENCE_WAV`, `GUIDE_ZONOS_DIR`, `GUIDE_ZONOS_SERVER`, `GUIDE_ZONOS_EMBEDDING`). None of those weights, recordings, or binaries are in this repo. Chatterbox needs a valid authorized WAV reference. The `/v1/voices` endpoint accepts uploads and stores them on disk; protect it and obtain consent before use.

## Public mode

`GUIDE_PUBLIC_MODE=1` enables experimental path filtering and server controls. This mode is **not a deployment recipe**. It lacks an integrated browser Turnstile flow and needs deployment-specific CSP/CORS, request-size, session, proxy, and abuse-control validation. Do not expose it publicly until those gaps are fixed and independently reviewed. Exact allowed HTTPS origins are configured by `GUIDE_ALLOWED_ORIGINS`; do not use a wildcard.