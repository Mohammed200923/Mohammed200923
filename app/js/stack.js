// Turn raw cutouts into aligned frames: clean (zodi + flags), reproject onto a
// common north-up grid, group into survey visits, and coadd.

import { parseFits, maybeGunzip, spherexPlanes } from './fits.js';
import { Wcs } from './wcs.js';
import { badPixelMask, flagBits } from './spherex.js';

/** Decode one cutout into a cleaned image plus its WCS. */
export async function decodeCutout(buffer, desc, { subtractZodi = true, maskFlags = true } = {}) {
  const hdus = parseFits(await maybeGunzip(buffer));
  const { image, flags, zodi, primary } = spherexPlanes(hdus);
  const header = { ...primary.header, ...image.header };
  const wcs = new Wcs(header);
  const data = new Float32Array(image.data);
  let masked = 0;
  if (subtractZodi && zodi && zodi.data.length === data.length) {
    for (let i = 0; i < data.length; i++) data[i] -= zodi.data[i];
  }
  const mask = flags ? badPixelMask(flags.header) : 0;
  if (maskFlags && flags && flags.data.length === data.length) {
    for (let i = 0; i < data.length; i++) {
      if ((flags.data[i] >>> 0) & mask) { data[i] = NaN; masked++; }
    }
  }
  return {
    ...desc,
    width: image.width, height: image.height, data, wcs,
    header, flagNames: flags ? Object.keys(flagBits(flags.header)) : [],
    maskedFraction: masked / data.length,
    zodiSubtracted: Boolean(subtractZodi && zodi),
  };
}

/** Bilinear resample of a decoded frame onto the target grid. */
export function reproject(frame, grid) {
  const { n, wcs: gw } = grid;
  const out = new Float32Array(n * n).fill(NaN);
  const { width: w, height: h, data, wcs } = frame;
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

/** Group frames into survey visits: consecutive frames closer than gapDays share a visit. */
export function groupVisits(frames, gapDays) {
  const sorted = [...frames].sort((a, b) => a.mjd - b.mjd);
  const groups = [];
  for (const f of sorted) {
    const g = groups[groups.length - 1];
    if (g && f.mjd - g.frames[g.frames.length - 1].mjd <= gapDays) g.frames.push(f);
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

/**
 * Build the frames shown in the player.
 * mode 'visit' → one coadd per survey visit; 'exposure' → every exposure.
 */
export function buildSequence(aligned, { mode, gapDays }) {
  if (mode === 'exposure') {
    return aligned.map((f) => ({
      label: f.obsId || f.id, mjd: f.mjd, data: f.aligned, members: [f],
      wlMin: f.wl, wlMax: f.wl,
    }));
  }
  return groupVisits(aligned, gapDays).map((g, i) => {
    const mjds = g.frames.map((f) => f.mjd);
    const wls = g.frames.map((f) => f.wl);
    return {
      label: `Visit ${i + 1}`,
      mjd: mjds.reduce((s, v) => s + v, 0) / mjds.length,
      mjdRange: [Math.min(...mjds), Math.max(...mjds)],
      data: coadd(g.frames.map((f) => f.aligned), 'mean'),
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
  const bg = [];
  let sum = 0, npix = 0;
  for (let y = Math.floor(cy - rout); y <= Math.ceil(cy + rout); y++) {
    for (let x = Math.floor(cx - rout); x <= Math.ceil(cx + rout); x++) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const v = data[y * n + x];
      if (!Number.isFinite(v)) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) { sum += v; npix++; } else if (d >= rin && d <= rout) bg.push(v);
    }
  }
  if (!npix) return NaN;
  bg.sort((a, b) => a - b);
  const sky = bg.length ? bg[Math.floor(bg.length / 2)] : 0;
  const omega = (scaleArcsec / 206264.806) ** 2; // sr per pixel
  return (sum - sky * npix) * omega * 1e9; // MJy/sr·sr → mJy
}
