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
import { circleBoxPush, supportHeight } from '../../shared/geometry.js';

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

    this.input = { x: 0, z: 0, sprint: false, jump: false, lookDx: 0, lookDy: 0 };
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

  attachTouch(joystickEl, lookZone, sprintBtn, jumpBtn) {
    // ---- virtual joystick ----
    const base = joystickEl.querySelector('.stick-base');
    const nub = joystickEl.querySelector('.stick-nub');
    let stickId = null, cx = 0, cy = 0;
    const R = 44;
    const stickStart = (t) => {
      stickId = t.identifier;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      stickMove(t);
    };
    const stickMove = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.input.x = dx / R;
      this.input.z = dy / R;
      this.input.sprint = d > R * 0.92;
    };
    const stickEnd = () => {
      stickId = null;
      nub.style.transform = 'translate(-50%, -50%)';
      this.input.x = 0; this.input.z = 0;
    };
    joystickEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (stickId === null) stickStart(e.changedTouches[0]);
    }, { passive: false });
    joystickEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === stickId) stickMove(t);
    }, { passive: false });
    joystickEl.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === stickId) stickEnd();
    });

    // ---- look zone: any touch not on UI drags the camera ----
    let lookId = null, lx = 0, ly = 0;
    lookZone.addEventListener('touchstart', (e) => {
      if (lookId === null) {
        const t = e.changedTouches[0];
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      }
    }, { passive: true });
    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === lookId) {
          this.input.lookDx += (t.clientX - lx) * 0.0042;
          this.input.lookDy += (t.clientY - ly) * 0.0038;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: true });
    lookZone.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    });

    // ---- buttons ----
    const hold = (el, on, off) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); on(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); off(); }, { passive: false });
    };
    hold(sprintBtn, () => { this.input.sprint = true; sprintBtn.classList.add('sprint-on'); },
      () => { this.input.sprint = false; sprintBtn.classList.remove('sprint-on'); });
    hold(jumpBtn, () => { this.input.jump = true; }, () => { this.input.jump = false; });
    sprintBtn.addEventListener('mousedown', () => (this.input.sprint = true));
    sprintBtn.addEventListener('mouseup', () => (this.input.sprint = false));
    jumpBtn.addEventListener('mousedown', () => (this.input.jump = true));
    jumpBtn.addEventListener('mouseup', () => (this.input.jump = false));
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
    this.camYaw -= this.input.lookDx * sens;
    this.camPitch += (cfg.invertY ? 1 : -1) * this.input.lookDy * sens;
    this.camPitch = Math.max(-0.5, Math.min(1.15, this.camPitch));
    this.input.lookDx = 0; this.input.lookDy = 0;

    // ---- movement input (camera relative) ----
    let ix = this.input.x, iz = this.input.z;
    if (this._keys.has('KeyW') || this._keys.has('ArrowUp')) iz -= 1;
    if (this._keys.has('KeyS') || this._keys.has('ArrowDown')) iz += 1;
    if (this._keys.has('KeyA') || this._keys.has('ArrowLeft')) ix -= 1;
    if (this._keys.has('KeyD') || this._keys.has('ArrowRight')) ix += 1;
    const kbSprint = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    const wantJump = this.input.jump || this._keys.has('Space');
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }

    const frozen = this.frozen;
    let speed = 0;
    if (!frozen && mag > 0.08) {
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      const wx = ix * cos - iz * sin;
      const wz = -ix * sin - iz * cos;
      const targetYaw = Math.atan2(wx, wz) + Math.PI;
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 12);
      speed = (this.input.sprint || kbSprint) ? cfg.sprintSpeed : cfg.walkSpeed;
      speed *= Math.min(1, mag);
      this._tryMove(wx / Math.max(mag, 0.001) * speed * dt, wz / Math.max(mag, 0.001) * speed * dt);
    }
    this.speed2D = speed * Math.min(1, mag);

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
        this.onJump?.();
      }
      this.vy += cfg.gravity * dt;
    }
    const prevY = this.pos[1];
    this.pos[1] += this.vy * dt;

    // ---- ground support ----
    const support = supportHeight(this.pos[0], this.pos[2], this.pos[1], this.world.colliders, -3.6, cfg.stepHeight);
    if (this.pos[1] <= support + 0.001 && this.vy <= 0.01) {
      if (!this.grounded && this.vy < -3) this.onLand?.();
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

    // ---- footsteps ----
    if (this.grounded && this.speed2D > 0.5) {
      this._footAccum += dt * this.speed2D;
      if (this._footAccum > (this.speed2D > cfg.walkSpeed + 0.4 ? 2.1 : 1.6)) {
        this._footAccum = 0;
        this.onFootstep?.(this.pos, this.speed2D > cfg.walkSpeed + 0.4);
      }
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
