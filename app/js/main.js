import { TARGETS } from './targets.js';
import { DETECTORS, PIXEL_SCALE_ARCSEC, wavelengthColor, wavelengthAt } from './spherex.js';
import { parseCoordinates, makeGrid, propagate, mjdToYear, mjdToDate, formatRa, formatDec, separationArcsec } from './wcs.js';
import { detectProxy, pool } from './net.js';
import { decodeCutout, reproject, buildSequence, percentiles, coadd, measure, relativeBrightness, visitBrightness, apertureSaturated } from './stack.js';
import { findMovers, moverAt, toProperMotion, addEpoch } from './movers.js';
import { toImageData, drawFrame, canvasToGrid } from './render.js';
import { gaiaCone, resolveName } from './catalogs.js';
import { scatterPlot } from './charts.js';
import { irsaProvider } from './providers/irsa.js';
import { simulatedProvider } from './providers/simulated.js';
import { allwiseCutout, catwiseCone, cleanCatwiseMovers, CATWISE_EPOCH } from './providers/wise.js';
import { smallBodies, bodyAt, horizonsPositions } from './providers/jpl.js';

const PROVIDERS = { irsa: irsaProvider, sim: simulatedProvider };
const $ = (id) => document.getElementById(id);
const canvas = $('view');
const ctx = canvas.getContext('2d');

const state = {
  target: null, provider: null, grid: null,
  frames: [], seq: [], idx: 0, playing: false, timer: null,
  stats: null, reference: null, diffStats: null,
  gaia: null, gaiaKey: '', pick: null, measurements: [], movers: [], sample: null,
  wiseFrame: null, catwise: null, wiseKey: '',
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
      // Each chip sets the view that works best for that object.
      $('target').value = t.name;
      $('size').value = t.sizeArcmin;
      $('wmin').value = t.wmin ?? 0.75;
      $('wmax').value = t.wmax ?? 5;
      $('max').value = t.max ?? 36;
      document.querySelectorAll('#detectors input').forEach((i) => (i.checked = true));
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
  set('stretch'); set('cmap'); set('fps'); set('max');
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
    det: selectedDetectors().join(''), mode: $('mode').value, max: $('max').value,
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
    const available = list.length;
    if (list.length > max) list = evenlySample(list, max);
    state.sample = { used: list.length, available, total: all.length };

    setStatus(`Downloading ${list.length} cutouts (of ${all.length} images)…`);
    const sizeDeg = (sizeArcmin / 60) * 1.45; // covers the grid at any roll angle
    const opts = { subtractZodi: $('zodi').checked, maskFlags: $('mask').checked };
    const loadOne = async (desc) => {
      const key = `${provider.id}|${desc.id}|${ra.toFixed(5)}|${dec.toFixed(5)}|${sizeDeg.toFixed(4)}`;
      let buf = state.cache.get(key);
      if (!buf) {
        buf = await provider.fetchCutout(desc, { ra, dec, sizeDeg });
        state.cache.set(key, buf);
      }
      const frame = await decodeCutout(buf, desc, opts);
      frame.aligned = reproject(frame, state.grid);
      frame.alignedVar = frame.variance ? reproject(frame, state.grid, frame.variance) : null;
      frame.alignedSat = frame.saturated ? reproject(frame, state.grid, frame.saturated) : null;
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
    };
    const results = await pool(list, provider.concurrency || 6, loadOne, (done, total) => setProgress(done / total));
    // The archive refuses some requests when busy; give those a second, gentler pass.
    const retry = results.map((r, i) => (r?.error ? i : -1)).filter((i) => i >= 0);
    if (retry.length) {
      setStatus(`Retrying ${retry.length} cutouts the archive refused, one at a time…`);
      await new Promise((r) => setTimeout(r, 4000));
      const again = await pool(retry.map((i) => list[i]), 1, loadOne, (done, total) => setProgress(done / total));
      retry.forEach((i, j) => { results[i] = again[j]; });
    }
    const firstError = results.find((r) => r?.error)?.error;
    if (firstError) console.warn('Cutout failures, e.g.:', firstError);

    const frames = results.filter((r) => r && !r.error && (!r.wlExact || (r.wl >= wmin && r.wl <= wmax)));
    const failed = results.filter((r) => !r || r.error).length;
    const outside = results.length - frames.length - failed; // exact λ at the target fell outside the range
    if (!frames.length) {
      throw results.find((r) => r?.error)?.error ||
        new Error('No exposure has this spot inside the chosen wavelength range. Widen the range.');
    }
    state.frames = frames;
    state.pick = null;
    state.measurements = [];
    state.movers = [];
    // A new field's movers wait for its own catalogues (the look-ups start just below).
    const fieldKey = `${state.grid.wcs.crval.join(',')}|${state.grid.n}`;
    state.gaiaPending = state.gaiaKey !== fieldKey;
    state.catwisePending = !provider.simulated && state.wiseKey !== fieldKey;
    rebuildSequence();
    updateSampleNote();
    $('empty').hidden = true;
    try { history.replaceState(null, '', shareUrl()); } catch { /* sandboxed frames may refuse */ }
    setStatus(`${state.target.name}: ${frames.length} exposures → ${state.seq.length} frames` +
      (failed ? ` (${failed} cutouts failed: ${firstError?.message || 'unknown error'})` : '') +
      (outside ? ` (${outside} outside the wavelength range at this position)` : '') +
      (provider.simulated ? ' — SIMULATED data' : ''));
    // Gaia is needed to tell known movers from new ones, whether or not its overlay is shown.
    loadGaia({ quiet: !$('ov-gaia').checked });
    if (!provider.simulated) { loadWise(); loadSmallBodies(); }
    else {
      state.wiseFrame = null; state.catwise = null; state.wiseKey = '';
      state.bodies = null; renderBodies('Known asteroids and comets are looked up for real NASA data only.');
      $('wise-status').textContent = 'The WISE comparison (2010 image, CatWISE2020) needs real NASA data.';
    }
    play();
  } catch (e) {
    console.error(e);
    setStatus(e.message || String(e), true);
  } finally {
    setProgress(null);
    $('go').disabled = false;
  }
}

