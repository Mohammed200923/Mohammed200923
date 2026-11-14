/* Search overlay: object name search + RA/Dec entry with validation. All data comes from SX.data. */
import { $, h, icon, announce, trapFocus } from '../core/dom.js';
import { S, bus } from '../core/state.js';
import { t, loc } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';
import { errorState, loadingState } from './common.js';

let root, release, open = false, sky, token = 0, results = [], active = -1, timer, coordsOpen = false;

export function init(skyApi) { sky = skyApi; UI.register('search', { kind: 'overlay', open: show, close: hide, isOpen: () => open }); bus.on('lang', () => open && build(true)); }

function show() {
  open = true; root = h('div', { class: 'overlay search', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('search.title') }); document.body.append(root);
  build(); release = trapFocus(root, hide); requestAnimationFrame(() => root.classList.add('in'));
  $('#sq', root).focus(); bus.emit('panel'); query('');
}
function hide() { open = false; token++; root.classList.remove('in'); const r = root; setTimeout(() => r.remove(), 240); release && release(); bus.emit('panel'); }

function build(keep) {
  const val = keep && $('#sq', root) ? $('#sq', root).value : '';
  root.textContent = '';
  const input = h('input', { id: 'sq', class: 'sq', type: 'search', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: t('search.placeholder'), 'aria-label': t('search.title'), role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'sresults', value: val });
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => query(input.value), 160); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); chooseActive(); }
  });
  const panel = h('div', { class: 'spanel' },
    h('div', { class: 'sbar' }, icon('search'), input, h('button', { class: 'x', type: 'button', 'aria-label': t('common.close'), onclick: hide }, icon('close'))),
    h('p', { class: 'muted shint', text: t('search.hint') }),
    h('div', { id: 'sresults', class: 'sresults', role: 'listbox', 'aria-label': t('search.results') }),
    coordForm());
  root.append(panel); root.addEventListener('pointerdown', (e) => { if (e.target === root) hide(); });
  if (keep) { query(val); input.focus(); }
}

function coordForm() {
  const wrap = h('details', { class: 'coords', open: coordsOpen ? '' : null });
  wrap.addEventListener('toggle', () => { coordsOpen = wrap.open; });
  wrap.append(h('summary', {}, h('span', { text: t('search.coords') }), icon('chev')));
  const ra = h('input', { class: 'num ltr', id: 'c-ra', placeholder: '05h 35m 17s  /  83.82', inputmode: 'text', autocomplete: 'off', 'aria-describedby': 'c-ra-e', 'aria-label': t('search.ra') });
  const dec = h('input', { class: 'num ltr', id: 'c-dec', placeholder: '-05° 23′ 17″  /  -5.39', inputmode: 'text', autocomplete: 'off', 'aria-describedby': 'c-dec-e', 'aria-label': t('search.dec') });
  const raE = h('span', { class: 'ferr', id: 'c-ra-e', role: 'alert' }), decE = h('span', { class: 'ferr', id: 'c-dec-e', role: 'alert' });
  const go = async () => {
    raE.textContent = decE.textContent = '';
    const r = await C.goToText(ra.value, dec.value);
    if (!r.ok) { if (r.errors.ra) { raE.textContent = t('coord.err.' + r.errors.ra); ra.setAttribute('aria-invalid', 'true'); } else ra.removeAttribute('aria-invalid'); if (r.errors.dec) { decE.textContent = t('coord.err.' + r.errors.dec); dec.setAttribute('aria-invalid', 'true'); } else dec.removeAttribute('aria-invalid'); announce(t('coord.err.summary')); return; }
    hide(); announce(t('search.went', { ra: r.ra.toFixed(2), dec: r.dec.toFixed(2) }));
  };
  [ra, dec].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }));
  wrap.append(h('div', { class: 'cf' },
    h('label', {}, h('span', { text: t('search.ra') }), ra, raE), h('label', {}, h('span', { text: t('search.dec') }), dec, decE),
    h('p', { class: 'muted', text: t('search.coords.help') }), h('button', { class: 'btn primary', type: 'button', onclick: go, text: t('search.go') })));
  return wrap;
}

async function query(q) {
  const my = ++token, box = $('#sresults', root); if (!box) return; box.textContent = ''; results = []; active = -1;
  q = q.trim();
  if (q && window.SX.coords.looksLikeCoords(q)) {
    const p = window.SX.coords.parseCombined(q);
    if (p.ok) { box.append(row({ coordsGo: true, label: t('search.go_coords', { ra: p.ra.toFixed(3), dec: p.dec.toFixed(3) }), sub: t('search.coords_detected'), run: async () => { await C.goToText(q); hide(); } })); setActive(0); return; }
    box.append(h('div', { class: 'state' }, icon('info'), h('span', { text: t('search.coords_bad') }))); return;
  }
  box.append(loadingState(t('common.loading')));
  const r = await window.SX.data.searchTargets(q); if (my !== token) return; box.textContent = '';
  if (r.status === 'error') { box.append(errorState(r.error, () => query(q))); return; }
  if (!q) box.append(h('div', { class: 'eyebrow', text: t('search.suggest') }));
  if (!r.data.length) { box.append(h('div', { class: 'state' }, icon('info'), h('strong', { text: t('search.none') }), h('span', { text: t('search.none.body') }))); return; }
  r.data.forEach((tg) => box.append(row({ tg, label: loc(tg.name), sub: [loc(tg.typeLabel) || t('cls.' + tg.classification), tg.constellation].filter(Boolean).join(' · '), run: () => { hide(); C.selectTarget(tg); } })));
  setActive(0); announce(t('search.count', { n: r.data.length }));
}

function row(it) {
  const idx = results.length; results.push(it);
  const b = h('div', { class: 'sres', role: 'option', id: 'sr-' + idx, tabindex: '-1', 'aria-selected': 'false', onclick: () => it.run() }, h('span', { class: 'sres-n', text: it.label }), h('span', { class: 'sres-s', text: it.sub }), it.tg && it.tg.isSimulated ? h('span', { class: 'chip demo', text: t('prov.demo') }) : null);
  b.addEventListener('pointermove', () => setActive(idx)); return b;
}
function setActive(i) { active = i; results.forEach((_, k) => { const e = $('#sr-' + k, root); e && e.setAttribute('aria-selected', k === i ? 'true' : 'false'); }); const e = $('#sr-' + i, root); if (e) { $('#sq', root).setAttribute('aria-activedescendant', e.id); e.scrollIntoView({ block: 'nearest' }); } }
function move(d) { if (results.length) setActive((active + d + results.length) % results.length); }
function chooseActive() { if (results[active]) results[active].run(); else { const v = $('#sq', root).value; if (v.trim()) query(v); } }
