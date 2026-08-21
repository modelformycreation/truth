// ============================================================================
// server/rooms.js — private room registry: create / join by code, idle cleanup.
// In-memory for the MVP; the interface maps 1:1 to a Redis-backed store when
// public matchmaking / multiple server processes arrive (see docs/FUTURE.md).
// ============================================================================

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/constants.js';
import { GameRoom } from './game-room.js';

export class RoomManager {
  constructor({ maxRooms = 200, log = () => {} } = {}) {
    this.rooms = new Map(); // code -> GameRoom
    this.maxRooms = maxRooms;
    this.log = log;
  }

  generateCode() {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }

  create({ settings = {}, mapId = 'facility' } = {}) {
    if (this.rooms.size >= this.maxRooms) return { error: 'SERVER_FULL' };
    let code = this.generateCode();
    let guard = 0;
    while (this.rooms.has(code) && guard++ < 1000) code = this.generateCode(); // no duplicates
    const room = new GameRoom({ code, settings, mapId, log: this.log });
    room.onDispose = (r) => this.rooms.delete(r.code);
    this.rooms.set(code, room);
    this.log(`room created: ${code}`);
    return { room };
  }

  join(code) {
    const room = this.rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) return { error: 'INVALID_CODE' };
    return { room };
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += r.info.connected;
    return { rooms: this.rooms.size, players };
  }
}
