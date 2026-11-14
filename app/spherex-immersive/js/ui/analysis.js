/* Analysis: the full SkyShift tool (time-lapse, mover search, overlays, photometry, export) as a full-screen
   panel of the 3D sky. Its markup comes from ../analysis.html and its logic from ../js/main.js, so the 3D sky
   and the standalone page always behave the same. It opens on whatever is selected in the sky.            */
import { h, icon, trapFocus, announce } from '../core/dom.js';
import { S, bus } from '../core/state.js';
import { loc } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import { TARGETS } from '../../../js/targets.js';

const PAGE = new URL('../../../analysis.html', import.meta.url).href;
const ENGINE = new URL('../../../js/main.js', import.meta.url).href;

let root, body, titleEl, release, open = false, engine = null, mounting = null, lastKey = '';

export function init() {
  UI.register('analysis', { kind: 'overlay', open: show, close: hide, isOpen: () => open });
  // A link to the 3D sky that carries a query (?q=… or ?ra=…&dec=…) opens straight into the analysis.
  const p = new URLSearchParams(location.search);
  if (p.has('q') || (p.has('ra') && p.has('dec'))) setTimeout(() => UI.open('analysis', { fromUrl: true }), 0);
}

/** What is selected in the sky, as an analysis query. */
function selection() {
  const tg = S.target;
  if (tg) {
    const quick = TARGETS.find((t) => t.key === tg.id);
    if (quick) return { key: tg.id, label: quick.name, query: { q: quick.name } };
    const c = tg.coordinates;
    if (c) return { key: tg.id, label: loc(tg.name), query: { ra: c.ra, dec: c.dec } };
  }
  if (S.pos) return { key: `${S.pos.ra.toFixed(4)},${S.pos.dec.toFixed(4)}`, label: null, query: { ra: S.pos.ra, dec: S.pos.dec } };
  return null;
}

async function mount(query) {
  const html = await (await fetch(PAGE)).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const layout = doc.querySelector('main.layout');
  // Rename the classes that collide with this interface's own (.panel, .stage, .viewer).
  layout.classList.replace('layout', 'ana-layout');
  layout.querySelectorAll('.panel').forEach((e) => { e.classList.replace('panel', 'ana-card'); e.classList.remove('viewer'); });
  layout.querySelectorAll('.stage').forEach((e) => e.classList.replace('stage', 'ana-stage'));
  // The engine's sky-context viewer needs Aladin Lite, loaded once.
  if (!window.A) {
    try { window.A = (await import('https://cdn.jsdelivr.net/npm/aladin-lite@3.6.5/dist/aladin.js')).default; } catch (e) { console.warn('Aladin Lite unavailable', e); }
  }
  body.append(document.adoptNode(layout));
  engine = await import(ENGINE);
  await engine.start({ query });
}

function show(arg = {}) {
  if (!root) build();
  const sel = selection();
  const fromUrl = arg.fromUrl && !sel;
  open = true; root.hidden = false; requestAnimationFrame(() => root.classList.add('in'));
  release = trapFocus(root, hide); bus.emit('panel');
  titleEl.textContent = sel?.label || (fromUrl ? 'Shared view' : 'Barnard\'s Star');
  if (!engine) {
    // First open: the URL query (shared links) wins, then the sky selection, then Barnard's Star.
    mounting = mounting || mount(fromUrl ? null : sel?.query || null).catch((e) => {
      body.textContent = ''; body.append(h('p', { class: 'muted', style: 'padding:24px', text: `The analysis tool could not start: ${e.message}` }));
      mounting = null;
    });
    lastKey = sel?.key || '';
  } else if (sel && sel.key !== lastKey) {
    lastKey = sel.key; engine.analyse(sel.query);
  }
  announce('Analysis opened');
}

function hide() {
  open = false; engine && engine.pause();
  root.classList.remove('in'); setTimeout(() => { if (!open) root.hidden = true; }, 260);
  release && release(); bus.emit('panel');
  // Leave the address bar on the sky: the analysis writes its own query there while open.
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
}

function build() {
  titleEl = h('h2', { text: '' });
  const status = h('div', { class: 'ana-status' });
  body = h('div', { class: 'ana-body' });
  root = h('div', { class: 'overlay ana', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Analysis', hidden: true },
    h('header', { class: 'ana-head' },
      h('div', { class: 'vw-title' }, h('span', { class: 'eyebrow', text: 'Analysis · real NASA data' }), titleEl),
      status,
      h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: hide }, icon('close'))),
    body);
  document.body.append(root);
  // The engine reports progress in #status; keep it in the panel header.
  status.id = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  // Keep the title on the field actually shown (the user can switch targets inside the panel).
  new MutationObserver(() => { const t = engine && engine.current().target; if (t && t.name) titleEl.textContent = t.name; })
    .observe(status, { childList: true, characterData: true, subtree: true });
}
