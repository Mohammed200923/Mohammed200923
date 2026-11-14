// SPHEREx data from NASA/IPAC IRSA: image discovery via SIA v2 (ObsCore rows),
// then server-side cutouts of each Level-2 spectral image (multi-extension FITS).
// Formats checked against IRSA's SPHEREx tutorial notebooks and live responses (Nov 2026).

import { fetchRemote, parseVoTable, proxyEnabled } from '../net.js';
import { parseFits, spherexPlanes, hasPlanes } from '../fits.js';
import { detectorFromWavelength } from '../spherex.js';

const SIA = 'https://irsa.ipac.caltech.edu/SIA';
// Wide survey (whole sky, every ~6 months) plus the Deep Survey near the ecliptic poles, which
// is observed almost continuously (e.g. R Draconis: 540 wide + 1,954 deep images).
export const DEFAULT_COLLECTIONS = 'spherex_dr1,spherex_qr3,spherex_dr1_deep,spherex_qr3_deep';

// A cutout is IMAGE, FLAGS, VARIANCE, ZODI (~120 KB for 6′) followed by a ~4 MB EPSF table
// and the WCS-WAVE lookup. The server ignores Range requests, so we stop reading once
// the planes we use have arrived.
const NEEDED = ['IMAGE', 'FLAGS', 'ZODI'];

function cutoutUrl(url, ra, dec, sizeDeg) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}center=${ra.toFixed(6)},${dec.toFixed(6)}d&size=${sizeDeg.toFixed(5)}`;
}

async function readPlanes(response) {
  if (!response.body?.getReader) return response.arrayBuffer();
  const reader = response.body.getReader();
  let buf = new Uint8Array(0);
  let checkedAt = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const next = new Uint8Array(buf.length + value.length);
    next.set(buf); next.set(value, buf.length);
    buf = next;
    if (buf.length - checkedAt >= 16384) {
      checkedAt = buf.length;
      if (hasPlanes(buf.buffer, NEEDED)) {
        reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return buf.buffer;
}

export const irsaProvider = {
  id: 'irsa',
  label: 'NASA SPHEREx (IRSA)',
  simulated: false,
  _waveTables: new Map(),
  _psfTables: new Map(),

  async search({ ra, dec, collection }) {
    const params = new URLSearchParams();
    for (const c of (collection || DEFAULT_COLLECTIONS).split(/[\s,]+/).filter(Boolean)) params.append('COLLECTION', c);
    params.set('POS', `circle ${ra} ${dec} 0.002`);
    params.set('RESPONSEFORMAT', 'votable');
    params.set('MAXREC', '20000');
    const r = await fetchRemote(`${SIA}?${params}`);
    const rows = parseVoTable(await r.text());
    const seen = new Set();
    return rows
      .filter((row) => row.access_url && (!row.dataproduct_type || row.dataproduct_type === 'image'))
      .map((row) => toDescriptor(row))
      .filter((d) => !seen.has(d.id) && seen.add(d.id))
      .sort((a, b) => a.mjd - b.mjd);
  },

  async fetchCutout(desc, { ra, dec, sizeDeg }) {
    // Through the proxy, the server trims the cutout to the planes we use and caches it.
    const r = await fetchRemote(cutoutUrl(desc.url, ra, dec, sizeDeg), {}, 5, { fits: 'planes' });
    return readPlanes(r);
  },

  concurrency: 4, // IRSA answers 503 when pushed harder

  /**
   * The WCS-WAVE lookup table for a detector. It is identical for every exposure from the
   * same detector, so one small full download per detector serves all of its cutouts.
   */
  waveTable(desc, { ra, dec }) {
    const key = desc.detector;
    if (!this._waveTables.has(key)) {
      const p = fetchRemote(cutoutUrl(desc.url, ra, dec, 0.01), {}, 5, { fits: 'noepsf' })
        .then((r) => r.arrayBuffer())
        .then((b) => spherexPlanes(parseFits(b)).waveTable);
      // Forget failures so the next exposure from this detector tries again.
      p.catch(() => this._waveTables.delete(key));
      this._waveTables.set(key, p);
    }
    return this._waveTables.get(key);
  },
};

/**
 * For one detector: the fraction of a star's light inside the app's 2-pixel aperture, by
 * wavelength, from that detector's EPSF table. The server reads the ~4 MB table and returns
 * only [wavelength, fraction] pairs. → (wavelength µm) => fraction, or null without the server.
 */
irsaProvider.psfTable = function psfTable(desc, { ra, dec }) {
  if (!proxyEnabled()) return Promise.resolve(null);
  const key = desc.detector;
  if (!this._psfTables.has(key)) {
    const p = fetchRemote(cutoutUrl(desc.url, ra, dec, 0.01), {}, 5, { fits: 'psf-ee' })
      .then((r) => r.json())
      .then(({ rows }) => {
        if (!rows?.length) return null;
        return (wl) => {
          // Median over the PSFs measured within ±1% of this wavelength (nearest one if none).
          const near = rows.filter(([cw]) => Math.abs(cw - wl) <= 0.01 * wl).map(([, f]) => f).sort((a, b) => a - b);
          if (near.length) return near[near.length >> 1];
          return rows.reduce((best, r) => (Math.abs(r[0] - wl) < Math.abs(best[0] - wl) ? r : best))[1];
        };
      });
    p.catch(() => this._psfTables.delete(key));
    this._psfTables.set(key, p);
  }
  return this._psfTables.get(key);
};

function toDescriptor(row) {
  // ObsCore wavelengths are in metres.
  const wlMin = row.em_min * 1e6, wlMax = row.em_max * 1e6;
  const wl = (wlMin + wlMax) / 2;
  const m = String(row.energy_bandpassname || '').match(/D(\d)/i);
  return {
    id: row.obs_publisher_did || row.obs_id || row.access_url,
    obsId: [row.obs_id, m ? `D${m[1]}` : ''].filter(Boolean).join(' '),
    url: row.access_url,
    mjd: row.t_min,
    mjdEnd: row.t_max,
    wlMin, wlMax, wl,
    detector: m ? Number(m[1]) : detectorFromWavelength(wl),
    release: row.obs_collection || '',
    meta: row,
  };
}
