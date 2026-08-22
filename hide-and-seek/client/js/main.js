// ============================================================================
// client/js/main.js — client bootstrap + game loop + screen orchestration.
//
//   HOME → LOBBY → TEAM_ASSIGNMENT → PREPARATION → ACTIVE_ROUND → RESULTS → LOBBY
//
// The server owns all of that; this file just renders it, runs local
// prediction for our own character, interpolates others, and wires the UI.
// ============================================================================

import { createStore, EventBus, loadSettings, saveSettings, SETTING_DEFAULTS } from './state.js';
import * as THREE from 'three';
import { Net } from './net.js';
import { AudioEngine } from './audio.js';
import { HUD } from './hud.js';
import { LobbyUI } from './lobby.js';
import { Minimap } from './minimap.js';
import { RemotePlayers } from './remote.js';
import { PlayerController } from './controller.js';
import { createAvatar } from './avatar.js';
import { Chat } from './chat.js';
import { VoiceManager } from './voice/voice-manager.js';
import { ControlsUI } from './controls-ui.js';
import {
  loadControls, saveControls, getDeviceId, getGameCode, setGameCode,
} from './controls.js';
import { buildWorld } from './world.js';
import { EVENTS, PHASES, TEAMS, STATUS } from '../../shared/constants.js';

const $ = (id) => document.getElementById(id);
const WORLD_PHASES = new Set([PHASES.TEAM_ASSIGNMENT, PHASES.PREPARATION, PHASES.ACTIVE_ROUND, PHASES.ROUND_END, PHASES.RESULTS]);

// Build tag: shown on the home screen so players (and testers) can tell which
// code they are actually running — an open tab keeps running the old build
// until it is reloaded, and this is the fastest way to notice that.
const BUILD = 'ff-2026-08-22c';
console.log(`[BLACKWOOD] client build ${BUILD}`);
$('build-tag').textContent = BUILD;

// ---------------- touch capability ----------------
// A media query alone lies on hybrid laptops and in some emulators; combine it
// with the real touch-point count and mark <body> so CSS + input agree.
const IS_TOUCH = (navigator.maxTouchPoints ?? 0) > 0 ||
  'ontouchstart' in window ||
  window.matchMedia?.('(pointer: coarse)').matches === true;
if (IS_TOUCH) document.body.classList.add('touch-ui');


// ---------------- singletons ----------------
const settings = { ...SETTING_DEFAULTS, ...loadSettings() };
// Feature 6: custom controls (look sens, invertY, joystick size/side, sprint
// mode, draggable button positions) — loaded locally, applied live, saved
// locally + on the server keyed by device id / secret game code.
let controlsData = loadControls();
const store = createStore({
  selfId: null, session: null, roomState: null, phase: PHASES.LOBBY,
  myTeam: null, myStatus: null, serverSettings: null, roomCfg: null,
  clockSkew: 0, // client perf.now() - server epoch, from latest snapshot
});
const bus = new EventBus();
const net = new Net(bus);
const audio = new AudioEngine();
const voice = new VoiceManager(net, bus, store);
const lobby = new LobbyUI(net, store, audio, voice);
const hud = new HUD(bus, net, audio, store);

let world = null;          // three.js context (created on first world phase)
let worldMapId = null;     // which map the current world was built for
let controller = null;     // our character
let selfAvatar = null;     // our visual body
let remotes = null;        // other players
let minimap = null;
let rafId = null;
let lastFrame = performance.now();
let fpsCounter = { frames: 0, t: 0, value: 0 };
let spawnSyncNeeded = false; // snap to the server spawn on the next snapshot

// ---------------- helpers ----------------
function toast(text, err) { hud.toast(text, err); }

function currentCfg() {
  return store.get().serverSettings ?? store.get().roomState?.settings ?? null;
}

function controllerSettings() {
  const cfg = currentCfg() ?? {};
  return {
    ...cfg,
    lookSensitivity: controlsData.lookSensitivity,
    invertY: controlsData.invertY,
  };
}

