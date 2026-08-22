// Avatar showcase: captures the character models + gait for visual QA.
// Two clients start a match; the SEEKER (who sees the world during preparation)
// gets a client-side-only parade of avatars posed in front of the camera.
//
//   node tools/avatar-showcase.mjs   (server must be running on :8080)
//   -> docs/screenshots/avatars-lineup.png   (6 distinct looks, standing)
//   -> docs/screenshots/avatars-gait.png     (idle / walk / walk / run / jump)
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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.__errors = errors;
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  return page;
};

const A = await mkPage();
const B = await mkPage();
await A.fill('#input-name', 'ShowHost');
await A.click('#btn-create');
await A.waitForTimeout(900);
await B.fill('#input-name', 'ShowMate');
await B.fill('#input-code', (await A.textContent('#room-code')).trim());
await B.click('#btn-join');
await B.waitForTimeout(700);
await A.evaluate(() => {
  const set = (key, val) => {
    const el = document.querySelector(`#host-settings input[type="range"][data-key="${key}"]`);
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('minPlayers', 2);
  set('preparationSec', 30);
});
await B.click('#btn-ready');
await A.waitForTimeout(300);
await A.click('#btn-start');

const teamOf = (p) => p.evaluate(() => window.__debug.store.get().myTeam);
await Promise.all([
  A.waitForFunction(() => window.__debug.store.get().myTeam, null, { timeout: 10000 }),
  B.waitForFunction(() => window.__debug.store.get().myTeam, null, { timeout: 10000 }),
]);
const seeker = (await teamOf(A)) === 'SEEKERS' ? A : B;
// (seeker sees the world during PREPARATION — that's where we capture)
await seeker.waitForFunction(() => window.__debug.phase() === 'PREPARATION', null, { timeout: 10000 });
await sleep(800);

const SETUP = () => {
  const dbg = window.__debug;
  const c = dbg.controller;
  // hide the seeker "eyes closed" prep overlay for a clean capture
  document.getElementById('blindfold').classList.add('hidden');
  // freeze the camera where we want it (server ignores a frozen seeker's moves)
  c.onMove = null;
  c.applyCorrection = () => {};
  c.pos = [31.4, 0, 33.4]; c.yaw = Math.PI;
  c.camYaw = Math.PI; c.camPitch = 0.16; c.camDist = 6.4;

  // clear corridor between the pillar rows: x 28..32.5, z 31..35.5
  const mk = (i, x, z, team) => {
    const av = dbg.createAvatar({ id: 'showcase-' + i, name: 'Look ' + i, team, isBot: true });
    av.setPos(x, 0, z);
    av.setRot(0); // face -Z: toward the camera
    dbg.world.scene.add(av.group);
    return av;
  };
  // lineup: 6 distinct looks, standing (gait row added after shot 1)
  window.__lineup = [0, 1, 2, 3, 4, 5].map((i) => mk(i, 27.7 + i * 1.5, 35.0, i % 2 ? 'SEEKERS' : 'HIDERS'));
  window.__gait = [];
  window.__mkAv = mk;

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    document.getElementById('blindfold').classList.add('hidden');
    for (const av of window.__lineup) av.animate(dt, 0, true, 0);
    for (const e of window.__gait) {
      if (e.ground) e.av.animate(dt, e.speed, true, 0);
      else {
        const t = (now * 0.001) % 0.95;
        const air = t < 0.66;
        const vy = air ? 4.6 - 14 * t : 0;
        e.av.animate(dt, e.speed, !air, vy);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return 'setup-ok';
};

const result = await seeker.evaluate(SETUP);
if (result !== 'setup-ok') throw new Error('setup failed: ' + result);

await sleep(700);
await seeker.screenshot({ path: 'docs/screenshots/avatars-lineup.png' });

// close-up gait: drop the lineup, spawn the gait row, zoom in
await seeker.evaluate(() => {
  const dbg = window.__debug;
  for (const av of window.__lineup) av.dispose(dbg.world.scene);
  window.__lineup = [];
  const mk = window.__mkAv;
  window.__gait = [
    { av: mk(10, 27.9, 34.8, 'HIDERS'), speed: 0, ground: true },
    { av: mk(11, 29.3, 34.8, 'SEEKERS'), speed: 3.4, ground: true },
    { av: mk(12, 30.7, 34.8, 'HIDERS'), speed: 3.4, ground: true },
    { av: mk(13, 32.1, 34.8, 'SEEKERS'), speed: 5.8, ground: true },
    { av: mk(14, 33.5, 34.8, 'HIDERS'), speed: 2, ground: false },
  ];
  window.__gait[2].av.state.phase = Math.PI; // phase-shift the second walker
  const c = window.__debug.controller;
  c.pos = [30.7, 0, 32.0];
  c.camYaw = Math.PI; c.camPitch = 0.10; c.camDist = 3.0;
});
await sleep(500);
await seeker.screenshot({ path: 'docs/screenshots/avatars-gait.png' });

const errs = [...(seeker.__errors || []), ...(A.__errors || []), ...(B.__errors || [])];
await browser.close();
if (errs.length) {
  console.log('PAGE ERRORS:\n' + errs.join('\n'));
  process.exit(1);
}
console.log('showcase captured 📸 (no page errors)');
