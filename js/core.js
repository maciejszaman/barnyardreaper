'use strict';
// Core: shared namespace, math helpers, persistence, input and the WebAudio synth.
window.G = window.G || {};

(function () {
  const U = G.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rnd: (a = 0, b = 1) => a + Math.random() * (b - a),
    rndi: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
    wrapAng(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; },
    fmtTime(s) { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },
    pct: (v, d = 0) => (v * 100).toFixed(d) + '%',
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    weighted(items, wfn) {
      let tot = 0; for (const it of items) tot += wfn(it);
      let r = Math.random() * tot;
      for (const it of items) { r -= wfn(it); if (r <= 0) return it; }
      return items[items.length - 1];
    },
    seeded(seed) {
      let a = seed >>> 0;
      return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    roman(n) { return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n] || String(n + 1); },
  };

  // ---------- persistence ----------
  const KEY = 'barnyard-reaper-v1';
  // Talents and their currencies (totems, and Miracles: the code's 'spoons') last for one run, so they live in G.run, not here.
  G.save = { best: { time: 0, level: 0, kills: 0 }, settings: { music: true, sfx: 0.8, res: 'ps2', shake: true } };
  G.store = {
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        Object.assign(G.save.best, d.best || {});
        Object.assign(G.save.settings, d.settings || {});
      } catch (e) { /* storage unavailable */ }
    },
    write() { try { localStorage.setItem(KEY, JSON.stringify(G.save)); } catch (e) { /* storage unavailable */ } },
  };

  // ---------- input ----------
  const I = G.input = { keys: new Set(), dash: false, touch: false, joy: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 }, mouse: { x: 0, y: 0, in: false } };
  const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft']);   // Left Alt: no browser menu bar
  addEventListener('keydown', (e) => {
    // typing in a form field (the talent creator's text boxes too): leave the keys to it
    if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) && e.code !== 'Escape') return;
    I.keys.add(e.code);
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!e.repeat && (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) I.dash = true;
    if (G.audio) G.audio.init();
    if (G.onKey && !e.repeat) G.onKey(e);
  });
  addEventListener('keyup', (e) => { I.keys.delete(e.code); if (e.code === 'AltLeft') e.preventDefault(); });
  addEventListener('blur', () => { I.keys.clear(); I.mouse.in = false; });
  // Mouse position (client pixels) for hover tooltips and scrapping with C. Touch has no hover.
  addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.in = true; });
  addEventListener('mouseout', (e) => { if (!e.relatedTarget) I.mouse.in = false; });
  addEventListener('pointerdown', () => G.audio && G.audio.init());

  I.move = function () {
    if (G.state !== 'playing') return { x: 0, z: 0 };
    const k = I.keys;
    let x = 0, z = 0;
    if (k.has('KeyW') || k.has('ArrowUp') || k.has('KeyZ')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft') || k.has('KeyQ')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (I.joy.active) { x += I.joy.x; z += I.joy.y; }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z };
  };

  // Touch: a floating joystick anywhere on the left 60% of the screen, plus a dash button.
  function joyEls() { return { joy: document.getElementById('joy'), knob: document.getElementById('joy-knob') }; }
  addEventListener('touchstart', (e) => {
    I.touch = true;
    if (G.state !== 'playing') return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('button')) continue;
      if (!I.joy.active && t.clientX < innerWidth * 0.6) {
        Object.assign(I.joy, { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 });
        const { joy, knob } = joyEls();
        joy.style.display = 'block'; joy.style.left = t.clientX + 'px'; joy.style.top = t.clientY + 'px';
        knob.style.transform = 'translate(0px,0px)';
        e.preventDefault();
      }
    }
  }, { passive: false });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== I.joy.id) continue;
      let dx = (t.clientX - I.joy.ox) / 55, dy = (t.clientY - I.joy.oy) / 55;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      I.joy.x = dx; I.joy.y = dy;
      joyEls().knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
      e.preventDefault();
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== I.joy.id) continue;
      Object.assign(I.joy, { active: false, id: null, x: 0, y: 0 });
      joyEls().joy.style.display = 'none';
    }
  };
  addEventListener('touchend', endTouch);
  addEventListener('touchcancel', endTouch);

  // ---------- audio ----------
  const A = G.audio = { ctx: null, ready: false, last: {} };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = A.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    A.master = ctx.createGain(); A.master.gain.value = 0.9;
    A.master.connect(comp); comp.connect(ctx.destination);
    A.sfx = ctx.createGain(); A.sfx.gain.value = G.save.settings.sfx; A.sfx.connect(A.master);
    A.mus = ctx.createGain(); A.mus.gain.value = 0.3; A.mus.connect(A.master);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noiseBuf = buf;
    A.ready = true;
    A.setMusic(G.save.settings.music);
  };

  // A single enveloped oscillator. o: {type,f,f2,dur,vol,att,delay|at,filt,fq,q,vib,vibAmt,dest}
  A.tone = function (o) {
    const ctx = A.ctx, t = o.at != null ? o.at : ctx.currentTime + (o.delay || 0), dur = o.dur || 0.1;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + dur);
    const g = ctx.createGain(), v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + (o.att || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.filt) {
      const f = ctx.createBiquadFilter(); f.type = o.filt; f.frequency.value = o.fq || 1000; f.Q.value = o.q || 1;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || A.sfx);
    if (o.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vib; lg.gain.value = o.vibAmt || 20;
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    osc.start(t); osc.stop(t + dur + 0.05);
  };

  // Filtered white noise burst. o: {dur,vol,filt,fq,fq2,q,att,delay|at,dest}
  A.noise = function (o) {
    const ctx = A.ctx, t = o.at != null ? o.at : ctx.currentTime + (o.delay || 0), dur = o.dur || 0.1;
    const src = ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;   // long swells loop the 2s buffer
    const f = ctx.createBiquadFilter(); f.type = o.filt || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.fq || 2000, t);
    if (o.fq2) f.frequency.exponentialRampToValueAtTime(o.fq2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol || 0.2), t + (o.att || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || A.sfx);
    src.start(t, Math.random() * 1.6, dur + 0.05);
  };

  const R = (a, b) => a + Math.random() * (b - a);
  // name: [min gap ms, recipe(param)]
  const SFX = {
    swing: [70, (p) => { A.noise({ dur: 0.17, vol: 0.13, filt: 'bandpass', fq: 450, fq2: 2600 * p, q: 1.3 }); A.tone({ type: 'sine', f: 180, f2: 90, dur: 0.12, vol: 0.04 }); }],
    hit: [32, () => { A.tone({ type: 'square', f: R(170, 230), f2: 60, dur: 0.07, vol: 0.07 }); A.noise({ dur: 0.05, vol: 0.1, fq: 1800 }); }],
    crit: [60, () => { A.tone({ type: 'square', f: 260, f2: 70, dur: 0.1, vol: 0.1 }); A.tone({ type: 'triangle', f: 1760, f2: 1320, dur: 0.16, vol: 0.09 }); A.noise({ dur: 0.08, vol: 0.14, filt: 'highpass', fq: 2600 }); }],
    block: [80, () => { A.tone({ type: 'square', f: 1250, dur: 0.22, vol: 0.06 }); A.tone({ type: 'square', f: 1712, dur: 0.18, vol: 0.045 }); A.tone({ type: 'triangle', f: 620, dur: 0.32, vol: 0.08 }); A.noise({ dur: 0.06, vol: 0.18, filt: 'highpass', fq: 3000 }); }],
    ricochet: [45, () => { A.tone({ type: 'sine', f: 900, f2: 2900, dur: 0.12, vol: 0.07 }); A.tone({ type: 'triangle', f: 1800, f2: 3600, dur: 0.08, vol: 0.035, delay: 0.02 }); }],
    explode: [60, () => { A.noise({ dur: 0.55, vol: 0.32, fq: 1500, fq2: 90 }); A.tone({ type: 'sine', f: 120, f2: 30, dur: 0.45, vol: 0.32 }); }],
    levelup: [250, () => { [523, 659, 784, 1047].forEach((f, i) => A.tone({ type: 'triangle', f, dur: 0.24, vol: 0.12, delay: i * 0.07 })); A.tone({ type: 'square', f: 1047, dur: 0.45, vol: 0.035, delay: 0.28 }); }],
    xp: [22, (p) => { A.tone({ type: 'sine', f: 900 * p, f2: 1350 * p, dur: 0.06, vol: 0.045 }); }],
    heal: [150, () => { A.tone({ type: 'sine', f: 520, f2: 1040, dur: 0.25, vol: 0.08 }); A.tone({ type: 'triangle', f: 780, f2: 1560, dur: 0.25, vol: 0.05, delay: 0.08 }); }],
    drop: [120, (r) => { const base = [660, 740, 880, 990][r] || 660; A.tone({ type: 'triangle', f: base, dur: 0.18, vol: 0.07 }); A.tone({ type: 'triangle', f: base * 1.5, dur: 0.3, vol: 0.06, delay: 0.09 }); if (r >= 3) [1, 1.25, 1.5, 2].forEach((m, i) => A.tone({ type: 'sine', f: base * 2 * m, dur: 0.35, vol: 0.05, delay: 0.2 + i * 0.06 })); }],
    pickup: [90, () => { A.tone({ type: 'square', f: 880, dur: 0.06, vol: 0.05 }); A.tone({ type: 'square', f: 1320, dur: 0.1, vol: 0.05, delay: 0.06 }); }],
    hurt: [110, () => { A.tone({ type: 'sawtooth', f: 330, f2: 110, dur: 0.18, vol: 0.13, filt: 'lowpass', fq: 1500 }); A.noise({ dur: 0.1, vol: 0.12, fq: 900 }); }],
    die_dog: [55, () => { A.tone({ type: 'square', f: R(760, 900), f2: 320, dur: 0.12, vol: 0.05, filt: 'lowpass', fq: 2200 }); }],
    die_crow: [65, () => { A.tone({ type: 'sawtooth', f: R(600, 700), f2: 380, dur: 0.16, vol: 0.055, vib: 30, vibAmt: 60, filt: 'bandpass', fq: 1100, q: 2 }); }],
    die_pumpkin: [65, () => { A.noise({ dur: 0.2, vol: 0.15, fq: 700, fq2: 150 }); A.tone({ type: 'sine', f: 220, f2: 70, dur: 0.15, vol: 0.11 }); }],
    die_golem: [500, () => { A.noise({ dur: 1.6, vol: 0.4, fq: 900, fq2: 60 }); A.tone({ type: 'sine', f: 90, f2: 25, dur: 1.4, vol: 0.4 }); }],
    bark: [700, () => { A.tone({ type: 'square', f: 520, f2: 300, dur: 0.09, vol: 0.05, filt: 'lowpass', fq: 1600 }); A.tone({ type: 'square', f: 540, f2: 280, dur: 0.1, vol: 0.05, filt: 'lowpass', fq: 1600, delay: 0.16 }); }],
    caw: [900, () => { A.tone({ type: 'sawtooth', f: 720, f2: 520, dur: 0.22, vol: 0.05, vib: 34, vibAmt: 70, filt: 'bandpass', fq: 1200, q: 2 }); }],
    shot: [40, () => { A.noise({ dur: 0.12, vol: 0.22, filt: 'highpass', fq: 900 }); A.tone({ type: 'square', f: 190, f2: 50, dur: 0.08, vol: 0.1 }); }],
    shotgun: [80, () => { A.noise({ dur: 0.34, vol: 0.36, fq: 3500, fq2: 200 }); A.tone({ type: 'sine', f: 120, f2: 40, dur: 0.22, vol: 0.28 }); }],
    throw: [60, () => { A.noise({ dur: 0.14, vol: 0.08, filt: 'bandpass', fq: 900, fq2: 1800, q: 1.5 }); }],
    shatter: [50, () => { A.noise({ dur: 0.15, vol: 0.16, filt: 'highpass', fq: 3500 }); for (let i = 0; i < 3; i++) A.tone({ type: 'triangle', f: R(2400, 4200), dur: 0.07, vol: 0.035, delay: R(0, 0.08) }); }],
    poison: [140, () => { A.tone({ type: 'sine', f: 260, f2: 520, dur: 0.08, vol: 0.035 }); A.tone({ type: 'sine', f: 340, f2: 650, dur: 0.07, vol: 0.03, delay: 0.06 }); }],
    bleed: [140, () => { A.noise({ dur: 0.08, vol: 0.06, filt: 'bandpass', fq: 1400, q: 3 }); }],
    // a muffled scream from somewhere among the monsters (p = pitch)
    scream: [700, (p) => {
      const f = R(330, 520) * p, dur = R(0.7, 1.2);
      A.tone({ type: 'sawtooth', f, f2: f * 1.7, dur: dur * 0.45, vol: 0.05, att: 0.08, filt: 'lowpass', fq: 650, q: 2, vib: 7, vibAmt: f * 0.06 });
      A.tone({ type: 'sawtooth', f: f * 1.7, f2: f * 0.6, dur, vol: 0.045, att: 0.02, delay: dur * 0.4, filt: 'lowpass', fq: 600, q: 2, vib: 6, vibAmt: f * 0.08 });
      A.tone({ type: 'square', f: f * 1.01, f2: f * 1.65, dur: dur * 0.5, vol: 0.018, filt: 'bandpass', fq: 900, q: 4, vib: 7, vibAmt: f * 0.05 });
      A.noise({ dur: dur * 1.2, vol: 0.028, filt: 'bandpass', fq: 800, q: 2, att: 0.1 });
    }],
    // a boss arrives: a huge throat roars and shrieks, gurgling with blood
    // holy fire catches: a shimmer of angelic bells
    // the Vile Vial: a long, rattling, wheezing breath through a cloud of venom
    wheeze: [600, () => {
      A.noise({ dur: 0.9, vol: 0.12, filt: 'bandpass', fq: 900, fq2: 1600, q: 2.5, att: 0.35 });
      A.tone({ type: 'sine', f: 1300, f2: 1700, dur: 0.8, vol: 0.02, att: 0.3, vib: 9, vibAmt: 60 });
      A.noise({ dur: 1.2, vol: 0.14, filt: 'bandpass', fq: 1400, fq2: 500, q: 2, att: 0.1, delay: 0.95 });
      A.tone({ type: 'sine', f: 1500, f2: 900, dur: 1.0, vol: 0.018, vib: 11, vibAmt: 80, delay: 1.0 });
      A.noise({ dur: 0.5, vol: 0.06, fq: 300, fq2: 120, delay: 1.0 });
    }],
    barrel: [150, () => { A.noise({ dur: 0.25, vol: 0.2, fq: 900, fq2: 200 }); A.tone({ type: 'square', f: 180, f2: 70, dur: 0.15, vol: 0.08 }); [784, 988, 1175, 1568].forEach((f, i) => A.tone({ type: 'triangle', f, dur: 0.2, vol: 0.06, delay: 0.1 + i * 0.06 })); }],
    // Gregory: a goat's quavering "meh-eh-eh" (p: pitch, lower = more demonic)
    bleat: [500, (p) => {
      const f = 300 * p;
      A.tone({ type: 'sawtooth', f: f * 1.15, f2: f, dur: 0.16, vol: 0.05, filt: 'bandpass', fq: 1100, q: 2, att: 0.02 });
      A.tone({ type: 'sawtooth', f, f2: f * 0.82, dur: 0.75, vol: 0.06, filt: 'bandpass', fq: 950, q: 1.6, vib: 19, vibAmt: f * 0.09, delay: 0.12, att: 0.04 });
      A.tone({ type: 'square', f: f / 2, f2: f * 0.4, dur: 0.7, vol: 0.02, filt: 'lowpass', fq: 600, vib: 19, vibAmt: 10, delay: 0.12 });
    }],
    // character selection: a whoosh between characters, and the chord when one is chosen (p: 0 bright, 1 dark)
    charSwap: [120, () => { A.noise({ dur: 0.35, vol: 0.07, filt: 'bandpass', fq: 400, fq2: 2400, q: 1.2, att: 0.1 }); }],
    charPick: [300, (p) => {
      const dark = p > 0.5, base = dark ? 110 : 262, notes = dark ? [1, 1.189, 1.414, 2] : [1, 1.26, 1.5, 2];
      notes.forEach((k, i) => A.tone({ type: dark ? 'sawtooth' : 'triangle', f: base * k, dur: 1.4, vol: 0.045, att: 0.01, delay: i * 0.07, filt: 'lowpass', fq: dark ? 900 : 3000 }));
      A.noise({ dur: 1.2, vol: 0.05, filt: 'bandpass', fq: dark ? 300 : 1800, fq2: dark ? 120 : 4000, q: 1, att: 0.05 });
      if (dark) A.tone({ type: 'sine', f: 55, f2: 41, dur: 1.8, vol: 0.12, att: 0.02 });
    }],
    meow: [400, () => { A.tone({ type: 'square', f: 620, f2: 1100, dur: 0.16, vol: 0.06, filt: 'lowpass', fq: 2600, vib: 8, vibAmt: 20 }); A.tone({ type: 'square', f: 1100, f2: 560, dur: 0.38, vol: 0.06, delay: 0.15, filt: 'lowpass', fq: 2400, vib: 7, vibAmt: 30 }); }],
    howl: [1500, () => { A.tone({ type: 'triangle', f: 380, f2: 620, dur: 0.7, vol: 0.05, att: 0.25, filt: 'lowpass', fq: 1200, vib: 5, vibAmt: 8 }); A.tone({ type: 'triangle', f: 620, f2: 420, dur: 1.4, vol: 0.05, delay: 0.65, filt: 'lowpass', fq: 1100, vib: 5, vibAmt: 12 }); }],
    holyBurn: [140, () => {
      [1318.5, 1661.2, 1975.5].forEach((f, i) => A.tone({ type: 'triangle', f, dur: 0.35, vol: 0.022, att: 0.02, delay: i * 0.025, vib: 6, vibAmt: 5 }));
      A.tone({ type: 'sine', f: 2637, f2: 3520, dur: 0.25, vol: 0.012 });
    }],
    // a holy explosion: a choir's "aah" swells over a bell, a bright whoosh and a deep boom
    holyBlast: [150, () => {
      for (const f of [523.25, 659.25, 783.99, 1046.5]) for (const det of [0.997, 1.003]) A.tone({ type: 'square', f: f * det, dur: 1.3, vol: 0.016, att: 0.08, filt: 'bandpass', fq: 1100, q: 5, vib: 5, vibAmt: 3 });
      A.tone({ type: 'triangle', f: 1046.5, dur: 1.6, vol: 0.05 }); A.tone({ type: 'triangle', f: 1046.5 * 2.76, dur: 1.1, vol: 0.02 });
      A.noise({ dur: 0.6, vol: 0.06, filt: 'highpass', fq: 3000, fq2: 8000, att: 0.05 });
      A.tone({ type: 'sine', f: 220, f2: 70, dur: 0.5, vol: 0.12 });
    }],
    bossScream: [1500, () => {
      for (const [f, v] of [[110, 0.15], [117, 0.11], [166, 0.07]]) A.tone({ type: 'sawtooth', f: f * 1.4, f2: f * 0.55, dur: 2.2, vol: v, att: 0.06, filt: 'lowpass', fq: 1400, q: 3, vib: 9, vibAmt: 14 });
      A.tone({ type: 'square', f: 520, f2: 1150, dur: 0.6, vol: 0.06, att: 0.05, filt: 'bandpass', fq: 1300, q: 3, vib: 11, vibAmt: 60 });
      A.tone({ type: 'square', f: 1150, f2: 380, dur: 1.4, vol: 0.06, delay: 0.55, filt: 'bandpass', fq: 1100, q: 3, vib: 9, vibAmt: 70 });
      A.noise({ dur: 1.8, vol: 0.18, fq: 1200, fq2: 200, att: 0.05 });
      for (let i = 0; i < 26; i++) {
        const at = 0.5 + Math.random() * 2.0, f = R(160, 420);
        A.tone({ type: 'sine', f, f2: f * R(1.8, 3), dur: R(0.04, 0.09), vol: R(0.05, 0.12), delay: at });
        if (i % 3 === 0) A.noise({ dur: R(0.05, 0.12), vol: 0.07, filt: 'bandpass', fq: R(250, 650), q: 4, delay: at });
      }
    }],
    die_ghost: [70, () => { A.tone({ type: 'triangle', f: R(700, 900), f2: 220, dur: 0.6, vol: 0.06, vib: 6, vibAmt: 40 }); A.noise({ dur: 0.5, vol: 0.04, filt: 'bandpass', fq: 1500, fq2: 500, q: 3 }); }],
    roar: [1500, () => { A.tone({ type: 'sawtooth', f: 95, f2: 46, dur: 1.5, vol: 0.28, filt: 'lowpass', fq: 600, vib: 7, vibAmt: 6 }); A.noise({ dur: 1.4, vol: 0.22, fq: 420, fq2: 110 }); }],
    slam: [200, () => { A.noise({ dur: 0.75, vol: 0.42, fq: 650, fq2: 55 }); A.tone({ type: 'sine', f: 72, f2: 26, dur: 0.6, vol: 0.42 }); }],
    thud: [90, () => { A.noise({ dur: 0.3, vol: 0.22, fq: 500, fq2: 80 }); A.tone({ type: 'sine', f: 90, f2: 40, dur: 0.25, vol: 0.2 }); }],
    horn: [1800, () => { A.tone({ type: 'sawtooth', f: 110, dur: 1.1, vol: 0.11, att: 0.15, filt: 'lowpass', fq: 700 }); A.tone({ type: 'sawtooth', f: 164.8, dur: 1.1, vol: 0.08, att: 0.15, filt: 'lowpass', fq: 700 }); }],
    bell: [1800, () => { [196, 294, 392, 466].forEach((f, i) => A.tone({ type: 'sine', f, dur: 2.6, vol: 0.16 / (i + 1), att: 0.005 })); }],
    dash: [100, () => { A.noise({ dur: 0.2, vol: 0.13, filt: 'bandpass', fq: 2400, fq2: 600, q: 0.9 }); }],
    click: [35, () => { A.tone({ type: 'square', f: 660, f2: 880, dur: 0.04, vol: 0.045 }); }],
    reroll: [120, () => { for (let i = 0; i < 4; i++) A.tone({ type: 'square', f: 400 + i * 120, dur: 0.04, vol: 0.04, delay: i * 0.04 }); }],
    spit: [140, () => { A.tone({ type: 'square', f: 300, f2: 620, dur: 0.1, vol: 0.045 }); }],
    catnip: [500, () => { [784, 988, 1175, 1568].forEach((f, i) => A.tone({ type: 'sine', f, dur: 0.3, vol: 0.06, delay: i * 0.05 })); }],
    gameover: [3000, () => { [392, 349, 311, 262].forEach((f, i) => A.tone({ type: 'triangle', f, dur: 0.5, vol: 0.12, delay: i * 0.28 })); }],
    altar: [1500, () => { A.tone({ type: 'sine', f: 55, f2: 82, dur: 1.6, vol: 0.25, att: 0.3 }); [261.63, 311.13, 392].forEach((f, i) => A.tone({ type: 'triangle', f, dur: 1.8, vol: 0.05, att: 0.4, delay: i * 0.12, vib: 4, vibAmt: 3 })); }],
    totem: [400, () => { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => A.tone({ type: 'triangle', f, dur: 0.5, vol: 0.09, delay: i * 0.06, vib: 6, vibAmt: 5 })); A.tone({ type: 'sine', f: 98, f2: 196, dur: 0.8, vol: 0.18 }); }],
    invasion: [3000, () => { A.tone({ type: 'sine', f: 440, f2: 880, dur: 1.4, vol: 0.12, vib: 7, vibAmt: 40 }); A.tone({ type: 'sine', f: 660, f2: 330, dur: 1.4, vol: 0.08, delay: 0.3, vib: 9, vibAmt: 50 }); A.noise({ dur: 1.2, vol: 0.12, filt: 'bandpass', fq: 600, fq2: 2400, q: 3 }); }],
    zap: [120, () => { A.tone({ type: 'sawtooth', f: 1400, f2: 200, dur: 0.18, vol: 0.06, filt: 'lowpass', fq: 3000 }); A.tone({ type: 'sine', f: 880, f2: 1760, dur: 0.12, vol: 0.05, delay: 0.04 }); }],
    status: [250, () => { A.tone({ type: 'triangle', f: 330, f2: 220, dur: 0.14, vol: 0.07 }); A.tone({ type: 'square', f: 165, dur: 0.1, vol: 0.03, delay: 0.05, filt: 'lowpass', fq: 900 }); }],
    flame: [60, () => { A.noise({ dur: 0.18, vol: 0.09, filt: 'bandpass', fq: 700, fq2: 300, q: 0.8 }); }],
    smg: [55, () => { A.noise({ dur: 0.07, vol: 0.13, filt: 'highpass', fq: 1200 }); A.tone({ type: 'square', f: 220, f2: 70, dur: 0.05, vol: 0.06 }); }],
    // an ember picked up (the sound's id is left from when Embers were Essence)
    essence: [45, () => { A.tone({ type: 'sine', f: 1320, f2: 1980, dur: 0.08, vol: 0.04 }); A.tone({ type: 'triangle', f: 2640, dur: 0.05, vol: 0.02, delay: 0.03 }); }],
    anchor: [600, () => { A.tone({ type: 'sawtooth', f: 160, f2: 120, dur: 0.9, vol: 0.12, filt: 'lowpass', fq: 900, vib: 9, vibAmt: 20 }); A.tone({ type: 'triangle', f: 880, dur: 0.4, vol: 0.06, delay: 0.1 }); }],
    tesla: [1000, () => { A.noise({ dur: 0.9, vol: 0.14, filt: 'bandpass', fq: 3000, fq2: 800, q: 4 }); A.tone({ type: 'sawtooth', f: 60, f2: 120, dur: 1, vol: 0.1, vib: 30, vibAmt: 10 }); }],
    dawn: [3000, () => { [392, 494, 587, 784].forEach((f, i) => A.tone({ type: 'sine', f, dur: 1.6, vol: 0.09, att: 0.2, delay: i * 0.18 })); }],
    bloodburst: [90, () => { A.noise({ dur: 0.35, vol: 0.3, fq: 900, fq2: 160 }); A.tone({ type: 'sawtooth', f: 180, f2: 45, dur: 0.3, vol: 0.12, filt: 'lowpass', fq: 700 }); A.noise({ dur: 0.18, vol: 0.14, fq: 2600, fq2: 900, delay: 0.05 }); }],
    holy: [400, () => { A.tone({ type: 'sine', f: 880, f2: 1320, dur: 0.5, vol: 0.07 }); A.tone({ type: 'triangle', f: 1320, f2: 1760, dur: 0.6, vol: 0.05, delay: 0.06 }); }],
    chest: [300, () => { A.tone({ type: 'triangle', f: 660, f2: 990, dur: 0.12, vol: 0.06 }); A.tone({ type: 'triangle', f: 990, f2: 1320, dur: 0.14, vol: 0.05, delay: 0.1 }); }],
    hex: [70, () => { A.tone({ type: 'sine', f: 520, f2: 260, dur: 0.18, vol: 0.05 }); A.tone({ type: 'triangle', f: 780, f2: 390, dur: 0.14, vol: 0.03, delay: 0.03 }); }],
    warcry: [600, () => { for (let i = 0; i < 6; i++) A.noise({ dur: 0.12, vol: 0.2, fq: 220, fq2: 70, delay: i * 0.16 }); A.tone({ type: 'sawtooth', f: 160, f2: 320, dur: 0.6, vol: 0.06, filt: 'lowpass', fq: 1200, delay: 0.3 }); }],
    tick: [300, () => { for (let i = 0; i < 4; i++) A.tone({ type: 'square', f: 1800, dur: 0.025, vol: 0.04, delay: i * 0.25 }); A.tone({ type: 'sine', f: 440, f2: 220, dur: 0.9, vol: 0.05 }); }],
    curse: [300, () => { A.tone({ type: 'sawtooth', f: 220, f2: 110, dur: 0.5, vol: 0.05, filt: 'lowpass', fq: 800 }); A.tone({ type: 'sine', f: 330, f2: 165, dur: 0.5, vol: 0.04, delay: 0.08 }); }],
    summon: [120, () => { A.tone({ type: 'sawtooth', f: 110, f2: 220, dur: 0.35, vol: 0.05, filt: 'lowpass', fq: 900 }); A.tone({ type: 'sine', f: 660, f2: 330, dur: 0.3, vol: 0.04, delay: 0.05 }); }],
    ritual: [800, () => { for (let i = 0; i < 4; i++) A.tone({ type: 'sine', f: 98 * (i % 2 ? 1.5 : 1), dur: 0.35, vol: 0.09, delay: i * 0.22 }); A.noise({ dur: 0.9, vol: 0.06, fq: 300, fq2: 120 }); }],
    dart: [30, () => { A.noise({ dur: 0.06, vol: 0.08, fq: 2400, fq2: 1200 }); }],
    gaze: [1500, () => { A.tone({ type: 'sawtooth', f: 46, f2: 41, dur: 2.6, vol: 0.12, filt: 'lowpass', fq: 260, vib: 3, vibAmt: 4 }); A.tone({ type: 'sine', f: 739, f2: 698, dur: 2.2, vol: 0.035, delay: 0.3, vib: 6, vibAmt: 12 }); A.noise({ dur: 2.2, vol: 0.06, fq: 1400, fq2: 600 }); }],
    madness: [400, () => { A.noise({ dur: 0.7, vol: 0.2, fq: 900, fq2: 120 }); A.tone({ type: 'sawtooth', f: 330, f2: 82, dur: 0.8, vol: 0.12, vib: 18, vibAmt: 40 }); A.tone({ type: 'square', f: 466, f2: 233, dur: 0.5, vol: 0.05, delay: 0.1 }); }],
    // a wet, choking gurgle: bubbling noise bursts over a low wobbling voice
    gurgle: [600, () => {
      A.tone({ type: 'sawtooth', f: 92, f2: 70, dur: 0.9, vol: 0.13, filt: 'lowpass', fq: 420, vib: 13, vibAmt: 18 });
      for (let i = 0; i < 7; i++) A.noise({ dur: 0.08, vol: 0.12, fq: 300 + Math.random() * 500, fq2: 120, filt: 'bandpass', q: 6, delay: 0.05 + i * 0.11 + Math.random() * 0.04 });
      A.tone({ type: 'square', f: 140, f2: 55, dur: 0.5, vol: 0.05, filt: 'lowpass', fq: 600, delay: 0.5 });
    }],
    // Cthulhu's death: a long, warbling, many-voiced shriek that tears down into a growl
    cthulhuScream: [3000, () => {
      for (const [f, d] of [[620, 0], [930, 0.05], [410, 0.1]]) A.tone({ type: 'sawtooth', f, f2: f * 0.25, dur: 2.6, vol: 0.09, delay: d, vib: 22, vibAmt: f * 0.12, filt: 'lowpass', fq: 2400 });
      A.noise({ dur: 2.4, vol: 0.2, fq: 2600, fq2: 200 });
      A.tone({ type: 'sine', f: 55, f2: 30, dur: 2.8, vol: 0.16, delay: 0.3 });
    }],
    dungeon: [1500, () => { A.noise({ dur: 1.5, vol: 0.2, fq: 200, fq2: 50 }); A.tone({ type: 'sawtooth', f: 55, f2: 38, dur: 1.8, vol: 0.1, filt: 'lowpass', fq: 320 }); A.tone({ type: 'sine', f: 233, f2: 110, dur: 1.3, vol: 0.06, delay: 0.35 }); }],
    thunder: [2000, () => { A.noise({ dur: 1.6, vol: 0.22, fq: 260, fq2: 50 }); A.tone({ type: 'sine', f: 60, f2: 35, dur: 1.2, vol: 0.12 }); }],
    chestopen: [200, () => { A.noise({ dur: 0.18, vol: 0.12, fq: 700, fq2: 300 }); A.tone({ type: 'triangle', f: 784, dur: 0.1, vol: 0.06, delay: 0.12 }); A.tone({ type: 'triangle', f: 1047, dur: 0.12, vol: 0.06, delay: 0.2 }); A.tone({ type: 'triangle', f: 1568, dur: 0.22, vol: 0.05, delay: 0.3 }); }],
    revive: [1000, () => { [523, 659, 784, 1047, 1319].forEach((f, i) => A.tone({ type: 'sine', f, dur: 0.6, vol: 0.1, delay: i * 0.05 })); A.noise({ dur: 0.6, vol: 0.15, filt: 'highpass', fq: 2000, fq2: 6000 }); }],
    // ---- Eldritch Madness ----
    // the Tome of Fireball: a roaring whoosh with crackles, and the blast when it bursts
    fireball: [90, () => {
      A.noise({ dur: 0.35, vol: 0.16, filt: 'bandpass', fq: 300, fq2: 1500, q: 1.2, att: 0.03 });
      A.tone({ type: 'sawtooth', f: 90, f2: 170, dur: 0.25, vol: 0.06, filt: 'lowpass', fq: 600 });
      for (let i = 0; i < 4; i++) A.noise({ dur: 0.03, vol: 0.05, filt: 'highpass', fq: 3000, delay: 0.05 + Math.random() * 0.2 });
    }],
    fireburst: [70, () => {
      A.noise({ dur: 0.6, vol: 0.3, fq: 1800, fq2: 110 }); A.tone({ type: 'sine', f: 110, f2: 34, dur: 0.45, vol: 0.28 });
      for (let i = 0; i < 6; i++) A.noise({ dur: 0.04, vol: 0.07, filt: 'highpass', fq: R(2500, 5000), delay: 0.05 + Math.random() * 0.4 });
    }],
    // the Shrieking Scream: a banshee's shriek over the thump of the blast (p = pitch: echoes are lower)
    shriek: [120, (p) => {
      const f = R(720, 820) * p;
      for (const det of [1, 1.013, 0.987]) A.tone({ type: 'sawtooth', f: f * det, f2: f * det * 1.9, dur: 0.42, vol: 0.03, att: 0.01, filt: 'bandpass', fq: 1800, q: 2.5, vib: 22, vibAmt: f * 0.05 });
      A.tone({ type: 'square', f: f * 2, f2: f * 3.2, dur: 0.3, vol: 0.012, vib: 30, vibAmt: 60 });
      A.noise({ dur: 0.35, vol: 0.11, filt: 'bandpass', fq: 2400, fq2: 900, q: 1.5 });
      A.tone({ type: 'sine', f: 120, f2: 40, dur: 0.3, vol: 0.18 });
    }],
    // the Tell-Tale Heart: two loud beats when you squeeze it, then a wet, meaty punch for every monster
    // that bursts: a hard thump, a slap, a squelch of blood and the drips spattering after
    heartbeat: [600, () => { A.tone({ type: 'sine', f: 72, f2: 40, dur: 0.22, vol: 0.4 }); A.tone({ type: 'sine', f: 66, f2: 36, dur: 0.24, vol: 0.36, delay: 0.26 }); A.noise({ dur: 0.12, vol: 0.12, fq: 300, fq2: 90, delay: 0.26 }); }],
    juicyPunch: [35, () => {
      const k = R(0.85, 1.2);
      A.tone({ type: 'sine', f: 160 * k, f2: 42, dur: 0.22, vol: 0.34, att: 0.002 });
      A.noise({ dur: 0.045, vol: 0.28, filt: 'highpass', fq: 1800 * k });
      A.noise({ dur: 0.32, vol: 0.2, filt: 'bandpass', fq: 900 * k, fq2: 180, q: 3.5, delay: 0.02 });
      A.tone({ type: 'sawtooth', f: 260 * k, f2: 70, dur: 0.16, vol: 0.06, filt: 'lowpass', fq: 900, delay: 0.015 });
      for (let i = 0; i < 3; i++) A.noise({ dur: 0.05, vol: 0.07, filt: 'bandpass', fq: R(500, 1400), q: 6, delay: 0.08 + i * R(0.04, 0.08) });
    }],
    // a void crawler slips through the void
    blink: [90, () => { A.tone({ type: 'sine', f: 900, f2: 120, dur: 0.18, vol: 0.04 }); A.noise({ dur: 0.15, vol: 0.05, filt: 'bandpass', fq: 1600, fq2: 300, q: 4 }); }],
    // The Dark: the stars go out (a long sinking swell), the countdown, the dark falling, the light holding, and being taken
    darkness: [3000, () => {
      A.tone({ type: 'sawtooth', f: 220, f2: 55, dur: 6.5, vol: 0.08, att: 2.5, filt: 'lowpass', fq: 500, q: 3, vib: 0.5, vibAmt: 3 });
      A.tone({ type: 'sawtooth', f: 233, f2: 58, dur: 6.5, vol: 0.06, att: 2.5, filt: 'lowpass', fq: 500, q: 3 });
      A.tone({ type: 'sine', f: 1760, f2: 880, dur: 5, vol: 0.018, att: 1.5, vib: 6, vibAmt: 30 });
      A.noise({ dur: 6.5, vol: 0.07, filt: 'bandpass', fq: 300, fq2: 1200, q: 2, att: 3 });
    }],
    darkTick: [300, () => { A.tone({ type: 'sine', f: 70, f2: 40, dur: 0.2, vol: 0.3 }); A.tone({ type: 'triangle', f: 1046, f2: 1040, dur: 0.6, vol: 0.03, delay: 0.02, vib: 7, vibAmt: 8 }); }],
    darkFall: [2000, () => {
      A.noise({ dur: 2.2, vol: 0.3, fq: 400, fq2: 40, att: 0.01 }); A.tone({ type: 'sine', f: 55, f2: 27, dur: 2.4, vol: 0.4 });
      for (let i = 0; i < 8; i++) A.noise({ dur: R(0.08, 0.2), vol: 0.035, filt: 'bandpass', fq: R(1400, 3600), q: R(4, 9), delay: 0.4 + i * R(0.15, 0.3) });
    }],
    lightHolds: [2000, () => { [392, 466.2, 587.3, 784].forEach((f, i) => A.tone({ type: 'sine', f, dur: 1.8, vol: 0.06, att: 0.3, delay: i * 0.1, vib: 5, vibAmt: 3 })); }],
    swallowed: [3000, () => {
      A.tone({ type: 'sawtooth', f: 520, f2: 900, dur: 0.35, vol: 0.06, att: 0.05, filt: 'lowpass', fq: 1400, vib: 9, vibAmt: 40 });
      A.noise({ dur: 2.8, vol: 0.32, fq: 300, fq2: 30, delay: 0.3 }); A.tone({ type: 'sine', f: 48, f2: 20, dur: 3, vol: 0.45, delay: 0.3 });
      for (let i = 0; i < 14; i++) A.noise({ dur: R(0.08, 0.22), vol: 0.04, filt: 'bandpass', fq: R(1400, 3600), q: R(4, 9), delay: 0.5 + Math.random() * 2.2 });
    }],
    // ---- the night's bonfire (bonfire.js) ----
    // one crackle of burning wood (p = loudness): a dry snap and a pop of sparks
    crackle: [35, (p) => {
      A.noise({ dur: R(0.015, 0.04), vol: 0.09 * p, filt: 'highpass', fq: R(1800, 4200) });
      if (Math.random() < 0.5) A.noise({ dur: R(0.03, 0.07), vol: 0.05 * p, filt: 'bandpass', fq: R(700, 1600), q: 3, delay: R(0.01, 0.05) });
      if (Math.random() < 0.25) A.tone({ type: 'triangle', f: R(2400, 3800), f2: R(1200, 2000), dur: 0.05, vol: 0.012 * p, delay: 0.02 });
    }],
    // the fire's roar underneath: a soft swell of low, breathing noise
    fireBed: [1200, () => { A.noise({ dur: 3.2, vol: 0.09, filt: 'lowpass', fq: R(380, 520), fq2: R(260, 360), att: 1.1 }); A.noise({ dur: 2.6, vol: 0.03, filt: 'bandpass', fq: 900, fq2: 600, q: 0.8, att: 0.8, delay: 0.4 }); }],
    // a Miracle given: a bright chord of bells over a warm hum
    miracle: [1500, () => {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => { A.tone({ type: 'sine', f, dur: 2.2, vol: 0.06, att: 0.01, delay: i * 0.09 }); A.tone({ type: 'sine', f: f * 2.76, dur: 1, vol: 0.012, delay: i * 0.09 }); });
      A.tone({ type: 'triangle', f: 130.8, dur: 2.6, vol: 0.08, att: 0.5 });
    }],
    // praying: a choir swells as the light takes everything
    prayer: [3000, () => {
      for (const f of [261.63, 329.63, 392, 523.25]) for (const det of [0.996, 1.004]) A.tone({ type: 'square', f: f * det, dur: 3.6, vol: 0.013, att: 1.6, filt: 'bandpass', fq: 1000, q: 5, vib: 5, vibAmt: 3 });
      A.tone({ type: 'sine', f: 1046.5, dur: 3.4, vol: 0.04, att: 2 }); A.noise({ dur: 3.4, vol: 0.05, filt: 'highpass', fq: 3000, fq2: 7000, att: 2.2 });
    }],
    // ---- Mokosh ----
    // wind through the branches: a slow swell that rises and falls (her screen plays one every few seconds)
    windGust: [1500, () => {
      const f = R(300, 480);
      A.noise({ dur: 3.4, vol: 0.07, filt: 'bandpass', fq: f, fq2: f * R(1.6, 2.4), q: 1.4, att: 1.5 });
      A.noise({ dur: 2.6, vol: 0.035, filt: 'bandpass', fq: R(1200, 1800), fq2: R(700, 1000), q: 3, att: 1.1, delay: 0.5 });
    }],
    // one soft wind chime (p = pitch): picking something on her screen
    chime: [60, (p) => { const f = [1046.5, 1174.7, 1318.5, 1568, 1760][Math.floor(Math.random() * 5)] * p; A.tone({ type: 'sine', f, dur: 1.6, vol: 0.04, att: 0.005 }); A.tone({ type: 'sine', f: f * 2.76, dur: 0.9, vol: 0.01, att: 0.005 }); }],
    // a cascade of wind chimes over a warm hum: a favour granted
    chimes: [400, () => {
      const scale = [784, 880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
      for (let i = 0; i < 7; i++) { const f = scale[Math.floor(Math.random() * scale.length)], at = i * R(0.09, 0.2); A.tone({ type: 'sine', f, dur: 2.4, vol: 0.035, att: 0.005, delay: at }); A.tone({ type: 'sine', f: f * 2.76, dur: 1.2, vol: 0.009, att: 0.005, delay: at }); }
      A.tone({ type: 'triangle', f: 196, dur: 2.6, vol: 0.05, att: 0.6, vib: 4, vibAmt: 2 }); A.tone({ type: 'triangle', f: 293.7, dur: 2.6, vol: 0.035, att: 0.7 });
    }],
    // a thread snipped: a dry little cut and a falling whisper
    snip: [300, () => { A.noise({ dur: 0.05, vol: 0.12, filt: 'highpass', fq: 4000 }); A.noise({ dur: 0.04, vol: 0.09, filt: 'highpass', fq: 5200, delay: 0.07 }); A.noise({ dur: 0.9, vol: 0.03, filt: 'bandpass', fq: 2600, fq2: 900, q: 5, delay: 0.1 }); }],
    // her totem rises: wood creaking out of the earth, wind, and a few chimes
    mokoshRise: [2000, () => {
      A.tone({ type: 'sawtooth', f: 110, f2: 88, dur: 1.2, vol: 0.05, filt: 'lowpass', fq: 500, vib: 9, vibAmt: 6 }); A.noise({ dur: 1, vol: 0.12, fq: 400, fq2: 120 });
      A.noise({ dur: 3, vol: 0.06, filt: 'bandpass', fq: 350, fq2: 900, q: 1.4, att: 1.2, delay: 0.3 });
      [1046.5, 1318.5, 1568].forEach((f, i) => A.tone({ type: 'sine', f, dur: 2, vol: 0.03, att: 0.005, delay: 0.9 + i * 0.18 }));
    }],
    // the motes' flicker: voices just under hearing
    whispers: [1500, () => { for (let i = 0; i < 6; i++) A.noise({ dur: R(0.08, 0.22), vol: 0.045, filt: 'bandpass', fq: R(1400, 3600), fq2: R(1100, 3200), q: R(4, 9), att: 0.03, delay: i * R(0.12, 0.24) }); }],
  };

  A.sounds = () => Object.keys(SFX);   // the talent creator's sound picker
  A.play = function (name, p) {
    if (!A.ready) return;
    const s = SFX[name];
    if (!s) return;
    const now = performance.now();
    if (now - (A.last[name] || 0) < s[0]) return;
    A.last[name] = now;
    try { s[1](p == null ? 1 : p); } catch (e) { /* ignore audio errors */ }
  };
  A.setSfx = function (v) { G.save.settings.sfx = v; if (A.sfx) A.sfx.gain.value = v; };
  // Hushes the music (0 = full, 1 = silent), easing there: The Dark.
  A.duck = function (k) {
    if (!A.mus || Math.abs((A.duckK || 0) - k) < 0.02) return;
    A.duckK = k;
    A.mus.gain.setTargetAtTime(0.3 * (1 - U.clamp(k, 0, 1)), A.ctx.currentTime, 0.25);
  };

  // ---------- procedural music: one song per map, darker every minute ----------
  // A.setScene(song, dread) picks the song (farm, alien = the crash site's, spirit, madness, camp = the night's, title) and how far into the
  // day it is (dread 0 = dawn of the fight, 1 = the end of Blood Moon). As dread rises every song
  // slows down and comes apart: the cheerful parts fade out, notes drift out of tune, and heartbeats,
  // whispers, far-off screams and wind creep in. All chip voices: square, triangle, saw and noise.
  const MU = { timer: null, step: 0, next: 0, tempo: 96, song: 'title', dread: 0, tier: 0 };
  const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const wob = (f, dr) => f * (1 + (Math.random() - 0.5) * 0.04 * dr);   // a warped, out-of-tune note
  const TEMPO = { farm: (dr) => 96 - 26 * dr, alien: (dr) => 86 - 16 * dr, spirit: (dr) => 58 - 8 * dr, madness: (dr) => 52 - 10 * dr, camp: () => 62, title: () => 80, intro: () => 74 };

  // ---- shared horror layers ----
  function heartbeat(t, d, v) { A.tone({ type: 'sine', f: 64, f2: 38, dur: 0.16, vol: v, at: t, dest: d }); A.tone({ type: 'sine', f: 58, f2: 34, dur: 0.15, vol: v * 0.8, at: t + 0.22, dest: d }); }
  function farScream(t, d, v) {
    const f = R(360, 600);
    A.tone({ type: 'sawtooth', f, f2: f * 1.7, dur: 0.5, vol: v, att: 0.15, at: t, dest: d, filt: 'lowpass', fq: 560, q: 2, vib: 7, vibAmt: 25 });
    A.tone({ type: 'sawtooth', f: f * 1.7, f2: f * 0.6, dur: 1.1, vol: v * 0.8, att: 0.04, at: t + 0.45, dest: d, filt: 'lowpass', fq: 480, q: 2, vib: 6, vibAmt: 32 });
    A.noise({ dur: 1.4, vol: v * 0.5, filt: 'bandpass', fq: 850, q: 3, att: 0.2, at: t, dest: d });
  }
  function whisper(t, d, v) {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) A.noise({ dur: R(0.08, 0.22), vol: v, filt: 'bandpass', fq: R(1400, 3600), fq2: R(1100, 3200), q: R(4, 9), att: 0.03, at: t + i * R(0.12, 0.24), dest: d });
  }
  function wind(t, d, v, dur) { A.noise({ dur, vol: v, filt: 'bandpass', fq: R(280, 480), fq2: R(650, 1100), q: 1.6, att: dur * 0.45, at: t, dest: d }); }
  function horror(step, t, dr, d) {
    const s16 = step % 16;
    if (dr > 0.45 && (s16 === 0 || (dr > 0.75 && s16 === 8))) heartbeat(t, d, 0.09 + (dr - 0.45) * 0.35);
    if (s16 === 2 && dr > 0.3 && Math.random() < (dr - 0.25) * 0.35) farScream(t, d, 0.01 + dr * 0.022);
    if (s16 === 6 && dr > 0.15 && Math.random() < dr * 0.3) whisper(t, d, 0.015 + dr * 0.03);
    if (s16 === 0 && dr > 0.4 && Math.random() < 0.2) wind(t, d, 0.02 + dr * 0.03, 3.5);
  }

  // ---- The Farm: a minor-key banjo hoedown that rots into a broken music box and a heartbeat ----
  const FARM_CH = [
    { root: 110, tones: [220, 261.63, 329.63, 440] },        // Am
    { root: 110, tones: [220, 261.63, 329.63, 392] },        // Am7
    { root: 87.31, tones: [174.61, 220, 261.63, 349.23] },   // F
    { root: 82.41, tones: [164.81, 207.65, 246.94, 329.63] }, // E
  ];
  const FARM_DARK = { root: 116.54, tones: [233.08, 293.66, 349.23, 466.16] };   // Bb: the flat second, wrong and sour
  const ROLL = [0, 2, 3, 1, 2, 3, 0, 2];
  const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  const MUSICBOX = [880, 1046.5, 1318.5, 1244.5, 987.77, 1396.9, 1760, 1108.7];
  function farm(step, t, dr, d) {
    const bar = Math.floor(step / 16), s16 = step % 16, barLen = 60 / MU.tempo * 4;
    const ch = dr > 0.5 && bar % 4 === 2 ? FARM_DARK : FARM_CH[bar % 4];
    const happy = Math.max(0, 1 - dr * 1.5);   // the hoedown fades as night falls
    if ((s16 === 0 || s16 === 8) && happy > 0.1) A.tone({ type: 'triangle', f: s16 === 0 ? ch.root : ch.root * 1.5, dur: 0.32, vol: 0.2 * Math.max(0.35, happy), at: t, dest: d });
    if (s16 === 0 && dr > 0.25) A.tone({ type: 'triangle', f: ch.root / 2, dur: barLen * 1.05, vol: 0.05 + dr * 0.09, att: barLen * 0.3, at: t, dest: d, vib: 0.5, vibAmt: 1.5 });
    if ((s16 === 4 || s16 === 12) && Math.random() < happy) {
      for (const f of ch.tones.slice(0, 3)) A.tone({ type: 'square', f, dur: 0.07, vol: 0.022, at: t, dest: d, filt: 'lowpass', fq: 1800 });
      A.noise({ dur: 0.05, vol: 0.03, filt: 'highpass', fq: 5000, at: t, dest: d });
    }
    if (s16 % 2 === 0 && Math.random() < happy * 0.9 && ((step % 64) >= 32 || dr > 0.1)) {
      const f = wob(ch.tones[ROLL[(s16 / 2) % 8]] * 2, dr);
      A.tone({ type: 'square', f, f2: f * (0.996 - dr * 0.02), dur: 0.16, vol: 0.022, at: t, dest: d, filt: 'lowpass', fq: 2600 });
    }
    if (s16 % 4 === 0 && Math.random() < 0.28 * happy) A.tone({ type: 'triangle', f: pick(PENTA), dur: 0.5, vol: 0.045, at: t, dest: d, vib: 5, vibAmt: 4 });
    // a broken music box, more out of tune every minute
    if (dr > 0.12 && s16 % 2 === 0 && Math.random() < 0.06 + dr * 0.24) A.tone({ type: 'triangle', f: wob(pick(MUSICBOX), dr + 0.4), dur: 0.7, vol: 0.035, at: t, dest: d, vib: 4, vibAmt: 3 + dr * 16 });
    // tritone stabs
    if (dr > 0.6 && s16 === 0 && Math.random() < 0.3) for (const k of [2, 2.828]) A.tone({ type: 'square', f: ch.root * k, dur: 0.6, vol: 0.028, at: t, dest: d, filt: 'lowpass', fq: 900 });
    horror(step, t, dr, d);
  }

  // ---- The Crash Site: a theremin over a whole-tone pulse, radar pings, static and sirens ----
  const WHOLE = [36, 38, 40, 42, 44, 46].map(NOTE);
  const THEREMIN = [70, 72, 74, 76, 78, 80, 82].map(NOTE);
  function alien(step, t, dr, d) {
    const bar = Math.floor(step / 16), s16 = step % 16, barLen = 60 / MU.tempo * 4, root = [0, 0, 2, 4][bar % 4];
    if (s16 % 2 === 0) A.tone({ type: 'square', f: wob(WHOLE[(root + [0, 3, 1, 4][(s16 / 2) % 4]) % 6], dr), dur: 0.12, vol: 0.05, at: t, dest: d, filt: 'lowpass', fq: 1200 - dr * 600 });
    if (s16 === 0 || s16 === 8) A.tone({ type: 'sine', f: 110, f2: 45, dur: 0.16, vol: 0.14 * (1 - dr * 0.4), at: t, dest: d });
    if (s16 === 4 && bar % 2 === 0) { const f = 1760 * (1 - dr * 0.35); A.tone({ type: 'sine', f, dur: 0.25, vol: 0.035, at: t, dest: d }); A.tone({ type: 'sine', f, dur: 0.25, vol: 0.013, at: t + 0.32, dest: d }); }
    if (s16 === 0 && bar % 2 === 1 && Math.random() < 0.85) A.tone({ type: 'sine', f: pick(THEREMIN), f2: pick(THEREMIN) * (1 - dr * 0.3), dur: barLen * 1.5, vol: 0.05, att: 0.4, at: t, dest: d, vib: 6, vibAmt: 10 + dr * 30 });
    if (Math.random() < 0.03 + dr * 0.08) A.noise({ dur: R(0.03, 0.15), vol: 0.018 + dr * 0.03, filt: 'highpass', fq: R(2000, 6000), at: t, dest: d });
    if (dr > 0.45 && s16 === 12 && Math.random() < dr * 0.5) for (let i = 0; i < 6; i++) A.tone({ type: 'square', f: wob(WHOLE[(root + i) % 6] * 4, 1), dur: 0.03, vol: 0.03, at: t + i * 0.035, dest: d });
    if (dr > 0.6 && s16 === 8 && bar % 4 === 3) A.tone({ type: 'sawtooth', f: 900, f2: 160, dur: 2.6, vol: 0.022, at: t, dest: d, filt: 'lowpass', fq: 1400, vib: 3, vibAmt: 40 });
    horror(step, t, dr, d);
  }

  // ---- The Unexplainable: slow, desolate and mysterious. A drone over dead ground, wind, a ghostly
  // choir, a lonely plucked phrygian melody that echoes, distant witch-doctor drums and a bell ----
  const PHRYG = [62, 63, 65, 67, 69, 70, 72, 74];
  function choir(t, d, notes, dur, dr) {
    for (const m of notes) for (const det of [0.996, 1.004]) A.tone({ type: 'square', f: wob(NOTE(m), dr) * det, dur, vol: 0.011, att: dur * 0.4, at: t, dest: d, filt: 'bandpass', fq: 900, q: 5, vib: 5, vibAmt: 2 + dr * 6 });
  }
  function bell(t, d, f) { for (const [k, v] of [[1, 0.045], [2.76, 0.018], [5.4, 0.01]]) A.tone({ type: 'triangle', f: f * k, dur: 3.5, vol: v, at: t, dest: d }); }
  function tom(t, d, v, low) { const f = low ? 92 : 128; A.tone({ type: 'sine', f, f2: f * 0.5, dur: 0.35, vol: v, at: t, dest: d }); A.noise({ dur: 0.12, vol: v * 0.35, fq: 600, fq2: 150, at: t, dest: d }); }
  function spirit(step, t, dr, d) {
    const bar = Math.floor(step / 16), s16 = step % 16, beat = 60 / MU.tempo / 4, barLen = beat * 16;
    if (s16 === 0) {
      A.tone({ type: 'triangle', f: NOTE(38), dur: barLen * 1.1, vol: 0.09, att: barLen * 0.3, at: t, dest: d, vib: 0.3, vibAmt: 0.6 });
      if (bar % 2 === 1) A.tone({ type: 'triangle', f: NOTE(dr > 0.6 ? 39 : 45), dur: barLen * 1.1, vol: 0.05, att: barLen * 0.4, at: t, dest: d });
      if (dr > 0.3) A.tone({ type: 'sine', f: NOTE(26), dur: barLen * 1.05, vol: 0.05 + dr * 0.07, att: 1, at: t, dest: d });
      if (bar % 2 === 0) wind(t, d, 0.03 + dr * 0.03, barLen * 1.8);
      if (bar % 4 === 0) choir(t, d, bar % 8 === 0 ? [62, 65, 69] : [63, 67, 70], barLen * 1.8, dr);
      if (dr > 0.25 && bar % 4 === 2) bell(t, d, dr > 0.7 ? 185 : 196);
    }
    // a lonely plucked melody, echoing back; later it strays onto the flat second and the tritone
    if ((s16 === 0 || s16 === 6 || s16 === 10) && Math.random() < 0.45) {
      let m = pick(PHRYG);
      if (dr > 0.5 && Math.random() < dr * 0.4) m = pick([63, 68, 75]);
      const f = wob(NOTE(m + (Math.random() < 0.3 ? 12 : 0)), dr + 0.2);
      [1, 0.4, 0.16].forEach((k, i) => A.tone({ type: 'triangle', f, dur: 1.3, vol: 0.05 * k, at: t + i * beat * 3, dest: d, vib: 3, vibAmt: 2 + dr * 8 }));
    }
    // the witch doctors' drums, closer and faster every minute
    const DRUM = dr < 0.25 ? [0, 10] : dr < 0.55 ? [0, 6, 10] : dr < 0.8 ? [0, 3, 6, 10, 12] : [0, 3, 6, 8, 10, 12, 14];
    if (DRUM.includes(s16) && (bar % 2 === 0 || dr > 0.25)) tom(t, d, 0.07 + dr * 0.12, s16 % 8 === 0);
    if (dr > 0.6 && Math.random() < 0.05) tom(t, d, 0.05, false);
    horror(step, t, dr, d);
  }

  // ---- Eldritch Madness: no key and no time. A drone cluster that sinks and never resolves, tones that
  // swell out of nothing and are cut off, glass tones bending out of tune as they ring, a music box in
  // the wrong scale that skips on a seven-step cycle, chanting from under the ground, a heartbeat that
  // misses beats, a bell that tolls the wrong number of times, and whispers from the very start ----
  const GLASS = [74, 77, 80, 83, 86, 89].map(NOTE);   // a diminished stack: minor thirds with no home
  const BOX = [81, 84, 86, 87, 90, 92, 93, 96].map(NOTE);
  function chant(t, d, dur, dr) {
    const root = NOTE(pick([44, 45, 46]));
    for (const [k, det] of [[1, 0.996], [1, 1.004], [1.335, 1], [1.5, 0.998]]) A.tone({ type: 'sawtooth', f: root * k * det, f2: root * k * det * 0.985, dur, vol: 0.016, att: dur * 0.35, at: t, dest: d, filt: 'bandpass', fq: 420, q: 6, vib: 4.5, vibAmt: 2 + dr * 4 });
  }
  function madness(step, t, dr, d) {
    const bar = Math.floor(step / 16), s16 = step % 16, beat = 60 / MU.tempo / 4, barLen = beat * 16;
    if (s16 === 0) {
      for (const [m, v] of [[33, 0.05], [34, 0.04], [40, 0.025]]) A.tone({ type: 'sawtooth', f: NOTE(m) * (1 - (bar % 4) * 0.004), dur: barLen * 1.15, vol: v + dr * 0.025, att: barLen * 0.5, at: t, dest: d, filt: 'lowpass', fq: 300 + dr * 200, q: 4, vib: 0.2, vibAmt: 1.5 });
      if (bar % 2 === 0) wind(t, d, 0.025 + dr * 0.03, barLen * 1.6);
      if (bar % 4 === 1) chant(t, d, barLen * 1.6, dr);
      if (bar % 8 === 4) { const n = 3 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) bell(t + i * beat * 5, d, 138.6); }
      if (dr > 0.55 && bar % 4 === 3) for (const m of [36, 37, 42, 43]) A.tone({ type: 'square', f: NOTE(m), dur: barLen * 0.6, vol: 0.016, att: 0.05, at: t, dest: d, filt: 'lowpass', fq: 700 });
    }
    if (s16 === 8 && Math.random() < 0.5) { const f = wob(pick(GLASS) / 2, dr + 0.5); A.tone({ type: 'triangle', f, f2: f * (Math.random() < 0.5 ? 0.97 : 1.03), dur: barLen * 0.45, vol: 0.045, att: barLen * 0.44, at: t, dest: d }); }
    if ((s16 === 0 || s16 === 7 || s16 === 11) && Math.random() < 0.55) {
      const f = wob(pick(GLASS), dr + 0.3);
      A.tone({ type: 'sine', f, f2: f * (1 + (Math.random() - 0.5) * 0.06 * (0.5 + dr)), dur: 2.4, vol: 0.03, att: 0.3, at: t, dest: d, vib: 5.5, vibAmt: 4 + dr * 10 });
    }
    const k7 = step % 7;
    if ((k7 === 0 || k7 === 3 || k7 === 5) && Math.random() < 0.3 + dr * 0.2) A.tone({ type: 'triangle', f: wob(pick(BOX), dr + 0.6), dur: 0.8, vol: 0.026, at: t, dest: d, vib: 3, vibAmt: 6 + dr * 14 });
    if ((s16 === 0 && Math.random() < 0.8) || (s16 === 10 && Math.random() < 0.2 + dr * 0.3)) heartbeat(t, d, 0.07 + dr * 0.08);
    if ((s16 === 4 || s16 === 12) && Math.random() < 0.25 + dr * 0.3) whisper(t, d, 0.02 + dr * 0.025);
    if (s16 === 2 && bar % 3 === 2 && Math.random() < 0.3 + dr * 0.3) farScream(t, d, 0.015 + dr * 0.02);
  }

  // ---- the night at the bonfire ("camp"): a slow, tired lullaby on a music box over a drone ----
  const LULLABY = [69, 72, 76, 74, 72, 71, 69, 64, 65, 69, 72, 71, 69, 68, 64, 69];
  function camp(step, t, dr, d) {
    const bar = Math.floor(step / 16), s16 = step % 16, barLen = 60 / MU.tempo * 4;
    if (s16 === 0) A.tone({ type: 'triangle', f: NOTE(bar % 2 ? 41 : 45), dur: barLen * 1.05, vol: 0.06, att: barLen * 0.3, at: t, dest: d });
    if (s16 % 4 === 0) { const m = LULLABY[(bar * 4 + s16 / 4) % LULLABY.length]; A.tone({ type: 'triangle', f: NOTE(m + 12), dur: 0.9, vol: 0.04, at: t, dest: d, vib: 4, vibAmt: 3 }); }
    if (s16 === 8 && bar % 2 === 0) wind(t, d, 0.02, 3);
  }
  const SONGS = { farm, alien, spirit, madness, camp, title: (step, t, dr, d) => farm(step, t, 0.25, d), intro: (step, t, dr, d) => farm(step, t, 0.55, d) };

  function musicTick() {
    const ctx = A.ctx, song = SONGS[MU.song] || farm;
    while (MU.next < ctx.currentTime + 0.25) {
      MU.tempo = (TEMPO[MU.song] || TEMPO.farm)(MU.dread);
      try { song(MU.step, MU.next, MU.dread, A.mus); } catch (e) { /* ignore audio errors */ }
      MU.next += 60 / MU.tempo / 4;
      MU.step = (MU.step + 1) % 256;
    }
  }
  A.setMusic = function (on) {
    G.save.settings.music = !!on;
    if (!A.ready) return;
    if (on && !MU.timer) { MU.next = A.ctx.currentTime + 0.1; MU.timer = setInterval(musicTick, 50); }
    if (!on && MU.timer) { clearInterval(MU.timer); MU.timer = null; }
  };
  // song: farm, alien, spirit, madness, camp or title. dread: 0..1 through the day.
  A.setScene = function (song, dread) {
    if (song !== MU.song) { MU.song = song; MU.step = 0; }
    MU.dread = Math.max(0, Math.min(1, dread || 0));
  };
  A.setIntensity = function (tier) { MU.tier = tier; };
})();
