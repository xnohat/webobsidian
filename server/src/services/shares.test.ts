import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const { config } = vi.hoisted(() => ({ config: { dataDir: '' } }));
vi.mock('../config.js', () => ({ config }));
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-shares-'));
  config.dataDir = root;
  vi.resetModules();
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

it('remaps every shared descendant on folder rename, preserving tokens and adjacent prefixes', async () => {
  const shares = await import('./shares.js');
  const one = await shares.createShare('folder/one.md');
  const two = await shares.createShare('folder/deep/two.md');
  const neighbour = await shares.createShare('folder-extra/three.md');
  await shares.onFileRenamed('folder', 'moved');
  expect((await shares.getActiveShare(one.id))?.path).toBe('moved/one.md');
  expect((await shares.getActiveShare(two.id))?.path).toBe('moved/deep/two.md');
  expect((await shares.getActiveShare(neighbour.id))?.path).toBe('folder-extra/three.md');
  const persisted = JSON.parse(await fs.readFile(path.join(root, 'shares.json'), 'utf8'));
  expect(persisted.map((s: { path: string }) => s.path)).toEqual(['moved/one.md', 'moved/deep/two.md', 'folder-extra/three.md']);
});