/**
 * Feature 6 — apply custom controls to the live game:
 *   • look sensitivity / invert-Y feed the controller (via controllerSettings)
 *   • joystick size -> CSS var, joystick side -> body class
 *   • sprint mode -> the controller's sprint behaviour
 *   • draggable button positions -> inline left/top on the real touch buttons
 */
const BUTTON_IDS = {
  sprint: 'btn-sprint', jump: 'btn-jump', find: 'btn-find', mic: 'btn-mic', scan: 'btn-scan',
};
function applyControls(c) {
  controlsData = c;
  // keep the legacy settings mirror in sync (used by the in-game settings modal)
  settings.lookSensitivity = c.lookSensitivity;
  settings.invertY = c.invertY;
  saveSettings(settings);
  // joystick size
  document.documentElement.style.setProperty('--joy-size', String(c.joystickSize ?? 1));
  // joystick side
  document.body.classList.toggle('joystick-right', c.joystickSide === 'right');
  // sprint mode
  if (controller) controller.sprintMode = c.sprintMode;
  // draggable button positions (null = use the default CSS position)
  for (const [key, id] of Object.entries(BUTTON_IDS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const b = c.buttons?.[key];
    if (b && typeof b.x === 'number') {
      el.style.left = `${b.x * 100}%`;
      el.style.top = `${b.y * 100}%`;
      el.classList.add('custom-pos');
    } else {
      el.style.left = ''; el.style.top = '';
      el.classList.remove('custom-pos');
    }
  }
}

// ---------------- world lifecycle ----------------
function ensureWorld() {
  const mapId = store.get().roomState?.mapId || 'facility';
  if (world) {
    // Same renderer/camera/controller — but if the room's map differs from the
    // one built (player moved between rooms of different maps), swap the
    // geometry and rebuild the map-dependent pieces.
    if (worldMapId !== mapId) {
      world.setMap(mapId);
      worldMapId = mapId;
      remotes.clear();
      if (selfAvatar?.group.parent) world.scene.remove(selfAvatar.group);
      minimap = new Minimap($('minimap'), world.map);
    }
    return;
  }
  const canvas = $('game-canvas');
  world = buildWorld(canvas, settings.quality, mapId);
  worldMapId = mapId;
  remotes = new RemotePlayers(world.scene);
  // other players' steps: positional (pan + distance) and team-flavoured, with
  // a per-player throttle so several teammates don't cancel each other out
  remotes.onFootstep = (pos, running, id, team) => audio.footstep(pos, running, id, team);
  minimap = new Minimap($('minimap'), world.map);

  controller = new PlayerController(world, controllerSettings());
  controller.attachTouch(
    $('joystick'), $('look-zone'), $('btn-sprint'), $('btn-jump'),
  );
  // own steps: no panning (they're at the listener), but team-flavoured
  controller.onFootstep = (pos, running) =>
    audio.footstep(null, running, 'self', store.get().myTeam);
  controller.onJump = () => audio.jump(null);
  controller.onLand = (pos, vy) => audio.land(null, vy < -7);
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

      // supply-crate effects: avatar glow + HUD countdown chip
      const nowL = performance.now();
      const skew = store.get().clockSkew;
      const meDto = store.get().lastSnapshot?.pl?.find((p) => p.i === store.get().selfId);
      const boostLeft = meDto ? Math.max(0, (meDto.bf || 0) + skew - nowL) : 0;
      const cloakLeft = meDto ? Math.max(0, (meDto.cf || 0) + skew - nowL) : 0;
      selfAvatar.setEffect(boostLeft > 0 ? 'boost' : cloakLeft > 0 ? 'cloak' : null);
      // Feature 3: GOLD locked-sprint indicator on the character
      selfAvatar.setSprint(controller.sprint.lock);
      updatePowerChip(boostLeft, cloakLeft);

      // audio listener + minimap + FIND-button reference position
      audio.setListener(controller.pos, controller.camYaw);
      audio.setHearRadius(cfg.footstepHearRadius ?? 22);
      hud.selfPos = controller.pos;
      const snap = store.get().lastSnapshot;
      if (snap && minimap) {
        minimap.showTeammates = cfg.minimapShowTeammates ?? true;
        minimap.showFound = cfg.minimapShowFound ?? true;
        minimap.draw(controller.pos, controller.yaw, snap.pl ?? [], store.get().myTeam, store.get().myStatus);
        if (!settings.showFps) {
          $('floor-tag').textContent = (worldMapId === 'facility')
            ? (controller.pos[1] < -1.5 ? 'B1 ARCHIVES' : controller.pos[1] > 4 ? 'ROOFTOP' : 'GROUND')
            : 'GROUND';
        }
      }
      updateDanger(cfg, snap);
    }
    remotes?.update(dt, now);
    updateItemsAnim(dt);
    hud.update(now);
    updateScanButton(now);
    world.renderer.render(world.scene, world.camera);

    // fps
    fpsCounter.frames++;
    if (now - fpsCounter.t > 1000) {
      fpsCounter.value = fpsCounter.frames;
      fpsCounter.frames = 0;
      fpsCounter.t = now;
      autoTuneQuality(fpsCounter.value);
    }
  };
  rafId = requestAnimationFrame(loop);
}

