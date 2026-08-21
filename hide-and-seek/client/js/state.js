// ============================================================================
// client/js/state.js — tiny reactive store + event bus for the whole client.
// ============================================================================

export function createStore(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state, prev, patch);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export function EventBus() {
  const map = new Map();
  return {
    on(event, fn) {
      if (!map.has(event)) map.set(event, new Set());
      map.get(event).add(fn);
      return () => map.get(event)?.delete(fn);
    },
    emit(event, payload) {
      map.get(event)?.forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(`[bus:${event}]`, e); }
      });
    },
  };
}

// -------- persisted client settings -------------------------------------------
const SETTING_DEFAULTS = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  voiceVolume: 1.0,
  micMode: 'ptt',          // 'ptt' | 'open'
  lookSensitivity: 1.0,
  invertY: false,
  quality: 'medium',       // low | medium | high
  showFps: false,
};

export function loadSettings() {
  try {
    return { ...SETTING_DEFAULTS, ...JSON.parse(localStorage.getItem('hs_settings') || '{}') };
  } catch { return { ...SETTING_DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem('hs_settings', JSON.stringify(s)); } catch { /* private mode */ }
}
export { SETTING_DEFAULTS };
