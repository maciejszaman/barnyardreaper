'use strict';
// Talent effects that need their own state: cooldowns, stacks, shields, auras and trails (data.js
// G.EFFECTS lists every effect and its numbers). Combat and the player system call the hooks below;
// TF.chips() feeds the buff bar with every learned effect talent and its current state.
// The Miracles (the old alien talents: baneOfLegends ... crippling in G.EFFECTS) live here too; their
// currency id is 'spoon'. Bleeds may stack (C.addBleed): always go through C.addBleed / C.topBleed.
(function () {
  const U = G.U, F = G.fx, A = G.audio, P = G.player, ES = G.enemySys, C = G.combat;
  const TF = G.tfx = {};
  const fx = () => G.stats.fx;

  TF.reset = function () {
    TF.t = 0;
    TF.cd = {};                 // effect id -> seconds of cooldown left
    TF.shield = null;           // Trophy Hunter: { hp, max, t, dur }
    TF.attacks = 0;             // Flurry: attacks so far
    TF.kills = [];              // Zealotry: times of recent kills
    TF.holy = null;             // Divine Shield aura: { t, dur, dmg, tick }
    TF.healAcc = 0; TF.healT = 0;
    TF.trailT = 0;
    TF.thirstReady = true;
    TF.fifth = 0; TF.empower = false;   // Crushing Blow: attacks counted, and whether the next hit is empowered
    TF.frenzy = [];                     // Killing Spree: times of recent kills
    TF.lastHit = -99;                   // Guarded: when you were last hit
    TF.hasteT = 0;                      // Adrenaline Rush: seconds of faster trinket recovery left
    TF.killLog = [];                    // Swordsman's Guard: times of recent kills
    TF.bossLog = [];                    // Giant Slayer's Frenzy: times of recent boss kills
    TF.crowd = 0; TF.crowdT = 0;        // In the Thick of It: monsters around you (counted 4 times a second)
    TF.meleeT = 0;                      // Iron Hide: seconds to the next shield
    TF.critN = 0; TF.critNow = false;   // Killer Instinct: attacks counted, and whether this attack crits
    TF.ricoN = 0; TF.ricoNext = false; TF.ricoNow = false;   // Ball of Yarn: attacks counted, the next one ricochets
    TF.blastArmed = false;              // Pent-Up Fury: the next hit explodes
    TF.freeT = 0;                       // Tinkerer: fighting time towards the next free upgrade
    TF.riposte = false;                 // Riposte: a block charged the next attack
  };
  TF.reset();
  const ready = (id) => !(TF.cd[id] > 0);
  const startCd = (id, s) => { TF.cd[id] = s; };

  // ---------- stats (PR.recompute) ----------
  // Fortitude and Infused Flesh, after max health and block chance are known.
  TF.stats = function (s) {
    if (s.fx.fortitude) s.maxHp *= 1 + s.blockChance;
    if (s.fx.infusedFlesh) s.flatElem += s.maxHp * s.fx.infusedFlesh.share;
  };
  // Zealotry: attack speed (and with Unending Zealotry, increased crit chance) from recent kills.
  TF.zeal = function () {
    const Z = fx().zealotry;
    if (!Z || !ready('zealotry')) return 0;
    const cap = fx().unendingZealotry ? fx().unendingZealotry.cap : Z.cap;
    return Math.min(cap, TF.kills.length * Z.perKill);
  };
  // ---------- bonuses that come and go (read every frame) ----------
  const frenzyOn = () => { const K = fx().killFrenzy; return !!K && TF.frenzy.length >= K.kills; };
  // Restless Waiting: is the trinket you carry recharging?
  const trinketCd = () => { const D = G.trinkets.def(); return !!fx().trinketCdBuff && !!D && G.trinkets.cd(D.id) > 0; };
  TF.moveBonus = () => (frenzyOn() ? fx().killFrenzy.move : 0) + (trinketCd() ? fx().trinketCdBuff.move : 0);
  const crowded = () => { const CA = fx().crowdArmor; return !!CA && TF.crowd >= CA.count; };
  TF.armorBonus = () => (trinketCd() ? fx().trinketCdBuff.armor : 0) + (crowded() ? fx().crowdArmor.armor : 0);
  // Swordsman's Guard: block chance per recent kill while wielding a sword
  const swordBlock = () => {
    const SB = fx().swordBlock;
    if (!SB || !SB.weapons.includes(G.stats.wtype)) return 0;
    return Math.min(SB.cap, TF.killLog.filter((t) => t >= TF.t - SB.recent).length * SB.per);
  };
  TF.blockBonus = () => { const H = fx().hitBlock; return (H && TF.t - TF.lastHit < H.recent ? H.block : 0) + swordBlock(); };
  TF.trinketRate = () => (TF.hasteT > 0 && fx().hitTrinketHaste ? 1 + fx().hitTrinketHaste.mult : 1);
  TF.speedMult = () => 1 + TF.zeal() + (frenzyOn() ? fx().killFrenzy.attackSpeed : 0);
  // Increased crit chance on top of your stats: Unending Zealotry, and Hunter's Momentum (bonus movement
  // speed counts as increased crit chance).
  TF.critBonus = () => (fx().unendingZealotry ? TF.zeal() : 0) + (fx().speedCrit ? Math.max(0, G.stats.moveMult + TF.moveBonus()) : 0);
  // Crushing Blow: the next hit after every 5th attack. Returns its damage multiplier (and uses it up), or 0.
  TF.takeEmpower = function () {
    if (!TF.empower) return 0;
    TF.empower = false;
    return fx().fifthStrike ? fx().fifthStrike.mult : 0;
  };

  // ---------- hooks ----------
  // Every attack (combat.js C.attack): Otherworldly Thirst heals, Flurry counts to its double strike.
  TF.onAttack = function () {
    const T = fx().thirst;
    if (T && ready('thirst')) {
      G.playerSys.heal(G.stats.maxHp * T.heal, true);
      F.ring(P.x, P.z, { r0: 0.4, r1: 2.2, life: 0.4, color: 0x9a3aff }); A.play('heal');
      startCd('thirst', T.cooldown);
    }
    const F5 = fx().fifthStrike;
    if (F5 && ++TF.fifth >= F5.every) { TF.fifth = 0; TF.empower = true; }
    // Killer Instinct: every 5th attack crits
    const FC = fx().fifthCrit;
    TF.critNow = false;
    if (FC && ++TF.critN >= FC.every) { TF.critN = 0; TF.critNow = true; }
    // Ball of Yarn: the attack after every 5th always ricochets
    const FR = fx().fifthRicochet;
    TF.ricoNow = !!FR && TF.ricoNext; TF.ricoNext = false;
    if (FR && ++TF.ricoN >= FR.every) { TF.ricoN = 0; TF.ricoNext = true; }
    const D = fx().doubleStrike;
    if (D && ++TF.attacks >= D.every) { TF.attacks = 0; return true; }   // strike again
    return false;
  };
  // The player took real damage (after blocks and shields).
  TF.onDamaged = function (dmg, before) {
    const s = G.stats, f = fx();
    TF.lastHit = TF.t;
    TF.lowHp(before);
    // Stout Heart: a shield of a share of your max health
    if (f.hitShield && ready('hitShield')) {
      startCd('hitShield', f.hitShield.cooldown);
      const v = s.maxHp * f.hitShield.share;
      if (!TF.shield || TF.shield.hp < v) TF.shield = { hp: v, max: v, t: f.hitShield.duration, dur: f.hitShield.duration };
      F.ring(P.x, P.z, { r0: 0.4, r1: 1.6, life: 0.35, color: 0xbfe8ff });
    }
    // Adrenaline Rush: the trinket recharges faster for a moment
    if (f.hitTrinketHaste && ready('hitTrinketHaste')) { startCd('hitTrinketHaste', f.hitTrinketHaste.cooldown); TF.hasteT = f.hitTrinketHaste.duration; }
    if (fx().zealotry && ready('zealotry')) { TF.kills.length = 0; startCd('zealotry', fx().zealotry.cooldown); }
    const L = fx().lastStand;
    if (L && ready('lastStand') && before >= s.maxHp * L.threshold && P.hp < s.maxHp * L.threshold && P.hp > 0) {
      startCd('lastStand', L.cooldown);
      F.ring(P.x, P.z, { r0: 0.5, r1: L.radius, life: 0.5, color: 0xffd04a }); F.flash('#fff0a0', 0.3); F.shake(0.4); A.play('roar');
      F.num(P.x, 3.2, P.z, 'HISS!', '#ffd04a', 18);
      ES.query(P.x, P.z, L.radius + 3, (e) => {
        if (e.dead || Math.hypot(e.x - P.x, e.z - P.z) > L.radius + e.r) return;
        e.st.stun = Math.max(e.st.stun || 0, L.stun * (e.boss ? G.STATUS.stun.bossDuration : 1));
      });
    }
  };
  // Borrowed Time: falling below the threshold sets off Grandpa's Pocket Watch on its own.
  TF.lowHp = function (before) {
    const B = fx().lowHpTimeStop, s = G.stats;
    if (!B || !ready('lowHpTimeStop') || P.hp <= 0 || !(before >= s.maxHp * B.threshold && P.hp < s.maxHp * B.threshold)) return;
    startCd('lowHpTimeStop', B.cooldown);
    G.trinkets.trigger(B.trinket);
    F.num(P.x, 3.6, P.z, 'BORROWED TIME', '#c8e0ff', 16);
  };
  // Trophy Hunter's shield soaks damage first. Returns what gets through.
  TF.absorb = function (dmg) {
    const sh = TF.shield;
    if (!sh || dmg <= 0) return dmg;
    const take = Math.min(sh.hp, dmg);
    sh.hp -= take;
    F.num(P.x, 2.6, P.z, '-' + Math.max(1, Math.round(take)), '#bfe8ff', 13);
    if (sh.hp <= 0.5) { TF.shield = null; F.ring(P.x, P.z, { r0: 0.4, r1: 1.8, life: 0.3, color: 0xbfe8ff }); A.play('shatter'); }
    return dmg - take;
  };
  // A blocked hit. dmg: what it would have dealt.
  TF.onBlock = function (dmg) {
    const s = G.stats, D = fx().divineShield, B = fx().bleedBlock, BF = fx().blockBloodlust;
    // Riposte: blocking charges the next attack
    const RP = fx().riposte;
    if (RP && ready('riposte') && !TF.riposte) {
      startCd('riposte', RP.cooldown); TF.riposte = true;
      F.ring(P.x, P.z, { r0: 0.3, r1: 1.6, life: 0.3, color: 0xffd27a }); F.num(P.x, 3.4, P.z, 'RIPOSTE READY', '#ffd27a', 13);
    }
    // Battle Fury: blocking grants a short Bloodlust
    if (BF && ready('blockBloodlust')) { startCd('blockBloodlust', BF.cooldown); G.playerSys.addBuff(BF.buff, BF.duration); A.play('warcry'); }
    if (D && ready('divineShield') && dmg > s.maxHp * D.threshold) {
      startCd('divineShield', D.cooldown);
      TF.holy = { t: D.duration, dur: D.duration, dmg, tick: 0, r: D.radius };
      F.flash('#fff6c0', 0.35); F.ring(P.x, P.z, { r0: 0.5, r1: D.radius, life: 0.5, color: 0xffe080 }); A.play('holy');
      F.num(P.x, 3.2, P.z, 'DIVINE SHIELD', '#ffe080', 15);
    }
    if (B && ready('bleedBlock')) {
      let src = null;
      ES.query(P.x, P.z, B.near + 3, (e) => {
        if (e.dead || !e.bleed.length || Math.hypot(e.x - P.x, e.z - P.z) > B.near + e.r) return;
        if (!src || G.combat.topBleed(e).dps > G.combat.topBleed(src).dps) src = e;
      });
      if (src) {
        startCd('bleedBlock', B.cooldown);
        const n = TF.spreadBleed(src, B.radius);
        F.num(src.x, 2.4, src.z, `BLEED ×${n}`, '#ff5a4a', 14);
      }
    }
  };
  // The attack a block charged (combat.js C.attack): Riposte's numbers, or null.
  TF.takeRiposte = function () {
    if (!TF.riposte) return null;
    TF.riposte = false;
    return fx().riposte || null;
  };
  // Copies e's strongest bleed onto every monster within r of it (into a free bleed stack, or over a weaker
  // bleed: never weakening a stronger one). Returns how many.
  TF.spreadBleed = function (e, r) {
    const b = G.combat.topBleed(e) || e.lastBleed;
    if (!b) return 0;
    let n = 0;
    F.ring(e.x, e.z, { r0: 0.4, r1: r, life: 0.45, color: 0xc01a10 });
    ES.query(e.x, e.z, r + 3, (o) => {
      if (o === e || o.dead || o.dotImmune || Math.hypot(o.x - e.x, o.z - e.z) > r + o.r) return;
      const top = G.combat.topBleed(o);
      if (top && top.dps >= b.dps && o.bleed.length >= G.combat.bleedStacks()) return;
      const nb = Object.assign({}, b, { t: Math.max(b.t, 1) });
      if (!G.combat.addBleed(o, nb)) return;
      o.lastBleed = nb;
      F.streak(e.x, 1, e.z, o.x, 1 + o.y, o.z, 0xc01a10, 0.3, 0.12);
      n++;
    });
    return n;
  };
  // After a weapon hit (combat.js C.hit): Toxic Detonation bursts the monster's poisons; Pent-Up Fury's
  // charged hit explodes.
  TF.afterHit = function (e, dmg) {
    const f = fx(), PB = f.poisonBurst, TB = f.trinketBlast;
    if (PB && ready('poisonBurst') && e.poison.length && !e.dead) {
      startCd('poisonBurst', PB.cooldown);
      const n = e.poison.length, v = e.poison.reduce((a, p) => a + p.dps, 0) * PB.mult, r = Math.min(PB.maxRadius, Math.max(1, n)), x = e.x, z = e.z;
      e.poison.length = 0;
      F.explosion(x, z, r, 0x7adf3a); F.burst(x, 1, z, { n: 30, color: [0x5ad83a, 0x8aef4a, 0x2a6a1a], speed: 3 + r, life: 0.9, size: 0.3, drag: 3 });
      F.num(x, 2.6 * e.scale + e.y, z, `BURST ×${n}`, '#9dff6a', 16); A.play('explode'); F.shake(Math.min(0.5, 0.1 + r * 0.03));
      ES.query(x, z, r + 3, (o) => { if (!o.dead && Math.hypot(o.x - x, o.z - z) < r + o.r) C.damage(o, v, 'poison', 'poison', 'poisonBurst'); });
    }
    if (TB && TF.blastArmed && !e.dead) {
      TF.blastArmed = false;
      const v = dmg * TB.mult * C.mult('chargedBlast'), x = e.x, z = e.z;
      F.explosion(x, z, TB.radius, 0xffb040); F.flash('#ffd27a', 0.15); F.shake(0.3); A.play('explode');
      ES.query(x, z, TB.radius + 3, (o) => { if (!o.dead && Math.hypot(o.x - x, o.z - z) < TB.radius + o.r) C.elementalHit(o, v, 'chargedBlast'); });
    }
  };
  // A shield, or more of the one you have (it lasts at least dur seconds).
  function shieldUp(hp, dur, cap = Infinity) {
    const sh = TF.shield;
    if (!sh) TF.shield = { hp: Math.min(cap, hp), max: Math.min(cap, hp), t: dur, dur };
    else { sh.hp = Math.min(Math.max(cap, sh.hp), sh.hp + hp); sh.max = Math.max(sh.max, sh.hp); sh.t = Math.max(sh.t, dur); sh.dur = Math.max(sh.dur, sh.t); }
  }
  // Sanctified Hide (combat.js C.damage): a share of your holy damage becomes a shield.
  TF.leech = function (dmg) {
    const L = fx().holyLeech;
    if (!L || dmg <= 0 || P.dead) return;
    const cap = G.stats.maxHp * L.cap;
    if (TF.shield && TF.shield.hp >= cap) { TF.shield.t = Math.max(TF.shield.t, L.duration); return; }
    shieldUp(dmg * L.share, L.duration, cap);
  };
  // Using your trinket (trinkets.js TR.use): Sacred Ward makes you untouchable, Pent-Up Fury charges your next hit.
  TF.onTrinketUse = function () {
    const f = fx();
    if (f.trinketInvuln) { P.invuln = Math.max(P.invuln, f.trinketInvuln.duration); F.ring(P.x, P.z, { r0: 0.5, r1: 2.6, life: 0.5, color: 0xfff0b0 }); F.num(P.x, 3.8, P.z, 'SACRED WARD', '#fff0b0', 14); }
    if (f.trinketBlast && ready('trinketBlast')) { startCd('trinketBlast', f.trinketBlast.cooldown); TF.blastArmed = true; F.ring(P.x, P.z, { r0: 0.3, r1: 1.8, life: 0.4, color: 0xffb040 }); }
  };
  // Stunned or rooted (playerSys.addStatus): Unbreakable.
  TF.onCC = function () {
    const U2 = fx().ccShield;
    if (!U2 || !ready('ccShield') || P.dead) return;
    startCd('ccShield', U2.cooldown);
    shieldUp(G.stats.maxHp * U2.share, U2.duration);
    F.ring(P.x, P.z, { r0: 0.4, r1: 2.2, life: 0.45, color: 0xbfe8ff }); F.num(P.x, 3.6, P.z, 'UNBREAKABLE', '#bfe8ff', 15); A.play('block');
  };
  // Going down into a dungeon (dungeon.js): Dungeon Delver.
  TF.onDungeon = function () {
    const D = fx().dungeonShield;
    if (D) shieldUp(G.stats.maxHp * D.share, D.duration);
  };
  // Healing taken (after Warm Milk): Purring Wrath stores it to burn monsters near you.
  TF.onHeal = function (n) {
    const H = fx().healBurst;
    if (H) TF.healAcc += n * H.share * H.mult;
  };
  // A monster died. by: the damage kind that killed it.
  TF.onKill = function (e) {
    const s = G.stats, f = s.fx;
    if (f.zealotry && ready('zealotry')) TF.kills.push(TF.t);
    if (f.killFrenzy) TF.frenzy.push(TF.t);
    TF.killLog.push(TF.t);
    // Giant Slayer's Frenzy: more than 2 bosses down within 2 seconds
    const GS = f.bossKillBloodlust;
    if (GS && e.boss) {
      TF.bossLog.push(TF.t);
      while (TF.bossLog.length && TF.bossLog[0] < TF.t - GS.window) TF.bossLog.shift();
      if (TF.bossLog.length >= GS.kills) { TF.bossLog.length = 0; G.playerSys.addBuff(GS.buff, GS.duration); A.play('warcry'); F.num(P.x, 3.4, P.z, 'GIANT SLAYER!', '#ff6a3a', 18); }
    }
    const rare = e.elite || e.rareMob || e.invader || e.rare;
    if (f.rareShield && rare) {
      const v = s.maxHp * f.rareShield.share;
      if (!TF.shield || TF.shield.hp < v) TF.shield = { hp: v, max: v, t: f.rareShield.duration, dur: f.rareShield.duration };
      else TF.shield.t = f.rareShield.duration;
      F.ring(P.x, P.z, { r0: 0.4, r1: 1.6, life: 0.4, color: 0xbfe8ff }); A.play('block');
    }
    if (f.phlebotomist && (e.bleed.length || e.killedBy === 'bleed') && Math.random() < f.phlebotomist.chance) {
      const R = f.phlebotomist.radius;
      F.burst(e.x, 0.9 + e.y, e.z, { n: 46, color: [0xc01a10, 0x8a0c06, 0xff3a2a], speed: 11, life: 0.9, size: 0.2 * Math.max(1, e.scale), grav: 14 });
      F.burst(e.x, 0.6, e.z, { n: 18, color: [0xff4a3a, 0xffa090], glow: true, speed: 6, life: 0.35, size: 0.16 });
      F.disc(e.x, e.z, 1.6 * Math.max(1, e.scale), 3, 0x7a0a06, 0.6); F.shake(0.12);
      A.play('bloodburst');
      TF.spreadBleed(e, R);
    }
    // Plague Feast: health for every poison stack on the monster
    const PF = f.poisonKillHeal;
    if (PF && e.poison.length && !e.dummy) G.playerSys.heal(e.poison.length * PF.perStack, e.poison.length >= 5);
    // Blood Inheritance: a boss that dies bleeding passes its bleed on to the nearest monster
    const BI = f.bossBleedSpread;
    if (BI && e.boss && e.bleed.length) {
      const o = ES.nearest(e.x, e.z, BI.range, [e.id]), b = G.combat.topBleed(e), nb = Object.assign({}, b, { t: Math.max(b.t, 1) });
      if (o && G.combat.addBleed(o, nb)) {
        o.lastBleed = nb;
        F.streak(e.x, 1.5, e.z, o.x, 1 + o.y, o.z, 0xc01a10, 0.5, 0.2); F.num(o.x, 2.4 * o.scale + o.y, o.z, 'INHERITED', '#ff5a4a', 14);
      }
    }
  };
  // Bane of Legends: execute bosses below the threshold (combat.js C.damage).
  TF.execute = function (e) {
    const B = fx().baneOfLegends;
    if (!B || !e.boss || e.dead || e.hp <= 0 || e.hp > e.maxHp * B.execute) return false;
    F.num(e.x, 2.6 * e.scale + e.y, e.z, 'EXECUTED', '#ffd04a', 22, true); F.flash('#ffe0a0', 0.25); A.play('crit');
    return true;
  };
  // A bleed was put on e (combat.js C.bleed): Bleeding from the Ears may cripple it.
  // Crippling: Bleeding from the Ears' numbers, or (under Apostasy) its defaults with every bleed crippling.
  TF.cripple = () => fx().crippling || (G.chests.apostate() ? G.EFFECTS.crippling : null);
  TF.onBleed = function (e, b) {
    e.lastBleed = b;
    const Cr = TF.cripple();
    if (Cr && (G.chests.apostate() || Math.random() < Cr.chance)) {
      if (!(e.crippled > 0)) F.num(e.x, 2 * e.scale + e.y, e.z, 'CRIPPLED', '#ff5a4a', 12);
      e.crippled = Math.max(e.crippled || 0, b.t);
    }
  };
  TF.slow = (e) => { const Cr = e.crippled > 0 && TF.cripple(); return Cr ? 1 - Cr.slow : 1; };

  // ---------- per frame ----------
  TF.update = function (dt) {
    const s = G.stats, f = s.fx;
    TF.t += dt;
    TF.hasteT = Math.max(0, TF.hasteT - dt);
    // Tinkerer: a free workbench upgrade every so often while you fight
    if (f.freeUpgrade && G.phase === 'fight' && (TF.freeT += dt) >= f.freeUpgrade.every) {
      TF.freeT -= f.freeUpgrade.every; G.run.freeUpgrades = (G.run.freeUpgrades || 0) + 1;
      G.ui.toast(`Tinkerer: a free item level upgrade at the workbench (${G.run.freeUpgrades} waiting)`, '#ffd27a');
    }
    while (TF.killLog.length && TF.killLog[0] < TF.t - 10) TF.killLog.shift();
    // In the Thick of It: count the monsters around you a few times a second
    if (f.crowdArmor && (TF.crowdT -= dt) <= 0) {
      TF.crowdT = 0.25;
      let n = 0;
      const R = f.crowdArmor.radius;
      ES.query(P.x, P.z, R + 2, (e) => { if (!e.dead && !e.dummy && Math.hypot(e.x - P.x, e.z - P.z) < R + e.r) n++; });
      TF.crowd = n;
    } else if (!f.crowdArmor) TF.crowd = 0;
    // Iron Hide: a shield every few seconds while you wield a melee weapon
    const IH = f.meleeShield;
    if (IH && G.stats.weapon.class === 'melee' && !P.dead && (TF.meleeT -= dt) <= 0) {
      TF.meleeT = IH.every;
      const v = G.stats.maxHp * IH.share;
      if (!TF.shield || TF.shield.hp < v) TF.shield = { hp: v, max: v, t: IH.duration, dur: IH.duration };
      F.ring(P.x, P.z, { r0: 0.4, r1: 1.6, life: 0.35, color: 0xbfe8ff }); A.play('block');
    }
    if (f.killFrenzy) { const R = f.killFrenzy.recent; while (TF.frenzy.length && TF.frenzy[0] < TF.t - R) TF.frenzy.shift(); } else TF.frenzy.length = 0;
    for (const k in TF.cd) {
      // Unending Zealotry: Otherworldly Thirst recharges faster while Zealotry is going
      const k2 = k === 'thirst' && f.unendingZealotry && TF.zeal() > 0 ? 1 / (1 - f.unendingZealotry.thirstCdr) : 1;
      if ((TF.cd[k] -= dt * k2) <= 0) delete TF.cd[k];
    }
    if (f.zealotry) { const R = f.zealotry.recently; while (TF.kills.length && TF.kills[0] < TF.t - R) TF.kills.shift(); }
    if (TF.shield && (TF.shield.t -= dt) <= 0) TF.shield = null;
    if (P.dead || G.state !== 'playing') return;
    // Burning Bridges: fire on the ground behind you
    const BB = f.burningBridges;
    if (BB && P.moving > 0.4 && (TF.trailT -= dt) <= 0) {
      TF.trailT = BB.every;
      const bx = P.x - Math.sin(P.yaw) * 0.6, bz = P.z - Math.cos(P.yaw) * 0.6;
      C.puddles.push({ x: bx, z: bz, r: BB.radius, t: BB.life, tick: 0, every: BB.tick, dmg: s.maxHp * BB.damage * C.mult('fire'), fire: true });
      F.disc(bx, bz, BB.radius, BB.life, 0xff6a1a, 0.45);
    }
    // Divine Shield: holy fire around you
    const H = TF.holy;
    if (H) {
      H.t -= dt; H.tick -= dt;
      if (Math.random() < dt * 30) { const a = Math.random() * Math.PI * 2, r = Math.random() * H.r; F.rise(P.x + Math.cos(a) * r, 0.1, P.z + Math.sin(a) * r, 0xffe080, 1, 0.2, 2.4, 0.14, 0.6); }
      if (H.tick <= 0) {
        H.tick = 0.5;
        F.ring(P.x, P.z, { r0: H.r * 0.4, r1: H.r, life: 0.3, color: 0xffe080 });
        const hd = H.dmg * 0.5 * C.mult('holyGround');
        ES.query(P.x, P.z, H.r + 3, (e) => { if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < H.r + e.r) C.damage(e, hd, 'holy', 'elemental', 'holyGround'); });
      }
      if (H.t <= 0) TF.holy = null;
    }
    // Purring Wrath: stored healing burns monsters near you twice a second
    if (f.healBurst && (TF.healT -= dt) <= 0) {
      TF.healT = 0.5;
      const v = TF.healAcc, R = f.healBurst.radius;
      TF.healAcc = 0;
      if (v >= 1) {
        let hit = 0;
        const wd = v * C.mult('wrath');
        ES.query(P.x, P.z, R + 3, (e) => { if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < R + e.r) { C.elementalHit(e, wd, 'wrath'); hit++; } });
        if (hit) F.ring(P.x, P.z, { r0: 0.4, r1: R, life: 0.3, color: 0x7dff7a });
      }
    } else if (!f.healBurst) TF.healAcc = 0;
    // Experimenting on Humans and Bleeding from the Ears
    const EX = f.experimenting, CR = TF.cripple();
    if (EX || CR) for (const e of ES.list) {
      if (e.dead) continue;
      e.experiment = !!EX && e.bleed.length > 0 && e.poison.length > 0;
      if (e.experiment) e.st.root = Math.max(e.st.root || 0, 0.2);
      if (e.crippled > 0) {
        if (!CR || !e.bleed.length) { e.crippled = 0; continue; }
        e.crippled -= dt;
        e.trailT = (e.trailT || 0) - dt;
        if (e.trailT <= 0 && Math.hypot(e.vx, e.vz) > 0.4 && e.y < 1.5 && C.puddles.length < 160) {
          e.trailT = 0.4;
          C.puddles.push({ x: e.x, z: e.z, r: 0.9 * Math.max(1, e.scale), t: 3, tick: 0.5, dmg: G.combat.topBleed(e).dps * CR.trail * 0.5, blood: true, src: e.id });
          F.disc(e.x, e.z, 0.9 * Math.max(1, e.scale), 3, 0x7a0a06, 0.55);
        }
      }
    }
  };

  // Divine Finale: when a trinket's effect ends you explode, setting everything around you on holy fire.
  TF.onTrinketEnd = function () {
    const B = fx().trinketEndBlast, s = G.stats;
    if (!B || P.dead) return;
    const H = G.DOTS.holy;
    F.explosion(P.x, P.z, B.radius, 0xffe8a0); F.ring(P.x, P.z, { r0: 0.5, r1: B.radius + 1, life: 0.5, color: 0xfff0b0 });
    F.streak(P.x, 0.2, P.z, P.x, 6.5, P.z, 0xffe080, 0.5, 0.45); F.streak(P.x - 1.5, 4.6, P.z, P.x + 1.5, 4.6, P.z, 0xffe080, 0.5, 0.45);
    A.play('holyBlast');
    ES.query(P.x, P.z, B.radius + 3, (e) => {
      if (e.dead || Math.hypot(e.x - P.x, e.z - P.z) > B.radius + e.r) return;
      C.elementalHit(e, s.dmg * B.damage * C.mult('holyNova'), 'holyNova');
      C.burn(e, s.dmg * B.burn * C.mult('holyFire'), H.duration, 'scaled');
    });
  };

  // ---------- buff bar ----------
  // One chip per learned effect talent: { id, name, icon, color, text (short label), fill (share of a
  // cooldown still to go, drawn as a shade), active, lines (tooltip) }.
  TF.chips = function () {
    const s = G.stats, f = s.fx, out = [], TL = G.talents;
    for (const t of TL.all()) {
      if (!t.effect || !TL.rank(t.id) || t.start) continue;
      const id = t.effect.id, E = t.effect, cd = TF.cd[id] || 0;
      const c = { id: t.id, name: t.name, icon: t.icon, color: t.currency === 'spoon' ? G.CURRENCIES.spoon.color : '#f2c04e', text: '', fill: 0, active: false, lines: [t.text] };
      const cool = (total) => { if (cd > 0) { c.fill = cd / total; c.text = cd < 9.95 ? cd.toFixed(1) : String(Math.ceil(cd)); c.lines.push(`Recharging · ${cd.toFixed(1)}s`); } else { c.active = true; c.lines.push('Ready'); } };
      switch (id) {
        case 'lastStand': cool(E.cooldown); break;
        case 'bleedBlock': cool(E.cooldown); break;
        case 'thirst': cool(E.cooldown); break;
        case 'trinketOnKill': { const k = G.trinkets.killT; if (k > 0) { c.fill = k / E.cooldown; c.text = k.toFixed(1); c.lines.push(`Recharging · ${k.toFixed(1)}s`); } else { c.active = true; c.lines.push('Ready'); } break; }
        case 'divineShield':
          if (TF.holy) { c.active = true; c.text = TF.holy.t.toFixed(1); c.fill = 1 - TF.holy.t / TF.holy.dur; c.lines.push(`Holy fire for ${TF.holy.t.toFixed(1)}s more`); } else cool(E.cooldown);
          break;
        case 'zealotry': {
          if (cd > 0) cool(E.cooldown);
          else { const z = TF.zeal(); c.active = z > 0; c.text = z ? `+${Math.round(z * 100)}%` : ''; c.lines.push(`${TF.kills.length} kills in the last ${E.recently}s · +${Math.round(z * 100)}% attack speed`); }
          break;
        }
        case 'unendingZealotry': { const z = TF.critBonus(); c.active = z > 0; c.text = z ? `+${Math.round(z * 100)}%` : ''; c.lines.push(`+${Math.round(z * 100)}% increased crit chance`); break; }
        case 'doubleStrike': c.text = `${TF.attacks}/${E.every}`; c.active = TF.attacks === E.every - 1; break;
        case 'rareShield': if (TF.shield) { c.active = true; c.text = String(Math.ceil(TF.shield.hp)); c.fill = 1 - TF.shield.t / TF.shield.dur; c.lines.push(`Shield ${Math.ceil(TF.shield.hp)} / ${Math.round(TF.shield.max)} · ${TF.shield.t.toFixed(1)}s left`); } break;
        case 'healBurst': c.active = TF.healAcc > 0; break;
        case 'fortitude': c.text = `+${Math.round(s.blockChance * 100)}%`; c.lines.push(`+${Math.round(s.blockChance * 100)}% max health from block chance`); break;
        case 'infusedFlesh': c.text = `+${Math.round(s.maxHp * E.share)}`; c.lines.push(`+${Math.round(s.maxHp * E.share)} elemental damage per hit`); break;
        case 'ragingBull': c.active = !!P.buffs[E.buff]; break;
        case 'hitShield': cool(E.cooldown); break;
        case 'blockBloodlust': cool(E.cooldown); break;
        case 'hitTrinketHaste':
          if (TF.hasteT > 0) { c.active = true; c.text = TF.hasteT.toFixed(1); c.lines.push(`Trinket recharging ${Math.round((1 + E.mult) * 100)}% speed · ${TF.hasteT.toFixed(1)}s`); } else cool(E.cooldown);
          break;
        case 'trinketCdBuff': c.active = trinketCd(); c.lines.push(c.active ? `+${Math.round(E.move * 100)}% movement speed, +${Math.round(E.armor * 100)}% increased armor` : 'Waiting for your trinket to be used'); break;
        case 'killFrenzy': c.active = frenzyOn(); c.text = `${Math.min(TF.frenzy.length, E.kills)}/${E.kills}`; c.lines.push(`${TF.frenzy.length} kills in the last ${E.recent}s`); break;
        case 'fifthStrike': c.active = TF.empower; c.text = TF.empower ? '!' : `${TF.fifth}/${E.every}`; break;
        case 'hitBlock': { const on = TF.t - TF.lastHit < E.recent; c.active = on; if (on) { c.text = (E.recent - (TF.t - TF.lastHit)).toFixed(1); c.lines.push(`+${Math.round(E.block * 100)}% block chance`); } break; }
        case 'speedCrit': { const v = TF.critBonus() - (fx().unendingZealotry ? TF.zeal() : 0); c.active = v > 0; c.text = v > 0 ? `+${Math.round(v * 100)}%` : ''; c.lines.push(`+${Math.round(v * 100)}% increased crit chance from movement speed`); break; }
        case 'lightningProc': c.lines.push(`${Math.round(E.chance * 100)}% chance per hit`); break;
        case 'meleeShield':
          if (G.stats.weapon.class !== 'melee') c.lines.push('Needs a melee weapon');
          else { c.fill = TF.meleeT / E.every; c.text = TF.meleeT.toFixed(1); c.active = !!TF.shield; c.lines.push(`Next shield in ${TF.meleeT.toFixed(1)}s`); }
          break;
        case 'bossKillBloodlust': c.text = TF.bossLog.length ? `${TF.bossLog.length}/${E.kills}` : ''; break;
        case 'swordBlock': { const v = swordBlock(); c.active = v > 0; c.text = v ? `+${Math.round(v * 100)}%` : ''; c.lines.push(E.weapons.includes(G.stats.wtype) ? `+${Math.round(v * 100)}% block chance` : 'Needs a sword'); break; }
        case 'lowHpTimeStop': cool(E.cooldown); break;
        case 'crowdArmor': c.active = crowded(); c.text = String(TF.crowd); c.lines.push(`${TF.crowd} monsters within ${E.radius} m${crowded() ? ` · +${Math.round(E.armor * 100)}% increased armor` : ''}`); break;
        case 'trinketEndBlast': c.active = G.trinkets.effectOn; break;
        case 'poisonBurst': cool(E.cooldown); break;
        case 'trinketBlast': if (TF.blastArmed) { c.active = true; c.text = '!'; c.lines.push('Your next hit explodes'); } else cool(E.cooldown); break;
        case 'ccShield': cool(E.cooldown); break;
        case 'fifthCrit': c.active = TF.critN === E.every - 1; c.text = `${TF.critN}/${E.every}`; break;
        case 'fifthRicochet': c.active = TF.ricoNext; c.text = TF.ricoNext ? '!' : `${TF.ricoN}/${E.every}`; break;
        case 'freeUpgrade': { const n = G.run.freeUpgrades || 0; c.active = n > 0; c.text = n ? String(n) : ''; c.fill = 1 - TF.freeT / E.every; c.lines.push(`${n} free upgrade${n === 1 ? '' : 's'} waiting · the next in ${Math.ceil(E.every - TF.freeT)}s of fighting`); break; }
        case 'riposte': if (TF.riposte) { c.active = true; c.text = '!'; c.lines.push('Your next attack: ×' + E.mult + ' damage, +' + Math.round(E.area * 100) + '% area'); } else if (cd > 0) cool(E.cooldown); else c.lines.push('Block a hit to charge it'); break;
        case 'holyLeech': if (TF.shield) { c.active = true; c.text = String(Math.ceil(TF.shield.hp)); c.lines.push(`Shield ${Math.ceil(TF.shield.hp)}`); } break;
        default: break;
      }
      out.push(c);
    }
    return out;
  };
})();
