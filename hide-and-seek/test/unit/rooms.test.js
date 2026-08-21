// ============================================================================
// Room lifecycle tests: create/join by code, invalid + duplicate codes, full
// rooms, host migration, idle cleanup.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../server/rooms.js';
import { addPlayer, fakeSocket, STATUS } from '../helpers.js';

function mgr() {
  return new RoomManager({ log: () => {} });
}

test('create room returns a unique 6-char code', () => {
  const m = mgr();
  const { room } = m.create();
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const { room: room2 } = m.create();
  assert.notEqual(room.code, room2.code);
});

test('join with a valid code returns the room', () => {
  const m = mgr();
  const { room } = m.create();
  assert.equal(m.join(room.code).room, room);
});

test('join with an invalid code fails', () => {
  const m = mgr();
  assert.equal(m.join('ZZZZZZ').error, 'INVALID_CODE');
  assert.equal(m.join('').error, 'INVALID_CODE');
  assert.equal(m.join(undefined).error, 'INVALID_CODE');
  // case-insensitive + trims
  const { room } = m.create();
  assert.equal(m.join(room.code.toLowerCase()).room, room);
});

test('room fills to maxPlayers and rejects beyond', () => {
  const m = mgr();
  const { room } = m.create();
  for (let i = 0; i < room.cfg.maxPlayers; i++) {
    const p = addPlayer(room, `P${i}`);
    assert.ok(p);
  }
  assert.equal(room.players.size, room.cfg.maxPlayers);
  assert.equal(room.addPlayer('Overflow', fakeSocket()).error, 'FULL');
});

test('duplicate names get a suffix', () => {
  const m = mgr();
  const { room } = m.create();
  const p1 = room.addPlayer('Alex', fakeSocket()).player;
  const p2 = room.addPlayer('Alex', fakeSocket()).player;
  assert.equal(p1.name, 'Alex');
  assert.notEqual(p2.name, 'Alex');
  assert.match(p2.name, /^Alex \d+$/);
});

test('empty room is disposed after idle timeout', async () => {
  const m = mgr();
  const { room } = m.create({ roomIdleSec: 1 });
  room.roomSettings = { roomIdleSec: 1 };
  const p = addPlayer(room, 'Solo');
  p.socket = null;
  room.handleDisconnect(p, 'left');
  room._expireGrace(p.id, 'left'); // simulate grace expiry -> room becomes empty
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(m.rooms.has(room.code), false);
});

test('host migrates when the host leaves', () => {
  const m = mgr();
  const { room } = m.create();
  const host = addPlayer(room, 'Host');
  const guest = addPlayer(room, 'Guest');
  assert.equal(room.hostId, host.id);
  room.handleDisconnect(host, 'left');
  room._expireGrace(host.id, 'left');
  assert.equal(room.hostId, guest.id);
});

test('manager stats', () => {
  const m = mgr();
  const { room } = m.create();
  addPlayer(room, 'A');
  assert.deepEqual(m.stats(), { rooms: 1, players: 1 });
});
