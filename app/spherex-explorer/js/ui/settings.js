/* Settings view: language, theme, experience level, accessibility, demo data controls, Data inspector, reset. */
(function () {
  const SX = window.SX, U = SX.ui, esc = SX.esc, $ = SX.$, $$ = SX.$$, t = function (k, p) { return SX.i18n.t(k, p); };
  const S = (SX.settings = {});
  let cards = {};

  /* Shared with onboarding so both screens behave identically. */
  S.OPTIONS = {
    lang: [{ value: 'en', raw: 'English', desc: 'lang.en.d', icon: 'globe' }, { value: 'ar', raw: 'العربية', desc: 'lang.ar.d', icon: 'globe' }],
    theme: [{ value: 'dark', label: 'theme.dark', desc: 'theme.dark.d', icon: 'moon' }, { value: 'light', label: 'theme.light', desc: 'theme.light.d', icon: 'sun' }, { value: 'system', label: 'theme.system', desc: 'theme.system.d', icon: 'monitor' }],
    level: [{ value: 'beginner', label: 'level.beginner', desc: 'level.beginner.d', icon: 'sparkle' }, { value: 'intermediate', label: 'level.intermediate', desc: 'level.intermediate.d', icon: 'layers' }, { value: 'advanced', label: 'level.advanced', desc: 'level.advanced.d', icon: 'settings' }]
  };
  S.ACCESS = [
    { key: 'reducedMotion', icon: 'motion', label: 'acc.motion', desc: 'acc.motion.d', get: function () { return SX.shell.effectiveMotionReduced(); }, toggle: 'toggleMotion' },
    { key: 'largeText', icon: 'text', label: 'acc.text', desc: 'acc.text.d', get: function () { return SX.prefs.get('largeText'); }, toggle: 'toggleLargeText' },
    { key: 'highContrast', icon: 'contrast', label: 'acc.contrast', desc: 'acc.contrast.d', get: function () { return SX.prefs.get('highContrast'); }, toggle: 'toggleContrast' }
  ];

  /* Builds <li> switches into `ul`. Returns { sync }. */
  S.buildSwitches = function (ul) {
    ul.innerHTML = '';
    S.ACCESS.forEach(function (a) {
      const id = SX.uid('sw'), li = document.createElement('li');
      li.innerHTML = '<label class="switch" for="' + id + '"><input type="checkbox" role="switch" id="' + id + '"><span class="sw-track" aria-hidden="true"></span><span class="sw-text"><b>' + esc(t(a.label)) + '</b><small>' + esc(t(a.desc)) + '</small></span></label>';
      ul.appendChild(li);
      li.querySelector('input').addEventListener('change', function () { SX.actions.run(a.toggle); });
    });
    function sync() { Array.from(ul.querySelectorAll('input')).forEach(function (i, k) { i.checked = !!S.ACCESS[k].get(); }); }
    sync(); return { sync: sync };
  };

  S.init = function () {
    const mk = function (id, name, label, opts, get, set) { return U.optionCards($(id), { name: name, label: label, options: opts, get: get, onChange: set }); };
    cards.lang = mk('#setLang', 'set-lang', 'set.language', S.OPTIONS.lang, function () { return SX.prefs.get('lang'); }, function (v) { SX.actions.run('setLang', v); });
    cards.theme = mk('#setTheme', 'set-theme', 'set.theme', S.OPTIONS.theme, function () { return SX.prefs.get('theme'); }, function (v) { SX.actions.run('setTheme', v); });
    cards.level = mk('#setLevel', 'set-level', 'set.level', S.OPTIONS.level, function () { return SX.prefs.get('level'); }, function (v) { SX.actions.run('setLevel', v); });
    let sw = S.buildSwitches($('#setAccess'));
    SX.prefs.subscribe([], function () { cards.lang.sync(); cards.theme.sync(); cards.level.sync(); sw.sync(); });
    SX.bus.on('lang', function () { cards.lang.rebuild(); cards.theme.rebuild(); cards.level.rebuild(); sw = S.buildSwitches($('#setAccess')); buildDemo(); renderInspector(); });
    buildDemo();
    SX.data.onLog(function () { if (SX.shell.current() === 'settings') renderInspector(); });
    SX.bus.on('view', function (v) { if (v === 'settings') { buildDemo(); renderInspector(); } });
    renderInspector();
    $('#resetAll').onclick = function () {
      if (!window.confirm(t('set.resetConfirm'))) return;
      SX.prefs.clearSaved(); SX.app.clearSaved(); try { localStorage.removeItem('sx.hint.v1'); } catch (e) { /* ignore */ }
      location.hash = ''; location.reload();
    };
  };

  /* ---------- demo data controls (only when the active provider exposes them) ---------- */
  function buildDemo() {
    const box = $('#demoControls'), d = SX.data.describe(), ctl = SX.data.demoControls();
    $('#dataDesc').textContent = d.simulated ? t('set.dataMock') : t('set.dataReal', { name: d.name });
    box.innerHTML = '';
    if (!ctl) { box.hidden = true; return; }
    box.hidden = false;
    const mkSel = function (label, key, values, tk) {
      const id = SX.uid('dc'), w = document.createElement('label'); w.className = 'field'; w.setAttribute('for', id);
      w.innerHTML = '<span>' + esc(t(label)) + '</span><select id="' + id + '">' + values.map(function (v) { return '<option value="' + v + '"' + (ctl[key] === v ? ' selected' : '') + '>' + esc(t(tk + v)) + '</option>'; }).join('') + '</select>';
      w.querySelector('select').addEventListener('change', function () { ctl[key] = this.value; SX.data.clearCache(); U.toast(t('set.demoApplied')); });
      return w;
    };
    const mkSw = function (label, key) {
      const id = SX.uid('dc'), w = document.createElement('label'); w.className = 'switch compact'; w.setAttribute('for', id);
      w.innerHTML = '<input type="checkbox" role="switch" id="' + id + '"' + (ctl[key] ? ' checked' : '') + '><span class="sw-track" aria-hidden="true"></span><span class="sw-text"><b>' + esc(t(label)) + '</b></span>';
      w.querySelector('input').addEventListener('change', function () { ctl[key] = this.checked; SX.data.clearCache(); U.toast(t('set.demoApplied')); });
      return w;
    };
    const row = document.createElement('div'); row.className = 'dc-row';
    row.appendChild(mkSel('dc.latency', 'latency', ['fast', 'normal', 'slow'], 'dc.l.'));
    row.appendChild(mkSel('dc.failure', 'failure', ['none', 'network', 'random', 'timeout'], 'dc.f.'));
    box.appendChild(row);
    const row2 = document.createElement('div'); row2.className = 'dc-row';
    row2.appendChild(mkSw('dc.noImages', 'noImages')); row2.appendChild(mkSw('dc.noObs', 'noObservations'));
    box.appendChild(row2);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.innerHTML = SX.icon('retry') + '<span>' + esc(t('dc.reload')) + '</span>';
    b.onclick = function () { SX.data.clearCache(); SX.ctrl.loadFeatured(); SX.ctrl.loadObservations(); U.toast(t('dc.reloading')); };
    box.appendChild(b);
    const n = document.createElement('p'); n.className = 'muted small'; n.textContent = t('dc.note'); box.appendChild(n);
  }

  /* ---------- Data inspector (Advanced) ---------- */
  function renderInspector() {
    const tb = $('#inspBody'); if (!tb) return;
    const log = SX.data.getLog();
    if (!log.length) { tb.innerHTML = '<tr><td colspan="4" class="muted">' + esc(t('insp.empty')) + '</td></tr>'; return; }
    tb.innerHTML = log.slice(0, 20).map(function (e) {
      const st = e.status === 'error' ? 'failed' : e.status === 'empty' ? 'planned' : e.status === 'pending' ? 'processing' : 'observed';
      return '<tr><th scope="row" class="ltr mono">' + esc(e.fn) + '</th><td class="ltr mono">' + esc(JSON.stringify(e.args).slice(0, 70)) + '</td><td><span class="badge st-' + st + '">' + esc(e.status) + (e.code ? ' · ' + esc(e.code) : '') + '</span>' + (e.message ? '<small class="muted ltr block">' + esc(e.message) + '</small>' : '') + (e.summary ? '<small class="muted block">' + esc(e.summary) + '</small>' : '') + '</td><td class="ltr mono">' + (e.ms == null ? '…' : e.ms + ' ms') + '</td></tr>';
    }).join('');
  }
})();
