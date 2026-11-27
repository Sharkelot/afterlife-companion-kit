/*! Afterlife High companion widget. Drop-in: <script src="/widget/guide.js"></script>
 * Web Component <afterlife-guide> with Shadow DOM. No dependencies, no build step.
 * Data attributes on the script tag (all optional):
 *   data-api        API origin (default: origin the script was loaded from)
 *   data-tour       URL of a tour JSON file (default: <widget>/tours/tours.json)
 *   data-tour-site  force a site key from the tour file (default: match location.hostname)
 *   data-avatar     avatar id (default option-01); data-avatar-src / -focus="x,y,zoom" / -mouth="x,y,w"
 *   data-style      prism-mint | signal-coral | neon-magenta | acid-volt | holo-violet
 *   data-mode       auto | dark | light
 *   data-persona    tsundere | plain
 *   data-mock       "1" forces the built-in mock API (otherwise feature-detected)
 *   data-open       "1" starts with the panel open
 */
(() => {
  'use strict';
  if (window.AfterlifeGuide || customElements.get('afterlife-guide')) return;

  const script = document.currentScript;
  const SD = (script && script.dataset) || {};
  const WIDGET_BASE = new URL('.', (script && script.src) || location.href).href;
  const API = (SD.api || new URL((script && script.src) || location.href, location.href).origin).replace(/\/$/, '');
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceMq.matches;

  /* ---------- Prism Mint tokens: 5 styles x dark/light (from afterlife-design ds/v1/tokens.css) ---------- */
  // [bg, surface, raised, text, body, label, border, primary, primaryText, secondaryText, tertiaryPop, tertiaryText, onPrimary]
  const K = ['bg', 'surface', 'raised', 'text', 'body', 'label', 'border', 'pri', 'priTx', 'secTx', 'pop', 'popTx', 'onPri'];
  const T = {
    'prism-mint': ['Prism Mint', {
      dark: ['#080D18', '#101B2A', '#1A2A3D', '#F6F9FB', '#CDD1D6', '#A6ABB1', '#49515A', '#73F5D1', '#73F5D1', '#E381F1', '#E01C36', '#F3928E', '#010202'],
      light: ['#F0F7F4', '#FBFEFD', '#CEDBD6', '#131A18', '#35403C', '#505B57', '#7B8A85', '#122F27', '#122F27', '#66386C', '#EA1D39', '#580A12', '#FBFEFD']}],
    'signal-coral': ['Signal Coral', {
      dark: ['#030101', '#0B0403', '#170908', '#F6F9FB', '#CDD1D6', '#A6ABB1', '#49515A', '#F6B9B3', '#F3938B', '#4CC1CD', '#B66014', '#F29857', '#030101'],
      light: ['#FAF3F2', '#FFFDFD', '#E1D4D2', '#1E1615', '#453A39', '#605554', '#928280', '#491413', '#491413', '#355356', '#C76A17', '#472306', '#FFFDFD']}],
    'neon-magenta': ['Neon Magenta', {
      dark: ['#030103', '#090409', '#130912', '#F6F9FB', '#CDD1D6', '#A6ABB1', '#49515A', '#E9ADE3', '#F37EEA', '#4BC0D3', '#9B7C16', '#D0AD45', '#030103'],
      light: ['#F8F3F8', '#FFFDFE', '#DDD4DC', '#1C161B', '#423A41', '#5D555C', '#8D828C', '#40133E', '#40133E', '#355358', '#A28217', '#392C07', '#FFFDFE']}],
    'acid-volt': ['Acid Volt', {
      dark: ['#010201', '#050702', '#0B0F04', '#F6F9FB', '#CDD1D6', '#A6ABB1', '#49515A', '#AEDA50', '#9AC246', '#6DB5F1', '#E41C6E', '#F38EA6', '#010201'],
      light: ['#F4F6F0', '#FDFEFC', '#D5D9CF', '#171913', '#3B3F36', '#565A51', '#83887C', '#161E08', '#161E08', '#284053', '#FB3A7F', '#560A26', '#FDFEFC']}],
    'holo-violet': ['Holo Violet', {
      dark: ['#010204', '#04050C', '#0A0C18', '#F6F9FB', '#CDD1D6', '#A6ABB1', '#49515A', '#BEC8F6', '#9EACF1', '#4BBFD9', '#B36E15', '#ED9D45', '#010204'],
      light: ['#F3F5FB', '#FDFDFF', '#D4D7E2', '#17181E', '#3B3D45', '#555861', '#828593', '#1B1A65', '#1B1A65', '#35525A', '#BB7317', '#422706', '#FDFDFF']}],
  };
  const themeVars = (style, mode) => {
    const v = T[style][1][mode];
    return K.map((k, i) => `--${k}:${v[i]}`).join(';');
  };

  /* ---------- Avatar registry (swappable) ---------- */
  // focus = crop centre + zoom into the source image; mouth = overlay centre + width, as fractions of the image.
  const AVATARS = {
    'option-01': { name: 'Example Guide', role: 'Site guide', src: 'avatars/option-01-portrait.jpg',
      alt: 'Example Guide, netrunner guide with a prism visor and teal braids',
      focus: { x: 0.48, y: 0.27, zoom: 2.4 }, mouth: { x: 0.435, y: 0.293, w: 0.05 } },
  };

  /* ---------- Visemes: name -> [mouth open 0..1, width scale] ---------- */
  const VIS = { sil: [0, 1], pp: [.04, .8], p: [.04, .8], b: [.04, .8], m: [.04, .8], ff: [.2, 1.1], f: [.2, 1.1], v: [.2, 1.1],
    th: [.3, 1], dd: [.35, 1], d: [.35, 1], t: [.35, 1], kk: [.4, 1], k: [.4, 1], g: [.4, 1], ch: [.4, .7], sh: [.4, .65], j: [.4, .7],
    ss: [.25, 1.25], s: [.25, 1.25], z: [.25, 1.25], nn: [.3, 1], n: [.3, 1], l: [.4, 1], rr: [.4, .8], r: [.4, .8],
    aa: [1, 1.05], a: [1, 1.05], e: [.6, 1.3], ee: [.5, 1.4], ih: [.5, 1.2], i: [.5, 1.2], oh: [.85, .7], o: [.85, .7], ou: [.5, .55], oo: [.45, .5], u: [.45, .5], w: [.4, .5] };
  const OCULUS = ['sil', 'pp', 'ff', 'th', 'dd', 'kk', 'ch', 'ss', 'nn', 'rr', 'aa', 'e', 'ih', 'oh', 'ou'];
  const visShape = (v) => {
    if (typeof v === 'number') v = OCULUS[v] || 'sil';
    return VIS[String(v).toLowerCase()] || [.5, 1];
  };

  const EMOTIONS = { neutral: 'neutral', happy: 'happy', angry: 'angry', tsundere: 'angry', embarrassed: 'embarrassed', flustered: 'embarrassed',
    surprised: 'surprised', sigh: 'sigh', whisper: 'whisper', sad: 'sigh', laugh: 'happy' };
  const emo = (e) => EMOTIONS[String(e || '').toLowerCase()] || 'neutral';

  const stripTags = (s) => String(s).replace(/\[[a-z _-]{2,20}\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  const sentences = (s) => (String(s).match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || []).map((x) => x.trim()).filter(Boolean);
  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('ahg.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('ahg.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  /* ---------- Mock API (used until the real endpoints are detected) ---------- */
  const MOCK_REPLIES = [
    [/crm|contact|deal|compan/i, ['[tsundere] The CRM is for contacts, companies, deals and activity.', 'Plain and useful. You\u2019re welcome.'], ['The CRM holds contacts, companies, deals and activity.', 'Open it from the top bar.']],
    [/tcg|card|deckbox|deck/i, ['[tsundere] Deckbox and the TCG tools are for card collections and decks.', 'Don\u2019t lose your cards, okay?'], ['Deckbox and TCG tools manage card collections and decks.', 'Find them in the project hub.']],
    [/wiki|doc|help|how/i, ['[tsundere] The wiki has the how-to notes.', 'Read them first. Seriously.'], ['The wiki holds how-to notes and documentation.', 'Search it before asking.']],
    [/hub|home|start|where/i, ['[tsundere] The hub is the map of every project.', 'Start there, slowpoke.'], ['The hub lists every project and links to each site.', 'Start there.']],
  ];
  const MOCK_FALLBACK = [['[embarrassed] H-hm. I only know the site map for now.', 'Try asking about the hub, CRM, TCG, deckbox or wiki.'], ['I only know the site map in this preview.', 'Ask about the hub, CRM, TCG, deckbox or wiki.']];
  const mockReply = (msg, persona) => {
    const hit = MOCK_REPLIES.find((r) => r[0].test(msg));
    const set = hit ? (persona === 'plain' ? hit[2] : hit[1]) : (persona === 'plain' ? MOCK_FALLBACK[1] : MOCK_FALLBACK[0]);
    return set;
  };

  /* ---------- Styles ---------- */
  const css = () => `
:host{all:initial;display:block;position:fixed;inset:auto 0 0 auto;z-index:2147483000;font:16px/1.5 "IBM Plex Sans","Segoe UI",system-ui,sans-serif;color:var(--text)}
${Object.keys(T).map((s) => ['dark', 'light'].map((m) => `:host([data-style="${s}"][data-resolved="${m}"]){${themeVars(s, m)};color-scheme:${m}}`).join('\n')).join('\n')}
*{box-sizing:border-box}
[hidden]{display:none!important}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
button,select,input{font:inherit;color:inherit}
button{cursor:pointer;min-height:44px;min-width:44px;background:var(--raised);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:.4rem .7rem;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;transition:border-color .16s,box-shadow .16s,background .16s}
button:hover{border-color:var(--priTx);box-shadow:0 0 14px color-mix(in srgb,var(--priTx) 22%,transparent)}
button:focus-visible,select:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--text);outline-offset:2px;box-shadow:0 0 0 5px var(--bg)}
button[aria-pressed="true"]{background:color-mix(in srgb,var(--priTx) 20%,var(--surface));border-color:var(--priTx)}
button.primary{background:var(--pri);color:var(--onPri);border-color:var(--pri);font-weight:700}
.launcher{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));width:64px;height:64px;padding:0;border-radius:50%;border:2px solid var(--priTx);background:var(--surface);overflow:hidden;box-shadow:0 8px 28px rgb(0 0 0/.35)}
.launcher .avatar{width:100%;border-radius:0;border:0;clip-path:none}
.launcher .dot{position:absolute;right:4px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--pop);border:2px solid var(--surface)}
.panel{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));width:min(400px,calc(100vw - 32px));max-height:min(720px,calc(100dvh - 32px));overflow:auto;background:var(--surface);color:var(--body);border:1px solid var(--priTx);border-radius:18px 18px 18px 6px;box-shadow:0 20px 70px rgb(0 0 0/.45);display:flex;flex-direction:column}
.head{display:flex;align-items:center;gap:10px;padding:10px 10px 0 14px;font:600 .72rem "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;color:var(--label)}
.head b{color:var(--priTx);font-weight:700}
.head .grow{flex:1}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:99px;padding:2px 9px;font-size:.66rem;color:var(--label);text-transform:uppercase}
.chip i{width:8px;height:8px;border-radius:50%;background:var(--label)}
.chip[data-s=speaking] i,.chip[data-s=listening] i{background:var(--pop)}
.chip[data-s=thinking] i{background:var(--secTx)}
.chip[data-s=idle] i{background:var(--priTx)}
.mock{color:var(--popTx);border-color:var(--popTx)}
.stage{display:grid;grid-template-columns:112px 1fr;gap:12px;padding:12px 14px;align-items:start}
.avatar{--fx:.5;--fy:.5;--zoom:1;--mx:.5;--my:.5;--mw:.05;position:relative;aspect-ratio:1;overflow:hidden;border:2px solid var(--priTx);background:var(--raised);clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));border-radius:4px}
.avatar img{position:absolute;max-width:none;width:calc(var(--zoom)*100%);left:calc(50% - var(--fx)*var(--zoom)*100%);top:calc(50% - var(--fy)*var(--zoom)*100%);user-select:none;pointer-events:none}
.avatar .mouth{position:absolute;left:calc(50% + (var(--mx) - var(--fx))*var(--zoom)*100%);top:calc(50% + (var(--my) - var(--fy))*var(--zoom)*100%);width:calc(var(--mw)*var(--zoom)*100%);aspect-ratio:2/1;transform:translate(-50%,-50%);overflow:visible;pointer-events:none}
.avatar::after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 22px var(--emo,transparent)}
.avatar[data-emo=happy]{--emo:color-mix(in srgb,var(--priTx) 55%,transparent)}
.avatar[data-emo=angry]{--emo:color-mix(in srgb,var(--pop) 70%,transparent)}
.avatar[data-emo=embarrassed]{--emo:color-mix(in srgb,var(--secTx) 65%,transparent)}
.avatar[data-emo=surprised]{--emo:color-mix(in srgb,var(--popTx) 60%,transparent)}
.avatar[data-speaking=true]{border-color:var(--pop)}
.bubble{position:relative;min-height:112px;max-height:190px;overflow:auto;background:var(--raised);border:1px solid var(--border);border-radius:4px 14px 14px 14px;padding:10px 12px;color:var(--text);font-size:.95rem}
.bubble p{margin:0;white-space:pre-wrap}
.bubble .who{display:block;font:700 .66rem "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.13em;color:var(--priTx);margin-bottom:4px}
.bubble .you{color:var(--label);font-size:.82rem;margin-bottom:6px}
.caps{margin:0 14px;padding:8px 10px;min-height:2.6em;border-left:3px solid var(--pop);background:var(--bg);color:var(--text);font-size:.9rem}
.caps:empty{display:none}
.caps .w.on{background:var(--pri);color:var(--onPri);border-radius:3px;padding:0 2px}
.tourbar{margin:10px 14px 0;padding:10px;border:1px dashed var(--priTx);border-radius:10px;display:grid;gap:8px}
.tourbar h3{margin:0;font:700 .85rem "Oxanium","Arial Narrow",sans-serif;letter-spacing:.06em;color:var(--text);text-transform:uppercase}
.tourbar .row{display:flex;flex-wrap:wrap;gap:6px}
.bar{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 0}
.bar button{flex:1 1 0;min-width:44px;font-size:.8rem}
.ask{display:flex;gap:6px;padding:10px 14px 0}
.ask input{flex:1;min-width:0;min-height:44px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:.4rem .7rem;color:var(--text)}
.ask input::placeholder{color:var(--label)}
details.set{margin:10px 14px 14px;border-top:1px solid var(--border);padding-top:8px;font-size:.82rem;color:var(--label)}
details.set summary{cursor:pointer;min-height:32px;display:flex;align-items:center}
details.set .grid{display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;margin-top:6px}
details.set select{background:var(--bg);border:1px solid var(--border);border-radius:8px;min-height:40px;padding:0 .5rem;color:var(--text)}
.rec{display:none;width:9px;height:9px;border-radius:50%;background:var(--pop)}
button[data-rec=true]{border-color:var(--pop);box-shadow:0 0 0 3px color-mix(in srgb,var(--pop) 35%,transparent)}
button[data-rec=true] .rec{display:inline-block;animation:pulse 1s infinite}
@keyframes pulse{50%{opacity:.25}}
.ring{position:fixed;pointer-events:none;border:2px solid var(--priTx);border-radius:8px;box-shadow:0 0 0 100vmax rgb(0 0 0/.42),0 0 22px var(--priTx);transition:all .25s var(--ease,ease);z-index:-1}
.ring::before,.ring::after{content:"";position:absolute;width:16px;height:16px;border:3px solid var(--pop)}
.ring::before{left:-6px;top:-6px;border-right:0;border-bottom:0}
.ring::after{right:-6px;bottom:-6px;border-left:0;border-top:0}
.ring[data-miss=true]{display:none}
@media(max-width:480px){
  .panel{right:8px;left:8px;bottom:8px;width:auto;max-height:calc(100dvh - 16px);border-radius:16px 16px 6px 6px}
  .stage{grid-template-columns:88px 1fr;gap:10px;padding:10px}
  .bubble{min-height:88px;max-height:140px;font-size:.9rem}
  .bar{padding:8px 10px 0}.ask{padding:8px 10px 0}.caps{margin:8px 10px 0}.tourbar{margin:8px 10px 0}details.set{margin:8px 10px 10px}
  .head{padding-left:10px}
  .launcher{right:12px;bottom:12px}
  .panel[data-tour=on] .bar,.panel[data-tour=on] .ask,.panel[data-tour=on] details.set,.panel[data-tour=on] .caps{display:none}
  .panel[data-tour=on] .stage{padding-bottom:0}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

  const HTML = `
<button class="launcher" part="launcher" aria-label="Open the Afterlife guide" aria-expanded="false" aria-haspopup="dialog">
  <span class="avatar" data-role="thumb"></span><span class="dot" aria-hidden="true"></span>
</button>
<section class="panel" role="dialog" aria-label="Afterlife guide" hidden>
  <div class="head"><b>\u25C6 AFTERLIFE HIGH</b><span class="grow"></span>
    <span class="chip mock" data-role="mock" hidden>Mock API</span>
    <span class="chip" data-role="status" data-s="idle" role="status"><i></i><span data-role="statustx">Idle</span></span>
    <button data-act="close" aria-label="Close guide" title="Close (Esc)">\u2715</button></div>
  <div class="stage">
    <div class="avatar" data-role="avatar" data-emo="neutral" data-speaking="false"><slot name="avatar"></slot></div>
    <div class="bubble"><span class="who" data-role="who"></span><p class="you" data-role="you" hidden></p><p data-role="say"></p></div>
  </div>
  <div class="caps" data-role="caps" aria-hidden="true"></div>
  <div class="tourbar" data-role="tourbar" hidden>
    <h3 data-role="tourtitle"></h3>
    <div class="row"><button data-act="tour-prev">\u2190 Back</button><button class="primary" data-act="tour-next">Next \u2192</button>
      <button data-act="tour-auto" aria-pressed="false">Auto</button><button data-act="tour-stop">End tour</button></div>
  </div>
  <div class="bar" role="toolbar" aria-label="Guide controls">
    <button data-act="mic" aria-pressed="false" data-rec="false" aria-label="Voice input. Press to start or stop recording; or hold."><span class="rec" aria-hidden="true"></span><span data-role="mictx">Talk</span></button>
    <button data-act="mute" aria-pressed="false" aria-label="Mute voice"><span data-role="mutetx">Mute</span></button>
    <button data-act="caps" aria-pressed="true" aria-label="Captions">CC</button>
    <button data-act="persona" aria-pressed="true" aria-label="Tsundere mode"><span data-role="personatx">Tsundere</span></button>
    <button data-act="tour" aria-label="Start site tour">Tour</button>
  </div>
  <form class="ask" data-role="form"><label class="sr" for="q">Ask the guide</label>
    <input id="q" name="q" autocomplete="off" maxlength="400" placeholder="Ask me where to go\u2026"><button class="primary" type="submit" aria-label="Send">Send</button></form>
  <details class="set"><summary>Appearance</summary><div class="grid">
    <label for="sty">Style</label><select id="sty" data-set="style"></select>
    <label for="mod">Mode</label><select id="mod" data-set="mode"><option value="auto">Auto</option><option value="dark">Dark</option><option value="light">Light</option></select></div></details>
  <div class="sr" role="log" aria-live="polite" data-role="log"></div>
</section>
<div class="ring" data-role="ring" data-miss="true" aria-hidden="true"></div>`;

  /* ---------- The element ---------- */
  class AfterlifeGuide extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.caps = { chat: null, tts: null, stt: null };      // null = unknown, detect lazily
      this.mock = SD.mock === '1';
      this.history = [];
      this.sessionId = sessionStorage.getItem('ahg.session') || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
      sessionStorage.setItem('ahg.session', this.sessionId);
      this.q = [];
      this.ctx = null;
      this.speakGen = 0;
      this.tour = null;
      this.rec = null;
      this.mouthState = { o: 0, w: 1 };
      this.prefs = { mute: store.get('mute', false), caps: store.get('caps', true), persona: SD.persona || store.get('persona', 'tsundere'),
        style: SD.style || store.get('style', 'prism-mint'), mode: SD.mode || store.get('mode', 'auto') };
    }

    $(r) { return this.shadow.querySelector(`[data-role="${r}"]`); }
    get shadow() { return this.shadowRoot; }

    connectedCallback() {
      const root = this.shadow;
      root.innerHTML = `<style>${css()}</style>${HTML}`;
      this.panel = root.querySelector('.panel');
      this.launcher = root.querySelector('.launcher');
      this.avatarId = SD.avatar || 'option-01';
      this.setAvatar(this.avatarId);
      const sel = root.querySelector('[data-set="style"]');
      sel.innerHTML = Object.entries(T).map(([id, v]) => `<option value="${id}">${v[0]}</option>`).join('');
      sel.value = T[this.prefs.style] ? this.prefs.style : 'prism-mint';
      root.querySelector('[data-set="mode"]').value = this.prefs.mode;
      root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.act(b.dataset.act, b, e); });
      this.launcher.addEventListener('click', () => this.open());
      root.querySelector('[data-role="form"]').addEventListener('submit', (e) => { e.preventDefault(); const i = e.target.q; const v = i.value.trim(); if (v) { i.value = ''; this.ask(v); } });
      root.querySelectorAll('[data-set]').forEach((s) => s.addEventListener('change', () => { this.prefs[s.dataset.set] = s.value; store.set(s.dataset.set, s.value); this.applyTheme(); }));
      this.panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.tour ? this.stopTour() : this.close(); } });
      this.bindMic(root.querySelector('[data-act="mic"]'));
      this.applyTheme();
      this.syncButtons();
      this.setSay(this.greeting(), 'neutral');
      this.mo = new MutationObserver(() => this.applyTheme());
      this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode', 'class'] });
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
      addEventListener('resize', () => this.placeRing());
      addEventListener('scroll', () => this.placeRing(), { passive: true });
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
      this.resumeTour();
      if (SD.open === '1' || this.hasAttribute('open')) this.open();
    }

    disconnectedCallback() { this.mo && this.mo.disconnect(); this.stopSpeech(); }

    greeting() { return this.prefs.persona === 'plain' ? 'Hi, I\u2019m the Afterlife High guide. Ask me about any site, or take the tour.' : 'Hmph. Fine, I\u2019ll show you around. It\u2019s not like I was waiting for you or anything.'; }

    /* ----- theme & avatar ----- */
    // Theme-reactive avatar layers: when the active avatar has pre-tinted
    // variants (avatars/liora-<style>-<mode>.png, built from segment masks),
    // swap the <img> src on style/mode change. Original art stays the
    // fallback. Preloaded so the swap is instant and flicker-free.
    avatarSrcFor(style, mode) {
      const a = this.avatar;
      if (!a || !a.src || SD.avatarSrc) return null;
      const base = a.src.split('/').pop();
      if (base !== 'option-01-portrait.jpg' && base !== 'option-01-portrait.png') return null;
      const tinted = `avatars/example-${style}-${mode}.png`;
      if (!this._tintCache) this._tintCache = {};
      if (this._tintCache[tinted]) { this._tintRel = tinted; return tinted; }
      // Not loaded yet: remember it as the requested layer and preload it.
      this._tintRel = tinted;
      const url = new URL(tinted, WIDGET_BASE).href;
      const probe = new Image();
      probe.onload = () => { this._tintCache[tinted] = true; if (this._tintRel === tinted) this.swapAvatarImg(tinted); };
      probe.src = url;
      return this._tintRel;
    }
    swapAvatarImg(rel) {
      const url = new URL(rel, WIDGET_BASE).href;
      this.shadow.querySelectorAll('.avatar img').forEach((img) => { img.src = url; });
    }
    applyTheme() {
      let style = T[this.prefs.style] ? this.prefs.style : 'prism-mint';
      let mode = this.prefs.mode;
      if (mode === 'auto') {
        const de = document.documentElement;
        const hint = de.dataset.mode || (['dark', 'light'].includes(de.dataset.theme) ? de.dataset.theme : '') || (de.classList.contains('dark') ? 'dark' : de.classList.contains('light') ? 'light' : '');
        mode = ['dark', 'light'].includes(hint) ? hint : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      }
      this.setAttribute('data-style', style);
      this.setAttribute('data-resolved', mode);
      const tinted = this.avatarSrcFor(style, mode);
      if (tinted) this.swapAvatarImg(tinted);
    }

    setAvatar(id, def) {
      if (def) AVATARS[id] = def;
      const a = Object.assign({}, AVATARS[id] || AVATARS['option-01']);
      if (SD.avatarSrc) a.src = SD.avatarSrc;
      const nums = (s) => String(s).split(',').map(Number);
      if (SD.avatarFocus) { const [x, y, zoom] = nums(SD.avatarFocus); a.focus = { x, y, zoom }; }
      if (SD.avatarMouth) { const [x, y, w] = nums(SD.avatarMouth); a.mouth = { x, y, w }; }
      this.avatar = a;
      this._tintCache = {};
      this._tintRel = null;
      const src = new URL(a.src, WIDGET_BASE).href;
      const mk = (withMouth) => `<img src="${this._tintRel ? new URL(this._tintRel, WIDGET_BASE).href : src}" alt="" decoding="async" draggable="false">${withMouth ? MOUTH_SVG : ''}`;
      const apply = (el, withMouth) => {
        const f = a.focus, m = a.mouth;
        el.style.cssText = `--fx:${f.x};--fy:${f.y};--zoom:${f.zoom};--mx:${m.x};--my:${m.y};--mw:${m.w}`;
        el.querySelectorAll('img,svg').forEach((n) => n.remove());
        el.insertAdjacentHTML('afterbegin', mk(withMouth));
      };
      apply(this.$('avatar'), true);
      apply(this.$('thumb'), false);
      this.panel.setAttribute('aria-label', `${a.name}, ${a.role.toLowerCase()}`);
      this.$('who').textContent = `${a.name.toUpperCase()} // GUIDE`;
      this.$('avatar').setAttribute('role', 'img');
      this.$('avatar').setAttribute('aria-label', a.alt);
      this.mouthEl = this.$('avatar').querySelector('.m-in');
      this.lipEl = this.$('avatar').querySelector('.m-lip');
      this.mouthSvg = this.$('avatar').querySelector('svg');
    }

    /* ----- panel ----- */
    open() {
      this.panel.hidden = false; this.launcher.hidden = true;
      this.launcher.setAttribute('aria-expanded', 'true');
      this.ensureCtx();
      this.detect();
      this.panel.querySelector('#q').focus({ preventScroll: true });
    }
    close() {
      this.stopSpeech(); this.stopRec(true);
      this.panel.hidden = true; this.launcher.hidden = false;
      this.launcher.setAttribute('aria-expanded', 'false');
      this.launcher.focus({ preventScroll: true });
    }
    setStatus(s) {
      const c = this.$('status'); c.dataset.s = s;
      this.$('statustx').textContent = { idle: 'Idle', thinking: 'Thinking', speaking: 'Speaking', listening: 'Listening' }[s];
    }
    setSay(text, emotion, you) {
      this.$('say').textContent = text;
      const y = this.$('you'); y.hidden = !you; y.textContent = you ? `You: ${you}` : '';
      this.$('avatar').dataset.emo = emo(emotion);
      const b = this.$('say').parentElement; b.scrollTop = b.scrollHeight;
    }
    announce(t) { const l = this.$('log'); const p = document.createElement('p'); p.textContent = t; l.appendChild(p); while (l.children.length > 6) l.firstChild.remove(); }
    syncButtons() {
      const p = this.prefs, $ = (a) => this.shadow.querySelector(`[data-act="${a}"]`);
      $('mute').setAttribute('aria-pressed', String(p.mute)); this.$('mutetx').textContent = p.mute ? 'Unmute' : 'Mute';
      $('mute').setAttribute('aria-label', p.mute ? 'Unmute voice' : 'Mute voice');
      $('caps').setAttribute('aria-pressed', String(p.caps)); this.$('caps').hidden = !p.caps;
      const ts = p.persona === 'tsundere';
      $('persona').setAttribute('aria-pressed', String(ts)); this.$('personatx').textContent = ts ? 'Tsundere' : 'Plain';
      $('persona').setAttribute('aria-label', ts ? 'Tsundere mode on. Switch to plain.' : 'Plain mode on. Switch to tsundere.');
      if (this.master) this.master.gain.value = p.mute ? 0 : 1;
      this.$('mock').hidden = !this.mock;
    }
    act(a, el) {
      if (a === 'close') this.close();
      else if (a === 'mute') { this.prefs.mute = !this.prefs.mute; store.set('mute', this.prefs.mute); this.syncButtons(); this.announce(this.prefs.mute ? 'Voice muted' : 'Voice on'); }
      else if (a === 'caps') { this.prefs.caps = !this.prefs.caps; store.set('caps', this.prefs.caps); this.syncButtons(); }
      else if (a === 'persona') { this.prefs.persona = this.prefs.persona === 'plain' ? 'tsundere' : 'plain'; store.set('persona', this.prefs.persona); this.syncButtons(); this.announce(`Persona: ${this.prefs.persona}`); }
      else if (a === 'tour') this.startTour();
      else if (a === 'tour-next') this.tourGo(this.tour.i + 1);
      else if (a === 'tour-prev') this.tourGo(this.tour.i - 1);
      else if (a === 'tour-stop') this.stopTour();
      else if (a === 'tour-auto') { this.tour.auto = !this.tour.auto; el.setAttribute('aria-pressed', String(this.tour.auto)); if (this.tour.auto && !this.speaking) this.tourAdvanceSoon(); }
    }

    /* ----- capability detection (feature-detect FastAPI openapi.json; fall back lazily) ----- */
    async detect() {
      if (this.detected) return this.detected;
      this.detected = (async () => {
        if (SD.mock === '1') { this.caps = { chat: false, tts: false, stt: false }; return; }
        try {
          const r = await fetch(`${API}/openapi.json`, { cache: 'no-store' });
          if (r.ok) {
            const paths = Object.keys((await r.json()).paths || {});
            this.caps = { chat: paths.includes('/api/chat/stream') || paths.includes('/api/chat'), chatStream: paths.includes('/api/chat/stream'),
              tts: paths.includes('/v1/tts') || paths.includes('/v1/tts/stream'), stt: paths.includes('/v1/stt') };
            this.ttsPaths = { tts: paths.includes('/v1/tts'), stream: paths.includes('/v1/tts/stream') };
          } else this.caps = { chat: null, tts: null, stt: null };
        } catch (e) { this.caps = { chat: false, tts: false, stt: false }; }
        this.updateMock();
      })();
      return this.detected;
    }
    updateMock() { this.mock = SD.mock === '1' || this.caps.chat === false || this.caps.tts === false; this.syncButtons(); }

    /* ----- chat ----- */
    async ask(message) {
      this.ensureCtx(); this.stopSpeech(); this.stopRec(true);
      await this.detect();
      this.chatAbort && this.chatAbort.abort();
      const ac = this.chatAbort = new AbortController();
      this.setStatus('thinking'); this.setSay('\u2026', 'neutral', message);
      this.announce(`You: ${message}`);
      let full = '', emotion = 'neutral', sentCount = 0, spokenChars = 0;
      const onText = (d) => { full += d; this.setSay(stripTags(full), emotion, message); };
      const onSentence = (text, e, token) => { emotion = e || emotion; sentCount++; spokenChars += text.length; this.$('avatar').dataset.emo = emo(emotion); this.enqueue(text, e, token); };
      try {
        let done = false;
        if (this.caps.chat !== false && this.caps.chatStream !== false) {
          try { await this.streamChat(message, ac.signal, onText, onSentence); done = true; this.caps.chat = true; } catch (e) {
            if (e.name === 'AbortError') throw e;
            if (e.status === 404 || e.status === 405 || e.status === 501 || e.status === undefined) { this.caps.chatStream = false; } else if (e.status === 429) { throw e; } else { this.caps.chatStream = false; }
          }
        }
        if (!done && this.caps.chat !== false) {
          try { const r = await fetch(`${API}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, persona: this.prefs.persona }), signal: ac.signal });
            if (!r.ok) { const er = new Error('chat ' + r.status); er.status = r.status; throw er; }
            const j = await r.json(); full = ''; const reply = j.reply || j.text || '';
            await this.reveal(reply, onText, ac.signal); sentences(reply).forEach((s) => onSentence(s)); done = true; this.caps.chat = true;
          } catch (e) { if (e.name === 'AbortError' || e.status === 429) throw e; this.caps.chat = false; this.updateMock(); }
        }
        if (!done) {
          this.updateMock();
          const lines = mockReply(message, this.prefs.persona);
          for (const l of lines) { const clean = stripTags(l); const m = l.match(/^\[([a-z]+)\]/i); await this.reveal(clean + ' ', onText, ac.signal, true); onSentence(clean, m ? m[1] : 'neutral'); }
        } else if (!sentCount && full.trim()) sentences(stripTags(full)).forEach((s) => onSentence(s, emotion));
        const final = stripTags(full) || this.$('say').textContent;
        this.history.push({ role: 'user', content: message }, { role: 'assistant', content: final }); this.history = this.history.slice(-12);
        this.announce(`Guide: ${final}`);
        if (!this.speaking && !this.q.length) this.setStatus('idle');
      } catch (e) {
        if (e.name === 'AbortError') return;
        const msg = e.status === 429 ? 'Slow down a little, okay? Try again in a minute.' : 'I lost the connection. Try the tour while I reconnect.';
        this.setSay(msg, 'sigh', message); this.announce(msg); this.setStatus('idle');
      }
    }

    async reveal(text, onText, signal, append) {
      const words = text.split(/(\s+)/); let acc = '';
      if (reduced()) { onText(text); return; }
      for (const w of words) { acc += w; onText(w); if (/\S/.test(w)) await sleep(25, signal); }
    }

    async streamChat(message, signal, onText, onSentence) {
      const r = await fetch(`${API}/api/chat/stream`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message, plain: this.prefs.persona === 'plain', session_id: this.sessionId }) });
      if (!r.ok || !r.body) { const er = new Error('chat stream ' + r.status); er.status = r.status; throw er; }
      const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let finished = false;
      const handle = (raw) => {
        const data = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
        if (!data) return;
        let ev; try { ev = JSON.parse(data); } catch (e) { return; }
        if (ev.type === 'text') onText(ev.delta || '');
        else if (ev.type === 'sentence') onSentence(stripTags(ev.text || ''), ev.emotion, ev.tts_token);
        else if (ev.type === 'done') finished = true;
      };
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.search(/\r?\n\r?\n/)) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i).replace(/^\r?\n\r?\n/, ''); }
      }
      if (buf.trim()) handle(buf);
      if (!finished && !buf) { /* stream closed without done: treat as complete */ }
    }

    /* ----- audio ----- */
    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.master = this.ctx.createGain(); this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 512;
        this.master.connect(this.analyser); this.analyser.connect(this.ctx.destination); this.master.gain.value = this.prefs.mute ? 0 : 1;
        this.ampBuf = new Uint8Array(this.analyser.fftSize);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    }
    amplitude() {
      if (!this.analyser) return 0; this.analyser.getByteTimeDomainData(this.ampBuf);
      let s = 0; for (let i = 0; i < this.ampBuf.length; i++) { const v = (this.ampBuf[i] - 128) / 128; s += v * v; }
      return Math.min(1, Math.sqrt(s / this.ampBuf.length) * 5);
    }

    enqueue(text, emotion, ttsToken) {
      text = stripTags(text); if (!text) return;
      const item = { text, emotion: emo(emotion), gen: this.speakGen, ttsToken };
      if (!this.prefs.mute && this.caps.tts !== false && !this.mock) item.audio = this.fetchAudio(item).catch((e) => ({ error: e }));
      this.q.push(item); this.pump();
    }
    stopSpeech() {
      this.speakGen++; this.q = []; this.audioAbort && this.audioAbort.abort(); this.audioAbort = null;
      (this.sources || []).forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } }); this.sources = [];
      this.playing = null; this.setSpeaking(false); this.tourTimer && clearTimeout(this.tourTimer);
    }
    setSpeaking(v) {
      this.speaking = v; this.$('avatar').dataset.speaking = String(v);
      if (!v) { this.$('caps').textContent = ''; this.timeline = null; }
      if (v) this.setStatus('speaking'); else if (this.$('status').dataset.s === 'speaking') this.setStatus('idle');
    }
    async pump() {
      if (this.pumping) return; this.pumping = true;
      const gen = this.speakGen; this.audioAbort = this.audioAbort || new AbortController();
      try {
        while (this.q.length && gen === this.speakGen) {
          const it = this.q.shift();
          try { await this.playItem(it, gen); } catch (e) { if (e.name !== 'AbortError') this.caps.tts = this.caps.tts; }
        }
      } finally {
        this.pumping = false;
        if (gen === this.speakGen) { this.setSpeaking(false); this.dispatchEvent(new CustomEvent('guide:idle')); if (this.tour && this.tour.auto) this.tourAdvanceSoon(); }
      }
    }

    async fetchAudio(it) {
      const body = JSON.stringify({ text: it.text, style: it.emotion, voice: 'example-guide', with_timing: false, tts_token: it.ttsToken, session_id: this.sessionId });
      const hdr = { 'Content-Type': 'application/json' };
      if (this.ttsPaths ? this.ttsPaths.tts : this.caps.tts !== false) {
        try {
          const r = await fetch(`${API}/v1/tts`, { method: 'POST', headers: hdr, body });
          if (r.ok) {
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('json')) {
              const j = await r.json(); this.caps.tts = true;
              let bytes;
              if (j.audio_url) { const a = await fetch(new URL(j.audio_url, API + '/').href); if (!a.ok) throw new Error('audio ' + a.status); bytes = await a.arrayBuffer(); }
              else if (j.audio_base64) { const bin = atob(j.audio_base64); bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer; }
              else throw new Error('no audio');
              this.ensureCtx(); const buffer = await this.ctx.decodeAudioData(bytes);
              const words = (j.words || []).map((w) => ({ w: w.w || w.word, start: w.start, end: w.end }));
              return { buffer, words, visemes: j.visemes || [] };
            }
            this.caps.tts = true; this.ensureCtx(); return { buffer: await this.ctx.decodeAudioData(await r.arrayBuffer()), words: [], visemes: [] };
          }
          if (![404, 405, 501].includes(r.status) && r.status < 500) throw new Error('tts ' + r.status);
        } catch (e) { if (e.name === 'AbortError') throw e; }
      }
      if (this.ttsPaths ? this.ttsPaths.stream : this.caps.tts !== false) {
        const r = await fetch(`${API}/v1/tts/stream`, { method: 'POST', headers: hdr, body });
        if (r.ok && r.body) { this.caps.tts = true; return { stream: r }; }
      }
      this.caps.tts = false; this.updateMock(); throw new Error('tts unavailable');
    }

    async playItem(it, gen) {
      this.playing = it; this.setSpeaking(true); this.$('avatar').dataset.emo = it.emotion;
      let audio = null;
      if (!this.prefs.mute && !this.mock && it.audio) audio = await it.audio;
      if (gen !== this.speakGen) return;
      if (audio && audio.error) audio = null;
      if (audio && (audio.buffer || audio.stream) && this.ctx && this.ctx.state !== 'running') {
        // Autoplay policy: no user gesture yet. Don't hang; fall back to silent timed playback.
        await Promise.race([this.ctx.resume().catch(() => {}), sleep(250)]);
        if (this.ctx.state !== 'running') audio = null;
      }
      const words = stripTags(it.text).split(/\s+/).filter(Boolean);
      if (audio && audio.buffer) {
        const { buffer } = audio; const src = this.ctx.createBufferSource(); src.buffer = buffer; src.connect(this.master);
        const start = this.ctx.currentTime + 0.05; this.sources = [src];
        this.timeline = { clock: () => this.ctx.currentTime - start, words: audio.words.length ? audio.words : this.estimate(words, buffer.duration), visemes: audio.visemes, amp: true, dur: buffer.duration };
        this.renderCaption(it.text, this.timeline.words);
        const ended = new Promise((res) => { src.onended = res; }); src.start(start); await ended;
      } else if (audio && audio.stream) {
        await this.playStream(audio.stream, it, words, gen);
      } else {
        const dur = Math.max(1.1, words.length * 0.34); const t0 = performance.now();
        this.timeline = { clock: () => (performance.now() - t0) / 1000, words: this.estimate(words, dur), visemes: [], amp: false, synthetic: true, dur };
        this.renderCaption(it.text, this.timeline.words);
        const myGen = this.speakGen; while (this.timeline && this.timeline.clock() < dur && myGen === this.speakGen) await sleep(60);
      }
      if (gen === this.speakGen) { this.timeline = null; await sleep(reduced() ? 0 : 120); }
    }

    async playStream(r, it, words, gen) {
      const rate = Number(r.headers.get('X-Guide-Sample-Rate')) || 44100; const rd = r.body.getReader();
      let when = this.ctx.currentTime + 0.08, first = when, carry = new Uint8Array(0), total = 0; this.sources = [];
      const est = Math.max(1.1, words.length * 0.34);
      this.timeline = { clock: () => this.ctx.currentTime - first, words: this.estimate(words, est), visemes: [], amp: true, dur: est };
      this.renderCaption(it.text, this.timeline.words);
      let last = null;
      for (;;) {
        const { value, done } = await rd.read(); if (done || gen !== this.speakGen) break;
        const merged = new Uint8Array(carry.length + value.length); merged.set(carry); merged.set(value, carry.length);
        const usable = merged.length - (merged.length % 4); carry = merged.slice(usable); if (!usable) continue;
        const f32 = new Float32Array(merged.buffer.slice(merged.byteOffset, merged.byteOffset + usable));
        const buf = this.ctx.createBuffer(1, f32.length, rate); buf.copyToChannel(f32, 0);
        const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.master); when = Math.max(when, this.ctx.currentTime + 0.02); s.start(when); when += buf.duration; total += buf.duration;
        this.sources.push(s); last = s;
      }
      if (total) { this.timeline.words = this.estimate(words, total); this.timeline.dur = total; }
      if (last && gen === this.speakGen) await new Promise((res) => { last.onended = res; });
    }

    estimate(words, dur) {
      const weights = words.map((w) => Math.max(2, w.length)); const sum = weights.reduce((a, b) => a + b, 0) || 1; let t = 0;
      return words.map((w, i) => { const d = (weights[i] / sum) * dur; const o = { w, start: t, end: t + d }; t += d; return o; });
    }

    renderCaption(text, words) {
      const c = this.$('caps'); c.textContent = '';
      if (!this.prefs.caps) return;
      words.forEach((w, i) => { const s = document.createElement('span'); s.className = 'w'; s.textContent = w.w; c.appendChild(s); if (i < words.length - 1) c.appendChild(document.createTextNode(' ')); });
      this.capSpans = c.querySelectorAll('.w');
    }

    /* ----- mouth animation: visemes > amplitude (gated by word timings) > synthetic ----- */
    loop() {
      requestAnimationFrame(this.loop);
      if (!this.mouthSvg || this.panel.hidden) return;
      let o = 0, w = 1; const tl = this.timeline;
      if (tl) {
        const t = tl.clock();
        const inWord = tl.words.findIndex((x) => t >= x.start && t < x.end);
        if (this.capSpans) this.capSpans.forEach((s, i) => s.classList.toggle('on', i === inWord));
        if (tl.visemes && tl.visemes.length) {
          const v = tl.visemes.find((x) => t >= x.start && t < x.end); if (v) [o, w] = visShape(v.v);
        } else if (tl.amp) {
          o = this.amplitude(); if (tl.words.length && inWord < 0) o *= 0.15; w = 1;
        } else if (inWord >= 0) {
          const ph = (t - tl.words[inWord].start) * 9; o = 0.35 + 0.55 * Math.abs(Math.sin(ph + inWord)); w = 1 + 0.25 * Math.sin(ph * 0.7);
        }
      }
      const ms = this.mouthState;
      if (reduced()) { o = o < 0.2 ? 0 : o < 0.6 ? 0.5 : 1; ms.o = o; ms.w = 1; }
      else { ms.o += (o - ms.o) * (o > ms.o ? 0.55 : 0.3); ms.w += (w - ms.w) * 0.35; }
      const ry = 1 + ms.o * 11, rx = 14 * ms.w + 4;
      this.mouthEl.setAttribute('ry', ry.toFixed(2)); this.mouthEl.setAttribute('rx', rx.toFixed(2));
      this.lipEl.setAttribute('ry', (ry + 1.2).toFixed(2)); this.lipEl.setAttribute('rx', (rx + 1.2).toFixed(2));
      this.mouthSvg.style.opacity = ms.o < 0.04 ? 0 : 1;
    }

    /* ----- push to talk ----- */
    bindMic(btn) {
      let downAt = 0; let kb = false;
      btn.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); downAt = performance.now(); if (!this.rec) this.startRec(); else this.stopRec(); this.holdDown = true; });
      const up = () => { if (!this.holdDown) return; this.holdDown = false; if (this.rec && performance.now() - downAt > 450) this.stopRec(); };
      btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
      btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat && !kb) { kb = true; this.rec ? this.stopRec() : this.startRec(); } } });
      btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); kb = false; } });
      btn.addEventListener('click', (e) => e.preventDefault());
    }
    async startRec() {
      await this.detect(); this.ensureCtx(); this.stopSpeech();
      if (this.caps.stt === false && SD.mock !== '1') { this.setSay('Voice input isn\u2019t available on this server yet. Type your question instead.', 'sigh'); this.announce('Voice input unavailable'); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) { this.setSay('This browser can\u2019t record audio. Type your question instead.', 'sigh'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream); const chunks = [];
        mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); if (!mr.cancelled) this.transcribe(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); };
        mr.start(); this.rec = mr; this.recStart = performance.now();
        this.recUI(true); this.setStatus('listening'); this.announce('Listening');
        this.recTimer = setTimeout(() => this.stopRec(), 30000);
      } catch (e) { this.setSay(e && e.name === 'NotAllowedError' ? 'I need microphone permission for that. You can still type.' : 'No microphone found. You can still type.', 'sigh'); this.setStatus('idle'); }
    }
    recUI(on) { const b = this.shadow.querySelector('[data-act="mic"]'); b.dataset.rec = String(on); b.setAttribute('aria-pressed', String(on)); this.$('mictx').textContent = on ? 'Stop' : 'Talk'; }
    stopRec(cancel) {
      clearTimeout(this.recTimer); const mr = this.rec; if (!mr) return; this.rec = null; mr.cancelled = !!cancel;
      this.recUI(false); try { mr.state !== 'inactive' && mr.stop(); } catch (e) { /* ignore */ }
      if (!cancel) this.setStatus('thinking');
    }
    async transcribe(blob) {
      if (blob.size < 800) { this.setStatus('idle'); this.setSay('I didn\u2019t catch anything. Try again?', 'neutral'); return; }
      try {
        let text;
        if (SD.mock === '1' && this.caps.stt === false) text = 'Where do I find the CRM?';
        else { const fd = new FormData(); fd.append('audio', blob, 'speech.webm'); const r = await fetch(`${API}/v1/stt`, { method: 'POST', body: fd });
          if (!r.ok) { if ([404, 405, 501].includes(r.status)) this.caps.stt = false; throw new Error('stt ' + r.status); } text = ((await r.json()).text || '').trim(); }
        if (!text) { this.setStatus('idle'); this.setSay('I didn\u2019t catch that. Try again?', 'neutral'); return; }
        this.ask(text);
      } catch (e) { this.setStatus('idle'); this.setSay('Transcription failed. Please type your question.', 'sigh'); }
    }

    /* ----- tour ----- */
    async loadTour() {
      if (this.tours) return this.tours;
      const url = SD.tour || new URL('tours/tours.json', WIDGET_BASE).href;
      const r = await fetch(url); if (!r.ok) throw new Error('tour ' + r.status); this.tours = await r.json(); return this.tours;
    }
    siteKey(t) {
      if (SD.tourSite && t.sites[SD.tourSite]) return SD.tourSite;
      const h = location.hostname.replace(/^www\./, '');
      return t.sites[h] ? h : 'default';
    }
    async startTour(startAt = 0, key) {
      this.ensureCtx();
      if (this.panel.hidden) this.open();
      this.stopSpeech(); this.stopRec(true);
      try {
        const t = await this.loadTour(); key = key || this.siteKey(t); const site = t.sites[key] || t.sites.default;
        this.tour = { key, site, i: -1, auto: this.tour ? this.tour.auto : false };
        this.shadow.querySelector('[data-act="tour-auto"]').setAttribute('aria-pressed', String(this.tour.auto));
        this.panel.dataset.tour = 'on'; this.$('tourbar').hidden = false;
        this.tourGo(startAt);
      } catch (e) { this.setSay('I couldn\u2019t load the tour file. Ask me a question instead.', 'sigh'); }
    }
    async tourGo(i) {
      const tr = this.tour; if (!tr) return; const steps = tr.site.steps;
      if (i < 0) i = 0;
      if (i >= steps.length) { this.finishTour(); return; }
      this.stopSpeech(); this.tourTimer && clearTimeout(this.tourTimer);
      const step = steps[i];
      if (step.href && new URL(step.href, location.href).pathname !== location.pathname && new URL(step.href, location.href).origin === location.origin) {
        sessionStorage.setItem('ahg.tour', JSON.stringify({ key: tr.key, i, auto: tr.auto })); location.assign(step.href); return;
      }
      tr.i = i;
      this.$('tourtitle').textContent = `Step ${i + 1}/${steps.length}: ${step.title || ''}`;
      this.shadow.querySelector('[data-act="tour-prev"]').disabled = i === 0;
      this.shadow.querySelector('[data-act="tour-next"]').textContent = i === steps.length - 1 ? 'Finish \u2713' : 'Next \u2192';
      const line = (this.prefs.persona === 'plain' && step.say_plain) ? step.say_plain : step.say;
      this.setSay(stripTags(line), step.emotion, null);
      this.announce(`Tour step ${i + 1} of ${steps.length}: ${step.title || ''}. ${stripTags(line)}`);
      this.highlight(step);
      this.enqueue(line, step.emotion);
    }
    tourAdvanceSoon() {
      if (!this.tour || !this.tour.auto) return; clearTimeout(this.tourTimer);
      const my = this.tour.i; this.tourTimer = setTimeout(() => { if (this.tour && this.tour.i === my && this.tour.auto && !this.speaking && !this.q.length) this.tourGo(my + 1); }, reduced() ? 600 : 1400);
    }
    finishTour() {
      const done = this.prefs.persona === 'plain' ? 'That\u2019s the tour. Ask me anything else.' : 'That\u2019s all of it. It wasn\u2019t that hard, was it?';
      this.stopTour(true); this.setSay(done, 'happy'); this.announce('Tour complete'); this.enqueue(done, 'happy');
      this.dispatchEvent(new CustomEvent('guide:tour-complete', { detail: {} }));
    }
    stopTour(keepSpeech) {
      if (!this.tour) return; if (!keepSpeech) this.stopSpeech();
      this.tour = null; sessionStorage.removeItem('ahg.tour'); this.panel.dataset.tour = 'off'; this.$('tourbar').hidden = true;
      this.clearHighlight(); this.tourTimer && clearTimeout(this.tourTimer); this.dispatchEvent(new CustomEvent('guide:tour-end'));
    }
    resumeTour() {
      let s; try { s = JSON.parse(sessionStorage.getItem('ahg.tour') || 'null'); } catch (e) { s = null; }
      if (!s) return; sessionStorage.removeItem('ahg.tour');
      this.startTour(s.i, s.key).then(() => { if (this.tour) { this.tour.auto = !!s.auto; this.shadow.querySelector('[data-act="tour-auto"]').setAttribute('aria-pressed', String(!!s.auto)); } });
    }
    findTarget(step) {
      if (!step.selector) return null;
      try { return document.querySelector(step.selector); } catch (e) { return null; }
    }
    highlight(step) {
      const el = this.findTarget(step); this.hlEl = el;
      if (!el) { this.clearHighlight(); return; }
      const r = el.getBoundingClientRect(); const vh = innerHeight; const small = innerWidth <= 480;
      const wantTop = small ? Math.max(70, vh * 0.12) : Math.max(70, (vh - r.height) / 2);
      if (r.top < 60 || r.bottom > vh - 20 || small) scrollTo({ top: scrollY + r.top - wantTop, behavior: reduced() ? 'auto' : 'smooth' });
      this.ring = this.$('ring'); this.ring.dataset.miss = 'false';
      el.setAttribute('data-guide-target', ''); this.placeRing();
      let n = 0; const settle = () => { this.placeRing(); if (this.hlEl === el && n++ < 30) setTimeout(settle, 60); }; settle();
    }
    placeRing() {
      const el = this.hlEl; const ring = this.$('ring'); if (!ring) return;
      if (!el || !el.isConnected) { ring.dataset.miss = 'true'; return; }
      const r = el.getBoundingClientRect(); const pad = 6;
      Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      ring.dataset.miss = (r.width === 0 && r.height === 0) ? 'true' : 'false';
    }
    clearHighlight() { if (this.hlEl) this.hlEl.removeAttribute('data-guide-target'); this.hlEl = null; const ring = this.$('ring'); if (ring) ring.dataset.miss = 'true'; }
  }

  const MOUTH_SVG = `<svg class="mouth" viewBox="-30 -15 60 30" aria-hidden="true" style="opacity:0"><ellipse class="m-lip" cx="0" cy="0" rx="8" ry="2" fill="#b4505f"/><ellipse class="m-in" cx="0" cy="0" rx="7" ry="1" fill="#2a0a12"/></svg>`;

  customElements.define('afterlife-guide', AfterlifeGuide);
  const ensure = () => { let el = document.querySelector('afterlife-guide'); if (!el) { el = document.createElement('afterlife-guide'); document.body.appendChild(el); } return el; };
  const boot = () => ensure();
  window.AfterlifeGuide = { registerAvatar: (id, def) => { AVATARS[id] = def; }, element: ensure, styles: Object.keys(T), version: '0.1.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
