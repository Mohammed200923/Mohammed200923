/* Boot. This is the ONLY place that chooses the data provider and the assistant adapter.
   To connect real data: see FRONTEND_INTEGRATION.md (swap `provider` below; optionally set window.SXI.assistant).    */
import { prefs, setPrefs, hasSavedPrefs, bus, HOME } from './core/state.js';
import { applyLang, t } from './core/i18n.js';
import { applyAppearance, resolvedTheme, reducedMotion } from './core/appearance.js';
import * as C from './core/controller.js';
import { createSky } from './sky/skyscene.js';
import { buildProvider } from './data/provider.js';
import skyshift from '../../spherex-explorer/js/data/providers/skyshift.js';
import { ask as demoAsk } from './data/assistant-demo.js';
import * as hud from './ui/hud.js';
import * as selection from './ui/selection.js';
import * as minimap from './ui/minimap.js';
import * as timeline from './ui/timeline.js';
import * as info from './ui/info.js';
import * as viewer from './ui/viewer.js';
import * as search from './ui/search.js';
import * as stories from './ui/stories.js';
import * as assistant from './ui/assistant.js';
import * as onboarding from './ui/onboarding.js';
import * as settings from './ui/settings.js';
import * as help from './ui/help.js';
import * as analysis from './ui/analysis.js';
import * as starlabels from './ui/starlabels.js';
import { UI } from './core/ui.js';

const SX = window.SX;

/* ---- 1. wiring: data provider + assistant adapter (swap these two lines for real services) ---- */
const provider = buildProvider(skyshift);                   // real NASA data (SkyShift engine)
SX.data.use(provider);
window.SXI = window.SXI || {};
window.SXI.assistant = window.SXI.assistant || { ask: demoAsk };   // <- replace with a real assistant adapter

/* ---- 2. first-run defaults ---- */
if (!hasSavedPrefs()) {
  const p = {};
  if (/^ar/i.test(navigator.language || '')) p.lang = 'ar';
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) p.lowPerf = true;
  if (Object.keys(p).length) Object.assign(prefs, p);
}
applyLang(); applyAppearance();

/* ---- 3. sky (falls back to a stub, so search / observations / stories keep working without WebGL) ---- */
function stubSky() {
  const v = Object.assign({}, HOME), l = {};
  const noop = () => {}, api = { on(e, f) { (l[e] = l[e] || []).push(f); }, getView: () => Object.assign({}, v), setView(n) { Object.assign(v, n); (l.view || []).forEach((f) => f(v)); }, flyTo(n) { api.setView(n); return Promise.resolve(); },
    getSize: () => ({ w: innerWidth, h: innerHeight }), pixelsPerDegree: () => 10, project: () => ({ x: 0, y: 0, visible: false }), unproject: () => ({ ra: v.ra, dec: v.dec }), pickNear: () => null, stopFly: noop, zoomBy: noop, panBy: noop };
  ['setTargets', 'setSelected', 'setHover', 'setInfrared', 'setStarScale', 'setGraticule', 'setTheme', 'setLowPerf', 'setReducedMotion', 'requestRender'].forEach((k) => { api[k] = noop; });
  return api;
}
let sky;
try {
  sky = createSky(document.getElementById('sky'), { light: resolvedTheme() === 'light', reduced: reducedMotion(), low: prefs.lowPerf, graticule: prefs.graticule });
} catch (e) {
  console.warn('WebGL unavailable', e); sky = stubSky(); document.getElementById('webgl-fail').hidden = false;
  document.getElementById('webgl-retry').addEventListener('click', () => location.reload());
}
// The badge says what the background stars are: the real Hipparcos catalogue, or (if it failed to load) decoration.
sky.on('stars', ({ real }) => { const s = document.querySelector('#prov-badge [data-i18n]'); if (s) { s.dataset.i18n = real ? 'prov.stars' : 'prov.decor'; s.textContent = t(s.dataset.i18n); } });
sky.on('contextlost', () => { document.getElementById('webgl-fail').hidden = false; });
applyAppearance(sky); sky.setView(HOME, true);
C.attachSky(sky);

/* ---- 4. UI ---- */
bus.on('prefs', (p) => { applyAppearance(sky); if ('theme' in p) bus.emit('theme'); });
hud.init(sky); starlabels.init(sky); selection.init(sky); minimap.init(sky); timeline.init(); info.init(sky); viewer.init(); search.init(sky); stories.init(); assistant.init(sky);
settings.init(); help.init(); onboarding.init(); analysis.init();

/* ---- 5. data bootstrap: never blocks the UI; failures appear as states ---- */
C.init().then(() => document.getElementById('boot').classList.add('gone'));
setTimeout(() => document.getElementById('boot').classList.add('gone'), 1800);
setTimeout(() => { const b = document.getElementById('boot'); b && b.remove(); }, 2800);

// A shared analysis link goes straight to the analysis, not the welcome screen.
const sharedQuery = /[?&](q|ra)=/.test(location.search);
if (!prefs.onboarded && !sharedQuery) UI.open('onboarding');
void setPrefs; void t;
