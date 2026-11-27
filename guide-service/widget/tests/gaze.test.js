// Unit tests for the gaze maths. Run: node --test guide-tts/widget/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../gaze.js');

const rng = (seed = 1) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const eyes = { L: { x: 440, y: 300 }, R: { x: 520, y: 300 } };       // 80 px apart
const mid = (e) => ({ x: (e.L.x + e.R.x) / 2, y: (e.L.y + e.R.y) / 2 });

test('clampEllipse never leaves the ellipse and is the identity well inside it', () => {
  const r = rng(7), ax = 18, ay = 4;
  for (let i = 0; i < 5000; i++) {
    const dx = (r() - 0.5) * 400, dy = (r() - 0.5) * 400;
    const [x, y] = G.clampEllipse(dx, dy, ax, ay);
    assert.ok((x / ax) ** 2 + (y / ay) ** 2 <= 1 + 1e-9, `outside: ${x},${y}`);
  }
  assert.deepEqual(G.clampEllipse(3, 1, ax, ay), [3, 1]);               // inside 70% of the radius: untouched
  assert.deepEqual(G.clampEllipse(0, 0, ax, ay), [0, 0]);
  assert.deepEqual(G.clampEllipse(5, 5, 0, 0), [0, 0]);                 // degenerate eye
});

test('clampEllipse eases toward the edge: monotonic, continuous, no hard stop', () => {
  let prev = 0;
  for (let d = 0; d <= 200; d += 0.5) {
    const [x] = G.clampEllipse(d, 0, 20, 5);
    assert.ok(x >= prev - 1e-12, 'monotonic');
    assert.ok(x - prev < 0.5 + 1e-9, 'never jumps');
    if (d > 14 && d < 60) assert.ok(x - prev < 0.5 - 1e-6 || prev === 0 || d < 14.6, 'slope falls past the soft start');
    prev = x;
  }
  assert.ok(prev > 19.99 && prev <= 20, 'saturates at the semi-axis');
  const [a] = G.clampEllipse(16, 0, 20, 5), [b] = G.clampEllipse(24, 0, 20, 5);
  assert.ok(b - a < 8 * 0.6, 'compressed near the edge');
});

test('travel limits are about 30-35% of the eye width and 20-25% of its height', () => {
  assert.ok(G.OPTS.ax >= 0.30 && G.OPTS.ax <= 0.35);
  assert.ok(G.OPTS.ay >= 0.20 && G.OPTS.ay <= 0.25);
});

test('vergence: both eyes aim at the same point, so they converge when it is near her face', () => {
  const near = G.gaze(eyes, { x: 480, y: 330 });
  assert.ok(near.L.yaw > 0 && near.R.yaw < 0, 'left eye looks right, right eye looks left');
  assert.ok(near.vergence > 5, `vergence ${near.vergence}`);
  assert.ok(near.L.nx > 0 && near.R.nx < 0);
  // symmetric target: equal and opposite
  assert.ok(Math.abs(near.L.yaw + near.R.yaw) < 1e-9);
  // far away the eyes are nearly parallel
  const far = G.gaze(eyes, { x: 4000, y: 300 });
  assert.ok(far.vergence < near.vergence / 5);
  assert.ok(far.L.yaw > 0 && far.R.yaw > 0);
  // the farther the target, the smaller the vergence
  let prev = Infinity;
  for (const d of [20, 60, 120, 300, 900, 3000]) { const v = G.gaze(eyes, { x: 480 + d, y: 300 }).vergence; assert.ok(v < prev); prev = v; }
  // each eye works from its OWN centre: moving the left eye changes only its angle
  const moved = G.gaze({ L: { x: 400, y: 300 }, R: eyes.R }, { x: 480, y: 330 });
  assert.notEqual(moved.L.yaw, near.L.yaw); assert.equal(moved.R.yaw, near.R.yaw);
});

test('pointer straight ahead of an eye gives zero offset; pitch follows the pointer vertically', () => {
  const g = G.gaze(eyes, { x: 440, y: 300 });
  assert.equal(g.L.nx, 0); assert.equal(g.L.ny, 0);
  assert.ok(G.gaze(eyes, { x: 440, y: 500 }).L.ny > 0 && G.gaze(eyes, { x: 440, y: 100 }).L.ny < 0);
});

test('head follow: only beyond the eye range, capped at 6 deg and a few px', () => {
  assert.deepEqual(G.headFollow(0.9, 0.9), { rot: 0, tx: 0, ty: 0 });
  assert.deepEqual(G.headFollow(1.0, 0), { rot: 0, tx: 0, ty: 0 });
  const h = G.headFollow(1.5, 0);
  assert.ok(h.rot > 0 && h.rot < G.OPTS.headMaxDeg && h.tx > 0);
  assert.equal(G.headFollow(-1.5, 0).rot, -h.rot);
  const m = G.headFollow(99, -99);
  assert.equal(m.rot, 6); assert.ok(m.tx <= 3 && Math.abs(m.ty) <= 3);
  assert.equal(G.headFollow(0, 5).rot, 0);                               // looking up/down tilts nothing
  let prev = -1;
  for (let r = 0.9; r <= 3; r += 0.05) { const v = G.headFollow(r, 0).rot; assert.ok(v >= prev); prev = v; }
  // through gaze(): a pointer inside the eye range leaves the head alone, a far one turns it toward the pointer
  assert.equal(G.gaze(eyes, { x: 480 + 200, y: 300 }).head.rot, 0);
  assert.ok(G.gaze(eyes, { x: 480 + 900, y: 300 }).head.rot > 3);
  assert.ok(G.gaze(eyes, { x: 480 - 900, y: 300 }).head.rot < -3);
});

