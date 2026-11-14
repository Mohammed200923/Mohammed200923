/* SX.data: the ONLY object the UI uses to obtain astronomy data.
   - Wraps the active provider (mock by default; swap with SX.data.use(realProvider)).
   - Converts promises / thrown DataErrors into an ApiResult envelope:
       { status: 'ok' | 'empty' | 'error', data, error, meta: { fn, ms } }
   - Validates provider output against contracts.js, so a wrong shape shows up as a clear
     `bad-response` error (visible in the Data inspector) instead of a broken screen.
   - Caches immutable products (images, metadata, comparisons) and logs every call.             */
(function () {
  const SX = window.SX, C = SX.contracts;
  const TIMEOUT_MS = 15000;
  let provider = null;
  const cache = new Map(), log = [], logSubs = [];
  let seq = 0;

  function notify() { logSubs.slice().forEach(function (f) { try { f(log); } catch (e) { /* ignore */ } }); }
  function short(v) { return typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : v; }
  function normalise(e) {
    if (e && e.name === 'DataError') return e;
    if (e instanceof TypeError) return SX.DataError('network', e.message);
    return SX.DataError('unknown', (e && e.message) || String(e));
  }
  function summarise(d) {
    if (Array.isArray(d)) return d.length + ' item' + (d.length === 1 ? '' : 's');
    if (d && typeof d === 'object') return Object.keys(d).slice(0, 5).join(', ');
    return String(d);
  }

  async function call(fn, args, opt) {
    opt = opt || {};
    if (opt.cacheKey && cache.has(opt.cacheKey)) {
      const hit = cache.get(opt.cacheKey);
      return Object.assign({}, hit, { meta: Object.assign({}, hit.meta, { cached: true }) });
    }
    const entry = { id: ++seq, fn: fn, args: (args || []).map(short), at: Date.now(), status: 'pending', ms: null, code: null, message: '', summary: '' };
    log.unshift(entry); if (log.length > 40) log.pop(); notify();
    const t0 = performance.now();
    let result, timer;
    try {
      if (!provider || typeof provider[fn] !== 'function') throw SX.DataError('unsupported', 'The active data provider does not implement ' + fn + '().', { retryable: false });
      // A provider may ask for longer limits per function (real archives are slower than the mock).
      const limit = (provider.timeouts && provider.timeouts[fn]) || TIMEOUT_MS;
      const timeout = new Promise(function (_, rej) { timer = setTimeout(function () { rej(SX.DataError('timeout', fn + '() took longer than ' + limit / 1000 + ' s.')); }, limit); });
      const data = await Promise.race([Promise.resolve(provider[fn].apply(provider, args || [])), timeout]);
      if (opt.validate) opt.validate(data);
      result = { status: Array.isArray(data) && !data.length ? 'empty' : 'ok', data: data, error: null };
    } catch (e) {
      result = { status: 'error', data: null, error: normalise(e) };
    } finally { clearTimeout(timer); }
    result.meta = { fn: fn, ms: Math.round(performance.now() - t0) };
    entry.status = result.status; entry.ms = result.meta.ms; entry.summary = result.status === 'error' ? '' : summarise(result.data);
    if (result.error) { entry.code = result.error.code; entry.message = result.error.message; }
    notify();
    if (opt.cacheKey && result.status === 'ok') cache.set(opt.cacheKey, result);
    return result;
  }

  SX.data = {
    use: function (p) { provider = p; cache.clear(); notify(); },
    provider: function () { return provider; },
    describe: function () { return provider && provider.describe ? provider.describe() : { name: 'Custom provider', simulated: false }; },
    demoControls: function () { return provider && provider.controls ? provider.controls : null; },
    clearCache: function () { cache.clear(); },
    getLog: function () { return log; },
    onLog: function (fn) { logSubs.push(fn); return function () { const i = logSubs.indexOf(fn); if (i >= 0) logSubs.splice(i, 1); }; },

    /* ---- the provider contract, as the UI sees it ---- */
    getWavelengthBands: function () { return call('getWavelengthBands', [], { validate: C.assertBands }); },
    getFeaturedTargets: function () { return call('getFeaturedTargets', [], { validate: C.assertTargets }); },
    getTargetById: function (id) { return call('getTargetById', [id], { validate: C.assertTarget }); },
    searchTargets: function (query) { return call('searchTargets', [query], { validate: C.assertTargets }); },
    getTargetsNear: function (ra, dec, radiusDeg) { return call('getTargetsNear', [ra, dec, radiusDeg], { validate: C.assertTargets }); },
    getObservations: function (ra, dec, fieldOfView) { return call('getObservations', [ra, dec, fieldOfView], { validate: C.assertObservations }); },
    getObservationImage: function (observationId, band, opts) {
      return call('getObservationImage', [observationId, band, opts], { validate: C.assertImage, cacheKey: 'img:' + observationId + ':' + band + ':' + ((opts && opts.size) || '') });
    },
    getObservationMetadata: function (observationId) { return call('getObservationMetadata', [observationId], { validate: C.assertMetadata, cacheKey: 'meta:' + observationId }); },
    getComparisonResult: function (a, b, opts) {
      return call('getComparisonResult', [a, b, opts], { validate: C.assertComparison, cacheKey: 'cmp:' + a + ':' + b + ':' + ((opts && opts.bandId) || '') });
    },
    exportObservation: function (observationId, format) { return call('exportObservation', [observationId, format]); }
  };
})();
