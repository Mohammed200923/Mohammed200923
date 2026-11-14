// Reference catalogues: Gaia DR3 for proper-motion overlays (from NASA's MAST archive, as the
// challenge links it, with CDS VizieR mirrors as the fallback), and CDS Sesame for names.

import { fetchRemote, proxyEnabled } from './net.js';

// CDS's main VizieR server has outages; the official mirrors serve the same catalogues.
const VIZIER_MIRRORS = ['vizier.cds.unistra.fr', 'vizier.idia.ac.za', 'vizier.cfa.harvard.edu'];

async function fromMirrors(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const text = await (await fetchRemote(url, {}, 1)).text();
      if (/^\s*#/.test(text)) return text; // ASU-TSV starts with '#' comments; outage pages are HTML
      lastError = new Error(`Unexpected reply from ${new URL(url).host}`);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

const GAIA_COLUMNS = ['source_id', 'ra', 'dec', 'pmra', 'pmdec', 'phot_g_mean_mag'];

/** Gaia DR3 cone from NASA MAST. Needs the local server: MAST sends no CORS headers, and the
 * server also trims MAST's 153 columns (~6 MB per field) down to the six used here. */
async function gaiaFromMast(ra, dec, radiusArcsec, maxRows) {
  const request = JSON.stringify({
    service: 'Mast.Catalogs.GaiaDR3.Cone',
    params: { ra, dec, radius: radiusArcsec / 3600 },
    format: 'json', pagesize: maxRows, page: 1,
  });
  const r = await fetchRemote(`https://mast.stsci.edu/api/v0/invoke?request=${encodeURIComponent(request)}`,
    {}, 2, { cols: GAIA_COLUMNS.join(',') });
  const doc = await r.json();
  if (doc.status && doc.status !== 'COMPLETE') throw new Error(`MAST: ${doc.msg || doc.status}`);
  return (doc.data || []).map((row) => ({
    id: String(row.source_id), ra: row.ra, dec: row.dec,
    pmra: row.pmra ?? 0, pmdec: row.pmdec ?? 0, gmag: row.phot_g_mean_mag,
  })).filter((s) => Number.isFinite(s.ra) && Number.isFinite(s.dec));
}

/** Gaia DR3 sources in a cone. Positions are at epoch 2016.0; pm in mas/yr. */
export async function gaiaCone(ra, dec, radiusArcsec, maxRows = 20000) {
  if (proxyEnabled()) {
    try {
      const list = await gaiaFromMast(ra, dec, radiusArcsec, maxRows);
      list.source = 'NASA MAST';
      return list;
    } catch (e) {
      console.warn('MAST Gaia query failed, using CDS VizieR', e);
    }
  }
  const list = await gaiaFromVizier(ra, dec, radiusArcsec, maxRows);
  list.source = 'CDS VizieR';
  return list;
}

async function gaiaFromVizier(ra, dec, radiusArcsec, maxRows) {
  const params = new URLSearchParams({
    '-source': 'I/355/gaiadr3',
    '-c': `${ra.toFixed(6)} ${dec >= 0 ? '+' : ''}${dec.toFixed(6)}`,
    '-c.rs': radiusArcsec.toFixed(1),
    '-out': 'Source,RA_ICRS,DE_ICRS,pmRA,pmDE,Gmag',
    '-out.max': String(maxRows),
  });
  const text = await fromMirrors(VIZIER_MIRRORS.map((host) => `https://${host}/viz-bin/asu-tsv?${params}`));
  return parseVizierTsv(text).map((row) => ({
    id: row.Source,
    ra: Number(row.RA_ICRS), dec: Number(row.DE_ICRS),
    pmra: Number(row.pmRA) || 0, pmdec: Number(row.pmDE) || 0,
    gmag: Number(row.Gmag),
  })).filter((s) => Number.isFinite(s.ra) && Number.isFinite(s.dec));
}

export function parseVizierTsv(text) {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('#') || !lines[i].trim())) i++;
  if (i >= lines.length) return [];
  const cols = lines[i].split('\t').map((c) => c.trim());
  i += 3; // header, units, dashes
  const rows = [];
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || l.startsWith('#')) continue;
    const cells = l.split('\t');
    const row = {};
    cols.forEach((c, k) => (row[c] = (cells[k] ?? '').trim()));
    rows.push(row);
  }
  return rows;
}

/** Resolve an object name with CDS Sesame → { ra, dec, pmra, pmdec, epoch, name }. */
export async function resolveName(name) {
  const r = await fetchRemote(`https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?${encodeURIComponent(name)}`);
  const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const ra = Number(doc.querySelector('jradeg')?.textContent);
  const dec = Number(doc.querySelector('jdedeg')?.textContent);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) throw new Error(`Could not resolve "${name}"`);
  const pmra = Number(doc.querySelector('pm pmRA')?.textContent) || 0;
  const pmdec = Number(doc.querySelector('pm pmDE')?.textContent) || 0;
  const oname = doc.querySelector('oname')?.textContent?.trim() || name;
  // SIMBAD positions are given at epoch J2000.
  return { ra, dec, pmra, pmdec, epoch: 2000, name: oname };
}
