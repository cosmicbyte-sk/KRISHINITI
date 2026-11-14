/* KRISHINITI.farm.js — additive visual layer for "Select farm", "Farm profile" and "Land report".
   1) Living 3D farm scene behind those three pages (Canvas 2D, true perspective projection):
      ploughing tractor, five crop plots running a full growth cycle at different stages, wind-swayed crops,
      and a weather loop: sunny -> clouds -> rain -> thunderstorm with lightning -> clearing -> rainbow.
   2) KrishFieldView: draws the farmer's OWN field boundary over real satellite tiles
      (replaces the abstract sketch / emoji tile in Farm profile and Land report).
   It never edits the original app logic. Every block is wrapped in safe(), so a failure here cannot break KRISHINITI. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const hi = () => document.documentElement.lang === 'hi';
const t = s => { const a = s.split('|'); return hi() && a[1] ? a[1] : a[0]; };   // "English|हिंदी"
const safe = f => { try { return f(); } catch (e) { console.warn('[krishiniti-farm]', e); } };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEG = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const sm = (a, b, v) => { v = clamp((v - a) / (b - a)); return v * v * (3 - 2 * v); };
const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };

/* ================================================================
   1. THE LIVING FARM SCENE
   ================================================================ */
const PAGES = ['map-screen', 'details-screen', 'analysis-screen'];

/* weather keyframes: [seconds, cloud, rain, storm, darkness, rainbow, wind] — loops every CYC seconds */
const KF = [
  [0, .12, 0, 0, 0, 0, .15], [9, .18, 0, 0, 0, 0, .20], [16, .70, 0, 0, .35, 0, .35], [22, 1, .55, 0, .55, 0, .50],
  [30, 1, 1, 0, .65, 0, .60], [34, 1, 1, 1, .88, 0, .90], [46, 1, 1, 1, .92, 0, 1], [51, .90, .45, .20, .50, 0, .60],
  [55, .55, 0, 0, .15, .60, .30], [60, .30, 0, 0, 0, 1, .20], [64, .20, 0, 0, 0, .40, .15], [66, .12, 0, 0, 0, 0, .15]
];
const CYC = 66;
function weatherAt(time) {
  const s = ((time % CYC) + CYC) % CYC; let i = 0;
  while (i < KF.length - 2 && s >= KF[i + 1][0]) i++;
  const a = KF[i], b = KF[i + 1], k = sm(a[0], b[0], s), v = n => lerp(a[n], b[n], k);
  return { cloud: v(1), rain: v(2), storm: v(3), dark: v(4), rainbow: v(5), wind: v(6) };
}

/* five plots, five crops, five growth phases — all stages of the cycle are always on screen */
const CROPS = [
  { n: 'Paddy|धान', h: .95, leaf: [58, 146, 70], ripe: [222, 186, 84], head: 'ear' },
  { n: 'Wheat|गेहूं', h: .85, leaf: [88, 160, 62], ripe: [228, 192, 94], head: 'ear' },
  { n: 'Maize|मक्का', h: 1.7, leaf: [46, 130, 62], ripe: [198, 162, 82], head: 'cob' },
  { n: 'Mustard|सरसों', h: 1.05, leaf: [78, 152, 60], ripe: [190, 160, 72], head: 'pods', flower: [250, 214, 40] },
  { n: 'Lentil|मसूर', h: .55, leaf: [96, 160, 84], ripe: [186, 152, 86], head: 'pods', flower: [206, 176, 232] }
];
const STAGES = [
  [0, '🌰', 'Sowing|बुवाई'], [.08, '🌱', 'Germination|अंकुरण'], [.25, '🌿', 'Vegetative|वानस्पतिक वृद्धि'],
  [.55, '🌼', 'Flowering|फूल आना'], [.75, '🌾', 'Grain filling|दाना भरना'], [.92, '🧺', 'Harvest|कटाई']
];
const stageOf = u => { let s = STAGES[0]; for (const g of STAGES) if (u >= g[0]) s = g; return s; };
const CROP_CYCLE = 64;                         // seconds for a full sowing -> harvest cycle
const PLOT_W = 5.4, PLOT_GAP = .4, ROW_GAP = .6, ROWS = 9;
const PLOT_X0 = -(5 * PLOT_W + 4 * PLOT_GAP) / 2;
const NEAR = [], FAR = [];                      // rows in front of / behind the dirt track
for (let z = 1.4; z < 13.3; z *= 1.17) NEAR.push(z);
for (let z = 17.4; z <= 32.01; z += .9) FAR.push(z);
const SLICES = FAR.slice().reverse().concat(NEAR.slice().reverse());   // painter's order: far -> near
const TRACK = [13.6, 17.0], TRACTOR_Z = 15.3, FIELD_Z0 = .6, FIELD_Z1 = 33;

const WX_NAME = {
  sun: ['☀️', 'Sunny skies|खिली धूप'], gather: ['⛅', 'Clouds gathering|बादल घिर रहे हैं'], rain: ['🌧️', 'Rain|बारिश'],
  storm: ['⛈️', 'Thunderstorm|आंधी-तूफान'], bow: ['🌈', 'Clearing · rainbow|साफ मौसम · इंद्रधनुष']
};

