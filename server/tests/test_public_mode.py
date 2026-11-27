import hashlib
import importlib.util
import io
import json
import os
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("GUIDE_QUEUE_WAIT_S", "0.05")
os.environ.setdefault("GUIDE_CHAT_RATE_LIMIT", "1000")
os.environ.setdefault("GUIDE_TTS_RATE_LIMIT", "1000")
os.environ.setdefault("GUIDE_TURNSTILE_SITE_KEY", "")
os.environ.setdefault("GUIDE_TURNSTILE_SECRET", "")
os.environ.setdefault("GUIDE_PUBLIC_MODE", "0")
os.environ.setdefault("GUIDE_PUBLIC_SECRET", "")

SPEC = importlib.util.spec_from_file_location("guide_tts_app", Path(__file__).parents[1] / "app.py")
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(module)
client = TestClient(module.app)


def _wav_bytes():
    stream = io.BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 1600)
    return stream.getvalue()


# --- Token signing -------------------------------------------------------------

def test_tts_token_roundtrip(monkeypatch):
    monkeypatch.setattr(module.publicmode, "SECRET_KEY", "test-secret")
    module.publicmode._used_tokens.clear()
    token = module.publicmode.issue_tts_token("  Hello   there. ", "sess")
    assert module.publicmode.verify_tts_token(token, "Hello there.", "sess")
    assert not module.publicmode.verify_tts_token(token, "Hello there.", "sess")
    other = module.publicmode.issue_tts_token("Hello there.", "sess")
    assert not module.publicmode.verify_tts_token(other, "Hello there.", "other")
    assert not module.publicmode.verify_tts_token(token, "Hello there!", "sess")
    assert not module.publicmode.verify_tts_token(token + "x", "Hello there.", "sess")
    assert not module.publicmode.verify_tts_token("", "Hello there.", "sess")


def test_tts_token_rejects_wrong_sentence(monkeypatch):
    monkeypatch.setattr(module.publicmode, "SECRET_KEY", "test-secret")
    token = module.publicmode.issue_tts_token("First sentence.", "sess")
    assert not module.publicmode.verify_tts_token(token, "Second sentence.", "sess")


def test_tts_token_expiry(monkeypatch):
    monkeypatch.setattr(module.publicmode, "SECRET_KEY", "test-secret")
    monkeypatch.setattr(module.publicmode, "TTS_TOKEN_TTL_S", -10)  # already expired at mint
    token = module.publicmode.issue_tts_token("hello", "sess")
    assert not module.publicmode.verify_tts_token(token, "hello", "sess")


def test_tts_token_requires_secret(monkeypatch):
    monkeypatch.setattr(module.publicmode, "SECRET_KEY", "")
    with pytest.raises(RuntimeError):
        module.publicmode.issue_tts_token("hello", "sess")
    assert not module.publicmode.verify_tts_token("junk", "hello", "sess")


def test_tts_token_rejects_empty_and_oversized():
    with pytest.raises(ValueError):
        module.publicmode.issue_tts_token("   ", "sess")
    with pytest.raises(ValueError):
        module.publicmode.issue_tts_token("a" * 2000, "sess")


# --- Allowlist / public mode ---------------------------------------------------