function updateSampleNote() {
  const s = state.sample, note = $('sample-note'), btn = $('load-all');
  if (!s) { note.hidden = btn.hidden = true; return; }
  note.hidden = false;
  note.textContent = s.used < s.available
    ? `Using ${s.used} of ${s.available} matching images (spread evenly in time). More images: less noise, slower load.`
    : `Using all ${s.available} matching images.`;
  btn.hidden = s.used >= s.available;
  btn.textContent = `Use all ${s.available} images`;
}

function evenlySample(list, max) {
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.round((i * (list.length - 1)) / (max - 1 || 1))]);
  return [...new Set(out)];
}

function rebuildSequence() {
  if (!state.frames.length) return;
  const sphx = buildSequence(state.frames, { mode: $('mode').value, gapDays: Number($('gap').value) });
  // The 2010 WISE frame, when loaded, opens the movie; it has its own brightness scale and is
  // kept out of the SPHEREx statistics, difference reference and mover search.
  state.seq = state.wiseFrame && $('wise-frame').checked ? [state.wiseFrame, ...sphx] : sphx;
  const arrays = sphx.map((s) => s.data);
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
  searchMovers();
  render();
  updateMeasurements();
}

// ---------- automatic mover search ----------

function searchMovers() {
  // Always on survey visits (stacked), whatever the player shows: single exposures mix wavelengths.
  const visits = $('mode').value === 'visit'
    ? state.seq.filter((s) => !s.instrument)
    : buildSequence(state.frames, { mode: 'visit', gapDays: Number($('gap').value) });
  if (visits.length < 2) {
    state.movers = [];
    renderMovers('Needs at least two survey visits.');
    return;
  }
  const { movers, possible, anchorSources } = findMovers(visits, state.grid.n);
  const t = state.target;
  const tiers = [...movers.slice(0, 8).map((m) => [m, 'confident']), ...possible.slice(0, 5).map((m) => [m, 'possible'])];
  // With the 2010 WISE image loaded, each mover's baseline is extended to ~15 years. A faint
  // "possible" mover confirmed there is promoted; one with nothing at its predicted 2010
  // position is hidden (and counted), since it is most likely a blend or noise.
  state.hiddenByWise = 0;
  const checked = tiers.map(([found, tier]) => {
    if (!state.wiseFrame) return { m: found, tier, wise: null };
    const before = toProperMotion(found, state.grid.scaleArcsec);
    const r = addEpoch(found, state.wiseFrame.data, state.grid.n, mjdToYear(state.wiseFrame.mjd), anchorSources);
    if (r.fit) return { m: r.fit, tier: 'confident', wise: { confirmed: true, point: r.point, before } };
    if (tier === 'possible') { state.hiddenByWise++; return null; }
    return { m: found, tier, wise: { confirmed: false, reason: r.rejected, before } };
  }).filter(Boolean);
  state.movers = checked.map(({ m, tier, wise }, i) => {
    const pm = toProperMotion(m, state.grid.scaleArcsec);
    const [ra, dec] = state.grid.wcs.pixToWorld(m.x0, m.y0);
    const years = visits.map((v) => mjdToYear(v.mjd));
    let isTarget = false;
    if (t && (t.pmra || t.pmdec)) {
      const tp = targetPosition((m.t0 - 2000) * 365.25 + 51544.5);
      isTarget = Math.hypot(tp.x - m.x0, tp.y - m.y0) < 2.5;
    }
    return {
      ...m, ...pm, ra, dec, n: i + 1, isTarget, tier, wise,
      first: Math.min(...years), last: Math.max(...years), gaia: classifyMover(ra, dec, m.t0, pm),
    };
  });
  renderMovers();
}

