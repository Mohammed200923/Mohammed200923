/* The immersive 3D sky: a Three.js scene seen from the inside of a celestial sphere.
   DECORATIVE: the stars, Milky Way band and glow clouds are procedurally generated for atmosphere and orientation.
   They are NOT survey data. Only the target markers come from the data provider.
   API: createSky(canvas) -> { setView, getView, flyTo, project, unproject, setTargets, ... , on }          */
import * as THREE from '../vendor/three.module.js';

const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap360 = (a) => ((a % 360) + 360) % 360;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function radecToVec(ra, dec, r = 1, out = new THREE.Vector3()) {
  const a = ra * DEG, d = dec * DEG;
  return out.set(Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a)).multiplyScalar(r);
}
export function vecToRadec(v) {
  const n = v.clone().normalize();
  return { ra: wrap360(Math.atan2(-n.z, n.x) / DEG), dec: Math.asin(clamp(n.y, -1, 1)) / DEG };
}

const STAR_VS = `
attribute float size; attribute float temp; attribute float phase; attribute float bright;
uniform float uScale, uIr, uTime, uTwinkle, uLight;
varying vec3 vColor; varying float vAlpha;
vec3 starCol(float t){
  vec3 a=vec3(.62,.76,1.), b=vec3(1.,.97,.9), c=vec3(1.,.82,.5), d=vec3(1.,.45,.28);
  return t<.33 ? mix(a,b,t/.33) : (t<.66 ? mix(b,c,(t-.33)/.33) : mix(c,d,(t-.66)/.34));
}
vec3 irCol(float t){
  vec3 c = mix(vec3(.22,.95,.76), vec3(1.,.85,.3), smoothstep(.1,.65,t));
  return mix(c, vec3(1.,.42,.55), smoothstep(.65,1.,t));
}
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.);
  gl_Position = projectionMatrix * mv;
  float boost = mix(1., .35 + 1.5*temp, uIr);
  float tw = 1. + uTwinkle * .18 * sin(uTime*1.7 + phase*40.);
  gl_PointSize = max(1., size * uScale * boost * tw);
  vec3 col = mix(starCol(temp), irCol(temp), uIr);
  col = mix(col, col*.22 + vec3(.0,.05,.05), uLight);
  vColor = col;
  vAlpha = clamp(bright * (.55 + .45*boost), 0., 1.) * mix(1., 1.35, uLight);
}`;
const STAR_FS = `
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  if (d > 1.) discard;
  float a = 1. - d;
  float core = pow(a, 2.6) + .35 * a * a * a;
  gl_FragColor = vec4(vColor, vAlpha * core);
}`;
const MARK_VS = `
attribute float size; attribute vec3 col; attribute float hot;
uniform float uPx; varying vec3 vCol; varying float vHot;
void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_PointSize = size * uPx * (1. + hot*.35); vCol = col; vHot = hot; }`;
const MARK_FS = `
varying vec3 vCol; varying float vHot;
void main(){
  float d = length(gl_PointCoord - .5) * 2.;
  float ring = smoothstep(.06,.0,abs(d-.72)-.035);
  float dot = smoothstep(.16,.1,d);
  float halo = smoothstep(1.,.7,d) * .1;
  float a = clamp(ring + dot*.9 + halo, 0., 1.) * (.62 + vHot*.38);
  if (a < .01) discard;
  gl_FragColor = vec4(vCol, a);
}`;

function glowTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* Galactic plane (decorative band) -> equatorial rotation. NGP at RA 192.86, Dec 27.13; l of NCP 122.93. */
function galToEq(l, b) {
  const ra0 = 192.85948 * DEG, d0 = 27.12825 * DEG, l0 = 122.93192 * DEG;
  const sd = Math.sin(b) * Math.sin(d0) + Math.cos(b) * Math.cos(d0) * Math.cos(l0 - l);
  const dec = Math.asin(clamp(sd, -1, 1));
  const y = Math.cos(b) * Math.sin(l0 - l), x = Math.sin(b) * Math.cos(d0) - Math.cos(b) * Math.sin(d0) * Math.cos(l0 - l);
  return { ra: wrap360((Math.atan2(y, x) + ra0) / DEG), dec: dec / DEG };
}

