// ============================================================================
// client/js/hud.js — in-game mobile-first HUD:
//   timer (server clock) · team · hiders remaining · FIND button (enabled
//   only when a revealed enemy is inside catchRadius) · feed · speaking list ·
//   preparation blindfold · team banners · results screen · settings modal.
// ============================================================================

import { EVENTS, PHASES, TEAMS } from '../../shared/constants.js';

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export class HUD {
  constructor(bus, net, audio, settingsStore) {
    this.bus = bus;
    this.net = net;
    this.audio = audio;
    this.settingsStore = settingsStore;
    this.phase = PHASES.LOBBY;
    this.endsAt = null;
    this.myTeam = null;
    this.myStatus = null;
    this.settings = null;
    this.visiblePlayers = [];
    this.selfPos = [0, 0, 0];
    this.lastBeepSec = null;
    this.catchIshooked = false;

    this._cacheDom();
    this._wireSettingsModal();
  }

  _cacheDom() {
    this.el = {
      hud: $('hud'),
      team: $('pill-team'),
      timer: $('pill-timer'),
      hidden: $('pill-hidden'),
      feed: $('feed'),
      find: $('btn-find'),
      banner: $('center-banner'),
      blindfold: $('blindfold'),
      bfCount: $('bf-count'),
      caughtFlash: $('caught-flash'),
      results: $('screen-results'),
      resultsTitle: $('results-title'),
      resultsSub: $('results-sub'),
      resultsStats: $('results-stats'),
      resultsPlayers: $('results-players'),
      speakers: $('speakers'),
      minimapWrap: $('minimap-wrap'),
      mic: $('btn-mic'),
      mute: $('btn-mute'),
      settings: $('btn-settings'),
      settingsModal: $('modal-settings'),
      minimapBtn: $('btn-minimap'),
    };
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setRoomSettings(settings) { this.settings = settings; }

  onPhase({ phase, endsAt, durationSec }) {
    this.phase = phase;
    this.endsAt = endsAt;
    this.lastBeepSec = null;

    this.el.blindfold.classList.toggle('hidden', true);
    this.el.banner.classList.add('hidden');
    // keep the results screen up through ROUND_END; only a new round or lobby clears it
    if (phase === PHASES.TEAM_ASSIGNMENT || phase === PHASES.LOBBY) {
      this.el.results.classList.add('hidden');
    }

    if (phase === PHASES.PREPARATION) {
      this.audio.roundIntro();
      if (this.myTeam === TEAMS.SEEKERS) {
        this.el.blindfold.classList.remove('hidden');
      } else {
        this.showBanner('GO HIDE!', `Seekers released in ${durationSec}s`, 'hiders');
      }
    }
    if (phase === PHASES.ACTIVE_ROUND) {
      this.audio.roundStart();
      this.showBanner('READY OR NOT', 'Seekers are hunting', 'seekers');
    }
  }

  onTeams({ teams }) {
    // big reveal banner handled by main (needs myTeam first)
    const mine = this.myTeam === TEAMS.SEEKERS ? teams.SEEKERS : teams.HIDERS;
    void mine;
  }

  setSelf(team, status) {
    this.myTeam = team;
    this.myStatus = status;
    this.el.team.textContent = team === TEAMS.SEEKERS ? '🔎 SEEKER' : team === TEAMS.HIDERS ? '🙈 HIDER' : '—';
    this.el.team.className = 'hud-pill ' + (team === TEAMS.SEEKERS ? 'team-seekers' : team === TEAMS.HIDERS ? 'team-hiders' : '');
    this.updateFindButton(true);
  }

  showBanner(title, sub, cls = '') {
    this.el.banner.innerHTML = `<div class="cb-title">${title}</div><div class="cb-sub">${sub}</div>`;
    this.el.banner.className = `center-banner ${cls}`;
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.banner.classList.add('hidden'), 3500);
  }

  addFeed({ text, kind }) {
    const div = document.createElement('div');
    div.className = `feed-msg ${kind ?? 'info'}`;
    div.textContent = text;
    this.el.feed.appendChild(div);
    while (this.el.feed.children.length > 5) this.el.feed.firstChild.remove();
    setTimeout(() => { div.style.opacity = '0'; }, 5000);
    setTimeout(() => div.remove(), 6000);
    if (kind === 'catch') this.audio.catchSuccess();
    if (kind === 'caught') { this.audio.caughtSting(); this.flashCaught(); }
    if (kind === 'join') this.audio.joinSound();
  }

  flashCaught() {
    this.el.caughtFlash.classList.remove('hidden');
    navigator.vibrate?.(180);
    setTimeout(() => this.el.caughtFlash.classList.add('hidden'), 1200);
  }

  /** per-frame: timer + FIND button state */
  update(nowMs) {
    // ---- server-authoritative timer ----
    let remainMs = null;
    if (this.endsAt) remainMs = this.endsAt - this.net.serverNow();
    if (remainMs !== null && remainMs > -5000 && this.phase !== PHASES.LOBBY) {
      const shown = Math.max(0, remainMs);
      const m = Math.floor(shown / 60000);
      const s = Math.floor((shown % 60000) / 1000);
      this.el.timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      this.el.timer.classList.toggle('low', shown < 31000 && this.phase === PHASES.ACTIVE_ROUND);
      const sLeft = Math.ceil(shown / 1000);
      if (this.phase === PHASES.ACTIVE_ROUND && sLeft <= 5 && sLeft !== this.lastBeepSec && shown > 0) {
        this.lastBeepSec = sLeft;
        this.audio.countdownBeep(sLeft === 1 || sLeft === 0);
      }
    } else {
      this.el.timer.textContent = '--:--';
    }

    // blindfold countdown
    if (this.phase === PHASES.PREPARATION && this.myTeam === TEAMS.SEEKERS && remainMs) {
      this.el.bfCount.textContent = String(Math.max(0, Math.ceil(remainMs / 1000)));
    }

    if (this.phase === PHASES.PREPARATION && this.myTeam === TEAMS.HIDERS && remainMs !== null) {
      const sLeft = Math.ceil(remainMs / 1000);
      if (sLeft <= 5 && sLeft !== this.lastBeepSec && remainMs > 0) {
        this.lastBeepSec = sLeft;
        this.audio.countdownBeep(sLeft === 1);
      }
    }

    this.updateFindButton(false);
  }

  /** FIND enabled iff a *revealed* hidden enemy is inside catchRadius (3D). */
  updateFindButton(forceHide) {
    const btn = this.el.find;
    const cfg = this.settings ?? {};
    const catchRadius = cfg.catchRadius ?? 2.0;
    const active = this.phase === PHASES.ACTIVE_ROUND && this.myTeam === TEAMS.SEEKERS && this.myStatus !== 'found';
    btn.style.display = active && !forceHide ? 'flex' : 'none';
    if (!active) { btn.disabled = true; return; }
    let near = null;
    for (const p of this.visiblePlayers) {
      if (p.t !== TEAMS.HIDERS || p.s !== 'hidden') continue;
      if (!p.rv) continue; // only server-revealed enemies count client-side
      const dx = p.p[0] - this.selfPos[0];
      const dy = (p.p[1] + 1.5) - (this.selfPos[1] + 1.5);
      const dz = p.p[2] - this.selfPos[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= catchRadius) { near = p; break; }
    }
    const wasEnabled = !btn.disabled;
    btn.disabled = !near;
    if (near && !wasEnabled) this.audio.blip();
    this.findTarget = near?.i ?? null;
  }

  onSnapshot(snapshot) {
    this.visiblePlayers = snapshot.pl ?? [];
    this.el.hidden.textContent = `HIDDEN ${snapshot.hc ?? '—'}`;
  }

  onCatchResult(res) {
    if (res.ok) {
      navigator.vibrate?.(60);
    } else if (res.reason === 'TOO_FAR') {
      this.audio.denied();
    } else if (res.reason === 'NO_LINE_OF_SIGHT') {
      this.audio.denied();
      this.toast('Blocked by a wall!');
    }
  }

  onResults(res) {
    const win = res.winner === this.myTeam;
    this.el.resultsTitle.textContent = res.winner === TEAMS.SEEKERS ? 'SEEKERS WIN' : 'HIDERS WIN';
    this.el.resultsTitle.className = `results-title ${res.winner === TEAMS.SEEKERS ? 'seekers' : 'hiders'}`;
    this.el.resultsSub.textContent =
      res.reason === 'TIME_EXPIRED' ? 'Time expired — hiders survived.'
      : res.reason === 'ALL_FOUND' ? 'Every hider was found.'
      : res.reason === 'ALL_SEEKERS_LEFT' ? 'Every seeker left the match.'
      : '';
    const timeLeft = Math.ceil((res.timeRemainingMs ?? 0) / 1000);
    this.el.resultsStats.innerHTML =
      `<div>Found <span>${res.foundCount}/${res.hiderCount}</span></div>` +
      `<div>Time left <span>${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}</span></div>` +
      (res.hidersRemaining?.length ? `<div>Survivors <span>${res.hidersRemaining.length}</span></div>` : '');
    this.el.resultsPlayers.innerHTML = (res.players ?? []).map((p) => {
      const teamCls = p.team === TEAMS.SEEKERS ? 'seekers' : 'hiders';
      const status = p.team === TEAMS.SEEKERS
        ? `${p.catches} catches`
        : p.status === 'found' ? `found by ${p.foundBy ?? 'disconnect'}` : 'survived';
      return `<div class="result-row"><span>${p.bot ? '🤖 ' : ''}${p.name}</span><span class="r-team ${teamCls}">${status}</span></div>`;
    }).join('');
    this.el.results.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    setTimeout(() => this.audio[win ? 'victory' : 'defeat'](), 300);
  }

  /** speaking indicators from voice channel members */
  onVoiceState(state) {
    // Show every member of our channel, not just the talkers, so players can
    // see who is even connected to voice — the talking ones light up green.
    const members = state.members ?? [];
    if (members.length === 0) { this.el.speakers.innerHTML = ''; return; }
    this.el.speakers.innerHTML = members.map((m) => {
      const cls = [
        'speaker-chip',
        m.talking && !m.muted ? 'talking' : '',
        m.muted ? 'muted' : '',
      ].filter(Boolean).join(' ');
      const icon = m.muted ? '🔇' : m.talking ? '🎤' : '🎧';
      const name = m.self ? 'You' : m.name;
      return `<div class="${cls}"><span class="dot"></span>${icon} ${escapeHtml(name)}</div>`;
    }).join('');
  }

  toast(text, isErr = false) {
    const div = document.createElement('div');
    div.className = `toast${isErr ? ' err' : ''}`;
    div.textContent = text;
    $('toast-area').appendChild(div);
    setTimeout(() => div.remove(), 2600);
  }

  // ---------------------------------------------------------------- settings
  _wireSettingsModal() {
    this.el.settings.addEventListener('click', () => {
      this.audio.click();
      this.el.settingsModal.classList.remove('hidden');
    });
    $('btn-close-settings').addEventListener('click', () => {
      this.audio.click();
      this.el.settingsModal.classList.add('hidden');
    });
    this.el.minimapBtn.addEventListener('click', () => {
      this.audio.click();
      const w = this.el.minimapWrap;
      w.style.display = w.style.display === 'none' ? '' : 'none';
    });
  }
}
