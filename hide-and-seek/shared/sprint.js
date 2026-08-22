// ============================================================================
// shared/sprint.js — Feature 3: FREE FIRE-style LOCKED sprint state machine.
//
// Pure, browser-free logic so it is unit-testable. The controller
// (client/js/controller.js) is the only caller — it feeds touch events in here
// and reads `sprinting()` for the movement speed.
//
// The rules (locked spec):
//   • The joystick ALWAYS springs back to centre on release (no change needed
//     here — that is the stick visual).
//   • SPRINT ON: hold the joystick at the rim for `holdMs`, then release → the
//     character KEEPS sprinting (locked), OR tap the 🏃 button.
//   • SPRINT OFF: tap 🏃 again, OR the NEXT new joystick touch / any joystick
//     movement while locked (that touch becomes normal walking).
//   • Edge case (must NOT self-cancel): the hold that ARMS the sprint is the
//     SAME touch — it arms, it does not cancel. Only the NEXT new joystick
//     touch (after the lock is on) turns it off.
// ============================================================================

/**
 * Fresh sprint state.
 *   lock:          boolean — locked sprint is ON (persistent, the GOLD indicator)
 *   stickSprint:   boolean — joystick is currently pushed to the rim (sprints
 *                            while held, does not persist)
 *   rimHoldStart:  number|null — timestamp when the stick first reached the rim
 *                            (for arming the lock after `holdMs`)
 */
export function createSprintState() {
  return { lock: false, stickSprint: false, rimHoldStart: null };
}

/**
 * A NEW joystick touch has begun. If sprint is currently locked, this touch
 * cancels the lock (that touch becomes normal walking). Does NOT self-cancel:
 * this is only the touch that STARTS after the lock was already armed.
 */
export function stickTouchStart(state) {
  if (state.lock) state.lock = false;
  state.rimHoldStart = null;
  return state;
}

/**
 * The joystick moved. `atRim` = the stick is pushed past the sprint threshold
 * right now, `now` = performance.now()-style timestamp, `holdMs` = how long to
 * hold at the rim before locking sprint on (config `sprintLockHoldSec`).
 */
export function stickMove(state, atRim, now, holdMs) {
  state.stickSprint = atRim;
  if (atRim) {
    if (state.rimHoldStart === null) {
      state.rimHoldStart = now;
    } else if (now - state.rimHoldStart >= holdMs) {
      state.lock = true;            // armed — persists after the stick returns
      state.rimHoldStart = null;    // don't keep re-arming every move
    }
  } else {
    state.rimHoldStart = null;
  }
  return state;
}

/** The joystick was released (or cancelled). Clears the transient stick state. */
export function stickEnd(state) {
  state.stickSprint = false;
  state.rimHoldStart = null;
  return state;
}

/** The 🏃 button was tapped: flip the LOCKED state. */
export function toggleSprint(state) {
  state.lock = !state.lock;
  state.rimHoldStart = null;
  return state;
}

/** Release every transient input (used when the tab backgrounds / round ends). */
export function releaseSprintInputs(state) {
  state.lock = false;
  state.stickSprint = false;
  state.rimHoldStart = null;
  return state;
}

/**
 * Whether the player is sprinting this frame. Desktop: holding Shift. Touch:
 * the LOCKED state (Free Fire mode), or the stick currently at the rim. In
 * "classic" mode the locked state is ignored (sprint only while the stick is
 * at the rim / Shift is held) — this is the Feature 6 `sprintMode` control.
 * Walking is simply "not sprinting".
 */
export function sprinting(state, kbSprint = false, freeFire = true) {
  return !!kbSprint || state.stickSprint || (freeFire && state.lock);
}
