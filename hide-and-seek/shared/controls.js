// ============================================================================
// shared/controls.js — Feature 6: custom control settings.
//
// Shared so the server can sanitise what the client sends, and the client can
// load/merge the same schema. Controls a player can freely customise:
//   lookSensitivity   — camera look speed
//   invertY           — invert vertical look
//   joystickSize      — virtual joystick scale (0.7x .. 1.4x)
//   joystickSide      — 'left' | 'right' (which side of the screen the stick is on)
//   sprintMode        — 'free-fire' (locked sprint, Feature 3) | 'classic' (hold)
//   buttons           — DRAGGABLE on-screen button positions (sprint/jump/find/
//                       mic/scan), stored as fractional positions (0..1) on the
//                       screen so they survive any viewport.
// ============================================================================

export const CONTROLS_DEFAULTS = {
  lookSensitivity: 1.0,
  invertY: false,
  joystickSize: 1.0,
  joystickSide: 'left',
  sprintMode: 'free-fire',
  buttons: { sprint: null, jump: null, find: null, mic: null, scan: null },
};

const CLAMP = {
  lookSensitivity: [0.3, 2.5],
  joystickSize: [0.7, 1.4],
};

/**
 * Sanitise a controls object from the client into a safe, complete object.
 * Returns null if the input is fundamentally malformed (not an object).
 */
export function sanitizeControls(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = { ...CONTROLS_DEFAULTS };

  if (typeof raw.lookSensitivity === 'number' && Number.isFinite(raw.lookSensitivity)) {
    out.lookSensitivity = Math.min(CLAMP.lookSensitivity[1], Math.max(CLAMP.lookSensitivity[0], raw.lookSensitivity));
  }
  if (typeof raw.invertY === 'boolean') out.invertY = raw.invertY;

  if (typeof raw.joystickSize === 'number' && Number.isFinite(raw.joystickSize)) {
    out.joystickSize = Math.min(CLAMP.joystickSize[1], Math.max(CLAMP.joystickSize[0], raw.joystickSize));
  }
  if (raw.joystickSide === 'left' || raw.joystickSide === 'right') out.joystickSide = raw.joystickSide;
  if (raw.sprintMode === 'free-fire' || raw.sprintMode === 'classic') out.sprintMode = raw.sprintMode;

  if (raw.buttons && typeof raw.buttons === 'object') {
    for (const key of ['sprint', 'jump', 'find', 'mic', 'scan']) {
      const b = raw.buttons[key];
      if (b && typeof b === 'object') {
        const x = Number(b.x), y = Number(b.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          out.buttons[key] = {
            x: Math.min(1, Math.max(0, x)),
            y: Math.min(1, Math.max(0, y)),
          };
        }
      }
    }
  }
  return out;
}
