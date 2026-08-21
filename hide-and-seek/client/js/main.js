// ============================================================================
// client/js/main.js — client bootstrap + game loop + screen orchestration.
//
//   HOME → LOBBY → TEAM_ASSIGNMENT → PREPARATION → ACTIVE_ROUND → RESULTS → LOBBY
//
// The server owns all of that; this file just renders it, runs local
// prediction for our own character, interpolates others, and wires the UI.
// ============================================================================

import { createStore, EventBus, loadSettings, saveSettings, SETTING_DEFAULTS } from './state.js';
import { Net } from './net.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { LobbyUI } from './lobby.js';
import { Minimap } from './minimap.js';
import { RemotePlayers } from './remote.js';
import { PlayerController } from './controller.js';
import { createAvatar } from './avatar.js';
import { VoiceManager } from './voice/voice-manager.js';
import { buildWorld } from './world.js';
import { EVENTS, PHASES, TEAMS, STATUS } from '../../shared/constants.js';

const $ = (id) => document.getElementById(id);
const WORLD_PHASES = new Set([PHASES.TEAM_ASSIGNMENT, PHASES.PREPARATION, PHASES.ACTIVE_ROUND, PHASES.ROUND_END, PHASES.RESULTS]);

// ---------------- singletons ----------------
const settings = { ...SETTING_DEFAULTS, ...loadSettings() };
const store = createStore({
  selfId: null, session: null, roomState: null, phase: PHASES.LOBBY,
  myTeam: null, myStatus: null, serverSettings: null, roomCfg: null,
});
const bus = new EventBus();
const net = new Net(bus);
const audio = new AudioEngine();
const voice = new VoiceManager(net, bus, store);
const lobby = new LobbyUI(net, store, audio, voice);
const hud = new HUD(bus, net, audio, store);

let world = null;          // three.js context (created on first world phase)
let controller = null;     // our character
let selfAvatar = null;     // our visual body
let remotes = null;        // other players
let minimap = null;
let rafId = null;
let lastFrame = performance.now();
let fpsCounter = { frames: 0, t: 0, value: 0 };

// ---------------- helpers ----------------
function toast(text, err) { hud.toast(text, err); }

function currentCfg() {
  return store.get().serverSettings ?? store.get().roomState?.settings ?? null;
}

function controllerSettings() {
  const cfg = currentCfg() ?? {};
  return {
    ...cfg,
    lookSensitivity: settings.lookSensitivity,
    invertY: settings.invertY,
  };
}

// ---------------- world lifecycle ----------------
function ensureWorld() {
  if (world) return;
  const canvas = $('game-canvas');
  world = buildWorld(canvas, settings.quality);
  remotes = new RemotePlayers(world.scene);
  remotes.onFootstep = (pos, running) => audio.footstep(pos, running);
  minimap = new Minimap($('minimap'), world.map);

  controller = new PlayerController(world, controllerSettings());
  controller.attachTouch(
    $('joystick'), $('look-zone'), $('btn-sprint'), $('btn-jump'),
  );
  controller.onFootstep = (pos, running) => audio.footstep(null, running); // own steps: no pan
  controller.onJump = () => audio.jump(null);
  controller.onLand = () => audio.land(null);
  controller.onMove = (payload) => net.send(EVENTS.GAME_MOVE, payload);

  selfAvatar = createAvatar({ id: 'self', name: localStorage.getItem('hs_name') || 'You', team: store.get().myTeam ?? TEAMS.HIDERS, isSelf: true });
  world.scene.add(selfAvatar.group);

  window.addEventListener('resize', () => world.resize());
  startLoop();
}

