'use strict';
// Altars of Power: one rises every minute of a day (data/stages.json > altar). Walking onto it claims
// its Totem of Power, a talent point for this run, but wakes a Rare Golem that climbs out of the
// ground with random modifiers from data/monster_modifiers.json. Altars still standing at night can be
// claimed safely in camp, and any left when you travel on are claimed for you.
(function () {
  const T = THREE, U = G.U, M = G.M, F = G.fx, A = G.audio, W = G.world, P = G.player;
  const AL = G.altars = { list: [], next: 0 };
  const IDLE = new T.Color(0x6ff0ff), WAKE = new T.Color(0xff3a1a);

  AL.reset = function () { AL.clear(); AL.next = G.ALTAR.first; AL.summons = 0; };
  // How many monsters the nth summon of the run brings (1, 2, 4, 8... with summonGrowth 2).
  AL.summonCount = (n) => Math.min(G.ALTAR.maxSummons, Math.round(Math.pow(G.ALTAR.summonGrowth, n)));
  AL.newDay = function () { AL.next = G.ALTAR.first; };
  // Travelling on: unclaimed totems come along. Returns how many.
  AL.claimAll = function () {
    const n = AL.list.filter((a) => a.state === 'idle' || a.state === 'rising').length, got = n ? G.talents.addTotems(n) : 0;
    AL.clear();
    return got;
  };
  const standing = () => AL.list.filter((a) => a.state === 'idle' || a.state === 'rising').length;
  AL.clear = function () { for (const a of AL.list) remove(a); AL.list.length = 0; };
  function remove(a) {
    G.scene.remove(a.m.root);
    a.m.root.traverse((o) => { if (o.geometry && o.geometry !== G.pickups.beamGeo) o.geometry.dispose(); });
    a.m.glowMat.dispose(); a.beam.material.dispose();
    if (a.tele) a.tele.cancel = true;
  }

  // A free spot inside the fence, away from buildings, caves, other altars and (if possible) the player.
  function spot() {
    const C = G.ALTAR;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 80; i++) {
        const x = U.rnd(-C.area, C.area), z = U.rnd(-C.area, C.area);
        if (W.blocked(x, z, 3.4)) continue;
        if (pass === 0 && Math.hypot(x - P.x, z - P.z) < C.minPlayerDistance) continue;
        if (W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 14)) continue;
        if (AL.list.some((a) => Math.hypot(a.x - x, a.z - z) < 10)) continue;
        return [x, z];
      }
    }
    return null;
  }

  AL.spawn = function () {
    const p = spot();
    if (!p) return null;
    const [x, z] = p, m = M.altar(), totem = M.totem();
    m.root.position.set(x, -2.4, z); m.totemMount.add(totem);
    m.glowMat.color.copy(IDLE);
    const beam = new T.Mesh(G.pickups.beamGeo, new T.MeshBasicMaterial({ color: 0x6ff0ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    beam.scale.set(2.2, 2.4, 2.2); m.root.add(beam);
    G.scene.add(m.root);
    const a = { x, z, m, totem, beam, state: 'rising', t: 0 };
    AL.list.push(a);
    F.dust(x, z, 14); F.ring(x, z, { r0: 0.5, r1: 4.5, life: 0.8, color: 0x6ff0ff }); F.shake(0.15); A.play('altar');
    G.ui.toast('An Altar of Power rises in the fields…', '#6ff0ff');
    return a;
  };

  function take(a) {
    a.state = 'awake'; a.t = 0;
    a.m.totemMount.remove(a.totem); a.totem.traverse((o) => o.geometry && o.geometry.dispose());
    a.beam.visible = false;
    const got = G.talents.addTotems(1);
    if (G.ALTAR.buff) G.playerSys.addBuff(G.ALTAR.buff);
    A.play('totem'); F.levelUp(P.x, P.z); F.flash('#bff6ff', 0.35);
    F.streak(a.x, 3, a.z, P.x, 1, P.z, 0x8ff8ff, 0.5, 0.18);
    const pts = G.talents.points(), left = G.talents.dayLeft('totem');
    G.ui.toast(got ? `Totem of Power claimed! ${pts} talent point${pts === 1 ? '' : 's'} to spend (T) · ${left} more on this level` : 'No more Totems of Power on this level', '#6ff0ff');
    if (G.phase !== 'fight') { a.state = 'spent'; a.t = 0; return; }   // in camp the altar sleeps on
    G.ui.toast('The altar awakens… something climbs out beneath it!', '#ff6a4a');
    a.tele = F.telegraph(a.x, a.z, 3.4, G.ALTAR.summonDelay);
    A.play('horn'); F.shake(0.25);
  }

  // Every summon of the run brings summonGrowth times as many as the one before, in a ring around the altar.
  function summon(a) {
    const n = AL.summonCount(AL.summons++), SP = G.spawner;
    if (n === 1) { SP.spawnRare(a.x, a.z); return; }
    let first = null;
    for (let i = 0; i < n; i++) {
      const ring = Math.floor((i - 1) / 8), ang = (((i - 1) % 8) / 8) * Math.PI * 2 + ring * 0.4, r = i === 0 ? 0 : 3.6 + ring * 3.6;
      let x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      if (W.blocked(x, z, 1.5)) { x = a.x; z = a.z; }
      const e = SP.spawnRare(U.clamp(x, -34, 34), U.clamp(z, -34, 34), true);
      first = first || e;
    }
    G.ui.bossBar(first); A.play('bossScream'); F.shake(0.8);
    G.ui.banner(`${n} ${first.def.name}s rise!`, 'Every altar you take wakes twice as many', G.RARITY[1].color);
  }

  AL.update = function (dt) {
    const C = G.ALTAR;
    // A new altar every `every` seconds of the day.
    // No more altars once the level's totems are all claimed or standing (stages.json talentPoints).
    if (C.enemy && G.phase === 'fight') while (G.dayT >= AL.next && AL.next < G.DAY_SECONDS) { if (standing() < G.talents.dayLeft('totem')) AL.spawn(); AL.next += C.every; }
    for (const a of AL.list) {
      a.t += dt;
      const r = a.m.root;
      if (a.state === 'rising') {
        const k = Math.min(1, a.t / 1.6);
        r.position.y = -2.4 * (1 - k) * (1 - k);
        a.beam.material.opacity = 0.25 * k;
        if (Math.random() < dt * 20) F.dust(a.x + U.rnd(-2.5, 2.5), a.z + U.rnd(-2.5, 2.5), 1);
        if (k >= 1) { a.state = 'idle'; a.t = 0; }
      } else if (a.state === 'idle') {
        a.totem.rotation.y += dt * 1.4; a.totem.position.y = Math.sin(a.t * 2.2) * 0.12;
        a.beam.material.opacity = 0.22 + Math.sin(a.t * 3) * 0.06;
        a.m.glowMat.color.copy(IDLE).multiplyScalar(0.85 + Math.sin(a.t * 2.5) * 0.15);
        if (Math.random() < dt * 5) F.rise(a.x, 1.7, a.z, 0x6ff0ff, 1, 0.9, 1.6, 0.12, 0.9);
        if (!P.dead && G.state === 'playing' && Math.hypot(P.x - a.x, P.z - a.z) < C.pickupRadius) take(a);
      } else if (a.state === 'awake') {
        a.m.glowMat.color.copy(IDLE).lerp(WAKE, Math.min(1, a.t * 3)).multiplyScalar(0.8 + Math.sin(a.t * 18) * 0.25);
        if (Math.random() < dt * 30) F.rise(a.x + U.rnd(-2, 2), 0.3, a.z + U.rnd(-2, 2), 0xff5a2a, 1, 0.5, 3, 0.18, 0.6);
        if (a.t >= C.summonDelay) {
          a.tele = null; a.state = 'spent'; a.t = 0;
          F.burst(a.x, 1, a.z, { n: 24, color: [0x6e6a62, 0x4c4943, 0x56703a], speed: 8, life: 1, size: 0.3, up: 1 });
          if (G.phase === 'fight') summon(a);
        }
      } else {
        // spent: the altar crumbles back into the ground while the golem climbs out
        a.m.glowMat.color.copy(WAKE).multiplyScalar(Math.max(0, 1 - a.t));
        r.position.y = -a.t * 2.4;
        if (a.t > 1.3) a.gone = true;
      }
    }
    for (let i = AL.list.length - 1; i >= 0; i--) if (AL.list[i].gone) { remove(AL.list[i]); AL.list.splice(i, 1); }
  };

  // Label over a visible altar, or an arrow on the screen edge pointing at an off-screen one.
  AL.drawOverlay = function (c, dpr) {
    for (const a of AL.list) {
      if (a.state !== 'idle' && a.state !== 'rising') continue;
      if (!F.pointer(c, dpr, a.x, a.z, '#6ff0ff', 'ALTAR')) continue;
      const top = F.project(a.x, 4.6, a.z), s = F.project(a.x, 1, a.z), ly = Math.max(20 * dpr, top ? top.y : s.y);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(19 * dpr)}px VT323, monospace`;
      const txt = 'Totem of Power', tw = c.measureText(txt).width + 10 * dpr;
      c.fillStyle = 'rgba(10,7,6,.75)'; c.fillRect(s.x - tw / 2, ly - 10 * dpr, tw, 20 * dpr);
      c.fillStyle = '#8ff8ff'; c.fillText(txt, s.x, ly + dpr);
    }
  };
})();
