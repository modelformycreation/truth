// ============================================================================
// Regression tests — Feature 5: text chat (server-relayed, team-split).
//
//   • LOBBY chat: everyone in the room can chat freely.
//   • IN-GAME chat: TEAM-ONLY (Hiders channel / Seekers channel) — mirrors the
//     voice channels, so you cannot leak a hider's position to the enemy.
//   • Server enforces the message-length cap and the per-player rate limit
//     (the rate limit lives in the socket layer; the length cap is tested here).
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkRoom, addPlayer, activeRoundRoom } from '../helpers.js';
import { EVENTS, PHASES, TEAMS } from '../../shared/constants.js';

function msgs(player) {
  return player.socket.sent.filter((s) => s.event === EVENTS.CHAT_RECV).map((s) => s.payload);
}

test('LOBBY chat reaches everyone in the room (free chat)', () => {
  const room = mkRoom();
  const ann = addPlayer(room, 'Ann');
  const bob = addPlayer(room, 'Bob');
  room.sendChat(ann, 'hey everyone');
  const b = msgs(bob);
  assert.equal(b.length, 1);
  assert.equal(b[0].text, 'hey everyone');
  assert.equal(b[0].name, 'Ann');
  assert.equal(b[0].channel, 'lobby');
  // Ann (the sender) also receives her own message so her UI is in sync
  assert.equal(msgs(ann).length, 1);
});

test('IN-GAME chat is TEAM-ONLY: a hider cannot reach a seeker', () => {
  const room = activeRoundRoom({ seekers: [['Sara', [0, 0, 0]]], hiders: [['Harry', [0, 0, 2]]] });
  const [harry] = [...room.players.values()].filter((p) => p.team === TEAMS.HIDERS);
  const [sara] = [...room.players.values()].filter((p) => p.team === TEAMS.SEEKERS);
  room.sendChat(harry, 'im behind the crates');
  assert.equal(msgs(harry).length, 1, 'hider sees own message');
  assert.equal(msgs(harry)[0].channel, TEAMS.HIDERS);
  assert.equal(msgs(sara).length, 0, 'the SEEKER must NOT see the hider message');
});

test('in-round team chat still reaches the same team', () => {
  const room = activeRoundRoom({ seekers: [['S1', [0, 0, 0]], ['S2', [1, 0, 0]]], hiders: [['H1', [0, 0, 2]]] });
  const s2 = [...room.players.values()].find((p) => p.name === 'S2');
  const s1 = [...room.players.values()].find((p) => p.name === 'S1');
  room.sendChat(s1, 'flank left');
  assert.equal(msgs(s2).length, 1);
  assert.equal(msgs(s2)[0].channel, TEAMS.SEEKERS);
});

test('empty and whitespace-only messages are dropped', () => {
  const room = mkRoom();
  const ann = addPlayer(room, 'Ann');
  room.sendChat(ann, '   ');
  room.sendChat(ann, '');
  room.sendChat(ann, null);
  assert.equal(msgs(ann).length, 0);
});

test('messages are truncated to the chatMaxLen cap', () => {
  const room = mkRoom();
  const ann = addPlayer(room, 'Ann');
  const long = 'x'.repeat(500);
  room.sendChat(ann, long);
  assert.equal(msgs(ann)[0].text.length, room.cfg.chatMaxLen);
  assert.ok(room.cfg.chatMaxLen <= 200);
});

test('chat does not require the round to be active (works from the lobby)', () => {
  const room = mkRoom();
  assert.equal(room.phase, PHASES.LOBBY);
  const ann = addPlayer(room, 'Ann');
  room.sendChat(ann, 'ready?');
  assert.equal(msgs(ann).length, 1);
});
