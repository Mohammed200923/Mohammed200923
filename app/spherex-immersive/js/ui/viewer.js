/* Observation viewer: the PROPER 2D astronomical image viewer.
   Real observations are flat sky images, so they are never mapped onto 3D geometry. This viewer shows them undistorted,
   with shared pan/zoom, and clearly labels the display colour mapping (user-chosen) and the data provenance.            */
import { $, h, icon, fmtDate, announce, trapFocus, clamp, toast } from '../core/dom.js';
import { S, bus } from '../core/state.js';
import { t, loc, lang } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';
import { errorState, emptyState, provChip, qualityChips, metaList, panelHead } from './common.js';

const MODES = ['single', 'slider', 'side', 'diff', 'blink'];
const PALETTES = ['natural', 'emerald', 'aurum', 'ice', 'dust'];
const PRESETS = [{ id: 'composite', k: 'band.preset.all' }, { id: 1, k: 'band.preset.short' }, { id: 3, k: 'band.preset.mid' }, { id: 5, k: 'band.preset.long' }];

const vw = { mode: 'single', a: 0, b: 0, band: 'composite', palette: 'natural', bright: 1, contrast: 1, k: 1, x: 0, y: 0, slider: 50, blink: false, blinkShowB: false, diffBand: 4 };
let root, release, open = false, token = 0, blinkTimer = null, stageW = 600, stageH = 500, targetKey = '';
const imgCache = new Map();

export function init() {
  UI.register('viewer', { kind: 'overlay', open: show, close: hide, isOpen: () => open });
  ['visit', 'lang', 'obs', 'level', 'band', 'target'].forEach((e) => bus.on(e, () => { if (!open) return; if (e === 'target') { vw.k = 1; vw.x = vw.y = 0; } syncFromState(); build(); }));
  bus.on('prefs', (p) => { if (open && ('level' in p || 'lang' in p)) build(); });
}
export const getContext = () => ({ open, mode: vw.mode, a: S.obs[vw.a] || null, b: S.obs[vw.b] || null, band: vw.band, palette: vw.palette });

function observedIdx() { return C.observed().map((x) => x.i); }
function syncFromState() {
  const list = observedIdx(); vw.band = S.band;
  vw.a = list.includes(S.visit) ? S.visit : (list[list.length - 1] ?? 0);
  if (!list.includes(vw.b) || vw.b === vw.a) vw.b = list.find((i) => i !== vw.a) ?? vw.a;
  if (list.length < 2 && vw.mode !== 'single') vw.mode = 'single';
}

