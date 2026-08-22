// ============================================================================
// server/static.js — dependency-free static file server for the client.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT_DIR = fileURLToPath(new URL('../client', import.meta.url));
const SHARED_DIR = fileURLToPath(new URL('../shared', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

export async function serveStatic(req, res) {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    // /shared/* modules are imported by client code (same authoritative data
    // as the server: map geometry, config, protocol constants)
    let base = CLIENT_DIR;
    if (urlPath.startsWith('/shared/')) {
      base = SHARED_DIR;
      urlPath = urlPath.slice('/shared'.length); // strip prefix, keep leading /
    }
    const filePath = normalize(join(base, urlPath));
    if (!filePath.startsWith(CLIENT_DIR) && !filePath.startsWith(SHARED_DIR)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    // Vendor assets (three.js) are big and immutable -> cache a day.
    // Everything else: NO-STORE. This is a dev/friends game served locally —
    // players must always get the latest code (a stale cached avatar.js once
    // made a "new characters" release look unchanged on open tabs).
    const cache = urlPath.startsWith('/vendor/') ? 'public, max-age=86400' : 'no-store';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': cache,
      'Last-Modified': new Date(statSync(filePath).mtimeMs).toUTCString(),
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
}
