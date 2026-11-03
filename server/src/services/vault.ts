import {getAttachmentFolderSetting} from './vaultPreferences.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getSettings } from './settings.js';
import { contentVersion } from './noteversion.js';
import { canonicalMutationRoot, withVaultMutation as enqueueVaultMutation } from './vaultmutations.js';
import { TRASH_INDEX_NAME, deletedAtFor, forgetTrashed, readDeletedAt, recordTrashed } from './trashindex.js';

type VaultSettings = Awaited<ReturnType<typeof getSettings>>['vault'];
const mutationSettings = new AsyncLocalStorage<{ vault: VaultSettings; active: boolean }>();

export async function getVaultSettings(): Promise<VaultSettings> {
  const context = mutationSettings.getStore();
  return context?.active ? context.vault : (await getSettings()).vault;
}

/** Capture settings before waiting, so a queued operation never changes vaults. */
export async function withVaultMutation<T>(action: () => Promise<T>): Promise<T> {
  const current = mutationSettings.getStore();
  if (current?.active) return action();
  const settings = await getVaultSettings();
  const vault = { ...settings, path: path.resolve(settings.path), allowedRoots: [...settings.allowedRoots].map((r) => path.resolve(r)) };
  return enqueueVaultMutation(vault.path, async () => {
    const context = { vault, active: true };
    try { return await mutationSettings.run(context, action); }
    finally { context.active = false; }
  });
}

export interface TreeNode {
  name: string;
  path: string; // vault-relative, posix style
  type: 'file' | 'folder';
  ext?: string;
  size?: number;
  mtime?: number; // last-modified (ms) — for sort-by-modified-time
  ctime?: number; // created/birth (ms) — for sort-by-created-time
  children?: TreeNode[];
  attachmentFolder?: boolean;
  /** Set by `services/locks.ts` on tree responses: the browser session must not edit this path. */
  locked?: boolean;
  /** Why it is locked — shown to the human in the editor banner. */
  lockReason?: string;
}

/**
 * In-memory mtime/ctime cache so sort-by-time costs ONE stat per file total,
 * not 27k stats on every tree fetch (the tree is refetched on each fs event).
 * Filled lazily during listTree(); the file watcher invalidates changed paths
 * (see invalidateStat), so steady-state tree fetches do zero extra syscalls.
 */
const statCache = new Map<string, { m: number; c: number }>();

export function invalidateStat(rel: string): void {
  statCache.delete(rel);
}

export function clearStatCache(): void { statCache.clear(); }

async function fileStat(abs: string, rel: string): Promise<{ m: number; c: number }> {
  const hit = statCache.get(rel);
  if (hit) return hit;
  let v = { m: 0, c: 0 };
  try {
    const st = await fs.stat(abs);
    // birthtime can be 0 on some Linux filesystems → fall back to mtime.
    v = { m: st.mtimeMs, c: st.birthtimeMs || st.mtimeMs };
  } catch { /* file vanished mid-walk — leave zeros */ }
  statCache.set(rel, v);
  return v;
}

const TEXT_EXTS = new Set([
  '.md', '.markdown', '.txt', '.json', '.csv', '.canvas', '.css', '.js', '.yml', '.yaml',
]);

const IGNORED = new Set(['.git', 'node_modules']);

/** Vault roots that file operations may resolve into: the vault root itself plus
 * any allowedRoots from settings (folders reachable via symlinks may live outside
 * the root). Falls back to the single vault root when none are configured. */
export async function getAllowedRoots(): Promise<string[]> {
  const s = await getVaultSettings();
  const vault = path.resolve(s.path);
  const extra = s.allowedRoots.map((r) => path.resolve(r));
  return extra.length ? [vault, ...extra] : [vault];
}

export async function getVaultRoot(): Promise<string> {
  return path.resolve((await getVaultSettings()).path);
}

