import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Vault writes are real fs; redirect the root at a throwaway temp dir per test.
const { settings } = vi.hoisted(() => ({
  settings: { vault: { path: '', trash: '.trash', allowedRoots: [] as string[] } },
}));
vi.mock('./settings.js', () => ({ getSettings: vi.fn(async () => settings) }));

const vault = await import('./vault.js');

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-vault-'));
  settings.vault.path = root;
  settings.vault.trash = '.trash';
  settings.vault.allowedRoots = [];
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

const abs = (rel: string) => path.join(root, rel);

it('bounded note reads preserve UTF-8 and reject a large file without reading its contents',async()=>{
 await fs.writeFile(abs('small.md'),'Привет');await fs.writeFile(abs('large.md'),'x'.repeat(1024));
 const opened=vi.spyOn(fs,'open');
 expect(await (vault as any).readFileTextBounded('small.md',12)).toBe('Привет');
 expect(await (vault as any).readFileTextBounded('small.md',11)).toBeNull();
 expect(await (vault as any).readFileTextBounded('large.md',12)).toBeNull();
 expect(opened.mock.calls.every(([,flags])=>flags==='r')).toBe(true);
});

describe('vault writes', () => {
  it('concurrent writes with a frozen clock use distinct exclusive temporary files', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42);
    const renamed = vi.spyOn(fs, 'rename');
    const opened = vi.spyOn(fs, 'open');
    await Promise.all([vault.writeFileText('note.md', 'first'), vault.writeFileText('note.md', 'second')]);
    const temps = renamed.mock.calls.map(([source]) => String(source));
    expect(new Set(temps).size).toBe(2);
    expect(opened.mock.calls.filter(([, flags]) => flags === 'wx')).toHaveLength(2);
    expect(['first', 'second']).toContain(await vault.readFileText('note.md'));
    expect(await fs.readdir(root)).toEqual(['note.md']);
  });

  it('cleans its temporary file and preserves the original after a rename failure', async () => {
    await vault.writeFileText('note.md', 'original');
    const failure = Object.assign(new Error('controlled rename failure'), { code: 'EIO' });
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(failure);
    await expect(vault.writeFileText('note.md', 'replacement')).rejects.toBe(failure);
    expect(await fs.readFile(abs('note.md'), 'utf8')).toBe('original');
    expect(await fs.readdir(root)).toEqual(['note.md']);
    await vault.writeFileText('after.md', 'queue still works');
  });

  it('serializes text transformations against the latest document', async () => {
    await vault.writeFileText('note.md', 'base');
    const results = await Promise.all([' A', ' B'].map((suffix) =>
      vault.mutateFileText('note.md', (current) => ({ content: current + suffix, result: suffix })),
    ));
    expect(['base A B', 'base B A']).toContain(await vault.readFileText('note.md'));
    expect(results.map((r) => r.result)).toEqual([' A', ' B']);
    expect(results[0].version).not.toBe(results[1].version);
  });

  it('does not write when a transformation rejects', async () => {
    await vault.writeFileText('note.md', 'original');
    await expect(vault.mutateFileText('note.md', () => { throw new Error('conflict'); })).rejects.toThrow('conflict');
    expect(await vault.readFileText('note.md')).toBe('original');
  });

  it('keeps the root and allowed roots captured before waiting for the queue', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-snapshot-other-'));
    const allowed = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-snapshot-allowed-'));
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let first: Promise<void> | undefined;
    let pending: Promise<void> | undefined;
    try {
      await fs.symlink(allowed, abs('linked'), process.platform === 'win32' ? 'junction' : 'dir');
      settings.vault.allowedRoots = [allowed];
      first = vault.withVaultMutation(async () => { entered(); await blocked; });
      await started;
      let captured!: () => void;
      const snapshotTaken = new Promise<void>((resolve) => { captured = resolve; });
      const realpath = fs.realpath.bind(fs);
      vi.spyOn(fs, 'realpath').mockImplementation(async (...args: Parameters<typeof fs.realpath>) => {
        if (String(args[0]) === root) captured();
        return realpath(...args);
      });
      pending = vault.writeFileText('linked/queued.md', 'captured');
      await snapshotTaken;
      settings.vault.path = other;
      settings.vault.allowedRoots = [];
      release();
      await Promise.all([first, pending]);
      expect(await fs.readFile(path.join(allowed, 'queued.md'), 'utf8')).toBe('captured');
      expect(await fs.readdir(other)).toEqual([]);
    } finally {
      release();
      await Promise.allSettled([first, pending]);
      await fs.rm(other, { recursive: true, force: true });
      await fs.rm(allowed, { recursive: true, force: true });
    }
  });

  it('serializes canonical file aliases and preserves their link target', async () => {
    await vault.writeFileText('real/note.md', 'base');
    await fs.symlink(abs('real'), abs('alias'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await Promise.all(['real/note.md', 'alias/note.md'].map((rel) => vault.mutateFileText(rel, (current) => {
      if (current !== 'base') throw Object.assign(new Error('conflict'), { status: 409 });
      return { content: 'winner', result: true };
    }).then(() => 200, (error: { status: number }) => error.status)));
    expect(result.sort()).toEqual([200, 409]);
    expect(await vault.readFileText('real/note.md')).toBe('winner');
  });
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

describe('rename destination safety', () => {
  it.each(['file', 'directory'] as const)('does not replace an existing %s', async (kind) => {
    await vault.writeFileText('source.md', 'source');
    if (kind === 'file') await vault.writeFileText('destination', 'destination');
    else await vault.writeFileText('destination/child.md', 'destination');
    await expect(vault.rename('source.md', 'destination')).rejects.toMatchObject({ status: 409, message: 'destination_exists' });
    expect(await vault.readFileText('source.md')).toBe('source');
    expect(await vault.readFileText(kind === 'file' ? 'destination' : 'destination/child.md')).toBe('destination');
  });

  it('does not replace an existing directory with another directory', async () => {
    await vault.createFolder('source');
    await vault.createFolder('destination');
    await expect(vault.rename('source', 'destination')).rejects.toMatchObject({ status: 409 });
    expect(await vault.exists('source')).toBe(true);
  });

  it('lets only one of two sources claim a new destination', async () => {
    await vault.writeFileText('a.md', 'a');
    await vault.writeFileText('b.md', 'b');
    const results = await Promise.allSettled([vault.rename('a.md', 'target.md'), vault.rename('b.md', 'target.md')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const winner = results[0].status === 'fulfilled' ? 'a' : 'b';
    const loser = winner === 'a' ? 'b' : 'a';
    expect(await vault.readFileText('target.md')).toBe(winner);
    expect(await vault.readFileText(`${loser}.md`)).toBe(loser);
  });

  it('supports no-op and case-only rename', async () => {
    await vault.writeFileText('note.md', 'original');
    await vault.rename('note.md', 'note.md');
    await vault.rename('note.md', 'NOTE.md');
    expect(await fs.readdir(root)).toEqual(['NOTE.md']);
    expect(await vault.readFileText('NOTE.md')).toBe('original');
  });

  it.skipIf(process.platform === 'win32')('does not confuse different entries that differ only in case', async () => {
    await vault.writeFileText('note.md', 'lower');
    await vault.writeFileText('NOTE.md', 'upper');
    await expect(vault.rename('note.md', 'NOTE.md')).rejects.toMatchObject({ status: 409 });
    expect(await vault.readFileText('note.md')).toBe('lower');
    expect(await vault.readFileText('NOTE.md')).toBe('upper');
  });
});

describe('copy preflight and publication', () => {
  let outside: string;
  const linkDir = (target: string, link: string) => fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  beforeEach(async () => { outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-copy-external-')); });
  afterEach(async () => { await fs.rm(outside, { recursive: true, force: true }); });

  it('rejects deeply nested outside links before creating any destination', async () => {
    await vault.writeFileText('source/deep/local.md', 'local');
    await fs.writeFile(path.join(outside, 'secret.md'), 'secret');
    await linkDir(outside, abs('source/deep/link'));
    await expect(vault.readFileText('source/deep/link/secret.md')).rejects.toMatchObject({ status: 400 });
    await expect(vault.copy('source', 'destination')).rejects.toMatchObject({ status: 400 });
    expect(await fs.readdir(root)).toEqual(['source']);
  });

  it('materializes allowed external and repeated internal directory links', async () => {
    settings.vault.allowedRoots = [outside];
    await fs.writeFile(path.join(outside, 'shared.md'), 'shared');
    await vault.writeFileText('source/real/note.md', 'inside');
    await linkDir(outside, abs('source/external'));
    await linkDir(abs('source/real'), abs('source/again'));
    expect((await vault.copy('source', 'destination')).sort()).toEqual(['destination/again/note.md', 'destination/external/shared.md', 'destination/real/note.md']);
    expect((await fs.lstat(abs('destination/external'))).isSymbolicLink()).toBe(false);
    expect(await vault.readFileText('destination/external/shared.md')).toBe('shared');
  });

  it('rejects cyclic and broken directory links without publishing partial data', async () => {
    await vault.writeFileText('source/note.md', 'source');
    await linkDir(abs('source'), abs('source/cycle'));
    await expect(vault.copy('source', 'destination')).rejects.toMatchObject({ status: 400 });
    await fs.unlink(abs('source/cycle'));
    await linkDir(abs('missing'), abs('source/broken'));
    await expect(vault.copy('source', 'destination')).rejects.toMatchObject({ status: 400 });
    expect(await fs.readdir(root)).toEqual(['source']);
  });

  it('rejects copying into the source subtree', async () => {
    await vault.writeFileText('source/note.md', 'source');
    await expect(vault.copy('source', 'source/child')).rejects.toMatchObject({ status: 400 });
    expect(await fs.readdir(abs('source'))).toEqual(['note.md']);
  });

  it('rejects a permitted link into Git metadata before publication', async () => {
    await fs.mkdir(abs('.git'));
    await fs.writeFile(abs('.git/config'), 'metadata');
    await vault.createFolder('source');
    await linkDir(abs('.git'), abs('source/metadata'));
    await expect(vault.copy('source', 'destination')).rejects.toMatchObject({ status: 400 });
    expect(await vault.exists('destination')).toBe(false);
  });

  it('treats a dangling destination link as occupied for rename and copy', async () => {
    await vault.writeFileText('source.md', 'source');
    await linkDir(abs('missing'), abs('destination'));
    await expect(vault.rename('source.md', 'destination')).rejects.toMatchObject({ status: 409 });
    await expect(vault.copy('source.md', 'destination')).rejects.toMatchObject({ status: 409 });
    expect((await fs.lstat(abs('destination'))).isSymbolicLink()).toBe(true);
    expect(await vault.readFileText('source.md')).toBe('source');
  });

  it('removes only the operation staging directory after an I/O failure', async () => {
    await vault.writeFileText('source/note.md', 'source');
    const failure = Object.assign(new Error('controlled copy failure'), { code: 'EIO' });
    vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(failure);
    await expect(vault.copy('source', 'destination')).rejects.toBe(failure);
    expect(await fs.readdir(root)).toEqual(['source']);
    expect(await vault.readFileText('source/note.md')).toBe('source');
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

  it('rejects writing through a directory alias to Git metadata', async () => {
    await fs.mkdir(abs('.git/hooks'), { recursive: true });
    await fs.writeFile(abs('.git/hooks/post-merge'), 'original hook');
    await fs.symlink(abs('.git/hooks'), abs('public'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(vault.writeFileText('public/post-merge', 'replacement')).rejects.toMatchObject({ status: 400 });
    await expect(vault.writeFileBuffer('public/post-merge', Buffer.from('replacement'))).rejects.toMatchObject({ status: 400 });
    expect(await fs.readFile(abs('.git/hooks/post-merge'), 'utf8')).toBe('original hook');
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

describe('symlinked vault contents (#23 — follow symlinks within allowedRoots)', () => {
  let outside: string;
  let canSymlink = true;
  beforeAll(async () => {
    // Windows requires Developer Mode or an elevated token for file symlinks.
    // Probe the capability instead of failing before reaching the assertions.
    const probe = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-symlink-probe-'));
    try {
      await fs.writeFile(path.join(probe, 'target'), 'probe');
      await fs.symlink(path.join(probe, 'target'), path.join(probe, 'link'), 'file');
    } catch (err) {
      if (process.platform === 'win32' && (err as NodeJS.ErrnoException).code === 'EPERM') {
        canSymlink = false;
      } else {
        throw err;
      }
    } finally {
      await fs.rm(probe, { recursive: true, force: true });
    }
  });
  beforeEach(async (context) => {
    if (!canSymlink) context.skip();
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-outside-'));
    settings.vault.allowedRoots = [outside];
  });
  afterEach(async () => {
    settings.vault.allowedRoots = [];
    if (outside) await fs.rm(outside, { recursive: true, force: true });
  });

  it('lists a symlinked folder whose target is an allowed root', async () => {
    await fs.mkdir(path.join(outside, 'shared'));
    await fs.writeFile(path.join(outside, 'shared', 'note.md'), '# shared');
    await fs.symlink(path.join(outside, 'shared'), abs('linked'), 'dir');

    const tree = await vault.listTree();
    const linked = tree.children?.find((c) => c.name === 'linked');
    expect(linked?.type).toBe('folder');
    expect(linked?.children?.map((c) => c.name)).toEqual(['note.md']);
  });

  it('reads a file reached through a symlink', async () => {
    await fs.writeFile(path.join(outside, 'note.md'), 'hello');
    await fs.symlink(path.join(outside, 'note.md'), abs('link.md'), 'file');
    expect(await vault.readFileText('link.md')).toBe('hello');
  });

  it('rejects a file alias into Git metadata for text and binary writes', async () => {
    await fs.mkdir(abs('.git/hooks'), { recursive: true });
    await fs.writeFile(abs('.git/hooks/post-merge'), 'original hook');
    await fs.symlink(abs('.git/hooks/post-merge'), abs('safe.md'), 'file');
    await expect(vault.writeFileText('safe.md', 'replacement')).rejects.toMatchObject({ status: 400 });
    await expect(vault.writeFileBuffer('safe.md', Buffer.from('replacement'))).rejects.toMatchObject({ status: 400 });
    expect(await fs.readFile(abs('.git/hooks/post-merge'), 'utf8')).toBe('original hook');
  });

  it('writes a file inside a symlinked folder (the write lands in the target)', async () => {
    await fs.mkdir(path.join(outside, 'shared'));
    await fs.symlink(path.join(outside, 'shared'), abs('linked'), 'dir');
    await vault.writeFileText('linked/new.md', 'written through the link');
    expect(await fs.readFile(path.join(outside, 'shared', 'new.md'), 'utf8')).toBe(
      'written through the link',
    );
    expect(await vault.readFileText('linked/new.md')).toBe('written through the link');
  });

  it('still refuses a symlink whose target is outside every allowed root', async () => {
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-other-'));
    try {
      await fs.writeFile(path.join(other, 'secret.md'), 'nope');
      await fs.symlink(path.join(other, 'secret.md'), abs('bad.md'), 'file');
      await expect(vault.readFileText('bad.md')).rejects.toMatchObject({ status: 400 });
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  it('does not recurse forever when a symlink points back at the vault root', async () => {
    await vault.writeFileText('real.md', 'x');
    await fs.symlink(root, abs('loop'), 'dir');
    const tree = await vault.listTree();
    const loop = tree.children?.find((c) => c.name === 'loop');
    expect(loop?.type).toBe('folder');
    expect(loop?.children).toEqual([]); // cycle guard: realpath already visited
  });

  it('skips a broken symlink instead of failing the whole listing', async () => {
    await fs.symlink(abs('nope-not-here.md'), abs('broken.md'), 'file');
    const tree = await vault.listTree();
    expect(tree.children?.find((c) => c.name === 'broken.md')).toBeUndefined();
  });
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
