// ============================================================================
// Regression tests for BUG 4 — "Host/admin cannot REMOVE players or bots."
//
// Covers the permission model (host-only, server-validated), the effect on an
// in-flight round, and the reconnect-grace hole a naive kick would leave open.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS } from '../../shared/constants.js';
import {
  mkRoom, addPlayer, activeRoundRoom, lastSent, PHASES, TEAMS, STATUS,
} from '../helpers.js';

function lobbyRoom() {
  const room = mkRoom({ minPlayers: 2 });
  const host = addPlayer(room, 'Host');
  const guest = addPlayer(room, 'Guest');
  const other = addPlayer(room, 'Other');
  return { room, host, guest, other };
}

// ------------------------------------------------------------- permissions --

test('the host can kick another player', () => {
  const { room, host, guest } = lobbyRoom();
  const res = room.kick(host, guest.id);
  assert.equal(res.ok, true);
  assert.equal(room.players.has(guest.id), false);
  assert.equal(room.players.size, 2);
});

test('a non-host CANNOT kick anyone', () => {
  const { room, guest, other } = lobbyRoom();
  const res = room.kick(guest, other.id);
  assert.equal(res.error, 'NOT_HOST');
  assert.equal(room.players.has(other.id), true, 'target must still be in the room');
});

test('a non-host cannot kick the host', () => {
  const { room, host, guest } = lobbyRoom();
  assert.equal(room.kick(guest, host.id).error, 'NOT_HOST');
  assert.equal(room.players.has(host.id), true);
});

test('the host cannot kick themselves', () => {
  const { room, host } = lobbyRoom();
  assert.equal(room.kick(host, host.id).error, 'CANNOT_KICK_HOST');
  assert.equal(room.players.has(host.id), true);
});

test('kicking an unknown / already-gone player is refused, not a crash', () => {
  const { room, host } = lobbyRoom();
  assert.equal(room.kick(host, 'p-nope').error, 'NO_TARGET');
  assert.equal(room.kick(host, undefined).error, 'NO_TARGET');
  assert.equal(room.kick(host, '').error, 'NO_TARGET');
});

// ------------------------------------------------------------- the effects --

test('a kicked player is told why, and only they are told', () => {
  const { room, host, guest, other } = lobbyRoom();
  // kick() detaches the socket once the message is flushed, so grab it first
  const guestSock = guest.socket;
  room.kick(host, guest.id);
  const msg = [...guestSock.sent].reverse().find((m) => m.event === EVENTS.ROOM_KICKED)?.payload;
  assert.ok(msg, 'kicked player must receive room:kicked');
  assert.equal(msg.by, 'Host');
  assert.equal(lastSent(other, EVENTS.ROOM_KICKED), null, 'bystanders must not get room:kicked');
});

test('a kicked player cannot rejoin with their stored session id', () => {
  const { room, host, guest } = lobbyRoom();
  const sessionId = guest.sessionId;
  room.kick(host, guest.id);
  const res = room.rejoin(sessionId, { emit() {}, disconnect() {} });
  assert.equal(res.error, 'SESSION_NOT_FOUND');
});

test('the rest of the room is told the player list changed', () => {
  const { room, host, guest, other } = lobbyRoom();
  room.kick(host, guest.id);
  const state = lastSent(other, EVENTS.ROOM_STATE);
  assert.ok(state);
  assert.equal(state.players.some((p) => p.id === guest.id), false);
  const feed = lastSent(other, EVENTS.GAME_FEED);
  assert.match(feed.text, /removed by the host/i);
});

test('kicking the last hidden hider mid-round ends the round for the seekers', () => {
  const room = activeRoundRoom({
    seekers: [['Seek', [10, 0, 10]]],
    hiders: [['Hide', [30, 0, 30]]],
  });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  room.hostId = seeker.id;
  assert.equal(room.phase, PHASES.ACTIVE_ROUND);

  room.kick(seeker, hider.id);

  assert.equal(room.phase, PHASES.ROUND_END, 'round must not hang with zero hiders');
  assert.equal(room.lastResults.winner, TEAMS.SEEKERS);
});

test('kicking one of several hiders leaves the round running', () => {
  const room = activeRoundRoom({
    seekers: [['Seek', [10, 0, 10]]],
    hiders: [['H1', [30, 0, 30]], ['H2', [34, 0, 30]]],
  });
  const seeker = [...room.players.values()].find((p) => p.team === TEAMS.SEEKERS);
  const h1 = [...room.players.values()].find((p) => p.name === 'H1');
  room.hostId = seeker.id;
  room.kick(seeker, h1.id);
  assert.equal(room.phase, PHASES.ACTIVE_ROUND);
  assert.equal(room.hiddenHiders().length, 1);
});

// ------------------------------------------------------------------- bots ---

test('the host can add and then remove a bot', () => {
  const { room, host } = lobbyRoom();
  const { botId } = room.addBot(host);
  assert.ok(botId);
  assert.equal(room.players.has(botId), true);
  const res = room.removeBot(host, botId);
  assert.equal(res.ok, true);
  assert.equal(room.players.has(botId), false);
});

