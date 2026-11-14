/* The floating HUD: back button, crumb, toolbar, infrared/sliders, stats, rotation dial. */
import { $, $$, h, toast, announce } from '../core/dom.js';
import { S, bus, HOME } from '../core/state.js';
import { t, loc } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';

let sky;
const NS = 'http://www.w3.org/2000/svg';
const f1 = (n) => (Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2));

export function init(skyApi) {
  sky = skyApi;
  /* back */
  $('#btn-back').addEventListener('click', () => { S.history.length ? C.back() : C.reset(); });
  /* toolbar */
  const onAct = (e) => {
    const b = e.target.closest('.tool, .tr-btn'); if (!b) return; const a = b.dataset.act;
    if (a === 'home') { UI.anyOverlayOpen() && ['search', 'viewer', 'stories', 'settings', 'help'].forEach((n) => UI.close(n)); C.reset(); }
    else if (a === 'search') UI.toggle('search');
    else if (a === 'observe') needPos(() => UI.toggle('viewer', { mode: 'single' }));
    else if (a === 'compare') needPos(() => UI.open('viewer', { mode: 'slider' }));
    else if (a === 'stories') UI.toggle('stories', S.target ? { targetId: S.target.id } : {});
    else if (a === 'assistant') UI.toggle('assistant');
    else if (a === 'settings') UI.toggle('settings');
    else if (a === 'help') UI.toggle('help');
    else if (a === 'analysis') UI.toggle('analysis');
  };
  $('#toolbar').addEventListener('click', onAct); $('.tr-row').addEventListener('click', onAct);
  $('#btn-ask').addEventListener('click', () => UI.toggle('assistant'));
  bus.on('panel', refreshTools);

  /* infrared + sliders */
  const ir = $('#rg-ir'), stars = $('#rg-stars'), grid = $('#rg-grid');
  const setIr = (v) => { S.ir = v / 100; sky.setInfrared(S.ir); ir.value = v; $('#rg-ir-v').textContent = Math.round(v) + '%'; $('#btn-ir').setAttribute('aria-pressed', v > 40 ? 'true' : 'false'); $('#btn-ir').classList.toggle('on', v > 40); document.documentElement.dataset.ir = v > 40 ? '1' : '0'; };
  let irAnim = null;
  $('#btn-ir').addEventListener('click', () => {
    const to = S.ir > 0.4 ? 0 : 100, from = Number(ir.value); cancelAnimationFrame(irAnim);
    announce(to ? t('ir.on') : t('ir.off'));
    if (document.documentElement.dataset.motion === 'reduced') return setIr(to);
    const t0 = performance.now(); (function step(n) { const k = Math.min(1, (n - t0) / 700); setIr(from + (to - from) * k); if (k < 1) irAnim = requestAnimationFrame(step); })(t0);
  });
  ir.addEventListener('input', () => setIr(Number(ir.value)));
  stars.addEventListener('input', () => { sky.setStarScale(stars.value / 100); $('#rg-stars-v').textContent = stars.value + '%'; });
  grid.addEventListener('input', () => { const v = grid.value / 100; document.documentElement.style.setProperty('--grid-op', String(v)); sky.setGraticule(v > 0.02); $('#rg-grid-v').textContent = grid.value + '%'; });
  bus.on('bands', buildBandDots); bus.on('band', buildBandDots); bus.on('lang', buildBandDots);
  bus.on('ir-set', (v) => setIr(v));

  /* dial + zoom */
  buildDial(); sky.on('view', updateViewReadouts); sky.on('resize', updateViewReadouts);
  $('#btn-zoomx').addEventListener('click', () => {
    const v = sky.getView(), presets = [70, 35, 14, 5, 1.5], next = presets.find((p) => p < v.fov * 0.9) || presets[0];
    sky.flyTo({ fov: next });
    announce(t('zoom.announce', { n: (HOME.fov / next).toFixed(1) }));
  });
  $('#dial-reset').addEventListener('click', () => { sky.flyTo({ roll: 0 }); announce(t('dial.reset')); });

  /* crumb, stats */
  ['target', 'obs', 'history', 'lang', 'bands', 'band'].forEach((e) => bus.on(e, () => { updateCrumb(); updateStats(); updateBack(); }));
  updateCrumb(); updateStats(); updateBack(); updateViewReadouts(); buildBandDots(); refreshTools();
}

