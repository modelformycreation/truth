// ============================================================================
// Map data tests: builds cleanly, has geometry for all required features,
// and hide spots exist across the whole facility.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap, computeHideSpots, MAPS } from '../../shared/map.js';

test('facility map builds with walls, floors, props, lights', () => {
  const map = getMap('facility');
  assert.equal(map.id, 'facility');
  const kinds = new Set(map.boxes.map((b) => b.kind));
  for (const k of ['wall', 'floor', 'prop', 'light', 'step']) assert.ok(kinds.has(k), k);
  assert.ok(map.boxes.length > 150, 'rich environment');
  assert.ok(map.colliders.length > 100);
  assert.ok(map.ladders.length === 2, 'basement + roof ladders');
});

test('los blockers include walls and tall props but not lights', () => {
  const map = getMap('facility');
  assert.equal(map.losBlockers.length, map.colliders.length - countShortProps(map));
  assert.ok(map.losBlockers.length > 120);
});

function countShortProps(map) {
  let n = 0;
  for (const b of map.boxes) {
    if (b.kind !== 'prop') continue;
    if (b.s[1] < 1.3 - 1e-6) n++;
  }
  return n;
}

test('spawns exist and are inside bounds', () => {
  const map = getMap('facility');
  assert.ok(map.spawns.gathering.length >= 8);
  assert.ok(map.spawns.seekers.length >= 3);
  for (const list of [map.spawns.gathering, map.spawns.seekers]) {
    for (const [x, y, z] of list) {
      assert.ok(x >= map.bounds.minX && x <= map.bounds.maxX);
      assert.ok(z >= map.bounds.minZ && z <= map.bounds.maxZ);
      assert.equal(y, 0);
    }
  }
});

test('hide spots cover ground floor, basement and roof', () => {
  const map = getMap('facility');
  const spots = computeHideSpots(map);
  assert.ok(spots.length > 100, `${spots.length} spots`);
  assert.ok(spots.some(([, y]) => y === 0), 'ground floor');
  assert.ok(spots.some(([, y]) => y === -3.2), 'basement');
  assert.ok(spots.some(([, y]) => y === 5.0), 'roof');
});

test('map registry exposes the facility as default', () => {
  assert.ok(MAPS.facility);
  assert.equal(getMap('unknown').id, 'facility');
});

// ------------------------------------------------------- signage + fairness --

test('signage exists and is purely cosmetic', () => {
  const map = getMap('facility');
  const signs = map.boxes.filter((b) => b.kind === 'sign');
  assert.ok(signs.length >= 15, `expected wayfinding signage, found ${signs.length}`);
  // a sign must never block a bullet-… er, a line of sight, or a player
  const isSameBox = (a, b) =>
    a.min[0] === b.c[0] - b.s[0] / 2 && a.min[1] === b.c[1] - b.s[1] / 2 && a.min[2] === b.c[2] - b.s[2] / 2;
  for (const s of signs) {
    assert.ok(!map.colliders.some((c) => isSameBox(c, s)), 'signs must not collide');
    assert.ok(!map.losBlockers.some((c) => isSameBox(c, s)), 'signs must not block line of sight');
  }
});

test('signs mark every secret route and both vertical links', () => {
  const map = getMap('facility');
  const signs = map.boxes.filter((b) => b.kind === 'sign');
  const near = (x, z, r = 2.5) => signs.some((s) => Math.hypot(s.c[0] - x, s.c[2] - z) <= r);
  for (const [name, x, z] of [
    ['vent lab-west', 23.5, 4], ['vent lab-east', 40.5, 19],
    ['vent storage-atrium', 20.5, 27.5], ['vent atrium-warehouse', 40.5, 28.5],
    ['atrium ladder hatch', 37, 40], ['basement stair head', 3.5, 24.9],
    ['roof access', 64.2, 12],
  ]) {
    assert.ok(near(x, z), `${name} should be signposted`);
  }
});

test('REGRESSION: no bot hide spot sits on top of a seeker spawn', () => {
  const map = getMap('facility');
  const spots = computeHideSpots(map);
  for (const s of map.spawns.seekers) {
    for (const [x, , z] of spots) {
      assert.ok(
        Math.hypot(s[0] - x, s[2] - z) >= 7,
        `hide spot ${[x, z]} is inside the seekers' spawn — instantly found, not a hiding place`,
      );
    }
  }
});

test('the basement and rooftop both offer real cover, not just the ground floor', () => {
  const map = getMap('facility');
  const spots = computeHideSpots(map);
  const onFloor = (y) => spots.filter(([, sy]) => sy === y).length;
  assert.ok(onFloor(-3.2) >= 20, `basement needs hiding places, has ${onFloor(-3.2)}`);
  assert.ok(onFloor(5.0) >= 20, `rooftop needs hiding places, has ${onFloor(5.0)}`);
});

test('hide spots are deterministic (stable tests, fair rounds)', () => {
  const a = computeHideSpots(getMap('facility'));
  const b = computeHideSpots(getMap('facility'));
  assert.deepEqual(a, b);
});
