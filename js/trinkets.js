'use strict';
// Trinkets (data/trinkets.json): an active item used with F. You carry one at a time; every character
// starts with its own, more are won from dungeon bosses and swapped at the workbench. Each trinket has a
// cooldown, recovered faster by the trinketCdr stat and shortened by kills with the Busy Paws talent.
// G.run.trinket = { owned: [ids], id: the one you carry, cd: { id: seconds until its next charge },
// ch: { id: charges ready } }. Trinkets have one charge unless something grants more
// (trinketCharges, e.g. the flamethrower's implicit); charges come back one at a time.
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, P = G.player, ES = G.enemySys, C = G.combat;
  const TR = G.trinkets = { zones: [], flies: null, decoy: null, curse: null, burns: [], moment: null, frozen: 0, killT: 0, t: 0, pops: [], popRate: 25, popAcc: 0 };
  const HOLY = 0xffe080, PURPLE = 0xb86cff;
  let tent = null;   // the Voodoo Doll's tentacles (one instanced mesh, made on first use)

  TR.reset = function () {
    const id = G.CHAR.trinket;
    G.run.trinket = { owned: id ? [id] : [], id: id || null, cd: {}, ch: {} };
    TR.clear();
  };
  // Ends everything a trinket left in the world (new run, travelling to the next map).
  TR.clear = function () {
    for (const z of TR.zones) G.scene.remove(z.light);
    if (TR.decoy) G.scene.remove(TR.decoy.mesh);
    endCurse();
    TR.zones = []; TR.flies = null; TR.decoy = null; TR.burns = []; TR.moment = null; TR.frozen = 0; TR.killT = 0; TR.venom = null; TR.effectOn = false; TR.ember = null; TR.pops = [];
  };
  TR.def = () => (G.run && G.run.trinket && G.TRINKETS[G.run.trinket.id]) || null;
  TR.cd = (id) => (G.run.trinket.cd[id] || 0);
  TR.maxCharges = () => 1 + Math.max(0, Math.round(G.stats.trinketCharges || 0));
  TR.charges = (id) => { const c = G.run.trinket.ch[id]; return c == null ? TR.maxCharges() : Math.min(c, TR.maxCharges()); };

  // F: use the trinket you carry, if it has recharged.
  TR.use = function () {
    const D = TR.def();
    if (!D || P.dead || G.state !== 'playing') return false;
    const R = G.run.trinket, ch = TR.charges(D.id);
    if (ch <= 0) { G.ui.toast(`${D.name} recharges in ${TR.cd(D.id).toFixed(1)}s`, '#c8b8a0'); A.play('click'); return false; }
    if (FX[D.effect.id](D.effect) === false) { A.play('click'); return false; }   // nothing to use it on
    G.tfx.onTrinketUse();   // Sacred Ward, Pent-Up Fury
    G.rules.fire('trinket');
    R.ch[D.id] = ch - 1;
    if (!(R.cd[D.id] > 0)) R.cd[D.id] = D.cooldown;
    // when its effect will end (Divine Finale goes off then)
    const E = D.effect, B = E.buff && G.BUFFS[E.buff];
    TR.effectEnd = TR.t + (E.id === 'dinnerBell' ? 0 : B && (E.id === 'buff' || E.id === 'theMoment') ? B.duration : E.duration || 0);
    TR.effectOn = true;
    G.run.trinketUses = (G.run.trinketUses || 0) + 1;
    F.num(P.x, 3.3, P.z, D.name.toUpperCase(), '#ffe080', 14);
    return true;
  };
  // A trinket's effect without using it (no charge, no cooldown): talents like Borrowed Time.
  TR.trigger = function (id) {
    const D = G.TRINKETS[id];
    if (!D || P.dead) return false;
    FX[D.effect.id](D.effect);
    return true;
  };
  // Workbench: carry a trinket you own (its cooldown carries over).
  TR.equip = function (id) {
    const R = G.run.trinket;
    if (!R.owned.includes(id)) return false;
    R.id = id;
    return true;
  };
  // Scarecrow Effigy's embers: extra elemental damage on your weapon hits, as a share of the hit.
  TR.embers = () => (TR.ember ? TR.ember.share : 0);
  TR.unowned = () => Object.keys(G.TRINKETS).filter((id) => !G.run.trinket.owned.includes(id));
  // A dungeon boss's reward: a random trinket you don't own yet. Returns its id, or null.
  TR.grant = function () {
    const pool = TR.unowned();
    if (!pool.length) return null;
    const id = U.pick(pool);
    G.run.trinket.owned.push(id);
    return id;
  };

  // ---------- effects ----------
  const FX = {
    // The Bible: a buff that sets monsters on holy fire with every hit; recent burns heal you.
    theMoment(E) {
      TR.moment = E;
      G.playerSys.addBuff(E.buff);
      F.ring(P.x, P.z, { r0: 0.4, r1: 4, life: 0.6, color: HOLY }); F.flash('#fff6c0', 0.3); A.play('holy');
    },
    // Holy Lantern: burning holy ground at your feet.
    holyGround(E) {
      const light = new T.PointLight(0xffd060, 1.6, E.radius * 3, 1.5);
      light.position.set(P.x, 1.5, P.z); G.scene.add(light);
      TR.zones.push({ x: P.x, z: P.z, r: E.radius, t: E.duration, dur: E.duration, tick: 0, burn: E.burn, regen: E.regen, light });
      F.disc(P.x, P.z, E.radius, E.duration, 0xffc040, 0.4); F.ring(P.x, P.z, { r0: 0.5, r1: E.radius, life: 0.5, color: HOLY }); A.play('holy');
    },
    // Bloodlust and other plain buffs.
    buff(E) {
      G.playerSys.addBuff(E.buff);
      F.ring(P.x, P.z, { r0: 0.4, r1: 3.5, life: 0.5, color: 0xff4a2a }); F.shake(0.3); A.play(E.sound || 'warcry');
    },
    // Grandpa's Pocket Watch: monsters around you freeze (and are shocked while they are frozen), their
    // shots hang in the air, and you move faster for as long as the freeze lasts.
    timeStop(E) {
      ES.query(P.x, P.z, E.radius + 3, (e) => {
        if (e.dead || Math.hypot(e.x - P.x, e.z - P.z) > E.radius + e.r) return;
        const t = e.boss ? E.bossDuration : E.duration;
        e.st.stun = Math.max(e.st.stun || 0, t);
        if (E.shock) { e.shockFx = Math.max(e.st.shock > 0 ? e.shockFx || 0 : 0, E.shock); e.st.shock = Math.max(e.st.shock || 0, t); }
      });
      TR.frozen = E.duration;
      if (E.buff) G.playerSys.addBuff(E.buff, E.duration);
      F.ring(P.x, P.z, { r0: 0.5, r1: E.radius, life: 0.7, color: 0xc8e0ff }); F.flash('#c8e0ff', 0.45); A.play('tick');
    },
    // Scarecrow Effigy: monsters chase it instead of you, then it explodes.
    decoy(E) {
      if (TR.decoy) G.scene.remove(TR.decoy.mesh);
      const a = P.yaw, x = P.x + Math.sin(a) * 2.5, z = P.z + Math.cos(a) * 2.5;
      const mesh = new T.Mesh(M.enemyParts('dummy')[0].geo, M.matL);
      mesh.position.set(x, 0, z); mesh.rotation.y = a + Math.PI; G.scene.add(mesh);
      TR.decoy = { x, z, t: E.duration, dur: E.duration, range: E.range, power: E.power, radius: E.radius, perKill: E.perKill, emberCap: E.cap, emberFor: E.emberDuration, mesh };
      F.dust(x, z, 10); A.play('horn');
    },
    // Jar of Fireflies: little lights circle you and zap monsters nearby.
    fireflies(E) {
      TR.flies = { t: E.duration, dur: E.duration, n: E.count, ang: 0, tick: 0, every: E.every, share: E.damage, range: E.range, shock: E.shock, pos: [] };
      A.play('chest');
    },
    // Voodoo Doll: curses the monster with the most health near you. It loses a share of its health over
    // a few seconds, and tentacles from it grip every monster around it, crushing each for the same.
    voodoo(E) {
      let tgt = null;
      ES.query(P.x, P.z, E.radius + 3, (e) => {
        if (e.dead || e.hp <= 0 || Math.hypot(e.x - P.x, e.z - P.z) > E.radius + e.r) return;
        if (!tgt || e.hp > tgt.hp) tgt = e;
      });
      if (!tgt) { G.ui.toast(`No monster within ${E.radius} m to curse`, '#c08aff'); return false; }
      endCurse();
      TR.curse = { e: tgt, t: E.duration, dur: E.duration, dps: tgt.hp * E.loss / E.duration, loss: E.loss, grip: E.grip, acc: 0, tick: 0.25, dealt: 0, grips: new Map(), age: 0 };
      tgt.voodoo = E.duration;
      F.streak(P.x, 1.2, P.z, tgt.x, 1 + tgt.y, tgt.z, PURPLE, 0.45, 0.16);
      F.ring(tgt.x, tgt.z, { r0: 0.4, r1: E.grip + tgt.r, life: 0.6, color: PURPLE });
      F.num(tgt.x, 2.8 * tgt.scale + tgt.y, tgt.z, 'CURSED', '#c08aff', 16);
      A.play('curse');
      gripAround(TR.curse);
    },
    // Vile Vial of Volatile Venom: every poison already on a monster gets stronger, and for a few seconds
    // poisoned monsters spread all their poisons to the monsters around them.
    venom(E) {
      let n = 0;
      for (const e of ES.list) {
        if (e.dead || !e.poison.length) continue;
        for (const st of e.poison) st.dps *= E.mult;
        gas(e, 10); n++;
      }
      TR.venom = { t: E.duration, dur: E.duration, r: E.radius, tick: 0 };
      F.burst(P.x, 1, P.z, { n: 30, color: [0x5ad83a, 0x8aef4a, 0x2a6a1a], speed: 3, life: 1.6, size: 0.4, drag: 3, grav: -0.6 });
      F.ring(P.x, P.z, { r0: 0.5, r1: 6, life: 0.6, color: 0x8aef4a }); F.flash('#2a6a1a', 0.3); A.play('wheeze');
      if (n) F.num(P.x, 3.6, P.z, `${n} POISONED ×${E.mult}`, '#9dff6a', 14);
    },
    // Dinner Bell: crystals and essence fly to you; monsters close by are blasted back and stunned.
    dinnerBell(E) {
      G.pickups.magnetAll();
      ES.query(P.x, P.z, E.radius + 3, (e) => {
        const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) || 1;
        if (e.dead || d > E.radius + e.r) return;
        e.st.stun = Math.max(e.st.stun || 0, E.stun * (e.boss ? G.STATUS.stun.bossDuration : 1));
        if (!e.boss) { const k = E.push / Math.sqrt(e.mass); e.kbx += dx / d * k; e.kbz += dz / d * k; }
      });
      F.ring(P.x, P.z, { r0: 0.5, r1: E.radius, life: 0.45, color: 0xffd27a }); F.shake(0.35); A.play('bell');
    },
    // The Tell-Tale Heart: every monster bleeding from your wounds bursts, nearest first, one after another,
    // all of them within about a second and a half however many there are.
    bloodBurst(E) {
      const list = ES.list.filter((e) => !e.dead && !e.dummy && !e.dormant && e.bleed.length);
      if (!list.length) { G.ui.toast('Nothing is bleeding · the heart stays quiet', '#e0302a'); return false; }
      list.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
      for (const e of list) TR.pops.push({ e, E });
      TR.popRate = Math.max(25, TR.pops.length / 1.5); TR.popAcc = Math.max(TR.popAcc || 0, 1);
      F.flash('#5a0006', 0.35); F.ring(P.x, P.z, { r0: 0.5, r1: 6, life: 0.5, color: 0xc01a10 }); F.shake(0.3); A.play('heartbeat');
      F.num(P.x, 3.6, P.z, `${list.length} HEART${list.length === 1 ? '' : 'S'} BURST`, '#ff4a3a', 15);
    },
  };
  // One bursts. An ordinary monster dies at once and sprays its blood over everything around it for a share
  // of its max health. Bosses and named monsters (cultists, cauldrons, ritualists, tentacles) don't die:
  // the rest of their bleed hits them at once, several times over, and they spray half of that.
  function pop(e, E) {
    if (e.dead) return;
    F.burst(e.x, 0.9 + e.y, e.z, { n: 10, color: [0xc01a10, 0x8a0c06, 0xff3a2a, 0x4a0404], speed: 7, life: 0.7, size: 0.2 * Math.max(1, e.scale), up: 1.1, grav: 14 });
    A.play('juicyPunch');
    if (e.boss || e.def.plate) {
      const b = e.bleed[0], RB = G.stats.fx.ragingBull, bm = (RB && P.buffs[RB.buff] ? RB.bleedMult : 1) * G.chests.bleedMult();
      const v = b ? b.dps * b.t * C.bleedRamp(b) * bm * E.bossMult : 0;
      e.bleed.length = 0;
      if (v <= 0) return;
      C.damage(e, v, 'bleed', 'physical', 'bleed');
      C.explQ.push({ x: e.x, z: e.z, dmg: v * 0.5, raw: true, r: E.radius + e.r, delay: 0, color: 0xc01a10, blood: true, sound: false });
      return;
    }
    const x = e.x, z = e.z, r = E.radius + e.r, hp = e.maxHp;
    C.damage(e, e.hp + 1, 'explode', 'physical', 'bloodPop');
    if (e.dead) C.explQ.push({ x, z, dmg: hp * E.share, r, delay: 0, color: 0xc01a10, blood: true, sound: false });
  }

  // A puff of sickly green gas over a monster.
  function gas(e, n) { F.burst(e.x, 1 + e.y, e.z, { n, color: [0x5ad83a, 0x8aef4a, 0x3a8a2a], speed: 1.6, life: 1.4, size: 0.32 * Math.max(1, e.scale), drag: 3, grav: -0.5 }); }
  // Venom: every half second each poisoned monster copies all its poisons onto monsters within the radius
  // (each poison at most once per monster, so it spreads through a crowd without multiplying forever).
  function spreadVenom(v) {
    for (const e of ES.list) {
      if (e.dead || !e.poison.length) continue;
      if (Math.random() < 0.5) gas(e, 3);
      ES.query(e.x, e.z, v.r + 3, (o) => {
        if (o === e || o.dead || o.dotImmune || Math.hypot(o.x - e.x, o.z - e.z) > v.r + e.r + o.r) return;
        const have = new Set(o.poison.map((s) => s.id));
        let got = 0;
        for (const s of e.poison) if (!have.has(s.id)) { o.poison.push({ dps: s.dps, t: s.t, id: s.id }); got++; }
        if (got) F.streak(e.x, 0.9 + e.y, e.z, o.x, 0.9 + o.y, o.z, 0x8aef4a, 0.25, 0.1);
      });
    }
  }

  // ---------- hooks ----------
  // A weapon hit (combat.js C.hit): during The Moment it sets the monster on holy fire.
  TR.onHit = function (e, dmg) {
    const E = TR.moment;
    if (!E || e.dead || !P.buffs[E.buff]) return;
    C.burn(e, dmg * E.burn, G.DOTS.holy.duration);
    TR.burns.push(TR.t);
  };
  // A kill (combat.js C.kill): Busy Paws takes time off the trinket's cooldown.
  TR.onKill = function () {
    const B = G.stats.fx.trinketOnKill, R = G.run.trinket;
    if (!B || TR.killT > 0 || !R || !R.id || !(R.cd[R.id] > 0)) return;
    R.cd[R.id] = Math.max(0, R.cd[R.id] - B.seconds);
    TR.killT = B.cooldown;
  };
  // ---------- the Voodoo Doll's curse ----------
  // Every monster within grip meters of the cursed one is gripped (and let go once it gets well away).
  function gripAround(cu) {
    const e = cu.e;
    ES.query(e.x, e.z, cu.grip + 4, (o) => {
      if (o === e || o.dead || cu.grips.has(o) || Math.hypot(o.x - e.x, o.z - e.z) > cu.grip + e.r + o.r) return;
      cu.grips.set(o, { age: 0, seed: Math.random() * 6.28 });
    });
    for (const o of cu.grips.keys()) if (o.dead || Math.hypot(o.x - e.x, o.z - e.z) > cu.grip + e.r + o.r + 1.5) { cu.grips.delete(o); o.gripT = 0; }
  }
  function endCurse() {
    const cu = TR.curse;
    if (!cu) return;
    cu.e.voodoo = 0;
    for (const o of cu.grips.keys()) o.gripT = 0;
    TR.curse = null;
    if (tent) tent.count = 0;
  }
  // The curse's health loss, dealt four times a second: the cursed monster and every gripped one take it.
  function updateCurse(dt) {
    const cu = TR.curse;
    if (!cu) return;
    const e = cu.e, step = Math.min(dt, Math.max(0, cu.t));
    cu.t -= dt; cu.age += dt; cu.tick -= dt; cu.acc += cu.dps * step;
    e.voodoo = Math.max(0, cu.t);
    if (!e.dead && Math.random() < dt * 10) F.rise(e.x, 0.4 + e.y, e.z, PURPLE, 1, e.r * 1.4, 1.6, 0.14, 0.7);
    if ((cu.tick <= 0 || cu.t <= 0) && !e.dead) {
      cu.tick = 0.25;
      gripAround(cu);
      const v = cu.acc, type = G.DMG_SOURCES.curse.type;
      cu.acc = 0; cu.dealt += v;
      F.ring(e.x, e.z, { r0: 0.3, r1: cu.grip + e.r, life: 0.3, color: PURPLE });
      for (const o of cu.grips.keys()) { o.gripT = Math.max(0.01, cu.t); C.damage(o, v, 'curse', type, 'curse'); }
      C.damage(e, v, 'curse', type, 'curse');
    }
    for (const [o, g] of cu.grips) g.age += dt;
    if (e.dead || cu.t <= 0) endCurse();
    else drawTentacles(cu);
  }
  // Tentacles: purple segments, thick at the cursed monster's feet and thin where they wrap their prey,
  // swaying as they go; three more coil up the cursed monster itself.
  const SEG = 9, CAP = 900, tq = new T.Quaternion(), tY = new T.Vector3(0, 1, 0), tD = new T.Vector3(), tObj = new T.Object3D(), tCol = new T.Color();
  function drawTentacles(cu) {
    if (!tent) {
      tent = M.inst(new T.CylinderGeometry(1, 1, 1, 6), new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x14031c }), CAP);
      G.scene.add(tent);
    }
    const e = cu.e, base = (x, z) => ({ x, y: 0.05, z });
    let n = 0;
    const one = (a, b, lift, phase, grow, w0, w1) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z), side = { x: -(b.z - a.z) / (len || 1), z: (b.x - a.x) / (len || 1) };
      let px = a.x, py = a.y, pz = a.z;
      for (let i = 1; i <= SEG && n < CAP; i++) {
        const k = (i / SEG) * grow, sway = Math.sin(k * 7 + TR.t * 6 + phase) * 0.35 * Math.sin(k * Math.PI);
        const x = a.x + (b.x - a.x) * k + side.x * sway, z = a.z + (b.z - a.z) * k + side.z * sway;
        const y = a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * lift;
        const dx = x - px, dy = y - py, dz = z - pz, l = Math.hypot(dx, dy, dz) || 0.001, w = w0 + (w1 - w0) * (i / SEG);
        tq.setFromUnitVectors(tY, tD.set(dx / l, dy / l, dz / l));
        tObj.position.set((px + x) / 2, (py + y) / 2, (pz + z) / 2); tObj.quaternion.copy(tq); tObj.scale.set(w, l * 1.15, w); tObj.updateMatrix();
        tent.setMatrixAt(n, tObj.matrix);
        tent.setColorAt(n, tCol.setHex(i % 3 === 0 ? 0x7a3aa0 : 0x3e1258));
        n++; px = x; py = y; pz = z;
      }
    };
    // around the cursed monster
    for (let j = 0; j < 3; j++) {
      const a = TR.t * 0.8 + j * 2.09, r = e.r + 0.5;
      one(base(e.x + Math.cos(a) * r, e.z + Math.sin(a) * r), { x: e.x, y: e.y + 0.9 * e.scale, z: e.z }, 0.4, j, Math.min(1, cu.age * 4), 0.13, 0.04);
    }
    // to every gripped monster
    for (const [o, g] of cu.grips) {
      const a = Math.atan2(o.z - e.z, o.x - e.x);
      one(base(e.x + Math.cos(a) * e.r * 0.8, e.z + Math.sin(a) * e.r * 0.8), { x: o.x, y: o.y + 0.6 * o.scale, z: o.z }, 0.35 + Math.hypot(o.x - e.x, o.z - e.z) * 0.12, g.seed, Math.min(1, g.age * 5), 0.15, 0.045);
    }
    tent.count = n;
    tent.instanceMatrix.needsUpdate = true;
    if (tent.instanceColor) tent.instanceColor.needsUpdate = true;
  }

  // ---------- per frame ----------
  TR.update = function (dt) {
    const R = G.run && G.run.trinket, s = G.stats;
    if (!R) return;
    TR.t += dt;
    // Adrenaline Rush (talent) speeds this up for a moment after you are hit
    const rec = dt * (1 + Math.max(-0.9, s.trinketCdr || 0)) * G.tfx.trinketRate();
    if (TR.effectOn && TR.t >= TR.effectEnd) { TR.effectOn = false; G.tfx.onTrinketEnd(); }
    // charges come back one at a time
    const maxC = TR.maxCharges();
    for (const id of R.owned) {
      const ch = TR.charges(id), D = G.TRINKETS[id];
      if (ch >= maxC) { R.ch[id] = maxC; delete R.cd[id]; continue; }
      if (!(R.cd[id] > 0)) R.cd[id] = D.cooldown;
      if ((R.cd[id] -= rec) <= 0) {
        R.ch[id] = ch + 1;
        if (ch + 1 < maxC) R.cd[id] += D.cooldown; else delete R.cd[id];
      }
    }
    TR.killT = Math.max(0, TR.killT - dt);
    TR.frozen = Math.max(0, TR.frozen - dt);
    if (TR.ember && (TR.ember.t -= dt) <= 0) TR.ember = null;
    // The Moment: every burn inflicted recently heals you
    const E = TR.moment;
    if (E) {
      while (TR.burns.length && TR.burns[0] < TR.t - E.recent) TR.burns.shift();
      const regen = Math.min(E.regenCap, TR.burns.length * E.regenPerBurn);
      if (regen > 0 && !P.dead) G.playerSys.heal(regen * dt, false);
      if (!P.buffs[E.buff] && !TR.burns.length) TR.moment = null;
    }
    // Holy Lantern ground
    for (const z of TR.zones) {
      z.t -= dt; z.tick -= dt;
      z.light.intensity = 1.6 * Math.min(1, z.t);
      if (Math.random() < dt * 24) { const a = Math.random() * Math.PI * 2, r = Math.random() * z.r; F.rise(z.x + Math.cos(a) * r, 0.1, z.z + Math.sin(a) * r, HOLY, 1, 0.2, 2.2, 0.14, 0.7); }
      if (!P.dead && Math.hypot(P.x - z.x, P.z - z.z) < z.r) G.playerSys.heal(z.regen * dt, false);
      if (z.tick <= 0) {
        z.tick = 0.25;
        // the Holy Lantern's ground burns, and sets every monster it touches on holy fire
        let lit = false;
        ES.query(z.x, z.z, z.r + 3, (e) => {
          if (e.dead || e.y > 1.5 || Math.hypot(e.x - z.x, e.z - z.z) > z.r + e.r) return;
          C.damage(e, s.maxHp * z.burn * 0.25 * C.mult('holyGround'), 'holy', 'elemental', 'holyGround');
          C.burn(e, s.dmg * G.DOTS.holy.damage * C.mult('holyFire'), G.DOTS.holy.duration, 'scaled'); lit = true;
        });
        if (lit) A.play('holyBurn');
      }
    }
    for (const z of TR.zones) if (z.t <= 0) G.scene.remove(z.light);
    TR.zones = TR.zones.filter((z) => z.t > 0);
    // fireflies circle you and zap
    const fl = TR.flies;
    if (fl) {
      fl.t -= dt; fl.ang += dt * 2.2; fl.tick -= dt;
      fl.pos = [];
      for (let i = 0; i < fl.n; i++) {
        const a = fl.ang + i / fl.n * Math.PI * 2, r = 2.2 + Math.sin(TR.t * 2 + i) * 0.4;
        fl.pos.push({ x: P.x + Math.cos(a) * r, y: 1.3 + Math.sin(TR.t * 3 + i * 1.7) * 0.35, z: P.z + Math.sin(a) * r });
      }
      for (const p of fl.pos) F.glow.add(p.x, p.y, p.z, 0, 0, 0, 0.12, 0.16, 0xd8ff6a, 0, 1);
      if (fl.tick <= 0) {
        fl.tick = fl.every;
        let zap = false;
        for (const p of fl.pos) {
          const e = ES.nearest(p.x, p.z, fl.range);
          if (!e) continue;
          F.streak(p.x, p.y, p.z, e.x, 1 + e.y, e.z, 0xd8ff6a, 0.12, 0.06);
          C.elementalHit(e, s.dmg * fl.share * C.mult('fireflies'), 'fireflies', { shock: fl.shock }); zap = true;
        }
        if (zap) A.play('zap');
      }
      if (fl.t <= 0) TR.flies = null;
    }
    // the scarecrow: monsters chase it (entities.js), then it explodes
    const d = TR.decoy;
    if (d) {
      d.t -= dt;
      d.mesh.rotation.z = Math.sin(TR.t * 9) * 0.05 * (1 - d.t / d.dur);
      if (Math.random() < dt * 8) F.rise(d.x, 1.8, d.z, 0xffb050, 1, 0.4, 1.2, 0.12, 0.6);
      if (d.t <= 0) {
        G.scene.remove(d.mesh);
        // every monster the blast kills adds elemental damage to your weapon hits for a while
        C.explQ.push({ x: d.x, z: d.z, dmg: s.maxHp * d.power, r: d.radius, delay: 0, onDone: (k) => {
          if (!k) return;
          TR.ember = { t: d.emberFor, dur: d.emberFor, kills: k, share: Math.min(d.emberCap, k * d.perKill) };
          F.num(P.x, 3.4, P.z, `EMBERS +${Math.round(TR.ember.share * 100)}% ELEMENTAL`, '#ffb050', 15); A.play('warcry');
        } });
        F.burst(d.x, 1.2, d.z, { n: 24, color: [0xe8c25a, 0xbf9a3c, 0xc8a066], speed: 9, life: 0.8, size: 0.2 });
        TR.decoy = null;
      }
    }
    // venom spreading
    const vn = TR.venom;
    if (vn) {
      vn.t -= dt; vn.tick -= dt;
      if (vn.tick <= 0) { vn.tick = 0.5; spreadVenom(vn); }
      if (vn.t <= 0) TR.venom = null;
    }
    // the Voodoo Doll's curse
    updateCurse(dt);
    // the Tell-Tale Heart's bursting hearts, a few every frame
    if (TR.pops.length) {
      TR.popAcc += TR.popRate * dt;
      while (TR.popAcc >= 1 && TR.pops.length) { TR.popAcc--; const p = TR.pops.shift(); pop(p.e, p.E); }
    }
  };
  // Where the scarecrow pulls a monster, or null (entities.js).
  TR.lure = function (e) {
    const d = TR.decoy;
    return d && !e.boss && Math.hypot(e.x - d.x, e.z - d.z) < d.range ? d : null;
  };

  // Buff bar chips for what a trinket left running: { id, name, icon, color, text, fill, active, lines }.
  TR.chips = function () {
    const out = [], chip = (id, name, icon, color, left, dur, line) => out.push({ id, name, icon, color, text: left < 9.95 ? left.toFixed(1) : String(Math.ceil(left)), fill: 1 - left / dur, active: true, lines: [line, `${left.toFixed(1)}s left`] });
    for (const z of TR.zones) chip('tr_lantern', 'Holy Ground', 'lantern', '#ffe080', z.t, z.dur, 'Burning holy ground: monsters in it burn, you heal while you stand in it.');
    if (TR.flies) chip('tr_flies', 'Fireflies', 'fireflies', '#d8ff6a', TR.flies.t, TR.flies.dur, `${TR.flies.n} fireflies zap monsters around you.`);
    if (TR.decoy) chip('tr_decoy', 'Scarecrow', 'scarecrow', '#e8c25a', TR.decoy.t, TR.decoy.dur, 'Monsters chase the scarecrow until it explodes.');
    const cu = TR.curse;
    if (cu) chip('tr_voodoo', 'Voodoo Curse', 'voodoo', '#c08aff', Math.max(0, cu.t), cu.dur, `${cu.e.def.name} loses ${Math.round(cu.loss * 100)}% of its health over ${cu.dur}s; ${cu.grips.size} more monster${cu.grips.size === 1 ? ' is' : 's are'} gripped and take the same.`);
    if (TR.venom) chip('tr_venom', 'Volatile Venom', 'venomvial', '#8aef4a', TR.venom.t, TR.venom.dur, `Poisoned monsters spread their poisons to everything within ${TR.venom.r} m.`);
    if (TR.frozen > 0) chip('tr_time', 'Time Stopped', 'pocketwatch', '#c8e0ff', TR.frozen, 4, 'Frozen monsters are shocked; enemy shots hang in the air.');
    if (TR.ember) chip('tr_ember', 'Scarecrow Embers', 'flame', '#ffb050', TR.ember.t, TR.ember.dur, `+${Math.round(TR.ember.share * 100)}% of your hit damage as extra elemental damage (${TR.ember.kills} killed by the blast).`);
    const E = TR.moment;
    if (E && TR.burns.length) out.push({ id: 'tr_moment', name: 'Holy Regeneration', icon: 'heart', color: '#ffe080', text: `+${Math.min(E.regenCap, TR.burns.length * E.regenPerBurn)}`, fill: 0, active: true,
      lines: [`${TR.burns.length} burns in the last ${E.recent}s`, `+${Math.min(E.regenCap, TR.burns.length * E.regenPerBurn)} health per second`] });
    return out;
  };
})();
