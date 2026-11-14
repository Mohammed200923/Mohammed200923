// Automatic moving-object search across survey visits.
//
// 1. Find point sources in each visit coadd (local maxima above an S/N threshold) and
//    measure sub-pixel positions.
// 2. Link each source in the deepest visit to its nearest detection in every other visit.
// 3. Remove small per-visit alignment errors with an affine fit (shift, rotation, scale) from
//    all linked sources, since most stars don't move. A shift alone leaves residual rotation
//    that grows with distance from the centre and looks like motion at the field edges.
// 4. Fit a straight-line motion to each linked source, and flag the ones whose motion is
//    significant, adds up to a meaningful shift, and actually follows a straight line.
//    On real SPHEREx fields the last test matters most: faint sources blended with
//    neighbours appear to jump between visits (χ²ᵣ 14–90), while true movers such as
//    Barnard's Star and Epsilon Indi B fit a line almost perfectly (χ²ᵣ ≈ 0.3).
// Grid pixels are north-up, east-left (see wcs.makeGrid).

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : 0.5 * (v[m - 1] + v[m]);
}

/** Sub-pixel peak position from a Gaussian (log-parabola) fit through the 3 pixels on each axis. */
function refine(data, n, x, y, bg) {
  const at = (i, j) => data[j * n + i] - bg;
  const axis = (l, c, r) => {
    if (l > 0 && c > 0 && r > 0) {
      const ll = Math.log(l), lc = Math.log(c), lr = Math.log(r);
      const den = ll - 2 * lc + lr;
      if (den < 0) return Math.max(-0.5, Math.min(0.5, (0.5 * (ll - lr)) / den));
    }
    const s = l + c + r;
    return s > 0 ? (r - l) / s : 0; // flux-weighted fallback
  };
  return [x + axis(at(x - 1, y), at(x, y), at(x + 1, y)), y + axis(at(x, y - 1), at(x, y), at(x, y + 1))];
}

/**
 * Point sources in one frame: local maxima of the S/N map. The noise comes from the
 * coadd's variance plane when available, else from the robust scatter of the image.
 */
export function findSources(data, variance, n, { snr = 8, border = 2 } = {}) {
  const finite = Array.from(data).filter(Number.isFinite);
  const bg = median(finite);
  const sigmaImage = median(finite.map((v) => Math.abs(v - bg))) * 1.4826 || 1;
  const sigmaAt = (i) => {
    const v = variance?.[i];
    return Number.isFinite(v) && v > 0 ? Math.sqrt(v) : sigmaImage;
  };
  const out = [];
  for (let y = border; y < n - border; y++) {
    for (let x = border; x < n - border; x++) {
      const i = y * n + x, v = data[i];
      if (!Number.isFinite(v)) continue;
      const s = (v - bg) / sigmaAt(i);
      if (s < snr) continue;
      let peak = true;
      for (let dy = -1; dy <= 1 && peak; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && !(data[i + dy * n + dx] < v)) { peak = false; break; }
        }
      }
      if (!peak) continue;
      const [rx, ry] = refine(data, n, x, y, bg);
      out.push({ x: rx, y: ry, snr: s, peak: v - bg });
    }
  }
  return out;
}

function solve3(m, v) {
  // Cramer's rule for a 3×3 system.
  const det = (a) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-12) return null;
  return [0, 1, 2].map((c) => det(m.map((row, r) => row.map((x, j) => (j === c ? v[r] : x)))) / d);
}

/** Least-squares affine map from anchor positions (ax, ay) to visit positions (bx, by). */
function fitAffine(pairs) {
  const fit = (key) => {
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
    for (const p of pairs) {
      const row = [1, p.ax, p.ay];
      for (let i = 0; i < 3; i++) {
        v[i] += row[i] * p[key];
        for (let j = 0; j < 3; j++) m[i][j] += row[i] * row[j];
      }
    }
    return solve3(m, v);
  };
  const cx = fit('bx'), cy = fit('by');
  return cx && cy ? { cx, cy } : null;
}

/** Map a visit position back into the anchor frame through the inverse of the affine fit. */
function toAnchorFrame(aff, x, y) {
  const [a0, a1, a2] = aff.cx, [b0, b1, b2] = aff.cy;
  const det = a1 * b2 - a2 * b1;
  const dx = x - a0, dy = y - b0;
  return [(b2 * dx - a2 * dy) / det, (-b1 * dx + a1 * dy) / det];
}

