# Testing

## Unit + acceptance tests (no browser needed)

```bash
npm test                 # everything (214 tests)
npm run test:unit        # fast logic tests
npm run test:integration # socket-level acceptance scenario
npm run verify:map       # map connectivity & hide-spot generation
```

Coverage highlights (`test/unit/`):

| File | What it locks down |
|---|---|
| `catch.test.js` | 1.5 m + LOS → caught; 8 m → `TOO_FAR`; wall at 1.5 m → `NO_LINE_OF_SIGHT`; LOS toggle; configurable radius; 2.5 m → `TOO_FAR`; wrong team → `NOT_SEEKER`; already-found → `NO_TARGET`; outside active round → `NOT_ACTIVE_ROUND`; disconnected hiders uncatchable; lying targetId rejected; cooldown; broadcast + feed |
| `visibility.test.js` | hidden enemy absent from snapshots at range; revealed within radius with LOS; wall blocks reveal; found players always visible; teammates visible; symmetric seeker-reveal; full visibility in reveal/end phases |
| `movement.test.js` | normal moves accepted; teleport clamped; speedhack clamped; out-of-bounds rejected; seekers frozen during PREPARATION; lobby movement rejected; kick after repeated violations |
| `rooms.test.js` | unique 6-char codes; valid/invalid/case-insensitive joins; full rooms; duplicate names; idle cleanup; host migration |
| `teams.test.js` | 8 players → 3 seekers/5 hiders (default ratio); always ≥1 per side; preferences honored/ignored; bots always hide |
| `voice.test.js` | per-team membership; cross-team signaling rejected; same-team relay; talk/mute scoped to channel; bots never in voice |
| `voice-toggle.test.js` | Feature 2: mic is a tap-to-toggle; no push-to-talk/hold; muting never leaks |
| `state.test.js` | full phase flow LOBBY→…→LOBBY; all-found → SEEKERS WIN; timer expiry → HIDERS WIN; hider disconnect forfeits after grace; reconnect restores team+HIDDEN; all-seekers-left; start gating; bot flow |
| `geometry.test.js` | segment-AABB correctness, doorway vs wall LOS, tall vs low props, floor isolation |
| `config.test.js` / `map.test.js` | spec defaults, clamped host settings, junk rejected; map integrity + hide spots across all 3 levels |
| `minimap-arrow.test.js` | Feature 4: the minimap self-arrow points where the player faces, not 180° backwards; map stays north-up |
| `sprint.test.js` | Feature 3: Free Fire locked-sprint state machine (rim-hold arms, next touch cancels, never self-cancels) |
| `turn.test.js` | Feature 1: Coturn static-auth-secret TURN credentials (username=expiry, HMAC cred), STUN-only fallback |
| `chat.test.js` / `chat-client.test.js` | Feature 5: lobby free chat, in-round team-split, length cap; client channel filtering (no cross-team leak) |
| `controls.test.js` | Feature 6: control sanitization + persistence keyed by game code / device id |

## Acceptance test (`test/integration/acceptance.test.js`)

The spec's final scenario, executed over **real Socket.IO connections**:

1. Ann creates a room; Bob/Cat/Dan/Eve/Fay/Gus join with the code.
2. Invalid code join rejected; host configures the round.
3. Everyone readies; host adds a practice bot; start → teams announced.
4. Voice channels split by team; cross-team signaling refused.
5. Preparation: hiders hide (validated movement), seekers teleported + frozen.
6. Active round, distance ladder exactly as specified:
   - 8 m → hider not even present in the seeker's snapshot; catch → rejected.
   - 2.5 m → hider visible (`revealed`); catch → `TOO_FAR`.
   - 1.8 m LOS clear → catch **succeeds**; both teams get events; found state.
   - ~2 m through a shelf wall → `NO_LINE_OF_SIGHT`.
7. Disconnect → `DISCONNECTED`; rejoin with session → team + HIDDEN restored.
8. Everyone found → `SEEKERS WIN` with time remaining.
9. Second round: timer expiry with a survivor → `HIDERS WIN`.

## Real-browser tests (headless Chromium)

The `tools/` scripts boot actual browsers against a running server:

```bash
npm start &                      # server on :8080
node tools/browser-smoke.mjs     # boots client, creates room, starts practice
node tools/browser-e2e.mjs       # TWO browsers play a full match: join by code,
                                 # teams, blindfold, movement sync, FIND enable
                                 # gating, catch, found sync, results screen
node tools/browser-screenshots.mjs   # captures docs/screenshots/*.png
```

These are **optional** tools — they need extra packages and a one-time
Chromium setup: see `tools/BROWSER-TOOLS.md`.

## Manual test checklist (for humans)

- [ ] Two devices (phone + laptop) join the same room via code.
- [ ] Host settings sliders update for everyone in the lobby.
- [ ] Seeker sees the blindfold overlay with countdown during PREPARATION.
- [ ] Hider can't be seen by the seeker until close + LOS (watch on 2 screens).
- [ ] FIND stays grey at 2.5 m, lights up at ~1.8 m, catch works.
- [ ] Standing on opposite sides of a shelf wall: FIND lights (reveal radius
      is 7 m) but the catch is rejected (wall).
- [ ] Found player gets the 💥 flash + red ring, becomes visible to seekers.
- [ ] Voice: teammates only; PTT hold; mute; speaking dots.
- [ ] Kill the seeker's Wi‑Fi for 10 s → reconnect banner → auto-rejoin.
- [ ] Round ends → results → back to lobby → play again.
