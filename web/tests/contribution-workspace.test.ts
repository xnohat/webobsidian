import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/lib/api.js';
import {
  clearContributionWorkspace,
  selectExistingContribution,
  selectNewContribution,
} from '../src/lib/contributionWorkspace.js';

test('a selected PR branch is attached to workspace file and tree reads', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ name: 'Vault', path: '', type: 'folder', children: [] }));
  };

  try {
    selectExistingContribution({
      branch: 'contrib/20260827-deadbeef',
      pullNumber: 7,
      pullUrl: 'https://github.com/upstream/repo/pull/7',
      title: 'Continue contribution',
      status: 'open',
      updatedAt: '2026-08-27T00:00:00Z',
    });
    await api.tree();
    await api.read('docs/Guide.md');

    assert.equal(urls[0], '/api/files/?branch=contrib%2F20260827-deadbeef');
    assert.equal(urls[1], '/api/files/content?path=docs%2FGuide.md&branch=contrib%2F20260827-deadbeef');
  } finally {
    clearContributionWorkspace();
    globalThis.fetch = originalFetch;
  }
});

test('a new contribution keeps reads on the staging branch', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ name: 'Vault', path: '', type: 'folder', children: [] }));
  };

  try {
    selectNewContribution();
    await api.tree();

    assert.equal(urls[0], '/api/files/');
  } finally {
    clearContributionWorkspace();
    globalThis.fetch = originalFetch;
  }
});
