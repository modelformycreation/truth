// ============================================================================
// tools/browser-e2e.mjs — REAL two-browser end-to-end match:
//   A creates a room → B joins with the code → both ready → host starts →
//   teams assigned → preparation (seeker blindfolded) → active round →
//   hider walks to seeker → FIND enables within catch radius → catch →
//   found state syncs to both → results.
// Run with the server on :8080.
// ============================================================================
import * as pw from 'playwright-core';
import * as chromiumPkg from '@sparticuz/chromium';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.env.SMOKE_URL || 'http://localhost:8080/';

const exe = await chromiumPkg.default.executablePath();
const browser = await pw.chromium.launch({
  executablePath: exe,
  args: [...chromiumPkg.default.args, '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr-libs/lib' },
});
const errors = [];
const mkPage = async (name) => {
  const page = await (await browser.newContext({ viewport: { width: 420, height: 800 } })).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text().slice(0, 200)}`); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  page._name = name;
  return page;
};

const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗ FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) process.exitCode = 1;
};

try {
  const A = await mkPage('Ann');
  const B = await mkPage('Bob');

  // create + join by code
  await A.fill('#input-name', 'Ann');
  await A.click('#btn-create');
  await A.waitForTimeout(1200);
  const code = (await A.textContent('#room-code')).trim();
  check('room created with code', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);

  await B.fill('#input-name', 'Bob');
  await B.fill('#input-code', code);
  await B.click('#btn-join');
  await B.waitForTimeout(1200);
  const bPlayers = await B.evaluate(() => document.querySelectorAll('.player-row').length);
  check('Bob joined the lobby', bPlayers === 2, `${bPlayers} players listed`);

  // host configures a quick round
  await A.evaluate(() => {
    const set = (key, val) => {
      const el = document.querySelector(`#host-settings input[type="range"][data-key="${key}"]`);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('minPlayers', 2);
    set('preparationSec', 8);
    set('roundSec', 90);
  });
  await A.waitForTimeout(900);
  await B.click('#btn-ready'); // Bob readies
  await B.waitForTimeout(600);
  const startEnabled = await A.evaluate(() => !document.getElementById('btn-start').disabled);
  check('START enabled once everyone ready', startEnabled);

  await A.click('#btn-start');

  // wait for team assignment -> both know their team
  await A.waitForFunction(() => window.__debug && window.__debug.store.get().myTeam, null, { timeout: 10000 });
  await B.waitForFunction(() => window.__debug && window.__debug.store.get().myTeam, null, { timeout: 10000 });
  const teamA = await A.evaluate(() => window.__debug.store.get().myTeam);
  const teamB = await B.evaluate(() => window.__debug.store.get().myTeam);
  check('teams assigned and opposed', teamA !== teamB, `${teamA} vs ${teamB}`);

  const seeker = teamA === 'SEEKERS' ? A : B;
  const hider = teamA === 'SEEKERS' ? B : A;
  const seekerName = seeker._name, hiderName = hider._name;

  // preparation: seeker blindfolded, hider free
  await seeker.waitForFunction(() => window.__debug.phase() === 'PREPARATION', null, { timeout: 10000 });
  await hider.waitForFunction(() => window.__debug.phase() === 'PREPARATION', null, { timeout: 10000 });
  const blindfoldShown = await seeker.evaluate(() => !document.getElementById('blindfold').classList.contains('hidden'));
  const hiderBlindfold = await hider.evaluate(() => !document.getElementById('blindfold').classList.contains('hidden'));
  check('seeker blindfolded during preparation', blindfoldShown);
  check('hider NOT blindfolded', !hiderBlindfold);

  // both worlds render
  await hider.waitForTimeout(800);
  const renderOk = await Promise.all([A, B].map((p) => p.evaluate(() => {
    const c = document.getElementById('game-canvas');
    return c.style.display === 'block' && c.width > 0;
  })));
  check('both 3D worlds active', renderOk.every(Boolean));

  // hider walks during preparation while seeker waits
  await hider.keyboard.down('s');
  await hider.waitForTimeout(1800);
  await hider.keyboard.up('s');
  const hiderMoved = await hider.evaluate(() => {
    const c = window.__debug.controller;
    return Math.hypot(c.pos[0] - 31.5, c.pos[2] - 33.5) > 2;
  });
  check('hider moved around the map', hiderMoved);

  // active round
  await seeker.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 20000 });
  await hider.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 20000 });
  check('ACTIVE_ROUND reached on both clients', true);

  const findVisible = await seeker.evaluate(() => document.getElementById('btn-find').style.display !== 'none');
  check('FIND button visible for seeker', findVisible);

  // hider walks to the seeker; poll FIND enabled; catch!
  let catchDone = false;
  const deadline = Date.now() + 70000;
  while (Date.now() < deadline && !catchDone) {
    const enabled = await seeker.evaluate(() => !document.getElementById('btn-find').disabled);
    if (enabled) {
      await seeker.click('#btn-find');
      catchDone = true;
      break;
    }
    // hider creeps toward the seeker's vestibule
    await hider.keyboard.down('s');
    await hider.waitForTimeout(400);
    await hider.keyboard.up('s');
    // nudge back north if overshot far past the entrance
    const hz = await hider.evaluate(() => window.__debug.controller.pos[2]);
    if (hz > 43) {
      await hider.keyboard.down('w');
      await hider.waitForTimeout(700);
      await hider.keyboard.up('w');
    }
  }
  check('FIND became enabled in range and was pressed', catchDone);

  await seeker.waitForTimeout(1000);
  const hiderFoundOnSeeker = await seeker.evaluate(() => {
    const snap = window.__debug.snapshot();
    const me = window.__debug.store.get().selfId;
    const other = (snap?.pl ?? []).find((p) => p.i !== me);
    return other?.s === 'found';
  });
  const hiderSeesFound = await hider.evaluate(() => {
    const flash = document.getElementById('caught-flash');
    return window.__debug.store.get().myStatus === 'found' || !flash.classList.contains('hidden');
  });
  check('found state visible on seeker client', hiderFoundOnSeeker);
  check('hider client knows it was found', hiderSeesFound);

  // results screen (round ends when the only hider is found)
  await seeker.waitForFunction(() => !document.getElementById('screen-results').classList.contains('hidden'), null, { timeout: 15000 });
  const resultTitle = await seeker.textContent('#results-title');
  check('results screen shows SEEKERS WIN', resultTitle.includes('SEEKERS WIN'), resultTitle.trim());
  await hider.waitForFunction(() => !document.getElementById('screen-results').classList.contains('hidden'), null, { timeout: 15000 });
  check('results on hider client too', true);

  console.log(`\nconsole errors: ${errors.length === 0 ? 'none 🎉' : errors.length}`);
  errors.slice(0, 10).forEach((e) => console.log('  ✗', e));
} finally {
  await browser.close();
}
process.exit(process.exitCode || (errors.length ? 1 : 0));