test('saccades last 40-80 ms and settle with a small overshoot', () => {
  for (const a of [0.05, 0.3, 0.8, 1.2, 2]) { const d = G.saccadeDuration(a); assert.ok(d >= 40 && d <= 80); }
  assert.ok(G.saccadeDuration(0.1) < G.saccadeDuration(1));
  assert.equal(G.saccadeProgress(0, 60), 0);
  assert.ok(Math.abs(G.saccadeProgress(60, 60) - 1) < 1e-9);
  let prev = 0;
  for (let t = 0; t <= 60; t += 2) { const p = G.saccadeProgress(t, 60); assert.ok(p >= prev); prev = p; }
  assert.ok(G.saccadeProgress(60 + 40, 60) > 1);                         // overshoot...
  assert.ok(G.saccadeProgress(60 + 40, 60) < 1.08);                      // ...a small one
  assert.ok(Math.abs(G.saccadeProgress(60 + 140, 60) - 1) < 1e-9);      // and settled
  assert.ok(G.saccadeProgress(30, 60) < 0.6 && G.saccadeProgress(45, 60) > 0.6, 'not a linear float');
});

test('blink shape: closes fast, opens slower, back to 0', () => {
  assert.equal(G.blinkAmount(-5), 0); assert.equal(G.blinkAmount(0), 0);
  assert.equal(G.blinkAmount(G.BLINK_MS.close + 5), 1);
  assert.equal(G.blinkAmount(500), 0);
  assert.ok(G.blinkAmount(20) > 1 - G.blinkAmount(G.BLINK_MS.close + G.BLINK_MS.hold + 20));
  const r = rng(3);
  for (let i = 0; i < 500; i++) { const d = G.nextBlinkDelay(r); assert.ok(d >= 2000 && d <= 6000); }
});

test('lids follow vertical gaze: down drops the upper lid, up raises it; blink closes both', () => {
  const rest = G.lidOffsets(0, 0, 18), dn = G.lidOffsets(1, 0, 18), up = G.lidOffsets(-1, 0, 18);
  assert.equal(rest.up, 0);
  assert.ok(dn.up > 0 && up.up < 0 && dn.up > -up.up);
  const bl = G.lidOffsets(0, 1, 18);
  assert.ok(bl.up > 0 && bl.low < 0 && bl.up - bl.low >= 18 * 0.9, 'lids meet over the opening');
});

test('pupil is smaller in light themes and larger in dark ones, subtly', () => {
  assert.ok(G.pupilScale('light') < 1 && G.pupilScale('dark') > 1);
  assert.ok(G.pupilScale('dark') - G.pupilScale('light') <= 0.25);
});

test('director: input wins for 4 s, then she looks at the bubble or the viewer; talking = viewer + glances', () => {
  const d = new G.GazeDirector(rng(5));
  const base = { viewer: { x: 480, y: 300 }, bubble: { x: 200, y: 400 }, highlight: null, speaking: false };
  const last = { t: 1000, x: 900, y: 50, kind: 'pointer' };
  assert.equal(d.pick({ ...base, now: 3000, last }).kind, 'pointer');
  assert.equal(d.pick({ ...base, now: 4999, last }).kind, 'pointer');
  const kinds = new Set();
  for (let t = 5100; t < 60000; t += 100) kinds.add(d.pick({ ...base, now: t, last }).kind);
  assert.ok(kinds.has('bubble') && kinds.has('viewer') && !kinds.has('pointer'));
  const first = new G.GazeDirector(() => 0.1).pick({ ...base, now: 9000, last });
  assert.equal(first.kind, 'bubble');
  // without a bubble she only looks at the viewer
  assert.equal(new G.GazeDirector(rng(2)).pick({ ...base, bubble: null, now: 9000, last }).kind, 'viewer');
  // talking: the viewer, with glances at the highlighted element
  const t = new G.GazeDirector(rng(9)), talk = { ...base, speaking: true, highlight: { x: 700, y: 120 }, last: { ...last, t: 9999 } };
  const tk = []; for (let n = 0; n < 400; n++) tk.push(t.pick({ ...talk, now: 10000 + n * 100 }).kind);
  const glances = tk.filter((k) => k === 'highlight').length;
  assert.ok(glances > 0 && glances < tk.length * 0.4 && tk.filter((k) => k === 'viewer').length > tk.length * 0.6);
  assert.equal(tk[0], 'viewer');
  const noHl = new G.GazeDirector(rng(9)); for (let n = 0; n < 100; n++) assert.equal(noHl.pick({ ...talk, highlight: null, now: n * 100 }).kind, 'viewer');
});

