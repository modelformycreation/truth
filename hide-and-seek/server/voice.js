// ============================================================================
// server/voice.js — team voice channel management + WebRTC signaling relay.
//
// The server owns channel assignment (players cannot choose their channel)
// and only relays WebRTC signaling payloads between members of the SAME
// channel. Cross-team signaling is rejected, which makes cross-team voice
// impossible by construction. The actual audio flows peer-to-peer (WebRTC
// mesh) — see client/js/voice/. Swapping in LiveKit/Photon Voice later only
// requires replacing the client provider + this relay.
// ============================================================================

import { EVENTS } from '../shared/constants.js';

export class VoiceManager {
  constructor(room) {
    this.room = room;
  }

  /** Assign a player to a channel ('lobby' | 'HIDERS' | 'SEEKERS' | null). */
  setChannel(player, channel) {
    if (player.voiceChannel === channel) return;
    const prev = player.voiceChannel;
    player.voiceChannel = channel;
    player.send(EVENTS.VOICE_CHANNEL, { channel, prev });
    if (prev) this.publishMembers(prev);
    if (channel) this.publishMembers(channel);
  }

  dropPlayer(player) {
    const prev = player.voiceChannel;
    player.voiceChannel = null;
    if (prev) this.publishMembers(prev);
  }

  /** Relay a WebRTC signaling message. Returns false if rejected. */
  relaySignal(from, toId, data) {
    if (!from.voiceChannel) return false;
    const to = this.room.players.get(toId);
    if (!to || !to.connected) return false;
    if (to.voiceChannel !== from.voiceChannel) return false; // cross-team isolation
    if (data && typeof data === 'object' && JSON.stringify(data).length > 64 * 1024) return false;
    to.send(EVENTS.VOICE_SIGNAL, { from: from.id, data });
    return true;
  }

  setTalking(player, talking) {
    player.talking = !!talking;
    this.broadcastToChannel(player, EVENTS.VOICE_TALK, { id: player.id, talking: player.talking });
  }

  setMuted(player, muted) {
    player.muted = !!muted;
    this.broadcastToChannel(player, EVENTS.VOICE_MUTED, { id: player.id, muted: player.muted });
  }

  broadcastToChannel(player, event, payload) {
    if (!player.voiceChannel) return;
    for (const p of this.channelMembers(player.voiceChannel)) {
      if (p.id !== player.id) p.send(event, payload);
    }
  }

  channelMembers(channel) {
    const members = [];
    for (const p of this.room.players.values()) {
      if (p.voiceChannel === channel && p.connected && !p.isBot) members.push(p);
    }
    return members;
  }

  publishMembers(channel) {
    const members = this.channelMembers(channel).map((p) => ({
      id: p.id,
      name: p.name,
      muted: p.muted,
      talking: p.talking,
    }));
    for (const p of this.channelMembers(channel)) {
      p.send(EVENTS.VOICE_MEMBERS, { channel, members });
    }
  }

  publishAll() {
    const channels = new Set();
    for (const p of this.room.players.values()) if (p.voiceChannel) channels.add(p.voiceChannel);
    for (const c of channels) this.publishMembers(c);
  }
}
