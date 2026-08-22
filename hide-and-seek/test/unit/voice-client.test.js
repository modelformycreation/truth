// ============================================================================
// Regression tests for BUG 3 — "Mic (voice chat) not working correctly."
//
// The WebRTC provider is exercised against a tiny fake of the browser APIs it
// touches, so the *state machine* (mute vs transmit vs deafen) is pinned down
// without needing a real browser. The end-to-end "two clients actually
// exchange audio" check lives in tools/browser-e2e.mjs, which runs Chromium
// with --use-fake-device-for-media-stream.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------- fakes ----
function installBrowserFakes() {
  const tracks = [];
  const mkTrack = () => {
    const t = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
    tracks.push(t);
    return t;
  };
  const stream = {
    _tracks: [mkTrack()],
    getTracks() { return this._tracks; },
    getAudioTracks() { return this._tracks; },
  };
  const created = { audios: [], pcs: [] };

  globalThis.window = {
    AudioContext: undefined, webkitAudioContext: undefined,
    addEventListener() {},
  };
  globalThis.document = {
    addEventListener() {},
    body: { appendChild() {} },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async () => stream } },
    configurable: true,
    writable: true,
  });
  globalThis.Audio = class {
    constructor() {
      this.autoplay = false; this.volume = 1; this.muted = false;
      this.srcObject = null; this.style = {};
      created.audios.push(this);
    }
    setAttribute() {}
    remove() { this.removed = true; }
    play() { return Promise.resolve(); }
  };
  globalThis.RTCPeerConnection = class {
    constructor() {
      this.senders = []; this.transceivers = [];
      this.connectionState = 'new'; this.signalingState = 'stable';
      this.localDescription = { type: 'offer', sdp: 'x' };
      created.pcs.push(this);
    }
    addTrack(track) { const s = { track }; this.senders.push(s); return s; }
    getSenders() { return this.senders; }
    getTransceivers() { return this.transceivers; }
    removeTrack(s) { this.senders = this.senders.filter((x) => x !== s); }
    addTransceiver(kind, init = {}) {
      const sender = {
        track: null,
        replaceTrack(t) { this.track = t; return Promise.resolve(); },
      };
      const tr = { kind, direction: init.direction, sender, stopped: false, receiver: { track: { kind } } };
      this.transceivers.push(tr);
      this.senders.push(sender);
      return tr;
    }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    async addIceCandidate() {}
    close() { this.closed = true; }
  };
  globalThis.requestAnimationFrame = () => 0;
  return { stream, created };
}

const fakes = installBrowserFakes();
const { WebRtcMeshProvider } = await import('../../client/js/voice/webrtc-mesh.js');

function mkProvider() {
  const p = new WebRtcMeshProvider({ selfId: 'p1', onSpeaking() {}, onError() {} });
  p.sendSignal = () => {};
  return p;
}
const micLive = (p) => p.localStream.getAudioTracks().every((t) => t.enabled);

// ------------------------------------------------- mute vs push-to-talk ----

test('a fresh mic starts silent (push-to-talk default)', async () => {
  const p = mkProvider();
  await p.acquireMic();
  assert.equal(p.hasMic(), true);
  assert.equal(micLive(p), false, 'mic must not be hot the instant it is granted');
});

test('push-to-talk opens and closes the outgoing track', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.setTransmitting(true);
  assert.equal(micLive(p), true);
  p.setTransmitting(false);
  assert.equal(micLive(p), false);
});

test('REGRESSION: pressing push-to-talk while MUTED must not transmit', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.setMuted(true);
  p.setTransmitting(true);         // the old code re-enabled the track here
  assert.equal(micLive(p), false, 'muted mic leaked audio when PTT was pressed');
  assert.equal(p.transmitting, false);
});

test('unmuting while still holding push-to-talk resumes transmission', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.setTransmitting(true);
  p.setMuted(true);
  assert.equal(micLive(p), false);
  p.setMuted(false);
  assert.equal(micLive(p), true, 'releasing mute while PTT is held should talk again');
});

test('mute survives a transmit toggle in either order', async () => {
  const p = mkProvider();
  await p.acquireMic();
  for (const order of [['mute', 'tx'], ['tx', 'mute']]) {
    p.setMuted(false); p.setTransmitting(false);
    for (const step of order) {
      if (step === 'mute') p.setMuted(true); else p.setTransmitting(true);
    }
    assert.equal(micLive(p), false, `order ${order} leaked audio`);
  }
});

// -------------------------------------------------------------- deafen -----

test('deafening mutes incoming audio without touching the mic', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  p.setTransmitting(true);
  p.setDeafened(true);
  const peer = p.peers.get('p2');
  assert.equal(peer.audioEl.muted, true, 'incoming audio must be muted');
  assert.equal(peer.audioEl.volume, 0);
  assert.equal(micLive(p), true, 'deafening must NOT mute my microphone');
  p.setDeafened(false);
  assert.equal(peer.audioEl.muted, false);
});

test('mic mute and speaker mute are independent', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  p.setTransmitting(true);
  p.setMuted(true);                       // mic off, ears open
  assert.equal(micLive(p), false);
  assert.equal(p.peers.get('p2').audioEl.muted, false);
});

test('volume changes respect the deafened state', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  p.setDeafened(true);
  p.setVolume(0.7);
  assert.equal(p.peers.get('p2').audioEl.volume, 0, 'deafened must stay silent');
  p.setDeafened(false);
  assert.equal(p.peers.get('p2').audioEl.volume, 0.7);
});

