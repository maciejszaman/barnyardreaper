'use strict';
// Talent rules: talents built from data alone (the talent creator, tools/talents/), with no code of their
// own. A talent in a *_talents.json file can carry, next to its stats and effect:
//   "rules":            [{ "when": trigger, "chance", "every", "cooldown", "if": [conditions], "then": [actions] }]
//   "conditionalStats": [{ "if": [conditions], "stats": { stat: value per rank } }]
//   "hitBonus":         [{ "if": [conditions], "more": 0.3 }]   (more damage on weapon hits that pass)
// A condition is { "check": id, "not": true?, ...its numbers }, an action { "do": id, ...its numbers }.
// Any number in a rule may be a list instead, one value per rank ([0.1, 0.2, 0.3]).
// RU.TRIGGERS / CONDITIONS / ACTIONS below are the vocabulary, with every number's default; the talent
// creator builds its forms from them, so anything added here shows up there.
(function () {
  const U = G.U;
  const RU = G.rules = { state: {}, by: {}, cond: [], bonus: [], emp: [], zones: [], kills: [], t: 0, active: {}, busy: {} };

  // ---------- vocabulary ----------
  // param: { k: key, t: type, d: default, label, help, opts (enum), u: unit }. Types: num, int, pct (a
  // fraction shown as %), sec, enum, bool, str, color, buff (an id, or a new buff written in place),
  // trinket, sound, enemies / weapons / maps (lists of ids).
  const p = (k, t, d, label, more) => Object.assign({ k, t, d, label }, more);
  const STATUS_OPTS = ['slow', 'shock', 'stun', 'root'];
  const AT = p('at', 'enum', 'target', 'Where', { opts: ['target', 'player', 'nearest', 'random', 'strongest', 'weakest'],
    help: 'target = the monster the trigger is about (else you) · player = you · nearest / random / strongest / weakest = a monster within range of you' });
  const RANGE = p('range', 'num', 12, 'Search range', { u: 'm', help: 'How far from you nearest / random / strongest / weakest look.' });
  const COUNT = p('count', 'int', 1, 'Times', { help: 'Repeats the action (random picks a new monster every time).' });
  const OF = p('of', 'enum', 'weapon', 'Based on', { opts: ['hit', 'weapon', 'maxHp', 'targetMaxHp', 'targetHp', 'taken', 'armor', 'level', 'flat'],
    help: 'hit = the damage of the hit that triggered it (else your hit damage) · weapon = your hit damage · maxHp = your max health · targetMaxHp / targetHp = the monster\'s max / current health · taken = the damage you just took · armor = your armor · level = your level · flat = just the number' });
  const MULT = p('mult', 'num', 1, 'Multiplier', { help: 'Share of "Based on": 1 = 100%. With "flat", the amount itself.' });
  const SCALE = p('scale', 'bool', true, 'Raised by damage bonuses', { help: 'Damage bonuses (Damage, Elemental damage, Explosions...) raise it. Hits and weapon damage already carry your weapon bonuses.' });
  const DMG = [OF, MULT, SCALE];
  const RADIUS0 = p('radius', 'num', 0, 'Radius', { u: 'm', help: '0 = only that monster; above 0 = every monster that close to it.' });
  const BOSSES = p('bosses', 'bool', true, 'Works on bosses');
  RU.OF = OF.opts; RU.AT = AT.opts;

  RU.TRIGGERS = {
    hit: { name: 'You hit a monster', target: true, desc: 'Every weapon hit: swings, projectiles, ricochets, screams, fireballs, dash strikes. Not damage over time, explosions or talent damage.' },
    crit: { name: 'You land a critical hit', target: true },
    kill: { name: 'You kill a monster', target: true, desc: 'Any monster dying to anything you do.' },
    attack: { name: 'You attack', desc: 'Every attack you make (follow-up strikes do not count).' },
    damaged: { name: 'You take damage', target: true, desc: 'After armor, block and shields. The target is the monster that hit you, when there is one.' },
    block: { name: 'You block a hit', target: true },
    lowHealth: { name: 'Your health falls below a share', params: [p('threshold', 'pct', 0.3, 'Threshold')] },
    heal: { name: 'You are healed', desc: 'Every heal, even tiny ones (regeneration): give it a cooldown.' },
    dash: { name: 'You dash' },
    trinket: { name: 'You use your trinket' },
    levelUp: { name: 'You gain a level' },
    bleed: { name: 'You make a monster bleed', target: true },
    poison: { name: 'You poison a monster', target: true, desc: 'Every poison stack you apply. Very often: give it a cooldown or a chance.' },
    status: { name: 'You inflict a status', target: true, params: [p('status', 'enum', 'any', 'Status', { opts: ['any'].concat(STATUS_OPTS) })] },
    interval: { name: 'Every few seconds', params: [p('seconds', 'sec', 5, 'Seconds')] },
    still: { name: 'You stand still for a while', params: [p('seconds', 'sec', 1.5, 'Seconds')], desc: 'Goes off once, then again after you have moved.' },
    distance: { name: 'You walk a distance', params: [p('meters', 'num', 25, 'Meters', { u: 'm' })] },
    dayStart: { name: 'A fight begins', desc: 'The start of every day\'s fight.' },
    dawn: { name: 'Dawn breaks', desc: 'The end of every day\'s fight.' },
    bossAppears: { name: 'A boss appears', target: true },
  };
  RU.CONDITIONS = {
    targetStatus: { name: 'The monster has', target: true, params: [p('status', 'enum', 'bleeding', 'Status', { opts: ['bleeding', 'poisoned', 'burning', 'shocked', 'slowed', 'stunned', 'rooted', 'any'] }),
      p('stacks', 'int', 1, 'At least stacks', { help: 'Poison and holy fire stacks.' })] },
    targetKind: { name: 'The monster is', target: true, params: [p('kind', 'enum', 'boss', 'Kind', { opts: ['boss', 'elite', 'rare', 'invader', 'flying', 'normal'] })] },
    targetHealth: { name: 'The monster\'s health', target: true, params: [p('below', 'pct', 0.5, 'Below', { help: '100% = no upper limit' }), p('above', 'pct', 0, 'At least')] },
    targetEnemy: { name: 'The monster is one of', target: true, params: [p('ids', 'enemies', [], 'Monsters')] },
    targetDistance: { name: 'The monster is near you', target: true, params: [p('below', 'num', 4, 'Closer than', { u: 'm' }), p('above', 'num', 0, 'Further than', { u: 'm' })] },
    wasCrit: { name: 'The hit was critical' },
    myHealth: { name: 'Your health', params: [p('below', 'pct', 0.5, 'Below', { help: '100% = no upper limit' }), p('above', 'pct', 0, 'At least')] },
    myShield: { name: 'You have a shield' },
    myBuff: { name: 'You have a buff', params: [p('buff', 'buff', 'bloodlust', 'Buff')] },
    myStatus: { name: 'You suffer a status', params: [p('status', 'enum', 'any', 'Status', { opts: ['any'].concat(STATUS_OPTS, ['poison', 'bleed']) })] },
    moving: { name: 'You are moving' },
    enemiesNear: { name: 'Monsters around you', params: [p('radius', 'num', 5, 'Radius', { u: 'm' }), p('atLeast', 'int', 10, 'At least'), p('atMost', 'int', 0, 'At most', { help: '0 = no limit' })] },
    weaponClass: { name: 'You wield a weapon class', params: [p('class', 'enum', 'melee', 'Class', { opts: ['melee', 'firearm', 'magic'] })] },
    weapon: { name: 'You wield one of', params: [p('ids', 'weapons', [], 'Weapons')] },
    damageType: { name: 'Your weapon deals', params: [p('type', 'enum', 'physical', 'Damage type', { opts: ['physical', 'elemental'] })] },
    trinketReady: { name: 'Your trinket is ready' },
    dashReady: { name: 'You can dash' },
    killsRecent: { name: 'You killed recently', params: [p('count', 'int', 5, 'At least kills'), p('seconds', 'sec', 4, 'In the last seconds')] },
    hitRecently: { name: 'You were hit recently', params: [p('seconds', 'sec', 4, 'In the last seconds')] },
    bossAlive: { name: 'A boss is on the field' },
    level: { name: 'Your level is at least', params: [p('atLeast', 'int', 10, 'Level')] },
    map: { name: 'The map is one of', params: [p('ids', 'maps', [], 'Maps')] },
    dayTime: { name: 'Time into the day', params: [p('after', 'sec', 0, 'After (s)'), p('before', 'sec', 0, 'Before (s)', { help: '0 = no limit' })] },
    inDungeon: { name: 'You are in a dungeon' },
    darkness: { name: 'The Dark is falling' },
    chance: { name: 'Chance', params: [p('chance', 'pct', 0.5, 'Chance')] },
  };
  RU.ACTIONS = {
    explode: { name: 'Explosion', params: [AT, p('radius', 'num', 3, 'Radius', { u: 'm' }), ...DMG,
      p('type', 'enum', 'elemental', 'Kind', { opts: ['elemental', 'blood', 'acid'], help: 'blood = physical; acid also leaves a pool of acid.' }),
      p('style', 'enum', 'fire', 'Look', { opts: ['fire', 'meteor', 'holy', 'void', 'frost'] }), p('delay', 'sec', 0, 'Delay', { help: 'Seconds before it goes off (a warning circle shows where).' }), COUNT, RANGE],
      tags: (a) => ['explosion', 'area', a.type === 'blood' ? 'physical' : 'elemental'].concat(a.type === 'acid' ? ['acid'] : []) },
    strike: { name: 'Direct damage', params: [AT, ...DMG, p('type', 'enum', 'physical', 'Damage type', { opts: ['physical', 'elemental', 'poison'] }), RADIUS0, p('beam', 'bool', true, 'Draw a beam from you'), COUNT, RANGE],
      tags: (a) => ['hit', a.type] },
    lightning: { name: 'Chain lightning', params: [AT, p('chains', 'int', 5, 'Jumps'), ...DMG, p('jump', 'num', 9, 'Jump distance', { u: 'm' }), COUNT, RANGE], tags: () => ['elemental', 'lightning', 'shock'] },
    projectiles: { name: 'Projectiles', params: [p('kind', 'enum', 'knife', 'Projectile', { opts: ['knife', 'scythe', 'wave', 'bullet', 'pellet', 'dart', 'fireball', 'flame', 'flask'] }),
      p('count', 'int', 6, 'How many'), p('pattern', 'enum', 'ring', 'Pattern', { opts: ['ring', 'aimed', 'fan'] }), p('from', 'enum', 'player', 'From', { opts: ['player', 'target'] }),
      OF, Object.assign({}, MULT, { d: 0.5 }), p('speed', 'num', 18, 'Speed'), p('range', 'num', 12, 'Range', { u: 'm' }), p('pierce', 'int', 1, 'Pierce'),
      p('splash', 'num', 2.4, 'Splash (fireball, flask)', { u: 'm' }), p('ricochet', 'bool', false, 'Can ricochet')],
      tags: () => ['weapon', 'hit'], desc: 'Weapon hits of their own: they crit, poison and bleed like your weapon, but never set off "You hit a monster" rules.' },
    status: { name: 'Inflict a status', params: [p('status', 'enum', 'stun', 'Status', { opts: STATUS_OPTS }), p('duration', 'sec', 0, 'Seconds', { help: '0 = the status\'s own duration' }),
      p('shock', 'pct', 0.3, 'Shock strength', { help: 'Only for shock: more damage taken.' }), AT, RADIUS0, RANGE], tags: (a) => ['control'].concat(a.status === 'shock' ? ['shock', 'elemental'] : []) },
    poison: { name: 'Poison', params: [p('stacks', 'int', 3, 'Stacks'), AT, RADIUS0, RANGE], tags: () => ['poison', 'dot'] },
    bleed: { name: 'Bleeding', params: [AT, RADIUS0, ...DMG.slice(0, 2), RANGE], tags: () => ['physical', 'bleed', 'dot'], desc: 'A bleed as if a hit of this much caused it.' },
    holyFire: { name: 'Holy fire', params: [AT, RADIUS0, OF, Object.assign({}, MULT, { d: 0.4, label: 'Per second' }), p('duration', 'sec', 3, 'Seconds'), RANGE], tags: () => ['elemental', 'holy', 'dot'] },
    spread: { name: 'Spread from the monster', params: [p('what', 'enum', 'poison', 'What', { opts: ['poison', 'bleed', 'holy', 'statuses'] }), p('radius', 'num', 5, 'Radius', { u: 'm' })],
      tags: (a) => (a.what === 'bleed' ? ['bleed'] : a.what === 'holy' ? ['holy'] : a.what === 'statuses' ? ['control'] : ['poison']) },
    zone: { name: 'Ground zone', params: [p('kind', 'enum', 'fire', 'Kind', { opts: ['fire', 'acid', 'poison', 'blood', 'holy', 'tar', 'void'],
      help: 'fire / acid: elemental damage · poison: poisons · blood: bleeding · holy: holy fire · tar: slows · void: pulls monsters in and hurts' }),
    AT, p('radius', 'num', 2.5, 'Radius', { u: 'm' }), p('duration', 'sec', 4, 'Seconds'), OF, Object.assign({}, MULT, { d: 0.2, label: 'Per tick' }), p('every', 'sec', 0.5, 'Tick every'), RANGE],
    tags: (a) => ['area', ...({ fire: ['fire', 'elemental'], acid: ['acid', 'elemental'], poison: ['poison'], blood: ['bleed'], holy: ['holy', 'elemental'], tar: ['control'], void: ['control', 'elemental'] }[a.kind] || [])] },
    knockback: { name: 'Knock back', params: [AT, p('radius', 'num', 5, 'Radius', { u: 'm' }), p('strength', 'num', 12, 'Strength', { help: 'Below 0 pulls them in.' }), RANGE], tags: () => ['control', 'area'] },
    execute: { name: 'Execute', params: [p('below', 'pct', 0.15, 'Below health'), Object.assign({}, BOSSES, { d: false }), AT, RANGE], tags: () => ['hit'] },
    heal: { name: 'Heal', params: [Object.assign({}, OF, { d: 'maxHp' }), Object.assign({}, MULT, { d: 0.05 })], tags: () => ['heal'] },
    shield: { name: 'Shield', params: [Object.assign({}, OF, { d: 'maxHp' }), Object.assign({}, MULT, { d: 0.1 }), p('duration', 'sec', 5, 'Seconds')], tags: () => ['defense'], desc: 'Soaks damage. A bigger shield replaces a smaller one.' },
    buff: { name: 'Buff', params: [p('buff', 'buff', 'bloodlust', 'Buff'), p('duration', 'sec', 0, 'Seconds', { help: '0 = the buff\'s own' })], tags: () => ['buff'] },
    invulnerable: { name: 'Invulnerable', params: [p('seconds', 'sec', 1, 'Seconds')], tags: () => ['defense'] },
    cleanse: { name: 'Cleanse yourself', tags: () => ['defense'], desc: 'Removes every status, poison and bleed on you.' },
    dashCharge: { name: 'Refund a dash', params: [p('charges', 'int', 1, 'Charges')], tags: () => ['movement'] },
    dash: { name: 'Free dash', tags: () => ['movement'], desc: 'You dash where you are going, without using a charge.' },
    trinketCooldown: { name: 'Trinket recharge', params: [p('seconds', 'sec', 2, 'Seconds'), p('share', 'pct', 0, 'Share of what is left')], tags: () => ['trinket'] },
    trinketEffect: { name: 'A trinket\'s effect', params: [p('trinket', 'trinket', 'pocketwatch', 'Trinket')], tags: () => ['trinket'], desc: 'Sets off any trinket\'s effect without using a charge.' },
    extraAttack: { name: 'Attack again', params: [p('count', 'int', 1, 'Attacks'), p('gap', 'sec', 0.1, 'Gap')], tags: () => ['weapon', 'hit'] },
    empower: { name: 'Empower your next hits', params: [p('more', 'pct', 1, 'More damage'), p('hits', 'int', 1, 'Hits')], tags: () => ['hit'] },
    resetCooldowns: { name: 'Reset cooldowns', params: [p('which', 'enum', 'rules', 'Which', { opts: ['rules', 'talents', 'trinket', 'dash', 'all'] })], tags: (a) => (a.which === 'trinket' ? ['trinket'] : a.which === 'dash' ? ['movement'] : []) },
    drop: { name: 'Drop a pickup', params: [p('item', 'enum', 'essence', 'Pickup', { opts: ['essence', 'xp', 'fish', 'catnip', 'loot'] }), p('amount', 'num', 5, 'Amount', { help: 'Essence or experience; for loot the rarity (0-2).' }), AT, RANGE], tags: () => ['utility'] },
    gain: { name: 'Gain', params: [p('what', 'enum', 'essence', 'What', { opts: ['essence', 'xp', 'levels', 'rerolls', 'totems', 'spoons'] }), p('amount', 'num', 5, 'Amount')], tags: () => ['utility'] },
    magnet: { name: 'Pull every pickup to you', tags: () => ['utility'] },
    text: { name: 'Floating text', params: [p('text', 'str', 'BOOM!', 'Text'), p('color', 'color', '#ffd27a', 'Color'), p('size', 'int', 16, 'Size'), AT, RANGE] },
    sound: { name: 'Sound', params: [p('sound', 'sound', 'warcry', 'Sound'), p('pitch', 'num', 1, 'Pitch')] },
    flash: { name: 'Screen flash', params: [p('color', 'color', '#ffffff', 'Color'), p('strength', 'pct', 0.3, 'Strength')] },
    shake: { name: 'Screen shake', params: [p('strength', 'num', 0.3, 'Strength')] },
    ring: { name: 'Ring of light', params: [AT, p('radius', 'num', 4, 'Radius', { u: 'm' }), p('color', 'color', '#ffd27a', 'Color'), RANGE] },
  };
  // Numbers a rule itself carries (besides its trigger's).
  RU.RULE_PARAMS = [p('chance', 'pct', 1, 'Chance'), p('every', 'int', 1, 'Every Nth time', { help: '1 = every time' }), p('cooldown', 'sec', 0, 'Cooldown')];

  // ---------- reading the JSON (data.js buildTree) ----------
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const okVal = (v) => isNum(v) || (Array.isArray(v) && v.length > 0 && v.every(isNum));
  // A number at a rank: lists give one value per rank (the last one past its end).
  const val = RU.val = (v, rank) => (Array.isArray(v) ? v[Math.max(0, Math.min(v.length, rank || 1) - 1)] : v);
  const hexCss = (v, d) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(v == null ? '' : v)); return m ? '#' + m[1].toLowerCase() : d; };
  // Fills in a condition's or action's numbers from its spec. Returns null when it cannot be used.
  function params(spec, o, where, warn, talentId, idx) {
    const out = {};
    for (const q of spec.params || []) {
      let v = o[q.k];
      if (v === undefined) { out[q.k] = Array.isArray(q.d) ? q.d.slice() : q.d; continue; }
      if (['num', 'int', 'pct', 'sec'].includes(q.t)) { if (!okVal(v)) { warn(`${where}: "${q.k}" should be a number or a list of numbers`); v = q.d; } }
      else if (q.t === 'enum') { if (!q.opts.includes(v)) { warn(`${where}: "${q.k}" is "${v}" (use ${q.opts.join(', ')})`); v = q.d; } }
      else if (q.t === 'bool') v = !!v;
      else if (q.t === 'enemies' || q.t === 'weapons' || q.t === 'maps') {
        const table = q.t === 'enemies' ? G.ENEMIES : q.t === 'weapons' ? G.WEAPONS : null;
        v = (Array.isArray(v) ? v : [v]).filter((id) => { if (!table || table[id]) return true; warn(`${where}: unknown ${q.t.slice(0, -1)} "${id}"`); return false; });
      } else if (q.t === 'buff') {
        if (v && typeof v === 'object') v = RU.inlineBuff(v, `${talentId}__buff${idx}`, where, warn);
        else if (!G.BUFFS[v]) { warn(`${where}: unknown buff "${v}"`); return null; }
      } else if (q.t === 'trinket' && G.TRINKETS && !G.TRINKETS[v]) { warn(`${where}: unknown trinket "${v}"`); return null; }
      else if (q.t === 'color') v = hexCss(v, q.d);
      else if (q.t === 'str' || q.t === 'sound') v = String(v);
      out[q.k] = v;
    }
    return out;
  }
  // A buff written inside an action: registered as a buff of its own (status_effects.json buffs format).
  RU.inlineBuff = function (o, id, where, warn) {
    const stats = {};
    for (const [k, v] of Object.entries(o.stats || {})) { if (G.STATS[k] && isNum(v)) stats[k] = v; else warn(`${where} buff: unknown stat or not a number "${k}"`); }
    G.BUFFS[id] = { id, name: o.name || 'Talent buff', desc: o.desc || '', icon: o.icon || 'star', color: hexCss(o.color, '#8af060'), duration: Math.max(0.1, isNum(o.duration) ? o.duration : 5), stats, inline: true };
    return id;
  };
  function conds(list, where, warn, tid) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((c, i) => {
      const S = c && RU.CONDITIONS[c.check];
      if (!S) { warn(`${where} if[${i}]: unknown check "${c && c.check}" (use ${Object.keys(RU.CONDITIONS).join(', ')})`); return; }
      const q = params(S, c, `${where} if[${i}] ${c.check}`, warn, tid, i);
      if (q) out.push(Object.assign(q, { check: c.check, not: !!c.not }));
    });
    return out;
  }
  // Checks and fills in a talent's rules, conditional stats and hit bonuses (data.js buildTree). warn: the loader's.
  RU.compile = function (n, node, where, warn) {
    let bi = 0;
    node.rules = (Array.isArray(n.rules) ? n.rules : []).map((r, i) => {
      const w = `${where} ${n.id} rules[${i}]`, S = r && RU.TRIGGERS[r.when];
      if (!S) { warn(`${w}: unknown trigger "${r && r.when}" (use ${Object.keys(RU.TRIGGERS).join(', ')})`); return null; }
      if (r.disabled) return null;
      const rule = Object.assign(params(S, r, w, warn, n.id, 0) || {}, params({ params: RU.RULE_PARAMS }, r, w, warn, n.id, 0), { when: r.when, i, name: r.name || '' });
      rule.if = conds(r.if, w, warn, n.id);
      rule.then = (Array.isArray(r.then) ? r.then : []).map((a, j) => {
        const A = a && RU.ACTIONS[a.do];
        if (!A) { warn(`${w} then[${j}]: unknown action "${a && a.do}" (use ${Object.keys(RU.ACTIONS).join(', ')})`); return null; }
        const q = params(A, a, `${w} then[${j}] ${a.do}`, warn, n.id, bi++);
        return q && Object.assign(q, { do: a.do });
      }).filter(Boolean);
      if (!rule.then.length) warn(`${w}: does nothing (no actions in "then")`);
      return rule;
    }).filter(Boolean);
    node.conditionalStats = (Array.isArray(n.conditionalStats) ? n.conditionalStats : []).map((c, i) => {
      const w = `${where} ${n.id} conditionalStats[${i}]`, stats = {};
      for (const [k, v] of Object.entries((c && c.stats) || {})) { if (G.STATS[k] && isNum(v)) stats[k] = v; else warn(`${w}: unknown stat or not a number "${k}"`); }
      return { if: conds(c && c.if, w, warn, n.id), stats, i };
    });
    node.hitBonus = (Array.isArray(n.hitBonus) ? n.hitBonus : []).map((c, i) => {
      const w = `${where} ${n.id} hitBonus[${i}]`;
      if (!okVal(c && c.more)) { warn(`${w}: "more" should be a number`); return null; }
      return { if: conds(c.if, w, warn, n.id), more: c.more };
    }).filter(Boolean);
    node.ruleTags = RU.tags(node);
    if (!node.text && (node.rules.length || node.conditionalStats.length || node.hitBonus.length)) node.text = RU.describeTalent(node);
  };
  RU.tags = function (node) {
    const set = new Set();
    for (const r of node.rules || []) for (const a of r.then) for (const t of (RU.ACTIONS[a.do].tags ? RU.ACTIONS[a.do].tags(a) : [])) set.add(t);
    for (const c of node.conditionalStats || []) for (const t of G.tagsFor(c.stats, null)) set.add(t);
    if ((node.hitBonus || []).length) set.add('hit');
    return [...set];
  };

  // ---------- run state ----------
  RU.reset = function () {
    RU.state = {}; RU.emp = []; RU.zones = []; RU.kills = []; RU.t = 0; RU.active = {}; RU.lastHit = -99; RU.busy = {};
    RU.phase = G.phase; RU.bosses = new Set(); RU.bossT = 0; RU.condT = 0; RU.px = null;
  };
  RU.reset();
  const st = (key) => RU.state[key] || (RU.state[key] = { cd: 0, n: 0, t: 0, fired: 0, armed: true });
  // Rebuilds the list of learned rules and adds the conditional stats that hold right now (PR.recompute).
  RU.stats = function (s) {
    const by = {}, cond = [], bonus = [], TL = G.talents;
    for (const t of TL.all()) {
      const r = TL.rank(t.id);
      if (!r) continue;
      for (const rule of t.rules || []) (by[rule.when] = by[rule.when] || []).push({ t, rank: r, rule, key: `${t.id}#${rule.i}` });
      for (const c of t.conditionalStats || []) {
        const key = `${t.id}~${c.i}`;
        cond.push({ t, rank: r, c, key });
        if (RU.active[key]) for (const k in c.stats) G.addStat(s, k, c.stats[k] * r);
      }
      for (const b of t.hitBonus || []) bonus.push({ t, rank: r, b });
    }
    RU.by = by; RU.cond = cond; RU.bonus = bonus;
  };

  // ---------- conditions ----------
  const STATUS_OF = { shocked: 'shock', slowed: 'slow', stunned: 'stun', rooted: 'root' };
  function hasStatus(e, q) {
    if (!e) return false;
    const n = val(q.stacks, 1) || 1;
    switch (q.status) {
      case 'bleeding': return e.bleed.length > 0;
      case 'poisoned': return e.poison.length >= n;
      case 'burning': return !!e.holy && e.holy.length >= n;
      case 'any': return e.bleed.length > 0 || e.poison.length > 0 || !!(e.holy && e.holy.length) || STATUS_OPTS.some((k) => e.st[k] > 0);
      default: return e.st[STATUS_OF[q.status]] > 0;
    }
  }
  function near(R, cap) {
    const P = G.player;
    let n = 0;
    G.enemySys.query(P.x, P.z, R + 2, (e) => { if (!e.dead && !e.dummy && Math.hypot(e.x - P.x, e.z - P.z) < R + e.r) n++; });
    return Math.min(n, cap || n);
  }
  // a share of health within below / above (below 100% or more: no upper limit, so full health counts)
  const inBand = (k, q, r) => { const b = val(q.below, r); return (b >= 1 || k < b) && k >= val(q.above, r); };
  const CHECK = {
    targetStatus: (q, c) => hasStatus(c.e, q),
    targetKind: (q, c) => {
      const e = c.e;
      if (!e) return false;
      switch (q.kind) {
        case 'boss': return !!e.boss;
        case 'elite': return !!e.elite;
        case 'rare': return !!e.rareMob || !!e.rare;
        case 'invader': return !!e.invader;
        case 'flying': return !!e.def.flying;
        default: return !e.boss && !e.elite && !e.rareMob && !e.invader;
      }
    },
    targetHealth: (q, c, r) => { const e = c.e; if (!e || !e.maxHp) return false; return inBand(Math.max(0, e.hp) / e.maxHp, q, r); },
    targetEnemy: (q, c) => !!c.e && q.ids.includes(c.e.type),
    targetDistance: (q, c, r) => { if (!c.e) return false; const d = Math.hypot(c.e.x - G.player.x, c.e.z - G.player.z); return d < val(q.below, r) && d >= val(q.above, r); },
    wasCrit: (q, c) => !!c.crit,
    myHealth: (q, c, r) => inBand(G.player.hp / G.stats.maxHp, q, r),
    myShield: () => !!G.tfx.shield,
    myBuff: (q) => !!G.player.buffs[q.buff],
    myStatus: (q) => { const P = G.player; return q.status === 'any' ? Object.keys(P.status).length > 0 || Object.keys(P.dots).length > 0 : !!(P.status[q.status] || P.dots[q.status]); },
    moving: () => G.player.moving > 0.3,
    enemiesNear: (q, c, r) => { const at = val(q.atLeast, r), most = val(q.atMost, r), n = near(val(q.radius, r), most ? most + 1 : at); return n >= at && (!most || n <= most); },
    weaponClass: (q) => G.stats.weapon.class === q.class,
    weapon: (q) => q.ids.includes(G.stats.wtype),
    damageType: (q) => G.stats.weapon.dmgType === q.type,
    trinketReady: () => { const D = G.trinkets.def(); return !!D && G.trinkets.charges(D.id) > 0; },
    dashReady: () => G.player.charges > 0,
    killsRecent: (q, c, r) => { const t0 = RU.t - val(q.seconds, r); let n = 0; for (let i = RU.kills.length - 1; i >= 0 && RU.kills[i] >= t0; i--) n++; return n >= val(q.count, r); },
    hitRecently: (q, c, r) => RU.t - RU.lastHit < val(q.seconds, r),
    bossAlive: () => G.enemySys.bossAlive(),
    level: (q, c, r) => G.level >= val(q.atLeast, r),
    map: (q) => q.ids.includes(G.map().id),
    dayTime: (q, c, r) => G.dayT >= val(q.after, r) && (!val(q.before, r) || G.dayT < val(q.before, r)),
    inDungeon: () => !!G.dungeon.active,
    darkness: () => !!(G.darkness && G.darkness.on),
    chance: (q, c, r) => Math.random() < val(q.chance, r),
  };
  const passes = (list, ctx, rank) => list.every((q) => CHECK[q.check](q, ctx, rank) !== q.not);
  RU.check = passes;

  // ---------- triggers ----------
  // Trigger numbers that decide whether this occurrence counts.
  const TRIG_OK = {
    lowHealth: (R, c, r) => { const m = G.stats.maxHp * val(R.threshold, r); return c.before >= m && G.player.hp < m && G.player.hp > 0; },
    status: (R, c) => R.status === 'any' || R.status === c.status,
  };
  function run(inst, ctx) {
    const R = inst.rule, r = inst.rank, s = st(inst.key);
    if (s.cd > 0 || G.player.dead) return false;
    if (TRIG_OK[R.when] && !TRIG_OK[R.when](R, ctx, r)) return false;
    if (R.if.length && !passes(R.if, ctx, r)) return false;
    const every = Math.max(1, Math.round(val(R.every, r)));
    if (every > 1 && ++s.n < every) return false;
    s.n = 0;
    const ch = val(R.chance, r);
    if (ch < 1 && Math.random() >= ch) return false;
    s.cd = Math.max(0, val(R.cooldown, r)); s.max = s.cd; s.fired++;
    RU.depth = (RU.depth || 0) + 1;
    try { for (const a of R.then) act(a, ctx, r); } finally { RU.depth--; }
    return true;
  }
  // Something happened (combat, the player system, trinkets and progress call this). A trigger never
  // sets itself off again from inside its own actions.
  RU.fire = function (when, ctx) {
    const list = RU.by[when];
    if (when === 'kill') RU.kills.push(RU.t);
    if (!list || RU.busy[when]) return;
    RU.busy[when] = true;
    try { for (const inst of list) run(inst, ctx || {}); } finally { RU.busy[when] = false; }
  };
  RU.onDamaged = function (dmg, before, src) {
    RU.lastHit = RU.t;
    const owner = src && (src.owner || src), e = owner && owner.st && !owner.dead ? owner : null;
    RU.fire('damaged', { dmg, before, e });
    RU.fire('lowHealth', { dmg, before });
  };
  // More damage for a weapon hit on e: hit bonuses that pass, and empowered hits waiting.
  RU.hitMult = function (e, crit) {
    let m = 1;
    for (const B of RU.bonus) if (passes(B.b.if, { e, crit }, B.rank)) m *= 1 + val(B.b.more, B.rank);
    if (RU.emp.length) { const E = RU.emp[0]; m *= 1 + E.more; if (--E.hits <= 0) RU.emp.shift(); }
    return m;
  };

  // ---------- actions ----------
  const C = () => G.combat, ES = () => G.enemySys, F = () => G.fx;
  const alive = (e) => !!e && !!e.st && !e.dead && !e.dummy;   // a monster (not a shot, tower or the training dummy)
  // Monsters within range of you, for nearest / random / strongest / weakest.
  function pool(range) {
    const P = G.player, out = [];
    ES().query(P.x, P.z, range + 2, (e) => { if (alive(e) && !e.dormant && Math.hypot(e.x - P.x, e.z - P.z) < range + e.r) out.push(e); });
    return out;
  }
  // Where an action happens: a monster, or { x, z } (you). null when there is nothing there.
  function place(a, ctx, rank) {
    const P = G.player, at = a.at || 'target', R = val(a.range, rank) || 12;
    if (at === 'player') return { x: P.x, z: P.z, player: true };
    if (at === 'target') return (ctx.e && ctx.e.st && ctx.e) || { x: P.x, z: P.z, player: true };
    if (at === 'nearest') return ES().nearest(P.x, P.z, R) || null;
    const list = pool(R);
    if (!list.length) return null;
    if (at === 'random') return U.pick(list);
    return list.reduce((b, e) => ((at === 'strongest' ? e.hp > b.hp : e.hp < b.hp) ? e : b));
  }
  // How much "Based on" x "Multiplier" is.
  function amount(a, ctx, rank) {
    const s = G.stats, e = ctx.e, m = val(a.mult, rank);
    switch (a.of) {
      case 'hit': return (ctx.dmg != null ? ctx.dmg : s.dmg) * m;
      case 'weapon': return s.dmg * m;
      case 'maxHp': return s.maxHp * m;
      case 'targetMaxHp': return (e ? e.maxHp : 0) * m;
      case 'targetHp': return (e ? Math.max(0, e.hp) : 0) * m;
      case 'taken': return (ctx.dmg || 0) * m;
      case 'armor': return G.progress.armor() * m;
      case 'level': return G.level * m;
      default: return m;
    }
  }
  // Damage bonuses for a talent source. Hits and weapon damage already carry the weapon's bonuses, so
  // those skip the inherited ones (like a bleed from a hit does).
  function scaled(key, base, a) {
    if (a.scale === false) return base;
    const tags = C().tagsOf(key), inh = a.of === 'hit' || a.of === 'weapon';
    let m = 1;
    for (const x of G.DMG_SCALING) if (!(inh && G.DMG_INHERITED.includes(x.tag)) && (x.tag === 'any' || tags.includes(x.tag))) m *= 1 + (G.stats[x.stat] || 0);
    return base * m;
  }
  const num = (c) => (typeof c === 'string' ? parseInt(c.slice(1), 16) : c);
  const STYLE = { fire: 0xff8a2a, meteor: 0xff5a1a, holy: 0xffe8a0, void: 0xb86cff, frost: 0x9fe8ff };
  // Every monster within r of a point (its own monster too).
  function around(x, z, r, fn) {
    ES().query(x, z, r + 3, (e) => { if (alive(e) && Math.hypot(e.x - x, e.z - z) <= r + e.r) fn(e); });
  }
  // A target action: on the monster at the place, or on every monster within its radius.
  function each(a, ctx, rank, fn) {
    const n = Math.max(1, Math.round(val(a.count, rank) || 1));
    for (let i = 0; i < n; i++) {
      const at = place(a, ctx, rank), R = val(a.radius, rank) || 0;
      if (!at) return;
      if (R > 0) around(at.x, at.z, R, fn);
      else if (alive(at)) fn(at);
      else if (at.player && a.at === 'target') { const e = ES().nearest(at.x, at.z, val(a.range, rank) || 12); if (e) fn(e); }   // no monster in the trigger: the nearest one
    }
  }
  const DO = {
    explode(a, ctx, r) {
      const n = Math.max(1, Math.round(val(a.count, r)));
      for (let i = 0; i < n; i++) {
        const at = place(a, ctx, r);
        if (!at) return;
        const blood = a.type === 'blood', key = blood ? 'talentBlood' : 'talentBlast', R = val(a.radius, r), delay = Math.max(0, val(a.delay, r)) + i * 0.06;
        const x = at.x + (n > 1 && at.player ? U.rnd(-1, 1) * R : 0), z = at.z + (n > 1 && at.player ? U.rnd(-1, 1) * R : 0);
        if (delay > 0.15) F().telegraph(x, z, R, delay, a.style === 'holy' ? 0xffe080 : a.style === 'void' ? 0xb86cff : a.style === 'frost' ? 0x9fe8ff : 0xff6a1a);
        C().explQ.push({ x, z, r: R, dmg: scaled(key, amount(a, ctx, r), a), raw: true, src: key, blood, acid: a.type === 'acid', delay, color: blood ? 0xc01a10 : STYLE[a.style], style: a.style });
      }
    },
    strike(a, ctx, r) {
      const P = G.player, type = a.type, key = type === 'elemental' ? 'talentElemental' : type === 'poison' ? 'talentPoison' : 'talentStrike';
      each(a, ctx, r, (e) => {
        const d = scaled(key, amount(a, Object.assign({}, ctx, { e }), r), a);
        if (a.beam) F().streak(P.x, 1, P.z, e.x, 1 + e.y, e.z, type === 'elemental' ? 0x9fe8ff : type === 'poison' ? 0x8aef4a : 0xffd27a, 0.25, 0.14);
        if (type === 'elemental') C().elementalHit(e, d, key);
        else C().damage(e, d, type === 'poison' ? 'poison' : 'hit', type, key);
      });
    },
    lightning(a, ctx, r) {
      const n = Math.max(1, Math.round(val(a.count, r)));
      for (let k = 0; k < n; k++) {
        const from = place(a, ctx, r);
        if (!from) return;
        const d = scaled('talentBolt', amount(a, ctx, r), a), ex = from.id ? [from.id] : [], J = val(a.jump, r);
        let at = from;
        if (alive(from) && a.at !== 'target') { C().elementalHit(from, d, 'talentBolt', { alwaysShock: true }); F().laser(G.player.x, 1.1, G.player.z, from.x, 1.1 + from.y, from.z, 0.3); }
        for (let i = 0; i < val(a.chains, r); i++) {
          const next = ES().nearest(at.x, at.z, J, ex);
          if (!next) break;
          ex.push(next.id);
          F().laser(at.x, 1.1 + (at.y || 0), at.z, next.x, 1.1 + next.y, next.z, 0.35);
          C().elementalHit(next, d, 'talentBolt', { alwaysShock: true });
          at = next;
        }
        G.audio.play('zap');
      }
    },
    projectiles(a, ctx, r) {
      const P = G.player, n = Math.max(1, Math.round(val(a.count, r))), src = a.from === 'target' && ctx.e ? ctx.e : P;
      const pr = { kind: a.kind, speed: val(a.speed, r), range: val(a.range, r), pierce: Math.max(1, val(a.pierce, r)), knock: 1, splash: val(a.splash, r), puddle: 3, spread: 0.6 };
      const dmg = amount(a, ctx, r), tg = a.pattern === 'ring' ? [] : C().nearestN(src.x, src.z, n, pr.range + 4).filter((e) => e !== src);
      const aim0 = tg[0] ? Math.atan2(tg[0].x - src.x, tg[0].z - src.z) : P.yaw, off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const ang = a.pattern === 'ring' ? off + (i / n) * Math.PI * 2 : a.pattern === 'fan' ? aim0 + (n > 1 ? i / (n - 1) - 0.5 : 0) * 1.2 : tg[i] ? Math.atan2(tg[i].x - src.x, tg[i].z - src.z) : aim0 + U.rnd(-0.3, 0.3);
        let q;
        if (a.kind === 'flask') {
          const t = tg[i % Math.max(1, tg.length)];
          C().spawnFlask(src.x, src.z, t ? t.x : src.x + Math.sin(ang) * 6, t ? t.z : src.z + Math.cos(ang) * 6, dmg, a.ricochet ? null : 0, pr);
          q = C().projs[C().projs.length - 1];
          q.crit = false;
        } else {
          q = C().spawnProj(a.kind, src.x, src.z, ang, dmg, pr);
          Object.assign(q, { crit: false, holy: false, great: false, stun: 0, rico: a.ricochet ? null : 0, chained: true });
        }
        q.rule = true;
        if (src !== P) q.hit = [src.id];
      }
      G.audio.play(a.kind === 'bullet' || a.kind === 'pellet' ? 'shot' : 'throw');
    },
    status(a, ctx, r) {
      const d = val(a.duration, r) || undefined;
      each(a, ctx, r, (e) => { if (a.status === 'shock') C().shock(e, val(a.shock, r), d); else C().inflict(e, a.status, d); });
    },
    poison(a, ctx, r) { const n = Math.max(1, Math.round(val(a.stacks, r))); each(a, ctx, r, (e) => { for (let i = 0; i < n; i++) C().poison(e, ctx.dmg || 0); }); },
    bleed(a, ctx, r) { each(a, ctx, r, (e) => C().bleed(e, amount(a, Object.assign({}, ctx, { e }), r))); },
    holyFire(a, ctx, r) { each(a, ctx, r, (e) => C().burn(e, amount(a, Object.assign({}, ctx, { e }), r), val(a.duration, r))); },
    spread(a, ctx, r) {
      const e = ctx.e, R = val(a.radius, r);
      if (!e) return;
      if (a.what === 'poison') C().spreadPoison(e, R);
      else if (a.what === 'bleed') G.tfx.spreadBleed(e, R);
      else if (a.what === 'holy') {
        const top = (e.holy || []).reduce((m, x) => Math.max(m, x.dps), 0);
        if (top > 0) { F().ring(e.x, e.z, { r0: 0.4, r1: R, life: 0.45, color: 0xffe080 }); around(e.x, e.z, R, (o) => { if (o !== e) C().burn(o, top, G.DOTS.holy.duration, 'halo'); }); }
      } else {
        F().ring(e.x, e.z, { r0: 0.4, r1: R, life: 0.45, color: 0xffb070 });
        around(e.x, e.z, R, (o) => { if (o !== e) for (const k of STATUS_OPTS) if (e.st[k] > 0) C().inflict(o, k, e.st[k]); });
      }
    },
    zone(a, ctx, r) {
      const at = place(a, ctx, r);
      if (!at) return;
      const R = val(a.radius, r), t = val(a.duration, r), every = Math.max(0.1, val(a.every, r)), base = amount(a, ctx, r), k = a.kind;
      const COL = { fire: 0xff6a1a, acid: 0x7adf1a, poison: 0x3fbf1a, blood: 0x7a0a06, holy: 0xffe080, tar: 0x2a2018, void: 0x6a2aa8 };
      F().disc(at.x, at.z, R, t, COL[k], k === 'tar' ? 0.7 : 0.5, k !== 'tar');
      if (k === 'fire' || k === 'acid' || k === 'poison' || k === 'blood') {
        const key = k === 'fire' ? 'fire' : k === 'acid' ? 'acid' : k === 'blood' ? 'bloodTrail' : 'poison';
        // puddles: fire deals its number as is, acid half of it, poison poisons with it, blood bleeds
        const dmg = k === 'poison' ? base : k === 'acid' ? scaled(key, base, a) * 2 : scaled(key, base, a);
        C().puddles.push({ x: at.x, z: at.z, r: R, t, tick: 0, every, dmg, fire: k === 'fire', acid: k === 'acid', blood: k === 'blood', src: -1 });
      } else RU.zones.push({ x: at.x, z: at.z, r: R, t, every, tick: 0, dmg: k === 'holy' ? base : scaled('talentElemental', base, a), kind: k });
    },
    knockback(a, ctx, r) {
      const at = place(a, ctx, r);
      if (!at) return;
      const R = val(a.radius, r), k0 = val(a.strength, r);
      F().ring(at.x, at.z, { r0: k0 < 0 ? R : 0.4, r1: k0 < 0 ? 0.4 : R, life: 0.4, color: k0 < 0 ? 0xb86cff : 0xe8f4ff });
      around(at.x, at.z, R, (e) => {
        if (e.boss || e === at) return;
        const dx = e.x - at.x, dz = e.z - at.z, d = Math.hypot(dx, dz) || 1, k = k0 * 1.5 / Math.sqrt(e.mass);
        e.kbx += dx / d * k; e.kbz += dz / d * k;
      });
    },
    execute(a, ctx, r) {
      const e = place(a, ctx, r);
      if (!alive(e) || (e.boss && !a.bosses) || e.hp / e.maxHp >= val(a.below, r)) return;
      F().num(e.x, 2.6 * e.scale + e.y, e.z, 'EXECUTED', '#ff4a3a', 16); F().streak(e.x, 3.5 + e.y, e.z, e.x, 0.2, e.z, 0xff4a3a, 0.3, 0.3);
      e.killedBy = 'hit'; C().kill(e);
    },
    heal(a, ctx, r) { G.playerSys.heal(amount(a, ctx, r), true); },
    shield(a, ctx, r) {
      const v = amount(a, ctx, r), d = val(a.duration, r), TF = G.tfx, P = G.player;
      if (v <= 0) return;
      if (!TF.shield || TF.shield.hp < v) TF.shield = { hp: v, max: v, t: d, dur: d };
      F().ring(P.x, P.z, { r0: 0.4, r1: 1.6, life: 0.35, color: 0xbfe8ff });
    },
    buff(a, ctx, r) { G.playerSys.addBuff(a.buff, val(a.duration, r) || undefined); },
    invulnerable(a, ctx, r) { const P = G.player; P.invuln = Math.max(P.invuln, val(a.seconds, r)); F().ring(P.x, P.z, { r0: 0.4, r1: 2, life: 0.5, color: 0xfff3c4 }); },
    cleanse() { const P = G.player; P.status = {}; P.dots = {}; F().rise(P.x, 0.6, P.z, 0xe8f4ff, 8, 0.8, 2.4, 0.14, 0.8); },
    dashCharge(a, ctx, r) { const P = G.player; P.charges = Math.min(G.playerSys.maxCharges(), P.charges + Math.max(1, Math.round(val(a.charges, r)))); },
    dash() { const P = G.player; P.charges = Math.min(G.playerSys.maxCharges(), P.charges + 1); G.input.dash = true; },
    trinketCooldown(a, ctx, r) {
      const D = G.trinkets.def(), R = G.run.trinket;
      if (!D || !(R.cd[D.id] > 0)) return;
      R.cd[D.id] = Math.max(0.001, R.cd[D.id] * (1 - val(a.share, r)) - val(a.seconds, r));
    },
    trinketEffect(a) { G.trinkets.trigger(a.trinket); },
    extraAttack(a, ctx, r) { const n = Math.max(1, Math.round(val(a.count, r))); for (let i = 0; i < n; i++) C().extra.push(val(a.gap, r) * (i + 1)); },
    empower(a, ctx, r) { RU.emp.push({ more: val(a.more, r), hits: Math.max(1, Math.round(val(a.hits, r))) }); },
    resetCooldowns(a) {
      const w = a.which, R = G.run.trinket, P = G.player;
      if (w === 'rules' || w === 'all') for (const k in RU.state) RU.state[k].cd = 0;
      if (w === 'talents' || w === 'all') G.tfx.cd = {};
      if ((w === 'trinket' || w === 'all') && R) { R.cd = {}; R.ch = {}; }
      if (w === 'dash' || w === 'all') { P.charges = G.playerSys.maxCharges(); P.dashCd = 0; }
    },
    drop(a, ctx, r) {
      const at = place(a, ctx, r), PK = G.pickups, v = val(a.amount, r);
      if (!at) return;
      if (a.item === 'essence') PK.dropEssence(at.x, at.z, v);
      else if (a.item === 'xp') PK.dropXP(at.x, at.z, v);
      else if (a.item === 'fish') PK.dropHeal(at.x, at.z);
      else if (a.item === 'catnip') PK.dropCatnip(at.x, at.z);
      else PK.dropItem(at.x, at.z, C().rollItem(U.clamp(Math.round(v), 0, G.ITEM_RARITY.length - 1), 0));
    },
    gain(a, ctx, r) {
      const v = val(a.amount, r), R = G.run;
      if (a.what === 'essence') { R.essence += v; R.essenceTotal += v; }
      else if (a.what === 'xp') G.progress.addXP(v);
      else if (a.what === 'levels') G.progress.grantLevels(Math.max(1, Math.round(v)));
      else if (a.what === 'rerolls') G.rerolls += Math.round(v);
      else if (a.what === 'totems') R.totems += Math.round(v);
      else R.spoons += Math.round(v);
    },
    magnet() { G.pickups.magnetAll(); },
    text(a, ctx, r) { const at = place(a, ctx, r); if (at) F().num(at.x, 2.6 * (at.scale || 1) + (at.y || 0), at.z, a.text, a.color, val(a.size, r)); },
    sound(a, ctx, r) { G.audio.play(a.sound, val(a.pitch, r)); },
    flash(a, ctx, r) { F().flash(a.color, val(a.strength, r)); },
    shake(a, ctx, r) { F().shake(val(a.strength, r)); },
    ring(a, ctx, r) { const at = place(a, ctx, r); if (at) F().ring(at.x, at.z, { r0: 0.3, r1: val(a.radius, r), life: 0.5, color: num(a.color) }); },
  };
  function act(a, ctx, rank) {
    try { DO[a.do](a, ctx, rank); } catch (err) { console.warn('[rules] ' + a.do + ': ' + err.message); }
  }
  // Runs one action as if a rule had (the talent creator's test buttons).
  RU.act = (a, ctx, rank = 1) => act(a, ctx || {}, rank);

  // ---------- every frame ----------
  RU.update = function (dt) {
    const P = G.player;
    RU.t += dt;
    for (const k in RU.state) { const s = RU.state[k]; if (s.cd > 0) s.cd = Math.max(0, s.cd - dt); }
    while (RU.kills.length && RU.kills[0] < RU.t - 30) RU.kills.shift();
    while (RU.emp.length > 8) RU.emp.shift();
    // a new day's fight, dawn
    if (G.phase !== RU.phase) { const was = RU.phase; RU.phase = G.phase; if (was === 'camp' && G.phase === 'fight') RU.fire('dayStart'); if (was === 'fight' && G.phase === 'camp') RU.fire('dawn'); }
    // zones of our own (holy, tar, void)
    for (const z of RU.zones) {
      z.t -= dt; z.tick -= dt;
      if (Math.random() < dt * 10) F().rise(z.x + U.rnd(-z.r, z.r) * 0.7, 0.1, z.z + U.rnd(-z.r, z.r) * 0.7, z.kind === 'holy' ? 0xffe080 : z.kind === 'void' ? 0xb86cff : 0x4a3a28, 1, 0.2, 1.6, 0.12, 0.6);
      if (z.kind === 'void') around(z.x, z.z, z.r, (e) => { if (!e.boss) { const dx = z.x - e.x, dz = z.z - e.z, d = Math.hypot(dx, dz) || 1; e.kbx += dx / d * dt * 30; e.kbz += dz / d * dt * 30; } });
      if (z.tick > 0) continue;
      z.tick = z.every;
      around(z.x, z.z, z.r, (e) => {
        if (z.kind === 'holy') C().burn(e, z.dmg, G.DOTS.holy.duration);
        else if (z.kind === 'tar') C().inflict(e, 'slow', z.every + 0.3);
        else C().elementalHit(e, z.dmg, 'talentElemental');
      });
    }
    RU.zones = RU.zones.filter((z) => z.t > 0);
    if (P.dead || G.state !== 'playing') return;
    // timers: every few seconds, standing still, walking
    if (RU.px != null) RU.walked = Math.min(2, Math.hypot(P.x - RU.px, P.z - RU.pz));   // at most 2 m a frame (not a jump to a new map)
    RU.px = P.x; RU.pz = P.z;
    const walked = RU.walked || 0;
    RU.walked = 0;
    for (const inst of RU.by.interval || []) { const s = st(inst.key); if ((s.t += dt) >= val(inst.rule.seconds, inst.rank)) { s.t = 0; run(inst, {}); } }
    for (const inst of RU.by.still || []) {
      const s = st(inst.key);
      if (P.moving > 0.05) { s.t = 0; s.armed = true; continue; }
      if ((s.t += dt) >= val(inst.rule.seconds, inst.rank) && s.armed) { s.armed = false; run(inst, {}); }
    }
    for (const inst of RU.by.distance || []) { const s = st(inst.key); if ((s.t += walked) >= val(inst.rule.meters, inst.rank)) { s.t = 0; run(inst, {}); } }
    // bosses walking in
    if (RU.by.bossAppears && (RU.bossT -= dt) <= 0) {
      RU.bossT = 0.5;
      for (const e of ES().list) if (e.boss && !e.dead && !RU.bosses.has(e.id)) { RU.bosses.add(e.id); RU.fire('bossAppears', { e }); }
    }
    // conditional stats: checked five times a second, stats recomputed when one changes
    if (RU.cond.length && (RU.condT -= dt) <= 0) {
      RU.condT = 0.2;
      let changed = false;
      for (const c of RU.cond) {
        const on = passes(c.c.if, {}, c.rank);
        if (on !== !!RU.active[c.key]) { RU.active[c.key] = on; changed = true; }
      }
      if (changed) G.progress.recompute();
    }
  };
  // Back to normal when the world resets (new run, next map): zones go, cooldowns stay with the run.
  RU.clear = function () { RU.zones = []; RU.emp = []; };

  // ---------- buff bar ----------
  // One chip per talent with rules worth watching: its longest cooldown running (a second or more), else
  // its timer (every few seconds), else its count (every Nth time), else ready. Conditional stats that
  // hold light it up.
  RU.chips = function () {
    const per = new Map();
    const get = (t) => per.get(t.id) || (per.set(t.id, { id: t.id, name: t.name, icon: t.icon, color: t.currency === 'spoon' ? '#7dff6a' : '#f2c04e', text: '', fill: 0, active: false, lines: [t.text], show: false, cd: 0, rank: 0 }), per.get(t.id));
    for (const when in RU.by) for (const inst of RU.by[when]) {
      const R = inst.rule, s = st(inst.key), every = Math.max(1, Math.round(val(R.every, inst.rank))), total = val(R.cooldown, inst.rank), c = get(inst.t);
      if (s.cd > 0 && (s.max || total) >= 1 && s.cd > c.cd) Object.assign(c, { show: true, cd: s.cd, rank: 3, fill: s.cd / (s.max || total), text: s.cd < 9.95 ? s.cd.toFixed(1) : String(Math.ceil(s.cd)), active: false, lines: [inst.t.text, `Recharging · ${s.cd.toFixed(1)}s`] });
      else if (c.rank < 3 && when === 'interval') { const T = val(R.seconds, inst.rank); if (T >= 1) Object.assign(c, { show: true, rank: 2, fill: 1 - s.t / T, text: (T - s.t).toFixed(1) }); }
      else if (c.rank < 2 && every > 1) Object.assign(c, { show: true, rank: 1, text: `${s.n}/${every}`, active: s.n === every - 1 });
      else if (c.rank < 1 && total >= 1) Object.assign(c, { show: true, active: true, lines: [inst.t.text, 'Ready'] });
    }
    for (const k of RU.cond) if (RU.active[k.key]) { const c = get(k.t); c.show = true; c.active = true; c.lines = [k.t.text, 'Active']; }
    const out = [...per.values()].filter((c) => c.show).map(({ show, cd, rank, ...c }) => c);
    if (RU.emp.length) out.push({ id: 'rules_emp', name: 'Empowered', icon: 'burst', color: '#ffd27a', text: String(RU.emp.reduce((n, e) => n + e.hits, 0)), fill: 0, active: true, lines: [`Your next hits deal ${Math.round(RU.emp[0].more * 100)}% more damage`] });
    return out;
  };

  // ---------- words ----------
  // Readable text for rules (tooltips when a talent has no text, the talent creator's preview).
  const pctS = (v) => `${+(v * 100).toFixed(1)}%`;
  const listS = (v, f) => (Array.isArray(v) ? v.map(f).join('/') : f(v));
  const P_ = (v) => listS(v, pctS);
  const N_ = (v) => listS(v, (x) => String(+(+x).toFixed(2)));
  const S_ = (v) => listS(v, (x) => `${+(+x).toFixed(2)}s`);
  const M_ = (v) => listS(v, (x) => `${+(+x).toFixed(1)} m`);
  const ord = (n) => { n = Math.round(n); const k = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return n + k; };
  const nameOf = (table, id) => (table && table[id] ? table[id].name : id);
  const OF_TXT = { hit: 'of the hit', weapon: 'of your hit damage', maxHp: 'of your max health', targetMaxHp: 'of its max health', targetHp: 'of its current health', taken: 'of the damage taken', armor: 'of your armor', level: 'per level' };
  const amt = (a) => (a.of === 'flat' ? N_(a.mult) : a.of === 'level' ? `${N_(a.mult)} per level` : `${P_(a.mult)} ${OF_TXT[a.of]}`);
  const AT_TXT = { target: 'it', player: 'you', nearest: 'the nearest monster', random: 'a random monster', strongest: 'the toughest monster nearby', weakest: 'the weakest monster nearby' };
  const AT_ON = { target: 'on it', player: 'on you', nearest: 'on the nearest monster', random: 'on a random monster', strongest: 'on the toughest monster nearby', weakest: 'on the weakest monster nearby' };
  const who = (a) => (val(a.radius, 1) > 0 ? `every monster within ${M_(a.radius)} of ${AT_TXT[a.at]}` : a.at === 'player' ? 'the monster nearest you' : AT_TXT[a.at]);
  const times = (a) => (val(a.count, 1) > 1 ? ` ${N_(a.count)} times` : '');
  const TRIG_TXT = {
    hit: 'When you hit a monster', crit: 'When you land a critical hit', kill: 'When you kill a monster', attack: 'When you attack', damaged: 'When you take damage', block: 'When you block a hit',
    lowHealth: (R) => `When your health falls below ${P_(R.threshold)}`, heal: 'When you are healed', dash: 'When you dash', trinket: 'When you use your trinket', levelUp: 'When you gain a level',
    bleed: 'When you make a monster bleed', poison: 'When you poison a monster', status: (R) => (R.status === 'any' ? 'When you inflict a status' : `When you ${({ slow: 'slow', shock: 'shock', stun: 'stun', root: 'root' })[R.status]} a monster`),
    interval: (R) => `Every ${S_(R.seconds)}`, still: (R) => `After standing still for ${S_(R.seconds)}`, distance: (R) => `Every ${M_(R.meters)} you walk`,
    dayStart: 'When a fight begins', dawn: 'At dawn', bossAppears: 'When a boss appears',
  };
  // "below 50%", "above 90%" (below 100% or more means no top), "between 20% and 50%"
  const band = (q) => { const lo = val(q.above, 1) > 0, hi = val(q.below, 1) < 1; return lo && hi ? `between ${P_(q.above)} and ${P_(q.below)}` : lo ? `above ${P_(q.above)}` : hi ? `below ${P_(q.below)}` : 'at any'; };
  const COND_TXT = {
    targetStatus: (q) => `it is ${q.status === 'any' ? 'suffering anything' : q.status}${val(q.stacks, 1) > 1 && (q.status === 'poisoned' || q.status === 'burning') ? ` with ${N_(q.stacks)}+ stacks` : ''}`,
    targetKind: (q) => `it is ${q.kind === 'normal' ? 'an ordinary monster' : `a${/^[aeiou]/.test(q.kind) ? 'n' : ''} ${q.kind === 'flying' ? 'flying monster' : q.kind}`}`,
    targetHealth: (q) => `it is ${band(q)} health`,
    targetEnemy: (q) => `it is ${q.ids.map((id) => nameOf(G.ENEMIES, id)).join(' or ') || 'a chosen monster'}`,
    targetDistance: (q) => (val(q.below, 1) >= 50 ? `it is further than ${M_(q.above)} from you` : `it is within ${M_(q.below)} of you${val(q.above, 1) > 0 ? ` but further than ${M_(q.above)}` : ''}`),
    wasCrit: () => 'it was a critical hit', myHealth: (q) => `you are ${band(q)} health`,
    myShield: () => 'you have a shield', myBuff: (q) => `you have ${nameOf(G.BUFFS, q.buff)}`, myStatus: (q) => (q.status === 'any' ? 'you suffer a status' : `you are ${({ slow: 'slowed', shock: 'shocked', stun: 'stunned', root: 'rooted', poison: 'poisoned', bleed: 'bleeding' })[q.status]}`),
    moving: () => 'you are moving', enemiesNear: (q) => `${val(q.atMost, 1) ? `${N_(q.atLeast)}-${N_(q.atMost)}` : `${N_(q.atLeast)} or more`} monsters are within ${M_(q.radius)}`,
    weaponClass: (q) => `you wield a ${q.class === 'firearm' ? 'firearm' : q.class} weapon`, weapon: (q) => `you wield ${q.ids.map((id) => nameOf(G.WEAPONS, id)).join(' or ') || 'a chosen weapon'}`,
    damageType: (q) => `your weapon deals ${q.type} damage`, trinketReady: () => 'your trinket is ready', dashReady: () => 'you can dash',
    killsRecent: (q) => `you killed ${N_(q.count)}+ monsters in the last ${S_(q.seconds)}`, hitRecently: (q) => `you were hit in the last ${S_(q.seconds)}`,
    bossAlive: () => 'a boss is on the field', level: (q) => `you are level ${N_(q.atLeast)}+`, map: (q) => `you are on ${q.ids.map((id) => { const m = (G.MAPS || []).find((x) => x.id === id); return m ? m.name : id; }).join(' or ') || 'a chosen map'}`,
    dayTime: (q) => `it is ${val(q.after, 1) ? `past ${S_(q.after)}` : ''}${val(q.after, 1) && val(q.before, 1) ? ' and ' : ''}${val(q.before, 1) ? `before ${S_(q.before)}` : ''} into the day`,
    inDungeon: () => 'you are in a dungeon', darkness: () => 'The Dark is falling', chance: (q) => `a ${P_(q.chance)} chance comes up`,
  };
  const NOT_TXT = { moving: 'you are standing still', wasCrit: 'it was not a critical hit', myShield: 'you have no shield', inDungeon: 'you are not in a dungeon', darkness: 'The Dark is not falling', bossAlive: 'no boss is on the field', trinketReady: 'your trinket is recharging', dashReady: 'you cannot dash' };
  RU.condText = (q) => (q.not ? NOT_TXT[q.check] || `not (${COND_TXT[q.check](q)})` : COND_TXT[q.check](q));
  const PROJ_1 = { knife: 'knife', scythe: 'spectral scythe', wave: 'wave', bullet: 'bullet', pellet: 'pellet', dart: 'dart', fireball: 'fireball', flame: 'flame', flask: 'poison flask' };
  const PROJ_PL = { knife: 'knives', scythe: 'spectral scythes', wave: 'waves', bullet: 'bullets', pellet: 'pellets', dart: 'darts', fireball: 'fireballs', flame: 'flames', flask: 'poison flasks' };
  const ACT_TXT = {
    explode: (a) => `${val(a.count, 1) > 1 || Array.isArray(a.count) ? `${N_(a.count)} ` : a.style === 'meteor' || a.type === 'blood' ? 'a ' : 'an '}${a.style === 'meteor' ? 'meteor' : a.type === 'blood' ? 'blood burst' : a.type === 'acid' ? 'acid explosion' : 'explosion'}${val(a.count, 1) > 1 ? 's' : ''} ${a.at === 'player' ? 'around you' : a.at === 'random' && val(a.count, 1) > 1 ? 'on random monsters' : `on ${AT_TXT[a.at]}`}${val(a.delay, 1) > 0 ? ` after ${S_(a.delay)}` : ''}, dealing ${amt(a)} as ${a.type === 'blood' ? 'physical' : 'elemental'} damage within ${M_(a.radius)}`,
    strike: (a) => `deal ${amt(a)} as ${a.type} damage to ${who(a)}${times(a)}`,
    lightning: (a) => `a bolt of lightning ${a.at === 'target' ? 'leaps from it' : a.at === 'player' ? 'leaps from you' : `strikes ${AT_TXT[a.at]} and leaps on`} to ${N_(a.chains)} more monsters, dealing ${amt(a)} each and shocking`,
    projectiles: (a) => `${a.from === 'target' ? 'it bursts into' : 'you throw'} ${N_(a.count)} ${(val(a.count, 1) > 1 ? PROJ_PL : PROJ_1)[a.kind]}${a.pattern === 'ring' ? ' in a ring' : a.pattern === 'fan' ? ' in a fan' : ''}, each hitting for ${amt(a)}`,
    status: (a) => `${({ slow: 'slow', shock: 'shock', stun: 'stun', root: 'root' })[a.status]} ${who(a)}${val(a.duration, 1) ? ` for ${S_(a.duration)}` : ''}${a.status === 'shock' ? ` (+${P_(a.shock)} damage taken)` : ''}`,
    poison: (a) => `${N_(a.stacks)} poison stack${val(a.stacks, 1) > 1 ? 's' : ''} on ${who(a)}`,
    bleed: (a) => `make ${who(a)} bleed as if hit for ${amt(a)}`,
    holyFire: (a) => `set ${who(a)} on holy fire for ${amt(a)} per second over ${S_(a.duration)}`,
    spread: (a) => `its ${a.what === 'holy' ? 'holy fire' : a.what === 'statuses' ? 'statuses' : a.what} spread${a.what === 'statuses' ? '' : 's'} to every monster within ${M_(a.radius)}`,
    zone: (a) => `${({ fire: 'fire', acid: 'acid', poison: 'poison', blood: 'blood', holy: 'holy light', tar: 'tar', void: 'a void rift' })[a.kind]} covers the ground ${a.at === 'player' ? 'around you' : `under ${AT_TXT[a.at]}`} (${M_(a.radius)}) for ${S_(a.duration)}${a.kind === 'tar' ? ', slowing monsters' : a.kind === 'void' ? `, pulling monsters in for ${amt(a)} every ${S_(a.every)}` : a.kind === 'poison' ? ', poisoning monsters' : a.kind === 'blood' ? ', making monsters bleed' : `, ${amt(a)} every ${S_(a.every)}`}`,
    knockback: (a) => `${val(a.strength, 1) < 0 ? 'pull in' : 'hurl away'} monsters within ${M_(a.radius)} of ${AT_TXT[a.at]}`,
    execute: (a) => `execute ${AT_TXT[a.at]} if below ${P_(a.below)} health${a.bosses ? '' : ' (not bosses)'}`,
    heal: (a) => `heal ${amt(a)}`, shield: (a) => `gain a shield of ${amt(a)} for ${S_(a.duration)}`,
    buff: (a) => `gain ${nameOf(G.BUFFS, a.buff)}${val(a.duration, 1) ? ` for ${S_(a.duration)}` : ''}`,
    invulnerable: (a) => `become invulnerable for ${S_(a.seconds)}`, cleanse: () => 'cleanse every status, poison and bleed on you',
    dashCharge: (a) => `refund ${N_(a.charges)} dash charge${val(a.charges, 1) > 1 ? 's' : ''}`, dash: () => 'dash for free',
    trinketCooldown: (a) => `your trinket recharges ${val(a.seconds, 1) ? `${S_(a.seconds)}` : ''}${val(a.seconds, 1) && val(a.share, 1) ? ' and ' : ''}${val(a.share, 1) ? `${P_(a.share)} of what is left` : ''} faster`,
    trinketEffect: (a) => `${nameOf(G.TRINKETS, a.trinket)} goes off`, extraAttack: (a) => `attack ${val(a.count, 1) > 1 ? `${N_(a.count)} more times` : 'again'}`,
    empower: (a) => `your next ${val(a.hits, 1) > 1 ? `${N_(a.hits)} hits deal` : 'hit deals'} ${P_(a.more)} more damage`,
    resetCooldowns: (a) => ({ rules: 'reset your talents\' cooldowns', talents: 'reset your talent effects\' cooldowns', trinket: 'your trinket recharges fully', dash: 'your dash charges refill', all: 'every cooldown resets' })[a.which],
    drop: (a) => `${AT_TXT[a.at] === 'you' ? 'you drop' : `${AT_TXT[a.at]} drops`} ${a.item === 'essence' ? `${N_(a.amount)} essence` : a.item === 'xp' ? `${N_(a.amount)} experience` : a.item === 'loot' ? 'loot' : `a ${a.item}`}`,
    gain: (a) => `gain ${N_(a.amount)} ${a.what === 'xp' ? 'experience' : a.what === 'essence' || val(a.amount, 1) !== 1 ? a.what : a.what.slice(0, -1)}`, magnet: () => 'every pickup flies to you',
    text: (a) => `"${a.text}"`, sound: () => '', flash: () => '', shake: () => '', ring: () => '',
  };
  RU.actionText = (a) => ACT_TXT[a.do](a);
  RU.describe = function (R) {
    const T = TRIG_TXT[R.when], head = typeof T === 'function' ? T(R) : T, ifs = (R.if || []).map(RU.condText);
    const bits = [];
    if (val(R.every, 1) > 1) bits.push(`every ${listS(R.every, ord)} time`);
    if (val(R.chance, 1) < 1 || Array.isArray(R.chance)) bits.push(`${P_(R.chance)} chance`);
    const acts = (R.then || []).map(RU.actionText).filter(Boolean);
    const cd = val(R.cooldown, 1) > 0 ? ` ${S_(R.cooldown)} cooldown.` : '';
    let s = `${head}${ifs.length ? ` and ${ifs.join(' and ')}` : ''}${bits.length ? ` (${bits.join(', ')})` : ''}: ${acts.length ? acts.join(', then ') : 'nothing happens'}.${cd}`;
    return s;
  };
  RU.describeTalent = function (t) {
    const out = (t.rules || []).map(RU.describe);
    for (const c of t.conditionalStats || []) {
      const st2 = Object.keys(c.stats).map((k) => G.fmtMod(k, c.stats[k])).join(', ');
      if (st2) out.push(`While ${(c.if || []).map(RU.condText).join(' and ') || 'always'}: ${st2}${t.maxRank > 1 ? ' per rank' : ''}.`);
    }
    for (const b of t.hitBonus || []) out.push(`${P_(b.more)} more damage with weapon hits${(b.if || []).length ? ` when ${b.if.map(RU.condText).join(' and ')}` : ''}.`);
    return out.join(' ');
  };
})();
