// ============================================================================
// Voice channel tests: team isolation, membership, talk/mute propagation.
// A seeker must NEVER end up in the hiders' voice channel.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceManager } from '../../server/voice.js';
import { mkRoom, addPlayer, TEAMS, STATUS, PHASES, lastSent } from '../helpers.js';

function voiceRoom() {
  const room = mkRoom();
  room.roundNumber = 1;
  const seekerA = addPlayer(room, 'SeekerA', { team: TEAMS.SEEKERS, status: STATUS.ACTIVE, pos: [21, 0, 11.5] });
  const seekerB = addPlayer(room, 'SeekerB', { team: TEAMS.SEEKERS, status: STATUS.ACTIVE, pos: [22, 0, 11.5] });
  const hiderA = addPlayer(room, 'HiderA', { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos: [50, 0, 36] });
  const hiderB = addPlayer(room, 'HiderB', { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos: [8, 0, 36] });
  room.setPhase(PHASES.ACTIVE_ROUND, 99999);
  room.voice.setChannel(seekerA, TEAMS.SEEKERS);
  room.voice.setChannel(seekerB, TEAMS.SEEKERS);
  room.voice.setChannel(hiderA, TEAMS.HIDERS);
  room.voice.setChannel(hiderB, TEAMS.HIDERS);
  return { room, seekerA, seekerB, hiderA, hiderB };
}

test('channel membership is per-team', () => {
  const { room, seekerA, hiderA } = voiceRoom();
  const seekers = room.voice.channelMembers(TEAMS.SEEKERS).map((p) => p.name);
  const hiders = room.voice.channelMembers(TEAMS.HIDERS).map((p) => p.name);
  assert.deepEqual(seekers.sort(), ['SeekerA', 'SeekerB']);
  assert.deepEqual(hiders.sort(), ['HiderA', 'HiderB']);
  assert.equal(seekerA.voiceChannel, TEAMS.SEEKERS);
  assert.equal(hiderA.voiceChannel, TEAMS.HIDERS);
});

test('signaling across teams is rejected (cross-team voice impossible)', () => {
  const { room, seekerA, hiderA } = voiceRoom();
  assert.equal(room.voice.relaySignal(seekerA, hiderA.id, { sdp: 'fake' }), false);
  assert.equal(room.voice.relaySignal(hiderA, seekerA.id, { sdp: 'fake' }), false);
  assert.equal(lastSent(hiderA, 'voice:signal'), null);
});

test('signaling within a team is relayed', () => {
  const { room, seekerA, seekerB } = voiceRoom();
  assert.equal(room.voice.relaySignal(seekerA, seekerB.id, { sdp: 'offer' }), true);
  const msg = lastSent(seekerB, 'voice:signal');
  assert.equal(msg.from, seekerA.id);
  assert.deepEqual(msg.data, { sdp: 'offer' });
});

test('talk events go only to the same channel', () => {
  const { room, seekerA, seekerB, hiderA } = voiceRoom();
  room.voice.setTalking(seekerA, true);
  const gotIt = lastSent(seekerB, 'voice:talk');
  assert.deepEqual(gotIt, { id: seekerA.id, talking: true });
  assert.equal(lastSent(hiderA, 'voice:talk'), null);
});

test('mute state is broadcast within the channel', () => {
  const { room, hiderA, hiderB, seekerA } = voiceRoom();
  room.voice.setMuted(hiderA, true);
  assert.deepEqual(lastSent(hiderB, 'voice:muted'), { id: hiderA.id, muted: true });
  assert.equal(lastSent(seekerA, 'voice:muted'), null);
});

test('members list sent to each member excludes other teams', () => {
  const { room, hiderB } = voiceRoom();
  room.voice.publishMembers(TEAMS.HIDERS);
  const msg = lastSent(hiderB, 'voice:members');
  assert.deepEqual(msg.channel, TEAMS.HIDERS);
  assert.equal(msg.members.length, 2);
  assert.ok(msg.members.every((m) => m.name.startsWith('Hider')));
});

test('bots are never in voice channels', () => {
  const { room } = voiceRoom();
  const bot = addPlayer(room, 'BOT Hider 1', { isBot: true, team: TEAMS.HIDERS, status: STATUS.HIDDEN });
  room.voice.setChannel(bot, TEAMS.HIDERS);
  assert.equal(room.voice.channelMembers(TEAMS.HIDERS).length, 2); // unchanged
});
