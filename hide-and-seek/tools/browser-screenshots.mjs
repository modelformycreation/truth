// Capture README screenshots: lobby, hider world view, seeker FIND moment, results.
//
// The FIND/results shots need the hider within 2 m of the seeker with clear
// line of sight. Since round one the map has three floors and 210 hide spots,
// the hider's random spot may be on B1/RF — a blind keyboard approach can
// never reach the seeker from there. So: each attempt checks the hider's
// floor, and if the hider is on the ground floor we GLIDE them (plausible
// per-tick speed, server-accepted) to the open atrium, then a short hop right
// next to the seeker. Attempts with an off-floor hider simply start a fresh
// match.
import * as pw from 'playwright-core';
import * as chromiumPkg from '@sparticuz/chromium';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = await chromiumPkg.default.executablePath();
const browser = await pw.chromium.launch({
  executablePath: exe,
  args: [...chromiumPkg.default.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr-libs/lib' },
});
fs.mkdirSync('docs/screenshots', { recursive: true });
const mkPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  return page;
};
const closePages = (pages) => Promise.all(pages.filter(Boolean).map((p) => p.context().close().catch(() => {})));

// Move the local player to (x, z) at a plausible speed (0.3 m / 70 ms).
const glideTo = (page, x, z, timeoutMs = 20000) =>
  page.evaluate(async ({ x, z, timeoutMs }) => {
    const c = window.__debug.controller;
    const STEP = 0.3;
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const dx = x - c.pos[0], dz = z - c.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < 0.15) break;
      const k = Math.min(STEP, d) / d;
      c.pos[0] += dx * k;
      c.pos[2] += dz * k;
      await new Promise((r) => setTimeout(r, 70));
    }
  }, { x, z, timeoutMs });

const need = { find: true, results: true };

for (let attempt = 1; attempt <= 6 && (need.find || need.results); attempt++) {
  const A = await mkPage();
  const B = await mkPage();
  let ok = false;
  try {
    await A.fill('#input-name', 'Alice');
    await A.click('#btn-create');
    await A.waitForTimeout(1000);
    await B.fill('#input-name', 'Ben');
    await B.fill('#input-code', (await A.textContent('#room-code')).trim());
    await B.click('#btn-join');
    await B.waitForTimeout(900);
    if (attempt === 1) await A.screenshot({ path: 'docs/screenshots/lobby.png' });

    await A.evaluate(() => {
      const set = (key, val) => {
        const el = document.querySelector(`#host-settings input[type="range"][data-key="${key}"]`);
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('minPlayers', 2);
      set('preparationSec', 15);
    });
    await A.waitForTimeout(600);
    await B.click('#btn-ready');
    await B.waitForTimeout(400);
    await A.click('#btn-start');

    await A.waitForFunction(() => window.__debug && window.__debug.store.get().myTeam, null, { timeout: 10000 });
    await B.waitForFunction(() => window.__debug && window.__debug.store.get().myTeam, null, { timeout: 10000 });
    const [hider, seeker] = (await A.evaluate(() => window.__debug.store.get().myTeam)) === 'HIDERS' ? [A, B] : [B, A];

    if (attempt === 1) {
      // hider view during preparation (any floor makes a fine shot)
      await hider.waitForFunction(() => window.__debug.phase() === 'PREPARATION', null, { timeout: 10000 });
      await hider.keyboard.down('s');
      await hider.waitForTimeout(700);
      await hider.keyboard.up('s');
      await sleep(400);
      await hider.screenshot({ path: 'docs/screenshots/hider-prep.png' });
    }

    await seeker.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 25000 });
    await hider.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 5000 });
    await sleep(500);

    const hiderY = await hider.evaluate(() => window.__debug.controller.pos[1]);
    if (Math.abs(hiderY) <= 0.5) {
      // ground-floor hider: glide through the open atrium to the seeker
      const sp = await seeker.evaluate(() => window.__debug.controller.pos);
      await glideTo(hider, 31.5, 33.5);
      await glideTo(hider, sp[0] + 1.2, sp[2] + 0.8, 8000);
      const enabled = await seeker
        .waitForFunction(() => !document.getElementById('btn-find').disabled, null, { timeout: 25000 })
        .then(() => true).catch(() => false);
      if (enabled) {
        if (need.find) {
          await seeker.screenshot({ path: 'docs/screenshots/seeker-find.png' });
          need.find = false;
          await seeker.click('#btn-find');
        }
        const showed = await seeker
          .waitForFunction(() => !document.getElementById('screen-results').classList.contains('hidden'), null, { timeout: 20000 })
          .then(() => true).catch(() => false);
        if (need.results && showed) {
          await sleep(600);
          await seeker.screenshot({ path: 'docs/screenshots/results.png' });
          need.results = false;
        }
        ok = true;
      }
    } else {
      console.log(`attempt ${attempt}: hider on another floor (y=${hiderY.toFixed(1)}) — retrying`);
    }
  } catch (e) {
    console.log(`attempt ${attempt} failed: ${e.message}`);
  } finally {
    await closePages([A, B]);
  }
  if (ok) break;
}

await browser.close();
console.log('screenshots captured:', fs.readdirSync('docs/screenshots'));
if (need.find || need.results) {
  console.log('WARNING: still missing:', Object.keys(need).filter((k) => need[k]));
  process.exit(1);
}