// ---------------- dynamic quality auto-tuner ----------------
// The playtest panel's #1 requested upgrade: "a quality auto-tuner that drops
// pixel ratio under load". When the smoothed FPS stays low (heavy scene / slow
// device / throttled tab) we step the renderer's pixel ratio DOWN so the game
// keeps running smoothly instead of glitching; when it recovers we ease it back
// up — never above the user's chosen quality cap.
const TUNE = {
  cap: null,            // pixel-ratio cap from the user's quality setting
  low: 0.85,            // multiplier below the cap when FPS is very low
  high: 1.0,            // full cap when FPS is healthy
  smooth: 1.0,          // current multiplier (0.85..1)
  cooldown: 0,          // don't flip every second
};
const TUNE_BASE_PR = { low: 1, medium: 1.5, high: 2 };
function setQualityCap(q) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  TUNE.cap = Math.min(dpr, TUNE_BASE_PR[q] ?? 1.5);
}
function autoTuneQuality(fps) {
  if (!world) return;
  const now = performance.now();
  if (now < TUNE.cooldown) return;
  TUNE.cooldown = now + 3000;
  const cap = TUNE.cap ?? TUNE_BASE_PR[settings.quality] ?? 1.5;
  let target = TUNE.smooth;
  if (fps < 26) target = 0.8;          // struggling: drop pixel ratio hard
  else if (fps < 34) target = 0.9;     // warm: drop a notch
  else target = 1.0;                   // healthy: restore
  if (Math.abs(target - TUNE.smooth) < 0.05) return;
  TUNE.smooth = target;
  world.renderer.setPixelRatio(cap * target);
}

// ---------------- proximity danger (hiders) ----------------
// A hider who is still hidden hears their own heartbeat speed up as a seeker
// closes in, and the screen edges bleed red. The seeker's position is only
// known to us when the server already revealed them, so this cue can never be
// used to see through walls — it is strictly a "you are about to be caught"
// tension amplifier built from data the client legitimately has.
const dangerEl = $('danger-vignette');
function updateDanger(cfg, snap) {
  const s = store.get();
  const isHiddenHider = s.myTeam === TEAMS.HIDERS &&
    s.myStatus === STATUS.HIDDEN &&
    s.phase === PHASES.ACTIVE_ROUND;
  if (!isHiddenHider || !snap || !controller) {
    if (dangerEl.style.opacity !== '0') dangerEl.style.opacity = '0';
    return;
  }
  const radius = cfg.heartbeatRadius ?? 12;
  let nearest = Infinity;
  for (const p of snap.pl ?? []) {
    if (p.t !== TEAMS.SEEKERS) continue;
    const d = Math.hypot(p.p[0] - controller.pos[0], p.p[1] - controller.pos[1], p.p[2] - controller.pos[2]);
    if (d < nearest) nearest = d;
  }
  if (nearest > radius) {
    dangerEl.style.opacity = '0';
    return;
  }
  const t01 = 1 - nearest / radius;               // 0 at the edge, 1 on top of you
  dangerEl.style.opacity = String((t01 * 0.85).toFixed(3));
  audio.heartbeat(t01, cfg.heartbeatMinIntervalMs ?? 260, cfg.heartbeatMaxIntervalMs ?? 1300);
}

