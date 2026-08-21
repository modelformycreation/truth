// ============================================================================
// server/players.js — authoritative player state (server-owned, never trusted
// from the client). Position/rotation here are the values used for catch
// validation and visibility.
// ============================================================================

import { STATUS, ANIM } from '../shared/constants.js';

let nextId = 1;

export class Player {
  constructor({ name, isBot = false }) {
    this.id = `p${nextId++}`;
    this.sessionId = `s${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    this.name = name;
    this.isBot = !!isBot;
    this.socket = null; // set while connected

    // lobby
    this.ready = isBot;
    this.preference = 'any'; // 'any' | 'HIDERS' | 'SEEKERS'
    this.joinedAt = Date.now();

    // game state (authoritative)
    this.team = null;
    this.status = STATUS.WAITING;
    this.prevStatus = null;      // status before DISCONNECTED (for rejoin restore)
    this.pos = [0, 0, 0];
    this.rot = 0;
    this.anim = ANIM.IDLE;
    this.foundAt = null;
    this.foundBy = null;         // player id or null (disconnect forfeit)
    this.catches = 0;

    // voice
    this.talking = false;
    this.muted = false;
    this.voiceChannel = null;

    // anti-cheat bookkeeping
    this.lastMoveAt = Date.now();
    this.moveWarnings = 0;
    this.lastCatchAt = 0;

    // disconnect handling
    this.disconnectedAt = null;
  }

  get connected() { return !!this.socket; }

  send(event, payload) {
    if (this.socket) this.socket.emit(event, payload);
  }

  /** Compact snapshot DTO (also used for lobby lists). */
  toDTO() {
    return {
      id: this.id,
      n: this.name,
      t: this.team,
      s: this.status,
      ready: this.ready,
      pref: this.preference,
      bot: this.isBot,
      host: false, // patched by room
      conn: this.connected || this.isBot, // bots never "disconnect"
    };
  }

  /** In-world state DTO (part of per-viewer filtered snapshots). */
  toWorldDTO(extra = {}) {
    return {
      i: this.id,
      n: this.name,
      t: this.team,
      s: this.status,
      p: [round2(this.pos[0]), round2(this.pos[1]), round2(this.pos[2])],
      r: round2(this.rot),
      a: this.anim,
      tl: this.talking,
      mu: this.muted,
      bot: this.isBot,
      ...extra,
    };
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
