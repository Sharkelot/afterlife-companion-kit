# Architecture overview

```text
Website
  └── guide-service/widget/guide.js
        ├── Shadow DOM UI, preferences, tour highlighting
        ├── configurable tour JSON
        ├── optional chat + speech requests to a configured API origin
        └── visible built-in mock when previewing without an API

Optional self-hosted FastAPI reference backend (guide-service/app.py)
  ├── OpenAI-compatible chat proxy (operator-configured URL/model/key)
  ├── Chatterbox-Turbo synthesis path (user-installed weights/reference)
  ├── ZONOS3 local CPU streaming fallback (user-installed engine/weights)
  ├── optional Whisper-based STT and word timing
  └── experimental public-mode guard/rate limits/token controls

Concept tooling
  └── tools/concept/generate_krea2.py builds a text-to-image workflow for the
      operator's own ComfyUI instance; it does not upload reference images.
```

The widget can run independently with its built-in preview mock. The backend stores generated audio in a configurable cache and user-provided voice references in a configurable voice directory. Chat is sent to the endpoint selected by the operator. No hosted service, model weights, or remote default endpoint is included.