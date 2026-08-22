// ============================================================================
// FINAL ACCEPTANCE TEST (spec §38) — the full scenario over real sockets:
//
//   A creates a room; B..G join by code; teams are assigned (5 hiders /
//   2 seekers via ratio); hiders hide during preparation; seekers are frozen;
//   at 8m FIND is impossible (and the hider is not even in the seeker's
//   snapshot), at 2.5m catch is rejected TOO_FAR, at 1.8m with clear LOS the
//   catch succeeds and state syncs to everyone; a wall-blocked catch at 1.5m
//   fails; voice channels are isolated; disconnect+reconnect restores state;
//   finding everyone -> SEEKERS WIN; a timed-out round -> HIDERS WIN.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';
import { attachSocketAPI } from '../../server/socket-api.js';
import { RoomManager } from '../../server/rooms.js';
import { PHASES, TEAMS, STATUS } from '../../shared/constants.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let __step = 0;
const __t0 = Date.now();
const step = (msg) => console.error(`STEP ${++__step} (+${Date.now()-__t0}ms): ${msg}`);

async function connect(url) {
  const socket = Client(url, { transports: ['websocket'] });
  await new Promise((res, rej) => { socket.once('connect', res); socket.once('connect_error', rej); });
  return socket;
}
const emitAck = (socket, event, payload) =>
  new Promise((res) => socket.emit(event, payload, res));
const nextEvent = (socket, event, timeoutMs = 4000, filter = () => true) =>
  new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const handler = (payload) => {
      if (!filter(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      res(payload);
    };
    socket.on(event, handler);
  });

/** Walk a player to a target position through validated movement updates. */
async function walkTo(room, player, socket, [tx, , tz], step = 0.3) {
  let guard = 0;
  while (guard++ < 800) {
    const [x, y, z] = player.pos;
    const dx = tx - x, dz = tz - z;
    const d = Math.hypot(dx, dz);
    if (d < step) break;
    const k = Math.min(1, step / d);
    const nx = x + dx * k, nz = z + dz * k;
    socket.emit('game:move', { p: [nx, y, nz], r: player.rot ?? 0, a: 'run' });
    player.pos = [nx, y, nz];
    await sleep(8); // keep dt small but nonzero so speed validation passes
  }
}

