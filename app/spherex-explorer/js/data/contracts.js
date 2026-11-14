/* FRONTEND DATA CONTRACTS
   ------------------------------------------------------------------------------
   These are the shapes the UI expects from ANY data provider (the bundled mock, or the real
   SPHEREx integration written by the data team). They are frontend contracts only: nothing
   here fetches, processes or computes astronomical data.

   Full documentation with JSON examples: ../../FRONTEND_INTEGRATION.md

   @typedef {string | {en: string, ar?: string}} LocalizedText
   @typedef {{ra: number, dec: number}} Coordinates            degrees, ICRS. ra 0..360, dec -90..90
   @typedef {{code: string, severity: 'info'|'warning'|'error', detail?: string}} QualityFlag
   @typedef {{key: string, label?: LocalizedText, value: string|number|null, unit?: string}} MetadataField

   @typedef {Object} WavelengthBand
     @property {number} id               1..N
     @property {number} minMicron
     @property {number} maxMicron
     @property {number} channels
     @property {LocalizedText} [hint]

   @typedef {Object} Target
     @property {string} id
     @property {LocalizedText} name
     @property {string[]} aliases
     @property {string} classification   'star'|'nebula'|'galaxy'|'cluster'|'region'|'brown-dwarf'|'other'
     @property {LocalizedText} [typeLabel]       more specific label, e.g. "Red supergiant"
     @property {Coordinates} coordinates
     @property {string} [constellation]          IAU English name
     @property {LocalizedText} description
     @property {LocalizedText} [whyInfrared]
     @property {number|null} [distanceLightYears]
     @property {number|null} [temperatureKelvin]
     @property {number|null} [angularSizeDeg]
     @property {number|null} [apparentMagnitude]
     @property {MetadataField[]} metadata
     @property {'available'|'partial'|'none'|'unknown'} availability
     @property {number} [observationCount]
     @property {boolean} isSimulated

   @typedef {Object} Observation
     @property {string} id
     @property {string|null} targetId
     @property {Coordinates} center
     @property {number} fieldOfViewDeg
     @property {string} startTime               ISO-8601 UTC
     @property {string} [endTime]
     @property {'observed'|'planned'|'processing'|'failed'} status
     @property {number} visitIndex              1-based
     @property {{bandId:number, available:boolean, quality:QualityFlag[]}[]} bands
     @property {QualityFlag[]} quality
     @property {number} coverage                0..1 of the requested field
     @property {string} source                  e.g. 'demo', 'spherex-irsa'
     @property {boolean} isSimulated

   @typedef {Object} ObservationImage
     @property {string} observationId
     @property {number|'composite'} bandId
     @property {string} url                     https:, data: or blob: URL of a PNG/JPEG
     @property {'intensity-gray'|'rgb'} encoding   gray: UI applies palette/brightness/contrast
     @property {number} width
     @property {number} height
     @property {number} [wavelengthMinMicron]
     @property {number} [wavelengthMaxMicron]
     @property {QualityFlag[]} quality
     @property {boolean} isSimulated

   @typedef {Object} ObservationMetadata
     @property {string} observationId
     @property {MetadataField[]} fields
     @property {QualityFlag[]} quality
     @property {{source:string, retrievedAt?:string, processingVersion?:string}} provenance
     @property {boolean} isSimulated

   @typedef {Object} ComparisonResult
     @property {string} observationA
     @property {string} observationB
     @property {number|'composite'} bandId
     @property {string} differenceImageUrl
     @property {number} width
     @property {number} height
     @property {{changedPixelFraction:number, peakChange:number, significance:'none'|'low'|'moderate'|'high'}} summary
     @property {{id:string, label?:LocalizedText, pixel:{x:number,y:number}, changeType:'moved'|'brightened'|'dimmed', confidence:number}[]} candidates
     @property {LocalizedText|null} [notes]
     @property {QualityFlag[]} quality
     @property {boolean} isSimulated

   Provider functions throw `SX.DataError` (or resolve with data). The service layer (service.js)
   turns that into an `ApiResult` envelope for the UI:
     { status: 'ok'|'empty'|'error', data, error: DataError|null, meta: {fn, ms, source} }       */
