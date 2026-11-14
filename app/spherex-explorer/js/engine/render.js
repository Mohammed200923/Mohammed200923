/* Presentation helpers: colour palettes, illustrative shading, and painting provider images into canvases.
   Nothing here depends on the mock data. `fluxStar` / `fluxObject` are ILLUSTRATIVE shading curves for the
   simulated star map and mock images, not physical models.                                             */
(function () {
  const SX = window.SX, clamp = SX.clamp, lerp = SX.lerp;

  const RAMPS = {
    emerald: [[0, [2, 8, 7]], [0.35, [8, 84, 66]], [0.7, [56, 242, 194]], [1, [236, 255, 248]]],
    aurum: [[0, [8, 6, 0]], [0.35, [112, 78, 6]], [0.7, [255, 216, 77]], [1, [255, 250, 226]]],
    ice: [[0, [0, 4, 16]], [0.4, [20, 70, 150]], [0.75, [80, 200, 230]], [1, [235, 250, 255]]],
    dust: [[0, [10, 0, 20]], [0.4, [110, 30, 130]], [0.75, [240, 90, 150]], [1, [255, 225, 230]]],
    mono: [[0, [0, 0, 0]], [1, [255, 255, 255]]],
    natural: [[0, [4, 8, 10]], [1, [235, 245, 245]]]
  };
  const PALETTES = [
    { id: 'natural', swatch: '#e6f0ee' },
    { id: 'emerald', swatch: '#38f2c2' },
    { id: 'aurum', swatch: '#ffd84d' },
    { id: 'ice', swatch: '#4fb7ff' },
    { id: 'dust', swatch: '#ff5fa8' },
    { id: 'mono', swatch: '#bbbbbb' }
  ];

  function ramp(name, v) {
    const r = RAMPS[name] || RAMPS.mono;
    v = clamp(v, 0, 1);
    for (let i = 1; i < r.length; i++) {
      if (v <= r[i][0]) {
        const a = r[i - 1], b = r[i], f = (v - a[0]) / (b[0] - a[0] || 1);
        return [lerp(a[1][0], b[1][0], f), lerp(a[1][1], b[1][1], f), lerp(a[1][2], b[1][2], f)];
      }
    }
    return r[r.length - 1][1];
  }
  function tint(t) { return [lerp(190, 255, Math.min(1, t * 1.6)), lerp(212, 160, t), lerp(255, 105, Math.pow(t, 0.8))]; }

  /* 0 = hot/blue ... 1 = cool/red. Illustrative mapping from a temperature in kelvin. */
  function coolIndex(tK) { return clamp((11000 - (tK || 5500)) / 8500, 0.05, 1); }

  function fluxStar(t, wl) {
    const w = (wl - 0.75) / 4.25;
    return (1 - w) * (1 - t * 0.9) + w * (0.3 + t * 0.95);
  }
  function fluxObject(cls, t, wl) {
    const w = (wl - 0.75) / 4.25;
    switch (cls) {
      case 'nebula': return 0.45 + w * 0.9;
      case 'region': return 0.25 + w * 1.1;
      case 'galaxy': return 0.55 + 0.4 * w;
      case 'brown-dwarf': return 0.02 + Math.pow(w, 2.6) * 2.2;
      default: return fluxStar(t, wl);
    }
  }
  function stretchX(x, st) { return st === 'sqrt' ? Math.sqrt(x) : st === 'log' ? Math.log(1 + 9 * x) / Math.LN10 : x; }

  /* Colour for a flux value. `ir` = { wl|'rgb', palette, brightness, contrast, stretch? } */
  function colorFor(f, t, ir) {
    const x = stretchX(clamp(((f * ir.brightness) - 0.5) * ir.contrast + 0.5, 0, 1), ir.stretch);
    if (ir.wl === 'rgb') {
      const rw = [4.6, 2.4, 1.1];
      const ch = function (w) { return stretchX(clamp((fluxStar(t, w) * ir.brightness - 0.5) * ir.contrast + 0.5, 0, 1), ir.stretch); };
      const r = ch(rw[0]), g = ch(rw[1]), b = ch(rw[2]);
      return [r * 255, g * 255, b * 255, Math.max(r, g, b)];
    }
    if (ir.palette === 'natural') { const c = tint(t); return [c[0] * x, c[1] * x, c[2] * x, x]; }
    const c = ramp(ir.palette, x);
    return [c[0], c[1], c[2], x];
  }

  /* 256-entry lookup tables for fast image colourising. */
  const LUTS = {};
  function lut(name) {
    if (LUTS[name]) return LUTS[name];
    const a = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const c = name === 'natural' ? [i * 0.92, i * 0.96, i] : ramp(name, i / 255);
      a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2];
    }
    return (LUTS[name] = a);
  }

  /* Decoded <img> cache so band/brightness changes never re-download or re-decode. */
  const IMGS = new Map();
  function loadImage(url) {
    if (IMGS.has(url)) return IMGS.get(url);
    const p = new Promise(function (resolve, reject) {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { resolve(im); };
      im.onerror = function () { IMGS.delete(url); reject(SX.DataError('network', 'Image could not be loaded: ' + String(url).slice(0, 80))); };
      im.src = url;
    });
    IMGS.set(url, p);
    return p;
  }

  /* Paint a decoded image into `canvas`. o = { encoding, palette, brightness, contrast }.
     If the browser blocks pixel access (cross-origin without CORS), falls back to CSS filters
     (brightness/contrast only, no palette). Returns true when the palette could be applied. */
  function paint(canvas, img, o) {
    o = o || {};
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const b = o.brightness == null ? 1 : o.brightness, c = o.contrast == null ? 1 : o.contrast;
    ctx.drawImage(img, 0, 0, w, h);
    try {
      const id = ctx.getImageData(0, 0, w, h), d = id.data;
      if (o.encoding === 'rgb') {
        for (let i = 0; i < d.length; i += 4) {
          d[i] = clamp(((d[i] / 255 * b) - 0.5) * c + 0.5, 0, 1) * 255;
          d[i + 1] = clamp(((d[i + 1] / 255 * b) - 0.5) * c + 0.5, 0, 1) * 255;
          d[i + 2] = clamp(((d[i + 2] / 255 * b) - 0.5) * c + 0.5, 0, 1) * 255;
        }
      } else {
        const L = lut(o.palette || 'mono');
        for (let i = 0; i < d.length; i += 4) {
          const x = clamp(((d[i] / 255 * b) - 0.5) * c + 0.5, 0, 1), k = Math.round(x * 255) * 3;
          d[i] = L[k]; d[i + 1] = L[k + 1]; d[i + 2] = L[k + 2];
        }
      }
      ctx.putImageData(id, 0, 0);
      return true;
    } catch (e) {
      ctx.clearRect(0, 0, w, h);
      ctx.filter = 'brightness(' + b + ') contrast(' + c + ')';
      ctx.drawImage(img, 0, 0, w, h);
      ctx.filter = 'none';
      return false;
    }
  }

  SX.render = { RAMPS: RAMPS, PALETTES: PALETTES, ramp: ramp, tint: tint, coolIndex: coolIndex, fluxStar: fluxStar, fluxObject: fluxObject, stretchX: stretchX, colorFor: colorFor, lut: lut, loadImage: loadImage, paint: paint };
})();
