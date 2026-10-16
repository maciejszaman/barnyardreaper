'use strict';
// Visual effects: instanced particles, streaks, pooled spheres/rings/telegraphs, blob shadows,
// screen shake and flashes, and the 2D overlay for damage numbers and labels.
(function () {
  const T = THREE, U = G.U;
  const F = G.fx = { trauma: 0, tired: 0, nums: [] };
  const dummy = new T.Object3D(), col = new T.Color(), up = new T.Vector3(0, 0, 1), dir = new T.Vector3();
  const SHADOW_MAX = 2000;   // blob shadows drawn per frame (player + every monster on the field)

  // ---------- particle system (struct-of-arrays, swap-remove) ----------
  function PSys(cap, geo, mat, glow) {
    this.cap = cap; this.n = 0; this.glow = glow;
    this.mesh = new T.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, col.setRGB(1, 1, 1));
    const f = (k) => new Float32Array(cap * k);
    this.p = f(3); this.v = f(3); this.c = f(3); this.r = f(3);
    this.life = f(1); this.max = f(1); this.size = f(1); this.grav = f(1); this.drag = f(1); this.spin = f(1);
    G.scene.add(this.mesh);
  }
  PSys.prototype.add = function (x, y, z, vx, vy, vz, life, size, color, grav, drag) {
    const i = this.n < this.cap ? this.n++ : Math.floor(Math.random() * this.cap);
    const i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    col.set(color); this.c[i3] = col.r; this.c[i3 + 1] = col.g; this.c[i3 + 2] = col.b;
    this.r[i3] = Math.random() * 6; this.r[i3 + 1] = Math.random() * 6; this.r[i3 + 2] = Math.random() * 6;
    this.life[i] = this.max[i] = life; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag; this.spin[i] = (Math.random() - 0.5) * 14;
  };
  PSys.prototype.kill = function (i) {
    const j = --this.n;
    if (i === j) return;
    for (const a of [this.p, this.v, this.c, this.r]) { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; }
    for (const a of [this.life, this.max, this.size, this.grav, this.drag, this.spin]) a[i] = a[j];
  };
  PSys.prototype.update = function (dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const i3 = i * 3, d = Math.exp(-this.drag[i] * dt);
      this.v[i3 + 1] -= this.grav[i] * dt;
      this.v[i3] *= d; this.v[i3 + 1] *= d; this.v[i3 + 2] *= d;
      this.p[i3] += this.v[i3] * dt; this.p[i3 + 1] += this.v[i3 + 1] * dt; this.p[i3 + 2] += this.v[i3 + 2] * dt;
      if (this.p[i3 + 1] < 0.04 && this.grav[i] > 0) { this.p[i3 + 1] = 0.04; this.v[i3 + 1] *= -0.3; this.v[i3] *= 0.6; this.v[i3 + 2] *= 0.6; this.spin[i] *= 0.5; }
      const s = this.spin[i] * dt;
      this.r[i3] += s; this.r[i3 + 1] += s * 0.7;
      i++;
    }
    for (i = 0; i < this.n; i++) {
      const i3 = i * 3, t = this.life[i] / this.max[i];
      const s = this.size[i] * (this.glow ? t : Math.min(1, t * 3));
      dummy.position.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
      dummy.rotation.set(this.r[i3], this.r[i3 + 1], this.r[i3 + 2]);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      const k = this.glow ? Math.min(1, t * 1.6) : 1;
      this.mesh.setColorAt(i, col.setRGB(this.c[i3] * k, this.c[i3 + 1] * k, this.c[i3 + 2] * k));
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  };
  PSys.prototype.clear = function () { this.n = 0; this.mesh.count = 0; };

  // ---------- streaks (ricochet links, tracers, crit slashes) ----------
  function Streaks(cap) {
    this.cap = cap; this.list = [];
    this.mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }), cap);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, col.setRGB(1, 1, 1));
    G.scene.add(this.mesh);
  }
  Streaks.prototype.add = function (ax, ay, az, bx, by, bz, color, life, w) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push({ ax, ay, az, bx, by, bz, color: new T.Color(color), life, max: life, w });
  };
  Streaks.prototype.update = function (dt) {
    let n = 0;
    this.list = this.list.filter((s) => (s.life -= dt) > 0);
    for (const s of this.list) {
      const t = s.life / s.max, dx = s.bx - s.ax, dy = s.by - s.ay, dz = s.bz - s.az, len = Math.hypot(dx, dy, dz) || 0.001;
      dummy.position.set((s.ax + s.bx) / 2, (s.ay + s.by) / 2, (s.az + s.bz) / 2);
      dummy.quaternion.setFromUnitVectors(up, dir.set(dx / len, dy / len, dz / len));
      const w = s.w * (0.4 + t * 0.6);
      dummy.scale.set(w, w, len);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, col.copy(s.color).multiplyScalar(t));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  };

  // ---------- pooled one-off meshes ----------
  const pools = { sph: [], ring: [], disc: [], tele: [], line: [], arc: [] };
  let sphGeo, ringGeo, discGeo, lineGeo;
  const arcGeos = {};
  function getPooled(kind, make) {
    for (const o of pools[kind]) if (!o.on) return o;
    const o = make();
    o.mesh.visible = false;
    G.scene.add(o.mesh);
    pools[kind].push(o);
    return o;
  }
  const addMat = () => new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide });
  const normMat = () => new T.MeshBasicMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, fog: false });

  F.init = function () {
    F.ov = document.getElementById('ov');
    F.ctx = F.ov.getContext('2d');
    F.solid = new PSys(1400, new T.BoxGeometry(1, 1, 1), new T.MeshLambertMaterial(), false);
    F.glow = new PSys(1800, new T.OctahedronGeometry(0.6, 0), new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }), true);
    F.streaks = new Streaks(220);
    sphGeo = new T.IcosahedronGeometry(1, 1);
    ringGeo = new T.RingGeometry(0.86, 1, 36, 1); ringGeo.rotateX(-Math.PI / 2);
    discGeo = new T.CircleGeometry(1, 28); discGeo.rotateX(-Math.PI / 2);
    lineGeo = new T.PlaneGeometry(1, 1); lineGeo.rotateX(-Math.PI / 2); lineGeo.translate(0, 0, 0.5);
    // blob shadows
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const sg = new T.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2);
    F.shadows = new T.InstancedMesh(sg, new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SHADOW_MAX);
    F.shadows.frustumCulled = false; F.shadows.count = 0;
    G.scene.add(F.shadows);
    F.resize();
  };
  F.resize = function () {
    if (!F.ov) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    F.dpr = dpr; F.ov.width = Math.round(innerWidth * dpr); F.ov.height = Math.round(innerHeight * dpr);
  };

  // ---------- spawners ----------
  F.burst = function (x, y, z, o) {
    const n = o.n || 8, sp = o.speed || 4, sys = o.glow ? F.glow : F.solid, cols = Array.isArray(o.color) ? o.color : [o.color || 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (o.up != null ? o.up : 0.6) + Math.random() * 0.6, v = sp * (0.4 + Math.random() * 0.8);
      sys.add(x + (Math.random() - 0.5) * (o.spread || 0.3), y + (Math.random() - 0.5) * (o.spread || 0.3), z + (Math.random() - 0.5) * (o.spread || 0.3),
        Math.cos(a) * v, e * v, Math.sin(a) * v, (o.life || 0.6) * (0.6 + Math.random() * 0.6), (o.size || 0.15) * (0.6 + Math.random() * 0.8),
        cols[(Math.random() * cols.length) | 0], o.grav != null ? o.grav : 14, o.drag != null ? o.drag : 1.5);
    }
  };
  F.rise = function (x, y, z, color, n = 3, spread = 0.5, speed = 1.5, size = 0.12, life = 0.8) {
    for (let i = 0; i < n; i++) F.glow.add(x + (Math.random() - 0.5) * spread, y + Math.random() * 0.4, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.4, speed * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 0.4, life, size, color, 0, 0.8);
  };
  F.streak = (ax, ay, az, bx, by, bz, color = 0xffffff, life = 0.25, w = 0.12) => F.streaks.add(ax, ay, az, bx, by, bz, color, life, w);
  // A laser ray (Chain Lightning): a wide blue glow around a white-hot core, with sparks at both ends.
  F.laser = function (ax, ay, az, bx, by, bz, life = 0.5) {
    F.streaks.add(ax, ay, az, bx, by, bz, 0x3fa8ff, life, 0.42);
    F.streaks.add(ax, ay, az, bx, by, bz, 0xe8f8ff, life, 0.13);
    F.burst(bx, by, bz, { n: 6, color: [0x7fe0ff, 0xffffff], glow: true, speed: 5, life: 0.3, size: 0.14, grav: 0 });
    F.sphere(ax, ay, az, { r0: 0.2, r1: 0.5, life: 0.15, color: 0x9fe8ff });
  };
  F.sphere = function (x, y, z, o) {
    const e = getPooled('sph', () => { const m = addMat(); return { mesh: new T.Mesh(sphGeo, m), mat: m }; });
    Object.assign(e, { on: true, t: 0, life: o.life || 0.35, r0: o.r0 || 0.2, r1: o.r1 || 2, op: o.opacity || 0.9 });
    e.mat.color.set(o.color || 0xffa040); e.mesh.position.set(x, y, z); e.mesh.visible = true;
  };
  F.ring = function (x, z, o) {
    const e = getPooled('ring', () => { const m = addMat(); return { mesh: new T.Mesh(ringGeo, m), mat: m }; });
    Object.assign(e, { on: true, t: 0, life: o.life || 0.4, r0: o.r0 || 0.3, r1: o.r1 || 3, op: o.opacity || 0.9 });
    e.mat.color.set(o.color || 0xffffff); e.mesh.position.set(x, o.y || 0.08, z); e.mesh.visible = true;
  };
  // A lingering ground disc (toxic puddles, scorch marks).
  F.disc = function (x, z, r, life, color, op = 0.55, additive = true) {
    const e = getPooled('disc', () => ({ mesh: new T.Mesh(discGeo, null) }));
    e.mesh.material = e.mat = e.mat && e.add === additive ? e.mat : (additive ? addMat() : normMat());
    Object.assign(e, { on: true, t: 0, life, op, add: additive });
    e.mat.color.set(color); e.mesh.position.set(x, 0.06 + Math.random() * 0.02, z); e.mesh.scale.set(r, 1, r); e.mesh.visible = true;
    return e;
  };
  // Boss attack telegraph: an outline plus a fill that grows until impact.
  F.telegraph = function (x, z, r, dur, color = 0xff3a1a) {
    const e = getPooled('tele', () => {
      const m1 = normMat(), m2 = normMat(), g = new T.Group();
      const ring = new T.Mesh(ringGeo, m1), fill = new T.Mesh(discGeo, m2);
      g.add(ring, fill);
      return { mesh: g, ring, fill, m1, m2 };
    });
    Object.assign(e, { on: true, t: 0, life: dur, r });
    e.m1.color.set(color); e.m2.color.set(color); e.m1.opacity = 0.9; e.m2.opacity = 0.3;
    e.mesh.position.set(x, 0.07, z); e.ring.scale.set(r, 1, r); e.fill.scale.set(0.01, 1, 0.01); e.mesh.visible = true;
    return e;
  };
  F.teleLine = function (x, z, ang, len, width, dur, color = 0xff3a1a) {
    const e = getPooled('line', () => { const m = normMat(); return { mesh: new T.Mesh(lineGeo, m), mat: m }; });
    Object.assign(e, { on: true, t: 0, life: dur, len });
    e.mat.color.set(color); e.mat.opacity = 0.35;
    e.mesh.position.set(x, 0.08, z); e.mesh.rotation.set(0, ang, 0); e.mesh.scale.set(width, 1, 0.01); e.mesh.visible = true;
    return e;
  };
  // Melee swing sector, facing yaw (forward = (sin yaw, cos yaw)).
  F.swing = function (x, z, yaw, arcDeg, range, color = 0xdff2ff) {
    const key = Math.round(arcDeg / 5) * 5;
    if (!arcGeos[key]) { const a = key * Math.PI / 180, g = new T.RingGeometry(0.3, 1, 18, 1, -a / 2, a); g.rotateX(-Math.PI / 2); arcGeos[key] = g; }
    const e = getPooled('arc', () => { const m = addMat(); return { mesh: new T.Mesh(arcGeos[key], m), mat: m }; });
    e.mesh.geometry = arcGeos[key];
    Object.assign(e, { on: true, t: 0, life: 0.2, r: range, op: 0.55 });
    e.mat.color.set(color); e.mesh.position.set(x, 0.75, z); e.mesh.rotation.set(0, yaw - Math.PI / 2, 0); e.mesh.scale.set(range, 1, range); e.mesh.visible = true;
  };

  // ---------- composite effects ----------
  F.explosion = function (x, z, r, color = 0xff8a2a) {
    F.sphere(x, 0.8, z, { r0: r * 0.25, r1: r, life: 0.32, color, opacity: 0.95 });
    F.sphere(x, 0.8, z, { r0: r * 0.1, r1: r * 0.6, life: 0.2, color: 0xfff0b0, opacity: 1 });
    F.ring(x, z, { r0: r * 0.4, r1: r * 1.35, life: 0.45, color: 0xffc070 });
    F.burst(x, 0.8, z, { n: 14, color: [0xffd070, 0xff7a2a, 0xffa040], glow: true, speed: r * 3, life: 0.5, size: 0.35, grav: 2, drag: 3 });
    F.burst(x, 0.4, z, { n: 8, color: [0x3a2a20, 0x5a4030], speed: r * 2.5, life: 0.9, size: 0.18 });
    F.disc(x, z, r * 0.7, 1.6, 0x140c08, 0.45, false);
    F.shake(0.28);
  };
  F.critHit = function (x, y, z) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI, l = 0.9;
      F.streak(x - Math.cos(a) * l, y + (Math.random() - 0.5) * 0.6, z - Math.sin(a) * l, x + Math.cos(a) * l, y + (Math.random() - 0.5) * 0.6, z + Math.sin(a) * l, 0xffe070, 0.18, 0.09);
    }
    F.burst(x, y, z, { n: 8, color: [0xffe070, 0xffffff], glow: true, speed: 6, life: 0.35, size: 0.22, grav: 0, drag: 4 });
  };
  F.block = function (x, z) {
    F.sphere(x, 0.9, z, { r0: 1.0, r1: 1.6, life: 0.22, color: 0x2a6ab8, opacity: 0.5 });
    F.burst(x, 1, z, { n: 10, color: [0xbfe4ff, 0xffffff, 0x6ab8ff], glow: true, speed: 6, life: 0.35, size: 0.18, grav: 6, drag: 3 });
  };
  F.levelUp = function (x, z) {
    F.ring(x, z, { r0: 0.3, r1: 4, life: 0.6, color: 0xffd060 });
    for (let i = 0; i < 26; i++) F.glow.add(x + (Math.random() - 0.5) * 1.6, Math.random() * 0.5, z + (Math.random() - 0.5) * 1.6, 0, 3 + Math.random() * 4, 0, 1 + Math.random() * 0.5, 0.2, 0xffd060, 0, 0.6);
  };
  F.dust = (x, z, n = 4) => F.burst(x, 0.15, z, { n, color: [0x9a8060, 0x7a6448], speed: 1.6, life: 0.5, size: 0.16, up: 0.3, grav: 2, drag: 3 });

  // Screen shake. Every shake also tires the camera for a few seconds: the next ones shake less, and
  // enough of them in a row (a chain of explosions) shake nothing at all until it has rested.
  const TIRE = 1.5, REST = 0.35;   // tiredness per unit of shake asked for; tiredness lost per second
  F.shake = (a) => {
    if (!(a > 0)) return;
    F.trauma = Math.min(1, F.trauma + a * Math.max(0, 1 - F.tired));
    F.tired = Math.min(1, F.tired + a * TIRE);
  };
  function pulseEl(id, a, color) {
    const el = document.getElementById(id);
    if (!el) return;
    if (color) el.style.background = color;
    el.style.transition = 'none'; el.style.opacity = a; void el.offsetWidth;
    el.style.transition = ''; el.style.opacity = 0;
  }
  F.flash = (color = '#f1e6cf', a = 0.5) => pulseEl('flash', a, color);
  F.hurt = (a = 0.85) => pulseEl('vignette', a);

  // ---------- shadows ----------
  let shadowN = 0;
  F.shadowBegin = () => { shadowN = 0; };
  F.shadow = function (x, z, r) {
    if (shadowN >= SHADOW_MAX) return;
    dummy.position.set(x, 0.035, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(r * 2, 1, r * 2); dummy.updateMatrix();
    F.shadows.setMatrixAt(shadowN++, dummy.matrix);
  };
  F.shadowEnd = () => { F.shadows.count = shadowN; F.shadows.instanceMatrix.needsUpdate = true; };

  // ---------- floating numbers / text ----------
  F.num = function (x, y, z, text, color = '#ffffff', size = 12, crit = false) {
    if (F.nums.length > 150) F.nums.shift();
    F.nums.push({ x: x + (Math.random() - 0.5) * 0.5, y, z: z + (Math.random() - 0.5) * 0.3, text: String(text), color, size, crit, t: 0, life: crit ? 0.95 : 0.7 });
  };
  const pv = new T.Vector3();
  F.project = function (x, y, z) {
    pv.set(x, y, z).project(G.camera);
    if (pv.z > 1) return null;
    return { x: (pv.x + 1) / 2 * F.ov.width, y: (1 - pv.y) / 2 * F.ov.height };
  };

  // Arrow on the screen edge pointing at an off-screen world position, with a label.
  // Returns the on-screen point instead (and draws nothing) when the position is visible.
  F.pointer = function (c, dpr, x, z, color, label) {
    const w = F.ov.width, h = F.ov.height, m = 40 * dpr, s = F.project(x, 1, z), P = G.player;
    if (s && s.x > 0 && s.x < w && s.y > 0 && s.y < h) return s;
    let dx = x - P.x, dy = z - P.z;
    if (s) { dx = s.x - w / 2; dy = s.y - h / 2; }
    const k = Math.min((w / 2 - m) / Math.max(Math.abs(dx), 1e-6), (h / 2 - m) / Math.max(Math.abs(dy), 1e-6));
    const ex = w / 2 + dx * k, ey = h / 2 + dy * k, ang = Math.atan2(dy, dx), r = 13 * dpr;
    c.save(); c.translate(ex, ey); c.rotate(ang);
    c.beginPath(); c.moveTo(r, 0); c.lineTo(-r * 0.7, -r * 0.75); c.lineTo(-r * 0.35, 0); c.lineTo(-r * 0.7, r * 0.75); c.closePath();
    c.lineWidth = 3 * dpr; c.strokeStyle = '#120a06'; c.stroke();
    c.fillStyle = color; c.fill();
    c.restore();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
    const t = `${label} ${Math.round(Math.hypot(x - P.x, z - P.z))}m`, lx = ex - Math.cos(ang) * 30 * dpr, ly = ey - Math.sin(ang) * 22 * dpr;
    c.lineWidth = 4 * dpr; c.strokeStyle = '#120a06'; c.strokeText(t, lx, ly);
    c.fillStyle = color; c.fillText(t, lx, ly);
    return null;
  };

  // ---------- update / draw ----------
  F.update = function (dt) {
    F.trauma = Math.max(0, F.trauma - dt * 1.7); F.tired = Math.max(0, F.tired - dt * REST);
    F.solid.update(dt); F.glow.update(dt); F.streaks.update(dt);
    for (const e of pools.sph) if (e.on) {
      e.t += dt; const k = e.t / e.life;
      if (k >= 1) { e.on = false; e.mesh.visible = false; continue; }
      const s = U.lerp(e.r0, e.r1, 1 - (1 - k) * (1 - k)); e.mesh.scale.set(s, s, s); e.mat.opacity = e.op * (1 - k);
    }
    for (const e of pools.ring) if (e.on) {
      e.t += dt; const k = e.t / e.life;
      if (k >= 1) { e.on = false; e.mesh.visible = false; continue; }
      const s = U.lerp(e.r0, e.r1, 1 - (1 - k) * (1 - k)); e.mesh.scale.set(s, 1, s); e.mat.opacity = e.op * (1 - k);
    }
    for (const e of pools.disc) if (e.on) {
      e.t += dt;
      if (e.t >= e.life) { e.on = false; e.mesh.visible = false; continue; }
      e.mat.opacity = e.op * Math.min(1, e.t * 6, (e.life - e.t) / 0.5);
    }
    for (const e of pools.arc) if (e.on) {
      e.t += dt; const k = e.t / e.life;
      if (k >= 1) { e.on = false; e.mesh.visible = false; continue; }
      const s = e.r * (0.92 + k * 0.12); e.mesh.scale.set(s, 1, s); e.mat.opacity = e.op * (1 - k);
    }
    for (const e of pools.tele) if (e.on) {
      e.t += dt; const k = e.t / e.life;
      if (k >= 1 || e.cancel) { e.on = false; e.cancel = false; e.mesh.visible = false; continue; }
      const s = Math.max(0.01, e.r * k); e.fill.scale.set(s, 1, s); e.m1.opacity = 0.6 + Math.sin(e.t * 20) * 0.3;
    }
    for (const e of pools.line) if (e.on) {
      e.t += dt; const k = e.t / e.life;
      if (k >= 1 || e.cancel) { e.on = false; e.cancel = false; e.mesh.visible = false; continue; }
      e.mesh.scale.z = Math.max(0.01, e.len * Math.min(1, k * 1.4)); e.mat.opacity = 0.25 + Math.sin(e.t * 20) * 0.12;
    }
    for (const n of F.nums) { n.t += dt; n.y += dt * (n.crit ? 1.2 : 1.8); }
    F.nums = F.nums.filter((n) => n.t < n.life);
  };
  F.clear = function () {
    F.solid.clear(); F.glow.clear(); F.streaks.list.length = 0; F.nums.length = 0; F.trauma = 0; F.tired = 0;
    for (const k in pools) for (const e of pools[k]) { e.on = false; e.cancel = false; e.mesh.visible = false; }
  };

  F.drawOverlay = function () {
    const c = F.ctx, dpr = F.dpr || 1;
    c.clearRect(0, 0, F.ov.width, F.ov.height);
    if (G.select && G.select.on) { G.select.drawOverlay(c, dpr); return; }
    if (G.onTitle()) return;
    if (G.intro && G.intro.on) { G.intro.drawOverlay(c, dpr); return; }
    if (G.enemySys) G.enemySys.drawOverlay(c, dpr);
    if (G.playerSys) G.playerSys.drawOverlay(c, dpr);
    if (G.pickups) G.pickups.drawOverlay(c, dpr);
    // inside a dungeon the farm's things (altars, chests, the workbench...) are far away: no arrows to them
    const farm = !(G.dungeon && G.dungeon.active);
    if (G.altars && farm) G.altars.drawOverlay(c, dpr);
    if (G.chests && farm) G.chests.drawOverlay(c, dpr);
    if (G.mokosh && farm) G.mokosh.drawOverlay(c, dpr);
    if (G.invasion && farm) G.invasion.drawOverlay(c, dpr);
    if (G.mech) G.mech.drawOverlay(c, dpr);
    if (G.ritual && farm) G.ritual.drawOverlay(c, dpr);
    if (G.gaze && farm) G.gaze.drawOverlay(c, dpr);
    if (G.darkness && farm) G.darkness.drawOverlay(c, dpr);
    if (G.days && farm) G.days.drawOverlay(c, dpr);
    if (G.dungeon) G.dungeon.drawOverlay(c, dpr);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const n of F.nums) {
      if (G.darkness && G.darkness.hidden(n.x, n.z)) continue;   // lost in The Dark
      const s = F.project(n.x, n.y, n.z);
      if (!s) continue;
      const pop = n.crit ? 1 + Math.max(0, 0.15 - n.t) / 0.15 * 0.9 : 1 + Math.max(0, 0.08 - n.t) / 0.08 * 0.3;
      const a = Math.min(1, (n.life - n.t) / 0.25);
      const px = Math.round(n.size * pop * dpr);
      c.globalAlpha = a;
      c.font = `${px}px "Press Start 2P", monospace`;
      c.lineWidth = Math.max(2, px * 0.28); c.strokeStyle = '#120a06';
      c.strokeText(n.text, s.x, s.y); c.fillStyle = n.color; c.fillText(n.text, s.x, s.y);
    }
    c.globalAlpha = 1;
  };
})();
