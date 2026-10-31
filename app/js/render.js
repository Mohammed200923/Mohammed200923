// Draw aligned frames (plus overlays and captions) onto a canvas.

const STOPS = {
  gray: [[0, 0, 0], [255, 255, 255]],
  inferno: [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]],
  ice: [[4, 6, 19], [23, 47, 96], [32, 102, 158], [70, 160, 196], [150, 212, 222], [240, 250, 252]],
  // Dark midpoint so unchanged sky stays dark and captions stay readable: blue = fainter, orange = brighter.
  diverging: [[120, 200, 255], [40, 110, 210], [18, 40, 90], [8, 9, 16], [100, 35, 15], [225, 110, 30], [255, 220, 120]],
};

const lutCache = {};
function lut(name) {
  if (lutCache[name]) return lutCache[name];
  const stops = STOPS[name] || STOPS.gray;
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t)), f = t - k;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = stops[k][c] * (1 - f) + stops[k + 1][c] * f;
  }
  return (lutCache[name] = out);
}

function stretchFn(kind) {
  switch (kind) {
    case 'asinh': return (t) => Math.asinh(10 * t) / Math.asinh(10);
    case 'log': return (t) => Math.log10(1 + 999 * t) / 3;
    case 'sqrt': return (t) => Math.sqrt(t);
    default: return (t) => t;
  }
}

/** Convert a grid-sized float array to an n×n RGBA ImageData. */
export function toImageData(data, n, { lo, hi, stretch, cmap, diverging }) {
  const img = new ImageData(n, n);
  const map = lut(diverging ? 'diverging' : cmap);
  const f = diverging ? (t) => t : stretchFn(stretch);
  const span = hi - lo || 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = data[y * n + x];
      const o = ((n - 1 - y) * n + x) * 4; // FITS row 0 is the bottom
      if (!Number.isFinite(v)) {
        img.data[o] = 40; img.data[o + 1] = 20; img.data[o + 2] = 50; img.data[o + 3] = 255;
        continue;
      }
      const t = Math.min(1, Math.max(0, (v - lo) / span));
      const k = Math.round(f(t) * 255) * 3;
      img.data[o] = map[k]; img.data[o + 1] = map[k + 1]; img.data[o + 2] = map[k + 2]; img.data[o + 3] = 255;
    }
  }
  return img;
}

/** Map grid pixel (0-based, FITS orientation) to canvas coordinates. */
export function gridToCanvas(x, y, n, size) {
  return [((x + 0.5) * size) / n, ((n - 1 - y + 0.5) * size) / n];
}

export function canvasToGrid(cx, cy, n, size) {
  return [(cx * n) / size - 0.5, n - 1 - ((cy * n) / size - 0.5)];
}

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;

export function drawFrame(ctx, size, n, imageData, { smooth, overlays = [], captions = {}, simulated, scaleArcsec }) {
  scratch.width = n; scratch.height = n;
  scratch.getContext('2d').putImageData(imageData, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch, 0, 0, size, size);
  ctx.restore();

  for (const o of overlays) drawOverlay(ctx, o, n, size);

  // Compass (north up, east left) and scale bar.
  const pad = 14;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.font = '600 12px system-ui, sans-serif';
  const cx = size - pad - 6, cy = size - pad - 30;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 26); ctx.moveTo(cx, cy); ctx.lineTo(cx - 26, cy); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillText('N', cx, cy - 32);
  ctx.textAlign = 'right'; ctx.fillText('E', cx - 30, cy + 4);
  const arcmin = n * scaleArcsec / 60 >= 4 ? 1 : 0.5;
  const barPx = (arcmin * 60 / scaleArcsec) * (size / n);
  ctx.beginPath(); ctx.moveTo(size - pad - barPx, size - pad); ctx.lineTo(size - pad, size - pad); ctx.stroke();
  ctx.textAlign = 'right'; ctx.fillText(`${arcmin}′`, size - pad - barPx - 6, size - pad + 4);

  // Captions baked into the frame so exported videos are self-describing.
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
  ctx.font = '700 16px system-ui, sans-serif';
  if (captions.title) ctx.fillText(captions.title, pad, pad + 12);
  ctx.font = '500 13px system-ui, sans-serif';
  (captions.lines || []).forEach((l, i) => ctx.fillText(l, pad, pad + 32 + i * 17));
  ctx.font = '500 11px system-ui, sans-serif';
  if (captions.footer) ctx.fillText(captions.footer, pad, size - pad + 2);
  if (simulated) {
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,90,90,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('SIMULATED DATA', size / 2, size - 40);
  }
  ctx.restore();
}

function drawOverlay(ctx, o, n, size) {
  const k = size / n;
  ctx.save();
  ctx.strokeStyle = o.color; ctx.fillStyle = o.color; ctx.lineWidth = o.width || 1.5;
  if (o.type === 'circles') {
    for (const p of o.points) {
      const [x, y] = gridToCanvas(p.x, p.y, n, size);
      ctx.beginPath(); ctx.arc(x, y, (p.r || o.r || 2.2) * k, 0, 2 * Math.PI); ctx.stroke();
    }
  } else if (o.type === 'track') {
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    o.points.forEach((p, i) => {
      const [x, y] = gridToCanvas(p.x, p.y, n, size);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (o.current) {
      const [x, y] = gridToCanvas(o.current.x, o.current.y, n, size);
      const r = 3.2 * k, gap = 1.2 * k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r - gap, y); ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y); ctx.lineTo(x + r + gap, y);
      ctx.moveTo(x, y - r - gap); ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap); ctx.lineTo(x, y + r + gap);
      ctx.stroke();
      if (o.label) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
        ctx.fillText(o.label, x + r + gap + 4, y - 4);
      }
    }
  } else if (o.type === 'marker') {
    const [x, y] = gridToCanvas(o.x, o.y, n, size);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, (o.r || 2) * k, 0, 2 * Math.PI); ctx.stroke();
    if (o.rout) {
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y, o.rin * k, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, o.rout * k, 0, 2 * Math.PI); ctx.stroke();
    }
  }
  ctx.restore();
}