function scene() {
  const cv = document.createElement('canvas'); cv.id = 'fx-scene'; cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const c = cv.getContext('2d'); if (!c) return null;

  let W = 0, H = 0, D = 1, hz = 0, F = 430, CAM_H = 2.2, camX = 0, U = 1;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let T = RM ? 8 : 0, paused = false, active = false, raf = 0, last = 0, wx = weatherAt(0), slow = 0, frames = 0;
  const R = rng(20251107);

  /* ---------- static layout ---------- */
  const trees = Array.from({ length: 34 }, () => ({ x: (R() - .5) * 190, z: 52 + R() * 40, r: 2 + R() * 2.4, g: R() }));
  trees.sort((a, b) => b.z - a.z);
  const farBands = Array.from({ length: 14 }, (_, i) => ({ z: 33 * Math.pow(1.34, i), c: [[126, 168, 96], [205, 178, 96], [150, 122, 78], [112, 158, 92], [186, 170, 92]][Math.floor(R() * 5)] }));
  const clouds = Array.from({ length: 7 }, (_, i) => ({ x: R() * 1.3 - .15, y: .05 + R() * .24, s: .75 + R() * .9, sp: .004 + R() * .008, p: Array.from({ length: 5 }, () => ({ dx: (R() - .5) * 1.7, dy: (R() - .5) * .34, r: .3 + R() * .3 })) }));
  const birds = Array.from({ length: 4 }, (_, i) => ({ x: R(), y: .12 + R() * .14, s: .8 + R() * .6, ph: R() * 6 }));
  const rain = Array.from({ length: 520 }, () => ({ x: R(), y: R(), z: .3 + R() * .7 }));
  const splashes = [], smoke = [], dust = [];
  let bolt = null, flash = 0, nextBolt = 2.5, tx = -22;

  const size = () => {
    D = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1 : 1.5) * (slow > 0 ? .7 : 1);
    W = innerWidth; H = innerHeight; cv.width = Math.round(W * D); cv.height = Math.round(H * D); c.setTransform(D, 0, 0, D, 0, 0);
    F = 430; hz = Math.min(205, H * .3);
    if (!active || RM) draw(0);
  };
  addEventListener('resize', size);
  addEventListener('pointermove', e => { par.tx = e.clientX / innerWidth - .5; par.ty = e.clientY / innerHeight - .5; });

  /* ---------- projection ---------- */
  const SX = (x, z) => W / 2 + (x - camX) * F / z;
  const SY = (y, z) => hz + (CAM_H - y) * F / z;

  /* ---------- sky, sun, clouds, rainbow, birds ---------- */
  function sky(now) {
    const mix = clamp(wx.dark * 1.15), ov = clamp(wx.cloud * .55);
    const top = mixc(mixc([78, 164, 226], [138, 160, 178], ov), [26, 36, 50], mix);
    const bot = mixc(mixc([204, 234, 246], [196, 210, 220], ov), [96, 112, 130], mix);
    const g = c.createLinearGradient(0, 0, 0, hz + 8); g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
    c.fillStyle = g; c.fillRect(0, 0, W, hz + 8);
    const sa = (1 - wx.dark) * (1 - wx.cloud * .65), sx = W * .8 + par.x * -18, sy = hz * .5;
    if (sa > .02) {
      const gl = c.createRadialGradient(sx, sy, 0, sx, sy, 420 * U); gl.addColorStop(0, `rgba(255,236,170,${.7 * sa})`); gl.addColorStop(.25, `rgba(255,226,140,${.25 * sa})`); gl.addColorStop(1, 'rgba(255,226,140,0)');
      c.fillStyle = gl; c.fillRect(0, 0, W, hz + 8);
      c.fillStyle = `rgba(255,248,214,${.95 * sa})`; c.beginPath(); c.arc(sx, sy, 36 * U, 0, 6.283); c.fill();
      c.strokeStyle = `rgba(255,240,180,${.22 * sa})`; c.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + now * .00008, r0 = 52 * U, r1 = (78 + 16 * Math.sin(now * .001 + i)) * U; c.beginPath(); c.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0); c.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1); c.stroke(); }
    }
    if (wx.dark > .05) {                                 // heavy storm ceiling
      const sg = c.createLinearGradient(0, 0, 0, hz * .95); sg.addColorStop(0, `rgba(22,28,40,${.7 * wx.dark})`); sg.addColorStop(1, 'rgba(22,28,40,0)');
      c.fillStyle = sg; c.fillRect(0, 0, W, hz * .95);
    }
  }
  function drawClouds(dt) {
    const dark = wx.dark;
    clouds.forEach((cl, i) => {
      const vis = clamp(wx.cloud * 1.3 - i * .07); if (vis < .02) return;
      cl.x += dt * cl.sp * (1 + wx.wind * 2.4); if (cl.x > 1.3) cl.x = -.35;
      const cx = cl.x * W + par.x * -12 * cl.s, cy = hz * (.1 + .75 * (cl.y - .05) / .24) + dark * 26;
      const base = mixc(mixc([255, 255, 255], [206, 214, 222], clamp(wx.cloud * .5)), [74, 84, 98], clamp(dark * 1.2));
      const rr = Math.min(W * .1, 150) * cl.s;
      for (const p of cl.p) {
        const px = cx + p.dx * rr * 1.6, py = cy + p.dy * rr * 1.1, r = p.r * rr * 1.7;
        const g = c.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, rgb(base, .9 * vis)); g.addColorStop(.6, rgb(base, .5 * vis)); g.addColorStop(1, rgb(base, 0));
        c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, 6.283); c.fill();
      }
    });
  }
  function rainbow() {
    if (wx.rainbow < .02) return;
    const cx = W * .3 + par.x * -14, cy = hz + 24, rx = Math.min(W * .3, 520), ry = hz * .9;
    const cols = ['255,70,70', '255,150,50', '255,222,70', '90,200,100', '70,160,235', '90,100,210', '160,90,200'];
    c.lineWidth = 8 * U;
    cols.forEach((col, i) => { c.strokeStyle = `rgba(${col},${.36 * wx.rainbow})`; c.beginPath(); c.ellipse(cx, cy, rx - i * 7.4 * U, ry - i * 7.4 * U, 0, Math.PI, 0); c.stroke(); });
  }
  function drawBirds(now) {
    const a = (1 - wx.cloud) * .8 * (1 - wx.dark); if (a < .05) return;
    c.strokeStyle = `rgba(40,52,60,${a})`; c.lineWidth = 1.6; c.lineCap = 'round';
    birds.forEach(b => {
      const x = ((b.x * W + now * .018 * b.s) % (W + 80)) - 40, y = b.y * H + Math.sin(now * .0007 + b.ph) * 8, f = Math.sin(now * .012 + b.ph) * 4 * b.s;
      c.beginPath(); c.moveTo(x - 7 * b.s, y - f); c.quadraticCurveTo(x - 3 * b.s, y - 4 * b.s, x, y); c.quadraticCurveTo(x + 3 * b.s, y - 4 * b.s, x + 7 * b.s, y - f); c.stroke();
    });
  }

  /* ---------- hills, ground, far field, horizon objects ---------- */
  function hills() {
    const haze = mixc([132, 170, 160], [76, 92, 100], clamp(wx.dark * 1.1));
    const mid = mixc([96, 144, 96], [48, 72, 62], clamp(wx.dark * 1.1));
    [[haze, 34, 34, 1.7, 12, 1], [mid, 12, 20, 2.9, 26, 2]].forEach(([col, base, amp, fr, shift, ph]) => {
      c.fillStyle = rgb(col); c.beginPath(); c.moveTo(0, hz + 3);
      for (let x = 0; x <= W + 10; x += 10) { const u = x / W; c.lineTo(x, hz - base * U - amp * U * (Math.sin(u * fr * 3.1 + ph + par.x * .4) * .55 + Math.sin(u * fr * 7.7 + ph * 2) * .25 + .4)); }
      c.lineTo(W + 10, hz + 3); c.closePath(); c.fill();
    });
  }
  function ground() {
    const d = wx.dark, wet = wx.rain;
    const g = c.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, rgb(mixc([160, 190, 118], [88, 112, 84], d)));
    g.addColorStop(.1, rgb(mixc([132, 170, 96], [74, 98, 72], d)));
    g.addColorStop(.35, rgb(mixc([140, 118, 78], [78, 66, 50], d)));
    g.addColorStop(1, rgb(mixc([96, 70, 44], mixc([52, 40, 30], [34, 28, 24], .5), clamp(d + wet * .4))));
    c.fillStyle = g; c.fillRect(0, hz, W, H - hz);
    farBands.forEach((b, i) => {     // patchwork of distant fields
      const y0 = SY(0, b.z), y1 = i ? SY(0, farBands[i - 1].z) : H; if (y0 >= H) return;
      c.fillStyle = rgb(mixc(b.c, [50, 66, 56], d * .8), .34); c.fillRect(0, y0, W, Math.max(1, y1 - y0 - 1));
    });
    const hg = c.createLinearGradient(0, hz, 0, hz + 46);   // horizon haze
    hg.addColorStop(0, rgb(mixc([226, 238, 236], [110, 126, 142], d), .6 + wx.rain * .2)); hg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hg; c.fillRect(0, hz, W, 46);
  }
  function tree(x, z, r, gs) {
    const k = F / z, sx = SX(x, z), sy = SY(0, z), d = clamp(wx.dark * 1.1);
    c.fillStyle = rgb(mixc([84, 62, 40], [40, 32, 26], d)); c.fillRect(sx - r * k * .08, sy - r * k * .9, r * k * .16, r * k * .9);
    c.fillStyle = rgb(mixc(mixc([60, 118, 66], [88, 138, 70], gs), [34, 62, 46], d));
    c.beginPath(); c.arc(sx, sy - r * k * 1.35, r * k * .85, 0, 6.283); c.arc(sx - r * k * .5, sy - r * k * 1.05, r * k * .6, 0, 6.283); c.arc(sx + r * k * .5, sy - r * k * 1.05, r * k * .6, 0, 6.283); c.fill();
  }
  function barn() {
    const z = 36, x = 21, k = F / z, sx = SX(x, z), sy = SY(0, z), d = clamp(wx.dark * 1.1), wall = mixc([176, 70, 52], [78, 40, 36], d), roof = mixc([88, 72, 64], [40, 36, 34], d);
    c.fillStyle = rgb(wall); c.fillRect(sx - 4.5 * k, sy - 4.4 * k, 9 * k, 4.4 * k);
    c.fillStyle = rgb(roof); c.beginPath(); c.moveTo(sx - 5.1 * k, sy - 4.4 * k); c.lineTo(sx, sy - 7.4 * k); c.lineTo(sx + 5.1 * k, sy - 4.4 * k); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,244,230,.85)'; c.lineWidth = Math.max(1, .2 * k); c.strokeRect(sx - 1.4 * k, sy - 3 * k, 2.8 * k, 3 * k);
    c.beginPath(); c.moveTo(sx - 1.4 * k, sy - 3 * k); c.lineTo(sx + 1.4 * k, sy); c.moveTo(sx + 1.4 * k, sy - 3 * k); c.lineTo(sx - 1.4 * k, sy); c.stroke();
    c.fillStyle = rgb(mixc([196, 200, 204], [88, 94, 102], d)); c.fillRect(sx + 5.6 * k, sy - 8 * k, 2.4 * k, 8 * k);
    c.beginPath(); c.arc(sx + 6.8 * k, sy - 8 * k, 1.2 * k, Math.PI, 0); c.fill();
  }
  function windmill(now) {
    const z = 31, x = -22, k = F / z, sx = SX(x, z), sy = SY(0, z), d = clamp(wx.dark * 1.1), col = rgb(mixc([232, 236, 238], [96, 104, 114], d));
    c.strokeStyle = col; c.lineWidth = Math.max(1, .28 * k); c.beginPath(); c.moveTo(sx - 1.1 * k, sy); c.lineTo(sx, sy - 9.5 * k); c.lineTo(sx + 1.1 * k, sy); c.stroke();
    c.lineWidth = Math.max(.8, .1 * k); c.beginPath(); c.moveTo(sx - .7 * k, sy - 3.5 * k); c.lineTo(sx + .7 * k, sy - 3.5 * k); c.moveTo(sx - .4 * k, sy - 6.5 * k); c.lineTo(sx + .4 * k, sy - 6.5 * k); c.stroke();
    const rot = now * .001 * (.5 + wx.wind * 5.5);
    c.save(); c.translate(sx, sy - 9.8 * k); c.rotate(rot); c.fillStyle = col;
    for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.fillRect(.15 * k, -.35 * k, 3.1 * k, .7 * k); }
    c.restore();
  }

  /* ---------- field floor: furrows, footpaths, dirt track ---------- */
  function quad(x0, x1, z0, z1, fill) {
    c.fillStyle = fill; c.beginPath(); c.moveTo(SX(x0, z0), SY(0, z0)); c.lineTo(SX(x1, z0), SY(0, z0)); c.lineTo(SX(x1, z1), SY(0, z1)); c.lineTo(SX(x0, z1), SY(0, z1)); c.closePath(); c.fill();
  }
  function floor() {
    const d = clamp(wx.dark + wx.rain * .3);
    for (let p = 0; p < 5; p++) {
      const x0 = PLOT_X0 + p * (PLOT_W + PLOT_GAP);
      quad(x0, x0 + PLOT_W, FIELD_Z0, FIELD_Z1, rgb(mixc([92, 64, 38], [46, 34, 26], d), .55));
      for (let r = 0; r < ROWS; r++) { const x = x0 + .3 + r * ROW_GAP; quad(x - .13, x + .13, FIELD_Z0, FIELD_Z1, rgb(mixc([54, 36, 22], [28, 20, 16], d), .5)); }
      if (p < 4) quad(x0 + PLOT_W, x0 + PLOT_W + PLOT_GAP, FIELD_Z0, FIELD_Z1, rgb(mixc([188, 160, 112], [90, 80, 64], d), .6));
    }
    const y0 = SY(0, TRACK[0]), y1 = SY(0, TRACK[1]);              // dirt track the tractor drives on
    const g = c.createLinearGradient(0, y1, 0, y0); g.addColorStop(0, rgb(mixc([176, 148, 102], [84, 72, 56], d))); g.addColorStop(1, rgb(mixc([154, 126, 84], [70, 58, 46], d)));
    c.fillStyle = g; c.fillRect(0, y1, W, y0 - y1);
    c.strokeStyle = rgba(mixc([120, 92, 60], [50, 42, 34], d), .5); c.lineWidth = Math.max(1, (y0 - y1) * .08);
    const ym = (y0 + y1) / 2, off = (y0 - y1) * .22; c.beginPath(); c.moveTo(0, ym - off); c.lineTo(W, ym - off); c.moveTo(0, ym + off); c.lineTo(W, ym + off); c.stroke();
  }
  const rgba = (col, a) => rgb(col, a);

  /* ---------- crops ---------- (batched: one stroke + one fill per plot per depth row) ---------- */
  function cropColors(p) {
    const cr = CROPS[p], u = ((T / CROP_CYCLE) + p * .2) % 1, r = sm(.6, .92, u);
    let g = sm(.07, .62, u); if (u > .955) g *= 1 - sm(.955, .985, u) * .85;   // after harvest only stubble stays
    return { cr, u, g, col: rgb(mixc(cr.leaf, cr.ripe, r)), head: rgb(mixc(cr.leaf, cr.ripe, clamp(r * 1.35)).map(v => v * .94)) };
  }
  function slice(z, cols, jz) {
    const k = F / z, sy = SY(0, z), n = k > 70 ? 3 : k > 36 ? 2 : 1, half = W / 2 + 90, tt = T * 1.7;
    for (let p = 0; p < 5; p++) {
      const pc = cols[p], cr = pc.cr, u = pc.u, g = pc.g, x0 = PLOT_X0 + p * (PLOT_W + PLOT_GAP);
      const rows = []; for (let r = 0; r < ROWS; r++) { const sx = SX(x0 + .3 + r * ROW_GAP, z); if (Math.abs(sx - W / 2) <= half) rows.push([sx, r]); }
      if (!rows.length) continue;
      if (u < .07 || u > .985) {                                                 // sowing: seeds in the furrow
        if (k > 22) { const sd = Math.max(1.2, .035 * k); c.fillStyle = 'rgba(86,58,34,.9)'; c.beginPath(); for (const [sx] of rows) for (let i = 0; i < n; i++) c.rect(sx + (i - 1) * .1 * k, sy - sd * 1.5, sd, sd); c.fill(); }
        continue;
      }
      const hb = cr.h * g * k; if (hb < 1.2) continue;
      const wind = .035 + .15 * wx.wind, sgn = u > .6 ? 1.15 : 1;
      if (k < 17) {                                                              // distant: one block per row
        c.fillStyle = pc.col; c.beginPath(); const w = Math.max(1, ROW_GAP * k * .75);
        for (const [sx, r] of rows) { const hp = hb * (1 + (((r * 7 + jz * 3) % 5) - 2) * .03), sw = Math.sin(tt + sx * .021 + z * .4) * wind * sgn; c.rect(sx - w / 2 + sw * hp * .5, sy - hp, w, hp); }
        c.fill(); continue;
      }
      c.strokeStyle = pc.col; c.lineWidth = Math.max(1, .032 * k * (.6 + g * .4)); c.lineCap = 'round'; c.beginPath();
      const heads = [], leafy = k > 24 && g > .15;
      for (const [sx, r] of rows) {
        const hp = hb * (1 + (((r * 7 + jz * 3) % 5) - 2) * .03), sw = Math.sin(tt + sx * .021 + z * .4) * wind * sgn;
        for (let st = 0; st < n; st++) {
          const dx = (st - (n - 1) / 2) * .13 * k, hh = hp * (.88 + (st % 2) * .12), tx2 = sx + dx + sw * hh, ty2 = sy - hh;
          c.moveTo(sx + dx, sy); c.quadraticCurveTo(sx + dx + sw * hh * .3, sy - hh * .55, tx2, ty2);
          if (leafy) {
            const L = hh * (cr.head === 'cob' ? .5 : .34), lift = .6 + (1 - g) * .4;
            for (const [f, dir] of [[.38, -1], [.62, 1], [.5, st % 2 ? 1 : -1]]) {
              const bx = sx + dx + sw * hh * f * f, by = sy - hh * f;
              c.moveTo(bx, by); c.quadraticCurveTo(bx + dir * L * .7, by - L * lift * .9, bx + dir * L, by - L * (lift - .35) + (u > .75 ? L * .35 : 0));
            }
          }
          if (st === 0) heads.push(sx + sw * hh, sy - hh, hh, sw);
        }
      }
      c.stroke();
      if (u > .5 && k > 24) {                                                    // ears / cobs / pods (one fill)
        c.fillStyle = pc.head; c.beginPath();
        for (let h = 0; h < heads.length; h += 4) {
          const x = heads[h], y = heads[h + 1], hh = heads[h + 2], sw = heads[h + 3];
          if (cr.head === 'cob') { const ex = x - sw * hh * .5 + .12 * k, ey = sy - hh * .55; c.moveTo(ex + .06 * k, ey); c.ellipse(ex, ey, .06 * k, .16 * k, .3, 0, 6.283); }
          else if (cr.head === 'ear') { const ex = x + (u > .72 ? .06 * k : 0), ey = y - .08 * k * g, ry = .15 * k * g; c.moveTo(ex + .045 * k, ey); c.ellipse(ex, ey, .045 * k, ry, u > .72 ? .5 : 0, 0, 6.283); }
          else { const rr = Math.max(.8, .022 * k); for (let q = 0; q < 4; q++) { const ex = x + (q - 1.5) * .05 * k, ey = y + (q % 2) * .06 * k; c.moveTo(ex + rr, ey); c.arc(ex, ey, rr, 0, 6.283); } }
        }
        c.fill();
        const fa = cr.flower ? sm(.42, .55, u) * (1 - sm(.72, .86, u)) : 0;
        if (fa > .02) {
          c.fillStyle = rgb(cr.flower, fa); c.beginPath(); const rr = Math.max(1, .03 * k);
          for (let h = 0; h < heads.length; h += 4) for (let q = 0; q < 5; q++) { const ex = heads[h] + (q - 2) * .06 * k, ey = heads[h + 1] + (q % 3) * .07 * k; c.moveTo(ex + rr, ey); c.arc(ex, ey, rr, 0, 6.283); }
          c.fill();
        }
      }
    }
  }

  /* ---------- tractor, smoke and dust ---------- */
  const tr = { sx: 0, sy: 0, k: 1 };
  function wheel(x, y, r, ang, d) {
    c.save(); c.translate(x, y); c.fillStyle = '#1d2022'; c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.fill();
    c.rotate(-ang); c.fillStyle = '#2a2e31';
    for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.fillRect(r * .86, -.05, r * .22, .1); }
    c.fillStyle = rgb(mixc([226, 150, 70], [120, 80, 44], d)); c.beginPath(); c.arc(0, 0, r * .55, 0, 6.283); c.fill();
    c.fillStyle = '#3a3e41'; c.beginPath(); c.arc(0, 0, r * .18, 0, 6.283); c.fill(); c.restore();
  }
  function tractor(sx, sy, k, now) {
    tr.sx = sx; tr.sy = sy; tr.k = k;
    const d = clamp(wx.dark * 1.1), ang = tx / .78;
    c.save(); c.translate(sx, sy); c.scale(k, -k);
    c.fillStyle = 'rgba(20,14,8,.3)'; c.beginPath(); c.ellipse(-.3, 0, 2.9, .3, 0, 0, 6.283); c.fill();
    c.fillStyle = '#383c42'; c.fillRect(-3.5, .62, 2.1, .1);                          // plough beam + discs
    for (let i = 0; i < 3; i++) { c.save(); c.translate(-3.2 + i * .55, .36); c.rotate(-ang * 1.4); c.fillStyle = '#9aa2a8'; c.beginPath(); c.arc(0, 0, .34, 0, 6.283); c.fill(); c.fillStyle = '#6a7278'; c.fillRect(-.34, -.02, .68, .04); c.restore(); }
    wheel(-.75, .78, .78, ang, d); wheel(1.5, .46, .46, ang * 1.7, d);
    const body = rgb(mixc([200, 96, 60], [112, 56, 40], d));
    c.fillStyle = body; c.beginPath(); c.moveTo(.1, .62); c.lineTo(2.15, .62); c.lineTo(2.15, 1.3); c.lineTo(1.7, 1.42); c.lineTo(.1, 1.42); c.closePath(); c.fill();
    c.fillStyle = 'rgba(247,246,239,.9)'; c.fillRect(.1, 1.0, 2.05, .09);
    c.fillStyle = '#2b2f33'; for (let i = 0; i < 4; i++) c.fillRect(2.0, .75 + i * .13, .14, .06);
    c.fillStyle = '#2d3236'; c.fillRect(1.55, 1.42, .09, .62);                       // exhaust
    c.fillStyle = body; c.fillRect(-1.3, 1.0, 1.55, .5);                              // cab
    c.fillStyle = rgb(mixc([164, 206, 226], [58, 84, 104], d), .95); c.beginPath(); c.moveTo(-1.15, 1.5); c.lineTo(.2, 1.5); c.lineTo(.12, 2.4); c.lineTo(-1.1, 2.4); c.closePath(); c.fill();
    c.fillStyle = '#e8c9a0'; c.beginPath(); c.arc(-.5, 1.95, .17, 0, 6.283); c.fill();         // the farmer
    c.fillStyle = '#c8a24a'; c.beginPath(); c.ellipse(-.5, 2.1, .3, .06, 0, 0, 6.283); c.fill(); c.beginPath(); c.arc(-.5, 2.1, .15, Math.PI, 0); c.fill();
    c.fillStyle = '#2f5d3c'; c.fillRect(-.68, 1.5, .36, .28);
    c.fillStyle = '#26292d'; c.fillRect(-1.45, 2.4, 1.85, .12);
    c.fillStyle = d > .35 ? '#fff3b0' : '#e8e3c8'; c.beginPath(); c.arc(2.14, 1.12, .1, 0, 6.283); c.fill();
    c.restore();
  }
  function particles(arr, dt, z, col, grow, rise) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i]; p.l -= dt; if (p.l <= 0) { arr.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += (p.vy + rise) * dt; p.r += grow * dt;
      const a = clamp(p.l / p.m) * p.a, k = F / z;
      c.fillStyle = rgb(col, a); c.beginPath(); c.arc(SX(p.x, z), SY(p.y, z), p.r * k, 0, 6.283); c.fill();
    }
  }

  /* ---------- rain, splashes, lightning ---------- */
  function drawRain(dt) {
    const a = wx.rain; if (a < .02) return;
    if (a > .1) { const g = c.createLinearGradient(0, hz - 30, 0, hz + 110); g.addColorStop(0, 'rgba(170,186,200,0)'); g.addColorStop(.4, `rgba(170,186,200,${.28 * a})`); g.addColorStop(1, 'rgba(170,186,200,0)'); c.fillStyle = g; c.fillRect(0, hz - 30, W, 140); }
    const n = Math.floor(rain.length * a), slope = .12 + wx.wind * .5;
    c.lineCap = 'round';
    for (let layer = 0; layer < 3; layer++) {                      // far / mid / near drops: one path + one stroke each
      const lo = layer * .3 + .3, hi2 = lo + .3;
      c.lineWidth = .8 + layer * .45; c.strokeStyle = `rgba(206,222,238,${(.16 + layer * .16) * Math.min(1, a * 1.3)})`; c.beginPath();
      for (let i = 0; i < n; i++) {
        const p = rain[i]; if (p.z < lo || p.z >= hi2 + (layer === 2 ? 1 : 0)) continue;
        const x = p.x * W, y = p.y * H, len = 10 + p.z * 22; c.moveTo(x, y); c.lineTo(x - slope * len, y - len);
      }
      c.stroke();
    }
    for (let i = 0; i < n; i++) {                                    // advance the drops
      const p = rain[i]; p.y += dt * (1.2 + p.z * 1.6) * (1.2 + wx.wind * .3); p.x -= dt * slope * .6 * p.z * (.5 + p.z);
      if (p.y > 1.05) { p.y = -.05; p.x = Math.random() * 1.3; if (p.z > .6 && Math.random() < .5 && splashes.length < 70) splashes.push({ x: Math.random() * W, y: hz + 60 + Math.random() * (H - hz - 60), l: .5, r: 1 }); }
      if (p.x < -.1) p.x += 1.2;
    }
    c.lineWidth = 1; c.strokeStyle = 'rgba(214,228,240,.34)'; c.beginPath();      // ripples where drops land: one path
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]; s.l -= dt; if (s.l <= 0) { splashes.splice(i, 1); continue; }
      const q = 1 - s.l / .5, sc = (s.y - hz) / (H - hz) + .25, rx = (3 + q * 13) * sc;
      c.moveTo(s.x + rx, s.y); c.ellipse(s.x, s.y, rx, (1 + q * 4) * sc, 0, 0, 6.283);
    }
    c.stroke();
  }
  function strike() {
    const x0 = W * (.08 + Math.random() * .84), pts = [[x0, -10]]; let x = x0, y = -10; const yEnd = hz + 12 + Math.random() * 80;
    while (y < yEnd) { y += 22 + Math.random() * 34; x += (Math.random() - .5) * 74; pts.push([x, y]); }
    const br = []; for (let i = 3; i < pts.length - 1; i++) if (Math.random() < .3) { let bx = pts[i][0], by = pts[i][1]; const seg = [[bx, by]], dir = Math.random() < .5 ? -1 : 1; for (let j = 0; j < 4; j++) { bx += dir * (16 + Math.random() * 30); by += 14 + Math.random() * 26; seg.push([bx, by]); } br.push(seg); }
    bolt = { pts, br, life: .42, re: false }; flash = 1;
  }
  function drawBolt(dt) {
    flash = Math.max(0, flash - dt * 3);
    if (bolt) {
      bolt.life -= dt; if (!bolt.re && bolt.life < .26) { bolt.re = true; flash = Math.max(flash, .65); }
      if (bolt.life <= 0) bolt = null;
      else {
        const a = clamp(bolt.life / .3) * (.7 + .3 * Math.random());
        c.save(); c.lineJoin = 'round'; c.shadowColor = 'rgba(180,200,255,1)'; c.shadowBlur = 24;
        const path = pts => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); };
        c.strokeStyle = `rgba(190,210,255,${a * .8})`; c.lineWidth = 6; path(bolt.pts);
        c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 2.4; path(bolt.pts);
        c.lineWidth = 1.4; bolt.br.forEach(path); c.restore();
      }
    }
    if (flash > .01) { c.fillStyle = `rgba(214,226,255,${.42 * flash})`; c.fillRect(0, 0, W, H); }
  }

  /* ---------- frame ---------- */
  function draw(dt, now = performance.now()) {
    U = clamp(H / 900, .7, 1.2); camX = par.x * .7; hz = Math.min(205, H * .3) + par.y * 10;
    wx = weatherAt(T);
    sky(now); rainbow(); drawClouds(dt); drawBirds(now); hills(); ground();
    trees.forEach(tr_ => tree(tr_.x, tr_.z, tr_.r, tr_.g)); barn(); windmill(now);
    floor();
    const cols = [0, 1, 2, 3, 4].map(cropColors);
    let drewTrack = false, jz = 0;
    for (const z of SLICES) {                                     // far -> near
      if (!drewTrack && z < TRACK[0]) {
        drewTrack = true;
        const k = F / TRACTOR_Z; particles(dust, dt, TRACTOR_Z, [128, 100, 68], .5, .15);
        tractor(SX(tx, TRACTOR_Z), SY(0, TRACTOR_Z), k, now);
        particles(smoke, dt, TRACTOR_Z, wx.dark > .5 ? [60, 60, 66] : [90, 90, 96], .5, .7);
      }
      slice(z, cols, jz++);
    }
    const wetg = c.createLinearGradient(0, hz, 0, H);               // wet ground sheen
    wetg.addColorStop(0, `rgba(200,218,232,${.22 * wx.rain})`); wetg.addColorStop(.3, `rgba(20,30,40,${.12 * wx.rain})`); wetg.addColorStop(1, `rgba(10,16,24,${.18 * wx.rain})`);
    c.fillStyle = wetg; c.fillRect(0, hz, W, H - hz);
    if (wx.dark > .01) { c.fillStyle = `rgba(8,14,26,${wx.dark * .46})`; c.fillRect(0, 0, W, H); }
    if (wx.dark > .3) {                                             // headlight glow
      c.save(); c.globalCompositeOperation = 'lighter';
      const hx = tr.sx + 2.14 * tr.k, hy = tr.sy - 1.12 * tr.k, gx = hx + tr.k * 1.6, gr = tr.k * 3.6, g = c.createRadialGradient(gx, hy, 0, gx, hy, gr);
      g.addColorStop(0, `rgba(255,236,160,${.55 * wx.dark})`); g.addColorStop(1, 'rgba(255,236,160,0)'); c.fillStyle = g; c.beginPath(); c.arc(gx, hy, gr, 0, 6.283); c.fill(); c.restore();
    }
    drawRain(dt); drawBolt(dt);
  }

  /* ---------- sim step + loop ---------- */
  function step(dt) {
    par.x += (par.tx - par.x) * .05; par.y += (par.ty - par.y) * .05;
    T += dt; wx = weatherAt(T);
    tx += dt * 1.25 * (1 - wx.storm * .35); if (tx > 30) tx = -30;
    if (wx.storm > .55) { nextBolt -= dt; if (nextBolt <= 0) { strike(); nextBolt = 2.2 + Math.random() * 4.6; } }
    const px = tx;                                                   // exhaust smoke + plough dust
    if (Math.random() < dt * 14 && smoke.length < 40) smoke.push({ x: px + 1.6, y: 2.05, vx: -.35 - wx.wind * .5, vy: .2, r: .07, l: 1.8, m: 1.8, a: .5 });
    if (wx.rain < .5 && Math.random() < dt * 30 && dust.length < 50) dust.push({ x: px - 3 + Math.random() * 1.3, y: .2 + Math.random() * .2, vx: -.5 - Math.random() * .6, vy: .3, r: .12, l: 1.1, m: 1.1, a: .45 * (1 - wx.rain) });
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!active || paused || document.hidden) { last = 0; return; }
    const dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
    if (dt > .028) slow++; else slow = Math.max(0, slow - .25);   // governor: drop resolution when the device struggles
    if (slow > 50 && D > 1) { slow = 0; D = 1; cv.width = Math.round(W); cv.height = Math.round(H); c.setTransform(1, 0, 0, 1, 0, 0); }
    step(dt); draw(dt, now); hudTick(now);
  }

  /* ---------- HUD chip (current weather + pause) ---------- */
  const hud = document.createElement('div'); hud.className = 'fx-hud'; hud.setAttribute('role', 'status');
  hud.innerHTML = '<span class="fx-wx"></span><span class="fx-live" data-t="LIVE FARM SIMULATION|लाइव खेत सिमुलेशन"></span><button type="button" class="fx-pause" aria-label="Pause or play the farm scene" title="Pause / play">❚❚</button>';
  document.body.appendChild(hud);
  const wxEl = hud.querySelector('.fx-wx'), pauseBtn = hud.querySelector('.fx-pause');
  const liveEl = hud.querySelector('.fx-live'); let hudKey = '', hudT = 0, peekT = 0;
  const strip = document.createElement('div'); strip.className = 'fx-strip'; hud.appendChild(strip);
  const wxKey = () => wx.storm > .5 ? 'storm' : wx.rain > .3 ? 'rain' : wx.rainbow > .4 ? 'bow' : wx.cloud > .45 ? 'gather' : 'sun';
  function hudTick(now, force) {
    if (!force && now - hudT < 400) return; hudT = now;
    const stg = [0, 1, 2, 3, 4].map(p => stageOf(((T / CROP_CYCLE) + p * .2) % 1)[0]).join(',');
    const k = wxKey() + (hi() ? 'h' : 'e') + stg; if (k === hudKey) return; hudKey = k;
    const w = WX_NAME[wxKey()]; wxEl.textContent = w[0] + ' ' + t(w[1]); liveEl.textContent = t(liveEl.dataset.t);
    strip.innerHTML = [0, 1, 2, 3, 4].map(p => { const s = stageOf(((T / CROP_CYCLE) + p * .2) % 1); return `<span title="${esc(t(s[2]))}"><b>${s[1]}</b>${esc(t(CROPS[p].n))}<small>${esc(t(s[2]))}</small></span>`; }).join('');
  }
  pauseBtn.addEventListener('click', () => { paused = !paused; pauseBtn.textContent = paused ? '▶' : '❚❚'; hud.classList.toggle('fx-paused', paused); });
  if (RM) hud.classList.add('fx-static');

  /* ---------- show only on the three pages ---------- */
  function sync() {
    const appOn = $('app') && !$('app').classList.contains('hidden');
    const on = !!appOn && PAGES.some(id => $(id) && !$(id).classList.contains('hidden'));
    if (on === active) return;
    active = on; document.body.classList.toggle('fx-on', on);
    if (on) { size(); hudKey = ''; hudTick(0, true); if (RM) draw(0); last = 0; hud.classList.add('fx-peek'); clearTimeout(peekT); peekT = setTimeout(() => hud.classList.remove("fx-peek"), 5000); }
  }
  const mo = new MutationObserver(() => safe(sync));
  PAGES.concat(['app']).forEach(id => { const e = $(id); if (e) mo.observe(e, { attributes: true, attributeFilter: ['class'] }); });
  new MutationObserver(() => safe(() => { hudKey = ''; hudTick(0, true); if (RM && active) draw(0); })).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  size(); sync(); if (!RM) raf = requestAnimationFrame(frame);

  return {
    seek(s) { T = s; wx = weatherAt(T); tx = -30 + (s * 1.25 % 60); draw(0); hudKey = ''; hudTick(0, true); },
    strike() { strike(); },
    pause(v) { paused = v !== false; },
    get t() { return T; }, get weather() { return wx; }
  };
}

