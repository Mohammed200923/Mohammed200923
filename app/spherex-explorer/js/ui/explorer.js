/* Sky Explorer view: map, object panel, observation (view) controls, timeline playback, mobile bottom sheet.
   Renders from SX.app; all astronomy data arrives through SX.ctrl / SX.data.                              */
(function () {
  const SX = window.SX, U = SX.ui, app = SX.app, ctrl = SX.ctrl, esc = SX.esc, clamp = SX.clamp;
  const $ = SX.$, $$ = SX.$$, t = function (k, p) { return SX.i18n.t(k, p); }, I = SX.i18n;
  const FOV_MIN = 1, FOV_MAX = 120;

  const X = (SX.explorer = {});
  let view, sky, thumbData = null, thumbToken = 0, timer = null, statsTimer = null;
  const desktop = function () { return window.matchMedia('(min-width: 1100px)').matches; };

  /* ======================= INIT ======================= */
  X.init = function () {
    view = $('#view-explorer');
    sky = X.sky = new SX.SkyMap($('#sky'), {
      backdrop: SX.config.backdrop,
      view: { ra: 83.8, dec: 4, fov: app.get('fov') },
      ir: irNow(), grid: app.get('grid'), labels: app.get('labels'), footprint: app.get('foot'),
      label: function (tg) { return U.name(tg); }
    });
    X.search = SX.explorerSearch = new U.SearchBox($('#mapSearch'), { shortcut: true });

    buildPalette(); buildPresets(); buildBandbar();
    wireMap(); wireControls(); wireTimeline(); wireDock(); wireObjectButtons();
    subscribe();
    renderAll();
    centerFrac();
    if (!app.get('target')) sky.setView(83.8, 4, app.get('fov'));
    SX.bus.on('lang', function () { buildPalette(); buildPresets(); buildBandbar(); renderAll(); sky.dirty(); X.search._buildExamples(); });
    SX.bus.on('view', function (v) { if (v === 'explorer') { setTimeout(function () { sky.resize(); centerFrac(); scheduleStats(); }, 30); } else stopPlay(); });
    SX.bus.on('prefs', function () { setTimeout(function () { sky.dirty(); }, 0); });
    window.addEventListener('resize', function () { centerFrac(); scheduleStats(); });
    new ResizeObserver(function () { centerFrac(); }).observe($('#dock'));
  };

  /* ======================= helpers ======================= */
  function irNow() { const s = app.get(); return { wl: s.rgb ? 'rgb' : s.wl, palette: s.rgb ? 'natural' : s.palette, brightness: s.brightness, contrast: s.contrast }; }
  function fovFromSlider(v) { return FOV_MIN * Math.pow(FOV_MAX / FOV_MIN, v / 1000); }
  function sliderFromFov(f) { return Math.round(Math.log(clamp(f, FOV_MIN, FOV_MAX) / FOV_MIN) / Math.log(FOV_MAX / FOV_MIN) * 1000); }
  function fmtFov(f) { return (f < 10 ? f.toFixed(1) : Math.round(f)) + '°'; }
  function currentIndex() { const l = app.get('obs').list, id = app.get('visitId'); return l.findIndex(function (o) { return o.id === id; }); }
  function dateShort(o) { return I.dateShort(o.startTime); }
  function ltr(s) { return '<span class="ltr">' + esc(s) + '</span>'; }
  function bandLabel(b) { return b.minMicron.toFixed(2) + '–' + b.maxMicron.toFixed(2) + ' µm'; }

  function centerFrac() {
    const w = $('#mapcard').clientWidth, h = $('#mapcard').clientHeight;
    if (!w || !h) return;
    if (desktop()) {
      const sw = $('#strip').offsetWidth, rtl = document.documentElement.dir === 'rtl';
      sky.setCenterFrac(rtl ? (w - sw) / 2 / w : (sw + (w - sw) / 2) / w, 0.5);
    } else {
      const dock = $('#dock'), overlay = getComputedStyle(dock).position === 'absolute';
      const dh = overlay ? dock.offsetHeight : 0, top = getComputedStyle($('#strip')).display === 'none' ? 64 : 116, vis = Math.max(120, h - dh - top);
      sky.setCenterFrac(0.5, clamp((top + vis / 2) / h, 0.25, 0.62));
    }
  }

  function scheduleStats() {
    if (statsTimer) return;
    statsTimer = setTimeout(function () { statsTimer = null; drawHist(); drawMini(); renderMetrics(); const v = sky.view; $('#coords').textContent = 'RA ' + SX.fmtRA(v.ra) + ' · Dec ' + SX.fmtDec(v.dec); }, 90);
  }

  /* ======================= subscriptions ======================= */
  function subscribe() {
    app.subscribe(['featured', 'target'], refreshMarkers);
    app.subscribe(['wl', 'rgb', 'palette', 'brightness', 'contrast'], function () { sky.setIR(irNow()); renderControls(); repaintThumb(); scheduleStats(); });
    app.subscribe(['bands'], function () { buildBandbar(); renderControls(); });
    app.subscribe(['grid', 'labels', 'foot'], function () { sky.setOpts({ grid: app.get('grid'), labels: app.get('labels'), footprint: app.get('foot') }); renderControls(); });
    app.subscribe(['target', 'field'], function () {
      sky.select(app.get('target'), true);
      const f = app.get('field'); sky.setMarker(f && f.custom ? f.ra : null, f ? f.dec : null);
      renderObject(); renderBanner(); hidePick();
    });
    app.subscribe(['focusRequest'], function () { const r = app.get('focusRequest'); if (r) sky.flyTo(r.ra, r.dec, r.fov, 1100); });
    app.subscribe(['fov'], function () { if (fromMap) return; const f = app.get('fov'); if (Math.abs(f / sky.view.fov - 1) > 0.01) sky.setView(sky.view.ra, sky.view.dec, f); renderControls(); });
    app.subscribe(['obs', 'visitId'], function () { const i = currentIndex(); sky.setVisit(i < 0 ? 0 : i); renderTimeline(); renderObject(); renderBanner(); loadThumb(); });
    app.subscribe(['playing', 'speed', 'loop'], renderPlay);
  }

  function refreshMarkers() {
    const list = app.get('featured').list.slice(), tg = app.get('target');
    if (tg && !list.some(function (x) { return x.id === tg.id; })) list.push(tg);
    sky.setTargets(list);
    sky.select(tg, true);
    sky.setIR(irNow());
  }

  /* ======================= map wiring ======================= */
  let fromMap = false, fovT = null;
  function wireMap() {
    sky.on.select = function (tg) { if (tg) ctrl.selectTarget(tg, { fly: true }); else clearSel(); };
    sky.on.view = function () {
      scheduleStats();
      clearTimeout(fovT);
      fovT = setTimeout(function () { fromMap = true; app.set({ fov: +sky.view.fov.toFixed(2) }); fromMap = false; }, 160);
      const f = sky.view.fov; $('#fovV').textContent = fmtFov(f); $('#fovS').value = sliderFromFov(f);
    };
    sky.on.pointer = function (u) { $('#coords').textContent = 'RA ' + SX.fmtRA(u.ra) + ' · Dec ' + SX.fmtDec(u.dec); };
    sky.on.empty = function (u) { sky.setMarker(u.ra, u.dec); showPick(u); };
    $('#zIn').onclick = function () { sky.zoomBy(1.6); };
    $('#zOut').onclick = function () { sky.zoomBy(1 / 1.6); };
    $('#zHome').onclick = function () {
      const tg = app.get('target'), f = app.get('field');
      if (tg || f) ctrl.focus((tg ? tg.coordinates.ra : f.ra), (tg ? tg.coordinates.dec : f.dec), 28); else sky.flyTo(83.8, 4, 28, 900);
      U.announce(t('map.resetDone'));
    };
    const hint = $('#mapHint'); let dismissed = false;
    try { dismissed = localStorage.getItem('sx.hint.v1') === '1'; } catch (e) { /* ignore */ }
    if (dismissed) hint.dataset.dismissed = '1';
    $('#hintClose').onclick = function () { hint.dataset.dismissed = '1'; try { localStorage.setItem('sx.hint.v1', '1'); } catch (e) { /* ignore */ } };
  }

  /* "Nothing here" chip with an Inspect action (click anywhere on the sky). */
  let pickT = null;
  function showPick(u) {
    let chip = $('#pickChip');
    if (!chip) { chip = document.createElement('div'); chip.id = 'pickChip'; chip.className = 'pickchip'; $('#mapcard').appendChild(chip); }
    chip.hidden = false;
    chip.innerHTML = '<span class="ltr">RA ' + esc(SX.fmtRA(u.ra)) + ' · Dec ' + esc(SX.fmtDec(u.dec)) + '</span><button type="button" class="btn sm solid"><span>' + esc(t('pick.inspect')) + '</span></button>';
    chip.querySelector('button').onclick = function () { hidePick(); ctrl.goToField(u.ra, u.dec); };
    clearTimeout(pickT); pickT = setTimeout(hidePick, 7000);
  }
  function hidePick() {
    const c = $('#pickChip'); if (c) c.hidden = true; clearTimeout(pickT);
    const f = app.get('field'); if (sky && !(f && f.custom)) sky.setMarker(null);
  }

  /* ======================= object panel ======================= */
  function renderObject() {
    const tg = app.get('target'), f = app.get('field'), initial = $('#objInitial'), body = $('#objBody');
    if (!f) {
      body.hidden = true; initial.hidden = false; initial.innerHTML = '';
      const fe = app.get('featured');
      if (fe.status === 'error') { initial.appendChild(U.stateEl('error', { error: fe.error, retry: function () { ctrl.loadFeatured(); } })); return; }
      initial.appendChild(U.stateEl('initial', { title: t('obj.initialTitle'), text: t('obj.initialText') }));
      if (fe.status === 'loading' || fe.status === 'idle') { initial.appendChild(U.stateEl('loading', { text: t('state.loading'), compact: true })); return; }
      const wrap = document.createElement('div'); wrap.className = 'featured'; wrap.innerHTML = '<p class="lbl">' + esc(t('obj.tryThese')) + '</p>';
      const row = document.createElement('div'); row.className = 'chips';
      fe.list.slice(0, 7).forEach(function (tg) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = U.name(tg); b.onclick = function () { ctrl.selectTarget(tg); }; row.appendChild(b);
      });
      wrap.appendChild(row); initial.appendChild(wrap);
      return;
    }
    initial.hidden = true; body.hidden = false;
    const o = app.get('obs'), cur = ctrl.currentObs();
    const metaBox = $('#objMeta');
    if (tg) {
      $('#objKind').textContent = t('cls.' + tg.classification) === 'cls.' + tg.classification ? tg.classification : t('cls.' + tg.classification);
      $('#objTitle').textContent = U.name(tg);
      $('#objType').textContent = [U.typeLabel(tg), U.constellation(tg.constellation)].filter(Boolean).join(' · ');
      $('#objDesc').textContent = I.text(tg.description);
      const why = I.text(tg.whyInfrared); $('#objWhyBox').hidden = !why; $('#objWhy').textContent = why;
      $('#metaDl').innerHTML = (tg.metadata || []).map(function (m) { return '<dt>' + esc(U.metaLabel(m)) + '</dt><dd>' + esc(U.fmtMeta(m)) + '</dd>'; }).join('');
      metaBox.hidden = false;
    } else {
      $('#objKind').textContent = t('field.kind'); $('#objTitle').textContent = t('field.title');
      $('#objType').textContent = SX.fmtRA(f.ra) + ' · ' + SX.fmtDec(f.dec);
      $('#objDesc').textContent = t('field.desc'); $('#objWhyBox').hidden = true; metaBox.hidden = true;
    }
    $('#objType').classList.toggle('ltr', !tg);
    let facts = '<div><dt>' + esc(t('obj.coords')) + '</dt><dd class="mono">' + ltr('RA ' + SX.fmtRA(tg ? tg.coordinates.ra : f.ra)) + '<br>' + ltr('Dec ' + SX.fmtDec(tg ? tg.coordinates.dec : f.dec)) + '</dd></div>';
    facts += '<div><dt>' + esc(t('obj.availability')) + '</dt><dd>' + availabilityHTML(tg, o) + '</dd></div>';
    if (cur) facts += '<div><dt>' + esc(t('obj.observation')) + '</dt><dd>' + esc(cur.visitIndex ? t('time.visit', { n: cur.visitIndex }) : '') + ' · ' + esc(I.date(cur.startTime)) + ' ' + U.statusBadge(cur.status) + '</dd></div>';
    if (tg) { const d = (tg.metadata || []).find(function (m) { return m.key === 'distance'; }); if (d) facts += '<div data-min="intermediate"><dt>' + esc(U.metaLabel(d)) + '</dt><dd>' + esc(U.fmtMeta(d)) + '</dd></div>'; }
    if (!tg && app.get('nearest')) {
      const n = app.get('nearest');
      facts += '<div data-min="intermediate"><dt>' + esc(t('field.nearest')) + '</dt><dd><button type="button" class="linkbtn" id="nearBtn">' + esc(U.name(n.target)) + '</button> · ' + esc(I.num(n.sepDeg, { maximumFractionDigits: 1 })) + '°</dd></div>';
    }
    $('#objFacts').innerHTML = facts;
    const nb = $('#nearBtn'); if (nb) nb.onclick = function () { ctrl.selectTarget(app.get('nearest').target); };
    $('#objCompare').disabled = ctrl.observed().length < 2;
    $('#objCompare').title = $('#objCompare').disabled ? t('obj.compareNeed') : '';
  }
  function availabilityHTML(tg, o) {
    if (o.status === 'loading') return '<span class="muted">' + esc(t('obs.checking')) + '</span>';
    if (o.status === 'error') return '<span class="badge st-failed">' + esc(t('obs.unavailable')) + '</span>';
    if (o.status === 'empty') return '<span class="badge av-none">' + esc(U.availabilityLabel('none')) + '</span> <span class="muted small">' + esc(t('obs.noneHere')) + '</span>';
    const obsd = ctrl.observed().length, partial = o.list.some(function (x) { return x.quality.some(function (q) { return q.code === 'partial-coverage'; }); });
    const av = tg && tg.availability ? tg.availability : (partial ? 'partial' : 'available');
    return '<span class="badge av-' + esc(av) + '">' + esc(U.availabilityLabel(av)) + '</span> <span class="muted small">' + esc(t('obs.count', { n: o.list.length, o: obsd })) + '</span>';
  }

  function clearSel() { ctrl.clearSelection(); X.search.input.value = ''; sky.setMarker(null); hidePick(); }

  function wireObjectButtons() {
    $('#objCenter').onclick = function () { const tg = app.get('target'), f = app.get('field'); if (!f) return; ctrl.focus(tg ? tg.coordinates.ra : f.ra, tg ? tg.coordinates.dec : f.dec, Math.min(app.get('fov'), 18)); };
    $('#objObs').onclick = function () { SX.shell.go('observations'); };
    $('#objCompare').onclick = function () { SX.shell.go('comparison'); };
    $('#objClear').onclick = clearSel;
  }

  /* ---------- thumbnail ---------- */
  function thumbState(kind, text) {
    const el = $('#thumbState'); el.innerHTML = '';
    if (!kind) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = (kind === 'loading' ? '<span class="spinner sm"></span>' : SX.icon(kind === 'error' ? 'warn' : 'image')) + '<span>' + esc(text || '') + '</span>';
  }
  async function loadThumb() {
    const f = app.get('field'), o = app.get('obs'), cur = ctrl.currentObs(), cap = $('#thumbCap'), my = ++thumbToken;
    thumbData = null; if (!f) return;
    const c = $('#thumb'); c.getContext('2d').clearRect(0, 0, c.width, c.height);
    if (o.status === 'loading') { thumbState('loading', t('state.loading')); cap.textContent = ''; return; }
    if (o.status === 'error') { thumbState('error', t('thumb.error')); cap.textContent = ''; return; }
    if (o.status !== 'ok' || !cur) { thumbState('empty', t('thumb.none')); cap.textContent = ''; return; }
    if (cur.status !== 'observed') { thumbState('empty', t('thumb.planned')); cap.textContent = t('time.visit', { n: cur.visitIndex }) + ' · ' + I.date(cur.startTime); return; }
    thumbState('loading', t('thumb.loading'));
    const band = ctrl.currentBandId(), r = await ctrl.fetchImage(cur.id, band, 192);
    if (my !== thumbToken) return;
    if (r.status !== 'ok') { thumbState(r.status === 'error' ? 'error' : 'empty', r.error ? (r.error.code === 'not-available' ? t('thumb.bandMissing') : U.errorCopy(r.error).title) : t('thumb.none')); cap.textContent = ''; return; }
    thumbData = r.data; thumbState(null); repaintThumb();
    const b = ctrl.bands().find(function (x) { return x.id === band; });
    cap.textContent = (band === 'composite' ? t('view.composite') : 'B' + band + ' · ' + bandLabel(b)) + ' · ' + I.date(cur.startTime);
    $('#thumb').setAttribute('aria-label', t('thumb.aria', { name: app.get('target') ? U.name(app.get('target')) : t('field.title'), cap: cap.textContent }));
  }
  const repaintThumbDebounced = SX.debounce(function () { if (thumbData) SX.render.paint($('#thumb'), thumbData.img, { encoding: thumbData.encoding, palette: app.get('rgb') ? 'natural' : app.get('palette'), brightness: app.get('brightness'), contrast: app.get('contrast') }); }, 40);
  function repaintThumb() {
    const f = app.get('field'); if (!f) return;
    const band = ctrl.currentBandId();
    if (thumbData && thumbData.bandId !== band) { loadThumb(); return; }
    repaintThumbDebounced();
  }

  /* ======================= banner over the map ======================= */
  function renderBanner() {
    const b = $('#fieldBanner'), f = app.get('field'), o = app.get('obs');
    if (!f || o.status === 'ok' || o.status === 'idle') { b.hidden = true; b.innerHTML = ''; return; }
    b.hidden = false; b.innerHTML = '';
    if (o.status === 'loading') b.appendChild(U.stateEl('loading', { text: t('obs.looking'), compact: true }));
    else if (o.status === 'empty') b.appendChild(U.stateEl('notice', { title: t('obs.emptyTitle'), text: t('obs.emptyText'), compact: true }));
    else b.appendChild(U.stateEl('error', { error: o.error, retry: function () { ctrl.loadObservations(); }, compact: true }));
  }

  /* ======================= view controls ======================= */
  function buildPresets() {
    const box = $('#presets'); box.innerHTML = '';
    ctrl.MODES.forEach(function (m) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.id = m.id; b.textContent = t('mode.' + m.id);
      b.onclick = function () { ctrl.setMode(m.id); U.announce(t('mode.' + m.id) + '. ' + t('mode.' + m.id + '.d')); }; box.appendChild(b);
    });
  }
  function buildPalette() {
    const box = $('#paletteDots'); box.innerHTML = '';
    SX.render.PALETTES.forEach(function (p) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.p = p.id; b.title = t('pal.' + p.id); b.setAttribute('aria-label', t('pal.' + p.id));
      b.innerHTML = '<i style="background:' + p.swatch + '"></i><span>' + esc(t('pal.' + p.id + '.s')) + '</span>';
      b.onclick = function () { app.set({ palette: p.id, rgb: false }); ctrl.syncModeFromControls(); }; box.appendChild(b);
    });
  }
  function buildBandbar() {
    const box = $('#bandbar'); box.innerHTML = '';
    ctrl.bands().forEach(function (b) {
      const el = document.createElement('button'); el.type = 'button'; el.dataset.id = b.id; el.textContent = 'B' + b.id;
      el.title = bandLabel(b); el.setAttribute('aria-label', t('view.bandAria', { id: b.id, range: bandLabel(b) }));
      el.onclick = function () { app.set({ rgb: false, wl: ctrl.bandCentre(b) }); ctrl.syncModeFromControls(); }; box.appendChild(el);
    });
    const r = ctrl.wlRange(), s = $('#wlS'); s.min = Math.round(r.min * 100); s.max = Math.round(r.max * 100);
  }
  function wireControls() {
    $('#wlS').addEventListener('input', function () { app.set({ rgb: false, wl: +this.value / 100 }); ctrl.syncModeFromControls(); });
    $('#fovS').addEventListener('input', function () { const f = fovFromSlider(+this.value); sky.setView(sky.view.ra, sky.view.dec, f); });
    $('#briS').addEventListener('input', function () { app.set({ brightness: +this.value / 100 }); });
    $('#gainS').addEventListener('input', function () { app.set({ brightness: +this.value / 100 }); });
    $('#conS').addEventListener('input', function () { app.set({ contrast: +this.value / 100 }); });
    $('#resetLevels').onclick = function () { app.set({ brightness: 1, contrast: 1 }); U.toast(t('view.resetDone')); };
    $('#tGrid').onclick = function () { app.set({ grid: !app.get('grid') }); };
    $('#tLabels').onclick = function () { app.set({ labels: !app.get('labels') }); };
    $('#tFoot').onclick = function () { app.set({ foot: !app.get('foot') }); if (app.get('foot')) U.toast(t('view.footNote')); };
    $('#moreControls').onclick = function () { SX.actions.run('setLevel', 'intermediate'); };
    $('#stripBand').onclick = function () { openViewPane(); };
  }
  function openViewPane() {
    if (desktop()) { const p = $('#paneView'); p.scrollIntoView({ block: 'nearest', behavior: SX.motionReduced() ? 'auto' : 'smooth' }); const f = SX.focusables(p)[0]; if (f) f.focus(); }
    else setPane('view', true);
  }
  function renderControls() {
    const s = app.get(), band = ctrl.bandFor(s.rgb ? 2.4 : s.wl), mode = s.mode;
    $$('#presets button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.id === mode)); });
    const md = mode === 'custom' ? t('mode.custom.d') : t('mode.' + mode + '.d'); $('#modeDesc').textContent = md;
    $('#wlV').innerHTML = s.rgb ? esc(t('view.composite')) : esc(s.wl.toFixed(2)) + ' <u>µm</u>';
    $('#wlHint').textContent = s.rgb ? t('view.compositeHint') : bandHint(band);
    $('#wlS').value = Math.round(s.wl * 100); $('#wlS').disabled = s.rgb; $('#wlS').setAttribute('aria-valuetext', s.rgb ? t('view.composite') : s.wl.toFixed(2) + ' µm');
    $$('#bandbar button').forEach(function (b) { b.classList.toggle('on', !s.rgb && +b.dataset.id === band.id); b.setAttribute('aria-pressed', String(!s.rgb && +b.dataset.id === band.id)); });
    $$('#paletteDots button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.p === s.palette && !s.rgb)); });
    $('#fovV').textContent = fmtFov(sky.view.fov); $('#fovS').value = sliderFromFov(sky.view.fov);
    $('#briV').textContent = s.brightness.toFixed(2); $('#conV').textContent = s.contrast.toFixed(2); $('#gainV').textContent = s.brightness.toFixed(1);
    $('#briS').value = Math.round(s.brightness * 100); $('#gainS').value = Math.round(s.brightness * 100); $('#conS').value = Math.round(s.contrast * 100);
    $('#tGrid').setAttribute('aria-pressed', String(s.grid)); $('#tLabels').setAttribute('aria-pressed', String(s.labels)); $('#tFoot').setAttribute('aria-pressed', String(s.foot));
    $('#stripBand').textContent = s.rgb ? 'RGB' : band.id <= 3 ? 'NIR' : band.id === 4 ? 'IR' : 'COLD';
    $('#stripInfo').textContent = s.rgb ? t('view.composite') : s.wl.toFixed(2) + ' µm · B' + band.id;
    renderMetrics();
  }
  function bandHint(b) { const k = 'band.hint.' + b.id; return SX.i18n.has(k) ? t(k) : I.text(b.hint) || ''; }

  /* ======================= timeline ======================= */
  function wireTimeline() {
    $('#playBtn').onclick = togglePlay; $('#playBtn2').onclick = togglePlay;
    $('#prevV').onclick = function () { ctrl.stepVisit(-1); }; $('#nextV').onclick = function () { ctrl.stepVisit(1); };
    $('#speedBtn').onclick = function () { const sp = [0.5, 1, 2, 4], i = sp.indexOf(app.get('speed')); app.set({ speed: sp[(i + 1) % sp.length] }); if (app.get('playing')) startPlay(); };
    $('#loopBtn').onclick = function () { app.set({ loop: !app.get('loop') }); };
    $('#timeCollapse').onclick = function () {
      const p = $('#paneTime'), c = p.classList.toggle('collapsed'); this.setAttribute('aria-expanded', String(!c));
      this.querySelector('svg').innerHTML = '<use href="#i-' + (c ? 'chev-up' : 'chev-down') + '"/>';
    };
    $('#mini').addEventListener('click', function (e) {
      const r = this.getBoundingClientRect(), ra = (1 - (e.clientX - r.left) / r.width) * 360, dec = 90 - (e.clientY - r.top) / r.height * 180;
      sky.flyTo(ra, clamp(dec, -85, 85), Math.min(sky.view.fov, 40), 900);
    });
    SX.actions.register('togglePlay', togglePlay);
    SX.actions.register('play', startPlay); SX.actions.register('pause', stopPlay);
  }

  function renderTimeline() {
    const o = app.get('obs'), f = app.get('field'), st = $('#timeState'), body = $('#tlBody');
    const none = !f || o.status !== 'ok';
    body.hidden = none; st.hidden = !none;
    $$('#prevV, #nextV, #playBtn, #playBtn2, #speedBtn, #loopBtn').forEach(function (b) { b.disabled = none; });
    if (none) {
      st.innerHTML = '';
      if (!f) st.appendChild(U.stateEl('initial', { title: t('time.initialTitle'), text: t('time.initialText'), compact: true }));
      else if (o.status === 'loading') st.appendChild(U.stateEl('loading', { text: t('obs.looking'), compact: true }));
      else if (o.status === 'empty') st.appendChild(U.stateEl('empty', { title: t('obs.emptyTitle'), text: t('obs.emptyText'), compact: true }));
      else st.appendChild(U.stateEl('error', { error: o.error, retry: function () { ctrl.loadObservations(); }, compact: true }));
      $('#timecode span').textContent = t('time.noVisit'); $('#timecode').classList.add('paused');
      renderPlay(); return;
    }
    const sc = $('#scrub'), n = o.list.length, ci = currentIndex();
    $$('.sc', sc).forEach(function (x) { x.remove(); });
    o.list.forEach(function (ob, i) {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'sc' + (i === ci ? ' on' : '') + (i < ci ? ' past' : '') + (ob.status !== 'observed' ? ' planned' : '');
      b.style.insetInlineStart = n === 1 ? '50%' : 'calc(14px + (100% - 28px) * ' + (i / (n - 1)) + ')';
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(i === ci)); b.tabIndex = i === ci ? 0 : -1;
      b.setAttribute('aria-label', t('time.visitLabel', { n: ob.visitIndex, date: I.date(ob.startTime), status: U.statusLabel(ob.status) }));
      b.innerHTML = '<i>' + ob.visitIndex + '</i><span>' + esc(dateShort(ob)) + '</span>';
      b.onclick = function () { ctrl.selectVisit(ob.id); };
      b.onkeydown = function (e) {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -99 : e.key === 'End' ? 99 : 0;
        if (!d) return; e.preventDefault(); ctrl.stepVisit(d); setTimeout(function () { const on = $('.sc.on', sc); if (on) on.focus(); }, 0);
      };
      sc.appendChild(b);
    });
    $('#prog').style.width = (n < 2 ? 0 : (Math.max(ci, 0) / (n - 1) * 100)) + '%';
    const cur = o.list[ci];
    $('#timecode span').textContent = cur ? 'V' + cur.visitIndex + ' · ' + I.dateShort(cur.startTime) + (cur.status !== 'observed' ? ' (' + U.statusLabel(cur.status) + ')' : '') : '—';
    const box = $('#curObs');
    if (cur) {
      const bandsOk = cur.bands.filter(function (b) { return b.available; }).length;
      box.innerHTML = '<p class="cur-t">' + esc(t('time.visit', { n: cur.visitIndex })) + ' · ' + esc(I.date(cur.startTime)) + ' ' + U.statusBadge(cur.status) + '</p>' +
        '<div class="flags">' + U.flags(cur.quality) + '</div>' +
        '<p class="cur-m muted small">' + esc(t('time.coverage', { v: I.pct(cur.coverage), b: bandsOk, n: cur.bands.length })) + '</p>' +
        '<div class="cur-a"><button type="button" class="btn sm" id="curDetails"><span>' + esc(t('obs.details')) + '</span></button><button type="button" class="btn sm" data-go="observations"><span>' + esc(t('time.allObs')) + '</span></button></div>';
      $('#curDetails').onclick = function () { SX.observations.openDetails(cur); };
    } else box.innerHTML = '';
    renderPlay(); renderMetrics();
  }

  function renderPlay() {
    const p = app.get('playing');
    ['#playBtn', '#playBtn2'].forEach(function (s) {
      const b = $(s); b.innerHTML = SX.icon(p ? 'pause' : 'play'); b.setAttribute('aria-pressed', String(p)); b.setAttribute('aria-label', t(p ? 'time.pause' : 'time.play')); b.title = t(p ? 'time.pause' : 'time.play');
    });
    $('#timecode').classList.toggle('paused', !p);
    const sp = $('#speedBtn'); sp.textContent = app.get('speed') + '×'; sp.setAttribute('aria-label', t('time.speed', { v: app.get('speed') })); sp.title = t('time.speed', { v: app.get('speed') });
    $('#loopBtn').setAttribute('aria-pressed', String(app.get('loop')));
  }
  function tick() {
    const l = app.get('obs').list, i = currentIndex();
    let j = -1; for (let k = i + 1; k < l.length; k++) if (l[k].status === 'observed') { j = k; break; }
    if (j < 0) { if (app.get('loop')) { j = l.findIndex(function (o) { return o.status === 'observed'; }); } else { stopPlay(); return; } }
    if (j >= 0) ctrl.selectVisit(l[j].id);
  }
  function startPlay() {
    if (ctrl.observed().length < 2) { U.toast(t('time.needTwo')); return; }
    clearInterval(timer); timer = setInterval(tick, 1900 / app.get('speed')); app.set({ playing: true }); U.announce(t('time.playing'));
  }
  function stopPlay() { clearInterval(timer); timer = null; if (app.get('playing')) { app.set({ playing: false }); U.announce(t('time.paused')); } }
  function togglePlay() { app.get('playing') ? stopPlay() : startPlay(); }
  app.subscribe(['field', 'obs'], function () { if (app.get('playing') && ctrl.observed().length < 2) stopPlay(); });

  /* ---------- advanced: metrics, histogram, overview ---------- */
  function renderMetrics() {
    const el = $('#metrics'); if (!el || !sky) return;
    const s = app.get(), band = ctrl.bandFor(s.rgb ? 2.4 : s.wl), v = sky.view, o = app.get('obs');
    const cell = function (k, val) { return '<div><small>' + esc(t(k)) + '</small><b class="ltr">' + esc(val) + '</b></div>'; };
    el.innerHTML = cell('metric.fov', fmtFov(v.fov)) + cell('metric.wl', s.rgb ? 'RGB' : s.wl.toFixed(2) + ' µm') + cell('metric.band', band.id + ' / ' + ctrl.bands().length) +
      cell('metric.ra', SX.fmtRA(v.ra).slice(0, 7)) + cell('metric.dec', SX.fmtDec(v.dec).slice(0, 7)) + cell('metric.channels', String(band.channels || '—')) +
      cell('metric.visits', o.status === 'ok' ? String(o.list.length) : '—') + cell('metric.provider', SX.data.describe().simulated ? t('metric.mock') : SX.data.describe().name);
  }
  function drawHist() {
    const c = $('#hist'); if (!c || !sky || !c.offsetParent) return;
    const x = c.getContext('2d'), W = c.width, H = c.height, bins = new Array(20).fill(0), p = {}, ir = irNow(), st = sky.stars; let n = 0, sum = 0;
    const wl = ir.wl === 'rgb' ? 2.4 : ir.wl;
    for (let i = 0; i < st.length; i += 2) {
      const s = st[i]; if (!sky.project(s.ra, s.dec, p) || p.x < 0 || p.x > sky.W || p.y < 0 || p.y > sky.H) continue;
      const fl = SX.render.fluxStar(s.t, wl) * (0.42 + 0.78 * Math.pow(10, -0.2 * (s.mag - 2))), v = SX.render.colorFor(fl, s.t, ir)[3];
      bins[Math.min(19, Math.floor(v * 20))]++; n++; sum += v;
    }
    x.clearRect(0, 0, W, H); const mx = Math.max.apply(null, bins) || 1; x.fillStyle = getComputedStyle(c).color || '#fff';
    bins.forEach(function (b, i) { const h = Math.sqrt(b / mx) * (H - 4); x.fillRect(i * (W / 20) + 1, H - h, W / 20 - 2, h); });
    $('#histV').textContent = 'H' + (n ? (sum / n * 5).toFixed(2) : '0.00');
  }
  function drawMini() {
    const c = $('#mini'); if (!c || !c.offsetParent) return;
    const x = c.getContext('2d'), W = c.width, H = c.height, cs = getComputedStyle(c);
    const X_ = function (ra) { return (1 - ra / 360) * W; }, Y = function (d) { return (90 - d) / 180 * H; };
    x.clearRect(0, 0, W, H); x.fillStyle = cs.getPropertyValue('--mini-bg') || '#06100e'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(120,255,214,.10)'; x.lineWidth = 1;
    for (let d = -60; d <= 60; d += 30) { x.beginPath(); x.moveTo(0, Y(d)); x.lineTo(W, Y(d)); x.stroke(); }
    for (let r = 0; r < 360; r += 60) { x.beginPath(); x.moveTo(X_(r), 0); x.lineTo(X_(r), H); x.stroke(); }
    x.strokeStyle = 'rgba(56,242,194,.30)'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); let pen = false, lx = 0;
    SX.config.backdrop.getGalacticPlane().forEach(function (g) { const px = X_(g.ra), py = Y(g.dec); if (pen && Math.abs(px - lx) > W / 2) pen = false; if (pen) x.lineTo(px, py); else x.moveTo(px, py); pen = true; lx = px; }); x.stroke();
    const sel = app.get('target');
    sky.markers.forEach(function (m) { const on = sel && m.id === sel.id; x.fillStyle = on ? '#ffd84d' : 'rgba(244,255,249,.75)'; x.beginPath(); x.arc(X_(m.ra), Y(m.dec), on ? 4 : 2.2, 0, 6.3); x.fill(); });
    const v = sky.view, fw = Math.min(360, v.fov / Math.max(0.2, Math.cos(v.dec * Math.PI / 180))), fh = Math.min(180, v.fov * sky.H / sky.W);
    x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.strokeRect(X_(v.ra) - fw / 360 * W / 2, Y(v.dec) - fh / 180 * H / 2, Math.max(6, fw / 360 * W), Math.max(6, fh / 180 * H));
  }

  /* ======================= dock / bottom sheet (phone + tablet) ======================= */
  function setPane(p, forceOpen) {
    view.dataset.pane = p;
    $$('#dockTabs button').forEach(function (b) { const on = b.dataset.pane === p; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    if (forceOpen && view.dataset.sheet === 'peek') view.dataset.sheet = 'half';
    syncDockToggle(); centerFrac(); setTimeout(function () { sky.dirty(); }, 60);
  }
  function setSheet(s) { view.dataset.sheet = s; syncDockToggle(); setTimeout(centerFrac, 30); }
  function syncDockToggle() { $('#dockHandle').setAttribute('aria-expanded', String(view.dataset.sheet !== 'peek')); }
  function wireDock() {
    $$('#dockTabs button').forEach(function (b) {
      b.addEventListener('click', function () { if (view.dataset.pane === b.dataset.pane && view.dataset.sheet !== 'peek') { /* keep open */ } setPane(b.dataset.pane, true); });
      b.addEventListener('keydown', function (e) {
        const tabs = $$('#dockTabs button'), i = tabs.indexOf(b), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); const n = tabs[(i + (document.documentElement.dir === 'rtl' ? -d : d) + tabs.length) % tabs.length]; setPane(n.dataset.pane, true); n.focus(); }
      });
    });
    const order = ['peek', 'half', 'full'], head = $('.dock-head'); let y0 = null, dragged = false;
    $('#dockHandle').addEventListener('click', function () { if (dragged) { dragged = false; return; } setSheet({ peek: 'half', half: 'full', full: 'peek' }[view.dataset.sheet] || 'half'); });
    head.addEventListener('pointerdown', function (e) { if (e.target.closest('.dock-tabs button')) return; y0 = e.clientY; dragged = false; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointerup', function (e) {
      if (y0 == null) return; const dy = e.clientY - y0; y0 = null;
      if (Math.abs(dy) < 28) return;
      dragged = true; const i = order.indexOf(view.dataset.sheet); setSheet(order[clamp(i + (dy < 0 ? 1 : -1), 0, 2)]);
    });
    setPane('object');
    SX.actions.register('showView', function () { SX.shell.go('explorer'); openViewPane(); });
  }

  /* ======================= actions for the assistant / shortcuts ======================= */
  SX.actions.register('setMode', function (id) { SX.shell.go('explorer', { focus: false }); ctrl.setMode(id); });
  SX.actions.register('selectFeatured', function (id) {
    const tg = app.get('featured').list.find(function (x) { return x.id === id; });
    SX.shell.go('explorer', { focus: false }); if (tg) ctrl.selectTarget(tg); else SX.data.getTargetById(id).then(function (r) { if (r.status === 'ok') ctrl.selectTarget(r.data); });
  });

  function renderAll() { renderObject(); renderControls(); renderTimeline(); renderPlay(); renderBanner(); renderMetrics(); refreshMarkers(); loadThumb(); }
})();
