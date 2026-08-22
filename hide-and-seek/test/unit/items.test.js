// ============================================================================
// Supply-crate (item) tests: spawning, pickups, the ⚡ boost speed cap, and
// the 🕶 cloak (uncatchable + invisible to enemies, visible to teammates).
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, TEAMS, STATUS, PHASES } from '../../shared/constants.js';
import { activeRoundRoom, addPlayer, lastSent } from '../helpers.js';
import { computeHideSpots } from '../../shared/map.js';
import { validateMove } from '../../server/movement.js';
import { attemptCatch } from '../../server/catch.js';
import { isVisible, buildWorldSnapshot } from '../../server/visibility.js';

const NOW = 1_700_000_000_000;
const players = (room, team) => [...room.players.values()].filter((p) => p.team === team);

function hiderSeekerRoom() {
  const room = activeRoundRoom({
    seekers: [['Seeker', [23.75, 0, 11.5]]],
    hiders: [['Hider', [22.25, 0, 11.5]]],
  });
  const seeker = players(room, TEAMS.SEEKERS)[0];
  const hider = players(room, TEAMS.HIDERS)[0];
  return { room, seeker, hider };
}

test('a new round drops the configured number of crates at valid spots', () => {
  const { room } = hiderSeekerRoom();
  assert.ok(room.items.length >= 2, `expected crates, got ${room.items.length}`);
  assert.equal(room.items.length, 4);
  // kinds alternate boost / cloak
  assert.equal(room.items[0].kind, 'boost');
  assert.equal(room.items[1].kind, 'cloak');
  assert.equal(room.items[2].kind, 'boost');
  assert.equal(room.items[3].kind, 'cloak');
  // every crate sits on a valid hide spot (which have floor under them)
  const spots = computeHideSpots(room.map);
  for (const it of room.items) {
    assert.ok(
      spots.some((s) => s[0] === it.pos[0] && s[1] === it.pos[1] && s[2] === it.pos[2]),
      `crate at ${it.pos} is not on a validated spot`,
    );
  }
});

test('snapshots carry the item list with id, position and kind', () => {
  const { room, seeker } = hiderSeekerRoom();
  room._tick();
  const snap = lastSent(seeker, EVENTS.GAME_SNAPSHOT);
  assert.ok(Array.isArray(snap.it) && snap.it.length === 4);
  for (const it of snap.it) {
    assert.ok(it.i && Array.isArray(it.p) && it.p.length === 3);
    assert.ok(it.k === 'boost' || it.k === 'cloak');
  }
});

test('walking into a boost crate grants the boost and removes the crate', () => {
  const { room, seeker } = hiderSeekerRoom();
  room.items = [{ id: 'it0', pos: [23.75, 0, 11.5], kind: 'boost' }];
  room._updateItems(NOW);
  assert.equal(room.items.length, 0, 'crate is consumed');
  assert.ok(Math.abs(seeker.boostUntil - (NOW + 10000)) < 50, `boostUntil=${seeker.boostUntil}`);
  const feed = seeker.socket.sent.find((m) => m.event === EVENTS.GAME_FEED && /boost/i.test(m.payload.text));
  assert.ok(feed, 'a boost feed message was broadcast');
});

test('a hidden hider walking into a cloak crate gets cloaked', () => {
  const { room, hider } = hiderSeekerRoom();
  room.items = [{ id: 'it1', pos: [22.25, 0, 11.5], kind: 'cloak' }];
  room._updateItems(NOW);
  assert.equal(room.items.length, 0);
  assert.ok(Math.abs(hider.cloakUntil - (NOW + 10000)) < 50);
});

test('seekers (and found hiders) cannot use cloak crates', () => {
  const { room, seeker, hider } = hiderSeekerRoom();
  room.items = [{ id: 'it1', pos: [23.75, 0, 11.5], kind: 'cloak' }];
  room._updateItems(NOW);
  assert.equal(seeker.cloakUntil, 0, 'seeker cannot cloak');
  assert.equal(room.items.length, 1, 'crate stays for a hider');

  hider.status = STATUS.FOUND;
  room.items[0].pos = [22.25, 0, 11.5];
  room._updateItems(NOW);
  assert.equal(hider.cloakUntil, 0, 'found hiders cannot cloak');
});

test('boost raises the anti-cheat speed cap; without it the same move is corrected', () => {
  const { room, seeker } = hiderSeekerRoom();
  // simulate a 1s-old lastMove (dt clamps to 1) and a 10 m claim
  const claim = (p) => ({ p: [p.pos[0] + 10, p.pos[1], p.pos[2]], r: p.rot, a: 'run' });
  seeker.lastMoveAt = NOW - 2000;
  const unboosted = validateMove(room, seeker, claim(seeker), NOW);
  assert.equal(unboosted.corrected, true, '10 m in 1 s exceeds the normal cap');

  seeker.boostUntil = NOW + 5000;
  seeker.lastMoveAt = NOW - 2000;
  const boosted = validateMove(room, seeker, claim(seeker), NOW);
  assert.equal(boosted.ok, true, 'boosted cap (5.8*1.4*1.45 + 0.4) accepts 10 m/s');
});

test('a cloaked hider cannot be caught, even in range with clear LOS', () => {
  const { room, seeker, hider } = hiderSeekerRoom(); // 1.5 m apart, LOS clear
  hider.cloakUntil = NOW + 5000;
  const res = attemptCatch(room, seeker, hider.id, NOW);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'CLOAKED');
  assert.equal(hider.status, STATUS.HIDDEN, 'cloaked hider stays hidden');
});

test('once the cloak expires the same catch succeeds', () => {
  const { room, seeker, hider } = hiderSeekerRoom();
  hider.cloakUntil = NOW - 1;
  const res = attemptCatch(room, seeker, hider.id, NOW);
  assert.equal(res.ok, true, `expected catch, got ${JSON.stringify(res)}`);
  assert.equal(hider.status, STATUS.FOUND);
});

test('cloak hides a hider from enemies but not from teammates', () => {
  const { room, seeker, hider } = hiderSeekerRoom();
  const mate = addPlayer(room, 'Mate', { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos: [20, 0, 11.5] });
  hider.cloakUntil = NOW + 5000;
  assert.equal(isVisible(seeker, hider, room, NOW), false, 'enemy cannot see a cloaked hider');
  assert.equal(isVisible(mate, hider, room, NOW), true, 'teammates can see their cloaked hider');
  // and the enemy snapshot omits the hider entirely
  const snap = buildWorldSnapshot(room, seeker, NOW);
  assert.ok(!snap.some((d) => d.i === hider.id), 'cloaked hider omitted from enemy snapshot');
  const mateSnap = buildWorldSnapshot(room, mate, NOW);
  assert.ok(mateSnap.some((d) => d.i === hider.id), 'teammate snapshot includes the hider');
});

test('world DTOs expose effect expiries for client HUDs/glows', () => {
  const { room, seeker, hider } = hiderSeekerRoom();
  seeker.boostUntil = NOW + 4000;
  hider.cloakUntil = NOW + 3000;
  const snap = buildWorldSnapshot(room, hider); // hider sees everything on its team
  const me = snap.find((d) => d.i === hider.id);
  const him = snap.find((d) => d.i === seeker.id);
  assert.equal(me.cf, hider.cloakUntil);
  assert.equal(him.bf, seeker.boostUntil);
});
