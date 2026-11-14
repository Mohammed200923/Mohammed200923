/* Core helpers shared by every module. No dependencies. */
(function () {
  const SX = (window.SX = window.SX || {});

  SX.$ = function (s, r) { return (r || document).querySelector(s); };
  SX.$$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  SX.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  SX.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  SX.lerp = function (a, b, t) { return a + (b - a) * t; };
  SX.DEG = Math.PI / 180;

  SX.debounce = function (fn, ms) {
    let t;
    const d = function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
    d.cancel = function () { clearTimeout(t); };
    return d;
  };

  /* Deterministic string hash + seeded RNG (used by the procedural backdrop and the mock provider). */
  SX.hash = function (str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  SX.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  let uidN = 0;
  SX.uid = function (p) { return (p || 'sx') + '-' + (++uidN); };

  /* Tiny event bus for loosely coupled modules. */
  SX.bus = (function () {
    const m = {};
    return {
      on: function (ev, fn) { (m[ev] = m[ev] || []).push(fn); return function () { m[ev] = m[ev].filter(function (f) { return f !== fn; }); }; },
      emit: function (ev, data) { (m[ev] || []).slice().forEach(function (f) { try { f(data); } catch (e) { console.error('[bus]', ev, e); } }); }
    };
  })();

  SX.motionReduced = function () { return document.documentElement.dataset.motion === 'reduced'; };

  /* Angular separation in degrees between two sky positions. */
  SX.angSep = function (r1, d1, r2, d2) {
    const a = d1 * SX.DEG, b = d2 * SX.DEG, dr = (r1 - r2) * SX.DEG;
    return Math.acos(SX.clamp(Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(dr), -1, 1)) / SX.DEG;
  };

  /* Sexagesimal formatting. Always rendered left-to-right by the UI (class .ltr). */
  SX.fmtRA = function (deg) {
    const h = (((deg % 360) + 360) % 360) / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), ss = Math.round((m - mm) * 60);
    let H = hh, M = mm, S = ss;
    if (S === 60) { S = 0; M++; } if (M === 60) { M = 0; H = (H + 1) % 24; }
    return String(H).padStart(2, '0') + 'h ' + String(M).padStart(2, '0') + 'm ' + String(S).padStart(2, '0') + 's';
  };
  SX.fmtDec = function (deg) {
    const sign = deg < 0 ? '−' : '+', a = Math.abs(deg), d = Math.floor(a), m = (a - d) * 60, mm = Math.floor(m);
    let D = d, M = mm, S = Math.round((m - mm) * 60);
    if (S === 60) { S = 0; M++; } if (M === 60) { M = 0; D++; }
    return sign + String(D).padStart(2, '0') + '° ' + String(M).padStart(2, '0') + '′ ' + String(S).padStart(2, '0') + '″';
  };
  SX.fmtDeg = function (v, digits) { return Number(v).toFixed(digits == null ? 2 : digits) + '°'; };

  /* Focusable descendants (for focus traps). */
  SX.focusables = function (root) {
    return SX.$$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', root)
      .filter(function (el) { return !el.hidden && el.offsetParent !== null && !el.closest('[hidden]'); });
  };

  /* Keeps Tab inside `root` while active. Returns a release function that restores previous focus. */
  SX.trapFocus = function (root, opts) {
    opts = opts || {};
    const prev = document.activeElement;
    function onKey(e) {
      if (e.key === 'Escape' && opts.onEscape) { e.stopPropagation(); opts.onEscape(); return; }
      if (e.key !== 'Tab') return;
      const f = SX.focusables(root); if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    root.addEventListener('keydown', onKey);
    return function release() {
      root.removeEventListener('keydown', onKey);
      if (opts.restore !== false && prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  };

  /* Inline SVG icon from the sprite in index.html. */
  SX.icon = function (name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';
  };

  /* Download-free "copy" helper is intentionally absent: the app never writes files. */
})();
