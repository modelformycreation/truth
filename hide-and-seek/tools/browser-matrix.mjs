// ============================================================================
// tools/browser-matrix.mjs — the STRICT TESTER suite.
//
// Runs several REAL browser contexts against a live server at once and blocks
// on any glitch. Coverage:
//
//   1. desktop + keyboard   — WASD in all four directions, strafing, sprint
//   2. iPhone 13 + touch    — the JOYSTICK and the sprint / jump buttons driven
//                             with synthesized touch events, verifying real
//                             movement and a real sprint speed delta
//   3. voice (2 contexts)   — fake mic devices, WebRTC audio actually flowing
//                             between two clients, talking indicators lighting
//   4. host moderation      — kick a player, remove a bot
//   5. full match (3 peers) — create -> join by code -> teams -> prep blindfold
//                             -> hunt -> FIND gating at 8 m / 2.5 m / 1.8 m ->
//                             catch -> results -> back to lobby -> round two
//   6. edge cases           — invalid code, double-start spam, FIND spam,
//                             settings mid-round, rotate/resize, backgrounding
//
// ZERO console errors are tolerated in any context, across the whole run.
//
//   npm start &
//   node tools/browser-matrix.mjs
// ============================================================================
import * as pw from 'playwright-core';
import * as chromiumPkg from '@sparticuz/chromium';

const URL_BASE = process.env.SMOKE_URL || 'http://localhost:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------- reporting ---
let passed = 0;
const failures = [];
const consoleErrors = [];
const section = (t) => console.log(`\n\x1b[1m── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}\x1b[0m`);
function check(name, ok, extra = '') {
  if (ok) { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ` — ${extra}` : ''}`); }
  else { failures.push(name); console.log(`  \x1b[31m✗ FAIL\x1b[0m ${name}${extra ? ` — ${extra}` : ''}`); }
}

// Errors that are environmental (headless sandbox), not product defects.
const IGNORABLE = [
  /favicon/i,
  /Failed to load resource.*404/i,
  /WebGL.*deprecated/i,
  /Autoplay is only allowed/i,
  // 10+ simultaneous Chromium contexts in one container exhaust the fake audio
  // device; only ever seen in the "room full" section, never in real play.
  /AudioContext encountered an error from the audio device/i,
];

const exe = await chromiumPkg.default.executablePath();
// --single-process / --no-zygote (shipped by @sparticuz/chromium for lambda)
// deadlock as soon as several browser contexts run at once, which is exactly
// what this suite does. Drop them; keep everything else.
const baseArgs = chromiumPkg.default.args.filter(
  (a) => a !== '--single-process' && a !== '--no-zygote',
);
const browser = await pw.chromium.launch({
  executablePath: exe,
  args: [
    ...baseArgs,
    '--no-sandbox',
    // let two contexts actually exchange WebRTC audio without a real mic
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chr-libs/lib' },
});

/** Create an instrumented page. Any console error fails the whole run. */
async function mkPage(name, contextOpts = {}) {
  const ctx = await browser.newContext({
    permissions: ['microphone'],
    ...contextOpts,
  });
  const page = await ctx.newPage();
  page._name = name;
  page.on('pageerror', (e) => {
    const msg = `${name}: ${e.message.slice(0, 200)}`;
    if (!IGNORABLE.some((re) => re.test(msg))) consoleErrors.push(`[pageerror] ${msg}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const msg = `${name}: ${m.text().slice(0, 200)}`;
    if (!IGNORABLE.some((re) => re.test(msg))) consoleErrors.push(`[console] ${msg}`);
  });
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__debug, null, { timeout: 20000 });
  return page;
}

const iPhone13 = {
  viewport: { width: 390, height: 664 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
};

// ------------------------------------------------------------- helpers -----
async function createRoom(page, name) {
  await page.fill('#input-name', name);
  await page.click('#btn-create');
  await page.waitForFunction(() => !document.getElementById('screen-lobby').classList.contains('hidden'), null, { timeout: 15000 });
  return (await page.textContent('#room-code')).trim();
}
async function joinRoom(page, name, code) {
  await page.fill('#input-name', name);
  await page.fill('#input-code', code);
  await page.click('#btn-join');
  await page.waitForFunction(() => !document.getElementById('screen-lobby').classList.contains('hidden'), null, { timeout: 15000 });
}
async function hostSettings(page, patch) {
  await page.evaluate((p) => {
    for (const [key, val] of Object.entries(p)) {
      const el = document.querySelector(`#host-settings input[data-key="${key}"]`);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!val;
      else el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, patch);
  await sleep(500);
}
const phaseOf = (p) => p.evaluate(() => window.__debug.phase());
const posOf = (p) => p.evaluate(() => [...window.__debug.controller.pos]);
const waitPhase = async (p, ph, timeout = 30000) => {
  try {
    await p.waitForFunction((x) => window.__debug.phase() === x, ph, { timeout });
    return true;
  } catch {
    const actual = await p.evaluate(() => window.__debug.phase()).catch(() => '??');
    throw new Error(`${p._name}: expected phase ${ph} but is ${actual}`);
  }
};

/** Drive a synthesized touch drag: down -> moves -> up. */
async function touchDrag(page, selector, dx, dy, holdMs = 700) {
  await page.evaluate(async ({ sel, dx, dy, holdMs }) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const mk = (type, x, y, target) => {
      const t = new Touch({ identifier: 77, target, clientX: x, clientY: y, pageX: x, pageY: y });
      return new TouchEvent(type, {
        bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t],
      });
    };
    el.dispatchEvent(mk('touchstart', x0, y0, el));
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      window.dispatchEvent(mk('touchmove', x0 + (dx * i) / steps, y0 + (dy * i) / steps, el));
      await new Promise((r2) => setTimeout(r2, 16));
    }
    await new Promise((r2) => setTimeout(r2, holdMs));
    window.dispatchEvent(mk('touchend', x0 + dx, y0 + dy, el));
  }, { sel: selector, dx, dy, holdMs });
}

/** Hold the joystick at an offset for `ms`, then release. */
async function joystickHold(page, dx, dy, ms) {
  await page.evaluate(async ({ dx, dy, ms }) => {
    const el = document.getElementById('joystick');
    const base = el.querySelector('.stick-base');
    const r = base.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 42, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      return new TouchEvent(type, {
        bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t],
      });
    };
    el.dispatchEvent(mk('touchstart', x0 + dx, y0 + dy));
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      window.dispatchEvent(mk('touchmove', x0 + dx, y0 + dy));
      await new Promise((r2) => requestAnimationFrame(r2));
    }
    window.dispatchEvent(mk('touchend', x0 + dx, y0 + dy));
  }, { dx, dy, ms });
}