// ---------------- supply crates (items) ----------------
// Glowing crates synced from the snapshot; walk into one to grab it.
let itemsGroup = null;
const itemMeshes = new Map();
const CRATE_BODY_GEO = new THREE.BoxGeometry(1, 1, 1);
const CRATE_LID_GEO = new THREE.BoxGeometry(1, 1, 1);

function makeCrate(kind) {
  const color = kind === 'cloak' ? 0x2ee8e8 : 0xffc46b;
  const g = new THREE.Group();
  const body = new THREE.Mesh(CRATE_BODY_GEO,
    new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.85 }));
  body.scale.set(0.46, 0.4, 0.46);
  body.position.y = 0.2;
  const lid = new THREE.Mesh(CRATE_LID_GEO,
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.75, roughness: 0.5 }));
  lid.scale.set(0.5, 0.14, 0.5);
  lid.position.y = 0.47;
  const tag = new THREE.Mesh(CRATE_BODY_GEO,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }));
  tag.scale.set(0.3, 0.3, 0.47);
  tag.position.y = 0.2;
  g.add(body, lid, tag);
  return g;
}

function syncItems(items) {
  if (!world) return;
  if (!itemsGroup) { itemsGroup = new THREE.Group(); world.scene.add(itemsGroup); }
  const seen = new Set();
  for (const it of items ?? []) {
    seen.add(it.i);
    let mesh = itemMeshes.get(it.i);
    if (!mesh) {
      mesh = makeCrate(it.k);
      itemsGroup.add(mesh);
      itemMeshes.set(it.i, mesh);
    }
    const x = it.p?.[0] ?? 0, y = it.p?.[1] ?? 0, z = it.p?.[2] ?? 0;
    mesh.position.x += (x - mesh.position.x) * 0.5; // tiny lerp for smooth appear
    mesh.position.y = y;
    mesh.position.z += (z - mesh.position.z) * 0.5;
  }
  for (const [id, mesh] of itemMeshes) {
    if (!seen.has(id)) {
      itemsGroup.remove(mesh);
      mesh.traverse((o) => { if (o.isMesh) { o.material.dispose(); } });
      itemMeshes.delete(id);
    }
  }
  if (!items?.length && itemsGroup) itemsGroup.visible = false;
  else itemsGroup.visible = true;
}

function updateItemsAnim(dt) {
  if (!itemsGroup || !itemsGroup.visible) return;
  for (const mesh of itemMeshes.values()) {
    mesh.rotation.y += dt * 0.8;
    const t = performance.now() * 0.002;
    mesh.position.y += Math.sin(t + mesh.id) * 0.0006; // gentle float
  }
}

function updatePowerChip(boostMs, cloakMs) {
  const el = $('power-chip');
  if (boostMs > 0) {
    el.textContent = `⚡ BOOST ${Math.ceil(boostMs / 1000)}s`;
    el.className = 'hud-pill power-chip boost';
  } else if (cloakMs > 0) {
    el.textContent = `🕶 CLOAK ${Math.ceil(cloakMs / 1000)}s`;
    el.className = 'hud-pill power-chip cloak';
  } else if (!el.classList.contains('hidden')) {
    el.className = 'hud-pill power-chip hidden';
  }
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
  spawnSyncNeeded = false;
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
  updateChatChannel();
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
      audio.unlock();
      // a fresh round starts clean: wipe last round's chat in both boxes
      lobbyChat?.clear();
      hudChat?.clear();
    }
    // The server places players at the CURRENT map's spawns (gathering / seeker
    // vestibule). We sync to that position from the next snapshot instead of
    // hard-coding coordinates — this is what makes multiple maps work.
    if (msg.phase === PHASES.TEAM_ASSIGNMENT || msg.phase === PHASES.PREPARATION) {
      spawnSyncNeeded = true;
    }
  } else if (msg.phase === PHASES.LOBBY) {
    exitWorld();
    lobby.showLobby();
    store.set({ myTeam: null, myStatus: null });
    updateChatChannel();
    // game is over — no leftover lobby/team chatter into the next room/session
    lobbyChat?.clear();
    hudChat?.clear();
  }
});

