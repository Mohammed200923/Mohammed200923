/* App shell: routing (#/explorer ...), navigation, applying preferences to the document,
   the shared actions registry (used by buttons, shortcuts and the demo assistant), global keyboard.   */
(function () {
  const SX = window.SX, U = SX.ui, $ = SX.$, $$ = SX.$$, t = function (k, p) { return SX.i18n.t(k, p); };
  const root = document.documentElement;

  const VIEWS = [
    { id: 'explorer', icon: 'explorer', key: 'nav.explorer', hotkey: 'e' },
    { id: 'observations', icon: 'obs', key: 'nav.observations', hotkey: 'o' },
    { id: 'comparison', icon: 'compare', key: 'nav.comparison', hotkey: 'c' },
    { id: 'help', icon: 'help', key: 'nav.help', hotkey: 'h' },
    { id: 'settings', icon: 'settings', key: 'nav.settings', hotkey: 's' }
  ];

  /* ---------- actions registry ---------- */
  SX.actions = {
    map: {},
    register: function (name, fn) { this.map[name] = fn; },
    run: function (name, args) {
      const fn = this.map[name];
      if (!fn) { console.warn('[actions] unknown action', name); return false; }
      fn(args); return true;
    }
  };

  const shell = (SX.shell = {});
  shell.views = VIEWS;
  shell.current = function () { return $('.app').dataset.view; };
  let focusAfterNav = false;

  shell.go = function (view, opts) {
    if (!VIEWS.some(function (v) { return v.id === view; })) view = 'explorer';
    focusAfterNav = !opts || opts.focus !== false;
    if (location.hash === '#/' + view) show(view); else location.hash = '#/' + view;
  };

  function show(view) {
    if (!VIEWS.some(function (v) { return v.id === view; })) view = 'explorer';
    VIEWS.forEach(function (v) { const el = $('#view-' + v.id); if (el) el.hidden = v.id !== view; });
    $('.app').dataset.view = view;
    $$('[data-view-link]').forEach(function (a) { if (a.dataset.viewLink === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    const v = VIEWS.find(function (x) { return x.id === view; });
    document.title = t(v.key) + ' · ' + t('app.name');
    SX.app.set({ view: view });
    $('#main').scrollTop = 0; window.scrollTo(0, 0);
    if (focusAfterNav) { const h = $('#view-' + view + ' h1'); if (h) h.focus({ preventScroll: true }); U.announce(t(v.key)); }
    focusAfterNav = false;
    SX.bus.emit('view', view);
  }
  window.addEventListener('hashchange', function () { show((location.hash.match(/^#\/(\w+)/) || [])[1]); });

  /* ---------- nav ---------- */
  function buildNav() {
    const rail = $('#railList'), tabs = $('#tabList');
    rail.innerHTML = ''; tabs.innerHTML = '';
    VIEWS.forEach(function (v) {
      const li = document.createElement('li');
      li.innerHTML = '<a class="rb" href="#/' + v.id + '" data-view-link="' + v.id + '" data-tip="' + SX.esc(t(v.key)) + '">' + SX.icon(v.icon) + '<span class="rb-l">' + SX.esc(t(v.key)) + '</span></a>';
      rail.appendChild(li);
      const tb = document.createElement('li');
      tb.innerHTML = '<a class="tb" href="#/' + v.id + '" data-view-link="' + v.id + '">' + SX.icon(v.icon) + '<span>' + SX.esc(t(v.key)) + '</span></a>';
      tabs.appendChild(tb);
    });
    $$('[data-view-link]').forEach(function (a) { a.addEventListener('click', function () { focusAfterNav = true; }); });
    const cur = shell.current(); $$('[data-view-link="' + cur + '"]').forEach(function (a) { a.setAttribute('aria-current', 'page'); });
  }

  /* ---------- preferences -> document ---------- */
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)'), mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  shell.effectiveTheme = function () { const th = SX.prefs.get('theme'); return th === 'system' ? (mqDark.matches ? 'dark' : 'light') : th; };
  shell.effectiveMotionReduced = function () { const r = SX.prefs.get('reducedMotion'); return r == null ? mqMotion.matches : r; };

  function applyPrefs() {
    const p = SX.prefs.get();
    root.dataset.theme = shell.effectiveTheme();
    root.dataset.level = p.level;
    if (p.largeText) root.dataset.text = 'large'; else delete root.dataset.text;
    if (p.highContrast) root.dataset.contrast = 'high'; else delete root.dataset.contrast;
    if (shell.effectiveMotionReduced()) root.dataset.motion = 'reduced'; else delete root.dataset.motion;
    if (SX.i18n.lang !== p.lang) { SX.i18n.setLang(p.lang); buildNav(); document.title = t(VIEWS.find(function (v) { return v.id === shell.current(); }).key) + ' · ' + t('app.name'); }
    const dark = root.dataset.theme === 'dark', qt = $('#quickTheme');
    qt.innerHTML = SX.icon(dark ? 'sun' : 'moon'); qt.dataset.tip = t('quick.theme');
    $('#quickLangL').textContent = p.lang === 'ar' ? 'EN' : 'ع';
    SX.bus.emit('prefs', p);
  }
  mqDark.addEventListener('change', function () { if (SX.prefs.get('theme') === 'system') applyPrefs(); });
  mqMotion.addEventListener('change', function () { if (SX.prefs.get('reducedMotion') == null) applyPrefs(); });
  SX.prefs.subscribe([], applyPrefs);
  shell.applyPrefs = applyPrefs;

  /* ---------- actions ---------- */
  const A = SX.actions;
  A.register('navigate', function (v) { shell.go(v); });
  A.register('setTheme', function (v) { SX.prefs.set({ theme: v }); U.toast(t('toast.theme', { v: t('theme.' + v) })); });
  A.register('setLang', function (v) { SX.prefs.set({ lang: v }); U.toast(t('toast.lang')); });
  A.register('setLevel', function (v) { SX.prefs.set({ level: v }); U.toast(t('toast.level', { v: t('level.' + v) })); });
  A.register('toggleLargeText', function () { SX.prefs.set({ largeText: !SX.prefs.get('largeText') }); });
  A.register('toggleContrast', function () { SX.prefs.set({ highContrast: !SX.prefs.get('highContrast') }); });
  A.register('toggleMotion', function () { SX.prefs.set({ reducedMotion: !shell.effectiveMotionReduced() }); });
  A.register('focusSearch', function () { shell.go('explorer', { focus: false }); setTimeout(function () { const i = $('#mapSearch input[type=search]'); if (i) i.focus(); }, 50); });
  A.register('openCoords', function () { shell.go('explorer', { focus: false }); setTimeout(function () { if (SX.explorerSearch) SX.explorerSearch.openPopover(); }, 80); });

  /* ---------- delegated clicks ---------- */
  document.addEventListener('click', function (e) {
    const a = e.target.closest('[data-act]');
    if (a) { e.preventDefault(); A.run(a.dataset.act, a.dataset.arg); return; }
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); shell.go(g.dataset.go); }
  });
  $('#quickTheme').addEventListener('click', function () { A.run('setTheme', shell.effectiveTheme() === 'dark' ? 'light' : 'dark'); });
  $('#quickLang').addEventListener('click', function () { A.run('setLang', SX.prefs.get('lang') === 'ar' ? 'en' : 'ar'); });

  /* ---------- global keyboard ---------- */
  let chord = 0;
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const tg = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable;
    if (typing || U.anyDialogOpen()) return;
    if (chord && Date.now() - chord < 1200) {
      const v = VIEWS.find(function (x) { return x.hotkey === e.key.toLowerCase(); });
      chord = 0; if (v) { e.preventDefault(); shell.go(v.id); return; }
    }
    if (e.key === 'g') { chord = Date.now(); return; }
    if (e.key === '/') { e.preventDefault(); const s = $('.view:not([hidden]) .sbox input[type=search]') ; if (s) s.focus(); else A.run('focusSearch'); }
    else if (e.key === '?') { shell.go('help'); }
    else if (shell.current() === 'explorer') {
      if (e.key === ' ' && tg.tagName !== 'BUTTON' && tg.tagName !== 'A' && SX.actions.map.togglePlay) { e.preventDefault(); A.run('togglePlay'); }
      else if (e.key === '[') SX.ctrl.stepVisit(-1);
      else if (e.key === ']') SX.ctrl.stepVisit(1);
    }
  });

  shell.init = function () { SX.i18n.setLang(SX.prefs.get('lang')); buildNav(); applyPrefs(); show((location.hash.match(/^#\/(\w+)/) || [])[1] || SX.app.get('view')); };
})();
