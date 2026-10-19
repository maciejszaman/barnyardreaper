'use strict';
// Mokosh (data/stages.json > mokosh): now and then, like the chests, barrels and shrines, a carved wooden
// totem of the Slavic mother goddess rises at a random spot of the farm. It stays `stay` seconds of fighting
// and sinks back into the earth. Press E at it and she listens (the game waits while you choose):
//   Cut a thread: pay embers (G.run.essence) to bar a blessing for the rest of the run. It never comes up again at level
//     ups or at the workbench, so every other blessing comes up more often.
//   Weave a thread twice: pay embers to gain another copy of one of your blessings, giving up a different
//     blessing of the same rarity for it.
// Each totem grants each favour once (when both are given she sinks as you leave), and every favour of a
// kind asked this run makes the next one dearer. G.run.banned: the cut blessings; G.run.mokosh: { cut, weave }.
//   MK.list: [{ x, z, m (model), state: 'rising' | 'idle' | 'sinking', t, life, age, cut, woven }]
(function () {
  const U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player;
  const MK = G.mokosh = { list: [], next: 0, at: null, sel: {}, said: '' };
  const SAGE = 0xa8e6b8, SAGE_CSS = '#a8e6b8', CUT_CSS = '#ff8a7a', DEPTH = 4.6;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const favours = () => (G.run.mokosh = G.run.mokosh || { cut: 0, weave: 0 });

  MK.newDay = function () { MK.next = G.MOKOSH.first; };
  MK.clear = function () { for (const t of MK.list) remove(t); MK.list.length = 0; };
  function remove(t) {
    G.scene.remove(t.m.root);
    t.m.root.traverse((o) => o.geometry && o.geometry.dispose());
    t.m.glowMat.dispose();
  }
  // A free spot inside the fence, away from buildings, caves, the other wonders and you.
  function spot() {
    const K = G.MOKOSH, others = [...G.chests.list, ...G.chests.shrines, ...G.chests.barrels, ...G.altars.list];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 80; i++) {
      const x = U.rnd(-K.area, K.area), z = U.rnd(-K.area, K.area);
      if (W.blocked(x, z, 2) || W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 12) || others.some((o) => Math.hypot(o.x - x, o.z - z) < 6)) continue;
      if (pass === 0 && Math.hypot(x - P.x, z - P.z) < K.minPlayerDistance) continue;
      return [x, z];
    }
    return null;
  }
  MK.spawn = function () {
    const p = spot();
    if (!p) return null;
    const [x, z] = p, m = M.mokosh();
    m.root.position.set(x, -DEPTH, z); m.root.rotation.y = Math.atan2(P.x - x, P.z - z); m.root.scale.setScalar(1.3);
    G.scene.add(m.root);
    const t = { x, z, m, state: 'rising', t: 0, life: G.MOKOSH.stay, age: 0, cut: false, woven: false };
    MK.list.push(t);
    F.dust(x, z, 14); F.ring(x, z, { r0: 0.4, r1: 3, life: 0.7, color: SAGE }); A.play('mokoshRise');
    G.ui.toast(`Mokosh rises · ${Math.round(G.MOKOSH.stay)}s to ask her favour (E)`, SAGE_CSS);
    return t;
  };

  MK.update = function (dt) {
    const K = G.MOKOSH;
    if (G.phase === 'fight' && K.maxStanding > 0 && G.dayT >= MK.next && MK.next < G.DAY_SECONDS) {
      MK.next += U.rnd(K.every[0], K.every[1]);
      if (MK.list.filter((t) => t.state !== 'sinking').length < K.maxStanding) MK.spawn();
    }
    for (const t of MK.list) {
      t.t += dt; t.age += dt;
      const r = t.m.root, fl = 0.85 + Math.sin(t.age * 11) * 0.08 + Math.sin(t.age * 23 + 1) * 0.06;
      // the threads stir in the wind, the candles flicker
      t.m.sway.rotation.z = Math.sin(t.age * 1.3) * 0.035; t.m.sway.rotation.x = Math.cos(t.age * 0.9) * 0.03;
      t.m.glowMat.color.setRGB(fl * 1.1, fl * 0.95, fl * 0.75);
      if (t.state === 'rising') {
        const k = Math.min(1, t.t / 1.3);
        r.position.y = -DEPTH * (1 - k) * (1 - k);
        if (Math.random() < dt * 20) F.dust(t.x + U.rnd(-1.2, 1.2), t.z + U.rnd(-1.2, 1.2), 1);
        if (k >= 1) { t.state = 'idle'; t.t = 0; }
      } else if (t.state === 'idle') {
        t.life -= dt;
        if (Math.random() < dt * 7) { const a = Math.random() * 6.28, d = Math.random() * 2.2; F.rise(t.x + Math.cos(a) * d, 0.3, t.z + Math.sin(a) * d, Math.random() < 0.5 ? SAGE : 0xffd890, 1, 0.3, 1.1, 0.12, 1.4); }
        if (!P.dead && Math.hypot(P.x - t.x, P.z - t.z) < 14 && Math.random() < dt * 0.35) A.play('windGust');
        if (t.life <= 0) { t.state = 'sinking'; t.t = 0; F.dust(t.x, t.z, 10); G.ui.toast('Mokosh sinks back into the earth', SAGE_CSS); }
      } else {
        const k = Math.min(1, t.t / 1.6);
        t.m.glowMat.color.multiplyScalar(1 - k);
        r.position.y = -DEPTH * k * k;
        if (Math.random() < dt * 14) F.dust(t.x + U.rnd(-1, 1), t.z + U.rnd(-1, 1), 1);
        if (t.t > 1.7) t.gone = true;
      }
    }
    for (let i = MK.list.length - 1; i >= 0; i--) if (MK.list[i].gone) { remove(MK.list[i]); MK.list.splice(i, 1); }
  };

  // ---------- asking her favour ----------
  const nearest = () => MK.list.find((t) => t.state === 'idle' && Math.hypot(P.x - t.x, P.z - t.z) < G.MOKOSH.pickupRadius + 0.8);
  // E next to her: open her screen. Returns true when she was in reach.
  MK.use = function () {
    const t = nearest();
    if (!t || G.state !== 'playing') return false;
    open(t);
    return true;
  };
  MK.cutPrice = () => Math.round(G.MOKOSH.ban.cost * Math.pow(1 + G.MOKOSH.ban.growth, favours().cut));
  MK.weavePrice = (rarity) => Math.round(G.MOKOSH.weave.prices[rarity] * Math.pow(1 + G.MOKOSH.weave.growth, favours().weave));
  let wired = false, gusts = null;
  function open(t) {
    MK.at = t; MK.sel = {}; MK.said = '';
    if (!wired) {
      wired = true;
      $('b-mk-close').addEventListener('click', () => { A.play('click'); MK.close(); });
      $('mk-body').addEventListener('click', onClick);
    }
    G.state = 'mokosh'; render(); G.ui.show('scr-mokosh');
    A.play('windGust'); A.play('chime', 0.75);
    clearInterval(gusts); gusts = setInterval(() => A.play('windGust'), 2600);   // the wind keeps blowing while she listens
  }
  MK.close = function () {
    if (G.state !== 'mokosh') return;
    clearInterval(gusts); gusts = null;
    const t = MK.at;
    MK.at = null;
    if (t && t.cut && t.woven && t.state === 'idle') t.life = Math.min(t.life, 0.6);   // nothing more to give: she sinks
    G.state = 'playing'; G.ui.show(null);
  };
  // Your blessings, one entry per blessing and rarity: { id, rarity, n }.
  function owned() {
    const m = new Map();
    for (const p of G.pickList) { const k = p.id + '|' + p.rarity, o = m.get(k) || { id: p.id, rarity: p.rarity, n: 0 }; o.n++; m.set(k, o); }
    return [...m.values()].sort((a, b) => b.rarity - a.rarity || G.UPG[a.id].name.localeCompare(G.UPG[b.id].name));
  }
  function render() {
    const t = MK.at, S = MK.sel, es = Math.floor(G.run.essence), pool = G.progress.offerPool(), tot = pool.reduce((a, u) => a + u.w, 0) || 1;
    const chip = (attrs, u, rc, sub, on) => `<button class="mk-chip${on ? ' sel' : ''}" ${attrs} style="--rc:${rc}"><img src="${G.ui.icon(u.icon)}" alt="">${esc(u.name)}${sub ? ` <small>${sub}</small>` : ''}</button>`;
    let h = `<div class="bench-top"><span class="mk-ess"><img src="${G.ui.icon('essence')}" alt="">${es} EMBERS</span><span class="mk-note">She waits while you choose · ${Math.max(0, Math.ceil(t.life))}s more once you step away</span></div>`;
    if (MK.said) h += `<p class="mk-said">${MK.said}</p>`;
    // cut a thread
    const cp = MK.cutPrice();
    h += `<section class="mk-sec${t.cut ? ' done' : ''}"><p class="sec-label">CUT A THREAD · ${cp} EMBERS</p>`;
    if (t.cut) h += '<p class="mk-note">She has cut a thread for you already. Find her again for another.</p>';
    else {
      h += '<p class="mk-note">Bar one blessing for the rest of the run: it never comes up again, at level ups or at the workbench, so every other one comes up more often. Each number is that blessing\'s share of the offers now.</p>'
        + `<div class="mk-chips">${pool.slice().sort((a, b) => b.w - a.w || a.name.localeCompare(b.name)).map((u) => chip(`data-cut="${u.id}"`, u, S.cut === u.id ? CUT_CSS : SAGE_CSS, `${(u.w / tot * 100).toFixed(1)}%`, S.cut === u.id)).join('')}</div>`;
      if (S.cut) {
        const u = G.UPG[S.cut];
        h += `<div class="mk-act"><span class="mk-note">Cut <b>${esc(u.name)}</b>: every other blessing comes up ×${(1 / (1 - u.w / tot)).toFixed(2)} as often.</span><button class="btn primary" data-act="cut" ${es < cp ? 'disabled' : ''}>CUT THE THREAD · ${cp}</button></div>`;
      }
    }
    const banned = (G.run.banned || []).map((id) => G.UPG[id]).filter(Boolean);
    if (banned.length) h += `<p class="mk-note">Threads cut this run: ${banned.map((u) => `<s>${esc(u.name)}</s>`).join(', ')}</p>`;
    h += '</section>';
    // weave a thread twice
    const own = owned();
    h += `<section class="mk-sec${t.woven ? ' done' : ''}"><p class="sec-label">WEAVE A THREAD TWICE · ${G.RARITY.map((r, i) => `<span style="color:${r.color}">${MK.weavePrice(i)}</span>`).join(' / ')} EMBERS BY RARITY</p>`;
    if (t.woven) h += '<p class="mk-note">She has woven for you already. Find her again for another.</p>';
    else if (!own.length) h += '<p class="mk-note">You have no blessings for her to weave yet.</p>';
    else {
      h += '<p class="mk-note">Choose one of your blessings to gain again, then a different blessing of the same rarity to give up for it.</p>'
        + `<div class="mk-chips">${own.map((o) => { const u = G.UPG[o.id], R = G.RARITY[o.rarity], k = o.id + '|' + o.rarity, capped = !u.ok(G.stats); return chip(`data-keep="${k}"${capped ? ' disabled title="Already at its cap"' : ''}`, u, R.color, `${R.name}${o.n > 1 ? ' ×' + o.n : ''}`, S.keep === k); }).join('')}</div>`;
      if (S.keep) {
        const [kid, kr] = S.keep.split('|'), rar = +kr, give = own.filter((o) => o.rarity === rar && o.id !== kid), R = G.RARITY[rar];
        h += `<p class="sec-label">GIVE UP FOR IT · ${R.name.toUpperCase()}</p>`;
        if (!give.length) h += `<p class="mk-note">You have no other ${R.name.toLowerCase()} blessing to give up.</p>`;
        else h += `<div class="mk-chips">${give.map((o) => { const k = o.id + '|' + o.rarity; return chip(`data-give="${k}"`, G.UPG[o.id], S.give === k ? CUT_CSS : R.color, o.n > 1 ? '×' + o.n : '', S.give === k); }).join('')}</div>`;
        if (S.give) {
          const wp = MK.weavePrice(rar), ku = G.UPG[kid], gu = G.UPG[S.give.split('|')[0]];
          h += `<div class="mk-act"><span class="mk-note">Gain another <b>${esc(ku.name)}</b> (${esc(ku.text(ku.vals[rar]))}) and lose one <b>${esc(gu.name)}</b>.</span><button class="btn primary" data-act="weave" ${es < wp ? 'disabled' : ''}>WEAVE · ${wp}</button></div>`;
        }
      }
    }
    h += '</section>';
    $('mk-body').innerHTML = h;
  }
  function onClick(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled || !MK.at) return;
    const S = MK.sel, d = b.dataset;
    if (d.cut) { S.cut = S.cut === d.cut ? null : d.cut; A.play('chime', 1); }
    else if (d.keep) { S.keep = S.keep === d.keep ? null : d.keep; S.give = null; A.play('chime', 1.12); }
    else if (d.give) { S.give = S.give === d.give ? null : d.give; A.play('chime', 0.9); }
    else if (d.act === 'cut') cut();
    else if (d.act === 'weave') weave();
    else return;
    render();
  }
  function cut() {
    const t = MK.at, id = MK.sel.cut, price = MK.cutPrice();
    if (!t || t.cut || !id || G.run.essence < price) return;
    G.run.essence -= price;
    (G.run.banned = G.run.banned || []).push(id);
    favours().cut++; t.cut = true; MK.sel.cut = null;
    // the workbench's stock forgets it too
    const sh = G.run.shop;
    if (sh) sh.offers = sh.offers.map((o) => (o.id === id && !o.sold ? G.progress.rollChoices(0, 0, 1)[0] || o : o));
    A.play('snip'); A.play('chimes');
    MK.said = `She cuts the thread of <b>${esc(G.UPG[id].name)}</b>. It will not come to you again.`;
  }
  function weave() {
    const t = MK.at, S = MK.sel;
    if (!t || t.woven || !S.keep || !S.give) return;
    const [kid, kr] = S.keep.split('|'), gid = S.give.split('|')[0], rar = +kr, price = MK.weavePrice(rar);
    if (G.run.essence < price || !G.progress.removeUpgrade(gid, rar)) return;
    G.run.essence -= price;
    G.progress.applyUpgrade(kid, rar);
    favours().weave++; t.woven = true; MK.sel = {};
    A.play('chimes');
    MK.said = `She weaves <b>${esc(G.UPG[kid].name)}</b> twice, and takes <b>${esc(G.UPG[gid].name)}</b> in return.`;
  }

  // A label over her (E when you are in reach, and how long she stays), or an arrow when she is off screen.
  MK.drawOverlay = function (c, dpr) {
    const n = nearest();
    for (const t of MK.list) {
      if (t.state !== 'idle' || G.darkness.hidden(t.x, t.z) || !F.pointer(c, dpr, t.x, t.z, SAGE_CSS, 'MOKOSH')) continue;
      const s = F.project(t.x, 6.2, t.z);
      if (!s) continue;
      const txt = `${t === n ? 'E · ' : ''}Mokosh · ${Math.ceil(Math.max(0, t.life))}s`;
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
      const tw = c.measureText(txt).width + 10 * dpr;
      c.fillStyle = 'rgba(10,7,6,.75)'; c.fillRect(s.x - tw / 2, s.y - 10 * dpr, tw, 20 * dpr);
      c.fillStyle = SAGE_CSS; c.fillText(txt, s.x, s.y + dpr);
    }
  };
})();