/* ================================================================
   2. KrishFieldView — the farmer's real field on real satellite tiles
   ================================================================ */
const TILE = (x, y, z) => `https://mt${(x + y) % 4}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
const mx = lng => (lng + 180) / 360;
const my = lat => { const s = Math.sin(lat * DEG); return .5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const NICE = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

function fvDraw(el) {
  const st = el._fv; if (!st) return;
  const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;            // hidden right now — ResizeObserver redraws it when shown
  el._fvW = w; el._fvH = h;
  const pts = st.pts, X = pts.map(p => mx(p.lng)), Y = pts.map(p => my(p.lat));
  const x0 = Math.min(...X), x1 = Math.max(...X), y0 = Math.min(...Y), y1 = Math.max(...Y);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, fit = .66;
  const z = Math.min(20, Math.log2(Math.min(w * fit / Math.max(x1 - x0, 1e-9), h * fit / Math.max(y1 - y0, 1e-9)) / 256));
  const dpr = devicePixelRatio || 1, tz = Math.min(20, Math.max(2, Math.ceil(z) + (dpr > 1.3 ? 1 : 0)));
  const WS = 256 * Math.pow(2, z), N = Math.pow(2, tz), tsz = WS / N;
  const P = (ux, uy) => [(ux - cx) * WS + w / 2, (uy - cy) * WS + h / 2];
  const tx0 = Math.floor((cx - w / 2 / WS) * N), tx1 = Math.floor((cx + w / 2 / WS) * N), ty0 = Math.max(0, Math.floor((cy - h / 2 / WS) * N)), ty1 = Math.min(N - 1, Math.floor((cy + h / 2 / WS) * N));

  el.innerHTML = ''; el.classList.add('fv-ready');
  const layer = document.createElement('div'); layer.className = 'fv-tiles'; el.appendChild(layer);
  let loaded = 0, total = 0;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 120) break;
    total++;
    const im = new Image(); im.alt = ''; im.draggable = false; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
    im.style.cssText = `left:${((tx / N) - cx) * WS + w / 2}px;top:${((ty / N) - cy) * WS + h / 2}px;width:${tsz + .6}px;height:${tsz + .6}px`;
    im.onload = () => { loaded++; im.classList.add('on'); el.classList.add('fv-sat'); };
    im.onerror = () => im.remove();
    im.src = TILE(((tx % N) + N) % N, ty, tz); layer.appendChild(im);
  }
  const poly = pts.map(p => P(mx(p.lng), my(p.lat)));
  const pstr = poly.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
  const cen = P(cx, cy), acres = Number(st.opts.acres);
  const lab = Number.isFinite(acres) && acres > 0 ? `${acres.toFixed(2)} ${t('acres|एकड़')}` : '';
  const lw = lab.length * 6.6 + 18;
  const mpp = 156543.03392 * Math.cos(((pts.reduce((s, p) => s + p.lat, 0) / pts.length)) * DEG) / Math.pow(2, z) / (256 / 256);
  const real = mpp * 1; // metres per CSS pixel at this zoom (world is 256*2^z css px wide)
  const metres = NICE.filter(n => n / real <= Math.min(110, w * .32)).pop() || NICE[0], barPx = metres / real;
  const dots = poly.map(q => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="4" fill="#e6c66d" stroke="#173d2a" stroke-width="1.4"/>`).join('');
  const svg = document.createElement('div'); svg.className = 'fv-over';
  svg.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t('Your selected field on the satellite map|उपग्रह मानचित्र पर आपका चुना हुआ खेत'))}">
    <polygon points="${pstr}" fill="rgba(77,139,88,.30)" stroke="rgba(8,24,14,.55)" stroke-width="6" stroke-linejoin="round"/>
    <polygon points="${pstr}" fill="none" stroke="#e6c66d" stroke-width="2.6" stroke-linejoin="round"/>${dots}
    ${lab ? `<g transform="translate(${cen[0].toFixed(1)},${cen[1].toFixed(1)})"><rect x="${-lw / 2}" y="-12" width="${lw}" height="24" rx="12" fill="rgba(10,32,20,.82)" stroke="rgba(230,198,109,.8)"/><text y="4.5" text-anchor="middle" font-size="11.5" font-weight="800" fill="#fff" font-family="Manrope,DM Sans,sans-serif">${esc(lab)}</text></g>` : ''}
  </svg>`;
  el.appendChild(svg);
  const badge = document.createElement('span'); badge.className = 'fv-badge'; badge.textContent = t('● YOUR FIELD · SATELLITE VIEW|● आपका खेत · उपग्रह दृश्य'); el.appendChild(badge);
  const north = document.createElement('span'); north.className = 'fv-north'; north.innerHTML = '<i>▲</i>N'; el.appendChild(north);
  const sc = document.createElement('div'); sc.className = 'fv-scale'; sc.innerHTML = `<i style="width:${barPx.toFixed(0)}px"></i><b>${metres >= 1000 ? metres / 1000 + ' km' : metres + ' m'}</b>`; el.appendChild(sc);
  clearTimeout(el._fvT); el._fvT = setTimeout(() => { if (!loaded && el.isConnected) { el.classList.add('fv-offline'); badge.textContent = t('OUTLINE ONLY · imagery offline|केवल सीमा · इमेजरी ऑफ़लाइन'); } }, 7000);
}

const KrishFieldView = {
  /* mount(el, path, {acres}) — path = [{lat,lng}, …] (or [[lat,lng], …]); returns false if there is no usable polygon */
  mount(el, path, opts = {}) {
    return safe(() => {
      if (!el || !Array.isArray(path)) return false;
      const pts = path.map(p => Array.isArray(p) ? { lat: +p[0], lng: +p[1] } : { lat: +p.lat, lng: +p.lng }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      if (pts.length < 3) return false;
      el._fv = { pts, opts }; el.classList.add('fieldview', 'has-map');
      if (!el._fvRO && 'ResizeObserver' in window) {
        el._fvRO = new ResizeObserver(() => { if (el.clientWidth && el.clientHeight && (el.clientWidth !== el._fvW || el.clientHeight !== el._fvH)) safe(() => fvDraw(el)); });
        el._fvRO.observe(el);
      }
      fvDraw(el); return true;
    });
  },
  /* mountAll(root) — mounts every <div class="fieldview" data-path="[[lat,lng],…]" data-acres="…"> inside root */
  mountAll(root) {
    (root || document).querySelectorAll('.fieldview[data-path]').forEach(el => safe(() => {
      let path; try { path = JSON.parse(el.dataset.path); } catch (e) { return; }
      if (!this.mount(el, path, { acres: el.dataset.acres })) el.classList.remove('has-map');
    }));
  },
  clear(el) { if (!el) return; el._fv = null; el.classList.remove('has-map', 'fv-ready', 'fv-sat', 'fv-offline'); }
};
window.KrishFieldView = KrishFieldView;
new MutationObserver(() => safe(() => document.querySelectorAll('.fieldview.has-map').forEach(fvDraw))).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

/* ================================================================ boot */
const boot = () => { window.KrishScene = safe(scene) || null; };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
