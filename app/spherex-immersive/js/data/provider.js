/* Data wiring for the immersive explorer.
   The app talks ONLY to SX.data (../spherex-explorer/js/data/service.js), exactly like the Style 2 app.
   `buildProvider(base)` wraps whichever provider you pass (today: the mock) and adds two clearly flagged DEMO entries
   (RW Aurigae, R Draconis) that Star Stories needs. A real provider that already returns these targets can simply be
   passed through: set `USE_EXTRAS = false`.                                                                      */
import { EXTRA_TARGETS } from './editorial.js';

export const USE_EXTRAS = false; // the SkyShift provider supplies real rwaur / rdra targets

function matches(t, q) {
  q = q.trim().toLowerCase(); if (!q) return false;
  const names = [t.name.en, t.name.ar].concat(t.aliases || []).map((s) => String(s).toLowerCase());
  return names.some((n) => n.includes(q));
}
const sep = (r1, d1, r2, d2) => window.SX.angSep(r1, d1, r2, d2);

export function buildProvider(base) {
  if (!USE_EXTRAS) return base;
  const extra = (id) => EXTRA_TARGETS.find((t) => t.id === id);
  const p = Object.create(base);
  p.describe = () => { const d = base.describe ? base.describe() : { name: 'Provider', simulated: false }; return Object.assign({}, d, { note: ((d.note || '') + ' Immersive explorer adds 2 demo targets.').trim() }); };
  p.getFeaturedTargets = async () => (await base.getFeaturedTargets()).concat(EXTRA_TARGETS);
  p.getTargetById = async (id) => extra(id) || base.getTargetById(id);
  p.searchTargets = async (q) => {
    const r = await base.searchTargets(q);
    const add = EXTRA_TARGETS.filter((t) => matches(t, q) && !r.find((x) => x.id === t.id));
    return r.concat(add);
  };
  p.getTargetsNear = async (ra, dec, radius) => {
    const r = await base.getTargetsNear(ra, dec, radius);
    const add = EXTRA_TARGETS.map((t) => Object.assign({}, t, { separationDeg: sep(ra, dec, t.coordinates.ra, t.coordinates.dec) })).filter((t) => t.separationDeg <= radius);
    return r.concat(add).sort((a, b) => (a.separationDeg || 0) - (b.separationDeg || 0));
  };
  return p;
}
