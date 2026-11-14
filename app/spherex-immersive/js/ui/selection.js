/* Sky overlays: target labels, hover, pinned position and the selection box with its stacked context menu. */
import { $, h, icon, announce } from '../core/dom.js';
import { S, bus } from '../core/state.js';
import { t, loc } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';

let sky, labelsEl, selEl, menuEl, labelEl, pinEl, lastSig = '', hoverId = null;
const labelNodes = new Map();

export function init(skyApi) {
  sky = skyApi; labelsEl = $('#labels'); selEl = $('#sel'); menuEl = $('#sel-menu'); labelEl = $('#sel-label'); pinEl = $('#pin');
  sky.on('frame', update);
  sky.on('hover', onHover);
  sky.on('click', onClick);
  $('#sky').addEventListener('keydown', (e) => { if (e.key === 'Escape' && (S.target || S.pos)) { C.clearSelection(); announce(t('sel.cleared')); } });
  sky.on('resize', () => { lastSig = ''; });
  bus.on('featured', buildLabels); bus.on('target', () => { buildSel(); lastSig = ''; }); bus.on('lang', () => { buildLabels(); buildSel(); });
  bus.on('obs', buildSel); bus.on('level', buildSel); bus.on('panel', updateOffset);
  menuEl.addEventListener('keydown', (e) => {
    const items = Array.from(menuEl.querySelectorAll('button:not(:disabled)')), i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Escape') { C.clearSelection(); $('#sky').focus(); }
  });
  menuEl.addEventListener('pointerover', (e) => { const b = e.target.closest('button'); if (b) menuEl.querySelectorAll('.hi').forEach((x) => x.classList.remove('hi')); });
}

function buildLabels() {
  labelsEl.textContent = ''; labelNodes.clear();
  S.targets.forEach((tg) => { const el = h('div', { class: 'tlabel', text: loc(tg.name) }); labelsEl.append(el); labelNodes.set(tg.id, el); });
  lastSig = '';
}

function onHover(p) {
  if (!p || p.touch) { hoverId = null; sky.setHover(null); $('#sky').style.cursor = ''; return; }
  const near = sky.pickNear(p.x, p.y, 26); hoverId = near ? near.id : null; sky.setHover(hoverId);
  $('#sky').style.cursor = near ? 'pointer' : '';
  labelNodes.forEach((el, id) => el.classList.toggle('hover', id === hoverId));
}

function onClick(p) {
  const near = sky.pickNear(p.x, p.y, p.touch ? 46 : 30);
  if (near) { C.selectTarget(near); return; }
  const r = sky.unproject(p.x, p.y);
  C.selectPosition(r.ra, r.dec, { fly: false });
}

function menuItems() {
  const tg = S.target, items = [];
  if (tg) {
    items.push({ id: 'story', label: t('ctx.story'), icon: 'story', run: () => UI.open('stories', { targetId: tg.id }) });
    items.push({ id: 'analyze', label: t('ctx.analyze'), icon: 'info', run: () => UI.open('analysis') });
    items.push({ id: 'zoom', label: t('ctx.zoom'), icon: 'target', run: () => { const v = sky.getView(); sky.flyTo({ ra: tg.coordinates.ra, dec: tg.coordinates.dec, fov: v.fov <= 3 ? C.fovFor(tg) : Math.max(1.5, v.fov / 3.5) }); } });
    items.push({ id: 'obs', label: t('ctx.observe'), icon: 'observe', run: () => UI.open('viewer', { mode: 'single' }) });
  } else {
    if (S.nearest) items.push({ id: 'near', label: t('ctx.nearest', { name: loc(S.nearest.name) }), icon: 'target', run: () => C.selectTarget(S.nearest) });
    items.push({ id: 'obs', label: t('ctx.observe_here'), icon: 'observe', run: () => UI.open('viewer', { mode: 'single' }) });
    items.push({ id: 'analyze', label: t('ctx.analyze'), icon: 'info', run: () => UI.open('analysis') });
    items.push({ id: 'zoom', label: t('ctx.zoom'), icon: 'target', run: () => sky.flyTo({ ra: S.pos.ra, dec: S.pos.dec, fov: Math.max(1.5, sky.getView().fov / 3.5) }) });
  }
  return items;
}

