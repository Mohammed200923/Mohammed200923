// Unit tests: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Wcs, makeGrid, parseCoordinates, propagate, separationArcsec } from '../app/js/wcs.js';
import { parseFits, writeFits, spherexPlanes } from '../app/js/fits.js';
import { badPixelMask } from '../app/js/spherex.js';
import { coadd, groupVisits, aperturePhotometry } from '../app/js/stack.js';
import { parseVizierTsv } from '../app/js/catalogs.js';

const SIP_HEADER = {
  CTYPE1: 'RA---TAN-SIP', CTYPE2: 'DEC--TAN-SIP',
  CRVAL1: 133.795, CRVAL2: -7.245, CRPIX1: 30.3, CRPIX2: 28.7,
  CD1_1: -0.0012, CD1_2: 0.0011, CD2_1: 0.0011, CD2_2: 0.0012,
  A_ORDER: 2, B_ORDER: 2, A_2_0: 2e-5, A_0_2: -1e-5, A_1_1: 3e-6, B_1_1: 1.5e-5, B_0_2: 4e-6,
};

test('WCS round trip with SIP distortion', () => {
  const w = new Wcs(SIP_HEADER);
  for (const [x, y] of [[0, 0], [59, 0], [10, 50], [59, 59], [29.3, 27.7]]) {
    const [ra, dec] = w.pixToWorld(x, y);
    const [x2, y2] = w.worldToPix(ra, dec);
    assert.ok(Math.abs(x - x2) < 1e-6 && Math.abs(y - y2) < 1e-6, `${x},${y} -> ${x2},${y2}`);
  }
});

test('WCS matches astropy reference values', () => {
  // Reference produced by tests/astropy_reference.py
  const ref = JSON.parse(readFileSync(new URL('./astropy_reference.json', import.meta.url)));
  const w = new Wcs(ref.header);
  for (const p of ref.points) {
    const [ra, dec] = w.pixToWorld(p.x, p.y);
    assert.ok(separationArcsec(ra, dec, p.ra, p.dec) < 1e-3, `pix ${p.x},${p.y}: ${ra},${dec} vs ${p.ra},${p.dec}`);
  }
});

test('north-up grid has east to the left', () => {
  const g = makeGrid(10, 20, 6, 6.15);
  const [raL] = g.wcs.pixToWorld(0, g.n / 2);
  const [raR] = g.wcs.pixToWorld(g.n - 1, g.n / 2);
  assert.ok(raL > raR);
  const [, decB] = g.wcs.pixToWorld(g.n / 2, 0);
  const [, decT] = g.wcs.pixToWorld(g.n / 2, g.n - 1);
  assert.ok(decT > decB);
});

test('coordinate parsing', () => {
  const c = parseCoordinates('08h55m10.831s -7d14m42.53s');
  assert.ok(Math.abs(c.ra - 133.795129) < 1e-5);
  assert.ok(Math.abs(c.dec - -7.245147) < 1e-5);
  assert.deepEqual(parseCoordinates('269.45, 4.69'), { ra: 269.45, dec: 4.69 });
  const neg0 = parseCoordinates('12 00 00 -00 30 00');
  assert.ok(Math.abs(neg0.dec + 0.5) < 1e-9, 'negative zero degrees keeps its sign');
  assert.equal(parseCoordinates("Barnard's Star"), null);
});

test("proper motion propagation (Barnard's Star moves ~10.4\"/yr)", () => {
  const [ra, dec] = propagate(269.452082, 4.693365, -801.55, 10362.39, 2000, 2026);
  const sep = separationArcsec(269.452082, 4.693365, ra, dec);
  assert.ok(Math.abs(sep - 26 * 10.393) < 1, `moved ${sep}"`);
});

test('FITS write/read round trip, MEF extensions', () => {
  const img = Float32Array.from({ length: 12 }, (_, i) => i * 1.5 - 3);
  const flags = Int32Array.from({ length: 12 }, (_, i) => (i === 5 ? 1 << 10 : i === 6 ? 1 << 21 : 0));
  const buf = writeFits([
    { header: [['EXTNAME', 'IMAGE'], ['CTYPE1', 'RA---TAN'], ['CRVAL1', 12.5]], data: img, width: 4, height: 3 },
    { header: [['EXTNAME', 'FLAGS'], ['MSKN0010', 'HOT'], ['MSKN0021', 'SOURCE']], data: flags, width: 4, height: 3 },
  ]);
  const hdus = parseFits(buf);
  assert.equal(hdus.length, 2);
  const { image, flags: f } = spherexPlanes(hdus);
  assert.deepEqual([...image.data], [...img]);
  assert.equal(image.header.CTYPE1, 'RA---TAN');
  assert.equal(image.header.CRVAL1, 12.5);
  assert.equal(f.data[5], 1024);
  const mask = badPixelMask(f.header);
  assert.ok(mask & (1 << 10), 'HOT is masked');
  assert.ok(!(mask & (1 << 21)), 'SOURCE is not masked');
});

