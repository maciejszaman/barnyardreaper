'use strict';
// The Eldritch Gaze (day event, data/stages.json > gaze). The ground tears open into a huge crater: deep
// inside it the stars of another sky wheel past (a parallax shader, so they really look far down) and an
// orange eye peeks up through them, following you. Stepping in hurts a lot and throws you out. The
// crater pulses out waves of voidlings and eldritch eyes (some elite, with monster modifiers); every
// few waves an eldritch tentacle bursts up beside it, gurgling to stun you until it is killed. When the
// tentacles are dead, Cthulhu rises from the crater and comes for you. Killing it closes the crater.
//   GZ.on: { x, z, r, wave, waveT, tentacles: [monsters], boss, g (meshes), age, closing, hurtT }
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player, ES = G.enemySys;
  const GZ = G.gaze = { on: null };
  const VIOLET = 0xb86cff;

  // ---------- the crater ----------
  // The hole: for every pixel, where the view ray would be at several depths below the ground gives
  // layers of nebula and stars that drift as the camera moves; the eye lies deepest.
  const VERT = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
  const FRAG = `
    uniform float uTime, uR, uOpen; uniform vec3 uC; uniform vec2 uLook; varying vec3 vW;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
    vec3 dir; vec3 dc;
    vec2 at(float depth){ return (vW + dir * (depth / max(0.08, -dir.y))).xz - uC.xz; }
    vec2 atC(float depth){ return (dc * (depth / max(0.08, -dc.y))).xz; }
    void main(){
      vec2 local = vW.xz - uC.xz; float r = length(local) / uR;
      if (r > 1.0) discard;
      dir = normalize(vW - cameraPosition); dc = normalize(uC - cameraPosition);
      vec3 col = vec3(0.004, 0.0, 0.012);
      for (int i = 0; i < 4; i++) {
        float fi = float(i), dep = 3.0 + fi * 5.0;
        vec2 p = at(dep);
        float n = fbm(p * (0.22 - fi * 0.035) + vec2(uTime * 0.03 * (fi + 1.0), fi * 9.1));
        col += mix(vec3(0.05, 0.0, 0.12), vec3(0.42, 0.06, 0.55), n * n) * n * (0.55 - fi * 0.1);
        vec2 sp = p * (1.4 + fi * 0.6); vec2 cell = floor(sp); float h = hash(cell + fi * 13.7);
        vec2 off = fract(sp) - 0.5 - (vec2(hash(cell + 1.3), hash(cell + 2.9)) - 0.5) * 0.7;
        float star = smoothstep(0.07, 0.0, length(off)) * step(0.86, h);
        col += vec3(0.9, 0.82, 1.0) * star * (1.0 - fi * 0.18) * (0.55 + 0.45 * sin(uTime * 3.0 + h * 40.0));
      }
      // the eye, far below, peeking up (it shifts a little with the camera, and looks at you)
      vec2 e = (at(18.0) - atC(18.0) * 0.85) / (uR * 0.95);
      float lid = uOpen * 0.4 * (1.0 - pow(clamp(abs(e.x) / 0.78, 0.0, 1.0), 2.0));
      float glow = smoothstep(0.9, 0.0, length(e * vec2(0.9, 1.8))) * 0.35;
      col += vec3(0.9, 0.3, 0.02) * glow;
      if (abs(e.y) < lid) {
        vec2 q = e - uLook * 0.16; float ir = length(q * vec2(1.0, 1.1));
        vec3 ec = mix(vec3(0.55, 0.4, 0.3), vec3(0.95, 0.85, 0.7), smoothstep(lid, lid * 0.4, abs(e.y)));
        ec = mix(ec, vec3(1.0, 0.42, 0.02), smoothstep(0.23, 0.19, ir));
        ec = mix(ec, vec3(1.0, 0.8, 0.25), smoothstep(0.12, 0.0, ir) * 0.55);
        ec = mix(ec, vec3(0.02, 0.0, 0.0), smoothstep(0.045, 0.03, abs(q.x)) * step(ir, 0.19));
        col = mix(col, ec, 0.95);
      }
      col *= 0.25 + 0.75 * smoothstep(1.0, 0.75, r);
      gl_FragColor = vec4(col, 1.0);
    }`;
  function meshes(R) {
    const g = new T.Group();
    const mat = new T.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uR: { value: R }, uOpen: { value: 0 }, uC: { value: new T.Vector3() }, uLook: { value: new T.Vector2() } }, vertexShader: VERT, fragmentShader: FRAG });
    const disc = new T.CircleGeometry(1, 56); disc.rotateX(-Math.PI / 2);
    const hole = new T.Mesh(disc, mat); hole.position.y = 0.04; hole.scale.set(R, 1, R); g.add(hole);
    const add = (geo, o, c) => { const m = new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }); const x = new T.Mesh(geo, m); g.add(x); return x; };
    const rg = new T.RingGeometry(0.93, 1.06, 56, 1); rg.rotateX(-Math.PI / 2);
    const edge = add(rg, 0.8, VIOLET); edge.position.y = 0.06; edge.scale.set(R, 1, R);
    const sc = new T.CircleGeometry(1, 40); sc.rotateX(-Math.PI / 2);
    const scorch = new T.Mesh(sc, new T.MeshBasicMaterial({ color: 0x0a0610, transparent: true, opacity: 0.6, depthWrite: false })); scorch.position.y = 0.02; scorch.scale.set(R + 2.2, 1, R + 2.2); g.add(scorch);
    // a rim of broken rock, purple light seeping between the stones
    const S = [];
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + (i % 2) * 0.08, d = R + 0.35 + (i % 3) * 0.3;
      S.push(M.p(M.rockGeo(1, i + 3, 1, 0.35), [0x2a2430, 0x3a3240, 0x1e1a24][i % 3], [Math.cos(a) * d, 0.15, Math.sin(a) * d], [0, -a, 0.3], [0.7 + (i % 4) * 0.25, 0.4 + (i % 3) * 0.25, 0.8 + (i % 2) * 0.4]));
    }
    const rim = new T.Mesh(M.merge(S, 0.06, 13), M.matL); g.add(rim);
    G.scene.add(g);
    return { g, mat, hole, edge, rim };
  }
  function dispose(m) {
    G.scene.remove(m.g);
    m.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== M.matL) o.material.dispose(); });
  }
  // Where the crater opens: on the farm, away from you, clear of buildings and caves.
  function spot(R) {
    const Z = G.GAZE;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 150; i++) {
      const x = U.rnd(W.bounds.x0 + R + 3, W.bounds.x1 - R - 3), z = U.rnd(W.bounds.z0 + R + 3, W.bounds.z1 - R - 3);
      if (pass === 0 && Math.hypot(x - P.x, z - P.z) < Z.minPlayerDistance + R) continue;
      if (W.blocked(x, z, R + 1) || W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < R + 8)) continue;
      return [x, z];
    }
    return [W.clampX(P.x + Z.minPlayerDistance + R), W.clampZ(P.z)];
  }
  GZ.start = function () {
    const Z = G.GAZE;
    if (GZ.on || !G.GAZE.enemy || G.phase !== 'fight') return null;
    const R = Z.radius, [x, z] = spot(R), m = meshes(R);
    m.g.position.set(x, 0, z); m.mat.uniforms.uC.value.set(x, 0, z);
    GZ.on = { x, z, r: R, wave: 0, waveT: 2.5, tentacles: [], boss: null, g: m, age: 0, closing: 0, hurtT: 0, blinkT: 4 };
    F.flash('#1a0628', 0.7); F.shake(0.8); A.play('gaze'); A.play('thunder');
    F.burst(x, 0.5, z, { n: 40, color: [0x2a2430, 0x3a3240, VIOLET], speed: 9, life: 1.2, size: 0.3, up: 1.4 });
    G.ui.banner('The Eldritch Gaze', 'The ground tears open. Something looks up through it.', '#ff8a2a');
    return GZ.on;
  };
  // Ends it (quiet: dawn or a new run; otherwise the crater closes over a moment).
  GZ.end = function (quiet) {
    const g = GZ.on;
    if (!g) return;
    if (quiet) { dispose(g.g); GZ.on = null; return; }
    g.closing = 2.2;
  };
  GZ.clear = function () { GZ.end(true); };

  // ---------- what climbs out ----------
  function waveOf(n) {
    const Z = G.GAZE;
    return Math.round(Math.min(Z.waveMax, Z.waveSize[0] + Z.waveSize[1] * (n - 1)) * (GZ.on.boss ? 0.5 : 1));
  }
  function wave() {
    const Z = G.GAZE, g = GZ.on;
    g.wave++;
    const n = waveOf(g.wave);
    for (let i = 0; i < n; i++) {
      const type = U.weighted(Object.keys(Z.waveWeights), (k) => Z.waveWeights[k]), a = Math.random() * Math.PI * 2, d = g.r + U.rnd(0.6, 1.6);
      const elite = Math.random() < Z.eliteChance;
      const e = ES.spawn(type, g.x + Math.cos(a) * d, g.z + Math.sin(a) * d, elite ? { elite: true, mods: G.rollModifiers(G.rareModCount(G.danger), G.danger, G.ENEMIES[type].ai) } : {});
      e.kbx = Math.cos(a) * 5; e.kbz = Math.sin(a) * 5; e.gazer = true;
    }
    F.ring(g.x, g.z, { r0: g.r * 0.6, r1: g.r + 3, life: 0.6, color: VIOLET }); A.play('horn');
    // a tentacle bursts up every few waves
    const TT = Z.tentacle;
    if (TT.enemy && !g.boss && g.wave % TT.everyWaves === 0 && g.tentacles.length < TT.count) {
      let tx = g.x, tz = g.z;
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, d = g.r + U.rnd(3.5, 8);
        tx = g.x + Math.cos(a) * d; tz = g.z + Math.sin(a) * d;
        if (W.inBounds(tx, tz, -2) && !W.blocked(tx, tz, 1.5) && Math.hypot(tx - P.x, tz - P.z) > 4) break;
      }
      const t = ES.spawn(TT.enemy, W.clampX(tx), W.clampZ(tz));
      t.name = t.def.name; t.gazer = true;
      g.tentacles.push(t);
      F.dust(t.x, t.z, 14); F.shake(0.4); A.play('slam');
      G.ui.toast(`An eldritch tentacle bursts up (${g.tentacles.length} of ${TT.count}) · kill it before it gurgles again!`, '#d080ff');
    }
  }
  function rise() {
    const g = GZ.on, B = G.GAZE.boss, e = ES.spawn(B.enemy, g.x, g.z);
    e.name = e.def.name; e.gazer = true; e.rank = 1;
    g.boss = e;
    G.ui.bossBar(e); A.play('bossScream'); A.play('gurgle'); F.shake(1); F.flash('#0a2a1a', 0.6);
    F.burst(g.x, 1, g.z, { n: 50, color: [0x2a4a3a, VIOLET, 0x3a5a48], speed: 10, life: 1.2, size: 0.35, up: 1.5 });
    G.ui.banner(`${e.name} Rises`, 'Its tentacles are dead. Now it comes for you itself.', '#7dffaa');
  }

  // ---------- per frame ----------
  GZ.update = function (dt) {
    const g = GZ.on;
    if (!g) return;
    if (G.phase !== 'fight') { GZ.end(true); return; }
    const Z = G.GAZE, m = g.g, u = m.mat.uniforms;
    g.age += dt;
    u.uTime.value = G.time;
    // opening and closing
    if (g.closing > 0) {
      g.closing -= dt;
      const k = Math.max(0, g.closing / 2.2);
      m.g.scale.set(k, 1, k); u.uR.value = g.r * Math.max(0.01, k); u.uOpen.value = Math.min(u.uOpen.value, k);
      if (g.closing <= 0) { dispose(m); GZ.on = null; }
      return;
    }
    const k = Math.min(1, g.age / 1.4), sc = 0.2 + 0.8 * (1 - (1 - k) * (1 - k));
    m.g.scale.set(sc, 1, sc); u.uR.value = g.r * sc;
    // the eye opens, blinks now and then, and watches you
    g.blinkT -= dt;
    const blink = g.blinkT < 0.25 && g.blinkT > 0 ? 0.15 : 1;
    if (g.blinkT <= 0) g.blinkT = U.rnd(3, 7);
    u.uOpen.value = U.damp(u.uOpen.value, Math.min(1, Math.max(0, (g.age - 0.8) * 1.5)) * blink, 10, dt);
    const lx = P.x - g.x, lz = P.z - g.z, ll = Math.hypot(lx, lz) || 1;
    u.uLook.value.set(U.damp(u.uLook.value.x, lx / ll, 4, dt), U.damp(u.uLook.value.y, lz / ll, 4, dt));
    m.edge.material.opacity = 0.55 + Math.sin(g.age * 3) * 0.25;
    if (Math.random() < dt * 14) { const a = Math.random() * Math.PI * 2; F.rise(g.x + Math.cos(a) * g.r, 0.2, g.z + Math.sin(a) * g.r, VIOLET, 1, 0.3, 2.2, 0.16, 0.9); }
    // stepping in: a lot of damage, and the crater throws you back out
    g.hurtT -= dt;
    const dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz) || 0.01;
    if (!P.dead && d < g.r * sc - 0.2) {
      PS().push(dx / d, dz / d, Z.push * dt * 6);
      if (g.hurtT <= 0) {
        g.hurtT = 0.7; P.invuln = 0;
        PS().damage(G.stats.maxHp * Z.damage, null, true); PS().push(dx / d, dz / d, Z.push);
        F.flash('#3a0a4a', 0.5); F.shake(0.5); F.num(P.x, 3.2, P.z, 'THE ABYSS', '#ff8a2a', 18); A.play('madness');
      }
    }
    // waves until Cthulhu is dead; it rises once every tentacle is dead
    if ((g.waveT -= dt) <= 0) { g.waveT = Z.waveEvery; wave(); }
    const TT = Z.tentacle;
    if (!g.boss && Z.boss.enemy && TT.count > 0 && g.tentacles.length >= TT.count && g.tentacles.every((t) => t.dead)) rise();
    if (!g.boss && Z.boss.enemy && TT.count === 0 && g.wave >= 3) rise();
    if (g.boss && g.boss.dead) {
      A.play('cthulhuScream'); F.flash('#ff8a2a', 0.6); F.shake(1);
      G.ui.banner('The Eldritch Eye Is Gone', 'Its crater closes over. The farm is quiet for a moment.', '#ff8a2a');
      G.run.gazes = (G.run.gazes || 0) + 1;
      GZ.end(false);
    }
  };
  const PS = () => G.playerSys;

  // HUD event line.
  GZ.status = function () {
    const g = GZ.on;
    if (!g || g.closing > 0) return '';
    if (g.boss) return `ELDRITCH GAZE · ${g.boss.name.toUpperCase()} RISES`;
    const TT = G.GAZE.tentacle, alive = g.tentacles.filter((t) => !t.dead).length;
    return `ELDRITCH GAZE · WAVE ${g.wave} · TENTACLES ${g.tentacles.length - alive} / ${TT.count} DEAD${alive ? ` · ${alive} GURGLING` : ''}`;
  };
  // Arrows to the crater and to every living tentacle when they are off screen.
  GZ.drawOverlay = function (c, dpr) {
    const g = GZ.on;
    if (!g || g.closing > 0) return;
    F.pointer(c, dpr, g.x, g.z, '#ff8a2a', 'CRATER');
    for (const t of g.tentacles) if (!t.dead) F.pointer(c, dpr, t.x, t.z, '#d080ff', 'TENTACLE');
  };
})();
