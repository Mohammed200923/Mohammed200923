/* MOCK DATA: procedural image generation. Everything is fabricated in the browser from seeded
   random numbers, to exercise the UI. It is NOT a scientific model, and no FITS or real imagery is used.
   Replace the provider (provider.js) and this file becomes dead weight you can delete.                */
(function () {
  const SX = window.SX, M = SX.mock, clamp = SX.clamp;
  const S = (M.sim = {});

  S.hash = SX.hash;
  S.rng = SX.rng;

  /* ---------- per-visit brightness and simulated motion ---------- */
  S.fluxAt = function (rec, visit) {
    const v = rec.sim && rec.sim.variable;
    return v ? 1 + v.amp * Math.sin(2 * Math.PI * (visit / v.period) + v.phase) : 1;
  };
  function moverShift(rec, visit, w) {
    const m = rec.sim && rec.sim.mover; if (!m) return null;
    const sc = w / 128, mv = m.px * visit * sc;
    return { x: w * 0.5 + mv - 5 * sc, y: h2(rec, w) + (rec.cls === 'star' ? 0 : mv * 0.3) };
  }
  function h2(rec, w) { return w * 0.5; }

  /* ---------- simulated frame: Float32Array intensity 0..~1 ---------- */
  S.frameIntensity = function (rec, visit, w, h, wl) {
    const w01 = (wl - 0.75) / 4.25, seed = S.hash(rec.id), rnd = S.rng(seed), buf = new Float32Array(w * h);
    const t0 = SX.render.coolIndex(rec.tK);
    const add = function (cx, cy, sig, amp, ex, ang) {
      const R = Math.ceil(sig * 3.2), ca = Math.cos(ang || 0), sa = Math.sin(ang || 0), e = ex || 1;
      for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(h, Math.ceil(cy + R)); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(w, Math.ceil(cx + R)); x++) {
          const dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = (-dx * sa + dy * ca) / e;
          buf[y * w + x] += amp * Math.exp(-(u * u + v * v) / (2 * sig * sig));
        }
    };
    const nStars = rec.cls === 'cluster' ? 70 : rec.cls === 'region' ? 60 : 38;
    for (let i = 0; i < nStars; i++) {
      const x = rnd() * w, y = rnd() * h, t = rnd(), m = Math.pow(rnd(), 2.2);
      add(x, y, 0.8 + m * 0.9, clamp(SX.render.fluxStar(t, wl), 0.02, 1.4) * (0.15 + m * 0.7), 1, 0);
    }
    const cx = w * 0.5, cy = h * 0.5, sc = w / 128;
    const fl = SX.render.fluxObject(rec.cls, t0, wl) * S.fluxAt(rec, visit), mp = moverShift(rec, visit, w);
    switch (rec.cls) {
      case 'nebula': case 'region':
        add(cx, cy, 30 * sc, 0.45 * fl, 1.2, 0.6); add(cx + 10 * sc, cy - 6 * sc, 17 * sc, 0.4 * fl, 1.5, -0.5);
        for (let i = 0; i < 9; i++) add(cx + (rnd() - 0.5) * 60 * sc, cy + (rnd() - 0.5) * 50 * sc, (4 + rnd() * 9) * sc, (0.15 + rnd() * 0.3) * fl * (0.6 + w01), 1 + rnd(), rnd() * 3);
        if (rec.cls === 'region') for (let i = 0; i < 10; i++) add(cx + (rnd() - 0.5) * 70 * sc, cy + (rnd() - 0.5) * 60 * sc, 1.6 * sc, 0.5 * (0.2 + w01 * 1.1), 1, 0);
        if (rec.id === 'ring') for (let a = 0; a < 40; a++) add(cx + Math.cos(a / 40 * 6.283) * 18 * sc, cy + Math.sin(a / 40 * 6.283) * 15 * sc, 3 * sc, 0.3 * fl * (0.5 + w01), 1, 0);
        break;
      case 'galaxy':
        add(cx, cy, 36 * sc, 0.38 * fl, 2.6, -0.5); add(cx, cy, 11 * sc, 0.7 * fl, 1.6, -0.5);
        for (let a = 0; a < 40; a++) { const th = a / 40 * 9.4, r = (6 + a * 1.1) * sc; add(cx + Math.cos(th) * r, cy + Math.sin(th) * r * 0.4, 3 * sc, 0.1 * fl * (0.6 + w01 * 0.8), 1, 0); }
        break;
      case 'cluster':
        for (let i = 0; i < 26; i++) add(cx + (rnd() - 0.5) * 70 * sc, cy + (rnd() - 0.5) * 70 * sc, 1.6 * sc, SX.render.fluxStar(0.1, wl) * (0.4 + rnd() * 0.6), 1, 0);
        add(cx, cy, 24 * sc, 0.15 * fl, 1, 0);
        break;
      case 'brown-dwarf':
        add(mp.x, mp.y, 2 * sc, clamp(fl * 0.9, 0, 1.4), 1, 0);
        break;
      case 'field':
        add(mp.x, mp.y, 1.6 * sc, 0.5 * (0.5 + w01), 1, 0);
        break;
      default: {
        const a = clamp(fl * 1.1, 0.05, 2), px = mp ? mp.x : cx;
        add(px, cy, 2.2 * sc, a, 1, 0); add(px, cy, 6 * sc, a * 0.2, 1, 0);
        if (a > 0.6) { add(px, cy, 1 * sc, a * 0.8, 14, 0); add(px, cy, 1 * sc, a * 0.8, 14, 1.5708); }
      }
    }
    const nr = S.rng(seed + visit * 977 + 5);
    for (let i = 0; i < buf.length; i++) buf[i] += (nr() - 0.5) * 0.035 + 0.02;
    return buf;
  };

  function canvasURL(w, h, fill) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
    fill(img.data);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }

  S.bandCenter = function (bandId) {
    const b = M.BANDS.find(function (x) { return x.id === bandId; }) || M.BANDS[1];
    return (b.minMicron + b.maxMicron) / 2;
  };
  S.COMPOSITE_WL = [4.6, 2.4, 1.1];

  /* Returns { url, encoding }. bandId: number or 'composite'. */
  S.imageURL = function (rec, visit, bandId, size) {
    const w = size, h = size;
    if (bandId === 'composite') {
      const bufs = S.COMPOSITE_WL.map(function (wl) { return S.frameIntensity(rec, visit, w, h, wl); });
      return { encoding: 'rgb', url: canvasURL(w, h, function (d) {
        for (let i = 0; i < bufs[0].length; i++) { d[i * 4] = clamp(bufs[0][i], 0, 1) * 255; d[i * 4 + 1] = clamp(bufs[1][i], 0, 1) * 255; d[i * 4 + 2] = clamp(bufs[2][i], 0, 1) * 255; d[i * 4 + 3] = 255; }
      }) };
    }
    const buf = S.frameIntensity(rec, visit, w, h, S.bandCenter(bandId));
    return { encoding: 'intensity-gray', url: canvasURL(w, h, function (d) {
      for (let i = 0; i < buf.length; i++) { const g = clamp(buf[i], 0, 1) * 255; d[i * 4] = g; d[i * 4 + 1] = g; d[i * 4 + 2] = g; d[i * 4 + 3] = 255; }
    }) };
  };

  /* Difference image (B − A): gold = brighter in B, cyan = dimmer in B. Returns stats for the summary. */
  S.diff = function (rec, vA, vB, bandId, size) {
    const w = size, h = size, wl = bandId === 'composite' ? 2.4 : S.bandCenter(bandId);
    const A = S.frameIntensity(rec, vA, w, h, wl), B = S.frameIntensity(rec, vB, w, h, wl);
    const d = new Float32Array(A.length); let max = 0.001, changed = 0;
    for (let i = 0; i < A.length; i++) {
      const raw = B[i] - A[i], m = Math.max(0, Math.abs(raw) - 0.04);
      d[i] = raw < 0 ? -m : m; max = Math.max(max, m);
      if (Math.abs(raw) > 0.09) changed++;
    }
    const gain = Math.min(6, 0.5 / Math.max(max, 0.08));
    const url = canvasURL(w, h, function (px) {
      for (let i = 0; i < d.length; i++) {
        const v = d[i] * gain;
        px[i * 4] = clamp(10 + (v > 0 ? v * 430 : 0), 0, 255);
        px[i * 4 + 1] = clamp(24 + (v > 0 ? v * 330 : -v * 430), 0, 255);
        px[i * 4 + 2] = clamp(22 + (v < 0 ? -v * 430 : 0), 0, 255);
        px[i * 4 + 3] = 255;
      }
    });
    return { url: url, changedFraction: changed / A.length, peak: max };
  };

  S.candidates = function (rec, vA, vB, size) {
    const out = [];
    const mp = moverShift(rec, vB, size), ma = moverShift(rec, vA, size);
    if (mp && ma && Math.hypot(mp.x - ma.x, mp.y - ma.y) > 1.5) {
      out.push({ id: rec.id + '-mover', label: { en: 'Possible moving source (demo)', ar: 'مصدر متحرك محتمل (تجريبي)' }, pixel: { x: Math.round(mp.x), y: Math.round(mp.y) }, changeType: 'moved', confidence: 0.7 });
    }
    const fa = S.fluxAt(rec, vA), fb = S.fluxAt(rec, vB);
    if (rec.sim && rec.sim.variable && Math.abs(fb - fa) > 0.06) {
      out.push({ id: rec.id + '-variable', label: { en: 'Brightness change at the centre (demo)', ar: 'تغيّر في اللمعان عند المركز (تجريبي)' }, pixel: { x: Math.round(size / 2), y: Math.round(size / 2) }, changeType: fb > fa ? 'brightened' : 'dimmed', confidence: 0.6 });
    }
    return out;
  };
})();
