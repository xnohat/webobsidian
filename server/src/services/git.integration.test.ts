import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { simpleGit } from 'simple-git';
import { mutateFileText, withVaultMutation } from './vault.js';
import { checkVersion, contentVersion } from './noteversion.js';

const exec = promisify(execFile);
const T = 20_000; // generous per-test timeout — these shell out to real git

// Full git settings; vault.path is set per test to a fresh temp repo.
const { settings } = vi.hoisted(() => ({
  settings: {
    vault: { path: '', trash: '.trash', allowedRoots: [] as string[] },
    git: {
      enabled: true,
      autoSync: false,
      autoCommitOnSave: false,
      remote: '',
      token: '',
      branch: 'main',
      authorName: 'Tester',
      authorEmail: 'tester@example.com',
      lfsPatterns: [] as string[],
      intervalSec: 60,
    },
  },
}));
vi.mock('./settings.js', () => ({ getSettings: vi.fn(async () => settings) }));

const git = await import('./git.js');

const gitOnPath = await exec('git', ['--version']).then(() => true).catch(() => false);

// simple-git 4 removes ambient GIT_* variables. Isolate HOME/XDG as well as the
// direct Git CLI's config path so neither can read the developer's global config.
let cfgHome: string;
let prevGlobal: string | undefined;
let prevHome: string | undefined;
let prevXdg: string | undefined;
beforeAll(async () => {
  cfgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitcfg-'));
  const cfg = path.join(cfgHome, '.gitconfig');
  await fs.writeFile(
    cfg,
    '[init]\n  defaultBranch = main\n[user]\n  name = CI\n  email = ci@example.com\n[core]\n  editor = false\n',
  );
  prevGlobal = process.env.GIT_CONFIG_GLOBAL;
  prevHome = process.env.HOME;
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.GIT_CONFIG_GLOBAL = cfg;
  process.env.HOME = cfgHome;
  process.env.XDG_CONFIG_HOME = path.join(cfgHome, 'xdg');
});
afterAll(async () => {
  if (prevGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = prevGlobal;
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  await fs.rm(cfgHome, { recursive: true, force: true });
});

let work: string;
let bare: string;
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitwork-'));
  bare = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitbare-'));
  await exec('git', ['init', '--bare', '-b', 'main', bare]);
  settings.vault.path = work;
  Object.assign(settings.git, {
    enabled: true,
    remote: bare,
    token: '',
    branch: 'main',
    authorName: 'Tester',
    authorEmail: 'tester@example.com',
    lfsPatterns: [],
  });
});
afterEach(async () => {
  await fs.rm(work, { recursive: true, force: true });
  await fs.rm(bare, { recursive: true, force: true });
});

