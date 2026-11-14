/* Settings sheet: everything chosen in onboarding can be changed here. */
import { h, icon, trapFocus } from '../core/dom.js';
import { prefs, setPrefs, bus } from '../core/state.js';
import { t, setLang } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import { applyAppearance } from '../core/appearance.js';
import { panelHead } from './common.js';

let root, release, open = false, logOff = null;

export function init() { UI.register('settings', { kind: 'overlay', open: show, close: hide, isOpen: () => open }); bus.on('lang', () => open && render()); }
function show() { open = true; root = h('div', { class: 'overlay sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('set.title') }); document.body.append(root); render(); release = trapFocus(root, hide); requestAnimationFrame(() => root.classList.add('in')); bus.emit('panel'); }
function hide() { open = false; logOff && logOff(); root.classList.remove('in'); const r = root; setTimeout(() => r.remove(), 280); release && release(); bus.emit('panel'); }

const seg = (name, opts, cur, pick) => h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name }, opts.map(([v, label]) => h('button', { class: 'seg-b', type: 'button', role: 'radio', 'aria-checked': cur === v ? 'true' : 'false', onclick: () => pick(v), text: label })));
const sw = (label, desc, key) => h('button', { class: 'ocard row compact', type: 'button', role: 'switch', 'aria-checked': prefs[key] ? 'true' : 'false', onclick: () => { setPrefs({ [key]: !prefs[key] }); applyAppearance(); render(); } }, h('span', {}, h('span', { class: 'oc-t', text: label }), desc ? h('span', { class: 'oc-d', text: desc }) : null), h('span', { class: 'switch' + (prefs[key] ? ' on' : '') }, h('i')));
const group = (title, ...kids) => h('section', { class: 'vsec' }, h('h3', { text: title }), kids);

function render() {
  const keep = root.querySelector('.sheet-b') ? root.querySelector('.sheet-b').scrollTop : 0; logOff && logOff(); logOff = null;
  root.textContent = '';
  const b = h('div', { class: 'sheet-b' });
  b.append(
    group(t('set.language'), seg(t('set.language'), [['en', 'English'], ['ar', 'العربية']], prefs.lang, (v) => { setLang(v); applyAppearance(); })),
    group(t('set.appearance'), seg(t('set.appearance'), [['dark', t('theme.dark')], ['light', t('theme.light')], ['system', t('theme.system')]], prefs.theme, (v) => { setPrefs({ theme: v }); applyAppearance(); render(); })),
    group(t('set.level'), seg(t('set.level'), [['beginner', t('level.beginner')], ['intermediate', t('level.intermediate')], ['advanced', t('level.advanced')]], prefs.level, (v) => { setPrefs({ level: v }); applyAppearance(); bus.emit('level'); render(); }), h('p', { class: 'muted', text: t('level.' + prefs.level + '.d') })),
    group(t('set.access'), h('span', { class: 'eyebrow', text: t('set.motion') }), seg(t('set.motion'), [['system', t('motion.system')], ['on', t('motion.on')], ['off', t('motion.off')]], prefs.reducedMotion, (v) => { setPrefs({ reducedMotion: v }); applyAppearance(); render(); }),
      sw(t('set.large'), t('set.large.d'), 'largeText'), sw(t('set.contrast'), t('set.contrast.d'), 'contrast')),
    group(t('set.performance'), sw(t('set.lowperf'), t('set.lowperf.d'), 'lowPerf')),
    group(t('set.setup'), h('button', { class: 'btn', type: 'button', onclick: () => { hide(); setTimeout(() => UI.open('onboarding', { replay: true }), 300); }, text: t('set.replay') }),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { try { localStorage.removeItem('sxi.prefs.v1'); } catch (e) { /* ignore */ } location.reload(); }, text: t('set.resetall') })));
  const d = window.SX.data.describe();
  b.append(group(t('set.data'), h('p', {}, h('span', { class: 'chip ' + (d.simulated ? 'demo' : 'real'), text: d.simulated ? t('prov.demo') : t('prov.real') }), ' ', h('strong', { text: d.name })), h('p', { class: 'muted', text: d.note || t('set.data.note') })));
  /* advanced: data inspector + demo controls */
  const adv = h('div', { class: 'lvl-adv' });
  const ctl = window.SX.data.demoControls();
  if (ctl) {
    const sel = (key, vals) => h('label', { class: 'sl2' }, h('span', { text: t('dev.' + key) }), h('select', { class: 'num', onchange: (e) => { ctl[key] = e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value; window.SX.data.clearCache(); } }, vals.map((v) => h('option', { value: String(v), selected: String(ctl[key]) === String(v) ? '' : null, text: String(v) }))));
    adv.append(group(t('dev.title'), h('p', { class: 'muted', text: t('dev.hint') }), sel('latency', ['fast', 'normal', 'slow']), sel('failure', ['none', 'network', 'timeout', 'random']), sel('noImages', [false, true]), sel('noObservations', [false, true])));
  }
  const log = h('ul', { class: 'plain logl' });
  const fill = (rows) => { log.textContent = ''; rows.slice(0, 14).forEach((r) => log.append(h('li', {}, h('span', { class: 'ltr mono', text: r.fn }), h('span', { class: 'chip ' + (r.status === 'ok' ? 'real' : r.status === 'error' ? 'bad' : ''), text: r.status + (r.ms != null ? ' · ' + r.ms + 'ms' : '') })))); };
  fill(window.SX.data.getLog()); logOff = window.SX.data.onLog(fill);
  adv.append(group(t('dev.inspector'), log));
  b.append(adv);
  root.append(h('div', { class: 'sheet' }, panelHead(t('set.title'), hide), b));
  root.addEventListener('pointerdown', (e) => { if (e.target === root) hide(); });
  b.scrollTop = keep;
}
void icon;