bus.on(`net:${EVENTS.GAME_SNAPSHOT}`, (snap) => {
  store.set({ lastSnapshot: snap, clockSkew: performance.now() - (snap.t || Date.now()) });
  hud.onSnapshot(snap);
  syncItems(snap.it);
  // One-time spawn sync: after a phase that re-positions us (gathering /
  // seeker vestibule), snap to the server's authoritative position. This
  // replaces the old hard-coded facility coordinates and works for any map.
  if (spawnSyncNeeded && controller) {
    const me = (snap.pl ?? []).find((p) => p.i === store.get().selfId);
    if (me) {
      controller.teleport(me.p, me.r ?? controller.yaw);
      spawnSyncNeeded = false;
    }
  }
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
    syncControlsFromServer();
  }
  if (state.selfId && state.selfId !== prev.selfId && state.roomState?.phase === PHASES.LOBBY) {
    lobby.render(state.roomState);
  }
});

// ---------------- voice wiring ----------------
voice.deafened = !!settings.deafened;
voice._emitState();

const micBtn = $('btn-mic');
// The mic ON/OFF and speaker-mute controls exist twice — in the in-game HUD top
// bar and in the lobby voice panel — so they are genuinely ALWAYS visible,
// whichever screen the player is on. Both copies drive the same handlers.
const micToggleBtns = [$('btn-mic-toggle'), $('btn-mic-toggle-lobby')].filter(Boolean);
const muteBtns = [$('btn-mute'), $('btn-mute-lobby')].filter(Boolean);
const micToggleBtn = micToggleBtns[0];
const muteBtn = muteBtns[0];

// ---- Feature 1: visible VOICE STATUS (MIC: LIVE / ICE CONNECTING / CONNECTED
//      / FAILED) in the HUD so a failed relay is never silent. ----
function updateVoiceStatus(state) {
  const el = $('pill-voice-status');
  if (!el) return;
  let cls = 'voice-status';
  let text;
  if (!state.hasMic || state.muted) {
    cls += ' off'; text = '🎤 MIC OFF';
  } else if (state.iceState === 'failed') {
    cls += ' fail'; text = '🎤 ICE FAILED';
  } else if (state.iceState === 'connecting') {
    cls += ' busy'; text = '🎤 ICE CONNECTING';
  } else {
    cls += ' ok'; text = '🎤 LIVE';
  }
  el.textContent = text;
  el.className = `hud-pill voice-status ${cls}`;
  el.classList.remove('hidden');
}

bus.on('voice:state', (state) => {
  hud.onVoiceState(state);
  if (store.get().roomState?.phase === PHASES.LOBBY || store.get().phase === PHASES.LOBBY) lobby.renderVoice(state);
  updateVoiceStatus(state);

  // ---- Feature 2: the mic is a simple TAP-TO-TOGGLE on/off (no hold). ----
  // The big round mic button is a mic ON/OFF switch, exactly like the top-bar
  // toggle and the lobby toggle — all three flip the same state.
  const live = state.selfTalking || (state.transmitting && state.hasMic);
  micBtn.classList.toggle('talking', !!live);
  micBtn.classList.toggle('blocked', state.status === 'error');
  micBtn.classList.toggle('off', !state.hasMic || state.muted);
  micBtn.classList.toggle('on', state.hasMic && !state.muted);
  micBtn.querySelector('.mic-tag').textContent =
    !state.hasMic ? 'MIC OFF' : state.muted ? 'MIC OFF' : 'MIC ON';

  // dedicated MIC ON/OFF toggle (HUD + lobby)
  const micUsable = state.hasMic && !state.muted;
  for (const b of micToggleBtns) {
    b.classList.toggle('on', micUsable);
    b.classList.toggle('off', !micUsable);
    b.setAttribute('aria-pressed', String(micUsable));
    b.title = micUsable ? 'Microphone ON — tap to turn off' : 'Microphone OFF — tap to turn on';
    b.textContent = b.id.endsWith('-lobby')
      ? (micUsable ? '🎙️ MIC ON' : '🚫 MIC OFF')
      : (micUsable ? '🎙️' : '🚫');
  }

  // dedicated SPEAKER mute (output)
  for (const b of muteBtns) {
    b.classList.toggle('off', state.deafened);
    b.setAttribute('aria-pressed', String(state.deafened));
    b.title = state.deafened ? 'Incoming voice MUTED — tap to unmute' : 'Incoming voice on — tap to mute';
    b.textContent = b.id.endsWith('-lobby')
      ? (state.deafened ? '🔇 SOUND OFF' : '🔊 SOUND ON')
      : (state.deafened ? '🔇' : '🔊');
  }
});

