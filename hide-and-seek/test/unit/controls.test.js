// ============================================================================
// Regression tests for the reported P0 input bugs.
//
//   BUG 2 — "W / S (front & back) movement is INVERTED on laptop."
//   BUG 1 — joystick / sprint behaviour (the parts that are pure math).
//
// The movement basis lives in shared/geometry.js precisely so the exact math
// the game runs can be asserted here without a browser. The real-browser side
// of these bugs is covered by tools/browser-e2e.mjs.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraRelativeMove, facingYaw } from '../../shared/geometry.js';
import { DEFAULT_CONFIG } from '../../shared/config.js';

// Input convention: iz = -1 forward (W), +1 back (S); ix = -1 left, +1 right.
const W = [0, -1], S = [0, 1], A = [-1, 0], D = [1, 0];

/**
 * The camera orbits to `head + [sin(camYaw), *, cos(camYaw)] * dist`, so the
 * unit vector pointing from the camera toward the player — "forward" — is:
 */
function forwardOf(camYaw) {
  return [-Math.sin(camYaw), -Math.cos(camYaw)];
}
function dot([ax, az], [bx, bz]) { return ax * bx + az * bz; }
const CAM_YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, 2.4, -1.1, 5.9];

test('W moves AWAY from the camera at every camera angle (the inverted-W bug)', () => {
  for (const yaw of CAM_YAWS) {
    const move = cameraRelativeMove(W[0], W[1], yaw);
    const fwd = forwardOf(yaw);
    assert.ok(
      dot(move, fwd) > 0.99,
      `camYaw=${yaw}: W should follow forward ${fwd} but moved ${move}`,
    );
  }
});

test('S moves TOWARD the camera at every camera angle', () => {
  for (const yaw of CAM_YAWS) {
    const move = cameraRelativeMove(S[0], S[1], yaw);
    assert.ok(dot(move, forwardOf(yaw)) < -0.99, `camYaw=${yaw}: S moved ${move}`);
  }
});

test('W and S are exact opposites, and so are A and D', () => {
  for (const yaw of CAM_YAWS) {
    const w = cameraRelativeMove(...W, yaw);
    const s = cameraRelativeMove(...S, yaw);
    assert.ok(Math.abs(w[0] + s[0]) < 1e-12 && Math.abs(w[1] + s[1]) < 1e-12);
    const a = cameraRelativeMove(...A, yaw);
    const d = cameraRelativeMove(...D, yaw);
    assert.ok(Math.abs(a[0] + d[0]) < 1e-12 && Math.abs(a[1] + d[1]) < 1e-12);
  }
});

test('D strafes to screen-right (forward x up), A to screen-left', () => {
  for (const yaw of CAM_YAWS) {
    const [fx, fz] = forwardOf(yaw);
    // right = forward x up  for a Y-up right-handed frame
    const right = [-fz, fx];
    assert.ok(dot(cameraRelativeMove(...D, yaw), right) > 0.99, `camYaw=${yaw} D`);
    assert.ok(dot(cameraRelativeMove(...A, yaw), right) < -0.99, `camYaw=${yaw} A`);
  }
});

test('strafing stays perpendicular to forward (no forward bleed)', () => {
  for (const yaw of CAM_YAWS) {
    assert.ok(Math.abs(dot(cameraRelativeMove(...D, yaw), forwardOf(yaw))) < 1e-12);
    assert.ok(Math.abs(dot(cameraRelativeMove(...A, yaw), forwardOf(yaw))) < 1e-12);
  }
});

test('the basis is orthonormal: |move| always equals |input|', () => {
  const inputs = [W, S, A, D, [0.5, -0.5], [0.3, 0.9], [-0.2, -0.1], [0, 0]];
  for (const yaw of CAM_YAWS) {
    for (const [ix, iz] of inputs) {
      const [wx, wz] = cameraRelativeMove(ix, iz, yaw);
      assert.ok(
        Math.abs(Math.hypot(wx, wz) - Math.hypot(ix, iz)) < 1e-12,
        `camYaw=${yaw} input=${[ix, iz]} -> ${[wx, wz]}`,
      );
    }
  }
});

