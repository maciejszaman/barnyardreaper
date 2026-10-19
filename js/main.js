'use strict';
// Main: boot, state machine (title → playing ⇄ levelup/inventory/talents/bench/bonfire/paused → dying → gameover;
// bonfire → praying → playing on the next day) and the frame loop.
// Names (CLAUDE.md): G.run.spoons = Miracles, G.run.essence = Embers, the panel tab 'alien' = Miracles.
(function () {
  const U = G.U, A = G.audio, F = G.fx, W = G.world, P = G.player;
  G.state = 'title'; G.time = 0; G.tier = 0; G.day = 0; G.dayT = 0; G.danger = 0; G.phase = 'fight'; G.offers = [];
  // totems / spoons: talent currency collected this run (spoons = Miracles). talents: { talentId: rank } learned this run.
  // byType: damage dealt per damage type (G.DMG_TYPES). essence: Embers in hand (the workbench currency).
  // items: gear picked up. dayStart: where the current day started (day.js), for the bonfire's summary.
  const newRun = () => ({ kills: 0, dealt: 0, taken: 0, blocks: 0, crits: 0, doublecrits: 0, bosses: 0, rares: 0, totems: 0, spoons: 0, chests: 0, items: 0, invasions: 0, livesUsed: 0, ricochets: 0, explosions: 0,
    days: 0, essence: 0, essenceTotal: 0, talents: {}, banned: [], mokosh: { cut: 0, weave: 0 }, dayPts: { totem: 0, spoon: 0 }, byType: { physical: 0, poison: 0, elemental: 0 }, bySrc: {}, killsBy: {}, tl: [] });
  G.newRun = newRun;
  // The title scene keeps animating behind the talent screen when it was opened from the title.
  G.onTitle = () => G.state === 'title' || G.state === 'select' || (G.state === 'inventory' && G.panelFrom === 'title') || (G.state === 'book' && G.bookFrom === 'title');

  function resetWorld() {
    G.bonfire.reset(); G.dungeon.reset(); G.gaze.clear(); G.darkness.clear(); G.enemySys.clear(); G.combat.reset(); G.pickups.clear(); G.altars.reset(); G.invasion.reset(); G.chests.reset(); G.mokosh.clear(); G.mech.clear(); G.ritual.clear(); G.days.clear(); G.tfx.reset(); G.rules.reset(); F.clear();
    G.time = 0; G.run = newRun();
    G.days.reset(); W.setMap(G.map()); W.setNight(false, true);
    G.progress.reset(); G.progress.restock(); G.trinkets.reset(); G.playerSys.reset(); G.playerSys.setWeapon(G.equip.weapon.wtype); G.playerSys.setHat(G.CHAR.hat);
    G.spawner.reset();
    for (const c of W.caves) c.warn = 0;
    G.ui.bossBar(null); G.ui.resetHUD();
    G.input.dash = false;
  }

  // A new run: the intro cutscene (intro.js; any key skips it), then the fight starts with three
  // blessings to pick.
  G.newGame = function () {
    A.init();
    resetWorld();
    W.phase = 0; W.setPhaseTarget(0);
    A.setIntensity(0);
    G.intro.start(startRun);
  };
  function startRun() {
    G.playerSys.reset();
    W.updateCamera(0, 0, 0, true);
    G.state = 'playing';
    G.ui.show(null);
    const m = G.map();
    G.ui.banner(`Day 1: ${m.name}`, m.message || 'Hold the farm until nightfall.', '#f2c04e');
    for (let i = 1; i <= 3; i++) G.offers.push({ title: 'Before the Night', sub: `Choose a starting blessing · ${i} of 3`, luck: 0, min: 0 });
    G.debug.fromUrl();   // ?learn=... from the talent creator's play-test
  }
  G.toTitle = function () {
    resetWorld();
    W.setPhaseTarget(0.5);
    G.state = 'title';
    G.ui.show('scr-title'); G.ui.showBest();
  };
  G.pause = function () {
    if (G.state !== 'playing' && G.state !== 'held') return;
    G.state = 'paused'; G.ui.syncSettings(); G.ui.show('scr-pause');
    document.getElementById('b-resume').focus();
  };
  G.resume = function () {
    if (G.state === 'inventory') G.closePanel();
    else if (G.state === 'bonfire') G.bonfire.close();
    else if (G.state === 'paused' || G.state === 'levelup' || G.state === 'bench' || G.state === 'debug' || G.state === 'held') { G.state = 'playing'; G.ui.show(null); }
  };
  // Left Alt: the game stands still where it is, without the pause menu, so you can hover buffs,
  // monsters and gear to read them ("|| PAUSE" blinks in the middle). Left Alt again to carry on.
  G.hold = function () {
    if (G.state === 'playing') G.state = 'held';
    else if (G.state === 'held') G.state = 'playing';
  };
  // The workbench (day.js opens it when you walk up to it at night, or press E next to it).
  G.openBench = function () {
    if (G.state !== 'playing') return;
    G.state = 'bench'; G.ui.renderBench(); G.ui.show('scr-bench');
  };
  // The character panel, one screen with four tabs: ledger (gear, the cat, the main numbers), stats (every
  // stat and blessing), talents (the tree) and alien (the Miracles). Its key on the open tab closes it,
  // another tab's key switches to that tab. From the title screen only the talent tree.
  G.openPanel = function (tab) {
    if (G.state === 'inventory') { if (G.ui.invTab === tab || (G.panelFrom === 'title' && tab !== 'talents')) G.closePanel(); else G.ui.setTab(tab); return; }
    if (G.state !== 'playing' && G.state !== 'held' && G.state !== 'title') return;
    if (G.state === 'title' && tab !== 'talents') return;
    G.panelFrom = G.state === 'title' ? 'title' : 'playing';
    G.state = 'inventory'; G.ui.sel = null; G.ui.talSel = null;
    G.ui.setTab(tab, true); G.ui.show('scr-inv');
  };
  G.closePanel = function () {
    if (G.state !== 'inventory') return;
    if (G.panelFrom === 'title') { G.state = 'title'; G.ui.show('scr-title'); G.ui.showBest(); }
    else { G.state = 'playing'; G.ui.show(null); }
  };
  G.toggleInventory = () => G.openPanel('ledger');
  G.openTalents = () => G.openPanel('talents');
  G.closeTalents = () => G.closePanel();
  G.onPlayerDeath = function () {
    G.state = 'dying'; G.dyingT = 0;
    A.play('gameover'); F.flash('#3a0000', 0.6); F.shake(0.6);
  };
  function gameOver() {
    G.state = 'gameover';
    const b = G.save.best, isBest = Math.floor(G.time) > b.time;
    if (isBest) { b.time = Math.floor(G.time); b.level = G.level; b.kills = G.run.kills; b.day = G.day + 1; G.store.write(); }
    G.ui.showGameOver(isBest); G.ui.showBest();
  }

  // Keys that open (or switch to, or close) a tab of the character panel. C scraps the gear under the
  // mouse when there is some, and opens the ledger when there isn't.
  const PANEL_KEYS = { KeyI: 'ledger', Tab: 'ledger', KeyC: 'ledger', KeyB: 'stats', KeyT: 'talents', KeyY: 'alien' };
  G.onKey = function (e) {
    const c = e.code;
    if (c === 'KeyM') { A.setMusic(!G.save.settings.music); G.store.write(); G.ui.syncSettings(); return; }
    if (c === 'KeyC' && G.ui.scrapHovered()) return;
    switch (G.state) {
      case 'intro': G.intro.skip(); break;
      case 'select': G.select.key(c); break;
      case 'title':
        if (c === 'Enter' || c === 'Space') G.select.open();
        else if (c === 'KeyT') G.openPanel('talents');
        else if (c === 'KeyK') G.openBook();
        break;
      case 'playing':
        if (c === 'Escape') G.pause();
        else if (c === 'AltLeft') G.hold();
        else if (c === 'KeyP') G.debug.open();
        else if (c === 'KeyF') G.trinkets.use();
        else if (PANEL_KEYS[c]) G.openPanel(PANEL_KEYS[c]);
        else if (c === 'KeyK') G.openBook();
        else if (c === 'KeyE') { if (!G.dungeon.use() && !G.chests.use() && !G.mokosh.use() && !G.bonfire.use()) G.days.useBench(); }
        break;
      case 'held':
        if (c === 'AltLeft') G.hold();
        else if (c === 'Escape') G.pause();
        else if (PANEL_KEYS[c]) G.openPanel(PANEL_KEYS[c]);
        else if (c === 'KeyK') G.openBook();
        break;
      case 'paused': if (c === 'Escape') G.resume(); else if (c === 'KeyK') G.openBook(); break;
      case 'book': if (c === 'Escape' || c === 'KeyK') G.closeBook(); break;
      case 'debug': if (c === 'Escape' || c === 'KeyP') G.resume(); break;
      case 'inventory': if (c === 'Escape') G.closePanel(); else if (PANEL_KEYS[c]) G.openPanel(PANEL_KEYS[c]); break;
      case 'bench': if (c === 'Escape' || c === 'KeyE') G.resume(); break;
      case 'mokosh': if (c === 'Escape' || c === 'KeyE') G.mokosh.close(); break;
      case 'bonfire': if (c === 'Escape' || c === 'KeyE') G.bonfire.close(); else if (c === 'KeyY') G.bonfire.spend(); break;
      case 'praying': break;   // the screen is turning white: nothing until the next day
      case 'levelup': {
        const m = /^(Digit|Numpad)([1-9])$/.exec(c);
        if (m) G.ui.pick(+m[2] - 1); else if (c === 'KeyR') G.ui.reroll();
        break;
      }
      case 'gameover': if (c === 'Enter') G.newGame(); break;
    }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.pause(); });

  // Inside a dungeon (dungeon.js) the farm waits: no day clock, spawns, events, altars or chests.
  function update(dt) {
    const dg = G.dungeon.active;
    if (!dg) G.days.update(dt);
    // the run's timeline for the summary charts: a sample every 5 seconds of fighting
    if (G.phase === 'fight' && G.time >= (G.run.tlNext || 0)) {
      G.run.tlNext = G.time + 5;
      (G.run.tl = G.run.tl || []).push({ t: G.time, dps: G.combat.dps(), lvl: G.level, kills: G.run.kills, day: G.day, hp: G.player.hp / G.stats.maxHp });
    }
    G.playerSys.update(dt);
    if (G.phase === 'fight' && !dg) G.spawner.update(dt);
    G.enemySys.update(dt);
    G.mech.update(dt);
    if (!dg) G.ritual.update(dt);
    G.combat.update(dt);
    G.tfx.update(dt);
    G.rules.update(dt);
    G.trinkets.update(dt);
    G.pickups.update(dt);
    if (!dg) { G.altars.update(dt); G.chests.update(dt); G.mokosh.update(dt); G.invasion.update(dt); G.gaze.update(dt); }
    G.darkness.update(dt);
    G.dungeon.update(dt);
    F.update(dt);
    W.updateCamera(dt, P.x, P.z);
    if (G.offers.length && !P.dead && G.state === 'playing') { G.state = 'levelup'; G.ui.showOffer(G.offers[0]); }
  }
  function updateDying(dt) {
    G.dyingT += dt;
    const s = dt * 0.35;
    G.playerSys.update(s); G.enemySys.update(s); G.combat.update(s); G.pickups.update(s); F.update(s);
    W.updateCamera(dt, P.x, P.z);
    if (G.dyingT > 2.2) gameOver();
  }
  let titleT = 0, demoT = 1.5;
  function updateTitle(dt) {
    titleT += dt; demoT -= dt;
    if (demoT <= 0) {
      demoT = 2.6;
      const yaw = P.yaw + U.rnd(-0.6, 0.6);
      G.playerSys.attackAnim(yaw, 0.26);
      F.swing(P.x, P.z, yaw, 150, 3.1); A.play('swing');
    }
    G.playerSys.update(dt);
    F.update(dt);
    W.titleCamera(titleT);
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(0.05, Math.max(0, dt));
    let sim = 0;
    const onTitle = G.onTitle();
    if (G.state === 'playing') { update(dt); sim = dt; }
    else if (G.state === 'dying') { updateDying(dt); sim = dt * 0.35; }
    else if (G.state === 'intro') { G.intro.update(dt); sim = dt; }
    else if (G.state === 'select') { G.select.update(dt); sim = dt; }
    else if (onTitle) { updateTitle(dt); sim = dt; }
    A.setScene(onTitle ? 'title' : G.state === 'intro' ? 'intro' : G.phase === 'camp' ? 'camp' : G.dungeon.active ? 'spirit' : G.map().music,
      onTitle ? G.select.dread() : G.dungeon.active ? 1 : G.phase === 'fight' ? G.dayT / G.DAY_SECONDS : 0);   // the title music darkens with Gregory in the light (camp = the night's song)
    W.update(sim, now / 1000);
    G.enemySys.render(sim); G.combat.render(); G.pickups.render();
    W.render();
    F.drawOverlay();
    if (G.state === 'inventory' && G.ui.invTab === 'ledger' && !onTitle) G.ui.drawPreview(dt);
    if (!onTitle && G.state !== 'intro') G.ui.updateHUD();
    else document.getElementById('hud').hidden = true;
    G.ui.updateTip();
  }

  // The engine without the menus: the world, effects, monsters, combat, the cat and a fresh run. The
  // balance lab (tools/balance.html) starts the game this way, without boot().
  G.initEngine = function () {
    W.init(); F.init(); G.enemySys.init(); G.combat.init(); G.pickups.init(); G.dungeon.init();
    G.run = newRun();
    G.progress.reset(); G.progress.restock(); G.trinkets.reset();
    G.playerSys.create();
    G.spawner.reset();
  };
  async function boot() {
    const loading = document.getElementById('loading');
    if (!window.THREE) { loading.textContent = 'Could not load the 3D engine (three.js). Check your connection and reload.'; return; }
    try {
      G.store.load();
      await G.loadData();
      // the character: ?char= in the address (the talent creator's play-test), else the last one chosen
      let want = null;
      try { want = new URLSearchParams(location.search).get('char'); } catch (e) { /* no address */ }
      if (!(want && G.setCharacter(want)) && G.save.settings.char) G.setCharacter(G.save.settings.char);
      G.initEngine();
      G.ui.init(); G.book.init();
      W.updateCamera(0, 0, 0, true);
      loading.hidden = true;
      G.ui.show('scr-title');
      requestAnimationFrame(loop);
    } catch (err) {
      loading.textContent = location.protocol === 'file:'
        ? 'The game reads its tables from the data/ folder, and browsers block that for pages opened straight from disk.\n\nStart a local web server in the game folder (for example: python3 -m http.server) and open http://localhost:8000'
        : 'Something broke while loading the farm: ' + err.message;
      throw err;
    }
  }
  if (!G.noBoot) boot();   // tools set G.noBoot before loading the game's scripts
})();
