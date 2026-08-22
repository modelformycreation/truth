// ============================================================================
// client/js/net.js — Socket.IO wrapper: ack requests with timeout, automatic
// reconnection, and server-clock synchronisation (never trust the local clock
// for the round timer).
// ============================================================================

import { EVENTS } from '../../shared/constants.js';

export class Net {
  constructor(bus) {
    this.bus = bus;
    this.socket = null;
    this.clockOffset = 0;      // serverNow ≈ Date.now() + clockOffset
    this._syncSamples = [];
    this._syncTimer = null;
    this.connected = false;
  }

  connect() {
    if (this.socket) return;
    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelayMax: 4000,
      timeout: 12000,
    });

    for (const ev of [
      EVENTS.ROOM_STATE, EVENTS.ROOM_ERROR, EVENTS.ROOM_JOINED, EVENTS.ROOM_LEFT,
      EVENTS.ROOM_KICKED,
      EVENTS.GAME_PHASE, EVENTS.GAME_TEAMS, EVENTS.GAME_SNAPSHOT, EVENTS.GAME_CORRECTION,
      EVENTS.GAME_CATCH_RESULT, EVENTS.GAME_RESULTS, EVENTS.GAME_FEED,
      EVENTS.VOICE_CHANNEL, EVENTS.VOICE_MEMBERS, EVENTS.VOICE_SIGNAL,
      EVENTS.VOICE_TALK, EVENTS.VOICE_MUTED, EVENTS.TIME_SYNC_RESP,
    ]) {
      this.socket.on(ev, (payload) => this.bus.emit(`net:${ev}`, payload));
    }

    this.socket.on('connect', () => {
      this.connected = true;
      this.bus.emit('net:connected');
      this.syncClock();
      if (!this._syncTimer) this._syncTimer = setInterval(() => this.syncClock(), 10000);
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
      this.bus.emit('net:disconnected');
    });
    this.socket.on('connect_error', (err) => {
      console.warn('socket connect_error:', err.message);
    });
  }

  /** emit with ack -> Promise (never hangs forever) */
  request(event, payload = {}, timeoutMs = 6000) {
    return new Promise((resolve) => {
      if (!this.socket?.connected) return resolve({ ok: false, error: 'NOT_CONNECTED' });
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve({ ok: false, error: 'TIMEOUT' }); }
      }, timeoutMs);
      this.socket.emit(event, payload, (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res ?? { ok: false, error: 'NO_RESPONSE' });
      });
    });
  }

  send(event, payload) { this.socket?.emit(event, payload); }

  /** NTP-lite: offset = serverNow + RTT/2 - localNow, keep the best sample. */
  syncClock() {
    if (!this.socket?.connected) return;
    const t0 = Date.now();
    this.socket.timeout(3000).emit(EVENTS.TIME_SYNC, {}, (err, res) => {
      if (err || !res?.t) return;
      const t1 = Date.now();
      const rtt = t1 - t0;
      const offset = res.t + rtt / 2 - t1;
      this._syncSamples.push({ offset, rtt });
      if (this._syncSamples.length > 8) this._syncSamples.shift();
      const best = this._syncSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      this.clockOffset = best.offset;
    });
  }

  serverNow() { return Date.now() + this.clockOffset; }
}
