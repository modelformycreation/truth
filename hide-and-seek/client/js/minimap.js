// ============================================================================
// client/js/minimap.js — optional minimap. Shows the environment (walls,
// labels) + your own position. Teammates and FOUND players appear when the
// room settings allow. Hidden enemies are NEVER drawn.
// ============================================================================

export class Minimap {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.bounds = map.bounds;
    this.w = canvas.width; this.h = canvas.height;
    this.showTeammates = true;
    this.showFound = true;
    this._bake();
  }

  _tx(x) { return ((x - this.bounds.minX) / (this.bounds.maxX - this.bounds.minX)) * this.w; }
  _tz(z) { return ((z - this.bounds.minZ) / (this.bounds.maxZ - this.bounds.minZ)) * this.h; }

  _bake() {
    const off = document.createElement('canvas');
    off.width = this.w; off.height = this.h;
    const c = off.getContext('2d');
    c.fillStyle = '#0d1119';
    c.fillRect(0, 0, this.w, this.h);

    // ground-floor walls only (y0 < 1 && top > 1.4)
    c.fillStyle = '#39435e';
    for (const b of this.map.boxes) {
      if (b.kind !== 'wall') continue;
      const top = b.c[1] + b.s[1] / 2, bottom = b.c[1] - b.s[1] / 2;
      if (bottom > 0.5 || top < 1.5) continue; // skip basement/roof/parapet walls
      c.fillRect(this._tx(b.c[0] - b.s[0] / 2), this._tz(b.c[2] - b.s[2] / 2),
        Math.max(1, (b.s[0] / (this.bounds.maxX - this.bounds.minX)) * this.w),
        Math.max(1, (b.s[2] / (this.bounds.maxZ - this.bounds.minZ)) * this.h));
    }
    // props (light outline)
    c.fillStyle = '#232c44';
    for (const b of this.map.boxes) {
      if (b.kind !== 'prop') continue;
      const bottom = b.c[1] - b.s[1] / 2;
      if (Math.abs(bottom) > 0.5) continue;
      c.fillRect(this._tx(b.c[0] - b.s[0] / 2), this._tz(b.c[2] - b.s[2] / 2),
        Math.max(1, (b.s[0] / (this.bounds.maxX - this.bounds.minX)) * this.w),
        Math.max(1, (b.s[2] / (this.bounds.maxZ - this.bounds.minZ)) * this.h));
    }
    // labels
    c.font = '700 7px -apple-system, sans-serif';
    c.fillStyle = 'rgba(154,165,184,0.75)';
    c.textAlign = 'center';
    for (const l of this.map.labels) {
      if (l.name.includes('B1')) continue; // basement drawn separately
      c.fillText(l.name, this._tx((l.x1 + l.x2) / 2), this._tz((l.z1 + l.z2) / 2));
    }
    this.baked = off;
  }

  draw(self, yaw, players, myTeam, selfStatus) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.drawImage(this.baked, 0, 0);

    const floor = self[1] < -1.5 ? 'B1' : self[1] > 4 ? 'RF' : 'G';
    if (floor === 'B1') {
      c.fillStyle = 'rgba(10,13,20,0.72)';
      c.fillRect(0, 0, this.w, this.h);
      c.fillStyle = '#39435e';
      for (const b of this.map.boxes) {
        if (b.kind !== 'wall') continue;
        const bottom = b.c[1] - b.s[1] / 2;
        if (Math.abs(bottom + 3.2) > 0.5) continue;
        c.fillRect(this._tx(b.c[0] - b.s[0] / 2), this._tz(b.c[2] - b.s[2] / 2),
          Math.max(1, (b.s[0] / 60) * this.w), Math.max(1, (b.s[2] / 48) * this.h));
      }
      c.font = '700 8px -apple-system, sans-serif';
      c.fillStyle = '#9aa5b8';
      c.textAlign = 'center';
      c.fillText('ARCHIVES B1', this._tx(21), this._tz(36));
    }
    if (floor === 'RF') {
      c.fillStyle = 'rgba(10,13,20,0.72)';
      c.fillRect(0, 0, this.w, this.h);
      c.font = '700 9px -apple-system, sans-serif';
      c.fillStyle = '#9aa5b8';
      c.textAlign = 'center';
      c.fillText('ROOFTOP', this.w / 2, this.h / 2);
    }

    // teammates (never hidden enemies — the server never sends them anyway)
    for (const p of players) {
      if (p.t !== myTeam) continue;
      if (p.s === 'found') {
        if (!this.showFound) continue;
        c.fillStyle = '#ff8d8d';
      } else {
        if (!this.showTeammates) continue;
        c.fillStyle = myTeam === 'HIDERS' ? '#7dffc0' : '#ffc39e';
      }
      c.beginPath();
      c.arc(this._tx(p.p[0]), this._tz(p.p[2]), 2.6, 0, Math.PI * 2);
      c.fill();
    }

    // self arrow
    const sx = this._tx(self[0]), sy = this._tz(self[2]);
    c.save();
    c.translate(sx, sy);
    c.rotate(-yaw + Math.PI);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -5.2);
    c.lineTo(3.4, 4);
    c.lineTo(0, 2.2);
    c.lineTo(-3.4, 4);
    c.closePath();
    c.fill();
    c.restore();
    void selfStatus;
  }
}
