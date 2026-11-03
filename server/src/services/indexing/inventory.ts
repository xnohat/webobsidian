import { promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseNote } from '../markdown.js';
import type { FileStamp, InventoryScan, ReadResult } from './types.js';

export function isVisiblePath(rel: string): boolean {
  return !!rel && !path.isAbsolute(rel) && !rel.split(/[\\/]/).some(p => !p || p.startsWith('.') || p === 'node_modules');
}
export function isMarkdown(rel: string): boolean { return /\.(md|markdown)$/i.test(rel); }
export function sameStamp(a: FileStamp, b: FileStamp): boolean {
  return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.dev === b.dev && a.ino === b.ino;
}
function stamp(s: Stats): FileStamp { return { size: s.size, mtimeMs: s.mtimeMs, ctimeMs: s.ctimeMs, dev: s.dev, ino: s.ino }; }
function inside(abs: string, root: string): boolean { const rel = path.relative(root, abs); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); }
async function rootsFor(root: string, allowed: string[]): Promise<string[]> { return Promise.all([root, ...allowed].map(p => fs.realpath(p).catch(() => path.resolve(p)))); }

export type StampResult = { kind: 'ok'; stamp: FileStamp } | { kind: 'directory' } | { kind: 'missing' } | { kind: 'retry'; code: string };
export async function readFileStamp(root: string, rel: string, allowedRoots: string[] = []): Promise<StampResult> {
  if (!isVisiblePath(rel)) return { kind: 'retry', code: 'INVALID_PATH' };
  const abs = path.resolve(root, rel);
  if (!inside(abs, path.resolve(root))) return { kind: 'retry', code: 'INVALID_PATH' };
  try {
    const roots = await rootsFor(root, allowedRoots);
    const real = await fs.realpath(abs);
    if (!roots.some(r => inside(real, r))) return { kind: 'retry', code: 'OUTSIDE_ROOTS' };
    const st = await fs.stat(real);
    if (st.isDirectory()) return { kind: 'directory' };
    if (!st.isFile()) return { kind: 'retry', code: 'NOT_FILE' };
    return { kind: 'ok', stamp: stamp(st) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'STAT_ERROR';
    return code === 'ENOENT' ? { kind: 'missing' } : { kind: 'retry', code };
  }
}

export async function scanInventory(root: string, allowedRoots: string[] = []): Promise<InventoryScan> {
  const result: InventoryScan = { files: new Map(), complete: true, failedPrefixes: [] };
  const roots = await rootsFor(root, allowedRoots);
  const visited = new Set<string>();
  const fail = (rel: string) => { result.complete = false; result.failedPrefixes.push(rel); };
  async function walk(abs: string, rel: string): Promise<void> {
    try {
      const real = await fs.realpath(abs);
      if (!roots.some(r => inside(real, r))) return;
      if (visited.has(real)) return;
      visited.add(real);
      for (const entry of await fs.readdir(abs, { withFileTypes: true })) {
        const next = rel ? `${rel}/${entry.name}` : entry.name;
        if (!isVisiblePath(next)) continue;
        const target = path.join(abs, entry.name);
        try {
          const realTarget = await fs.realpath(target);
          if (!roots.some(r => inside(realTarget, r))) continue;
          const st = await fs.stat(target);
          if (st.isDirectory()) await walk(target, next);
          else if (st.isFile()) result.files.set(next, stamp(st));
        } catch { fail(next); }
      }
    } catch { fail(rel); }
  }
  await walk(path.resolve(root), '');
  return result;
}

export async function readStableNote(root: string, rel: string, previousHash?: string, allowedRoots: string[] = []): Promise<ReadResult> {
  if (!isVisiblePath(rel) || !isMarkdown(rel)) return { kind: 'retry', code: 'INVALID_PATH' };
  const abs = path.resolve(root, rel);
  if (!inside(abs, path.resolve(root))) return { kind: 'retry', code: 'INVALID_PATH' };
  try {
    const roots = await rootsFor(root, allowedRoots);
    const real = await fs.realpath(abs);
    if (!roots.some(r => inside(real, r))) return { kind: 'retry', code: 'OUTSIDE_ROOTS' };
    const handle = await fs.open(real, 'r');
    let bytes: Buffer; let before: FileStamp; let after: FileStamp;
    try {
      const initial = await handle.stat();
      if (!initial.isFile()) return { kind: 'retry', code: 'NOT_FILE' };
      before = stamp(initial); bytes = await handle.readFile(); after = stamp(await handle.stat());
    } finally { await handle.close(); }
    if (!sameStamp(before, after) || await fs.realpath(abs) !== real || !sameStamp(after, stamp(await fs.stat(abs)))) return { kind: 'retry', code: 'CHANGED_DURING_READ' };
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { kind: 'ok', stamp: after, sha256, ...(sha256 === previousHash ? {} : { parsed: parseNote(rel, bytes.toString('utf8')) }) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'READ_ERROR';
    return code === 'ENOENT' ? { kind: 'missing' } : { kind: 'retry', code };
  }
}
