/* Frontend coordinate parsing and validation (input hygiene only, no astronomy).
   Accepts decimal degrees, hours/minutes/seconds, degrees/arcminutes/arcseconds.
     RA : 83.82   5.588h   05h35m17s   05:35:17   05 35 17
     Dec: -5.39   -05d23m  -05° 23′ 17″   -05:23:17
   Results use the codes: ok | empty | format | minutes | range                         */
(function () {
  const SX = window.SX;

  function normalise(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/[−–—]/g, '-')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/٫/g, '.')
      .replace(/[°]/g, 'd').replace(/[′’']/g, 'm').replace(/[″”"]/g, 's')
      .replace(/\s+/g, ' ');
  }

  /* kind: 'ra' | 'dec' */
  function parseAngle(text, kind) {
    const s = normalise(text);
    if (!s) return { ok: false, code: 'empty' };
    const nums = s.match(/\d+(?:\.\d+)?/g);
    const rest = s.replace(/\d+(?:\.\d+)?/g, '').replace(/[hdms:\s+-]/g, '');
    if (!nums || rest.length) return { ok: false, code: 'format' };
    if (nums.length > 3) return { ok: false, code: 'format' };
    if ((s.match(/[+-]/g) || []).length > 1 || (/[+-]/.test(s) && !/^[+-]/.test(s))) return { ok: false, code: 'format' };
    const sign = s[0] === '-' ? -1 : 1;
    const hasH = /h/.test(s), hasD = /d/.test(s);
    if (kind === 'ra' && sign < 0) return { ok: false, code: 'range' };
    if (kind === 'dec' && hasH) return { ok: false, code: 'format' };
    if (nums.length === 1 && !/[:\s]/.test(s.replace(/^[+-]/, '').trim().replace(/[hdms]$/, ''))) {
      let v = parseFloat(nums[0]);
      if (kind === 'ra') { v = hasH ? v * 15 : v; if (v < 0 || v >= 360) return { ok: false, code: 'range' }; return { ok: true, value: v }; }
      v = sign * v; if (v < -90 || v > 90) return { ok: false, code: 'range' };
      return { ok: true, value: v };
    }
    const a = parseFloat(nums[0]), m = parseFloat(nums[1] || 0), sec = parseFloat(nums[2] || 0);
    if (m >= 60 || sec >= 60) return { ok: false, code: 'minutes' };
    let v = a + m / 60 + sec / 3600;
    if (kind === 'ra') {
      const inHours = hasH || (!hasD);
      if (inHours) { if (a >= 24) return { ok: false, code: 'range' }; v *= 15; }
      if (v < 0 || v >= 360) return { ok: false, code: 'range' };
      return { ok: true, value: v };
    }
    v *= sign; if (v < -90 || v > 90) return { ok: false, code: 'range' };
    return { ok: true, value: v };
  }

  /* Two separate fields. Returns { ok, ra, dec, errors:{ra?,dec?} } */
  function parse(raText, decText) {
    const r = parseAngle(raText, 'ra'), d = parseAngle(decText, 'dec');
    if (r.ok && d.ok) return { ok: true, ra: r.value, dec: d.value, errors: {} };
    const errors = {};
    if (!r.ok) errors.ra = r.code;
    if (!d.ok) errors.dec = d.code;
    return { ok: false, errors: errors };
  }

  /* One free-text box: "83.82, -5.39", "83.82 -5.39", "ra=05h35m dec=-05d23m", "05h35m17s -05d23m". */
  function splitCombined(q) {
    let s = String(q || '').trim();
    if (!s) return null;
    const lab = s.match(/ra\s*[=:]?\s*(.+?)[,;\s]+dec\s*[=:]?\s*(.+)$/i);
    if (lab) return [lab[1], lab[2]];
    s = s.replace(/^\s*(?:ra|dec)\s*[=:]?/i, '');
    if (/[,;]/.test(s)) { const p = s.split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean); return p.length === 2 ? p : null; }
    const m = s.match(/^(.*?\d[hdms°′″'"]*)\s+([+\-−–]\s*\d.*)$/i);
    if (m) return [m[1], m[2]];
    const plain = s.split(/\s+/);
    if (plain.length === 2 && plain.every(function (x) { return /^[+\-−–]?[\d.٠-٩]+$/.test(x); })) return plain;
    return null;
  }

  /* Does free text look like the user is typing coordinates rather than a name? */
  function looksLikeCoords(q) {
    const s = String(q || '').trim();
    if (!s) return false;
    if (/^(ra|dec)\b/i.test(s)) return true;
    return /^[+\-−–]?\d/.test(s) && /[\d.]/.test(s) && !/[a-z]{3,}/i.test(s.replace(/ra|dec|[hdms]/gi, ''));
  }

  function parseCombined(q) {
    const parts = splitCombined(q);
    if (!parts) return { ok: false, errors: { combined: 'format' } };
    return parse(parts[0], parts[1]);
  }

  SX.coords = { parse: parse, parseAngle: parseAngle, parseCombined: parseCombined, looksLikeCoords: looksLikeCoords };
})();
