'use strict';
// World: renderer + PS2-style post pass, sky and time of day, the farm arena, caves and colliders.
(function () {
  const T = THREE, U = G.U, M = G.M;
  const W = G.world = { colliders: [], fadeables: [], caves: [], lamps: [], nightLamps: [], phase: 0.5, phaseTarget: 0.5, night: 0, nightTarget: 0, cam: { x: 0, z: 0 } };
  W.ARENA = 39;
  W.GROUND = 132;
  // Where the player may walk: the farm by default, a dungeon's extent while inside one (dungeon.js).
  // spots: where boss mechanics (tesla towers) may stand. solidShots: every projectile stops at walls.
  W.farmBounds = { x0: -W.ARENA, x1: W.ARENA, z0: -W.ARENA, z1: W.ARENA, spots: [-32, 32, -32, 32] };
  W.bounds = W.farmBounds;
  W.inBounds = (x, z, m = 0) => x > W.bounds.x0 - m && x < W.bounds.x1 + m && z > W.bounds.z0 - m && z < W.bounds.z1 + m;
  W.clampX = (x) => U.clamp(x, W.bounds.x0, W.bounds.x1);
  W.clampZ = (z) => U.clamp(z, W.bounds.z0, W.bounds.z1);
  // dark: { hemi, ground, ambient, fog, playerLight, light distance, tint } while in a dungeon (no sky, no sun)
  W.dark = null;

  // Afternoon → blood moon: one sky per danger stage of the current map (capped at the last).
  let PH = [];
  const _c1 = new T.Color(), _c2 = new T.Color();
  const mixHex = (a, b, t, out) => out.set(a).lerp(_c2.set(b), t);

  W.init = function () {
    PH = G.STAGES.map((s) => s.sky);
    const canvas = document.getElementById('gl');
    const r = G.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    const scene = G.scene = new T.Scene();
    G.camera = new T.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 600);
    scene.fog = new T.Fog(0xe0c08c, 38, 110);
    W.hemi = new T.HemisphereLight(0xfff3d6, 0x6a5634, 0.78); scene.add(W.hemi);
    W.sun = new T.DirectionalLight(0xffe0a8, 0.9); W.sun.position.set(-40, 70, 30); scene.add(W.sun);
    W.playerLight = new T.PointLight(0xffc68a, 0, 15, 1.4); scene.add(W.playerLight);

    W.rt = new T.WebGLRenderTarget(2, 2, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
    W.postScene = new T.Scene(); W.postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // uWarp: the map's madness (stages.json maps[].warp): the picture breathes and swims, its colors split
    // and drift around the wheel, and now and then a band of rows tears sideways.
    // uDark / uSafe / uInvVP: The Dark (darkness.js): each pixel's view ray is followed down to the ground,
    // and only the circle of light (uSafe: x, z, radius) keeps its color; uDark 1 = black everywhere else.
    W.postMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: W.rt.texture }, tint: { value: new T.Vector3(1, 1, 1) }, uTime: { value: 0 }, uWarp: { value: 0 }, uDark: { value: 0 },
        uInvVP: { value: new T.Matrix4() }, uSafe: { value: new T.Vector3() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform vec3 tint; uniform float uTime, uWarp, uDark; uniform mat4 uInvVP; uniform vec3 uSafe; varying vec2 vUv;',
        'float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }',
        'float b4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }',
        'float h1(float n){ return fract(sin(n) * 43758.5453); }',
        'vec3 hue(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }',
        'void main(){',
        '  vec2 uv = vUv; vec3 c;',
        '  if (uWarp > 0.001) {',
        '    vec2 d0 = uv - 0.5;',
        '    uv -= d0 * (0.5 + 0.5 * sin(uTime * 0.6)) * 0.02 * uWarp;',
        '    uv.x += sin(uv.y * 17.0 + uTime * 1.3) * 0.0035 * uWarp;',
        '    uv.y += sin(uv.x * 13.0 - uTime * 1.1) * 0.003 * uWarp;',
        '    float row = floor(uv.y * 48.0), tick = floor(uTime * 7.0);',
        '    uv.x += step(0.975, h1(row * 12.9898 + tick * 78.233)) * step(0.55, h1(tick * 3.7)) * (h1(row + tick) - 0.5) * 0.06 * uWarp;',
        '    vec2 ca = d0 * 0.012 * uWarp;',
        '    c = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);',
        '    c = mix(c, max(hue(c, sin(uTime * 0.21) * 1.1), 0.0), 0.35 * min(uWarp, 1.0));',
        '  } else c = texture2D(tDiffuse, uv).rgb;',
        '  float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 1.18) * tint;',
        '  vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * (0.6 + uWarp * 0.9);',
        '  if (uDark > 0.001) {',
        '    vec4 a = uInvVP * vec4(vUv * 2.0 - 1.0, -1.0, 1.0), b = uInvVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);',
        '    vec3 p0 = a.xyz / a.w, dir = b.xyz / b.w - p0;',
        '    float lit = 0.0;',
        '    if (dir.y < -0.0001 && uSafe.z > 0.01) { vec2 g = p0.xz + dir.xz * (-p0.y / dir.y); lit = smoothstep(uSafe.z + 0.8, uSafe.z - 0.6, length(g - uSafe.xy)); }',
        '    c *= 1.0 - uDark * (1.0 - lit);',
        '  }',
        '  c = floor(c * 31.0 + b4(gl_FragCoord.xy) * 0.999) / 31.0;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}',
      ].join('\n'),
      depthTest: false, depthWrite: false,
    });
    W.postScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), W.postMat));

    buildSky(); buildGround(); buildFarm(); buildCaves(); buildBackdrop(); buildNightLights();
    W.setMap(G.MAPS[0]);
    W.applyPhase(W.phase);
    W.resize();
    addEventListener('resize', W.resize);
  };

  W.resize = function () {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2), mode = G.save.settings.res;
    let rh = mode === 'chunky' ? 300 : mode === 'sharp' ? Math.round(h * dpr) : 448;
    rh = Math.max(120, Math.min(rh, Math.round(h * dpr)));
    const rw = Math.max(2, Math.round(rh * w / h));
    G.renderer.setSize(rw, rh, false);
    W.rt.setSize(rw, rh);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
    W.rw = rw; W.rh = rh;
    if (G.fx && G.fx.resize) G.fx.resize();
  };

  W.warpNow = 0;
  W.render = function () {
    const r = G.renderer, u = W.postMat.uniforms, dk = G.darkness && G.darkness.post;
    r.setRenderTarget(W.rt); r.render(G.scene, G.camera);
    u.uTime.value = (performance.now() / 1000) % 3600; u.uWarp.value = W.warpNow;
    u.uDark.value = dk ? dk.dark : 0;
    if (u.uDark.value > 0.001) { u.uInvVP.value.multiplyMatrices(G.camera.matrixWorld, G.camera.projectionMatrixInverse); u.uSafe.value.set(dk.x, dk.z, dk.r); }
    r.setRenderTarget(null); r.render(W.postScene, W.postCam);
  };

  // ---------- sky ----------
  function buildSky() {
    W.skyMat = new T.ShaderMaterial({
      uniforms: { top: { value: new T.Color() }, hor: { value: new T.Color() }, bot: { value: new T.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(min(h * 2.2, 1.0), 0.7)) : mix(hor, bot, min(-h * 6.0, 1.0)); gl_FragColor = vec4(c, 1.0); }',
      side: T.BackSide, depthWrite: false, fog: false,
    });
    W.sky = new T.Mesh(new T.SphereGeometry(450, 16, 10), W.skyMat);
    W.sky.renderOrder = -1;
    G.scene.add(W.sky);
    W.celMat = new T.MeshBasicMaterial({ color: 0xfff2c0, fog: false });
    W.cel = new T.Mesh(new T.CircleGeometry(14, 10), W.celMat);
    G.scene.add(W.cel);
    W.cloudMat = new T.MeshBasicMaterial({ color: 0xffffff, fog: false });
    W.clouds = [];
    const rnd = U.seeded(5);
    for (let i = 0; i < 12; i++) {
      const c = new T.Mesh(new T.IcosahedronGeometry(1, 0), W.cloudMat);
      const a = rnd() * Math.PI * 2, d = 230 + rnd() * 120;
      c.position.set(Math.cos(a) * d, 60 + rnd() * 50, Math.sin(a) * d);
      c.scale.set(24 + rnd() * 30, 5 + rnd() * 4, 12 + rnd() * 10);
      G.scene.add(c); W.clouds.push(c);
    }
  }

  W.setPhaseTarget = (p) => { W.phaseTarget = Math.min(p, PH.length - 1); };
  // ---------- night (the pause between days: day.js, bonfire.js) ----------
  // W.night (0 day .. 1 night) eases toward W.nightTarget over stages.json camp.night.fade seconds and lays the
  // night sky (camp.night.sky) over the day's stage sky. instant: no fade (waking on the next day).
  W.setNight = function (on, instant) { W.nightTarget = on ? 1 : 0; if (instant) W.night = W.nightTarget; };
  // The lights the night needs, made once here (adding lights later recompiles every material): a warm lamp
  // by the house, the barn, the training dummy and the workbench, and the bonfire's light (bonfire.js drives it).
  function buildNightLights() {
    for (const [x, z] of G.CAMP.night.lamps) {
      const L = new T.PointLight(0xffb060, 0, 16, 1.4); L.position.set(x + 0.72, 2.6, z); G.scene.add(L); W.nightLamps.push(L);
    }
    W.fireLight = new T.PointLight(0xff8a30, 0, 36, 1.2); W.fireLight.position.set(G.BONFIRE.at[0], 2.4, G.BONFIRE.at[1]); G.scene.add(W.fireLight);
  }
  function applyNight(k, time) {
    const N = G.CAMP.night.sky, u = W.skyMat.uniforms;
    u.top.value.lerp(_c1.set(N.top), k); u.hor.value.lerp(_c1.set(N.hor), k); u.bot.value.lerp(_c1.set(N.fog), k); G.scene.fog.color.lerp(_c1.set(N.fog), k);
    W.hemi.color.lerp(_c1.set(N.hs), k); W.hemi.groundColor.lerp(_c1.set(N.hg), k); W.hemi.intensity = U.lerp(W.hemi.intensity, N.hi, k);
    W.sun.color.lerp(_c1.set(N.sc), k); W.sun.intensity = U.lerp(W.sun.intensity, N.si, k);
    W.sun.position.set(U.lerp(W.sun.position.x, N.sp[0], k), U.lerp(W.sun.position.y, N.sp[1], k), U.lerp(W.sun.position.z, N.sp[2], k));
    W.cloudMat.color.lerp(_c1.set(N.cl), k); W.celMat.color.lerp(_c1.set(N.cel), k);
    W.playerLight.intensity = U.lerp(W.playerLight.intensity, N.pl, k);
    for (const l of W.lamps) l.intensity = U.lerp(l.intensity, N.lamp, k);
    const tn = W.postMat.uniforms.tint.value; tn.set(U.lerp(tn.x, N.tint[0], k), U.lerp(tn.y, N.tint[1], k), U.lerp(tn.z, N.tint[2], k));
    if (W.windows && k > 0.5) W.windows.visible = true;
  }
  W.applyPhase = function (p) {
    const i = Math.min(Math.floor(p), PH.length - 1), j = Math.min(i + 1, PH.length - 1), t = p - i, a = PH[i], b = PH[j];
    mixHex(a.top, b.top, t, W.skyMat.uniforms.top.value);
    mixHex(a.hor, b.hor, t, W.skyMat.uniforms.hor.value);
    mixHex(a.fog, b.fog, t, W.skyMat.uniforms.bot.value);
    mixHex(a.fog, b.fog, t, G.scene.fog.color);
    mixHex(a.hs, b.hs, t, W.hemi.color); mixHex(a.hg, b.hg, t, W.hemi.groundColor);
    W.hemi.intensity = U.lerp(a.hi, b.hi, t);
    mixHex(a.sc, b.sc, t, W.sun.color); W.sun.intensity = U.lerp(a.si, b.si, t);
    W.sun.position.set(U.lerp(a.sp[0], b.sp[0], t), U.lerp(a.sp[1], b.sp[1], t), U.lerp(a.sp[2], b.sp[2], t));
    mixHex(a.cl, b.cl, t, W.cloudMat.color); mixHex(a.cel, b.cel, t, W.celMat.color);
    W.playerLight.intensity = U.lerp(a.pl, b.pl, t);
    const lamp = U.lerp(a.lamp, b.lamp, t);
    for (const l of W.lamps) l.intensity = lamp;
    const tn = W.postMat.uniforms.tint.value;
    tn.set(U.lerp(a.tint[0], b.tint[0], t), U.lerp(a.tint[1], b.tint[1], t), U.lerp(a.tint[2], b.tint[2], t));
    if (W.windows) W.windows.visible = lamp > 0.9;
  };

  // ---------- ground ----------
  // Ground colours per map (stages.json maps[].ground).
  const GROUNDS = {
    farm: { base: '#5a8a38', patches: ['#4f7d32', '#66963f', '#5f8f3a', '#789a45', '#557f36', '#6e8f3c'], specks: ['#7cab4c', '#3d6a29'], yard: '#86663f', trail: ['#7b5b38', '#6a4c2e'],
      caveDirt: '#706858', path: '#8a7050', pad: '#7d6040', field: '#6b4a2c', rows: '#4d321c', sprouts: ['#6fa040', '#5a8a30'], outer: ['#577f34', '#6a9440', '#46702c'] },
    alien: { base: '#356a5e', patches: ['#2f5a50', '#4a8a6a', '#3a7a6a', '#5aa07a', '#2a5a4a', '#5a4a8a'], specks: ['#7affb0', '#1a3a30'], yard: '#5a4a6a', trail: ['#4a3a5a', '#3a2a4a'],
      caveDirt: '#4a4a5a', path: '#5a4a6a', pad: '#4a3a5a', field: '#3a2a4a', rows: '#2a1a3a', sprouts: ['#9aff6a', '#8a6aca'], outer: ['#2f5a50', '#4a8a6a', '#24483e'] },
    swamp: { base: '#2e3a2a', patches: ['#26321f', '#3a4630', '#2a2a36', '#3a2e42', '#1e2a1a', '#34402a'], specks: ['#5a4a7a', '#141a10'], yard: '#3a2e36', trail: ['#2a2230', '#201a26'],
      caveDirt: '#34303c', path: '#3a3040', pad: '#30283a', field: '#2a2030', rows: '#1a1420', sprouts: ['#6a4a8a', '#4a7a3a'], outer: ['#283224', '#343e2e', '#1e281a'] },
    // veins: cracks with violet light seeping through ([core, halo]); sigils: rings and stars burned into the ground
    void: { base: '#1c1626', patches: ['#15101e', '#241a32', '#2c1c3c', '#120e1a', '#1a2428', '#301a34'], specks: ['#9a6ae0', '#08060c'], yard: '#261c30', trail: ['#30203e', '#1c1426'],
      caveDirt: '#221a2c', path: '#2c2238', pad: '#241c2e', field: '#1c1426', rows: '#100c16', sprouts: ['#8a4ac0', '#3a9a8a'], outer: ['#18121f', '#241c30', '#100c16'],
      veins: ['#c890ff', '#6a2aa0'], sigils: '#8a4ad0' },
  };
  function paintGround(pal) {
    const N = 1024, S = W.GROUND, sc = N / S, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d'), rnd = U.seeded(42), P = (v) => (v + S / 2) * sc;
    g.fillStyle = pal.base; g.fillRect(0, 0, N, N);
    const greens = pal.patches;
    g.globalAlpha = 0.35;
    for (let i = 0; i < 520; i++) { g.fillStyle = greens[Math.floor(rnd() * greens.length)]; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 10 + rnd() * 50, 8 + rnd() * 36, rnd() * 3, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    for (let i = 0; i < 26000; i++) { g.fillStyle = rnd() < 0.5 ? pal.specks[0] : pal.specks[1]; g.fillRect(rnd() * N | 0, rnd() * N | 0, 1, 2); }
    const path = (pts, w, col) => {
      g.strokeStyle = col; g.lineWidth = w * sc; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(P(x), P(z)) : g.moveTo(P(x), P(z)))); g.stroke();
    };
    const blob = (x, z, r, col, n = 9) => { g.fillStyle = col; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(P(x + (rnd() - 0.5) * r), P(z + (rnd() - 0.5) * r), r * (0.45 + rnd() * 0.3) * sc, 0, Math.PI * 2); g.fill(); } };
    // the yard and the trails the monsters have trampled from each cave
    blob(0, 0, 13, pal.yard, 14);
    for (const [cx, cz] of [[0, -46], [0, 46], [-46, 0], [46, 0]]) {
      const pts = [];
      for (let i = 0; i <= 7; i++) { const t = i / 7, w = Math.sin(t * Math.PI) * (rnd() - 0.5) * 5; pts.push([cx * t + (cz ? w : 0), cz * t + (cx ? w : 0)]); }
      path(pts, 3.4, pal.trail[0]); path(pts, 1.4, pal.trail[1]);
      blob(cx * 0.97, cz * 0.97, 9, pal.caveDirt, 10);
    }
    path([[25, -21], [18, -17], [0, -15.5], [-18, -16.5], [-25, -19.5]], 3.6, pal.path);
    g.fillStyle = pal.pad; g.fillRect(P(-29.5), P(-20.5), 9 * sc, 5 * sc);
    // crop rows and a pumpkin patch in the south-west corner
    g.fillStyle = pal.field; g.fillRect(P(-35), P(13), 20 * sc, 22 * sc);
    for (let z = 13.5; z < 35; z += 1.1) {
      g.fillStyle = pal.rows; g.fillRect(P(-35), P(z), 20 * sc, 0.38 * sc);
      if (z < 21) for (let x = -34.5; x < -15.5; x += 0.8) { g.fillStyle = rnd() < 0.5 ? pal.sprouts[0] : pal.sprouts[1]; g.fillRect(P(x), P(z + 0.5), 3, 3); }
    }
    // the void: cracks in the world with violet light seeping through, and old sigils burned into it
    if (pal.veins) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 60; i++) {
        let x = rnd() * N, y = rnd() * N, a = rnd() * Math.PI * 2;
        const pts = [[x, y]], n = 6 + Math.floor(rnd() * 16);
        for (let k = 0; k < n; k++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * (4 + rnd() * 6); y += Math.sin(a) * (4 + rnd() * 6); pts.push([x, y]); }
        for (const [w, c, al] of [[5, pal.veins[1], 0.35], [1.6, pal.veins[0], 1]]) {
          g.globalAlpha = al; g.strokeStyle = c; g.lineWidth = w;
          g.beginPath(); pts.forEach(([px, py], j) => (j ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
        }
      }
      g.globalAlpha = 0.55; g.strokeStyle = pal.sigils; g.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const cx = rnd() * N, cy = rnd() * N, r = 14 + rnd() * 26;
        for (const k of [1, 0.7]) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); }
        g.beginPath();
        for (let k = 0; k <= 5; k++) { const a = k * 4 * Math.PI / 5 - Math.PI / 2, px = cx + Math.cos(a) * r * 0.7, py = cy + Math.sin(a) * r * 0.7; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    const img = g.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = 0.86 + rnd() * 0.26; d[i] *= n; d[i + 1] *= n; d[i + 2] *= n; }
    g.putImageData(img, 0, 0);
    const tex = new T.CanvasTexture(cv);
    tex.magFilter = T.NearestFilter;
    return tex;
  }
  function paintOuter(pal) {
    const N = 64, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), rnd = U.seeded(9);
    g.fillStyle = pal.outer[0]; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 700; i++) { g.fillStyle = rnd() < 0.5 ? pal.outer[1] : pal.outer[2]; g.fillRect(rnd() * N | 0, rnd() * N | 0, 1, 2); }
    const t = new T.CanvasTexture(cv); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(90, 90); t.magFilter = T.NearestFilter;
    return t;
  }
  function buildGround() {
    const geo = new T.PlaneGeometry(W.GROUND, W.GROUND, 66, 66); geo.rotateX(-Math.PI / 2);
    W.groundMat = new T.MeshLambertMaterial();
    G.scene.add(new T.Mesh(geo, W.groundMat));
    const og = new T.PlaneGeometry(1000, 1000, 24, 24); og.rotateX(-Math.PI / 2);
    W.outerMat = new T.MeshLambertMaterial();
    const outer = new T.Mesh(og, W.outerMat); outer.position.y = -0.06;
    G.scene.add(outer);
  }
  // Switch the world to a map: its skies, ground colours and decor.
  W.setMap = function (m) {
    PH = m.stages.map((s) => s.sky);
    W.phase = Math.min(W.phase, PH.length - 1); W.phaseTarget = Math.min(W.phaseTarget, PH.length - 1);
    if (W.groundKey !== m.ground) {
      W.groundKey = m.ground;
      const pal = GROUNDS[m.ground] || GROUNDS.farm;
      for (const mat of [W.groundMat, W.outerMat]) if (mat.map) mat.map.dispose();
      W.groundMat.map = paintGround(pal); W.outerMat.map = paintOuter(pal);
      W.groundMat.needsUpdate = W.outerMat.needsUpdate = true;
    }
    if (W.decorKey !== m.decor) { W.decorKey = m.decor; buildDecor(m.decor); }
    G.scene.fog.near = m.fog[0]; G.scene.fog.far = m.fog[1];
    if (!W.rain) buildRain();
    W.rain.visible = m.weather === 'rain'; W.thunderT = U.rnd(12, 30);
    if (!W.motes) buildMotes();
    W.motes.visible = m.weather === 'motes'; W.flickerT = U.rnd(10, 25);
    W.mapWarp = m.warp;
  };
  // ---------- weather: motes drifting up out of the ground around the camera; now and then the world
  // flickers and whispers ----------
  const MOTE_N = 700, MOTE_R = 34, MOTE_H = 16;
  function buildMotes() {
    const pos = new Float32Array(MOTE_N * 3), col = new Float32Array(MOTE_N * 3), c = new T.Color(), cols = [0xc8a0ff, 0x8a5ad8, 0xe8e0ff, 0x7a2a9a], geo = new T.BufferGeometry();
    W.motesD = [];
    for (let i = 0; i < MOTE_N; i++) {
      W.motesD.push({ x: U.rnd(-MOTE_R, MOTE_R), y: Math.random() * MOTE_H, z: U.rnd(-MOTE_R, MOTE_R), sp: U.rnd(0.4, 1.3), ph: Math.random() * 6 });
      c.setHex(cols[i % cols.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    W.motes = new T.Points(geo, new T.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    W.motes.frustumCulled = false; W.motes.visible = false;
    G.scene.add(W.motes);
  }
  function updateMotes(dt, time) {
    const p = W.motes.geometry.attributes.position.array, cx = W.cam.x, cz = W.cam.z;
    for (let i = 0; i < MOTE_N; i++) {
      const d = W.motesD[i];
      d.y += d.sp * dt; d.x += Math.sin(time * 0.8 + d.ph) * dt * 0.6; d.z += Math.cos(time * 0.7 + d.ph) * dt * 0.6;
      if (d.y > MOTE_H || Math.abs(d.x - cx) > MOTE_R || Math.abs(d.z - cz) > MOTE_R) { if (d.y > MOTE_H) d.y = 0; d.x = cx + U.rnd(-MOTE_R, MOTE_R); d.z = cz + U.rnd(-MOTE_R, MOTE_R); }
      p[i * 3] = d.x; p[i * 3 + 1] = d.y; p[i * 3 + 2] = d.z;
    }
    W.motes.geometry.attributes.position.needsUpdate = true;
    if (G.state === 'playing' && (W.flickerT -= dt) <= 0) {
      W.flickerT = U.rnd(15, 35);
      if (G.fx) G.fx.flash('#2a0a3a', 0.28);
      G.audio.play('whispers');
    }
  }
  // ---------- weather: rain streaks falling around the camera, and lightning now and then ----------
  const RAIN_N = 1100, RAIN_H = 26, RAIN_R = 36, WIND = 4;
  function buildRain() {
    const pos = new Float32Array(RAIN_N * 6), geo = new T.BufferGeometry();
    W.drops = [];
    for (let i = 0; i < RAIN_N; i++) W.drops.push({ x: U.rnd(-RAIN_R, RAIN_R), y: Math.random() * RAIN_H, z: U.rnd(-RAIN_R, RAIN_R), sp: U.rnd(24, 34) });
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    W.rain = new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0xc0b0e8, transparent: true, opacity: 0.45, depthWrite: false }));
    W.rain.frustumCulled = false; W.rain.visible = false;
    G.scene.add(W.rain);
  }
  function updateRain(dt) {
    const p = W.rain.geometry.attributes.position.array, cx = W.cam.x, cz = W.cam.z;
    for (let i = 0; i < RAIN_N; i++) {
      const d = W.drops[i];
      d.y -= d.sp * dt; d.x += WIND * dt;
      if (d.y < 0 || Math.abs(d.x - cx) > RAIN_R || Math.abs(d.z - cz) > RAIN_R) { d.y += d.y < 0 ? RAIN_H : 0; d.x = cx + U.rnd(-RAIN_R, RAIN_R); d.z = cz + U.rnd(-RAIN_R, RAIN_R); }
      const j = i * 6;
      p[j] = d.x; p[j + 1] = d.y; p[j + 2] = d.z; p[j + 3] = d.x - WIND * 0.05; p[j + 4] = d.y + 0.8; p[j + 5] = d.z;
    }
    W.rain.geometry.attributes.position.needsUpdate = true;
    if (G.state === 'playing' && (W.thunderT -= dt) <= 0) {
      W.thunderT = U.rnd(18, 40);
      if (G.fx) G.fx.flash('#d8c8ff', 0.3);
      G.audio.play('thunder');
    }
  }
  // Map decor: alien maps get a crashed saucer beyond the fence and glowing pods across the farm;
  // tiki maps get carved tiki poles, dead trees, skull piles and purple candles; eldritch maps get
  // living things (W.decorUpdate animates them).
  function buildDecor(kind) {
    const shared = [M.matL, M.matB, M.matLI, M.matBI];
    if (W.decor) { G.scene.remove(W.decor); W.decor.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && !shared.includes(o.material)) o.material.dispose(); }); W.decor = null; }
    W.decorUpdate = null;
    if (kind === 'tiki') { buildTiki(); return; }
    if (kind === 'eldritch') { buildEldritch(); return; }
    if (kind !== 'alien') return;
    const g = W.decor = new T.Group(), S = [], GL = [], rnd = U.seeded(31);
    const sc = M.saucerParts(), tilt = new T.Matrix4().compose(new T.Vector3(-54, 1.6, 30), new T.Quaternion().setFromEuler(new T.Euler(0.32, 0.6, 0.18)), new T.Vector3(1, 1, 1));
    for (const p of sc.parts) S.push({ geo: p.geo, color: p.color, m: tilt.clone().multiply(p.m) });
    for (const p of sc.glow) GL.push({ geo: p.geo, color: p.color, m: tilt.clone().multiply(p.m) });
    for (let i = 0; i < 34; i++) {
      const x = -36 + rnd() * 72, z = -36 + rnd() * 72;
      if (W.blocked(x, z, 1.2) || Math.hypot(x, z) < 8 || Math.hypot(x - 25, z + 18) < 8) continue;
      const pd = M.podParts(0.7 + rnd() * 0.7), ry = rnd() * 6;
      S.push(...M.place(pd.parts, x, 0, z, ry)); GL.push(...M.place(pd.glow, x, 0, z, ry));
    }
    g.add(new T.Mesh(M.merge(S, 0.08, 5), M.matL), new T.Mesh(M.merge(GL, 0.1), M.matB));
    const L = new T.PointLight(0x7dff6a, 1.4, 40, 1.4); L.position.set(-50, 5, 26); g.add(L);
    G.scene.add(g);
  }

  function buildTiki() {
    const g = W.decor = new T.Group(), S = [], GL = [], rnd = U.seeded(47);
    const free = (x, z, r) => !W.blocked(x, z, r) && Math.hypot(x, z) > 9 && Math.hypot(x - 25, z + 18) > 8 && Math.hypot(x + 25, z + 37) > 4 && !W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 10);
    const place = (n, r, fn) => { for (let i = 0, k = 0; i < n && k < n * 8; k++) { const x = -36 + rnd() * 72, z = -36 + rnd() * 72; if (free(x, z, r)) { fn(x, z, rnd() * 6); i++; } } };
    place(9, 1.2, (x, z, ry) => S.push(...M.place(M.tikiPole(2.4 + rnd() * 1.8), x, 0, z, ry)));
    place(12, 1, (x, z, ry) => S.push(...M.place(M.deadTree(Math.floor(rnd() * 999)), x, 0, z, ry, 0.9 + rnd() * 0.5)));
    place(10, 0.6, (x, z, ry) => S.push(...M.place(M.skullPile(), x, 0, z, ry)));
    place(14, 0.5, (x, z, ry) => { const c = M.candleParts(); S.push(...M.place(c.parts, x, 0, z, ry)); GL.push(...M.place(c.glow, x, 0, z, ry)); });
    // tree line of dead trees beyond the fence
    for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, d = 46 + rnd() * 30; S.push(...M.place(M.deadTree(i + 100), Math.cos(a) * d, 0, Math.sin(a) * d, rnd() * 6, 1.2 + rnd() * 0.8)); }
    g.add(new T.Mesh(M.merge(S, 0.06, 9), M.matL), new T.Mesh(M.merge(GL, 0), M.matB));
    for (const [x, z] of [[-20, 10], [18, 16], [-6, -26]]) { const L = new T.PointLight(0xb86cff, 1.1, 22, 1.6); L.position.set(x, 3, z); g.add(L); }
    G.scene.add(g);
  }

  // Eldritch Madness: void crystals, twisted spires and glowing sigils on the farm; eye stalks whose eyes
  // turn to follow you and blink; black monoliths floating over the ground, bobbing and turning; giant
  // tentacles swaying over the fence and a few smaller ones breaking through the farm; pulsing lights.
  function buildEldritch() {
    const g = W.decor = new T.Group(), S = [], GL = [], rnd = U.seeded(66);
    const free = (x, z, r) => !W.blocked(x, z, r) && Math.hypot(x, z) > 9 && Math.hypot(x - 25, z + 18) > 8 && Math.hypot(x + 25, z + 37) > 4 && !W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 10);
    const taken = [];
    const spots = (n, r) => {
      const out = [];
      for (let k = 0; out.length < n && k < n * 15; k++) {
        const x = -36 + rnd() * 72, z = -36 + rnd() * 72;
        if (free(x, z, r) && !taken.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 6)) { out.push([x, z]); taken.push([x, z]); }
      }
      return out;
    };
    const both = (o, x, z, ry, s = 1) => { S.push(...M.place(o.parts, x, 0, z, ry, s)); if (o.glow) GL.push(...M.place(o.glow, x, 0, z, ry, s)); };
    for (const [x, z] of spots(10, 1)) both(M.voidCrystals(Math.floor(rnd() * 999)), x, z, rnd() * 6);
    for (const [x, z] of spots(5, 1.2)) both(M.twistedSpire(3 + rnd() * 3, Math.floor(rnd() * 999)), x, z, rnd() * 6);
    for (const [x, z] of spots(3, 3)) GL.push(...M.place(M.sigil(2.6 + rnd() * 1.6), x, 0, z, rnd() * 6));
    // beyond the fence: dead trees and tall twisted spires
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, d = 46 + rnd() * 30, x = Math.cos(a) * d, z = Math.sin(a) * d, ry = rnd() * 6;
      if (W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
      if (i % 3) S.push(...M.place(M.deadTree(i + 300), x, 0, z, ry, 1.3 + rnd() * 0.8)); else both(M.twistedSpire(6 + rnd() * 6, i + 500), x, z, ry, 1.5);
    }
    // eye stalks: the stalks are decor, the eyes one instanced mesh turned to you every frame
    const eyes = [];
    for (const [x, z] of spots(9, 1)) {
      const st = M.eyeStalk(2.2 + rnd() * 1.6, Math.floor(rnd() * 999));
      S.push(...M.place(st.parts, x, 0, z));
      eyes.push({ x: x + st.top[0], y: st.top[1] + 0.3, z: z + st.top[2], blink: rnd() * 5, s: 0.8 + rnd() * 0.4 });
    }
    g.add(new T.Mesh(M.merge(S, 0.06, 13), M.matL), new T.Mesh(M.merge(GL, 0), M.matB));
    const eyeMesh = M.inst(M.eyeballGeo(), new T.MeshBasicMaterial({ vertexColors: true }), Math.max(1, eyes.length));
    g.add(eyeMesh);
    // giant tentacles over the fence; a few smaller ones break through the farm itself
    const tents = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + rnd() * 0.4, d = 50 + rnd() * 18, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) tents.push({ x, z, h: 12 + rnd() * 10, w: 1.1 + rnd() * 0.5, ph: rnd() * 6, sp: 0.3 + rnd() * 0.3 });
    }
    for (const [x, z] of spots(4, 1.5)) tents.push({ x, z, h: 4.5 + rnd() * 2.5, w: 0.5 + rnd() * 0.2, ph: rnd() * 6, sp: 0.6 + rnd() * 0.4 });
    const SEG = 12, tentMesh = M.inst(new T.CylinderGeometry(1, 1, 1, 7), new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x1a0624 }), tents.length * SEG), tc = new T.Color();
    for (let i = 0; i < tents.length * SEG; i++) tentMesh.setColorAt(i, tc.setHex(i % 3 === 0 ? 0x6a2a8a : 0x3e1258));
    g.add(tentMesh);
    // a pool of void where each one breaks through
    const pool = new T.MeshBasicMaterial({ color: 0x07030c });
    for (const t of tents) { const m = new T.Mesh(new T.CircleGeometry(t.w * 1.6, 12), pool); m.rotation.x = -Math.PI / 2; m.position.set(t.x, 0.03, t.z); g.add(m); }
    // floating monoliths, each with a dark patch on the ground under it
    const monos = [];
    for (const [x, z] of spots(5, 1.5)) {
      const mo = M.monolith(2.6 + rnd() * 1.6), mg = new T.Group();
      mg.add(new T.Mesh(M.merge(mo.parts, 0.05), M.matL), new T.Mesh(M.merge(mo.glow, 0), M.matB));
      mg.position.set(x, 3, z); mg.rotation.y = rnd() * 6; g.add(mg);
      const sh = new T.Mesh(new T.CircleGeometry(1.3, 14), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2; sh.position.set(x, 0.04, z); g.add(sh);
      monos.push({ g: mg, y: 3 + rnd() * 1.4, ph: rnd() * 6, spin: (rnd() - 0.5) * 0.6 });
    }
    const lights = [[-18, 12, 0xb86cff], [20, 14, 0x7dffaa], [-4, -24, 0xb86cff], [26, -4, 0xff3a8a]].map(([x, z, c]) => { const L = new T.PointLight(c, 1.2, 24, 1.6); L.position.set(x, 3, z); g.add(L); return L; });
    G.scene.add(g);
    const P = G.player, o = new T.Object3D(), yA = new T.Vector3(0, 1, 0), dv = new T.Vector3();
    W.decorUpdate = function (dt, time) {
      // the eyes follow you, and blink now and then
      eyes.forEach((e, i) => {
        e.blink -= dt;
        if (e.blink < -0.16) e.blink = 2 + Math.random() * 6;
        o.position.set(e.x, e.y, e.z); o.scale.set(1, 1, 1); o.lookAt(P.x, 1, P.z);
        o.scale.set(e.s, e.s * (e.blink < 0 ? 0.12 : 1), e.s); o.updateMatrix(); eyeMesh.setMatrixAt(i, o.matrix);
      });
      eyeMesh.count = eyes.length; eyeMesh.instanceMatrix.needsUpdate = true;
      // the tentacles sway, their tips wriggling
      let n = 0;
      for (const t of tents) {
        let px = t.x, py = 0, pz = t.z;
        for (let i = 1; i <= SEG; i++) {
          const k = i / SEG, k2 = k * k, wr = Math.sin(time * 2.4 + k * 6 + t.ph) * k2 * k * t.w * 0.8;
          const x = t.x + Math.sin(time * t.sp + t.ph + k * 2.2) * k2 * t.h * 0.22 + wr, z = t.z + Math.cos(time * t.sp * 0.8 + t.ph * 1.3 + k * 1.7) * k2 * t.h * 0.16 + wr, y = t.h * k;
          const dx = x - px, dy = y - py, dz = z - pz, l = Math.hypot(dx, dy, dz) || 0.001, w = t.w * (1 - k * 0.8);
          o.quaternion.setFromUnitVectors(yA, dv.set(dx / l, dy / l, dz / l));
          o.position.set((px + x) / 2, (py + y) / 2, (pz + z) / 2); o.scale.set(w, l * 1.12, w); o.updateMatrix();
          tentMesh.setMatrixAt(n++, o.matrix);
          px = x; py = y; pz = z;
        }
      }
      tentMesh.count = n; tentMesh.instanceMatrix.needsUpdate = true;
      if (tentMesh.instanceColor) tentMesh.instanceColor.needsUpdate = true;
      for (const m of monos) { m.g.position.y = m.y + Math.sin(time * 0.7 + m.ph) * 0.35; m.g.rotation.y += m.spin * dt; m.g.rotation.z = Math.sin(time * 0.4 + m.ph) * 0.08; }
      lights.forEach((L, i) => { L.intensity = 1.0 + Math.sin(time * (0.9 + i * 0.3) + i) * 0.45; });
    };
  }

  // ---------- farm ----------
  const box = (x, z, hw, hd) => W.colliders.push({ t: 1, x, z, hw, hd });
  const circ = (x, z, r) => W.colliders.push({ t: 0, x, z, r });
  function fadeable(parts, x, z, ry, hw, hd, h) {
    const mat = new T.MeshLambertMaterial({ vertexColors: true });
    const mesh = new T.Mesh(M.merge(M.place(parts, x, 0, z, ry)), mat);
    G.scene.add(mesh);
    W.fadeables.push({ mesh, mat, minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h, op: 1 });
    return mesh;
  }
  function buildFarm() {
    const S = [], GL = [];
    const add = (parts, x, z, ry = 0, s = 1, y = 0) => S.push(...M.place(parts, x, y, z, ry, s));
    fadeable(M.barnParts(), -25, -27, 0, 6.2, 7.2, 10); box(-25, -27, 6.2, 7.2);
    fadeable(M.siloParts(), -13.5, -31, 0, 2.5, 2.5, 13); circ(-13.5, -31, 2.6);
    const fh = M.farmhouseParts();
    fadeable(fh.parts, 25, -28, 0, 5.2, 5.2, 8.5); box(25, -27.4, 5.4, 5.2);
    W.windows = new T.Mesh(M.merge(M.place(fh.glow, 25, 0, -28)), M.matB); G.scene.add(W.windows);
    const wm = M.windmill(); add(wm.parts, 27, 24); circ(27, 24, 1.5);
    wm.fan.position.add(new T.Vector3(27, 0, 24)); G.scene.add(wm.fan); W.fan = wm.fan;
    add(M.troughParts(), 22.5, 20); box(22.5, 20, 1.5, 0.5);
    add(M.tractorParts(), -14, -18, 0.5); circ(-14, -18.2, 1.7);
    add(M.wellParts(), 11, -13); circ(11, -13, 1.2);
    add(M.coopParts(), 12, -32); box(12, -32, 1.7, 1.4);
    for (const [x, z] of [[-10, 9], [13, 11], [-17, -6], [17, -8], [4, 23], [-6, -21], [21, 3], [-23, 4], [31, 9], [-32, -8]]) { add(M.haybaleParts(), x, z); circ(x, z, 1.1); }
    add(M.squareBaleParts(), -17.5, -22.5); add(M.squareBaleParts(), -17.5, -22.5, 0.1, 1, 0.8); add(M.squareBaleParts(), -16, -23.6, 0.05); box(-16.8, -23, 1.6, 1.2);
    for (const [x, z] of [[-31.5, -18], [-30.4, -17.2], [31, -20]]) { add(M.crateParts(), x, z, 0.3); circ(x, z, 0.75); }
    const rnd = U.seeded(77);
    for (let i = 0; i < 16; i++) add(M.smallPumpkin(), -31 + rnd() * 13, 22 + rnd() * 11, rnd() * 6, 0.8 + rnd() * 0.5);
    for (const [x, z] of [[-18.5, -19.5], [19.2, -20.4]]) {
      const lp = M.lampParts(); add(lp.parts, x, z); GL.push(...M.place(lp.glow, x, 0, z)); circ(x, z, 0.3);
      const L = new T.PointLight(0xffc070, 0, 15, 1.5); L.position.set(x + 0.72, 2.6, z); G.scene.add(L); W.lamps.push(L);
    }
    // perimeter fence with gaps in front of each cave
    const A = 40, gap = 5;
    for (const s of [-1, 1]) {
      S.push(...M.fenceParts(-A, s * A, -gap, s * A), ...M.fenceParts(gap, s * A, A, s * A));
      S.push(...M.fenceParts(s * A, -A, s * A, -gap), ...M.fenceParts(s * A, gap, s * A, A));
    }
    G.scene.add(new T.Mesh(M.merge(S, 0.08, 3), M.matL));
    G.scene.add(new T.Mesh(M.merge(GL, 0), M.matB));
  }

  // ---------- caves ----------
  function buildCaves() {
    const defs = [[0, -47, 0], [47, 0, -Math.PI / 2], [0, 47, Math.PI], [-47, 0, Math.PI / 2]];
    const S = [], DARK = [];
    defs.forEach(([x, z, ry], i) => {
      S.push(...M.place(M.caveParts(i + 1), x, 0, z, ry));
      DARK.push(...M.place([M.p(new T.BoxGeometry(3.8, 3.6, 4), 0x050403, [0, 1.6, -2.3])], x, 0, z, ry));
      const fx = Math.sin(ry), fz = Math.cos(ry);
      const mat = new T.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      const glow = new T.Mesh(new T.PlaneGeometry(3.4, 3.2), mat);
      glow.position.set(x + fx * 0.05, 1.6, z + fz * 0.05); glow.rotation.y = ry;
      G.scene.add(glow);
      W.caves.push({ x, z, fx, fz, mx: x + fx * 1.2, mz: z + fz * 1.2, name: G.CAVE_NAMES[i] || 'a cave', glow: mat, warn: 0 });
      // rock pillars beside the mouth block movement so the opening reads as the way in
      const sx = fz, sz = -fx;
      circ(x + sx * 4.6 - fx * 1.2, z + sz * 4.6 - fz * 1.2, 2.4); circ(x - sx * 4.6 - fx * 1.2, z - sz * 4.6 - fz * 1.2, 2.4);
    });
    G.scene.add(new T.Mesh(M.merge(S, 0.12, 11), M.matL));
    G.scene.add(new T.Mesh(M.merge(DARK, 0), M.matB));
  }

  // ---------- backdrop: cornfields, tree lines, far hills ----------
  function instanced(geo, list, mat) {
    const im = new T.InstancedMesh(geo, mat || M.matLI, list.length), m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), c = new T.Color();
    list.forEach((it, i) => {
      e.set(0, it.ry || 0, it.tilt || 0); q.setFromEuler(e);
      m.compose(new T.Vector3(it.x, 0, it.z), q, new T.Vector3(it.s, it.sy || it.s, it.s));
      im.setMatrixAt(i, m); c.setRGB(it.c || 1, it.c || 1, it.c || 1); im.setColorAt(i, c);
    });
    G.scene.add(im);
    return im;
  }
  function buildBackdrop() {
    const rnd = U.seeded(1234), corn = [], oaks = [], pines = [];
    const nearCave = (x, z, r) => W.caves.some((c) => Math.hypot(c.x - x, c.z - z) < r);
    for (let x = 43.5; x < 64; x += 1.35) for (let z = -62; z < 62; z += 1.15) if (!nearCave(x, z, 11)) corn.push({ x: x + (rnd() - 0.5) * 0.4, z: z + (rnd() - 0.5) * 0.4, ry: rnd() * 6, s: 0.85 + rnd() * 0.35, tilt: (rnd() - 0.5) * 0.15, c: 0.85 + rnd() * 0.3 });
    for (let z = 43.5; z < 60; z += 1.35) for (let x = -42; x < 43; x += 1.15) if (!nearCave(x, z, 11)) corn.push({ x: x + (rnd() - 0.5) * 0.4, z: z + (rnd() - 0.5) * 0.4, ry: rnd() * 6, s: 0.85 + rnd() * 0.35, tilt: (rnd() - 0.5) * 0.15, c: 0.85 + rnd() * 0.3 });
    instanced(M.cornGeo(), corn);
    const tree = (x, z) => { const t = { x, z, ry: rnd() * 6, s: 0.9 + rnd() * 0.7, c: 0.8 + rnd() * 0.35 }; (rnd() < 0.45 ? pines : oaks).push(t); };
    for (let i = 0; i < 260; i++) {
      const x = -95 + rnd() * 190, z = -95 + rnd() * 190;
      const inField = (x > 42 && x < 66 && Math.abs(z) < 64) || (z > 42 && z < 62 && x > -44 && x < 66);
      if (Math.max(Math.abs(x), Math.abs(z)) < 45 || inField || nearCave(x, z, 13)) continue;
      tree(x, z);
    }
    for (let i = -38; i <= 38; i += 3.2) if (Math.abs(i) > 9) { tree(i + (rnd() - 0.5), -50 - rnd() * 4); tree(-50 - rnd() * 4, i + (rnd() - 0.5)); }
    instanced(M.treeGeo(false), oaks); instanced(M.treeGeo(true), pines);
    const hills = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rnd() * 0.2, d = 210 + rnd() * 60;
      hills.push(M.p(M.rockGeo(1, i, 1, 0.25), [0x4a6a3a, 0x56763f, 0x3f5e36][i % 3], [Math.cos(a) * d, -6, Math.sin(a) * d], [0, a, 0], [50 + rnd() * 40, 22 + rnd() * 18, 40]));
    }
    G.scene.add(new T.Mesh(M.merge(hills, 0.1), M.matL));
  }

  // ---------- collisions ----------
  const OUT = [0, 0];
  W.collide = function (x, z, r) {
    for (const c of W.colliders) {
      if (c.t === 0) {
        const dx = x - c.x, dz = z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2), k = (rr - d) / d; x += dx * k; z += dz * k; }
      } else {
        const cx = U.clamp(x, c.x - c.hw, c.x + c.hw), cz = U.clamp(z, c.z - c.hd, c.z + c.hd), dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; x += dx * k; z += dz * k; }
          else {
            const px = c.hw - Math.abs(x - c.x) + r, pz = c.hd - Math.abs(z - c.z) + r;
            if (px < pz) x += (x >= c.x ? 1 : -1) * px; else z += (z >= c.z ? 1 : -1) * pz;
          }
        }
      }
    }
    OUT[0] = x; OUT[1] = z;
    return OUT;
  };
  W.blocked = function (x, z, r) {
    for (const c of W.colliders) {
      if (c.t === 0) { if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return true; }
      else if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return true;
    }
    return false;
  };

  // ---------- per-frame ----------
  W.update = function (dt, time) {
    W.phase = U.damp(W.phase, W.phaseTarget, 0.45, dt);
    W.applyPhase(W.phase);
    W.night = W.nightTarget > W.night ? Math.min(W.nightTarget, W.night + dt / G.CAMP.night.fade) : Math.max(W.nightTarget, W.night - dt / G.CAMP.night.fade);
    const nk = W.night * W.night * (3 - 2 * W.night);   // eased
    if (nk > 0.001 && !W.dark) applyNight(nk, time);
    for (let i = 0; i < W.nightLamps.length; i++) W.nightLamps[i].intensity = W.dark ? 0 : G.CAMP.night.lamp * nk * (0.92 + Math.sin(time * 7 + i * 2.1) * 0.05 + Math.sin(time * 17 + i) * 0.03);
    const D = W.dark;
    W.sky.visible = W.cel.visible = !D;
    for (const c of W.clouds) c.visible = !D;
    if (D) {
      W.hemi.color.set(D.hemi); W.hemi.groundColor.set(D.ground); W.hemi.intensity = D.ambient; W.sun.intensity = 0;
      G.scene.fog.color.set(D.fog); W.playerLight.intensity = D.playerLight * (0.92 + Math.sin(time * 11) * 0.05 + Math.sin(time * 23) * 0.03);
      W.postMat.uniforms.tint.value.set(D.tint[0], D.tint[1], D.tint[2]);
      for (const l of W.lamps) l.intensity = 0;
      if (W.fireLight) W.fireLight.intensity = 0;
      if (W.windows) W.windows.visible = false;
    }
    W.playerLight.distance = D ? D.lightDistance : 15;
    if (W.rain && W.rain.visible) updateRain(dt);
    W.decorT = (W.decorT || 0) + dt;   // the living decor's clock: it stands still while the game does
    if (W.motes && W.motes.visible) updateMotes(dt, W.decorT);
    if (W.decorUpdate && !D) W.decorUpdate(dt, W.decorT);
    // the map's madness rises through the day (none in a dungeon, half at night)
    const mw = W.mapWarp, dayK = G.phase === 'fight' ? U.clamp((G.dayT || 0) / G.DAY_SECONDS, 0, 1) : 0;
    W.warpNow = !mw || D || G.onTitle() ? 0 : U.lerp(mw[0], mw[1], dayK) * (G.phase === 'camp' ? 0.5 : 1);
    if (W.fan) W.fan.rotation.z -= dt * 1.6;
    const cp = G.camera.position;
    W.sky.position.copy(cp);
    const sp = W.sun.position, len = Math.hypot(sp.x, sp.y, sp.z);
    W.cel.position.set(cp.x + sp.x / len * 380, cp.y + Math.max(sp.y / len, 0.12) * 380, cp.z + sp.z / len * 380);
    W.cel.lookAt(cp);
    for (const c of W.clouds) { c.position.x += dt * 1.5; if (c.position.x > 360) c.position.x = -360; }
    for (const c of W.caves) {
      c.warn = Math.max(0, c.warn - dt);
      c.glow.opacity = c.warn > 0 ? (0.45 + Math.sin(time * 14) * 0.25) * Math.min(1, c.warn * 2) : U.damp(c.glow.opacity, 0, 6, dt);
    }
    const p = G.player;
    if (p && p.root) {
      W.playerLight.position.set(p.x, 3.2, p.z + 0.5);
      for (const f of W.fadeables) {
        const occ = f.maxZ > p.z && p.x > f.minX - 0.8 && p.x < f.maxX + 0.8 && f.h > 1 + (Math.max(f.minZ, p.z) - p.z) * 1.25;
        f.op = U.damp(f.op, occ ? 0.28 : 1, 8, dt);
        f.mat.transparent = f.op < 0.99; f.mat.opacity = f.op; f.mat.depthWrite = f.op > 0.6;
      }
    }
  };

  W.updateCamera = function (dt, tx, tz, instant) {
    const asp = G.camera.aspect, k = asp < 1.15 ? 1 + (1.15 - asp) * 0.95 : 1;
    W.cam.x = instant ? tx : U.damp(W.cam.x, tx, 7, dt);
    W.cam.z = instant ? tz : U.damp(W.cam.z, tz, 7, dt);
    let sx = 0, sy = 0;
    if (G.fx && G.save.settings.shake) { const s = G.fx.trauma * G.fx.trauma; sx = (Math.random() - 0.5) * s * 1.8; sy = (Math.random() - 0.5) * s * 1.8; }
    G.camera.position.set(W.cam.x + sx, 17.5 * k + sy, W.cam.z + 13.8 * k);
    G.camera.lookAt(W.cam.x + sx * 0.4, 0.6, W.cam.z - 0.4);
  };
  W.titleCamera = function (t) {
    const a = t * 0.07 + 0.6;
    G.camera.position.set(Math.sin(a) * 10.5, 3.6, Math.cos(a) * 10.5);
    G.camera.lookAt(0, 3.3, 0);
  };

  // ---------- 3D item icons rendered once into data URLs ----------
  W.iconCache = {};
  W.renderIcon = function (key, makeObj, size = 64) {
    if (W.iconCache[key]) return W.iconCache[key];
    const r = G.renderer;
    if (!W.iconRT) {
      W.iconRT = new T.WebGLRenderTarget(size, size);
      W.iconScene = new T.Scene();
      W.iconScene.add(new T.HemisphereLight(0xffffff, 0x50443a, 0.85));
      const dl = new T.DirectionalLight(0xfff2e0, 0.75); dl.position.set(2, 4, 5); W.iconScene.add(dl);
      W.iconCam = new T.PerspectiveCamera(30, 1, 0.05, 100);
    }
    const obj = makeObj(), wrap = new T.Group();
    wrap.add(obj); wrap.rotation.set(0.35, -0.7, 0);
    if (key.startsWith('weapon:scythe') || key.startsWith('weapon:sword')) wrap.rotation.set(0.2, -0.3, -0.75);
    W.iconScene.add(wrap); wrap.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(wrap), c = bb.getCenter(new T.Vector3()), s = bb.getSize(new T.Vector3());
    wrap.position.sub(c);
    const rad = Math.max(s.x, s.y, s.z) * 0.6;
    W.iconCam.position.set(0, 0, rad / Math.tan(15 * Math.PI / 180) * 1.02); W.iconCam.lookAt(0, 0, 0);
    r.setRenderTarget(W.iconRT); r.setClearColor(0x000000, 0); r.clear();
    r.render(W.iconScene, W.iconCam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(W.iconRT, 0, 0, size, size, px);
    r.setRenderTarget(null); r.setClearColor(0x000000, 1);
    W.iconScene.remove(wrap);
    wrap.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] > 40 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    return (W.iconCache[key] = cv.toDataURL());
  };
  W.itemIcon = (it) => W.renderIcon(`${it.slot}:${it.model}:${it.color || ''}`, () => M.itemModel(it));
})();
