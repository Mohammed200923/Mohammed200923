/* Minimal i18n: flat dictionaries, {placeholders}, data-i18n attributes, RTL switching, locale formatting.
   Dictionaries live in en.js / ar.js and register on SX.i18n.dict.
   Provider data may be a plain string or { en, ar } (see LocalizedText in FRONTEND_INTEGRATION.md). */
(function () {
  const SX = window.SX;
  const I = (SX.i18n = { dict: { en: {}, ar: {} }, lang: 'en', RTL: { ar: true } });

  I.t = function (key, params) {
    let s = I.dict[I.lang] && I.dict[I.lang][key];
    if (s == null) s = I.dict.en[key];
    if (s == null) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] != null ? params[k] : m; });
    return s;
  };
  I.has = function (key) { return Object.prototype.hasOwnProperty.call(I.dict.en, key); };
  I.dir = function () { return I.RTL[I.lang] ? 'rtl' : 'ltr'; };

  /* LocalizedText -> string for the current language (falls back to English, then any value). */
  I.text = function (v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    return v[I.lang] || v.en || Object.keys(v).map(function (k) { return v[k]; })[0] || '';
  };

  I.apply = function (root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = I.t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        const i = pair.indexOf(':'); if (i < 0) return;
        el.setAttribute(pair.slice(0, i).trim(), I.t(pair.slice(i + 1).trim()));
      });
    });
  };

  I.setLang = function (lang) {
    if (!I.dict[lang]) lang = 'en';
    I.lang = lang;
    const h = document.documentElement;
    h.lang = lang; h.dir = I.dir(); h.dataset.lang = lang;
    I.apply(document);
    SX.bus.emit('lang', lang);
  };

  I.locale = function () { return I.lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB'; };

  /* Dates are formatted in UTC so a given ISO string reads the same everywhere. */
  I.date = function (iso, opts) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(I.locale(), Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, opts || {}));
  };
  I.dateShort = function (iso) { return I.date(iso, { day: undefined, month: 'short', year: 'numeric' }); };
  I.num = function (n, opts) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString(I.locale(), opts || { maximumFractionDigits: 2 });
  };
  I.pct = function (f, digits) { return (Number(f) * 100).toFixed(digits == null ? 0 : digits) + '%'; };
})();
