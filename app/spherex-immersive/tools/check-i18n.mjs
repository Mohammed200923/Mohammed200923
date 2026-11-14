// Verifies that every i18n key used by the code exists in English and Arabic, and that both dictionaries have the same keys.
//   node tools/check-i18n.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { EN } = await import(pathToFileURL(path.join(root, 'js/core/lang-en.js')).href);
const { AR } = await import(pathToFileURL(path.join(root, 'js/core/lang-ar.js')).href);

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!['vendor', 'node_modules', 'tools'].includes(f)) walk(p); } else if (/\.(js|html)$/.test(f) && !/lang-(en|ar)\.js$/.test(f)) files.push(p); } })(root);

const used = new Set();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.\-]+)'\s*[,)]/g)) used.add(m[1]);
  for (const m of s.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => used.add(p.split(':')[1].trim()));
  for (const m of s.matchAll(/'((?:q|story|as|ob|help|set|dev|tour|key|ctx|sel|viewer|info|search|tl|map|ir|band|dial|stat|nav|crumb|common|coord|prov|sky|fov|need|zoom|boot|a11y|app)\.[a-zA-Z0-9_.\-]+)'/g)) used.add(m[1]);
}
/* dynamic families: prefix -> allowed suffixes */
const dyn = {
  'cls.': ['star', 'nebula', 'galaxy', 'cluster', 'region', 'brown-dwarf', 'other'], 'status.': ['observed', 'planned', 'processing', 'failed'], 'avail.': ['available', 'partial', 'none', 'unknown'],
  'sig.': ['none', 'low', 'moderate', 'high'], 'change.': ['moved', 'brightened', 'dimmed'], 'pal.': ['natural', 'emerald', 'aurum', 'ice', 'dust'],
  'viewer.mode.': ['single', 'slider', 'side', 'diff', 'blink'], 'theme.': ['dark', 'light', 'system', 'dark.d', 'light.d', 'system.d'], 'level.': ['beginner', 'intermediate', 'advanced', 'beginner.d', 'intermediate.d', 'advanced.d'],
  'motion.': ['system', 'on', 'off'], 'dev.': ['latency', 'failure', 'noImages', 'noObservations'], 'story.tone.': ['warm', 'cold', 'drama', 'slow', 'neutral'], 'as.prov.': ['demo', 'model', 'analysis'],
  'err.': ['network', 'timeout', 'invalid-coordinates', 'not-found', 'no-observations', 'not-available', 'unsupported', 'bad-response', 'unknown'],
  'q.': ['ok', 'low-snr', 'cosmic-ray', 'saturated', 'scattered-light', 'partial-coverage', 'pending'], 'coord.err.': ['empty', 'format', 'minutes', 'range', 'summary'],
  'ob.': ['welcome.title', 'welcome.sub', 'language.title', 'language.sub', 'appearance.title', 'appearance.sub', 'level.title', 'level.sub', 'access.title', 'access.sub', 'done.title', 'done.sub'],
  'meta.': ['distance', 'angularSize', 'temperature', 'apparentMagnitude', 'spectralType', 'startTime', 'status', 'observationId', 'visit', 'exposure', 'pointing', 'bandsAvailable', 'coverage', 'processingLevel', 'instrument', 'changedFraction', 'peakChange', 'significance', 'encoding', 'wavelength', 'imageSize', 'colourMap']
};
for (const [p, list] of Object.entries(dyn)) list.forEach((s) => used.add(p + s));
['q.what', 'q.explain', 'q.history', 'q.changed', 'q.ir', 'q.compare', 'q.simpler', 'q.future'].forEach((k) => used.add(k));
['story.ch.', 'story.gen.'].forEach((p) => ['meet', 'discovery', 'traits', 'interesting', 'nasa', 'explore'].forEach((s) => used.add(p + s)));

let bad = 0;
for (const k of used) {
  if (k.endsWith('.')) continue;
  if (!(k in EN)) { console.log('MISSING in EN:', k); bad++; }
  if (!(k in AR)) { console.log('MISSING in AR:', k); bad++; }
}
for (const k of Object.keys(EN)) if (!(k in AR)) { console.log('EN only:', k); bad++; }
for (const k of Object.keys(AR)) if (!(k in EN) && !k.startsWith('const.')) { console.log('AR only:', k); bad++; }
console.log(bad ? `\n${bad} problem(s)` : `OK: ${Object.keys(EN).length} English keys, ${Object.keys(AR).length} Arabic keys, ${used.size} referenced.`);
process.exit(bad ? 1 : 0);
