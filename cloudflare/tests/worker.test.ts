import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest, type CloudflareEnvironment } from '../worker.js';

function environment(rateLimitSuccess = true): CloudflareEnvironment {
  const limiter = {
    async limit() {
      return { success: rateLimitSuccess };
    },
  };

  return {
    GITHUB_TOKEN: 'token',
    GITHUB_UPSTREAM_OWNER: 'upstream',
    GITHUB_FORK_OWNER: 'fork',
    GITHUB_REPO: 'repo',
    GITHUB_STAGING_BRANCH: 'contributions',
    EDITOR_PASSWORD: 'password123',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    ASSETS: {
      async fetch() {
        return new Response('asset');
      },
    },
    LOGIN_RATE_LIMITER: limiter,
    CONTRIBUTION_RATE_LIMITER: limiter,
  };
}

test('routes health checks with the injected Cloudflare environment', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/api/health'),
    environment(),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'usc-wiki-contribution-editor',
    githubConfigured: true,
    authConfigured: true,
  });
});

test('serves non-API requests from the static asset binding', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/note/docs/getting-started'),
    environment(),
  );

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'asset');
});

test('returns JSON 404 for unknown API routes instead of the SPA shell', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/api/unknown'),
    environment(),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('enforces the Cloudflare login rate-limit binding', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/auth/login', { method: 'POST' }),
    environment(false),
  );

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'Too many requests' });
});
