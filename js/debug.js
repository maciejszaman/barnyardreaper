'use strict';
// Debug menu (P while playing): pauses the game and lets you give yourself levels, embers (DB.essence), talent
// points (totems and Miracles, DB.points('spoon')) and items, spawn monsters and events, skip time and turn on
// god mode, to test the late game.
(function () {
  const U = G.U, F = G.fx, A = G.audio, W = G.world, P = G.player;
  const DB = G.debug = { god: false, count: 10, elite: false, wRarity: 2 };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  DB.open = function () {
    if (G.state !== 'playing') return;
    G.state = 'debug';
    DB.render();
    G.ui.show('scr-debug');
  };

  // ---------- actions ----------
  // n levels: each one queues a blessing pick (shown when you close the menu), or with auto picks
  // a random one straight away.
  DB.levels = function (n, auto) {
    const PR = G.progress;
    for (let i = 0; i < n; i++) {
      G.level++; G.xp = 0;
      if (auto) { const ch = PR.rollChoices(); if (ch.length) { const c = U.pick(ch); PR.applyUpgrade(c.id, c.rarity); } }
      else G.offers.push({ title: `Level ${G.level}!`, sub: 'Choose a blessing', luck: 0, min: 0 });
    }
    F.levelUp(P.x, P.z); A.play('levelup');
  };
  DB.essence = (n) => { G.run.essence += n; G.run.essenceTotal += n; A.play('essence'); };
  // Talent points straight into the pool (the per-level caps don't apply).
  DB.points = (cur, n) => { if (cur === 'spoon') G.run.spoons += n; else G.run.totems += n; A.play('totem'); };
  DB.item = function (rarity, slot) {
    const C = G.combat, a = Math.random() * Math.PI * 2;
    const it = slot ? G.makeItem(slot, rarity, G.danger, null, { ilvl: G.rollItemLevel(), tags: G.map().tags }) : C.rollItem(rarity, 0);
    G.pickups.dropItem(P.x + Math.sin(a) * 1.6, P.z + Math.cos(a) * 1.6, it);
  };
  // Any weapon base, at the chosen rarity and the item level dropping right now.
  DB.weapon = function (type) {
    const a = Math.random() * Math.PI * 2, it = G.makeItem('weapon', DB.wRarity, G.danger, type, { ilvl: G.rollItemLevel(), tags: G.map().tags });
    G.pickups.dropItem(P.x + Math.sin(a) * 1.6, P.z + Math.cos(a) * 1.6, it);
  };
  // A free spot 8-14 m from the cat inside the fence.
  function near() {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = U.rnd(8, 14), x = W.clampX(P.x + Math.sin(a) * r), z = W.clampZ(P.z + Math.cos(a) * r);
      if (!W.blocked(x, z, 1)) return [x, z];
    }
    return [P.x + 8, P.z];
  }
  // Bosses walk out of the nearest cave; the rare golem climbs out of the ground near you.
  DB.spawn = function (type) {
    const d = G.ENEMIES[type], SP = G.spawner, n = d.boss ? Math.min(DB.count, 10) : DB.count;
    const cave = W.caves.reduce((b, c) => (Math.hypot(c.x - P.x, c.z - P.z) < Math.hypot(b.x - P.x, b.z - P.z) ? c : b));
    for (let i = 0; i < n; i++) {
      if (type === G.ALTAR.enemy) { const [x, z] = near(); SP.spawnRare(x, z, n > 1); }
      else if (d.boss) SP.spawnBoss(cave, type);
      else { const [x, z] = near(); ES().spawn(type, x, z, { elite: DB.elite }); }
    }
    A.play('horn');
  };
  const ES = () => G.enemySys;
  DB.event = function (kind) {
    if (kind === 'barrel') G.chests.spawnBarrel();
    else if (kind === 'shrine') G.chests.spawnShrine(false);
    else if (kind === 'unholy') G.chests.spawnShrine(true);
    else if (kind === 'ritual') G.ritual.start();
    else if (kind === 'cauldron') G.ritual.cauldron();
    else if (kind === 'dungeon') G.dungeon.open(true);
    else if (kind === 'altar') G.altars.spawn();
    else if (kind === 'chest') G.chests.spawn(false);
    else if (kind === 'mokosh') G.mokosh.spawn();
    else G.days.forceEvent(kind);
  };
  // Talents straight to a rank, requirements and points aside. ids: talent ids, or 'all' / 'rules' (every
  // talent made of rules). rank: 0 = its max rank.
  DB.learn = function (ids, rank = 0) {
    const TL = G.talents, all = TL.all().filter((t) => !t.start);
    const list = ids === 'all' ? all : ids === 'rules' ? all.filter((t) => t.rules.length || t.conditionalStats.length || t.hitBonus.length) : ids.map((id) => TL.byId(id)).filter(Boolean);
    for (const t of list) G.run.talents[t.id] = rank ? Math.min(rank, t.maxRank) : t.maxRank;
    G.progress.onTalentsChanged();
    return list.length;
  };
  DB.unlearn = () => { G.run.talents = {}; G.progress.onTalentsChanged(); };
  // The talent creator's play-test (tools/talents): index.html?learn=id,id:2&god=1&weapon=tome&level=20
  // learns those talents (id:rank) as the run starts, and can turn on god mode, hand you a weapon and levels.
  DB.fromUrl = function () {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.get('god') === '1') DB.god = true;
    const learn = q.get('learn');
    if (learn) {
      const byRank = {};
      for (const part of learn.split(',')) { const [id, r] = part.split(':'); (byRank[+r || 0] = byRank[+r || 0] || []).push(id); }
      let n = 0;
      for (const r in byRank) n += byRank[r].length === 1 && (byRank[r][0] === 'all' || byRank[r][0] === 'rules') ? DB.learn(byRank[r][0], +r) : DB.learn(byRank[r], +r);
      G.ui.toast(`Play-test: ${n} talent${n === 1 ? '' : 's'} learned`, '#8ff8ff');
    }
    const w = q.get('weapon');
    if (w && G.WEAPONS[w]) {
      const PR = G.progress, it = G.makeItem('weapon', DB.wRarity, G.danger, w, { ilvl: G.rollItemLevel(), tags: G.map().tags });
      G.equip.weapon = it; PR.onEquipChange(); G.playerSys.setWeapon(w);
    }
    const lv = +q.get('level');
    if (lv > 1) DB.levels(lv - G.level, true);
  };
  DB.nextStage = () => G.days.skipTo(Math.min(G.DAY_SECONDS - 0.05, (G.tier + 1) * G.STAGE_SECONDS));
  DB.dawn = () => G.days.skipTo(G.DAY_SECONDS - 0.05);   // to nightfall (named from when the day ended at dawn)

  // ---------- menu ----------
  const btn = (label, fn, cls = '') => ({ label, fn, cls });
  function sections() {
    const fight = G.phase === 'fight';
    const mons = Object.values(G.ENEMIES).filter((e) => e.id !== 'training_dummy');
    return [
      ['LEVELS', [btn('+1 LEVEL', () => DB.levels(1)), btn('+5 LEVELS', () => DB.levels(5)), btn('+10 LEVELS', () => DB.levels(10)),
        btn('+10 LEVELS · AUTO-PICK', () => DB.levels(10, true)), btn('+50 LEVELS · AUTO-PICK', () => DB.levels(50, true))]],
      ['EMBERS', [btn('+100', () => DB.essence(100)), btn('+1,000', () => DB.essence(1000)), btn('+10,000', () => DB.essence(10000))]],
      ['TALENT POINTS (IGNORE THE PER-LEVEL CAP)', [btn('+1 TOTEM', () => DB.points('totem', 1)), btn('+5 TOTEMS', () => DB.points('totem', 5)), btn('+20 TOTEMS', () => DB.points('totem', 20)),
        btn('+1 MIRACLE', () => DB.points('spoon', 1)), btn('+12 MIRACLES', () => DB.points('spoon', 12))]],
      ['ITEMS (DROPPED AT YOUR FEET)', [btn('COMMON', () => DB.item(0)), btn('MAGIC', () => DB.item(1)), btn('RARE', () => DB.item(2)), btn('RARE WEAPON', () => DB.item(2, 'weapon'))]],
      [`WEAPONS (DROPPED AT YOUR FEET) · ${G.ITEM_RARITY[DB.wRarity].name.toUpperCase()}`, [
        ...G.ITEM_RARITY.map((r, i) => btn(r.name.toUpperCase(), () => { DB.wRarity = i; }, DB.wRarity === i ? 'on' : '')),
        ...Object.values(G.WEAPONS).map((w) => btn(w.name.toUpperCase(), () => DB.weapon(w.id))),
      ]],
      [`SPAWN MONSTERS · ×${DB.count}${DB.elite ? ' · ELITE' : ''} (BOSSES AT MOST ×10)`, [
        btn('×1', () => { DB.count = 1; }, DB.count === 1 ? 'on' : ''), btn('×10', () => { DB.count = 10; }, DB.count === 10 ? 'on' : ''), btn('×50', () => { DB.count = 50; }, DB.count === 50 ? 'on' : ''),
        btn(DB.elite ? 'ELITE: ON' : 'ELITE: OFF', () => { DB.elite = !DB.elite; }, DB.elite ? 'on' : ''),
        ...mons.map((e) => btn(e.name.toUpperCase(), () => DB.spawn(e.id), e.boss ? 'boss' : '')),
      ]],
      ['EVENTS' + (fight ? '' : ' (ONLY WHILE FIGHTING)'), [btn('BOSS', () => DB.event('boss')), btn('RARE MONSTERS', () => DB.event('rares')), btn('ALIEN INVASION', () => DB.event('invasion')),
        btn('ALTAR', () => DB.event('altar')), btn('CHEST', () => DB.event('chest')), btn('XP BARREL', () => DB.event('barrel')), btn('SHRINE', () => DB.event('shrine')), btn('UNHOLY SHRINE', () => DB.event('unholy')), btn('MOKOSH', () => DB.event('mokosh')), btn('DEMON RITUAL', () => DB.event('ritual')), btn('CAULDRON', () => DB.event('cauldron')), btn('ELDRITCH GAZE', () => DB.event('gaze')), btn('THE DARK', () => DB.event('darkness')), btn('DUNGEON', () => DB.event('dungeon'))]],
      ['TIME', [btn(`NEXT STAGE (+${Math.round(G.STAGE_SECONDS)}S)`, DB.nextStage), btn('SKIP TO NIGHT', DB.dawn), btn('NEXT MAP', () => G.days.skipDay())]],
      ['TRINKETS', [btn('GIVE ALL TRINKETS', () => { const R = G.run.trinket; for (const id in G.TRINKETS) if (!R.owned.includes(id)) R.owned.push(id); }),
        btn('RESET COOLDOWN', () => { G.run.trinket.cd = {}; G.run.trinket.ch = {}; }),
        ...Object.values(G.TRINKETS).map((t) => btn(t.name.toUpperCase(), () => { const R = G.run.trinket; if (!R.owned.includes(t.id)) R.owned.push(t.id); R.id = t.id; delete R.cd[t.id]; delete R.ch[t.id]; }, G.run.trinket && G.run.trinket.id === t.id ? 'on' : ''))]],
      ['TALENTS (REQUIREMENTS AND POINTS IGNORED)', [btn('LEARN EVERY TALENT', () => DB.learn('all')), btn('LEARN RULE TALENTS (TALENT CREATOR)', () => DB.learn('rules')), btn('UNLEARN ALL', DB.unlearn)]],
      ['CHEATS', [btn(DB.god ? 'GOD MODE: ON' : 'GOD MODE: OFF', () => { DB.god = !DB.god; }, DB.god ? 'on' : ''), btn('FULL HEAL', () => { P.hp = G.stats.maxHp; A.play('heal'); }),
        btn('KILL ALL MONSTERS', () => { for (const e of ES().list) if (!e.dead && !e.dummy) G.combat.kill(e); })]],
    ];
  }
  DB.render = function () {
    const r = G.run, TL = G.talents;
    $('dbg-state').textContent = `Day ${G.day + 1} · ${G.map().name} · ${U.fmtTime(G.dayT)} · Level ${G.level} · ${Math.floor(r.essence)} embers · `
      + `${TL.points('totem')} totems · ${TL.points('spoon')} miracles · ${ES().list.filter((e) => !e.dead).length} monsters${DB.god ? ' · GOD MODE' : ''}`;
    const body = $('dbg-body');
    body.innerHTML = '';
    for (const [title, list] of sections()) {
      const sec = document.createElement('div');
      sec.className = 'dbg-sec';
      sec.innerHTML = `<p class="sec-label">${esc(title)}</p>`;
      const row = document.createElement('div');
      row.className = 'dbg-row';
      for (const b of list) {
        const el = document.createElement('button');
        el.className = 'btn' + (b.cls ? ' ' + b.cls : ''); el.textContent = b.label;
        el.addEventListener('click', () => { A.play('click'); b.fn(); DB.render(); });
        row.appendChild(el);
      }
      sec.appendChild(row); body.appendChild(sec);
    }
  };
})();
