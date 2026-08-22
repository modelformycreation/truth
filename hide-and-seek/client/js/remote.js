// ============================================================================
// client/js/remote.js — remote players: interpolation buffer (~120 ms in the
// past), footstep audio from observed motion, reveal/found visuals.
// Remote players simply DO NOT EXIST here unless the server put them in our
// filtered snapshot — a hacked client cannot render what it never received.
// ============================================================================

import * as THREE from 'three';
import { createAvatar } from './avatar.js';
import { STATUS, ANIM } from '../../shared/constants.js';

// Interpolation delay, in MILLISECONDS — the buffer timestamps are
// performance.now() values. This used to be `0.12`, i.e. 0.12 ms, which meant
// remote players were never actually interpolated (they snapped to the newest
// sample and jittered at the 15 Hz snapshot rate).
const INTERP_DELAY_MS = 120;

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map(); // id -> { avatar, buffer: [{t,p,r,a}], lastPos, onFootstep }
    this.onFootstep = null;
    this.selfId = null;
  }

  /** Apply one filtered snapshot. `serverNow` aligns our clock to the server. */
  applySnapshot(players, serverNow, clientNow) {
    const clockSkew = clientNow - serverNow; // convert server t -> local timeline
    const seen = new Set();
    for (const dto of players) {
      if (dto.i === this.selfId) continue;
      seen.add(dto.i);
      let entry = this.map.get(dto.i);
      if (!entry) {
        const avatar = createAvatar({ id: dto.i, name: dto.n, team: dto.t, isBot: dto.bot });
        this.scene.add(avatar.group);
        entry = { avatar, buffer: [], lastP: dto.p, lastT: 0 };
        this.map.set(dto.i, entry);
      }
      entry.avatar.state.team = dto.t;
      // Interpolation only needs relative order + fixed delay, so local
      // receipt time is the right timeline (server ticks arrive ~15 Hz).
      entry.buffer.push({ t: clientNow, p: dto.p, r: dto.r, a: dto.a });
      if (entry.buffer.length > 20) entry.buffer.shift();

      if (dto.s === STATUS.FOUND) entry.avatar.setFound();
      entry.avatar.setRevealed(!!dto.rv && dto.s === STATUS.HIDDEN);
      entry.avatar.setTalking(!!dto.tl);
      // supply-crate effect glows (server timestamps; clockSkew aligns them)
      const localNow = serverNow + clockSkew;
      entry.avatar.setEffect(localNow < (dto.bf || 0) ? 'boost'
        : localNow < (dto.cf || 0) ? 'cloak' : null);

      // footstep detection from real movement.
      // `clientNow` is in milliseconds, so the delta must be converted to
      // seconds before comparing against m/s thresholds — the old code divided
      // by milliseconds, making `speed` 1000x too small so REMOTE FOOTSTEPS
      // NEVER PLAYED.
      if (entry.lastT > 0) {
        const d = Math.hypot(dto.p[0] - entry.lastP[0], dto.p[2] - entry.lastP[2]);
        const dtSec = Math.max(0.001, (clientNow - entry.lastT) / 1000);
        const speed = d / dtSec;
        const grounded = dto.a !== ANIM.JUMP;
        if (grounded && speed > 0.5) {
          this.onFootstep?.(dto.p, speed > 4.5, dto.i, dto.t);
        }
      }
      entry.lastP = dto.p;
      entry.lastT = clientNow;
    }
    for (const [id, entry] of this.map) {
      if (!seen.has(id)) {
        entry.avatar.dispose(this.scene);
        this.map.delete(id);
      }
    }
  }

  update(dt, now) {
    const targetT = now - INTERP_DELAY_MS;
    for (const entry of this.map.values()) {
      const buf = entry.buffer;
      if (buf.length === 0) continue;
      let a = null, b = null;
      for (let i = buf.length - 1; i > 0; i--) {
        if (buf[i - 1].t <= targetT) { a = buf[i - 1]; b = buf[i]; break; }
      }
      if (!a) { a = b = buf[0]; }
      if (!b) b = buf[buf.length - 1];
      const span = Math.max(1e-3, b.t - a.t);
      const k = Math.max(0, Math.min(1, (targetT - a.t) / span));
      const x = a.p[0] + (b.p[0] - a.p[0]) * k;
      const y = a.p[1] + (b.p[1] - a.p[1]) * k;
      const z = a.p[2] + (b.p[2] - a.p[2]) * k;
      entry.avatar.setPos(x, y, z);
      let dr = b.r - a.r;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      entry.avatar.setRot(a.r + dr * k);
      const speed = (a.a === ANIM.RUN ? 5.5 : a.a === ANIM.WALK ? 3.0 : a.a === ANIM.JUMP ? 2 : 0);
      entry.avatar.animate(dt, speed, a.a !== ANIM.JUMP, 0);
    }
  }

  clear() {
    for (const entry of this.map.values()) entry.avatar.dispose(this.scene);
    this.map.clear();
  }

  getById(id) { return this.map.get(id); }
}
