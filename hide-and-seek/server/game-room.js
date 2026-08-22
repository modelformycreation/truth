// ============================================================================
// server/game-room.js — one room = one authoritative game state machine.
//
//   LOBBY → TEAM_ASSIGNMENT → PREPARATION → ACTIVE_ROUND → ROUND_END
//         → RESULTS → LOBBY
//
// The server owns: teams, statuses, phase transitions, the official timers,
// catch validation, visibility, voice channels. Clients only send inputs
// (movement, catch attempts, lobby actions) and receive filtered state.
// ============================================================================

import {
  EVENTS, PHASES, TEAMS, STATUS, MAX_NAME_LENGTH,
} from '../shared/constants.js';
import { effectiveSettings, sanitizeRoomSettings } from '../shared/config.js';
import { getMap, computeHideSpots } from '../shared/map.js';
import { Player } from './players.js';
import { assignTeams } from './teams.js';
import { validateMove } from './movement.js';
import { attemptCatch } from './catch.js';
import { buildWorldSnapshot, isVisible } from './visibility.js';
import { VoiceManager } from './voice.js';

const WORLD_PHASES = new Set([
  PHASES.TEAM_ASSIGNMENT, PHASES.PREPARATION, PHASES.ACTIVE_ROUND, PHASES.ROUND_END, PHASES.RESULTS,
]);

export class GameRoom {
  constructor({ code, settings = {}, mapId = 'facility', log = () => {} }) {
    this.code = code;
    this.roomSettings = { ...settings };
    this.mapId = mapId;
    this.map = getMap(mapId);
    this.log = log;

    this.players = new Map();      // id -> Player
    this.hostId = null;
    this.phase = PHASES.LOBBY;
    this.phaseEndsAt = null;
    this.startedAt = 0;
    this.roundNumber = 0;
    this.lastResults = null;

    this.voice = new VoiceManager(this);
    this._phaseTimer = null;
    this._tickTimer = null;
    this._graceTimers = new Map(); // playerId -> timeout
    this._idleTimer = null;
    this._disposed = false;
  }

  get cfg() { return effectiveSettings(this.roomSettings); }

  // ---------------------------------------------------------------- lobby ---

  addPlayer(name, socket) {
    let clean = String(name ?? 'Player').trim().slice(0, MAX_NAME_LENGTH) || 'Player';
    // avoid duplicate names
    const names = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (names.has(clean.toLowerCase())) {
      for (let i = 2; i < 50; i++) {
        if (!names.has(`${clean} ${i}`.toLowerCase())) { clean = `${clean} ${i}`; break; }
      }
    }
    if (this.players.size >= this.cfg.maxPlayers) return { error: 'FULL' };

    const player = new Player({ name: clean });
    this.players.set(player.id, player);
    this.attachSocket(player, socket);
    if (!this.hostId) this.hostId = player.id;
    this._cancelIdle();
    this.broadcastRoomState();
    this.broadcast(EVENTS.GAME_FEED, { text: `${clean} joined`, kind: 'join' });
    this.log(`room ${this.code}: ${clean} joined (${this.players.size} players)`);
    return { player };
  }

  attachSocket(player, socket) {
    player.socket = socket;
    player.disconnectedAt = null;
    if (this.phase === PHASES.LOBBY || this.phase === PHASES.RESULTS) {
      if (this.cfg.voiceEnabled && this.cfg.voiceLobbyShared) {
        this.voice.setChannel(player, 'lobby');
      }
    } else if (player.team) {
      this.voice.setChannel(player, player.team); // automatic team channel
    }
  }

  /** Full reconnect: same session slot, restores team + status + position. */
  rejoin(sessionId, socket) {
    for (const p of this.players.values()) {
      if (p.sessionId === sessionId && !p.connected) {
        const wasDisconnected = p.status === STATUS.DISCONNECTED;
        if (wasDisconnected) {
          p.status = p.prevStatus ?? STATUS.WAITING;
          clearTimeout(this._graceTimers.get(p.id));
          this._graceTimers.delete(p.id);
        }
        this.attachSocket(p, socket);
        this.broadcastRoomState();
        this.broadcast(EVENTS.GAME_FEED, { text: `${p.name} reconnected`, kind: 'join' });
        // catch the returning player up on where they are
        p.send(EVENTS.GAME_CORRECTION, { p: p.pos, r: p.rot });
        this.log(`room ${this.code}: ${p.name} rejoined`);
        return { player: p, restored: wasDisconnected };
      }
    }
    return { error: 'SESSION_NOT_FOUND' };
  }