export function updateOffset() {
  const w = window.innerWidth, has = !!(S.target || S.pos), dock = UI.isOpen('info') || UI.isOpen('assistant'), rtl = document.documentElement.dir === 'rtl';
  let dx = 0, dy = 0;
  if (has && w < 700) dy = Math.round(sky.getSize().h * 0.14); else if (has && dock && w < 1100) dx = (rtl ? -1 : 1) * Math.max(0, Math.round(w / 2 - (w - 24 - 380 - 70)));
  sky.setCenterOffset && sky.setCenterOffset(dx, dy); lastSig = '';
}

function buildSel() {
  const has = !!(S.target || S.pos);
  updateOffset();
  selEl.hidden = !has; pinEl.hidden = true;
  sky && sky.setSelected(S.target ? S.target.id : null);
  labelNodes.forEach((el, id) => { el.style.visibility = S.target && S.target.id === id ? 'hidden' : ''; });
  if (!has) return;
  const tg = S.target;
  labelEl.textContent = '';
  if (tg) {
    labelEl.append(h('div', { class: 'n', text: loc(tg.name) }), h('div', { class: 'd', text: loc(tg.typeLabel) || t('cls.' + tg.classification) }));
    if (tg.isSimulated) labelEl.append(h('span', { class: 'chip demo', text: t('prov.demo') }));
  } else {
    labelEl.append(h('div', { class: 'n', text: t('sel.position') }), h('div', { class: 'd ltr mono', text: window.SX.fmtRA(S.pos.ra) + '  ' + window.SX.fmtDec(S.pos.dec) }));
    if (S.nearest) labelEl.append(h('div', { class: 'd', text: t('sel.nearest', { name: loc(S.nearest.name), deg: (S.nearest.separationDeg || 0).toFixed(1) }) }));
  }
  menuEl.textContent = '';
  menuItems().forEach((it, i) => {
    const b = h('button', { type: 'button', role: 'menuitem', class: it.id === 'analyze' ? 'hi' : '', onclick: () => it.run() }, h('span', { text: it.label }), icon('chev', 'chev-r'));
    b.querySelector('.chev-r').style.transform = document.documentElement.dir === 'rtl' ? 'rotate(90deg)' : 'rotate(-90deg)';
    menuEl.append(h('li', { role: 'none' }, b));
  });
  announce(tg ? t('sel.announce', { name: loc(tg.name) }) : t('sel.announce_pos'));
}

function update() {
  const v = sky.getView(), sz = sky.getSize(), sig = [v.ra.toFixed(3), v.dec.toFixed(3), v.fov.toFixed(3), v.roll.toFixed(1), sz.w, sz.h, S.target && S.target.id, S.pos && S.pos.ra].join('|');
  if (sig === lastSig) return; lastSig = sig;
  const narrow = sz.w < 700, ppd = sky.pixelsPerDegree(), near = new Set();
  if (narrow) S.targets.map((tg) => { const p = sky.project(tg.coordinates.ra, tg.coordinates.dec); return [Math.hypot(p.x - sz.w / 2, p.y - sz.h / 2), tg.id, p.visible]; }).filter((x) => x[2]).sort((a, b) => a[0] - b[0]).slice(0, 4).forEach((x) => near.add(x[1]));
  S.targets.forEach((tg) => {
    const el = labelNodes.get(tg.id); if (!el) return;
    const p = sky.project(tg.coordinates.ra, tg.coordinates.dec);
    const show = p.visible && (!narrow || near.has(tg.id)) && !(S.target && S.target.id === tg.id);
    el.style.display = show ? '' : 'none'; if (show) el.style.transform = `translate(${(p.x + 24).toFixed(1)}px,${(p.y - 6).toFixed(1)}px)`;
  });
  const pos = S.target ? S.target.coordinates : S.pos;
  if (pos) {
    const p = sky.project(pos.ra, pos.dec);
    selEl.style.display = p.visible ? '' : 'none';
    if (p.visible) {
      const size = S.target ? Math.max(64, Math.min(230, (S.target.angularSizeDeg || 0.02) * ppd)) : 44;
      selEl.style.setProperty('--sz', size.toFixed(0) + 'px');
      selEl.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
      const dockOpen = (UI.isOpen('info') || UI.isOpen('assistant')) && sz.w >= 700 && sz.w < 1100, rtl = document.documentElement.dir === 'rtl', flip = rtl ? (p.x < 440 && sz.w >= 700) || dockOpen : (p.x > sz.w - 440 && sz.w >= 700) || dockOpen; selEl.dataset.flip = flip ? '1' : '';
      selEl.classList.toggle('compact', narrow);
    }
  }
}
