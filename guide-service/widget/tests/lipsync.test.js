// Unit tests for the lip-sync smoothing and state machine. Run: node --test guide-tts/widget/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lipsync.js');

const seg = (start, end, v) => ({ start, end, v });
const durs = (a) => a.map((s) => s.end - s.start);

test('visemeKey maps names, Oculus indices and sprite keys onto the six sprites', () => {
  assert.equal(L.visemeKey('aa'), 'A'); assert.equal(L.visemeKey('PP'), 'closed'); assert.equal(L.visemeKey(10), 'A');
  assert.equal(L.visemeKey(13), 'O'); assert.equal(L.visemeKey('U'), 'U'); assert.equal(L.visemeKey('???'), 'E'); assert.equal(L.visemeKey(0), 'closed');
});

test('smoothVisemes: output is contiguous, ordered, covers the input span and has no equal neighbours', () => {
  const out = L.smoothVisemes([seg(0.5, 0.7, 'aa'), seg(0.7, 0.9, 'ee'), seg(1.2, 1.5, 'oh'), seg(1.5, 1.8, 'oh')]);
  assert.equal(out[0].start, 0.5); assert.equal(out[out.length - 1].end, 1.8);
  for (let i = 1; i < out.length; i++) { assert.ok(Math.abs(out[i].start - out[i - 1].end) < 1e-9); assert.notEqual(out[i].k, out[i - 1].k); }
  assert.ok(out.some((s) => s.k === 'closed' && Math.abs(s.start - 0.9) < 1e-9 && Math.abs(s.end - 1.2) < 1e-9), 'the 0.9-1.2 gap is rest');
});

test('smoothVisemes: visemes shorter than 50 ms are merged into a neighbour', () => {
  const out = L.smoothVisemes([seg(0, 0.2, 'aa'), seg(0.2, 0.235, 'ee'), seg(0.235, 0.5, 'oh')]);
  assert.deepEqual(out.map((s) => s.k), ['A', 'O']);
  assert.equal(out[0].start, 0); assert.equal(out[1].end, 0.5);
  assert.ok(out.every((s) => s.end - s.start >= 0.05 - 1e-9));
});

test('smoothVisemes: a short one between two equal shapes disappears into one long shape', () => {
  const out = L.smoothVisemes([seg(0, 0.2, 'aa'), seg(0.2, 0.23, 'ee'), seg(0.23, 0.5, 'aa')]);
  assert.deepEqual(out.map((s) => s.k), ['A']); assert.equal(out[0].end, 0.5);
});

test('smoothVisemes: minimum hold of 70 ms (stretch into a neighbour that can spare it, else fold in)', () => {
  const out = L.smoothVisemes([seg(0, 0.3, 'aa'), seg(0.3, 0.36, 'ee'), seg(0.36, 0.8, 'oh')]);   // 60 ms: >= 50 but < 70
  assert.ok(out.every((s, i) => i === out.length - 1 || s.end - s.start >= 0.07 - 1e-9), JSON.stringify(out));
  assert.equal(out[0].start, 0); assert.equal(out[out.length - 1].end, 0.8);
  const fold = L.smoothVisemes([seg(0, 0.3, 'aa'), seg(0.3, 0.36, 'ee'), seg(0.36, 0.42, 'oh')]);  // nothing can spare 10 ms
  assert.ok(fold.every((s, i) => i === fold.length - 1 || s.end - s.start >= 0.07 - 1e-9), JSON.stringify(fold));
  assert.equal(fold[fold.length - 1].end, 0.42);
});

