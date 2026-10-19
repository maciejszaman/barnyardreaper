'use strict';
// Showcase (tools/showcase/): every model and icon the game has, built by the game's own code (js/models.js,
// js/ui.js icons), to browse, look at from any side and save as PNGs with no background.
//   Categories (CATS): characters (each hero with each weapon, any hat, idle or attacking), weapons, gear
//   (hats, body armor, boots, charms: armor is not drawn on the heroes in the game, so it is shown as items),
//   monsters, bosses, the night's bonfire and the other camp and event props, farm buildings, map decor,
//   pickups, projectiles, and the pixel icons.
//   An item: { id, name, sub, file (PNG name), make(opts) → THREE.Object3D } or, for icons, { icon }.
//   Exports render with a renderer of their own (alpha, cleared to transparent), at the chosen size; "Game
//   pixels" renders at a quarter of it and scales up without smoothing; "Trim" cuts the empty border away.
(function () {
  const T = THREE, M = G.M, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SC = { cat: null, item: null, extra: {}, yaw: -0.6, pitch: 0.3, zoom: 1, thumbs: {}, thumbQ: [] };   // yaw, pitch, zoom: the viewer's angle

  // ---------- turning anything the model library returns into one object ----------
  const fireMat = () => new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  // parts lists, { parts, glow, dark, fire, fan }, { root }, geometries and Object3Ds alike
  function obj(x, o = {}) {
    if (!x) return new T.Group();
    if (x.isObject3D) return x;
    if (x.isBufferGeometry) {
      const vc = !!x.attributes.color, mat = o.basic ? new T.MeshBasicMaterial({ vertexColors: vc }) : new T.MeshLambertMaterial({ vertexColors: vc });
      if (o.color != null) mat.color.set(o.color);
      if (o.opacity != null) { mat.transparent = true; mat.opacity = o.opacity; mat.depthWrite = false; }
      return new T.Mesh(x, mat);
    }
    if (Array.isArray(x)) return M.mesh(x, !!o.glow);
    if (x.root) return x.root;
    const g = new T.Group();
    if (x.parts) g.add(M.mesh(x.parts));
    if (x.glow) g.add(M.mesh(x.glow, true));
    if (x.dark) g.add(M.mesh(x.dark, true));
    if (x.fire) { const fm = fireMat(); for (const layer of x.fire) g.add(new T.Mesh(M.merge(layer, 0.05), fm)); }
    if (x.fan) g.add(x.fan);
    return g;
  }
  // A monster drawn from its instanced parts (each at its joint), tinted and sized like in the game.
  function monster(def) {
    if (G.BOSS_MODELS.includes(def.model)) { const b = M.boss(def.model, def.colors).root; b.scale.setScalar(def.size); return b; }
    const g = new T.Group();
    for (const p of M.enemyParts(def.model)) {
      const mat = p.glow ? new T.MeshBasicMaterial({ vertexColors: true }) : new T.MeshLambertMaterial({ vertexColors: true });
      if (def.tint) mat.color.setRGB(def.tint[0], def.tint[1], def.tint[2]);
      const m = new T.Mesh(p.geo, mat);
      if (p.pivot) m.position.set(p.pivot[0], p.pivot[1], p.pivot[2]);
      g.add(m);
    }
    g.scale.setScalar(def.size);
    return g;
  }
  // A hero dressed in a hat and holding a weapon in its pose (as js/entities.js poses it), idle or mid-attack.
  function hero(model, wid, hat, pose) {
    const h = M.hero(model), W = G.WEAPONS[wid], P = G.playerSys.POSE, ps = P[W.pose] || P.scythe;
    G.playerSys.dress(h, wid, hat);
    if (ps.gun) { h.armR.rotation.x = -1.5; if (ps.twoHanded) h.armL.rotation.x = -1.25; }
    if (pose === 'attack') {
      if (ps.melee) { h.swing.rotation.y = 0.9; h.holder.position.set(...ps.atk[0]); h.holder.rotation.set(...ps.atk[1]); h.armR.rotation.x = -1.45; }
      else if (ps.toss) h.armR.rotation.x = -2.3;
    }
    return h.root;
  }

  // ---------- the catalog ----------
  const HATS = () => G.GEAR_MODELS.hat.concat(['none']);
  function catalog() {
    const C = [];
    const add = (id, name, items, note) => C.push({ id, name, items, note: note || '' });
    // characters: every hero with every weapon
    add('characters', 'Characters', G.CHARACTERS.flatMap((c) => Object.values(G.WEAPONS).map((W) => ({
      id: `${c.id}_${W.id}`, name: `${c.name} · ${W.name}`, sub: `${c.heroName}, ${W.class} weapon`, file: `${c.id}_${W.id}`, char: c,
      extra: ['hat', 'pose'], make: (o) => hero(c.model, W.id, o.hat || c.hat, o.pose),
    }))), 'Every hero with every weapon. Choose a hat and a pose in the viewer. Body armor, boots and charms are not drawn on the heroes in the game: they are under Gear.');
    add('weapons', 'Weapons', Object.values(G.WEAPONS).map((W) => ({ id: W.id, name: W.name, sub: `${W.class} · model ${W.model}`, file: W.id, make: () => M.weapon(W.model) })));
    const gear = [];
    for (const slot of G.SLOTS.slice(1)) for (const b of G.GEAR[slot]) gear.push({ id: `${slot}_${b.model}_${b.name}`, name: b.name, sub: `${G.SLOT_NAMES[slot]} · model ${b.model}`, file: `${slot}_${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, make: () => M.itemModel({ slot, model: b.model, color: b.color }) });
    for (const h of HATS()) if (h !== 'none' && !gear.some((x) => x.id.startsWith(`hat_${h}_`))) gear.push({ id: `hat_${h}`, name: `Hat: ${h}`, sub: 'hat model', file: `hat_${h}`, make: () => M.mesh(M.hatParts(h)) });
    add('gear', 'Gear', gear, 'Hats, body armor, boots and charms, as they drop and in their colors.');
    const mons = Object.values(G.ENEMIES).filter((e) => !e.boss);
    add('monsters', 'Monsters', mons.map((e) => ({ id: e.id, name: e.name, sub: `model ${e.model}${e.tint ? ' · tinted' : ''}`, file: e.id, make: () => monster(e) })));
    add('bosses', 'Bosses', Object.values(G.ENEMIES).filter((e) => e.boss).map((e) => ({ id: e.id, name: e.name, sub: `model ${e.model}`, file: e.id, make: () => monster(e) })));
    const P = (id, name, make, sub) => ({ id, name, sub: sub || '', file: id, make });
    add('camp', 'Camp & events', [
      P('bonfire', 'Bonfire', () => obj(M.bonfire()), 'the night: pray here for the next day'),
      P('cross', 'Wooden cross', () => obj(M.crossParts()), 'they stand around the bonfire'),
      P('bonfire_crosses', 'Bonfire and its crosses', () => { const g = obj(M.bonfire()); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; g.add(M.mesh(M.place(M.crossParts(2.6), Math.sin(a) * 8, 0, Math.cos(a) * 8, a))); } return g; }),
      P('workbench', 'Workbench', () => obj(M.workbench())), P('lamp', 'Lamp post', () => obj(M.lampParts()), 'lit at night'),
      P('chest', 'Chest', () => obj(M.chest())), P('chest_open', 'Chest (open)', () => { const c = M.chest(); c.lid.rotation.x = -1.9; c.glowMat.color.setRGB(1, 0.85, 0.4); return c.root; }),
      P('barrel', 'Experience barrel', () => { const b = M.barrel(); b.glowMat.color.setRGB(0.5, 1, 0.45); return b.root; }),
      P('shrine', 'Shrine of Mary', () => { const s = M.shrine(false); s.glowMat.color.setRGB(1.1, 1, 0.85); return s.root; }),
      P('shrine_unholy', 'Unholy Shrine', () => { const s = M.shrine(true); s.glowMat.color.setRGB(1.2, 0.25, 0.2); return s.root; }),
      P('altar', 'Altar of Power', () => { const a = M.altar(); a.glowMat.color.set(0x8ff8ff); a.totemMount.add(M.totem()); return a.root; }),
      P('totem', 'Totem of Power', () => M.totem()), P('mokosh', 'Mokosh', () => { const m = M.mokosh(); m.glowMat.color.setRGB(1.1, 0.95, 0.75); return m.root; }),
      P('tesla', 'Tesla tower', () => obj(M.teslaTower())), P('sigil', 'Summoning sigil', () => obj(M.sigil(3), { glow: true })),
    ]);
    add('farm', 'The farm', [
      P('barn', 'Barn', () => obj(M.barnParts())), P('silo', 'Silo', () => obj(M.siloParts())), P('farmhouse', 'Farmhouse', () => obj(M.farmhouseParts())),
      P('windmill', 'Windmill', () => obj(M.windmill())), P('tractor', 'Tractor', () => obj(M.tractorParts())), P('haybale', 'Hay bale', () => obj(M.haybaleParts())),
      P('squarebale', 'Square bale', () => obj(M.squareBaleParts())), P('well', 'Well', () => obj(M.wellParts())), P('trough', 'Trough', () => obj(M.troughParts())),
      P('coop', 'Chicken coop', () => obj(M.coopParts())), P('crate', 'Crate', () => obj(M.crateParts())), P('pumpkin', 'Small pumpkin', () => obj(M.smallPumpkin())),
      P('fence', 'Fence', () => obj(M.fenceParts(-3, 0, 3, 0))), P('cave', 'Cave', () => obj(M.caveParts(1))),
      P('oak', 'Oak tree', () => obj(M.treeGeo(false))), P('pine', 'Pine tree', () => obj(M.treeGeo(true))), P('corn', 'Corn', () => obj(M.cornGeo())),
    ]);
    add('decor', 'Map decor', [
      P('saucer', 'Crashed saucer', () => obj(M.saucerParts())), P('pod', 'Alien pod', () => obj(M.podParts(1))),
      P('tiki', 'Tiki pole', () => obj(M.tikiPole(3))), P('deadtree', 'Dead tree', () => obj(M.deadTree(7))), P('skulls', 'Skull pile', () => obj(M.skullPile())), P('candles', 'Candles', () => obj(M.candleParts())),
      P('monolith', 'Floating monolith', () => obj(M.monolith(3.2))), P('spire', 'Twisted spire', () => obj(M.twistedSpire(5, 3))), P('crystals', 'Void crystals', () => obj(M.voidCrystals(4))),
      P('eyestalk', 'Eye stalk', () => { const s = M.eyeStalk(3, 5), g = obj(s.parts), e = obj(M.eyeballGeo(), { basic: true }); e.position.set(s.top[0], s.top[1] + 0.3, s.top[2]); g.add(e); return g; }),
      P('rock', 'Rock', () => obj(M.rockGeo(1, 3, 1, 0.3), { color: 0x77736a })),
    ]);
    const GEM = [0x7dff6a, 0x4ab8ff, 0xc070ff, 0xffb030];
    add('pickups', 'Pickups', [
      ...GEM.map((c, i) => P(`crystal_${i + 1}`, `Soul crystal (tier ${i + 1})`, () => obj(M.gemGeo(), { basic: true, color: c }), 'experience')),
      P('ember', 'Ember', () => obj(M.essenceGeo(), { basic: true, color: M.EMBER.color, opacity: M.EMBER.opacity }), 'the workbench currency, orange and see-through'),
      P('fish', 'Fish', () => M.fish(), 'heals you'), P('catnip', 'Catnip', () => M.catnip(), 'every crystal flies to you'),
    ]);
    add('projectiles', 'Projectiles', G.PROJ_KINDS.filter((k) => k !== 'nova').concat(['seed', 'bolt', 'hex', 'boulder']).map((k) => P(`proj_${k}`, k[0].toUpperCase() + k.slice(1), () => obj(M.projGeo(k), { basic: k !== 'boulder' }), ['seed', 'bolt', 'hex', 'boulder'].includes(k) ? 'monsters\' shot' : 'your weapons\' shot')));
    add('icons', 'Icons', G.ui.iconKeys().sort().map((k) => ({ id: k, name: k, sub: 'pixel icon (16 × 16)', file: k, icon: k })), 'Every pixel icon (js/ui.js ICONS), 16 × 16 pixels. PNGs are scaled up in whole pixels, as close to the chosen size as that allows.');
    return C;
  }

  // ---------- rendering ----------
  // Two stages: VIEW (what the viewer shows, turned by you) and WORK (thumbnails and zips, built while you
  // look at something else). Each: { scene, pivot, radius } with the same lights.
  function Stage() {
    const scene = new T.Scene(), pivot = new T.Group();
    scene.add(new T.HemisphereLight(0xffffff, 0x50443a, 0.9));
    const key = new T.DirectionalLight(0xfff2e0, 0.75); key.position.set(3, 5, 6); scene.add(key);
    const rim = new T.DirectionalLight(0x9fc0ff, 0.3); rim.position.set(-4, 3, -4); scene.add(rim);
    scene.add(pivot);
    return { scene, pivot, radius: 1 };
  }
  const VIEW = Stage(), WORK = Stage(), cam = new T.PerspectiveCamera(30, 1, 0.05, 500), ANGLE0 = { yaw: -0.6, pitch: 0.3, zoom: 1 };
  let view = null, ex = null;
  // Puts an object on a stage, centred, and measures it (the camera keeps it in frame from every side).
  function show(st, o) {
    for (const c of st.pivot.children.slice()) { st.pivot.remove(c); dispose(c); }
    const wrap = new T.Group();
    wrap.add(o); st.pivot.add(wrap); st.pivot.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(wrap), c = bb.getCenter(new T.Vector3());
    wrap.position.sub(c);
    st.radius = Math.max(0.05, bb.getSize(new T.Vector3()).length() / 2);
  }
  function dispose(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); }
  // The camera on a stage from an angle ({ yaw, pitch, zoom }).
  function aim(st, aspect, ang) {
    cam.aspect = aspect; cam.updateProjectionMatrix();
    const r = st.radius, fit = Math.min(1, aspect), d = r / Math.sin((cam.fov / 2) * Math.PI / 180) / fit / ang.zoom * 1.02;
    cam.position.set(0, Math.sin(ang.pitch) * d, Math.cos(ang.pitch) * d); cam.lookAt(0, 0, 0);
    cam.near = Math.max(0.01, d - r * 3); cam.far = d + r * 3; cam.updateProjectionMatrix();
    st.pivot.rotation.y = ang.yaw;
  }
  function drawView() {
    if (!view || !SC.item || SC.item.icon) return;
    const cv = $('view'), w = cv.clientWidth, h = cv.clientHeight, px = $('o-px').checked, k = px ? 0.25 : 1;
    view.setSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)), false);
    aim(VIEW, w / h, SC);
    view.render(VIEW.scene, cam);
  }
  // A PNG of a stage: size x size (game pixels: a quarter of it, scaled up), trimmed to the model.
  function exportPNG(size, st = VIEW, ang = SC) {
    const px = $('o-px').checked, s = px ? Math.max(32, Math.round(size / 4)) : size;
    if (!ex) { ex = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); ex.setPixelRatio(1); ex.setClearColor(0x000000, 0); }
    ex.setSize(s, s, false);
    aim(st, 1, ang); ex.render(st.scene, cam);
    let src = ex.domElement;
    if (px) { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, size, size); src = c; }
    return $('o-trim').checked ? trim(src) : copy(src);
  }
  const copy = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; };
  // The canvas cut down to its visible pixels, with a little margin.
  function trim(src) {
    const c = copy(src), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return c;
    const pad = Math.round(Math.max(c.width, c.height) * 0.02), ax = Math.max(0, x0 - pad), ay = Math.max(0, y0 - pad), bx = Math.min(c.width, x1 + 1 + pad), by = Math.min(c.height, y1 + 1 + pad);
    const o = document.createElement('canvas'); o.width = bx - ax; o.height = by - ay;
    o.getContext('2d').drawImage(c, ax, ay, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }
  // A pixel icon at k whole pixels per icon pixel (its 48 px image is 3 per pixel).
  function iconCanvas(key2, size) {
    const k = Math.max(1, Math.round(size / 16)), img = new Image();
    return new Promise((res) => {
      img.onload = () => {
        const c16 = document.createElement('canvas'); c16.width = c16.height = 16;
        const g16 = c16.getContext('2d'); g16.imageSmoothingEnabled = false; g16.drawImage(img, 0, 0, 16, 16);
        const c = document.createElement('canvas'); c.width = c.height = 16 * k;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(c16, 0, 0, 16 * k, 16 * k);
        res(c);
      };
      img.src = G.ui.icon(key2);
    });
  }
  const blobOf = (c) => new Promise((r) => c.toBlob(r, 'image/png'));
  function save(blob, name) { const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000); }
  const opts = () => Object.assign({}, SC.extra);
  // An item built and on a stage (the viewer's: with its hat and pose for characters).
  function build(it, o, st = VIEW) { show(st, it.make(o || opts())); }
  const fileName = (it, o) => it.file + (it.char ? `_${(o && o.hat) || it.char.hat}${o && o.pose === 'attack' ? '_attack' : ''}` : '') + '.png';

  // ---------- the page ----------
  let CATS = [];
  function renderCats() {
    $('cats').innerHTML = CATS.map((c) => `<button data-cat="${c.id}" class="${SC.cat === c ? 'on' : ''}">${esc(c.name)} <small>${c.items.length}</small></button>`).join('');
  }
  function renderGrid() {
    const c = SC.cat, q = $('search').value.trim().toLowerCase();
    $('note').textContent = c.note;
    const list = c.items.filter((it) => !q || (it.name + ' ' + it.sub).toLowerCase().includes(q));
    $('grid').innerHTML = list.map((it) => `<div class="cell${SC.item === it ? ' on' : ''}" tabindex="0" data-id="${esc(it.id)}"><div class="th">${SC.thumbs[c.id + ':' + it.id] ? `<img src="${SC.thumbs[c.id + ':' + it.id]}" alt="">` : ''}</div><span>${esc(it.name)}</span></div>`).join('') || '<p class="empty">Nothing matches.</p>';
    SC.thumbQ = list.filter((it) => !SC.thumbs[c.id + ':' + it.id]).map((it) => ({ c, it }));
    pumpThumbs();
    $('b-all').disabled = !window.JSZip;
    $('b-all').title = window.JSZip ? '' : 'JSZip could not be loaded (offline?)';
  }
  // Thumbnails, one a frame, for the open category (models render, icons are their images).
  let pumping = false;
  function pumpThumbs() {
    if (pumping) return;
    pumping = true;
    const step = () => {
      const job = SC.thumbQ.shift();
      if (!job) { pumping = false; return; }
      const k = job.c.id + ':' + job.it.id;
      try {
        if (job.it.icon) SC.thumbs[k] = G.ui.icon(job.it.icon);
        else { build(job.it, {}, WORK); SC.thumbs[k] = exportPNG(208, WORK, ANGLE0).toDataURL(); }
      } catch (e) { console.warn('[showcase] ' + job.it.id + ': ' + e.message); SC.thumbs[k] = ''; }
      const cell = document.querySelector(`.cell[data-id="${CSS.escape(job.it.id)}"] .th`);
      if (cell && SC.cat === job.c && SC.thumbs[k]) cell.innerHTML = `<img src="${SC.thumbs[k]}" alt="">`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function pickCat(id) {
    SC.cat = CATS.find((c) => c.id === id) || CATS[0];
    try { localStorage.setItem('barnyard-showcase-cat', SC.cat.id); } catch (e) { /* storage unavailable */ }
    renderCats(); renderGrid();
  }
  function pick(it) {
    SC.item = it; SC.extra = {}; SC.zoom = 1;
    for (const el of document.querySelectorAll('.cell')) el.classList.toggle('on', el.dataset.id === it.id);
    $('v-name').textContent = it.name; $('v-sub').textContent = it.sub || '';
    $('icon-view').hidden = !it.icon; $('view').hidden = !!it.icon; $('b-reset').parentElement.hidden = !!it.icon;   // icons don't turn
    const ex2 = $('v-extra');
    ex2.innerHTML = '';
    if (it.extra && it.extra.includes('hat')) {
      ex2.insertAdjacentHTML('beforeend', `<label class="o">Hat <select id="x-hat">${HATS().map((h) => `<option${h === it.char.hat ? ' selected' : ''}>${h}</option>`).join('')}</select></label>`);
      ex2.insertAdjacentHTML('beforeend', '<label class="o">Pose <select id="x-pose"><option value="idle">idle</option><option value="attack">attacking</option></select></label>');
      $('x-hat').addEventListener('change', (e) => { SC.extra.hat = e.target.value; build(it); drawView(); });
      $('x-pose').addEventListener('change', (e) => { SC.extra.pose = e.target.value; build(it); drawView(); });
    }
    if (it.icon) $('icon-img').src = G.ui.icon(it.icon); else { build(it); drawView(); }
    $('b-png').disabled = false;
    status('');
  }
  const status = (t) => { $('status').textContent = t; };
  async function downloadOne() {
    const it = SC.item, size = +$('o-size').value;
    if (!it) return;
    const c = it.icon ? await iconCanvas(it.icon, size) : exportPNG(size);
    save(await blobOf(c), it.icon ? `icon_${it.file}.png` : fileName(it, SC.extra));
    status(`Saved ${it.name} (${c.width} × ${c.height})`);
  }
  // Every item of the open category into one zip (characters in their own hat, idle).
  async function downloadAll() {
    const c = SC.cat, size = +$('o-size').value, zip = new window.JSZip();
    $('b-all').disabled = true;
    for (let i = 0; i < c.items.length; i++) {
      const it = c.items[i];
      status(`Rendering ${i + 1} / ${c.items.length}: ${it.name}`);
      try {
        const cv = it.icon ? await iconCanvas(it.icon, size) : (build(it, {}, WORK), exportPNG(size, WORK, ANGLE0));
        zip.file(it.icon ? `icon_${it.file}.png` : fileName(it, {}), await blobOf(cv));
      } catch (e) { console.warn('[showcase] ' + it.id + ': ' + e.message); }
      await new Promise((r) => setTimeout(r, 0));
    }
    status('Packing the zip…');
    save(await zip.generateAsync({ type: 'blob' }), `barnyard_${c.id}.zip`);
    status(`Saved ${c.items.length} PNGs (barnyard_${c.id}.zip)`);
    $('b-all').disabled = false;
  }

  // ---------- input ----------
  function wire() {
    $('cats').addEventListener('click', (e) => { const b = e.target.closest('button[data-cat]'); if (b) pickCat(b.dataset.cat); });
    $('grid').addEventListener('click', (e) => { const c = e.target.closest('.cell'); if (c) pick(SC.cat.items.find((it) => it.id === c.dataset.id)); });
    $('grid').addEventListener('keydown', (e) => { const c = e.target.closest('.cell'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(SC.cat.items.find((it) => it.id === c.dataset.id)); } });
    $('search').addEventListener('input', renderGrid);
    $('b-png').addEventListener('click', downloadOne);
    $('b-all').addEventListener('click', downloadAll);
    $('b-reset').addEventListener('click', () => { SC.yaw = -0.6; SC.pitch = 0.3; SC.zoom = 1; drawView(); });
    $('o-px').addEventListener('change', () => { $('view').classList.toggle('px', $('o-px').checked); drawView(); });
    const st = $('stage');
    let drag = null;
    st.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: SC.yaw, pitch: SC.pitch }; st.setPointerCapture(e.pointerId); });
    st.addEventListener('pointermove', (e) => { if (!drag) return; SC.yaw = drag.yaw + (e.clientX - drag.x) * 0.01; SC.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.01)); drawView(); });
    const up = () => { drag = null; };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('wheel', (e) => { e.preventDefault(); SC.zoom = Math.max(0.3, Math.min(6, SC.zoom * Math.exp(-e.deltaY * 0.0015))); drawView(); }, { passive: false });
    addEventListener('resize', drawView);
    let last = performance.now();
    const tick = (now) => { requestAnimationFrame(tick); const dt = Math.min(0.05, (now - last) / 1000); last = now; if ($('o-spin').checked && !drag && SC.item && !SC.item.icon) { SC.yaw += dt * 0.5; drawView(); } };
    requestAnimationFrame(tick);
  }

  async function boot() {
    if (!window.THREE) { $('loading').textContent = 'Could not load three.js (offline?). The showcase needs it.'; return; }
    try { await G.loadData(); } catch (e) { $('loading').textContent = 'Could not load the data: ' + e.message + '. Run ./barnyard and open http://localhost:8000/tools/showcase/'; return; }
    view = new T.WebGLRenderer({ canvas: $('view'), antialias: true, alpha: true }); view.setPixelRatio(Math.min(2, devicePixelRatio || 1)); view.setClearColor(0x000000, 0);
    CATS = catalog();
    window.SHOWCASE = { SC, CATS, exportPNG, iconCanvas, pick, pickCat, downloadAll };   // for testing from the console
    wire();
    let want = null;
    try { want = localStorage.getItem('barnyard-showcase-cat'); } catch (e) { /* storage unavailable */ }
    pickCat(want);
  }
  boot();
})();
