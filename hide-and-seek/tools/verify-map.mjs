// Map sanity checker: flood-fills each floor of the facility and asserts all
// rooms / secret passages / stairs are reachable. Run: node tools/verify-map.mjs
import { getMap, computeHideSpots } from '../shared/map.js';

const map = getMap('facility');

// A collider blocks walking at height h if it overlaps the body band (h+0.36 .. h+1.7)
function blocked(x, z, h) {
  for (const c of map.colliders) {
    if (x > c.min[0] - 0.3 && x < c.max[0] + 0.3 &&
        z > c.min[2] - 0.3 && z < c.max[2] + 0.3 &&
        c.max[1] > h + 0.36 && c.min[1] < h + 1.7) return true;
  }
  return false;
}

const CELL = 0.4;
function key(x, z) { return `${Math.round(x / CELL)},${Math.round(z / CELL)}`; }

function flood(startX, startZ, h, bounds) {
  const start = key(startX, startZ);
  const seen = new Set([start]);
  const queue = [[startX, startZ]];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < bounds.minX || nx > bounds.maxX || nz < bounds.minZ || nz > bounds.maxZ) continue;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      if (blocked(nx, nz, h)) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  return seen;
}

function reachable(filled, tx, tz, tol = 1.5) {
  const tk = key(tx, tz);
  if (filled.has(tk)) return true;
  const cx = Math.round(tx / CELL), cz = Math.round(tz / CELL);
  const r = Math.ceil(tol / CELL);
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (filled.has(`${cx + dx},${cz + dz}`)) return true;
  }
  return false;
}

let failures = 0;
function check(name, ok, extra = '') {
  if (!ok) { failures++; console.log(`  ✗ ${name} ${extra}`); }
  else console.log(`  ✓ ${name}${extra ? ' ' + extra : ''}`);
}

// GROUND FLOOR at h=0
const ground = flood(31.5, 33.5, 0, map.bounds);
console.log('GROUND FLOOR (from atrium gathering point):');
const groundTargets = {
  'atrium': [31.5, 36], 'entrance vestibule': [32, 41.5], 'lab': [31.5, 11],
  'server room': [10, 7], 'security': [10, 18], 'office A': [47, 7],
  'office B (hatch base)': [56, 7], 'meeting room': [52.5, 17],
  'main corridor': [32, 23.5], 'west corridor': [21.5, 12],
  'east corridor': [41.5, 12], 'storage': [10, 36], 'warehouse': [52, 31],
  'alley (east)': [64, 20], 'alley door outside': [63, 13], 'alley door inside': [61, 13],
  'vent lab-west': [23.5, 4], 'vent lab-east': [40.5, 19], 'vent storage-atrium': [20.5, 27.5],
  'vent atrium-warehouse': [40.5, 28.5], 'stair entry (corridor)': [3.5, 24],
  'basement ladder hatch (atrium)': [37, 40],
};
for (const [name, [x, z]] of Object.entries(groundTargets)) check(name, reachable(ground, x, z));

// BASEMENT at h=-3.2
const basement = flood(3.5, 32.5, -3.2, { minX: 2, maxX: 40, minZ: 31, maxZ: 41 });
console.log('BASEMENT (from stair bottom):');
for (const [name, [x, z]] of Object.entries({
  'stair bottom exit': [4.5, 32.5], 'archives main aisle': [20, 32.2],
  'archives south aisle': [20, 39], 'closet (ladder base)': [38, 40],
  'east shelf aisle': [31, 35.8],
})) check(name, reachable(basement, x, z));

// ROOF at h=5.0
const roof = flood(31.5, 10, 5.0, map.bounds);
console.log('ROOFTOP (from center):');
for (const [name, [x, z]] of Object.entries({
  'roof center': [31.5, 20], 'water tank': [50, 13], 'parapet bridge gap': [61.5, 11.8],
  'stair landing': [64.2, 9.75], 'AC area': [10, 9.5],
})) check(name, reachable(roof, x, z));

// Exterior stairs: walkable ramp from alley ground
console.log('EXTERIOR STAIRS:');
const stairs = flood(64.2, 15.5, 0.0, map.bounds);
check('stairs bottom (alley)', reachable(stairs, 64.2, 15.5));

// hide spots
const spots = computeHideSpots(map);
check('hide spots generated', spots.length > 20, `(${spots.length} spots)`);

// spawns unblocked
console.log('SPAWNS:');
for (const p of map.spawns.gathering) check(`gathering ${p.map(v=>v.toFixed(1))}`, !blocked(p[0], p[2], 0));
for (const p of map.spawns.seekers) check(`seeker ${p.map(v=>v.toFixed(1))}`, !blocked(p[0], p[2], 0));

console.log(failures === 0 ? '\nMAP OK ✓' : `\nMAP FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