/**
 * Find a catalogue star at this position (at the mover's epoch) that also moves like it.
 * Unrelated slow stars nearby don't count. pm in arcsec/yr; catalogue pm in mas/yr.
 */
function matchCatalogue(list, epoch, ra, dec, year, pm) {
  const radius = 2.5 * state.grid.scaleArcsec;
  const tolerance = Math.max(0.6, 3 * pm.err);
  let best = null, bestDiff = Infinity;
  for (const g of list) {
    const [gr, gd] = propagate(g.ra, g.dec, g.pmra, g.pmdec, epoch, year);
    if (separationArcsec(ra, dec, gr, gd) > radius) continue;
    const diff = Math.hypot(g.pmra / 1000 - pm.pmra, g.pmdec / 1000 - pm.pmdec);
    if (diff < bestDiff) { bestDiff = diff; best = g; }
  }
  return best && bestDiff <= tolerance ? best : null;
}

/** Known to Gaia DR3, known to CatWISE2020 (WISE/NEOWISE, sees cold brown dwarfs), or neither. */
function classifyMover(ra, dec, year, pm) {
  const g = state.gaia && matchCatalogue(state.gaia, 2016.0, ra, dec, year, pm);
  if (g) return { kind: 'known', id: g.id, gmag: g.gmag, gaiaTotal: Math.hypot(g.pmra, g.pmdec) / 1000 };
  const c = state.catwise && matchCatalogue(state.catwise, CATWISE_EPOCH, ra, dec, year, pm);
  if (c) return { kind: 'catwise', id: c.id, w2: c.w2, total: Math.hypot(c.pmra, c.pmdec) / 1000 };
  // Don't call anything "new" while a catalogue is still on its way.
  if (state.gaiaPending || state.catwisePending) return { kind: 'checking' };
  if (!state.gaia && !state.catwise) return { kind: 'unchecked' };
  const checked = [state.gaia && 'Gaia DR3', state.catwise && 'CatWISE2020'].filter(Boolean);
  return { kind: 'new', checked };
}

