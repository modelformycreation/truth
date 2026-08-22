// ============================================================================
// server/socket-api.js — Socket.IO wiring: rooms, lobby, gameplay, voice relay.
// Kept separate from index.js so tests can attach the exact same API to an
// in-process server on an ephemeral port.
// ============================================================================

import { EVENTS, MAX_NAME_LENGTH } from '../shared/constants.js';

export function attachSocketAPI(io, manager, config = {}, log = () => {}) {
  io.on('connection', (socket) => {
    const ctx = { room: null, player: null };

    // ---- tiny rate limiter ---------------------------------------------------
    const buckets = new Map();
    const allow = (key, perSec) => {
      const now = Date.now();
      const b = buckets.get(key) ?? { n: 0, t: now };
      if (now - b.t > 1000) { b.n = 0; b.t = now; }
      b.n += 1;
      buckets.set(key, b);
      return b.n <= perSec;
    };

    const fail = (code, message) => socket.emit(EVENTS.ROOM_ERROR, { code, message });

    const leaveRoom = (reason) => {
      if (!ctx.room || !ctx.player) return;
      ctx.player.socket = null;
      ctx.room.handleDisconnect(ctx.player, reason);
      ctx.room = null;
      ctx.player = null;
    };
    socket.on('disconnect', () => leaveRoom('disconnect'));
    socket.on(EVENTS.ROOM_LEAVE, () => { leaveRoom('left'); socket.emit(EVENTS.ROOM_LEFT, {}); });

    // ---- room lifecycle ------------------------------------------------------
    socket.on(EVENTS.ROOM_CREATE, ({ name, mapId } = {}, ack) => {
      if (!allow('create', 2)) return ack?.({ ok: false, error: 'RATE' });
      const clean = cleanName(name);
      const { room, error } = manager.create({ mapId });
      if (error) return ack?.({ ok: false, error });
      if (ctx.room) leaveRoom('switch');
      const { player, error: joinErr } = room.addPlayer(clean, socket);
      if (joinErr) return ack?.({ ok: false, error: joinErr });
      ctx.room = room; ctx.player = player;
      ack?.({ ok: true, code: room.code, sessionId: player.sessionId, playerId: player.id });
    });

    socket.on(EVENTS.ROOM_JOIN, ({ code, name } = {}, ack) => {
      if (!allow('join', 5)) return ack?.({ ok: false, error: 'RATE' });
      const clean = cleanName(name);
      const { room, error } = manager.join(code);
      if (error) return ack?.({ ok: false, error, message: 'Room not found — check the code' });
      if (room.players.size >= room.cfg.maxPlayers) {
        return ack?.({ ok: false, error: 'FULL', message: 'Room is full' });
      }
      if (ctx.room) leaveRoom('switch');
      const { player, error: joinErr } = room.addPlayer(clean, socket);
      if (joinErr) return ack?.({ ok: false, error: joinErr, message: 'Room is full' });
      ctx.room = room; ctx.player = player;
      ack?.({ ok: true, code: room.code, sessionId: player.sessionId, playerId: player.id });
    });

    socket.on(EVENTS.ROOM_REJOIN, ({ code, sessionId } = {}, ack) => {
      if (!allow('join', 5)) return ack?.({ ok: false, error: 'RATE' });
      const { room } = manager.join(code);
      if (!room) return ack?.({ ok: false, error: 'INVALID_CODE' });
      const { player, error } = room.rejoin(sessionId, socket);
      if (error) return ack?.({ ok: false, error });
      ctx.room = room; ctx.player = player;
      ack?.({ ok: true, code: room.code, sessionId: player.sessionId, playerId: player.id, phase: room.phase });
    });

    const needRoom = (event, fn, rate = 10) => (...args) => {
      const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      if (!ctx.room || !ctx.player) {
        fail('NO_ROOM', 'Join a room first');
        ack?.({ ok: false, error: 'NO_ROOM' });
        return;
      }
      if (ctx.player.socket !== socket) return; // stale socket after reconnect
      if (!allow(event, rate)) {
        ack?.({ ok: false, error: 'RATE' }); // never leave a client waiting on an ack
        return;
      }
      try {
        fn(...args);
      } catch (err) {
        log(`error in ${event}:`, err?.stack || err);
        ack?.({ ok: false, error: 'SERVER' });
      }
    };

    // ---- lobby ---------------------------------------------------------------
    socket.on(EVENTS.LOBBY_READY, needRoom(EVENTS.LOBBY_READY, ({ ready } = {}) => ctx.room.setReady(ctx.player, !!ready)));
    socket.on(EVENTS.LOBBY_PREFERENCE, needRoom(EVENTS.LOBBY_PREFERENCE, ({ pref } = {}) => ctx.room.setPreference(ctx.player, pref)));
    socket.on(EVENTS.LOBBY_SETTINGS, needRoom(EVENTS.LOBBY_SETTINGS, (patch = {}, ack) => {
      const res = ctx.room.updateSettings(ctx.player, patch);
      if (res?.error) fail('SETTINGS', res.error);
      ack?.({ ok: !res?.error, error: res?.error ?? null });
    }, 5));
    socket.on(EVENTS.LOBBY_ADD_BOT, needRoom(EVENTS.LOBBY_ADD_BOT, () => {
      const res = ctx.room.addBot(ctx.player);
      if (res?.error) fail('BOT', res.error);
    }, 2));
    socket.on(EVENTS.LOBBY_REMOVE_BOT, needRoom(EVENTS.LOBBY_REMOVE_BOT, ({ botId } = {}, ack) => {
      const res = ctx.room.removeBot(ctx.player, botId ?? null);
      if (res?.error) fail('BOT', res.error);
      ack?.({ ok: !res?.error, error: res?.error ?? null });
    }, 5));
    socket.on(EVENTS.LOBBY_KICK, needRoom(EVENTS.LOBBY_KICK, ({ playerId } = {}, ack) => {
      const res = ctx.room.kick(ctx.player, String(playerId ?? ''));
      if (res?.error) fail('KICK', res.error);
      ack?.({ ok: !res?.error, error: res?.error ?? null });
    }, 5));
    socket.on(EVENTS.GAME_START, needRoom(EVENTS.GAME_START, (_, ack) => {
      ack?.(ctx.room.start(ctx.player));
    }, 1));

    // ---- gameplay (server-authoritative) --------------------------------------
    socket.on(EVENTS.GAME_MOVE, needRoom(EVENTS.GAME_MOVE, (msg) => {
      if (!msg || typeof msg !== 'object') return;
      ctx.room.onMove(ctx.player, msg);
    }, 30));

    socket.on(EVENTS.GAME_CATCH, needRoom(EVENTS.GAME_CATCH, ({ targetId } = {}, ack) => {
      const res = ctx.room.onCatch(ctx.player, targetId ?? null);
      ack?.({ ok: res.ok, reason: res.reason ?? null, targetId: res.targetId ?? null });
    }, 5));

    // ---- clock sync: clients must not trust their local wall clock -------------
    socket.on(EVENTS.TIME_SYNC, (_, ack) => ack?.({ t: Date.now() }));

    // ---- voice: server owns channels, relays signaling only within a channel ---
    // ICE candidate exchange is bursty: a mesh peer can emit dozens of
    // candidates in well under a second, and a dropped candidate silently
    // breaks the connection. The payload is size-capped in relaySignal, so the
    // budget here is generous on purpose.
    socket.on(EVENTS.VOICE_SIGNAL, needRoom(EVENTS.VOICE_SIGNAL, ({ to, data } = {}) => {
      ctx.room.voice.relaySignal(ctx.player, String(to ?? ''), data);
    }, 400));

    socket.on(EVENTS.VOICE_TALK, needRoom(EVENTS.VOICE_TALK, ({ talking } = {}) => {
      if (ctx.room.cfg.voiceEnabled) ctx.room.voice.setTalking(ctx.player, !!talking);
    }, 8));

    socket.on(EVENTS.VOICE_MUTED, needRoom(EVENTS.VOICE_MUTED, ({ muted } = {}) => {
      ctx.room.voice.setMuted(ctx.player, !!muted);
    }, 5));

    log(`socket connected: ${socket.id}`);
  });
}

function cleanName(name) {
  return String(name ?? '').trim().slice(0, MAX_NAME_LENGTH) || 'Player';
}
