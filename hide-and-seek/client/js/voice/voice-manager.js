// ============================================================================
// client/js/voice/voice-manager.js — provider-agnostic voice coordinator.
//
// The rest of the game only talks to THIS file. It:
//   * requests the mic once (user gesture) and remembers the permission state
//   * follows the server's channel assignment (voice:channel / voice:members)
//   * relays signaling through the server (which enforces team isolation)
//   * exposes a tap-to-toggle mic on/off (Feature 2), mute, and indicators
//
// Swapping providers: implement the same surface as WebRtcMeshProvider
// (acquireMic, joinChannel, leave, handleSignal, setTransmitting, setMuted,
// setVolume, dispose, sendSignal hook) — e.g. a LiveKitProvider that joins a
// server-issued token instead of meshing. Nothing else changes.
// ============================================================================

import { EVENTS } from '../../../shared/constants.js';
import { WebRtcMeshProvider } from './webrtc-mesh.js';

export class VoiceManager {
  constructor(net, bus, store) {
    this.net = net;
    this.bus = bus;
    this.store = store;
    this.enabled = true;
    this.channel = null;
    this.members = [];            // [{id,name,muted,talking}]
    this.muted = false;           // MIC off (others cannot hear me)
    this.deafened = false;        // SPEAKER muted (I cannot hear others)
    this.micOn = false;           // microphone acquired & active
    this.provider = null;
    this.selfId = null;
    this.selfTalking = false;
    this.stunUrls = 'stun:stun.l.google.com:19302';
    this.iceServers = null;       // Feature 1: STUN + TURN list from /api/config
    this.peerVolumes = {};        // playerId -> 0..1
    this.status = 'off';          // off | requesting | ready | error
    this.errorMsg = null;
    this.iceState = 'new';        // Feature 1: 'new'|'connecting'|'connected'|'failed'

    net.bus.on(`net:${EVENTS.VOICE_CHANNEL}`, ({ channel }) => this._onChannel(channel));
    net.bus.on(`net:${EVENTS.VOICE_MEMBERS}`, ({ channel, members }) => this._onMembers(channel, members));
    net.bus.on(`net:${EVENTS.VOICE_SIGNAL}`, ({ from, data }) => {
      this.provider?.handleSignal(from, data);
    });
    net.bus.on(`net:${EVENTS.VOICE_TALK}`, ({ id, talking }) => {
      this._setMemberTalking(id, talking);
    });
    net.bus.on(`net:${EVENTS.VOICE_MUTED}`, ({ id, muted }) => {
      const m = this.members.find((x) => x.id === id);
      if (m) m.muted = muted;
      this._emitState();
    });
  }

  _ensureProvider() {
    if (this.provider) return this.provider;
    this.provider = new WebRtcMeshProvider({
      selfId: this.selfId,
      stunUrls: this.stunUrls,
      iceServers: this.iceServers || undefined,
      onSpeaking: (id, talking) => {
        // Our OWN speaking indicator comes from the local analyser — the server
        // deliberately does not echo our talk state back to us, so without this
        // the local player's chip never lit up.
        if (id === this.selfId) {
          if (this.selfTalking === talking) return;
          this.selfTalking = talking;
          this._setMemberTalking(id, talking);
          return;
        }
        this._setMemberTalking(id, talking);
      },
      onError: (msg) => {
        this.status = this.provider?.hasMic() ? 'ready' : 'error';
        this.errorMsg = msg;
        this._emitState();
      },
      onIceState: (state) => {
        this.iceState = state;
        this._emitState();
      },
    });
    this.provider.sendSignal = (to, data) => {
      this.net.send(EVENTS.VOICE_SIGNAL, { to, data });
    };
    this.provider.setDeafened(this.deafened);
    return this.provider;
  }

  /** Called from a button press (needs a user gesture for getUserMedia). */
  async enableMic() {
    this.status = 'requesting';
    this.errorMsg = null;
    this._emitState();
    const p = this._ensureProvider();
    const ok = await p.acquireMic();
    this.micOn = ok;
    this.status = ok ? 'ready' : 'error';
    if (ok) {
      p.setMuted(this.muted);
      this._applyTransmit();
    }
    this._emitState();
    if (ok && this.channel) this._rejoin();
    return ok;
  }

  /** Hard mic OFF: release the device (browser recording indicator goes away). */
  disableMic() {
    this.provider?.releaseMic();
    this.micOn = false;
    this.selfTalking = false;
    this.status = 'off';
    this._setMemberTalking(this.selfId, false);
    this.net.send(EVENTS.VOICE_TALK, { talking: false });
    this._emitState();
  }

