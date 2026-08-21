// Capture README screenshots: home, lobby, hider world view, seeker FIND moment.
import * as pw from 'playwright-core';
import * as chromiumPkg from '@sparticuz/chromium';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = await chromiumPkg.default.executablePath();
const browser = await pw.chromium.launch({
  executablePath: exe,
  args: [...chromiumPkg.default.args, '--no-sandbox'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr-libs/lib' },
});
fs.mkdirSync('docs/screenshots', { recursive: true });
const mkPage = async () => {
  const page = await (await browser.newContext({ viewport: { width: 420, height: 800 }, deviceScaleFactor: 2 })).newPage();
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  return page;
};

const A = await mkPage();
const B = await mkPage();

await A.fill('#input-name', 'Alice');
await A.click('#btn-create');
await A.waitForTimeout(1200);
await A.screenshot({ path: 'docs/screenshots/lobby.png' });

await B.fill('#input-name', 'Ben');
await B.fill('#input-code', (await A.textContent('#room-code')).trim());
await B.click('#btn-join');
await B.waitForTimeout(1000);
await A.evaluate(() => {
  const set = (key, val) => {
    const el = document.querySelector(`#host-settings input[type="range"][data-key="${key}"]`);
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('minPlayers', 2);
  set('preparationSec', 15);
});
await A.waitForTimeout(800);
await B.click('#btn-ready');
await B.waitForTimeout(500);
await A.click('#btn-start');

await A.waitForFunction(() => window.__debug && window.__debug.store.get().myTeam, null, { timeout: 10000 });
await B.waitForFunction(() => window.__debug && window.__debug.store.get().myTeam, null, { timeout: 10000 });
const [hider, seeker] = (await A.evaluate(() => window.__debug.store.get().myTeam)) === 'HIDERS' ? [A, B] : [B, A];

// hider view during preparation
await hider.waitForFunction(() => window.__debug.phase() === 'PREPARATION', null, { timeout: 10000 });
await hider.keyboard.down('s');
await hider.waitForTimeout(700);
await hider.keyboard.up('s');
await sleep(400);
await hider.screenshot({ path: 'docs/screenshots/hider-prep.png' });

// wait for active round, hider approaches, capture FIND glowing
await seeker.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 25000 });
await hider.waitForFunction(() => window.__debug.phase() === 'ACTIVE_ROUND', null, { timeout: 5000 });
let captured = false;
const deadline = Date.now() + 60000;
while (Date.now() < deadline && !captured) {
  const enabled = await seeker.evaluate(() => !document.getElementById('btn-find').disabled);
  if (enabled) {
    await seeker.screenshot({ path: 'docs/screenshots/seeker-find.png' });
    captured = true;
    break;
  }
  await hider.keyboard.down('s');
  await hider.waitForTimeout(380);
  await hider.keyboard.up('s');
  const hz = await hider.evaluate(() => window.__debug.controller.pos[2]);
  if (hz > 43) {
    await hider.keyboard.down('w');
    await hider.waitForTimeout(650);
    await hider.keyboard.up('w');
  }
}
if (captured) await seeker.click('#btn-find');
await seeker.waitForFunction(() => !document.getElementById('screen-results').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
await seeker.screenshot({ path: 'docs/screenshots/results.png' });
console.log('screenshots captured:', fs.readdirSync('docs/screenshots'));
await browser.close();