/** Resolve a vault-relative path to an absolute one, refusing traversal. */
export async function resolveInVault(relPath: string): Promise<string> {
  const root = await getVaultRoot();
  const clean = relPath.replace(/^[/\\]+/, '');
  const abs = path.resolve(root, clean);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    throw Object.assign(new Error('Path escapes vault'), { status: 400 });
  }
  // Never resolve into the vault's own git metadata: an authenticated write to
  // e.g. .git/hooks/post-merge would execute on the next git sync.
  if (path.relative(root, abs).split(path.sep).some(isGitSegment)) {
    throw Object.assign(new Error('Path not allowed'), { status: 400 });
  }
  // Symlink guard: a symlink *inside* the vault could point outside it, which the
  // string-prefix check above can't catch. Resolve the real path of the deepest
  // existing ancestor and confirm it still lives under the vault root.
  await assertRealpathInVault(abs, await getAllowedRoots());
  return abs;
}

async function assertRealpathInVault(abs: string, roots: string[]): Promise<void> {
  const realRoots = await Promise.all(roots.map((r) => fs.realpath(r).catch(() => r)));
  let probe = abs;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const inside = realRoots.some((rr) => isWithin(rr, real));
      if (!inside) {
        throw Object.assign(new Error('Path escapes vault'), { status: 400 });
      }
      if (realRoots.some((rr) => isWithin(rr, real) && path.relative(rr, real).split(path.sep).some(isGitSegment))) {
        throw Object.assign(new Error('Path not allowed'), { status: 400 });
      }
      return; // deepest existing ancestor is inside an allowed root; the rest is new
    } catch (e: any) {
      if (e?.status === 400) throw e; // our own escape error — propagate
      const parent = path.dirname(probe);
      if (parent === probe) return; // reached fs root without resolving — nothing to verify
      probe = parent;
    }
  }
}

function isGitSegment(segment: string): boolean {
  return (process.platform === 'win32' ? segment.toLowerCase() : segment) === '.git';
}

export function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

export async function ensureVault(): Promise<void> {
  const root = await getVaultRoot();
  await fs.mkdir(root, { recursive: true });
  const { recoverPendingRenames } = await import('./renameLinks.js');
  await recoverPendingRenames();
}

