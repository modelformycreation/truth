# Architecture

## The one diagram that matters

```
 ┌────────────────────────── CLIENT (browser, Three.js) ─────────────────────┐
 │  main.js ── screens (home/lobby/HUD/results)                              │
 │    │                                                                      │
 │    ├─ controller.js   local prediction: input → physics → position        │
 │    │                  (collision vs shared map boxes, ladders, step-up)   │
 │    ├─ remote.js       interpolated remote players                         │
 │    ├─ world/avatar    rendering (merged geometry, 2 draw calls static)    │
 │    ├─ audio.js        synthesized SFX (no asset downloads)                │
 │    ├─ chat.js         text chat UI (lobby all / in-round team-only)       │
 │    ├─ controls-ui.js  custom controls (drag buttons, joystick size/side)  │
 │    └─ voice/          WebRTC mesh ⇄ teammates (audio NEVER via server)    │
 │                      (STUN + TURN from /api/config for cross-network)     │
 └─────────────┬─────────────────────────────────────────────┬───────────────┘
        inputs │ game:move, game:catch, lobby:*               │ voice signaling
               ▼ (server-validated)                           ▼ (same-team only)
 ┌────────────────────────── SERVER (Node.js, authoritative) ────────────────┐
 │  socket-api → RoomManager → GameRoom (one per room code)                  │
 │    ├─ state machine: LOBBY→TEAM_ASSIGNMENT→PREPARATION→ACTIVE_ROUND→…     │
 │    ├─ movement.js    speed/teleport/phase checks → corrections/kicks      │
 │    ├─ catch.js       distance (server-measured) + LOS raycast vs map      │
 │    ├─ visibility.js  per-viewer FILTERED snapshots (anti-wallhack)        │
 │    ├─ voice.js       team channels, signaling relay, talk/mute events     │
 │    ├─ turn.js        TURN credential generation (cross-network voice)     │
 │    ├─ controls.js    per-player control persistence (game code / device)  │
 │    └─ chat: sendChat team-split text chat (lobby all / round team-only)   │
 │    └─ timers/wins/reconnect/host-migration/bots                           │
 │  shared/*  ← the exact same map + config + geometry code the client uses  │
 └────────────────────────────────────────────────────────────────────────────┘
```

## Key decisions & why

### 1. One shared module (`shared/`) for map, config, geometry
The client renders/collides with the *same box list* the server raycasts
line-of-sight against. There is no "client map" vs "server map" to drift.
Axis-aligned boxes make the slab raycast exact and cheap (~300 boxes,
pre-filtered by segment bbox → worst case ~0.3 ms per LOS check).

### 2. Movement: client prediction + server validation
Full server physics for 15 Hz×N players is overkill for an MVP; instead the
client simulates and the server independently validates every update:
horizontal/vertical deltas vs speed limits (with latency tolerance), world
bounds, and phase rules (seekers frozen during PREPARATION). Violations are
corrected with authoritative positions; repeat offenders are kicked. The
positions stored server-side are what catches and visibility use — so even a
speedhacker cannot catch from range (distance is re-measured from validated
server state, and corrections constantly pull cheaters back).

### 3. Visibility is a *network* filter, not cosmetics
`buildWorldSnapshot(room, viewer)` omits hidden enemies entirely unless
`distance ≤ revealRadius AND hasLineOfSight`. A modified client cannot
render what it never received. Teammates and FOUND players are always sent.

### 4. Catches: the button is a hint, the server is the judge
`attemptCatch()` re-derives everything from server state:
phase, team, target status, distance from eye positions, LOS raycast — then
answers `{ok}` or a machine-readable reason (`TOO_FAR`, `NO_LINE_OF_SIGHT`,
`NO_TARGET`, `NOT_SEEKER`, `NOT_ACTIVE_ROUND`, `COOLDOWN`). The client's
FIND button merely mirrors what the server already told it (revealed enemies
within catchRadius) for feel.

### 5. Timers: server clock
Phase deadlines are `Date.now() + duration` on the server, re-asserted by the
snapshot tick. Clients compute an NTP-lite offset (4–8 samples, best RTT) and
render remaining time from the server clock, so frame drops or device clock
skew never change the real round end.

### 6. Disconnect/reconnect that can't be abused
Disconnecting marks a player `DISCONNECTED` (uncatchable, invisible to
enemies, can't win alone). Rejoin within `reconnectGraceSec` restores team,
status, and position. After grace, a hidden hider is converted to FOUND
(forfeit) and win conditions re-checked — no "disconnect to win", no
invisible ghost winners.

### 7. Voice: provider interface, WebRTC mesh default
`VoiceManager` (game-facing) → `VoiceProvider` interface → `WebRtcMeshProvider`
(perfect-negotiation mesh, STUN only). The server owns channel assignment and
refuses cross-channel signaling. Because the interface is narrow
(acquireMic/joinChannel/handleSignal/setTransmitting/setMuted/setVolume),
replacing mesh with LiveKit SFU or Photon Voice is a single-file change plus
a token endpoint.

### 8. Performance budget (mobile-first)
- Whole static map = 2 merged meshes (vertex colors + emissive lights).
- No shadow maps; hemisphere + 2 directional lights; fog for depth.
- Pixel-ratio capped by quality setting; remote players ~9 primitives each.
- Wire format compact arrays, 15 Hz snapshots, only visible players.
- SFX synthesized with WebAudio (zero downloads); Three.js vendored (~690 KB,
  cached, works offline/LAN).

## Porting to Unity (if you outgrow the browser)

Every server file is engine-agnostic (pure JS data + math). A Unity port:

| This repo | Unity equivalent |
|---|---|
| `shared/map.js` | ScriptableObject / JSON → same boxes into ProBuilder |
| `server/*` | keep as-is (Fusion/Mirror dedicated server) or port handlers to photon room logic |
| `controller.js` | CharacterController + same constants from `config.js` |
| `visibility.js` snapshot filtering | server-side interest management |
| `voice/` | Photon Voice 2 (already team-scoped server-side) |

The wire protocol (`shared/constants.js` EVENTS) and rules can stay identical.
