// ============================================================================
// client/js/controls-ui.js — Feature 6: the CONTROLS screen (editable from the
// lobby, before the game).
//
// Fields: look sensitivity, invert-look-Y, joystick size, joystick side
// (left/right), sprint mode, and DRAGGABLE button positions (sprint / jump /
// FIND / mic / scan). Positions are stored as fractions of the screen (0..1),
// so they survive any viewport size.
// ============================================================================

const $ = (id) => document.getElementById(id);

// Default preview positions (fractions of the preview area / screen).
const DEFAULT_BUTTONS = {
  sprint: { x: 0.78, y: 0.58 },
  jump: { x: 0.78, y: 0.34 },
  find: { x: 0.78, y: 0.80 },
  mic: { x: 0.14, y: 0.80 },
  scan: { x: 0.78, y: 0.18 },
};

export class ControlsUI {
  /**
   * @param {object} o
   * @param {object} o.getControls      () => current controls object
   * @param {(controls)=>void} o.onApply live-apply a controls object
   * @param {(controls)=>void} o.onSave  persist (localStorage + server)
   */
  constructor({ getControls, onApply, onSave }) {
    this.getControls = getControls;
    this.onApply = onApply;
    this.onSave = onSave;
    this._pending = null;       // buttons being dragged, keyed by name
    this._wire();
  }

  _wire() {
    $('btn-controls-close').addEventListener('click', () => { this.close(); });
    $('btn-controls-save').addEventListener('click', () => { this.save(); this.close(); });
  }

  open() {
    this.render();
    $('modal-controls').classList.remove('hidden');
  }
  close() {
    $('modal-controls').classList.add('hidden');
    // clicking SAVE persists; closing without saving just keeps local apply
    this.onApply?.(this.getControls());
  }

  render() {
    const c = this.getControls();
    // ---- settings fields ----
    const defs = [
      { key: 'lookSensitivity', label: 'Look sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.1, fmt: (v) => v.toFixed(1) },
      { key: 'joystickSize', label: 'Joystick size', type: 'range', min: 0.7, max: 1.4, step: 0.1, fmt: (v) => `${Math.round(v * 100)}%` },
    ];
    const wrap = $('controls-settings');
    wrap.innerHTML = `
      ${defs.map((d) => `<div class="setting-row"><span class="s-label">${d.label}</span>
        <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${c[d.key]}" data-key="${d.key}">
        <span class="s-value">${d.fmt(c[d.key])}</span></div>`).join('')}
      <div class="setting-row toggle"><span class="s-label">Invert look Y</span>
        <label class="switch"><input type="checkbox" data-key="invertY" ${c.invertY ? 'checked' : ''}><span class="track"></span></label></div>
      <div class="setting-row"><span class="s-label">Joystick side</span>
        <div class="seg" id="controls-side"><button data-side="left" class="${c.joystickSide === 'left' ? 'on' : ''}">LEFT</button>
        <button data-side="right" class="${c.joystickSide === 'right' ? 'on' : ''}">RIGHT</button></div></div>
      <div class="setting-row"><span class="s-label">Sprint mode</span>
        <select data-key="sprintMode" style="background:#131826;color:#e8edf6;border:1px solid #2a3450;border-radius:8px;padding:6px">
          <option value="free-fire" ${c.sprintMode === 'free-fire' ? 'selected' : ''}>Free Fire (locked)</option>
          <option value="classic" ${c.sprintMode === 'classic' ? 'selected' : ''}>Classic (hold)</option>
        </select></div>`;

    wrap.oninput = (e) => {
      const key = e.target.dataset.key;
      if (!key) return;
      const c2 = { ...this.getControls(), [key]: e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value) };
      if (e.target.type === 'range') {
        const def = defs.find((d) => d.key === key);
        if (def) e.target.closest('.setting-row').querySelector('.s-value').textContent = def.fmt(c2[key]);
      }
      this.onApply?.(c2);
    };
    // joystick side segmented
    for (const b of wrap.querySelectorAll('#controls-side button')) {
      b.onclick = () => {
        wrap.querySelectorAll('#controls-side button').forEach((x) => x.classList.toggle('on', x === b));
        this.onApply?.({ ...this.getControls(), joystickSide: b.dataset.side });
      };
    }

    // ---- draggable preview buttons ----
    const area = $('controls-preview-area');
    const areaRect = () => area.getBoundingClientRect();
    const btns = c.buttons;
    area.querySelectorAll('.cp-btn').forEach((el) => {
      const key = el.dataset.cp;
      const pos = btns[key] || DEFAULT_BUTTONS[key];
      el.style.left = `${pos.x * 100}%`;
      el.style.top = `${pos.y * 100}%`;
      this._bindDrag(el, key, area, areaRect);
    });
    $('btn-controls-reset').onclick = () => {
      const next = { ...this.getControls(), buttons: { sprint: null, jump: null, find: null, mic: null, scan: null } };
      this.onApply?.(next);
      this.render();
    };
  }

  _bindDrag(el, key, area, areaRect) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      this._pending = { key, el };
    });
    const move = (e) => {
      if (this._pending?.key !== key) return;
      const r = areaRect();
      if (r.width === 0 || r.height === 0) return;
      let x = (e.clientX - r.left) / r.width;
      let y = (e.clientY - r.top) / r.height;
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
      el.style.left = `${x * 100}%`;
      el.style.top = `${y * 100}%`;
      const c = this.getControls();
      const buttons = { ...c.buttons, [key]: { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } };
      this.onApply?.({ ...c, buttons });
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', () => { this._pending = null; }, { passive: true });
    window.addEventListener('pointercancel', () => { this._pending = null; }, { passive: true });
  }

  /** Called when SAVE is pressed. */
  save() {
    this.onSave?.(this.getControls());
  }
}