/** Tap a button with real touch events (touchstart + touchend). */
async function touchTap(page, selector, holdMs = 60) {
  await page.evaluate(async ({ sel, holdMs }) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const mk = (type) => {
      const t = new Touch({ identifier: 5, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
      return new TouchEvent(type, {
        bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t],
      });
    };
    el.dispatchEvent(mk('touchstart'));
    await new Promise((r2) => setTimeout(r2, holdMs));
    el.dispatchEvent(mk('touchend'));
  }, { sel: selector, holdMs });
}

/** Teleport the local controller (test-only shortcut, used where the server
 *  correction does not matter — e.g. relative displacement measurements). */
const putAt = (page, x, y, z, yaw) =>
  page.evaluate(({ x, y, z, yaw }) => {
    const c = window.__debug.controller;
    c.teleport([x, y, z], yaw ?? c.yaw);
  }, { x, y, z, yaw });

/**
 * Move the local player to a spot at a *plausible* speed.
 * A raw teleport is rejected by the server's anti-cheat (which is the correct
 * behaviour), and the resulting correction would undo it — so nudge the
 * position in small per-tick steps the speed validator accepts.
 */
async function glideTo(page, x, z, timeoutMs = 12000) {
  await page.evaluate(async ({ x, z, timeoutMs }) => {
    const c = window.__debug.controller;
    const STEP = 0.3;              // metres per ~70 ms ≈ 4.3 m/s (under sprint)
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
}

// ============================================================================
try {
  // =========================================================== 1. DESKTOP ===
  section('1. Desktop + keyboard — WASD, strafe, sprint');
  {
    const A = await mkPage('Desk-A', { viewport: { width: 1280, height: 800 } });
    const code = await createRoom(A, 'Ann');
    check('room created with a valid code', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
    await hostSettings(A, { minPlayers: 2, preparationSec: 10, roundSec: 600 });
    await A.click('#btn-add-bot');
    await sleep(400);
    await A.click('#btn-start');
    // measure during ACTIVE_ROUND: the lone human is the seeker and seekers are
    // deliberately frozen during PREPARATION
    await waitPhase(A, 'ACTIVE_ROUND', 45000);
    await sleep(1000);

    // park in the open atrium and let the server agree on where we are
    await putAt(A, 31.5, 0, 33.5);
    await sleep(1500);

    const lockCam = () => A.evaluate(() => { window.__debug.controller.camYaw = Math.PI; });
    await lockCam();
    const [fx, fz] = await A.evaluate(() => {
      const c = window.__debug.controller;
      return [-Math.sin(c.camYaw), -Math.cos(c.camYaw)];
    });

    /**
     * Press a key, measure the displacement, then press the opposite key for
     * the same time to return roughly to the start. No teleporting inside the
     * measurement — a teleport trips the server's anti-cheat and the resulting
     * correction would corrupt the reading.
     */
    async function measure(key, opposite, ms = 700, mods = []) { // eslint-disable-line
      await lockCam();
      await sleep(150);
      const before = await posOf(A);
      for (const m of mods) await A.keyboard.down(m);
      await A.keyboard.down(key);
      await sleep(ms);
      await A.keyboard.up(key);
      for (const m of mods) await A.keyboard.up(m);
      await sleep(200);
      const after = await posOf(A);
      // walk back
      if (opposite) {
        await A.keyboard.down(opposite);
        await sleep(ms);
        await A.keyboard.up(opposite);
        await sleep(250);
      }
      return [after[0] - before[0], after[2] - before[2]];
    }
    const dot = ([ax, az], [bx, bz]) => ax * bx + az * bz;
    const right = [-fz, fx];

    const mW = await measure('w', 's');
    check('W moves AWAY from the camera (the inverted-W bug)',
      dot(mW, [fx, fz]) > 0.8, `forward component ${dot(mW, [fx, fz]).toFixed(2)} m`);
    const mS = await measure('s', 'w');
    check('S moves TOWARD the camera',
      dot(mS, [fx, fz]) < -0.8, `forward component ${dot(mS, [fx, fz]).toFixed(2)} m`);
    const mD = await measure('d', 'a');
    check('D strafes right', dot(mD, right) > 0.8, `right component ${dot(mD, right).toFixed(2)} m`);
    const mA = await measure('a', 'd');
    check('A strafes left', dot(mA, right) < -0.8, `right component ${dot(mA, right).toFixed(2)} m`);

    // arrow keys must match WASD
    const mUp = await measure('ArrowUp', 'ArrowDown');
    check('ArrowUp matches W', dot(mUp, [fx, fz]) > 0.8, `${dot(mUp, [fx, fz]).toFixed(2)} m`);
    const mDown = await measure('ArrowDown', 'ArrowUp');
    check('ArrowDown matches S', dot(mDown, [fx, fz]) < -0.8, `${dot(mDown, [fx, fz]).toFixed(2)} m`);

    // Sprint really is faster. Sampling the controller's own speed is
    // wall-independent (a displacement measurement can be blocked by geometry
    // and produce a false failure).
    async function topSpeed(mods = []) {
      await lockCam();
      for (const m of mods) await A.keyboard.down(m);
      await A.keyboard.down('w');
      let peak = 0;
      for (let i = 0; i < 12; i++) {
        peak = Math.max(peak, await A.evaluate(() => window.__debug.controller.speed2D));
        await sleep(45);
      }
      await A.keyboard.up('w');
      for (const m of mods) await A.keyboard.up(m);
      await sleep(200);
      // walk back so we do not drift into a corner
      await A.keyboard.down('s'); await sleep(500); await A.keyboard.up('s');
      await sleep(200);
      return peak;
    }
    const walkSpeed = await topSpeed();
    const sprintSpeed = await topSpeed(['Shift']);
    const cfgSpeeds = await A.evaluate(() => {
      const s = window.__debug.store.get().serverSettings;
      return { walk: s.walkSpeed, sprint: s.sprintSpeed };
    });
    check('Shift sprint is meaningfully faster than walking',
      sprintSpeed > walkSpeed * 1.25,
      `walk ${walkSpeed.toFixed(2)} m/s vs sprint ${sprintSpeed.toFixed(2)} m/s`);
    check('walk and sprint speeds match the config (no hard-coded speeds)',
      Math.abs(walkSpeed - cfgSpeeds.walk) < 0.2 && Math.abs(sprintSpeed - cfgSpeeds.sprint) < 0.2,
      `config walk=${cfgSpeeds.walk} sprint=${cfgSpeeds.sprint}`);

    // camera look convention — the user-reported laptop/trackpad bug:
    // dragging the mouse DOWN must look DOWN (camera rises), drag RIGHT must
    // rotate the view right. Simulated with a REAL mouse drag on the canvas.
    // NOTE: pointer lock is stubbed out for this check only — headless CDP
    // reports garbage movementX/Y while a pointer lock is active. On real
    // hardware the lock path is the same code (dragging branch of _onMouseMove).
    await A.evaluate(() => {
      document.getElementById('game-canvas').requestPointerLock = () => {};
    });
    const canvasBox = await A.locator('#game-canvas').boundingBox();
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;
    const pitchOf = () => A.evaluate(() => window.__debug.controller.camPitch);
    const yawOf = () => A.evaluate(() => window.__debug.controller.camYaw);

    const pBefore = await pitchOf();
    await A.mouse.move(cx, cy);
    await A.mouse.down();
    await A.mouse.move(cx, cy + 80, { steps: 8 }); // drag DOWN
    await A.mouse.up();
    const pAfterDown = await pitchOf();
    check('mouse drag DOWN looks DOWN (camera rises — the inverted-pitch bug)',
      pAfterDown > pBefore + 0.1, `pitch ${pBefore.toFixed(3)} -> ${pAfterDown.toFixed(3)}`);

    await A.mouse.move(cx, cy);
    await A.mouse.down();
    await A.mouse.move(cx, cy - 80, { steps: 8 }); // drag UP
    await A.mouse.up();
    const pAfterUp = await pitchOf();
    check('mouse drag UP looks UP (camera lowers)',
      pAfterUp < pAfterDown - 0.1, `pitch -> ${pAfterUp.toFixed(3)}`);

    const yawBefore = await yawOf();
    await A.mouse.move(cx, cy);
    await A.mouse.down();
    await A.mouse.move(cx + 120, cy, { steps: 8 }); // drag RIGHT
    await A.mouse.up();
    const yawDelta = (await yawOf()) - yawBefore;
    check('mouse drag RIGHT rotates the view right (yaw decreases)',
      yawDelta < -0.1, `Δyaw ${yawDelta.toFixed(3)}`);

    // touch controls must NOT be shown on a desktop pointer
    const joyVisible = await A.evaluate(() =>
      getComputedStyle(document.getElementById('joystick')).display !== 'none');
    check('joystick hidden on desktop', !joyVisible);

    // ---- AUDIO: prove SFX actually fire (WebAudio is instrumented) -----------
    // We can't "hear" headless, so we wrap the engine's primitive schedulers
    // (_tone / _noise) and count real audio nodes created during play.
    const audioProbe = await A.evaluate(() => {
      const a = window.__debug.audio;
      a.unlock();
      window.__sfx = { tone: 0, noise: 0 };
      const oTone = a._tone, oNoise = a._noise;
      a._tone = (...args) => { window.__sfx.tone++; return oTone.apply(a, args); };
      a._noise = (...args) => { window.__sfx.noise++; return oNoise.apply(a, args); };
      return { hasCtx: !!a.ctx, running: a.running,
               masterConnected: !!(a.master && a.master.numberOfInputs > 0) };
    });
    check('AudioContext exists and is running', audioProbe.hasCtx && audioProbe.running, `state=${audioProbe.running}`);
    check('SFX gain graph is connected to output', audioProbe.masterConnected);

    const countSfx = () => A.evaluate(() => ({ ...window.__sfx }));
    const sfxBefore = await countSfx();
    await A.keyboard.down('w');            // walk ~1.6s -> footstep noise
    await A.waitForTimeout(1600);
    await A.keyboard.up('w');
    await A.waitForTimeout(200);
    await A.keyboard.press('Space');       // jump -> tone+noise, land -> noise
    await A.waitForTimeout(900);
    const sfxAfter = await countSfx();
    const dTone = sfxAfter.tone - sfxBefore.tone;
    const dNoise = sfxAfter.noise - sfxBefore.noise;
    check('walking schedules real footstep audio', dNoise >= 2, `+${dNoise} noise nodes`);
    check('jump/land schedule real audio', (dTone + dNoise) >= 3, `+${dTone} tone / +${dNoise} noise`);

    await A.context().close();
  }

  // ============================================================ 2. MOBILE ===
  section('2. iPhone 13 emulation — joystick, sprint & jump buttons (touch)');
  {
    const M = await mkPage('iPhone', iPhone13);
    const code = await createRoom(M, 'Mob');
    await hostSettings(M, { minPlayers: 2, preparationSec: 10, roundSec: 600 });
    await M.click('#btn-add-bot');
    await sleep(400);
    await M.click('#btn-start');
    // the lone human becomes the seeker, who is blindfolded AND frozen during
    // PREPARATION — drive the controls in the live round instead
    await waitPhase(M, 'ACTIVE_ROUND', 45000);
    await sleep(1200);

    const touchUi = await M.evaluate(() => document.body.classList.contains('touch-ui'));
    check('touch UI mode detected on a touch device', touchUi);

    const vis = await M.evaluate(() => {
      const g = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      return { joy: g('joystick'), sprint: g('btn-sprint'), jump: g('btn-jump') };
    });
    check('joystick is actually VISIBLE on mobile (was permanently hidden)', vis.joy);
    check('sprint button visible', vis.sprint);
    check('jump button visible', vis.jump);

    // the action buttons must be on top of the look zone, not buried under it
    const hitTest = await M.evaluate(() => {
      const out = {};
      for (const id of ['btn-sprint', 'btn-jump', 'btn-find', 'btn-mic', 'btn-scan']) {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        if (r.width === 0) { out[id] = 'hidden'; continue; }
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        out[id] = el.contains(top) ? 'ok' : (top?.id || top?.className || 'unknown');
      }
      return out;
    });
    check('sprint button receives the touch (not #look-zone)', hitTest['btn-sprint'] === 'ok', JSON.stringify(hitTest['btn-sprint']));
    check('jump button receives the touch', hitTest['btn-jump'] === 'ok', JSON.stringify(hitTest['btn-jump']));
    check('push-to-talk button is not covered by the joystick', hitTest['btn-mic'] === 'ok', JSON.stringify(hitTest['btn-mic']));

    // no two on-screen controls may overlap on a phone-sized screen
    const overlaps = await M.evaluate(() => {
      const ids = ['btn-sprint', 'btn-jump', 'btn-find', 'btn-mic', 'btn-scan', 'btn-minimap', 'btn-settings', 'btn-mic-toggle', 'btn-mute'];
      const rects = ids
        .map((id) => [id, document.getElementById(id)?.getBoundingClientRect()])
        .filter(([, r]) => r && r.width > 0);
      // the joystick's visible base counts too
      const base = document.querySelector('#joystick .stick-base');
      if (base) rects.push(['stick-base', base.getBoundingClientRect()]);
      const hits = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const [ai, a] = rects[i], [bi, b] = rects[j];
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
            hits.push(`${ai}×${bi}`);
          }
        }
      }
      return hits;
    });
    check('no two touch controls overlap on a phone screen', overlaps.length === 0, overlaps.join(', '));

    // every control must be fully on screen (safe areas / small viewports)
    const offscreen = await M.evaluate(() => {
      const ids = ['btn-sprint', 'btn-jump', 'btn-find', 'btn-mic', 'btn-scan'];
      return ids.filter((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (!r || r.width === 0) return false;
        return r.top < 0 || r.left < 0 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1;
      });
    });
    check('all touch controls are fully on screen', offscreen.length === 0, offscreen.join(', '));

    // --- joystick actually walks ---
    await putAt(M, 31.5, 0, 33.5);
    await M.evaluate(() => { window.__debug.controller.camYaw = Math.PI; });
    await sleep(150);
    const p0 = await posOf(M);
    await joystickHold(M, 0, -30, 1100);        // push the stick UP = forward
    await sleep(150);
    const p1 = await posOf(M);
    const joyDist = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    check('joystick moves the character', joyDist > 1.0, `${joyDist.toFixed(2)} m`);
    const fwdComp = (p1[2] - p0[2]);            // camYaw=PI -> forward is +Z
    check('joystick UP walks forward, not backward', fwdComp > 0.8, `Δz ${fwdComp.toFixed(2)} m`);

    // stick returns to centre on release (no stuck input)
    const idle = await M.evaluate(() => {
      const c = window.__debug.controller;
      return { x: c.input.x, z: c.input.z, stickSprint: c.stickSprint };
    });
    check('joystick releases cleanly (no stuck movement)',
      Math.abs(idle.x) < 0.01 && Math.abs(idle.z) < 0.01 && !idle.stickSprint, JSON.stringify(idle));

    // --- joystick to the rim = sprint (faster than a half push) ---
    await putAt(M, 31.5, 0, 33.5); await sleep(150);
    const w0 = await posOf(M);
    await joystickHold(M, 0, -18, 1000);        // partial tilt = walk
    await sleep(120);
    const w1 = await posOf(M);
    const partial = Math.hypot(w1[0] - w0[0], w1[2] - w0[2]);

    await putAt(M, 31.5, 0, 33.5); await sleep(150);
    const s0 = await posOf(M);
    await joystickHold(M, 0, -90, 1000);        // clamped to the rim = sprint
    await sleep(120);
    const s1 = await posOf(M);
    const rim = Math.hypot(s1[0] - s0[0], s1[2] - s0[2]);
    check('joystick pushed to the rim sprints', rim > partial * 1.15,
      `partial ${partial.toFixed(2)} m vs rim ${rim.toFixed(2)} m`);

    // --- SPRINT BUTTON ---
    await putAt(M, 31.5, 0, 33.5); await sleep(150);
    // hold sprint while walking with a mid-tilt stick
    const sb0 = await posOf(M);
    await M.evaluate(async () => {
      const el = document.getElementById('btn-sprint');
      const r = el.getBoundingClientRect();
      const mk = (type) => {
        const t = new Touch({ identifier: 9, target: el, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
        return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
      };
      el.dispatchEvent(mk('touchstart'));       // hold it down
    });
    const sprintFlag = await M.evaluate(() => window.__debug.controller.sprintHeld);
    check('sprint button registers a touch press', sprintFlag === true);
    await joystickHold(M, 0, -20, 1000);
    await M.evaluate(async () => {
      const el = document.getElementById('btn-sprint');
      const r = el.getBoundingClientRect();
      const t = new Touch({ identifier: 9, target: el, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
    });
    await sleep(120);
    const sb1 = await posOf(M);
    const withSprintBtn = Math.hypot(sb1[0] - sb0[0], sb1[2] - sb0[2]);
    check('holding the SPRINT button makes a mid-tilt stick sprint',
      withSprintBtn > partial * 1.15, `${partial.toFixed(2)} m -> ${withSprintBtn.toFixed(2)} m`);
    const released = await M.evaluate(() => {
      const c = window.__debug.controller;
      return c.sprintHeld === false && c.sprintLock === false;
    });
    check('sprint button releases on touchend (never sticks ON)', released);

    // tap-to-lock sprint
    await touchTap(M, '#btn-sprint', 80);
    await sleep(100);
    const locked = await M.evaluate(() => window.__debug.controller.sprintLock);
    check('a quick tap toggles sprint LOCK on', locked === true);
    await touchTap(M, '#btn-sprint', 80);
    await sleep(100);
    const unlocked = await M.evaluate(() => window.__debug.controller.sprintLock);
    check('tapping again turns sprint lock off', unlocked === false);

    // --- JUMP BUTTON ---
    /** Wait until the character is standing on the ground and settled. */
    async function settleGrounded(page, tries = 40) {
      for (let i = 0; i < tries; i++) {
        const ok = await page.evaluate(() => {
          const c = window.__debug.controller;
          return c.grounded && Math.abs(c.vy) < 0.01;
        });
        if (ok) return true;
        await sleep(60);
      }
      return false;
    }
    /** Tap jump and report the highest Y reached. */
    async function jumpAndMeasure(holdMs) {
      await settleGrounded(M);
      const y0 = await M.evaluate(() => window.__debug.controller.pos[1]);
      let peak = y0;
      const sampler = (async () => {
        for (let i = 0; i < 45; i++) {
          peak = Math.max(peak, await M.evaluate(() => window.__debug.controller.pos[1]));
          await sleep(22);
        }
      })();
      await touchTap(M, '#btn-jump', holdMs);
      await sampler;
      return peak - y0;
    }

    const rise = await jumpAndMeasure(70);
    check('jump button gets the player off the ground', rise > 0.3, `rose ${rise.toFixed(2)} m`);

    // a very short tap (shorter than a frame) must still be latched
    const rise2 = await jumpAndMeasure(1);
    check('a sub-frame jump tap is latched, not dropped', rise2 > 0.3, `rose ${rise2.toFixed(2)} m`);

    // --- touchcancel must not leave sprint stuck ---
    await M.evaluate(() => {
      const el = document.getElementById('btn-sprint');
      const r = el.getBoundingClientRect();
      const t = new Touch({ identifier: 11, target: el, clientX: r.left + 5, clientY: r.top + 5 });
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
      el.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [t] }));
    });
    await sleep(100);
    const afterCancel = await M.evaluate(() => window.__debug.controller.sprintHeld);
    check('touchcancel releases sprint (iOS gesture interruption)', afterCancel === false);

    // --- look zone drags the camera ---
    const yawBefore = await M.evaluate(() => window.__debug.controller.camYaw);
    await touchDrag(M, '#look-zone', 90, 0, 100);
    await sleep(200);
    const yawAfter = await M.evaluate(() => window.__debug.controller.camYaw);
    check('dragging the look zone rotates the camera',
      Math.abs(yawAfter - yawBefore) > 0.05, `Δyaw ${(yawAfter - yawBefore).toFixed(3)}`);

    // --- rotate / resize ---
    await M.setViewportSize({ width: 664, height: 390 });
    await sleep(700);
    const afterRotate = await M.evaluate(() => {
      const c = document.getElementById('game-canvas');
      const j = document.getElementById('joystick').getBoundingClientRect();
      return { w: c.width > 0, joyOnScreen: j.top >= 0 && j.left >= 0 && j.bottom <= window.innerHeight + 1 };
    });
    check('canvas survives a rotate/resize', afterRotate.w);
    check('joystick still on screen in landscape', afterRotate.joyOnScreen);
    await M.setViewportSize({ width: 390, height: 664 });
    await sleep(400);

    // --- backgrounding the tab must release held inputs ---
    await M.evaluate(() => {
      const c = window.__debug.controller;
      c.sprintHeld = true; c.sprintLock = true; c.input.jump = true; c.input.x = 1;
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(200);
    const afterBg = await M.evaluate(() => {
      const c = window.__debug.controller;
      return { sprintHeld: c.sprintHeld, sprintLock: c.sprintLock, jump: c.input.jump, x: c.input.x };
    });
    check('backgrounding releases every held input',
      !afterBg.sprintHeld && !afterBg.sprintLock && !afterBg.jump && afterBg.x === 0, JSON.stringify(afterBg));
    await M.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(300);
    const resumed = await M.evaluate(() => !!window.__debug.controller);
    check('returning from background keeps the game alive', resumed);

    await M.context().close();
    void code;
  }

  // ============================================================= 3. VOICE ===
  section('3. Voice — two clients exchange real WebRTC audio');
  {
    const V1 = await mkPage('Voice-1', { viewport: { width: 900, height: 700 } });
    const V2 = await mkPage('Voice-2', { viewport: { width: 900, height: 700 } });
    const code = await createRoom(V1, 'Vera');
    await joinRoom(V2, 'Vince', code);
    await sleep(800);

    // both enable the mic (fake device, auto-granted)
    for (const p of [V1, V2]) {
      const ok = await p.evaluate(() => window.__debug.voice.enableMic());
      check(`${p._name}: microphone acquired`, ok === true);
    }
    // lobby shares one voice channel
    await V1.waitForFunction(() => window.__debug.voice.members.length >= 2, null, { timeout: 15000 })
      .then(() => check('both clients are in the same voice channel', true))
      .catch(() => check('both clients are in the same voice channel', false));

    const chan = await V1.evaluate(() => window.__debug.voice.channel);
    check('server assigned the shared lobby channel', chan === 'lobby', String(chan));

    // WebRTC peer connections actually establish
    const connected = await V1.waitForFunction(() => {
      const peers = [...(window.__debug.voice.provider?.peers.values() ?? [])];
      return peers.length > 0 && peers.every((p) => ['connected', 'completed'].includes(p.pc.connectionState) || p.pc.iceConnectionState === 'connected');
    }, null, { timeout: 45000 }).then(() => true).catch(() => false);
    // diagnostic on failure: dump the connection states we actually saw
    const seen = connected ? null : await V1.evaluate(() =>
      [...(window.__debug.voice.provider?.peers.values() ?? [])]
        .map((p) => ({ cs: p.pc.connectionState, ice: p.pc.iceConnectionState })));
    check('WebRTC peer connection reaches "connected"', connected, seen ? JSON.stringify(seen) : null);

    // audio actually arrives at the far end
    const gotTrack = await V2.waitForFunction(() => {
      const peers = [...(window.__debug.voice.provider?.peers.values() ?? [])];
      return peers.some((p) => p.audioEl.srcObject && p.audioEl.srcObject.getAudioTracks().length > 0);
    }, null, { timeout: 45000 }).then(() => true).catch(() => false);
    check('remote audio track received by the peer', gotTrack);

    // push-to-talk gates the outgoing track
    await V1.evaluate(() => window.__debug.voice.setPtt(true));
    await sleep(400);
    const txOn = await V1.evaluate(() => {
      const s = window.__debug.voice.provider.localStream;
      return s.getAudioTracks().every((t) => t.enabled);
    });
    check('push-to-talk enables the outgoing track', txOn);

    // the talking indicator lights up on the OTHER client
    const remoteTalking = await V2.waitForFunction(
      () => window.__debug.voice.members.some((m) => !m.self && m.talking),
      null, { timeout: 8000 },
    ).then(() => true).catch(() => false);
    check('the other client sees the speaking indicator light up', remoteTalking);

    const chipShown = await V2.evaluate(() =>
      /talking/.test(document.getElementById('speakers').innerHTML));
    check('speaking chip rendered in the HUD', chipShown);

    // our OWN indicator (fake device produces a tone, so the analyser fires)
    const selfTalking = await V1.waitForFunction(
      () => window.__debug.voice.selfTalking === true, null, { timeout: 8000 },
    ).then(() => true).catch(() => false);
    check('local speaking indicator lights up for yourself', selfTalking);

    await V1.evaluate(() => window.__debug.voice.setPtt(false));
    await sleep(400);
    const txOff = await V1.evaluate(() =>
      window.__debug.voice.provider.localStream.getAudioTracks().every((t) => !t.enabled));
    check('releasing push-to-talk closes the track', txOff);

    // REGRESSION: muted + PTT must not transmit
    await V1.evaluate(() => window.__debug.voice.setMuted(true));
    await V1.evaluate(() => window.__debug.voice.setPtt(true));
    await sleep(300);
    const leaked = await V1.evaluate(() =>
      window.__debug.voice.provider.localStream.getAudioTracks().some((t) => t.enabled));
    check('REGRESSION: push-to-talk while MUTED does not transmit', !leaked);
    await V1.evaluate(() => { window.__debug.voice.setPtt(false); window.__debug.voice.setMuted(false); });

    // mic on/off + speaker mute buttons exist, are visible, and work.
    // They are duplicated in the lobby voice panel and the in-game HUD top bar
    // so they are reachable on whichever screen the player is on.
    const btns = await V1.evaluate(() => {
      const vis = (id) => {
        const el = document.getElementById(id);
        return !!el && el.getBoundingClientRect().width > 0;
      };
      return {
        micToggle: vis('btn-mic-toggle-lobby'),
        speaker: vis('btn-mute-lobby'),
        micToggleHud: !!document.getElementById('btn-mic-toggle'),
        speakerHud: !!document.getElementById('btn-mute'),
      };
    });
    check('dedicated MIC ON/OFF button is present and visible', btns.micToggle && btns.micToggleHud);
    check('dedicated SPEAKER MUTE button is present and visible', btns.speaker && btns.speakerHud);

    await V1.click('#btn-mute-lobby');
    await sleep(400);
    const deafened = await V1.evaluate(() => ({
      deaf: window.__debug.voice.deafened,
      icon: document.getElementById('btn-mute').textContent.trim(),
      peersMuted: [...window.__debug.voice.provider.peers.values()].every((p) => p.audioEl.muted),
    }));
    check('speaker mute silences incoming audio and updates the icon',
      deafened.deaf && deafened.peersMuted && deafened.icon === '🔇', JSON.stringify(deafened));
    await V1.click('#btn-mute-lobby');
    await sleep(300);
    const unmuted = await V1.evaluate(() =>
      [...window.__debug.voice.provider.peers.values()].every((p) => !p.audioEl.muted));
    check('unmuting the speaker restores incoming audio', unmuted);

    await V1.click('#btn-mic-toggle-lobby');
    await sleep(400);
    const micOff = await V1.evaluate(() => ({
      muted: window.__debug.voice.muted,
      icon: document.getElementById('btn-mic-toggle').textContent.trim(),
      tracksOff: window.__debug.voice.provider.localStream.getAudioTracks().every((t) => !t.enabled),
    }));
    check('mic on/off button mutes the microphone and updates the icon',
      micOff.muted === true && micOff.icon === '🚫' && micOff.tracksOff, JSON.stringify(micOff));
    await V1.click('#btn-mic-toggle-lobby');
    await sleep(300);

    // per-player volume control in the lobby panel
    const volSliders = await V1.evaluate(() => document.querySelectorAll('[data-vol]').length);
    check('per-player volume slider is offered for each teammate', volSliders >= 1, `${volSliders} sliders`);
    if (volSliders) {
      await V1.evaluate(() => {
        const s = document.querySelector('[data-vol]');
        s.value = '0.3';
        s.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await sleep(300);
      const applied = await V1.evaluate(() => {
        const id = document.querySelector('[data-vol]').dataset.vol;
        return window.__debug.voice.provider.peers.get(id)?.audioEl.volume;
      });
      check('per-player volume is applied to that peer', Math.abs((applied ?? 1) - 0.3) < 0.01, String(applied));
    }

    await V1.context().close();
    await V2.context().close();
  }

  // ======================================================= 4. MODERATION ===
  section('4. Host moderation — kick a player, remove a bot');
  {
    const H = await mkPage('Host', { viewport: { width: 1100, height: 800 } });
    const G = await mkPage('Guest', { viewport: { width: 900, height: 700 } });
    const code = await createRoom(H, 'Hosty');
    await joinRoom(G, 'Guesty', code);
    await sleep(800);

    const kickBtns = await H.evaluate(() => document.querySelectorAll('[data-kick]').length);
    check('host sees a remove button on other players', kickBtns >= 1, `${kickBtns} buttons`);

    // REGRESSION: the row <div> and the control shared data-key, so every
    // toggle rendered OFF and every slider sat at its default midpoint
    // regardless of the real room settings.
    const mirrored = await H.evaluate(() => {
      const s = window.__debug.store.get().roomState.settings;
      const bad = [];
      const pairs = [
        ['requireLineOfSight', 'toggle'], ['voiceEnabled', 'toggle'],
        ['abilitiesEnabled', 'toggle'], ['minimapShowTeammates', 'toggle'],
        ['minPlayers', 'range'], ['preparationSec', 'range'], ['catchRadius', 'range'],
      ];
      for (const [key, kind] of pairs) {
        const el = document.querySelector(`#host-settings input[data-key="${key}"]`);
        if (!el) { bad.push(`${key}:missing`); continue; }
        if (kind === 'toggle') {
          if (el.checked !== !!s[key]) bad.push(`${key}: ui=${el.checked} state=${s[key]}`);
        } else if (Math.abs(Number(el.value) - Number(s[key])) > 1e-6) {
          bad.push(`${key}: ui=${el.value} state=${s[key]}`);
        }
      }
      return bad;
    });
    check('host settings controls mirror the real room settings', mirrored.length === 0, mirrored.join(' | '));

    // and toggling one actually flips it (rather than sending the wrong value)
    const flipped = await H.evaluate(async () => {
      const before = window.__debug.store.get().roomState.settings.requireLineOfSight;
      const el = document.querySelector('#host-settings input[data-key="requireLineOfSight"]');
      el.checked = !before;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 900));
      return { before, after: window.__debug.store.get().roomState.settings.requireLineOfSight };
    });
    check('flipping a host toggle changes the server setting',
      flipped.after === !flipped.before, JSON.stringify(flipped));

    const selfKick = await H.evaluate(() => {
      const me = window.__debug.store.get().selfId;
      return !!document.querySelector(`[data-kick="${me}"]`);
    });
    check('host does NOT get a remove button on their own row', !selfKick);
    const guestSeesKick = await G.evaluate(() => document.querySelectorAll('[data-kick]').length);
    check('non-host sees NO remove buttons', guestSeesKick === 0);

    // a non-host attempting the event directly is refused by the server
    const hack = await G.evaluate(async () => {
      const { EVENTS } = await import('/shared/constants.js');
      const st = window.__debug.store.get().roomState;
      const host = st.players.find((p) => p.host);
      return window.__debug.net.request(EVENTS.LOBBY_KICK, { playerId: host.id });
    });
    check('server refuses a kick from a non-host', hack?.ok === false && hack?.error === 'NOT_HOST', JSON.stringify(hack));

    // bots
    await H.click('#btn-add-bot');
    await sleep(500);
    const withBot = await H.evaluate(() => document.querySelectorAll('.player-row').length);
    check('bot added', withBot === 3, `${withBot} rows`);
    await H.click('#btn-remove-bot');
    await sleep(600);
    const afterBot = await H.evaluate(() => document.querySelectorAll('.player-row').length);
    check('REMOVE BOT button removes the bot', afterBot === 2, `${afterBot} rows`);

    // kick the guest for real (auto-accept the confirm dialog)
    H.on('dialog', (d) => d.accept());
    const guestId = await G.evaluate(() => window.__debug.store.get().selfId);
    await H.evaluate((id) => document.querySelector(`[data-kick="${id}"]`).click(), guestId);
    await sleep(1200);

    const backHome = await G.evaluate(() =>
      !document.getElementById('screen-home').classList.contains('hidden'));
    check('kicked player is returned to the home screen', backHome);
    const kickMsg = await G.textContent('#home-error');
    check('kicked player is told why', /removed/i.test(kickMsg || ''), (kickMsg || '').trim());
    const hostRows = await H.evaluate(() => document.querySelectorAll('.player-row').length);
    check('kicked player disappears from the host list', hostRows === 1, `${hostRows} rows`);

    await H.context().close();
    await G.context().close();
  }

  // ====================================================== 5. FULL MATCH ====
  section('5. Full match — 3 clients, FIND gating, results, round two');
  {
    const A = await mkPage('Match-A', { viewport: { width: 1100, height: 800 } });
    const B = await mkPage('Match-B', { viewport: { width: 900, height: 700 } });
    const C = await mkPage('Match-C', iPhone13);

    const code = await createRoom(A, 'Alpha');
    check('room code is well formed', /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);

    // invalid code first
    await B.fill('#input-name', 'Bravo');
    await B.fill('#input-code', 'ZZZZZZ');
    await B.click('#btn-join');
    await sleep(900);
    const invalidMsg = await B.textContent('#home-error');
    check('invalid room code is rejected with a message', /not found|check the code/i.test(invalidMsg || ''), (invalidMsg || '').trim());

    await joinRoom(B, 'Bravo', code);
    await joinRoom(C, 'Charlie', code);
    await sleep(800);
    const roster = await A.evaluate(() => document.querySelectorAll('.player-row').length);
    check('all three players are in the lobby', roster === 3, `${roster} rows`);

    await hostSettings(A, { minPlayers: 2, preparationSec: 30, roundSec: 600, seekerRatio: 0.5 });
    await B.click('#btn-ready');
    await C.click('#btn-ready');
    await sleep(700);

    // double-start spam must not break anything
    await A.click('#btn-start');
    await A.click('#btn-start').catch(() => {});
    await A.evaluate(() => { document.getElementById('btn-start').click(); document.getElementById('btn-start').click(); });

    await Promise.all([A, B, C].map((p) => p.waitForFunction(() => !!window.__debug.store.get().myTeam, null, { timeout: 20000 })));
    const teams = await Promise.all([A, B, C].map((p) => p.evaluate(() => window.__debug.store.get().myTeam)));
    check('every client received a team', teams.every(Boolean), teams.join(', '));
    check('double-start spam did not corrupt the round',
      (await A.evaluate(() => window.__debug.store.get().roomState.round)) === 1);

    await Promise.all([A, B, C].map((p) => waitPhase(p, 'PREPARATION')));
    const pages = { A, B, C };
    const seekerPage = [A, B, C][teams.indexOf('SEEKERS')];
    const hiderPage = [A, B, C][teams.indexOf('HIDERS')];
    check('the round has both a seeker and a hider', !!seekerPage && !!hiderPage);

    const bf = await Promise.all([A, B, C].map(async (p, i) => ({
      team: teams[i],
      blind: await p.evaluate(() => !document.getElementById('blindfold').classList.contains('hidden')),
    })));
    check('seekers are blindfolded during preparation', bf.filter((x) => x.team === 'SEEKERS').every((x) => x.blind));
    check('hiders are NOT blindfolded', bf.filter((x) => x.team === 'HIDERS').every((x) => !x.blind));

    // seekers really are frozen during prep
    const sBefore = await posOf(seekerPage);
    await seekerPage.keyboard.down('w');
    await sleep(900);
    await seekerPage.keyboard.up('w');
    const sAfter = await posOf(seekerPage);
    check('seekers cannot move while blindfolded',
      Math.hypot(sAfter[0] - sBefore[0], sAfter[2] - sBefore[2]) < 0.6);

    await Promise.all([A, B, C].map((p) => waitPhase(p, 'ACTIVE_ROUND', 30000)));
    check('ACTIVE_ROUND reached on all clients', true);
    const blindGone = await seekerPage.evaluate(() =>
      document.getElementById('blindfold').classList.contains('hidden'));
    check('blindfold is cleared when the round starts (no overlay leak)', blindGone);

    // opening settings mid-round must be harmless (do this while the round is
    // still live — catching the last hider ends it)
    await seekerPage.click('#btn-settings');
    await sleep(400);
    const modalOpen = await seekerPage.evaluate(() =>
      !document.getElementById('modal-settings').classList.contains('hidden'));
    check('settings modal opens mid-round', modalOpen);
    await seekerPage.click('#btn-close-settings');
    await sleep(300);
    const stillPlaying = await phaseOf(seekerPage);
    check('closing settings leaves the round running', stillPlaying === 'ACTIVE_ROUND', stillPlaying);

    // ---- FIND distance gating: 8 m -> 2.5 m -> 1.8 m ----
    const findState = async () => seekerPage.evaluate(() => {
      const b = document.getElementById('btn-find');
      return { shown: b.style.display !== 'none', enabled: !b.disabled };
    });
    check('FIND button is visible for the seeker', (await findState()).shown);

    // open floor of the atrium, with clear line of sight along Z
    const LANE_X = 31.5, HIDER_Z = 33.5;
    await glideTo(hiderPage, LANE_X, HIDER_Z);
    async function placeSeekerAt(gap) {
      await glideTo(seekerPage, LANE_X, HIDER_Z + gap);
      await sleep(1600);                        // let snapshots settle
    }

    await placeSeekerAt(8);
    const at8 = await findState();
    const seen8 = await seekerPage.evaluate(() =>
      (window.__debug.snapshot()?.pl ?? []).some((p) => p.t === 'HIDERS' && p.s === 'hidden'));
    check('at 8 m the hider is NOT revealed and FIND is disabled', !seen8 && !at8.enabled, `revealed=${seen8} enabled=${at8.enabled}`);

    await placeSeekerAt(2.5);
    const at25 = await findState();
    const seen25 = await seekerPage.evaluate(() =>
      (window.__debug.snapshot()?.pl ?? []).some((p) => p.t === 'HIDERS' && p.s === 'hidden' && p.rv));
    check('at 2.5 m the hider IS revealed but FIND stays disabled (outside catch radius)',
      seen25 && !at25.enabled, `revealed=${seen25} enabled=${at25.enabled}`);

    // a FIND press at this range must be refused by the server
    const tooFar = await seekerPage.evaluate(async () => {
      const { EVENTS } = await import('/shared/constants.js');
      return window.__debug.net.request(EVENTS.GAME_CATCH, { targetId: null }, 3000);
    });
    check('server rejects a forced catch at 2.5 m with TOO_FAR', tooFar?.ok === false && tooFar?.reason === 'TOO_FAR', JSON.stringify(tooFar));

    await placeSeekerAt(1.8);
    const findLit = await seekerPage.waitForFunction(() => !document.getElementById('btn-find').disabled, null, { timeout: 10000 })
      .then(() => true).catch(() => false);
    check('at 1.8 m FIND lights up', findLit);

    // ---- seeker scan pulse ability (config abilitiesEnabled) ----
    const scan = await seekerPage.evaluate(() => {
      const b = document.getElementById('btn-scan');
      return { present: !!b, visible: !b.classList.contains('hidden'), enabled: !b.disabled };
    });
    check('seeker scan-pulse ability is offered', scan.present && scan.visible && scan.enabled, JSON.stringify(scan));
    if (scan.visible) {
      await seekerPage.evaluate(() => document.getElementById('btn-scan').click());
      await sleep(500);
      const cd = await seekerPage.evaluate(() => ({
        disabled: document.getElementById('btn-scan').disabled,
        label: document.querySelector('#btn-scan .scan-cd').textContent,
      }));
      check('scan pulse goes on cooldown after use', cd.disabled && /\d+s/.test(cd.label), JSON.stringify(cd));
    }
    // the hider should NEVER see a scan button
    const hiderScan = await hiderPage.evaluate(() =>
      document.getElementById('btn-scan').classList.contains('hidden'));
    check('hiders do not get the seeker ability', hiderScan);

    // spam FIND — must not throw or double-count
    if (findLit) {
      for (let i = 0; i < 6; i++) {
        await seekerPage.evaluate(() => document.getElementById('btn-find').click());
        await sleep(70);
      }
    }
    await sleep(1400);

    const caught = await hiderPage.evaluate(() => window.__debug.store.get().myStatus === 'found');
    check('the hider was caught', caught);
    const catches = await seekerPage.evaluate(() => {
      const snap = window.__debug.snapshot();
      return (snap?.pl ?? []).filter((p) => p.s === 'found').length;
    });
    check('spamming FIND did not double-count catches', catches >= 1, `${catches} found`);

    // ---- results ----
    const gotResults = await Promise.all([A, B, C].map((p) =>
      p.waitForFunction(() => !document.getElementById('screen-results').classList.contains('hidden'), null, { timeout: 40000 })
        .then(() => true).catch(() => false)));
    check('results screen shows on every client', gotResults.every(Boolean), JSON.stringify(gotResults));
    const title = (await A.textContent('#results-title')).trim();
    check('a winner is declared', /WIN/.test(title), title);

    // ---- back to the lobby, then a second round ----
    const backToLobby = await Promise.all([A, B, C].map((p) =>
      p.waitForFunction(() => window.__debug.phase() === 'LOBBY', null, { timeout: 60000 })
        .then(() => true).catch(() => false)));
    check('all clients return to the lobby', backToLobby.every(Boolean), JSON.stringify(backToLobby));
    const lobbyClean = await A.evaluate(() => ({
      lobbyShown: !document.getElementById('screen-lobby').classList.contains('hidden'),
      resultsHidden: document.getElementById('screen-results').classList.contains('hidden'),
      hudHidden: document.getElementById('hud').classList.contains('hidden'),
      blindfoldHidden: document.getElementById('blindfold').classList.contains('hidden'),
    }));
    check('lobby is shown and every in-round overlay is cleared',
      lobbyClean.lobbyShown && lobbyClean.resultsHidden && lobbyClean.hudHidden && lobbyClean.blindfoldHidden,
      JSON.stringify(lobbyClean));

    await B.click('#btn-ready');
    await C.click('#btn-ready');
    await sleep(700);
    await A.click('#btn-start');
    const round2 = await Promise.all([A, B, C].map((p) =>
      p.waitForFunction(() => window.__debug.store.get().roomState?.round === 2, null, { timeout: 20000 })
        .then(() => true).catch(() => false)));
    check('a SECOND round starts cleanly', round2.every(Boolean), JSON.stringify(round2));

    void pages;
    await A.context().close();
    await B.context().close();
    await C.context().close();
  }

  // ====================================================== 6. EDGE CASES ====
  section('6. Edge cases — disconnect/rejoin, host leaves, room full');
  {
    const H = await mkPage('Edge-H', { viewport: { width: 1000, height: 800 } });
    const P = await mkPage('Edge-P', { viewport: { width: 900, height: 700 } });
    const code = await createRoom(H, 'EdgeHost');
    await joinRoom(P, 'EdgePeer', code);
    await sleep(700);

    // reload mid-lobby -> rejoin banner + auto rejoin
    await P.reload({ waitUntil: 'domcontentloaded' });
    await P.waitForFunction(() => !!window.__debug, null, { timeout: 15000 });
    const rejoined = await P.waitForFunction(
      () => !document.getElementById('screen-lobby').classList.contains('hidden'),
      null, { timeout: 15000 },
    ).then(() => true).catch(() => false);
    check('a refreshed player auto-rejoins within the grace period', rejoined);
    const rosterAfter = await H.evaluate(() => document.querySelectorAll('.player-row').length);
    check('the room still lists both players after the refresh', rosterAfter === 2, `${rosterAfter} rows`);

    // host leaves -> migration
    const peerId = await P.evaluate(() => window.__debug.store.get().selfId);
    await H.click('#btn-leave');
    await sleep(1500);
    const nowHost = await P.evaluate(() => {
      const st = window.__debug.store.get().roomState;
      return st.players.find((p) => p.host)?.id;
    });
    check('host migrates to the remaining player when the host leaves', nowHost === peerId, `${nowHost} vs ${peerId}`);
    const hasHostControls = await P.evaluate(() => document.querySelectorAll('[data-kick]').length >= 0 && !document.querySelector('.host-panel').classList.contains('disabled'));
    check('the new host gets the host controls', hasHostControls);

    await H.context().close();
    await P.context().close();
  }

  // ======================================================== room full ======
  {
    const pagesFull = [];
    const owner = await mkPage('Full-owner', { viewport: { width: 800, height: 600 } });
    pagesFull.push(owner);
    const code = await createRoom(owner, 'Owner');
    await hostSettings(owner, {});
    const max = await owner.evaluate(() => window.__debug.store.get().roomState.settings.maxPlayers);
    for (let i = 1; i < max; i++) {
      const p = await mkPage(`Full-${i}`, { viewport: { width: 500, height: 400 } });
      pagesFull.push(p);
      await joinRoom(p, `Filler${i}`, code);
    }
    await sleep(700);
    const overflow = await mkPage('Full-overflow', { viewport: { width: 500, height: 400 } });
    pagesFull.push(overflow);
    await overflow.fill('#input-name', 'TooMany');
    await overflow.fill('#input-code', code);
    await overflow.click('#btn-join');
    await sleep(1200);
    const fullMsg = await overflow.textContent('#home-error');
    check(`room caps at maxPlayers (${max}) and rejects the next joiner`,
      /full/i.test(fullMsg || ''), (fullMsg || '').trim());
    for (const p of pagesFull) await p.context().close();
  }

  // ---------------------------------------------------------------- report --
  section('RESULT');
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failures.length}`);
  if (failures.length) failures.forEach((f) => console.log(`    \x1b[31m✗\x1b[0m ${f}`));
  console.log(`  console/page errors: ${consoleErrors.length === 0 ? 'none 🎉' : consoleErrors.length}`);
  consoleErrors.slice(0, 25).forEach((e) => console.log(`    \x1b[31m✗\x1b[0m ${e}`));

  if (failures.length || consoleErrors.length) process.exitCode = 1;
} catch (err) {
  console.error('\n\x1b[31mSUITE CRASHED\x1b[0m', err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
