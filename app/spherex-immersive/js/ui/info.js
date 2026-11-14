/* Object / position information panel with progressive disclosure:
   Layer 1 basic (everyone) -> Layer 2 explore (intermediate+, or "Show more") -> Layer 3 advanced analysis.       */
import { $, h, icon, toast, fmtDate } from '../core/dom.js';
import { S, bus, prefs } from '../core/state.js';
import { t, loc, lang } from '../core/i18n.js';
import { UI } from '../core/ui.js';
import * as C from '../core/controller.js';
import { errorState, emptyState, loadingState, provChip, metaList, qualityChips, panelHead } from './common.js';

let sky, el, open = false, more = false;
const openSec = { l2: true, l3: true, coords: true, ts: false, bands: false, meta: false, results: false, spectral: false };
const metaCache = new Map(), resCache = new Map();

export function init(skyApi) {
  sky = skyApi;
  el = h('aside', { class: 'panel info', role: 'complementary', hidden: true, tabindex: '-1' });
  $('#panels').append(el);
  UI.register('info', { kind: 'dock', open: show, close: hide, isOpen: () => open });
  ['target', 'obs', 'lang', 'level', 'visit', 'band'].forEach((e) => bus.on(e, () => open && render()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open && el.contains(document.activeElement)) hide(); });
}
function show() { open = true; el.hidden = false; render(); requestAnimationFrame(() => el.classList.add('in')); bus.emit('panel'); }
function hide() { open = false; el.classList.remove('in'); setTimeout(() => { if (!open) el.hidden = true; }, 280); bus.emit('panel'); $('#sky').focus({ preventScroll: true }); }

function section(id, title, kids, cls = '') {
  const d = h('details', { class: 'sec ' + cls, open: openSec[id] ? '' : null }, h('summary', {}, h('span', { text: title }), icon('chev')), h('div', { class: 'sec-b' }, kids));
  d.addEventListener('toggle', () => { openSec[id] = d.open; });
  return d;
}
const kv = (k, v, mono) => [h('dt', { text: k }), h('dd', { class: mono ? 'ltr mono' : '', text: v })];