function show(arg = {}) {
  if (!S.pos) return;
  const key = S.target ? S.target.id : 'pos';
  if (key !== targetKey) { targetKey = key; vw.k = 1; vw.x = vw.y = 0; }
  open = true; vw.mode = MODES.includes(arg.mode) ? arg.mode : 'single';
  syncFromState();
  if (vw.mode !== 'single' && observedIdx().length >= 2) { const l = observedIdx(); vw.a = l[0]; vw.b = l[l.length - 1]; }
  root = h('div', { class: 'overlay viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('viewer.title') });
  document.body.append(root); build();
  release = trapFocus(root, hide); requestAnimationFrame(() => root.classList.add('in'));
  const first = root.querySelector('.tab[aria-selected="true"]'); first && first.focus();
  bus.emit('panel'); announce(t('viewer.opened'));
}
function hide() {
  open = false; clearInterval(blinkTimer); blinkTimer = null; vw.blink = false; token++;
  root.classList.remove('in'); const r = root; setTimeout(() => r.remove(), 260);
  release && release(); bus.emit('panel');
}

/* ---------------- layout ---------------- */
function build() {
  if (!root) return;
  const prevSide = root.querySelector('.vw-side'), sideScroll = prevSide ? prevSide.scrollTop : 0;
  root.textContent = '';
  const tg = S.target, title = tg ? loc(tg.name) : t('sel.position');
  const list = observedIdx(), canCompare = list.length >= 2;
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('viewer.modes') });
  MODES.forEach((m) => {
    const isBeginnerHidden = document.documentElement.dataset.level === 'beginner' && (m === 'side' || m === 'blink' || m === 'diff');
    if (isBeginnerHidden) return;
    const dis = m !== 'single' && !canCompare;
    tabs.append(h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': vw.mode === m ? 'true' : 'false', disabled: dis, title: dis ? t('viewer.need2') : '', onclick: () => setMode(m) }, h('span', { text: t('viewer.mode.' + m) })));
  });
  const head = h('header', { class: 'vw-head' }, h('div', { class: 'vw-title' }, h('span', { class: 'eyebrow', text: t('viewer.title') }), h('h2', { text: title })), tabs,
    h('button', { class: 'x', type: 'button', 'aria-label': t('common.close'), onclick: hide }, icon('close')));

  const stage = h('div', { class: 'vw-stage', id: 'vw-stage' });
  const side = h('aside', { class: 'vw-side' });
  root.append(head, h('div', { class: 'vw-main' }, stage, side));
  buildSide(side, canCompare); side.scrollTop = sideScroll;
  const r = stage.getBoundingClientRect(); stageW = r.width || stageW; stageH = r.height || stageH;
  renderStage(stage);
}

function setMode(m) {
  vw.mode = m; clearInterval(blinkTimer); blinkTimer = null; vw.blink = false;
  if (m !== 'single' && vw.a === vw.b) { const l = observedIdx(); vw.a = l[0]; vw.b = l[l.length - 1]; }
  build(); announce(t('viewer.mode.' + m));
}

function visitChips(label, cur, onPick, avoid) {
  const row = h('div', { class: 'vrow' }, h('span', { class: 'eyebrow', text: label }));
  const box = h('div', { class: 'chips' });
  S.obs.forEach((o, i) => {
    if (o.status !== 'observed') return;
    box.append(h('button', { class: 'btn small' + (i === cur ? ' on' : ''), type: 'button', 'aria-pressed': i === cur ? 'true' : 'false', onclick: () => onPick(i), title: avoid === i ? t('viewer.same') : '' },
      h('span', { text: fmtDate(o.startTime, lang()) })));
  });
  row.append(box); return row;
}

function buildSide(side, canCompare) {
  const sec = (title, kids, cls) => h('section', { class: 'vsec ' + (cls || '') }, h('h3', { text: title }), kids);
  const compare = vw.mode !== 'single';
  const pa = (i) => { C.stopPlay(); vw.a = i; if (i === S.visit) refreshAll(); else { C.setVisit(i); } };
  /* observation choice */
  const obsKids = [];
  obsKids.push(visitChips(compare ? t('viewer.before') + ' (A)' : t('viewer.date'), vw.a, pa, compare ? vw.b : -1));
  if (compare && vw.mode !== 'blink' || vw.mode === 'blink') obsKids.push(visitChips(t('viewer.after') + ' (B)', vw.b, (i) => { vw.b = i; build(); }, vw.a));
  if (!compare) {
    obsKids.push(h('div', { class: 'tl-actions' },
      h('button', { class: 'btn small', type: 'button', 'aria-label': t('tl.prev'), onclick: () => C.stepVisit(-1) }, icon('prev')),
      h('button', { class: 'btn small primary', type: 'button', disabled: observedIdx().length < 2, onclick: () => C.togglePlay() }, icon(S.playing ? 'pause' : 'play'), h('span', { text: S.playing ? t('tl.pause') : t('tl.play') })),
      h('button', { class: 'btn small', type: 'button', 'aria-label': t('tl.next'), onclick: () => C.stepVisit(1) }, icon('next'))));
  }
  if (vw.mode === 'blink') obsKids.push(h('button', { class: 'btn small' + (vw.blink ? ' on' : ''), type: 'button', 'aria-pressed': vw.blink ? 'true' : 'false', onclick: toggleBlink, text: vw.blink ? t('viewer.blink.stop') : t('viewer.blink.start') }));
  if (vw.mode === 'blink' && document.documentElement.dataset.motion === 'reduced') obsKids.push(h('p', { class: 'muted', text: t('viewer.blink.reduced') }));
  side.append(sec(t('viewer.observation'), obsKids));

  /* wavelength */
  const bandKids = [h('p', { class: 'muted', text: t('viewer.band.hint') })];
  const presets = h('div', { class: 'chips' });
  PRESETS.forEach((p) => presets.append(h('button', { class: 'btn small' + (vw.band === p.id ? ' on' : ''), type: 'button', 'aria-pressed': vw.band === p.id ? 'true' : 'false', onclick: () => C.setBand(p.id), text: t(p.k) })));
  bandKids.push(presets);
  const full = h('div', { class: 'chips lvl-int' });
  full.append(h('button', { class: 'btn small' + (vw.band === 'composite' ? ' on' : ''), type: 'button', onclick: () => C.setBand('composite'), text: t('band.all') }));
  S.bands.forEach((b) => { const ob = S.obs[vw.a] && S.obs[vw.a].bands && S.obs[vw.a].bands.find((x) => x.bandId === b.id), off = ob && !ob.available;
    full.append(h('button', { class: 'btn small' + (vw.band === b.id ? ' on' : ''), type: 'button', 'aria-pressed': vw.band === b.id ? 'true' : 'false', title: (off ? t('band.missing') + ' · ' : '') + b.minMicron + '–' + b.maxMicron + ' µm', onclick: () => C.setBand(b.id) }, h('span', { class: 'ltr mono', text: b.id }), off ? h('span', { class: 'chip bad', text: '!' }) : null)); });
  bandKids.push(full);
  side.append(sec(t('viewer.wavelength'), bandKids));

  /* display */
  const dispKids = [h('p', { class: 'muted', text: t('viewer.display.note') })];
  const pal = h('div', { class: 'chips' });
  PALETTES.forEach((p) => pal.append(h('button', { class: 'btn small' + (vw.palette === p ? ' on' : ''), type: 'button', 'aria-pressed': vw.palette === p ? 'true' : 'false', onclick: () => { vw.palette = p; repaintAll(); build(); }, text: t('pal.' + p) })));
  dispKids.push(pal);
  const slider = (key, label, min, max) => h('label', { class: 'sl2' }, h('span', { text: label }), h('input', { class: 'range', type: 'range', min, max, step: '0.05', value: vw[key], oninput: (e) => { vw[key] = Number(e.target.value); repaintAll(); } }));
  dispKids.push(slider('bright', t('viewer.brightness'), 0.4, 2.5), slider('contrast', t('viewer.contrast'), 0.5, 3), h('button', { class: 'btn small ghost', type: 'button', onclick: () => { vw.bright = 1; vw.contrast = 1; vw.palette = 'natural'; repaintAll(); build(); }, text: t('viewer.reset_display') }));
  side.append(sec(t('viewer.display'), dispKids, 'lvl-int'));

  /* details (advanced) */
  const det = h('div', { id: 'vw-detail' });
  side.append(sec(t('viewer.details'), det, 'lvl-adv'));
  side.append(h('div', { class: 'vw-foot' }, h('button', { class: 'btn small', type: 'button', onclick: () => UI.open('assistant', { ask: vw.mode === 'diff' || compare ? 'q.changed' : 'q.what' }), text: t('viewer.ask') }),
    h('button', { class: 'btn small primary', type: 'button', onclick: () => UI.open('analysis'), text: 'Full analysis' }),
    h('button', { class: 'btn small lvl-adv', type: 'button', onclick: exportCurrent, text: t('viewer.export') })));
}

/* ---------------- stage ---------------- */
function viewport(cls) { return h('div', { class: 'vp ' + (cls || ''), dir: 'ltr' }); }
function layer(label) {
  const cv = h('canvas', { class: 'sciimg' }), inner = h('div', { class: 'vp-inner' }, cv), cap = h('div', { class: 'vp-cap' }, h('span', { text: label }));
  return { cv, inner, cap };
}
let layers = {};

function renderStage(stage) {
  stage.textContent = ''; layers = {}; const compare = vw.mode !== 'single';
  const status = h('div', { class: 'vw-status', role: 'status', 'aria-live': 'polite' });
  const zoom = h('div', { class: 'zoombar' },
    h('button', { class: 'tl-btn', type: 'button', 'aria-label': t('viewer.zoom_in'), onclick: () => zoomBy(1.4) }, h('span', { text: '+' })),
    h('button', { class: 'tl-btn', type: 'button', 'aria-label': t('viewer.zoom_out'), onclick: () => zoomBy(1 / 1.4) }, h('span', { text: '−' })),
    h('button', { class: 'tl-btn', type: 'button', 'aria-label': t('viewer.fit'), title: t('viewer.fit'), onclick: () => { vw.k = 1; vw.x = vw.y = 0; applyXform(); } }, icon('shrink')),
    h('span', { class: 'ltr mono zlabel', id: 'zlabel', text: vw.k.toFixed(1) + 'x' }));
  const sciNote = h('div', { class: 'sci-note' }, h('span', { class: 'chip', text: t('viewer.flat') }));
  if (vw.mode === 'single' || vw.mode === 'blink') {
    const vp = viewport(); const L = layer(''); vp.append(h('div', { class: 'vp-layer' }, L.inner), L.cap); layers.A = L; stage.append(vp);
    wirePanZoom(vp);
  } else if (vw.mode === 'side') {
    const wrap = h('div', { class: 'side-by-side' }); ['A', 'B'].forEach((k) => { const vp = viewport(); const L = layer(''); vp.append(h('div', { class: 'vp-layer' }, L.inner), L.cap); layers[k] = L; wrap.append(vp); wirePanZoom(vp); }); stage.append(wrap);
  } else if (vw.mode === 'slider') {
    const vp = viewport('cmp'); const A = layer(''), B = layer('');
    const clip = h('div', { class: 'vp-layer clipB' }, B.inner); vp.append(h('div', { class: 'vp-layer' }, A.inner), clip, A.cap, B.cap);
    B.cap.classList.add('end'); layers.A = A; layers.B = B;
    const handle = h('div', { class: 'cmp-handle', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(vw.slider)), 'aria-label': t('viewer.slider.aria') }, h('i'));
    const setS = (v) => { vw.slider = clamp(v, 0, 100); clip.style.clipPath = `inset(0 0 0 ${vw.slider}%)`; handle.style.left = vw.slider + '%'; handle.setAttribute('aria-valuenow', String(Math.round(vw.slider))); };
    setS(vw.slider); vp.append(handle);
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => { e.stopPropagation(); dragging = true; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', (e) => { if (dragging) { const r = vp.getBoundingClientRect(); setS(((e.clientX - r.left) / r.width) * 100); } });
    handle.addEventListener('pointerup', () => { dragging = false; });
    handle.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { setS(vw.slider - 4); e.preventDefault(); } else if (e.key === 'ArrowRight') { setS(vw.slider + 4); e.preventDefault(); } });
    stage.append(vp); wirePanZoom(vp);
  } else if (vw.mode === 'diff') {
    const vp = viewport(); const L = layer(''); L.inner.append(h('div', { class: 'rings', id: 'rings' })); vp.append(h('div', { class: 'vp-layer' }, L.inner), L.cap); layers.D = L; stage.append(vp); wirePanZoom(vp);
  }
  stage.append(zoom, status, sciNote);
  sizeLayers(); applyXform(); loadAll(status);
}