function fitLine(ts, vs, sig) {
  // Weighted least squares v = a + b t; returns slope, its error, and reduced chi².
  let sw = 0, st = 0, sv = 0, stt = 0, stv = 0;
  ts.forEach((t, k) => {
    const w = 1 / sig[k] ** 2;
    sw += w; st += w * t; sv += w * vs[k]; stt += w * t * t; stv += w * t * vs[k];
  });
  const det = sw * stt - st * st;
  if (det <= 0) return null;
  const b = (sw * stv - st * sv) / det, a = (stt * sv - st * stv) / det;
  const chi2 = ts.reduce((s, t, k) => s + ((vs[k] - a - b * t) / sig[k]) ** 2, 0);
  return { a, b, bErr: Math.sqrt(sw / det), chi2r: ts.length > 2 ? chi2 / (ts.length - 2) : 0 };
}

/**
 * visits: [{ mjd, data, variance, members }] on a common grid.
 * Returns { movers, tracks, offsets }. Positions are grid pixels; motions in pixels per year.
 */
export function findMovers(visits, n, {
  snr = 6, linkSnr = 4, linkRadius = 3, minShift = 0.8, minSignificance = 5, floor = 0.12, maxChi2r = 5,
  centroid = 1.5, confidentSnr = 8, possibleSignificance = 4,
} = {}) {
  // A track starts from a source at S/N ≥ snr in the deepest visit and may be followed into
  // other visits at the lower linkSnr, so faint movers like WISE 0855 can still be traced.
  const usable = visits.map((v, k) => ({ ...v, k, year: 2000 + (v.mjd - 51544.5) / 365.25 }));
  const lowest = Math.min(snr, linkSnr);
  const detections = usable.map((v) => findSources(v.data, v.variance, n, { snr: lowest }));
  // Anchor on the visit with the most confident detections (usually the deepest).
  const strong = detections.map((d) => d.filter((s) => s.snr >= snr));
  const anchor = strong.reduce((best, d, k) => (d.length > strong[best].length ? k : best), 0);

  // Link in two passes. First, the nearest detection to the anchor position in each visit,
  // accepting only mutual nearest neighbours so two nearby stars don't swap. Then, for visits
  // still missing, search a tighter radius around the position predicted from the motion
  // found so far, so a fast mover isn't lost at the longest time gaps. (Predicting from the
  // start lets noisy two-point motions drift onto neighbouring stars.)
  const nearest = (list, x, y, radius = linkRadius) => {
    let best = null, bd = Infinity;
    for (const s of list) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return bd <= radius ? best : null;
  };
  const tracks = strong[anchor].map((a) => {
    const points = [];
    usable.forEach((v, k) => {
      const s = k === anchor ? a : nearest(detections[k], a.x, a.y);
      if (!s) return;
      if (k !== anchor && nearest(detections[anchor], s.x, s.y) !== a) return;
      points.push({ k, year: v.year, x: s.x, y: s.y, snr: s.snr });
    });
    const span = points.length ? Math.max(...points.map((p) => p.year)) - Math.min(...points.map((p) => p.year)) : 0;
    if (points.length >= 3 || (points.length === 2 && span >= 0.4)) {
      const w = points.map((p) => Math.hypot(centroid / p.snr, floor));
      const fx = fitLine(points.map((p) => p.year), points.map((p) => p.x), w);
      const fy = fitLine(points.map((p) => p.year), points.map((p) => p.y), w);
      if (fx && fy) {
        for (const v of usable) {
          if (points.some((p) => p.k === v.k)) continue;
          const px = fx.a + fx.b * v.year, py = fy.a + fy.b * v.year;
          const s = nearest(detections[v.k], px, py, linkRadius / 2);
          if (s && nearest(detections[anchor], s.x - (px - a.x), s.y - (py - a.y)) === a) {
            points.push({ k: v.k, year: v.year, x: s.x, y: s.y, snr: s.snr });
          }
        }
      }
    }
    points.sort((p, q) => p.year - q.year);
    return { anchor: a, points };
  }).filter((t) => t.points.length >= Math.min(3, usable.length));

  // Per-visit alignment from all tracks (dominated by stars that don't move): an affine fit
  // with 3σ clipping when there are enough stars, otherwise a median shift.
  const offsets = usable.map((v, k) => {
    if (k === anchor) return [0, 0];
    let pairs = [];
    for (const t of tracks) {
      const p = t.points.find((q) => q.k === k);
      if (p) pairs.push({ ax: t.anchor.x, ay: t.anchor.y, bx: p.x, by: p.y });
    }
    if (pairs.length < 3) return [0, 0];
    const shift = [median(pairs.map((q) => q.bx - q.ax)), median(pairs.map((q) => q.by - q.ay))];
    if (pairs.length < 8) return shift;
    let aff = null;
    for (let iter = 0; iter < 3; iter++) {
      aff = fitAffine(pairs);
      if (!aff) return shift;
      const res = pairs.map((q) => Math.hypot(
        aff.cx[0] + aff.cx[1] * q.ax + aff.cx[2] * q.ay - q.bx,
        aff.cy[0] + aff.cy[1] * q.ax + aff.cy[2] * q.ay - q.by));
      const cut = 3 * 1.4826 * median(res) + 0.05;
      const kept = pairs.filter((q, i) => res[i] <= cut);
      if (kept.length === pairs.length || kept.length < 8) break;
      pairs = kept;
    }
    return { affine: aff };
  });
  const corrected = (k, x, y) => {
    const o = offsets[k];
    return o.affine ? toAnchorFrame(o.affine, x, y) : [x - o[0], y - o[1]];
  };

  const t0 = usable.reduce((s, v) => s + v.year, 0) / usable.length;
  for (const t of tracks) {
    const ts = [], xs = [], ys = [], sig = [];
    for (const p of t.points) {
      const [cx, cy] = corrected(p.k, p.x, p.y);
      ts.push(p.year - t0);
      xs.push(cx);
      ys.push(cy);
      // Centroid noise ~ PSF width / S/N (SPHEREx's PSF is ~1.5–2 px wide), plus a floor for
      // residual alignment error between visits.
      sig.push(Math.hypot(centroid / p.snr, floor));
    }
    const fx = fitLine(ts, xs, sig), fy = fitLine(ts, ys, sig);
    if (!fx || !fy) { t.fit = null; continue; }
    const span = Math.max(...ts) - Math.min(...ts);
    const vel = Math.hypot(fx.b, fy.b);
    const velErr = Math.hypot(fx.b * fx.bErr, fy.b * fy.bErr) / (vel || 1);
    t.fit = {
      x0: fx.a, y0: fy.a, t0, vx: fx.b, vy: fy.b, vel, velErr, span,
      shift: vel * span, significance: vel / (velErr || Infinity),
      chi2r: Math.max(fx.chi2r, fy.chi2r), visits: t.points.length,
      snr: median(t.points.map((p) => p.snr)),
    };
  }
  // Confident: bright enough for good positions and seen in most visits. Tested on the five
  // challenge fields, this keeps Barnard's Star and Epsilon Indi B and nothing else; fainter
  // tracks that pass the motion tests are returned separately as "possible".
  const minVisits = Math.min(4, usable.length);
  const moving = tracks.filter((t) => t.fit && t.fit.shift >= minShift && t.fit.chi2r <= maxChi2r).map((t) => t.fit);
  const movers = moving
    .filter((m) => m.significance >= minSignificance && m.snr >= confidentSnr && m.visits >= minVisits)
    .sort((a, b) => b.significance - a.significance);
  const possible = moving
    .filter((m) => !movers.includes(m) && m.significance >= possibleSignificance)
    .sort((a, b) => b.significance - a.significance);
  return { movers, possible, tracks, offsets, anchor, detections };
}

/** Position of a fitted mover at a given decimal year. */
export function moverAt(m, year) {
  return { x: m.x0 + m.vx * (year - m.t0), y: m.y0 + m.vy * (year - m.t0) };
}

/** Pixel motion on a north-up / east-left grid → proper motion in arcsec/yr. */
export function toProperMotion(m, scaleArcsec) {
  return { pmra: -m.vx * scaleArcsec, pmdec: m.vy * scaleArcsec, total: m.vel * scaleArcsec, err: m.velErr * scaleArcsec };
}
