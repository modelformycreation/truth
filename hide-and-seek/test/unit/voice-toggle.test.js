// ============================================================================
// Regression tests — Feature 2: the mic is a simple TAP-TO-TOGGLE on/off
// (tap = mic on / talking, tap again = mic off). Push-to-talk / hold-to-talk
// was removed entirely — there is no longer a PTT gate on the outgoing track.
//
// These exercise the VoiceManager state machine (client/js/voice/) against
// fake browser APIs + a fake provider-less Net, mirroring the fakes used by
// voice-client.test.js.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../client/js/state.js';
import { VoiceManager } from '../../client/js/voice/voice-manager.js';

// ---------------------------------------------------------------- fakes ----
function installBrowserFakes() {
  const mkTrack = () => ({ kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } });
  const stream = { _t: [mkTrack()], getTracks() { return this._t; }, getAudioTracks() { return this._t; } };
  class FakeAudioContext {
    constructor() { this.state = 'running'; }
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 0, getByteFrequencyData() {} }; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  globalThis.window = { AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext, addEventListener() {} };
  globalThis.document = { addEventListener() {}, body: { appendChild() {} } };
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async () => stream } }, configurable: true, writable: true,
  });
  globalThis.Audio = class {
    constructor() { this.volume = 1; this.muted = false; this.srcObject = null; this.style = {}; }
    setAttribute() {} remove() {} play() { return Promise.resolve(); }
  };
  globalThis.RTCPeerConnection = class {
    constructor() { this.connectionState = 'new'; this.signalingState = 'stable'; }
    addTransceiver() { return { sender: { track: null, replaceTrack: async () => {} } }; }
    close() {}
  };
  globalThis.requestAnimationFrame = () => 0;
  return stream;
}

installBrowserFakes();

function mkVoiceManager() {
  const sent = [];
  const net = {
    bus: new EventBus(),
    sent,
    send: (event, payload) => sent.push({ event, payload }),
  };
  const store = { get: () => ({}) };
  const vm = new VoiceManager(net, net.bus, store);
  return vm;
}
const sendEvent = (net, ev) => net.sent.filter((s) => s.event === ev);

function mkProvider(vm) { return vm._ensureProvider(); }

test('a fresh mic is OFF (no device, not transmitting)', async () => {
  const vm = mkVoiceManager();
  assert.equal(vm.micOn, false);
  assert.equal(vm.muted, false);
});

test('toggleMic from OFF turns the mic ON and transmits immediately (no PTT)', async () => {
  const vm = mkVoiceManager();
  const on = await vm.toggleMic();
  assert.equal(on, true);
  assert.equal(vm.micOn, true);
  assert.equal(vm.muted, false);
  assert.equal(mkProvider(vm).transmitting, true, 'open mic must transmit without any hold/Ptt gate');
  // a VOICE_TALK true was announced
  const talk = sendEvent(vm.net, 'voice:talk').pop();
  assert.equal(talk.payload.talking, true);
});

test('toggleMic again turns the mic OFF (releases the device)', async () => {
  const vm = mkVoiceManager();
  await vm.toggleMic();
  const off = await vm.toggleMic();
  assert.equal(off, false);
  assert.equal(vm.micOn, false);
  assert.equal(mkProvider(vm).hasMic(), false, 'mic OFF must release the device (indicator goes away)');
});

test('a MUTED mic does not transmit even though the device is acquired', async () => {
  const vm = mkVoiceManager();
  await vm.toggleMic();               // on
  vm.setMuted(true);                  // user turns the tap on/off OFF
  assert.equal(mkProvider(vm).transmitting, false);
  assert.equal(mkProvider(vm).localStream.getAudioTracks()[0].enabled, false,
    'muted mic must NOT transmit');
});

test('unmuting restores transmission (device stays acquired)', async () => {
  const vm = mkVoiceManager();
  await vm.toggleMic();
  vm.setMuted(true);
  vm.setMuted(false);
  assert.equal(mkProvider(vm).transmitting, true);
});

test('REGRESSION: push-to-talk API is GONE (setPtt / setMicMode no longer exist)', () => {
  const vm = mkVoiceManager();
  assert.equal(vm.setPtt, undefined, 'push-to-talk must be removed');
  assert.equal(vm.setMicMode, undefined, 'mic mode selector must be removed');
  assert.equal(vm.pttActive, undefined, 'no pttActive state');
  assert.equal(vm.micMode, undefined, 'no micMode state');
});