function sizeLayers() {
  const stage = $('#vw-stage'); if (!stage) return;
  stage.querySelectorAll('.vp').forEach((vp) => { const r = vp.getBoundingClientRect(), s = Math.floor(Math.min(r.width, r.height)); vp.querySelectorAll('.vp-inner').forEach((i) => { i.style.width = s + 'px'; i.style.height = s + 'px'; }); });
}
function applyXform() {
  const stage = $('#vw-stage'); if (!stage) return;
  stage.querySelectorAll('.vp-inner').forEach((i) => { i.style.transform = `translate(${vw.x}px,${vw.y}px) scale(${vw.k})`; i.classList.toggle('crisp', vw.k > 1.8); });
  const z = $('#zlabel'); z && (z.textContent = vw.k.toFixed(1) + 'x');
}
function zoomBy(f) { vw.k = clamp(vw.k * f, 1, 16); if (vw.k === 1) vw.x = vw.y = 0; applyXform(); }
function wirePanZoom(vp) {
  const ptrs = new Map(); let d0 = null;
  vp.addEventListener('pointerdown', (e) => { if (e.target.closest('.cmp-handle')) return; vp.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; d0 = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vw.k }; } });
  vp.addEventListener('pointermove', (e) => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && d0) { const [a, b] = [...ptrs.values()]; vw.k = clamp(d0.k * (Math.hypot(a.x - b.x, a.y - b.y) / d0.d), 1, 16); } else if (vw.k > 1) { vw.x += dx; vw.y += dy; clampPan(vp); } applyXform(); });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) d0 = null; };
  vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
  vp.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0018)); clampPan(vp); applyXform(); }, { passive: false });
  vp.addEventListener('dblclick', () => { vw.k = vw.k > 1 ? 1 : 3; if (vw.k === 1) vw.x = vw.y = 0; applyXform(); });
  vp.tabIndex = 0; vp.setAttribute('aria-label', t('viewer.pan_aria'));
  vp.addEventListener('keydown', (e) => { const s = 30; let h2 = true; if (e.key === 'ArrowLeft') vw.x += s; else if (e.key === 'ArrowRight') vw.x -= s; else if (e.key === 'ArrowUp') vw.y += s; else if (e.key === 'ArrowDown') vw.y -= s; else if (e.key === '+' || e.key === '=') zoomBy(1.4); else if (e.key === '-') zoomBy(1 / 1.4); else if (e.key === '0') { vw.k = 1; vw.x = vw.y = 0; } else h2 = false; if (h2) { e.preventDefault(); clampPan(vp); applyXform(); } });
}
function clampPan(vp) { const r = vp.getBoundingClientRect(), mx = (r.width * (vw.k - 1)) / 2 + 40, my = (r.height * (vw.k - 1)) / 2 + 40; vw.x = clamp(vw.x, -mx, mx); vw.y = clamp(vw.y, -my, my); }
window.addEventListener('resize', () => { if (open) { sizeLayers(); } });

