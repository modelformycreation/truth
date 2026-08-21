// ============================================================================
// shared/map.js
// "Blackwood Research Facility" — the MVP map, expressed as pure data.
//
// The SAME box list is used by:
//   - the client, to render the world and run local collision/prediction
//   - the server, for authoritative line-of-sight raycasts and hide-spot logic
//
// Everything is axis-aligned boxes {c:[x,y,z] center, s:[x,y,z] size} so the
// cheap slab raycast in geometry.js is exact.
//
// Layout (meters, x→east, z→south, y→up):
//   Ground floor : entrance + reception atrium, laboratory, server room,
//                  security, 2 offices + meeting room, storage, warehouse,
//                  looping corridors, two secret vents.
//   Basement     : archives (stairs down from storage, secret ladder up
//                  into the atrium).
//   Rooftop      : exterior service stairs in the east alley, AC units,
//                  water tank — with a parapet gap at the stair bridge.
// ============================================================================

import { boxFromCenterSize } from './geometry.js';

const WALL_H = 4.58;
const T = 0.4; // wall thickness
const DOOR_H = 2.4;
const ROLL_H = 3.2; // rolling door height
const VENT_H = 1.9; // secret duct height (walkable, feels secret)

const COL = {
  wallExt: 0x666e7c,
  wallInt: 0x8b93a1,
  wallAccent: 0x535a66,
  floorIn: 0x70747c,
  floorOut: 0x4c5058,
  floorBase: 0x5c6068,
  roof: 0x565b64,
  desk: 0x9c7e5a,
  shelf: 0x7d6b52,
  crate: 0xa08652,
  rack: 0x30363f,
  machine: 0x4a5560,
  sofa: 0x70616e,
  plant: 0x3f7d4c,
  pillar: 0x7a8290,
  barrel: 0x7a5c3a,
  locker: 0x54626e,
  tank: 0x8d99a6,
  light: 0xfff2cc,
};

const boxes = [];
const ladders = [];

function pushBox(cx, cy, cz, sx, sy, sz, kind, color) {
  boxes.push({ c: [cx, cy, cz], s: [sx, sy, sz], kind, color });
}

// --- wall helpers (axis-aligned, with door gaps + lintels) ------------------
function wallX(z, x1, x2, opts = {}) {
  const h = opts.h ?? WALL_H, y0 = opts.y0 ?? 0, thick = opts.thick ?? T;
  const color = opts.color ?? COL.wallInt;
  const cy = y0 + h / 2;
  const doors = [...(opts.doors ?? [])].sort((a, b) => a.at - b.at);
  let cursor = x1;
  for (const d of doors) {
    const w = d.w ?? 2.5, dh = d.doorH ?? DOOR_H;
    const a = d.at - w / 2, b = d.at + w / 2;
    if (a > cursor) pushBox((cursor + a) / 2, cy, z, a - cursor, h, thick, 'wall', color);
    // lintel above the door
    if (y0 + h > y0 + dh) {
      pushBox(d.at, y0 + dh + (h - dh) / 2, z, w, h - dh, thick, 'wall', color);
    }
    cursor = b;
  }
  if (x2 > cursor) pushBox((cursor + x2) / 2, cy, z, x2 - cursor, h, thick, 'wall', color);
}

function wallZ(x, z1, z2, opts = {}) {
  const h = opts.h ?? WALL_H, y0 = opts.y0 ?? 0, thick = opts.thick ?? T;
  const color = opts.color ?? COL.wallInt;
  const cy = y0 + h / 2;
  const doors = [...(opts.doors ?? [])].sort((a, b) => a.at - b.at);
  let cursor = z1;
  for (const d of doors) {
    const w = d.w ?? 2.5, dh = d.doorH ?? DOOR_H;
    const a = d.at - w / 2, b = d.at + w / 2;
    if (a > cursor) pushBox(x, cy, (cursor + a) / 2, thick, h, a - cursor, 'wall', color);
    if (y0 + h > y0 + dh) {
      pushBox(x, y0 + dh + (h - dh) / 2, d.at, thick, h - dh, w, 'wall', color);
    }
    cursor = b;
  }
  if (z2 > cursor) pushBox(x, cy, (cursor + z2) / 2, thick, h, z2 - cursor, 'wall', color);
}

