// Minimal FITS reader/writer: primary + IMAGE extensions, header-only for tables.
// Enough for SPHEREx Level-2 MEF cutouts (IMAGE, FLAGS, VARIANCE, ZODI, PSF, WCS-WAVE).

const BLOCK = 2880;

function ascii(bytes, start, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[start + i]);
  return s;
}

function parseValue(raw) {
  const t = raw.trim();
  if (t.startsWith("'")) {
    // String: '' escapes a quote, terminated by a lone quote.
    let out = '';
    for (let i = 1; i < t.length; i++) {
      if (t[i] === "'") {
        if (t[i + 1] === "'") { out += "'"; i++; continue; }
        break;
      }
      out += t[i];
    }
    return out.replace(/\s+$/, '');
  }
  const v = t.split('/')[0].trim();
  if (v === 'T') return true;
  if (v === 'F') return false;
  if (v === '') return null;
  const n = Number(v.replace(/[dD]/, 'E'));
  return Number.isNaN(n) ? v : n;
}

export async function maybeGunzip(buffer) {
  const u8 = new Uint8Array(buffer);
  if (u8[0] === 0x1f && u8[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).arrayBuffer();
  }
  return buffer;
}

function readImage(view, offset, header) {
  const bitpix = header.BITPIX;
  const w = header.NAXIS1 || 0, h = header.NAXIS2 || 1;
  const n = w * h;
  const bscale = header.BSCALE ?? 1, bzero = header.BZERO ?? 0;
  const blank = header.BLANK;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v;
    switch (bitpix) {
      case 8: v = view.getUint8(offset + i); break;
      case 16: v = view.getInt16(offset + 2 * i, false); break;
      case 32: v = view.getInt32(offset + 4 * i, false); break;
      case 64: v = Number(view.getBigInt64(offset + 8 * i, false)); break;
      case -32: v = view.getFloat32(offset + 4 * i, false); break;
      case -64: v = view.getFloat64(offset + 8 * i, false); break;
      default: throw new Error(`Unsupported BITPIX ${bitpix}`);
    }
    if (bitpix > 0 && blank !== undefined && v === blank) out[i] = NaN;
    else out[i] = bitpix > 0 ? v * bscale + bzero : (bscale === 1 && bzero === 0 ? v : v * bscale + bzero);
  }
  return { data: out, width: w, height: h };
}

export function parseFits(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const hdus = [];
  let off = 0;
  while (off + BLOCK <= bytes.length) {
    const header = {};
    const cards = [];
    let ended = false;
    while (!ended && off + BLOCK <= bytes.length) {
      for (let i = 0; i < 36; i++) {
        const card = ascii(bytes, off + i * 80, 80);
        const key = card.slice(0, 8).trim();
        if (key === 'END') { ended = true; break; }
        cards.push(card);
        if (card.slice(8, 10) === '= ' && key) header[key] = parseValue(card.slice(10));
      }
      off += BLOCK;
    }
    if (!ended) break;
    if (hdus.length === 0 && header.SIMPLE !== true) throw new Error('Not a FITS file');
    const naxis = header.NAXIS || 0;
    let count = naxis > 0 ? 1 : 0;
    for (let k = 1; k <= naxis; k++) count *= header[`NAXIS${k}`];
    const pcount = header.PCOUNT || 0, gcount = header.GCOUNT || 1;
    const nbytes = naxis > 0 ? (Math.abs(header.BITPIX) / 8) * gcount * (pcount + count) : 0;
    const hdu = { header, cards, name: (header.EXTNAME || (hdus.length ? '' : 'PRIMARY')).toUpperCase() };
    const isImage = hdus.length === 0 || header.XTENSION === 'IMAGE';
    if (header.ZIMAGE === true) hdu.compressed = true;
    if (isImage && naxis >= 2 && off + nbytes <= bytes.length) {
      Object.assign(hdu, readImage(view, off, header));
    }
    hdus.push(hdu);
    off += Math.ceil(nbytes / BLOCK) * BLOCK;
  }
  return hdus;
}

/** Pick the science/flags/zodi planes out of a SPHEREx-style MEF (falls back to first 2-D image). */
export function spherexPlanes(hdus) {
  const byName = (n) => hdus.find((h) => h.name === n && h.data);
  const image = byName('IMAGE') || hdus.find((h) => h.data);
  if (!image) {
    if (hdus.some((h) => h.compressed)) throw new Error('Tile-compressed FITS is not supported yet');
    throw new Error('No image data in FITS file');
  }
  return { image, flags: byName('FLAGS'), zodi: byName('ZODI'), variance: byName('VARIANCE'), primary: hdus[0] };
}

// ---- writer (used by the simulated data source and tests) ----

function card(key, value, comment = '') {
  let v;
  if (typeof value === 'string') v = `'${value.replace(/'/g, "''").padEnd(8)}'`.padEnd(20);
  else if (typeof value === 'boolean') v = (value ? 'T' : 'F').padStart(20);
  else v = (Number.isInteger(value) ? String(value) : value.toExponential(12).toUpperCase()).padStart(20);
  return `${key.padEnd(8)}= ${v}${comment ? ' / ' + comment : ''}`.slice(0, 80).padEnd(80);
}

function headerBlock(entries) {
  const lines = entries.map(([k, v, c]) => card(k, v, c));
  lines.push('END'.padEnd(80));
  const text = lines.join('');
  return text.padEnd(Math.ceil(text.length / BLOCK) * BLOCK);
}

/** hdus: [{ header: [[key, value, comment], ...], data: Float32Array|Int32Array, width, height }] */
export function writeFits(hdus) {
  const parts = [];
  hdus.forEach((h, idx) => {
    const isInt = h.data instanceof Int32Array;
    const base = idx === 0
      ? [['SIMPLE', true], ['BITPIX', isInt ? 32 : -32], ['NAXIS', 2], ['NAXIS1', h.width], ['NAXIS2', h.height], ['EXTEND', true]]
      : [['XTENSION', 'IMAGE'], ['BITPIX', isInt ? 32 : -32], ['NAXIS', 2], ['NAXIS1', h.width], ['NAXIS2', h.height], ['PCOUNT', 0], ['GCOUNT', 1]];
    const hdr = headerBlock(base.concat(h.header));
    const hb = new Uint8Array(hdr.length);
    for (let i = 0; i < hdr.length; i++) hb[i] = hdr.charCodeAt(i);
    parts.push(hb);
    const n = h.width * h.height;
    const db = new Uint8Array(Math.ceil((n * 4) / BLOCK) * BLOCK);
    const dv = new DataView(db.buffer);
    for (let i = 0; i < n; i++) {
      if (isInt) dv.setInt32(4 * i, h.data[i], false);
      else dv.setFloat32(4 * i, h.data[i], false);
    }
    parts.push(db);
  });
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}
