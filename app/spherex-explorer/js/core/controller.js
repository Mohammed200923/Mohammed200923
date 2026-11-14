/* SX.ctrl: workspace logic shared by Explorer, Observations and Comparison.
   Views never talk to SX.data for target/observation flow; they call these functions and render from SX.app.
   Keeping this in one place means the "what happens when the user picks something" rules exist exactly once. */
(function () {
  const SX = window.SX, app = SX.app, clamp = SX.clamp;
  let obsToken = 0, gotoToken = 0;

  const ctrl = (SX.ctrl = {});

  /* ---------- bands ---------- */
  ctrl.bands = function () { return app.get('bands') || SX.DEFAULT_BANDS; };
  ctrl.bandFor = function (wl) {
    const b = ctrl.bands();
    for (let i = 0; i < b.length; i++) if (wl <= b[i].maxMicron) return b[i];
    return b[b.length - 1];
  };
  ctrl.bandCentre = function (b) { return +((b.minMicron + b.maxMicron) / 2).toFixed(2); };
  ctrl.wlRange = function () { const b = ctrl.bands(); return { min: b[0].minMicron, max: b[b.length - 1].maxMicron }; };
  ctrl.currentBandId = function () { return app.get('rgb') ? 'composite' : ctrl.bandFor(app.get('wl')).id; };

  /* ---------- bootstrap data ---------- */
  ctrl.loadBands = async function () {
    const r = await SX.data.getWavelengthBands();
    app.set({ bands: r.status === 'ok' ? r.data : SX.DEFAULT_BANDS });
  };
  ctrl.loadFeatured = async function () {
    app.set({ featured: { status: 'loading', list: [], error: null } });
    const r = await SX.data.getFeaturedTargets();
    app.set({ featured: { status: r.status, list: r.data || [], error: r.error } });
  };

  /* ---------- selection ---------- */
  function fovFor(t) { return clamp((t.angularSizeDeg || 0.1) * 10 + 8, 8, 60); }

  ctrl.selectTarget = function (t, opts) {
    opts = opts || {};
    const c = t.coordinates;
    app.set({ target: t, targetId: t.id, field: { ra: c.ra, dec: c.dec, custom: false }, nearest: null, visitId: null, playing: false });
    if (opts.fly !== false) ctrl.focus(c.ra, c.dec, Math.min(app.get('fov'), fovFor(t)));
    return ctrl.loadObservations();
  };

  ctrl.focus = function (ra, dec, fov) { app.set({ focusRequest: { ra: ra, dec: dec, fov: fov || app.get('fov'), nonce: Date.now() + Math.random() } }); };

  ctrl.clearSelection = function () {
    obsToken++;
    app.set({ target: null, targetId: null, field: null, nearest: null, visitId: null, playing: false, obs: { status: 'idle', list: [], error: null } });
  };

  /* Returns { ok:true } or { ok:false, error } so coordinate forms can show the problem inline. */
  ctrl.goToField = async function (ra, dec) {
    if (typeof ra !== 'number' || typeof dec !== 'number' || !isFinite(ra) || !isFinite(dec) || ra < 0 || ra > 360 || dec < -90 || dec > 90)
      return { ok: false, error: SX.DataError('invalid-coordinates', 'RA must be 0–360° and Dec −90…+90°.') };
    const my = ++gotoToken;
    const r = await SX.data.getTargetsNear(ra, dec, 90);
    if (my !== gotoToken) return { ok: true, stale: true };
    if (r.status === 'error' && r.error.code === 'invalid-coordinates') return { ok: false, error: r.error };
    const list = r.data || [];
    const hit = list.find(function (t) { return (t.separationDeg != null ? t.separationDeg : 99) < Math.max(0.5, (t.angularSizeDeg || 0) * 0.6); });
    if (hit) { ctrl.selectTarget(hit, { fly: true }); return { ok: true, target: hit, marker: { ra: ra, dec: dec } }; }
    app.set({
      target: null, targetId: null, field: { ra: ra, dec: dec, custom: true },
      nearest: list.length ? { target: list[0], sepDeg: list[0].separationDeg } : null, visitId: null, playing: false
    });
    ctrl.focus(ra, dec, Math.min(app.get('fov'), 12));
    ctrl.loadObservations();
    return { ok: true, custom: true, marker: { ra: ra, dec: dec }, lookup: r.status === 'error' ? r.error : null };
  };

  /* ---------- observations ---------- */
  ctrl.loadObservations = async function () {
    const f = app.get('field');
    if (!f) return;
    const my = ++obsToken;
    app.set({ obs: { status: 'loading', list: [], error: null } });
    const r = await SX.data.getObservations(f.ra, f.dec, clamp(app.get('fov'), 0.5, 60));
    if (my !== obsToken) return;
    if (r.status === 'ok') {
      const list = r.data.slice().sort(function (a, b) { return Date.parse(a.startTime) - Date.parse(b.startTime); });
      const observed = list.filter(function (o) { return o.status === 'observed'; });
      const pick = observed.length ? observed[observed.length - 1] : list[0];
      app.set({ obs: { status: 'ok', list: list, error: null }, visitId: pick.id });
      ctrl.ensureCompare();
    } else {
      app.set({ obs: { status: r.status, list: [], error: r.error }, visitId: null });
      app.set({ cmp: Object.assign({}, app.get('cmp'), { a: null, b: null }) });
    }
  };

  ctrl.observed = function () { return app.get('obs').list.filter(function (o) { return o.status === 'observed'; }); };
  ctrl.currentObs = function () { const id = app.get('visitId'); return app.get('obs').list.find(function (o) { return o.id === id; }) || null; };
  ctrl.selectVisit = function (id) { if (app.get('visitId') !== id) app.set({ visitId: id }); };
  ctrl.stepVisit = function (dir) {
    const l = app.get('obs').list; if (!l.length) return;
    const i = l.findIndex(function (o) { return o.id === app.get('visitId'); });
    ctrl.selectVisit(l[clamp((i < 0 ? 0 : i) + dir, 0, l.length - 1)].id);
  };

  /* Comparison defaults: earliest vs latest observed visit. */
  ctrl.ensureCompare = function () {
    const o = ctrl.observed(), c = app.get('cmp');
    const ids = o.map(function (x) { return x.id; });
    let a = ids.indexOf(c.a) >= 0 ? c.a : (o[0] && o[0].id) || null;
    let b = ids.indexOf(c.b) >= 0 ? c.b : (o.length > 1 ? o[o.length - 1].id : null);
    if (a && b && a === b && o.length > 1) b = o[o.length - 1].id === a ? o[0].id : o[o.length - 1].id;
    app.set({ cmp: Object.assign({}, c, { a: a, b: b }) });
  };
  ctrl.setCompare = function (patch) { app.set({ cmp: Object.assign({}, app.get('cmp'), patch) }); };

  /* ---------- images ---------- */
  /* Fetch + decode. Returns { status:'ok', data:{...ObservationImage, img}, error:null } or an error/empty result. */
  ctrl.fetchImage = async function (obsId, bandId, size) {
    const r = await SX.data.getObservationImage(obsId, bandId, { size: size || 192 });
    if (r.status !== 'ok') return r;
    try {
      const img = await SX.render.loadImage(r.data.url);
      return { status: 'ok', data: Object.assign({}, r.data, { img: img }), error: null, meta: r.meta };
    } catch (e) { return { status: 'error', data: null, error: e, meta: r.meta }; }
  };

  /* ---------- restore last session ---------- */
  ctrl.restore = async function () {
    const id = app.get('targetId');
    if (!id) return;
    const r = await SX.data.getTargetById(id);
    if (r.status === 'ok') ctrl.selectTarget(r.data, { fly: true });
    else app.set({ targetId: null });
  };

  /* ---------- presets (viewing modes) ---------- */
  ctrl.MODES = [
    { id: 'everyday', wl: 0.85, palette: 'natural', rgb: false },
    { id: 'warm', wl: 1.6, palette: 'emerald', rgb: false },
    { id: 'dust', wl: 3.3, palette: 'dust', rgb: false },
    { id: 'cold', wl: 4.6, palette: 'ice', rgb: false },
    { id: 'composite', wl: 2.4, palette: 'natural', rgb: true }
  ];
  ctrl.setMode = function (id) {
    const m = ctrl.MODES.find(function (x) { return x.id === id; });
    if (!m) return;
    app.set({ mode: m.id, wl: m.wl, palette: m.palette, rgb: m.rgb });
  };
  /* Manual wavelength / palette edits leave "mode" meaningful only while they still match a preset. */
  ctrl.syncModeFromControls = function () {
    const s = app.get(), hit = ctrl.MODES.find(function (m) { return m.rgb ? s.rgb : (!s.rgb && Math.abs(m.wl - s.wl) < 0.011 && m.palette === s.palette); });
    const next = hit ? hit.id : 'custom';
    if (next !== s.mode) app.set({ mode: next });
  };
})();
