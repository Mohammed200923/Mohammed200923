// Dev tool: computes WCAG 2.1 contrast ratios for the colour pairs the UI actually uses, per theme.
//   node tools/check-contrast.mjs        (exit code 1 if any text pair is below 4.5:1 or any UI-graphic pair below 3:1)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'css/tokens.css'), 'utf8');

const block = (selector) => {
  const i = css.indexOf(selector); if (i < 0) throw new Error('missing ' + selector);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
};
const parse = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const dark = parse(block(':root,\n:root[data-theme="dark"]'));
const light = { ...dark, ...parse(block(':root[data-theme="light"]')) };
const hcDark = { ...dark, ...parse(block(':root[data-contrast="high"][data-theme="dark"]')) };
const hcLight = { ...light, ...parse(block(':root[data-contrast="high"][data-theme="light"]')) };

const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const over = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { rgb: p.slice(0, 3), a: p[3] == null ? 1 : p[3] }; };
const col = (t, name, under) => { const v = t[name]; if (v.startsWith('#')) return hex(v); const c = rgba(v); return over(c.rgb, under, c.a); };

let bad = 0;
function run(title, t) {
  const bg = hex(t.bg), panel = hex(t.panel), bg2 = hex(t.bg2);
  const goldSoftOnPanel = col(t, 'gold-soft', panel), accSoftOnPanel = col(t, 'accent-soft', panel), dangerSoftOnPanel = col(t, 'danger-soft', panel);
  const rows = [
    ['Body text on page', hex(t.ink), bg, 4.5],
    ['Body text on card', hex(t.ink), panel, 4.5],
    ['Secondary text on page', hex(t.ink2), bg, 4.5],
    ['Secondary text on card', hex(t.ink2), panel, 4.5],
    ['Secondary text on inset surface', hex(t.ink2), bg2, 4.5],
    ['Accent text on card', hex(t['accent-text']), panel, 4.5],
    ['Accent text on soft accent', hex(t['accent-text']), accSoftOnPanel, 4.5],
    ['Gold text on soft gold', hex(t['gold-text']), goldSoftOnPanel, 4.5],
    ['Danger text on soft danger', hex(t.danger), dangerSoftOnPanel, 4.5],
    ['Danger text on card', hex(t.danger), panel, 4.5],
    ['Button text on accent fill', hex(t['on-accent']), hex(t.accent), 4.5],
    ['Accent (icons, rings) on card', hex(t.accent), panel, 3],
    ['Focus ring on page', hex(t.focus), bg, 3],
    ['Focus ring on card', hex(t.focus), panel, 3]
  ];
  console.log('\n' + title);
  for (const [name, fg, b, min] of rows) {
    const r = ratio(fg, b), ok = r >= min;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  (need ${min})  ${name}`);
  }
}
run('DARK', dark); run('LIGHT', light); run('DARK + high contrast', hcDark); run('LIGHT + high contrast', hcLight);

// The night-sky viewer overlay (fixed in both themes)
const m = parse(block(':root {\n  --map-glass'));
const glassOnSky = over(rgba(m['map-glass']).rgb, [3, 8, 6], rgba(m['map-glass']).a);
console.log('\nMAP OVERLAYS (always dark)');
for (const [name, fg, min] of [['Overlay text', hex(m['map-ink']), 4.5], ['Overlay secondary text', hex(m['map-ink2']), 4.5], ['Overlay gold text', hex(m['map-gold']), 4.5], ['Overlay accent', hex(m['map-accent']), 3]]) {
  const r = ratio(fg, glassOnSky), ok = r >= min; if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  (need ${min})  ${name}`);
}
console.log(bad ? `\n${bad} pair(s) below threshold.` : '\nAll pairs meet WCAG AA.');
process.exit(bad ? 1 : 0);
