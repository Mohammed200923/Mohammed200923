/* SKYSHIFT PROVIDER: real NASA data for the SPHEREx Explorer / Immersive front ends.
   Implements the provider contract in ../contracts.js (FRONTEND_INTEGRATION.md, sections 3–4)
   with the SkyShift engine (../../../../js/field.js): SPHEREx images from IRSA, aligned and
   stacked per survey visit; AllWISE 2010 + NEOWISE 2014–2024 frames; moving objects with
   16-year motions checked against Gaia DR3 (NASA MAST) and CatWISE2020.

   Registers itself as window.SX.providers.skyshift. Needs the SkyShift server (server.py) for
   the archive proxy; without it, provider calls fail with a 'network' DataError.            */
import { loadField, searchField } from '../../../../js/field.js';
import { TARGETS } from '../../../../js/targets.js';
import { resolveName } from '../../../../js/catalogs.js';
import { detectProxy } from '../../../../js/net.js';
import { propagate, mjdToDate, mjdToYear, formatRa, formatDec, separationArcsec } from '../../../../js/wcs.js';
import { DETECTORS } from '../../../../js/spherex.js';
import { weightedCoadd, percentiles } from '../../../../js/stack.js';
import { moverAt } from '../../../../js/movers.js';

const SX = window.SX;
const DataError = (code, msg, extra) => SX.DataError(code, msg, extra);
const ready = detectProxy();

/* ---------- targets ---------- */

const EXTRA_TEXT = {
  epsindib: {
    name: { en: 'Epsilon Indi B', ar: 'إبسيلون الهندي ب' }, aliases: ['eps Ind B', 'Epsilon Indi Ba', 'Epsilon Indi B'],
    classification: 'brown-dwarf', typeLabel: { en: 'Pair of brown dwarfs orbiting a star', ar: 'زوج من الأقزام البنية يدور حول نجم' },
    constellation: 'Indus', distanceLightYears: 12,
    description: { en: 'Two brown dwarfs, too small to burn like stars, circling the nearby star Epsilon Indi.', ar: 'قزمان بنيان، أصغر من أن يشتعلا كالنجوم، يدوران حول النجم القريب إبسيلون الهندي.' },
    whyInfrared: { en: 'Brown dwarfs are cool, so they glow mostly in infrared light.', ar: 'الأقزام البنية باردة، فتتوهج غالبًا بالأشعة تحت الحمراء.' },
  },
  rwaur: {
    name: { en: 'RW Aurigae', ar: 'آر دبليو الممسك' }, aliases: ['RW Aur', 'RW Aurigae'], classification: 'star',
    typeLabel: { en: 'Young variable star', ar: 'نجم فتيّ متغيّر' }, constellation: 'Auriga',
    description: { en: 'A young star whose brightness is known to vary.', ar: 'نجم فتيّ يتغير لمعانه.' },
    whyInfrared: { en: 'Young stars are often wrapped in dust, which infrared can see through.', ar: 'تحيط الغبار بالنجوم الفتية غالبًا، والأشعة تحت الحمراء تخترقه.' },
  },
  rdra: {
    name: { en: 'R Draconis', ar: 'آر التنين' }, aliases: ['R Dra', 'R Draconis'], classification: 'star',
    typeLabel: { en: 'Long-period variable star', ar: 'نجم متغيّر طويل الدورة' }, constellation: 'Draco',
    description: { en: 'A giant star whose brightness changes slowly over many months.', ar: 'نجم عملاق يتغير لمعانه ببطء على مدى أشهر.' },
    whyInfrared: { en: 'Cool giants shine brightly in infrared, so their slow changes are easier to follow.', ar: 'تسطع العمالقة الباردة في الأشعة تحت الحمراء، فيسهل تتبّع تغيراتها البطيئة.' },
  },
};

const SETTINGS = {}; // target id → { sizeArcmin, wmin, wmax, max, motion }

