// Dependency-free tests for the pure frontend logic: coordinate parsing/validation and data-contract validators.
//   node tools/test-core.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {}, document: {}, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['js/core/util.js', 'js/core/coords.js', 'js/data/contracts.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
const SX = sandbox.SX;

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { console.error('FAIL', name, '\n  ', e.message); process.exitCode = 1; } };
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

/* ---- single angles ---- */
test('RA decimal degrees', () => near(SX.coords.parseAngle('83.82', 'ra').value, 83.82));
test('RA hours suffix', () => near(SX.coords.parseAngle('5.588h', 'ra').value, 83.82));
test('RA h m s', () => near(SX.coords.parseAngle('05h35m17s', 'ra').value, 83.8208));
test('RA colon form', () => near(SX.coords.parseAngle('05:35:17', 'ra').value, 83.8208));
test('RA space form', () => near(SX.coords.parseAngle('05 35 17', 'ra').value, 83.8208));
test('RA 0 and just under 360', () => { assert.ok(SX.coords.parseAngle('0', 'ra').ok); assert.ok(SX.coords.parseAngle('359.99', 'ra').ok); });
test('RA 360 rejected', () => assert.equal(SX.coords.parseAngle('360', 'ra').code, 'range'));
test('RA negative rejected', () => assert.equal(SX.coords.parseAngle('-5', 'ra').code, 'range'));
test('RA 24h rejected', () => assert.equal(SX.coords.parseAngle('24h30m', 'ra').code, 'range'));
test('Dec decimal', () => near(SX.coords.parseAngle('-5.39', 'dec').value, -5.39));
test('Dec unicode minus', () => near(SX.coords.parseAngle('−5.39', 'dec').value, -5.39));
test('Dec d m', () => near(SX.coords.parseAngle('-05d23m', 'dec').value, -5.3833));
test('Dec degree symbols', () => near(SX.coords.parseAngle('-05° 23′ 17″', 'dec').value, -5.3881));
test('Dec colon', () => near(SX.coords.parseAngle('+41:16:09', 'dec').value, 41.2692));
test('Dec limits', () => { assert.ok(SX.coords.parseAngle('90', 'dec').ok); assert.ok(SX.coords.parseAngle('-90', 'dec').ok); assert.equal(SX.coords.parseAngle('90.1', 'dec').code, 'range'); assert.equal(SX.coords.parseAngle('-91', 'dec').code, 'range'); });
test('Dec cannot use hours', () => assert.equal(SX.coords.parseAngle('5h', 'dec').code, 'format'));
test('minutes >= 60 rejected', () => { assert.equal(SX.coords.parseAngle('05h75m', 'ra').code, 'minutes'); assert.equal(SX.coords.parseAngle('10d10m60s', 'dec').code, 'minutes'); });
test('garbage rejected', () => { for (const g of ['abc', '1.2.3', '12,5', '--5', '5-5', 'ra', '1 2 3 4']) assert.equal(SX.coords.parseAngle(g, 'dec').ok, false, g); });
test('empty', () => assert.equal(SX.coords.parseAngle('  ', 'ra').code, 'empty'));
test('Arabic-Indic digits', () => near(SX.coords.parseAngle('٨٣٫٨٢', 'ra').value, 83.82));

/* ---- two fields ---- */
test('two fields ok', () => { const r = SX.coords.parse('83.82', '-5.39'); assert.ok(r.ok); near(r.ra, 83.82); near(r.dec, -5.39); });
test('two fields report each error', () => { const r = SX.coords.parse('400', '95'); assert.equal(r.ok, false); assert.equal(r.errors.ra, 'range'); assert.equal(r.errors.dec, 'range'); });
test('one bad field', () => { const r = SX.coords.parse('83.82', 'x'); assert.equal(r.ok, false); assert.equal(r.errors.ra, undefined); assert.equal(r.errors.dec, 'format'); });