// --- MIC ON/OFF: ONE tap-to-toggle handler for every mic control (no hold). ---
// Feature 2 removed push-to-talk entirely — there is no "hold to talk", only a
// tap on = talk, tap again = off. It works in the lobby and in game, on mobile
// (tap) and laptop (click).
const onMicToggle = async () => {
  audio.unlock(); audio.click();
  const on = await voice.toggleMic();
  if (on) hud.toast('Microphone ON');
  else if (voice.errorMsg) hud.toast(voice.errorMsg, true);
  else hud.toast('Microphone OFF');
};
micBtn.addEventListener('click', onMicToggle);
for (const b of micToggleBtns) b.addEventListener('click', onMicToggle);

// --- SPEAKER mute: stop hearing other players ---
const onSpeakerToggle = () => {
  audio.unlock(); audio.click();
  voice.setDeafened(!voice.deafened);
  settings.deafened = voice.deafened;
  saveSettings(settings);
  hud.toast(voice.deafened ? 'Incoming voice muted' : 'Incoming voice on');
};
for (const b of muteBtns) b.addEventListener('click', onSpeakerToggle);

window.addEventListener('keydown', (e) => {
  if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT') return;
  // V and M both toggle the mic on/off (push-to-talk was removed)
  if ((e.code === 'KeyV' || e.code === 'KeyM') && !e.repeat) micToggleBtn.click();
  if (e.code === 'KeyF') $('btn-find').click();
  if (e.code === 'KeyN') muteBtn.click();
  if (e.code === 'KeyQ') $('btn-scan').click();
});

// FIND button
$('btn-find').addEventListener('click', async () => {
  if ($('btn-find').disabled) { audio.denied(); return; }
  audio.click();
  const res = await net.request(EVENTS.GAME_CATCH, { targetId: hud.findTarget ?? null }, 3000);
  hud.onCatchResult(res);
});

// ---------------- seeker scan pulse (config: abilitiesEnabled) ----------------
// A cooldown-gated sonar ping. It only highlights hiders the SERVER has already
// revealed to us, so it adds pressure and readability without leaking positions.
const scanBtn = $('btn-scan');
let scanReadyAt = 0;
function updateScanButton(now) {
  const s = store.get();
  const cfg = currentCfg() ?? {};
  const usable = !!cfg.abilitiesEnabled &&
    s.myTeam === TEAMS.SEEKERS &&
    s.phase === PHASES.ACTIVE_ROUND &&
    s.myStatus !== STATUS.FOUND;
  scanBtn.classList.toggle('hidden', !usable);
  if (!usable) return;
  const left = Math.max(0, scanReadyAt - now);
  scanBtn.disabled = left > 0;
  scanBtn.querySelector('.scan-cd').textContent = left > 0 ? `${Math.ceil(left / 1000)}s` : '';
}
scanBtn.addEventListener('click', () => {
  const cfg = currentCfg() ?? {};
  if (scanBtn.disabled || !cfg.abilitiesEnabled || !controller) return;
  audio.unlock();
  audio.scanPulse();
  scanReadyAt = performance.now() + (cfg.scanPulseCooldownSec ?? 25) * 1000;
  const ripple = $('scan-ripple');
  ripple.classList.remove('go');
  void ripple.offsetWidth; // restart the CSS animation
  ripple.classList.add('go');
  // ping every hider the server has ALREADY revealed to us, inside scan range
  const snap = store.get().lastSnapshot;
  const radius = cfg.scanPulseRadius ?? 18;
  let pinged = 0;
  for (const p of snap?.pl ?? []) {
    if (p.t !== TEAMS.HIDERS || p.s !== STATUS.HIDDEN) continue;
    const d = Math.hypot(p.p[0] - controller.pos[0], p.p[1] - controller.pos[1], p.p[2] - controller.pos[2]);
    if (d <= radius) { remotes?.getById(p.i)?.avatar.ping?.(); pinged += 1; }
  }
  hud.toast(pinged ? `📡 ${pinged} contact${pinged > 1 ? 's' : ''} in range` : '📡 No contacts in range');
});

