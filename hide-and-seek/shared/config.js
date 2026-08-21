// ============================================================================
// shared/config.js
// Central configuration. Every gameplay rule lives here or in per-room
// settings derived from here — nothing gameplay-relevant is hard-coded
// elsewhere. Designers can override defaults in `config.local.json` next to
// the server entry point (see server/index.js) or via environment variables.
// ============================================================================

export const DEFAULT_CONFIG = {
  // ---- room / lobby -------------------------------------------------------
  maxPlayers: 10,               // absolute room cap
  minPlayers: 4,                // default players needed to start (host may lower, see bounds)
  allowTeamPreference: true,    // players may pick preferred team in lobby
  roomIdleSec: 180,             // empty room cleanup delay
  reconnectGraceSec: 45,        // disconnected player keeps their slot this long

  // ---- teams ---------------------------------------------------------------
  seekerRatio: 0.375,           // fraction of players assigned as seekers (8 -> 3)

  // ---- round timing (seconds) ----------------------------------------------
  teamAssignmentSec: 6,
  preparationSec: 30,           // the "HIDING" phase for hiders
  roundSec: 300,                // active round duration
  roundEndSec: 8,
  resultsSec: 18,

  // ---- core mechanics -------------------------------------------------------
  catchRadius: 2.0,             // meters — server-validated catch distance
  requireLineOfSight: true,     // walls block catches when enabled
  revealRadius: 7.0,            // meters — hidden enemies become visible (with LOS)
  foundRoam: true,              // found hiders may keep wandering, visible to all

  // ---- movement --------------------------------------------------------------
  walkSpeed: 3.4,               // m/s
  sprintSpeed: 5.8,             // m/s
  jumpSpeed: 5.4,               // m/s initial vertical velocity
  gravity: -14.0,               // m/s^2
  playerRadius: 0.35,           // collision cylinder radius
  eyeHeight: 1.5,               // LOS ray origin height above feet
  stepHeight: 0.36,             // auto step-up (stairs)

  // ---- network ----------------------------------------------------------------
  snapshotHz: 15,               // server -> client state broadcast rate
  moveHz: 15,                   // client -> server movement rate

  // ---- features -----------------------------------------------------------------
  voiceEnabled: true,
  voiceLobbyShared: true,       // everyone shares one voice channel while in lobby
  abilitiesEnabled: false,      // future mechanics toggle (hider/seeker abilities)
  minimapShowTeammates: true,
  minimapShowFound: true,

  // ---- anti-cheat ------------------------------------------------------------------
  speedTolerance: 1.45,         // multiplier over sprint speed before correction
  maxMoveWarnings: 30,          // corrections before kick
  catchCooldownMs: 400,         // min ms between catch attempts per seeker
};

// Per-room, host-editable settings (subset of DEFAULT_CONFIG).
// Clamped so a malicious/buggy host cannot break the server.
export const ROOM_SETTINGS_SCHEMA = {
  minPlayers: { min: 2, max: 10, integer: true },
  seekerRatio: { min: 0.2, max: 0.5 },
  preparationSec: { min: 10, max: 120, integer: true },
  roundSec: { min: 60, max: 900, integer: true },
  catchRadius: { min: 0.5, max: 5.0 },
  requireLineOfSight: { type: 'boolean' },
  revealRadius: { min: 2.0, max: 20.0 },
  allowTeamPreference: { type: 'boolean' },
  voiceEnabled: { type: 'boolean' },
  abilitiesEnabled: { type: 'boolean' },
  minimapShowTeammates: { type: 'boolean' },
};

// Validate + clamp a settings patch coming from a host client.
export function sanitizeRoomSettings(patch, base = {}) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const [key, rule] of Object.entries(ROOM_SETTINGS_SCHEMA)) {
    if (!(key in patch)) continue;
    let v = patch[key];
    if (rule.type === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (rule.integer) v = Math.round(v);
    v = Math.min(rule.max, Math.max(rule.min, v));
    if (rule.integer) out[key] = Math.round(v);
    else out[key] = Math.round(v * 1000) / 1000;
    void base;
  }
  return out;
}

// Effective settings for a room = defaults overridden by stored room settings.
export function effectiveSettings(roomSettings = {}) {
  return { ...DEFAULT_CONFIG, ...roomSettings };
}