test('removeBot with no id removes the most recently added bot', () => {
  const { room, host } = lobbyRoom();
  const a = room.addBot(host).botId;
  const b = room.addBot(host).botId;
  const res = room.removeBot(host, null);
  assert.equal(res.ok, true);
  assert.equal(res.botId, b, 'should remove the newest bot');
  assert.equal(room.players.has(a), true);
});

test('a non-host cannot add or remove bots', () => {
  const { room, host, guest } = lobbyRoom();
  const { botId } = room.addBot(host);
  assert.equal(room.addBot(guest).error, 'NOT_HOST');
  assert.equal(room.removeBot(guest, botId).error, 'NOT_HOST');
  assert.equal(room.players.has(botId), true);
});

test('removeBot refuses to remove a human', () => {
  const { room, host, guest } = lobbyRoom();
  assert.equal(room.removeBot(host, guest.id).error, 'NOT_BOT');
  assert.equal(room.players.has(guest.id), true);
});

test('removeBot with no bots present is refused cleanly', () => {
  const { room, host } = lobbyRoom();
  assert.equal(room.removeBot(host, null).error, 'NOT_BOT');
});

test('kick() routes bots through removeBot (so the ✕ button works on bot rows)', () => {
  const { room, host } = lobbyRoom();
  const { botId } = room.addBot(host);
  const res = room.kick(host, botId);
  assert.equal(res.ok, true);
  assert.equal(room.players.has(botId), false);
});

test('bots can only be added/removed in the lobby', () => {
  const room = activeRoundRoom({
    seekers: [['Seek', [10, 0, 10]]],
    hiders: [['Hide', [30, 0, 30]]],
  });
  const host = [...room.players.values()][0];
  room.hostId = host.id;
  assert.equal(room.addBot(host).error, 'NOT_IN_LOBBY');
  assert.equal(room.removeBot(host, null).error, 'NOT_IN_LOBBY');
});

// -------------------------------------------------------- host after kick ---

test('kicking does not disturb who the host is', () => {
  const { room, host, guest } = lobbyRoom();
  room.kick(host, guest.id);
  assert.equal(room.hostId, host.id);
});

test('a kicked disconnected player releases its grace slot immediately', () => {
  const { room, host, guest } = lobbyRoom();
  room.handleDisconnect(guest, 'disconnect');
  assert.equal(room._graceTimers.has(guest.id), true);
  room.kick(host, guest.id);
  assert.equal(room._graceTimers.has(guest.id), false, 'grace timer must be cleared');
  assert.equal(room.players.has(guest.id), false);
});

test('REGRESSION: an explicit LEAVE frees the slot and the host crown at once', () => {
  const { room, host, guest } = lobbyRoom();
  assert.equal(room.hostId, host.id);
  // pressing LEAVE is a decision, not a network blip — it used to sit on a
  // 15 s grace timer, so the crown stayed with a player who had already gone
  room.handleDisconnect(host, 'left');
  assert.equal(room.players.has(host.id), false, 'the leaver must be removed immediately');
  assert.equal(room.hostId, guest.id, 'the host crown must migrate immediately');
});

test('a network DROP still keeps the slot for the grace period', () => {
  const { room, host, guest } = lobbyRoom();
  room.handleDisconnect(guest, 'disconnect');
  assert.equal(room.players.has(guest.id), true, 'a dropped player keeps their slot');
  assert.equal(room._graceTimers.has(guest.id), true);
  assert.equal(room.hostId, host.id);
});

test('a dropped player can rejoin within the grace period', () => {
  const { room, guest } = lobbyRoom();
  const sessionId = guest.sessionId;
  room.handleDisconnect(guest, 'disconnect');
  const res = room.rejoin(sessionId, { emit() {}, disconnect() {} });
  assert.equal(res.error, undefined);
  assert.equal(res.player.id, guest.id);
});

test('a hidden hider who explicitly leaves forfeits so the round can end', () => {
  const room = activeRoundRoom({
    seekers: [['Seek', [10, 0, 10]]],
    hiders: [['Hide', [30, 0, 30]]],
  });
  const hider = [...room.players.values()].find((p) => p.team === TEAMS.HIDERS);
  room.handleDisconnect(hider, 'left');
  assert.equal(room.phase, PHASES.ROUND_END, 'the round must not hang');
  assert.equal(room.lastResults.winner, TEAMS.SEEKERS);
});

test('the room stays consistent when every non-host player is kicked', () => {

  const { room, host, guest, other } = lobbyRoom();
  room.kick(host, guest.id);
  room.kick(host, other.id);
  assert.equal(room.players.size, 1);
  assert.equal(room.hostId, host.id);
  assert.equal(room.phase, PHASES.LOBBY);
  assert.equal(room.canStart().error, 'NOT_ENOUGH_PLAYERS');
});

// keep the STATUS import meaningful for future assertions
void STATUS;
