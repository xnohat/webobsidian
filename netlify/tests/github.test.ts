import assert from 'node:assert/strict';
import test from 'node:test';
import type { EditorConfig } from '../lib/config.js';
import { createContribution, listContributions } from '../lib/github.js';

const config: EditorConfig = {
  githubToken: 'test-token',
  upstreamOwner: 'hzxyayaya',
  forkOwner: 'cherryLucas',
  repo: 'USC-wiki',
  stagingBranch: 'contributions',
};

test('creates a fork branch, atomic commit, and staging pull request', async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: unknown; authorization: string | null }> = [];
  const responses = [
    { object: { sha: 'base-sha' } },
    { tree: { sha: 'base-tree' } },
    { ref: 'refs/heads/contrib/20260819-a1b2c3d4' },
    { sha: 'new-tree' },
    { sha: 'new-commit' },
    { ref: 'refs/heads/contrib/20260819-a1b2c3d4' },
    { number: 42, html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/42' },
  ];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      authorization: headers.get('authorization'),
    });
    const body = responses.shift();
    assert.ok(body, `Unexpected GitHub request: ${url}`);
    return Response.json(body);
  }) as typeof fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await createContribution(
    config,
    {
      title: '更新选课经验',
      contributorName: '张三',
      files: [{ path: 'docs/选课/计算机学院.md', content: '# 新内容' }],
    },
    'contrib/20260819-a1b2c3d4',
  );

  assert.deepEqual(result, {
    action: 'created',
    branch: 'contrib/20260819-a1b2c3d4',
    commitSha: 'new-commit',
    pullNumber: 42,
    pullUrl: 'https://github.com/hzxyayaya/USC-wiki/pull/42',
  });
  assert.equal(requests.length, 7);
  assert.equal(requests[0].url.endsWith('/hzxyayaya/USC-wiki/git/ref/heads/contributions'), true);
  assert.equal(requests[2].url.endsWith('/cherryLucas/USC-wiki/git/refs'), true);
  assert.equal(requests[6].url.endsWith('/hzxyayaya/USC-wiki/pulls'), true);
  assert.equal(requests.every((request) => request.authorization === 'Bearer test-token'), true);

  const treeRequest = requests[3].body as { tree: Array<{ path: string; content: string }> };
  assert.deepEqual(treeRequest.tree, [
    { path: 'docs/选课/计算机学院.md', mode: '100644', type: 'blob', content: '# 新内容' },
  ]);

  const pullRequest = requests[6].body as { head: string; base: string; body: string };
  assert.equal(pullRequest.head, 'cherryLucas:contrib/20260819-a1b2c3d4');
  assert.equal(pullRequest.base, 'contributions');
  assert.match(pullRequest.body, /不直接进入 `main`/);
  assert.match(pullRequest.body, /usc-wiki-editor-files:/);
});

test('creates Git blobs for binary contribution attachments', async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body?: unknown }> = [];
  const responses = [
    { object: { sha: 'base-sha' } },
    { tree: { sha: 'base-tree' } },
    { ref: 'refs/heads/contrib/20260819-deadbeef' },
    { sha: 'image-blob-sha' },
    { sha: 'new-tree' },
    { sha: 'new-commit' },
    { ref: 'refs/heads/contrib/20260819-deadbeef' },
    { number: 43, html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/43' },
  ];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const body = responses.shift();
    assert.ok(body, `Unexpected GitHub request: ${url}`);
    return Response.json(body);
  }) as typeof fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  await createContribution(
    config,
    {
      title: '新增图片',
      contributorName: '张三',
      files: [
        { path: 'docs/指南/新文档.md', content: '![[示例.png]]' },
        { path: 'docs/指南/attachments/示例.png', content: 'iVBORw0KGgo=', encoding: 'base64' },
      ],
    },
    'contrib/20260819-deadbeef',
  );

  assert.equal(requests[3].url.endsWith('/cherryLucas/USC-wiki/git/blobs'), true);
  assert.deepEqual(requests[3].body, { content: 'iVBORw0KGgo=', encoding: 'base64' });
  assert.deepEqual((requests[4].body as { tree: unknown[] }).tree, [
    { path: 'docs/指南/新文档.md', mode: '100644', type: 'blob', content: '![[示例.png]]' },
    { path: 'docs/指南/attachments/示例.png', mode: '100644', type: 'blob', sha: 'image-blob-sha' },
  ]);
});

test('moves an existing folder with Git tree entries in the same contribution commit', async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body?: unknown }> = [];
  const responses = [
    { object: { sha: 'base-sha' } },
    { tree: { sha: 'base-tree' } },
    { ref: 'refs/heads/contrib/20260819-feedface' },
    {
      sha: 'base-tree',
      truncated: false,
      tree: [
        { path: 'docs/旧目录/a.md', mode: '100644', type: 'blob', sha: 'a-sha' },
        { path: 'docs/旧目录/attachments/a.png', mode: '100644', type: 'blob', sha: 'img-sha' },
      ],
    },
    { sha: 'new-tree' },
    { sha: 'new-commit' },
    { ref: 'refs/heads/contrib/20260819-feedface' },
    { number: 44, html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/44' },
  ];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({
      url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const body = responses.shift();
    assert.ok(body, `Unexpected GitHub request: ${url}`);
    return Response.json(body);
  }) as typeof fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  await createContribution(config, {
    title: '整理目录',
    contributorName: 'Lucas',
    files: [{ path: 'docs/说明.md', content: '# 说明' }],
    moves: [{ from: 'docs/旧目录', to: 'docs/新目录' }],
  }, 'contrib/20260819-feedface');

  const treeRequest = requests[4].body as { tree: Array<{ path: string; sha?: string | null }> };
  assert.deepEqual(treeRequest.tree, [
    { path: 'docs/旧目录/a.md', sha: null },
    { path: 'docs/新目录/a.md', mode: '100644', type: 'blob', sha: 'a-sha' },
    { path: 'docs/旧目录/attachments/a.png', sha: null },
    { path: 'docs/新目录/attachments/a.png', mode: '100644', type: 'blob', sha: 'img-sha' },
    { path: 'docs/说明.md', mode: '100644', type: 'blob', content: '# 说明' },
  ]);
});

