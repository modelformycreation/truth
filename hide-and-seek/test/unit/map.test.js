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
