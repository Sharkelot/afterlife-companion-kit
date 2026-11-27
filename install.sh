#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV="$ROOT/.venv"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/afterlife-guide"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
MODEL_DIR="$ROOT/guide-service/models/custom"

command -v "$PYTHON_BIN" >/dev/null || { echo "Python 3.11+ is required" >&2; exit 1; }
"$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' || {
  echo "Python 3.11+ is required" >&2; exit 1;
}
"$PYTHON_BIN" -m venv "$VENV"
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install -r "$ROOT/requirements.txt"
mkdir -p "$CONFIG_DIR" "$UNIT_DIR" "$MODEL_DIR"

# Optional single-file model download. Require an explicit checksum; never trust a URL alone.
if [[ -n "${GUIDE_MODEL_URL:-}" || -n "${GUIDE_MODEL_SHA256:-}" ]]; then
  : "${GUIDE_MODEL_URL:?Set GUIDE_MODEL_URL when requesting a model download}"
  : "${GUIDE_MODEL_SHA256:?Set GUIDE_MODEL_SHA256 to the publisher-verified SHA-256}"
  [[ "$GUIDE_MODEL_SHA256" =~ ^[[:xdigit:]]{64}$ ]] || {
    echo "GUIDE_MODEL_SHA256 must be exactly 64 hexadecimal characters" >&2; exit 1;
  }
  command -v curl >/dev/null || { echo "curl is required for model download" >&2; exit 1; }
  name="${GUIDE_MODEL_FILENAME:-model.bin}"
  [[ "$name" != */* && "$name" != .* ]] || { echo "Use a plain model filename" >&2; exit 1; }
  tmp="$MODEL_DIR/.$name.download"
  curl --fail --location --retry 2 --output "$tmp" "$GUIDE_MODEL_URL"
  printf '%s  %s\n' "$GUIDE_MODEL_SHA256" "$tmp" | sha256sum --check --status || {
    rm -f "$tmp"; echo "Model checksum mismatch; refusing install" >&2; exit 1;
  }
  mv "$tmp" "$MODEL_DIR/$name"
  echo "Verified model installed: $MODEL_DIR/$name"
fi

if [[ ! -e "$CONFIG_DIR/guide.env" ]]; then
  cat > "$CONFIG_DIR/guide.env" <<'EOF'
GUIDE_CHAT_URL=http://localhost:1234/v1/chat/completions
GUIDE_CHAT_MODEL=your-local-model
GUIDE_CHAT_API_KEY=
GUIDE_PUBLIC_MODE=0
EOF
  chmod 600 "$CONFIG_DIR/guide.env"
fi
cat > "$UNIT_DIR/afterlife-guide.service" <<EOF
[Unit]
Description=Afterlife Companion Kit local guide API
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT/guide-service
EnvironmentFile=-$CONFIG_DIR/guide.env
Environment=GUIDE_VOICES_DIR=$CONFIG_DIR/voices
Environment=GUIDE_CACHE_DIR=$CONFIG_DIR/cache
ExecStart=$VENV/bin/uvicorn app:app --host 127.0.0.1 --port 8897
Restart=on-failure
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now afterlife-guide.service
printf '\nInstalled. Check status with: systemctl --user status afterlife-guide.service\n'
printf 'Edit configuration: %s/guide.env\n' "$CONFIG_DIR"
printf 'Local API: http://localhost:8897/health\n'
