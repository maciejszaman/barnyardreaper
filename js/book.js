'use strict';
// The Book of Knowledge (title screen, pause menu, or B while playing): everything a player needs to know,
// in tabs. Every tab is built from the game's data tables when it opens, so new maps, monsters, items,
// trinkets, blessings, talents and events show up here on their own.
(function () {
  const T = THREE, U = G.U, M = G.M;
  const BK = G.book = { tab: 'story' };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (k) => G.ui.icon(k);
  const pct = (v, d = 0) => `${+(v * 100).toFixed(d)}%`;
  const n0 = (v) => Math.round(v).toLocaleString('en-US');
  const mult = (v) => `×${+v.toFixed(v < 10 ? 2 : 0)}`;

  // ---------- building blocks ----------
  const chip = (t) => { const g = G.TAGS[t]; return g ? `<span class="chip" style="--tc:${g.color}" title="${esc(g.desc)}"><img src="${icon(g.icon)}" alt="">${esc(g.name)}</span>` : ''; };
  const chips = (tags) => (tags && tags.length ? `<div class="chips">${tags.map(chip).join('')}</div>` : '');
  // o: { title, img, color (frame), titleColor, sub (html), tags, text (html), rows: [[label, html]], extra (html, full width) }
  const card = (o) => `<div class="bk-card" style="--bc:${o.color || 'var(--line)'}">${o.img ? `<img src="${o.img}" alt="">` : '<i></i>'}<div><h4${o.titleColor ? ` style="color:${o.titleColor}"` : ''}>${esc(o.title)}</h4>`
    + `${o.sub ? `<div class="sub">${o.sub}</div>` : ''}${chips(o.tags)}${o.text ? `<p>${o.text}</p>` : ''}</div>`
    + `${o.rows && o.rows.length ? `<dl>${o.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}${o.extra ? `<div class="full">${o.extra}</div>` : ''}</div>`;
  const sec = (t, ic) => `<p class="bk-sec">${ic ? `<img src="${icon(ic)}" alt="">` : ''}${esc(t)}</p>`;
  const grid = (cards, wide) => `<div class="bk-grid${wide ? ' wide' : ''}">${cards.join('')}</div>`;
  const intro = (t) => `<p class="bk-intro">${t}</p>`;
  const table = (head, rows) => `<table class="bk-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const list = (items) => `<ul class="bk-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const kbd = (k) => `<span class="kbd">${esc(k)}</span>`;

  // 3D portraits of monsters, rendered once and cached (world.js W.renderIcon)
  function portrait(d) {
    if (!G.renderer || !G.world.renderIcon) return icon('skull');
    return G.world.renderIcon('enemy:' + d.id, () => {
      if (G.BOSS_MODELS.includes(d.model)) return M.boss(d.model, d.colors).root;
      const g = new T.Group(), mat = new T.MeshLambertMaterial({ vertexColors: true });
      if (d.tint) mat.color.setRGB(d.tint[0], d.tint[1], d.tint[2]);
      for (const p of M.enemyParts(d.model)) { const m = new T.Mesh(p.geo, p.glow ? M.matB : mat); if (p.pivot) m.position.set(p.pivot[0], p.pivot[1], p.pivot[2]); g.add(m); }
      return g;
    });
  }
  const itemImg = (o) => (G.renderer ? G.world.itemIcon(o) : icon('star'));
  const mini = (ids) => `<div class="bk-mini">${ids.map((id) => G.ENEMIES[id] ? `<img src="${portrait(G.ENEMIES[id])}" alt="${esc(G.ENEMIES[id].name)}" title="${esc(G.ENEMIES[id].name)}">` : '').join('')}</div>`;
  const statLabel = (k) => (G.STATS[k] ? G.STATS[k].label : k);

  // ---------- what lives where ----------
  const monsters = () => Object.values(G.ENEMIES).filter((e) => e.id !== 'training_dummy');
  function eventsOf(m) { return m.events || G.EVENTS.weights; }
  function mapMonsters(m) {
    const set = new Set(), ev = eventsOf(m), add = (id) => { if (G.ENEMIES[id] && !set.has(id)) { set.add(id); const e = G.ENEMIES[id]; if (e.split) add(e.split.into); if (e.summon) Object.keys(e.summon.weights).forEach(add); } };
    for (const st of m.stages) { for (const sp of st.spawns) Object.keys(sp.weights).forEach(add); Object.keys(st.horde || {}).forEach(add); }
    Object.keys(m.bosses).forEach(add);
    if (G.ALTAR.enemy) add(G.ALTAR.enemy);
    if (ev.ritual > 0 && G.RITUAL.doctor) { add(G.RITUAL.doctor); add(G.RITUAL.demon); }
    if (ev.cauldron > 0 && G.CAULDRON.enemy) add(G.CAULDRON.enemy);
    if (ev.gaze > 0 && G.GAZE.enemy) { Object.keys(G.GAZE.waveWeights).forEach(add); add(G.GAZE.tentacle.enemy); add(G.GAZE.boss.enemy); }
    return [...set];
  }
  const AI_TEXT = {
    dog: 'Runs at you and lunges when close.', crow: 'Circles overhead and dives at you.', pumpkin: 'Hops after you and spits seeds.', shooter: 'Keeps its distance, strafing and firing at you.',
    blob: 'Bounces at you.', mosquito: 'Buzzes straight at you, weaving side to side.', golem: 'Slams the ground, throws boulders and charges. Calls its pack when hurt.',
    ghost: 'Drifts at you, straight through walls.', snail: 'Crawls at you, leaving slime that slows you.', summoner: 'Keeps far away and summons monsters until killed.',
    frog: 'Leaps at you.', cauldron: 'Never moves. Spews monsters until it is destroyed.', ritual: 'Stands still around the sigil, channelling a demon into it.',
    eye: 'Floats in, keeps its distance and fires violet hexes.', voidling: 'Shambles at you, slow and swaying.', crawler: 'Skitters at you low to the ground in zigzag bursts, and now and then slips through the void to come out a few meters closer.', tentacle: 'Never moves. Slams down where you stand, and every few seconds its Eldritch Gurgle stuns you until it is killed.', cthulhu: 'Huge and slow, it never stops coming, smashing flurries of tentacles around you that hurt and slow you.',
  };
  const ABILITY_TEXT = { anchor: 'Marks the ground under you: stand in the circle until it fades, or it explodes on you.', tesla: 'Raises tesla towers: charge them all by standing next to each one, or they strike you.' };

  // ---------- tabs ----------
  const TABS = [
    { id: 'story', name: 'Story', icon: 'book', render: story },
    { id: 'objective', name: 'Objective', icon: 'crown', render: objective },
    { id: 'maps', name: 'Maps', icon: 'map', render: maps },
    { id: 'events', name: 'Events', icon: 'eye', render: events },
    { id: 'monsters', name: 'Monsters', icon: 'skull', render: bestiary },
    { id: 'damage', name: 'Damage types', icon: 'burst', render: damage },
    { id: 'items', name: 'Item types', icon: 'shield', render: items },
    { id: 'trinkets', name: 'Trinkets', icon: 'pocketwatch', render: trinkets },
    { id: 'upgrades', name: 'Upgrades', icon: 'star', render: upgrades },
    { id: 'talents', name: 'Talents', icon: 'totem', render: talents },
    { id: 'alien', name: 'Alien Talents', icon: 'spoon', render: alien },
    { id: 'workbench', name: 'Workbench', icon: 'hammer', render: workbench },
  ];
  BK.tabs = TABS;

  function story() {
    return intro('The farm was quiet once. Corn, a red barn, a well, a windmill that never stopped turning, and one barn cat who kept the mice honest.')
      + `<div class="bk-story">`
      + `<p><img src="${icon('moon')}" alt="">Then the caves opened. Four of them, one on every side of the fence, and every night something crawls out: feral dogs first, then crows, pumpkin-headed scarecrows and stone golems as big as the barn. The farmer is gone. The cat found Grandpa's old scythe in the barn, put on a straw hat, and decided to stay.</p>`
      + `<p><img src="${icon('ufo')}" alt="">Below the cellar trapdoor there is more than a cellar. Each dawn the trapdoor leads somewhere worse: to a crash site where something fell from the sky and is still leaking, and past it to The Unexplainable, a drowned swamp of tiki totems, ancestral ghosts and witch doctors trying to call something up through a ritual sigil.</p>`
      + `<p><img src="${icon('eye')}" alt="">And sometimes something opens its eye above the farm and simply looks. Nobody knows what it is. It is better not to stand in its light.</p>`
      + `<p><img src="${icon('eclipse')}" alt="">The last door opens on Eldritch Madness: the farm as something under the ground dreams it. The soil is cracked open on the void, eyes grow on stalks and watch you, stones float, and things with too many legs skitter out of the dark. Now and then the stars go out altogether, and only a circle of light keeps you.</p>`
      + `<p><img src="${icon('stairs')}" alt="">Old stairways open in the ground, too, leading down into mossy brick halls nobody remembers building. Whatever waits at the bottom on its pentagram guards a trinket. Grandpa had a lot of trinkets.</p>`
      + `<p><img src="${icon('goat')}" alt="">The cat is not alone anymore. One evening a black goat was standing at the fence, watching the caves before anything had crawled out of them: Gregory, who speaks softly, carries a blackened scythe and a belt of little bottles, and knows things he should not. He says he is here to help. Nobody knows how he knew the horde was coming, or what he means to get out of it.</p>`
      + `<p><img src="${icon('paw')}" alt="">One cat, one goat, one scythe each. Choose who stands at the fence, and hold the farm until dawn, every dawn, for as long as you can.</p></div>`;
  }

  function objective() {
    const st = G.MAPS[0].stages, D = G.DAY_SECONDS, S = G.STAGE_SECONDS;
    return intro(`Survive. Every day lasts ${U.fmtTime(D)}; the danger rises every ${U.fmtTime(S)}. At dawn the monsters crumble, and the cellar trapdoor leads to the next map. The run ends when your health hits zero.`)
      + sec('How a day goes', 'moon') + list([
        `Your weapon attacks on its own, aiming at the nearest monster. Move to stay alive and to stand where it hits the most.`,
        `Killed monsters drop soul crystals (experience) and essence (the workbench's currency). Each level up offers a choice of blessings (see Upgrades).`,
        `Every ${G.EVENTS.every} seconds an event happens (see Events), and every ${G.ALTAR.every} seconds an Altar of Power rises: its Totem of Power is a talent point, but taking it wakes rare golems.`,
        `Gear drops from monsters, chests, bosses and dungeons (see Item types). Equip it from the saddlebag (I).`,
        `Dawn: the training dummy behind the barn shows your damage per second, the workbench restocks, and the cellar trapdoor takes you to the next map.`,
        `Past the last map the days go on, each one tougher, with better items.`,
      ])
      + sec('Danger stages (every day)', 'skull') + table(['Stage', 'Starts at', 'Monster health', 'Monster damage', 'Spawns'],
        st.map((x, i) => [esc(x.name), U.fmtTime(i * S), mult(x.hp), mult(x.dmg), mult(x.spawn)]))
      + sec('Controls', 'paw') + table(['Key', 'What it does'], [
        [kbd('WASD') + ' / ' + kbd('ARROWS'), 'Move'], [kbd('SPACE'), 'Dash (through monsters, briefly untouchable)'], [kbd('F'), 'Use your trinket'], [kbd('E'), 'Workbench, paid chests, dungeon stairs'],
        [kbd('I') + ' / ' + kbd('TAB') + ' / ' + kbd('C'), 'Character panel: the ledger (gear and the cat)'], [kbd('B'), 'Character panel: every stat and blessing'], [kbd('T'), 'Character panel: talent tree'],
        [kbd('Y'), 'Character panel: alien talents'], [kbd('C'), 'Over gear: scrap it for experience'], [kbd('1-3'), 'Pick a blessing'],
        [kbd('R'), 'Reroll the blessings on offer'], [kbd('K'), 'This book'], [kbd('M'), 'Music on / off'], [kbd('LEFT ALT'), 'Hold: stop the game to read things, no menu'], [kbd('ESC'), 'Pause menu'],
      ]);
  }

  function maps() {
    const cards = G.MAPS.map((m, i) => {
      const ev = eventsOf(m), evs = Object.keys(ev).filter((k) => ev[k] > 0).map((k) => EVENT_NAME[k] || k).join(', ');
      return card({
        title: `Day ${i + 1}: ${m.name}`, img: icon({ farm: 'clover', alien: 'ufo', swamp: 'skull', void: 'eye' }[m.ground] || 'map'), color: '#a08060', text: esc(m.message),
        rows: [['Monster health', mult(m.hp)], ['Monster damage', mult(m.dmg)], ['Item levels', `${m.itemLevel[0]}–${m.itemLevel[1]}`],
          ['Themed gear', m.tags.length ? esc(m.tags.map((t) => G.TAG_NAMES[t] || t).join(', ')) : 'none'], ['Weather', m.weather === 'rain' ? 'rain and thunder' : m.weather === 'motes' ? 'motes drifting up, whispers' : 'clear'], ...(m.shrines === 'unholy' ? [['Shrines', 'only Unholy Shrines']] : []),
          ['Bosses', esc(Object.keys(m.bosses).map((b) => G.ENEMIES[b].name).join(', ') || 'none')], ['Events', esc(evs)]],
        extra: `<div class="sub">Monsters</div>${mini(mapMonsters(m))}`,
      });
    });
    const E = G.ENDLESS;
    return intro(`One map per day, in order. Each is tougher than the last, and drops better items. After day ${G.MAPS.length} the last map repeats, every extra day with ${mult(E.hp)} monster health, ${mult(E.dmg)} damage and ${E.ilvl} more item levels.`) + grid(cards, true);
  }

  const EVENT_NAME = { boss: 'Boss', rares: 'Rare monsters', invasion: 'Alien invasion', ritual: 'Demon ritual', cauldron: 'Cauldron', gaze: 'Eldritch Gaze', darkness: 'The Dark' };
  function events() {
    const E = G.EVENTS, R = E.rares, I = G.INVASION, RT = G.RITUAL, CD = G.CAULDRON, Z = G.GAZE, DK = G.DARKNESS, AL = G.ALTAR, CH = G.CHESTS, B = G.BARRELS, DG = G.DUNGEON, H = G.SPAWNING.hordes;
    const where = (k) => G.MAPS.filter((m) => eventsOf(m)[k] > 0).map((m) => m.name).join(', ') || 'nowhere yet';
    const pool = [
      { k: 'boss', icon: 'crown', text: `A boss from the map's list walks out of a cave after a ${E.bossWarning} second warning. At most ${E.maxBosses} at once. Every boss of the run is tougher than the one before. Bosses drop experience and items (no blessings: free levels only come from experience barrels and dungeons).` },
      { k: 'rares', icon: 'star', text: `${R.count} rare monsters from the current spawn table climb out of a cave with monster modifiers (${mult(R.hp)} health, ${mult(R.damage)} damage). They drop much more experience and essence.` },
      I && { k: 'invasion', icon: 'ufo', text: `A green pillar of light lands and burns across the farm, hurting you and monsters alike, while invaders spawn around it. Kill every invader to repel it: an Alien Spoon (alien talent point), experience and a rare item. Each invasion brings ${I.raresGrowth}× as many invaders as the last.` },
      RT.doctor && { k: 'ritual', icon: 'skull', text: `${RT.doctors} witch doctors gather around a sigil to summon ${G.ENEMIES[RT.demon] ? G.ENEMIES[RT.demon].name : 'a demon'}. Every ${RT.stackEvery} seconds they channel, the demon gets ${pct(RT.stackHp)} more health. Kill them fast.` },
      CD.enemy && { k: 'cauldron', icon: 'flask', text: `A witch's cauldron bubbles up and spews monsters until you destroy it. At most ${CD.max} at once.` },
      Z.enemy && { k: 'gaze', icon: 'eye', text: `The ground tears open into a crater (${Z.radius} m), an orange eye peeking up through the stars inside. Stepping in deals ${pct(Z.damage)} of your max health (through armor and block) and throws you out. Every ${Z.waveEvery} seconds it pulses out a wave of ${esc(Object.keys(Z.waveWeights).map((k) => G.ENEMIES[k].name + 's').join(' and '))}, some elite with modifiers. Every ${Z.tentacle.everyWaves} waves an ${esc(G.ENEMIES[Z.tentacle.enemy] ? G.ENEMIES[Z.tentacle.enemy].name : 'eldritch tentacle')} bursts up: it slams where you stand and every ${Z.gurgleEvery} seconds its Eldritch Gurgle stuns you for ${Z.gurgleStun} seconds, until you kill it. After ${Z.tentacle.count} tentacles, ${esc(G.ENEMIES[Z.boss.enemy] ? G.ENEMIES[Z.boss.enemy].name : 'something')} rises from the crater and hunts you; killing it closes the crater.` },
      DK && { k: 'darkness', icon: 'eclipse', text: `The stars go out. A ${DK.radius} m circle of light opens ${DK.minDistance}–${DK.maxDistance} m from you and the screen darkens: you have ${DK.warning} seconds to get into it (follow the arrow and the countdown). Then the dark falls for ${DK.dark} seconds and everything outside the circle is pitch black. Out in the dark your screen goes black within ${DK.grace} seconds and you die, whatever your health, armor or block. Step back into the light in time and you live; an extra life drags you back out.` },
    ].filter(Boolean);
    const cards = pool.map((p) => card({ title: EVENT_NAME[p.k], img: icon(p.icon), color: '#b86cff', text: p.text, rows: [['Happens on', esc(where(p.k))]] }));
    const always = [
      card({ title: 'Hordes', img: icon('door'), color: '#ff6a4a', text: `Every ${H.every[0]}–${H.every[1]} seconds a horde of ${H.size}+ monsters bursts out of one cave (a warning sound and a red glow first). Hordes grow with danger and time, up to ${H.maxSize}.` }),
      card({ title: 'Altars of Power', img: icon('totem'), color: '#8ff8ff', text: `First after ${AL.first} seconds, then every ${AL.every} seconds (follow the blue arrow). Walking into one gives a Totem of Power (talent point, at most ${G.TALENT_CAP.totem} per day) but wakes rare golems with modifiers: each altar wakes ${AL.summonGrowth}× as many as the last.` }),
      card({ title: 'Chests', img: icon('chest'), color: '#ffd04a', text: `Every day starts with ${CH.freeAtStart} free chests beside you, the first a Weapon Chest. More turn up every ${CH.every[0]}–${CH.every[1]} seconds, costing ${CH.cost} essence plus ${CH.costPerMinute} per minute into the day (E to open). Each holds an item.` }),
      card({ title: 'Shrines', img: icon('holycross'), color: '#ffe080', text: `The first rises ${G.SHRINES.first} seconds into every day, more every ${G.SHRINES.every[0]}–${G.SHRINES.every[1]} seconds. Walk into a Shrine of Mary for ${esc(G.BUFFS[G.SHRINES.faith.buff].name)} (${G.BUFFS[G.SHRINES.faith.buff].duration}s): armor doubled, +10% movement speed, and every hit you take sets monsters within ${G.SHRINES.faith.radius} m on holy fire. From ${esc(G.MAPS[0].stages[Math.min(G.SHRINES.nightFromStage, G.MAPS[0].stages.length - 1)].name)} on, ${pct(G.SHRINES.unholyChance)} of them are Unholy Shrines with a goat on the roof${G.MAPS.some((m) => m.shrines === 'unholy') ? ` (on ${esc(G.MAPS.filter((m) => m.shrines === 'unholy').map((m) => m.name).join(', '))}, all of them, all day)` : ''}: press E for ${esc(G.BUFFS[G.SHRINES.apostasy.buff].name)}: it drains ${pct(G.SHRINES.apostasy.drain)} of your health a second until it has had ${pct(G.SHRINES.apostasy.total)} (it never kills you); meanwhile your bleeds deal ×${G.SHRINES.apostasy.bleedMult} damage and always cripple, +30% attack speed, half the armor.` }),
      card({ title: 'Mokosh', img: icon('mokosh'), color: '#a8e6b8', text: `First ${G.MOKOSH.first} seconds into every day, then every ${G.MOKOSH.every[0]}–${G.MOKOSH.every[1]} seconds, a carved totem of the mother goddess rises for ${G.MOKOSH.stay} seconds. Press E at it and she listens (the game waits): pay ${G.MOKOSH.ban.cost} essence to cut a thread (one blessing never comes up again this run, so every other one comes up more often), or ${G.MOKOSH.weave.prices.join(' / ')} essence by rarity to weave a thread twice (another copy of one of your blessings, for a different one of the same rarity). Each totem grants each favour once; every favour asked makes the next one ${Math.round(G.MOKOSH.ban.growth * 100)}% dearer.` }),
      card({ title: 'Experience barrels', img: icon('barrel'), color: '#7dff6a', text: `First after ${B.first} seconds, then every ${B.every[0]}–${B.every[1]} seconds. Walk into one for ${B.levels} free level${B.levels === 1 ? '' : 's'}.` }),
      card({ title: 'Dungeons', img: icon('stairs'), color: '#b86cff', text: `On ${pct(DG.chance)} of days a stairway opens between ${U.fmtTime(DG.appearAt[0])} and ${U.fmtTime(DG.appearAt[1])} and stays ${DG.stay} seconds. Press E at it to go down. The day waits outside. Inside: ${DG.chambers} big chambers with ${DG.packs} dense packs of ${DG.packSize[0]}–${DG.packSize[1]} monsters carrying the dungeon's modifiers plus Abyssal (×${DG.hpMult} health, ×${DG.damageMult} damage), a free chest with a blue glow in every chamber (items ${DG.chestLevelBonus} item levels above the day's), then a boss on a pentagram. The boss drops a trinket you don't own and ${DG.items} items, and clearing the dungeon gives you ${DG.levels} free level${DG.levels === 1 ? '' : 's'}.` }),
    ];
    return intro(`Every ${E.every} seconds of a day one event happens, picked by each map's weights. Some things also happen on their own schedule.`)
      + sec('Event pool', 'eye') + grid(cards) + sec('On their own schedule', 'hourglass') + grid(always);
  }

  function bestiary() {
    const where = {};
    G.MAPS.forEach((m) => mapMonsters(m).forEach((id) => (where[id] = where[id] || []).push(m.name)));
    if (G.DUNGEON) Object.keys(G.DUNGEON.bosses).forEach((id) => (where[id] = where[id] || []).push('dungeons'));
    const cardOf = (e) => {
      const tags = [], traits = [];
      if (e.boss) traits.push('Boss'); if (e.flying) traits.push('Flying'); if (e.ranged) traits.push('Ranged'); if (e.summon) traits.push('Summoner'); if (e.split) traits.push(`Splits into ${G.ENEMIES[e.split.into].name}s`);
      const inf = Object.keys(e.inflicts || {}).map((k) => `${(G.STATUS[k] || G.PDOTS[k] || { name: k }).name} (${pct(e.inflicts[k])})`);
      const ab = Object.keys(e.abilities || {}).map((k) => ABILITY_TEXT[k] || k);
      const text = esc(AI_TEXT[e.ai] || '') + (ab.length ? ' ' + esc(ab.join(' ')) : '') + (e.trail ? ' Leaves slime that slows you.' : '');
      return card({
        title: e.name, img: portrait(e), color: e.boss ? '#ff8a3a' : e.plate ? '#c08aff' : 'var(--line)', titleColor: e.boss ? '#ffb070' : null,
        sub: esc(traits.join(' · ')), tags, text,
        rows: [['Health', n0(e.hp)], ['Damage', e.dmg ? n0(e.ranged ? e.ranged.damage : e.dmg) : '—'], ['Speed', e.speed ? e.speed.toFixed(1) : 'still'],
          ...(inf.length ? [['Its hits', esc(inf.join(', '))]] : []), ['Found on', esc((where[e.id] || ['special events']).join(', '))]],
      });
    };
    const mods = G.MODIFIERS.map((m) => card({ title: m.name, img: icon('star'), color: m.color, titleColor: m.color, text: esc(m.desc), rows: [['From danger stage', U.roman(m.minStage)], ['In dungeons', m.dungeon ? 'yes' : 'never']] }));
    const E = G.ELITE;
    return intro(`Health and damage are at the first danger stage of the first map; the stage, the map and every minute of the run multiply them (see Maps and Objective). Elite monsters (a golden name) have ${mult(E.hp)} health and ${mult(E.damage)} damage and drop loot far more often.`)
      + sec('Monsters', 'paw') + grid(monsters().filter((e) => !e.boss).map(cardOf))
      + sec('Bosses', 'crown') + grid(monsters().filter((e) => e.boss).map(cardOf))
      + sec('Monster modifiers (rare monsters, altar golems, invaders, dungeons)', 'star') + grid(mods);
  }

  function damage() {
    const C = G.combat, D = G.DOTS, S = G.STATUS;
    const typeCards = Object.keys(G.DMG_TYPES).map((t) => card({ title: G.TAGS[t].name, img: icon(G.TAGS[t].icon), color: G.TAGS[t].color, titleColor: G.TAGS[t].color, text: esc(G.TAGS[t].desc),
      extra: `<div class="sub">Sources</div><p>${Object.values(G.DMG_SOURCES).filter((s) => s.type === t).map((s) => esc(s.name)).join(' · ')}</p>` }));
    const srcCards = Object.entries(G.DMG_SOURCES).map(([k, s]) => {
      const sc = C.scalers(k).filter((x) => !(k === 'weapon' && ['melee', 'firearm', 'magic'].includes(x.tag)));
      let raised = s.noScale ? (s.inherit ? 'Never raised again (it copies damage that already was).' : 'Never raised: a fixed amount.') : sc.map((x) => esc(statLabel(x.stat))).join(' · ');
      if (k === 'weapon') raised += ' · plus Melee, Firearm or Magic damage for its class';
      if (s.inherit && !s.noScale) raised += (sc.length ? ' · ' : '') + 'and everything that raised the hit it came from';
      const tags = ((s.type ? [s.type] : []).concat(s.tags)).concat(k === 'weapon' ? ['melee', 'firearm', 'magic'] : []);
      return card({ title: s.name, img: icon(G.TAGS[s.type || 'curse'].icon), color: s.type ? G.TAGS[s.type].color : '#c08aff', tags, text: esc(s.desc), rows: [['Raised by', raised || '—']] });
    });
    const scaleRows = G.DMG_SCALING.map((x) => [esc(statLabel(x.stat)), x.tag === 'any' ? 'every source' : chip(x.tag),
      esc(Object.keys(G.DMG_SOURCES).filter((k) => C.scalers(k).includes(x) || (k === 'weapon' && ['melee', 'firearm', 'magic'].includes(x.tag))).map((k) => G.DMG_SOURCES[k].name).join(', '))]);
    const st = (id, extra) => card({ title: S[id].name, img: icon(S[id].icon), color: S[id].color, titleColor: S[id].color, text: esc(S[id].desc) + (extra ? ' ' + extra : ''),
      rows: [['On monsters', `${S[id].duration}s${S[id].bossDuration < 1 ? ` (bosses ${pct(S[id].bossDuration)} as long)` : ''}`], ['On you', `${S[id].playerDuration}s`]] });
    const A = G.ARMOR;
    return intro('There are three damage types: physical, poison and elemental. Everything you deal comes from a source with tags (its type, hit or damage over time, its weapon class, bleed, holy, explosion...), and every damage stat raises the sources carrying its tag. Hover a tag for what it means.')
      + sec('Damage types', 'burst') + grid(typeCards)
      + sec('What raises what', 'star') + table(['Stat', 'Raises', 'Sources'], scaleRows)
      + `<p class="bk-note">Bonuses from different stats multiply: +50% weapon damage and +50% melee damage make a melee hit ×2.25. Damage taken from a hit (a bleed, holy fire, bonus elemental damage) keeps the hit's bonuses and only adds its own: Bleed damage and DoT damage for a bleed.</p>`
      + sec('Every source', 'crosshair') + grid(srcCards)
      + sec('Damage over time', 'hourglass') + grid([
        card({ title: 'Bleeding', img: icon('blood'), color: '#ff5a4a', tags: ['physical', 'dot', 'bleed'], text: `Inflicted only by physical hits (Bleed chance). Deals ${pct(D.bleed.damage)} of the hit that caused it every second for ${D.bleed.duration} seconds. One bleed per monster: a weaker bleed never replaces a stronger one.` }),
        card({ title: 'Poison', img: icon('poison'), color: '#8aef4a', tags: ['poison', 'dot'], text: `Inflicted by any physical hit (Poison chance), never by damage over time. Lasts ${D.poison.duration} seconds and stacks without limit; each stack deals ${pct(D.poison.maxHp)} of the monster's max health every second. The training dummy counts as ${n0(D.poison.dummyHp)}× the map's health multiplier.` }),
        card({ title: 'Holy fire', img: icon('holycross'), color: '#ffe080', tags: ['elemental', 'dot', 'holy'], text: `Stacks without limit, ${pct(D.holy.damage)} of the hit per second for ${D.holy.duration} seconds. A golden circle spreads it to monsters around; a monster dying with ${D.holy.explodeAt}+ stacks explodes for ${pct(D.holy.explode)} of its max health (the explosion does not spread holy fire).` }),
      ])
      + sec('Statuses', 'stars') + grid([
        st('shock', `Only elemental hits shock (Shock chance, or abilities that always shock). On monsters: ${pct(S.shock.minEffect)} to ${pct(S.shock.maxEffect)} more damage taken from everything, depending on the hit: an elemental hit worth ${pct(S.shock.fullAt)} of the monster's max health shocks for the full ${pct(S.shock.maxEffect)}. On you: +${pct(S.shock.power)} damage taken.`),
        st('slow', `${pct(S.slow.power)} slower. Inflicted by weapon hits (Slow chance).`), st('stun', 'Inflicted by weapon hits (Stun chance).'), st('root', 'Inflicted by weapon hits (Root chance).'),
      ])
      + sec('Damage you take', 'shield') + list([
        `Armor: every item has some. Damage taken is reduced by armor / (armor + 100): 100 armor = 50% less, 300 = 75% less, at most ${pct(A.maxReduction)}.`,
        'Block: block rating gives a chance to ignore a hit completely: 0.75 × rating / (rating + 100), at most 75%.',
        'Monsters\' poison and bleeding on you: damage over time that shields soak and block cannot stop.',
        'The Eldritch Gaze\'s madness ignores armor and block.',
        'The Dark ignores everything: out in it when it falls, you die (unless an extra life drags you back).',
      ]);
  }

  function items() {
    const R = G.ITEM_RARITY, IL = G.ILVL, A = G.ARMOR;
    const rar = R.map((r) => card({ title: r.name, img: icon('star'), color: r.color, titleColor: r.color, rows: [['Modifiers', String(r.affixes)], ['Weapon damage', mult(r.weaponDamage)], ['Modifier values', mult(r.affixPower)], ['Drop weight', String(r.weight)]] }));
    const lvls = [1, 5, 10, 15, 20, 25, 30];
    const weapons = Object.values(G.WEAPONS).map((W) => card({
      title: W.name, img: itemImg({ slot: 'weapon', model: W.model }), color: '#ffd27a', tags: W.tags, text: esc((W.implicit && W.implicit.text) || '') + (W.desc ? `<br><span class="sub">${esc(W.desc)}</span>` : ''),
      rows: [['Damage (item level 1)', `${n0(W.dmg * W.dmgLo)}–${n0(W.dmg * W.dmgHi)}`], ['Attacks per second', W.aps.toFixed(2)], ['Base crit', pct(W.crit, 1)], ['Block rating', W.block ? `${W.block} (${pct(G.blockChance(W.block), 1)} block)` : 'none'], ['Drops', W.tag ? `on ${esc(G.TAG_NAMES[W.tag] || W.tag)} maps` : 'everywhere']],
    }));
    const gear = [];
    for (const slot of G.SLOTS.slice(1)) for (const b of G.GEAR[slot]) {
      const st = Object.keys(b.implicit).map((k) => G.fmtMod(k, b.implicit[k])).join(', ');
      gear.push(card({ title: b.name, img: itemImg({ slot, model: b.model, color: b.color }), color: b.set ? G.SETS[b.set].color : 'var(--line)', sub: esc(G.SLOT_NAMES[slot]) + (b.tag ? ` · ${esc(G.TAG_NAMES[b.tag] || b.tag)}` : '') + (b.set ? ` · ${esc(G.SETS[b.set].name)} set` : ''),
        text: esc(st || 'Armor only.') }));
    }
    const mods = G.AFFIXES.map((a) => [esc(G.fmtMod(a.stat, a.base)), chips(G.STAT_TAGS[a.stat] || []), esc(a.slots.map((s) => G.SLOT_NAMES[s]).join(', ')) + (a.weaponClass ? ` (${a.weaponClass} weapons)` : '') + (a.alienOnly ? ' · alien gear' : ''),
      a.weight < 1 ? 'uncommon' : 'common', IL.steps.has(a.stat) ? `+1 per ${IL.stepEvery} levels` : IL.scaling.has(a.stat) ? `fast (${mult(G.itemLevelMult(30))} at 30)` : `gentle (${mult(G.itemLevelOther(30))} at 30)`]);
    const sets = Object.values(G.SETS).map((s) => card({ title: `${s.name} set`, img: icon('paw'), color: s.color, titleColor: s.color, text: s.bonuses.map((b) => `(${b.n}) ${esc(Object.keys(b.stats).map((k) => G.fmtMod(k, b.stats[k])).join(', '))}`).join('<br>') }));
    return intro(`Gear comes in ${R.length} rarities. Every item has armor and an item level; magic and rare items roll random modifiers. Hover an item in your saddlebag (I) to compare it with what you wear: a green ▲ marks upgrades.`)
      + sec('Rarities', 'star') + grid(rar)
      + sec('Item level', 'hourglass') + `<p class="bk-note">Items drop at item levels ${G.MAPS.map((m) => `${m.itemLevel[0]}–${m.itemLevel[1]}`).join(', ')} on the ${G.MAPS.length} maps, climbing as the day goes on (bosses and dungeons drop a little higher). Item level multiplies every stat an item has, so a higher level of the same item is always better. Weapon damage, armor, health and damage stats grow fast (${mult(1 + IL.perLevel)} per level, compounding); chances, speeds and the rest grow gently (+${pct(IL.otherPerLevel)} per level). The workbench can raise an item's level by up to ${G.CAMP.upgrade.levels}.</p>`
      + table(['Item level', ...lvls.map(String)], [['Damage, armor, health', ...lvls.map((l) => mult(G.itemLevelMult(l)))], ['Everything else', ...lvls.map((l) => mult(G.itemLevelOther(l)))]])
      + sec('Armor per slot (item level 1)', 'shield') + table(['Slot', 'Armor'], G.SLOTS.map((s) => [esc(G.SLOT_NAMES[s]), A[s][1] > 0 ? `${A[s][0]}–${A[s][1]}` : 'none: weapons that swing have block rating instead (see Weapons)']))
      + sec('Weapons', 'sword') + grid(weapons)
      + sec('Gear', 'boot') + grid(gear)
      + sec('Modifiers', 'cards') + table(['Modifier (item level 1, common)', 'Tags', 'Slots', 'How often', 'Grows with item level'], mods)
      + (sets.length ? sec('Sets', 'paw') + grid(sets) : '');
  }

  function trinkets() {
    const cards = Object.values(G.TRINKETS).map((t) => card({ title: t.name, img: icon(t.icon), color: '#ffe080', titleColor: '#ffe080', tags: t.tags, text: esc(t.desc), rows: [['Cooldown', `${t.cooldown}s`], ['Starts with it', G.CHARACTERS.some((c) => c.trinket === t.id) ? 'yes' : 'no']] }));
    return intro('A trinket is an active item: press F to use the one you carry. You start with one; dungeon bosses give you one you don\'t own yet, and you choose which one to carry at the workbench. Trinket recovery (blessings, modifiers) makes them recharge faster.') + grid(cards);
  }

  function upgrades() {
    const R = G.RARITY;
    const cards = G.UPGRADES.map((u) => card({
      title: u.name, img: icon(u.icon), color: 'var(--line)', tags: G.tagsFor({ [u.stat]: 1 }, null), text: esc(u.text(u.vals[0])),
      sub: u.weaponClass ? `${esc(u.weaponClass)} weapons only` : '',
      rows: R.map((r, i) => [r.name, `<span style="color:${r.color}">${esc(G.fmtVal(u.stat, u.vals[i]))}</span>`]),
    }));
    return intro(`Every level up offers a choice of blessings (more with Curiosity), in ${R.length} rarities: ${R.map((r) => `<span style="color:${r.color}">${esc(r.name)}</span>`).join(', ')}. Luck makes rarer ones likelier. Rerolls (R) replace the offer. The workbench sells them for essence too.`) + grid(cards);
  }

  function talentCard(t, tree) {
    const st = Object.keys(t.stats || {}).map((k) => G.fmtMod(k, t.stats[k])).join(', ');
    const cur = G.CURRENCIES[t.currency] || G.CURRENCIES.totem, g = tree && tree.groups.find((x) => x.id === t.group);
    return card({
      title: t.name, img: icon(t.icon), color: tree ? tree.color(t) : '#7dff6a', titleColor: tree ? tree.color(t) : '#9dff8a',
      sub: (t.start ? 'starting point' : `${t.cost} ${t.cost === 1 ? cur.name : cur.plural}`) + (g ? ` · ${esc(g.name)}` : '') + (tree && tree.segment(t) ? ` · <span style="color:${tree.segment(t).color}">${esc(tree.segment(t).name)}</span>` : '') + (t.big ? ' · big talent' : ''),
      tags: G.tagsFor(t.stats, t.effect && t.effect.id, t.ruleTags), text: [t.text, st].filter(Boolean).map(esc).join('<br>') + (t.downside ? `<br><span class="down">${esc(t.downside)}</span>` : ''),
    });
  }
  function talents() {
    const tree = G.CHAR.tree, groups = tree.groups.filter((g) => tree.talents.some((t) => t.group === g.id));
    let h = intro(`${esc(G.CHAR.heroName)}'s tree (the character chosen last). Talents last for one run. Totems of Power (from altars, at most ${G.TALENT_CAP.totem} per day) buy them in the tree (T): every talent costs 1 totem and unlocks the ones below it. The tree starts empty every run.`);
    for (const g of groups) h += `<p class="bk-sec" style="color:${g.color}"><img src="${icon('totem')}" alt="">${esc(g.name)}</p>` + grid(tree.talents.filter((t) => t.group === g.id).sort((a, b) => a.y - b.y || a.x - b.x).map((t) => talentCard(t, tree)));
    const loose = tree.talents.filter((t) => !groups.some((g) => g.id === t.group));
    if (loose.length) h += sec('Other') + grid(loose.map((t) => talentCard(t, tree)));
    return h;
  }
  function alien() {
    const A = G.CHAR.alien;
    return intro(`${esc(G.CHAR.heroName)}'s alien talents. Alien Spoons come from repelling alien invasions (at most ${G.TALENT_CAP.spoon} per day). Spend them on alien talents in the saddlebag (I > Alien Talents), in any order.`) + grid(A.talents.map((t) => talentCard(t, null)));
  }

  function workbench() {
    const SH = G.CAMP.shop, R = G.RARITY;
    return intro('The workbench stands by the farmhouse all day: walk up to it and press E (it opens by itself at dawn).')
      + grid([
        card({ title: 'Blessings for essence', img: icon('essence'), color: '#c8a0ff', text: `${SH.offers} blessings on offer, new stock every dawn. Every purchase makes the next one ${pct(SH.priceGrowth)} dearer, compounding.`,
          rows: R.map((r, i) => [r.name, `<span style="color:${r.color}">${n0(SH.prices[i])} essence</span>`]) }),
        card({ title: 'Reroll the stock', img: icon('dice'), color: '#c8a0ff', text: `Replaces the offer for ${SH.reroll} essence, ${SH.rerollGrowth} more each time. Essence Siphon makes rerolls cheaper.` }),
        card({ title: 'Scrap', img: icon('pickaxe'), color: '#ffd27a', text: 'Scrap everything lying on the ground for experience. You can also scrap single items with C, or every downgrade in your saddlebag at once. Loot left on the ground is lost when you take the cellar trapdoor.' }),
        card({ title: 'Upgrade item level', img: icon('hammer'), color: '#ffd27a', text: `Raise any item's level by up to ${G.CAMP.upgrade.levels} in all, and see every stat it would gain first (e.g. +20% poison damage → +26%). Each level costs ${G.CAMP.upgrade.cost} × (item level + 2) × the rarity's factor, ${pct(G.CAMP.upgrade.growth)} more for every level already added.`,
          rows: G.ITEM_RARITY.map((r, i) => [r.name, `<span style="color:${r.color}">×${G.CAMP.upgrade.rarity[i]}</span>`]) }),
        card({ title: 'Trinkets', img: icon('pocketwatch'), color: '#ffe080', text: 'Choose which of your trinkets to carry. New ones come from dungeon bosses.' }),
        card({ title: 'Training dummy', img: icon('crosshair'), color: '#ffb070', text: 'At dawn a training dummy stands behind the barn: hit it to see your damage per second.' }),
        card({ title: 'Cellar trapdoor', img: icon('door'), color: '#a08060', text: 'At dawn the trapdoor by the house opens: stand on it to travel to the next map.' }),
      ]);
  }

  // ---------- the screen ----------
  BK.render = function (tab) {
    if (tab) BK.tab = tab;
    const t = TABS.find((x) => x.id === BK.tab) || TABS[0];
    $('book-tabs').innerHTML = TABS.map((x) => `<button class="${x.id === t.id ? 'on' : ''}" data-tab="${x.id}" role="tab" aria-selected="${x.id === t.id}"><img src="${icon(x.icon)}" alt="">${esc(x.name)}</button>`).join('');
    let html;
    try { html = t.render(); } catch (err) { html = `<p class="bk-intro">This page could not be written: ${esc(err.message)}</p>`; console.error(err); }
    const body = $('book-body');
    body.innerHTML = `<h3 class="bk-title"><img src="${icon(t.icon)}" alt="">${esc(t.name)}</h3>` + html;
    body.scrollTop = 0;
  };
  // Open from the title, the pause menu or B while playing (the game waits); close back to where you were.
  G.openBook = function () {
    if (!['title', 'playing', 'paused', 'held'].includes(G.state)) return;
    G.bookFrom = G.state; G.state = 'book';
    BK.render(); G.ui.show('scr-book');
  };
  G.closeBook = function () {
    if (G.state !== 'book') return;
    G.state = G.bookFrom;
    if (G.state === 'title') { G.ui.show('scr-title'); G.ui.showBest(); }
    else if (G.state === 'paused') { G.ui.show('scr-pause'); $('b-resume').focus(); }
    else G.ui.show(null);
  };
  BK.init = function () {
    $('book-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { G.audio.play('click'); BK.render(b.dataset.tab); } });
  };
})();
