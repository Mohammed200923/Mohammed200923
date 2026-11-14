// Turn raw cutouts into aligned frames: clean (zodi + flags), reproject onto a
// common north-up grid, group into survey visits, and coadd.

import { parseFits, maybeGunzip, spherexPlanes } from './fits.js';
import { Wcs } from './wcs.js';
import { badPixelMask, flagBits } from './spherex.js';

/** Decode one cutout into a cleaned image plus its WCS. */
export async function decodeCutout(buffer, desc, { subtractZodi = true, maskFlags = true } = {}) {
  const hdus = parseFits(await maybeGunzip(buffer));
  const { image, flags, zodi, variance: varHdu, primary } = spherexPlanes(hdus);
  const header = { ...primary.header, ...image.header };
  const wcs = new Wcs(header);
  const data = new Float32Array(image.data);
  const variance = varHdu && varHdu.data.length === data.length ? new Float32Array(varHdu.data) : null;
  let masked = 0;
  if (subtractZodi && zodi && zodi.data.length === data.length) {
    for (let i = 0; i < data.length; i++) data[i] -= zodi.data[i];
  }
  const mask = flags ? badPixelMask(flags.header) : 0;
  // Saturated or non-linear pixels stay in the image (bright stars would vanish otherwise) but
  // are tracked, so measurements that use them can be marked unreliable.
  let saturated = null;
  if (flags && flags.data.length === data.length) {
    const bits = flagBits(flags.header);
    const satMask = ['OVERFLOW', 'NONLINEAR'].reduce((m, k) => (bits[k] !== undefined ? m | (1 << bits[k]) : m), 0) >>> 0;
    if (satMask) {
      saturated = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) if ((flags.data[i] >>> 0) & satMask) saturated[i] = 1;
    }
  }
  if (maskFlags && flags && flags.data.length === data.length) {
    for (let i = 0; i < data.length; i++) {
      if ((flags.data[i] >>> 0) & mask) {
        data[i] = NaN;
        if (variance) variance[i] = NaN;
        masked++;
      }
    }
  }
  return {
    ...desc,
    width: image.width, height: image.height, data, variance, saturated, wcs,
    header, flagNames: flags ? Object.keys(flagBits(flags.header)) : [],
    maskedFraction: masked / data.length,
    zodiSubtracted: Boolean(subtractZodi && zodi),
  };
}

/** Bilinear resample of one plane of a decoded frame (default: the image) onto the target grid. */
export function reproject(frame, grid, data = frame.data) {
  const { n, wcs: gw } = grid;
  const out = new Float32Array(n * n).fill(NaN);
  const { width: w, height: h, wcs } = frame;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const [ra, dec] = gw.pixToWorld(x, y);
      const [px, py] = wcs.worldToPix(ra, dec);
      if (!(px >= 0 && py >= 0 && px <= w - 1 && py <= h - 1)) continue;
      const x0 = Math.min(Math.floor(px), w - 2), y0 = Math.min(Math.floor(py), h - 2);
      const fx = px - x0, fy = py - y0;
      const i = y0 * w + x0;
      const a = data[i], b = data[i + 1], c = data[i + w], d = data[i + w + 1];
      // Nearest-valid fallback keeps edges of masked regions from spreading NaNs.
      if ([a, b, c, d].some(Number.isNaN)) {
        const nx = Math.round(px), ny = Math.round(py);
        out[y * n + x] = data[ny * w + nx];
      } else {
        out[y * n + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
      }
    }
  }
  return out;
}

/**
 * Group frames into survey visits: consecutive frames closer than gapDays share a visit, and a
 * visit is cut after maxSpanDays. The cap matters for Deep Survey fields, which are observed
 * almost continuously and would otherwise collapse into a few months-long "visits".
 */
export function groupVisits(frames, gapDays, maxSpanDays = 30) {
  const sorted = [...frames].sort((a, b) => a.mjd - b.mjd);
  const groups = [];
  for (const f of sorted) {
    const g = groups[groups.length - 1];
    if (g && f.mjd - g.frames[g.frames.length - 1].mjd <= gapDays && f.mjd - g.frames[0].mjd <= maxSpanDays) g.frames.push(f);
    else groups.push({ frames: [f] });
  }
  return groups;
}

