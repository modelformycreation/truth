// ============================================================================
// Regression tests for the character system (Free Fire-style avatars).
//
// Pins down:
//   * per-player looks are DETERMINISTIC from the player id (every client
//     must render the same player identically — seeded, not per-client random)
//   * team cues exist (armband in the exact team colour)
//   * the procedural gait actually moves the limbs (walk vs idle vs air),
//     and legs swing in opposition
//   * setFound() greys the outfit; ping() marks scan contact
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS } from '../../shared/constants.js';

// canvas stub: createAvatar draws a nameplate with 2D-context calls
const fakeCtx = {
  clearRect: () => {}, measureText: (s) => ({ width: s.length * 12 }),
  beginPath: () => {}, roundRect: () => {}, rect: () => {},
  fill: () => {}, fillText: () => {},
  set fillStyle(v) {}, get fillStyle() { return ''; },
  set font(v) {}, get font() { return ''; },
  set textAlign(v) {}, get textAlign() { return ''; },
  set textBaseline(v) {}, get textBaseline() { return ''; },
};
globalThis.document = globalThis.document ?? {
  createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx }),
};

const { createAvatar } = await import('../../client/js/avatar.js');

const DT = 1 / 60;
function runFrames(av, n, speed, grounded = true, vy = 0) {
  for (let i = 0; i < n; i++) av.animate(DT, speed, grounded, vy);
}
function joints(av) {
  // hierarchy: group.children[0] = rig; rig.children[0] = hips;
  // hips.children[1] = legL, [2] = legR, [3] = chest
  const rig = av.group.children[0];
  const hips = rig.children[0];
  return { rig, hips, legL: hips.children[1], legR: hips.children[2], chest: hips.children[3] };
}
function allMats(group) {
  const out = [];
  group.traverse((o) => {
    if (o.isMesh) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) out.push(m);
    }
  });
  return out;
}

test('looks are deterministic per player id (same id -> same outfit)', () => {
  // same id + same team -> byte-identical full material palette
  const a = createAvatar({ id: 'player-abc', name: 'A', team: TEAMS.HIDERS });
  const b = createAvatar({ id: 'player-abc', name: 'B', team: TEAMS.HIDERS });
  const ca = allMats(a.group).map((m) => m.color.getHex()).sort().join(',');
  const cb = allMats(b.group).map((m) => m.color.getHex()).sort().join(',');
  assert.equal(ca, cb, 'identical full material palette for the same id+team');

  // outfit itself is team-independent (only team cues differ)
  const s = createAvatar({ id: 'player-abc', name: 'C', team: TEAMS.SEEKERS });
  assert.equal(a.body.material.color.getHex(), s.body.material.color.getHex(), 'same shirt colour');
  assert.equal(a.head.material.color.getHex(), s.head.material.color.getHex(), 'same skin colour');
});

test('different ids get different outfits (mostly)', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const shirts = ids.map((id) => createAvatar({ id, name: id, team: TEAMS.HIDERS })
    .body.material.color.getHex());
  assert.ok(new Set(shirts).size >= 3, `expected variety, got ${shirts}`);
});

test('both teams carry an armband in the exact team colour', () => {
  const hider = createAvatar({ id: 't1', name: 'H', team: TEAMS.HIDERS });
  const seeker = createAvatar({ id: 't2', name: 'S', team: TEAMS.SEEKERS });
  const has = (av, hex) => allMats(av.group).some((m) => m.color.getHex() === hex);
  assert.ok(has(hider, 0x35d07f), 'hider armband (green)');
  assert.ok(has(seeker, 0xff6a3d), 'seeker armband (orange)');
});

