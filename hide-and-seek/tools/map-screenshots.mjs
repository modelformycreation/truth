// Captures one in-world screenshot per map (docs/screenshots/map-<id>.png) so
// the README can show the three different map "worlds".
//   node tools/map-screenshots.mjs   (server must be running on :8080)
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

for (const mapId of ['facility', 'docks', 'mall']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__debug, null, { timeout: 20000 });
  await page.fill('#input-name', 'Scout');
  await page.selectOption('#select-map', mapId);
  await page.click('#btn-create');
  await page.waitForFunction(() => !document.getElementById('screen-lobby').classList.contains('hidden'), null, { timeout: 15000 });
  await page.evaluate(() => {
    const set = (k, v) => {
      const el = document.querySelector(`#host-settings input[type="range"][data-key="${k}"]`);
      if (el) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    set('minPlayers', 2);
    set('preparationSec', 10);
  });
  await page.click('#btn-add-bot');
  await sleep(400);
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 45000 });
  await sleep(1500);
  // frame each map on its most characteristic view
  const framing = {
    facility: { pos: [31.5, 0, 33.5], yaw: Math.PI },  // into the atrium
    docks: { pos: [27, 0, 29.5], yaw: 0 },             // warehouse bays + yard
    mall: { pos: [22, 0, 18], yaw: 0 },                // atrium + north shops
  }[mapId];
  await page.evaluate(({ pos, yaw }) => {
    const c = window.__debug.controller;
    c.pos = [...pos];
    c.camYaw = yaw;
    c.camPitch = 0.10;
  }, framing);
  await sleep(900);
  await page.screenshot({ path: `docs/screenshots/map-${mapId}.png` });
  console.log(`${mapId}: captured${errors.length ? ' — ERRORS: ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log('done');
