'use strict';
// Data: loads the JSON files in data/, fills in defaults, checks cross-references and builds the
// tables the game reads (G.RARITY, G.UPGRADES, G.WEAPONS, G.ENEMIES, G.MODIFIERS, G.MAPS, ...).
// Stat keys, enemy AIs, models and icons are engine features, so they are listed here and in each
// file's "_help" block. Every number and name is tuned from the JSON.
(function () {
  const U = G.U;

  // ---------- engine vocabulary ----------
  // Every stat the game understands. name: text after the number · label: row title · pct: shown as
  // a percentage · dec: decimals · neg: shown as a reduction · plural: whole-number stat with
  // singular/plural names · max: the strongest value wins instead of adding up · local: a weapon
  // affix that changes that weapon's own numbers instead of adding to your stats.
  G.STATS = {
    maxHp: { label: 'Max health', name: 'max health' },
    moveSpeed: { label: 'Base move speed', name: 'base move speed', dec: 1 },
    moveMult: { label: 'Move speed', name: 'move speed', pct: true },
    dmgMult: { label: 'Damage bonus', name: 'damage', pct: true },
    atkSpeed: { label: 'Attack speed', name: 'attack speed', pct: true },
    weaponCrit: { label: 'Weapon base crit', name: 'base crit chance on your weapon', pct: true, dec: 1 },
    critChance: { label: 'Increased crit chance', name: 'increased crit chance', pct: true },
    critMult: { label: 'Crit multiplier', name: 'crit multiplier', pct: true },
    projectiles: { label: 'Projectiles', name: 'projectile', plural: 'projectiles' },
    area: { label: 'Area bonus', name: 'attack area', pct: true },
    poisonChance: { label: 'Poison chance', name: 'poison chance', pct: true },
    poisonDmg: { label: 'Poison damage', name: 'poison damage', pct: true },
    bleedChance: { label: 'Bleed chance', name: 'bleed chance', pct: true },
    dotDmg: { label: 'DoT damage', name: 'damage over time', pct: true },
    blockRating: { label: 'Block rating', name: 'block rating' },
    blockHeal: { label: 'Heal on block', name: 'heal on block', pct: true, dec: 1 },
    regen: { label: 'Regen per 5s', name: 'health every 5s', dec: 1 },
    ricochetChance: { label: 'Ricochet chance', name: 'ricochet chance', pct: true },
    chains: { label: 'Ricochet chains', name: 'ricochet bounce', plural: 'ricochet bounces' },
    explodeChance: { label: 'Explode chance', name: 'chance to explode on kill', pct: true },
    explodePower: { label: 'Explosion power', name: 'explosion power', pct: true, max: true },
    magnet: { label: 'Pickup bonus', name: 'pickup radius', pct: true },
    luck: { label: 'Luck', name: 'luck' },
    armor: { label: 'Armor', name: 'armor' },
    lifeOnKill: { label: 'Health per kill', name: 'health per kill', dec: 1 },
    xpGain: { label: 'XP gain', name: 'experience gained', pct: true },
    dashCdr: { label: 'Dash cooldown', name: 'dash cooldown', pct: true, neg: true },
    bossDmg: { label: 'Golem damage', name: 'damage to golems', pct: true },
    dashStrike: { label: 'Dash strike', name: 'of hit damage to monsters you dash through', pct: true },
    extraLives: { label: 'Extra lives', name: 'extra life per run', plural: 'extra lives per run' },
    choices: { label: 'Blessing choices', name: 'blessing choice', plural: 'blessing choices' },
    rerolls: { label: 'Rerolls', name: 'reroll per run', plural: 'rerolls per run' },
    slowChance: { label: 'Slow chance', name: 'chance to slow', pct: true },
    shockChance: { label: 'Shock chance', name: 'chance for elemental hits to shock', pct: true },
    stunChance: { label: 'Stun chance', name: 'chance to stun', pct: true },
    rootChance: { label: 'Root chance', name: 'chance to root', pct: true },
    statusResist: { label: 'Status resistance', name: 'shorter slows, shocks, stuns and roots on you', pct: true },
    stunnedDmg: { label: 'Damage to stunned', name: 'damage to stunned monsters', pct: true },
    shockedElem: { label: 'Elemental vs shocked', name: 'of hit damage as bonus elemental damage to shocked monsters', pct: true },
    slowedElem: { label: 'Elemental vs slowed', name: 'of hit damage as bonus elemental damage to slowed monsters', pct: true },
    rootedElem: { label: 'Elemental vs rooted', name: 'of hit damage as bonus elemental damage to rooted monsters', pct: true },
    acidChance: { label: 'Acid burst chance', name: 'chance for kills to burst into acid', pct: true },
    flatElem: { label: 'Flat elemental', name: 'elemental damage on every hit' },
    bleedDmg: { label: 'Bleed damage', name: 'bleed damage', pct: true },
    elemDmg: { label: 'Elemental damage', name: 'elemental damage', pct: true },
    healTaken: { label: 'Healing taken', name: 'healing taken', pct: true },
    trinketCdr: { label: 'Trinket recovery', name: 'faster trinket recovery', pct: true },
    trinketCharges: { label: 'Trinket charges', name: 'trinket charge', plural: 'trinket charges' },
    weaponDmgInc: { label: 'Increased weapon damage', name: 'increased weapon damage', pct: true },
    maxHpInc: { label: 'Increased health', name: 'increased max health', pct: true },
    armorInc: { label: 'Increased armor', name: 'increased armor', pct: true },
    armorMult: { label: 'More armor', name: 'more armor', pct: true },
    bleedPerHp: { label: 'Bleed per health', name: 'bleed damage per 100 max health', pct: true, dec: 1, tpl: '{v} increased bleeding damage per 100 max health' },
    poisonPerArmor: { label: 'Poison per armor', name: 'poison damage per 100 armor', pct: true, dec: 1, tpl: '{v} increased poison damage per 100 armor' },
    armorPerPoisoned: { label: 'Armor per poisoned', name: 'increased armor per poisoned monster', pct: true, dec: 1, tpl: '{v} increased armor per monster infected with poison' },
    gunDmgPerAttack: { label: 'Gun damage per attack', name: 'gun damage per recent attack', pct: true, dec: 1, tpl: '{v} increased gun damage per attack fired recently' },
    meleeDmgPerAttack: { label: 'Melee damage per attack', name: 'melee damage per recent attack', pct: true, dec: 1, tpl: '{v} increased melee damage per attack made recently' },
    shockSlow: { label: 'Shock slow', name: 'slow on monsters you shock', pct: true, tpl: 'Monsters you shock are slowed by {u}' },
    firearmDmg: { label: 'Firearm damage', name: 'damage with firearms', pct: true },
    magicDmg: { label: 'Magic damage', name: 'damage with magical weapons', pct: true },
    meleeDmg: { label: 'Melee damage', name: 'damage with melee weapons', pct: true },
    essenceGain: { label: 'Essence gained', name: 'essence gained', pct: true },
    rerollDiscount: { label: 'Reroll discount', name: 'cheaper workbench rerolls', pct: true },
    lifeOnKillPct: { label: 'Max health per kill', name: 'of your max health back per kill', pct: true, dec: 1 },
    dashCharges: { label: 'Dash charges', name: 'dash charge', plural: 'dash charges' },
    wDmg: { label: 'Weapon damage', name: 'increased weapon damage', pct: true, local: true },
    wSpeed: { label: 'Weapon attack speed', name: 'weapon attack speed', pct: true, local: true },
    wCrit: { label: 'Weapon crit chance', name: 'increased weapon crit chance', pct: true, local: true },
  };
  // Talent effects (cat_talents.json "effect"): rules that are more than a stat, with their default
  // numbers. A talent's effect can override any of them.
  G.EFFECTS = {
    ragingBull: { chance: 0.3, buff: 'raging_bull', extend: 5, bleedMult: 2 },
    experiencedPrecision: { doublecritMult: 2 },
    livingFlesh: { maxHpMult: 0.5, regen: 0.1 },
    bombBattalion: { power: 10, radius: 9, blockCap: 0.25 },
    chainLightning: { chainsMult: 0.5, elemental: 0.5, beam: 0.5 },
    dashBuff: { buff: 'feline_swiftness' },
    slowAura: { radius: 5, power: 0.1 },
    lastStand: { threshold: 0.5, radius: 5, stun: 5, cooldown: 120 },
    rareShield: { share: 0.2, duration: 10 },
    rootPoison: { stacks: 5 },
    bleedBlock: { near: 3, radius: 5, cooldown: 15 },
    healBurst: { share: 0.1, mult: 10, radius: 3 },
    doubleStrike: { every: 5 },
    trinketOnKill: { seconds: 1, cooldown: 2 },
    multiPoison: {},
    hitShield: { share: 0.05, duration: 5, cooldown: 7 },
    hitTrinketHaste: { mult: 1, duration: 3, cooldown: 5 },
    trinketCdBuff: { move: 0.2, armor: 0.3 },
    blockBloodlust: { buff: 'bloodlust', duration: 3, cooldown: 10 },
    bleedCrit: {},
    killFrenzy: { kills: 5, recent: 4, move: 0.1, attackSpeed: 0.1 },
    fifthStrike: { every: 5, mult: 2 },
    hitBlock: { recent: 4, block: 0.1 },
    trinketEndBlast: { radius: 5, damage: 1, burn: 1 },
    speedCrit: {},
    lightningProc: { chance: 0.05, chains: 25, damage: 0.5 },
    meleeShield: { share: 0.1, duration: 3, every: 10 },
    bossKillBloodlust: { kills: 3, window: 2, buff: 'bloodlust', duration: 5 },
    swordBlock: { per: 0.01, cap: 0.25, recent: 4, weapons: ['sword', 'obsidian'] },
    lowHpTimeStop: { threshold: 0.2, cooldown: 600, trinket: 'pocketwatch' },
    crowdArmor: { count: 50, radius: 5, armor: 0.25 },
    festeringBleed: { duration: 2, ramp: 3 },
    poisonBurst: { mult: 2, cooldown: 20, maxRadius: 15 },
    fifthRicochet: { every: 5, bounces: 10 },
    fishFeast: { more: 0.5 },
    holyLeech: { share: 0.1, cap: 0.25, duration: 4 },
    ccShield: { share: 0.3, duration: 6, cooldown: 60 },
    trinketInvuln: { duration: 2 },
    freeUpgrade: { every: 120 },
    trinketBlast: { mult: 5, radius: 3, cooldown: 30 },
    dungeonShield: { share: 0.2, duration: 30 },
    fifthCrit: { every: 5 },
    bossBleedSpread: { range: 30 },
    poisonMaxHp: { share: 0.01 },
    poisonKillHeal: { perStack: 1 },
    poisonReversal: {},
    riposte: { mult: 3, area: 1.5, slow: 0.5, cooldown: 15 },
    // alien talents (inventory > Alien Talents)
    baneOfLegends: { more: 0.2, execute: 0.1 },
    thirst: { heal: 0.1, cooldown: 30 },
    zealotry: { perKill: 0.1, cap: 1, recently: 4, cooldown: 10 },
    unendingZealotry: { cap: 2, thirstCdr: 0.5 },
    burningBridges: { damage: 0.01, tick: 0.25, every: 0.3, life: 3, radius: 1.3 },
    fortitude: {},
    infusedFlesh: { share: 0.05 },
    divineShield: { threshold: 0.2, radius: 3, duration: 5, cooldown: 6 },
    savageHits: {},
    phlebotomist: { chance: 0.1, radius: 5 },
    experimenting: {},
    crippling: { chance: 0.1, slow: 0.7, trail: 0.1 },
  };
  // ---------- damage: types, tags and sources ----------
  // Every point of damage you deal has a type and comes from a source. A source carries tags (its type,
  // hit or damage over time, melee / firearm / magic for weapon hits, bleed, holy, explosion...), and a
  // stat in G.DMG_SCALING raises every source that carries its tag (each stat multiplies on its own).
  // Damage taken from a hit (a bleed, holy fire from a hit, bonus elemental damage) inherits that hit's
  // scaling, so it skips the G.DMG_INHERITED tags and only adds its own.
  G.DMG_TYPES = { physical: 'Physical', poison: 'Poison', elemental: 'Elemental' };
  G.TAGS = {
    physical: { name: 'Physical', color: '#e8d8c0', icon: 'sword', desc: 'Weapon hits (melee, firearm and magic weapons) and bleeding.' },
    poison: { name: 'Poison', color: '#8aef4a', icon: 'poison', desc: 'Poison stacks: damage over time based on the monster\'s health.' },
    elemental: { name: 'Elemental', color: '#7fe0ff', icon: 'bolt', desc: 'Lightning, fire, acid, explosions and holy fire. Only elemental hits can shock.' },
    hit: { name: 'Hit', color: '#ffd27a', icon: 'crosshair', desc: 'Damage dealt all at once. Hits can be critical (weapon hits only) and can inflict statuses.' },
    dot: { name: 'Damage over time', color: '#c8a0ff', icon: 'hourglass', desc: 'Ticks every half second. Never critical; cannot inflict poison, bleeding or shock.' },
    weapon: { name: 'Weapon', color: '#ffd27a', icon: 'sword', desc: 'Your weapon\'s own hits.' },
    melee: { name: 'Melee', color: '#ffb070', icon: 'sword', desc: 'Scythes, swords, daggers and knives.' },
    firearm: { name: 'Firearm', color: '#ffb070', icon: 'gun', desc: 'Shotguns, revolvers, the MP5 and the flamethrower.' },
    magic: { name: 'Magic', color: '#ffb070', icon: 'flask', desc: 'The poison flask, the poison dart blower, the Tome of Fireball and the Shrieking Scream.' },
    bleed: { name: 'Bleeding', color: '#ff5a4a', icon: 'blood', desc: 'Physical damage over time from physical hits.' },
    holy: { name: 'Holy', color: '#ffe080', icon: 'holycross', desc: 'Holy fire and holy light.' },
    explosion: { name: 'Explosion', color: '#ff9a3a', icon: 'bomb', desc: 'Damage to everything in an area at once.' },
    lightning: { name: 'Lightning', color: '#7fe0ff', icon: 'bolt', desc: 'Bolts that jump from monster to monster.' },
    fire: { name: 'Fire', color: '#ff8a3a', icon: 'flame', desc: 'Burning ground.' },
    acid: { name: 'Acid', color: '#c8ff3a', icon: 'flask', desc: 'Pools of alien acid.' },
    area: { name: 'Area', color: '#d8c8a8', icon: 'area', desc: 'Covers an area around something.' },
    trinket: { name: 'Trinket', color: '#ffe080', icon: 'star', desc: 'Comes from a trinket (F).' },
    talent: { name: 'Talent', color: '#8ff8ff', icon: 'totem', desc: 'Comes from a talent.' },
    curse: { name: 'Curse', color: '#c08aff', icon: 'voodoo', desc: 'Health lost to a curse: a fixed share of the monster\'s health that nothing raises or lowers.' },
    shock: { name: 'Shock', color: '#ffe14a', icon: 'bolt', desc: 'Shocked monsters take 10-50% more damage from everything.' },
    control: { name: 'Control', color: '#ffb070', icon: 'stars', desc: 'Freezes, stuns, slows, roots or lures monsters.' },
    buff: { name: 'Buff', color: '#9dff8a', icon: 'bloodlust', desc: 'Makes you stronger for a while.' },
    heal: { name: 'Healing', color: '#7dff7a', icon: 'heart', desc: 'Restores your health.' },
    defense: { name: 'Defense', color: '#8fd0ff', icon: 'shield', desc: 'Armor, block, shields and health.' },
    movement: { name: 'Movement', color: '#7fe0ff', icon: 'boot', desc: 'Moving and dashing.' },
    utility: { name: 'Utility', color: '#d8c8a8', icon: 'magnet', desc: 'Pickups, experience, luck and rerolls.' },
  };
  // stat → the tag it raises ('any' = every source)
  G.DMG_SCALING = [
    { stat: 'dmgMult', tag: 'any' }, { stat: 'weaponDmgInc', tag: 'weapon' }, { stat: 'meleeDmg', tag: 'melee' }, { stat: 'firearmDmg', tag: 'firearm' },
    { stat: 'magicDmg', tag: 'magic' }, { stat: 'poisonDmg', tag: 'poison' }, { stat: 'bleedDmg', tag: 'bleed' }, { stat: 'elemDmg', tag: 'elemental' }, { stat: 'dotDmg', tag: 'dot' },
  ];
  G.DMG_INHERITED = ['any', 'weapon', 'melee', 'firearm', 'magic'];
  // Tags for anything that raises stats or has an effect (talents, blessings, modifiers), for the Book of
  // Knowledge and tooltips: each stat and each talent effect names the tags it is about.
  const ST = (tags, ...stats) => Object.fromEntries(stats.map((k) => [k, tags]));
  G.STAT_TAGS = Object.assign({},
    ST(['poison'], 'poisonChance', 'poisonDmg'), ST(['physical', 'bleed'], 'bleedChance', 'bleedDmg', 'bleedPerHp'), ST(['poison'], 'poisonPerArmor'),
    ST(['elemental'], 'elemDmg', 'flatElem', 'shockedElem', 'slowedElem', 'rootedElem'), ST(['elemental', 'acid'], 'acidChance'), ST(['elemental', 'shock'], 'shockChance', 'shockSlow'),
    ST(['dot'], 'dotDmg'), ST(['elemental', 'explosion'], 'explodeChance', 'explodePower'), ST(['melee'], 'meleeDmg', 'meleeDmgPerAttack'), ST(['firearm'], 'firearmDmg', 'gunDmgPerAttack'), ST(['magic'], 'magicDmg'),
    ST(['weapon', 'hit'], 'dmgMult', 'critChance', 'critMult', 'weaponCrit', 'atkSpeed', 'projectiles', 'ricochetChance', 'chains', 'area', 'weaponDmgInc', 'bossDmg', 'stunnedDmg', 'wDmg', 'wSpeed', 'wCrit'),
    ST(['defense'], 'maxHp', 'maxHpInc', 'armor', 'armorInc', 'armorMult', 'blockRating', 'statusResist', 'extraLives', 'armorPerPoisoned'), ST(['defense', 'heal'], 'blockHeal', 'regen', 'healTaken', 'lifeOnKill', 'lifeOnKillPct'),
    ST(['movement'], 'moveMult', 'moveSpeed', 'dashCdr', 'dashCharges'), ST(['movement', 'hit'], 'dashStrike'), ST(['control'], 'slowChance', 'stunChance', 'rootChance'),
    ST(['utility'], 'magnet', 'luck', 'xpGain', 'rerolls', 'choices', 'essenceGain', 'rerollDiscount'), ST(['trinket'], 'trinketCdr', 'trinketCharges'));
  G.EFFECT_TAGS = {
    ragingBull: ['physical', 'bleed', 'buff'], experiencedPrecision: ['hit'], livingFlesh: ['defense', 'heal'], bombBattalion: ['elemental', 'explosion', 'defense'],
    chainLightning: ['elemental', 'lightning'], dashBuff: ['movement', 'buff'], slowAura: ['control', 'area'], lastStand: ['control', 'defense'], rareShield: ['defense'],
    rootPoison: ['poison', 'control'], bleedBlock: ['bleed', 'defense'], healBurst: ['elemental', 'heal', 'area'], doubleStrike: ['weapon', 'hit'], trinketOnKill: ['trinket'],
    multiPoison: ['poison'], hitShield: ['defense'], hitTrinketHaste: ['trinket'], trinketCdBuff: ['trinket', 'movement', 'defense'], blockBloodlust: ['defense', 'buff'],
    bleedCrit: ['bleed', 'hit'], killFrenzy: ['buff', 'movement'], fifthStrike: ['hit', 'control'], hitBlock: ['defense'], trinketEndBlast: ['elemental', 'holy', 'area', 'trinket'],
    speedCrit: ['movement', 'hit'], lightningProc: ['elemental', 'lightning', 'shock'], meleeShield: ['melee', 'defense'], bossKillBloodlust: ['buff'], swordBlock: ['melee', 'defense'],
    lowHpTimeStop: ['control', 'trinket'], crowdArmor: ['defense'], baneOfLegends: ['hit'], thirst: ['heal'], zealotry: ['buff'], unendingZealotry: ['buff'],
    burningBridges: ['elemental', 'fire', 'area'], fortitude: ['defense'], infusedFlesh: ['defense'], divineShield: ['elemental', 'holy', 'defense'], savageHits: ['physical', 'bleed'],
    phlebotomist: ['bleed'], experimenting: ['control'], crippling: ['bleed', 'control'],
    festeringBleed: ['physical', 'bleed', 'dot'], poisonBurst: ['poison', 'explosion', 'area'], fifthRicochet: ['weapon', 'hit'], fishFeast: ['heal'],
    holyLeech: ['holy', 'defense'], ccShield: ['defense', 'control'], trinketInvuln: ['trinket', 'defense'], freeUpgrade: ['utility'],
    trinketBlast: ['trinket', 'explosion', 'elemental'], dungeonShield: ['defense'], fifthCrit: ['hit'], bossBleedSpread: ['bleed'],
    poisonMaxHp: ['poison', 'dot'], poisonKillHeal: ['poison', 'heal'], poisonReversal: ['poison'], riposte: ['melee', 'hit', 'area', 'defense'],
  };
  // The tags of a set of stats plus an effect id (plus extra tags: a talent's rules), in G.TAGS order.
  G.tagsFor = function (stats, effectId, extra) {
    const set = new Set(extra || []);
    for (const k of Object.keys(stats || {})) for (const t of G.STAT_TAGS[k] || []) set.add(t);
    for (const t of G.EFFECT_TAGS[effectId] || []) set.add(t);
    return Object.keys(G.TAGS).filter((t) => set.has(t));
  };
  // kind: the damage number style. inherit: taken from a hit, so the hit's own scaling is already in it.
  G.DMG_SOURCES = {
    weapon: { name: 'Weapon hits', type: 'physical', tags: ['hit', 'weapon'], kind: 'hit', desc: 'Your weapon\'s hits, swings, bullets, pellets, darts, knives and ricochets. Also tagged with the weapon\'s class (melee, firearm or magic). Only these can be critical, poison and cause bleeding.' },
    bleed: { name: 'Bleeding', type: 'physical', tags: ['dot', 'bleed'], kind: 'bleed', inherit: true, desc: 'One bleed per monster: 150% of the hit that caused it, every second, for 5 seconds. A weaker bleed never replaces a stronger one.' },
    bloodTrail: { name: 'Blood trails', type: 'physical', tags: ['dot', 'bleed', 'talent'], kind: 'bleed', inherit: true, desc: 'Crippled monsters (Bleeding from the Ears) leave pools of blood that make the others bleed.' },
    bloodBurst: { name: 'Blood bursts', type: 'physical', tags: ['hit', 'explosion'], kind: 'explode', desc: 'Bleeding monsters exploding on death (the Serrated Dagger\'s implicit) and the spray of the ones the Tell-Tale Heart bursts.' },
    bloodPop: { name: 'Burst hearts', type: 'physical', tags: ['bleed', 'trinket'], kind: 'explode', noScale: true, fixed: true, desc: 'The Tell-Tale Heart: every bleeding monster bursts and dies at once, whatever its health. Takes no bonuses: not even shock or armor change it.' },
    poison: { name: 'Poison', type: 'poison', tags: ['dot', 'poison'], kind: 'poison', desc: 'Every poison is its own stack, without limit, dealing 1% of the monster\'s max health per second for 4 seconds. Inflicted by physical hits.' },
    flatElem: { name: 'Added elemental damage', type: 'elemental', tags: ['hit'], kind: 'elemental', desc: 'Flat elemental damage added to every weapon hit (weapon modifier), as a separate elemental hit.' },
    elemBonus: { name: 'Bonus elemental damage', type: 'elemental', tags: ['hit'], kind: 'elemental', inherit: true, desc: 'A share of a weapon hit dealt again as elemental damage: against shocked, slowed or rooted monsters (alien modifiers), Chain Lightning, the Scarecrow Effigy\'s embers.' },
    lightning: { name: 'Lightning bolts', type: 'elemental', tags: ['hit', 'lightning', 'talent'], kind: 'elemental', inherit: true, desc: 'Storm Caller\'s bolts: they always shock.' },
    fireflies: { name: 'Fireflies', type: 'elemental', tags: ['hit', 'lightning', 'trinket'], kind: 'elemental', inherit: true, desc: 'The Jar of Fireflies\' zaps: each one shocks for 40%.' },
    explosion: { name: 'Explosions', type: 'elemental', tags: ['hit', 'explosion', 'area'], kind: 'explode', desc: 'Monsters exploding on death, acid bursts, Bomb Battalion and the Scarecrow Effigy.' },
    acid: { name: 'Acid pools', type: 'elemental', tags: ['dot', 'acid', 'area'], kind: 'elemental', inherit: true, desc: 'Left by acid bursts (alien modifier).' },
    fire: { name: 'Burning ground', type: 'elemental', tags: ['dot', 'fire', 'area', 'talent'], kind: 'fire', desc: 'Burning Bridges\' trail of fire.' },
    holyFire: { name: 'Holy fire', type: 'elemental', tags: ['dot', 'holy'], kind: 'holy', inherit: true, desc: 'Stacks without limit, spreads through a golden circle, and monsters dying with 5 or more stacks explode with holy energy.' },
    holyBlast: { name: 'Holy explosions', type: 'elemental', tags: ['hit', 'holy', 'explosion', 'area'], kind: 'holy', desc: 'A monster dying with enough holy fire explodes for half its max health. The explosion does not set anything on holy fire.' },
    holyNova: { name: 'Holy novas', type: 'elemental', tags: ['hit', 'holy', 'area', 'talent'], kind: 'holy', inherit: true, desc: 'Divine Finale\'s blast when a trinket\'s effect ends.' },
    holyGround: { name: 'Holy ground', type: 'elemental', tags: ['dot', 'holy', 'area'], kind: 'holy', desc: 'The Holy Lantern\'s ground and Divine Shield\'s holy aura.' },
    wrath: { name: 'Purring Wrath', type: 'elemental', tags: ['hit', 'area', 'talent'], kind: 'holy', desc: 'Healing you could not use, burning the monsters around you.' },
    poisonBurst: { name: 'Poison bursts', type: 'poison', tags: ['hit', 'explosion', 'area', 'talent'], kind: 'poison', inherit: true, noScale: true, desc: 'Toxic Detonation: a monster\'s poison stacks burst for twice their damage per second, a meter wide per stack. Already raised by everything that raised the poison.' },
    chargedBlast: { name: 'Charged blasts', type: 'elemental', tags: ['hit', 'explosion', 'area', 'talent'], kind: 'explode', inherit: true, desc: 'Pent-Up Fury: your next hit after using your trinket explodes for 500% of its damage.' },
    curse: { name: 'Voodoo curse', type: 'physical', tags: ['curse', 'trinket', 'area'], kind: 'curse', noScale: true, fixed: true, desc: 'The Voodoo Doll: the cursed monster loses half its health over 3 seconds, and its tentacles crush every monster around it for the same. Takes no bonuses: not even shock or armor change it.' },
    // talents made in the talent creator (rules: js/rules.js)
    talentBlast: { name: 'Talent explosions', type: 'elemental', tags: ['hit', 'explosion', 'area', 'talent'], kind: 'explode', desc: 'Explosions from talent rules (made in the talent creator).' },
    talentBlood: { name: 'Talent blood bursts', type: 'physical', tags: ['hit', 'explosion', 'area', 'talent'], kind: 'explode', desc: 'Blood bursts from talent rules (made in the talent creator).' },
    talentStrike: { name: 'Talent strikes', type: 'physical', tags: ['hit', 'talent'], kind: 'hit', desc: 'Physical damage dealt straight by talent rules.' },
    talentElemental: { name: 'Talent elemental hits', type: 'elemental', tags: ['hit', 'talent'], kind: 'elemental', desc: 'Elemental damage dealt straight by talent rules, and their holy, tar and void zones.' },
    talentPoison: { name: 'Talent poison hits', type: 'poison', tags: ['hit', 'talent'], kind: 'poison', desc: 'Poison damage dealt straight by talent rules.' },
    talentBolt: { name: 'Talent lightning', type: 'elemental', tags: ['hit', 'lightning', 'talent'], kind: 'elemental', desc: 'Lightning from talent rules: it always shocks.' },
    reversal: { name: 'Poisoned healing', type: 'poison', tags: ['poison', 'talent'], kind: 'poison', noScale: true, desc: 'Poisoned Chalice: healing on a monster carrying your poison hurts it instead.' },
  };
  // The four crowd-control statuses and the stat that gives the player a chance to inflict each.
  G.STATUS_IDS = ['slow', 'shock', 'stun', 'root'];
  G.STATUS_STAT = { slow: 'slowChance', shock: 'shockChance', stun: 'stunChance', root: 'rootChance' };
  // Talent currencies: Totems of Power from altars, Alien Spoons from invasions.
  G.CURRENCIES = {
    totem: { name: 'Totem of Power', plural: 'Totems of Power', short: 'totem', icon: 'totem', color: '#8ff8ff' },
    spoon: { name: 'Alien Spoon', plural: 'Alien Spoons', short: 'spoon', icon: 'spoon', color: '#7dff6a' },
  };
  G.SLOTS = ['weapon', 'hat', 'body', 'boots', 'charm'];
  const AIS = ['dog', 'crow', 'pumpkin', 'shooter', 'blob', 'mosquito', 'golem', 'ghost', 'snail', 'summoner', 'frog', 'cauldron', 'ritual', 'eye', 'voidling', 'crawler', 'tentacle', 'cthulhu'];
  const ENEMY_MODELS = ['dog', 'crow', 'pumpkin', 'alien', 'blob', 'mosquito', 'alienbird', 'witchdoctor', 'shaman', 'ghost', 'cultist', 'snail', 'frog', 'cauldron', 'eye', 'voidling', 'crawler', 'tentacle', 'cthulhu',
    'golem', 'bigblob', 'deer', 'orc', 'demon'];
  G.BOSS_MODELS = ['golem', 'bigblob', 'deer', 'orc', 'demon'];   // full animated hierarchies instead of instanced parts
  const WEAPON_MODELS = ['scythe', 'sword', 'shotgun', 'revolver', 'flask', 'flamethrower', 'mp5', 'blowgun', 'obsidian', 'dagger', 'fan', 'tome', 'screamskull'];
  const POSES = ['scythe', 'sword', 'shotgun', 'revolver', 'flask', 'tome'];
  G.PROJ_KINDS = ['scythe', 'wave', 'pellet', 'bullet', 'flask', 'flame', 'dart', 'knife', 'fireball', 'nova'];
  const GEAR_MODELS = { hat: ['straw', 'cap', 'cowboy', 'antenna', 'dome', 'shamanmask', 'bearhood', 'flayedhood', 'tentaclecrown'], body: ['body', 'tiki', 'bearpelt', 'butcherapron', 'voidmantle'],
    boots: ['boots', 'moonboots', 'bearpaws', 'bloodboots', 'voidtreads'], charm: ['horseshoe', 'bell', 'watch', 'heartjar', 'voideye'] };
  const MOD_EFFECTS = ['hp', 'damage', 'speed', 'size', 'armor', 'regen', 'healOnHit', 'attackSpeed', 'boulders', 'summons', 'slamRadius', 'lavaTrail', 'deathBlast', 'dotImmune', 'inflicts', 'pulse', 'anchor', 'shamanic', 'shroud'];
  // Item tags: themed gear that only drops on maps listing the tag (stages.json maps[].gear).
  G.TAG_NAMES = { alien: 'alien', spirit: 'spirit', eldritch: 'eldritch' };
  // Damage over time on the player (status_effects.json playerDots), from monster "inflicts".
  G.PDOT_IDS = ['poison', 'bleed'];
  const ABILITIES = {
    anchor: { every: [16, 22], time: 2, window: 15, radius: 5, damage: 4, gap: 60 },
    tesla: { every: [26, 34], towers: 3, charge: 2.5, time: 16, radius: 3.2, damage: 2.5, reward: 0.08 },
  };
  G.ABILITIES = ABILITIES;

  // ---------- helpers ----------
  G.DATA_WARNINGS = [];
  const warn = (msg) => { G.DATA_WARNINGS.push(msg); console.warn('[data] ' + msg); };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const hex = (v, d) => { if (typeof v === 'number') return v; const m = /^#?([0-9a-f]{6})$/i.exec(String(v == null ? '' : v)); return m ? parseInt(m[1], 16) : d; };
  const css = (n) => '#' + n.toString(16).padStart(6, '0');
  const live = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && !x.disabled) : []);
  const entries = (obj) => Object.entries(obj || {}).filter(([k]) => !k.startsWith('_'));
  // { statusId: chance } for monsters that inflict statuses on hit.
  function checkInflicts(obj, where) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (!G.STATUS_IDS.includes(k) && !G.PDOT_IDS.includes(k)) warn(`${where}: unknown status "${k}" (use ${G.STATUS_IDS.concat(G.PDOT_IDS).join(', ')})`);
      else if (num(v, 0) > 0) out[k] = v;
    }
    return out;
  }
  const buffRef = (id, where) => { if (!id) return null; if (G.BUFFS[id]) return id; warn(`${where}: unknown buff "${id}"`); return null; };
  function checkStats(obj, where) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (!G.STATS[k]) warn(`${where}: unknown stat "${k}"`);
      else if (typeof v !== 'number') warn(`${where}: "${k}" should be a number`);
      else out[k] = v;
    }
    return out;
  }

  G.zeroStats = () => { const s = {}; for (const k in G.STATS) s[k] = 0; return s; };
  G.addStat = function (s, k, v) {
    if (G.STATS[k] && G.STATS[k].max) s[k] = Math.max(s[k] || 0, v);
    else s[k] = (s[k] || 0) + v;
  };
  // Negative values (talent downsides) keep their own sign: "-10% increased max health", not "+-10%".
  G.fmtVal = function (stat, v) {
    const a = G.STATS[stat] || {}, x = Math.abs(v), sg = v < 0 ? '-' : '+';
    if (a.neg) return `${v < 0 ? '+' : '-'}${Math.round(x * 100)}%`;
    if (a.pct) return `${a.max && v >= 0 ? '' : sg}${+(x * 100).toFixed(a.dec || 0)}%`;
    return `${sg}${a.dec ? +x.toFixed(a.dec) : Math.round(x)}`;
  };
  G.fmtMod = function (stat, v) {
    const a = G.STATS[stat] || { name: stat };
    if (a.tpl) return a.tpl.replace('{v}', G.fmtVal(stat, v)).replace('{u}', G.fmtVal(stat, v).replace('+', ''));
    if (a.plural) return `${v < 0 ? '' : '+'}${v} ${Math.abs(v) === 1 ? a.name : a.plural}`;
    return `${G.fmtVal(stat, v)} ${a.name}`;
  };
  // Blessing card text: {v} = value, {pct} = value as a percentage, {s} = plural 's'.
  G.fillText = (tpl, v) => tpl.replace(/\{(v|pct|s)\}/g, (m, k) => (k === 'v' ? String(Math.round(v * 100) / 100) : k === 'pct' ? Math.round(v * 100) + '%' : v === 1 ? '' : 's'));

  // ---------- loading ----------
  const FILES = ['characters', 'upgrades', 'weapons', 'items', 'enemies', 'monster_modifiers', 'stages', 'status_effects', 'trinkets'];
  async function getJSON(file) {
    let res;
    try { res = await fetch((G.DATA_URL || 'data/') + file, { cache: 'no-cache' }); } catch (e) { throw new Error(`could not read data/${file}`); }   // DATA_URL: tools in other folders
    if (!res.ok) throw new Error(`data/${file} is missing (HTTP ${res.status})`);
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { throw new Error(`data/${file} is not valid JSON: ${e.message}`); }
  }
  G.loadData = async function () {
    const raw = {};
    await Promise.all(FILES.map(async (f) => { raw[f] = await getJSON(f + '.json'); }));
    raw.talents = {};
    await Promise.all(live(raw.characters.characters).map(async (c) => { if (c.talents) raw.talents[c.id] = await getJSON(c.talents); }));
    buildStatus(raw.status_effects);
    buildItems(raw.items);
    buildWeapons(raw.weapons);
    buildCharacters(raw.characters, raw.talents);
    buildUpgrades(raw.upgrades);
    buildEnemies(raw.enemies);
    buildModifiers(raw.monster_modifiers);
    buildStages(raw.stages);
    buildTrinkets(raw.trinkets);
    buildRules();
  };
  // Talent rules, conditional stats and hit bonuses (js/rules.js), read last: they can name buffs,
  // trinkets, monsters, weapons and maps.
  function buildRules() {
    for (const c of G.CHARACTERS) for (const tree of [c.tree, c.alien]) for (const node of tree.talents) {
      if (G.rules) G.rules.compile(node.src, node, node.where, warn);
      else { node.rules = []; node.conditionalStats = []; node.hitBonus = []; node.ruleTags = []; }
    }
  }
  // ---------- trinkets.json ----------
  // Effect defaults; a trinket's effect can override any of them.
  const TRINKET_FX = {
    theMoment: { buff: 'the_moment', burn: 0.4, recent: 4, regenPerBurn: 3, regenCap: 36 },
    holyGround: { radius: 4.5, duration: 8, burn: 0.5, regen: 5 },
    buff: { buff: null },
    timeStop: { radius: 18, duration: 4, bossDuration: 2, shock: 0.5, buff: null },
    decoy: { range: 20, duration: 8, power: 10, radius: 6, perKill: 0.05, cap: 1.5, emberDuration: 30 },
    fireflies: { count: 12, duration: 20, damage: 0.4, every: 0.5, range: 6, shock: 0.4 },
    voodoo: { radius: 6, loss: 0.5, duration: 3, grip: 3 },
    dinnerBell: { radius: 9, stun: 2, push: 18 },
    venom: { mult: 3, duration: 8, radius: 2 },
    bloodBurst: { radius: 2.5, share: 0.3, bossMult: 3 },
  };
  // A list of G.TAGS ids (unknown ones are dropped with a warning).
  function tagList(v, where) {
    return (Array.isArray(v) ? v : []).filter((t) => { if (G.TAGS[t]) return true; warn(`${where}: unknown tag "${t}" (use ${Object.keys(G.TAGS).join(', ')})`); return false; });
  }
  function buildTrinkets(d) {
    G.TRINKETS = {};
    for (const [id, t] of entries((d || {}).trinkets)) {
      const e = typeof t.effect === 'string' ? { id: t.effect } : Object.assign({}, t.effect);
      if (!TRINKET_FX[e.id]) { warn(`trinkets.json ${id}: unknown effect "${e.id}" (use ${Object.keys(TRINKET_FX).join(', ')})`); continue; }
      const fx = Object.assign({}, TRINKET_FX[e.id], e);
      if ('buff' in fx && fx.buff !== null && !(fx.buff = buffRef(fx.buff, `trinkets.json ${id} effect`))) continue;
      if (e.id === 'buff' && !fx.buff) { warn(`trinkets.json ${id}: the buff effect needs a buff`); continue; }
      G.TRINKETS[id] = { id, name: t.name || id, icon: t.icon || 'star', desc: t.desc || '', cooldown: Math.max(1, num(t.cooldown, 60)), effect: fx, tags: tagList(t.tags, `trinkets.json ${id}`) };
    }
    for (const c of G.CHARACTERS) if (c.trinket && !G.TRINKETS[c.trinket]) { warn(`characters.json ${c.id}: unknown trinket "${c.trinket}"`); c.trinket = null; }
  }

  // ---------- items.json ----------
  function buildItems(d) {
    const R = live(d.rarities);
    if (R.length !== 4) warn(`items.json: expected 4 blessing rarities (common, rare, epic, legendary), found ${R.length}`);
    G.RARITY = R.map((r, i) => { const h = hex(r.color, 0xffffff); return { id: i, name: r.name || 'Tier ' + (i + 1), color: css(h), hex: h, weight: num(r.weight, 1), luckFactor: num(r.luckFactor, 0) }; });
    // gear: Common, Magic, Rare
    const IR = live(d.itemRarities);
    if (!IR.length) throw new Error('items.json has no itemRarities');
    G.ITEM_RARITY = IR.map((r, i) => {
      const h = hex(r.color, 0xffffff);
      return {
        id: i, name: r.name || 'Tier ' + (i + 1), color: css(h), hex: h, weight: num(r.weight, 1), luckFactor: num(r.luckFactor, 0),
        affixes: Math.max(0, Math.floor(num(r.affixes, i))), weaponDamage: num(r.weaponDamage, 1), affixPower: num(r.affixPower, 1), scrapXp: num(r.scrapXp, 4),
        prefixes: Array.isArray(r.prefixes) && r.prefixes.length ? r.prefixes : [r.name || ''],
      };
    });
    G.ITEM_SCALING = Object.assign({ weaponRoll: 0.07, affixRoll: 0.15, scrapPerStage: 0.5 }, d.scaling);
    const ar = d.armor || {};
    G.ARMOR = { maxReduction: U.clamp(num(ar.maxReduction, 0.9), 0, 0.99) };
    for (const sl of G.SLOTS) { const v = Array.isArray(ar[sl]) ? ar[sl] : [0, 0]; G.ARMOR[sl] = [Math.max(0, num(v[0], 0)), Math.max(0, num(v[1], num(v[0], 0)))]; }
    G.SLOT_NAMES = {}; G.SLOT_WEIGHTS = {};
    for (const s of G.SLOTS) { const o = (d.slots || {})[s] || {}; G.SLOT_NAMES[s] = o.name || s; G.SLOT_WEIGHTS[s] = num(o.dropWeight, 1); }
    G.GEAR = {};
    for (const s of G.SLOTS.slice(1)) {
      G.GEAR[s] = live((d.gear || {})[s]).map((b) => {
        if (!GEAR_MODELS[s].includes(b.model)) warn(`items.json gear.${s} "${b.name}": unknown model "${b.model}" (use ${GEAR_MODELS[s].join(', ')})`);
        const tag = b.tag || (b.alien ? 'alien' : '');
        if (b.set && !(d.sets || {})[b.set]) warn(`items.json gear.${s} "${b.name}": unknown set "${b.set}"`);
        return { name: b.name || G.SLOT_NAMES[s], model: b.model, color: hex(b.color, undefined), tag, alien: tag === 'alien', set: (d.sets || {})[b.set] ? b.set : null,
          implicit: checkStats(b.stats, `items.json gear.${s} "${b.name}" stats`) };
      });
      if (!G.GEAR[s].length) { warn(`items.json: no gear for slot "${s}"`); G.GEAR[s] = [{ name: G.SLOT_NAMES[s], model: GEAR_MODELS[s][0] }]; }
    }
    G.AFFIXES = [];
    for (const a of live(d.affixes)) {
      if (!G.STATS[a.stat]) { warn(`items.json affix: unknown stat "${a.stat}"`); continue; }
      if (a.weaponClass && !['melee', 'firearm', 'magic'].includes(a.weaponClass)) warn(`items.json affix ${a.stat}: weaponClass must be melee, firearm or magic`);
      G.AFFIXES.push({ stat: a.stat, base: num(a.base, 0), slots: Array.isArray(a.slots) ? a.slots : [], alienOnly: !!a.alienOnly, weight: Math.max(0, num(a.weight, 1)), weaponClass: a.weaponClass || null });
    }
    // the reference value of each stat (its affix base), for item power
    G.AFFIX_BASE = { armor: 5 };
    for (const a of G.AFFIXES) if (!(a.stat in G.AFFIX_BASE) && a.base) G.AFFIX_BASE[a.stat] = a.base;
    const il = d.itemLevel || {}, list = (v) => (Array.isArray(v) ? v.filter((k) => { if (G.STATS[k]) return true; warn(`items.json itemLevel: unknown stat "${k}"`); return false; }) : []);
    G.ILVL = { perLevel: Math.max(0, num(il.perLevel, 0.15)), otherPerLevel: Math.max(0, num(il.otherPerLevel, 0.08)), scaling: new Set(list(il.scaling)), steps: new Set(list(il.steps)), stepEvery: Math.max(1, Math.floor(num(il.stepEvery, 10))) };
    // Gear sets: bonuses for wearing several pieces of the same set at once.
    G.SETS = {};
    for (const [id, st] of entries(d.sets)) {
      const bonuses = [];
      for (const [n, stats] of entries(st.bonuses)) bonuses.push({ n: Math.max(1, parseInt(n, 10) || 2), stats: checkStats(stats, `items.json sets.${id} bonuses.${n}`) });
      bonuses.sort((a, b) => a.n - b.n);
      G.SETS[id] = { id, name: st.name || id, color: css(hex(st.color, 0xc8a070)), bonuses };
    }
    G.PICKUPS = Object.assign({ fishHeal: 0.3, despawnSeconds: 40 }, d.pickups);
    G.PICKUPS.catnipBuff = buffRef(G.PICKUPS.catnipBuff, 'items.json pickups.catnipBuff');
  }

  // ---------- status_effects.json ----------
  function buildStatus(d) {
    const st = d.statuses || {};
    G.STATUS = {};
    for (const id of G.STATUS_IDS) {
      const s = st[id] || {};
      G.STATUS[id] = {
        id, name: s.name || id, desc: s.desc || '', icon: s.icon || 'star', color: css(hex(s.color, 0xffffff)),
        duration: Math.max(0, num(s.duration, 2)), playerDuration: Math.max(0, num(s.playerDuration, 1)), bossDuration: Math.max(0, num(s.bossDuration, 0.5)),
        power: num(s.power, 0), immunity: Math.max(0, num(s.immunity, 0)),
        minEffect: Math.max(0, num(s.minEffect, 0.1)), maxEffect: Math.max(0, num(s.maxEffect, 0.5)), fullAt: Math.max(0.001, num(s.fullAt, 0.2)),
      };
    }
    for (const k in st) if (!G.STATUS_IDS.includes(k)) warn(`status_effects.json: unknown status "${k}" (the statuses are ${G.STATUS_IDS.join(', ')})`);
    const dots = d.dots || {}, p = dots.poison || {}, b = dots.bleed || {};
    G.DOTS = {
      poison: { damage: Math.max(0, num(p.damage, 0)), maxHp: Math.max(0, num(p.maxHpPerSecond, 0.01)), duration: Math.max(0.1, num(p.duration, 4)), maxStacks: Math.max(0, Math.floor(num(p.maxStacks, 0))), dummyHp: Math.max(1, num(p.dummyHp, 1000)) },
      bleed: { damage: num(b.damage, 1.5), duration: Math.max(0.1, num(b.duration, 5)) },
      holy: Object.assign({ damage: 0.4, duration: 3, auraRadius: 1, spread: 0.1, explodeAt: 5, explode: 0.5, explodeRadius: 4.5 }, dots.holy),
    };
    const pd = d.playerDots || {};
    G.PDOTS = {};
    for (const id of G.PDOT_IDS) {
      const x = pd[id] || {};
      G.PDOTS[id] = { id, name: x.name || id, desc: x.desc || '', icon: x.icon || (id === 'bleed' ? 'blood' : 'poison'), color: css(hex(x.color, id === 'bleed' ? 0xff5a4a : 0x8aef4a)),
        damage: Math.max(0, num(x.damage, 0.3)), duration: Math.max(0.5, num(x.duration, 4)) };
    }
    G.BUFFS = {};
    for (const [id, x] of entries(d.buffs)) {
      G.BUFFS[id] = { id, name: x.name || id, desc: x.desc || '', icon: x.icon || 'star', color: css(hex(x.color, 0x8af060)), duration: Math.max(0.1, num(x.duration, 10)), stats: checkStats(x.stats, `status_effects.json buff ${id}`) };
    }
  }

  // ---------- weapons.json ----------
  // Weapon implicits: the fixed modifier every item of a weapon type has. Effects and their defaults.
  const WEAPON_FX = {
    bleedExplode: { share: 0.5, radius: 2 },
    holyEvery: { every: 5 },
    burstFire: { every: 6, shots: 3, gap: 0.08 },
    poisonDeathSpread: { radius: 1.5 },
    dashBuff: { buff: null },
    bleedKillBuff: { buff: null, duration: 2, cooldown: 5 },
    projChains: { chains: 5 },
    pyroblast: { every: 5, mult: 2, size: 1.8, stun: 0.5, bounces: 3 },
    holyReaper: { holy: 2, faith: 2, push: 7 },
  };
  const WEAPON_FX_TAGS = { bleedExplode: ['bleed', 'explosion'], holyEvery: ['elemental', 'holy'], poisonDeathSpread: ['poison'], dashBuff: ['movement', 'buff'], bleedKillBuff: ['bleed', 'buff'], pyroblast: ['explosion', 'area', 'control'], holyReaper: ['elemental', 'holy', 'control'] };
  function implicit(o, where) {
    if (!o) return null;
    let effect = null;
    if (o.effect) {
      if (!WEAPON_FX[o.effect.id]) warn(`${where}: unknown effect "${o.effect.id}" (use ${Object.keys(WEAPON_FX).join(', ')})`);
      else {
        effect = Object.assign({}, WEAPON_FX[o.effect.id], o.effect);
        if ('buff' in effect && !(effect.buff = buffRef(effect.buff, where))) effect = null;
      }
    }
    // stacks: while you wield the weapon, a buff stacks instead of refreshing (each stack falloff weaker)
    const st = o.stacks && buffRef(o.stacks.buff, where + ' stacks') ? { buff: o.stacks.buff, falloff: U.clamp(num(o.stacks.falloff, 0.1), 0, 1) } : null;
    return { text: o.text || '', stats: checkStats(o.stats, where + ' stats'), effect, stacks: st };
  }
  function buildWeapons(d) {
    G.WEAPONS = {};
    for (const [id, w] of entries(d.weapons)) {
      const pr = w.projectile || {}, m = w.melee;
      // damage [min, max]: both ends within 0.7x-1.3x of the middle
      const dr = Array.isArray(w.damage) ? w.damage : [num(w.damage, 10), num(w.damage, 10)];
      let lo = num(dr[0], 10), hi = num(dr[1], lo);
      if (hi < lo) [lo, hi] = [hi, lo];
      const mid = (lo + hi) / 2;
      if (lo < mid * 0.7 - 1e-9 || hi > mid * 1.3 + 1e-9) { warn(`weapons.json ${id}: damage [${lo}, ${hi}] varies more than 0.7x-1.3x of ${mid}`); lo = Math.max(lo, mid * 0.7); hi = Math.min(hi, mid * 1.3); }
      const W = {
        id, name: w.name || id, desc: w.desc || '', class: ['melee', 'firearm', 'magic'].includes(w.class) ? w.class : 'melee', dmg: mid, dmgLo: lo / mid, dmgHi: hi / mid, aps: Math.max(0.1, num(w.attackSpeed, 1)), crit: U.clamp(num(w.crit, 0.05), 0, 1),
        dropWeight: num(w.dropWeight, 1), tag: w.tag || (w.alien ? 'alien' : ''), alien: (w.tag || (w.alien ? 'alien' : '')) === 'alien',
        dmgType: w.damageType === 'elemental' ? 'elemental' : 'physical',
        model: w.model || id, pose: w.pose || w.model || id, aimRange: num(w.aimRange, 16), sound: w.sound || null, muzzle: num(w.muzzle, 0.7), shake: num(w.shake, 0),
        melee: m ? { arc: num(m.arc, 120), range: num(m.range, 3), color: hex(m.color, 0xe8f4ff), pitch: num(m.pitch, 1) } : null,
        proj: {
          kind: pr.kind || 'scythe', count: Math.max(1, num(pr.count, 1)), speed: num(pr.speed, 15), range: num(pr.range, 10), pierce: num(pr.pierce, 1),
          dmgMul: num(pr.damageMult, 1), knock: num(pr.knockback, 1), spread: num(pr.spread, 0.6), splash: num(pr.splash, 2.4), puddle: num(pr.puddle, 3), jitter: num(pr.jitter, 0),
          ring: !!pr.ring,
        },
        per: num(w.perProjectile, 1), bonus: checkStats(w.bonus, `weapons.json ${id} bonus`), poison: !!w.alwaysPoison, block: Math.max(0, num(w.block, m ? 100 : 0)),
        implicit: implicit(w.implicit, `weapons.json ${id} implicit`),
      };
      if (!WEAPON_MODELS.includes(W.model)) warn(`weapons.json ${id}: unknown model "${W.model}" (use ${WEAPON_MODELS.join(', ')})`);
      if (!POSES.includes(W.pose)) { warn(`weapons.json ${id}: unknown pose "${W.pose}" (use ${POSES.join(', ')})`); W.pose = 'scythe'; }
      if (!G.PROJ_KINDS.includes(W.proj.kind)) { warn(`weapons.json ${id}: unknown projectile kind "${W.proj.kind}"`); W.proj.kind = 'scythe'; }
      // tags: its damage type, class, and what its implicit is about
      const I = W.implicit, set = new Set([W.dmgType, 'weapon', 'hit', W.class, ...(W.poison ? ['poison'] : []), ...(W.block ? ['defense'] : []), ...G.tagsFor(I ? I.stats : {}, null), ...((I && I.effect && WEAPON_FX_TAGS[I.effect.id]) || [])]);
      W.tags = Object.keys(G.TAGS).filter((t) => set.has(t));
      G.WEAPONS[id] = W;
    }
    if (!Object.keys(G.WEAPONS).length) throw new Error('weapons.json has no weapons');
  }

  // ---------- characters.json + talent trees ----------
  function buildCharacters(d, trees) {
    G.CHARACTERS = live(d.characters).map((c) => {
      const weapon = G.WEAPONS[c.weapon] ? c.weapon : Object.keys(G.WEAPONS)[0];
      if (weapon !== c.weapon) warn(`characters.json ${c.id}: unknown weapon "${c.weapon}"`);
      const model = G.M && G.M.HERO_MODELS && !G.M.HERO_MODELS.includes(c.model || 'cat') ? (warn(`characters.json ${c.id}: unknown model "${c.model}" (use ${G.M.HERO_MODELS.join(', ')})`), 'cat') : c.model || 'cat';
      return {
        id: c.id, name: c.name || c.id, heroName: c.heroName || c.name || c.id, weapon, weaponName: c.weaponName || null, trinket: c.trinket || null, hat: c.hat || 'straw',
        model, epithet: c.epithet || '', specialty: c.specialty || '', lore: c.lore || '', color: css(hex(c.color, 0xf2c04e)), icon: c.icon || 'paw',
        voice: c.voice || 'meow', reviveTitle: c.reviveTitle || 'Back on your feet!', intro: Array.isArray(c.intro) ? c.intro.map(String) : null, tags: tagList(c.tags, `characters.json ${c.id} tags`),
        reviveBuff: buffRef(c.reviveBuff, `characters.json ${c.id} reviveBuff`),
        stats: Object.assign(G.zeroStats(), checkStats(c.stats, `characters.json ${c.id} stats`)), tree: buildTree(trees[c.id], c),
        alien: buildTree(trees[c.id] && trees[c.id].alien, c, true),
      };
    });
    if (!G.CHARACTERS.length) throw new Error('characters.json has no characters');
    G.CHAR = G.CHARACTERS[0];
    G.BASE_STATS = G.CHAR.stats;
  }
  // Plays as another character (the character selection, ?char= in the address): its stats, talent tree,
  // starting kit and model. Remembered for next time. Returns false for an unknown id.
  G.setCharacter = function (id) {
    const c = G.CHARACTERS.find((x) => x.id === id);
    if (!c) return false;
    const changed = c !== G.CHAR;
    G.CHAR = c; G.BASE_STATS = c.stats;
    G.save.settings.char = c.id; G.store.write();
    if (changed && G.player && G.player.root && G.playerSys.rebuild) G.playerSys.rebuild();
    return true;
  };
  // One big tree per character: nodes on a grid, linked by requires / requiresAny.
  // free: alien talents, picked in any order with no tree layout (no positions or links needed).
  function buildTree(t, c, free) {
    const where = (c.talents || `${c.id} talents`) + (free ? ' alien' : ''), tree = { groups: [], segments: [], talents: [], byId: {} };
    const effect = (e, id) => {
      if (e == null) return null;
      const o = typeof e === 'string' ? { id: e } : e;
      if (!G.EFFECTS[o.id]) { warn(`${where} ${id}: unknown effect "${o.id}" (use ${Object.keys(G.EFFECTS).join(', ')})`); return null; }
      const fx = Object.assign({}, G.EFFECTS[o.id], o);
      if ('buff' in fx && !(fx.buff = buffRef(fx.buff, `${where} ${id} effect`))) return null;
      return fx;
    };
    if (!t) return tree;
    tree.groups = live(t.groups).map((g) => ({ id: g.id, name: g.name || g.id, color: css(hex(g.color, 0xf2c04e)) }));
    // segments: named sets of talents that glow in their color on the tree (purely visual)
    tree.segments = free ? [] : live(t.segments).map((s) => ({ id: s.id, name: s.name || s.id, color: css(hex(s.color, 0xf2c04e)), glow: Math.max(0, Math.min(1, num(s.glow, 0.6))) }));
    const gIds = new Set(tree.groups.map((g) => g.id)), sIds = new Set(tree.segments.map((s) => s.id)), cells = {};
    const reqs = (list) => (Array.isArray(list) ? list : []).map((r) => (typeof r === 'string' ? { id: r, rank: 1 } : { id: r && r.id, rank: Math.max(1, num(r && r.rank, 1)) }));
    for (const n of live(t.talents)) {
      if (!n.id || tree.byId[n.id]) { warn(`${where}: talent id "${n.id}" is missing or used twice`); continue; }
      if (n.group != null && !gIds.has(n.group)) warn(`${where} ${n.id}: unknown group "${n.group}"`);
      if (n.segment != null && !free && !sIds.has(n.segment)) warn(`${where} ${n.id}: unknown segment "${n.segment}"`);
      if (n.currency != null && !G.CURRENCIES[n.currency]) warn(`${where} ${n.id}: unknown currency "${n.currency}" (use ${Object.keys(G.CURRENCIES).join(', ')})`);
      const node = {
        id: n.id, x: Math.round(num(n.x, 0)), y: Math.round(num(n.y, 0)), group: gIds.has(n.group) ? n.group : null, segment: sIds.has(n.segment) ? n.segment : null, start: !!n.start, big: !!n.big,
        currency: G.CURRENCIES[n.currency] ? n.currency : 'totem', name: n.name || n.id, icon: n.icon || 'star', desc: n.desc || '',
        effect: effect(n.effect, n.id), text: n.text || '', downside: n.downside || '',
        maxRank: n.start ? 1 : Math.max(1, Math.floor(num(n.maxRank, 1))), cost: Math.max(1, Math.floor(num(n.cost, 1))),
        stats: checkStats(n.stats, `${where} ${n.id}`), requires: reqs(n.requires), requiresAny: reqs(n.requiresAny), minSpent: Math.max(0, num(n.minSpent, 0)),
      };
      if (free) node.currency = 'spoon';
      node.src = n; node.where = where;   // rules are read once everything else is (buildRules)
      const cell = node.x + ',' + node.y;
      if (!free && cells[cell]) warn(`${where}: ${n.id} and ${cells[cell]} sit on the same spot (${cell})`);
      cells[cell] = n.id;
      tree.talents.push(node); tree.byId[node.id] = node;
    }
    for (const n of tree.talents) {
      const ok = (r) => { if (tree.byId[r.id]) return true; warn(`${where} ${n.id}: requires unknown talent "${r.id}"`); return false; };
      n.requires = n.requires.filter(ok); n.requiresAny = n.requiresAny.filter(ok);
      if (!free && !n.start && !n.requires.length && !n.requiresAny.length && !n.minSpent) warn(`${where} ${n.id}: not linked to anything (add requiresAny)`);
    }
    tree.color = (n) => { const g = n.group && tree.groups.find((x) => x.id === n.group); return g ? g.color : '#f1e6cf'; };
    tree.segment = (n) => (n.segment && tree.segments.find((x) => x.id === n.segment)) || null;
    return tree;
  }

  // ---------- upgrades.json ----------
  function buildUpgrades(d) {
    G.UPGRADES = []; G.UPG = {};
    for (const b of live(d.blessings)) {
      const where = `upgrades.json ${b.id}`;
      if (!b.id || G.UPG[b.id]) { warn(`upgrades.json: blessing id "${b.id}" is missing or used twice`); continue; }
      if (!G.STATS[b.stat]) { warn(`${where}: unknown stat "${b.stat}"`); continue; }
      if (!Array.isArray(b.values) || b.values.length < G.RARITY.length || b.values.some((v) => typeof v !== 'number')) { warn(`${where}: "values" needs one number per rarity`); continue; }
      const also = checkStats(b.also, where + ' also'), until = checkStats(b.until, where + ' until');
      const any = Array.isArray(b.requiresAny) ? b.requiresAny.filter((k) => { if (G.STATS[k] || k === 'weaponPoison') return true; warn(`${where} requiresAny: unknown stat "${k}"`); return false; }) : null;
      const u = { id: b.id, name: b.name || b.id, icon: b.icon || 'burst', stat: b.stat, vals: b.values, w: num(b.weight, 1), tpl: b.desc || '', weaponClass: b.weaponClass || null };
      u.text = (v) => G.fillText(u.tpl, v);
      u.apply = (s, v) => { G.addStat(s, u.stat, v); for (const k in also) G.addStat(s, k, also[k]); };
      u.ok = (s) => Object.keys(until).every((k) => (s[k] || 0) < until[k]);
      u.req = (s) => (!any || !any.length || any.some((k) => s[k])) && (!u.weaponClass || (s.weapon && s.weapon.class === u.weaponClass));
      G.UPGRADES.push(u); G.UPG[u.id] = u;
    }
  }

  // ---------- enemies.json ----------
  function buildEnemies(d) {
    G.ELITE = Object.assign({ hp: 5, damage: 1.5, size: 1.45, xp: 6, mass: 3, essence: 5 }, d.elite);
    const dr = d.drops || {};
    G.DROPS = {
      normal: Object.assign({ item: 0.011, fish: 0.012, catnip: 0.0035, itemLuck: 0 }, dr.normal),
      elite: Object.assign({ item: 0.4, fish: 0.3, catnip: 0.0035, itemLuck: 25 }, dr.elite),
      itemMult: Math.max(0, num(dr.itemMult, 1)),
    };
    G.ENEMIES = {};
    for (const [id, e] of entries(d.enemies)) {
      const ai = AIS.includes(e.ai) ? e.ai : 'dog', model = ENEMY_MODELS.includes(e.model) ? e.model : ai;
      if (ai !== e.ai) warn(`enemies.json ${id}: unknown ai "${e.ai}" (use ${AIS.join(', ')})`);
      if (model !== e.model) warn(`enemies.json ${id}: unknown model "${e.model}" (use ${ENEMY_MODELS.join(', ')})`);
      const t = e.tint != null ? hex(e.tint, null) : null, c = e.colors || {};
      G.ENEMIES[id] = {
        id, name: e.name || id, ai, model, hp: num(e.hp, 10), dmg: num(e.damage, 5), speed: num(e.speed, 3), radius: num(e.radius, 0.5), size: num(e.size, 1),
        xp: num(e.xp, 1), mass: num(e.mass, 1), flying: !!e.flying, boss: !!e.boss, summons: Math.max(0, Math.floor(num(e.summons, 0))),
        die: e.deathSound || 'die_dog', debris: (Array.isArray(e.debris) && e.debris.length ? e.debris : ['#888888']).map((x) => hex(x, 0x888888)),
        tint: t == null ? null : [((t >> 16) & 255) / 255, ((t >> 8) & 255) / 255, (t & 255) / 255],
        ranged: ai === 'pumpkin' || ai === 'shooter' || ai === 'eye' ? Object.assign({ range: 10.5, cooldown: 3.3, damage: 7, speed: 10, kind: 'bolt', count: 1, spread: 0.35 }, e.ranged) : null,
        summon: e.summon ? { every: Array.isArray(e.summon.every) ? e.summon.every.map(Number) : [num(e.summon.every, 4), num(e.summon.every, 4)], max: Math.max(1, Math.floor(num(e.summon.max, 6))),
          weights: Object.assign({}, e.summon.weights), rare: Array.isArray(e.summon.rare) ? e.summon.rare : [] } : null,
        trail: e.trail ? { every: Math.max(0.1, num(e.trail.every, 0.5)), life: num(e.trail.life, 4), radius: num(e.trail.radius, 1.2) } : null,
        plate: !!e.plate,
        essence: Math.max(0, num(e.essence, 1)), boulderAcid: !!e.boulderAcid, split: e.split && e.split.into ? { into: e.split.into, count: Math.max(1, Math.floor(num(e.split.count, 2))) } : null,
        abilities: abilities(e.abilities, `enemies.json ${id}`),
        colors: { stone: hex(c.stone, 0x7a776e), stoneDark: hex(c.stoneDark, 0x5a5850), moss: hex(c.moss, 0x4f6a3a), lava: hex(c.lava, 0xff8a3a) },
        rewards: e.rewards || null, max: Math.max(1, Math.floor(num(e.maxOnScreen, 500))), inflicts: checkInflicts(e.inflicts, `enemies.json ${id} inflicts`),
      };
    }
    for (const e of Object.values(G.ENEMIES)) if (e.split && !G.ENEMIES[e.split.into]) { warn(`enemies.json ${e.id} split: unknown enemy "${e.split.into}"`); e.split = null; }
    for (const e of Object.values(G.ENEMIES)) if (e.summon) {
      for (const k of Object.keys(e.summon.weights)) if (!G.ENEMIES[k] || G.ENEMIES[k].boss || !(num(e.summon.weights[k], 0) > 0)) { if (!G.ENEMIES[k]) warn(`enemies.json ${e.id} summon: unknown enemy "${k}"`); delete e.summon.weights[k]; }
      if (!Object.keys(e.summon.weights).length) { warn(`enemies.json ${e.id} summon: nothing to summon`); e.summon = null; }
    }
    if (!Object.values(G.ENEMIES).some((e) => !e.boss)) throw new Error('enemies.json needs at least one monster that is not a boss');
    // The camp's training dummy: it never moves, attacks or dies (day.js measures your DPS on it).
    G.ENEMIES.training_dummy = {
      id: 'training_dummy', name: 'Training Dummy', ai: 'dummy', model: 'dummy', hp: 1, dmg: 0, speed: 0, radius: 0.6, size: 1, xp: 0, mass: 1e6, flying: false, boss: false, summons: 0,
      die: 'die_dog', debris: [0xd8b860, 0xa8844a, 0x8a3a2a], tint: null, ranged: null, essence: 0, boulderAcid: false, split: null, abilities: {},
      colors: {}, rewards: null, max: 2, inflicts: {},
    };
  }
  // Boss abilities with their default numbers filled in: { anchor: {...}, tesla: {...} }.
  function abilities(obj, where) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (!ABILITIES[k]) { warn(`${where} abilities: unknown ability "${k}" (use ${Object.keys(ABILITIES).join(', ')})`); continue; }
      out[k] = Object.assign({}, ABILITIES[k], v);
    }
    return out;
  }

  // ---------- monster_modifiers.json ----------
  function buildModifiers(d) {
    G.MODIFIERS = live(d.modifiers).map((m) => {
      const fx = Object.assign({}, m.effects);
      for (const k in fx) if (!MOD_EFFECTS.includes(k)) warn(`monster_modifiers.json ${m.id}: unknown effect "${k}" (use ${MOD_EFFECTS.join(', ')})`);
      if (fx.inflicts) fx.inflicts = checkInflicts(fx.inflicts, `monster_modifiers.json ${m.id} inflicts`);
      const h = hex(m.color, 0xffffff);
      return { id: m.id, name: m.name || m.id, desc: m.desc || '', color: css(h), hex: h, weight: num(m.weight, 1), minStage: num(m.minStage, 0), ais: Array.isArray(m.ais) ? m.ais : null, dungeon: m.dungeon !== false, effects: fx };
    });
  }
  // n distinct modifiers allowed on this stage (and for this ai), weighted.
  G.rollModifiers = function (n, tier, ai) {
    const pool = G.MODIFIERS.filter((m) => tier >= m.minStage && m.weight > 0 && (!m.ais || !ai || m.ais.includes(ai))), out = [];
    while (out.length < n && pool.length) { const m = U.weighted(pool, (x) => x.weight); pool.splice(pool.indexOf(m), 1); out.push(m); }
    return out;
  };

  // ---------- stages.json ----------
  const PH_KEYS = { top: 'top', horizon: 'hor', fog: 'fog', skyLight: 'hs', groundLight: 'hg', ambient: 'hi', sun: 'sc', sunIntensity: 'si', sunPosition: 'sp', clouds: 'cl', celestial: 'cel', playerLight: 'pl', lamps: 'lamp', tint: 'tint' };
  const SKY0 = { top: '#4f86c8', horizon: '#f2d9a0', fog: '#e0c08c', skyLight: '#fff3d6', groundLight: '#6a5634', ambient: 0.78, sun: '#ffe0a8', sunIntensity: 0.9, sunPosition: [-40, 70, 30], clouds: '#fff4e0', celestial: '#fff2c0', playerLight: 0, lamps: 0, tint: [1, 0.98, 0.94] };
  function toPhase(sky) {
    const o = {};
    for (const k in PH_KEYS) {
      const v = sky[k], d = SKY0[k];
      o[PH_KEYS[k]] = Array.isArray(d) ? (Array.isArray(v) && v.length === 3 ? v.map(Number) : d) : typeof d === 'number' ? num(v, d) : hex(v, hex(d));
    }
    return o;
  }
  function cleanWeights(w, where) {
    const out = {};
    for (const [id, v] of entries(w)) {
      if (!G.ENEMIES[id]) { warn(`${where}: unknown enemy "${id}"`); continue; }
      if (G.ENEMIES[id].boss) { warn(`${where}: "${id}" is a boss and cannot be in a spawn table`); continue; }
      if (num(v, 0) > 0) out[id] = v;
    }
    if (!Object.keys(out).length) { warn(`${where}: no valid monsters, using the first one in enemies.json`); out[Object.values(G.ENEMIES).find((e) => !e.boss).id] = 1; }
    return out;
  }
  function merged(def, over) {
    const o = {};
    for (const k in def) o[k] = def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) ? Object.assign({}, def[k], over && over[k]) : over && over[k] != null ? over[k] : def[k];
    return o;
  }
  function buildStages(d) {
    G.DAY_SECONDS = Math.max(30, num(d.daySeconds, 600));
    G.STAGE_SECONDS = Math.max(10, num(d.stageSeconds, 120));
    const en = d.endless || {};
    G.ENDLESS = { hp: num(en.hpGrowth, 2.5), dmg: num(en.damageGrowth, 1.6), ilvl: num(en.itemLevelGrowth, 1) };
    const gr = d.growth || {};
    G.GROWTH = { hp: Math.max(0, num(gr.hpPerMinute, 0)), dmg: Math.max(0, num(gr.damagePerMinute, 0)) };
    const ch = d.chests || {}, chEv = Array.isArray(ch.every) ? ch.every : [];
    G.CHESTS = {
      first: Math.max(0, num(ch.first, 25)), every: [Math.max(5, num(chEv[0], 55)), Math.max(5, num(chEv[1], num(chEv[0], 85)))], maxStanding: Math.max(1, Math.floor(num(ch.maxStanding, 3))),
      freeAtStart: Math.max(0, Math.floor(num(ch.freeAtStart, 2))), weaponChest: Math.min(3, Math.floor(num(ch.weaponChest, 1))), cost: Math.max(0, num(ch.cost, 20)), costPerMinute: Math.max(0, num(ch.costPerMinute, 20)),
      minRarity: U.clamp(Math.floor(num(ch.minRarity, 0)), 0, 3), luck: num(ch.luck, 25), pickupRadius: num(ch.pickupRadius, 1.8),
      minPlayerDistance: num(ch.minPlayerDistance, 8), area: U.clamp(num(ch.area, 31), 5, 36),
    };
    const br = d.barrels || {}, brEv = Array.isArray(br.every) ? br.every : [];
    G.BARRELS = {
      first: Math.max(0, num(br.first, 70)), every: [Math.max(5, num(brEv[0], 100)), Math.max(5, num(brEv[1], num(brEv[0], 160)))], maxStanding: Math.max(0, Math.floor(num(br.maxStanding, 2))),
      levels: Math.max(1, Math.floor(num(br.levels, 1))), pickupRadius: num(br.pickupRadius, 1.6), minPlayerDistance: num(br.minPlayerDistance, 10), area: U.clamp(num(br.area, 31), 5, 36),
    };
    const dg = d.dungeon || {}, dgA = Array.isArray(dg.appearAt) ? dg.appearAt : [], dgP = Array.isArray(dg.packSize) ? dg.packSize : [];
    const dgB = {};
    for (const [id, wt] of entries(dg.bosses)) { if (G.ENEMIES[id] && G.ENEMIES[id].boss) { if (num(wt, 0) > 0) dgB[id] = num(wt, 1); } else warn(`stages.json dungeon.bosses: "${id}" is not a boss in enemies.json`); }
    G.DUNGEON = {
      chance: U.clamp(num(dg.chance, 0.75), 0, 1), appearAt: [Math.max(0, num(dgA[0], 90)), Math.max(0, num(dgA[1], num(dgA[0], 360)))], stay: Math.max(5, num(dg.stay, 150)),
      modifiers: Array.isArray(dg.modifiers) && dg.modifiers.length ? dg.modifiers.map((n) => Math.max(0, Math.floor(num(n, 0)))) : [2],
      chambers: U.clamp(Math.floor(num(dg.chambers, 3)), 1, 6), packs: U.clamp(Math.floor(num(dg.packs, 10)), 1, 40), packSize: [Math.max(1, Math.floor(num(dgP[0], 50))), Math.max(1, Math.floor(num(dgP[1], num(dgP[0], 75))))],
      elites: Math.max(0, Math.floor(num(dg.elites, 3))), wakeRadius: Math.max(2, num(dg.wakeRadius, 14)), hpMult: Math.max(0.01, num(dg.hpMult, 3)), damageMult: Math.max(0.01, num(dg.damageMult, 3)),
      bosses: Object.keys(dgB).length ? dgB : { [Object.values(G.ENEMIES).find((e) => e.boss).id]: 1 },
      chests: Math.max(0, Math.floor(num(dg.chests, 1))), chestMinRarity: Math.max(0, Math.floor(num(dg.chestMinRarity, 0))), chestLuck: num(dg.chestLuck, 30), chestLevelBonus: Math.max(0, Math.floor(num(dg.chestLevelBonus, 2))),
      bossHp: Math.max(0.01, num(dg.bossHp, 1)), items: Math.max(0, Math.floor(num(dg.items, 3))), itemMinRarity: Math.max(0, Math.floor(num(dg.itemMinRarity, 1))),
      itemLuck: num(dg.itemLuck, 60), itemLevelBonus: Math.max(0, Math.floor(num(dg.itemLevelBonus, 2))), essence: Math.max(0, num(dg.essence, 60)), pickupRadius: num(dg.pickupRadius, 2.4),
      levels: Math.max(0, Math.floor(num(dg.levels, 1))),
    };
    const sr = d.shrines || {}, srE = Array.isArray(sr.every) ? sr.every : [], sf = sr.faith || {}, sa = sr.apostasy || {};
    G.SHRINES = {
      first: Math.max(0, num(sr.first, 45)), every: [Math.max(5, num(srE[0], 90)), Math.max(5, num(srE[1], num(srE[0], 150)))], maxStanding: Math.max(0, Math.floor(num(sr.maxStanding, 1))),
      pickupRadius: num(sr.pickupRadius, 1.8), minPlayerDistance: num(sr.minPlayerDistance, 8), area: U.clamp(num(sr.area, 31), 5, 36),
      unholyChance: U.clamp(num(sr.unholyChance, 0.5), 0, 1), nightFromStage: Math.max(0, Math.floor(num(sr.nightFromStage, 3))),
      faith: { buff: buffRef(sf.buff || 'empowered_faith', 'stages.json shrines.faith.buff'), radius: num(sf.radius, 2), burn: num(sf.burn, 0.4) },
      apostasy: { buff: buffRef(sa.buff || 'apostasy', 'stages.json shrines.apostasy.buff'), drain: Math.max(0, num(sa.drain, 0.05)), total: U.clamp(num(sa.total, 0.9), 0, 1), bleedMult: Math.max(0, num(sa.bleedMult, 2)) },
    };
    const mk = d.mokosh || {}, mkE = Array.isArray(mk.every) ? mk.every : [], mkB = mk.ban || {}, mkW = mk.weave || {}, mkP = Array.isArray(mkW.prices) ? mkW.prices : [];
    G.MOKOSH = {
      first: Math.max(0, num(mk.first, 100)), every: [Math.max(5, num(mkE[0], 130)), Math.max(5, num(mkE[1], num(mkE[0], 200)))], maxStanding: Math.max(0, Math.floor(num(mk.maxStanding, 1))),
      stay: Math.max(1, num(mk.stay, 15)), pickupRadius: num(mk.pickupRadius, 2.6), minPlayerDistance: num(mk.minPlayerDistance, 8), area: U.clamp(num(mk.area, 30), 5, 36),
      ban: { cost: Math.max(0, num(mkB.cost, 100)), growth: Math.max(0, num(mkB.growth, 0.5)) },
      weave: { prices: [80, 160, 320, 640].map((p, i) => Math.max(0, num(mkP[i], p))), growth: Math.max(0, num(mkW.growth, 0.5)) },
    };
    const tp = d.talentPoints || {};
    G.TALENT_CAP = { totem: Math.max(0, Math.floor(num(tp.totems, 5))), spoon: Math.max(0, Math.floor(num(tp.spoons, 1))) };
    const xp = d.experience || {};
    G.XP = { mult: Math.max(0, num(xp.mult, 1)), base: num(xp.levelBase, 5), per: num(xp.perLevel, 4), curve: num(xp.curve, 0.9), power: num(xp.curvePower, 1.55), exp: Math.max(0.1, num(xp.exponent, 1)) };
    // the danger stages every map shares
    let sky = SKY0, hp = 1, dmg = 1, spawn = 1;
    const base = live(d.stages).map((s, i) => {
      sky = Object.assign({}, sky, s.sky);
      hp = num(s.hpMult, hp); dmg = num(s.damageMult, dmg); spawn = Math.max(0.1, num(s.spawnMult, spawn));
      return { name: s.name || `Stage ${i + 1}`, message: s.message || '', hp, dmg, spawn, sky };
    });
    if (!base.length) throw new Error('stages.json has no stages');
    // each map adds its own spawn tables (and sky changes) on top of them
    G.MAPS = live(d.maps).map((m, mi) => {
      const where = `stages.json map ${m.id || mi + 1}`;
      let spawns = null, horde = null, msky = {};
      const stages = base.map((b, i) => {
        const o = (Array.isArray(m.stages) && m.stages[i]) || {}, w = `${where} stage ${i + 1}`;
        msky = Object.assign({}, msky, o.sky);
        if (Array.isArray(o.spawns) && o.spawns.length) {
          spawns = o.spawns.map((x, j) => ({ at: num(x.at, 0), weights: cleanWeights(x.weights, `${w} spawns[${j}]`) })).sort((p, q) => p.at - q.at);
        }
        if (!spawns) spawns = [{ at: 0, weights: cleanWeights({}, w) }];
        horde = o.horde ? cleanWeights(o.horde, `${w} horde`) : horde || spawns[spawns.length - 1].weights;
        return { name: b.name, message: b.message, hp: b.hp, dmg: b.dmg, spawn: b.spawn, sky: toPhase(Object.assign({}, b.sky, msky)), spawns, horde };
      });
      const il = Array.isArray(m.itemLevel) ? m.itemLevel : [1, 1], lo = Math.max(1, Math.floor(num(il[0], 1)));
      const bosses = {};
      for (const [id, wt] of entries(m.bosses)) {
        if (G.ENEMIES[id] && G.ENEMIES[id].boss) { if (num(wt, 0) > 0) bosses[id] = num(wt, 1); } else warn(`${where} bosses: "${id}" is not a boss in enemies.json`);
      }
      return {
        id: m.id || `map${mi + 1}`, name: m.name || `Map ${mi + 1}`, message: m.message || '', hp: num(m.hpMult, 1), dmg: num(m.damageMult, 1),
        itemLevel: [lo, Math.max(lo, Math.floor(num(il[1], lo)))], tags: Array.isArray(m.gear) ? m.gear.slice() : m.alienGear ? ['alien'] : [],
        ground: ['alien', 'swamp', 'void'].includes(m.ground) ? m.ground : 'farm', decor: m.decor || '', bosses, stages,
        weather: ['rain', 'motes'].includes(m.weather) ? m.weather : '', music: ['farm', 'alien', 'spirit', 'madness'].includes(m.music) ? m.music : ['farm', 'alien', 'spirit', 'madness'][mi] || 'farm', fog: Array.isArray(m.fog) ? [num(m.fog[0], 38), num(m.fog[1], 110)] : [38, 110],
        warp: Array.isArray(m.warp) ? [U.clamp(num(m.warp[0], 0), 0, 2), U.clamp(num(m.warp[1], num(m.warp[0], 0)), 0, 2)] : [0, 0], shrines: m.shrines === 'unholy' ? 'unholy' : '',
        events: m.events ? Object.fromEntries(Object.entries(m.events).map(([k, v]) => [k, Math.max(0, num(v, 0))])) : null,
      };
    });
    if (!G.MAPS.length) throw new Error('stages.json has no maps');
    G.STAGES = G.MAPS[0].stages;
    const ev = d.events || {}, rr = ev.rares || {}, ew = ev.weights || {};
    G.EVENTS = {
      every: Math.max(5, num(ev.every, 30)),
      weights: { boss: Math.max(0, num(ew.boss, 1)), rares: Math.max(0, num(ew.rares, 2)), invasion: Math.max(0, num(ew.invasion, 1)), ritual: Math.max(0, num(ew.ritual, 0)), cauldron: Math.max(0, num(ew.cauldron, 0)), gaze: Math.max(0, num(ew.gaze, 0)), darkness: Math.max(0, num(ew.darkness, 0)) },
      bossWarning: Math.max(0, num(ev.bossWarning, 6)), maxBosses: Math.max(1, Math.floor(num(ev.maxBosses, 2))),
      rares: {
        count: Math.max(1, Math.floor(num(rr.count, 2))), hp: num(rr.hp, 10), damage: num(rr.damage, 1.4), size: num(rr.size, 1.35), xp: num(rr.xp, 15), essence: num(rr.essence, 10),
        modifiers: Array.isArray(rr.modifiers) && rr.modifiers.length ? rr.modifiers.map((n) => Math.max(0, Math.floor(num(n, 0)))) : [1],
      },
    };
    const rt = d.ritual || {};
    G.RITUAL = {
      doctor: G.ENEMIES[rt.doctor] ? rt.doctor : null, demon: G.ENEMIES[rt.demon] ? rt.demon : null, doctors: Math.max(1, Math.floor(num(rt.doctors, 4))),
      radius: num(rt.radius, 6), stackEvery: Math.max(0.5, num(rt.stackEvery, 3)), stackHp: Math.max(0, num(rt.stackHp, 0.1)), maxTime: Math.max(5, num(rt.maxTime, 90)),
      minPlayerDistance: num(rt.minPlayerDistance, 16), warning: Math.max(0, num(rt.warning, 2)),
    };
    if ((rt.doctor && !G.RITUAL.doctor) || (rt.demon && !G.RITUAL.demon)) warn('stages.json ritual: unknown doctor or demon enemy');
    const cd = d.cauldron || {};
    G.CAULDRON = { enemy: G.ENEMIES[cd.enemy] ? cd.enemy : null, max: Math.max(1, Math.floor(num(cd.max, 3))), minPlayerDistance: num(cd.minPlayerDistance, 12) };
    if (cd.enemy && !G.CAULDRON.enemy) warn(`stages.json cauldron: unknown enemy "${cd.enemy}"`);
    const gz = d.gaze || {}, gws = Array.isArray(gz.waveSize) ? gz.waveSize : [], gt = gz.tentacle || {}, gb = gz.boss || {};
    const known = (id, where) => { if (id && G.ENEMIES[id]) return id; warn(`stages.json gaze${where}: unknown enemy "${id}"`); return null; };
    const gww = {};
    for (const [id, wt] of entries(gz.waveWeights || { voidling: 1 })) if (known(id, '.waveWeights') && num(wt, 0) > 0) gww[id] = num(wt, 1);
    G.GAZE = {
      radius: Math.max(2, num(gz.radius, 6)), damage: Math.max(0, num(gz.damage, 0.25)), push: Math.max(0, num(gz.push, 22)), minPlayerDistance: num(gz.minPlayerDistance, 14),
      waveEvery: Math.max(1, num(gz.waveEvery, 8)), waveSize: [Math.max(1, num(gws[0], 8)), Math.max(0, num(gws[1], 2))], waveMax: Math.max(1, Math.floor(num(gz.waveMax, 30))),
      waveWeights: gww, eliteChance: U.clamp(num(gz.eliteChance, 0.12), 0, 1),
      tentacle: { enemy: known(gt.enemy || 'eldritch_tentacle', '.tentacle'), everyWaves: Math.max(1, Math.floor(num(gt.everyWaves, 3))), count: Math.max(0, Math.floor(num(gt.count, 3))),
        reach: num(gt.reach, 6), radius: num(gt.radius, 2.6), wind: Math.max(0.1, num(gt.wind, 0.9)), every: Math.max(0.2, num(gt.every, 1.8)), damage: num(gt.damage, 1.4) },
      gurgleEvery: Math.max(0.5, num(gz.gurgleEvery, 5)), gurgleWarn: Math.max(0, num(gz.gurgleWarn, 1)), gurgleStun: Math.max(0, num(gz.gurgleStun, 2)),
      boss: { enemy: known(gb.enemy || 'cthulhu', '.boss'), reach: num(gb.reach, 16), every: Math.max(0.3, num(gb.every, 2.4)), blows: Math.max(1, Math.floor(num(gb.blows, 4))),
        wind: Math.max(0.1, num(gb.wind, 0.8)), stagger: Math.max(0, num(gb.stagger, 0.15)), spread: num(gb.spread, 3.5), radius: num(gb.radius, 2.2), damage: num(gb.damage, 0.9) },
    };
    G.GAZE.enemy = Object.keys(gww).length ? Object.keys(gww)[0] : null;   // the event is on while there is something to pulse out
    const dk = d.darkness || {};
    G.DARKNESS = { radius: Math.max(2, num(dk.radius, 6)), warning: Math.max(1, num(dk.warning, 7)), dark: Math.max(0.5, num(dk.dark, 5)), grace: Math.max(0.1, num(dk.grace, 1.2)),
      minDistance: Math.max(0, num(dk.minDistance, 10)), maxDistance: Math.max(1, num(dk.maxDistance, 20)) };
    const b = d.boss || {};
    G.BOSS = { hpPerBoss: num(b.hpPerBoss, 0.25), sizePerBoss: num(b.sizePerBoss, 0.08), maxSizeSteps: num(b.maxSizeSteps, 4) };
    const a = d.altar || {};
    G.ALTAR = {
      enemy: G.ENEMIES[a.enemy] ? a.enemy : null, first: num(a.first, 50), every: Math.max(10, num(a.every, 60)), summonDelay: num(a.summonDelay, 1.8), pickupRadius: num(a.pickupRadius, 1.8),
      buff: buffRef(a.buff, 'stages.json altar.buff'),
      minPlayerDistance: num(a.minPlayerDistance, 14), area: U.clamp(num(a.area, 31), 5, 36),
      summonGrowth: Math.max(1, num(a.summonGrowth, 1)), maxSummons: Math.max(1, Math.floor(num(a.maxSummons, 1))),
      modifiers: Array.isArray(a.modifiers) && a.modifiers.length ? a.modifiers.map((n) => Math.max(0, Math.floor(num(n, 0)))) : [1],
    };
    if (a.enemy && !G.ALTAR.enemy) warn(`stages.json altar: unknown enemy "${a.enemy}", altars are off`);
    if (d.invasion) {
      const v = d.invasion, pl = v.pillar || {}, rw = v.reward || {};
      G.INVASION = {
        minPlayerDistance: num(v.minPlayerDistance, 14), landDelay: Math.max(0.2, num(v.landDelay, 2.5)), rares: Math.max(1, Math.floor(num(v.rares, 2))),
        raresGrowth: Math.max(1, num(v.raresGrowth, 1)), maxRares: Math.max(1, Math.floor(num(v.maxRares, 32))),
        modifiers: Array.isArray(v.modifiers) && v.modifiers.length ? v.modifiers.map((n) => Math.max(0, Math.floor(num(n, 0)))) : [2],
        rareHp: num(v.rareHp, 14), rareDamage: num(v.rareDamage, 1.5), rareSize: num(v.rareSize, 1.6), rareXp: num(v.rareXp, 25),
        pillar: { radius: num(pl.radius, 2.6), speed: num(pl.speed, 3.2), playerDamage: num(pl.playerDamage, 14), monsterDamage: num(pl.monsterDamage, 0.6), bossDamage: num(pl.bossDamage, 0.02), spawnEvery: Math.max(0.3, num(pl.spawnEvery, 2.2)) },
        reward: { spoons: Math.max(0, Math.floor(num(rw.spoons, 1))), xp: num(rw.xp, 0), items: Array.isArray(rw.items) ? rw.items : [], buff: buffRef(rw.buff, 'stages.json invasion.reward.buff') },
      };
    } else G.INVASION = null;
    const cp = d.camp || {}, pt = (v, def) => (Array.isArray(v) && v.length === 2 ? [num(v[0], def[0]), num(v[1], def[1])] : def);
    G.CAMP = {
      workbench: pt(cp.workbench, [22, -18.5]), trapdoor: pt(cp.trapdoor, [28.5, -17]), dummy: pt(cp.dummy, [-25, -37.4]), travelTime: Math.max(0, num(cp.travelTime, 1.5)),
    };
    const ug = cp.upgrade || {}, ugr = Array.isArray(ug.rarity) ? ug.rarity : [];
    G.CAMP.upgrade = { levels: Math.max(0, Math.floor(num(ug.levels, 3))), cost: Math.max(0, num(ug.cost, 12)), rarity: [1, 2, 3.5].map((v, i) => Math.max(0, num(ugr[i], v))), growth: Math.max(0, num(ug.growth, 0.5)) };
    const sh = cp.shop || {}, pr = Array.isArray(sh.prices) ? sh.prices : [];
    G.CAMP.shop = {
      offers: U.clamp(Math.floor(num(sh.offers, 4)), 1, 8), prices: [60, 120, 240, 480].map((p, i) => Math.max(0, num(pr[i], p))),
      priceGrowth: Math.max(0, num(sh.priceGrowth, 0.12)), reroll: Math.max(0, num(sh.reroll, 20)), rerollGrowth: Math.max(0, num(sh.rerollGrowth, 20)),
    };
    G.SPAWNING = merged({
      monsterMult: 1,
      maxEnemies: { base: 60, perSecond: 0.2, perStage: 12, cap: 220 },
      rate: { base: 0.7, rampSeconds: 55, max: 7, perStage: 0.1, whileBossAlive: 0.55 },
      elites: { after: 50, chance: 0.02, perStage: 0.006 },
      hordes: { first: 40, every: [28, 40], size: 8, sizePerStage: 4, sizePerMinute: 1, maxSize: 40, warning: 2.4 },
      packSize: { base: 4, perStage: 2 },
    }, d.spawning);
    G.CAVE_NAMES = Array.isArray(d.caveNames) ? d.caveNames : [];
  }
  // The day's map (the last one repeats) and how many days past the last map the run has gone.
  G.mapAt = (day) => G.MAPS[Math.min(day, G.MAPS.length - 1)];
  G.map = () => G.mapAt(G.day || 0);
  G.extraDays = () => Math.max(0, (G.day || 0) - (G.MAPS.length - 1));
  G.stageAt = (tier) => G.STAGES[U.clamp(tier, 0, G.STAGES.length - 1)];
  // Steady growth: + a share per minute of fighting so far, on top of the stage and map multipliers.
  const growth = (k) => 1 + G.GROWTH[k] * G.time / 60;
  G.diffHp = () => G.stageAt(G.tier).hp * G.map().hp * Math.pow(G.ENDLESS.hp, G.extraDays()) * growth('hp');
  G.diffDmg = () => G.stageAt(G.tier).dmg * G.map().dmg * Math.pow(G.ENDLESS.dmg, G.extraDays()) * growth('dmg');
  G.spawnMult = () => G.stageAt(G.tier).spawn * G.SPAWNING.monsterMult;
  // Lists indexed by danger (stages of every day so far); the last value repeats.
  const perStage = (list, danger) => list[Math.min(danger, list.length - 1)];
  G.altarModCount = (danger) => perStage(G.ALTAR.modifiers, danger);
  G.invasionModCount = (danger) => perStage(G.INVASION.modifiers, danger);
  G.rareModCount = (danger) => perStage(G.EVENTS.rares.modifiers, danger);
  G.dungeonModCount = (danger) => perStage(G.DUNGEON.modifiers, danger);
  G.xpNeeded = (L) => Math.round(Math.pow(G.XP.base + (L - 1) * G.XP.per + Math.pow(L - 1, G.XP.power) * G.XP.curve, G.XP.exp));

  // ---------- rarity rolls & item generation ----------
  G.blockChance = (rating) => 0.75 * rating / (rating + 100);   // hyperbolic: 100 rating = 37.5%, approaches 75%
  // table: G.RARITY (blessings, the default) or G.ITEM_RARITY (gear)
  G.rollRarity = function (luck = 0, min = 0, table = G.RARITY) {
    const L = Math.max(0, luck) / 100;
    min = U.clamp(min, 0, table.length - 1);
    const w = table.map((r, i) => (i < min ? 0 : r.luckFactor < 0 ? r.weight / (1 + L * -r.luckFactor) : r.weight * (1 + L * r.luckFactor)));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0 && w[i] > 0) return i; }
    return table.length - 1;
  };
  G.rollItemRarity = (luck = 0, min = 0) => G.rollRarity(luck, min, G.ITEM_RARITY);

  // Stat values are kept tidy: percentages to 1% (0.1% for fine ones), whole numbers at least 1.
  const tidy = (stat, v) => {
    const f = G.STATS[stat];
    if (f.pct) return Math.round(v * (f.dec ? 1000 : 100)) / (f.dec ? 1000 : 100);
    return f.dec ? Math.round(v * 10) / 10 : Math.max(1, Math.round(v));
  };
  // Item level: every level multiplies the stats in ILVL.scaling (and weapon damage) by 1 + perLevel,
  // compounding; whole-number stats in ILVL.steps gain their base again every stepEvery levels. The
  // rolled values (at level 1) live in baseMods / baseLo / baseHi; mods / dmg are what the item gives.
  G.itemLevelMult = (lvl) => Math.pow(1 + G.ILVL.perLevel, Math.max(0, lvl - 1));
  // every other stat (chances, speeds, luck...) grows more gently, added up per level
  G.itemLevelOther = (lvl) => 1 + G.ILVL.otherPerLevel * Math.max(0, lvl - 1);
  G.itemLevelValue = function (stat, v, lvl) {
    if (G.ILVL.steps.has(stat)) return v * (1 + Math.floor((Math.max(1, lvl) - 1) / G.ILVL.stepEvery));
    return v * (G.ILVL.scaling.has(stat) ? G.itemLevelMult(lvl) : G.itemLevelOther(lvl));
  };
  G.setItemLevel = function (it, lvl) {
    it.ilvl = lvl;
    it.mods = {};
    for (const s in it.baseMods) it.mods[s] = tidy(s, G.itemLevelValue(s, it.baseMods[s], lvl));
    if (it.slot === 'weapon') G.weaponNumbers(it);
  };
  // A weapon item's own numbers: its rolled damage range (x item level and its increased damage),
  // attacks per second (x its attack speed) and base crit (x its increased crit chance).
  G.weaponNumbers = function (it) {
    const W = G.WEAPONS[it.wtype], k = G.itemLevelMult(it.ilvl || 1), m = it.mods;
    const d = k * (1 + (m.wDmg || 0));
    it.dmgLo = Math.max(1, Math.round(it.baseLo * d)); it.dmgHi = Math.max(it.dmgLo, Math.round(it.baseHi * d));
    it.dmg = (it.dmgLo + it.dmgHi) / 2;
    it.aps = Math.round(W.aps * (1 + (m.wSpeed || 0)) * 100) / 100;
    it.crit = Math.round(W.crit * (1 + (m.wCrit || 0)) * 1000) / 1000;
  };
  // The item level of a drop on this map: it climbs through the map's range as the day goes on
  // (give or take one). bonus: levels above that (bosses, dungeons), still within the map's range.
  G.rollItemLevel = function (bonus = 0) {
    const [lo, hi] = G.map().itemLevel, up = Math.round(G.extraDays() * G.ENDLESS.ilvl), p = U.clamp((G.dayT || 0) / G.DAY_SECONDS, 0, 1);
    return up + U.clamp(Math.round(lo + (hi - lo) * p + U.rnd(-1.4, 1.4) + bonus), lo, hi);
  };

  let itemSeq = 0;
  // tier: unused (item level decides the numbers). o: { ilvl, tags: themed weapons and gear that may drop
  // (the map's gear tags), alien: same as tags ['alien'] }
  G.makeItem = function (slot, rarity, tier, wtype, o = {}) {
    rarity = U.clamp(rarity | 0, 0, G.ITEM_RARITY.length - 1);
    const it = { id: ++itemSeq, slot, rarity, baseMods: {}, baseStats: {} }, R = G.ITEM_RARITY[rarity], S = G.ITEM_SCALING;
    const tags = (o.tags || []).concat(o.alien ? ['alien'] : []), ok = (x) => !x.tag || tags.includes(x.tag);
    if (slot === 'weapon') {
      if (!wtype) { const pool = Object.values(G.WEAPONS).filter((w) => w.dropWeight > 0 && ok(w)); wtype = pool.length ? U.weighted(pool, (w) => w.dropWeight).id : G.CHAR.weapon; }
      const W = G.WEAPONS[wtype];
      it.wtype = wtype; it.model = W.model; it.base = W.name; it.alien = W.alien; it.tag = W.tag; it.wclass = W.class;
      // the damage range: each end moves a little, never past 0.7x-1.3x of the middle
      const mid = W.dmg * R.weaponDamage, roll = () => U.rnd(1 - S.weaponRoll, 1 + S.weaponRoll);
      it.baseLo = mid * U.clamp(W.dmgLo * roll(), 0.7, 1); it.baseHi = mid * U.clamp(W.dmgHi * roll(), 1, 1.3);
      if (W.block > 0) it.baseStats.blockRating = W.block;   // weapons that swing can block (instead of armor)
    } else {
      const pool = G.GEAR[slot].filter(ok), b = U.pick(pool.length ? pool : G.GEAR[slot]);
      it.base = b.name; it.model = b.model; it.color = b.color; it.alien = b.alien; it.tag = b.tag; it.set = b.set;
      for (const k in b.implicit) G.addStat(it.baseStats, k, b.implicit[k]);   // the base item's own stats
    }
    // armor (every slot but the weapon)
    const A = G.ARMOR[slot];
    if (A && A[1] > 0) it.baseStats.armor = Math.max(1, Math.round(U.rnd(A[0], A[1])));
    it.name = (U.pick(R.prefixes) + ' ' + it.base).trim();
    G.rollAffixes(it);
    G.setItemLevel(it, o.ilvl || 1);
    return it;
  };
  // ---------- modifiers ----------
  function rollAffix(it, a) {
    const R = G.ITEM_RARITY[it.rarity], S = G.ITEM_SCALING, steps = G.ILVL.steps.has(a.stat);
    G.addStat(it.baseMods, a.stat, steps ? a.base : tidy(a.stat, a.base * R.affixPower * U.rnd(1 - S.affixRoll, 1 + S.affixRoll)));
  }
  // Fresh modifiers for the item's rarity (its base stats and armor stay): Common none, Magic two, Rare three.
  G.rollAffixes = function (it) {
    const R = G.ITEM_RARITY[it.rarity], pool = G.AFFIXES.filter((a) => a.weight > 0 && a.slots.includes(it.slot) && (!a.alienOnly || it.alien)
      && (!a.weaponClass || it.slot !== 'weapon' || a.weaponClass === it.wclass));
    it.baseMods = Object.assign({}, it.baseStats);
    for (let i = 0; i < R.affixes && pool.length; i++) { const a = U.weighted(pool, (x) => x.weight); pool.splice(pool.indexOf(a), 1); rollAffix(it, a); }
  };
  // How good an item is, at a glance. Weapons: an estimate of their damage per second (hits per attack
  // included); every item: power = its stat lines measured against their level-1 modifier (10 each).
  G.itemPower = function (it) {
    let power = 0;
    for (const k in it.mods) { const b = G.AFFIX_BASE[k]; power += b ? Math.abs(it.mods[k]) / b * 10 : 5; }
    const out = { power: Math.round(power) };
    if (it.slot === 'weapon') {
      const W = G.WEAPONS[it.wtype], pr = W.proj, spread = pr.kind === 'pellet' || pr.kind === 'flame' || pr.ring ? 0.5 : 1;
      const hits = (W.melee ? 1 : 0) + pr.count * pr.dmgMul * spread;
      out.dps = Math.round(it.dmg * it.aps * (1 + it.crit * 0.5) * Math.max(1, hits));
    }
    out.score = out.dps != null ? out.dps * (1 + power / 100) : power;
    return out;
  };
  // ---------- the workbench's Upgrade: up to CAMP.upgrade.levels item levels per item, for essence ----------
  G.upgradesLeft = (it) => Math.max(0, G.CAMP.upgrade.levels - (it.upgrades || 0));
  // Essence for n more item levels.
  G.upgradeCost = function (it, n) {
    const U2 = G.CAMP.upgrade, r = U2.rarity[Math.min(it.rarity, U2.rarity.length - 1)];
    let c = 0;
    for (let k = 0; k < n; k++) c += Math.round(U2.cost * ((it.ilvl || 1) + k + 2) * r * (1 + U2.growth * ((it.upgrades || 0) + k)));
    return c;
  };
  // What n more item levels would change: [{ t: 'old → new' }] for the damage range and every stat.
  G.upgradePreview = function (it, n) {
    const to = Object.assign({}, it, { mods: {} });
    G.setItemLevel(to, (it.ilvl || 1) + n);
    const out = [];
    if (it.slot === 'weapon' && (to.dmgLo !== it.dmgLo || to.dmgHi !== it.dmgHi)) out.push({ t: `${it.dmgLo}–${it.dmgHi} damage → ${to.dmgLo}–${to.dmgHi}` });
    if (it.slot === 'weapon' && to.aps !== it.aps) out.push({ t: `${it.aps.toFixed(2)} attacks/s → ${to.aps.toFixed(2)}` });
    for (const k in it.mods) if (to.mods[k] !== it.mods[k]) out.push({ t: `${G.fmtMod(k, it.mods[k])} → ${G.fmtVal(k, to.mods[k])}` });
    return out;
  };
  // Is this item better than what you wear in its slot? (true when the slot is empty; false for the one you wear)
  G.isUpgrade = function (it) {
    const cur = G.equip && G.equip[it.slot];
    if (!cur || cur === it) return !cur;
    return G.itemPower(it).score > G.itemPower(cur).score * 1.001;
  };
  G.starterWeapon = function () {
    const c = G.CHAR, it = G.makeItem('weapon', 0, 0, c.weapon), W = G.WEAPONS[c.weapon];
    if (c.weaponName) it.name = c.weaponName;
    it.baseLo = W.dmg * W.dmgLo; it.baseHi = W.dmg * W.dmgHi;
    it.baseStats = W.block > 0 ? { blockRating: W.block } : {}; it.baseMods = Object.assign({}, it.baseStats);
    G.setItemLevel(it, 1);
    return it;
  };
  G.itemLines = function (it) {
    const lines = [];
    if (it.slot === 'weapon') {
      const W = G.WEAPONS[it.wtype];
      lines.push({ t: `${it.dmgLo}–${it.dmgHi} damage · ${it.aps.toFixed(2)} attacks/s · ${+(it.crit * 100).toFixed(1)}% base crit`, cls: 'base' });
      if (W.implicit && W.implicit.text) lines.push({ t: W.implicit.text, cls: 'implicit' });
      if (W.desc) lines.push({ t: W.desc, cls: 'meta' });
    }
    // armor and the base item's own stats first, then the rolled modifiers
    const mods = Object.keys(it.mods), base = (k) => !!it.baseStats && k in it.baseStats && it.baseStats[k] === it.baseMods[k];
    for (const k of mods.filter(base).concat(mods.filter((k) => !base(k)))) lines.push({ t: G.fmtMod(k, it.mods[k]), cls: base(k) ? 'basestat' : '' });
    // gear sets: how many pieces you wear and what each bonus gives
    const S = it.set && G.SETS[it.set];
    if (S) {
      const worn = G.SLOTS.filter((s) => G.equip && G.equip[s] && G.equip[s].set === it.set).length;
      lines.push({ t: `${S.name} set · ${worn} worn`, cls: 'meta' });
      for (const b of S.bonuses) lines.push({ t: `(${b.n}) ${Object.keys(b.stats).map((k) => G.fmtMod(k, b.stats[k])).join(', ')}`, cls: worn >= b.n ? 'up' : 'meta' });
    }
    return lines;
  };
})();
