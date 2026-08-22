// ============================================================================
// server/index.js — entry point.
//
//   node server/index.js            # http://localhost:8080
//   PORT=3000 node server/index.js
//
// Serves the static client + the Socket.IO realtime API. Also loads optional
// `config.local.json` overrides from the project root.
// ============================================================================

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';

import { DEFAULT_CONFIG } from '../shared/config.js';
import { RoomManager } from './rooms.js';
import { serveStatic } from './static.js';
import { attachSocketAPI } from './socket-api.js';

const ROOT = dirname(fileURLToPath(import.meta.url)); // .../server
const PROJECT_ROOT = join(ROOT, '..');

// ---- config: defaults <- config.local.json <- env ---------------------------
const config = { ...DEFAULT_CONFIG };
const localCfgPath = join(PROJECT_ROOT, 'config.local.json');
if (existsSync(localCfgPath)) {
  try {
    Object.assign(config, JSON.parse(readFileSync(localCfgPath, 'utf8')));
    console.log('[config] loaded config.local.json');
  } catch (e) {
    console.warn('[config] failed to parse config.local.json:', e.message);
  }
}
if (process.env.PORT) config.port = Number(process.env.PORT);
if (process.env.MAX_ROOMS) config.maxRooms = Number(process.env.MAX_ROOMS);
if (process.env.STUN_URLS) config.stunUrls = process.env.STUN_URLS;
if (!config.port) config.port = 8080;
if (!config.stunUrls) {
  config.stunUrls = 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const manager = new RoomManager({ maxRooms: config.maxRooms, log });

// ---- http ---------------------------------------------------------------------
const httpServer = createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...manager.stats() }));
    return;
  }
  if (req.url === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stunUrls: config.stunUrls, voiceEnabled: config.voiceEnabled }));
    return;
  }
  serveStatic(req, res);
});

// ---- socket.io -------------------------------------------------------------------
const io = new Server(httpServer, {
  cors: { origin: true, methods: ['GET', 'POST'] }, // preview proxy + any dev origin
  serveClient: true,
  pingInterval: 10_000,
  pingTimeout: 20_000,
  maxHttpBufferSize: 128 * 1024,
});
attachSocketAPI(io, manager, config, log);

httpServer.listen(config.port, '0.0.0.0', () => {
  log(`Hide&Seek server listening on http://0.0.0.0:${config.port}`);
  log(`voice STUN: ${config.stunUrls}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log('shutting down...');
    for (const room of manager.rooms.values()) room.dispose();
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
