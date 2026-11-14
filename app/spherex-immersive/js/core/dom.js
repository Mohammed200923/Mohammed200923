export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
}
export const icon = (name, cls = '') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ic ' + cls); s.setAttribute('aria-hidden', 'true'); s.innerHTML = `<use href="#i-${name}"/>`; return s; };
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const fmtDate = (iso, lang) => { try { return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return String(iso); } };
let liveEl;
export function announce(msg) { liveEl = liveEl || $('#live'); if (!liveEl) return; liveEl.textContent = ''; setTimeout(() => { liveEl.textContent = msg; }, 30); }
export function toast(msg, ms = 3200) {
  const box = $('#toasts'); if (!box) return; const t = h('div', { class: 'toast', role: 'status', text: msg }); box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}
export function trapFocus(root, onEscape) {
  const prev = document.activeElement;
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function key(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onEscape && onEscape(); return; }
    if (e.key !== 'Tab') return;
    const f = $$(sel, root).filter((x) => x.offsetParent !== null); if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === a || !root.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  root.addEventListener('keydown', key);
  return () => { root.removeEventListener('keydown', key); prev && prev.focus && prev.focus(); };
}
