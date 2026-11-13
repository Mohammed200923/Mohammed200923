import { TARGETS } from './targets.js';
import { DETECTORS, PIXEL_SCALE_ARCSEC, wavelengthColor, wavelengthAt } from './spherex.js';
import { parseCoordinates, makeGrid, propagate, mjdToYear, mjdToDate, formatRa, formatDec } from './wcs.js';
import { detectProxy, pool } from './net.js';
import { decodeCutout, reproject, buildSequence, percentiles, coadd, aperturePhotometry } from './stack.js';
import { toImageData, drawFrame, canvasToGrid } from './render.js';
import { gaiaCone, resolveName } from './catalogs.js';
import { scatterPlot } from './charts.js';
import { irsaProvider } from './providers/irsa.js';
import { simulatedProvider } from './providers/simulated.js';

const PROVIDERS = { irsa: irsaProvider, sim: simulatedProvider };
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');

const state = {
  target: null, provider: null, grid: null,
  frames: [], seq: [], idx: 0, playing: false, timer: null,
  stats: null, reference: null, diffStats: null,
  gaia: null, gaiaKey: '', pick: null, measurements: [],
  aladin: null, aladinOverlay: null, cache: new Map(),
};

// ---------- setup ----------

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

function setProgress(frac) {
  const wrap = document.querySelector('.progress');
  wrap.hidden = frac == null;
  $('bar').style.width = `${Math.round((frac || 0) * 100)}%`;
}

function buildControls() {
  const chips = $('quick-targets');
  for (const t of TARGETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.name;
    b.title = t.kind;
    b.dataset.key = t.key;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      $('target').value = t.name;
      $('size').value = t.sizeArcmin;
      updateSizeLabel();
      run();
    });
    chips.appendChild(b);
  }
  const dets = $('detectors');
  for (const d of DETECTORS) {
    const l = document.createElement('label');
    l.title = `${d.min.toFixed(2)}–${d.max.toFixed(2)} µm`;
    l.innerHTML = `<input type="checkbox" value="${d.id}" checked> D${d.id}`;
    dets.appendChild(l);
  }
  document.querySelectorAll('.presets button').forEach((b) => b.addEventListener('click', () => {
    const [a, c] = b.dataset.wl.split(',');
    $('wmin').value = a; $('wmax').value = c;
  }));
  $('size').addEventListener('input', updateSizeLabel);
  updateSizeLabel();
}

function updateSizeLabel() {
  $('size-val').textContent = `${$('size').value}′`;
}

function selectedDetectors() {
  return [...document.querySelectorAll('#detectors input:checked')].map((i) => Number(i.value));
}

// ---------- URL state (shareable / embeddable) ----------

function readUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('embed') === '1') document.body.classList.add('embed');
  const set = (id, key = id) => { if (p.has(key)) $(id).value = p.get(key); };
  set('target', 'q'); set('size'); set('source', 'src'); set('wmin'); set('wmax'); set('mode');
  set('stretch'); set('cmap'); set('fps');
  if (p.has('ra') && p.has('dec') && !p.has('q')) $('target').value = `${p.get('ra')} ${p.get('dec')}`;
  if (p.has('det')) {
    const ds = p.get('det').split('').map(Number);
    document.querySelectorAll('#detectors input').forEach((i) => (i.checked = ds.includes(Number(i.value))));
  }
  if (p.get('diff') === '1') $('diff').checked = true;
  updateSizeLabel();
  return Boolean($('target').value.trim());
}

function shareUrl(extra = {}) {
  const p = new URLSearchParams({
    q: $('target').value.trim(),
    size: $('size').value, src: $('source').value,
    wmin: $('wmin').value, wmax: $('wmax').value,
    det: selectedDetectors().join(''), mode: $('mode').value,
    stretch: $('stretch').value, cmap: $('cmap').value, fps: $('fps').value,
  });
  if (state.target) { p.set('ra', state.target.ra.toFixed(5)); p.set('dec', state.target.dec.toFixed(5)); }
  if ($('diff').checked) p.set('diff', '1');
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `${location.origin}${location.pathname}?${p}`;
}

// ---------- target resolution ----------

