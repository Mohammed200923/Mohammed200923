// Partner data: NEOSSat, the Canadian Space Agency's Near-Earth Object Surveillance Satellite,
// from the Canadian Astronomy Data Centre (CADC). Which NEOSSat observations cover this spot,
// with CADC's preview images.

import { fetchRemote } from '../net.js';
import { parseCsv } from './wise.js';

const TAP = 'https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync';
const FILES = 'https://ws-cadc.canfar.net/minoc/files/';

/** NEOSSat observations whose footprint overlaps a circle: [{ id, mjd, thumb, preview }]. */
export async function neossatObservations(ra, dec, radiusDeg) {
  const query = `SELECT o.observationID, p.time_bounds_lower, a.uri FROM caom2.Observation AS o ` +
    `JOIN caom2.Plane AS p ON o.obsID = p.obsID JOIN caom2.Artifact AS a ON p.planeID = a.planeID ` +
    `WHERE o.collection = 'NEOSSAT' AND a.productType = 'thumbnail' ` +
    `AND INTERSECTS(CIRCLE('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)}, ${radiusDeg.toFixed(4)}), p.position_bounds) = 1 ` +
    `ORDER BY p.time_bounds_lower`;
  const params = new URLSearchParams({ LANG: 'ADQL', QUERY: query, FORMAT: 'csv' });
  const text = await (await fetchRemote(`${TAP}?${params}`, {}, 2)).text();
  return parseCsv(text).map((r) => ({
    id: r.observationID, mjd: Number(r.time_bounds_lower),
    thumb: FILES + r.uri, preview: FILES + r.uri.replace(/_256\.png$/, '.png'),
  })).filter((o) => o.id && Number.isFinite(o.mjd));
}
