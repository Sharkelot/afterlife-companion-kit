# Website guide widget

A no-build Web Component with Shadow DOM, accessible controls, theme preferences, site tours, text chat, optional speech input/output, captions, and animated mouth overlays. It is served from `/widget/` by the companion API or can be hosted as static files.

## Embed

```html
<script src="/widget/guide.js" data-tour="/widget/tours/tours.json"></script>
```

The script creates `<afterlife-guide>` once the document is ready. Add `data-api="https://guide.example"` when the API is on a different origin. Cross-origin API use requires an explicit matching server-side origin configuration and HTTPS.

## Script attributes

All are optional:

- `data-api`: API origin (default: the widget script's origin).
- `data-tour`: tour JSON URL (default: `tours/tours.json` beside the script).
- `data-tour-site`: tour key to use instead of hostname matching.
- `data-avatar`: registered avatar id (default: `tamsin-rook`).
- `data-avatar-src`: image URL to override the selected avatar.
- `data-avatar-focus="x,y,zoom"`: normalized crop focus and zoom.
- `data-avatar-mouth="x,y,width"`: normalized mouth overlay position/width.
- `data-style`: `prism-mint`, `signal-coral`, `neon-magenta`, `acid-volt`, or `holo-violet`.
- `data-mode`: `auto`, `dark`, or `light`.
- `data-persona`: `tsundere` or `plain`.
- `data-mock="1"`: always use the local preview replies and disable real API calls.
- `data-open="1"`: start with the panel open.

A site may register other avatars before the element is created:

```js
window.AfterlifeGuide.registerAvatar('my-guide', {
  name: 'My Guide', role: 'Site guide', src: '/assets/guide.png',
  alt: 'A guide character', focus: { x: 0.5, y: 0.3, zoom: 2 },
  mouth: { x: 0.5, y: 0.3, w: 0.05 }
});
```

Then set `data-avatar="my-guide"`. Supply art you have the rights to use.

## Tours

The tour file is JSON with a `sites` object. Each site has a title and ordered steps containing `title`, a CSS `selector`, `say`, `say_plain`, and `emotion`. The repo includes a neutral `default` tour and a `demo` tour. Replace selectors and narration for your own pages; do not include private URLs, selectors, or account-specific content in public tour files. A step may optionally use `href` to navigate to another same-origin page and resume.

## API contract

Feature detection uses `/openapi.json`; calls degrade to a visible mock indicator when appropriate.

- `POST /api/chat/stream`: server-sent events for text and sentences.
- `POST /api/chat`: non-streaming fallback.
- `POST /v1/tts`: WAV or JSON timing/audio metadata, depending on server configuration.
- `POST /v1/tts/stream`: mono PCM stream.
- `POST /v1/stt`: multipart speech recognition.

The API is optional. The static mock demo can be used without a backend. The reference backend and its public-mode controls are experimental; see the repository security warning before connecting a public site.