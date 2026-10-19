'use strict';
// UI: HUD, level-up cards, inventory + character ledger, workbench, menus, toasts and generated pixel icons.
// Names (CLAUDE.md): the 'alien' tab and renderAlien() show the Miracles; 'spoon' is the Miracle currency;
// 'essence' (G.run.essence, icon 'essence') is Embers.
(function () {
  const U = G.U, A = G.audio;
  const UI = G.ui = { boss: null, sel: null, choices: [] };
  const $ = (id) => document.getElementById(id);
  const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- pixel icons: tiny vector drawings, alpha-thresholded and outlined ----------
  const circle = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const poly = (g, pts, c) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const line = (g, pts, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const drop = (g, c, hl) => { circle(g, 8, 10, 4.6, c); poly(g, [[8, 1.5], [12.4, 9], [3.6, 9]], c); rect(g, 5.6, 8.5, 1.4, 3, hl); };
  const ICONS = {
    poison: (g) => drop(g, '#7ae04a', '#e8ffe0'),
    eye: (g) => { poly(g, [[1, 8], [5, 3.6], [11, 3.6], [15, 8], [11, 12.4], [5, 12.4]], '#e8dcd0'); circle(g, 8, 8, 3.3, '#b86cff'); rect(g, 7.3, 5.4, 1.4, 5.2, '#100818'); rect(g, 2.4, 7.4, 2, 0.9, '#a0201a'); rect(g, 11.8, 8.4, 2, 0.9, '#a0201a'); },
    book: (g) => { rect(g, 2, 2, 12, 12.5, '#6a2a1a'); rect(g, 3, 3, 9.5, 10.5, '#9a4a2a'); rect(g, 12, 2.6, 1.6, 11.4, '#f0e8d0'); circle(g, 7.8, 8, 2.6, '#ffd04a'); circle(g, 7.8, 8, 1.3, '#9a4a2a'); rect(g, 3, 4, 9.5, 0.8, '#ffd04a'); rect(g, 3, 12, 9.5, 0.8, '#ffd04a'); },
    map: (g) => { poly(g, [[1.5, 3], [5.5, 1.8], [10.5, 3], [14.5, 1.8], [14.5, 13], [10.5, 14.2], [5.5, 13], [1.5, 14.2]], '#e8d8a8'); line(g, [[3.5, 11.5], [6.5, 7.5], [9.5, 9.5], [12, 5]], 1.2, '#a0201a'); circle(g, 12, 5, 1.5, '#a0201a'); rect(g, 5.2, 2, 0.8, 11, '#c8b888'); rect(g, 10.2, 3, 0.8, 11, '#c8b888'); },
    chest: (g) => { rect(g, 1.5, 6.5, 13, 7.5, '#8a5a2b'); rect(g, 1.5, 3.5, 13, 3.5, '#b0743a'); rect(g, 1.5, 6.5, 13, 1.2, '#3a2a1a'); rect(g, 6.8, 6, 2.4, 3.6, '#ffd04a'); rect(g, 1.5, 3.5, 1.4, 10.5, '#5a3a1a'); rect(g, 13.1, 3.5, 1.4, 10.5, '#5a3a1a'); },
    barrel: (g) => { rect(g, 4, 1.5, 8, 13, '#8a5a2b'); rect(g, 3, 3.5, 10, 9, '#9a6a34'); rect(g, 3, 4.5, 10, 1.3, '#3a3d43'); rect(g, 3, 10.2, 10, 1.3, '#3a3d43'); circle(g, 8, 8, 1.6, '#7dff6a'); },
    stairs: (g) => { rect(g, 1.5, 1.5, 13, 13, '#141010'); rect(g, 1.5, 12, 13, 2.5, '#8a847c'); rect(g, 4.5, 9, 10, 3, '#7a746c'); rect(g, 7.5, 6, 7, 3, '#6a645c'); rect(g, 10.5, 3, 4, 3, '#5a554e'); circle(g, 3.5, 4, 1.2, '#b86cff'); },
    hammer: (g) => { rect(g, 7, 6, 2.2, 9, '#8a5a2b'); rect(g, 2.5, 2, 11, 4.5, '#8a8a92'); rect(g, 2.5, 2, 11, 1.3, '#c8c8d0'); rect(g, 12, 2, 1.5, 4.5, '#5a5a62'); },
    fish: (g) => { poly(g, [[1.5, 8], [5, 4.5], [10, 4.5], [12.5, 8], [10, 11.5], [5, 11.5]], '#8ab8d8'); poly(g, [[12, 8], [15, 4.5], [15, 11.5]], '#6a98b8'); rect(g, 4, 6.5, 6, 1.2, '#c8e0f0'); circle(g, 4, 7.6, 0.9, '#141820'); },
    gun: (g) => { rect(g, 1.5, 5, 12.5, 3, '#8a8a92'); rect(g, 1.5, 5, 12.5, 1, '#c8c8d0'); rect(g, 9, 4, 4, 1.2, '#5a5a62'); poly(g, [[9, 8], [13, 8], [12, 14.5], [8.5, 14.5]], '#6a3a1a'); line(g, [[7, 8], [7, 10.5], [9, 10.5]], 1, '#3a3a40'); },
    holycross: (g) => { rect(g, 6.4, 1, 3.2, 14, '#ffd04a'); rect(g, 2.4, 4.4, 11.2, 3.2, '#ffd04a'); rect(g, 7.2, 1.8, 1.4, 12.4, '#fff4c0'); rect(g, 3.2, 5.2, 9.6, 1.4, '#fff4c0'); },
    // ---- trinkets ----
    bible: (g) => { rect(g, 2, 2, 11, 13, '#5a2a1a'); rect(g, 12, 3, 2, 11, '#f0e8d0'); rect(g, 2, 2, 11, 1.2, '#7a3a24'); rect(g, 6.8, 4, 1.8, 8.5, '#ffd04a'); rect(g, 4.6, 6, 6.2, 1.8, '#ffd04a'); },
    lantern: (g) => { line(g, [[5, 4.5], [8, 1.2], [11, 4.5]], 1.2, '#8a7a6a'); rect(g, 4, 4, 8, 1.6, '#5a4a3a'); rect(g, 4, 13, 8, 1.8, '#5a4a3a'); rect(g, 4.6, 5.6, 6.8, 7.4, '#ffd060');
      rect(g, 4, 5.6, 1, 7.4, '#5a4a3a'); rect(g, 11, 5.6, 1, 7.4, '#5a4a3a'); poly(g, [[8, 6.5], [9.6, 10], [8, 12], [6.4, 10]], '#fff8d0'); },
    bloodlust: (g) => {   // a homage to the shaman's Bloodlust: a roaring red face in flames
      rect(g, 1, 1, 14, 14, '#4a0806');
      poly(g, [[2, 7], [3.5, 1.5], [5.5, 5.5]], '#ff8a2a'); poly(g, [[6.5, 4.5], [8, 0.5], [9.5, 4.5]], '#ffb040'); poly(g, [[10.5, 5.5], [12.5, 1.5], [14, 7]], '#ff8a2a');
      circle(g, 8, 9.5, 5.4, '#d8401a'); rect(g, 4.6, 7.4, 2.4, 1.3, '#ffe040'); rect(g, 9, 7.4, 2.4, 1.3, '#ffe040');
      line(g, [[3.8, 6], [7, 7.4]], 1.2, '#2a0000'); line(g, [[12.2, 6], [9, 7.4]], 1.2, '#2a0000');
      poly(g, [[5.6, 10.5], [10.4, 10.5], [9.4, 14.6], [6.6, 14.6]], '#2a0000'); rect(g, 6, 10.5, 1, 1.4, '#f4f0e6'); rect(g, 9, 10.5, 1, 1.4, '#f4f0e6');
    },
    pocketwatch: (g) => { rect(g, 7, 0.8, 2, 2.6, '#e8c040'); circle(g, 8, 9.2, 6.2, '#e8c040'); circle(g, 8, 9.2, 4.8, '#f4eedc'); line(g, [[8, 9.2], [8, 5.6]], 1.2, '#16120f'); line(g, [[8, 9.2], [10.6, 10.4]], 1.2, '#16120f'); circle(g, 8, 9.2, 0.9, '#b8352a'); },
    scarecrow: (g) => { rect(g, 7.3, 5, 1.4, 11, '#6a4a2a'); rect(g, 1.5, 6.2, 13, 1.4, '#6a4a2a'); rect(g, 4.5, 6, 7, 5.4, '#5a3a6a'); circle(g, 8, 4, 2.6, '#c8a066');
      poly(g, [[3.8, 3], [12.2, 3], [8, -0.2]], '#3a2a1a'); rect(g, 6.6, 3.6, 1, 1, '#16120f'); rect(g, 8.6, 3.6, 1, 1, '#16120f'); poly(g, [[1, 7.6], [2.6, 6.2], [2.6, 9]], '#e8c25a'); poly(g, [[15, 7.6], [13.4, 6.2], [13.4, 9]], '#e8c25a'); },
    fireflies: (g) => { rect(g, 4, 2.4, 8, 2, '#8a5a2b'); rect(g, 3.6, 4.4, 8.8, 10.6, '#9ac8e0'); rect(g, 4.6, 5.2, 6.8, 9, '#1e2a3a');
      circle(g, 6.2, 9, 1.3, '#d8ff6a'); circle(g, 10, 7.6, 1.3, '#d8ff6a'); circle(g, 8.6, 12.2, 1.3, '#d8ff6a'); rect(g, 5, 5.4, 1, 3, '#c8e8f8'); },
    voodoo: (g) => { circle(g, 7.5, 4.4, 3.2, '#c8a066'); rect(g, 5.2, 6.8, 4.6, 5.6, '#c8a066'); rect(g, 2.4, 7.6, 10.2, 2, '#c8a066'); rect(g, 5.2, 12, 1.8, 3.4, '#c8a066'); rect(g, 8, 12, 1.8, 3.4, '#c8a066');
      line(g, [[5.6, 3.4], [6.8, 4.6]], 0.9, '#16120f'); line(g, [[6.8, 3.4], [5.6, 4.6]], 0.9, '#16120f'); line(g, [[8.4, 3.4], [9.6, 4.6]], 0.9, '#16120f'); line(g, [[9.6, 3.4], [8.4, 4.6]], 0.9, '#16120f');
      line(g, [[9, 9], [14, 4]], 1, '#c0c8d0'); circle(g, 14.2, 3.8, 1.3, '#e8402f'); line(g, [[4, 11], [1, 14]], 1, '#c0c8d0'); circle(g, 1.2, 14, 1.2, '#b86cff'); },
    venomvial: (g) => { rect(g, 6.4, 1, 3.2, 2.4, '#8a5a2b'); rect(g, 6.8, 3.2, 2.4, 2, '#cfe8d0'); circle(g, 8, 10.4, 5.2, '#cfe8d0'); circle(g, 8, 10.6, 4.3, '#4ac83a');
      circle(g, 8, 9.8, 2.2, '#e8ffe0'); rect(g, 6.9, 11.4, 2.2, 1.2, '#e8ffe0'); rect(g, 6.9, 9.2, 0.9, 0.9, '#1a3a0a'); rect(g, 8.2, 9.2, 0.9, 0.9, '#1a3a0a'); rect(g, 7.6, 12.2, 0.8, 0.8, '#1a3a0a'); },
    dinnerbell: (g) => { rect(g, 7, 0.8, 2, 3.4, '#6a4a2a'); poly(g, [[5, 4], [11, 4], [13, 12], [3, 12]], '#e8c040'); rect(g, 2, 12, 12, 1.6, '#c89a2a'); circle(g, 8, 14.4, 1.4, '#8a6a20');
      rect(g, 6, 5, 1.2, 5, '#fff0b0'); line(g, [[0.6, 4], [2, 6]], 1, '#ffe080'); line(g, [[15.4, 4], [14, 6]], 1, '#ffe080'); },
    anatheart: (g) => {   // an anatomical heart: the aorta and veins coming out of the top
      circle(g, 6.4, 9, 4.4, '#9a0a14'); circle(g, 10, 9.6, 4, '#b81a20'); poly(g, [[3, 10], [13.6, 10.4], [8.6, 15.4]], '#9a0a14');
      rect(g, 6.2, 1.5, 2.4, 5, '#c84a4a'); rect(g, 9.4, 2.4, 2, 4.4, '#4a3aa8'); line(g, [[8.6, 2.6], [12.4, 1.6]], 1.4, '#c84a4a');
      line(g, [[5, 8], [7.4, 11.2], [6.6, 13.4]], 0.9, '#4a0408'); line(g, [[11, 7.6], [10, 11]], 0.9, '#ff6a5a');
    },
    mokosh: (g) => {   // Mokosh's totem: a carved trunk with amber eyes under a crown of branches, threads hanging from it
      line(g, [[8, 6], [3, 1.5]], 1.4, '#6a4a2e'); line(g, [[8, 6], [13, 1.5]], 1.4, '#6a4a2e'); line(g, [[8, 6], [8, 0.8]], 1.4, '#6a4a2e');
      rect(g, 5.5, 5, 5, 10.5, '#8a6040'); rect(g, 5.5, 5, 1, 10.5, '#5a3a22'); rect(g, 6.6, 7.4, 1.2, 1, '#ffb040'); rect(g, 8.6, 7.4, 1.2, 1, '#ffb040'); rect(g, 7.2, 10.4, 1.8, 0.8, '#2a1a10');
      rect(g, 5.5, 12, 5, 1.4, '#eee6d6'); line(g, [[3, 1.5], [3, 6]], 0.8, '#e8302a'); line(g, [[13, 1.5], [13, 5.2]], 0.8, '#e8302a'); circle(g, 3, 6.4, 0.9, '#e8302a'); circle(g, 13, 5.6, 0.9, '#f0e8dc');
    },
    eclipse: (g) => { circle(g, 8, 8, 7, '#e8eeff'); circle(g, 8, 8, 5.6, '#141020'); circle(g, 6.2, 6.4, 1, '#3a2a5a'); },
    crown: (g) => { poly(g, [[2, 12], [2, 4], [5, 8], [8, 2.5], [11, 8], [14, 4], [14, 12]], '#ffd04a'); rect(g, 2, 12, 12, 2.4, '#c89a2a'); circle(g, 8, 9, 1.3, '#e8402f'); circle(g, 4.5, 10, 0.9, '#5ab0ff'); circle(g, 11.5, 10, 0.9, '#5ab0ff'); },
    fang: (g) => { poly(g, [[2, 3], [14, 3], [12.5, 6], [3.5, 6]], '#9a3aff'); poly(g, [[4, 5.5], [7, 5.5], [5.5, 14]], '#f4f0e6'); poly(g, [[9, 5.5], [12, 5.5], [10.5, 14]], '#f4f0e6'); circle(g, 5.5, 13.6, 0.9, '#e8402f'); },
    halo: (g) => { g.strokeStyle = '#ffe080'; g.lineWidth = 2; g.beginPath(); g.ellipse(8, 4.5, 5.5, 2.2, 0, 0, Math.PI * 2); g.stroke(); poly(g, [[8, 7], [10.5, 14.5], [8, 12.5], [5.5, 14.5]], '#ff8a3a'); },
    flame: (g) => { poly(g, [[8, 1], [12.5, 8], [12, 12.5], [8, 15], [4, 12.5], [3.5, 8], [6, 9]], '#ff6a1a'); poly(g, [[8, 6], [10.5, 11], [8, 14], [5.5, 11]], '#ffd040'); },
    cripple: (g) => { line(g, [[3, 13], [8, 8], [6, 4]], 2.2, '#f4f0e6'); line(g, [[8, 8], [13, 10]], 2.2, '#f4f0e6'); line(g, [[9.5, 2], [12.5, 6.5]], 1.4, '#e8402f'); line(g, [[12.5, 2], [9.5, 6.5]], 1.4, '#e8402f'); circle(g, 3.5, 14, 1.4, '#e8402f'); },
    blood: (g) => drop(g, '#e8402f', '#ffc0b0'),
    flask: (g) => { rect(g, 6.5, 2, 3, 4, '#d8f0d8'); rect(g, 6, 1, 4, 1.4, '#8a5a2b'); circle(g, 8, 10, 5, '#7ae04a'); rect(g, 5.5, 8, 1.5, 2.5, '#e8ffe0'); },
    hourglass: (g) => { rect(g, 3, 1.5, 10, 1.8, '#b08a50'); rect(g, 3, 12.7, 10, 1.8, '#b08a50'); poly(g, [[4, 3.3], [12, 3.3], [8.6, 8], [7.4, 8]], '#e8dcc8'); poly(g, [[4, 12.7], [12, 12.7], [8.6, 8], [7.4, 8]], '#e8dcc8'); poly(g, [[5.5, 4], [10.5, 4], [8, 6.6]], '#c070ff'); poly(g, [[5.2, 12.7], [10.8, 12.7], [8, 10]], '#c070ff'); },
    heart: (g) => { circle(g, 5.4, 6, 3.4, '#e8402f'); circle(g, 10.6, 6, 3.4, '#e8402f'); poly(g, [[2.2, 7], [13.8, 7], [8, 14]], '#e8402f'); rect(g, 4, 4.4, 2, 1.6, '#ffb0a0'); },
    milk: (g) => { rect(g, 4.5, 5.5, 7, 9, '#f4f0e6'); rect(g, 6, 2.5, 4, 3.5, '#f4f0e6'); rect(g, 5.6, 1.2, 4.8, 1.8, '#3d6fd0'); rect(g, 4.5, 8.5, 7, 3, '#3d6fd0'); },
    door: (g) => { rect(g, 2, 2, 12, 12, '#c0352a'); line(g, [[3.5, 3.5], [12.5, 12.5]], 1.6, '#ffffff'); line(g, [[12.5, 3.5], [3.5, 12.5]], 1.6, '#ffffff'); g.strokeStyle = '#ffffff'; g.lineWidth = 1.2; g.strokeRect(2.6, 2.6, 10.8, 10.8); },
    shieldheal: (g) => { poly(g, [[2, 2], [14, 2], [14, 8], [8, 14.5], [2, 8]], '#5a8ad0'); rect(g, 7, 4, 2, 7, '#7dff6a'); rect(g, 4.5, 6.5, 7, 2, '#7dff6a'); },
    blades: (g) => { for (let k = 0; k < 3; k++) { g.save(); g.translate(8, 8); g.rotate(k * 2.094); g.strokeStyle = '#dfe8f0'; g.lineWidth = 2.2; g.beginPath(); g.arc(0, -3.6, 3.4, Math.PI * 0.95, Math.PI * 2); g.stroke(); g.restore(); } circle(g, 8, 8, 1.7, '#8a5a2b'); },
    zigzag: (g) => { line(g, [[2, 13], [6, 6], [9, 11], [13, 4]], 2, '#ffd040'); poly(g, [[14.5, 1.8], [10, 3], [13.6, 6.5]], '#ffd040'); },
    chain: (g) => { g.strokeStyle = '#c0c8d0'; g.lineWidth = 2; g.beginPath(); g.ellipse(5.5, 10, 3.6, 2.3, -0.8, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(10.5, 6, 3.6, 2.3, -0.8, 0, Math.PI * 2); g.stroke(); },
    crosshair: (g) => { g.strokeStyle = '#e8402f'; g.lineWidth = 1.8; g.beginPath(); g.arc(8, 8, 5, 0, Math.PI * 2); g.stroke(); line(g, [[8, 1], [8, 5]], 1.6, '#e8402f'); line(g, [[8, 11], [8, 15]], 1.6, '#e8402f'); line(g, [[1, 8], [5, 8]], 1.6, '#e8402f'); line(g, [[11, 8], [15, 8]], 1.6, '#e8402f'); circle(g, 8, 8, 1.3, '#ffffff'); },
    burst: (g) => { const pts = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 3 : 7; pts.push([8 + Math.cos(a) * r, 8 + Math.sin(a) * r]); } poly(g, pts, '#ffd040'); circle(g, 8, 8, 2.2, '#fff4c0'); },
    bomb: (g) => { circle(g, 7, 10, 5, '#2a2a34'); rect(g, 8.6, 3.6, 3, 3, '#5a5a66'); line(g, [[10.6, 4], [12.6, 2.2]], 1.2, '#b08a50'); circle(g, 13.4, 2, 1.5, '#ffb030'); circle(g, 5.4, 8.4, 1.2, '#8a8a9a'); },
    bolt: (g) => poly(g, [[9.5, 1], [3, 9], [7.5, 9], [6, 15], [13, 6.5], [8.6, 6.5], [11, 1]], '#ffd040'),
    boot: (g) => { poly(g, [[4, 2], [9, 2], [9, 9.5], [14, 10.5], [14, 13.5], [3, 13.5], [4, 8]], '#9a6a35'); rect(g, 3, 13, 11, 1.6, '#3a2a1c'); poly(g, [[9, 3.5], [14.5, 2], [13.5, 5], [9.5, 7]], '#ffffff'); },
    sword: (g) => { line(g, [[4, 12], [12.5, 3.5]], 2.4, '#dfe8f0'); poly(g, [[14.5, 1.5], [11.2, 2.8], [13.2, 4.8]], '#dfe8f0'); line(g, [[2.8, 9.6], [6.4, 13.2]], 1.8, '#e8c040'); line(g, [[1.8, 14.2], [3.8, 12.2]], 2, '#8a5a2b'); },
    area: (g) => { g.strokeStyle = '#ff9a3a'; g.lineWidth = 1.8; g.beginPath(); g.arc(8, 8, 4.6, 0, Math.PI * 2); g.stroke(); poly(g, [[8, 0.6], [6.3, 2.6], [9.7, 2.6]], '#ff9a3a'); poly(g, [[8, 15.4], [6.3, 13.4], [9.7, 13.4]], '#ff9a3a'); poly(g, [[0.6, 8], [2.6, 6.3], [2.6, 9.7]], '#ff9a3a'); poly(g, [[15.4, 8], [13.4, 6.3], [13.4, 9.7]], '#ff9a3a'); circle(g, 8, 8, 1.6, '#ffd0a0'); },
    magnet: (g) => { g.strokeStyle = '#d8352a'; g.lineWidth = 3.4; g.beginPath(); g.arc(8, 8.5, 4.2, 0, Math.PI); g.stroke(); line(g, [[3.8, 8.5], [3.8, 4]], 3.4, '#d8352a'); line(g, [[12.2, 8.5], [12.2, 4]], 3.4, '#d8352a'); rect(g, 2, 1.4, 3.6, 2.6, '#c8c8d0'); rect(g, 10.4, 1.4, 3.6, 2.6, '#c8c8d0'); },
    clover: (g) => { for (const [x, y] of [[5.6, 5.6], [10.4, 5.6], [5.6, 10.4], [10.4, 10.4]]) circle(g, x, y, 2.7, '#4caf3a'); line(g, [[8, 8], [11, 15]], 1.4, '#2f7a24'); circle(g, 5, 5, 0.9, '#9ae07a'); },
    totem: (g) => {
      rect(g, 4.5, 2.5, 7, 4.5, '#2e8a8a'); poly(g, [[4.5, 2.6], [5.4, 0.4], [7, 2.6]], '#2e8a8a'); poly(g, [[9, 2.6], [10.6, 0.4], [11.5, 2.6]], '#2e8a8a');
      rect(g, 5, 7, 6, 4, '#a0672e'); rect(g, 1.5, 7.6, 13, 1.8, '#c0352a'); rect(g, 5.5, 11, 5, 4.5, '#8a5a2b');
      rect(g, 5.8, 4, 1.5, 1.5, '#9ff8ff'); rect(g, 8.7, 4, 1.5, 1.5, '#9ff8ff'); rect(g, 6.6, 12.2, 1.1, 1.1, '#9ff8ff'); rect(g, 8.3, 12.2, 1.1, 1.1, '#9ff8ff');
    },
    goat: (g) => {   // Gregory: a black goat's head, swept horns, amber eyes split by horizontal pupils, a beard
      line(g, [[5.6, 4.4], [4.4, 1.8], [2.2, 1.2], [1.2, 2.8]], 1.7, '#b09a7a'); line(g, [[10.4, 4.4], [11.6, 1.8], [13.8, 1.2], [14.8, 2.8]], 1.7, '#b09a7a');
      poly(g, [[4.4, 6], [0.8, 7.4], [4.2, 8.6]], '#3e3746'); poly(g, [[11.6, 6], [15.2, 7.4], [11.8, 8.6]], '#3e3746');
      poly(g, [[4.6, 4], [11.4, 4], [12, 8], [10.2, 12.6], [5.8, 12.6], [4, 8]], '#4a4254'); rect(g, 6.2, 10.4, 3.6, 2.4, '#5a5064');
      rect(g, 4.8, 6.4, 2.6, 2, '#ffb21a'); rect(g, 8.6, 6.4, 2.6, 2, '#ffb21a'); rect(g, 4.8, 7, 2.6, 1, '#000000'); rect(g, 8.6, 7, 2.6, 1, '#000000');
      poly(g, [[6.4, 12.4], [9.6, 12.4], [8, 15.8]], '#2a2530');
    },
    paw: (g) => { circle(g, 8, 10.5, 3.6, '#f0a0b0'); circle(g, 3.8, 6.5, 1.7, '#f0a0b0'); circle(g, 6.4, 3.6, 1.7, '#f0a0b0'); circle(g, 9.6, 3.6, 1.7, '#f0a0b0'); circle(g, 12.2, 6.5, 1.7, '#f0a0b0'); },
    skull: (g) => { circle(g, 8, 7, 5.5, '#ece4d0'); rect(g, 5, 10, 6, 4, '#ece4d0'); circle(g, 5.8, 7.2, 1.6, '#2a1a14'); circle(g, 10.2, 7.2, 1.6, '#2a1a14'); poly(g, [[8, 9], [7, 11], [9, 11]], '#2a1a14'); rect(g, 6.5, 12.5, 0.9, 1.6, '#2a1a14'); rect(g, 8.6, 12.5, 0.9, 1.6, '#2a1a14'); },
    moon: (g) => { circle(g, 8, 8, 6, '#ffe08a'); g.globalCompositeOperation = 'destination-out'; circle(g, 11.2, 5.8, 5, '#000'); g.globalCompositeOperation = 'source-over'; circle(g, 4.8, 9.5, 0.9, '#d8b048'); },
    dice: (g) => { rect(g, 2.5, 2.5, 11, 11, '#f0ebe0'); for (const [x, y] of [[5, 5], [11, 5], [8, 8], [5, 11], [11, 11]]) circle(g, x, y, 1.1, '#c0352a'); },
    cards: (g) => { g.save(); g.translate(8, 9); g.rotate(-0.3); rect(g, -6, -5.5, 7, 10, '#4fa6ff'); g.restore(); g.save(); g.translate(8, 9); g.rotate(0.25); rect(g, -2, -6.5, 7, 10, '#f0ebe0'); g.restore(); circle(g, 9.4, 8.4, 1.5, '#c0352a'); },
    armor: (g) => { poly(g, [[2, 3.2], [5.6, 1.8], [8, 3.4], [10.4, 1.8], [14, 3.2], [13, 8.5], [12, 13.6], [8, 15], [4, 13.6], [3, 8.5]], '#7a7a84'); poly(g, [[5.4, 4.4], [8, 5.6], [10.6, 4.4], [10.1, 12.1], [8, 13.1], [5.9, 12.1]], '#c8c8d0'); rect(g, 7.4, 5.6, 1.2, 7.2, '#8a8a94'); rect(g, 2.4, 3.6, 2.4, 1.4, '#c8c8d0'); rect(g, 11.2, 3.6, 2.4, 1.4, '#c8c8d0'); },
    trophy: (g) => { poly(g, [[3.5, 2], [12.5, 2], [11.6, 7.4], [8, 10], [4.4, 7.4]], '#ffd04a'); line(g, [[3.8, 3.4], [1.8, 4.2], [2.4, 6.8], [4.6, 7.4]], 1.1, '#c89a28'); line(g, [[12.2, 3.4], [14.2, 4.2], [13.6, 6.8], [11.4, 7.4]], 1.1, '#c89a28'); rect(g, 7, 9.4, 2, 2.8, '#c89a28'); rect(g, 4.4, 12, 7.2, 2.6, '#8a5a2b'); rect(g, 5.2, 3, 1.4, 4, '#fff4c0'); },
    shield: (g) => { poly(g, [[2.5, 2.5], [13.5, 2.5], [13.5, 8], [8, 14.5], [2.5, 8]], '#8a6a3a'); poly(g, [[4.5, 4], [11.5, 4], [11.5, 8], [8, 12], [4.5, 8]], '#c0a060'); rect(g, 7.2, 4, 1.6, 8, '#8a6a3a'); },
    star: (g) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.8 : 7; pts.push([8 + Math.cos(a) * r, 8.6 + Math.sin(a) * r]); } poly(g, pts, '#ffd040'); },
    pickaxe: (g) => { line(g, [[3, 14.5], [11, 4.5]], 2, '#8a5a2b'); line(g, [[5.6, 1.8], [9.5, 2.6], [12.4, 4.6], [14.6, 8]], 2.2, '#c6ced6'); },
    feather: (g) => { poly(g, [[13.5, 1.5], [9, 3], [4.5, 8], [3.5, 12.5], [8, 11], [12.5, 6]], '#e8e8f0'); line(g, [[2, 14.5], [12, 3.5]], 1.2, '#8a8a9a'); },
    snail: (g) => {
      rect(g, 1.5, 11.5, 13, 2.5, '#9fd8ff'); line(g, [[2.5, 11.5], [1.6, 7.6]], 1.1, '#9fd8ff'); line(g, [[4.2, 11.5], [4.4, 7.6]], 1.1, '#9fd8ff');
      circle(g, 9, 8, 4.6, '#c08a4a'); g.strokeStyle = '#6a4a22'; g.lineWidth = 1.2; g.beginPath(); g.arc(9, 8, 2.3, 0, Math.PI * 1.6); g.stroke();
    },
    stars: (g) => {
      const star = (cx, cy, R, col) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.42 : R; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } poly(g, pts, col); };
      g.strokeStyle = '#ffb070'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(8, 9, 6.6, 3, 0, 0, Math.PI * 2); g.stroke();
      star(3.8, 8, 3.2, '#ffe080'); star(12.2, 7, 3.2, '#ffe080'); star(8, 12.2, 2.8, '#fff4c0');
    },
    root: (g) => {
      line(g, [[8, 1.5], [8, 14.5]], 2, '#7a5428'); line(g, [[8, 9.5], [3, 14.5]], 1.6, '#7a5428'); line(g, [[8, 9.5], [13, 14.5]], 1.6, '#7a5428');
      line(g, [[8, 5], [4, 3.2]], 1.4, '#5a8a2a'); line(g, [[8, 6.5], [12.5, 4.2]], 1.4, '#5a8a2a');
      circle(g, 4, 3.2, 1.7, '#8fd46a'); circle(g, 12.5, 4.2, 1.7, '#8fd46a'); circle(g, 8, 2, 1.7, '#8fd46a');
    },
    anchor: (g) => {
      g.strokeStyle = '#c6ced6'; g.lineWidth = 1.6; g.beginPath(); g.arc(8, 3.2, 1.8, 0, Math.PI * 2); g.stroke();
      line(g, [[8, 5], [8, 14]], 2, '#c6ced6'); line(g, [[4.8, 7.4], [11.2, 7.4]], 1.6, '#c6ced6');
      g.lineWidth = 2; g.beginPath(); g.arc(8, 8.6, 5.6, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    },
    ufo: (g) => {
      poly(g, [[6, 12], [10, 12], [13, 15.5], [3, 15.5]], '#9dff7a'); circle(g, 8, 6.8, 3.2, '#7dff6a');
      g.fillStyle = '#c6ced6'; g.beginPath(); g.ellipse(8, 9, 7, 2.6, 0, 0, Math.PI * 2); g.fill();
      rect(g, 3, 8.6, 1.5, 1.2, '#ffe14a'); rect(g, 7.3, 9.6, 1.5, 1.2, '#ffe14a'); rect(g, 11.5, 8.6, 1.5, 1.2, '#ffe14a');
    },
    // Embers (the key is left from when they were Essence): a small flame over a glowing coal, two sparks
    essence: (g) => {
      poly(g, [[8, 2.6], [11.4, 8.4], [11, 11.6], [8, 13.4], [5, 11.6], [4.6, 8.4], [6.6, 9]], '#ff7a1a');
      poly(g, [[8, 6.6], [9.8, 10.4], [8, 12.6], [6.2, 10.4]], '#ffd040');
      rect(g, 4, 13, 8, 2, '#c8401a'); rect(g, 5.4, 13.4, 2, 1, '#ffb040');
      rect(g, 12.6, 3.4, 1.4, 1.4, '#ffd040'); rect(g, 2.4, 5.2, 1.2, 1.2, '#ff9a3a');
    },
    // a Miracle (and the Miracles tab): the sun, rays all around
    sun: (g) => {
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a); poly(g, [[8 + c * 7.6, 8 + s2 * 7.6], [8 + Math.cos(a + 0.32) * 4.4, 8 + Math.sin(a + 0.32) * 4.4], [8 + Math.cos(a - 0.32) * 4.4, 8 + Math.sin(a - 0.32) * 4.4]], i % 2 ? '#ffb030' : '#ffd84a'); }
      circle(g, 8, 8, 4.4, '#ffd84a'); circle(g, 8, 8, 3, '#fff4c0'); rect(g, 6.2, 6, 1.4, 1.4, '#ffffff');
    },
    // the bonfire: logs crossed under a tall flame
    bonfire: (g) => {
      line(g, [[2.5, 14.5], [13.5, 11]], 2.2, '#6a4020'); line(g, [[2.5, 11], [13.5, 14.5]], 2.2, '#8a5a2b');
      poly(g, [[8, 0.8], [12.6, 8], [11.6, 12.4], [8, 13.6], [4.4, 12.4], [3.4, 8], [6, 8.6]], '#ff6a1a'); poly(g, [[8, 5.2], [10.4, 10], [8, 12.8], [5.6, 10]], '#ffd040');
    },
    // a wooden cross
    cross: (g) => { rect(g, 6.8, 1, 2.6, 14, '#8a5a2b'); rect(g, 2.6, 4.2, 11, 2.4, '#8a5a2b'); rect(g, 7.4, 1.6, 1, 12.8, '#a8763a'); rect(g, 3.2, 4.8, 9.8, 0.9, '#a8763a'); },
    axe: (g) => { line(g, [[3, 14.5], [11.5, 3]], 1.8, '#8a5a2b'); poly(g, [[8.6, 1.4], [14.6, 3.2], [14.4, 9.6], [10.6, 7]], '#c6ced6'); poly(g, [[14.6, 3.2], [14.4, 9.6], [13.4, 8.6], [13.6, 4]], '#f4f8ff'); },
    spoon: (g) => {
      line(g, [[2.6, 14], [9.5, 6.6]], 2, '#c6ced6');
      g.save(); g.translate(11, 4.6); g.rotate(-0.85);
      g.fillStyle = '#c6ced6'; g.beginPath(); g.ellipse(0, 0, 4.4, 2.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7dff6a'; g.beginPath(); g.ellipse(-0.3, -0.2, 2.8, 1.6, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    },
  };
  const iconCache = {};
  UI.iconKeys = () => Object.keys(ICONS);   // the talent creator's icon picker
  UI.icon = function (key) {
    if (iconCache[key]) return iconCache[key];
    const s = 16, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    (ICONS[key] || ICONS.burst)(g);
    const im = g.getImageData(0, 0, s, s), d = im.data, a = new Uint8Array(s * s);
    for (let i = 0; i < s * s; i++) { a[i] = d[i * 4 + 3] > 100 ? 1 : 0; d[i * 4 + 3] = a[i] ? 255 : 0; }
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = y * s + x;
      if (a[i]) continue;
      if ((x > 0 && a[i - 1]) || (x < s - 1 && a[i + 1]) || (y > 0 && a[i - s]) || (y < s - 1 && a[i + s])) { d[i * 4] = 20; d[i * 4 + 1] = 12; d[i * 4 + 2] = 10; d[i * 4 + 3] = 255; }
    }
    g.putImageData(im, 0, 0);
    const o = document.createElement('canvas'); o.width = o.height = 48;
    const og = o.getContext('2d'); og.imageSmoothingEnabled = false; og.drawImage(c, 0, 0, 48, 48);
    return (iconCache[key] = o.toDataURL());
  };
  // The same icons as images, for drawing on the overlay canvas.
  const imgCache = {};
  UI.iconImage = function (key) {
    if (!imgCache[key]) { const im = new Image(); im.src = UI.icon(key); imgCache[key] = im; }
    return imgCache[key];
  };

  // ---------- screens ----------
  const SCREENS = ['scr-title', 'scr-select', 'scr-level', 'scr-inv', 'scr-bench', 'scr-mokosh', 'scr-bonfire', 'scr-debug', 'scr-pause', 'scr-over', 'scr-book'];
  UI.show = function (id) { for (const s of SCREENS) $(s).hidden = s !== id; };

  UI.init = function () {
    const click = (id, fn) => $(id).addEventListener('click', (e) => { A.init(); A.play('click'); fn(e); });
    click('b-start', () => G.select.open());
    click('b-book', () => G.openBook()); click('b-book-p', () => G.openBook()); click('b-book-close', () => G.closeBook());
    click('b-inv', () => G.openPanel('ledger'));
    click('b-inv-close', () => G.closePanel());
    for (const t of PANEL_TABS) click('t-' + t, () => UI.setTab(t));
    // the ledger's cat turns by itself; drag it to turn it yourself
    const pv = $('preview');
    pv.addEventListener('pointerdown', (e) => { PV.drag = { x: e.clientX, yaw: PV.yaw }; if (pv.setPointerCapture) pv.setPointerCapture(e.pointerId); });
    pv.addEventListener('pointermove', (e) => { if (PV.drag) PV.yaw = PV.drag.yaw + (e.clientX - PV.drag.x) * 0.02; });
    const release = () => { if (PV.drag) { PV.drag = null; PV.rest = 2.5; } };
    pv.addEventListener('pointerup', release); pv.addEventListener('pointercancel', release);
    click('b-music', () => { A.setMusic(!G.save.settings.music); G.store.write(); UI.syncSettings(); });
    click('b-pause', () => G.pause());
    click('b-resume', () => G.resume());
    click('b-restart', () => G.newGame());
    click('b-quit', () => G.toTitle());
    click('b-again', () => G.newGame());
    click('b-title', () => G.toTitle());
    click('b-reroll', () => UI.reroll());
    click('b-talents', () => G.openPanel('talents'));
    click('b-tal', () => G.openPanel('talents'));
    click('b-tal-reset', () => {
      const b = $('b-tal-reset');
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'CONFIRM RESET'; return; }
      G.talents.reset(); UI.renderTalents();
    });
    $('tot-img').src = UI.icon('totem'); $('spn-img').src = UI.icon(G.CURRENCIES.spoon.icon); $('ess-img').src = UI.icon('essence');
    click('b-bench-close', () => G.resume());
    click('b-dbg-close', () => G.resume());
    click('b-scrap-down', () => {
      const [n, xp] = G.progress.scrapDowngrades();
      UI.toast(n ? `Scrapped ${n} downgrade${n === 1 ? '' : 's'} · +${xp} XP` : 'No downgrades in the saddlebag', '#ffd27a');
      UI.sel = null; UI.renderInv();
    });
    $('trinket').addEventListener('click', () => { A.init(); G.trinkets.use(); });
    click('b-bench-scrap', () => {
      const r = G.pickups.scrapAll();
      if (r.n) UI.toast(`Scrapped ${r.n} item${r.n === 1 ? '' : 's'} from the ground · +${r.xp} XP`, '#ffd27a');
      UI.renderBench();
    });
    click('b-bench-reroll', () => { if (G.progress.shopReroll()) { A.play('reroll'); UI.renderBench(); } });
    // drag the talent tree with the mouse; a drag never counts as a click on a talent
    const view = $('tal-view');
    let drag = null;
    view.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop, moved: false }; });
    addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) { drag.moved = true; view.classList.add('dragging'); }
      if (drag.moved) { view.scrollLeft = drag.sl - dx; view.scrollTop = drag.st - dy; }
    });
    addEventListener('pointerup', () => { if (drag && drag.moved) UI.draggedAt = performance.now(); drag = null; view.classList.remove('dragging'); });
    const swallow = (e) => { if (performance.now() - (UI.draggedAt || 0) < 80) { e.stopPropagation(); e.preventDefault(); } };
    view.addEventListener('click', swallow, true); view.addEventListener('dblclick', swallow, true);
    $('btn-dash').addEventListener('touchstart', (e) => { G.input.dash = true; e.preventDefault(); }, { passive: false });
    $('s-music').addEventListener('change', (e) => { A.setMusic(e.target.checked); G.store.write(); });
    $('s-sfx').addEventListener('input', (e) => { A.setSfx(+e.target.value); G.store.write(); });
    $('s-sfx').addEventListener('change', () => A.play('hit'));
    $('s-res').addEventListener('change', (e) => { G.save.settings.res = e.target.value; G.store.write(); G.world.resize(); });
    $('s-shake').addEventListener('change', (e) => { G.save.settings.shake = e.target.checked; G.store.write(); });
    UI.syncSettings();
    UI.showBest();
    const nw = G.DATA_WARNINGS.length;
    if (nw) UI.toast(`${nw} problem${nw === 1 ? '' : 's'} in the data/ files. Open the browser console (F12) for details.`, '#ff6a4a');
  };
  UI.syncSettings = function () {
    const s = G.save.settings;
    $('s-music').checked = s.music; $('s-sfx').value = s.sfx; $('s-res').value = s.res; $('s-shake').checked = s.shake;
    $('b-music').style.opacity = s.music ? 1 : 0.45;
  };
  UI.showBest = function () {
    const b = G.save.best;
    $('best').textContent = b.time > 0 ? `Longest harvest: ${U.fmtTime(b.time)}${b.day ? ` · day ${b.day}` : ''} · level ${b.level} · ${b.kills} kills` : '';
    const pts = G.talents.points('totem') + G.talents.points('spoon');
    $('b-talents').textContent = pts ? `TALENTS (${pts})` : 'TALENTS';
  };

  // ---------- HUD ----------
  const last = {};
  const set = (id, prop, v) => { const k = id + prop; if (last[k] === v) return; last[k] = v; if (prop === 'text') $(id).textContent = v; else $(id).style[prop] = v; };
  UI.resetHUD = function () { for (const k in last) delete last[k]; };
  UI.updateHUD = function () {
    const s = G.stats, P = G.player, need = G.xpNeeded(G.level);
    const held = G.state === 'held';   // Left Alt: "|| PAUSE"
    if (last.held !== held) { last.held = held; $('held').hidden = !held; }
    $('hud').hidden = G.onTitle();
    $('touch').hidden = !(G.input.touch && G.state === 'playing');
    set('hpfill', 'width', pct(Math.max(0, P.hp / s.maxHp), 1));
    set('hplag', 'width', pct(Math.max(0, P.hp / s.maxHp), 1));
    const sh = G.tfx.shield;
    set('hptext', 'text', `${Math.ceil(P.hp)}/${Math.round(s.maxHp)}${sh ? ` +${Math.ceil(sh.hp)}` : ''}`);
    set('xpfill', 'width', pct(Math.min(1, G.xp / need), 1));
    set('lv', 'text', 'LV ' + G.level);
    set('timer', 'text', U.fmtTime(G.time));
    const camp = G.phase === 'camp', ne = G.days.nextEventIn(), dg = G.dungeon.status();
    set('danger', 'text', dg ? dg.title : camp ? `DAY ${G.day + 1} · NIGHT` : `DAY ${G.day + 1} · DANGER ${U.roman(G.tier)}`);
    set('nexts', 'text', dg ? dg.sub : camp ? 'Night: warm yourself at the bonfire (E) and pray to wake on the next day'
      : `Night in ${U.fmtTime(G.DAY_SECONDS - G.dayT)}${ne != null ? ` · Next event in ${U.fmtTime(ne)}` : ''}`);
    const es = Math.floor(G.run.essence);
    set('ess-n', 'text', `${es} EMBER${es === 1 ? '' : 'S'}`);
    set('kills', 'text', `${G.run.kills} KILLS`);
    const pts = G.talents.points('totem'), sp = G.talents.points('spoon');
    set('tot-n', 'text', `${pts} TOTEM${pts === 1 ? '' : 'S'}`);
    set('spn', 'display', G.run.spoons > 0 ? '' : 'none');
    set('spn-n', 'text', `${sp} MIRACLE${sp === 1 ? '' : 'S'}`);
    $('b-tal').classList.toggle('badge', pts > 0);
    const iv = G.invasion.on, alive = G.invasion.alive();
    const ev = G.darkness.status() || G.mech.status() || G.ritual.status() || G.gaze.status() || (!iv || iv.phase === 'leaving' ? '' : iv.phase === 'landing' ? 'ALIEN INVASION · SOMETHING IS LANDING' : `ALIEN INVASION · ${alive} INVADER${alive === 1 ? '' : 'S'} LEFT`);
    set('event', 'text', ev); set('event', 'display', ev ? '' : 'none');
    if (last.evOn !== !!ev) { last.evOn = !!ev; $('hud').classList.toggle('has-event', !!ev); }
    renderStatuses();
    const total = 2.4 * (1 - Math.min(0.6, s.dashCdr)), maxC = G.playerSys.maxCharges(), full = P.charges >= maxC, dp = !full && P.dashCd > 0 ? 1 - P.dashCd / total : 1;
    $('dashpip').style.setProperty('--p', pct(dp));
    renderMeter();
    set('dashlbl', 'text', (full ? 'Dash ready' : P.charges > 0 ? `Dash ${P.charges} · ${P.dashCd.toFixed(1)}s` : `Dash ${P.dashCd.toFixed(1)}s`) + (maxC > 1 ? ` (${P.charges}/${maxC})` : ''));
    $('b-inv').classList.toggle('badge', !!G.newItems || (sp > 0 && G.CHAR.alien.talents.some((t) => G.talents.canLearn(t))));
    const w = G.equip.weapon;
    if (last.weaponId !== w.id) { last.weaponId = w.id; $('weapon-img').src = G.world.itemIcon(w); $('weapon-name').textContent = w.name; $('weapon-name').style.color = G.ITEM_RARITY[w.rarity].color; }
    // the trinket you carry (bottom left): icon, cooldown shade and seconds left
    const TD = G.trinkets.def(), tb = $('trinket');
    tb.hidden = !TD;
    if (TD) {
      const cd = G.trinkets.cd(TD.id), ch = G.trinkets.charges(TD.id), maxC = G.trinkets.maxCharges();
      if (last.trinketId !== TD.id) { last.trinketId = TD.id; $('trinket-img').src = UI.icon(TD.icon); $('trinket-name').textContent = TD.name; }
      // the shade shows the next charge coming back; with more than one charge the count shows
      set('trinket-cd', 'height', pct(ch >= maxC ? 0 : Math.min(1, cd / TD.cooldown), 1));
      set('trinket-t', 'text', ch <= 0 ? (cd < 9.95 ? cd.toFixed(1) : String(Math.ceil(cd))) : maxC > 1 ? '×' + ch : '');
      if (last.trinketReady !== ch > 0) { last.trinketReady = ch > 0; tb.classList.toggle('ready', ch > 0); }
    }
    const b = UI.boss;
    if (b && !b.dead) {
      set('bossfill', 'width', pct(Math.max(0, b.hp / b.maxHp), 1));
      set('bosslag', 'width', pct(Math.max(0, b.hp / b.maxHp), 1));
      set('bosstext', 'text', `${Math.ceil(b.hp)} / ${Math.round(b.maxHp)}`);
      // the bar turns greener while it is poisoned, redder while it bleeds
      const bf = $('bossfill'); bf.classList.toggle('psn', b.poison.length > 0); bf.classList.toggle('bld', b.bleed.length > 0);
      renderBossFx(b);
    }
  };
  // Everything on a monster, for the boss bar and the icons over monsters: statuses, poison stacks,
  // bleed, crippled, and (passive) boss abilities and Bane of Legends' execute mark.
  // Each: { icon, color, name, n (stack count), t (seconds left), forever, passive }.
  UI.monsterFx = function (e) {
    const out = [], f = G.stats.fx, D = G.DOTS, mx = (arr) => Math.max(...arr.map((p) => p.t));
    if (e.poison.length) out.push({ key: 'poison', icon: 'poison', color: '#8aef4a', name: 'Poisoned', n: e.poison.length, t: mx(e.poison), max: D.poison.duration * G.combat.poisonK() });
    if (e.bleed.length) out.push({ key: 'bleed', icon: 'blood', color: '#ff5a4a', name: 'Bleeding', n: e.bleed.length > 1 ? e.bleed.length : undefined, t: mx(e.bleed), max: Math.max(D.bleed.duration * G.combat.bleedK(), mx(e.bleed)) });
    if (e.crippled > 0) out.push({ key: 'crippled', icon: 'cripple', color: '#ff5a4a', name: 'Crippled', t: e.crippled, max: Math.max(D.bleed.duration, e.crippled) });
    if (e.holy && e.holy.length) out.push({ key: 'holy', icon: 'holycross', color: '#ffe080', name: 'Holy Fire', n: e.holy.length, t: mx(e.holy), max: D.holy.duration });
    if (e.voodoo > 0) out.push({ key: 'voodoo', icon: 'voodoo', color: '#c08aff', name: 'Cursed', t: e.voodoo, max: (G.trinkets.curse && G.trinkets.curse.dur) || 3 });
    if (e.gripT > 0) out.push({ key: 'grip', icon: 'voodoo', color: '#9a4ac8', name: 'Gripped', t: e.gripT, max: (G.trinkets.curse && G.trinkets.curse.dur) || 3 });
    if (G.trinkets.venom && e.poison.length) out.push({ key: 'venom', icon: 'skull', color: '#8aef4a', name: 'Venomous', t: G.trinkets.venom.t, max: G.trinkets.venom.dur });
    for (const id in e.st) { const S = G.STATUS[id]; out.push({ key: 'st:' + id, icon: S.icon, color: S.color, name: id === 'shock' ? `Shocked ${Math.round((e.shockFx || S.minEffect) * 100)}%` : S.name, n: id === 'shock' ? Math.round((e.shockFx || S.minEffect) * 100) + '%' : undefined, t: e.st[id], max: Math.max(e.st[id], S.duration), forever: id === 'root' && e.experiment }); }
    if (e.boss && f.baneOfLegends) out.push({ key: 'bane', icon: 'crown', color: '#ffd04a', name: `Executed below ${Math.round(f.baneOfLegends.execute * 100)}%`, passive: true });
    for (const k in e.abilities || {}) out.push({ key: 'ab:' + k, icon: k === 'tesla' ? 'bolt' : 'anchor', color: k === 'tesla' ? '#6fe8ff' : '#ffd04a', name: k === 'tesla' ? 'Tesla Towers' : 'Hold Your Ground', t: Math.max(0, e.abT[k]), passive: true });
    return out;
  };
  // What an effect on a monster is doing, for its tooltip: lines of text.
  const n0 = (v) => Math.round(v).toLocaleString('en-US');
  UI.fxDetail = function (e, key) {
    const sum = (arr) => arr.reduce((a, p) => a + p.dps, 0), D = G.DOTS;
    if (key === 'poison' && e.poison.length) {
      const t = e.poison.map((p) => p.t);
      const pr = G.combat.poisonRate();
      return [`${e.poison.length} poison stack${e.poison.length === 1 ? '' : 's'}`, `${n0(sum(e.poison) * pr)} damage per second${pr !== 1 ? ` (ticking ×${pr.toFixed(2)})` : ''}`, `Next stack wears off in ${Math.min(...t).toFixed(1)}s · all gone in ${Math.max(...t).toFixed(1)}s`];
    }
    if (key === 'bleed' && e.bleed.length) {
      const RB = G.stats.fx.ragingBull, rb = RB && G.player.buffs[RB.buff] ? RB.bleedMult : 1, ap = G.chests.bleedMult(), m = rb * ap, C = G.combat, b = C.topBleed(e);
      const fr = C.bleedRamp(b), dps = e.bleed.reduce((a, x) => a + x.dps * C.bleedRamp(x), 0), left = e.bleed.reduce((a, x) => a + x.dps * x.t, 0), n = e.bleed.length;
      return [`${n0(dps * m)} damage per second${n > 1 ? ` from ${n} bleeds (up to ${C.bleedStacks()})` : ''}${rb > 1 ? ' (Raging Bull ×' + rb + ')' : ''}${ap > 1 ? ' (Apostasy ×' + ap + ')' : ''}${b.ramp ? ` (festering ×${fr.toFixed(1)}, up to ×${b.ramp})` : ''}`, `${Math.max(...e.bleed.map((x) => x.t)).toFixed(1)}s left · about ${n0(left * m)} damage to come`];
    }
    if (key === 'holy' && e.holy && e.holy.length) {
      const t = e.holy.map((p) => p.t), n = e.holy.length, need = D.holy.explodeAt;
      return [`${n} holy fire stack${n === 1 ? '' : 's'}`, `${n0(sum(e.holy))} damage per second`, `All gone in ${Math.max(...t).toFixed(1)}s`, n >= need ? 'Explodes with holy energy when it dies!' : `${need - n} more and it explodes when it dies`];
    }
    if (key === 'crippled') return ['70% slower, leaving a trail of blood', `${e.crippled.toFixed(1)}s left`];
    if (key === 'voodoo') { const cu = G.trinkets.curse; return [`Loses ${Math.round((cu ? cu.loss : 0.5) * 100)}% of its health over ${cu ? cu.dur : 3}s, and so does every monster its tentacles grip`, `${e.voodoo.toFixed(1)}s left`]; }
    if (key === 'grip') return ['Gripped by a cursed monster\'s tentacles: takes the health it loses'];
    if (key === 'venom' && G.trinkets.venom) return [`Spreading all its poisons to monsters within ${G.trinkets.venom.r} m`, `${G.trinkets.venom.t.toFixed(1)}s left`];
    if (key === 'st:shock') return [`Takes ${Math.round((e.shockFx || G.STATUS.shock.minEffect) * 100)}% more damage from everything`, `${(e.st.shock || 0).toFixed(1)}s left · only elemental hits shock`];
    if (key.startsWith('st:')) { const id = key.slice(3), S = G.STATUS[id]; return [S.desc, e.experiment && id === 'root' ? 'Held while it bleeds and is poisoned' : `${(e.st[id] || 0).toFixed(1)}s left`]; }
    if (key === 'bane') return ['Bane of Legends: dies at once below this health'];
    if (key.startsWith('ab:')) return [`Next use in ${Math.max(0, e.abT[key.slice(3)] || 0).toFixed(1)}s`];
    return [];
  };
  function renderBossFx(b) {
    const list = UI.monsterFx(b), box = $('bossfx'), key = list.map((x) => x.key).join();
    if (key !== last.bossFxKey) {
      last.bossFxKey = key;
      box.innerHTML = list.map((x) => `<div class="st ${x.passive ? 'passive' : 'bad'}" style="--sc:${x.color}" data-tip="mfx" data-id="${x.key}"><img src="${UI.icon(x.icon)}" alt="${esc(x.name)}"><i></i><b></b></div>`).join('');
    }
    list.forEach((x, i) => {
      const el = box.children[i];
      el.lastChild.textContent = x.n ? '×' + x.n : x.forever ? '∞' : x.t != null ? (x.t < 9.95 ? x.t.toFixed(1) : String(Math.ceil(x.t))) : '';
      el.children[1].style.height = x.t != null && x.max ? (100 - U.clamp(x.t / x.max, 0, 1) * 100).toFixed(1) + '%' : '0%';
    });
  }
  // Every chip from talents and trinkets.
  UI.chips = () => G.tfx.chips().concat(G.rules.chips(), G.trinkets.chips(), G.combat.implicitChips());
  // The buff bar in the top right: statuses (red frame), buffs (green frame), Trophy Hunter's shield,
  // then every learned effect talent (passives and procs: lit when active, shaded while recharging).
  const fmtT = (t) => (t < 9.95 ? t.toFixed(1) : String(Math.ceil(t)));
  function renderStatuses() {
    const P = G.player, list = [], box = $('statuses');
    for (const id in P.status) { const c = P.status[id], D = G.STATUS[id]; list.push({ tip: 'status', id, cls: 'bad', icon: D.icon, color: D.color, text: fmtT(c.t), shade: 1 - c.t / c.max }); }
    for (const id in P.dots) { const c = P.dots[id], D = G.PDOTS[id]; list.push({ tip: 'pdot', id, cls: 'bad', icon: D.icon, color: D.color, text: fmtT(c.t), shade: 1 - c.t / c.max }); }
    for (const id in P.buffs) { const c = P.buffs[id], D = G.BUFFS[id], n = c.stacks ? c.stacks.length : 1; list.push({ tip: 'buff', id, cls: 'good', icon: D.icon, color: D.color, text: n > 1 ? '×' + n : fmtT(c.t), shade: 1 - c.t / c.max }); }
    const sh = G.tfx.shield;
    if (sh) list.push({ tip: 'shield', id: 'shield', cls: 'shield', icon: 'shield', color: '#bfe8ff', text: String(Math.ceil(sh.hp)), shade: 1 - sh.t / sh.dur });
    for (const c of UI.chips()) list.push({ tip: 'proc', id: c.id, cls: 'proc' + (c.active ? ' on' : ''), icon: c.icon, color: c.color, text: c.text, shade: c.fill });
    const key = list.map((x) => x.tip + x.id + x.cls).join();
    if (key !== last.statusKey) {
      last.statusKey = key;
      box.innerHTML = list.map((x) => `<div class="st ${x.cls}" data-tip="${x.tip}" data-id="${x.id}" style="--sc:${x.color}"><img src="${UI.icon(x.icon)}" alt=""><i></i><b></b></div>`).join('');
      box.hidden = !list.length;
    }
    list.forEach((x, i) => {
      const el = box.children[i];
      el.lastChild.textContent = x.text;
      el.children[1].style.height = (U.clamp(x.shade, 0, 1) * 100).toFixed(1) + '%';
    });
  }
  UI.bossBar = function (e) {
    UI.boss = e;
    $('bossbar').hidden = !e;
    if (e) {
      $('bossname').textContent = e.name;
      $('bossname').style.color = e.rare ? G.RARITY[1].color : '';
      const mods = e.mods || [];
      $('bossmods').hidden = !mods.length;
      $('bossmods').innerHTML = mods.map((m) => `<span style="color:${m.color}">${esc(m.name)}</span>`).join(' · ');
      delete last.bossfillwidth; delete last.bosslagwidth;
    }
  };

  // ---------- toasts & banners ----------
  UI.toast = function (text, color) {
    const box = $('toasts'), el = document.createElement('div');
    el.className = 'toast'; el.textContent = text;
    if (color) el.style.setProperty('--c', color);
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, 3400);
  };
  UI.banner = function (title, sub, color) {
    $('banner-t').textContent = title; $('banner-s').textContent = sub || '';
    $('banner-t').style.color = color || '';
    $('banner').classList.add('on');
    clearTimeout(UI._bt);
    UI._bt = setTimeout(() => $('banner').classList.remove('on'), 3400);
  };

  // ---------- level up ----------
  // "Now → after" line on a blessing card, worked out by applying the blessing to a copy of the stats.
  UI.delta = function (u, v) {
    const s = G.stats, b = (x) => `<b>${x}</b>`, nx = Object.assign({}, s);
    u.apply(nx, v);
    switch (u.stat) {
      case 'blockRating': return `Block ${pct(s.blockChance, 1)} → ${b(pct(Math.min(s.blockCap, G.blockChance(nx.blockRating)), 1))}`;
      case 'critChance': return `Crit ${pct(s.crit, 1)} → ${b(pct(s.baseCrit * (1 + nx.critChance), 1))}`;
      case 'explodePower': return `Explode ${pct(Math.min(1, s.explodeChance))} → ${b(pct(Math.min(1, nx.explodeChance)))} at ${b(Math.round(nx.explodePower * 100) + '%')}`;
      case 'projectiles': return `Projectiles ${s.projCount} → ${b(s.projCount + v * s.weapon.per)}`;
      case 'atkSpeed': return `Attacks/s ${(1 / s.interval).toFixed(2)} → ${b((1 / Math.max(G.progress.MIN_INTERVAL, 1 / (G.equip.weapon.aps * (1 + nx.atkSpeed)))).toFixed(2))}`;
      case 'moveMult': return `Speed ${s.speed.toFixed(1)} → ${b((s.moveSpeed * (1 + nx.moveMult)).toFixed(1))}`;
    }
    const L = G.STATS[u.stat];
    if (!L) return '';
    const f = (x) => (L.pct ? pct(x) : Math.round(x * 10) / 10);
    return `${L.label} ${f(s[u.stat])} → ${b(f(nx[u.stat]))}`;
  };
  UI.showOffer = function (offer) {
    UI.offer = offer;
    UI.choices = G.progress.rollChoices(offer.luck, offer.min);
    $('lvl-title').textContent = offer.title;
    $('lvl-sub').textContent = offer.sub;
    UI.renderCards();
    UI.show('scr-level');
  };
  UI.renderCards = function () {
    const box = $('cards');
    box.innerHTML = '';
    UI.choices.forEach((c, i) => {
      const u = G.UPG[c.id], R = G.RARITY[c.rarity], v = u.vals[c.rarity];
      const owned = G.picks[c.id] ? G.picks[c.id].reduce((a, b) => a + b, 0) : 0;
      const btn = document.createElement('button');
      btn.className = 'card'; btn.dataset.r = c.rarity; btn.style.setProperty('--rc', R.color);
      btn.innerHTML = `<span class="rar">${R.name.toUpperCase()}</span><div class="head"><img src="${UI.icon(u.icon)}" alt=""><h3>${esc(u.name)}</h3></div>`
        + `<p class="desc">${esc(u.text(v))}</p><p class="delta">${UI.delta(u, v)}</p><div class="foot"><span>${owned ? 'Owned ×' + owned : 'New blessing'}</span><span class="kbd">${i + 1}</span></div>`;
      btn.addEventListener('click', () => UI.pick(i));
      box.appendChild(btn);
    });
    const rb = $('b-reroll');
    rb.textContent = `REROLL (${G.rerolls})`; rb.disabled = G.rerolls <= 0;
    if (G.choiceLock) clearTimeout(G.choiceLock);
    UI.locked = true; G.choiceLock = setTimeout(() => { UI.locked = false; }, 220);
  };
  UI.pick = function (i) {
    if (UI.locked || G.state !== 'levelup') return;
    const c = UI.choices[i];
    if (!c) return;
    G.progress.applyUpgrade(c.id, c.rarity);
    A.play(c.rarity >= 3 ? 'drop' : 'click', c.rarity);
    G.offers.shift();
    if (G.offers.length) UI.showOffer(G.offers[0]); else G.resume();
  };
  UI.reroll = function () {
    if (G.rerolls <= 0 || G.state !== 'levelup') return;
    G.rerolls--; A.play('reroll');
    UI.choices = G.progress.rollChoices(UI.offer.luck, UI.offer.min);
    UI.renderCards();
  };

  // ---------- inventory & character ----------
  const STAT_ROWS = [
    ['Hit damage', (s) => `${Math.round(s.dmg * s.dmgRoll[0])}–${Math.round(s.dmg * s.dmgRoll[1])}`], ['Attack speed', (s) => (1 / s.interval).toFixed(2) + '/s'], ['Projectiles', (s) => s.projCount],
    ['Flat elemental', (s) => (s.flatElem ? '+' + Math.round(s.flatElem * (1 + s.dmgMult)) : '—')], ['Elemental damage', (s) => (s.elemDmg ? '+' + pct(s.elemDmg) : '—')],
    ['Bleed damage', (s) => (s.bleedDmg ? '+' + pct(s.bleedDmg) : '—')],
    ['Crit chance', (s) => `${pct(Math.min(1, s.crit), 1)} (${pct(s.baseCrit, 1)} base +${pct(s.critChance)})`], ['Crit multiplier', (s) => '×' + s.critMult.toFixed(2)],
    ['Doublecrit chance', (s) => (s.fx.experiencedPrecision ? pct(U.clamp(s.crit - 1, 0, 1), 1) : '—')], ['Damage bonus', (s) => '+' + pct(s.dmgMult)],
    ['Attack area', (s) => '+' + pct(s.area)], ['Poison chance', (s) => (s.noPoison ? 'Never' : s.weaponPoison ? 'Weapon: always' : pct(s.fx.multiPoison ? s.poisonChance : Math.min(1, s.poisonChance)))],
    ['Poison damage', (s) => '+' + pct(s.poisonDmg)], ['Bleed chance', (s) => pct(Math.min(1, s.bleedChance))], ['DoT damage', (s) => '+' + pct(s.dotDmg)],
    ['Poison duration', (s) => `${(G.DOTS.poison.duration * G.combat.poisonK()).toFixed(1)}s${s.poisonDuration ? ` (${G.fmtVal('poisonDuration', s.poisonDuration)})` : ''}`],
    ['Poison tick rate', (s) => (s.poisonTickRate ? `×${G.combat.poisonRate().toFixed(2)}` : '—')],
    ['Bleed duration', (s) => `${(G.DOTS.bleed.duration * G.combat.bleedK()).toFixed(1)}s${s.bleedDuration ? ` (${G.fmtVal('bleedDuration', s.bleedDuration)})` : ''}`],
    ['Bleed stacks', () => String(G.combat.bleedStacks())],
    ['Ricochet', (s) => (s.ricochetChance > 0 ? `${pct(Math.min(1, s.ricochetChance))} · ${s.chains} bounce${s.chains > 1 ? 's' : ''}` : '—')],
    ['Explode on kill', (s) => (s.explodeChance > 0 ? `${pct(Math.min(1, s.explodeChance))} · ${s.explodePower * 100}%` : '—')],
    ['Max health', (s) => Math.round(s.maxHp)], ['Regen / 5s', (s) => (s.regen ? '+' + Math.round(s.regen * 10) / 10 : '—')],
    ['Block chance', (s) => `${pct(s.blockChance, 1)} (${Math.round(s.blockRating)})`], ['Heal on block', (s) => (s.blockHeal ? pct(s.blockHeal, 1) : '—')],
    // armor is worth less as danger rises: show the armor that would halve damage right now next to it
    ['Armor', (s) => { const a = G.progress.armor(); return a > 0 ? `${Math.round(a)} · ${pct(G.progress.reduction(a), 1)} less damage · ${Math.round(G.progress.armorThreshold())} halves it now` : '—'; }],
    ['Increased armor', (s) => (s.armorInc ? '+' + pct(s.armorInc) : '—')], ['Increased health', (s) => (s.maxHpInc ? '+' + pct(s.maxHpInc) : '—')], ['Health per kill', (s) => (s.lifeOnKill ? '+' + s.lifeOnKill.toFixed(1) : '—')],
    ['Move speed', (s) => s.speed.toFixed(1)], ['Pickup radius', (s) => s.pickupR.toFixed(1)], ['Luck', (s) => Math.round(s.luck)],
    ['XP gain', (s) => '+' + pct(s.xpGain)], ['Dash cooldown', (s) => (2.4 * (1 - Math.min(0.6, s.dashCdr))).toFixed(1) + 's'],
    ['Weapon damage', (s) => (s.weaponDmgInc ? '+' + pct(s.weaponDmgInc) : '—')], ['Class damage', (s) => { const v = { melee: s.meleeDmg, firearm: s.firearmDmg, magic: s.magicDmg }[s.weapon.class] || 0; return v ? `+${pct(v)} ${s.weapon.class}` : '—'; }],
    ['Embers gained', (s) => (s.essenceGain ? '+' + pct(s.essenceGain) : '—')], ['Reroll discount', (s) => (s.rerollDiscount ? pct(Math.min(0.9, s.rerollDiscount)) : '—')],
    ['Dash charges', (s) => 1 + Math.round(s.dashCharges)], ['Trinket recovery', (s) => (s.trinketCdr ? '+' + pct(s.trinketCdr) + ' faster' : '—')], ['Healing taken', (s) => (s.healTaken ? '+' + pct(s.healTaken) : '—')],
    ['Golem damage', (s) => (s.bossDmg ? '+' + pct(s.bossDmg) : '—')], ['Dash strike', (s) => (s.dashStrike ? pct(s.dashStrike) + ' of hit' : '—')],
    ['Spare lives', (s) => (s.extraLives ? `${Math.max(0, s.extraLives - G.run.livesUsed)} / ${s.extraLives}` : '—')], ['Blessing choices', (s) => Math.round(s.choices)],
    ['Slow chance', (s) => (s.slowChance ? pct(Math.min(1, s.slowChance)) : '—')], ['Shock chance', (s) => (s.shockChance ? pct(Math.min(1, s.shockChance)) : '—')],
    ['Stun chance', (s) => (s.stunChance ? pct(Math.min(1, s.stunChance)) : '—')], ['Root chance', (s) => (s.rootChance ? pct(Math.min(1, s.rootChance)) : '—')],
    ['Status resistance', (s) => (s.statusResist ? pct(Math.min(0.8, s.statusResist)) : '—')], ['Damage to stunned', (s) => (s.stunnedDmg ? '+' + pct(s.stunnedDmg) : '—')],
    ['Elemental vs shocked', (s) => (s.shockedElem ? '+' + pct(s.shockedElem) : '—')], ['Elemental vs slowed', (s) => (s.slowedElem ? '+' + pct(s.slowedElem) : '—')],
    ['Elemental vs rooted', (s) => (s.rootedElem ? '+' + pct(s.rootedElem) : '—')], ['Acid burst chance', (s) => (s.acidChance ? pct(Math.min(1, s.acidChance)) : '—')],
    ['Shock slow', (s) => (s.shockSlow ? pct(Math.min(0.8, s.shockSlow)) : '—')], ['Armor per poisoned', (s) => (s.armorPerPoisoned ? `+${pct(s.armorPerPoisoned, 1)} each · ${Math.min(50, G.combat.poisonedN || 0)} now` : '—')],
    ['Damage per attack', (s) => { const v = s.weapon.class === 'firearm' ? s.gunDmgPerAttack : s.weapon.class === 'melee' ? s.meleeDmgPerAttack : 0; return v ? `+${pct(v, 1)} each · ${G.combat.recentAttacks()} now` : '—'; }],
  ];
  // The stats tab: every row of STAT_ROWS, by section, with an icon each (rows nobody listed go to Other).
  const STAT_FN = Object.fromEntries(STAT_ROWS);
  const STAT_SECTIONS = [
    ['Offense', 'sword', [['Hit damage', 'sword'], ['Attack speed', 'blades'], ['Projectiles', 'feather'], ['Damage bonus', 'fang'], ['Weapon damage', 'hammer'], ['Class damage', 'sword'],
      ['Damage per attack', 'blades'], ['Attack area', 'area'], ['Crit chance', 'crosshair'], ['Crit multiplier', 'burst'], ['Doublecrit chance', 'stars'], ['Ricochet', 'chain'],
      ['Explode on kill', 'bomb'], ['Golem damage', 'crown'], ['Damage to stunned', 'skull'], ['Dash strike', 'paw']]],
    ['Elemental and control', 'bolt', [['Flat elemental', 'bolt'], ['Elemental damage', 'bolt'], ['Elemental vs shocked', 'zigzag'], ['Elemental vs slowed', 'snail'], ['Elemental vs rooted', 'root'],
      ['Shock chance', 'zigzag'], ['Slow chance', 'snail'], ['Stun chance', 'moon'], ['Root chance', 'root'], ['Shock slow', 'snail'], ['Acid burst chance', 'flask']]],
    ['Damage over time', 'poison', [['Poison chance', 'poison'], ['Poison damage', 'venomvial'], ['Poison duration', 'hourglass'], ['Poison tick rate', 'poison'], ['Bleed chance', 'blood'], ['Bleed damage', 'fang'],
      ['Bleed duration', 'hourglass'], ['Bleed stacks', 'blood'], ['DoT damage', 'hourglass'], ['Armor per poisoned', 'armor']]],
    ['Defense', 'shield', [['Max health', 'heart'], ['Increased health', 'heart'], ['Regen / 5s', 'milk'], ['Healing taken', 'milk'], ['Health per kill', 'bloodlust'], ['Block chance', 'shield'],
      ['Heal on block', 'shieldheal'], ['Armor', 'armor'], ['Increased armor', 'armor'], ['Status resistance', 'anchor'], ['Spare lives', 'halo']]],
    ['Utility', 'boot', [['Move speed', 'boot'], ['Dash cooldown', 'feather'], ['Dash charges', 'boot'], ['Pickup radius', 'magnet'], ['Luck', 'clover'], ['XP gain', 'star'], ['Embers gained', 'essence'],
      ['Reroll discount', 'dice'], ['Blessing choices', 'cards'], ['Trinket recovery', 'pocketwatch']]],
  ];
  const listed = new Set(STAT_SECTIONS.flatMap((x) => x[2].map((r) => r[0])));
  const others = STAT_ROWS.filter(([k]) => !listed.has(k)).map(([k]) => [k, 'paw']);
  if (others.length) STAT_SECTIONS.push(['Other', 'paw', others]);
  UI.STAT_SECTIONS = STAT_SECTIONS;
  const itemIcon = (it) => G.world.itemIcon(it);
  function slotBtn(it, label, sel, onSel, onDbl, where, key) {
    const b = document.createElement('button');
    b.className = 'slot' + (sel ? ' sel' : '');
    if (it) {
      b.style.setProperty('--rc', G.ITEM_RARITY[it.rarity].color); b.innerHTML = `<img src="${itemIcon(it)}" alt="">`;
      // the item level, and a green arrow on bag items that beat what you wear
      b.insertAdjacentHTML('beforeend', `<span class="sst">${it.ilvl || 1}</span>`);
      if (where === 'bag' && G.isUpgrade(it)) b.insertAdjacentHTML('beforeend', '<span class="upa" title="Better than what you wear">▲</span>');
      b.dataset.tip = 'slot'; b.dataset.where = where; b.dataset.key = key; b.setAttribute('aria-label', it.name);
    }
    if (label) b.insertAdjacentHTML('beforeend', `<span class="sl">${label}</span>`);
    b.addEventListener('click', onSel);
    if (onDbl) b.addEventListener('dblclick', onDbl);
    return b;
  }
  // An item at a glance: name, what it is and its item level, one line with its damage per second
  // (weapons) and power, each with an arrow against what you wear in that slot, then its lines.
  const delta = (a, b) => (b == null || a === b ? '' : `<span class="${a > b ? 'up' : 'down'}">${a > b ? '▲' : '▼'}${Math.abs(a - b)}</span>`);
  function itemBlock(it) {
    const R = G.ITEM_RARITY[it.rarity], P = G.itemPower(it), cur = G.equip[it.slot], cp = cur && cur !== it ? G.itemPower(cur) : null, lvl = it.ilvl || 1;
    const lines = G.itemLines(it).map((l) => `<li class="${l.cls || ''}">${esc(l.t)}</li>`).join('');
    const kind = `${R.name}${it.tag ? ' ' + G.TAG_NAMES[it.tag] : ''}${it.slot === 'weapon' ? ' ' + G.WEAPONS[it.wtype].class : ''} ${G.SLOT_NAMES[it.slot].toLowerCase()}`;
    const upg = cp && G.isUpgrade(it) ? ' <span class="upg">▲ UPGRADE</span>' : '';
    const ups = it.upgrades ? ` <small>+${it.upgrades} at the workbench</small>` : '';
    const score = P.dps != null ? `<div class="score"><b>≈${P.dps}</b> dps ${delta(P.dps, cp && cp.dps)}</div>` : '';
    const tags = it.slot === 'weapon' ? G.WEAPONS[it.wtype].tags : G.tagsFor(it.mods, null);
    return `<div class="ilvl">ITEM LEVEL <b>${lvl}</b>${ups}</div><h4 style="color:${R.color}">${esc(it.name)}</h4><div class="meta">${kind}${upg}</div>${UI.tagChips(tags)}${score}<ul>${lines}</ul>`;
  }
  // Miracles (the 'alien' tab): three columns of big talents bought with Miracles, in any order.
  // Learned ones glow gold.
  UI.invTab = 'ledger';
  function renderAlien() {
    const TL = G.talents, A2 = G.CHAR.alien, pts = TL.points('spoon'), left = TL.dayLeft('spoon'), CU = G.CURRENCIES.spoon;
    $('alien-pts').innerHTML = `<img src="${UI.icon(CU.icon)}" alt="">${pts} ${(pts === 1 ? CU.name : CU.plural).toUpperCase()}<span style="color:var(--dim);font-size:9px">${left ? ' · ONE MORE AT TONIGHT\'S BONFIRE' : ' · TONIGHT\'S MIRACLE IS FOUND'}</span>`;
    const cols = $('acols');
    cols.innerHTML = '';
    for (const g of A2.groups) {
      const col = document.createElement('div');
      col.className = 'acol'; col.style.setProperty('--gc', g.color);
      col.innerHTML = `<h3>${esc(g.name.toUpperCase())}</h3>`;
      for (const t of A2.talents.filter((x) => x.group === g.id)) {
        const on = TL.rank(t.id) > 0, reqs = TL.requirements(t), can = TL.canLearn(t);
        const card = document.createElement('div');
        card.className = 'atal' + (on ? ' on' : ''); card.style.setProperty('--gc', g.color);
        card.innerHTML = `<div class="head"><img src="${UI.icon(t.icon)}" alt=""><h4>${esc(t.name)}</h4></div>`
          + (t.text ? `<p>${esc(t.text)}</p>` : '') + (t.downside ? `<p class="down">${esc(t.downside)}</p>` : '')
          + (reqs.length ? `<p class="req${reqs.every((q) => q.met) ? ' met' : ''}">Requires ${reqs.map((q) => esc(q.text)).join(', ')}</p>` : '');
        const b = document.createElement('button');
        b.className = 'btn' + (can ? ' primary' : '');
        b.textContent = on ? 'LEARNED' : can ? `LEARN · ${t.cost} MIRACLE${t.cost > 1 ? 'S' : ''}` : reqs.some((q) => !q.met) ? 'LOCKED' : 'NEED A MIRACLE';
        b.disabled = !can;
        b.addEventListener('click', () => { if (TL.learn(t.id)) { A.play('totem'); UI.toast(`${t.name} learned`, CU.color); UI.renderInv(); } });
        card.appendChild(b); col.appendChild(card);
      }
      cols.appendChild(col);
    }
  }
  // ---------- the character panel ----------
  // Four tabs in one window: the ledger (the cat in its gear, the main numbers, the saddlebag), stats
  // (every stat by section, and the blessings), the talent tree and the Miracles (tab id 'alien').
  const PANEL_TABS = ['ledger', 'stats', 'talents', 'alien'];
  const TAB_TITLES = { ledger: 'Farmhand Ledger', stats: 'Character Sheet', talents: 'Talent Tree', alien: 'Miracles' };
  UI.invTab = 'ledger';
  // center: scroll the talent tree to the start (when the panel opens on it)
  UI.setTab = function (tab, center) {
    if (!PANEL_TABS.includes(tab)) return;
    const was = UI.invTab;
    UI.invTab = tab;
    if (tab === 'ledger') G.newItems = false;
    const fromTitle = G.panelFrom === 'title' && G.state === 'inventory';
    for (const t of PANEL_TABS) {
      const b = $('t-' + t), on = t === tab;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
      b.hidden = fromTitle && t !== 'talents';
      $(t === 'alien' ? 'alien-view' : 'v-' + t).hidden = !on;
    }
    $('inv-title').textContent = TAB_TITLES[tab];
    if (tab === 'talents') UI.renderTalents(center || was !== 'talents');
    else UI.renderInv();
  };
  // Draws whichever tab is open (the name other code calls after changing gear or talents).
  UI.renderInv = function () {
    const sp = G.talents.points('spoon');
    $('t-alien').innerHTML = `<img src="${UI.icon(G.CURRENCIES.spoon.icon)}" alt="">MIRACLES${sp > 0 ? ` (${sp})` : ''} <span class="kbd">Y</span>`;
    const tab = UI.invTab;
    if (tab === 'alien') renderAlien();
    else if (tab === 'stats') renderStats();
    else if (tab === 'talents') UI.renderTalents();
    else renderLedger();
    tip.key = null;
  };
  // How long ago, in words.
  const ago = (sec) => (sec < 5 ? 'just now' : sec < 60 ? `${Math.floor(sec)}s ago` : sec < 3600 ? `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s ago` : `${Math.floor(sec / 3600)}h ${Math.floor(sec / 60) % 60}m ago`);
  // The ledger's tiles: the numbers you check most, each with its icon.
  function coreTiles() {
    const s = G.stats, P = G.player, PR = G.progress, C = G.combat, row = C.meterRow('player'), armor = PR.armor();
    const need = G.xpNeeded(G.level);
    const tiles = [
      ['heart', 'HEALTH', `${Math.ceil(P.hp)} / ${Math.round(s.maxHp)}`, s.regen ? `+${Math.round(s.regen * 10) / 10} every 5s` : `${pct(Math.max(0, P.hp / s.maxHp))} left`],
      ['armor', 'ARMOR', Math.round(armor), `${pct(PR.reduction(armor), 1)} less damage taken`],
      ['shield', 'BLOCK', pct(s.blockChance, 1), `${Math.round(s.blockRating)} block rating`],
      ['trophy', 'HIGHEST DPS', row.peak >= 1 ? big(row.peak) : '—', row.peak >= 1 ? `${ago(C.meter.clock - (row.peakClock || 0))}` : 'nothing hit yet'],
      ['sword', 'HIT DAMAGE', `${Math.round(s.dmg * s.dmgRoll[0])}–${Math.round(s.dmg * s.dmgRoll[1])}`, `${(1 / s.interval).toFixed(2)} attacks a second`],
      ['crosshair', 'CRIT CHANCE', pct(Math.min(1, s.crit), 1), `×${s.critMult.toFixed(2)} damage`],
      ['boot', 'MOVE SPEED', s.speed.toFixed(1), `dash every ${(2.4 * (1 - Math.min(0.6, s.dashCdr))).toFixed(1)}s`],
      ['star', 'LEVEL', G.level, `${Math.floor(G.xp)} / ${need} experience`],
    ];
    return tiles.map(([ic, k, v, sub]) => `<div><img src="${UI.icon(ic)}" alt=""><i>${k}</i><b>${v}</b><span>${esc(sub)}</span></div>`).join('');
  }
  function renderLedger() {
    const L = $('doll-l'), R = $('doll-r'), bag = $('bag'), sel = UI.sel;
    L.innerHTML = ''; R.innerHTML = ''; bag.innerHTML = '';
    G.SLOTS.forEach((slot, n) => {
      const it = G.equip[slot];
      (n < 2 ? L : R).appendChild(slotBtn(it, G.SLOT_NAMES[slot], sel && sel.where === 'equip' && sel.key === slot,
        () => { UI.sel = it ? { where: 'equip', key: slot } : null; UI.renderInv(); },
        () => { if (G.progress.unequip(slot)) { UI.sel = null; A.play('pickup'); UI.renderInv(); } }, 'equip', slot));
    });
    $('doll-name').textContent = `${(G.CHAR.heroName || G.CHAR.name).toUpperCase()} · LEVEL ${G.level}`;
    $('core').innerHTML = coreTiles();
    G.bag.forEach((it, i) => bag.appendChild(slotBtn(it, '', sel && sel.where === 'bag' && sel.key === i,
      () => { UI.sel = it ? { where: 'bag', key: i } : null; UI.renderInv(); },
      () => { if (it) { G.progress.equipFromBag(i); UI.sel = { where: 'equip', key: it.slot }; A.play('pickup'); UI.renderInv(); } }, 'bag', i)));
    const used = G.bag.filter(Boolean).length;
    $('bag-label').textContent = `SADDLEBAG ${used}/${G.bag.length}`;
    const det = $('detail');
    const it = sel ? (sel.where === 'bag' ? G.bag[sel.key] : G.equip[sel.key]) : null;
    if (!it) {
      det.innerHTML = '<p class="empty-note">Hover gear to inspect it. Click to pick it, double-click to equip or take it off. Press C over gear you don\'t need to scrap it for experience.</p>';
    } else {
      let html = itemBlock(it);
      if (sel.where === 'bag') {
        const cur = G.equip[it.slot];
        html += cur ? `<div class="cmp">Replaces: <span style="color:${G.ITEM_RARITY[cur.rarity].color}">${esc(cur.name)}</span> · ${G.itemLines(cur).filter((l) => !l.cls || l.cls === 'base').map((l) => esc(l.t)).join(' · ')}</div>` : '<div class="cmp">That slot is empty.</div>';
      }
      html += '<div class="acts">';
      if (sel.where === 'bag') html += '<button class="btn primary" id="d-equip">EQUIP</button>';
      else if (it.slot !== 'weapon') html += '<button class="btn" id="d-unequip">TAKE OFF</button>';
      if (!(sel.where === 'equip' && it.slot === 'weapon')) html += `<button class="btn" id="d-scrap">SCRAP +${G.progress.scrapValue(it)} XP</button>`;
      html += '</div>';
      det.innerHTML = html;
      const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', () => { A.play('click'); fn(); UI.renderInv(); }); };
      on('d-equip', () => { G.progress.equipFromBag(sel.key); UI.sel = { where: 'equip', key: it.slot }; });
      on('d-unequip', () => { if (G.progress.unequip(sel.key)) UI.sel = null; else G.ui.toast('Saddlebag full', '#ff6a4a'); });
      on('d-scrap', () => { G.progress.scrap(sel.where, sel.key); UI.sel = null; });
    }
  }
  function renderStats() {
    const s = G.stats;
    $('stats').innerHTML = STAT_SECTIONS.map(([name, icon, rows]) => `<h5><img src="${UI.icon(icon)}" alt="">${esc(name.toUpperCase())}</h5>`
      + rows.map(([k, ic]) => { const v = String(STAT_FN[k](s)); return `<div class="${v === '—' ? 'none' : ''}"><img src="${UI.icon(ic)}" alt=""><span>${k}</span><b>${esc(v)}</b></div>`; }).join('')).join('');
    const bl = [];
    let total = 0;
    for (const u of G.UPGRADES) {
      const c = G.picks[u.id];
      if (!c) continue;
      const n = c.reduce((a, b) => a + b, 0);
      total += n;
      const sum = {};
      c.forEach((k, r) => { for (let i = 0; i < k; i++) u.apply(sum, u.vals[r]); });
      const txt = Object.keys(sum).map((k) => {
        const f = G.STATS[k];
        return f.plural ? G.fmtMod(k, sum[k]) : (f.max ? 'up to ' : '') + G.fmtVal(k, sum[k]);
      }).join(' · ');
      const pips = c.map((k, r) => Array.from({ length: k }, () => `<i style="background:${G.RARITY[r].color}"></i>`).join('')).join('');
      bl.push(`<div class="buff"><img src="${UI.icon(u.icon)}" alt=""><div>${esc(u.name)}<span class="pips">${pips}</span><small>${txt}</small></div></div>`);
    }
    $('buffs').innerHTML = bl.length ? bl.join('') : '<p class="empty-note">No blessings yet. Level up to earn them.</p>';
    $('buff-label').textContent = `BLESSINGS ${total}`;
  }
  // How many talent points this level (day) can still give, per currency (talent tab, under the tree).
  function renderLevelPoints() {
    const TL = G.talents;
    $('lvl-pts-label').textContent = `TALENT POINTS ON THIS LEVEL · DAY ${G.day + 1}`;
    $('lvl-pts').innerHTML = Object.entries(G.CURRENCIES).map(([k, c]) => {
      const cap = G.TALENT_CAP[k], got = cap - TL.dayLeft(k), left = TL.dayLeft(k), src = k === 'spoon' ? 'at the bonfire' : 'from altars';
      return `<div style="color:${c.color}"><img src="${UI.icon(c.icon)}" alt="">${got}/${cap} ${esc(c.plural)}`
        + `<b>${left ? `${left} more ${src}` : 'all unlocked'} · ${TL.points(k)} unspent</b></div>`;
    }).join('');
  }

  // The ledger's paper doll: your cat in its hat and with its weapon, on a little stage of its own (a
  // second small renderer), turning slowly. Drawn by the main loop while the ledger is open.
  const PV = { r: null, scene: null, cam: null, model: null, key: '', yaw: 0.5, rest: 0, drag: null, t: 0 };
  UI.drawPreview = function (dt) {
    const cv = $('preview'), T = window.THREE;
    if (PV.r === false || !T || !cv.clientWidth) return;
    if (!PV.r) {
      try { PV.r = new T.WebGLRenderer({ canvas: cv, antialias: false, alpha: true }); } catch (e) { PV.r = false; return; }
      PV.r.setPixelRatio(1); PV.r.setClearColor(0x000000, 0);
      PV.scene = new T.Scene();
      PV.scene.add(new T.HemisphereLight(0xfff4e0, 0x3a2c22, 0.9));
      const sun = new T.DirectionalLight(0xffe8c8, 0.85); sun.position.set(2.5, 4, 3.5); PV.scene.add(sun);
      const rim = new T.DirectionalLight(0x9fc0ff, 0.35); rim.position.set(-3, 2, -3); PV.scene.add(rim);
      const shadow = new T.Mesh(new T.CircleGeometry(0.62, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; PV.scene.add(shadow);
      PV.cam = new T.PerspectiveCamera(26, 1, 0.1, 40);
    }
    // dressed again whenever the weapon or hat changes
    const hat = G.equip.hat ? G.equip.hat.model : G.CHAR.hat, key = `${G.CHAR.model}|${G.equip.weapon.wtype}|${hat}`;
    if (key !== PV.key) {
      if (PV.model) PV.scene.remove(PV.model.root);
      PV.model = G.M.hero(G.CHAR.model); G.playerSys.dress(PV.model, G.equip.weapon.wtype, hat);
      PV.scene.add(PV.model.root); PV.key = key;
    }
    // chunky pixels like the game: render at half size, scaled up
    const w = Math.max(2, Math.round(cv.clientWidth / 2)), h = Math.max(2, Math.round(cv.clientHeight / 2));
    if (cv.width !== w || cv.height !== h) { PV.r.setSize(w, h, false); PV.cam.aspect = w / h; PV.cam.updateProjectionMatrix(); }
    PV.t += dt;
    if (!PV.drag && (PV.rest -= dt) <= 0) PV.yaw += dt * 0.45;
    const m = PV.model;
    m.root.rotation.y = PV.yaw;
    m.hips.position.y = 0.62 + Math.sin(PV.t * 2.2) * 0.012;          // breathing
    m.tail.rotation.z = Math.sin(PV.t * 1.6) * 0.25;                   // the tail sways
    m.head.rotation.y = Math.sin(PV.t * 0.7) * 0.18;
    PV.cam.position.set(0, 1.25, 5.2); PV.cam.lookAt(0, 0.92, 0);
    PV.r.render(PV.scene, PV.cam);
  };
  // ---------- workbench ----------
  // Blessings for embers (reroll the stock for embers), and scrap everything on the ground.
  UI.renderBench = function () {
    const PR = G.progress, es = Math.floor(G.run.essence), loot = G.pickups.loot, sh = G.run.shop;
    $('bench-ess').innerHTML = `<img src="${UI.icon('essence')}" alt="">${es} EMBERS`;
    const xp = loot.reduce((a, l) => a + PR.scrapValue(l.item), 0), sb = $('b-bench-scrap');
    sb.textContent = loot.length ? `SCRAP ${loot.length} ITEM${loot.length === 1 ? '' : 'S'} ON THE GROUND (+${xp} XP)` : 'NOTHING ON THE GROUND TO SCRAP';
    sb.disabled = !loot.length;
    const rc = PR.rerollCost(), rb = $('b-bench-reroll');
    rb.textContent = `REROLL · ${rc} EMBERS`; rb.disabled = es < rc;
    const box = $('bench-shop');
    box.innerHTML = '';
    sh.offers.forEach((o, i) => {
      const u = G.UPG[o.id], R = G.RARITY[o.rarity], v = u.vals[o.rarity], price = PR.shopPrice(o);
      const owned = G.picks[o.id] ? G.picks[o.id].reduce((a, b) => a + b, 0) : 0;
      const card = document.createElement('div');
      card.className = 'offer' + (o.sold ? ' sold' : ''); card.dataset.r = o.rarity; card.style.setProperty('--rc', R.color);
      card.innerHTML = `<span class="rar">${R.name.toUpperCase()}${owned ? ` · OWNED ×${owned}` : ''}</span><div class="head"><img src="${UI.icon(u.icon)}" alt=""><h3>${esc(u.name)}</h3></div>`
        + `<p>${esc(u.text(v))}</p><p class="delta">${o.sold ? '' : UI.delta(u, v)}</p>`;
      const b = document.createElement('button');
      b.className = 'btn' + (o.sold ? '' : ' primary');
      b.textContent = o.sold ? 'SOLD' : `BUY · ${price} EMBERS`;
      b.disabled = o.sold || es < price;
      b.addEventListener('click', () => {
        if (!PR.buy(i)) return;
        A.play(o.rarity >= 3 ? 'drop' : 'levelup', o.rarity); UI.toast(`Bought ${u.name}`, R.color); UI.renderBench();
      });
      card.appendChild(b); box.appendChild(card);
    });
    if (!sh.offers.length) box.innerHTML = '<p class="empty-note">Nothing left to sell.</p>';
    // Upgrade: every item you wear or carry, with what +1, +2 or +3 item levels would change and cost
    const ub = $('bench-upgrade'), gear = [...G.SLOTS.map((sl) => G.equip[sl]), ...G.bag].filter(Boolean), free = G.run.freeUpgrades || 0;
    ub.innerHTML = free ? `<p class="empty-note" style="grid-column:1/-1;color:#9dff8a">Tinkerer: ${free} free upgrade${free === 1 ? '' : 's'} waiting (the first level of your next upgrade is free).</p>` : '';
    for (const it of gear) {
      const R = G.ITEM_RARITY[it.rarity], worn = G.equip[it.slot] === it, left = G.upgradesLeft(it), row = document.createElement('div');
      row.className = 'urow'; row.style.setProperty('--rc', R.color);
      row.innerHTML = `<img src="${G.world.itemIcon(it)}" alt=""><div><b style="color:${R.color}">${esc(it.name)}</b>`
        + `<small>Item level <em>${it.ilvl || 1}</em>${worn ? ' · worn' : ''} · ${left ? `${left} upgrade${left === 1 ? '' : 's'} left` : 'fully upgraded'}</small></div><ul></ul>`;
      const ul = row.querySelector('ul'), show = (n) => {
        const p = n ? G.upgradePreview(it, n) : [];
        ul.innerHTML = n ? `<li style="list-style:none;margin-left:-16px;color:var(--straw)">Item level ${it.ilvl || 1} → ${(it.ilvl || 1) + n}</li>` + p.map((l) => `<li>${esc(l.t)}</li>`).join('') : '<li style="list-style:none;margin-left:-16px;color:var(--dim)">Upgraded as far as it goes.</li>';
      };
      show(Math.min(1, left));
      const acts = document.createElement('div');
      acts.className = 'acts';
      for (let n = 1; n <= left; n++) {
        const cost = G.progress.upgradePrice(it, n), b = document.createElement('button');
        b.className = 'btn' + (n === 1 ? ' primary' : ''); b.textContent = `+${n} · ${cost ? cost : 'FREE'}`; b.disabled = es < cost;
        b.addEventListener('mouseenter', () => show(n)); b.addEventListener('focus', () => show(n));
        b.addEventListener('click', () => {
          if (!G.progress.upgradeItem(it, n)) return;
          A.play('levelup'); UI.toast(`${it.name} is now item level ${it.ilvl}`, R.color); UI.renderBench();
        });
        acts.appendChild(b);
      }
      row.addEventListener('mouseleave', () => show(Math.min(1, left)));
      row.appendChild(acts); ub.appendChild(row);
    }
    if (!gear.length) ub.innerHTML = '<p class="empty-note">No gear to upgrade.</p>';
    // trinkets: the ones you own (dungeon bosses give more) and which one you carry
    const TR = G.trinkets, R = G.run.trinket;
    const tl = $('bench-trinkets');
    tl.innerHTML = '';
    for (const id of R.owned) {
      const D = G.TRINKETS[id], on = R.id === id, cd = TR.cd(id), row = document.createElement('div');
      row.className = 'trow' + (on ? ' on' : '') + (UI.newTrinket === id ? ' new' : '');
      row.innerHTML = `<img src="${UI.icon(D.icon)}" alt=""><div><b>${esc(D.name)}</b><small>${esc(D.desc)} ${Math.round(D.cooldown)}s cooldown${cd > 0 ? ` · ${Math.ceil(cd)}s left` : ''}.</small></div>`;
      const eb = document.createElement('button');
      eb.className = 'btn' + (on ? '' : ' primary'); eb.textContent = on ? 'CARRYING' : 'EQUIP'; eb.disabled = on;
      eb.addEventListener('click', () => { if (TR.equip(id)) { A.play('pickup'); UI.renderBench(); } });
      row.appendChild(eb); tl.appendChild(row);
    }
    tip.key = null;
  };

  // ---------- talents ----------
  // One big tree on a grid inside a scrollable view (drag to pan). Lines come from requires and
  // requiresAny. Hover a node for its tooltip, click to select it, double-click to learn it.
  const CW = 68, CH = 62;
  UI.talSel = null;
  UI.renderTalents = function (center) {
    renderLevelPoints();
    const TL = G.talents, tree = G.CHAR.tree, view = $('tal-view'), cv = $('tal-canvas');
    $('tal-char').textContent = G.CHAR.name.toUpperCase();
    $('tal-pts').innerHTML = Object.entries(G.CURRENCIES).filter(([k]) => k === 'totem' || TL.owned(k) > 0 || tree.talents.some((t) => t.currency === k))
      .map(([k, c]) => { const n = TL.points(k); return `<span style="color:${c.color}"><img src="${UI.icon(c.icon)}" alt="">${n} ${c.short.toUpperCase()}${n === 1 ? '' : 'S'}</span>`; }).join('');
    $('tal-groups').innerHTML = tree.groups.filter((g) => tree.talents.some((t) => t.group === g.id && !t.start))
      .map((g) => `<span style="--bc:${g.color}"><i></i>${esc(g.name)} <b>${TL.groupPoints(g.id)}</b></span>`).join('')
      + tree.segments.filter((s) => tree.talents.some((t) => t.segment === s.id))
        .map((s) => `<span class="seg" style="--bc:${s.color}"><i></i>${esc(s.name)} <b>${tree.talents.reduce((a, t) => a + (t.segment === s.id && !t.start ? TL.rank(t.id) * t.cost : 0), 0)}</b></span>`).join('');
    $('tal-found').textContent = Object.entries(G.CURRENCIES).map(([k, c]) => { const n = TL.owned(k); return `${n} ${n === 1 ? c.name : c.plural}`; }).join(' · ') + ' found this run';
    const sl = view.scrollLeft, st = view.scrollTop;
    cv.innerHTML = '';
    if (!tree.talents.length) { cv.innerHTML = '<p class="empty-note">This character has no talents yet.</p>'; return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of tree.talents) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); }
    const cw = (x1 - x0 + 2) * CW, ch = (y1 - y0 + 2) * CH, at = (t) => [(t.x - x0 + 1) * CW, (t.y - y0 + 1) * CH];
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    // segments glow in their color (as strongly as their glow says) under their talents and the links between them
    let glow = '';
    for (const s of tree.segments) {
      let g = '';
      for (const t of tree.talents) {
        if (t.segment !== s.id) continue;
        const [bx, by] = at(t);
        for (const r of [...t.requires, ...t.requiresAny]) if (tree.byId[r.id].segment === s.id) { const [ax, ay] = at(tree.byId[r.id]); g += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" style="stroke:${s.color};stroke-width:14"/>`; }
        g += `<circle cx="${bx}" cy="${by}" r="${t.start ? 38 : t.big ? 37 : 32}" fill="${s.color}"/>`;
      }
      if (g && s.glow > 0) glow += `<g opacity="${s.glow}">${g}</g>`;
    }
    let lines = glow ? `<defs><filter id="tal-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter></defs><g filter="url(#tal-glow)">${glow}</g>` : '';
    for (const t of tree.talents) for (const r of [...t.requires, ...t.requiresAny]) {
      const p = tree.byId[r.id], [ax, ay] = at(p), [bx, by] = at(t), on = TL.rank(p.id) >= r.rank;
      lines += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="${on && TL.rank(t.id) ? 'on' : on ? 'half' : ''}" style="--bc:${tree.color(t)}"/>`;
    }
    cv.insertAdjacentHTML('beforeend', `<svg width="${cw}" height="${ch}" aria-hidden="true">${lines}</svg>`);
    // segment names, in a free spot next to their talents (.tal-seg-name: 10.5px a letter, 40px of rules)
    const segs = tree.segments.filter((s) => tree.talents.some((t) => t.segment === s.id));
    if (segs.length) {
      const spots = TL.labelSpots(tree.talents.map((t) => ({ x: t.x, y: t.y, segment: t.segment, links: [...t.requires, ...t.requiresAny].map((r) => tree.byId[r.id]) })),
        segs.map((s) => ({ id: s.id, w: (s.name.length * 10.5 + 40) / CW })), { h: 0.35, boxes: [[-0.45, -0.48, 0.5, 0.58]] });
      for (const s of segs) {
        const p = spots[s.id], d = document.createElement('div');
        d.className = 'tal-seg-name'; d.textContent = s.name; d.style.setProperty('--sc', s.color);
        d.style.left = (p.x - x0 + 1) * CW + 'px'; d.style.top = (p.y - y0 + 1) * CH + 'px';
        cv.appendChild(d);
      }
    }
    for (const t of tree.talents) {
      const r = TL.rank(t.id), [x, y] = at(t), b = document.createElement('button');
      const st = t.start ? 'start' : r >= t.maxRank ? 'max' : TL.unmet(t).length ? 'locked' : TL.canLearn(t) ? 'can' : r ? 'some' : 'open';
      b.className = `tal-node ${st}${t.big ? ' big' : ''}`; b.dataset.id = t.id; b.dataset.tip = 'talent';
      b.style.left = x + 'px'; b.style.top = y + 'px'; b.style.setProperty('--bc', tree.color(t));
      b.innerHTML = `<img src="${UI.icon(t.icon)}" alt="">` + (t.start ? '' : `<span class="rk">${r}/${t.maxRank}</span>`)
        + (t.currency !== 'totem' ? `<img class="cur" src="${UI.icon(G.CURRENCIES[t.currency].icon)}" alt="">` : '');
      b.setAttribute('aria-label', `${t.name}, rank ${r} of ${t.maxRank}`);
      // a second click on the same talent within 400 ms learns it (works for touch double-taps too)
      b.addEventListener('click', () => {
        const now = performance.now(), dbl = UI.lastTal && UI.lastTal.id === t.id && now - UI.lastTal.at < 400;
        UI.lastTal = dbl ? null : { id: t.id, at: now };
        if (dbl) UI.learnTalent(t.id); else { A.play('click'); UI.selectTalent(t.id); }
      });
      cv.appendChild(b);
    }
    if (center) {
      const s0 = tree.talents.find((t) => t.start) || tree.talents[0], [cx, cy] = at(s0);
      view.scrollLeft = cx - view.clientWidth / 2; view.scrollTop = cy - view.clientHeight / 2;
    } else { view.scrollLeft = sl; view.scrollTop = st; }
    UI.selectTalent(UI.talSel);
    const rb = $('b-tal-reset');
    rb.textContent = 'RESET TREE'; delete rb.dataset.armed; rb.disabled = TL.spent() === 0;
    tip.key = null;
  };
  UI.selectTalent = function (id) {
    UI.talSel = id;
    for (const b of document.querySelectorAll('.tal-node')) b.classList.toggle('sel', b.dataset.id === id);
    const TL = G.talents, t = G.CHAR.tree.byId[id], det = $('tal-detail');
    if (!t) {
      det.innerHTML = '<p class="empty-note">Hover a talent to read it and double-click to learn it. Totems of Power come from altars, Miracles from the bonfire at night. Talents last for this run only. Drag the tree to look around.</p>';
      return;
    }
    const r = TL.rank(t.id), cur = G.CURRENCIES[t.currency];
    const label = t.start ? 'STARTING POINT' : r >= t.maxRank ? 'MASTERED' : `LEARN · ${t.cost} ${cur.short.toUpperCase()}${t.cost > 1 ? 'S' : ''}`;
    det.innerHTML = talentTip(t).html.replace(/<div class="keys">.*<\/div>$/, '')
      + `<div class="acts"><button class="btn primary" id="t-learn"${TL.canLearn(t) ? '' : ' disabled'}>${label}</button></div>`;
    det.querySelector('h4').style.color = G.CHAR.tree.color(t);
    $('t-learn').addEventListener('click', () => UI.learnTalent(t.id));
  };
  UI.learnTalent = function (id) {
    if (!G.talents.learn(id)) return;
    A.play('levelup');
    UI.talSel = id; UI.renderTalents();
  };

  // ---------- hover tooltips ----------
  // Gear slots, the HUD weapon and talent nodes carry data-tip; loot on the ground is found by
  // PK.drawOverlay. The tooltip follows the mouse and is refreshed every frame from the main loop.
  const tip = { key: null };
  const statsOf = (it) => {
    const s = {};
    for (const k in it.mods) G.addStat(s, k, it.mods[k]);
    return s;
  };
  // A stat change with its sign: "+5% crit chance" / "-15 max health".
  const signed = (k, d) => {
    const t = G.fmtMod(k, Math.abs(d));
    if (d >= 0) return t;
    return /^[+-]/.test(t) ? (t[0] === '+' ? '-' : '+') + t.slice(1) : '-' + t;
  };
  function compareTo(it, cur) {
    const out = [];
    if (it.slot === 'weapon') {
      const d = Math.round((it.dmg - cur.dmg) * 10) / 10;
      if (d) out.push([d > 0, `${d > 0 ? '+' : '-'}${Math.abs(d)} average damage per hit`]);
      if (it.crit !== cur.crit) out.push([it.crit > cur.crit, `${it.crit > cur.crit ? '+' : '-'}${+(Math.abs(it.crit - cur.crit) * 100).toFixed(1)}% base crit chance`]);
      if (it.aps !== cur.aps) out.push([it.aps > cur.aps, `${it.aps.toFixed(2)} attacks/s instead of ${cur.aps.toFixed(2)}`]);
    }
    const sa = statsOf(it), sb = statsOf(cur);
    for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
      const d = (sa[k] || 0) - (sb[k] || 0);
      if (Math.abs(d) > 1e-9) out.push([d > 0, signed(k, d)]);
    }
    return out;
  }
  // where: 'bag', 'equip' or 'ground'.
  UI.itemHtml = (it, where) => itemTip(it, where).html;
  function itemTip(it, where) {
    const cur = G.equip[it.slot], xp = `C to scrap for +${G.progress.scrapValue(it)} XP`;
    let h = itemBlock(it);
    if (where !== 'equip') {
      if (!cur) h += `<div class="sec">Your ${esc(G.SLOT_NAMES[it.slot].toLowerCase())} slot is empty.</div>`;
      else {
        const diff = compareTo(it, cur);
        h += `<div class="sec">Compared with <span style="color:${G.ITEM_RARITY[cur.rarity].color}">${esc(cur.name)}</span>${diff.length ? ':' : ': no difference'}</div>`;
        if (diff.length) h += `<ul>${diff.map(([up, t]) => `<li class="${up ? 'up' : 'down'}">${esc(t)}</li>`).join('')}</ul>`;
      }
    }
    const keys = where === 'ground' ? `Walk over it to pick it up · ${xp}`
      : where === 'bag' ? `Double-click to equip · ${xp}`
        : it.slot === 'weapon' ? 'Equipped. Swap weapons to replace it; it can\'t be scrapped.' : `Equipped · double-click to take off · ${xp}`;
    return { color: G.ITEM_RARITY[it.rarity].color, html: h + `<div class="keys">${keys}</div>` };
  }
  function talentTip(t) {
    const TL = G.talents, tree = G.CHAR.tree, r = TL.rank(t.id), g = tree.groups.find((x) => x.id === t.group), sg = tree.segment(t), cur = G.CURRENCIES[t.currency];
    const reqs = TL.requirements(t), pts = TL.points(t.currency), cost = `${t.cost} ${t.cost > 1 ? cur.plural : cur.name}`;
    const fmt = (k) => Object.keys(t.stats).map((s) => G.fmtMod(s, t.stats[s] * k)).join(', ') || (t.text ? '' : 'No stats');
    let h = `<h4>${esc(t.name)}</h4><div class="meta">${g ? esc(g.name) + ' · ' : ''}${sg ? `<span style="color:${sg.color}">${esc(sg.name)}</span> · ` : ''}${t.big ? 'big talent · ' : ''}${t.start ? 'starting point' : `rank ${r} of ${t.maxRank} · ${cost}${t.maxRank > 1 ? ' per rank' : ''}`}</div>${UI.tagChips(G.tagsFor(t.stats, t.effect && t.effect.id, t.ruleTags))}`;
    if (t.desc) h += `<p class="flav">${esc(t.desc)}</p>`;
    h += '<ul>';
    if (t.text) h += `<li>${esc(t.text)}</li>`;
    if (t.downside) h += `<li class="down">${esc(t.downside)}</li>`;
    if (fmt(1)) h += `<li>${t.maxRank > 1 ? 'Per rank: ' : ''}${esc(fmt(1))}</li>`;
    if (r && t.maxRank > 1) h += `<li class="up">Now: ${esc(fmt(r))}</li>`;
    if (r && r < t.maxRank) h += `<li>Next rank: ${esc(fmt(r + 1))}</li>`;
    h += '</ul>';
    if (reqs.length && !t.start) h += `<div class="sec">Requires</div><ul>${reqs.map((q) => `<li class="${q.met ? 'up' : 'down'}">${esc(q.text)}</li>`).join('')}</ul>`;
    const keys = t.start ? 'Always learned'
      : r >= t.maxRank ? 'Mastered'
        : reqs.some((q) => !q.met) ? 'Locked until the requirements are met'
          : pts < t.cost ? `Not enough ${cur.plural} (${pts} left). ${t.currency === 'spoon' ? 'Pray at the bonfire at night to earn them.' : 'Claim them from altars.'}`
            : `Double-click to learn · ${pts} ${cur.short}${pts === 1 ? '' : 's'} left`;
    return { color: tree.color(t), html: h + `<div class="keys">${keys}</div>` };
  }
  const STATUS_LINE = { slow: (S) => `${Math.round(S.power * 100)}% slower movement`, shock: (S) => `+${Math.round(S.power * 100)}% damage taken`, stun: () => 'Cannot move, dash or attack', root: () => 'Cannot move or dash' };
  function statusTip(kind, id, cur) {
    const D = kind === 'buff' ? G.BUFFS[id] : G.STATUS[id];
    const n = cur.stacks ? cur.stacks.length : 1, k = kind === 'buff' ? G.playerSys.buffPower(cur) : 1;
    let h = `<h4>${esc(D.name)}${n > 1 ? ` ×${n}` : ''}</h4><div class="meta">${kind === 'buff' ? 'Buff' : 'Status effect'} · ${cur.t.toFixed(1)}s left${n > 1 ? ` · ${n} stacks, ${Math.round(k * 100)}% strength` : ''}</div>`;
    if (D.desc) h += `<p class="flav">${esc(D.desc)}</p>`;
    const lines = kind === 'buff' ? Object.keys(D.stats).map((st) => G.fmtMod(st, D.stats[st] * k)) : [STATUS_LINE[id](D)];
    if (lines.length) h += `<ul>${lines.map((l) => `<li class="${kind === 'buff' ? 'up' : 'down'}">${esc(l)}</li>`).join('')}</ul>`;
    return { color: D.color, html: h };
  }
  function mfxTip(e, key) {
    const fx = UI.monsterFx(e).find((x) => x.key === key), lines = UI.fxDetail(e, key);
    if (!fx) return { color: '#a08060', html: '' };
    const who = e.boss ? e.name || e.def.name : e.def.name;
    return { color: fx.color, html: `<h4>${esc(fx.name)}</h4><div class="meta">on ${esc(who)}</div><ul>${lines.map((l, i) => `<li class="${i ? '' : 'up'}">${esc(l)}</li>`).join('')}</ul>` };
  }
  // Tag chips (data.js G.TAGS) for tooltips.
  UI.tagChips = (tags) => (tags && tags.length ? `<div class="chips">${tags.filter((t) => G.TAGS[t]).map((t) => `<span class="chip" style="--tc:${G.TAGS[t].color}"><img src="${UI.icon(G.TAGS[t].icon)}" alt="">${esc(G.TAGS[t].name)}</span>`).join('')}</div>` : '');
  function procTip(c) {
    const [txt, ...state] = c.lines;
    let h = `<h4>${esc(c.name)}</h4><div class="meta">${c.kind || (c.id && c.id.startsWith('tr_') ? 'Trinket' : c.color === G.CURRENCIES.spoon.color ? 'Miracle' : 'Talent')}</div>${UI.tagChips(c.tags)}`;
    h += `<ul>${txt ? `<li>${esc(txt)}</li>` : ''}${state.map((l) => `<li class="up">${esc(l)}</li>`).join('')}</ul>`;
    return { color: c.color, html: h };
  }
  // ---------- damage meter (bottom left) ----------
  // One row per damage dealer: its name, damage per second now and its best this run, over a bar as long
  // as its share of the top row's DPS, split by damage type. Rows are only rebuilt when one is added.
  const meterRowsBuilt = [];
  function renderMeter() {
    const C = G.combat, rows = C.meter.rows, box = $('meter-rows');
    if (meterRowsBuilt.length !== rows.length || rows.some((r, i) => meterRowsBuilt[i] !== r)) {
      meterRowsBuilt.length = 0; meterRowsBuilt.push(...rows);
      box.innerHTML = rows.map((r) => `<div class="mrow" data-tip="meter" data-id="${esc(r.id)}"><div class="mbar">${TYPE_ORDER.map((k) => `<i class="${k}"></i>`).join('')}</div>`
        + `<span class="mname">${esc(r.name)}</span><span class="mdots"></span><span class="mnum"><b>0</b> <small>| 0</small></span></div>`).join('');
    }
    const dps = rows.map((r) => C.dps(r.id)), top = Math.max(1, ...dps);
    rows.forEach((r, i) => {
      const el = box.children[i];
      if (!el) return;
      const mix = C.dps(r.id, true), sum = TYPE_ORDER.reduce((a, k) => a + Math.max(0, mix[k]), 0) || 1, bar = el.firstChild;
      bar.style.width = pct(dps[i] / top);
      TYPE_ORDER.forEach((k, j) => { const w = Math.max(0, mix[k]) / sum; bar.children[j].style.width = w > 0 ? `calc(${pct(w)} - 2px)` : '0'; bar.children[j].style.display = w > 0 ? '' : 'none'; });
      const txt = `${big(dps[i])}|${big(r.peak)}`;
      if (el.dataset.txt !== txt) { el.dataset.txt = txt; el.lastChild.innerHTML = `<b>${big(dps[i])}</b> <small>| ${big(r.peak)}</small>`; }
    });
  }
  function meterTip(r) {
    const C = G.combat, win = C.dpsWindow(r.id), d = win.dmg / win.span, mix = C.dps(r.id, true), sum = TYPE_ORDER.reduce((a, k) => a + Math.max(0, mix[k]), 0);
    const secs = Math.round(win.span * 10) / 10;
    const n = (v) => Math.round(v).toLocaleString('en-US');
    let h = `<h4>${esc(r.name)}</h4><div class="meta">Damage meter</div><ul>`;
    h += `<li><b>${big(d)}</b> damage per second right now: the ${n(win.dmg)} damage dealt in the last ${secs} seconds, divided by ${secs}. The training dummy counts.</li>`;
    h += `<li><b>${big(r.peak)}</b> the highest damage per second this run${r.peak >= 1 ? `, reached at ${U.fmtTime(r.peakAt)}` : ''}.</li>`;
    h += `<li>The bar's length is this DPS; its colours show what it is made of:</li></ul>`;
    h += `<div class="mtypes">${TYPE_ORDER.map((k) => `<div><i style="background:${TYPE_COL[k]}"></i>${G.DMG_TYPES[k]}<b>${sum ? Math.round(Math.max(0, mix[k]) / sum * 100) : 0}% · ${big(Math.max(0, mix[k]))}/s</b></div>`).join('')}</div>`;
    h += `<ul><li class="up">${n(r.total)} damage dealt this run</li></ul>`;
    return { color: '#ffd27a', html: h };
  }
  // What is under the mouse: { it, where } for gear, { t } for a talent, or null.
  function hovered() {
    const m = G.input.mouse;
    if (!m.in) return null;
    const el = document.elementFromPoint(m.x, m.y), n = el && el.closest('[data-tip]');
    if (n) {
      if (n.dataset.tip === 'talent') { const t = G.CHAR.tree.byId[n.dataset.id]; return t ? { t } : null; }
      if (n.dataset.tip === 'meter') { const r = G.combat.meter.rows.find((x) => x.id === n.dataset.id); return r ? { meter: r } : null; }
      if (n.dataset.tip === 'mfx') { const b = UI.boss; return b && !b.dead ? { mfx: { e: b, key: n.dataset.id } } : null; }
      if (n.dataset.tip === 'proc') { const c = UI.chips().find((x) => x.id === n.dataset.id); return c ? { proc: c } : null; }
      if (n.dataset.tip === 'trinket') {
        const D = G.trinkets.def();
        if (!D) return null;
        const cd = G.trinkets.cd(D.id);
        return { proc: { name: D.name, color: '#ffe080', kind: 'Trinket · F', tags: D.tags, lines: [D.desc, `${Math.round(D.cooldown)}s cooldown${G.stats.trinketCdr ? ` (recovers ${Math.round(G.stats.trinketCdr * 100)}% faster)` : ''}`, cd > 0 ? `Recharging · ${cd.toFixed(1)}s` : 'Ready · press F'] } };
      }
      if (n.dataset.tip === 'pdot') { const c = G.player.dots[n.dataset.id], D = G.PDOTS[n.dataset.id]; return c ? { proc: { name: D.name, color: D.color, lines: [D.desc, `${Math.round(c.dps)} damage per second`, `${c.t.toFixed(1)}s left`] } } : null; }
      if (n.dataset.tip === 'shield') { const sh = G.tfx.shield; return sh ? { proc: { name: 'Trophy Shield', color: '#bfe8ff', lines: [`Absorbs ${Math.ceil(sh.hp)} more damage`, `${sh.t.toFixed(1)}s left`] } } : null; }
      if (n.dataset.tip === 'status' || n.dataset.tip === 'buff') {
        const cur = (n.dataset.tip === 'buff' ? G.player.buffs : G.player.status)[n.dataset.id];
        return cur ? { kind: n.dataset.tip, id: n.dataset.id, cur } : null;
      }
      const where = n.dataset.where, key = where === 'bag' ? +n.dataset.key : n.dataset.key, it = where === 'bag' ? G.bag[key] : G.equip[key];
      return it ? { it, where, key } : null;
    }
    // effect icons over monsters (drawn on the overlay canvas)
    if (G.state === 'playing' || G.state === 'held') {
      const d = G.fx.dpr || 1, mx = m.x * d, my = m.y * d, r = G.enemySys.fxRects.find((q) => mx >= q.x0 && mx <= q.x1 && my >= q.y0 && my <= q.y1);
      if (r && !r.e.dead) return { mfx: { e: r.e, key: r.key } };
    }
    const l = (G.state === 'playing' || G.state === 'held') && G.pickups.hover;
    return l ? { it: l.item, where: 'ground', loot: l } : null;
  }
  UI.updateTip = function () {
    const el = $('tip'), h = hovered();
    if (!h) { if (!el.hidden) { el.hidden = true; tip.key = null; } return; }
    const key = h.meter ? `meter:${h.meter.id}:${Math.round(G.combat.dps(h.meter.id))}:${Math.round(h.meter.peak)}` : h.mfx ? `mfx:${h.mfx.e.id}:${h.mfx.key}:${UI.fxDetail(h.mfx.e, h.mfx.key).join('|')}` : h.proc ? `proc:${h.proc.name}:${h.proc.lines.join()}` : h.t ? 'talent:' + h.t.id : h.kind ? `${h.kind}:${h.id}:${h.cur.t.toFixed(1)}` : `${h.where}:${h.it.id}:${(G.equip[h.it.slot] || {}).id}`;
    if (key !== tip.key) {
      const c = h.meter ? meterTip(h.meter) : h.mfx ? mfxTip(h.mfx.e, h.mfx.key) : h.proc ? procTip(h.proc) : h.t ? talentTip(h.t) : h.kind ? statusTip(h.kind, h.id, h.cur) : itemTip(h.it, h.where);
      el.style.setProperty('--rc', c.color); el.innerHTML = c.html; tip.key = key;
    }
    el.hidden = false;
    const m = G.input.mouse, w = el.offsetWidth, ht = el.offsetHeight, pad = 8;
    let x = m.x + 18, y = m.y + 18;
    if (x + w > innerWidth - pad) x = m.x - w - 14;
    if (y + ht > innerHeight - pad) y = innerHeight - ht - pad;
    el.style.transform = `translate(${Math.max(pad, x)}px, ${Math.max(pad, y)}px)`;
  };
  // C: scrap whatever gear is under the mouse, in the inventory or lying on the ground.
  // Returns true when there was gear under the mouse (scrapped, or refused), so C opens nothing else.
  UI.scrapHovered = function () {
    if (G.state !== 'playing' && G.state !== 'inventory' && G.state !== 'held') return false;
    const h = hovered();
    if (!h || !h.it) return false;
    const it = h.it;
    if (h.where === 'equip' && it.slot === 'weapon') { UI.toast('Your equipped weapon can\'t be scrapped. Equip another one first.', '#ff6a4a'); return true; }
    const xp = G.progress.scrapValue(it);
    if (h.where === 'ground') G.pickups.scrapLoot(h.loot);
    else {
      G.progress.scrap(h.where, h.key);
      if (UI.sel && UI.sel.where === h.where && UI.sel.key === h.key) UI.sel = null;
      if (G.state === 'inventory') UI.renderInv();
    }
    A.play('shatter');
    UI.toast(`Scrapped ${it.name} · +${xp} XP`, G.ITEM_RARITY[it.rarity].color);
    tip.key = null;
    return true;
  };

  // ---------- game over ----------
  // ---------- the run summary (game over) ----------
  // Headline numbers, then charts: damage per second over the run (with day markers and a hover
  // crosshair), damage by type and the most slain monsters as labelled bars, then the rest as text.
  const TYPE_COL = { physical: 'var(--s-physical)', poison: 'var(--s-poison)', elemental: 'var(--s-elemental)' };
  const TYPE_ORDER = ['physical', 'poison', 'elemental'];   // validated so neighbours stay apart for colour-blind eyes
  const big = (v) => (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : Math.round(v).toLocaleString('en-US'));
  function barRows(rows, total) {
    const max = Math.max(1, ...rows.map((r) => r.v));
    return rows.map((r) => `<div class="ob-row" data-otip="${esc(r.tip)}"><span class="ob-l">${esc(r.label)}</span><span class="ob-track"><i style="width:${(r.v / max * 100).toFixed(1)}%;background:${r.col}"></i></span>`
      + `<span class="ob-v">${big(r.v)}${total ? ` <small>${Math.round(r.v / total * 100)}%</small>` : ''}</span></div>`).join('');
  }
  // tl: timeline samples ({ t, dps, day, ... }); t0: seconds subtracted from every t (the bonfire's chart of one day)
  function dpsChart(tl, t0 = 0) {
    if (tl.length < 2) return '<p class="empty-note">Not enough of a fight to chart.</p>';
    if (t0) tl = tl.map((p) => Object.assign({}, p, { t: p.t - t0 }));
    const W = 600, H = 150, pad = 4, tmax = tl[tl.length - 1].t || 1, dmax = Math.max(1, ...tl.map((p) => p.dps));
    const X = (t) => pad + (t / tmax) * (W - pad * 2), Y = (v) => H - pad - (v / dmax) * (H - pad * 2 - 14);
    const pts = tl.map((p) => `${X(p.t).toFixed(1)},${Y(p.dps).toFixed(1)}`).join(' ');
    let grid = '';
    for (const k of [0.25, 0.5, 0.75, 1]) grid += `<line x1="${pad}" x2="${W - pad}" y1="${Y(dmax * k)}" y2="${Y(dmax * k)}" class="og"/><text x="${W - pad}" y="${Y(dmax * k) - 3}" class="oy">${big(dmax * k)}</text>`;
    let days = '';
    for (let i = 1; i < tl.length; i++) if (tl[i].day !== tl[i - 1].day) days += `<line x1="${X(tl[i].t)}" x2="${X(tl[i].t)}" y1="${pad}" y2="${H - pad}" class="od"/><text x="${X(tl[i].t) + 4}" y="${pad + 10}" class="ox">Day ${tl[i].day + 1}</text>`;
    return `<svg class="ochart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Damage per second over the run, peaking at ${big(dmax)}">`
      + `${grid}${days}<polygon points="${X(0)},${H - pad} ${pts} ${X(tmax)},${H - pad}" class="oa"/><polyline points="${pts}" class="ol"/>`
      + `<line class="oc" x1="0" x2="0" y1="${pad}" y2="${H - pad}" visibility="hidden"/><circle class="odot" r="4" visibility="hidden"/>`
      + `<rect class="ohit" x="0" y="0" width="${W}" height="${H}"/></svg>`;
  }
  UI.dpsChart = dpsChart; UI.barRows = barRows; UI.big = big; UI.wireChart = (tl, root) => wireOverChart(tl, root);
  UI.showGameOver = function (isBest) {
    const r = G.run, tl = r.tl || [], C = G.combat;
    const peak = Math.max(C.meterRow('player').peak || 0, ...tl.map((p) => p.dps), 0);
    const tiles = [['Time survived', U.fmtTime(G.time)], ['Level', G.level], ['Monsters slain', big(r.kills)], ['Damage dealt', big(r.dealt)], ['Best DPS', big(peak)], [`Reached · danger ${U.roman(G.tier)}`, `Day ${G.day + 1}`]];
    const total = TYPE_ORDER.reduce((a, k) => a + (r.byType[k] || 0), 0);
    // each type's tooltip breaks it down by source (weapon hits, bleeding, holy fire...)
    const bySrc = r.bySrc || {}, srcOf = (k) => Object.keys(bySrc).filter((s) => G.DMG_SOURCES[s] && (G.DMG_SOURCES[s].type || 'elemental') === k && bySrc[s] > 0).sort((a, b) => bySrc[b] - bySrc[a]);
    const dmgRows = TYPE_ORDER.map((k) => ({ label: G.DMG_TYPES[k], v: r.byType[k] || 0, col: TYPE_COL[k],
      tip: `${G.DMG_TYPES[k]} damage: ${Math.round(r.byType[k] || 0).toLocaleString('en-US')} (${total ? Math.round((r.byType[k] || 0) / total * 100) : 0}% of all damage)${srcOf(k).map((s) => ` · ${G.DMG_SOURCES[s].name} ${big(bySrc[s])}`).join('')}` }));
    const slain = Object.entries(r.killsBy || {}).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([id, n]) => ({ label: G.ENEMIES[id] ? G.ENEMIES[id].name : id, v: n, col: 'var(--s-one)', tip: `${G.ENEMIES[id] ? G.ENEMIES[id].name : id}: ${n.toLocaleString('en-US')} slain (${Math.round(n / Math.max(1, r.kills) * 100)}% of your kills)` }));
    const rest = [['Days survived', r.days], ['Critical hits', r.crits], ['Blocks', r.blocks], ['Bosses slain', r.bosses], ['Rare golems', r.rares], ['Invasions repelled', r.invasions],
      ['Totems claimed', r.totems], ['Miracles', r.spoons], ['Chests opened', r.chests || 0], ['Barrels broken', r.barrels || 0], ['Embers gathered', big(r.essenceTotal)], ['Dungeons cleared', r.dungeons || 0], ['Shrines visited', r.shrines || 0], ['Mokosh favours', r.mokosh ? r.mokosh.cut + r.mokosh.weave : 0], ['Eldritch eyes closed', r.gazes || 0], ['Darks survived', r.darks || 0], ['Item levels upgraded', r.upgrades || 0]];
    $('over-stats').innerHTML = `<div class="otiles">${tiles.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>`
      + `<div class="opanel"><h3>Damage per second</h3>${dpsChart(tl)}</div>`
      + `<div class="ogrid"><div class="opanel"><h3>Damage by type</h3>${total ? barRows(dmgRows, total) : '<p class="empty-note">No damage dealt.</p>'}</div>`
      + `<div class="opanel"><h3>Most slain</h3>${slain.length ? barRows(slain, 0) : '<p class="empty-note">Nothing slain.</p>'}</div></div>`
      + `<div class="orest">${rest.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    wireOverChart(tl);
    $('over-new').hidden = !isBest;
    $('over-title').textContent = r.cause === 'dark' ? 'Swallowed by the Dark' : 'The Farm Has Fallen';
    UI.show('scr-over');
    $('b-again').focus();
  };
  // Hover: a crosshair and a readout on the DPS chart, and a tooltip on every bar.
  // root: the element holding the chart and the bars (the run summary, or the bonfire's day summary)
  function wireOverChart(tl, root = $('over-stats')) {
    const tipEl = $('over-tip'), svg = root.querySelector('.ochart');
    const show = (html, x, y) => { tipEl.innerHTML = html; tipEl.hidden = false; tipEl.style.transform = `translate(${Math.min(innerWidth - tipEl.offsetWidth - 8, x + 14)}px, ${y + 14}px)`; };
    const hide = () => { tipEl.hidden = true; };
    if (svg && tl.length > 1) {
      const vb = svg.viewBox.baseVal, cross = svg.querySelector('.oc'), dot = svg.querySelector('.odot'), tmax = tl[tl.length - 1].t || 1, dmax = Math.max(1, ...tl.map((p) => p.dps));
      svg.addEventListener('pointermove', (ev) => {
        const b = svg.getBoundingClientRect(), t = ((ev.clientX - b.left) / b.width) * tmax;
        let p = tl[0];
        for (const q of tl) if (Math.abs(q.t - t) < Math.abs(p.t - t)) p = q;
        const x = 4 + (p.t / tmax) * (vb.width - 8), y = vb.height - 4 - (p.dps / dmax) * (vb.height - 22);
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
        dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('visibility', 'visible');
        show(`<b>${big(p.dps)} DPS</b><br>${U.fmtTime(p.t)} · Day ${p.day + 1}<br>Level ${p.lvl} · ${p.kills.toLocaleString('en-US')} kills`, ev.clientX, ev.clientY);
      });
      svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hide(); });
    }
    for (const row of root.querySelectorAll('[data-otip]')) {
      row.addEventListener('pointermove', (ev) => show(esc(row.dataset.otip), ev.clientX, ev.clientY));
      row.addEventListener('pointerleave', hide);
    }
  }
})();