/** Mean (or median) of aligned arrays, ignoring NaN. */
export function coadd(arrays, method = 'mean') {
  const n = arrays[0].length;
  const out = new Float32Array(n);
  const buf = new Float32Array(arrays.length);
  for (let i = 0; i < n; i++) {
    let k = 0, s = 0;
    for (const a of arrays) {
      const v = a[i];
      if (!Number.isNaN(v)) { buf[k++] = v; s += v; }
    }
    if (!k) { out[i] = NaN; continue; }
    if (method === 'median') {
      const sub = buf.subarray(0, k).sort();
      out[i] = k % 2 ? sub[(k - 1) / 2] : 0.5 * (sub[k / 2 - 1] + sub[k / 2]);
    } else out[i] = s / k;
  }
  return out;
}

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : 0.5 * (v[m - 1] + v[m]);
}

/**
 * Weighted mean of aligned frames. Each frame gets one weight, 1 / its median pixel variance,
 * so noisy exposures count less. (Per-pixel inverse-variance weights would bias bright
 * sources low, because their own photon noise would down-weight them.)
 * Returns the coadd and its per-pixel variance (NaN where a variance plane is missing).
 */
export function weightedCoadd(frames) {
  const n = frames[0].aligned.length;
  const weights = frames.map((f) => {
    const mv = f.alignedVar ? median(Array.from(f.alignedVar)) : NaN;
    return mv > 0 ? 1 / mv : 1;
  });
  const data = new Float32Array(n), variance = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sw = 0, s = 0, sv = 0, varOk = true;
    frames.forEach((f, k) => {
      const v = f.aligned[i];
      if (Number.isNaN(v)) return;
      const w = weights[k];
      sw += w; s += w * v;
      const vv = f.alignedVar?.[i];
      if (Number.isFinite(vv)) sv += w * w * vv; else varOk = false;
    });
    data[i] = sw ? s / sw : NaN;
    variance[i] = sw && varOk ? sv / (sw * sw) : NaN;
  }
  return { data, variance };
}

/**
 * Build the frames shown in the player.
 * mode 'visit' → one coadd per survey visit; 'exposure' → every exposure.
 */
export function buildSequence(aligned, { mode, gapDays, maxSpanDays = 30 }) {
  if (mode === 'exposure') {
    return aligned.map((f) => ({
      label: f.obsId || f.id, mjd: f.mjd, data: f.aligned, variance: f.alignedVar || null, members: [f],
      wlMin: f.wl, wlMax: f.wl,
    }));
  }
  return groupVisits(aligned, gapDays, maxSpanDays).map((g, i) => {
    const mjds = g.frames.map((f) => f.mjd);
    const wls = g.frames.map((f) => f.wl);
    const { data, variance } = weightedCoadd(g.frames);
    return {
      label: `Visit ${i + 1}`,
      mjd: mjds.reduce((s, v) => s + v, 0) / mjds.length,
      mjdRange: [Math.min(...mjds), Math.max(...mjds)],
      data, variance,
      members: g.frames,
      wlMin: Math.min(...wls), wlMax: Math.max(...wls),
    };
  });
}

/** Robust statistics on a sample of finite values. */
export function percentiles(arrays, ps) {
  const vals = [];
  for (const a of arrays) {
    const step = Math.max(1, Math.floor(a.length / 20000));
    for (let i = 0; i < a.length; i += step) if (Number.isFinite(a[i])) vals.push(a[i]);
  }
  if (!vals.length) return ps.map(() => 0);
  vals.sort((x, y) => x - y);
  return ps.map((p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round((p / 100) * (vals.length - 1))))]);
}

/**
 * Aperture photometry at grid pixel (cx, cy): sum within r minus local median background
 * from an annulus. Returns flux density in mJy given the grid pixel solid angle.
 */
export function aperturePhotometry(data, n, cx, cy, scaleArcsec, r = 2, rin = 4, rout = 7) {
  return measure(data, null, n, cx, cy, scaleArcsec, r, rin, rout).flux;
}

