// Test helpers: rooms with fake sockets for direct unit testing of the
// authoritative game logic (no network needed).
import { GameRoom } from '../server/game-room.js';
import { Player } from '../server/players.js';
import { PHASES, TEAMS, STATUS } from '../shared/constants.js';

export function fakeSocket() {
  const sent = [];
  return {
    id: 'sock-' + Math.random().toString(36).slice(2, 8),
    emit: (event, payload) => sent.push({ event, payload }),
    disconnect() {},
    sent,
  };
}

export function mkRoom(settings = {}) {
  const room = new GameRoom({ code: 'TEST01', settings });
  return room;
}

export function addPlayer(room, name, opts = {}) {
  const { team = null, pos = [10, 0, 10], status = STATUS.WAITING, isBot = false, pref = 'any' } = opts;
  const p = new Player({ name, isBot });
  p.socket = fakeSocket();
  p.preference = pref;
  room.players.set(p.id, p);
  if (!room.hostId) room.hostId = p.id;
  if (team) { p.team = team; p.status = status; }
  p.pos = [...pos];
  return p;
}

/** Drop a room straight into an active round with the given roster. */
export function activeRoundRoom({ seekers = [], hiders = [], settings = {} } = {}) {
  const room = mkRoom(settings);
  for (const [name, pos] of seekers) addPlayer(room, name, { team: TEAMS.SEEKERS, status: STATUS.ACTIVE, pos });
  for (const [name, pos] of hiders) addPlayer(room, name, { team: TEAMS.HIDERS, status: STATUS.HIDDEN, pos });
  room.roundNumber = 1;
  room.setPhase(PHASES.ACTIVE_ROUND, 99999);
  return room;
}

export function lastSent(player, event) {
  for (let i = player.socket.sent.length - 1; i >= 0; i--) {
    if (player.socket.sent[i].event === event) return player.socket.sent[i].payload;
  }
  return null;
}

export { PHASES, TEAMS, STATUS };
