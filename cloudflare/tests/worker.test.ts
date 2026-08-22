import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest, type CloudflareEnvironment } from '../worker.js';

function environment(
  rateLimitSuccess = true,
  publicEditor = false,
): CloudflareEnvironment {
  const limiter = {
    async limit() {
      return { success: rateLimitSuccess };
    },
  };

  const env: CloudflareEnvironment = {
    GITHUB_TOKEN: 'token',
    GITHUB_UPSTREAM_OWNER: 'upstream',
    GITHUB_FORK_OWNER: 'fork',
    GITHUB_REPO: 'repo',
    GITHUB_STAGING_BRANCH: 'contributions',
    ASSETS: {
      async fetch() {
        return new Response('asset');
      },
    },
    LOGIN_RATE_LIMITER: limiter,
    CONTRIBUTION_RATE_LIMITER: limiter,
  };
  if (publicEditor) env.PUBLIC_EDITOR = 'true';
  else {
    env.EDITOR_PASSWORD = 'password123';
    env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
  }
  return env;
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

test('keeps contribution status reads separate from the submission limiter', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/api/contributions/status?path=docs/example.md'),
    environment(false),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

test('public editor mode authenticates visitors without a session cookie', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/auth/me'),
    environment(true, true),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    mustChangePassword: false,
  });
});

test('public editor mode does not require the login limiter or password secrets', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/auth/login', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    environment(false, true),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, mustChangePassword: false });
});

test('serves readable vault images as raw bytes', async () => {
  const originalFetch = globalThis.fetch;
  const image = new Uint8Array([137, 80, 78, 71]);
  globalThis.fetch = async () => new Response(image, {
    headers: { 'content-type': 'application/octet-stream' },
  });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/files/content?path=docs/Guide/attachments/image.png'),
      environment(true, true),
    );

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), image);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