async function resolveTarget(text) {
  const quick = TARGETS.find((t) => t.name.toLowerCase() === text.toLowerCase() || t.key === text.toLowerCase());
  if (quick) return { ...quick };
  const coords = parseCoordinates(text);
  if (coords) return { name: `${formatRa(coords.ra)} ${formatDec(coords.dec)}`, ...coords, pmra: 0, pmdec: 0, epoch: 2000 };
  setStatus(`Resolving “${text}” with CDS Sesame…`);
  return await resolveName(text);
}

// ---------- main pipeline ----------

async function run() {
  stop();
  const text = $('target').value.trim();
  if (!text) { setStatus('Enter an object name or coordinates.', true); return; }
  $('go').disabled = true;
  document.querySelectorAll('#quick-targets button').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.textContent.toLowerCase() === text.toLowerCase())));
  try {
    const target = await resolveTarget(text);
    // Centre the field on where the object is during the SPHEREx survey.
    const [ra, dec] = target.pmra || target.pmdec
      ? propagate(target.ra, target.dec, target.pmra, target.pmdec, target.epoch, 2026.0)
      : [target.ra, target.dec];
    state.target = { ...target, cra: ra, cdec: dec };
    const provider = PROVIDERS[$('source').value];
    state.provider = provider;
    const sizeArcmin = Number($('size').value);
    state.grid = makeGrid(ra, dec, sizeArcmin, PIXEL_SCALE_ARCSEC);
    centerAladin(ra, dec, sizeArcmin);

    setStatus(`Searching ${provider.label} at ${formatRa(ra)} ${formatDec(dec)}…`);
    setProgress(0);
    const all = await provider.search({ ra, dec, collection: $('collection').value.trim(), target });
    const wmin = Number($('wmin').value), wmax = Number($('wmax').value);
    const dets = selectedDetectors();
    // Each SPHEREx image spans a range of wavelengths across the detector; keep any that overlap.
    let list = all.filter((d) => d.wlMax >= wmin && d.wlMin <= wmax && dets.includes(d.detector));
    if (!list.length) {
      throw new Error(all.length
        ? `${all.length} images cover this spot, but none match the wavelength/detector filter.`
        : 'No SPHEREx images cover this position yet.');
    }
    const max = Math.max(1, Number($('max').value));
    if (list.length > max) list = evenlySample(list, max);

    setStatus(`Downloading ${list.length} cutouts (of ${all.length} images)…`);
    const sizeDeg = (sizeArcmin / 60) * 1.45; // covers the grid at any roll angle
    const opts = { subtractZodi: $('zodi').checked, maskFlags: $('mask').checked };
    const results = await pool(list, provider.concurrency || 6, async (desc) => {
      const key = `${provider.id}|${desc.id}|${ra.toFixed(5)}|${dec.toFixed(5)}|${sizeDeg.toFixed(4)}`;
      let buf = state.cache.get(key);
      if (!buf) {
        buf = await provider.fetchCutout(desc, { ra, dec, sizeDeg });
        state.cache.set(key, buf);
      }
      const frame = await decodeCutout(buf, desc, opts);
      frame.aligned = reproject(frame, state.grid);
      if (provider.waveTable) {
        // Exact wavelength at the target for this exposure (linear variable filter).
        const table = await provider.waveTable(desc, { ra, dec }).catch(() => null);
        if (table) {
          frame.lambdaAt = (r, d) => {
            const [px, py] = frame.wcs.worldToPix(r, d);
            return wavelengthAt(table, frame.header, px, py)?.[0] ?? frame.wl;
          };
          frame.wl = frame.lambdaAt(ra, dec);
          frame.wlExact = true;
        }
      }
      return frame;
    }, (done, total) => setProgress(done / total));

    const frames = results.filter((r) => r && !r.error && (!r.wlExact || (r.wl >= wmin && r.wl <= wmax)));
    const failed = results.length - frames.length;
    if (!frames.length) {
      throw results.find((r) => r?.error)?.error ||
        new Error('No exposure has this spot inside the chosen wavelength range. Widen the range.');
    }
    state.frames = frames;
    state.pick = null;
    state.measurements = [];
    rebuildSequence();
    $('empty').hidden = true;
    try { history.replaceState(null, '', shareUrl()); } catch { /* sandboxed frames may refuse */ }
    setStatus(`${state.target.name}: ${frames.length} exposures → ${state.seq.length} frames` +
      (failed ? ` (${failed} cutouts failed)` : '') + (provider.simulated ? ' — SIMULATED data' : ''));
    if ($('ov-gaia').checked) loadGaia();
    play();
  } catch (e) {
    console.error(e);
    setStatus(e.message || String(e), true);
  } finally {
    setProgress(null);
    $('go').disabled = false;
  }
}

