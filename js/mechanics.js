'use strict';
// Boss mechanics (enemies.json "abilities", and the Doombringer modifier): one of each can be active
// at a time.
//   anchor: a circle drops at your feet. Stand in it for `time` seconds in a row before `window` runs
//           out, or it explodes on you wherever you are. At most one every `gap` seconds.
//   tesla:  tesla towers rise around the farm. Stand next to each one to charge it. Charge them all in
//           time and they strike the boss; fail and every uncharged tower strikes you.
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player;
  const MC = G.mech = { anchor: null, tesla: null, anchorAt: -1e9 };
  const GOLD = 0xffd04a, CYAN = 0x6fe8ff;
  let ringGeo, discGeo;
  const addMat = (c, o) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
  function geos() {
    if (ringGeo) return;
    ringGeo = new T.RingGeometry(0.9, 1, 40, 1); ringGeo.rotateX(-Math.PI / 2);
    discGeo = new T.CircleGeometry(1, 32); discGeo.rotateX(-Math.PI / 2);
  }
  const dispose = (g) => { G.scene.remove(g); g.traverse((o) => { if (o.geometry && o.geometry !== ringGeo && o.geometry !== discGeo) o.geometry.dispose(); if (o.material && o.material !== M.matL) o.material.dispose(); }); };

  // Returns false when the ability can't start right now (the owner tries again shortly).
  MC.start = function (kind, owner, ab) {
    if (P.dead || G.phase !== 'fight' || owner.dead) return false;
    // one circle at a time, and at most one every ab.gap seconds of fighting from any monster
    if (kind === 'anchor' && !MC.anchor && G.time - MC.anchorAt >= ab.gap) { MC.anchorAt = G.time; startAnchor(owner, ab); return true; }
    if (kind === 'tesla' && !MC.tesla) return startTesla(owner, ab);
    return false;
  };
  MC.clear = function () {
    if (MC.anchor) dispose(MC.anchor.g);
    if (MC.tesla) for (const t of MC.tesla.towers) dispose(t.g);
    MC.anchor = MC.tesla = null;
    MC.anchorAt = -1e9;
  };

  // ---------- anchor ----------
  function startAnchor(owner, ab) {
    geos();
    const g = new T.Group(), ring = new T.Mesh(ringGeo, addMat(GOLD, 0.9)), fill = new T.Mesh(discGeo, addMat(0x7dff6a, 0.35)), base = new T.Mesh(discGeo, addMat(GOLD, 0.12));
    ring.scale.set(ab.radius, 1, ab.radius); base.scale.set(ab.radius, 1, ab.radius); fill.scale.set(0.01, 1, 0.01);
    g.add(base, fill, ring); g.position.set(P.x, 0.09, P.z); G.scene.add(g);
    MC.anchor = { x: P.x, z: P.z, r: ab.radius, need: ab.time, window: ab.window, t: 0, held: 0, owner, dmg: owner.dmg * ab.damage, g, ring, fill };
    F.ring(P.x, P.z, { r0: ab.radius * 2, r1: ab.radius, life: 0.4, color: GOLD });
    G.ui.toast(`${owner.name || owner.def.name} marks the ground: stand in the circle for ${ab.time}s!`, '#ffd04a');
    A.play('anchor');
  }
  function updateAnchor(dt) {
    const a = MC.anchor;
    a.t += dt;
    if (a.owner.dead) { dispose(a.g); MC.anchor = null; return; }
    const inside = !P.dead && Math.hypot(P.x - a.x, P.z - a.z) < a.r + P.r * 0.3;
    a.held = inside ? a.held + dt : 0;
    const k = Math.min(1, a.held / a.need), s = Math.max(0.01, a.r * k), left = a.window - a.t;
    a.fill.scale.set(s, 1, s);
    a.ring.material.opacity = 0.55 + Math.sin(a.t * (left < 2 ? 26 : 10)) * 0.35;
    a.ring.material.color.set(inside ? 0x7dff6a : GOLD);
    if (Math.random() < dt * 12) F.rise(a.x + U.rnd(-1, 1) * a.r, 0.1, a.z + U.rnd(-1, 1) * a.r, GOLD, 1, 0.2, 2, 0.12, 0.6);
    if (a.held >= a.need) {
      F.ring(a.x, a.z, { r0: a.r * 0.5, r1: a.r * 2.2, life: 0.5, color: 0x7dff6a }); F.flash('#c8ffb8', 0.2);
      G.ui.toast('You held your ground. The mark fades.', '#7dff6a'); A.play('heal');
      dispose(a.g); MC.anchor = null;
    } else if (left <= 0) {
      F.explosion(P.x, P.z, 4.5, GOLD); F.flash('#ffd04a', 0.45); F.shake(0.7); A.play('explode');
      G.ui.toast('The mark explodes!', '#ff6a4a');
      G.playerSys.damage(a.dmg, null);
      dispose(a.g); MC.anchor = null;
    }
  }

  // ---------- tesla towers ----------
  function towerSpots(n) {
    const out = [];
    for (let i = 0; i < 400 && out.length < n; i++) {
      const b = W.bounds.spots, x = U.rnd(b[0], b[1]), z = U.rnd(b[2], b[3]);
      if (W.blocked(x, z, 2) || Math.hypot(x - P.x, z - P.z) < 7 || Math.hypot(x - P.x, z - P.z) > 30) continue;
      if (out.some((o) => Math.hypot(o[0] - x, o[1] - z) < 9)) continue;
      out.push([x, z]);
    }
    return out;
  }
  function startTesla(owner, ab) {
    geos();
    const spots = towerSpots(ab.towers);
    if (!spots.length) return false;
    const parts = M.teslaTower(), towers = spots.map(([x, z]) => {
      const g = new T.Group(), glowMat = new T.MeshBasicMaterial({ vertexColors: true }), ring = new T.Mesh(ringGeo, addMat(CYAN, 0.7)), pad = new T.Mesh(discGeo, addMat(CYAN, 0.1));
      const body = new T.Group();
      body.add(new T.Mesh(M.merge(parts.parts, 0.06), M.matL), new T.Mesh(M.merge(parts.glow, 0), glowMat));
      ring.scale.set(ab.radius, 1, ab.radius); pad.scale.set(ab.radius, 1, ab.radius); ring.position.y = pad.position.y = 0.08;
      g.add(body, ring, pad); g.position.set(x, 0, z); body.position.y = -4.2; G.scene.add(g);
      F.dust(x, z, 10); F.ring(x, z, { r0: 0.5, r1: ab.radius, life: 0.6, color: CYAN });
      return { x, z, g, body, glowMat, ring, pad, charge: 0, done: false };
    });
    MC.tesla = { towers, owner, ab, t: 0, end: 0 };
    G.ui.banner('Tesla Towers!', `Stand by each tower to charge it. Charge all ${towers.length} in ${ab.time}s or they strike you.`, '#6fe8ff');
    A.play('tesla'); F.shake(0.3);
    return true;
  }
  function updateTesla(dt) {
    const v = MC.tesla, ab = v.ab;
    v.t += dt;
    for (const t of v.towers) {
      t.body.position.y = U.damp(t.body.position.y, 0, 5, dt);
      const top = { x: t.x, y: 3.95, z: t.z };
      if (!v.end && !t.done && !P.dead && Math.hypot(P.x - t.x, P.z - t.z) < ab.radius) {
        t.charge = Math.min(1, t.charge + dt / ab.charge);
        if (Math.random() < dt * 14) F.streak(top.x, top.y, top.z, P.x + U.rnd(-0.3, 0.3), 1.2, P.z + U.rnd(-0.3, 0.3), CYAN, 0.12, 0.08);
        if (t.charge >= 1) { t.done = true; F.ring(t.x, t.z, { r0: 0.5, r1: ab.radius * 1.4, life: 0.5, color: CYAN }); A.play('levelup'); }
      }
      const k = t.done ? 1 : t.charge;
      t.glowMat.color.setRGB(0.25 + k * 0.6, 0.35 + k * 0.65, 0.5 + k * 0.5);
      t.ring.material.color.set(t.done ? 0x7dff6a : CYAN);
      t.ring.material.opacity = t.done ? 0.9 : 0.5 + Math.sin(v.t * 8 + t.x) * 0.25;
      if (Math.random() < dt * (2 + k * 10)) F.glow.add(top.x, top.y, top.z, U.rnd(-2, 2), U.rnd(-1, 2), U.rnd(-2, 2), 0.3, 0.14, CYAN, 0, 3);
    }
    if (v.end) { if (v.t >= v.end) { for (const t of v.towers) dispose(t.g); MC.tesla = null; } return; }
    const o = v.owner;
    if (o.dead) { v.end = v.t + 0.6; return; }
    if (v.towers.every((t) => t.done)) {
      // every tower strikes the boss
      for (const t of v.towers) {
        F.laser(t.x, 3.95, t.z, o.x, 2.2 * o.scale, o.z, 0.6);
        G.combat.damage(o, o.maxHp * ab.reward, 'elemental');
      }
      if (!o.dead) G.combat.inflict(o, 'stun');
      F.flash('#c8f8ff', 0.4); F.shake(0.6); A.play('zap');
      G.ui.toast('The towers strike the boss!', '#6fe8ff');
      v.end = v.t + 1;
    } else if (v.t >= ab.time) {
      const left = v.towers.filter((t) => !t.done);
      for (const t of left) F.laser(t.x, 3.95, t.z, P.x, 1.1, P.z, 0.6);
      F.flash('#6fe8ff', 0.4); F.shake(0.6); A.play('zap');
      G.ui.toast(`${left.length} uncharged tower${left.length === 1 ? '' : 's'} strike you!`, '#ff6a4a');
      G.playerSys.damage(o.dmg * ab.damage * left.length, null);
      v.end = v.t + 1;
    }
  }

  MC.update = function (dt) {
    if (MC.anchor) updateAnchor(dt);
    if (MC.tesla) updateTesla(dt);
  };
  // HUD event line for the active mechanic, or ''.
  MC.status = function () {
    const a = MC.anchor, v = MC.tesla;
    if (a) return `HOLD YOUR GROUND · ${Math.min(a.held, a.need).toFixed(1)}/${a.need}s · ${Math.max(0, a.window - a.t).toFixed(1)}s`;
    if (v && !v.end) return `CHARGE THE TESLA TOWERS · ${v.towers.filter((t) => t.done).length}/${v.towers.length} · ${Math.max(0, v.ab.time - v.t).toFixed(0)}s`;
    return '';
  };
  // Arrows to the anchor circle and uncharged towers, and charge bars over the towers.
  MC.drawOverlay = function (c, dpr) {
    const a = MC.anchor, v = MC.tesla;
    if (a) F.pointer(c, dpr, a.x, a.z, '#ffd04a', 'STAND HERE');
    if (v && !v.end) for (const t of v.towers) {
      if (t.done) continue;
      const s = F.pointer(c, dpr, t.x, t.z, '#6fe8ff', 'TESLA');
      if (!s) continue;
      const p = F.project(t.x, 4.8, t.z);
      if (!p) continue;
      const w = 46 * dpr, h = 6 * dpr;
      c.fillStyle = '#120a06'; c.fillRect(p.x - w / 2 - dpr, p.y - dpr, w + 2 * dpr, h + 2 * dpr);
      c.fillStyle = '#6fe8ff'; c.fillRect(p.x - w / 2, p.y, w * t.charge, h);
    }
  };
})();
