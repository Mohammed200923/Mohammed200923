// Reference catalogues from CDS: Gaia DR3 (VizieR) for proper-motion overlays,
// and Sesame for resolving object names.

import { fetchRemote } from './net.js';

/** Gaia DR3 sources in a cone. Positions are at epoch 2016.0; pm in mas/yr. */
export async function gaiaCone(ra, dec, radiusArcsec, maxRows = 3000) {
  const params = new URLSearchParams({
    '-source': 'I/355/gaiadr3',
    '-c': `${ra.toFixed(6)} ${dec >= 0 ? '+' : ''}${dec.toFixed(6)}`,
    '-c.rs': radiusArcsec.toFixed(1),
    '-out': 'Source,RA_ICRS,DE_ICRS,pmRA,pmDE,Gmag',
    '-out.max': String(maxRows),
  });
  const r = await fetchRemote(`https://vizier.cds.unistra.fr/viz-bin/asu-tsv?${params}`);
  return parseVizierTsv(await r.text()).map((row) => ({
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
