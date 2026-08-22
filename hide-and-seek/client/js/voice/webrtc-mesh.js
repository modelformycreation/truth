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
    this.deafened = false;          // output (speaker) mute — separate from mic mute
    this.sendSignal = null;         // (toPeerId, data) => void — set by VoiceManager
    this._analyser = null;
    this._micLevel = 0;
    this._transmitting = false;
    this._muted = false;
    // iOS refuses <audio>.play() outside a gesture; retry every element the
    // next time the user touches anything.
    this._pendingPlay = new Set();
    const retry = () => this._flushPendingPlay();
    for (const ev of ['pointerdown', 'touchend', 'keydown']) {
      window.addEventListener(ev, retry, { passive: true });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) retry(); });
  }

  get name() { return 'webrtc-mesh'; }

  _flushPendingPlay() {
    for (const el of this._pendingPlay) {
      el.play().then(() => this._pendingPlay.delete(el)).catch(() => {});
    }
    if (this._analyser?.ctx?.state === 'suspended') this._analyser.ctx.resume().catch(() => {});
  }

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
      // the mic gesture is also our chance to unblock inbound audio playback
      this._flushPendingPlay();
      // a mic acquired after peers already exist must be added to them
      for (const [, peer] of this.peers) this._attachLocalTracks(peer);
      return true;
    } catch (err) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone permission denied — enable it in your browser settings.'
        : err?.name === 'NotFoundError'
          ? 'No microphone found on this device.'
          : `Microphone unavailable (${err?.name || 'error'})`;
      this.onError?.(msg);
      return false;
    }
  }

  /** Stop and release the microphone entirely (mic OFF). */
  releaseMic() {
    this._transmitting = false;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    if (this._analyser) {
      try { this._analyser.ctx.close(); } catch { /* already closed */ }
      this._analyser = null;
    }
    this._micLevel = 0;
    this._localTalking = false;
    this.onSpeaking?.(this.selfId, false);
  }

  /**
   * Put our mic on this peer connection.
   * Every peer is created with exactly ONE sendrecv audio transceiver, so the
   * mic is attached by swapping the track on its sender. Calling addTrack()
   * later would append a second m-line and break renegotiation with
   * "the order of m-lines" errors.
   */
  _attachLocalTracks(peer) {
    const track = this.localStream?.getAudioTracks()[0] ?? null;
    if (!peer.audioSender) return;
    try { peer.audioSender.replaceTrack(track); } catch { /* closing */ }
  }

  _setupLocalAnalyser() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(this.localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      this._analyser = { ctx, analyser, buf: new Uint8Array(analyser.frequencyBinCount) };
      const loop = () => {
        if (!this._analyser) return;
        const { analyser: an, buf } = this._analyser;
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const level = sum / buf.length / 255;
        this._micLevel = level;
        const talking = this._transmitting && !this._muted && level > 0.045;
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
  get micLevel() { return this._micLevel; }
  get transmitting() { return !!this._transmitting && !this._muted && this.hasMic(); }

  /**
   * Push-to-talk gate on the outgoing track.
   * A muted mic ALWAYS wins: previously setTransmitting(true) re-enabled the
   * track even while muted, so pressing PTT while muted leaked your audio.
   */
  setTransmitting(on) {
    this._transmitting = !!on;
    this._applyTrackState();
  }

  setMuted(muted) {
    this._muted = !!muted;
    this._applyTrackState();
  }

  _applyTrackState() {
    const live = this._transmitting && !this._muted;
    this.localStream?.getAudioTracks().forEach((t) => (t.enabled = live));
    if (!live && this._localTalking) {
      this._localTalking = false;
      this.onSpeaking?.(this.selfId, false);
    }
  }

  /** Output (speaker) mute — stop HEARING others, independent of the mic. */
  setDeafened(deafened) {
    this.deafened = !!deafened;
    for (const peer of this.peers.values()) this._applyPeerVolume(peer);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) ?? 1));
    for (const peer of this.peers.values()) this._applyPeerVolume(peer);
  }

  /** Per-player output volume (settings screen). */
  setPeerVolume(peerId, v) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.userVolume = Math.max(0, Math.min(1, Number(v) ?? 1));
    this._applyPeerVolume(peer);
  }

  _applyPeerVolume(peer) {
    peer.audioEl.muted = this.deafened;
    peer.audioEl.volume = this.deafened ? 0 : this.volume * (peer.userVolume ?? 1);
  }

  /** Join a channel: reconcile our peer set with the member list. */
  joinChannel(channel, members) {
    this.channel = channel;
    const ids = members.filter((m) => m.id !== this.selfId).map((m) => m.id);
    // close peers that left
    for (const [id, p] of this.peers) {
      if (!ids.includes(id)) {
        p.pc.close();
        this._pendingPlay.delete(p.audioEl);
        p.audioEl.srcObject = null;
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
      this._pendingPlay.delete(p.audioEl);
      p.audioEl.srcObject = null;
      p.audioEl.remove();
      this.onSpeaking?.(id, false);
    }
    this.peers.clear();
    this.channel = null;
  }

  async dispose() {
    this.leave();
    this.releaseMic();
  }

  _createPeer(peerId) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: String(this.stunUrls).split(',') }] });
    const audioEl = new Audio();
    audioEl.autoplay = true;
    // iOS Safari will not play a detached element and needs playsInline
    audioEl.playsInline = true;
    audioEl.setAttribute('playsinline', '');
    audioEl.muted = this.deafened;
    audioEl.volume = this.deafened ? 0 : this.volume;
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
    const peer = {
      pc, audioEl,
      // perfect-negotiation: lower id is impolite (offers first)
      polite: this.selfId > peerId,
      makingOffer: false,
      ignoreOffer: false,
      userVolume: 1,
    };
    this.peers.set(peerId, peer);

    // Exactly one bidirectional audio m-line per peer, created up front. The
    // mic (if any) is swapped in on the sender — see _attachLocalTracks. This
    // also means a client with NO mic still receives everyone else's audio.
    try {
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      peer.audioSender = tr.sender;
    } catch {
      // very old browsers: fall back to addTrack
      if (this.localStream) {
        for (const t of this.localStream.getAudioTracks()) peer.audioSender = pc.addTrack(t, this.localStream);
      }
    }
    this._attachLocalTracks(peer);
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sendSignal?.(peerId, { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      // A track attached via addTransceiver()+replaceTrack() carries no msid,
      // so `e.streams` is EMPTY — wrap the bare track ourselves or the audio
      // element silently never gets a source and nobody can hear anyone.
      const stream = e.streams?.[0] ?? new MediaStream([e.track]);
      audioEl.srcObject = stream;
      this._applyPeerVolume(peer);
      audioEl.play().catch(() => { this._pendingPlay.add(audioEl); });
    };
    // Perfect negotiation: BOTH sides may offer; `polite` only decides who
    // yields when offers collide. Driving offers solely from the impolite side
    // meant a mic acquired *after* the peer existed was never renegotiated, so
    // the polite peer's audio never reached anyone.
    pc.onnegotiationneeded = () => this._makeOffer(peerId, peer);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // ICE failed (symmetric NAT without TURN) — surface it once
        this.onError?.('Voice connection to a teammate failed (strict NAT). Try again or use a TURN server.');
      }
    };
    return peer;
  }

  async _makeOffer(peerId, peer) {
    if (peer.makingOffer) return;
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

  /**
   * Signaling payload relayed by the server from a channel member.
   *
   * Textbook "perfect negotiation". The politeness test used to be inverted
   * (`polite && collision`), which made the POLITE peer drop the offer instead
   * of rolling back. That was harmless while only one side ever offered, but
   * as soon as both sides can renegotiate (needed so a mic acquired later
   * reaches existing peers) it deadlocked both ends in `have-local-offer` and
   * spewed "order of m-lines" errors.
   */
  async handleSignal(fromId, data) {
    let peer = this.peers.get(fromId);
    if (!peer) peer = this._createPeer(fromId); // we may learn about them via signal first
    const { pc } = peer;
    try {
      if (data.description) {
        const readyForOffer = !peer.makingOffer &&
          (pc.signalingState === 'stable' || peer.settingRemoteAnswerPending);
        const offerCollision = data.description.type === 'offer' && !readyForOffer;

        // the IMPOLITE peer wins a collision and ignores the incoming offer;
        // the polite peer rolls back implicitly in setRemoteDescription()
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;

        peer.settingRemoteAnswerPending = data.description.type === 'answer';
        await pc.setRemoteDescription(data.description);
        peer.settingRemoteAnswerPending = false;

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
      peer.settingRemoteAnswerPending = false;
      console.warn('signal handling error', e);
    }
  }
}