test('smoothVisemes: jittery input (random 10-120 ms shapes) always yields holds >= 70 ms and an unchanged span', () => {
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const names = ['aa', 'ee', 'oh', 'ou', 'ih', 'pp', 'sil', 'ss'];
  for (let n = 0; n < 200; n++) {
    let t = 0; const raw = [];
    for (let i = 0; i < 40; i++) { const d = 0.01 + rnd() * 0.11; raw.push(seg(t, t + d, names[Math.floor(rnd() * names.length)])); t += d; }
    const out = L.smoothVisemes(raw);
    assert.equal(out[0].start, 0); assert.ok(Math.abs(out[out.length - 1].end - t) < 1e-9);
    out.forEach((s, i) => {
      if (i < out.length - 1) assert.ok(s.end - s.start >= 0.07 - 1e-6, `hold ${s.end - s.start}`);
      if (i) { assert.ok(Math.abs(s.start - out[i - 1].end) < 1e-9); assert.notEqual(s.k, out[i - 1].k); }
    });
    assert.ok(out.length <= raw.length);
  }
});

test('smoothVisemes: empty, single and zero-length input are safe', () => {
  assert.deepEqual(L.smoothVisemes([]), []); assert.deepEqual(L.smoothVisemes(null), []);
  assert.deepEqual(L.smoothVisemes([seg(1, 1, 'aa')]), []);
  assert.deepEqual(L.smoothVisemes([seg(0, 0.02, 'aa')]).map((s) => s.k), ['A']);
});

test('visemesFromWords: vowels pick the sprite, bilabials close, punctuation rests, timing is exact', () => {
  const k = (w) => L.wordTokens(w).toks.map((t) => t.k);
  assert.deepEqual(k('cat'), ['A']); assert.deepEqual(k('see'), ['I']); assert.deepEqual(k('hello'), ['E', 'O']); assert.deepEqual(k('moon'), ['closed', 'U']);
  assert.deepEqual(k('make'), ['closed', 'A']); assert.deepEqual(k('hmm'), ['E']);                     // silent final e dropped; no vowel group -> neutral shape
  assert.deepEqual(k('number'), ['U', 'closed', 'E']);
  const words = [{ w: 'Hello', start: 0, end: 0.5 }, { w: 'there.', start: 0.5, end: 1.1 }];
  const segs = L.visemesFromWords(words);
  assert.equal(segs[0].start, 0); assert.ok(Math.abs(segs[segs.length - 1].end - 1.1) < 1e-9);
  for (let i = 1; i < segs.length; i++) assert.ok(Math.abs(segs[i].start - segs[i - 1].end) < 1e-9);
  assert.equal(segs[segs.length - 1].v, 'closed');                                                      // the full stop rests the mouth
});

test('hasShapeVisemes: the server\'s coarse open/neutral/closed words are not shapes; real viseme sets are', () => {
  assert.equal(L.hasShapeVisemes([seg(0, 0.3, 'open'), seg(0.3, 0.6, 'neutral'), seg(0.6, 0.9, 'closed'), seg(0.9, 1.2, 'open')]), false);
  assert.equal(L.hasShapeVisemes([]), false); assert.equal(L.hasShapeVisemes(null), false);
  assert.equal(L.hasShapeVisemes([seg(0, 0.3, 'aa'), seg(0.3, 0.6, 'ee'), seg(0.6, 0.9, 'oh')]), true);
  assert.equal(L.hasShapeVisemes([seg(0, 0.3, 10), seg(0.3, 0.6, 12), seg(0.6, 0.9, 13)]), true);
});

test('stackOpacities reproduces the wanted blend weights by sequential compositing', () => {
  const cases = [{ closed: 1 }, { closed: 0.4, A: 0.6 }, { closed: 0.1, A: 0.3, U: 0.6 }, { closed: 0, I: 0.5, O: 0.5 }, { closed: 0.25, E: 0.25, O: 0.25, U: 0.25 }];
  for (const w of cases) {
    const o = L.stackOpacities(w); const order = L.KEYS.slice(1);
    let rest = 1 - 1; let cum = 1; const got = { closed: 0 };
    for (let i = order.length - 1; i >= 0; i--) { got[order[i]] = o[order[i]] * cum; cum *= 1 - o[order[i]]; }
    got.closed = cum;
    for (const k of L.KEYS) assert.ok(Math.abs(got[k] - (w[k] || 0)) < 1e-9, `${k}: ${got[k]} vs ${w[k] || 0} in ${JSON.stringify(w)}`);
    void rest;
  }
});

