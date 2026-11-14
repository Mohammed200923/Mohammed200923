/* First-run setup: language -> theme -> experience level -> accessibility -> done.
   Choices apply live (so the user sees the result) and are persisted immediately via SX.prefs.        */
(function () {
  const SX = window.SX, U = SX.ui, esc = SX.esc, $ = SX.$, t = function (k, p) { return SX.i18n.t(k, p); };
  const O = (SX.onboarding = {});
  const STEPS = ['language', 'theme', 'level', 'access', 'done'];
  let step = 0, el, controls = null;

  function render() {
    const id = STEPS[step], stage = $('#obStage'); stage.innerHTML = ''; controls = null;
    $('#obStepL').textContent = t('ob.step', { n: step + 1, total: STEPS.length });
    $('#obDots').innerHTML = STEPS.map(function (s, i) { return '<li class="' + (i === step ? 'on' : i < step ? 'done' : '') + '"></li>'; }).join('');
    const head = document.createElement('div'); head.className = 'ob-head';
    head.innerHTML = (step === 0 ? '<p class="ob-brand">SPHEREx Sky Explorer</p>' : '') + '<h2 id="obT" tabindex="-1">' + esc(t('ob.' + id + '.t')) + '</h2><p class="lead">' + esc(t('ob.' + id + '.d')) + '</p>';
    stage.appendChild(head);
    const body = document.createElement('div'); body.className = 'ob-body'; stage.appendChild(body);
    const mk = function (name, opts, get, set) {
      const box = document.createElement('div'); body.appendChild(box);
      controls = U.optionCards(box, { name: 'ob-' + name, label: 'ob.' + id + '.t', options: opts, get: get, onChange: set });
    };
    if (id === 'language') mk('lang', SX.settings.OPTIONS.lang, function () { return SX.prefs.get('lang'); }, function (v) { SX.prefs.set({ lang: v }); });
    else if (id === 'theme') mk('theme', SX.settings.OPTIONS.theme, function () { return SX.prefs.get('theme'); }, function (v) { SX.prefs.set({ theme: v }); });
    else if (id === 'level') mk('level', SX.settings.OPTIONS.level, function () { return SX.prefs.get('level'); }, function (v) { SX.prefs.set({ level: v }); });
    else if (id === 'access') {
      const ul = document.createElement('ul'); ul.className = 'switches'; body.appendChild(ul);
      const sw = SX.settings.buildSwitches(ul); controls = { sync: sw.sync, rebuild: function () { } };
      const kb = document.createElement('p'); kb.className = 'muted small ob-note'; kb.innerHTML = SX.icon('keyboard') + '<span>' + esc(t('ob.access.keys')) + '</span>'; body.appendChild(kb);
    } else {
      const p = SX.prefs.get(), items = [[t('set.language'), p.lang === 'ar' ? 'العربية' : 'English'], [t('set.theme'), t('theme.' + p.theme)], [t('set.level'), t('level.' + p.level)],
        [t('set.access'), [SX.shell.effectiveMotionReduced() ? t('acc.motion') : null, p.largeText ? t('acc.text') : null, p.highContrast ? t('acc.contrast') : null].filter(Boolean).join(', ') || t('ob.none')]];
      body.innerHTML = '<dl class="ob-sum">' + items.map(function (i) { return '<dt>' + esc(i[0]) + '</dt><dd>' + esc(i[1]) + '</dd>'; }).join('') + '</dl><p class="muted small">' + esc(t('ob.done.note')) + '</p>';
    }
    $('#obBack').hidden = step === 0;
    $('#obNext').querySelector('span').textContent = t(step === STEPS.length - 1 ? 'ob.start' : 'ob.next');
    $('#obSkip').hidden = step === STEPS.length - 1;
    const h = $('#obT'); if (h) h.focus({ preventScroll: true });
    U.announce(t('ob.step', { n: step + 1, total: STEPS.length }) + '. ' + t('ob.' + id + '.t'));
  }

  function finish() {
    SX.prefs.set({ onboarded: true });
    U.closeDialog(el);
    SX.shell.go(SX.app.get('view') || 'explorer', { focus: true });
  }

  O.open = function () { step = 0; render(); U.openDialog(el, { closable: false, focus: '#obT' }); };

  O.init = function () {
    el = $('#onboard');
    $('#obNext').onclick = function () { if (step < STEPS.length - 1) { step++; render(); } else finish(); };
    $('#obBack').onclick = function () { if (step > 0) { step--; render(); } };
    $('#obSkip').onclick = finish;
    SX.bus.on('lang', function () { if (!el.hidden) render(); });
    SX.prefs.subscribe([], function () { if (!el.hidden && controls) controls.sync(); });
    SX.actions.register('replayOnboarding', function () { O.open(); });
  };
})();
