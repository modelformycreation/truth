// ============================================================================
// server/catch.js — THE authoritative catch check.
//
// The FIND button on the client is only a convenience hint. Whether a catch
// succeeds is decided here, from server-owned positions:
//
//   if player is seeker
//   AND phase is ACTIVE_ROUND
//   AND target is a hider, currently HIDDEN, connected/bot
//   AND 3D distance(seekerEye, targetEye) <= catchRadius
//   AND line of sight is clear (when requireLineOfSight)
//   THEN catch succeeds — ELSE reject with a machine-readable reason.
// ============================================================================

import { TEAMS, STATUS, PHASES } from '../shared/constants.js';
import { dist3, hasLineOfSight } from '../shared/geometry.js';

export const CATCH_REJECT = {
  NOT_SEEKER: 'NOT_SEEKER',
  NOT_ACTIVE_ROUND: 'NOT_ACTIVE_ROUND',
  NO_TARGET: 'NO_TARGET',
  TOO_FAR: 'TOO_FAR',
  NO_LINE_OF_SIGHT: 'NO_LINE_OF_SIGHT',
  COOLDOWN: 'COOLDOWN',
};

/**
 * @param {GameRoom} room
 * @param {Player} seeker
 * @param {string|null} targetId optional client hint — never trusted
 * @param {number} now
 */
export function attemptCatch(room, seeker, targetId, now) {
  const cfg = room.cfg;

  if (room.phase !== PHASES.ACTIVE_ROUND) {
    return { ok: false, reason: CATCH_REJECT.NOT_ACTIVE_ROUND };
  }
  if (seeker.team !== TEAMS.SEEKERS) {
    return { ok: false, reason: CATCH_REJECT.NOT_SEEKER };
  }
  if (now - seeker.lastCatchAt < cfg.catchCooldownMs) {
    return { ok: false, reason: CATCH_REJECT.COOLDOWN };
  }

  const seekerEye = eye(seeker, cfg.eyeHeight);

  // candidate set: hidden, in-game hiders (optionally the one the client named)
  const allHidden = [];
  let named = null;
  for (const p of room.players.values()) {
    if (p.team !== TEAMS.HIDERS || p.status !== STATUS.HIDDEN) continue;
    allHidden.push(p);
    if (targetId && p.id === targetId) named = p;
  }
  if (targetId && !named) {
    return { ok: false, reason: CATCH_REJECT.NO_TARGET }; // unknown / already found / disconnected
  }
  const candidates = named ? [named] : allHidden;

  const inRange = [];
  for (const p of candidates) {
    const d = dist3(seekerEye, eye(p, cfg.eyeHeight)); // server computes distance itself
    if (d <= cfg.catchRadius) inRange.push([d, p]);
  }
  if (inRange.length === 0) {
    return { ok: false, reason: CATCH_REJECT.TOO_FAR };
  }
  inRange.sort((a, b) => a[0] - b[0]);

  let blockedById = null;
  for (const [dist, target] of inRange) {
    if (!cfg.requireLineOfSight) return succeed(seeker, target, dist, now);
    const clear = hasLineOfSight(seekerEye, eye(target, cfg.eyeHeight), room.map.losBlockers);
    if (clear) return succeed(seeker, target, dist, now);
    blockedById ??= target.id;
  }
  return { ok: false, reason: CATCH_REJECT.NO_LINE_OF_SIGHT, targetId: blockedById };
}

function succeed(seeker, target, dist, now) {
  // ---- success: mutate authoritative state ----
  target.status = STATUS.FOUND;
  target.foundAt = now;
  target.foundBy = seeker.id;
  seeker.lastCatchAt = now;
  seeker.catches += 1;
  return {
    ok: true,
    targetId: target.id,
    byId: seeker.id,
    targetName: target.name,
    byName: seeker.name,
    distance: Math.round(dist * 100) / 100,
  };
}

function eye(player, eyeHeight) {
  return [player.pos[0], player.pos[1] + eyeHeight, player.pos[2]];
}
