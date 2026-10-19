'use strict';
// Talents: one big tree per character (data/<character>_talents.json) bought with Totems of Power
// (from altars), and the Miracles: big talents with no tree (character panel > Miracles, Y; the JSON's
// "alien" section, G.CHAR.alien) bought with Miracles (currency id 'spoon', G.run.spoons) from the bonfire
// at night. Both currencies and the learned ranks belong to the current run (G.run): everything resets
// when a run ends.
(function () {
  const TL = G.talents = {};
  const tree = () => G.CHAR.tree;
  const ranks = () => G.run.talents;
  // Every talent: the tree's and the Miracles.
  TL.all = () => tree().talents.concat(G.CHAR.alien.talents);
  TL.byId = (id) => tree().byId[id] || G.CHAR.alien.byId[id];

  TL.rank = (id) => { const t = TL.byId(id); return t && t.start ? t.maxRank : ranks()[id] || 0; };
  // Points spent this run, of one currency or (cur omitted) of all of them.
  TL.spent = function (cur) {
    let n = 0;
    for (const t of TL.all()) if (!t.start && (!cur || t.currency === cur)) n += TL.rank(t.id) * t.cost;
    return n;
  };
  TL.owned = (cur) => (cur === 'spoon' ? G.run.spoons : G.run.totems);
  TL.points = (cur = 'totem') => Math.max(0, TL.owned(cur) - TL.spent(cur));
  TL.groupPoints = (g) => tree().talents.reduce((a, t) => a + (t.group === g && !t.start ? TL.rank(t.id) * t.cost : 0), 0);
  // Where each segment's name goes on a tree (in grid cells; the game and the talent creator both use it):
  // the free spot nearest its talents, clear of nodes, lines, the tree's edges and the other names.
  // nodes: [{ x, y, segment, links: [{ x, y }] }]; segs: [{ id, w }] (w: the name's width in cells);
  // o: { h: the name's height, boxes: [[x0, y0, x1, y1]] room each node takes around its centre }.
  TL.labelSpots = function (nodes, segs, o) {
    const out = {}, placed = [], lines = [];
    for (const n of nodes) for (const p of n.links) lines.push([n.x, n.y, p.x, p.y]);
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y), B = [Math.min(...xs) - 0.9, Math.min(...ys) - 0.9, Math.max(...xs) + 0.9, Math.max(...ys) + 0.9];
    const over = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const crosses = (L, r) => {   // Liang-Barsky: does the line L cross the box r?
      const dx = L[2] - L[0], dy = L[3] - L[1];
      let t0 = 0, t1 = 1;
      for (const [p, q] of [[-dx, L[0] - r[0]], [dx, r[2] - L[0]], [-dy, L[1] - r[1]], [dy, r[3] - L[1]]]) {
        if (!p) { if (q < 0) return false; continue; }
        const t = q / p;
        if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
      return true;
    };
    for (const s of segs) {
      const mine = nodes.filter((n) => n.segment === s.id);
      if (!mine.length) continue;
      const cx = mine.reduce((a, n) => a + n.x, 0) / mine.length, cy = mine.reduce((a, n) => a + n.y, 0) / mine.length, hw = s.w / 2, hh = o.h / 2;
      let best = null;
      for (const m of mine) for (let dy = -1.5; dy <= 1.5; dy += 0.25) for (let dx = -1.5; dx <= 1.5; dx += 0.25) {
        const x = m.x + dx, y = m.y + dy, r = [x - hw, y - hh, x + hw, y + hh];
        let cost = Math.min(...mine.map((n) => Math.hypot(n.x - x, n.y - y))) + 0.25 * Math.hypot(cx - x, cy - y) + (dy > 0 ? 0.15 : 0);
        if (best && cost >= best.cost) continue;
        if (r[0] < B[0] || r[1] < B[1] || r[2] > B[2] || r[3] > B[3]) cost += 50;
        for (const n of nodes) for (const b of o.boxes) if (over(r, [n.x + b[0], n.y + b[1], n.x + b[2], n.y + b[3]])) cost += 100;
        for (const p of placed) if (over(r, p)) cost += 100;
        if (best && cost >= best.cost) continue;
        for (const L of lines) if (crosses(L, r)) cost += 4;
        if (!best || cost < best.cost) best = { x, y, r, cost };
      }
      out[s.id] = { x: best.x, y: best.y };
      placed.push(best.r);
    }
    return out;
  };
  // Every requirement of a talent as { text, met }.
  TL.requirements = function (t) {
    const out = [], name = (r) => { const p = TL.byId(r.id); return r.rank > 1 ? `${p.name} rank ${r.rank}` : p.name; };
    for (const r of t.requires) out.push({ text: name(r), met: TL.rank(r.id) >= r.rank });
    if (t.requiresAny.length) {
      out.push({ text: (t.requiresAny.length > 1 ? 'One of: ' : '') + t.requiresAny.map(name).join(' or '), met: t.requiresAny.some((r) => TL.rank(r.id) >= r.rank) });
    }
    if (t.minSpent) out.push({ text: `${t.minSpent} points spent in the tree`, met: TL.spent('totem') >= t.minSpent });
    return out;
  };
  TL.unmet = (t) => TL.requirements(t).filter((r) => !r.met).map((r) => r.text);
  TL.canLearn = (t) => !t.start && TL.rank(t.id) < t.maxRank && TL.points(t.currency) >= t.cost && !TL.unmet(t).length;

  TL.learn = function (id) {
    const t = TL.byId(id);
    if (!t || !TL.canLearn(t)) return false;
    ranks()[id] = TL.rank(id) + 1;
    G.progress.onTalentsChanged();
    return true;
  };
  TL.reset = function () {
    G.run.talents = {};
    G.progress.onTalentsChanged();
  };
  // Each level (day) gives at most G.TALENT_CAP of each currency. These return how many were gained.
  TL.dayLeft = (cur) => Math.max(0, G.TALENT_CAP[cur] - G.run.dayPts[cur]);
  function gain(cur, n) {
    const k = Math.min(n, TL.dayLeft(cur));
    G.run.dayPts[cur] += k;
    if (cur === 'spoon') G.run.spoons += k; else G.run.totems += k;
    return k;
  }
  TL.addTotems = (n) => gain('totem', n);
  TL.addSpoons = (n) => gain('spoon', n);
  TL.newDay = function () { G.run.dayPts = { totem: 0, spoon: 0 }; };
  // Adds the current character's learned talents to a stat block (stats are per rank). Talent
  // effects go into s.fx, keyed by effect id.
  TL.apply = function (s) {
    for (const t of TL.all()) {
      const r = TL.rank(t.id);
      if (!r) continue;
      for (const k in t.stats) G.addStat(s, k, t.stats[k] * r);
      if (t.effect) s.fx[t.effect.id] = t.effect;
    }
  };
})();
