import test from 'node:test';
import assert from 'node:assert/strict';
import { segIntersectsBox, hasLineOfSight, boxFromCenterSize, dist3 } from '../../shared/geometry.js';
import { getMap } from '../../shared/map.js';

const wall = boxFromCenterSize(23, 2, 8, 0.4, 4, 4); // wall segment at x=23

test('segment crosses a wall box', () => {
  assert.equal(segIntersectsBox([22, 1.5, 8], [24, 1.5, 8], wall), true);
});

test('segment parallel in front of wall misses', () => {
  assert.equal(segIntersectsBox([21, 1.5, 8], [22.4, 1.5, 8], wall), false);
});

test('segment above the wall misses (over the top)', () => {
  assert.equal(segIntersectsBox([22, 6, 8], [24, 6, 8], wall), false);
});

test('segment fully inside a box counts as intersecting', () => {
  assert.equal(segIntersectsBox([22.9, 1.5, 8], [23.1, 1.5, 8], wall), true);
});

test('line of sight blocked by facility wall, clear through a doorway', () => {
  const map = getMap('facility');
  const eye = (x, z) => [x, 1.5, z];
  // wall x=23 has a door at z=11.5 (w 2.5) — clear through the door
  assert.equal(hasLineOfSight(eye(22.2, 11.5), eye(23.8, 11.5), map.losBlockers), true);
  // same wall at z=8 has no door — blocked
  assert.equal(hasLineOfSight(eye(22.2, 8), eye(23.8, 8), map.losBlockers), false);
});

test('tall props block LOS, low props do not', () => {
  const map = getMap('facility');
  const eye = (x, z) => [x, 1.5, z];
  // warehouse tall shelf at (50, 33), 3m tall, blocks
  assert.equal(hasLineOfSight(eye(50, 31.5), eye(50, 34.5), map.losBlockers), false);
  // atrium sofa (36.5, 41), 0.75 tall — see over it
  assert.equal(hasLineOfSight(eye(36.5, 40.0), eye(36.5, 42.0), map.losBlockers), true);
});

test('basement is LOS-isolated from the ground floor', () => {
  const map = getMap('facility');
  // player in the basement archives vs player in storage directly above
  assert.equal(
    hasLineOfSight([10, -1.7, 36], [10, 1.5, 36], map.losBlockers),
    false,
  );
});

test('dist3 basic', () => {
  assert.equal(dist3([0, 0, 0], [3, 4, 0]), 5);
});
