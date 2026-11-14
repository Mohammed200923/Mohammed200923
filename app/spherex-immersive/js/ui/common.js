/* Shared presentational helpers: error / empty states, provenance chips, metadata formatting. */
import { h, icon, fmtDate } from '../core/dom.js';
import { t, has, loc, lang } from '../core/i18n.js';

export function errorState(err, retry) {
  const code = err && err.code, title = has('err.' + code) ? t('err.' + code) : t('err.unknown');
  return h('div', { class: 'state err', role: 'alert' }, icon('warn'), h('strong', { text: title }), err && err.message ? h('span', { text: err.message }) : null,
    retry && (!err || err.retryable !== false) ? h('button', { class: 'btn small', type: 'button', onclick: retry, text: t('common.retry') }) : null);
}
export function emptyState(title, body, action) {
  return h('div', { class: 'state' }, icon('info'), h('strong', { text: title }), body ? h('span', { text: body }) : null, action || null);
}
export function loadingState(text) { return h('div', { class: 'state', role: 'status' }, h('div', { class: 'spinner' }), h('span', { text: text || t('common.loading') })); }
export function provChip(simulated, kind) {
  if (kind === 'illustrative') return h('span', { class: 'chip warn', text: t('prov.illustrative') });
  return h('span', { class: 'chip ' + (simulated ? 'demo' : 'real'), text: simulated ? t('prov.demo') : t('prov.real') });
}
export function metaLabel(f) { return has('meta.' + f.key) ? t('meta.' + f.key) : loc(f.label) || f.key; }
export function metaValue(f) {
  const v = f.value;
  if (f.key === 'startTime' && typeof v === 'string') return fmtDate(v, lang());
  if (typeof v === 'number') return (Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : String(v)) + (f.unit ? ' ' + f.unit : '');
  return String(loc(v)) + (f.unit ? ' ' + f.unit : '');
}
export function metaList(fields) {
  const dl = h('dl', { class: 'kv' });
  fields.forEach((f) => dl.append(h('dt', { text: metaLabel(f) }), h('dd', { class: 'ltr', text: metaValue(f) })));
  return dl;
}
export function qualityChips(flags) {
  const box = h('div', { class: 'chips' });
  (flags || []).forEach((q) => box.append(h('span', { class: 'chip ' + (q.severity === 'error' ? 'bad' : q.severity === 'warning' ? 'warn' : ''), title: q.detail || '', text: has('q.' + q.code) ? t('q.' + q.code) : q.code })));
  return box;
}
export function panelHead(title, onClose, sub) {
  return h('div', { class: 'ph' }, h('div', { class: 'ph-t' }, h('h2', { text: title }), sub || null), h('button', { class: 'x', type: 'button', 'aria-label': t('common.close'), onclick: onClose }, icon('close')));
}
