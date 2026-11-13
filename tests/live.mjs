// Live check against the real NASA/IPAC archive: node tests/live.mjs
// Loads Barnard's Star from SPHEREx (through server.py's proxy), then checks that the
// brightest source near the predicted position follows the star's known proper motion.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('..', import.meta.url).pathname;
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const port = 8766;
const server = spawn('python3', ['server.py', '--port', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const max = process.env.MAX || '36';
  await page.goto(`http://127.0.0.1:${port}/?src=irsa&q=${encodeURIComponent("Barnard's Star")}&size=6`);
  await page.fill('#max', max);
  await page.click('#go');
  await page.waitForFunction(() => window.__skyshift?.seq?.length > 0 || document.getElementById('status').classList.contains('error'),
    null, { timeout: 600000 });
  const info = await page.evaluate(() => {
    const s = window.__skyshift;
    return {
      status: document.getElementById('status').textContent,
      frames: s.frames.length, exact: s.frames.filter((f) => f.wlExact).length,
      visits: s.seq.map((v) => ({ label: v.label, date: new Date((v.mjd - 40587) * 864e5).toISOString().slice(0, 10), n: v.members.length })),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  assert.ok(info.frames > 0, info.status);

  const offsets = await page.evaluate(async () => {
    const { propagate, mjdToYear } = await import('./js/wcs.js');
    const s = window.__skyshift, n = s.grid.n, t = s.target;
    return s.seq.map((f) => {
      const [ra, dec] = propagate(t.ra, t.dec, t.pmra, t.pmdec, t.epoch, mjdToYear(f.mjd));
      const [x, y] = s.grid.wcs.worldToPix(ra, dec);
      let best = [0, 0], bv = -Infinity;
      for (let j = Math.round(y) - 4; j <= Math.round(y) + 4; j++)
        for (let i = Math.round(x) - 4; i <= Math.round(x) + 4; i++)
          if (f.data[j * n + i] > bv) { bv = f.data[j * n + i]; best = [i, j]; }
      return { dx: best[0] - x, dy: best[1] - y, sep: Math.hypot(best[0] - x, best[1] - y) };
    });
  });
  console.log('brightest pixel vs predicted position (px):', offsets.map((o) => o.sep.toFixed(2)).join(', '));
  await page.evaluate(() => document.getElementById('play').click());
  await page.screenshot({ path: `${shots}live-barnard.png`, fullPage: true });
  await page.check('#diff');
  await page.screenshot({ path: `${shots}live-barnard-diff.png`, fullPage: true });
  assert.ok(offsets.every((o) => o.sep <= 1.5), 'star sits on its predicted track');
  console.log('page errors:', errors);
  console.log('live OK');
} finally {
  await browser.close();
  server.kill();
}
