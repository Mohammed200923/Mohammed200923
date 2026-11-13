// Simulated SPHEREx-like data: real FITS bytes with TAN-SIP WCS, FLAGS and ZODI planes.
// Used for offline demos and automated tests. Every frame is watermarked "SIMULATED".

import { writeFits } from '../fits.js';
import { propagate, mjdToYear } from '../wcs.js';
import { DETECTORS, PIXEL_SCALE_ARCSEC } from '../spherex.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
}

// Survey visits: roughly every six months since the May 2025 start.
const EPOCHS = [60812.2, 60995.6, 61178.9, 61340.4];
const EXPOSURES_PER_EPOCH = 14;

function buildScene(ra, dec, target) {
  const rand = rng(Math.round(ra * 1000) * 31 + Math.round(dec * 1000));
  const stars = [];
  for (let i = 0; i < 140; i++) {
    const r = 0.2 * Math.sqrt(rand()), th = 2 * Math.PI * rand();
    stars.push({
      ra: ra + (r * Math.cos(th)) / Math.cos((dec * Math.PI) / 180),
      dec: dec + r * Math.sin(th),
      amp: 0.08 * Math.exp(4 * rand()),
      slope: -1.5 + 3 * rand(),
      pmra: gauss(rand) * 8, pmdec: gauss(rand) * 8,
    });
  }
  // A cool, fast-moving brown-dwarf-like source at the target position.
  const mover = {
    ra, dec, epochYear: 2026.0, // the field is centred on the target's 2026.0 position
    pmra: target?.pmra || -2400, pmdec: target?.pmdec || 9600,
    kind: 'brown-dwarf',
  };
  // A pulsating variable star offset to the north-east.
  const variable = { ra: ra + 0.012 / Math.cos((dec * Math.PI) / 180), dec: dec + 0.01, amp: 3, period: 285 };
  return { stars, mover, variable };
}

function moverSpectrum(wl) {
  // Rises toward 4.5 µm with a methane dip near 3.3 µm.
  return 0.25 + 3.2 * Math.exp(-(((wl - 4.4) / 0.55) ** 2)) - 0.18 * Math.exp(-(((wl - 3.3) / 0.15) ** 2)) + 0.05 * wl;
}

