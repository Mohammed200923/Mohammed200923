// NASA WISE data from IRSA, for comparison with SPHEREx:
// - an AllWISE Atlas cutout in W2 (4.6 µm), taken in 2010: a ~15-year baseline image;
// - CatWISE2020 sources, whose proper motions come from 10 years of WISE/NEOWISE data
//   and include cold brown dwarfs that Gaia cannot see.

import { fetchRemote, parseVoTable } from '../net.js';
import { parseFits, maybeGunzip } from '../fits.js';
import { Wcs } from '../wcs.js';

const IRSA = 'https://irsa.ipac.caltech.edu';
export const CATWISE_EPOCH = 2015.4; // reference epoch of CatWISE2020 positions (MJD 57170)

/** AllWISE W2 Atlas cutout around (ra, dec): { data, width, height, wcs, mjd, header }. */
export async function allwiseCutout(ra, dec, sizeDeg) {
  const params = new URLSearchParams({
    COLLECTION: 'wise_allwise', POS: `circle ${ra} ${dec} 0.002`, RESPONSEFORMAT: 'votable',
  });
  const rows = parseVoTable(await (await fetchRemote(`${IRSA}/SIA?${params}`)).text())
    .filter((r) => r.energy_bandpassname === 'W2' && r.dataproduct_subtype === 'science' && /-w2-int-3\.fits$/.test(r.access_url));
  if (!rows.length) throw new Error('No AllWISE W2 image covers this position');
  // Prefer the Atlas tile whose centre is closest, so the cutout is least likely to hit an edge.
  rows.sort((a, b) => Math.hypot(a.s_ra - ra, a.s_dec - dec) - Math.hypot(b.s_ra - ra, b.s_dec - dec));
  const row = rows[0];
  const url = `${row.access_url}?center=${ra.toFixed(6)},${dec.toFixed(6)}&size=${sizeDeg.toFixed(5)}`;
  const buf = await maybeGunzip(await (await fetchRemote(url, {}, 3)).arrayBuffer());
  const hdu = parseFits(buf).find((h) => h.data);
  if (!hdu) throw new Error('Empty AllWISE cutout');
  return {
    data: hdu.data, width: hdu.width, height: hdu.height, wcs: new Wcs(hdu.header), header: hdu.header,
    mjd: (row.t_min + row.t_max) / 2, mjdRange: [row.t_min, row.t_max], id: row.obs_id || row.access_url,
  };
}

/**
 * CatWISE2020 sources in a cone, via IRSA's TAP service.
 * Positions are at epoch 2015.4; proper motions are converted to mas/yr like Gaia's.
 */
export async function catwiseCone(ra, dec, radiusDeg, maxRows = 5000) {
  const query = `SELECT TOP ${maxRows} source_name, ra_pm, dec_pm, pmra, pmdec, sigpmra, sigpmdec, w2mpro_pm, w2snr_pm ` +
    `FROM catwise_2020 WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)}, ${radiusDeg.toFixed(5)})) = 1`;
  const params = new URLSearchParams({ QUERY: query, FORMAT: 'csv' });
  const text = await (await fetchRemote(`${IRSA}/TAP/sync?${params}`, {}, 2)).text();
  return parseCsv(text).map((r) => ({
    id: r.source_name,
    ra: Number(r.ra_pm), dec: Number(r.dec_pm),
    pmra: Number(r.pmra) * 1000, pmdec: Number(r.pmdec) * 1000,
    pmErr: Math.hypot(Number(r.sigpmra) || 0, Number(r.sigpmdec) || 0) * 1000,
    w2: Number(r.w2mpro_pm), w2snr: Number(r.w2snr_pm),
  })).filter((s) => Number.isFinite(s.ra) && Number.isFinite(s.dec));
}

/**
 * A CatWISE motion is trusted when it is fast, at least 8× its own uncertainty, and the
 * source is well detected. Looser rules flagged ~10% of all sources in test fields.
 */
export function significantMotion(s, minMasYr = 300) {
  const pm = Math.hypot(s.pmra, s.pmdec);
  return pm >= minMasYr && pm >= 8 * (s.pmErr || Infinity) && s.w2snr >= 20;
}

/**
 * CatWISE sources with trustworthy motion, after two clean-ups found on real fields:
 * - Glare: bright stars scatter spurious "moving" detections across arcminutes (36–221″
 *   around Barnard's Star). Sources within 220″ of a star brighter than G = 9, or 100″ of
 *   one brighter than G = 11, are dropped. brightStars: Gaia stars at the CatWISE epoch.
 * - Duplicates: a fast mover is often split into several entries along its path. Within
 *   20″ and 1.5″/yr of each other, only the brightest is kept.
 */
export function cleanCatwiseMovers(list, brightStars = []) {
  const D2R = Math.PI / 180;
  const sepArcsec = (a, b) => Math.hypot((a.ra - b.ra) * Math.cos(b.dec * D2R), a.dec - b.dec) * 3600;
  const candidates = list.filter(significantMotion)
    .filter((s) => !brightStars.some((b) => sepArcsec(s, b) < (b.g <= 9 ? 220 : 100)))
    .sort((a, b) => (a.w2 || 99) - (b.w2 || 99));
  const kept = [];
  for (const s of candidates) {
    const dup = kept.some((k) => sepArcsec(s, k) < 20 && Math.hypot(s.pmra - k.pmra, s.pmdec - k.pmdec) < 1500);
    if (!dup) kept.push(s);
  }
  return kept;
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const cols = lines[0].split(',').map((c) => c.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const row = {};
    cols.forEach((c, k) => (row[c] = (cells[k] ?? '').trim()));
    return row;
  });
}