function startLoop() {
  if (rafId) return;
  const loop = () => {
    rafId = requestAnimationFrame(loop);
    const now = performance.now();
    let dt = (now - lastFrame) / 1000;
    lastFrame = now;
    dt = Math.min(dt, 0.1);

    const cfg = controllerSettings();
    if (controller) {
      controller.settings = cfg;
      // seekers frozen during preparation (mirrors the server rule)
      controller.frozen = store.get().phase === PHASES.PREPARATION && store.get().myTeam === TEAMS.SEEKERS;
      controller.update(dt, world.camera);

      // send movement at moveHz
      const moveHz = cfg.moveHz ?? 15;
      const payload = controller.netTick(dt, now, moveHz);
      if (payload) controller.onMove?.(payload);

      // own avatar follows the predicted body
      selfAvatar.setPos(...controller.pos);
      selfAvatar.setRot(controller.yaw);
      selfAvatar.animate(dt, controller.speed2D, controller.grounded, controller.vy);

      // audio listener + minimap + FIND-button reference position
      audio.setListener(controller.pos, controller.camYaw);
      hud.selfPos = controller.pos;
      const snap = store.get().lastSnapshot;
      if (snap && minimap) {
        minimap.showTeammates = cfg.minimapShowTeammates ?? true;
        minimap.showFound = cfg.minimapShowFound ?? true;
        minimap.draw(controller.pos, controller.camYaw, snap.pl ?? [], store.get().myTeam, store.get().myStatus);
        $('floor-tag').textContent = controller.pos[1] < -1.5 ? 'B1 ARCHIVES' : controller.pos[1] > 4 ? 'ROOFTOP' : 'GROUND';
      }
    }
    remotes?.update(dt, now);
    hud.update(now);
    world.renderer.render(world.scene, world.camera);

    // fps
    fpsCounter.frames++;
    if (now - fpsCounter.t > 1000) {
      fpsCounter.value = fpsCounter.frames;
      fpsCounter.frames = 0;
      fpsCounter.t = now;
    }
  };
  rafId = requestAnimationFrame(loop);
}

function enterWorld() {
  ensureWorld();
  $('game-canvas').style.display = 'block';
  lobby.hide();
  // a brand-new round clears the results screen; ROUND_END/RESULTS keep it up
  if (store.get().phase === PHASES.TEAM_ASSIGNMENT) {
    $('screen-results').classList.add('hidden');
    hud.show();
  }
}

function exitWorld() {
  hud.hide();
  $('blindfold').classList.add('hidden');
  if (world) {
    remotes?.clear();
    if (selfAvatar?.group.parent) world.scene.remove(selfAvatar.group);
  }
}

// ---------------- net wiring ----------------
bus.on('net:connected', () => {
  $('conn-banner').classList.add('hidden');
  // auto-rejoin after a refresh / transport drop
  const saved = JSON.parse(sessionStorage.getItem('hs_session') || 'null');
  const s = store.get();
  if (saved && !s.session && !s.roomState) {
    net.request(EVENTS.ROOM_REJOIN, { code: saved.code, sessionId: saved.sessionId }).then((res) => {
      if (res.ok) store.set({ session: res });
      else sessionStorage.removeItem('hs_session');
    });
  }
});

bus.on('net:disconnected', () => {
  $('conn-banner').classList.remove('hidden');
});

bus.on(`net:${EVENTS.ROOM_ERROR}`, ({ message, code }) => {
  if (code === 'NO_ROOM') return;
  toast(message || code || 'error', true);
});

bus.on(`net:${EVENTS.ROOM_LEFT}`, () => {
  sessionStorage.removeItem('hs_session');
  store.set({ session: null, roomState: null, phase: PHASES.LOBBY, selfId: null, myTeam: null });
  exitWorld();
  lobby.showHome();
});

bus.on(`net:${EVENTS.ROOM_STATE}`, (state) => {
  // normalize compact wire keys (n/t/s) to readable names for the UI
  state.players = (state.players ?? []).map((p) => ({
    ...p,
    name: p.n ?? p.name,
    team: p.t ?? p.team,
    status: p.s ?? p.status,
  }));
  store.set({ roomState: state, serverSettings: state.settings });
  hud.setRoomSettings(state.settings);
  voice.setEnabled(state.settings.voiceEnabled !== false);
  const me = state.players.find((p) => p.id === store.get().selfId);
  if (me) lobby.isHost = !!me.host;
  if (state.phase === PHASES.LOBBY) {
    exitWorld();
    lobby.showLobby();
    lobby.render(state);
  }
});

bus.on(`net:${EVENTS.GAME_TEAMS}`, ({ teams }) => {
  const selfId = store.get().selfId;
  const myTeam = teams.HIDERS.some((p) => p.id === selfId) ? TEAMS.HIDERS
    : teams.SEEKERS.some((p) => p.id === selfId) ? TEAMS.SEEKERS : null;
  store.set({ myTeam, myStatus: myTeam === TEAMS.HIDERS ? STATUS.HIDDEN : STATUS.ACTIVE });
  hud.setSelf(myTeam, store.get().myStatus);
  const names = (myTeam === TEAMS.SEEKERS ? teams.SEEKERS : teams.HIDERS).map((p) => p.name).join(', ');
  hud.showBanner(
    myTeam === TEAMS.SEEKERS ? '🔎 YOU ARE A SEEKER' : '🙈 YOU ARE A HIDER',
    `Your team: ${names}`,
    myTeam === TEAMS.SEEKERS ? 'seekers' : 'hiders',
  );
  audio.joinSound();
  // own avatar wears our team's colors
  if (world && selfAvatar) {
    selfAvatar.dispose(world.scene);
    selfAvatar = createAvatar({ id: 'self', name: localStorage.getItem('hs_name') || 'You', team: myTeam, isSelf: true });
    world.scene.add(selfAvatar.group);
  }
});