test('visit grouping and NaN-aware coadd', () => {
  const frames = [0, 0.3, 0.6, 182, 182.4, 365].map((mjd) => ({ mjd }));
  assert.deepEqual(groupVisits(frames, 20).map((g) => g.frames.length), [3, 2, 1]);
  const out = coadd([Float32Array.of(1, NaN, 3), Float32Array.of(3, 2, NaN), Float32Array.of(5, 4, NaN)], 'median');
  assert.deepEqual([...out], [3, 3, 3]);
});

test('aperture photometry recovers a point source above background', () => {
  const n = 31, data = new Float32Array(n * n).fill(1);
  data[15 * n + 15] += 10;
  const f = aperturePhotometry(data, n, 15, 15, 6.15);
  const omega = (6.15 / 206264.806) ** 2;
  assert.ok(Math.abs(f - 10 * omega * 1e9) < 1e-9);
});

test('VizieR TSV parsing', () => {
  const tsv = '#comment\n\nSource\tRA_ICRS\tpmRA\n \tdeg\tmas/yr\n---\t---\t---\n123\t10.5\t-801.5\n456\t11.0\t\n';
  const rows = parseVizierTsv(tsv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].pmRA, '-801.5');
});

test('SPHEREx per-pixel wavelength lookup matches astropy on a real cutout', async () => {
  const { wavelengthAt } = await import('../app/js/spherex.js');
  const fx = JSON.parse(readFileSync(new URL('./spherex_wave_fixture.json', import.meta.url)));
  for (const p of fx.points) {
    const [wl, bw] = wavelengthAt(fx.table, fx.header, p.x, p.y);
    assert.ok(Math.abs(wl - p.wavelength) < 1e-6, `λ at ${p.x},${p.y}: ${wl} vs ${p.wavelength}`);
    assert.ok(Math.abs(bw - p.bandwidth) < 1e-6);
  }
});

test('flag names come from MSKN keywords and bright-star flags are never masked', async () => {
  const { badPixelMask } = await import('../app/js/spherex.js');
  const mask = badPixelMask({ MSKN0000: 'TRANSIENT', MSKN0001: 'OVERFLOW', MSKN0010: 'HOT', MSKN0026: 'BLOOM', MSKN0021: 'SOURCE' });
  assert.equal(mask, 1 << 10);
});

// Synthetic visit: Gaussian stars (sigma ≈ 0.8 px) on noise, with a per-pixel variance plane.
function synthVisit(n, stars, seed, noise = 0.02) {
  let a = seed >>> 0;
  const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const data = new Float32Array(n * n), variance = new Float32Array(n * n).fill(noise * noise);
  for (let i = 0; i < n * n; i++) data[i] = noise * Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  for (const s of stars) {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      data[y * n + x] += s.amp * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * 0.8 * 0.8));
    }
  }
  return { data, variance };
}

