import hashlib
import importlib.util
import io
import json
import wave
from pathlib import Path

from fastapi.testclient import TestClient

SPEC = importlib.util.spec_from_file_location("guide_tts_app", Path(__file__).parents[1] / "app.py")
module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(module)
client = TestClient(module.app)


def test_tag_translation_and_removal():
    assert module.parse_tags("[tsundere] Hmph.", "plain") == "[sarcastic] Hmph."
    assert module.parse_tags("[not-real] Hi", "plain") == "Hi"


def test_word_timing_is_explicitly_approximate():
    data = module.timing_data("one two", 2.0)
    assert data["timing_kind"] == "approximate-word"
    assert data["words"] == [{"w": "one", "start": 0.0, "end": 1.0}, {"w": "two", "start": 1.0, "end": 2.0}]
    assert len(data["visemes"]) == 2


def test_word_timing_excludes_control_tokens():
    data = module.timing_data("[sarcastic] Hmph, hello.", 2.0)
    assert [item["w"] for item in data["words"]] == ["Hmph,", "hello."]


def test_stream_endpoint_returns_incremental_pcm(monkeypatch):
    monkeypatch.setattr(module, "ensure_zonos", lambda: None)
    monkeypatch.setattr(module, "zonos_stream", lambda text: iter([b"1234", b"5678"]))
    response = client.post("/v1/tts/stream", json={"text": "hello"})
    assert response.status_code == 200
    assert response.headers["x-guide-audio-format"] == "pcm-f32le-mono"
    assert len(response.content) == 8


def test_voice_catalog_mentions_one_benchmark_reference():
    payload = client.get("/v1/voices").json()
    assert payload["voices"][0]["id"] == "liora-senn"
    assert payload["voices"][0]["license"] == "MIT"


def test_chat_sends_persona_and_filters_output(monkeypatch):
    class Upstream:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "<b>Hmph.</b> I can show the CRM. [smug]"}}]}

    def fake_post(url, json, timeout):
        assert url == module.CHAT_URL
        assert json["model"] == "example-model"
        assert json["max_tokens"] == 300
        assert "Site map" in json["messages"][0]["content"]
        return Upstream()

    monkeypatch.setattr(module.httpx, "post", fake_post)
    monkeypatch.setattr(module, "chat_rate_limited", lambda ip: False)
    response = client.post("/api/chat", json={"message": "Where is CRM?"})
    assert response.status_code == 200
    assert response.json() == {"reply": "Hmph. I can show the CRM."}


def test_chat_rate_limit(monkeypatch):
    monkeypatch.setattr(module, "chat_rate_limited", lambda ip: True)
    assert client.post("/api/chat", json={"message": "hi"}).status_code == 429


def test_stream_chat_emits_sentence_sse_with_same_safety(monkeypatch):
    class Upstream:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def raise_for_status(self):
            pass

        def iter_lines(self):
            yield 'data: {"choices":[{"delta":{"content":"Hello there. "}}]}'
            yield 'data: {"choices":[{"delta":{"content":"Where is the hub?"}}]}'
            yield "data: [DONE]"

    def fake_stream(method, url, json, timeout):
        assert method == "POST" and json["stream"] is True
        return Upstream()

    monkeypatch.setattr(module.httpx, "stream", fake_stream)
    monkeypatch.setattr(module, "chat_rate_limited", lambda ip: False)
    response = client.post("/api/chat/stream", json={"message": "Where is the hub?"})
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: {")]
    assert response.status_code == 200
    assert [event["type"] for event in events] == ["text", "sentence", "text", "sentence", "done"]
    assert events[1]["text"] == "Hello there."


def _wav_bytes():
    stream = io.BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\0\0" * 1600)
    return stream.getvalue()


def test_tts_returns_audio_url_and_timing_payload_by_default(tmp_path, monkeypatch):
    text = "hello"
    cleaned = module.parse_tags(text, "plain")
    key = hashlib.sha256(f"liora-senn|1.0|{cleaned}".encode()).hexdigest()
    (tmp_path / f"{key}.wav").write_bytes(_wav_bytes())
    monkeypatch.setattr(module, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(module, "resolve_voice_reference", lambda voice: Path("reference.wav"))
    monkeypatch.setattr(module, "forced_timing_data", lambda audio, text: {
        "words": [{"w": "hello", "start": 0.0, "end": 0.2}],
        "visemes": [{"v": "open", "start": 0.0, "end": 0.2}],
    })
    response = client.post("/v1/tts", json={"text": text})
    assert response.status_code == 200
    assert response.json()["audio_url"] == f"/v1/audio/{key}.wav"
    assert response.json()["words"][0]["w"] == "hello"
    assert response.json()["visemes"][0]["v"] == "open"
    assert client.get(response.json()["audio_url"]).content == _wav_bytes()


def test_voice_clone_stores_clip_and_license(tmp_path, monkeypatch):
    monkeypatch.setattr(module, "VOICE_DIR", tmp_path)
    response = client.post("/v1/voices", data={"name": "Sample Voice", "license": "CC0"},
                          files={"clip": ("voice.wav", _wav_bytes(), "audio/wav")})
    assert response.status_code == 200
    assert response.json()["id"] == "sample-voice"
    assert (tmp_path / "sample-voice" / "reference.wav").read_bytes() == _wav_bytes()
    assert json.loads((tmp_path / "sample-voice" / "metadata.json").read_text())["license"] == "CC0"


def test_voice_clone_rejects_non_wav():
    response = client.post("/v1/voices", data={"name": "Bad", "license": "CC0"},
                          files={"clip": ("voice.wav", b"not wav", "audio/wav")})
    assert response.status_code == 422


def test_audio_route_rejects_path_traversal():
    assert client.get("/v1/audio/../secret.wav").status_code in {404, 422}
