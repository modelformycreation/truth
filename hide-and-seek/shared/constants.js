// ============================================================================
// shared/constants.js
// Canonical enums and wire protocol event names shared by client and server.
// ============================================================================

export const TEAMS = {
  HIDERS: 'HIDERS',
  SEEKERS: 'SEEKERS',
};

export const PHASES = {
  LOBBY: 'LOBBY',
  TEAM_ASSIGNMENT: 'TEAM_ASSIGNMENT', // short reveal: teams announced, all gather
  PREPARATION: 'PREPARATION',         // "hiding phase": hiders hide, seekers frozen
  ACTIVE_ROUND: 'ACTIVE_ROUND',       // seekers hunt, catches allowed
  ROUND_END: 'ROUND_END',             // winner announced, free roam
  RESULTS: 'RESULTS',                 // results screen, then back to LOBBY
};

// Player statuses (hiders). Seekers are always 'active' while in a round.
export const STATUS = {
  WAITING: 'waiting',      // lobby / not yet assigned
  ACTIVE: 'active',        // seeker or pre-round
  HIDDEN: 'hidden',        // hider not yet found
  FOUND: 'found',          // hider that has been caught (or forfeited by disconnect)
  DISCONNECTED: 'disconnected',
};

export const ANIM = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  JUMP: 'jump',
};

export const EVENTS = {
  // client -> server
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_REJOIN: 'room:rejoin',
  ROOM_LEAVE: 'room:leave',
  LOBBY_READY: 'lobby:ready',
  LOBBY_PREFERENCE: 'lobby:preference',
  LOBBY_SETTINGS: 'lobby:settings',
  LOBBY_ADD_BOT: 'lobby:addBot',
  LOBBY_REMOVE_BOT: 'lobby:removeBot',
  GAME_START: 'game:start',
  GAME_MOVE: 'game:move',
  GAME_CATCH: 'game:catch',
  VOICE_SIGNAL: 'voice:signal',
  VOICE_TALK: 'voice:talk',
  VOICE_MUTED: 'voice:muted',
  TIME_SYNC: 'time:sync',

  // server -> client
  ROOM_STATE: 'room:state',
  ROOM_ERROR: 'room:error',
  ROOM_JOINED: 'room:joined',
  ROOM_LEFT: 'room:left',
  GAME_PHASE: 'game:phase',
  GAME_TEAMS: 'game:teams',
  GAME_SNAPSHOT: 'game:snapshot',
  GAME_CORRECTION: 'game:correction',
  GAME_CATCH_RESULT: 'game:catchResult',
  GAME_RESULTS: 'game:results',
  GAME_FEED: 'game:feed',
  VOICE_CHANNEL: 'voice:channel',
  VOICE_MEMBERS: 'voice:members',
  VOICE_SIGNAL: 'voice:signal',
  VOICE_TALK: 'voice:talk',
  VOICE_MUTED: 'voice:muted',
  TIME_SYNC_RESP: 'time:syncResp',
};

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
export const ROOM_CODE_LENGTH = 6;

export const PLAYER_COLORS = {
  [TEAMS.HIDERS]: 0x35d07f,   // green
  [TEAMS.SEEKERS]: 0xff6a3d, // orange
  found: 0xdedede,           // greyed out
};

export const MAX_NAME_LENGTH = 16;