bus.on(`net:${EVENTS.GAME_PHASE}`, (msg) => {
  store.set({ phase: msg.phase });
  hud.phase = msg.phase;
  hud.onPhase(msg);
  if (WORLD_PHASES.has(msg.phase)) {
    enterWorld();
    if (selfAvatar && !selfAvatar.group.parent) world.scene.add(selfAvatar.group);
    if (msg.phase === PHASES.TEAM_ASSIGNMENT) {
      // gather at the atrium spawn
      controller?.teleport([31.5, 0, 33.5], Math.PI);
      audio.unlock();
    }
    if (msg.phase === PHASES.PREPARATION && store.get().myTeam === TEAMS.SEEKERS) {
      controller?.teleport([32, 0, 41.6], Math.PI);
    }
  } else if (msg.phase === PHASES.LOBBY) {
    exitWorld();
    lobby.showLobby();
    store.set({ myTeam: null, myStatus: null });
  }
});

bus.on(`net:${EVENTS.GAME_SNAPSHOT}`, (snap) => {
  store.set({ lastSnapshot: snap });
  hud.onSnapshot(snap);
  if (remotes && controller) {
    remotes.selfId = store.get().selfId;
    remotes.applySnapshot(snap.pl ?? [], snap.t, performance.now());
  }
});

bus.on(`net:${EVENTS.GAME_CORRECTION}`, ({ p, r }) => {
  controller?.applyCorrection(p, r);
});

bus.on(`net:${EVENTS.GAME_CATCH_RESULT}`, (res) => {
  hud.onCatchResult(res);
  if (res.ok && res.targetId === store.get().selfId) {
    store.set({ myStatus: STATUS.FOUND });
    hud.setSelf(store.get().myTeam, STATUS.FOUND);
  }
  // mark avatars
  if (res.ok && remotes) remotes.getById(res.targetId)?.avatar.setFound();
});

bus.on(`net:${EVENTS.GAME_FEED}`, (msg) => hud.addFeed(msg));

bus.on(`net:${EVENTS.GAME_RESULTS}`, (res) => {
  hud.onResults(res);
  store.set({ phase: PHASES.ROUND_END });
});

// store: session established -> learn who we are; re-render lobby once known
store.subscribe((state, prev) => {
  if (state.session && state.session !== prev.session) {
    store.set({ selfId: state.session.playerId });
    voice.setSelfId(state.session.playerId);
  }
  if (state.selfId && state.selfId !== prev.selfId && state.roomState?.phase === PHASES.LOBBY) {
    lobby.render(state.roomState);
  }
});

// ---------------- voice wiring ----------------
voice.setMicMode(settings.micMode);
voice._emitState();
bus.on('voice:state', (state) => {
  hud.onVoiceState(state);
  if (store.get().roomState?.phase === PHASES.LOBBY || store.get().phase === PHASES.LOBBY) lobby.renderVoice(state);
  // mic button visuals
  const mic = $('btn-mic');
  mic.classList.toggle('talking', state.pttActive && !state.muted && state.hasMic);
  mic.classList.toggle('blocked', state.status === 'error');
  $('btn-mute').textContent = state.muted ? '🔇' : '🔊';
});

// push-to-talk inputs
const micBtn = $('btn-mic');
const pttDown = (e) => {
  e.preventDefault();
  audio.unlock();
  if (!voice.provider?.hasMic()) { voice.enableMic(); return; }
  voice.setPtt(true);
};
const pttUp = (e) => { e?.preventDefault(); voice.setPtt(false); };
micBtn.addEventListener('touchstart', pttDown, { passive: false });
micBtn.addEventListener('touchend', pttUp, { passive: false });
micBtn.addEventListener('mousedown', pttDown);
micBtn.addEventListener('mouseup', pttUp);
micBtn.addEventListener('mouseleave', () => voice.setPtt(false));
window.addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT') return;
  if (e.code === 'KeyV') voice.setPtt(true);
  if (e.code === 'KeyF') $('btn-find').click();
  if (e.code === 'KeyM') voice.setMuted(!voice.muted);
});
window.addEventListener('keyup', (e) => { if (e.code === 'KeyV') voice.setPtt(false); });

