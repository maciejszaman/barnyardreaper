'use strict';
// Character selection, before every new run from the title: night falls and the camera comes down to the
// farmhouse porch, where every playable character (data/characters.json) stands in the lamplight in its
// starting gear. The one you look at steps forward and shows off: the cat in warm gold, Gregory in violet
// motes over a burning sigil. Its name, specialty, starting kit and lore (typed out as you watch) fill the
// card. A/D, the arrow keys, the arrow buttons, the roster or a click on a character picks one; Enter
// chooses it and the run's intro begins, Escape goes back to the title. The title music darkens while
// Gregory is in the light.
(function () {
  const T = THREE, U = G.U, F = G.fx, A = G.audio, W = G.world, M = G.M;
  const SEL = G.select = { on: false, i: 0, t: 0, actors: [], choosing: 0, typed: 0 };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STAGE = { x: 24, z: -19.4 }, GAP = 2.3;   // the yard in front of the farmhouse porch
  const LEN = 1.1;                                   // seconds of flourish once chosen
  const hexNum = (css) => parseInt(String(css).slice(1), 16);
  const dark = (c) => c.model === 'goat';

  // One actor per character, made once: its model in its starting weapon and hat, standing on the stage.
  function build() {
    if (SEL.actors.length) return;
    const n = G.CHARACTERS.length;
    G.CHARACTERS.forEach((c, i) => {
      const m = M.hero(c.model);
      G.playerSys.dress(m, c.weapon, c.hat);
      const x = STAGE.x + (i - (n - 1) / 2) * GAP;
      m.root.position.set(x, 0, STAGE.z); m.root.visible = false;
      G.scene.add(m.root);
      SEL.actors.push({ c, m, x, z: STAGE.z, pick: 0, seed: i * 1.7, ringT: 0 });
    });
    // one light that follows whoever is in front, tinted to them
    SEL.light = new T.PointLight(0xffc070, 0, 9, 1.6);
    SEL.light.position.set(STAGE.x, 2.6, STAGE.z + 1.2);
    G.scene.add(SEL.light);
  }
  const show = (on) => { for (const a of SEL.actors) a.m.root.visible = on; if (SEL.light) SEL.light.intensity = 0; };

  // ---------- open, move, choose, back ----------
  SEL.open = function () {
    if (G.state !== 'title') return;
    A.init();
    build();
    Object.assign(SEL, { on: true, t: 0, choosing: 0, i: Math.max(0, G.CHARACTERS.indexOf(G.CHAR)) });
    show(true);
    // the camera glides down from wherever the title left it
    const cam = G.camera, d = new T.Vector3(); cam.getWorldDirection(d);
    SEL.cam = { x: cam.position.x, y: cam.position.y, z: cam.position.z, lx: cam.position.x + d.x * 10, ly: cam.position.y + d.y * 10, lz: cam.position.z + d.z * 10 };
    W.setPhaseTarget(3.4);
    G.state = 'select';
    G.ui.show('scr-select');
    $('sel-fade').classList.remove('on');
    renderRoster(); renderCard(true);
    A.play('charSwap');
  };
  SEL.move = function (d) {
    if (!SEL.on || SEL.choosing) return;
    const n = G.CHARACTERS.length;
    SEL.go((SEL.i + d + n) % n);
  };
  SEL.go = function (i) {
    if (!SEL.on || SEL.choosing || i === SEL.i || !G.CHARACTERS[i]) return;
    SEL.i = i;
    const a = SEL.actors[i];
    A.play('charSwap'); setTimeout(() => A.play(a.c.voice, dark(a.c) ? 0.75 : 1), 160);
    if (dark(a.c)) A.play('whispers');
    F.ring(a.x, a.z + 0.5, { r0: 0.2, r1: 1.6, life: 0.6, color: hexNum(a.c.color) });
    renderRoster(); renderCard(true);
  };
  SEL.choose = function () {
    if (!SEL.on || SEL.choosing) return;
    const a = SEL.actors[SEL.i];
    SEL.choosing = 0.0001;
    A.play('charPick', dark(a.c) ? 1 : 0); A.play(a.c.voice, dark(a.c) ? 0.65 : 1.1);
    F.flash(a.c.color, 0.3); F.shake(0.15);
    F.ring(a.x, a.z + 0.5, { r0: 0.3, r1: 3.2, life: 0.9, color: hexNum(a.c.color) }); F.ring(a.x, a.z + 0.5, { r0: 0.2, r1: 2, life: 1.2, color: 0xffffff, y: 0.4 });
    $('sel-go').disabled = true;
    setTimeout(() => $('sel-fade').classList.add('on'), 450);
  };
  SEL.back = function () {
    if (!SEL.on || SEL.choosing) return;
    SEL.on = false; show(false);
    W.setPhaseTarget(0.5);
    G.state = 'title'; G.ui.show('scr-title'); G.ui.showBest();
    A.play('click');
  };
  function start() {
    const c = SEL.actors[SEL.i].c;
    SEL.on = false; show(false);
    G.setCharacter(c.id);
    G.newGame();
    setTimeout(() => $('sel-fade').classList.remove('on'), 60);
  }
  SEL.key = function (code) {
    if (code === 'ArrowLeft' || code === 'KeyA') SEL.move(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') SEL.move(1);
    else if (code === 'Enter' || code === 'Space') SEL.choose();
    else if (code === 'Escape' || code === 'Backspace') SEL.back();
    else { const m = /^Digit([1-9])$/.exec(code); if (m) SEL.go(+m[1] - 1); }
  };
  // The music grows uneasy while Gregory stands in the light.
  SEL.dread = () => (SEL.on && dark(SEL.actors[SEL.i].c) ? 0.55 : 0);

  // ---------- every frame ----------
  SEL.update = function (dt) {
    SEL.t += dt;
    const t = SEL.t, cur = SEL.actors[SEL.i];
    for (let i = 0; i < SEL.actors.length; i++) {
      const a = SEL.actors[i], m = a.m, on = i === SEL.i, d = (o, k, v, s = 6) => { o[k] = U.damp(o[k], v, s, dt); };
      a.pick = U.damp(a.pick, on ? 1 : 0, 5, dt);
      const k = a.pick, tt = t + a.seed, flourish = on && SEL.choosing ? Math.min(1, SEL.choosing / 0.35) : 0;
      // step forward into the light; the others turn to watch
      m.root.position.set(a.x, Math.sin(Math.min(1, SEL.choosing / 0.5) * Math.PI) * 0.35 * flourish, a.z + k * 0.7);
      d(m.root.rotation, 'y', on ? Math.sin(tt * 0.6) * 0.12 : Math.atan2(cur.x - a.x, 3) * 0.6, 4);
      m.hips.position.y = 0.62 + Math.sin(tt * 2.2) * 0.012;
      if (dark(a.c)) {
        // Gregory: head lowered, scythe raised, the other hand weaving
        d(m.head.rotation, 'x', 0.22 * k, 4); d(m.head.rotation, 'y', Math.sin(tt * 0.5) * 0.15, 3);
        d(m.armR.rotation, 'x', -0.4 * k - 1.6 * flourish, 5); d(m.armL.rotation, 'x', (-0.7 + Math.sin(tt * 2.6) * 0.18) * k - 1.2 * flourish, 5);
        m.tail.rotation.y = Math.sin(tt * 1.6) * 0.2;
        if (k > 0.5 && Math.random() < dt * 26) F.rise(a.x + U.rnd(-0.6, 0.6), 0.15, m.root.position.z + U.rnd(-0.6, 0.6), U.pick([0xb86cff, 0x6a2aa8, 0x8aef4a, 0xc01a10]), 1, 0.3, 1.6, 0.1, 1.2);
      } else {
        // the cat: tail swishing, scythe on the shoulder, a curious tilt
        d(m.head.rotation, 'z', Math.sin(tt * 0.9) * 0.08 * k, 3); d(m.head.rotation, 'y', Math.sin(tt * 0.7) * 0.18, 3);
        d(m.armR.rotation, 'x', -0.6 * k - 2.2 * flourish, 6); d(m.armL.rotation, 'x', 0.15 - 2.4 * flourish, 6);
        m.tail.rotation.y = Math.sin(tt * (2.4 + 3 * k)) * (0.45 + 0.3 * k);
        if (k > 0.5 && Math.random() < dt * 10) F.rise(a.x + U.rnd(-0.8, 0.8), 0.3, m.root.position.z + U.rnd(-0.6, 0.6), U.pick([0xffd27a, 0xfff0b0]), 1, 0.4, 1.1, 0.08, 1.4);
      }
      // a ring of the character's color under whoever is in the light
      if (on && (a.ringT -= dt) <= 0) { a.ringT = 1.3; F.ring(a.x, m.root.position.z, { r0: 0.4, r1: 1.4, life: 1.2, color: hexNum(a.c.color) }); }
      m.mat.emissive.setRGB(0.05 * k + 0.25 * flourish, 0.04 * k + 0.2 * flourish, 0.05 * k + 0.2 * flourish);
    }
    // the light follows the one in front
    const L = SEL.light, col = new T.Color(cur.c.color);
    L.color.lerp(col, Math.min(1, dt * 4));
    L.position.x = U.damp(L.position.x, cur.x, 5, dt);
    L.position.z = U.damp(L.position.z, cur.z + 1.6, 5, dt);
    L.intensity = U.damp(L.intensity, 1.4 + Math.sin(t * 3) * 0.08, 3, dt);
    // the camera: in close on the one in front, a little to the side
    // (wide screens: the card is on the right, so the character stands left of center; narrow: above the card)
    const wide = G.camera.aspect > 1.1, c = SEL.cam, tx = cur.x + 0.5, ty = wide ? 1.85 : 2.3, tz = cur.z + (wide ? 5.2 : 6.6);
    c.x = U.damp(c.x, tx, 2.6, dt); c.y = U.damp(c.y, ty, 2.6, dt); c.z = U.damp(c.z, tz, 2.6, dt);
    c.lx = U.damp(c.lx, cur.x + (wide ? 1.0 : 0.5), 3.2, dt); c.ly = U.damp(c.ly, wide ? 1.05 : 0.15, 3.2, dt); c.lz = U.damp(c.lz, cur.z + 0.4, 3.2, dt);
    G.camera.position.set(c.x, c.y, c.z); G.camera.lookAt(c.lx, c.ly, c.lz);
    // the lore types itself out
    if (SEL.typed < cur.c.lore.length) { SEL.typed = Math.min(cur.c.lore.length, SEL.typed + dt * 70); $('sel-lore').textContent = cur.c.lore.slice(0, Math.floor(SEL.typed)); }
    if (SEL.choosing && (SEL.choosing += dt) >= LEN) start();
    F.update(dt);
  };
  // Names over the ones waiting in the back (the card names the one in front), so you know whom to click.
  SEL.drawOverlay = function (c, dpr) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `${Math.round(20 * dpr)}px VT323, monospace`;
    SEL.actors.forEach((a, i) => {
      if (i === SEL.i || SEL.choosing) return;
      const s = F.project(a.x, 2.2, a.m.root.position.z);
      if (!s || s.y < 120 * dpr) return;
      const txt = a.c.heroName.toUpperCase(), w = c.measureText(txt).width + 12 * dpr;
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(s.x - w / 2, s.y - 12 * dpr, w, 24 * dpr);
      c.fillStyle = a.c.color; c.fillText(txt, s.x, s.y + dpr);
    });
  };
  // A click on a character (the overlay lets clicks through to the farm) brings it forward.
  addEventListener('click', (e) => {
    if (!SEL.on || SEL.choosing || e.target.closest('.sel-ui')) return;
    const dpr = F.dpr || 1;
    let best = -1, bd = 110 * dpr;
    SEL.actors.forEach((a, i) => {
      const s = F.project(a.x, 1.2, a.m.root.position.z);
      if (!s) return;
      const dd = Math.hypot(s.x - e.clientX * dpr, s.y - e.clientY * dpr);
      if (dd < bd) { bd = dd; best = i; }
    });
    if (best >= 0) { if (best === SEL.i) SEL.choose(); else SEL.go(best); }
  });

  // ---------- the card ----------
  function renderRoster() {
    const box = $('sel-roster');
    box.innerHTML = '';
    G.CHARACTERS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'sel-face' + (i === SEL.i ? ' on' : '');
      b.style.setProperty('--cc', c.color);
      b.innerHTML = `<img src="${G.ui.icon(c.icon)}" alt=""><span>${esc(c.name)}</span>`;
      b.title = `${c.heroName} (${i + 1})`;
      b.addEventListener('click', () => { A.init(); SEL.go(i); });
      box.appendChild(b);
    });
  }
  // Common starting stats are on every character; the card lists only what sets this one apart.
  const COMMON = new Set(['maxHp', 'moveSpeed', 'critMult', 'chains', 'choices', 'rerolls']);
  function renderCard(retype) {
    const c = G.CHARACTERS[SEL.i], s = c.stats, W0 = G.WEAPONS[c.weapon], Tr = c.trinket && G.TRINKETS[c.trinket];
    const card = $('sel-card');
    card.style.setProperty('--cc', c.color);
    $('sel-epithet').textContent = c.epithet;
    $('sel-name').textContent = c.heroName;
    $('sel-spec').textContent = c.specialty;
    $('sel-tags').innerHTML = (c.tags || []).map((t) => `<span class="sel-tag" style="--tc:${G.TAGS[t].color}"><img src="${G.ui.icon(G.TAGS[t].icon)}" alt="">${esc(G.TAGS[t].name)}</span>`).join('');
    const it = G.makeItem('weapon', 0, 0, c.weapon);
    const extra = Object.keys(s).filter((k) => !COMMON.has(k) && s[k]).map((k) => G.fmtMod(k, s[k]));
    const talents = c.tree.talents.filter((t) => !t.start).length;
    $('sel-kit').innerHTML = `<div><img src="${G.world.itemIcon(it)}" alt=""><span><b>${esc(c.weaponName || W0.name)}</b>${esc(W0.name)} · ${W0.aps} attacks/s</span></div>`
      + (Tr ? `<div><img src="${G.ui.icon(Tr.icon)}" alt=""><span><b>${esc(Tr.name)}</b>Trinket (F) · ${Tr.cooldown}s</span></div>` : '')
      + `<div><img src="${G.ui.icon('heart')}" alt=""><span><b>${Math.round(s.maxHp)} health · ${s.moveSpeed} speed</b>${extra.length ? esc(extra.join(', ')) : 'No other starting bonuses'}</span></div>`
      + `<div><img src="${G.ui.icon('totem')}" alt=""><span><b>${talents} talents</b>${c.tree.groups.filter((g) => c.tree.talents.some((t) => t.group === g.id && !t.start)).map((g) => `<i style="color:${g.color}">${esc(g.name)}</i>`).join(' · ')}</span></div>`;
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    $('sel-go').textContent = `CHOOSE ${c.name.toUpperCase()}`;
    $('sel-go').disabled = false;
    if (retype) { SEL.typed = 0; $('sel-lore').textContent = ''; }
  }
  // buttons (the screen exists in index.html; tools without it never open the selection)
  const btn = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', () => { A.init(); fn(); }); };
  btn('sel-prev', () => SEL.move(-1)); btn('sel-next', () => SEL.move(1));
  btn('sel-go', () => SEL.choose()); btn('sel-back', () => SEL.back());
})();
