// SPHEREx instrument facts used across the app.

// Approximate wavelength coverage (µm) of the six detector arrays.
export const DETECTORS = [
  { id: 1, min: 0.75, max: 1.09 },
  { id: 2, min: 1.10, max: 1.62 },
  { id: 3, min: 1.63, max: 2.41 },
  { id: 4, min: 2.42, max: 3.82 },
  { id: 5, min: 3.83, max: 4.41 },
  { id: 6, min: 4.42, max: 5.00 },
];

export const PIXEL_SCALE_ARCSEC = 6.15;

export function detectorFromWavelength(wl) {
  const d = DETECTORS.find((d) => wl >= d.min && wl <= d.max + 0.005);
  return d ? d.id : (wl < 0.75 ? 1 : 6);
}

// Level-2 FLAGS bit numbers, as named by the MSKNnnnn keywords in real SPHEREx cutouts
// (used when a FLAGS header carries no names).
export const DEFAULT_FLAG_BITS = {
  TRANSIENT: 0, OVERFLOW: 1, SUR_ERROR: 2, NONFUNC: 6, DICHROIC: 7, MISSING_DATA: 9,
  HOT: 10, COLD: 11, FULLSAMPLE: 12, PHANMISS: 14, NONLINEAR: 15, PERSIST: 17, OUTLIER: 19,
  CROSSTALK: 20, SOURCE: 21, GHOST: 22, GHOST_FPA: 23, GHOST_EXT: 24, STREAK: 25,
  BLOOM: 26, SNOWBALL: 27, HALO: 28,
};

// Only instrument artifacts are masked. Bright stars carry OVERFLOW / SUR_ERROR / BLOOM /
// NONLINEAR / HALO, and moving objects can be flagged TRANSIENT, so masking those would
// erase exactly the sources this tool is for.
const ARTIFACTS = new Set([
  'NONFUNC', 'DICHROIC', 'MISSING_DATA', 'HOT', 'COLD', 'PERSIST', 'OUTLIER',
  'CROSSTALK', 'GHOST', 'GHOST_FPA', 'GHOST_EXT', 'STREAK', 'SNOWBALL',
]);

/** Bit definitions from MSKNnnnn (SPHEREx) or MP_<NAME> keywords, else the defaults. */
export function flagBits(flagsHeader) {
  const bits = {};
  if (flagsHeader) {
    for (const [k, v] of Object.entries(flagsHeader)) {
      const m = k.match(/^MSKN(\d+)$/);
      if (m && typeof v === 'string') bits[v.trim()] = Number(m[1]);
      else if (k.startsWith('MP_') && Number.isInteger(v)) bits[k.slice(3)] = v;
    }
  }
  return Object.keys(bits).length ? bits : DEFAULT_FLAG_BITS;
}

export function badPixelMask(flagsHeader) {
  let mask = 0;
  for (const [name, bit] of Object.entries(flagBits(flagsHeader))) {
    if (ARTIFACTS.has(name) && bit < 31) mask |= 1 << bit;
  }
  return mask >>> 0;
}

function interpIndex(knots, v) {
  // Fractional position of v in an increasing knot vector (clamped to its ends).
  if (v <= knots[0]) return 0;
  const n = knots.length;
  if (v >= knots[n - 1]) return n - 1;
  let i = 0;
  while (knots[i + 1] < v) i++;
  return i + (v - knots[i]) / (knots[i + 1] - knots[i]);
}

/**
 * Wavelength and bandwidth (µm) at 0-based pixel (x, y) of a SPHEREx image, from the
 * alternate "W" WCS: a WAVE-TAB bilinear lookup (FITS Paper III) on raw detector coordinates.
 * `table` is the decoded WCS-WAVE row (X, Y, VALUES); the same table serves every exposure
 * from a given detector, so it can come from a different cutout than `header`.
 */
export function wavelengthAt(table, header, x, y) {
  if (!table || header.CRPIX1W === undefined) return null;
  const psi1 = (header.CDELT1W ?? 1) * (x + 1 - header.CRPIX1W) + (header.CRVAL1W ?? 1);
  const psi2 = (header.CDELT2W ?? 1) * (y + 1 - header.CRPIX2W) + (header.CRVAL2W ?? 1);
  const X = table.X, Y = table.Y, V = table.VALUES;
  const nx = X.length, ny = Y.length, nv = V.length / (nx * ny);
  const fx = interpIndex(X, psi1), fy = interpIndex(Y, psi2);
  const ix = Math.min(nx - 2, Math.floor(fx)), iy = Math.min(ny - 2, Math.floor(fy));
  const tx = fx - ix, ty = fy - iy;
  const at = (i, j, k) => V[k + nv * (i + nx * j)];
  const out = [];
  for (let k = 0; k < nv; k++) {
    out.push(at(ix, iy, k) * (1 - tx) * (1 - ty) + at(ix + 1, iy, k) * tx * (1 - ty) +
      at(ix, iy + 1, k) * (1 - tx) * ty + at(ix + 1, iy + 1, k) * tx * ty);
  }
  return out;
}

/** Map a wavelength (µm) to an RGB colour, blue (short) → red (long), for plots. */
export function wavelengthColor(wl, alpha = 1) {
  const t = Math.min(1, Math.max(0, (wl - 0.75) / (5.0 - 0.75)));
  const hue = 260 - 260 * t;
  return `hsla(${hue.toFixed(0)}, 80%, 58%, ${alpha})`;
}
