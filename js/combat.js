"use strict";
// Combat: weapons, projectiles, the damage pipeline (crits, poison, bleed, explosions, damage types),
// talent effects that hook into it, pickups, experience, stats and inventory.
// Names (CLAUDE.md): "upgrades" / G.UPGRADES / G.pickList are the blessings you pick on level up; "essence"
// (G.run.essence, PK.ess, dropEssence) is the Embers currency picked up from the ground.
(function () {
  const T = THREE,
    U = G.U,
    M = G.M,
    F = G.fx,
    A = G.audio,
    W = G.world;
  const P = G.player,
    ES = G.enemySys;
  const dummy = new T.Object3D();

  // =====================================================================
  // Progress: stats, levels, blessings, inventory
  // =====================================================================
  const PR = (G.progress = {});
  PR.reset = function () {
    G.pickList = [];
    G.picks = {};
    G.level = 1;
    G.xp = 0;
    G.offers = [];
    G.equip = {
      weapon: G.starterWeapon(),
      hat: null,
      body: null,
      boots: null,
      charm: null,
    };
    G.bag = new Array(16).fill(null);
    G.newItems = false;
    G.stats = null;
    PR.recompute();
    G.rerolls = Math.max(0, Math.round(G.stats.rerolls));
    P.hp = G.stats.maxHp;
  };
  // Character base stats + learned talents + blessings + gear + weapon bonus + active buffs, then derived values.
  // s.fx holds the learned talent effects (G.EFFECTS), keyed by id.
  PR.recompute = function () {
    const s = Object.assign({}, G.BASE_STATS);
    s.fx = {};
    G.talents.apply(s);
    G.rules.stats(s); // talent rules: what is learned, and conditional stats that hold
    for (const id in P.buffs || {}) {
      const B = G.BUFFS[id],
        k = G.playerSys.buffPower(P.buffs[id]);
      if (B) for (const st in B.stats) G.addStat(s, st, B.stats[st] * k);
    }
    for (const p of G.pickList) {
      const u = G.UPG[p.id];
      if (u) u.apply(s, u.vals[p.rarity]);
    }
    for (const slot of G.SLOTS) {
      const it = G.equip[slot];
      if (!it) continue;
      for (const k in it.mods)
        if (!G.STATS[k].local) G.addStat(s, k, it.mods[k]); // local weapon affixes are in its own numbers
    }
    // gear set bonuses (items.json sets): every bonus whose piece count you wear
    const sets = {};
    for (const slot of G.SLOTS) {
      const it = G.equip[slot];
      if (it && it.set) sets[it.set] = (sets[it.set] || 0) + 1;
    }
    for (const id in sets)
      for (const b of G.SETS[id].bonuses)
        if (sets[id] >= b.n)
          for (const k in b.stats) G.addStat(s, k, b.stats[k]);
    s.sets = sets;
    const wi = G.equip.weapon,
      Wd = G.WEAPONS[wi.wtype];
    for (const k in Wd.bonus) G.addStat(s, k, Wd.bonus[k]);
    // the weapon type's implicit (weapons.json): fixed stats, and an effect read through s.wfx
    s.wfx = {};
    if (Wd.implicit) {
      for (const k in Wd.implicit.stats) G.addStat(s, k, Wd.implicit.stats[k]);
      if (Wd.implicit.effect) s.wfx[Wd.implicit.effect.id] = Wd.implicit.effect;
    }
    const fx = s.fx;
    s.maxHp *= 1 + s.maxHpInc; // increased max health (items)
    if (fx.livingFlesh) s.maxHp *= fx.livingFlesh.maxHpMult;
    if (fx.chainLightning)
      s.chains = Math.max(
        1,
        Math.floor(s.chains * fx.chainLightning.chainsMult),
      );
    s.noPoison = !!fx.ragingBull;
    s.weapon = Wd;
    s.wtype = wi.wtype;
    s.weaponDmg = wi.dmg;
    s.weaponPoison = !!Wd.poison && !s.noPoison;
    s.dmgRoll = [wi.dmgLo / wi.dmg, wi.dmgHi / wi.dmg]; // every hit rolls within the weapon's damage range
    // Only the weapon has base crit chance; increased crit chance multiplies it.
    s.baseCrit = (wi.crit || 0) + s.weaponCrit;
    s.crit = s.baseCrit * (1 + s.critChance);
    if (s.explodeChance > 0 && !s.explodePower) s.explodePower = 1;
    s.blockCap = fx.bombBattalion ? fx.bombBattalion.blockCap : 1;
    s.blockChance = Math.min(s.blockCap, G.blockChance(s.blockRating));
    G.tfx.stats(s); // Fortitude, Infused Flesh
    // armor (flat, from items) x increased armor; bleed and poison that grow with health and armor
    s.armorBase = s.armor * (1 + s.armorInc) * Math.max(0, 1 + s.armorMult);
    s.bleedDmg += (s.bleedPerHp * s.maxHp) / 100;
    s.poisonDmg += (s.poisonPerArmor * s.armorBase) / 100;
    s.speed = s.moveSpeed * (1 + s.moveMult);
    // attack speed bonuses multiply the weapon's attacks per second
    s.aps = wi.aps * (1 + s.atkSpeed);
    s.interval = Math.max(PR.MIN_INTERVAL, 1 / s.aps);
    // hit damage: the weapon's damage x every stat raising weapon hits (Weapon damage, Damage bonus, its class's damage)
    s.dmg = s.weaponDmg * C.mult("weapon", s);
    s.projCount = Wd.proj.count + s.projectiles * Wd.per;
    // Tome of Fireball: one fireball at a time; every extra projectile becomes bounces instead
    const PB = s.wfx.pyroblast;
    s.projBounces = PB
      ? Math.max(0, s.projCount - Wd.proj.count) * PB.bounces
      : 0;
    if (PB) s.projCount = Wd.proj.count;
    s.buffStack = Wd.implicit ? Wd.implicit.stacks : null; // Obsidian Blade: Bloodlust stacks
    s.pickupR = 2.6 * (1 + s.magnet);
    const oldMax = G.stats ? G.stats.maxHp : s.maxHp;
    G.stats = s;
    if (s.maxHp > oldMax) P.hp += s.maxHp - oldMax;
    P.hp = Math.min(P.hp, s.maxHp);
  };
  PR.MIN_INTERVAL = 0.04;
  PR.addXP = function (v) {
    G.xp += v * (1 + G.stats.xpGain);
    PR.levelCheck();
  };
  // n whole levels (experience barrels): a full level's worth each, keeping your progress toward the next.
  PR.grantLevels = function (n) {
    for (let i = 0; i < n; i++) G.xp += G.xpNeeded(G.level + i);
    PR.levelCheck();
  };
  PR.levelCheck = function () {
    while (G.xp >= G.xpNeeded(G.level)) {
      G.xp -= G.xpNeeded(G.level);
      G.level++;
      G.offers.push({
        title: `Level ${G.level}!`,
        sub: "Choose a blessing",
        luck: 0,
        min: 0,
      });
      F.levelUp(P.x, P.z);
      A.play("levelup");
      G.rules.fire("levelUp");
    }
  };
  // The blessings that can come up right now (level ups, the workbench), before weights.
  PR.offerPool = function () {
    const s = G.stats,
      banned = new Set(G.run.banned || []); // threads Mokosh has cut
    // never offer what a talent makes useless: poison under Raging Bull, crit chance past its use
    const useless = (u) =>
      (s.noPoison && (u.stat === "poisonChance" || u.stat === "poisonDmg")) ||
      (u.stat === "critChance" &&
        s.crit >= (s.fx.experiencedPrecision ? 2 : 1)) ||
      (u.stat === "projectiles" && !s.weapon.per); // weapons that throw nothing (the axe)
    // Toxic Touch: poison chance past 100% is worth having, so Rusted Blades keeps coming
    const ok = (u) =>
      u.ok(s) || (s.fx.multiPoison && u.stat === "poisonChance");
    return G.UPGRADES.filter(
      (u) => u.w > 0 && u.req(s) && ok(u) && !useless(u) && !banned.has(u.id),
    );
  };
  PR.rollChoices = function (luckBonus = 0, minRarity = 0, count) {
    const s = G.stats,
      avail = PR.offerPool();
    const out = [];
    while (
      out.length < (count || Math.max(1, Math.round(s.choices))) &&
      avail.length
    ) {
      const u = U.weighted(avail, (x) => x.w);
      avail.splice(avail.indexOf(u), 1);
      out.push({
        id: u.id,
        rarity: G.rollRarity(s.luck + luckBonus, minRarity),
      });
    }
    return out;
  };
  PR.applyUpgrade = function (id, rarity) {
    G.pickList.push({ id, rarity });
    (G.picks[id] = G.picks[id] || [0, 0, 0, 0])[rarity]++;
    PR.recompute();
  };
  // Takes a blessing back (Mokosh's weaving): the latest copy of it at that rarity. Returns true when done.
  PR.removeUpgrade = function (id, rarity) {
    for (let i = G.pickList.length - 1; i >= 0; i--) {
      if (G.pickList[i].id !== id || G.pickList[i].rarity !== rarity) continue;
      G.pickList.splice(i, 1);
      if (G.picks[id])
        G.picks[id][rarity] = Math.max(0, G.picks[id][rarity] - 1);
      PR.recompute();
      return true;
    }
    return false;
  };
  PR.onEquipChange = function () {
    PR.recompute();
    G.playerSys.setWeapon(G.equip.weapon.wtype);
    G.playerSys.setHat(G.equip.hat ? G.equip.hat.model : G.CHAR.hat);
  };
  // Learning or resetting talents mid-run applies straight away (extra rerolls included).
  PR.onTalentsChanged = function () {
    const before = G.stats.rerolls;
    PR.recompute();
    G.rerolls = Math.max(0, G.rerolls + Math.round(G.stats.rerolls - before));
  };
  PR.addItem = function (it) {
    if (!G.equip[it.slot]) {
      G.equip[it.slot] = it;
      PR.onEquipChange();
      G.run.items = (G.run.items || 0) + 1;
      G.ui.toast(`Equipped ${it.name}`, G.ITEM_RARITY[it.rarity].color);
      return true;
    }
    const i = G.bag.indexOf(null);
    if (i < 0) return false;
    G.bag[i] = it;
    G.newItems = true;
    G.run.items = (G.run.items || 0) + 1;
    G.ui.toast(`${it.name} → saddlebag (I)`, G.ITEM_RARITY[it.rarity].color);
    return true;
  };
  PR.equipFromBag = function (i) {
    const it = G.bag[i];
    if (!it) return;
    G.bag[i] = G.equip[it.slot] || null;
    G.equip[it.slot] = it;
    PR.onEquipChange();
  };
  PR.unequip = function (slot) {
    if (slot === "weapon" || !G.equip[slot]) return false;
    const i = G.bag.indexOf(null);
    if (i < 0) return false;
    G.bag[i] = G.equip[slot];
    G.equip[slot] = null;
    PR.onEquipChange();
    return true;
  };
  PR.scrapValue = (it) =>
    Math.max(
      1,
      Math.round(
        G.ITEM_RARITY[it.rarity].scrapXp *
          (1 + G.danger * G.ITEM_SCALING.scrapPerStage) *
          (1 + 0.15 * ((it.ilvl || 1) - 1)) *
          G.XP.mult,
      ),
    );
  // Workbench shop: blessings for embers (stages.json camp.shop). G.run.shop = { offers: [{ id,
  // rarity, sold }], rerolls: rerolls of this stock, bought: blessings bought this run }.
  PR.restock = function () {
    const sh = (G.run.shop = G.run.shop || {
      offers: [],
      rerolls: 0,
      bought: 0,
    });
    sh.offers = PR.rollChoices(0, 0, G.CAMP.shop.offers);
    sh.rerolls = 0;
  };
  // every purchase makes the shop dearer, compounding
  PR.shopPrice = (o) =>
    Math.round(
      G.CAMP.shop.prices[o.rarity] *
        Math.pow(1 + G.CAMP.shop.priceGrowth, G.run.shop.bought),
    );
  PR.rerollCost = () =>
    Math.round(
      (G.CAMP.shop.reroll + G.CAMP.shop.rerollGrowth * G.run.shop.rerolls) *
        (1 - Math.min(0.9, G.stats.rerollDiscount || 0)),
    );
  PR.buy = function (i) {
    const sh = G.run.shop,
      o = sh.offers[i];
    if (!o || o.sold || G.run.essence < PR.shopPrice(o)) return false;
    G.run.essence -= PR.shopPrice(o);
    o.sold = true;
    sh.bought++;
    PR.applyUpgrade(o.id, o.rarity);
    return true;
  };
  PR.shopReroll = function () {
    const sh = G.run.shop,
      cost = PR.rerollCost();
    if (G.run.essence < cost) return false;
    G.run.essence -= cost;
    sh.offers = PR.rollChoices(0, 0, G.CAMP.shop.offers);
    sh.rerolls++;
    return true;
  };
  // Workbench: raise an item's level by n (at most CAMP.upgrade.levels per item) for embers. Returns true when done.
  // What n more levels cost you now: with a free upgrade (Tinkerer) the first level is free.
  PR.upgradePrice = (it, n = 1) =>
    G.upgradeCost(it, n) -
    ((G.run.freeUpgrades || 0) > 0 ? G.upgradeCost(it, 1) : 0);
  PR.upgradeItem = function (it, n = 1) {
    const cost = PR.upgradePrice(it, n);
    if (n < 1 || n > G.upgradesLeft(it) || G.run.essence < cost) return false;
    if ((G.run.freeUpgrades || 0) > 0) G.run.freeUpgrades--;
    G.run.essence -= cost;
    G.setItemLevel(it, (it.ilvl || 1) + n);
    it.upgrades = (it.upgrades || 0) + n;
    G.run.upgrades = (G.run.upgrades || 0) + n;
    if (G.equip[it.slot] === it) PR.onEquipChange();
    return true;
  };
  // Inventory: scrap every bag item that is worse than what you wear in its slot. Returns [count, xp].
  PR.scrapDowngrades = function () {
    let n = 0,
      xp = 0;
    G.bag.forEach((it, i) => {
      if (!it || !G.equip[it.slot] || G.isUpgrade(it)) return;
      xp += PR.scrapValue(it);
      G.bag[i] = null;
      n++;
    });
    if (xp) PR.addXP(xp);
    return [n, xp];
  };
  // Armor right now: flat armor x (1 + increased armor from items, talents and buffs, and per monster
  // infected with poison, counting up to 50 of them) x more or less armor (Empowered Faith, Apostasy).
  // Damage reduction = armor / (armor + threshold), at most items.json armor.maxReduction (90%).
  // The threshold is the armor that halves damage, and it compounds with danger at the same rate as item
  // armor grows (items.json armor.threshold x thresholdGrowth ^ G.danger), so gear at the item level that
  // is dropping always gives about the same reduction, and only stacking armor raises it.
  PR.armor = function () {
    const s = G.stats;
    return (
      s.armor *
      (1 +
        s.armorInc +
        G.tfx.armorBonus() +
        s.armorPerPoisoned * Math.min(50, C.poisonedN || 0)) *
      Math.max(0, 1 + s.armorMult)
    );
  };
  PR.armorThreshold = (danger = G.danger || 0) =>
    G.ARMOR.threshold * Math.pow(G.ARMOR.thresholdGrowth, Math.max(0, danger));
  PR.reduction = function (a = PR.armor()) {
    return a > 0
      ? Math.min(G.ARMOR.maxReduction, a / (a + PR.armorThreshold()))
      : 0;
  };
  PR.scrap = function (where, key) {
    const it = where === "bag" ? G.bag[key] : G.equip[key];
    if (!it || (where === "equip" && key === "weapon")) return;
    if (where === "bag") G.bag[key] = null;
    else {
      G.equip[key] = null;
      PR.onEquipChange();
    }
    PR.addXP(PR.scrapValue(it));
  };

  // =====================================================================
  // Combat
  // =====================================================================
  const C = (G.combat = { projs: [], puddles: [], explQ: [], pid: 0 });
  C.init = function () {
    C.meshes = {};
    for (const k of G.PROJ_KINDS) {
      const mat =
        k === "wave"
          ? new T.MeshBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: 0.75,
              blending: T.AdditiveBlending,
              depthWrite: false,
              side: T.DoubleSide,
              fog: false,
            })
          : M.matBI;
      const m = M.inst(M.projGeo(k), mat, 320);
      G.scene.add(m);
      C.meshes[k] = m;
    }
  };
  // keepMeter: the damage meter carries on (travelling to the next map); otherwise a new run starts it over.
  C.reset = function (keepMeter) {
    C.atkT = 0.7;
    C.extra = [];
    C.holyN = 0;
    C.holyNext = false;
    C.curHoly = false;
    C.burstN = 0;
    C.greatN = 0;
    C.curGreat = false;
    C.novaQ = [];
    C.icd = {};
    C.atkLog = [];
    C.clock = 0;
    C.poisonedN = 0;
    C.poisonT = 0;
    C.projs.length = 0;
    C.puddles.length = 0;
    C.explQ.length = 0;
    C.holyQ = [];
    C.riposteSlow = 1;
    if (!keepMeter || !C.meter) {
      C.meter = { clock: 0, t: 0, rows: [] };
      C.meterRow("player", G.CHAR ? G.CHAR.heroName : "You");
    }
  };
  // Damage meter (HUD, above the trinket): one row per damage dealer, you first (companions will add
  // rows of their own). Each row counts all the damage it deals, the training dummy included, by damage
  // type, sampled 4 times a second; its DPS is the damage over the last DPS_WINDOW seconds.
  const DPS_WINDOW = 5;
  C.DPS_WINDOW = DPS_WINDOW;
  C.meterRow = function (id, name) {
    let r = C.meter.rows.find((x) => x.id === id);
    if (!r) {
      r = {
        id,
        name: name || id,
        total: 0,
        byType: {},
        samples: [],
        peak: 0,
        peakAt: 0,
      };
      for (const k in G.DMG_TYPES) r.byType[k] = 0;
      C.meter.rows.push(r);
    }
    return r;
  };
  const snap = (r, clock) => {
    const v = [clock, r.total];
    for (const k in G.DMG_TYPES) v.push(r.byType[k]);
    return v;
  };
  function meterTick(dt) {
    const m = C.meter;
    m.clock += dt;
    if ((m.t -= dt) > 0) return;
    m.t = 0.25;
    for (const r of m.rows) {
      r.samples.push(snap(r, m.clock));
      while (r.samples.length > 2 && r.samples[0][0] < m.clock - DPS_WINDOW)
        r.samples.shift();
      const d = C.dps(r.id);
      if (d > r.peak) {
        r.peak = d;
        r.peakAt = G.time;
        r.peakClock = m.clock;
      }
    }
  }
  // The damage a row dealt over the last few seconds: { dmg, span (seconds, at least 1), byType }.
  C.dpsWindow = function (id = "player") {
    const r = C.meter.rows.find((x) => x.id === id),
      s = r ? r.samples : [],
      out = { dmg: 0, span: 1, byType: {} };
    for (const k in G.DMG_TYPES) out.byType[k] = 0;
    if (s.length < 2) return out;
    const a = s[0],
      b = s[s.length - 1];
    out.dmg = b[1] - a[1];
    out.span = Math.max(1, b[0] - a[0]);
    Object.keys(G.DMG_TYPES).forEach((k, i) => {
      out.byType[k] = b[2 + i] - a[2 + i];
    });
    return out;
  };
  // Damage per second over the last few seconds; mix: per damage type instead ({ physical: dps, ... }).
  C.dps = function (id = "player", mix) {
    const w = C.dpsWindow(id);
    if (!mix) return w.dmg / w.span;
    const out = {};
    for (const k in w.byType) out[k] = w.byType[k] / w.span;
    return out;
  };
  C.reset();

  C.nearestN = function (x, z, n, maxR) {
    const arr = [];
    for (const e of ES.list) {
      if (e.dead) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < maxR * maxR) arr.push([d, e]);
    }
    arr.sort((a, b) => a[0] - b[0]);
    return arr.slice(0, n).map((a) => a[1]);
  };

  // extra: Flurry's second strike (does not count toward the next one). Returns true when this attack
  // should strike again.
  // extra: a follow-up strike (Flurry, the revolver's burst) that does not count as an attack of its own.
  // Returns the delays of any follow-up strikes this attack earns.
  C.attack = function (extra) {
    const s = G.stats,
      Wd = s.weapon,
      pr = Wd.proj,
      again = !extra && G.tfx.onAttack(),
      follow = again ? [0.09] : [];
    if (!extra) G.rules.fire("attack");
    C.curHoly = false;
    C.curGreat = false;
    // Killer Instinct: this attack always crits. Ball of Yarn: it always ricochets, with extra bounces.
    C.curCrit = !extra && G.tfx.critNow;
    C.curRico = !extra && G.tfx.ricoNow ? s.fx.fifthRicochet.bounces : 0;
    // Riposte: a block charged this attack: more damage and area for it, then a slower recovery
    const RP = !extra && G.tfx.takeRiposte();
    C.riposteSlow = 1;
    if (RP) {
      C.riposteSlow = 1 / Math.max(0.1, 1 - RP.slow);
      const d0 = s.dmg,
        a0 = s.area;
      s.dmg *= RP.mult;
      s.area += RP.area;
      F.num(P.x, 3.2, P.z, "RIPOSTE!", "#ffd27a", 18);
      F.ring(P.x, P.z, {
        r0: 0.4,
        r1: 2.6 * (1 + s.area * 0.3),
        life: 0.35,
        color: 0xffd27a,
      });
      F.shake(0.18);
      A.play("warcry");
      try {
        return strike(extra, s, Wd, pr, follow);
      } finally {
        s.dmg = d0;
        s.area = a0;
      }
    }
    return strike(extra, s, Wd, pr, follow);
  };
  function strike(extra, s, Wd, pr, follow) {
    if (!extra) {
      C.atkLog.push(C.clock);
      // shotgun implicit: after every 5th attack the next one sets monsters on holy fire
      C.curHoly = C.holyNext;
      C.holyNext = false;
      const HE = s.wfx.holyEvery;
      if (HE && ++C.holyN >= HE.every) {
        C.holyN = 0;
        C.holyNext = true;
      }
      if (C.curHoly) {
        F.ring(P.x, P.z, { r0: 0.3, r1: 2.2, life: 0.35, color: 0xffe080 });
        A.play("holyBurn");
      }
      // revolver implicit: every 6th attack fires three times in a row
      const BF = s.wfx.burstFire;
      if (BF && ++C.burstN >= BF.every) {
        C.burstN = 0;
        for (let i = 1; i < BF.shots; i++) follow.push(BF.gap * i);
      }
      // tome implicit: every 5th cast hurls a Greater Pyroblast
      const GF = s.wfx.pyroblast;
      if (GF && ++C.greatN >= GF.every) {
        C.greatN = 0;
        C.curGreat = true;
        F.num(P.x, 3.2, P.z, "GREATER PYROBLAST!", "#ff9a3a", 16);
      }
    }
    const tgt = ES.nearest(P.x, P.z, Wd.aimRange);
    const aim = tgt ? Math.atan2(tgt.x - P.x, tgt.z - P.z) : P.yaw;
    if (Wd.melee) {
      // the axe under Bloodlust: a whirl all around you, wider, and its bleeds hit harder
      const WH = C.whirl(),
        range = Wd.melee.range * (1 + s.area) * (WH ? 1 + WH.area : 1),
        arc = WH ? 360 : Wd.melee.arc,
        half = ((arc / 2) * Math.PI) / 180;
      G.playerSys.attackAnim(aim, Math.min(0.26, s.interval * 0.7));
      if (WH) {
        G.playerSys.spin(Math.min(0.45, Math.max(0.22, s.interval * 0.8)));
        F.ring(P.x, P.z, { r0: 0.4, r1: range, life: 0.3, color: 0xff4a2a });
      }
      F.swing(P.x, P.z, aim, arc, range, WH ? 0xff6a4a : Wd.melee.color);
      A.play(Wd.sound || "swing", Wd.melee.pitch);
      let first = null,
        hits = 0;
      ES.query(P.x, P.z, range + 3, (e) => {
        if (e.dead || e.y > 3.4) return;
        const dx = e.x - P.x,
          dz = e.z - P.z,
          d = Math.hypot(dx, dz);
        if (d > range + e.r) return;
        if (
          arc < 360 &&
          d > e.r + 0.4 &&
          Math.abs(U.wrapAng(Math.atan2(dx, dz) - aim)) > half
        )
          return;
        C.hit(e, s.dmg, {
          kb: s.wfx.holyReaper ? s.wfx.holyReaper.push : 2.2,
          dx: dx / (d || 1),
          dz: dz / (d || 1),
          holy: C.curHoly,
          crit: C.curCrit,
          bleedMore: WH ? 1 + WH.bleedMore : 1,
        }); // the scythe's slash hurls them back
        hits++;
        if (!first) first = e;
      });
      if (hits) A.play("hit");
      sweepRico(first, s, pr);
    } else if (pr.kind === "nova") {
      // the Shrieking Scream: you burst; every extra projectile echoes it a moment later at half strength
      G.playerSys.attackAnim(aim, 0.3);
      const first = C.nova(s.dmg * pr.dmgMul, {
        holy: C.curHoly,
        crit: C.curCrit,
      });
      for (let i = 1; i < s.projCount; i++)
        C.novaQ.push({ t: 0.24 * i, dmg: s.dmg * pr.dmgMul * 0.5 });
      sweepRico(first, s, pr);
      return follow;
    } else if (pr.kind === "flask") {
      G.playerSys.attackAnim(aim, 0.25);
      A.play(Wd.sound || "throw");
    } else {
      G.playerSys.attackAnim(aim, 0.12);
      const tip = G.playerSys.weaponTip(Wd.muzzle);
      F.sphere(tip.x, tip.y, tip.z, {
        r0: 0.15,
        r1: 0.45,
        life: 0.08,
        color: 0xffd070,
      });
      F.burst(tip.x, tip.y, tip.z, {
        n: 4,
        color: [0xffe090, 0xffa040],
        glow: true,
        speed: 3,
        life: 0.15,
        size: 0.15,
        grav: 0,
      });
      A.play(Wd.sound || "shot");
      if (Wd.shake) F.shake(Wd.shake);
    }
    if (s.projCount > 0) C.fire(aim); // the axe throws nothing
    C.curGreat = false; // a fireball's bounces carry their own
    return follow;
  }
  // The axe's implicit while its buff (Bloodlust) is on you: its numbers, else null.
  C.whirl = function () {
    const WH = G.stats.wfx.bloodlustWhirl;
    return WH && P.buffs && P.buffs[WH.buff] ? WH : null;
  };
  // A sweep's ricochet (melee swings, the scream): a spectral blade leaps from the first monster hit to
  // the next, or Chain Lightning's rays do.
  function sweepRico(first, s, pr) {
    if (
      !first ||
      !(C.curRico || (s.ricochetChance > 0 && Math.random() < s.ricochetChance))
    )
      return;
    if (s.fx.chainLightning)
      C.lightning(first, s.dmg * pr.dmgMul, s.chains + C.curRico, [first.id]);
    else {
      const next = ES.nearest(first.x, first.z, 11, [first.id]);
      if (next) C.ricochetBlade(first, next, s.dmg * pr.dmgMul, C.curRico);
    }
  }
  // The Shrieking Scream: you burst with a scream. Everything within its range is hit and hurled away,
  // harder the closer it stood (its implicit slows everything it hits). o: { holy, crit, echo }
  C.nova = function (dmg, o = {}) {
    const s = G.stats,
      pr = s.weapon.proj,
      R = pr.range * (1 + s.area),
      x = P.x,
      z = P.z,
      echo = !!o.echo;
    F.sphere(x, 1, z, {
      r0: 0.4,
      r1: R * (echo ? 0.55 : 0.8),
      life: 0.25,
      color: 0xc8a0ff,
      opacity: echo ? 0.35 : 0.6,
    });
    F.ring(x, z, { r0: 0.5, r1: R, life: 0.35, color: 0xe8d8ff });
    F.ring(x, z, { r0: 0.3, r1: R * 0.7, life: 0.5, color: 0xb86cff, y: 0.6 });
    if (!echo) {
      F.ring(x, z, {
        r0: 0.3,
        r1: R * 1.15,
        life: 0.55,
        color: 0x8a4ac8,
        y: 1.2,
      });
      F.burst(x, 1, z, {
        n: 22,
        color: [0xe8d8ff, 0xb86cff, 0xffffff],
        glow: true,
        speed: R * 2.6,
        life: 0.4,
        size: 0.16,
        up: 0.1,
        grav: 0,
        drag: 2,
      });
    }
    F.shake(echo ? 0.08 : 0.18);
    A.play("shriek", echo ? 0.75 : 1);
    let first = null,
      hits = 0;
    ES.query(x, z, R + 3, (e) => {
      if (e.dead || e.y > 3.4) return;
      const dx = e.x - x,
        dz = e.z - z,
        d = Math.hypot(dx, dz);
      if (d > R + e.r) return;
      C.hit(e, dmg, {
        kb: pr.knock * (1.25 - 0.6 * Math.min(1, d / R)),
        dx: dx / (d || 1),
        dz: dz / (d || 1),
        holy: o.holy,
        crit: o.crit,
      });
      hits++;
      if (!first) first = e;
    });
    if (hits) A.play("hit");
    return first;
  };

  C.fire = function (aim) {
    const s = G.stats,
      pr = s.weapon.proj,
      n = s.projCount,
      dmg = s.dmg * pr.dmgMul;
    if (pr.kind === "pellet") {
      const spread = pr.spread * (1 + Math.min(1, (n - pr.count) * 0.05));
      for (let i = 0; i < n; i++)
        C.spawnProj(
          "pellet",
          P.x,
          P.z,
          aim + (n > 1 ? i / (n - 1) - 0.5 : 0) * spread + U.rnd(-0.04, 0.04),
          dmg,
          pr,
        );
      return;
    }
    if (pr.kind === "flame") {
      for (let i = 0; i < n; i++)
        C.spawnProj(
          "flame",
          P.x,
          P.z,
          aim + U.rnd(-0.5, 0.5) * pr.spread,
          dmg,
          pr,
        );
      return;
    }
    // a ring of projectiles all around you (fan of knives)
    if (pr.ring) {
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++)
        C.spawnProj(pr.kind, P.x, P.z, off + (i / n) * Math.PI * 2, dmg, pr);
      A.play("throw");
      return;
    }
    const tg = C.nearestN(
      P.x,
      P.z,
      n,
      pr.kind === "bullet" || pr.kind === "dart" ? 24 : pr.range + 2,
    );
    for (let i = 0; i < n; i++) {
      const t = tg[i],
        a =
          (t
            ? Math.atan2(t.x - P.x, t.z - P.z)
            : aim + (i - (n - 1) / 2) * 0.35) +
          (pr.jitter ? U.rnd(-pr.jitter, pr.jitter) : 0);
      if (pr.kind === "flask")
        C.spawnFlask(
          P.x,
          P.z,
          t ? t.x : P.x + Math.sin(a) * 6,
          t ? t.z : P.z + Math.cos(a) * 6,
          dmg,
          C.curRico ? s.chains + C.curRico : null,
          pr,
        );
      else C.spawnProj(pr.kind, P.x, P.z, a, dmg, pr);
    }
    if (pr.kind === "scythe") A.play("throw");
  };

  // Returns the projectile. A fireball cast as the tome's Greater Pyroblast has its damage and blast raised.
  C.spawnProj = function (kind, x, z, ang, dmg, pr) {
    const s = G.stats,
      sp = pr.speed * U.rnd(0.96, 1.04),
      sx = Math.sin(ang),
      sz = Math.cos(ang),
      GF = kind === "fireball" && C.curGreat && s.wfx.pyroblast;
    const p = {
      kind,
      x: x + sx * 0.6,
      z: z + sz * 0.6,
      y:
        kind === "scythe"
          ? 1.0
          : kind === "wave"
            ? 0.75
            : kind === "flame"
              ? 0.95
              : 1.15,
      vx: sx * sp,
      vz: sz * sp,
      speed: sp,
      dist: 0,
      range: pr.range * (kind === "wave" ? 1 + s.area * 0.5 : 1),
      dmg: dmg * (GF ? GF.mult : 1),
      pierce: pr.pierce,
      hit: [],
      rot: Math.random() * 6,
      rico: C.curRico
        ? s.chains +
          C.curRico +
          (s.wfx.projChains ? s.wfx.projChains.chains : 0)
        : null,
      crit: C.curCrit,
      knock: pr.knock || 1,
      size:
        kind === "wave"
          ? 1 + s.area
          : kind === "scythe"
            ? 1 + s.area * 0.4
            : kind === "fireball"
              ? (GF ? GF.size : 1) * (1 + s.area * 0.3)
              : 1,
      target: null,
      holy: C.curHoly,
      splash: (pr.splash || 2.4) * (GF ? GF.size : 1),
      great: !!GF,
      stun: GF ? GF.stun : 0,
    };
    C.projs.push(p);
    return p;
  };
  // The buff bar chip for the weapon's implicit, with its counter or cooldown.
  const IMPLICIT_ICON = {
    bleedExplode: "blood",
    holyEvery: "holycross",
    burstFire: "crosshair",
    poisonDeathSpread: "poison",
    dashBuff: "bolt",
    bleedKillBuff: "bloodlust",
    projChains: "chain",
    pyroblast: "flame",
    holyReaper: "holycross",
    bloodlustWhirl: "bloodlust",
  };
  C.implicitChips = function () {
    const s = G.stats,
      I = s.weapon.implicit;
    if (!I || !I.text) return [];
    const E = I.effect,
      id = E && E.id,
      c = {
        id: "w_implicit",
        name: `${s.weapon.name} implicit`,
        kind: "Weapon implicit",
        color: "#ffd27a",
        text: "",
        fill: 0,
        active: false,
        lines: [I.text],
        icon:
          IMPLICIT_ICON[id] ||
          (I.stats.trinketCharges
            ? "pocketwatch"
            : I.stats.ricochetChance
              ? "zigzag"
              : I.stats.bleedChance
                ? "blood"
                : I.stats.slowChance
                  ? "snail"
                  : "sword"),
      };
    if (id === "holyEvery") {
      c.active = C.holyNext;
      c.text = C.holyNext ? "!" : `${C.holyN}/${E.every}`;
    } else if (id === "burstFire") {
      c.text = `${C.burstN}/${E.every}`;
      c.active = C.burstN === E.every - 1;
    } else if (id === "pyroblast") {
      c.text = `${C.greatN}/${E.every}`;
      c.active = C.greatN === E.every - 1;
    } else if (id === "bloodlustWhirl") {
      c.active = !!C.whirl();
      if (c.active) c.lines.push("Whirling · Bloodlust is on you");
    } else if (id === "bleedKillBuff" && C.icd.bleedKill > 0) {
      c.fill = C.icd.bleedKill / E.cooldown;
      c.text = C.icd.bleedKill.toFixed(1);
      c.lines.push(`Recharging · ${C.icd.bleedKill.toFixed(1)}s`);
    } else c.active = id === "bleedKillBuff";
    return [c];
  };
  // A lightning bolt that always chains: from monster to monster n times, each jump dealing elemental
  // damage and shocking. from: anything with x and z (its own monster is not hit again).
  C.bolt = function (from, dmg, n) {
    const ex = from.id ? [from.id] : [];
    let a = from;
    for (let i = 0; i < n; i++) {
      const next = ES.nearest(a.x, a.z, 9, ex);
      if (!next) break;
      ex.push(next.id);
      F.laser(a.x, 1.1 + (a.y || 0), a.z, next.x, 1.1 + next.y, next.z, 0.35);
      C.elementalHit(next, dmg * C.mult("lightning"), "lightning", {
        alwaysShock: true,
      });
      a = next;
    }
    if (a !== from) A.play("zap");
  };
  // Weapon implicits that go off when a monster dies.
  function weaponOnKill(e, s) {
    const W = s.wfx;
    // dagger: bleeding monsters explode (the blast cannot cause bleeding)
    if (W.bleedExplode && e.bleed.length)
      C.explQ.push({
        x: e.x,
        z: e.z,
        dmg: e.maxHp * W.bleedExplode.share,
        r: W.bleedExplode.radius + e.r,
        delay: 0.04,
        color: 0xc01a10,
        blood: true,
      });
    // poison flask: monsters killed by your poison spread their poisons
    if (W.poisonDeathSpread && e.killedBy === "poison" && e.poison.length)
      C.spreadPoison(e, W.poisonDeathSpread.radius);
    // obsidian blade: killing a bleeding monster grants Bloodlust for a moment
    const BK = W.bleedKillBuff;
    if (BK && e.bleed.length && !(C.icd.bleedKill > 0)) {
      C.icd.bleedKill = BK.cooldown;
      G.playerSys.addBuff(BK.buff, BK.duration);
      A.play("warcry");
    }
  }
  // Copies all of e's poisons onto every monster within r (each poison at most once per monster).
  C.spreadPoison = function (e, r) {
    F.burst(e.x, 0.9 + e.y, e.z, {
      n: 14,
      color: [0x5ad83a, 0x8aef4a, 0x3a8a2a],
      speed: 2.5,
      life: 1,
      size: 0.3,
      drag: 3,
      grav: -0.5,
    });
    let n = 0;
    ES.query(e.x, e.z, r + 3, (o) => {
      if (
        o === e ||
        o.dead ||
        o.dotImmune ||
        Math.hypot(o.x - e.x, o.z - e.z) > r + e.r + o.r
      )
        return;
      const have = new Set(o.poison.map((p) => p.id));
      for (const p of e.poison)
        if (!have.has(p.id)) {
          o.poison.push({ dps: p.dps, t: p.t, id: p.id });
          n++;
        }
      F.streak(e.x, 0.9 + e.y, e.z, o.x, 0.9 + o.y, o.z, 0x8aef4a, 0.25, 0.1);
    });
    return n;
  };
  // A spectral scythe launched from one enemy to the next (melee ricochet).
  // bonus: extra bounces (Ball of Yarn)
  C.ricochetBlade = function (from, to, dmg, bonus = 0) {
    const s = G.stats,
      dx = to.x - from.x,
      dz = to.z - from.z,
      l = Math.hypot(dx, dz) || 1,
      sp = 18;
    C.projs.push({
      kind: "scythe",
      x: from.x,
      z: from.z,
      y: 1.0,
      vx: (dx / l) * sp,
      vz: (dz / l) * sp,
      speed: sp,
      dist: 0,
      range: l + 2,
      dmg,
      pierce: 1,
      hit: [from.id],
      rico: Math.max(0, s.chains - 1) + bonus,
      rot: 0,
      knock: 1,
      size: 1 + s.area * 0.4,
      target: to,
    });
    F.streak(from.x, 1.1, from.z, to.x, 1.1, to.z, 0x9fe8ff, 0.3, 0.1);
    A.play("ricochet");
    G.run.ricochets++;
  };
  C.spawnFlask = function (x, z, tx, tz, dmg, rico, pr) {
    const d = Math.hypot(tx - x, tz - z);
    C.projs.push({
      kind: "flask",
      sx: x,
      sz: z,
      x,
      z,
      y: 1.2,
      tx,
      tz,
      t: 0,
      dur: U.clamp(d / 12, 0.3, 0.9),
      dmg,
      rico,
      pr,
      rot: 0,
      hit: [],
      crit: C.curCrit,
    });
  };
  // Chain Lightning (talent): a ricochet becomes rays that jump instantly from monster to monster (n
  // jumps), each hit adding bonus elemental damage. from: anything with x and z.
  C.lightning = function (from, dmg, n, exclude) {
    const L = G.stats.fx.chainLightning,
      ex = exclude.slice();
    let a = from;
    for (let i = 0; i < n; i++) {
      const next = ES.nearest(a.x, a.z, 11, ex);
      if (!next) break;
      ex.push(next.id);
      F.laser(a.x, 1.1 + (a.y || 0), a.z, next.x, 1.1 + next.y, next.z, L.beam);
      C.hit(next, dmg, { elemental: L.elemental });
      G.run.ricochets++;
      a = next;
    }
    if (a !== from) A.play("zap");
  };

  function onProjHit(p, e) {
    p.hit.push(e.id);
    if (p.kind === "fireball") {
      fireburst(p, e);
      return;
    }
    // weapons that always poison (the poison dart blower) poison with every projectile
    C.hit(e, p.dmg, {
      kb: 1.2 * p.knock,
      dx: p.vx / p.speed,
      dz: p.vz / p.speed,
      poison: G.stats.weaponPoison,
      holy: p.holy,
      crit: p.crit,
      rule: p.rule,
    });
    if (
      p.kind === "bullet" ||
      p.kind === "pellet" ||
      p.kind === "dart" ||
      p.kind === "knife"
    )
      F.burst(e.x, 1 + e.y, e.z, {
        n: 3,
        color: [0xfff0a0, 0xffc060],
        glow: true,
        speed: 4,
        life: 0.2,
        size: 0.12,
        grav: 0,
      });
    // ricochet bounces, plus the fan of knives' projectile chains (implicit)
    if (p.rico === null)
      p.rico =
        (Math.random() < G.stats.ricochetChance ? G.stats.chains : 0) +
        (G.stats.wfx.projChains ? G.stats.wfx.projChains.chains : 0);
    if (p.rico > 0 && G.stats.fx.chainLightning) {
      C.lightning(e, p.dmg, p.rico, p.hit);
      p.rico = 0;
    } else if (p.rico > 0) {
      const next = ES.nearest(e.x, e.z, 11, p.hit);
      if (next) {
        p.rico--;
        const dx = next.x - e.x,
          dz = next.z - e.z,
          l = Math.hypot(dx, dz) || 1;
        p.x = e.x;
        p.z = e.z;
        p.vx = (dx / l) * p.speed;
        p.vz = (dz / l) * p.speed;
        p.dist = 0;
        p.range = l + 3;
        p.target = next;
        F.streak(e.x, 1.1, e.z, next.x, 1.1, next.z, 0x9fe8ff, 0.3, 0.1);
        F.burst(e.x, 1.1, e.z, {
          n: 5,
          color: [0x9fe8ff, 0xffffff],
          glow: true,
          speed: 5,
          life: 0.25,
          size: 0.14,
          grav: 0,
        });
        A.play("ricochet");
        G.run.ricochets++;
        return;
      }
    }
    if (--p.pierce <= 0) p.dead = true;
  }

  // A fireball bursts (on the first monster it touches, at a wall, or at the end of its flight): every
  // monster in the blast takes the hit, and a Greater Pyroblast stuns them. While it has bounces left
  // (ricochets, and the tome's bounces from extra projectiles) a new fireball leaps from the blast to the
  // next monster, keeping what it was (a Greater Pyroblast bounces as one).
  function fireburst(p, at) {
    if (p.dead) return;
    p.dead = true;
    const s = G.stats,
      x = at ? at.x : p.x,
      z = at ? at.z : p.z,
      R = p.splash * (1 + s.area);
    F.explosion(x, z, R, p.great ? 0xff4a10 : 0xff7a1a);
    F.burst(x, 0.8, z, {
      n: p.great ? 30 : 16,
      color: [0xffd060, 0xff7a1a, 0xff4a10, 0xfff0b0],
      glow: true,
      speed: R * 3.2,
      life: 0.55,
      size: 0.22,
      up: 0.9,
      grav: -1,
      drag: 3,
    });
    if (p.great) {
      F.shake(0.35);
      F.flash("#ff8a2a", 0.15);
    }
    A.play("fireburst");
    const struck = [];
    ES.query(x, z, R + 3, (e) => {
      if (e.dead || e.y > 3.5 || Math.hypot(e.x - x, e.z - z) > R + e.r) return;
      const dx = e.x - x,
        dz = e.z - z,
        d = Math.hypot(dx, dz) || 1;
      C.hit(e, p.dmg, {
        kb: 1.2 * p.knock,
        dx: dx / d,
        dz: dz / d,
        holy: p.holy,
        crit: p.crit,
        rule: p.rule,
      });
      struck.push(e.id);
      if (p.stun && !e.dead) C.inflict(e, "stun", p.stun);
    });
    let rico = p.rico;
    if (rico === null) rico = Math.random() < s.ricochetChance ? s.chains : 0;
    if (!p.chained) rico += s.projBounces || 0;
    if (rico > 0 && s.fx.chainLightning)
      C.lightning({ x, z }, p.dmg, rico, struck);
    else if (rico > 0) {
      const next = ES.nearest(x, z, R + 11, struck); // past the blast's edge: what it hit is already burning
      if (next) {
        const q = C.spawnProj(
          "fireball",
          x,
          z,
          Math.atan2(next.x - x, next.z - z),
          p.dmg,
          {
            speed: p.speed,
            range: Math.hypot(next.x - x, next.z - z) + 3,
            pierce: 1,
            knock: p.knock,
            splash: p.splash,
          },
        );
        Object.assign(q, {
          dmg: p.dmg,
          rico: rico - 1,
          hit: struck,
          target: next,
          crit: p.crit,
          holy: p.holy,
          great: p.great,
          size: p.size,
          splash: p.splash,
          stun: p.stun,
          chained: true,
          rule: p.rule,
        });
        F.streak(x, 1.1, z, next.x, 1.1, next.z, 0xffa040, 0.3, 0.12);
        A.play("ricochet");
        G.run.ricochets++;
      }
    }
  }

  function flaskLand(p) {
    const s = G.stats,
      pr = p.pr,
      R = pr.splash * (1 + s.area);
    A.play("shatter");
    F.burst(p.tx, 0.4, p.tz, {
      n: 10,
      color: [0x8af050, 0xd8f0d8, 0x5adf2a],
      glow: true,
      speed: 5,
      life: 0.5,
      size: 0.16,
    });
    F.ring(p.tx, p.tz, { r0: 0.3, r1: R, life: 0.3, color: 0x7aef4a });
    if (!s.noPoison) {
      F.disc(p.tx, p.tz, R * 0.85, pr.puddle, 0x3fbf1a, 0.5);
      C.puddles.push({
        x: p.tx,
        z: p.tz,
        r: R * 0.85,
        t: pr.puddle,
        tick: 0,
        dmg: p.dmg * 0.4,
      });
    }
    const struck = [];
    ES.query(p.tx, p.tz, R + 3, (e) => {
      if (e.dead || Math.hypot(e.x - p.tx, e.z - p.tz) > R + e.r) return;
      C.hit(e, p.dmg, {
        poison: s.weaponPoison,
        kb: 0.5,
        dx: 0,
        dz: 0,
        crit: p.crit,
        rule: p.rule,
      });
      struck.push(e.id);
    });
    let rico = p.rico;
    if (rico === null) rico = Math.random() < s.ricochetChance ? s.chains : 0;
    if (rico > 0 && s.fx.chainLightning)
      C.lightning({ x: p.tx, z: p.tz }, p.dmg, rico, struck);
    else if (rico > 0) {
      const next = ES.nearest(p.tx, p.tz, 11, struck);
      if (next) {
        C.spawnFlask(p.tx, p.tz, next.x, next.z, p.dmg, rico - 1, pr);
        F.streak(p.tx, 0.8, p.tz, next.x, 0.8, next.z, 0x9fff7a, 0.3, 0.1);
        A.play("ricochet");
        G.run.ricochets++;
      }
    }
  }

  // ----- the damage pipeline -----
  // Tags and scaling (data.js G.DMG_SOURCES / G.DMG_SCALING): a source's tags are its type, its own tags
  // and, for weapon hits, the weapon's class. C.mult is how much your stats raise it.
  C.tagsOf = function (key, s = G.stats) {
    const S = G.DMG_SOURCES[key],
      t = (S.type ? [S.type] : []).concat(S.tags);
    if (S.tags.includes("weapon") && s && s.weapon) t.push(s.weapon.class);
    return t;
  };
  // The stats that raise a source, in G.DMG_SCALING order (sources taken from a hit skip the hit's own).
  C.scalers = function (key, s = G.stats) {
    const S = G.DMG_SOURCES[key],
      tags = C.tagsOf(key, s);
    if (S.noScale) return [];
    return G.DMG_SCALING.filter(
      (x) =>
        !(S.inherit && G.DMG_INHERITED.includes(x.tag)) &&
        (x.tag === "any" || tags.includes(x.tag)),
    );
  };
  C.mult = function (key, s = G.stats) {
    let m = 1;
    for (const x of C.scalers(key, s)) m *= 1 + (s[x.stat] || 0);
    return m;
  };
  // Health-based damage (poison) on the training dummy counts it as a tough monster of this map.
  C.refHp = (e) => (e.dummy ? G.DOTS.poison.dummyHp * G.diffHp() : e.maxHp);
  // Shock: only elemental hits shock. Its effect (more damage taken from everything) depends on the hit:
  // maxEffect x sqrt(hit / (fullAt x max health)), between minEffect and maxEffect.
  C.shockEffect = function (e, dmg) {
    const S = G.STATUS.shock;
    return U.clamp(
      S.maxEffect * Math.sqrt(Math.max(0, dmg) / (S.fullAt * C.refHp(e))),
      S.minEffect,
      S.maxEffect,
    );
  };
  C.shock = function (e, effect, dur) {
    if (e.dead) return;
    e.shockFx = e.st.shock > 0 ? Math.max(e.shockFx || 0, effect) : effect;
    C.inflict(e, "shock", dur);
  };
  // An elemental hit from a source (already scaled): it shocks with your shock chance, or always
  // (o.alwaysShock, sized by the hit), or with a fixed strength (o.shock, for o.shockFor seconds).
  C.elementalHit = function (e, dmg, key, o = {}) {
    if (e.dead || dmg <= 0) return;
    C.damage(e, dmg, o.kind || G.DMG_SOURCES[key].kind, "elemental", key);
    if (e.dead) return;
    // talent option (elementalPoison): elemental hits (not damage over time) can poison, with your poison chance
    if (G.stats.fx.elementalPoison && G.DMG_SOURCES[key].tags.includes("hit"))
      rollPoison(e, dmg, false);
    if (o.shock) C.shock(e, o.shock, o.shockFor);
    else if (
      o.alwaysShock ||
      (G.stats.shockChance > 0 && Math.random() < G.stats.shockChance)
    )
      C.shock(e, C.shockEffect(e, dmg));
  };
  // Poison chance on a hit: Toxic Touch (multiPoison) lets chance above 100% apply several (150% = one, plus a
  // 50% chance of a second). always: at least one.
  function rollPoison(e, dmg, always) {
    const s = G.stats,
      pc = s.fx.multiPoison ? s.poisonChance : Math.min(1, s.poisonChance);
    let np = pc > 0 ? Math.floor(pc) + (Math.random() < pc % 1 ? 1 : 0) : 0;
    if (always) np = Math.max(1, np);
    for (let i = 0; i < np; i++) C.poison(e, dmg);
  }
  // A weapon hit. o: { poison: always poisons, elemental: bonus elemental damage as a share of the hit, kb, dx, dz,
  // bleedMore: the bleed it causes deals this many times the damage (the axe's whirl) }
  C.hit = function (e, base, o = {}) {
    if (e.dead) return 0;
    const s = G.stats,
      EP = s.fx.experiencedPrecision;
    let dmg = base * U.rnd(s.dmgRoll[0], s.dmgRoll[1]);
    const emp = G.tfx.takeEmpower(); // Crushing Blow: the hit after every 5th attack
    if (emp) dmg *= emp;
    // flat elemental damage from the weapon, in proportion to this hit's share of a full weapon hit
    let flat =
      s.flatElem > 0 ? s.flatElem * C.mult("flatElem") * (base / s.dmg) : 0;
    if (e.boss && s.bossDmg) {
      dmg *= 1 + s.bossDmg;
      flat *= 1 + s.bossDmg;
    }
    // increased gun / melee damage per attack made in the last few seconds
    const per =
      s.weapon.class === "firearm"
        ? s.gunDmgPerAttack
        : s.weapon.class === "melee"
          ? s.meleeDmgPerAttack
          : 0;
    if (per > 0) dmg *= 1 + per * C.recentAttacks();
    if (e.boss && s.fx.baneOfLegends) {
      const k = 1 + s.fx.baneOfLegends.more;
      dmg *= k;
      flat *= k;
    } // Bane of Legends: more damage
    // Experienced Precision: crit chance past 100% is the chance to doublecrit. Unending Zealotry adds increased crit.
    // Open Wounds: bleeding monsters are always crit
    const cc = s.crit + s.baseCrit * G.tfx.critBonus(),
      crit =
        !!o.crit ||
        Math.random() < cc ||
        (!!s.fx.bleedCrit && e.bleed.length > 0),
      dbl = crit && !!EP && Math.random() < cc - 1;
    if (crit) {
      const k = s.critMult * (dbl ? EP.doublecritMult : 1);
      dmg *= k;
      flat *= k;
      G.run.crits++;
      if (dbl) G.run.doublecrits++;
      F.critHit(e.x, 1 + e.y, e.z);
      A.play("crit");
      F.shake(dbl ? 0.08 : 0.04);
    }
    const hm = G.rules.hitMult(e, crit); // talent rules: hit bonuses, empowered hits
    if (hm !== 1) {
      dmg *= hm;
      flat *= hm;
    }
    // weapon hits are physical (an elemental weapon's are elemental: they shock instead of poisoning or bleeding)
    const elem = s.weapon.dmgType === "elemental";
    if (elem)
      C.elementalHit(e, dmg, "weapon", {
        kind: dbl ? "dcrit" : crit ? "crit" : "elemental",
      });
    else
      C.damage(
        e,
        dmg,
        dbl ? "dcrit" : crit ? "crit" : "hit",
        "physical",
        "weapon",
      );
    // a separate elemental hit: flat added elemental damage, plus bonus elemental damage taken from this hit
    // (Chain Lightning, the Scarecrow Effigy's embers, alien affixes against shocked, slowed and rooted monsters)
    const bonus =
      (o.elemental || 0) +
      G.trinkets.embers() +
      (e.st.shock ? s.shockedElem : 0) +
      (e.st.slow ? s.slowedElem : 0) +
      (e.st.root ? s.rootedElem : 0);
    const bon = bonus > 0 ? dmg * bonus * C.mult("elemBonus") : 0;
    if (bon + flat > 0)
      C.elementalHit(e, bon + flat, flat > bon ? "flatElem" : "elemBonus");
    if (!elem) {
      // poison: any physical hit (an elemental weapon's hits poison through C.elementalHit with the talent option)
      rollPoison(e, dmg, !!o.poison);
      // bleeding: physical hits only. Savage Hits: only crits bleed, multiplied by the crit multiplier
      const SV = s.fx.savageHits,
        canBleed = SV ? crit && !EP : !(crit && EP);
      if (s.bleedChance > 0 && canBleed && Math.random() < s.bleedChance)
        C.bleed(e, SV ? dmg * s.critMult : dmg, o.bleedMore);
    }
    // slow, stun and root from weapon hits (shock only comes from elemental hits)
    for (const id of G.STATUS_IDS) {
      if (id === "shock") continue;
      const ch = s[G.STATUS_STAT[id]];
      if (ch > 0 && Math.random() < ch) C.inflict(e, id);
    }
    if (emp && !e.dead) {
      C.inflict(e, "stun");
      F.num(e.x, 2.4 * e.scale + e.y, e.z, "CRUSHED!", "#ffb070", 16);
      F.shake(0.12);
    }
    G.trinkets.onHit(e, dmg); // The Moment: holy fire
    // Storm Caller: now and then a lightning bolt leaps from this monster to the next, and the next...
    const LP = s.fx.lightningProc;
    if (LP && Math.random() < LP.chance) C.bolt(e, dmg * LP.damage, LP.chains);
    if (o.holy && !e.dead)
      C.burn(e, dmg * G.DOTS.holy.damage, G.DOTS.holy.duration); // the shotgun's empowered shots (holy fire from the hit)
    G.tfx.afterHit(e, dmg); // Toxic Detonation, Pent-Up Fury
    if (o.kb && !e.boss && !e.dead) {
      const k = (o.kb * 3) / Math.sqrt(e.mass);
      e.kbx += o.dx * k;
      e.kbz += o.dz * k;
    }
    // talent rules (o.rule: a talent rule's own projectile, which never sets them off)
    if (!o.rule) {
      G.rules.fire("hit", { e, dmg, crit });
      if (crit) G.rules.fire("crit", { e, dmg, crit });
    }
    return dmg;
  };
  const NUM = {
    hit: ["#ffffff", 14],
    crit: ["#ffd23a", 21],
    dcrit: ["#ff8a2a", 26],
    poison: ["#8aef4a", 12],
    bleed: ["#ff5a4a", 12],
    elemental: ["#7fe0ff", 14],
    explode: ["#ff9a3a", 18],
    burn: ["#b8ff5a", 11],
    fire: ["#ffa040", 11],
    holy: ["#fff0a0", 14],
    curse: ["#c08aff", 13],
  };
  const HOLY_SRC = {};
  for (const k in G.DMG_SOURCES)
    if (G.DMG_SOURCES[k].tags.includes("holy")) HOLY_SRC[k] = true;
  // The default damage type (G.DMG_TYPES) of each kind of damage number. 'burn' is the alien pillar: it
  // has no type and does not count as damage you dealt.
  const TYPE = {
    hit: "physical",
    crit: "physical",
    dcrit: "physical",
    poison: "poison",
    bleed: "physical",
    elemental: "elemental",
    explode: "elemental",
    fire: "elemental",
    holy: "elemental",
  };
  // Deals already-scaled damage. kind: the number style. type: the damage type (else the kind's).
  // src: the G.DMG_SOURCES key, for the run's statistics. Here only the monster's side applies: its
  // armor (Stoneskin), shock, and damage to stunned monsters (none of it for "fixed" sources: curses).
  // by: the damage meter row it counts for (you, unless a companion dealt it).
  C.damage = function (e, dmg, kind, type, src, by = "player") {
    if (e.dead) return;
    // Shrouded (modifier): it only takes damage while you stand inside its circle
    if (e.shroud && Math.hypot(P.x - e.x, P.z - e.z) > e.shroud) {
      if (!(G.time - (e.shroudT || -9) < 0.6)) {
        e.shroudT = G.time;
        F.num(e.x, 1.8 * e.scale + e.y, e.z, "SHROUDED", "#c08aff", 12);
      }
      return;
    }
    type = type || TYPE[kind];
    if (!(src && G.DMG_SOURCES[src] && G.DMG_SOURCES[src].fixed)) {
      if (e.armor) dmg *= 1 - e.armor;
      if (e.st.shock) dmg *= 1 + (e.shockFx || G.STATUS.shock.minEffect);
      if (type && e.st.stun && G.stats.stunnedDmg)
        dmg *= 1 + G.stats.stunnedDmg;
    }
    e.hp -= dmg;
    if (type) {
      const r = C.meterRow(by);
      r.total += dmg;
      r.byType[type] = (r.byType[type] || 0) + dmg;
    }
    if (e.dummy) {
      e.hp = e.maxHp;
      G.days.dummyHit(dmg);
    } else if (type) {
      G.run.dealt += dmg;
      G.run.byType[type] = (G.run.byType[type] || 0) + dmg;
      const k = src || kind,
        bs = G.run.bySrc || (G.run.bySrc = {});
      bs[k] = (bs[k] || 0) + dmg;
    }
    if (
      kind === "hit" ||
      kind === "crit" ||
      kind === "dcrit" ||
      kind === "explode"
    ) {
      e.flash = 0.12;
      F.burst(e.x, 0.9 + e.y, e.z, {
        n: 3,
        color: e.def.debris,
        speed: 3,
        life: 0.4,
        size: 0.1,
      });
    }
    const n = NUM[kind];
    const big = kind === "crit" || kind === "dcrit";
    F.num(
      e.x,
      1.7 * e.scale + e.y,
      e.z,
      Math.max(1, Math.round(dmg)) +
        (kind === "crit" ? "!" : kind === "dcrit" ? "!!" : ""),
      n[0],
      n[1],
      big,
    );
    if (src && HOLY_SRC[src]) G.tfx.leech(dmg); // Sanctified Hide
    if (G.tfx.execute(e)) e.hp = 0; // Bane of Legends
    if (e.hp <= 0) {
      e.killedBy = kind;
      C.kill(e);
    }
  };
  // Ailment duration stats (poisonDuration, bleedDuration): a factor on how long one lasts. Its total damage
  // stays the same, so the damage per second is divided by the same factor (shorter = faster).
  const durK = (v) => Math.max(0.1, 1 + (v || 0));
  C.poisonK = () => durK(G.stats.poisonDuration);
  C.bleedK = () => durK(G.stats.bleedDuration);
  // Poison ticks (poisonTickRate): more ticks a second, each the size of a normal tick (so more damage).
  C.poisonRate = () => Math.max(0.1, 1 + (G.stats.poisonTickRate || 0));
  // Poison: every application is its own stack, lasting its own duration (unlimited stacks unless
  // status_effects.json sets maxStacks), dealing a share of the hit that caused it per second (30%: a poison
  // with no hit behind it uses your hit damage), raised by Damage bonus, Poison damage and DoT damage.
  C.poison = function (e, hitDmg = 0) {
    if (e.dotImmune || G.stats.noPoison) return;
    const s = G.stats,
      D = G.DOTS.poison,
      CF = s.fx.poisonMaxHp,
      k = C.poisonK(),
      hit = hitDmg > 0 ? hitDmg : s.dmg; // Cat Scratch Fever: plus a share of your max health
    const dps =
        ((C.refHp(e) * D.maxHp +
          hit * D.damage +
          (CF ? s.maxHp * CF.share : 0)) *
          C.mult("poison")) /
        k,
      t = D.duration * k;
    if (D.maxStacks && e.poison.length >= D.maxStacks) {
      let w = 0;
      for (let i = 1; i < e.poison.length; i++)
        if (e.poison[i].dps < e.poison[w].dps) w = i;
      if (e.poison[w].dps < dps) e.poison[w] = { dps, t, id: ++C.pid };
      else e.poison[w].t = t;
    } else e.poison.push({ dps, t, id: ++C.pid }); // ids: a spread poison is never copied twice onto one monster
    A.play("poison");
    // Venom Mirror (talent effect poisonReflect): every poison you inflict poisons you as well
    const PR2 = s.fx.poisonReflect;
    if (PR2 && !e.dummy)
      G.playerSys.addDot("poison", 0, {
        dps: s.maxHp * PR2.maxHp,
        t: PR2.duration,
      });
    G.rules.fire("poison", { e, dmg: hitDmg });
  };
  // Bleeding: 210% of the physical hit that caused it every second for 5 seconds (raised by Bleed and DoT
  // damage; the hit's own bonuses are already in it). One bleed per monster unless Bleed stacks allow more;
  // a weaker bleed never replaces a stronger one. more: a multiplier on its damage (the axe's whirl).
  C.bleed = function (e, hitDmg, more = 1) {
    if (e.dotImmune) return;
    const D = G.DOTS.bleed,
      FW = G.stats.fx.festeringBleed,
      k = C.bleedK();
    const dps = (hitDmg * D.damage * C.mult("bleed") * (more || 1)) / k,
      t = D.duration * k * (FW ? FW.duration : 1);
    const b = FW ? { dps, t, max: t, ramp: FW.ramp } : { dps, t };
    if (!C.addBleed(e, b)) return;
    G.tfx.onBleed(e, b);
    A.play("bleed");
    G.rules.fire("bleed", { e, dmg: hitDmg });
  };
  // How many bleeds a monster can carry at once (status_effects.json dots.bleed.maxStacks + Bleed stacks).
  C.bleedStacks = () =>
    Math.max(1, G.DOTS.bleed.maxStacks + Math.round(G.stats.bleedStacks || 0));
  // Puts bleed b on e: into a free stack, else over the weakest one if b is at least as strong. Returns true
  // when it took. Every way a bleed lands (hits, spreads, inheritance) goes through here.
  C.addBleed = function (e, b) {
    if (e.dotImmune) return false;
    if (e.bleed.length < C.bleedStacks()) {
      e.bleed.push(b);
      return true;
    }
    let w = 0;
    for (let i = 1; i < e.bleed.length; i++)
      if (e.bleed[i].dps < e.bleed[w].dps) w = i;
    if (e.bleed[w].dps > b.dps) return false;
    e.bleed[w] = b;
    return true;
  };
  // The strongest bleed on e (null when it isn't bleeding).
  C.topBleed = (e) =>
    e.bleed.reduce((m, b) => (!m || b.dps > m.dps ? b : m), null);
  // Festering Wounds: a bleed's damage rises every second, to ramp x in its last second.
  C.bleedRamp = function (b) {
    if (!b || !b.ramp || !b.max) return 1;
    const steps = Math.max(1, Math.ceil(b.max) - 1),
      k = Math.min(1, Math.floor(b.max - b.t) / steps);
    return 1 + (b.ramp - 1) * k;
  };
  // Slow / shock / stun / root on a monster: refreshes to the longer duration, never stacks.
  // dur: seconds instead of the status's own duration (bosses still get their share).
  C.inflict = function (e, id, dur) {
    const S = G.STATUS[id],
      d = (dur != null ? dur : S.duration) * (e.boss ? S.bossDuration : 1);
    if (e.dead || d <= 0) return;
    const fresh = !e.st[id];
    if (fresh)
      F.num(
        e.x,
        2 * e.scale + e.y,
        e.z,
        id === "shock"
          ? `SHOCKED ${Math.round((e.shockFx || S.minEffect) * 100)}%`
          : S.name.toUpperCase(),
        S.color,
        11,
      );
    e.st[id] = Math.max(e.st[id] || 0, d);
    // Nettle Snare: rooting poisons
    const RP = G.stats.fx.rootPoison;
    if (RP && id === "root" && fresh)
      for (let i = 0; i < RP.stacks; i++) C.poison(e);
    if (fresh) G.rules.fire("status", { e, status: id });
  };
  function tickStacks(arr, dt) {
    let sum = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const s = arr[i];
      sum += s.dps * Math.min(dt, s.t);
      s.t -= dt;
      if (s.t <= 0) arr.splice(i, 1);
    }
    return sum;
  }
  // Bleeds tick like stacks, each with its own Festering Wounds ramp.
  function tickBleeds(arr, dt) {
    let sum = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      sum += b.dps * C.bleedRamp(b) * Math.min(dt, b.t);
      b.t -= dt;
      if (b.t <= 0) arr.splice(i, 1);
    }
    return sum;
  }
  // Holy fire: every application is its own stack, without limit, dealing elemental damage every half
  // second. dps: taken from a hit, raised here by Elemental and DoT damage. how: 'scaled' = already raised
  // (the Holy Lantern, Divine Finale; no chime), 'halo' = copied from another burning monster's circle
  // (nothing raises it again). Holy fire you set yourself is raised by the scythe's implicit too.
  C.holyWeapon = () =>
    G.stats.wfx.holyReaper ? G.stats.wfx.holyReaper.holy : 1;
  C.burn = function (e, dps, t, how) {
    if (e.dead || dps <= 0) return;
    const k =
      how === "halo"
        ? 1
        : (how === "scaled" ? 1 : C.mult("holyFire")) * C.holyWeapon();
    (e.holy || (e.holy = [])).push({ dps: dps * k, t });
    if (!how) A.play("holyBurn");
  };
  const strongest = (e) => e.holy.reduce((m, s) => Math.max(m, s.dps), 0);
  // The golden circle around a burning monster: every half second it sets the monsters in it on holy
  // fire too, worth a share of this monster's strongest stack.
  function holyHalo(e) {
    const H = G.DOTS.holy,
      R = H.auraRadius * Math.max(1, e.scale),
      dps = strongest(e) * H.spread;
    if (dps <= 0) return;
    ES.query(e.x, e.z, R + 3, (o) => {
      if (o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) < R + o.r)
        C.burn(o, dps, H.duration, "halo");
    });
  }
  // A monster that dies with enough holy fire on it explodes with holy energy: a cross of light and damage
  // around it. The blast sets nothing on fire (it used to, and one blast set off the next without end).
  // Queued so a chain of them spreads over a few frames.
  function holyBlast(q) {
    const H = G.DOTS.holy,
      R = H.explodeRadius * Math.max(1, q.scale);
    F.streak(q.x, 0.2, q.z, q.x, 7.5, q.z, 0xffe080, 0.5, 0.55);
    F.streak(q.x, 0.2, q.z, q.x, 7.5, q.z, 0xffffff, 0.5, 0.18);
    F.streak(q.x - 1.8, 5.4, q.z, q.x + 1.8, 5.4, q.z, 0xffe080, 0.5, 0.55);
    F.streak(q.x - 1.8, 5.4, q.z, q.x + 1.8, 5.4, q.z, 0xffffff, 0.5, 0.18);
    F.explosion(q.x, q.z, R, 0xffe8a0);
    F.ring(q.x, q.z, { r0: 0.5, r1: R + 1, life: 0.5, color: 0xfff0b0 });
    F.burst(q.x, 1.2, q.z, {
      n: 26,
      color: [0xffe080, 0xffffff, 0xfff4c0],
      glow: true,
      speed: 7,
      life: 0.9,
      size: 0.16,
      up: 1.2,
      grav: -2,
    });
    A.play("holyBlast");
    ES.query(q.x, q.z, R + 3, (o) => {
      if (o.dead || Math.hypot(o.x - q.x, o.z - q.z) > R + o.r) return;
      C.elementalHit(o, q.maxHp * H.explode * C.mult("holyBlast"), "holyBlast");
    });
  }
  // Damage over time ticks every half second; poison on its own clock, faster with Poison tick rate.
  function updateDots(dt) {
    const RB = G.stats.fx.ragingBull,
      bm = (RB && P.buffs[RB.buff] ? RB.bleedMult : 1) * G.chests.bleedMult(); // Raging Bull, Apostasy
    const pr = C.poisonRate(),
      pTick = 0.5 / pr;
    for (const e of ES.list) {
      const holy = e.holy && e.holy.length;
      if (
        e.dead ||
        (!e.poison.length && !e.bleed.length && !holy && !(e.pAcc > 0))
      )
        continue;
      e.pAcc += tickStacks(e.poison, dt) * pr;
      e.bAcc += tickBleeds(e.bleed, dt) * bm;
      if (holy) {
        e.hAcc = (e.hAcc || 0) + tickStacks(e.holy, dt);
        // angelic motes rising off it, thicker the more holy fire it carries
        if (Math.random() < dt * Math.min(30, 6 + e.holy.length))
          F.glow.add(
            e.x + U.rnd(-0.5, 0.5) * e.r * 2,
            0.4 + e.y + Math.random() * e.scale,
            e.z + U.rnd(-0.5, 0.5) * e.r * 2,
            0,
            U.rnd(1.2, 2.4),
            0,
            0.7,
            0.14,
            Math.random() < 0.3 ? 0xffffff : 0xffe080,
            0,
            0.5,
          );
        if ((e.haloT = (e.haloT || 0) - dt) <= 0) {
          e.haloT = 0.5;
          holyHalo(e);
        }
      }
      if (e.poison.length && Math.random() < dt * 5)
        F.rise(e.x, 0.8 + e.y, e.z, 0x8aef4a, 1, e.r * 1.5, 1.6, 0.12, 0.7);
      if (e.bleed.length && Math.random() < dt * 8)
        F.solid.add(
          e.x + U.rnd(-0.3, 0.3),
          0.9 + e.y,
          e.z + U.rnd(-0.3, 0.3),
          0,
          -1,
          0,
          0.6,
          0.09,
          0xc01a10,
          10,
          0.5,
        );
      e.pT = (e.pT || 0) + dt;
      if (e.pT >= pTick) {
        e.pT = 0;
        if (e.pAcc > 0) {
          const v = e.pAcc;
          e.pAcc = 0;
          C.damage(e, v, "poison", "poison", "poison");
        }
      }
      e.dotT += dt;
      if (e.dotT >= 0.5) {
        e.dotT = 0;
        if (!e.dead && e.revAcc > 0) {
          const v = e.revAcc;
          e.revAcc = 0;
          C.damage(e, v, "poison", "poison", "reversal");
        } // Poisoned Chalice
        if (!e.dead && e.bAcc > 0) {
          const v = e.bAcc;
          e.bAcc = 0;
          C.damage(e, v, "bleed", "physical", "bleed");
        }
        if (!e.dead && e.hAcc > 0) {
          const v = e.hAcc;
          e.hAcc = 0;
          C.damage(e, v, "holy", "elemental", "holyFire");
        }
      }
    }
  }

  C.kill = function (e) {
    if (e.dead) return;
    const s = G.stats,
      d = e.def;
    e.dead = true;
    e.hp = 0;
    e.dying = e.boss ? 1.2 : 0.3;
    G.run.kills++;
    G.run.killsBy = G.run.killsBy || {};
    G.run.killsBy[e.type] = (G.run.killsBy[e.type] || 0) + 1;
    if (Math.random() < 0.04) A.play("scream", U.rnd(0.9, 1.35));
    if (
      s.fx.ragingBull &&
      e.bleed.length &&
      Math.random() < s.fx.ragingBull.chance
    )
      C.ragingBull(s.fx.ragingBull);
    A.play(d.die);
    F.burst(e.x, 0.8 + e.y, e.z, {
      n: e.boss ? 40 : e.elite ? 16 : 8,
      color: d.debris,
      speed: e.boss ? 10 : 5,
      life: 0.8,
      size: e.boss ? 0.42 : 0.16 * e.scale,
    });
    if (d.flying)
      F.burst(e.x, e.y, e.z, {
        n: 6,
        color: [0x15151c, 0x2a2a35],
        speed: 3,
        life: 1.4,
        size: 0.14,
        grav: 2.5,
        drag: 4,
      });
    if (s.lifeOnKill > 0) G.playerSys.heal(s.lifeOnKill, false);
    if (s.lifeOnKillPct > 0) G.playerSys.heal(s.maxHp * s.lifeOnKillPct, false); // Bloodlust
    G.tfx.onKill(e);
    G.trinkets.onKill();
    G.rules.fire("kill", { e });
    if (e.holy && e.holy.length >= G.DOTS.holy.explodeAt)
      C.holyQ.push({
        x: e.x,
        z: e.z,
        scale: e.scale,
        maxHp: e.maxHp,
        dps: strongest(e),
      });
    weaponOnKill(e, s);
    if (s.explodeChance > 0 && Math.random() < s.explodeChance) {
      C.explQ.push({
        x: e.x,
        z: e.z,
        dmg: e.maxHp * s.explodePower,
        r: 3.2 * (1 + s.area * 0.5) * Math.max(1, e.scale),
        delay: 0.07,
      });
    }
    if (s.acidChance > 0 && Math.random() < s.acidChance)
      C.explQ.push({
        x: e.x,
        z: e.z,
        dmg: e.maxHp * 0.5,
        r: 2.8 * Math.max(1, e.scale),
        delay: 0.05,
        acid: true,
      });
    if (e.deathBlast > 0)
      G.enemyShots.blast(e.x, e.z, 7 * e.scale, 1.3, e.dmg * e.deathBlast);
    if (d.split)
      for (let i = 0; i < d.split.count; i++) {
        const a = Math.random() * Math.PI * 2,
          b = ES.spawn(
            d.split.into,
            e.x + Math.cos(a) * 0.8,
            e.z + Math.sin(a) * 0.8,
            { alien: e.alien },
          );
        b.kbx = Math.cos(a) * 6;
        b.kbz = Math.sin(a) * 6;
      }
    if (e.essence > 0) PK.dropEssence(e.x, e.z, e.essence);
    const lk = 1 + s.luck / 100;
    if (e.boss) {
      bossDown(e);
      return;
    }
    const D =
      e.elite || e.invader || e.rareMob ? G.DROPS.elite : G.DROPS.normal;
    PK.dropXP(e.x, e.z, e.xp * (1 + 0.3 * G.danger));
    if (Math.random() < D.item * lk * G.DROPS.itemMult)
      PK.dropItem(e.x, e.z, C.rollItem(0, D.itemLuck));
    if (Math.random() < D.fish) PK.dropHeal(e.x, e.z);
    if (Math.random() < D.catnip * lk) PK.dropCatnip(e.x, e.z);
  };
  // ilvlBonus: item levels above what drops right now (bosses, dungeons)
  C.rollItem = function (minR, luckBonus, ilvlBonus = 0) {
    const slot = U.weighted(G.SLOTS, (sl) => G.SLOT_WEIGHTS[sl]);
    return G.makeItem(
      slot,
      G.rollItemRarity(G.stats.luck + luckBonus, minR),
      0,
      null,
      { ilvl: G.rollItemLevel(ilvlBonus), tags: G.map().tags },
    );
  };
  // Boss loot comes from the "rewards" block of the enemy in data/enemies.json.
  function bossDown(e) {
    const R = e.def.rewards || {},
      rank = e.rank || 1,
      title = R.title || `${e.def.name} Slain!`;
    G.run.bosses++;
    if (e.rare) G.run.rares++;
    F.explosion(e.x, e.z, 7, 0xffa050);
    F.shake(1);
    F.flash("#ffd9a8", 0.6);
    // its experience, like any monster's (just more of it), in a few crystals. Bosses give no blessings:
    // free levels only come from experience barrels and finished dungeons.
    const total = (e.xp || 0) * (1 + 0.3 * G.danger);
    if (total > 0)
      for (let i = 0; i < 6; i++)
        PK.dropXP(e.x + U.rnd(-2, 2), e.z + U.rnd(-2, 2), total / 6);
    const items = (Array.isArray(R.items) ? R.items : []).filter(
      (it) => rank >= (it.minRank || 1) && Math.random() < G.DROPS.itemMult,
    );
    items.forEach((it, i) => {
      const a = (i / items.length) * Math.PI * 2;
      PK.dropItem(
        e.x + Math.cos(a) * 1.5,
        e.z + Math.sin(a) * 1.5,
        C.rollItem(it.minRarity || 0, it.luck || 0, 1),
      );
    });
    for (let i = 0; i < (R.fish || 0); i++)
      PK.dropHeal(e.x + U.rnd(-1.5, 1.5), e.z - 1.5);
    for (let i = 0; i < (R.catnip || 0); i++)
      PK.dropCatnip(e.x + U.rnd(-1.5, 1.5), e.z + 2.5);
    G.rerolls += R.rerolls || 0;
    G.ui.banner(title, R.subtitle || "", "#ffd060");
    const other = ES.list.find((o) => o.boss && !o.dead);
    G.ui.bossBar(other || null);
  }
  // Raging Bull (talent): every bleed you have inflicted lasts longer, and bleeds hit harder while the buff lasts.
  C.ragingBull = function (RB) {
    for (const o of ES.list)
      if (!o.dead) for (const b of o.bleed) b.t += RB.extend;
    if (!P.buffs[RB.buff]) {
      F.flash("#5a0a06", 0.3);
      F.ring(P.x, P.z, { r0: 0.5, r1: 5, life: 0.5, color: 0xff3a2a });
      A.play("roar");
    }
    G.playerSys.addBuff(RB.buff);
  };
  // Bomb Battalion (talent): a block blows up everything around you.
  C.bomb = function () {
    const B = G.stats.fx.bombBattalion;
    C.explQ.push({
      x: P.x,
      z: P.z,
      dmg: G.stats.maxHp * B.power,
      r: B.radius,
      delay: 0,
    });
    F.flash("#ffb060", 0.35);
    F.shake(0.5);
  };
  // An explosion that hurts monsters. acid: it also leaves a pool of acid (alien affix).
  // q: { x, z, r, dmg (unscaled; raw: already scaled), blood: a physical blood burst (else an elemental
  // explosion), acid: leaves a pool of acid, sound: instead of the usual one (false: none), onDone(kills): called with
  // how many monsters it killed, src: the G.DMG_SOURCES key instead, style: meteor / holy / void / frost (talent rules) }
  C.explode = function (q) {
    F.explosion(q.x, q.z, q.r, q.acid ? 0x9aff3a : q.color);
    if (q.style) explodeStyle(q);
    if (q.sound !== false)
      A.play(q.sound || (q.blood ? "bloodburst" : "explode"));
    G.run.explosions++;
    if (q.blood)
      F.burst(q.x, 0.9, q.z, {
        n: 30,
        color: [0xc01a10, 0x8a0c06, 0xff3a2a],
        speed: 9,
        life: 0.8,
        size: 0.18,
        grav: 14,
      });
    if (q.acid) {
      F.disc(q.x, q.z, q.r * 0.8, 4, 0x7adf1a, 0.5);
      C.puddles.push({
        x: q.x,
        z: q.z,
        r: q.r * 0.8,
        t: 4,
        tick: 0,
        dmg: G.stats.dmg * 0.5 * C.mult("acid"),
        acid: true,
      });
    }
    const key = q.src || (q.blood ? "bloodBurst" : "explosion"),
      dmg = q.raw ? q.dmg : q.dmg * C.mult(key);
    let kills = 0;
    ES.query(q.x, q.z, q.r + 3, (e) => {
      if (e.dead) return;
      const dx = e.x - q.x,
        dz = e.z - q.z,
        d = Math.hypot(dx, dz);
      if (d > q.r + e.r) return;
      if (q.blood) C.damage(e, dmg, "explode", "physical", key);
      else C.elementalHit(e, dmg, key);
      if (e.dead) kills++;
      else if (!e.boss) {
        const k = 9 / Math.sqrt(e.mass) / (d + 1);
        e.kbx += dx * k;
        e.kbz += dz * k;
      }
    });
    if (q.onDone) q.onDone(kills);
  };

  // The look of a talent rule's explosion.
  function explodeStyle(q) {
    const x = q.x,
      z = q.z,
      R = q.r;
    if (q.style === "meteor") {
      F.streak(x + 3, 16, z - 2, x, 0.2, z, 0xffb040, 0.35, 0.6);
      F.streak(x + 3, 16, z - 2, x, 0.2, z, 0xffffff, 0.25, 0.2);
      F.burst(x, 0.5, z, {
        n: 24,
        color: [0x3a2a20, 0x6a4a30, 0xff8a2a],
        speed: R * 3,
        life: 0.9,
        size: 0.22,
        up: 1.4,
        grav: 12,
      });
      F.shake(0.25);
    } else if (q.style === "holy") {
      F.streak(x, 0.2, z, x, 6.5, z, 0xffe080, 0.45, 0.45);
      F.streak(x - 1.5, 4.6, z, x + 1.5, 4.6, z, 0xffe080, 0.45, 0.45);
      F.burst(x, 1.2, z, {
        n: 18,
        color: [0xffe080, 0xffffff],
        glow: true,
        speed: 6,
        life: 0.8,
        size: 0.15,
        up: 1,
        grav: -2,
      });
    } else if (q.style === "void") {
      F.ring(x, z, { r0: R + 1.5, r1: 0.3, life: 0.4, color: 0xb86cff });
      F.ring(x, z, { r0: 0.3, r1: R, life: 0.5, color: 0x3a1a6a, y: 0.6 });
      F.burst(x, 1, z, {
        n: 20,
        color: [0xb86cff, 0x2a1050, 0xe8d8ff],
        glow: true,
        speed: R * 2.5,
        life: 0.6,
        size: 0.18,
        grav: 0,
        drag: 3,
      });
    } else if (q.style === "frost") {
      F.ring(x, z, { r0: 0.3, r1: R, life: 0.5, color: 0xe8f8ff });
      F.burst(x, 0.8, z, {
        n: 22,
        color: [0x9fe8ff, 0xffffff, 0x5ab0ff],
        glow: true,
        speed: R * 2.4,
        life: 0.7,
        size: 0.16,
        up: 0.6,
        grav: 4,
      });
    }
  }

  // ----- per-frame -----
  // attacks made in the last RECENT seconds (gun / melee damage per attack), counting up to 25
  const RECENT = 4;
  C.recentAttacks = () => Math.min(25, C.atkLog.length);
  C.update = function (dt) {
    const s = G.stats;
    meterTick(dt);
    C.clock += dt;
    while (C.atkLog.length && C.atkLog[0] < C.clock - RECENT) C.atkLog.shift();
    // monsters infected with poison (armor per poisoned monster), counted four times a second
    if ((C.poisonT -= dt) <= 0) {
      C.poisonT = 0.25;
      let n = 0;
      for (const e of ES.list) if (!e.dead && e.poison.length) n++;
      C.poisonedN = n;
    }
    if (!P.dead) {
      C.atkT -= dt;
      if (C.atkT <= 0 && !P.status.stun) {
        for (const t of C.attack()) C.extra.push(t); // Flurry, the revolver's burst
        C.atkT = Math.max(
          0,
          C.atkT +
            Math.max(PR.MIN_INTERVAL, s.interval / G.tfx.speedMult()) *
              C.riposteSlow,
        );
      }
      for (let i = C.extra.length - 1; i >= 0; i--)
        if ((C.extra[i] -= dt) <= 0) {
          C.extra.splice(i, 1);
          if (!P.status.stun) C.attack(true);
        }
      // the scream's echoes
      for (const q of C.novaQ)
        if ((q.t -= dt) <= 0) {
          q.done = true;
          C.nova(q.dmg, { echo: true });
        }
    }
    C.novaQ = P.dead ? [] : C.novaQ.filter((q) => !q.done);
    for (const k in C.icd) if ((C.icd[k] -= dt) <= 0) delete C.icd[k];
    for (const p of C.projs) {
      if (p.kind === "flask") {
        p.t += dt;
        p.rot += dt * 12;
        const k = Math.min(1, p.t / p.dur);
        p.x = U.lerp(p.sx, p.tx, k);
        p.z = U.lerp(p.sz, p.tz, k);
        p.y = 1.2 * (1 - k) + Math.sin(k * Math.PI) * 3.2;
        if (k >= 1) {
          p.dead = true;
          flaskLand(p);
        }
        continue;
      }
      if (p.target) {
        if (p.target.dead) p.target = null;
        else {
          const dx = p.target.x - p.x,
            dz = p.target.z - p.z,
            l = Math.hypot(dx, dz) || 1;
          p.vx = (dx / l) * p.speed;
          p.vz = (dz / l) * p.speed;
        }
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.dist += p.speed * dt;
      p.rot += dt * 16;
      if (p.kind === "bullet")
        F.streak(
          p.x - p.vx * 0.03,
          p.y,
          p.z - p.vz * 0.03,
          p.x,
          p.y,
          p.z,
          0xffe0a0,
          0.06,
          0.06,
        );
      if (p.kind === "dart" && Math.random() < dt * 30)
        F.glow.add(p.x, p.y, p.z, 0, 0, 0, 0.2, 0.08, 0x8aef4a, 0, 1);
      if (p.kind === "flame") {
        p.size = 0.5 + (p.dist / p.range) * 1.8;
        if (Math.random() < dt * 30)
          F.glow.add(
            p.x,
            p.y,
            p.z,
            U.rnd(-0.5, 0.5),
            1.5,
            U.rnd(-0.5, 0.5),
            0.3,
            0.16 * p.size,
            U.pick([0xffa040, 0xffe080, 0x9aff6a]),
            0,
            2,
          );
      }
      if (p.kind === "scythe" && Math.random() < dt * 20)
        F.glow.add(p.x, p.y, p.z, 0, 0, 0, 0.25, 0.18, 0x7fc8ff, 0, 1);
      if (p.kind === "fireball") {
        if (Math.random() < dt * (p.great ? 60 : 36))
          F.glow.add(
            p.x + U.rnd(-0.15, 0.15) * p.size,
            p.y + U.rnd(-0.1, 0.2),
            p.z + U.rnd(-0.15, 0.15) * p.size,
            -p.vx * 0.05,
            U.rnd(0.4, 1.2),
            -p.vz * 0.05,
            0.4,
            0.2 * p.size,
            U.pick([0xff6a1a, 0xffb040, 0xffe080]),
            0,
            2,
          );
        if (Math.random() < dt * 8)
          F.solid.add(
            p.x,
            p.y + 0.2,
            p.z,
            0,
            1.2,
            0,
            0.7,
            0.14 * p.size,
            0x2a1a14,
            -0.5,
            1,
          );
      }
      if (p.dist > p.range) {
        if (p.kind === "fireball") fireburst(p);
        p.dead = true;
        continue;
      }
      if (
        (W.bounds.solidShots ||
          p.kind === "bullet" ||
          p.kind === "pellet" ||
          p.kind === "flame" ||
          p.kind === "dart" ||
          p.kind === "knife" ||
          p.kind === "fireball") &&
        W.blocked(p.x, p.z, 0.05)
      ) {
        if (p.kind === "fireball") {
          fireburst(p);
          continue;
        }
        p.dead = true;
        F.burst(p.x, p.y, p.z, {
          n: 3,
          color: 0xfff0a0,
          glow: true,
          speed: 3,
          life: 0.2,
          size: 0.1,
          grav: 0,
        });
        continue;
      }
      const hr =
        p.kind === "wave"
          ? 0.9 * p.size
          : p.kind === "scythe"
            ? 0.5 * p.size
            : p.kind === "flame"
              ? 0.55 * p.size
              : p.kind === "fireball"
                ? 0.35 * p.size
                : 0.25;
      ES.query(p.x, p.z, hr + 2.6, (e) => {
        if (p.dead || e.dead || e.y > 3.5 || p.hit.includes(e.id)) return;
        if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < (e.r + hr) ** 2)
          onProjHit(p, e);
      });
    }
    C.projs = C.projs.filter((p) => !p.dead);
    for (const pd of C.puddles) {
      pd.t -= dt;
      pd.tick -= dt;
      if (Math.random() < dt * (pd.fire ? 14 : 8))
        F.rise(
          pd.x + U.rnd(-pd.r, pd.r) * 0.7,
          0.1,
          pd.z + U.rnd(-pd.r, pd.r) * 0.7,
          pd.fire
            ? 0xff8a2a
            : pd.blood
              ? 0xa01208
              : pd.acid
                ? 0xc8ff3a
                : 0x8aef4a,
          1,
          0.2,
          pd.fire ? 2 : 1.2,
          0.12,
          0.6,
        );
      if (pd.tick <= 0) {
        pd.tick = pd.every || 0.5;
        // flask puddles poison; acid pools burn for elemental damage; Burning Bridges fire burns
        // (elemental, no poison or bleed); a crippled monster's blood trail bleeds the others
        ES.query(pd.x, pd.z, pd.r + 3, (e) => {
          if (
            e.dead ||
            e.y > 1.5 ||
            Math.hypot(e.x - pd.x, e.z - pd.z) > pd.r + e.r
          )
            return;
          if (pd.fire) C.damage(e, pd.dmg, "fire", "elemental", "fire");
          else if (pd.blood) {
            if (e.id !== pd.src)
              C.damage(e, pd.dmg, "bleed", "physical", "bloodTrail");
          } else if (pd.acid)
            C.damage(e, pd.dmg * 0.5, "elemental", "elemental", "acid");
          else C.poison(e, pd.dmg);
        });
      }
    }
    C.puddles = C.puddles.filter((p) => p.t > 0);
    updateDots(dt);
    let done = 0;
    for (const q of C.explQ) {
      q.delay -= dt;
      if (q.delay <= 0 && done < 6) {
        done++;
        q.done = true;
        C.explode(q);
      }
    }
    C.explQ = C.explQ.filter((q) => !q.done);
    for (let i = 0; i < 4 && C.holyQ.length; i++) holyBlast(C.holyQ.shift());
  };

  C.render = function () {
    const n = {};
    for (const k of G.PROJ_KINDS) n[k] = 0;
    for (const p of C.projs) {
      const m = C.meshes[p.kind];
      if (n[p.kind] >= 320) continue;
      const yaw = p.kind === "flask" ? 0 : Math.atan2(p.vx, p.vz);
      dummy.position.set(p.x, p.y, p.z);
      if (p.kind === "scythe") dummy.rotation.set(0, p.rot, 0);
      else if (p.kind === "flask" || p.kind === "flame")
        dummy.rotation.set(p.rot, p.rot * 0.6, 0);
      else if (p.kind === "knife") dummy.rotation.set(0, yaw + p.rot * 2, 0);
      else if (p.kind === "fireball") dummy.rotation.set(0, yaw, p.rot);
      else dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(p.size || 1);
      dummy.updateMatrix();
      m.setMatrixAt(n[p.kind]++, dummy.matrix);
    }
    for (const k in C.meshes) {
      C.meshes[k].count = n[k];
      C.meshes[k].instanceMatrix.needsUpdate = true;
    }
  };

  // =====================================================================
  // Pickups: soul crystals, embers (the code's "essence"), fish, catnip and loot
  // =====================================================================
  const PK = (G.pickups = { gems: [], ess: [], misc: [], loot: [] });
  const gemTier = (v) => (v < 2.5 ? 0 : v < 7 ? 1 : v < 20 ? 2 : 3);
  const GEM_COL = [0x7dff6a, 0x4ab8ff, 0xc070ff, 0xffb030];
  PK.init = function () {
    PK.gemMesh = new T.InstancedMesh(
      M.gemGeo(),
      new T.MeshBasicMaterial({ vertexColors: true }),
      700,
    );
    PK.gemMesh.frustumCulled = false;
    PK.gemMesh.count = 0;
    PK.gemMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const c = new T.Color(1, 1, 1);
    for (let i = 0; i < 700; i++) PK.gemMesh.setColorAt(i, c);
    G.scene.add(PK.gemMesh);
    PK.beamGeo = new T.CylinderGeometry(0.16, 0.3, 6, 8, 1, true);
    PK.beamGeo.translate(0, 3, 0);
    // embers: the old essence crystal, orange and see-through (60%)
    PK.essMesh = M.inst(
      M.essenceGeo(),
      new T.MeshBasicMaterial({
        color: M.EMBER.color,
        transparent: true,
        opacity: M.EMBER.opacity,
        depthWrite: false,
      }),
      500,
    );
    G.scene.add(PK.essMesh);
  };
  // Embers: the workbench currency. Pulled in by the pickup radius like soul crystals.
  PK.dropEssence = function (x, z, v) {
    if (PK.ess.length >= 480) {
      U.pick(PK.ess).v += v;
      return;
    }
    PK.ess.push({
      x: x + U.rnd(-0.4, 0.4),
      z: z + U.rnd(-0.4, 0.4),
      y: 0.6,
      vy: U.rnd(2.5, 4.5),
      v,
      mag: false,
      sp: 0,
      t: Math.random() * 6,
    });
  };
  // Night and catnip: every crystal and ember on the farm flies to you.
  PK.magnetAll = function () {
    for (const g of PK.gems) g.mag = true;
    for (const g of PK.ess) g.mag = true;
  };
  PK.dropXP = function (x, z, v) {
    v *= G.XP.mult;
    if (PK.gems.length >= 680) {
      U.pick(PK.gems).v += v;
      return;
    }
    PK.gems.push({
      x: x + U.rnd(-0.3, 0.3),
      z: z + U.rnd(-0.3, 0.3),
      y: 0.6,
      vy: U.rnd(2, 4),
      v,
      mag: false,
      sp: 0,
      t: Math.random() * 6,
    });
  };
  function miscPickup(kind, x, z, mesh) {
    mesh.position.set(x, 0.6, z);
    G.scene.add(mesh);
    PK.misc.push({ kind, x, z, mesh, t: 0 });
  }
  PK.dropHeal = (x, z) => miscPickup("fish", x, z, M.fish());
  PK.dropCatnip = (x, z) => miscPickup("catnip", x, z, M.catnip());
  PK.dropItem = function (x, z, item) {
    const g = new T.Group(),
      model = M.itemModel(item),
      bb = new T.Box3().setFromObject(model),
      sz = bb.getSize(new T.Vector3());
    const k = 1.1 / Math.max(sz.x, sz.y, sz.z, 0.01);
    model.scale.setScalar(k);
    model.position.y = -bb.getCenter(new T.Vector3()).y * k;
    const spin = new T.Group();
    spin.add(model);
    spin.position.y = 0.9;
    g.add(spin);
    const rc = G.ITEM_RARITY[item.rarity].hex;
    const beam = new T.Mesh(
      PK.beamGeo,
      new T.MeshBasicMaterial({
        color: rc,
        transparent: true,
        opacity: 0.32 + item.rarity * 0.06,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide,
        fog: false,
      }),
    );
    g.add(beam);
    g.position.set(x, 0, z);
    G.scene.add(g);
    PK.loot.push({ item, x, z, g, spin, beam, t: 0, cd: 0 });
    F.ring(x, z, { r0: 0.2, r1: 2.2, life: 0.6, color: rc });
    A.play("drop", item.rarity);
    if (item.rarity >= 2)
      G.ui.toast(
        `${G.ITEM_RARITY[item.rarity].name} loot dropped: ${item.name}`,
        G.ITEM_RARITY[item.rarity].color,
      );
  };
  PK.update = function (dt) {
    const s = G.stats,
      R = s.pickupR;
    let collected = 0;
    for (const g of PK.gems) {
      g.t += dt;
      if (g.vy !== 0) {
        g.vy -= 14 * dt;
        g.y += g.vy * dt;
        if (g.y <= 0.45) {
          g.y = 0.45;
          g.vy = 0;
        }
      }
      const dx = P.x - g.x,
        dz = P.z - g.z,
        d = Math.hypot(dx, dz);
      if (!g.mag && d < R && !P.dead) g.mag = true;
      if (g.mag && !P.dead) {
        g.sp = Math.min(30, g.sp + dt * 40);
        g.x += (dx / (d || 1)) * g.sp * dt;
        g.z += (dz / (d || 1)) * g.sp * dt;
        if (d < 0.6) {
          g.got = true;
          collected++;
          PR.addXP(g.v);
        }
      }
    }
    if (collected) {
      PK.combo = Math.min(1.8, (PK.combo || 1) + 0.04 * collected);
      A.play("xp", PK.combo);
    }
    PK.combo = Math.max(1, (PK.combo || 1) - dt * 0.6);
    PK.gems = PK.gems.filter((g) => !g.got);
    let ess = 0;
    for (const g of PK.ess) {
      g.t += dt;
      if (g.vy !== 0) {
        g.vy -= 14 * dt;
        g.y += g.vy * dt;
        if (g.y <= 0.5) {
          g.y = 0.5;
          g.vy = 0;
        }
      }
      const dx = P.x - g.x,
        dz = P.z - g.z,
        d = Math.hypot(dx, dz);
      if (!g.mag && d < R && !P.dead) g.mag = true;
      if (g.mag && !P.dead) {
        g.sp = Math.min(30, g.sp + dt * 40);
        g.x += (dx / (d || 1)) * g.sp * dt;
        g.z += (dz / (d || 1)) * g.sp * dt;
        if (d < 0.6) {
          g.got = true;
          ess += g.v;
        }
      }
    }
    if (ess) {
      ess *= 1 + (G.stats.essenceGain || 0);
      G.run.essence += ess;
      G.run.essenceTotal += ess;
      A.play("essence");
    }
    PK.ess = PK.ess.filter((g) => !g.got);
    for (const m of PK.misc) {
      m.t += dt;
      m.mesh.rotation.y += dt * 2;
      m.mesh.position.y = 0.6 + Math.sin(m.t * 3) * 0.15;
      if (m.t > G.PICKUPS.despawnSeconds) m.gone = true;
      if (
        !P.dead &&
        Math.hypot(P.x - m.x, P.z - m.z) < 1.1 + s.pickupR * 0.15
      ) {
        m.gone = true;
        if (m.kind === "fish") {
          G.playerSys.heal(
            s.maxHp *
              G.PICKUPS.fishHeal *
              (1 + (s.fx.fishFeast ? s.fx.fishFeast.more : 0)),
            true,
          );
          A.play("heal");
        } // Catch of the Day
        else {
          PK.magnetAll();
          A.play("catnip");
          G.ui.toast("Catnip! Every crystal rushes to you", "#8af060");
          if (G.PICKUPS.catnipBuff) G.playerSys.addBuff(G.PICKUPS.catnipBuff);
        }
      }
      if (m.gone) {
        G.scene.remove(m.mesh);
        m.mesh.geometry.dispose();
      }
    }
    PK.misc = PK.misc.filter((m) => !m.gone);
    for (const l of PK.loot) {
      l.t += dt;
      l.cd -= dt;
      l.spin.rotation.y += dt * 1.6;
      l.spin.position.y = 0.9 + Math.sin(l.t * 2.5) * 0.15;
      l.beam.material.opacity =
        (0.3 + l.item.rarity * 0.06) * (0.8 + Math.sin(l.t * 4) * 0.2);
      if (l.item.rarity === 3 && Math.random() < dt * 6)
        F.rise(l.x, 0.3, l.z, 0xffb040, 1, 0.8, 2.5, 0.14, 1);
      if (!P.dead && l.cd <= 0 && Math.hypot(P.x - l.x, P.z - l.z) < 1.3) {
        if (PR.addItem(l.item)) {
          l.gone = true;
          A.play("pickup");
          F.ring(l.x, l.z, {
            r0: 0.3,
            r1: 1.8,
            life: 0.4,
            color: G.ITEM_RARITY[l.item.rarity].hex,
          });
        } else {
          l.cd = 3;
          G.ui.toast(
            "Saddlebag full. Press C over loot or bag items to scrap them.",
            "#ff6a4a",
          );
        }
      }
      if (l.gone) removeLoot(l);
    }
    PK.loot = PK.loot.filter((l) => !l.gone);
  };
  function removeLoot(l) {
    G.scene.remove(l.g);
    l.g.traverse((o) => {
      if (o.geometry && o.geometry !== PK.beamGeo) o.geometry.dispose();
      if (o.material && o.material !== M.matL && o.material !== M.matB)
        o.material.dispose();
    });
    if (PK.hover === l) PK.hover = null;
  }
  // Scrap loot lying on the ground (C with the mouse over it). Returns the XP gained.
  PK.scrapLoot = function (l) {
    const i = PK.loot.indexOf(l);
    if (i < 0) return 0;
    const xp = PR.scrapValue(l.item);
    PK.loot.splice(i, 1);
    removeLoot(l);
    F.burst(l.x, 0.9, l.z, {
      n: 12,
      color: [G.ITEM_RARITY[l.item.rarity].hex, 0xffffff],
      glow: true,
      speed: 5,
      life: 0.5,
      size: 0.18,
    });
    F.num(l.x, 2.2, l.z, `+${xp} XP`, "#9ff0ff", 14);
    PR.addXP(xp);
    return xp;
  };
  // Workbench: scrap every item lying on the farm at once. Returns { n, xp }.
  PK.scrapAll = function () {
    let xp = 0,
      n = 0;
    for (const l of PK.loot.slice()) {
      xp += PK.scrapLoot(l);
      n++;
    }
    return { n, xp };
  };
  PK.render = function () {
    let n = 0;
    const c = new T.Color();
    for (const g of PK.gems) {
      if (n >= 700) break;
      const tr = gemTier(g.v);
      dummy.position.set(g.x, g.y + Math.sin(g.t * 3) * 0.08, g.z);
      dummy.rotation.set(0, g.t * 2, 0);
      dummy.scale.setScalar(1 + tr * 0.22);
      dummy.updateMatrix();
      PK.gemMesh.setMatrixAt(n, dummy.matrix);
      PK.gemMesh.setColorAt(n, c.set(GEM_COL[tr]));
      n++;
    }
    PK.gemMesh.count = n;
    PK.gemMesh.instanceMatrix.needsUpdate = true;
    if (PK.gemMesh.instanceColor) PK.gemMesh.instanceColor.needsUpdate = true;
    n = 0;
    for (const g of PK.ess) {
      if (n >= 500) break;
      const s = 0.9 + Math.min(1.2, Math.log2(1 + g.v) * 0.25);
      dummy.position.set(g.x, g.y + Math.sin(g.t * 4) * 0.1, g.z);
      dummy.rotation.set(g.t * 1.3, g.t * 2.4, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      PK.essMesh.setMatrixAt(n++, dummy.matrix);
    }
    PK.essMesh.count = n;
    PK.essMesh.instanceMatrix.needsUpdate = true;
  };
  // Name labels over loot, plus PK.hover: the loot under the mouse (its label, or near its model).
  PK.drawOverlay = function (c, dpr) {
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
    const m = G.input.mouse,
      mx = m.x * dpr,
      my = m.y * dpr,
      h = 20 * dpr,
      placed = [];
    let hover = null,
      best = 46 * dpr;
    for (const l of PK.loot) {
      const s = F.project(l.x, 0.9, l.z),
        d = s ? Math.hypot(s.x - mx, s.y - my) : Infinity;
      if (m.in && d < best) {
        best = d;
        hover = l;
      }
    }
    // labels: a ▲ for upgrades over what you wear (shown from further away), and the item level
    for (const l of PK.loot) {
      l.up = G.isUpgrade(l.item);
      if (
        (Math.hypot(P.x - l.x, P.z - l.z) > (l.up ? 22 : 10) &&
          l.item.rarity < 2 &&
          l !== hover) ||
        G.darkness.hidden(l.x, l.z)
      )
        continue;
      const s = F.project(l.x, 2.2, l.z);
      if (!s) continue;
      l.label =
        (l.up ? "▲ " : "") + l.item.name + " · lv " + (l.item.ilvl || 1);
      const w = c.measureText(l.label).width + 10 * dpr;
      for (
        let k = 0;
        k < 8 &&
        placed.some(
          (r) => Math.abs(r.x - s.x) < (r.w + w) / 2 && Math.abs(r.y - s.y) < h,
        );
        k++
      )
        s.y -= h + 2 * dpr;
      placed.push({ x: s.x, y: s.y, w, l });
    }
    if (m.in)
      for (const r of placed)
        if (Math.abs(mx - r.x) < r.w / 2 && Math.abs(my - r.y) < h / 2)
          hover = r.l;
    PK.hover = hover;
    for (const r of placed) {
      const col = G.ITEM_RARITY[r.l.item.rarity].color;
      c.fillStyle = "rgba(10,7,6,.75)";
      c.fillRect(r.x - r.w / 2, r.y - 10 * dpr, r.w, h);
      if (r.l === hover || r.l.up) {
        c.lineWidth = 2 * dpr;
        c.strokeStyle = r.l === hover ? col : "#7dff6a";
        c.strokeRect(r.x - r.w / 2, r.y - 10 * dpr, r.w, h);
      }
      c.fillStyle = col;
      c.fillText(r.l.label, r.x, r.y + dpr);
    }
  };
  PK.clear = function () {
    PK.gems.length = 0;
    PK.ess.length = 0;
    if (PK.essMesh) PK.essMesh.count = 0;
    for (const m of PK.misc) G.scene.remove(m.mesh);
    for (const l of PK.loot) G.scene.remove(l.g);
    PK.misc.length = 0;
    PK.loot.length = 0;
    PK.hover = null;
    if (PK.gemMesh) PK.gemMesh.count = 0;
  };
})();
