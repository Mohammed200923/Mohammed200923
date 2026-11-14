// Dev tool: verifies that every translation key used by the app exists in BOTH dictionaries.
//   node tools/check-i18n.mjs            -> report + non-zero exit code on problems
//   node tools/check-i18n.mjs --list     -> print all statically referenced keys
// Dynamic keys (built by string concatenation) are covered by the DYNAMIC families below.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

function loadDict(file) {
  const sandbox = { window: { SX: { i18n: { dict: { en: {}, ar: {} } } } } };
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox);
  return sandbox.window.SX.i18n.dict;
}
const en = loadDict('js/i18n/en.js').en, ar = loadDict('js/i18n/ar.js').ar;

const used = new Set();
const html = read('index.html');
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => { const k = p.split(':')[1]; if (k) used.add(k.trim()); });

const files = walk('js').filter((f) => f.endsWith('.js') && !f.includes('i18n'));
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/\bt\(\s*'([\w.\-]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*"([\w.\-]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => { const k = p.split(':')[1]; if (k) used.add(k.trim()); });
  for (const m of src.matchAll(/\bt\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) for (const q of m[1].matchAll(/'([a-z][\w.\-]*\.[\w.\-]*[\w])'/g)) used.add(q[1]);
  for (const m of src.matchAll(/(?:label|desc|say|key):\s*'([a-z]+\.[\w.]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/\['(?:\w+)',\s*(?:null|'[\w-]+'),\s*'(act\.\w+)'\]/g)) used.add(m[1]);
}

// Families produced by concatenation, e.g. t('mode.' + id) -> mode.everyday ...
const DYNAMIC = {
  'cls.': ['star', 'nebula', 'galaxy', 'cluster', 'region', 'brown-dwarf', 'other', 'field'],
  'const.': ['Orion', 'Canis Major', 'Lyra', 'Andromeda', 'Taurus', 'Ophiuchus', 'Hydra', 'Sagittarius', 'Serpens', 'Dorado', 'Piscis Austrinus', 'Scorpius', 'Ursa Minor', 'Centaurus', 'Carina', 'Triangulum', 'Virgo'],
  'mode.': ['everyday', 'warm', 'dust', 'cold', 'composite', 'custom', 'everyday.d', 'warm.d', 'dust.d', 'cold.d', 'composite.d', 'custom.d'],
  'pal.': ['natural', 'emerald', 'aurum', 'ice', 'dust', 'mono', 'natural.s', 'emerald.s', 'aurum.s', 'ice.s', 'dust.s', 'mono.s'],
  'band.hint.': ['1', '2', '3', '4', '5', '6'],
  'theme.': ['dark', 'light', 'system'],
  'level.': ['beginner', 'intermediate', 'advanced'],
  'avail.': ['available', 'partial', 'none', 'unknown'],
  'obs.status.': ['observed', 'planned', 'processing', 'failed'],
  'obs.f.': ['all', 'observed', 'planned'],
  'q.': ['ok', 'low-snr', 'cosmic-ray', 'saturated', 'scattered-light', 'partial-coverage', 'pending'],
  'err.': ['network', 'timeout', 'invalid-coordinates', 'not-found', 'no-observations', 'not-available', 'unsupported', 'bad-response', 'unknown'].flatMap((c) => [`${c}.title`, `${c}.text`]),
  'coord.err.': ['empty', 'format', 'minutes', 'range'].flatMap((c) => [`${c}.ra`, `${c}.dec`]),
  'cmp.m.': ['slider', 'side', 'diff', 'blink'],
  'cmp.sig.': ['none', 'low', 'moderate', 'high'],
  'cmp.ct.': ['moved', 'brightened', 'dimmed'],
  'unit.': ['ly', 'millionLy', 'K', 'deg', 's', '%'],
  'meta.': ['distance', 'temperature', 'spectralType', 'angularSize', 'apparentMagnitude', 'observationId', 'visit', 'startTime', 'status', 'exposure', 'pointing', 'bandsAvailable', 'coverage', 'processingLevel', 'instrument'],
  'gloss.': ['ra', 'dec', 'infrared', 'wavelength', 'band', 'fov', 'observation', 'difference', 'browndwarf', 'nebula', 'lightyear', 'redshift'].flatMap((g) => [`${g}.t`, `${g}.d`]),
  'dc.l.': ['fast', 'normal', 'slow'],
  'dc.f.': ['none', 'network', 'random', 'timeout'],
  'ob.': ['language', 'theme', 'level', 'access', 'done'].flatMap((s) => [`${s}.t`, `${s}.d`]),
  'bot.': ['greet', 'start', 'nav', 'search', 'coords', 'infrared', 'wavelength', 'fov', 'timeline', 'compare', 'observations', 'prefs', 'level', 'shortcuts', 'term.spherex', 'term.demo', 'term.brown', 'term.nebula', 'term.galaxy', 'term.ly', 'term.band',
    'did.dark', 'did.light', 'did.system', 'did.ar', 'did.en', 'did.text', 'did.contrast', 'did.motion', 'did.beginner', 'did.intermediate', 'did.advanced', 'did.explorer', 'did.observations', 'did.comparison', 'did.settings', 'did.help', 'did.dust', 'did.cold', 'did.warm', 'did.everyday', 'did.composite', 'did.play', 'did.search', 'did.coords'],
  'bot.chip.': ['start', 'search', 'infrared', 'timeline', 'compare', 'prefs'],
  'dc.': ['latency', 'failure', 'noImages', 'noObs'],
  'metric.': ['fov', 'wl', 'band', 'ra', 'dec', 'channels', 'visits', 'provider'],
  'lang.': ['en.d', 'ar.d'],
  'toast.': ['theme', 'lang', 'level']
};
for (const [prefix, list] of Object.entries(DYNAMIC)) list.forEach((k) => used.add(prefix + k));
for (const k of [...used]) if (k.endsWith('.')) used.delete(k);

if (process.argv.includes('--list')) { console.log([...used].sort().join('\n')); process.exit(0); }

const missingEn = [...used].filter((k) => !(k in en)).sort();
const missingAr = [...used].filter((k) => !(k in ar)).sort();
const orphanAr = Object.keys(ar).filter((k) => !(k in en)).sort();
const unusedEn = Object.keys(en).filter((k) => !used.has(k)).sort();
const same = Object.keys(ar).filter((k) => k in en && ar[k] === en[k] && /[a-z]{4,}/i.test(en[k]) && !/^(app\.|lang\.|unit\.|strip\.band)/.test(k)).sort();

let bad = false;
const show = (title, arr, fail = true) => { if (arr.length) { console.log(`\n${title} (${arr.length})`); arr.forEach((k) => console.log('  ' + k)); if (fail) bad = true; } };
show('Missing in en.js', missingEn);
show('Missing in ar.js', missingAr);
show('In ar.js but not en.js', orphanAr);
show('Defined but not referenced (info)', unusedEn, false);
show('Arabic identical to English (check these are intentional)', same, false);
console.log(`\n${used.size} keys referenced, ${Object.keys(en).length} English, ${Object.keys(ar).length} Arabic.`);
process.exit(bad ? 1 : 0);