export const simulatedProvider = {
  id: 'sim',
  label: 'Simulated demo data',
  simulated: true,

  async search({ ra, dec, target }) {
    const rand = rng(Math.round(ra * 7919) ^ Math.round(dec * 104729));
    const list = [];
    EPOCHS.forEach((mjd0, e) => {
      const rot = e * 91 + 12 * rand();
      for (let i = 0; i < EXPOSURES_PER_EPOCH; i++) {
        const det = DETECTORS[i % 6];
        const wl = det.min + (det.max - det.min) * rand();
        const mjd = mjd0 + i * 0.27 + rand() * 0.05;
        list.push({
          id: `sim-e${e}-x${i}`, obsId: `SIM_${e}_${String(i).padStart(2, '0')}_D${det.id}`,
          url: '', mjd, mjdEnd: mjd + 0.001,
          wlMin: wl - 0.01, wlMax: wl + 0.01, wl, detector: det.id,
          rotation: rot, seed: Math.floor(rand() * 1e9),
          meta: { simulated: true },
        });
      }
    });
    this._scene = buildScene(ra, dec, target);
    this._center = [ra, dec];
    return list;
  },

  async fetchCutout(desc, { ra, dec, sizeDeg }) {
    const scene = this._scene || buildScene(ra, dec, null);
    const rand = rng(desc.seed);
    const scale = PIXEL_SCALE_ARCSEC / 3600;
    const n = Math.max(16, Math.round(sizeDeg / scale));
    const rot = (desc.rotation * Math.PI) / 180;
    const cd = [[-scale * Math.cos(rot), scale * Math.sin(rot)], [scale * Math.sin(rot), scale * Math.cos(rot)]];
    // Pointing jitter so frames are not on the same pixel grid.
    const crpix = [(n + 1) / 2 + rand() - 0.5, (n + 1) / 2 + rand() - 0.5];
    const sip = { A_2_0: 2e-6, A_0_2: -1e-6, B_1_1: 1.5e-6 };
    const header = [
      ['EXTNAME', 'IMAGE'], ['BUNIT', 'MJy/sr'],
      ['CTYPE1', 'RA---TAN-SIP'], ['CTYPE2', 'DEC--TAN-SIP'],
      ['CRVAL1', ra], ['CRVAL2', dec], ['CRPIX1', crpix[0]], ['CRPIX2', crpix[1]],
      ['CD1_1', cd[0][0]], ['CD1_2', cd[0][1]], ['CD2_1', cd[1][0]], ['CD2_2', cd[1][1]],
      ['A_ORDER', 2], ['B_ORDER', 2],
      ...Object.entries(sip).map(([k, v]) => [k, v]),
      ['MJD-OBS', desc.mjd], ['DETECTOR', desc.detector], ['CWAVE', desc.wl, 'approx central wavelength (um)'],
      ['ORIGIN', 'SkyShift SIMULATION'],
    ];
    // Local helper using the same maths as Wcs.worldToPix (without SIP for speed — SIP terms are tiny).
    const cdDet = cd[0][0] * cd[1][1] - cd[0][1] * cd[1][0];
    const inv = [[cd[1][1] / cdDet, -cd[0][1] / cdDet], [-cd[1][0] / cdDet, cd[0][0] / cdDet]];
    const D2R = Math.PI / 180;
    const toPix = (r, d) => {
      const ra0 = ra * D2R, dec0 = dec * D2R, a = r * D2R, b = d * D2R;
      const cosc = Math.sin(dec0) * Math.sin(b) + Math.cos(dec0) * Math.cos(b) * Math.cos(a - ra0);
      const xi = (Math.cos(b) * Math.sin(a - ra0)) / cosc / D2R;
      const eta = (Math.cos(dec0) * Math.sin(b) - Math.sin(dec0) * Math.cos(b) * Math.cos(a - ra0)) / cosc / D2R;
      let u = inv[0][0] * xi + inv[0][1] * eta, v = inv[1][0] * xi + inv[1][1] * eta;
      for (let i = 0; i < 5; i++) {
        const up = inv[0][0] * xi + inv[0][1] * eta, vp = inv[1][0] * xi + inv[1][1] * eta;
        u = up - (sip.A_2_0 * u * u + sip.A_0_2 * v * v);
        v = vp - sip.B_1_1 * u * v;
      }
      return [u + crpix[0] - 1, v + crpix[1] - 1];
    };

    const year = mjdToYear(desc.mjd);
    const wl = desc.wl;
    const sigma = 0.75 + 0.12 * wl;
    const img = new Float32Array(n * n);
    const zodi = new Float32Array(n * n);
    const flags = new Int32Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const z = 0.15 + 0.12 * wl + 0.02 * (x / n) + 0.01 * Math.sin(desc.mjd / 30);
        zodi[y * n + x] = z;
        img[y * n + x] = z + 0.015 * gauss(rand);
      }
    }
    const addSource = (px, py, amp, srcFlag = true) => {
      const r = Math.ceil(4 * sigma);
      for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(n - 1, Math.ceil(py + r)); y++) {
        for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(n - 1, Math.ceil(px + r)); x++) {
          const v = amp * Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * sigma * sigma));
          img[y * n + x] += v;
          if (srcFlag && v > 0.05) flags[y * n + x] |= 1 << 21;
        }
      }
    };
    for (const s of scene.stars) {
      const [r, d] = propagate(s.ra, s.dec, s.pmra, s.pmdec, 2016, year);
      const [px, py] = toPix(r, d);
      addSource(px, py, s.amp * wl ** s.slope);
    }
    const m = scene.mover;
    const [mr, md] = propagate(m.ra, m.dec, m.pmra, m.pmdec, m.epochYear, year);
    const [mx, my] = toPix(mr, md);
    addSource(mx, my, moverSpectrum(wl));
    const v = scene.variable;
    const [vx, vy] = toPix(v.ra, v.dec);
    addSource(vx, vy, v.amp * (1 + 0.8 * Math.sin((2 * Math.PI * desc.mjd) / v.period)) * wl ** -0.5);
    // A main-belt-like asteroid crossing the field during the third visit.
    if (desc.id.startsWith('sim-e2')) {
      const t = (desc.mjd - EPOCHS[2]) * 24; // hours
      const [ax, ay] = toPix(ra - 0.05 + 0.0035 * t, dec - 0.03 + 0.0018 * t);
      addSource(ax, ay, 0.6 * wl ** 0.8);
    }
    for (let i = 0; i < n * n * 0.003; i++) {
      const k = Math.floor(rand() * n * n);
      img[k] += 50; flags[k] |= 1 << 10;
    }
    return writeFits([
      { header, data: img, width: n, height: n },
      { header: [['EXTNAME', 'FLAGS'], ['MSKN0006', 'NONFUNC'], ['MSKN0010', 'HOT'], ['MSKN0021', 'SOURCE']], data: flags, width: n, height: n },
      { header: [['EXTNAME', 'ZODI'], ['BUNIT', 'MJy/sr']], data: zodi, width: n, height: n },
    ]);
  },
};
