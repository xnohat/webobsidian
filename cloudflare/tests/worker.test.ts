import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest, type CloudflareEnvironment } from '../worker.js';

function environment(
  rateLimitSuccess = true,
  publicEditor = false,
  repo = 'repo',
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
    GITHUB_REPO: repo,
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

test('reads contribution workspace files from the selected open PR branch', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const branch = 'contrib/20260827-deadbeef';
  const responses = [
    new Response(JSON.stringify([{
      number: 7,
      html_url: 'https://github.com/upstream/repo/pull/7',
      title: 'Continue existing contribution',
      body: null,
      state: 'open',
      merged_at: null,
      updated_at: '2026-08-27T00:00:00Z',
      head: { ref: branch, repo: { owner: { login: 'fork' } } },
    }])),
    new Response('# Draft from PR branch'),
  ];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return responses.shift() ?? new Response('unexpected request', { status: 500 });
  };

  try {
    const response = await routeRequest(
      new Request(`https://editor.example/api/files/content?path=docs%2FGuide.md&branch=${encodeURIComponent(branch)}`),
      environment(true, true),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      path: 'docs/Guide.md',
      content: '# Draft from PR branch',
      encoding: 'utf8',
    });
    assert.match(requests[0], /\/upstream\/repo\/pulls\?/);
    assert.match(requests[1], /\/fork\/repo\/contents\/docs\/Guide\.md\?ref=contrib%2F20260827-deadbeef$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reads the file tree from the selected contribution workspace branch', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const branch = 'contrib/20260827-cafebabe';
  const responses = [
    new Response(JSON.stringify([{
      number: 8,
      html_url: 'https://github.com/upstream/repo/pull/8',
      title: 'Add another page',
      body: null,
      state: 'open',
      merged_at: null,
      updated_at: '2026-08-27T01:00:00Z',
      head: { ref: branch, repo: { owner: { login: 'fork' } } },
    }])),
    new Response(JSON.stringify({
      sha: 'workspace-tree',
      truncated: false,
      tree: [
        { path: 'docs', mode: '040000', type: 'tree', sha: 'docs-sha' },
        { path: 'docs/New.md', mode: '100644', type: 'blob', sha: 'new-sha' },
      ],
    })),
  ];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return responses.shift() ?? new Response('unexpected request', { status: 500 });
  };

  try {
    const response = await routeRequest(
      new Request(`https://editor.example/api/files/?branch=${encodeURIComponent(branch)}`),
      environment(true, true),
    );
    const body = await response.json() as { path: string; children: Array<{ path: string }> };

    assert.equal(response.status, 200);
    assert.equal(body.path, 'docs');
    assert.equal(body.children[0]?.path, 'docs/New.md');
    assert.match(requests[1], /\/fork\/repo\/git\/trees\/contrib%2F20260827-cafebabe\?recursive=1$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searches staging Markdown through the public read-only API', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'tree-sha',
      truncated: false,
      tree: [
        { path: 'docs/Guide/Alpha.md', mode: '100644', type: 'blob', sha: 'alpha-sha', size: 96 },
        { path: 'docs/Guide/Beta.md', mode: '100644', type: 'blob', sha: 'beta-sha', size: 48 },
      ],
    })),
    new Response(JSON.stringify({
      data: {
        repository: {
          d0: {
            text: '---\ntitle: Alpha Guide\ntags: [guide, usc]\nstatus: draft\n---\n# Welcome\nLearn Cloudflare Workers.\n[[Beta]]',
            byteSize: 111,
          },
          d1: { text: '# Beta\nLinks to [[Alpha]].', byteSize: 27 },
        },
      },
    })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/search?q=cloudflare'),
      environment(true, true),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      query: 'cloudflare',
      hits: [{
        path: 'docs/Guide/Alpha.md',
        title: 'Alpha Guide',
        score: 1,
        tags: ['guide', 'usc'],
        snippet: 'Learn Cloudflare Workers.',
      }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('lists tags from staging Markdown', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'tags-tree',
      truncated: false,
      tree: [
        { path: 'docs/A.md', mode: '100644', type: 'blob', sha: 'a-sha' },
        { path: 'docs/B.md', mode: '100644', type: 'blob', sha: 'b-sha' },
      ],
    })),
    new Response(JSON.stringify({ data: { repository: {
      d0: { text: '---\ntags: [usc, guide]\n---\n# A\n#campus' },
      d1: { text: '---\ntags:\n  - usc\n---\n# B' },
    } } })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/tags'),
      environment(true, true, 'tags-repo'),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      tags: [
        { tag: 'usc', count: 2 },
        { tag: 'campus', count: 1 },
        { tag: 'guide', count: 1 },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('lists inferred frontmatter properties from staging Markdown', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'properties-tree',
      truncated: false,
      tree: [{ path: 'docs/A.md', mode: '100644', type: 'blob', sha: 'a-sha' }],
    })),
    new Response(JSON.stringify({ data: { repository: {
      d0: { text: '---\ntitle: A\nrating: 5\npublished: 2026-08-26\ndraft: false\naliases: [One]\ntags: [usc]\n---\nBody' },
    } } })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/properties'),
      environment(true, true, 'properties-repo'),
    );
    const body = await response.json() as { properties: Array<{ key: string; type: string; count: number }> };

    assert.equal(response.status, 200);
    assert.deepEqual(Object.fromEntries(body.properties.map((property) => [property.key, {
      type: property.type,
      count: property.count,
    }])), {
      aliases: { type: 'list', count: 1 },
      draft: { type: 'checkbox', count: 1 },
      published: { type: 'date', count: 1 },
      rating: { type: 'number', count: 1 },
      tags: { type: 'list', count: 1 },
      title: { type: 'text', count: 1 },
      cssclasses: { type: 'list', count: 0 },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('lists notes that link to the active staging document', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'backlinks-tree',
      truncated: false,
      tree: [
        { path: 'docs/Alpha.md', mode: '100644', type: 'blob', sha: 'alpha-sha' },
        { path: 'docs/Beta.md', mode: '100644', type: 'blob', sha: 'beta-sha' },
        { path: 'README.md', mode: '100644', type: 'blob', sha: 'outside-sha' },
      ],
    })),
    new Response(JSON.stringify({ data: { repository: {
      d0: { text: '# Alpha' },
      d1: { text: '# Beta\nSee [[Alpha]] and [[Alpha#Heading|again]].' },
    } } })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/backlinks?path=docs%2FAlpha.md'),
      environment(true, true, 'backlinks-repo'),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      path: 'docs/Alpha.md',
      backlinks: ['docs/Beta.md'],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolves a wikilink target against staging documents', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'resolve-tree',
      truncated: false,
      tree: [{ path: 'docs/Guide/Alpha.md', mode: '100644', type: 'blob', sha: 'alpha-sha' }],
    })),
    new Response(JSON.stringify({ data: { repository: { d0: { text: '# Alpha' } } } })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/resolve?target=Alpha'),
      environment(true, true, 'resolve-repo'),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { target: 'Alpha', path: 'docs/Guide/Alpha.md' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('builds graph nodes and edges from staging wikilinks', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'graph-tree',
      truncated: false,
      tree: [
        { path: 'docs/Alpha.md', mode: '100644', type: 'blob', sha: 'alpha-sha' },
        { path: 'docs/Beta.md', mode: '100644', type: 'blob', sha: 'beta-sha' },
      ],
    })),
    new Response(JSON.stringify({ data: { repository: {
      d0: { text: '---\ntags: [guide]\n---\n[[Beta]] [[Missing]] ![[image.png]]' },
      d1: { text: '# Beta' },
    } } })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/graph'),
      environment(true, true, 'graph-repo'),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      nodes: [
        { id: 'docs/Alpha.md', label: 'Alpha', kind: 'note', tags: ['guide'] },
        { id: 'docs/Beta.md', label: 'Beta', kind: 'note', tags: [] },
        { id: 'unresolved:missing', label: 'Missing', kind: 'unresolved', tags: [] },
        { id: 'attachment:image.png', label: 'image.png', kind: 'attachment', tags: [] },
      ],
      edges: [
        { source: 'docs/Alpha.md', target: 'docs/Beta.md' },
        { source: 'docs/Alpha.md', target: 'unresolved:missing' },
        { source: 'docs/Alpha.md', target: 'attachment:image.png' },
      ],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns highlighted match contexts for staging documents', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'matches-tree',
      truncated: false,
      tree: [{ path: 'docs/Alpha.md', mode: '100644', type: 'blob', sha: 'alpha-sha' }],
    })),
    new Response(JSON.stringify({ data: { repository: {
      d0: { text: 'Alpha appears. alpha again.' },
    } } })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/search/matches', {
        method: 'POST',
        body: JSON.stringify({
          query: 'Alpha',
          paths: ['docs/Alpha.md', '../secret.md'],
          matchCase: false,
          phrase: true,
        }),
      }),
      environment(true, true, 'matches-repo'),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      matches: [{
        path: 'docs/Alpha.md',
        count: 2,
        contexts: [{
          text: 'Alpha appears. alpha again.',
          ranges: [[0, 5], [15, 5]],
          pre: false,
          post: false,
        }],
      }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('supports tag, path, and title filters in staging search', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify({
      sha: 'fielded-tree',
      truncated: false,
      tree: [
        { path: 'docs/Guide/Alpha.md', mode: '100644', type: 'blob', sha: 'alpha-sha' },
        { path: 'docs/News/Alpha.md', mode: '100644', type: 'blob', sha: 'news-sha' },
      ],
    })),
    new Response(JSON.stringify({ data: { repository: {
      d0: { text: '---\ntitle: Alpha Manual\ntags: [guide]\n---\nCloudflare setup' },
      d1: { text: '---\ntitle: Alpha News\ntags: [news]\n---\nCloudflare release' },
    } } })),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('unexpected request', { status: 500 });

  try {
    const response = await routeRequest(
      new Request('https://editor.example/api/search?q=tag%3Aguide+path%3AGuide+title%3AManual+cloudflare'),
      environment(true, true, 'fielded-repo'),
    );
    const body = await response.json() as { hits: Array<{ path: string }> };

    assert.equal(response.status, 200);
    assert.deepEqual(body.hits.map((hit) => hit.path), ['docs/Guide/Alpha.md']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps read-model endpoints read-only', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/api/graph', { method: 'POST' }),
    environment(true, true),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
  assert.deepEqual(await response.json(), { error: 'Method not allowed' });
});

test('rejects backlink paths outside the readable docs root', async () => {
  const response = await routeRequest(
    new Request('https://editor.example/api/backlinks?path=README.md'),
    environment(true, true),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Path is outside the readable document roots' });
});
