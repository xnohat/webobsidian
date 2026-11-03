import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { settings } = vi.hoisted(() => ({ settings: { vault: { path: '', allowedRoots: [] as string[], trash: '.trash' } } }));
vi.mock('./settings.js', () => ({ getSettings: async () => settings }));
vi.mock('./git.js', () => ({ scheduleAutoCommitOnSave: () => {} }));
vi.mock('./search.js', () => ({ qmd: { upsert: async () => {}, remove: () => {}, allTags: () => [], search: async () => [] } }));
vi.mock('./links.js', () => ({ buildLinkGraph: async () => {}, backlinksFor: () => [] }));

beforeEach(async () => { settings.vault.path = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-agent-ops-')); });
afterEach(async () => { delete process.env.WEBOBSIDIAN_AGENT_REQUIRE_VERSION; await fs.rm(settings.vault.path, { recursive: true, force: true }); });

it('preserves versions, segmented reads, conflicts, atomic edits and parallel appends', async () => {
  const { agentOperations: api } = await import('./agentOperations.js');
  const note = 'Работа/ЭЦП % test.md';
  const created = await api.writeNote(note, 'one\ntwo\ntwo\n', '');
  expect(await api.readNote(note, { offset: 1, limit: 1 })).toMatchObject({ content: 'two', version: created.version, totalLines: 4, hasMore: true });
  await expect(api.writeNote(note, 'bad', '')).rejects.toMatchObject({ status: 409, body: { error: 'version_conflict', currentVersion: created.version } });
  await expect(api.editNote(note, 'two', 'x')).rejects.toMatchObject({ status: 409, body: { error: 'find_ambiguous', count: 2 } });
  await api.editNote(note, 'two', 'x', { replaceAll: true, baseVersion: created.version });
  await expect(api.writeNote(note, 'bad', created.version)).rejects.toMatchObject({ status: 409 });
  await Promise.all([' A', ' B'].map(text => api.appendNote(note, text)));
  const read = await api.readNote(note);
  expect(read.content).toContain(' A'); expect(read.content).toContain(' B'); expect(read.content).not.toContain('two');
  expect(await api.grepNote(note, 'x')).toMatchObject({ count: 2 });
  expect(await api.deleteNote(note)).toMatchObject({ ok: true });
  await expect(api.readNote(note)).rejects.toMatchObject({ status: 404 });
});

it('retains strict PUT versions without changing legacy edit and append behavior', async () => {
  const { agentOperations: api } = await import('./agentOperations.js');
  process.env.WEBOBSIDIAN_AGENT_REQUIRE_VERSION = '1';
  await expect(api.writeNote('strict.md', 'bad')).rejects.toMatchObject({ status: 400, body: { error: 'missing_base_version' } });
  await api.writeNote('strict.md', 'one', '');
  await api.editNote('strict.md', 'one', 'two');
  await api.appendNote('strict.md', 'three');
  expect((await api.readNote('strict.md')).content).toBe('two\nthree');
});

it('enforces every scope before a filesystem mutation', async () => {
  const { createScopedAgentApi } = await import('./mcpAgentApi.js');
  const reader = createScopedAgentApi(['read', 'search']);
  for (const operation of [() => reader.writeNote('denied.md', 'bad'), () => reader.appendNote('denied.md', 'bad'), () => reader.editNote('denied.md', 'a', 'b'), () => reader.deleteNote('denied.md')]) {
    await expect(operation()).rejects.toMatchObject({ status: 403 });
  }
  expect(await fs.readdir(settings.vault.path)).toEqual([]);
  await expect(createScopedAgentApi(['search']).readNote('anything.md')).rejects.toMatchObject({ status: 403 });
  await expect(createScopedAgentApi(['write']).readNote('anything.md')).rejects.toMatchObject({ status: 403 });
  await expect(createScopedAgentApi(['read']).search('query')).rejects.toMatchObject({ status: 403 });
  expect(await reader.tags()).toEqual({ tags: [] });
});

it('preserves path errors but hides unexpected exception details from remote clients', async () => {
  const { createScopedAgentApi } = await import('./mcpAgentApi.js');
  const { qmd } = await import('./search.js');
  vi.spyOn(qmd, 'search').mockRejectedValueOnce(new Error('secret at C:/private/token'));
  await expect(createScopedAgentApi(['search']).search('query')).rejects.toMatchObject({ status: 500, message: 'Internal server error' });
  await expect(createScopedAgentApi(['write']).writeNote('../escape.md', 'bad')).rejects.toMatchObject({ status: 400, message: 'Path escapes vault' });
});