/** True if any pixel inside the aperture is saturated (sat: resampled 0–1 flag plane). */
export function apertureSaturated(sat, n, cx, cy, r = 2) {
  if (!sat) return false;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= n || y >= n || Math.hypot(x - cx, y - cy) > r) continue;
      if (sat[y * n + x] > 0.25) return true;
    }
  }
  return false;
}

/**
 * Aperture photometry with an uncertainty: { flux, err } in mJy. The error combines the
 * pixel variance inside the aperture with the uncertainty of the annulus background.
 */
export function measure(data, variance, n, cx, cy, scaleArcsec, r = 2, rin = 4, rout = 7) {
  const bg = [];
  let sum = 0, npix = 0, varSum = 0, varOk = Boolean(variance);
  for (let y = Math.floor(cy - rout); y <= Math.ceil(cy + rout); y++) {
    for (let x = Math.floor(cx - rout); x <= Math.ceil(cx + rout); x++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const v = data[y * n + x];
      if (!Number.isFinite(v)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) {
        sum += v; npix++;
        const vv = variance?.[y * n + x];
        if (Number.isFinite(vv)) varSum += vv; else varOk = false;
      } else if (d >= rin && d <= rout) bg.push(v);
    }
  }
  if (!npix) return { flux: NaN, err: NaN };
  bg.sort((a, b) => a - b);
  const sky = bg.length ? bg[Math.floor(bg.length / 2)] : 0;
  const omega = (scaleArcsec / 206264.806) ** 2; // sr per pixel
  const toMJy = omega * 1e9; // MJy/sr·sr → mJy
  // Robust scatter of the annulus → uncertainty of the median background.
  const mad = bg.length ? median(bg.map((v) => Math.abs(v - sky))) * 1.4826 : NaN;
  const skyErr = bg.length > 1 ? (1.2533 * mad) / Math.sqrt(bg.length) : NaN;
  const err = varOk ? Math.sqrt(varSum + (npix * skyErr) ** 2) * toMJy : NaN;
  return { flux: (sum - sky * npix) * toMJy, err };
}

/**
 * Brightness of one source relative to its own average spectrum, so exposures at different
 * wavelengths can share one light curve. Each measurement is divided by the median flux of
 * measurements from *other* visits at a similar wavelength (window widened until it finds some).
 * points: [{ wl, flux, err, visit }] → the same points with { rel, relErr }.
 */
export function relativeBrightness(points) {
  const usable = points.filter((q) => !q.saturated);
  return points.map((p) => {
    if (p.saturated) return { ...p, rel: NaN, relErr: NaN };
    for (const frac of [0.08, 0.2, 0.4]) {
      const ref = median(usable
        .filter((q) => q.visit !== p.visit && Math.abs(Math.log(q.wl / p.wl)) <= frac)
        .map((q) => q.flux));
      if (Number.isFinite(ref) && ref > 0) {
        return { ...p, rel: p.flux / ref, relErr: Number.isFinite(p.err) ? p.err / ref : NaN, refWindow: frac };
      }
    }
    return { ...p, rel: NaN, relErr: NaN };
  });
}

/** Per-visit summary of relative brightness: median and its standard error. */
export function visitBrightness(rel) {
  const byVisit = new Map();
  for (const p of rel) {
    if (!Number.isFinite(p.rel)) continue;
    if (!byVisit.has(p.visit)) byVisit.set(p.visit, []);
    byVisit.get(p.visit).push(p);
  }
  return [...byVisit.entries()].map(([visit, ps]) => {
    const m = median(ps.map((p) => p.rel));
    const mad = median(ps.map((p) => Math.abs(p.rel - m))) * 1.4826;
    const fromErrs = Math.sqrt(ps.reduce((s, p) => s + (p.relErr || 0) ** 2, 0)) / ps.length;
    const err = ps.length > 2 ? Math.max((1.2533 * mad) / Math.sqrt(ps.length), fromErrs) : fromErrs || NaN;
    return { visit, mjd: ps.reduce((s, p) => s + p.mjd, 0) / ps.length, rel: m, err, n: ps.length };
  }).sort((a, b) => a.mjd - b.mjd);
}
