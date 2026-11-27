# Afterlife High companion widget

Drop-in embed (Web Component, Shadow DOM, no build step):

    <script src="/widget/guide.js"></script>

guide-tts serves `/widget/*` statically, so the widget and API share one origin (remote browsers work).
To embed on another host set `data-api="https://guide.example"` on the script tag.

Script data attributes: data-api, data-tour, data-tour-site, data-avatar, data-avatar-src, data-avatar-focus="x,y,zoom",
data-avatar-mouth="x,y,w", data-style (prism-mint | signal-coral | neon-magenta | acid-volt | holo-violet),
data-mode (auto | dark | light), data-persona (tsundere | plain), data-mock="1", data-open="1".

## API used (feature-detected via /openapi.json, then per-call fallback)
- POST /api/chat/stream  SSE: {type:text,delta} {type:sentence,text,emotion} {type:done}; falls back to POST /api/chat, then to a built-in mock
- POST /v1/tts           {audio_url, words:[{w,start,end}], visemes:[{v,start,end}]} (also accepts raw audio or audio_base64)
- POST /v1/tts/stream    float32 LE mono PCM; sample rate from X-Guide-Sample-Rate (amplitude-driven mouth)
- POST /v1/stt           multipart field `audio` -> {text}
- A "Mock API" chip is shown whenever the mock is in use.

## Avatar
`AfterlifeGuide.registerAvatar(id, {name, role, src, alt, focus:{x,y,zoom}, mouth:{x,y,w}})` then `data-avatar=id`.
Default is concepts-r2 option 01 (swappable, not a final character approval).

## Tours
`tours/tours.json`: `sites[<hostname>].steps[{title, selector, say, say_plain, emotion, href?}]`; `default` is the fallback.
A step with `href` on the same origin navigates and resumes the tour on the next page (sessionStorage).

## Dev
    python3 guide-tts/widget/dev/dev_server.py --port 8911            # contract-compatible fake API
    python3 guide-tts/widget/dev/dev_server.py --port 8912 --no-api   # static only: exercises the in-browser mock
    pytest guide-tts/widget/tests
