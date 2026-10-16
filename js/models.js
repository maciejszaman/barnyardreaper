'use strict';
// Low-poly model library. Everything is built from primitives merged into flat-shaded,
// vertex-coloured geometry with a little per-face colour jitter for that hand-painted PS2 look.
(function () {
  const T = THREE, U = G.U;
  const M = G.M = {};
  M.matL = new T.MeshLambertMaterial({ vertexColors: true });
  M.matB = new T.MeshBasicMaterial({ vertexColors: true });
  // Instanced meshes get their own materials: in r128 a material can't be shared between
  // instanced meshes with and without per-instance colour.
  M.matLI = new T.MeshLambertMaterial({ vertexColors: true });
  M.matBI = new T.MeshBasicMaterial({ vertexColors: true });
  M.inst = function (geo, mat, cap) {
    const m = new T.InstancedMesh(geo, mat, cap), c = new T.Color(1, 1, 1);
    for (let i = 0; i < cap; i++) m.setColorAt(i, c);
    m.frustumCulled = false; m.count = 0;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    return m;
  };

  const box = (w, h, d) => new T.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, s = 8) => new T.CylinderGeometry(rt, rb, h, s);
  const cone = (r, h, s = 6) => new T.ConeGeometry(r, h, s);
  const sph = (r, w = 8, h = 6) => new T.SphereGeometry(r, w, h);
  const ico = (r, d = 0) => new T.IcosahedronGeometry(r, d);
  const oct = (r) => new T.OctahedronGeometry(r, 0);
  M.prim = { box, cyl, cone, sph, ico, oct };

  const _e = new T.Euler(), _q = new T.Quaternion(), _v = new T.Vector3(), _s = new T.Vector3();
  // A part: geometry + colour + transform (pos, euler rot, scale).
  M.p = function (geo, color, pos, rot, scl) {
    const m = new T.Matrix4();
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    _q.setFromEuler(_e);
    _v.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1);
    m.compose(_v, _q, _s);
    return { geo, color, m };
  };
  // A box stretched between two points.
  M.beam = function (a, b, t, color) {
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    const m = new T.Matrix4().compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new T.Vector3(1, 1, 1));
    return { geo: box(t, len, t), color, m };
  };
  // Re-place a list of parts with an extra transform.
  M.place = function (parts, x, y, z, ry = 0, s = 1) {
    const w = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, 0)), new T.Vector3(s, s, s));
    return parts.map((p) => ({ geo: p.geo, color: p.color, m: new T.Matrix4().multiplyMatrices(w, p.m) }));
  };
  M.merge = function (parts, jitter = 0.07, seed = 7) {
    const rnd = U.seeded(seed);
    let total = 0;
    const geos = parts.map((p) => {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      g.applyMatrix4(p.m);
      total += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), c = new T.Color();
    let o = 0;
    geos.forEach((g, i) => {
      pos.set(g.attributes.position.array, o * 3);
      c.set(parts[i].color);
      const n = g.attributes.position.count;
      for (let v = 0; v < n; v += 3) {
        const j = 1 + (rnd() - 0.5) * jitter * 2;
        for (let k = 0; k < 3; k++) { const id = (o + v + k) * 3; col[id] = c.r * j; col[id + 1] = c.g * j; col[id + 2] = c.b * j; }
      }
      o += n;
      g.dispose();
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeVertexNormals();
    out.computeBoundingSphere();
    return out;
  };
  M.mesh = (parts, glow, jitter) => new T.Mesh(M.merge(parts, jitter), glow ? M.matB : M.matL);

  // Rock: icosahedron with position-hashed displacement so shared vertices stay welded.
  M.rockGeo = function (r, seed, detail = 1, rough = 0.3) {
    const g = ico(r, detail), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const h = Math.sin(x * 12.9898 / r + y * 78.233 / r + z * 37.719 / r + seed * 4.1) * 43758.5453;
      const k = 1 + ((h - Math.floor(h)) - 0.5) * rough;
      p.setXYZ(i, x * k, y * k, z * k);
    }
    return g;
  };
  const rk = (r, seed, col, pos, scl, detail = 0) => M.p(M.rockGeo(r, seed, detail, 0.32), col, pos, [seed * 0.7, seed * 1.3, 0], scl);

  const C = M.C = {
    fur: 0xe08a3c, furD: 0xa95a22, cream: 0xf3eadb, pink: 0xe8919c, denim: 0x3d5f9a, denimD: 0x2a4372,
    plaid: 0xb8352a, plaidD: 0x6e1f17, boot: 0x5a3a22, gold: 0xe8c040, straw: 0xe8c25a, strawD: 0xbf9a3c,
    wood: 0x8a5a2b, woodD: 0x5a3a1c, steel: 0xc6ced6, steelD: 0x5d6670, black: 0x16120f, eye: 0xb8f06a,
  };

  // ---------- weapons (grip at origin; blades along +y, barrels along +z) ----------
  function scytheParts() {
    const P = [
      M.p(cyl(0.035, 0.04, 2.3, 6), C.wood, [0, 0.8, 0]),
      M.p(cyl(0.048, 0.048, 0.12, 6), C.woodD, [0, 0.05, 0]),
      M.p(cyl(0.048, 0.048, 0.12, 6), C.woodD, [0, 0.6, 0]),
      M.p(box(0.11, 0.16, 0.1), C.steelD, [0, 1.95, 0]),
    ];
    const pts = [[0, 1.95], [0.32, 2.03], [0.64, 1.99], [0.92, 1.87], [1.14, 1.67], [1.27, 1.44]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1), w = 0.22 - i * 0.035;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, nx = -Math.sin(a), ny = Math.cos(a);
      P.push(M.p(box(L + 0.03, w, 0.03), C.steel, [mx, my, 0], [0, 0, a]));
      P.push(M.p(box(L + 0.02, 0.045, 0.036), 0xf4f8ff, [mx - nx * w / 2, my - ny * w / 2, 0], [0, 0, a]));
    }
    return P;
  }
  M.weapon = function (type) {
    const g = new T.Group();
    if (type === 'scythe') g.add(M.mesh(scytheParts()));
    else if (type === 'sword') {
      g.add(M.mesh([
        M.p(box(0.13, 1.25, 0.035), C.steel, [0, 0.95, 0]), M.p(box(0.04, 1.2, 0.045), 0xf4f8ff, [0, 0.95, 0]),
        M.p(cone(0.066, 0.24, 4), C.steel, [0, 1.69, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]),
        M.p(box(0.52, 0.07, 0.1), C.gold, [0, 0.3, 0]), M.p(box(0.07, 0.32, 0.07), C.woodD, [0, 0.1, 0]),
        M.p(box(0.11, 0.11, 0.11), C.gold, [0, -0.09, 0]),
      ]));
    } else if (type === 'shotgun') {
      g.add(M.mesh([
        M.p(cyl(0.045, 0.045, 1.0, 6), C.steelD, [0.046, 0.08, 0.62], [Math.PI / 2, 0, 0]),
        M.p(cyl(0.045, 0.045, 1.0, 6), C.steelD, [-0.046, 0.08, 0.62], [Math.PI / 2, 0, 0]),
        M.p(box(0.17, 0.13, 0.3), C.steelD, [0, 0.06, 0.05]), M.p(box(0.13, 0.09, 0.45), C.wood, [0, 0, 0.42]),
        M.p(box(0.12, 0.18, 0.56), C.wood, [0, -0.05, -0.36], [-0.14, 0, 0]), M.p(box(0.03, 0.08, 0.06), C.black, [0, -0.05, 0.02]),
      ]));
    } else if (type === 'revolver') {
      const m = M.mesh([
        M.p(cyl(0.035, 0.035, 0.42, 6), C.steelD, [0, 0.1, 0.32], [Math.PI / 2, 0, 0]),
        M.p(cyl(0.075, 0.075, 0.14, 7), C.steel, [0, 0.08, 0.06], [Math.PI / 2, 0, 0]),
        M.p(box(0.07, 0.13, 0.24), C.steelD, [0, 0.08, 0.02]), M.p(box(0.08, 0.22, 0.1), C.wood, [0, -0.08, -0.1], [0.35, 0, 0]),
        M.p(box(0.025, 0.06, 0.02), C.steel, [0, 0.17, -0.07]),
      ]);
      m.scale.setScalar(1.5); g.add(m);
    } else if (type === 'flask') {
      g.add(M.mesh([M.p(cyl(0.05, 0.06, 0.16, 6), 0xcfe8d0, [0, 0.38, 0]), M.p(cyl(0.065, 0.06, 0.08, 6), C.wood, [0, 0.5, 0]), M.p(box(0.18, 0.1, 0.02), 0xe8dcc0, [0, 0.17, 0.165])]));
      g.add(M.mesh([M.p(sph(0.17, 7, 5), 0x7de048, [0, 0.17, 0])], true));
    } else if (type === 'flamethrower') {
      g.add(M.mesh([
        M.p(cyl(0.05, 0.05, 0.9, 6), C.steelD, [0, 0.06, 0.55], [Math.PI / 2, 0, 0]), M.p(cyl(0.085, 0.06, 0.16, 6), C.steel, [0, 0.06, 1.02], [Math.PI / 2, 0, 0]),
        M.p(box(0.16, 0.16, 0.42), 0x4a5a3a, [0, 0.02, 0.1]), M.p(cyl(0.11, 0.11, 0.5, 8), 0x5aaa3a, [0, -0.16, 0.25], [Math.PI / 2, 0, 0]),
        M.p(box(0.08, 0.22, 0.1), C.black, [0, -0.1, -0.05], [0.3, 0, 0]), M.p(box(0.1, 0.12, 0.3), C.steelD, [0, 0, -0.3]),
      ]));
      g.add(M.mesh([M.p(sph(0.05, 5, 4), 0x9aff6a, [0, 0.06, 1.12]), M.p(box(0.04, 0.12, 0.3), 0x9aff6a, [0.12, -0.16, 0.25])], true));
    } else if (type === 'mp5') {
      g.add(M.mesh([
        M.p(box(0.08, 0.14, 0.62), 0x2a2d33, [0, 0.07, 0.2]), M.p(cyl(0.03, 0.03, 0.3, 6), 0x1a1c20, [0, 0.09, 0.62], [Math.PI / 2, 0, 0]),
        M.p(cyl(0.045, 0.045, 0.2, 6), 0x3a3d43, [0, 0.09, 0.46], [Math.PI / 2, 0, 0]), M.p(box(0.06, 0.26, 0.09), 0x1a1c20, [0, -0.1, 0.32], [0.15, 0, 0]),
        M.p(box(0.07, 0.18, 0.08), 0x1a1c20, [0, -0.07, 0.02], [0.3, 0, 0]), M.p(box(0.05, 0.08, 0.34), 0x2a2d33, [0, 0.04, -0.25]),
        M.p(box(0.03, 0.06, 0.03), C.steel, [0, 0.17, 0.4]), M.p(box(0.03, 0.05, 0.03), C.steel, [0, 0.16, -0.02]),
      ]));
    } else if (type === 'blowgun') {
      // a long cane tube with woven bands and feathers hanging off the mouthpiece
      g.add(M.mesh([
        M.p(cyl(0.035, 0.04, 1.25, 6), 0x9a7a4a, [0, 0.06, 0.45], [Math.PI / 2, 0, 0]), M.p(cyl(0.05, 0.05, 0.12, 6), 0x5a3a1c, [0, 0.06, -0.15], [Math.PI / 2, 0, 0]),
        ...[0.15, 0.45, 0.8].map((z) => M.p(cyl(0.045, 0.045, 0.05, 6), 0xb8352a, [0, 0.06, z], [Math.PI / 2, 0, 0])),
        M.beam([0, 0.02, -0.1], [0.03, -0.22, -0.12], 0.012, 0x3a2a1a), M.p(box(0.05, 0.16, 0.02), 0x2a8aca, [0.03, -0.3, -0.12], [0, 0, 0.2]),
        M.beam([0, 0.02, -0.1], [-0.04, -0.18, -0.08], 0.012, 0x3a2a1a), M.p(box(0.05, 0.14, 0.02), 0xf0d040, [-0.04, -0.25, -0.08], [0, 0, -0.2]),
      ]));
      g.add(M.mesh([M.p(box(0.02, 0.02, 0.1), 0x8aef4a, [0, 0.06, 1.1])], true));
    } else if (type === 'obsidian') {
      // volcanic glass: a jagged black blade with a purple glow along its edges
      g.add(M.mesh([
        M.p(box(0.16, 1.2, 0.04), 0x14101a, [0, 0.92, 0]), M.p(cone(0.09, 0.32, 4), 0x14101a, [0, 1.68, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]),
        ...[0.5, 0.8, 1.1, 1.35].map((y, i) => M.p(cone(0.05, 0.14, 3), 0x221a2a, [(i % 2 ? 1 : -1) * 0.1, y, 0], [0, 0, (i % 2 ? -1 : 1) * 1.3])),
        M.p(box(0.4, 0.08, 0.1), 0xe8e0c8, [0, 0.3, 0]), M.p(box(0.07, 0.32, 0.07), 0x3a2a1a, [0, 0.1, 0]), M.p(sph(0.07, 5, 4), 0xe8e0c8, [0, -0.08, 0]),
      ]));
      g.add(M.mesh([M.p(box(0.025, 1.15, 0.05), 0xc08aff, [0.075, 0.92, 0]), M.p(box(0.025, 1.15, 0.05), 0xc08aff, [-0.075, 0.92, 0])], true));
    } else if (type === 'dagger') {
      // a short serrated blade, teeth down one edge
      const P = [M.p(box(0.1, 0.62, 0.03), C.steel, [0, 0.52, 0]), M.p(cone(0.05, 0.16, 4), C.steel, [0, 0.9, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]),
        M.p(box(0.26, 0.05, 0.08), C.steelD, [0, 0.2, 0]), M.p(box(0.06, 0.22, 0.06), 0x5a3a1c, [0, 0.08, 0]), M.p(box(0.08, 0.06, 0.08), C.steelD, [0, -0.05, 0])];
      for (let i = 0; i < 6; i++) P.push(M.p(cone(0.025, 0.06, 3), C.steel, [-0.06, 0.28 + i * 0.09, 0], [0, 0, Math.PI / 2]));
      g.add(M.mesh(P));
    } else if (type === 'fan') {
      // five throwing knives fanned out between the fingers
      const P = [];
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32, k = [M.p(box(0.07, 0.38, 0.02), C.steel, [0, 0.38, 0]), M.p(cone(0.035, 0.1, 4), C.steel, [0, 0.62, 0], [0, Math.PI / 4, 0], [1, 1, 0.35]),
          M.p(box(0.05, 0.16, 0.04), [0xb8352a, 0x2a2a30][i % 2], [0, 0.1, 0]), M.p(new T.TorusGeometry(0.04, 0.012, 3, 8), C.steelD, [0, -0.01, 0])];
        const m = new T.Matrix4().makeRotationZ(a);
        for (const p of k) P.push({ geo: p.geo, color: p.color, m: m.clone().multiply(p.m) });
      }
      g.add(M.mesh(P));
    } else if (type === 'tome') {
      // an old spellbook held open, its pages burning with a sigil, a little flame dancing over it
      const lea = 0x6a1a14, spine = 0x3a0e0a, page = 0xe8dcc0, P = [M.p(box(0.06, 0.06, 0.52), spine, [0, 0.03, 0.2])];
      for (const sx of [1, -1]) {
        P.push(M.p(box(0.36, 0.04, 0.5), lea, [sx * 0.19, 0.04, 0.2], [0, 0, sx * 0.18]), M.p(box(0.33, 0.06, 0.46), page, [sx * 0.17, 0.085, 0.2], [0, 0, sx * 0.18]),
          M.p(box(0.07, 0.05, 0.07), C.gold, [sx * 0.35, 0.08, 0.43]), M.p(box(0.07, 0.05, 0.07), C.gold, [sx * 0.35, 0.08, -0.03]),
          ...[0.08, 0.14, 0.3, 0.36].map((z) => M.p(box(0.2, 0.012, 0.018), 0x5a1a10, [sx * 0.17, 0.12, z], [0, 0, sx * 0.18])));
      }
      g.add(M.mesh(P));
      g.add(M.mesh([M.p(box(0.13, 0.012, 0.13), 0xff8a2a, [0.17, 0.122, 0.22], [0, Math.PI / 4, 0.18]), M.p(box(0.13, 0.012, 0.13), 0xff8a2a, [-0.17, 0.122, 0.22], [0, Math.PI / 4, -0.18]),
        M.p(cone(0.08, 0.24, 5), 0xff7a1a, [0, 0.36, 0.22]), M.p(cone(0.045, 0.16, 5), 0xffe080, [0, 0.33, 0.22])], true));
    } else if (type === 'screamskull') {
      // a skull on a bone handle, its jaw torn open in a scream, violet light pouring out of its eyes and mouth
      const bone = 0xe0d8c0, boneD = 0xb0a890, P = [M.p(cyl(0.03, 0.035, 0.34, 6), bone, [0, 0.08, 0]), M.p(sph(0.05, 6, 4), bone, [0, -0.1, 0]),
        M.p(cyl(0.05, 0.05, 0.04, 7), boneD, [0, 0.2, 0]), M.p(cyl(0.045, 0.045, 0.04, 7), boneD, [0, 0.25, 0]),
        M.p(sph(0.17, 8, 6), bone, [0, 0.44, 0], 0, [1, 1.05, 1.1]), M.p(box(0.22, 0.08, 0.16), bone, [0, 0.33, 0.07]),
        M.p(box(0.07, 0.06, 0.03), 0x0a0408, [0.065, 0.45, 0.17]), M.p(box(0.07, 0.06, 0.03), 0x0a0408, [-0.065, 0.45, 0.17]), M.p(cone(0.025, 0.05, 3), 0x0a0408, [0, 0.39, 0.18], [Math.PI, 0, 0]),
        M.p(box(0.2, 0.05, 0.15), bone, [0, 0.2, 0.09], [0.55, 0, 0]),
        ...[-0.06, -0.02, 0.02, 0.06].flatMap((x) => [M.p(cone(0.014, 0.04, 3), bone, [x, 0.3, 0.15], [Math.PI, 0, 0]), M.p(cone(0.014, 0.04, 3), bone, [x, 0.23, 0.16])])];
      g.add(M.mesh(P));
      g.add(M.mesh([M.p(box(0.04, 0.03, 0.02), 0xd8a0ff, [0.065, 0.45, 0.18]), M.p(box(0.04, 0.03, 0.02), 0xd8a0ff, [-0.065, 0.45, 0.18]), M.p(sph(0.06, 6, 4), 0xc080ff, [0, 0.27, 0.12], 0, [1.2, 1, 0.5]),
        M.p(new T.TorusGeometry(0.1, 0.012, 3, 12), 0xb86cff, [0, 0.27, 0.26]), M.p(new T.TorusGeometry(0.16, 0.012, 3, 14), 0x8a4ac8, [0, 0.27, 0.36])], true));
    }
    return g;
  };

  // ---------- gear ----------
  M.hatParts = function (kind) {
    if (kind === 'cap') return [
      M.p(new T.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x2e5fa8, [0, 0, 0], 0, [1, 0.85, 1]),
      M.p(box(0.36, 0.03, 0.3), 0x24497f, [0, 0.02, 0.36]), M.p(box(0.3, 0.18, 0.04), 0xf0ebe0, [0, 0.12, 0.26], [-0.45, 0, 0]),
    ];
    if (kind === 'cowboy') return [
      M.p(cyl(0.55, 0.55, 0.04, 10), 0x7a5230), M.p(box(0.3, 0.04, 0.9), 0x7a5230, [0.42, 0.08, 0], [0, 0, 0.5]),
      M.p(box(0.3, 0.04, 0.9), 0x7a5230, [-0.42, 0.08, 0], [0, 0, -0.5]), M.p(cyl(0.2, 0.25, 0.32, 8), 0x8a6038, [0, 0.17, 0]),
      M.p(cyl(0.255, 0.255, 0.06, 8), 0x2a1a10, [0, 0.05, 0]),
    ];
    if (kind === 'antenna') return [
      M.p(cyl(0.3, 0.3, 0.07, 10), 0xc6ced6, [0, 0.03, 0]), M.beam([0.14, 0.05, 0], [0.26, 0.5, 0.05], 0.03, 0xc6ced6), M.beam([-0.14, 0.05, 0], [-0.26, 0.5, 0.05], 0.03, 0xc6ced6),
      M.p(sph(0.08, 6, 4), 0x7dff6a, [0.27, 0.54, 0.05]), M.p(sph(0.08, 6, 4), 0x7dff6a, [-0.27, 0.54, 0.05]),
    ];
    if (kind === 'shamanmask') {
      // a carved wooden mask over the face, crowned with feathers (sits in front of the eyes)
      const P = [M.p(box(0.4, 0.46, 0.06), 0x8a5a2b, [0, -0.17, 0.34]), M.p(box(0.08, 0.08, 0.03), C.black, [0.09, -0.12, 0.38]), M.p(box(0.08, 0.08, 0.03), C.black, [-0.09, -0.12, 0.38]),
        M.p(box(0.26, 0.05, 0.03), 0xe8e0c8, [0, -0.3, 0.38]), M.p(box(0.05, 0.12, 0.03), 0xd83a2a, [0.16, -0.22, 0.38]), M.p(box(0.05, 0.12, 0.03), 0xd83a2a, [-0.16, -0.22, 0.38]),
        M.p(box(0.08, 0.14, 0.06), 0x6a4020, [0, -0.2, 0.39]), M.p(box(0.42, 0.06, 0.4), 0x5a3a1c, [0, 0.05, 0.12])];
      [-0.18, -0.06, 0.06, 0.18].forEach((x, i) => P.push(M.p(box(0.06, 0.3, 0.02), [0xd83a2a, 0xf0d040, 0x2a8aca, 0xb86cff][i], [x, 0.22, 0.25], [-0.25, 0, x * 1.2])));
      return P;
    }
    if (kind === 'bearhood') return [
      M.p(new T.SphereGeometry(0.34, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0x6a4a2a, [0, -0.02, 0], 0, [1, 0.9, 1.1]), M.p(box(0.3, 0.16, 0.28), 0x6a4a2a, [0, 0.02, 0.3]),
      M.p(box(0.16, 0.1, 0.12), 0x4a3220, [0, 0.0, 0.46]), M.p(box(0.06, 0.05, 0.04), C.black, [0, 0.03, 0.53]),
      M.p(sph(0.09, 5, 4), 0x6a4a2a, [0.22, 0.25, 0.02]), M.p(sph(0.09, 5, 4), 0x6a4a2a, [-0.22, 0.25, 0.02]),
      M.p(box(0.05, 0.05, 0.03), C.black, [0.09, 0.1, 0.42]), M.p(box(0.05, 0.05, 0.03), C.black, [-0.09, 0.1, 0.42]),
      ...[-0.12, 0, 0.12].map((x) => M.p(cone(0.025, 0.08, 3), 0xe8e0c8, [x, -0.06, 0.45], [Math.PI, 0, 0])),
    ];
    if (kind === 'flayedhood') {
      // a hood of flayed skin stitched together, and a sack mask over the face with blood running from its eyes
      const skin = 0xc8908a, skinD = 0x9a5a58, stitch = 0x2a0a0a, sack = 0xb89878, blood = 0x8a0a0a;
      return [
        M.p(new T.SphereGeometry(0.35, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), skin, [0, -0.02, -0.02], 0, [1, 0.95, 1.1]), M.p(box(0.5, 0.42, 0.12), skinD, [0, -0.2, -0.3]),
        M.p(box(0.4, 0.44, 0.06), sack, [0, -0.17, 0.34]), M.p(box(0.09, 0.07, 0.03), 0x0a0404, [0.09, -0.12, 0.38]), M.p(box(0.09, 0.07, 0.03), 0x0a0404, [-0.09, -0.12, 0.38]),
        M.p(box(0.04, 0.16, 0.025), blood, [0.09, -0.22, 0.38]), M.p(box(0.04, 0.11, 0.025), blood, [-0.09, -0.2, 0.38]),
        M.p(box(0.22, 0.025, 0.025), stitch, [0, -0.3, 0.38]), ...[-0.08, -0.03, 0.02, 0.07].map((x) => M.p(box(0.012, 0.06, 0.03), stitch, [x, -0.3, 0.385])),
        M.p(box(0.02, 0.02, 0.32), stitch, [0, 0.31, -0.02]), ...[-0.12, -0.04, 0.04, 0.12].map((z) => M.p(box(0.08, 0.025, 0.02), stitch, [0, 0.31, z])),
        M.p(box(0.2, 0.02, 0.02), stitch, [0.2, 0.18, 0.12], [0, 0.6, 0.6]), M.p(box(0.2, 0.02, 0.02), stitch, [-0.2, 0.18, 0.12], [0, -0.6, -0.6]),
      ];
    }
    if (kind === 'tentaclecrown') {
      // a black circlet with tentacles curling up out of it, and an eye staring out of the front
      const band = 0x1a1024, tent = 0x4a1a62, tentD = 0x2e0e40, P = [M.p(new T.TorusGeometry(0.3, 0.05, 4, 14), band, [0, 0.03, 0], [Math.PI / 2, 0, 0])];
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2 + 0.6, x = Math.sin(a) * 0.3, z = Math.cos(a) * 0.3, h = 0.28 + (i % 3) * 0.1;
        P.push(M.beam([x, 0.03, z], [x * 1.18, 0.03 + h * 0.5, z * 1.18], 0.07, i % 2 ? tent : tentD), M.beam([x * 1.18, 0.03 + h * 0.5, z * 1.18], [x * 1.08, 0.03 + h * 0.9, z * 1.08], 0.05, tent),
          M.beam([x * 1.08, 0.03 + h * 0.9, z * 1.08], [x * 0.78, 0.03 + h, z * 0.78], 0.03, tentD));
      }
      P.push(M.p(sph(0.08, 7, 5), 0xe8dcd0, [0, 0.07, 0.33]), M.p(cyl(0.045, 0.045, 0.02, 10), 0xb86cff, [0, 0.07, 0.4], [Math.PI / 2, 0, 0]), M.p(box(0.02, 0.06, 0.02), 0x050208, [0, 0.07, 0.41]));
      return P;
    }
    if (kind === 'dome') {
      const P = [M.p(cyl(0.38, 0.4, 0.1, 12), 0xc6ced6, [0, -0.02, 0]), M.p(cyl(0.05, 0.05, 0.2, 5), C.steelD, [0, 0.52, 0]), M.p(sph(0.06, 6, 4), 0xff4a4a, [0, 0.64, 0])];
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI; P.push(M.p(new T.TorusGeometry(0.37, 0.025, 3, 14, Math.PI), 0x9aa8b4, [0, 0.02, 0], [0, a, 0])); }
      return P;
    }
    if (kind === 'none') return [];   // bare-headed (the goat's horns)
    return [M.p(cyl(0.5, 0.5, 0.04, 10), C.straw), M.p(cyl(0.24, 0.28, 0.24, 9), C.strawD, [0, 0.13, 0]), M.p(cyl(0.285, 0.285, 0.07, 9), C.plaid, [0, 0.05, 0])];
  };
  // The eldritch sets' body armor, boots and charms (Bloodbound and Abyssal): { parts, glow, glass }.
  const GEAR_EXTRA = {
    // a heavy leather apron soaked in blood, over a dark shirt, meat hooks hanging from its belt
    butcherapron: () => {
      const lea = 0x6a4a3a, leaD = 0x4a3024, blood = 0x7a0a0a;
      return { parts: [M.p(box(0.56, 0.55, 0.3), 0x2a2220, [0, 0.3, -0.06]), M.p(box(0.18, 0.38, 0.2), 0x2a2220, [0.38, 0.38, -0.06], [0, 0, -0.3]), M.p(box(0.18, 0.38, 0.2), 0x2a2220, [-0.38, 0.38, -0.06], [0, 0, 0.3]),
        M.p(box(0.6, 0.62, 0.12), lea, [0, 0.26, 0.12]), M.p(box(0.3, 0.2, 0.1), lea, [0, 0.66, 0.11]),
        M.p(box(0.05, 0.3, 0.04), leaD, [0.14, 0.82, 0.06], [0.3, 0, -0.35]), M.p(box(0.05, 0.3, 0.04), leaD, [-0.14, 0.82, 0.06], [0.3, 0, 0.35]), M.p(box(0.66, 0.06, 0.16), leaD, [0, 0.5, 0.12]),
        M.p(box(0.3, 0.26, 0.13), blood, [0.06, 0.22, 0.125]), M.p(box(0.16, 0.18, 0.13), blood, [-0.17, 0.4, 0.125]), M.p(box(0.08, 0.22, 0.13), blood, [-0.1, 0.02, 0.125]), M.p(box(0.06, 0.12, 0.13), blood, [0.2, 0.0, 0.125]),
        ...[0.22, -0.22].flatMap((x) => [M.beam([x, 0.47, 0.2], [x, 0.3, 0.24], 0.025, 0x9aa3ab), M.p(new T.TorusGeometry(0.05, 0.015, 3, 8, Math.PI), 0x9aa3ab, [x + 0.05, 0.3, 0.24], [0, 0, Math.PI])])] };
    },
    // a cloak of starless black, its hem coming apart into tentacles, violet runes glowing on it
    voidmantle: () => {
      const blk = 0x14101c, blkD = 0x0a0810, P = [M.p(cyl(0.22, 0.42, 0.75, 8), blk, [0, 0.38, 0]), M.p(cyl(0.26, 0.24, 0.12, 8), blkD, [0, 0.78, 0]),
        M.p(sph(0.2, 7, 5), blk, [0, 0.82, -0.12], 0, [1.1, 0.8, 1]), M.p(new T.TorusGeometry(0.25, 0.03, 4, 12), 0x8a3ab8, [0, 0.74, 0], [Math.PI / 2, 0, 0])];
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; P.push(M.p(cone(0.06, 0.32, 4), i % 2 ? blkD : 0x2a1a3a, [Math.sin(a) * 0.38, -0.08, Math.cos(a) * 0.38], [Math.PI + Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3])); }
      return { parts: P, glow: [0.2, 0.42, 0.62].map((y, i) => M.p(box(0.08, 0.08, 0.02), 0xc080ff, [(i - 1) * 0.08, y, 0.435 - y * 0.27], [0, 0, Math.PI / 4])) };
    },
    // leather boots soaked to the ankle, blood still running down them
    bloodboots: (it) => {
      const c = it.color || 0x4a2a22, P = [];
      for (const x of [-0.17, 0.17]) P.push(M.p(box(0.2, 0.42, 0.22), c, [x, 0.3, 0]), M.p(box(0.22, 0.14, 0.38), 0x6a0a0a, [x, 0.07, 0.08]), M.p(box(0.215, 0.16, 0.225), 0x7a0a0a, [x, 0.18, 0]),
        M.p(box(0.23, 0.05, 0.4), 0x1a0806, [x, 0.01, 0.08]), M.p(box(0.05, 0.12, 0.03), 0x8a0a0a, [x + 0.04, 0.3, 0.115]), M.p(box(0.04, 0.08, 0.03), 0x8a0a0a, [x - 0.05, 0.34, 0.115]),
        M.p(box(0.22, 0.04, 0.24), 0x9aa3ab, [x, 0.48, 0]));
      return { parts: P };
    },
    // black boots laced with little tentacles, walking on violet light
    voidtreads: (it) => {
      const c = it.color || 0x1c1426, P = [], GL = [];
      for (const x of [-0.18, 0.18]) {
        P.push(M.p(box(0.22, 0.42, 0.24), c, [x, 0.31, 0]), M.p(box(0.24, 0.16, 0.4), c, [x, 0.08, 0.08]));
        for (let i = 0; i < 3; i++) P.push(M.beam([x, 0.12 + i * 0.12, 0.13], [x + (i % 2 ? 0.12 : -0.12), 0.06 + i * 0.12, 0.2], 0.03, 0x4a1a62));
        GL.push(M.p(box(0.25, 0.04, 0.42), 0xb86cff, [x, 0.0, 0.08]), M.p(box(0.04, 0.04, 0.03), 0xd8a0ff, [x, 0.4, 0.125]));
      }
      return { parts: P, glow: GL };
    },
    // a glass jar with a heart floating in it, still beating
    heartjar: () => ({
      parts: [M.p(cyl(0.2, 0.2, 0.04, 10), 0x5a3a1c, [0, 0.02, 0]), M.p(cyl(0.16, 0.18, 0.08, 10), 0x8a6a40, [0, 0.62, 0]),
        M.p(sph(0.11, 7, 5), 0x9a0a14, [-0.04, 0.3, 0]), M.p(sph(0.1, 7, 5), 0xb81a20, [0.05, 0.32, 0.02]), M.p(cone(0.12, 0.16, 6), 0x9a0a14, [0, 0.2, 0], [Math.PI, 0, 0]),
        M.p(cyl(0.03, 0.035, 0.14, 5), 0xc84a4a, [0.04, 0.46, 0], [0, 0, -0.3]), M.p(cyl(0.025, 0.03, 0.12, 5), 0x4a3aa8, [-0.05, 0.45, 0], [0, 0, 0.3])],
      glass: [M.p(new T.CylinderGeometry(0.19, 0.19, 0.56, 10, 1, true), 0xc8e8e0, [0, 0.31, 0])],
    }),
    // an eye from the deep, held in a setting of black tentacles
    voideye: () => {
      const P = [M.p(new T.TorusGeometry(0.24, 0.05, 4, 14), 0x1a1024, [0, 0.3, 0]), M.p(new T.TorusGeometry(0.06, 0.02, 4, 8), 0x1a1024, [0, 0.62, 0])];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P.push(M.beam([Math.cos(a) * 0.24, 0.3 + Math.sin(a) * 0.24, 0], [Math.cos(a) * 0.38, 0.3 + Math.sin(a) * 0.38, -0.08], 0.04, 0x3a1450)); }
      P.push(M.p(sph(0.2, 10, 8), 0xe8dcd0, [0, 0.3, 0]), M.beam([0.08, 0.38, 0.17], [0.15, 0.42, 0.08], 0.015, 0xa0201a), M.beam([-0.06, 0.22, 0.18], [-0.15, 0.2, 0.08], 0.015, 0xa0201a));
      return { parts: P, glow: [M.p(cyl(0.1, 0.1, 0.02, 12), 0xb86cff, [0, 0.3, 0.195], [Math.PI / 2, 0, 0]), M.p(box(0.03, 0.12, 0.02), 0x050208, [0, 0.3, 0.21])] };
    },
  };
  M.itemModel = function (it) {
    if (it.slot === 'weapon') return M.weapon(it.model);
    const g = new T.Group();
    if (it.slot === 'hat') g.add(M.mesh(M.hatParts(it.model)));
    else if (GEAR_EXTRA[it.model]) {
      const m = GEAR_EXTRA[it.model](it);
      g.add(M.mesh(m.parts));
      if (m.glow) g.add(M.mesh(m.glow, true));
      if (m.glass) g.add(new T.Mesh(M.merge(m.glass, 0), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false })));
    }
    else if (it.slot === 'body' && it.model !== 'tiki' && it.model !== 'bearpelt') {
      const c = it.color || C.denim;
      g.add(M.mesh([M.p(box(0.6, 0.55, 0.36), c, [0, 0.3, 0]), M.p(box(0.18, 0.4, 0.2), c, [0.4, 0.38, 0], [0, 0, -0.3]), M.p(box(0.18, 0.4, 0.2), c, [-0.4, 0.38, 0], [0, 0, 0.3]),
        M.p(box(0.08, 0.5, 0.04), 0x2a2a30, [0.16, 0.32, 0.19]), M.p(box(0.08, 0.5, 0.04), 0x2a2a30, [-0.16, 0.32, 0.19]), M.p(box(0.07, 0.07, 0.03), C.gold, [0.16, 0.48, 0.215]), M.p(box(0.07, 0.07, 0.03), C.gold, [-0.16, 0.48, 0.215])]));
    } else if (it.slot === 'body' && it.model === 'tiki') {
      // wooden plates lashed together, with a painted face on the chest
      g.add(M.mesh([M.p(box(0.62, 0.56, 0.34), 0x8a5a2b, [0, 0.3, 0]), M.p(box(0.64, 0.06, 0.36), 0x5a3a1c, [0, 0.42, 0]), M.p(box(0.64, 0.06, 0.36), 0x5a3a1c, [0, 0.18, 0]),
        M.p(box(0.2, 0.3, 0.26), 0x6a4020, [0.42, 0.42, 0], [0, 0, -0.35]), M.p(box(0.2, 0.3, 0.26), 0x6a4020, [-0.42, 0.42, 0], [0, 0, 0.35]),
        M.p(box(0.08, 0.08, 0.03), 0xf0d040, [0.1, 0.36, 0.18]), M.p(box(0.08, 0.08, 0.03), 0xf0d040, [-0.1, 0.36, 0.18]), M.p(box(0.24, 0.05, 0.03), 0xd83a2a, [0, 0.24, 0.18]),
        ...[-0.2, 0, 0.2].map((x) => M.p(box(0.06, 0.22, 0.04), 0xa89a4a, [x, -0.02, 0.15]))]));
    } else if (it.slot === 'body' && it.model === 'bearpelt') {
      g.add(M.mesh([M.p(box(0.64, 0.58, 0.38), 0x6a4a2a, [0, 0.3, 0]), M.p(box(0.7, 0.18, 0.42), 0x5a3a20, [0, 0.55, 0]), M.p(box(0.22, 0.42, 0.24), 0x6a4a2a, [0.42, 0.36, 0], [0, 0, -0.3]),
        M.p(box(0.22, 0.42, 0.24), 0x6a4a2a, [-0.42, 0.36, 0], [0, 0, 0.3]), ...[-0.08, 0, 0.08].map((x) => M.p(cone(0.025, 0.1, 3), 0xe8e0c8, [0.42 + x, 0.12, 0.1], [Math.PI, 0, 0]))]));
    } else if (it.slot === 'boots' && it.model === 'bearpaws') {
      const P = [];
      for (const x of [-0.19, 0.19]) P.push(M.p(box(0.26, 0.42, 0.28), 0x6a4a2a, [x, 0.3, 0]), M.p(box(0.3, 0.2, 0.44), 0x5a3a20, [x, 0.1, 0.06]), ...[-0.08, 0, 0.08].map((dx) => M.p(cone(0.025, 0.1, 3), 0xe8e0c8, [x + dx, 0.06, 0.3], [Math.PI / 2, 0, 0])));
      g.add(M.mesh(P));
    } else if (it.slot === 'boots' && it.model === 'moonboots') {
      const c = it.color || 0xc6ced6, P = [];
      for (const x of [-0.19, 0.19]) P.push(M.p(box(0.26, 0.4, 0.28), c, [x, 0.32, 0]), M.p(box(0.28, 0.08, 0.3), 0x7dff6a, [x, 0.42, 0]), M.p(box(0.3, 0.22, 0.44), c, [x, 0.11, 0.07]), M.p(box(0.32, 0.08, 0.46), 0x2a2d33, [x, 0.02, 0.07]));
      g.add(M.mesh(P));
    } else if (it.slot === 'boots') {
      const c = it.color || C.boot, P = [];
      for (const x of [-0.17, 0.17]) P.push(M.p(box(0.2, 0.42, 0.22), c, [x, 0.3, 0]), M.p(box(0.22, 0.14, 0.38), c, [x, 0.07, 0.08]), M.p(box(0.23, 0.05, 0.4), 0x1a1410, [x, 0.01, 0.08]));
      g.add(M.mesh(P));
    } else if (it.model === 'horseshoe') {
      g.add(M.mesh([M.p(new T.TorusGeometry(0.26, 0.06, 4, 12, Math.PI * 1.35), 0x9aa3ab, [0, 0.3, 0], [0, 0, -Math.PI * 0.175 - Math.PI / 2 + Math.PI]),
        M.p(box(0.04, 0.04, 0.13), 0x3a3a40, [0.2, 0.42, 0]), M.p(box(0.04, 0.04, 0.13), 0x3a3a40, [-0.2, 0.42, 0])]));
    } else if (it.model === 'bell') {
      g.add(M.mesh([M.p(new T.TorusGeometry(0.32, 0.05, 4, 14), 0xb8352a, [0, 0.45, 0]), M.p(cyl(0.09, 0.2, 0.26, 8), C.gold, [0, 0.13, 0]), M.p(sph(0.05, 5, 4), 0x8a6a20, [0, -0.02, 0])]));
    } else {
      g.add(M.mesh([M.p(cyl(0.26, 0.26, 0.07, 12), C.gold, [0, 0.3, 0], [Math.PI / 2, 0, 0]), M.p(cyl(0.21, 0.21, 0.08, 12), 0xf4eedc, [0, 0.3, 0.005], [Math.PI / 2, 0, 0]),
        M.p(box(0.02, 0.15, 0.02), C.black, [0, 0.36, 0.05]), M.p(box(0.12, 0.02, 0.02), C.black, [0.05, 0.3, 0.05]), M.p(new T.TorusGeometry(0.06, 0.02, 4, 8), C.gold, [0, 0.6, 0])]));
    }
    return g;
  };

  // ---------- the cat farmer (animated hierarchy) ----------
  M.cat = function () {
    const mat = new T.MeshLambertMaterial({ vertexColors: true });
    const mk = (parts, glow) => new T.Mesh(M.merge(parts, 0.05), glow ? M.matB : mat);
    const root = new T.Group(), hips = new T.Group();
    hips.position.y = 0.62; root.add(hips);
    const legParts = [M.p(box(0.2, 0.46, 0.22), C.denim, [0, -0.2, 0]), M.p(box(0.24, 0.16, 0.36), C.boot, [0, -0.52, 0.05])];
    const legL = new T.Group(), legR = new T.Group();
    legL.position.set(0.16, 0.62, 0); legR.position.set(-0.16, 0.62, 0);
    legL.add(mk(legParts)); legR.add(mk(legParts)); root.add(legL, legR);
    hips.add(mk([
      M.p(box(0.56, 0.34, 0.36), C.denim, [0, 0.14, 0]), M.p(box(0.6, 0.42, 0.38), C.plaid, [0, 0.5, 0]),
      M.p(box(0.61, 0.05, 0.39), C.plaidD, [0, 0.42, 0]), M.p(box(0.61, 0.05, 0.39), C.plaidD, [0, 0.6, 0]),
      M.p(box(0.05, 0.43, 0.39), C.plaidD, [0.2, 0.5, 0]), M.p(box(0.05, 0.43, 0.39), C.plaidD, [-0.2, 0.5, 0]),
      M.p(box(0.42, 0.3, 0.05), C.denim, [0, 0.4, 0.19]), M.p(box(0.2, 0.15, 0.04), C.denimD, [0, 0.37, 0.215]),
      M.p(box(0.07, 0.42, 0.04), C.denimD, [0.15, 0.52, 0.2]), M.p(box(0.07, 0.42, 0.04), C.denimD, [-0.15, 0.52, 0.2]),
      M.p(box(0.07, 0.42, 0.04), C.denimD, [0.15, 0.52, -0.2]), M.p(box(0.07, 0.42, 0.04), C.denimD, [-0.15, 0.52, -0.2]),
      M.p(box(0.06, 0.06, 0.03), C.gold, [0.15, 0.58, 0.225]), M.p(box(0.06, 0.06, 0.03), C.gold, [-0.15, 0.58, 0.225]),
      M.p(box(0.3, 0.18, 0.06), C.cream, [0, 0.72, 0.18]),
    ]));
    const head = new T.Group(); head.position.y = 0.95; hips.add(head);
    head.add(mk([
      M.p(sph(0.31, 8, 6), C.fur, [0, 0, 0], 0, [1.05, 0.9, 0.95]),
      M.p(box(0.28, 0.15, 0.13), C.cream, [0, -0.09, 0.25]), M.p(box(0.09, 0.06, 0.05), C.pink, [0, -0.02, 0.33]),
      M.p(box(0.34, 0.12, 0.2), C.cream, [0, -0.17, 0.16]),
      M.p(box(0.06, 0.04, 0.26), C.furD, [0, 0.26, 0.02]), M.p(box(0.05, 0.035, 0.22), C.furD, [0.11, 0.25, 0.0], [0, 0, -0.35]),
      M.p(box(0.05, 0.035, 0.22), C.furD, [-0.11, 0.25, 0.0], [0, 0, 0.35]),
      M.p(cone(0.11, 0.24, 4), C.fur, [0.18, 0.27, 0], [0, Math.PI / 4, -0.3]), M.p(cone(0.11, 0.24, 4), C.fur, [-0.18, 0.27, 0], [0, Math.PI / 4, 0.3]),
      M.p(cone(0.06, 0.15, 4), C.pink, [0.18, 0.26, 0.04], [0, Math.PI / 4, -0.3]), M.p(cone(0.06, 0.15, 4), C.pink, [-0.18, 0.26, 0.04], [0, Math.PI / 4, 0.3]),
      M.p(box(0.026, 0.09, 0.02), C.black, [0.11, 0.05, 0.3]), M.p(box(0.026, 0.09, 0.02), C.black, [-0.11, 0.05, 0.3]),
      M.p(box(0.26, 0.012, 0.012), C.cream, [0.24, -0.06, 0.26], [0, 0.3, 0.12]), M.p(box(0.26, 0.012, 0.012), C.cream, [-0.24, -0.06, 0.26], [0, -0.3, -0.12]),
      M.p(box(0.26, 0.012, 0.012), C.cream, [0.24, -0.1, 0.25], [0, 0.3, -0.1]), M.p(box(0.26, 0.012, 0.012), C.cream, [-0.24, -0.1, 0.25], [0, -0.3, 0.1]),
    ]));
    head.add(mk([M.p(box(0.1, 0.11, 0.03), C.eye, [0.11, 0.05, 0.285]), M.p(box(0.1, 0.11, 0.03), C.eye, [-0.11, 0.05, 0.285])], true));
    const hatMount = new T.Group(); hatMount.position.set(0, 0.2, -0.02); hatMount.rotation.set(-0.08, 0, 0.06); head.add(hatMount);
    const tail = new T.Group(); tail.position.set(0, 0.12, -0.2); hips.add(tail);
    tail.add(mk([M.p(box(0.09, 0.09, 0.3), C.fur, [0, 0.04, -0.13], [0.45, 0, 0]), M.p(box(0.085, 0.085, 0.28), C.fur, [0, 0.22, -0.28], [1.1, 0, 0]),
      M.p(box(0.08, 0.08, 0.16), C.furD, [0, 0.4, -0.33], [1.5, 0, 0])]));
    const armParts = [M.p(box(0.16, 0.36, 0.16), C.plaid, [0, -0.16, 0]), M.p(box(0.15, 0.14, 0.15), C.cream, [0, -0.41, 0])];
    const armL = new T.Group(); armL.position.set(0.37, 0.62, 0); armL.add(mk(armParts)); hips.add(armL);
    const swing = new T.Group(); swing.position.set(0, 0.62, 0); hips.add(swing);
    const armR = new T.Group(); armR.position.set(-0.37, 0, 0); armR.add(mk(armParts)); swing.add(armR);
    const holder = new T.Group(); swing.add(holder);
    return { root, hips, head, hatMount, legL, legR, armL, armR, swing, holder, tail, mat };
  };
  // ---------- Gregory the black goat (the same joints as the cat, so every pose and animation fits) ----------
  // Black fur, a dark violet robe with a blood-red sash, a belt of poison vials, swept-back horns, a beard,
  // and amber eyes split by a goat's horizontal slit pupils.
  const GT = { fur: 0x2a2530, furD: 0x18151c, furL: 0x3e3746, muzzle: 0x332d38, inner: 0x5a3a4a, horn: 0x9a8a72, hornD: 0x62533f, hoof: 0x121014,
    robe: 0x34183f, robeD: 0x1f0d27, trim: 0x8e1a26, belt: 0x3a2418, bone: 0xe8dcc4, eye: 0xffb21a, pupil: 0x050304, vial: 0x6aff3a };
  M.goat = function () {
    const mat = new T.MeshLambertMaterial({ vertexColors: true });
    const mk = (parts, glow) => new T.Mesh(M.merge(parts, 0.05), glow ? M.matB : mat);
    const root = new T.Group(), hips = new T.Group();
    hips.position.y = 0.62; root.add(hips);
    // goat legs: furred thigh, thin shin, split hoof
    const legParts = [M.p(box(0.2, 0.3, 0.24), GT.furD, [0, -0.13, 0]), M.p(box(0.15, 0.28, 0.15), GT.fur, [0, -0.38, -0.02]),
      M.p(box(0.21, 0.12, 0.27), GT.hoof, [0, -0.55, 0.04]), M.p(box(0.025, 0.1, 0.06), GT.furL, [0, -0.55, 0.17])];
    const legL = new T.Group(), legR = new T.Group();
    legL.position.set(0.16, 0.62, 0); legR.position.set(-0.16, 0.62, 0);
    legL.add(mk(legParts)); legR.add(mk(legParts)); root.add(legL, legR);
    hips.add(mk([
      M.p(cyl(0.31, 0.4, 0.42, 8), GT.robeD, [0, 0.06, 0]), M.p(cyl(0.405, 0.405, 0.05, 8), GT.trim, [0, -0.13, 0]),
      M.p(box(0.58, 0.44, 0.38), GT.robe, [0, 0.48, 0]), M.p(box(0.66, 0.1, 0.44), GT.robeD, [0, 0.7, 0]),
      M.p(box(0.24, 0.2, 0.06), GT.furL, [0, 0.64, 0.18]),                                              // chest fur
      M.p(box(0.61, 0.07, 0.41), GT.belt, [0, 0.27, 0]), M.p(box(0.09, 0.08, 0.03), GT.bone, [0, 0.27, 0.215]),
      M.p(box(0.08, 0.66, 0.04), GT.trim, [0.02, 0.47, 0.205], [0, 0, 0.62]),                        // the blood-red sash
      M.p(box(0.09, 0.08, 0.04), GT.bone, [-0.1, 0.38, 0.235]), M.p(box(0.02, 0.02, 0.01), GT.pupil, [-0.12, 0.39, 0.26]), M.p(box(0.02, 0.02, 0.01), GT.pupil, [-0.08, 0.39, 0.26]),
      M.p(box(0.05, 0.14, 0.05), GT.belt, [0.24, 0.2, 0.17]), M.p(box(0.05, 0.12, 0.05), GT.belt, [-0.25, 0.21, 0.16]),   // vial straps
    ]));
    hips.add(mk([   // poison vials on the belt, glowing
      M.p(cyl(0.035, 0.035, 0.1, 6), GT.vial, [0.24, 0.17, 0.2]), M.p(cyl(0.03, 0.03, 0.08, 6), 0xb06aff, [0.32, 0.18, 0.17]), M.p(cyl(0.035, 0.035, 0.1, 6), GT.vial, [-0.25, 0.18, 0.19]),
    ], true));
    const head = new T.Group(); head.position.y = 0.95; hips.add(head);
    const horn = (s) => {   // swept back and curling down, ridged
      const pts = [[0.1, 0.18, 0.02], [0.15, 0.34, -0.06], [0.21, 0.45, -0.2], [0.29, 0.44, -0.34], [0.34, 0.34, -0.42], [0.33, 0.24, -0.38]], rs = [0.12, 0.1, 0.085, 0.068, 0.05];
      return pts.slice(1).map((b, i) => { const a = pts[i]; return M.beam([a[0] * s, a[1], a[2]], [b[0] * s, b[1], b[2]], rs[i], i % 2 ? GT.hornD : GT.horn); });
    };
    head.add(mk([
      M.p(sph(0.26, 8, 6), GT.fur, [0, 0.02, 0], 0, [1, 0.95, 1.05]),
      M.p(box(0.21, 0.2, 0.3), GT.fur, [0, -0.08, 0.24], [0.28, 0, 0]), M.p(box(0.18, 0.15, 0.09), GT.muzzle, [0, -0.15, 0.39], [0.28, 0, 0]),
      M.p(box(0.035, 0.03, 0.02), GT.pupil, [0.045, -0.12, 0.44]), M.p(box(0.035, 0.03, 0.02), GT.pupil, [-0.045, -0.12, 0.44]),
      M.p(box(0.12, 0.015, 0.02), GT.pupil, [0, -0.2, 0.42]),
      M.p(cone(0.075, 0.26, 4), GT.furD, [0, -0.34, 0.3], [Math.PI - 0.25, 0, 0]),                     // the beard
      M.p(box(0.24, 0.07, 0.11), GT.fur, [0.27, -0.01, 0.02], [0, 0.15, -0.45]), M.p(box(0.24, 0.07, 0.11), GT.fur, [-0.27, -0.01, 0.02], [0, -0.15, 0.45]),
      M.p(box(0.17, 0.02, 0.07), GT.inner, [0.28, -0.035, 0.03], [0, 0.15, -0.45]), M.p(box(0.17, 0.02, 0.07), GT.inner, [-0.28, -0.035, 0.03], [0, -0.15, 0.45]),
      M.p(box(0.16, 0.06, 0.12), GT.furL, [0, 0.22, 0.08]),                                           // forelock between the horns
      ...horn(1), ...horn(-1),
    ]));
    // amber eyes, each split by a goat's horizontal slit pupil (set just in front, along the eye's facing)
    const eye = (s) => { const a = s * 0.38, x = s * 0.135, z = 0.215, fx = Math.sin(a) * 0.017, fz = Math.cos(a) * 0.017;
      return [M.p(box(0.095, 0.07, 0.03), GT.eye, [x, 0.06, z], [0, a, 0]), M.p(box(0.08, 0.017, 0.012), GT.pupil, [x + fx, 0.06, z + fz], [0, a, 0])]; };
    head.add(mk([...eye(1), ...eye(-1)], true));
    const hatMount = new T.Group(); hatMount.position.set(0, 0.27, -0.03); hatMount.rotation.set(-0.08, 0, 0.04); head.add(hatMount);
    const tail = new T.Group(); tail.position.set(0, 0.16, -0.2); hips.add(tail);
    tail.add(mk([M.p(box(0.09, 0.16, 0.08), GT.fur, [0, 0.06, -0.04], [-0.6, 0, 0]), M.p(box(0.07, 0.08, 0.07), GT.furL, [0, 0.15, -0.09], [-0.6, 0, 0])]));
    const armParts = [M.p(box(0.17, 0.34, 0.17), GT.robe, [0, -0.15, 0]), M.p(box(0.19, 0.06, 0.19), GT.trim, [0, -0.31, 0]), M.p(box(0.14, 0.13, 0.14), GT.furD, [0, -0.41, 0])];
    const armL = new T.Group(); armL.position.set(0.37, 0.62, 0); armL.add(mk(armParts)); hips.add(armL);
    const swing = new T.Group(); swing.position.set(0, 0.62, 0); hips.add(swing);
    const armR = new T.Group(); armR.position.set(-0.37, 0, 0); armR.add(mk(armParts)); swing.add(armR);
    const holder = new T.Group(); swing.add(holder);
    return { root, hips, head, hatMount, legL, legR, armL, armR, swing, holder, tail, mat };
  };
  // A playable character's model by its characters.json "model".
  M.HERO_MODELS = ['cat', 'goat'];
  M.hero = (kind) => (kind === 'goat' ? M.goat() : M.cat());

  // ---------- enemies: parts for instanced rendering (pivot = joint position) ----------
  M.enemyParts = function (type) {
    if (type === 'dummy') {
      // a straw-stuffed sack on a post, with a painted target on its chest
      const sack = 0xc8a066, sackD = 0x9a7440, red = 0xb8352a;
      return [{ name: 'body', geo: M.merge([
        M.p(box(0.7, 0.12, 0.7), C.woodD, [0, 0.06, 0]), M.p(box(0.16, 1.9, 0.16), C.wood, [0, 0.95, 0]),
        M.p(box(1.6, 0.13, 0.13), C.wood, [0, 1.45, -0.05]),
        M.p(cyl(0.36, 0.42, 0.95, 8), sack, [0, 1.25, 0]), M.p(cyl(0.43, 0.43, 0.08, 8), sackD, [0, 0.85, 0]), M.p(cyl(0.38, 0.38, 0.06, 8), sackD, [0, 1.66, 0]),
        M.p(box(0.3, 0.3, 0.3), sack, [0.72, 1.45, -0.05]), M.p(box(0.3, 0.3, 0.3), sack, [-0.72, 1.45, -0.05]),
        M.p(sph(0.3, 8, 6), sack, [0, 1.98, 0]), M.p(box(0.1, 0.06, 0.04), C.black, [0.1, 2.02, 0.28]), M.p(box(0.1, 0.06, 0.04), C.black, [-0.1, 2.02, 0.28]),
        M.p(cyl(0.26, 0.26, 0.04, 12), red, [0, 1.28, 0.39], [Math.PI / 2, 0, 0]), M.p(cyl(0.17, 0.17, 0.05, 12), C.cream, [0, 1.28, 0.4], [Math.PI / 2, 0, 0]),
        M.p(cyl(0.08, 0.08, 0.06, 10), red, [0, 1.28, 0.41], [Math.PI / 2, 0, 0]),
        ...[[-0.3, 0.8], [0.25, 0.8], [0.05, 0.78]].map(([x, y]) => M.p(cone(0.05, 0.22, 4), C.straw, [x, y, 0.3], [Math.PI, 0, 0])),
        M.p(cone(0.06, 0.2, 4), C.straw, [0.12, 2.28, 0], [0, 0, -0.4]), M.p(cone(0.06, 0.2, 4), C.straw, [-0.1, 2.27, 0.05], [0, 0, 0.5]),
      ]) }];
    }
    if (type === 'dog') {
      const fur = 0x6b4a2e, dark = 0x3e2a1a, light = 0x9a7a55;
      const leg = M.merge([M.p(box(0.12, 0.5, 0.13), fur, [0, -0.25, 0]), M.p(box(0.14, 0.08, 0.18), dark, [0, -0.52, 0.03])]);
      return [
        { name: 'body', geo: M.merge([
          M.p(box(0.44, 0.4, 0.95), fur, [0, 0.68, 0]), M.p(box(0.36, 0.1, 0.8), dark, [0, 0.9, -0.02]), M.p(box(0.36, 0.3, 0.4), light, [0, 0.6, 0.3]),
          M.p(box(0.26, 0.3, 0.3), fur, [0, 0.86, 0.5], [-0.5, 0, 0]), M.p(box(0.38, 0.32, 0.38), fur, [0, 0.98, 0.62]),
          M.p(box(0.22, 0.17, 0.28), light, [0, 0.9, 0.88]), M.p(box(0.1, 0.07, 0.06), C.black, [0, 0.97, 1.02]), M.p(box(0.18, 0.04, 0.04), 0xf0eadc, [0, 0.82, 0.98]),
          M.p(cone(0.08, 0.2, 4), dark, [0.12, 1.2, 0.56], [0, 0, -0.25]), M.p(cone(0.08, 0.2, 4), dark, [-0.12, 1.2, 0.56], [0, 0, 0.25]),
          M.p(box(0.09, 0.09, 0.45), dark, [0, 0.92, -0.62], [0.7, 0, 0]), M.p(cone(0.06, 0.16, 4), dark, [0, 0.95, -0.1]), M.p(cone(0.06, 0.16, 4), dark, [0, 0.95, 0.15]),
        ]) },
        { name: 'eyes', glow: true, geo: M.merge([M.p(box(0.07, 0.06, 0.04), 0xff3020, [0.1, 1.04, 0.82]), M.p(box(0.07, 0.06, 0.04), 0xff3020, [-0.1, 1.04, 0.82])], 0) },
        { name: 'legFL', geo: leg, pivot: [0.14, 0.56, 0.33] }, { name: 'legFR', geo: leg, pivot: [-0.14, 0.56, 0.33] },
        { name: 'legBL', geo: leg, pivot: [0.14, 0.56, -0.33] }, { name: 'legBR', geo: leg, pivot: [-0.14, 0.56, -0.33] },
      ];
    }
    if (type === 'crow' || type === 'alienbird') {
      const alien = type === 'alienbird', bk = alien ? 0x4a2a6a : 0x1c1c26, dk = alien ? 0x2a1a40 : 0x0e0e14, beak = alien ? 0x8af06a : 0xd9a62a, eye = alien ? 0x9aff4a : 0xff3a20;
      const body = [
        M.p(sph(0.22, 6, 5), bk, [0, 0, 0], 0, [1, 0.9, 1.6]), M.p(sph(0.15, 6, 5), bk, [0, 0.1, 0.32]),
        M.p(cone(0.05, 0.18, 4), beak, [0, 0.07, 0.5], [Math.PI / 2, 0, 0]), M.p(box(0.2, 0.03, 0.3), dk, [0, 0.03, -0.42], [0.25, 0, 0]),
        M.p(box(0.03, 0.14, 0.03), beak, [0.06, -0.22, 0]), M.p(box(0.03, 0.14, 0.03), beak, [-0.06, -0.22, 0]),
      ];
      const eyes = [M.p(box(0.05, 0.04, 0.03), eye, [0.07, 0.14, 0.43]), M.p(box(0.05, 0.04, 0.03), eye, [-0.07, 0.14, 0.43])];
      if (alien) {
        body.push(M.p(cone(0.04, 0.22, 4), beak, [0, 0.28, 0.26], [-0.5, 0, 0]), M.p(cone(0.04, 0.18, 4), beak, [0, 0.24, 0.12], [-0.8, 0, 0]), M.p(box(0.12, 0.03, 0.4), beak, [0, 0.05, -0.62], [0.2, 0, 0]));
        eyes.push(M.p(box(0.05, 0.05, 0.03), eye, [0, 0.2, 0.42]));
      }
      const wing = (s) => M.merge([M.p(box(0.5, 0.03, 0.26), bk, [s * 0.25, 0, 0]), M.p(box(0.3, 0.025, 0.18), alien ? beak : dk, [s * 0.62, 0, -0.06], [0, s * 0.25, 0])]);
      return [
        { name: 'body', geo: M.merge(body) },
        { name: 'eyes', glow: true, geo: M.merge(eyes, 0) },
        { name: 'wingL', pivot: [0.12, 0.06, 0.02], geo: wing(1) },
        { name: 'wingR', pivot: [-0.12, 0.06, 0.02], geo: wing(-1) },
      ];
    }
    if (type === 'alien') {
      // tall, thin and green, in a dark suit, with big black eyes
      const skin = 0x7ad84a, dark = 0x3f8a2a, suit = 0x2a2f3a;
      const leg = M.merge([M.p(box(0.14, 0.95, 0.16), suit, [0, -0.47, 0]), M.p(box(0.18, 0.08, 0.28), dark, [0, -0.95, 0.05])]);
      const arm = M.merge([M.p(box(0.1, 0.8, 0.1), skin, [0, -0.4, 0]), M.p(box(0.13, 0.13, 0.13), dark, [0, -0.84, 0]), M.p(box(0.03, 0.14, 0.03), dark, [0.04, -0.96, 0.02]), M.p(box(0.03, 0.14, 0.03), dark, [-0.04, -0.96, 0.02])]);
      return [
        { name: 'body', geo: M.merge([
          M.p(box(0.42, 0.62, 0.26), suit, [0, 1.3, 0]), M.p(box(0.46, 0.1, 0.3), dark, [0, 1.6, 0]), M.p(box(0.44, 0.12, 0.28), dark, [0, 1.0, 0]),
          M.p(cyl(0.06, 0.08, 0.25, 5), skin, [0, 1.72, 0]), M.p(sph(0.3, 8, 6), skin, [0, 2.02, 0.02], 0, [0.88, 1.28, 0.95]),
          M.p(sph(0.09, 6, 4), 0x0a0c0a, [0.13, 2.04, 0.22], [0, 0, -0.5], [0.8, 1.5, 0.6]), M.p(sph(0.09, 6, 4), 0x0a0c0a, [-0.13, 2.04, 0.22], [0, 0, 0.5], [0.8, 1.5, 0.6]),
          M.p(box(0.12, 0.03, 0.03), 0x1a5a1a, [0, 1.84, 0.26]),
        ]) },
        { name: 'lights', glow: true, geo: M.merge([M.p(box(0.08, 0.08, 0.04), 0x9aff6a, [0, 1.42, 0.14]), M.p(box(0.3, 0.03, 0.04), 0x9aff6a, [0, 1.0, 0.15])], 0) },
        { name: 'legL', geo: leg, pivot: [0.12, 0.98, 0] }, { name: 'legR', geo: leg, pivot: [-0.12, 0.98, 0] },
        { name: 'armL', geo: arm, pivot: [0.28, 1.56, 0] }, { name: 'armR', geo: arm, pivot: [-0.28, 1.56, 0] },
      ];
    }
    if (type === 'blob') {
      const g = 0x6ad83a, gd = 0x3a9a2a, hl = 0xc8ff9a;
      return [
        { name: 'body', geo: M.merge([
          M.p(sph(0.7, 10, 7), g, [0, 0.62, 0], 0, [1, 0.85, 1]), M.p(sph(0.42, 8, 5), gd, [0.28, 0.42, -0.28]), M.p(sph(0.34, 7, 5), gd, [-0.32, 0.45, 0.08]),
          M.p(sph(0.15, 6, 4), hl, [0.22, 1.0, 0.28]), M.p(sph(0.1, 5, 4), hl, [-0.3, 0.9, -0.2]), M.p(box(0.3, 0.05, 0.04), 0x1a4a10, [0, 0.52, 0.67]),
        ]) },
        { name: 'eyes', glow: true, geo: M.merge([M.p(sph(0.11, 6, 4), 0xfff04a, [0.2, 0.84, 0.56]), M.p(sph(0.08, 6, 4), 0xfff04a, [-0.18, 0.92, 0.58]), M.p(sph(0.06, 5, 4), 0xfff04a, [0.02, 1.08, 0.5])], 0) },
      ];
    }
    if (type === 'mosquito') {
      const b = 0x3a4a2a, s = 0x6a8a3a, P = [
        M.p(sph(0.19, 6, 5), b, [0, 0, 0.18]), M.p(sph(0.17, 6, 5), s, [0, 0.02, -0.28], 0, [0.9, 0.8, 1.9]), M.p(sph(0.13, 6, 4), b, [0, 0.04, 0.42]),
        M.p(box(0.03, 0.03, 0.55), 0x1a1a1a, [0, -0.02, 0.8]),
      ];
      for (const sd of [1, -1]) for (const z of [0.26, 0.12, -0.02]) P.push(M.beam([sd * 0.08, -0.05, z], [sd * 0.34, -0.42, z + 0.06], 0.025, 0x1a1a1a));
      const wing = (sd) => M.merge([M.p(box(0.62, 0.012, 0.2), 0xcfe8ff, [sd * 0.31, 0, -0.04], [0, sd * 0.2, 0])], 0.02);
      return [
        { name: 'body', geo: M.merge(P) },
        { name: 'eyes', glow: true, geo: M.merge([M.p(box(0.08, 0.08, 0.05), 0xff3a8a, [0.08, 0.08, 0.5]), M.p(box(0.08, 0.08, 0.05), 0xff3a8a, [-0.08, 0.08, 0.5]), M.p(sph(0.08, 5, 4), 0x9aff4a, [0, 0.02, -0.5])], 0) },
        { name: 'wingL', pivot: [0.08, 0.14, 0.12], geo: wing(1) },
        { name: 'wingR', pivot: [-0.08, 0.14, 0.12], geo: wing(-1) },
      ];
    }
    // ---------- The Unexplainable (map 3) ----------
    if (type === 'witchdoctor' || type === 'shaman') {
      // witch doctor: painted skull mask, feather crown, grass skirt and a bone staff.
      // shaman: hunched in a dark robe under an antlered hood, with a glowing orb on a crooked staff.
      const sh = type === 'shaman', skin = 0x6a4a32, skinD = 0x4a3222, grass = 0xa89a4a, robe = 0x3a2a4a, bone = 0xe8e0c8, glowC = sh ? 0x9a6aff : 0xd890ff;
      const leg = M.merge(sh ? [M.p(box(0.16, 0.7, 0.18), robe, [0, -0.35, 0]), M.p(box(0.18, 0.08, 0.26), skinD, [0, -0.7, 0.04])]
        : [M.p(box(0.13, 0.75, 0.15), skin, [0, -0.37, 0]), M.p(box(0.16, 0.07, 0.24), skinD, [0, -0.74, 0.04]), M.p(box(0.16, 0.06, 0.17), bone, [0, -0.5, 0])]);
      const arm = M.merge([M.p(box(0.12, 0.62, 0.12), sh ? robe : skin, [0, -0.31, 0]), M.p(box(0.13, 0.13, 0.13), skinD, [0, -0.66, 0])]);
      const staffArm = M.merge([M.p(box(0.12, 0.62, 0.12), sh ? robe : skin, [0, -0.31, 0]), M.p(box(0.13, 0.13, 0.13), skinD, [0, -0.66, 0]),
        M.p(cyl(0.035, 0.04, 1.7, 5), sh ? 0x5a3a22 : bone, [0, -0.5, 0.12]), ...(sh ? [M.p(box(0.06, 0.3, 0.06), 0x5a3a22, [0.08, 0.38, 0.12], [0, 0, 0.6])] : [M.p(sph(0.12, 6, 4), bone, [0, 0.38, 0.12])])]);
      const body = sh ? [
        M.p(cyl(0.22, 0.42, 0.9, 7), robe, [0, 0.95, 0]), M.p(sph(0.3, 7, 5), robe, [0, 1.42, -0.06], 0, [1, 0.9, 1]), M.p(cyl(0.24, 0.3, 0.12, 7), 0x5a2a6a, [0, 1.12, 0]),
        M.p(sph(0.24, 7, 5), robe, [0, 1.62, 0.08]), M.p(box(0.26, 0.3, 0.06), 0x8a6a4a, [0, 1.58, 0.29]), M.p(box(0.06, 0.06, 0.03), C.black, [0.07, 1.62, 0.32]), M.p(box(0.06, 0.06, 0.03), C.black, [-0.07, 1.62, 0.32]),
        M.beam([0.12, 1.78, 0.02], [0.32, 2.12, -0.06], 0.035, bone), M.beam([0.26, 2.0, -0.04], [0.42, 2.06, 0.08], 0.03, bone), M.beam([-0.12, 1.78, 0.02], [-0.32, 2.12, -0.06], 0.035, bone), M.beam([-0.26, 2.0, -0.04], [-0.42, 2.06, 0.08], 0.03, bone),
      ] : [
        M.p(box(0.38, 0.5, 0.24), skin, [0, 1.15, 0]), M.p(cyl(0.28, 0.34, 0.32, 8), grass, [0, 0.82, 0]), M.p(cyl(0.3, 0.38, 0.06, 8), 0x7a6a2a, [0, 0.66, 0]),
        M.p(new T.TorusGeometry(0.2, 0.03, 4, 10), bone, [0, 1.36, 0.06], [Math.PI / 2 - 0.4, 0, 0]),
        M.p(sph(0.21, 7, 5), skin, [0, 1.55, 0]), M.p(box(0.3, 0.36, 0.07), bone, [0, 1.55, 0.2]), M.p(box(0.07, 0.07, 0.03), C.black, [0.07, 1.6, 0.24]), M.p(box(0.07, 0.07, 0.03), C.black, [-0.07, 1.6, 0.24]),
        M.p(box(0.2, 0.04, 0.03), 0x8a1a1a, [0, 1.46, 0.24]), M.p(box(0.03, 0.2, 0.03), 0x2a6aaa, [0, 1.62, 0.24]),
        ...[-0.2, -0.1, 0, 0.1, 0.2].map((x, i) => M.p(box(0.05, 0.36, 0.03), [0xd83a2a, 0xf0d040, 0x2a8aca, 0xf0d040, 0xd83a2a][i], [x, 1.84, -0.02], [-0.15, 0, x * 1.4])),
      ];
      return [
        { name: 'body', geo: M.merge(body) },
        { name: 'eyes', glow: true, geo: M.merge(sh ? [M.p(box(0.05, 0.04, 0.03), glowC, [0.07, 1.62, 0.33]), M.p(box(0.05, 0.04, 0.03), glowC, [-0.07, 1.62, 0.33])]
          : [M.p(box(0.04, 0.04, 0.03), glowC, [0.07, 1.6, 0.25]), M.p(box(0.04, 0.04, 0.03), glowC, [-0.07, 1.6, 0.25])], 0) },
        { name: 'legL', geo: leg, pivot: [0.11, 0.78, 0] }, { name: 'legR', geo: leg, pivot: [-0.11, 0.78, 0] },
        { name: 'armL', geo: arm, pivot: [0.26, 1.32, 0] }, { name: 'armR', geo: staffArm, pivot: [-0.26, 1.32, 0] },
        // the glowing staff head swings with the staff arm
        { name: 'armR', glow: true, geo: M.merge([M.p(sph(sh ? 0.12 : 0.08, 6, 4), glowC, [sh ? 0.14 : 0, sh ? 0.55 : 0.4, 0.12])], 0), pivot: [-0.26, 1.32, 0] },
      ];
    }
    if (type === 'ghost') {
      // an ancestor's spirit: a pale glowing wisp with hollow eyes, trailing off into nothing
      const pale = 0xb8a8f0, deep = 0x7a6ac8;
      const arm = M.merge([M.p(cone(0.1, 0.6, 5), pale, [0, -0.3, 0.05], [Math.PI, 0, 0])], 0.05);
      return [
        { name: 'body', glow: true, geo: M.merge([
          M.p(sph(0.34, 8, 6), pale, [0, 0.62, 0], 0, [1, 1.15, 0.95]), M.p(cone(0.36, 0.8, 7), pale, [0, 0.05, -0.04], [Math.PI + 0.25, 0, 0]),
          M.p(cone(0.22, 0.5, 6), deep, [0.08, -0.25, -0.2], [Math.PI + 0.6, 0, 0.2]), M.p(sph(0.2, 6, 4), deep, [0, 0.95, -0.05]),
        ], 0.06) },
        { name: 'face', geo: M.merge([M.p(box(0.1, 0.13, 0.04), 0x0a0614, [0.11, 0.7, 0.31]), M.p(box(0.1, 0.13, 0.04), 0x0a0614, [-0.11, 0.7, 0.31]), M.p(box(0.14, 0.08, 0.04), 0x0a0614, [0, 0.48, 0.3])], 0) },
        { name: 'armL', glow: true, geo: arm, pivot: [0.32, 0.62, 0] }, { name: 'armR', glow: true, geo: arm, pivot: [-0.32, 0.62, 0] },
      ];
    }
    if (type === 'cultist') {
      // a hooded cultist in a long purple robe, holding a skull lantern; only the eyes show
      const robe = 0x2a1438, robeD = 0x1a0a24, trim = 0x8a5ad0;
      const arm = M.merge([M.p(box(0.14, 0.6, 0.14), robe, [0, -0.3, 0]), M.p(box(0.18, 0.14, 0.18), robeD, [0, -0.6, 0])]);
      const lamp = M.merge([M.p(box(0.14, 0.6, 0.14), robe, [0, -0.3, 0]), M.p(box(0.18, 0.14, 0.18), robeD, [0, -0.6, 0]), M.p(cyl(0.015, 0.015, 0.3, 4), 0x3a3a3a, [0, -0.82, 0.05])]);
      return [
        { name: 'body', geo: M.merge([
          M.p(cyl(0.24, 0.5, 1.35, 8), robe, [0, 0.68, 0]), M.p(cyl(0.5, 0.52, 0.06, 8), trim, [0, 0.04, 0]), M.p(box(0.08, 1.2, 0.04), trim, [0, 0.7, 0.33], [0.2, 0, 0]),
          M.p(sph(0.28, 8, 6), robe, [0, 1.55, 0], 0, [1, 1.15, 1]), M.p(cone(0.18, 0.42, 6), robe, [0, 1.92, -0.12], [-0.6, 0, 0]),
          M.p(sph(0.2, 7, 5), 0x05030a, [0, 1.52, 0.12], 0, [1, 1.1, 0.8]),
        ]) },
        { name: 'eyes', glow: true, geo: M.merge([M.p(box(0.06, 0.04, 0.03), 0xd890ff, [0.07, 1.55, 0.27]), M.p(box(0.06, 0.04, 0.03), 0xd890ff, [-0.07, 1.55, 0.27]),
          M.p(sph(0.11, 6, 4), 0xc08aff, [-0.3, 0.42, 0.06])], 0) },
        { name: 'armL', geo: arm, pivot: [0.3, 1.28, 0] }, { name: 'armR', geo: lamp, pivot: [-0.3, 1.28, 0] },
      ];
    }
    if (type === 'snail') {
      // a giant snail: a heavy spiral shell on a long slimy foot, eye stalks swaying
      const foot = 0x8a7a6a, footD = 0x6a5a4a, shell = 0x8a5a9a, shellD = 0x5a3a6a, band = 0xd8b870;
      const S = [M.p(sph(0.55, 9, 6), foot, [0, 0.32, 0.2], 0, [0.85, 0.55, 2.2]), M.p(sph(0.35, 8, 5), foot, [0, 0.5, 1.15], 0, [0.9, 0.8, 1.1]),
        M.p(box(1.0, 0.06, 2.4), footD, [0, 0.04, 0.2])];
      const sh = [];
      for (let i = 0; i < 4; i++) { const r = 0.62 - i * 0.14; sh.push(M.p(new T.TorusGeometry(r, 0.2 - i * 0.03, 6, 14), i % 2 ? shellD : shell, [0, 1.0 + i * 0.05, -0.15 + i * 0.1], [0, Math.PI / 2, 0])); }
      sh.push(M.p(sph(0.5, 9, 7), shell, [0, 1.0, -0.15], 0, [0.6, 1, 1]), M.p(new T.TorusGeometry(0.66, 0.05, 4, 16), band, [0.18, 1.0, -0.15], [0, Math.PI / 2, 0]));
      return [
        { name: 'body', geo: M.merge(S.concat(sh)) },
        { name: 'eyes', glow: true, geo: M.merge([M.beam([0.12, 0.7, 1.3], [0.2, 1.2, 1.5], 0.04, foot), M.beam([-0.12, 0.7, 1.3], [-0.2, 1.2, 1.5], 0.04, foot),
          M.p(sph(0.07, 5, 4), 0xd8ff6a, [0.2, 1.22, 1.5]), M.p(sph(0.07, 5, 4), 0xd8ff6a, [-0.2, 1.22, 1.5])], 0) },
      ];
    }
    if (type === 'frog') {
      // a fat toxic frog, bright green with yellow warning spots and big glowing eyes
      const g = 0x4ac83a, gd = 0x2a7a1a, sp = 0xffd040;
      const leg = M.merge([M.p(box(0.16, 0.12, 0.42), gd, [0, -0.06, -0.1], [0.4, 0, 0]), M.p(box(0.2, 0.05, 0.2), g, [0, -0.2, 0.08])]);
      return [
        { name: 'body', geo: M.merge([
          M.p(sph(0.42, 8, 6), g, [0, 0.38, 0], 0, [1.1, 0.75, 1.15]), M.p(sph(0.3, 7, 5), 0xc8e88a, [0, 0.28, 0.15], 0, [1, 0.6, 1]),
          M.p(sph(0.08, 5, 4), sp, [0.2, 0.6, -0.1]), M.p(sph(0.07, 5, 4), sp, [-0.18, 0.62, 0.05]), M.p(sph(0.06, 5, 4), sp, [0.05, 0.66, -0.25]),
          M.p(box(0.12, 0.08, 0.12), gd, [0.25, 0.12, 0.32]), M.p(box(0.12, 0.08, 0.12), gd, [-0.25, 0.12, 0.32]), M.p(box(0.4, 0.03, 0.04), 0x1a3a0a, [0, 0.36, 0.45]),
        ]) },
        { name: 'eyes', glow: true, geo: M.merge([M.p(sph(0.1, 6, 4), 0xffe04a, [0.17, 0.66, 0.28]), M.p(sph(0.1, 6, 4), 0xffe04a, [-0.17, 0.66, 0.28])], 0) },
        { name: 'legL', geo: leg, pivot: [0.32, 0.25, -0.2] }, { name: 'legR', geo: leg, pivot: [-0.32, 0.25, -0.2] },
      ];
    }
    if (type === 'voidling') {
      // a slim, slow thing from the void: long thin limbs, a swollen head trailing face tentacles, violet eyes
      const skin = 0x221430, dark = 0x150c1e, hi = 0x3a2850, tent = 0x4a2a5a;
      const arm = (sx) => M.merge([M.p(box(0.09, 1.0, 0.09), skin, [0, -0.5, 0]), M.p(box(0.07, 0.25, 0.07), hi, [0, -1.0, 0.03], [0.3, 0, 0]),
        ...[-0.05, 0, 0.05].map((x) => M.p(cone(0.025, 0.28, 4), dark, [x, -1.2, 0.06], [Math.PI + 0.3, 0, sx * x * 3]))]);
      const leg = M.merge([M.p(box(0.11, 1.05, 0.12), skin, [0, -0.52, 0]), M.p(box(0.14, 0.06, 0.24), dark, [0, -1.04, 0.05])]);
      return [
        { name: 'body', geo: M.merge([
          M.p(box(0.34, 0.75, 0.2), skin, [0, 1.42, 0]), M.p(box(0.4, 0.12, 0.22), hi, [0, 1.78, 0]), M.p(box(0.3, 0.12, 0.18), dark, [0, 1.06, 0]),
          ...[1.25, 1.4, 1.55].map((y) => M.p(box(0.36, 0.03, 0.21), dark, [0, y, 0.005])),
          M.p(cyl(0.05, 0.07, 0.2, 5), skin, [0, 1.92, 0]),
          M.p(sph(0.26, 9, 7), hi, [0, 2.12, -0.04], 0, [0.95, 1.05, 1.3]), M.p(sph(0.2, 8, 6), skin, [0, 2.03, 0.12]),
          ...[[-0.09, 0.1], [-0.03, -0.05], [0.03, -0.05], [0.09, 0.1]].map(([x, t]) => M.p(cone(0.04, 0.5, 4), tent, [x, 1.75, 0.22], [Math.PI + 0.15, 0, t])),
        ], 0.04) },
        { name: 'eyes', glow: true, geo: M.merge([M.p(sph(0.04, 5, 4), 0xc080ff, [-0.08, 2.1, 0.27]), M.p(sph(0.04, 5, 4), 0xc080ff, [0.08, 2.1, 0.27])], 0) },
        { name: 'legL', pivot: [-0.1, 1.05, 0], geo: leg }, { name: 'legR', pivot: [0.1, 1.05, 0], geo: leg.clone() },
        { name: 'armL', pivot: [-0.24, 1.78, 0], geo: arm(-1) }, { name: 'armR', pivot: [0.24, 1.78, 0], geo: arm(1) },
      ];
    }
    if (type === 'crawler') {
      // a void crawler: a low, flat, six-legged thing of black chitin, a cluster of violet eyes on its head,
      // its back split open on the void, pale mandibles and teeth. Legs swing in two tripods (cleg0 / cleg1).
      const shell = 0x1a1022, shellD = 0x0e0814, hi = 0x2e1c3a, tooth = 0xe8dcc8;
      const leg = (sx) => M.merge([M.beam([0, 0, 0], [sx * 0.42, 0.26, 0.04], 0.07, shellD), M.beam([sx * 0.42, 0.26, 0.04], [sx * 0.78, -0.32, 0.1], 0.05, shell),
        M.p(cone(0.03, 0.12, 4), hi, [sx * 0.79, -0.37, 0.1], [Math.PI, 0, 0])]);
      const legL = leg(1), legR = leg(-1);
      return [
        { name: 'body', geo: M.merge([
          M.p(sph(0.36, 9, 6), shell, [0, 0.36, -0.15], 0, [1.1, 0.55, 1.35]), M.p(sph(0.26, 8, 6), hi, [0, 0.38, 0.28], 0, [1.1, 0.6, 1]), M.p(sph(0.18, 8, 6), shell, [0, 0.36, 0.52], 0, [1.2, 0.7, 1]),
          ...[-0.45, -0.2, 0.05].map((z, i) => M.p(cone(0.05, 0.22, 4), shellD, [0.1 * (i % 2 ? 1 : -1), 0.56 - i * 0.02, z], [-0.3, 0, 0])),
          ...[-1, 1].map((sx) => M.p(cone(0.04, 0.2, 4), tooth, [sx * 0.08, 0.3, 0.68], [Math.PI / 2 + 0.3, 0, sx * 0.5])),
          ...[-0.06, -0.02, 0.02, 0.06].map((x) => M.p(cone(0.015, 0.06, 3), tooth, [x, 0.28, 0.66], [Math.PI, 0, 0])),
        ], 0.05) },
        { name: 'eyes', glow: true, geo: M.merge([
          ...[[-0.07, 0.44, 0.64], [0.07, 0.44, 0.64], [0, 0.48, 0.62], [-0.12, 0.4, 0.6], [0.12, 0.4, 0.6]].map((p) => M.p(sph(0.035, 5, 4), 0xd890ff, p)),
          M.p(box(0.07, 0.04, 0.6), 0xb86cff, [0, 0.555, -0.15]),
        ], 0) },
        { name: 'cleg0L', pivot: [0.2, 0.36, 0.3], geo: legL }, { name: 'cleg1L', pivot: [0.24, 0.36, 0.0], geo: legL }, { name: 'cleg0L', pivot: [0.22, 0.36, -0.3], geo: legL },
        { name: 'cleg1R', pivot: [-0.2, 0.36, 0.3], geo: legR }, { name: 'cleg0R', pivot: [-0.24, 0.36, 0.0], geo: legR }, { name: 'cleg1R', pivot: [-0.22, 0.36, -0.3], geo: legR },
      ];
    }
    if (type === 'tentacle') {
      // an eldritch tentacle bursting from a pool of void: segmented, suckered, its upper half bends to slam
      const flesh = 0x6a2a8a, dark = 0x4a1a62, sucker = 0xe8c8d8;
      const suckers = (y0, y1, r, n) => Array.from({ length: n }, (_, i) => M.p(sph(0.07 + r * 0.05, 5, 4), sucker, [0, y0 + (y1 - y0) * i / Math.max(1, n - 1), r + 0.02], 0, [1, 1, 0.5]));
      return [
        { name: 'body', geo: M.merge([
          M.p(cyl(1.1, 1.2, 0.06, 18), 0x14081c, [0, 0.03, 0]), M.p(new T.TorusGeometry(1.0, 0.12, 5, 16), dark, [0, 0.06, 0], [Math.PI / 2, 0, 0]),
          M.p(cyl(0.45, 0.58, 1.0, 9), flesh, [0, 0.5, 0]), M.p(cyl(0.38, 0.46, 1.0, 9), dark, [0, 1.45, 0.04], [0.06, 0, 0]),
          ...suckers(0.3, 1.8, 0.45, 5),
        ], 0.05) },
        { name: 'tip', pivot: [0, 1.92, 0.06], geo: M.merge([
          M.p(cyl(0.3, 0.38, 1.0, 8), flesh, [0, 0.5, 0]), M.p(cyl(0.2, 0.3, 0.9, 8), dark, [0, 1.38, 0.08], [0.18, 0, 0]),
          M.p(cone(0.2, 0.7, 7), flesh, [0, 2.1, 0.28], [0.45, 0, 0]), ...suckers(0.2, 1.6, 0.3, 4),
        ], 0.05) },
        { name: 'glow', glow: true, geo: M.merge([0.6, 2.4, 4.1].map((a, i) => M.p(sph(0.09, 5, 4), 0xd060ff, [Math.cos(a) * 0.45, 0.6 + i * 0.4, Math.sin(a) * 0.45])), 0) },
      ];
    }
    if (type === 'cthulhu') {
      // Cthulhu: an octopoid head with a beard of tentacles, burning orange eyes, scaly bat wings and huge clawed arms
      const skin = 0x2a4a3a, dark = 0x1a2a22, hi = 0x3a5a48, claw = 0xd8d0b8;
      const arm = (sx) => M.merge([M.p(box(0.3, 1.0, 0.3), skin, [0, -0.5, 0]), M.p(box(0.26, 0.6, 0.26), hi, [0, -1.15, 0.05], [0.25, 0, 0]),
        ...[-0.09, 0, 0.09].map((x) => M.p(cone(0.05, 0.35, 4), claw, [x, -1.55, 0.18], [Math.PI + 0.5, 0, sx * x * 2]))]);
      const leg = M.merge([M.p(box(0.34, 0.8, 0.38), skin, [0, -0.4, 0]), M.p(box(0.4, 0.12, 0.5), dark, [0, -0.78, 0.06])]);
      const wing = (sx) => [M.p(box(1.3, 0.05, 0.9), dark, [sx * 0.95, 2.1, -0.45], [0.2, sx * 0.4, sx * 0.55]), M.p(box(0.06, 0.06, 1.3), skin, [sx * 0.75, 2.3, -0.5], [0.2, sx * 0.4, sx * 0.55])];
      return [
        { name: 'body', geo: M.merge([
          M.p(box(1.0, 0.95, 0.7), skin, [0, 1.3, 0]), M.p(box(0.8, 0.4, 0.6), hi, [0, 1.0, 0.05]), M.p(box(0.7, 0.25, 0.5), dark, [0, 0.82, 0]),
          ...wing(-1), ...wing(1),
          M.p(sph(0.55, 10, 8), hi, [0, 2.15, 0.05], 0, [1, 1.15, 1.1]), M.p(sph(0.4, 9, 7), skin, [0, 2.55, -0.2]),
          ...[-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((x, i) => M.p(cone(0.07, 0.9 - Math.abs(x) * 0.8, 5), i % 2 ? dark : skin, [x, 1.6, 0.48], [Math.PI + 0.12, 0, x * 0.6])),
          ...[[-0.55, 1.2], [0.55, 1.2], [-0.35, 0.9], [0.35, 0.9]].map(([x, y]) => M.p(cone(0.09, 1.2, 5), dark, [x, y, -0.5], [-2.3, 0, x])),
        ], 0.05) },
        { name: 'eyes', glow: true, geo: M.merge([M.p(sph(0.09, 6, 5), 0xff8a1a, [-0.2, 2.28, 0.55]), M.p(sph(0.09, 6, 5), 0xff8a1a, [0.2, 2.28, 0.55])], 0) },
        { name: 'legL', pivot: [-0.3, 0.8, 0], geo: leg }, { name: 'legR', pivot: [0.3, 0.8, 0], geo: leg.clone() },
        { name: 'armL', pivot: [-0.66, 1.72, 0], geo: arm(-1) }, { name: 'armR', pivot: [0.66, 1.72, 0], geo: arm(1) },
      ];
    }
    if (type === 'eye') {
      // the Eldritch Eye: a bloodshot eyeball in a ring of dark flesh, tentacles trailing beneath, a glowing violet iris
      const white = 0xe8dcd0, vein = 0xa0201a, flesh = 0x3a1a2a, fleshD = 0x22101c;
      const tent = (a, tilt, len) => M.p(cone(0.17, len, 5), fleshD, [Math.cos(a) * 0.55, -0.55 - len * 0.4, -0.3 + Math.sin(a) * 0.55], [Math.PI + tilt * Math.sin(a), 0, tilt * Math.cos(a)]);
      return [
        { name: 'body', geo: M.merge([
          M.p(sph(1.0, 14, 10), white, [0, 0, 0]), M.p(sph(0.85, 10, 8), flesh, [0, 0, -0.45], 0, [1.1, 1.1, 0.9]),
          M.p(new T.TorusGeometry(0.93, 0.17, 6, 18), flesh, [0, 0, 0.32]), M.p(new T.TorusGeometry(0.98, 0.09, 5, 18), fleshD, [0, 0, 0.18]),
          ...[0.3, 1.1, 2.0, 2.7, 3.6, 4.4, 5.3].map((a) => M.beam([Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.82], [Math.cos(a + 0.25) * 0.92, Math.sin(a + 0.25) * 0.92, 0.3], 0.045, vein)),
          ...[0.2, 1.3, 2.3, 3.3, 4.3, 5.4].map((a, i) => tent(a, 0.45, 1.1 + (i % 3) * 0.35)),
        ], 0.04) },
        { name: 'iris', glow: true, geo: M.merge([
          M.p(cyl(0.5, 0.5, 0.06, 18), 0xb86cff, [0, 0, 0.97], [Math.PI / 2, 0, 0]), M.p(cyl(0.34, 0.34, 0.07, 16), 0xe0b8ff, [0, 0, 0.985], [Math.PI / 2, 0, 0]),
          M.p(box(0.13, 0.52, 0.06), 0x050208, [0, 0, 1.01]),
        ], 0) },
      ];
    }
    if (type === 'cauldron') {
      // a witch's cauldron on iron legs over a fire, bubbling with green brew and bones
      const iron = 0x2a2a30, ironD = 0x18181c, wood = 0x5a3a1c, bone = 0xe8e0c8;
      return [
        { name: 'body', geo: M.merge([
          M.p(sph(1.0, 10, 8), iron, [0, 1.15, 0], 0, [1, 0.8, 1]), M.p(new T.TorusGeometry(0.88, 0.1, 5, 16), ironD, [0, 1.72, 0], [Math.PI / 2, 0, 0]),
          ...[0, 2.1, 4.2].map((a) => M.p(box(0.12, 0.8, 0.12), ironD, [Math.cos(a) * 0.75, 0.35, Math.sin(a) * 0.75])),
          ...[0, 1.2, 2.4, 3.6, 4.8].map((a) => M.p(cyl(0.08, 0.08, 1.0, 5), wood, [Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45], [Math.PI / 2, a, 0.3])),
          M.beam([0.3, 1.6, 0.2], [0.6, 2.3, 0.4], 0.06, bone), M.p(sph(0.12, 6, 4), bone, [0.62, 2.34, 0.42]), M.beam([-0.4, 1.6, -0.1], [-0.7, 2.1, -0.3], 0.05, bone),
          M.p(sph(0.16, 6, 5), bone, [-0.2, 1.78, -0.35]), M.p(box(0.05, 0.05, 0.03), C.black, [-0.15, 1.8, -0.2]),
        ]) },
        { name: 'brew', glow: true, geo: M.merge([M.p(cyl(0.8, 0.8, 0.05, 14), 0x7aef3a, [0, 1.66, 0]), M.p(sph(0.16, 6, 4), 0xb8ff6a, [0.3, 1.72, -0.2]), M.p(sph(0.12, 6, 4), 0xb8ff6a, [-0.25, 1.7, 0.3]),
          M.p(cone(0.4, 0.5, 6), 0xff8a2a, [0, 0.25, 0]), M.p(cone(0.22, 0.4, 5), 0xffd04a, [0.15, 0.25, 0.1])], 0.04) },
      ];
    }
    // pumpkin jack: scarecrow body on a pole with a carved pumpkin head
    const org = 0xe8761e, orgD = 0xc25e14, burlap = 0x8a6a3a, cloth = 0x5a3a6a, hay = 0xe2c35a, wood = 0x6a4a2a, glow = 0xffc93a;
    return [
      { name: 'body', geo: M.merge([
        M.p(cyl(0.05, 0.06, 1.15, 5), wood, [0, 0.58, 0]), M.p(box(0.5, 0.5, 0.3), cloth, [0, 1.02, 0]), M.p(box(0.52, 0.12, 0.32), burlap, [0, 0.8, 0]),
        M.p(box(0.12, 0.16, 0.04), cloth, [-0.15, 0.7, 0.12]), M.p(box(0.12, 0.12, 0.04), cloth, [0.12, 0.72, 0.12]),
        M.p(cyl(0.04, 0.04, 1.4, 5), wood, [0, 1.18, 0], [0, 0, Math.PI / 2]), M.p(box(0.36, 0.2, 0.2), cloth, [0.36, 1.18, 0]), M.p(box(0.36, 0.2, 0.2), cloth, [-0.36, 1.18, 0]),
        M.p(cone(0.09, 0.26, 5), hay, [0.7, 1.18, 0], [0, 0, -Math.PI / 2]), M.p(cone(0.09, 0.26, 5), hay, [-0.7, 1.18, 0], [0, 0, Math.PI / 2]),
        M.p(cone(0.14, 0.18, 6), hay, [0, 1.3, 0]),
        M.p(sph(0.42, 9, 6), org, [0, 1.66, 0], 0, [1.15, 0.88, 1.05]), M.p(sph(0.3, 7, 5), orgD, [0.26, 1.66, -0.02]), M.p(sph(0.3, 7, 5), orgD, [-0.26, 1.66, -0.02]),
        M.p(cyl(0.05, 0.07, 0.2, 5), 0x4a6a2a, [0, 2.04, 0], [0.2, 0, 0.2]), M.p(box(0.22, 0.02, 0.12), 0x5a8a30, [0.12, 2.02, 0], [0, 0, -0.3]),
      ]) },
      { name: 'face', glow: true, geo: M.merge([
        M.p(box(0.12, 0.12, 0.06), glow, [0.16, 1.74, 0.39], [0, 0, Math.PI / 4]), M.p(box(0.12, 0.12, 0.06), glow, [-0.16, 1.74, 0.39], [0, 0, Math.PI / 4]),
        M.p(box(0.4, 0.07, 0.06), glow, [0, 1.52, 0.39]), M.p(box(0.07, 0.07, 0.06), glow, [-0.1, 1.58, 0.39]), M.p(box(0.07, 0.07, 0.06), glow, [0.1, 1.46, 0.39]),
      ], 0) },
    ];
  };

  // ---------- golem boss (regular hierarchy, one material per golem for flashes) ----------
  // c: { stone, stoneDark, moss, lava } from enemies.json.
  M.golem = function (c = {}) {
    const mat = new T.MeshLambertMaterial({ vertexColors: true }), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    const st = c.stone ?? 0x7a776e, stD = c.stoneDark ?? 0x5a5850, moss = c.moss ?? 0x4f6a3a, lava = c.lava ?? 0xff8a3a;
    const mk = (parts, g) => new T.Mesh(M.merge(parts, 0.1), g ? glowMat : mat);
    const root = new T.Group(), torso = new T.Group(), head = new T.Group();
    torso.position.y = 2.5; root.add(torso);
    torso.add(mk([rk(1.1, 1, st, [0, 0, 0], [1.35, 1.1, 0.95]), rk(0.55, 2, moss, [0.95, 0.78, 0]), rk(0.55, 3, moss, [-0.95, 0.78, -0.1]), rk(0.5, 4, stD, [0, -0.85, 0], [1.4, 0.8, 1])]));
    torso.add(mk([M.p(oct(0.3), lava, [0, 0.1, 1.0]), M.p(box(0.08, 0.6, 0.05), lava, [0.35, -0.2, 0.98], [0, 0, 0.4]), M.p(box(0.08, 0.5, 0.05), lava, [-0.4, 0.3, 0.98], [0, 0, -0.5])], true));
    head.position.set(0, 1.35, 0.2); torso.add(head);
    head.add(mk([rk(0.48, 5, st, [0, 0, 0], [1.1, 0.9, 1]), M.p(box(0.72, 0.14, 0.3), stD, [0, 0.16, 0.34])]));
    head.add(mk([M.p(box(0.13, 0.07, 0.05), lava, [0.17, 0.03, 0.45]), M.p(box(0.13, 0.07, 0.05), lava, [-0.17, 0.03, 0.45])], true));
    const arm = (x, s) => {
      const a = new T.Group(); a.position.set(x, 0.55, 0); torso.add(a);
      a.add(mk([rk(0.5, s, st, [0, -0.45, 0]), rk(0.55, s + 1, stD, [0, -1.25, 0]), rk(0.66, s + 2, st, [0, -2.05, 0.1], [1, 0.9, 1.1])]));
      return a;
    };
    const leg = (x, s) => {
      const l = new T.Group(); l.position.set(x, 1.5, 0); root.add(l);
      l.add(mk([rk(0.55, s, stD, [0, -0.45, 0]), M.p(box(0.85, 0.5, 1.1), st, [0, -1.25, 0.12])]));
      return l;
    };
    return { root, torso, head, armL: arm(1.5, 6), armR: arm(-1.5, 9), legL: leg(0.65, 12), legR: leg(-0.65, 14), mat, glowMat };
  };
  // The Heap: a huge alien blob with the farmhouse furniture it swallowed sticking out of it. Same
  // joints as the golem (torso, head, arms = pseudopods, legs = stubs) so it shares the golem ai.
  // c: { stone = skin, stoneDark = dark skin, moss = furniture wood, lava = glow }.
  M.bigblob = function (c = {}) {
    const mat = new T.MeshLambertMaterial({ vertexColors: true }), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    const sk = c.stone ?? 0x6ac83a, skD = c.stoneDark ?? 0x3a8a2a, wd = c.moss ?? 0x8a5a2b, gl = c.lava ?? 0xd8ff6a;
    const mk = (parts, g) => new T.Mesh(M.merge(parts, 0.08), g ? glowMat : mat);
    const root = new T.Group(), torso = new T.Group(), head = new T.Group();
    torso.position.y = 2.2; root.add(torso);
    // a whole part list moved and turned as one piece
    const piece = (parts, pos, rot) => {
      const w = new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(1, 1, 1));
      return parts.map((p) => ({ geo: p.geo, color: p.color, m: w.clone().multiply(p.m) }));
    };
    const chair = (pos, rot) => piece([M.p(box(0.8, 0.1, 0.8), wd, [0, 0, 0]), M.p(box(0.8, 0.9, 0.1), wd, [0, 0.45, -0.35]), ...[[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].map(([x, z]) => M.p(box(0.08, 0.6, 0.08), wd, [x, -0.3, z]))], pos, rot);
    torso.add(mk([
      M.p(sph(2.0, 12, 9), sk, [0, 0, 0], 0, [1.15, 0.95, 1.05]), M.p(sph(1.1, 9, 7), skD, [1.1, -0.6, -0.8]), M.p(sph(0.9, 8, 6), skD, [-1.2, -0.4, 0.6]),
      M.p(sph(0.7, 8, 6), sk, [0.6, 1.4, -0.6]), M.p(sph(0.5, 7, 5), skD, [-0.9, 1.2, -0.9]),
      ...chair([1.7, 0.9, 0.9], [0.9, 0.6, -0.4]),
      M.p(box(1.6, 0.12, 1.0), wd, [-1.7, 0.6, -0.6], [0.4, 0.3, 1.0]), M.p(box(0.12, 0.9, 0.12), wd, [-2.2, 1.1, -0.4], [0.4, 0.3, 1.0]),
      M.p(box(0.9, 0.7, 0.6), 0x2a2a2e, [0.4, 1.2, 1.5], [0.5, -0.4, 0.2]), M.p(box(0.75, 0.55, 0.05), 0x5a7a8a, [0.45, 1.3, 1.82], [0.5, -0.4, 0.2]),
      M.p(box(0.9, 1.9, 0.12), 0x6a3a22, [-0.5, 1.6, -1.6], [-0.6, 0.2, 0.3]), M.p(sph(0.08, 5, 4), C.gold, [-0.2, 1.7, -1.4]),
      M.p(cyl(0.05, 0.05, 1.3, 5), C.steelD, [1.9, -0.2, -1.0], [0.3, 0, -1.1]), M.p(cone(0.4, 0.4, 7), 0xe8d8a0, [2.4, 0.1, -1.1], [0, 0, -1.1]),
    ]));
    torso.add(mk([M.p(sph(0.25, 6, 4), gl, [1.3, 0.6, 1.4]), M.p(sph(0.2, 6, 4), gl, [-1.5, -0.2, 1.2]), M.p(sph(0.18, 6, 4), gl, [0.2, -0.9, 1.8]), M.p(sph(0.15, 6, 4), gl, [-0.8, 0.9, 1.5])], true));
    head.position.set(0, 1.5, 1.0); torso.add(head);
    head.add(mk([M.p(sph(0.85, 9, 7), sk, [0, 0, 0], 0, [1.1, 0.8, 0.9]), M.p(box(1.0, 0.12, 0.1), 0x1a4a10, [0, -0.35, 0.72], [0.2, 0, 0])]));
    head.add(mk([M.p(sph(0.2, 6, 4), gl, [0.35, 0.2, 0.68]), M.p(sph(0.2, 6, 4), gl, [-0.35, 0.2, 0.68]), M.p(sph(0.14, 6, 4), gl, [0, 0.48, 0.6])], true));
    const pod = (x, s) => {
      const a = new T.Group(); a.position.set(x, 0.1, 0.3); torso.add(a);
      a.add(mk([M.p(sph(0.6, 8, 6), sk, [0, -0.5, 0]), M.p(sph(0.55, 8, 6), skD, [0, -1.25, 0.05]), M.p(sph(0.7, 8, 6), sk, [0, -1.95, 0.1], 0, [1.1, 0.8, 1.1])]));
      return a;
    };
    const stub = (x) => { const l = new T.Group(); l.position.set(x, 1.0, 0); root.add(l); l.add(mk([M.p(sph(0.7, 8, 6), skD, [0, -0.55, 0.1], 0, [1, 0.7, 1.2])])); return l; };
    return { root, torso, head, armL: pod(2.0, 1), armR: pod(-2.0, -1), legL: stub(0.9), legR: stub(-0.9), mat, glowMat };
  };
  // The mutated stag: a huge deer warped by the crash, with branching antlers and glowing growths.
  // Front legs are the "arms" (rearing stomps), back legs the "legs"; the torso tilts into a charge.
  // c: { stone = fur, stoneDark = dark fur, moss = antlers, lava = glow }.
  M.deer = function (c = {}) {
    const mat = new T.MeshLambertMaterial({ vertexColors: true }), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    const fur = c.stone ?? 0x8a6a4a, furD = c.stoneDark ?? 0x5a4030, ant = c.moss ?? 0xe8e0c8, gl = c.lava ?? 0x7dff6a;
    const mk = (parts, g) => new T.Mesh(M.merge(parts, 0.08), g ? glowMat : mat);
    const root = new T.Group(), torso = new T.Group(), head = new T.Group();
    torso.position.y = 2.6; root.add(torso);
    torso.add(mk([
      M.p(box(1.5, 1.3, 3.2), fur, [0, 0, 0]), M.p(box(1.3, 0.3, 3.0), furD, [0, 0.75, -0.1]), M.p(box(1.2, 0.6, 0.9), 0xd8c8a8, [0, -0.45, 1.3]),
      M.p(box(0.4, 0.5, 0.3), 0xf0e8d8, [0, 0.2, -1.7]), M.p(box(0.7, 1.4, 0.7), fur, [0, 0.9, 1.5], [-0.5, 0, 0]),
      M.p(sph(0.45, 7, 5), furD, [0.6, 0.6, -0.6]), M.p(sph(0.35, 6, 5), furD, [-0.7, 0.4, 0.4]),
      M.beam([0.3, 0.6, -0.9], [0.7, 1.5, -1.2], 0.12, ant), M.beam([-0.3, 0.6, -0.3], [-0.8, 1.3, -0.4], 0.12, ant),
    ]));
    torso.add(mk([M.p(sph(0.22, 6, 4), gl, [0.76, 0.1, 0.2]), M.p(sph(0.18, 6, 4), gl, [-0.76, -0.2, -0.6]), M.p(sph(0.15, 6, 4), gl, [0.5, 0.66, 0.6]), M.p(sph(0.2, 6, 4), gl, [-0.4, 0.68, -1.0])], true));
    head.position.set(0, 1.6, 2.0); torso.add(head);
    const A = [M.p(box(0.7, 0.7, 1.1), fur, [0, 0, 0.2]), M.p(box(0.5, 0.45, 0.6), furD, [0, -0.15, 0.9]), M.p(box(0.2, 0.15, 0.1), C.black, [0, -0.05, 1.22]),
      M.p(cone(0.15, 0.5, 4), fur, [0.45, 0.35, 0], [0, 0, -1.0]), M.p(cone(0.15, 0.5, 4), fur, [-0.45, 0.35, 0], [0, 0, 1.0])];
    for (const s of [1, -1]) {
      const b0 = [s * 0.25, 0.35, 0.05], b1 = [s * 0.9, 1.4, -0.2], b2 = [s * 1.5, 2.2, -0.5];
      A.push(M.beam(b0, b1, 0.12, ant), M.beam(b1, b2, 0.1, ant), M.beam(b1, [s * 0.7, 2.1, 0.3], 0.08, ant), M.beam(b2, [s * 1.4, 2.8, -0.2], 0.07, ant), M.beam(b2, [s * 2.1, 2.5, -0.7], 0.07, ant), M.beam([s * 1.2, 1.8, -0.35], [s * 1.9, 1.7, 0.1], 0.07, ant));
    }
    head.add(mk(A));
    head.add(mk([M.p(box(0.14, 0.12, 0.05), gl, [0.25, 0.12, 0.76]), M.p(box(0.14, 0.12, 0.05), gl, [-0.25, 0.12, 0.76]), M.p(box(0.1, 0.16, 0.05), gl, [0, 0.3, 0.76])], true));
    const legParts = (h) => [M.p(box(0.38, h * 0.55, 0.42), fur, [0, -h * 0.27, 0]), M.p(box(0.24, h * 0.5, 0.26), furD, [0, -h * 0.78, 0]), M.p(box(0.3, 0.2, 0.36), 0x2a2018, [0, -h + 0.08, 0.04])];
    const front = (x) => { const a = new T.Group(); a.position.set(x, -0.4, 1.2); torso.add(a); a.add(mk(legParts(2.2))); return a; };
    const back = (x) => { const l = new T.Group(); l.position.set(x, 2.2, -1.2); root.add(l); l.add(mk(legParts(2.2))); return l; };
    return { root, torso, head, armL: front(0.55), armR: front(-0.55), legL: back(0.55), legR: back(-0.55), mat, glowMat };
  };
  // The Tiki Warlord: a huge orc in a carved tiki mask, swinging a bone club. Golem joints, golem ai.
  // c: { stone = skin, stoneDark = dark skin, moss = mask wood, lava = glow }.
  M.orc = function (c = {}) {
    const mat = new T.MeshLambertMaterial({ vertexColors: true }), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    const sk = c.stone ?? 0x5a7a3a, skD = c.stoneDark ?? 0x3a5a2a, wd = c.moss ?? 0x8a5a2b, gl = c.lava ?? 0xd890ff, bone = 0xe8e0c8, cloth = 0x6a2a1a;
    const mk = (parts, g) => new T.Mesh(M.merge(parts, 0.08), g ? glowMat : mat);
    const root = new T.Group(), torso = new T.Group(), head = new T.Group();
    torso.position.y = 2.4; root.add(torso);
    torso.add(mk([
      M.p(box(2.0, 1.5, 1.2), sk, [0, 0.1, 0]), M.p(box(1.7, 0.6, 1.05), skD, [0, -0.85, 0]), M.p(box(1.9, 0.35, 1.15), cloth, [0, -1.15, 0]),
      M.p(box(0.7, 0.9, 0.12), cloth, [0, -1.6, 0.5]), M.p(sph(0.55, 7, 5), sk, [1.0, 0.7, 0]), M.p(sph(0.55, 7, 5), sk, [-1.0, 0.7, 0]),
      M.p(box(0.9, 0.25, 0.9), bone, [1.05, 1.05, 0], [0, 0, -0.3]), M.p(box(0.9, 0.25, 0.9), bone, [-1.05, 1.05, 0], [0, 0, 0.3]),
      ...[-0.5, -0.17, 0.17, 0.5].map((x) => M.p(cone(0.1, 0.32, 4), bone, [x, 0.55, 0.62], [Math.PI / 2, 0, 0])),
      M.p(new T.TorusGeometry(0.75, 0.06, 4, 14, Math.PI), bone, [0, 0.55, 0.3], [0.2, 0, Math.PI]),
    ]));
    torso.add(mk([M.p(box(0.12, 0.6, 0.04), gl, [0.45, 0.1, 0.61], [0, 0, 0.3]), M.p(box(0.12, 0.5, 0.04), gl, [-0.45, 0.1, 0.61], [0, 0, -0.3])], true));
    head.position.set(0, 1.2, 0.2); torso.add(head);
    // the tiki mask: a tall carved plank with a scowling painted face and a crown of feathers
    head.add(mk([
      M.p(box(0.8, 0.75, 0.75), skD, [0, 0, -0.1]), M.p(box(1.0, 1.4, 0.2), wd, [0, 0.15, 0.36]), M.p(box(1.06, 0.12, 0.24), 0x5a3a1c, [0, -0.45, 0.38]),
      M.p(box(0.8, 0.1, 0.06), 0xd83a2a, [0, 0.45, 0.48]), M.p(box(0.7, 0.2, 0.06), 0x1a1410, [0, -0.25, 0.48]), ...[-0.25, -0.08, 0.08, 0.25].map((x) => M.p(box(0.08, 0.12, 0.05), bone, [x, -0.2, 0.5])),
      M.p(box(0.18, 0.3, 0.12), wd, [0, 0.05, 0.52]), M.p(box(0.3, 0.06, 0.05), 0x2a8aca, [0.25, 0.65, 0.48]), M.p(box(0.3, 0.06, 0.05), 0x2a8aca, [-0.25, 0.65, 0.48]),
      ...[-0.45, -0.22, 0, 0.22, 0.45].map((x, i) => M.p(box(0.12, 0.7, 0.05), [0xd83a2a, 0xf0d040, 0x2a8aca, 0xf0d040, 0xd83a2a][i], [x, 1.1, 0.3], [-0.2, 0, x * 0.7])),
      M.p(cone(0.12, 0.35, 4), bone, [0.42, -0.5, 0.25], [Math.PI, 0, 0]), M.p(cone(0.12, 0.35, 4), bone, [-0.42, -0.5, 0.25], [Math.PI, 0, 0]),
    ]));
    head.add(mk([M.p(box(0.2, 0.14, 0.05), gl, [0.25, 0.2, 0.49]), M.p(box(0.2, 0.14, 0.05), gl, [-0.25, 0.2, 0.49])], true));
    const arm = (x, club) => {
      const a = new T.Group(); a.position.set(x, 0.6, 0); torso.add(a);
      const P = [M.p(box(0.6, 1.0, 0.6), sk, [0, -0.5, 0]), M.p(box(0.55, 0.9, 0.55), skD, [0, -1.35, 0.05]), M.p(box(0.62, 0.15, 0.62), bone, [0, -1.0, 0.05]), M.p(box(0.6, 0.5, 0.6), sk, [0, -1.95, 0.1])];
      if (club) P.push(M.p(cyl(0.16, 0.26, 2.4, 6), bone, [0, -2.2, 1.0], [Math.PI / 2 + 0.3, 0, 0]), M.p(sph(0.42, 7, 5), bone, [0, -2.5, 2.1]),
        ...[0, 1.6, 3.2, 4.8].map((r) => M.p(cone(0.1, 0.35, 4), 0xc8c0a8, [Math.cos(r) * 0.4, -2.5 + Math.sin(r) * 0.4, 2.15], [0, 0, r - Math.PI / 2])));
      a.add(mk(P));
      return a;
    };
    const leg = (x) => { const l = new T.Group(); l.position.set(x, 1.3, 0); root.add(l); l.add(mk([M.p(box(0.65, 0.8, 0.7), skD, [0, -0.4, 0]), M.p(box(0.6, 0.55, 0.65), sk, [0, -0.95, 0.05]), M.p(box(0.7, 0.2, 0.9), 0x3a2a1a, [0, -1.2, 0.15])])); return l; };
    return { root, torso, head, armL: arm(1.35, false), armR: arm(-1.35, true), legL: leg(0.55), legR: leg(-0.55), mat, glowMat };
  };
  // The Summoned Demon: crimson and horned, on bat wings, with burning eyes and runes in its chest.
  // c: { stone = skin, stoneDark = dark skin, moss = horns, lava = glow }.
  M.demon = function (c = {}) {
    const mat = new T.MeshLambertMaterial({ vertexColors: true }), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    const sk = c.stone ?? 0x7a1a2a, skD = c.stoneDark ?? 0x3a0a18, horn = c.moss ?? 0xe8d8c0, gl = c.lava ?? 0xff3a8a, wing = 0x2a0a14;
    const mk = (parts, g) => new T.Mesh(M.merge(parts, 0.08), g ? glowMat : mat);
    const root = new T.Group(), torso = new T.Group(), head = new T.Group();
    torso.position.y = 2.8; root.add(torso);
    const W2 = [];
    for (const s of [1, -1]) {
      W2.push(M.beam([s * 0.6, 0.7, -0.5], [s * 2.2, 2.2, -1.2], 0.12, skD), M.beam([s * 2.2, 2.2, -1.2], [s * 3.6, 1.2, -1.4], 0.09, skD));
      for (let i = 0; i < 4; i++) { const t = i / 3; W2.push(M.p(box(0.06, 1.8 - i * 0.2, 1.1), wing, [s * (1.3 + t * 2.0), 1.1 + (1 - t) * 0.6 - t * 0.2, -1.2], [0.1, s * 0.3, s * (0.5 - t * 0.3)])); }
    }
    torso.add(mk([
      M.p(box(1.8, 1.7, 1.1), sk, [0, 0.1, 0]), M.p(box(1.4, 0.8, 0.9), skD, [0, -1.0, 0]), M.p(sph(0.5, 7, 5), sk, [0.95, 0.75, 0]), M.p(sph(0.5, 7, 5), sk, [-0.95, 0.75, 0]),
      ...[-0.3, 0.3].map((x) => M.p(box(0.5, 0.35, 0.1), skD, [x, 0.45, 0.55])), ...[-0.15, -0.5].map((y) => M.p(box(0.9, 0.12, 0.08), skD, [0, y, 0.55])),
      M.p(cone(0.25, 1.4, 5), skD, [0, -1.4, -0.7], [-2.4, 0, 0]), M.p(cone(0.12, 0.4, 4), skD, [0, -2.0, -1.3], [-2.0, 0, 0]),
      ...W2,
    ]));
    torso.add(mk([M.p(oct(0.25), gl, [0, 0.3, 0.6]), M.p(box(0.06, 0.7, 0.04), gl, [0.3, -0.1, 0.58], [0, 0, 0.5]), M.p(box(0.06, 0.7, 0.04), gl, [-0.3, -0.1, 0.58], [0, 0, -0.5]),
      M.p(box(0.7, 0.06, 0.04), gl, [0, -0.45, 0.58])], true));
    head.position.set(0, 1.35, 0.25); torso.add(head);
    const H = [M.p(box(0.85, 0.8, 0.8), sk, [0, 0, 0]), M.p(box(0.7, 0.3, 0.5), skD, [0, -0.35, 0.3]), M.p(box(0.9, 0.12, 0.2), skD, [0, 0.22, 0.38]),
      ...[-0.22, -0.08, 0.08, 0.22].map((x) => M.p(cone(0.05, 0.18, 4), horn, [x, -0.42, 0.55], [Math.PI, 0, 0]))];
    for (const s of [1, -1]) H.push(M.beam([s * 0.35, 0.35, 0], [s * 0.85, 0.9, -0.2], 0.12, horn), M.beam([s * 0.85, 0.9, -0.2], [s * 0.95, 1.6, -0.55], 0.08, horn), M.beam([s * 0.95, 1.6, -0.55], [s * 0.75, 1.95, -0.9], 0.05, horn));
    head.add(mk(H));
    head.add(mk([M.p(box(0.2, 0.1, 0.05), gl, [0.2, 0.08, 0.41], [0, 0, -0.25]), M.p(box(0.2, 0.1, 0.05), gl, [-0.2, 0.08, 0.41], [0, 0, 0.25]), M.p(box(0.4, 0.08, 0.05), 0xffb04a, [0, -0.3, 0.56])], true));
    const arm = (x) => {
      const a = new T.Group(); a.position.set(x, 0.65, 0); torso.add(a);
      a.add(mk([M.p(box(0.5, 1.0, 0.5), sk, [0, -0.5, 0]), M.p(box(0.45, 1.0, 0.45), skD, [0, -1.4, 0.05]), M.p(box(0.55, 0.4, 0.55), sk, [0, -2.0, 0.1]),
        ...[-0.18, 0, 0.18].map((dx) => M.p(cone(0.06, 0.45, 4), horn, [dx, -2.35, 0.25], [Math.PI - 0.4, 0, 0]))]));
      return a;
    };
    const leg = (x) => { const l = new T.Group(); l.position.set(x, 1.6, 0); root.add(l); l.add(mk([M.p(box(0.6, 0.9, 0.65), sk, [0, -0.45, 0.1]), M.p(box(0.45, 0.8, 0.5), skD, [0, -1.1, -0.15], [0.35, 0, 0]), M.p(box(0.5, 0.25, 0.6), 0x1a0408, [0, -1.48, 0.05])])); return l; };
    return { root, torso, head, armL: arm(1.25), armR: arm(-1.25), legL: leg(0.5), legR: leg(-0.5), mat, glowMat };
  };
  M.boss = (model, colors) => (model === 'bigblob' ? M.bigblob(colors) : model === 'deer' ? M.deer(colors) : model === 'orc' ? M.orc(colors) : model === 'demon' ? M.demon(colors) : M.golem(colors));

  // ---------- altar of power and its totem ----------
  // Stone plinth ringed by rune stones. Rune parts are white and use their own material so the
  // altar can change colour when it awakens.
  M.altar = function () {
    const st = 0x6e6a62, stD = 0x4c4943, moss = 0x56703a, W = 0xffffff;
    const root = new T.Group(), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    const P = [
      M.p(cyl(2.0, 2.2, 0.36, 8), stD, [0, 0.18, 0]), M.p(cyl(1.5, 1.7, 0.36, 8), st, [0, 0.54, 0], [0, Math.PI / 8, 0]),
      M.p(cyl(0.62, 0.8, 0.7, 6), stD, [0, 1.07, 0]), M.p(cyl(0.95, 0.7, 0.2, 6), st, [0, 1.52, 0]),
      rk(0.4, 21, moss, [1.35, 0.72, 0.55]), rk(0.32, 23, moss, [-1.05, 0.7, -0.95]), rk(0.28, 25, stD, [-1.6, 0.25, 1.2]),
    ];
    const GL = [M.p(new T.TorusGeometry(2.45, 0.06, 3, 28), W, [0, 0.04, 0], [Math.PI / 2, 0, 0]), M.p(new T.TorusGeometry(0.72, 0.05, 3, 16), W, [0, 1.63, 0], [Math.PI / 2, 0, 0])];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4, ox = Math.cos(a), oz = Math.sin(a), ry = Math.PI / 2 - a, R = 2.75;
      P.push(M.p(box(0.6, 2.1, 0.42), i % 2 ? st : stD, [ox * R, 1.0, oz * R], [0, ry, 0.07 * (i % 2 ? 1 : -1)]));
      P.push(M.p(box(0.7, 0.18, 0.5), stD, [ox * R, 2.1, oz * R], [0, ry, 0]));
      for (const s of [1, -1]) GL.push(M.p(box(0.14, 1.1, 0.04), W, [ox * (R + s * 0.22), 1.1, oz * (R + s * 0.22)], [0, ry, 0]));
    }
    root.add(M.mesh(P));
    root.add(new T.Mesh(M.merge(GL, 0), glowMat));
    const totemMount = new T.Group(); totemMount.position.y = 2.2; root.add(totemMount);
    return { root, glowMat, totemMount };
  };
  // A treasure chest: wooden box with iron bands and a gold lock. The lid swings open on its pivot at
  // the back edge; the glow inside (glowMat) lights up when it opens.
  M.chest = function () {
    const wood = 0x8a5a2b, woodD = 0x5a3a1c, iron = 0x3a3d43, gold = 0xe8c040;
    const root = new T.Group(), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    root.add(M.mesh([
      M.p(box(1.3, 0.7, 0.86), wood, [0, 0.35, 0]), M.p(box(1.34, 0.08, 0.9), woodD, [0, 0.04, 0]),
      M.p(box(0.1, 0.72, 0.9), iron, [-0.42, 0.36, 0]), M.p(box(0.1, 0.72, 0.9), iron, [0.42, 0.36, 0]),
      M.p(box(1.32, 0.08, 0.88), iron, [0, 0.66, 0]),
    ]));
    root.add(new T.Mesh(M.merge([M.p(box(1.16, 0.06, 0.72), 0xffffff, [0, 0.67, 0])], 0), glowMat));
    const lid = new T.Group(); lid.position.set(0, 0.7, -0.43); root.add(lid);
    const L = M.mesh([
      M.p(new T.CylinderGeometry(0.43, 0.43, 1.3, 8, 1, false, 0, Math.PI), wood, [0, 0, 0.43], [0, 0, Math.PI / 2], [0.7, 1, 1]),   // half barrel on top
      M.p(box(1.3, 0.04, 0.86), woodD, [0, 0.01, 0.43]),
      M.p(box(0.1, 0.34, 0.92), iron, [-0.42, 0.16, 0.43]), M.p(box(0.1, 0.34, 0.92), iron, [0.42, 0.16, 0.43]),
      M.p(box(0.22, 0.24, 0.06), gold, [0, 0.0, 0.88]), M.p(box(0.08, 0.1, 0.07), C.black, [0, -0.02, 0.9]),
    ]);
    lid.add(L);
    return { root, lid, glowMat };
  };
  // An experience barrel: oak staves and iron hoops, soul crystals glowing green out of the top.
  M.barrel = function () {
    const root = new T.Group(), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    root.add(M.mesh([
      M.p(cyl(0.5, 0.45, 1.2, 10), 0x8a5a2b, [0, 0.6, 0]), M.p(cyl(0.56, 0.56, 0.4, 10), 0x9a6a35, [0, 0.6, 0]),
      ...[0.18, 0.6, 1.02].map((y) => M.p(new T.TorusGeometry(y === 0.6 ? 0.57 : 0.5, 0.035, 4, 14), 0x3a3d43, [0, y, 0], [Math.PI / 2, 0, 0])),
      M.p(cyl(0.44, 0.44, 0.05, 10), 0x5a3a1c, [0, 1.19, 0]),
    ]));
    root.add(new T.Mesh(M.merge([M.p(oct(0.16), 0xffffff, [0.1, 1.36, 0.05], 0, [1, 1.6, 1]), M.p(oct(0.12), 0xffffff, [-0.15, 1.3, -0.1], 0, [1, 1.5, 1]), M.p(oct(0.1), 0xffffff, [0.05, 1.28, -0.2], 0, [1, 1.5, 1]),
      M.p(box(0.5, 0.05, 0.05), 0xffffff, [0, 0.82, 0.5])], 0.1), glowMat));
    return { root, glowMat };
  };
  // A wayside shrine: a stone niche on a plinth. Holy: Mary in a blue robe and white veil under a golden
  // halo, candles and flowers at her feet. Unholy: blackened stone, an upside-down cross, red candles,
  // and a black goat with curling horns and burning eyes sitting on the roof. glowMat tints the glowing parts.
  M.shrine = function (unholy) {
    const root = new T.Group(), glowMat = new T.MeshBasicMaterial({ vertexColors: true });
    const stone = unholy ? 0x2a2426 : 0x9a948a, stoneD = unholy ? 0x18141a : 0x7a746a, P = [], GL = [];
    P.push(M.p(box(1.7, 0.4, 1.2), stoneD, [0, 0.2, 0]), M.p(box(1.4, 0.25, 1.0), stone, [0, 0.52, 0]),
      M.p(box(0.28, 1.9, 0.5), stone, [-0.62, 1.6, -0.1]), M.p(box(0.28, 1.9, 0.5), stone, [0.62, 1.6, -0.1]), M.p(box(1.5, 0.12, 0.7), stone, [0, 2.6, -0.05]),
      M.p(cone(0.95, 0.65, 4), stoneD, [0, 3.0, -0.05], [0, Math.PI / 4, 0], [1, 1, 0.6]), M.p(box(1.24, 1.8, 0.1), stoneD, [0, 1.55, -0.32]));
    const candle = (x, z, c) => { P.push(M.p(cyl(0.05, 0.05, 0.22, 6), unholy ? 0x6a0a0a : 0xf0e8d0, [x, 0.75, z])); GL.push(M.p(cone(0.05, 0.12, 5), c, [x, 0.92, z])); };
    if (!unholy) {
      const robe = 0x3a6ab8, veil = 0xf2f0ea, skin = 0xe8c8a8;
      P.push(M.p(cone(0.38, 1.25, 10), robe, [0, 1.27, -0.05]), M.p(cone(0.3, 0.7, 10), veil, [0, 1.92, -0.07]),
        M.p(sph(0.13, 8, 6), skin, [0, 2.02, 0.02]), M.p(box(0.08, 0.2, 0.06), skin, [-0.05, 1.55, 0.25], [0.3, 0, 0.4]), M.p(box(0.08, 0.2, 0.06), skin, [0.05, 1.55, 0.25], [0.3, 0, -0.4]),
        ...[[-0.45, 0.35, 0xe84a6a], [0.4, 0.38, 0xf0e050], [-0.3, 0.42, 0xf0f0f0], [0.5, 0.25, 0xe84a6a]].map(([x, z, c]) => M.p(sph(0.07, 5, 4), c, [x, 0.7, z])));
      GL.push(M.p(new T.TorusGeometry(0.2, 0.025, 4, 18), 0xffe080, [0, 2.12, -0.12]), M.p(box(0.06, 0.32, 0.03), 0xfff0b0, [0, 2.45, -0.36]), M.p(box(0.2, 0.06, 0.03), 0xfff0b0, [0, 2.5, -0.36]));
      for (const [x, z] of [[-0.55, 0.3], [-0.2, 0.42], [0.22, 0.42], [0.55, 0.3]]) candle(x, z, 0xffc040);
    } else {
      const fur = 0x2e262c, horn = 0xc8b8a0, cross = 0x7a0a0a;
      P.push(M.p(box(0.07, 0.9, 0.05), cross, [0, 1.45, -0.27]), M.p(box(0.4, 0.07, 0.05), cross, [0, 1.15, -0.27]),   // upside down
        // the goat, sitting on the roof
        M.p(box(0.5, 0.42, 0.8), fur, [0, 3.48, -0.1]), M.p(box(0.42, 0.5, 0.4), fur, [0, 3.62, 0.25], [-0.3, 0, 0]),
        ...[-0.16, 0.16].map((x) => M.p(box(0.12, 0.42, 0.12), fur, [x, 3.3, 0.38])), ...[-0.18, 0.18].map((x) => M.p(box(0.14, 0.2, 0.42), fur, [x, 3.3, -0.25])),
        M.p(box(0.26, 0.3, 0.42), fur, [0, 3.95, 0.48], [0.35, 0, 0]), M.p(box(0.16, 0.16, 0.22), fur, [0, 3.82, 0.7], [0.5, 0, 0]),
        M.p(cone(0.06, 0.25, 4), fur, [0, 3.7, 0.72], [Math.PI, 0, 0]),
        ...[-1, 1].flatMap((sx) => [M.p(cone(0.06, 0.4, 5), horn, [sx * 0.16, 4.18, 0.4], [-0.6, 0, sx * 0.5]), M.p(cone(0.045, 0.3, 5), horn, [sx * 0.3, 4.28, 0.22], [-1.5, 0, sx * 1.1])]),
        ...[-1, 1].map((sx) => M.p(box(0.1, 0.05, 0.2), fur, [sx * 0.2, 4.0, 0.42], [0, 0, sx * 0.8])),
        M.p(cyl(0.03, 0.06, 0.5, 4), fur, [0, 3.45, -0.6], [-1.2, 0, 0]));
      GL.push(M.p(box(0.06, 0.05, 0.03), 0xff2a1a, [-0.07, 4.0, 0.69]), M.p(box(0.06, 0.05, 0.03), 0xff2a1a, [0.07, 4.0, 0.69]),
        M.p(cyl(0.6, 0.6, 0.02, 5), 0x8a0a0a, [0, 0.66, 0.15]));
      for (const [x, z] of [[-0.55, 0.3], [-0.2, 0.42], [0.22, 0.42], [0.55, 0.3]]) candle(x, z, 0xff3a1a);
    }
    root.add(new T.Mesh(M.merge(P, 0.05, unholy ? 21 : 17), M.matL), new T.Mesh(M.merge(GL, 0), glowMat));
    return { root, glowMat };
  };
  // Mokosh: a carved, tree-like totem of the Slavic mother goddess. A bark trunk on spreading roots, a
  // solemn face cut into it with amber eyes, an embroidered cloth (rushnyk) tied around it, a crown of
  // branches with a few leaves, red, white and black threads hanging from the crown and strung between its
  // branches (their own mesh under `sway`, pivoting at the crown, so they can move in the wind), and
  // candles at her feet. glowMat tints the eyes and the flames.
  M.mokosh = function () {
    const bark = 0x6a4a2e, barkD = 0x4a3220, wood = 0x9a7048, hole = 0x1a120c, red = 0xc8202a, white = 0xf0e8dc, cloth = 0xeee6d6, CROWN = 3.6;
    const root = new T.Group(), glowMat = new T.MeshBasicMaterial({ vertexColors: true }), P = [], GL = [], TH = [];
    P.push(M.p(cyl(0.42, 0.6, 2.8, 9), bark, [0, 1.4, 0]), M.p(cyl(0.34, 0.42, 0.6, 9), barkD, [0, 3.0, 0]));
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; P.push(M.beam([Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4], [Math.cos(a) * 1.15, 0.03, Math.sin(a) * 1.15], 0.18, barkD)); }
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.9; P.push(M.p(box(0.05, 2.0, 0.06), barkD, [Math.sin(a) * 0.53, 1.35, Math.cos(a) * 0.53], [0, a, 0])); }
    // the face: a heavy brow, deep eye sockets, a long nose, a closed mouth, cheeks and chin
    P.push(M.p(box(0.62, 0.12, 0.14), wood, [0, 2.02, 0.5]), M.p(box(0.18, 0.12, 0.06), hole, [0.15, 1.88, 0.52]), M.p(box(0.18, 0.12, 0.06), hole, [-0.15, 1.88, 0.52]),
      M.p(box(0.12, 0.34, 0.14), wood, [0, 1.68, 0.54]), M.p(box(0.3, 0.06, 0.06), hole, [0, 1.42, 0.53]), M.p(box(0.4, 0.1, 0.1), wood, [0, 1.31, 0.5]),
      M.p(box(0.12, 0.2, 0.1), wood, [0.26, 1.6, 0.47]), M.p(box(0.12, 0.2, 0.1), wood, [-0.26, 1.6, 0.47]));
    GL.push(M.p(box(0.08, 0.06, 0.03), 0xffb040, [0.15, 1.88, 0.56]), M.p(box(0.08, 0.06, 0.03), 0xffb040, [-0.15, 1.88, 0.56]));
    // the embroidered cloth, with red diamonds and two hanging ends
    P.push(M.p(cyl(0.57, 0.59, 0.22, 12), cloth, [0, 0.95, 0]), M.p(box(0.12, 0.6, 0.03), cloth, [0.32, 0.6, 0.5], [0, 0.5, 0.12]), M.p(box(0.12, 0.5, 0.03), cloth, [0.45, 0.62, 0.38], [0, 0.8, -0.1]));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.push(M.p(box(0.08, 0.08, 0.02), red, [Math.sin(a) * 0.595, 0.95, Math.cos(a) * 0.595], [0, a, Math.PI / 4])); }
    P.push(M.p(box(0.12, 0.05, 0.035), red, [0.32, 0.4, 0.51], [0, 0.5, 0.12]), M.p(box(0.12, 0.05, 0.035), red, [0.45, 0.47, 0.39], [0, 0.8, -0.1]));
    // the crown: branches spreading up and out, a twig off each, a few leaves
    const tips = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.2, r1 = 0.9 + (i % 3) * 0.25, y1 = 3.9 + (i % 2) * 0.35, mid = [Math.cos(a) * 0.5, 3.5, Math.sin(a) * 0.5], tip = [Math.cos(a) * r1, y1, Math.sin(a) * r1];
      const a2 = a + 0.5, twig = [Math.cos(a2) * r1 * 0.85, y1 + 0.25, Math.sin(a2) * r1 * 0.85];
      P.push(M.beam([Math.cos(a) * 0.15, 3.2, Math.sin(a) * 0.15], mid, 0.14, bark), M.beam(mid, tip, 0.09, barkD), M.beam(mid, twig, 0.05, barkD),
        M.p(oct(0.16), i % 2 ? 0x4a7a3a : 0x5a8a3a, tip, [i, i * 0.5, 0], [1.2, 0.6, 1]));
      tips.push(tip, twig);
    }
    // threads: one hanging from every branch and twig, a bead at the end, and red threads strung between branches
    const down = (p, y) => [p[0] * 1.02, p[1] - y, p[2] * 1.02];
    tips.forEach((t, i) => {
      const len = 0.7 + ((i * 37) % 7) * 0.12;
      TH.push(M.beam(t, down(t, len), 0.025, [red, white, red, 0x1a1414][i % 4]), M.p(sph(0.05, 5, 4), i % 2 ? 0xe8c040 : red, down(t, len + 0.04)));
    });
    for (let i = 0; i < 7; i++) {
      const a = tips[i * 2], b = tips[((i + 1) % 7) * 2], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.3, (a[2] + b[2]) / 2];
      TH.push(M.beam(a, m, 0.02, i % 2 ? white : red), M.beam(m, b, 0.02, i % 2 ? white : red));
    }
    // candles at her feet
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.45, r = 1.35 + (i % 2) * 0.2, h = 0.22 + (i % 3) * 0.1, x = Math.cos(a) * r, z = Math.sin(a) * r;
      P.push(M.p(cyl(0.06, 0.07, h, 6), 0xf0e6cc, [x, h / 2, z])); GL.push(M.p(cone(0.045, 0.13, 5), 0xffc050, [x, h + 0.07, z]));
    }
    root.add(new T.Mesh(M.merge(P, 0.06, 29), M.matL), new T.Mesh(M.merge(GL, 0), glowMat));
    const sway = new T.Group(), threads = new T.Mesh(M.merge(TH, 0.04, 31), M.matL);
    sway.position.y = CROWN; threads.position.y = -CROWN; sway.add(threads); root.add(sway);
    return { root, glowMat, sway };
  };
  // A little cat-eared totem pole with glowing eyes.
  M.totem = function () {
    const wood = 0x9a6a35, woodD = 0x5a3a1c, teal = 0x2e8a8a, red = 0xb8352a, glow = 0x8ff8ff;
    const g = new T.Group();
    g.add(M.mesh([
      M.p(box(0.36, 0.34, 0.32), wood, [0, 0.17, 0]), M.p(box(0.4, 0.06, 0.36), woodD, [0, 0.36, 0]), M.p(box(0.06, 0.06, 0.03), C.gold, [0, 0.24, 0.17]),
      M.p(box(0.32, 0.3, 0.3), wood, [0, 0.54, 0]), M.p(box(0.8, 0.07, 0.16), red, [0, 0.6, -0.02]), M.p(box(0.14, 0.05, 0.04), woodD, [0, 0.45, 0.16]),
      M.p(box(0.36, 0.28, 0.32), teal, [0, 0.83, 0]), M.p(box(0.16, 0.06, 0.04), woodD, [0, 0.74, 0.17]),
      M.p(cone(0.09, 0.2, 4), teal, [0.12, 1.05, 0], [0, Math.PI / 4, -0.2]), M.p(cone(0.09, 0.2, 4), teal, [-0.12, 1.05, 0], [0, Math.PI / 4, 0.2]),
    ]));
    g.add(M.mesh([M.p(box(0.07, 0.07, 0.03), glow, [0.08, 0.6, 0.16]), M.p(box(0.07, 0.07, 0.03), glow, [-0.08, 0.6, 0.16]),
      M.p(box(0.08, 0.06, 0.03), glow, [0.09, 0.88, 0.17]), M.p(box(0.08, 0.06, 0.03), glow, [-0.09, 0.88, 0.17])], true));
    g.scale.setScalar(1.3);
    return g;
  };

  // ---------- projectiles & pickups ----------
  M.projGeo = function (kind) {
    if (kind === 'scythe') {
      const P = [M.p(box(0.07, 0.5, 0.07), 0x8a6a4a, [-0.12, -0.25, 0])];
      const pts = []; for (let i = 0; i <= 6; i++) { const a = Math.PI - i * (Math.PI * 1.15 / 6); pts.push([0.3 + Math.cos(a) * 0.42, Math.sin(a) * 0.42]); }
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], L = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1);
        P.push(M.p(box(L + 0.03, 0.16 - i * 0.018, 0.04), 0xd8ecff, [(x1 + x2) / 2, (y1 + y2) / 2, 0], [0, 0, a]));
      }
      const g = M.merge(P, 0.04); g.rotateX(-Math.PI / 2); g.scale(1.25, 1.25, 1.25); return g;
    }
    if (kind === 'wave') { const g = M.merge([M.p(new T.RingGeometry(0.75, 1.05, 10, 1, Math.PI * 0.15, Math.PI * 0.7), 0xbfeaff)], 0); g.rotateX(-Math.PI / 2); return g; }
    if (kind === 'pellet') return M.merge([M.p(ico(0.1), 0xfff2b0)], 0);
    if (kind === 'bullet') return M.merge([M.p(box(0.08, 0.08, 0.6), 0xfff0a0)], 0);
    if (kind === 'flask') return M.merge([M.p(sph(0.15, 6, 4), 0x8af050, [0, 0, 0]), M.p(cyl(0.05, 0.05, 0.14, 5), 0xd8f0d8, [0, 0.18, 0])], 0.05);
    if (kind === 'seed') return M.merge([M.p(ico(0.2), 0xffa030)], 0.1);
    if (kind === 'bolt') return M.merge([M.p(box(0.14, 0.14, 0.7), 0x9aff6a), M.p(box(0.22, 0.22, 0.3), 0xd8ffc0)], 0.05);
    if (kind === 'dart') return M.merge([M.p(box(0.03, 0.03, 0.45), 0xd8c8a0), M.p(box(0.12, 0.02, 0.1), 0xd83a2a, [0, 0, -0.2]), M.p(box(0.04, 0.04, 0.08), 0x8aef4a, [0, 0, 0.24])], 0);
    if (kind === 'knife') return M.merge([M.p(box(0.08, 0.02, 0.4), 0xdfe8f0, [0, 0, 0.12]), M.p(box(0.06, 0.03, 0.16), 0xb8352a, [0, 0, -0.16])], 0);
    if (kind === 'hex') return M.merge([M.p(ico(0.22, 0), 0xb86cff), M.p(ico(0.13, 0), 0xf0d8ff)], 0.1);
    if (kind === 'flame') return M.merge([M.p(ico(0.3, 0), 0xffa040), M.p(ico(0.2, 0), 0xffe080, [0, 0.08, 0.06])], 0.25);
    // a ball of fire with flames streaming out behind it (+z is the way it flies)
    if (kind === 'fireball') return M.merge([M.p(ico(0.3, 1), 0xff6a1a), M.p(ico(0.2, 0), 0xffd060, [0, 0.06, 0.08]),
      ...[0, 1, 2, 3, 4].map((i) => M.p(cone(0.1, 0.34, 4), i % 2 ? 0xff9a2a : 0xff4a10, [Math.cos(i * 1.26) * 0.17, Math.sin(i * 1.26) * 0.17, -0.24], [-Math.PI / 2, 0, 0]))], 0.2);
    if (kind === 'nova') return M.merge([M.p(box(0.01, 0.01, 0.01), 0x000000)], 0);   // the scream has no projectile
    return M.merge([M.p(M.rockGeo(0.7, 3, 0, 0.35), 0x77736a)], 0.12);
  };
  M.gemGeo = () => M.merge([M.p(oct(0.2), 0xffffff, [0, 0, 0], 0, [1, 1.5, 1])], 0.15);
  M.essenceGeo = () => M.merge([M.p(new T.TetrahedronGeometry(0.2, 0), 0xd890ff, [0, 0, 0], [0.6, 0, 0.6]), M.p(new T.TetrahedronGeometry(0.13, 0), 0xffffff, [0, 0.05, 0], [0, 0.8, 0])], 0.2);
  M.fish = () => M.mesh([M.p(sph(0.24, 6, 4), 0x8ab8d8, [0, 0, 0], 0, [0.55, 1, 1.8]), M.p(cone(0.2, 0.28, 3), 0x6a98b8, [0, 0, -0.5], [-Math.PI / 2, 0, 0], [0.4, 1, 1]), M.p(box(0.04, 0.05, 0.05), C.black, [0.12, 0.06, 0.25])], true);
  M.catnip = () => M.mesh([M.p(box(0.04, 0.5, 0.04), 0x4a8a2a, [0, 0.25, 0]), M.p(box(0.24, 0.03, 0.42), 0x8af060, [0.12, 0.42, 0], [0, 0, 0.5]), M.p(box(0.24, 0.03, 0.42), 0x7ae050, [-0.12, 0.32, 0], [0, 0, -0.5]), M.p(box(0.2, 0.03, 0.36), 0x9af070, [0, 0.55, 0.1], [0.4, 0, 0])], true);

  // ---------- farm props (part lists in local space, front faces +z) ----------
  function slopes(P, pts, thick, depth, color, z = 0) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const nx = dy / L, ny = -dx / L, mx = (x1 + x2) / 2 + nx * thick / 2, my = (y1 + y2) / 2 + ny * thick / 2;
      P.push(M.p(box(L + 0.3, thick, depth), color, [mx, my, z], [0, 0, a]));
      P.push(M.p(box(L + 0.3, thick, depth), color, [-mx, my, z], [0, 0, -a]));
    }
  }
  function prism(pts, depth) {
    const sh = new T.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2);
    return g;
  }
  M.barnParts = function () {
    const red = 0xa8322a, redD = 0x6e2019, white = 0xeee8dc, roof = 0x4a4440, dark = 0x1c1410, hay = 0xd9b54a;
    const P = [M.p(prism([[-6, 0], [6, 0], [6, 5], [4.3, 7.9], [0, 9.3], [-4.3, 7.9], [-6, 5]], 14), red)];
    slopes(P, [[6, 5], [4.3, 7.9], [0, 9.3]], 0.3, 14.8, roof);
    P.push(M.p(box(0.6, 0.3, 14.8), 0x3a3430, [0, 9.45, 0]));
    for (const z of [-7.04, 7.04]) {
      for (const x of [-6, 6]) P.push(M.p(box(0.32, 5, 0.12), white, [x, 2.5, z]));
      P.push(M.p(box(12.2, 0.3, 0.12), white, [0, 5, z]));
      for (const [a, b] of [[[6, 5], [4.3, 7.9]], [[4.3, 7.9], [0, 9.3]], [[-6, 5], [-4.3, 7.9]], [[-4.3, 7.9], [0, 9.3]]]) P.push(M.beam([a[0], a[1], z], [b[0], b[1], z], 0.26, white));
    }
    P.push(M.p(box(2.3, 3.8, 0.12), redD, [1.2, 1.9, 7.06]), M.p(box(2.3, 3.8, 0.12), redD, [-1.2, 1.9, 7.06]));
    P.push(M.p(box(5, 0.26, 0.16), white, [0, 3.9, 7.08]), M.p(box(0.26, 3.9, 0.16), white, [2.45, 1.95, 7.08]), M.p(box(0.26, 3.9, 0.16), white, [-2.45, 1.95, 7.08]), M.p(box(0.16, 3.8, 0.16), white, [0, 1.9, 7.08]));
    for (const x of [-1.2, 1.2]) { P.push(M.beam([x - 1.05, 0.15, 7.12], [x + 1.05, 3.7, 7.12], 0.17, white)); P.push(M.beam([x + 1.05, 0.15, 7.12], [x - 1.05, 3.7, 7.12], 0.17, white)); }
    P.push(M.p(box(2.1, 1.9, 0.1), dark, [0, 6.6, 7.04]), M.p(box(1.8, 0.7, 0.12), hay, [0, 6.0, 7.05]));
    P.push(M.p(box(2.5, 0.22, 0.16), white, [0, 7.6, 7.08]), M.p(box(2.5, 0.22, 0.16), white, [0, 5.6, 7.08]), M.p(box(0.22, 2.1, 0.16), white, [1.15, 6.6, 7.08]), M.p(box(0.22, 2.1, 0.16), white, [-1.15, 6.6, 7.08]));
    P.push(M.p(box(0.28, 0.28, 1.8), 0x5a3a1c, [0, 8.5, 7.8]));
    for (const x of [-6.04, 6.04]) for (const z of [-3.5, 3.5]) P.push(M.p(box(0.14, 1.3, 1.5), white, [x, 3, z]), M.p(box(0.16, 0.9, 1.1), dark, [x, 3, z]));
    P.push(M.p(box(1.5, 1.3, 1.5), white, [0, 10.1, 0]), M.p(box(1.55, 0.7, 1.55), dark, [0, 10.15, 0]), M.p(cone(1.3, 1.1, 4), roof, [0, 11.3, 0], [0, Math.PI / 4, 0]));
    P.push(M.p(box(0.05, 1.2, 0.05), dark, [0, 12.3, 0]), M.p(box(0.5, 0.3, 0.08), dark, [0, 12.8, 0]), M.p(box(0.8, 0.04, 0.04), dark, [0, 12.5, 0]));
    return P;
  };
  M.siloParts = function () {
    const P = [M.p(cyl(2.4, 2.4, 11, 12), 0xa9b2b8, [0, 5.5, 0])];
    for (let y = 1; y < 11; y += 1.7) P.push(M.p(cyl(2.46, 2.46, 0.14, 12), 0x7d868c, [0, y, 0]));
    P.push(M.p(new T.SphereGeometry(2.45, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xc3cbd0, [0, 11, 0]), M.p(cyl(0.3, 0.4, 0.5, 6), 0x7d868c, [0, 13.6, 0]));
    P.push(M.p(box(0.5, 11, 0.14), 0x6d767c, [0, 5.5, 2.43]));
    return P;
  };
  M.farmhouseParts = function () {
    const white = 0xe9e3d6, roof = 0x4f545c, dark = 0x2a2f38, trim = 0xf6f2ea;
    const P = [M.p(box(10, 5.6, 8), white, [0, 2.8, 0]), M.p(prism([[-5, 5.6], [5, 5.6], [0, 8.4]], 8), white)], glow = [];
    slopes(P, [[5.6, 5.3], [0, 8.6]], 0.3, 9, roof);
    P.push(M.p(box(0.8, 2.4, 0.8), 0x8a3a2a, [2.8, 8.2, -1.5]));
    P.push(M.p(box(10.4, 0.3, 2.6), 0x8a7a66, [0, 0.15, 5.3]), M.p(box(10.6, 0.18, 2.8), 0x5a5f66, [0, 3.3, 5.3], [0.12, 0, 0]));
    for (const x of [-5, -1.7, 1.7, 5]) P.push(M.p(box(0.2, 3.1, 0.2), trim, [x, 1.75, 6.4]));
    P.push(M.p(box(1.1, 2.2, 0.1), 0x6a3a22, [0, 1.4, 4.05]), M.p(box(1.6, 0.2, 0.7), 0x8a7a66, [0, 0.1, 6.9]));
    for (const [x, y] of [[-3, 1.8], [3, 1.8], [-3, 4.3], [3, 4.3], [0, 4.3]]) {
      P.push(M.p(box(1.2, 1.5, 0.08), trim, [x, y, 4.02]), M.p(box(0.95, 1.25, 0.1), dark, [x, y, 4.03]));
      P.push(M.p(box(0.35, 1.4, 0.08), 0x2f5a3a, [x - 0.85, y, 4.03]), M.p(box(0.35, 1.4, 0.08), 0x2f5a3a, [x + 0.85, y, 4.03]));
      glow.push(M.p(box(0.85, 1.15, 0.06), 0xffd27a, [x, y, 4.07]));
    }
    for (const [x, y] of [[5.03, 2], [5.03, 4.3], [-5.03, 2], [-5.03, 4.3]]) { P.push(M.p(box(0.1, 1.25, 0.95), dark, [x, y, 0])); glow.push(M.p(box(0.06, 1.15, 0.85), 0xffd27a, [x * 1.004, y, 0])); }
    return { parts: P, glow };
  };
  M.windmill = function () {
    const P = [], wood = 0x8a8a84, top = 9;
    const legs = [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]];
    for (const [x, z] of legs) P.push(M.beam([x, 0, z], [x * 0.22, top, z * 0.22], 0.14, wood));
    for (const h of [2.5, 5, 7.3]) {
      const k = 1 - (h / top) * 0.78;
      const c = legs.map(([x, z]) => [x * k, h, z * k]);
      P.push(M.beam(c[0], c[1], 0.07, wood), M.beam(c[1], c[3], 0.07, wood), M.beam(c[3], c[2], 0.07, wood), M.beam(c[2], c[0], 0.07, wood));
    }
    P.push(M.p(box(1, 0.1, 1), 0x6a5a4a, [0, top, 0]), M.p(box(0.45, 0.45, 1.2), 0x9a9a92, [0, top + 0.45, 0]));
    P.push(M.p(box(0.06, 0.06, 1.8), wood, [0, top + 0.5, -1.2]), M.p(box(0.05, 1.1, 1.4), 0xb8352a, [0, top + 0.6, -2.1]));
    const F = [M.p(cyl(0.22, 0.22, 0.3, 8), 0x6a6a64, [0, 0, 0], [Math.PI / 2, 0, 0]), M.p(new T.TorusGeometry(1.85, 0.04, 3, 18), 0xd0cec4), M.p(new T.TorusGeometry(0.85, 0.04, 3, 14), 0xd0cec4)];
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; F.push(M.p(box(0.32, 1.25, 0.03), i % 2 ? 0xdcdad0 : 0xc8c6bc, [Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0], [0.35, 0, a - Math.PI / 2])); }
    const fan = M.mesh(F); fan.position.set(0, top + 0.5, 0.75);
    return { parts: P, fan };
  };
  M.tractorParts = function () {
    const red = 0xc0302a, redD = 0x8a1f1a, bk = 0x1a1a1a, yel = 0xe8c040, gr = 0x6a6a6a;
    const P = [M.p(box(1.0, 0.9, 2.0), red, [0, 1.25, 0.6]), M.p(box(0.9, 0.75, 0.08), gr, [0, 1.2, 1.62]), M.p(box(0.8, 0.4, 3.0), redD, [0, 0.75, 0.2]),
      M.p(box(0.6, 0.15, 0.5), bk, [0, 1.75, -0.75]), M.p(box(0.6, 0.5, 0.12), bk, [0, 2.0, -1.0]), M.beam([0, 1.5, 0.2], [0, 2.05, -0.3], 0.06, bk),
      M.p(new T.TorusGeometry(0.25, 0.04, 3, 10), bk, [0, 2.08, -0.3], [-1.0, 0, 0]), M.p(cyl(0.06, 0.06, 1.0, 5), bk, [0.3, 2.1, 1.1]),
      M.p(box(0.15, 0.12, 0.05), 0xfff0b0, [0.3, 1.45, 1.64]), M.p(box(0.15, 0.12, 0.05), 0xfff0b0, [-0.3, 1.45, 1.64])];
    for (const x of [-0.85, 0.85]) P.push(M.p(cyl(0.85, 0.85, 0.45, 12), bk, [x, 0.85, -0.75], [0, 0, Math.PI / 2]), M.p(cyl(0.36, 0.36, 0.47, 8), yel, [x, 0.85, -0.75], [0, 0, Math.PI / 2]), M.p(box(0.5, 0.12, 1.5), red, [x, 1.78, -0.75]));
    for (const x of [-0.6, 0.6]) P.push(M.p(cyl(0.42, 0.42, 0.28, 10), bk, [x, 0.42, 1.35], [0, 0, Math.PI / 2]), M.p(cyl(0.16, 0.16, 0.3, 6), yel, [x, 0.42, 1.35], [0, 0, Math.PI / 2]));
    return P;
  };
  M.haybaleParts = () => [M.p(cyl(1.05, 1.05, 1.4, 10), 0xd9b54a, [0, 1.05, 0], [0, 0, Math.PI / 2]), M.p(cyl(0.8, 0.8, 1.43, 10), 0xe8cc6a, [0, 1.05, 0], [0, 0, Math.PI / 2]), M.p(cyl(0.3, 0.3, 1.45, 8), 0xc9a440, [0, 1.05, 0], [0, 0, Math.PI / 2])];
  M.squareBaleParts = () => [M.p(box(1.5, 0.8, 0.9), 0xe0c060, [0, 0.4, 0]), M.p(box(0.05, 0.82, 0.92), 0x6a5030, [0.4, 0.4, 0]), M.p(box(0.05, 0.82, 0.92), 0x6a5030, [-0.4, 0.4, 0])];
  M.fenceParts = function (x1, z1, x2, z2) {
    const P = [], L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(L / 2.8)), c = 0x8a7258;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      P.push(M.p(box(0.2, 1.4, 0.2), 0x6e5a44, [x, 0.7, z]));
      if (i < n) {
        const t2 = (i + 1) / n, xb = x1 + (x2 - x1) * t2, zb = z1 + (z2 - z1) * t2;
        P.push(M.beam([x, 0.55, z], [xb, 0.6, zb], 0.1, c), M.beam([x, 1.08, z], [xb, 1.04, zb], 0.1, c));
      }
    }
    return P;
  };
  M.treeGeo = function (pine) {
    if (pine) return M.merge([M.p(cyl(0.2, 0.3, 1.2, 6), 0x5a3e28, [0, 0.6, 0]), M.p(cone(1.6, 2.4, 7), 0x2f5a32, [0, 2.1, 0]), M.p(cone(1.25, 2.0, 7), 0x346338, [0, 3.3, 0]), M.p(cone(0.85, 1.7, 7), 0x3a6c3d, [0, 4.4, 0])], 0.1);
    return M.merge([M.p(cyl(0.25, 0.35, 2.4, 6), 0x5a3e28, [0, 1.2, 0]), M.p(ico(1.6), 0x3f7a2e, [0, 3.4, 0]), M.p(ico(1.2), 0x4c8a35, [0.8, 3.0, 0.4]), M.p(ico(1.1), 0x356b28, [-0.7, 3.9, -0.3])], 0.12);
  };
  M.cornGeo = () => M.merge([
    M.p(box(0.07, 2.3, 0.07), 0x6a8a2a, [0, 1.15, 0]), M.p(box(0.55, 0.02, 0.12), 0x5f8a28, [0.24, 0.8, 0], [0, 0, 0.45]),
    M.p(box(0.55, 0.02, 0.12), 0x6f9a30, [-0.22, 1.25, 0.05], [0, 0.3, -0.45]), M.p(box(0.5, 0.02, 0.12), 0x5a8226, [0.05, 1.65, 0.2], [0.45, 1.6, 0]),
    M.p(box(0.1, 0.32, 0.1), 0xd9c04a, [0.09, 1.3, 0], [0, 0, 0.3]), M.p(cone(0.12, 0.45, 4), 0xd8b860, [0, 2.5, 0]),
  ], 0.12);
  M.caveParts = function (seed) {
    const r = 0x6e665c, d = 0x524b43, m = 0x56703a, s = seed * 10;
    return [
      rk(2.6, s + 1, r, [-4.3, 1.9, -1.2], [1, 1.25, 1.1], 1), rk(2.6, s + 2, d, [4.3, 1.9, -1.2], [1, 1.25, 1.1], 1),
      rk(2.4, s + 3, r, [0, 5.2, -1.6], [1.55, 0.85, 1.1], 1), rk(4, s + 4, d, [0, 2.6, -5.6], [1.7, 1.15, 1.1], 1),
      rk(3, s + 5, d, [-7.6, 1.3, -3.6], [1, 0.9, 1], 1), rk(3, s + 6, r, [7.6, 1.3, -3.6], [1, 0.9, 1], 1),
      rk(1.4, s + 7, m, [-2.2, 6.4, -2.0]), rk(1.2, s + 8, m, [2.8, 5.6, -1.6]), rk(0.8, s + 9, r, [-3.3, 0.3, 1.3]), rk(0.7, s + 10, d, [3.4, 0.25, 1.1]),
      rk(0.5, s + 11, r, [-4.8, 0.2, 2.0]), rk(0.6, s + 12, r, [4.9, 0.2, 1.7]),
    ];
  };
  M.smallPumpkin = () => [M.p(sph(0.4, 8, 6), 0xe0701c, [0, 0.32, 0], 0, [1.2, 0.85, 1.2]), M.p(cyl(0.04, 0.06, 0.18, 5), 0x4a6a2a, [0, 0.7, 0], [0.2, 0, 0.1])];
  M.wellParts = () => [M.p(cyl(1.1, 1.1, 0.9, 10), 0x8a8378, [0, 0.45, 0]), M.p(cyl(0.85, 0.85, 0.94, 10), 0x14202a, [0, 0.47, 0]),
    M.p(box(0.15, 2.3, 0.15), C.wood, [0.95, 1.15, 0]), M.p(box(0.15, 2.3, 0.15), C.wood, [-0.95, 1.15, 0]),
    M.p(box(1.2, 0.08, 1.7), 0x8a2a22, [0.5, 2.45, 0], [0, 0, -0.6]), M.p(box(1.2, 0.08, 1.7), 0x8a2a22, [-0.5, 2.45, 0], [0, 0, 0.6]), M.p(box(1.9, 0.08, 0.08), C.woodD, [0, 1.9, 0])];
  M.troughParts = () => [M.p(box(3, 0.7, 1), 0x8a9096, [0, 0.35, 0]), M.p(box(2.8, 0.05, 0.8), 0x3a6a8a, [0, 0.66, 0])];
  M.coopParts = () => [M.p(box(3, 1.8, 2.2), 0xd8d0c0, [0, 1.3, 0]), M.p(box(3.4, 0.15, 2.7), 0x8a2a22, [0, 2.3, 0], [0.15, 0, 0]), M.p(box(0.6, 0.7, 0.1), 0x1c1410, [0.6, 0.85, 1.11]),
    M.beam([0.6, 0.45, 1.2], [0.6, 0.02, 2.4], 0.1, C.wood), ...[[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]].map(([x, z]) => M.p(box(0.15, 0.4, 0.15), C.woodD, [x, 0.2, z]))];
  M.crateParts = () => [M.p(box(1, 1, 1), 0x9a7040, [0, 0.5, 0]), M.p(box(1.04, 0.14, 1.04), 0x6a4a28, [0, 0.93, 0]), M.p(box(1.04, 0.14, 1.04), 0x6a4a28, [0, 0.07, 0])];
  // ---------- camp, alien props and boss mechanics ----------
  M.workbench = () => ({
    parts: [
      M.p(box(2.4, 0.16, 1.1), C.wood, [0, 0.95, 0]), M.p(box(2.3, 0.08, 1.0), C.woodD, [0, 0.4, 0]),
      ...[[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]].map(([x, z]) => M.p(box(0.14, 0.95, 0.14), C.woodD, [x, 0.47, z])),
      M.p(box(2.4, 1.3, 0.1), C.woodD, [0, 1.6, -0.55]), M.p(box(0.3, 0.25, 0.3), C.steelD, [0.8, 1.15, 0.2]), M.p(box(0.08, 0.08, 0.4), C.steel, [0.8, 1.15, 0.45]),
      M.p(box(0.55, 0.3, 0.3), 0x3a3d43, [-0.6, 1.18, 0.1]), M.p(box(0.7, 0.08, 0.34), 0x3a3d43, [-0.6, 1.36, 0.1]),
      M.p(box(0.06, 0.4, 0.06), C.wood, [0.2, 1.75, -0.47], [0, 0, 0.6]), M.p(box(0.2, 0.1, 0.1), C.steelD, [0.32, 1.92, -0.47]),
      M.p(box(0.7, 0.04, 0.2), C.steel, [-0.3, 1.9, -0.47]), M.p(box(0.12, 0.12, 0.12), C.wood, [0.1, 1.9, -0.47]),
      M.p(box(0.5, 0.35, 0.35), 0x8a2a22, [1.6, 0.18, 0.1]), M.p(box(0.52, 0.06, 0.37), 0x5a1a14, [1.6, 0.38, 0.1]),
    ],
    glow: [M.p(box(0.18, 0.24, 0.18), 0xffd27a, [-1.0, 1.15, 0.2])],
  });
  M.trapdoor = () => ({
    parts: [
      M.p(box(2.6, 0.18, 0.2), 0x4a3a2c, [0, 0.09, 1.2]), M.p(box(2.6, 0.18, 0.2), 0x4a3a2c, [0, 0.09, -1.2]),
      M.p(box(0.2, 0.18, 2.6), 0x4a3a2c, [1.2, 0.09, 0]), M.p(box(0.2, 0.18, 2.6), 0x4a3a2c, [-1.2, 0.09, 0]),
      // the two door leaves stand open against the back edge, with iron bands
      M.p(box(1.1, 2.2, 0.1), C.wood, [0.6, 1.12, -1.4], [-0.25, 0, 0]), M.p(box(1.1, 2.2, 0.1), C.wood, [-0.6, 1.12, -1.4], [-0.25, 0, 0]),
      M.p(box(2.3, 0.12, 0.13), C.steelD, [0, 0.7, -1.29], [-0.25, 0, 0]), M.p(box(2.3, 0.12, 0.13), C.steelD, [0, 1.7, -1.55], [-0.25, 0, 0]),
      M.p(box(0.1, 0.8, 0.1), C.wood, [0.5, 0.3, 0.9]), M.p(box(0.1, 0.8, 0.1), C.wood, [-0.5, 0.3, 0.9]), M.p(box(1.0, 0.08, 0.08), C.wood, [0, 0.55, 0.9]),
    ],
    dark: [M.p(box(2.2, 0.08, 2.2), 0x020202, [0, 0.03, 0])],
    glow: [M.p(box(1.6, 0.04, 1.6), 0xffb050, [0, 0.01, 0])],
  });
  // ---------- The Unexplainable: the demon ritual's sigil and the swamp decor ----------
  // The summoning sigil on the ground: rings, a five-pointed star and rune marks (all glow).
  M.sigil = function (r) {
    const P = [], c = 0xb86cff, flat = (geo, pos, rotY = 0) => M.p(geo, c, pos, [-Math.PI / 2, 0, rotY]);
    P.push(flat(new T.RingGeometry(r - 0.25, r, 40, 1), [0, 0.04, 0]), flat(new T.RingGeometry(r * 0.72 - 0.15, r * 0.72, 32, 1), [0, 0.04, 0]));
    const pts = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; pts.push([Math.sin(a) * r * 0.72, Math.cos(a) * r * 0.72]); }
    for (let i = 0; i < 5; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 2) % 5], L = Math.hypot(x2 - x1, z2 - z1);
      P.push(M.p(box(0.14, 0.02, L), c, [(x1 + x2) / 2, 0.05, (z1 + z2) / 2], [0, Math.atan2(x2 - x1, z2 - z1), 0]));
    }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.push(M.p(box(0.18, 0.02, 0.32), 0xe0c0ff, [Math.sin(a) * r * 0.86, 0.05, Math.cos(a) * r * 0.86], [0, a + (i % 2) * 0.6, 0])); }
    return P;
  };
  M.tikiPole = function (h = 3) {
    const wd = 0x8a5a2b, wdD = 0x5a3a1c, P = [M.p(box(0.7, h, 0.7), wd, [0, h / 2, 0])];
    for (let i = 0; i < Math.floor(h / 1.1); i++) {
      const y = 0.6 + i * 1.1;
      P.push(M.p(box(0.74, 0.08, 0.74), wdD, [0, y + 0.45, 0]), M.p(box(0.16, 0.12, 0.06), [0xf0d040, 0xd83a2a, 0x2a8aca][i % 3], [0.16, y + 0.12, 0.36]), M.p(box(0.16, 0.12, 0.06), [0xf0d040, 0xd83a2a, 0x2a8aca][i % 3], [-0.16, y + 0.12, 0.36]),
        M.p(box(0.4, 0.14, 0.06), C.black, [0, y - 0.18, 0.36]), M.p(box(0.14, 0.24, 0.12), wdD, [0, y - 0.02, 0.4]));
    }
    P.push(M.p(box(1.4, 0.1, 0.3), wdD, [0, h - 0.4, 0]), ...[-0.4, 0, 0.4].map((x, i) => M.p(box(0.12, 0.5, 0.04), [0xd83a2a, 0xf0d040, 0x2a8aca][i], [x, h + 0.2, 0], [0, 0, x * 0.5])));
    return P;
  };
  M.deadTree = function (seed) {
    const rnd = U.seeded(seed), bark = 0x3a2e2a, P = [M.p(cyl(0.18, 0.32, 3.2, 6), bark, [0, 1.6, 0], [rnd() * 0.15, 0, rnd() * 0.15])];
    for (let i = 0; i < 5; i++) {
      const y = 1.6 + rnd() * 1.4, a = rnd() * Math.PI * 2, l = 0.8 + rnd() * 1.2;
      P.push(M.beam([0, y, 0], [Math.cos(a) * l, y + 0.4 + rnd() * 0.8, Math.sin(a) * l], 0.07, bark));
    }
    return P;
  };
  M.candleParts = () => ({
    parts: [0, 1, 2].map((i) => M.p(cyl(0.06, 0.07, 0.25 + i * 0.12, 6), 0xe8e0c8, [Math.cos(i * 2.1) * 0.2, 0.12 + i * 0.06, Math.sin(i * 2.1) * 0.2])).concat([M.p(sph(0.16, 6, 4), 0xe8e0c8, [0.05, 0.12, -0.05])]),
    glow: [0, 1, 2].map((i) => M.p(cone(0.04, 0.12, 4), 0xd890ff, [Math.cos(i * 2.1) * 0.2, 0.32 + i * 0.12, Math.sin(i * 2.1) * 0.2])),
  });
  M.skullPile = () => [0, 1, 2, 3, 4].map((i) => M.p(sph(0.17, 6, 4), 0xe0d8c0, [Math.cos(i * 1.3) * 0.28 * (i % 3), 0.15 + (i === 4 ? 0.22 : 0), Math.sin(i * 1.3) * 0.28 * (i % 3)]))
    .concat([M.p(box(0.06, 0.06, 0.03), C.black, [0.06, 0.18, 0.16]), M.p(box(0.06, 0.06, 0.03), C.black, [-0.06, 0.18, 0.16])]);
  // ---------- Eldritch Madness decor ----------
  // A monolith of black stone (it floats): a tall slab with chipped ends and violet runes on both faces.
  M.monolith = function (h = 3.2) {
    const P = [M.p(box(1.1, h, 0.45), 0x0e0a14), M.p(box(0.9, 0.3, 0.4), 0x1a1424, [0.1, h / 2 + 0.1, 0], [0, 0, 0.25]), M.p(box(0.7, 0.4, 0.38), 0x14101c, [-0.1, -h / 2 - 0.12, 0], [0, 0, -0.3])], GL = [];
    for (let i = 0; i < 5; i++) for (const s of [1, -1]) GL.push(M.p(box(0.18 + (i % 2) * 0.12, 0.06, 0.02), 0xb86cff, [((i * 37) % 5 - 2) * 0.08, h * 0.35 - i * h * 0.17, s * 0.235], [0, 0, (i % 3 - 1) * 0.6]));
    return { parts: P, glow: GL };
  };
  // A spire that twists as it rises, a band of violet light every few turns.
  M.twistedSpire = function (h, seed) {
    const rnd = U.seeded(seed), P = [], GL = [], n = Math.max(2, Math.round(h / 0.5));
    for (let i = 0; i < n; i++) {
      const k = i / n, w = 0.9 * (1 - k * 0.75), x = Math.sin(k * 5) * 0.15, z = Math.cos(k * 4) * 0.15;
      P.push(M.p(box(w, 0.52, w), i % 2 ? 0x16101e : 0x221830, [x, 0.26 + i * 0.5, z], [0, i * 0.35 + rnd() * 0.1, (rnd() - 0.5) * 0.1]));
      if (i % 4 === 2) GL.push(M.p(box(w + 0.06, 0.06, w + 0.06), 0x9a4ad8, [x, 0.26 + i * 0.5, z], [0, i * 0.35, 0]));
    }
    return { parts: P, glow: GL };
  };
  // Void crystals breaking out of the ground, glowing at their tips.
  M.voidCrystals = function (seed) {
    const rnd = U.seeded(seed), P = [], GL = [];
    for (let i = 0; i < 5; i++) {
      const a = rnd() * Math.PI * 2, r = rnd() * 0.55, h = 0.8 + rnd() * 1.4, x = Math.cos(a) * r, z = Math.sin(a) * r, tilt = [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6];
      P.push(M.p(oct(0.3), 0x2a1640, [x, 0.3 * h, z], tilt, [0.6, h, 0.6]));
      GL.push(M.p(oct(0.3), 0xc080ff, [x, 0.3 * h, z], tilt, [0.28, h * 1.15, 0.28]));
    }
    return { parts: P, glow: GL };
  };
  // A fleshy stalk bending up out of the ground, pustules along it; top = where its eye sits.
  M.eyeStalk = function (h, seed) {
    const rnd = U.seeded(seed), P = [M.p(cyl(0.5, 0.65, 0.15, 8), 0x2a1020, [0, 0.07, 0])], pts = [[0, 0, 0]];
    let x = 0, z = 0;
    for (let i = 1; i <= 5; i++) { x += (rnd() - 0.5) * 0.35; z += (rnd() - 0.5) * 0.35; pts.push([x, h * i / 5, z]); }
    for (let i = 0; i < 5; i++) P.push(M.beam(pts[i], pts[i + 1], 0.26 - i * 0.03, i % 2 ? 0x5a2040 : 0x6a2a4a));
    for (let i = 1; i < 5; i++) P.push(M.p(sph(0.06, 5, 4), 0xd8a0b0, [pts[i][0] + 0.12, pts[i][1], pts[i][2] + 0.08]));
    return { parts: P, top: pts[5] };
  };
  // The eye on a stalk: bloodshot white, a violet iris and a slit pupil, looking along +z.
  M.eyeballGeo = () => M.merge([M.p(sph(0.42, 10, 8), 0xe8dcd0), M.p(cyl(0.2, 0.2, 0.04, 14), 0xb86cff, [0, 0, 0.4], [Math.PI / 2, 0, 0]), M.p(box(0.06, 0.24, 0.04), 0x050208, [0, 0, 0.42]),
    ...[0.4, 1.5, 2.6, 3.7, 4.8].map((a) => M.beam([Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.35], [Math.cos(a + 0.3) * 0.4, Math.sin(a + 0.3) * 0.4, 0.08], 0.03, 0xa0201a))], 0.03);
  M.teslaTower = () => ({
    parts: [
      M.p(cyl(0.9, 1.1, 0.4, 8), 0x3a3d43, [0, 0.2, 0]), M.p(cyl(0.18, 0.26, 3.4, 8), 0x5d6670, [0, 2.0, 0]),
      ...[1.4, 2.0, 2.6, 3.2].map((y, i) => M.p(new T.TorusGeometry(0.5 - i * 0.07, 0.08, 4, 12), 0xc87a3a, [0, y, 0], [Math.PI / 2, 0, 0])),
      M.beam([0.7, 0.4, 0.7], [0.2, 1.6, 0.2], 0.08, 0x3a3d43), M.beam([-0.7, 0.4, 0.7], [-0.2, 1.6, 0.2], 0.08, 0x3a3d43), M.beam([0, 0.4, -0.9], [0, 1.6, -0.25], 0.08, 0x3a3d43),
    ],
    glow: [M.p(sph(0.45, 8, 6), 0xffffff, [0, 3.95, 0])],
  });
  M.saucerParts = () => ({
    parts: [M.p(cyl(5, 6, 0.7, 16), 0x9aa3ab, [0, 0, 0]), M.p(cyl(6.1, 4.2, 0.6, 16), 0x7d868c, [0, -0.6, 0]), M.p(new T.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a8a7a, [0, 0.3, 0]),
      M.p(box(3, 0.4, 0.8), 0x5d6670, [4.4, 0.4, 2.6], [0.3, 0.5, 0.4]), M.p(box(2.2, 0.3, 0.6), 0x5d6670, [-4.8, 0.2, -2.2], [-0.3, 0.8, 0.2])],
    glow: Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2; return M.p(box(0.4, 0.25, 0.4), i % 2 ? 0x7dff6a : 0xffe14a, [Math.cos(a) * 5.6, -0.1, Math.sin(a) * 5.6]); }),
  });
  M.podParts = (s = 1) => ({
    parts: [M.p(cyl(0.06, 0.1, 0.9 * s, 5), 0x2a5a3a, [0, 0.45 * s, 0]), M.p(box(0.5 * s, 0.03, 0.18 * s), 0x3a7a4a, [0.2 * s, 0.2 * s, 0], [0, 0, 0.5])],
    glow: [M.p(sph(0.28 * s, 7, 5), 0x9aff8a, [0, 1.0 * s, 0], 0, [1, 1.3, 1]), M.p(sph(0.14 * s, 6, 4), 0xe0ffd0, [0, 1.05 * s, 0.12 * s])],
  });
  M.lampParts = () => ({ parts: [M.p(box(0.18, 3.2, 0.18), C.woodD, [0, 1.6, 0]), M.p(box(0.9, 0.1, 0.1), C.woodD, [0.38, 3.1, 0])], glow: [M.p(box(0.3, 0.4, 0.3), 0xffd27a, [0.72, 2.82, 0])] });
})();
