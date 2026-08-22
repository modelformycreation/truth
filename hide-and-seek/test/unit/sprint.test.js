// ============================================================================
// Regression tests — Feature 3: FREE FIRE-style LOCKED sprint.
//
// Sprint is a persistent (locked) state, not just-while-held:
//   • hold the joystick at the rim ~1s then release  → character KEEPS sprinting
//   • OR tap the 🏃 button
//   • sprint OFF: tap 🏃 again, OR the NEXT new joystick touch (that touch walks)
//   • the touch that ARMS the lock must NOT self-cancel — only the NEXT new
//     touch after the lock is on turns it off
//   • desktop: holding Shift still sprints
// The state machine lives in shared/sprint.js so it is unit-testable.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSprintState, stickTouchStart, stickMove, stickEnd,
  toggleSprint, releaseSprintInputs, sprinting,
} from '../../shared/sprint.js';

const HOLD_MS = 1000;

test('a fresh state is walking, not sprinting', () => {
  const s = createSprintState();
  assert.equal(s.lock, false);
  assert.equal(s.stickSprint, false);
  assert.equal(sprinting(s), false);
  assert.equal(sprinting(s, true), true, 'Shift (desktop hold) always sprints');
});

test('sprinting is false when idle, true when the stick is at the rim', () => {
  const s = createSprintState();
  stickMove(s, true, 100, HOLD_MS);        // rim
  assert.equal(s.stickSprint, true);
  assert.equal(sprinting(s), true);
  stickEnd(s);                             // released, not yet locked
  assert.equal(s.stickSprint, false);
  assert.equal(s.lock, false);
  assert.equal(sprinting(s), false);
});

test('holding the stick at the rim for ~1s LOCKS sprint on', () => {
  const s = createSprintState();
  stickMove(s, true, 100, HOLD_MS);        // arm started at t=100
  stickMove(s, true, 400, HOLD_MS);        // 300ms in — not locked yet
  assert.equal(s.lock, false, 'must not lock before holdMs elapses');
  stickMove(s, true, 100 + HOLD_MS + 1, HOLD_MS); // just past the threshold
  assert.equal(s.lock, true, 'must lock after holding at the rim ~1s');
});

test('a locked sprint PERSISTS after the stick springs back to centre', () => {
  const s = createSprintState();
  stickMove(s, true, 0, HOLD_MS);
  stickMove(s, true, HOLD_MS + 1, HOLD_MS); // armed → locked
  assert.equal(s.lock, true);
  stickEnd(s);                             // release → stick returns to centre
  assert.equal(s.stickSprint, false);
  assert.equal(s.lock, true, 'the lock must NOT be cancelled by the release');
  assert.equal(sprinting(s), true, 'character keeps sprinting after release');
});

test('the NEXT new joystick touch cancels the lock (that touch walks)', () => {
  const s = createSprintState();
  stickMove(s, true, 0, HOLD_MS);
  stickMove(s, true, HOLD_MS + 1, HOLD_MS);
  stickEnd(s);
  assert.equal(s.lock, true);
  stickTouchStart(s);                      // a NEW touch begins
  assert.equal(s.lock, false, 'the next new touch turns the lock off');
});

test('REGRESSION: the touch that ARMS the lock does NOT self-cancel', () => {
  const s = createSprintState();
  // The same touch arms the lock mid-touch (at ~1s) and is still going. It must
  // stay locked — it is not a "new" touch.
  stickMove(s, true, 0, HOLD_MS);
  stickMove(s, true, HOLD_MS + 1, HOLD_MS); // arms at the threshold
  stickMove(s, true, HOLD_MS + 200, HOLD_MS); // still the same touch
  assert.equal(s.lock, true, 'arming touch must keep the lock, not cancel it');
  assert.equal(sprinting(s), true);
});

test('tapping the 🏃 button toggles the locked state on and off', () => {
  const s = createSprintState();
  toggleSprint(s); assert.equal(s.lock, true);
  toggleSprint(s); assert.equal(s.lock, false);
  toggleSprint(s); assert.equal(s.lock, true);
  toggleSprint(s); assert.equal(s.lock, false);
});

test('releaseSprintInputs clears every sprint input (backgrounding / round end)', () => {
  const s = createSprintState();
  stickMove(s, true, 0, HOLD_MS);
  stickMove(s, true, HOLD_MS + 1, HOLD_MS);
  stickEnd(s);
  assert.equal(s.lock, true);
  releaseSprintInputs(s);
  assert.equal(s.lock, false);
  assert.equal(s.stickSprint, false);
  assert.equal(s.rimHoldStart, null);
  assert.equal(sprinting(s), false);
});
