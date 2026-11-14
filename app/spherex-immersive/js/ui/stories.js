/* Star Stories: cinematic, chapter-based presentations. Visual atmosphere is per object; scientific statements are NOT
   invented here. Text comes from data/editorial.js (draft, flagged) or from the data provider. Artwork is labelled
   "Illustration" and is never presented as observation data.                                                         */
import { $, h, icon, announce, trapFocus, fmtDate, clamp } from '../core/dom.js';
import { S, bus, prefs } from '../core/state.js';
import { t, loc, lang } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';
import { STORIES, GENERIC_THEME } from '../data/editorial.js';
import { errorState, emptyState, loadingState, provChip, metaList } from './common.js';

let root, release, open = false, story = null, target = null, ch = 0, raf = 0, params = { years: 0, wl: 0.15, speed: 4, play: true }, scene = null, sceneCv = null, lastT = 0, swipe = null;
const rngSeed = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

export function init() { UI.register('stories', { kind: 'overlay', open: show, close: hide, isOpen: () => open }); bus.on('lang', () => { if (open) (story ? render() : gallery()); }); }

function genericStory(tg) {
  return {
    targetId: tg.id, status: 'draft', generic: true, scene: 'generic', theme: GENERIC_THEME,
    chapters: [
      { id: 'meet', title: null, body: null }, { id: 'discovery', title: null, body: null }, { id: 'traits', title: null, body: null },
      { id: 'interesting', title: null, body: null }, { id: 'nasa', title: null, body: null, interactive: 'obs' }, { id: 'explore', title: null, body: null, interactive: 'go' }
    ]
  };
}
const GEN_KEYS = ['story.gen.meet', 'story.gen.discovery', 'story.gen.traits', 'story.gen.interesting', 'story.gen.nasa', 'story.gen.explore'];
const GEN_TITLES = ['story.ch.meet', 'story.ch.discovery', 'story.ch.traits', 'story.ch.interesting', 'story.ch.nasa', 'story.ch.explore'];

async function resolveTarget(id) { return S.targets.find((x) => x.id === id) || (await window.SX.data.getTargetById(id)).data || null; }

