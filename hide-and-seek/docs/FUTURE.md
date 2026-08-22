# Future extension plan

The MVP was built so each of these is an incremental change, not a rewrite.

## Gameplay (next up)
- **Special abilities** — `abilitiesEnabled` config + lobby toggle already
  ship. Add: seeker *scan pulse* (server sweeps revealRadius, answers
  "warm/cold"), *flashlight cone* (reveal requires facing), hider *decoy*
  (server spawns fake footstep events), *silent walk* (suppress footstep
  packets). All belong in new `server/abilities.js` + one HUD strip.
- **Movement pressure for hiders** — e.g. every 60 s the server emits a
  "sector shift" event shrinking the safe area (pure state-machine change).
- **More maps** — `shared/map.js` exports a `MAPS` registry; a new map is one
  builder function + labels/spawns. Lobby "Change map" needs a dropdown
  bound to `room.mapId`.
- **Game modes** — the round loop lives in `game-room.js`; a mode is a
  subclass overriding `endRound()`/timers (e.g. infection: caught hiders
  become seekers).

## Social / meta
- **Quick match / public matchmaking** — `RoomManager` is the seam: add a
  `matchmakingQueue` that pairs solo players into rooms; Redis-backed store
  (`rooms.js` interface maps 1:1 to `GET/SET room:<code>`) for multi-process.
- **Accounts** — replace guest names with an auth token at
  `socket-api.js` connection time; `Player.sessionId` already behaves like a
  session. Add profiles/stats tables; `GAME_RESULTS` payloads already carry
  per-player stats worth persisting.
- **Match history / leaderboards** — persist the `lastResults` object per
  round (it already contains everything a results screen or leaderboard needs).
- **Spectator mode** — a `SPECTATORS`-style team with full-visibility
  snapshots (`visibility.js` one-line change) + free camera.

## Voice / platform
- **LiveKit SFU provider** — implement `VoiceProvider` interface
  (`client/js/voice/`): joinChannel → server-issued token → room join. Server
  keeps team isolation by minting team-scoped tokens. Needed beyond ~10
  speakers/channel or when TURN costs grow.
- **Native clients** — the wire protocol (`shared/constants.js`) and rules are
  engine-agnostic; a Unity client can speak the same Socket.IO protocol
  (see ARCHITECTURE.md porting table) or the server moves to Photon Fusion
  while keeping `shared/` map + rules.

## Infra
- **Horizontal scale** — rooms are independent; move `RoomManager` to Redis,
  add sticky sessions by room code, run N processes.
- **Observability** — structured logs (`log()` seam exists), per-room metrics
  via `room.info`, health endpoint already exposed.
- **Abuse controls** — per-IP room creation limits, name filtering, replay
  logging of catch/LOS decisions for dispute review.

## Monetization (only after the loop is proven fun)
Cosmetics only (skins, nameplates, emotes — avatar is already a module with
a color/material seam). No pay-to-win; catch radius and speeds stay global
config.
