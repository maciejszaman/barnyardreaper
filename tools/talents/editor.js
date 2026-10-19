'use strict';
// Talent creator: edits a character's talent file (data/<character>_talents.json) in place. The tree on
// the left (drag nodes, drag from a node's handle to link or to make a new talent, Ctrl+click to link),
// the talent on the right: its fields, stats, built-in effect, and rules (js/rules.js) built from the
// game's own vocabulary. Saving writes the file through tools/serve.py in the file's own style.
// Names (CLAUDE.md): mode 'alien' / the file's "alien" section is the Miracles (currency id 'spoon');
// rule values 'essence' are Embers and 'spoons' Miracles. Ids stay as saved; only labels change.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RU = G.rules, CW = 68, CH = 62, NS = 'http://www.w3.org/2000/svg';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const round = (v) => Math.round(v * 1e6) / 1e6;
  const ED = window.ED = { mode: 'tree', sel: [], link: null, undo: [], redo: [], dirty: false, view: { x: 0, y: 0, z: 1 }, tab: 'talent', server: false, autoId: new Set(), probs: [], bad: new Set() };

  // ---------- small DOM helper ----------
  // el('div', { class: 'x', text: 'hi', onclick: fn, title: '...' }, [children])
  function el(tag, props, kids) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = !!v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(kids || [])) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  const icon = (k) => G.ui.icon(k || 'star');
  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  function status(msg, cls) { const s = $('status'); s.textContent = msg; s.className = cls || ''; s.title = msg; }

  // ---------- the file ----------
  const list = () => (ED.mode === 'alien' ? (ED.doc.alien && ED.doc.alien.talents) || [] : ED.doc.talents);
  const groups = () => (ED.mode === 'alien' ? (ED.doc.alien && ED.doc.alien.groups) || [] : ED.doc.groups);
  const find = (id) => list().find((t) => t.id === id);
  const cur = () => (ED.sel.length ? find(ED.sel[ED.sel.length - 1]) : null);
  const gColor = (t) => { const g = groups().find((x) => x.id === t.group); return (g && g.color) || '#f1e6cf'; };
  // Segments: named sets of tree talents (any group) that glow in their own color, e.g. "Life stacking".
  // The tree only: Miracles (the file's "alien" section, mode 'alien') have none.
  const segs = () => (ED.mode === 'tree' && Array.isArray(ED.doc.segments) ? ED.doc.segments : []);
  const segOf = (t) => (t && t.segment ? segs().find((s) => s.id === t.segment) || null : null);
  // A file's segments list, made right after its groups the first time one is added.
  function segsIn(doc) {
    if (!Array.isArray(doc.segments)) {
      const keys = Object.keys(doc), at = keys.indexOf('groups') + 1 || keys.length, tail = keys.slice(at).map((k) => [k, doc[k]]);
      for (const [k] of tail) delete doc[k];
      doc.segments = [];
      for (const [k, v] of tail) doc[k] = v;
    }
    return doc.segments;
  }
  const reqs = (t, kind) => (Array.isArray(t[kind]) ? t[kind] : []).map((r) => (typeof r === 'string' ? { id: r, rank: 1 } : { id: r && r.id, rank: Math.max(1, (r && r.rank) || 1) }));
  const setReqs = (t, kind, arr) => { if (arr.length) setKey(t, kind, arr.map((r) => (r.rank > 1 ? { id: r.id, rank: r.rank } : r.id))); else delete t[kind]; };
  // New keys go where the file's talents keep them, not at the end.
  const ORDER = ['id', 'x', 'y', 'group', 'segment', 'start', 'big', 'disabled', 'currency', 'name', 'icon', 'cost', 'maxRank', 'stats', 'requiresAny', 'requires', 'minSpent', 'effect', 'rules', 'conditionalStats', 'hitBonus', 'text', 'downside', 'desc'];
  function setKey(o, k, v) {
    if (k in o || !ORDER.includes(k)) { o[k] = v; return; }
    const i = ORDER.indexOf(k), keys = Object.keys(o);
    let at = keys.length;
    for (let j = 0; j < keys.length; j++) { const oi = ORDER.indexOf(keys[j]); if (oi > i) { at = j; break; } }
    const tail = keys.slice(at).map((kk) => [kk, o[kk]]);
    for (const [kk] of tail) delete o[kk];
    o[k] = v;
    for (const [kk, vv] of tail) o[kk] = vv;
  }
  // Rule parts keep a readable key order: a rule's name, trigger and numbers before its if / then; a
  // condition's check, an action's do, then their numbers in the order rules.js lists them.
  function order(o, keys) {
    const all = Object.keys(o), want = keys.filter((k) => k in o).concat(all.filter((k) => !keys.includes(k)));
    if (want.every((k, i) => all[i] === k)) return;
    const vals = want.map((k) => [k, o[k]]);
    for (const k of all) delete o[k];
    for (const [k, v] of vals) o[k] = v;
  }
  const specKeys = (S) => ((S && S.params) || []).map((q) => q.k);
  function tidy(t) {
    const conds = (list) => { for (const c of list || []) order(c, ['check', 'not'].concat(specKeys(RU.CONDITIONS[c.check]))); };
    for (const r of t.rules || []) {
      order(r, ['name', 'disabled', 'when'].concat(specKeys(RU.TRIGGERS[r.when]), RU.RULE_PARAMS.map((q) => q.k), ['if', 'then']));
      conds(r.if);
      for (const a of r.then || []) order(a, ['do'].concat(specKeys(RU.ACTIONS[a.do])));
    }
    for (const c of t.conditionalStats || []) { order(c, ['if', 'stats']); conds(c.if); }
    for (const c of t.hitBonus || []) { order(c, ['if', 'more']); conds(c.if); }
  }
  const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'talent';
  function uniqueId(base, except) {
    const all = new Set([...ED.doc.talents, ...((ED.doc.alien && ED.doc.alien.talents) || [])].map((t) => t.id));
    if (except) all.delete(except);
    let id = base, n = 2;
    while (all.has(id)) id = `${base}_${n++}`;
    return id;
  }

  // ---------- undo ----------
  // change(key, fn): edits under the same key within a second are one undo step (typing).
  function change(key, fn, o = {}) {
    const now = performance.now();
    if (key !== ED.lastKey || now - ED.lastT > 1000) { ED.undo.push(ED.snap); if (ED.undo.length > 300) ED.undo.shift(); ED.redo = []; }
    ED.lastKey = key; ED.lastT = now;
    fn();
    const c = cur();
    if (c) tidy(c);
    ED.snap = JSON.stringify(ED.doc);
    ED.dirty = ED.snap !== ED.savedSnap;
    refresh(o);
  }
  function undo(redo) {
    const from = redo ? ED.redo : ED.undo, to = redo ? ED.undo : ED.redo;
    if (!from.length) return;
    to.push(ED.snap);
    ED.snap = from.pop(); ED.doc = JSON.parse(ED.snap); ED.lastKey = null;
    ED.dirty = ED.snap !== ED.savedSnap;
    ED.sel = ED.sel.filter((id) => find(id)); ED.link = null;
    refresh({ form: true });
  }
  let probT = 0;
  function refresh(o = {}) {
    renderTree();
    if (o.form) renderSide(); else updateLive();
    $('h-undo').disabled = !ED.undo.length; $('h-redo').disabled = !ED.redo.length;
    clearTimeout(probT); probT = setTimeout(() => { validate(); renderTree(); renderTabs(); if (ED.tab === 'problems' && !o.form) renderSide(); }, 250);
    showStatus();
  }
  function showStatus() {
    if (ED.dirty) status(`● Unsaved changes in data/${ED.file}`, 'bad');
    else status(`data/${ED.file}${ED.server ? '' : ' · no save server: Save downloads the file'}`, ED.server ? '' : 'bad');
    $('h-save').textContent = ED.server ? 'Save' : 'Download';
  }

  // ---------- loading and saving ----------
  async function getText(file) {
    const r = await fetch(G.DATA_URL + file + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`data/${file}: HTTP ${r.status}`);
    return r.text();
  }
  async function ping() {
    try { const r = await fetch('../../api/ping', { cache: 'no-store' }); return r.ok && (await r.json()).ok === true; } catch (e) { return false; }
  }
  async function openFile(file) {
    const text = await getText(file);
    ED.file = file; ED.loadedText = text; ED.doc = JSON.parse(text);
    if (!Array.isArray(ED.doc.groups)) ED.doc.groups = [];
    if (!Array.isArray(ED.doc.talents)) ED.doc.talents = [];
    ED.snap = ED.savedSnap = JSON.stringify(ED.doc); ED.undo = []; ED.redo = []; ED.dirty = false; ED.lastKey = null;
    ED.sel = []; ED.link = null;
    if (ED.mode === 'alien' && !ED.doc.alien) ED.mode = 'tree';
    validate(); fit(); refresh({ form: true }); renderTabs();
  }
  async function save() {
    for (const t of ED.doc.talents.concat((ED.doc.alien && ED.doc.alien.talents) || [])) tidy(t);
    const text = prettyJSON(ED.doc);
    if (!ED.server) {
      const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: ED.file });
      document.body.append(a); a.click(); a.remove();
      status(`Downloaded ${ED.file}: put it in data/ (or run python3 tools/serve.py to save straight away)`, 'bad');
      return false;
    }
    try {
      const disk = await getText(ED.file);
      if (disk !== ED.loadedText && !confirm(`data/${ED.file} changed on disk since it was opened here (edited in another program?).\n\nOverwrite it with this version? (The old one is kept in tools/backups/.)`)) return false;
      const r = await fetch('../../api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: ED.file, text }) });
      const res = await r.json();
      if (!res.ok) throw new Error(res.error || 'save failed');
      ED.loadedText = text; ED.savedSnap = ED.snap; ED.dirty = false;
      showStatus(); status(`Saved data/${ED.file}${res.backup ? ` · old version in ${res.backup}` : ''}`, 'good');
      return true;
    } catch (e) { status('Save failed: ' + e.message, 'bad'); alert('Save failed: ' + e.message); return false; }
  }

  // ---------- validation ----------
  // Every problem the game's loader would report, plus tree-shape ones. { lvl: 'err' | 'warn', id, text }
  function validate() {
    const out = [], icons = new Set(G.ui.iconKeys());
    const check = (talents, gs, free, label) => {
      const ids = new Map(), cells = {}, gids = new Set(gs.map((g) => g.id)), sids = new Set((Array.isArray(ED.doc.segments) ? ED.doc.segments : []).map((s) => s.id));
      for (const t of talents) {
        if (t.disabled) continue;
        const p = (lvl, text) => out.push({ lvl, id: t.id, mode: free ? 'alien' : 'tree', text: `${label}${t.name || t.id}: ${text}` });
        if (!t.id) p('err', 'has no id');
        else if (ids.has(t.id)) p('err', `id "${t.id}" is used twice`);
        ids.set(t.id, t);
        if (t.group != null && !gids.has(t.group)) p('warn', `unknown group "${t.group}"`);
        if (t.segment != null && (free || !sids.has(t.segment))) p('warn', free ? 'Miracles have no segments' : `unknown segment "${t.segment}"`);
        if (t.currency != null && !G.CURRENCIES[t.currency]) p('err', `unknown currency "${t.currency}"`);
        if (t.icon && !icons.has(t.icon)) p('warn', `unknown icon "${t.icon}"`);
        for (const k of Object.keys(t.stats || {})) { if (!G.STATS[k]) p('err', `unknown stat "${k}"`); else if (typeof t.stats[k] !== 'number') p('err', `stat "${k}" is not a number`); }
        if (t.effect) { const eid = typeof t.effect === 'string' ? t.effect : t.effect.id; if (!G.EFFECTS[eid]) p('err', `unknown effect "${eid}"`); }
        if (!free) {
          const c = Math.round(t.x || 0) + ',' + Math.round(t.y || 0);
          if (cells[c]) p('err', `sits on the same spot (${c}) as ${cells[c]}`); else cells[c] = t.name || t.id;
        }
        const warns = [];
        RU.compile(clone(t), { id: t.id, maxRank: t.maxRank || 1, stats: {} }, '', (m) => warns.push(m));
        for (const w of warns) p('err', w.replace(/^ ?\S+ /, ''));
        if (!t.text && !(t.rules || []).length && !(t.conditionalStats || []).length && !(t.hitBonus || []).length && t.effect) p('warn', 'has an effect but no text: the tooltip will not say what it does');
      }
      for (const t of talents) {
        if (t.disabled) continue;
        const p = (lvl, text) => out.push({ lvl, id: t.id, mode: free ? 'alien' : 'tree', text: `${label}${t.name || t.id}: ${text}` });
        for (const r of [...reqs(t, 'requires'), ...reqs(t, 'requiresAny')]) if (!ids.has(r.id)) p('err', `requires unknown talent "${r.id}"`);
        if (!free && !t.start && !reqs(t, 'requires').length && !reqs(t, 'requiresAny').length && !t.minSpent) p('warn', 'not linked to anything');
      }
      if (free) return;
      // reachable from the start node, and no loops of requirements
      const kids = {};
      for (const t of talents) for (const r of [...reqs(t, 'requires'), ...reqs(t, 'requiresAny')]) (kids[r.id] = kids[r.id] || []).push(t.id);
      const seen = new Set(), q = talents.filter((t) => t.start && !t.disabled).map((t) => t.id);
      q.forEach((id) => seen.add(id));
      while (q.length) for (const k of kids[q.shift()] || []) if (!seen.has(k)) { seen.add(k); q.push(k); }
      for (const t of talents) if (!t.disabled && !seen.has(t.id) && (reqs(t, 'requires').length || reqs(t, 'requiresAny').length)) out.push({ lvl: 'warn', id: t.id, mode: 'tree', text: `${t.name || t.id}: cannot be reached from the starting node` });
      const state = {};
      const visit = (id, path) => {
        if (state[id] === 1) { out.push({ lvl: 'err', id, mode: 'tree', text: `requirement loop: ${path.concat(id).join(' → ')}` }); return; }
        if (state[id] === 2) return;
        state[id] = 1;
        const t = ids.get(id);
        if (t) for (const r of [...reqs(t, 'requires'), ...reqs(t, 'requiresAny')]) visit(r.id, path.concat(id));
        state[id] = 2;
      };
      for (const t of talents) visit(t.id, []);
    };
    check(ED.doc.talents, ED.doc.groups, false, '');
    if (ED.doc.alien) check(ED.doc.alien.talents || [], ED.doc.alien.groups || [], true, 'Miracles · ');
    ED.probs = out;
    ED.bad = new Set(out.filter((x) => x.lvl === 'err').map((x) => x.mode + ':' + x.id));
  }

  // ---------- the tree ----------
  const svg = () => $('tree');
  const V = ED.view;
  // Where each talent is drawn (cells). The tree: its x, y. Miracles: a column per group.
  function cells() {
    const out = new Map();
    if (ED.mode === 'tree') { for (const t of list()) out.set(t.id, { x: Math.round(t.x || 0), y: Math.round(t.y || 0) }); return out; }
    const cols = alienCols();
    cols.forEach((c, ci) => c.items.forEach((t, i) => out.set(t.id, { x: ci * 3, y: i + 1 })));
    return out;
  }
  function alienCols() {
    const gs = groups(), cols = gs.map((g) => ({ g, items: [] })), other = { g: { id: null, name: 'No group', color: '#a99a84' }, items: [] };
    for (const t of list()) { const c = cols.find((x) => x.g.id === t.group); (c || other).items.push(t); }
    if (other.items.length || !cols.length) cols.push(other);
    return cols;
  }
  const size = (t) => (t.big ? 26 : 21);
  const segGlow = (s) => (s.glow != null && isFinite(s.glow) ? Math.max(0, Math.min(1, s.glow)) : 0.6);   // as the game reads it
  let labelsKey = '', labels = {};
  function segLabels(showNames) {
    const key = ED.snap + ED.mode + showNames;
    if (key === labelsKey) return labels;
    labelsKey = key;
    const pos = cells(), ss = segs().filter((s) => list().some((t) => t.segment === s.id && !t.disabled)), live = list().filter((t) => !t.disabled && pos.get(t.id));
    if (!ss.length) return (labels = {});
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = '600 10px system-ui, sans-serif';
    const nodes = live.map((t) => ({ ...pos.get(t.id), segment: t.segment, links: [...reqs(t, 'requiresAny'), ...reqs(t, 'requires')].map((q) => pos.get(q.id)).filter(Boolean) }));
    // a node's box, and its name under it when names show (.n-name: about 70px wide, 13px down)
    const boxes = [[-0.4, -0.42, 0.4, 0.42]].concat(showNames ? [[-0.55, 0.3, 0.55, 0.62]] : []);
    return (labels = G.talents.labelSpots(nodes, ss.map((s) => { const nm = String(s.name || s.id).toUpperCase(); return { id: s.id, w: (meas.measureText(nm).width + nm.length * 1.6 + 8) / CW }; }), { h: 0.28, boxes }));
  }
  function toWorld(ev) { const r = svg().getBoundingClientRect(); return { x: (ev.clientX - r.left - V.x) / V.z, y: (ev.clientY - r.top - V.y) / V.z }; }
  function fit() {
    const pos = [...cells().values()], r = svg().getBoundingClientRect();
    if (!pos.length || !r.width) { V.x = r.width / 2; V.y = 60; V.z = 1; return; }
    const x0 = Math.min(...pos.map((p) => p.x)) * CW - CW, x1 = Math.max(...pos.map((p) => p.x)) * CW + CW, y0 = Math.min(...pos.map((p) => p.y)) * CH - CH, y1 = Math.max(...pos.map((p) => p.y)) * CH + CH;
    V.z = Math.max(0.25, Math.min(1.6, Math.min(r.width / (x1 - x0), (r.height - 40) / (y1 - y0))));
    V.x = r.width / 2 - ((x0 + x1) / 2) * V.z; V.y = (r.height - 30) / 2 - ((y0 + y1) / 2) * V.z;
  }
  function centerOn(id) {
    const p = cells().get(id), r = svg().getBoundingClientRect();
    if (!p) return;
    V.x = r.width / 2 - p.x * CW * V.z; V.y = r.height / 2 - p.y * CH * V.z;
  }
  function renderTree() {
    const S = svg(), r = S.getBoundingClientRect(), pos = cells(), D = ED.drag;
    const at = (id) => { const p = pos.get(id); if (!p) return null; const moving = D && D.kind === 'move' && D.ids.includes(id); return { x: (p.x + (moving ? D.dx : 0)) * CW, y: (p.y + (moving ? D.dy : 0)) * CH }; };
    const vx0 = -V.x / V.z, vy0 = -V.y / V.z, vw = r.width / V.z, vh = r.height / V.z;
    let h = `<defs><pattern id="gp" width="${CW}" height="${CH}" patternUnits="userSpaceOnUse" x="${-CW / 2}" y="${-CH / 2}"><circle cx="${CW / 2}" cy="${CH / 2}" r="1.6" fill="#3a302a"/></pattern>`
      + '<filter id="sglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter></defs>';
    h += `<g transform="translate(${V.x} ${V.y}) scale(${V.z})"><rect x="${vx0}" y="${vy0}" width="${vw}" height="${vh}" fill="url(#gp)"/>`;
    // segments: a blurred glow in the segment's color (its glow is the opacity) under its talents and the
    // links between them
    let glow = '';
    for (const s of segs()) {
      let g = '';
      for (const t of list()) {
        const b = t.segment === s.id && at(t.id);
        if (!b) continue;
        for (const q of [...reqs(t, 'requiresAny'), ...reqs(t, 'requires')]) { const o = find(q.id), a = o && o.segment === s.id && at(q.id); if (a) g += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${esc(s.color)}" stroke-width="12"/>`; }
        const r = size(t) + 7;
        g += `<rect x="${b.x - r}" y="${b.y - r}" width="${2 * r}" height="${2 * r}" rx="${t.start ? r : 12}" fill="${esc(s.color)}"/>`;
      }
      if (g && segGlow(s) > 0) glow += `<g opacity="${segGlow(s)}">${g}</g>`;
    }
    if (glow) h += `<g filter="url(#sglow)" pointer-events="none">${glow}</g>`;
    if (ED.mode === 'alien') alienCols().forEach((c, ci) => { h += `<text class="col-head" x="${ci * 3 * CW}" y="${CH * 0.15}" text-anchor="middle" fill="${esc(c.g.color)}">${esc(c.g.name || c.g.id)}</text>`; });
    // links: requiresAny solid, requires (all of them) dashed; a rank above 1 is written on the line
    for (const t of list()) {
      const b = at(t.id);
      if (!b) continue;
      for (const kind of ['requiresAny', 'requires']) for (const q of reqs(t, kind)) {
        const a = at(q.id);
        if (!a) continue;
        const key = `${t.id}|${q.id}|${kind}`, sel = ED.link && ED.link.key === key, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        h += `<line class="link${kind === 'requires' ? ' all' : ''}${sel ? ' sel' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${esc(gColor(t))}"/>`;
        h += `<line class="link-hit" data-link="${esc(key)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><title>${esc((find(q.id) || {}).name || q.id)} → ${esc(t.name || t.id)} (${kind === 'requires' ? 'required' : 'one of'}${q.rank > 1 ? `, rank ${q.rank}` : ''})</title></line>`;
        if (kind === 'requires' || q.rank > 1) h += `<text class="l-tag" x="${mx}" y="${my + 4}" text-anchor="middle">${kind === 'requires' ? 'ALL' : ''}${q.rank > 1 ? ` r${q.rank}` : ''}</text>`;
      }
    }
    const showNames = V.z >= 0.55;
    // segment names, in a free spot next to their talents (worked out again only when the file changes)
    const spots = segLabels(showNames);
    for (const s of segs()) { const p = spots[s.id]; if (p) h += `<text class="s-label" x="${p.x * CW}" y="${p.y * CH + 3.5}" text-anchor="middle" fill="${esc(s.color)}">${esc(String(s.name || s.id).toUpperCase())}</text>`; }
    for (const t of list()) {
      const p = at(t.id);
      if (!p) continue;
      const s = size(t), sel = ED.sel.includes(t.id), col = gColor(t), bad = ED.bad.has(ED.mode + ':' + t.id);
      const nr = (t.rules || []).length + (t.conditionalStats || []).length + (t.hitBonus || []).length;
      h += `<g class="node${t.start ? ' start' : ''}${sel ? ' sel' : ''}${sel && ED.sel.length > 1 ? ' multi' : ''}${bad ? ' bad' : ''}${t.disabled ? ' off' : ''}" data-id="${esc(t.id)}" transform="translate(${p.x} ${p.y})">`;
      h += `<rect class="n-box" x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" rx="${t.start ? s : 7}" stroke="${esc(col)}"/>`;
      const iz = t.big ? 34 : 28;
      h += `<image href="${icon(t.icon)}" x="${-iz / 2}" y="${-iz / 2}" width="${iz}" height="${iz}" style="image-rendering:pixelated"/>`;
      if ((t.maxRank || 1) > 1) h += `<text class="n-rank" x="${s - 2}" y="${s - 3}" text-anchor="end">×${t.maxRank}</text>`;
      if (nr) h += `<text class="n-badge" x="${-s + 2}" y="${-s + 9}" fill="#8ff8ff">⚙${nr > 1 ? nr : ''}</text>`;
      else if (t.effect) h += `<text class="n-badge" x="${-s + 2}" y="${-s + 9}" fill="#ffd27a">★</text>`;
      if (t.currency === 'spoon' && ED.mode === 'tree') h += `<text class="n-badge" x="${s - 2}" y="${-s + 9}" text-anchor="end" fill="#ffd84a">M</text>`;
      if (showNames) { const nm = String(t.name || t.id); h += `<text class="n-name" y="${s + 13}" text-anchor="middle">${esc(nm.length > 12 ? nm.slice(0, 11).trim() + '…' : nm)}</text>`; }   // a cell is about 12 letters wide
      h += `<title>${esc(t.name || t.id)} (${esc(t.id)})${segOf(t) ? ` · ${esc(segOf(t).name || segOf(t).id)}` : ''}</title></g>`;
    }
    // the link handle under the selected talent: drag it to another talent, or to an empty spot
    const c0 = cur();
    if (c0 && ED.sel.length === 1 && !(D && D.kind === 'move')) { const p = at(c0.id); if (p) h += `<circle class="handle" data-handle="1" cx="${p.x}" cy="${p.y + size(c0) + (showNames ? 22 : 8)}" r="7"><title>Drag to another talent to link it below this one, or to an empty spot for a new talent</title></circle>`; }
    if (D && D.kind === 'link') { const a = at(D.from); h += `<line class="rubber" x1="${a.x}" y1="${a.y}" x2="${D.w.x}" y2="${D.w.y}"/>`; }
    if (D && D.kind === 'box') { const x = Math.min(D.a.x, D.w.x), y = Math.min(D.a.y, D.w.y); h += `<rect class="box" x="${x}" y="${y}" width="${Math.abs(D.w.x - D.a.x)}" height="${Math.abs(D.w.y - D.a.y)}"/>`; }
    h += '</g>';
    S.innerHTML = h;
    // legend: groups and how many points each holds
    $('legend').innerHTML = groups().map((g) => `<span><i style="background:${esc(g.color)}"></i>${esc(g.name || g.id)} <b>${list().filter((t) => t.group === g.id).length}</b></span>`).join('') + `<span>${list().length} talents</span>`
      + segs().map((s) => `<span class="lseg" data-seg="${esc(s.id)}" title="Click to select its talents"><i style="background:${esc(s.color)};box-shadow:0 0 6px 2px ${esc(s.color)}"></i>${esc(s.name || s.id)} <b>${list().filter((t) => t.segment === s.id).length}</b></span>`).join('');
  }

  // ---------- pointer and keys on the tree ----------
  function nodeAt(w) {
    const pos = cells();
    for (const t of list().slice().reverse()) { const p = pos.get(t.id), s = size(t); if (p && Math.abs(w.x - p.x * CW) <= s + 2 && Math.abs(w.y - p.y * CH) <= s + 2) return t; }
    return null;
  }
  function select(ids, add) {
    ED.link = null;
    if (add) { for (const id of ids) { const i = ED.sel.indexOf(id); if (i >= 0) ED.sel.splice(i, 1); else ED.sel.push(id); } }
    else ED.sel = ids.slice();
    if (ED.tab !== 'talent' && ED.tab !== 'ideas' && ED.tab !== 'segments') ED.tab = 'talent';   // the Segments tab stays: select, then add
    renderTabs(); renderTree(); renderSide();
  }
  // Toggles "child requires parent" (kind: requiresAny or requires), moving it between the two lists.
  function toggleLink(childId, parentId, kind = 'requiresAny') {
    const c = find(childId);
    if (!c || childId === parentId) return;
    change('link', () => {
      const has = reqs(c, kind).some((r) => r.id === parentId);
      for (const k of ['requiresAny', 'requires']) setReqs(c, k, reqs(c, k).filter((r) => r.id !== parentId));
      if (!has) setReqs(c, kind, reqs(c, kind).concat([{ id: parentId, rank: 1 }]));
    }, { form: true });
  }
  function initPointer() {
    const S = svg();
    S.addEventListener('pointerdown', (ev) => {
      if (ev.button === 2) return;
      const w = toWorld(ev), tg = ev.target, nodeEl = tg.closest && tg.closest('.node'), linkEl = tg.closest && tg.closest('[data-link]'), handle = tg.closest && tg.closest('[data-handle]');
      S.setPointerCapture(ev.pointerId);
      hidePop();
      if (ev.button === 1 || ED.space) { ED.drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: V.x, vy: V.y, moved: false }; S.classList.add('panning'); return; }
      if (handle && cur()) { ED.drag = { kind: 'link', from: cur().id, w }; return; }
      if (nodeEl) {
        const id = nodeEl.dataset.id, c0 = cur();
        if ((ev.ctrlKey || ev.metaKey) && c0 && c0.id !== id) { toggleLink(id, c0.id, ev.shiftKey ? 'requires' : 'requiresAny'); ED.drag = null; return; }
        if (ev.shiftKey) select([id], true);
        else if (!ED.sel.includes(id)) select([id]);
        else if (ED.sel[ED.sel.length - 1] !== id) { ED.sel = ED.sel.filter((x) => x !== id).concat(id); renderSide(); }
        ED.drag = { kind: 'move', ids: ED.sel.slice(), a: w, dx: 0, dy: 0, moved: false, click: id };
        return;
      }
      if (linkEl) {
        const [child, parent, kind] = linkEl.dataset.link.split('|');
        ED.link = { key: linkEl.dataset.link, child, parent, kind }; ED.sel = []; ED.tab = 'talent';
        renderTabs(); renderTree(); renderSide(); ED.drag = null; return;
      }
      ED.drag = ev.shiftKey ? { kind: 'box', a: w, w, add: true } : { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: V.x, vy: V.y, moved: false, clear: true };
      if (ED.drag.kind === 'pan') S.classList.add('panning');
    });
    S.addEventListener('pointermove', (ev) => {
      const D = ED.drag, w = toWorld(ev);
      const t = nodeAt(w);
      $('hint').innerHTML = hintText(Math.round(w.x / CW), Math.round(w.y / CH), t);
      if (!D) return;
      if (D.kind === 'pan') {
        const dx = ev.clientX - D.sx, dy = ev.clientY - D.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) D.moved = true;
        V.x = D.vx + dx; V.y = D.vy + dy; renderTree();
      } else if (D.kind === 'move') {
        const dx = Math.round((w.x - D.a.x) / CW), dy = Math.round((w.y - D.a.y) / CH);
        if (Math.abs(w.x - D.a.x) + Math.abs(w.y - D.a.y) > 6) D.moved = true;
        if (dx !== D.dx || dy !== D.dy) { D.dx = dx; D.dy = dy; renderTree(); }
      } else { D.w = w; renderTree(); }
    });
    const up = (ev) => {
      const D = ED.drag;
      ED.drag = null; S.classList.remove('panning');
      if (!D) return;
      const w = toWorld(ev);
      if (D.kind === 'pan') { if (D.clear && !D.moved && (ED.sel.length || ED.link)) { ED.sel = []; ED.link = null; renderSide(); } renderTree(); return; }
      if (D.kind === 'box') {
        const x0 = Math.min(D.a.x, D.w.x), x1 = Math.max(D.a.x, D.w.x), y0 = Math.min(D.a.y, D.w.y), y1 = Math.max(D.a.y, D.w.y), pos = cells();
        const ids = list().filter((t) => { const p = pos.get(t.id); return p && p.x * CW >= x0 && p.x * CW <= x1 && p.y * CH >= y0 && p.y * CH <= y1; }).map((t) => t.id);
        select(ED.sel.concat(ids.filter((id) => !ED.sel.includes(id))));
        return;
      }
      if (D.kind === 'link') {
        const t = nodeAt(w);
        if (t && t.id !== D.from) toggleLink(t.id, D.from, ev.shiftKey ? 'requires' : 'requiresAny');
        else if (!t && ED.mode === 'tree') newTalent({ x: Math.round(w.x / CW), y: Math.round(w.y / CH), parent: D.from });
        else renderTree();
        return;
      }
      if (D.kind === 'move') {
        if (!D.moved || (!D.dx && !D.dy)) { if (!D.moved && !ev.shiftKey && ED.sel.length > 1 && ED.sel.includes(D.click)) select([D.click]); else renderTree(); return; }
        if (ED.mode === 'alien') { dropAlien(D, w); return; }
        moveNodes(D.ids, D.dx, D.dy);
      }
    };
    S.addEventListener('pointerup', up);
    S.addEventListener('pointercancel', () => { ED.drag = null; renderTree(); });
    S.addEventListener('dblclick', (ev) => {
      const w = toWorld(ev), t = nodeAt(w);
      if (t) { ED.tab = 'talent'; select([t.id]); const n = $('f-name'); if (n) { n.focus(); n.select(); } return; }
      if (ED.mode === 'tree') newTalent({ x: Math.round(w.x / CW), y: Math.round(w.y / CH), parent: cur() ? cur().id : null });
      else newTalent({});
    });
    S.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = S.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, z0 = V.z;
      V.z = Math.max(0.2, Math.min(3, V.z * Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0015))));
      V.x = mx - (mx - V.x) * (V.z / z0); V.y = my - (my - V.y) * (V.z / z0);
      renderTree();
    }, { passive: false });
    S.addEventListener('contextmenu', (ev) => ev.preventDefault());
    S.addEventListener('pointerleave', () => { $('hint').innerHTML = hintText(); });
    $('hint').innerHTML = hintText();
  }
  function hintText(x, y, t) {
    const where = x != null && ED.mode === 'tree' ? `<b>cell ${x}, ${y}</b>${t ? ` · ${esc(t.name || t.id)}` : ''}${segOf(t) ? ` · <b style="color:${esc(segOf(t).color)}">${esc(segOf(t).name || segOf(t).id)}</b>` : ''} · ` : '';
    return where + (ED.mode === 'tree'
      ? 'Drag a talent to move it (onto another to swap) · drag its <b>●</b> handle onto a talent to link it, or onto an empty spot for a new one · <b>Ctrl+click</b> a talent to link it under the selected one (<b>+Shift</b>: required) · double-click empty: new talent · drag empty: pan · <b>Shift+drag</b>: select an area · wheel: zoom · <b>Del</b> deletes · arrows nudge · <b>Ctrl+D</b> duplicates'
      : 'Miracles have no tree: drag one to another column to change its group, or up and down to reorder · Ctrl+click links (requires)');
  }
  // Moves talents by whole cells. One talent dropped on another swaps places with it; a group that would
  // land on others goes back.
  function moveNodes(ids, dx, dy) {
    const moving = ids.map(find).filter(Boolean), set = new Set(ids);
    const occ = new Map(list().filter((t) => !set.has(t.id)).map((t) => [Math.round(t.x || 0) + ',' + Math.round(t.y || 0), t]));
    const hits = moving.map((t) => occ.get(Math.round((t.x || 0) + dx) + ',' + Math.round((t.y || 0) + dy))).filter(Boolean);
    if (hits.length && moving.length > 1) { toast('Some of those spots are taken'); renderTree(); return; }
    change('move', () => {
      if (hits.length) { const o = hits[0], t = moving[0]; setKey(o, 'x', Math.round(t.x || 0)); setKey(o, 'y', Math.round(t.y || 0)); }
      for (const t of moving) { setKey(t, 'x', Math.round((t.x || 0) + dx)); setKey(t, 'y', Math.round((t.y || 0) + dy)); }
    }, { form: true });
  }
  function dropAlien(D, w) {
    const cols = alienCols(), ci = Math.max(0, Math.min(cols.length - 1, Math.round(w.x / CW / 3))), col = cols[ci];
    const t = find(D.click), row = Math.max(0, Math.round(w.y / CH) - 1);
    if (!t) return;
    change('alien-move', () => {
      if (col.g.id) setKey(t, 'group', col.g.id); else delete t.group;
      const L = list(), others = col.items.filter((x) => x !== t), before = others[row];
      L.splice(L.indexOf(t), 1);
      L.splice(before ? L.indexOf(before) : (others.length ? L.indexOf(others[others.length - 1]) + 1 : L.length), 0, t);
    }, { form: true });
  }
  function initKeys() {
    addEventListener('keydown', (ev) => {
      const typing = ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
      const k = ev.key, ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl && k.toLowerCase() === 's') { ev.preventDefault(); save(); return; }
      if (ctrl && !typing && k.toLowerCase() === 'z') { ev.preventDefault(); undo(ev.shiftKey); return; }
      if (ctrl && !typing && k.toLowerCase() === 'y') { ev.preventDefault(); undo(true); return; }
      if (typing) return;
      if (k === ' ') { ED.space = true; ev.preventDefault(); return; }
      if (k === 'Escape') { hidePop(); if (ED.sel.length || ED.link) { ED.sel = []; ED.link = null; renderTree(); renderSide(); } return; }
      if ((k === 'Delete' || k === 'Backspace') && ED.link) { ev.preventDefault(); const L = ED.link; ED.link = null; toggleLink(L.child, L.parent, L.kind); return; }
      if ((k === 'Delete' || k === 'Backspace') && ED.sel.length) { ev.preventDefault(); deleteTalents(ED.sel.slice()); return; }
      if (ctrl && k.toLowerCase() === 'd' && ED.sel.length) { ev.preventDefault(); duplicate(ED.sel.slice()); return; }
      if (ctrl && k.toLowerCase() === 'a') { ev.preventDefault(); select(list().map((t) => t.id)); return; }
      if (k === 'f' || k === 'F') { fit(); renderTree(); return; }
      if (k === 'n' || k === 'N') { newTalent({ parent: cur() ? cur().id : null }); return; }
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[k] && ED.sel.length && ED.mode === 'tree') { ev.preventDefault(); moveNodes(ED.sel, ...arrows[k]); }
    });
    addEventListener('keyup', (ev) => { if (ev.key === ' ') ED.space = false; });
    addEventListener('beforeunload', (ev) => { if (ED.dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  }

  // ---------- talents: new, duplicate, delete, rename ----------
  function freeCell(x, y) {
    const occ = new Set(list().map((t) => Math.round(t.x || 0) + ',' + Math.round(t.y || 0)));
    if (!occ.has(x + ',' + y)) return [x, y];
    for (let r = 1; r < 30; r++) for (const [dx, dy] of [[0, r], [r, 0], [-r, 0], [r, r], [-r, r], [0, -r], [r, -r], [-r, -r]]) if (!occ.has(x + dx + ',' + (y + dy))) return [x + dx, y + dy];
    return [x, y + 31];
  }
  // o: { x, y, parent, base (a talent's fields to start from) }
  function newTalent(o = {}) {
    if (ED.mode === 'alien' && !ED.doc.alien) ED.doc.alien = { groups: [], talents: [] };
    const parent = o.parent ? find(o.parent) : null, base = o.base ? clone(o.base) : {};
    const name = base.name || 'New Talent', id = uniqueId(slug(base.id || name));
    let t = { id };
    if (ED.mode === 'tree') {
      const want = o.x != null ? [o.x, o.y] : parent ? [Math.round(parent.x || 0), Math.round(parent.y || 0) + 1] : [0, 0];
      const [x, y] = freeCell(want[0], want[1]);
      t.x = x; t.y = y;
    }
    t.group = base.group || (parent && parent.group) || ((groups().find((g) => g.id !== 'core') || groups()[0] || {}).id);
    if (!t.group) delete t.group;
    const sg = base.segment || (parent && parent.segment);   // grown from a segment's talent: joins the segment
    if (sg && ED.mode === 'tree' && segs().some((s) => s.id === sg)) t.segment = sg;
    delete base.id; delete base.x; delete base.y; delete base.group; delete base.segment;
    for (const [k, v] of Object.entries(Object.assign({ name, icon: base.icon || 'star' }, base))) if (v !== undefined) setKey(t, k, v);
    if (parent && ED.mode === 'tree') setKey(t, 'requiresAny', [parent.id]);
    tidy(t);
    change('new', () => list().push(t), { form: true });
    ED.autoId.add(t.id);
    ED.tab = 'talent';
    select([t.id]);
    return t;
  }
  function duplicate(ids) {
    const made = [];
    change('dup', () => {
      for (const id of ids) {
        const t = find(id);
        if (!t) continue;
        const c = clone(t);
        c.id = uniqueId(t.id + '_copy'); c.name = (t.name || t.id) + ' (copy)'; delete c.start;
        if (ED.mode === 'tree') { const [x, y] = freeCell(Math.round(t.x || 0) + 1, Math.round(t.y || 0)); c.x = x; c.y = y; }
        list().push(c); made.push(c.id);
      }
    });
    select(made);
  }
  function deleteTalents(ids) {
    const set = new Set(ids);
    change('del', () => {
      const L = list();
      for (let i = L.length - 1; i >= 0; i--) if (set.has(L[i].id)) L.splice(i, 1);
      for (const t of L) for (const k of ['requiresAny', 'requires']) if (t[k]) setReqs(t, k, reqs(t, k).filter((r) => !set.has(r.id)));
      ED.sel = []; ED.link = null;
    }, { form: true });
    toast(`Deleted ${ids.length} talent${ids.length === 1 ? '' : 's'} (Ctrl+Z brings ${ids.length === 1 ? 'it' : 'them'} back)`);
  }
  function rename(t, id) {
    id = slug(id);
    if (!id || id === t.id) return;
    if (find(id)) { toast(`"${id}" is taken`); renderSide(); return; }
    const old = t.id;
    change('rename', () => {
      t.id = id;
      for (const o of list()) for (const k of ['requiresAny', 'requires']) if (o[k]) setReqs(o, k, reqs(o, k).map((r) => (r.id === old ? { id, rank: r.rank } : r)));
      ED.sel = ED.sel.map((x) => (x === old ? id : x));
      if (ED.autoId.has(old)) { ED.autoId.delete(old); ED.autoId.add(id); }
    }, { form: true });
  }

  // ---------- side panel ----------
  const TABS = [['talent', 'Talent'], ['ideas', 'Ideas'], ['groups', 'Groups'], ['segments', 'Segments'], ['problems', 'Problems']];
  function renderTabs() {
    const n = ED.probs.filter((p) => p.lvl === 'err').length, w = ED.probs.length - n;
    $('tabs').innerHTML = '';
    for (const [k, label] of TABS) {
      const txt = k === 'problems' ? `${label}${ED.probs.length ? ` (${n ? n + '!' : ''}${n && w ? ' ' : ''}${w ? w : ''})` : ' ✓'}` : label;
      $('tabs').append(el('button', { class: ED.tab === k ? 'on' : '', text: txt, onclick: () => { ED.tab = k; renderTabs(); renderSide(); } }));
    }
    $('h-tree').classList.toggle('on', ED.mode === 'tree'); $('h-alien').classList.toggle('on', ED.mode === 'alien');
  }
  function renderSide() {
    const side = $('side'), top = side.scrollTop, keep = ED.lastSide === (ED.tab + (cur() ? cur().id : '') + (ED.link ? ED.link.key : ''));
    side.innerHTML = '';
    if (ED.tab === 'ideas') side.append(ideasTab());
    else if (ED.tab === 'groups') side.append(groupsTab());
    else if (ED.tab === 'segments') side.append(segmentsTab());
    else if (ED.tab === 'problems') side.append(problemsTab());
    else if (ED.link) side.append(linkForm());
    else if (ED.sel.length > 1) side.append(multiForm());
    else if (cur()) side.append(talentForm(cur()));
    else side.append(emptyForm());
    ED.lastSide = ED.tab + (cur() ? cur().id : '') + (ED.link ? ED.link.key : '');
    if (keep) side.scrollTop = top;
    updateLive();
  }
  const sec = (title, extra) => el('div', { class: 'sec' }, [el('span', { text: title }), el('span', { class: 'sp' }), extra || null]);
  function emptyForm() {
    return el('div', {}, [
      el('p', { class: 'empty', html: 'Select a talent in the tree, or make one: double-click an empty spot, drag a talent\'s <b>●</b> handle to an empty spot, or press <span class="kbd">N</span>.' }),
      el('div', { class: 'row' }, [el('button', { text: '+ New talent', onclick: () => newTalent({}) }), el('button', { text: 'Ideas & templates', onclick: () => { ED.tab = 'ideas'; renderTabs(); renderSide(); } })]),
      el('p', { class: 'note', html: 'Talents can do things without any code: <b>rules</b> (when something happens, if conditions hold, do actions), <b>conditional stats</b> and <b>hit bonuses</b>. The game reads them from the JSON (js/rules.js). Use <b>Play-test</b> to try them: it saves and opens the game with them learned once you start a run.' }),
    ]);
  }
  function linkForm() {
    const L = ED.link, c = find(L.child), p = find(L.parent);
    if (!c || !p) { ED.link = null; return emptyForm(); }
    const q = reqs(c, L.kind).find((r) => r.id === L.parent) || { id: L.parent, rank: 1 };
    const setRank = (v) => change('link-rank', () => setReqs(c, L.kind, reqs(c, L.kind).map((r) => (r.id === L.parent ? { id: r.id, rank: Math.max(1, Math.round(v) || 1) } : r))));
    return el('div', {}, [
      sec('Link'),
      el('p', { html: `<b>${esc(c.name || c.id)}</b> needs <b>${esc(p.name || p.id)}</b>` }),
      el('div', { class: 'grid2' }, [
        el('label', { class: 'f' }, ['Kind', el('select', { onchange: (e) => { const k = e.target.value; ED.link = null; change('link-kind', () => { setReqs(c, L.kind, reqs(c, L.kind).filter((r) => r.id !== L.parent)); setReqs(c, k, reqs(c, k).concat([q])); }, { form: true }); } },
          [el('option', { value: 'requiresAny', text: 'One of (requiresAny)', selected: L.kind === 'requiresAny' }), el('option', { value: 'requires', text: 'Required (requires: all)', selected: L.kind === 'requires' })])]),
        el('label', { class: 'f' }, [`Rank of ${p.name || p.id} needed`, el('input', { type: 'number', min: 1, step: 1, value: q.rank, oninput: (e) => setRank(+e.target.value) })]),
      ]),
      el('p', { class: 'note', text: 'One of: learning any one of the talents linked this way unlocks it. Required: every one of them must be learned. Press Delete to remove the link.' }),
      el('div', { class: 'row' }, [el('button', { class: 'danger', text: 'Delete link', onclick: () => { ED.link = null; toggleLink(L.child, L.parent, L.kind); } }),
        el('button', { text: `Select ${c.name || c.id}`, onclick: () => select([c.id]) }), el('button', { text: `Select ${p.name || p.id}`, onclick: () => select([p.id]) })]),
    ]);
  }
  function multiForm() {
    const ts = ED.sel.map(find).filter(Boolean);
    const setAll = (k, v) => change('multi-' + k, () => { for (const t of ts) { if (v === '' || v == null) delete t[k]; else setKey(t, k, v); } });
    return el('div', {}, [
      sec(`${ts.length} talents selected`),
      el('div', { class: 'chips' }, ts.map((t) => el('span', { class: 'chip' }, [el('img', { class: 'ic', src: icon(t.icon) }), t.name || t.id, el('button', { text: '×', title: 'Unselect', onclick: () => select([t.id], true) })]))),
      el('div', { class: 'grid2', style: 'margin-top:10px' }, [
        el('label', { class: 'f' }, ['Group (all)', groupSelect('', (v) => setAll('group', v))]),
        el('label', { class: 'f' }, ['Currency (all)', el('select', { onchange: (e) => setAll('currency', e.target.value === 'totem' ? '' : e.target.value) }, [el('option', { text: '—' }), ...Object.keys(G.CURRENCIES).map((k) => el('option', { value: k, text: G.CURRENCIES[k].name }))])]),
        ED.mode === 'tree' ? el('label', { class: 'f' }, ['Segment (all)', segSelect(null, (v) => (v === '+' ? addSegment(ED.sel.slice()) : setAll('segment', v)))]) : null,
        ED.mode === 'tree' ? el('button', { style: 'align-self:end', text: '+ New segment from these', onclick: () => addSegment(ED.sel.slice()) }) : null,
      ]),
      el('div', { class: 'row', style: 'margin-top:10px' }, [
        el('button', { text: 'Duplicate (Ctrl+D)', onclick: () => duplicate(ED.sel.slice()) }),
        el('button', { text: 'Send to… ▸', title: 'Move or copy them into another character\'s tree', onclick: (e) => sendTo(e.currentTarget, ED.sel.slice()) }),
        el('button', { class: 'danger', text: 'Delete all (Del)', onclick: () => deleteTalents(ED.sel.slice()) }),
        el('button', { text: 'Link in a chain', title: 'Each one requires the one selected before it', onclick: () => change('chain', () => { for (let i = 1; i < ts.length; i++) if (!reqs(ts[i], 'requiresAny').concat(reqs(ts[i], 'requires')).some((r) => r.id === ts[i - 1].id)) setReqs(ts[i], 'requiresAny', reqs(ts[i], 'requiresAny').concat([{ id: ts[i - 1].id, rank: 1 }])); }) }),
      ]),
      el('p', { class: 'note', text: 'Drag any of them to move them all · arrow keys nudge them · Shift+click adds or removes one.' }),
    ]);
  }
  function groupSelect(v, onchange) {
    return el('select', { onchange: (e) => onchange(e.target.value) }, [el('option', { value: '', text: '(none)', selected: !v }), ...groups().map((g) => el('option', { value: g.id, text: g.name || g.id, selected: g.id === v }))]);
  }
  // v null: several talents (starts on "—"). "+" is the value of "New segment…".
  function segSelect(v, onchange) {
    return el('select', { onchange: (e) => onchange(e.target.value) }, [
      v == null ? el('option', { value: '-', text: '—', selected: true, disabled: true }) : null,
      el('option', { value: '', text: '(none)', selected: v === '' }),
      ...segs().map((s) => el('option', { value: s.id, text: s.name || s.id, selected: s.id === v })),
      el('option', { value: '+', text: '+ New segment…' }),
    ]);
  }
  // A new segment holding these talents, then the Segments tab with its name ready to type.
  const SEG_COLORS = ['#ff4f8b', '#3fe0c5', '#ffab3d', '#6f9bff', '#b8ff3d', '#ff6ff2', '#4fd2ff', '#ffe14f', '#ff6a3d', '#9a7bff'];
  function addSegment(ids) {
    let s;
    change('s-add', () => {
      const arr = segsIn(ED.doc), taken = new Set(arr.map((x) => x.id));
      let n = arr.length + 1;
      while (taken.has('segment' + n)) n++;
      s = { id: 'segment' + n, name: 'New Segment', color: SEG_COLORS[arr.length % SEG_COLORS.length] };
      arr.push(s);
      for (const t of ids.map(find).filter(Boolean)) setKey(t, 'segment', s.id);
    }, { form: true });
    ED.tab = 'segments'; renderTabs(); renderSide();
    const inp = document.querySelector(`[data-seg-name="${s.id}"]`);
    if (inp) { inp.focus(); inp.select(); }
  }

  // ----- one talent -----
  function talentForm(t) {
    const root = el('div');
    const set = (k, v, form) => change('f-' + k, () => { if (v === '' || v == null || v === false) delete t[k]; else setKey(t, k, v); }, { form });
    const head = el('div', { class: 'head' }, [
      el('img', { class: 'big-ic', src: icon(t.icon), title: 'Change the icon', onclick: (e) => iconPicker(e.target, t.icon, (k) => set('icon', k, true)) }),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('input', { id: 'f-name', class: 'nm', style: 'width:100%;font-size:16px;font-weight:600', value: t.name || '', placeholder: 'Name', oninput: (e) => {
          const v = e.target.value;
          change('f-name', () => { setKey(t, 'name', v); if (ED.autoId.has(t.id)) { const nid = uniqueId(slug(v), t.id); if (nid !== t.id) { const old = t.id; t.id = nid; for (const o of list()) for (const kk of ['requiresAny', 'requires']) if (o[kk]) setReqs(o, kk, reqs(o, kk).map((r) => (r.id === old ? { id: nid, rank: r.rank } : r))); ED.sel = ED.sel.map((x) => (x === old ? nid : x)); ED.autoId.delete(old); ED.autoId.add(nid); const f = $('f-id'); if (f) f.value = nid; } } });
        } }),
        el('div', { class: 'id' }, ['id ', el('input', { id: 'f-id', value: t.id, style: 'width:60%;font-size:12px;padding:1px 4px', title: 'Unique id (renaming updates every link to it)', onchange: (e) => { ED.autoId.delete(t.id); rename(t, e.target.value); } })]),
      ]),
    ]);
    root.append(head, el('div', { class: 'row', style: 'margin:8px 0' }, [
      el('button', { class: 'small', text: 'Duplicate', onclick: () => duplicate([t.id]) }),
      el('button', { class: 'small danger', text: 'Delete', onclick: () => deleteTalents([t.id]) }),
      el('button', { class: 'small', text: 'Play-test this ▸', onclick: () => playTest([t.id]) }),
      el('button', { class: 'small', text: 'Send to… ▸', title: 'Move or copy it into another character\'s tree', onclick: (e) => sendTo(e.currentTarget, [t.id]) }),
      el('button', { class: 'small', text: 'Center', onclick: () => { centerOn(t.id); renderTree(); } }),
    ]));
    const warns = ED.probs.filter((p) => p.id === t.id && p.mode === ED.mode);
    for (const w of warns) root.append(el('div', { class: 'warn', text: (w.lvl === 'err' ? '✖ ' : '⚠ ') + w.text }));

    // basics
    root.append(sec('Basics'));
    const g = el('div', { class: 'grid3' });
    g.append(
      el('label', { class: 'f' }, ['Group', groupSelect(t.group || '', (v) => set('group', v))]),
      ED.mode === 'tree' ? el('label', { class: 'f', title: 'A named set of talents that glow in its color (the Segments tab)' }, ['Segment', segSelect(t.segment || '', (v) => (v === '+' ? addSegment([t.id]) : set('segment', v, true)))]) : null,
      ED.mode === 'alien' ? el('label', { class: 'f' }, ['Currency', el('input', { value: G.CURRENCIES.spoon.name, disabled: true, title: 'Miracles always cost Miracles (currency id spoon)' })])
        : el('label', { class: 'f' }, ['Currency', el('select', { onchange: (e) => set('currency', e.target.value === 'totem' ? '' : e.target.value) }, Object.keys(G.CURRENCIES).map((k) => el('option', { value: k, text: G.CURRENCIES[k].name, selected: (t.currency || 'totem') === k })))]),
      numField('Cost per rank', t.cost, 1, (v) => set('cost', v === 1 ? '' : v), { min: 1, step: 1 }),
      numField('Max rank', t.maxRank, 1, (v) => set('maxRank', v === 1 ? '' : Math.max(1, Math.round(v))), { min: 1, step: 1 }),
      numField('Points spent first', t.minSpent, 0, (v) => set('minSpent', v || ''), { min: 0, step: 1, title: 'minSpent: points that must already be spent in the tree' }),
    );
    if (ED.mode === 'tree') g.append(numField('x', t.x, 0, (v) => set('x', Math.round(v)), { step: 1 }), numField('y', t.y, 0, (v) => set('y', Math.round(v)), { step: 1 }));
    root.append(g, el('div', { class: 'row', style: 'margin-top:6px' }, [
      ED.mode === 'tree' ? el('label', { class: 'chk', title: 'The free starting node: always learned' }, [el('input', { type: 'checkbox', checked: t.start, onchange: (e) => set('start', e.target.checked, true) }), 'Starting node']) : null,
      el('label', { class: 'chk', title: 'Drawn larger' }, [el('input', { type: 'checkbox', checked: t.big, onchange: (e) => set('big', e.target.checked) }), 'Big talent']),
      el('label', { class: 'chk', title: 'The game skips it' }, [el('input', { type: 'checkbox', checked: t.disabled, onchange: (e) => set('disabled', e.target.checked) }), 'Disabled']),
    ]));

    // links
    root.append(sec('Unlocked by', el('small', { text: 'lines in the tree' })));
    root.append(reqEditor(t, 'requiresAny', 'One of these (requiresAny)'), reqEditor(t, 'requires', 'All of these (requires)'));
    const kids = list().filter((o) => reqs(o, 'requiresAny').concat(reqs(o, 'requires')).some((r) => r.id === t.id));
    if (kids.length) root.append(el('div', { class: 'note' }, ['Unlocks: ', ...kids.map((k, i) => [i ? ', ' : '', el('a', { href: '#', text: k.name || k.id, onclick: (e) => { e.preventDefault(); select([k.id]); } })]).flat()]));

    // stats
    root.append(sec('Stats', el('small', { text: 'per rank' })), statsEditor(t.stats || {}, (fn, form) => change('stats', () => { const s = t.stats || {}; fn(s); if (Object.keys(s).length) setKey(t, 'stats', s); else delete t.stats; }, { form })));

    // rules
    root.append(sec('Rules', el('button', { class: 'small', text: '+ Rule', onclick: () => change('rule-add', () => { const r = t.rules || []; r.push({ when: 'hit', then: [{ do: 'explode' }] }); setKey(t, 'rules', r); }, { form: true }) })));
    root.append(el('p', { class: 'note', text: 'When something happens, if every condition holds, do the actions in order. Numbers can differ per rank (the R button).' }));
    (t.rules || []).forEach((r, i) => root.append(ruleCard(t, r, i)));
    // conditional stats
    root.append(sec('Conditional stats', el('button', { class: 'small', text: '+ Block', onclick: () => change('cs-add', () => { const c = t.conditionalStats || []; c.push({ if: [{ check: 'enemiesNear' }], stats: { atkSpeed: 0.2 } }); setKey(t, 'conditionalStats', c); }, { form: true }) })));
    (t.conditionalStats || []).forEach((c, i) => root.append(condStatsCard(t, c, i)));
    // hit bonus
    root.append(sec('Hit bonus', el('button', { class: 'small', text: '+ Bonus', onclick: () => change('hb-add', () => { const c = t.hitBonus || []; c.push({ if: [{ check: 'targetStatus' }], more: 0.2 }); setKey(t, 'hitBonus', c); }, { form: true }) })));
    (t.hitBonus || []).forEach((c, i) => root.append(hitBonusCard(t, c, i)));
    // built-in effect
    root.append(sec('Built-in effect', el('small', { text: 'a coded effect (G.EFFECTS)' })), effectEditor(t));

    // words
    root.append(sec('Words'));
    root.append(el('label', { class: 'f wide' }, [el('span', { class: 'row' }, ['Text (what it does)', el('span', { class: 'grow' }), el('button', { class: 'small', text: 'Write from rules', title: 'Fill in the text from the rules, conditional stats and hit bonuses', onclick: () => { const n = compileOne(t).node; set('text', RU.describeTalent(n), true); } })]),
      el('textarea', { id: 'f-text', rows: 3, value: t.text || '', placeholder: 'Empty: the game writes it from the rules', oninput: (e) => set('text', e.target.value) })]));
    root.append(el('label', { class: 'f wide' }, ['Downside (red)', el('input', { value: t.downside || '', oninput: (e) => set('downside', e.target.value) })]));
    root.append(el('label', { class: 'f wide' }, ['Flavour (desc)', el('input', { value: t.desc || '', oninput: (e) => set('desc', e.target.value) })]));

    // preview
    root.append(sec('In the game'), el('div', { id: 'f-preview' }));
    // raw JSON
    const ta = el('textarea', { id: 'f-json', rows: 10, spellcheck: 'false', style: 'font:11.5px ui-monospace,monospace', value: prettyJSON(t).trim() });
    root.append(sec('JSON', el('button', { class: 'small', text: 'Apply', onclick: () => {
      let o;
      try { o = JSON.parse(ta.value); } catch (e) { toast('Not valid JSON: ' + e.message); return; }
      if (!o || typeof o !== 'object' || Array.isArray(o) || !o.id) { toast('A talent needs to be an object with an id'); return; }
      const old = t.id;
      change('json', () => {
        for (const k of Object.keys(t)) delete t[k];
        Object.assign(t, o);
        if (o.id !== old) { for (const x of list()) for (const kk of ['requiresAny', 'requires']) if (x[kk]) setReqs(x, kk, reqs(x, kk).map((r) => (r.id === old ? { id: o.id, rank: r.rank } : r))); ED.sel = [o.id]; }
      }, { form: true });
    } })), ta);
    return root;
  }
  function numField(label, v, def, onchange, o = {}) {
    return el('label', { class: 'f', title: o.title }, [label, el('input', { type: 'number', value: v != null ? v : '', placeholder: String(def), min: o.min, step: o.step || 'any',
      oninput: (e) => { const x = e.target.value === '' ? def : +e.target.value; if (isFinite(x)) onchange(x); } })]);
  }
  function reqEditor(t, kind, label) {
    const box = el('div', { style: 'margin:4px 0' });
    const rs = reqs(t, kind);
    const others = list().filter((o) => o.id !== t.id && !rs.some((r) => r.id === o.id));
    box.append(el('div', { class: 'note', text: label }));
    box.append(el('div', { class: 'chips' }, [
      ...rs.map((r) => el('span', { class: 'chip', title: r.id }, [
        el('img', { class: 'ic', src: icon((find(r.id) || {}).icon) }), (find(r.id) || {}).name || r.id + ' (missing)', ' rank',
        el('input', { type: 'number', min: 1, step: 1, value: r.rank, title: 'Rank of it needed', oninput: (e) => change('req-rank', () => setReqs(t, kind, reqs(t, kind).map((x) => (x.id === r.id ? { id: x.id, rank: Math.max(1, Math.round(+e.target.value) || 1) } : x)))) }),
        el('button', { text: '×', title: 'Remove', onclick: () => change('req-del', () => setReqs(t, kind, reqs(t, kind).filter((x) => x.id !== r.id)), { form: true }) }),
      ])),
      el('select', { class: 'small', onchange: (e) => { const id = e.target.value; if (id) change('req-add', () => setReqs(t, kind, reqs(t, kind).concat([{ id, rank: 1 }])), { form: true }); } },
        [el('option', { value: '', text: '+ add…' }), ...others.sort((a, b) => String(a.name || a.id).localeCompare(b.name || b.id)).map((o) => el('option', { value: o.id, text: `${o.name || o.id} (${o.id})` }))]),
    ]));
    return box;
  }
  // Rows of stat → value. edit(fn, form): fn(stats) changes the object (form: draw the panel again).
  // Stats in sections by what they raise (G.STAT_TAGS: Melee holds melee damage, and so on), A to Z in each.
  const STAT_SECTIONS = ['weapon', 'melee', 'firearm', 'magic', 'bleed', 'poison', 'elemental', 'dot', 'defense', 'movement', 'control', 'trinket', 'utility'];
  function statOptions(keys, label, selected) {
    const by = {};
    for (const k of keys) { const g = ((G.STAT_TAGS && G.STAT_TAGS[k]) || []).find((x) => STAT_SECTIONS.includes(x)) || 'other'; (by[g] = by[g] || []).push(k); }
    return STAT_SECTIONS.concat('other').filter((g) => by[g]).map((g) => el('optgroup', { label: g === 'other' ? 'Other' : (G.TAGS[g] && G.TAGS[g].name) || g },
      by[g].sort((a, b) => G.STATS[a].label.localeCompare(G.STATS[b].label)).map((k) => el('option', { value: k, text: label(k), selected: k === selected }))));
  }
  function statsEditor(stats, edit) {
    const box = el('div');
    const keys = Object.keys(G.STATS);
    for (const k of Object.keys(stats)) {
      const v = stats[k], a = G.STATS[k];
      const row = el('div', { class: 'stat-row' }, [
        el('select', { onchange: (e) => { const nk = e.target.value; edit((s) => { const o = Object.entries(s).map(([kk, vv]) => (kk === k ? [nk, vv] : [kk, vv])); for (const kk of Object.keys(s)) delete s[kk]; for (const [kk, vv] of o) s[kk] = vv; }, true); } },
          statOptions(keys, (s) => `${G.STATS[s].label} (${s})`, k).concat(G.STATS[k] ? [] : [el('option', { value: k, text: k + ' (unknown)', selected: true })])),
        el('div', { class: 'unit' }, [el('input', { type: 'number', step: 'any', value: a && a.pct ? round(v * 100) : v, oninput: (e) => {
          const x = +e.target.value;
          if (e.target.value === '' || !isFinite(x)) return;
          const nv = a && a.pct ? round(x / 100) : x;
          edit((s) => { s[k] = nv; }, false);
          if (a) row.querySelector('.fmt').textContent = G.fmtMod(k, nv);
        } }), a && a.pct ? el('span', { text: '%' }) : null]),
        el('button', { class: 'icon danger', text: '×', onclick: () => edit((s) => { delete s[k]; }, true) }),
        el('div', { class: 'fmt', text: G.STATS[k] && typeof v === 'number' ? G.fmtMod(k, v) : '' }),
      ]);
      box.append(row);
    }
    box.append(el('select', { class: 'add', onchange: (e) => { const k = e.target.value; if (k) edit((s) => { s[k] = G.STATS[k].pct ? 0.1 : 1; }, true); } },
      [el('option', { value: '', text: '+ add a stat…' }), ...statOptions(keys.filter((k) => !(k in stats) && !G.STATS[k].local), (k) => `${G.STATS[k].label} · ${G.STATS[k].name}`)]));
    return box;
  }
  function effectEditor(t) {
    const box = el('div'), E = t.effect ? (typeof t.effect === 'string' ? { id: t.effect } : t.effect) : null, id = E && E.id;
    const users = (eid) => ED.doc.talents.concat((ED.doc.alien && ED.doc.alien.talents) || []).filter((o) => o !== t && o.effect && (o.effect.id || o.effect) === eid).map((o) => o.name || o.id);
    box.append(el('select', { onchange: (e) => { const v = e.target.value; change('fx', () => { if (v) setKey(t, 'effect', { id: v }); else delete t.effect; }, { form: true }); } },
      [el('option', { value: '', text: '— none —' }), ...Object.keys(G.EFFECTS).map((k) => { const u = users(k); return el('option', { value: k, text: k + (u.length ? ` (${u.join(', ')})` : ''), selected: k === id }); })]));
    if (!E) { box.append(el('p', { class: 'note', text: 'Effects are coded rules from the original tree (Raging Bull, Storm Caller...). Rules above can do much more, but these are here too.' })); return box; }
    if (!G.EFFECTS[id]) { box.append(el('div', { class: 'warn', text: `Unknown effect "${id}"` })); return box; }
    const D = G.EFFECTS[id], tags = G.EFFECT_TAGS[id] || [];
    const u = users(id);
    box.append(el('p', { class: 'note', text: `${tags.length ? 'About: ' + tags.join(', ') + '. ' : ''}${u.length ? 'Also on: ' + u.join(', ') + '. ' : ''}Empty fields keep the default.` }));
    const grid = el('div', { class: 'pgrid' });
    for (const k of Object.keys(D)) {
      const d = D[k], has = k in E, v = has ? E[k] : d;
      const setv = (x) => change('fx-' + k, () => { const o = typeof t.effect === 'string' ? { id: t.effect } : t.effect; if (x === undefined || same(x, d)) delete o[k]; else o[k] = x; setKey(t, 'effect', o); });
      let input;
      if (k === 'buff') input = el('select', { onchange: (e) => setv(e.target.value) }, Object.keys(G.BUFFS).filter((b) => !G.BUFFS[b].inline).map((b) => el('option', { value: b, text: G.BUFFS[b].name, selected: b === v })));
      else if (k === 'trinket') input = el('select', { onchange: (e) => setv(e.target.value) }, Object.keys(G.TRINKETS).map((b) => el('option', { value: b, text: G.TRINKETS[b].name, selected: b === v })));
      else if (Array.isArray(d)) input = el('input', { value: (v || []).join(', '), oninput: (e) => setv(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)) });
      else input = el('input', { type: 'number', step: 'any', value: has ? v : '', placeholder: String(d), oninput: (e) => setv(e.target.value === '' ? undefined : +e.target.value) });
      grid.append(el('label', { class: 'pf' + (has ? '' : ' def') }, [el('span', { class: 'lab', text: k }), input]));
    }
    box.append(grid);
    return box;
  }

  // ----- rules -----
  const TRIG_GROUPS = [['Combat', ['hit', 'crit', 'kill', 'attack', 'bleed', 'poison', 'status']], ['Defense', ['damaged', 'block', 'lowHealth', 'heal']], ['Moving and items', ['dash', 'trinket', 'still', 'distance']], ['Time', ['interval', 'dayStart', 'dawn', 'levelUp', 'bossAppears']]];
  const ACT_GROUPS = [['Damage', ['explode', 'strike', 'lightning', 'projectiles', 'zone']], ['Afflict monsters', ['status', 'poison', 'bleed', 'holyFire', 'spread', 'knockback', 'execute']],
    ['You', ['heal', 'shield', 'buff', 'invulnerable', 'cleanse', 'dashCharge', 'dash', 'extraAttack', 'empower']], ['Trinket and cooldowns', ['trinketCooldown', 'trinketEffect', 'resetCooldowns']],
    ['Loot', ['drop', 'gain', 'magnet']], ['Show', ['text', 'sound', 'flash', 'shake', 'ring']]];
  const condGroup = (k) => (RU.CONDITIONS[k].target || k === 'wasCrit' ? 'The monster (or the hit)' : ['map', 'dayTime', 'inDungeon', 'darkness', 'bossAlive', 'chance'].includes(k) ? 'The world' : 'You');
  function groupedSelect(table, groupsList, v, onchange, filter) {
    const s = el('select', { onchange: (e) => onchange(e.target.value) });
    const seen = new Set();
    for (const [label, ids] of groupsList) {
      const og = el('optgroup', { label });
      for (const id of ids) { if (!table[id] || (filter && !filter(id))) continue; seen.add(id); og.append(el('option', { value: id, text: table[id].name, selected: id === v })); }
      if (og.children.length) s.append(og);
    }
    const rest = Object.keys(table).filter((id) => !seen.has(id) && (!filter || filter(id)));
    if (rest.length) s.append(el('optgroup', { label: 'More' }, rest.map((id) => el('option', { value: id, text: table[id].name, selected: id === v }))));
    if (v && !table[v]) s.append(el('option', { value: v, text: v + ' (unknown)', selected: true }));
    return s;
  }
  const condGroups = () => { const g = {}; for (const k of Object.keys(RU.CONDITIONS)) (g[condGroup(k)] = g[condGroup(k)] || []).push(k); return Object.entries(g); };
  // Compiles a talent the way the game will (warnings collected), for words and checks.
  function compileOne(t) {
    const warns = [], node = { id: t.id, name: t.name, maxRank: t.maxRank || 1, stats: t.stats || {}, text: '' };
    RU.compile(clone(t), node, '', (m) => warns.push(m));
    return { node, warns };
  }
  function moveIn(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }
  function partButtons(arr, i, key, after) {
    return [
      el('button', { class: 'icon small', text: '▲', title: 'Move up', onclick: () => change(key + '-mv', () => { moveIn(arr, i, -1); if (after) after(); }, { form: true }) }),
      el('button', { class: 'icon small', text: '▼', title: 'Move down', onclick: () => change(key + '-mv', () => { moveIn(arr, i, 1); if (after) after(); }, { form: true }) }),
      el('button', { class: 'icon small danger', text: '×', title: 'Remove', onclick: () => change(key + '-del', () => { arr.splice(i, 1); if (after) after(); }, { form: true }) }),
    ];
  }
  function ruleCard(t, r, i) {
    const card = el('div', { class: 'card' + (r.disabled ? ' off' : '') });
    const tidy = () => { if (!t.rules.length) delete t.rules; };
    card.append(el('div', { class: 'card-h' }, [
      el('span', { class: 'ttl', text: `Rule ${i + 1}` }),
      el('input', { class: 'grow', style: 'flex:1;min-width:0', placeholder: 'note (optional)', value: r.name || '', oninput: (e) => change('r-name', () => { if (e.target.value) r.name = e.target.value; else delete r.name; }) }),
      el('label', { class: 'chk', title: 'Switch the rule off without deleting it' }, [el('input', { type: 'checkbox', checked: !r.disabled, onchange: (e) => change('r-off', () => { if (e.target.checked) delete r.disabled; else r.disabled = true; }, { form: true }) }), 'on']),
      el('button', { class: 'icon small', text: '⧉', title: 'Duplicate', onclick: () => change('r-dup', () => t.rules.splice(i + 1, 0, clone(r)), { form: true }) }),
      ...partButtons(t.rules, i, 'rule', tidy),
    ]));
    // when
    const T = RU.TRIGGERS[r.when];
    const when = el('div', { class: 'part t' }, [el('div', { class: 'part-h' }, [el('b', { text: 'WHEN' }), groupedSelect(RU.TRIGGERS, TRIG_GROUPS, r.when, (v) => change('r-when', () => { const keep = {}; for (const q of RU.RULE_PARAMS) if (q.k in r) keep[q.k] = r[q.k]; for (const k of Object.keys(r)) if (!['name', 'disabled', 'if', 'then', 'when'].includes(k) && !(k in keep)) delete r[k]; r.when = v; }, { form: true }))])]);
    if (T && T.desc) when.append(el('div', { class: 'note', text: T.desc }));
    const pg = el('div', { class: 'pgrid' });
    for (const q of (T && T.params) || []) pg.append(paramField(q, r, t));
    for (const q of RU.RULE_PARAMS) pg.append(paramField(q, r, t));
    when.append(pg);
    card.append(when);
    // if
    const ifs = r.if || [];
    const ifBox = el('div', { class: 'part c' }, [el('div', { class: 'part-h' }, [el('b', { text: 'IF' }), el('span', { class: 'note', style: 'flex:1', text: ifs.length ? 'every one of these holds' : 'always' }),
      el('button', { class: 'small', text: '+ condition', onclick: () => change('c-add', () => { (r.if = r.if || []).push({ check: T && T.target ? 'targetStatus' : 'myHealth' }); }, { form: true }) })])]);
    ifs.forEach((c, j) => ifBox.append(condRow(t, r, c, j, T && T.target)));
    card.append(ifBox);
    // then
    const acts = r.then || [];
    const thenBox = el('div', { class: 'part a' }, [el('div', { class: 'part-h' }, [el('b', { text: 'THEN' }), el('span', { class: 'note', style: 'flex:1', text: acts.length ? 'in this order' : 'nothing yet' }),
      el('button', { class: 'small', text: '+ action', onclick: () => change('a-add', () => { (r.then = r.then || []).push({ do: 'explode' }); }, { form: true }) })])]);
    acts.forEach((a, j) => thenBox.append(actionRow(t, r, a, j, T && T.target)));
    card.append(thenBox);
    card.append(el('div', { class: 'say', 'data-say': i }));
    return card;
  }
  function condRow(t, owner, c, j, hasTarget, noTarget) {
    const S = RU.CONDITIONS[c.check], box = el('div', { style: 'margin:4px 0 8px' });
    const tidy = () => { if (!owner.if.length) delete owner.if; };
    box.append(el('div', { class: 'part-h' }, [
      el('label', { class: 'chk', title: 'Flip it: the condition must NOT hold' }, [el('input', { type: 'checkbox', checked: c.not, onchange: (e) => change('c-not', () => { if (e.target.checked) c.not = true; else delete c.not; }) }), 'not']),
      groupedSelect(RU.CONDITIONS, condGroups(), c.check, (v) => change('c-kind', () => { const not = c.not; for (const k of Object.keys(c)) delete c[k]; c.check = v; if (not) c.not = true; }, { form: true }), noTarget ? (k) => !RU.CONDITIONS[k].target && k !== 'wasCrit' : null),
      ...partButtons(owner.if, j, 'cond', tidy),
    ]));
    if (S && (S.target || c.check === 'wasCrit') && !hasTarget) box.append(el('div', { class: 'warn', text: noTarget ? 'Needs a monster: never holds here.' : 'This trigger has no monster: the check never holds.' }));
    if (S && S.params) { const pg = el('div', { class: 'pgrid' }); for (const q of S.params) pg.append(paramField(q, c, t)); box.append(pg); }
    return box;
  }
  function actionRow(t, r, a, j, hasTarget) {
    const S = RU.ACTIONS[a.do], box = el('div', { style: 'margin:4px 0 10px' });
    box.append(el('div', { class: 'part-h' }, [
      el('span', { class: 'note', text: `${j + 1}.` }),
      groupedSelect(RU.ACTIONS, ACT_GROUPS, a.do, (v) => change('a-kind', () => { for (const k of Object.keys(a)) delete a[k]; a.do = v; }, { form: true })),
      ...partButtons(r.then, j, 'act'),
    ]));
    if (S && S.desc) box.append(el('div', { class: 'note', text: S.desc }));
    if (S && S.params) {
      const pg = el('div', { class: 'pgrid' });
      for (const q of S.params) pg.append(paramField(q, a, t));
      box.append(pg);
      const at = a.at || (S.params.find((q) => q.k === 'at') || {}).d;
      if (at === 'target' && !hasTarget && S.params.some((q) => q.k === 'at')) box.append(el('div', { class: 'note', text: 'This trigger has no monster: "target" falls back to you (or the nearest monster).' }));
    }
    return box;
  }
  function condStatsCard(t, c, i) {
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'card-h' }, [el('span', { class: 'ttl', text: `While… ${i + 1}` }), el('span', { style: 'flex:1' }), ...partButtons(t.conditionalStats, i, 'cs', () => { if (!t.conditionalStats.length) delete t.conditionalStats; })]));
    const ifBox = el('div', { class: 'part c' }, [el('div', { class: 'part-h' }, [el('b', { text: 'WHILE' }), el('span', { style: 'flex:1' }), el('button', { class: 'small', text: '+ condition', onclick: () => change('c-add', () => { (c.if = c.if || []).push({ check: 'myHealth' }); }, { form: true }) })])]);
    (c.if || []).forEach((q, j) => ifBox.append(condRow(t, c, q, j, false, true)));
    card.append(ifBox, el('div', { class: 'part a' }, [el('b', { text: 'STATS (per rank)' }), statsEditor(c.stats || {}, (fn, form) => change('cs-stats', () => { c.stats = c.stats || {}; fn(c.stats); }, { form }))]));
    card.append(el('div', { class: 'say', 'data-say-cs': i }));
    return card;
  }
  function hitBonusCard(t, c, i) {
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'card-h' }, [el('span', { class: 'ttl', text: `Hit bonus ${i + 1}` }), el('span', { style: 'flex:1' }), ...partButtons(t.hitBonus, i, 'hb', () => { if (!t.hitBonus.length) delete t.hitBonus; })]));
    const pg = el('div', { class: 'pgrid' }, [paramField({ k: 'more', t: 'pct', d: 0.2, label: 'More damage' }, c, t, true)]);
    const ifBox = el('div', { class: 'part c' }, [el('div', { class: 'part-h' }, [el('b', { text: 'WHEN' }), el('span', { class: 'note', style: 'flex:1', text: 'the hit\'s monster…' }), el('button', { class: 'small', text: '+ condition', onclick: () => change('c-add', () => { (c.if = c.if || []).push({ check: 'targetStatus' }); }, { form: true }) })])]);
    (c.if || []).forEach((q, j) => ifBox.append(condRow(t, c, q, j, true)));
    card.append(el('div', { class: 'part a' }, [pg]), ifBox, el('div', { class: 'say', 'data-say-hb': i }));
    return card;
  }

  // ----- one number, choice or list in a rule -----
  const NUMERIC = ['num', 'int', 'pct', 'sec'];
  const ENUM_LABEL = {
    of: { hit: 'the hit', weapon: 'your hit damage', maxHp: 'your max health', targetMaxHp: 'its max health', targetHp: 'its health now', taken: 'damage taken', armor: 'your armor', level: 'your level', flat: 'a flat number' },
    at: { target: 'the monster', player: 'you', nearest: 'nearest monster', random: 'random monster', strongest: 'toughest nearby', weakest: 'weakest nearby' },
    // saved ids keep their old names (CLAUDE.md): essence = Embers, spoons = Miracles
    item: { essence: 'embers' },
    what: { essence: 'embers', spoons: 'miracles' },
  };
  // q: the spec (rules.js), obj: the rule part holding the value, t: its talent (for its max rank).
  function paramField(q, obj, t, required) {
    const has = Object.prototype.hasOwnProperty.call(obj, q.k), v = has ? obj[q.k] : q.d;
    const wrap = el('label', { class: 'pf' + (has || required ? '' : ' def') + (q.t === 'buff' && v && typeof v === 'object' ? ' wide' : '') + (['enemies', 'weapons', 'maps'].includes(q.t) ? ' wide' : ''), title: (q.help || '') + (has ? '' : ' (default)') });
    const commit = (x, form) => change('p-' + q.k, () => { if (x === undefined || (!required && same(x, q.d))) delete obj[q.k]; else obj[q.k] = x; }, { form });
    const lab = el('span', { class: 'lab' }, [q.label + (q.u ? ` (${q.u})` : '') + (q.t === 'pct' ? ' %' : '')]);
    wrap.append(lab);
    if (NUMERIC.includes(q.t)) {
      const k = q.t === 'pct' ? 100 : 1, per = Array.isArray(v), ranks = Math.max(2, t.maxRank || 1);
      lab.append(el('button', { class: 'rk' + (per ? ' on' : ''), type: 'button', text: 'R', title: per ? 'One value for every rank' : 'A value per rank', onclick: (e) => { e.preventDefault(); commit(per ? v[0] : Array.from({ length: ranks }, () => v), true); } }));
      if (per) wrap.append(el('input', { value: v.map((x) => round(x * k)).join(', '), title: 'one value per rank, comma separated', oninput: (e) => { const xs = e.target.value.split(/[,;\s/]+/).filter(Boolean).map(Number); if (xs.length && xs.every(isFinite)) commit(xs.map((x) => round(x / k))); } }));
      else wrap.append(el('input', { type: 'number', step: q.t === 'int' ? 1 : 'any', value: round(v * k), oninput: (e) => { if (e.target.value === '') { commit(undefined); return; } const x = +e.target.value; if (isFinite(x)) commit(q.t === 'int' ? Math.round(x) : round(x / k)); } }));
    } else if (q.t === 'enum') {
      wrap.append(el('select', { onchange: (e) => commit(e.target.value, true) }, q.opts.map((o) => el('option', { value: o, text: (ENUM_LABEL[q.k] && ENUM_LABEL[q.k][o]) || o, selected: o === v }))));
    } else if (q.t === 'bool') {
      wrap.append(el('span', {}, [el('input', { type: 'checkbox', checked: v, onchange: (e) => commit(e.target.checked) }), v ? ' yes' : ' no']));
    } else if (q.t === 'color') {
      wrap.append(el('input', { type: 'color', value: v, style: 'height:26px;padding:1px', oninput: (e) => commit(e.target.value) }));
    } else if (q.t === 'str') {
      wrap.append(el('input', { value: v, oninput: (e) => commit(e.target.value) }));
    } else if (q.t === 'trinket') {
      wrap.append(el('select', { onchange: (e) => commit(e.target.value) }, Object.values(G.TRINKETS).map((x) => el('option', { value: x.id, text: x.name, selected: x.id === v }))));
    } else if (q.t === 'sound') {
      const sel = el('select', { onchange: (e) => { commit(e.target.value); playSound(e.target.value); } }, G.audio.sounds().sort().map((x) => el('option', { value: x, text: x, selected: x === v })));
      wrap.append(el('span', { class: 'row', style: 'flex-wrap:nowrap' }, [sel, el('button', { class: 'icon small', type: 'button', text: '▶', title: 'Listen', onclick: (e) => { e.preventDefault(); playSound(sel.value); } })]));
    } else if (q.t === 'buff') {
      const inline = v && typeof v === 'object';
      const s = el('select', { onchange: (e) => { const x = e.target.value; commit(x === '__new' ? { name: (t.name || 'Talent') + ' Buff', icon: t.icon || 'star', color: '#8af060', duration: 5, stats: { atkSpeed: 0.2 } } : x, true); } },
        [el('option', { value: '__new', text: '✚ a new buff of its own…', selected: inline }), ...Object.values(G.BUFFS).filter((b) => !b.inline).map((b) => el('option', { value: b.id, text: `${b.name} (${b.duration}s)`, selected: b.id === v }))]);
      wrap.append(s);
      if (!inline && G.BUFFS[v]) wrap.append(el('span', { class: 'note', style: 'white-space:normal', text: Object.keys(G.BUFFS[v].stats).map((k) => G.fmtMod(k, G.BUFFS[v].stats[k])).join(', ') || G.BUFFS[v].desc }));
      if (inline) wrap.append(inlineBuff(v, t, () => commit(v)));
    } else if (['enemies', 'weapons', 'maps'].includes(q.t)) {
      const items = q.t === 'enemies' ? Object.values(G.ENEMIES).filter((e) => e.id !== 'training_dummy') : q.t === 'weapons' ? Object.values(G.WEAPONS) : G.MAPS;
      const cur = new Set(v || []);
      wrap.append(el('div', { class: 'multi' }, items.map((x) => el('label', {}, [el('input', { type: 'checkbox', checked: cur.has(x.id), onchange: (e) => { if (e.target.checked) cur.add(x.id); else cur.delete(x.id); commit([...cur]); } }), x.name]))));
    }
    return wrap;
  }
  function inlineBuff(b, t, commit) {
    const box = el('div', { class: 'card', style: 'margin:4px 0' });
    const set = (k, v, form) => { b[k] = v; commit(); if (form) renderSide(); };
    box.append(el('div', { class: 'grid2' }, [
      el('label', { class: 'f' }, ['Name', el('input', { value: b.name || '', oninput: (e) => set('name', e.target.value) })]),
      el('label', { class: 'f' }, ['Seconds', el('input', { type: 'number', step: 'any', value: b.duration, oninput: (e) => { if (isFinite(+e.target.value)) set('duration', +e.target.value); } })]),
      el('label', { class: 'f' }, ['Icon', el('button', { type: 'button', style: 'text-align:left', onclick: (e) => { e.preventDefault(); iconPicker(e.currentTarget, b.icon, (k) => set('icon', k, true)); } }, [el('img', { class: 'ic', src: icon(b.icon) }), ' ' + (b.icon || 'star')])]),
      el('label', { class: 'f' }, ['Color', el('input', { type: 'color', value: b.color || '#8af060', style: 'height:26px;padding:1px', oninput: (e) => set('color', e.target.value) })]),
      el('label', { class: 'f wide' }, ['Description', el('input', { value: b.desc || '', oninput: (e) => set('desc', e.target.value) })]),
    ]));
    box.append(el('div', { class: 'note', text: 'Stats while it lasts:' }), statsEditor(b.stats || {}, (fn, form) => { b.stats = b.stats || {}; fn(b.stats); commit(); if (form) renderSide(); }));
    return box;
  }
  function playSound(name) { try { G.audio.init(); setTimeout(() => G.audio.play(name), 30); } catch (e) { /* no audio */ } }

  // ----- words, preview and checks that follow typing -----
  function updateLive() {
    const t = cur();
    if (!t || ED.tab !== 'talent' || ED.link || ED.sel.length > 1) return;
    const { node, warns } = compileOne(t);
    node.rules.forEach((r) => { const say = document.querySelector(`[data-say="${r.i}"]`); if (say) say.textContent = RU.describe(r); });
    (t.rules || []).forEach((r, i) => { const say = document.querySelector(`[data-say="${i}"]`); if (say && r.disabled) say.textContent = 'Switched off.'; else if (say && !node.rules.some((x) => x.i === i)) say.textContent = 'Not usable: ' + (warns.find((w) => w.includes(`rules[${i}]`)) || 'see Problems'); });
    node.conditionalStats.forEach((c, i) => { const say = document.querySelector(`[data-say-cs="${i}"]`); if (say) say.textContent = RU.describeTalent({ conditionalStats: [c], maxRank: t.maxRank || 1 }); });
    node.hitBonus.forEach((c, i) => { const say = document.querySelector(`[data-say-hb="${i}"]`); if (say) say.textContent = RU.describeTalent({ hitBonus: [c] }); });
    const pv = $('f-preview');
    if (pv) pv.innerHTML = tipHtml(t, node);
    const js = $('f-json');
    if (js && document.activeElement !== js) js.value = prettyJSON(t).trim();
  }
  // The talent's tooltip as the game shows it (ui.js talentTip), unlearned.
  function tipHtml(t, node) {
    const g = groups().find((x) => x.id === t.group), cur0 = G.CURRENCIES[t.currency] || G.CURRENCIES.totem, max = t.maxRank || 1, cost = t.cost || 1;
    const stats = node.stats || {}, fmt = (k) => Object.keys(stats).filter((s) => G.STATS[s]).map((s) => G.fmtMod(s, stats[s] * k)).join(', ');
    const effId = t.effect && (t.effect.id || t.effect), tags = G.tagsFor(stats, effId, node.ruleTags);
    const text = t.text || node.text;
    const sg = segOf(t);
    let h = `<div class="tip" style="--tc:${esc(gColor(t))}"><h4>${esc(t.name || t.id)}</h4><div class="meta">${g ? esc(g.name) + ' · ' : ''}${sg ? `<span style="color:${esc(sg.color)}">${esc(sg.name || sg.id)}</span> · ` : ''}${t.big ? 'big talent · ' : ''}${t.start ? 'starting point' : `rank 0 of ${max} · ${cost} ${cost > 1 ? cur0.plural : cur0.name}${max > 1 ? ' per rank' : ''}`}</div>`;
    if (tags.length) h += `<div class="tchips">${tags.map((k) => `<span class="tchip" style="--tc2:${G.TAGS[k].color}"><img src="${icon(G.TAGS[k].icon)}" alt="">${esc(G.TAGS[k].name)}</span>`).join('')}</div>`;
    if (t.desc) h += `<p class="flav">${esc(t.desc)}</p>`;
    h += '<ul>';
    if (text) h += `<li>${esc(text)}${t.text ? '' : ' <i style="color:var(--dim)">(written from the rules)</i>'}</li>`;
    if (t.downside) h += `<li class="down">${esc(t.downside)}</li>`;
    if (fmt(1)) h += `<li>${max > 1 ? 'Per rank: ' : ''}${esc(fmt(1))}</li>`;
    if (max > 1 && fmt(max)) h += `<li class="up">At rank ${max}: ${esc(fmt(max))}</li>`;
    h += '</ul>';
    const rq = [...reqs(t, 'requires').map((r) => (find(r.id) || {}).name || r.id)];
    const any = reqs(t, 'requiresAny').map((r) => ((find(r.id) || {}).name || r.id) + (r.rank > 1 ? ` rank ${r.rank}` : ''));
    if (any.length) rq.push((any.length > 1 ? 'One of: ' : '') + any.join(' or '));
    if (t.minSpent) rq.push(`${t.minSpent} points spent in the tree`);
    if (rq.length && !t.start) h += `<div class="meta">Requires: ${esc(rq.join(' · '))}</div>`;
    return h + '</div>';
  }

  // ---------- other tabs ----------
  function groupsTab() {
    const box = el('div'), gs = groups();
    box.append(sec(ED.mode === 'alien' ? 'Miracle groups (columns)' : 'Groups (colors of the tree)', el('button', { class: 'small', text: '+ Group', onclick: () => change('g-add', () => {
      const arr = ED.mode === 'alien' ? (ED.doc.alien = ED.doc.alien || { groups: [], talents: [] }).groups : ED.doc.groups;
      const id = 'group' + (arr.length + 1);
      arr.push({ id, name: 'New Group', color: '#' + Math.floor(0x404040 + Math.random() * 0xbfbfbf).toString(16).padStart(6, '0') });
    }, { form: true }) })));
    gs.forEach((g, i) => {
      const n = list().filter((t) => t.group === g.id).length;
      box.append(el('div', { class: 'grp' }, [
        el('input', { value: g.id, title: 'id (renaming moves its talents along)', onchange: (e) => { const nid = slug(e.target.value); if (!nid || gs.some((x) => x !== g && x.id === nid)) { toast('That id is taken'); renderSide(); return; } change('g-id', () => { for (const t of list()) if (t.group === g.id) t.group = nid; g.id = nid; }, { form: true }); } }),
        el('input', { value: g.name || '', oninput: (e) => change('g-name', () => { g.name = e.target.value; }) }),
        el('input', { type: 'color', value: g.color || '#f1e6cf', style: 'height:26px;padding:1px', oninput: (e) => change('g-color', () => { g.color = e.target.value; }) }),
        el('span', { class: 'row', style: 'flex-wrap:nowrap' }, [el('span', { class: 'note', text: `${n}` }), ...partButtons(gs, i, 'g').slice(0, 2),
          el('button', { class: 'icon small danger', text: '×', title: n ? 'Its talents keep no group' : 'Delete', onclick: () => change('g-del', () => { for (const t of list()) if (t.group === g.id) delete t.group; gs.splice(i, 1); }, { form: true }) })]),
      ]));
    });
    box.append(el('p', { class: 'note', text: 'id · name · color · talents in it. Groups only color the tree (and the alien columns); points spent per group show at the top of the game\'s talent screen.' }));
    return box;
  }
  function segmentsTab() {
    const box = el('div');
    if (ED.mode !== 'tree') { box.append(sec('Segments'), el('p', { class: 'empty', text: 'Segments belong to the tree: Miracles have none. Switch to Tree.' })); return box; }
    const ss = segs(), picked = ED.sel.filter(find);
    box.append(sec('Segments (glowing sets of talents)', el('button', { class: 'small', text: picked.length ? `+ Segment from ${picked.length} selected` : '+ Segment', onclick: () => addSegment(picked) })));
    ss.forEach((s, i) => {
      const n = list().filter((t) => t.segment === s.id).length;
      box.append(el('div', { class: 'sgrow' }, [
        el('input', { type: 'color', value: s.color || '#f2c04e', style: 'height:26px;padding:1px', title: 'Glow color', oninput: (e) => change('s-color', () => { s.color = e.target.value; }) }),
        // the id follows the name (its talents move along), so naming it is all there is to do
        el('input', { 'data-seg-name': s.id, value: s.name || '', placeholder: 'Name, e.g. Life stacking', title: `id: ${s.id}`, oninput: (e) => change('s-name', () => {
          s.name = e.target.value;
          const taken = new Set(ss.filter((x) => x !== s).map((x) => x.id));
          const base = s.name.trim() ? slug(s.name) : 'segment';
          let nid = base, k = 2;
          while (taken.has(nid)) nid = `${base}_${k++}`;
          if (nid !== s.id) { for (const t of ED.doc.talents) if (t.segment === s.id) t.segment = nid; s.id = nid; e.target.dataset.segName = nid; e.target.title = `id: ${nid}`; }
        }) }),
        el('span', { class: 'row', style: 'flex-wrap:nowrap' }, [
          el('span', { class: 'note', text: `${n}`, title: 'Talents in it' }),
          el('button', { class: 'small', text: 'Select', title: 'Select its talents in the tree', disabled: !n, onclick: () => select(list().filter((t) => t.segment === s.id).map((t) => t.id)) }),
          el('button', { class: 'small', text: '+ Add selected', title: 'Put the selected talents in this segment', disabled: !picked.length, onclick: () => change('s-put', () => { for (const id of picked) setKey(find(id), 'segment', s.id); }, { form: true }) }),
          ...partButtons(ss, i, 's').slice(0, 2),
          el('button', { class: 'icon small danger', text: '×', title: n ? 'Delete (its talents leave it)' : 'Delete', onclick: () => change('s-del', () => { for (const t of ED.doc.talents) if (t.segment === s.id) delete t.segment; ss.splice(i, 1); if (!ss.length) delete ED.doc.segments; }, { form: true }) }),
        ]),
        glowRow(s),
      ]));
    });
    if (!ss.length) box.append(el('p', { class: 'empty', text: 'No segments yet.' }));
    box.append(el('p', { class: 'note', html: 'A segment is a named set of talents that glow in its color in the tree, e.g. <i>Life stacking</i>, <i>Recovery</i> or <i>Melee combat</i>. It is separate from groups: one group can hold several segments. Select talents (<b>Shift+drag</b> an area, or Shift+click), then <b>+ Segment</b>, or pick a segment in a talent\'s Basics. Talents grown from a segment\'s talent join it. The game shows the glow, and the name in the tooltip.' }));
    return box;
  }
  // How strongly a segment glows: 0 (no glow, just its name) to 100%. 60% is the default and is left out of the file.
  function glowRow(s) {
    const pct = el('span', { class: 'note', style: 'width:34px;text-align:right', text: Math.round(segGlow(s) * 100) + '%' });
    return el('label', { class: 'sglow', title: 'Glow opacity (0: no glow, only the name)' }, ['Glow',
      el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: segGlow(s), oninput: (e) => {
        const v = round(+e.target.value);
        pct.textContent = Math.round(v * 100) + '%';
        change('s-glow', () => { if (v === 0.6) delete s.glow; else s.glow = v; });
      } }), pct]);
  }
  function problemsTab() {
    const box = el('div');
    box.append(sec('Problems', el('button', { class: 'small', text: 'Check again', onclick: () => { validate(); renderTabs(); renderSide(); renderTree(); } })));
    if (!ED.probs.length) { box.append(el('p', { class: 'empty', text: 'Nothing wrong: the game will read every talent.' })); return box; }
    for (const p of ED.probs.slice().sort((a, b) => (a.lvl === b.lvl ? 0 : a.lvl === 'err' ? -1 : 1))) {
      box.append(el('div', { class: 'prob ' + (p.lvl === 'err' ? 'err' : 'w'), text: (p.lvl === 'err' ? '✖ ' : '⚠ ') + p.text, onclick: () => { if (ED.mode !== p.mode) setMode(p.mode); ED.tab = 'talent'; select([p.id]); centerOn(p.id); renderTree(); } }));
    }
    return box;
  }
  function ideasTab() {
    const box = el('div');
    const c0 = cur();
    box.append(sec('Surprise me', el('small', { text: c0 ? `goes under ${c0.name || c0.id}` : 'select a talent to grow it from' })));
    box.append(el('p', { class: 'note', text: 'Rolls a trigger, a condition or two and one or two actions, sized so the talent is roughly fair, names it and writes its text. Keep rolling until one makes you grin, then tune it.' }));
    const out = el('div');
    const roll = () => { out.innerHTML = ''; for (let i = 0; i < 4; i++) out.append(ideaCard(IDEAS.random(ED), true)); };
    box.append(el('div', { class: 'row' }, [el('button', { class: 'primary', text: '🎲 Roll 4 ideas', onclick: roll }), el('button', { text: '🎲 One straight into the tree', onclick: () => addIdea(IDEAS.random(ED)) })]), out);
    box.append(sec('Templates', el('small', { text: `${IDEAS.templates.length} ready-made talents` })));
    for (const it of IDEAS.templates) box.append(ideaCard(it));
    return box;
  }
  function ideaCard(it, rolled) {
    const n = compileOne(Object.assign({ id: 'idea' }, it.talent)).node;
    return el('div', { class: 'idea' }, [
      el('img', { src: icon(it.talent.icon) }),
      el('div', {}, [el('b', { text: it.talent.name }), el('p', { text: it.talent.text || RU.describeTalent(n) }), it.note ? el('p', { style: 'color:#c8b89a;font-style:italic', text: it.note }) : null]),
      el('button', { class: 'small', text: 'Add', onclick: () => addIdea(it) }),
    ]);
  }
  function addIdea(it) {
    if (ED.mode === 'alien') newTalent({ base: Object.assign({}, it.talent, { currency: undefined }) });
    else newTalent({ parent: cur() ? cur().id : null, base: it.talent });
    toast(`Added ${it.talent.name}`);
  }

  // ---------- popups ----------
  function hidePop() { $('pop').hidden = true; }
  function showPop(anchor, content) {
    const p = $('pop');
    p.innerHTML = ''; p.append(content); p.hidden = false;
    const r = anchor.getBoundingClientRect(), w = Math.min(520, innerWidth - 16);
    p.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    p.style.top = Math.min(innerHeight - 40, r.bottom + 4) + 'px';
    p.style.width = w + 'px';
  }
  function iconPicker(anchor, curKey, onpick) {
    const keys = G.ui.iconKeys().sort(), grid = el('div', { class: 'icons' });
    const draw = (q) => { grid.innerHTML = ''; for (const k of keys) if (!q || k.includes(q)) grid.append(el('button', { class: k === curKey ? 'on' : '', title: k, onclick: () => { hidePop(); onpick(k); } }, [el('img', { src: icon(k) }), k])); };
    const search = el('input', { placeholder: 'search icons…', style: 'width:100%', oninput: (e) => draw(e.target.value.trim().toLowerCase()) });
    draw('');
    showPop(anchor, el('div', {}, [search, grid]));
    search.focus();
  }
  // ---------- sending talents to another character's file ----------
  // Moves (or copies) talents into another talents file, saving both. Links between the talents sent
  // stay; links to talents left behind are dropped (wire them up in the other tree). Ids already taken
  // there get a suffix. In a tree they land together, keeping their layout, to the right of what is there.
  async function sendTo(anchor, ids) {
    const files = [...$('h-char').options].filter((o) => o.value !== ED.file);
    if (!files.length) { toast('There is no other character to send it to'); return; }
    if (!ED.server) { toast('Sending needs the save server: run ./barnyard (or python3 tools/serve.py)'); return; }
    const names = ids.map((id) => (find(id) || {}).name || id), o = ED.sendOpts = ED.sendOpts || { copy: false, section: ED.mode };
    o.file = files.some((f) => f.value === o.file) ? o.file : files[0].value;
    const box = el('div');
    const draw = async () => {
      let doc;
      try { doc = JSON.parse(await getText(o.file)); } catch (e) { box.innerHTML = ''; box.append(el('div', { class: 'warn', text: `Could not read data/${o.file}: ${e.message}` })); return; }
      const gs = o.section === 'alien' ? ((doc.alien && doc.alien.groups) || []) : (doc.groups || []), first = find(ids[0]) || {};
      if (!gs.some((g) => g.id === o.group)) o.group = gs.some((g) => g.id === first.group) ? first.group : ((gs.find((g) => !doc.talents || !doc.talents.some((t) => t.start && t.group === g.id)) || gs[0] || {}).id || '');
      box.innerHTML = '';
      box.append(
        el('b', { text: `Send ${ids.length === 1 ? names[0] : `${ids.length} talents`}` }),
        el('div', { class: 'grid2', style: 'margin-top:6px' }, [
          el('label', { class: 'f' }, ['To', el('select', { onchange: (e) => { o.file = e.target.value; draw(); } }, files.map((f) => el('option', { value: f.value, text: f.textContent, selected: f.value === o.file })))]),
          el('label', { class: 'f' }, ['Into', el('select', { onchange: (e) => { o.section = e.target.value; draw(); } }, [el('option', { value: 'tree', text: 'the tree', selected: o.section === 'tree' }), el('option', { value: 'alien', text: 'the Miracles', selected: o.section === 'alien' })])]),
          el('label', { class: 'f' }, ['Group there', el('select', { onchange: (e) => { o.group = e.target.value; } }, [el('option', { value: '', text: '(none)', selected: !o.group }), ...gs.map((g) => el('option', { value: g.id, text: g.name || g.id, selected: g.id === o.group }))])]),
          el('label', { class: 'chk', style: 'align-self:end' }, [el('input', { type: 'checkbox', checked: o.copy, onchange: (e) => { o.copy = e.target.checked; draw(); } }), 'Keep a copy here']),
        ]),
        el('p', { class: 'note', text: `${o.copy ? 'Copies' : 'Moves'} ${names.join(', ').slice(0, 140)} and saves both files (old versions go to tools/backups/). Links among the talents sent are kept; links to the rest of this tree are dropped, so link them up in the other tree.` }),
        el('div', { class: 'row' }, [el('button', { class: 'primary', text: o.copy ? 'Copy ▸' : 'Move ▸', onclick: async (e) => { e.currentTarget.disabled = true; await doSend(ids, o); } }), el('button', { text: 'Cancel', onclick: hidePop })]),
      );
    };
    showPop(anchor, box);
    box.append(el('p', { class: 'note', text: 'Reading the other file…' }));
    await draw();
  }
  async function postSave(file, text) {
    const r = await fetch('../../api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file, text }) });
    const res = await r.json();
    if (!res.ok) throw new Error(res.error || 'save failed');
    return res;
  }
  async function doSend(ids, o) {
    try {
      const doc = JSON.parse(await getText(o.file));
      if (!Array.isArray(doc.talents)) doc.talents = [];
      if (o.section === 'alien' && !doc.alien) doc.alien = { groups: [], talents: [] };
      if (o.section === 'alien' && !Array.isArray(doc.alien.talents)) doc.alien.talents = [];
      const dest = o.section === 'alien' ? doc.alien.talents : doc.talents;
      const taken = new Set(doc.talents.concat((doc.alien && doc.alien.talents) || []).map((t) => t.id));
      const sent = ids.map(find).filter(Boolean), idMap = {};
      for (const t of sent) { let id = t.id, n = 2; while (taken.has(id)) id = `${t.id}_${n++}`; taken.add(id); idMap[t.id] = id; }
      // keep their layout, to the right of everything in the other tree
      const others = doc.talents.filter((t) => !t.disabled), right = others.length ? Math.max(...others.map((t) => Math.round(t.x || 0))) + 3 : 0, top = others.length ? Math.min(...others.map((t) => Math.round(t.y || 0))) : 0;
      const fromTree = ED.mode === 'tree', x0 = fromTree ? Math.min(...sent.map((t) => Math.round(t.x || 0))) : 0, y0 = fromTree ? Math.min(...sent.map((t) => Math.round(t.y || 0))) : 0;
      sent.forEach((t, i) => {
        const c = clone(t);
        c.id = idMap[t.id]; delete c.start;
        for (const k of ['requiresAny', 'requires']) if (c[k]) setReqs(c, k, reqs(c, k).filter((r) => idMap[r.id]).map((r) => ({ id: idMap[r.id], rank: r.rank })));
        if (o.section === 'alien') { delete c.x; delete c.y; delete c.currency; }
        else if (fromTree) { setKey(c, 'x', right + Math.round(t.x || 0) - x0); setKey(c, 'y', top + Math.round(t.y || 0) - y0); }
        else { setKey(c, 'x', right); setKey(c, 'y', top + i); }
        if (o.group) setKey(c, 'group', o.group); else delete c.group;
        // its segment goes along (made there if that tree lacks it); Miracles have none
        const sg = o.section === 'alien' ? null : segOf(t);
        if (!sg) delete c.segment;
        else if (!segsIn(doc).some((x) => x.id === sg.id)) doc.segments.push(clone(sg));
        tidy(c);
        dest.push(c);
      });
      const res = await postSave(o.file, prettyJSON(doc));
      hidePop();
      const renamed = sent.filter((t) => idMap[t.id] !== t.id).map((t) => `${t.id} → ${idMap[t.id]}`);
      if (!o.copy) { deleteTalents(sent.map((t) => t.id)); await save(); }
      toast(`${o.copy ? 'Copied' : 'Moved'} ${sent.length} talent${sent.length === 1 ? '' : 's'} to ${o.file}${renamed.length ? ` (renamed: ${renamed.join(', ')})` : ''}`);
      status(`${o.copy ? 'Copied' : 'Moved'} to data/${o.file}${res.backup ? ` · old version in ${res.backup}` : ''}`, 'good');
    } catch (e) { alert('Sending failed: ' + e.message); }
  }
  function playTest(ids) {
    const anchor = $('h-play');
    const opts = ED.playOpts = ED.playOpts || { god: true, weapon: '', level: 1, which: 'sel' };
    const sel = ids || ED.sel.slice();
    const form = el('div', {}, [
      el('b', { text: 'Play-test' }),
      el('p', { class: 'note', text: `Saves the file, then opens the game in a new tab as ${$('h-char').selectedOptions[0] ? $('h-char').selectedOptions[0].textContent.split(' · ')[0] : 'this character'}. Start a run (Enter, then Enter again on the character screen): the talents are learned as it begins, requirements and points aside.` }),
      el('div', { class: 'grid2' }, [
        el('label', { class: 'f wide' }, ['Learn', el('select', { onchange: (e) => { opts.which = e.target.value; } }, [
          el('option', { value: 'sel', text: sel.length ? `The selected talent${sel.length > 1 ? 's' : ''} (${sel.map((id) => (find(id) || {}).name || id).join(', ').slice(0, 60)})` : 'The selected talents (none selected)', selected: opts.which === 'sel' }),
          el('option', { value: 'rules', text: 'Every talent made of rules', selected: opts.which === 'rules' }),
          el('option', { value: 'all', text: 'Every talent in the tree', selected: opts.which === 'all' }),
          el('option', { value: 'none', text: 'Nothing (just open the game)', selected: opts.which === 'none' })])]),
        el('label', { class: 'f' }, ['Weapon', el('select', { onchange: (e) => { opts.weapon = e.target.value; } }, [el('option', { value: '', text: 'the character\'s own' }), ...Object.values(G.WEAPONS).map((w) => el('option', { value: w.id, text: w.name, selected: w.id === opts.weapon }))])]),
        el('label', { class: 'f' }, ['Start at level', el('input', { type: 'number', min: 1, value: opts.level, oninput: (e) => { opts.level = Math.max(1, +e.target.value || 1); } })]),
        el('label', { class: 'chk' }, [el('input', { type: 'checkbox', checked: opts.god, onchange: (e) => { opts.god = e.target.checked; } }), 'God mode']),
      ]),
      el('div', { class: 'row', style: 'margin-top:8px' }, [el('button', { class: 'primary', text: ED.dirty ? 'Save & play ▸' : 'Play ▸', onclick: async () => {
        if (ED.dirty && !(await save())) return;
        const q = new URLSearchParams();
        const learn = opts.which === 'sel' ? sel.join(',') : opts.which === 'none' ? '' : opts.which;
        const ch = $('h-char').selectedOptions[0];
        if (ch && ch.dataset.char) q.set('char', ch.dataset.char);   // play as this file's character
        if (learn) q.set('learn', learn);
        if (opts.god) q.set('god', '1');
        if (opts.weapon) q.set('weapon', opts.weapon);
        if (opts.level > 1) q.set('level', String(opts.level));
        hidePop();
        window.open('../../index.html?' + q.toString(), 'barnyard-playtest');
      } }), el('button', { text: 'Close', onclick: hidePop })]),
    ]);
    showPop(anchor, form);
  }
  function setMode(m) {
    if (m === 'alien' && !ED.doc.alien) ED.doc.alien = { groups: [], talents: [] };
    ED.mode = m; ED.sel = []; ED.link = null;
    fit(); renderTabs(); renderTree(); renderSide();
    $('hint').innerHTML = hintText();
  }

  // ---------- boot ----------
  async function boot() {
    try {
      await G.loadData();
    } catch (e) {
      $('loading').textContent = 'Could not read the game\'s data: ' + e.message + (location.protocol === 'file:' ? '\n\nServe the game folder first: python3 tools/serve.py, then open http://localhost:8000/tools/talents/' : '');
      return;
    }
    ED.server = await ping();
    const chars = JSON.parse(await getText('characters.json')).characters.filter((c) => c && c.talents && !c.disabled);
    $('h-char').innerHTML = '';
    for (const c of chars) $('h-char').append(el('option', { value: c.talents, 'data-char': c.id, text: `${c.heroName || c.name || c.id} · ${c.talents}` }));
    $('loading').hidden = true; $('app').hidden = false;
    $('h-char').addEventListener('change', async (e) => { if (ED.dirty && !confirm('Drop the unsaved changes?')) { e.target.value = ED.file; return; } await openFile(e.target.value); });
    $('h-tree').addEventListener('click', () => setMode('tree'));
    $('h-alien').addEventListener('click', () => setMode('alien'));
    $('h-undo').addEventListener('click', () => undo(false));
    $('h-redo').addEventListener('click', () => undo(true));
    $('h-new').addEventListener('click', () => newTalent({ parent: cur() ? cur().id : null }));
    $('h-save').addEventListener('click', save);
    $('h-reload').addEventListener('click', async () => { if (ED.dirty && !confirm('Drop the unsaved changes and read the file again?')) return; await openFile(ED.file); toast('Read data/' + ED.file); });
    $('h-play').addEventListener('click', () => playTest());
    $('z-in').addEventListener('click', () => zoomBy(1.25));
    $('z-out').addEventListener('click', () => zoomBy(0.8));
    $('z-fit').addEventListener('click', () => { fit(); renderTree(); });
    // find a talent by name
    const dl = el('datalist', { id: 'dl-talents' }), findIn = el('input', { list: 'dl-talents', placeholder: 'Find a talent…', style: 'width:150px', onfocus: () => { dl.innerHTML = ''; for (const t of list()) dl.append(el('option', { value: t.name || t.id, label: t.id })); },
      onchange: (e) => { const q = e.target.value.toLowerCase(), t = list().find((x) => (x.name || '').toLowerCase() === q || x.id === q) || list().find((x) => (x.name || x.id).toLowerCase().includes(q)); if (t) { select([t.id]); centerOn(t.id); renderTree(); e.target.value = ''; } } });
    $('h-new').after(findIn, dl);
    $('legend').addEventListener('click', (e) => { const sp = e.target.closest('[data-seg]'); if (sp) select(list().filter((t) => t.segment === sp.dataset.seg).map((t) => t.id)); });
    initPointer(); initKeys();
    addEventListener('resize', () => renderTree());
    document.addEventListener('pointerdown', (e) => { const p = $('pop'); if (!p.hidden && !p.contains(e.target) && e.target.id !== 'h-play' && !e.target.closest('.big-ic') && !e.target.closest('.pf')) hidePop(); });
    await openFile($('h-char').value);
  }
  function zoomBy(k) { const r = svg().getBoundingClientRect(), mx = r.width / 2, my = r.height / 2, z0 = V.z; V.z = Math.max(0.2, Math.min(3, V.z * k)); V.x = mx - (mx - V.x) * (V.z / z0); V.y = my - (my - V.y) * (V.z / z0); renderTree(); }
  ED.api = { find, list, select, newTalent, toggleLink, moveNodes, deleteTalents, rename, save, validate, change, undo, compileOne, setMode, setKey };
  boot();
})();
