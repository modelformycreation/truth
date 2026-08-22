// ============================================================================
// client/js/lobby.js — home screen (create/join/rejoin) + room lobby
// (players, ready, team preference, host settings, practice bots, start).
// ============================================================================

import { EVENTS, TEAMS } from '../../shared/constants.js';
import { ROOM_SETTINGS_SCHEMA } from '../../shared/config.js';
import { getGameCode, setGameCode } from './controls.js';

const $ = (id) => document.getElementById(id);

// player names are user input — never interpolate them raw into innerHTML
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const escapeAttr = escapeHtml;

const SETTING_DEFS = [
  { key: 'minPlayers', label: 'Min players', type: 'range', min: 2, max: 10, step: 1, fmt: (v) => v },
  { key: 'seekerRatio', label: 'Seekers', type: 'range', min: 0.2, max: 0.5, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'preparationSec', label: 'Hide time', type: 'range', min: 10, max: 120, step: 5, fmt: (v) => `${v}s` },
  { key: 'roundSec', label: 'Round time', type: 'range', min: 60, max: 900, step: 30, fmt: (v) => `${Math.round(v / 60)}m` },
  { key: 'catchRadius', label: 'Catch radius', type: 'range', min: 0.5, max: 5, step: 0.5, fmt: (v) => `${v}m` },
  { key: 'revealRadius', label: 'Reveal radius', type: 'range', min: 2, max: 20, step: 1, fmt: (v) => `${v}m` },
  { key: 'requireLineOfSight', label: 'Line of sight', type: 'toggle' },
  { key: 'allowTeamPreference', label: 'Team preference', type: 'toggle' },
  { key: 'voiceEnabled', label: 'Voice chat', type: 'toggle' },
  { key: 'abilitiesEnabled', label: 'Seeker scan pulse', type: 'toggle' },
  { key: 'minimapShowTeammates', label: 'Map: teammates', type: 'toggle' },
];

export class LobbyUI {
  constructor(net, store, audio, voice) {
    this.net = net;
    this.store = store;
    this.audio = audio;
    this.voice = voice;
    this.isHost = false;
    this.onLeave = null;
    this._wire();
    this._wireMapPicker();
  }