async function show(arg = {}) {
  open = true; root = h('div', { class: 'overlay story', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('story.title') }); document.body.append(root);
  root.addEventListener('keydown', onKey);
  root.addEventListener('touchstart', (e) => { swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  root.addEventListener('touchend', (e) => { if (!swipe || !story) return; const dx = e.changedTouches[0].clientX - swipe.x, dy = e.changedTouches[0].clientY - swipe.y; swipe = null; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go((dx < 0 ? 1 : -1) * (document.documentElement.dir === 'rtl' ? -1 : 1)); }, { passive: true });
  release = trapFocus(root, () => (story ? gallery() : hide())); requestAnimationFrame(() => root.classList.add('in')); bus.emit('panel');
  if (arg.targetId) { const tg = await resolveTarget(arg.targetId); if (tg) return begin(tg); }
  gallery();
}
function hide() { open = false; cancelAnimationFrame(raf); root.classList.remove('in'); const r = root; setTimeout(() => r.remove(), 300); release && release(); story = null; bus.emit('panel'); }

/* ---------- gallery ---------- */
async function gallery() {
  cancelAnimationFrame(raf); story = null; target = null; root.textContent = ''; root.style.cssText = '';
  root.className = 'overlay story in gal';
  const close = h('button', { class: 'x', type: 'button', 'aria-label': t('common.close'), onclick: hide }, icon('close'));
  const grid = h('div', { class: 'gal-grid' });
  root.append(h('div', { class: 'gal-in' }, h('header', {}, h('span', { class: 'eyebrow', text: t('story.gallery.eyebrow') }), h('h2', { class: 'display', text: t('story.gallery.title') }), h('p', { class: 'muted', text: t('story.gallery.body') })), grid, h('p', { class: 'draft-note', text: t('story.draft.note') })), close);
  const ids = Object.keys(STORIES);
  const cards = await Promise.all(ids.map(async (id) => ({ id, tg: await resolveTarget(id) })));
  cards.forEach(({ id, tg }) => {
    if (!tg) return; const st = STORIES[id];
    grid.append(h('button', { class: 'gcard', type: 'button', style: `--a:${st.theme.accent};--b:${st.theme.accent2};--c1:${st.theme.bg[0]};--c2:${st.theme.bg[1]}`, onclick: () => begin(tg) },
      h('span', { class: 'gtone', text: t('story.tone.' + st.theme.tone) }), h('span', { class: 'gname display', text: loc(tg.name) }), h('span', { class: 'gtype', text: loc(tg.typeLabel) }), h('span', { class: 'chip warn', text: t('story.draft.chip') })));
  });
  if (S.target && !STORIES[S.target.id]) grid.append(h('button', { class: 'gcard generic', type: 'button', onclick: () => begin(S.target) }, h('span', { class: 'gtone', text: t('story.tone.neutral') }), h('span', { class: 'gname display', text: loc(S.target.name) }), h('span', { class: 'gtype', text: t('story.generic.sub') }), h('span', { class: 'chip warn', text: t('story.draft.chip') })));
  const first = grid.querySelector('button'); first && first.focus();
}

/* ---------- story ---------- */
function begin(tg) {
  target = tg; story = STORIES[tg.id] || genericStory(tg); ch = 0; params = { years: 0, wl: 0.15, speed: 4, play: true };
  root.className = 'overlay story in'; render(true); announce(t('story.opened', { name: loc(tg.name) }));
}
function onKey(e) {
  if (!story || e.target.matches('input')) return;
  const rtl = document.documentElement.dir === 'rtl';
  if (e.key === 'ArrowRight') go(rtl ? -1 : 1); else if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
}
function chapterText(i) {
  const c = story.chapters[i];
  if (story.generic) {
    const body = t(GEN_KEYS[i]), extra = i === 0 && target.description ? loc(target.description) : i === 3 && target.whyInfrared ? loc(target.whyInfrared) : '';
    return { title: t(GEN_TITLES[i]), body: extra || body, sub: extra ? body : '' };
  }
  return { title: loc(c.title), body: loc(c.body), sub: '' };
}

function go(d) {
  const n = clamp(ch + d, 0, story.chapters.length - 1); if (n === ch) return; ch = n; render(false, d);
}

function render(first, dir = 1) {
  cancelAnimationFrame(raf); root.textContent = '';
  const th = story.theme; root.style.cssText = `--a:${th.accent};--b:${th.accent2};--c1:${th.bg[0]};--c2:${th.bg[1]}`;
  sceneCv = h('canvas', { class: 'scene', 'aria-hidden': 'true' });
  const tx = chapterText(ch), c = story.chapters[ch], total = story.chapters.length;
  const num = String(ch + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  const words = tx.title.split(' ').map((w, i) => h('span', { class: 'w', 'aria-hidden': 'true', style: `--i:${i}`, text: w }));
  const title = h('h2', { class: 'display s-title', tabindex: '-1', 'aria-label': tx.title }, words);
  const interactive = h('div', { class: 's-inter' }); buildInteractive(interactive, c);
  const more = h('details', { class: 's-more' }, h('summary', { text: t('story.more') }), h('div', {},
    h('p', { class: 'muted', text: story.generic ? t('story.more.generic') : t('story.more.draft') }),
    target.metadata && target.metadata.length && ch === 2 ? [h('div', { class: 'chips' }, provChip(target.isSimulated)), metaList(target.metadata)] : null,
    ch === 2 && !(target.metadata && target.metadata.length) ? emptyState(t('story.facts.await')) : null));
  const text = h('div', { class: 's-text ' + (first ? '' : dir > 0 ? 'from-r' : 'from-l') }, h('span', { class: 'eyebrow' }, loc(target.name), ' · ', h('span', { class: 'ltr', text: num })), title, h('p', { class: 's-body', text: tx.body }), tx.sub ? h('p', { class: 's-body muted', text: tx.sub }) : null, interactive, more);
  const dots = h('div', { class: 's-dots', role: 'group', 'aria-label': t('story.chapters') });
  story.chapters.forEach((cc, i) => dots.append(h('button', { class: 'sdot', type: 'button', 'aria-label': `${i + 1}. ${chapterText(i).title}`, 'aria-current': i === ch ? 'step' : null, title: chapterText(i).title, onclick: () => go(i - ch) })));
  const nav = h('nav', { class: 's-nav' },
    h('button', { class: 'btn', type: 'button', disabled: ch === 0, onclick: () => go(-1) }, icon('back', 'flip-rtl'), h('span', { text: t('common.prev') })), dots,
    h('button', { class: 'btn primary', type: 'button', disabled: ch === total - 1, onclick: () => go(1) }, h('span', { text: t('common.next') }), icon('back', 'flip-next')));
  const top = h('header', { class: 's-top' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => gallery() }, icon('back', 'flip-rtl'), h('span', { text: t('story.all') })),
    h('span', { class: 'chip warn', title: t('story.draft.note'), text: story.status === 'draft' ? t('story.draft.chip') : t('story.verified') }), h('span', { class: 'chip', text: t('story.illustration') }),
    h('button', { class: 'x', type: 'button', 'aria-label': t('common.close'), onclick: hide }, icon('close')));
  root.append(sceneCv, h('div', { class: 's-shade' }), top, text, nav);
  if (story.status === 'draft') root.append(h('p', { class: 'draft-note s-draft', text: t('story.draft.note') }));
  fitScene(); startScene();
  if (!first) title.focus({ preventScroll: true }); else (root.querySelector('.s-nav .primary') || title).focus();
  announce(`${tx.title}. ${num}`);
}

/* ---------- interactive blocks ---------- */
function buildInteractive(box, c) {
  const kind = c.interactive;
  const slider = (label, key, min, max, step, fmt) => h('label', { class: 'sl2 glass' }, h('span', { text: label }), h('input', { class: 'range', type: 'range', min, max, step, value: params[key], oninput: (e) => { params[key] = Number(e.target.value); const o = e.target.nextSibling; o.textContent = fmt(params[key]); drawOnce(); } }), h('b', { class: 'ltr mono', text: fmt(params[key]) }));
  if (kind === 'motion') box.append(slider(t('story.motion.years'), 'years', 0, 100, 1, (v) => v + '%'), h('p', { class: 'muted', text: t('story.motion.note') }));
  else if (kind === 'cold') box.append(slider(t('story.cold.wl'), 'wl', 0, 1, 0.01, (v) => (v < 0.34 ? t('story.cold.short') : v < 0.67 ? t('story.cold.mid') : t('story.cold.long'))), h('p', { class: 'muted', text: t('story.cold.note') }), ladder());
  else if (kind === 'variable' || kind === 'longperiod') {
    const pb = h('button', { class: 'btn small' + (params.play ? ' on' : ''), type: 'button', 'aria-pressed': String(!!params.play), onclick: (e) => { params.play = !params.play; e.currentTarget.classList.toggle('on', params.play); e.currentTarget.setAttribute('aria-pressed', String(params.play)); startScene(); } }, icon(params.play ? 'pause' : 'play'), h('span', { text: t('story.curve.play') }));
    box.append(h('div', { class: 'tl-actions' }, pb), slider(t('story.curve.speed'), 'speed', 1, 20, 1, (v) => v + 'x'), h('p', { class: 'muted', text: t(kind === 'variable' ? 'story.variable.note' : 'story.long.note') }));
  } else if (kind === 'obs') box.append(obsBlock());
  else if (kind === 'go') {
    box.append(h('div', { class: 'actions' },
      h('button', { class: 'btn primary lg', type: 'button', onclick: () => { hide(); C.selectTarget(target); } }, icon('explore'), h('span', { text: t('story.go.sky') })),
      h('button', { class: 'btn lg', type: 'button', onclick: async () => { hide(); await C.selectTarget(target); UI.open('viewer', { mode: 'single' }); }, text: t('story.go.obs') })));
  }
}
function ladder() {
  const rows = ['story.cold.l1', 'story.cold.l2', 'story.cold.l3', 'story.cold.l4'];
  return h('div', { class: 'ladder glass', role: 'img', 'aria-label': t('story.cold.ladder_aria') }, h('span', { class: 'chip warn', text: t('prov.illustrative') }),
    rows.map((k, i) => h('div', { class: 'lrow' + (i === 3 ? ' me' : '') }, h('i', { style: `--k:${i}` }), h('span', { text: t(k) }))));
}
function obsBlock() {
  const wrap = h('div', { class: 'obs-strip glass' }, loadingState(t('common.loading')));
  (async () => {
    const pos = target.coordinates, r = await window.SX.data.getObservations(pos.ra, pos.dec, 10);
    if (!open || !wrap.isConnected) return; wrap.textContent = '';
    if (r.status === 'error') { wrap.append(errorState(r.error, () => { wrap.replaceWith(obsBlock()); })); return; }
    const list = r.status === 'ok' ? r.data.filter((o) => o.status === 'observed').sort((a, b) => new Date(a.startTime) - new Date(b.startTime)) : [];
    if (!list.length) { wrap.append(emptyState(t('tl.empty.title'), t('tl.empty.body'))); return; }
    wrap.append(h('div', { class: 'chips' }, provChip(list[0].isSimulated), h('span', { class: 'muted', text: t('story.obs.caption') })));
    const row = h('div', { class: 'thumbs' }); wrap.append(row);
    list.slice(0, 6).forEach(async (o) => {
      const cv = h('canvas', { class: 'sciimg thumb', width: 96, height: 96, role: 'img', 'aria-label': fmtDate(o.startTime, lang()) }), cell = h('figure', {}, cv, h('figcaption', { text: fmtDate(o.startTime, lang()) })); row.append(cell);
      const im = await window.SX.data.getObservationImage(o.id, 'composite', { size: 160 });
      if (im.status !== 'ok') { cell.classList.add('miss'); return; }
      try { const img = await window.SX.render.loadImage(im.data.url); window.SX.render.paint(cv, img, { encoding: im.data.encoding, palette: 'natural', brightness: 1, contrast: 1 }); } catch (e) { cell.classList.add('miss'); }
    });
  })();
  return wrap;
}

/* ---------- scenes (decorative artwork; labelled "Illustration") ---------- */
function fitScene() { const r = root.getBoundingClientRect(), dpr = prefs.lowPerf ? 1 : Math.min(2, window.devicePixelRatio || 1); sceneCv.width = Math.round(r.width * dpr); sceneCv.height = Math.round(r.height * dpr); sceneCv.dataset.dpr = dpr; }
window.addEventListener('resize', () => { if (open && story && sceneCv) { fitScene(); drawOnce(); } });

function stars(w, h2, seed, n) { const R = rngSeed(seed), a = []; for (let i = 0; i < n; i++) a.push({ x: R() * w, y: R() * h2, r: 0.4 + R() * R() * 1.6, p: R() * 6.28, hue: R() }); return a; }
let starCache = { key: '', list: [] };
function drawScene(tm) {
  const cv = sceneCv; if (!cv) return; const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, dpr = Number(cv.dataset.dpr) || 1, th = story.theme, kind = story.scene;
  const key = W + 'x' + H + target.id; if (starCache.key !== key) starCache = { key, list: stars(W, H, 7 + target.id.length * 13, prefs.lowPerf ? 160 : 420) };
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const rad = (x, y, r, c0, c1) => { const q = ctx.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c0); q.addColorStop(1, c1); ctx.fillStyle = q; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  const narrow = W / dpr < 760, hx = narrow ? W * 0.5 : W * 0.68, hy = narrow ? H * 0.26 : H * 0.46, S0 = Math.min(W, H) * (narrow ? 0.34 : 0.3);
  rad(W * 0.3, H * 0.9, W * 0.7, th.accent + '22', 'transparent'); rad(W * 0.9, H * 0.1, W * 0.6, th.accent2 + '1c', 'transparent');
  const still = document.documentElement.dataset.motion === 'reduced';
  starCache.list.forEach((s) => { const tw = still ? 1 : 0.7 + 0.3 * Math.sin(tm * 0.0012 + s.p); ctx.globalAlpha = (0.25 + s.r * 0.35) * tw; ctx.fillStyle = s.hue < 0.2 ? '#bcd4ff' : s.hue > 0.85 ? th.accent : '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * dpr, 0, 6.283); ctx.fill(); });
  ctx.globalAlpha = 1;
  const c = story.chapters[ch], inter = c.interactive;
  if (kind === 'motion') {
    const p = inter === 'motion' ? params.years / 100 : ch === 0 ? 0.35 : 0.2 + 0.6 * (still ? 0.5 : 0.5 + 0.5 * Math.sin(tm * 0.0006));
    const x0 = hx - S0 * 1.5, y0 = hy + S0 * 0.55, x1 = hx + S0 * 1.5, y1 = hy - S0 * 0.55, x = x0 + (x1 - x0) * p, y = y0 + (y1 - y0) * p;
    ctx.strokeStyle = th.accent + '88'; ctx.setLineDash([4 * dpr, 8 * dpr]); ctx.lineWidth = dpr; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i <= 10; i++) { const q = (i / 10) * p; ctx.fillStyle = th.accent + '66'; ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * q, y0 + (y1 - y0) * q, 2 * dpr, 0, 6.283); ctx.fill(); }
    if (ch === 1) { const blink = still ? 0 : Math.floor(tm / 700) % 2; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(blink ? x1 : x0, blink ? y1 : y0, 6 * dpr, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
    rad(x, y, S0 * 0.5, th.accent + 'cc', 'transparent'); ctx.fillStyle = '#fff1d8'; ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, 6.283); ctx.fill();
  } else if (kind === 'cold') {
    const v = inter === 'cold' ? params.wl : ch === 2 ? 0.7 : 0.18 + 0.12 * (still ? 0 : Math.sin(tm * 0.0008)), r = S0 * (0.28 + v * 0.35);
    rad(hx, hy, r * 3, `rgba(138,123,255,${0.05 + v * 0.35})`, 'transparent'); rad(hx, hy, r, `rgba(127,216,255,${0.12 + v * 0.75})`, 'transparent');
    ctx.strokeStyle = `rgba(127,216,255,${0.1 + v * 0.45})`; ctx.lineWidth = dpr; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(hx, hy, r * (1 + i * 0.7), 0, 6.283); ctx.stroke(); }
  } else if (kind === 'variable' || kind === 'longperiod') {
    const sp = inter === 'variable' || inter === 'longperiod' ? params.speed : 4, tt = params.play || still ? tm * 0.0003 * sp : lastT, curve = (u) => (kind === 'variable' ? 0.75 - 0.5 * Math.max(0, Math.sin(u * 3.1) * Math.sin(u * 7.3 + 1)) ** 2 * 1.6 + 0.05 * Math.sin(u * 23) : 0.55 + 0.4 * Math.sin(u * 1.4)), lv = clamp(curve(tt), 0.08, 1);
    lastT = tt; rad(hx, hy, S0 * (0.5 + lv * 0.9), th.accent + Math.round(40 + lv * 190).toString(16).padStart(2, '0'), 'transparent');
    ctx.fillStyle = `rgba(255,240,220,${0.4 + lv * 0.6})`; ctx.beginPath(); ctx.arc(hx, hy, (3 + lv * 6) * dpr, 0, 6.283); ctx.fill();
    const cx0 = narrow ? W * 0.08 : W * 0.46, cw = narrow ? W * 0.84 : W * 0.46, cy = H * (narrow ? 0.5 : 0.78), chh = H * 0.1; ctx.strokeStyle = th.accent2 + 'cc'; ctx.lineWidth = 2 * dpr; ctx.beginPath();
    for (let i = 0; i <= 160; i++) { const u = tt - 8 + (i / 160) * 8, yy = cy - clamp(curve(u), 0, 1) * chh, xx = cx0 + (i / 160) * cw; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx0 + cw, cy - lv * chh, 4 * dpr, 0, 6.283); ctx.fill();
  } else { rad(hx, hy, S0 * 0.6, th.accent + 'aa', 'transparent'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hx, hy, 4 * dpr, 0, 6.283); ctx.fill(); }
}
function drawOnce() { drawScene(performance.now()); }
function startScene() {
  cancelAnimationFrame(raf);
  const still = document.documentElement.dataset.motion === 'reduced';
  if (still) { drawOnce(); return; }
  let last = 0; const step = (tm) => { raf = requestAnimationFrame(step); if (prefs.lowPerf && tm - last < 66) return; last = tm; drawScene(tm); }; raf = requestAnimationFrame(step);
}
