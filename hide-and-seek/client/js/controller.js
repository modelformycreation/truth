// ============================================================================
// client/js/controller.js — third-person character controller.
//
//  * input: WASD + mouse (desktop), virtual joystick + touch look (mobile)
//  * physics: gravity, jump, sprint, circle-vs-AABB collision with auto
//    step-up (stairs), ladder volumes for the two hatches
//  * camera: orbit third-person with wall collision
//  * net: sends movement at cfg.moveHz; server validates and can correct us
// ============================================================================

import { ANIM } from '../../shared/constants.js';
import { circleBoxPush, supportHeight, cameraRelativeMove, facingYaw } from '../../shared/geometry.js';
import {
  createSprintState, stickTouchStart, stickMove, stickEnd as endStickState,
  toggleSprint, releaseSprintInputs, sprinting as sprintingState,
} from '../../shared/sprint.js';

export class PlayerController {
  constructor(world, settings) {
    this.world = world;
    this.settings = settings;
    this.pos = [31.5, 0, 33.5];
    this.vy = 0;
    this.yaw = Math.PI;              // facing
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 3.4;
    this.grounded = true;
    this.anim = ANIM.IDLE;
    this.frozen = false;
    this.speed2D = 0;
    this.onMove = null;              // set by main: (payload) => void
    this.onFootstep = null;
    this.onJump = null;
    this.onLand = null;

    this.input = { x: 0, z: 0, jump: false, lookDx: 0, lookDy: 0 };
    // ---- Feature 3: FREE FIRE-style LOCKED sprint. ----
    // `sprintLock` is a persistent state (the GOLD indicator). It is turned on
    // by holding the joystick at the rim for `sprintLockHoldSec`, or by tapping
    // the 🏃 button. It stays on after the stick springs back to centre until
    // it is cancelled by tapping 🏃 again or by the NEXT new joystick touch.
    // The state machine lives in shared/sprint.js (pure + unit-tested).
    this.sprint = createSprintState();
    this.sprintMode = 'free-fire'; // Feature 6: 'free-fire' (locked) | 'classic' (hold)
    this._jumpLatched = false; // a tap shorter than one frame still jumps
    this._jumpHeld = false;
    this._sendAccum = 0;
    this._footAccum = 0;
    this._keys = new Set();
    this._bindEvents();
  }

  _bindEvents() {
    const canvas = this.world.renderer.domElement;
    this._onKeyDown = (e) => {
      if (e.target?.tagName === 'INPUT') return;
      this._keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => this._keys.delete(e.code);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);

    // ---- mouse look: drag or pointer lock ----
    this._onMouseDown = (e) => {
      if (e.target !== canvas) return;
      this._dragging = true;
      if (canvas.requestPointerLock && e.button === 0 && !('ontouchstart' in window)) {
        canvas.requestPointerLock();
      }
    };
    this._onMouseUp = () => { this._dragging = false; };
    this._onMouseMove = (e) => {
      if (document.pointerLockElement === canvas || this._dragging) {
        this.input.lookDx += e.movementX * 0.0026;
        this.input.lookDy += e.movementY * 0.0022;
      }
    };
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    this._onWheel = (e) => {
      this.camDist = Math.max(1.6, Math.min(6.5, this.camDist + e.deltaY * 0.0022));
    };
    window.addEventListener('wheel', this._wheelRef = this._onWheel, { passive: true });
  }

