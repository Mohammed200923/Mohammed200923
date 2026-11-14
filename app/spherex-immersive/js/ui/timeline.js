/* Collapsible observation timeline: previous / play / next, visit dates, speed, comparison shortcut. */
import { $, h, icon, fmtDate, announce } from '../core/dom.js';
import { S, bus } from '../core/state.js';
import { t, lang, loc } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';
import { errorState } from './common.js';

const SPEEDS = [0.5, 1, 2];

export function init() {
  const tl = $('#timeline'), toggle = $('#tl-toggle');
  const setCollapsed = (c) => { tl.dataset.collapsed = c ? 'true' : 'false'; toggle.setAttribute('aria-expanded', c ? 'false' : 'true'); };
  setCollapsed(window.innerWidth < 760);
  toggle.addEventListener('click', () => setCollapsed(tl.dataset.collapsed !== 'true'));
  ['obs', 'visit', 'play', 'speed', 'lang', 'target'].forEach((e) => bus.on(e, render));
  render();
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && e.target.id === 'sky') { e.preventDefault(); C.togglePlay(); }
    else if (e.key === '[' ) C.stepVisit(-1); else if (e.key === ']') C.stepVisit(1);
  });
}

function render() {
  const body = $('#tl-body'), sum = $('#tl-sum'); body.textContent = '';
  const name = S.target ? loc(S.target.name) : S.pos ? t('sel.position') : '';
  if (S.obsStatus === 'idle') { sum.textContent = ''; body.append(h('p', { class: 'eyebrow', style: 'text-transform:none;letter-spacing:.02em;font-size:.8125rem', text: t('tl.idle') })); return; }
  if (S.obsStatus === 'loading') { sum.textContent = name; body.append(h('div', { class: 'tl-row' }, h('div', { class: 'spinner' }), h('span', { text: t('tl.loading') }), h('div', { class: 'skeleton', style: 'flex:1;height:34px' }))); return; }
  if (S.obsStatus === 'error') { sum.textContent = name; body.append(errorState(S.obsError, () => C.loadObservations())); return; }
  if (S.obsStatus === 'empty') { sum.textContent = name; body.append(h('div', { class: 'state' }, h('strong', { text: t('tl.empty.title') }), h('span', { text: t('tl.empty.body') }))); return; }
  const list = C.observed(), cur = S.obs[S.visit];
  sum.textContent = `${name} · ${t('tl.visits', { n: list.length })}`;
  const prev = h('button', { class: 'tl-btn', type: 'button', 'aria-label': t('tl.prev'), title: t('tl.prev'), onclick: () => C.stepVisit(-1) }, icon('prev'));
  const next = h('button', { class: 'tl-btn', type: 'button', 'aria-label': t('tl.next'), title: t('tl.next'), onclick: () => C.stepVisit(1) }, icon('next'));
  const play = h('button', { class: 'tl-btn play', type: 'button', 'aria-label': S.playing ? t('tl.pause') : t('tl.play'), title: S.playing ? t('tl.pause') : t('tl.play'), disabled: list.length < 2, onclick: () => C.togglePlay() }, icon(S.playing ? 'pause' : 'play'));
  const visits = h('div', { class: 'visits', role: 'listbox', 'aria-label': t('tl.visits_label') });
  S.obs.forEach((o, i) => {
    const b = h('button', { type: 'button', role: 'option', class: 'visit' + (o.status !== 'observed' ? ' planned' : ''), 'aria-current': i === S.visit ? 'true' : null, 'aria-selected': i === S.visit ? 'true' : 'false', onclick: () => { C.stopPlay(); C.setVisit(i); announce(t('tl.visit_announce', { n: o.visitIndex || i + 1, d: fmtDate(o.startTime, lang()) })); } },
      h('b', { text: fmtDate(o.startTime, lang()) }), h('small', { text: o.status === 'observed' ? t('tl.visit', { n: o.visitIndex || i + 1 }) : t('status.' + o.status) }));
    visits.append(b);
  });
  const row1 = h('div', { class: 'tl-row' }, prev, play, next, visits);
  const sp = h('button', { class: 'btn small', type: 'button', 'aria-label': t('tl.speed') + ' ' + S.speed + 'x', title: t('tl.speed'), onclick: () => C.setSpeed(SPEEDS[(SPEEDS.indexOf(S.speed) + 1) % SPEEDS.length]) }, icon('timer'), h('span', { class: 'ltr mono', text: S.speed + 'x' }));
  const cmp = h('button', { class: 'btn small', type: 'button', disabled: list.length < 2, onclick: () => UI.open('viewer', { mode: 'slider' }) }, icon('compare'), h('span', { text: t('nav.compare') }));
  const vw = h('button', { class: 'btn small primary', type: 'button', onclick: () => UI.open('viewer', { mode: 'single' }) }, icon('observe'), h('span', { text: t('tl.open_viewer') }));
  body.append(row1, h('div', { class: 'tl-actions' }, sp, cmp, vw, cur ? h('span', { class: 'chip ' + (cur.isSimulated ? 'demo' : 'real'), text: cur.isSimulated ? t('prov.demo') : t('prov.real') }) : null));
  const act = visits.querySelector('[aria-current]'); act && act.scrollIntoView({ inline: 'center', block: 'nearest', behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth' });
}