// ---------------- kicked by the host ----------------
bus.on(`net:${EVENTS.ROOM_KICKED}`, ({ by }) => {
  sessionStorage.removeItem('hs_session');
  store.set({ session: null, roomState: null, phase: PHASES.LOBBY, selfId: null, myTeam: null, myStatus: null });
  exitWorld();
  lobby.showHome();
  lobby._homeError(`You were removed from the room${by ? ` by ${by}` : ''}.`);
});

// ---------------- app lifecycle ----------------
// Backgrounding a mobile browser freezes rAF: every held key/touch would still
// read as "down" on return and the character would run off on its own.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    controller?.releaseInputs();
  } else {
    audio.unlock();
    lastFrame = performance.now(); // never integrate the whole background gap
  }
});
window.addEventListener('blur', () => { controller?.releaseInputs(); });
// device rotation (iOS fires this before the new size is settled)
window.addEventListener('orientationchange', () => setTimeout(() => world?.resize(), 250));

// settings modal — client-side settings
function renderClientSettings() {
  const wrap = $('client-settings');
  const defs = [
    { key: 'masterVolume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'sfxVolume', label: 'Effects', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'voiceVolume', label: 'Voice volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'lookSensitivity', label: 'Look sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.1, fmt: (v) => v.toFixed(1) },
    { key: 'invertY', label: 'Invert look Y', type: 'toggle' },
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
  setQualityCap(settings.quality);
  world?.setQuality(settings.quality);
}

$('btn-settings').addEventListener('click', () => { renderClientSettings(); });
$('btn-leave-2').addEventListener('click', () => { $('modal-settings').classList.add('hidden'); lobby._leave(); });

// unlock audio on first interaction anywhere
for (const evName of ['pointerdown', 'touchstart']) {
  window.addEventListener(evName, () => audio.unlock(), { once: true });
}

// FPS display (setting: showFps)
setInterval(() => {
  if (settings.showFps && world) {
    $('floor-tag').textContent = `${fpsCounter.value} fps`;
  }
}, 1000);

// ---------------- chat (Feature 5) ----------------
// One instance for the lobby panel (everyone), one for the in-game overlay
// (team-only once a round is live). Both share the server-relayed stream.
const chatChannelLabel = () => {
  const team = store.get().myTeam;
  return team === TEAMS.HIDERS ? 'HIDERS' : team === TEAMS.SEEKERS ? 'SEEKERS' : 'LOBBY';
};
const lobbyChat = new Chat({
  net, bus,
  messages: $('chat-messages-lobby'),
  input: $('chat-input-lobby'),
  sendBtn: $('chat-send-lobby'),
  quickWrap: $('chat-quick-lobby'),
  channelLabel: () => 'LOBBY',
  getSelfId: () => store.get().selfId,
  showChannel: (ch) => ch === 'lobby',
});
const hudChat = new Chat({
  net, bus,
  messages: $('chat-messages-hud'),
  input: $('chat-input-hud'),
  sendBtn: $('chat-send-hud'),
  quickWrap: $('chat-quick-hud'),
  channelLabel: chatChannelLabel,
  getSelfId: () => store.get().selfId,
  showChannel: (ch) => ch !== 'lobby',
});

function updateChatChannel() {
  $('chat-channel-lobby').textContent = 'LOBBY';
  $('chat-channel-hud').textContent = chatChannelLabel();
  const cfg = currentCfg();
  if (cfg?.chatMaxLen) { lobbyChat.setMaxLen(cfg.chatMaxLen); hudChat.setMaxLen(cfg.chatMaxLen); }
}

// the in-game chat overlay opens/closes with the 💬 HUD button
const chatOverlay = $('chat-overlay');
let chatUnread = 0;
$('btn-chat').addEventListener('click', () => {
  audio.click();
  const hidden = chatOverlay.classList.contains('hidden');
  chatOverlay.classList.toggle('hidden', !hidden);
  chatUnread = 0;
  if (!hidden) hudChat.input.focus();
});
// unread badge: light the 💬 button when a message arrives while closed
bus.on(`net:${EVENTS.CHAT_RECV}`, (m) => {
  if (chatOverlay.classList.contains('hidden') && m.id !== store.get().selfId) {
    chatUnread += 1;
    $('btn-chat').classList.add('chat-unread');
    $('btn-chat').textContent = `💬`;
  }
  if (chatOverlay.classList.contains('hidden')) {
    hud.toast(`${m.name}: ${m.text}`);
  }
});

// ---------------- controls (Feature 6) ----------------
const controlsUI = new ControlsUI({
  getControls: () => controlsData,
  onApply: (c) => applyControls(c),
  onSave: (c) => {
    applyControls(c);
    saveControls(c);
    const deviceId = getDeviceId();
    const code = getGameCode();
    net.request(EVENTS.CONTROLS_SAVE, { deviceId, code, controls: c })
      .then((res) => { if (!res?.ok) hud.toast('Could not save controls to the server', true); });
    hud.toast('Controls saved (device + game code)');
  },
});
const openControls = () => { audio.click(); renderControlsCodeHint(); controlsUI.open(); };
$('btn-controls').addEventListener('click', openControls);
// in-game: the HUD also exposes the CONTROLS screen so players can tweak their
// layout mid-match (changes apply live through applyControls)
const hudControlsBtn = $('btn-controls-hud');
if (hudControlsBtn) hudControlsBtn.addEventListener('click', openControls);
// show the "remember your game code" hint in the controls screen
function renderControlsCodeHint() {
  const code = getGameCode();
  $('controls-code-hint').textContent = code
    ? `Saved under your game code "${code}" — enter it on any device to reload these controls.`
    : 'Tip: set a secret game code on the home screen to carry these controls to any device.';
}

/** Fetch saved controls from the server (by device id / game code) and apply. */
function syncControlsFromServer() {
  const deviceId = getDeviceId();
  const code = getGameCode();
  if (!code && !deviceId) return;
  net.request(EVENTS.CONTROLS_GET, { deviceId, code }).then((res) => {
    if (res?.ok && res.controls) applyControls(res.controls);
    renderControlsCodeHint();
  });
}
applyControls(controlsData);


// ---------------- boot ----------------
// Feature 1: the server hands us the ICE servers (STUN + TURN with short-lived
// credentials) at /api/config, so cross-network peers can relay voice through
// the host's Coturn instead of failing on a strict NAT.
fetch('/api/config').then((r) => r.json()).then((cfg) => {
  voice.setStun(cfg.stunUrls);
  voice.setIceServers(cfg.iceServers || []);
}).catch(() => {});
net.connect();
lobby.showHome();
lobby.onLeave = () => {};
applySettings();
updateChatChannel();

// QA/debug handle (used by tools/browser-*.mjs; harmless in production)
window.__debug = {
  bus, store, net, hud, audio, voice, settings, createAvatar,
  get controller() { return controller; },
  get remotes() { return remotes; },
  get world() { return world; },
  phase: () => store.get().phase,
  snapshot: () => store.get().lastSnapshot,
};
