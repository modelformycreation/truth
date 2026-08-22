// ============================================================================
// client/js/audio.js — all sound effects are synthesized with WebAudio:
// zero asset downloads, instant load, cheap on mobile. Positional cues are
// computed from the camera transform (pan + distance falloff). Voice chat is
// completely separate (WebRTC <audio> elements), never routed through here.
// ============================================================================

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.listener = { pos: [0, 0, 0], yaw: 0 };
    this._lastFootstep = new Map(); // per-source throttle (self + each player)
    this._unlocked = false;
    this._hearRadius = 22;
    this._lastHeartbeat = 0;
    this._wireResume();
  }

  /**
   * iOS/Android suspend the AudioContext whenever the page loses focus (call,
   * app switch, tab background). Resume on every plausible resurrection point,
   * otherwise the game comes back silent — a bug users read as "sound broke".
   */
  _wireResume() {
    const resume = () => {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    for (const ev of ['pointerdown', 'touchend', 'keydown']) {
      window.addEventListener(ev, resume, { passive: true });
    }
  }

  unlock() {
    if (this._unlocked) {
      // already built — just make sure it is actually running
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.setVolumes({ master: this._pendingMaster ?? 0.8, sfx: this._pendingSfx ?? 0.9 });
      this._unlocked = true;
      // Safari starts the context suspended even inside a gesture; resume NOW
      // (the old code only registered a listener for the *next* tap, so the
      // very first round was silent).
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) { console.warn('audio unavailable', e); }
  }

  get running() { return this.ctx?.state === 'running'; }


  setVolumes({ master, sfx }) {
    this._pendingMaster = master;
    this._pendingSfx = sfx;
    if (this.master) this.master.gain.value = master;
    if (this.sfx) this.sfx.gain.value = sfx;
  }

  setListener(pos, yaw) { this.listener = { pos: [...pos], yaw }; }

  /** pan/gain node chain positioned relative to the camera */
  _spatial(worldPos) {
    const [lx, , lz] = this.listener.pos;
    const dx = worldPos[0] - lx, dz = worldPos[2] - lz;
    const dist = Math.hypot(dx, dz);
    // angle relative to facing
    const angle = Math.atan2(dx, dz) - this.listener.yaw;
    const pan = Math.max(-1, Math.min(1, -Math.sin(angle) * 0.8));
    // inverse falloff, hard-cut at the configured hearing radius so distant
    // players are genuinely silent instead of a permanent faint mush
    const gain = dist > this._hearRadius ? 0 : (1 / (1 + dist * 0.16)) * (1 - dist / this._hearRadius);
    return { pan, gain, dist };
  }

  setHearRadius(m) { if (Number.isFinite(m) && m > 1) this._hearRadius = m; }

  _out(worldPos) {
    if (!this.ctx) return null;
    if (!worldPos) {
      const g = this.ctx.createGain();
      g.connect(this.sfx);
      return { input: g, gain: 1 };
    }
    const { pan, gain } = this._spatial(worldPos);
    if (gain < 0.02) return null;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (p) { p.pan.value = pan; g.connect(p); p.connect(this.sfx); } else g.connect(this.sfx);
    return { input: g, gain };
  }

  _tone(freq0, freq1, dur, type = 'sine', vol = 0.5, pos = null, when = 0) {
    if (!this.ctx) return;
    const out = this._out(pos);
    if (!out) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * out.gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out.input);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  _noise(dur, freq, vol = 0.4, pos = null, q = 1) {
    if (!this.ctx) return;
    const out = this._out(pos);
    if (!out) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * out.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(out.input);
    src.start(t);
  }

  // ---------------- game cues ----------------
  click() { this._tone(1400, 900, 0.06, 'square', 0.12); }
  blip() { this._tone(700, 1000, 0.09, 'sine', 0.2); }
  joinSound() { this._tone(500, 760, 0.12, 'triangle', 0.25); }
  countdownBeep(last = false) {
    this._tone(last ? 1200 : 820, last ? 1200 : 820, last ? 0.28 : 0.1, 'square', 0.22);
  }
  roundStart() {
    this._tone(330, 330, 0.12, 'triangle', 0.3);
    this._tone(440, 440, 0.12, 'triangle', 0.3, null, 0.14);
    this._tone(660, 660, 0.3, 'triangle', 0.32, null, 0.28);
  }
  catchSuccess() {
    this._tone(520, 780, 0.16, 'square', 0.3);
    this._tone(780, 1180, 0.22, 'square', 0.26, null, 0.12);
  }
  caughtSting() {
    this._tone(360, 140, 0.5, 'sawtooth', 0.3);
    this._noise(0.25, 240, 0.2);
  }
  denied() { this._tone(220, 160, 0.14, 'square', 0.2); }
  jump(pos) {
    this._tone(300, 480, 0.12, 'sine', 0.18, pos);
    this._noise(0.05, 700, 0.1, pos, 2);
  }
  land(pos, hard = false) {
    this._noise(hard ? 0.14 : 0.09, hard ? 130 : 180, hard ? 0.36 : 0.28, pos, 0.8);
    if (hard) this._tone(160, 90, 0.14, 'sine', 0.2, pos);
  }

  /**
   * A footstep. `key` identifies the source so each player gets their own
   * throttle — previously one shared timer meant a nearby team-mate's steps
   * silently swallowed your own.
   * `team` gives hiders and seekers distinct signatures: seekers are heavy
   * boots (low, loud), hiders are light and soft.
   */
  footstep(pos, running, key = 'self', team = null) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const last = this._lastFootstep.get(key) ?? 0;
    if (now - last < (running ? 0.18 : 0.26)) return;
    this._lastFootstep.set(key, now);
    const seeker = team === 'SEEKERS';
    const base = seeker ? (running ? 240 : 165) : (running ? 360 : 260);
    const vol = seeker ? 0.22 : 0.13;
    this._noise(seeker ? 0.07 : 0.05, base, running ? vol * 1.25 : vol, pos, 1.4);
    if (seeker) this._tone(base * 0.55, base * 0.35, 0.06, 'sine', vol * 0.5, pos);
  }

  /**
   * Proximity heartbeat for hiders: rate and volume rise as a seeker closes in.
   * `t01` is 0 at the edge of the danger radius and 1 when they're on top of you.
   */
  heartbeat(t01, minMs, maxMs) {
    if (!this.ctx) return;
    const k = Math.max(0, Math.min(1, t01));
    const interval = (maxMs + (minMs - maxMs) * k) / 1000;
    const now = this.ctx.currentTime;
    if (now - this._lastHeartbeat < interval) return;
    this._lastHeartbeat = now;
    const vol = 0.1 + 0.3 * k;
    this._tone(78, 46, 0.13, 'sine', vol);
    this._tone(66, 40, 0.11, 'sine', vol * 0.7, null, 0.17);
  }

  /** Round intro sting — three rising stabs + a low swell. */
  roundIntro() {
    this._tone(180, 180, 0.5, 'sawtooth', 0.16);
    [392, 523, 784].forEach((f, i) => this._tone(f, f, 0.16, 'square', 0.2, null, 0.1 + i * 0.13));
    this._noise(0.7, 90, 0.16);
  }

  /** Seeker scan pulse: sonar ping outward. */
  scanPulse() {
    this._tone(1500, 420, 0.5, 'sine', 0.26);
    this._tone(750, 210, 0.6, 'triangle', 0.16, null, 0.05);
  }

  /** A hider was pinged by a scan — anxious reverse blip. */
  scanned() {
    this._tone(300, 1200, 0.22, 'triangle', 0.24);
    this._tone(1200, 300, 0.3, 'sine', 0.16, null, 0.2);
  }

  victory() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this._tone(f, f, 0.22, 'triangle', 0.3, null, i * 0.14));
  }
  defeat() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => this._tone(f, f, 0.26, 'sine', 0.28, null, i * 0.16));
  }
  speakTick() { this._tone(900, 1100, 0.05, 'sine', 0.1); }
}
