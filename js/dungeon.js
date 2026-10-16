'use strict';
// Dungeons (data/stages.json > dungeon). Now and then a stairway opens on the map, carrying random
// monster modifiers. Press E at it to go down: three big chambers of mossy brick (pillars, inner walls,
// several doors between them) are built far beyond the farm (out of sight), the farm's monsters, its day
// clock and its events wait, and you fight through huge packs of monsters that all carry the dungeon's
// modifiers (and the Abyssal one: x3 health and damage) to a boss standing on a pentagram in the last
// chamber. Each chamber hides a free chest (blue glow) with a better item. Killing the boss gives you a
// trinket you don't own yet and items, and you climb back out where you went in, with everything that
// dropped inside.
//   DG.entrance: the stairs on the map { x, z, mods, t (seconds left), g }. DG.active: you are inside.
//   DG.rooms: the chambers [{ cx, cz, w, d, kind }]; the last one is the boss's. DG.packList: [{ x, z, room, alive }].
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player, ES = G.enemySys;
  const DG = G.dungeon = { active: false, entrance: null, next: Infinity, rooms: [], awake: {}, cleared: 0, packs: 0, mods: [] };
  const OX = 0, OZ = 900;          // where dungeons are built: far past the farm, beyond the camera's reach
  const CELL = 50, CW = 5;         // grid spacing of chambers, door and corridor width
  const WALL_H = 2.6, WALL_T = 1;  // wall height and thickness
  const BRICK = 2.6, FLAG = 4;     // metres per brick / flagstone texture tile
  const DARK = { hemi: '#5a6a78', ground: '#1c160c', ambient: 0.5, fog: '#040503', playerLight: 2.4, lightDistance: 18, tint: [0.92, 1, 0.9] };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inDungeon = (z) => z > OZ - 300;   // a z coordinate inside the dungeon area
  let mats = null, lights = [];

  // ---------- materials (built once) ----------
  function canvasTex(n, paint) {
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    paint(cv.getContext('2d'), n, U.seeded(n + 3));
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter;
    return t;
  }
  // dark clay and stone bricks, moss creeping up from the floor and hanging down in strands
  function paintBricks(g, n, rnd) {
    g.fillStyle = '#16120f'; g.fillRect(0, 0, n, n);
    const rows = 8, bh = n / rows, bw = n / 4;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0), y = r * bh, v = 0.7 + rnd() * 0.4, b = rnd() < 0.55 ? [86, 54, 42] : [70, 64, 58];
      g.fillStyle = `rgb(${b[0] * v | 0},${b[1] * v | 0},${b[2] * v | 0})`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 1, y + bh - 3, bw - 2, 2);
    }
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * n, y = n - Math.pow(rnd(), 2.4) * n * 0.75;
      g.globalAlpha = 0.45 + rnd() * 0.5; g.fillStyle = rnd() < 0.5 ? '#3d6a24' : '#28481a'; g.fillRect(x, y, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 7; i++) {
      let x = rnd() * n, y = 0;
      const end = n * (0.25 + rnd() * 0.45);
      while (y < end) { g.fillStyle = rnd() < 0.7 ? '#2f5a1e' : '#4a7a2a'; g.fillRect(x, y, 2, 3); y += 3; x += (rnd() - 0.5) * 2; }
    }
  }
  // cracked flagstones with moss in the joints and dark puddles
  function paintFloor(g, n, rnd) {
    g.fillStyle = '#121010'; g.fillRect(0, 0, n, n);
    const k = 4, s = n / k;
    for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) {
      const v = 0.75 + rnd() * 0.35;
      g.fillStyle = `rgb(${50 * v | 0},${46 * v | 0},${42 * v | 0})`; g.fillRect(c * s + 2, r * s + 2, s - 4, s - 4);
      for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,240,220,.05)'; g.fillRect(c * s + 2 + rnd() * (s - 6), r * s + 2 + rnd() * (s - 6), 2, 2); }
    }
    for (let i = 0; i < 900; i++) {
      const onX = rnd() < 0.5, line = Math.floor(rnd() * k) * s, along = rnd() * n;
      g.globalAlpha = 0.4 + rnd() * 0.5; g.fillStyle = rnd() < 0.6 ? '#2f5a1e' : '#456f28';
      g.fillRect(onX ? along : line - 2 + rnd() * 4, onX ? line - 2 + rnd() * 4 : along, 2, 2);
    }
    g.globalAlpha = 0.35; g.fillStyle = '#0a0d0c';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(rnd() * n, rnd() * n, 6 + rnd() * 10, 4 + rnd() * 6, rnd() * 3, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }
  function paintPentagram(g, n) {
    g.clearRect(0, 0, n, n);
    const c = n / 2, R = n * 0.44;
    g.strokeStyle = '#ff2a1a'; g.shadowColor = '#ff2a1a'; g.shadowBlur = n * 0.03; g.lineWidth = n * 0.018;
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(c, c, R * 0.9, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 4 / 5, x = c + Math.cos(a) * R * 0.9, y = c + Math.sin(a) * R * 0.9; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  function initMats() {
    if (mats) return;
    const brick = canvasTex(128, paintBricks), floor = canvasTex(128, paintFloor);
    const pent = canvasTex(256, paintPentagram); pent.wrapS = pent.wrapT = T.ClampToEdgeWrapping; pent.magFilter = T.LinearFilter;
    const fade = (m) => { const f = m.clone(); f.transparent = true; f.opacity = 0.2; f.depthWrite = false; return f; };
    const wall = new T.MeshLambertMaterial({ map: brick }), cap = new T.MeshLambertMaterial({ color: 0x17130f });
    mats = {
      wall, cap, floor: new T.MeshLambertMaterial({ map: floor }),
      solid: [wall, wall, cap, cap, wall, wall], faded: [fade(wall), fade(wall), fade(cap), fade(cap), fade(wall), fade(wall)],
      pent: new T.MeshBasicMaterial({ map: pent, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }),
      flame: new T.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, fog: false }),
      iron: new T.MeshLambertMaterial({ color: 0x2a2420 }),
      stone: new T.MeshLambertMaterial({ color: 0x5a554e }), pit: new T.MeshBasicMaterial({ color: 0x020202 }),
      rune: new T.MeshBasicMaterial({ color: 0xb86cff, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }),
      chestRing: new T.MeshBasicMaterial({ color: 0x4a8cff, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }),
    };
  }
  // A few torch lights that follow the torches nearest to you (a fixed number, so shaders never recompile).
  DG.init = function () {
    initMats();
    for (let i = 0; i < 4; i++) { const L = new T.PointLight(0xff9a40, 0, 13, 1.6); L.position.set(OX, -50, OZ); G.scene.add(L); lights.push(L); }
  };

  // ---------- layout ----------
  // A winding chain of chambers on a grid (a self-avoiding walk), kept within 6 x 6 cells.
  function layout(n) {
    for (let tries = 0; tries < 400; tries++) {
      const cells = [[0, 0]], seen = new Set(['0,0']);
      let dir = U.pick(DIRS), ok = true;
      while (cells.length < n) {
        const [x, z] = cells[cells.length - 1];
        const opts = DIRS.filter(([dx, dz]) => {
          const nx = x + dx, nz = z + dz;
          if (seen.has(nx + ',' + nz)) return false;
          const xs = cells.map((c) => c[0]).concat(nx), zs = cells.map((c) => c[1]).concat(nz);
          return Math.max(...xs) - Math.min(...xs) <= 5 && Math.max(...zs) - Math.min(...zs) <= 5;
        });
        if (!opts.length) { ok = false; break; }
        const d = U.weighted(opts, (o) => (o[0] === dir[0] && o[1] === dir[1] ? 2 : 1));
        dir = d; cells.push([x + d[0], z + d[1]]); seen.add((x + d[0]) + ',' + (z + d[1]));
      }
      if (ok) return cells;
    }
    // (never needed in practice) a snake through the 6 x 6 cells
    return Array.from({ length: n }, (_, i) => { const row = Math.floor(i / 6); return [row % 2 ? 5 - (i % 6) : i % 6, row]; });
  }

  // ---------- building ----------
  // A box with its texture tiled by world size (brick faces) and a dark cap on top. Lambert materials
  // light per vertex, so long walls (and floors) are split into ~1.5 m pieces for the torches to show.
  function wallBox(x, z, w, d) {
    const sw = Math.max(1, Math.ceil(w / 1.5)), sd = Math.max(1, Math.ceil(d / 1.5)), geo = new T.BoxGeometry(w, WALL_H, d, sw, 2, sd), uv = geo.attributes.uv;
    const dims = [[d, WALL_H], [d, WALL_H], [w, d], [w, d], [w, WALL_H], [w, WALL_H]];
    for (const gr of geo.groups) {
      const [du, dv] = dims[gr.materialIndex];
      for (let j = gr.start; j < gr.start + gr.count; j++) { const i = geo.index.getX(j); if (geo.userData.done && geo.userData.done[i]) continue; (geo.userData.done = geo.userData.done || {})[i] = 1; uv.setXY(i, uv.getX(i) * du / BRICK, uv.getY(i) * dv / BRICK); }
    }
    delete geo.userData.done;
    const mesh = new T.Mesh(geo, mats.solid);
    mesh.position.set(x, WALL_H / 2, z);
    DG.g.add(mesh);
    DG.walls.push({ mesh, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, faded: false });
    DG.colliders.push({ t: 1, x, z, hw: w / 2, hd: d / 2 });
  }
  // A wall along x (horizontal) or z from a to b at c, with door gaps centred at the given points.
  function wallRun(horiz, c, a, b, gaps) {
    const g = (gaps == null ? [] : [].concat(gaps)).filter((x) => x != null).sort((p, q) => p - q), segs = [];
    let from = a;
    for (const x of g) { segs.push([from, x - CW / 2]); from = x + CW / 2; }
    segs.push([from, b]);
    for (const [s, e] of segs) if (e - s > 0.05) {
      if (horiz) wallBox((s + e) / 2, c, e - s, WALL_T); else wallBox(c, (s + e) / 2, WALL_T, e - s);
    }
  }
  const blockedAt = (x, z, r) => DG.colliders.some((c) => Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r);
  const inRoom = (r, x, z, m = 0) => Math.abs(x - r.cx) < r.w / 2 + m && Math.abs(z - r.cz) < r.d / 2 + m;
  // A free spot in a chamber (clear of walls and pillars by r), passing ok(x, z).
  function freeSpot(r, clear, inset, ok = () => true) {
    for (let i = 0; i < 300; i++) {
      const x = r.cx + U.rnd(-1, 1) * (r.w / 2 - inset), z = r.cz + U.rnd(-1, 1) * (r.d / 2 - inset);
      if (!blockedAt(x, z, clear) && ok(x, z)) return [x, z];
    }
    for (let i = 0; i < 300; i++) { const x = r.cx + U.rnd(-1, 1) * (r.w / 2 - inset), z = r.cz + U.rnd(-1, 1) * (r.d / 2 - inset); if (!blockedAt(x, z, clear)) return [x, z]; }
    return [r.cx, r.cz];
  }
  // What stands inside a chamber: pillars, two long halls of walls, a cross of walls (four quarters with
  // doors between them) or, in the boss's chamber, a walled sanctum with a door on every side.
  function innards(r) {
    const hw = r.w / 2, hd = r.d / 2, pillar = (x, z, s = 2.4) => wallBox(x, z, s, s);
    if (r.kind === 'pillars') {
      for (const fx of [-0.5, 0, 0.5]) for (const fz of [-0.42, 0.42]) pillar(r.cx + fx * hw * 1.3, r.cz + fz * hd * 1.3);
    } else if (r.kind === 'halls') {
      for (const s of [-1, 1]) wallRun(true, r.cz + s * hd / 3, r.cx - hw + 5, r.cx + hw - 5, [r.cx - hw / 2, r.cx, r.cx + hw / 2]);
    } else if (r.kind === 'cross') {
      wallRun(true, r.cz, r.cx - hw + 5, r.cx + hw - 5, [r.cx - hw / 2, r.cx, r.cx + hw / 2]);
      wallRun(false, r.cx, r.cz - hd + 5, r.cz - CW / 2 - 1.5, [r.cz - hd / 2]);
      wallRun(false, r.cx, r.cz + CW / 2 + 1.5, r.cz + hd - 5, [r.cz + hd / 2]);
    } else if (r.kind === 'sanctum') {
      const q = 9.5;
      wallRun(true, r.cz - q, r.cx - q - WALL_T / 2, r.cx + q + WALL_T / 2, [r.cx]); wallRun(true, r.cz + q, r.cx - q - WALL_T / 2, r.cx + q + WALL_T / 2, [r.cx]);
      wallRun(false, r.cx - q, r.cz - q + WALL_T / 2, r.cz + q - WALL_T / 2, [r.cz]); wallRun(false, r.cx + q, r.cz - q + WALL_T / 2, r.cz + q - WALL_T / 2, [r.cz]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pillar(r.cx + sx * (hw - 6), r.cz + sz * (hd - 6), 2.8);
    }
  }
  function floorRect(x0, z0, x1, z1) {
    const w = x1 - x0, d = z1 - z0, geo = new T.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / 1.5)), Math.max(1, Math.ceil(d / 1.5)));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + cx) / FLAG, -(pos.getZ(i) + cz) / FLAG);
    const m = new T.Mesh(geo, mats.floor); m.position.set(cx, 0, cz); DG.g.add(m);
  }
  function torch(x, z, fx, fz) {
    const g = new T.Group(), bracket = new T.Mesh(new T.BoxGeometry(0.16, 0.5, 0.16), mats.iron), flame = new T.Mesh(new T.IcosahedronGeometry(0.2, 0), mats.flame);
    bracket.position.set(0, 1.75, 0); flame.position.set(0, 2.1, 0);
    g.add(bracket, flame); g.position.set(x + fx * 0.25, 0, z + fz * 0.25); DG.g.add(g);
    DG.torches.push({ x: x + fx * 0.6, z: z + fz * 0.6, flame, ph: Math.random() * 6 });
  }
  function build(mods) {
    initMats();
    const D = G.DUNGEON, n = Math.max(1, D.chambers), cells = layout(n);
    DG.g = new T.Group(); DG.walls = []; DG.colliders = []; DG.torches = [];
    const kinds = [U.pick(['pillars', 'halls']), U.pick(['cross', 'halls', 'pillars'])];
    DG.rooms = cells.map(([gx, gz], i) => {
      const last = i === n - 1, w = last ? 42 : 34 + Math.round(Math.random() * 8), d = last ? 42 : 34 + Math.round(Math.random() * 8);
      return { i, gx, gz, cx: OX + gx * CELL, cz: OZ + gz * CELL, w, d, doors: { n: [], s: [], e: [], w: [] }, kind: last ? 'sanctum' : kinds[i % kinds.length] };
    });
    // two or three doors between neighbouring chambers, each with its own corridor
    for (let i = 0; i + 1 < n; i++) {
      const a = DG.rooms[i], b = DG.rooms[i + 1], dx = b.gx - a.gx, k = Math.random() < 0.5 ? 2 : 3;
      if (dx) {
        const [l, r] = dx > 0 ? [a, b] : [b, a], half = Math.min(l.d, r.d) / 2 - CW, offs = k === 3 ? [-half * 0.7, 0, half * 0.7] : [-half * 0.5, half * 0.5];
        const x0 = l.cx + l.w / 2 + WALL_T, x1 = r.cx - r.w / 2 - WALL_T;
        for (const o of offs) {
          const z = a.cz + o; l.doors.e.push(z); r.doors.w.push(z);
          floorRect(x0 - WALL_T, z - CW / 2, x1 + WALL_T, z + CW / 2);
          wallRun(true, z - CW / 2 - WALL_T / 2, x0, x1); wallRun(true, z + CW / 2 + WALL_T / 2, x0, x1);
        }
      } else {
        const [t, btm] = b.gz > a.gz ? [a, b] : [b, a], half = Math.min(t.w, btm.w) / 2 - CW, offs = k === 3 ? [-half * 0.7, 0, half * 0.7] : [-half * 0.5, half * 0.5];
        const z0 = t.cz + t.d / 2 + WALL_T, z1 = btm.cz - btm.d / 2 - WALL_T;
        for (const o of offs) {
          const x = a.cx + o; t.doors.s.push(x); btm.doors.n.push(x);
          floorRect(x - CW / 2, z0 - WALL_T, x + CW / 2, z1 + WALL_T);
          wallRun(false, x - CW / 2 - WALL_T / 2, z0, z1); wallRun(false, x + CW / 2 + WALL_T / 2, z0, z1);
        }
      }
    }
    // chambers: floor, four walls (with their doors), what stands inside, torches, bones
    for (const r of DG.rooms) {
      const hw = r.w / 2, hd = r.d / 2;
      floorRect(r.cx - hw, r.cz - hd, r.cx + hw, r.cz + hd);
      wallRun(true, r.cz - hd - WALL_T / 2, r.cx - hw - WALL_T, r.cx + hw + WALL_T, r.doors.n);
      wallRun(true, r.cz + hd + WALL_T / 2, r.cx - hw - WALL_T, r.cx + hw + WALL_T, r.doors.s);
      wallRun(false, r.cx - hw - WALL_T / 2, r.cz - hd, r.cz + hd, r.doors.w);
      wallRun(false, r.cx + hw + WALL_T / 2, r.cz - hd, r.cz + hd, r.doors.e);
      innards(r);
      const nearDoor = (list, p) => list.some((x) => Math.abs(x - p) < CW);
      for (let x = r.cx - hw + 4; x <= r.cx + hw - 4; x += 8) if (!nearDoor(r.doors.n, x)) torch(x, r.cz - hd, 0, 1);
      for (let z = r.cz - hd + 6; z <= r.cz + hd - 6; z += 11) for (const sd of [-1, 1]) if (!nearDoor(r.doors[sd < 0 ? 'w' : 'e'], z)) torch(r.cx + sd * hw, z, -sd, 0);
      const S = [];
      for (let k = 0; k < 6; k++) { const [x, z] = freeSpot(r, 1, 2); S.push(...M.place(M.skullPile(), x, 0, z, Math.random() * 6, 0.8 + Math.random() * 0.5)); }
      DG.g.add(new T.Mesh(M.merge(S, 0.05), M.matL));
    }
    // the boss's chamber: a pentagram in the sanctum, candles on its points
    const br = DG.rooms[n - 1], pg = new T.PlaneGeometry(11, 11);
    pg.rotateX(-Math.PI / 2);
    DG.pent = new T.Mesh(pg, mats.pent); DG.pent.position.set(br.cx, 0.04, br.cz); DG.g.add(DG.pent);
    const C = [], CG = [];
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5, c = M.candleParts(); C.push(...M.place(c.parts, br.cx + Math.cos(a) * 5.2, 0, br.cz + Math.sin(a) * 5.2, a)); CG.push(...M.place(c.glow, br.cx + Math.cos(a) * 5.2, 0, br.cz + Math.sin(a) * 5.2, a)); }
    DG.g.add(new T.Mesh(M.merge(C, 0.05), M.matL), new T.Mesh(M.merge(CG, 0), M.matB));
    G.scene.add(DG.g);
    // where you may walk, where tesla towers may rise (the sanctum) and the grid centre
    const xs = DG.rooms.map((r) => [r.cx - r.w / 2, r.cx + r.w / 2]).flat(), zs = DG.rooms.map((r) => [r.cz - r.d / 2, r.cz + r.d / 2]).flat();
    DG.bounds = { x0: Math.min(...xs) - 1, x1: Math.max(...xs) + 1, z0: Math.min(...zs) - 1, z1: Math.max(...zs) + 1, solidShots: true, spots: [br.cx - 8, br.cx + 8, br.cz - 8, br.cz + 8] };
    DG.cx = (DG.bounds.x0 + DG.bounds.x1) / 2; DG.cz = (DG.bounds.z0 + DG.bounds.z1) / 2;
    // you come down by the far wall of the first chamber
    const r0 = DG.rooms[0], r1 = DG.rooms[1] || r0, ax = Math.sign(r0.gx - r1.gx), az = Math.sign(r0.gz - r1.gz);
    DG.start = [r0.cx + ax * (r0.w / 2 - 3), r0.cz + az * (r0.d / 2 - 3) + (ax || az ? 0 : 2)];
    if (blockedAt(DG.start[0], DG.start[1], 1)) DG.start = freeSpot(r0, 1.5, 3);
    DG.mods = mods;
  }
  function teardown() {
    if (DG.g) { G.scene.remove(DG.g); DG.g.traverse((o) => o.geometry && o.geometry.dispose()); DG.g = null; }
    for (const L of lights) L.intensity = 0;
    DG.walls = []; DG.torches = []; DG.colliders = []; DG.chests = [];
  }

  // ---------- monsters ----------
  // This dungeon's modifiers: rolled from monster_modifiers.json (never those marked "dungeon": false).
  function rollMods() {
    const pool = G.MODIFIERS.filter((m) => m.dungeon && m.weight > 0 && G.danger >= m.minStage), out = [];
    for (let n = G.dungeonModCount(G.danger); out.length < n && pool.length;) { const m = U.weighted(pool, (x) => x.weight); pool.splice(pool.indexOf(m), 1); out.push(m); }
    return out;
  }
  const NO_PACK = ['ritual', 'cauldron'];
  function packType() {
    for (let k = 0; k < 8; k++) { const t = G.spawner.pickType(); if (!NO_PACK.includes(G.ENEMIES[t].ai)) return t; }
    return Object.values(G.ENEMIES).find((e) => !e.boss && !NO_PACK.includes(e.ai) && e.id !== 'training_dummy').id;
  }
  // The Abyssal modifier every dungeon has: x hpMult health and x damageMult damage on every monster inside.
  DG.abyssal = () => ({ id: 'abyssal', name: `Abyssal ×${G.DUNGEON.hpMult}`, color: '#5a8cff', desc: `Every monster in the dungeon has ×${G.DUNGEON.hpMult} health and ×${G.DUNGEON.damageMult} damage.` });
  DG.allMods = () => [DG.abyssal()].concat(DG.mods);
  function abyss(e) {
    const D = G.DUNGEON;
    e.dmg *= D.damageMult; e.dmgMul = (e.dmgMul || 1) * D.damageMult; e.dungeon = true;
    return e;
  }
  // Packs: spread over the chambers (the boss's gets its share around the sanctum), each a dense crowd
  // laid out on a spiral around its centre, sleeping until you come near or hurt one of them.
  function spawnPacks() {
    const D = G.DUNGEON, n = DG.rooms.length, weight = DG.rooms.map((r, i) => (i === 0 || i === n - 1 ? 0.6 : 1)), tot = weight.reduce((a, b) => a + b, 0);
    DG.packs = D.packs; DG.cleared = 0; DG.awake = {}; DG.packList = [];
    let left = D.packs;
    DG.rooms.forEach((r, ri) => {
      const k = ri === n - 1 ? left : Math.min(left, Math.max(1, Math.round(D.packs * weight[ri] / tot)));
      left -= k;
      for (let j = 0; j < k; j++) {
        // never near where you come down; apart from the other packs and off the boss's sanctum, loosened only if it must be
        const far = (x, z) => Math.hypot(x - DG.start[0], z - DG.start[1]) > D.wakeRadius + 3;
        let p = null;
        for (const relax of [1, 0.75, 0.5, 0.3]) {
          for (let t = 0; t < 250 && !p; t++) {
            const x = r.cx + U.rnd(-1, 1) * (r.w / 2 - 5), z = r.cz + U.rnd(-1, 1) * (r.d / 2 - 5);
            if (!blockedAt(x, z, 3) && far(x, z) && DG.packList.every((q) => Math.hypot(q.x - x, q.z - z) > 12 * relax) && (ri !== n - 1 || Math.hypot(x - r.cx, z - r.cz) > 12)) p = [x, z];
          }
          if (p) break;
        }
        if (!p) p = freeSpot(r, 2, 4, far);
        DG.packList.push({ x: p[0], z: p[1], room: ri, alive: 0 });
      }
    });
    DG.packList.forEach((p, i) => {
      const r = DG.rooms[p.room], size = D.packSize[0] + Math.floor(Math.random() * (D.packSize[1] - D.packSize[0] + 1));
      let k = 0;
      for (let m = 0; m < size && k < size * 4; k++) {
        const rad = 0.8 * Math.sqrt(k + 0.5), a = k * 2.39996, x = p.x + Math.cos(a) * rad, z = p.z + Math.sin(a) * rad;
        if (!inRoom(r, x, z, -1) || blockedAt(x, z, 0.6)) continue;
        const e = abyss(ES.spawn(packType(), x, z, { elite: m < D.elites, mods: DG.mods, hpMul: D.hpMult }));
        Object.assign(e, { dormant: true, pack: i, room: p.room, yaw: Math.random() * 6 });
        m++; p.alive++;
      }
    });
  }
  function spawnBoss() {
    const D = G.DUNGEON, r = DG.rooms[DG.rooms.length - 1], type = U.weighted(Object.keys(D.bosses), (k) => D.bosses[k]);
    const e = abyss(ES.spawn(type, r.cx, r.cz, { mods: DG.mods, hpMul: D.bossHp * D.hpMult }));
    Object.assign(e, { dormant: true, pack: 'boss', room: r.i, state: 'walk', t: 1.5, walkAmt: 0, yaw: 0, rank: 1, name: e.def.name });
    DG.boss = e;
  }
  // Called by the monster update for a sleeping pack member: wake its whole pack when you come within
  // wakeRadius of it or hurt one of them.
  DG.wakes = function (e) {
    if (!DG.active) { e.dormant = false; return true; }
    const k = e.pack, p = DG.packList[k] || DG.boss;
    if (!DG.awake[k] && (e.hp < e.maxHp || Math.hypot(P.x - e.x, P.z - e.z) < 7 || (p && Math.hypot(P.x - p.x, P.z - p.z) < G.DUNGEON.wakeRadius))) wake(k);
    if (!DG.awake[k]) return false;
    e.dormant = false;
    return true;
  };
  function wake(k) {
    DG.awake[k] = true;
    if (k === 'boss') {
      const b = DG.boss;
      G.ui.bossBar(b); A.play('bossScream'); F.shake(0.5); F.flash('#3a0404', 0.4);
      G.ui.banner(b.name, DG.allMods().map((m) => m.name).join(' · '), '#ff4a3a');
    } else A.play('horn');
  }
  // Free chests (a blue glow), one per chamber: walk into one for an item a little better than the day's.
  function spawnChests() {
    const D = G.DUNGEON;
    DG.chests = [];
    for (const r of DG.rooms) for (let i = 0; i < D.chests; i++) {
      const [x, z] = freeSpot(r, 1.6, 2.5, (cx, cz) => DG.packList.every((p) => Math.hypot(p.x - cx, p.z - cz) > 9) && Math.hypot(cx - r.cx, cz - r.cz) > 8 && Math.hypot(cx - DG.start[0], cz - DG.start[1]) > 4);
      const m = M.chest();
      m.root.position.set(x, 0, z); m.root.rotation.y = Math.atan2(r.cx - x, r.cz - z);
      DG.g.add(m.root);
      const rg = new T.RingGeometry(1.2, 1.6, 32, 1); rg.rotateX(-Math.PI / 2);
      const ring = new T.Mesh(rg, mats.chestRing); ring.position.set(x, 0.05, z); DG.g.add(ring);
      DG.chests.push({ x, z, m, ring, state: 'idle', t: Math.random() * 6 });
    }
  }
  function updateChests(dt) {
    const D = G.DUNGEON;
    for (const c of DG.chests) {
      c.t += dt;
      if (c.state === 'idle') {
        const p = 0.6 + Math.sin(c.t * 3) * 0.3;
        c.m.glowMat.color.setRGB(0.2 * p, 0.55 * p, 1.2 * p);
        if (Math.random() < dt * 5) F.rise(c.x + U.rnd(-0.5, 0.5), 0.8, c.z + U.rnd(-0.5, 0.5), 0x5a9cff, 1, 0.3, 1.6, 0.12, 0.8);
        if (!P.dead && Math.hypot(P.x - c.x, P.z - c.z) < 1.8) {
          c.state = 'open'; c.t = 0;
          A.play('chestopen'); F.burst(c.x, 1, c.z, { n: 22, color: [0x5a9cff, 0xc8e0ff], glow: true, speed: 5, life: 0.7, size: 0.16, up: 1 });
          G.run.chests = (G.run.chests || 0) + 1;
        }
      } else if (c.state === 'open') {
        c.m.lid.rotation.x = -Math.min(1, c.t / 0.35) * 1.9;
        c.ring.visible = false;
        if (!c.dropped && c.t >= 0.3) {
          c.dropped = true;
          const a = Math.atan2(P.x - c.x, P.z - c.z);
          G.pickups.dropItem(c.x + Math.sin(a) * 1.3, c.z + Math.cos(a) * 1.3, G.combat.rollItem(D.chestMinRarity, D.chestLuck, D.chestLevelBonus));
        }
        c.m.glowMat.color.setRGB(0.2, 0.5, 1).multiplyScalar(Math.max(0.15, 1 - c.t / 2));
      }
    }
  }
  // A boss's pack call inside the dungeon: monsters crawl out of the dark around it.
  DG.summon = function (from, n) {
    const o = from || P, r = DG.rooms.find((q) => inRoom(q, o.x, o.z, 1)) || DG.rooms[DG.rooms.length - 1];
    for (let i = 0; i < Math.min(n, 12); i++) {
      const a = Math.random() * Math.PI * 2;
      const x = U.clamp(o.x + Math.cos(a) * 6, r.cx - r.w / 2 + 1, r.cx + r.w / 2 - 1), z = U.clamp(o.z + Math.sin(a) * 6, r.cz - r.d / 2 + 1, r.cz + r.d / 2 - 1);
      if (blockedAt(x, z, 0.5)) continue;
      abyss(ES.spawn(packType(), x, z, { mods: DG.mods, hpMul: G.DUNGEON.hpMult }));
      F.burst(x, 0.6, z, { n: 8, color: [0x3a2a2a, 0x7a2a1a], speed: 3, life: 0.6, size: 0.2 });
    }
  };

  // ---------- going in and coming out ----------
  DG.enter = function () {
    const en = DG.entrance;
    if (!en || DG.active || P.dead) return false;
    DG.from = { x: en.x, z: en.z };
    const mods = en.mods;
    removeEntrance(en); DG.entrance = null;
    // the farm waits: its monsters, their shots and boss mechanics are put aside
    DG.stash = { list: ES.list.splice(0), colliders: W.colliders };
    for (const e of DG.stash.list) if (e.model) e.model.root.visible = false;
    G.mech.clear(); G.enemyShots.clear(); G.combat.projs.length = 0; G.combat.puddles.length = 0;
    G.ui.bossBar(null);
    build(mods);
    W.colliders = DG.colliders; W.bounds = DG.bounds; W.dark = DARK;
    G.scene.fog.near = 6; G.scene.fog.far = 34;
    ES.gridCenter(DG.cx, DG.cz);
    P.x = DG.start[0]; P.z = DG.start[1]; P.vx = P.vz = P.kbx = P.kbz = 0; P.invuln = 1;
    W.updateCamera(0, P.x, P.z, true);
    spawnPacks(); spawnBoss(); spawnChests();
    DG.active = true; DG.won = false; DG.leaveT = 0; DG.lightT = 0; DG.countT = 0;
    A.play('dungeon'); F.flash('#000000', 0.7);
    G.tfx.onDungeon();   // Dungeon Delver
    G.ui.banner('The Dungeon', DG.allMods().map((m) => m.name).join(' · ') + ` · ${DG.packs} packs, then the boss`, '#b86cff');
    return true;
  };
  function leave() {
    // the dungeon's monsters go, the farm's come back
    for (const e of ES.list) if (e.model) { G.scene.remove(e.model.root); e.model.root.traverse((o) => o.geometry && o.geometry.dispose()); }
    ES.list.length = 0;
    for (const e of DG.stash.list) { if (e.model) e.model.root.visible = true; ES.list.push(e); }
    W.colliders = DG.stash.colliders; DG.stash = null;
    restoreWorld();
    G.mech.clear(); G.enemyShots.clear(); G.combat.projs.length = 0; G.combat.puddles.length = 0;
    teardown();
    DG.active = false;
    P.x = DG.from.x; P.z = DG.from.z + 1.5; P.vx = P.vz = P.kbx = P.kbz = 0; P.invuln = 2;
    W.updateCamera(0, P.x, P.z, true);
    carryLoot();
    const boss = ES.list.find((o) => o.boss && !o.dead);
    G.ui.bossBar(boss || null);
    F.flash('#fff4d0', 0.4); A.play('dungeon');
    G.ui.toast('You climb back out into the night', '#d8c8ff');
  }
  function restoreWorld() {
    W.bounds = W.farmBounds; W.dark = null;
    const m = G.map(); G.scene.fog.near = m.fog[0]; G.scene.fog.far = m.fog[1];
    ES.gridCenter(0, 0);
  }
  // Everything that dropped inside comes out with you: items around you, crystals and essence fly to you.
  function carryLoot() {
    const PK = G.pickups, ring = (i, n, r) => [P.x + Math.cos(i / Math.max(1, n) * Math.PI * 2) * r, P.z + Math.sin(i / Math.max(1, n) * Math.PI * 2) * r];
    const loot = PK.loot.filter((l) => inDungeon(l.z));
    loot.forEach((l, i) => { const [x, z] = ring(i, loot.length, 2.2 + (i % 2) * 0.8); l.x = x; l.z = z; l.g.position.set(x, 0, z); });
    for (const g of PK.gems.concat(PK.ess)) if (inDungeon(g.z)) { g.x = P.x + U.rnd(-3, 3); g.z = P.z + U.rnd(-3, 3); g.mag = true; }
    for (const m of PK.misc) if (inDungeon(m.z)) { m.x = P.x + U.rnd(-2, 2); m.z = P.z + U.rnd(-2, 2); m.mesh.position.set(m.x, 0.6, m.z); }
  }
  // The boss is dead: a trinket you don't own, items, essence and a free level; then out you go.
  function reward() {
    const D = G.DUNGEON, b = DG.boss, C = G.combat;
    G.run.dungeons = (G.run.dungeons || 0) + 1;
    for (let i = 0; i < D.items; i++) { const a = i / Math.max(1, D.items) * Math.PI * 2; G.pickups.dropItem(b.x + Math.cos(a) * 2.2, b.z + Math.sin(a) * 2.2, C.rollItem(D.itemMinRarity, D.itemLuck, D.itemLevelBonus)); }
    if (D.essence > 0) G.pickups.dropEssence(b.x, b.z, D.essence * (1 + G.danger * 0.5));
    G.pickups.magnetAll();
    if (D.levels > 0) G.progress.grantLevels(D.levels);   // a free level for clearing it (the boss gives no blessings)
    const id = G.trinkets.grant();
    if (id) { G.ui.newTrinket = id; G.ui.banner('Dungeon Cleared!', `${G.TRINKETS[id].name} is yours · carry it from the workbench`, '#ffe080'); A.play('holy'); }
    else G.ui.banner('Dungeon Cleared!', 'You already own every trinket', '#ffe080');
    F.flash('#ffe8b0', 0.4);
    DG.won = true; DG.leaveT = 4.5;
  }

  // ---------- the stairs on the map ----------
  DG.newDay = function () {
    const D = G.DUNGEON;
    DG.next = Math.random() < D.chance ? U.rnd(D.appearAt[0], D.appearAt[1]) : Infinity;
  };
  function spot(nearYou) {
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 120; i++) {
      const a = Math.random() * Math.PI * 2, r = U.rnd(6, 10);
      const x = nearYou ? P.x + Math.cos(a) * r : U.rnd(-30, 30), z = nearYou ? P.z + Math.sin(a) * r : U.rnd(-30, 30);
      if (!W.inBounds(x, z, -3) || W.blocked(x, z, 2.6)) continue;
      if (pass === 0 && !nearYou && Math.hypot(x - P.x, z - P.z) < 10) continue;
      if (W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
      if (G.chests.list.some((c) => Math.hypot(c.x - x, c.z - z) < 5)) continue;
      return [x, z];
    }
    return null;
  }
  // A stairway opens (force: right beside you, for the debug menu).
  DG.open = function (force) {
    if (DG.active || DG.entrance || (G.phase !== 'fight' && !force)) return null;
    const p = spot(!!force);
    if (!p) return null;
    initMats();
    const [x, z] = p, g = new T.Group();
    const add = (geo, mat, px, py, pz) => { const m = new T.Mesh(geo, mat); m.position.set(px, py, pz); g.add(m); return m; };
    add(new T.BoxGeometry(3, 0.12, 3.4), mats.pit, 0, 0.03, 0);
    for (let i = 0; i < 4; i++) add(new T.BoxGeometry(2.6, 0.18, 0.6), mats.stone, 0, 0.1 - i * 0.02, -1.2 + i * 0.75).scale.set(1, 1, 0.9);
    add(new T.BoxGeometry(3.8, 0.5, 0.5), mats.stone, 0, 0.25, -1.95); add(new T.BoxGeometry(3.8, 0.5, 0.5), mats.stone, 0, 0.25, 1.95);
    add(new T.BoxGeometry(0.5, 0.5, 4.4), mats.stone, -1.65, 0.25, 0); add(new T.BoxGeometry(0.5, 0.5, 4.4), mats.stone, 1.65, 0.25, 0);
    add(new T.BoxGeometry(0.6, 2.6, 0.6), mats.stone, -1.65, 1.3, -1.95); add(new T.BoxGeometry(0.6, 2.6, 0.6), mats.stone, 1.65, 1.3, -1.95);
    add(new T.BoxGeometry(4, 0.5, 0.7), mats.stone, 0, 2.75, -1.95);
    const flames = [add(new T.IcosahedronGeometry(0.22, 0), mats.flame, -1.65, 2.85, -1.95), add(new T.IcosahedronGeometry(0.22, 0), mats.flame, 1.65, 2.85, -1.95)];
    const rg = new T.RingGeometry(2.7, 3, 40, 1); rg.rotateX(-Math.PI / 2);
    const rune = add(rg, mats.rune, 0, 0.06, 0);
    g.position.set(x, -3, z); G.scene.add(g);
    const en = DG.entrance = { x, z, g, flames, rune, mods: rollMods(), t: G.DUNGEON.stay, age: 0 };
    F.dust(x, z, 16); F.shake(0.4); A.play('dungeon');
    G.ui.toast(`A dungeon opens: ${[DG.abyssal()].concat(en.mods).map((m) => m.name).join(', ')} · E at the stairs to go down`, '#b86cff');
    return en;
  };
  function removeEntrance(en) {
    G.scene.remove(en.g);
    en.g.traverse((o) => o.geometry && o.geometry.dispose());
  }
  DG.near = () => !!DG.entrance && !DG.active && DG.entrance.age > 0.8 && Math.hypot(P.x - DG.entrance.x, P.z - DG.entrance.z) < G.DUNGEON.pickupRadius;
  // E: go down the stairs when you stand at them. Returns true when it did.
  DG.use = function () { return DG.near() ? DG.enter() : false; };
  function updateEntrance(dt) {
    if (G.phase === 'fight' && G.dayT >= DG.next) { DG.next = Infinity; DG.open(); }
    const en = DG.entrance;
    if (!en) return;
    if (G.phase !== 'fight') { removeEntrance(en); DG.entrance = null; return; }
    en.age += dt; en.t -= dt;
    const k = Math.min(1, en.age / 0.9);
    en.g.position.y = -3 * (1 - k) * (1 - k);
    for (const f of en.flames) f.scale.setScalar(0.85 + Math.sin(en.age * 13 + f.position.x) * 0.15);
    en.rune.rotation.y += dt * 0.6; mats.rune.opacity = 0.45 + Math.sin(en.age * 3) * 0.2;
    if (Math.random() < dt * 6) F.rise(en.x + U.rnd(-1.2, 1.2), 0.2, en.z + U.rnd(-1.2, 1.2), 0xb86cff, 1, 0.3, 1.6, 0.14, 0.9);
    if (en.t <= 0) { G.ui.toast('The dungeon stairs crumble shut', '#a08060'); F.dust(en.x, en.z, 14); removeEntrance(en); DG.entrance = null; }
  }

  // ---------- per frame ----------
  DG.update = function (dt) {
    if (!DG.active) { updateEntrance(dt); return; }
    G.time += dt;   // the run's clock goes on; the day's clock waits outside
    const t = G.time;
    for (const tc of DG.torches) tc.flame.scale.setScalar(0.85 + Math.sin(t * 13 + tc.ph) * 0.12 + Math.sin(t * 29 + tc.ph * 2) * 0.06);
    if (DG.pent) { DG.pent.rotation.y += dt * 0.15; mats.pent.opacity = DG.won ? Math.max(0, mats.pent.opacity - dt) : 0.7 + Math.sin(t * 2.4) * 0.25; }
    // the torch lights follow the torches nearest to you
    if ((DG.lightT -= dt) <= 0) {
      DG.lightT = 0.25;
      const near = DG.torches.map((tc) => [Math.hypot(tc.x - P.x, tc.z - P.z), tc]).filter((a) => a[0] < 24).sort((a, b) => a[0] - b[0]);
      lights.forEach((L, i) => { const tc = near[i] && near[i][1]; L.userData.tc = tc; if (tc) L.position.set(tc.x, 2.2, tc.z); });
    }
    for (const L of lights) L.intensity = L.userData.tc ? 1.3 + Math.sin(t * 17 + L.userData.tc.ph) * 0.2 : 0;
    // walls between the camera and you turn see-through
    for (const w of DG.walls) {
      const occ = w.z1 > P.z - 0.2 && w.z0 < P.z + 4.5 && w.x1 > P.x - 3.5 && w.x0 < P.x + 3.5;
      if (occ !== w.faded) { w.faded = occ; w.mesh.material = occ ? mats.faded : mats.solid; }
    }
    updateChests(dt);
    // packs cleared
    if ((DG.countT -= dt) <= 0) {
      DG.countT = 0.25;
      const alive = {};
      for (const e of ES.list) if (!e.dead && e.dungeon && typeof e.pack === 'number') alive[e.pack] = (alive[e.pack] || 0) + 1;
      for (let i = 0; i < DG.packs; i++) if (DG.packList[i] && DG.packList[i].alive > 0 && !alive[i]) {
        DG.packList[i].alive = 0; DG.cleared++;
        G.ui.toast(DG.cleared < DG.packs ? `Pack cleared · ${DG.cleared} of ${DG.packs}` : 'Every pack is dead · the boss waits on its pentagram', '#d8c8ff');
      }
    }
    if (!DG.won && DG.boss && DG.boss.dead) reward();
    if (DG.won && (DG.leaveT -= dt) <= 0) leave();
  };
  // Where to go next: the nearest pack still alive, else the boss.
  DG.objective = function () {
    let best = null, bd = Infinity;
    for (const p of DG.packList || []) if (p.alive > 0) { const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < bd) { bd = d; best = p; } }
    if (best) return { x: best.x, z: best.z, label: 'PACK', room: DG.rooms[best.room], dist: bd };
    const b = DG.boss;
    return b && !b.dead ? { x: b.x, z: b.z, label: 'BOSS', room: DG.rooms[DG.rooms.length - 1], dist: Math.hypot(b.x - P.x, b.z - P.z) } : null;
  };
  DG.drawOverlay = function (c, dpr) {
    if (DG.active) {
      const o = DG.objective();
      if (o && o.dist > 14) F.pointer(c, dpr, o.x, o.z, o.label === 'BOSS' ? '#ff4a3a' : '#c8a8ff', o.label);
      for (const ch of DG.chests || []) if (ch.state === 'idle' && Math.hypot(ch.x - P.x, ch.z - P.z) < 30) F.pointer(c, dpr, ch.x, ch.z, '#7ab8ff', 'CHEST');
      return;
    }
    const en = DG.entrance;
    if (!en || G.darkness.hidden(en.x, en.z) || !F.pointer(c, dpr, en.x, en.z, '#b86cff', 'DUNGEON')) return;
    const s = F.project(en.x, 3.4, en.z);
    if (!s) return;
    const lines = [`${DG.near() ? 'E · ' : ''}Dungeon · collapses in ${Math.ceil(en.t)}s`, [DG.abyssal()].concat(en.mods).map((m) => m.name).join(' · ')];
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
    lines.forEach((t, i) => {
      const tw = c.measureText(t).width + 10 * dpr, y = s.y + i * 21 * dpr;
      c.fillStyle = 'rgba(10,7,6,.78)'; c.fillRect(s.x - tw / 2, y - 10 * dpr, tw, 20 * dpr);
      c.fillStyle = i ? '#d8b8ff' : '#b86cff'; c.fillText(t, s.x, y + dpr);
    });
  };
  // HUD lines while inside.
  DG.status = () => (DG.active ? { title: `DUNGEON · ${DG.cleared} / ${DG.packs} PACKS${DG.won ? ' · CLEARED' : ''}`, sub: DG.allMods().map((m) => m.name).join(' · ') + ' · The day waits outside' } : null);

  // A new run (or the title screen): out of any dungeon, the stairs gone.
  DG.reset = function () {
    if (DG.active) {
      for (const e of DG.stash.list) if (e.model) { G.scene.remove(e.model.root); e.model.root.traverse((o) => o.geometry && o.geometry.dispose()); }
      W.colliders = DG.stash.colliders; DG.stash = null;
      teardown(); restoreWorld();
    }
    if (DG.entrance) { removeEntrance(DG.entrance); DG.entrance = null; }
    DG.active = false; DG.next = Infinity; DG.won = false; DG.boss = null; DG.rooms = []; DG.packs = 0; DG.cleared = 0; DG.mods = []; DG.packList = []; DG.chests = [];
  };
})();