test('mover search finds a moving star and ignores static ones', async () => {
  const { findMovers, toProperMotion } = await import('../app/js/movers.js');
  const n = 60;
  const statics = [[12.3, 15.7], [40.1, 44.6], [25.5, 50.2], [48.8, 12.4], [8.6, 38.9], [33.3, 28.1]]
    .map(([x, y], i) => ({ x, y, amp: 1 + i * 0.3 }));
  const mjds = [60800, 60983, 61166, 61350];
  // Mover: +0.9 px/visit in y (north), -0.4 px/visit in x (east); plus a small alignment jitter per visit.
  const jitter = [[0, 0], [0.3, -0.2], [-0.25, 0.15], [0.1, 0.3]];
  const visits = mjds.map((mjd, k) => {
    const [jx, jy] = jitter[k];
    const stars = statics.map((s) => ({ ...s, x: s.x + jx, y: s.y + jy }))
      .concat([{ x: 30 - 0.4 * k + jx, y: 20 + 0.9 * k + jy, amp: 1.5 }]);
    return { mjd, ...synthVisit(n, stars, 1234 + k) };
  });
  const { movers, tracks } = findMovers(visits, n);
  assert.equal(movers.length, 1, `found ${movers.length} movers`);
  const m = movers[0];
  // Fitted position is at the mean date: x = 30 - 0.4·1.5, y = 20 + 0.9·1.5.
  assert.ok(Math.abs(m.x0 - 29.4) < 0.3 && Math.abs(m.y0 - 21.35) < 0.3, `mover at ${m.x0},${m.y0}`);
  const pm = toProperMotion(m, 6.15);
  const perYear = 365.25 / 183;
  assert.ok(Math.abs(pm.pmdec - 0.9 * perYear * 6.15) < 1.5, `pmdec ${pm.pmdec}`);
  assert.ok(Math.abs(pm.pmra - 0.4 * perYear * 6.15) < 1.5, `pmra ${pm.pmra} (east = +)`);
  const staticFits = tracks.filter((t) => t.fit && t.fit !== m);
  assert.ok(staticFits.length >= 5, 'static stars are tracked');
  assert.ok(staticFits.every((t) => t.fit.shift < 0.5), 'static stars stay put after alignment correction');
});

test('weighted coadd down-weights noisy frames and propagates variance', async () => {
  const { weightedCoadd } = await import('../app/js/stack.js');
  const a = { aligned: Float32Array.of(1, 1), alignedVar: Float32Array.of(1, 1) };
  const b = { aligned: Float32Array.of(3, 3), alignedVar: Float32Array.of(4, 4) };
  const { data, variance } = weightedCoadd([a, b]);
  // weights 1 and 1/4 → (1 + 0.75) / 1.25 = 1.4; variance (1 + 1/16*4) / 1.25² = 0.8
  assert.ok(Math.abs(data[0] - 1.4) < 1e-6);
  assert.ok(Math.abs(variance[0] - 0.8) < 1e-6);
});

test('photometry error grows with pixel variance', async () => {
  const { measure } = await import('../app/js/stack.js');
  const n = 31, data = new Float32Array(n * n).fill(1);
  data[15 * n + 15] += 10;
  const low = measure(data, new Float32Array(n * n).fill(0.01), n, 15, 15, 6.15);
  const high = measure(data, new Float32Array(n * n).fill(1), n, 15, 15, 6.15);
  assert.ok(low.err > 0 && high.err > low.err * 5);
  assert.ok(Math.abs(low.flux - high.flux) < 1e-12);
});

test('relative brightness removes the spectrum and reveals a variable', async () => {
  const { relativeBrightness, visitBrightness } = await import('../app/js/stack.js');
  // Steep spectrum (flux ∝ λ^-2); visit 1 is 50% brighter at every wavelength.
  const points = [];
  [0, 1, 2].forEach((visit) => {
    for (const wl of [0.8, 1.0, 1.5, 2.2, 3.0, 4.2]) {
      points.push({ visit, mjd: 60800 + 180 * visit, wl: wl * (1 + 0.01 * visit), flux: wl ** -2 * (visit === 1 ? 1.5 : 1), err: 0.01 });
    }
  });
  const v = visitBrightness(relativeBrightness(points));
  assert.equal(v.length, 3);
  assert.ok(v[1].rel > 1.35 && v[0].rel < 0.85 && v[2].rel < 0.85, JSON.stringify(v.map((x) => x.rel)));
});

test('SIN projection (AllWISE Atlas images) matches astropy and round-trips', () => {
  const fx = JSON.parse(readFileSync(new URL('./wise_sin_fixture.json', import.meta.url)));
  const w = new Wcs(fx.header);
  for (const p of fx.points) {
    const [ra, dec] = w.pixToWorld(p.x, p.y);
    assert.ok(separationArcsec(ra, dec, p.ra, p.dec) < 1e-3, `pix ${p.x},${p.y}`);
    const [x, y] = w.worldToPix(p.ra, p.dec);
    assert.ok(Math.abs(x - p.x) < 1e-6 && Math.abs(y - p.y) < 1e-6);
  }
});

