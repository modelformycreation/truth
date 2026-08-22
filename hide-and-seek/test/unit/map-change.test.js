// ============================================================================
// Regression tests — change the MAP from the lobby (host only, LOBBY only).
//
// Feature request: after a round ends and everyone is back in the lobby, the
// host should be able to pick a different map for the next round without
// creating a new room. The server validates (host, phase, known map), swaps
// room.map / room.mapId, and broadcasts the new room state so every client
// rebuilds the world at start.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkRoom, addPlayer } from '../helpers.js';
import { EVENTS, PHASES, TEAMS } from '../../shared/constants.js';

test('host can change the map in the lobby', () => {
  const room = mkRoom();
  const host = addPlayer(room, 'Host');
  const res = room.setMap(host, 'docks');
  assert.equal(res.ok, true);
  assert.equal(res.mapId, 'docks');
  assert.equal(room.mapId, 'docks');
  assert.ok(room.map && room.map.id === 'docks', 'room.map must be re-resolved');
});

test('a NON-host cannot change the map', () => {
  const room = mkRoom();
  const host = addPlayer(room, 'Host');
  const guest = addPlayer(room, 'Guest');
  const res = room.setMap(guest, 'mall');
  assert.equal(res.error, 'NOT_HOST');
  assert.equal(room.mapId, 'facility');
  void host;
});

test('map cannot be changed outside the lobby', () => {
  const room = mkRoom();
  const host = addPlayer(room, 'Host', { team: TEAMS.SEEKERS, status: 'active' });
  room.setPhase(PHASES.ACTIVE_ROUND, 999);
  const res = room.setMap(host, 'mall');
  assert.equal(res.error, 'NOT_IN_LOBBY');
  assert.equal(room.mapId, 'facility');
});

test('an unknown map id is rejected', () => {
  const room = mkRoom();
  const host = addPlayer(room, 'Host');
  const res = room.setMap(host, 'nope');
  assert.equal(res.error, 'UNKNOWN_MAP');
  assert.equal(room.mapId, 'facility');
});

test('changing the map broadcasts room state with the new mapId', () => {
  const room = mkRoom();
  const host = addPlayer(room, 'Host');
  room.setMap(host, 'mall');
  const state = host.socket.sent.filter((s) => s.event === EVENTS.ROOM_STATE).pop();
  assert.equal(state.payload.mapId, 'mall');
  assert.equal(state.payload.mapName, room.map.name);
});
