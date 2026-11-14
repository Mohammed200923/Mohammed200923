// Live check against the real archives: node tests/live.mjs [target ...]
// For each challenge target, loads real SPHEREx data through server.py's proxy, then:
//  - fast movers: checks the brightest pixel near the predicted position in every visit
//  - every target: aperture photometry per visit at the predicted position
//  - the Gaia DR3 overlay loads
// Screenshots go to tests/screenshots/live-<target>.png and -diff.png.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('..', import.meta.url).pathname;
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

// Per-target wavelength windows: WISE 0855 is only visible at the long end.
const PLANS = {
  "Barnard's Star": { wmin: 0.75, wmax: 5 },
  'Epsilon Indi B': { wmin: 0.75, wmax: 5 },
  'WISE 0855−0714': { wmin: 3.8, wmax: 5 },
  'RW Aurigae': { wmin: 0.75, wmax: 5 },
  'R Draconis': { wmin: 0.75, wmax: 5 },
};
// Measurement helpers bundled for injection, so the test also works against the deployed
// single-file build, which has no separate js/ modules to import.
const helperDir = mkdtempSync(join(tmpdir(), 'skyshift-live-'));
const entry = join(helperDir, 'entry.mjs');
const { writeFileSync } = await import('node:fs');
writeFileSync(entry, `export { propagate, mjdToYear } from '${root}app/js/wcs.js';\nexport { aperturePhotometry } from '${root}app/js/stack.js';\n`);
execFileSync('npx', ['-y', 'esbuild@0.24.0', entry, '--bundle', '--format=iife', '--global-name=__liveHelpers', `--outfile=${join(helperDir, 'h.js')}`], { stdio: 'ignore' });
const helpers = readFileSync(join(helperDir, 'h.js'), 'utf8');

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["Barnard's Star"];
const max = process.env.MAX || '36';

// BASE_URL tests a deployed copy (e.g. the public Hugging Face Space) instead of a local server.
const port = 8766;
const base = process.env.BASE_URL?.replace(/\/$/, '') || `http://127.0.0.1:${port}`;
const server = process.env.BASE_URL ? null : spawn('python3', ['server.py', '--port', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
const summary = [];
let failed = false;
try {
  for (const name of targets) {
    const plan = PLANS[name] || { wmin: 0.75, wmax: 5 };
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    // Aladin Lite's own background fetches (usage logger, survey mirrors) are not ours to fix.
    page.on('pageerror', (e) => { if (!String(e.stack).includes('aladin-lite')) errors.push(e.message); });
    // A link with a target starts loading by itself.
    await page.goto(`${base}/?src=irsa&q=${encodeURIComponent(name)}&wmin=${plan.wmin}&wmax=${plan.wmax}&max=${max}`);
    await page.waitForFunction(() => {
      const s = window.__skyshift, st = document.getElementById('status');
      return (s?.seq?.length > 0 && !document.getElementById('go').disabled) || st.classList.contains('error');
    }, null, { timeout: 900000 });

    await page.addScriptTag({ content: helpers });
    const result = await page.evaluate(async () => {
      const { propagate, mjdToYear, aperturePhotometry } = window.__liveHelpers;
      const s = window.__skyshift, n = s.grid?.n, t = s.target;
      const status = document.getElementById('status').textContent;
      if (!s.seq.length) return { status, visits: [] };
      const visits = s.seq.map((f) => {
        const [ra, dec] = propagate(t.ra, t.dec, t.pmra || 0, t.pmdec || 0, t.epoch ?? 2000, mjdToYear(f.mjd));
        const [x, y] = s.grid.wcs.worldToPix(ra, dec);
        let best = [0, 0], bv = -Infinity;
        for (let j = Math.round(y) - 4; j <= Math.round(y) + 4; j++)
          for (let i = Math.round(x) - 4; i <= Math.round(x) + 4; i++)
            if (f.data[j * n + i] > bv) { bv = f.data[j * n + i]; best = [i, j]; }
        return {
          date: new Date((f.mjd - 40587) * 864e5).toISOString().slice(0, 10),
          n: f.members.length,
          lambda: `${f.wlMin.toFixed(2)}–${f.wlMax.toFixed(2)}`,
          offsetPx: Number(Math.hypot(best[0] - x, best[1] - y).toFixed(2)),
          fluxMJy: Number(aperturePhotometry(f.data, n, x, y, s.grid.scaleArcsec).toPrecision(3)),
        };
      });
      return {
        movers: s.movers.map((m) => `${m.tier} ${m.total.toFixed(1)}″/yr${m.isTarget ? ' (target)' : ''} gaia:${m.gaia.kind}`),
        status, frames: s.frames.length, exact: s.frames.filter((f) => f.wlExact).length,
        pmTotal: Math.hypot(t.pmra || 0, t.pmdec || 0), visits,
      };
    });
    const tag = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
    await page.evaluate(() => document.getElementById('play').click());
    await page.check('#ov-gaia');
    await page.waitForFunction(() => window.__skyshift.gaia || document.getElementById('status').classList.contains('error'), null, { timeout: 60000 }).catch(() => {});
    result.gaia = await page.evaluate(() => window.__skyshift.gaia?.length ?? document.getElementById('status').textContent);
    await page.screenshot({ path: `${shots}live-${tag}.png`, fullPage: true });
    await page.check('#diff');
    await page.screenshot({ path: `${shots}live-${tag}-diff.png`, fullPage: true });
    result.errors = errors;
    console.log(`\n=== ${name}\n${JSON.stringify(result, null, 1)}`);

    // Gaia classification arrives a few seconds after the frames.
    await page.waitForTimeout(5000);
    result.movers = await page.evaluate(() => window.__skyshift.movers.map((m) => `${m.tier} ${m.total.toFixed(1)}″/yr${m.isTarget ? ' (target)' : ''} gaia:${m.gaia.kind}`));
    const fast = result.pmTotal > 1000;
    const ok = result.visits.length > 0 && errors.length === 0 &&
      // Visits with only one or two exposures may not detect a faint target (e.g. WISE 0855).
      (!fast || result.visits.filter((v) => v.n >= 4).every((v) => v.offsetPx <= 1.5));
    summary.push(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${result.visits.length} visits, ${result.frames ?? 0} exposures` +
      (fast ? `, max offset ${Math.max(...result.visits.filter((v) => v.n >= 4).map((v) => v.offsetPx))} px (visits with ≥4 exposures)` : '') + `, Gaia ${result.gaia}`);
    failed ||= !ok;
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
console.log('\n' + summary.join('\n'));
assert.ok(!failed, 'some live checks failed');
