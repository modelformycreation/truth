// ============================================================================
// server/teams.js — team assignment (server-authoritative, respects lobby
// preferences when the room allows it, always produces >=1 seeker & >=1 hider)
// ============================================================================

import { TEAMS } from '../shared/constants.js';

/**
 * @param {Player[]} participants connected players + bots (bots forced HIDERS)
 * @param {{seekerRatio:number, allowTeamPreference:boolean}} cfg
 * @returns {Map<string, string>} playerId -> team
 */
export function assignTeams(participants, cfg) {
  const n = participants.length;
  let seekerCount = Math.round(n * cfg.seekerRatio);
  seekerCount = Math.max(1, Math.min(n - 1, seekerCount));

  const humans = participants.filter((p) => !p.isBot);
  const bots = participants.filter((p) => p.isBot);
  const wantSeek = cfg.allowTeamPreference
    ? shuffle(humans.filter((p) => p.preference === TEAMS.SEEKERS))
    : [];
  const wantHide = cfg.allowTeamPreference
    ? humans.filter((p) => p.preference === TEAMS.HIDERS)
    : [];
  const rest = shuffle(humans.filter((p) => p.preference === 'any' || !cfg.allowTeamPreference));

  const teams = new Map();
  const seekers = new Set();

  // 1) volunteers first
  for (const p of wantSeek) {
    if (seekers.size < seekerCount) seekers.add(p.id);
  }
  // 2) fill from indifferent players
  for (const p of rest) {
    if (seekers.size < seekerCount) seekers.add(p.id);
  }
  // 3) last resort: take from hider-preferring players (game must be playable)
  for (const p of wantHide) {
    if (seekers.size < seekerCount) seekers.add(p.id);
  }

  for (const p of participants) {
    teams.set(p.id, seekers.has(p.id) ? TEAMS.SEEKERS : TEAMS.HIDERS);
  }
  // bots always hide
  for (const b of bots) teams.set(b.id, TEAMS.HIDERS);
  return teams;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