function buildTargets() {
  const out = new Map();
  // The front end's catalogue (bilingual text, real coordinates), now backed by real data.
  if (SX.mock && SX.mock.RECORDS) {
    for (const id of SX.mock.ids) {
      const t = SX.mock.toTarget(SX.mock.RECORDS[id]);
      delete t.demo;
      out.set(id, { ...t, availability: 'unknown', observationCount: undefined, isSimulated: false });
    }
  }
  // The challenge targets: precise positions and motions, moved to where SPHEREx sees them.
  for (const t of TARGETS) {
    const [ra, dec] = t.pmra || t.pmdec ? propagate(t.ra, t.dec, t.pmra, t.pmdec, t.epoch, 2026.0) : [t.ra, t.dec];
    const base = out.get(t.key) || {
      id: t.key, metadata: [], availability: 'unknown', isSimulated: false,
      ...(EXTRA_TEXT[t.key] || { name: t.name, aliases: [t.name], classification: 'star', description: t.kind }),
    };
    const metadata = base.metadata.filter((m) => m.key !== 'properMotion');
    if (t.pmra || t.pmdec) metadata.push({ key: 'properMotion', label: { en: 'Catalogued motion', ar: 'الحركة المسجّلة' }, value: (Math.hypot(t.pmra, t.pmdec) / 1000).toFixed(2), unit: '″/yr' });
    out.set(t.key, { ...base, coordinates: { ra, dec }, metadata, isSimulated: false });
    SETTINGS[t.key] = { sizeArcmin: t.sizeArcmin, wmin: t.wmin ?? 0.75, wmax: t.wmax ?? 5, max: t.max ?? 36, motion: t };
  }
  return out;
}
const TARGET_MAP = buildTargets();
const featured = () => [...TARGET_MAP.values()];

/* ---------- fields: one per position, searched quickly, loaded in the background ---------- */

const FIELDS = new Map();
const keyOf = (ra, dec) => `${ra.toFixed(4)},${dec.toFixed(4)}`;

function settingsFor(ra, dec) {
  for (const t of TARGET_MAP.values()) {
    if (separationArcsec(ra, dec, t.coordinates.ra, t.coordinates.dec) < 180 && SETTINGS[t.id]) return { id: t.id, ...SETTINGS[t.id] };
  }
  return { id: null, sizeArcmin: 6, wmin: 0.75, wmax: 5, max: 36, motion: null };
}

function asDataError(e) {
  if (e && e.name === 'DataError') return e;
  return DataError('network', `NASA archive: ${(e && e.message) || e}`);
}

function field(ra, dec) {
  const key = keyOf(ra, dec);
  if (!FIELDS.has(key)) {
    const s = settingsFor(ra, dec);
    const f = { key, ra, dec, s };
    f.searchP = ready.then(() => searchField({ ra, dec, wmin: s.wmin, wmax: s.wmax, max: s.max }));
    let spxDone;
    f.spxP = new Promise((res) => { spxDone = res; });
    f.loadP = f.searchP.then((search) => loadField({ ra, dec, sizeArcmin: s.sizeArcmin, wmin: s.wmin, wmax: s.wmax, max: s.max, search, target: s.motion, onSpherex: spxDone }));
    f.loadP.then((full) => { f.full = full; spxDone(full); }, () => FIELDS.delete(key)); // a failure lets a later request retry
    // Tell the interface the WISE epochs are ready, so it can add them to a timeline it already shows.
    // SX.data caches details and comparisons as if they never change: drop the partial (SPHEREx-only) answers first.
    f.loadP.then(() => { window.SX && window.SX.data && window.SX.data.clearCache && window.SX.data.clearCache(); window.dispatchEvent(new CustomEvent('skyshift:field-loaded', { detail: { ra, dec } })); }).catch(() => {});
    FIELDS.set(key, f);
  }
  return FIELDS.get(key);
}

/** SPHEREx-only requests are answered as soon as the SPHEREx frames are in; WISE ones wait for the full load. */
async function dataFor(f, needFull) {
  // Once the full load is in, always answer with it (the SPHEREx-only result would hide the movers).
  if (f.full) return f.full;
  try { return needFull ? await f.loadP : await Promise.race([f.spxP, f.loadP]); } catch (e) { throw asDataError(e); }
}

