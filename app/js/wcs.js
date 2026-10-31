// Celestial WCS for gnomonic (TAN) projections with optional SIP distortion.
// Pixel coordinates in this module are 0-based (FITS pixel = x + 1).

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function sipCoeffs(h, letter) {
  const order = h[`${letter}_ORDER`];
  if (!order) return null;
  const terms = [];
  for (let p = 0; p <= order; p++) {
    for (let q = 0; q <= order - p; q++) {
      const c = h[`${letter}_${p}_${q}`];
      if (c) terms.push([p, q, c]);
    }
  }
  return terms.length ? terms : null;
}

function evalSip(terms, u, v) {
  if (!terms) return 0;
  let s = 0;
  for (const [p, q, c] of terms) s += c * u ** p * v ** q;
  return s;
}

export class Wcs {
  constructor(h) {
    const ctype1 = String(h.CTYPE1 || '');
    if (!ctype1.includes('TAN')) throw new Error(`Unsupported projection ${ctype1 || '(none)'}`);
    this.crpix = [h.CRPIX1, h.CRPIX2];
    this.crval = [h.CRVAL1, h.CRVAL2];
    let cd;
    if (h.CD1_1 !== undefined || h.CD2_2 !== undefined) {
      cd = [[h.CD1_1 || 0, h.CD1_2 || 0], [h.CD2_1 || 0, h.CD2_2 || 0]];
    } else {
      const c1 = h.CDELT1 ?? 1, c2 = h.CDELT2 ?? 1;
      let pc = [[h.PC1_1 ?? 1, h.PC1_2 ?? 0], [h.PC2_1 ?? 0, h.PC2_2 ?? 1]];
      if (h.PC1_1 === undefined && h.CROTA2) {
        const r = h.CROTA2 * D2R;
        pc = [[Math.cos(r), -Math.sin(r) * (c2 / c1)], [Math.sin(r) * (c1 / c2), Math.cos(r)]];
      }
      cd = [[c1 * pc[0][0], c1 * pc[0][1]], [c2 * pc[1][0], c2 * pc[1][1]]];
    }
    this.cd = cd;
    const det = cd[0][0] * cd[1][1] - cd[0][1] * cd[1][0];
    if (!det) throw new Error('Singular WCS matrix');
    this.cdInv = [[cd[1][1] / det, -cd[0][1] / det], [-cd[1][0] / det, cd[0][0] / det]];
    this.sipA = String(h.CTYPE1).includes('SIP') ? sipCoeffs(h, 'A') : null;
    this.sipB = String(h.CTYPE2).includes('SIP') ? sipCoeffs(h, 'B') : null;
    this.pixelScaleArcsec = Math.sqrt(Math.abs(det)) * 3600;
  }

  pixToWorld(x, y) {
    let u = x + 1 - this.crpix[0];
    let v = y + 1 - this.crpix[1];
    const du = evalSip(this.sipA, u, v), dv = evalSip(this.sipB, u, v);
    u += du; v += dv;
    const xi = (this.cd[0][0] * u + this.cd[0][1] * v) * D2R;
    const eta = (this.cd[1][0] * u + this.cd[1][1] * v) * D2R;
    const ra0 = this.crval[0] * D2R, dec0 = this.crval[1] * D2R;
    const denom = Math.cos(dec0) - eta * Math.sin(dec0);
    const ra = ra0 + Math.atan2(xi, denom);
    const dec = Math.atan2(Math.sin(dec0) + eta * Math.cos(dec0), Math.hypot(xi, denom));
    return [((ra * R2D) % 360 + 360) % 360, dec * R2D];
  }

