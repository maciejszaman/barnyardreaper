'use strict';
// Entities: the player, enemies (instanced rendering + AI), bosses, monster modifiers, enemy shots
// and hazards, and the spawner.
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world;

  // =====================================================================
  // Player
  // =====================================================================
  const P = G.player = { x: 0, z: 0, r: 0.45 };
  const PS = G.playerSys = {};
  // Where the weapon sits in the hand at rest and mid-swing (holder is parented to the shoulder pivot).
  // Weapons pick one of these with "pose" in weapons.json.
  const POSE = {
    scythe: { rest: [[-0.37, -0.42, 0.06], [0, -Math.PI / 2, 0]], atk: [[-0.05, -0.38, 0.3], [Math.PI / 2, 0, 0]], melee: true },
    sword: { rest: [[-0.37, -0.42, 0.08], [0.6, 0, 0]], atk: [[-0.05, -0.32, 0.3], [Math.PI / 2, 0, 0]], melee: true },
    shotgun: { rest: [[-0.22, -0.12, 0.42], [0, 0, 0]], gun: true, twoHanded: true },
    revolver: { rest: [[-0.3, -0.06, 0.48], [0, 0, 0]], gun: true },
    flask: { rest: [[-0.37, -0.5, 0.06], [0, 0, 0]], toss: true },
    tome: { rest: [[-0.24, -0.2, 0.44], [0, 0, 0]], gun: true, twoHanded: true },
  };

  PS.create = function () {
    P.model = M.hero(G.CHAR.model); P.root = P.model.root;
    G.scene.add(P.root);
    PS.setHat(G.CHAR.hat); PS.setWeapon(G.CHAR.weapon); PS.reset();
  };
  // Another character was chosen (G.setCharacter): its model replaces the old one where it stood.
  PS.rebuild = function () {
    const old = P.root, visible = old.visible;
    G.scene.remove(old);
    old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    P.model = M.hero(G.CHAR.model); P.root = P.model.root; P.root.visible = visible;
    G.scene.add(P.root);
    PS.setHat(G.equip && G.equip.hat ? G.equip.hat.model : G.CHAR.hat); PS.setWeapon(G.equip ? G.equip.weapon.wtype : G.CHAR.weapon);
    P.root.position.set(P.x || 0, 0, P.z || 0);
  };
  PS.reset = function () {
    Object.assign(P, { x: 0, z: 0, vx: 0, vz: 0, kbx: 0, kbz: 0, yaw: 0, aimYaw: 0, moving: 0, phase: 0, dashCd: 0, dashCdMax: 0, dashT: 0, dashX: 0, dashZ: 1, dashHits: [], invuln: 0,
      regenT: 0, charges: 1, dots: {}, dotT: 0, atkT: 0, atkDur: 0.25, recoil: 0, hurtT: 0, dead: false, deathT: 0, t: 0, hp: G.stats ? G.stats.maxHp : 100,
      status: {}, immune: {}, buffs: {} });
    P.root.position.set(0, 0, 0); P.root.rotation.set(0, 0, 0); P.root.visible = true;
    P.model.swing.rotation.set(0, 0, 0);
    PS.applyPose(true);
  };
  const clearKids = (g) => { while (g.children.length) { const c = g.children[0]; g.remove(c); c.traverse((o) => o.geometry && o.geometry.dispose()); } };
  PS.setHat = function (kind) { clearKids(P.model.hatMount); P.model.hatMount.add(M.mesh(M.hatParts(kind))); };
  PS.setWeapon = function (id) {
    const Wd = G.WEAPONS[id];
    clearKids(P.model.holder); P.model.holder.add(M.weapon(Wd.model));
    P.pose = POSE[Wd.pose] || POSE.scythe; PS.applyPose(true);
  };
  // Puts a hat and a weapon (held in its pose) on a cat model: the ledger's paper doll.
  PS.dress = function (model, weaponId, hat) {
    clearKids(model.hatMount); model.hatMount.add(M.mesh(M.hatParts(hat)));
    const Wd = G.WEAPONS[weaponId] || G.WEAPONS[G.CHAR.weapon], ps = POSE[Wd.pose] || POSE.scythe;
    clearKids(model.holder); model.holder.add(M.weapon(Wd.model));
    model.holder.position.set(...ps.rest[0]); model.holder.rotation.set(...ps.rest[1]);
  };
  PS.applyPose = function () {
    const ps = P.pose || POSE.scythe, h = P.model.holder;
    h.position.set(...ps.rest[0]); h.rotation.set(...ps.rest[1]); h.scale.setScalar(1);
  };
  // Called by combat when an attack fires.
  PS.attackAnim = function (yaw, dur) { P.aimYaw = yaw; P.atkDur = dur; P.atkT = dur; P.recoil = 1; P.aimHold = dur + 0.15; };
  PS.weaponTip = function (dist = 1.1) {
    const v = new T.Vector3(0, 0.08, dist);
    P.model.holder.localToWorld(v);
    return v;
  };

  // Every heal goes through here: Warm Milk (healTaken) boosts it, Purring Wrath feeds on it.
  PS.heal = function (n, show) {
    if (P.dead || n <= 0) return;
    n *= 1 + G.stats.healTaken;
    G.tfx.onHeal(n);
    const before = P.hp;
    P.hp = Math.min(G.stats.maxHp, P.hp + n);
    const got = P.hp - before;
    if (show && got >= 1) F.num(P.x, 2.3, P.z, '+' + Math.round(got), '#7dff7a', 14);
    if (got >= 1) F.rise(P.x, 0.6, P.z, 0x7dff7a, 3, 0.8, 2, 0.12, 0.7);
    if (got > 0) G.rules.fire('heal', { dmg: got });
  };

  // ----- statuses (slow, shock, stun, root) and temporary buffs on the player -----
  // P.status / P.buffs: { id: { t: seconds left, max } }. P.immune: { id: seconds of immunity left }.
  PS.has = (id) => !!P.status[id];
  // dur: seconds instead of the status's own (statusResist still shortens it)
  PS.addStatus = function (id, dur) {
    const S = G.STATUS[id];
    if (!S || P.dead || (P.immune[id] || 0) > 0) return;
    const d = (dur != null ? dur : S.playerDuration) * (1 - U.clamp(G.stats.statusResist, 0, 0.8));
    if (d <= 0.05) return;
    const cur = P.status[id];
    if (!cur) { F.num(P.x, 3, P.z, S.name.toUpperCase(), S.color, 12); A.play('status'); }
    if (!cur || cur.t < d) P.status[id] = { t: d, max: d };
    if (!cur && (id === 'stun' || id === 'root')) G.tfx.onCC();   // Unbreakable
  };
  // Poison or bleed on you (status_effects.json playerDots): hit = the damage of the hit that caused it.
  // Getting it again refreshes it, keeping the stronger one.
  PS.addDot = function (id, hit) {
    const D = G.PDOTS[id];
    if (!D || P.dead || hit <= 0) return;
    const d = D.duration * (1 - U.clamp(G.stats.statusResist, 0, 0.8)), dps = hit * D.damage, cur = P.dots[id];
    if (!cur) { F.num(P.x, 3, P.z, D.name.toUpperCase(), D.color, 12); A.play(id === 'bleed' ? 'bleed' : 'poison'); }
    P.dots[id] = { dps: Math.max(dps, cur ? cur.dps : 0), t: Math.max(d, cur ? cur.t : 0), max: Math.max(d, cur ? cur.max : 0) };
  };
  // Damage over time ticks twice a second. It ignores block and dodge, but shields soak it.
  function tickDots(dt) {
    let sum = 0;
    for (const id in P.dots) { const c = P.dots[id]; sum += c.dps * Math.min(dt, c.t); if ((c.t -= dt) <= 0) delete P.dots[id]; }
    P.dotAcc = (P.dotAcc || 0) + sum;
    if ((P.dotT -= dt) > 0) return;
    P.dotT = 0.5;
    const v = P.dotAcc; P.dotAcc = 0;
    if (v <= 0 || (G.debug && G.debug.god) || G.state !== 'playing') return;
    const dmg = G.tfx.absorb(v * (1 - G.progress.reduction()));
    if (dmg <= 0) return;
    const before = P.hp;
    P.hp -= dmg; G.run.taken += dmg;
    F.num(P.x, 2.4, P.z, '-' + Math.max(1, Math.round(dmg)), P.dots.bleed ? '#ff5a4a' : '#8aef4a', 12);
    G.tfx.onDamaged(dmg, before);
    G.rules.onDamaged(dmg, before, null);
    if (P.hp <= 0) {
      if (G.stats.extraLives > G.run.livesUsed) { PS.revive(); return; }
      P.hp = 0; P.dead = true; P.deathT = 0; if (G.onPlayerDeath) G.onPlayerDeath();
    }
  }
  // dur: seconds instead of the buff's own duration (a shorter one never cuts a longer one short).
  // A buff your weapon lets stack (the Obsidian Blade's Bloodlust: weapons.json implicit.stacks) adds a
  // stack with its own timer instead: { t (the longest), max, stacks: [seconds left each], falloff }.
  PS.addBuff = function (id, dur) {
    const B = G.BUFFS[id];
    if (!B || P.dead) return;
    const had = !!P.buffs[id], d = dur || B.duration, SB = G.stats && G.stats.buffStack;
    if (had && SB && SB.buff === id) {
      const b = P.buffs[id];
      b.stacks = b.stacks || [b.t]; b.falloff = SB.falloff;
      b.stacks.push(d); b.t = Math.max(b.t, d); b.max = Math.max(b.max, d);
      G.progress.recompute(); F.num(P.x, 3, P.z, `${B.name.toUpperCase()} ×${b.stacks.length}`, B.color, 12);
      return;
    }
    if (!had || P.buffs[id].t < d) P.buffs[id] = { t: d, max: d };
    if (!had) { G.progress.recompute(); F.num(P.x, 3, P.z, B.name.toUpperCase(), B.color, 12); }
  };
  // How strong a buff is: 1, or with stacks every stack after the first falloff weaker (100% + 90% + ...).
  PS.buffPower = function (b) {
    if (!b || !b.stacks || b.stacks.length < 2) return 1;
    let k = 0;
    for (let i = 0; i < b.stacks.length; i++) k += Math.max(0, 1 - b.falloff * i);
    return k;
  };
  function tickStatuses(dt) {
    for (const id in P.immune) if ((P.immune[id] -= dt) <= 0) delete P.immune[id];
    for (const id in P.status) {
      const st = P.status[id];
      if ((st.t -= dt) > 0) continue;
      delete P.status[id];
      if (G.STATUS[id].immunity) P.immune[id] = G.STATUS[id].immunity;
    }
    let lost = false;
    for (const id in P.buffs) {
      const b = P.buffs[id];
      if (b.stacks) {
        const n = b.stacks.length;
        b.stacks = b.stacks.map((t) => t - dt).filter((t) => t > 0);
        b.t = Math.max(0, ...b.stacks);
        if (b.stacks.length !== n) lost = true;
        if (!b.stacks.length) delete P.buffs[id];
      } else if ((b.t -= dt) <= 0) { delete P.buffs[id]; lost = true; }
    }
    if (lost) G.progress.recompute();
  }

  // src: the enemy or shot that hit (its `owner` for thrown things). Vampiric monsters heal from it,
  // and monsters with "inflicts" can put statuses on you.
  // pierce: ignores armor and block (the Eldritch Gaze's crater).
  PS.damage = function (amount, src, pierce) {
    if (P.dead || P.invuln > 0 || G.state !== 'playing' || (G.debug && G.debug.god)) return false;
    const s = G.stats;
    let dmg = amount * (pierce ? 1 : 1 - G.progress.reduction()) * (P.status.shock ? 1 + G.STATUS.shock.power : 1);
    if (!pierce && Math.random() < Math.min(s.blockCap, s.blockChance + G.tfx.blockBonus())) {
      F.block(P.x, P.z); A.play('block');
      F.num(P.x, 2.6, P.z, 'BLOCK', '#8fd0ff', 14);
      if (s.blockHeal > 0) PS.heal(s.maxHp * s.blockHeal, true);
      if (s.fx.bombBattalion) G.combat.bomb();
      G.tfx.onBlock(dmg);   // Divine Shield, Thorned Guard
      const by = src && (src.owner || src);
      G.rules.fire('block', { dmg, e: by && by.st && !by.dead ? by : null });
      P.invuln = 0.1; G.run.blocks++;
      return false;
    }
    dmg = G.tfx.absorb(dmg);   // Trophy Hunter's shield
    if (dmg <= 0) { P.invuln = 0.12; return false; }
    const before = P.hp;
    P.hp -= dmg; P.invuln = 0.12; P.hurtT = 0.16;
    G.run.taken += dmg;
    F.hurt(Math.min(0.95, 0.35 + dmg / s.maxHp * 3)); F.shake(0.22 + Math.min(0.4, dmg / s.maxHp));
    F.num(P.x, 2.4, P.z, '-' + Math.max(1, Math.round(dmg)), '#ff4a3a', 15);
    F.burst(P.x, 1, P.z, { n: 6, color: [0xff4a3a, 0xa01e14], speed: 4, life: 0.5, size: 0.12 });
    A.play('hurt');
    const owner = src && (src.owner || src);
    if (owner && owner.healOnHit > 0 && !owner.dead && owner.maxHp) G.enemySys.heal(owner, owner.maxHp * owner.healOnHit, true);
    if (owner && owner.inflicts) for (const id in owner.inflicts) if (Math.random() < owner.inflicts[id]) { if (G.PDOTS[id]) PS.addDot(id, amount); else PS.addStatus(id); }
    if (src && src.hex) PS.addDot('poison', amount);   // purple hex shots (monsters' own poison lists are not this)
    G.tfx.onDamaged(dmg, before);   // Zealotry resets, Hiss! may go off
    G.rules.onDamaged(dmg, before, src);
    G.chests.onHit();   // Empowered Faith: holy fire around you
    if (P.hp <= 0) {
      if (s.extraLives > G.run.livesUsed) { PS.revive(); return true; }
      P.hp = 0; P.dead = true; P.deathT = 0; if (G.onPlayerDeath) G.onPlayerDeath();
    }
    return true;
  };
  // Death that ignores health, armor, block and shields (The Dark). An extra life still drags you back.
  // Returns true when you died.
  PS.kill = function () {
    if (P.dead || (G.debug && G.debug.god)) return false;
    if (G.stats.extraLives > G.run.livesUsed) { PS.revive(); return false; }
    G.run.taken += Math.max(0, P.hp);
    P.hp = 0; P.dead = true; P.deathT = 0; if (G.onPlayerDeath) G.onPlayerDeath();
    return true;
  };
  // Shove the player along (x, z) with strength k (Relentless pulses).
  PS.push = function (x, z, k) { if (!P.dead) { P.kbx += x * k; P.kbz += z * k; } };
  // Extra lives (talent): back on your paws at half health, with a shockwave that shoves monsters away.
  PS.revive = function () {
    G.run.livesUsed++;
    P.hp = G.stats.maxHp * 0.5; P.invuln = 2.5; P.status = {}; P.dots = {};
    if (G.CHAR.reviveBuff) PS.addBuff(G.CHAR.reviveBuff);
    F.flash('#fff3c4', 0.7); F.ring(P.x, P.z, { r0: 0.5, r1: 9, life: 0.6, color: 0xffe08a }); F.levelUp(P.x, P.z); A.play('revive');
    ES.query(P.x, P.z, 9, (e) => {
      if (e.dead || e.boss) return;
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
      if (d > 9) return;
      const k = 16 / Math.sqrt(e.mass); e.kbx += dx / d * k; e.kbz += dz / d * k;
    });
    const left = G.stats.extraLives - G.run.livesUsed;
    G.ui.banner(G.CHAR.reviveTitle, left > 0 ? `${left} spare ${left === 1 ? 'life' : 'lives'} left` : 'That was your last spare life', '#ffe08a');
  };

  PS.update = function (dt) {
    const s = G.stats, m = P.model;
    P.t += dt;
    if (P.dead) {
      P.deathT += dt;
      P.root.rotation.z = U.damp(P.root.rotation.z, Math.PI / 2, 6, dt);
      P.root.position.y = U.damp(P.root.position.y, 0.3, 6, dt);
      return;
    }
    P.invuln -= dt; P.dashCd -= dt; P.hurtT -= dt; P.atkT -= dt; P.aimHold = (P.aimHold || 0) - dt;
    P.recoil = Math.max(0, P.recoil - dt * 6);
    tickStatuses(dt); tickDots(dt);
    const held = P.status.stun || P.status.root, mv = held ? { x: 0, z: 0 } : G.input.move();
    // Dash charges (Double Pounce): one recharges at a time
    const maxC = PS.maxCharges(), cdT = 2.4 * (1 - Math.min(0.6, s.dashCdr));
    if (P.charges > maxC) P.charges = maxC;
    if (P.charges < maxC && P.dashCd <= 0) { P.charges++; if (P.charges < maxC) P.dashCd = P.dashCdMax = cdT; }
    if (G.input.dash) {
      G.input.dash = false;
      if (P.charges > 0 && !held) {
        const l = Math.hypot(mv.x, mv.z);
        if (l > 0.1) { P.dashX = mv.x / l; P.dashZ = mv.z / l; } else { P.dashX = Math.sin(P.yaw); P.dashZ = Math.cos(P.yaw); }
        if (P.charges === maxC) P.dashCd = P.dashCdMax = cdT;
        P.charges--;
        P.dashT = 0.2; P.invuln = Math.max(P.invuln, 0.32); P.dashHits = [];
        A.play('dash'); F.dust(P.x, P.z, 8);
        if (s.fx.dashBuff) PS.addBuff(s.fx.dashBuff.buff);
        if (s.wfx.dashBuff) PS.addBuff(s.wfx.dashBuff.buff);   // the MP5's implicit
        G.rules.fire('dash');
      }
    }
    // Killing Spree and Restless Waiting add movement speed that comes and goes
    const spd0 = s.moveSpeed * (1 + s.moveMult + G.tfx.moveBonus()) * (P.status.slow ? 1 - G.STATUS.slow.power : 1);
    let tx = mv.x * spd0, tz = mv.z * spd0, k = 16;
    if (P.dashT > 0) {
      P.dashT -= dt; tx = P.dashX * 25; tz = P.dashZ * 25; k = 40;
      F.glow.add(P.x, 0.9, P.z, 0, 0.3, 0, 0.3, 0.35, 0xffe0a0, 0, 1);
      if (s.dashStrike > 0 && G.state === 'playing') {
        ES.query(P.x, P.z, 3, (e) => {
          if (e.dead || e.y > 1.5 || P.dashHits.includes(e.id) || Math.hypot(e.x - P.x, e.z - P.z) > e.r + P.r + 0.6) return;
          P.dashHits.push(e.id);
          G.combat.hit(e, s.dmg * s.dashStrike, { kb: 1.5, dx: P.dashX, dz: P.dashZ });
          F.streak(P.x, 0.9, P.z, e.x, 0.9 + e.y, e.z, 0xffe0a0, 0.2, 0.1);
        });
      }
    }
    P.vx = U.damp(P.vx, tx, k, dt); P.vz = U.damp(P.vz, tz, k, dt);
    const kd = Math.exp(-6 * dt); P.kbx *= kd; P.kbz *= kd;
    const o = W.collide(P.x + (P.vx + P.kbx) * dt, P.z + (P.vz + P.kbz) * dt, P.r);
    P.x = W.clampX(o[0]); P.z = W.clampZ(o[1]);
    const spd = Math.hypot(P.vx, P.vz);
    P.moving = U.damp(P.moving, spd > 0.6 ? 1 : 0, 10, dt);
    let want = P.yaw;
    if (P.aimHold > 0) want = P.aimYaw; else if (spd > 0.6) want = Math.atan2(P.vx, P.vz);
    P.yaw += U.wrapAng(want - P.yaw) * Math.min(1, dt * 18);
    G.chests.drain(dt);   // Apostasy
    P.regenT += dt;
    if (P.regenT >= 5) { P.regenT -= 5; if (s.regen > 0 && P.hp < s.maxHp) PS.heal(s.regen, true); }
    // Living Flesh (talent): a share of max health back every second, healed smoothly
    if (s.fx.livingFlesh && P.hp < s.maxHp) {
      PS.heal(s.maxHp * s.fx.livingFlesh.regen * dt, false);
      if (Math.random() < dt * 4) F.rise(P.x, 0.6, P.z, 0x7dff7a, 1, 0.6, 1.6, 0.1, 0.6);
    }
    if (spd > 2 && Math.random() < dt * 6) F.dust(P.x, P.z, 1);

    // ----- animation -----
    if (P.moving > 0.05) P.phase += dt * (5 + spd * 1.3);
    const sw = Math.sin(P.phase) * P.moving;
    m.legL.rotation.x = sw * 0.75; m.legR.rotation.x = -sw * 0.75;
    m.hips.position.y = 0.62 + Math.abs(Math.cos(P.phase)) * 0.07 * P.moving + Math.sin(P.t * 2.2) * 0.012;
    m.hips.rotation.x = P.dashT > 0 ? 0.45 : P.moving * 0.08;
    m.tail.rotation.y = Math.sin(P.t * 2.4) * 0.45; m.tail.rotation.x = -0.15 + Math.sin(P.t * 1.7) * 0.12;
    m.head.rotation.z = Math.sin(P.t * 1.3) * 0.05;
    const ps = P.pose, h = m.holder;
    let armR = sw * 0.5, armL = -sw * 0.55;
    if (ps.melee && P.atkT > 0) {
      const kk = 1 - P.atkT / P.atkDur, e = 1 - Math.pow(1 - kk, 3);
      m.swing.rotation.y = U.lerp(-1.85, 1.85, e);
      h.position.set(...ps.atk[0]); h.rotation.set(...ps.atk[1]); h.scale.setScalar(1 + s.area * 0.7);
      armR = -1.45;
    } else {
      m.swing.rotation.y = U.damp(m.swing.rotation.y, 0, 14, dt);
      const [rp, rr] = ps.rest;
      h.position.set(U.damp(h.position.x, rp[0], 14, dt), U.damp(h.position.y, rp[1], 14, dt), U.damp(h.position.z, rp[2], 14, dt) - (ps.gun ? P.recoil * 0.1 : 0));
      h.rotation.set(U.damp(h.rotation.x, rr[0] - (ps.gun ? P.recoil * 0.6 : 0), 14, dt), U.damp(h.rotation.y, rr[1], 14, dt), U.damp(h.rotation.z, rr[2], 14, dt));
      h.scale.setScalar(U.damp(h.scale.x, 1, 10, dt));
    }
    if (ps.gun) { armR = -1.5; if (ps.twoHanded) armL = -1.25; }
    if (ps.toss && P.atkT > 0) armR = U.lerp(-2.7, 1.0, P.atkT / P.atkDur);
    m.armR.rotation.x = U.damp(m.armR.rotation.x, armR, P.atkT > 0 ? 40 : 12, dt);
    m.armL.rotation.x = U.damp(m.armL.rotation.x, armL, 12, dt);
    P.root.position.set(P.x, 0, P.z); P.root.rotation.y = P.yaw;
    const hurt = P.hurtT > 0 ? 0.7 : 0, blink = P.invuln > 0.15 && P.dashT <= 0 ? 0.25 : 0;
    m.mat.emissive.setRGB(hurt + blink, blink * 0.8, blink * 0.5);
    statusFx(P.x, 0, P.z, 0.6, P.status, dt);
  };

  PS.maxCharges = () => 1 + Math.max(0, Math.round(G.stats.dashCharges));
  // Dash cooldown bar under the cat: fills while recharging, then flashes and fades once ready.
  // With extra dash charges, a pip per charge sits above it.
  PS.drawOverlay = function (c, dpr) {
    if (P.dead || !P.root.visible || P.dashCdMax <= 0 || P.dashCd < -0.35) return;
    const s = F.project(P.x, 0, P.z);
    if (!s) return;
    const w = 38 * dpr, h = 5 * dpr, x = Math.round(s.x - w / 2), y = Math.round(s.y + 10 * dpr);
    const maxC = PS.maxCharges(), ready = P.charges >= maxC, k = ready ? 1 : 1 - Math.max(0, P.dashCd) / P.dashCdMax;
    if (maxC > 1) {
      const pw = (w - (maxC - 1) * 2 * dpr) / maxC;
      for (let i = 0; i < maxC; i++) { c.fillStyle = '#120a06'; c.fillRect(x + i * (pw + 2 * dpr) - dpr, y - 5 * dpr, pw + 2 * dpr, 4 * dpr); c.fillStyle = i < P.charges ? '#fff3c4' : '#2a221d'; c.fillRect(x + i * (pw + 2 * dpr), y - 4 * dpr, pw, 2 * dpr); }
    }
    c.globalAlpha = ready ? Math.max(0, 1 + P.dashCd / 0.35) : 1;
    c.fillStyle = '#120a06'; c.fillRect(x - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
    c.fillStyle = '#2a221d'; c.fillRect(x, y, w, h);
    c.fillStyle = ready ? '#fff3c4' : '#f2c04e'; c.fillRect(x, y, Math.round(w * k), h);
    c.globalAlpha = 1;
  };

  // Particles for active statuses on anything: sparks for shock, frost for slow, vines for root,
  // circling stars for stun.
  function statusFx(x, y, z, r, st, dt) {
    if (st.shock && Math.random() < dt * 10) F.glow.add(x + U.rnd(-r, r), y + 0.4 + Math.random() * 1.2, z + U.rnd(-r, r), U.rnd(-2, 2), U.rnd(-1, 2), U.rnd(-2, 2), 0.15, 0.12, 0xffe14a, 0, 4);
    if (st.slow && Math.random() < dt * 6) F.rise(x, y + 0.2, z, 0x9fd8ff, 1, r * 2, 0.6, 0.1, 0.8);
    if (st.root && Math.random() < dt * 8) F.solid.add(x + U.rnd(-r, r), y + 0.05, z + U.rnd(-r, r), 0, 1.2, 0, 0.5, 0.12, 0x5a8a2a, 0, 2);
    if (st.stun && Math.random() < dt * 12) { const a = G.time * 8 + Math.random() * 6; F.glow.add(x + Math.cos(a) * 0.5, y + 1.6 + r, z + Math.sin(a) * 0.5, -Math.sin(a) * 2, 0, Math.cos(a) * 2, 0.3, 0.14, 0xffe080, 0, 1); }
  }

  // =====================================================================
  // Enemies
  // =====================================================================
  const ES = G.enemySys = { list: [] };
  const _base = new T.Matrix4(), _loc = new T.Matrix4(), _out = new T.Matrix4(), _q = new T.Quaternion(), _q2 = new T.Quaternion();
  const _eu = new T.Euler(0, 0, 0, 'YXZ'), _eu2 = new T.Euler(), _pos = new T.Vector3(), _scl = new T.Vector3(), _one = new T.Vector3(1, 1, 1), _tint = new T.Color();

  // One instanced renderer per enemy type (golem models are full hierarchies instead).
  function Renderer(def) {
    this.cap = def.max; this.n = 0; this.tint = def.tint;
    this.parts = M.enemyParts(def.model).map((p) => {
      const mesh = M.inst(p.geo, p.glow ? M.matBI : M.matLI, def.max);
      G.scene.add(mesh);
      return { name: p.name, mesh, pivot: p.pivot ? new T.Vector3(...p.pivot) : null };
    });
  }
  function partRot(name, e) {
    _eu2.set(0, 0, 0);
    const s = Math.sin(e.phase);
    if (name === 'legFL' || name === 'legBR') _eu2.x = s * 0.8;
    else if (name === 'legFR' || name === 'legBL') _eu2.x = -s * 0.8;
    else if (name === 'wingL') _eu2.z = e.state === 'dive' ? -0.7 : s * 0.9 + 0.1;
    else if (name === 'wingR') _eu2.z = e.state === 'dive' ? 0.7 : -(s * 0.9 + 0.1);
    else if (name === 'armR' && e.aimT > 0) _eu2.x = -1.5;   // shooters raise the arm that fires
    else if (name === 'tip') { _eu2.x = e.bend || 0; _eu2.z = Math.sin(e.phase * 0.7) * 0.12; }   // eldritch tentacles bend to slam
    else if (name.startsWith('cleg')) { const k = name[4] === '0' ? s : -s; _eu2.y = k * 0.5; _eu2.z = Math.max(0, k) * 0.35 * (name[5] === 'L' ? 1 : -1); }   // void crawlers: two tripods of legs
    else if ((name === 'armL' || name === 'armR') && e.flurry > 0) _eu2.x = -1.4 - Math.abs(Math.sin(e.armPhase + (name === 'armL' ? 0 : 1.6))) * 1.2;   // Cthulhu's flurry
    else if (name === 'legL' || name === 'armR') _eu2.x = s * 0.6;
    else if (name === 'legR' || name === 'armL') _eu2.x = -s * 0.6;
    return _eu2;
  }
  Renderer.prototype.push = function (e) {
    if (this.n >= this.cap) return;
    const i = this.n++, model = e.def.model;
    let s = e.scale, sy = 1, sxz = 1, y = e.y;
    if (e.dying > 0) { const k = e.dying / 0.3; s *= Math.max(0.01, k); y -= (1 - k) * 0.3; }
    if (model === 'pumpkin' || model === 'blob') { const h = Math.sin(e.hop || 0); sy = h > 0 ? 1 + h * 0.08 : 1 + h * 0.16; sy *= 1 + (e.spit || 0) * 0.15; sxz = 1 / Math.sqrt(sy); }
    if (model === 'dog') y += Math.abs(Math.sin(e.phase)) * 0.06;
    _eu.set(e.pitch || 0, e.yaw, e.roll || 0); _q.setFromEuler(_eu);
    _pos.set(e.x, y, e.z); _scl.set(s * sxz, s * sy, s * sxz);
    _base.compose(_pos, _q, _scl);
    const f = 1 + e.flash * 26;
    let r = f, g = f, b = f;
    if (this.tint) { r *= this.tint[0]; g *= this.tint[1]; b *= this.tint[2]; }
    if (e.alien) { const p = e.invader ? 1 + Math.sin(G.time * 5 + e.seed * 9) * 0.2 : 1; r *= 0.55; g *= 1.8 * p; b *= 0.55; }
    if (e.st.slow) { r *= 0.75; g *= 0.95; b *= 1.4; }
    if (e.st.shock && Math.sin(G.time * 22 + e.seed * 40) > 0.55) { r *= 1.6; g *= 1.6; b *= 0.8; }
    if (e.st.stun) { r *= 0.7; g *= 0.7; b *= 0.7; }
    if (e.poison.length) { r *= 0.72; g *= 1.3; b *= 0.62; }
    if (e.bleed.length) { r *= 1.25; g *= 0.8; b *= 0.8; }
    if (e.elite) { const p = 1 + Math.sin(G.time * 6 + e.seed * 9) * 0.15; r *= 1.5 * p; g *= 1.22 * p; b *= 0.55; }
    if (e.dying > 0) { r = 3; g = 0.7; b = 0.5; }
    _tint.setRGB(r, g, b);
    for (const part of this.parts) {
      if (part.pivot) {
        _q2.setFromEuler(partRot(part.name, e));
        _loc.compose(part.pivot, _q2, _one);
        part.mesh.setMatrixAt(i, _out.multiplyMatrices(_base, _loc));
      } else part.mesh.setMatrixAt(i, _base);
      part.mesh.setColorAt(i, _tint);
    }
  };
  Renderer.prototype.begin = function () { this.n = 0; };
  Renderer.prototype.end = function () {
    for (const p of this.parts) { p.mesh.count = this.n; p.mesh.instanceMatrix.needsUpdate = true; if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true; }
  };

  // ----- spatial grid -----
  // It covers 210 m around its centre: the farm, or the dungeon while you are inside one.
  const CELL = 2.5, GN = 84, HALF = (GN * CELL) / 2, cells = [], used = [];
  for (let i = 0; i < GN * GN; i++) cells.push([]);
  let gx = 0, gz = 0;
  ES.gridCenter = (x, z) => { gx = x; gz = z; };
  const cell = (v) => { const c = Math.floor((v + HALF) / CELL); return c < 0 ? 0 : c >= GN ? GN - 1 : c; };
  const cix = (x) => cell(x - gx), ciz = (z) => cell(z - gz);
  ES.gridBuild = function () {
    for (const i of used) cells[i].length = 0;
    used.length = 0;
    for (const e of ES.list) {
      if (e.dead) continue;
      const i = ciz(e.z) * GN + cix(e.x);
      if (!cells[i].length) used.push(i);
      cells[i].push(e);
    }
  };
  ES.query = function (x, z, r, cb) {
    const x0 = cix(x - r), x1 = cix(x + r), z0 = ciz(z - r), z1 = ciz(z + r);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) { const c = cells[cz * GN + cx]; for (let k = 0; k < c.length; k++) cb(c[k]); }
  };
  ES.nearest = function (x, z, maxR, exclude) {
    let best = null, bd = maxR * maxR;
    for (const e of ES.list) {
      if (e.dead || e.dormant || (exclude && exclude.includes(e.id))) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };
  ES.bossAlive = () => ES.list.some((e) => e.boss && !e.dead);

  ES.init = function () {
    ES.R = {};
    for (const id in G.ENEMIES) if (!G.BOSS_MODELS.includes(G.ENEMIES[id].model)) ES.R[id] = new Renderer(G.ENEMIES[id]);
    // Shrouded (modifier): a purple circle on the ground around the monster
    const rg = new T.RingGeometry(0.93, 1, 40, 1); rg.rotateX(-Math.PI / 2);
    ES.shroudMesh = new T.InstancedMesh(rg, new T.MeshBasicMaterial({ color: 0xb86cff, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }), 64);
    // Holy fire (The Bible): the golden circle around every burning monster that spreads it
    ES.haloMat = new T.MeshBasicMaterial({ color: 0xffe080, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
    ES.haloMesh = new T.InstancedMesh(rg, ES.haloMat, 300);
    G.scene.add(ES.shroudMesh, ES.haloMesh);
    SH.init();
  };

  // Rare monster modifiers (data/monster_modifiers.json). Effects from several modifiers add up.
  function applyMods(e, mods) {
    const f = {};
    for (const m of mods) for (const k in m.effects) {
      const v = m.effects[k];
      if (k === 'inflicts') { for (const id in v) e.inflicts[id] = Math.min(1, Math.max(e.inflicts[id] || 0, v[id])); }
      else f[k] = typeof v === 'boolean' ? f[k] || v : (f[k] || 0) + (+v || 0);
    }
    e.mods = mods; e.modColors = mods.map((m) => m.hex);
    e.maxHp *= 1 + (f.hp || 0); e.dmg *= 1 + (f.damage || 0); e.speed *= 1 + (f.speed || 0);
    e.scale *= 1 + (f.size || 0); e.mass *= 1 + (f.size || 0);
    e.armor = U.clamp(f.armor || 0, 0, 0.75); e.regen = f.regen || 0; e.healOnHit = f.healOnHit || 0; e.atkSpd = f.attackSpeed || 0;
    e.extraBoulders = Math.round(f.boulders || 0); e.extraSummons = Math.round(f.summons || 0); e.slamR = f.slamRadius || 0;
    e.lavaTrail = f.lavaTrail || 0; e.deathBlast = f.deathBlast || 0; e.dotImmune = !!f.dotImmune;
    e.pulse = f.pulse || 0;
    e.shamanic = f.shamanic || 0; e.shamT = 2 + Math.random() * 2;
    e.shroud = f.shroud ? f.shroud * Math.max(1, e.scale) : 0;
    if (f.anchor) e.abilities = Object.assign({}, e.abilities, { anchor: G.ABILITIES.anchor });
  }

  let idSeq = 0;
  // o: { elite, hpMul, sizeMul, mods, alien }
  // A monster heals n (show: a number over it). Poisoned Chalice (talent): while it carries your poison
  // the healing hurts it instead, dealt with its next poison tick (combat.js).
  ES.heal = function (e, n, show) {
    if (e.dead || !(n > 0)) return;
    if (G.stats.fx.poisonReversal && e.poison.length) { e.revAcc = (e.revAcc || 0) + n; return; }
    const h = Math.min(e.maxHp - e.hp, n);
    if (h <= 0) return;
    e.hp += h;
    if (show) F.num(e.x, 2.8 * e.scale + e.y, e.z, '+' + Math.round(h), '#ff7a8a', 15);
  };
  ES.spawn = function (type, x, z, o = {}) {
    const d = G.ENEMIES[type], danger = G.danger, el = o.elite ? G.ELITE : null;
    const e = {
      id: ++idSeq, type, def: d, x, z, y: d.flying ? 2.4 : 0, vx: 0, vz: 0, yaw: Math.atan2(P.x - x, P.z - z),
      maxHp: d.hp * G.diffHp() * (el ? el.hp : 1) * (o.hpMul || 1), dmg: d.dmg * G.diffDmg() * (el ? el.damage : 1),
      speed: d.speed * (1 + Math.min(danger, 8) * 0.04) * U.rnd(0.9, 1.1), scale: d.size * (el ? el.size : 1) * (o.sizeMul || 1),
      elite: !!el, boss: d.boss, xp: d.xp * (el ? el.xp : 1), mass: d.mass * (el ? el.mass : 1), flash: 0, kbx: 0, kbz: 0, atkCd: 0.6, poison: [], bleed: [],
      dotT: 0, pAcc: 0, bAcc: 0, phase: Math.random() * 6, t: 0, state: 'move', dead: false, dying: 0, seed: Math.random(),
      slideT: 0, slideDir: Math.random() < 0.5 ? -1 : 1, lungeCd: U.rnd(0.5, 2), lungeT: 0,
      armor: 0, regen: 0, healOnHit: 0, atkSpd: 0, extraBoulders: 0, extraSummons: 0, slamR: 0, lavaTrail: 0, lavaT: 0, deathBlast: 0, dotImmune: false, mods: null,
      st: {}, inflicts: Object.assign({}, d.inflicts), alien: !!o.alien, essence: d.essence * (el ? el.essence : 1),
      pulse: 0, pulseT: 2.5, pulses: 0, abilities: Object.keys(d.abilities).length ? Object.assign({}, d.abilities) : null, abT: {},
    };
    if (o.mods && o.mods.length) applyMods(e, o.mods);
    for (const k in e.abilities || {}) e.abT[k] = U.rnd(e.abilities[k].every[0], e.abilities[k].every[1]) * 0.5 + 3;
    e.r = d.radius * e.scale;
    e.hp = e.maxHp;
    // Pack calls happen at evenly spaced health thresholds (one call = at 50%).
    const ns = d.summons + e.extraSummons;
    e.summonAt = [];
    for (let i = 1; i <= ns; i++) e.summonAt.push(1 - i / (ns + 1));
    if (d.ai === 'crow') { e.state = 'climb'; e.t = 0.8; e.dvx = Math.sign(P.x - x) * 0.3; e.dvz = Math.sign(P.z - z) * 0.3; e.y = 1.4; }
    if (d.ai === 'pumpkin' || d.ai === 'shooter' || d.ai === 'eye') { e.rangedCd = U.rnd(1.5, 3); e.hop = Math.random() * 6; }
    if (d.ai === 'blob' || d.ai === 'frog') e.hop = Math.random() * 6;
    if (d.summon) e.sumT = U.rnd(d.summon.every[0], d.summon.every[1]) * 0.6;
    if (G.BOSS_MODELS.includes(d.model)) { e.model = M.boss(d.model, d.colors); G.scene.add(e.model.root); }
    ES.list.push(e);
    return e;
  };

  function updDog(e, dt, dx, dz, dist) {
    e.lungeCd -= dt;
    let sp = e.speed;
    if (e.lungeT > 0) { e.lungeT -= dt; sp *= 2.1; }
    else if (dist < 4.2 && e.lungeCd <= 0) { e.lungeT = 0.35; e.lungeCd = U.rnd(2, 3.2); if (Math.random() < 0.25) A.play('bark'); }
    e.phase += dt * sp * 2.2;
    const wob = Math.sin(G.time * 3 + e.seed * 10) * 0.35, nx = dx / dist, nz = dz / dist;
    return [(nx - nz * wob) * sp, (nz + nx * wob) * sp];
  }
  function updCrow(e, dt, dx, dz, dist) {
    e.t -= dt;
    e.phase += dt * (e.state === 'dive' ? 4 : 15);
    if (e.state === 'circle') {
      e.orbit += dt * 1.25 * (e.seed < 0.5 ? 1 : -1);
      const tx = P.x + Math.cos(e.orbit) * 5.5, tz = P.z + Math.sin(e.orbit) * 5.5, ddx = tx - e.x, ddz = tz - e.z, l = Math.hypot(ddx, ddz) || 1;
      e.y = U.damp(e.y, 2.6 + Math.sin(G.time * 2 + e.seed * 9) * 0.3, 3, dt); e.pitch = U.damp(e.pitch || 0, 0, 5, dt);
      if (e.t <= 0 && dist < 12) { e.state = 'dive'; e.t = 1.1; e.dvx = dx / dist; e.dvz = dz / dist; if (Math.random() < 0.2) A.play('caw'); }
      return [ddx / l * e.speed, ddz / l * e.speed];
    }
    if (e.state === 'dive') {
      e.y = U.damp(e.y, 0.85, 6, dt); e.pitch = U.damp(e.pitch || 0, 0.45, 8, dt);
      if (e.t <= 0) { e.state = 'climb'; e.t = 0.8; }
      return [e.dvx * e.speed * 1.75, e.dvz * e.speed * 1.75];
    }
    e.y = U.damp(e.y, 2.7, 3, dt); e.pitch = U.damp(e.pitch || 0, -0.35, 6, dt);
    if (e.t <= 0) { e.state = 'circle'; e.t = U.rnd(1.4, 3); e.orbit = Math.atan2(e.z - P.z, e.x - P.x); }
    return [e.dvx * e.speed, e.dvz * e.speed];
  }
  function updPumpkin(e, dt, dx, dz, dist) {
    const R = e.def.ranged;
    e.rangedCd -= dt; e.spit = Math.max(0, (e.spit || 0) - dt * 3);
    e.hop += dt * 4.4;
    const up = Math.max(0, Math.sin(e.hop));
    e.y = up * 0.55;
    if (dist < R.range && e.rangedCd <= 0 && !P.dead) {
      e.rangedCd = R.cooldown * U.rnd(0.85, 1.15) / (1 + e.atkSpd); e.spit = 1;
      const lead = dist / R.speed * 0.5;
      SH.seed(e.x, 1.6 * e.scale + e.y, e.z, P.x + P.vx * lead, P.z + P.vz * lead, R.speed, R.damage * G.diffDmg() * (e.elite ? G.ELITE.damage : 1) * (e.dmgMul || 1), e);
      A.play('spit');
    }
    const sp = e.speed * (up > 0.05 ? 1.6 : 0.15) * (dist < 5 ? 0.6 : 1);
    return [dx / dist * sp, dz / dist * sp];
  }

  // Tall greens keep their distance, strafe and fire bolts.
  function updShooter(e, dt, dx, dz, dist) {
    const R = e.def.ranged;
    e.rangedCd -= dt; e.aimT = (e.aimT || 0) - dt; e.phase += dt * e.speed * 1.6;
    if (dist < R.range && e.rangedCd <= 0 && !P.dead) {
      e.rangedCd = R.cooldown * U.rnd(0.85, 1.15) / (1 + e.atkSpd); e.aimT = 0.4;
      const lead = dist / R.speed * 0.5, tx = P.x + P.vx * lead, tz = P.z + P.vz * lead, base = Math.atan2(tx - e.x, tz - e.z), n = R.count || 1;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * R.spread;
        SH.seed(e.x, 1.5 * e.scale, e.z, e.x + Math.sin(a) * 10, e.z + Math.cos(a) * 10, R.speed, R.damage * G.diffDmg() * (e.elite ? G.ELITE.damage : 1) * (e.dmgMul || 1), e, R.kind || 'bolt');
      }
      A.play(R.kind === 'hex' ? 'hex' : 'zap');
    }
    const want = R.range * 0.65, nx = dx / dist, nz = dz / dist, side = e.seed < 0.5 ? 0.5 : -0.5;
    const k = dist > want + 1.5 ? 1 : dist < want - 2 ? -0.7 : 0;
    return [(nx * k - nz * side) * e.speed, (nz * k + nx * side) * e.speed];
  }
  // Blobs bounce at you, moving only while airborne.
  function updBlob(e, dt, dx, dz, dist) {
    e.hop += dt * 3.6;
    const up = Math.max(0, Math.sin(e.hop)), sp = e.speed * (up > 0.05 ? 1.7 : 0.1);
    e.y = up * 0.5 * e.scale;
    return [dx / dist * sp, dz / dist * sp];
  }
  // Mosquitos buzz straight at you, weaving side to side.
  function updMosquito(e, dt, dx, dz, dist) {
    e.phase += dt * 40;
    e.y = U.damp(e.y, 1.0 + Math.sin(G.time * 6 + e.seed * 20) * 0.25, 4, dt);
    const nx = dx / dist, nz = dz / dist, j = Math.sin(G.time * 9 + e.seed * 30) * 0.8;
    return [(nx - nz * j) * e.speed, (nz + nx * j) * e.speed];
  }

  // ----- The Unexplainable -----
  // Ghosts drift at you through walls, swaying and bobbing.
  function updGhost(e, dt, dx, dz, dist) {
    e.phase += dt * 3;
    e.y = U.damp(e.y, 0.6 + Math.sin(G.time * 2.5 + e.seed * 20) * 0.25, 3, dt);
    const nx = dx / dist, nz = dz / dist, j = Math.sin(G.time * 1.6 + e.seed * 30) * 0.5;
    return [(nx - nz * j) * e.speed, (nz + nx * j) * e.speed];
  }
  // Giant snails crawl at you and leave slime that slows you.
  function updSnail(e, dt, dx, dz, dist) {
    e.phase += dt * 2;
    const Tr = e.def.trail;
    if (Tr && (e.trailT = (e.trailT || 0) - dt) <= 0) {
      e.trailT = Tr.every;
      SH.slime(e.x - Math.sin(e.yaw) * 0.9 * e.scale, e.z - Math.cos(e.yaw) * 0.9 * e.scale, Tr.radius * e.scale, Tr.life);
    }
    return [dx / dist * e.speed, dz / dist * e.speed];
  }
  // Toxic frogs leap at you, moving only in the air.
  function updFrog(e, dt, dx, dz, dist) {
    e.hop += dt * 2.8; e.phase = e.hop;
    const up = Math.max(0, Math.sin(e.hop)), sp = e.speed * (up > 0.05 ? 1.9 : 0);
    e.y = up * 0.9 * e.scale;
    return [dx / dist * sp, dz / dist * sp];
  }
  // Summoners (cultists) and cauldrons: a new monster every few seconds while fewer than summon.max of
  // theirs are alive. Ids in summon.rare come out as rare monsters with modifiers.
  function summonTick(e, dt) {
    const S = e.def.summon;
    if (!S || G.phase !== 'fight' || e.state === 'emerge' || (e.sumT -= dt) > 0) return;
    e.sumT = U.rnd(S.every[0], S.every[1]);
    if (ES.list.filter((o) => o.parent === e.id && !o.dead).length >= S.max) return;
    const type = U.weighted(Object.keys(S.weights), (k) => S.weights[k]), rare = S.rare.includes(type);
    const a = Math.random() * Math.PI * 2, r = e.r + 0.8;
    const k = ES.spawn(type, e.x + Math.sin(a) * r, e.z + Math.cos(a) * r, rare ? { mods: G.rollModifiers(G.rareModCount(G.danger), G.danger, G.ENEMIES[type].ai), hpMul: 3, sizeMul: 1.2 } : {});
    k.parent = e.id; k.kbx = Math.sin(a) * 6; k.kbz = Math.cos(a) * 6;
    if (rare) { k.rareMob = true; k.essence *= 3; k.xp *= 3; }
    F.burst(k.x, 1 + k.y, k.z, { n: 10, color: [0xb86cff, 0xe0c8ff], glow: true, speed: 4, life: 0.5, size: 0.16 });
    A.play('summon');
  }
  // Cultists keep far away and summon ghosts until killed.
  function updSummoner(e, dt, dx, dz, dist) {
    e.phase += dt * e.speed * 1.6;
    summonTick(e, dt);
    if (Math.random() < dt * 4) F.rise(e.x, 1.6 * e.scale, e.z, 0xb86cff, 1, 0.3, 1.2, 0.1, 0.6);
    const want = 15, nx = dx / dist, nz = dz / dist, side = e.seed < 0.5 ? 0.4 : -0.4;
    const k = dist > want + 2 ? 1 : dist < want - 2 ? -1 : 0;
    return [(nx * k - nz * side) * e.speed, (nz * k + nx * side) * e.speed];
  }
  // Cauldrons never move: they bubble and spew monsters until destroyed.
  function updCauldron(e, dt) {
    e.lockYaw = true;
    summonTick(e, dt);
    if (Math.random() < dt * 6) F.rise(e.x + U.rnd(-0.5, 0.5) * e.scale, 1.7 * e.scale, e.z + U.rnd(-0.5, 0.5) * e.scale, 0x8aef4a, 1, 0.3, 1.6, 0.14, 0.8);
    return [0, 0];
  }
  // Ritual witch doctors stand still around the sigil, arms raised, channelling into its centre.
  function updRitual(e, dt) {
    const c = e.ritual || e;
    e.lockYaw = true; e.yaw = Math.atan2(c.x - e.x, c.z - e.z); e.aimT = 1; e.phase += dt * 3;
    if (Math.random() < dt * 14) F.streak(e.x, 1.9 * e.scale, e.z, c.x, 0.6, c.z, 0xb86cff, 0.2, 0.08);
    return [0, 0];
  }

  // ----- bosses (golem ai: golem, the heap, the mutated stag) -----
  function updGolem(e, dt, dx, dz, dist) {
    const enr = e.hp < e.maxHp * 0.3, wm = (enr ? 0.75 : 1) / (1 + e.atkSpd), nx = dx / dist, nz = dz / dist;
    e.t -= dt;
    e.phase += dt * (e.state === 'charge' ? 9 : 3.4) * (e.walkAmt || 0);
    switch (e.state) {
      case 'emerge':
        e.walkAmt = e.rise ? 0 : 1;
        if (e.rise && Math.random() < dt * 25) F.dust(e.x + U.rnd(-2, 2), e.z + U.rnd(-2, 2), 2);
        if (e.t <= 0) { e.state = 'walk'; e.t = 1.2; }
        return [e.fx * e.speed * 0.8, e.fz * e.speed * 0.8];
      case 'walk':
        e.walkAmt = 1; e.lockYaw = false;
        if (e.summonAt.length && e.hp < e.maxHp * e.summonAt[0]) {
          e.summonAt.shift(); e.state = 'roar'; e.t = 1.3; e.walkAmt = 0;
          A.play('roar'); F.shake(0.45); G.spawner.summonPack(e); G.ui.toast(`The ${e.def.name.toLowerCase()} calls its pack!`, '#ff8a4a');
          return [0, 0];
        }
        if (e.t <= 0) {
          const r = Math.random();
          e.walkAmt = 0;
          if (dist < 7.5 * (1 + e.slamR) && r < 0.6) {
            e.state = 'slam_wind'; e.t = e.wind = 1.05 * wm;
            e.tele = F.telegraph(e.x, e.z, 6.5 * e.scale * (1 + e.slamR), e.t);
          } else if (dist > 6 && r < 0.55) {
            e.state = 'throw_wind'; e.t = e.wind = 0.6 * wm;
          } else {
            e.state = 'charge_wind'; e.t = e.wind = 0.85 * wm; e.cx = nx; e.cz = nz; e.lockYaw = true; e.yaw = Math.atan2(nx, nz);
            e.tele = F.teleLine(e.x, e.z, e.yaw, 18, 3.6 * e.scale, e.t);
          }
          return [0, 0];
        }
        return [nx * e.speed * (enr ? 1.3 : 1), nz * e.speed * (enr ? 1.3 : 1)];
      case 'slam_wind':
        if (e.t <= 0) {
          const R = 6.5 * e.scale * (1 + e.slamR);
          if (Math.hypot(P.x - e.x, P.z - e.z) < R + P.r) PS.damage(e.dmg * 1.6, e);
          F.ring(e.x, e.z, { r0: 1, r1: R + 1, life: 0.5, color: 0xffb070 });
          F.burst(e.x, 0.4, e.z, { n: 22, color: e.def.debris, speed: 9, life: 1, size: 0.35, up: 0.9 });
          F.dust(e.x, e.z, 12); F.shake(0.6); A.play('slam');
          e.state = 'slam_rec'; e.t = 0.7 * wm;
        }
        return [0, 0];
      case 'throw_wind':
        if (e.t <= 0) {
          const n = (enr ? 4 : 3) + e.extraBoulders;
          for (let i = 0; i < n; i++) {
            const ox = i ? U.rnd(-3.5, 3.5) : 0, oz = i ? U.rnd(-3.5, 3.5) : 0;
            SH.boulder(e.x, 4.4 * e.scale, e.z, W.clampX(P.x + ox + P.vx * 0.5), W.clampZ(P.z + oz + P.vz * 0.5), 1.1 + i * 0.16, e.dmg, e, e.def.boulderAcid);
          }
          A.play('throw'); e.state = 'throw_rec'; e.t = 0.6 * wm;
        }
        return [0, 0];
      case 'charge_wind':
        if (e.t <= 0) { e.state = 'charge'; e.t = 1.15; e.hitDone = false; e.bumped = false; e.walkAmt = 1; A.play('thud'); }
        return [0, 0];
      case 'charge':
        if (!e.hitDone && dist < e.r + P.r + 0.4) { e.hitDone = true; PS.damage(e.dmg * 1.4, e); F.shake(0.4); }
        if (Math.random() < dt * 20) F.dust(e.x, e.z, 2);
        if (e.t <= 0 || e.bumped || !W.inBounds(e.x, e.z, 3)) {
          if (e.bumped) { F.shake(0.4); A.play('thud'); }
          e.state = 'charge_rec'; e.t = 0.9 * wm; e.walkAmt = 0;
          return [0, 0];
        }
        return [e.cx * 15, e.cz * 15];
      case 'slam_rec': case 'throw_rec': case 'charge_rec': case 'roar':
        if (e.t <= 0) { e.state = 'walk'; e.t = U.rnd(2, 3.2) * wm; }
        return [0, 0];
    }
    return [0, 0];
  }
  // ----- the Eldritch Gaze's crater (gaze.js) -----
  // Eldritch eyes float in, keep their distance and fire violet hexes, bobbing in the air.
  function updEye(e, dt, dx, dz, dist) {
    const v = updShooter(e, dt, dx, dz, dist);
    e.y = 2.3 + Math.sin(G.time * 1.3 + e.seed * 6) * 0.3;
    e.pitch = -0.6;   // tilted up, so the iris shows to the camera from every side
    if (Math.random() < dt * 6) F.rise(e.x + U.rnd(-0.6, 0.6) * e.scale, e.y - 0.6, e.z + U.rnd(-0.6, 0.6) * e.scale, 0xb86cff, 1, 0.3, 1.4, 0.12, 0.7);
    return v;
  }
  // Voidlings shamble at you, slow and swaying.
  function updVoidling(e, dt, dx, dz, dist) {
    e.phase += dt * e.speed * 1.4;
    const nx = dx / dist, nz = dz / dist, j = Math.sin(G.time * 1.3 + e.seed * 20) * 0.35;
    return [(nx - nz * j) * e.speed, (nz + nx * j) * e.speed];
  }
  // Void crawlers skitter at you low to the ground in zigzag bursts, and now and then slip through the
  // void: they vanish in a puff of black and come out a few meters closer.
  function updCrawler(e, dt, dx, dz, dist) {
    if (e.blinkCd == null) e.blinkCd = U.rnd(2, 5);
    if ((e.blinkCd -= dt) <= 0 && dist > 5 && dist < 18 && !P.dead) {
      e.blinkCd = U.rnd(4, 7);
      const step = Math.min(dist - 2.5, U.rnd(3.5, 6)), nx = dx / dist, nz = dz / dist, side = U.rnd(-1.5, 1.5);
      const tx = W.clampX(e.x + nx * step - nz * side), tz = W.clampZ(e.z + nz * step + nx * side);
      if (!W.blocked(tx, tz, e.r)) {
        const puff = (x, z) => F.burst(x, 0.4, z, { n: 8, color: [0x1a0a24, 0xb86cff, 0x05030a], speed: 3, life: 0.5, size: 0.18 * e.scale, grav: -1, drag: 3 });
        puff(e.x, e.z); e.x = tx; e.z = tz; puff(tx, tz);
        if (Math.random() < 0.3) A.play('blink');
      }
    }
    const go = (G.time * 1.6 + e.seed * 7) % 1 < 0.7 ? 1.35 : 0.25, nx = dx / dist, nz = dz / dist, j = Math.sin(G.time * 7 + e.seed * 30) * 0.7;
    e.phase += dt * e.speed * 3 * go;
    return [(nx - nz * j) * e.speed * go, (nz + nx * j) * e.speed * go];
  }
  // Eldritch tentacles never move. They slam down where you stand (a telegraphed circle), and every few
  // seconds they let out an Eldritch Gurgle that stuns you wherever you are, until they are killed.
  function updTentacle(e, dt, dx, dz, dist) {
    const Z = G.GAZE, TT = Z.tentacle;
    e.lockYaw = true; e.phase += dt * 2.2;
    e.yaw += U.wrapAng(Math.atan2(e.slam ? e.slam.x - e.x : dx, e.slam ? e.slam.z - e.z : dz) - e.yaw) * Math.min(1, dt * 4);
    if (e.slamCd == null) { e.slamCd = 1.2; e.gurgleT = Z.gurgleEvery; e.bend = 0; }
    e.slamCd -= dt;
    if (e.slam) {
      const S = e.slam;
      S.t -= dt;
      e.bend = U.damp(e.bend, -0.6, 6, dt);   // rears back
      if (S.t <= 0) {
        e.bend = 1.35;   // and smashes down
        if (!P.dead && Math.hypot(P.x - S.x, P.z - S.z) < S.r + P.r) PS.damage(e.dmg * TT.damage, e);
        F.ring(S.x, S.z, { r0: 0.4, r1: S.r + 0.6, life: 0.4, color: 0xb86cff }); F.dust(S.x, S.z, 8); F.shake(0.3); A.play('slam');
        e.slam = null; e.slamCd = TT.every / (1 + e.atkSpd);
      }
    } else {
      e.bend = U.damp(e.bend, Math.sin(e.phase) * 0.12, 3, dt);
      if (e.slamCd <= 0 && !P.dead && dist < TT.reach * e.scale) {
        const lead = 0.35, tx = P.x + P.vx * lead, tz = P.z + P.vz * lead, ox = tx - e.x, oz = tz - e.z, d = Math.hypot(ox, oz) || 1, k = Math.min(1, TT.reach * e.scale / d);
        e.slam = { x: e.x + ox * k, z: e.z + oz * k, r: TT.radius, t: TT.wind };
        F.telegraph(e.slam.x, e.slam.z, TT.radius, TT.wind, 0xb86cff);
      }
    }
    // the gurgle: a warning, then you are stunned
    e.gurgleT -= dt;
    if (!e.gurgleWarn && e.gurgleT <= Z.gurgleWarn) {
      e.gurgleWarn = true; A.play('gurgle');
      F.num(e.x, 5.2 * e.scale, e.z, 'ELDRITCH GURGLE…', '#d080ff', 16); F.ring(e.x, e.z, { r0: 0.5, r1: 6, life: Z.gurgleWarn, color: 0x8a3ab8 });
    }
    if (e.gurgleT <= 0) {
      e.gurgleT = Z.gurgleEvery; e.gurgleWarn = false;
      if (!P.dead) { PS.addStatus('stun', Z.gurgleStun); F.flash('#3a0a4a', 0.35); F.streak(e.x, 4 * e.scale, e.z, P.x, 1, P.z, 0xd080ff, 0.3, 0.2); }
    }
    if (Math.random() < dt * 5) F.rise(e.x + U.rnd(-1, 1), 0.2, e.z + U.rnd(-1, 1), 0x8a3ab8, 1, 0.4, 1.4, 0.14, 0.8);
    return [0, 0];
  }
  // Cthulhu never stops coming. Every few seconds it smashes a flurry of tentacles down around you: each
  // blow telegraphed, each one hurting and slowing you.
  function updCthulhu(e, dt, dx, dz, dist) {
    const B = G.GAZE.boss;
    e.phase += dt * e.speed * 1.1;
    if (e.smashT == null) e.smashT = 2.5;
    e.smashT -= dt;
    if (e.smashT <= 0 && !P.dead && dist < B.reach) {
      e.smashT = B.every / (1 + e.atkSpd);
      for (let i = 0; i < B.blows; i++) {
        const a = Math.random() * Math.PI * 2, r = i ? U.rnd(1.2, B.spread) : 0, lead = i ? 0 : 0.45;
        G.enemyShots.blast(W.clampX(P.x + P.vx * lead + Math.cos(a) * r), W.clampZ(P.z + P.vz * lead + Math.sin(a) * r), B.radius, B.wind + i * B.stagger, e.dmg * B.damage, e, 0x8a3ab8);
      }
      e.flurry = B.wind + B.blows * B.stagger;
      if (Math.random() < 0.5) A.play('roar');
    }
    if (e.flurry > 0) { e.flurry -= dt; e.armPhase = (e.armPhase || 0) + dt * 16; }
    if (Math.random() < dt * 8) F.rise(e.x + U.rnd(-1, 1) * e.r, 0.2, e.z + U.rnd(-1, 1) * e.r, 0x3a8a5a, 1, 0.5, 1.6, 0.18, 0.9);
    return [dx / dist * e.speed, dz / dist * e.speed];
  }
  const AI = { dog: updDog, crow: updCrow, pumpkin: updPumpkin, shooter: updShooter, blob: updBlob, mosquito: updMosquito, golem: updGolem,
    ghost: updGhost, snail: updSnail, frog: updFrog, summoner: updSummoner, cauldron: updCauldron, ritual: updRitual, eye: updEye,
    voidling: updVoidling, crawler: updCrawler, tentacle: updTentacle, cthulhu: updCthulhu };

  function golemModel(e, dt) {
    const m = e.model, w = Math.sin(e.phase) * (e.walkAmt || 0);
    let s = e.scale, y = e.y;
    if (e.state === 'emerge') {
      const k = 1 - Math.max(0, e.t) / 2.2;
      s *= 0.55 + 0.45 * k;
      if (e.rise) y -= (1 - k) * 4 * e.scale;   // altar golems climb out of the ground
    }
    if (e.dying > 0) { const k = e.dying / 1.2; y -= (1 - k) * 2.5; }
    m.root.position.set(e.x, y, e.z); m.root.rotation.y = e.yaw; m.root.scale.setScalar(s);
    const k = e.wind ? 1 - Math.max(0, e.t) / e.wind : 0;
    let aL = -w * 0.35, aR = w * 0.35, aZ = 0, tX = 0, tY = 0, hX = 0;
    if (e.state === 'slam_wind') { aL = aR = -2.8 * k; tX = -0.25 * k; }
    else if (e.state === 'slam_rec') { aL = aR = 0.5; tX = 0.35; }
    else if (e.state === 'throw_wind') { aR = -2.6 * k; tY = 0.35 * k; }
    else if (e.state === 'throw_rec') { aR = 0.9; tY = -0.2; }
    else if (e.state === 'charge_wind') { tX = 0.35 * k; aL = aR = 0.6 * k; }
    else if (e.state === 'charge') { tX = 0.45; aL = aR = 0.9; }
    else if (e.state === 'roar' || (e.state === 'emerge' && e.rise)) { tX = -0.35; aZ = 0.9; hX = -0.4; }
    const d = (o, prop, v) => { o[prop] = U.damp(o[prop], v, 12, dt); };
    d(m.armL.rotation, 'x', aL); d(m.armR.rotation, 'x', aR); d(m.armL.rotation, 'z', aZ); d(m.armR.rotation, 'z', -aZ);
    d(m.torso.rotation, 'x', tX); d(m.torso.rotation, 'y', tY); d(m.head.rotation, 'x', hX);
    m.legL.rotation.x = w * 0.45; m.legR.rotation.x = -w * 0.45;
    const f = e.flash > 0 ? e.flash * 6 : 0;
    m.mat.emissive.setRGB(f, f * 0.85, f * 0.7);
    const enr = e.hp < e.maxHp * 0.3, p = Math.sin(G.time * 10);
    if (e.mods) m.glowMat.color.setScalar(enr ? 1.25 + p * 0.45 : 1);
    else m.glowMat.color.setRGB(1, enr ? 0.35 + p * 0.15 : 1, enr ? 0.3 : 1);
  }

  ES.screamT = 8;
  ES.update = function (dt) {
    ES.gridBuild();
    // a muffled scream from somewhere among the monsters, more often as the night goes on
    if ((ES.screamT -= dt) <= 0) {
      ES.screamT = U.rnd(9, 20) * (1 - 0.6 * Math.min(1, G.dayT / G.DAY_SECONDS));
      if (G.phase === 'fight' && ES.list.length > 5) A.play('scream', U.rnd(0.8, 1.25));
    }
    const aura = G.stats.fx.slowAura;   // Cold Shoulder (talent): monsters near you move slower
    for (const e of ES.list) {
      if (e.dead) { e.dying -= dt; continue; }
      e.flash = Math.max(0, e.flash - dt);
      // health bar smoothing: the bar eases toward the real health, the pale chunk behind it follows slower
      const hf = e.hp / e.maxHp;
      e.hpF = e.hpF == null ? hf : U.damp(e.hpF, hf, 14, dt);
      e.hpL = e.hpL == null || e.hpL < hf ? hf : U.damp(e.hpL, hf, 2.2, dt);
      for (const id in e.st) if ((e.st[id] -= dt) <= 0) delete e.st[id];
      if (e.dummy) { if (e.st.shock || e.st.slow || e.st.root || e.st.stun) statusFx(e.x, e.y, e.z, e.r, e.st, dt); continue; }
      // dungeon packs wait in their room until you come in or hurt one of them
      if (e.dormant && !G.dungeon.wakes(e)) { e.vx = e.vz = 0; e.phase += dt * 0.6; continue; }
      const stun = e.st.stun, held = stun || e.st.root;
      if (!stun) e.atkCd -= dt;
      const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 0.001, big = e.def.ai === 'golem';
      // the Scarecrow Effigy (trinket) lures monsters: they walk at it instead of you
      const lure = G.trinkets.lure(e), lx = lure ? lure.x - e.x : dx, lz = lure ? lure.z - e.z : dz;
      const v = stun ? [0, 0] : (AI[e.def.ai] || updDog)(e, dt, lx, lz, lure ? Math.hypot(lx, lz) || 0.001 : dist);
      const slow = (e.st.slow ? 1 - G.STATUS.slow.power : 1) * (aura && dist < aura.radius + e.r ? 1 - aura.power : 1) * G.tfx.slow(e)
        * (e.st.shock && G.stats.shockSlow > 0 ? 1 - Math.min(0.8, G.stats.shockSlow) : 1);   // item modifier: monsters you shock are slowed
      let vx = held ? 0 : v[0] * slow, vz = held ? 0 : v[1] * slow;
      if (!big && e.summonAt.length && e.hp < e.maxHp * e.summonAt[0]) {
        e.summonAt.shift(); A.play('horn'); G.spawner.summonPack(e); G.ui.toast(`The ${(e.name || e.def.name).toLowerCase()} calls its pack!`, '#ff8a4a');
      }
      if (P.dead && !e.boss) { vx *= -0.3; vz *= -0.3; }
      if (e.slideT > 0 && !held) { e.slideT -= dt; vx += (-dz / dist) * e.slideDir * e.speed; vz += (dx / dist) * e.slideDir * e.speed; }
      const acc = big ? 6 : 8;
      e.vx = U.damp(e.vx, vx, acc, dt); e.vz = U.damp(e.vz, vz, acc, dt);
      const kd = Math.exp(-7 * dt); e.kbx *= kd; e.kbz *= kd;
      let nx = e.x + (e.vx + e.kbx) * dt, nz = e.z + (e.vz + e.kbz) * dt;
      if (!e.def.flying && e.state !== 'emerge') {
        const o = W.collide(nx, nz, e.r);
        if (Math.abs(o[0] - nx) + Math.abs(o[1] - nz) > 0.002) { if (e.slideT <= 0) e.slideT = 0.6; e.bumped = true; }
        nx = o[0]; nz = o[1];
      }
      e.x = nx; e.z = nz;
      if (!e.lockYaw) {
        const sp = Math.hypot(e.vx, e.vz), ty = sp > 0.3 && e.def.ai !== 'pumpkin' && e.def.ai !== 'shooter' && e.def.ai !== 'eye' ? Math.atan2(e.vx, e.vz) : Math.atan2(dx, dz);
        e.yaw += U.wrapAng(ty - e.yaw) * Math.min(1, dt * (big ? 4 : 10));
      }
      if (!P.dead && !stun && !big && e.dmg > 0 && dist < e.r + P.r + 0.15 && e.atkCd <= 0 && e.y < 1.5) { e.atkCd = 0.9 / (1 + e.atkSpd); PS.damage(e.dmg, e); }
      if (big && !P.dead && !stun && e.state !== 'charge' && e.state !== 'emerge' && dist < e.r + P.r + 0.2 && e.atkCd <= 0) { e.atkCd = 1.1; PS.damage(e.dmg, e); }
      if (e.st.shock || e.st.slow || e.st.root || stun) statusFx(e.x, e.y, e.z, e.r, e.st, dt);
      // modifier upkeep
      if (e.regen > 0) ES.heal(e, e.maxHp * e.regen * dt);
      if (e.lavaTrail > 0 && e.state !== 'emerge') {
        e.lavaT -= dt;
        if (e.lavaT <= 0 && Math.hypot(e.vx, e.vz) > 0.5) { e.lavaT = 0.3; SH.lava(e.x, e.z, 1.5 * e.scale, 4, e.dmg * e.lavaTrail); }
      }
      if (e.pulse > 0 && e.state !== 'emerge' && G.phase === 'fight') pulse(e, dt);
      // Shamanic (modifier): every 3 seconds a ring of purple hexes that poison you
      if (e.shamanic > 0 && e.state !== 'emerge' && G.phase === 'fight' && (e.shamT -= dt) <= 0) {
        e.shamT = 3;
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + e.seed * 6; SH.seed(e.x, 1.2 * e.scale + e.y, e.z, e.x + Math.sin(a) * 10, e.z + Math.cos(a) * 10, 7, e.dmg * e.shamanic, e, 'hex'); }
        F.ring(e.x, e.z, { r0: 0.5, r1: 2.5 * e.scale, life: 0.35, color: 0xb86cff }); A.play('hex');
      }
      if (e.abilities && e.state !== 'emerge' && !stun && G.phase === 'fight') {
        for (const k in e.abilities) {
          const ab = e.abilities[k];
          if ((e.abT[k] -= dt) <= 0) e.abT[k] = G.mech.start(k, e, ab) ? U.rnd(ab.every[0], ab.every[1]) : 2;
        }
      }
      if (e.alien && e.invader && Math.random() < dt * 10) F.rise(e.x, 0.2, e.z, 0x7dff6a, 1, e.r * 2, 2, 0.16, 0.8);
      if (e.modColors && Math.random() < dt * 14) F.rise(e.x + U.rnd(-1, 1) * e.r, 0.3, e.z + U.rnd(-1, 1) * e.r, U.pick(e.modColors), 1, 0.4, 2.6, 0.22, 1);
    }
    // separation between overlapping enemies (and keep them off the player)
    for (const e of ES.list) {
      if (e.dead || e.dummy || e.dormant) continue;   // sleeping dungeon packs are laid out apart already
      ES.query(e.x, e.z, e.r + 2.2, (o) => {
        if (o.id <= e.id || o.dead || Math.abs(o.y - e.y) > 1.2) return;
        const dx = o.x - e.x, dz = o.z - e.z, min = e.r + o.r, d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) return;
        const d = Math.sqrt(d2), push = (min - d) / d, we = o.mass / (e.mass + o.mass), wo = 1 - we;
        e.x -= dx * push * we; e.z -= dz * push * we; o.x += dx * push * wo; o.z += dz * push * wo;
      });
      if (e.y < 1.5 && e.state !== 'emerge') {
        const dx = e.x - P.x, dz = e.z - P.z, min = e.r + P.r, d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), k = (min - d) / d; e.x += dx * k; e.z += dz * k; }
      }
    }
    for (let i = ES.list.length - 1; i >= 0; i--) {
      const e = ES.list[i];
      if (e.dead && e.dying <= 0) {
        if (e.model) { G.scene.remove(e.model.root); e.model.root.traverse((o) => o.geometry && o.geometry.dispose()); }
        ES.list.splice(i, 1);
      }
    }
    SH.update(dt);
  };

  // Relentless (modifier): every 2.5 seconds it strikes you wherever you are and shoves you away,
  // each pulse 25% stronger than the last, for as long as it lives.
  function pulse(e, dt) {
    if ((e.pulseT -= dt) > 0 || P.dead) return;
    e.pulseT = 2.5;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1, k = 1 + 0.25 * e.pulses++;
    F.streak(e.x, 1 + e.y, e.z, P.x, 1, P.z, 0xff4adf, 0.35, 0.25); F.ring(P.x, P.z, { r0: 0.3, r1: 2.2 + Math.min(3, e.pulses * 0.2), life: 0.35, color: 0xff4adf });
    A.play('zap');
    PS.damage(e.dmg * e.pulse * k, null);
    PS.push(dx / d, dz / d, Math.min(26, 7 + e.pulses * 1.2));
  }

  ES.render = function (dt) {
    for (const k in ES.R) ES.R[k].begin();
    F.shadowBegin();
    if (P.root && P.root.visible) F.shadow(P.x, P.z, 0.55);
    let sn = 0, hn = 0;
    const HR = G.DOTS.holy.auraRadius;
    ES.haloMat.opacity = 0.4 + Math.sin(G.time * 6) * 0.15;
    for (const e of ES.list) {
      // only what is near you is drawn (a dungeon can hold hundreds of monsters out of sight)
      const far = Math.abs(e.x - P.x) > 46 || Math.abs(e.z - P.z) > 46;
      if (e.model) e.model.root.visible = !far;
      if (far) continue;
      if (e.holy && e.holy.length && !e.dead && hn < 300) {
        const r = HR * Math.max(1, e.scale);
        _pos.set(e.x, 0.09, e.z); _scl.set(r, 1, r); _q.identity();
        ES.haloMesh.setMatrixAt(hn++, _base.compose(_pos, _q, _scl));
      }
      if (e.shroud && !e.dead && sn < 64) {
        _pos.set(e.x, 0.07, e.z); _scl.set(e.shroud, 1, e.shroud); _q.identity();
        ES.shroudMesh.setMatrixAt(sn++, _base.compose(_pos, _q, _scl));
      }
      if (e.model) { golemModel(e, dt); if (!e.dead) F.shadow(e.x, e.z, 2.3 * e.scale); continue; }
      ES.R[e.type].push(e);
      if (!e.dead) F.shadow(e.x, e.z, e.def.flying ? e.r * 0.8 : e.r * 1.15);
    }
    for (const k in ES.R) ES.R[k].end();
    ES.shroudMesh.count = sn; ES.shroudMesh.instanceMatrix.needsUpdate = true;
    ES.haloMesh.count = hn; ES.haloMesh.instanceMatrix.needsUpdate = true;
    SH.render();
    F.shadowEnd();
  };

  // Over monsters: a nameplate (name, modifiers, health bar) for bosses, rare golems, elites, rare
  // monsters and invaders, and above it
  // a row of icons for everything on the monster (G.ui.monsterFx): poison stacks, bleed, crippled and
  // statuses. Bosses show the same row under their health bar.
  const TOP = { eye: 1.3, voidling: 2.5, crawler: 0.9, tentacle: 4.4, cthulhu: 3.1, dog: 1.35, crow: 0.45, pumpkin: 2.25, alien: 2.5, blob: 1.3, mosquito: 0.5, alienbird: 0.45, golem: 4.6, bigblob: 5.8, deer: 5.8, dummy: 2.3,
    witchdoctor: 2.15, shaman: 2.3, ghost: 1.3, cultist: 2.2, snail: 1.8, frog: 0.95, cauldron: 2.5, orc: 5.4, demon: 6.4 };
  ES.fxRects = [];   // where the effect icons were drawn this frame (canvas pixels), for hover tooltips
  ES.drawOverlay = function (c, dpr) {
    const fs = Math.round(16 * dpr), small = Math.round(15 * dpr), is = Math.round(26 * dpr), num = Math.round(21 * dpr);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.imageSmoothingEnabled = false;
    const text = (t, x, y, col, size) => { c.font = `${size}px VT323, monospace`; c.lineWidth = 3 * dpr; c.strokeStyle = '#120a06'; c.strokeText(t, x, y); c.fillStyle = col; c.fillText(t, x, y); };
    ES.fxRects.length = 0;
    for (const e of ES.list) {
      if (e.dead || G.darkness.hidden(e.x, e.z)) continue;   // nothing shows in The Dark
      const plate = e.elite || e.invader || e.rareMob || e.boss || e.def.plate;
      const fxl = e.poison.length || e.bleed.length || e.crippled > 0 || (e.holy && e.holy.length) || e.voodoo > 0 || e.gripT > 0 || Object.keys(e.st).length ? G.ui.monsterFx(e).filter((x) => !x.passive) : [];
      if (!plate && !fxl.length) continue;
      const s = F.project(e.x, e.y + (TOP[e.def.model] || 1.5) * e.scale, e.z);
      if (!s) continue;
      let y = s.y - 4 * dpr;
      if (plate) {
        // bosses get a wider, taller bar; colors: alien green, rare blue, elite gold, boss orange.
        // The bar eases down, with a pale chunk trailing behind for the damage just taken.
        const big = e.boss, w = (big ? 86 : 52) * dpr, h = (big ? 7 : 5) * dpr, x0 = s.x - w / 2;
        const col = e.invader ? '#7dff6a' : e.rare || e.rareMob ? G.RARITY[1].color : big ? '#ff8a3a' : e.def.plate ? '#c08aff' : '#e8b030';
        c.fillStyle = '#120a06'; c.fillRect(x0 - dpr, y - h - dpr, w + 2 * dpr, h + 2 * dpr);
        c.fillStyle = '#3a1410'; c.fillRect(x0, y - h, w, h);
        c.fillStyle = '#ffe8c0'; c.fillRect(x0, y - h, w * U.clamp(e.hpL ?? 1, 0, 1), h);
        c.fillStyle = col; c.fillRect(x0, y - h, w * U.clamp(e.hpF ?? 1, 0, 1), h);
        c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(x0, y - h, w * U.clamp(e.hpF ?? 1, 0, 1), Math.max(1, Math.round(h / 3)));
        y -= h + 9 * dpr;
        if (e.mods && e.mods.length) { text(e.mods.map((m) => m.name).join(' · '), s.x, y, '#c8f0b8', small); y -= 14 * dpr; }
        const name = big ? e.name || e.def.name : e.invader ? `Alien ${e.def.name}` : e.rareMob ? `Rare ${e.def.name}` : e.elite ? `Elite ${e.def.name}` : e.def.name;
        text(name, s.x, y, e.invader ? '#9dff7a' : e.rare || e.rareMob ? G.RARITY[1].color : big ? '#ffb070' : e.elite ? '#ffd060' : '#d8b8ff', fs);
        y -= 20 * dpr;
      }
      // effects row: each effect in a frame of its colour, with a big stack count and a bar for the time left
      if (!fxl.length) continue;
      const gap = 4 * dpr, tot = fxl.length * is + (fxl.length - 1) * gap;
      let x = s.x - tot / 2;
      const top = y - is / 2;
      for (const fx of fxl) {
        c.fillStyle = 'rgba(10,7,6,.82)'; c.fillRect(x - dpr, top - dpr, is + 2 * dpr, is + 2 * dpr);
        c.strokeStyle = fx.color; c.lineWidth = 2 * dpr; c.strokeRect(x, top, is, is);
        const img = G.ui.iconImage(fx.icon);
        if (img.complete) c.drawImage(img, x + 3 * dpr, top + 3 * dpr, is - 6 * dpr, is - 6 * dpr);
        if (fx.t != null && fx.max) { c.fillStyle = '#120a06'; c.fillRect(x, top + is + dpr, is, 3 * dpr); c.fillStyle = fx.color; c.fillRect(x, top + is + dpr, is * U.clamp(fx.t / fx.max, 0, 1), 3 * dpr); }
        const n = fx.n ? String(fx.n) : fx.forever ? '∞' : '';
        if (n) { c.textAlign = 'right'; text(n, x + is + 4 * dpr, top + is - 4 * dpr, '#ffffff', num); c.textAlign = 'center'; }
        ES.fxRects.push({ x0: x, y0: top, x1: x + is, y1: top + is + 4 * dpr, e, key: fx.key });
        x += is + gap;
      }
    }
  };

  ES.clear = function () {
    for (const e of ES.list) if (e.model) G.scene.remove(e.model.root);
    ES.list.length = 0;
    SH.clear();
    for (const k in ES.R || {}) { ES.R[k].begin(); ES.R[k].end(); }
  };

  // =====================================================================
  // Enemy shots and hazards: pumpkin seeds, alien bolts, boulders, lava and acid, death blasts
  // =====================================================================
  const SH = G.enemyShots = { list: [] };
  SH.init = function () {
    SH.seedMesh = M.inst(M.projGeo('seed'), M.matBI, 160);
    SH.rockMesh = M.inst(M.projGeo('boulder'), M.matLI, 60);
    SH.boltMesh = M.inst(M.projGeo('bolt'), M.matBI, 160);
    SH.hexMesh = M.inst(M.projGeo('hex'), M.matBI, 400);
    G.scene.add(SH.seedMesh, SH.rockMesh, SH.boltMesh, SH.hexMesh);
  };
  // A straight shot: kind 'seed' (pumpkins), 'bolt' (tall greens) or 'hex' (purple, poisons you).
  SH.seed = function (x, y, z, tx, tz, speed, dmg, owner, kind = 'seed') {
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
    SH.list.push({ k: 'seed', bolt: kind === 'bolt', hex: kind === 'hex', poison: kind === 'hex', x, y, z, vx: dx / l * speed, vz: dz / l * speed, life: 3.2, dmg, owner, rot: 0 });
  };
  // Snail slime: a puddle that slows you while you stand in it (at most 120 at once).
  SH.slimeN = 0;
  SH.slime = function (x, z, r, life) {
    if (SH.slimeN >= 120) return;
    F.disc(x, z, r, life, 0x9ac86a, 0.35);
    SH.list.push({ k: 'slime', x, z, r, life, tick: 0, rot: 0 });
  };
  // acid: the landing leaves a pool of acid.
  SH.boulder = function (x, y, z, tx, tz, dur, dmg, owner, acid) {
    SH.list.push({ k: 'rock', sx: x, sy: y, sz: z, x, y, z, tx, tz, t: 0, dur, dmg, owner, acid, rot: 0, tele: F.telegraph(tx, tz, 2.3, dur, acid ? 0x9aff3a : undefined) });
  };
  // Burning ground that hurts you: lava (orange) or acid (green).
  SH.lava = function (x, z, r, life, dps, acid) {
    F.disc(x, z, r, life, acid ? 0x7adf1a : 0xd8340c, 0.42);
    SH.list.push({ k: 'lava', x, z, r, life, dps, acid, tick: 0.25, rot: 0 });
  };
  // owner: the monster it belongs to (its "inflicts" land on you). color: of the warning and the blast.
  SH.blast = function (x, z, r, dur, dmg, owner, color = 0xffa020) {
    SH.list.push({ k: 'blast', x, z, r, t: 0, dur, dmg, life: 1, rot: 0, owner: owner || null, color, tele: F.telegraph(x, z, r, dur, color) });
  };
  SH.update = function (dt) {
    const frozen = G.trinkets.frozen > 0;   // Grandpa's Pocket Watch: shots hang in the air
    for (const s of SH.list) {
      if (frozen && (s.k === 'seed' || s.k === 'rock')) continue;
      s.rot += dt * 8;
      if (s.k === 'seed') {
        s.life -= dt; s.x += s.vx * dt; s.z += s.vz * dt; s.y = Math.max(0.9, s.y - dt * 0.4);
        const col = s.hex ? 0xb86cff : s.bolt ? 0x9aff6a : 0xff8a20;
        if (Math.random() < dt * 30) F.glow.add(s.x, s.y, s.z, 0, 0.5, 0, 0.35, 0.16, col, 0, 1);
        if (!P.dead && Math.hypot(P.x - s.x, P.z - s.z) < 0.32 + P.r) { s.life = 0; PS.damage(s.dmg, s); F.burst(s.x, s.y, s.z, { n: 6, color: col, glow: true, speed: 3, life: 0.3, size: 0.15 }); }
        if (W.blocked(s.x, s.z, 0.1)) s.life = 0;
      } else if (s.k === 'rock') {
        s.t += dt;
        const k = Math.min(1, s.t / s.dur);
        s.x = U.lerp(s.sx, s.tx, k); s.z = U.lerp(s.sz, s.tz, k); s.y = U.lerp(s.sy, 0.5, k) + Math.sin(k * Math.PI) * 7;
        if (k >= 1) {
          s.life = 0;
          if (!P.dead && Math.hypot(P.x - s.tx, P.z - s.tz) < 2.3 + P.r) PS.damage(s.dmg, s);
          F.burst(s.tx, 0.4, s.tz, { n: 12, color: [0x77736a, 0x5a5850, 0x8a8478], speed: 6, life: 0.8, size: 0.3 });
          F.ring(s.tx, s.tz, { r0: 0.5, r1: 3, life: 0.35, color: s.acid ? 0x9aff3a : 0xffb070 }); F.dust(s.tx, s.tz, 6); F.shake(0.18); A.play('thud');
          if (s.acid) SH.lava(s.tx, s.tz, 2.2, 5, s.dmg * 0.35, true);
        } else s.life = 1;
      } else if (s.k === 'lava') {
        s.life -= dt; s.tick -= dt;
        if (Math.random() < dt * 4) F.rise(s.x + U.rnd(-0.6, 0.6) * s.r, 0.1, s.z + U.rnd(-0.6, 0.6) * s.r, s.acid ? 0x9aff3a : 0xff7a2a, 1, 0.2, 1.4, 0.12, 0.5);
        if (s.tick <= 0) { s.tick = 0.5; if (!P.dead && Math.hypot(P.x - s.x, P.z - s.z) < s.r + P.r * 0.5) PS.damage(s.dps * 0.5, null); }
      } else if (s.k === 'slime') {
        s.life -= dt; s.tick -= dt;
        if (s.tick <= 0) { s.tick = 0.25; if (!P.dead && P.dashT <= 0 && Math.hypot(P.x - s.x, P.z - s.z) < s.r + P.r * 0.5) PS.addStatus('slow'); }
      } else if (s.k === 'blast') {
        s.t += dt;
        if (s.t >= s.dur) {
          s.life = 0;
          F.explosion(s.x, s.z, s.r, s.color === 0xffa020 ? 0xffa030 : s.color); A.play(s.owner ? 'slam' : 'explode'); F.shake(s.owner ? 0.3 : 0.5);
          if (!P.dead && Math.hypot(P.x - s.x, P.z - s.z) < s.r + P.r) PS.damage(s.dmg, s.owner && !s.owner.dead ? s.owner : null);
        }
      }
    }
    SH.list = SH.list.filter((s) => s.life > 0);
    SH.slimeN = 0;
    for (const s of SH.list) if (s.k === 'slime') SH.slimeN++;
  };
  SH.render = function () {
    let a = 0, b = 0, c = 0, h = 0;
    const d = new T.Object3D();
    for (const s of SH.list) {
      if (s.k !== 'seed' && s.k !== 'rock') continue;
      d.position.set(s.x, s.y, s.z); d.scale.setScalar(1);
      if (s.bolt) d.rotation.set(0, Math.atan2(s.vx, s.vz), 0); else d.rotation.set(s.rot, s.rot * 0.7, 0);
      d.updateMatrix();
      if (s.hex) { if (h < 400) SH.hexMesh.setMatrixAt(h++, d.matrix); }
      else if (s.bolt) { if (c < 160) SH.boltMesh.setMatrixAt(c++, d.matrix); }
      else if (s.k === 'seed') { if (a < 160) SH.seedMesh.setMatrixAt(a++, d.matrix); } else if (b < 60) SH.rockMesh.setMatrixAt(b++, d.matrix);
    }
    SH.seedMesh.count = a; SH.rockMesh.count = b; SH.boltMesh.count = c; SH.hexMesh.count = h;
    for (const m of [SH.seedMesh, SH.rockMesh, SH.boltMesh, SH.hexMesh]) m.instanceMatrix.needsUpdate = true;
  };
  SH.clear = function () { for (const s of SH.list) if (s.tele) s.tele.cancel = true; SH.list.length = 0; };

  // =====================================================================
  // Spawner: a steady trickle from the caves, hordes, and the bosses, rares and altar summons that
  // day events call for. Pacing comes from data/stages.json.
  // =====================================================================
  const SP = G.spawner = {};
  const pickW = (w) => U.weighted(Object.keys(w), (k) => w[k]);
  SP.reset = function () { SP.acc = 0; SP.hordeT = G.SPAWNING.hordes.first; SP.bursts = []; SP.bossN = 0; };
  SP.pickType = function () {
    const st = G.stageAt(G.tier), local = G.dayT - G.tier * G.STAGE_SECONDS;
    let w = st.spawns[0].weights;
    for (const s of st.spawns) if (local >= s.at) w = s.weights;
    return pickW(w);
  };
  SP.hordeType = () => pickW(G.stageAt(G.tier).horde);
  SP.spawnAt = function (cave, type, elite) {
    const fly = G.ENEMIES[type].flying, inside = fly ? 0.4 : 1.6, side = (Math.random() - 0.5) * 2.4;
    const e = ES.spawn(type, cave.x - cave.fx * inside + cave.fz * side, cave.z - cave.fz * inside - cave.fx * side, { elite });
    if (!fly) { e.vx = cave.fx * e.speed; e.vz = cave.fz * e.speed; }
    return e;
  };
  // Alive cap for the trickle (and the invasion pillar), scaled by the stage spawn multiplier.
  SP.cap = function () {
    const M = G.SPAWNING.maxEnemies;
    return Math.min(M.base + G.time * M.perSecond + G.danger * M.perStage, M.cap) * G.spawnMult();
  };
  // Runs only while a day is being fought (main.js).
  SP.update = function (dt) {
    const S = G.SPAWNING, t = G.time, danger = G.danger, alive = ES.list.length, mult = G.spawnMult();
    const cap = SP.cap();
    const rate = Math.min(S.rate.base + t / S.rate.rampSeconds, S.rate.max) * (1 + danger * S.rate.perStage) * (ES.bossAlive() ? S.rate.whileBossAlive : 1) * mult;
    if (alive < cap) {
      SP.acc += rate * dt;
      while (SP.acc >= 1) {
        SP.acc -= 1;
        const elite = t > S.elites.after && Math.random() < S.elites.chance + danger * S.elites.perStage;
        SP.spawnAt(U.pick(W.caves), SP.pickType(), elite);
      }
    }
    const H = S.hordes;
    SP.hordeT -= dt;
    if (SP.hordeT <= 0) {
      SP.hordeT = U.rnd(H.every[0], H.every[1]);
      const cave = U.pick(W.caves);
      cave.warn = H.warning + 0.4; A.play('horn');
      G.ui.toast(`Something stirs in ${cave.name}…`, '#ff6a4a');
      SP.bursts.push({ cave, n: Math.round(Math.min(H.size + danger * H.sizePerStage + Math.floor(t / 60) * H.sizePerMinute, H.maxSize) * mult), delay: H.warning, acc: 0 });
    }
    for (const b of SP.bursts) {
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.acc += dt * 12 * mult;
      while (b.acc >= 1 && b.n > 0) { b.acc--; b.n--; SP.spawnAt(b.cave, SP.hordeType(), false); }
    }
    SP.bursts = SP.bursts.filter((b) => b.n > 0);
  };
  // A boss walks out of a cave. Every boss of the run is a little tougher than the one before. Golems
  // climb out in a scripted walk; other bosses (Cthulhu) simply come for you.
  SP.spawnBoss = function (cave, type) {
    SP.bossN++;
    const B = G.BOSS, k = SP.bossN - 1;
    const e = ES.spawn(type, cave.x - cave.fx * 1.0, cave.z - cave.fz * 1.0, { hpMul: 1 + B.hpPerBoss * k, sizeMul: 1 + Math.min(k, B.maxSizeSteps) * B.sizePerBoss });
    e.rank = SP.bossN;
    if (e.def.ai === 'golem') Object.assign(e, { state: 'emerge', t: 2.2, fx: cave.fx, fz: cave.fz, yaw: Math.atan2(cave.fx, cave.fz), walkAmt: 1 });
    e.name = e.def.name + (SP.bossN > 1 ? ' ' + U.roman(SP.bossN - 1) : '');
    G.ui.bossBar(e); A.play('bossScream'); F.shake(0.5);
    return e;
  };
  // Day event: rare monsters from the current spawn table climb out of a cave with modifiers.
  SP.spawnRares = function (cave) {
    const R = G.EVENTS.rares, out = [];
    for (let i = 0; i < R.count; i++) {
      const type = SP.pickType(), mods = G.rollModifiers(G.rareModCount(G.danger), G.danger, G.ENEMIES[type].ai);
      const side = (i - (R.count - 1) / 2) * 2.2;
      const e = ES.spawn(type, cave.x - cave.fx * 2 + cave.fz * side, cave.z - cave.fz * 2 - cave.fx * side, { mods, hpMul: R.hp, sizeMul: R.size });
      e.rareMob = true; e.dmg *= R.damage; e.dmgMul = R.damage; e.xp *= R.xp; e.essence *= R.essence; e.mass *= 2;
      if (!e.def.flying) { e.vx = cave.fx * e.speed; e.vz = cave.fz * e.speed; }
      F.burst(e.x, 1, e.z, { n: 12, color: [G.RARITY[1].hex, 0xffffff], glow: true, speed: 5, life: 0.5, size: 0.2 });
      out.push(e);
    }
    return out;
  };
  // Altar summon: climbs out of the ground at (x, z) carrying random modifiers for this stage.
  // quiet: no banner (the altar announces a group summon itself).
  SP.spawnRare = function (x, z, quiet) {
    const mods = G.rollModifiers(G.altarModCount(G.danger), G.danger, G.ENEMIES[G.ALTAR.enemy].ai);
    const e = ES.spawn(G.ALTAR.enemy, x, z, { mods });
    Object.assign(e, { state: 'emerge', t: 2.2 + (quiet ? Math.random() * 0.8 : 0), fx: 0, fz: 0, walkAmt: 0, rise: true, rare: true, atkCd: 2.6, rank: 1 });
    e.name = e.def.name;
    if (quiet) return e;
    G.ui.bossBar(e); A.play('bossScream'); F.shake(0.6);
    G.ui.banner(`A ${e.name} rises!`, mods.length ? mods.map((m) => m.name).join(' · ') : 'It carries no blessings of its own', G.RARITY[1].color);
    return e;
  };
  // from: the monster calling its pack (in a dungeon the pack crawls out of the dark around it)
  SP.summonPack = function (from) {
    if (G.phase !== 'fight') return;
    const S = G.SPAWNING.packSize;
    const n = Math.round((S.base + G.danger * S.perStage) * G.spawnMult());
    if (G.dungeon.active) { G.dungeon.summon(from, n); return; }
    for (const c of W.caves) { c.warn = 2; SP.bursts.push({ cave: c, n, delay: 1.2, acc: 0 }); }
  };
})();
