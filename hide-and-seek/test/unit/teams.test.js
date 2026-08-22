// ============================================================================
// Team assignment tests (spec defaults: 8 players -> 5 hiders / 3 seekers).
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { assignTeams } from '../../server/teams.js';
import { TEAMS } from '../../shared/constants.js';
import { addPlayer, mkRoom } from '../helpers.js';

function roster(names) {
  const room = mkRoom();
  return names.map((n) => addPlayer(room, n));
}

function countTeams(teams, players) {
  let seekers = 0, hiders = 0;
  for (const p of players) {
    if (teams.get(p.id) === TEAMS.SEEKERS) seekers++;
    else hiders++;
  }
  return { seekers, hiders };
}

test('default ratio: 8 players -> 3 seekers, 5 hiders', () => {
  const players = roster(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  const teams = assignTeams(players, { seekerRatio: 0.375, allowTeamPreference: true });
  assert.deepEqual(countTeams(teams, players), { seekers: 3, hiders: 5 });
});

test('7 players with ratio 0.28 -> 2 seekers, 5 hiders (acceptance scenario)', () => {
  const players = roster(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const teams = assignTeams(players, { seekerRatio: 0.28, allowTeamPreference: false });
  assert.deepEqual(countTeams(teams, players), { seekers: 2, hiders: 5 });
});

test('always at least one seeker and one hider', () => {
  for (const n of [2, 3, 4, 10]) {
    const players = roster(Array.from({ length: n }, (_, i) => `P${i}`));
    const teams = assignTeams(players, { seekerRatio: 0.2, allowTeamPreference: true });
    const { seekers, hiders } = countTeams(teams, players);
    assert.ok(seekers >= 1 && hiders >= 1, `n=${n}`);
  }
});

test('preferences are respected when possible', () => {
  const room = mkRoom();
  const seekerPrefs = [addPlayer(room, 'S1', { pref: 'SEEKERS' }), addPlayer(room, 'S2', { pref: 'SEEKERS' })];
  const hiderPrefs = [addPlayer(room, 'H1', { pref: 'HIDERS' }), addPlayer(room, 'H2', { pref: 'HIDERS' })];
  const any = [addPlayer(room, 'A1'), addPlayer(room, 'A2')];
  const players = [...seekerPrefs, ...hiderPrefs, ...any];
  const teams = assignTeams(players, { seekerRatio: 2 / 6, allowTeamPreference: true });
  for (const p of seekerPrefs) assert.equal(teams.get(p.id), TEAMS.SEEKERS, p.name);
  for (const p of hiderPrefs) assert.equal(teams.get(p.id), TEAMS.HIDERS, p.name);
});

test('preferences are ignored when allowTeamPreference=false', () => {
  const room = mkRoom();
  const allSeek = Array.from({ length: 6 }, (_, i) => addPlayer(room, `W${i}`, { pref: 'SEEKERS' }));
  const teams = assignTeams(allSeek, { seekerRatio: 0.34, allowTeamPreference: false });
  const { seekers } = countTeams(teams, allSeek);
  assert.equal(seekers, 2); // round(6*0.34)=2 regardless of preferences
});

test('bots are always hiders', () => {
  const room = mkRoom();
  const humans = roster(['A', 'B', 'C']);
  const bot = addPlayer(room, 'BOT Hider 1', { isBot: true });
  const teams = assignTeams([...humans, bot], { seekerRatio: 0.5, allowTeamPreference: true });
  assert.equal(teams.get(bot.id), TEAMS.HIDERS);
});
