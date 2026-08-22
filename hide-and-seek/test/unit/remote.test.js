// ============================================================================
// Regression tests for the remote-player pipeline (client/js/remote.js).
//
// Two unit-bugs lived here and both were invisible in code review:
//   * footstep speed divided metres by MILLISECONDS, so `speed` was 1000x too
//     small and never crossed the 0.5 m/s gate — OTHER PLAYERS' FOOTSTEPS
//     NEVER PLAYED.
//   * INTERP_DELAY was 0.12 (meant as 120 ms) compared against millisecond
//     timestamps, so remote players were never actually interpolated.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIM, STATUS, TEAMS } from '../../shared/constants.js';

// --- minimal three.js + avatar stand-ins ------------------------------------
class FakeScene { constructor() { this.children = []; } add(o) { this.children.push(o); } remove(o) { this.children = this.children.filter((c) => c !== o); } }

globalThis.__avatars = [];
const avatarModule = {
  createAvatar({ id, name, team }) {
    const a = {
      id, name, group: {},
      state: { team },
      pos: [0, 0, 0], rot: 0, found: false, revealed: false, talking: false,
      setPos(x, y, z) { this.pos = [x, y, z]; },
      setRot(r) { this.rot = r; },
      setFound() { this.found = true; },
      setRevealed(v) { this.revealed = v; },
      setTalking(v) { this.talking = v; },
      setEffect(v) { this.effect = v; },
      ping() { this.pinged = true; },
      animate() {},
      dispose() { this.disposed = true; },
    };
    globalThis.__avatars.push(a);
    return a;
  },
};

