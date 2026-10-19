'use strict';
// The bonfire (data/stages.json > camp.bonfire): at night (the pause between days, G.phase 'camp') a great
// fire burns in the middle of the farm. Its light runs out across the ground in long rays, and wooden
// crosses stand loosely around it in a wide ring, each one breaking the ray that falls on it and leaving a
// shadow behind. Press E at it:
//   - the first time each night it gives you a Miracle (currency id 'spoon': spend it on the Miracles tab,
//     Y) and Embers (G.run.essence) for every monster you killed that day;
//   - it opens its screen, a summary of the day: monsters slain, the Embers they earned (counted up), the
//     day's damage per second, and what you gained (levels, blessings, totems, items...), over the sound
//     of the fire crackling;
//   - Pray: the screen slowly turns white and you wake on the next day (day.js travel). Praying here is the
//     only way to the next map.
//   BF.on: { g (the group), fire: [tongue meshes], rays, decal, crosses: [{ x, z }], cols, t, rise } while it burns.
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player;
  const BF = G.bonfire = { on: null };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GOLD = '#ffd84a', FIRE = '#ffa040';
  const addMat = (o) => new T.MeshBasicMaterial(Object.assign({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }, o));

  // ---------- the fire, its rays and the crosses ----------
  // Crosses at random angles around the fire, between crossRadius[0] and [1] meters out, never on a building.
  function placeCrosses(B, rnd) {
    const out = [], [cx, cz] = B.at, n = B.crosses;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) {
        const a = (i + 0.5 + (rnd() - 0.5) * 0.7) / n * Math.PI * 2, r = U.lerp(B.crossRadius[0], B.crossRadius[1], rnd());
        const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        if (W.blocked(x, z, 0.6)) continue;
        out.push({ x, z, a, r, ry: a + (rnd() - 0.5) * 0.5, tilt: (rnd() - 0.5) * 0.16 });
        break;
      }
    }
    return out;
  }
  // The light on the ground: a warm pool and rays running out from the fire, painted on a canvas; behind every
  // cross a wedge of shadow where its ray is broken. Drawn additively (black adds nothing).
  function paintRays(B, crosses) {
    const N = 512, L = B.rays, sc = N / (L * 2), cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d'), c = N / 2, rnd = U.seeded(77);
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
    const pool = g.createRadialGradient(c, c, 0, c, c, L * 0.55 * sc);
    pool.addColorStop(0, 'rgba(255,190,110,1)'); pool.addColorStop(0.25, 'rgba(255,140,60,.55)'); pool.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = pool; g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2, w = 0.02 + rnd() * 0.05, len = (0.55 + rnd() * 0.45) * L * sc, al = 0.25 + rnd() * 0.35;
      const gr = g.createRadialGradient(c, c, 0, c, c, len);
      gr.addColorStop(0, `rgba(255,200,120,${al})`); gr.addColorStop(0.6, `rgba(255,140,50,${al * 0.45})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(c, c); g.arc(c, c, len, a - w, a + w); g.closePath(); g.fill();
    }
    // a ray falls on every cross: its light runs up to the cross and the shadow starts there
    g.globalCompositeOperation = 'lighter';
    for (const cr of crosses) {
      const a = Math.atan2(cr.x - B.at[0], cr.z - B.at[1]), ca = Math.PI / 2 - a, d = cr.r * sc, w = Math.atan(0.85 / cr.r);
      const gr = g.createRadialGradient(c, c, 0, c, c, d);
      gr.addColorStop(0, 'rgba(255,210,140,.7)'); gr.addColorStop(1, 'rgba(255,150,60,.5)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(c, c); g.arc(c, c, d, ca - w * 0.7, ca + w * 0.7); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.filter = 'blur(1.5px)';
    for (const cr of crosses) {
      const a = Math.atan2(cr.x - B.at[0], cr.z - B.at[1]), ca = Math.PI / 2 - a, d = (cr.r - 0.15) * sc, w = Math.atan(0.75 / cr.r);
      g.fillStyle = '#000'; g.beginPath();
      g.moveTo(c + Math.cos(ca - w) * d, c + Math.sin(ca - w) * d); g.lineTo(c + Math.cos(ca - w * 1.25) * N, c + Math.sin(ca - w * 1.25) * N);
      g.lineTo(c + Math.cos(ca + w * 1.25) * N, c + Math.sin(ca + w * 1.25) * N); g.lineTo(c + Math.cos(ca + w) * d, c + Math.sin(ca + w) * d); g.closePath(); g.fill();
    }
    g.filter = 'none';
    const tex = new T.CanvasTexture(cv);
    return tex;
  }
  // Shafts of light standing up out of the fire and leaning outwards: thin vertical sheets, bright at the fire
  // and fading to nothing at their ends (vertex colours on an additive material). The shafts that fall on a
  // cross end at it.
  function shafts(B, crosses) {
    const pos = [], col = [], rnd = U.seeded(91), list = [];
    for (let i = 0; i < 16; i++) list.push({ a: (i + rnd() * 0.6) / 16 * Math.PI * 2, len: B.rays * (0.45 + rnd() * 0.35), k: 0.5 + rnd() * 0.5 });
    for (const cr of crosses) list.push({ a: Math.atan2(cr.x - B.at[0], cr.z - B.at[1]), len: cr.r - 0.2, k: 1 });
    const SEG = 6;
    for (const s of list) {
      const sx = Math.sin(s.a), sz = Math.cos(s.a), at = (r, y) => [sx * r, y, sz * r];
      for (let j = 0; j < SEG; j++) {
        const r0 = 1.2 + (s.len - 1.2) * j / SEG, r1 = 1.2 + (s.len - 1.2) * (j + 1) / SEG, h0 = 3.4 * (1 - j / SEG) + 0.4, h1 = 3.4 * (1 - (j + 1) / SEG) + 0.4;
        const b0 = Math.pow(1 - j / SEG, 1.6) * s.k * 0.55, b1 = Math.pow(1 - (j + 1) / SEG, 1.6) * s.k * 0.55;
        const q = [at(r0, 0), at(r1, 0), at(r1, h1), at(r0, 0), at(r1, h1), at(r0, h0)], cq = [b0, b1, 0, b0, 0, 0];
        q.forEach((p, n) => { pos.push(...p); const v = cq[n]; col.push(v, v * 0.62, v * 0.3); });
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return new T.Mesh(geo, addMat({ vertexColors: true, opacity: 0.9 }));
  }
  BF.build = function () {
    BF.clear();
    const B = G.BONFIRE, [x, z] = B.at, rnd = U.seeded(1000 + G.day * 7), g = new T.Group();
    g.position.set(x, 0, z);
    const bm = M.bonfire();
    g.add(M.mesh(bm.parts), M.mesh(bm.glow, true));
    const fireMat = addMat({ vertexColors: true, opacity: 0.85 });
    const fire = bm.fire.map((layer, i) => { const m = new T.Mesh(M.merge(layer, 0.05), fireMat); m.userData.ph = i * 1.7; g.add(m); return m; });
    const crosses = placeCrosses(B, rnd), CP = [];
    for (const c of crosses) CP.push(...M.place(M.crossParts(2.4 + rnd() * 0.6), c.x - x, 0, c.z - z, c.ry));
    const crossMesh = M.mesh(CP, false, 0.08);
    // the ground light and the shafts: shown when the fire is lit
    const decal = new T.Mesh(new T.PlaneGeometry(B.rays * 2, B.rays * 2), addMat({ map: paintRays(B, crosses), opacity: 0 }));
    decal.rotation.x = -Math.PI / 2; decal.position.y = 0.07;
    const rays = shafts(B, crosses);
    rays.material.opacity = 0;
    g.add(decal, rays);
    G.scene.add(g); G.scene.add(crossMesh);
    // the crosses rise out of the ground with the fire; neither can be walked through
    const cols = [{ t: 0, x, z, r: 1.7 }, ...crosses.map((c) => ({ t: 0, x: c.x, z: c.z, r: 0.28 }))];
    W.colliders.push(...cols);
    BF.on = { g, fire, fireMat, crossMesh, decal, rays, crosses, cols, t: 0, x, z };
    g.position.y = -2.2; crossMesh.position.y = -3;
    F.dust(x, z, 18);
    for (const c of crosses) F.dust(c.x, c.z, 6);
    A.play('fireBed');
  };
  BF.clear = function () {
    const b = BF.on;
    if (!b) return;
    G.scene.remove(b.g); G.scene.remove(b.crossMesh);
    b.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== M.matL && o.material !== M.matB) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    b.crossMesh.geometry.dispose();
    for (const c of b.cols) { const i = W.colliders.indexOf(c); if (i >= 0) W.colliders.splice(i, 1); }
    if (W.fireLight) W.fireLight.intensity = 0;
    BF.on = null;
  };
  // Every frame of the night (day.js updateCamp): it rises, the flames dance, sparks fly, the light flickers.
  BF.update = function (dt) {
    const b = BF.on;
    if (!b) return;
    b.t += dt;
    const lit = Math.min(1, b.t / 1.6), t = b.t, fl = 0.88 + Math.sin(t * 9.1) * 0.06 + Math.sin(t * 23.3) * 0.04 + Math.sin(t * 3.7) * 0.05;
    b.g.position.y = U.damp(b.g.position.y, 0, 3, dt); b.crossMesh.position.y = U.damp(b.crossMesh.position.y, 0, 2.2, dt);
    b.fire.forEach((m, i) => {
      const ph = m.userData.ph, k = lit * (1 + Math.sin(t * (7 + i * 2.3) + ph) * 0.12 + Math.sin(t * (17 + i * 5) + ph * 2) * 0.06);
      m.scale.set(lit * (1 + Math.sin(t * 5.3 + ph) * 0.05), Math.max(0.01, k), lit * (1 + Math.cos(t * 6.1 + ph) * 0.05));
      m.rotation.y = t * (0.6 + i * 0.35) + ph;
    });
    b.fireMat.opacity = 0.8 * fl;
    b.decal.material.opacity = lit * (0.8 + (fl - 0.88) * 1.6);
    b.rays.material.opacity = lit * (0.75 + (fl - 0.88) * 2);
    if (W.fireLight) W.fireLight.intensity = G.BONFIRE.light * lit * fl;
    if (Math.random() < dt * 30 * lit) F.glow.add(b.x + U.rnd(-0.6, 0.6), 1 + Math.random() * 1.5, b.z + U.rnd(-0.6, 0.6), U.rnd(-0.8, 0.8), U.rnd(2.5, 5), U.rnd(-0.8, 0.8), U.rnd(0.6, 1.4), U.rnd(0.06, 0.12), U.pick([0xffd060, 0xff8a2a, 0xffe8a0]), -0.4, 1);
    if (Math.random() < dt * 5 * lit) F.solid.add(b.x + U.rnd(-0.4, 0.4), 3, b.z + U.rnd(-0.4, 0.4), U.rnd(-0.3, 0.3), U.rnd(1, 1.8), U.rnd(-0.3, 0.3), 1.8, 0.26, 0x2a221e, -0.6, 0.6);   // smoke
    // the fire is heard from close by
    const d = Math.hypot(P.x - b.x, P.z - b.z);
    if (G.state === 'playing' && d < 14 && Math.random() < dt * (8 - d * 0.4)) A.play('crackle', U.clamp(1.4 - d / 12, 0.2, 1));
    if (G.state === 'playing' && d < 18 && Math.random() < dt * 0.3) A.play('fireBed');
  };
  const near = () => BF.on && G.phase === 'camp' && Math.hypot(P.x - BF.on.x, P.z - BF.on.z) < G.BONFIRE.radius;
  // E by the fire at night: its screen. Returns true when it was in reach.
  BF.use = function () {
    if (!near() || G.state !== 'playing' || P.dead) return false;
    open();
    return true;
  };
  // Its label (E when you are by it) and an arrow while it is off screen. box: day.js's label drawer.
  BF.drawOverlay = function (c, dpr, box) {
    const b = BF.on;
    if (!b || !F.pointer(c, dpr, b.x, b.z, FIRE, 'BONFIRE')) return;
    const s = F.project(b.x, 4.4, b.z);
    if (s) box(s, near() ? 'E · Bonfire · rest and pray' : 'Bonfire', near() ? GOLD : FIRE, 21);
  };

  // ---------- the night's gifts and the day's summary ----------
  // What the day gave you, from where it started (day.js startDay: G.run.dayStart).
  function daySummary() {
    const r = G.run, s0 = r.dayStart || { kills: 0, level: 1, picks: 0, embers: 0, dealt: 0, taken: 0, totems: 0, chests: 0, items: 0, bosses: 0, invasions: 0, time: 0 };
    const tl = (r.tl || []).filter((p) => p.day === G.day);
    return {
      kills: r.kills - s0.kills, levels: G.level - s0.level, from: s0.level, picks: G.pickList.slice(s0.picks), embers: r.essenceTotal - s0.embers, dealt: r.dealt - s0.dealt,
      taken: r.taken - s0.taken, totems: r.totems - s0.totems, chests: (r.chests || 0) - s0.chests, items: (r.items || 0) - s0.items, bosses: r.bosses - s0.bosses,
      invasions: r.invasions - s0.invasions, tl, t0: s0.time, peak: Math.max(0, ...tl.map((p) => p.dps)),
    };
  }
  // The first visit each night: a Miracle and Embers for every monster killed that day.
  function lightGifts(sum) {
    const r = G.run;
    if (r.bonfireLit) return null;
    r.bonfireLit = true;
    const miracles = G.talents.addSpoons(G.BONFIRE.miracles), embers = Math.round(sum.kills * G.BONFIRE.embersPerKill);
    r.essence += embers; r.essenceTotal += embers;
    return { miracles, embers };
  }
  let wired = false, crackleT = null, bedT = null, anim = null;
  function wire() {
    if (wired) return;
    wired = true;
    const click = (id, fn) => $(id).addEventListener('click', () => { A.play('click'); fn(); });
    click('b-bf-close', () => BF.close());
    click('b-bf-pray', () => BF.pray());
    click('b-bf-spend', () => BF.spend());
  }
  // The fire, heard: crackles at random, and its roar now and then.
  function sound(on) {
    clearTimeout(crackleT); clearInterval(bedT); crackleT = bedT = null;
    if (!on) return;
    const crack = () => { A.play('crackle', U.rnd(0.4, 1)); crackleT = setTimeout(crack, U.rnd(60, 320)); };
    crack(); A.play('fireBed'); bedT = setInterval(() => A.play('fireBed'), 2700);
  }
  function open() {
    wire();
    const sum = daySummary(), gift = lightGifts(sum);
    G.state = 'bonfire';
    render(sum, gift);
    G.ui.show('scr-bonfire');
    sound(true);
    if (gift && gift.miracles) A.play('miracle');
  }
  BF.close = function () {
    if (G.state !== 'bonfire') return;
    sound(false); cancelAnimationFrame(anim);
    G.state = 'playing'; G.ui.show(null);
  };
  // Spend your Miracle: the Miracles tab of the character panel (back to the fire with E).
  BF.spend = function () {
    if (G.state !== 'bonfire') return;
    BF.close();
    G.openPanel('alien');
  };
  // Pray: the screen slowly turns white, and you wake on the next day.
  BF.pray = function () {
    if (G.state !== 'bonfire') return;
    sound(false); cancelAnimationFrame(anim);
    const B = G.BONFIRE, fade = $('pray-fade');
    G.state = 'praying'; G.ui.show(null);
    A.play('prayer');
    fade.style.transition = `opacity ${B.prayFade}s ease-in`; fade.classList.add('on');
    setTimeout(() => {
      G.days.travel();
      G.state = 'playing';
      fade.style.transition = `opacity ${B.wakeFade}s ease-out`; fade.classList.remove('on');
      A.play('dawn');
    }, B.prayFade * 1000 + 250);
  };
  // A new run: no white screen left over from a prayer.
  BF.reset = function () { const f = $('pray-fade'); if (f) { f.style.transition = 'none'; f.classList.remove('on'); } };

  // The screen: the golden promise of a Miracle, then counters that count up (monsters slain, the Embers they
  // earned, with embers flying from one to the other), the day's DPS chart and what the day gave you.
  function render(sum, gift) {
    const UI = G.ui, big = UI.big, CU = G.CURRENCIES.spoon, pts = G.talents.points('spoon');
    $('bf-sub').textContent = `Day ${G.day + 1} survived · ${G.map().name}`;
    const mir = $('bf-miracle');
    mir.hidden = pts <= 0;
    mir.innerHTML = `<img src="${UI.icon(CU.icon)}" alt="">You may spend your miracle<img src="${UI.icon(CU.icon)}" alt="">`;
    $('b-bf-spend').hidden = pts <= 0;
    const embers = gift ? gift.embers : Math.round(sum.kills * G.BONFIRE.embersPerKill);
    const gains = [];
    if (gift && gift.miracles) gains.push(['sun', `+${gift.miracles} ${gift.miracles === 1 ? CU.name : CU.plural}`, GOLD]);
    if (sum.levels > 0) gains.push(['star', `Level ${sum.from} → ${G.level}`, '#9ff0ff']);
    for (const p of sum.picks) { const u = G.UPG[p.id]; if (u) gains.push([u.icon, `${u.name} · ${u.text(u.vals[p.rarity])}`, G.RARITY[p.rarity].color]); }
    if (sum.totems > 0) gains.push(['totem', `+${sum.totems} Totem${sum.totems === 1 ? '' : 's'} of Power`, '#8ff8ff']);
    if (sum.items > 0) gains.push(['chest', `${sum.items} item${sum.items === 1 ? '' : 's'} found`, '#ffd04a']);
    if (sum.chests > 0) gains.push(['chest', `${sum.chests} chest${sum.chests === 1 ? '' : 's'} opened`, '#ffd04a']);
    if (sum.bosses > 0) gains.push(['crown', `${sum.bosses} boss${sum.bosses === 1 ? '' : 'es'} slain`, '#ffb070']);
    if (sum.invasions > 0) gains.push(['ufo', `${sum.invasions} invasion${sum.invasions === 1 ? '' : 's'} repelled`, '#7dff6a']);
    gains.push(['essence', `${big(sum.embers)} embers gathered from the ground`, FIRE]);
    $('bf-body').innerHTML =
      `<div class="bf-count"><div class="bf-kills"><img src="${UI.icon('skull')}" alt=""><b id="bf-k">0</b><span>monsters slain today</span></div>`
      + `<div class="bf-flow" id="bf-flow" aria-hidden="true"></div>`
      + `<div class="bf-emb"><img src="${UI.icon('essence')}" alt=""><b id="bf-e">+0</b><span>${gift ? 'embers for them, ' + G.BONFIRE.embersPerKill + ' each' : 'embers already given tonight'}</span></div></div>`
      + `<div class="otiles bf-tiles">${[['Damage dealt', big(sum.dealt)], ['Best DPS', big(sum.peak)], ['Damage taken', big(sum.taken)], ['Embers now', big(Math.floor(G.run.essence))]].map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>`
      + `<div class="opanel"><h3>Damage per second today</h3>${UI.dpsChart(sum.tl, sum.t0)}</div>`
      + `<div class="opanel"><h3>What the day gave you</h3><ul class="bf-gains">${gains.map(([ic, t, c]) => `<li style="--gc:${c}"><img src="${UI.icon(ic)}" alt=""><span>${esc(t)}</span></li>`).join('')}</ul></div>`;
    UI.wireChart(sum.tl.map((p) => Object.assign({}, p, { t: p.t - sum.t0 })), $('bf-body'));
    countUp(sum.kills, embers, !!gift);
  }
  // Counts the kills and the embers up over a couple of seconds, embers streaming from one to the other.
  function countUp(kills, embers, fresh) {
    const k = $('bf-k'), e = $('bf-e'), flow = $('bf-flow'), dur = fresh ? Math.min(3.2, 1.2 + kills / 400) : 0.6, t0 = performance.now();
    let shown = 0;
    cancelAnimationFrame(anim);
    const step = (now) => {
      const u = Math.min(1, (now - t0) / 1000 / dur), ease = 1 - Math.pow(1 - u, 3);
      k.textContent = Math.round(kills * ease).toLocaleString('en-US');
      e.textContent = '+' + Math.round(embers * ease).toLocaleString('en-US');
      // an ember flies across for every few counted
      const n = Math.floor(ease * Math.min(40, Math.max(1, embers)));
      for (; shown < n; shown++) {
        const s = document.createElement('i');
        s.style.setProperty('--dy', `${U.rnd(-18, 18).toFixed(0)}px`); s.style.animationDelay = `${(Math.random() * 0.12).toFixed(2)}s`;
        flow.appendChild(s); setTimeout(() => s.remove(), 1100);
        if (fresh && shown % 3 === 0) A.play('essence');
      }
      if (u < 1 && G.state === 'bonfire') anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
})();
