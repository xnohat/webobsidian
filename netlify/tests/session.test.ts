import assert from 'node:assert/strict';
import test from 'node:test';
import { issueSessionToken, passwordMatches, verifySessionToken } from '../lib/session.js';

const secret = 'a-session-secret-that-is-longer-than-thirty-two-characters';

test('accepts a signed session before expiry', async () => {
  const now = Date.UTC(2026, 7, 19, 0, 0, 0);
  const token = await issueSessionToken(secret, now);
  assert.equal(await verifySessionToken(token, secret, now + 1_000), true);
});

test('rejects expired and tampered sessions', async () => {
  const now = Date.UTC(2026, 7, 19, 0, 0, 0);
  const token = await issueSessionToken(secret, now);
  assert.equal(await verifySessionToken(token, secret, now + 13 * 60 * 60 * 1000), false);
  assert.equal(await verifySessionToken(`${token}tampered`, secret, now), false);
});

test('compares editor passwords without partial matches', () => {
  assert.equal(passwordMatches('correct horse battery staple', 'correct horse battery staple'), true);
  assert.equal(passwordMatches('correct horse', 'correct horse battery staple'), false);
});
