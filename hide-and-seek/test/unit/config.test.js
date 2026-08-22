import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, sanitizeRoomSettings, effectiveSettings } from '../../shared/config.js';

test('default config matches the round rules from the spec', () => {
  assert.equal(DEFAULT_CONFIG.minPlayers, 4);
  assert.equal(DEFAULT_CONFIG.maxPlayers, 10);
  assert.equal(DEFAULT_CONFIG.preparationSec, 30);
  assert.equal(DEFAULT_CONFIG.roundSec, 300);
  assert.equal(DEFAULT_CONFIG.catchRadius, 2.0);
  assert.equal(DEFAULT_CONFIG.requireLineOfSight, true);
});

test('sanitize clamps out-of-range host settings', () => {
  const s = sanitizeRoomSettings({ catchRadius: 999, roundSec: 5, seekerRatio: 0.9, requireLineOfSight: 'yes' });
  assert.equal(s.catchRadius, 5.0);
  assert.equal(s.roundSec, 60);
  assert.equal(s.seekerRatio, 0.5);
  assert.equal('requireLineOfSight' in s, false); // invalid type dropped
});

test('sanitize rejects junk input', () => {
  assert.deepEqual(sanitizeRoomSettings(null), {});
  assert.deepEqual(sanitizeRoomSettings('xss'), {});
  assert.deepEqual(sanitizeRoomSettings({ catchRadius: 'far' }), {});
});

test('effective settings merge', () => {
  const eff = effectiveSettings({ roundSec: 120 });
  assert.equal(eff.roundSec, 120);
  assert.equal(eff.catchRadius, DEFAULT_CONFIG.catchRadius);
});
