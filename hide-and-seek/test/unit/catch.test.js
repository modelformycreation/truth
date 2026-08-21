// ============================================================================
// Catch validation tests — the spec's most important anti-cheat requirement.
// The server must recompute distance and LOS itself; a lying client claiming
// "distance = 0.5m" while the server computes 18m gets rejected.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRoundRoom, addPlayer, TEAMS, STATUS, PHASES, lastSent } from '../helpers.js';

// Geometry notes (map: shared/map.js):
//  - wall x=23 has a door at z=11.5; no door at z=8.
function seekerHiderRoom({ hiderPos, seekerPos, settings = {}, phase = PHASES.ACTIVE_ROUND } = {}) {
  const room = activeRoundRoom({
    seekers: [['Seeker', seekerPos ?? [21, 0, 11.5]]],
    hiders: [['Hider', hiderPos ?? [22.4, 0, 11.5]]],
    settings,
  });
  if (phase !== PHASES.ACTIVE_ROUND) room.setPhase(phase, 99999);
  return room;
}

test('catch succeeds at 1.5m with clear line of sight', () => {
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5] });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  const res = room.onCatch(seeker, null);
  assert.equal(res.ok, true);
  assert.equal(hider.status, STATUS.FOUND);
  assert.equal(hider.foundBy, seeker.id);
});

test('catch fails at 8m even with line of sight', () => {
  const room = seekerHiderRoom({ hiderPos: [16, 0, 11.5], seekerPos: [24, 0, 11.5] }); // 8m apart
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const res = room.onCatch(seeker, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'TOO_FAR');
});

test('catch fails at 1.5m when a wall blocks line of sight', () => {
  // wall x=23 (door at z=11.5 only) — stand either side at z=8
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 8], seekerPos: [23.75, 0, 8] });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const res = room.onCatch(seeker, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'NO_LINE_OF_SIGHT');
});

test('catch succeeds at 1.5m through a doorway (LOS clear)', () => {
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5] });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  assert.equal(room.onCatch(seeker, null).ok, true);
});

test('catch succeeds with LOS requirement disabled (config)', () => {
  const room = seekerHiderRoom({
    hiderPos: [22.25, 0, 8], seekerPos: [23.75, 0, 8],
    settings: { requireLineOfSight: false },
  });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  assert.equal(room.onCatch(seeker, null).ok, true);
});

test('catch fails at 2.5m (just outside default catchRadius)', () => {
  const room = seekerHiderRoom({ hiderPos: [21.5, 0, 11.5], seekerPos: [24, 0, 11.5] }); // 2.5m
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const res = room.onCatch(seeker, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'TOO_FAR');
});

test('catch radius is configurable', () => {
  const room = seekerHiderRoom({
    hiderPos: [20.6, 0, 11.5], seekerPos: [24.4, 0, 11.5], // 3.8m apart, LOS through the doorway
    settings: { catchRadius: 4.5 },
  });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  assert.equal(room.onCatch(seeker, null).ok, true);
});

test('a HIDER cannot catch anyone (wrong team)', () => {
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5] });
  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  const res = room.onCatch(hider, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'NOT_SEEKER');
});

test('catching an already-found player fails', () => {
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5] });
  addPlayer(room, 'OtherHider', { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos: [50, 0, 36] });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const hider = [...room.players.values()].find((p) => p.name === 'Hider');
  assert.equal(room.onCatch(seeker, null).ok, true);
  seeker.lastCatchAt = 0; // separate the two attempts from the cooldown check
  const res2 = room.onCatch(seeker, hider.id);
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'NO_TARGET');
});

test('catching outside the active round fails', () => {
  for (const phase of [PHASES.LOBBY, PHASES.TEAM_ASSIGNMENT, PHASES.PREPARATION, PHASES.RESULTS]) {
    const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5], phase });
    const anyPlayer = [...room.players.values()][0]; // team may be reset in LOBBY — irrelevant
    const res = room.onCatch(anyPlayer, null);
    assert.equal(res.ok, false, phase);
    assert.equal(res.reason, 'NOT_ACTIVE_ROUND', phase);
  }
});

test('catching a disconnected hider fails', () => {
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5] });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  hider.socket = null;
  hider.prevStatus = hider.status;
  hider.status = STATUS.DISCONNECTED;
  const res = room.onCatch(seeker, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'TOO_FAR'); // disconnected players are not candidates
});

test('client-claimed targetId far away is rejected (anti-cheat)', () => {
  const room = seekerHiderRoom({ hiderPos: [50, 0, 36], seekerPos: [23.75, 0, 11.5] }); // ~32m away
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  const res = room.onCatch(seeker, hider.id); // malicious client names a far target
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'TOO_FAR'); // server measured the real distance itself
  assert.notEqual(res.reason, 'NO_TARGET'); // the target exists — it is just far away
});

test('cooldown prevents catch spamming', () => {
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5] });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const other = addPlayer(room, 'Hider2', { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos: [23.75, 0, 12.2] });
  assert.equal(room.onCatch(seeker, null).ok, true);          // catches Hider
  const res = room.onCatch(seeker, other.id);                 // instantly tries again
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'COOLDOWN');
});

test('successful catch broadcasts state + feed and found hider keeps roaming', () => {
  const room = seekerHiderRoom({ hiderPos: [22.25, 0, 11.5], seekerPos: [23.75, 0, 11.5] });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  room.onCatch(seeker, null);
  const catchMsg = lastSent(seeker, 'game:catchResult');
  assert.equal(catchMsg.ok, true);
  assert.equal(typeof catchMsg.targetId, 'string');
  const feed = seeker.socket.sent.filter((s) => s.event === 'game:feed').map((s) => s.payload.text);
  assert.ok(feed.some((t) => t.includes('found')));
  // round does not end while other hiders remain? (single hider here -> ends)
  assert.equal(room.phase, PHASES.ROUND_END);
});
