// ============================================================================
// Regression tests — Feature 1: cross-network voice via TURN.
//
// The server hands every client short-lived TURN credentials (Coturn
// static-auth-secret scheme): username = expiry timestamp, credential =
// base64(HMAC-SHA1(secret, username)). These tests pin down buildIceConfig so
// the /api/config payload is always well-formed, and that a misconfigured or
// absent TURN falls back to STUN-only (never breaks same-network voice).
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildIceConfig, detectPublicIp } from '../../server/turn.js';

test('STUN-only config (no TURN env) still yields a usable iceServers list', () => {
  const { iceServers } = buildIceConfig({
    stunUrls: 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302',
  });
  assert.equal(iceServers.length, 1);
  assert.ok(iceServers[0].urls.length >= 2);
  assert.equal(iceServers[0].username, undefined, 'no TURN → no credentials needed');
});

test('TURN creds follow the Coturn static-auth-secret scheme (username=expiry)', () => {
  const secret = 's3cret';
  const { iceServers, turn } = buildIceConfig({
    stunUrls: 'stun:a:19302',
    turnPublicIp: '203.0.113.10',
    turnSecret: secret,
    turnRealm: 'blackwood',
    turnPort: 3478,
    turnTtlSec: 3600,
  });
  assert.equal(iceServers.length, 2, 'STUN + TURN are both served');
  const turnServer = iceServers[1];
  // both UDP and TCP transports for the same host:port
  assert.deepEqual(turnServer.urls, [
    'turn:203.0.113.10:3478?transport=udp',
    'turn:203.0.113.10:3478?transport=tcp',
  ]);
  // username is a future expiry timestamp (now + ttl)
  const expiry = Number(turnServer.username);
  assert.ok(expiry > Date.now() / 1000 && expiry <= Date.now() / 1000 + 3600 + 5,
    `username must be a near-future expiry, got ${turnServer.username}`);
  // credential == base64(hmac-sha1(secret, username))
  const expect = createHmac('sha1', secret).update(turnServer.username).digest('base64');
  assert.equal(turnServer.credential, expect, 'credential must be the RFC/Coturn HMAC');
  assert.equal(turn.realm, 'blackwood');
  assert.equal(turn.ttlSec, 3600);
});

test('TURN credentials are short-lived and rotate across requests', () => {
  const last = (cfg) => cfg.iceServers[cfg.iceServers.length - 1];
  const a = last(buildIceConfig({ turnPublicIp: 'ip', turnSecret: 'x', turnTtlSec: 60 }));
  // a second request a moment later has a (possibly) refreshed expiry
  const b = last(buildIceConfig({ turnPublicIp: 'ip', turnSecret: 'x', turnTtlSec: 60 }));
  assert.ok(Number(b.username) >= Number(a.username));
});

test('secret is required: TURN creds are only issued when TURN_SECRET is set', () => {
  const noSecret = buildIceConfig({ stunUrls: 'stun:a:19302', turnPublicIp: '1.2.3.4', turnSecret: '' });
  assert.equal(noSecret.iceServers.length, 1, 'no secret → STUN only');
  assert.equal(noSecret.turn, undefined);
});

test('the turn: URL embeds the public IP + port exactly as the spec asks', () => {
  const { iceServers } = buildIceConfig({
    turnPublicIp: '198.51.100.7', turnSecret: 'k', turnPort: 3478,
  });
  const turn = iceServers[iceServers.length - 1];
  for (const u of turn.urls) assert.ok(u.startsWith('turn:198.51.100.7:3478?transport='), u);
});

test('detectPublicIp returns null when the network is unreachable (never throws)', async () => {
  const failing = async () => { throw new Error('offline'); };
  const ip = await detectPublicIp(failing);
  assert.equal(ip, null);
});

test('detectPublicIp parses a valid public IPv4 response', async () => {
  const fake = async () => ({ json: async () => ({ ip: '84.123.45.6' }) });
  const ip = await detectPublicIp(fake);
  assert.equal(ip, '84.123.45.6');
});