  /**
   * Wire the on-screen controls (joystick, look zone, sprint/jump buttons).
   *
   * Fixes that matter on real phones:
   *  - move/end listeners live on `window`, so dragging the thumb outside the
   *    joystick element keeps tracking instead of freezing the stick;
   *  - `touchcancel` is handled everywhere (iOS cancels touches on gestures,
   *    call banners, app switches) so inputs can never stick ON;
   *  - the stick radius is measured from the element instead of hard-coded,
   *    so CSS and hit-testing can never disagree;
   *  - jump taps are LATCHED, so a tap shorter than one animation frame is
   *    still consumed by update() instead of being silently dropped;
   *  - sprint supports hold *and* tap-to-lock, and is released on cancel;
   *  - buttons swallow the touch (preventDefault) to kill the iOS double-tap
   *    zoom / 300 ms synthetic click without blocking the joystick.
   */
  attachTouch(joystickEl, lookZone, sprintBtn, jumpBtn) {
    const cfg = () => this.settings ?? {};
    // ---- virtual joystick ----
    const base = joystickEl.querySelector('.stick-base');
    const nub = joystickEl.querySelector('.stick-nub');
    let stickId = null, cx = 0, cy = 0, R = 56;

    const stickStart = (t) => {
      // Feature 3: the NEXT new joystick touch after sprint is locked ON
      // cancels the lock — that touch becomes normal walking. (The touch that
      // ARMED the lock is the same touch and must NOT self-cancel; it already
      // ended before this stickStart fires.)
      stickTouchStart(this.sprint);
      this._paintSprint?.();
      const r = base.getBoundingClientRect();
      // radius from the live layout (never trust a hard-coded constant)
      R = Math.max(24, Math.min(r.width, r.height) / 2);
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      stickId = t.identifier;
      handleStickMove(t);
    };
    const handleStickMove = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.input.x = dx / R;
      this.input.z = dy / R;
      // push the stick to the rim to sprint (threshold is a config value)
      const edge = cfg().joystickSprintThreshold ?? 0.9;
      const rim = (Math.min(d, R) / R) > edge;
      // Feature 3: hold the stick at the rim for `sprintLockHoldSec` to LOCK
      // sprint on (it persists after the stick springs back to centre).
      const holdMs = (cfg().sprintLockHoldSec ?? 1) * 1000;
      stickMove(this.sprint, rim, performance.now(), holdMs);
      if (rim && this.sprint.lock) this._paintSprint?.();
    };
    const stickEnd = () => {
      stickId = null;
      nub.style.transform = 'translate(-50%, -50%)';
      this.input.x = 0; this.input.z = 0;
      endStickState(this.sprint);
    };

