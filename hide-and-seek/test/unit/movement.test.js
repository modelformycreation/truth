// ============================================================================
// Movement validation tests: speed cap, teleport rejection, bounds, and the
// seeker freeze during PREPARATION.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMove } from '../../server/movement.js';
import { mkRoom, addPlayer, PHASES, TEAMS, STATUS } from '../helpers.js';

function round(playerCount = 1) {
  const room = mkRoom();
  room.roundNumber = 1;
  const s = addPlayer(room, 'Seeker', { team: TEAMS.SEEKERS, status: STATUS.ACTIVE, pos: [10, 0, 10] });
  const h = addPlayer(room, 'Hider', { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos: [10, 0, 12] });
  room.setPhase(PHASES.ACTIVE_ROUND, 99999);
  return { room, s, h, others: playerCount };
}

test('normal-speed movement is accepted', () => {
  const { room, h } = round();
  h.lastMoveAt = Date.now() - 100;
  const res = validateMove(room, h, { p: [10.3, 0, 12.2], r: 1, a: 'walk' }, Date.now());
  assert.equal(res.ok, true);
  assert.deepEqual(h.pos, [10.3, 0, 12.2]);
});

test('teleport across the map is rejected and corrected', () => {
  const { room, h } = round();
  h.lastMoveAt = Date.now() - 50;
  const res = validateMove(room, h, { p: [50, 0, 40], r: 0, a: 'run' }, Date.now());
  assert.equal(res.ok, false);
  assert.equal(res.corrected, true);
  // clamped along the claimed direction, nowhere near the teleport target
  const moved = Math.hypot(h.pos[0] - 10, h.pos[2] - 12);
  assert.ok(moved < 2, `moved ${moved}`);
});

test('speedhack above tolerance is clamped', () => {
  const { room, h } = round();
  h.lastMoveAt = Date.now() - 100; // dt=0.1s, allowed ~1.24m, claim 5m
  const res = validateMove(room, h, { p: [15, 0, 12], r: 0, a: 'run' }, Date.now());
  assert.equal(res.ok, false);
  assert.ok(h.pos[0] < 12, 'position clamped');
});

test('movement outside world bounds is rejected', () => {
  const { room, h } = round();
  h.lastMoveAt = Date.now() - 1000;
  const res = validateMove(room, h, { p: [-30, 0, 12], r: 0 }, Date.now());
  assert.equal(res.ok, false);
  assert.ok(h.pos[0] >= 0);
});

test('seekers are frozen during PREPARATION', () => {
  const { room, s } = round();
  room.setPhase(PHASES.PREPARATION, 30); // seeker was teleported to the entrance
  const [sx, , sz] = s.pos;
  s.lastMoveAt = Date.now() - 100;
  const res = validateMove(room, s, { p: [sx + 6, 0, sz + 6], r: 2 }, Date.now());
  assert.equal(res.ok, false);
  assert.equal(res.corrected, true);
  // small movements/rotations still fine (looking around while blindfolded)
  const res2 = validateMove(room, s, { p: [sx + 0.2, 0, sz + 0.1], r: 2.5 }, Date.now());
  assert.equal(res2.ok, true);
  assert.equal(s.rot, 2.5);
});

test('hiders can move during PREPARATION', () => {
  const { room, h } = round();
  room.setPhase(PHASES.PREPARATION, 30);
  h.lastMoveAt = Date.now() - 100;
  const res = validateMove(room, h, { p: [10.3, 0, 12.3], r: 0 }, Date.now());
  assert.equal(res.ok, true);
});

test('movement is rejected in the lobby', () => {
  const room = mkRoom();
  const h = addPlayer(room, 'H', { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos: [10, 0, 10] });
  room.setPhase(PHASES.LOBBY);
  h.lastMoveAt = Date.now() - 100;
  assert.equal(validateMove(room, h, { p: [10.3, 0, 10], r: 0 }, Date.now()).ok, false);
});

test('repeated violations escalate to a kick', () => {
  const { room, h } = round();
  h.lastMoveAt = Date.now() - 50;
  let kick = false;
  for (let i = 0; i < 40; i++) {
    h.lastMoveAt = Date.now() - 50;
    const res = validateMove(room, h, { p: [h.pos[0] + 30, 0, h.pos[2]], r: 0 }, Date.now());
    if (res.kick) { kick = true; break; }
  }
  assert.ok(kick, 'should flag kick after repeated violations');
});