  /** Socket dropped (network or quit). Keep the slot for a grace period. */
  handleDisconnect(player, reason = 'left') {
    player.socket = null;
    player.talking = false;
    this.voice.dropPlayer(player);
    this.voice.publishAll();

    // An explicit LEAVE is a decision, not a network blip: free the slot (and
    // the host crown) immediately. Only real drops get a reconnect grace.
    const explicit = reason === 'left' || reason === 'switch';

    if (this.phase !== PHASES.LOBBY) {
      player.prevStatus = player.status;
      player.status = STATUS.DISCONNECTED;
    }
    this.broadcast(EVENTS.GAME_FEED, {
      text: `${player.name} ${explicit ? 'left' : 'disconnected'}`,
      kind: 'leave',
    });

    if (explicit) {
      this._expireGrace(player.id, reason);
      return;
    }

    // in the lobby a disconnect is just a leave (short grace for refresh)
    this._scheduleRemoval(
      player,
      this.phase === PHASES.LOBBY ? 15_000 : this.cfg.reconnectGraceSec * 1000,
      reason,
    );
    // a disconnected hider must not become an invisible winner: if every
    // remaining hider is disconnected, they forfeit on expiry (handled in
    // _expireGrace); win checks also run immediately if none remain.
    if (this.phase !== PHASES.LOBBY) this.checkWinConditions();
    this.broadcastRoomState();
  }

  _scheduleRemoval(player, delay, reason) {
    clearTimeout(this._graceTimers.get(player.id));
    const graceTimer = setTimeout(() => this._expireGrace(player.id, reason), delay);
    graceTimer.unref?.();
    this._graceTimers.set(player.id, graceTimer);
  }

  _expireGrace(playerId, reason) {
    const player = this.players.get(playerId);
    if (!player || player.connected) return;
    const wasHiddenHider = player.team === TEAMS.HIDERS && player.prevStatus === STATUS.HIDDEN;
    this.players.delete(playerId);
    this._graceTimers.delete(playerId);

    if (wasHiddenHider && (this.phase === PHASES.ACTIVE_ROUND || this.phase === PHASES.PREPARATION)) {
      // forfeit: counts as found so seekers can still win
      player.status = STATUS.FOUND;
      player.foundBy = null;
      this.broadcast(EVENTS.GAME_CATCH_RESULT, {
        ok: true, forfeit: true, targetId: player.id, targetName: player.name,
      });
      this.broadcast(EVENTS.GAME_FEED, { text: `${player.name} left the match — counts as found`, kind: 'catch' });
    }
    if (player.id === this.hostId) this._migrateHost();
    if (this.players.size === 0) {
      this._startIdle();
    } else {
      this.broadcastRoomState();
      this.checkWinConditions();
    }
    this.log(`room ${this.code}: ${player.name} removed (${reason})`);
  }

  _migrateHost() {
    const next = [...this.players.values()]
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    this.hostId = next ? next.id : null;
    if (next) {
      this.broadcast(EVENTS.GAME_FEED, { text: `${next.name} is now the host`, kind: 'info' });
    }
  }

  _startIdle() {
    this._cancelIdle();
    this._idleTimer = setTimeout(() => this.dispose(), this.cfg.roomIdleSec * 1000);
    this._idleTimer.unref?.();
  }
  _cancelIdle() {
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    clearTimeout(this._phaseTimer);
    clearInterval(this._tickTimer);
    for (const t of this._graceTimers.values()) clearTimeout(t);
    this._cancelIdle();
    for (const p of this.players.values()) {
      if (p.socket) p.socket.disconnect(true);
      p.socket = null;
    }
    this.players.clear();
    this.onDispose?.(this);
  }

