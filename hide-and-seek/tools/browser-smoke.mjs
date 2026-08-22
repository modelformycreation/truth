// Headless browser smoke test for the client (run with server on :8080).
// Uses the @sparticuz/chromium build + playwright-core.
import * as pw from 'playwright-core';
import * as chromiumPkg from '@sparticuz/chromium';

const URL = process.env.SMOKE_URL || 'http://localhost:8080/';
const exe = await chromiumPkg.default.executablePath();
const browser = await pw.chromium.launch({
  executablePath: exe,
  args: [...chromiumPkg.default.args, '--enable-unsafe-swiftshader', '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr-libs/lib' },
});
const ctx = await browser.newContext({
  viewport: { width: 420, height: 800 },
  permissions: [], // no mic in smoke test
  userAgent: 'smoke-test',
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 300)));

console.log('goto', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const homeVisible = await page.isVisible('#screen-home');
console.log('home visible:', homeVisible);

// fill name + create room
await page.fill('#input-name', 'SmokeTester');
await page.click('#btn-create');
await page.waitForTimeout(1500);
const lobbyVisible = await page.isVisible('#screen-lobby');
const code = await page.textContent('#room-code');
console.log('lobby visible:', lobbyVisible, 'code:', code);

// add a bot + set minPlayers 2, start a solo practice round
await page.click('#btn-add-bot');
await page.waitForTimeout(400);
// open host settings adjustments happen via inputs; directly set via page eval on the sliders
await page.evaluate(() => {
  const setVal = (key, val) => {
    const el = document.querySelector(`#host-settings input[type="range"][data-key="${key}"]`);
    if (!el) return;
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal('minPlayers', 2);
  setVal('preparationSec', 10);
});
await page.waitForTimeout(1200);
await page.click('#btn-start');
console.log('started round');
await page.waitForTimeout(2000);

// should now be in world phase (team assignment)
const hudVisible = await page.isVisible('#hud');
const canvasShown = await page.evaluate(() => document.getElementById('game-canvas').style.display);
console.log('hud visible:', hudVisible, 'canvas:', canvasShown);

await page.waitForTimeout(4000); // team assignment (6s) -> preparation
const blindfold = await page.isVisible('#blindfold');
const phase1 = await page.evaluate(() => window.__debugPhase ?? null).catch(() => null);
console.log('blindfold visible (if seeker):', blindfold);

// move around with keyboard
await page.keyboard.down('w');
await page.waitForTimeout(1200);
await page.keyboard.up('w');
await page.screenshot({ path: '/tmp/shot-game.png' });

const webglOk = await page.evaluate(() => {
  const c = document.createElement('canvas');
  return !!c.getContext('webgl2') || !!c.getContext('webgl');
});
console.log('webgl available:', webglOk);

// back to lobby via leave
await page.click('#btn-settings');
await page.waitForTimeout(300);
await page.click('#btn-leave-2');
await page.waitForTimeout(800);
const backHome = await page.isVisible('#screen-home');
console.log('back home:', backHome);

console.log('\nCONSOLE ERRORS:', errors.length === 0 ? 'none 🎉' : '');
errors.slice(0, 12).forEach((e) => console.log('  ✗', e));
await browser.close();
process.exit(errors.length ? 1 : 0);
