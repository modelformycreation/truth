// ============================================================================
// Regression tests for the round state machine, found while QA-testing:
//
//  * setPhase(ACTIVE_ROUND) used to call checkWinConditions() mid-flight, which
//    re-entered setPhase(ROUND_END). Clients then received ROUND_END BEFORE
//    ACTIVE_ROUND, and the outer call overwrote the 8s round-end timer with the
//    (already dead) 300s round timer.
//  * the phase timeout and the snapshot tick's safety net could both fire for
//    the same transition and skip a phase.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS } from '../../shared/constants.js';
import { mkRoom, addPlayer, PHASES, TEAMS, STATUS } from '../helpers.js';

/** Every game:phase payload a player was sent, in order. */
function phaseSequence(player) {
  return player.socket.sent
    .filter((m) => m.event === EVENTS.GAME_PHASE)
    .map((m) => m.payload.phase);
}

function startedRoom({ seekersConnected = true } = {}) {
  const room = mkRoom({ minPlayers: 2, teamAssignmentSec: 1, preparationSec: 1, roundSec: 300 });
  const host = addPlayer(room, 'Host');
  const guest = addPlayer(room, 'Guest');
  room.hostId = host.id;
  host.ready = guest.ready = true;
  room.start(host);
  void seekersConnected;
  return { room, host, guest };
}

test('phases are announced to clients in the correct order', () => {
  const { room, host } = startedRoom();
  room.forcePhaseExpiry();              // TEAM_ASSIGNMENT -> PREPARATION
  room.forcePhaseExpiry();              // PREPARATION     -> ACTIVE_ROUND
  const seq = phaseSequence(host);
  assert.deepEqual(
    seq,
    [PHASES.TEAM_ASSIGNMENT, PHASES.PREPARATION, PHASES.ACTIVE_ROUND],
    `clients must never be told a later phase before an earlier one: ${seq}`,
  );
  assert.equal(room.phase, PHASES.ACTIVE_ROUND);
});

test('REGRESSION: when every seeker drops during prep, ROUND_END comes AFTER ACTIVE_ROUND', () => {
  const { room, host, guest } = startedRoom();
  room.forcePhaseExpiry();              // -> PREPARATION
  // knock out every seeker while the hiders are still hiding
  for (const p of room.players.values()) {
    if (p.team === TEAMS.SEEKERS) { p.socket = null; }
  }
  room.forcePhaseExpiry();              // -> ACTIVE_ROUND, which must end at once

  const observer = [...room.players.values()].find((p) => p.connected) ?? host;
  const seq = phaseSequence(observer);
  const iActive = seq.indexOf(PHASES.ACTIVE_ROUND);
  const iEnd = seq.indexOf(PHASES.ROUND_END);
  assert.ok(iActive !== -1, `ACTIVE_ROUND must be announced: ${seq}`);
  assert.ok(iEnd !== -1, `ROUND_END must be announced: ${seq}`);
  assert.ok(iEnd > iActive, `ROUND_END (${iEnd}) must come after ACTIVE_ROUND (${iActive}): ${seq}`);
  assert.equal(room.phase, PHASES.ROUND_END);
  void guest;
});

test('REGRESSION: the round-end timer is not clobbered by the round timer', () => {
  const { room } = startedRoom();
  room.forcePhaseExpiry();              // -> PREPARATION
  for (const p of room.players.values()) if (p.team === TEAMS.SEEKERS) p.socket = null;
  room.forcePhaseExpiry();              // -> ACTIVE_ROUND -> ROUND_END

  assert.equal(room.phase, PHASES.ROUND_END);
  const msLeft = room.phaseEndsAt - Date.now();
  assert.ok(
    msLeft <= room.cfg.roundEndSec * 1000 + 100,
    `phase deadline must be the ${room.cfg.roundEndSec}s round-end, not the round timer (got ${Math.round(msLeft / 1000)}s)`,
  );
});

test('REGRESSION: the phase timer and the tick safety net cannot skip a phase', () => {
  const { room } = startedRoom();
  assert.equal(room.phase, PHASES.TEAM_ASSIGNMENT);
  // pretend the deadline just passed, then let BOTH the timeout and the
  // snapshot tick decide the transition is due (the real-world race)
  room.phaseEndsAt = Date.now() - 100;
  room._phaseExpired();     // the phase timeout
  room._phaseExpired();     // the tick safety net, moments later
  room._phaseExpired();     // and again for good measure
  assert.equal(
    room.phase, PHASES.PREPARATION,
    'a duplicate expiry must be a no-op, not an extra phase transition',
  );
});

test('a normal round still walks the whole phase chain', () => {
  const { room, host } = startedRoom();
  room.forcePhaseExpiry();  // -> PREPARATION
  room.forcePhaseExpiry();  // -> ACTIVE_ROUND
  room.forcePhaseExpiry();  // -> ROUND_END (time expired)
  assert.equal(room.phase, PHASES.ROUND_END);
  room.forcePhaseExpiry();  // -> RESULTS
  assert.equal(room.phase, PHASES.RESULTS);
  room.forcePhaseExpiry();  // -> LOBBY
  assert.equal(room.phase, PHASES.LOBBY);
  const seq = phaseSequence(host);
  assert.deepEqual(seq, [
    PHASES.TEAM_ASSIGNMENT, PHASES.PREPARATION, PHASES.ACTIVE_ROUND,
    PHASES.ROUND_END, PHASES.RESULTS, PHASES.LOBBY,
  ]);
});

test('returning to the lobby clears teams and lets a second round start', () => {
  const { room, host, guest } = startedRoom();
  for (let i = 0; i < 5; i++) room.forcePhaseExpiry();   // all the way to LOBBY
  assert.equal(room.phase, PHASES.LOBBY);
  for (const p of room.players.values()) {
    assert.equal(p.team, null, 'teams must be cleared for the next round');
    assert.equal(p.status, STATUS.WAITING);
  }
  host.ready = guest.ready = true;
  assert.equal(room.start(host).ok, true, 'a second round must be startable');
  assert.equal(room.roundNumber, 2);
});

test('the host cannot double-start a running match', () => {
  const { room, host } = startedRoom();
  assert.equal(room.start(host).error, 'ALREADY_STARTED');
  room.forcePhaseExpiry();
  assert.equal(room.start(host).error, 'ALREADY_STARTED');
});

test('a non-host cannot start the match', () => {
  const room = mkRoom({ minPlayers: 2 });
  const host = addPlayer(room, 'Host');
  const guest = addPlayer(room, 'Guest');
  room.hostId = host.id;
  guest.ready = true;
  assert.equal(room.start(guest).error, 'NOT_HOST');
  assert.equal(room.phase, PHASES.LOBBY);
});
