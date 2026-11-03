import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { settings } = vi.hoisted(() => ({ settings: { vault: { path: '', trash: '.trash', allowedRoots: [] as string[] } } }));
vi.mock('./settings.js', () => ({ getSettings: async () => settings }));
const vault = await import('./vault.js');
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-rename-'));
  settings.vault.path = root;
  await vault.writeFileText('.obsidian/app.json', JSON.stringify({ alwaysUpdateLinks: true }));
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

it('updates resolved wiki and Markdown references when renaming a note', async () => {
  await vault.writeFileText('audit/target.md', 'target');
  await vault.writeFileText('audit/source.md', '[[target#Heading|alias]] [Target](target.md#Heading)');
  await vault.rename('audit/target.md', 'audit/renamed.md');
  expect(await vault.readFileText('audit/source.md')).toBe('[[renamed#Heading|alias]] [Target](renamed.md#Heading)');
});

it('updates folder links, moved outgoing links and canvas while preserving code and ambiguous neighbours', async () => {
  await vault.writeFileText('a/target.md', 'a');
  await vault.writeFileText('b/target.md', 'b');
  await vault.writeFileText('a/source.md', '[[target]] ![img](../shot%20%231%20%28a%29.png) `[[target]]`\n```md\n[[target]]\n```');
  await vault.writeFileText('b/source.md', '[[target]] [external](https://example.test/target.md)');
  await vault.writeFileText('shot #1 (a).png', 'image');
  await vault.writeFileText('board.canvas', JSON.stringify({ nodes: [{ type: 'file', file: 'a/target.md' }, { type: 'text', text: '[[a/target]]' }] }));
  await vault.rename('a', 'nested/renamed');
  expect(await vault.readFileText('nested/renamed/source.md')).toBe('[[target]] ![img](../../shot%20%231%20%28a%29.png) `[[target]]`\n```md\n[[target]]\n```');
  expect(await vault.readFileText('b/source.md')).toBe('[[target]] [external](https://example.test/target.md)');
  const board = JSON.parse(await vault.readFileText('board.canvas'));
  expect(board.nodes[0].file).toBe('nested/renamed/target.md');
  expect(board.nodes[1].text).toBe('[[nested/renamed/target]]');
});

it('requires an explicit choice only when disabled auto-update would affect references', async () => {
  await vault.writeFileText('.obsidian/app.json', JSON.stringify({ alwaysUpdateLinks: false }));
  await vault.writeFileText('target.md', 'target');
  await vault.writeFileText('source.md', '[[target]]');
  await expect(vault.rename('target.md', 'renamed.md')).rejects.toMatchObject({ status: 409, code: 'rename_confirmation_required', affectedCount: 1 });
  expect(await vault.readFileText('target.md')).toBe('target');
  const { renameWithLinks } = await import('./renameLinks.js');
  await renameWithLinks({ from: 'target.md', to: 'renamed.md', updateLinks: false });
  expect(await vault.readFileText('source.md')).toBe('[[target]]');
});

it('rejects stale plans and locked references before changing any path', async () => {
  await vault.writeFileText('target.md', 'target');
  await vault.writeFileText('source.md', '[[target]]');
  const { planRename, applyRename } = await import('./renameLinks.js');
  const plan = await planRename({ from: 'target.md', to: 'renamed.md' });
  await vault.writeFileText('source.md', 'external edit');
  await expect(applyRename(plan)).rejects.toMatchObject({ status: 409, code: 'rename_conflict' });
  const next = await planRename({ from: 'target.md', to: 'renamed.md' });
  await expect(applyRename(next, { mayWrite: () => false })).rejects.toMatchObject({ status: 423 });
  expect(await vault.readFileText('target.md')).toBe('target');
});

