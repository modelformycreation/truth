// ============================================================================
// Visibility system tests: hidden enemies must not even be SENT to seekers
// unless the reveal condition holds (distance + LOS), server-side.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldSnapshot, isVisible } from '../../server/visibility.js';
import { activeRoundRoom, TEAMS, STATUS, PHASES } from '../helpers.js';

function setup() {
  const room = activeRoundRoom({
    seekers: [['Seeker', [21, 0, 11.5]]],
    hiders: [['FarHider', [50, 0, 36]], ['CloseHider', [22.3, 0, 11.5]]],
    // teammate seeker for teammate-visibility checks
  });
  return room;
}

function byName(room, name) { return [...room.players.values()].find((p) => p.name === name); }

test('seeker cannot see a hidden hider at long distance (not even in the snapshot)', () => {
  const room = setup();
  const seeker = byName(room, 'Seeker');
  const far = byName(room, 'FarHider');
  assert.equal(isVisible(seeker, far, room), false);
  const snap = buildWorldSnapshot(room, seeker);
  assert.ok(!snap.some((d) => d.n === 'FarHider'), 'far hider must be absent from the snapshot payload');
});

test('seeker sees a hidden hider once close enough with LOS (revealed flag)', () => {
  const room = setup();
  const seeker = byName(room, 'Seeker');
  const close = byName(room, 'CloseHider'); // 1.3m, through the doorway
  assert.equal(isVisible(seeker, close, room), true);
  const snap = buildWorldSnapshot(room, seeker);
  const dto = snap.find((d) => d.n === 'CloseHider');
  assert.ok(dto, 'close hider should be in snapshot');
  assert.equal(dto.rv, 1, 'close hidden enemy should carry the revealed flag');
});

test('reveal radius is configurable', () => {
  const room = activeRoundRoom({
    seekers: [['Seeker', [21, 0, 11.5]]],
    hiders: [['MidHider', [25.5, 0, 11.5]]], // 4.5m away, LOS clear through door
    settings: { revealRadius: 3.0 },
  });
  const seeker = byName(room, 'Seeker');
  const mid = byName(room, 'MidHider');
  assert.equal(isVisible(seeker, mid, room), false);
});

test('wall blocks reveal even inside reveal radius', () => {
  // hider 1.5m away but on the other side of wall x=23 (no door at z=8)
  const room = activeRoundRoom({
    seekers: [['Seeker', [23.75, 0, 8]]],
    hiders: [['WallHider', [22.25, 0, 8]]],
  });
  const seeker = byName(room, 'Seeker');
  assert.equal(isVisible(seeker, byName(room, 'WallHider'), room), false);
});

test('found hiders are always visible to everyone', () => {
  const room = setup();
  const seeker = byName(room, 'Seeker');
  const far = byName(room, 'FarHider');
  far.status = STATUS.FOUND;
  assert.equal(isVisible(seeker, far, room), true);
  const snap = buildWorldSnapshot(room, seeker);
  assert.ok(snap.some((d) => d.n === 'FarHider'));
  assert.equal(snap.find((d) => d.n === 'FarHider').rv, undefined);
});

test('teammates are always visible', () => {
  const room = activeRoundRoom({
    seekers: [['S1', [21, 0, 11.5]], ['S2', [50, 0, 36]]],
    hiders: [['H1', [30, 0, 30]]],
  });
  const s1 = byName(room, 'S1');
  assert.equal(isVisible(s1, byName(room, 'S2'), room), true);
  // and hiders see their teammates
  const h1 = byName(room, 'H1');
  const h2 = (() => { const p = byName(room, 'H1'); return p; })();
  void h2;
  const room2 = activeRoundRoom({
    seekers: [['S1', [21, 0, 11.5]]],
    hiders: [['H1', [30, 0, 30]], ['H2', [8, 0, 36]]],
  });
  assert.equal(isVisible(byName(room2, 'H1'), byName(room2, 'H2'), room2), true);
});

test('hiders see enemy seekers only within reveal radius + LOS', () => {
  const room = activeRoundRoom({
    seekers: [['Seeker', [21, 0, 11.5]]],
    hiders: [['Hider', [22.3, 0, 11.5]]],
  });
  const hider = byName(room, 'Hider');
  const seeker = byName(room, 'Seeker');
  assert.equal(isVisible(hider, seeker, room), true); // 1.3m, LOS
  seeker.pos = [45, 0, 36];
  assert.equal(isVisible(hider, seeker, room), false); // far away
});

test('during TEAM_ASSIGNMENT / ROUND_END everyone sees everyone', () => {
  const room = activeRoundRoom({
    seekers: [['Seeker', [21, 0, 11.5]]],
    hiders: [['Hider', [50, 0, 36]]],
  });
  const seeker = byName(room, 'Seeker');
  const hider = byName(room, 'Hider');
  room.setPhase(PHASES.TEAM_ASSIGNMENT, 5);
  assert.equal(isVisible(seeker, hider, room), true);
});

test('seekers are blind to hiders during PREPARATION beyond reveal radius', () => {
  const room = activeRoundRoom({
    seekers: [['Seeker', [32, 0, 41.6]]],
    hiders: [['Hider', [31, 0, 33]]], // 8.7m away
  });
  room.setPhase(PHASES.PREPARATION, 30);
  const seeker = byName(room, 'Seeker');
  const snap = buildWorldSnapshot(room, seeker);
  assert.ok(!snap.some((d) => d.n === 'Hider'));
});
