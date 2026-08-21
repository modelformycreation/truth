// ============================================================================
// client/js/lobby.js — home screen (create/join/rejoin) + room lobby
// (players, ready, team preference, host settings, practice bots, start).
// ============================================================================

import { EVENTS, TEAMS } from '../../shared/constants.js';
import { ROOM_SETTINGS_SCHEMA } from '../../shared/config.js';

const $ = (id) => document.getElementById(id);

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
  }

  _wire() {
    const nameInput = $('input-name');
    nameInput.value = localStorage.getItem('hs_name') || '';

    $('btn-create').addEventListener('click', async () => {
      this.audio.unlock(); this.audio.click();
      const name = this._saveName(nameInput);
      if (!name) return this._homeError('Enter a name first');
      const res = await this.net.request(EVENTS.ROOM_CREATE, { name });
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
      return `<div class="player-row ${p.ready ? 'ready' : ''}">
        <span class="p-name">${p.bot ? '🤖 ' : ''}${p.name}${p.host ? ' <span class="tag-host">👑</span>' : ''}</span>
        <span class="p-tags">
          ${prefTag}
          ${p.conn === false ? '<span style="color:#ff8d8d">reconnecting…</span>' : ''}
          <span class="${p.ready ? 'tag-ready' : ''}">${p.ready ? '✔ READY' : 'not ready'}</span>
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
    void ROOM_SETTINGS_SCHEMA;
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
      const el = wrap.querySelector(`[data-key="${def.key}"]`);
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
        ? `<span style="color:#ff9c9c">${state.errorMsg}</span>`
        : 'Enable the mic to talk to your team (optional — you can always listen).';
      permBtn.classList.remove('hidden');
      permBtn.textContent = '🎤 ENABLE MICROPHONE';
    } else {
      permBtn.classList.add('hidden');
      const ch = state.channel === TEAMS.HIDERS ? '🟢 HIDER channel' : state.channel === TEAMS.SEEKERS ? '🟠 SEEKER channel' : state.channel === 'lobby' ? 'lobby (everyone)' : '—';
      el.innerHTML = `Mic ready · ${ch}<br><span style="opacity:.7">${state.members.length} listening</span>`;
    }
  }
}
