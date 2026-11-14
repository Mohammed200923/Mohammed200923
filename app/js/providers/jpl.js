// Known asteroids and comets from NASA JPL's Small-Body Identification API: which catalogued
// small bodies were inside a field at a given moment (geocentric; SPHEREx's low orbit shifts
// main-belt positions by only a few arcseconds). The API's fast first pass (positions good to
// ~15″) is used: its precise second pass takes 40–110 s per request.

import { fetchRemote } from '../net.js';
import { mjdToDate } from '../wcs.js';

const API = 'https://ssd-api.jpl.nasa.gov/sb_ident.api';
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';

function sexagesimal(value, hours) {
  const sign = value < 0 ? '-' : '';
  let v = Math.abs(hours ? value / 15 : value);
  const a = Math.floor(v); v = (v - a) * 60;
  const b = Math.floor(v); const c = (v - b) * 60;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${sign}${pad(a)}-${pad(b)}-${c.toFixed(2).padStart(5, '0')}`;
}

function parseRa(s) {
  const [h, m, sec] = s.split(':').map(Number);
  return 15 * (h + m / 60 + sec / 3600);
}

function parseDec(s) {
  const m = s.match(/([+-]?)(\d+)\s+(\d+)'([\d.]+)/);
  if (!m) return NaN;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600;
  return m[1] === '-' ? -v : v;
}

/** Horizons COMMAND for a name as sb_ident prints it, e.g. "3674 Erbisbuhl (1963 RH)". */
export function horizonsCommand(name) {
  const n = name.trim();
  const comet = n.match(/^((?:\d+[PD])|(?:[PCDX]\/\d{4} [A-Z]+\d*))/);
  if (comet) return `DES=${comet[1]};CAP;`;
  const numbered = n.match(/^(\d+)\b/);
  if (numbered) return `${numbered[1]};`;
  const provisional = n.match(/^\(?(\d{4} [A-Z]{2}\d*)\)?/);
  if (provisional) return `DES=${provisional[1]};`;
  return null;
}

/**
 * Exact geocentric positions of one small body at many times, from JPL Horizons
 * (a fraction of a second per request, unlike the field search). → [{ mjd, ra, dec, v }]
 */
export async function horizonsPositions(name, mjds) {
  const command = horizonsCommand(name);
  if (!command) throw new Error(`Can't form a Horizons query for ${name}`);
  const out = [];
  for (let i = 0; i < mjds.length; i += 60) {
    const chunk = mjds.slice(i, i + 60);
    const params = new URLSearchParams({
      format: 'json', COMMAND: `'${command}'`, EPHEM_TYPE: 'OBSERVER', CENTER: "'500@399'",
      TLIST_TYPE: 'MJD', TLIST: chunk.map((m) => `'${m.toFixed(6)}'`).join(','),
      QUANTITIES: "'1,9'", ANG_FORMAT: 'DEG', CSV_FORMAT: 'YES', OBJ_DATA: 'NO',
    });
    const result = (await (await fetchRemote(`${HORIZONS}?${params}`, {}, 2)).json()).result || '';
    const s = result.indexOf('$$SOE'), e = result.indexOf('$$EOE');
    if (s < 0 || e < 0) throw new Error(`Horizons had no ephemeris for ${name}`);
    const lines = result.slice(s + 5, e).trim().split('\n');
    lines.forEach((line, k) => {
      const c = line.split(',').map((x) => x.trim());
      out.push({ mjd: chunk[k], ra: Number(c[3]), dec: Number(c[4]), v: Number(c[5]) });
    });
  }
  return out;
}

/**
 * Move a body from its query time to another time with its sky rates (″/h; RA rate already
 * includes cos δ). Fine within a survey visit for anything slower than a near-Earth object.
 */
export function bodyAt(b, mjd) {
  const dtHours = (mjd - b.mjd) * 24;
  const dec = b.dec + (b.decRate * dtHours) / 3600;
  const ra = b.ra + (b.raRate * dtHours) / 3600 / Math.cos((b.dec * Math.PI) / 180);
  return { ...b, ra: ((ra % 360) + 360) % 360, dec, mjd };
}

/** Known small bodies within a box of half-width hwDeg around (ra, dec) at time mjd. */
export async function smallBodies(ra, dec, hwDeg, mjd, vmagLimit = 20, { precise = false, maxError = 120 } = {}) {
  const t = mjdToDate(mjd).toISOString().slice(0, 19).replace('T', '_');
  const params = new URLSearchParams({
    'mpc-code': '500', 'obs-time': t,
    'fov-ra-center': sexagesimal(ra, true), 'fov-dec-center': sexagesimal(dec, false),
    'fov-ra-hwidth': hwDeg.toFixed(4), 'fov-dec-hwidth': hwDeg.toFixed(4),
    'vmag-lim': String(vmagLimit),
    ...(precise ? { 'two-pass': 'true', 'suppress-first-pass': 'true' } : {}),
  });
  const r = await fetchRemote(`${API}?${params}`, {}, 2);
  const d = await r.json();
  const fields = (precise ? d.fields_second : d.fields_first) || [];
  const rows = (precise ? d.data_second_pass : d.data_first_pass) || [];
  const col = (name) => fields.findIndex((f) => f.startsWith(name));
  const [iName, iRa, iDec, iV, iRaRate, iDecRate] =
    ['Object name', 'Astrometric RA', 'Astrometric Dec', 'Visual magnitude', 'RA rate', 'Dec rate'].map(col);
  // The first pass also returns distant objects with huge position errors; keep only those
  // whose predicted position is in the box and reasonably certain.
  const iDist = [col('Dist. from center RA'), col('Dist. from center Dec')];
  const iErr = col('Est. error RA');
  const box = hwDeg * 3600 * 1.05;
  return rows.filter((row) => iDist.every((i) => i < 0 || Math.abs(Number(row[i])) <= box) &&
    (iErr < 0 || Number(row[iErr]) <= maxError)).map((row) => ({
    name: row[iName].trim(), ra: parseRa(row[iRa]), dec: parseDec(row[iDec]),
    v: Number(row[iV]), raRate: Number(row[iRaRate]), decRate: Number(row[iDecRate]), mjd,
    posErr: iErr >= 0 ? Number(row[iErr]) : 0,
    comet: /^\d*[PCDX]\//.test(row[iName].trim()),
  })).filter((b) => Number.isFinite(b.ra) && Number.isFinite(b.dec));
}