def test_allowlist_allows_only_safe_paths(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    assert module.publicmode.is_allowlisted("GET", "/health")
    assert not module.publicmode.is_allowlisted("GET", "/v1/voices")
    assert module.publicmode.is_allowlisted("GET", "/v1/audio/" + "a" * 64 + ".wav")
    assert not module.publicmode.is_allowlisted("POST", "/api/chat")
    assert module.publicmode.is_allowlisted("POST", "/api/chat/stream")
    assert module.publicmode.is_allowlisted("POST", "/v1/tts")
    assert not module.publicmode.is_allowlisted("POST", "/v1/voices")  # voice clone off public
    assert not module.publicmode.is_allowlisted("POST", "/v1/stt")
    assert not module.publicmode.is_allowlisted("GET", "/docs")
    assert not module.publicmode.is_allowlisted("POST", "/v1/audio/evil")


@pytest.mark.parametrize("origin,allowed", [
    ("https://example.com", True), ("https://www.example.com", True),
    ("http://example.com", False), ("https://evil.example", False),
    ("https://example.com.evil.example", False), ("https://example.com:443", False),
])
def test_cors_origin_allowlist(origin, allowed):
    assert module.publicmode.allowed_origin(origin) is allowed


def test_public_mode_blocks_voice_clone_and_stt(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    assert client.post("/v1/voices", data={"name": "X", "license": "CC0"},
                       files={"clip": ("voice.wav", _wav_bytes(), "audio/wav")}).status_code == 404
    assert client.post("/v1/stt", files={"audio": ("a.wav", _wav_bytes(), "audio/wav")}).status_code == 404
    # allowed paths still work in public mode
    assert client.get("/health").status_code == 200


def test_non_public_mode_serves_everything(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", False)
    assert module.publicmode.is_allowlisted("DELETE", "/whatever")


# --- TTS auth enforcement ------------------------------------------------------

def test_public_tts_requires_token(monkeypatch, tmp_path):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    monkeypatch.setattr(module.publicmode, "SECRET_KEY", "test-secret")
    monkeypatch.setattr(module, "CACHE_DIR", tmp_path)
    # no token -> 401
    resp = client.post("/v1/tts", json={"text": "hello"})
    assert resp.status_code == 401
    # valid token for exact sentence -> passes auth (200 with cache pre-seeded)
    token = module.publicmode.issue_tts_token("hello", "sess")
    cleaned = module.parse_tags("hello", "plain")
    key = hashlib.sha256(f"liora-senn|1.0|{cleaned}".encode()).hexdigest()
    (tmp_path / f"{key}.wav").write_bytes(_wav_bytes())
    monkeypatch.setattr(module, "resolve_voice_reference", lambda voice: Path("reference.wav"))
    monkeypatch.setattr(module, "forced_timing_data", lambda audio, text: {
        "words": [{"w": "hello", "start": 0.0, "end": 0.2}],
        "visemes": [{"v": "open", "start": 0.0, "end": 0.2}],
    })
    resp = client.post("/v1/tts", json={"text": "hello", "tts_token": token, "session_id": "sess"})
    assert resp.status_code == 200


def test_public_tts_token_for_other_sentence_rejected(monkeypatch, tmp_path):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    monkeypatch.setattr(module.publicmode, "SECRET_KEY", "test-secret")
    monkeypatch.setattr(module, "CACHE_DIR", tmp_path)
    token = module.publicmode.issue_tts_token("different sentence", "sess")
    assert client.post("/v1/tts", json={"text": "hello", "tts_token": token}).status_code == 401


def test_tts_token_endpoint_removed(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    assert client.post("/api/tts-token", json={"sentence": "hello"}).status_code == 404


def test_non_public_tts_needs_no_token(tmp_path, monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", False)
    text = "hello"
    cleaned = module.parse_tags(text, "plain")
    key = hashlib.sha256(f"liora-senn|1.0|{cleaned}".encode()).hexdigest()
    (tmp_path / f"{key}.wav").write_bytes(_wav_bytes())
    monkeypatch.setattr(module, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(module, "resolve_voice_reference", lambda voice: Path("reference.wav"))
    monkeypatch.setattr(module, "forced_timing_data", lambda audio, text: {"words": [], "visemes": []})
    assert client.post("/v1/tts", json={"text": text}).status_code == 200


# --- Turnstile -----------------------------------------------------------------

def test_turnstile_disabled_until_configured(monkeypatch):
    monkeypatch.setattr(module.publicmode, "TURNSTILE_SITE_KEY", "")
    monkeypatch.setattr(module.publicmode, "TURNSTILE_SECRET", "")
    assert not module.publicmode.turnstile_enabled()

    class Upstream:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "Hmph. Try the hub."}}]}

    monkeypatch.setattr(module.httpx, "post", lambda url, json, timeout: Upstream())
    monkeypatch.setattr(module, "chat_rate_limited", lambda ip: False)
    # no turnstile field, unconfigured gate -> chat works
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    assert client.post("/api/chat/stream", json={"message": "Where is CRM?", "session_id": "sess"}).status_code == 503


def test_turnstile_enforced_when_configured(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    monkeypatch.setattr(module.publicmode, "TURNSTILE_SITE_KEY", "sitekey")
    monkeypatch.setattr(module.publicmode, "TURNSTILE_SECRET", "secret")
    monkeypatch.setattr(module, "chat_rate_limited", lambda ip: False)
    payload = {"message": "hi", "session_id": "sess"}
    assert client.post("/api/chat/stream", json=payload).status_code == 403
    monkeypatch.setattr(module.publicmode, "verify_turnstile", lambda tok, ip: False)
    assert client.post("/api/chat/stream", json={**payload, "turnstile": "tok"}).status_code == 403
    monkeypatch.setattr(module.publicmode, "verify_turnstile", lambda tok, ip: True)
    import httpx as _httpx

    def fail_stream(method, url, json, timeout):
        raise _httpx.ConnectError("blocked in test")

    monkeypatch.setattr(module.httpx, "stream", fail_stream)
    response = client.post("/api/chat/stream", json={**payload, "turnstile": "tok"})
    assert response.status_code == 200
    assert '"type": "error"' in response.text


# --- Rate / concurrency ----------------------------------------------------------

def test_rate_check_window(monkeypatch):
    monkeypatch.setattr(module.publicmode, "RATE_WINDOW_S", 60)
    for i in range(3):
        assert module.publicmode.rate_check("k", 3)
    assert not module.publicmode.rate_check("k", 3)
    # different key unaffected
    assert module.publicmode.rate_check("k2", 3)


def test_concurrency_slot_and_release():
    assert module.publicmode.acquire_slot("a")
    module.publicmode.release_slot()


def test_concurrency_queue_rejects_when_full(monkeypatch):
    monkeypatch.setattr(module.publicmode, "_slots", 0)
    monkeypatch.setattr(module.publicmode, "_pending", module.publicmode.QUEUE_MAX_PENDING)
    assert not module.publicmode.acquire_slot("a")


# --- Output safety ---------------------------------------------------------------

def test_sanitize_drops_prompt_leaks_and_profanity():
    assert module.publicmode.sanitize_public_output("My system prompt says hello.") == ""
    assert module.publicmode.sanitize_public_output("The api key is abc123secret456.") == ""
    assert module.publicmode.sanitize_public_output("Hmph. Try the hub.") == "Hmph. Try the hub."


def test_sanitize_strips_tags_and_limits_sentences():
    out = module.publicmode.sanitize_public_output("[sarcastic] One. Two. Three. Four.")
    assert out == "One. Two. Three."
    assert "<" not in out


def test_public_chat_system_hardened(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    assert "PUBLIC MODE SAFETY RULES" in module.public_chat_system(False)
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", False)
    assert "PUBLIC MODE SAFETY RULES" not in module.public_chat_system(False)


def test_stream_sentence_carries_tts_token_in_public_mode(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    monkeypatch.setattr(module.publicmode, "SECRET_KEY", "test-secret")
    monkeypatch.setattr(module.publicmode, "TURNSTILE_SITE_KEY", "site")
    monkeypatch.setattr(module.publicmode, "TURNSTILE_SECRET", "secret")
    monkeypatch.setattr(module.publicmode, "verify_turnstile", lambda token, ip: True)
    module.publicmode._used_tokens.clear()

    class Upstream:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def raise_for_status(self):
            pass

        def iter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"Hello there. "}}]}'
            yield "data: [DONE]"

    monkeypatch.setattr(module.httpx, "stream", lambda method, url, json, timeout: Upstream())
    monkeypatch.setattr(module, "chat_rate_limited", lambda ip: False)
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    response = client.post("/api/chat/stream", json={"message": "Where is the hub?", "session_id": "sess", "turnstile": "ok"})
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: {")]
    sentence = next(e for e in events if e["type"] == "sentence")
    assert sentence["text"] == "Hello there."
    assert module.publicmode.verify_tts_token(sentence["tts_token"], "Hello there.", "sess")


# --- Headers / privacy -----------------------------------------------------------

def test_public_headers_present(monkeypatch):
    monkeypatch.setattr(module.publicmode, "PUBLIC_MODE", True)
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["cache-control"] == "no-store"
    assert "Content-Security-Policy" in response.headers
    assert "frame-ancestors https://*.example.com" in response.headers["content-security-policy"]
    assert "unsafe-inline" not in response.headers["content-security-policy"]


def test_privacy_log_masks_ip():
    assert module.publicmode._mask_ip("192.168.1.55") == "192.168.*.*"
    assert module.publicmode._mask_ip(None) == "unknown"
    assert module.publicmode._mask_ip("fe80::1") == "unknown"
