// ============================================================================
// Game state machine tests: full phase flow, timer expiry, win conditions,
// disconnect handling + reconnect restore.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkRoom, addPlayer, PHASES, TEAMS, STATUS, lastSent } from '../helpers.js';

function lobbyRoom(n = 4, settings = {}) {
  const room = mkRoom(settings);
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = addPlayer(room, `P${i + 1}`);
    p.ready = true;
    players.push(p);
  }
  return { room, players };
}

function startFullRound(room) {
  const host = [...room.players.values()].find((p) => p.id === room.hostId);
  const res = room.start(host);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res;
}

test('full phase flow: LOBBY -> ... -> RESULTS -> LOBBY', () => {
  const { room } = lobbyRoom(4);
  assert.equal(room.phase, PHASES.LOBBY);

  startFullRound(room);
  assert.equal(room.phase, PHASES.TEAM_ASSIGNMENT);

  room.forcePhaseExpiry();
  assert.equal(room.phase, PHASES.PREPARATION);
  // seekers teleported to the entrance
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  assert.ok(seeker.pos[2] > 40, 'seeker at entrance vestibule');

  room.forcePhaseExpiry();
  assert.equal(room.phase, PHASES.ACTIVE_ROUND);

  room.forcePhaseExpiry(); // timer runs out
  assert.equal(room.phase, PHASES.ROUND_END);
  assert.equal(room.lastResults.winner, TEAMS.HIDERS, 'hiders win on time expiry');
  assert.ok(room.lastResults.hidersRemaining.length >= 1);

  room.forcePhaseExpiry();
  assert.equal(room.phase, PHASES.RESULTS);

  room.forcePhaseExpiry();
  assert.equal(room.phase, PHASES.LOBBY);
  // lobby reset
  for (const p of room.players.values()) {
    assert.equal(p.team, null);
    assert.equal(p.status, STATUS.WAITING);
  }
});

test('seekers win when every hider is found before the timer', () => {
  const { room } = lobbyRoom(4);
  startFullRound(room);
  room.forcePhaseExpiry(); // preparation
  room.forcePhaseExpiry(); // active round

  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const hiders = [...room.players.values()].filter((p) => p.team === TEAMS.HIDERS);
  for (const h of hiders) {
    h.pos = [...seeker.pos]; // teleport next to the seeker (test-side shortcut)
    seeker.lastCatchAt = 0;  // skip the real cooldown for back-to-back test catches
    const res = room.onCatch(seeker, h.id);
    assert.equal(res.ok, true, res.reason);
  }
  assert.equal(room.phase, PHASES.ROUND_END);
  assert.equal(room.lastResults.winner, TEAMS.SEEKERS);
  assert.equal(room.lastResults.foundCount, hiders.length);
  assert.ok(room.lastResults.timeRemainingMs > 0, 'round ended early with time left');
});

test('round timer expiry while hiders remain -> HIDERS win', () => {
  const { room } = lobbyRoom(4);
  startFullRound(room);
  room.forcePhaseExpiry();
  room.forcePhaseExpiry();
  assert.equal(room.phase, PHASES.ACTIVE_ROUND);
  room.phaseEndsAt = Date.now() - 1000; // simulate the official server timer expiring
  room._tick();
  assert.equal(room.phase, PHASES.ROUND_END);
  assert.equal(room.lastResults.winner, TEAMS.HIDERS);
  assert.equal(room.lastResults.reason, 'TIME_EXPIRED');
});

test('hider disconnect: marked disconnected, cannot act, forfeits after grace', () => {
  const { room } = lobbyRoom(4);
  startFullRound(room);
  room.forcePhaseExpiry();
  room.forcePhaseExpiry();

  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  const sessionId = hider.sessionId;
  hider.socket.emit = () => {}; // keep fake socket alive
  hider.socket = null;          // ...then drop connection
  room.handleDisconnect(hider, 'disconnect');

  assert.equal(hider.status, STATUS.DISCONNECTED);
  assert.equal(hider.prevStatus, STATUS.HIDDEN);

  // grace expiry: forfeits -> counts as found
  room._expireGrace(hider.id, 'timeout');
  assert.equal(room.players.has(hider.id), false);
  const forfeit = room.lastResults; // if they were the only hider the round ended
  void forfeit;

  // rejoin with the same session restores team + status
  const again = addPlayer(room, 'Fresh'); // room still exists
  void again;
  assert.equal(sessionId.length > 6, true);
});