  worldToPix(raDeg, decDeg) {
    const ra = raDeg * D2R, dec = decDeg * D2R;
    const ra0 = this.crval[0] * D2R, dec0 = this.crval[1] * D2R;
    const cosc = Math.sin(dec0) * Math.sin(dec) + Math.cos(dec0) * Math.cos(dec) * Math.cos(ra - ra0);
    if (cosc <= 0) return [NaN, NaN];
    const xi = (Math.cos(dec) * Math.sin(ra - ra0)) / cosc * R2D;
    const eta = (Math.cos(dec0) * Math.sin(dec) - Math.sin(dec0) * Math.cos(dec) * Math.cos(ra - ra0)) / cosc * R2D;
    const up = this.cdInv[0][0] * xi + this.cdInv[0][1] * eta;
    const vp = this.cdInv[1][0] * xi + this.cdInv[1][1] * eta;
    let u = up, v = vp;
    if (this.sipA || this.sipB) {
      // Fixed-point inversion of the forward SIP polynomial; converges fast for small distortions.
      for (let i = 0; i < 20; i++) {
        const nu = up - evalSip(this.sipA, u, v);
        const nv = vp - evalSip(this.sipB, u, v);
        const done = Math.abs(nu - u) < 1e-8 && Math.abs(nv - v) < 1e-8;
        u = nu; v = nv;
        if (done) break;
      }
    }
    return [u + this.crpix[0] - 1, v + this.crpix[1] - 1];
  }
}

/** A north-up, east-left TAN grid centred on (ra, dec). */
export function makeGrid(ra, dec, sizeArcmin, scaleArcsec) {
  const n = Math.max(8, Math.round((sizeArcmin * 60) / scaleArcsec));
  const header = {
    CTYPE1: 'RA---TAN', CTYPE2: 'DEC--TAN',
    CRVAL1: ra, CRVAL2: dec,
    CRPIX1: (n + 1) / 2, CRPIX2: (n + 1) / 2,
    CD1_1: -scaleArcsec / 3600, CD1_2: 0, CD2_1: 0, CD2_2: scaleArcsec / 3600,
  };
  return { n, scaleArcsec, wcs: new Wcs(header), header };
}

/** Angular separation in arcsec. */
export function separationArcsec(ra1, dec1, ra2, dec2) {
  const a = Math.sin(((dec2 - dec1) * D2R) / 2) ** 2 +
    Math.cos(dec1 * D2R) * Math.cos(dec2 * D2R) * Math.sin(((ra2 - ra1) * D2R) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * R2D * 3600;
}

/** Linear proper-motion propagation. pm in mas/yr (pmra includes cos(dec)). */
export function propagate(ra, dec, pmra, pmdec, fromYear, toYear) {
  const dt = toYear - fromYear;
  const dDec = (pmdec * dt) / 3.6e6;
  const dRa = (pmra * dt) / 3.6e6 / Math.cos(dec * D2R);
  return [((ra + dRa) % 360 + 360) % 360, dec + dDec];
}

export function mjdToYear(mjd) {
  return 2000 + (mjd - 51544.5) / 365.25;
}

export function mjdToDate(mjd) {
  return new Date((mjd - 40587) * 86400000);
}

// ---- coordinate parsing/formatting ----

export function parseCoordinates(text) {
  const t = text.trim().replace(/,/g, ' ');
  if (!t) return null;
  // Decimal degrees: "269.45 4.69"
  const dec = t.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:d|deg|°)?\s+([+-]?\d+(?:\.\d+)?)\s*(?:d|deg|°)?$/i);
  if (dec) return { ra: Number(dec[1]), dec: Number(dec[2]) };
  // Sexagesimal: "08h55m10.831s -7d14m42.53s" or "08 55 10.8 -07 14 42.5" or "08:55:10.8 -07:14:42.5"
  const parts = t.replace(/[hHdDmMsS:°'"′″]/g, ' ').trim().split(/\s+/);
  if (parts.length === 6) {
    const [h, m, s, d, dm, ds] = parts;
    const sign = d.trim().startsWith('-') ? -1 : 1;
    const ra = 15 * (Math.abs(+h) + +m / 60 + +s / 3600);
    const de = sign * (Math.abs(+d) + +dm / 60 + +ds / 3600);
    if ([ra, de].every(Number.isFinite)) return { ra, dec: de };
  }
  return null;
}

export function formatRa(ra) {
  let s = (((ra % 360) + 360) % 360) / 15;
  const h = Math.floor(s); s = (s - h) * 60;
  const m = Math.floor(s); s = (s - m) * 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}m${s.toFixed(2).padStart(5, '0')}s`;
}

export function formatDec(dec) {
  const sign = dec < 0 ? '-' : '+';
  let s = Math.abs(dec);
  const d = Math.floor(s); s = (s - d) * 60;
  const m = Math.floor(s); s = (s - m) * 60;
  return `${sign}${String(d).padStart(2, '0')}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″`;
}