  /**
   * One-button MIC ON/OFF (Feature 2 — no push-to-talk, no hold).
   * Tap → mic on (talking); tap again → mic off. Works in the lobby and in
   * game, on mobile (tap) and laptop (click). Returns the new micOn state.
   */
  async toggleMic() {
    if (this.micOn) { this.disableMic(); return false; }
    const ok = await this.enableMic();
    if (ok) this.setMuted(false);
    return this.micOn;
  }

  /** Mute the MICROPHONE (others stop hearing me). */
  setMuted(muted) {
    this.muted = !!muted;
    this.net.send(EVENTS.VOICE_MUTED, { muted: this.muted });
    this.provider?.setMuted(this.muted);
    this._applyTransmit();
    this._emitState();
  }

  /** Mute the SPEAKER (I stop hearing everyone else). Independent of the mic. */
  setDeafened(deafened) {
    this.deafened = !!deafened;
    this.provider?.setDeafened(this.deafened);
    this._emitState();
  }

  /**
   * With the tap on/off mic (Feature 2) there is no push-to-talk gate: when
   * the mic is ON the track is live; MUTE is the only thing that closes it.
   */
  _applyTransmit() {
    if (!this.provider) return;
    const transmitting = !this.muted;
    this.provider.setTransmitting(transmitting);
    const talking = transmitting && this.provider.hasMic();
    this.net.send(EVENTS.VOICE_TALK, { talking });
    // reflect immediately in our own UI; the analyser refines it once audio flows
    if (!talking && this.selfTalking) {
      this.selfTalking = false;
      this._setMemberTalking(this.selfId, false);
    }
  }

  setVolume(v) { this.provider?.setVolume(v); }

  /** Per-player output volume, persisted by the caller. */
  setPeerVolume(id, v) {
    this.peerVolumes[id] = v;
    this.provider?.setPeerVolume(id, v);
    this._emitState();
  }

  setStun(urls) { this.stunUrls = urls || this.stunUrls; }

  /** Feature 1: the full ICE server list (STUN + TURN) served by the server. */
  setIceServers(servers) {
    this.iceServers = Array.isArray(servers) && servers.length ? servers : null;
    if (this.provider) {
      this.provider.iceServers = this.iceServers;
      // newly-configured TURN only helps peers we build from now on
      this.provider.iceServers && this.channel && this._rejoin();
    }
  }
  setSelfId(id) {
    this.selfId = id;
    if (this.provider) this.provider.selfId = id;
    // we may have had to defer joining until our id arrived — do it now
    if (id && this.channel) this._rejoin();
  }
  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.provider?.leave(); this.channel = null; this.members = []; this._emitState(); }
  }

  _onChannel(channel) {
    this.channel = channel;
    if (!this.enabled) return;
    // Join even WITHOUT a mic: listeners must still receive teammates' audio.
    // (The old code required hasMic(), so anyone who declined the mic prompt
    // was silently cut out of voice entirely.)
    if (channel) this._ensureProvider() && this._rejoin();
    else this.provider?.leave();
    this._emitState();
  }

  _rejoin() {
    // Never build the mesh before we know our OWN id: joinChannel() filters
    // self out of the member list by id, so joining early creates a bogus
    // peer connection to ourselves. The server emits voice:channel *before*
    // the room:create/join ack that carries our id, so this really happens.
    if (!this.provider || !this.channel || !this.selfId) return;
    this.provider.joinChannel(this.channel, this.members);
    this._applyTransmit();
  }

  _onMembers(channel, members) {
    if (channel !== this.channel) return;
    const prev = this.members;
    this.members = members.map((m) => ({
      ...m,
      // our own talk state is locally owned (the server never echoes it back)
      talking: m.id === this.selfId
        ? this.selfTalking
        : (prev.find((p) => p.id === m.id)?.talking ?? m.talking),
      volume: this.peerVolumes[m.id] ?? 1,
      self: m.id === this.selfId,
    }));
    if (this.provider) {
      if (this.provider.hasMic() || this.channel) this._rejoin();
      for (const [id, v] of Object.entries(this.peerVolumes)) this.provider.setPeerVolume(id, v);
    }
    this._emitState();
  }

  _setMemberTalking(id, talking) {
    const m = this.members.find((x) => x.id === id);
    if (m) m.talking = !!talking;
    if (id === this.selfId) this.selfTalking = !!talking;
    this._emitState();
  }

  _emitState() {
    this.bus.emit('voice:state', {
      status: this.status,
      errorMsg: this.errorMsg,
      channel: this.channel,
      members: this.members,
      muted: this.muted,
      deafened: this.deafened,
      micOn: this.micOn,
      selfTalking: this.selfTalking,
      hasMic: !!this.provider?.hasMic(),
      transmitting: !!this.provider?.transmitting,
      iceState: this.iceState,
    });
  }

  async dispose() { await this.provider?.dispose(); }
}
