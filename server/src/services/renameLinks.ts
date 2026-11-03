import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as vault from './vault.js';
import { contentVersion } from './noteversion.js';
import { getVaultPreferences } from './vaultPreferences.js';
import { parseFileReferences, resolveReference, type FileReference } from './fileReferences.js';

export interface RenameResult { removedPaths?:string[]; changedPaths: string[]; versions: Record<string, string> }
export interface RenameOptions { updateLinks?: boolean; mayWrite?: (path: string) => boolean | void | Promise<boolean | void> }
interface Edit { path: string; destination: string; before: string; after: string }
export interface RenamePlan {
  root: string; from: string; to: string; versions: Record<string, string>;
  moves: Record<string, string>; directories: string[]; edits: Edit[]; alwaysUpdateLinks: boolean;
}
interface Journal { format: 1; plan: RenamePlan }
const journalDirectory = '.webobsidian-rename';
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
async function fileHash(relativePath: string): Promise<string> {
  const stream = createReadStream(await vault.resolveInVault(relativePath));
  const digest = createHash('sha256');
  for await (const chunk of stream) digest.update(chunk as Buffer);
  return digest.digest('hex');
}
const conflict = (message: string, extra = {}) => Object.assign(new Error(message), { status: 409, code: 'rename_conflict', ...extra });
const movedPath = (p: string, from: string, to: string) => p === from ? to : p.startsWith(from + '/') ? to + p.slice(from.length) : p;
const stableVersions = (versions: Record<string, string>) => Object.fromEntries(Object.entries(versions).sort(([a], [b]) => a.localeCompare(b)));
const sameSnapshot = (a: { versions: Record<string, string>; directories: string[] }, b: { versions: Record<string, string>; directories: string[] }) =>
  JSON.stringify(stableVersions(a.versions)) === JSON.stringify(stableVersions(b.versions)) && JSON.stringify(a.directories) === JSON.stringify(b.directories);

function destinationParents(plan: RenamePlan): string[] {
  const parents: string[] = [];
  for (let p = path.posix.dirname(plan.to); p !== '.'; p = path.posix.dirname(p)) if (!plan.directories.includes(p)) parents.push(p);
  return parents;
}

