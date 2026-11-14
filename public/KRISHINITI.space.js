/* KRISHINITI.space.js — additive visual layer for the Overview.
   1) Earth intro with farmer mascot (raw WebGL, NASA GIBS Blue Marble)   2) Cursor lens (Canvas 2D, one Gaussian)
   3) Twelve-widget climate board   4) Fluid layer, 3D step story, farm-life mascot, crop ring   5) 3D hero diorama (NASA POWER + your engine's crop data)
   It never edits the original app. Every block is wrapped in safe(), so a failure here cannot break KRISHINITI. */
(() => {
const $ = id => document.getElementById(id);
const hi = () => document.documentElement.lang === 'hi';
const t = s => { const a = s.split('|'); return hi() && a[1] ? a[1] : a[0]; };   // "English|हिंदी"
const tx = r => r.querySelectorAll('[data-t]').forEach(e => e.textContent = t(e.dataset.t));
const safe = f => { try { return f(); } catch (e) { console.warn('[krishiniti-space]', e); } };
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const prof = () => { try { return JSON.parse(localStorage.getItem('krishiniti-farm-profile-v1') || 'null'); } catch (e) { return null; } };
const DEG = Math.PI / 180;

/* ================= 1. CURSOR LENS: one dotted circle follows the pointer, the sheet bends toward its centre. Nothing is drawn elsewhere. ================= */
function lens(cv, rgb, ok) {
  const c = cv.getContext('2d'), G = 17, m = { x: 0, y: 0, px: 0, py: 0, r: 96, s: 0, on: 0, first: 1 };
  let W = 0, H = 0, raf = 0;
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; c.setTransform(d, 0, 0, d, 0, 0); };
  const mv = e => { m.px = e.clientX; m.py = e.clientY; m.on = 1; }, lv = () => m.on = 0;
  addEventListener('resize', size); addEventListener('pointermove', mv); document.addEventListener('mouseleave', lv);
  addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') lv(); }); size();
  const frame = now => {
    raf = requestAnimationFrame(frame);
    if (!ok()) { if (m.s) { c.clearRect(0, 0, W, H); m.s = 0; } return; }
    if (m.first) { m.x = m.px; m.y = m.py; m.first = 0; }
    const v = Math.min(Math.hypot(m.px - m.x, m.py - m.y), 60);
    m.x += (m.px - m.x) * .16; m.y += (m.py - m.y) * .16; m.s += (m.on - m.s) * .08;
    m.r += (92 + v * 1.1 + Math.sin(now / 420) * 5 - m.r) * .1;                     // the circle swells when you move fast
    c.clearRect(0, 0, W, H); if (m.s < .01) return;
    const R = m.r, sg = R * .5, i0 = Math.floor((m.x - R) / G) - 1, i1 = Math.ceil((m.x + R) / G) + 1, j0 = Math.floor((m.y - R) / G) - 1, j1 = Math.ceil((m.y + R) / G) + 1, n = i1 - i0 + 1, k = j1 - j0 + 1, P = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * G, y = j * G, dx = m.x - x, dy = m.y - y, d2 = dx * dx + dy * dy;
      const w = Math.exp(-d2 / (2 * sg * sg)), f = Math.max(0, 1 - Math.sqrt(d2) / R);   // the one Gaussian + a soft circular mask
      P.push(x + dx * .7 * w, y + dy * .7 * w, f * f * (3 - 2 * f) * m.s, w);
    }
    const gr = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, R); gr.addColorStop(0, `rgba(${rgb},${.09 * m.s})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = gr; c.beginPath(); c.arc(m.x, m.y, R, 0, 6.283); c.fill();
    c.setLineDash([3, 8]); c.lineDashOffset = -now / 45; c.lineWidth = 1; c.strokeStyle = `rgba(${rgb},${.28 * m.s})`; c.beginPath(); c.arc(m.x, m.y, R * .98, 0, 6.283); c.stroke(); c.setLineDash([]);
    for (let j = 0; j < k; j++) for (let i = 0; i < n; i++) {
      const a = (j * n + i) * 4, al = P[a + 2]; if (al < .02) continue;
      if (i < n - 1) { const b = P[a + 6]; if (b > .02) { c.strokeStyle = `rgba(${rgb},${.5 * Math.min(al, b)})`; c.beginPath(); c.moveTo(P[a], P[a + 1]); c.lineTo(P[a + 4], P[a + 5]); c.stroke(); } }
      if (j < k - 1) { const b = P[a + n * 4 + 2]; if (b > .02) { c.strokeStyle = `rgba(${rgb},${.5 * Math.min(al, b)})`; c.beginPath(); c.moveTo(P[a], P[a + 1]); c.lineTo(P[a + n * 4], P[a + n * 4 + 1]); c.stroke(); } }
      c.fillStyle = `rgba(${rgb},${.2 + .75 * al})`; c.beginPath(); c.arc(P[a], P[a + 1], .8 + 1.8 * P[a + 3] * al, 0, 6.283); c.fill();
    }
  };
  requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); removeEventListener('pointermove', mv); document.removeEventListener('mouseleave', lv); };
}

/* ================= 2. EARTH: tilted, spinning, drifting clouds, night-side city lights, glint, atmosphere ================= */
const GIBS = (l, f) => 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=' + l + '&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/' + (f || 'jpeg');
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 R,C,PX;uniform float S,T,HAS,HN,GL;uniform mat3 M;uniform sampler2D D,N;
float h(vec3 p){p=50.*fract(p*.3183099+vec3(.71,.113,.419));return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb(vec3 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
void main(){
 vec2 p=(gl_FragCoord.xy-C)/S;float r=length(p);
 vec3 L=normalize(vec3(-.55,.5,.67));
 vec2 g=gl_FragCoord.xy+PX;float s1=h(vec3(floor(g/2.),7.)),s2=h(vec3(floor(g/5.+31.),3.));
 vec3 col=vec3(.03,.06,.15)*fb(vec3(g/R.y*1.6,T*.01))*1.6;
 col+=vec3(.7,.8,1.)*step(.9982,s1)*(.5+.5*sin(T*2.+s1*90.))+vec3(1.,.9,.7)*step(.9992,s2)*(.6+.4*sin(T*1.3+s2*50.));
 vec3 nv=vec3(p,sqrt(max(1.-r*r,0.)));vec3 o=M*nv;
 float lat=asin(clamp(o.y,-1.,1.)),lon=atan(o.x,o.z);
 vec2 uv=vec2(lon/6.2831853+.5,lat/3.1415927+.5);
 vec3 c=pow(texture2D(D,uv).rgb,vec3(.9))*1.2;
 if(HAS<.5){float lf=fb(o*2.4+3.);c=mix(vec3(.02,.1,.3),mix(vec3(.2,.4,.17),vec3(.6,.5,.32),smoothstep(.55,.75,lf)),smoothstep(.5,.54,lf));c=mix(c,vec3(.92),smoothstep(.86,.94,abs(o.y)));}
 float wat=smoothstep(0.,.08,c.b-c.r-.02);
 float gd=T*.02;vec3 oc=vec3(o.x*cos(gd)+o.z*sin(gd),o.y,-o.x*sin(gd)+o.z*cos(gd));
 float cl=smoothstep(.5,.78,fb(oc*3.2)),sh=smoothstep(.5,.78,fb(oc*3.2+L*.1));
 c*=1.-.3*sh*(1.-cl);c=mix(c,vec3(.97),cl*.8);
 float nd=dot(nv,L),day=smoothstep(-.1,.3,nd);
 vec3 pl=c*(.03+1.1*day);
 float li=dot(texture2D(N,uv).rgb,vec3(.33));pl+=vec3(1.,.72,.38)*li*1.7*(1.-day)*(1.-cl*.75)*HN;
 pl+=vec3(.9,1.,1.)*pow(max(dot(reflect(-L,nv),vec3(0.,0.,1.)),0.),60.)*wat*(1.-cl)*day*.9;
 float tw=nd*6.;pl+=vec3(.9,.45,.2)*exp(-tw*tw)*.16*(1.-cl*.5);
 pl+=mix(vec3(.15,.4,.9),vec3(.5,.75,1.),day)*pow(1.-nv.z,2.2)*(.35+.9*day)*GL;
 col=mix(col,pl,1.-smoothstep(.994,1.,r));
 vec2 q=p/max(r,1e-4);float sl=dot(q,L.xy);
 col+=mix(vec3(.12,.3,.8),vec3(.35,.6,1.),smoothstep(-.5,.7,sl))*exp(-max(r-1.,0.)*11.)*(.2+.8*smoothstep(-.6,.8,sl))*GL;
 float sd=length(p-L.xy*1.08)*2.6;col+=vec3(1.,.9,.7)*exp(-sd*sd)*.4*GL;
 gl_FragColor=vec4(col,1.);
}`;

function earth(cv, el) {
  const gl = cv.getContext('webgl', { antialias: false, alpha: false }); if (!gl) return null;
  const mk = (ty, s) => { const o = gl.createShader(ty); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pg = gl.createProgram();
  gl.attachShader(pg, mk(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
  gl.attachShader(pg, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg); gl.useProgram(pg);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const al = gl.getAttribLocation(pg, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  const u = {}; ['R', 'C', 'PX', 'S', 'T', 'HAS', 'HN', 'GL', 'M', 'D', 'N'].forEach(k => u[k] = gl.getUniformLocation(pg, k));
  const mkTex = unit => { gl.activeTexture(gl.TEXTURE0 + unit); const x = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, x);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return x; };
  const tD = mkTex(0), tN = mkTex(1); gl.uniform1i(u.D, 0); gl.uniform1i(u.N, 1);
  let has = 0, hn = 0;
  const load = (unit, tex, urls, ok) => (function next(i) {
    if (i >= urls.length) return; const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { try {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      const p2 = v => (v & (v - 1)) === 0;
      if (p2(im.width) && p2(im.height)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); ok();
    } catch (e) { next(i + 1); } };
    im.onerror = () => next(i + 1); im.src = urls[i];
  })(0);
  // texture order: your own copy in /assets (works offline) -> NASA GIBS -> procedural fallback
  load(0, tD, ['assets/earth-day.jpg', GIBS('BlueMarble_ShadedRelief_Bathymetry'), GIBS('BlueMarble_NextGeneration')], () => has = 1);
  load(1, tN, ['assets/earth-night.jpg', GIBS('VIIRS_Black_Marble', 'png'), GIBS('VIIRS_CityLights_2012', 'png')], () => hn = 1);
  const farm = el.querySelector('.kx-farm'), sat = el.querySelector('.kx-sat'), ease = x => 1 - Math.pow(1 - x, 3);
  let W, H, dpr, cx, cy, R0, run = 1, ox = 0, oy = 0, drag = 0, lx = 0, ly = 0, idle = 0, mx = 0, my = 0, zT = 0, last = performance.now(); const t0 = last;
  const lay = () => {                                                              // globe dead-centre, farmer on its crown
    dpr = Math.min(devicePixelRatio || 1, 1.5); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; gl.viewport(0, 0, cv.width, cv.height);
    R0 = Math.min(H * .27, W * .38); cx = W / 2; cy = H * .57;
    const fh = R0 * .56, fw = fh * 220 / 230; farm.style.cssText = `height:${fh}px;width:${fw}px;left:${cx - .45 * fw}px;top:${cy - R0 - .891 * fh + 3}px`;
  };
  addEventListener('resize', lay); lay();
  addEventListener('pointermove', e => { mx = e.clientX / W - .5; my = e.clientY / H - .5; });
  cv.onpointerdown = e => { drag = 1; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; };
  cv.onpointermove = e => { if (!drag) return; ox -= (e.clientX - lx) * .004; oy = Math.max(-.45, Math.min(.45, oy + (e.clientY - ly) * .003)); lx = e.clientX; ly = e.clientY; idle = performance.now(); };
  cv.onpointerup = cv.onpointercancel = () => { drag = 0; idle = performance.now(); cv.style.cursor = ''; };
  const frame = now => {
    if (!run) return; requestAnimationFrame(frame);
    const T = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
    const ent = ease(Math.min(1, T / (RM ? .01 : 2.4)));
    let z = (.55 + .45 * ent) * (1 + .008 * Math.sin(T * .8)); if (zT) { const k = Math.min(1, (now - zT) / 1500); z *= 1 + 6 * k * k * (3 - 2 * k); }
    if (!drag && now - idle > 1500) oy *= .96;
    if (!RM) ox -= .11 * dt * (zT ? 6 : 1);                                         // natural west-to-east spin (about one turn a minute)
    const lam = 20 * DEG + ox, a = -.35 + oy, c = Math.cos(a), sn = Math.sin(a), cl = Math.cos(lam), sl = Math.sin(lam);   // M = Ry(lam)·Rx(a): north pole tilts toward us
    gl.uniform2f(u.R, cv.width, cv.height); gl.uniform2f(u.C, cx * dpr, (H - cy) * dpr); gl.uniform1f(u.S, R0 * z * dpr);
    gl.uniform2f(u.PX, -mx * 22 * dpr, my * 22 * dpr); gl.uniform1f(u.T, T); gl.uniform1f(u.HAS, has); gl.uniform1f(u.HN, hn); gl.uniform1f(u.GL, ent);
    gl.uniformMatrix3fv(u.M, false, [cl, 0, -sl, sl * sn, c, cl * sn, sl * c, -sn, cl * c]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const th = T * .5, ca = Math.cos(th), sa = Math.sin(th), rho = -.3;             // a small satellite orbits the globe
    const sx = cx + 1.34 * R0 * ca * Math.cos(rho) - .3 * R0 * sa * Math.sin(rho), sy = cy + 1.34 * R0 * ca * Math.sin(rho) + .3 * R0 * sa * Math.cos(rho);
    sat.style.transform = `translate(${sx}px,${sy}px) rotate(${-17 + ca * 6}deg) scale(${.8 + .35 * sa})`;
    sat.style.opacity = (sa < 0 && Math.hypot(sx - cx, sy - cy) < R0 * z) || zT || ent < 1 ? 0 : 1;
  };
  requestAnimationFrame(frame);
  return { zoom() { zT = performance.now(); }, geo: () => ({ cx, cy }), stop() { run = 0; const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } };
}

const SAT = `<svg class="kx-sat" viewBox="0 0 40 24" aria-hidden="true"><rect x="15" y="7" width="10" height="10" rx="2" fill="#dfe6ee"/><rect x="2" y="9" width="11" height="6" fill="#3b7ea1"/><rect x="27" y="9" width="11" height="6" fill="#3b7ea1"/><circle cx="20" cy="12" r="2" fill="#e6c66d"/></svg>`;
const FARM = `<svg class="kx-farm" viewBox="0 0 220 230" aria-hidden="true">
<path d="M20 218Q100 188 180 218Z" fill="#4f9a4a"/><path d="M20 218Q100 188 180 218" fill="none" stroke="#86cf6e" stroke-width="3"/>
<rect x="82" y="148" width="14" height="56" rx="6" fill="#6b4a2e"/><rect x="102" y="148" width="14" height="56" rx="6" fill="#6b4a2e"/>
<ellipse cx="86" cy="204" rx="11" ry="6" fill="#2b1d12"/><ellipse cx="111" cy="204" rx="11" ry="6" fill="#2b1d12"/>
<g class="bob"><path d="M76 112Q70 130 75 140" stroke="#f4ead2" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="75" cy="142" r="5" fill="#d39a68"/>
<rect x="78" y="100" width="42" height="56" rx="14" fill="#3c8a55"/><path d="M91 100L99 114L107 100Z" fill="#f4ead2"/><circle cx="99" cy="128" r="2.4" fill="#e6c66d"/><circle cx="99" cy="140" r="2.4" fill="#e6c66d"/>
<circle cx="79" cy="82" r="4.5" fill="#d39a68"/><circle cx="119" cy="82" r="4.5" fill="#d39a68"/><circle cx="99" cy="80" r="20" fill="#d39a68"/>
<circle cx="92" cy="82" r="2.4" fill="#2a1d14"/><circle cx="106" cy="82" r="2.4" fill="#2a1d14"/><path d="M91 90Q99 97 107 90" stroke="#2a1d14" stroke-width="2" stroke-linecap="round" fill="none"/>
<circle cx="86" cy="88" r="3.5" fill="#e58b6a" opacity=".55"/><circle cx="112" cy="88" r="3.5" fill="#e58b6a" opacity=".55"/>
<ellipse cx="99" cy="66" rx="37" ry="8" fill="#e6c66d" stroke="#c9a227" stroke-width="1.5"/><path d="M77 64Q79 38 99 38Q119 38 121 64Z" fill="#efd27d"/><path d="M77.5 58h43v6h-43z" fill="#c86446"/>
<g class="hoe"><path d="M96 114L123 133" stroke="#f4ead2" stroke-width="9" stroke-linecap="round"/><line x1="112" y1="112" x2="160" y2="198" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/>
<path d="M156 194L176 208L170 213L152 200Z" fill="#aeb8bf" stroke="#6d777e" stroke-width="1.5" stroke-linejoin="round"/><circle cx="123" cy="133" r="5.5" fill="#d39a68"/></g></g>
<g><circle class="puff" style="--dx:16px;--dy:-26px" cx="172" cy="208" r="3.5" fill="#6b4a2e"/><circle class="puff" style="--dx:30px;--dy:-14px" cx="172" cy="208" r="2.6" fill="#8a6a45"/><circle class="puff" style="--dx:-4px;--dy:-30px" cx="172" cy="208" r="3" fill="#6b4a2e"/><circle class="puff" style="--dx:24px;--dy:-34px" cx="172" cy="208" r="2" fill="#a07c52"/></g></svg>`;

function intro() {
  const hasEntered = sessionStorage.getItem('krishiniti_entered') === '1' || localStorage.getItem('krishiniti_entered') === '1';
  const hasHash = window.location.hash && window.location.hash !== '#' && window.location.hash !== '#welcome';
  const hasActiveScreen = sessionStorage.getItem('krishiniti-active-screen');
  if (hasEntered || hasHash || hasActiveScreen) {
    sessionStorage.setItem('krishiniti_entered', '1');
    return;
  }

  const el = document.createElement('div'); el.id = 'kx';
  el.innerHTML = `<canvas id="kx-gl"></canvas>
<div class="kx-title"><b>KRISHI<em>NITI</em></b><p data-t="From space data to crop decisions|अंतरिक्ष के आँकड़ों से फसल के निर्णय तक"></p></div>
${SAT}${FARM}
<div class="kx-bot"><button class="kx-enter" id="kx-enter"><span data-t="Enter KRISHINITI|KRISHINITI में प्रवेश करें"></span><i>→</i></button><small data-t="Drag the Earth · Built on NASA satellite data|पृथ्वी को घुमाइए · NASA उपग्रह डेटा पर आधारित"></small></div>
<canvas id="kx-grid"></canvas>`;
  document.body.appendChild(el); document.body.style.overflow = 'hidden'; tx(el);
  const E = safe(() => earth($('kx-gl'), el));
  if (!E) el.querySelector('.kx-sat').remove();
  const L = RM ? null : safe(() => lens($('kx-grid'), '190,225,255', () => !document.hidden));
  const finish = () => {
    sessionStorage.setItem('krishiniti_entered', '1');
    document.body.style.overflow = '';
    E && E.stop();
    L && L();
    el.remove();
    setTimeout(() => document.body.classList.remove('kx-open'), 1400);
  };
  let going = 0;
  const go = () => {                                                              // dive into the Earth, then an iris opens onto the site
    sessionStorage.setItem('krishiniti_entered', '1');
    if (going) return; going = 1;
    if (RM) return finish();
    el.classList.add('go'); E && E.zoom();
    setTimeout(() => {
      document.body.classList.add('kx-open');
      const g = E ? E.geo() : { cx: innerWidth / 2, cy: innerHeight / 2 }, max = Math.hypot(innerWidth, innerHeight) + 60, s0 = performance.now();
      const step = now => { const k = Math.min(1, (now - s0) / 1100), r = max * (1 - Math.pow(1 - k, 3));
        el.style.webkitMaskImage = el.style.maskImage = `radial-gradient(circle at ${g.cx}px ${g.cy}px,transparent ${r}px,#000 ${r + 3}px)`;
        k < 1 ? requestAnimationFrame(step) : finish(); };
      requestAnimationFrame(step);
    }, 900);
  };
  const b = $('kx-enter'); b.onclick = go;
  b.onpointermove = e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .12}px,${(e.clientY - r.top - r.height / 2) * .2}px)`; };
  b.onpointerleave = () => b.style.transform = '';
  addEventListener('keydown', e => { if (e.key === 'Escape' && $('kx')) go(); });
  b.focus({ preventScroll: true });
}

/* ================= 3. OVERVIEW BOARD: twelve widgets ================= */
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MH = ['जन.', 'फ़र.', 'मार्च', 'अप्रै.', 'मई', 'जून', 'जुल.', 'अग.', 'सित.', 'अक्टू.', 'नव.', 'दिस.'];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const PAL = ['#4d8b58', '#3b7ea1', '#e0562b', '#c9a227', '#7a5aa6', '#2f8a57', '#6f93b8'];
const CC = { paddy: '#2f7fc1', rice: '#2f7fc1', wheat: '#d9483b', maize: '#e8913a', corn: '#e8913a', mustard: '#d6b100', lentil: '#8a5a2b', vegetable: '#3f9a55', sugarcane: '#7a5aa6' };   // one colour per crop, everywhere
const cropCol = (c, i) => { const k = (c.id + ' ' + (c.shortName || '')).toLowerCase(), m = Object.keys(CC).find(x => k.includes(x)); return m ? CC[m] : PAL[i % 7]; };
// Sample climate; replaced by live NASA POWER values for your saved field as soon as the request succeeds.
let D = { rain: [11, 14, 9, 8, 31, 155, 310, 285, 215, 65, 7, 4], tmp: [16, 19, 25, 31, 33, 32, 29, 29, 29, 26, 21, 17], sun: [3.9, 4.9, 6, 6.8, 6.9, 5.9, 4.6, 4.6, 4.8, 5, 4.5, 3.8], live: 0, at: null };
const sel = { season: 0, m: 5, b: 7, s: -1 };
let host, cum = [], cr = [], save = 0, pad = [450, 700], ti = 0;
const fmt = n => Math.round(n).toLocaleString(hi() ? 'hi-IN' : 'en-IN');
const mon = i => (hi() ? MH : MN)[i];
const sum = (a, ix) => ix.reduce((s, k) => s + a[k], 0), avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const sp = a => { const lo = Math.min(...a), mx = Math.max(...a); return `<svg viewBox="0 0 200 64" preserveAspectRatio="none"><polyline pathLength="1" points="${a.map((v, i) => `${i / (a.length - 1) * 200},${58 - (v - lo) / ((mx - lo) || 1) * 52}`).join(' ')}"/></svg>`; };
const smooth = P => { let d = `M${P[0]}`; for (let i = 1; i < P.length - 1; i++) d += `Q${P[i]} ${(P[i][0] + P[i + 1][0]) / 2},${(P[i][1] + P[i + 1][1]) / 2}`; return d + `L${P[P.length - 1]}`; };
const lolli = () => { const ids = sel.season ? [6, 7, 8, 9, 10, 11] : [0, 1, 2, 3, 4, 5], mx = Math.max(...D.rain);
  return ids.map((k, j) => `<div class="lp${k === sel.m ? ' on' : ''}" data-m="${k}" style="--h:${Math.max(6, D.rain[k] / mx * 100)};--j:${j}"><div class="st"><i></i><b>${Math.round(D.rain[k])} mm</b></div><small>${mon(k)}</small></div>`).join(''); };
const SR = () => [['NP', 'NASA POWER', t('Daily climate since 1981|1981 से दैनिक जलवायु'), 'power.larc.nasa.gov'], ['SG', 'SoilGrids', t('Soil estimates at 250 m|250 मीटर पर मिट्टी का अनुमान'), 'rest.isric.org'], ['OM', 'Open-Meteo', t('7-day forecast|7-दिन का पूर्वानुमान'), 'api.open-meteo.com']];
const team = () => { const s = SR()[ti]; return [`<i>${s[0]}</i><div><b>${s[1]}</b><small>${s[2]}</small></div>`, `<em>API</em> ${s[3]}`]; };
const dot = () => { const u = $('kb-cd'); if (!u) return; const i = sel.b;
  u.style.left = i / 11 * 100 + '%'; u.style.top = (66 - cum[i] / cum[11] * 60) / 70 * 100 + '%';
  $('kb-bd').textContent = mon(i); $('kb-bv').innerHTML = `${fmt(cum[i])} <small>mm ${t('so far|अब तक')}</small>`; };

function render() {
  if (!host) return;
  const R = D.rain, ann = sum(R, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const win = (n, f) => { let b = 0, bi = 0; for (let s = 0; s < 12; s++) { let v = 0; for (let k = 0; k < n; k++) v += R[(s + k) % 12]; if (!s || f(v, b)) { b = v; bi = s; } } return [b, bi]; };
  const [w3, w3s] = win(3, (v, b) => v > b), [d6] = win(6, (v, b) => v < b), pc = Math.round(w3 / ann * 100);   // wettest 3 months, driest 6 months
  const qs = [0, 1, 2, 3].map(q => sum(R, [q * 3, q * 3 + 1, q * 3 + 2])), qd = qs.indexOf(Math.min(...qs));
  const DB = typeof KRISHINITI_CROP_DATABASE !== 'undefined' ? KRISHINITI_CROP_DATABASE : [];   // your engine's own crop table
  const need = (id, d) => (DB.find(c => c.id === id) || {}).waterRequirementMm || d;
  pad = need('paddy', [450, 700]); const len = need('lentils', [150, 200]), wh = need('wheat', [250, 350]);
  save = Math.round(((pad[0] + pad[1]) - (len[0] + len[1])) / 2);
  const cover = Math.min(100, Math.round(d6 / ((wh[0] + wh[1]) / 2) * 100));
  cr = DB.map((c, i) => ({ n: c.shortName || c.id, e: (c.waterRequirementMm[0] + c.waterRequirementMm[1]) / 2, col: cropCol(c, i) }));
  let a = 0; cum = R.map(v => a += v);
  const P = prof(), name = P && P.farm && P.farm.name;
  const tmax = Math.max(...D.tmp), tmi = D.tmp.indexOf(tmax);
  const cp = cum.map((v, i) => [i / 11 * 220, 66 - v / cum[11] * 60]);
  const mxs = [[t('Jan–Mar|जन.–मार्च'), qs[0]], [t('Apr–Jun|अप्रै.–जून'), qs[1]], [t('Jul–Sep|जुल.–सित.'), qs[2]], [t('Oct–Dec|अक्टू.–दिस.'), qs[3]]];
  const tot = qs[0] + qs[1] + qs[2] + qs[3], ts = team();
  host.innerHTML = `
<div class="kb-head"><div><h2>${t('Climate at a glance|जलवायु, एक नज़र में')}</h2><p>${t('Why farms are shifting, and what KRISHINITI does about it.|खेत क्यों बदल रहे हैं, और KRISHINITI इसके लिए क्या करता है।')}</p></div>
<span class="kb-src ${D.live ? 'live' : ''}">${D.live ? t('Live · NASA POWER|लाइव · NASA POWER') : t('Sample climate · mark your field for live NASA POWER data|नमूना जलवायु · लाइव NASA POWER डेटा के लिए अपना खेत चिह्नित करें')}</span></div>
<div class="kb-g">
<article class="kb-w w1" style="--i:0"><h3>${t('Your field|आपका खेत')}</h3><div class="kb-ring"><div class="orb"><i>🛰</i></div><div class="orb o2"><i>💧</i></div><div class="orb o3"><i>☁</i></div><div class="kb-av">🌾</div></div><p class="kb-sub">${name || t('No field marked yet|अभी कोई खेत चिह्नित नहीं')}</p></article>
<article class="kb-w w2" style="--i:1"><div class="kb-t"><h3>${t('Rainfall|वर्षा')}</h3><select id="kb-ss" aria-label="${t('Season|मौसम')}"><option value="0">${t('Jan–Jun|जन.–जून')}</option><option value="1" ${sel.season ? 'selected' : ''}>${t('Jul–Dec|जुल.–दिस.')}</option></select></div><div class="kb-lp" id="kb-lp">${lolli()}</div></article>
<article class="kb-w w3" style="--i:2"><div class="kb-t"><h3>${t('Shift a crop|फसल बदलें')}</h3></div>
<div class="kb-row pick"><span class="dot"></span>${t('Paddy|धान')}<b>${pad[0]}–${pad[1]} mm</b></div><div class="kb-row"><span class="dot b"></span>${t('Lentils|मसूर')}<b>${len[0]}–${len[1]} mm</b></div>
<p class="kb-res" id="kb-res">${t('Compare water need before you plant.|बोने से पहले पानी की ज़रूरत की तुलना करें।')}</p>
<div class="kb-bt"><button class="kb-b g" data-act="keep">${t('Keep paddy|धान रखें')}</button><button class="kb-b o" data-act="shift">${t('Shift to lentils|मसूर अपनाएँ')}</button></div></article>
<article class="kb-w w4" style="--i:3"><div class="kb-t"><h3>${t('Data sources|डेटा स्रोत')}</h3><span class="kb-chip">+3</span></div><div class="kb-tm" id="kb-tm">${ts[0]}</div><div class="kb-card" id="kb-api">${ts[1]}</div><button class="kb-b o wide" data-go="map">+ ${t('Select farm|खेत चुनें')}</button></article>
<article class="kb-w w5" style="--i:4"><div class="kb-t"><h3>${t('Annual rain|वार्षिक वर्षा')}</h3></div><div class="kb-big"><small>${t('Total|कुल')}</small>${fmt(ann)}<em>mm</em><span class="kb-chip">${pc}% ${t('in the wettest 3 months|सबसे गीले 3 महीनों में')}</span></div><div class="kb-bar"><i style="--p:${pc}%"></i></div><div class="kb-ft"><span>${D.at ? D.at.lat.toFixed(2) + '°, ' + D.at.lng.toFixed(2) + '°' : t('Sample climate|नमूना जलवायु')}</span><b>NASA POWER</b></div></article>
<div class="kb-st"><button class="kb-w kb-cta" style="--i:5" data-go="start"><i>+</i><b>${t('Mark your field|अपना खेत चिह्नित करें')}</b></button><button class="kb-w kb-dk" style="--i:6" data-go="analysis"><i>↓</i><b>${t('Land report|भूमि रिपोर्ट')}</b></button></div>
<article class="kb-w w8" style="--i:7"><div class="kb-t"><h3>${t('Sunlight|धूप')}</h3><span class="kb-ic o">☀</span></div><div class="kb-sp o">${sp(D.sun)}</div><div class="kb-v"><u>▲</u>${avg(D.sun).toFixed(1)} <small>kWh/m²/${t('day|दिन')}</small></div></article>
<article class="kb-w w9" style="--i:8"><div class="kb-t"><h3>${t('Temperature|तापमान')}</h3><span class="kb-ic">°</span></div><div class="kb-sp">${sp(D.tmp)}</div><div class="kb-v"><u>▲</u>${tmax.toFixed(0)}°C <small>${t('peak in|उच्चतम')} ${mon(tmi)}</small></div></article>
<article class="kb-w w10" style="--i:9"><div class="kb-t"><h3>${t('Rain bank|वर्षा जमा')}</h3><button class="kb-ic" data-act="rb" aria-label="${t('Reset|रीसेट')}">↻</button></div><span class="kb-date" id="kb-bd"></span><div class="kb-cv" id="kb-cv"><svg viewBox="0 0 220 70" preserveAspectRatio="none"><path d="${smooth(cp)}"/></svg><u id="kb-cd"></u></div><div class="kb-v" id="kb-bv"></div></article>
<article class="kb-w w11" style="--i:10"><div class="kb-t"><h3>${t('Crop water demand|फसल की पानी की माँग')}</h3><span class="kb-chip o" id="kb-cb">${cr.length}</span></div><div class="kb-av2">${cr.map((c, i) => `<em style="background:${c.col}">${c.n.slice(0, 2)}</em>`).join('')}</div><div class="kmx">${cr.map((c, i) => { const l = c.e < 260 ? 1 : c.e < 500 ? 2 : 3; return `<div class="kc" data-i="${i}" style="--c:${c.col}">${[3, 2, 1].map(k => `<b class="${l >= k ? 'on' : ''}"></b>`).join('')}</div>`; }).join('')}</div></article>
<article class="kb-w w12" style="--i:11"><div class="kb-t"><h3>${t('Rain by season|मौसमवार वर्षा')}</h3><span class="kb-chip o">${mon(w3s)}–${mon((w3s + 2) % 12)} · ${pc}%</span></div>
<div class="kb-ms">${mxs.map((m, i) => `<div data-s="${i}"><small>${m[0]}</small><b>${fmt(m[1])} mm</b></div>`).join('')}</div>
<div class="kb-mx" id="kb-mx">${mxs.map((m, i) => `<i class="${(sel.s < 0 ? qd : sel.s) === i ? 'a' : ''}" style="flex:${Math.max(m[1], tot * .14)}"></i>`).join('')}</div>
<div class="kb-ft2"><span class="kb-ic dk">↑</span><span>${t('Rain in the 6 driest months covers|सबसे सूखे 6 महीनों की वर्षा गेहूँ की ज़रूरत का')} <b>${cover}%</b> ${t('of wheat’s water need|हिस्सा पूरा करती है')}</span><button class="kb-b o" data-go="analysis">${t('Plan a shift|बदलाव की योजना')}</button></div></article>
</div>`;
  dot();
}

async function live() {
  const c = prof() && prof().field && prof().field.center; if (!c) return;   // no saved field yet: keep the sample climate
  const u = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=PRECTOTCORR,T2M,ALLSKY_SFC_SW_DWN&community=AG&longitude=${c.lng}&latitude=${c.lat}&format=JSON`;
  const p = (await (await fetch(u)).json()).properties.parameter, ks = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const g = k => ks.map(m => p[k][m]), r = g('PRECTOTCORR'), tm = g('T2M'), s = g('ALLSKY_SFC_SW_DWN');
  if ([...r, ...tm, ...s].some(v => !(v > -99))) return;          // POWER uses -999 for missing values
  D = { rain: r.map((v, i) => v * DAYS[i]), tmp: tm, sun: s, live: 1, at: c }; render();
}

function board() {
  const hero = document.querySelector('#welcome-screen .hero'); if (!hero) return;
  host = document.createElement('section'); host.id = 'kb'; host.className = 'kb'; hero.after(host); render();
  host.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) { const k = g.dataset.go; const b = k === 'start' ? $('start-button') : document.querySelector(`[data-screen=${k}]`); if (b) b.click(); return; }
    const a = e.target.closest('[data-act]'); if (a) {
      const r = $('kb-res'), rows = host.querySelectorAll('.kb-row');
      if (a.dataset.act === 'shift') { r.textContent = t(`Saves about ${save} mm of water per season.|हर सीज़न लगभग ${save} मिमी पानी की बचत।`); rows[0].classList.remove('pick'); rows[1].classList.add('pick'); }
      else if (a.dataset.act === 'keep') { r.textContent = t(`Paddy needs ${pad[0]}–${pad[1]} mm each season.|धान को हर सीज़न ${pad[0]}–${pad[1]} मिमी पानी चाहिए।`); rows[1].classList.remove('pick'); rows[0].classList.add('pick'); }
      else { sel.b = 7; dot(); }
      return; }
    const l = e.target.closest('.lp'); if (l) { sel.m = +l.dataset.m; host.querySelectorAll('.lp').forEach(x => x.classList.toggle('on', x === l)); }
  });
  host.addEventListener('change', e => { if (e.target.id === 'kb-ss') { sel.season = +e.target.value; sel.m = sel.season ? 8 : 5; $('kb-lp').innerHTML = lolli(); } });
  host.addEventListener('pointerover', e => {
    const l = e.target.closest('.lp'); if (l) { sel.m = +l.dataset.m; host.querySelectorAll('.lp').forEach(x => x.classList.toggle('on', x === l)); }
    const kc = e.target.closest('.kc'), cb = $('kb-cb'); if (cb) { const c = kc && cr[+kc.dataset.i]; cb.textContent = c ? `${c.n} · ${Math.round(c.e)} mm` : cr.length; cb.style.color = c ? c.col : ''; cb.style.background = c ? c.col + '22' : ''; }
    const s = e.target.closest('[data-s]'); if (s) { sel.s = +s.dataset.s; host.querySelectorAll('#kb-mx i').forEach((x, i) => x.classList.toggle('a', i === sel.s)); }
  });
  host.addEventListener('pointermove', e => {
    const cv = e.target.closest('#kb-cv'); if (!cv) return;
    const r = cv.getBoundingClientRect(); sel.b = Math.max(0, Math.min(11, Math.round((e.clientX - r.left) / r.width * 11))); dot();
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { host.classList.add('in'); setTimeout(() => host.classList.add('done'), 1700); io.disconnect(); } }, { threshold: .12 });
    io.observe(host);
  } else host.classList.add('in', 'done');
  if (!RM) setInterval(() => { const e = $('kb-tm'); if (!e || document.hidden) return; e.classList.add('f'); setTimeout(() => { ti = (ti + 1) % 3; const s = team(); e.innerHTML = s[0]; $('kb-api').innerHTML = s[1]; e.classList.remove('f'); }, 300); }, 3200);
  const nav = document.querySelector('[data-screen=welcome]');       // refresh with the saved field when returning to Overview
  if (nav) nav.addEventListener('click', () => { const c = prof() && prof().field && prof().field.center; if (c && (!D.at || D.at.lat !== c.lat)) safe(live); });
  live().catch(e => console.warn('[krishiniti-space] NASA POWER unavailable, showing sample data', e));
}