function prop(cx, cz, sx, sz, h, color, opts = {}) {
  const y0 = opts.y0 ?? 0;
  pushBox(cx, y0 + h / 2, cz, sx, h, sz, opts.kind ?? 'prop', color);
}

function floorSlab(x1, x2, z1, z2, yTop, color, thick = 0.4, kind = 'floor') {
  pushBox((x1 + x2) / 2, yTop - thick / 2, (z1 + z2) / 2, x2 - x1, thick, z2 - z1, kind, color);
}

// ============================================================================
// BUILD: BLACKWOOD RESEARCH FACILITY
// ============================================================================

function buildFacility() {
  boxes.length = 0;
  ladders.length = 0;

  // ---- world boundary (keeps players inside the playable plot) -------------
  wallX(0.2, 0, 66, { h: 6, thick: 0.4, color: COL.wallAccent });            // north fence
  wallX(47.8, 0, 66, { h: 6, thick: 0.4, color: COL.wallAccent });            // south fence
  wallZ(0.2, 0, 48, { h: 6, thick: 0.4, color: COL.wallAccent });             // west fence
  wallZ(65.8, 0, 48, { h: 6, thick: 0.4, color: COL.wallAccent });            // east fence

  // ---- exterior building shell (interior face at x2..62, z2..44) -----------
  wallX(1.8, 1.6, 62.4, { h: WALL_H, thick: 0.4, color: COL.wallExt });                        // north
  wallX(44.2, 1.6, 62.4, { h: WALL_H, thick: 0.4, color: COL.wallExt, doors: [{ at: 32, w: 4 }] }); // south + main entrance
  wallZ(1.8, 1.6, 44.4, { h: WALL_H, thick: 0.4, color: COL.wallExt });                        // west
  wallZ(62.2, 1.6, 44.4, { h: WALL_H, thick: 0.4, color: COL.wallExt, doors: [{ at: 13, w: 2.5 }] }); // east + alley door

  // ---- interior walls -------------------------------------------------------
  // North wing / main corridor divider (z=22)
  wallX(22, 2, 62, {
    doors: [
      { at: 9.25, w: 2.5 },   // server room
      { at: 17.25, w: 2.5 },  // security
      { at: 31.5, w: 3 },     // laboratory
      { at: 51.25, w: 2.5 },  // offices
    ],
  });
  // Main corridor / south wing divider (z=25)
  wallX(25, 2, 62, {
    doors: [
      { at: 3.5, w: 2.6, doorH: 2.2 },  // basement stair entry
      { at: 9.25, w: 2.5 },             // storage
      { at: 31, w: 8, doorH: ROLL_H },  // atrium opening
      { at: 51.5, w: 5, doorH: ROLL_H },// warehouse rolling door
    ],
  });
  // West vertical corridor (x20..23)
  wallZ(20, 2, 22, { doors: [{ at: 9.25, w: 2.5 }, { at: 17.25, w: 2.5 }] });
  wallZ(23, 2, 22, { doors: [{ at: 11.5, w: 2.5 }, { at: 4, w: 1, doorH: VENT_H }] }); // + secret vent to lab
  // East vertical corridor (x40..43)
  wallZ(40, 2, 22, { doors: [{ at: 11.5, w: 2.5 }, { at: 19, w: 1, doorH: VENT_H }] }); // + secret vent
  wallZ(43, 2, 22, { doors: [{ at: 7, w: 2.5 }, { at: 16, w: 2.5 }] });
  // Offices split
  wallX(12, 43, 62, { doors: [{ at: 51.25, w: 2.5 }] });
  wallZ(52, 2, 12, { doors: [{ at: 6.5, w: 2 }] });
  // South wing: storage | atrium | warehouse
  wallZ(20, 25, 44, { doors: [{ at: 33, w: 2.5 }, { at: 27.5, w: 1, doorH: VENT_H }] }); // + secret duct
  wallZ(40, 25, 44, { doors: [{ at: 35.5, w: 5, doorH: ROLL_H }, { at: 28.5, w: 1, doorH: VENT_H }] });

  // ---- ground slabs (holes: basement stairwell + basement ladder) ----------
  floorSlab(2, 62, 2, 25, 0, COL.floorIn);        // north wing + main corridor
  floorSlab(2, 5, 31, 44, 0, COL.floorIn);        // storage west sliver (beside stairwell)
  floorSlab(5, 36, 31, 44, 0, COL.floorIn);       // south wing, west of ladder hole
  floorSlab(38, 62, 31, 44, 0, COL.floorIn);      // south wing, east of ladder hole
  floorSlab(36, 38, 31, 39, 0, COL.floorIn);      // ladder hole north strip
  floorSlab(36, 38, 41, 44, 0, COL.floorIn);      // ladder hole south strip
  // outside apron / alley
  floorSlab(0, 66, 0, 1.6, 0, COL.floorOut, 0.4);
  floorSlab(0, 66, 44.4, 48, 0, COL.floorOut, 0.4);
  floorSlab(0, 1.6, 1.6, 44.4, 0, COL.floorOut, 0.4);
  floorSlab(62.4, 66, 1.6, 44.4, 0, COL.floorOut, 0.4);

  // ---- basement: archives (floor at -3.2, under storage/atrium) ------------
  floorSlab(2, 40, 31, 41, -3.2, COL.floorBase, 0.4);
  // basement perimeter walls
  wallZ(2, 31, 41, { y0: -3.2, h: 3.0, color: COL.wallExt });
  wallZ(40, 31, 41, { y0: -3.2, h: 3.0, color: COL.wallExt });
  wallX(41, 2, 40, { y0: -3.2, h: 3.0, color: COL.wallExt });
  wallX(31, 5, 40, { y0: -3.2, h: 3.0, color: COL.wallExt }); // east of stair shaft
  // stairwell shaft (descends south from corridor z=25, between x2..5)
  wallZ(5, 25, 31.2, { y0: -3.2, h: 4.1, color: COL.wallInt }); // east side + above-ground rail
  wallX(31, 2, 3.9, { y0: -3.2, h: 4.1, color: COL.wallInt });  // south cap (left of exit)
  wallX(31, 5.1, 5, { y0: -3.2, h: 4.1, color: COL.wallInt });  // south cap (right of exit)
  pushBox(4.5, -0.5, 31, 1.2, 1.4, 0.3, 'wall', COL.wallInt);   // rail over the exit gap
  // steps: 10 × (0.32 rise, 0.55 run), descending south from the corridor
  for (let k = 1; k <= 10; k++) {
    const top = -0.32 * k;
    const zA = 25 + 0.55 * (k - 1), zB = 25 + 0.55 * k;
    pushBox(3.5, (top - 3.6) / 2 + 0.0, (zA + zB) / 2, 3, top + 3.6, 0.55, 'step', COL.wallInt);
  }
  // basement closet (dead-end with the secret ladder)
  wallX(38.5, 33, 37, { y0: -3.2, h: 3.0, color: COL.wallInt });
  wallZ(33, 38.5, 41, { y0: -3.2, h: 3.0, color: COL.wallInt });
  // secret ladder: basement closet -> atrium hatch
  ladders.push({ min: [36.2, -3.2, 39.2], max: [37.8, 0.05, 40.8] });

  // ---- rooftop ---------------------------------------------------------
  // roof slab (y 4.6..5.0) with hatch hole over office B (x58..60, z4..6)
  floorSlab(2, 58, 1.6, 44.4, 5.0, COL.roof, 0.4);
  floorSlab(60, 62.4, 1.6, 44.4, 5.0, COL.roof, 0.4);
  floorSlab(58, 60, 6, 44.4, 5.0, COL.roof, 0.4);
  floorSlab(58, 60, 1.6, 4, 5.0, COL.roof, 0.4);
  // parapet with a gap at the exterior-stair bridge (east, z 10.8..12.8)
  wallX(1.8, 1.6, 62.4, { y0: 5.0, h: 1.0, thick: 0.4, color: COL.wallExt });
  wallX(44.2, 1.6, 62.4, { y0: 5.0, h: 1.0, thick: 0.4, color: COL.wallExt });
  wallZ(1.8, 1.6, 44.4, { y0: 5.0, h: 1.0, thick: 0.4, color: COL.wallExt });
  wallZ(62.2, 1.6, 10.8, { y0: 5.0, h: 1.0, thick: 0.4, color: COL.wallExt });
  wallZ(62.2, 12.8, 44.4, { y0: 5.0, h: 1.0, thick: 0.4, color: COL.wallExt });
  // roof hatch ladder (office B -> roof)
  ladders.push({ min: [58.2, 0, 4.2], max: [59.8, 5.05, 5.8] });
  // exterior service stairs in the east alley (16 steps up, heading north)
  for (let k = 1; k <= 16; k++) {
    const top = 0.31 * k;
    const zB = 16 - 0.55 * k, zA = zB + 0.55;
    pushBox(64.2, top / 2, (zA + zB) / 2, 2.8, top, 0.55, 'step', COL.wallAccent);
  }
  pushBox(64.2, 2.48, 9.75, 3.6, 4.96, 6.5, 'step', COL.wallAccent); // top landing -> parapet gap

  // ============================================================================
  // PROPS (hide spots). height >= 1.3 blocks line of sight; lower props block
  // movement only — you can be seen over them but must be walked around.
  // ============================================================================
  // Reception / atrium
  prop(26.5, 39.5, 3, 0.8, 1.05, COL.desk);         // front desk
  prop(25, 38, 0.8, 2.5, 1.05, COL.desk);           // desk return
  prop(36.5, 41, 2.2, 0.9, 0.75, COL.sofa);         // sofas
  prop(36.5, 38.6, 2.2, 0.9, 0.75, COL.sofa);
  prop(35.4, 39.8, 1.2, 0.7, 0.5, COL.desk);        // coffee table
  prop(24.5, 42.5, 0.7, 0.7, 1.6, COL.plant);       // plants (block LOS)
  prop(38.5, 30, 0.7, 0.7, 1.6, COL.plant);
  prop(24.5, 26.5, 0.7, 0.7, 1.6, COL.plant);
  prop(27, 30, 0.7, 0.7, WALL_H, COL.pillar);       // pillars
  prop(33, 30, 0.7, 0.7, WALL_H, COL.pillar);
  prop(27, 36, 0.7, 0.7, WALL_H, COL.pillar);
  prop(33, 36, 0.7, 0.7, WALL_H, COL.pillar);
  prop(23.7, 33, 0.7, 4, 2.1, COL.shelf);           // reception shelf wall
  prop(38.8, 35, 0.9, 2.4, 1.15, COL.locker);       // fallen cabinet

  // Laboratory
  prop(31.5, 11, 8, 1.6, 0.95, COL.desk);           // central island bench
  prop(27, 4, 6, 1.2, 0.95, COL.desk);              // benches along north wall
  prop(36, 4, 5, 1.2, 0.95, COL.desk);
  prop(39.2, 8, 1.4, 4, 2.3, COL.machine);          // fume hood (LOS)
  prop(24.3, 16, 0.9, 6, 2.1, COL.shelf);           // cabinets (LOS)
  prop(35.5, 18.5, 4, 0.7, 2.0, COL.shelf);         // sample shelves (LOS)
  prop(28.5, 7.5, 1.2, 1.2, 1.15, COL.machine);     // equipment
  prop(34.5, 7.5, 1.2, 1.2, 1.15, COL.machine);

  // Server room
  prop(6, 5, 3, 1.1, 2.3, COL.rack);                // rack rows (LOS)
  prop(12, 5, 3, 1.1, 2.3, COL.rack);
  prop(6, 9.5, 3, 1.1, 2.3, COL.rack);
  prop(12, 9.5, 3, 1.1, 2.3, COL.rack);
  prop(17.5, 8, 1.1, 8, 2.3, COL.rack);
  prop(17, 3, 5, 3.5, 0.3, COL.machine);            // raised platform

  // Security room
  prop(8, 18.5, 5, 1, 1.05, COL.desk);              // monitor desk
  prop(8, 21.3, 5, 0.8, 2.2, COL.locker);           // lockers (LOS)
  prop(19, 17, 0.8, 3.5, 2.1, COL.shelf);           // evidence shelf (LOS)
  prop(14, 20.5, 1.5, 1.5, 1.2, COL.machine);

  // Utility corridors
  prop(21.5, 3, 1.2, 1.6, 1.9, COL.machine);        // boiler at corridor dead-end
  prop(21.5, 20.5, 1.6, 1.2, 1.1, COL.barrel);      // barrel cluster
  prop(41.5, 4, 1.2, 1.2, 1.5, COL.crate);          // crates in east corridor
  prop(41.5, 5.4, 1.2, 1.2, 0.8, COL.crate);
  prop(42, 20, 1.2, 2, 1.3, COL.machine);           // mop cart

  // Office A
  prop(46, 5, 2.2, 1, 0.9, COL.desk);
  prop(46, 9, 2.2, 1, 0.9, COL.desk);
  prop(49.5, 7, 0.2, 6, 1.5, COL.wallInt);          // cubicle partition (LOS)
  prop(44, 10.8, 1.8, 0.8, 1.9, COL.shelf);
  prop(46, 6.3, 0.8, 0.8, 0.6, COL.sofa);           // chair
  // Office B (keep hatch ladder x58..60 z4..6 clear)
  prop(54.5, 9.5, 2.2, 1, 0.9, COL.desk);
  prop(60.5, 9.5, 2.2, 1, 0.9, COL.desk);
  prop(61.2, 4, 1.2, 3, 2.1, COL.shelf);
  prop(61.2, 10.5, 1.2, 1.2, 1.2, COL.machine);
  // Meeting room
  prop(52.5, 17, 6, 1.6, 0.9, COL.desk);
  for (const [tx, tz] of [[50, 15.4], [55, 15.4], [50, 18.6], [55, 18.6], [52.5, 14.6], [52.5, 19.4]]) {
    prop(tx, tz, 0.7, 0.7, 0.55, COL.sofa);
  }
  prop(44, 20.8, 4, 0.8, 2.0, COL.shelf);
  prop(60.5, 20.5, 0.7, 0.7, 1.6, COL.plant);

  // Storage
  prop(7, 34, 8, 1.2, 2.5, COL.shelf);              // shelf rows (LOS)
  prop(7, 40, 8, 1.2, 2.5, COL.shelf);
  prop(15.5, 36, 1.2, 7, 2.5, COL.shelf);
  prop(17.5, 27, 1.4, 1.4, 1.3, COL.crate);         // crate stacks
  prop(17.5, 28.6, 1.4, 1.4, 0.7, COL.crate);
  prop(18.8, 27.8, 1.2, 1.2, 1.1, COL.crate);
  prop(4, 42.5, 1.6, 1.6, 1.4, COL.crate);
  prop(5.8, 42.5, 1.2, 1.2, 0.9, COL.crate);
  prop(12, 27, 1.4, 1.4, 0.28, COL.shelf);          // pallets
  prop(13.6, 27.2, 1.4, 1.4, 0.28, COL.shelf);

  // Warehouse
  prop(50, 28.5, 12, 1.4, 3, COL.shelf);            // tall shelf rows (LOS)
  prop(50, 33, 12, 1.4, 3, COL.shelf);
  prop(50, 37.5, 12, 1.4, 3, COL.shelf);
  prop(57, 41.5, 1.5, 1.5, 1.5, COL.crate);         // crate corner maze
  prop(58.7, 41.5, 1.5, 1.5, 0.75, COL.crate);
  prop(57.8, 40, 1.5, 1.5, 1.1, COL.crate);
  prop(60.5, 41.5, 1.4, 1.4, 1.2, COL.crate);
  prop(45, 41.5, 1.6, 1.6, 1.4, COL.crate);
  prop(46.8, 41.8, 1.2, 1.2, 0.8, COL.crate);
  prop(60, 34, 1.4, 2.6, 1.5, COL.machine);         // forklift
  prop(44.5, 27, 1, 1, 1.15, COL.barrel);           // barrels
  prop(44.5, 28.2, 1, 1, 1.15, COL.barrel);
  prop(45.6, 27.6, 1, 1, 1.15, COL.barrel);

  // Basement archives (props at y0 = -3.2)
  const B0 = { y0: -3.2 };
  prop(12, 34, 10, 1.1, 2.2, COL.shelf, B0);
  prop(12, 37.5, 10, 1.1, 2.2, COL.shelf, B0);
  prop(26, 34, 8, 1.1, 2.2, COL.shelf, B0);
  prop(26, 37.5, 8, 1.1, 2.2, COL.shelf, B0);
  prop(7, 36, 0.8, 0.8, 3.0, COL.pillar, B0);
  prop(19.5, 36, 0.8, 0.8, 3.0, COL.pillar, B0);
  prop(32, 36, 0.8, 0.8, 3.0, COL.pillar, B0);
  prop(6, 32.5, 1.4, 1.4, 1.2, COL.crate, B0);
  prop(35, 32.8, 1.5, 1.5, 1.0, COL.crate, B0);
  prop(33.5, 39.8, 1.4, 1.4, 1.3, COL.crate, B0);
  prop(39, 39.9, 1, 1.4, 2.2, COL.rack, B0);        // old server rack in closet
  prop(35, 40, 1.4, 1.4, 1.1, COL.crate, B0);

  // Rooftop (props at y0 = 5.0)
  const R0 = { y0: 5.0 };
  prop(10, 8, 2, 1.5, 1.5, COL.machine, R0);        // AC units
  prop(10, 11, 2, 1.5, 1.5, COL.machine, R0);
  prop(20, 8, 2.2, 2.2, 1.7, COL.machine, R0);
  prop(50, 10, 2.6, 2.6, 2.8, COL.tank, R0);        // water tank
  prop(32, 5.5, 10, 1.2, 0.7, COL.machine, R0);     // low ducts (cover, no LOS block)
  prop(32, 8, 10, 1.2, 0.7, COL.machine, R0);
  prop(56, 40, 1, 1, 2.4, COL.machine, R0);         // antenna base
  prop(59, 14, 1.2, 1.2, 1.1, COL.crate, R0);
  prop(60.8, 13.5, 1.2, 1.2, 0.7, COL.crate, R0);
  prop(30, 24, 2.4, 2.4, 0.5, COL.machine, R0);     // skylight

  // ---- ceiling light fixtures (cosmetic, no collision/LOS) -----------------
  const lights = [
    [32, 3.2, 30, 34], [12, 3.2, 8, 8], [32, 3.2, 8, 8], [12, 3.2, 18, 8],
    [52, 3.2, 7, 8], [52, 3.2, 17, 8], [32, 3.2, 12, 5], [32, 3.2, 23.5, 60],
    [10, 3.2, 34, 12], [10, 3.2, 40, 12], [52, 3.2, 28.5, 20], [52, 3.2, 36, 20],
  ];
  for (const [cx, cy, cz, len] of lights) {
    pushBox(cx, cy, cz, len, 0.18, 0.7, 'light', COL.light);
  }
  pushBox(20, -0.55, 36, 30, 0.15, 0.6, 'light', COL.light); // dim basement strip

  // ---- spawns -----------------------------------------------------------
  const gathering = makeGrid(31.5, 33.5, 10, 1.7);   // atrium gathering (team reveal)
  const seekers = makeGrid(32, 41.6, 6, 1.4);        // entrance vestibule

  const labels = [
    { name: 'RECEPTION', x1: 23, x2: 40, z1: 25, z2: 44 },
    { name: 'LAB', x1: 23, x2: 40, z1: 2, z2: 22 },
    { name: 'SERVER', x1: 2, x2: 20, z1: 2, z2: 14 },
    { name: 'SECURITY', x1: 2, x2: 20, z1: 14, z2: 22 },
    { name: 'OFFICES', x1: 43, x2: 62, z1: 2, z2: 22 },
    { name: 'STORAGE', x1: 2, x2: 20, z1: 25, z2: 44 },
    { name: 'WAREHOUSE', x1: 43, x2: 62, z1: 25, z2: 44 },
    { name: 'ARCHIVES (B1)', x1: 2, x2: 40, z1: 31, z2: 41 },
  ];

  return finalizeMap('facility', 'Blackwood Research Facility', {
    bounds: { minX: 0, maxX: 66, minZ: 0, maxZ: 48 },
    boxes: [...boxes],
    ladders: [...ladders],
    spawns: { gathering, seekers },
    labels,
    floorHeightAt: null, // computed via colliders
  });
}

