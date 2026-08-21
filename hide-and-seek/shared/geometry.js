// ============================================================================
// shared/geometry.js
// Small deterministic geometry helpers used by the AUTHORITATIVE server
// (catch validation, line-of-sight) and mirrored on the client for prediction.
// All maps are built from axis-aligned boxes, so a slab test is exact.
// ============================================================================

/** Squared distance on the XZ plane. */
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.hypot(dx, dz);
}

/** 3D distance between [x,y,z] arrays. */
export function dist3(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Does segment p0->p1 intersect an AABB? (slab method)
 * box: { min: [x,y,z], max: [x,y,z] }
 */
export function segIntersectsBox(p0, p1, box) {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  let tmin = 0, tmax = 1;
  for (let i = 0; i < 3; i++) {
    const o = p0[i], di = d[i], mn = box.min[i], mx = box.max[i];
    if (Math.abs(di) < 1e-9) {
      if (o < mn || o > mx) return false;
    } else {
      let t1 = (mn - o) / di;
      let t2 = (mx - o) / di;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/** Precompute min/max for a center+size box. */
export function boxFromCenterSize(cx, cy, cz, sx, sy, sz) {
  return {
    min: [cx - sx / 2, cy - sy / 2, cz - sz / 2],
    max: [cx + sx / 2, cy + sy / 2, cz + sz / 2],
  };
}

/**
 * Line of sight between two eye points against a list of AABBs.
 * Pre-filters by the segment's own bounding box for speed.
 */
export function hasLineOfSight(p0, p1, boxes) {
  const bx0 = Math.min(p0[0], p1[0]), bx1 = Math.max(p0[0], p1[0]);
  const by0 = Math.min(p0[1], p1[1]), by1 = Math.max(p0[1], p1[1]);
  const bz0 = Math.min(p0[2], p1[2]), bz1 = Math.max(p0[2], p1[2]);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    // cheap reject: box outside segment bbox (with hair of tolerance)
    if (b.max[0] < bx0 || b.min[0] > bx1) continue;
    if (b.max[1] < by0 || b.min[1] > by1) continue;
    if (b.max[2] < bz0 || b.min[2] > bz1) continue;
    if (segIntersectsBox(p0, p1, b)) return false;
  }
  return true;
}

/**
 * Ground support height at (x, z) for a body currently at height y:
 * the highest box top that is at or below y + stepHeight. `floorY` is the
 * fallback (0 for the facility ground plane).
 */
export function supportHeight(x, z, y, colliders, floorY, stepHeight) {
  let best = floorY;
  const r = 0.30; // sample slightly inside the body radius
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (x + r < b.min[0] || x - r > b.max[0]) continue;
    if (z + r < b.min[2] || z - r > b.max[2]) continue;
    if (b.max[1] <= y + stepHeight && b.max[1] > best) best = b.max[1];
  }
  return best;
}

/** Push a circle (x,z,r) out of an AABB on the horizontal plane. Returns corrected [x,z] or null. */
export function circleBoxPush(x, z, r, box) {
  const cx = Math.min(Math.max(x, box.min[0]), box.max[0]);
  const cz = Math.min(Math.max(z, box.min[2]), box.max[2]);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cz + (dz / d) * r];
  }
  // center inside the box: push out along the shallowest axis
  const l = x - box.min[0], ri = box.max[0] - x, t = z - box.min[2], bo = box.max[2] - z;
  const m = Math.min(l, ri, t, bo);
  if (m === l) return [box.min[0] - r, z];
  if (m === ri) return [box.max[0] + r, z];
  if (m === t) return [x, box.min[2] - r];
  return [x, box.max[2] + r];
}

/** Is a point inside any of the boxes (2D footprint + y range)? */
export function pointInAnyBox(x, y, z, boxes, pad = 0) {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (
      x > b.min[0] - pad && x < b.max[0] + pad &&
      y > b.min[1] - pad && y < b.max[1] + pad &&
      z > b.min[2] - pad && z < b.max[2] + pad
    ) return true;
  }
  return false;
}