test('CatWISE clean-up drops glare around bright stars and merges duplicate entries', async () => {
  const { cleanCatwiseMovers } = await import('../app/js/providers/wise.js');
  const src = (ra, dec, pmra, pmdec, w2, extra = {}) => ({ ra, dec, pmra, pmdec, pmErr: 50, w2, w2snr: 50, ...extra });
  const bright = [{ ra: 10, dec: 0, g: 8 }];
  const list = [
    src(10 + 60 / 3600, 0, 9000, 0, 12),           // 60″ from a G=8 star: glare
    src(10.2, 0, -8000, 700, 13.8),                 // real fast mover
    src(10.2 + 5 / 3600, 0, -7900, 900, 14.1),      // its duplicate entry
    src(10.3, 0.1, 400, 0, 16, { w2snr: 5 }),       // poorly detected
    src(10.3, -0.1, 200, 0, 15),                    // too slow
  ];
  const kept = cleanCatwiseMovers(list, bright);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].w2, 13.8);
});

test('continuous Deep Survey coverage is split into visits of at most 30 days', () => {
  const frames = Array.from({ length: 90 }, (_, i) => ({ mjd: 61000 + i * 2 })); // every 2 days for 6 months
  const groups = groupVisits(frames, 20, 30);
  assert.equal(groups.length, 6);
  assert.ok(groups.every((g) => g.frames[g.frames.length - 1].mjd - g.frames[0].mjd <= 30));
});

test('an older epoch (e.g. WISE 2010) tightens the motion and rejects a wrong source', async () => {
  const { findMovers, addEpoch, toProperMotion } = await import('../app/js/movers.js');
  const n = 60;
  const statics = [[12.3, 15.7], [40.1, 44.6], [25.5, 50.2], [48.8, 12.4], [8.6, 38.9], [33.3, 28.1]]
    .map(([x, y], i) => ({ x, y, amp: 1 + i * 0.3 }));
  // Mover: 1.0 px/yr north. SPHEREx-like visits over one year.
  const mjds = [61000, 61091, 61182, 61274, 61365];
  const at = (mjd) => 20 + ((mjd - 61000) / 365.25) * 1.0;
  const visits = mjds.map((mjd, k) => ({ mjd, ...synthVisit(n, statics.concat([{ x: 30, y: at(mjd), amp: 1.5 }]), 99 + k) }));
  const r = findMovers(visits, n);
  assert.equal(r.movers.length, 1);
  const m = r.movers[0];
  const wiseMjd = 55400; // ~15 years earlier
  const wiseYear = 2000 + (wiseMjd - 51544.5) / 365.25;
  const good = synthVisit(n, statics.concat([{ x: 30, y: at(wiseMjd), amp: 1.5 }]), 7).data;
  // The 2010 position is off the grid (y ≈ 4.7 px), so put the image's stars in, the mover at its true place.
  const ok = addEpoch(m, good, n, wiseYear, r.anchorSources);
  assert.ok(ok.fit, ok.rejected);
  assert.ok(ok.fit.velErr < m.velErr / 4, 'much tighter');
  const pm = toProperMotion(ok.fit, 6.15);
  assert.ok(Math.abs(pm.pmdec - 6.15) < 0.3, `pmdec ${pm.pmdec}`);
  // Mover absent in the old image: a static star near the predicted spot must not be taken for it…
  const withStar = synthVisit(n, statics.concat([{ x: 31, y: 6, amp: 1.2 }]), 8).data;
  const visitsWithStar = visits.map((v, k) => ({ ...v, ...synthVisit(n, statics.concat([{ x: 30, y: at(v.mjd), amp: 1.5 }, { x: 31, y: 6, amp: 1.2 }]), 99 + k) }));
  const r2 = findMovers(visitsWithStar, n);
  assert.ok(addEpoch(r2.movers[0], withStar, n, wiseYear, r2.anchorSources).rejected, 'static star rejected');
  // …and a source far outside the search zone is not taken either.
  const far = synthVisit(n, statics.concat([{ x: 45, y: at(wiseMjd), amp: 1.5 }]), 9).data;
  assert.ok(addEpoch(m, far, n, wiseYear, r.anchorSources).rejected, 'far source rejected');
});

test('JPL Horizons commands from small-body names', async () => {
  const { horizonsCommand } = await import('../app/js/providers/jpl.js');
  assert.equal(horizonsCommand('3674 Erbisbuhl (1963 RH)'), '3674;');
  assert.equal(horizonsCommand('(2021 UC93)'), 'DES=2021 UC93;');
  assert.equal(horizonsCommand('29P/Schwassmann-Wachmann 1'), 'DES=29P;CAP;');
  assert.equal(horizonsCommand('C/2023 A3 (Tsuchinshan-ATLAS)'), 'DES=C/2023 A3;CAP;');
});