function render() {
  const keep = el.querySelector('.pb') ? el.querySelector('.pb').scrollTop : 0;
  el.textContent = '';
  const tg = S.target;
  if (!tg && !S.pos) {
    el.append(panelHead(t('info.title'), hide), h('div', { class: 'pb' }, emptyState(t('info.none.title'), t('info.none.body'), h('button', { class: 'btn small', type: 'button', onclick: () => UI.open('search'), text: t('nav.search') }))));
    return;
  }
  const title = tg ? loc(tg.name) : t('sel.position');
  const sub = h('div', { class: 'chips' }, tg ? h('span', { class: 'chip', text: loc(tg.typeLabel) || t('cls.' + tg.classification) }) : null, tg ? provChip(tg.isSimulated) : provChip(true));
  const pb = h('div', { class: 'pb' });
  el.append(panelHead(title, hide, sub), pb);

  /* ===== Layer 1: basic ===== */
  const l1 = h('div', { class: 'l1' });
  if (tg) {
    l1.append(h('p', { class: 'lead', text: loc(tg.description) }));
    if (tg.whyInfrared) l1.append(h('div', { class: 'fact' }, h('span', { class: 'eyebrow', text: t('info.why_ir') }), h('p', { text: loc(tg.whyInfrared) })));
  } else {
    l1.append(h('p', { class: 'lead', text: t('info.pos.lead') }));
    if (S.nearest) l1.append(h('div', { class: 'fact' }, h('span', { class: 'eyebrow', text: t('info.nearest') }), h('p', { text: `${loc(S.nearest.name)} · ${(S.nearest.separationDeg || 0).toFixed(1)}°` }), h('button', { class: 'btn small', type: 'button', onclick: () => C.selectTarget(S.nearest), text: t('ctx.go_nearest') })));
  }
  const dl = h('dl', { class: 'kv' });
  if (tg && tg.constellation) dl.append(...kv(t('info.region'), t('const.' + tg.constellation) === 'const.' + tg.constellation ? tg.constellation : t('const.' + tg.constellation)));
  dl.append(...kv(t('info.observations'), obsSummary()));
  if (tg && tg.availability) dl.append(...kv(t('info.availability'), t('avail.' + tg.availability)));
  l1.append(dl);
  const act = h('div', { class: 'actions' });
  if (tg) act.append(h('button', { class: 'btn primary', type: 'button', onclick: () => UI.open('stories', { targetId: tg.id }) }, icon('story'), h('span', { text: t('ctx.story') })));
  act.append(h('button', { class: 'btn', type: 'button', onclick: () => UI.open('viewer', { mode: 'single' }) }, icon('observe'), h('span', { text: t('tl.open_viewer') })));
  l1.append(act);
  pb.append(l1);

  pb.append(h('button', { class: 'btn small ghost only-beginner more-btn', type: 'button', 'aria-expanded': more ? 'true' : 'false', onclick: () => { more = !more; render(); }, text: more ? t('info.less') : t('info.more') }));

  /* ===== Layer 2: explore ===== */
  const ex = h('div', { class: 'grid2' });
  const irOn = S.ir > 0.4;
  ex.append(
    h('button', { class: 'btn small' + (irOn ? ' on' : ''), type: 'button', 'aria-pressed': irOn ? 'true' : 'false', onclick: () => { bus.emit('ir-set', irOn ? 0 : 100); render(); } }, icon('ir'), h('span', { text: t('ir.toggle') })),
    h('button', { class: 'btn small', type: 'button', onclick: () => UI.open('viewer', { mode: 'single' }) }, icon('timer'), h('span', { text: t('info.timelapse') })),
    h('button', { class: 'btn small', type: 'button', onclick: () => UI.open('viewer', { mode: 'slider' }) }, icon('compare'), h('span', { text: t('viewer.mode.slider') })),
    h('button', { class: 'btn small', type: 'button', onclick: () => UI.open('viewer', { mode: 'diff' }) }, icon('layers'), h('span', { text: t('viewer.mode.diff') })));
  const fov = fovControls();
  const l2kids = [ex, fov];
  if (tg && tg.metadata && tg.metadata.length) l2kids.push(h('h4', { class: 'sub-h', text: t('info.object_info') }), metaList(tg.metadata));
  const l2 = section('l2', t('info.explore'), l2kids, 'lvl-int');
  pb.append(l2);

  /* ===== Layer 3: advanced analysis ===== */
  const l3 = h('div', { class: 'lvl-adv adv-stack' });
  const pos = tg ? tg.coordinates : S.pos, SXf = window.SX;
  const coords = h('dl', { class: 'kv' });
  coords.append(...kv('RA', pos.ra.toFixed(5) + '°', true), ...kv('', SXf.fmtRA(pos.ra), true), ...kv('Dec', pos.dec.toFixed(5) + '°', true), ...kv('', SXf.fmtDec(pos.dec), true), ...kv(t('info.frame'), 'ICRS (J2000)', true));
  l3.append(section('coords', t('info.coords'), [coords, h('button', { class: 'btn small', type: 'button', onclick: () => { const txt = `${pos.ra.toFixed(5)}, ${pos.dec.toFixed(5)}`; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(t('info.copied')), () => toast(txt)); }, text: t('info.copy') })]));
  const cur = C.currentObs();
  const ts = S.obs.length ? h('ul', { class: 'plain' }, S.obs.map((o, i) => h('li', { class: i === S.visit ? 'cur' : '' }, h('span', { class: 'ltr mono', text: o.startTime.slice(0, 10) + ' → ' + (o.endTime || '').slice(0, 10) }), h('span', { class: 'chip', text: t('status.' + o.status) })))) : emptyState(t('tl.empty.title'));
  l3.append(section('ts', t('info.timestamps'), [ts]));
  const bl = h('ul', { class: 'plain' }, S.bands.map((b) => { const ob = cur && cur.bands && cur.bands.find((x) => x.bandId === b.id); return h('li', {}, h('span', { class: 'ltr mono', text: `${b.id} · ${b.minMicron}–${b.maxMicron} µm` }), h('span', { class: 'chip ' + (ob ? (ob.available ? 'real' : 'bad') : ''), text: !cur ? '—' : ob ? (ob.available ? t('band.available') : t('band.missing')) : '—' })); }));
  l3.append(section('bands', t('info.wavelengths'), [bl]));
  if (cur) l3.append(section('meta', t('info.metadata'), [metaBlock(cur)]));
  l3.append(section('results', t('info.results'), [resultsBlock()]));
  l3.append(section('spectral', t('info.spectral'), [emptyState(t('info.spectral.title'), t('info.spectral.body'))]));
  pb.append(l3);
  pb.dataset.more = more ? '1' : '0'; el.dataset.more = more ? '1' : '0';
  pb.scrollTop = keep;
}

