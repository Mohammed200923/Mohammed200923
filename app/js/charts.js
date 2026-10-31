// Tiny canvas scatter plot for spectra and light curves.

export function scatterPlot(canvas, points, { xLabel, yLabel, xFormat = (v) => v.toFixed(1), highlight } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 320, H = canvas.clientHeight || 180;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(canvas);
  const ink = css.getPropertyValue('--ink').trim() || '#ddd';
  const muted = css.getPropertyValue('--muted').trim() || '#888';
  const line = css.getPropertyValue('--line').trim() || '#444';
  ctx.clearRect(0, 0, W, H);
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const m = { l: 48, r: 10, t: 10, b: 34 };
  ctx.font = '11px system-ui, sans-serif';
  if (!pts.length) {
    ctx.fillStyle = muted; ctx.textAlign = 'center';
    ctx.fillText('Click a source in the viewer', W / 2, H / 2);
    return;
  }
  let [x0, x1] = extent(pts.map((p) => p.x)), [y0, y1] = extent(pts.map((p) => p.y));
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const py = (y1 - y0) * 0.08; y0 -= py; y1 += py;
  const px = (x1 - x0) * 0.04; x0 -= px; x1 += px;
  const sx = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
  const sy = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);

  ctx.strokeStyle = line; ctx.fillStyle = muted; ctx.lineWidth = 1;
  for (const t of ticks(y0, y1, 4)) {
    ctx.beginPath(); ctx.moveTo(m.l, sy(t)); ctx.lineTo(W - m.r, sy(t)); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(fmt(t), m.l - 5, sy(t) + 3);
  }
  for (const t of ticks(x0, x1, 5)) {
    ctx.textAlign = 'center'; ctx.fillText(xFormat(t), sx(t), H - m.b + 14);
  }
  ctx.fillStyle = ink;
  ctx.textAlign = 'center'; ctx.fillText(xLabel || '', (m.l + W - m.r) / 2, H - 4);
  ctx.save(); ctx.translate(11, (m.t + H - m.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel || '', 0, 0); ctx.restore();

  for (const p of pts) {
    ctx.fillStyle = p.color || ink;
    ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), highlight && highlight(p) ? 4.5 : 3, 0, 2 * Math.PI); ctx.fill();
    if (highlight && highlight(p)) { ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
}

function extent(a) {
  return [Math.min(...a), Math.max(...a)];
}

function ticks(a, b, n) {
  const step = niceStep((b - a) / n);
  const out = [];
  for (let t = Math.ceil(a / step) * step; t <= b + 1e-12; t += step) out.push(Number(t.toPrecision(12)));
  return out;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function fmt(v) {
  const a = Math.abs(v);
  return a >= 1000 || (a < 0.01 && a > 0) ? v.toExponential(1) : String(Number(v.toPrecision(3)));
}