  // ------------------------------------------------------------- lobby api --

  setReady(player, ready) {
    if (this.phase !== PHASES.LOBBY) return;
    player.ready = !!ready;
    this.broadcastRoomState();
  }

  setPreference(player, pref) {
    if (this.phase !== PHASES.LOBBY) return;
    if (pref === 'any' || pref === TEAMS.HIDERS || pref === TEAMS.SEEKERS) {
      player.preference = pref;
      this.broadcastRoomState();
    }
  }

  updateSettings(player, patch) {
    if (player.id !== this.hostId) return { error: 'NOT_HOST' };
    if (this.phase !== PHASES.LOBBY) return { error: 'NOT_IN_LOBBY' };
    this.roomSettings = { ...this.roomSettings, ...sanitizeRoomSettings(patch) };
    this.broadcastRoomState();
    return { ok: true };
  }

  addBot(player) {
    if (player.id !== this.hostId) return { error: 'NOT_HOST' };
    if (this.phase !== PHASES.LOBBY) return { error: 'NOT_IN_LOBBY' };
    if (this.players.size >= this.cfg.maxPlayers) return { error: 'FULL' };
    const n = [...this.players.values()].filter((p) => p.isBot).length + 1;
    const bot = new Player({ name: `BOT Hider ${n}`, isBot: true });
    bot.ready = true;
    this.players.set(bot.id, bot);
    this.broadcastRoomState();
    this.broadcast(EVENTS.GAME_FEED, { text: `${bot.name} added (practice)`, kind: 'info' });
    return { ok: true, botId: bot.id };
  }

  removeBot(player, botId) {
    if (player.id !== this.hostId) return { error: 'NOT_HOST' };
    if (this.phase !== PHASES.LOBBY) return { error: 'NOT_IN_LOBBY' };
    // no id given → remove the most recently added bot (the UI's "－ BOT" button)
    const bot = botId
      ? this.players.get(botId)
      : [...this.players.values()].filter((p) => p.isBot).pop();
    if (!bot || !bot.isBot) return { error: 'NOT_BOT' };
    this.players.delete(bot.id);
    this.broadcastRoomState();
    this.broadcast(EVENTS.GAME_FEED, { text: `${bot.name} removed`, kind: 'leave' });
    return { ok: true, botId: bot.id };
  }

  /**
   * Host removes a player (or a bot) from the room for good.
   *
   * Host-only, validated server-side exactly like addBot/removeBot — a client
   * that fakes the event, or targets the host, is refused. The kicked socket is
   * told why and then disconnected; its grace slot is dropped so it cannot
   * silently rejoin with the stored session id.
   */
  kick(player, targetId) {
    if (player.id !== this.hostId) return { error: 'NOT_HOST' };
    const target = this.players.get(targetId);
    if (!target) return { error: 'NO_TARGET' };
    if (target.id === this.hostId) return { error: 'CANNOT_KICK_HOST' };
    if (target.isBot) return this.removeBot(player, target.id);

    // drop any pending reconnect grace so the session cannot come back
    clearTimeout(this._graceTimers.get(target.id));
    this._graceTimers.delete(target.id);
    this.players.delete(target.id);
    this.voice.dropPlayer(target);

    const wasHiddenHider = target.team === TEAMS.HIDERS && target.status === STATUS.HIDDEN;
    target.send(EVENTS.ROOM_KICKED, { by: player.name, code: this.code });
    const sock = target.socket;
    target.socket = null;
    // let the kick message flush before tearing the transport down
    const t = setTimeout(() => sock?.disconnect(true), 50);
    t.unref?.();

    this.broadcast(EVENTS.GAME_FEED, { text: `${target.name} was removed by the host`, kind: 'leave' });
    this.broadcastRoomState();
    // a kicked hider must not leave the round unwinnable
    if (wasHiddenHider) this.checkWinConditions();
    this.voice.publishAll();
    this.log(`room ${this.code}: ${target.name} kicked by ${player.name}`);
    return { ok: true, targetId: target.id };
  }

  // ---------------------------------------------------------------- start ---

