# Known limitations & cost

## Honest limitations (MVP)

**Gameplay**
- Hiders lack active tools (decoys/footstep faking) — deliberately out of the
  MVP; the `abilitiesEnabled` config flag + hooks exist for them.
- Practice bots teleport to a hiding spot and stay there (no AI movement).
- Found hiders roam visibly; there is no spectator camera for them.
- One map (by design). The `MAPS` registry makes adding maps data-only work.

**Networking**
- Server positions are *validated*, not simulated: a sophisticated cheater
  moving at exactly the speed cap can slide through walls client-side, but
  still cannot catch through them (LOS + distance use server state).
- Movement has no server rollback; corrections snap rather than reconcile.
- One server process; rooms live in memory (restart = rooms cleared, players
  bounce to home screen with a banner).

**Voice**
- WebRTC mesh: every team member connects to every other (great ≤ 8/team,
  degrades after ~10–12 per channel).
- ~10–20 % of network pairs (symmetric/CGNAT) need TURN; without it those
  players hear no one (we surface an error toast; game itself is unaffected).
- Browsers: Safari/iOS require user gesture for mic (handled via the
  enable-mic button); some Android WebViews block WebRTC entirely.

**Other**
- Guest names only; no accounts/persistence/stats.
- Room codes are unauthenticated secrets (fine for friends; not
  collusion-resistant tournament infra).
- Mini-map shows ground floor walls only (basement/roof shown contextually).

## Cost model

| Scale | Setup | Est. monthly cost |
|---|---|---|
| Development / LAN | laptop + `npm start` | **$0** |
| Friend groups (1–5 rooms, ~20 CCU) | free-tier PaaS or $5 VPS | **$0–5** |
| Small beta (100–300 CCU) | small VPS (2 vCPU/4 GB) + coturn | **$10–30** (TURN bandwidth is the variable) |
| Public launch | multiple nodes + Redis room store + SFU voice (LiveKit self-hosted or Photon/Vivox per-CCU pricing) + TURN | tens–hundreds $ |

What is free here and why: Socket.IO on your own Node process (no per-CCU
fee), WebRTC p2p audio (no audio servers), STUN via public Google servers,
no database, no CDN (assets served/vendored).

What stops being free: **TURN relay bandwidth** (~$0.40/GB on managed
services; ~$5 VPS self-hosted coturn covers a friend beta), **SFU voice**
when channels exceed mesh sizes, **compute** as rooms/CCU grow, and any
managed realtime/voice per-CCU pricing. The architecture isolates each of
these (see below) so you adopt them one at a time, when needed.

Cost-conscious choices already baked in: per-viewer filtered snapshots
(invisible enemies cost zero bandwidth), 15 Hz state + compact DTOs,
synthesized audio (0 KB SFX downloads), merged geometry (2 draw calls),
vendored three.js (no CDN), and idle room disposal.
