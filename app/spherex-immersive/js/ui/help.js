/* Help: three-step basics, a spotlight tour of the interface, keyboard shortcuts, and a clear way back to the start. */
import { $, h, icon, trapFocus, announce } from '../core/dom.js';
import { bus } from '../core/state.js';
import { t } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';
import { panelHead } from './common.js';

let root, release, open = false, tourEl = null;
const TOUR = [['#sky', 'tour.sky'], ['#toolbar', 'tour.toolbar'], ['#minimap', 'tour.map'], ['#timeline', 'tour.timeline'], ['#dial-wrap', 'tour.dial'], ['#btn-ask', 'tour.ask']];

export function init() { UI.register('help', { kind: 'overlay', open: show, close: hide, isOpen: () => open }); bus.on('lang', () => open && render()); document.addEventListener('keydown', (e) => { if (e.target.matches('input,textarea,select')) return; if (e.key === '?' || (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey)) UI.toggle('help'); else if (e.key === '/' && !UI.isOpen('search')) { e.preventDefault(); UI.open('search'); } }); }
function show() { open = true; root = h('div', { class: 'overlay sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('help.title') }); document.body.append(root); render(); release = trapFocus(root, hide); requestAnimationFrame(() => root.classList.add('in')); bus.emit('panel'); }
function hide() { open = false; root.classList.remove('in'); const r = root; setTimeout(() => r.remove(), 280); release && release(); bus.emit('panel'); }

function render() {
  root.textContent = '';
  const steps = h('ol', { class: 'steps' }, [['help.s1.t', 'help.s1.d', 'explore'], ['help.s2.t', 'help.s2.d', 'target'], ['help.s3.t', 'help.s3.d', 'story']].map(([a, b, ic], i) => h('li', {}, h('span', { class: 'step-n', text: i + 1 }), h('div', {}, h('strong', { text: t(a) }), h('p', { class: 'muted', text: t(b) })))));
  const keys = [['/', 'key.search'], ['← ↑ → ↓', 'key.pan'], ['+  −', 'key.zoom'], ['Q  E', 'key.rotate'], ['Space', 'key.play'], ['[  ]', 'key.step'], ['?', 'key.help'], ['Esc', 'key.close']];
  const kt = h('dl', { class: 'kv keys' }); keys.forEach(([k, d]) => kt.append(h('dt', { class: 'ltr mono', text: k }), h('dd', { text: t(d) })));
  const b = h('div', { class: 'sheet-b' },
    h('section', { class: 'vsec' }, h('h3', { text: t('help.basics') }), steps),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { hide(); setTimeout(startTour, 350); }, text: t('help.tour') }), h('button', { class: 'btn', type: 'button', onclick: () => { hide(); setTimeout(() => UI.open('assistant'), 300); }, text: t('help.ask') }), h('button', { class: 'btn', type: 'button', onclick: () => { hide(); C.reset(); }, text: t('help.start_over') }), h('button', { class: 'btn ghost', type: 'button', onclick: () => { hide(); setTimeout(() => UI.open('settings'), 300); }, text: t('nav.settings') })),
    h('section', { class: 'vsec lvl-int' }, h('h3', { text: t('help.keys') }), kt),
    h('section', { class: 'vsec' }, h('h3', { text: t('help.about') }), h('p', { class: 'muted', text: t('help.about.d') })));
  root.append(h('div', { class: 'sheet' }, panelHead(t('help.title'), hide), b));
  root.addEventListener('pointerdown', (e) => { if (e.target === root) hide(); });
}

function startTour() {
  let i = 0; tourEl && tourEl.remove();
  const ring = h('div', { class: 'tour-ring' }), pop = h('div', { class: 'tour-pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('help.tour') }), shade = h('div', { class: 'tour-shade' });
  tourEl = h('div', { class: 'tour' }, shade, ring, pop); document.body.append(tourEl);
  const end = () => { tourEl.remove(); tourEl = null; release2 && release2(); };
  let release2;
  const place = () => {
    const [sel, key] = TOUR[i], el = $(sel), r = el.getBoundingClientRect(), pad = 8;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    pop.textContent = '';
    pop.append(h('span', { class: 'eyebrow', text: `${i + 1} / ${TOUR.length}` }), h('p', { text: t(key) }), h('div', { class: 'actions' },
      h('button', { class: 'btn small ghost', type: 'button', onclick: end, text: t('common.close') }), i > 0 ? h('button', { class: 'btn small', type: 'button', onclick: () => { i--; place(); }, text: t('common.back') }) : null,
      h('button', { class: 'btn small primary', type: 'button', onclick: () => { if (i < TOUR.length - 1) { i++; place(); } else end(); }, text: i < TOUR.length - 1 ? t('common.next') : t('common.done') })));
    const pw = 300, ph = pop.offsetHeight || 150, vw = window.innerWidth, vh = window.innerHeight;
    let x = r.left + r.width / 2 - pw / 2, y = r.bottom + 16; if (y + ph > vh - 10) y = Math.max(10, r.top - ph - 16); if (r.height > vh * 0.6) { y = vh / 2 - ph / 2; }
    x = Math.max(10, Math.min(vw - pw - 10, x)); pop.style.left = x + 'px'; pop.style.top = y + 'px'; pop.style.width = pw + 'px';
    announce(t(key)); const b = pop.querySelector('.primary'); b && b.focus();
  };
  release2 = trapFocus(tourEl, end); place();
}
void icon;
