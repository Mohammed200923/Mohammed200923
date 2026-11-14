// End-to-end smoke test on simulated data: node tests/e2e.mjs
// Starts server.py, loads Barnard's Star, checks frames render, the mover follows
// its predicted track, photometry works, and saves screenshots to tests/screenshots/.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = new URL('..', import.meta.url).pathname;
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const port = 8765;
const server = spawn('python3', ['server.py', '--port', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  // Aladin Lite's own background fetches (usage logger, survey mirrors) are not ours to fix.
  page.on('pageerror', (e) => { if (!String(e.stack).includes('aladin-lite')) errors.push(e.message); });
  await page.goto(`http://127.0.0.1:${port}/?src=sim&q=${encodeURIComponent("Barnard's Star")}&size=6`);
  await page.waitForFunction(() => window.__skyshift?.seq?.length > 0, null, { timeout: 60000 });

  const info = await page.evaluate(() => {
    const s = window.__skyshift;
    return { frames: s.frames.length, seq: s.seq.length, n: s.grid.n, status: document.getElementById('status').textContent };
  });
  console.log(info);
  assert.equal(info.frames, 56);
  assert.equal(info.seq, 4, 'one stacked frame per survey visit');
  assert.match(info.status, /SIMULATED/);

  // The simulated brown-dwarf mover must sit on the predicted track in every visit.
  const offsets = await page.evaluate(async () => {
    const { propagate, mjdToYear } = await import('./js/wcs.js');
    const s = window.__skyshift, n = s.grid.n, t = s.target;
    return s.seq.map((f) => {
      const [ra, dec] = propagate(t.ra, t.dec, t.pmra, t.pmdec, t.epoch, mjdToYear(f.mjd));
      const [x, y] = s.grid.wcs.worldToPix(ra, dec);
      let best = [0, 0], bv = -Infinity;
      for (let j = Math.round(y) - 3; j <= Math.round(y) + 3; j++)
        for (let i = Math.round(x) - 3; i <= Math.round(x) + 3; i++)
          if (f.data[j * n + i] > bv) { bv = f.data[j * n + i]; best = [i, j]; }
      return Math.hypot(best[0] - x, best[1] - y);
    });
  });
  console.log('mover offset from prediction (px):', offsets.map((o) => o.toFixed(2)).join(', '));
  assert.ok(offsets.every((o) => o <= 1.5));

  await page.screenshot({ path: `${shots}app.png`, fullPage: true });

  // Click on the mover → photometry follows the predicted motion.
  const box = await page.locator('#view').boundingBox();
  const pos = await page.evaluate(async () => {
    const { propagate, mjdToYear } = await import('./js/wcs.js');
    const s = window.__skyshift, n = s.grid.n, t = s.target, f = s.seq[s.idx];
    const [ra, dec] = propagate(t.ra, t.dec, t.pmra, t.pmdec, t.epoch, mjdToYear(f.mjd));
    const [x, y] = s.grid.wcs.worldToPix(ra, dec);
    return { fx: (x + 0.5) / n, fy: (n - 1 - y + 0.5) / n };
  });
  await page.evaluate(() => document.getElementById('play').click()); // pause
  await page.mouse.click(box.x + pos.fx * box.width, box.y + pos.fy * box.height);
  const pick = await page.evaluate(() => ({ follow: window.__skyshift.pick.follow, m: window.__skyshift.measurements.length }));
  console.log('pick:', pick);
  assert.ok(pick.follow, 'click on target follows its track');
  assert.ok(pick.m > 40);

  await page.check('#diff');
  await page.screenshot({ path: `${shots}difference.png`, fullPage: true });

  // Every-exposure mode exposes the fast asteroid in visit 3.
  await page.selectOption('#mode', 'exposure');
  assert.equal(await page.evaluate(() => window.__skyshift.seq.length), 56);

  // Mobile layout: no horizontal scroll.
  await page.setViewportSize({ width: 390, height: 900 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
  await page.screenshot({ path: `${shots}mobile.png`, fullPage: false });

  // Embed mode hides the chrome.
  await page.goto(`http://127.0.0.1:${port}/?src=sim&q=R%20Draconis&embed=1`);
  await page.waitForFunction(() => window.__skyshift?.seq?.length > 0, null, { timeout: 60000 });
  assert.equal(await page.isVisible('.controls'), false);

  assert.deepEqual(errors, []);
  console.log('e2e OK');
} finally {
  await browser.close();
  server.kill();
}