it('rolls back the rename and previously written links when a later write fails', async () => {
  await vault.writeFileText('target.md', 'target');
  await vault.writeFileText('a.md', '[[target]]');
  await vault.writeFileText('b.md', '[[target]]');
  const realRename = fs.rename.bind(fs);
  let failed = false;
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === path.join(root, 'b.md') && !failed) { failed = true; throw new Error('controlled write failure'); }
    return realRename(from, to);
  });
  await expect(vault.rename('target.md', 'renamed.md')).rejects.toThrow('controlled write failure');
  expect(await vault.readFileText('target.md')).toBe('target');
  expect(await vault.readFileText('a.md')).toBe('[[target]]');
  expect(await vault.readFileText('b.md')).toBe('[[target]]');
  expect(await vault.exists('renamed.md')).toBe(false);
});

it('retains recovery data and preserves external edits through a restart conflict', async () => {
  await vault.writeFileText('target.md', 'target');
  await vault.writeFileText('source.md', '[[target]]');
  const realRename = fs.rename.bind(fs);
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === path.join(root, 'source.md')) {
      await fs.writeFile(path.join(root, 'renamed.md'), 'external text');
      throw new Error('controlled write failure');
    }
    return realRename(from, to);
  });
  await expect(vault.rename('target.md', 'renamed.md')).rejects.toMatchObject({ code: 'rename_conflict', journalPath: expect.any(String) });
  expect(await vault.readFileText('renamed.md')).toBe('external text');
  vi.restoreAllMocks();
  await expect(vault.ensureVault()).rejects.toMatchObject({ code: 'rename_conflict' });
  expect(await vault.readFileText('renamed.md')).toBe('external text');
  // An operator can restore the expected content, after which startup recovery completes.
  await fs.writeFile(path.join(root, 'renamed.md'), 'target');
  await vault.ensureVault();
  expect(await vault.readFileText('target.md')).toBe('target');
  expect(await vault.exists('renamed.md')).toBe(false);
});

it('updates encoded images and case-only links with fragments intact', async () => {
  await vault.writeFileText('shot #1 (a).png', 'image');
  await vault.writeFileText('source.md', '![[shot%20%231%20%28a%29.png|100]] ![shot](shot%20%231%20%28a%29.png)');
  await vault.rename('shot #1 (a).png', 'фото 100%.png');
  expect(await vault.readFileText('source.md')).toBe('![[%D1%84%D0%BE%D1%82%D0%BE%20100%25.png|100]] ![shot](%D1%84%D0%BE%D1%82%D0%BE%20100%25.png)');
  await vault.writeFileText('note.md', 'text');
  await vault.writeFileText('case.md', '[[note#^block|alias]]');
  await vault.rename('note.md', 'NOTE.md');
  expect(await vault.readFileText('case.md')).toBe('[[NOTE#^block|alias]]');
});

it('does not generate a root-style wiki link that resolves to a shadowing relative path', async () => {
  await vault.writeFileText('old/target.md', 'target');
  await vault.writeFileText('x/x/new.md', 'shadow');
  await vault.writeFileText('x/source.md', '[[old/target]]');
  await vault.rename('old/target.md', 'x/new.md');
  const { parseFileReferences, resolveReference } = await import('./fileReferences.js');
  const content = await vault.readFileText('x/source.md');
  expect(resolveReference(parseFileReferences(content)[0].target, 'x/source.md', ['x/new.md', 'x/x/new.md', 'x/source.md'])).toBe('x/new.md');
});

it('rechecks external edits made while permission checks are in progress', async () => {
  await vault.writeFileText('target.md', 'target');
  await vault.writeFileText('source.md', '[[target]]');
  const { renameWithLinks } = await import('./renameLinks.js');
  let touched = false;
  await expect(renameWithLinks({ from: 'target.md', to: 'renamed.md', mayWrite: async () => {
    if (!touched) { touched = true; await fs.writeFile(path.join(root, 'new.md'), '[[target]]'); }
    return true;
  } })).rejects.toMatchObject({ code: 'rename_conflict' });
  expect(await vault.readFileText('target.md')).toBe('target');
});