/* ---------------- images ---------------- */
const SXd = () => window.SX.data;
function fetchImage(obs, band) {
  const key = obs.id + '|' + band;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = (async () => {
    const r = await SXd().getObservationImage(obs.id, band, { size: 256 });
    if (r.status !== 'ok') return { error: r.error };
    try { const img = await window.SX.render.loadImage(r.data.url); return { meta: r.data, img }; } catch (e) { return { error: e }; }
  })();
  imgCache.set(key, p); p.then((v) => { if (v.error) imgCache.delete(key); });
  return p;
}
function paint(L, res) {
  if (!res || res.error || !L) return;
  const ok = window.SX.render.paint(L.cv, res.img, { encoding: res.meta.encoding, palette: vw.palette, brightness: vw.bright, contrast: vw.contrast });
  L.cv.dataset.palette = ok ? 'applied' : 'css';
}
const lastRes = {};
function repaintAll() { Object.keys(layers).forEach((k) => paint(layers[k], lastRes[k])); }

function placeholder(L, node) { L.inner.querySelector('.ph-msg') && L.inner.querySelector('.ph-msg').remove(); L.cv.style.visibility = node ? 'hidden' : ''; if (node) { const d = h('div', { class: 'ph-msg' }, node); L.inner.append(d); } }
function caption(L, obs, tag) { const c = L.cap.querySelector('span'); c.textContent = `${tag ? tag + ' · ' : ''}${fmtDate(obs.startTime, lang())} · ${t('tl.visit', { n: obs.visitIndex || '' })}`; }