function checkedPath(p: string): string {
  if (!p || p.includes('\\') || p.includes('\0') || path.posix.isAbsolute(p) || /^[a-z]:/i.test(p)) throw Object.assign(new Error('Invalid rename path'), { status: 400 });
  const clean = path.posix.normalize(p).replace(/\/$/, '');
  if (clean === '.' || clean === '..' || clean.startsWith('../') || clean.split('/').some(s => s.startsWith('.'))) throw Object.assign(new Error('Invalid rename path'), { status: 400 });
  return clean;
}
async function snapshot(): Promise<{ versions: Record<string, string>; directories: string[] }> {
  const versions: Record<string, string> = {};
  const directories: string[] = [];
  const root = await vault.getVaultRoot();
  const trash = vault.toRel(root, await vault.getTrashRoot());
  const walk = async (dir: string, ancestors: Set<string>): Promise<void> => {
    const abs = await vault.resolveInVault(dir);
    const real = await fs.realpath(abs);
    if (ancestors.has(real)) throw conflict(`Cyclic directory prevents a complete reference scan: ${dir}`);
    const visited = new Set(ancestors).add(real);
    for (const entry of (await fs.readdir(abs, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.name.toLowerCase() === '.git') {
        // Git metadata is never read, but keep nested entries in the directory
        // manifest so recovery does not silently move a newly-created repository.
        if (dir) directories.push(p);
        continue;
      }
      if (p === journalDirectory || p === '.obsidian' || p === trash) continue;
      const target = await vault.resolveInVault(p);
      const st = await fs.stat(target);
      if (st.isDirectory()) { directories.push(p); await walk(p, visited); }
      else if (st.isFile()) versions[p] = await fileHash(p);
      else throw conflict(`Unsupported entry prevents a complete reference scan: ${p}`);
    }
  };
  await walk('', new Set());
  return { versions, directories: directories.sort() };
}
function encode(p: string): string { return p.split('/').map(s => encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/'); }

function replacement(ref: FileReference, oldSource: string, newSource: string, plan: Pick<RenamePlan, 'from' | 'to'>, oldPaths: string[], newPaths: string[]): string {
  const target = ref.kind === 'canvas' ? oldPaths.find(p => p === ref.target) ?? null : resolveReference(ref.target, oldSource, oldPaths, ref.kind);
  if (!target) return ref.target;
  const next = movedPath(target, plan.from, plan.to);
  if (target === next && oldSource === newSource) return ref.target;
  if (ref.kind === 'canvas') return next;
  const fragmentAt = ref.target.indexOf('#');
  const raw = fragmentAt < 0 ? ref.target : ref.target.slice(0, fragmentAt);
  const fragment = fragmentAt < 0 ? '' : ref.target.slice(fragmentAt);
  // Keep existing spelling when it still identifies exactly the same file.
  if (target.toLowerCase() !== next.toLowerCase() || target === next) {
    if (resolveReference(ref.target, newSource, newPaths, ref.kind) === next) return ref.target;
  }
  let decoded: string;
  let literalPercent = false;
  try {
    decoded = decodeURIComponent(raw);
    literalPercent = ref.kind === 'wiki' && decoded !== raw && resolveReference(ref.target, oldSource, oldPaths, 'markdown') !== target;
  } catch { decoded = raw; literalPercent = ref.kind === 'wiki'; }
  const omitExtension = ref.kind === 'wiki' && !/\.(md|markdown)$/i.test(decoded) && /\.(md|markdown)$/i.test(next);
  const withoutExt = (p: string) => omitExtension ? p.replace(/\.(md|markdown)$/i, '') : p;
  let result: string;
  if (ref.kind === 'markdown' || ref.kind === 'html' || decoded.startsWith('./') || decoded.startsWith('../')) {
    result = withoutExt(path.posix.relative(path.posix.dirname(newSource), next));
    if (decoded.startsWith('./') && !result.startsWith('.')) result = './' + result;
    if (decoded.startsWith('/')) result = '/' + withoutExt(next);
  } else if (!decoded.includes('/')) {
    const base = withoutExt(path.posix.basename(next));
    result = resolveReference(base, newSource, newPaths, ref.kind) === next ? base : withoutExt(next);
  } else result = (decoded.startsWith('/') ? '/' : '') + withoutExt(next);
  const render = (p: string) => (ref.kind === 'markdown' || ref.kind === 'html' || (raw.includes('%') && !literalPercent) ? encode(p) : p.replace(/[#|\[\]]/g, c => encodeURIComponent(c))) + fragment;
  if (resolveReference(render(result), newSource, newPaths, ref.kind) !== next) {
    result = withoutExt(path.posix.relative(path.posix.dirname(newSource), next));
    if (!result.startsWith('.')) result = './' + result;
  }
  if (resolveReference(render(result), newSource, newPaths, ref.kind) !== next) throw conflict(`Cannot format an unambiguous link from ${newSource} to ${next}`);
  return render(result);
}
function rewrite(content: string, source: string, destination: string, plan: Pick<RenamePlan, 'from' | 'to'>, oldPaths: string[], newPaths: string[], canvas = false): string {
  if (canvas) {
    const doc: unknown = JSON.parse(content);
    if (!doc || typeof doc !== 'object') throw new Error(`Invalid canvas ${source}`);
    const nodes = (doc as { nodes?: unknown[] }).nodes;
    let changed = false;
    for (const value of nodes ?? []) {
      if (!value || typeof value !== 'object') continue;
      const node = value as { type?: string; file?: string; text?: string };
      if (node.type === 'file' && typeof node.file === 'string') {
        const next = replacement({ kind: 'canvas', target: node.file, from: 0, to: 0 }, source, destination, plan, oldPaths, newPaths);
        changed ||= next !== node.file; node.file = next;
      }
      if (node.type === 'text' && typeof node.text === 'string') {
        const next = rewrite(node.text, source, destination, plan, oldPaths, newPaths);
        changed ||= next !== node.text; node.text = next;
      }
    }
    return changed ? JSON.stringify(doc, null, 2) : content;
  }
  let result = content;
  for (const ref of parseFileReferences(content).reverse()) {
    const next = replacement(ref, source, destination, plan, oldPaths, newPaths);
    if (next !== ref.target) result = result.slice(0, ref.from) + next + result.slice(ref.to);
  }
  return result;
}

export async function planRename({ from, to }: { from: string; to: string }): Promise<RenamePlan> {
  return vault.withVaultMutation(async () => {
    from = checkedPath(from); to = checkedPath(to);
    if (to.startsWith(from + '/')) throw Object.assign(new Error('Cannot move a folder inside itself'), { status: 400 });
    const source = await vault.resolveInVault(from); await fs.lstat(source);
    const destination = await vault.resolveInVault(to);
    // lstat also detects dangling links; exists/stat would follow and miss them.
    const destinationEntry = await fs.lstat(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (from !== to && from.toLowerCase() !== to.toLowerCase() && destinationEntry) {
      throw Object.assign(new Error('destination_exists'), { status: 409 });
    }
    // Raw rename performs the authoritative case-only and destination collision check.
    if (from !== to && from.toLowerCase() !== to.toLowerCase() && await vault.exists(to)) throw Object.assign(new Error('destination_exists'), { status: 409 });
    if (from.toLowerCase() === to.toLowerCase() && from !== to && await exactExists(to)) throw Object.assign(new Error('destination_exists'), { status: 409 });
    const root = await vault.getVaultRoot();
    const { versions, directories } = await snapshot();
    const oldPaths = Object.keys(versions), newPaths = oldPaths.map(p => movedPath(p, from, to));
    const moves = Object.fromEntries(oldPaths.filter(p => movedPath(p, from, to) !== p).map(p => [p, movedPath(p, from, to)]));
    const edits: Edit[] = [];
    for (const p of oldPaths) {
      if (!/\.(md|markdown|canvas)$/i.test(p)) continue;
      const before = await vault.readFileText(p);
      if (hash(Buffer.from(before)) !== versions[p]) throw conflict(`File changed while planning: ${p}`);
      const destination = movedPath(p, from, to);
      const after = rewrite(before, p, destination, { from, to }, oldPaths, newPaths, /\.canvas$/i.test(p));
      if (before !== after) edits.push({ path: p, destination, before, after });
    }
    const preferences = await getVaultPreferences(root);
    return { root, from, to, versions, moves, directories, edits, alwaysUpdateLinks: preferences.values.alwaysUpdateLinks };
  });
}

async function exactExists(p: string): Promise<boolean> {
  const abs = await vault.resolveInVault(p);
  try { return (await fs.readdir(path.dirname(abs))).includes(path.basename(abs)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

async function removeJournal(rel: string): Promise<void> {
  await fs.unlink(await vault.resolveInVault(rel));
  // Once the journal was removed the transaction is complete. Directory cleanup
  // must not turn a successful commit into an attempted rollback without a journal.
  await fs.rmdir(await vault.resolveInVault(journalDirectory)).catch(() => {});
}

/** The journal contains the original text. Retain it on a conflict for manual recovery. */
async function rollback(plan: RenamePlan): Promise<void> {
  const hasFrom = await exactExists(plan.from), hasTo = await exactExists(plan.to);
  if (hasFrom && !hasTo) return;
  if (plan.from === plan.to) return;
  if (hasFrom || !hasTo) throw conflict('Rename recovery path conflict');
  for (const edit of [...plan.edits].reverse()) {
    const current = await vault.readFileText(edit.destination);
    if (current === edit.before) continue;
    if (current !== edit.after) throw conflict(`External changes preserved at ${edit.destination}`);
    await vault.writeFileText(edit.destination, edit.before);
  }
  // Moving a folder back would also move newly-created external files. Refuse it.
  const current = await snapshot();
  const actual = Object.keys(current.versions).filter(p => p === plan.to || p.startsWith(plan.to + '/')).sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.values(plan.moves).sort())) throw conflict('External directory changes preserved during recovery');
  const actualDirs = current.directories.filter(p => p === plan.to || p.startsWith(plan.to + '/'));
  const expectedDirs = plan.directories.filter(p => p === plan.from || p.startsWith(plan.from + '/')).map(p => movedPath(p, plan.from, plan.to)).sort();
  if (JSON.stringify(actualDirs) !== JSON.stringify(expectedDirs)) throw conflict('External directory changes preserved during recovery');
  for (const [before, after] of Object.entries(plan.moves)) {
    if (await fileHash(after) !== plan.versions[before]) throw conflict(`External changes preserved at ${after}`);
  }
  await vault.rawRename(plan.to, plan.from);
  for (const p of destinationParents(plan)) await fs.rmdir(await vault.resolveInVault(p)).catch(() => {});
}

export async function recoverPendingRenames(): Promise<void> {
  return vault.withVaultMutation(async () => {
    const dir = await vault.resolveInVault(journalDirectory);
    let entries: string[];
    try { entries = await fs.readdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const name of entries.filter(p => /^[a-f\d-]+\.json$/.test(p)).sort()) {
      const file = path.join(dir, name);
      const journal = JSON.parse(await fs.readFile(file, 'utf8')) as Journal;
      if (journal.format !== 1 || journal.plan.root !== await vault.getVaultRoot()) throw conflict('Invalid rename recovery journal');
      checkedPath(journal.plan.from); checkedPath(journal.plan.to);
      await rollback(journal.plan);
      await removeJournal(`${journalDirectory}/${name}`);
    }
  });
}

export async function applyRename(plan: RenamePlan, options: RenameOptions = {}): Promise<RenameResult> {
  return vault.withVaultMutation(async () => {
    if (plan.root !== await vault.getVaultRoot()) throw conflict('Active vault changed');
    checkedPath(plan.from); checkedPath(plan.to);
    await recoverPendingRenames();
    const expectedSnapshot = { versions: plan.versions, directories: plan.directories };
    if (!sameSnapshot(await snapshot(), expectedSnapshot)) throw conflict('Vault changed since rename was planned');
    if (plan.edits.length && options.updateLinks === undefined && !plan.alwaysUpdateLinks) {
      throw Object.assign(new Error('Choose whether to update links'), { status: 409, code: 'rename_confirmation_required', affectedCount: plan.edits.length, affectedNotes: plan.edits.map(e => e.path) });
    }
    const edits = options.updateLinks === false ? [] : plan.edits;
    const movedDirectories = plan.directories.filter(p => p === plan.from || p.startsWith(plan.from + '/'));
    const writePaths = new Set([plan.from, plan.to, ...Object.keys(plan.moves), ...Object.values(plan.moves), ...movedDirectories.flatMap(p => [p, movedPath(p, plan.from, plan.to)]), ...edits.flatMap(e => [e.path, e.destination])]);
    for (const p of writePaths) if (options.mayWrite && await options.mayWrite(p) === false) throw Object.assign(new Error(`File locked: ${p}`), { status: 423, path: p, code: 'locked' });
    if (!sameSnapshot(await snapshot(), expectedSnapshot)) throw conflict('Vault changed during permission checks');
    if (plan.from === plan.to) return { changedPaths: [], versions: {} };
    const activePlan = { ...plan, edits };
    const journalPath = `${journalDirectory}/${randomUUID()}.json`;
    await vault.writeFileText(journalPath, JSON.stringify({ format: 1, plan: activePlan } satisfies Journal));
    try {
      await vault.rawRename(plan.from, plan.to);
      for (const edit of edits) {
        const current = await vault.readFileText(edit.destination);
        if (current !== edit.before) throw conflict(`File changed before write: ${edit.destination}`);
        await vault.writeFileText(edit.destination, edit.after);
      }
      // Verify every moved byte, including attachments, before discarding recovery data.
      const versions: Record<string, string> = {};
      for (const [before, after] of Object.entries(plan.moves)) {
        const edit = edits.find(e => e.destination === after);
        if (await fileHash(after) !== (edit ? hash(Buffer.from(edit.after)) : plan.versions[before])) throw conflict(`File changed during rename: ${after}`);
        if (vault.isTextFile(after)) versions[after] = contentVersion(await vault.readFileText(after));
      }
      for (const edit of edits) {
        const current = await vault.readFileText(edit.destination);
        if (current !== edit.after) throw conflict(`File changed during rename: ${edit.destination}`);
        versions[edit.destination] = contentVersion(current);
      }
      const expectedVersions = Object.fromEntries(Object.entries(plan.versions).map(([p, version]) => [movedPath(p, plan.from, plan.to), version]));
      for (const edit of edits) expectedVersions[edit.destination] = hash(Buffer.from(edit.after));
      const expectedDirectories = [...new Set([...plan.directories.map(p => movedPath(p, plan.from, plan.to)), ...destinationParents(plan)])].sort();
      if (!sameSnapshot(await snapshot(), { versions: expectedVersions, directories: expectedDirectories })) throw conflict('Vault changed during rename');
      await removeJournal(journalPath);
      return { removedPaths:Object.keys(plan.moves).filter(p=>p!==plan.moves[p]),changedPaths: [...new Set([...Object.values(plan.moves), ...edits.map(e => e.destination)])], versions };
    } catch (error) {
      try { await rollback(activePlan); await removeJournal(journalPath); }
      catch (recoveryError) { throw conflict('Rename interrupted; recovery data retained and external edits preserved', { journalPath, cause: recoveryError }); }
      throw error;
    }
  });
}

export async function renameWithLinks(input: { from: string; to: string } & RenameOptions): Promise<RenameResult> {
  return vault.withVaultMutation(async () => applyRename(await planRename(input), input));
}