it('updates references in hidden notes inside a renamed folder', async () => {
  await vault.writeFileText('folder/target.md', 'target');
  await vault.writeFileText('folder/.private.md', '[[target]]');
  await vault.rename('folder/target.md', 'folder/new.md');
  expect(await vault.readFileText('folder/.private.md')).toBe('[[new]]');
});

it('preserves new empty directories during interrupted folder recovery', async () => {
  await vault.writeFileText('folder/target.md', 'target');
  await vault.writeFileText('source.md', '[[folder/target]]');
  const realRename = fs.rename.bind(fs);
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === path.join(root, 'source.md')) {
      await fs.mkdir(path.join(root, 'moved', 'external-folder'));
      throw new Error('controlled failure');
    }
    return realRename(from, to);
  });
  await expect(vault.rename('folder', 'moved')).rejects.toMatchObject({ code: 'rename_conflict' });
  expect((await fs.stat(path.join(root, 'moved', 'external-folder'))).isDirectory()).toBe(true);
});

it('recovers an interrupted rollback on startup without duplicating files', async () => {
  await vault.writeFileText('target.md', 'target');
  await vault.writeFileText('a.md', '[[target]]');
  await vault.writeFileText('b.md', '[[target]]');
  const realRename = fs.rename.bind(fs);
  let failing = false;
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    if (String(to) === path.join(root, 'b.md')) failing = true;
    if (failing && [path.join(root, 'a.md'), path.join(root, 'b.md')].includes(String(to))) throw new Error('disk unavailable');
    return realRename(from, to);
  });
  await expect(vault.rename('target.md', 'renamed.md')).rejects.toMatchObject({ code: 'rename_conflict' });
  expect(await vault.readFileText('a.md')).toBe('[[renamed]]');
  vi.restoreAllMocks();
  await vault.ensureVault();
  expect(await vault.readFileText('a.md')).toBe('[[target]]');
  expect(await vault.readFileText('b.md')).toBe('[[target]]');
  expect(await vault.readFileText('target.md')).toBe('target');
  expect(await vault.exists('renamed.md')).toBe(false);
  await vault.ensureVault();
});

it('rejects new references created during writes and rolls the rename back', async () => {
  await vault.writeFileText('target.md', 'target');
  await vault.writeFileText('source.md', '[[target]]');
  const realRename = fs.rename.bind(fs);
  vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
    const result = await realRename(from, to);
    if (String(to) === path.join(root, 'source.md')) await fs.writeFile(path.join(root, 'new.md'), 'external [[target]]');
    return result;
  });
  await expect(vault.rename('target.md', 'renamed.md')).rejects.toMatchObject({ code: 'rename_conflict' });
  expect(await vault.readFileText('new.md')).toBe('external [[target]]');
  expect(await vault.readFileText('target.md')).toBe('target');
});

it('escapes renamed HTML attribute URLs, including unquoted and single-quoted attributes', async () => {
  await vault.writeFileText('target.png', 'image');
  await vault.writeFileText('source.md', "<img src='target.png'> <img src=target.png>");
  await vault.rename('target.png', "a b's.png");
  expect(await vault.readFileText('source.md')).toBe("<img src='a%20b%27s.png'> <img src=a%20b%27s.png>");
});

it('renames literal native percent wikilinks without rewriting their decoded neighbours', async () => {
  await vault.writeFileText('image%1actual.png', 'image');
  await vault.writeFileText('image%.png', 'image');
  await vault.writeFileText('image%20.png', 'literal');
  await vault.writeFileText('image .png', 'space');
  await vault.writeFileText('renamed .png', 'space neighbour');
  await vault.writeFileText('source.md', '![[image%1actual.png]] ![[image%.png]] ![[image%20.png]] ![](image%20.png)');
  await vault.rename('image%1actual.png', 'renamed%1actual.png');
  await vault.rename('image%.png', 'renamed%.png');
  await vault.rename('image%20.png', 'renamed%20.png');
  expect(await vault.readFileText('source.md')).toBe('![[renamed%1actual.png]] ![[renamed%.png]] ![[renamed%20.png]] ![](image%20.png)');
});
