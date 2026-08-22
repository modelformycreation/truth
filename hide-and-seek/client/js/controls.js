// ============================================================================
// client/js/controls.js — Feature 6: custom controls + persistence.
//
// Identity (browsers cannot read MAC addresses, so we use these instead):
//   • DEVICE ID  — a UUID the client generates once and stores in localStorage
//   • GAME CODE  — a SECRET code the USER chooses (numbers/letters/emojis/…).
//                  It is their personal game identity; no other player sees it.
//
// Controls are saved in TWO places:
//   1. the device's localStorage (automatic), and
//   2. the game server, keyed by BOTH the device id and the game code — so the
//      same controls come back across name changes, network changes, and (via
//      the code) device/browser changes.
// ============================================================================

import { CONTROLS_DEFAULTS } from '../../shared/controls.js';

const LS_CONTROLS = 'hs_controls';
const LS_DEVICE = 'hs_device_id';
const LS_CODE = 'hs_game_code';

/** The device's unique id — generated once, stored forever. */
export function getDeviceId() {
  try {
    let id = localStorage.getItem(LS_DEVICE);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.())
        || `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(LS_DEVICE, id);
    }
    return id;
  } catch { return 'dev-unknown'; }
}

/** The user's SECRET game code (or '' if they have not set one yet). */
export function getGameCode() {
  try { return localStorage.getItem(LS_CODE) || ''; } catch { return ''; }
}

/** Persist the user's chosen secret game code. */
export function setGameCode(code) {
  const clean = String(code ?? '').trim();
  try {
    if (clean) localStorage.setItem(LS_CODE, clean);
    else localStorage.removeItem(LS_CODE);
  } catch { /* private mode */ }
  return clean;
}

export function loadControls() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(LS_CONTROLS) || '{}'); } catch { /* corrupt */ }
  return sanitizeLocal({ ...CONTROLS_DEFAULTS, ...stored });
}

export function saveControls(controls) {
  try { localStorage.setItem(LS_CONTROLS, JSON.stringify(controls)); } catch { /* private mode */ }
}

/** Merge/repair a controls object on the client (same rules as the server). */
function sanitizeLocal(c) {
  const out = { ...CONTROLS_DEFAULTS };
  if (typeof c.lookSensitivity === 'number' && Number.isFinite(c.lookSensitivity)) out.lookSensitivity = c.lookSensitivity;
  if (typeof c.invertY === 'boolean') out.invertY = c.invertY;
  if (typeof c.joystickSize === 'number' && Number.isFinite(c.joystickSize)) out.joystickSize = c.joystickSize;
  if (c.joystickSide === 'left' || c.joystickSide === 'right') out.joystickSide = c.joystickSide;
  if (c.sprintMode === 'free-fire' || c.sprintMode === 'classic') out.sprintMode = c.sprintMode;
  if (c.buttons && typeof c.buttons === 'object') {
    for (const k of ['sprint', 'jump', 'find', 'mic', 'scan']) {
      const b = c.buttons[k];
      if (b && typeof b.x === 'number' && typeof b.y === 'number') {
        out.buttons[k] = { x: Math.min(1, Math.max(0, b.x)), y: Math.min(1, Math.max(0, b.y)) };
      }
    }
  }
  return out;
}
