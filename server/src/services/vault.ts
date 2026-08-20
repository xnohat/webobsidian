import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSettings } from './settings.js';

export interface TreeNode {
  name: string;
  path: string; // vault-relative, posix style
  type: 'file' | 'folder';
  ext?: string;
  size?: number;
  mtime?: number; // last-modified (ms) — for sort-by-modified-time
  ctime?: number; // created/birth (ms) — for sort-by-created-time
  children?: TreeNode[];
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
  const s = await getSettings();
  const vault = path.resolve(s.vault.path);
  const extra = s.vault.allowedRoots.map((r) => path.resolve(r));
  return extra.length ? [vault, ...extra] : [vault];
}

export async function getVaultRoot(): Promise<string> {
  const s = await getSettings();
  return path.resolve(s.vault.path);
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
  if (path.relative(root, abs).split(path.sep).includes('.git')) {
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
  const realRootSeps = realRoots.map((r) => (r.endsWith(path.sep) ? r : r + path.sep));
  let probe = abs;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const inside = realRoots.some((rr, i) => real === rr || real.startsWith(realRootSeps[i]));
      if (!inside) {
        throw Object.assign(new Error('Path escapes vault'), { status: 400 });
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

export function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

export async function ensureVault(): Promise<void> {
  const root = await getVaultRoot();
  await fs.mkdir(root, { recursive: true });
}

/** Build the full tree (folders + files), skipping ignored dirs. */
export async function listTree(): Promise<TreeNode> {
  const root = await getVaultRoot();
  await fs.mkdir(root, { recursive: true });

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

  return { name: path.basename(root), path: '', type: 'folder', children: await walk(root, new Set()) };
}

export function isTextFile(rel: string): boolean {
  return TEXT_EXTS.has(path.extname(rel).toLowerCase());
}

export async function readFileText(rel: string): Promise<string> {
  const abs = await resolveInVault(rel);
  return fs.readFile(abs, 'utf8');
}

export async function readFileBuffer(rel: string): Promise<Buffer> {
  const abs = await resolveInVault(rel);
  return fs.readFile(abs);
}

export async function writeFileText(rel: string, content: string): Promise<void> {
  const abs = await resolveInVault(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, abs);
}

export async function writeFileBuffer(rel: string, buf: Buffer): Promise<void> {
  const abs = await resolveInVault(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
}

export async function createFolder(rel: string): Promise<void> {
  const abs = await resolveInVault(rel);
  await fs.mkdir(abs, { recursive: true });
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

export async function rename(from: string, to: string): Promise<void> {
  const absFrom = await resolveInVault(from);
  const absTo = await resolveInVault(to);
  await fs.mkdir(path.dirname(absTo), { recursive: true });
  await fs.rename(absFrom, absTo);
}

/**
 * Recursively copy a file or folder to a new location. Returns the vault-relative
 * paths of every file created (so callers can reindex them). Throws if `to` exists.
 */
export async function copy(from: string, to: string): Promise<string[]> {
  const absFrom = await resolveInVault(from);
  const absTo = await resolveInVault(to);
  await fs.mkdir(path.dirname(absTo), { recursive: true });
  await fs.cp(absFrom, absTo, { recursive: true, errorOnExist: true, force: false, dereference: true });
  const root = await getVaultRoot();
  const out: string[] = [];
  const st = await fs.stat(absTo);
  if (st.isDirectory()) {
    async function walk(dir: string, visited: Set<string>) {
      const key = await fs.realpath(dir).catch(() => dir);
      if (visited.has(key)) return;
      visited.add(key);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (IGNORED.has(e.name)) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) await walk(abs, visited);
        else if (e.isFile()) out.push(toRel(root, abs));
        else if (e.isSymbolicLink()) {
          const st = await fs.stat(abs).catch(() => null);
          if (!st) continue;
          if (st.isDirectory()) await walk(abs, visited);
          else if (st.isFile()) out.push(toRel(root, abs));
        }
      }
    }
    await walk(absTo, new Set());
  } else {
    out.push(toRel(root, absTo));
  }
  return out;
}

/** Permanently delete a file or folder (no trash). */
export async function remove(rel: string): Promise<void> {
  const abs = await resolveInVault(rel);
  await fs.rm(abs, { recursive: true, force: true });
}

/** Move a path into the vault trash folder, preserving relative layout. */
export async function trash(rel: string): Promise<string> {
  const s = await getSettings();
  const root = await getVaultRoot();
  const absFrom = await resolveInVault(rel);
  const trashRoot = path.join(root, s.vault.trash);
  const dest = path.join(trashRoot, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  // avoid collision
  let finalDest = dest;
  if (await pathExists(finalDest)) {
    const ext = path.extname(dest);
    finalDest = `${dest.slice(0, dest.length - ext.length)}.${Date.now()}${ext}`;
  }
  await fs.rename(absFrom, finalDest);
  return toRel(root, finalDest);
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
  mtime: number; // deletion time (file mtime when it landed in trash)
}

async function getTrashRoot(): Promise<string> {
  const s = await getSettings();
  const root = await getVaultRoot();
  return path.join(root, s.vault.trash);
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
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // trash folder doesn't exist yet
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile()) {
        const st = await fs.stat(abs).catch(() => null);
        out.push({
          name: e.name,
          path: toRel(root, abs),
          original: path.relative(trashRoot, abs).split(path.sep).join('/'),
          ext: path.extname(e.name).toLowerCase(),
          size: st?.size ?? 0,
          mtime: st ? st.mtimeMs : 0,
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
  await pruneEmptyDirs(path.dirname(absFrom), trashRoot);
  return destRel;
}

/** Permanently delete a single trashed item. */
export async function deleteFromTrash(trashRel: string): Promise<void> {
  const trashRoot = await getTrashRoot();
  const abs = await resolveInVault(trashRel);
  assertInTrash(abs, trashRoot);
  await fs.rm(abs, { recursive: true, force: true });
  await pruneEmptyDirs(path.dirname(abs), trashRoot);
}

/** Permanently delete everything in the trash. */
export async function emptyTrash(): Promise<void> {
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