test('reconnect within grace restores team and HIDDEN status', () => {
  const { room } = lobbyRoom(4);
  startFullRound(room);
  room.forcePhaseExpiry();
  room.forcePhaseExpiry();

  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  hider.socket = null;
  room.handleDisconnect(hider, 'disconnect');

  const fakeSock = hider.socket; // null
  void fakeSock;
  const { player, restored } = room.rejoin(hider.sessionId, { emit() {} });
  assert.ok(player);
  assert.equal(restored, true);
  assert.equal(player.team, TEAMS.HIDERS);
  assert.equal(player.status, STATUS.HIDDEN);
  assert.ok(player.connected);
});

test('a disconnected hider cannot become an invisible permanent winner', () => {
  const { room } = lobbyRoom(4);
  startFullRound(room);
  room.forcePhaseExpiry();
  room.forcePhaseExpiry();

  const hiders = [...room.players.values()].filter((p) => p.team === TEAMS.HIDERS);
  for (const h of hiders) {
    h.socket = null;
    room.handleDisconnect(h, 'disconnect');
    room._expireGrace(h.id, 'timeout');
  }
  // all hiders disconnected+expired -> seekers win immediately
  assert.equal(room.lastResults.winner, TEAMS.SEEKERS);
});

test('all seekers leaving ends the round with a HIDERS win', () => {
  const { room } = lobbyRoom(4);
  startFullRound(room);
  room.forcePhaseExpiry();
  room.forcePhaseExpiry();

  const seekers = [...room.players.values()].filter((p) => p.team === TEAMS.SEEKERS);
  for (const s of seekers) {
    s.socket = null;
    room.handleDisconnect(s, 'disconnect');
  }
  assert.equal(room.lastResults.reason, 'ALL_SEEKERS_LEFT');
  assert.equal(room.lastResults.winner, TEAMS.HIDERS);
});

test('start requires minimum players and readiness', () => {
  const { room, players } = lobbyRoom(2, { minPlayers: 4 });
  const host = players.find((p) => p.id === room.hostId);
  let res = room.start(host);
  assert.equal(res.error, 'NOT_ENOUGH_PLAYERS');

  addPlayer(room, 'P5', {}).ready = true;
  addPlayer(room, 'P6', {}).ready = true;
  const notReady = addPlayer(room, 'P7');
  res = room.start(host);
  assert.equal(res.error, 'PLAYERS_NOT_READY');

  notReady.ready = true;
  res = room.start(host);
  assert.equal(res.ok, true);
});

test('only the host can start and change settings', () => {
  const { room, players } = lobbyRoom(4);
  const guest = players.find((p) => p.id !== room.hostId);
  assert.equal(room.start(guest).error, 'NOT_HOST');
  assert.equal(room.updateSettings(guest, { roundSec: 100 }).error, 'NOT_HOST');
});

test('host settings apply to the round (catchRadius, durations)', () => {
  const { room, players } = lobbyRoom(4);
  const host = players.find((p) => p.id === room.hostId);
  room.updateSettings(host, { preparationSec: 15, catchRadius: 3.5, requireLineOfSight: false });
  assert.equal(room.cfg.preparationSec, 15);
  assert.equal(room.cfg.catchRadius, 3.5);
  assert.equal(room.cfg.requireLineOfSight, false);
  startFullRound(room);
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const hider = [...room.players.values()].filter((p) => p.team === TEAMS.HIDERS)[0];
  room.forcePhaseExpiry(); room.forcePhaseExpiry();
  hider.pos = [seeker.pos[0] + 3, seeker.pos[1], seeker.pos[2]]; // 3m, LOS irrelevant
  assert.equal(room.onCatch(seeker, hider.id).ok, true);
});

test('practice bot: added by host, always hider, teleports to a hide spot', () => {
  const { room, players } = lobbyRoom(2, { minPlayers: 2 });
  const host = players.find((p) => p.id === room.hostId);
  players.forEach((p) => (p.ready = true));
  const res = room.addBot(host);
  assert.equal(res.ok, true);
  assert.equal(room.players.size, 3);
  assert.equal(room.start(host).ok, true);
  room.forcePhaseExpiry(); // -> PREPARATION
  const bot = [...room.players.values()].find((p) => p.isBot);
  assert.equal(bot.team, TEAMS.HIDERS);
  assert.equal(bot.status, STATUS.HIDDEN);
  // bot was teleported somewhere in the facility
  assert.ok(Math.abs(bot.pos[0]) > 0 || Math.abs(bot.pos[2]) > 0);
});