function obsSummary() {
  if (S.obsStatus === 'loading') return t('common.loading');
  if (S.obsStatus === 'error') return t('err.unknown');
  if (S.obsStatus !== 'ok') return t('info.obs.none');
  const n = C.observed().length, p = S.obs.length - n;
  return t('info.obs.count', { n }) + (p ? ' · ' + t('info.obs.planned', { n: p }) : '');
}

function fovControls() {
  const box = h('div', { class: 'fov' }), cur = sky.getView().fov;
  box.append(h('span', { class: 'eyebrow', text: t('stat.fov') }));
  const row = h('div', { class: 'chips' });
  [[70, 'fov.wide'], [20, 'fov.medium'], [5, 'fov.narrow'], [1, 'fov.tight']].forEach(([v, k]) => row.append(h('button', { class: 'btn small' + (Math.abs(cur - v) / v < 0.15 ? ' on' : ''), type: 'button', onclick: () => { sky.flyTo({ fov: v }); setTimeout(render, 900); }, text: t(k) })));
  box.append(row);
  const inp = h('input', { class: 'num ltr', type: 'number', min: '0.25', max: '100', step: '0.25', value: cur.toFixed(2), 'aria-label': t('fov.input') });
  const err = h('span', { class: 'ferr', role: 'alert' });
  const apply = () => { const v = Number(inp.value); if (!(v >= 0.25 && v <= 100)) { err.textContent = t('fov.invalid'); return; } err.textContent = ''; sky.flyTo({ fov: v }); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  box.append(h('div', { class: 'fov-in lvl-adv' }, inp, h('span', { text: '°' }), h('button', { class: 'btn small', type: 'button', onclick: apply, text: t('common.apply') }), err));
  return box;
}

function metaBlock(obs) {
  const wrap = h('div', {}), c = metaCache.get(obs.id);
  const loadBtn = h('button', { class: 'btn small', type: 'button', onclick: async () => {
    wrap.textContent = ''; wrap.append(loadingState());
    const r = await window.SX.data.getObservationMetadata(obs.id);
    metaCache.set(obs.id, r); renderMeta();
  }, text: t('info.meta.load') });
  function renderMeta() {
    const rr = metaCache.get(obs.id); wrap.textContent = '';
    if (!rr) { wrap.append(h('p', { class: 'muted', text: t('info.meta.hint') }), loadBtn); return; }
    if (rr.status === 'error') { wrap.append(errorState(rr.error, () => { metaCache.delete(obs.id); loadBtn.click(); })); return; }
    const d = rr.data; wrap.append(provChip(d.isSimulated), metaList(d.fields), qualityChips(d.quality));
    if (d.provenance) wrap.append(h('p', { class: 'muted ltr mono', text: [d.provenance.source, d.provenance.processingVersion, d.provenance.retrievedAt].filter(Boolean).join(' · ') }));
  }
  renderMeta(); void c; return wrap;
}

function resultsBlock() {
  const wrap = h('div', {}), list = C.observed();
  if (list.length < 2) { wrap.append(emptyState(t('info.results.need2'))); return wrap; }
  const a = list[0].o, b = list[list.length - 1].o, key = a.id + '|' + b.id;
  const btn = h('button', { class: 'btn small', type: 'button', text: t('info.results.load'), onclick: async () => { wrap.textContent = ''; wrap.append(loadingState()); const r = await window.SX.data.getComparisonResult(a.id, b.id, { bandId: S.band === 'composite' ? 4 : S.band }); resCache.set(key, r); draw(); } });
  function draw() {
    wrap.textContent = ''; const rr = resCache.get(key);
    if (!rr) { wrap.append(h('p', { class: 'muted', text: t('info.results.hint') }), btn); return; }
    if (rr.status === 'error') { wrap.append(rr.error && rr.error.code === 'unsupported' ? emptyState(t('info.results.unsupported'), rr.error.message) : errorState(rr.error, () => btn.click())); return; }
    const d = rr.data;
    wrap.append(provChip(d.isSimulated), metaList([{ key: 'changedFraction', value: (d.summary.changedPixelFraction * 100).toFixed(2) + '%' }, { key: 'peakChange', value: d.summary.peakChange }, { key: 'significance', value: t('sig.' + d.summary.significance) }]));
    if (d.notes) wrap.append(h('p', { class: 'muted', text: loc(d.notes) }));
    wrap.append(h('button', { class: 'btn small', type: 'button', onclick: () => UI.open('viewer', { mode: 'diff' }), text: t('viewer.mode.diff') }));
  }
  draw(); return wrap;
}