test('lists only open editor contribution branches from the configured fork', async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json([
    {
      number: 7,
      html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/7',
      title: '更新 中国软件杯',
      body: null,
      state: 'open',
      merged_at: null,
      updated_at: '2026-08-19T09:00:00Z',
      head: {
        ref: 'contrib/20260819-3e98d0f0',
        repo: { owner: { login: 'cherryLucas' } },
      },
    },
    {
      number: 8,
      html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/8',
      title: 'Unrelated fork',
      body: null,
      state: 'open',
      merged_at: null,
      updated_at: '2026-08-19T08:00:00Z',
      head: { ref: 'contrib/20260819-a1b2c3d4', repo: { owner: { login: 'someoneElse' } } },
    },
    {
      number: 9,
      html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/9',
      title: 'Unmanaged branch',
      body: null,
      state: 'open',
      merged_at: null,
      updated_at: '2026-08-19T07:00:00Z',
      head: { ref: 'feature/docs', repo: { owner: { login: 'cherryLucas' } } },
    },
  ])) as typeof fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  assert.deepEqual(await listContributions(config), [
    {
      branch: 'contrib/20260819-3e98d0f0',
      pullNumber: 7,
      pullUrl: 'https://github.com/hzxyayaya/USC-wiki/pull/7',
      title: '更新 中国软件杯',
      status: 'open',
      updatedAt: '2026-08-19T09:00:00Z',
    },
  ]);
});

test('finds a merged legacy contribution by its changed file', async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    if (url.includes('/files?')) {
      return Response.json([{ filename: 'docs/竞赛与资源/竞赛/中国软件杯.md' }]);
    }
    return Response.json([{
      number: 7,
      html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/7',
      title: '更新 中国软件杯',
      body: '由旧版编辑器创建，没有文件标记。',
      state: 'closed',
      merged_at: '2026-08-19T09:30:00Z',
      updated_at: '2026-08-19T09:30:00Z',
      head: {
        ref: 'contrib/20260819-3e98d0f0',
        repo: { owner: { login: 'cherryLucas' } },
      },
    }]);
  }) as typeof fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  assert.deepEqual(
    await listContributions(config, 'docs/竞赛与资源/竞赛/中国软件杯.md'),
    [{
      branch: 'contrib/20260819-3e98d0f0',
      pullNumber: 7,
      pullUrl: 'https://github.com/hzxyayaya/USC-wiki/pull/7',
      title: '更新 中国软件杯',
      status: 'merged',
      updatedAt: '2026-08-19T09:30:00Z',
    }],
  );
  assert.equal(requests.length, 2);
  assert.match(requests[0], /state=all/);
  assert.match(requests[1], /pulls\/7\/files/);
});

test('adds a commit to an existing open contribution pull request', async (context) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const responses = [
    [{ number: 42, html_url: 'https://github.com/hzxyayaya/USC-wiki/pull/42' }],
    { object: { sha: 'previous-head' } },
    { tree: { sha: 'previous-tree' } },
    { sha: 'updated-tree' },
    { sha: 'updated-commit' },
    { ref: 'refs/heads/contrib/20260819-a1b2c3d4' },
    { number: 42 },
  ];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const body = responses.shift();
    assert.ok(body, `Unexpected GitHub request: ${url}`);
    return Response.json(body);
  }) as typeof fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { updateContribution } = await import('../lib/github.js');
  const result = await updateContribution(
    config,
    {
      title: '继续更新选课经验',
      contributorName: '张三',
      files: [{ path: 'docs/选课/计算机学院.md', content: '# 第二版' }],
    },
    'contrib/20260819-a1b2c3d4',
  );

  assert.deepEqual(result, {
    action: 'updated',
    branch: 'contrib/20260819-a1b2c3d4',
    commitSha: 'updated-commit',
    pullNumber: 42,
    pullUrl: 'https://github.com/hzxyayaya/USC-wiki/pull/42',
  });
  assert.equal(requests.length, 7);
  assert.match(requests[0].url, /pulls\?state=open&head=cherryLucas%3Acontrib%2F/);
  assert.equal(requests[1].url.endsWith('/cherryLucas/USC-wiki/git/ref/heads/contrib/20260819-a1b2c3d4'), true);
  assert.deepEqual((requests[4].body as { parents: string[] }).parents, ['previous-head']);
  assert.equal(requests[5].method, 'PATCH');
  assert.equal(requests[6].url.endsWith('/hzxyayaya/USC-wiki/pulls/42'), true);
});
