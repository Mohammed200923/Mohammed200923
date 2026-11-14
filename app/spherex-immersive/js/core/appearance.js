/* Turns saved preferences into <html> attributes and tells the sky about theme / motion / performance. */
import { prefs } from './state.js';

const mqDark = window.matchMedia('(prefers-color-scheme: dark)'), mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
export const resolvedTheme = () => (prefs.theme === 'system' ? (mqDark.matches ? 'dark' : 'light') : prefs.theme);
export const reducedMotion = () => (prefs.reducedMotion === 'system' ? mqMotion.matches : prefs.reducedMotion === 'on');

let sky = null;
export function applyAppearance(skyApi) {
  if (skyApi) sky = skyApi;
  const d = document.documentElement;
  d.dataset.theme = resolvedTheme(); d.dataset.level = prefs.level; d.dataset.motion = reducedMotion() ? 'reduced' : 'full';
  d.dataset.perf = prefs.lowPerf ? 'low' : 'normal';
  prefs.largeText ? (d.dataset.text = 'large') : delete d.dataset.text;
  prefs.contrast ? (d.dataset.contrast = 'high') : delete d.dataset.contrast;
  if (sky) { sky.setTheme(resolvedTheme() === 'light'); sky.setReducedMotion(reducedMotion()); sky.setLowPerf(prefs.lowPerf); sky.requestRender(); }
}
[mqDark, mqMotion].forEach((m) => m.addEventListener && m.addEventListener('change', () => applyAppearance()));
