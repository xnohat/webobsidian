import assert from 'node:assert/strict';
import test from 'node:test';
import health from '../functions/health.js';

test('health endpoint reports service readiness without exposing configuration values', async () => {
  const response = await health(new Request('https://editor.example/api/health'));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'usc-wiki-contribution-editor');
  assert.equal(typeof body.githubConfigured, 'boolean');
  assert.equal(typeof body.authConfigured, 'boolean');
  assert.deepEqual(Object.keys(body).sort(), ['authConfigured', 'githubConfigured', 'ok', 'service']);
});

test('health endpoint rejects mutation methods', async () => {
  const response = await health(
    new Request('https://editor.example/api/health', { method: 'POST' }),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
