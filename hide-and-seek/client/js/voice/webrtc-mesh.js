// ============================================================================
// client/js/voice/webrtc-mesh.js — default zero-cost voice provider.
//
// Real-time audio flows peer-to-peer over WebRTC (the same transport browsers
// use for calls); our Socket.IO connection is used only for signaling, and the
// SERVER decides who is in which channel (server/voice.js), so cross-team
// voice is impossible regardless of what a modified client tries.
//
// Mesh topology: every member of a channel connects to every other member —
// perfect for friend-sized teams (2–8 per side). For bigger rooms swap in an
// SFU provider (LiveKit / Photon Voice / Agora) behind the same interface
// (see client/js/voice/voice-manager.js and docs/FUTURE.md).
// ============================================================================

export class WebRtcMeshProvider {
  constructor({ selfId, onSpeaking, onError, stunUrls }) {
    this.selfId = selfId;
    this.onSpeaking = onSpeaking;   // (peerId, talking) — local analyser detection
    this.onError = onError;         // (message)
    this.stunUrls = stunUrls || 'stun:stun.l.google.com:19302';
    this.channel = null;
    this.localStream = null;
    this.peers = new Map();         // peerId -> { pc, audioEl, polite, makingOffer, ignoreOffer }
    this.volume = 1.0;
    this.sendSignal = null;         // (toPeerId, data) => void — set by VoiceManager
    this._analyser = null;
    this._micLevel = 0;
  }

  get name() { return 'webrtc-mesh'; }

  /** Ask for the microphone. Must be called from a user gesture. */
  async acquireMic() {
    if (this.localStream) return true;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      // start disabled for push-to-talk
      this.setTransmitting(false);
      this._setupLocalAnalyser();
      return true;
    } catch (err) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone permission denied — enable it in your browser settings.'
        : `Microphone unavailable (${err?.name || 'error'})`;
      this.onError?.(msg);
      return false;
    }
  }

  _setupLocalAnalyser() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(this.localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this._analyser = { ctx, analyser, buf: new Uint8Array(analyser.frequencyBinCount) };
      const loop = () => {
        if (!this._analyser) return;
        const { analyser, buf } = this._analyser;
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const level = sum / buf.length / 255;
        const talking = this._transmitting && level > 0.06;
        if (talking !== this._localTalking) {
          this._localTalking = talking;
          this.onSpeaking?.(this.selfId, talking);
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) { console.warn('analyser setup failed', e); }
  }

  hasMic() { return !!this.localStream; }

  /** Push-to-talk gate on the outgoing track. */
  setTransmitting(on) {
    this._transmitting = !!on;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !!on));
  }

  setMuted(muted) {
    this._muted = !!muted;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted && !!this._transmitting));
  }

  setVolume(v) {
    this.volume = v;
    for (const { audioEl } of this.peers.values()) audioEl.volume = v;
  }

  /** Join a channel: reconcile our peer set with the member list. */
  joinChannel(channel, members) {
    this.channel = channel;
    const ids = members.filter((m) => m.id !== this.selfId).map((m) => m.id);
    // close peers that left
    for (const [id, p] of this.peers) {
      if (!ids.includes(id)) {
        p.pc.close();
        p.audioEl.remove();
        this.peers.delete(id);
        this.onSpeaking?.(id, false);
      }
    }
    // connect to new peers (one PC per pair; deterministic offerer)
    for (const id of ids) {
      if (!this.peers.has(id)) this._createPeer(id);
    }
  }

  leave() {
    for (const [id, p] of this.peers) {
      p.pc.close();
      p.audioEl.remove();
      this.onSpeaking?.(id, false);
    }
    this.peers.clear();
    this.channel = null;
  }

  async dispose() {
    this.leave();
    this._analyser = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  _createPeer(peerId) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: this.stunUrls }] });
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.volume = this.volume;
    const peer = {
      pc, audioEl,
      // perfect-negotiation: lower id is impolite (offers first)
      polite: this.selfId > peerId,
      makingOffer: false,
      ignoreOffer: false,
    };
    this.peers.set(peerId, peer);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal?.(peerId, { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
      audioEl.play().catch(() => { /* will start on next gesture */ });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        // ICE failed (symmetric NAT without TURN) — surface it once
        if (pc.connectionState === 'failed') {
          this.onError?.('Voice connection to a teammate failed (strict NAT). Data channel chat still works.');
        }
      }
    };
    if (!peer.polite) this._makeOffer(peerId, peer);
    return peer;
  }

  async _makeOffer(peerId, peer) {
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription();
      this.sendSignal?.(peerId, { description: peer.pc.localDescription });
    } catch (e) {
      console.warn('offer failed', e);
    } finally {
      peer.makingOffer = false;
    }
  }

  /** Signaling payload relayed by the server from a channel member. */
  async handleSignal(fromId, data) {
    let peer = this.peers.get(fromId);
    if (!peer) peer = this._createPeer(fromId); // we may learn about them via signal first
    const { pc } = peer;
    try {
      if (data.description) {
        const offerCollision = data.description.type === 'offer' &&
          (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          await pc.setLocalDescription();
          this.sendSignal?.(fromId, { description: pc.localDescription });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (e) {
          if (!peer.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn('signal handling error', e);
    }
  }
}
