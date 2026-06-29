import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Vault writes are real fs; redirect the root at a throwaway temp dir per test.
const { settings } = vi.hoisted(() => ({
  settings: { vault: { path: '', trash: '.trash' } },
}));
vi.mock('./settings.js', () => ({ getSettings: vi.fn(async () => settings) }));

const vault = await import('./vault.js');

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-vault-'));
  settings.vault.path = root;
  settings.vault.trash = '.trash';
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const abs = (rel: string) => path.join(root, rel);

describe('vault writes', () => {
  it('writeFileText round-trips content and creates nested parent dirs', async () => {
    await vault.writeFileText('a/b/c.md', '# Hello');
    expect(await vault.readFileText('a/b/c.md')).toBe('# Hello');
    expect(await fs.readFile(abs('a/b/c.md'), 'utf8')).toBe('# Hello');
  });

  it('writeFileText overwrites and leaves no stray tmp file', async () => {
    await vault.writeFileText('note.md', 'first');
    await vault.writeFileText('note.md', 'second');
    expect(await vault.readFileText('note.md')).toBe('second');
    const entries = await fs.readdir(root);
    expect(entries.filter((e) => e.includes('tmp'))).toHaveLength(0);
  });

  it('writeFileBuffer writes byte-equal binary', async () => {
    const buf = Buffer.from([0, 1, 2, 254, 255]);
    await vault.writeFileBuffer('img/x.bin', buf);
    expect(await fs.readFile(abs('img/x.bin'))).toEqual(buf);
  });

  it('createFolder makes a directory', async () => {
    await vault.createFolder('sub/dir');
    expect((await fs.stat(abs('sub/dir'))).isDirectory()).toBe(true);
  });

  it('rename moves a file and creates the destination parent', async () => {
    await vault.writeFileText('old.md', 'x');
    await vault.rename('old.md', 'moved/new.md');
    expect(await vault.exists('old.md')).toBe(false);
    expect(await vault.readFileText('moved/new.md')).toBe('x');
  });

  it('remove permanently deletes a file and a folder recursively', async () => {
    await vault.writeFileText('f.md', 'x');
    await vault.remove('f.md');
    expect(await vault.exists('f.md')).toBe(false);

    await vault.writeFileText('d/one.md', '1');
    await vault.writeFileText('d/two.md', '2');
    await vault.remove('d');
    expect(await vault.exists('d')).toBe(false);
  });
});

describe('vault copy', () => {
  it('returns the vault-relative posix paths of every file created', async () => {
    await vault.writeFileText('src/a.md', 'a');
    await vault.writeFileText('src/sub/b.md', 'b');
    const created = await vault.copy('src', 'dst');
    expect([...created].sort()).toEqual(['dst/a.md', 'dst/sub/b.md']);
    expect(await vault.readFileText('dst/sub/b.md')).toBe('b');
  });

  it('returns a single path for a file copy', async () => {
    await vault.writeFileText('one.md', '1');
    expect(await vault.copy('one.md', 'two.md')).toEqual(['two.md']);
  });

  it('rejects when the destination already exists', async () => {
    await vault.writeFileText('a.md', 'a');
    await vault.writeFileText('b.md', 'b');
    await expect(vault.copy('a.md', 'b.md')).rejects.toBeTruthy();
  });
});

describe('resolveDirCaseInsensitive', () => {
  it('matches an existing folder case-insensitively', async () => {
    await vault.createFolder('Attachments');
    expect(await vault.resolveDirCaseInsensitive('attachments')).toBe('Attachments');
  });

  it('matches existing segments and keeps new ones verbatim', async () => {
    await vault.createFolder('Attachments');
    expect(await vault.resolveDirCaseInsensitive('attachments/New')).toBe('Attachments/New');
  });

  it('returns a fully-new path unchanged', async () => {
    expect(await vault.resolveDirCaseInsensitive('Brand/New')).toBe('Brand/New');
  });
});

