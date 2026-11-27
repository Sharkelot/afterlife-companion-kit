/*! Afterlife High companion: mouth-only lip-sync model (pure maths + a small state machine, no DOM).
 * Loaded by guide.js next to itself (UMD): window.AfterlifeLipsync in the browser, require() under `node --test`.
 *
 * Pipeline (all times in seconds unless a name ends in Ms):
 *   visemes from the server, or visemesFromWords() (letters -> vowel shapes) when there is no timing data
 *   -> smoothVisemes(): merge < 50 ms into neighbours, enforce a >= 70 ms hold
 *   -> Lipsync.update(): look-ahead of one viseme, 60-90 ms ease-in-out cross-fade between two sprite slots,
 *      amplitude envelope (attack 30 ms / release 120 ms) -> openness, 120 ms return to rest.
 * The state it returns is only opacities, a tiny scaleY and a jaw offset for the MOUTH layer; the face never moves.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AfterlifeLipsync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEYS = ['closed', 'A', 'I', 'E', 'O', 'U'];
  const OPTS = {
    mergeMs: 50,        // visemes shorter than this are merged into a neighbour
    holdMs: 70,         // minimum time a mouth shape is held
    xfadeMs: 75,        // cross-fade between two sprites (60-90 ms)
    xfadeReducedMs: 140,// slower fade for reduced / safe motion
    leadMs: 40,         // look-ahead: start the fade this long before the next viseme begins
    attackMs: 30, releaseMs: 120,   // amplitude envelope
    restMs: 120,        // open -> rest at the end of speech
    patchMs: 70,        // skin patch (hides the expression's own mouth) fade in / out
    floor: 0.6,         // cross-opacity of a vowel at the quietest audible syllable (so a faint one never ghosts)
    gate: [0.04, 0.16], // envelope range that opens the mouth (below it the mouth rests)
    scaleYMin: 0.92,    // mouth-layer scaleY at the quietest syllable (1.0 at the loudest)
    jawPx: 1.5,         // mouth-layer translateY at full openness
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = smoothstep;

  /* ---------- viseme names -> the six sprites ---------- */
  const OCULUS = ['sil', 'pp', 'ff', 'th', 'dd', 'kk', 'ch', 'ss', 'nn', 'rr', 'aa', 'e', 'ih', 'oh', 'ou'];
  const KEY_OF = { sil: 'closed', closed: 'closed', pp: 'closed', p: 'closed', b: 'closed', m: 'closed',
    ff: 'I', f: 'I', v: 'I', th: 'E', dd: 'E', d: 'E', t: 'E', kk: 'E', k: 'E', g: 'E', ch: 'U', sh: 'U', j: 'U', ss: 'I', s: 'I', z: 'I',
    nn: 'E', n: 'E', l: 'E', rr: 'U', r: 'U', aa: 'A', a: 'A', ah: 'A', e: 'E', eh: 'E', ee: 'I', ih: 'I', i: 'I', oh: 'O', o: 'O', ou: 'U', oo: 'U', u: 'U', w: 'U' };
  function visemeKey(v) {
    if (typeof v === 'number') v = OCULUS[v] || 'sil';
    const s = String(v);
    if (KEYS.includes(s)) return s;                       // already a sprite key
    return KEY_OF[s.toLowerCase()] || 'E';
  }

  // The real server's visemes are coarse per-word classes ("open" / "neutral" / "closed"): useless as mouth shapes. Only trust a list
  // that really names several different vowel shapes (Oculus / ARKit-style); otherwise derive shapes from the words' letters.
  function hasShapeVisemes(list) {
    const ks = new Set();
    for (const s of list || []) { const k = visemeKey(s.v !== undefined ? s.v : s.k); if (k !== 'closed') ks.add(k); }
    const names = new Set((list || []).map((s) => String(s.v !== undefined ? s.v : s.k).toLowerCase()));
    return ks.size >= 2 && !(names.size <= 3 && [...names].every((n) => ['open', 'neutral', 'closed', 'sil'].includes(n)));
  }

  /* ---------- smoothing ---------- */
  // segs: [{start, end, v}] (any viseme names) -> contiguous [{start, end, k}] covering [first.start, last.end]
  function smoothVisemes(segs, o) {
    o = Object.assign({}, OPTS, o || {});
    const merge = o.mergeMs / 1000, hold = o.holdMs / 1000;
    let a = (segs || []).filter((s) => s && s.end > s.start).map((s) => ({ start: s.start, end: s.end, k: visemeKey(s.v !== undefined ? s.v : s.k) }))
      .sort((x, y) => x.start - y.start);
    if (!a.length) return [];
    // 1. contiguous: gaps become rest (closed) unless a neighbour can simply absorb them
    const filled = [];
    for (const s of a) {
      const prev = filled[filled.length - 1];
      if (prev && s.start < prev.end) s.start = prev.end;               // overlaps: the earlier one wins
      if (s.end <= s.start) continue;
      if (prev && s.start - prev.end > 1e-6) filled.push({ start: prev.end, end: s.start, k: 'closed' });
      filled.push({ start: s.start, end: s.end, k: s.k });
    }
    a = filled;
    const join = () => {                                                 // adjacent same-shape segments are one
      for (let i = a.length - 1; i > 0; i--) if (a[i].k === a[i - 1].k) { a[i - 1].end = a[i].end; a.splice(i, 1); }
    };
    join();
    // 2. merge < mergeMs into the neighbour (the longer one; same shape first)
    const dur = (s) => s.end - s.start;
    for (let guard = 0; guard < 10000; guard++) {
      if (a.length < 2) break;
      let idx = -1, best = Infinity;
      for (let i = 0; i < a.length; i++) if (dur(a[i]) < merge - 1e-9 && dur(a[i]) < best) { best = dur(a[i]); idx = i; }
      if (idx < 0) break;
      const prev = a[idx - 1], next = a[idx + 1];
      let into;
      if (!prev) into = next; else if (!next) into = prev; else into = dur(prev) >= dur(next) ? prev : next;
      if (into === prev) prev.end = a[idx].end; else next.start = a[idx].start;
      a.splice(idx, 1); join();
    }
    // 3. minimum hold: stretch a short one into the next if the next can spare it, else fold it into the next
    for (let i = 0; i < a.length - 1; i++) {
      const s = a[i], n = a[i + 1];
      if (dur(s) >= hold - 1e-9) continue;
      const need = hold - dur(s);
      if (dur(n) - need >= hold - 1e-9) { s.end += need; n.start = s.end; }
      else { n.start = s.start; a.splice(i, 1); i = Math.max(-1, i - 2); }
      join();
    }
    return a;
  }

  /* ---------- letters -> visemes (no timing data from the server) ---------- */
  const NUCLEUS2 = { ee: 'I', ea: 'I', ie: 'I', ey: 'E', ai: 'E', ay: 'E', ei: 'E', oo: 'U', ou: 'U', ew: 'U', ue: 'U', au: 'A', aw: 'A', oa: 'O', ow: 'O', oi: 'O', oy: 'O', io: 'O' };
  const NUCLEUS1 = { a: 'A', e: 'E', i: 'I', o: 'O', u: 'U', y: 'I' };
  function wordTokens(word) {
    const w = String(word).toLowerCase();
    const letters = w.replace(/[^a-z]/g, '');
    const pause = /[.!?…:;]+["')\]]*$/.test(w) ? 1 : /[,\u2014-]+["')\]]*$/.test(w) ? 0.5 : 0;
    const toks = [];
    // a final "e" after a consonant is silent when the word has another vowel group ("make", "site")
    const groups = [...letters.matchAll(/[aeiouy]+/g)].map((m) => ({ s: m[0], i: m.index }));
    if (groups.length > 1 && /[^aeiouy]e$/.test(letters)) groups.pop();
    if (/^[mbp]/.test(letters)) toks.push({ k: 'closed', w: 0.5 });   // lips close before the first vowel
    groups.forEach((g, n) => {
      const pair = g.s.length > 1 ? NUCLEUS2[g.s.slice(0, 2)] : null;
      toks.push({ k: pair || NUCLEUS1[g.s[0]] || 'E', w: 1 + Math.min(1, (g.s.length - 1) * 0.3) });
      const after = letters[g.i + g.s.length];                          // bilabial or labiodental right after the nucleus
      if (after && /[mbp]/.test(after) && n < groups.length) toks.push({ k: 'closed', w: 0.45 });
      else if (after && /[fv]/.test(after)) toks.push({ k: 'I', w: 0.4 });
    });
    if (!toks.length && letters) toks.push({ k: /[mbp]/.test(letters[0]) ? 'closed' : 'E', w: 1 });
    return { toks, pause };
  }
  // words: [{w, start, end}] -> raw viseme segments (run through smoothVisemes()); punctuation closes the mouth briefly
  function visemesFromWords(words) {
    const out = [];
    for (const word of words || []) {
      const d = word.end - word.start; if (!(d > 0)) continue;
      const { toks, pause } = wordTokens(word.w);
      const tail = pause ? Math.min(0.14 * pause + 0.02, d * 0.3) : 0;
      const body = d - tail;
      const sum = toks.reduce((s, t) => s + t.w, 0) || 1;
      let t = word.start;
      for (const tk of toks) { const l = body * tk.w / sum; out.push({ start: t, end: t + l, v: tk.k }); t += l; }
      if (tail > 0) out.push({ start: t, end: word.end, v: 'closed' });
      else if (!toks.length) out.push({ start: word.start, end: word.end, v: 'closed' });
    }
    return out;
  }

  /* ---------- runtime state machine ---------- */
  class Lipsync {
    // opts: { reduced: () => bool (open/closed toggle, no transforms), o: overrides of OPTS }
    constructor(opts) {
      this.o = Object.assign({}, OPTS, (opts && opts.o) || {});
      this.reduced = (opts && opts.reduced) || (() => false);
      this.segs = [];
      this.reset();
    }
    reset() {
      this.from = 'closed'; this.to = 'closed'; this.p = 1;    // slot A shows `from`, slot B shows `to`; p = fade progress 0..1
      this.env = 0; this.peak = 0.25; this.vw = 0; this.patch = 0;
      this.lastNow = null; this.idx = 0; this.speaking = false; this.rest = 0; this.toggleOpen = false;
    }
    setTimeline(segs) { this.segs = segs || []; this.idx = 0; }
    segAt(t) {
      const a = this.segs; if (!a.length) return -1;
      let i = Math.min(this.idx, a.length - 1);
      if (t < a[i].start) i = 0;                                 // clock restarted
      while (i < a.length - 1 && t >= a[i].end) i++;
      this.idx = i;
      return t >= a[0].start && t < a[a.length - 1].end ? i : -1;
    }
    /* t: speech clock in seconds, or null when nothing is being said. nowMs: monotonic ms. amp: raw 0..1 RMS or null (no audio). */
    update(t, nowMs, amp) {
      const o = this.o, red = !!this.reduced();
      const dt = this.lastNow === null ? 16 : clamp(nowMs - this.lastNow, 0, 100); this.lastNow = nowMs;
      const talking = t !== null && t !== undefined;
      // target shape with a one-viseme look-ahead: fade toward the next shape so it lands on its boundary
      let target = 'closed', segOpen = false;
      if (talking) {
        const i = this.segAt(t);
        if (i >= 0) {
          const s = this.segs[i], nx = this.segs[i + 1];
          target = (nx && nx.start - t <= o.leadMs / 1000) ? nx.k : s.k;
          segOpen = target !== 'closed';
        }
      }
      if (red) target = segOpen ? 'A' : 'closed';                // reduced / safe: an open and a closed mouth, nothing in between
      // amplitude envelope: auto-gain, attack 30 ms, release 120 ms
      let raw;
      if (amp === null || amp === undefined) raw = segOpen ? 0.85 : 0;     // no audio (muted / blocked): the shape itself drives the opening
      else { this.peak = Math.max(amp, this.peak * Math.pow(0.5, dt / 1500)); raw = clamp(amp / Math.max(this.peak, 0.25), 0, 1); }
      const tc = raw > this.env ? o.attackMs : o.releaseMs;
      this.env += (raw - this.env) * (1 - Math.exp(-dt / tc));
      // cross-fade between the two sprite slots
      if (target !== this.to) {
        // retarget mid-fade: whatever is more visible becomes the new `from`
        if (this.p < 1) this.from = this.p >= 0.5 ? this.to : this.from; else this.from = this.to;
        this.to = target; this.p = 0;
        if (this.from === this.to) this.p = 1;
      }
      const xf = red ? o.xfadeReducedMs : o.xfadeMs;
      if (this.p < 1) this.p = Math.min(1, this.p + dt / xf);
      // openness: audible and the current shape is a vowel
      let open;
      if (red) open = segOpen ? 1 : 0;
      else {
        const g = smoothstep((this.env - o.gate[0]) / (o.gate[1] - o.gate[0]));
        open = g * (o.floor + (1 - o.floor) * this.env);
      }
      const shown = (k) => (k === 'closed' ? 0 : 1);
      // vw follows the openness; at the end of speech it falls to 0 over restMs
      const goal = talking ? open : 0;
      const rate = talking ? (goal > this.vw ? o.attackMs : o.releaseMs) : o.restMs / 3;   // /3: a first-order fall is ~95% done in 3 time constants
      this.vw += (goal - this.vw) * (1 - Math.exp(-dt / rate));
      if (!talking && this.vw < 0.01) this.vw = 0;
      // skin patch (hides the expression's own mouth): in with speech, out once the mouth is back at rest
      const wantPatch = talking || this.vw > 0.01 || this.p < 1 && this.to !== 'closed';
      this.patch = clamp(this.patch + (wantPatch ? dt : -dt) / o.patchMs, 0, 1);
      const e = easeInOut(this.p);
      const wA = (1 - e) * shown(this.from) * this.vw, wB = e * shown(this.to) * this.vw;
      const weights = { closed: 1 - wA - wB, A: 0, I: 0, E: 0, O: 0, U: 0 };
      if (shown(this.from)) weights[this.from] += wA;
      if (shown(this.to)) weights[this.to] += wB;
      const lvl = red ? 0 : this.vw;
      return {
        patch: easeInOut(this.patch), weights, open: this.vw, active: this.patch > 0,
        scaleY: red ? 1 : lerp(1, lerp(o.scaleYMin, 1, this.env), lvl) , jawPx: red ? 0 : o.jawPx * lvl, from: this.from, to: this.to, p: this.p,
      };
    }
  }

  // sprite stack opacities. Layers are stacked bottom -> top in KEYS order with `closed` as the opaque base; each layer's
  // CSS opacity is chosen so its final contribution equals the wanted weight (sequential alpha compositing).
  function stackOpacities(weights) {
    const order = KEYS.slice(1);
    const out = { closed: 1 };
    let behind = 1;                                                  // product of (1 - o) of the layers above, built top-down
    for (let i = order.length - 1; i >= 0; i--) {
      const k = order[i], w = clamp(weights[k] || 0, 0, 1);
      const o = behind >= 1 - 1e-9 || behind <= 1e-9 ? w : clamp(w / behind, 0, 1);
      out[k] = o; behind *= 1 - o;
    }
    return out;
  }

  return { KEYS, OPTS, OCULUS, visemeKey, hasShapeVisemes, smoothVisemes, visemesFromWords, wordTokens, Lipsync, stackOpacities, easeInOut, smoothstep };
});