// helper: run the machine at 60 fps
function run(ls, from, to, fn) { const out = []; for (let t = from; t < to; t += 1 / 60) out.push(ls.update(fn ? fn(t) : t, t * 1000, 0.8)); return out; }
const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);

test('Lipsync: weights always sum to 1 and stay in 0..1; scaleY and jaw stay inside their ranges', () => {
  const ls = new L.Lipsync(); ls.setTimeline(L.smoothVisemes([seg(0, 0.3, 'aa'), seg(0.3, 0.6, 'ee'), seg(0.6, 0.9, 'oh'), seg(0.9, 1.2, 'pp'), seg(1.2, 1.5, 'ou')]));
  const o = L.OPTS;
  for (const s of run(ls, 0, 2)) {
    assert.ok(Math.abs(sum(s.weights) - 1) < 1e-9);
    for (const v of Object.values(s.weights)) assert.ok(v >= -1e-9 && v <= 1 + 1e-9);
    assert.ok(s.scaleY >= o.scaleYMin - 1e-9 && s.scaleY <= 1 + 1e-9, `scaleY ${s.scaleY}`);
    assert.ok(s.jawPx >= 0 && s.jawPx <= o.jawPx + 1e-9);
  }
});

test('Lipsync: a change of shape cross-fades over 60-90 ms, eased, never a one-frame jump', () => {
  const ls = new L.Lipsync(); ls.setTimeline([{ start: 0, end: 0.6, k: 'A' }, { start: 0.6, end: 1.2, k: 'O' }]);
  const fr = run(ls, 0, 1.2);
  const wa = fr.map((s) => s.weights.A), wo = fr.map((s) => s.weights.O);
  const t0 = wo.findIndex((v) => v > 0.001), t1 = wo.findIndex((v) => v > 0.97 * Math.max(...wo));
  const ms = (t1 - t0) / 60 * 1000;
  assert.ok(ms >= 40 && ms <= 120, `fade ${ms} ms`);                           // 75 ms +- frame quantisation
  for (let i = 1; i < wo.length; i++) assert.ok(Math.abs(wo[i] - wo[i - 1]) < 0.45, `step ${wo[i] - wo[i - 1]} at ${i}`);
  assert.ok(wo[t0 + 1] - wo[t0] < wo[t0 + 3] - wo[t0 + 2] + 0.2);               // starts gently (ease-in)
  assert.ok(wa[t0 - 1] > 0.5, 'A is still the shape right before the fade');
});

test('Lipsync: look-ahead starts the fade before the next viseme begins (and lands by its boundary)', () => {
  const ls = new L.Lipsync(); ls.setTimeline([{ start: 0, end: 0.5, k: 'A' }, { start: 0.5, end: 1, k: 'U' }]);
  const fr = run(ls, 0, 1);
  const first = fr.findIndex((s) => s.weights.U > 0.01);
  assert.ok(first / 60 < 0.5 && first / 60 > 0.5 - L.OPTS.leadMs / 1000 - 0.03, `U starts at ${first / 60}`);
  assert.ok(fr[Math.round(0.5 * 60) + 3].weights.U > 0.8);
});

test('Lipsync: quiet syllables open less (cross-opacity and scaleY follow the amplitude envelope)', () => {
  const mk = (amp) => { const ls = new L.Lipsync(); ls.setTimeline([{ start: 0, end: 3, k: 'A' }]); let s; for (let t = 0; t < 1.5; t += 1 / 60) { ls.update(t, t * 1000, 1); } for (let t = 1.5; t < 2.5; t += 1 / 60) s = ls.update(t, t * 1000, amp); return s; };
  const loud = mk(1), quiet = mk(0.15), silent = mk(0.0);
  assert.ok(loud.weights.A > quiet.weights.A + 0.05, `${loud.weights.A} vs ${quiet.weights.A}`);
  assert.ok(loud.scaleY >= quiet.scaleY && loud.jawPx >= quiet.jawPx);
  assert.ok(silent.weights.A < 0.05 && silent.weights.closed > 0.95, 'no sound = the mouth rests');
});