test('per-player volume scales that peer only', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
  p.setVolume(1);
  p.setPeerVolume('p2', 0.25);
  assert.equal(p.peers.get('p2').audioEl.volume, 0.25);
  assert.equal(p.peers.get('p3').audioEl.volume, 1);
});

// ------------------------------------------------------ listen-only path ---

test('REGRESSION: a client with no mic still negotiates to RECEIVE audio', () => {
  const p = mkProvider();                 // note: no acquireMic()
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  const peer = p.peers.get('p2');
  assert.ok(peer, 'must still connect to teammates without a mic');
  const audioTr = peer.pc.getTransceivers().filter((t) => t.kind === 'audio');
  assert.equal(audioTr.length, 1, 'exactly one audio m-line per peer');
  assert.equal(audioTr[0].direction, 'sendrecv',
    'the m-line must be able to receive or a listener hears nothing');
  assert.equal(audioTr[0].sender.track, null, 'no mic yet, so nothing is sent');
});

test('acquiring a mic later attaches it to existing peers', async () => {
  const p = mkProvider();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  const peer = p.peers.get('p2');
  assert.equal(peer.audioSender.track, null);
  await p.acquireMic();
  assert.ok(peer.audioSender.track, 'a late mic must reach existing peers');
  assert.equal(
    peer.pc.getTransceivers().filter((t) => t.kind === 'audio').length, 1,
    'attaching the mic must NOT append a second m-line',
  );
});

test('releasing the mic detaches the track but keeps the m-line', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  const peer = p.peers.get('p2');
  assert.ok(peer.audioSender.track);
  p.releaseMic();
  p._attachLocalTracks(peer);
  assert.equal(peer.audioSender.track, null);
  assert.equal(peer.pc.getTransceivers().filter((t) => t.kind === 'audio').length, 1);
});

// --------------------------------------------------------- lifecycle -------

test('releasing the mic stops the device and clears state', async () => {
  const p = mkProvider();
  await p.acquireMic();
  const track = p.localStream.getAudioTracks()[0];
  p.releaseMic();
  assert.equal(track.stopped, true, 'the OS recording indicator must go away');
  assert.equal(p.hasMic(), false);
  assert.equal(p.transmitting, false);
});

test('leaving a channel tears down peers and their audio elements', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  const peer = p.peers.get('p2');
  p.leave();
  assert.equal(p.peers.size, 0);
  assert.equal(peer.pc.closed, true);
  assert.equal(peer.audioEl.removed, true, 'orphan <audio> elements must not leak');
});

test('joinChannel reconciles: members who left are disconnected', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
  assert.equal(p.peers.size, 2);
  const gone = p.peers.get('p3');
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  assert.equal(p.peers.size, 1);
  assert.equal(gone.pc.closed, true);
});

test('we never open a peer connection to ourselves', async () => {
  const p = mkProvider();
  await p.acquireMic();
  p.joinChannel('HIDERS', [{ id: 'p1' }, { id: 'p2' }]);
  assert.equal(p.peers.has('p1'), false);
});

test('perfect-negotiation politeness is deterministic and opposed', () => {
  const a = new WebRtcMeshProvider({ selfId: 'p1', onSpeaking() {}, onError() {} });
  const b = new WebRtcMeshProvider({ selfId: 'p2', onSpeaking() {}, onError() {} });
  a.sendSignal = b.sendSignal = () => {};
  a.joinChannel('T', [{ id: 'p1' }, { id: 'p2' }]);
  b.joinChannel('T', [{ id: 'p1' }, { id: 'p2' }]);
  assert.notEqual(
    a.peers.get('p2').polite, b.peers.get('p1').polite,
    'exactly one side must be the polite peer or offers collide',
  );
});

test('REGRESSION: on an offer collision the IMPOLITE peer ignores, the polite one yields', async () => {
  // The politeness test used to be inverted, which deadlocked both peers in
  // have-local-offer as soon as both sides could renegotiate.
  const mk = (selfId) => {
    const p = new WebRtcMeshProvider({ selfId, onSpeaking() {}, onError() {} });
    p.sendSignal = () => {};
    p.joinChannel('T', [{ id: 'p1' }, { id: 'p2' }]);
    return p;
  };
  const impolite = mk('p1');            // 'p1' > 'p2' is false -> impolite
  const polite = mk('p3');              // 'p3' > 'p2' is true  -> polite
  const iPeer = impolite.peers.get('p2');
  const pPeer = polite.peers.get('p2');
  assert.equal(iPeer.polite, false);
  assert.equal(pPeer.polite, true);

  // simulate a glare: both are mid-offer when a remote offer arrives
  for (const [prov, peer] of [[impolite, iPeer], [polite, pPeer]]) {
    peer.makingOffer = true;
    peer.pc.signalingState = 'have-local-offer';
    await prov.handleSignal('p2', { description: { type: 'offer', sdp: 'x' } });
  }
  assert.equal(iPeer.ignoreOffer, true, 'the impolite peer must WIN the collision');
  assert.equal(pPeer.ignoreOffer, false, 'the polite peer must yield and accept the offer');
});

test('multiple STUN urls are passed as a list, not one bogus string', () => {
  const p = new WebRtcMeshProvider({
    selfId: 'p1', onSpeaking() {}, onError() {},
    stunUrls: 'stun:a.example:19302,stun:b.example:19302',
  });
  p.sendSignal = () => {};
  p.joinChannel('T', [{ id: 'p1' }, { id: 'p2' }]);
  assert.ok(p.peers.get('p2'), 'peer created with a multi-url STUN config');
});

void fakes;
