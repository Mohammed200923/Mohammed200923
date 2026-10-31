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

// Level-2 FLAGS bit numbers (fallback when the FLAGS header has no MP_* keywords).
export const DEFAULT_FLAG_BITS = {
  TRANSIENT: 0, OVERFLOW: 1, SUR_ERROR: 2, PHANTOM: 4, REFERENCE: 5, NONFUNC: 6,
  DICHROIC: 7, MISSING_DATA: 9, HOT: 10, COLD: 11, FULLSAMPLE: 12, PHANMISS: 14,
  NONLINEAR: 15, PERSIST: 17, OUTLIER: 19, SOURCE: 21,
};

// Bits that describe the pixel rather than corrupt it — never masked.
const INFORMATIONAL = new Set(['SOURCE', 'FULLSAMPLE', 'REFERENCE']);

/** Read bit definitions from MP_<NAME> header keywords, falling back to the defaults. */
export function flagBits(flagsHeader) {
  const bits = {};
  if (flagsHeader) {
    for (const [k, v] of Object.entries(flagsHeader)) {
      if (k.startsWith('MP_') && Number.isInteger(v)) bits[k.slice(3)] = v;
    }
  }
  return Object.keys(bits).length ? bits : DEFAULT_FLAG_BITS;
}

export function badPixelMask(flagsHeader) {
  let mask = 0;
  for (const [name, bit] of Object.entries(flagBits(flagsHeader))) {
    if (!INFORMATIONAL.has(name) && bit < 31) mask |= 1 << bit;
  }
  return mask >>> 0;
}

/** Map a wavelength (µm) to an RGB colour, blue (short) → red (long), for plots. */
export function wavelengthColor(wl, alpha = 1) {
  const t = Math.min(1, Math.max(0, (wl - 0.75) / (5.0 - 0.75)));
  const hue = 260 - 260 * t;
  return `hsla(${hue.toFixed(0)}, 80%, 58%, ${alpha})`;
}
