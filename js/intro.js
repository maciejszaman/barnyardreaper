'use strict';
// The intro: a tiny cutscene before every run. The cat sits on the farmhouse porch, hears something
// out in the fields, and a horde of feral dogs pours out of a cave toward it. Gregory the goat stands
// there instead, already watching the caves, and meets the horde without a flinch. Captions come from
// characters.json "intro" (three lines). Any key, click or tap skips it. When it ends the run starts
// with the hero back in the yard.
(function () {
  const U = G.U, F = G.fx, A = G.audio, W = G.world, P = G.player, ES = G.enemySys;
  const IN = G.intro = { on: false, t: 0 };
  const SEAT = { x: 24, y: 0.3, z: -21.9 };   // the edge of the farmhouse porch
  const LEN = 10.5;
  const $ = (id) => document.getElementById(id);
  const caption = (txt) => { $('intro-cap').textContent = txt; $('intro-cap').classList.toggle('on', !!txt); };
  const CAPS = ['Another quiet evening on the farm…', 'What was that?', '…they\'re coming.'];
  const calm = () => G.CHAR.model === 'goat';   // Gregory knew they were coming

  IN.start = function (done) {
    Object.assign(IN, { on: true, t: 0, done, acc: 0, fired: {} });
    G.state = 'intro'; G.ui.show(null);
    P.x = SEAT.x; P.z = SEAT.z; P.yaw = 0;
    $('intro').hidden = false; $('intro-fade').style.opacity = '0';
    caption('');
  };
  IN.skip = function () { if (IN.on) finish(); };
  const el = document.getElementById('intro');
  if (el && el.addEventListener) el.addEventListener('pointerdown', () => IN.skip());
  function finish() {
    IN.on = false;
    $('intro').hidden = true; caption('');
    ES.clear(); G.enemyShots.clear(); G.spawner.reset();
    for (const c of W.caves) c.warn = 0;
    const m = P.model;
    m.head.rotation.y = 0; m.head.rotation.x = 0; m.hips.rotation.x = 0; m.armL.rotation.x = m.armR.rotation.x = 0; m.legL.rotation.x = m.legR.rotation.x = 0;
    IN.done();
  }
  const once = (k, at, fn) => { if (IN.t >= at && !IN.fired[k]) { IN.fired[k] = true; fn(); } };

  // The cat: sitting with its legs over the porch edge, turning its head at the noises; then it jumps
  // up, startled, arms in the air.
  function pose(t, dt) {
    if (calm()) { poseCalm(t, dt); return; }
    const m = P.model, d = (o, k, v, s = 6) => { o[k] = U.damp(o[k], v, s, dt); };
    const scared = t >= 7.3, hop = scared ? Math.max(0, Math.sin(Math.min(1, (t - 7.3) / 0.35) * Math.PI)) * 0.55 : 0;
    P.root.position.set(SEAT.x, SEAT.y + hop, SEAT.z);
    d(P.root.rotation, 'y', scared ? Math.PI / 2 : 0, 5);
    d(m.hips.position, 'y', scared ? 0.62 : 0.42); d(m.hips.rotation, 'x', scared ? 0 : -0.18);
    d(m.legL.rotation, 'x', scared ? 0 : -1.5, 10); d(m.legR.rotation, 'x', scared ? 0 : -1.5, 10);
    d(m.armL.rotation, 'x', scared ? -2.6 : 0.15, 12); d(m.armR.rotation, 'x', scared ? -2.6 : 0.15, 12);
    d(m.head.rotation, 'y', scared ? 0 : t > 1.1 ? 0.9 + Math.sin(t * 1.3) * 0.15 : Math.sin(t * 0.7) * 0.2, 4);
    m.tail.rotation.y = Math.sin(t * (scared ? 14 : 2.4)) * (scared ? 0.8 : 0.45);
  }
  // Gregory: standing at the porch edge, his head already turned to the caves. When the horde bursts out
  // he turns to face it, lowers his horns and lifts the scythe; violet motes rise off him.
  function poseCalm(t, dt) {
    const m = P.model, d = (o, k, v, s = 6) => { o[k] = U.damp(o[k], v, s, dt); }, ready = t >= 7.3;
    P.root.position.set(SEAT.x, SEAT.y, SEAT.z);
    d(P.root.rotation, 'y', ready ? Math.PI / 2 : 0.35, 3);
    d(m.hips.position, 'y', 0.62); d(m.hips.rotation, 'x', ready ? 0.18 : 0, 4);
    d(m.legL.rotation, 'x', ready ? -0.25 : 0, 6); d(m.legR.rotation, 'x', ready ? 0.3 : 0, 6);
    d(m.armL.rotation, 'x', ready ? -0.5 : 0.1, 5); d(m.armR.rotation, 'x', ready ? -1.9 : 0.1, 4);
    d(m.head.rotation, 'y', ready ? 0 : t > 0.6 ? 0.75 + Math.sin(t * 0.5) * 0.06 : 0.4, 2.5);
    d(m.head.rotation, 'x', ready ? 0.3 : 0, 4);
    m.tail.rotation.y = Math.sin(t * 1.4) * 0.2;
    if (ready && Math.random() < dt * 20) F.rise(SEAT.x + U.rnd(-0.5, 0.5), 0.2, SEAT.z + U.rnd(-0.5, 0.5), U.pick([0xb86cff, 0x6a2aa8, 0x8aef4a]), 1, 0.3, 1.8, 0.1, 0.9);
  }
  // Three shots: the cat on the porch, the cave spilling dogs, then the cat as the horde closes in.
  function camera(t) {
    const cam = G.camera, cave = W.caves[1];
    if (t < 3.8) {
      const k = t / 3.8;
      cam.position.set(SEAT.x + U.lerp(2.6, 1.7, k), U.lerp(2.1, 1.75, k), SEAT.z + U.lerp(4.8, 3.4, k));
      cam.lookAt(SEAT.x, 1.0, SEAT.z);
    } else if (t < 7.2) {
      const k = (t - 3.8) / 3.4;
      cam.position.set(cave.x - 14 - k * 6, 6, cave.z + 10 - k * 4);
      cam.lookAt(U.lerp(cave.x - 3, cave.x - 16, k), 1, U.lerp(cave.z, cave.z - 6, k));
    } else {
      cam.position.set(SEAT.x + 6, 6.5, SEAT.z + 11);
      cam.lookAt(SEAT.x + 4, 0.8, SEAT.z + 2);
    }
  }

  IN.update = function (dt) {
    if (!IN.on) return;
    IN.t += dt;
    const t = IN.t, cave = W.caves[1];
    const caps = G.CHAR.intro || CAPS;
    once('cap1', 0.3, () => caption(caps[0] || ''));
    once('noise1', 1.1, () => A.play('howl'));
    once('noise2', 2.4, () => A.play('scream', 0.75));
    once('cap2', 3.0, () => caption(caps[1] || ''));
    once('warn', 3.8, () => { cave.warn = 6; caption(''); A.play('horn'); });
    if (t > 4.2 && t < 6.4) {
      IN.acc += dt * 14;
      while (IN.acc >= 1) { IN.acc--; G.spawner.spawnAt(cave, 'dog', false); }
      if (Math.random() < dt * 6) A.play('bark');
    }
    once('cap3', 5.0, () => caption(caps[2] || ''));
    once('howl2', 5.6, () => A.play('howl'));
    once('surprise', 7.3, () => {
      A.play(G.CHAR.voice, calm() ? 0.8 : 1); caption('');
      if (calm()) { F.ring(SEAT.x, SEAT.z, { r0: 0.3, r1: 2.6, life: 0.8, color: 0xb86cff }); F.ring(SEAT.x, SEAT.z, { r0: 0.2, r1: 1.6, life: 1.1, color: 0x6a2aa8, y: 0.3 }); } else F.shake(0.3);
    });
    once('fade', 9.6, () => { $('intro-fade').style.opacity = '1'; });
    pose(t, dt);
    ES.update(dt);
    F.update(dt);
    camera(t);
    if (t >= LEN) finish();
  };

  // "?" when it hears the noises, "!" when the dogs burst out.
  IN.drawOverlay = function (c, dpr) {
    const t = IN.t, txt = calm() ? (t >= 3.0 && t < 4.0 ? '…' : '') : t >= 3.0 && t < 4.0 ? '?' : t >= 7.3 && t < 9.6 ? '!' : '';
    if (!txt) return;
    const s = F.project(P.x, 2.6 + (P.root.position.y - SEAT.y), P.z);
    if (!s) return;
    const w = 30 * dpr, h = 30 * dpr, x = s.x - w / 2, y = s.y - h - 8 * dpr;
    c.fillStyle = '#120a06'; c.fillRect(x - 2 * dpr, y - 2 * dpr, w + 4 * dpr, h + 4 * dpr);
    c.fillStyle = '#f4eedc'; c.fillRect(x, y, w, h);
    c.beginPath(); c.moveTo(s.x - 5 * dpr, y + h); c.lineTo(s.x + 5 * dpr, y + h); c.lineTo(s.x, y + h + 8 * dpr); c.closePath(); c.fill();
    c.fillStyle = txt === '!' ? '#c0352a' : '#120a06';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(28 * dpr)}px VT323, monospace`;
    c.fillText(txt, s.x, y + h / 2 + dpr);
  };
})();
