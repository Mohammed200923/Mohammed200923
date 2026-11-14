// The SkyShift engine without a user interface: load one sky field from NASA's archives and
// return everything an interface needs. Used by the SPHEREx Explorer / Immersive front ends
// (spherex-explorer/js/data/providers/skyshift.js); the original SkyShift page (main.js) runs
// the same steps with its own controls.
//
//   const f = await loadField({ ra, dec, sizeArcmin, wmin, wmax, max, target, onProgress });
//   f.visits      SPHEREx survey visits: stacked, aligned frames + their exposures
//   f.wise        AllWISE 2010 + NEOWISE 2014–2024 W2 frames on the same grid
//   f.movers      moving objects found, with 16-year motions and catalogue matches
//   f.grid        the north-up 6.15″/px grid all frames share

import { irsaProvider } from './providers/irsa.js';
import { allwiseCutout, catwiseCone, neowiseFrames, neowiseVisits, neowiseCutout, CATWISE_EPOCH } from './providers/wise.js';
import { gaiaCone } from './catalogs.js';
import { decodeCutout, reproject, buildSequence, percentiles, coadd } from './stack.js';
import { findMovers, addEpoch, toProperMotion } from './movers.js';
import { makeGrid, propagate, mjdToYear, mjdToDate, separationArcsec } from './wcs.js';
import { wavelengthAt, PIXEL_SCALE_ARCSEC } from './spherex.js';
import { pool } from './net.js';

const D2Y = (mjd) => mjdToYear(mjd);

function evenlySample(list, max) {
  if (list.length <= max) return list;
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.round((i * (list.length - 1)) / (max - 1 || 1))]);
  return [...new Set(out)];
}

/** SPHEREx images covering a spot (archive search only, a few seconds): descriptors + visit groups. */
export async function searchField({ ra, dec, wmin = 0.75, wmax = 5, max = 36, gapDays = 20 }) {
  const all = await irsaProvider.search({ ra, dec });
  const matching = all.filter((d) => d.wlMax >= wmin && d.wlMin <= wmax);
  const sample = evenlySample(matching, max);
  // Group the sample into survey visits by time, exactly as the stacks will be grouped.
  const visits = buildSequence(sample.map((d) => ({ ...d, aligned: new Float32Array(0) })), { mode: 'visit', gapDays })
    .map((v) => ({ mjd: v.mjd, mjdRange: v.mjdRange, members: v.members, wlMin: v.wlMin, wlMax: v.wlMax }));
  return { total: all.length, matching: matching.length, sample, visits };
}

/** Download, clean, align and stack the sampled SPHEREx exposures. */
async function loadSpherex(grid, sample, { ra, dec, sizeArcmin, gapDays, onProgress }) {
  const sizeDeg = (sizeArcmin / 60) * 1.45;
  const loadOne = async (desc) => {
    const buf = await irsaProvider.fetchCutout(desc, { ra, dec, sizeDeg });
    const frame = await decodeCutout(buf, desc, { subtractZodi: true, maskFlags: true });
    frame.aligned = reproject(frame, grid);
    frame.alignedVar = frame.variance ? reproject(frame, grid, frame.variance) : null;
    frame.alignedSat = frame.saturated ? reproject(frame, grid, frame.saturated) : null;
    const table = await irsaProvider.waveTable(desc, { ra, dec }).catch(() => null);
    if (table) {
      const [px, py] = frame.wcs.worldToPix(ra, dec);
      frame.wl = wavelengthAt(table, frame.header, px, py)?.[0] ?? frame.wl;
    }
    return frame;
  };
  let results = await pool(sample, irsaProvider.concurrency || 4, loadOne, (d, t) => onProgress?.('spherex', d / t));
  const retry = results.map((r, i) => (r?.error ? i : -1)).filter((i) => i >= 0);
  if (retry.length) {
    const again = await pool(retry.map((i) => sample[i]), 1, loadOne);
    retry.forEach((i, j) => { results[i] = again[j]; });
  }
  const frames = results.filter((r) => r && !r.error);
  if (!frames.length) throw results.find((r) => r?.error)?.error || new Error('No SPHEREx images could be loaded');
  return { frames, visits: buildSequence(frames, { mode: 'visit', gapDays }), failed: results.length - frames.length };
}

