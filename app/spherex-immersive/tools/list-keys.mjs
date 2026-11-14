// Lists every i18n key referenced by the code. Dynamic keys (prefix + variable) are reported as prefixes.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!['vendor', 'node_modules', 'tools'].includes(f)) walk(p); } else if (/\.(js|html)$/.test(f)) files.push(p); } })(root);
const keys = new Set(), prefixes = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.\-]+)'/g)) keys.add(m[1]);
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.\-]+)'\s*\+/g)) prefixes.add(m[1]);
  for (const m of s.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
  for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => keys.add(p.split(':')[1].trim()));
  for (const m of s.matchAll(/'((?:story|as|ob|help|set|dev|tour|key|ctx|sel|viewer|info|search|tl|map|ir|band|dial|stat|nav|crumb|common|coord|err|prov|sky|fov|need|zoom|boot|a11y|app|cls|const|status|avail|sig|change|pal|theme|level|motion|q)\.[a-zA-Z0-9_.\-]+)'/g)) keys.add(m[1]);
}
const out = [...keys].filter((k) => !prefixes.has(k + '.')).sort();
console.log(out.join('\n')); console.error('\nDynamic prefixes:\n' + [...prefixes].sort().join('\n'));