export function createSky(canvas, options = {}) {
  const listeners = {};
  const emit = (ev, d) => (listeners[ev] || []).forEach((f) => f(d));
  const api = { on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); } };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  camera.position.set(0, 0, 0);

  const view = { ra: 83.8, dec: 0, fov: 70, roll: 0 };
  const state = { light: false, low: !!options.low, reduced: !!options.reduced, ir: 0, starScale: 1, dirty: true, w: 1, h: 1, time: 0 };

  /* ---------- stars ---------- */
  let stars = null, starMat = null, markers = null, markMat = null, graticule = null;
  const glows = [];
  const group = new THREE.Group(); scene.add(group);

  function buildStars() {
    if (stars) { group.remove(stars); stars.geometry.dispose(); }
    const N = state.low ? 3000 : 32000, R = rng(20260614);
    const pos = new Float32Array(N * 3), size = new Float32Array(N), temp = new Float32Array(N), phase = new Float32Array(N), bright = new Float32Array(N);
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      let ra, dec;
      if (R() < 0.42) { // concentrate toward the Milky Way plane
        const l = R() * 2 * Math.PI, b = (R() + R() + R() - 1.5) * 0.34;
        ({ ra, dec } = galToEq(l, b));
      } else { ra = R() * 360; dec = Math.asin(R() * 2 - 1) / DEG; }
      radecToVec(ra, dec, 100, v);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const m = Math.pow(R(), 5); // many faint, few bright
      size[i] = 1.3 + m * 7.5; bright[i] = 0.22 + m * 0.85;
      const tr = R(); temp[i] = tr < 0.3 ? R() * 0.3 : tr < 0.8 ? 0.25 + R() * 0.45 : 0.6 + R() * 0.4;
      phase[i] = R();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('temp', new THREE.BufferAttribute(temp, 1));
    g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('bright', new THREE.BufferAttribute(bright, 1));
    if (!starMat) {
      starMat = new THREE.ShaderMaterial({
        vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: { uScale: { value: 1 }, uIr: { value: 0 }, uTime: { value: 0 }, uTwinkle: { value: 1 }, uLight: { value: 0 } }
      });
    }
    stars = new THREE.Points(g, starMat); stars.frustumCulled = false; stars.renderOrder = 2; group.add(stars);
  }

  /* ---------- glow clouds (decorative atmosphere) ---------- */
  const TINTS = [['rgba(56,242,194,0.55)', 'rgba(20,120,100,0.18)'], ['rgba(255,216,77,0.4)', 'rgba(150,100,20,0.12)'], ['rgba(125,255,90,0.35)', 'rgba(40,110,60,0.12)'], ['rgba(90,170,255,0.32)', 'rgba(30,70,140,0.1)'], ['rgba(255,110,150,0.28)', 'rgba(110,30,70,0.1)']];
  function buildGlows() {
    glows.splice(0).forEach((s) => { group.remove(s); s.material.map && s.material.map.dispose(); s.material.dispose(); });
    if (state.low) return;
    const R = rng(777), tex = TINTS.map((t) => glowTexture(t[0], t[1]));
    for (let i = 0; i < 46; i++) {
      const band = i < 34, k = Math.floor(R() * (band ? 3 : 5));
      const l = R() * 2 * Math.PI, b = band ? (R() - 0.5) * 0.28 : (R() - 0.5) * 2.2;
      const p = band ? galToEq(l, b) : { ra: R() * 360, dec: Math.asin(R() * 2 - 1) / DEG };
      const m = new THREE.SpriteMaterial({ map: tex[k], transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: band ? 0.2 + R() * 0.22 : 0.12 + R() * 0.16 });
      const s = new THREE.Sprite(m); radecToVec(p.ra, p.dec, 96, s.position);
      const sc = band ? 34 + R() * 46 : 20 + R() * 38; s.scale.set(sc, sc * (0.6 + R() * 0.5), 1); s.material.rotation = R() * 6.28;
      s.renderOrder = 1; s.userData.base = m.opacity; group.add(s); glows.push(s);
    }
  }

  /* ---------- graticule ---------- */
  function buildGraticule() {
    const pts = [], seg = 72;
    for (let dec = -60; dec <= 60; dec += 30) for (let i = 0; i < seg; i++) { const a = radecToVec((i / seg) * 360, dec, 98), b = radecToVec(((i + 1) / seg) * 360, dec, 98); pts.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    for (let ra = 0; ra < 360; ra += 30) for (let i = 0; i < 36; i++) { const d0 = -90 + (i / 36) * 180, d1 = -90 + ((i + 1) / 36) * 180; const a = radecToVec(ra, d0, 98), b = radecToVec(ra, d1, 98); pts.push(a.x, a.y, a.z, b.x, b.y, b.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    graticule = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x38f2c2, transparent: true, opacity: 0.13, depthTest: false, depthWrite: false }));
    graticule.renderOrder = 0; graticule.frustumCulled = false; graticule.visible = options.graticule !== false; group.add(graticule);
  }

  /* ---------- target markers ---------- */
  let targetList = [], hoverId = null, selectedId = null;
  const CLASS_COL = { star: '#ffd84d', nebula: '#38f2c2', galaxy: '#9fd0ff', cluster: '#b8ff8a', region: '#7dff5a', 'brown-dwarf': '#ff9ec0', other: '#f4fff9' };
  function buildMarkers() {
    if (markers) { group.remove(markers); markers.geometry.dispose(); }
    const n = targetList.length; if (!n) { markers = null; return; }
    const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3), hot = new Float32Array(n), c = new THREE.Color();
    targetList.forEach((t, i) => {
      radecToVec(t.coordinates.ra, t.coordinates.dec, 99).toArray(pos, i * 3);
      size[i] = 30; c.set(CLASS_COL[t.classification] || CLASS_COL.other); col.set([c.r, c.g, c.b], i * 3);
      hot[i] = t.id === selectedId ? 1 : t.id === hoverId ? 0.6 : 0;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('col', new THREE.BufferAttribute(col, 3)); g.setAttribute('hot', new THREE.BufferAttribute(hot, 1));
    if (!markMat) markMat = new THREE.ShaderMaterial({ vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false, depthTest: false, uniforms: { uPx: { value: 1 } } });
    markers = new THREE.Points(g, markMat); markers.frustumCulled = false; markers.renderOrder = 5; group.add(markers);
  }
  function refreshHot() {
    if (!markers) return;
    const a = markers.geometry.getAttribute('hot');
    targetList.forEach((t, i) => a.setX(i, t.id === selectedId ? 1 : t.id === hoverId ? 0.6 : 0));
    a.needsUpdate = true; state.dirty = true;
  }

  /* ---------- camera / projection ---------- */
  const fwd = new THREE.Vector3();
  function applyCamera() {
    view.dec = clamp(view.dec, -89.5, 89.5); view.ra = wrap360(view.ra); view.fov = clamp(view.fov, 0.25, 100);
    camera.fov = view.fov; camera.up.set(0, 1, 0);
    if (state.offsetY || state.offsetX) camera.setViewOffset(state.w, state.h, state.offsetX || 0, state.offsetY || 0, state.w, state.h); else camera.clearViewOffset();
    radecToVec(view.ra, view.dec, 1, fwd); camera.lookAt(fwd); camera.rotateZ(-view.roll * DEG);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const zf = clamp(Math.sqrt(60 / view.fov), 1, 2.4), pr = renderer.getPixelRatio();
    starMat.uniforms.uScale.value = Math.min(pr, 1.6) * zf * state.starScale * (state.w < 720 ? 0.8 : 1);
    markMat && (markMat.uniforms.uPx.value = pr * (state.w < 640 ? 1.05 : 1));
    state.dirty = true;
  }
  const tmp = new THREE.Vector3();
  api.project = (ra, dec) => {
    radecToVec(ra, dec, 1, tmp); const front = tmp.dot(fwd) > 0.01; tmp.project(camera);
    const x = (tmp.x * 0.5 + 0.5) * state.w, y = (-tmp.y * 0.5 + 0.5) * state.h;
    return { x, y, visible: front && x > -40 && x < state.w + 40 && y > -40 && y < state.h + 40 };
  };
  api.unproject = (x, y) => {
    const v = new THREE.Vector3((x / state.w) * 2 - 1, -((y / state.h) * 2 - 1), 0.5).unproject(camera).sub(camera.position);
    return vecToRadec(v);
  };

  /* ---------- view API ---------- */
  api.getView = () => ({ ...view });
  let anim = null;
  api.setView = (v, silent) => { Object.assign(view, v); applyCamera(); if (!silent) emit('view', api.getView()); };
  function angSep(r1, d1, r2, d2) { const a = d1 * DEG, b = d2 * DEG; return Math.acos(clamp(Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((r1 - r2) * DEG), -1, 1)) / DEG; }
  api.flyTo = (to, opts = {}) => {
    const from = { ...view }, target = { ra: to.ra == null ? from.ra : to.ra, dec: to.dec == null ? from.dec : to.dec, fov: to.fov == null ? from.fov : to.fov, roll: to.roll == null ? from.roll : to.roll };
    inertia.x = inertia.y = 0;
    if (state.reduced || opts.instant) { api.setView(target); return Promise.resolve(); }
    let dra = ((target.ra - from.ra + 540) % 360) - 180;
    const dist = angSep(from.ra, from.dec, target.ra, target.dec), dur = clamp(500 + dist * 9, 500, 1700), bump = clamp(dist * 0.35, 0, 45);
    return new Promise((res) => { anim = { t0: performance.now(), dur, from, target, dra, bump, res }; state.dirty = true; });
  };
  api.stopFly = () => { if (anim) { anim.res(); anim = null; } };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---------- interaction ---------- */
  const pointers = new Map(); let pinch0 = null, dragMoved = 0, downAt = null; const inertia = { x: 0, y: 0 };
  function pan(dx, dy) {
    const dpp = view.fov / state.h, r = view.roll * DEG, c = Math.cos(r), s = Math.sin(r);
    const ux = dx * c - dy * s, uy = dx * s + dy * c;
    view.ra += (ux * dpp) / Math.max(0.15, Math.cos(view.dec * DEG)); view.dec += uy * dpp; applyCamera();
  }
  function zoomBy(f, ax, ay) {
    const before = ax != null ? api.unproject(ax, ay) : null;
    view.fov = clamp(view.fov * f, 0.25, 100); applyCamera();
    if (before) { const after = api.unproject(ax, ay); view.ra += before.ra - after.ra; view.dec += before.dec - after.dec; applyCamera(); }
    emit('view', api.getView());
  }
  api.zoomBy = (f) => { api.stopFly(); zoomBy(f); };
  api.panBy = (dx, dy) => { api.stopFly(); pan(dx, dy); emit('view', api.getView()); };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { dragMoved = 0; downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; api.stopFly(); inertia.x = inertia.y = 0; emit('dragstart'); }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: view.fov }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId), rect = canvas.getBoundingClientRect();
    if (!p) { emit('hover', { x: e.clientX - rect.left, y: e.clientY - rect.top, touch: e.pointerType === 'touch' }); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2 - rect.left, cy = (a.y + b.y) / 2 - rect.top;
      const target = clamp(pinch0.fov * (pinch0.d / Math.max(d, 1)), 0.25, 100); zoomBy(target / view.fov, cx, cy); dragMoved += 10; return;
    }
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved > 4) { pan(dx, dy); inertia.x = dx; inertia.y = dy; emit('view', api.getView()); }
  });
  const up = (e) => {
    const had = pointers.delete(e.pointerId); if (!had) return;
    if (pointers.size < 2) pinch0 = null;
    if (pointers.size === 0) {
      emit('dragend');
      if (dragMoved <= 6 && downAt) { const r = canvas.getBoundingClientRect(); emit('click', { x: e.clientX - r.left, y: e.clientY - r.top, touch: e.pointerType === 'touch' }); }
      else if (state.reduced) { inertia.x = inertia.y = 0; }
      downAt = null;
    }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => emit('hover', null));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); api.stopFly(); const r = canvas.getBoundingClientRect(); zoomBy(Math.exp(clamp(e.deltaY, -120, 120) * 0.0016), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key, step = e.shiftKey ? 3 : 1; let h = true;
    if (k === 'ArrowLeft') api.panBy(-40 * step, 0); else if (k === 'ArrowRight') api.panBy(40 * step, 0);
    else if (k === 'ArrowUp') api.panBy(0, -40 * step); else if (k === 'ArrowDown') api.panBy(0, 40 * step);
    else if (k === '+' || k === '=') api.zoomBy(0.8); else if (k === '-' || k === '_') api.zoomBy(1.25);
    else if (k === 'q' || k === 'Q') api.setView({ roll: view.roll - 10 }); else if (k === 'e' || k === 'E') api.setView({ roll: view.roll + 10 });
    else h = false;
    if (h) e.preventDefault();
  });

  /* ---------- setters ---------- */
  api.setTargets = (list) => { targetList = list.slice(); buildMarkers(); state.dirty = true; };
  api.setSelected = (id) => { selectedId = id; refreshHot(); };
  api.setHover = (id) => { if (id !== hoverId) { hoverId = id; refreshHot(); } };
  api.setInfrared = (v) => { state.ir = clamp(v, 0, 1); starMat.uniforms.uIr.value = state.ir; state.dirty = true; };
  api.setStarScale = (v) => { state.starScale = clamp(v, 0.4, 2); applyCamera(); };
  api.setGraticule = (on) => { if (graticule) { graticule.visible = !!on; state.dirty = true; } };
  api.setTheme = (light) => {
    state.light = !!light; starMat.uniforms.uLight.value = light ? 1 : 0;
    starMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending; starMat.needsUpdate = true;
    glows.forEach((s) => { s.material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending; s.material.opacity = s.userData.base * (light ? 0.55 : 1); s.material.needsUpdate = true; });
    if (graticule) { graticule.material.color.set(light ? 0x0b5a4a : 0x38f2c2); graticule.material.opacity = light ? 0.2 : 0.13; }
    state.dirty = true;
  };
  api.setLowPerf = (low) => { if (state.low === !!low) return; state.low = !!low; buildStars(); buildGlows(); api.setTheme(state.light); resize(); };
  api.setReducedMotion = (r) => { state.reduced = !!r; starMat.uniforms.uTwinkle.value = r ? 0 : 1; state.dirty = true; };
  api.requestRender = () => { state.dirty = true; };
  api.getSize = () => ({ w: state.w, h: state.h });
  api.setCenterOffset = (dx, dy) => { if (state.offsetX === dx && state.offsetY === dy) return; state.offsetX = dx; state.offsetY = dy; applyCamera(); };
  api.pickNear = (x, y, maxPx = 30) => {
    let best = null, bd = maxPx;
    targetList.forEach((t) => { const p = api.project(t.coordinates.ra, t.coordinates.dec); if (!p.visible) return; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = t; } });
    return best;
  };
  api.pixelsPerDegree = () => state.h / view.fov;

  /* ---------- loop ---------- */
  function resize() {
    const r = canvas.parentElement.getBoundingClientRect(), w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    state.w = w; state.h = h; renderer.setPixelRatio(state.low ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false); camera.aspect = w / h; applyCamera(); emit('resize', { w, h });
  }
  new ResizeObserver(resize).observe(canvas.parentElement);

  let last = performance.now(), frame = 0, running = true, lastEmit = 0;
  function tick(now) {
    if (!running) return; requestAnimationFrame(tick);
    const dt = Math.min(50, now - last); last = now; frame++;
    if (anim) {
      const t = clamp((now - anim.t0) / anim.dur, 0, 1), e = ease(t), a = anim;
      view.ra = a.from.ra + a.dra * e; view.dec = a.from.dec + (a.target.dec - a.from.dec) * e;
      view.fov = a.from.fov + (a.target.fov - a.from.fov) * e + a.bump * Math.sin(Math.PI * e);
      view.roll = a.from.roll + (a.target.roll - a.from.roll) * e; applyCamera();
      if (now - lastEmit > 60 || t >= 1) { emit('view', api.getView()); lastEmit = now; }
      if (t >= 1) { const r = a.res; anim = null; r(); }
    } else if (!pointers.size && (Math.abs(inertia.x) > 0.2 || Math.abs(inertia.y) > 0.2) && !state.reduced) {
      pan(inertia.x, inertia.y); inertia.x *= 0.92; inertia.y *= 0.92; if (now - lastEmit > 60) { emit('view', api.getView()); lastEmit = now; }
    }
    if (!state.reduced && !state.low && frame % 3 === 0) { state.time += dt * 0.001 * 3; starMat.uniforms.uTime.value = state.time; state.dirty = true; }
    emit('frame', now);
    if (state.dirty) { state.dirty = false; renderer.render(scene, camera); }
  }

  buildStars(); buildGlows(); buildGraticule(); api.setTheme(!!options.light); api.setReducedMotion(!!options.reduced); resize();
  requestAnimationFrame(tick);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); emit('contextlost'); });
  api.dispose = () => { running = false; renderer.dispose(); };
  return api;
}