function renderMovers(message) {
  const box = $('movers');
  if (message || !state.movers.length) {
    const hidden = state.hiddenByWise ? ` ${state.hiddenByWise} faint candidate${state.hiddenByWise > 1 ? 's were' : ' was'} hidden: nothing at the predicted position in the 2010 WISE image.` : '';
    box.innerHTML = `<p class="muted small">${message || `No moving objects found. The search covers sources above S/N 6 that shift by at least 0.8 px (5″) across the visits. Faint movers may need more images.${hidden}`}</p>`;
    return;
  }
  const hiddenNote = state.hiddenByWise
    ? `<p class="muted small">${state.hiddenByWise} faint candidate${state.hiddenByWise > 1 ? 's' : ''} hidden: nothing at the predicted position in the 2010 WISE image.</p>` : '';
  box.innerHTML = hiddenNote + state.movers.map((m) => {
    const pa = ((Math.atan2(m.pmra, m.pmdec) * 180) / Math.PI + 360) % 360;
    const badge = {
      known: `<span class="badge known">Gaia DR3 ${m.gaia.gaiaTotal?.toFixed(2)}″/yr</span>`,
      catwise: `<span class="badge known" title="${m.gaia.id}">CatWISE2020 ${m.gaia.total?.toFixed(2)}″/yr</span>`,
      new: `<span class="badge new">No match in ${m.gaia.checked?.join(' or ')}</span>`,
      checking: `<span class="badge unchecked">Checking Gaia &amp; WISE…</span>`,
      unchecked: `<span class="badge unchecked">Catalogues unavailable</span>`,
    }[m.gaia.kind];
    const name = m.isTarget ? ` · ${state.target.name}` : '';
    const faint = m.tier === 'possible' ? ' <span class="badge unchecked">Faint: check by eye</span>' : '';
    const wiseBadge = m.wise?.confirmed
      ? ` <span class="badge known" title="SPHEREx alone: ${m.wise.before.total.toFixed(2)} ± ${m.wise.before.err.toFixed(2)}″/yr">Seen in WISE 2010: 15-yr baseline</span>`
      : m.wise ? ` <span class="badge unchecked" title="${m.wise.reason}">Not found in WISE 2010</span>` : '';
    const pressed = state.pick?.mover === m ? 'true' : 'false';
    return `<button type="button" class="mover" data-n="${m.n}" aria-pressed="${pressed}">
      <span class="rate">${m.total.toFixed(m.wise?.confirmed ? 2 : 1)}″/yr</span>
      <span>#${m.n}${name} ${badge}${faint}${wiseBadge}</span>
      <span class="where">${formatRa(m.ra)} ${formatDec(m.dec)} · toward ${pa.toFixed(0)}° · ±${m.err.toFixed(m.err < 0.1 ? 2 : 1)}″/yr · S/N ${m.snr.toFixed(0)} · ${m.visits} visits${m.wise?.confirmed ? ' + WISE 2010' : ''}</span>
    </button>`;
  }).join('');
  box.querySelectorAll('.mover').forEach((b) => b.addEventListener('click', () => {
    const m = state.movers.find((x) => x.n === Number(b.dataset.n));
    state.pick = { mover: m };
    renderMovers();
    updateMeasurements();
    render();
  }));
}

// ---------- rendering ----------