function run(engine, seconds, gz, step = 16) {
  const trace = [];
  for (let t = 0; t <= seconds * 1000; t += step) trace.push({ t, s: engine.update(t, typeof gz === 'function' ? gz(t) : gz) });
  return trace;
}
const gz = (x, y) => G.gaze(eyes, { x, y });

test('engine: a new target is reached by a quick jump (about 40-80 ms) then a small settle', () => {
  const e = new G.GazeEngine({ rand: rng(4) });
  e.snap(gz(480, 300));
  const goal = gz(800, 300).L.nx;
  const tr = run(e, 1, (t) => (t < 100 ? gz(480, 300) : gz(800, 300)));
  const t0 = tr.find((r) => r.t >= 100).t;
  const at = (ms) => tr.find((r) => r.t >= t0 + ms).s.L.nx;
  assert.ok(at(100) > 0.9 * goal, 'most of the way within 100 ms');
  assert.ok(Math.abs(at(500) - goal) < 0.06, 'settled');
  assert.ok(at(20) < goal * 0.5 && at(20) > 0, 'moves, not teleports');
});

test('engine: idle jitter is tiny, and blinks come every 2-6 s', () => {
  const e = new G.GazeEngine({ rand: rng(11) });
  e.snap(gz(480, 300));
  const tr = run(e, 40, gz(480, 330));
  const xs = tr.slice(60).map((r) => r.s.L.nx), spread = Math.max(...xs) - Math.min(...xs);
  assert.ok(spread > 0.002 && spread < 0.12, `jitter spread ${spread}`);
  const starts = []; let was = 0;
  for (const r of tr) { if (r.s.blink > 0 && was === 0) starts.push(r.t); was = r.s.blink; }
  assert.ok(starts.length >= 6 && starts.length <= 20, `blinks: ${starts.length}`);
  for (let i = 1; i < starts.length; i++) { const gap = starts[i] - starts[i - 1]; assert.ok(gap >= 1900 && gap <= 6200, `gap ${gap}`); }
});

test('engine: a large gaze jump triggers a blink', () => {
  const e = new G.GazeEngine({ rand: () => 0.5 });
  e.snap(gz(480, 300)); e.nextBlink = 1e9; e.lastT = 0;
  e.update(16, gz(480, 300));
  assert.equal(e.blinkAt, null);
  e.update(32, gz(2500, 300));
  assert.notEqual(e.blinkAt, null);
  const small = new G.GazeEngine({ rand: () => 0.5 }); small.snap(gz(480, 300)); small.nextBlink = 1e9;
  small.update(16, gz(500, 305)); assert.equal(small.blinkAt, null);
});

test('engine: reduced motion = no saccade, no jitter, no blink, no head; only a slow, partial follow', () => {
  const e = new G.GazeEngine({ rand: rng(2), reduced: () => true });
  e.snap(gz(480, 300));
  const tr = run(e, 20, gz(2000, 300));
  assert.ok(tr.every((r) => r.s.blink === 0 && r.s.head.rot === 0 && r.s.head.tx === 0));
  const early = tr.find((r) => r.t >= 100).s.L.nx, goal = gz(2000, 300).L.nx;
  assert.ok(early < goal * 0.3, 'slow');
  const late = tr[tr.length - 1].s.L.nx;
  assert.ok(late > 0 && late <= goal * 0.7 + 1e-9, 'gentle: never reaches the full range');
  // steady: no jitter
  const tail = tr.slice(-50).map((r) => r.s.L.nx); assert.ok(Math.max(...tail) - Math.min(...tail) < 1e-3);
});

test('engine: the head follows slowly and returns to centre', () => {
  const e = new G.GazeEngine({ rand: rng(6) });
  e.snap(gz(480, 300)); e.nextBlink = 1e9;
  const tr = run(e, 3, (t) => (t < 1500 ? gz(2500, 300) : gz(480, 300)), 16);
  const peak = Math.max(...tr.map((r) => r.s.head.rot));
  assert.ok(peak > 4 && peak <= 6, `peak ${peak}`);
  assert.ok(Math.abs(tr[tr.length - 1].s.head.rot) < 0.2);
});

test('engine output never leaves the travel ellipse, even with settle overshoot and jitter', () => {
  const r = rng(99);
  let worst = 0;
  const e2 = new G.GazeEngine({ rand: rng(5) });
  let tx = gz(480, 300);
  for (let t = 0; t < 30000; t += 8) {
    if (t % 700 === 0) tx = gz(480 + (r() - 0.5) * 6000, 300 + (r() - 0.5) * 4000);
    const s = e2.update(t, tx);
    for (const k of ['L', 'R']) worst = Math.max(worst, Math.hypot(s[k].nx, s[k].ny));
  }
  assert.ok(worst <= 1 + 1e-9, `worst radius ${worst}`);
  assert.ok(worst > 0.9, 'and it does reach the edge');
});