describe.skipIf(!gitOnPath)('git integration (real repo)', () => {
  it('a queued push keeps its vault and remote settings together across a vault switch', async () => {
    await git.init();
    await fs.writeFile(path.join(work, 'Note.md'), 'vault A');
    await git.commitAll();
    const next = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-next-vault-'));
    const nextRemote = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-next-remote-'));
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const gate = new Promise<void>(r => { release = r; });
    const mutation = withVaultMutation(async () => { entered(); await gate; });
    let pushing: Promise<unknown> | undefined;
    try {
      await exec('git', ['init', '--bare', '-b', 'main', nextRemote]);
      await started;
      pushing = git.push();
      // Let the push join the occupied vault queue before changing settings.
      await new Promise(r => setTimeout(r, 100));
      settings.vault.path = next;
      settings.git.remote = nextRemote;
      release(); await mutation; await pushing;
      expect((await exec('git', ['-C', work, 'remote', 'get-url', 'origin'])).stdout.trim()).toBe(bare);
      expect((await exec('git', ['--git-dir', bare, 'show', 'main:Note.md'])).stdout).toBe('vault A');
      expect((await exec('git', ['--git-dir', nextRemote, 'for-each-ref'])).stdout).toBe('');
    } finally {
      release(); await mutation; await pushing?.catch(() => {});
      await fs.rm(next, { recursive: true, force: true });
      await fs.rm(nextRemote, { recursive: true, force: true });
    }
  }, T);
  async function remoteNoteUpdate() {
    await git.init();
    await fs.writeFile(path.join(work, 'Note.md'), 'base');
    expect((await git.sync()).ok).toBe(true);
    const peer = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-peer-'));
    try {
      await exec('git', ['clone', bare, peer]);
      await fs.writeFile(path.join(peer, 'Note.md'), 'remote');
      await exec('git', ['-C', peer, 'add', '.']);
      await exec('git', ['-C', peer, 'commit', '-m', 'remote edit']);
      await exec('git', ['-C', peer, 'push']);
    } finally { await fs.rm(peer, { recursive: true, force: true }); }
  }

  function saveLocal() {
    return mutateFileText('Note.md', current => {
      if (!checkVersion(current, contentVersion('base')).ok) {
        throw Object.assign(new Error('version_conflict'), { status: 409 });
      }
      return { content: 'local', result: undefined };
    });
  }

  it.each(['pull', 'sync'] as const)('%s waits for an accepted save and cannot overwrite it mid-write', async operation => {
    await remoteNoteUpdate();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const gate = new Promise<void>(r => { release = r; });
    const open = fs.open.bind(fs);
    const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      if (String(args[0]).includes('Note.md.tmp-')) { entered(); await gate; }
      return open(...args);
    });
    const saving = saveLocal();
    let pulling: Promise<string> | undefined;
    try {
      await started;
      pulling = (operation === 'pull' ? git.pull().then(() => 'pulled')
        : git.sync().then(result => result.ok ? 'pulled' : 'rejected')).catch(() => 'rejected');
      const result = await Promise.race([pulling, new Promise<string>(r => setTimeout(() => r('waiting'), 1000))]);
      expect(result).toBe('waiting');
      release(); await saving;
      expect(await pulling).toBe('rejected'); // Git protects the now-dirty local note.
      expect(await fs.readFile(path.join(work, 'Note.md'), 'utf8')).toBe('local');
      expect((await exec('git', ['-C', work, 'show', 'HEAD:Note.md'])).stdout).toBe(operation === 'sync' ? 'local' : 'base');
      expect((await git.status()).conflicted).toEqual([]);
    } finally { release(); await saving; await pulling; spy.mockRestore(); }
  }, T);

  it.each(['pull', 'sync'] as const)('a save queued behind %s checks the pulled version and reports a conflict', async operation => {
    settings.git.lfsPatterns = ['*.png'];
    await remoteNoteUpdate();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(r => { entered = r; });
    const gate = new Promise<void>(r => { release = r; });
    const read = fs.readFile.bind(fs);
    const spy = vi.spyOn(fs, 'readFile').mockImplementation((async (...args: Parameters<typeof fs.readFile>) => {
      if (String(args[0]) === path.join(work, '.gitattributes')) { entered(); await gate; }
      return read(...args);
    }) as typeof fs.readFile);
    const pulling = (operation === 'pull' ? git.pull().then(() => 'pulled')
      : git.sync().then(result => result.ok ? 'pulled' : 'rejected')).catch(() => 'rejected');
    let saving: Promise<unknown> | undefined;
    try {
      await started;
      saving = saveLocal().then(() => 'saved', error => error.status);
      const result = await Promise.race([saving, new Promise<string>(r => setTimeout(() => r('waiting'), 100))]);
      expect(result).toBe('waiting');
      release();
      expect(await pulling).toBe('pulled');
      expect(await saving).toBe(409);
      expect(await fs.readFile(path.join(work, 'Note.md'), 'utf8')).toBe('remote');
    } finally { release(); await pulling; await saving; spy.mockRestore(); }
  }, T);
  it('uses the temporary global Git configuration for simple-git child processes', async () => {
    const origin = await simpleGit({ baseDir: work }).raw(['config', '--global', '--show-origin', '--get', 'user.name']);
    expect(origin.replace(/\\/g, '/').includes(cfgHome.replace(/\\/g, '/'))).toBe(true);
  }, T);

  it('clones a local remote into an empty vault and configures its identity', async () => {
    const seed = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitseed-'));
    try {
      await exec('git', ['init', '-b', 'main', seed]);
      await fs.writeFile(path.join(seed, 'cloned.md'), '# local fixture');
      await exec('git', ['-C', seed, 'add', 'cloned.md']);
      await exec('git', ['-C', seed, 'commit', '-m', 'seed']);
      await exec('git', ['-C', seed, 'push', bare, 'main']);
      await git.clone();
      expect(await fs.readFile(path.join(work, 'cloned.md'), 'utf8')).toBe('# local fixture');
      const { stdout } = await exec('git', ['-C', work, 'config', 'user.name']);
      expect(stdout.trim()).toBe('Tester');
      expect((await git.status()).clean).toBe(true);
    } finally {
      await fs.rm(seed, { recursive: true, force: true });
    }
  }, T);

  it(
    'init creates a repo, configures identity, and sets origin',
    async () => {
      await git.init();
      const { stdout: origin } = await exec('git', ['-C', work, 'remote', 'get-url', 'origin']);
      expect(origin.trim()).toBe(bare);
      const { stdout: name } = await exec('git', ['-C', work, 'config', 'user.name']);
      expect(name.trim()).toBe('Tester');
    },
    T,
  );

  it(
    'authedRemote injects the PAT into an https origin (no network)',
    async () => {
      settings.git.remote = 'https://github.com/o/r.git';
      settings.git.token = 'ghp_SECRET';
      await git.init();
      const { stdout } = await exec('git', ['-C', work, 'remote', 'get-url', 'origin']);
      expect(stdout.trim()).toBe('https://ghp_SECRET@github.com/o/r.git');
    },
    T,
  );

  it(
    'commitAll stages everything; subject = describeChanges and body lists the file',
    async () => {
      await git.init();
      await fs.writeFile(path.join(work, 'Hello.md'), '# Hi');
      const res = await git.commitAll();
      expect(res).toContain('Add Hello');
      const { stdout: body } = await exec('git', ['-C', work, 'log', '-1', '--pretty=%B']);
      expect(body).toContain('Add Hello'); // subject
      expect(body).toContain('Hello.md'); // body file list
    },
    T,
  );

  it(
    'status maps repo state (clean -> notAdded -> clean)',
    async () => {
      await git.init();
      expect((await git.status()).isRepo).toBe(true);
      expect((await git.status()).clean).toBe(true);

      await fs.writeFile(path.join(work, 'a.md'), 'x');
      const dirty = await git.status();
      expect(dirty.notAdded).toBe(1);
      expect(dirty.clean).toBe(false);

      await git.commitAll();
      expect((await git.status()).clean).toBe(true);
    },
    T,
  );

  it.each(['commitAll', 'sync'] as const)(
    '%s excludes copy staging and UUID writer files while retaining normal dotfiles and published copies',
    async (operation) => {
      await git.init();
      const stagingName = '.webobsidian-copy-Ab12Cd';
      const writerName = 'note.md.tmp-12345678-1234-4abc-9def-123456789abc';
      await fs.mkdir(path.join(work, 'nested', stagingName, 'payload'), { recursive: true });
      await fs.writeFile(path.join(work, 'nested', stagingName, 'payload', 'partial.md'), 'unpublished copy');
      await fs.mkdir(path.join(work, stagingName));
      await fs.writeFile(path.join(work, stagingName, 'partial.md'), 'root unpublished copy');
      await fs.writeFile(path.join(work, writerName), 'unpublished write');
      await fs.writeFile(path.join(work, 'nested', writerName), 'nested unpublished write');
      await fs.writeFile(path.join(work, 'note.md'), 'published note');
      await fs.writeFile(path.join(work, '.normal-dotfile'), 'normal dotfile');
      await fs.writeFile(path.join(work, 'keep.tmp-draft'), 'ordinary temporary-looking user document');

      if (operation === 'sync') expect((await git.sync()).ok).toBe(true);
      else await git.commitAll();
      const { stdout: committed } = await exec('git', ['-C', work, 'ls-tree', '-r', '--name-only', 'HEAD']);
      expect(committed.trim().split('\n').sort()).toEqual(['.normal-dotfile', 'keep.tmp-draft', 'note.md']);
      const { stdout: staged } = await exec('git', ['-C', work, 'diff', '--cached', '--name-only']);
      expect(staged).toBe('');
      const { stdout: message } = await exec('git', ['-C', work, 'log', '-1', '--pretty=%B']);
      expect(message).not.toContain(stagingName);
      expect(message).not.toContain(writerName);

      // With only in-flight artifacts left, another commit is an ordinary no-op.
      expect(await git.commitAll()).toBe('Nothing to commit');
      await fs.rename(path.join(work, 'nested', stagingName, 'payload'), path.join(work, 'published-copy'));
      await git.commitAll();
      const { stdout: published } = await exec('git', ['-C', work, 'ls-tree', '-r', '--name-only', 'HEAD']);
      expect(published).toContain('published-copy/partial.md');
      expect(published).not.toContain(stagingName);
      expect(published).not.toContain(writerName);
    }, T,
  );

  it(
    'log + showFile round-trip a committed file',
    async () => {
      await git.init();
      await fs.writeFile(path.join(work, 'note.md'), 'v1');
      await git.commitAll();
      const commits = await git.log('note.md');
      expect(commits).toHaveLength(1);
      expect(await git.showFile(commits[0].hash, 'note.md')).toBe('v1');
    },
    T,
  );

  it(
    'sync pushes to the bare remote and merges a peer change (no conflict)',
    async () => {
      // device 1: init + commit + sync (push to bare)
      await git.init();
      await fs.writeFile(path.join(work, 'a.md'), 'A');
      expect((await git.sync()).ok).toBe(true);

      // a peer clones the bare, adds b.md, pushes
      const peer = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-peer-'));
      try {
        await exec('git', ['clone', '-b', 'main', bare, peer]);
        expect(await fs.readFile(path.join(peer, 'a.md'), 'utf8')).toBe('A');
        await fs.writeFile(path.join(peer, 'b.md'), 'B');
        await exec('git', ['-C', peer, 'add', '.']);
        await exec('git', ['-C', peer, 'commit', '-m', 'peer adds b']);
        await exec('git', ['-C', peer, 'push', 'origin', 'main']);

        // device 1: add c.md, sync -> pulls b, merges, pushes c
        await fs.writeFile(path.join(work, 'c.md'), 'C');
        expect((await git.sync()).ok).toBe(true);
        expect(await fs.readFile(path.join(work, 'b.md'), 'utf8')).toBe('B');
        expect(await fs.readFile(path.join(work, 'c.md'), 'utf8')).toBe('C');
      } finally {
        await fs.rm(peer, { recursive: true, force: true });
      }
    },
    T,
  );
});