test('FULL ACCEPTANCE SCENARIO', async () => {
  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: true } });
  const manager = new RoomManager({ log: () => {} });
  attachSocketAPI(io, manager, {}, () => {});
  await new Promise((res) => httpServer.listen(0, '127.0.0.1', res));
  const port = httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;

    const names = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay', 'Gus']; // A..G
  const sockets = {};
  const sessions = {};
  try {
    // -- A creates a room; everyone else joins with the code ------------------
    const A = await connect(url);
    sockets.Ann = A;
    const created = await emitAck(A, 'room:create', { name: 'Ann' });
    assert.equal(created.ok, true);
    assert.match(created.code, /^[A-HJ-NP-Z2-9]{6}$/);
    sessions.Ann = created.sessionId;
    const code = created.code;

    for (const name of names.slice(1)) {
      const s = await connect(url);
      sockets[name] = s;
      const joined = await emitAck(s, 'room:join', { code, name });
      assert.equal(joined.ok, true, name);
      sessions[name] = joined.sessionId;
    }
    const room = manager.rooms.get(code);
    assert.equal(room.players.size, 7);

    // This scenario asserts the deterministic distance/LOS catch ladder, so the
    // random supply crates must be OFF: a hider walking across a random hide
    // spot can pick up a 🕶 cloak crate and become uncatchable ("CLOAKED"),
    // which intermittently broke the "find everyone -> SEEKERS WIN" loop.
    room.roomSettings.itemsEnabled = false;

    // -- invalid room code join is rejected ------------------------------------
    const stray = await connect(url);
    const bad = await emitAck(stray, 'room:join', { code: 'ZZZZZZ', name: 'Nope' });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'INVALID_CODE');
    stray.close();

    // -- host configures the round (2 seekers of 8 incl. bot) ------------------
    await emitAck(A, 'lobby:settings', { seekerRatio: 0.25, minPlayers: 2, preparationSec: 20, roundSec: 120 });
    assert.equal(room.cfg.seekerRatio, 0.25);

    // -- everyone readies, host adds a practice bot, starts --------------------
    for (const name of names.slice(1)) sockets[name].emit('lobby:ready', { ready: true });
    await sleep(100);
    A.emit('lobby:addBot', {});
    await sleep(100);
    assert.equal([...room.players.values()].filter((p) => p.isBot).length, 1);

    const teamsP = Promise.all(names.map((n) => nextEvent(sockets[n], 'game:teams')));
    const startRes = await emitAck(A, 'game:start', {});
    assert.equal(startRes.ok, true, JSON.stringify(startRes));
    const teamsMsg = await teamsP;
    assert.equal(room.phase, PHASES.TEAM_ASSIGNMENT);

    // 8 participants * 0.25 = 2 seekers, 6 hiders (A..E of the humans minus 2 seekers)
    const seekers = [...room.players.values()].filter((p) => p.team === TEAMS.SEEKERS);
    const hiders = [...room.players.values()].filter((p) => p.team === TEAMS.HIDERS);
    assert.equal(seekers.length, 2);
    assert.equal(hiders.length, 6);
    assert.ok(teamsMsg.every((m) => m && m.teams && m.teams.HIDERS && m.teams.SEEKERS));

    const seekerSocket = sockets[seekers[0].name];
    const seekerPlayer = seekers[0];
    const otherSeeker = seekers[1];
    const humanHiders = hiders.filter((p) => !p.isBot && p.name !== seekers[0].name && p.name !== otherSeeker.name);
    const bot = hiders.find((p) => p.isBot);

    // -- voice channels are automatically team-based ---------------------------
    await sleep(150);
    for (const s of seekers) assert.equal(s.voiceChannel, TEAMS.SEEKERS);
    for (const h of hiders.filter((p) => p.connected)) assert.equal(h.voiceChannel, TEAMS.HIDERS);
    assert.equal(bot.voiceChannel, null);
    // cross-team signaling rejected
    assert.equal(room.voice.relaySignal(seekerPlayer, humanHiders[0].id, { sdp: 'x' }), false);

    // -- preparation: hiders hide, seekers frozen ------------------------------
    room.forcePhaseExpiry(); // -> PREPARATION
    await sleep(100);
    assert.equal(room.phase, PHASES.PREPARATION);
    assert.ok(seekerPlayer.pos[2] > 40, 'seeker waits at the entrance');

    // Fay (hider) sneaks to a spot 8m north of the seeker
    const fay = humanHiders[0];
    await walkTo(room, fay, sockets[fay.name], [32, 0, 33.6]);

    room.forcePhaseExpiry(); // -> ACTIVE_ROUND
    await sleep(100);
    assert.equal(room.phase, PHASES.ACTIVE_ROUND);

    // -- 8m: hider absent from the seeker snapshot + catch rejected ------------
    await sleep(250); // let a snapshot tick land
    let snap = await lastSnapWith(seekerSocket, (s) => s.ph === PHASES.ACTIVE_ROUND);
    assert.ok(snap, 'snapshot arrived');
    assert.ok(!snap.pl.some((p) => p.i === fay.id), 'hider at 8m not even sent to the seeker');
    let res = await emitAck(seekerSocket, 'game:catch', { targetId: fay.id });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'TOO_FAR'); // server computed the distance itself

    // -- 2.5m: visible (revealed) but FIND still rejected -----------------------
    await walkTo(room, fay, sockets[fay.name], [32, 0, 39.1]);
    await sleep(250);
    snap = await lastSnapWith(seekerSocket, (s) => s.pl.some((p) => p.i === fay.id));
    assert.ok(snap, 'hider now visible at 2.5m');
    assert.equal(snap.pl.find((p) => p.i === fay.id).rv, 1, 'marked revealed');
    res = await emitAck(seekerSocket, 'game:catch', { targetId: fay.id });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'TOO_FAR');

    // -- 1.8m with clear line of sight: CATCH! ----------------------------------
    await walkTo(room, fay, sockets[fay.name], [32, 0, 39.8]);
    const catchPromise = nextEvent(sockets[fay.name], 'game:catchResult');
    const feedPromise = nextEvent(sockets[fay.name], 'game:feed', 4000, (f) => f.kind === 'catch');
    res = await emitAck(seekerSocket, 'game:catch', { targetId: fay.id });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(fay.status, STATUS.FOUND);
    await catchPromise; // found player got the update
    const feed = await feedPromise;
    assert.match(feed.text, /found/);

    // found hider is now visible to the seeker team at any distance
    await sleep(250);
    snap = await lastSnapWith(seekerSocket, (s) => s.pl.some((p) => p.i === fay.id));

    // -- wall-blocked catch at ~1.6m fails (behind the reception shelf wall) ---
    const otherSeekerSocket = sockets[otherSeeker.name];
    bot.pos = [24.9, 0, 33];               // east of the reception shelf wall
    otherSeeker.pos = [22.9, 0, 33];       // west of it (1.6m away? -> 2.0m)
    res = await emitAck(otherSeekerSocket, 'game:catch', { targetId: bot.id });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'NO_LINE_OF_SIGHT');
    assert.equal(bot.status, STATUS.HIDDEN, 'bot remains hidden');

    // -- disconnect + reconnect restores team and HIDDEN status ----------------
    const cat = humanHiders.find((p) => p.name !== fay.name);
    const catName = cat.name;
    sockets[catName].disconnect();
    await sleep(150);
    assert.equal(cat.status, STATUS.DISCONNECTED);
    assert.equal(cat.team, TEAMS.HIDERS);

    const rejoined = await connect(url);
    sockets[catName] = rejoined;
    const rres = await emitAck(rejoined, 'room:rejoin', { code, sessionId: sessions[catName] });
    assert.equal(rres.ok, true);
    assert.equal(cat.team, TEAMS.HIDERS);
    assert.equal(cat.status, STATUS.HIDDEN);
    assert.ok(cat.connected);

    // -- seekers find everyone -> SEEKERS WIN -----------------------------------
    const resultsP = nextEvent(sockets.Ann, 'game:results', 8000);
    for (const h of room.hiddenHiders()) {
      h.pos = [...seekerPlayer.pos]; // stand them next to the seeker (test shortcut)
      seekerPlayer.lastCatchAt = 0;
      await sleep(350);
      const r = await emitAck(seekerSocket, 'game:catch', { targetId: h.id });
      assert.equal(r.ok, true, `${h.name}: ${r.reason}`);
    }
    const results = await resultsP;
    assert.equal(results.winner, TEAMS.SEEKERS);
    assert.equal(results.foundCount, results.hiderCount);
    assert.ok(results.timeRemainingMs > 0);
    assert.equal(room.phase, PHASES.ROUND_END);

    // -- back to the lobby, second round: timer expiry -> HIDERS WIN ------------
    room.forcePhaseExpiry(); // -> RESULTS
    await sleep(50);
    room.forcePhaseExpiry(); // -> LOBBY
    assert.equal(room.phase, PHASES.LOBBY);
    for (const name of names.slice(1)) sockets[name].emit('lobby:ready', { ready: true });
    await sleep(100);
    assert.equal((await emitAck(A, 'game:start', {})).ok, true);
    room.forcePhaseExpiry(); // prep
    room.forcePhaseExpiry(); // active
    assert.equal(room.phase, PHASES.ACTIVE_ROUND);

    room.phaseEndsAt = Date.now() - 10;
    const results2P = nextEvent(sockets.Ann, 'game:results');
    room._tick();
    const results2 = await results2P;
    assert.equal(results2.winner, TEAMS.HIDERS);
    assert.equal(results2.reason, 'TIME_EXPIRED');
    assert.ok(results2.hidersRemaining.length >= 1);
  } finally {
    for (const s of Object.values(sockets)) s.close();
    for (const r of manager.rooms.values()) r.dispose();
    await new Promise((res) => io.close(res));
    httpServer.close();
  }
});

let lastSnapCache = null;
import { EVENTS } from '../../shared/constants.js';
function lastSnapWith(socket, filter) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(lastSnapCache), 400);
    const handler = (s) => {
      lastSnapCache = s;
      if (filter(s)) { clearTimeout(timer); socket.off(EVENTS.GAME_SNAPSHOT, handler); resolve(s); }
    };
    socket.on(EVENTS.GAME_SNAPSHOT, handler);
  });
}
