// ============================================================================
// Regression test — Feature 4: the minimap self-arrow pointed 180° the wrong
// way (moving forward rendered as moving backward).
//
// The bug: `ctx.rotate(-yaw + Math.PI)` instead of `ctx.rotate(-yaw)`.
//
// The canvas arrow is drawn pointing "up" (tip at (0, -r)). After
// `ctx.rotate(θ)` that tip sits at `(sin θ, -cos θ)` in canvas space
// (x→right, y→down). The player faces `(-sin yaw, -cos yaw)` (avatar yaw 0
// faces -Z, and the minimap is north-up: world x→canvas x, world z→canvas y).
// For the arrow to point where the player faces, θ must equal -yaw.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';

const { arrowRotation } = await import('../../client/js/minimap.js');

/** Where the arrow's tip (drawn pointing up) lands after ctx.rotate(θ). */
function arrowTip(θ) {
  // a vector (0, -1) rotated by θ in canvas coords (y down)
  return [Math.sin(θ), -Math.cos(θ)];
}

/** The world facing direction of a player with yaw `yaw`, in canvas coords. */
function facing(yaw) {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('the arrow rotation is -yaw (points where the player faces)', () => {
  const yaws = [0, Math.PI, -Math.PI / 2, Math.PI / 2, 2.1, -0.7, Math.PI / 4];
  for (const yaw of yaws) {
    const tip = arrowTip(arrowRotation(yaw));
    const want = facing(yaw);
    assert.ok(
      close(tip[0], want[0]) && close(tip[1], want[1]),
      `yaw=${yaw.toFixed(3)}: arrow tip ${tip.map((v) => v.toFixed(3))} should match facing ${want.map((v) => v.toFixed(3))}`,
    );
  }
});

test('REGRESSION: the old -yaw + Math.PI formula pointed 180 degrees the wrong way', () => {
  const yaws = [0, Math.PI / 2, 2.1];
  for (const yaw of yaws) {
    const wrong = arrowTip(-yaw + Math.PI);
    const want = facing(yaw);
    assert.ok(
      close(wrong[0], -want[0]) && close(wrong[1], -want[1]),
      `yaw=${yaw.toFixed(3)}: old formula ${wrong.map((v) => v.toFixed(3))} points opposite to facing ${want.map((v) => v.toFixed(3))}`,
    );
  }
});

test('the minimap map itself stays north-up: the arrow is the only rotating element', () => {
  // The helper only encodes the arrow's own rotation. The map is drawn
  // axis-aligned (north = +z maps straight down the canvas), so the arrow
  // rotation never rotates the baked background. We assert that a north-facing
  // player (yaw = PI → faces +z) yields an arrow pointing straight "down" the
  // canvas (+y), i.e. into the screen's north-to-south direction.
  const tip = arrowTip(arrowRotation(Math.PI));
  assert.ok(close(tip[0], 0) && close(tip[1], 1),
    `facing +z should draw the arrow pointing down the canvas, got ${tip.map((v) => v.toFixed(3))}`);
});