function parseObsId(id) {
  const m = /^sx:(-?[\d.]+),(-?[\d.]+):(v|w)(\d+)$/.exec(String(id || ''));
  if (!m) throw DataError('not-found', `Unknown observation id: ${id}`, { retryable: false });
  return { f: field(Number(m[1]), Number(m[2])), kind: m[3], index: Number(m[4]) };
}

/** A WISE timeline entry every ~3 years keeps the timeline readable; the engine uses all of them. */
function pickWise(frames) {
  const out = [];
  for (const w of frames) if (!out.length || w.mjd - out[out.length - 1].mjd > 900 || w === frames[frames.length - 1]) out.push(w);
  return out;
}

/* ---------- images ---------- */

const BAND_RANGES = DETECTORS.map((d) => ({ id: d.id, min: d.min, max: d.max }));

/** The stacked SPHEREx frame for a visit and band ('composite' → all bands). */
function visitImage(loaded, visitMjd, band) {
  const visit = loaded.visits.reduce((best, v) => (Math.abs(v.mjd - visitMjd) < Math.abs(best.mjd - visitMjd) ? v : best), loaded.visits[0]);
  if (!visit || Math.abs(visit.mjd - visitMjd) > 20) throw DataError('not-available', 'This visit could not be downloaded from the archive.', { retryable: true });
  const members = band === 'composite' ? visit.members : visit.members.filter((f) => f.detector === band);
  if (!members.length) throw DataError('not-available', `SPHEREx band ${band} has no image in this visit.`, { retryable: false });
  return { data: weightedCoadd(members).data, members, visit };
}

const STRETCH = new Map();
/** One brightness scale per field and band across all visits, so visits compare fairly. */
function stretchFor(f, loaded, band) {
  const k = `${f.key}|${band}`;
  if (!STRETCH.has(k)) {
    const arrays = loaded.visits.map((v) => {
      const m = band === 'composite' ? v.members : v.members.filter((x) => x.detector === band);
      return m.length ? weightedCoadd(m).data : null;
    }).filter(Boolean);
    const [lo, hi] = percentiles(arrays.length ? arrays : [new Float32Array([0, 1])], [1, 99.7]);
    STRETCH.set(k, { lo, hi });
  }
  return STRETCH.get(k);
}

function toPng(n, size, pixel) {
  const small = document.createElement('canvas');
  small.width = n; small.height = n;
  const img = small.getContext('2d').createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [r, g, b] = pixel(y * n + x);
      const o = ((n - 1 - y) * n + x) * 4; // FITS row 0 is the bottom
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  small.getContext('2d').putImageData(img, 0, 0);
  const big = document.createElement('canvas');
  big.width = size; big.height = size;
  const ctx = big.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, size, size);
  return big.toDataURL('image/png');
}

const asinh01 = (v, lo, hi) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)));
  return Math.asinh(10 * t) / Math.asinh(10);
};

function grayUrl(n, size, data, { lo, hi }) {
  return toPng(n, size, (i) => {
    const v = data[i];
    const g = Number.isFinite(v) ? Math.round(255 * asinh01(v, lo, hi)) : 0;
    return [g, g, g];
  });
}

/** Infrared colour: blue = 0.75–1.6 µm, green = 1.6–3.8 µm, red = 3.8–5 µm. */
function compositeUrl(f, loaded, visitMjd, size) {
  const visit = loaded.visits.reduce((best, v) => (Math.abs(v.mjd - visitMjd) < Math.abs(best.mjd - visitMjd) ? v : best), loaded.visits[0]);
  const groups = [[5, 6], [3, 4], [1, 2]].map((dets) => {
    const m = visit.members.filter((x) => dets.includes(x.detector));
    if (!m.length) return null;
    const data = weightedCoadd(m).data;
    const [lo, hi] = percentiles([data], [1, 99.7]);
    return { data, lo, hi };
  });
  const n = loaded.grid.n;
  const present = groups.filter(Boolean);
  // A visit with only one colour group (e.g. a single exposure) is shown in grey, not one colour.
  if (present.length === 1) return grayUrl(n, size, present[0].data, present[0]);
  return toPng(n, size, (i) => groups.map((g) => (g && Number.isFinite(g.data[i]) ? Math.round(255 * asinh01(g.data[i], g.lo, g.hi)) : 0)));
}