test('a diagonal (W+D) is the normalised sum of its parts', () => {
  const yaw = 1.234;
  const w = cameraRelativeMove(...W, yaw);
  const d = cameraRelativeMove(...D, yaw);
  const wd = cameraRelativeMove(1, -1, yaw);
  assert.ok(Math.abs(wd[0] - (w[0] + d[0])) < 1e-12);
  assert.ok(Math.abs(wd[1] - (w[1] + d[1])) < 1e-12);
});

test('facingYaw makes the avatar face the direction it is moving', () => {
  // avatars model forward as (-sin(yaw), -cos(yaw))
  for (const yaw of CAM_YAWS) {
    const move = cameraRelativeMove(...W, yaw);
    const f = facingYaw(move[0], move[1]);
    const facing = [-Math.sin(f), -Math.cos(f)];
    assert.ok(dot(facing, move) > 0.99, `camYaw=${yaw}: facing ${facing} vs move ${move}`);
  }
});

test('walking forward from the default spawn increases Z (regression on the exact reported case)', () => {
  // Default camera yaw is PI (camera south of the player, looking north).
  const [wx, wz] = cameraRelativeMove(0, -1, Math.PI);
  assert.ok(Math.abs(wx) < 1e-12, `expected no sideways drift, got ${wx}`);
  assert.ok(wz > 0.99, `W at camYaw=PI must move +Z (into the facility), got ${wz}`);
});

// ---------------------------------------------------------------- touch ----

test('joystick tuning is configurable, not hard-coded', () => {
  assert.equal(typeof DEFAULT_CONFIG.joystickDeadzone, 'number');
  assert.equal(typeof DEFAULT_CONFIG.joystickSprintThreshold, 'number');
  assert.ok(DEFAULT_CONFIG.joystickDeadzone > 0 && DEFAULT_CONFIG.joystickDeadzone < 0.5);
  // must be reachable: the stick is clamped to the rim (magnitude 1.0)
  assert.ok(
    DEFAULT_CONFIG.joystickSprintThreshold > DEFAULT_CONFIG.joystickDeadzone &&
    DEFAULT_CONFIG.joystickSprintThreshold < 1.0,
    'sprint threshold must be reachable by a stick clamped to magnitude 1',
  );
});

test('a stick pushed to the rim is above the sprint threshold, centre is in the deadzone', () => {
  const { joystickDeadzone: dz, joystickSprintThreshold: sp } = DEFAULT_CONFIG;
  const magnitude = (dx, dy, R) => Math.min(Math.hypot(dx, dy), R) / R;
  const R = 62;                                  // half of the 124px CSS base
  assert.ok(magnitude(R, 0, R) > sp, 'full deflection must sprint');
  assert.ok(magnitude(0.55 * R, 0, R) <= sp, 'half deflection must only walk');
  assert.ok(magnitude(0.55 * R, 0, R) > dz, 'half deflection must still move');
  assert.ok(magnitude(0.01 * R, 0, R) < dz, 'centre must be standing still');
});

test('footstep + audio feedback ranges are configured', () => {
  for (const key of [
    'footstepStrideWalkM', 'footstepStrideRunM', 'footstepHearRadius',
    'heartbeatRadius', 'heartbeatMinIntervalMs', 'heartbeatMaxIntervalMs',
  ]) {
    assert.equal(typeof DEFAULT_CONFIG[key], 'number', `${key} must be configurable`);
    assert.ok(DEFAULT_CONFIG[key] > 0, `${key} must be positive`);
  }
  assert.ok(
    DEFAULT_CONFIG.heartbeatMinIntervalMs < DEFAULT_CONFIG.heartbeatMaxIntervalMs,
    'the heartbeat must get FASTER as a seeker closes in',
  );
});