  canStart() {
    const participants = [...this.players.values()].filter((p) => p.connected || p.isBot);
    if (participants.length < Math.max(2, this.cfg.minPlayers)) {
      return { error: 'NOT_ENOUGH_PLAYERS', have: participants.length, need: this.cfg.minPlayers };
    }
    const notReady = participants.filter((p) => !p.isBot && !p.ready && p.id !== this.hostId);
    if (notReady.length > 0) return { error: 'PLAYERS_NOT_READY', who: notReady.map((p) => p.name) };
    return { ok: true };
  }

  start(player) {
    if (player.id !== this.hostId) return { error: 'NOT_HOST' };
    if (this.phase !== PHASES.LOBBY) return { error: 'ALREADY_STARTED' };
    const check = this.canStart();
    if (!check.ok) return check;

    this.roundNumber += 1;
    this.startedAt = Date.now();
    // disconnected players holding grace slots are skipped; bots always hide
    const participants = [...this.players.values()].filter((p) => p.connected || p.isBot);
    const teams = assignTeams(participants, this.cfg);
    let gi = 0;
    for (const p of participants) {
      p.team = teams.get(p.id);
      p.status = p.team === TEAMS.HIDERS ? STATUS.HIDDEN : STATUS.ACTIVE;
      p.foundAt = null; p.foundBy = null; p.catches = 0;
      p.ready = p.isBot;
      p.pos = [...this.map.spawns.gathering[gi % this.map.spawns.gathering.length]];
      p.pos[1] = 0;
      p.rot = Math.PI; // face the entrance
      p.anim = 'idle';
      gi += 1;
    }
    this.broadcast(EVENTS.GAME_TEAMS, {
      round: this.roundNumber,
      teams: {
        [TEAMS.HIDERS]: this.teamList(TEAMS.HIDERS),
        [TEAMS.SEEKERS]: this.teamList(TEAMS.SEEKERS),
      },
    });
    // voice channels switch to team channels immediately
    for (const p of participants) {
      if (!p.isBot && this.cfg.voiceEnabled) this.voice.setChannel(p, p.team);
    }
    this.setPhase(PHASES.TEAM_ASSIGNMENT, this.cfg.teamAssignmentSec);
    return { ok: true };
  }

  teamList(team) {
    return [...this.players.values()]
      .filter((p) => p.team === team)
      .map((p) => ({ id: p.id, name: p.name, bot: p.isBot }));
  }

  // --------------------------------------------------------------- phases ---

  setPhase(phase, durationSec = 0) {
    clearTimeout(this._phaseTimer);
    this.phase = phase;
    const endsAt = durationSec > 0 ? Date.now() + durationSec * 1000 : null;
    this.phaseEndsAt = endsAt;

    if (phase === PHASES.PREPARATION) {
      // seekers teleport to the entrance, blindfolded (movement frozen)
      let si = 0;
      for (const p of this.players.values()) {
        if (p.team === TEAMS.SEEKERS) {
          p.pos = [...this.map.spawns.seekers[si % this.map.spawns.seekers.length]];
          p.pos[1] = 0;
          p.rot = Math.PI; // face north into the facility
          si += 1;
        } else if (p.isBot) {
          const spots = computeHideSpots(this.map);
          p.pos = [...spots[Math.floor(Math.random() * spots.length)]];
        }
      }
    }

    if (phase === PHASES.ACTIVE_ROUND) {
      this.broadcast(EVENTS.GAME_FEED, { text: 'READY OR NOT — seekers released!', kind: 'start' });
    }

    if (phase === PHASES.LOBBY) {
      for (const p of this.players.values()) {
        p.team = null;
        p.status = STATUS.WAITING;
        p.prevStatus = null;
        p.ready = p.isBot;
        if (!p.isBot && this.cfg.voiceEnabled) {
          this.voice.setChannel(p, this.cfg.voiceLobbyShared ? 'lobby' : null);
        }
      }
      this.voice.publishAll();
    }

    if (WORLD_PHASES.has(phase)) this._ensureTick();
    else this._stopTick();

    this.broadcast(EVENTS.GAME_PHASE, {
      phase,
      durationSec,
      endsAt,
      serverNow: Date.now(),
      round: this.roundNumber,
    });
    this.broadcastRoomState();
    this.log(`room ${this.code}: phase -> ${phase} (${durationSec}s)`);

    if (durationSec > 0) {
      this._phaseTimer = setTimeout(() => this._phaseExpired(), durationSec * 1000 + 30);
      this._phaseTimer.unref?.();
    }

    // Win conditions are evaluated only AFTER this phase has been fully
    // announced and its timer armed. Calling checkWinConditions() from inside
    // setPhase() used to re-enter setPhase(ROUND_END) mid-flight, so clients
    // received ROUND_END *before* ACTIVE_ROUND and the outer call then
    // overwrote the round-end timer with the (already dead) round timer.
    if (phase === PHASES.ACTIVE_ROUND) {
      // e.g. every hider — or every seeker — dropped during preparation
      this.checkWinConditions();
    }
  }

