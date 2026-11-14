import { EN } from './lang-en.js';
import { AR } from './lang-ar.js';
import { prefs, setPrefs, bus } from './state.js';

const DICT = { en: EN, ar: AR };
export const lang = () => prefs.lang;
export const has = (key) => !!((DICT[prefs.lang] && DICT[prefs.lang][key]) || EN[key]);
export function t(key, vars) {
  let s = (DICT[prefs.lang] && DICT[prefs.lang][key]) || EN[key];
  if (s == null) { if (window.__SXI_DEBUG) console.warn('[i18n] missing', key); return key; }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : vars[k]));
  return s;
}
/* LocalizedText (string | {en, ar}) -> string in the current language */
export function loc(v) { if (v == null) return ''; if (typeof v === 'string') return v; return v[prefs.lang] || v.en || ''; }
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => { const [a, k] = pair.split(':'); if (a && k) el.setAttribute(a.trim(), t(k.trim())); });
  });
}
export function applyLang() {
  const d = document.documentElement;
  d.lang = prefs.lang; d.dir = prefs.lang === 'ar' ? 'rtl' : 'ltr';
  applyI18n(); document.title = t('app.title');
  bus.emit('lang', prefs.lang);
}
export function setLang(l) { setPrefs({ lang: l }); applyLang(); }
