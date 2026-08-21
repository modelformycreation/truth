// ============================================================================
// server/movement.js — server-validated movement.
//
// The client simulates its own character for responsiveness, but the server
// independently validates every position update: speed cap (with latency
// tolerance), world bounds, and phase rules (seekers frozen during
// PREPARATION). Violations produce an authoritative correction; repeated
// violations get the player kicked.
// ============================================================================

import { PHASES, TEAMS, STATUS } from '../shared/constants.js';

const WORLD_PHASES = new Set([
  PHASES.TEAM_ASSIGNMENT,
  PHASES.PREPARATION,
  PHASES.ACTIVE_ROUND,
  PHASES.ROUND_END,
  PHASES.RESULTS,
]);

/**
 * Validate + apply a movement update.
 * @returns {{ok:boolean, corrected?:boolean}} corrected=true means we moved the
 *   player to an authoritative position the client must snap to.
 */
export function validateMove(room, player, msg, now) {
  if (!WORLD_PHASES.has(room.phase)) return { ok: false };
  if (!Array.isArray(msg?.p) || msg.p.length !== 3 || !msg.p.every(Number.isFinite)) {
    return { ok: false, corrected: true };
  }

  const cfg = room.cfg;

  // Seekers are frozen (blindfolded) while hiders hide.
  if (room.phase === PHASES.PREPARATION &&
      player.team === TEAMS.SEEKERS && player.status !== STATUS.FOUND) {
    const dist = Math.hypot(msg.p[0] - player.pos[0], msg.p[2] - player.pos[2]);
    if (dist > 0.6) return { ok: false, corrected: true }; // look around only
    player.rot = clampRot(msg.r ?? player.rot);
    return { ok: true };
  }

  const dt = Math.min(1, Math.max(0.05, (now - player.lastMoveAt) / 1000));
  const maxH = cfg.sprintSpeed * cfg.speedTolerance * dt + 0.4;
  const maxV = Math.max(cfg.jumpSpeed + 2, 20) * dt + 0.4;

  const nx = msg.p[0], ny = msg.p[1], nz = msg.p[2];
  const dh = Math.hypot(nx - player.pos[0], nz - player.pos[2]);
  const dv = Math.abs(ny - player.pos[1]);

  const b = room.map.bounds;
  const outOfBounds = nx < b.minX - 1 || nx > b.maxX + 1 || nz < b.minZ - 1 || nz > b.maxZ + 1 || ny < -10 || ny > 12;

  let ok = dh <= maxH && dv <= maxV && !outOfBounds;
  if (ok) {
    player.pos = [nx, ny, nz];
    player.rot = clampRot(msg.r ?? player.rot);
    player.anim = typeof msg.a === 'string' ? msg.a : player.anim;
    player.lastMoveAt = now;
    if (player.moveWarnings > 0) player.moveWarnings -= 0.5;
    return { ok: true };
  }

  // Violation: clamp movement along the claimed direction, correct the client.
  player.moveWarnings += 1;
  let cx = player.pos[0], cy = player.pos[1], cz = player.pos[2];
  if (dh > 0.0001) {
    const k = Math.min(1, maxH / dh);
    cx = clamp(player.pos[0] + (nx - player.pos[0]) * k, b.minX + 0.4, b.maxX - 0.4);
    cz = clamp(player.pos[2] + (nz - player.pos[2]) * k, b.minZ + 0.4, b.maxZ - 0.4);
  }
  if (dv > maxV) {
    cy = clamp(player.pos[1] + Math.sign(ny - player.pos[1]) * maxV, -10, 12);
  }
  player.pos = [cx, cy, cz];
  player.rot = clampRot(msg.r ?? player.rot);
  player.lastMoveAt = now;
  return { ok: false, corrected: true, kick: player.moveWarnings > cfg.maxMoveWarnings };
}

function clampRot(r) {
  if (!Number.isFinite(r)) return 0;
  return Math.round(((r % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 100) / 100;
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
