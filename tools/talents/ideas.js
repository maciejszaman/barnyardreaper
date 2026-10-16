'use strict';
// Ideas for the talent creator: ready-made talents built from rules (js/rules.js), and a generator that
// rolls new ones. IDEAS.templates: [{ talent, note }]. IDEAS.random(ED): one rolled { talent, note }.
(function () {
  const U = G.U;
  const R = (when, then, more) => Object.assign({ when }, more, { then });
  const T = (name, icon, desc, fields) => ({ talent: Object.assign({ name, icon, desc }, fields) });
  const templates = [
    T('Meteor Shower', 'flame', 'Look up.', { maxRank: 3, rules: [R('interval', [{ do: 'explode', at: 'random', count: [3, 4, 5], radius: 3, mult: 1.5, style: 'meteor', delay: 0.8 }], { seconds: 6 })] }),
    T('Death Blossom', 'blades', 'They come apart beautifully.', { rules: [R('kill', [{ do: 'projectiles', kind: 'knife', count: 8, from: 'target' }], { chance: 0.25, cooldown: 1, if: [{ check: 'targetStatus', status: 'bleeding' }] })] }),
    T('Thunderclap', 'bolt', 'Every tenth swing splits the sky.', { rules: [R('attack', [{ do: 'lightning', at: 'nearest', chains: 8 }, { do: 'shake', strength: 0.25 }], { every: 10 })] }),
    T('Vampiric Fangs', 'fang', 'A little sip with every bite.', { maxRank: 3, rules: [R('hit', [{ do: 'heal', of: 'hit', mult: [0.02, 0.035, 0.05] }], { cooldown: 0.25 })] }),
    T('Panic Button', 'heart', 'Nine lives, one panic.', { rules: [R('lowHealth', [{ do: 'invulnerable', seconds: 2 }, { do: 'knockback', at: 'player', radius: 8, strength: 25 }, { do: 'heal', mult: 0.25 }, { do: 'flash', color: '#fff3c4' }], { threshold: 0.3, cooldown: 90 })] }),
    T('Blood Frenzy', 'bloodlust', 'Surrounded is just another word for target-rich.', { maxRank: 2, conditionalStats: [{ if: [{ check: 'enemiesNear', radius: 5, atLeast: 15 }], stats: { atkSpeed: 0.3, moveMult: 0.1 } }] }),
    T('Executioner', 'skull', 'Mercy, of a kind.', { rules: [R('hit', [{ do: 'execute', below: 0.12 }])] }),
    T('Toxic Wake', 'poison', 'Never look back. Something is dissolving there.', { rules: [R('dash', [{ do: 'zone', kind: 'poison', at: 'player', radius: 3, duration: 5, mult: 0.3 }])] }),
    T('Holy Avenger', 'holycross', 'Every blocked blow is a prayer answered.', { rules: [R('block', [{ do: 'holyFire', at: 'player', radius: 5, mult: 0.6, duration: 4 }, { do: 'ring', at: 'player', radius: 5, color: '#ffe080' }], { cooldown: 2 })] }),
    T('Glass Cannon', 'crosshair', 'Hit first, hit hardest, never get hit.', { big: true, stats: { maxHpInc: -0.3 }, downside: '30% less max health.', conditionalStats: [{ if: [{ check: 'myHealth', below: 1, above: 0.9 }], stats: { dmgMult: 0.5 } }] }),
    T('Opportunist', 'eye', 'Kick them while they are down.', { maxRank: 3, hitBonus: [{ if: [{ check: 'targetStatus', status: 'any' }], more: [0.1, 0.2, 0.3] }] }),
    T('Giant Slayer\'s Mark', 'crown', 'The bigger they are.', { hitBonus: [{ if: [{ check: 'targetKind', kind: 'boss' }], more: 0.3 }], rules: [R('bossAppears', [{ do: 'buff', buff: 'power_surge', duration: 30 }, { do: 'text', at: 'player', text: 'MARKED!', color: '#ffd04a' }])] }),
    T('Second Breath', 'shield', 'Stand your ground and breathe.', { rules: [R('still', [{ do: 'shield', mult: 0.15, duration: 4 }], { seconds: 1.5, cooldown: 8 })] }),
    T('Road Runner', 'boot', 'Momentum is a weapon.', { rules: [R('distance', [{ do: 'empower', more: 1, hits: 3 }, { do: 'sound', sound: 'warcry' }], { meters: 30 })] }),
    T('Static Discharge', 'zigzag', 'The charge has to go somewhere.', { rules: [R('status', [{ do: 'lightning', chains: 3, of: 'hit', mult: 0.4 }], { status: 'shock', chance: 0.2 })] }),
    T('Plague Bearer', 'flask', 'Sharing is caring.', { rules: [R('kill', [{ do: 'spread', what: 'poison', radius: 4 }], { if: [{ check: 'targetStatus', status: 'poisoned', stacks: 3 }] })] }),
    T('Treasure Hunter', 'chest', 'Elites carry the good stuff.', { rules: [R('kill', [{ do: 'drop', item: 'essence', amount: 25 }, { do: 'drop', item: 'loot', amount: 1 }], { chance: 0.5, if: [{ check: 'targetKind', kind: 'elite' }] })] }),
    T('Overclock', 'pocketwatch', 'Wind it all the way.', { rules: [R('trinket', [{ do: 'resetCooldowns', which: 'dash' }, { do: 'buff', buff: { name: 'Overclocked', icon: 'pocketwatch', color: '#c8e0ff', duration: 5, stats: { atkSpeed: 0.5 } } }])] }),
    T('Cold Snap', 'snail', 'The air freezes around you.', { rules: [R('interval', [{ do: 'explode', at: 'player', radius: 4, mult: 0.8, style: 'frost' }, { do: 'status', status: 'slow', at: 'player', radius: 4, duration: 3 }], { seconds: 8 })] }),
    T('Void Rift', 'eclipse', 'Something on the other side is hungry.', { rules: [R('crit', [{ do: 'zone', kind: 'void', radius: 3, duration: 4, mult: 0.25 }], { chance: 0.1, cooldown: 6 })] }),
    T('Bounty Hunter', 'dice', 'Every level, a paycheck.', { rules: [R('levelUp', [{ do: 'gain', what: 'essence', amount: 40 }]), R('kill', [{ do: 'gain', what: 'rerolls', amount: 1 }], { if: [{ check: 'targetKind', kind: 'boss' }] })] }),
    T('Thorns', 'armor', 'Touch the cat, feel the cat.', { maxRank: 2, rules: [R('damaged', [{ do: 'strike', of: 'taken', mult: [3, 5], beam: false }])] }),
    T('Chain Reaction', 'bomb', 'One goes, they all go.', { rules: [R('kill', [{ do: 'explode', radius: 3, of: 'targetMaxHp', mult: 0.5 }], { chance: 0.15 })] }),
    T('Battle Trance', 'stars', 'The world slows. You don\'t.', { conditionalStats: [{ if: [{ check: 'killsRecent', count: 10, seconds: 4 }], stats: { critChance: 0.5, moveMult: 0.15 } }] }),
    T('Tar Pit', 'root', 'Come closer. Closer.', { rules: [R('damaged', [{ do: 'zone', kind: 'tar', at: 'player', radius: 4, duration: 5 }], { cooldown: 6 })] }),
    T('Spectral Storm', 'blades', 'The scythe remembers every harvest.', { rules: [R('attack', [{ do: 'projectiles', kind: 'scythe', count: 6, mult: 0.4 }], { every: 5 })] }),
    T('Morning Ritual', 'moon', 'Greet the night with a war cry.', { rules: [R('dayStart', [{ do: 'buff', buff: 'power_surge', duration: 60 }, { do: 'sound', sound: 'horn' }])] }),
    T('Fireball Volley', 'flame', 'Why cast one?', { maxRank: 3, rules: [R('interval', [{ do: 'projectiles', kind: 'fireball', count: [2, 3, 4], pattern: 'aimed', mult: 0.6, speed: 16 }], { seconds: 4 })] }),
    T('Mark of the Hunt', 'crosshair', 'One target. Total focus.', { rules: [R('interval', [{ do: 'status', at: 'strongest', status: 'shock', shock: 0.5, duration: 4 }, { do: 'text', at: 'strongest', text: 'MARKED', color: '#ff4a3a' }], { seconds: 5 })] }),
    T('Feral Leap', 'paw', 'Pounce, and pounce again.', { rules: [R('kill', [{ do: 'dashCharge' }], { chance: 0.1, cooldown: 2 })] }),
    T('Phoenix Feather', 'feather', 'Burn bright, come back brighter.', { big: true, downside: '20% less healing taken.', stats: { healTaken: -0.2 }, rules: [R('lowHealth', [{ do: 'explode', at: 'player', radius: 6, of: 'maxHp', mult: 3, style: 'fire' }, { do: 'heal', mult: 0.5 }, { do: 'buff', buff: { name: 'Rekindled', icon: 'flame', color: '#ff8a3a', duration: 8, stats: { dmgMult: 0.4, moveMult: 0.2 } } }], { threshold: 0.2, cooldown: 120 })] }),
    T('Gravedigger', 'pickaxe', 'Every corpse a coin.', { rules: [R('kill', [{ do: 'drop', item: 'essence', amount: 2 }], { chance: 0.05 })] }),
  ];

  // ---------- rolling new ones ----------
  // How often each trigger happens, roughly (per second), and whether it has a monster.
  const TRIG = {
    hit: { rate: 6, target: true }, crit: { rate: 1.5, target: true }, kill: { rate: 4, target: true }, attack: { rate: 1.5 }, damaged: { rate: 0.6, target: true }, block: { rate: 0.15, target: true },
    lowHealth: { rate: 0.01 }, dash: { rate: 0.25 }, trinket: { rate: 0.02 }, bleed: { rate: 2, target: true }, poison: { rate: 4, target: true }, status: { rate: 1, target: true },
    interval: { rate: 0 }, still: { rate: 0.05 }, distance: { rate: 0 }, levelUp: { rate: 0.02 }, bossAppears: { rate: 0.005, target: true },
  };
  const DAMAGE = ['explode', 'strike', 'lightning', 'projectiles', 'zone'];
  const AFFLICT = ['status', 'poison', 'bleed', 'holyFire', 'spread', 'knockback', 'execute'];
  const SELF = ['heal', 'shield', 'buff', 'invulnerable', 'dashCharge', 'extraAttack', 'empower', 'trinketCooldown'];
  const LOOT = ['drop', 'gain', 'magnet'];
  const pickW = (o) => U.weighted(Object.keys(o), (k) => o[k]);
  const r2 = (v) => Math.round(v * 100) / 100;
  const ICON = { explode: 'bomb', strike: 'sword', lightning: 'bolt', projectiles: 'blades', zone: 'area', status: 'stars', poison: 'poison', bleed: 'blood', holyFire: 'holycross', spread: 'chain', knockback: 'burst', execute: 'skull',
    heal: 'heart', shield: 'shield', buff: 'bloodlust', invulnerable: 'halo', dashCharge: 'boot', extraAttack: 'sword', empower: 'crosshair', trinketCooldown: 'pocketwatch', drop: 'essence', gain: 'essence', magnet: 'magnet' };
  const WORDS = {
    explode: [['Cinder', 'Blasting', 'Volatile', 'Ember', 'Thundering'], ['Heart', 'Pact', 'Fuse', 'Bloom', 'Requiem']],
    strike: [['Phantom', 'Silent', 'Iron', 'Wicked', 'Savage'], ['Claw', 'Strike', 'Verdict', 'Lash', 'Pounce']],
    lightning: [['Storm', 'Static', 'Crackling', 'Sky', 'Tesla'], ['Whiskers', 'Arc', 'Fork', 'Tail', 'Spark']],
    projectiles: [['Whirling', 'Spectral', 'Scattered', 'Thousand', 'Restless'], ['Blades', 'Volley', 'Harvest', 'Barrage', 'Fan']],
    zone: [['Cursed', 'Burning', 'Hungry', 'Sunken', 'Rotten'], ['Ground', 'Mire', 'Circle', 'Footprints', 'Grave']],
    status: [['Numbing', 'Paralyzing', 'Binding', 'Hexed', 'Chilling'], ['Gaze', 'Hiss', 'Grip', 'Stare', 'Chord']],
    poison: [['Venomous', 'Festering', 'Toxic', 'Bitter', 'Witch\'s'], ['Kiss', 'Brew', 'Fang', 'Dew', 'Tongue']],
    bleed: [['Serrated', 'Crimson', 'Ragged', 'Weeping', 'Butcher\'s'], ['Edge', 'Wound', 'Claws', 'Thorn', 'Smile']],
    holyFire: [['Sacred', 'Radiant', 'Blessed', 'Haloed', 'Gilded'], ['Flame', 'Psalm', 'Candle', 'Vigil', 'Light']],
    spread: [['Creeping', 'Contagious', 'Spreading', 'Rampant', 'Viral'], ['Rot', 'Plague', 'Whisper', 'Blight', 'Gossip']],
    knockback: [['Thundering', 'Mighty', 'Rolling', 'Roaring', 'Booming'], ['Roar', 'Shove', 'Wave', 'Howl', 'Bellow']],
    execute: [['Final', 'Merciless', 'Grim', 'Last', 'Cold'], ['Verdict', 'Rites', 'Harvest', 'Mercy', 'Word']],
    heal: [['Warm', 'Purring', 'Mending', 'Gentle', 'Lucky'], ['Milk', 'Nap', 'Heart', 'Paws', 'Whiskers']],
    shield: [['Stubborn', 'Iron', 'Bristling', 'Stone', 'Brave'], ['Fur', 'Hide', 'Guard', 'Wall', 'Coat']],
    buff: [['Wild', 'Feral', 'Frenzied', 'Burning', 'Rising'], ['Blood', 'Spirit', 'Instinct', 'Rush', 'Tide']],
    invulnerable: [['Untouchable', 'Ghostly', 'Fleeting', 'Blessed', 'Sly'], ['Shadow', 'Moment', 'Escape', 'Shroud', 'Grace']],
    dashCharge: [['Nimble', 'Quick', 'Restless', 'Fleet', 'Springy'], ['Paws', 'Leap', 'Step', 'Tail', 'Hop']],
    extraAttack: [['Twin', 'Echoing', 'Double', 'Relentless', 'Furious'], ['Swipe', 'Flurry', 'Fury', 'Claws', 'Rhythm']],
    empower: [['Coiled', 'Patient', 'Gathering', 'Charged', 'Wound-up'], ['Spring', 'Fury', 'Pounce', 'Wrath', 'Storm']],
    trinketCooldown: [['Ticking', 'Tinkerer\'s', 'Busy', 'Clockwork', 'Hasty'], ['Gears', 'Hands', 'Pocket', 'Springs', 'Charm']],
    drop: [['Greedy', 'Lucky', 'Golden', 'Shiny', 'Hoarder\'s'], ['Pockets', 'Paws', 'Fortune', 'Coin', 'Find']],
    gain: [['Greedy', 'Lucky', 'Golden', 'Shiny', 'Hoarder\'s'], ['Pockets', 'Paws', 'Fortune', 'Coin', 'Find']],
    magnet: [['Lodestone', 'Hungry', 'Grasping', 'Pulling', 'Gathering'], ['Whiskers', 'Charm', 'Heart', 'Paws', 'Pull']],
  };
  // How much of your hit damage each damage action is worth per use, before the trigger's rarity.
  const PER_SEC = 0.6;   // a rolled talent adds about this much of your hit damage per second
  function sizeDamage(rate) { return r2(U.clamp(PER_SEC / Math.max(0.02, rate), 0.15, 12)); }
  function rollAction(kind, rate, hasTarget) {
    const at = hasTarget ? U.pick(['target', 'target', 'nearest', 'random']) : U.pick(['player', 'nearest', 'random', 'strongest']);
    const m = sizeDamage(rate);
    switch (kind) {
      case 'explode': { const style = U.pick(['fire', 'meteor', 'holy', 'void', 'frost']); return { do: 'explode', at, radius: U.pick([2.5, 3, 4]), mult: r2(m / 2), style, ...(style === 'meteor' ? { delay: 0.7 } : {}), ...(Math.random() < 0.15 ? { type: 'acid' } : {}) }; }
      case 'strike': return { do: 'strike', at, mult: m, type: U.pick(['physical', 'elemental', 'poison']) };
      case 'lightning': return { do: 'lightning', at, chains: U.rndi(3, 8), mult: r2(m / 4) };
      case 'projectiles': { const n = U.rndi(3, 10); return { do: 'projectiles', kind: U.pick(['knife', 'scythe', 'wave', 'bullet', 'dart', 'fireball', 'flask']), count: n, pattern: U.pick(['ring', 'aimed', 'fan']), mult: r2(Math.max(0.15, m / n * 1.5)), ...(hasTarget && Math.random() < 0.5 ? { from: 'target' } : {}) }; }
      case 'zone': return { do: 'zone', kind: U.pick(['fire', 'acid', 'poison', 'blood', 'holy', 'tar', 'void']), at, radius: U.pick([2.5, 3, 3.5]), duration: U.pick([3, 4, 5]), mult: r2(m / 12) };
      case 'status': return { do: 'status', status: U.pick(['slow', 'shock', 'stun', 'root']), at, radius: U.pick([0, 0, 3, 5]), duration: U.pick([0, 2, 3]) };
      case 'poison': return { do: 'poison', stacks: U.rndi(2, 6), at, radius: U.pick([0, 3]) };
      case 'bleed': return { do: 'bleed', at, radius: U.pick([0, 3]), mult: r2(Math.min(3, m)) };
      case 'holyFire': return { do: 'holyFire', at, radius: U.pick([0, 3, 5]), mult: r2(Math.min(1.5, m / 3)), duration: 3 };
      case 'spread': return { do: 'spread', what: U.pick(['poison', 'bleed', 'holy', 'statuses']), radius: U.pick([3, 4, 5]) };
      case 'knockback': return { do: 'knockback', at: hasTarget ? 'target' : 'player', radius: U.pick([4, 5, 6]), strength: U.pick([12, 18, -12]) };
      case 'execute': return { do: 'execute', below: U.pick([0.08, 0.1, 0.15]), at: hasTarget ? 'target' : 'weakest' };
      case 'heal': return { do: 'heal', mult: r2(U.clamp(0.02 / Math.max(0.02, rate) * 0.5, 0.005, 0.3)) };
      case 'shield': return { do: 'shield', mult: r2(U.clamp(0.04 / Math.max(0.05, rate), 0.03, 0.3)), duration: U.pick([3, 4, 5]) };
      case 'buff': return { do: 'buff', buff: Math.random() < 0.6 ? rollBuff() : U.pick(Object.keys(G.BUFFS).filter((b) => !G.BUFFS[b].inline && Object.keys(G.BUFFS[b].stats).length)), duration: U.pick([0, 3, 5]) };
      case 'invulnerable': return { do: 'invulnerable', seconds: U.pick([0.5, 1, 1.5]) };
      case 'dashCharge': return { do: 'dashCharge' };
      case 'extraAttack': return { do: 'extraAttack', count: U.rndi(1, 3) };
      case 'empower': return { do: 'empower', more: U.pick([0.5, 1, 2]), hits: U.rndi(1, 4) };
      case 'trinketCooldown': return { do: 'trinketCooldown', seconds: U.pick([1, 2, 3]) };
      case 'drop': return { do: 'drop', item: U.pick(['essence', 'xp', 'fish']), amount: U.pick([2, 5, 10]), ...(hasTarget ? {} : { at: 'player' }) };
      case 'gain': return { do: 'gain', what: U.pick(['essence', 'xp']), amount: U.pick([3, 5, 10]) };
      default: return { do: 'magnet' };
    }
  }
  function rollBuff() {
    const k = U.pick(['atkSpeed', 'moveMult', 'dmgMult', 'critChance', 'armorInc', 'regen', 'area']), v = { atkSpeed: 0.3, moveMult: 0.2, dmgMult: 0.25, critChance: 0.4, armorInc: 0.5, regen: 10, area: 0.3 }[k];
    const name = U.pick(['Fury', 'Rush', 'Haste', 'Zeal', 'Trance', 'Fervor', 'Instinct', 'Hunger']);
    return { name: U.pick(['Feral', 'Wild', 'Blessed', 'Cursed', 'Moonlit', 'Burning']) + ' ' + name, icon: U.pick(['bloodlust', 'bolt', 'feather', 'halo', 'stars', 'flame']), color: U.pick(['#ff6a4a', '#8af060', '#7fe0ff', '#ffd04a', '#c08aff']), duration: U.pick([3, 4, 5, 6]), stats: { [k]: v } };
  }
  function rollCondition(hasTarget) {
    if (hasTarget && Math.random() < 0.65) {
      return U.pick([
        { check: 'targetStatus', status: U.pick(['bleeding', 'poisoned', 'burning', 'shocked', 'slowed', 'stunned']) },
        { check: 'targetKind', kind: U.pick(['elite', 'boss', 'normal', 'flying']) },
        { check: 'targetHealth', below: U.pick([0.3, 0.5]) },
        { check: 'targetHealth', below: 1, above: 0.9 },
        { check: 'targetDistance', below: U.pick([3, 4]) },
        { check: 'targetDistance', below: 99, above: U.pick([6, 8]) },
      ]);
    }
    return U.pick([
      { check: 'myHealth', below: U.pick([0.35, 0.5]) }, { check: 'myHealth', below: 1, above: 0.9 }, { check: 'moving' }, { check: 'moving', not: true },
      { check: 'enemiesNear', radius: 5, atLeast: U.pick([8, 15, 25]) }, { check: 'killsRecent', count: U.pick([5, 10]), seconds: 4 }, { check: 'hitRecently', seconds: 3 },
      { check: 'myShield' }, { check: 'bossAlive' }, { check: 'weaponClass', class: U.pick(['melee', 'firearm', 'magic']) }, { check: 'trinketReady', not: true },
    ]);
  }
  function random(ED) {
    const when = pickW({ hit: 3, crit: 2, kill: 4, attack: 2, damaged: 2, block: 1, lowHealth: 1, dash: 2, trinket: 1, bleed: 1, poison: 1, status: 1, interval: 3, still: 1, distance: 1, levelUp: 0.5, bossAppears: 0.5 });
    const Tg = TRIG[when], rule = { when };
    let rate = Tg.rate;
    if (when === 'interval') { rule.seconds = U.pick([3, 4, 5, 6, 8, 10]); rate = 1 / rule.seconds; }
    if (when === 'distance') { rule.meters = U.pick([15, 20, 30, 40]); rate = 5 / rule.meters; }
    if (when === 'lowHealth') rule.threshold = U.pick([0.25, 0.35, 0.5]);
    if (when === 'still') rule.seconds = U.pick([1, 1.5, 2]);
    if (when === 'status') rule.status = U.pick(['any', 'slow', 'shock', 'stun', 'root']);
    // frequent triggers get a chance, a count or a cooldown
    if (rate > 1.2) {
      const how = U.pick(['chance', 'every', 'cooldown']);
      if (how === 'chance') { rule.chance = U.pick([0.05, 0.1, 0.15, 0.2, 0.25]); rate *= rule.chance; }
      else if (how === 'every') { rule.every = U.pick([5, 8, 10, 15, 20]); rate /= rule.every; }
      else { rule.cooldown = U.pick([1, 2, 3, 5]); rate = Math.min(rate, 1 / rule.cooldown); }
    } else if (['lowHealth', 'damaged', 'block', 'trinket', 'still'].includes(when) && Math.random() < 0.6) { rule.cooldown = U.pick([5, 10, 20, 30, 60]); rate = Math.min(rate, 1 / rule.cooldown); }
    const ifs = [];
    const nIf = U.pick([0, 0, 1, 1, 1, 2]);
    for (let i = 0; i < nIf; i++) { const c = rollCondition(Tg.target); if (!ifs.some((x) => x.check === c.check)) { ifs.push(c); rate *= 0.6; } }
    if (ifs.length) rule.if = ifs;
    // a main action and maybe a second, more often a small one
    const main = U.pick(Math.random() < 0.6 ? DAMAGE : Math.random() < 0.6 ? AFFLICT.concat(SELF) : SELF.concat(LOOT)).replace(/^spread$/, Tg.target ? 'spread' : 'explode').replace(/^execute$/, Tg.target ? 'execute' : 'strike');
    const then = [rollAction(main, rate, Tg.target)];
    if (Math.random() < 0.45) { const second = U.pick(Math.random() < 0.5 ? AFFLICT.filter((a) => a !== 'spread' || Tg.target) : SELF); if (second !== main) then.push(rollAction(second, rate * 2, Tg.target)); }
    if (Math.random() < 0.25) then.push(U.pick([{ do: 'shake', strength: 0.2 }, { do: 'sound', sound: U.pick(['warcry', 'zap', 'holy', 'roar', 'chime', 'bell']) }, { do: 'flash', color: U.pick(['#ffffff', '#ffd27a', '#c08aff', '#ff6a4a']), strength: 0.2 }]));
    rule.then = then;
    const w = WORDS[main] || WORDS.explode, name = `${U.pick(w[0])} ${U.pick(w[1])}`;
    const t = { name, icon: ICON[main] || 'star', rules: [rule] };
    if (Math.random() < 0.3) { t.maxRank = 3; for (const a of then) if (typeof a.mult === 'number') a.mult = [a.mult, r2(a.mult * 1.5), r2(a.mult * 2)]; }
    if (main === 'buff' && typeof then[0].buff === 'object') then[0].buff.icon = t.icon = then[0].buff.icon;
    if (G.audio.sounds && then.some((a) => a.do === 'sound' && !G.audio.sounds().includes(a.sound))) for (const a of then) if (a.do === 'sound') a.sound = 'warcry';
    return { talent: t, note: `Rolled from "${G.rules.TRIGGERS[when].name}".` };
  }
  window.IDEAS = { templates, random };
})();