async function loadOne(key, obs, band, tag, status) {
  const L = layers[key]; if (!L) return;
  caption(L, obs, tag);
  if (obs.status !== 'observed') { placeholder(L, emptyState(t('viewer.planned.title'), t('viewer.planned.body'))); return; }
  L.inner.classList.add('loading'); const res = await fetchImage(obs, band);
  L.inner.classList.remove('loading'); if (!layers[key] || layers[key] !== L) return;
  lastRes[key] = res;
  if (res.error) {
    const code = res.error.code;
    placeholder(L, code === 'not-available' ? emptyState(t('viewer.missing.title'), res.error.message, h('button', { class: 'btn small', type: 'button', onclick: () => C.setBand('composite'), text: t('viewer.try_all') })) : errorState(res.error, () => { imgCache.clear(); build(); }));
    status.textContent = t('viewer.err_status'); return;
  }
  placeholder(L, null); paint(L, res);
}

async function loadAll(status) {
  const my = ++token, a = S.obs[vw.a], b = S.obs[vw.b], band = vw.band;
  status.textContent = t('common.loading');
  if (!a) { status.textContent = ''; return; }
  if (vw.mode === 'diff') { await loadDiff(status, my); updateDetail(); return; }
  const jobs = [loadOne('A', a, band, vw.mode === 'single' ? '' : 'A', status)];
  if (layers.B) jobs.push(loadOne('B', b, band, 'B', status));
  if (vw.mode === 'blink') { blinkApply(); }
  await Promise.all(jobs);
  if (my !== token) return;
  status.textContent = ''; updateDetail();
  const m = lastRes.A && lastRes.A.meta; if (m) announce(t('viewer.loaded', { d: fmtDate(a.startTime, lang()) }));
}
function refreshAll() { build(); }

