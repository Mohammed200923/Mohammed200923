/* Observations view: list of observations for the current target/field with thumbnails, quality flags,
   band availability, metadata dialog, and hand-off to Explorer / Comparison.                            */
(function () {
  const SX = window.SX, U = SX.ui, app = SX.app, ctrl = SX.ctrl, esc = SX.esc;
  const $ = SX.$, $$ = SX.$$, t = function (k, p) { return SX.i18n.t(k, p); }, I = SX.i18n;
  const O = (SX.observations = {});
  let view, filter = 'all', band = 4, token = 0, images = {};

  O.init = function () {
    view = $('#view-observations');
    new U.SearchBox($('#obsSearch'), { compact: true });
    band = ctrl.currentBandId() === 'composite' ? 'composite' : ctrl.currentBandId();
    buildFilter(); buildBandSelect();
    $('#obsBand').addEventListener('change', function () { band = this.value === 'composite' ? 'composite' : +this.value; renderGrid(); });
    app.subscribe(['field', 'target', 'obs', 'visitId', 'bands'], function () { buildBandSelect(); if (SX.shell.current() === 'observations') render(); });
    app.subscribe(['palette', 'brightness', 'contrast', 'rgb'], repaintAll);
    SX.bus.on('lang', function () { buildFilter(); buildBandSelect(); render(); });
    SX.bus.on('view', function (v) { if (v === 'observations') render(); });
    $('#obsDlgClose').onclick = function () { U.closeDialog($('#obsDialog')); };
    $('#obsDialog').addEventListener('click', function (e) { if (e.target === this) U.closeDialog(this); });
    render();
  };

  function buildFilter() {
    const box = $('#obsFilter'); box.innerHTML = '';
    ['all', 'observed', 'planned'].forEach(function (f) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(f === filter)); b.dataset.f = f; b.textContent = t('obs.f.' + f);
      b.onclick = function () { filter = f; $$('#obsFilter button').forEach(function (x) { x.setAttribute('aria-checked', String(x.dataset.f === filter)); }); renderGrid(); };
      box.appendChild(b);
    });
  }
  function buildBandSelect() {
    const s = $('#obsBand'), cur = band;
    s.innerHTML = ctrl.bands().map(function (b) { return '<option value="' + b.id + '">B' + b.id + ' · ' + b.minMicron.toFixed(2) + '–' + b.maxMicron.toFixed(2) + ' µm</option>'; }).join('') + '<option value="composite">' + esc(t('view.composite')) + '</option>';
    s.value = String(cur);
  }

  function ctxBar() {
    const tg = app.get('target'), f = app.get('field'), c = $('#obsCtx');
    if (!f) { c.hidden = true; return; }
    c.hidden = false;
    c.innerHTML = '<span class="ctx-l">' + esc(t('ctx.showing')) + '</span><strong>' + esc(tg ? U.name(tg) : t('field.title')) + '</strong><span class="ltr muted small">RA ' + esc(SX.fmtRA(f.ra)) + ' · Dec ' + esc(SX.fmtDec(f.dec)) + '</span>' + (tg ? '<span class="muted small">' + esc(U.typeLabel(tg)) + '</span>' : '');
  }

  function render() {
    ctxBar();
    const o = app.get('obs'), f = app.get('field'), st = $('#obsState'), grid = $('#obsGrid'), tb = $('#obsToolbar');
    const show = f && o.status === 'ok';
    tb.hidden = !show; grid.hidden = !show; st.hidden = show;
    if (show) { st.innerHTML = ''; renderGrid(); return; }
    st.innerHTML = '';
    if (!f) {
      st.appendChild(U.stateEl('initial', { title: t('obs.noTargetTitle'), text: t('obs.noTargetText') }));
      const fe = app.get('featured');
      if (fe.status === 'ok') { const row = document.createElement('div'); row.className = 'chips'; fe.list.slice(0, 8).forEach(function (tg) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = U.name(tg); b.onclick = function () { ctrl.selectTarget(tg); }; row.appendChild(b); }); st.appendChild(row); }
    } else if (o.status === 'loading') {
      st.appendChild(U.stateEl('loading', { text: t('obs.looking') }));
      const sk = document.createElement('div'); sk.className = 'obs-grid skeleton'; sk.innerHTML = '<div class="obs-card sk"></div><div class="obs-card sk"></div><div class="obs-card sk"></div>'; st.appendChild(sk);
    } else if (o.status === 'empty') {
      st.appendChild(U.stateEl('empty', { title: t('obs.emptyTitle'), text: t('obs.emptyText'), actions: [{ label: t('obs.tryAnother'), onClick: function () { SX.actions.run('focusSearch'); } }] }));
    } else if (o.status === 'error') st.appendChild(U.stateEl('error', { error: o.error, retry: function () { ctrl.loadObservations(); } }));
  }

  function renderGrid() {
    const o = app.get('obs'), grid = $('#obsGrid'), my = ++token; images = {};
    if (o.status !== 'ok') return;
    const list = o.list.filter(function (x) { return filter === 'all' || (filter === 'observed' ? x.status === 'observed' : x.status !== 'observed'); });
    grid.innerHTML = '';
    if (!list.length) { grid.appendChild(U.stateEl('empty', { title: t('obs.filterEmpty'), text: t('obs.filterEmptyText') })); return; }
    const cur = app.get('visitId'), nObserved = ctrl.observed().length;
    list.forEach(function (ob) {
      const card = document.createElement('article'); card.className = 'obs-card' + (ob.id === cur ? ' current' : ''); card.dataset.id = ob.id;
      card.setAttribute('aria-labelledby', 'oc-' + ob.visitIndex);
      const pips = ob.bands.map(function (b) { return '<li class="' + (b.available ? 'on' : '') + '" title="B' + b.bandId + ': ' + esc(b.available ? t('obs.bandOk') : t('obs.bandMissing')) + '"><span class="sr">B' + b.bandId + ' ' + esc(b.available ? t('obs.bandOk') : t('obs.bandMissing')) + '</span></li>'; }).join('');
      const obsd = ob.status === 'observed';
      card.innerHTML =
        '<div class="obs-thumb"><canvas width="160" height="160" role="img" aria-label="' + esc(t('obs.thumbAria', { n: ob.visitIndex })) + '"></canvas><div class="thumbstate"></div></div>' +
        '<div class="obs-body"><header><h3 id="oc-' + ob.visitIndex + '">' + esc(t('time.visit', { n: ob.visitIndex })) + '</h3>' + U.statusBadge(ob.status) + '</header>' +
        '<p class="obs-date">' + esc(I.date(ob.startTime)) + '</p>' +
        '<div class="flags">' + U.flags(ob.quality) + '</div>' +
        '<ul class="pips" aria-label="' + esc(t('obs.bands')) + '">' + pips + '</ul>' +
        '<p class="muted small">' + esc(t('time.coverage', { v: I.pct(ob.coverage), b: ob.bands.filter(function (b) { return b.available; }).length, n: ob.bands.length })) + '</p>' +
        '<div class="obs-actions"><button type="button" class="btn sm solid" data-a="map"><span>' + esc(t('obs.showMap')) + '</span></button>' +
        '<button type="button" class="btn sm" data-a="details"><span>' + esc(t('obs.details')) + '</span></button>' +
        '<button type="button" class="btn sm" data-a="compare"' + (obsd && nObserved > 1 ? '' : ' disabled') + '><span>' + esc(t('obs.compareWith')) + '</span></button>' +
        '<span class="ab" data-min="intermediate"><button type="button" class="btn sm" data-a="setA"' + (obsd ? '' : ' disabled') + '><span>' + esc(t('obs.setBefore')) + '</span></button><button type="button" class="btn sm" data-a="setB"' + (obsd ? '' : ' disabled') + '><span>' + esc(t('obs.setAfter')) + '</span></button></span></div></div>';
      grid.appendChild(card);
      card.querySelector('[data-a=map]').onclick = function () { ctrl.selectVisit(ob.id); SX.shell.go('explorer'); };
      card.querySelector('[data-a=details]').onclick = function () { O.openDetails(ob); };
      card.querySelector('[data-a=compare]').onclick = function () { const o2 = ctrl.observed(); ctrl.setCompare({ a: o2[0].id === ob.id ? o2[o2.length - 1].id : o2[0].id, b: ob.id }); SX.shell.go('comparison'); };
      card.querySelector('[data-a=setA]').onclick = function () { ctrl.setCompare({ a: ob.id }); U.toast(t('obs.setBeforeDone', { n: ob.visitIndex })); };
      card.querySelector('[data-a=setB]').onclick = function () { ctrl.setCompare({ b: ob.id }); U.toast(t('obs.setAfterDone', { n: ob.visitIndex })); };
      loadCardImage(ob, card, my);
    });
  }

  function cardState(card, kind, text) {
    const el = card.querySelector('.thumbstate');
    if (!kind) { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = (kind === 'loading' ? '<span class="spinner sm"></span>' : SX.icon(kind === 'error' ? 'warn' : 'image')) + '<span>' + esc(text || '') + '</span>';
  }
  async function loadCardImage(ob, card, my) {
    if (ob.status !== 'observed') { cardState(card, 'empty', t('thumb.planned')); return; }
    cardState(card, 'loading', t('thumb.loading'));
    const r = await ctrl.fetchImage(ob.id, band, 160);
    if (my !== token) return;
    if (r.status !== 'ok') { cardState(card, r.status === 'error' ? 'error' : 'empty', r.error && r.error.code === 'not-available' ? t('thumb.bandMissing') : r.error ? U.errorCopy(r.error).title : t('thumb.none')); return; }
    images[ob.id] = r.data; cardState(card, null); paintCard(card, r.data);
  }
  function paintCard(card, d) { SX.render.paint(card.querySelector('canvas'), d.img, { encoding: d.encoding, palette: app.get('rgb') ? 'natural' : app.get('palette'), brightness: app.get('brightness'), contrast: app.get('contrast') }); }
  const repaintAll = SX.debounce(function () { $$('#obsGrid .obs-card').forEach(function (c) { const d = images[c.dataset.id]; if (d) paintCard(c, d); }); }, 60);

  /* ---------- details dialog ---------- */
  O.openDetails = async function (ob) {
    const dlg = $('#obsDialog'), body = $('#obsDlgBody'), title = $('#obsDlgT');
    title.textContent = t('time.visit', { n: ob.visitIndex }) + ' · ' + I.date(ob.startTime);
    body.innerHTML = ''; body.appendChild(U.stateEl('loading', { text: t('details.loading') }));
    if (dlg.hidden) U.openDialog(dlg, { focus: '#obsDlgClose' });
    const r = await SX.data.getObservationMetadata(ob.id);
    if (dlg.hidden) return;
    body.innerHTML = '';
    if (r.status !== 'ok') { body.appendChild(U.stateEl('error', { error: r.error, retry: function () { O.openDetails(ob); } })); return; }
    const m = r.data;
    let h = '<p class="sim-note">' + (m.isSimulated ? esc(t('details.simulated')) : '') + '</p><dl class="metadl big">' + m.fields.map(function (f) { return '<dt>' + esc(U.metaLabel(f)) + '</dt><dd class="' + (f.key === 'pointing' || f.key === 'observationId' ? 'ltr mono' : '') + '">' + esc(U.fmtMeta(f)) + '</dd>'; }).join('') + '</dl>';
    h += '<h3 class="h3">' + esc(t('details.quality')) + '</h3><div class="flags">' + (U.flags(m.quality) || '<span class="muted">—</span>') + '</div>';
    if (m.provenance) h += '<h3 class="h3">' + esc(t('details.provenance')) + '</h3><p class="muted small ltr">' + esc(m.provenance.source) + (m.provenance.processingVersion ? ' · ' + esc(m.provenance.processingVersion) : '') + '</p>';
    h += '<div class="row2 start"><button type="button" class="btn" id="exportBtn">' + SX.icon('download') + '<span>' + esc(t('details.export')) + '</span></button></div><div id="exportState" hidden></div>';
    body.innerHTML = h;
    $('#exportBtn').onclick = async function () {
      const st = $('#exportState'); st.hidden = false; st.innerHTML = ''; st.appendChild(U.stateEl('loading', { text: t('state.loading'), compact: true }));
      const res = await SX.data.exportObservation(ob.id, 'fits');
      st.innerHTML = ''; st.appendChild(U.stateEl(res.status === 'error' && res.error.code === 'unsupported' ? 'unsupported' : 'error', { title: res.error ? U.errorCopy(res.error).title : t('details.exported'), text: res.error ? res.error.message : '', error: res.error, retry: function () { $('#exportBtn').click(); } }));
    };
  };
})();
