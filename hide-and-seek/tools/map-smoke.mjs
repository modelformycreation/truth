// Smoke test: for each map in the registry, create a room on it, start a round
// (with a bot), and verify the client renders that map and spawns the player in
// a valid, unblocked position. Captures a screenshot per map.
//   node tools/map-smoke.mjs   (server must be running on :8080)
import * as pw from 'playwright-core';
import * as chromiumPkg from '@sparticuz/chromium';
import fs from 'fs';
import { MAPS } from '../shared/map.js';

const exe = await chromiumPkg.default.executablePath();
const browser = await pw.chromium.launch({
  executablePath: exe,
  args: [...chromiumPkg.default.args.filter((a) => a !== '--single-process' && a !== '--no-zygote'), '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr-libs/lib' },
});
fs.mkdirSync('docs/screenshots', { recursive: true });
let failures = 0;
const check = (name, ok, extra = '') => {
  if (!ok) { failures++; console.log(`  ✗ ${name} ${extra}`); }
  else console.log(`  ✓ ${name}${extra ? ' ' + extra : ''}`);
};

for (const id of Object.keys(MAPS)) {
  console.log(`\n=== MAP: ${id} ===`);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.fill('#input-name', 'MapTester');
  // choose this map
  await page.selectOption('#select-map', id);
  await page.click('#btn-create');
  await page.waitForTimeout(1000);
  // verify the room state carries the right map
  const roomMap = await page.evaluate(() => window.__debug.store.get().roomState?.mapId);
  check('room created on selected map', roomMap === id, `mapId=${roomMap}`);

  await page.evaluate(() => {
    const set = (k, v) => { const el = document.querySelector(`#host-settings input[type="range"][data-key="${k}"]`); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('minPlayers', 2); set('preparationSec', 4);
  });
  await page.click('#btn-add-bot');
  await page.waitForTimeout(400);
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 40000 });
  await page.waitForTimeout(1500);

  // the client world must be the selected map
  const worldMap = await page.evaluate(() => window.__debug.world?.map?.id);
  check('client renders the selected map', worldMap === id, `world.map.id=${worldMap}`);

  // player must be on a floor and not inside a collider (spawn sync worked)
  const spawnOk = await page.evaluate((mapId) => {
    const dbg = window.__debug;
    const c = dbg.controller;
    const map = dbg.world.map;
    const [x, y, z] = c.pos;
    // not inside any collider's body band
    for (const col of map.colliders) {
      if (x > col.min[0] - 0.1 && x < col.max[0] + 0.1 &&
          z > col.min[2] - 0.1 && z < col.max[2] + 0.1 &&
          col.max[1] > y + 0.36 && col.min[1] < y + 1.7) return { inside: true, x, y, z };
    }
    return { inside: false, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) };
  }, id);
  check('player spawned in a valid (non-colliding) position', !spawnOk.inside, JSON.stringify(spawnOk));

  await page.screenshot({ path: `docs/screenshots/map-${id}.png` });
  check('no page errors', errors.length === 0, errors[0] || '');
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL MAP SMOKE OK ✓' : `\nMAP SMOKE FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
