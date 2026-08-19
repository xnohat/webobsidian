import assert from 'node:assert/strict';
import test from 'node:test';
import type { EditorConfig } from '../lib/config.js';
import { createContribution } from '../lib/github.js';

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
