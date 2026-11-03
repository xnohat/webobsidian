// Trash deletion-time index (FR-1 retention).
//
// `fs.rename` keeps the file's ORIGINAL mtime, so the filesystem cannot tell us when an
// item was moved into the trash. We record that ourselves in `<trash>/.trash-index.json`
// as { "<trash-relative posix path>": deletedAtMs } — one entry per item that was trashed
// (a file, or a folder as a unit). A file's deletion time is the entry for the file itself
// or for the nearest ancestor folder entry. Items with no entry (trashed before this
// feature existed, or put there by hand) are given "now" the first time they are seen, so
// enabling retention never purges existing trash immediately.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const TRASH_INDEX_NAME = '.trash-index.json';

interface TrashIndex {
  version: 1;
  items: Record<string, number>;
}

// Serialize all read-modify-write cycles so concurrent deletes can't lose updates.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

const toKey = (rel: string) => rel.split(path.sep).join('/').replace(/^\/+|\/+$/g, '');

async function readIndex(trashRoot: string): Promise<TrashIndex> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(trashRoot, TRASH_INDEX_NAME), 'utf8'));
    const items: Record<string, number> = {};
    if (raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object') {
      for (const [k, v] of Object.entries(raw.items)) {
        if (typeof v === 'number' && Number.isFinite(v)) items[k] = v;
      }
    }
    return { version: 1, items };
  } catch {
    return { version: 1, items: {} }; // missing or corrupt → start fresh (backfilled on next purge)
  }
}

async function writeIndex(trashRoot: string, idx: TrashIndex): Promise<void> {
  await fs.mkdir(trashRoot, { recursive: true });
  const file = path.join(trashRoot, TRASH_INDEX_NAME);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(idx, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

/** Resolve a trash-relative key to an absolute path, or null if it would escape the trash. */
export function safeTrashPath(trashRoot: string, key: string): string | null {
  const root = path.resolve(trashRoot);
  const abs = path.resolve(root, key);
  return abs !== root && abs.startsWith(root + path.sep) ? abs : null;
}

/** Deletion time for a trash-relative file path: its own entry or the nearest ancestor's. */
export function deletedAtFor(items: Record<string, number>, rel: string): number | undefined {
  const parts = toKey(rel).split('/');
  for (let n = parts.length; n > 0; n--) {
    const hit = items[parts.slice(0, n).join('/')];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Record that `relInTrash` (a file or folder) was moved into the trash at `at`. */
export function recordTrashed(trashRoot: string, relInTrash: string, at = Date.now()): Promise<void> {
  return locked(async () => {
    const idx = await readIndex(trashRoot);
    idx.items[toKey(relInTrash)] = at;
    await writeIndex(trashRoot, idx);
  });
}

/** Forget an item (and anything recorded beneath it) after it was restored or deleted. */
export function forgetTrashed(trashRoot: string, relInTrash: string): Promise<void> {
  return locked(async () => {
    const idx = await readIndex(trashRoot);
    const key = toKey(relInTrash);
    let changed = false;
    for (const k of Object.keys(idx.items)) {
      if (k === key || k.startsWith(`${key}/`)) {
        delete idx.items[k];
        changed = true;
      }
    }
    if (changed) await writeIndex(trashRoot, idx);
  });
}

/** Snapshot of the deletion times (for listing). */
export async function readDeletedAt(trashRoot: string): Promise<Record<string, number>> {
  return (await readIndex(trashRoot)).items;
}

async function exists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bring the index in line with the disk, then return the entries older than `cutoffMs`.
 *  - entries whose item no longer exists are dropped;
 *  - files with no covering entry get `nowMs` (so pre-existing trash starts its clock now).
 */
export function reconcileAndFindExpired(trashRoot: string, cutoffMs: number, nowMs = Date.now()): Promise<string[]> {
  return locked(async () => {
    const idx = await readIndex(trashRoot);
    let changed = false;

    for (const key of Object.keys(idx.items)) {
      const abs = safeTrashPath(trashRoot, key);
      if (!abs || !(await exists(abs))) {
        delete idx.items[key];
        changed = true;
      }
    }

    const covered = (key: string) => deletedAtFor(idx.items, key) !== undefined;
    const walk = async (dirAbs: string, relDir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dirAbs, { withFileTypes: true });
      } catch {
        return; // trash folder doesn't exist yet
      }
      for (const e of entries) {
        if (!relDir && (e.name === TRASH_INDEX_NAME || e.name === `${TRASH_INDEX_NAME}.tmp`)) continue;
        const key = relDir ? `${relDir}/${e.name}` : e.name;
        if (covered(key)) continue; // item (or its folder) already has a clock
        if (e.isDirectory()) await walk(path.join(dirAbs, e.name), key);
        else if (e.isFile()) {
          idx.items[key] = nowMs;
          changed = true;
        }
      }
    };
    await walk(trashRoot, '');

    if (changed) await writeIndex(trashRoot, idx);
    return Object.entries(idx.items)
      .filter(([, at]) => at < cutoffMs)
      .map(([key]) => key);
  });
}
