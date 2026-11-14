/* Shared state: preferences (persisted) + session state + a tiny event bus. */
const KEY = 'sxi.prefs.v1';
export const DEFAULT_PREFS = { lang: 'en', theme: 'system', level: 'beginner', reducedMotion: 'system', largeText: false, contrast: false, lowPerf: false, graticule: true, onboarded: false, tipsSeen: false };

function loadPrefs() { try { return Object.assign({}, DEFAULT_PREFS, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEFAULT_PREFS); } }
export const prefs = loadPrefs();
export const hasSavedPrefs = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };

const handlers = {};
export const bus = {
  on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => { handlers[ev] = handlers[ev].filter((f) => f !== fn); }; },
  emit(ev, d) { (handlers[ev] || []).slice().forEach((f) => { try { f(d); } catch (e) { console.error('[bus]', ev, e); } }); }
};
export function setPrefs(patch) {
  Object.assign(prefs, patch);
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable: keep in memory */ }
  bus.emit('prefs', patch);
}

export const HOME = { ra: 83.8, dec: 0, fov: 70, roll: 0 };

export const S = {
  targets: [], bands: [],
  target: null,            // selected Target (contract shape) or null
  pos: null,               // {ra, dec} pinned position
  nearest: null,           // nearest target when pinned position is empty sky
  view: Object.assign({}, HOME),
  obsStatus: 'idle',       // idle | loading | ok | empty | error
  obs: [], obsError: null,
  visit: 0, band: 'composite', playing: false, speed: 1, ir: 0,
  history: [],
  searchStatus: 'idle'
};