(function () {
  const SX = window.SX;

  /* Error codes the UI knows how to present. Anything else is shown as 'unknown'. */
  SX.ERROR_CODES = ['network', 'timeout', 'invalid-coordinates', 'not-found', 'no-observations', 'not-available', 'unsupported', 'bad-response', 'unknown'];

  function DataError(code, message, extra) {
    const e = new Error(message || code);
    e.name = 'DataError';
    e.code = SX.ERROR_CODES.indexOf(code) >= 0 ? code : 'unknown';
    e.retryable = extra && extra.retryable != null ? extra.retryable : (e.code === 'network' || e.code === 'timeout' || e.code === 'unknown');
    e.details = extra && extra.details;
    return e;
  }
  SX.DataError = DataError;

  SX.TARGET_CLASSES = ['star', 'nebula', 'galaxy', 'cluster', 'region', 'brown-dwarf', 'other'];

  /* Offline fallback so the UI stays usable if getWavelengthBands() fails. */
  SX.DEFAULT_BANDS = [
    { id: 1, minMicron: 0.75, maxMicron: 1.11, channels: 17, hint: 'Near infrared (shortest)' },
    { id: 2, minMicron: 1.11, maxMicron: 1.64, channels: 17, hint: 'Near infrared' },
    { id: 3, minMicron: 1.64, maxMicron: 2.42, channels: 17, hint: 'Near infrared (longest)' },
    { id: 4, minMicron: 2.42, maxMicron: 3.82, channels: 17, hint: 'Ices and dust grains' },
    { id: 5, minMicron: 3.82, maxMicron: 4.42, channels: 17, hint: 'Cool objects' },
    { id: 6, minMicron: 4.42, maxMicron: 5.00, channels: 17, hint: 'Coolest glow' }
  ];

  /* ---------- validators: throw DataError('bad-response') naming the first violated rule ---------- */
  function bad(path, why) { return DataError('bad-response', 'Provider returned an unexpected shape: ' + path + ' ' + why, { retryable: false }); }
  const isNum = function (x) { return typeof x === 'number' && isFinite(x); };
  const isStr = function (x) { return typeof x === 'string' && x.length > 0; };
  const isText = function (x) { return isStr(x) || (x && typeof x === 'object' && isStr(x.en)); };

  function coords(c, path) {
    if (!c || typeof c !== 'object') throw bad(path, 'must be an object {ra, dec}');
    if (!isNum(c.ra) || c.ra < 0 || c.ra > 360) throw bad(path + '.ra', 'must be a number in 0..360');
    if (!isNum(c.dec) || c.dec < -90 || c.dec > 90) throw bad(path + '.dec', 'must be a number in -90..90');
  }

  SX.contracts = {
    assertBands: function (a) {
      if (!Array.isArray(a) || !a.length) throw bad('bands', 'must be a non-empty array');
      a.forEach(function (b, i) {
        if (!isNum(b.id)) throw bad('bands[' + i + '].id', 'must be a number');
        if (!isNum(b.minMicron) || !isNum(b.maxMicron) || b.minMicron >= b.maxMicron) throw bad('bands[' + i + ']', 'needs minMicron < maxMicron (numbers)');
      });
    },
    assertTarget: function (t, i) {
      const p = 'target' + (i != null ? '[' + i + ']' : '');
      if (!t || typeof t !== 'object') throw bad(p, 'must be an object');
      if (!isStr(t.id)) throw bad(p + '.id', 'must be a non-empty string');
      if (!isText(t.name)) throw bad(p + '.name', 'must be a string or {en,...}');
      coords(t.coordinates, p + '.coordinates');
      if (!Array.isArray(t.metadata)) throw bad(p + '.metadata', 'must be an array (use [] if none)');
      if (!isText(t.description)) throw bad(p + '.description', 'must be a string or {en,...}');
    },
    assertTargets: function (a) {
      if (!Array.isArray(a)) throw bad('targets', 'must be an array');
      a.forEach(function (t, i) { SX.contracts.assertTarget(t, i); });
    },
    assertObservations: function (a) {
      if (!Array.isArray(a)) throw bad('observations', 'must be an array');
      a.forEach(function (o, i) {
        const p = 'observations[' + i + ']';
        if (!isStr(o.id)) throw bad(p + '.id', 'must be a non-empty string');
        if (!isStr(o.startTime) || isNaN(Date.parse(o.startTime))) throw bad(p + '.startTime', 'must be an ISO-8601 string');
        if (['observed', 'planned', 'processing', 'failed'].indexOf(o.status) < 0) throw bad(p + '.status', "must be 'observed'|'planned'|'processing'|'failed'");
        if (!Array.isArray(o.bands)) throw bad(p + '.bands', 'must be an array');
        if (!Array.isArray(o.quality)) throw bad(p + '.quality', 'must be an array (use [] if none)');
      });
    },
    assertImage: function (im) {
      if (!im || typeof im !== 'object') throw bad('image', 'must be an object');
      if (!isStr(im.url)) throw bad('image.url', 'must be a non-empty URL string');
      if (['intensity-gray', 'rgb'].indexOf(im.encoding) < 0) throw bad('image.encoding', "must be 'intensity-gray' or 'rgb'");
      if (!isNum(im.width) || !isNum(im.height)) throw bad('image.width/height', 'must be numbers');
    },
    assertMetadata: function (m) {
      if (!m || !Array.isArray(m.fields)) throw bad('metadata.fields', 'must be an array');
    },
    assertComparison: function (c) {
      if (!c || typeof c !== 'object') throw bad('comparison', 'must be an object');
      if (!isStr(c.differenceImageUrl)) throw bad('comparison.differenceImageUrl', 'must be a URL string');
      if (!c.summary || !isNum(c.summary.changedPixelFraction)) throw bad('comparison.summary.changedPixelFraction', 'must be a number 0..1');
      if (!Array.isArray(c.candidates)) throw bad('comparison.candidates', 'must be an array (use [] if none)');
    }
  };

  /* Quality-flag vocabulary the UI has translations for (extra codes are shown verbatim). */
  SX.QUALITY_CODES = ['ok', 'low-snr', 'cosmic-ray', 'saturated', 'scattered-light', 'partial-coverage', 'pending'];
})();