function needPos(fn) {
  if (S.pos) return fn();
  toast(t('need.target')); UI.open('search');
}

function refreshTools() {
  const map = { search: 'search', observe: 'viewer', compare: null, stories: 'stories', assistant: 'assistant', settings: 'settings', help: 'help', analysis: 'analysis' };
  $$('.tool, .tr-btn').forEach((b) => { const n = map[b.dataset.act]; b.classList.toggle('on', !!n && UI.isOpen(n)); });
  $('#btn-ask').classList.toggle('on', UI.isOpen('assistant'));
  document.documentElement.dataset.dock = UI.isOpen('info') || UI.isOpen('assistant') ? '1' : '';
}

function updateBack() {
  const el = $('#back-label');
  el.textContent = S.history.length ? t('nav.back.prev') : (S.target || S.pos) ? t('nav.back.sky') : t('nav.back.reset');
  $('#btn-back').setAttribute('aria-label', el.textContent);
}

function updateCrumb() {
  const c = $('#crumb'); c.textContent = '';
  if (S.target) {
    c.append(h('div', { class: 'name', text: loc(S.target.name) }), h('div', { class: 'sub', text: [loc(S.target.typeLabel) || t('cls.' + S.target.classification), S.target.constellation && t('const.' + S.target.constellation) !== 'const.' + S.target.constellation ? t('const.' + S.target.constellation) : S.target.constellation].filter(Boolean).join(' · ') }));
  } else if (S.pos) {
    c.append(h('div', { class: 'name', text: t('sel.position') }), h('div', { class: 'sub ltr mono', text: S.pos.ra.toFixed(2) + '°  ' + (S.pos.dec >= 0 ? '+' : '−') + Math.abs(S.pos.dec).toFixed(2) + '°' }));
  } else {
    c.append(h('div', { class: 'name', text: t('crumb.sky') }), h('div', { class: 'sub', text: t('crumb.hint') }));
  }
}

function updateStats() {
  const v = sky.getView(), obsObserved = C.observed().length;
  $('#st-ra').textContent = v.ra.toFixed(2) + '°';
  $('#st-dec').textContent = (v.dec < 0 ? '−' : '+') + Math.abs(v.dec).toFixed(2) + '°';
  $('#st-fov').textContent = f1(v.fov) + '°';
  $('#st-visits').textContent = S.obsStatus === 'loading' ? '…' : S.pos ? (obsObserved + (S.obs.length > obsObserved ? ' / ' + S.obs.length : '')) : '—';
  const band = S.band === 'composite' ? t('band.all') : (() => { const b = S.bands.find((x) => x.id === S.band); return b ? b.minMicron + '–' + b.maxMicron + ' µm' : String(S.band); })();
  $('#st-band').textContent = band;
  const d = window.SX.data.describe(); $('#st-data').textContent = d.simulated ? t('stat.demo') : t('stat.live');
  $('#coord-line').textContent = `${Math.abs(v.dec).toFixed(4)}°${v.dec < 0 ? 'S' : 'N'}  ${v.ra.toFixed(4)}°E · ${t('coord.icrs')}`;
}

function updateViewReadouts() {
  const v = sky.getView();
  $('#st-ra').textContent = v.ra.toFixed(2) + '°'; $('#st-dec').textContent = (v.dec < 0 ? '−' : '+') + Math.abs(v.dec).toFixed(2) + '°'; $('#st-fov').textContent = f1(v.fov) + '°';
  const z = HOME.fov / v.fov; $('#btn-zoomx').textContent = (z >= 10 ? Math.round(z) : z.toFixed(1).replace('.0', '')) + 'x';
  $('#coord-line').textContent = `${Math.abs(v.dec).toFixed(4)}°${v.dec < 0 ? 'S' : 'N'}  ${v.ra.toFixed(4)}°E · ${t('coord.icrs')}`;
  setDial(v.roll);
}