/** AllWISE 2010 + NEOWISE 2014–2024 (W2) on the grid. Failures are reported, not thrown. */
async function loadWiseFrames(grid, { ra, dec, sizeArcmin }) {
  const sizeDeg = (sizeArcmin / 60) * 1.45;
  const problems = [];
  const allwise = allwiseCutout(ra, dec, sizeDeg).then((cut) => {
    const data = reproject({ ...cut }, grid);
    const [lo, hi] = percentiles([data], [1, 99.7]);
    return { instrument: 'WISE', label: 'AllWISE 2010', mjd: cut.mjd, mjdRange: cut.mjdRange, data, stats: { lo, hi }, id: cut.id, stacked: 1 };
  }).catch((e) => { problems.push(`AllWISE: ${e.message}`); return null; });
  const neowise = (async () => {
    const visits = neowiseVisits(await neowiseFrames(ra, dec), 5);
    const jobs = visits.flatMap((v, vi) => v.frames.map((f) => ({ f, vi })));
    const done = await pool(jobs, 6, async ({ f }) => {
      const data = reproject({ ...(await neowiseCutout(f.url, ra, dec, sizeDeg)) }, grid);
      const [bg] = percentiles([data], [50]);
      for (let i = 0; i < data.length; i++) data[i] -= bg;
      return data;
    });
    return visits.map((v, vi) => {
      const arrays = jobs.map((j, k) => (j.vi === vi && done[k] && !done[k].error ? done[k] : null)).filter(Boolean);
      if (!arrays.length) return null;
      const data = coadd(arrays, 'median');
      const [lo, hi] = percentiles([data], [1, 99.7]);
      return {
        instrument: 'NEOWISE', label: `NEOWISE ${mjdToDate(v.mjd).toISOString().slice(0, 7)}`, mjd: v.mjd,
        mjdRange: [v.frames[0].mjd, v.frames[v.frames.length - 1].mjd], data, stats: { lo, hi },
        stacked: arrays.length, available: v.available, id: `${arrays.length} of ${v.available} NEOWISE W2 exposures`,
      };
    }).filter(Boolean);
  })().catch((e) => { problems.push(`NEOWISE: ${e.message}`); return []; });
  const [a, n] = await Promise.all([allwise, neowise]);
  return { frames: [a, ...n].filter(Boolean).sort((x, y) => x.mjd - y.mjd), allwise: a, neowise: n, problems };
}

/** Is this mover a known star (Gaia DR3), a known WISE source (CatWISE2020), or neither? */
function classify(grid, catalogs, ra, dec, year, pm) {
  const radius = 2.5 * grid.scaleArcsec, tolerance = Math.max(0.6, 3 * pm.err);
  const match = (list, epoch) => {
    let best = null, bestDiff = Infinity;
    for (const g of list || []) {
      const [gr, gd] = propagate(g.ra, g.dec, g.pmra, g.pmdec, epoch, year);
      if (separationArcsec(ra, dec, gr, gd) > radius) continue;
      const diff = Math.hypot(g.pmra / 1000 - pm.pmra, g.pmdec / 1000 - pm.pmdec);
      if (diff < bestDiff) { bestDiff = diff; best = g; }
    }
    return best && bestDiff <= tolerance ? best : null;
  };
  const g = match(catalogs.gaia, 2016.0);
  if (g) return { kind: 'gaia', id: g.id, total: Math.hypot(g.pmra, g.pmdec) / 1000 };
  const c = match(catalogs.catwise, CATWISE_EPOCH);
  if (c) return { kind: 'catwise', id: c.id, total: Math.hypot(c.pmra, c.pmdec) / 1000 };
  return { kind: catalogs.gaia || catalogs.catwise ? 'none' : 'unchecked' };
}

