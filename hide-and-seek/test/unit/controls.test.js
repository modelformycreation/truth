// ============================================================================
// Regression tests — Feature 6: custom controls + persistence.
//
// Controls are keyed by BOTH the device id and the user's secret game code, so
// the same layout comes back across name changes, network changes, and (via
// the code) device/browser changes. The server never trusts the client — every
// value is sanitised/whitelisted — and a brand-new device starts with sensible
// defaults (not a broken layout).
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeControls, CONTROLS_DEFAULTS } from '../../shared/controls.js';
import { ControlsStore } from '../../server/controls.js';

test('a brand-new (empty) controls payload yields sensible defaults', () => {
  const out = sanitizeControls({});
  assert.equal(out.lookSensitivity, CONTROLS_DEFAULTS.lookSensitivity);
  assert.equal(out.invertY, false);
  assert.equal(out.joystickSize, 1.0);
  assert.equal(out.joystickSide, 'left');
  assert.equal(out.sprintMode, 'free-fire');
  assert.ok(out.buttons, 'buttons map present');
});

test('out-of-range / junk values are clamped or ignored', () => {
  const out = sanitizeControls({
    lookSensitivity: 999, joystickSize: -5, invertY: 'yes',
    joystickSide: 'up', sprintMode: 'turbo', buttons: 'nope',
  });
  assert.equal(out.lookSensitivity, 2.5, 'sensitivity clamped to max');
  assert.equal(out.joystickSize, 0.7, 'joystick size clamped to min');
  assert.equal(out.invertY, false, 'non-boolean invertY ignored');
  assert.equal(out.joystickSide, 'left', 'unknown side ignored');
  assert.equal(out.sprintMode, 'free-fire', 'unknown sprint mode ignored');
});

test('button positions are clamped to 0..1 and non-numeric ignored', () => {
  const out = sanitizeControls({
    buttons: { sprint: { x: 5, y: -3 }, jump: { x: 0.5 }, mic: { x: 'a', y: 0.2 } },
  });
  assert.deepEqual(out.buttons.sprint, { x: 1, y: 0 });
  assert.equal(out.buttons.jump, null, 'incomplete button pos ignored');
  assert.equal(out.buttons.mic, null, 'non-numeric button pos ignored');
});

test('non-object input is rejected entirely', () => {
  assert.equal(sanitizeControls(null), null);
  assert.equal(sanitizeControls('hi'), null);
  assert.equal(sanitizeControls(42), null);
});

test('controls save + reload by game code', () => {
  const store = new ControlsStore();
  store.save({ code: 'mysecret', controls: { lookSensitivity: 1.8, invertY: true, joystickSide: 'right' } });
  const got = store.get({ code: 'mysecret' });
  assert.equal(got.lookSensitivity, 1.8);
  assert.equal(got.invertY, true);
  assert.equal(got.joystickSide, 'right');
});

test('controls also reload by device id', () => {
  const store = new ControlsStore();
  store.save({ deviceId: 'dev-123', controls: { joystickSize: 1.3 } });
  assert.equal(store.get({ deviceId: 'dev-123' }).joystickSize, 1.3);
});

test('an unknown code/device returns null (brand-new device = defaults)', () => {
  const store = new ControlsStore();
  assert.equal(store.get({ code: 'nope', deviceId: 'never' }), null);
});

test('saving requires at least a code or a device id', () => {
  const store = new ControlsStore();
  assert.equal(store.save({ controls: { lookSensitivity: 1 } }).error, 'NO_KEY');
});

test('a returning player with a code gets their layout regardless of device', () => {
  const store = new ControlsStore();
  store.save({ code: 'shared-code', controls: { lookSensitivity: 2.0, sprintMode: 'classic' } });
  const onNewDevice = store.get({ deviceId: 'brand-new-device', code: 'shared-code' });
  assert.equal(onNewDevice.lookSensitivity, 2.0, 'code wins over a fresh device');
  assert.equal(onNewDevice.sprintMode, 'classic');
});
