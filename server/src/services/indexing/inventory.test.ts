import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect } from 'vitest';
import { scanInventory, readStableNote, readFileStamp } from './inventory.js';

describe('inventory', () => {
  it('ignores metadata, reads Cyrillic percent paths and skips parsing identical hashes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-inventory-'));
    try {
      await fs.mkdir(path.join(root, '.obsidian'));
      await fs.writeFile(path.join(root, '.obsidian', 'hidden.md'), 'hidden');
      await fs.writeFile(path.join(root, 'ЕЦП%.markdown'), '# current');
      const scan = await scanInventory(root);
      expect(scan.complete).toBe(true); expect([...scan.files.keys()]).toEqual(['ЕЦП%.markdown']);
      expect((await readFileStamp(root, 'ЕЦП%.markdown')).kind).toBe('ok');
      expect((await readFileStamp(root, 'absent.md')).kind).toBe('missing');
      expect((await readFileStamp(root, '../outside.md')).kind).toBe('retry');
      const first = await readStableNote(root, 'ЕЦП%.markdown');
      expect(first.kind).toBe('ok');
      if (first.kind !== 'ok') throw new Error('unreadable');
      expect(first.parsed?.title).toBe('ЕЦП%');
      const again = await readStableNote(root, 'ЕЦП%.markdown', first.sha256);
      expect(again.kind === 'ok' && again.parsed).toBeUndefined();
      expect((await readStableNote(root, '../outside.md')).kind).toBe('retry');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
  it('reports an unreadable/missing root as incomplete rather than empty success', async () => {
    expect((await scanInventory(path.join(os.tmpdir(), 'wo-missing-' + Date.now()))).complete).toBe(false);
  });
  it('checks symlink targets against allowed roots and terminates directory cycles', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-inventory-links-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-inventory-target-'));
    try {
      await fs.writeFile(path.join(outside, 'Allowed.md'), '# permitted');
      await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
      await fs.symlink(root, path.join(root, 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');
      const denied = await scanInventory(root);
      expect(denied.complete).toBe(true);
      expect([...denied.files]).toEqual([]);
      expect((await readStableNote(root, 'linked/Allowed.md')).kind).toBe('retry');
      const allowed = await scanInventory(root, [outside]);
      expect(allowed.complete).toBe(true);
      expect([...allowed.files.keys()]).toEqual(['linked/Allowed.md']);
      expect((await readStableNote(root, 'linked/Allowed.md', undefined, [outside])).kind).toBe('ok');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
