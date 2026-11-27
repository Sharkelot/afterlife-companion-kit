/*! Afterlife Companion Kit widget. Drop-in: <script src="/widget/guide.js"></script>
 * Web Component <afterlife-guide> with Shadow DOM. No dependencies, no build step.
 * Data attributes on the script tag (all optional):
 *   data-api        API origin (default: origin the script was loaded from)
 *   data-tour       URL of a tour JSON file (default: <widget>/tours/tours.json)
 *   data-tour-site  force a site key from the tour file (default: match location.hostname)
 *   data-avatar     avatar id (default tamsin-rook); data-avatar-focus="x,y,zoom" (launcher head crop)
 *   data-style      prism-mint | signal-coral | neon-magenta | acid-volt | holo-violet
 *   data-mode       auto | dark | light
 *   data-persona    tsundere | plain
 *   data-mock       "1" forces the built-in mock API (otherwise feature-detected)
 *   data-open       "1" starts with the panel open
 *   data-turnstile-site-key  public Turnstile site key (no mock fallback on verification failure)
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

  /* ---------- Theme tokens: five palette styles with dark and light variants ---------- */
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
  // Tamsin ships as transparent WebP frames: avatars/tamsin/<style>-<mode>/<frame>.webp (theme-tinted, alpha cutouts)
  // plus avatars/tamsin/base/ (untinted). `hit` is the silhouette polygon (percent of the frame) used as the click area.
  const TAMSIN_FRAMES = ['neutral', 'happy', 'joy', 'smirk', 'pout', 'laugh', 'surprised', 'blush', 'wink', 'thinking', 'sad', 'talk', 'blink',
    'm-closed', 'm-A', 'm-I', 'm-E', 'm-O', 'm-U'];
  const AVATARS = {
    'tamsin-rook': { name: 'Tamsin', role: 'Site guide', dir: 'avatars/tamsin', frames: TAMSIN_FRAMES, aspect: 1.0,
      alt: 'Tamsin Rook, punk netrunner with an indigo-violet bob and cybernetic arm',
      focus: { x: 0.5, y: 0.27, zoom: 2.6 }, hit: null, eyes: true },
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

  const EMOTIONS = { neutral: 'neutral', plain: 'neutral', happy: 'happy', warm: 'happy', joy: 'joy', laugh: 'laugh', laughing: 'laugh', angry: 'angry', annoyed: 'angry', pout: 'angry',
    tsundere: 'tsundere', smirk: 'tsundere', teasing: 'tsundere', embarrassed: 'embarrassed', flustered: 'embarrassed', blush: 'embarrassed',
    surprised: 'surprised', shock: 'surprised', sigh: 'sigh', sad: 'sigh', whisper: 'whisper', thinking: 'thinking', wink: 'wink' };
  const emo = (e) => EMOTIONS[String(e || '').toLowerCase()] || 'neutral';
  // emotion tag -> expression frame (Tamsin's sheet)
  const EMO_FRAME = { neutral: 'neutral', happy: 'happy', joy: 'joy', laugh: 'laugh', angry: 'pout', tsundere: 'smirk', embarrassed: 'blush',
    surprised: 'surprised', sigh: 'sad', whisper: 'thinking', thinking: 'thinking', wink: 'wink' };
  // viseme name -> mouth-shape frame (lip-sync set: closed, A, I, E, O, U)
  const VIS_FRAME = { sil: 'm-closed', pp: 'm-closed', p: 'm-closed', b: 'm-closed', m: 'm-closed', ff: 'm-I', f: 'm-I', v: 'm-I', th: 'm-E', dd: 'm-E', d: 'm-E', t: 'm-E',
    kk: 'm-E', k: 'm-E', g: 'm-E', ch: 'm-U', sh: 'm-U', j: 'm-U', ss: 'm-I', s: 'm-I', z: 'm-I', nn: 'm-E', n: 'm-E', l: 'm-E', rr: 'm-U', r: 'm-U',
    aa: 'm-A', a: 'm-A', ah: 'm-A', e: 'm-E', eh: 'm-E', ee: 'm-I', ih: 'm-I', i: 'm-I', oh: 'm-O', o: 'm-O', ou: 'm-U', oo: 'm-U', u: 'm-U', w: 'm-U' };
  const visFrame = (v) => {
    if (typeof v === 'number') v = OCULUS[v] || 'sil';
    return VIS_FRAME[String(v).toLowerCase()] || 'm-E';
  };

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
    [/tour|walkthrough|start/i, ['[tsundere] The tour points out the important sections. Try not to wander off.', 'Plain and useful. You’re welcome.'], ['The tour highlights the important sections.', 'Select Tour to begin.']],
    [/setup|install|configure/i, ['[tsundere] Check the setup guide and use your own service settings.', 'Read the prerequisites first, okay?'], ['Use the setup guide and configure your own services.', 'Check prerequisites before installing.']],
    [/theme|style|colour|color/i, ['[happy] Pick one of the five styles, then choose dark, light, or automatic mode.', 'Make it yours.'], ['Choose one of five styles and select dark, light, or automatic mode.', 'Preferences are saved in this browser.']],
  ];
  const MOCK_FALLBACK = [['[embarrassed] H-hm. I only know the site map in this preview.', 'Try asking about the tour, setup, or appearance.'], ['I only know the site map in this preview.', 'Ask about the tour, setup, or appearance.']];
  const mockReply = (msg, persona) => {
    const hit = MOCK_REPLIES.find((r) => r[0].test(msg));
    const set = hit ? (persona === 'plain' ? hit[2] : hit[1]) : (persona === 'plain' ? MOCK_FALLBACK[1] : MOCK_FALLBACK[0]);
    return set;
  };

  /* ---------- Styles ---------- */
  const css = () => `
:host{all:initial;display:block;position:fixed;inset:auto 0 0 auto;width:0;height:0;--fh:clamp(280px,46vh,440px);pointer-events:none;z-index:2147483000;font:16px/1.5 "IBM Plex Sans","Segoe UI",system-ui,sans-serif;color:var(--text)}
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
.launcher{pointer-events:auto;position:fixed;right:max(16px,env(safe-area-inset-right));bottom:calc(max(16px,env(safe-area-inset-bottom)) + var(--bar,0px));width:64px;height:64px;padding:0;border-radius:50%;border:2px solid var(--priTx);background:var(--surface);overflow:hidden;box-shadow:0 8px 28px rgb(0 0 0/.35),0 0 18px color-mix(in srgb,var(--priTx) 35%,transparent)}
.launcher .avatar{width:100%;border-radius:0;border:0;clip-path:none}
.launcher .dot{position:absolute;right:4px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--pop);border:2px solid var(--surface)}
.figure{--rim:var(--priTx);position:fixed;right:max(-2.5vw,-36px);bottom:0;height:var(--fh);aspect-ratio:1000/1040;pointer-events:none;z-index:1;background:none;border:0;transform-origin:50% 100%;animation:bob 5.2s ease-in-out infinite;filter:drop-shadow(0 0 1.5px color-mix(in srgb,var(--rim) 85%,transparent)) drop-shadow(0 0 10px color-mix(in srgb,var(--rim) 38%,transparent)) drop-shadow(0 8px 14px rgb(0 0 0/.38))}
.figure .frames{position:absolute;inset:0;pointer-events:none}
.figure .fr{position:absolute;inset:0;visibility:hidden;pointer-events:none}
.figure .fr.on{visibility:visible}
.figure img{position:absolute;display:block;pointer-events:none;user-select:none;-webkit-user-drag:none}
.figure .fr>img,.figure .face{inset:0;width:100%;height:100%}
/* head / body split (head-eye coordination): the head layer fades out under the chin, the body layer starts there; both are the same frame */
.figure .body{-webkit-mask-image:linear-gradient(to bottom,transparent 39.04%,#000 39.04%);mask-image:linear-gradient(to bottom,transparent 39.04%,#000 39.04%)}
.figure .face{-webkit-mask-image:linear-gradient(to bottom,#000 39.04%,transparent 40%);mask-image:linear-gradient(to bottom,#000 39.04%,transparent 40%)}
.figure .gz{-webkit-mask-size:100% 100%;mask-size:100% 100%}
.figure .hd{position:absolute;inset:0;transform-origin:51% 39.6%;will-change:transform}
/* eyes: sclera mask clips the iris+pupil, lids sit above; only transforms are animated */
.figure .eye,.figure .ir{position:absolute;inset:0}
.figure .clip{position:absolute;-webkit-mask-size:100% 100%;mask-size:100% 100%}
.figure .ir{will-change:transform}.figure .lid{will-change:transform}
.figure .clip::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgb(30 20 50/.16),transparent 45%);pointer-events:none}
.figure .hit{position:absolute;inset:0;pointer-events:none;cursor:pointer;background:transparent;-webkit-tap-highlight-color:transparent}
.figure[data-emo=angry]{--rim:var(--pop)}.figure[data-emo=embarrassed]{--rim:var(--secTx)}.figure[data-emo=surprised]{--rim:var(--popTx)}.figure[data-emo=happy],.figure[data-emo=joy],.figure[data-emo=laugh]{--rim:var(--pri)}
.figure[data-speaking=true]{filter:drop-shadow(0 0 2px var(--rim)) drop-shadow(0 0 16px color-mix(in srgb,var(--rim) 55%,transparent)) drop-shadow(0 8px 14px rgb(0 0 0/.38))}
@keyframes bob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-4px) scale(1.004,1.012)}}
.panel{pointer-events:auto;z-index:3;position:fixed;right:calc(var(--fh,0px) * .96 * .66 + 4px);bottom:max(20px,env(safe-area-inset-bottom));width:clamp(250px,calc(100vw - var(--fh,0px) * .96 * .66 - 36px),360px);background:var(--surface);color:var(--body);border:1px solid var(--priTx);border-radius:18px 18px 6px 18px;box-shadow:0 16px 48px rgb(0 0 0/.38),0 0 22px color-mix(in srgb,var(--priTx) 22%,transparent)}
.panel::after{content:"";position:absolute;right:-8px;bottom:36px;width:14px;height:14px;background:var(--surface);border:solid var(--priTx);border-width:1px 1px 0 0;transform:rotate(45deg)}
.inner{display:flex;flex-direction:column;max-height:min(560px,calc(100dvh - 48px));overflow:auto;border-radius:inherit}
.head{display:flex;align-items:center;gap:10px;padding:10px 10px 0 14px;font:600 .72rem "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;color:var(--label)}
.head b{color:var(--priTx);font-weight:700}
.head .grow{flex:1}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:99px;padding:2px 9px;font-size:.66rem;color:var(--label);text-transform:uppercase}
.chip i{width:8px;height:8px;border-radius:50%;background:var(--label)}
.chip[data-s=speaking] i,.chip[data-s=listening] i{background:var(--pop)}
.chip[data-s=thinking] i{background:var(--secTx)}
.chip[data-s=idle] i{background:var(--priTx)}
.mock{color:var(--popTx);border-color:var(--popTx)}
.stage{display:block;padding:12px 14px}
.avatar{--fx:.5;--fy:.5;--zoom:1;position:relative;aspect-ratio:1;overflow:hidden;background:var(--raised)}
.avatar img{position:absolute;max-width:none;width:calc(var(--zoom)*100%);left:calc(50% - var(--fx)*var(--zoom)*100%);top:calc(50% - var(--fy)*var(--zoom)*100%);user-select:none;pointer-events:none}
.bubble{position:relative;min-height:72px;max-height:190px;overflow:auto;background:var(--raised);border:1px solid var(--border);border-radius:12px;padding:10px 12px;color:var(--text);font-size:.95rem}
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
  :host{--fh:clamp(150px,24vh,210px)}
  .figure{right:-8px;bottom:calc(var(--sheet,0px) + var(--bar,0px) - 3px)}
  .panel{right:0;left:0;bottom:var(--bar,0px);width:auto;border-radius:16px 16px 0 0;border-width:1px 0 0}
  .panel::after{display:none}
  .inner{max-height:44dvh}
  .stage{padding:8px 10px}
  .head{gap:6px;padding:6px 6px 0 10px;flex-wrap:nowrap}.head b{white-space:nowrap;font-size:.62rem;letter-spacing:.08em}.chip{padding:1px 7px;white-space:nowrap}
  details.set{display:none}.panel[data-tour=on] .tourbar{margin:6px 10px 0}
  .bubble{min-height:64px;max-height:120px;font-size:.9rem}
  .bar{padding:8px 10px 0}.ask{padding:8px 10px calc(10px + env(safe-area-inset-bottom))}.caps{margin:8px 10px 0}.tourbar{margin:8px 10px 0}details.set{margin:8px 10px 10px}
  .head{padding-left:10px}
  .launcher{right:12px;bottom:calc(12px + var(--bar,0px))}
  .panel[data-tour=on] .bar,.panel[data-tour=on] .ask,.panel[data-tour=on] details.set,.panel[data-tour=on] .caps{display:none}
  .panel[data-tour=on] .stage{padding-bottom:0}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

  const HTML = `