function makeGrid(cx, cz, n, spacing) {
  const pts = [];
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const gx = i % cols, gz = Math.floor(i / cols);
    pts.push([
      cx + (gx - (cols - 1) / 2) * spacing,
      0,
      cz + (gz - Math.floor((n - 1) / cols) / 2) * spacing,
    ]);
  }
  return pts;
}

// --- derived data used by physics/LOS ---------------------------------------
function finalizeMap(id, name, raw) {
  const colliders = [];
  const losBlockers = [];
  const losMinClearance = 1.3;
  for (const b of raw.boxes) {
    if (b.kind === 'light') continue;
    const box = boxFromCenterSize(b.c[0], b.c[1], b.c[2], b.s[0], b.s[1], b.s[2]);
    colliders.push(box);
    const isWallLike = b.kind === 'wall' || b.kind === 'floor' || b.kind === 'step';
    const tallProp = b.kind === 'prop' && b.s[1] >= losMinClearance - 1e-6;
    if (isWallLike || tallProp) losBlockers.push(box);
  }
  return {
    id,
    name,
    ...raw,
    colliders,
    losBlockers,
    hideSpots: null, // computed lazily server-side (computeHideSpots)
  };
}

/**
 * Generate hiding spots for practice bots: a walkable point tucked against
 * each LOS-blocking prop. Deterministic (sorted) so tests are stable.
 */
