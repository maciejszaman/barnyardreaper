'use strict';
// The Dark (day event, data/stages.json > darkness; Eldritch Madness): the stars go out. A circle of pale
// light opens somewhere on the farm and the screen starts to darken: you have `warning` seconds to get
// into it (a banner, a countdown, an arrow). Then the dark falls for `dark` seconds: everything outside the
// circle is pitch black. Out in the dark your screen goes black over `grace` seconds and you die, whatever
// your health, armor or block (an extra life drags you back, and the dark lifts). The post pass (world.js)
// draws the darkness from DK.post: { dark (0-1), x, z, r (the circle of light) }.
//   DK.on: { x, z, r, state: 'warn' | 'dark' | 'lift' | 'taken', t, total, exp (seconds out in the dark), tick, age, g (meshes) }
(function () {
  const T = THREE, U = G.U, F = G.fx, A = G.audio, W = G.world, P = G.player;
  const DK = G.darkness = { on: null, post: { dark: 0, x: 0, z: 0, r: 0 } };
  const PALE = 0xd8e0ff, LIFT = 1.5;
  const addMat = (c, o) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });

  // The circle of light: a pale ring, a faint floor, a column of light falling from far above, and a lamp.
  function meshes(r) {
    const g = new T.Group();
    const rg = new T.RingGeometry(0.95, 1, 64, 1); rg.rotateX(-Math.PI / 2);
    const ring = new T.Mesh(rg, addMat(PALE, 0.9)); ring.scale.set(r, 1, r); ring.position.y = 0.08;
    const dg = new T.CircleGeometry(1, 48); dg.rotateX(-Math.PI / 2);
    const floor = new T.Mesh(dg, addMat(0x8090c0, 0.14)); floor.scale.set(r, 1, r); floor.position.y = 0.06;
    // the column fades out as it rises: its alpha comes from a gradient
    const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64;
    const cg = cv.getContext('2d'), gr = cg.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    cg.fillStyle = gr; cg.fillRect(0, 0, 4, 64);
    const tex = new T.CanvasTexture(cv), colMat = addMat(PALE, 0.12);
    colMat.map = tex;
    const col = new T.Mesh(new T.CylinderGeometry(1, 1, 16, 40, 1, true), colMat); col.scale.set(r, 1, r); col.position.y = 8;
    const light = new T.PointLight(PALE, 0, r * 3.2, 1.4); light.position.y = 4;
    g.add(floor, ring, col, light);
    G.scene.add(g);
    return { g, ring, floor, col, light, tex };
  }
  function dispose() {
    const d = DK.on;
    if (!d) return;
    G.scene.remove(d.g.g);
    d.g.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    d.g.tex.dispose();
    DK.on = null;
  }
  // Where the light opens: minDistance-maxDistance meters from you, on the farm, clear of buildings and
  // of the Eldritch Gaze's crater.
  function spot(D, r) {
    const b = W.bounds, gz = G.gaze.on;
    for (let i = 0; i < 300; i++) {
      const a = Math.random() * Math.PI * 2, d = U.rnd(D.minDistance, D.maxDistance), x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
      if (x < b.x0 + 2 || x > b.x1 - 2 || z < b.z0 + 2 || z > b.z1 - 2 || W.blocked(x, z, 2)) continue;
      if (gz && Math.hypot(gz.x - x, gz.z - z) < gz.r + r * 0.7) continue;
      return [x, z];
    }
    return [W.clampX(P.x + D.minDistance), W.clampZ(P.z)];
  }

  DK.start = function () {
    const D = G.DARKNESS;
    if (DK.on || !D || G.phase !== 'fight' || G.dungeon.active || P.dead) return null;
    const r = D.radius, [x, z] = spot(D, r), d = DK.on = { x, z, r, state: 'warn', t: D.warning, total: D.warning, exp: 0, tick: Math.ceil(D.warning), age: 0, g: meshes(r) };
    d.g.g.position.set(x, 0, z);
    Object.assign(DK.post, { x, z, r });
    G.ui.banner('The Stars Go Out', `Get into the circle of light within ${D.warning} seconds, or the dark takes you.`, '#d8e0ff');
    F.flash('#000000', 0.55); F.shake(0.3); A.play('darkness');
    F.burst(x, 0.5, z, { n: 30, color: [PALE, 0xffffff], glow: true, speed: 4, life: 1, size: 0.16, up: 1.5, grav: -1 });
    return d;
  };
  // A new run, dawn: the dark is simply gone.
  DK.clear = function () { dispose(); DK.post.dark = 0; DK.post.r = 0; A.duck(0); };
  // The dark has you: you die (or an extra life drags you back out, and the dark lifts).
  function take(d) {
    d.state = 'taken';
    A.play('swallowed');
    if (G.playerSys.kill()) { G.run.cause = 'dark'; DK.post.dark = 1; DK.post.r = 0; return; }
    d.state = 'lift'; d.t = LIFT; d.exp = 0;
    G.ui.toast('Dragged back out of the dark', '#d8e0ff');
  }

  DK.update = function (dt) {
    const d = DK.on, post = DK.post, D = G.DARKNESS;
    if (!d) { post.dark = Math.max(0, post.dark - dt * 2); A.duck(post.dark * 0.85); return; }
    if (G.phase !== 'fight' || G.dungeon.active) { dispose(); return; }   // dawn, or you went down a stairway
    d.t -= dt; d.age += dt;
    const inside = !P.dead && Math.hypot(P.x - d.x, P.z - d.z) < d.r;
    // the light breathes, and shines white while you stand in it
    const m = d.g, pulse = 0.5 + Math.sin(d.age * 4) * 0.5;
    m.ring.material.opacity = 0.55 + pulse * 0.4; m.ring.material.color.set(inside ? 0xffffff : PALE);
    m.col.material.opacity = (d.state === 'warn' ? 0.1 + 0.14 * U.clamp(1 - d.t / d.total, 0, 1) : 0.28) * (0.85 + pulse * 0.15);
    m.light.intensity = U.damp(m.light.intensity, d.state === 'lift' || d.state === 'taken' ? 0 : 1.6, 3, dt);
    if (Math.random() < dt * 18) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * d.r; F.rise(d.x + Math.cos(a) * rr, 0.1, d.z + Math.sin(a) * rr, PALE, 1, 0.2, 2.4, 0.12, 1.2); }
    post.x = d.x; post.z = d.z;
    if (d.state === 'warn') {
      const k = U.clamp(1 - d.t / d.total, 0, 1);
      post.dark = 0.85 * k * k; post.r = d.r;
      if (d.t > 0 && Math.ceil(d.t) < d.tick) { d.tick = Math.ceil(d.t); A.play('darkTick'); }
      if (d.t <= 0) {
        d.state = 'dark'; d.t = D.dark; d.exp = 0;
        A.play('darkFall'); F.shake(0.5);
        G.ui.toast(inside ? 'The dark falls. Stay in the light.' : 'The dark falls · GET INTO THE LIGHT', inside ? '#d8e0ff' : '#ff4a3a');
      }
    } else if (d.state === 'dark') {
      // out in the dark the light leaves you: the screen goes black, and then you are gone
      d.exp = inside ? Math.max(0, d.exp - dt * 2) : d.exp + dt;
      post.dark = 1; post.r = d.r * Math.max(0, 1 - d.exp / D.grace);
      if (!inside && Math.random() < dt * 6) A.play('whispers');
      if (d.exp >= D.grace) take(d);
      else if (d.t <= 0) {
        d.state = 'lift'; d.t = LIFT;
        A.play('lightHolds'); G.ui.toast('The stars come back. You held on to the light.', '#d8e0ff');
        G.run.darks = (G.run.darks || 0) + 1;
      }
    } else if (d.state === 'lift') {
      post.dark = Math.max(0, d.t / LIFT); post.r = d.r;
      if (d.t <= 0) dispose();
    }
    A.duck(post.dark * 0.85);
  };

  // Is (x, z) lost in the dark right now? Monster nameplates and damage numbers there are not drawn.
  DK.hidden = (x, z) => DK.post.dark > 0.85 && Math.hypot(x - DK.post.x, z - DK.post.z) > DK.post.r + 0.5;
  // HUD event line.
  DK.status = function () {
    const d = DK.on;
    if (!d || d.state === 'lift' || d.state === 'taken') return '';
    const inside = Math.hypot(P.x - d.x, P.z - d.z) < d.r, t = Math.max(0, d.t).toFixed(1);
    if (d.state === 'warn') return `THE STARS GO OUT · ${inside ? 'STAY IN THE LIGHT' : 'GET INTO THE LIGHT'} · ${t}s`;
    return inside ? `THE DARK · STAY IN THE LIGHT · ${t}s` : 'THE DARK HAS YOU · BACK INTO THE LIGHT!';
  };
  // An arrow to the light, and the countdown big under the cat.
  DK.drawOverlay = function (c, dpr) {
    const d = DK.on;
    if (!d || d.state === 'lift' || d.state === 'taken' || P.dead) return;
    const inside = Math.hypot(P.x - d.x, P.z - d.z) < d.r, s = inside ? null : F.pointer(c, dpr, d.x, d.z, '#e8eeff', 'LIGHT');
    const w = F.ov.width, h = F.ov.height, y = h * 0.7;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const text = (t, x, ty, px, col, lw) => { c.font = `${Math.round(px * dpr)}px "Press Start 2P", monospace`; c.lineWidth = lw * dpr; c.strokeStyle = '#05030a'; c.strokeText(t, x, ty); c.fillStyle = col; c.fillText(t, x, ty); };
    if (s) text('THE LIGHT', s.x, s.y - 26 * dpr, 11, '#e8eeff', 4);
    if (d.state === 'warn') {
      const t = Math.max(0, d.t), fr = t % 1;
      text(String(Math.ceil(t)), w / 2, y, 44 + fr * 16, inside ? '#e8eeff' : '#ff4a3a', 8);
      text(inside ? 'STAY IN THE LIGHT' : 'INTO THE LIGHT!', w / 2, y + 46 * dpr, 13, inside ? '#c8d0f0' : '#ff8a7a', 5);
    } else if (!inside && Math.sin(d.age * 18) > -0.3) text('BACK INTO THE LIGHT!', w / 2, y, 18, '#ff4a3a', 6);
  };
})();