$('btn-mute').addEventListener('click', () => {
  audio.unlock(); audio.click();
  voice.setMuted(!voice.muted);
});

// FIND button
$('btn-find').addEventListener('click', async () => {
  if ($('btn-find').disabled) { audio.denied(); return; }
  audio.click();
  const res = await net.request(EVENTS.GAME_CATCH, { targetId: hud.findTarget ?? null }, 3000);
  hud.onCatchResult(res);
});

// settings modal — client-side settings
function renderClientSettings() {
  const wrap = $('client-settings');
  const defs = [
    { key: 'masterVolume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'sfxVolume', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'voiceVolume', label: 'Voice volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'lookSensitivity', label: 'Look sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.1, fmt: (v) => v.toFixed(1) },
    { key: 'invertY', label: 'Invert look Y', type: 'toggle' },
    { key: 'micMode', label: 'Mic mode', type: 'select', options: [['ptt', 'Push-to-talk (hold 🎤 / V)'], ['open', 'Open mic']] },
    { key: 'quality', label: 'Graphics', type: 'select', options: [['low', 'Low (fastest)'], ['medium', 'Medium'], ['high', 'High']] },
    { key: 'showFps', label: 'Show FPS', type: 'toggle' },
  ];
  wrap.innerHTML = defs.map((def) => {
    if (def.type === 'toggle') {
      return `<div class="setting-row toggle"><span class="s-label">${def.label}</span>
        <label class="switch"><input type="checkbox" data-key="${def.key}" ${settings[def.key] ? 'checked' : ''}><span class="track"></span></label></div>`;
    }
    if (def.type === 'select') {
      return `<div class="setting-row" style="grid-template-columns:130px 1fr"><span class="s-label">${def.label}</span>
        <select data-key="${def.key}" style="background:#131826;color:#e8edf6;border:1px solid #2a3450;border-radius:8px;padding:6px">
        ${def.options.map(([v, l]) => `<option value="${v}" ${settings[def.key] === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>`;
    }
    return `<div class="setting-row"><span class="s-label">${def.label}</span>
      <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${settings[def.key]}" data-key="${def.key}">
      <span class="s-value">${def.fmt(settings[def.key])}</span></div>`;
  }).join('');
  wrap.oninput = (e) => {
    const key = e.target.dataset.key;
    if (!key) return;
    let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (e.target.type === 'range') value = Number(value);
    settings[key] = value;
    saveSettings(settings);
    const def = defs.find((d) => d.key === key);
    if (def?.fmt) e.target.closest('.setting-row').querySelector('.s-value').textContent = def.fmt(value);
    applySettings();
  };
}

function applySettings() {
  audio.setVolumes({ master: settings.masterVolume, sfx: settings.sfxVolume });
  voice.setVolume(settings.voiceVolume);
  voice.setMicMode(settings.micMode);
  world?.setQuality(settings.quality);
}

$('btn-settings').addEventListener('click', () => { renderClientSettings(); });
$('btn-leave-2').addEventListener('click', () => { $('modal-settings').classList.add('hidden'); lobby._leave(); });

// unlock audio on first interaction anywhere
for (const evName of ['pointerdown', 'touchstart']) {
  window.addEventListener(evName, () => audio.unlock(), { once: true });
}

// FPS display
setInterval(() => {
  if (settings.showFps && world) {
    // cheap: reuse the timer pill title
    $('pill-timer').title = `${fpsCounter.value} fps`;
    $('floor-tag').textContent = `${fpsCounter.value}fps`;
  }
}, 1000);

// ---------------- boot ----------------
fetch('/api/config').then((r) => r.json()).then((cfg) => {
  voice.setStun(cfg.stunUrls);
}).catch(() => {});
net.connect();
lobby.showHome();
lobby.onLeave = () => {};
applySettings();

// QA/debug handle (used by tools/browser-*.mjs; harmless in production)
window.__debug = {
  bus, store, net, hud,
  get controller() { return controller; },
  phase: () => store.get().phase,
  snapshot: () => store.get().lastSnapshot,
};