  _phaseExpired(force = false) {
    if (this._disposed) return;
    // The phase timeout and the snapshot tick's safety net can both decide the
    // same transition is due. Whoever runs second would otherwise advance a
    // SECOND phase, silently skipping one. Re-check the deadline: after the
    // first caller transitioned, the new phase's deadline is in the future, so
    // the straggler becomes a no-op. `force` is for tests/forced endings.
    if (!force && this.phaseEndsAt && Date.now() < this.phaseEndsAt - 50) return;
    switch (this.phase) {
      case PHASES.TEAM_ASSIGNMENT:
        this.setPhase(PHASES.PREPARATION, this.cfg.preparationSec);
        break;
      case PHASES.PREPARATION:
        this.setPhase(PHASES.ACTIVE_ROUND, this.cfg.roundSec);
        break;
      case PHASES.ACTIVE_ROUND:
        this.endRound('TIME_EXPIRED');
        break;
      case PHASES.ROUND_END:
        this.setPhase(PHASES.RESULTS, this.cfg.resultsSec);
        break;
      case PHASES.RESULTS:
        this.setPhase(PHASES.LOBBY);
        break;
      default:
        break;
    }
  }

  /** Fire the current phase timer early (used by tests + forced endings). */
  forcePhaseExpiry() { this._phaseExpired(true); }

