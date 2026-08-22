// ============================================================================
// server/controls.js — Feature 6: per-player control settings, keyed by the
// player's secret GAME CODE and/or their DEVICE ID.
//
// The client saves its custom controls in TWO places:
//   1. its own localStorage (automatic), and
//   2. here, on the game server, keyed by BOTH the device id and the game code.
// A returning player who enters their game code (or comes back on the same
// device) gets their exact control layout back — across name changes, network
// changes, and even device/browser changes.
//
// The store is in-memory for the MVP (consistent with the rest of the server:
// rooms are in-memory too). Nothing here is trusted from the client — every
// value is sanitised/whitelisted before storage.
// ============================================================================

import { CONTROLS_DEFAULTS, sanitizeControls } from '../shared/controls.js';

export class ControlsStore {
  constructor() {
    this.byCode = new Map();     // game code   -> controls
    this.byDevice = new Map();   // device id   -> controls
  }

  /**
   * Save controls. At least one of `code` / `deviceId` must be present.
   * Returns { ok } or { error }.
   */
  save({ code, deviceId, controls }) {
    const codeStr = code ? String(code).trim().slice(0, 128) : '';
    const deviceStr = deviceId ? String(deviceId).slice(0, 128) : '';
    if (!codeStr && !deviceStr) return { error: 'NO_KEY' };
    const safe = sanitizeControls(controls);
    if (safe === null) return { error: 'BAD' };
    if (codeStr) this.byCode.set(codeStr, safe);
    if (deviceStr) this.byDevice.set(deviceStr, safe);
    return { ok: true };
  }

  /** Look up saved controls by game code, then by device id. */
  get({ code, deviceId }) {
    const codeStr = code ? String(code).trim().slice(0, 128) : '';
    const deviceStr = deviceId ? String(deviceId).slice(0, 128) : '';
    if (codeStr && this.byCode.has(codeStr)) return this.byCode.get(codeStr);
    if (deviceStr && this.byDevice.has(deviceStr)) return this.byDevice.get(deviceStr);
    return null;
  }
}

export { CONTROLS_DEFAULTS };