describe('path safety (resolveInVault)', () => {
  it('rejects ../ traversal', async () => {
    await expect(vault.resolveInVault('../escape.md')).rejects.toMatchObject({ status: 400 });
  });

  it('clamps an absolute path under the vault root (leading slash stripped, not honored)', async () => {
    const resolved = await vault.resolveInVault('/etc/passwd');
    expect(resolved.startsWith(root + path.sep)).toBe(true);
    expect(resolved).toContain(`etc${path.sep}passwd`);
  });

  it('blocks the .git segment', async () => {
    await expect(vault.resolveInVault('.git/config')).rejects.toMatchObject({ status: 400 });
    await expect(vault.resolveInVault('sub/.git/hooks/post-merge')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('allows .gitignore / .gitattributes (only the exact .git segment is blocked)', async () => {
    await expect(vault.resolveInVault('.gitignore')).resolves.toContain('.gitignore');
    await expect(vault.resolveInVault('.gitattributes')).resolves.toContain('.gitattributes');
  });

  it('guards the mutation path too (writeFileText cannot escape)', async () => {
    await expect(vault.writeFileText('../evil.md', 'x')).rejects.toMatchObject({ status: 400 });
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a symlink that escapes the vault',
    async () => {
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-outside-'));
      try {
        await fs.writeFile(path.join(outside, 'secret.md'), 'top secret');
        await fs.symlink(outside, abs('link'), 'dir');
        await expect(vault.resolveInVault('link/secret.md')).rejects.toMatchObject({ status: 400 });
        await expect(vault.writeFileText('link/secret.md', 'x')).rejects.toMatchObject({
          status: 400,
        });
      } finally {
        await fs.rm(outside, { recursive: true, force: true });
      }
    },
  );
});

describe('trash round-trip', () => {
  it('moves a file to trash and restores it, pruning empty dirs', async () => {
    await vault.writeFileText('notes/a.md', 'hello');
    const trashed = await vault.trash('notes/a.md');
    expect(trashed).toBe('.trash/notes/a.md');
    expect(await vault.exists('notes/a.md')).toBe(false);

    const items = await vault.listTrash();
    expect(items).toHaveLength(1);
    expect(items[0].original).toBe('notes/a.md');

    const restored = await vault.restoreFromTrash(trashed);
    expect(restored).toBe('notes/a.md');
    expect(await vault.readFileText('notes/a.md')).toBe('hello');
    expect(await vault.listTrash()).toHaveLength(0);
    // the now-empty .trash/notes dir was pruned
    expect(await vault.exists('.trash/notes')).toBe(false);
  });

  it('adds a timestamp suffix when a file is trashed twice', async () => {
    await vault.writeFileText('a.md', '1');
    await vault.trash('a.md');
    await vault.writeFileText('a.md', '2');
    const second = await vault.trash('a.md');
    expect(second).toMatch(/^\.trash\/a\.\d+\.md$/);
    expect(await vault.listTrash()).toHaveLength(2);
  });

  it('adds a .restored- suffix when the original path was recreated', async () => {
    await vault.writeFileText('a.md', 'orig');
    const trashed = await vault.trash('a.md');
    await vault.writeFileText('a.md', 'recreated');
    const restored = await vault.restoreFromTrash(trashed);
    expect(restored).toMatch(/^a\.restored-\d+\.md$/);
    expect(await vault.exists('a.md')).toBe(true);
    expect(await vault.exists(restored)).toBe(true);
  });

  it('deleteFromTrash removes one item and rejects a non-trash path', async () => {
    await vault.writeFileText('a.md', 'x');
    const trashed = await vault.trash('a.md');
    await vault.deleteFromTrash(trashed);
    expect(await vault.listTrash()).toHaveLength(0);

    await vault.writeFileText('real.md', 'x');
    await expect(vault.deleteFromTrash('real.md')).rejects.toMatchObject({ status: 400 });
  });

  it('emptyTrash clears everything', async () => {
    await vault.writeFileText('a.md', 'a');
    await vault.writeFileText('b.md', 'b');
    await vault.trash('a.md');
    await vault.trash('b.md');
    expect(await vault.listTrash()).toHaveLength(2);
    await vault.emptyTrash();
    expect(await vault.listTrash()).toHaveLength(0);
  });
});
