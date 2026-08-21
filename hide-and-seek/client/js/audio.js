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
    this._lastFootstep = 0;
    this._unlocked = false;
  }

  unlock() {
    if (this._unlocked) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.setVolumes({ master: this._pendingMaster ?? 0.8, sfx: this._pendingSfx ?? 0.9 });
      this._unlocked = true;
    } catch (e) { console.warn('audio unavailable', e); }
    document.addEventListener('pointerdown', () => this.ctx?.resume?.(), { once: true });
  }

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
    const gain = 1 / (1 + dist * 0.16);
    return { pan, gain, dist };
  }

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
  jump(pos) { this._tone(300, 480, 0.12, 'sine', 0.18, pos); }
  land(pos) { this._noise(0.09, 180, 0.28, pos, 0.8); }
  footstep(pos, running) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastFootstep < (running ? 0.26 : 0.38)) return;
    this._lastFootstep = now;
    this._noise(0.05, running ? 320 : 220, 0.16, pos, 1.4);
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
