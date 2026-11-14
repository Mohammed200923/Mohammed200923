/* Sky chart: the reference's map card, adapted. Equirectangular chart (RA increases to the left, as on the sky seen from inside). */
import { $, announce } from '../core/dom.js';
import { S, bus } from '../core/state.js';
import { t, loc } from '../core/i18n.js';

const CLASS_COL = { star: '#ffd84d', nebula: '#38f2c2', galaxy: '#9fd0ff', cluster: '#b8ff8a', region: '#7dff5a', 'brown-dwarf': '#ff9ec0', other: '#f4fff9' };
let sky, cv, ctx, big = false, drag = false;

const toXY = (ra, dec, W, H) => [((360 - ra) / 360) * W, ((90 - dec) / 180) * H];
const fromXY = (x, y, W, H) => ({ ra: 360 - (x / W) * 360, dec: 90 - (y / H) * 180 });

export function init(skyApi) {
  sky = skyApi; cv = $('#mm-canvas'); ctx = cv.getContext('2d');
  const toggle = () => setBig(!big);
  $('#mm-expand').addEventListener('click', toggle); $('#mm-btn').addEventListener('click', toggle);
  const go = (e, fly) => {
    const r = cv.getBoundingClientRect(), p = fromXY(((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height, cv.width, cv.height);
    const ra = ((p.ra % 360) + 360) % 360, dec = Math.max(-89, Math.min(89, p.dec));
    fly ? sky.flyTo({ ra, dec }) : sky.setView({ ra, dec });
  };
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = true; sky.stopFly(); go(e, false); });
  cv.addEventListener('pointermove', (e) => { if (drag) go(e, false); });
  cv.addEventListener('pointerup', () => { drag = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && big) setBig(false); });
  new ResizeObserver(fit).observe($('.mm-frame'));
  sky.on('view', draw); ['featured', 'target', 'lang', 'theme'].forEach((e) => bus.on(e, draw));
  fit();
}

function setBig(b) {
  big = b; $('#minimap').classList.toggle('big', b);
  $('#mm-expand').innerHTML = `<svg class="ic"><use href="#i-${b ? 'shrink' : 'expand'}"/></svg>`;
  $('#mm-btn').textContent = t(b ? 'map.close' : 'map.cta');
  announce(t(b ? 'map.open_announce' : 'map.closed_announce'));
  requestAnimationFrame(fit);
}

function fit() {
  const f = $('.mm-frame'), r = f.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(200, Math.round(r.width * dpr)), h = Math.max(100, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  draw();
}

function draw() {
  if (!ctx) return;
  const W = cv.width, H = cv.height, light = document.documentElement.dataset.theme === 'light', v = sky.getView();
  const fg = light ? '10,26,22' : '244,255,249';
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, light ? '#cfe3da' : '#03110e'); g.addColorStop(1, light ? '#e2efe9' : '#0a2420'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${fg},0.12)`; ctx.beginPath();
  for (let ra = 0; ra <= 360; ra += 30) { const [x] = toXY(ra, 0, W, H); ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let dec = -60; dec <= 60; dec += 30) { const [, y] = toXY(0, dec, W, H); ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke(); ctx.strokeStyle = `rgba(${fg},0.28)`; ctx.beginPath(); const [, ye] = toXY(0, 0, W, H); ctx.moveTo(0, ye); ctx.lineTo(W, ye); ctx.stroke();
  const r = Math.max(2, W / 150);
  S.targets.forEach((tg) => {
    const [x, y] = toXY(tg.coordinates.ra, tg.coordinates.dec, W, H); ctx.fillStyle = CLASS_COL[tg.classification] || '#fff'; ctx.globalAlpha = light ? 0.95 : 0.9;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    if (big) { ctx.fillStyle = `rgba(${fg},0.85)`; ctx.font = `${Math.round(W / 70)}px system-ui,sans-serif`; ctx.fillText(loc(tg.name), x + r + 4, y + 4); }
  });
  /* current view rectangle */
  const sz = sky.getSize(), fovH = v.fov * (sz.w / sz.h), cosd = Math.max(0.2, Math.cos((v.dec * Math.PI) / 180));
  const rw = Math.min(360, fovH / cosd) / 360 * W, rh = (v.fov / 180) * H, [cx, cy] = toXY(v.ra, v.dec, W, H);
  ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = Math.max(1.5, W / 260);
  [-W, 0, W].forEach((o) => ctx.strokeRect(cx - rw / 2 + o, cy - rh / 2, rw, rh));
  /* selected marker: white circle, as in the reference */
  const p = S.target ? S.target.coordinates : S.pos;
  if (p) { const [x, y] = toXY(p.ra, p.dec, W, H); ctx.strokeStyle = light ? '#0a1a16' : '#fff'; ctx.lineWidth = Math.max(2, W / 200); ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 6.283); ctx.stroke(); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, 6.283); ctx.fill(); }
  $('#mm-read').textContent = `RA ${v.ra.toFixed(1)}°  Dec ${v.dec.toFixed(1)}°`;
}