  endRound(reason) {
    if (this.phase !== PHASES.ACTIVE_ROUND) return;
    const hidden = this.hiddenHiders();
    let winner;
    if (hidden.length === 0) winner = TEAMS.SEEKERS;
    else if (reason === 'ALL_SEEKERS_LEFT') winner = TEAMS.HIDERS;
    else if (reason === 'TIME_EXPIRED') winner = TEAMS.HIDERS;
    else winner = hidden.length > 0 ? TEAMS.HIDERS : TEAMS.SEEKERS;

    const now = Date.now();
    const timeRemainingMs = Math.max(0, (this.phaseEndsAt ?? now) - now);
    this.lastResults = {
      winner,
      reason,
      round: this.roundNumber,
      foundCount: this.hiders().filter((p) => p.status === STATUS.FOUND).length,
      hiderCount: this.hiders().length,
      hidersRemaining: hidden.map((p) => p.name),
      timeRemainingMs: reason === 'TIME_EXPIRED' ? 0 : timeRemainingMs,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, team: p.team, status: p.status === STATUS.DISCONNECTED ? p.prevStatus : p.status,
        catches: p.catches, foundBy: p.foundBy ? this.players.get(p.foundBy)?.name ?? '—' : null, bot: p.isBot,
      })),
    };
    this.broadcast(EVENTS.GAME_RESULTS, this.lastResults);
    this.broadcast(EVENTS.GAME_FEED, {
      text: winner === TEAMS.SEEKERS ? 'SEEKERS WIN — all hiders found!' : 'HIDERS WIN!',
      kind: 'end',
    });
    this.setPhase(PHASES.ROUND_END, this.cfg.roundEndSec);
  }

  hiddenHiders() {
    return [...this.players.values()].filter(
      (p) => p.team === TEAMS.HIDERS && p.status === STATUS.HIDDEN,
    );
  }
  hiders() {
    return [...this.players.values()].filter((p) => p.team === TEAMS.HIDERS);
  }
  connectedSeekers() {
    return [...this.players.values()].filter(
      (p) => p.team === TEAMS.SEEKERS && p.connected,
    );
  }

  checkWinConditions() {
    if (this.phase === PHASES.PREPARATION || this.phase === PHASES.ACTIVE_ROUND) {
      if (this.hiddenHiders().length === 0) this.endRound('ALL_FOUND');
      else if (this.phase === PHASES.ACTIVE_ROUND && this.connectedSeekers().length === 0) {
        this.endRound('ALL_SEEKERS_LEFT');
      }
    }
  }

  // ------------------------------------------------------------ gameplay ---

  onMove(player, msg) {
    const res = validateMove(this, player, msg, Date.now());
    if (res.corrected) player.send(EVENTS.GAME_CORRECTION, { p: player.pos, r: player.rot });
    if (res.kick) {
      this.broadcast(EVENTS.GAME_FEED, { text: `${player.name} kicked (movement violations)`, kind: 'leave' });
      player.socket?.disconnect(true);
    }
  }

  onCatch(player, targetId) {
    const result = attemptCatch(this, player, targetId, Date.now());
    if (result.ok) {
      this.broadcast(EVENTS.GAME_CATCH_RESULT, {
        ok: true, targetId: result.targetId, byId: result.byId,
        targetName: result.targetName, byName: result.byName, distance: result.distance,
      });
      this.broadcast(EVENTS.GAME_FEED, {
        text: `🔎 ${result.byName} found ${result.targetName}`,
        kind: 'catch',
      });
      const target = this.players.get(result.targetId);
      if (target?.connected) {
        target.send(EVENTS.GAME_FEED, { text: `💥 You were found by ${result.byName}!`, kind: 'caught' });
      }
      this.checkWinConditions();
    } else {
      player.send(EVENTS.GAME_CATCH_RESULT, { ok: false, reason: result.reason, targetId: result.targetId ?? null });
    }
    return result;
  }

  // ------------------------------------------------------------- snapshots --

  _ensureTick() {
    if (this._tickTimer) return;
    const interval = Math.round(1000 / this.cfg.snapshotHz);
    this._tickTimer = setInterval(() => this._tick(), interval);
    this._tickTimer.unref?.();
  }
  _stopTick() {
    clearInterval(this._tickTimer);
    this._tickTimer = null;
  }

  _tick() {
    if (this._disposed) return;
    if (!WORLD_PHASES.has(this.phase)) { this._stopTick(); return; }
    // safety: fire phase transitions even if a timeout was lost
    if (this.phaseEndsAt && Date.now() > this.phaseEndsAt + 250) this._phaseExpired();

    const hiddenCount = this.hiddenHiders().length;
    for (const viewer of this.players.values()) {
      if (!viewer.connected) continue;
      viewer.send(EVENTS.GAME_SNAPSHOT, {
        t: Date.now(),
        ph: this.phase,
        ea: this.phaseEndsAt,
        hc: hiddenCount,
        pl: buildWorldSnapshot(this, viewer),
      });
    }
  }

  // ---------------------------------------------------------------- misc ----

  broadcast(event, payload) {
    for (const p of this.players.values()) {
      if (p.connected) p.send(event, payload);
    }
  }

  broadcastRoomState() {
    const hostId = this.hostId;
    const players = [...this.players.values()].map((p) => {
      const dto = p.toDTO();
      dto.host = p.id === hostId;
      return dto;
    });
    this.broadcast(EVENTS.ROOM_STATE, {
      code: this.code,
      hostId,
      phase: this.phase,
      round: this.roundNumber,
      mapId: this.mapId,
      mapName: this.map.name,
      settings: { ...this.cfg },
      players,
    });
  }

  get info() {
    return {
      code: this.code,
      phase: this.phase,
      players: this.players.size,
      connected: [...this.players.values()].filter((p) => p.connected).length,
    };
  }

  /** test/introspection helper */
  visibleTo(viewer, target) { return isVisible(viewer, target, this); }
}