  _wire() {
    const nameInput = $('input-name');
    nameInput.value = localStorage.getItem('hs_name') || '';

    // Feature 6: the user's secret game code (identity for control persistence)
    const codeInput = $('input-gamecode');
    codeInput.value = getGameCode();

    $('btn-create').addEventListener('click', async () => {
      this.audio.unlock(); this.audio.click();
      const name = this._saveName(nameInput);
      if (!name) return this._homeError('Enter a name first');
      this._saveGameCode(codeInput);
      const mapId = $('select-map')?.value || 'facility';
      const res = await this.net.request(EVENTS.ROOM_CREATE, { name, mapId });
      if (!res.ok) return this._homeError(res.message || res.error || 'Could not create room');
      this._rememberSession(res);
      this.store.set({ session: res });
    });

    $('btn-join').addEventListener('click', () => this._join());
    $('input-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this._join(); });

    $('btn-rejoin').addEventListener('click', async () => {
      this.audio.unlock(); this.audio.click();
      const saved = JSON.parse(sessionStorage.getItem('hs_session') || 'null');
      if (!saved) return;
      const res = await this.net.request(EVENTS.ROOM_REJOIN, { code: saved.code, sessionId: saved.sessionId });
      if (res.ok) {
        this.store.set({ session: res });
      } else {
        sessionStorage.removeItem('hs_session');
        this._showRejoinHint();
        this._homeError('That session expired — create or join a room.');
      }
    });

    $('btn-leave').addEventListener('click', () => this._leave());
    $('btn-copy').addEventListener('click', async () => {
      this.audio.click();
      const code = $('room-code').textContent;
      try {
        await navigator.clipboard.writeText(code);
        this._toast(`Code ${code} copied — send it to your friends`);
      } catch {
        this._toast(`Room code: ${code}`);
      }
    });

    $('btn-ready').addEventListener('click', () => {
      this.audio.click();
      const me = this._me();
      this.net.send(EVENTS.LOBBY_READY, { ready: !(me?.ready) });
    });

    for (const btn of $('pref-seg').querySelectorAll('button')) {
      btn.addEventListener('click', () => {
        this.audio.click();
        this.net.send(EVENTS.LOBBY_PREFERENCE, { pref: btn.dataset.pref });
      });
    }

    $('btn-add-bot').addEventListener('click', () => {
      this.audio.click();
      this.net.send(EVENTS.LOBBY_ADD_BOT, {});
    });

    $('btn-remove-bot').addEventListener('click', async () => {
      this.audio.click();
      const res = await this.net.request(EVENTS.LOBBY_REMOVE_BOT, {});
      if (res?.error === 'NOT_BOT') this._toast('No bots to remove', true);
    });

    // Kick buttons are re-rendered constantly, so delegate from the list.
    $('lobby-players').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-kick]');
      if (!btn) return;
      this.audio.click();
      const id = btn.dataset.kick;
      const name = btn.dataset.name || 'this player';
      const isBot = btn.dataset.bot === '1';
      if (!isBot && !window.confirm(`Remove ${name} from the room?`)) return;
      const res = await this.net.request(EVENTS.LOBBY_KICK, { playerId: id });
      if (res?.ok) this._toast(`${name} removed`);
      else this._toast(this._kickError(res), true);
    });

    $('btn-start').addEventListener('click', async () => {
      this.audio.click();
      const res = await this.net.request(EVENTS.GAME_START, {});
      if (!res.ok) this._toast(this._startError(res), true);
    });

    $('btn-voice-perm').addEventListener('click', () => {
      this.voice.enableMic().then((ok) => {
        if (ok) this._toast('Microphone ready — team voice will start with the round');
      });
    });
  }

  async _join() {
    this.audio.unlock(); this.audio.click();
    const name = this._saveName($('input-name'));
    const code = $('input-code').value.trim().toUpperCase();
    if (!name) return this._homeError('Enter a name first');
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return this._homeError('Enter the 6-character room code');
    this._saveGameCode($('input-gamecode'));
    const res = await this.net.request(EVENTS.ROOM_JOIN, { code, name });
    if (!res.ok) return this._homeError(res.message || res.error || 'Could not join');
    this._rememberSession(res);
    this.store.set({ session: res });
  }

  _leave() {
    this.audio.click();
    this.net.send(EVENTS.ROOM_LEAVE, {});
    sessionStorage.removeItem('hs_session');
    this.onLeave?.();
  }

  _saveName(input) {
    const name = input.value.trim().slice(0, 16);
    if (name) localStorage.setItem('hs_name', name);
    return name;
  }

  /**
   * Feature 6 — persist the user's secret game code. First time: they create a
   * code; returning: they re-enter it to reload their controls. We always show
   * a "remember this code" reminder so nobody loses their layout.
   */
  _saveGameCode(input) {
    const wasEmpty = !getGameCode();
    const code = setGameCode(input.value);
    if (code && wasEmpty) {
      this._toast(`Remember "${code}" — it's your game code, no one else can see it.`);
    }
    return code;
  }

  _rememberSession(res) {
    sessionStorage.setItem('hs_session', JSON.stringify({ code: res.code, sessionId: res.sessionId }));
  }

  _homeError(msg) { $('home-error').textContent = msg || ''; }

  _toast(text, err = false) {
    const div = document.createElement('div');
    div.className = `toast${err ? ' err' : ''}`;
    div.textContent = text;
    $('toast-area').appendChild(div);
    setTimeout(() => div.remove(), 2800);
  }

  _startError(res) {
    if (res.error === 'NOT_ENOUGH_PLAYERS') return `Need ${res.need} players (have ${res.have})`;
    if (res.error === 'PLAYERS_NOT_READY') return `Waiting for: ${res.who.join(', ')}`;
    return 'Cannot start yet';
  }

  _kickError(res) {
    switch (res?.error) {
      case 'NOT_HOST': return 'Only the host can remove players';
      case 'CANNOT_KICK_HOST': return 'The host cannot be removed';
      case 'NO_TARGET': return 'That player already left';
      default: return 'Could not remove that player';
    }
  }

  _me() {
    const s = this.store.get();
    const myId = s.selfId;
    return s.roomState?.players.find((p) => p.id === myId);
  }

  // ------------------------------------------------------------- rendering --

  showHome() {
    $('screen-home').classList.remove('hidden');
    $('screen-lobby').classList.add('hidden');
    this._showRejoinHint();
  }

  _showRejoinHint() {
    const saved = JSON.parse(sessionStorage.getItem('hs_session') || 'null');
    $('btn-rejoin').classList.toggle('hidden', !saved);
    if (saved) $('rejoin-code').textContent = saved.code;
  }

  showLobby() {
    $('screen-home').classList.add('hidden');
    $('screen-lobby').classList.remove('hidden');
  }

  hide() {
    $('screen-home').classList.add('hidden');
    $('screen-lobby').classList.add('hidden');
  }

  /** room:state → DOM */
  render(state) {
    const myId = this.store.get().selfId;
    const me = state.players.find((p) => p.id === myId);
    this.isHost = !!me?.host;
    $('room-code').textContent = state.code;

    // players
    const list = $('lobby-players');
    list.innerHTML = state.players.map((p) => {
      const prefTag = p.pref !== 'any' ? `<span class="tag-pref">${p.pref === 'SEEKERS' ? 'seek' : 'hide'}</span>` : '';
      // the host gets a remove button on every row except their own
      const canKick = this.isHost && p.id !== myId;
      const kickBtn = canKick
        ? `<button class="btn tiny danger kick-btn" data-kick="${p.id}" data-name="${escapeAttr(p.name)}" data-bot="${p.bot ? '1' : '0'}" title="Remove ${escapeAttr(p.name)}" aria-label="Remove ${escapeAttr(p.name)}">✕</button>`
        : '';
      return `<div class="player-row ${p.ready ? 'ready' : ''}">
        <span class="p-name">${p.bot ? '🤖 ' : ''}${escapeHtml(p.name)}${p.host ? ' <span class="tag-host">👑</span>' : ''}</span>
        <span class="p-tags">
          ${prefTag}
          ${p.conn === false ? '<span style="color:#ff8d8d">reconnecting…</span>' : ''}
          <span class="${p.ready ? 'tag-ready' : ''}">${p.ready ? '✔ READY' : 'not ready'}</span>
          ${kickBtn}
        </span>
      </div>`;
    }).join('');

    // preference segment state
    for (const btn of $('pref-seg').querySelectorAll('button')) {
      btn.classList.toggle('on', btn.dataset.pref === (me?.pref ?? 'any'));
    }
    $('pref-row').style.display = state.settings.allowTeamPreference ? '' : 'none';

    // ready / start buttons
    const iAmReady = !!me?.ready;
    const readyBtn = $('btn-ready');
    readyBtn.textContent = iAmReady ? '✋ UNREADY' : '✔ READY UP';
    readyBtn.classList.toggle('primary', !iAmReady);

    const canStart = this._canStartHeuristic(state);
    $('btn-start').classList.toggle('hidden', !this.isHost);
    $('btn-start').disabled = !canStart;
    readyBtn.classList.toggle('hidden', this.isHost);
    const humans = state.players.filter((p) => !p.bot);
    const unready = humans.filter((p) => !p.ready && !p.host);
    $('start-hint').textContent = this.isHost
      ? (canStart ? 'Everyone is ready — GO!' : `Waiting for: ${unready.map((p) => p.name).join(', ') || `≥${state.settings.minPlayers} players`}`)
      : `${humans.length} in room · host starts the match`;

    // host settings panel
    const panel = document.querySelector('.host-panel');
    panel.classList.toggle('disabled', !this.isHost);
    this._renderSettings(state.settings);
    // host can switch the map from the lobby (before the round)
    const mapSel = $('lobby-map-select');
    const mapRow = mapSel?.closest('.map-pick-row');
    if (mapRow) mapRow.classList.toggle('host-only', !this.isHost);
    if (mapSel && mapSel.value !== state.mapId) mapSel.value = state.mapId;
    void ROOM_SETTINGS_SCHEMA;
  }

  /** Wire the host map picker once. */
  _wireMapPicker() {
    const mapSel = $('lobby-map-select');
    if (!mapSel) return;
    mapSel.addEventListener('change', () => {
      this.audio.click();
      const mapId = mapSel.value;
      if (!mapId || mapId === this._lastMapId) return;
      this._lastMapId = mapId;
      this.net.request(EVENTS.LOBBY_SET_MAP, { mapId }).then((res) => {
        if (!res?.ok) this._toast('Could not change the map', true);
        else this._toast(`Map set to ${res.mapName || mapId}`);
      });
    });
  }

  _canStartHeuristic(state) {
    const participants = state.players.filter((p) => p.conn !== false);
    if (participants.length < Math.max(2, state.settings.minPlayers)) return false;
    return state.players.every((p) => p.bot || p.ready || p.host);
  }

  _renderSettings(settings) {
    const wrap = $('host-settings');
    if (!wrap.dataset.wired) {
      wrap.innerHTML = SETTING_DEFS.map((def) => {
        if (def.type === 'toggle') {
          return `<div class="setting-row toggle" data-key="${def.key}">
            <span class="s-label">${def.label}</span>
            <label class="switch"><input type="checkbox" data-key="${def.key}"><span class="track"></span></label>
          </div>`;
        }
        return `<div class="setting-row" data-key="${def.key}">
          <span class="s-label">${def.label}</span>
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" data-key="${def.key}">
          <span class="s-value"></span>
        </div>`;
      }).join('');
      wrap.addEventListener('input', (e) => {
        const key = e.target.dataset.key;
        if (!key) return;
        const def = SETTING_DEFS.find((d) => d.key === key);
        const value = def.type === 'toggle' ? e.target.checked : Number(e.target.value);
        const row = e.target.closest('.setting-row');
        const valEl = row.querySelector('.s-value');
        if (valEl) valEl.textContent = def.fmt(value);
        this._throttledSettings({ [key]: value });
      });
      wrap.dataset.wired = '1';
    }
    for (const def of SETTING_DEFS) {
      // NB: the row <div> *and* the control share data-key, so this must select
      // the INPUT explicitly — a bare [data-key] selector matches the div first,
      // which silently left every toggle unchecked and every slider parked at
      // its default midpoint no matter what the room settings actually were.
      const el = wrap.querySelector(`input[data-key="${def.key}"]`);
      if (!el) continue;
      const v = settings[def.key];
      if (def.type === 'toggle') el.checked = !!v;
      else {
        if (document.activeElement !== el) el.value = v;
        const row = el.closest('.setting-row');
        row.querySelector('.s-value').textContent = def.fmt(v);
      }
    }
  }

  _throttledSettings(patch) {
    // accumulate: debounce must never drop intermediate slider changes
    this._pendingPatch = { ...(this._pendingPatch ?? {}), ...patch };
    clearTimeout(this._settingsTimer);
    this._settingsTimer = setTimeout(() => {
      const merged = this._pendingPatch;
      this._pendingPatch = null;
      this.net.send(EVENTS.LOBBY_SETTINGS, merged);
    }, 150);
  }

  renderVoice(state) {
    const el = $('voice-status');
    const permBtn = $('btn-voice-perm');
    if (!state.hasMic) {
      el.innerHTML = state.status === 'error'
        ? `<span style="color:#ff9c9c">${escapeHtml(state.errorMsg)}</span>`
        : 'Enable the mic to talk to your team (optional — you can always listen).';
      permBtn.classList.remove('hidden');
      permBtn.textContent = '🎤 ENABLE MICROPHONE';
    } else {
      permBtn.classList.add('hidden');
      const ch = state.channel === TEAMS.HIDERS ? '🟢 HIDER channel' : state.channel === TEAMS.SEEKERS ? '🟠 SEEKER channel' : state.channel === 'lobby' ? 'lobby (everyone)' : '—';
      // Feature 1: visible VOICE STATUS — MIC: LIVE / ICE CONNECTING / FAILED
      const ice = state.iceState === 'failed'
        ? '<b style="color:#ff9c9c">ICE FAILED</b>'
        : state.iceState === 'connecting'
          ? '<b style="color:#5b8cff">ICE CONNECTING…</b>'
          : state.iceState === 'connected'
            ? '<b style="color:#35d07f">CONNECTED</b>'
            : 'no peers yet';
      el.innerHTML = `Mic ready · ${ch}<br><span style="opacity:.7">${state.members.length} in channel · ${ice}</span>`;
    }

    // per-player volume sliders + live speaking indicators
    const list = $('voice-members');
    if (!list) return;
    const others = (state.members ?? []).filter((m) => !m.self);
    list.innerHTML = others.map((m) => `
      <div class="vm-row ${m.talking && !m.muted ? 'talking' : ''}">
        <span class="vm-dot"></span>
        <span class="vm-name">${escapeHtml(m.name)}</span>
        <input type="range" min="0" max="1" step="0.05" value="${m.volume ?? 1}" data-vol="${m.id}" aria-label="Volume for ${escapeAttr(m.name)}">
      </div>`).join('') || '<span class="hint">No one else in your voice channel yet.</span>';
    if (!list.dataset.wired) {
      list.addEventListener('input', (e) => {
        const id = e.target.dataset.vol;
        if (id) this.voice.setPeerVolume(id, Number(e.target.value));
      });
      list.dataset.wired = '1';
    }
  }
}
