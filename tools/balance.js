'use strict';
// Balance Lab (tools/balance.html). Loads the game itself, without its menus, and measures it.
//   Monsters: health and damage per hit of the map's most common monster, an elite of it and the map's
//     boss at any minute of the run, from the game's own scaling (stages.json, enemies.json).
//   Characters: for every row (a level reached at a minute of the run) a character with random talents
//     (the totems and Miracles, "spoons" in the code, a run has by then), random blessings (one per level up, plus the three you
//     start with) and random gear at that minute's item level, carrying a copy of every weapon base.
//   Fights: each character fights the minute's boss alone, and packs of 5 and 50 of the minute's common
//     monster around it, on the game's own combat code (talents, blessings, implicits, damage over time,
//     explosions, ricochets), many times faster than real time. Every weapon gets the same characters (the
//     same random seeds), so the comparison is fair. Targets have their monster's max health, so effects
//     worth a share of it (poison, bursts) are worth what they would be. Dummy mode: the targets never die
//     (sustained damage per second). Pack mode: they die and are replaced, so on-kill effects count; it
//     measures health removed per second (overkill does not count).
// Nothing hits the character back: this measures offense only.
(function () {
  const U = G.U, P = G.player, $ = (id) => document.getElementById(id);
  const BAL = window.BAL = { last: null, busy: false, stop: false };
  const SLOTS = ['hat', 'body', 'boots', 'charm'], RARITY = ['Common', 'Magic', 'Rare'];
  const KEY = 'barnyard-balance-v1', BASE_KEY = 'barnyard-balance-baseline-v1';
  const RNG0 = Math.random;
  const SPACING = 0.95, INNER = 1.6, RESPAWN = 0.3;

  // ---------- settings ----------
  BAL.defaults = () => ({ rows: '5@3, 15@8, 25@14, 50@22, 75@30, 100@38', minutes: '3, 5, 10, 15, 20, 25, 30', targets: '5, 50', boss: true,
    samples: 5, warmup: 4, measure: 10, weaponRarity: 2, gear: 2, mode: 'dummy', seed: 1, off: [] });
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
  const nums = (s) => String(s).split(/[\s,;]+/).map(Number).filter((v) => isFinite(v) && v > 0);
  const parseRows = (s) => String(s).split(/[,;]+/).map((p) => p.trim().split('@').map(Number)).filter(([l, m]) => l > 0 && m >= 0).map(([level, minute]) => ({ level: Math.round(level), minute }));

  // ---------- a moment of the run ----------
  // Puts the game at `minute` of fighting time (the run's timer): which day, map, danger stage and item level.
  function at(minute) {
    const t = minute * 60, day = Math.floor(t / G.DAY_SECONDS);
    G.time = t; G.day = day; G.dayT = t - day * G.DAY_SECONDS; G.phase = 'fight';
    G.STAGES = G.map().stages;
    G.tier = Math.min(G.STAGES.length - 1, Math.floor(G.dayT / G.STAGE_SECONDS));
    G.danger = day * G.STAGES.length + G.tier;
    const m = G.map(), [lo, hi] = m.itemLevel;
    const ilvl = Math.round(G.extraDays() * G.ENDLESS.ilvl) + U.clamp(Math.round(lo + (hi - lo) * G.dayT / G.DAY_SECONDS), lo, hi);
    return { minute, day, dayT: G.dayT, tier: G.tier, danger: G.danger, map: m, stage: G.stageAt(G.tier), ilvl };
  }
  // The monster most likely to spawn right now (the spawner's own table), and the map's main boss.
  function commonMonster() {
    const st = G.stageAt(G.tier), local = G.dayT - G.tier * G.STAGE_SECONDS;
    let w = st.spawns[0].weights;
    for (const s of st.spawns) if (local >= s.at) w = s.weights;
    return G.ENEMIES[Object.keys(w).sort((a, b) => w[b] - w[a])[0]];
  }
  const mainBoss = (m) => { const ids = Object.keys(m.bosses).sort((a, b) => m.bosses[b] - m.bosses[a]); return ids.length ? G.ENEMIES[ids[0]] : null; };
  // Talent points a run has by then: altars rise `first` seconds into each day and every `every` after,
  // at most the daily cap; a Miracle (spoon) from the bonfire every night already passed.
  function points(day, dayT) {
    const A = G.ALTAR, cap = G.TALENT_CAP;
    let totems = 0, spoons = 0;
    for (let d = 0; d <= day; d++) {
      const t = d < day ? G.DAY_SECONDS : dayT;
      if (A.enemy) totems += Math.min(cap.totem, t < A.first ? 0 : Math.floor((t - A.first) / A.every) + 1);
      if (d < day) spoons += Math.min(cap.spoon, G.BONFIRE.miracles);
    }
    return { totems, spoons };
  }
  // Monsters at a minute: health, damage per hit (and per shot for ranged ones), the elite version, the boss.
  BAL.enemyAt = function (minute) {
    const c = at(minute), n = commonMonster(), b = mainBoss(c.map), hk = G.diffHp(), dk = G.diffDmg();
    return {
      minute, day: c.day + 1, map: c.map.name, stage: c.stage.name, ilvl: c.ilvl, hpK: hk, dmgK: dk,
      normal: n.name, nHp: n.hp * hk, nHit: n.dmg * dk, nShot: n.ranged ? n.ranged.damage * dk : 0, nXp: n.xp * (1 + 0.3 * c.danger) * G.XP.mult,
      eHp: n.hp * hk * G.ELITE.hp, eHit: n.dmg * dk * G.ELITE.damage,
      boss: b ? b.name : '—', bHp: b ? b.hp * hk : 0, bHit: b ? b.dmg * dk : 0, bAi: b ? b.ai : '', bR: b ? b.radius * b.size : 1,
    };
  };

  // ---------- a character ----------
  // Fresh run at the current moment: random gear, random talents, the weapon, random blessings.
  function build(row, ctx, pts, wtype, cfg) {
    G.run = G.newRun();
    G.enemySys.clear(); G.combat.reset(); G.tfx.reset(); G.mech.clear(); G.fx.clear(); G.enemyShots.clear();
    G.progress.reset(); G.trinkets.reset();
    const tags = ctx.map.tags;
    if (cfg.gear >= 0) for (const s of SLOTS) G.equip[s] = G.makeItem(s, cfg.gear, 0, null, { ilvl: ctx.ilvl, tags });
    G.run.totems = pts.totems; G.run.spoons = pts.spoons;
    let learned = 0;
    for (const cur of ['totem', 'spoon']) for (let k = 0; k < 400; k++) {
      const can = G.talents.all().filter((t) => t.currency === cur && G.talents.canLearn(t));
      if (!can.length) break;
      if (G.talents.learn(U.pick(can).id)) learned++;
    }
    G.equip.weapon = G.makeItem('weapon', cfg.weaponRarity, 0, wtype, { ilvl: ctx.ilvl, tags: Object.keys(G.TAG_NAMES) });
    G.progress.onEquipChange();
    const want = row.level - 1 + 3;
    let picked = 0;
    for (; picked < want; picked++) {
      const ch = G.progress.rollChoices();
      if (!ch.length) break;
      const c = U.pick(ch);
      G.progress.applyUpgrade(c.id, c.rarity);
    }
    G.level = row.level;
    G.playerSys.reset(); G.progress.recompute(); P.hp = G.stats.maxHp;
    const s = G.stats, it = G.equip.weapon;
    return { learned, blessings: picked, maxHp: s.maxHp, red: G.progress.reduction(), block: s.blockChance, crit: Math.min(1, s.crit), aps: 1 / s.interval, hit: s.dmg, dmgLo: it.dmgLo, dmgHi: it.dmgHi, weapon: it.name };
  }

  // ---------- a fight ----------
  // Targets in a disc around the cat, nearest first (a sunflower spiral: about 1.7 m apart). A boss stands
  // alone in front of the cat, its own size.
  const spot = (i) => { const r = INNER + SPACING * Math.sqrt(i), a = i * 2.39996; return [Math.sin(a) * r, Math.cos(a) * r]; };
  // sc: { n targets, hp (each one's max health), boss, r (the boss's radius) }
  function fight(sc, cfg) {
    G.enemySys.clear(); G.combat.reset(); G.tfx.reset(); G.trinkets.clear(); G.fx.clear(); G.enemyShots.clear();
    G.playerSys.reset(); G.progress.recompute(); P.hp = G.stats.maxHp;
    const pack = cfg.mode === 'pack', slots = [];
    const spawn = (s) => {
      const e = G.enemySys.spawn('training_dummy', s.x, s.z);
      Object.assign(e, { lockYaw: true, speed: 0, dmg: 0, boss: !!sc.boss, maxHp: sc.hp, hp: pack ? sc.hp : 1e300 });
      if (sc.boss) e.r = sc.r;
      s.e = e; s.hp0 = e.hp; s.counted = false;
    };
    for (let i = 0; i < sc.n; i++) { const [x, z] = sc.boss ? [0, 0.8 + sc.r] : spot(i), s = { x, z }; spawn(s); slots.push(s); }
    const dt = 1 / 60, warm = Math.round(cfg.warmup / dt), steps = warm + Math.round(cfg.measure / dt), row = G.combat.meterRow('player');
    let tot0 = 0, kills0 = 0, removed = 0, on = false, bt0 = {};
    G.state = 'playing';
    for (let i = 0; i < steps; i++) {
      if (i === warm) {
        on = true; tot0 = row.total; kills0 = G.run.kills; bt0 = Object.assign({}, row.byType);
        for (const s of slots) s.hp0 = s.e.dead ? 0 : s.e.hp;
      }
      G.playerSys.update(dt); G.enemySys.update(dt); G.combat.update(dt); G.tfx.update(dt); G.trinkets.update(dt); G.fx.clear();
      P.x = 0; P.z = 0;
      for (const s of slots) {
        const e = s.e;
        if (!e.dead) { e.x = s.x; e.z = s.z; e.kbx = e.kbz = 0; continue; }
        if (!s.counted) { s.counted = true; s.t = RESPAWN; if (on) removed += s.hp0; }
        if ((s.t -= dt) <= 0) { spawn(s); if (!on) s.hp0 = s.e.hp; }
      }
    }
    if (pack) for (const s of slots) if (!s.e.dead) removed += Math.max(0, s.hp0 - s.e.hp);
    G.state = 'balance';
    const dmg = row.total - tot0, mix = {};
    for (const k in G.DMG_TYPES) mix[k] = dmg > 0 ? (row.byType[k] - (bt0[k] || 0)) / dmg : 0;
    return { dps: pack ? removed / cfg.measure : dmg / cfg.measure, raw: dmg / cfg.measure, kills: (G.run.kills - kills0) / cfg.measure, mix };
  }

  // ---------- the run ----------
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const median = (a) => { const s = a.slice().sort((x, y) => x - y), k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : 0; };
  const geo = (a) => Math.exp(mean(a.filter((v) => v > 0).map(Math.log)));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  BAL.run = async function (cfg, progress = () => {}) {
    if (BAL.busy) return null;
    BAL.busy = true; BAL.stop = false;
    const rows = parseRows(cfg.rows), weapons = Object.keys(G.WEAPONS).filter((w) => !cfg.off.includes(w));
    const targets = (cfg.boss ? ['boss'] : []).concat(nums(cfg.targets).map((n) => String(Math.round(n))));
    const total = rows.length * cfg.samples * weapons.length, started = performance.now();
    const out = { cfg: Object.assign({}, cfg), when: new Date().toISOString(), weapons, targets, rows: [] };
    let done = 0;
    try {
      for (const [ri, row] of rows.entries()) {
        const ctx = at(row.minute), pts = points(ctx.day, ctx.dayT), foe = BAL.enemyAt(row.minute);
        const R = { level: row.level, minute: row.minute, day: ctx.day + 1, map: ctx.map.name, stage: ctx.stage.name, ilvl: ctx.ilvl, totems: pts.totems, spoons: pts.spoons, foe, chars: [], w: {} };
        for (const w of weapons) { const tag = G.WEAPONS[w].tag; R.w[w] = { samples: [], drops: !tag || ctx.map.tags.includes(tag) }; }
        const scen = (k) => (k === 'boss' ? { n: 1, hp: foe.bHp, boss: true, r: foe.bR } : { n: +k, hp: foe.nHp });
        for (let s = 0; s < cfg.samples && !BAL.stop; s++) {
          for (const w of weapons) {
            if (BAL.stop) break;
            Math.random = U.seeded(cfg.seed * 7919 + ri * 1009 + s * 131);   // the same character for every weapon
            at(row.minute);
            const ch = build(row, ctx, pts, w, cfg), res = { char: ch, t: {} };
            for (const k of targets) res.t[k] = fight(scen(k), cfg);
            Math.random = RNG0;
            R.w[w].samples.push(res); R.chars.push(ch);
            done++;
            const el = (performance.now() - started) / 1000;
            progress(done / total, `Level ${row.level} · ${G.WEAPONS[w].name} · sample ${s + 1}/${cfg.samples} · ${Math.round(el / done * (total - done))}s left`);
            await tick();
          }
        }
        for (const w of weapons) {
          const S = R.w[w].samples;
          R.w[w].t = {};
          for (const n of targets) {
            const v = S.map((x) => x.t[n].dps), mix = {};
            for (const k in G.DMG_TYPES) mix[k] = mean(S.map((x) => x.t[n].mix[k]));
            R.w[w].t[n] = { mean: mean(v), min: Math.min(...v), max: Math.max(...v), kills: mean(S.map((x) => x.t[n].kills)), mix };
          }
        }
        R.char = { learned: mean(R.chars.map((c) => c.learned)), blessings: mean(R.chars.map((c) => c.blessings)), maxHp: mean(R.chars.map((c) => c.maxHp)), red: mean(R.chars.map((c) => c.red)), block: mean(R.chars.map((c) => c.block)), crit: mean(R.chars.map((c) => c.crit)) };
        R.med = {};
        for (const n of targets) R.med[n] = median(weapons.map((w) => R.w[w].t[n].mean));
        out.rows.push(R);
        if (BAL.stop) break;
      }
    } finally { Math.random = RNG0; G.state = 'balance'; BAL.busy = false; }
    out.seconds = (performance.now() - started) / 1000;
    out.summary = summarize(out);
    BAL.last = out;
    return out;
  };
  // Per weapon and target count: its damage as a share of the median weapon (geometric mean over the
  // rows), and how much more it deals to a crowd than to one target. Per target count: the spread.
  function summarize(o) {
    const S = { weapons: {}, spread: {} };
    for (const w of o.weapons) {
      const x = S.weapons[w] = { share: {}, mix: {} };
      for (const k in G.DMG_TYPES) x.mix[k] = mean(o.rows.flatMap((r) => o.targets.map((n) => r.w[w].t[n].mix[k])));
      for (const n of o.targets) x.share[n] = geo(o.rows.map((r) => r.w[w].t[n].mean / (r.med[n] || 1)));
      const packs = packsOf(o), lo = packs[0], hi = packs[packs.length - 1];
      x.crowd = packs.length > 1 ? geo(o.rows.map((r) => r.w[w].t[hi].mean / (r.w[w].t[lo].mean || 1))) : 1;
    }
    for (const n of o.targets) {
      const per = o.rows.map((r) => { const v = o.weapons.map((w) => r.w[w].t[n].mean).filter((v) => v > 0); return Math.max(...v) / Math.min(...v); });
      S.spread[n] = { avg: geo(per), worst: Math.max(...per) };
    }
    return S;
  }

  const packsOf = (o) => o.targets.filter((k) => k !== 'boss').sort((a, b) => a - b);
  const label = (k) => (k === 'boss' ? 'Boss alone' : `${k} target${+k === 1 ? '' : 's'}`);

  // ---------- display ----------
  const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const fmt = (v) => {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a < 1000) return a < 10 ? (+v.toFixed(1)).toString() : Math.round(v).toString();
    let i = 0, x = a;
    while (x >= 1000 && i < SUF.length - 1) { x /= 1000; i++; }
    return (v < 0 ? '-' : '') + (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.round(x)) + SUF[i];
  };
  const pct = (v, d = 0) => (v > 0 && v < 0.01 && !d ? '<1%' : `${(v * 100).toFixed(d)}%`);
  const secs = (s) => (!isFinite(s) ? '—' : s < 0.01 ? '<0.01s' : s < 1 ? `${s.toFixed(2)}s` : s < 60 ? `${s.toFixed(1)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : s < 360000 ? `${(s / 3600).toFixed(1)}h` : 'never');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (w) => { try { return G.world.itemIcon({ slot: 'weapon', model: G.WEAPONS[w].model }); } catch (e) { return ''; } };
  // a cell's colour from its share of the median: red below, green above
  const heat = (r) => { const k = U.clamp(Math.log2(r || 1e-9) / 1.5, -1, 1); return k < 0 ? `rgba(224,69,58,${(-k * 0.55).toFixed(2)})` : `rgba(90,200,110,${(k * 0.45).toFixed(2)})`; };
  const MIXC = { physical: '#e0b060', poison: '#8aef4a', elemental: '#7fd0ff' };
  const mixText = (m) => Object.keys(m).filter((k) => m[k] >= 0.01).sort((a, b) => m[b] - m[a]).map((k) => `<span style="color:${MIXC[k] || 'inherit'}">${G.DMG_TYPES[k].toLowerCase()} ${pct(m[k])}</span>`).join(' · ');
  const delta = (v, b) => { if (!b) return ''; const d = v / b - 1; return `<span class="d ${d > 0.005 ? 'up' : d < -0.005 ? 'down' : ''}">${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%</span>`; };

  function enemyTable(minutes) {
    const rows = minutes.map(BAL.enemyAt);
    return `<table><thead><tr><th>Minute</th><th>Day · map · stage</th><th class="n">Item lvl</th><th class="n">Health ×</th><th class="n">Damage ×</th><th>Normal monster</th><th class="n">Health</th><th class="n">Damage / hit</th><th class="n">Elite health</th><th class="n">Elite hit</th><th>Boss</th><th class="n">Boss health</th><th class="n">Boss hit</th></tr></thead><tbody>`
      + rows.map((r) => `<tr><td>${r.minute}:00</td><td>${r.day} · ${esc(r.map)} · ${esc(r.stage)}</td><td class="n">${r.ilvl}</td><td class="n">×${fmt(r.hpK)}</td><td class="n">×${fmt(r.dmgK)}</td><td>${esc(r.normal)}</td><td class="n">${fmt(r.nHp)}</td>`
        + `<td class="n">${fmt(r.nHit)}${r.nShot ? `<small> · shot ${fmt(r.nShot)}</small>` : ''}</td><td class="n">${fmt(r.eHp)}</td><td class="n">${fmt(r.eHit)}</td><td>${esc(r.boss)}</td><td class="n">${fmt(r.bHp)}</td><td class="n">${fmt(r.bHit)}</td></tr>`).join('')
      + `</tbody></table><p class="note">Damage per hit is a touch (monsters touching you hit about once a second). Bosses with the golem AI also slam for ×1.6 and charge for ×1.4; every boss after the first in a run has +${pct(G.BOSS.hpPerBoss)} health. The elite is the common monster as a gold elite. Armor and block are not taken off.</p>`;
  }
  function levelTable(rows) {
    return `<table><thead><tr><th class="n">Level</th><th class="n">Minute</th><th>Day · map</th><th class="n">XP for the next level</th><th>Common monster</th><th class="n">XP per kill</th><th class="n">Kills per level</th></tr></thead><tbody>`
      + rows.map((r) => { const e = BAL.enemyAt(r.minute), need = G.xpNeeded(r.level); return `<tr><td class="n">${r.level}</td><td class="n">${r.minute}:00</td><td>${e.day} · ${esc(e.map)}</td><td class="n">${fmt(need)}</td><td>${esc(e.normal)}</td><td class="n">${fmt(e.nXp)}</td><td class="n">${fmt(need / e.nXp)}</td></tr>`; }).join('')
      + `</tbody></table><p class="note">How hard each row's level is to reach: experience needed for one more level against what the minute's common monster gives (elites give ×${G.ELITE.xp}). Experience barrels and cleared dungeons give whole levels.</p>`;
  }
  function charTable(o) {
    return `<table><thead><tr><th class="n">Level</th><th class="n">Minute</th><th>Day · map · stage</th><th class="n">Item lvl</th><th class="n">Talents</th><th class="n">Blessings</th><th class="n">Max health</th><th class="n">Damage taken</th><th class="n">Block</th><th class="n">Crit</th></tr></thead><tbody>`
      + o.rows.map((r) => `<tr><td class="n">${r.level}</td><td class="n">${r.minute}:00</td><td>${r.day} · ${esc(r.map)} · ${esc(r.stage)}</td><td class="n">${r.ilvl}</td><td class="n">${r.char.learned.toFixed(1)} <small>(${r.totems} totems, ${r.spoons} spoons)</small></td><td class="n">${r.char.blessings.toFixed(0)}</td><td class="n">${fmt(r.char.maxHp)}</td><td class="n">${pct(1 - r.char.red)}</td><td class="n">${pct(r.char.block)}</td><td class="n">${pct(r.char.crit)}</td></tr>`).join('')
      + `</tbody></table><p class="note">Averaged over every character of the row. Gear: ${o.cfg.gear < 0 ? 'none besides the weapon' : `${RARITY[o.cfg.gear]} items in every slot`}; weapons: ${RARITY[o.cfg.weaponRarity]}.</p>`;
  }
  function dpsTable(o, n, base) {
    const head = o.rows.map((r) => `<th class="n">Lv ${r.level}<small>${r.minute}:00 · ilvl ${r.ilvl}</small></th>`).join('');
    const body = o.weapons.map((w) => `<tr><td class="wn"><img src="${icon(w)}" alt="">${esc(G.WEAPONS[w].name)}</td>` + o.rows.map((r) => {
      const c = r.w[w].t[n], k = c.mean / (r.med[n] || 1), b = base && base[`${w}|${r.level}@${r.minute}|${n}`];
      const tip = `${o.cfg.samples} character${o.cfg.samples === 1 ? '' : 's'}: ${fmt(c.min)} – ${fmt(c.max)} · ${Object.keys(c.mix).filter((t) => c.mix[t] >= 0.01).map((t) => `${t} ${pct(c.mix[t])}`).join(', ')}${o.cfg.mode === 'pack' ? ` · ${c.kills.toFixed(1)} kills/s` : ''}${r.w[w].drops ? '' : ' · does not drop on this map'}`;
      return `<td class="n${r.w[w].drops ? '' : ' na'}" style="background:${heat(k)}" title="${tip}">${fmt(c.mean)}<small>${pct(k)}</small>${delta(c.mean, b)}</td>`;
    }).join('') + '</tr>').join('');
    const foot = `<tr class="foot"><td>Median weapon</td>${o.rows.map((r) => `<td class="n">${fmt(r.med[n])}</td>`).join('')}</tr>`
      + `<tr class="foot"><td>Best ÷ worst</td>${o.rows.map((r) => { const v = o.weapons.map((w) => r.w[w].t[n].mean).filter((x) => x > 0); return `<td class="n">×${(Math.max(...v) / Math.min(...v)).toFixed(1)}</td>`; }).join('')}</tr>`;
    return `<table class="dps"><thead><tr><th>Weapon</th>${head}</tr></thead><tbody>${body}${foot}</tbody></table>`;
  }
  function summaryTable(o) {
    const S = o.summary, ts = o.targets, packs = packsOf(o), ranked = o.weapons.slice().sort((a, b) => geo(ts.map((n) => S.weapons[b].share[n])) - geo(ts.map((n) => S.weapons[a].share[n])));
    const verdict = (v) => (v >= 1.5 ? '<b class="up">too strong</b>' : v >= 1.2 ? '<span class="up">strong</span>' : v <= 0.67 ? '<b class="down">too weak</b>' : v <= 0.83 ? '<span class="down">weak</span>' : 'fine');
    const spread = ts.map((n) => `<div class="kpi"><b>×${S.spread[n].avg.toFixed(1)}</b><span>${label(n)}: best ÷ worst weapon at the typical level (worst level ×${S.spread[n].worst.toFixed(1)})</span></div>`).join('');
    return `<div class="kpis">${spread}</div><table><thead><tr><th>Weapon</th>${ts.map((n) => `<th class="n">${label(n)}</th>`).join('')}${packs.length > 1 ? '<th class="n">Crowd scaling</th>' : ''}<th>Overall</th><th>Damage mix</th></tr></thead><tbody>`
      + ranked.map((w) => {
        const x = S.weapons[w], all = geo(ts.map((n) => x.share[n]));
        return `<tr><td class="wn"><img src="${icon(w)}" alt="">${esc(G.WEAPONS[w].name)} <small>${esc(G.WEAPONS[w].class)}${G.WEAPONS[w].tag ? ' · ' + esc(G.WEAPONS[w].tag) : ''}</small></td>${ts.map((n) => `<td class="n" style="background:${heat(x.share[n])}">${pct(x.share[n])}</td>`).join('')}`
          + `${packs.length > 1 ? `<td class="n">×${x.crowd.toFixed(1)}</td>` : ''}<td>${pct(all)} · ${verdict(all)}</td><td>${mixText(x.mix)}</td></tr>`;
      }).join('')
      + `</tbody></table><p class="note">Each weapon's damage as a share of the median weapon at the same level (geometric mean over the levels; 100% = the median weapon). Overall: the same over every fight. Damage mix: where its damage comes from, averaged over every fight.${packs.length > 1 ? ` Crowd scaling: damage on ${packs[packs.length - 1]} targets ÷ damage on ${packs[0]}.` : ''} Themed weapons (alien, spirit, eldritch) are compared at every level even where they cannot drop yet (dimmed in the tables below).</p>`;
  }
  function matchTable(o) {
    const packs = packsOf(o), boss = o.targets.includes('boss');
    return `<table><thead><tr><th class="n">Level</th><th class="n">Minute</th><th>Common monster</th><th class="n">Its hit</th><th class="n">Hits to kill you</th>${packs.map((n) => `<th class="n">Pack of ${n} dies in</th>`).join('')}<th>Boss</th><th class="n">Boss hit</th>${boss ? '<th class="n">Boss dies in<small>median · best · worst weapon</small></th>' : ''}</tr></thead><tbody>`
      + o.rows.map((r) => {
        const f = r.foe, c = r.char, taken = (h) => h * (1 - c.red), wb = boss ? o.weapons.map((w) => r.w[w].t.boss.mean).filter((v) => v > 0) : [];
        return `<tr><td class="n">${r.level}</td><td class="n">${r.minute}:00</td><td>${esc(f.normal)} <small>${fmt(f.nHp)} health</small></td><td class="n">${pct(taken(f.nHit) / c.maxHp)} <small>of your health</small></td><td class="n">${fmt(c.maxHp / Math.max(1e-9, taken(f.nHit)))}</td>`
          + packs.map((n) => `<td class="n">${secs(n * f.nHp / r.med[n])}</td>`).join('')
          + `<td>${esc(f.boss)} <small>${fmt(f.bHp)} health</small></td><td class="n">${pct(taken(f.bHit) / c.maxHp)} <small>of your health</small></td>`
          + (boss ? `<td class="n">${secs(f.bHp / r.med.boss)} · ${secs(f.bHp / Math.max(...wb))} · ${secs(f.bHp / Math.min(...wb))}</td>` : '') + '</tr>';
      }).join('')
      + `</tbody></table><p class="note">The row's character against that minute's monsters, with the median weapon. Hits are after your armor, before block. Kill times assume every target is in reach the whole time.</p>`;
  }

  // ---------- the page ----------
  let cfg = Object.assign(BAL.defaults(), load(KEY, {}));
  const baseline = () => load(BASE_KEY, null);
  function readForm() {
    const v = (id) => $(id).value;
    cfg = { rows: v('f-rows'), minutes: v('f-minutes'), targets: v('f-targets'), boss: $('f-boss').checked, samples: Math.max(1, Math.round(+v('f-samples') || 1)), warmup: Math.max(0, +v('f-warmup') || 0), measure: Math.max(1, +v('f-measure') || 1),
      weaponRarity: +v('f-wrar'), gear: +v('f-gear'), mode: v('f-mode'), seed: Math.round(+v('f-seed') || 1), off: [...document.querySelectorAll('#f-weapons input')].filter((i) => !i.checked).map((i) => i.value) };
    save(KEY, cfg);
    return cfg;
  }
  function fillForm() {
    const set = (id, x) => { $(id).value = x; };
    set('f-rows', cfg.rows); set('f-minutes', cfg.minutes); set('f-targets', cfg.targets); $('f-boss').checked = !!cfg.boss; set('f-samples', cfg.samples); set('f-warmup', cfg.warmup); set('f-measure', cfg.measure);
    set('f-wrar', cfg.weaponRarity); set('f-gear', cfg.gear); set('f-mode', cfg.mode); set('f-seed', cfg.seed);
    $('f-weapons').innerHTML = Object.keys(G.WEAPONS).map((w) => `<label><input type="checkbox" value="${w}" ${cfg.off.includes(w) ? '' : 'checked'}><img src="${icon(w)}" alt="">${esc(G.WEAPONS[w].name)}</label>`).join('');
  }
  function estimate() {
    const c = readForm(), sims = parseRows(c.rows).length * c.samples * (Object.keys(G.WEAPONS).length - c.off.length);
    $('estimate').textContent = `${sims} characters × ${nums(c.targets).length + (c.boss ? 1 : 0)} fights of ${c.warmup + c.measure} game seconds each`;
  }
  function renderStatic() {
    $('out-enemies').innerHTML = enemyTable(nums(cfg.minutes));
    $('out-levels').innerHTML = levelTable(parseRows(cfg.rows));
    const w = G.DATA_WARNINGS.length;
    $('warnings').hidden = !w;
    $('warnings').innerHTML = w ? `<b>${w} problem${w === 1 ? '' : 's'} in data/:</b><ul>${G.DATA_WARNINGS.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  }
  function renderResults(o) {
    const base = baseline(), b = base && base.dps;
    $('results').hidden = false;
    $('res-meta').textContent = `${o.cfg.mode === 'pack' ? 'Pack mode: health removed per second (no overkill), targets replaced as they die' : 'Dummy mode: sustained damage per second on targets that never die (with their monster\'s max health)'} · ${o.cfg.samples} character${o.cfg.samples === 1 ? '' : 's'} per weapon per level · ${o.cfg.measure}s measured after ${o.cfg.warmup}s · ran in ${o.seconds.toFixed(0)}s${base ? ` · Δ vs baseline from ${new Date(base.when).toLocaleString()}` : ''}`;
    $('out-summary').innerHTML = summaryTable(o);
    $('out-dps').innerHTML = o.targets.map((n) => `<h3>${label(n)}${n === 'boss' ? ' (one target with the boss\'s health)' : ` (the common monster's health)`}</h3>${dpsTable(o, n, b)}`).join('');
    $('out-chars').innerHTML = charTable(o);
    $('out-match').innerHTML = matchTable(o);
  }
  function flat(o) {
    const out = {};
    for (const r of o.rows) for (const w of o.weapons) for (const n of o.targets) out[`${w}|${r.level}@${r.minute}|${n}`] = r.w[w].t[n].mean;
    return out;
  }
  function csv(o) {
    const lines = [['weapon', 'level', 'minute', 'item level', 'targets', 'mean', 'min', 'max', 'share of median'].join(',')];
    for (const r of o.rows) for (const w of o.weapons) for (const n of o.targets) { const c = r.w[w].t[n]; lines.push([w, r.level, r.minute, r.ilvl, n, c.mean, c.min, c.max, (c.mean / (r.med[n] || 1)).toFixed(4)].join(',')); }
    lines.push('', ['minute', 'map', 'stage', 'monster', 'health', 'hit', 'elite health', 'elite hit', 'boss', 'boss health', 'boss hit'].join(','));
    for (const m of nums(o.cfg.minutes)) { const e = BAL.enemyAt(m); lines.push([m, e.map, e.stage, e.normal, e.nHp, e.nHit, e.eHp, e.eHit, e.boss, e.bHp, e.bHit].map((x) => (typeof x === 'string' ? `"${x}"` : x)).join(',')); }
    return lines.join('\n');
  }
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };

  async function start() {
    const c = readForm();
    $('b-run').disabled = true; $('b-stop').disabled = false; $('progress').hidden = false;
    const o = await BAL.run(c, (k, msg) => { $('bar').style.width = pct(k, 1); $('status').textContent = msg; });
    $('b-run').disabled = false; $('b-stop').disabled = true;
    $('status').textContent = BAL.stop ? 'Stopped.' : 'Done.';
    if (o && o.rows.length) renderResults(o);
  }
  function wire() {
    $('b-run').addEventListener('click', start);
    $('b-stop').addEventListener('click', () => { BAL.stop = true; });
    $('b-reload').addEventListener('click', () => location.reload());
    $('b-reset').addEventListener('click', () => { cfg = BAL.defaults(); save(KEY, cfg); fillForm(); renderStatic(); estimate(); });
    $('b-pin').addEventListener('click', () => { if (!BAL.last) return; save(BASE_KEY, { when: BAL.last.when, dps: flat(BAL.last) }); renderResults(BAL.last); });
    $('b-unpin').addEventListener('click', () => { try { localStorage.removeItem(BASE_KEY); } catch (e) { /* storage unavailable */ } if (BAL.last) renderResults(BAL.last); });
    $('b-json').addEventListener('click', () => BAL.last && download('balance.json', JSON.stringify(BAL.last, null, 1), 'application/json'));
    $('b-csv').addEventListener('click', () => BAL.last && download('balance.csv', csv(BAL.last), 'text/csv'));
    $('settings').addEventListener('change', () => { readForm(); renderStatic(); estimate(); });
  }

  // ---------- boot: the game without its menus, sounds, loot or messages ----------
  (async () => {
    try {
      await G.loadData();
      G.initEngine();
      const no = () => {};
      G.audio.play = no; G.audio.init = no;
      for (const k of ['toast', 'banner', 'bossBar']) G.ui[k] = no;
      for (const k of ['dropItem', 'dropHeal', 'dropCatnip', 'dropXP', 'dropEssence']) G.pickups[k] = no;
      G.onKey = null;   // the game's keyboard shortcuts drive menus this page does not have
      G.state = 'balance';
      fillForm(); wire(); renderStatic(); estimate();
      $('loading').hidden = true; $('app').hidden = false;
      BAL.ready = true;
    } catch (err) {
      $('loading').textContent = 'Could not load the game: ' + err.message + (location.protocol === 'file:' ? ' · serve the game folder over http (python3 -m http.server) and open /tools/balance.html' : '');
      throw err;
    }
  })();
})();
