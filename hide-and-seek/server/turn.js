// ============================================================================
// server/turn.js — Feature 1: cross-network voice via a Coturn TURN relay.
//
// Why: STUN only works when both players can reach each other directly (same
// network, or at least open NAT). Across two different home networks behind
// strict/symmetric NAT, the WebRTC mesh fails unless a TURN relay can forward
// the media. The host runs Coturn on their own laptop (free, no VPS) and
// port-forwards UDP 3478 (+TCP 3478) to it; this module hands every client
// short-lived TURN credentials so the relay authenticates them.
//
// Coturn "static-auth-secret" scheme (RFC 5766 style):
//   username   = <unix expiry timestamp>            (what the spec calls the
//                 "expiry timestamp username")
//   credential = base64( HMAC-SHA1(secret, username) )
// coturn is started with `--use-auth-secret --static-auth-secret=<secret>`.
//
// Credentials are generated per /api/config request so they never go stale
// (each is valid for `ttlSec` from generation).
// ============================================================================

import { createHmac } from 'node:crypto';

/**
 * Build the ICE server list served at GET /api/config.
 *
 * @param {object} o
 * @param {string} o.stunUrls        existing comma-separated STUN list (always served)
 * @param {string} [o.turnPublicIp]  the router/laptop PUBLIC IP where Coturn listens
 * @param {string} [o.turnSecret]    coturn static-auth-secret (env TURN_SECRET)
 * @param {string} [o.turnRealm]     coturn realm (env TURN_REALM, default 'blackwood')
 * @param {number} [o.turnPort]      coturn listener port (env TURN_PORT, default 3478)
 * @param {number} [o.turnTtlSec]    credential lifetime (env TURN_TTL_SEC, default 3600)
 * @returns {{iceServers: Array, turn?: object}}
 */
export function buildIceConfig({ stunUrls, turnPublicIp, turnSecret, turnRealm = 'blackwood', turnPort = 3478, turnTtlSec = 3600 } = {}) {
  const iceServers = [];
  if (stunUrls) {
    const urls = String(stunUrls).split(',').map((s) => s.trim()).filter(Boolean);
    if (urls.length) iceServers.push({ urls });
  }

  // No TURN configured → STUN only (works on the same network / open NAT).
  if (!turnPublicIp || !turnSecret) {
    return { iceServers };
  }

  const expiry = Math.floor(Date.now() / 1000) + Number(turnTtlSec || 3600);
  const username = String(expiry);
  const credential = createHmac('sha1', String(turnSecret)).update(username).digest('base64');
  const base = `turn:${turnPublicIp}:${Number(turnPort || 3478)}`;

  iceServers.push({
    urls: [`${base}?transport=udp`, `${base}?transport=tcp`],
    username,
    credential,
  });

  return {
    iceServers,
    turn: { realm: turnRealm, ttlSec: Number(turnTtlSec || 3600) },
  };
}

/**
 * Best-effort auto-detection of the machine's public IPv4 (only used when
 * TURN_PUBLIC_IP is not set). Network calls are wrapped so a failure simply
 * returns null — the game keeps working, just without TURN.
 */
export async function detectPublicIp(fetchImpl = globalThis.fetch) {
  if (!fetchImpl) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    timer.unref?.();
    const res = await fetchImpl('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(timer);
    const json = await res.json();
    if (typeof json?.ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(json.ip)) return json.ip;
  } catch { /* offline / blocked — no TURN */ }
  return null;
}
