'use strict';
// Alien invasion (data/stages.json > invasion): a green light pillar lands, rare monsters with random
// modifiers climb out of it, and the pillar wanders the farm burning everything that is not green and
// dropping more green monsters until every rare is dead. Repelling it earns an Alien Spoon for this run.
// Day events start invasions (day.js); every invasion brings more rares than the one before
// (stages.json > invasion.raresGrowth). Dawn ends an invasion still in progress.
(function () {
  const T = THREE, U = G.U, F = G.fx, A = G.audio, W = G.world, P = G.player, ES = G.enemySys;
  const IV = G.invasion = { on: null, count: 0 };
  const GREEN = 0x7dff6a;
  let beamGeo, ringGeo, discGeo;

  IV.reset = function () { IV.clear(); IV.count = 0; };
  // Rares on the nth invasion of the run (0 = the first).
  IV.rareCount = (n) => Math.min(G.INVASION.maxRares, Math.round(G.INVASION.rares * Math.pow(G.INVASION.raresGrowth, n)));
  IV.clear = function () {
    if (IV.on) { G.scene.remove(IV.on.g); for (const m of IV.on.mats) m.dispose(); }
    IV.on = null;
  };
  IV.alive = () => (IV.on ? IV.on.rares.filter((e) => !e.dead).length : 0);

  function spot(minD) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 60; i++) {
        const x = U.rnd(-32, 32), z = U.rnd(-32, 32);
        if ((pass === 0 && Math.hypot(x - P.x, z - P.z) < minD) || W.blocked(x, z, 2)) continue;
        return [x, z];
      }
    }
    return [0, 0];
  }
  // The pillar: a wide faint beam, a bright shimmering core, a glowing footprint and rings scanning up it.
  function build() {
    if (!beamGeo) {
      // vertex colours fade the additive beam out towards the top
      beamGeo = new T.CylinderGeometry(1, 1, 30, 20, 8, true); beamGeo.translate(0, 15, 0);
      const pos = beamGeo.attributes.position, col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) col.fill(Math.pow(1 - pos.getY(i) / 30, 1.5), i * 3, i * 3 + 3);
      beamGeo.setAttribute('color', new T.BufferAttribute(col, 3));
      ringGeo = new T.TorusGeometry(1, 0.06, 4, 28); ringGeo.rotateX(Math.PI / 2);
      discGeo = new T.CircleGeometry(1, 28); discGeo.rotateX(-Math.PI / 2);
    }
    const mat = (c, o, vc) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false, vertexColors: !!vc });
    const outer = new T.Mesh(beamGeo, mat(GREEN, 0.3, true)), core = new T.Mesh(beamGeo, mat(0xb8ffa8, 0.55, true)), disc = new T.Mesh(discGeo, mat(GREEN, 0.35));
    const rings = [0, 1, 2].map(() => new T.Mesh(ringGeo, mat(0xb8ff9a, 0.7)));
    disc.position.y = 0.07;
    const g = new T.Group();
    g.add(outer, core, disc, ...rings);
    return { g, outer, core, disc, rings, mats: [outer.material, core.material, disc.material, ...rings.map((r) => r.material)] };
  }
  function pickTarget(v) { v.tx = U.rnd(-34, 34); v.tz = U.rnd(-34, 34); }

  IV.start = function () {
    const C = G.INVASION, [x, z] = spot(C.minPlayerDistance), b = build();
    b.g.position.set(x, 0, z);
    G.scene.add(b.g);
    const n = IV.rareCount(IV.count++);
    IV.on = Object.assign(b, { x, z, tx: x, tz: z, t: 0, w: 0, phase: 'landing', rares: [], n, spawnT: C.pillar.spawnEvery, burnT: 0, scorchT: 0, lx: x, lz: z });
    G.ui.banner('Alien Invasion!', `A green light falls on the farm. ${n} green invaders are coming!`, '#7dff6a');
    A.play('invasion'); F.shake(0.4); F.flash('#3aff6a', 0.25);
  };
  function spawnRares(v, C) {
    for (let i = 0; i < v.n; i++) {
      const type = G.spawner.pickType(), a = (i / v.n) * Math.PI * 2, r = 1.5 + Math.floor(i / 8) * 1.4;
      const mods = G.rollModifiers(G.invasionModCount(G.danger), G.danger, G.ENEMIES[type].ai);
      const e = ES.spawn(type, v.x + Math.cos(a) * r, v.z + Math.sin(a) * r, { mods, hpMul: C.rareHp, sizeMul: C.rareSize, alien: true });
      e.invader = true; e.dmg *= C.rareDamage; e.dmgMul = C.rareDamage; e.xp *= C.rareXp; e.essence *= 10; e.mass *= 2;
      v.rares.push(e);
      F.burst(e.x, 1, e.z, { n: 14, color: [GREEN, 0xffffff], glow: true, speed: 6, life: 0.6, size: 0.2 });
    }
    A.play('zap'); F.shake(0.3);
  }
  function complete(v, C) {
    const R = C.reward, PK = G.pickups;
    v.phase = 'leaving'; v.t = 0;
    G.run.invasions++;
    const n = R.spoons ? G.talents.addSpoons(R.spoons) : 0;
    if (R.xp) { const total = R.xp * (1 + 0.3 * G.danger); for (let i = 0; i < 16; i++) PK.dropXP(v.lx + U.rnd(-2.5, 2.5), v.lz + U.rnd(-2.5, 2.5), total / 16); }
    R.items.forEach((it, i) => Math.random() < G.DROPS.itemMult && PK.dropItem(v.lx + Math.cos(i * 2.4) * 1.5, v.lz + Math.sin(i * 2.4) * 1.5, G.combat.rollItem(U.clamp(it.minRarity || 0, 0, G.RARITY.length - 1), it.luck || 0)));
    if (R.buff) G.playerSys.addBuff(R.buff);
    A.play('totem'); F.flash('#7dff6a', 0.35);
    G.ui.banner('Invasion Repelled!', n ? `+${n} Alien Spoon${n > 1 ? 's' : ''} for the talent tree (T)` : R.spoons ? 'No more Alien Spoons on this level.' : 'The green light fades.', '#7dff6a');
  }

  IV.update = function (dt) {
    const C = G.INVASION;
    if (!C) return;
    const v = IV.on;
    if (!v) return;
    v.t += dt;
    const R = C.pillar.radius;
    v.w = U.damp(v.w, v.phase === 'leaving' ? 0 : 1, v.phase === 'landing' ? 2 : 4, dt);
    v.g.position.set(v.x, 0, v.z);
    v.outer.scale.set(R * v.w, 1, R * v.w); v.outer.material.opacity = 0.26 + Math.sin(v.t * 6) * 0.05;
    const cw = R * 0.35 * v.w * (0.85 + Math.sin(v.t * 23) * 0.15);
    v.core.scale.set(cw, 1, cw);
    v.disc.scale.set(R * 1.15 * v.w, 1, R * 1.15 * v.w);
    v.rings.forEach((r, i) => { const k = (v.t * 0.45 + i / 3) % 1; r.position.y = k * 16; r.scale.setScalar(Math.max(0.01, R * v.w * (1 + k * 0.25))); r.material.opacity = 0.7 * (1 - k); });
    if (Math.random() < dt * 25 * v.w) F.rise(v.x + U.rnd(-R, R) * 0.8, 0.2, v.z + U.rnd(-R, R) * 0.8, U.pick([GREEN, 0xd8ffd0, 0xffe080]), 1, 0.3, 4, 0.18, 0.8);
    if (v.phase === 'landing') {
      if (v.t >= C.landDelay) { v.phase = 'active'; spawnRares(v, C); pickTarget(v); }
      return;
    }
    if (v.phase === 'leaving') {
      if (v.t > 1.8) IV.clear();
      return;
    }
    // wander between random spots on the farm
    const dx = v.tx - v.x, dz = v.tz - v.z, d = Math.hypot(dx, dz);
    if (d < 1) pickTarget(v);
    else { const sp = Math.min(d, C.pillar.speed * dt); v.x += dx / d * sp; v.z += dz / d * sp; }
    // burn everything inside that is not green, four times a second
    v.burnT -= dt;
    if (v.burnT <= 0) {
      const tick = 0.25;
      v.burnT += tick;
      ES.query(v.x, v.z, R + 3, (e) => {
        if (e.dead || e.alien || Math.hypot(e.x - v.x, e.z - v.z) > R + e.r * 0.5) return;
        G.combat.damage(e, e.maxHp * (e.boss ? C.pillar.bossDamage : C.pillar.monsterDamage) * tick, 'burn');
      });
      if (!P.dead && Math.hypot(P.x - v.x, P.z - v.z) < R + P.r * 0.5) G.playerSys.damage(C.pillar.playerDamage * G.diffDmg() * tick, null);
    }
    v.scorchT -= dt;
    if (v.scorchT <= 0) { v.scorchT = 0.45; F.disc(v.x, v.z, R * 0.9, 6, 0x0c1408, 0.55, false); }
    // drop more green monsters while the invaders live
    v.spawnT -= dt;
    if (v.spawnT <= 0) {
      v.spawnT = C.pillar.spawnEvery;
      if (ES.list.length < G.spawner.cap()) {
        const e = ES.spawn(G.spawner.pickType(), v.x + U.rnd(-1, 1), v.z + U.rnd(-1, 1), { alien: true });
        F.burst(e.x, 1, e.z, { n: 8, color: [GREEN, 0xd8ffd0], glow: true, speed: 4, life: 0.4, size: 0.16 });
        A.play('zap');
      }
    }
    for (const e of v.rares) if (e.dead && !e.counted) { e.counted = true; v.lx = e.x; v.lz = e.z; F.ring(e.x, e.z, { r0: 0.5, r1: 4, life: 0.6, color: GREEN }); }
    if (!IV.alive()) complete(v, C);
  };

  // Arrows to the landing spot and to every living invader that is off screen.
  IV.drawOverlay = function (c, dpr) {
    const v = IV.on;
    if (!v || v.phase === 'leaving') return;
    if (v.phase === 'landing') { F.pointer(c, dpr, v.x, v.z, '#7dff6a', 'LANDING'); return; }
    for (const e of v.rares) if (!e.dead) F.pointer(c, dpr, e.x, e.z, '#7dff6a', 'INVADER');
  };
})();
