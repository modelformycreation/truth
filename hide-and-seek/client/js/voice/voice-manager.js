// ============================================================================
// client/js/voice/voice-manager.js — provider-agnostic voice coordinator.
//
// The rest of the game only talks to THIS file. It:
//   * requests the mic once (user gesture) and remembers the permission state
//   * follows the server's channel assignment (voice:channel / voice:members)
//   * relays signaling through the server (which enforces team isolation)
//   * exposes push-to-talk / open-mic / mute and speaking indicators
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
    this.pttActive = false;
    this.muted = false;
    this.micMode = 'ptt';
    this.provider = null;
    this.selfId = null;
    this.stunUrls = 'stun:stun.l.google.com:19302';
    this.status = 'off';          // off | requesting | ready | error
    this.errorMsg = null;

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
      onSpeaking: (id, talking) => {
        if (id === this.selfId) return; // server already broadcasts our talk state
      },
      onError: (msg) => {
        this.status = this.provider?.hasMic() ? 'ready' : 'error';
        this.errorMsg = msg;
        this._emitState();
      },
    });
    this.provider.sendSignal = (to, data) => {
      this.net.send(EVENTS.VOICE_SIGNAL, { to, data });
    };
    return this.provider;
  }

  /** Called from a button press (needs a user gesture for getUserMedia). */
  async enableMic() {
    this.status = 'requesting';
    this.errorMsg = null;
    this._emitState();
    const p = this._ensureProvider();
    const ok = await p.acquireMic();
    this.status = ok ? 'ready' : 'error';
    this._emitState();
    if (ok && this.channel) this._rejoin();
    return ok;
  }

  setMicMode(mode) {
    this.micMode = mode;
    if (mode === 'open') this.provider?.setTransmitting(!this.muted);
    else this._applyPtt();
  }

  setMuted(muted) {
    this.muted = muted;
    this.net.send(EVENTS.VOICE_MUTED, { muted });
    this.provider?.setMuted(muted);
    if (this.micMode === 'open') this.provider?.setTransmitting(!muted);
    else this._applyPtt();
    this._emitState();
  }

  /** Push-to-talk button/V-key state. */
  setPtt(active) {
    this.pttActive = active;
    this._applyPtt();
  }

  _applyPtt() {
    if (!this.provider) return;
    const transmitting = this.micMode === 'open' ? !this.muted : (this.pttActive && !this.muted);
    this.provider.setTransmitting(transmitting);
    this.net.send(EVENTS.VOICE_TALK, { talking: transmitting && this.provider.hasMic() });
  }

  setVolume(v) { this.provider?.setVolume(v); }

  setStun(urls) { this.stunUrls = urls || this.stunUrls; }
  setSelfId(id) { this.selfId = id; if (this.provider) this.provider.selfId = id; }
  setEnabled(on) {
    this.enabled = on;
    if (!on) { this.provider?.leave(); this.channel = null; this.members = []; this._emitState(); }
  }

  _onChannel(channel) {
    this.channel = channel;
    if (!this.enabled) return;
    if (channel && this.provider?.hasMic()) this._rejoin();
    else if (!channel) this.provider?.leave();
    this._emitState();
  }

  _rejoin() {
    if (!this.provider || !this.channel) return;
    this.provider.joinChannel(this.channel, this.members);
    this._applyPtt();
  }

  _onMembers(channel, members) {
    if (channel !== this.channel) return;
    const prev = this.members;
    this.members = members.map((m) => ({
      ...m,
      talking: m.id === this.selfId ? (prev.find((p) => p.id === m.id)?.talking ?? m.talking) : m.talking,
    }));
    if (this.provider?.hasMic()) this._rejoin();
    this._emitState();
  }

  _setMemberTalking(id, talking) {
    const m = this.members.find((x) => x.id === id);
    if (m) m.talking = talking;
    this._emitState();
  }

  _emitState() {
    this.bus.emit('voice:state', {
      status: this.status,
      errorMsg: this.errorMsg,
      channel: this.channel,
      members: this.members,
      muted: this.muted,
      pttActive: this.pttActive,
      micMode: this.micMode,
      hasMic: !!this.provider?.hasMic(),
    });
  }

  async dispose() { await this.provider?.dispose(); }
}