// Load remote.js with its browser-only imports stubbed. Both imports are
// replaced with globals so the module has no relative specifiers left and can
// be evaluated straight from a data: URL.
const { RemotePlayers } = await (async () => {
  const { readFileSync } = await import('node:fs');
  globalThis.__avatarModule = avatarModule;
  globalThis.__constants = { STATUS, ANIM };
  const src = readFileSync(new URL('../../client/js/remote.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", '')
    .replace("import { createAvatar } from './avatar.js';",
      'const { createAvatar } = globalThis.__avatarModule;')
    .replace("import { STATUS, ANIM } from '../../shared/constants.js';",
      'const { STATUS, ANIM } = globalThis.__constants;');
  const url = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
  return import(url);
})();

const dto = (over = {}) => ({
  i: 'p2', n: 'Bob', t: TEAMS.HIDERS, s: STATUS.HIDDEN,
  p: [0, 0, 0], r: 0, a: ANIM.WALK, ...over,
});

function mk() {
  const rp = new RemotePlayers(new FakeScene());
  rp.selfId = 'p1';
  const steps = [];
  rp.onFootstep = (pos, running, id, team) => steps.push({ pos, running, id, team });
  return { rp, steps };
}

test('REGRESSION: a walking remote player produces footsteps', () => {
  const { rp, steps } = mk();
  let t = 1000;
  rp.applySnapshot([dto({ p: [0, 0, 0] })], t, t);      // first sample: no delta yet
  assert.equal(steps.length, 0, 'the very first snapshot must not fake a step');
  // 0.25 m in 66 ms == 3.8 m/s — a clear walk
  t += 66;
  rp.applySnapshot([dto({ p: [0, 0, 0.25] })], t, t);
  assert.equal(steps.length, 1, 'a walking remote player must emit a footstep');
  assert.equal(steps[0].running, false);
  assert.equal(steps[0].id, 'p2', 'the source id is needed for per-player throttling');
  assert.equal(steps[0].team, TEAMS.HIDERS, 'the team selects the footstep flavour');
});

test('a sprinting remote player is reported as running', () => {
  const { rp, steps } = mk();
  let t = 1000;
  rp.applySnapshot([dto({ p: [0, 0, 0] })], t, t);
  t += 66;
  rp.applySnapshot([dto({ p: [0, 0, 0.4] })], t, t);    // ~6 m/s
  assert.equal(steps.at(-1).running, true);
});

test('a standing remote player makes no sound', () => {
  const { rp, steps } = mk();
  let t = 1000;
  rp.applySnapshot([dto({ p: [5, 0, 5] })], t, t);
  for (let i = 0; i < 5; i++) {
    t += 66;
    rp.applySnapshot([dto({ p: [5, 0, 5] })], t, t);
  }
  assert.equal(steps.length, 0);
});

test('an airborne player makes no footsteps', () => {
  const { rp, steps } = mk();
  let t = 1000;
  rp.applySnapshot([dto({ p: [0, 0, 0], a: ANIM.JUMP })], t, t);
  t += 66;
  rp.applySnapshot([dto({ p: [0, 2, 0.3], a: ANIM.JUMP })], t, t);
  assert.equal(steps.length, 0, 'jumping players should not clack along mid-air');
});

test('REGRESSION: remote players are interpolated ~120 ms in the past', () => {
  const { rp } = mk();
  const t0 = 10_000;
  rp.applySnapshot([dto({ p: [0, 0, 0] })], t0, t0);
  rp.applySnapshot([dto({ p: [0, 0, 10] })], t0 + 200, t0 + 200);
  // render at t0+200: the interpolation target is t0+80, i.e. 40% between the
  // two samples. A broken (≈0 ms) delay would snap straight to z=10.
  rp.update(0.016, t0 + 200);
  const av = globalThis.__avatars.at(-1);
  assert.ok(av.pos[2] > 0.5 && av.pos[2] < 9.5,
    `expected an interpolated position, got z=${av.pos[2]} (0 or 10 means no interpolation)`);
});

test('interpolation is monotonic and lands on the newest sample eventually', () => {
  const { rp } = mk();
  const t0 = 20_000;
  rp.applySnapshot([dto({ p: [0, 0, 0] })], t0, t0);
  rp.applySnapshot([dto({ p: [0, 0, 10] })], t0 + 100, t0 + 100);
  const zs = [];
  for (let dt = 0; dt <= 300; dt += 50) {
    rp.update(0.016, t0 + 100 + dt);
    zs.push(globalThis.__avatars.at(-1).pos[2]);
  }
  for (let i = 1; i < zs.length; i++) {
    assert.ok(zs[i] >= zs[i - 1] - 1e-9, `interpolation went backwards: ${zs}`);
  }
  assert.ok(zs.at(-1) > 9.9, `should settle on the newest sample, got ${zs.at(-1)}`);
});

test('players missing from a snapshot are removed from the scene', () => {
  const { rp } = mk();
  const t = 30_000;
  rp.applySnapshot([dto({ i: 'p2' }), dto({ i: 'p3', n: 'Cat' })], t, t);
  assert.equal(rp.map.size, 2);
  rp.applySnapshot([dto({ i: 'p2' })], t + 66, t + 66);
  assert.equal(rp.map.size, 1, 'a hider who broke line of sight must disappear');
  assert.equal(rp.getById('p3'), undefined);
});

test('our own id is never rendered as a remote player', () => {
  const { rp } = mk();
  const t = 40_000;
  rp.applySnapshot([dto({ i: 'p1' }), dto({ i: 'p2' })], t, t);
  assert.equal(rp.map.has('p1'), false);
  assert.equal(rp.map.has('p2'), true);
});

test('found + revealed + talking flags reach the avatar', () => {
  const { rp } = mk();
  const t = 50_000;
  rp.applySnapshot([dto({ s: STATUS.FOUND, rv: 1, tl: true })], t, t);
  const av = rp.getById('p2').avatar;
  assert.equal(av.found, true);
  assert.equal(av.talking, true);
  rp.applySnapshot([dto({ s: STATUS.HIDDEN, rv: 1 })], t + 66, t + 66);
  assert.equal(rp.getById('p2').avatar.revealed, true);
});
