/* Small observable stores with optional localStorage persistence.
   SX.prefs  – user preferences (language, theme, level, accessibility). Persisted.
   SX.app    – workspace/session state shared by all views. A subset is persisted.   */
(function () {
  const SX = window.SX;

  SX.createStore = function (initial, opts) {
    opts = opts || {};
    const state = Object.assign({}, initial);
    const persistKeys = opts.persist || Object.keys(initial);
    const subs = [];
    let storageOk = true;

    if (opts.key) {
      try {
        const saved = JSON.parse(localStorage.getItem(opts.key) || 'null');
        if (saved && typeof saved === 'object') persistKeys.forEach(function (k) { if (k in saved && typeof saved[k] === typeof initial[k] || (k in saved && initial[k] === null)) state[k] = saved[k]; });
      } catch (e) { storageOk = false; }
    }

    function persist() {
      if (!opts.key || !storageOk) return;
      try {
        const out = {}; persistKeys.forEach(function (k) { out[k] = state[k]; });
        localStorage.setItem(opts.key, JSON.stringify(out));
      } catch (e) { storageOk = false; }
    }

    return {
      get: function (k) { return k === undefined ? state : state[k]; },
      set: function (patch) {
        const changed = [];
        Object.keys(patch).forEach(function (k) { if (state[k] !== patch[k] || (patch[k] && typeof patch[k] === 'object')) { state[k] = patch[k]; changed.push(k); } });
        if (!changed.length) return;
        if (changed.some(function (k) { return persistKeys.indexOf(k) >= 0; })) persist();
        subs.slice().forEach(function (s) {
          if (!s.keys || s.keys.some(function (k) { return changed.indexOf(k) >= 0; })) {
            try { s.fn(state, changed); } catch (e) { console.error('[store]', e); }
          }
        });
      },
      subscribe: function (keys, fn) {
        const s = { keys: keys && keys.length ? keys : null, fn: fn };
        subs.push(s);
        return function () { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
      },
      clearSaved: function () { if (opts.key) { try { localStorage.removeItem(opts.key); } catch (e) { /* ignore */ } } },
      hasSaved: function () { try { return !!localStorage.getItem(opts.key); } catch (e) { return false; } },
      persistent: function () { return storageOk; }
    };
  };

  SX.PREFS_KEY = 'sx.prefs.v1';
  SX.SESSION_KEY = 'sx.session.v1';

  /* Preferences. `reducedMotion: null` means "follow the operating system". */
  SX.prefs = SX.createStore({
    onboarded: false,
    lang: 'en',            // 'en' | 'ar'
    theme: 'system',       // 'dark' | 'light' | 'system'
    level: 'beginner',     // 'beginner' | 'intermediate' | 'advanced'
    reducedMotion: null,   // null | true | false
    largeText: false,
    highContrast: false
  }, { key: SX.PREFS_KEY });

  /* Workspace state. Runtime-only keys are not persisted. */
  SX.app = SX.createStore({
    /* persisted */
    view: 'explorer',
    targetId: null,
    wl: 1.6,
    rgb: false,
    palette: 'emerald',
    brightness: 1,
    contrast: 1,
    mode: 'warm',
    fov: 28,
    grid: false,
    labels: true,
    foot: false,
    speed: 1,
    loop: true,
    /* runtime */
    featured: { status: 'idle', list: [], error: null },
    bands: null,
    target: null,
    field: null,            // { ra, dec, custom: boolean }
    nearest: null,          // { target, sepDeg } for custom fields
    obs: { status: 'idle', list: [], error: null },
    visitId: null,
    playing: false,
    focusRequest: null,     // { ra, dec, fov, nonce } consumed by the map
    cmp: { a: null, b: null, band: 4, mode: 'slider' }
  }, { key: SX.SESSION_KEY, persist: ['view', 'targetId', 'wl', 'rgb', 'palette', 'brightness', 'contrast', 'mode', 'fov', 'grid', 'labels', 'foot', 'speed', 'loop'] });
})();
