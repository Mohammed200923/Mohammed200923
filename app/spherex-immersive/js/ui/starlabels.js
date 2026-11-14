/* Names of real bright stars (IAU names, positions from Hipparcos). More names appear as you zoom in;
   brighter stars win when labels would overlap. Purely a label layer: clicking the sky works as before. */
import { h } from '../core/dom.js';

const NAMES_URL = new URL('../../data/star-names.json', import.meta.url);
let sky, layer, names = [], nodes = [], lastSig = '';

export function init(skyApi) {
  sky = skyApi;
  layer = h('div', { class: 'labels star-labels', 'aria-hidden': 'true' });
  const targets = document.getElementById('labels');
  targets.parentNode.insertBefore(layer, targets);
  fetch(NAMES_URL).then((r) => r.json()).then((list) => {
    names = list; nodes = list.map(([n]) => { const el = h('div', { class: 'slabel', text: n }); el.style.display = 'none'; layer.append(el); return el; });
    lastSig = '';
  }).catch(() => { /* names are optional */ });
  sky.on('frame', update);
  sky.on('resize', () => { lastSig = ''; });
}

function update() {
  if (!names.length) return;
  const v = sky.getView(), sz = sky.getSize(), sig = [v.ra.toFixed(3), v.dec.toFixed(3), v.fov.toFixed(3), v.roll.toFixed(1), sz.w, sz.h].join('|');
  if (sig === lastSig) return; lastSig = sig;
  const limit = v.fov >= 60 ? 1.6 : v.fov >= 30 ? 2.6 : v.fov >= 12 ? 3.6 : 6;
  const cap = sz.w < 700 ? 8 : 30, boxes = [];
  // Stars that are also targets (e.g. Betelgeuse) already have a label.
  const taken = new Set([...document.querySelectorAll('#labels .tlabel')].map((e) => e.textContent.trim().toLowerCase()));
  for (let i = 0; i < names.length; i++) {
    const [, ra, dec, mag] = names[i], el = nodes[i];
    let show = mag <= limit && boxes.length < cap && !taken.has(names[i][0].toLowerCase());
    let p;
    if (show) { p = sky.project(ra, dec); show = p.visible && p.x > 0 && p.y > 0 && p.x < sz.w - 60 && p.y < sz.h; }
    if (show) {
      const x = p.x + 8, y = p.y - 5, w = 8 + names[i][0].length * 6.5;
      show = !boxes.some((b) => x < b.x + b.w && b.x < x + w && Math.abs(y - b.y) < 14);
      if (show) { boxes.push({ x, y, w }); el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; }
    }
    el.style.display = show ? '' : 'none';
  }
}