export function computeHideSpots(map) {
  if (map.hideSpots) return map.hideSpots;
  const spots = [];
  for (const b of map.boxes) {
    if (b.kind !== 'prop') continue;
    const top = b.c[1] + b.s[1] / 2, bottom = b.c[1] - b.s[1] / 2;
    if (top - bottom < 1.3) continue;
    const y = bottom;
    const cx = b.c[0], cz = b.c[2];
    const px = b.s[0] / 2 + 0.55, pz = b.s[2] / 2 + 0.55;
    for (const [x, z] of [[cx - px, cz], [cx + px, cz], [cx, cz - pz], [cx, cz + pz]]) {
      if (x < map.bounds.minX + 0.4 || x > map.bounds.maxX - 0.4) continue;
      if (z < map.bounds.minZ + 0.4 || z > map.bounds.maxZ - 0.4) continue;
      // reject if the point is inside any collider above the floor
      let inside = false;
      for (const c of map.colliders) {
        if (
          x > c.min[0] - 0.3 && x < c.max[0] + 0.3 &&
          z > c.min[2] - 0.3 && z < c.max[2] + 0.3 &&
          c.max[1] > y + 0.3 && c.min[1] < y + 1.6
        ) { inside = true; break; }
      }
      if (!inside) spots.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)]);
    }
  }
  spots.sort((a, b) => (a[0] - b[0]) || (a[2] - b[2]));
  map.hideSpots = spots;
  return spots;
}

export const MAPS = { facility: buildFacility };
export const DEFAULT_MAP_ID = 'facility';

export function getMap(id = DEFAULT_MAP_ID) {
  const build = MAPS[id] ?? MAPS[DEFAULT_MAP_ID];
  return build();
}
