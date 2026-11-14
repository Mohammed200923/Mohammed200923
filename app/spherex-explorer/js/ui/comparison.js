/* Comparison view: before/after slider, side by side, difference, blink, with date selection.
   Images come from getObservationImage(); the difference image and summary from getComparisonResult().      */
(function () {
  const SX = window.SX, U = SX.ui, app = SX.app, ctrl = SX.ctrl, esc = SX.esc;
  const $ = SX.$, $$ = SX.$$, t = function (k, p) { return SX.i18n.t(k, p); }, I = SX.i18n;
  const C = (SX.comparison = {});
  let widget, token = 0, cur = null, bri = 1, con = 1, lastKey = '';

  C.init = function () {
    new U.SearchBox($('#cmpSearch'), { compact: true });
    widget = new SX.Compare($('#cmp'), { t: t });
    buildModes();
    $('#cmpA').onchange = function () { ctrl.setCompare({ a: this.value }); };
    $('#cmpB').onchange = function () { ctrl.setCompare({ b: this.value }); };
    $('#cmpBand').onchange = function () { ctrl.setCompare({ band: this.value === 'composite' ? 'composite' : +this.value }); };
    $('#cmpSwap').onclick = function () { const c = app.get('cmp'); ctrl.setCompare({ a: c.b, b: c.a }); };
    $('#cmpBri').oninput = function () { bri = +this.value / 100; repaint(); };
    $('#cmpCon').oninput = function () { con = +this.value / 100; repaint(); };
    app.subscribe(['cmp', 'obs', 'field', 'target'], function () { render(); });
    app.subscribe(['palette', 'rgb'], repaint);
    SX.bus.on('lang', function () { buildModes(); lastKey = ''; render(); });
    SX.bus.on('view', function (v) { if (v === 'comparison') { lastKey = ''; render(); } });
    render();
  };

  function buildModes() {
    const box = $('#cmpModes'), mode = app.get('cmp').mode; box.innerHTML = '';
    ['slider', 'side', 'diff', 'blink'].forEach(function (m) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.m = m; b.setAttribute('aria-checked', String(m === mode)); b.textContent = t('cmp.m.' + m);
      b.onclick = function () { ctrl.setCompare({ mode: m }); }; box.appendChild(b);
    });
  }

  function ctxBar() {
    const tg = app.get('target'), f = app.get('field'), c = $('#cmpCtx');
    if (!f) { c.hidden = true; return; }
    c.hidden = false;
    c.innerHTML = '<span class="ctx-l">' + esc(t('ctx.comparing')) + '</span><strong>' + esc(tg ? U.name(tg) : t('field.title')) + '</strong><span class="ltr muted small">RA ' + esc(SX.fmtRA(f.ra)) + ' · Dec ' + esc(SX.fmtDec(f.dec)) + '</span>';
  }

  function gate() {
    const g = $('#cmpGate'), o = app.get('obs'), f = app.get('field'); g.innerHTML = '';
    let msg = null;
    if (!f) { msg = ['initial', { title: t('cmp.noTargetTitle'), text: t('cmp.noTargetText') }]; }
    else if (o.status === 'loading') msg = ['loading', { text: t('obs.looking') }];
    else if (o.status === 'empty') msg = ['empty', { title: t('obs.emptyTitle'), text: t('obs.emptyText') }];
    else if (o.status === 'error') msg = ['error', { error: o.error, retry: function () { ctrl.loadObservations(); } }];
    else if (ctrl.observed().length < 2) msg = ['empty', { title: t('cmp.needTwoTitle'), text: t('cmp.needTwoText'), actions: [{ label: t('time.allObs'), onClick: function () { SX.shell.go('observations'); } }] }];
    if (!msg) { g.hidden = true; return true; }
    g.hidden = false; g.appendChild(U.stateEl(msg[0], msg[1]));
    if (!f) { const fe = app.get('featured'); if (fe.status === 'ok') { const row = document.createElement('div'); row.className = 'chips'; fe.list.slice(0, 8).forEach(function (tg) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = U.name(tg); b.onclick = function () { ctrl.selectTarget(tg); }; row.appendChild(b); }); g.appendChild(row); } }
    return false;
  }

  function fillSelects() {
    const o = ctrl.observed(), c = app.get('cmp');
    const opts = o.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(t('time.visit', { n: x.visitIndex }) + ' · ' + I.date(x.startTime)) + '</option>'; }).join('');
    $('#cmpA').innerHTML = opts; $('#cmpB').innerHTML = opts; $('#cmpA').value = c.a; $('#cmpB').value = c.b;
    $('#cmpBand').innerHTML = ctrl.bands().map(function (b) { return '<option value="' + b.id + '">B' + b.id + ' · ' + b.minMicron.toFixed(2) + '–' + b.maxMicron.toFixed(2) + ' µm</option>'; }).join('') + '<option value="composite">' + esc(t('view.composite')) + '</option>';
    $('#cmpBand').value = String(c.band);
    $$('#cmpModes button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.m === c.mode)); });
    $('#cmpBri').value = Math.round(bri * 100); $('#cmpCon').value = Math.round(con * 100); $('#cmpBriV').textContent = bri.toFixed(2); $('#cmpConV').textContent = con.toFixed(2);
  }

  function overlay(kind, opts) {
    const ov = $('#cmpOverlay'); ov.innerHTML = '';
    if (!kind) { ov.hidden = true; return; }
    ov.hidden = false; ov.appendChild(U.stateEl(kind, opts));
  }

  function render() {
    ctxBar();
    const ok = gate(), main = $('#cmpMain'); main.hidden = !ok;
    if (!ok || SX.shell.current() !== 'comparison') return;
    fillSelects();
    const c = app.get('cmp'); widget.setMode(c.mode);
    const key = [c.a, c.b, c.band].join('|');
    if (key === lastKey && cur) { repaint(); diffOverlay(); return; }
    lastKey = key; refresh();
  }

  async function refresh() {
    const c = app.get('cmp'), my = ++token, list = ctrl.observed();
    const A = list.find(function (x) { return x.id === c.a; }), B = list.find(function (x) { return x.id === c.b; });
    cur = null; $('#cmpResult').innerHTML = '';
    if (!A || !B) return;
    if (A.id === B.id) { overlay('notice', { title: t('cmp.sameTitle'), text: t('cmp.sameText') }); resultCard(null, null, A, B, 'same'); widget.setMarkers([], 1); return; }
    overlay('loading', { text: t('cmp.loading') }); resultCard(null, null, A, B, 'loading');
    const [ra, rb, rc] = await Promise.all([ctrl.fetchImage(A.id, c.band, 256), ctrl.fetchImage(B.id, c.band, 256), SX.data.getComparisonResult(A.id, B.id, { bandId: c.band })]);
    if (my !== token) return;
    const bad = ra.status !== 'ok' ? ra : rb.status !== 'ok' ? rb : null;
    if (bad) {
      const which = ra.status !== 'ok' ? A : B;
      overlay(bad.status === 'error' ? 'error' : 'empty', bad.status === 'error'
        ? { error: bad.error, retry: function () { lastKey = ''; render(); }, text: bad.error.code === 'not-available' ? t('cmp.bandMissing', { n: which.visitIndex, band: c.band === 'composite' ? t('view.composite') : 'B' + c.band }) : undefined }
        : { title: t('thumb.none'), text: '' });
      resultCard(null, null, A, B, 'images-failed'); return;
    }
    let diffImg = null;
    if (rc.status === 'ok') { try { diffImg = await SX.render.loadImage(rc.data.differenceImageUrl); } catch (e) { rc.status = 'error'; rc.error = e; } }
    if (my !== token) return;
    cur = { A: A, B: B, ra: ra.data, rb: rb.data, rc: rc, diff: diffImg };
    overlay(null);
    widget.setLabels(t('cmp.before') + ' · ' + I.date(A.startTime), t('cmp.after') + ' · ' + I.date(B.startTime), t('sim.imgBadge'), t('cmp.sliderAria'));
    repaint(); resultCard(rc, diffImg, A, B, null);
    diffOverlay();
    U.announce(t('cmp.ready'));
  }

  function diffOverlay() {
    if (!cur) return;
    if (app.get('cmp').mode === 'diff' && cur.rc.status !== 'ok') overlay('error', { error: cur.rc.error, retry: function () { lastKey = ''; render(); } });
    else overlay(null);
  }

  function repaint() {
    if (!cur) return;
    const o = { palette: app.get('rgb') ? 'natural' : app.get('palette'), brightness: bri, contrast: con };
    SX.render.paint(widget.ca, cur.ra.img, { encoding: cur.ra.encoding, palette: o.palette, brightness: o.brightness, contrast: o.contrast });
    SX.render.paint(widget.cb, cur.rb.img, { encoding: cur.rb.encoding, palette: o.palette, brightness: o.brightness, contrast: o.contrast });
    if (cur.diff) SX.render.paint(widget.cd, cur.diff, { encoding: 'rgb', brightness: 1, contrast: 1 });
    const cs = cur.rc.status === 'ok' ? cur.rc.data : null;
    widget.setMarkers(cs ? cs.candidates.map(function (m) { return { x: m.pixel.x, y: m.pixel.y, label: m.label ? I.text(m.label) : '' }; }) : [], cs ? cs.width : 1);
    $('#cmpBriV').textContent = bri.toFixed(2); $('#cmpConV').textContent = con.toFixed(2);
  }

  function resultCard(rc, diff, A, B, state) {
    const box = $('#cmpResult'); box.innerHTML = '<h3 class="h3">' + esc(t('cmp.summary')) + '</h3>';
    if (state === 'loading') { box.appendChild(U.stateEl('loading', { text: t('cmp.loading'), compact: true })); return; }
    if (state === 'same') { box.appendChild(U.stateEl('notice', { text: t('cmp.sameText'), compact: true })); return; }
    if (state === 'images-failed') { box.appendChild(U.stateEl('notice', { text: t('cmp.noSummary'), compact: true })); return; }
    if (!rc || rc.status !== 'ok') { box.appendChild(U.stateEl('error', { error: rc && rc.error, retry: function () { lastKey = ''; render(); }, compact: true })); return; }
    const d = rc.data, s = d.summary;
    let h = '<p class="big-num"><b>' + esc(I.pct(s.changedPixelFraction, 1)) + '</b><span>' + esc(t('cmp.changed')) + '</span></p>';
    h += '<p class="blurb small">' + esc(d.notes ? I.text(d.notes) : '') + '</p>';
    h += '<dl class="facts" data-min="intermediate"><div><dt>' + esc(t('cmp.peak')) + '</dt><dd>' + esc(I.num(s.peakChange, { maximumFractionDigits: 3 })) + '</dd></div><div><dt>' + esc(t('cmp.signif')) + '</dt><dd><span class="badge sig-' + esc(s.significance) + '">' + esc(t('cmp.sig.' + s.significance)) + '</span></dd></div></dl>';
    h += '<div data-min="intermediate"><p class="lbl">' + esc(t('cmp.candidates')) + '</p>' + (d.candidates.length ? '<ul class="cands">' + d.candidates.map(function (c) { return '<li><b>' + esc(c.label ? I.text(c.label) : c.id) + '</b><small>' + esc(t('cmp.ct.' + c.changeType)) + ' · ' + esc(t('cmp.conf', { v: Math.round(c.confidence * 100) })) + '</small></li>'; }).join('') + '</ul>' : '<p class="muted small">' + esc(t('cmp.noCandidates')) + '</p>') + '</div>';
    h += '<p class="tiny muted demo-note">' + esc(t('cmp.demoNote')) + '</p>';
    const raw = Object.assign({}, d, { differenceImageUrl: d.differenceImageUrl.slice(0, 40) + '…' });
    h += '<details class="meta" data-min="advanced"><summary>' + esc(t('cmp.raw')) + '</summary><pre class="json ltr">' + esc(JSON.stringify(raw, null, 2)) + '</pre></details>';
    box.insertAdjacentHTML('beforeend', h);
  }
})();