/* ---- single text box ---- */
test('combined: comma', () => { const r = SX.coords.parseCombined('83.82, -5.39'); assert.ok(r.ok); near(r.dec, -5.39); });
test('combined: space', () => { const r = SX.coords.parseCombined('83.82 -5.39'); assert.ok(r.ok); near(r.ra, 83.82); });
test('combined: sexagesimal', () => { const r = SX.coords.parseCombined('05h35m17s -05d23m'); assert.ok(r.ok); near(r.ra, 83.8208); near(r.dec, -5.3833); });
test('combined: labels', () => { const r = SX.coords.parseCombined('RA=83.82 Dec=-5.39'); assert.ok(r.ok); near(r.dec, -5.39); });
test('combined: semicolon', () => assert.ok(SX.coords.parseCombined('10.5; 41.2').ok));
test('combined: out of range', () => assert.equal(SX.coords.parseCombined('400, 10').ok, false));
test('combined: one number', () => assert.equal(SX.coords.parseCombined('83.82').ok, false));
test('looksLikeCoords', () => {
  for (const y of ['83.82, -5.39', '05h35m -05d23m', 'RA=10 Dec=20', '-5.2 10']) assert.ok(SX.coords.looksLikeCoords(y), y);
  for (const n of ['orion', 'M42', 'alpha cen', 'vega', '']) assert.ok(!SX.coords.looksLikeCoords(n), n);
});

/* ---- formatting ---- */
test('fmtRA / fmtDec', () => { assert.equal(SX.fmtRA(83.8208), '05h 35m 17s'); assert.equal(SX.fmtDec(-5.3881), '−05° 23′ 17″'); assert.equal(SX.fmtRA(359.9999), '00h 00m 00s'); });
test('angSep', () => { near(SX.angSep(0, 0, 90, 0), 90, 1e-6); near(SX.angSep(10, 20, 10, 20), 0, 1e-6); });

/* ---- contracts ---- */
const good = { id: 'x', name: 'X', coordinates: { ra: 10, dec: 20 }, metadata: [], description: 'd' };
const throwsCode = (fn, code) => { try { fn(); } catch (e) { assert.equal(e.code, code); return; } assert.fail('did not throw'); };
test('assertTarget ok', () => SX.contracts.assertTarget(good));
test('assertTarget rejects missing coordinates', () => throwsCode(() => SX.contracts.assertTarget({ ...good, coordinates: null }), 'bad-response'));
test('assertTarget rejects out-of-range ra', () => throwsCode(() => SX.contracts.assertTarget({ ...good, coordinates: { ra: 400, dec: 0 } }), 'bad-response'));
test('assertTarget accepts localized names', () => SX.contracts.assertTarget({ ...good, name: { en: 'X', ar: 'س' } }));
test('assertObservations validates status', () => throwsCode(() => SX.contracts.assertObservations([{ id: 'a', startTime: '2026-01-01T00:00:00Z', status: 'weird', bands: [], quality: [] }]), 'bad-response'));
test('assertObservations ok', () => SX.contracts.assertObservations([{ id: 'a', startTime: '2026-01-01T00:00:00Z', status: 'observed', bands: [], quality: [] }]));
test('assertImage', () => { SX.contracts.assertImage({ url: 'data:image/png;base64,AA', encoding: 'rgb', width: 1, height: 1 }); throwsCode(() => SX.contracts.assertImage({ url: 'x', encoding: 'jpeg', width: 1, height: 1 }), 'bad-response'); });
test('assertComparison', () => { SX.contracts.assertComparison({ differenceImageUrl: 'u', summary: { changedPixelFraction: 0.1 }, candidates: [] }); throwsCode(() => SX.contracts.assertComparison({ differenceImageUrl: 'u', summary: {}, candidates: [] }), 'bad-response'); });
test('DataError defaults', () => { const e = SX.DataError('network', 'm'); assert.equal(e.retryable, true); assert.equal(SX.DataError('unsupported', 'm').retryable, false); assert.equal(SX.DataError('nonsense', 'm').code, 'unknown'); });

console.log(`${passed} tests passed${process.exitCode ? ', with failures' : ''}.`);