/* ---------- the provider ---------- */

const provider = {
  describe: () => ({
    name: 'SkyShift · NASA SPHEREx (IRSA) + WISE/NEOWISE', simulated: false, version: '1.0',
    note: 'Real NASA data fetched live from IRSA, MAST and JPL. A field takes about a minute the first time; fields loaded before come back in seconds.',
  }),

  // Loading a new field downloads real images; give those calls time (see service.js).
  timeouts: { getObservations: 120000, getObservationImage: 900000, getObservationMetadata: 900000, getComparisonResult: 900000 },

  async getWavelengthBands() {
    const hints = ['Near infrared (shortest)', 'Near infrared', 'Near infrared (longest)', 'Ices and dust grains', 'Cool objects', 'Coolest glow'];
    return DETECTORS.map((d, i) => ({ id: d.id, minMicron: d.min, maxMicron: d.max, channels: 17, hint: hints[i] }));
  },

  async getFeaturedTargets() { return featured(); },

  async getTargetById(id) {
    if (TARGET_MAP.has(id)) return TARGET_MAP.get(id);
    if (String(id).startsWith('name:')) return provider._resolve(String(id).slice(5));
    throw DataError('not-found', `No target with id “${id}”.`, { retryable: false });
  },

  async _resolve(name) {
    await ready;
    try {
      const r = await resolveName(name);
      const [ra, dec] = r.pmra || r.pmdec ? propagate(r.ra, r.dec, r.pmra, r.pmdec, r.epoch, 2026.0) : [r.ra, r.dec];
      const t = {
        id: `name:${name}`, name: r.name, aliases: [name], classification: 'other', coordinates: { ra, dec },
        description: { en: `Found by name with the CDS Sesame resolver (SIMBAD). SPHEREx images of this spot are fetched from NASA's archive.`, ar: 'عُثر عليه بالاسم عبر خدمة CDS Sesame (SIMBAD). تُجلب صور SPHEREx لهذا الموضع من أرشيف ناسا.' },
        metadata: r.pmra || r.pmdec ? [{ key: 'properMotion', label: { en: 'Catalogued motion', ar: 'الحركة المسجّلة' }, value: (Math.hypot(r.pmra, r.pmdec) / 1000).toFixed(2), unit: '″/yr' }] : [],
        availability: 'unknown', isSimulated: false,
      };
      SETTINGS[t.id] = { sizeArcmin: 6, wmin: 0.75, wmax: 5, max: 36, motion: { name: r.name, ra: r.ra, dec: r.dec, epoch: r.epoch, pmra: r.pmra, pmdec: r.pmdec } };
      TARGET_MAP.set(t.id, t);
      return t;
    } catch (e) {
      throw DataError('not-found', `No object called “${name}” was found.`, { retryable: false });
    }
  },

  async searchTargets(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return featured().slice(0, 8);
    const hit = (t) => [t.name?.en || t.name, t.name?.ar, ...(t.aliases || [])].filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    const found = featured().filter(hit);
    if (found.length || q.length < 3) return found.slice(0, 8);
    try { return [await provider._resolve(query.trim())]; } catch { return []; }
  },

  async getTargetsNear(ra, dec, radiusDeg) {
    if (!(ra >= 0 && ra <= 360 && dec >= -90 && dec <= 90)) throw DataError('invalid-coordinates', 'RA must be 0–360° and Dec −90…+90°.', { retryable: false });
    return featured().map((t) => ({ ...t, separationDeg: separationArcsec(ra, dec, t.coordinates.ra, t.coordinates.dec) / 3600 }))
      .filter((t) => t.separationDeg <= radiusDeg).sort((a, b) => a.separationDeg - b.separationDeg);
  },

  async getObservations(ra, dec) {
    const f = field(ra, dec);
    let search;
    try { search = await f.searchP; } catch (e) { FIELDS.delete(f.key); throw asDataError(e); }
    const fov = f.s.sizeArcmin / 60;
    const iso = (m) => mjdToDate(m).toISOString();
    const base = { center: { ra, dec }, fieldOfViewDeg: fov, coverage: 1, isSimulated: false, targetId: f.s.id };
    const spherex = search.visits.map((v, i) => {
      const dets = new Set(v.members.map((m) => m.detector));
      return {
        ...base, id: `sx:${f.key}:v${i}`, startTime: iso(v.mjdRange ? v.mjdRange[0] : v.mjd), endTime: iso(v.mjdRange ? v.mjdRange[1] : v.mjd),
        status: 'observed', visitIndex: i + 1, source: 'spherex-irsa',
        bands: DETECTORS.map((d) => ({ bandId: d.id, available: dets.has(d.id), quality: [] })),
        quality: [{ code: v.members.length < 3 ? 'low-snr' : 'ok', severity: v.members.length < 3 ? 'warning' : 'info', detail: `${v.members.length} SPHEREx exposures` }],
      };
    });
    // WISE epochs come with the full load; list them once it has finished, so the timeline grows.
    let wise = [];
    // A cached field loads in seconds, so wait briefly for the WISE epochs; otherwise answer with SPHEREx now
    // and announce 'skyshift:field-loaded' when WISE is in.
    const loaded = await Promise.race([f.loadP.catch(() => null), new Promise((r) => setTimeout(() => r(null), 8000))]);
    if (loaded) {
      wise = pickWise(loaded.wise.frames).map((w) => ({
        ...base, id: `sx:${f.key}:w${loaded.wise.frames.indexOf(w)}`, startTime: iso(w.mjdRange[0]), endTime: iso(w.mjdRange[1]),
        status: 'observed', visitIndex: 0, source: w.instrument === 'WISE' ? 'allwise-irsa' : 'neowise-irsa',
        bands: DETECTORS.map((d) => ({ bandId: d.id, available: d.id === 6, quality: d.id === 6 ? [] : [{ code: 'wise-w2-only', severity: 'info' }] })),
        quality: [{ code: 'wise-w2', severity: 'info', detail: `${w.label}: NASA WISE 4.6 µm (W2), ${w.stacked} exposure${w.stacked > 1 ? 's' : ''}` }],
      }));
    }
    const all = [...wise, ...spherex].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
    all.forEach((o, i) => { o.visitIndex = i + 1; });
    return all;
  },

  async getObservationImage(observationId, band, opts) {
    const { f, kind, index } = parseObsId(observationId);
    const size = Math.max(64, Math.min(512, (opts && opts.size) || 256));
    const loaded = await dataFor(f, kind === 'w');
    const n = loaded.grid.n;
    if (kind === 'w') {
      const w = loaded.wise.frames[index];
      if (!w) throw DataError('not-available', 'This WISE frame could not be loaded.', { retryable: true });
      if (band !== 'composite' && band !== 6) throw DataError('not-available', 'WISE images are at 4.6 µm only: use band 6 or “All bands”.', { retryable: false });
      return {
        observationId, bandId: band, url: grayUrl(n, size, w.data, w.stats), encoding: band === 'composite' ? 'rgb' : 'intensity-gray',
        width: size, height: size, wavelengthMinMicron: 4.6, wavelengthMaxMicron: 4.6, quality: [], isSimulated: false,
      };
    }
    const search = await f.searchP;
    const sv = search.visits[index];
    if (!sv) throw DataError('not-found', 'No such observation.', { retryable: false });
    if (band === 'composite') {
      return {
        observationId, bandId: band, url: compositeUrl(f, loaded, sv.mjd, size), encoding: 'rgb', width: size, height: size,
        wavelengthMinMicron: 0.75, wavelengthMaxMicron: 5, quality: [], isSimulated: false,
      };
    }
    const { data } = visitImage(loaded, sv.mjd, band);
    const b = BAND_RANGES.find((x) => x.id === band);
    return {
      observationId, bandId: band, url: grayUrl(n, size, data, stretchFor(f, loaded, band)), encoding: 'intensity-gray',
      width: size, height: size, wavelengthMinMicron: b?.min, wavelengthMaxMicron: b?.max, quality: [], isSimulated: false,
    };
  },

  async getObservationMetadata(observationId) {
    const { f, kind, index } = parseObsId(observationId);
    const loaded = await dataFor(f, kind === 'w');
    const fields = [{ key: 'observationId', value: observationId }];
    const pointing = `${formatRa(f.ra)}  ${formatDec(f.dec)}`;
    if (kind === 'w') {
      const w = loaded.wise.frames[index];
      fields.push(
        { key: 'mission', label: { en: 'Mission', ar: 'المهمة' }, value: w.instrument === 'WISE' ? 'NASA WISE (AllWISE Atlas)' : 'NASA NEOWISE' },
        { key: 'startTime', value: mjdToDate(w.mjdRange[0]).toISOString() },
        { key: 'band', label: { en: 'Band', ar: 'النطاق' }, value: 'W2', unit: '4.6 µm' },
        { key: 'exposures', label: { en: 'Exposures stacked', ar: 'التعريضات المكدّسة' }, value: w.stacked },
        { key: 'pointing', value: pointing },
      );
    } else {
      const sv = (await f.searchP).visits[index];
      const { visit } = visitImage(loaded, sv.mjd, 'composite');
      const masked = visit.members.reduce((a, m) => a + m.maskedFraction, 0) / visit.members.length;
      fields.push(
        { key: 'mission', label: { en: 'Mission', ar: 'المهمة' }, value: 'NASA SPHEREx (Level 2, IRSA)' },
        { key: 'startTime', value: mjdToDate(visit.mjdRange ? visit.mjdRange[0] : visit.mjd).toISOString() },
        { key: 'exposures', label: { en: 'Exposures stacked', ar: 'التعريضات المكدّسة' }, value: visit.members.length },
        { key: 'wavelength', label: { en: 'Wavelengths at the target', ar: 'الأطوال الموجية عند الهدف' }, value: `${visit.wlMin.toFixed(2)}–${visit.wlMax.toFixed(2)}`, unit: 'µm' },
        { key: 'detectors', label: { en: 'Detectors', ar: 'الكواشف' }, value: [...new Set(visit.members.map((m) => `D${m.detector}`))].sort().join(', ') },
        { key: 'masked', label: { en: 'Flagged pixels masked', ar: 'البكسلات المعلَّمة المحجوبة' }, value: (masked * 100).toFixed(1), unit: '%' },
        { key: 'zodi', label: { en: 'Zodiacal light', ar: 'الضوء البروجي' }, value: 'subtracted' },
        { key: 'pointing', value: pointing },
        { key: 'images', label: { en: 'Images', ar: 'الصور' }, value: visit.members.slice(0, 4).map((m) => m.obsId).join(', ') + (visit.members.length > 4 ? ` … +${visit.members.length - 4}` : '') },
      );
    }
    if (loaded.partial) fields.push({ key: 'moverSearch', label: { en: 'Moving-object search', ar: 'البحث عن الأجرام المتحركة' }, value: 'running (downloading WISE 2010–2024)' });
    for (const m of loaded.movers.filter((x) => x.tier === 'confident')) {
      fields.push({ key: `mover${m.n}`, label: { en: `Moving object #${m.n}${m.isTarget ? ' (the target)' : ''}`, ar: `جرم متحرك #${m.n}` },
        value: `${m.total.toFixed(2)} ± ${m.err.toFixed(2)}`, unit: `″/yr${m.wise?.epochs ? ` · ${m.wise.epochs} WISE epochs` : ''}` });
    }
    return {
      observationId, fields, quality: [],
      provenance: { source: kind === 'w' ? 'wise-irsa' : 'spherex-irsa', retrievedAt: new Date().toISOString(), processingVersion: 'SkyShift 1.0' },
      isSimulated: false,
    };
  },

  async getComparisonResult(a, b, opts) {
    const A = parseObsId(a), B = parseObsId(b);
    if (A.f !== B.f) throw DataError('unsupported', 'These two observations are of different fields.', { retryable: false });
    const f = A.f;
    const loaded = await dataFor(f, A.kind === 'w' || B.kind === 'w');
    const band = (opts && opts.bandId) || 'composite';
    const search = await f.searchP;
    const frameOf = (p) => {
      if (p.kind === 'w') { const w = loaded.wise.frames[p.index]; return { data: w.data, mjd: w.mjd, wise: true }; }
      const sv = search.visits[p.index];
      const { data, visit } = visitImage(loaded, sv.mjd, p.kind === 'v' && band !== 'composite' ? band : 'composite');
      return { data, mjd: visit.mjd, wise: false };
    };
    const fa = frameOf(A), fb = frameOf(B), n = loaded.grid.n;
    // Put both on a common footing (S/N units), so SPHEREx and WISE frames can be compared too.
    const norm = (d) => {
      const vals = Array.from(d).filter(Number.isFinite).sort((x, y) => x - y);
      const med = vals[vals.length >> 1] ?? 0;
      const mad = (vals.map((v) => Math.abs(v - med)).sort((x, y) => x - y)[vals.length >> 1] || 1) * 1.4826;
      return d.map((v) => (v - med) / mad);
    };
    const za = norm(fa.data), zb = norm(fb.data);
    const diff = zb.map((v, i) => v - za[i]);
    let changed = 0, peak = 0, finite = 0;
    for (const v of diff) if (Number.isFinite(v)) { finite++; if (Math.abs(v) > 5) changed++; peak = Math.max(peak, Math.abs(v)); }
    const size = 256, scale = 10;
    const url = toPng(n, size, (i) => {
      const v = diff[i];
      if (!Number.isFinite(v)) return [10, 10, 16];
      const t = Math.min(1, Math.abs(v) / scale);
      return v > 0 ? [Math.round(12 + 243 * t), Math.round(12 + 188 * t), Math.round(16 + 40 * t)] // gold: brighter in B
        : [Math.round(12 + 30 * t), Math.round(12 + 200 * t), Math.round(16 + 239 * t)];             // cyan: dimmer in B
    });
    const yB = mjdToYear(fb.mjd);
    const candidates = loaded.movers.filter((m) => m.tier === 'confident').map((m) => {
      const p = moverAt(m, yB);
      const cat = m.catalog.kind === 'gaia' ? `Gaia DR3 ${m.catalog.total.toFixed(2)}″/yr` : m.catalog.kind === 'catwise' ? `CatWISE2020 ${m.catalog.total.toFixed(2)}″/yr` : 'no catalogue match';
      return {
        id: `m${m.n}`, changeType: 'moved', confidence: m.wise?.epochs ? 0.95 : 0.75,
        pixel: { x: ((p.x + 0.5) * size) / n, y: ((n - 1 - p.y + 0.5) * size) / n },
        label: { en: `${m.isTarget ? 'Target' : `Mover #${m.n}`}: ${m.total.toFixed(2)} ± ${m.err.toFixed(2)}″/yr (${cat})`, ar: `جرم متحرك: ${m.total.toFixed(2)} ± ${m.err.toFixed(2)} ثانية قوسية/سنة` },
      };
    });
    const years = Math.abs(yB - mjdToYear(fa.mjd));
    const significance = candidates.length ? 'high' : changed / Math.max(1, finite) > 0.01 ? 'moderate' : changed ? 'low' : 'none';
    const notes = candidates.length
      ? { en: `${candidates.length} moving object${candidates.length > 1 ? 's' : ''} found by SkyShift across ${years.toFixed(1)} years. Motions are measured from all SPHEREx visits and WISE/NEOWISE epochs (2010–2024).${fa.wise !== fb.wise ? ' The two images come from different telescopes, so brightness differences are not meaningful; positions are.' : ''}`,
        ar: `عثر SkyShift على ${candidates.length} جرم متحرك عبر ${years.toFixed(1)} سنة.` }
      : { en: `No moving object found in this field. Gold = brighter in the later image, cyan = dimmer.`, ar: 'لم يُعثر على جرم متحرك في هذا الحقل.' };
    return {
      observationA: a, observationB: b, bandId: band, differenceImageUrl: url, width: size, height: size,
      // In S/N units; capped, since a bright star seen by two different telescopes can reach thousands.
      summary: { changedPixelFraction: changed / Math.max(1, finite), peakChange: Number(Math.min(peak, 999).toFixed(1)), significance },
      candidates, notes, quality: [], isSimulated: false,
    };
  },
};

SX.providers = SX.providers || {};
SX.providers.skyshift = provider;
export default provider;
