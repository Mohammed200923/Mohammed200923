/* Application logic between the UI and SX.data. No astronomy happens here: it only asks the data layer
   for things and keeps the selection / view / timeline state consistent.                                   */
import { S, HOME, bus } from './state.js';

const SX = () => window.SX;
let sky = null, obsToken = 0, playTimer = null;
export const attachSky = (s) => { sky = s; };

export async function init() {
  const b = await SX().data.getWavelengthBands();
  S.bands = b.status === 'ok' ? b.data : SX().DEFAULT_BANDS; bus.emit('bands');
  await loadFeatured();
}
export async function loadFeatured() {
  S.featuredStatus = 'loading'; bus.emit('featured');
  const r = await SX().data.getFeaturedTargets();
  S.featuredStatus = r.status === 'ok' ? 'ok' : r.status; S.featuredError = r.error;
  S.targets = r.status === 'ok' ? r.data : [];
  sky && sky.setTargets(S.targets); bus.emit('featured');
}

function snapshot() { return { view: sky ? sky.getView() : S.view, targetId: S.target && S.target.id, pos: S.pos }; }
function pushHistory() {
  const h = S.history, s = snapshot(), l = h[h.length - 1];
  if (!l || l.targetId !== s.targetId || Math.abs(l.view.ra - s.view.ra) > 0.5 || Math.abs(l.view.dec - s.view.dec) > 0.5) h.push(s);
  if (h.length > 30) h.shift();
  bus.emit('history');
}

export function fovFor(t) { const s = t && t.angularSizeDeg; return Math.max(6, Math.min(40, (s || 1) * 6 + 6)); }

export async function selectTarget(t, opts = {}) {
  if (!t) return;
  if (!opts.noHistory) pushHistory();
  S.target = t; S.pos = { ra: t.coordinates.ra, dec: t.coordinates.dec }; S.nearest = null; S.visit = 0;
  sky && sky.setSelected(t.id);
  bus.emit('target', t);
  if (opts.fly !== false && sky) sky.flyTo({ ra: t.coordinates.ra, dec: t.coordinates.dec, fov: opts.fov || fovFor(t) });
  return loadObservations();
}

export async function selectPosition(ra, dec, opts = {}) {
  if (!opts.noHistory) pushHistory();
  const r = await SX().data.getTargetsNear(ra, dec, 90);
  const list = r.status === 'ok' ? r.data : [], n = list[0] || null;
  if (n && (n.separationDeg || 0) <= Math.max(0.5, 0.6 * (n.angularSizeDeg || 0))) return selectTarget(n, { fov: opts.fov, noHistory: true });
  S.target = null; S.pos = { ra, dec }; S.nearest = n; S.visit = 0; sky && sky.setSelected(null);
  bus.emit('target', null);
  if (opts.fly !== false && sky) sky.flyTo({ ra, dec, fov: opts.fov || Math.min(sky.getView().fov, 20) });
  return loadObservations();
}

/* Parse + validate typed coordinates, then go. Returns {ok:true} or {ok:false, errors} so the UI can show messages. */
export async function goToText(raText, decText) {
  const c = SX().coords, p = decText == null ? c.parseCombined(raText) : c.parse(raText, decText);
  if (!p.ok) return { ok: false, errors: p.errors };
  await selectPosition(p.ra, p.dec, { fov: 12 });
  return { ok: true, ra: p.ra, dec: p.dec };
}

export async function loadObservations() {
  const token = ++obsToken, pos = S.pos; stopPlay();
  if (!pos) { S.obs = []; S.obsStatus = 'idle'; bus.emit('obs'); return; }
  S.obsStatus = 'loading'; S.obsError = null; bus.emit('obs');
  const fov = Math.max(0.5, Math.min(60, sky ? sky.getView().fov : 10));
  const r = await SX().data.getObservations(pos.ra, pos.dec, fov);
  if (token !== obsToken) return;
  if (r.status === 'error') { S.obsStatus = 'error'; S.obsError = r.error; S.obs = []; }
  else if (r.status === 'empty') { S.obsStatus = 'empty'; S.obs = []; }
  else {
    S.obs = r.data.slice().sort((a, b) => new Date(a.startTime) - new Date(b.startTime)); S.obsStatus = 'ok';
    const last = S.obs.map((o, i) => (o.status === 'observed' ? i : -1)).filter((i) => i >= 0).pop();
    S.visit = last == null ? 0 : last;
  }
  bus.emit('obs');
}

// The SkyShift provider answers with SPHEREx first and announces when the WISE epochs (2010–2024) are ready:
// fetch again then, keeping the observation the user is looking at.
window.addEventListener('skyshift:field-loaded', async () => {
  if (S.obsStatus !== 'ok' || !S.pos) return;
  const token = obsToken, keep = S.obs[S.visit] && S.obs[S.visit].id, pos = S.pos;
  const r = await SX().data.getObservations(pos.ra, pos.dec, sky ? sky.getView().fov : 10);
  if (token !== obsToken || r.status !== 'ok' || r.data.length <= S.obs.length) return;
  S.obs = r.data.slice().sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  const i = S.obs.findIndex((o) => o.id === keep); S.visit = i >= 0 ? i : S.visit;
  bus.emit('obs');
});

export const observed = () => S.obs.map((o, i) => ({ o, i })).filter((x) => x.o.status === 'observed');
export const currentObs = () => S.obs[S.visit] || null;
export function setVisit(i) { if (i < 0 || i >= S.obs.length) return; S.visit = i; bus.emit('visit'); }
export function stepVisit(d) {
  const list = observed(); if (!list.length) return false;
  const pos = list.findIndex((x) => x.i === S.visit);
  const n = pos < 0 ? (d > 0 ? 0 : list.length - 1) : pos + d;
  if (n < 0 || n >= list.length) return false;
  setVisit(list[n].i); return true;
}
export function setBand(b) { S.band = b; bus.emit('band'); }
export function startPlay() {
  if (observed().length < 2) return;
  S.playing = true; bus.emit('play');
  playTimer = setInterval(() => { if (!stepVisit(1)) setVisit(observed()[0].i); }, 1400 / S.speed);
}
export function stopPlay() { if (playTimer) clearInterval(playTimer); playTimer = null; if (S.playing) { S.playing = false; bus.emit('play'); } }
export function togglePlay() { S.playing ? stopPlay() : startPlay(); }
export function setSpeed(s) { S.speed = s; if (S.playing) { stopPlay(); startPlay(); } bus.emit('speed'); }

export function back() {
  const h = S.history.pop(); bus.emit('history');
  if (!h) { reset(); return false; }
  stopPlay();
  const t = h.targetId ? S.targets.find((x) => x.id === h.targetId) : null;
  if (t) selectTarget(t, { fly: false, noHistory: true });
  else if (h.pos) { S.target = null; S.pos = h.pos; S.nearest = null; sky && sky.setSelected(null); bus.emit('target', null); loadObservations(); }
  else clearSelection();
  sky && sky.flyTo(h.view); return true;
}
export function reset() {
  stopPlay(); S.history = []; clearSelection();
  sky && sky.flyTo(HOME); bus.emit('history'); bus.emit('reset');
}
export function clearSelection() {
  S.target = null; S.pos = null; S.nearest = null; S.obs = []; S.obsStatus = 'idle';
  sky && sky.setSelected(null); stopPlay(); bus.emit('target', null); bus.emit('obs');
}
