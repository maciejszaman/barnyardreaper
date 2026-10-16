'use strict';
// Chests (data/stages.json > chests): each holds one random item. Every day starts with a couple of
// free chests right next to you, which open when you walk up to them. More turn up at random spots
// while the day is fought; those cost essence (press E next to one), and the later in the day a chest
// turns up, the more it costs. Unopened chests stay until you take the cellar trapdoor.
// The first free chest of each day is a Weapon Chest that always holds a weapon (chests.weaponChest).
// Also here: experience barrels (stages.json barrels) that break open when you walk into them and
// give you a level, and shrines (stages.json shrines): a Shrine of Mary you walk into for Empowered
// Faith, or at night sometimes an Unholy Shrine with a goat on its roof, where E makes a pact (Apostasy).
(function () {
  const U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player;
  const CH = G.chests = { list: [], next: 0, startFree: 0, barrels: [], nextBarrel: 0, shrines: [], nextShrine: 0, apo: null };
  const GOLD = 0xffd04a;

  CH.reset = function () { CH.clear(); CH.newDay(); CH.apo = null; };
  // The day's free chests are placed beside you on the first frame of the fight (CH.update).
  CH.newDay = function () { CH.next = G.CHESTS.first; CH.startFree = G.CHESTS.freeAtStart; CH.nextBarrel = G.BARRELS.first; CH.nextShrine = G.SHRINES.first; };
  CH.clear = function () {
    for (const c of CH.list) remove(c);
    CH.list.length = 0;
    for (const b of CH.barrels) remove(b);
    CH.barrels.length = 0;
    for (const s of CH.shrines) remove(s);
    CH.shrines.length = 0;
  };
  function remove(c) {
    G.scene.remove(c.m.root);
    c.m.root.traverse((o) => o.geometry && o.geometry.dispose());
    c.m.glowMat.dispose();
  }
  // What a chest that turns up now costs.
  CH.priceNow = function () {
    const C = G.CHESTS;
    return Math.round(C.cost + C.costPerMinute * G.dayT / 60);
  };
  // A free spot a few steps from the cat, for the day's free chests.
  function besideYou(i, n) {
    for (let k = 0; k < 12; k++) {
      const a = Math.PI + (i - (n - 1) / 2) * 0.9 + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5 : 0), r = 3.2 + Math.floor(k / 6) * 1.5;
      const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
      if (!W.blocked(x, z, 1.2) && !CH.list.some((c) => Math.hypot(c.x - x, c.z - z) < 2.2)) return [x, z];
    }
    return null;
  }

  // A free spot inside the fence, away from buildings, caves, altars, other chests and the player.
  function spot() {
    const C = G.CHESTS;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 80; i++) {
        const x = U.rnd(-C.area, C.area), z = U.rnd(-C.area, C.area);
        if (W.blocked(x, z, 1.8)) continue;
        if (pass === 0 && Math.hypot(x - P.x, z - P.z) < C.minPlayerDistance) continue;
        if (W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
        if (G.altars.list.some((a) => Math.hypot(a.x - x, a.z - z) < 6)) continue;
        if (CH.list.some((c) => Math.hypot(c.x - x, c.z - z) < 8)) continue;
        return [x, z];
      }
    }
    return null;
  }
  // free: one of the day's free chests, placed beside you (i of n). weapon: a Weapon Chest.
  CH.spawn = function (free, i = 0, n = 1, weapon = false) {
    const p = free ? besideYou(i, n) || spot() : spot();
    if (!p) return null;
    const [x, z] = p, m = M.chest(), cost = free ? 0 : CH.priceNow();
    m.root.position.set(x, -1, z); m.root.rotation.y = Math.atan2(P.x - x, P.z - z);
    m.glowMat.color.setRGB(0.15, 0.12, 0.05);
    G.scene.add(m.root);
    const c = { x, z, m, cost, weapon, state: 'rising', t: 0 };
    CH.list.push(c);
    F.dust(x, z, 10); F.ring(x, z, { r0: 0.4, r1: 2.6, life: 0.6, color: GOLD });
    A.play('chest');
    if (cost) G.ui.toast(`A chest appeared · ${cost} essence to open`, '#ffd04a');
    return c;
  };
  function open(c) {
    if (c.cost) G.run.essence -= c.cost;
    c.state = 'open'; c.t = 0;
    G.run.chests = (G.run.chests || 0) + 1;
    A.play('chestopen'); F.flash('#fff0b0', 0.15);
    F.burst(c.x, 1, c.z, { n: 22, color: [GOLD, 0xfff4c0], glow: true, speed: 5, life: 0.7, size: 0.16, up: 1 });
  }
  // The chest within reach that costs essence, if any.
  const near = () => CH.list.find((c) => c.state === 'idle' && c.cost > 0 && Math.hypot(P.x - c.x, P.z - c.z) < G.CHESTS.pickupRadius + 0.6);
  // E next to a paid chest: open it if you can afford it; next to an Unholy Shrine: make the pact.
  // Returns true when something was in reach.
  CH.use = function () {
    const sh = nearUnholy();
    if (sh) { pact(sh); return true; }
    const c = near();
    if (!c) return false;
    if (G.run.essence < c.cost) { G.ui.toast(`Not enough essence · this chest costs ${c.cost}`, '#ff6a4a'); A.play('click'); return true; }
    open(c);
    return true;
  };

  CH.update = function (dt) {
    const C = G.CHESTS;
    // the day's free chests, right beside you as the fight begins
    if (G.phase === 'fight' && CH.startFree > 0) {
      const n = CH.startFree;
      CH.startFree = 0;
      for (let i = 0; i < n; i++) CH.spawn(true, i, n, i === 0 && C.weaponChest >= 0);
      G.ui.toast(`${n} free chest${n === 1 ? '' : 's'} beside you${C.weaponChest >= 0 ? ', one of them a Weapon Chest' : ''}!`, '#ffd04a');
    }
    // a new chest every few dozen seconds of the fight (at most maxStanding unopened at once)
    if (G.phase === 'fight' && G.dayT >= CH.next && CH.next < G.DAY_SECONDS) {
      CH.next += U.rnd(C.every[0], C.every[1]);
      if (CH.list.filter((c) => c.state !== 'open').length < C.maxStanding) CH.spawn();
    }
    for (const c of CH.list) {
      c.t += dt;
      const r = c.m.root;
      if (c.state === 'rising') {
        const k = Math.min(1, c.t / 0.8);
        r.position.y = -1 * (1 - k) * (1 - k);
        if (k >= 1) { c.state = 'idle'; c.t = 0; }
      } else if (c.state === 'idle') {
        const p = 0.5 + Math.sin(c.t * 3) * 0.2;
        c.m.glowMat.color.setRGB(p, p * 0.8, p * 0.25);
        if (Math.random() < dt * 4) F.rise(c.x + U.rnd(-0.5, 0.5), 0.8, c.z + U.rnd(-0.5, 0.5), c.cost ? 0xffb050 : GOLD, 1, 0.3, 1.4, 0.1, 0.8);
        // free chests open when you walk up to them
        if (!c.cost && !P.dead && G.state === 'playing' && Math.hypot(P.x - c.x, P.z - c.z) < C.pickupRadius) open(c);
      } else {
        // open: the lid swings back, the item pops out, then the chest sinks away
        c.m.lid.rotation.x = -Math.min(1, c.t / 0.35) * 1.9;
        c.m.glowMat.color.setRGB(1, 0.85, 0.4).multiplyScalar(Math.max(0.2, 1 - c.t / 2));
        if (!c.dropped && c.t >= 0.3) {
          c.dropped = true;
          const a = Math.atan2(P.x - c.x, P.z - c.z);
          const it = c.weapon ? G.makeItem('weapon', C.weaponChest, G.danger, null, { ilvl: G.rollItemLevel(), tags: G.map().tags }) : G.combat.rollItem(C.minRarity, C.luck);
          G.pickups.dropItem(c.x + Math.sin(a) * 1.3, c.z + Math.cos(a) * 1.3, it);
          F.burst(c.x, 1.1, c.z, { n: 12, color: [GOLD, 0xffffff], glow: true, speed: 3, life: 0.5, size: 0.14, up: 1 });
        }
        if (c.t > 2.2) r.position.y = -(c.t - 2.2) * 1.6;
        if (c.t > 3) c.gone = true;
      }
    }
    for (let i = CH.list.length - 1; i >= 0; i--) if (CH.list[i].gone) { remove(CH.list[i]); CH.list.splice(i, 1); }
    updateBarrels(dt);
    updateShrines(dt);
  };

  // ---------- experience barrels ----------
  CH.spawnBarrel = function () {
    const B = G.BARRELS, p = spot();
    if (!p) return null;
    const [x, z] = p, m = M.barrel();
    m.root.position.set(x, -1.2, z); m.root.rotation.y = Math.random() * 6;
    G.scene.add(m.root);
    const b = { x, z, m, state: 'rising', t: 0, barrel: true };
    CH.barrels.push(b);
    F.dust(x, z, 8); F.ring(x, z, { r0: 0.4, r1: 2.2, life: 0.6, color: 0x7dff6a }); A.play('chest');
    G.ui.toast('An experience barrel rolled out · break it for a level!', '#7dff6a');
    return b;
  };
  function breakBarrel(b) {
    const B = G.BARRELS;
    b.state = 'broken'; b.t = 0;
    F.burst(b.x, 0.7, b.z, { n: 26, color: [0x8a5a2b, 0x5a3a1c, 0x3a3d43], speed: 7, life: 0.9, size: 0.2, up: 1 });
    F.burst(b.x, 1.2, b.z, { n: 30, color: [0x7dff6a, 0xd8ffc0, 0xffffff], glow: true, speed: 6, life: 0.8, size: 0.18, up: 1.4 });
    F.ring(b.x, b.z, { r0: 0.4, r1: 3, life: 0.5, color: 0x7dff6a }); A.play('barrel');
    G.run.barrels = (G.run.barrels || 0) + 1;
    G.progress.grantLevels(B.levels);
  }
  function updateBarrels(dt) {
    const B = G.BARRELS;
    if (G.phase === 'fight' && B.maxStanding > 0 && G.dayT >= CH.nextBarrel && CH.nextBarrel < G.DAY_SECONDS) {
      CH.nextBarrel += U.rnd(B.every[0], B.every[1]);
      if (CH.barrels.filter((b) => b.state !== 'broken').length < B.maxStanding) CH.spawnBarrel();
    }
    for (const b of CH.barrels) {
      b.t += dt;
      const r = b.m.root;
      if (b.state === 'rising') {
        const k = Math.min(1, b.t / 0.8);
        r.position.y = -1.2 * (1 - k) * (1 - k);
        if (k >= 1) { b.state = 'idle'; b.t = 0; }
      } else if (b.state === 'idle') {
        b.m.glowMat.color.setRGB(0.5, 1, 0.45).multiplyScalar(0.7 + Math.sin(b.t * 3) * 0.3);
        if (Math.random() < dt * 5) F.rise(b.x + U.rnd(-0.4, 0.4), 1.2, b.z + U.rnd(-0.4, 0.4), 0x7dff6a, 1, 0.3, 1.6, 0.12, 0.8);
        if (!P.dead && G.state === 'playing' && Math.hypot(P.x - b.x, P.z - b.z) < B.pickupRadius) breakBarrel(b);
      } else {
        r.visible = false;
        if (b.t > 0.2) b.gone = true;
      }
    }
    for (let i = CH.barrels.length - 1; i >= 0; i--) if (CH.barrels[i].gone) { remove(CH.barrels[i]); CH.barrels.splice(i, 1); }
  }

  // ---------- shrines ----------
  const SH = () => G.SHRINES;
  CH.apostate = () => !!(SH().apostasy.buff && P.buffs[SH().apostasy.buff]);
  CH.bleedMult = () => (CH.apostate() ? SH().apostasy.bleedMult : 1);
  // unholy: forced either way, or (left out) an Unholy Shrine with unholyChance once night has fallen, or
  // always on maps where every shrine is unholy (stages.json maps[].shrines)
  CH.spawnShrine = function (unholy) {
    const S = SH(), p = spot();
    if (!p) return null;
    if (unholy == null) unholy = G.map().shrines === 'unholy' || (G.tier >= S.nightFromStage && Math.random() < S.unholyChance);
    const [x, z] = p, m = M.shrine(unholy);
    m.root.position.set(x, -4.4, z); m.root.rotation.y = Math.atan2(P.x - x, P.z - z); m.root.scale.setScalar(1.35);
    G.scene.add(m.root);
    const s = { x, z, m, unholy, state: 'rising', t: 0, shrine: true };
    CH.shrines.push(s);
    F.dust(x, z, 12); F.ring(x, z, { r0: 0.4, r1: 2.6, life: 0.6, color: unholy ? 0xff2a1a : 0xffe080 }); A.play(unholy ? 'curse' : 'holy');
    G.ui.toast(unholy ? 'An Unholy Shrine rises · E to make a pact (Apostasy)' : 'A Shrine of Mary rises · walk in to pray (Empowered Faith)', unholy ? '#ff5a4a' : '#ffe080');
    return s;
  };
  // Walking into a Shrine of Mary: Empowered Faith.
  function pray(s) {
    const S = SH();
    s.state = 'used'; s.t = 0;
    const HR = G.stats.wfx.holyReaper, dur = G.BUFFS[S.faith.buff].duration * (HR ? HR.faith : 1);   // the scythe: it lasts longer
    G.playerSys.addBuff(S.faith.buff, dur);
    G.run.shrines = (G.run.shrines || 0) + 1;
    F.flash('#fff2c0', 0.4); F.ring(P.x, P.z, { r0: 0.5, r1: 4.5, life: 0.6, color: 0xffe080 }); A.play('holy');
    F.burst(s.x, 2, s.z, { n: 30, color: [0xffe080, 0xffffff, 0x8ab8ff], glow: true, speed: 5, life: 1, size: 0.16, up: 1.4 });
    const B = G.BUFFS[S.faith.buff];
    G.ui.banner(B.name, `Armor doubled, faster feet, and holy fire on everything near you when you are hit · ${Math.round(dur)}s`, '#ffe080');
  }
  // E at an Unholy Shrine: Apostasy, paid for in blood.
  function pact(s) {
    const S = SH();
    s.state = 'used'; s.t = 0;
    G.playerSys.addBuff(S.apostasy.buff);
    CH.apo = { left: G.stats.maxHp * S.apostasy.total, acc: 0 };
    G.run.shrines = (G.run.shrines || 0) + 1;
    F.flash('#4a0000', 0.6); F.shake(0.5); F.ring(P.x, P.z, { r0: 0.5, r1: 5, life: 0.6, color: 0xff2a1a }); A.play('roar'); A.play('curse');
    F.burst(s.x, 3.8, s.z, { n: 30, color: [0xff2a1a, 0x3a0000, 0x140a0a], speed: 5, life: 1.1, size: 0.2, up: 1 });
    G.ui.banner(G.BUFFS[S.apostasy.buff].name, `Your bleeds deal ×${S.apostasy.bleedMult} damage and always cripple, +30% attack speed, half the armor · it drinks ${Math.round(S.apostasy.total * 100)}% of your health`, '#ff4a3a');
  }
  const nearUnholy = () => CH.shrines.find((s) => s.unholy && s.state === 'idle' && Math.hypot(P.x - s.x, P.z - s.z) < SH().pickupRadius + 0.8);
  // Empowered Faith (playerSys.damage): every hit you take sets the monsters around you on holy fire.
  CH.onHit = function () {
    const F2 = SH().faith;
    if (!F2.buff || !P.buffs[F2.buff] || P.dead) return;
    let lit = 0;
    G.enemySys.query(P.x, P.z, F2.radius + 3, (e) => {
      if (e.dead || Math.hypot(e.x - P.x, e.z - P.z) > F2.radius + e.r) return;
      G.combat.burn(e, G.stats.dmg * F2.burn, G.DOTS.holy.duration, false); lit++;
    });
    F.ring(P.x, P.z, { r0: 0.4, r1: F2.radius + 0.5, life: 0.35, color: 0xffe080 });
    if (lit) A.play('holyBurn');
  };
  // Apostasy (playerSys.update): it drinks drain of your max health a second until it has had total of
  // it. It never takes your last point of health; when it has had its fill, it ends.
  CH.drain = function (dt) {
    const A2 = SH().apostasy, a = CH.apo;
    if (!a) return;
    if (!CH.apostate() || P.dead) { CH.apo = null; return; }
    const want = Math.min(a.left, G.stats.maxHp * A2.drain * dt), d = Math.max(0, Math.min(want, P.hp - 1));
    P.hp -= d; a.left -= want; a.acc += d; G.run.taken += d;
    if (a.acc >= G.stats.maxHp * 0.02) { F.num(P.x, 2.6, P.z, '-' + Math.round(a.acc), '#e0302a', 13); a.acc = 0; }
    if (Math.random() < dt * 10) F.solid.add(P.x + U.rnd(-0.3, 0.3), 1.2, P.z + U.rnd(-0.3, 0.3), 0, -1, 0, 0.6, 0.09, 0xc01a10, 10, 0.5);
    if (a.left <= 0) { delete P.buffs[A2.buff]; CH.apo = null; G.progress.recompute(); G.ui.toast('Apostasy has drunk its fill', '#e0302a'); }
  };
  function updateShrines(dt) {
    const S = SH();
    if (G.phase === 'fight' && S.maxStanding > 0 && G.dayT >= CH.nextShrine && CH.nextShrine < G.DAY_SECONDS) {
      CH.nextShrine += U.rnd(S.every[0], S.every[1]);
      if (CH.shrines.filter((s) => s.state !== 'used').length < S.maxStanding) CH.spawnShrine();
    }
    for (const s of CH.shrines) {
      s.t += dt;
      const r = s.m.root;
      if (s.state === 'rising') {
        const k = Math.min(1, s.t / 1.1);
        r.position.y = -4.4 * (1 - k) * (1 - k);
        if (Math.random() < dt * 20) F.dust(s.x + U.rnd(-1, 1), s.z + U.rnd(-1, 1), 1);
        if (k >= 1) { s.state = 'idle'; s.t = 0; }
      } else if (s.state === 'idle') {
        const p = 0.75 + Math.sin(s.t * 2.6) * 0.25;
        if (s.unholy) s.m.glowMat.color.setRGB(1.2 * p, 0.25 * p, 0.2 * p); else s.m.glowMat.color.setRGB(p * 1.1, p, p * 0.85);
        if (Math.random() < dt * 6) F.rise(s.x + U.rnd(-0.8, 0.8), 0.6, s.z + U.rnd(-0.6, 0.6), s.unholy ? 0xff3a1a : 0xffe080, 1, 0.3, 1.6, 0.12, 0.9);
        if (!s.unholy && !P.dead && G.state === 'playing' && Math.hypot(P.x - s.x, P.z - s.z) < S.pickupRadius) pray(s);
      } else {
        // used: the light goes out and it sinks back into the ground
        s.m.glowMat.color.multiplyScalar(Math.max(0, 1 - dt * 2));
        if (s.t > 1.2) r.position.y = -(s.t - 1.2) * 2.2;
        if (s.t > 2.8) s.gone = true;
      }
    }
    for (let i = CH.shrines.length - 1; i >= 0; i--) if (CH.shrines[i].gone) { remove(CH.shrines[i]); CH.shrines.splice(i, 1); }
  }

  // Label over a chest (free, or its price; E when it's in reach), or an arrow to an off-screen one.
  CH.drawOverlay = function (c, dpr) {
    const n = near();
    for (const ch of CH.list) {
      if (ch.state === 'open' || G.darkness.hidden(ch.x, ch.z)) continue;
      const can = !ch.cost || G.run.essence >= ch.cost, col = !ch.cost ? '#ffd04a' : can ? '#ffb050' : '#c8786a';
      if (!F.pointer(c, dpr, ch.x, ch.z, col, 'CHEST')) continue;
      const s = F.project(ch.x, 1.9, ch.z);
      if (!s) continue;
      const txt = ch.weapon ? 'Weapon Chest' : !ch.cost ? 'Free Chest' : `${ch === n ? 'E · ' : ''}Chest · ${ch.cost} essence`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
      const tw = c.measureText(txt).width + 10 * dpr;
      c.fillStyle = 'rgba(10,7,6,.75)'; c.fillRect(s.x - tw / 2, s.y - 10 * dpr, tw, 20 * dpr);
      c.fillStyle = col; c.fillText(txt, s.x, s.y + dpr);
    }
    const nu = nearUnholy();
    for (const s of CH.shrines) {
      if (s.state === 'used' || G.darkness.hidden(s.x, s.z) || !F.pointer(c, dpr, s.x, s.z, s.unholy ? '#ff4a3a' : '#ffe080', 'SHRINE')) continue;
      const p = F.project(s.x, s.unholy ? 6.4 : 4.9, s.z);
      if (!p) continue;
      const txt = s.unholy ? `${s === nu ? 'E · ' : ''}Unholy Shrine · Apostasy` : 'Shrine of Mary · walk in to pray';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
      const tw = c.measureText(txt).width + 10 * dpr;
      c.fillStyle = 'rgba(10,7,6,.75)'; c.fillRect(p.x - tw / 2, p.y - 10 * dpr, tw, 20 * dpr);
      c.fillStyle = s.unholy ? '#ff6a5a' : '#ffe080'; c.fillText(txt, p.x, p.y + dpr);
    }
    for (const b of CH.barrels) {
      if (b.state === 'broken' || G.darkness.hidden(b.x, b.z) || !F.pointer(c, dpr, b.x, b.z, '#7dff6a', 'XP')) continue;
      const s = F.project(b.x, 2.1, b.z);
      if (!s) continue;
      const txt = 'XP Barrel · +1 level';
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
      const tw = c.measureText(txt).width + 10 * dpr;
      c.fillStyle = 'rgba(10,7,6,.75)'; c.fillRect(s.x - tw / 2, s.y - 10 * dpr, tw, 20 * dpr);
      c.fillStyle = '#9dff8a'; c.fillText(txt, s.x, s.y + dpr);
    }
  };
})();
