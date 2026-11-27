/*! Afterlife High companion: eye-gaze model (pure maths + state machines, no DOM).
 * Loaded by guide.js next to itself (UMD): window.AfterlifeGaze in the browser, require() under `node --test`.
 *
 * Conventions: screen px, y down. Each eye looks at the SAME 3D target point (the pointer on a plane `viewerZ` px in
 * front of her), so every eye gets its own yaw/pitch and the pair converges when the target is near her face.
 * "n" coordinates are normalised to the iris travel ellipse: (nx, ny) = (1, 0) is the horizontal edge of the sclera range.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AfterlifeGaze = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OPTS = {
    viewerZ: 520,       // px between her eyes and the target plane (the screen / viewer)
    yawFull: 32,        // deg of eye yaw that reaches the horizontal edge of the iris ellipse
    pitchFull: 22,      // deg of eye pitch that reaches the vertical edge
    soft: 0.3,          // last 30% of the ellipse radius eases in (no hard stop)
    ax: 0.32,           // iris travel: fraction of the eye opening WIDTH (semi-axis)
    ay: 0.22,           // ... fraction of the opening HEIGHT
    headStart: 1.0,     // head only joins in when the raw gaze is beyond the eye range
    headMaxDeg: 6, headMaxPx: 3,
    idleMs: 4000,
    lidDown: 3.5, lidUp: 2.0,   // frame units the upper lid follows vertical gaze (down drops it, up raises it)
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const deg = (r) => r * 180 / Math.PI;

  /* ---------- ellipse clamp ---------- */
  // (nx, ny) are already divided by the ellipse semi-axes. Identity inside radius (1 - soft), then tanh-eases to 1: never exceeds 1.
  function softClamp(nx, ny, soft = OPTS.soft) {
    const m = Math.hypot(nx, ny), s0 = 1 - soft;
    if (m <= s0 || m === 0) return [nx, ny];
    const m2 = s0 + soft * Math.tanh((m - s0) / soft);
    return [nx * m2 / m, ny * m2 / m];
  }
  // pixel offset (dx, dy) -> pixel offset kept inside the ellipse with semi-axes (ax, ay) px
  function clampEllipse(dx, dy, ax, ay, soft = OPTS.soft) {
    if (!(ax > 0) || !(ay > 0)) return [0, 0];
    const [x, y] = softClamp(dx / ax, dy / ay, soft);
    return [x * ax, y * ay];
  }

  /* ---------- per-eye gaze toward one shared 3D point ---------- */
  function eyeAngles(eye, target, z = OPTS.viewerZ) {
    return { yaw: deg(Math.atan2(target.x - eye.x, z)), pitch: deg(Math.atan2(target.y - eye.y, z)) };
  }
  function headFollow(rx, ry, o = OPTS) {
    const sx = smoothstep(Math.max(0, Math.abs(rx) - o.headStart)), sy = smoothstep(Math.max(0, Math.abs(ry) - o.headStart));
    return { rot: Math.sign(rx) * o.headMaxDeg * sx, tx: Math.sign(rx) * o.headMaxPx * sx, ty: Math.sign(ry) * o.headMaxPx * 0.67 * sy };
  }
  // eyes: {L:{x,y}, R:{x,y}} (screen px), target: {x,y}. Returns per-eye normalised ellipse coords, vergence and the head command.
  function gaze(eyes, target, o = OPTS) {
    const out = {};
    let mx = 0, my = 0;
    for (const k of ['L', 'R']) {
      const a = eyeAngles(eyes[k], target, o.viewerZ);
      const rx = a.yaw / o.yawFull, ry = a.pitch / o.pitchFull;
      const [nx, ny] = softClamp(rx, ry, o.soft);
      out[k] = { nx, ny, yaw: a.yaw, pitch: a.pitch, rx, ry };
      mx += rx / 2; my += ry / 2;
    }
    out.vergence = out.L.yaw - out.R.yaw;      // > 0: eyes turned toward each other
    out.head = headFollow(mx, my, o);
    return out;
  }

  /* ---------- saccades ---------- */
  const saccadeDuration = (amp) => 40 + 40 * clamp(amp / 1.2, 0, 1);            // ms, 40..80
  // progress 0 -> 1 over `dur` ms (minimum-jerk), then a small damped overshoot that settles within `settle` ms
  function saccadeProgress(t, dur, settle = 140, overshoot = 0.07) {
    if (t <= 0) return 0;
    if (t < dur) { const u = t / dur; return u * u * u * (u * (u * 6 - 15) + 10); }
    const u = clamp((t - dur) / settle, 0, 1);
    return 1 + overshoot * Math.sin(Math.PI * u) * Math.exp(-2.5 * u) * (1 - u);
  }

  /* ---------- blink ---------- */
  const BLINK_MS = { close: 55, hold: 25, open: 85 };
  function blinkAmount(t) {
    if (t <= 0) return 0;
    const { close, hold, open } = BLINK_MS;
    if (t < close) return smoothstep(t / close);
    if (t < close + hold) return 1;
    if (t < close + hold + open) return 1 - smoothstep((t - close - hold) / open);
    return 0;
  }
  const nextBlinkDelay = (rand = Math.random) => 2000 + rand() * 4000;      // 2..6 s

  /* ---------- lids and pupil ---------- */
  function lidOffsets(ny, blink, openH, o = OPTS) {
    const follow = ny >= 0 ? ny * o.lidDown : ny * o.lidUp;                   // frame units; + = down
    return { up: follow + blink * openH * 0.62, low: -blink * openH * 0.45 + (ny < 0 ? ny * 0.5 : 0) * (1 - blink) };
  }
  const pupilScale = (mode) => (mode === 'light' ? 0.9 : 1.1);

  /* ---------- what is she looking at? ---------- */
  class GazeDirector {
    constructor(rand = Math.random, o = OPTS) { this.rand = rand; this.o = o; this.idle = null; this.glance = null; this.nextGlance = 0; }
    // inp: {now, speaking, last:{t,x,y,kind}|null, viewer:{x,y}, bubble:{x,y}|null, highlight:{x,y}|null}
    pick(inp) {
      const { now } = inp, r = this.rand;
      if (inp.speaking) {
        this.idle = null;
        if (inp.highlight) {
          if (this.glance && now >= this.glance.until) { this.glance = null; this.nextGlance = now + 2500 + r() * 2500; }
          if (!this.glance && now >= (this.nextGlance || (this.nextGlance = now + 1500 + r() * 1500))) this.glance = { until: now + 700 + r() * 500 };
          if (this.glance) return { ...inp.highlight, kind: 'highlight' };
        } else this.glance = null;
        return { ...inp.viewer, kind: 'viewer' };
      }
      this.glance = null;
      if (inp.last && now - inp.last.t < this.o.idleMs) { this.idle = null; return { x: inp.last.x, y: inp.last.y, kind: inp.last.kind }; }
      // idle: the speech bubble, now and then the viewer
      if (!this.idle || now >= this.idle.until) {
        const toBubble = inp.bubble && (!this.idle || this.idle.kind !== 'bubble' ? r() < 0.7 : r() < 0.4);
        this.idle = { kind: toBubble ? 'bubble' : 'viewer', until: now + 1500 + r() * 2000 };
      }
      const p = this.idle.kind === 'bubble' && inp.bubble ? inp.bubble : inp.viewer;
      return { x: p.x, y: p.y, kind: this.idle.kind };
    }
  }

  /* ---------- the engine: saccades, settle, jitter, blink, head ---------- */
  class GazeEngine {
    constructor({ rand = Math.random, reduced = () => false, opts = OPTS } = {}) {
      this.rand = rand; this.reduced = reduced; this.o = opts;
      this.cur = { L: [0, 0], R: [0, 0] }; this.goal = { L: [0, 0], R: [0, 0] };
      this.from = { L: [0, 0], R: [0, 0] }; this.sacStart = -1e9; this.sacDur = 60; this.lastSac = -1e9;
      this.jit = [0, 0]; this.jitGoal = [0, 0]; this.nextJit = 0; this.lastT = null;
      this.blinkAt = null; this.nextBlink = null; this.head = { rot: 0, tx: 0, ty: 0 }; this.blink = 0;
    }
    // jump straight to a gaze (no animation), e.g. first frame
    snap(g) { for (const k of ['L', 'R']) { this.cur[k] = [g[k].nx, g[k].ny]; this.goal[k] = [g[k].nx, g[k].ny]; this.from[k] = [g[k].nx, g[k].ny]; } }
    triggerBlink(now) { if (this.reduced()) return false; if (this.blinkAt !== null && now - this.blinkAt < 200) return false; this.blinkAt = now; this.nextBlink = now + nextBlinkDelay(this.rand); return true; }
    update(now, g) {
      const dt = this.lastT === null ? 16 : clamp(now - this.lastT, 0, 100); this.lastT = now;
      const red = this.reduced();
      if (this.nextBlink === null) this.nextBlink = now + nextBlinkDelay(this.rand);
      if (!red && now >= this.nextBlink) this.triggerBlink(now);
      this.blink = this.blinkAt === null || red ? 0 : blinkAmount(now - this.blinkAt);
      if (red) {
        // gentle slow follow, no saccades, no jitter, no blink, no head motion
        const a = 1 - Math.exp(-dt / 450);
        for (const k of ['L', 'R']) this.cur[k] = [lerp(this.cur[k][0], g[k].nx * 0.7, a), lerp(this.cur[k][1], g[k].ny * 0.7, a)];
        this.head = { rot: 0, tx: 0, ty: 0 };
        return this.state();
      }
      // new fixation? (catch-up saccades: at most one per 80 ms, ignore sub-4% changes)
      let amp = 0;
      for (const k of ['L', 'R']) amp = Math.max(amp, Math.hypot(g[k].nx - this.goal[k][0], g[k].ny - this.goal[k][1]));
      if (amp > 0.04 && now - this.lastSac >= 80) {
        for (const k of ['L', 'R']) { this.from[k] = this.cur[k].slice(); this.goal[k] = [g[k].nx, g[k].ny]; }
        this.sacStart = now; this.lastSac = now; this.sacDur = saccadeDuration(amp);
        if (amp > 0.9 && this.rand() < 0.8 && (this.blinkAt === null || now - this.blinkAt > 700)) this.triggerBlink(now);
      }
      const p = saccadeProgress(now - this.sacStart, this.sacDur);
      for (const k of ['L', 'R']) this.cur[k] = [lerp(this.from[k][0], this.goal[k][0], p), lerp(this.from[k][1], this.goal[k][1], p)];
      // micro-jitter while fixating: tiny re-targets every 0.4-1.3 s, eased fast
      if (now >= this.nextJit) { this.jitGoal = [(this.rand() - 0.5) * 0.05, (this.rand() - 0.5) * 0.035]; this.nextJit = now + 400 + this.rand() * 900; }
      const ja = 1 - Math.exp(-dt / 45);
      this.jit = [lerp(this.jit[0], this.jitGoal[0], ja), lerp(this.jit[1], this.jitGoal[1], ja)];
      // head: critically damped toward the command, a little behind the eyes
      const ha = 1 - Math.exp(-dt / 260), hd = g.head;
      this.head = { rot: lerp(this.head.rot, hd.rot, ha), tx: lerp(this.head.tx, hd.tx, ha), ty: lerp(this.head.ty, hd.ty, ha) };
      return this.state();
    }
    state() {
      const j = this.reduced() ? [0, 0] : this.jit;
      // settle overshoot and jitter ride on top of the saccade: re-apply the ellipse clamp so the output never leaves it
      const f = (k) => { const [nx, ny] = softClamp(this.cur[k][0] + j[0], this.cur[k][1] + j[1], this.o.soft); return { nx, ny }; };
      return { L: f('L'), R: f('R'), blink: this.blink, head: this.head, moving: this.lastT !== null && this.lastT - this.sacStart < 400 };
    }
  }

  return { OPTS, clamp, lerp, smoothstep, softClamp, clampEllipse, eyeAngles, headFollow, gaze, saccadeDuration, saccadeProgress,
    blinkAmount, nextBlinkDelay, BLINK_MS, lidOffsets, pupilScale, GazeDirector, GazeEngine };
});