/* ================= 4. HERO TILT: the original hero art leans toward the pointer ================= */
function tilt() {
  const hv = document.querySelector('.hero-visual'); if (!hv || RM) return;
  hv.style.transition = 'transform .25s ease-out';
  hv.addEventListener('pointermove', e => { const r = hv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; hv.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`; });
  hv.addEventListener('pointerleave', () => hv.style.transform = '');
}

/* ================= 4. LIFE: fluid ambient layer · 3D step story · farm-life mascot · revolving crop ring · board tilt ================= */
const go2 = k => { const b = k === 'start' ? $('start-button') : document.querySelector('[data-screen=' + k + ']'); if (b) b.click(); };
const PL = x => `<g transform="translate(${x} 309)"><ellipse cx="0" cy="1" rx="12" ry="4" fill="#5a4028"/><g class="plg"><path d="M0 0V-34" stroke="#4d8b58" stroke-width="3" stroke-linecap="round"/><ellipse cx="-6" cy="-18" rx="7" ry="3.2" transform="rotate(-35 -6 -18)" fill="#4d8b58"/><ellipse cx="6" cy="-26" rx="7" ry="3.2" transform="rotate(35 6 -26)" fill="#6fb36a"/><ellipse class="ear" cx="0" cy="-41" rx="3.6" ry="9" fill="#e6c66d"/></g></g>`;
const FM = `<svg class="kv-fm c-hoe" viewBox="0 0 300 340" aria-hidden="true">
<g class="sun"><circle cx="56" cy="46" r="26" fill="#e6c66d" opacity=".22"/><circle cx="56" cy="46" r="17" fill="#e6c66d"/></g>
<g class="cl"><ellipse cx="200" cy="54" rx="30" ry="9" fill="#fff" opacity=".9"/><ellipse cx="220" cy="47" rx="20" ry="9" fill="#fff" opacity=".9"/></g>
<path d="M0 312Q150 304 300 312V340H0Z" fill="#7a5a38"/><path d="M0 312Q150 304 300 312" fill="none" stroke="#5aa653" stroke-width="9" stroke-linecap="round"/>
<path d="M30 326Q150 316 270 326M30 336Q150 328 270 336" stroke="#5a4028" stroke-width="3" fill="none" opacity=".45"/>
${[184, 218, 252].map(PL).join('')}
<g class="bsk"><path d="M14 288h44l-6 22H20z" fill="#b07a3a"/><path d="M14 288h44" stroke="#8a5a2b" stroke-width="3"/><ellipse cx="26" cy="285" rx="3.5" ry="9" fill="#e6c66d"/><ellipse cx="36" cy="283" rx="3.5" ry="9" fill="#e6c66d"/><ellipse cx="46" cy="285" rx="3.5" ry="9" fill="#e6c66d"/></g>
<g transform="translate(-10 105)">
<rect x="82" y="148" width="14" height="56" rx="6" fill="#6b4a2e"/><rect x="102" y="148" width="14" height="56" rx="6" fill="#6b4a2e"/>
<ellipse cx="86" cy="204" rx="11" ry="6" fill="#2b1d12"/><ellipse cx="111" cy="204" rx="11" ry="6" fill="#2b1d12"/>
<g class="bob"><path d="M76 112Q70 130 75 140" stroke="#f4ead2" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="75" cy="142" r="5" fill="#d39a68"/>
<rect x="78" y="100" width="42" height="56" rx="14" fill="#3c8a55"/><path d="M91 100L99 114L107 100Z" fill="#f4ead2"/><circle cx="99" cy="128" r="2.4" fill="#e6c66d"/><circle cx="99" cy="140" r="2.4" fill="#e6c66d"/>
<circle cx="79" cy="82" r="4.5" fill="#d39a68"/><circle cx="119" cy="82" r="4.5" fill="#d39a68"/><circle cx="99" cy="80" r="20" fill="#d39a68"/>
<circle cx="92" cy="82" r="2.4" fill="#2a1d14"/><circle cx="106" cy="82" r="2.4" fill="#2a1d14"/><path d="M91 90Q99 97 107 90" stroke="#2a1d14" stroke-width="2" stroke-linecap="round" fill="none"/>
<circle cx="86" cy="88" r="3.5" fill="#e58b6a" opacity=".55"/><circle cx="112" cy="88" r="3.5" fill="#e58b6a" opacity=".55"/>
<ellipse cx="99" cy="66" rx="37" ry="8" fill="#e6c66d" stroke="#c9a227" stroke-width="1.5"/><path d="M77 64Q79 38 99 38Q119 38 121 64Z" fill="#efd27d"/><path d="M77.5 58h43v6h-43z" fill="#c86446"/>
<g class="arm"><path d="M96 114L123 133" stroke="#f4ead2" stroke-width="9" stroke-linecap="round"/>
<g class="t t-hoe"><line x1="112" y1="112" x2="160" y2="198" stroke="#8a5a2b" stroke-width="5" stroke-linecap="round"/><path d="M156 194L176 208L170 213L152 200Z" fill="#aeb8bf" stroke="#6d777e" stroke-width="1.5" stroke-linejoin="round"/></g>
<g class="t t-can"><g class="can"><rect x="114" y="122" width="30" height="22" rx="5" fill="#3b7ea1"/><path d="M114 128Q104 130 106 140" stroke="#2c6382" stroke-width="3" fill="none"/><path d="M144 128L168 112" stroke="#3b7ea1" stroke-width="4" stroke-linecap="round"/><rect x="164" y="104" width="10" height="9" rx="2" transform="rotate(-35 169 108)" fill="#2c6382"/></g></g>
<g class="t t-wheat"><path d="M123 133L131 92" stroke="#c9a227" stroke-width="2.5"/><ellipse cx="132" cy="86" rx="4" ry="11" fill="#e6c66d" transform="rotate(10 132 86)"/><ellipse cx="126" cy="90" rx="3.2" ry="9" fill="#efd27d" transform="rotate(-14 126 90)"/></g>
<g class="t t-tab"><g class="tab"><rect x="122" y="98" width="26" height="34" rx="4" fill="#1c2a20"/><rect x="125.5" y="101.5" width="19" height="25" rx="2" fill="#8fd18c"/></g></g>
<circle cx="123" cy="133" r="5.5" fill="#d39a68"/></g></g></g>
<g class="seeds">${[0, 1, 2, 3].map(i => `<circle cx="${128 + i * 3}" cy="236" r="2.2" fill="#8a5a2b" style="--dx:${30 + i * 14}px;animation-delay:${i * .18}s"/>`).join('')}</g>
<g class="drops">${[0, 1, 2].map(i => `<circle cx="${160 + i * 6}" cy="224" r="2.6" fill="#7fb8d8" style="animation-delay:${i * .35}s"/>`).join('')}</g>
<g class="satg"><g transform="translate(204 96)"><g class="satb"><rect x="-6" y="-6" width="12" height="12" rx="2" fill="#dfe6ee"/><rect x="-20" y="-3" width="12" height="6" fill="#3b7ea1"/><rect x="8" y="-3" width="12" height="6" fill="#3b7ea1"/></g></g><path class="beam" d="M204 104L126 184" stroke="#8fd18c" stroke-width="2" stroke-dasharray="4 6" fill="none"/></g>
</svg>`;
// [title, text, screen, chore, mascot line]
const ST = [
  ['Mark your field|अपना खेत चिह्नित करें', 'Pick your plot on the map. Everything that follows is read for that exact place.|नक्शे पर अपना खेत चुनिए। आगे का सब कुछ उसी जगह के लिए पढ़ा जाता है।', 'map', 'hoe', 'First, we prepare the ground…|पहले ज़मीन तैयार करते हैं…'],
  ['Describe your farm|अपने खेत के बारे में बताइए', 'Add your crops, soil and water so the plan fits the way you really farm.|फसलें, मिट्टी और पानी की जानकारी दीजिए ताकि योजना आपकी असली खेती से मेल खाए।', 'details', 'sow', 'Your details are the seeds…|आपकी जानकारी ही बीज है…'],
  ['Read the sky and soil|आसमान और मिट्टी को पढ़िए', 'NASA POWER climate, SoilGrids soil and Open-Meteo forecasts are pulled in for your place.|आपके स्थान के लिए NASA POWER की जलवायु, SoilGrids की मिट्टी और Open-Meteo का पूर्वानुमान लाया जाता है।', 'analysis', 'tablet', 'Reading NASA data for you…|आपके लिए NASA का डेटा पढ़ रहा हूँ…'],
  ['Compare crop plans|फसल योजनाओं की तुलना करें', 'See which crop fits your field now, and how it holds up when the seasons shift.|देखिए अभी कौन-सी फसल आपके खेत के लिए ठीक है, और मौसम बदलने पर वह कैसी टिकती है।', 'analysis', 'harvest', 'Time to reap a good plan!|अच्छी योजना की फसल काटने का समय!']
];
const CS = { hoe: 'Loosening the soil…|मिट्टी ढीली कर रहा हूँ…', sow: 'Sowing seeds…|बीज बो रहा हूँ…', water: 'Watering the crop…|फसल को पानी दे रहा हूँ…', harvest: 'Harvest time!|कटाई का समय!', tablet: 'Checking the satellite data…|उपग्रह का डेटा देख रहा हूँ…' };
const CH = ['hoe', 'tablet', 'sow', 'water', 'harvest'];

function life() {
  const ws = $('welcome-screen'), hero = ws && ws.querySelector('.hero'); if (!hero) return;
  const DB = typeof KRISHINITI_CROP_DATABASE !== 'undefined' ? KRISHINITI_CROP_DATABASE : [];
  /* a) whole-site fluid layer: drifting colour blobs, falling leaves, scroll progress, soft reveal */
  const kf = document.createElement('div'); kf.id = 'kf';
  kf.innerHTML = '<b></b><b></b><b></b>' + Array.from({ length: 7 }, (_, i) => `<i style="left:${6 + i * 14}%;animation-duration:${24 + i * 3}s;animation-delay:${-i * 4.3}s"></i>`).join('');
  const kp = document.createElement('div'); kp.id = 'kp'; document.body.append(kf, kp);
  let pk = 0; addEventListener('pointermove', e => { if (pk) return; pk = requestAnimationFrame(() => { pk = 0; kf.style.setProperty('--px', e.clientX / innerWidth - .5); kf.style.setProperty('--py', e.clientY / innerHeight - .5); }); });
  const prog = () => kp.style.setProperty('--p', scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
  addEventListener('scroll', prog, { passive: true }); prog();
  if ('IntersectionObserver' in window && !RM) {
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('kv-v'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.feature-card,.section-intro,.page-heading,.panel').forEach(n => { n.classList.add('kv-r'); io.observe(n); });
    document.body.classList.add('kv-on');
  }
  /* b) the step story (3D drum that tilts with scroll) + crop ring */
  const n = DB.length, stp = 360 / (n || 1), rad = n > 2 ? Math.round(80 / Math.tan(Math.PI / n)) + 40 : 160;
  const nm = c => c.shortName || c.id;
  const kv = document.createElement('section'); kv.id = 'kv'; kv.className = 'kv';
  kv.innerHTML = `<div class="kv-head"><h2 data-t="How KRISHINITI works|KRISHINITI कैसे काम करता है"></h2><p data-t="Four steps from your field to a crop plan. Our farmer shows the way.|आपके खेत से फसल योजना तक चार कदम। हमारा किसान रास्ता दिखाता है।"></p></div>
<div class="kv-steps">${ST.map((s, i) => `<article class="kv-s" data-i="${i}"><div class="kv-viz v${i}"><i></i><i></i><i></i></div><div class="kv-b"><span class="kv-n">${i + 1}</span><h3 data-t="${s[0]}"></h3><p data-t="${s[1]}"></p><button class="kv-go" data-go="${s[2]}"><span data-t="Open|खोलें"></span> →</button></div></article>`).join('')}</div>
${n ? `<div class="kv-ringwrap"><div class="kv-rh"><h3 data-t="Crops that revolve around your field|आपके खेत के चारों ओर घूमती फसलें"></h3><p data-t="Drag to spin. Each card shows the water a crop needs in a season.|घुमाने के लिए खींचिए। हर कार्ड बताता है कि फसल को एक सीज़न में कितना पानी चाहिए।"></p></div>
<div class="kv-scene"><div class="kv-core">🌱</div><div class="kv-ring" id="kv-ring">${DB.map((c, i) => `<div class="kv-p" style="--a:${i * stp}deg;--r:${rad}px;--c:${cropCol(c, i)}"><em style="background:${cropCol(c, i)}">${nm(c).slice(0, 2)}</em><b>${nm(c)}</b><small>${c.waterRequirementMm[0]}–${c.waterRequirementMm[1]} mm</small></div>`).join('')}</div></div></div>` : ''}`;
  hero.after(kv); tx(kv);
  kv.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) go2(g.dataset.go); });
  /* c) the mascot lives at the left of the viewport and works while you read */
  const farm = document.createElement('div'); farm.className = 'kv-farmer'; farm.innerHTML = FM + '<div class="kv-say"></div>'; document.body.appendChild(farm);
  const svg = farm.querySelector('svg'), say = farm.querySelector('.kv-say');
  let ci = 0, pinT = 0, act = -1;
  const speak = k => { say.classList.add('f'); setTimeout(() => { say.dataset.k = k; say.textContent = t(k); say.classList.remove('f'); }, 220); };
  const chore = (c, line) => { ci = CH.indexOf(c); svg.setAttribute('class', 'kv-fm c-' + c); speak(line || CS[c]); };
  chore('hoe');
  setInterval(() => { if (document.hidden || !farm.classList.contains('on') || Date.now() - pinT < 9000) return; chore(CH[(ci + 1) % CH.length]); }, 7000);
  new IntersectionObserver(es => es.forEach(x => farm.classList.toggle('on', x.isIntersecting)), { rootMargin: '-10% 0px -10% 0px' }).observe(kv);
  const cards = [...kv.querySelectorAll('.kv-s')];
  let busy = 0;
  const upd = () => { busy = 0; if (!kv.offsetParent) return; let best = 0, bd = 9;
    cards.forEach((c, i) => { const r = c.getBoundingClientRect(), d = (r.top + r.height / 2 - innerHeight / 2) / innerHeight, a = Math.abs(d);
      c.style.setProperty('--rx', (-Math.max(-1.2, Math.min(1.2, d)) * 16).toFixed(1) + 'deg'); c.style.setProperty('--s', (1 - Math.min(a, 1) * .06).toFixed(3)); c.style.setProperty('--o', Math.max(.55, 1 - a * .4).toFixed(2));
      if (a < bd) { bd = a; best = i; } });
    cards.forEach((c, i) => c.classList.toggle('on', i === best && bd < .45));
    if (bd < .45 && best !== act) { act = best; pinT = Date.now(); chore(ST[best][3], ST[best][4]); } };
  const sched = () => { if (!busy) { busy = 1; requestAnimationFrame(upd); } };
  addEventListener('scroll', sched, { passive: true }); addEventListener('resize', sched); sched();
  /* d) revolving crop ring: auto-spins, drag to turn, side cards fade */
  const ring = $('kv-ring');
  if (ring) {
    const ps = [...ring.children], sc = ring.parentNode; let ang = 0, vel = 0, dr = 0, lx = 0, on = 0, last = performance.now();
    new IntersectionObserver(es => es.forEach(x => on = x.isIntersecting)).observe(sc);
    sc.onpointerdown = e => { dr = 1; lx = e.clientX; sc.setPointerCapture(e.pointerId); sc.style.cursor = 'grabbing'; };
    sc.onpointermove = e => { if (!dr) return; vel = (e.clientX - lx) * .35; ang += vel; lx = e.clientX; };
    sc.onpointerup = sc.onpointercancel = () => { dr = 0; sc.style.cursor = ''; };
    const tick = now => { requestAnimationFrame(tick); const dt = Math.min(.05, (now - last) / 1000); last = now; if (!on || document.hidden) return;
      if (!dr) { ang += (RM ? 0 : 9) * dt + vel; vel *= .94; }
      ring.style.transform = `rotateX(-14deg) rotateY(${ang}deg)`;
      ps.forEach((p, i) => p.style.opacity = (.3 + .7 * Math.max(0, Math.cos((ang + i * stp) * DEG))).toFixed(2)); };
    requestAnimationFrame(tick);
  }
  new MutationObserver(() => safe(() => { tx(kv); if (say.dataset.k) say.textContent = t(say.dataset.k); })).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

/* ================= 5. BOARD TILT: each widget leans toward the pointer with a soft glare ================= */
function boardTilt() {
  const h = $('kb'); if (!h || RM) return;
  h.addEventListener('pointermove', e => { const w = e.target.closest('.kb-w'); if (!w) return; const r = w.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    w.style.setProperty('--ry', ((x - .5) * 12).toFixed(1) + 'deg'); w.style.setProperty('--rx', ((.5 - y) * 10).toFixed(1) + 'deg'); w.style.setProperty('--mx', x * 100 + '%'); w.style.setProperty('--my', y * 100 + '%'); });
  h.addEventListener('pointerout', e => { const w = e.target.closest('.kb-w'); if (w && !w.contains(e.relatedTarget)) { w.style.setProperty('--rx', '0deg'); w.style.setProperty('--ry', '0deg'); } });
}

/* ================= 6. HERO: the old upper half is replaced by a living 3D farm diorama (same text, same data) ================= */
const SV = (w, h, vb, body) => `<svg width="${w}" height="${h}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const S_WHEAT = SV(26, 38, '0 0 30 44', '<path d="M15 44V12M9 44V18M21 44V16" stroke="#8a9a3f" stroke-width="1.6" fill="none"/><g fill="#e6c66d"><ellipse cx="15" cy="8" rx="3.4" ry="8"/><ellipse cx="9" cy="14" rx="3" ry="7"/><ellipse cx="21" cy="12" rx="3" ry="7.5"/></g>');
const S_CROP = SV(28, 38, '0 0 30 42', '<path d="M15 40V18" stroke="#3f7d47" stroke-width="2.4"/><ellipse cx="9" cy="24" rx="8" ry="4" transform="rotate(-30 9 24)" fill="#4d8b58"/><ellipse cx="21" cy="19" rx="8" ry="4" transform="rotate(30 21 19)" fill="#6fb36a"/><ellipse cx="15" cy="13" rx="4" ry="8" fill="#5aa653"/>');
const S_TREE = SV(58, 78, '0 0 60 80', '<rect x="27" y="48" width="6" height="30" rx="2" fill="#6b4a2e"/><circle cx="30" cy="34" r="22" fill="#4d8b58"/><circle cx="17" cy="46" r="14" fill="#3f7d47"/><circle cx="43" cy="46" r="14" fill="#5aa653"/><circle cx="24" cy="26" r="8" fill="#8fd18c" opacity=".5"/>');
const S_MILL = SV(80, 140, '0 0 80 140', '<path d="M26 136L34 54H46L54 136Z" fill="#efe5cf" stroke="#c9bba0" stroke-width="1.5"/><path d="M30 54L40 38L50 54Z" fill="#c86446"/><rect x="36" y="112" width="8" height="24" rx="3" fill="#8a5a2b"/><g class="mb"><rect x="38" y="4" width="4" height="42" rx="1" fill="#8a5a2b"/><rect x="42" y="6" width="13" height="17" fill="#fff" opacity=".92"/><rect x="38" y="46" width="4" height="42" rx="1" fill="#8a5a2b" transform="rotate(180 40 46)"/><rect x="26" y="69" width="13" height="17" fill="#fff" opacity=".92"/><rect x="-2" y="44" width="42" height="4" rx="1" fill="#8a5a2b" transform="translate(2 0)"/><rect x="40" y="44" width="42" height="4" rx="1" fill="#8a5a2b"/><rect x="58" y="48" width="17" height="13" fill="#fff" opacity=".92"/><rect x="7" y="31" width="17" height="13" fill="#fff" opacity=".92"/></g><circle cx="40" cy="46" r="5" fill="#c9a227"/>');
const S_TRK = SV(92, 62, '0 0 90 60', '<rect x="26" y="22" width="40" height="18" rx="4" fill="#c86446"/><rect x="52" y="26" width="26" height="14" rx="3" fill="#d9774f"/><rect x="30" y="6" width="22" height="18" rx="3" fill="#fff" opacity=".92" stroke="#c9bba0"/><rect x="72" y="14" width="3" height="14" fill="#444"/><g class="wh"><circle cx="30" cy="44" r="14" fill="#1c2a20"/><circle cx="30" cy="44" r="6" fill="#e6c66d"/><path d="M30 32V56M18 44H42" stroke="#e6c66d" stroke-width="1.6"/></g><g class="wh"><circle cx="74" cy="50" r="9" fill="#1c2a20"/><circle cx="74" cy="50" r="4" fill="#e6c66d"/><path d="M74 42V58M66 50H82" stroke="#e6c66d" stroke-width="1.4"/></g>');
const S_CLOUD = SV(120, 58, '0 0 120 60', '<g fill="#fff"><ellipse cx="40" cy="40" rx="30" ry="16"/><ellipse cx="70" cy="32" rx="30" ry="20"/><ellipse cx="96" cy="42" rx="22" ry="13"/></g>');
const S_SPR = SV(90, 110, '0 0 80 100', '<path d="M4 98Q40 64 76 98Z" fill="#8a4f3a"/><g class="spr"><path d="M40 84C40 66 40 52 40 38" stroke="#5aa653" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M40 56C22 56 12 44 12 30C30 30 40 40 40 56Z" fill="#8bd450"/><path d="M40 46C58 46 68 34 68 20C50 20 40 30 40 46Z" fill="#6fb82f"/></g>');
const S_SAT = SV(44, 26, '0 0 40 24', '<rect x="15" y="7" width="10" height="10" rx="2" fill="#dfe6ee"/><rect x="2" y="9" width="11" height="6" fill="#3b7ea1"/><rect x="27" y="9" width="11" height="6" fill="#3b7ea1"/><circle cx="20" cy="12" r="2" fill="#e6c66d"/>');

function hero3d() {
  const ws = $('welcome-screen'), hero = ws && ws.querySelector('.hero'), hv = hero && hero.querySelector('.hero-visual'); if (!hv) return;
  const keep = ['.visual-top', '.visual-note', '.visual-index'].map(s => hv.querySelector(s)).filter(Boolean);   // original text + data nodes are moved, not rewritten
  const bb = (x, y, inner, cls = '', st = '') => `<div class="bb ${cls}" style="--x:${x}px;--y:${y}px;${st}">${inner}</div>`;
  const fl = (x, y, w, h, cls) => `<i class="fl ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></i>`;
  const slabs = Array.from({ length: 10 }, (_, i) => `<i class="h3-sl" style="--z:${(i * 3.4).toFixed(1)}px;background:${i < 6 ? `hsl(28 ${40 + i * 2}% ${14 + i * 3.2}%)` : i < 9 ? `hsl(130 34% ${24 + (i - 6) * 4}%)` : 'radial-gradient(circle at 40% 35%,#7fbf72,#5e9a61 72%)'}"></i>`).join('');
  let wheat = '', crops = '';
  [-150, -115, -80, -45].forEach((x, a) => [-135, -100, -65].forEach((y, b) => { wheat += bb(x, y, S_WHEAT, 'sw', `--d:${2.6 + (a + b) % 3 * .5}s;--dl:${-(a * 3 + b) * .3}s`); }));
  [40, 75, 110, 145].forEach((x, a) => [-130, -95, -60].forEach((y, b) => { crops += bb(x, y, S_CROP, 'sw cg', `--d:${2.8 + (a + b) % 3 * .4}s;--dl:${-(a * 3 + b) * .25}s`); }));
  const h3 = document.createElement('div'); h3.className = 'h3';
  h3.innerHTML = `<div class="h3-card"><div class="h3-sun"></div>
<div class="h3-cl" style="top:9%;--w:120px;animation-duration:70s"></div><div class="h3-cl" style="top:22%;--w:84px;animation-duration:95s;animation-delay:-40s"></div><div class="h3-cl" style="top:6%;--w:150px;animation-duration:120s;animation-delay:-80s"></div>
<svg class="h3-hl" style="--f:10" viewBox="0 0 760 300" preserveAspectRatio="none"><path d="M0 200Q200 120 420 170T760 130V300H0Z" fill="#a3c89a"/></svg>
<svg class="h3-hl" style="--f:18" viewBox="0 0 760 300" preserveAspectRatio="none"><path d="M0 240Q240 170 460 220T760 190V300H0Z" fill="#5e9a61"/></svg>
<svg class="h3-hl" style="--f:28" viewBox="0 0 760 300" preserveAspectRatio="none"><path d="M0 275Q220 235 470 262T760 245V300H0Z" fill="#173d2a"/></svg></div>
<div class="h3-w"><div class="h3-stage" id="h3-stage"><div class="h3-fl">
<i class="fl h3-shadow" style="left:-190px;top:-150px;width:440px;height:440px"></i>${slabs}
${fl(-175, -155, 150, 130, 'f-wheat')}${fl(20, -155, 150, 115, 'f-crop')}${fl(-175, 80, 140, 105, 'f-soil')}${fl(-200, 28, 400, 46, 'f-path')}${fl(60, 90, 110, 85, 'f-pond')}
<i class="fl h3-scan" style="left:-120px;top:-100px"></i>
${wheat}${crops}
${bb(150, -170, S_TREE, 'sw', '--d:4s')}${bb(-185, -5, S_TREE, 'sw', '--d:4.6s;--dl:-1s')}${bb(172, 0, S_TREE, 'sw', '--d:5s;--dl:-2s')}
${bb(45, -185, S_MILL, 'mill')}${bb(-100, 140, S_SPR, 'spr-bb')}
<div class="trk"><div class="trk-m">${bb(0, 0, S_TRK, 'trk-b', '--z:1px')}</div></div>
<i class="fl h3-cs" style="left:50px;top:-135px"></i>
${bb(90, -95, `<div class="rc">${S_CLOUD}<div class="drops">${[8, 30, 52, 74, 96].map((l, i) => `<i style="left:${l}px;animation-delay:${i * .17}s"></i>`).join('')}</div></div>`, 'cloud3', '--z:200px')}
</div></div></div>
<div class="h3-sat">${S_SAT}</div><div class="h3-pts">${Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 37) % 100}%;--s:${5 + i % 4 * 2}px;animation-duration:${9 + i % 5 * 3}s;animation-delay:${-i * 1.7}s"></i>`).join('')}</div>`;
  h3.append(...keep); hv.replaceWith(h3);                                           // the old sun, hills, fields and plants are gone
  const note = h3.querySelector('.visual-note'), btn = $('start-button');
  if (note && btn) { note.setAttribute('role', 'button'); note.tabIndex = 0; note.onclick = () => btn.click(); note.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); } }; }

  /* kinetic headline: every letter (every word in Hindi) flips in; re-splits when the language changes */
  const h = $('hero-title');
  const split = () => { if (!h || h.querySelector('.ch')) return; let i = 0; const lat = !hi();
    const walk = n => [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) { const fr = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(w => { if (!w) return; if (!w.trim()) { fr.append(' '); return; }
          const wd = document.createElement('span'); wd.className = 'wd';
          (lat ? [...w] : [w]).forEach(g => { const s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = g; wd.append(s); }); fr.append(wd); });
        c.replaceWith(fr); }
      else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c); });
    walk(h); };
  if (h && !RM) { split(); new MutationObserver(() => split()).observe(h, { childList: true }); }

  /* pointer + scroll parallax, satellite orbit, magnetic button */
  const stage = $('h3-stage'), sat = h3.querySelector('.h3-sat'); let on = 0, px = 0, py = 0, tx = 0, ty = 0; const T0 = performance.now();
  new IntersectionObserver(es => es.forEach(x => { on = x.isIntersecting; if (on) hero.classList.add('h3-in'); else if (ws.classList.contains('hidden')) hero.classList.remove('h3-in'); })).observe(hero);
  hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5;
    if (btn) { const b = btn.getBoundingClientRect(), dx = e.clientX - b.left - b.width / 2, dy = e.clientY - b.top - b.height / 2, f = Math.max(0, 1 - Math.hypot(dx, dy) / 150); btn.style.translate = `${dx * .18 * f}px ${dy * .28 * f}px`; } });
  hero.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (btn) btn.style.translate = ''; });
  const tick = now => {
    requestAnimationFrame(tick); if (!on || document.hidden) return;
    const T = (now - T0) / 1000, W = h3.clientWidth, H = h3.clientHeight; if (!W) return;
    px += (tx - px) * .06; py += (ty - py) * .06; const sp = Math.min(1, scrollY / 700);
    hero.style.setProperty('--px', px.toFixed(3)); hero.style.setProperty('--py', py.toFixed(3));
    h3.style.setProperty('--k', Math.min(1.15, W / 760).toFixed(3));
    stage.style.setProperty('--rx', (58 - py * 12 + sp * 8).toFixed(2) + 'deg');
    stage.style.setProperty('--rz', (-38 + px * 24 + Math.sin(T * .3) * 5 + sp * 14).toFixed(2) + 'deg');
    const th = T * .4, ca = Math.cos(th), sa = Math.sin(th), rho = -.24, a = W * .43, b = H * .17, cx = W / 2, cy = H * .5;
    sat.style.transform = `translate(${cx + a * ca * Math.cos(rho) - b * sa * Math.sin(rho)}px,${cy + a * ca * Math.sin(rho) + b * sa * Math.cos(rho)}px) scale(${.8 + .3 * sa}) rotate(${-14 + ca * 6}deg)`;
    sat.style.zIndex = sa < 0 ? 1 : 6;
  };
  if (RM) { on = 1; h3.style.setProperty('--k', 1); } else requestAnimationFrame(tick);
}

/* ================= start ================= */
safe(board);
safe(hero3d);
safe(life);
safe(boardTilt);
safe(tilt);
safe(intro);
new MutationObserver(() => safe(() => { render(); const k = $('kx'); if (k) tx(k); })).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
