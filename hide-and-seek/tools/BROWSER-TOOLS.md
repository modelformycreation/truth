# Browser test tools (optional)

`browser-smoke.mjs`, `browser-e2e.mjs`, `browser-matrix.mjs`,
`map-screenshots.mjs`, `browser-screenshots.mjs` and `playtest-panel.mjs`
run the client in real headless Chromium. They are OPTIONAL — the server
and unit/integration test suites need nothing beyond `npm install`.

To use them:

    npm i -D playwright-core @sparticuz/chromium
    node -e "import('@sparticuz/chromium').then(c=>c.default.executablePath())"
    # extract the bundled runtime libs once (Debian/Ubuntu hosts):
    mkdir -p /tmp/chr-libs
    node -e "const z=require('zlib'),f=require('fs');f.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(f.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))\"
    tar -xf /tmp/al2023.tar -C /tmp/chr-libs

    npm start &                # server on :8080
    node tools/browser-smoke.mjs
    node tools/browser-e2e.mjs
    node tools/browser-matrix.mjs      # the strict-tester suite (129 checks)
    node tools/map-screenshots.mjs     # one in-world shot per map
    node tools/browser-screenshots.mjs # the README screenshots
    node tools/playtest-panel.mjs      # 100-persona playtest + 99/100 gate

### What each does

- **browser-matrix.mjs** — the strict-tester suite: desktop WASD + real
  mouse-look convention, iPhone-13 touch (joystick/sprint/jump driven by
  synthesized touch), a real WebRTC mic exchange between two contexts (fake
  mics), measurable WebAudio (footsteps/jump/land actually scheduled),
  supply-crate pickup, host kick/remove-bot, a full match (FIND gating at
  8 m / 2.5 m / 1.8 m), and edge cases (rejoin, host migration, room full).
  **Zero console errors are allowed; any check failure fails the run.**
- **playtest-panel.mjs** — records real gameplay (one session per map) and
  scores it with 100 persona-driven evaluators (Battle-Royale veterans,
  Among-Us sneaks, mobile casuals, …). It reports the panel's opinion only
  if **99/100 approve** (your gate); otherwise it lists who rejected and why.
  It is automated evaluation over real telemetry, not 100 human players.
- **map-screenshots.mjs / browser-screenshots.mjs** — capture the README
  images (one in-world shot per map, plus lobby/hider/seeker/results).

(On hosts with a normal Chrome/Chromium installed, edit the launch call to
`executablePath: <your chrome>` and drop the LD_LIBRARY_PATH env instead.)
