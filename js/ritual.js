'use strict';
// The demon ritual (stages.json ritual; the "ritual" day event on The Unexplainable): witch doctors
// gather in a circle around a sigil and channel a demon. Every few seconds they channel, the demon
// gains health. When the last of them dies (or the ritual runs out of time) it bursts out of the sigil
// with all the health it has gathered, so kill them fast.
// Also here: free spots on the map, and the witch's cauldrons that day events raise.
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player, ES = G.enemySys;
  const RT = G.ritual = { on: null };
  const PURPLE = 0xb86cff;

  // A free spot inside the fence clear of buildings and caves, at least minDist from you (if possible).
  RT.spot = function (minDist, clear, area = 30) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 100; i++) {
        const x = U.rnd(-area, area), z = U.rnd(-area, area);
        if (W.blocked(x, z, clear)) continue;
        if (pass === 0 && Math.hypot(x - P.x, z - P.z) < minDist) continue;
        if (W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
        return [x, z];
      }
    }
    return null;
  };

  RT.start = function () {
    const C = G.RITUAL;
    if (RT.on || !C.doctor || !C.demon || G.phase !== 'fight') return false;
    const p = RT.spot(C.minPlayerDistance, C.radius + 1.5, 28);
    if (!p) return false;
    const [x, z] = p, mat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
    const g = new T.Mesh(M.merge(M.sigil(C.radius + 1.2), 0), mat);
    g.position.set(x, 0, z); G.scene.add(g);
    const light = new T.PointLight(PURPLE, 0, 18, 1.5); light.position.set(x, 2, z); G.scene.add(light);
    RT.on = { x, z, g, mat, light, t: -C.warning, stacks: 0, doctors: [], phase: 'warn' };
    F.ring(x, z, { r0: 0.5, r1: C.radius + 1.5, life: 0.8, color: PURPLE }); F.shake(0.3);
    G.ui.banner('A Demon Ritual Begins', `${C.doctors} witch doctors are summoning a demon. Kill them fast: it grows ${Math.round(C.stackHp * 100)}% stronger every ${C.stackEvery} seconds.`, '#c08aff');
    A.play('ritual');
    return true;
  };
  function raise(v) {
    const C = G.RITUAL;
    for (let i = 0; i < C.doctors; i++) {
      const a = (i / C.doctors) * Math.PI * 2 + Math.PI / 4, x = v.x + Math.sin(a) * C.radius, z = v.z + Math.cos(a) * C.radius;
      const e = ES.spawn(C.doctor, x, z);
      e.ritual = { x: v.x, z: v.z };
      v.doctors.push(e);
      F.burst(x, 1, z, { n: 16, color: [PURPLE, 0xe0c8ff], glow: true, speed: 5, life: 0.6, size: 0.18 }); F.dust(x, z, 6);
    }
    A.play('summon');
  }
  function summon(v) {
    const C = G.RITUAL, k = 1 + C.stackHp * v.stacks;
    const e = ES.spawn(C.demon, v.x, v.z, { hpMul: k });
    Object.assign(e, { state: 'emerge', t: 2.2, fx: 0, fz: 0, walkAmt: 0, rise: true, rank: 1, atkCd: 2.5 });
    e.name = e.def.name;
    G.run.demons = (G.run.demons || 0) + 1;
    G.ui.bossBar(e);
    F.explosion(v.x, v.z, C.radius, PURPLE); F.flash('#3a0a4a', 0.6); F.shake(0.9); A.play('bossScream'); A.play('explode');
    G.ui.banner(`The ${e.def.name} rises!`, `+${Math.round((k - 1) * 100)}% health from ${Math.max(0, v.t).toFixed(0)} seconds of channelling`, '#ff5a8a');
    RT.clear();
  }

  RT.update = function (dt) {
    const v = RT.on, C = G.RITUAL;
    if (!v) return;
    v.t += dt;
    const glow = v.phase === 'warn' ? Math.min(1, (v.t + C.warning) / C.warning) * 0.5 : 0.55 + Math.sin(v.t * 6) * 0.2 + Math.min(0.3, v.stacks * 0.01);
    v.mat.opacity = glow; v.light.intensity = glow * 2.5; v.g.rotation.y += dt * (0.2 + v.stacks * 0.02);
    if (v.phase === 'warn') { if (v.t >= 0) { v.phase = 'channel'; v.t = 0; raise(v); } return; }
    const before = v.stacks;
    v.stacks = Math.floor(v.t / C.stackEvery);
    if (v.stacks > before) { F.ring(v.x, v.z, { r0: 0.4, r1: C.radius * 0.7, life: 0.4, color: PURPLE }); A.play('hex'); }
    if (Math.random() < dt * (8 + v.stacks)) F.rise(v.x + U.rnd(-2, 2), 0.1, v.z + U.rnd(-2, 2), PURPLE, 1, 0.4, 3 + v.stacks * 0.1, 0.18, 1);
    const alive = v.doctors.filter((e) => !e.dead);
    if (!alive.length || v.t >= C.maxTime) {
      for (const e of alive) { e.dead = true; e.hp = 0; e.dying = 0.3; F.burst(e.x, 1, e.z, { n: 10, color: [PURPLE, 0x2a1438], speed: 4, life: 0.6, size: 0.16 }); }
      summon(v);
    }
  };
  RT.clear = function () {
    const v = RT.on;
    if (!v) return;
    G.scene.remove(v.g); G.scene.remove(v.light); v.g.geometry.dispose(); v.mat.dispose();
    RT.on = null;
  };
  // HUD event line while a ritual is going.
  RT.status = function () {
    const v = RT.on, C = G.RITUAL;
    if (!v) return '';
    if (v.phase === 'warn') return 'A DEMON RITUAL BEGINS…';
    const alive = v.doctors.filter((e) => !e.dead).length;
    return `DEMON RITUAL · ${alive}/${v.doctors.length} WITCH DOCTORS · DEMON +${Math.round(v.stacks * C.stackHp * 100)}% HEALTH · ${Math.max(0, Math.ceil(C.maxTime - v.t))}s`;
  };
  RT.drawOverlay = function (c, dpr) {
    const v = RT.on;
    if (!v) return;
    if (!F.pointer(c, dpr, v.x, v.z, '#c08aff', 'RITUAL')) return;
    const s = F.project(v.x, 0.5, v.z);
    if (!s) return;
    const txt = v.phase === 'warn' ? 'Demon Ritual' : `Demon +${Math.round(v.stacks * G.RITUAL.stackHp * 100)}%`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
    const tw = c.measureText(txt).width + 10 * dpr;
    c.fillStyle = 'rgba(10,7,6,.75)'; c.fillRect(s.x - tw / 2, s.y - 10 * dpr, tw, 20 * dpr);
    c.fillStyle = '#d8b8ff'; c.fillText(txt, s.x, s.y + dpr);
  };

  // ---------- witch's cauldrons ----------
  RT.cauldrons = () => ES.list.filter((e) => !e.dead && e.type === G.CAULDRON.enemy).length;
  RT.cauldron = function () {
    const C = G.CAULDRON;
    if (!C.enemy || G.phase !== 'fight' || RT.cauldrons() >= C.max) return null;
    const p = RT.spot(C.minPlayerDistance, 2, 30);
    if (!p) return null;
    const e = ES.spawn(C.enemy, p[0], p[1]);
    F.dust(p[0], p[1], 12); F.ring(p[0], p[1], { r0: 0.4, r1: 3, life: 0.6, color: 0x8aef4a }); F.shake(0.2); A.play('summon');
    G.ui.toast(`A ${e.def.name.toLowerCase()} bubbles up out of the mud!`, '#8aef4a');
    return e;
  };
})();