/** Moving objects: SPHEREx visits, then every WISE epoch (AllWISE first), as in the SkyShift page. */
function searchMovers(grid, visits, wise, catalogs, target) {
  if (visits.length < 2) return [];
  const epochsAll = wise.frames;
  const { movers, possible, anchorSources } = findMovers(visits, grid.n, epochsAll.length ? { possibleSignificance: 3 } : {});
  const spherexYear = visits.reduce((a, v) => a + D2Y(v.mjd), 0) / visits.length;
  const epochs = [wise.allwise, ...[...wise.neowise].sort((a, b) => Math.abs(D2Y(b.mjd) - spherexYear) - Math.abs(D2Y(a.mjd) - spherexYear))].filter(Boolean);
  const tiers = [...movers.slice(0, 8).map((m) => [m, 'confident']), ...possible.slice(0, 5).map((m) => [m, 'possible'])];
  return tiers.map(([found, tier]) => {
    const before = toProperMotion(found, grid.scaleArcsec);
    if (!epochs.length) return { m: found, tier, wise: null };
    let fit = found, matched = 0;
    const years = [];
    for (const e of epochs) {
      const r = addEpoch(fit, e.data, grid.n, D2Y(e.mjd), anchorSources, { floor: 0.5 });
      if (r.fit) { fit = r.fit; matched++; years.push(D2Y(e.mjd)); }
    }
    if (matched >= Math.min(2, epochs.length) && fit.significance >= 5) {
      return { m: fit, tier: 'confident', wise: { epochs: matched, of: epochs.length, first: Math.min(...years), before } };
    }
    return tier === 'possible' ? null : { m: found, tier, wise: { epochs: 0, of: epochs.length, before } };
  }).filter(Boolean).map(({ m, tier, wise: w }, i) => {
    const pm = toProperMotion(m, grid.scaleArcsec);
    const [ra, dec] = grid.wcs.pixToWorld(m.x0, m.y0);
    let isTarget = false;
    if (target && (target.pmra || target.pmdec)) {
      const [tr, td] = propagate(target.ra, target.dec, target.pmra, target.pmdec, target.epoch ?? 2000, m.t0);
      isTarget = separationArcsec(ra, dec, tr, td) < 2.5 * grid.scaleArcsec;
    }
    return { ...m, ...pm, ra, dec, n: i + 1, tier, wise: w, isTarget, catalog: classify(grid, catalogs, ra, dec, m.t0, pm) };
  });
}

/**
 * Load a whole field. target (optional): { name, ra, dec, epoch, pmra, pmdec } for labelling
 * the target's own motion. Never throws for the WISE / catalogue parts; their problems are listed.
 */
export async function loadField({ ra, dec, sizeArcmin = 6, wmin = 0.75, wmax = 5, max = 36, gapDays = 20, target = null, search = null, onProgress, onSpherex }) {
  const grid = makeGrid(ra, dec, sizeArcmin, PIXEL_SCALE_ARCSEC);
  const found = search || await searchField({ ra, dec, wmin, wmax, max, gapDays });
  if (!found.sample.length) return { grid, visits: [], frames: [], wise: { frames: [], neowise: [], allwise: null, problems: [] }, movers: [], catalogs: {}, search: found, problems: [] };
  const radiusArcsec = grid.n * grid.scaleArcsec * 0.75;
  const [spx, wise, gaia, catwise] = await Promise.all([
    // onSpherex lets a caller show the SPHEREx frames while WISE (2010–2024) is still downloading.
    loadSpherex(grid, found.sample, { ra, dec, sizeArcmin, gapDays, onProgress }).then((spx) => {
      onSpherex?.({ grid, visits: spx.visits, frames: spx.frames, failed: spx.failed, wise: { frames: [], neowise: [], allwise: null, problems: [] }, movers: [], catalogs: {}, search: found, problems: [], partial: true });
      return spx;
    }),
    loadWiseFrames(grid, { ra, dec, sizeArcmin }),
    gaiaCone(ra, dec, radiusArcsec).catch(() => null),
    catwiseCone(ra, dec, radiusArcsec / 3600).catch(() => null),
  ]);
  const catalogs = { gaia, catwise };
  const movers = searchMovers(grid, spx.visits, wise, catalogs, target);
  const problems = [...wise.problems, ...(gaia ? [] : ['Gaia DR3 unavailable']), ...(catwise ? [] : ['CatWISE2020 unavailable'])];
  return { grid, visits: spx.visits, frames: spx.frames, failed: spx.failed, wise, movers, catalogs, search: found, problems };
}
