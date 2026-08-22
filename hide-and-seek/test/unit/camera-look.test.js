// ============================================================================
// Regression tests for the camera look convention (laptop / trackpad report):
//
//   "Moving the mouse up made the camera look DOWN, and looking down made it
//    look UP" — the vertical look (pitch) sign was inverted.
//
// These tests run the REAL PlayerController.update() under node:test with a
// minimal DOM stub, so they pin down the exact sign of the look math, not a
// copy of it.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../../shared/config.js';

// ---- minimal DOM stubs (the controller only binds listeners in its ctor) ---
const noop = () => {};
const canvas = { addEventListener: noop, removeEventListener: noop, style: {} };
globalThis.window = globalThis.window ?? { addEventListener: noop, removeEventListener: noop };
globalThis.document = globalThis.document ?? {
  pointerLockElement: null,
  addEventListener: noop,
  removeEventListener: noop,
};

const { PlayerController } = await import('../../client/js/controller.js');

function makeController(over = {}) {
  const world = {
    renderer: { domElement: canvas },
    colliders: [],
    ladders: [],
    bounds: { minX: 0, maxX: 64, minZ: 0, maxZ: 64 },
  };
  const settings = { ...DEFAULT_CONFIG, lookSensitivity: 1, invertY: false, ...over };
  const c = new PlayerController(world, settings);
  const cam = { position: { set: noop }, lookAt: noop };
  const step = () => c.update(1 / 60, cam);
  return { c, step };
}

// View direction (camera -> head) for a given camera yaw.
function forwardOf(yaw) { return [-Math.sin(yaw), -Math.cos(yaw)]; }
// Screen-right vector for a camera looking along `f` with up = +Y.
function rightOf([fx, fz]) { return [-fz, fx]; }
const dot = ([a, b], [c, d]) => a * c + b * d;

test('drag DOWN -> view looks DOWN (camera rises) — the user-reported inversion', () => {
  const { c, step } = makeController();
  const before = c.camPitch;
  c.input.lookDy += 0.4; // movementY > 0: mouse dragged downward
  step();
  assert.ok(c.camPitch > before, `pitch must RISE when dragging down (got ${before} -> ${c.camPitch})`);
});

test('drag UP -> view looks UP (camera lowers)', () => {
  const { c, step } = makeController();
  const before = c.camPitch;
  c.input.lookDy -= 0.4; // movementY < 0: mouse dragged upward
  step();
  assert.ok(c.camPitch < before, `pitch must FALL when dragging up (got ${before} -> ${c.camPitch})`);
});

test('invertY setting flips the pitch convention (and only pitch)', () => {
  const { c, step } = makeController({ invertY: true });
  const before = c.camPitch;
  c.input.lookDy += 0.4;
  step();
  assert.ok(c.camPitch < before, 'inverted: drag down must look up');
});

test('pitch is clamped to a sane range no matter how hard you drag', () => {
  // drag DOWN hard -> camera fully raised -> max pitch (looking down as far as allowed)
  let { c, step } = makeController();
  c.input.lookDy += 100000; step();
  assert.equal(c.camPitch, 1.15);
  // drag UP hard -> camera fully lowered -> min pitch (looking up)
  ({ c, step } = makeController());
  c.input.lookDy -= 100000; step();
  assert.equal(c.camPitch, -0.5);
});

test('drag RIGHT -> view rotates screen-right (horizontal convention unchanged)', () => {
  const { c, step } = makeController();
  const before = forwardOf(c.camYaw);
  const right = rightOf(before);
  c.input.lookDx += 0.1; // a realistic drag (~40px at 0.0026 rad/px)
  step();
  const after = forwardOf(c.camYaw);
  const delta = [after[0] - before[0], after[1] - before[1]];
  assert.ok(dot(delta, right) > 0, `view should rotate right, got delta ${delta} vs right ${right}`);
});

test('look input is consumed every frame (no momentum / double application)', () => {
  const { c, step } = makeController();
  c.input.lookDy += 0.4;
  const p1 = c.camPitch;
  step();
  const p2 = c.camPitch;
  step(); // second frame with no new input: pitch must not keep moving
  assert.ok(Math.abs(c.camPitch - p2) < 1e-12);
  assert.ok(p2 > p1);
});
