// SPHEREx data from NASA/IPAC IRSA: image discovery via SIA v2 (ObsCore rows),
// then server-side cutouts of each Level-2 spectral image (multi-extension FITS).

import { fetchRemote, parseVoTable } from '../net.js';
import { detectorFromWavelength } from '../spherex.js';

const SIA = 'https://irsa.ipac.caltech.edu/SIA';

export const irsaProvider = {
  id: 'irsa',
  label: 'NASA SPHEREx (IRSA)',
  simulated: false,

  async search({ ra, dec, collection }) {
    const params = new URLSearchParams({
      COLLECTION: collection || 'spherex_qr',
      POS: `circle ${ra} ${dec} 0.002`,
      RESPONSEFORMAT: 'votable',
      MAXREC: '5000',
    });
    const r = await fetchRemote(`${SIA}?${params}`);
    const rows = parseVoTable(await r.text());
    return rows
      .filter((row) => row.access_url && (!row.dataproduct_type || row.dataproduct_type === 'image'))
      .map((row) => toDescriptor(row))
      .sort((a, b) => a.mjd - b.mjd);
  },

  async fetchCutout(desc, { ra, dec, sizeDeg }) {
    const sep = desc.url.includes('?') ? '&' : '?';
    const url = `${desc.url}${sep}center=${ra.toFixed(6)},${dec.toFixed(6)}&size=${sizeDeg.toFixed(5)}`;
    const r = await fetchRemote(url);
    return r.arrayBuffer();
  },
};

function toDescriptor(row) {
  // ObsCore wavelengths are in metres.
  const wlMin = row.em_min * 1e6, wlMax = row.em_max * 1e6;
  const wl = (wlMin + wlMax) / 2;
  const bandName = String(row.energy_bandpassname || '');
  const m = bandName.match(/D(\d)/i) || String(row.obs_id || '').match(/D(\d)\b/);
  return {
    id: row.obs_publisher_did || row.obs_id || row.access_url,
    obsId: row.obs_id || '',
    url: row.access_url,
    mjd: row.t_min,
    mjdEnd: row.t_max,
    wlMin, wlMax, wl,
    detector: m ? Number(m[1]) : detectorFromWavelength(wl),
    meta: row,
  };
}