/* difference mode: the provider computes it. The UI only displays the result. */
async function loadDiff(status, my) {
  const L = layers.D, a = S.obs[vw.a], b = S.obs[vw.b];
  if (!L || !a || !b || a.id === b.id) { placeholder(L, emptyState(t('viewer.same'))); status.textContent = ''; return; }
  const bandId = typeof vw.band === 'number' ? vw.band : vw.diffBand; L.cap.querySelector('span').textContent = `${t('viewer.mode.diff')} · ${fmtDate(a.startTime, lang())} → ${fmtDate(b.startTime, lang())} · ${t('band.n', { n: bandId })}`;
  L.inner.classList.add('loading'); const r = await SXd().getComparisonResult(a.id, b.id, { bandId }); L.inner.classList.remove('loading');
  if (my !== token) return; status.textContent = '';
  if (r.status !== 'ok') { placeholder(L, r.error && r.error.code === 'unsupported' ? emptyState(t('info.results.unsupported'), r.error.message) : errorState(r.error, () => build())); return; }
  const d = r.data;
  try { const img = await window.SX.render.loadImage(d.differenceImageUrl); window.SX.render.paint(L.cv, img, { encoding: 'rgb', brightness: 1, contrast: 1 }); placeholder(L, null); } catch (e) { placeholder(L, errorState(e)); return; }
  const rings = $('#rings'); if (rings) { rings.textContent = ''; d.candidates.forEach((c) => rings.append(h('span', { class: 'ring', style: `left:${(c.pixel.x / d.width) * 100}%;top:${(c.pixel.y / d.height) * 100}%`, title: loc(c.label) }))); }
  const det = $('#vw-detail'); void det;
  const sum = h('div', { class: 'diff-sum' }, provChip(d.isSimulated), h('p', { class: 'muted', text: d.isSimulated ? t('viewer.diff.key_demo') : t('viewer.diff.key_real') }),
    metaList([{ key: 'changedFraction', value: (d.summary.changedPixelFraction * 100).toFixed(2) + '%' }, { key: 'peakChange', value: d.summary.peakChange }, { key: 'significance', value: t('sig.' + d.summary.significance) }]),
    d.notes ? h('p', { text: loc(d.notes) }) : null);
  d.candidates.forEach((c) => sum.append(h('div', { class: 'cand' }, h('span', { text: (loc(c.label) || t('viewer.candidate')) + ' · ' + t('change.' + c.changeType) }), h('span', { class: 'meter', 'aria-label': t('viewer.confidence') + ' ' + Math.round(c.confidence * 100) + '%' }, h('i', { style: `width:${Math.round(c.confidence * 100)}%` })), h('small', { class: 'muted', text: t('viewer.confidence_demo') }))));
  const old = $('.diff-sum'); old && old.remove(); $('.vw-side').insertBefore(h('section', { class: 'vsec' }, h('h3', { text: t('viewer.diff.result') }), sum), $('.vw-foot'));
}