function currentImage(i) {
  const s = state.seq[i];
  const n = state.grid.n;
  if (s.instrument) {
    return toImageData(s.data, n, { ...s.stats, stretch: $('stretch').value, cmap: $('cmap').value, showMasked: $('show-masked').checked });
  }
  const diff = $('diff').checked && state.reference;
  const data = diff ? s.data.map((v, k) => v - state.reference[k]) : s.data;
  const { lo, hi } = diff ? state.diffStats : state.stats;
  return toImageData(data, n, {
    lo, hi, stretch: $('stretch').value, cmap: $('cmap').value, diverging: Boolean(diff),
    showMasked: $('show-masked').checked,
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
  if ($('ov-catwise').checked && state.catwise) {
    const year = mjdToYear(s.mjd);
    const movers = catwiseMovers();
    const slow = [], fast = [];
    for (const c of state.catwise) {
      const moving = movers.includes(c);
      const [ra, dec] = moving ? propagate(c.ra, c.dec, c.pmra, c.pmdec, CATWISE_EPOCH, year) : [c.ra, c.dec];
      const [x, y] = state.grid.wcs.worldToPix(ra, dec);
      if (x < -2 || y < -2 || x > n + 1 || y > n + 1) continue;
      (moving ? fast : slow).push({ x, y });
    }
    out.push({ type: 'circles', color: 'rgba(110,200,255,0.5)', width: 1, r: 1.2, points: slow });
    out.push({ type: 'circles', color: '#ff7ad9', width: 2, r: 3, points: fast });
  }
  if ($('ov-bodies').checked && state.bodies) {
    // Each exposure in this frame contributes its own position, so a stacked visit shows the
    // asteroid's path through the visit.
    const pts = [];
    for (const f of s.members) {
      for (const b of f.smallBodies || []) {
        const [x, y] = state.grid.wcs.worldToPix(b.ra, b.dec);
        if (x >= -1 && y >= -1 && x <= n && y <= n) pts.push({ x, y, r: 2 });
      }
    }
    out.push({ type: 'circles', color: '#b8ff5c', width: 2, r: 2, points: pts });
  }
  if ($('ov-movers').checked) {
    const year = mjdToYear(s.mjd);
    for (const m of state.movers) {
      out.push({
        type: 'arrow', color: m.tier === 'possible' ? 'rgba(200,200,220,0.8)' : m.gaia.kind === 'known' ? '#7fe0a0' : '#ffb347',
        from: moverAt(m, m.first), to: moverAt(m, m.last), current: moverAt(m, year), label: `#${m.n}`,
      });
    }
  }
  if (state.pick) {
    const p = pickPosition(s.mjd);
    out.push({ type: 'marker', color: '#ffffff', x: p.x, y: p.y, r: 2, rin: 4, rout: 7 });
  }
  return out;
}

function captions(s) {
  if (s.instrument) {
    const iso = (m) => mjdToDate(m).toISOString().slice(0, 7);
    return {
      title: state.target?.name || '',
      lines: [`${s.label} · ${iso(s.mjdRange[0])} → ${iso(s.mjdRange[1])}`, 'λ 4.6 µm (W2) · 15-year baseline'],
      footer: 'NASA WISE (AllWISE Atlas) · IRSA · SkyShift',
    };
  }
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
  if (s.instrument) {
    const rows = [
      ['Source', 'NASA WISE, AllWISE Atlas image (IRSA)'],
      ['Band', 'W2, 4.6 µm'],
      ['Dates', `${mjdToDate(s.mjdRange[0]).toISOString().slice(0, 10)} → ${mjdToDate(s.mjdRange[1]).toISOString().slice(0, 10)}`],
      ['Pixel scale', '1.375″ (resampled to 6.15″)'],
      ['Units', 'DN (own brightness scale)'],
      ['Image', s.id],
    ];
    $('meta').tBodies[0].innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    return;
  }
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

async function loadGaia({ quiet = false } = {}) {
  if (!state.grid) return;
  const key = `${state.grid.wcs.crval.join(',')}|${state.grid.n}`;
  if (state.gaiaKey === key && state.gaia) { render(); return; }
  state.gaia = null;
  state.gaiaPending = true;
  try {
    if (!quiet) setStatus('Loading Gaia DR3 stars from CDS VizieR…');
    const radius = (state.grid.n * state.grid.scaleArcsec) * 0.75;
    state.gaia = await gaiaCone(state.grid.wcs.crval[0], state.grid.wcs.crval[1], radius);
    state.gaiaKey = key;
    const fast = state.gaia.filter((g) => Math.hypot(g.pmra, g.pmdec) > 150).length;
    if (!quiet) setStatus(`Gaia DR3: ${state.gaia.length} stars (${fast} with proper motion > 150 mas/yr, yellow).`);
    for (const m of state.movers) m.gaia = classifyMover(m.ra, m.dec, m.t0, m);
    renderMovers();
    if (state.catwise) updateWiseStatus(state.wiseProblems || []);
    render();
  } catch (e) {
    if (!quiet) setStatus(`Gaia overlay unavailable: ${e.message}`, true);
  } finally {
    state.gaiaPending = false;
    for (const m of state.movers) m.gaia = classifyMover(m.ra, m.dec, m.t0, m);
    renderMovers();
  }
}

// ---------- WISE comparison data ----------

/** CatWISE sources with trustworthy motion (needs Gaia for the bright-star glare zones). */
function catwiseMovers() {
  const key = `${state.catwise?.length}|${state.gaia?.length}`;
  if (state.catwiseMoversKey !== key) {
    const bright = (state.gaia || []).filter((g) => g.gmag <= 11).map((g) => {
      const [ra, dec] = propagate(g.ra, g.dec, g.pmra, g.pmdec, 2016.0, CATWISE_EPOCH);
      return { ra, dec, g: g.gmag };
    });
    state.catwiseMoversList = state.catwise ? cleanCatwiseMovers(state.catwise, bright) : [];
    state.catwiseMoversKey = key;
  }
  return state.catwiseMoversList;
}

function updateWiseStatus(problems = []) {
  if (problems.length) {
    $('wise-status').textContent = `WISE comparison partly unavailable (${problems.join('; ')}).`;
    return;
  }
  const parts = [];
  if (state.wiseFrame) parts.push('2010 WISE image added as the first frame');
  if (state.catwise) parts.push(`${state.catwise.length} CatWISE2020 sources, ${catwiseMovers().length} with reliable motion (pink)`);
  $('wise-status').textContent = parts.length ? `WISE: ${parts.join('; ')}.` : '';
}

async function loadWise() {
  const g = state.grid;
  if (!g) return;
  const key = `${g.wcs.crval.join(',')}|${g.n}`;
  if (state.wiseKey === key) return;
  state.wiseKey = key;
  state.wiseFrame = null;
  state.catwise = null;
  const sizeDeg = (g.n * g.scaleArcsec / 3600) * 1.45;
  const image = allwiseCutout(g.wcs.crval[0], g.wcs.crval[1], sizeDeg).then((cut) => {
    if (state.wiseKey !== key) return;
    const data = reproject({ ...cut }, g);
    const [lo, hi] = percentiles([data], [1, 99.7]);
    state.wiseFrame = {
      instrument: 'WISE', label: 'WISE 2010', mjd: cut.mjd, mjdRange: cut.mjdRange, data,
      members: [], wlMin: 4.6, wlMax: 4.6, stats: { lo, hi }, id: cut.id,
    };
    rebuildSequence();
  });
  state.catwisePending = true;
  const catalogue = catwiseCone(g.wcs.crval[0], g.wcs.crval[1], (g.n * g.scaleArcsec * 0.75) / 3600).then((list) => {
    if (state.wiseKey !== key) return;
    state.catwise = list;
  }).finally(() => {
    if (state.wiseKey !== key) return;
    state.catwisePending = false;
    for (const m of state.movers) m.gaia = classifyMover(m.ra, m.dec, m.t0, m);
    renderMovers();
    render();
  });
  const [img, cat] = await Promise.allSettled([image, catalogue]);
  const problems = [img.status === 'rejected' && `WISE image: ${img.reason.message}`, cat.status === 'rejected' && `CatWISE: ${cat.reason.message}`].filter(Boolean);
  if (problems.length) console.warn(problems.join('; '));
  state.wiseProblems = problems;
  updateWiseStatus(problems);
}

// ---------- known asteroids and comets (NASA JPL) ----------

async function loadSmallBodies() {
  const g = state.grid, frames = state.frames;
  const key = `${g.wcs.crval.join(',')}|${frames.length}|${frames[0]?.id}`;
  if (state.bodiesKey === key) return;
  state.bodiesKey = key;
  state.bodies = null;
  // Two steps. (1) JPL's field search, once per day of observations (~20 s each whatever the
  // box size; box widened by half a day of main-belt motion, ~0.3°/day), lists candidates. Its
  // fast mode can be off by a few arcminutes, so (2) JPL Horizons then gives each candidate's
  // exact position at every exposure time (well under a second per object).
  const hw = ((g.n * g.scaleArcsec) / 3600 / 2) * 1.05 + 0.18 + 0.06;
  const days = [];
  for (const f of [...frames].sort((a, b) => a.mjd - b.mjd)) {
    const d = days[days.length - 1];
    if (d && f.mjd - d.members[0].mjd <= 1) d.members.push(f);
    else days.push({ members: [f] });
  }
  for (const d of days) d.mjd = (d.members[0].mjd + d.members[d.members.length - 1].mjd) / 2;
  renderBodies(`Asking NASA JPL which known asteroids and comets were in this field (${days.length} observing days, ~20 s each, 6 at a time)…`);
  let failures = 0, lastError = null;
  await pool(days, 6, async (v) => {
    try {
      v.candidates = await smallBodies(g.wcs.crval[0], g.wcs.crval[1], hw, v.mjd, 20, { maxError: 600 });
    } catch (e) {
      failures++; lastError = e; v.candidates = [];
    }
  });
  const inField = (b) => {
    const [x, y] = g.wcs.worldToPix(b.ra, b.dec);
    return x >= -1 && y >= -1 && x <= g.n && y <= g.n;
  };
  for (const f of frames) f.smallBodies = [];
  // Every exposure time on the days each candidate was near the field.
  const wanted = new Map();
  for (const d of days) {
    for (const c of d.candidates) {
      const w = wanted.get(c.name) || { c, frames: [] };
      w.frames.push(...d.members);
      wanted.set(c.name, w);
    }
  }
  renderBodies(`Getting exact positions from JPL Horizons for ${wanted.size} candidate object${wanted.size === 1 ? '' : 's'}…`);
  await pool([...wanted.values()], 4, async ({ c, frames: fs }) => {
    let positions = null;
    try {
      positions = await horizonsPositions(c.name, fs.map((f) => f.mjd));
    } catch (e) {
      lastError = e;
    }
    fs.forEach((f, k) => {
      // Fall back to the field search's own estimate when Horizons can't be reached.
      const p = positions?.[k];
      const b = p && Number.isFinite(p.ra) ? { ...c, ra: p.ra, dec: p.dec, v: Number.isFinite(p.v) ? p.v : c.v, mjd: f.mjd, exact: true }
        : bodyAt(c, f.mjd);
      if (inField(b) && (b.exact || (c.posErr ?? 0) <= 120)) f.smallBodies.push(b);
    });
  });
  if (state.bodiesKey !== key) return;
  // One entry per object: when and how often SPHEREx had it in the field.
  const byName = new Map();
  frames.forEach((f) => (f.smallBodies || []).forEach((b) => {
    const e = byName.get(b.name) || { ...b, exposures: 0, first: b.mjd, last: b.mjd };
    e.exposures++; e.first = Math.min(e.first, b.mjd); e.last = Math.max(e.last, b.mjd);
    e.v = Math.min(e.v, b.v);
    byName.set(b.name, e);
  }));
  state.bodies = [...byName.values()].sort((a, b) => a.v - b.v);
  const note = failures ? ` (${failures} of ${days.length} look-ups failed: ${lastError?.message})` : '';
  renderBodies(null, note);
  render();
}

function renderBodies(message, note = '') {
  const box = $('bodies');
  if (message) { box.innerHTML = `<p class="muted small">${message}</p>`; return; }
  const list = state.bodies || [];
  if (!list.length) {
    box.innerHTML = `<p class="muted small">No known asteroids or comets brighter than V = 20 crossed this field during these exposures (NASA JPL).${note}</p>`;
    return;
  }
  const day = (m) => mjdToDate(m).toISOString().slice(0, 10);
  box.innerHTML = `<p class="muted small">${list.length} known object${list.length > 1 ? 's' : ''} crossed the field (green circles at their exact JPL Horizons positions; switch to "Every exposure" to follow them). Objects fainter than about V 18 are at or below what a single SPHEREx exposure can see.${note}</p>` +
    list.slice(0, 12).map((b) => `<div class="body"><b>${b.name}</b> ${b.comet ? '<span class="badge new">comet</span>' : ''}
      <span class="muted">V ${b.v.toFixed(1)} · ${Math.hypot(b.raRate, b.decRate).toFixed(0)}″/h · ${b.exposures} exposure${b.exposures > 1 ? 's' : ''} · ${day(b.first)}${b.last - b.first > 0.5 ? ` → ${day(b.last)}` : ''}</span></div>`).join('') +
    (list.length > 12 ? `<p class="muted small">… and ${list.length - 12} more.</p>` : '');
}

// ---------- click-to-measure ----------

function pickPosition(mjd) {
  const p = state.pick;
  if (p.mover) return moverAt(p.mover, mjdToYear(mjd));
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
  renderMovers();
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
  state.measurements = relativeBrightness(state.frames.map((f) => {
    const p = pickPosition(f.mjd);
    const { flux, err } = measure(f.aligned, f.alignedVar, n, p.x, p.y, state.grid.scaleArcsec);
    return {
      mjd: f.mjd, wl: f.lambdaAt ? f.lambdaAt(...state.grid.wcs.pixToWorld(p.x, p.y)) : f.wl,
      detector: f.detector, id: f.obsId || f.id,
      visit: visitOf.get(f) ?? 0, flux, err,
      saturated: apertureSaturated(f.alignedSat, n, p.x, p.y),
    };
  }).filter((m) => Number.isFinite(m.flux)));

  const p0 = pickPosition(state.seq[state.idx].mjd);
  const [ra, dec] = state.grid.wcs.pixToWorld(p0.x, p0.y);
  const following = state.pick.mover ? ` · following mover #${state.pick.mover.n}'s measured motion`
    : state.pick.follow ? ` · following ${state.target.name}'s predicted motion` : '';
  const nSat = state.measurements.filter((m) => m.saturated).length;
  const satNote = nSat
    ? `<br><strong>⚠ ${nSat} of ${state.measurements.length} measurements are saturated</strong> (SPHEREx OVERFLOW/NONLINEAR flags): drawn hollow and left out of the brightness-over-time chart. This source is too bright for reliable SPHEREx photometry${nSat === state.measurements.length ? '' : ' in those exposures'}.`
    : '';
  $('pick-info').innerHTML = `${formatRa(ra)} ${formatDec(dec)}${following} · ${state.measurements.length} measurements${satNote}`;

  const visits = state.seq.length;
  const current = state.seq[state.idx];
  scatterPlot(spec, state.measurements.map((m) => ({
    x: m.wl, y: m.flux, err: m.err, color: `hsl(${(m.visit * 360) / Math.max(visits, 1) + 30}, 75%, 60%)`, hollow: m.saturated, m,
  })), { xLabel: 'wavelength (µm) — colour = visit', yLabel: 'flux (mJy)', xFormat: (v) => v.toFixed(1),
    highlight: (p) => current.members.some((f) => (f.obsId || f.id) === p.m.id) });
  // Each exposure divided by the source's own brightness at that wavelength in the other
  // visits, so wavelength differences between visits don't look like variability.
  const perVisit = visitBrightness(state.measurements);
  scatterPlot(lc, [
    ...state.measurements.map((m) => ({ x: mjdToYear(m.mjd), y: m.rel, color: wavelengthColor(m.wl, 0.55), size: 2.5 })),
    ...perVisit.map((v) => ({ x: mjdToYear(v.mjd), y: v.rel, err: v.err, size: 5, ring: true, color: '#ffb347' })),
  ], { xLabel: 'year · dots: exposures, rings: visits', yLabel: 'relative brightness',
    xFormat: (v) => v.toFixed(1), reference: 1 });
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
  const head = 'obs_id,mjd,year,wavelength_um,detector,visit,flux_mJy,flux_err_mJy,relative_brightness,relative_err,saturated';
  const num = (v, d) => (Number.isFinite(v) ? v.toPrecision(d) : '');
  const lines = state.measurements.map((m) =>
    [m.id, m.mjd.toFixed(5), mjdToYear(m.mjd).toFixed(4), m.wl.toFixed(4), m.detector, m.visit + 1,
      num(m.flux, 5), num(m.err, 3), num(m.rel, 4), num(m.relErr, 3), m.saturated ? 1 : 0].join(','));
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

/** Aladin takes survey IDs directly; full URLs (like IRSA's SPHEREx all-sky cube) as a HiPS layer. */
function hipsLayer(value) {
  if (!value.startsWith('http') || !window.A?.imageHiPS) return value;
  return window.A.imageHiPS(value, { name: 'SPHEREx DR1 all-sky' });
}

function initAladin() {
  const unavailable = (why) => {
    $('aladin').innerHTML = `<p class="muted small" style="padding:12px">Sky context viewer unavailable${why ? `: ${why}` : ''}.</p>`;
  };
  if (!window.A) { unavailable('could not be loaded'); return; }
  window.A.init.then(() => {
    state.aladin = window.A.aladin('#aladin', {
      survey: hipsLayer($('hips').value), fov: 0.3, target: '269.452 4.693',
      showReticle: true, showZoomControl: false, showFullscreenControl: false,
      showLayersControl: false, showGotoControl: false, showFrame: false, showCooGridControl: false,
      showProjectionControl: false, showSettingsControl: false, showSimbadPointerControl: false,
      showShareControl: false, showStatusBar: false,
    });
    state.aladinOverlay = window.A.graphicOverlay({ color: '#ffb347', lineWidth: 2 });
    state.aladin.addOverlay(state.aladinOverlay);
    if (state.grid) centerAladin(state.grid.wcs.crval[0], state.grid.wcs.crval[1], Number($('size').value));
  }).catch((e) => unavailable(String(e?.message || e)));
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
    state.aladinOverlay.add(window.A.polygon(corners));
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
  for (const id of ['stretch', 'cmap', 'diff', 'smooth', 'ov-track', 'ov-movers', 'show-masked', 'ov-catwise', 'ov-bodies']) $(id).addEventListener('change', render);
  $('wise-frame').addEventListener('change', () => { state.idx = 0; rebuildSequence(); });
  $('load-all').addEventListener('click', () => {
    if (!state.sample) return;
    $('max').value = String(state.sample.available);
    run();
  });
  $('ov-gaia').addEventListener('change', () => {
    if ($('ov-gaia').checked && !state.gaia) loadGaia();
    else render();
  });
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
    try { al.setBaseImageLayer ? al.setBaseImageLayer(hipsLayer($('hips').value)) : al.setImageSurvey(hipsLayer($('hips').value)); } catch {}
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
  let hasQuery = readUrl();
  if (!hasQuery) {
    // Open on a real result rather than an empty page: Barnard's Star, the fastest star in the sky.
    $('target').value = "Barnard's Star";
    $('max').value = '36';
    hasQuery = true;
  }
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
