// Map sanity checker: flood-fills each floor of EVERY map in the registry and
// asserts all rooms / passages / spawns are reachable + hide spots generate.
// Run: node tools/verify-map.mjs
import { getMap, MAPS, computeHideSpots } from '../shared/map.js';

// A collider blocks walking at height h if it overlaps the body band (h+0.36 .. h+1.7)
function makeBlocked(map) {
  return (x, z, h) => {
    for (const c of map.colliders) {
      if (x > c.min[0] - 0.3 && x < c.max[0] + 0.3 &&
          z > c.min[2] - 0.3 && z < c.max[2] + 0.3 &&
          c.max[1] > h + 0.36 && c.min[1] < h + 1.7) return true;
    }
    return false;
  };
}

const CELL = 0.4;
// Flood fill over INTEGER cell indices (BFS). Sampling floats directly drifts
// and collides on the rounded cell key, which silently trapped the fill.
function flood(blocked, startX, startZ, h, bounds) {
  const scx = Math.round(startX / CELL), scz = Math.round(startZ / CELL);
  const minCX = Math.floor(bounds.minX / CELL), maxCX = Math.ceil(bounds.maxX / CELL);
  const minCZ = Math.floor(bounds.minZ / CELL), maxCZ = Math.ceil(bounds.maxZ / CELL);
  const key = (cx, cz) => cx + ',' + cz;
  const seen = new Set([key(scx, scz)]);
  const queue = [[scx, scz]];
  let head = 0;
  while (head < queue.length) {
    const [cx, cz] = queue[head++];
    for (const [dcx, dcz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dcx, nz = cz + dcz;
      if (nx < minCX || nx > maxCX || nz < minCZ || nz > maxCZ) continue;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      if (blocked(nx * CELL, nz * CELL, h)) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  return seen;
}

function reachable(filled, tx, tz, tol = 1.5) {
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

// ============================================================================
// FACILITY — detailed per-room checks (the original map)
// ============================================================================
const map = getMap('facility');
const blocked = makeBlocked(map);

const ground = flood(blocked, 31.5, 33.5, 0, map.bounds);
console.log('FACILITY — GROUND FLOOR (from atrium gathering point):');
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

const basement = flood(blocked, 3.5, 32.5, -3.2, { minX: 2, maxX: 40, minZ: 31, maxZ: 41 });
console.log('FACILITY — BASEMENT (from stair bottom):');
for (const [name, [x, z]] of Object.entries({
  'stair bottom exit': [4.5, 32.5], 'archives main aisle': [20, 32.2],
  'archives south aisle': [20, 39], 'closet (ladder base)': [38, 40],
  'east shelf aisle': [31, 35.8],
  'west filing wall': [6.5, 36.5], 'south shelf aisle': [20, 42],
  'goods lift corner': [34.5, 35.5],
})) check(name, reachable(basement, x, z));

const roof = flood(blocked, 31.5, 10, 5.0, map.bounds);
console.log('FACILITY — ROOFTOP (from center):');
for (const [name, [x, z]] of Object.entries({
  'roof center': [31.5, 20], 'water tank': [50, 13], 'parapet bridge gap': [61.5, 11.8],
  'stair landing': [64.2, 9.75], 'AC area': [10, 9.5],
  'south roof': [31.5, 40], 'second water tank': [38, 38.5],
  'maintenance shed doorway': [42.6, 35.5], 'shed interior': [45.8, 35.5],
  'rooftop crate cluster': [50.5, 34], 'west vent stack': [9, 32],
})) check(name, reachable(roof, x, z));

const stairs = flood(blocked, 64.2, 15.5, 0.0, map.bounds);
console.log('FACILITY — EXTERIOR STAIRS:');
check('stairs bottom (alley)', reachable(stairs, 64.2, 15.5));

// ============================================================================
// ALL MAPS — generic checks: spawns unblocked, hide spots, per-floor reachability
// ============================================================================
for (const [id, build] of Object.entries(MAPS)) {
  const m = build();
  const blk = makeBlocked(m);
  console.log(`\n[${id.toUpperCase()}] generic checks:`);
  let spawnOk = true;
  for (const p of m.spawns.gathering) {
    if (blk(p[0], p[2], p[1] ?? 0)) { spawnOk = false; console.log(`    gathering blocked at ${p[0].toFixed(1)},${p[2].toFixed(1)}`); }
  }
  for (const p of m.spawns.seekers) {
    if (blk(p[0], p[2], p[1] ?? 0)) { spawnOk = false; console.log(`    seeker blocked at ${p[0].toFixed(1)},${p[2].toFixed(1)}`); }
  }
  check('all spawns unblocked', spawnOk);

  const spots = computeHideSpots(m);
  check('hide spots generated', spots.length > 15, `(${spots.length} spots)`);

  if (m.verify?.floors) {
    for (const [fname, fl] of Object.entries(m.verify.floors)) {
      const filled = flood(blk, fl.start[0], fl.start[1], fl.h, m.bounds);
      for (const [tname, [x, z]] of Object.entries(fl.targets)) {
        check(`${fname}: ${tname}`, reachable(filled, x, z));
      }
    }
  }
}

// facility spawn + spot re-check under the generic regime (already detailed above)
const fspots = computeHideSpots(map);
console.log(`\nFACILITY — SPAWNS & SPOTS:`);
check('hide spots', fspots.length > 20, `(${fspots.length} spots)`);
let fspawn = true;
for (const p of map.spawns.gathering) if (blocked(p[0], p[2], 0)) fspawn = false;
for (const p of map.spawns.seekers) if (blocked(p[0], p[2], 0)) fspawn = false;
check('spawns unblocked', fspawn);

console.log(failures === 0 ? '\nALL MAPS OK ✓' : `\nMAP FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