function evenlySample(list, max) {
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.round((i * (list.length - 1)) / (max - 1 || 1))]);
  return [...new Set(out)];
}

function rebuildSequence() {
  if (!state.frames.length) return;
  state.seq = buildSequence(state.frames, { mode: $('mode').value, gapDays: Number($('gap').value) });
  const arrays = state.seq.map((s) => s.data);
  const [lo, hi] = percentiles(arrays, [1, 99.7]);
  state.stats = { lo, hi };
  state.reference = arrays.length > 1 ? coadd(arrays, 'median') : null;
  if (state.reference) {
    const diffs = arrays.map((a) => a.map((v, i) => Math.abs(v - state.reference[i])));
    const [d] = percentiles(diffs, [99.5]);
    state.diffStats = { lo: -d, hi: d };
  }
  state.idx = Math.min(state.idx, state.seq.length - 1);
  $('scrub').max = String(state.seq.length - 1);
  render();
  updateMeasurements();
}

// ---------- rendering ----------

function currentImage(i) {
  const s = state.seq[i];
  const n = state.grid.n;
  const diff = $('diff').checked && state.reference;
  const data = diff ? s.data.map((v, k) => v - state.reference[k]) : s.data;
  const { lo, hi } = diff ? state.diffStats : state.stats;
  return toImageData(data, n, {
    lo, hi, stretch: $('stretch').value, cmap: $('cmap').value, diverging: Boolean(diff),
  });
}

function targetPosition(mjd) {
  const t = state.target;
  const [ra, dec] = propagate(t.ra, t.dec, t.pmra || 0, t.pmdec || 0, t.epoch ?? 2000, mjdToYear(mjd));
  const [x, y] = state.grid.wcs.worldToPix(ra, dec);
  return { x, y, ra, dec };
}

function overlays(s) {
  const out = [];
  const n = state.grid.n;
  const t = state.target;
  if ($('ov-track').checked && t && (t.pmra || t.pmdec)) {
    out.push({
      type: 'track', color: '#7ee0ff',
      points: state.seq.map((f) => targetPosition(f.mjd)),
      current: targetPosition(s.mjd), label: t.name,
    });
  }
  if ($('ov-gaia').checked && state.gaia) {
    const year = mjdToYear(s.mjd);
    const slow = [], fast = [];
    for (const g of state.gaia) {
      const [ra, dec] = propagate(g.ra, g.dec, g.pmra, g.pmdec, 2016.0, year);
      const [x, y] = state.grid.wcs.worldToPix(ra, dec);
      if (x < -2 || y < -2 || x > n + 1 || y > n + 1) continue;
      const pm = Math.hypot(g.pmra, g.pmdec);
      (pm > 150 ? fast : slow).push({ x, y });
    }
    out.push({ type: 'circles', color: 'rgba(160,255,160,0.55)', width: 1, r: 1.6, points: slow });
    out.push({ type: 'circles', color: '#ffe066', width: 2, r: 2.6, points: fast });
  }
  if (state.pick) {
    const p = pickPosition(s.mjd);
    out.push({ type: 'marker', color: '#ffffff', x: p.x, y: p.y, r: 2, rin: 4, rout: 7 });
  }
  return out;
}

function captions(s) {
  const d0 = mjdToDate(s.mjdRange ? s.mjdRange[0] : s.mjd);
  const d1 = s.mjdRange ? mjdToDate(s.mjdRange[1]) : null;
  const iso = (d) => d.toISOString().slice(0, 10);
  const date = d1 && iso(d1) !== iso(d0) ? `${iso(d0)} → ${iso(d1)}` : `${iso(d0)} ${d0.toISOString().slice(11, 16)} UTC`;
  const wl = s.wlMin === s.wlMax ? `λ ≈ ${s.wlMin.toFixed(2)} µm` : `λ ${s.wlMin.toFixed(2)}–${s.wlMax.toFixed(2)} µm`;
  return {
    title: state.target?.name || '',
    lines: [`${s.label} · ${date}`, `${wl} · ${s.members.length} exposure${s.members.length > 1 ? 's' : ''}${$('diff').checked ? ' · difference' : ''}`],
    footer: `NASA SPHEREx${state.provider?.simulated ? ' (simulated)' : ' · IRSA'} · SkyShift`,
  };
}

