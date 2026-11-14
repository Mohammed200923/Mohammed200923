/* MOCK PROVIDER: the one object a real integration replaces.
   Contract: every method returns a Promise of plain data (see contracts.js) or throws `SX.DataError`.
   The UI never calls this directly; it goes through SX.data (service.js). See FRONTEND_INTEGRATION.md.

   Demo-only extras (`controls`, `describe`) let the Settings screen simulate slow/failing networks so that
   loading, error and empty states can be reviewed. A real provider can omit them.                        */
(function () {
  const SX = window.SX, M = SX.mock, S = M.sim, clamp = SX.clamp, DataError = SX.DataError;

  /* ---------- demo controls (memory only, reset on reload) ---------- */
  const controls = (M.controls = { latency: 'normal', failure: 'none', noImages: false, noObservations: false });
  const LATENCY = { fast: 40, normal: 380, slow: 2600 };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function gate(opts) {
    await sleep((LATENCY[controls.latency] || 380) * (0.8 + Math.random() * 0.4));
    if (controls.failure === 'network') throw DataError('network', 'Simulated network failure (demo control). Check your connection and retry.');
    if (controls.failure === 'random' && Math.random() < 0.3) throw DataError('network', 'Simulated intermittent failure (demo control).');
    if (controls.failure === 'timeout') { await sleep(1200); throw DataError('timeout', 'Simulated timeout (demo control). The server took too long to answer.'); }
    return opts;
  }

  /* ---------- helpers ---------- */
  function normalise(s) {
    return String(s || '').toLowerCase().normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')           // Arabic diacritics + tatweel
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')      // alef variants -> alef
      .replace(/\u0649/g, '\u064A').replace(/\u0629/g, '\u0647')  // alef maqsura -> ya, ta marbuta -> ha
      .replace(/[^a-z0-9\u0600-\u06FF\s*+.\u2212-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function checkCoords(ra, dec) {
    if (typeof ra !== 'number' || typeof dec !== 'number' || !isFinite(ra) || !isFinite(dec) || ra < 0 || ra > 360 || dec < -90 || dec > 90)
      throw DataError('invalid-coordinates', 'RA must be 0–360° and Dec −90…+90°.', { retryable: false });
  }
  const targetCache = {};
  function targetOf(id) { return targetCache[id] || (targetCache[id] = M.toTarget(M.RECORDS[id])); }

  /* A coordinate that lies on a catalog target resolves to that target; anything else is a "field". */
  function resolveKey(ra, dec) {
    let best = null, bd = 1e9;
    M.ids.forEach(function (id) {
      const r = M.RECORDS[id], d = SX.angSep(ra, dec, r.ra, r.dec);
      if (d < bd) { bd = d; best = r; }
    });
    if (best && bd < Math.max(0.5, best.size * 0.6)) return { key: best.id, rec: best };
    return { key: fieldKey(ra, dec), rec: fieldRec(ra, dec) };
  }
  function fieldKey(ra, dec) { return 'f' + ra.toFixed(1) + '_' + dec.toFixed(1); }
  function fieldRec(ra, dec) {
    const key = fieldKey(ra, dec), r = S.rng(S.hash(key));
    return { id: key, en: 'Sky field', cls: 'field', ra: +ra.toFixed(1), dec: +dec.toFixed(1), tK: 4000 + Math.round(r() * 3000), size: 0.2, mag: 9, sim: { mover: { px: 4 } }, isField: true };
  }
  function recFromKey(key) {
    if (M.RECORDS[key]) return M.RECORDS[key];
    const m = /^f(-?[\d.]+)_(-?[\d.]+)$/.exec(key);
    if (m) return fieldRec(parseFloat(m[1]), parseFloat(m[2]));
    return null;
  }
  function parseObsId(id) {
    const m = /^demo:(.+):v(\d+)$/.exec(String(id || ''));
    if (!m) throw DataError('not-found', 'Unknown observation id: ' + id, { retryable: false });
    const rec = recFromKey(m[1]);
    if (!rec) throw DataError('not-found', 'Unknown observation id: ' + id, { retryable: false });
    return { key: m[1], rec: rec, visit: parseInt(m[2], 10) };
  }

  /* How many visits cover a given key (0 = missing coverage). */
  function visitCount(key, rec) {
    if (controls.noObservations) return 0;
    if (!rec.isField) return rec.vis;
    const m = /^f(-?[\d.]+)_(-?[\d.]+)$/.exec(key), cell = Math.floor(parseFloat(m[1]) / 20) + ':' + Math.floor((parseFloat(m[2]) + 90) / 20);
    const h = S.hash('cell:' + cell);
    return h % 5 === 0 ? 0 : 2 + (h % 5);
  }

  function buildObservations(key, rec, center, fov) {
    const n = visitCount(key, rec), out = [], today = Date.now();
    const base = Date.UTC(2025, 4, 15, 12) + (S.hash(key) % 40) * 86400000;
    for (let i = 0; i < n; i++) {
      const t = base + i * 182 * 86400000, status = t <= today ? 'observed' : 'planned', h = S.hash(key + ':q' + i) % 100;
      const quality = [];
      if (status === 'planned') quality.push({ code: 'pending', severity: 'info' });
      else {
        if (rec.partial) quality.push({ code: 'partial-coverage', severity: 'warning' });
        if (h < 16) quality.push({ code: 'low-snr', severity: 'warning' });
        else if (h < 30) quality.push({ code: 'cosmic-ray', severity: 'info' });
        if (!quality.length) quality.push({ code: 'ok', severity: 'info' });
      }
      const skipBand = status === 'observed' && (S.hash(key + ':b' + i) % 6 === 0) ? 1 + (S.hash(key + ':bb' + i) % 6) : 0;
      out.push({
        id: 'demo:' + key + ':v' + (i + 1),
        targetId: rec.isField ? null : rec.id,
        center: { ra: center.ra, dec: center.dec },
        fieldOfViewDeg: fov,
        startTime: new Date(t).toISOString(),
        endTime: new Date(t + 3 * 86400000).toISOString(),
        status: status,
        visitIndex: i + 1,
        bands: M.BANDS.map(function (b) { return { bandId: b.id, available: status === 'observed' && b.id !== skipBand, quality: b.id === skipBand ? [{ code: 'scattered-light', severity: 'warning' }] : [] }; }),
        quality: quality,
        coverage: status === 'planned' ? 0 : clamp(rec.partial ? 0.62 : 1 - Math.max(0, fov - 12) / 200, 0.4, 1),
        source: 'demo',
        isSimulated: true
      });
    }
    return out;
  }

  /* ---------- provider API ---------- */
  const provider = {
    describe: function () { return { name: 'Mock provider', simulated: true, version: '1.0', note: 'Generated in the browser. No NASA data.' }; },
    controls: controls,

    async getWavelengthBands() { return M.BANDS.map(function (b) { return Object.assign({}, b); }); },

    async getFeaturedTargets() {
      await gate();
      return M.ids.map(targetOf);
    },

    async getTargetById(id) {
      await gate();
      if (!M.RECORDS[id]) throw DataError('not-found', 'No target with id “' + id + '”.', { retryable: false });
      return targetOf(id);
    },

    async searchTargets(query) {
      await gate();
      const raw = String(query || '').trim();
      if (/^(obsid:|https?:|spherex:)/i.test(raw)) throw DataError('unsupported', 'Searching by observation id or URL is not available in the demo.', { retryable: false });
      const q = normalise(raw);
      if (!q) return M.ids.slice(0, 8).map(targetOf);
      const scored = [];
      M.ids.forEach(function (id) {
        const r = M.RECORDS[id];
        const names = [r.en, r.ar].concat(r.aka, [r.te, r.ta, r.con]).map(normalise);
        let s = 0;
        names.forEach(function (n, i) {
          if (n === q) s = Math.max(s, 100);
          else if (n.indexOf(q) === 0) s = Math.max(s, 80 - i);
          else if (n.split(' ').some(function (w) { return w.indexOf(q) === 0; })) s = Math.max(s, 65 - i);
          else if (q.length > 2 && n.indexOf(q) >= 0) s = Math.max(s, 40 - i);
        });
        if (s) scored.push([s, id]);
      });
      scored.sort(function (a, b) { return b[0] - a[0]; });
      return scored.slice(0, 8).map(function (x) { return targetOf(x[1]); });
    },

    async getTargetsNear(ra, dec, radiusDeg) {
      checkCoords(ra, dec);
      await gate();
      return M.ids.map(function (id) { return [SX.angSep(ra, dec, M.RECORDS[id].ra, M.RECORDS[id].dec), id]; })
        .filter(function (x) { return x[0] <= radiusDeg; })
        .sort(function (a, b) { return a[0] - b[0]; })
        .map(function (x) { return Object.assign({}, targetOf(x[1]), { separationDeg: x[0] }); });
    },

    async getObservations(ra, dec, fieldOfView) {
      checkCoords(ra, dec);
      await gate();
      const fov = clamp(Number(fieldOfView) || 10, 0.1, 180), r = resolveKey(ra, dec);
      return buildObservations(r.key, r.rec, { ra: r.rec.isField ? ra : r.rec.ra, dec: r.rec.isField ? dec : r.rec.dec }, fov);
    },

    async getObservationImage(observationId, band, opts) {
      await gate();
      const p = parseObsId(observationId);
      if (band !== 'composite' && !(band >= 1 && band <= M.BANDS.length)) throw DataError('not-found', 'Unknown band: ' + band, { retryable: false });
      const obs = buildObservations(p.key, p.rec, { ra: p.rec.ra, dec: p.rec.dec }, 10)[p.visit - 1];
      if (!obs) throw DataError('not-found', 'No such observation.', { retryable: false });
      if (obs.status !== 'observed') throw DataError('not-available', 'This observation is planned. No image exists yet.', { retryable: false });
      if (controls.noImages) throw DataError('not-available', 'Images are switched off by the demo controls.', { retryable: false });
      if (band !== 'composite' && !obs.bands.find(function (b) { return b.bandId === band; }).available)
        throw DataError('not-available', 'Band ' + band + ' is missing for this observation.', { retryable: false });
      const size = clamp((opts && opts.size) || 192, 64, 512), im = S.imageURL(p.rec, p.visit - 1, band, size);
      const b = band === 'composite' ? null : M.BANDS.find(function (x) { return x.id === band; });
      return {
        observationId: observationId, bandId: band, url: im.url, encoding: im.encoding, width: size, height: size,
        wavelengthMinMicron: b ? b.minMicron : 1.11, wavelengthMaxMicron: b ? b.maxMicron : 4.42,
        quality: obs.quality, isSimulated: true
      };
    },

    async getObservationMetadata(observationId) {
      await gate();
      const p = parseObsId(observationId), obs = buildObservations(p.key, p.rec, { ra: p.rec.ra, dec: p.rec.dec }, 10)[p.visit - 1];
      if (!obs) throw DataError('not-found', 'No such observation.', { retryable: false });
      const h = S.hash(observationId);
      return {
        observationId: observationId,
        fields: [
          { key: 'observationId', value: observationId },
          { key: 'visit', value: obs.visitIndex },
          { key: 'startTime', value: obs.startTime },
          { key: 'status', value: obs.status },
          { key: 'exposure', value: 100 + (h % 25), unit: 's' },
          { key: 'pointing', value: SX.fmtRA(obs.center.ra) + '  ' + SX.fmtDec(obs.center.dec) },
          { key: 'bandsAvailable', value: obs.bands.filter(function (b) { return b.available; }).length + ' / ' + obs.bands.length },
          { key: 'coverage', value: Math.round(obs.coverage * 100), unit: '%' },
          { key: 'processingLevel', value: 'Demo (simulated)' },
          { key: 'instrument', value: 'Simulated instrument' }
        ],
        quality: obs.quality,
        provenance: { source: 'mock-provider', retrievedAt: new Date().toISOString(), processingVersion: 'demo-1' },
        isSimulated: true
      };
    },

    async getComparisonResult(observationA, observationB, opts) {
      await gate();
      const a = parseObsId(observationA), b = parseObsId(observationB);
      if (a.key !== b.key) throw DataError('unsupported', 'Comparison needs two observations of the same field.', { retryable: false });
      const obs = buildObservations(a.key, a.rec, { ra: a.rec.ra, dec: a.rec.dec }, 10);
      [a, b].forEach(function (p) { if (!obs[p.visit - 1] || obs[p.visit - 1].status !== 'observed') throw DataError('not-available', 'Both observations must already be observed.', { retryable: false }); });
      if (controls.noImages) throw DataError('not-available', 'Images are switched off by the demo controls.', { retryable: false });
      const band = (opts && opts.bandId) || 4, size = 192, d = S.diff(a.rec, a.visit - 1, b.visit - 1, band, size);
      const sig = d.changedFraction > 0.03 ? 'high' : d.changedFraction > 0.012 ? 'moderate' : d.changedFraction > 0.003 ? 'low' : 'none';
      const cands = S.candidates(a.rec, a.visit - 1, b.visit - 1, size);
      return {
        observationA: observationA, observationB: observationB, bandId: band, differenceImageUrl: d.url, width: size, height: size,
        summary: { changedPixelFraction: d.changedFraction, peakChange: +d.peak.toFixed(3), significance: sig },
        candidates: cands,
        notes: a.rec.sim && a.rec.sim.mover
          ? { en: 'This object moves across the sky. The shift between visits is exaggerated in the demo.', ar: 'يتحرك هذا الجرم عبر السماء. الانزياح بين الزيارات مبالغ فيه في العرض التجريبي.' }
          : a.rec.sim && a.rec.sim.variable ? { en: 'This object changes brightness. Compare the central source.', ar: 'يتغير لمعان هذا الجرم. قارن المصدر المركزي.' } : { en: 'This object looks steady. Differences are mostly noise, a useful baseline.', ar: 'يبدو هذا الجرم ثابتًا. معظم الفروق ضجيج، وهي خط أساس مفيد.' },
        quality: [], isSimulated: true
      };
    },

    async exportObservation(/* observationId, format */) {
      await gate();
      throw DataError('unsupported', 'Downloading data products (FITS or images) is not part of the demo.', { retryable: false });
    }
  };

  M.provider = provider;
})();