/** Build the full tree (folders + files), skipping ignored dirs. */
export async function listTree(): Promise<TreeNode> {
  const root = await getVaultRoot();
  await fs.mkdir(root, { recursive: true });
  // Bad attachment configuration must not prevent browsing or repairing the vault.
  const attachmentSetting = await attachmentFolderSetting().catch(() => null);
  const attachmentSubdir = attachmentSetting && attachmentSetting !== '/' && attachmentSetting !== './'
    ? path.posix.normalize(attachmentSetting).replace(/\/$/, '').toLowerCase() : '';
  const markAttachments = (node: TreeNode): TreeNode => {
    if (node.type === 'folder') {
      const rel = node.path.toLowerCase();
      node.attachmentFolder = !!attachmentSubdir && attachmentSubdir !== '.' && (
        attachmentSetting?.startsWith('./')
          ? rel === attachmentSubdir || rel.endsWith(`/${attachmentSubdir}`)
          : rel === attachmentSubdir
      );
      node.children?.forEach(markAttachments);
    }
    return node;
  };

  async function walk(absDir: string, visited: Set<string>): Promise<TreeNode[]> {
    // Symlink cycle guard: a link may point back into an ancestor or the root.
    const key = await fs.realpath(absDir).catch(() => absDir);
    if (visited.has(key)) return [];
    visited.add(key);
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    // Stat files concurrently per directory (cached) so the one-time fill is fast;
    // steady state reads from statCache → no syscalls. mtime/ctime power sort-by-time.
    const nodes = await Promise.all(
      entries
        .filter((e) => !(IGNORED.has(e.name) || e.name.startsWith('.'))) // hide dotfiles like Obsidian
        .map(async (e): Promise<TreeNode | null> => {
          const abs = path.join(absDir, e.name);
          const rel = toRel(root, abs);
          if (e.isDirectory()) {
            return { name: e.name, path: rel, type: 'folder', children: await walk(abs, visited) };
          }
          if (e.isFile()) {
            const { m, c } = await fileStat(abs, rel);
            return { name: e.name, path: rel, type: 'file', ext: path.extname(e.name).toLowerCase(), mtime: m, ctime: c };
          }
          // Symlinked entries: a Dirent is neither dir nor file, but the link may
          // resolve to either. Broken links are skipped.
          if (e.isSymbolicLink()) {
            const st = await fs.stat(abs).catch(() => null);
            if (!st) return null;
            if (st.isDirectory()) {
              return { name: e.name, path: rel, type: 'folder', children: await walk(abs, visited) };
            }
            if (st.isFile()) {
              const { m, c } = await fileStat(abs, rel);
              return { name: e.name, path: rel, type: 'file', ext: path.extname(e.name).toLowerCase(), mtime: m, ctime: c };
            }
          }
          return null;
        }),
    );
    const out = nodes.filter((n): n is TreeNode => n !== null);
    // folders first, then alphabetical (client re-sorts by the chosen order)
    out.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  return markAttachments({ name: path.basename(root), path: '', type: 'folder', children: await walk(root, new Set()) });
}

export function isTextFile(rel: string): boolean {
  return TEXT_EXTS.has(path.extname(rel).toLowerCase());
}

export async function readFileText(rel: string): Promise<string> {
  const abs = await resolveInVault(rel);
  return fs.readFile(abs, 'utf8');
}

/** Refuse oversized note embeds before allocation; cap reads if the file grows. */
export async function readFileTextBounded(rel:string,maxBytes:number):Promise<string|null>{
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw new RangeError('Invalid text read limit');
  const handle=await fs.open(await resolveInVault(rel),'r');
  try{
    const stat=await handle.stat();if(!stat.isFile()||stat.size>maxBytes)return null;
    const buffer=Buffer.alloc(maxBytes+1);let length=0;
    while(length<buffer.length){const {bytesRead}=await handle.read(buffer,length,buffer.length-length,null);if(!bytesRead)break;length+=bytesRead}
    return length>maxBytes?null:buffer.toString('utf8',0,length);
  }finally{await handle.close()}
}

export async function readFileBuffer(rel: string): Promise<Buffer> {
  const abs = await resolveInVault(rel);
  return fs.readFile(abs);
}

export async function writeFileText(rel: string, content: string): Promise<void> {
  await withVaultMutation(async () => {
    const abs = await resolveInVault(rel);
    await writeTextAt(abs, content);
  });
}

async function writeTextAt(abs: string, content: string): Promise<void> {
  // Preserve an existing file symlink: update its allowed target, not the link.
  abs = await fs.realpath(abs).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return abs;
  });
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${randomUUID()}`;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let created = false;
  try {
    handle = await fs.open(tmp, 'wx');
    created = true;
    await handle.writeFile(content, 'utf8');
    await handle.close();
    handle = undefined;
    await fs.rename(tmp, abs);
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (created) await fs.unlink(tmp).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function mutateFileText<T>(
  rel: string,
  update: (current: string | null) => { content: string; result: T },
): Promise<{ content: string; result: T; version: string }> {
  return withVaultMutation(async () => {
    const abs = await resolveInVault(rel);
    const current = await fs.readFile(abs, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    const change = update(current);
    await writeTextAt(abs, change.content);
    return { ...change, version: contentVersion(change.content) };
  });
}

export async function writeFileBuffer(rel: string, buf: Buffer): Promise<void> {
  return withVaultMutation(async () => {
    const abs = await resolveInVault(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
  });
}

export async function createFolder(rel: string): Promise<void> {
  return withVaultMutation(async () => {
    const abs = await resolveInVault(rel);
    await fs.mkdir(abs, { recursive: true });
  });
}

/** Obsidian paths are vault-relative, except ./ paths which are note-relative. */
async function attachmentFolderSetting(): Promise<string> {
  return getAttachmentFolderSetting(await getVaultRoot());
}

function checkedAttachmentPath(rel: string): string {
  if (rel.includes('\\') || /^[a-z]:/i.test(rel) || path.posix.isAbsolute(rel) || rel.includes('\0')) {
    throw Object.assign(new Error('Invalid attachment path'), { status: 400 });
  }
  const normalized = path.posix.normalize(rel);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw Object.assign(new Error('Attachment path escapes vault'), { status: 400 });
  }
  return normalized === '.' ? '' : normalized;
}

export async function resolveAttachmentDir(sourcePath: string): Promise<string> {
  const source = checkedAttachmentPath(sourcePath);
  const setting = await attachmentFolderSetting();
  const dir = setting === '/' || setting === '' ? '' : checkedAttachmentPath(
    setting.startsWith('./') ? path.posix.join(path.posix.dirname(source), setting) : setting,
  );
  await resolveInVault(dir);
  return resolveDirCaseInsensitive(dir);
}

/** Markdown URL relative to the source, preserving every path segment. */
export function attachmentRelativeUrl(rel: string, sourcePath: string): string {
  return path.posix.relative(path.posix.dirname(sourcePath || '.'), rel).split('/')
    .map((segment) => encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

/**
 * Resolve a directory path against the folders that already exist, matching each
 * segment case-insensitively. Prevents creating a case-duplicate folder (e.g. a
 * new `attachments` next to an existing `Attachments`) on case-sensitive
 * filesystems. Segments with no existing match are kept verbatim.
 */
export async function resolveDirCaseInsensitive(rel: string): Promise<string> {
  const root = await getVaultRoot();
  const segs = rel.split('/').filter(Boolean);
  const out: string[] = [];
  let curAbs = root;
  for (const seg of segs) {
    let actual = seg;
    try {
      const entries = await fs.readdir(curAbs, { withFileTypes: true });
      const exact = entries.find((e) => e.isDirectory() && e.name === seg);
      const ci = exact ?? entries.find((e) => e.isDirectory() && e.name.toLowerCase() === seg.toLowerCase());
      if (ci) actual = ci.name;
    } catch {
      /* directory doesn't exist yet — keep the requested casing */
    }
    out.push(actual);
    curAbs = path.join(curAbs, actual);
  }
  return out.join('/');
}

export async function exists(rel: string): Promise<boolean> {
  try {
    await fs.access(await resolveInVault(rel));
    return true;
  } catch {
    return false;
  }
}

export async function rename(from: string, to: string, options: import('./renameLinks.js').RenameOptions = {}): Promise<import('./renameLinks.js').RenameResult> {
  const { renameWithLinks } = await import('./renameLinks.js');
  return renameWithLinks({ from, to, ...options });
}

/** Internal primitive: use rename() for all user-facing renames. */
export async function rawRename(from: string, to: string): Promise<void> {
  return withVaultMutation(async () => {
    const absFrom = await resolveInVault(from);
    const absTo = await resolveInVault(to);
    if (absFrom === absTo) return;
    const destination = await entryStat(absTo);
    if (destination) {
      // A case-insensitive filesystem may resolve both spellings to one entry.
      // Verify the actual directory entry too: hardlinks are distinct destinations.
      const source = await fs.lstat(absFrom);
      const sameParent = await fs.realpath(path.dirname(absFrom)) === await fs.realpath(path.dirname(absTo));
      const names = sameParent ? await fs.readdir(path.dirname(absFrom)) : [];
      const caseOnly = sameParent && path.basename(absFrom).toLowerCase() === path.basename(absTo).toLowerCase()
        && !names.includes(path.basename(absTo)) && source.dev === destination.dev && source.ino === destination.ino;
      if (!caseOnly) throw destinationExists();
    }
    await fs.mkdir(path.dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
  });
}

function destinationExists(): Error { return Object.assign(new Error('destination_exists'), { status: 409 }); }

async function entryStat(abs: string) {
  try { return await fs.lstat(abs); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
}

/**
 * Recursively copy a file or folder to a new location. Returns the vault-relative
 * paths of every file created (so callers can reindex them). Throws if `to` exists.
 */
export async function copy(from: string, to: string): Promise<string[]> {
  return withVaultMutation(async () => {
    const absFrom = await resolveInVault(from);
    const absTo = await resolveInVault(to);
    if (await entryStat(absTo)) throw destinationExists();
    const root = await getVaultRoot();
    const roots = await Promise.all((await getAllowedRoots()).map((r) => fs.realpath(r).catch(() => r)));
    const plan: { source: string; real: string; relative: string; directory: boolean }[] = [];
    const badPath = (message: string) => Object.assign(new Error(message), { status: 400 });
    async function checkedRealPath(source: string): Promise<string> {
      let real: string;
      try { real = await fs.realpath(source); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ELOOP' || code === 'ENOTDIR') throw badPath('Broken or cyclic copy source');
        throw error;
      }
      if (!roots.some((allowed) => isWithin(allowed, real))) throw badPath('Path escapes vault');
      // A permitted symlink must not provide another spelling for Git metadata.
      if (roots.some((allowed) => isWithin(allowed, real) && path.relative(allowed, real).split(path.sep).some(isGitSegment))) {
        throw badPath('Path not allowed');
      }
      if (path.relative(root, source).split(path.sep).some(isGitSegment)) throw badPath('Path not allowed');
      return real;
    }
    async function preflight(source: string, relative: string, ancestors: Set<string>): Promise<void> {
      const real = await checkedRealPath(source);
      const key = process.platform === 'win32' ? real.toLowerCase() : real;
      const stat = await fs.stat(source);
      if (!stat.isDirectory() && !stat.isFile()) throw badPath('Unsupported copy source');
      if (stat.isDirectory() && ancestors.has(key)) throw badPath('Cyclic copy source');
      plan.push({ source, real, relative, directory: stat.isDirectory() });
      if (stat.isDirectory()) {
        const next = new Set(ancestors).add(key);
        for (const name of await fs.readdir(source)) await preflight(path.join(source, name), path.join(relative, name), next);
      }
    }
    const canonicalFrom = await canonicalMutationRoot(absFrom);
    const canonicalTo = await canonicalMutationRoot(absTo);
    if (isWithin(canonicalFrom, canonicalTo)) throw badPath('Cannot copy into source subtree');
    await preflight(absFrom, '', new Set());
    await fs.mkdir(path.dirname(absTo), { recursive: true });
    const staging = await fs.mkdtemp(path.join(path.dirname(absTo), '.webobsidian-copy-'));
    const payload = path.join(staging, 'payload');
    try {
      for (const entry of plan) {
        const real = await checkedRealPath(entry.source);
        if (real !== entry.real) throw badPath('Copy source changed');
        const dest = path.join(payload, entry.relative);
        if (entry.directory) await fs.mkdir(dest, { recursive: true });
        else await fs.copyFile(entry.source, dest);
      }
      await assertRealpathInVault(path.dirname(absTo), roots);
      if (await entryStat(absTo)) throw destinationExists();
      await fs.rename(payload, absTo);
      return plan.filter((entry) => !entry.directory).map((entry) => toRel(root, path.join(absTo, entry.relative)));
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  });
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * After a file inside an `attachments/` folder was deleted or trashed, remove that folder if it
 * is now empty (it was auto-created for pasted images, so an empty one is just clutter).
 * Never touches the vault root, non-attachment folders, or a folder that still has content.
 * Keep the name in sync with ATTACHMENT_DIR_NAME in web/src/lib/attachments.ts.
 */
export async function pruneEmptyAttachmentsDir(relFile: string): Promise<boolean> {
  return withVaultMutation(async () => {
    const dir = path.posix.dirname(relFile);
    if (dir === '.' || path.posix.basename(dir).toLowerCase() !== 'attachments') return false;
    try {
      const abs = await resolveInVault(dir);
      if ((await fs.readdir(abs)).length > 0) return false;
      await fs.rmdir(abs); // rmdir only succeeds on an empty directory
      return true;
    } catch {
      return false;
    }
  });
}

/** Permanently delete a file or folder (no trash). */
export async function remove(rel: string): Promise<void> {
  return withVaultMutation(async () => {
    const abs = await resolveInVault(rel);
    await fs.rm(abs, { recursive: true, force: true });
  });
}

/** Move a path into the vault trash folder, preserving relative layout. */
export async function trash(rel: string): Promise<string> {
  return withVaultMutation(async () => {
    const s = await getVaultSettings();
    const root = await getVaultRoot();
    const absFrom = await resolveInVault(rel);
    const trashRoot = path.join(root, s.trash);
    const dest = path.join(trashRoot, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    // avoid collision
    let finalDest = dest;
    if (await pathExists(finalDest)) {
      const ext = path.extname(dest);
      finalDest = `${dest.slice(0, dest.length - ext.length)}.${Date.now()}${ext}`;
    }
    await fs.rename(absFrom, finalDest);
    // rename keeps the original mtime, so record when it entered the trash (retention clock).
    await recordTrashed(trashRoot, path.relative(trashRoot, finalDest));
    return toRel(root, finalDest);
  });
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/** ---- Trash (FR-1) -------------------------------------------------------- */

export interface TrashItem {
  name: string; // basename
  path: string; // vault-relative, including the trash prefix, e.g. ".trash/folder/note.md"
  original: string; // where it restores to, e.g. "folder/note.md"
  ext: string;
  size: number;
  mtime: number; // deletion time (from the trash index; file mtime for untracked items)
}

export async function getTrashRoot(): Promise<string> {
  const s = await getVaultSettings();
  const root = await getVaultRoot();
  return path.join(root, s.trash);
}

/** Confirm `abs` lives inside the trash folder; return its trash-relative path. */
function assertInTrash(abs: string, trashRoot: string): string {
  const rel = path.relative(trashRoot, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw Object.assign(new Error('Not a trash item'), { status: 400 });
  }
  return rel;
}

/** Remove now-empty directories upward from `dir`, stopping at (and keeping) `stopAt`. */
async function pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
  let cur = path.resolve(dir);
  const root = path.resolve(stopAt);
  while (cur !== root && cur.startsWith(root + path.sep)) {
    try {
      const remaining = await fs.readdir(cur);
      if (remaining.length > 0) break;
      await fs.rmdir(cur);
    } catch {
      break;
    }
    cur = path.dirname(cur);
  }
}

/** List every file currently in the trash, newest deletion first. */
export async function listTrash(): Promise<TrashItem[]> {
  const root = await getVaultRoot();
  const trashRoot = await getTrashRoot();
  const out: TrashItem[] = [];
  const deletedAt = await readDeletedAt(trashRoot);
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // trash folder doesn't exist yet
    }
    for (const e of entries) {
      if (dir === trashRoot && (e.name === TRASH_INDEX_NAME || e.name === `${TRASH_INDEX_NAME}.tmp`)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile()) {
        const st = await fs.stat(abs).catch(() => null);
        const original = path.relative(trashRoot, abs).split(path.sep).join('/');
        out.push({
          name: e.name,
          path: toRel(root, abs),
          original,
          ext: path.extname(e.name).toLowerCase(),
          size: st?.size ?? 0,
          mtime: deletedAtFor(deletedAt, original) ?? (st ? st.mtimeMs : 0),
        });
      }
    }
  }
  await walk(trashRoot);
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

/** Move a trashed item back to its original location. Returns the restored rel path. */
export async function restoreFromTrash(trashRel: string): Promise<string> {
  return withVaultMutation(async () => {
    const trashRoot = await getTrashRoot();
    const absFrom = await resolveInVault(trashRel);
    const relInTrash = assertInTrash(absFrom, trashRoot);
    let destRel = relInTrash.split(path.sep).join('/');
    let absTo = await resolveInVault(destRel);
    // Don't clobber a file that was recreated at the same path after deletion.
    if (await pathExists(absTo)) {
      const ext = path.extname(destRel);
      destRel = `${destRel.slice(0, destRel.length - ext.length)}.restored-${Date.now()}${ext}`;
      absTo = await resolveInVault(destRel);
    }
    await fs.mkdir(path.dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
    await forgetTrashed(trashRoot, relInTrash);
    await pruneEmptyDirs(path.dirname(absFrom), trashRoot);
    return destRel;
  });
}

/** Permanently delete a single trashed item. */
export async function deleteFromTrash(trashRel: string): Promise<void> {
  return withVaultMutation(async () => {
    const trashRoot = await getTrashRoot();
    const abs = await resolveInVault(trashRel);
    const relInTrash = assertInTrash(abs, trashRoot);
    await fs.rm(abs, { recursive: true, force: true });
    await forgetTrashed(trashRoot, relInTrash);
    await pruneEmptyDirs(path.dirname(abs), trashRoot);
  });
}

/** Permanently remove a trash-relative item (used by the retention purge). */
export async function purgeTrashEntry(trashRel: string): Promise<void> {
  return withVaultMutation(async () => {
    const trashRoot = await getTrashRoot();
    const abs = path.resolve(trashRoot, trashRel);
    const relInTrash = assertInTrash(abs, trashRoot);
    await fs.rm(abs, { recursive: true, force: true });
    await forgetTrashed(trashRoot, relInTrash);
    await pruneEmptyDirs(path.dirname(abs), trashRoot);
  });
}

/** Permanently delete everything in the trash. */
export async function emptyTrash(): Promise<void> {
  return withVaultMutation(async () => {
    const trashRoot = await getTrashRoot();
    let entries;
    try {
      entries = await fs.readdir(trashRoot);
    } catch {
      return; // nothing to empty
    }
    for (const name of entries) {
      await fs.rm(path.join(trashRoot, name), { recursive: true, force: true });
    }
  });
}

/** List all markdown files (vault-relative) for indexing. */
export async function listMarkdownFiles(): Promise<string[]> {
  const root = await getVaultRoot();
  const out: string[] = [];
  async function walk(dir: string, visited: Set<string>) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const key = await fs.realpath(dir).catch(() => dir);
    if (visited.has(key)) return;
    visited.add(key);
    for (const e of entries) {
      // Skip dotfiles/dot-dirs (`.trash`, `.obsidian`, …) like the tree view and
      // file index do — a note moved to `.trash` must not stay a live link target
      // (and would otherwise shadow a real file with the same basename).
      if (IGNORED.has(e.name) || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs, visited);
      else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) out.push(toRel(root, abs));
      else if (e.isSymbolicLink()) {
        const st = await fs.stat(abs).catch(() => null);
        if (!st) continue;
        if (st.isDirectory()) await walk(abs, visited);
        else if (st.isFile() && /\.(md|markdown)$/i.test(e.name)) out.push(toRel(root, abs));
      }
    }
  }
  await walk(root, new Set());
  return out;
}

export type NoteSort = 'modified' | 'created' | 'name';
export type SortOrder = 'asc' | 'desc';

/**
 * Like listMarkdownFiles(), but ordered for the Agent API's `GET /notes?sort=&order=`.
 * Default is most-recently-modified first, so a freshly touched note never falls past
 * the caller's `limit` into an unread tail. Time sorts use the same stat cache as
 * listTree(), so this costs one stat per file at most.
 *
 * Adopted from the fork `blueberry6401/webobsidian`; see docs/UPSTREAM_PR_MERGES.md →
 * "Adopted from other forks".
 */
export async function listMarkdownFilesSorted(
  sort: NoteSort = 'modified',
  order: SortOrder = 'desc',
): Promise<string[]> {
  const files = await listMarkdownFiles();
  if (sort === 'name') {
    files.sort((a, b) => a.localeCompare(b));
  } else {
    const root = await getVaultRoot();
    const stats = new Map<string, { m: number; c: number }>();
    await Promise.all(files.map(async (rel) => {
      stats.set(rel, await fileStat(path.join(root, rel), rel));
    }));
    files.sort((a, b) => {
      const sa = stats.get(a) ?? { m: 0, c: 0 };
      const sb = stats.get(b) ?? { m: 0, c: 0 };
      const va = sort === 'modified' ? sa.m : sa.c;
      const vb = sort === 'modified' ? sb.m : sb.c;
      if (va !== vb) return va - vb;
      return a.localeCompare(b);
    });
  }
  if (order === 'desc') files.reverse();
  return files;
}