test('Lipsync: envelope attack ~30 ms and release ~120 ms', () => {
  const ls = new L.Lipsync(); ls.setTimeline([{ start: 0, end: 10, k: 'A' }]);
  for (let t = 0; t < 0.5; t += 1 / 60) ls.update(t, t * 1000, 1);             // warm up the auto-gain at full level
  let n = 0, t = 0.5; while (ls.env > 0.37 && n < 600) { ls.update(t, t * 1000, 0); t += 1 / 60; n++; }   // release to 1/e
  assert.ok(Math.abs(n / 60 * 1000 - 120) < 40, `release ${n / 60 * 1000} ms`);
  n = 0; ls.env = 0; let a = 0; while (ls.env < 0.63 && n < 600) { ls.update(t, t * 1000, 1); t += 1 / 60; n++; a++; }
  assert.ok(Math.abs(a / 60 * 1000 - 30) < 25, `attack ${a / 60 * 1000} ms`);
});

test('Lipsync: returns to rest over ~120 ms at the end of speech, then drops the skin patch', () => {
  const ls = new L.Lipsync(); ls.setTimeline([{ start: 0, end: 2, k: 'A' }]);
  let t = 0; for (; t < 1; t += 1 / 60) ls.update(t, t * 1000, 0.9);
  const open = ls.update(t, t * 1000, 0.9); assert.ok(open.weights.A > 0.5 && open.patch === 1);
  const t0 = t; let tRest = null, tPatch = null;
  for (let i = 0; i < 90; i++) {
    t += 1 / 60; const s = ls.update(null, t * 1000, 0);
    if (tRest === null && s.weights.closed > 0.97) tRest = (t - t0) * 1000;
    if (tPatch === null && s.patch === 0) tPatch = (t - t0) * 1000;
  }
  assert.ok(tRest !== null && tRest >= 60 && tRest <= 220, `rest after ${tRest} ms`);
  assert.ok(tPatch !== null && tPatch > tRest - 1, `patch gone after ${tPatch} ms (after the mouth is at rest)`);
});

test('Lipsync reduced motion: only open / closed, no scaleY or jaw, slower fade', () => {
  let red = true; const ls = new L.Lipsync({ reduced: () => red });
  ls.setTimeline([{ start: 0, end: 0.5, k: 'E' }, { start: 0.5, end: 1, k: 'closed' }, { start: 1, end: 1.5, k: 'U' }]);
  const fr = run(ls, 0, 1.5);
  for (const s of fr) { assert.equal(s.scaleY, 1); assert.equal(s.jawPx, 0); assert.equal(s.weights.E, 0); assert.equal(s.weights.U, 0); assert.equal(s.weights.I + s.weights.O, 0); }
  assert.ok(fr.some((s) => s.weights.A > 0.9) && fr.some((s) => s.weights.closed > 0.99));
  const wa = fr.map((s) => s.weights.A), t0 = wa.findIndex((v) => v > 0.001), t1 = wa.findIndex((v) => v > 0.97);
  assert.ok((t1 - t0) / 60 * 1000 >= 100, 'reduced fade is slower than 75 ms');
  void red;
});

test('Lipsync without audio (muted): the viseme drives the opening, still smooth', () => {
  const ls = new L.Lipsync(); ls.setTimeline([{ start: 0, end: 1, k: 'O' }]);
  let s; for (let t = 0; t < 0.6; t += 1 / 60) s = ls.update(t, t * 1000, null);
  assert.ok(s.weights.O > 0.55);
});
