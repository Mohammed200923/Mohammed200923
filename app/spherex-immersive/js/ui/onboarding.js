/* First-run setup: welcome -> language -> appearance -> experience level -> accessibility -> done. Optional, skippable, saved locally. */
import { h, icon, trapFocus, announce } from '../core/dom.js';
import { prefs, setPrefs, bus } from '../core/state.js';
import { t, setLang } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import { applyAppearance } from '../core/appearance.js';

let root, release, open = false, step = 0;
const STEPS = ['welcome', 'language', 'appearance', 'level', 'access', 'done'];

export function init() { UI.register('onboarding', { kind: 'overlay', open: show, close: hide, isOpen: () => open }); }
function show(arg = {}) { open = true; step = arg.replay ? 1 : 0; root = h('div', { class: 'overlay onboard', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ob.title') }); document.body.append(root); render(); release = trapFocus(root, finishSkip); requestAnimationFrame(() => root.classList.add('in')); bus.emit('panel'); }
function hide() { open = false; root.classList.remove('in'); const r = root; setTimeout(() => r.remove(), 300); release && release(); bus.emit('panel'); }
function finishSkip() { setPrefs({ onboarded: true }); hide(); }
function finish() { setPrefs({ onboarded: true }); hide(); announce(t('ob.saved')); }

function radio(label, desc, checked, onPick, extra) {
  return h('button', { class: 'ocard', type: 'button', role: 'radio', 'aria-checked': checked ? 'true' : 'false', onclick: onPick }, extra || null, h('span', { class: 'oc-t', text: label }), desc ? h('span', { class: 'oc-d', text: desc }) : null);
}
function toggle(label, desc, key) {
  const on = !!prefs[key];
  return h('button', { class: 'ocard row', type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', onclick: () => { setPrefs({ [key]: !prefs[key] }); applyAppearance(); render(); } }, h('span', {}, h('span', { class: 'oc-t', text: label }), h('span', { class: 'oc-d', text: desc })), h('span', { class: 'switch' + (on ? ' on' : '') }, h('i')));
}

function render() {
  root.textContent = '';
  const id = STEPS[step], body = h('div', { class: 'ob-body' });
  const skip = h('button', { class: 'btn small ghost ob-skip', type: 'button', onclick: finishSkip, text: t('ob.skip') });
  const dots = h('div', { class: 'ob-dots', 'aria-hidden': 'true' }, STEPS.map((_, i) => h('i', { class: i === step ? 'on' : i < step ? 'done' : '' })));
  let title = t('ob.' + id + '.title'), sub = t('ob.' + id + '.sub');
  if (id === 'welcome') {
    body.append(h('div', { class: 'ob-hero', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
  } else if (id === 'language') {
    body.append(h('div', { class: 'ogrid', role: 'radiogroup', 'aria-label': title }, radio('English', 'Left to right', prefs.lang === 'en', () => { setLang('en'); applyAppearance(); render(); }), radio('العربية', 'من اليمين إلى اليسار', prefs.lang === 'ar', () => { setLang('ar'); applyAppearance(); render(); })));
  } else if (id === 'appearance') {
    body.append(h('div', { class: 'ogrid', role: 'radiogroup', 'aria-label': title }, ['dark', 'light', 'system'].map((v) => radio(t('theme.' + v), t('theme.' + v + '.d'), prefs.theme === v, () => { setPrefs({ theme: v }); applyAppearance(); render(); }))));
  } else if (id === 'level') {
    body.append(h('div', { class: 'ogrid', role: 'radiogroup', 'aria-label': title }, ['beginner', 'intermediate', 'advanced'].map((v) => radio(t('level.' + v), t('level.' + v + '.d'), prefs.level === v, () => { setPrefs({ level: v }); applyAppearance(); bus.emit('level'); render(); }))));
  } else if (id === 'access') {
    body.append(h('div', { class: 'ostack' },
      h('div', { class: 'ogrid', role: 'radiogroup', 'aria-label': t('set.motion') }, ['system', 'on', 'off'].map((v) => radio(t('motion.' + v), null, prefs.reducedMotion === v, () => { setPrefs({ reducedMotion: v }); applyAppearance(); render(); }))),
      toggle(t('set.large'), t('set.large.d'), 'largeText'), toggle(t('set.contrast'), t('set.contrast.d'), 'contrast'), h('p', { class: 'muted', text: t('ob.keyboard') })));
  } else if (id === 'done') {
    body.append(h('p', { class: 'ob-sum', text: t('ob.summary', { lang: prefs.lang === 'ar' ? 'العربية' : 'English', theme: t('theme.' + prefs.theme), level: t('level.' + prefs.level) }) }), h('p', { class: 'muted', text: t('ob.later') }));
  }
  const nav = h('div', { class: 'ob-nav' },
    step > 0 && id !== 'done' ? h('button', { class: 'btn', type: 'button', onclick: () => { step--; render(); }, text: t('common.back') }) : h('span'),
    id === 'welcome' ? h('button', { class: 'btn primary lg', type: 'button', onclick: () => { step++; render(); }, text: t('ob.begin') })
      : id === 'done' ? h('button', { class: 'btn primary lg', type: 'button', onclick: finish, text: t('ob.explore') }) : h('button', { class: 'btn primary', type: 'button', onclick: () => { step++; render(); }, text: t('common.next') }));
  root.append(skip, h('div', { class: 'ob-card' }, dots, h('span', { class: 'eyebrow', text: id === 'welcome' ? t('app.name') : `${step} / ${STEPS.length - 2}` }), h('h2', { class: 'display', tabindex: '-1', text: title }), h('p', { class: 'ob-sub', text: sub }), body, nav));
  const hd = root.querySelector('h2'); hd && hd.focus({ preventScroll: true }); announce(title);
}
void icon;
