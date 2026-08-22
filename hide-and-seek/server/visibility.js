// ============================================================================
// server/visibility.js — authoritative visibility.
//
// Hidden enemies are NOT merely hidden client-side: their coordinates are
// never even sent to the opposing client unless the reveal condition holds.
// This makes wall-hacking via a hacked client useless.
//
//   enemy hider, HIDDEN  -> visible iff distance <= revealRadius AND LOS clear
//                           (during ACTIVE_ROUND / PREPARATION)
//   enemy hider, FOUND   -> always visible (marked found)
//   teammates            -> always visible
//   TEAM_ASSIGNMENT / ROUND_END / RESULTS -> everyone visible
// ============================================================================

import { TEAMS, STATUS, PHASES } from '../shared/constants.js';
import { dist3, hasLineOfSight } from '../shared/geometry.js';

const FULL_VISIBILITY_PHASES = new Set([PHASES.TEAM_ASSIGNMENT, PHASES.ROUND_END, PHASES.RESULTS]);

export function isVisible(viewer, target, room) {
  if (viewer.id === target.id) return true;
  if (FULL_VISIBILITY_PHASES.has(room.phase)) return true;
  if (target.team === viewer.team) return true;
  if (target.status === STATUS.FOUND) return true;
  // disconnected players show as markers for their team; enemies don't need them
  if (target.status === STATUS.DISCONNECTED) return false;
  if (target.status !== STATUS.HIDDEN && target.team !== TEAMS.SEEKERS) return false;

  // enemy: reveal only when close AND line of sight is clear
  const cfg = room.cfg;
  const a = eyePos(viewer, cfg.eyeHeight);
  const b = eyePos(target, cfg.eyeHeight);
  if (dist3(a, b) > cfg.revealRadius) return false;
  if (!hasLineOfSight(a, b, room.map.losBlockers)) return false;
  return true;
}

/** Is this enemy close enough that the client should light up the FIND button? */
export function isRevealed(viewer, target, room) {
  if (target.team === viewer.team || target.status === STATUS.FOUND) return true;
  return isVisible(viewer, target, room);
}

export function eyePos(player, eyeHeight) {
  return [player.pos[0], player.pos[1] + eyeHeight, player.pos[2]];
}

/** Build the per-viewer filtered world snapshot (list of world DTOs). */
export function buildWorldSnapshot(room, viewer) {
  const out = [];
  for (const p of room.players.values()) {
    if (!isVisible(viewer, p, room)) continue;
    const dto = p.toWorldDTO();
    if (p.status === STATUS.HIDDEN && p.team !== viewer.team &&
        !FULL_VISIBILITY_PHASES.has(room.phase)) {
      dto.rv = 1; // revealed — client renders them with a highlight
    }
    out.push(dto);
  }
  return out;
}

export { PHASES };