function buildBandDots() {
  const box = $('#band-dots'); box.textContent = '';
  const mk = (id, label) => h('button', { type: 'button', class: 'dot-btn', 'aria-pressed': S.band === id ? 'true' : 'false', 'aria-label': label, title: label, onclick: () => { C.setBand(id); announce(label); } });
  box.append(mk('composite', t('band.all')));
  S.bands.forEach((b) => box.append(mk(b.id, t('band.n', { n: b.id }) + ' · ' + b.minMicron + '–' + b.maxMicron + ' µm')));
  $('#band-v').textContent = S.band === 'composite' ? t('band.all') : String(S.band);
}

/* ---------- rotation dial ---------- */
let roll = 0;
function buildDial() {
  const g = $('#dial-ticks');
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180, major = i % 6 === 0, r1 = major ? 84 : 89, r2 = 96, l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', 100 + r1 * Math.sin(a)); l.setAttribute('y1', 100 - r1 * Math.cos(a)); l.setAttribute('x2', 100 + r2 * Math.sin(a)); l.setAttribute('y2', 100 - r2 * Math.cos(a));
    l.setAttribute('stroke', 'currentColor'); l.setAttribute('stroke-width', major ? 1.6 : 1); l.setAttribute('opacity', major ? 0.85 : 0.45); g.append(l);
  }
  const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('cx', 100); ring.setAttribute('cy', 100); ring.setAttribute('r', 70); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', 'currentColor'); ring.setAttribute('stroke-opacity', 0.3); ring.setAttribute('stroke-width', 1); g.append(ring);
  const dial = $('#dial'); let drag = null;
  const ang = (e) => { const r = dial.getBoundingClientRect(); return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI; };
  dial.addEventListener('pointerdown', (e) => { dial.setPointerCapture(e.pointerId); drag = { a: ang(e), roll: sky.getView().roll }; sky.stopFly(); });
  dial.addEventListener('pointermove', (e) => { if (!drag) return; let d = ang(e) - drag.a; if (d > 180) d -= 360; if (d < -180) d += 360; drag.a = ang(e); drag.roll -= d; sky.setView({ roll: drag.roll }); });
  const end = () => { drag = null; }; dial.addEventListener('pointerup', end); dial.addEventListener('pointercancel', end);
  dial.addEventListener('keydown', (e) => {
    const s = e.shiftKey ? 15 : 5; let r = sky.getView().roll;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') r += s; else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') r -= s; else if (e.key === 'Home') r = 0; else return;
    e.preventDefault(); sky.setView({ roll: r });
  });
  dial.addEventListener('wheel', (e) => { e.preventDefault(); sky.setView({ roll: sky.getView().roll + Math.sign(e.deltaY) * 4 }); }, { passive: false });
}
function setDial(r) {
  roll = r; const n = ((((r + 180) % 360) + 360) % 360) - 180;
  $('#dial-north').setAttribute('transform', `rotate(${-r} 100 100)`);
  $('#dial').setAttribute('aria-valuenow', Math.round(n)); $('#dial-val').textContent = Math.round(n) + '°';
  const a = (-n * Math.PI) / 180, R = 78, x = 100 + R * Math.sin(a), y = 100 - R * Math.cos(a);
  $('#dial-arc').setAttribute('d', Math.abs(n) < 0.5 ? '' : `M100 ${100 - R} A${R} ${R} 0 ${Math.abs(n) > 180 ? 1 : 0} ${a < 0 ? 0 : 1} ${x.toFixed(2)} ${y.toFixed(2)}`);
}
