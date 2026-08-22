# Browser test tools (optional)

`browser-smoke.mjs`, `browser-e2e.mjs`, `browser-screenshots.mjs` run the
client in real headless Chromium. They are OPTIONAL — the server and unit/
integration test suites need nothing beyond `npm install`.

To use them:

    npm i -D playwright-core @sparticuz/chromium
    node -e "import('@sparticuz/chromium').then(c=>c.default.executablePath())"
    # extract the bundled runtime libs once (Debian/Ubuntu hosts):
    mkdir -p /tmp/chr-libs
    node -e "const z=require('zlib'),f=require('fs');f.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(f.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
    tar -xf /tmp/al2023.tar -C /tmp/chr-libs

    npm start &                # server on :8080
    node tools/browser-smoke.mjs
    node tools/browser-e2e.mjs

(On hosts with a normal Chrome/Chromium installed, edit the launch call to
`executablePath: <your chrome>` and drop the LD_LIBRARY_PATH env instead.)