<button class="launcher" part="launcher" aria-label="Open the site guide" aria-expanded="false" aria-haspopup="dialog">
  <span class="avatar" data-role="thumb"></span><span class="dot" aria-hidden="true"></span>
</button>
<section class="panel" role="dialog" aria-label="Site guide" hidden><div class="inner">
  <div class="head"><b>\u25C6 AFTERLIFE HIGH</b><span class="grow"></span>
    <span class="chip mock" data-role="mock" hidden>Mock API</span>
    <span class="chip" data-role="status" data-s="idle" role="status"><i></i><span data-role="statustx">Idle</span></span>
    <button data-act="close" aria-label="Minimise guide" title="Minimise (Esc)">\u2715</button></div>
  <div class="stage">
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
</div></section>
<div class="figure" data-role="avatar" data-emo="neutral" data-speaking="false" role="img" hidden><div class="frames" data-role="frames"></div><div class="hit" data-role="hit" aria-hidden="true"></div></div>
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
      this.avatarId = SD.avatar || 'tamsin-rook';
      this.setAvatar(this.avatarId);
      const sel = root.querySelector('[data-set="style"]');
      sel.innerHTML = Object.entries(T).map(([id, v]) => `<option value="${id}">${v[0]}</option>`).join('');
      sel.value = T[this.prefs.style] ? this.prefs.style : 'prism-mint';
      root.querySelector('[data-set="mode"]').value = this.prefs.mode;
      root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) this.act(b.dataset.act, b, e); });
      this.launcher.addEventListener('click', () => this.open());
      root.querySelector('[data-role="form"]').addEventListener('submit', (e) => { e.preventDefault(); const i = e.target.q; const v = i.value.trim(); if (v) { i.value = ''; this.ask(v); } });
      root.querySelectorAll('[data-set]').forEach((s) => s.addEventListener('change', () => { this.prefs[s.dataset.set] = s.value; store.set(s.dataset.set, s.value); if (s.dataset.set === 'style') store.set('styleUser', true); this.applyTheme(); }));
      this.panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.tour ? this.stopTour() : this.close(); } });
      this.bindMic(root.querySelector('[data-act="mic"]'));
      this.applyTheme();
      this.syncButtons();
      this.setSay(this.greeting(), this.prefs.persona === 'plain' ? 'neutral' : 'tsundere');
      this.mo = new MutationObserver(() => this.applyTheme());
      this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode', 'class'] });
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
      addEventListener('resize', () => { this.placeRing(); this.measureBar(); });
      this.measureBar(); setTimeout(() => this.measureBar(), 700); addEventListener('load', () => this.measureBar());
      addEventListener('scroll', () => this.placeRing(), { passive: true });
      this.loop = this.loop.bind(this);
      this.initGaze();
      requestAnimationFrame(this.loop);
      this.resumeTour();
      if (SD.open === '1' || this.hasAttribute('open')) this.open();
    }

    disconnectedCallback() { this.mo && this.mo.disconnect(); this.stopSpeech(); this.stopGaze(); }

    greeting() { return this.prefs.persona === 'plain' ? 'Hi, I\u2019m your site guide. Ask about this site, or take the tour.' : 'Hmph. Fine, I\u2019ll show you around. It\u2019s not like I was waiting or anything.'; }

    /* ----- theme & avatar ----- */
    // Tamsin is a stack of transparent WebP frames (expressions, lip-sync mouth shapes, blink). Every frame exists
    // pre-tinted per theme (avatars/tamsin/<style>-<mode>/<frame>.webp, colour-blend of hair tips / neon trim /
    // circuit + eye glow only), so a theme change is a src swap of the whole stack. Untinted art is avatars/tamsin/base/.
    avatarSrcFor(style, mode) {
      const a = this.avatar;
      if (!a || !a.dir) return null;
      return `${a.dir}/${style}-${mode}`;
    }
    frameUrl(dir, frame) { return new URL(`${dir}/${frame}.webp`, WIDGET_BASE).href; }
    swapAvatarImg(dir) {
      if (!this.avatar || this._dir === dir) return;
      this._dir = dir;
      const a = this.avatar;
      // Preload the whole stack for this theme, then flip src in one go so the swap never shows a half-tinted frame.
      const key = dir.split('/').pop();
      const urls = a.frames.map((f) => this.frameUrl(dir, f));
      this.eyeKey = key;
      this.shadow.querySelectorAll('.figure img[data-ey]').forEach((img) => urls.push(this.eyeUrl(key, img.dataset.ey)));
      Promise.all(urls.map((u) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => res(); im.src = u; })))
        .then(() => {
          if (this._dir !== dir) return;
          this.shadow.querySelectorAll('.figure img[data-img]').forEach((img) => { img.src = this.frameUrl(dir, img.dataset.img); });
          this.shadow.querySelectorAll('.figure img[data-ey]').forEach((img) => { img.src = this.eyeUrl(key, img.dataset.ey); });
          const th = this.shadow.querySelector('.avatar img'); if (th) th.src = this.frameUrl(dir, 'neutral');
        });
    }
    applyTheme() {
      const de = document.documentElement;
      // Follow the host site's own theme token (<html data-theme="prism-mint">) unless the visitor picked a style in the widget.
      const siteStyle = T[de.dataset.theme] ? de.dataset.theme : null;
      let style = T[this.prefs.style] ? this.prefs.style : 'prism-mint';
      if (siteStyle && !SD.style && !store.get('styleUser', false)) style = siteStyle;
      let mode = this.prefs.mode;
      if (mode === 'auto') {
        const hint = de.dataset.mode || (['dark', 'light'].includes(de.dataset.theme) ? de.dataset.theme : '') || (de.classList.contains('dark') ? 'dark' : de.classList.contains('light') ? 'light' : '');
        mode = ['dark', 'light'].includes(hint) ? hint : (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      }
      this.setAttribute('data-style', style);
      this.setAttribute('data-resolved', mode);
      this.applyPupil();
      const dir = this.avatarSrcFor(style, mode);
      if (dir) this.swapAvatarImg(dir);
    }

    setAvatar(id, def) {
      if (def) AVATARS[id] = def;
      const a = Object.assign({}, AVATARS[id] || AVATARS['tamsin-rook']);
      const nums = (s) => String(s).split(',').map(Number);
      if (SD.avatarFocus) { const [x, y, zoom] = nums(SD.avatarFocus); a.focus = { x, y, zoom }; }
      this.avatar = a;
      this._dir = null;
      const fig = this.$('avatar');
      const first = `${a.dir}/base`;
      // First paint uses the untinted base so she is never missing; applyTheme() swaps in the themed stack.
      // every frame = body layer + head group (head layer, plus the eye rig on frames whose eyes are open); same art, split at the chin
      const img = (f, cls) => `<img class="${cls}" data-img="${f}" src="${this.frameUrl(first, f)}" alt="" decoding="async" draggable="false">`;
      this.$('frames').innerHTML = a.frames.map((f) => `<div class="fr" data-frame="${f}">${img(f, 'body')}<div class="hd">${img(f, 'face')}</div></div>`).join('');
      this.frameEls = {}; this.headEls = {}; this.$('frames').querySelectorAll('.fr').forEach((el) => { this.frameEls[el.dataset.frame] = el; this.headEls[el.dataset.frame] = el.querySelector('.hd'); });
      this.eyeRig = null; this.eyeGroups = {}; this.gzApplied = null;
      if (a.eyes) this.loadEyeRig(a);
      const th = this.$('thumb');
      th.style.cssText = `--fx:${a.focus.x};--fy:${a.focus.y};--zoom:${a.focus.zoom}`;
      th.innerHTML = `<img src="${this.frameUrl(first, 'neutral')}" alt="" decoding="async" draggable="false">`;
      const hit = this.$('hit');
      // Click area = her silhouette only (polygon from the neutral frame's alpha); until it loads nothing is clickable.
      const setHit = (poly) => { hit.style.clipPath = `polygon(${poly.map((p) => `${p[0]}% ${p[1]}%`).join(',')})`; hit.style.pointerEvents = 'auto'; };
      if (a.hit) setHit(a.hit);
      else fetch(new URL(`${a.dir}/hit.json`, WIDGET_BASE).href).then((r) => r.json()).then((poly) => { if (Array.isArray(poly) && poly.length > 8) setHit(poly); }).catch(() => {});
      hit.addEventListener('click', () => this.poke());
      this.panel.setAttribute('aria-label', `${a.name}, ${a.role.toLowerCase()}`);
      this.$('who').textContent = `${a.name.toUpperCase()} // GUIDE`;
      fig.setAttribute('aria-label', a.alt);
      this.curFrame = null; this.mouthFrame = null; this.blinkUntil = 0; this.pokeUntil = 0;
      this.showFrame('neutral');
      this.scheduleBlink();
    }

    // Pick the single visible frame: poke reaction > blink > lip-sync mouth > thinking status > emotion expression.
    desiredFrame() {
      const now = performance.now();
      const fig = this.$('avatar');
      const emotion = fig.dataset.emo || 'neutral';
      if (now < this.pokeUntil) return 'blush';
      if (this.mouthFrame && this.mouthFrame !== 'm-closed') return this.mouthFrame;
      const under = (this.$('status').dataset.s === 'thinking' && !this.speaking) ? 'thinking' : (EMO_FRAME[emotion] || 'neutral');
      // frames with the eye rig blink with their own lids (gaze engine); the others swap to the baked blink frame
      if (now < this.blinkUntil && !reduced() && !(this.eyeRig && this.eyeRig.frames[under])) return 'blink';
      return under;
    }
    showFrame(name) {
      if (!this.frameEls || !this.frameEls[name] || this.curFrame === name) return;
      if (this.curFrame && this.frameEls[this.curFrame]) this.frameEls[this.curFrame].classList.remove('on');
      this.frameEls[name].classList.add('on'); this.curFrame = name;
      this.gzApplied = null; this.gzHead = null;   // the new frame's head group / eyes get the current pose on the next gaze step
    }
    updateFrame() { this.showFrame(this.desiredFrame()); }
    scheduleBlink() {
      clearTimeout(this.blinkTimer);
      if (reduced()) return;
      this.blinkTimer = setTimeout(() => {
        this.blinkUntil = performance.now() + 130; this.updateFrame();
        setTimeout(() => this.updateFrame(), 150);
        this.scheduleBlink();
      }, 2200 + Math.random() * 3600);
    }
    poke() {
      this.pokeUntil = performance.now() + 1300; this.updateFrame();
      setTimeout(() => this.updateFrame(), 1350);
    }

    /* ----- eye rig: gaze, saccades, lids, head-eye coordination (maths in gaze.js) ----- */
    eyeUrl(key, spec) { const [kind, frame, side] = spec.split('|'); return new URL(`${this.avatar.dir}/eyes/${key}/${frame}-${side}-${kind}.webp`, WIDGET_BASE).href; }
    loadGazeLib() {
      if (window.AfterlifeGaze) return Promise.resolve(window.AfterlifeGaze);
      if (!this._gazeLib) this._gazeLib = new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL('gaze.js', WIDGET_BASE).href; s.onload = () => res(window.AfterlifeGaze); s.onerror = rej; document.head.appendChild(s); });
      return this._gazeLib;
    }
    loadEyeRig(a) {
      Promise.all([fetch(new URL(`${a.dir}/eyes/eyes.json`, WIDGET_BASE).href).then((r) => r.json()), this.loadGazeLib()]).then(([rig, G]) => {
        if (this.avatar !== a || !rig || !rig.frames) return;
        this.G = G; this.eyeRig = rig; this.buildEyes(a, rig);
        this.gazeEngine = new G.GazeEngine({ reduced });
        this.gazeDir = new G.GazeDirector();
        this.updateFrame();
      }).catch(() => { /* no eye rig: the baked eyes simply stay */ });
    }
    buildEyes(a, rig) {
      const key = this._dir ? this._dir.split('/').pop() : 'base';
      const px = (x) => `${(x / rig.frame[0] * 100).toFixed(3)}%`, py = (y) => `${(y / rig.frame[1] * 100).toFixed(3)}%`;
      const box = (b) => `left:${px(b[0])};top:${py(b[1])};width:${px(b[2])};height:${py(b[3])}`;
      const url = (rel) => new URL(`${a.dir}/eyes/${rel}`, WIDGET_BASE).href;
      // head / body split masks for every frame (collar belongs to the body, neck fade, eyes punched out of the head layer)
      for (const f of rig.masks || []) {
        const el = this.frameEls[f]; if (!el) continue;
        const set = (img, file) => { const u = `url(${url(`${f}/${file}`)})`; img.classList.add('gz'); img.style.cssText = `-webkit-mask-image:${u};mask-image:${u}`; };
        set(el.querySelector('.body'), 'body-mask.webp'); set(this.headEls[f].querySelector('.face'), 'head-mask.webp');
      }
      for (const [f, eyes] of Object.entries(rig.frames)) {
        const hd = this.headEls[f]; if (!hd) continue;
        let html = '';
        for (const side of ['L', 'R']) {
          const e = eyes[side], sc = e.sclera, rel = (b) => `left:${((b[0] - sc[0]) / sc[2] * 100).toFixed(3)}%;top:${((b[1] - sc[1]) / sc[3] * 100).toFixed(3)}%;width:${(b[2] / sc[2] * 100).toFixed(3)}%;height:${(b[3] / sc[3] * 100).toFixed(3)}%`;
          const m = url(`${f}/${side}-sclera.webp`);
          html += `<div class="eye" data-side="${side}"><div class="clip" style="${box(sc)};-webkit-mask-image:url(${m});mask-image:url(${m})"><img src="${m}" alt="" style="inset:0;width:100%;height:100%" decoding="async" draggable="false">`
            + `<div class="ir"><img data-ey="iris|${f}|${side}" src="${this.eyeUrl(key, `iris|${f}|${side}`)}" alt="" style="${rel(e.iris)}" decoding="async" draggable="false">`
            + `<img class="pup" src="${url(`${f}/${side}-pupil.webp`)}" alt="" style="${rel(e.pupil)}" decoding="async" draggable="false"></div></div>`
            + `<img class="lid lo" data-ey="lid-low|${f}|${side}" src="${this.eyeUrl(key, `lid-low|${f}|${side}`)}" alt="" style="${box(e.lid)};width:${px(e.lid[2])};height:${py(e.lid[3])}" decoding="async" draggable="false">`
            + `<img class="lid up" data-ey="lid-up|${f}|${side}" src="${this.eyeUrl(key, `lid-up|${f}|${side}`)}" alt="" style="${box(e.lid)}" decoding="async" draggable="false"></div>`;
        }
        hd.insertAdjacentHTML('beforeend', html);
        const g = {};
        hd.querySelectorAll('.eye').forEach((el) => { g[el.dataset.side] = { ir: el.querySelector('.ir'), pup: el.querySelector('.pup'), up: el.querySelector('.lid.up'), lo: el.querySelector('.lid.lo') }; });
        this.eyeGroups[f] = g;
      }
      this.applyPupil();
    }
    applyPupil() {
      if (!this.G) return;
      const s = this.G.pupilScale(this.getAttribute('data-resolved'));
      for (const g of Object.values(this.eyeGroups)) for (const e of Object.values(g)) e.pup.style.transform = `scale(${s})`;
    }
    initGaze() {
      this.gzLast = null; this.gzTs = 0; this.inView = true; this.gzPx = { x: 0, y: 0 };
      const stamp = (x, y, kind) => { this.gzLast = { t: performance.now(), x, y, kind }; };
      // passive listeners; no layout reads in handlers
      addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') stamp(e.clientX, e.clientY, 'pointer'); }, { passive: true });
      addEventListener('pointerdown', (e) => stamp(e.clientX, e.clientY, e.pointerType === 'touch' ? 'tap' : 'pointer'), { passive: true });
      document.addEventListener('focusin', (e) => {
        const t = e.composedPath && e.composedPath()[0]; if (!t || !t.getBoundingClientRect || t === document.body || t === document.documentElement) return;
        const r = t.getBoundingClientRect(); stamp(r.left + r.width / 2, r.top + r.height / 2, 'focus');
      }, true);
      const measure = () => { const f = this.$('avatar'); if (!f.hidden) { this.figRect = f.getBoundingClientRect(); } this.bubbleC = this.panel && !this.panel.hidden ? (() => { const r = this.panel.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + Math.min(r.height * 0.4, 140) }; })() : null; };
      this.gazeMeasure = measure;
      addEventListener('resize', measure);
      if (window.ResizeObserver) { this._gro = new ResizeObserver(measure); this._gro.observe(this.$('avatar')); this._gro.observe(this.panel); }
      // off-screen = paused
      if (window.IntersectionObserver) { this._gio = new IntersectionObserver((en) => { this.inView = en[en.length - 1].isIntersecting; }); this._gio.observe(this.$('avatar')); }
      document.addEventListener('visibilitychange', () => { this.gzTs = 0; });
    }
    stopGaze() { this._gro && this._gro.disconnect(); this._gio && this._gio.disconnect(); }
    hlCenter(now) {
      if (!this.hlEl || !this.hlEl.isConnected) return null;
      if (!this._hlT || now - this._hlT > 300) { this._hlT = now; const r = this.hlEl.getBoundingClientRect(); this._hlC = r.width || r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }
      return this._hlC;
    }
    gazeStep(now) {
      const G = this.G, fig = this.$('avatar');
      if (!G || !this.gazeEngine || fig.hidden || !this.inView || !this.figRect) return;
      const e = this.gazeEngine, calm = !this.gzBusy;
      if (now - this.gzTs < (calm ? 30 : 15)) return;     // ~60 fps while moving, ~30 fps while only micro-jitter
      this.gzTs = now;
      const rect = this.figRect, s = rect.width / this.eyeRig.frame[0];
      const fr = this.eyeRig.frames[this.curFrame] || this.eyeRig.frames.neutral;
      const ctr = (k) => ({ x: rect.left + fr[k].rest[0] * s, y: rect.top + fr[k].rest[1] * s });
      const eyes = { L: ctr('L'), R: ctr('R') };
      const viewer = { x: (eyes.L.x + eyes.R.x) / 2, y: (eyes.L.y + eyes.R.y) / 2 };
      const tgt = this.gazeDir.pick({ now, speaking: !!this.speaking, last: this.gzLast, viewer, bubble: this.bubbleC, highlight: this.speaking ? this.hlCenter(now) : null });
      const st = e.update(now, G.gaze(eyes, tgt));
      this.gzBusy = st.moving || st.blink > 0 || Math.abs(st.head.rot) > 0.02;
      // head-eye coordination: the head group (hair, face, eyes) turns toward far targets; neck and body stay put
      const hd = this.headEls[this.curFrame], ht = `translate3d(${st.head.tx.toFixed(2)}px,${st.head.ty.toFixed(2)}px,0) rotate(${st.head.rot.toFixed(2)}deg)`;
      if (hd && this.gzHead !== ht) { hd.style.transform = ht; this.gzHead = ht; }
      const grp = this.eyeGroups[this.curFrame]; if (!grp || !this.eyeRig.frames[this.curFrame]) return;
      const O = G.OPTS, parts = [];
      for (const k of ['L', 'R']) {
        const ed = fr[k], c = st[k], lid = G.lidOffsets(c.ny, st.blink, ed.open_h);
        const dx = c.nx * O.ax * ed.w * s, dy = c.ny * O.ay * ed.open_h * s;
        parts.push(dx.toFixed(2), dy.toFixed(2), lid.up.toFixed(2), lid.low.toFixed(2));
      }
      const sig = parts.join(','); if (sig === this.gzApplied) return; this.gzApplied = sig;
      ['L', 'R'].forEach((k, i) => {
        const g = grp[k], [dx, dy, up, low] = parts.slice(i * 4, i * 4 + 4);
        g.ir.style.transform = `translate3d(${dx}px,${dy}px,0)`;
        g.up.style.transform = `translate3d(0,${(up * s).toFixed(2)}px,0)`; g.lo.style.transform = `translate3d(0,${(low * s).toFixed(2)}px,0)`;
      });
    }

    /* ----- panel ----- */
    open() {
      this.panel.hidden = false; this.launcher.hidden = true; this.$('avatar').hidden = false; this.measureSheet(); this.updateFrame(); this.gazeMeasure && this.gazeMeasure();
      this.launcher.setAttribute('aria-expanded', 'true');
      this.ensureCtx();
      this.detect();
      this.panel.querySelector('#q').focus({ preventScroll: true });
    }
    close() {
      this.stopSpeech(); this.stopRec(true);
      this.panel.hidden = true; this.launcher.hidden = false; this.$('avatar').hidden = true;
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
      // while she is speaking the emotion follows the sentence being played (set in playItem), not the text that has streamed in
      if (!this.speaking) { this.$('avatar').dataset.emo = emo(emotion); this.updateFrame(); }
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
    updateMock() { this.mock = !SD.turnstileSiteKey && SD.mock === '1'; this.syncButtons(); }

    /* ----- chat ----- */
    async ask(message) {
      this.ensureCtx(); this.stopSpeech(); this.stopRec(true);
      await this.detect();
      if (SD.turnstileSiteKey) { this.caps.chat = true; this.caps.chatStream = true; this.updateMock(); }
      this.chatAbort && this.chatAbort.abort();
      const ac = this.chatAbort = new AbortController();
      this.setStatus('thinking'); this.setSay('\u2026', 'neutral', message);
      this.announce(`You: ${message}`);
      let full = '', emotion = 'neutral', sentCount = 0, spokenChars = 0;
      const onText = (d) => { full += d; this.setSay(stripTags(full), emotion, message); };
      const onSentence = (text, e, token) => { emotion = e || emotion; sentCount++; spokenChars += text.length; if (!this.speaking && !this.q.length) { this.$('avatar').dataset.emo = emo(emotion); this.updateFrame(); } this.enqueue(text, e, token); };
      try {
        let done = false;
        if (this.caps.chat !== false && this.caps.chatStream !== false) {
          try { await this.streamChat(message, ac.signal, onText, onSentence); done = true; this.caps.chat = true; } catch (e) {
            if (e.name === 'AbortError') throw e;
            if (SD.turnstileSiteKey) throw e;
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
          if (!this.mock) throw new Error('chat unavailable');
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

    async getTurnstileToken(signal) {
      if (!SD.turnstileSiteKey) return undefined;
      if (!window.turnstile) {
        if (!window.__ahgTurnstileScript) window.__ahgTurnstileScript = new Promise((resolve, reject) => {
          const tag = document.createElement('script'); tag.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          tag.async = true; tag.onload = resolve; tag.onerror = reject; document.head.appendChild(tag);
        });
        await window.__ahgTurnstileScript;
      }
      if (!window.turnstile) throw new Error('Turnstile unavailable');
      const mount = document.createElement('div'); this.shadowRoot.appendChild(mount);
      return new Promise((resolve, reject) => {
        let widgetId, settled = false;
        const finish = (token, error) => {
          if (settled) return; settled = true; clearTimeout(timer);
          signal && signal.removeEventListener('abort', onAbort);
          if (widgetId !== undefined) window.turnstile.remove(widgetId);
          mount.remove(); if (error) reject(error); else resolve(token);
        };
        const onAbort = () => finish(null, new DOMException('aborted', 'AbortError'));
        const timer = setTimeout(() => finish(null, new Error('Turnstile timed out')), 15000);
        signal && signal.addEventListener('abort', onAbort, { once: true });
        try {
          widgetId = window.turnstile.render(mount, { sitekey: SD.turnstileSiteKey, execution: 'execute',
            appearance: 'interaction-only', callback: (token) => finish(token),
            'error-callback': () => finish(null, new Error('Turnstile failed')) });
          window.turnstile.execute(widgetId);
        } catch (e) { finish(null, e); }
      });
    }
    async streamChat(message, signal, onText, onSentence) {
      const turnstile = await this.getTurnstileToken(signal);
      const r = await fetch(`${API}/api/chat/stream`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message, plain: this.prefs.persona === 'plain', session_id: this.sessionId, turnstile }) });
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
      if (!finished) throw new Error('chat stream incomplete');
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
      this.speaking = v; this.$('avatar').dataset.speaking = String(v); if (!v) { this.mouthFrame = null; this.updateFrame(); }
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
      const body = JSON.stringify({ text: it.text, style: it.emotion, voice: 'default', with_timing: false, tts_token: it.ttsToken, session_id: this.sessionId });
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
      this.playing = it; this.setSpeaking(true); this.$('avatar').dataset.emo = it.emotion; this.updateFrame();
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
      if (!this.frameEls || this.panel.hidden || document.hidden) return;
      this.gazeStep(performance.now());
      let o = 0, vf = null; const tl = this.timeline;
      if (tl) {
        const t = tl.clock();
        const inWord = tl.words.findIndex((x) => t >= x.start && t < x.end);
        if (this.capSpans) this.capSpans.forEach((sp, i) => sp.classList.toggle('on', i === inWord));
        if (tl.visemes && tl.visemes.length) {
          const v = tl.visemes.find((x) => t >= x.start && t < x.end); if (v) { vf = visFrame(v.v); o = visShape(v.v)[0]; }
        } else if (tl.amp) {
          o = this.amplitude(); if (tl.words.length && inWord < 0) o *= 0.15;
        } else if (inWord >= 0) {
          const ph = (t - tl.words[inWord].start) * 9; o = 0.35 + 0.55 * Math.abs(Math.sin(ph + inWord));
        }
        if (!vf) {
          // amplitude / synthetic: choose the mouth shape by opening, rotating the mid shapes per word so it doesn't strobe
          const k = Math.max(0, inWord) % 3;
          vf = o < 0.16 ? 'm-closed' : o < 0.38 ? ['m-U', 'm-I', 'm-E'][k] : o < 0.68 ? ['m-E', 'm-O', 'm-I'][k] : ['m-A', 'm-O', 'm-A'][k];
        }
      } else vf = null;
      const ms = this.mouthState; const now = performance.now();
      if (reduced() && vf) vf = o < 0.2 ? 'm-closed' : 'm-A'; // reduced motion: only closed / open
      // hold each mouth frame >= 70ms so fast visemes read as speech rather than flicker
      if (vf !== this.mouthFrame && now - (ms.t || 0) >= (reduced() ? 150 : 70)) { this.mouthFrame = vf; ms.t = now; this.updateFrame(); }
    }

    // The head bubble must never sit on the host page's own fixed bottom bar (mobile tab bars): measure it and lift above it.
    measureBar() {
      let off = 0; const vh = innerHeight, vw = innerWidth;
      for (const el of document.body.querySelectorAll(':scope > *, :scope > * > *')) {
        if (el === this) continue;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height <= 140 && r.width >= vw * 0.8 && r.bottom >= vh - 2 && r.top > vh * 0.5) off = Math.max(off, Math.round(vh - r.top));
      }
      this.style.setProperty('--bar', `${off}px`);
    }

    measureSheet() {
      // Mobile bottom sheet: Tamsin stands on its top edge, so publish the sheet height as --sheet.
      if (!this._ro && window.ResizeObserver) {
        this._ro = new ResizeObserver(() => this.measureSheet());
        this._ro.observe(this.panel);
      }
      const h = this.panel.hidden ? 0 : Math.round(this.panel.getBoundingClientRect().height);
      this.style.setProperty('--sheet', `${h}px`);
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
        if (SD.mock === '1' && this.caps.stt === false) text = 'What can you help with?';
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

  customElements.define('afterlife-guide', AfterlifeGuide);
  const ensure = () => { let el = document.querySelector('afterlife-guide'); if (!el) { el = document.createElement('afterlife-guide'); document.body.appendChild(el); } return el; };
  const boot = () => ensure();
  window.AfterlifeGuide = { registerAvatar: (id, def) => { AVATARS[id] = def; }, element: ensure, styles: Object.keys(T), version: '0.1.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
