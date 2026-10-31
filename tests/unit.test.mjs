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
    { header: [['EXTNAME', 'FLAGS'], ['MP_HOT', 10], ['MP_SOURCE', 21]], data: flags, width: 4, height: 3 },
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
