'use strict';
// Days (data/stages.json): a run is a series of days (5 minutes each), each fought on one map. A day's
// danger stages change every STAGE_SECONDS; every EVENTS.every seconds an event (a boss, rare monsters, an
// alien invasion, the Eldritch Gaze...) arrives. The workbench by the farmhouse (scrap loot, upgrade item
// levels with Embers) stands all run long. When the day ends the monsters crumble and night falls (the pause
// between days, "camp" in the code): lamps light up by the house, the barn, the training dummy (it measures
// your damage per second) and the workbench, and the bonfire burns in the middle of the farm (bonfire.js).
// Praying at the bonfire is the only way to the next day, on the next map.
//   G.phase: 'fight' or 'camp' (= night). G.day: day index (0 = first). G.dayT: seconds into the day.
//   G.tier: stage of the day. G.danger: stages fought over the whole run (day x stages + tier).
(function () {
  const U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player, ES = G.enemySys, SP = G.spawner, PK = G.pickups;
  const DY = G.days = { pending: [], camp: null, bench: null };

  DY.reset = function () {
    G.day = 0;
    startDay();
    buildBench();
  };
  function startDay() {
    G.STAGES = G.map().stages;
    G.phase = 'fight'; G.dayT = 0; G.tier = 0; setDanger();
    DY.nextEvent = G.EVENTS.every; DY.pending.length = 0;
    G.talents.newDay(); G.altars.newDay(); G.chests.newDay(); G.mokosh.newDay(); G.dungeon.newDay();
    // where the day started, for the bonfire's summary of it (bonfire.js)
    const r = G.run;
    r.dayStart = { day: G.day, time: G.time, kills: r.kills, level: G.level, picks: G.pickList ? G.pickList.length : 0, embers: r.essenceTotal, dealt: r.dealt, taken: r.taken,
      totems: r.totems, chests: r.chests || 0, items: r.items || 0, bosses: r.bosses, invasions: r.invasions, peak: 0 };
    r.bonfireLit = false;
  }
  const setDanger = () => { G.danger = G.day * G.STAGES.length + G.tier; };

  // ---------- the fight ----------
  DY.update = function (dt) {
    updateBench(dt);
    if (G.phase !== 'fight') { updateCamp(dt); return; }
    G.time += dt; G.dayT += dt;
    const tier = Math.min(G.STAGES.length - 1, Math.floor(G.dayT / G.STAGE_SECONDS));
    if (tier !== G.tier) { G.tier = tier; setDanger(); onTier(); }
    if (G.dayT >= DY.nextEvent && DY.nextEvent < G.DAY_SECONDS) { DY.nextEvent += G.EVENTS.every; event(); }
    for (const b of DY.pending) if ((b.t -= dt) <= 0) { b.done = true; SP.spawnBoss(b.cave, b.type); }
    DY.pending = DY.pending.filter((b) => !b.done);
    if (G.dayT >= G.DAY_SECONDS) dawn();
  };
  function onTier() {
    const t = G.tier, st = G.stageAt(t);
    W.setPhaseTarget(t); A.setIntensity(G.danger); A.play('bell');
    F.flash('#2a0a08', 0.35);
    const sub = st.message || `Monsters now spawn with +${Math.round((G.diffHp() - 1) * 100)}% health and +${Math.round((G.diffDmg() - 1) * 100)}% damage · ${+G.spawnMult().toFixed(1)}× as many`;
    G.ui.banner(`Danger ${U.roman(t)}: ${st.name}`, sub, '#ff7a5a');
  }
  DY.forceEvent = (kind) => { if (G.phase === 'fight') event(kind); };
  // Debug: end the day now and wake on the next map (no prayer needed).
  DY.skipDay = function () {
    if (G.phase === 'fight') { G.time += G.DAY_SECONDS - G.dayT; G.dayT = G.DAY_SECONDS; dawn(); }
    if (G.phase === 'camp') travel();
  };
  // Debug: jump the day's clock to t seconds. Fighting time moves with it (monster growth), and the
  // event, altar and chest schedules skip ahead instead of all firing at once.
  DY.skipTo = function (t) {
    if (G.phase !== 'fight' || t <= G.dayT) return;
    G.time += t - G.dayT; G.dayT = t;
    while (DY.nextEvent <= t) DY.nextEvent += G.EVENTS.every;
    while (G.altars.next <= t) G.altars.next += G.ALTAR.every;
    while (G.chests.next <= t) G.chests.next += G.CHESTS.every[0];
  };
  DY.nextEventIn = () => (DY.nextEvent < G.DAY_SECONDS ? DY.nextEvent - G.dayT : null);

  // ---------- events: a boss, rare monsters or an invasion ----------
  const bossesUp = () => ES.list.filter((e) => e.boss && !e.rare && !e.dead).length + DY.pending.length;
  // force: 'boss', 'rares', 'invasion', 'ritual', 'cauldron', 'gaze' or 'darkness' instead of a random pick (debug menu).
  function event(force) {
    const E = G.EVENTS, map = G.map(), w = Object.assign({}, map.events || E.weights);
    if (!Object.keys(map.bosses).length || bossesUp() >= E.maxBosses) w.boss = 0;
    if (!G.INVASION || G.invasion.on) w.invasion = 0;
    if (!G.RITUAL.doctor || G.ritual.on || bossesUp() >= E.maxBosses) w.ritual = 0;
    if (!G.CAULDRON.enemy || G.ritual.cauldrons() >= G.CAULDRON.max) w.cauldron = 0;
    if (!G.GAZE.enemy || G.gaze.on) w.gaze = 0;
    if (!G.DARKNESS || G.darkness.on) w.darkness = 0;
    const kinds = Object.keys(w).filter((k) => w[k] > 0);
    const kind = force || (kinds.length ? U.weighted(kinds, (k) => w[k]) : 'rares');
    const cave = U.pick(W.caves);
    if (kind === 'boss') {
      const type = U.weighted(Object.keys(map.bosses), (k) => map.bosses[k]);
      cave.warn = E.bossWarning;
      DY.pending.push({ t: E.bossWarning, cave, type });
      G.ui.banner('The ground trembles', `${G.ENEMIES[type].name} stirs in ${cave.name}`, '#ffb070');
      A.play('roar'); F.shake(0.3);
    } else if (kind === 'invasion') {
      G.invasion.start();
    } else if (kind === 'ritual') {
      G.ritual.start();
    } else if (kind === 'cauldron') {
      G.ritual.cauldron();
    } else if (kind === 'gaze') {
      G.gaze.start();
    } else if (kind === 'darkness') {
      G.darkness.start();
    } else {
      cave.warn = 2; A.play('horn');
      const rs = SP.spawnRares(cave);
      G.ui.toast(`${rs.length} rare monsters crawl out of ${cave.name}!`, G.RARITY[1].color);
    }
  }

  // ---------- nightfall: the pause between days ----------
  // (named dawn() from when the camp opened at dawn; the rules trigger is still 'dawn')
  function dawn() {
    G.phase = 'camp';
    G.run.days++;
    // the monsters crumble as the night falls (no loot)
    for (const e of ES.list) {
      if (e.dead) continue;
      e.dead = true; e.hp = 0; e.dying = e.boss ? 1.2 : 0.3;
      F.burst(e.x, 0.8 + e.y, e.z, { n: e.boss ? 30 : 5, color: [0xfff0c0, 0xffd080], glow: true, speed: 3, life: 0.8, size: 0.14 * e.scale });
    }
    G.ui.bossBar(null); G.enemyShots.clear(); G.invasion.clear(); G.mech.clear(); G.ritual.clear(); G.gaze.clear(); G.darkness.clear();
    SP.bursts.length = 0; DY.pending.length = 0;
    for (const c of W.caves) c.warn = 0;
    PK.magnetAll();
    W.setNight(true); A.setIntensity(0);
    buildCamp(); G.bonfire.build();
    G.progress.restock();
    F.flash('#1a1430', 0.6); A.play('dawn');
    G.ui.banner(`Night falls · Day ${G.day + 1} survived`, 'The monsters crumble. The workbench has new stock and the dummy waits behind the barn. Warm yourself at the bonfire (E), then pray to wake on the next day.', '#ffd27a');
  }
  function prop(m, x, z) {
    const g = new THREE.Group();
    g.add(M.mesh(m.parts));
    if (m.glow) g.add(M.mesh(m.glow, true));
    if (m.dark) g.add(M.mesh(m.dark, true));
    g.position.set(x, -1.6, z); G.scene.add(g);
    F.dust(x, z, 14); F.ring(x, z, { r0: 0.5, r1: 3.5, life: 0.7, color: 0xffd27a });
    return g;
  }
  const unprop = (g) => { G.scene.remove(g); g.traverse((m) => m.geometry && m.geometry.dispose()); };
  const uncollide = (c) => { const i = W.colliders.indexOf(c); if (i >= 0) W.colliders.splice(i, 1); };
  // The workbench rises at the start of a run and stays until the run ends.
  function buildBench() {
    const [x, z] = G.CAMP.workbench, col = { t: 1, x, z, hw: 1.25, hd: 0.6 };
    W.colliders.push(col);
    DY.bench = { x, z, g: prop(M.workbench(), x, z), near: false, col };
  }
  function clearBench() {
    if (!DY.bench) return;
    unprop(DY.bench.g); uncollide(DY.bench.col);
    DY.bench = null;
  }
  // Nightfall: the training dummy, and lamp posts by the house, the barn, the dummy and the workbench (their
  // lights are world.js's, made at start and lit by the night).
  function buildCamp() {
    const C = G.CAMP, [dx, dz] = C.dummy;
    const dummy = ES.spawn('training_dummy', dx, dz);
    Object.assign(dummy, { dummy: true, maxHp: 1e12, hp: 1e12, yaw: Math.PI / 2, lockYaw: true });
    const col = { t: 0, x: dx, z: dz, r: 0.5 };
    W.colliders.push(col);
    F.dust(dx, dz, 10);
    const lamps = C.night.lamps.map(([x, z]) => { const c2 = { t: 0, x, z, r: 0.3 }; W.colliders.push(c2); return { g: prop(M.lampParts(), x, z), col: c2 }; });
    DY.camp = { dummy, col, lamps, t: 0 };
    DY.dps = { log: [], start: 0, last: -99, best: 0 };
  }
  function clearCamp() {
    const c = DY.camp;
    if (!c) return;
    uncollide(c.col);
    for (const l of c.lamps) { unprop(l.g); uncollide(l.col); }
    const i = ES.list.indexOf(c.dummy);
    if (i >= 0) ES.list.splice(i, 1);
    DY.camp = null;
  }
  // Damage on the dummy (combat.js): DPS over the last few seconds of the current streak of hits.
  const DPS_WINDOW = 5;
  DY.dummyHit = function (dmg) {
    const c = DY.camp, d = DY.dps;
    if (!c) return;
    if (c.t - d.last > 2.5) { d.log.length = 0; d.start = c.t; }
    d.last = c.t; d.log.push({ t: c.t, d: dmg });
  };
  function dpsNow() {
    const c = DY.camp, d = DY.dps;
    while (d.log.length && d.log[0].t < c.t - DPS_WINDOW) d.log.shift();
    if (!d.log.length || c.t - d.last > 2.5) return 0;
    const span = U.clamp(c.t - d.start, 1, DPS_WINDOW);
    return d.log.reduce((a, l) => a + l.d, 0) / span;
  }
  // Next to the workbench while fighting: E opens it.
  DY.useBench = function () {
    const b = DY.bench;
    if (b && Math.hypot(P.x - b.x, P.z - b.z) < 3) G.openBench();
  };
  function updateBench(dt) {
    const b = DY.bench;
    if (!b) return;
    b.g.position.y = U.damp(b.g.position.y, 0, 4, dt);
    // at night, walking up to the workbench opens it (once per visit)
    const db = Math.hypot(P.x - b.x, P.z - b.z);
    if (db < 2.4 && !b.near) { b.near = true; if (G.phase === 'camp' && !P.dead) G.openBench(); }
    else if (db > 3.4) b.near = false;
  }
  function updateCamp(dt) {
    const c = DY.camp;
    if (!c || P.dead) return;
    c.t += dt;
    for (const l of c.lamps) l.g.position.y = U.damp(l.g.position.y, 0, 4, dt);
    const d = DY.dps, now = dpsNow();
    d.best = Math.max(d.best, c.t - d.start >= 2 ? now : 0);
    G.bonfire.update(dt);
  }
  // The next day (bonfire.js calls it once a prayer has turned the screen white): you wake on the next map
  // in the morning light.
  function travel() {
    const left = G.altars.claimAll();
    clearCamp(); G.bonfire.clear(); G.chests.clear(); G.mokosh.clear(); G.ritual.clear(); G.trinkets.clear(); PK.clear(); G.combat.reset(true); F.clear();
    G.day++;
    startDay();
    W.setMap(G.map()); W.phase = 0; W.setPhaseTarget(0); W.setNight(false, true);
    SP.acc = 0; SP.hordeT = G.SPAWNING.hordes.first; SP.bursts.length = 0;
    P.x = 0; P.z = 0; P.vx = P.vz = P.kbx = P.kbz = 0;
    W.updateCamera(0, P.x, P.z, true);
    A.play('bell');
    const m = G.map(), extra = G.extraDays();
    G.ui.banner(`Day ${G.day + 1}: ${m.name}${extra ? ' ' + U.roman(extra) : ''}`, m.message || 'Hold out until nightfall.', '#f2c04e');
    if (left) G.ui.toast(`${left} unclaimed Totem${left === 1 ? '' : 's'} of Power came with you`, '#6ff0ff');
  }
  DY.travel = travel;
  DY.clear = function () { clearCamp(); clearBench(); G.bonfire.clear(); };

  // Labels for the workbench, and at night arrows to the dummy (with its DPS readout) and the bonfire.
  DY.drawOverlay = function (c, dpr) {
    const cp = DY.camp, b = DY.bench, camp = cp && G.phase === 'camp';
    const box = (s, txt, col, size) => {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(size * dpr)}px VT323, monospace`;
      const tw = c.measureText(txt).width + 10 * dpr, h = (size + 1) * dpr;
      c.fillStyle = 'rgba(10,7,6,.75)'; c.fillRect(s.x - tw / 2, s.y - h / 2, tw, h);
      c.fillStyle = col; c.fillText(txt, s.x, s.y + dpr);
    };
    const label = (x, z, h, txt, col, arrow) => {
      if (G.darkness.hidden(x, z)) return;   // lost in The Dark
      if (arrow && !F.pointer(c, dpr, x, z, col, txt.split(' ')[0].toUpperCase())) return;
      const s = F.project(x, h, z);
      if (s) box(s, txt, col, 19);
    };
    if (b) {
      const near = Math.hypot(P.x - b.x, P.z - b.z) < 3;
      label(b.x, b.z, 3, near && !camp ? 'E · Workbench' : 'Workbench', '#ffd27a', camp);
    }
    if (!camp) return;
    G.bonfire.drawOverlay(c, dpr, box);
    const dm = cp.dummy;
    if (!F.pointer(c, dpr, dm.x, dm.z, '#ff8a6a', 'DUMMY')) return;
    const s = F.project(dm.x, 3.1, dm.z);
    if (!s) return;
    const now = dpsNow(), fmt = (v) => Math.round(v).toLocaleString('en-US');
    box(s, now > 0 ? `${fmt(now)} DPS` : 'Training Dummy', now > 0 ? '#ffe08a' : '#ff8a6a', 24);
    if (DY.dps.best > 0) box({ x: s.x, y: s.y - 24 * dpr }, `best ${fmt(DY.dps.best)} DPS`, '#c8b8a0', 17);
  };
})();