    joystickEl.addEventListener('touchstart', (e) => {
      if (stickId !== null) return;
      e.preventDefault();
      stickStart(e.changedTouches[0]);
    }, { passive: false });
    // move/end on window: the thumb regularly leaves the joystick element
    window.addEventListener('touchmove', (e) => {
      if (stickId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { e.preventDefault(); handleStickMove(t); }
      }
    }, { passive: false });
    const stickTouchEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) stickEnd();
    };
    window.addEventListener('touchend', stickTouchEnd, { passive: true });
    window.addEventListener('touchcancel', stickTouchEnd, { passive: true });

    // ---- look zone: any touch not on a UI control drags the camera ----
    let lookId = null, lx = 0, ly = 0;
    lookZone.addEventListener('touchstart', (e) => {
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (lookId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) {
          this.input.lookDx += (t.clientX - lx) * 0.0042;
          this.input.lookDy += (t.clientY - ly) * 0.0038;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    const lookEnd = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    };
    window.addEventListener('touchend', lookEnd, { passive: true });
    window.addEventListener('touchcancel', lookEnd, { passive: true });

    // ---- action buttons ----------------------------------------------------
    // One press/release core shared by touch + mouse. `touchGuard` stops the
    // synthetic mouse events iOS/Android fire after a touch from double-firing.
    const bindHold = (el, press, release) => {
      let touching = false;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();          // no double-tap zoom, no 300 ms ghost click
        e.stopPropagation();         // never reaches the look zone underneath
        touching = true;
        press();
      }, { passive: false });
      const end = (e) => {
        if (!touching) return;
        e.preventDefault();
        touching = false;
        release();
        setTimeout(() => { touching = false; }, 0);
      };
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
      el.addEventListener('mousedown', (e) => { if (touching) return; e.preventDefault(); press(); });
      el.addEventListener('mouseup', () => { if (!touching) release(); });
      el.addEventListener('mouseleave', () => { if (!touching) release(); });
    };

    // SPRINT (Feature 3): the 🏃 button is a TAP-TO-TOGGLE that flips the
    // LOCKED sprint state (on <-> off). No hold-to-sprint on the button — the
    // GOLD `sprint-on` state is the locked-sprint indicator. (Desktop sprint =
    // holding Shift, handled in update().)
    const paintSprint = () => {
      const on = this.sprint.lock;
      sprintBtn.classList.toggle('sprint-on', on);
      sprintBtn.setAttribute('aria-pressed', String(!!on));
    };
    bindHold(sprintBtn, () => {
      toggleSprint(this.sprint);            // tap toggles the locked state
      paintSprint();
    }, () => { /* release is a no-op: the lock persists */ });

    // JUMP — latched so a tap shorter than a frame still registers.
    bindHold(jumpBtn, () => {
      this.input.jump = true;
      this._jumpLatched = true;
      jumpBtn.classList.add('sprint-on');
    }, () => {
      this.input.jump = false;
      jumpBtn.classList.remove('sprint-on');
    });

    this._paintSprint = paintSprint;
  }

  /** Release every held input — used when the tab is backgrounded or a round ends. */
  releaseInputs() {
    this.input.x = 0; this.input.z = 0;
    this.input.jump = false;
    this.input.lookDx = 0; this.input.lookDy = 0;
    releaseSprintInputs(this.sprint);
    this._jumpLatched = false;
    this._keys.clear();
    this._paintSprint?.();
  }

  applyCorrection(p, r) {
    const dx = Math.hypot(p[0] - this.pos[0], p[2] - this.pos[2]);
    if (dx > 0.02) this.pos = [...p];
    if (Number.isFinite(r)) this.yaw = r;
    this.vy = 0;
  }

  teleport(p, r) {
    this.pos = [...p];
    if (Number.isFinite(r)) this.yaw = r;
    this.vy = 0;
  }

  update(dt, camera) {
    const cfg = this.settings;
    const sens = cfg.lookSensitivity ?? 1;

    // ---- look ----
    // Convention (standard, non-inverted):
    //   drag RIGHT  -> view rotates right  (camYaw -= dx, camera orbits left)
    //   drag DOWN   -> view looks DOWN     (camera rises: camPitch += dy)
    // The sign here used to be flipped, so on laptops/trackpads dragging the
    // mouse down made the camera look UP (user-reported bug, Aug 2026).
    this.camYaw -= this.input.lookDx * sens;
    this.camPitch += (cfg.invertY ? -1 : 1) * this.input.lookDy * sens;
    this.camPitch = Math.max(-0.5, Math.min(1.15, this.camPitch));
    this.input.lookDx = 0; this.input.lookDy = 0;

    // ---- movement input (camera relative) ----
    let ix = this.input.x, iz = this.input.z;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) iz -= 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) iz += 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) ix -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) ix += 1;
    const kbSprint = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    // Feature 3: sprint from Shift (desktop hold) or the LOCKED sprint state,
    // or while the joystick is currently pushed to its rim. Walking is simply
    // "not sprinting". A locked sprint persists after the stick returns to
    // centre until the next new joystick touch or another 🏃 tap.
    const freeFire = this.sprintMode !== 'classic';
    const sprinting = sprintingState(this.sprint, kbSprint, freeFire);
    // jump: held input, Space, or a latched tap from a previous frame
    const wantJump = this.input.jump || this._keys.has('Space') || this._jumpLatched;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }

    const frozen = this.frozen;
    let speed = 0;
    const deadzone = cfg.joystickDeadzone ?? 0.08;
    if (!frozen && mag > deadzone) {
      // camera-relative basis (see shared/geometry.js — W must move AWAY from
      // the camera; this used to be negated, which inverted W/S).
      const [wx, wz] = cameraRelativeMove(ix, iz, this.camYaw);
      const targetYaw = facingYaw(wx, wz);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 12);
      speed = sprinting ? cfg.sprintSpeed : cfg.walkSpeed;
      speed *= Math.min(1, mag); // analogue stick: partial tilt = partial speed
      // (wx, wz) has magnitude `mag`, so normalise before applying speed
      this._tryMove(wx / Math.max(mag, 0.001) * speed * dt, wz / Math.max(mag, 0.001) * speed * dt);
    }
    // `speed` already includes the analogue magnitude — multiplying again here
    // under-reported movement on the joystick (broke run anim + footsteps).
    this.speed2D = speed;

    // ---- ladders ----
    let onLadder = false;
    for (const l of this.world.ladders) {
      const [x, y, z] = this.pos;
      if (x > l.min[0] && x < l.max[0] && y > l.min[1] - 0.2 && y < l.max[1] && z > l.min[2] && z < l.max[2]) {
        onLadder = true;
        if (wantJump) {
          this.vy = 3.4;
          this.pos[1] = Math.min(l.max[1], this.pos[1] + this.vy * dt);
          this.grounded = false;
        } else if (!this.grounded) {
          this.vy = Math.max(this.vy, -1.2); // slow slide down
        }
        break;
      }
    }

    // ---- gravity ----
    if (!onLadder) {
      if (wantJump && this.grounded && !frozen) {
        this.vy = cfg.jumpSpeed;
        this.grounded = false;
        this.onJump?.(this.pos);
      }
      this.vy += cfg.gravity * dt;
    }
    // the latched tap has now been offered to both the ladder and the jump
    // handler — consume it so one tap never produces two jumps
    this._jumpLatched = false;
    const prevY = this.pos[1];
    this.pos[1] += this.vy * dt;

    // ---- ground support ----
    const support = supportHeight(this.pos[0], this.pos[2], this.pos[1], this.world.colliders, -3.6, cfg.stepHeight);
    if (this.pos[1] <= support + 0.001 && this.vy <= 0.01) {
      if (!this.grounded && this.vy < -3) this.onLand?.(this.pos, this.vy);
      this.pos[1] = support;
      this.vy = 0;
      this.grounded = true;
    } else if (this.pos[1] > support + 0.05) {
      this.grounded = false;
    }
    // walking down small steps stays grounded
    if (this.grounded && prevY - this.pos[1] < 0 && this.vy === 0 && Math.abs(support - this.pos[1]) < 0.5) {
      this.pos[1] = Math.max(support, this.pos[1] - 8 * dt);
    }

    // ---- world bounds ----
    const b = this.world.bounds;
    this.pos[0] = Math.max(b.minX + 0.5, Math.min(b.maxX - 0.5, this.pos[0]));
    this.pos[2] = Math.max(b.minZ + 0.5, Math.min(b.maxZ - 0.5, this.pos[2]));
    if (this.pos[1] < -8) { this.pos[1] = 0; this.vy = 0; }

    // ---- anim state ----
    this.anim = !this.grounded ? ANIM.JUMP
      : this.speed2D < 0.2 ? ANIM.IDLE
      : this.speed2D > cfg.walkSpeed + 0.4 ? ANIM.RUN : ANIM.WALK;

    // ---- footsteps (stride-based: one step per N metres travelled) ----
    const running = this.speed2D > cfg.walkSpeed + 0.4;
    if (this.grounded && this.speed2D > 0.5) {
      this._footAccum += dt * this.speed2D;
      const stride = running
        ? (cfg.footstepStrideRunM ?? 2.1)
        : (cfg.footstepStrideWalkM ?? 1.6);
      if (this._footAccum > stride) {
        this._footAccum = 0;
        this.onFootstep?.(this.pos, running);
      }
    } else {
      this._footAccum = 0;
    }

    // ---- camera ----
    const head = [this.pos[0], this.pos[1] + 1.55, this.pos[2]];
    const dir = [
      Math.sin(this.camYaw) * Math.cos(this.camPitch),
      Math.sin(this.camPitch),
      Math.cos(this.camYaw) * Math.cos(this.camPitch),
    ];
    let dist = this.camDist;
    // pull the camera in if a wall is in the way (segment vs colliders)
    for (const c of this.world.colliders) {
      const hit = raySlab(head, dir, c);
      if (hit !== null && hit < dist) dist = Math.max(0.4, hit - 0.25);
    }
    camera.position.set(head[0] + dir[0] * dist, head[1] + dir[1] * dist + 0.15, head[2] + dir[2] * dist);
    camera.lookAt(head[0], head[1] + 0.15, head[2]);
  }

  _tryMove(dx, dz) {
    const cfg = this.settings;
    const bodyLo = this.pos[1] + cfg.stepHeight;
    const bodyHi = this.pos[1] + 1.7;
    // X axis
    let nx = this.pos[0] + dx;
    for (const c of this.world.colliders) {
      if (c.max[1] <= bodyLo || c.min[1] >= bodyHi) continue;
      if (nx + 0.35 > c.min[0] && nx - 0.35 < c.max[0] &&
          this.pos[2] + 0.35 > c.min[2] && this.pos[2] - 0.35 < c.max[2]) {
        const fix = circleBoxPush(nx, this.pos[2], 0.35, c);
        if (fix) [nx, this.pos[2]] = fix;
      }
    }
    this.pos[0] = nx;
    // Z axis
    let nz = this.pos[2] + dz;
    for (const c of this.world.colliders) {
      if (c.max[1] <= bodyLo || c.min[1] >= bodyHi) continue;
      if (this.pos[0] + 0.35 > c.min[0] && this.pos[0] - 0.35 < c.max[0] &&
          nz + 0.35 > c.min[2] && nz - 0.35 < c.max[2]) {
        const fix = circleBoxPush(this.pos[0], nz, 0.35, c);
        if (fix) [this.pos[0], nz] = fix;
      }
    }
    this.pos[2] = nz;
    // step up onto low obstacles (stairs, pallets...)
    const support = supportHeight(this.pos[0], this.pos[2], this.pos[1], this.world.colliders, -3.6, cfg.stepHeight);
    if (this.grounded && support > this.pos[1] && support - this.pos[1] <= cfg.stepHeight) {
      this.pos[1] = support;
    }
  }

  /** movement packet at moveHz */
  netTick(dt, now, hz) {
    this._sendAccum += dt;
    const interval = 1 / hz;
    if (this._sendAccum < interval) return null;
    this._sendAccum = 0;
    return {
      p: [round3(this.pos[0]), round3(this.pos[1]), round3(this.pos[2])],
      r: Math.round(this.yaw * 100) / 100,
      a: this.anim,
    };
  }
}

function round3(v) { return Math.round(v * 1000) / 1000; }

/** ray vs AABB returning entry distance, or null. */
function raySlab(o, d, box) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return null;
    } else {
      let t1 = (box.min[i] - o[i]) / d[i];
      let t2 = (box.max[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin >= 0 ? tmin : null;
}