/* blink */
function blinkApply() { if (!layers.A) return; const hideA = vw.blinkShowB; const a = $('#vw-stage .vp'); void a; const L = layers.A; const b = S.obs[vw.b], aa = S.obs[vw.a]; if (!b || !aa) return;
  const showObs = hideA ? b : aa; caption(L, showObs, hideA ? 'B' : 'A'); fetchImage(showObs, vw.band).then((res) => { lastRes.A = res; if (res.error) return; paint(L, res); placeholder(L, null); }); }
function toggleBlink() {
  vw.blink = !vw.blink; clearInterval(blinkTimer); blinkTimer = null;
  if (vw.blink && document.documentElement.dataset.motion !== 'reduced') blinkTimer = setInterval(() => { vw.blinkShowB = !vw.blinkShowB; blinkApply(); }, 800);
  else { vw.blinkShowB = vw.blink ? !vw.blinkShowB : false; blinkApply(); }
  build();
}

function updateDetail() {
  const det = $('#vw-detail'); if (!det) return; det.textContent = '';
  const m = (lastRes.A && lastRes.A.meta) || (lastRes.D && lastRes.D.meta); const a = S.obs[vw.a];
  const info = [];
  if (a) info.push(provChip(a.isSimulated));
  if (m) {
    info.push(metaList([{ key: 'encoding', value: m.encoding }, { key: 'wavelength', value: `${m.wavelengthMinMicron}–${m.wavelengthMaxMicron} µm` }, { key: 'imageSize', value: `${m.width} × ${m.height} px` }, { key: 'colourMap', value: t('pal.' + vw.palette) }]));
    info.push(qualityChips(m.quality));
  }
  if (a) { const btn = h('button', { class: 'btn small', type: 'button', onclick: async () => { const r = await SXd().getObservationMetadata(a.id); det.querySelector('.md') && det.querySelector('.md').remove(); det.append(h('div', { class: 'md' }, r.status === 'ok' ? [metaList(r.data.fields), qualityChips(r.data.quality)] : errorState(r.error))); }, text: t('info.meta.load') }); info.push(btn); }
  det.append(...info);
}

async function exportCurrent() {
  const a = S.obs[vw.a]; if (!a) return;
  const r = await SXd().exportObservation(a.id, 'fits');
  toast(r.status === 'ok' ? t('viewer.export.ok') : (r.error ? r.error.message : t('err.unsupported')));
}