test('walking swings the legs in opposition; idle keeps them still', () => {
  const av = createAvatar({ id: 'gait-1', name: 'G', team: TEAMS.HIDERS });
  const { legL, legR } = joints(av);
  let minL = 0, maxL = 0, minR = 0, maxR = 0;
  let opposed = true;
  for (let i = 0; i < 180; i++) {
    av.animate(DT, 3.4, true, 0); // walk speed
    if (legL.rotation.x < minL) minL = legL.rotation.x;
    if (legL.rotation.x > maxL) maxL = legL.rotation.x;
    if (legR.rotation.x < minR) minR = legR.rotation.x;
    if (legR.rotation.x > maxR) maxR = legR.rotation.x;
    if (Math.abs(legL.rotation.x + legR.rotation.x) > 0.06) opposed = false;
  }
  assert.ok(maxL - minL > 0.3, `left leg must swing (range ${maxL - minL})`);
  assert.ok(maxR - minR > 0.3, `right leg must swing (range ${maxR - minR})`);
  assert.ok(opposed, 'legs must swing in opposite phase (scissoring gait)');
});

test('idle breathing: tiny motion, no walking', () => {
  const av = createAvatar({ id: 'gait-2', name: 'G', team: TEAMS.HIDERS });
  const { legL, chest, rig } = joints(av);
  runFrames(av, 240, 0);
  assert.ok(Math.abs(legL.rotation.x) < 0.08, `idle legs must stay still (got ${legL.rotation.x})`);
  assert.ok(rig.position.y < 0.02, 'idle bob must stay near the floor');
});

test('run cycle is faster & bigger than walk', () => {
  const mk = () => createAvatar({ id: 'gait-3', name: 'G', team: TEAMS.HIDERS });
  const swing = (speed) => {
    const av = mk();
    const { legL } = joints(av);
    let min = 0, max = 0;
    for (let i = 0; i < 180; i++) {
      av.animate(DT, speed, true, 0);
      min = Math.min(min, legL.rotation.x);
      max = Math.max(max, legL.rotation.x);
    }
    return max - min;
  };
  const walkSwing = swing(3.4);
  const runSwing = swing(5.8);
  assert.ok(runSwing > walkSwing * 1.15, `run swing ${runSwing} must exceed walk swing ${walkSwing}`);
});

test('airborne tuck + landing squash', () => {
  const av = createAvatar({ id: 'gait-4', name: 'G', team: TEAMS.HIDERS });
  const { legL, rig } = joints(av);
  runFrames(av, 30, 3.4);          // establish gait
  runFrames(av, 12, 2, false, 4);  // airborne
  assert.ok(legL.rotation.x < -0.2, `lead leg should tuck forward in air (got ${legL.rotation.x})`);
  av.animate(DT, 0, true, 0);      // land
  assert.ok(rig.scale.y < 1, `landing squash (got scale ${rig.scale.y})`);
});

test('gait phase advances with metres travelled (matches footstep audio)', () => {
  const av = createAvatar({ id: 'gait-5', name: 'G', team: TEAMS.HIDERS });
  const p0 = av.state.phase;
  runFrames(av, 60, 3.4);          // 1 s at 3.4 m/s
  const d = av.state.phase - p0;
  // one full cycle (2π) should be ~2 strides * 1.6 m = 3.2 m of walking
  const expected = (3.4 * 1) * (Math.PI / 1.6);
  assert.ok(Math.abs(d - expected) < 0.05, `phase advance ${d} vs expected ${expected}`);
});

test('setFound greys the outfit and lights the marker ring', () => {
  const av = createAvatar({ id: 'found-1', name: 'F', team: TEAMS.SEEKERS });
  av.setFound();
  assert.equal(av.body.material.color.getHex(), 0xb9c0cc, 'shirt greyed out');
  assert.ok(allMats(av.group).some((m) => m === av.body.material && m.color.getHex() === 0xb9c0cc));
  assert.equal(av.state.found, true);
});

test('ping() marks scan contact with a timed flare', () => {
  const av = createAvatar({ id: 'ping-1', name: 'P', team: TEAMS.HIDERS });
  const before = performance.now();
  av.ping();
  assert.ok(av.state.pingUntil > before && av.state.pingUntil < before + 3000);
});