function render() {
  if (!state.seq.length) return;
  const s = state.seq[state.idx];
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  drawFrame(ctx, size, state.grid.n, currentImage(state.idx), {
    smooth: $('smooth').checked, overlays: overlays(s), captions: captions(s),
    simulated: state.provider?.simulated, scaleArcsec: state.grid.scaleArcsec,
  });
  $('scrub').value = String(state.idx);
  $('frame-label').textContent = `${state.idx + 1}/${state.seq.length} · ${mjdToDate(s.mjd).toISOString().slice(0, 10)}`;
  updateMeta(s);
}

function updateMeta(s) {
  const dets = [...new Set(s.members.map((m) => m.detector))].sort().map((d) => `D${d}`).join(', ');
  const masked = s.members.reduce((a, m) => a + m.maskedFraction, 0) / s.members.length;
  const ids = s.members.slice(0, 4).map((m) => m.obsId || m.id).join('<br>') + (s.members.length > 4 ? `<br>… +${s.members.length - 4} more` : '');
  const rows = [
    ['Source', state.provider.label],
    ['Centre', `${formatRa(state.grid.wcs.crval[0])}<br>${formatDec(state.grid.wcs.crval[1])}`],
    ['Date (mid)', mjdToDate(s.mjd).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
    ['MJD', s.mjd.toFixed(3)],
    ['Wavelength', `${s.wlMin.toFixed(2)}–${s.wlMax.toFixed(2)} µm`],
    ['Detectors', dets],
    ['Exposures', String(s.members.length)],
    ['Flagged pixels masked', `${(masked * 100).toFixed(1)}%`],
    ['Zodiacal light', s.members[0].zodiSubtracted ? 'subtracted' : 'not subtracted'],
    ['Images', ids],
  ];
  $('meta').tBodies[0].innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}

// ---------- playback ----------

function play() {
  if (state.seq.length < 2) return;
  state.playing = true;
  $('play').textContent = '⏸';
  $('play').setAttribute('aria-label', 'Pause');
  clearInterval(state.timer);
  state.timer = setInterval(() => step(1), 1000 / Number($('fps').value));
}

function stop() {
  state.playing = false;
  clearInterval(state.timer);
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', 'Play');
}

function step(d) {
  if (!state.seq.length) return;
  state.idx = (state.idx + d + state.seq.length) % state.seq.length;
  render();
}

// ---------- Gaia overlay ----------

async function loadGaia() {
  if (!state.grid) return;
  const key = `${state.grid.wcs.crval.join(',')}|${state.grid.n}`;
  if (state.gaiaKey === key && state.gaia) { render(); return; }
  try {
    setStatus('Loading Gaia DR3 stars from CDS VizieR…');
    const radius = (state.grid.n * state.grid.scaleArcsec) * 0.75;
    state.gaia = await gaiaCone(state.grid.wcs.crval[0], state.grid.wcs.crval[1], radius);
    state.gaiaKey = key;
    const fast = state.gaia.filter((g) => Math.hypot(g.pmra, g.pmdec) > 150).length;
    setStatus(`Gaia DR3: ${state.gaia.length} stars (${fast} with proper motion > 150 mas/yr, yellow).`);
    render();
  } catch (e) {
    setStatus(`Gaia overlay unavailable: ${e.message}`, true);
  }
}

// ---------- click-to-measure ----------

function pickPosition(mjd) {
  const p = state.pick;
  if (p.follow) return targetPosition(mjd);
  return { x: p.x, y: p.y };
}

function onCanvasClick(ev) {
  if (!state.seq.length) return;
  const rect = canvas.getBoundingClientRect();
  const cx = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const cy = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  let [x, y] = canvasToGrid(cx, cy, state.grid.n, canvas.width);
  const s = state.seq[state.idx];
  // Snap to the brightest pixel nearby in the current frame.
  [x, y] = peakNear(s.data, state.grid.n, x, y, 2);
  const t = state.target;
  let follow = false;
  if (t && (t.pmra || t.pmdec)) {
    const tp = targetPosition(s.mjd);
    follow = Math.hypot(tp.x - x, tp.y - y) < 3;
  }
  state.pick = { x, y, follow };
  updateMeasurements();
  render();
}

function peakNear(data, n, x, y, r) {
  let best = [Math.round(x), Math.round(y)], bv = -Infinity;
  for (let j = Math.round(y) - r; j <= Math.round(y) + r; j++) {
    for (let i = Math.round(x) - r; i <= Math.round(x) + r; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const v = data[j * n + i];
      if (v > bv) { bv = v; best = [i, j]; }
    }
  }
  return best;
}

function updateMeasurements() {
  const spec = $('spectrum'), lc = $('lightcurve');
  if (!state.pick || !state.frames.length) {
    scatterPlot(spec, []); scatterPlot(lc, []);
    $('export-csv').disabled = true;
    return;
  }
  const n = state.grid.n;
  const visitOf = new Map();
  state.seq.forEach((s, i) => s.members.forEach((m) => visitOf.set(m, i)));
  state.measurements = state.frames.map((f) => {
    const p = pickPosition(f.mjd);
    return {
      mjd: f.mjd, wl: f.lambdaAt ? f.lambdaAt(...state.grid.wcs.pixToWorld(p.x, p.y)) : f.wl,
      detector: f.detector, id: f.obsId || f.id,
      visit: visitOf.get(f) ?? 0,
      flux: aperturePhotometry(f.aligned, n, p.x, p.y, state.grid.scaleArcsec),
    };
  }).filter((m) => Number.isFinite(m.flux));

  const p0 = pickPosition(state.seq[state.idx].mjd);
  const [ra, dec] = state.grid.wcs.pixToWorld(p0.x, p0.y);
  $('pick-info').innerHTML = `${formatRa(ra)} ${formatDec(dec)}${state.pick.follow ? ` · following ${state.target.name}'s predicted motion` : ''} · ${state.measurements.length} measurements`;

  const visits = state.seq.length;
  const current = state.seq[state.idx];
  scatterPlot(spec, state.measurements.map((m) => ({
    x: m.wl, y: m.flux, color: `hsl(${(m.visit * 360) / Math.max(visits, 1) + 30}, 75%, 60%)`, m,
  })), { xLabel: 'wavelength (µm) — colour = visit', yLabel: 'flux (mJy)', xFormat: (v) => v.toFixed(1),
    highlight: (p) => current.members.some((f) => (f.obsId || f.id) === p.m.id) });
  scatterPlot(lc, state.measurements.map((m) => ({
    x: mjdToYear(m.mjd), y: m.flux, color: wavelengthColor(m.wl), m,
  })), { xLabel: 'year — colour = wavelength', yLabel: 'flux (mJy)', xFormat: (v) => v.toFixed(2) });
  $('export-csv').disabled = !state.measurements.length;
}

// ---------- exports ----------

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function fileStem() {
  return `skyshift-${(state.target?.name || 'sky').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
}

async function exportVideo() {
  if (!state.seq.length) return;
  if (typeof MediaRecorder === 'undefined') { setStatus('Video recording is not supported in this browser.', true); return; }
  stop();
  const fps = Number($('fps').value);
  const mime = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  setStatus('Recording video…');
  rec.start();
  const loops = state.seq.length < 6 ? 3 : 2;
  for (let k = 0; k < loops * state.seq.length; k++) {
    state.idx = k % state.seq.length;
    render();
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }
  rec.stop();
  await done;
  const type = rec.mimeType || 'video/webm';
  download(new Blob(chunks, { type }), `${fileStem()}.${type.includes('mp4') ? 'mp4' : 'webm'}`);
  setStatus('Video saved.');
}

function exportCsv() {
  const head = 'obs_id,mjd,year,wavelength_um,detector,visit,flux_mJy';
  const lines = state.measurements.map((m) =>
    [m.id, m.mjd.toFixed(5), mjdToYear(m.mjd).toFixed(4), m.wl.toFixed(4), m.detector, m.visit + 1, m.flux.toPrecision(5)].join(','));
  download(new Blob([[head, ...lines].join('\n')], { type: 'text/csv' }), `${fileStem()}-photometry.csv`);
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`${what} copied to clipboard.`);
  } catch {
    prompt(`Copy the ${what.toLowerCase()}:`, text);
  }
}

// ---------- Aladin Lite context view ----------

function initAladin() {
  if (!window.A) { $('aladin').innerHTML = '<p class="muted small" style="padding:12px">Sky context viewer could not be loaded.</p>'; return; }
  A.init.then(() => {
    state.aladin = A.aladin('#aladin', {
      survey: $('hips').value, fov: 0.3, target: '269.452 4.693',
      showReticle: true, showZoomControl: false, showFullscreenControl: false,
      showLayersControl: false, showGotoControl: false, showFrame: false, showCooGridControl: false,
      showProjectionControl: false, showSettingsControl: false, showSimbadPointerControl: false,
      showShareControl: false, showStatusBar: false,
    });
    state.aladinOverlay = A.graphicOverlay({ color: '#ffb347', lineWidth: 2 });
    state.aladin.addOverlay(state.aladinOverlay);
    if (state.grid) centerAladin(state.grid.wcs.crval[0], state.grid.wcs.crval[1], Number($('size').value));
  }).catch(() => {});
}

function centerAladin(ra, dec, sizeArcmin) {
  const al = state.aladin;
  if (!al || !state.grid) return;
  try {
    al.gotoRaDec(ra, dec);
    al.setFoV((sizeArcmin / 60) * 3);
    state.aladinOverlay.removeAll();
    const n = state.grid.n, w = state.grid.wcs;
    const corners = [[-0.5, -0.5], [n - 0.5, -0.5], [n - 0.5, n - 0.5], [-0.5, n - 0.5]].map(([x, y]) => w.pixToWorld(x, y));
    state.aladinOverlay.add(A.polygon(corners));
  } catch (e) { console.warn('Aladin update failed', e); }
}

// ---------- wiring ----------

function wire() {
  $('search-form').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('play').addEventListener('click', () => (state.playing ? stop() : play()));
  $('prev').addEventListener('click', () => { stop(); step(-1); });
  $('next').addEventListener('click', () => { stop(); step(1); });
  $('scrub').addEventListener('input', () => { stop(); state.idx = Number($('scrub').value); render(); });
  $('fps').addEventListener('input', () => state.playing && play());
  for (const id of ['stretch', 'cmap', 'diff', 'smooth', 'ov-track']) $(id).addEventListener('change', render);
  $('ov-gaia').addEventListener('change', () => ($('ov-gaia').checked ? loadGaia() : render()));
  $('mode').addEventListener('change', rebuildSequence);
  $('gap').addEventListener('change', rebuildSequence);
  canvas.addEventListener('click', onCanvasClick);
  $('export-video').addEventListener('click', exportVideo);
  $('export-png').addEventListener('click', () => canvas.toBlob((b) => download(b, `${fileStem()}-${state.idx + 1}.png`)));
  $('export-csv').addEventListener('click', exportCsv);
  $('copy-link').addEventListener('click', () => copy(shareUrl(), 'Link'));
  $('copy-embed').addEventListener('click', () =>
    copy(`<iframe src="${shareUrl({ embed: '1' })}" width="560" height="700" style="border:0" title="SkyShift SPHEREx time-lapse" loading="lazy"></iframe>`, 'Embed code'));
  $('hips').addEventListener('change', () => {
    const al = state.aladin;
    if (!al) return;
    try { al.setBaseImageLayer ? al.setBaseImageLayer($('hips').value) : al.setImageSurvey($('hips').value); } catch {}
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); state.playing ? stop() : play(); }
    if (e.key === 'ArrowLeft') { stop(); step(-1); }
    if (e.key === 'ArrowRight') { stop(); step(1); }
    if (e.key.toLowerCase() === 'd') { $('diff').checked = !$('diff').checked; render(); }
  });
  window.addEventListener('resize', () => updateMeasurements());
}

async function main() {
  buildControls();
  wire();
  const hasQuery = readUrl();
  const proxy = await detectProxy();
  setStatus(proxy ? 'Connected via local archive proxy.' : 'Ready. Direct archive access (run server.py if requests are blocked).');
  scatterPlot($('spectrum'), []);
  scatterPlot($('lightcurve'), []);
  initAladin();
  if (hasQuery) run();
}

main();

// Exposed for automated tests.
window.__skyshift = state;
