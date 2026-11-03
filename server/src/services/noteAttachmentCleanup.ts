import { exists } from './vault.js';
import { referenceSnapshot, referencedPaths, findFileReferences } from './referenceScan.js';

const isAttachment = (path: string) => !/\.(md|markdown|canvas|base)$/i.test(path);

/** Capture before source deletion; excludes notes/canvases/bases, like native Lx. */
export async function collectNoteAttachmentCandidates(sourcePath: string): Promise<string[]> {
  const { paths, documents } = await referenceSnapshot();
  const content = documents.get(sourcePath);
  if (content === undefined) return [];
  return [...new Set(referencedPaths(content, sourcePath, paths).filter(isAttachment))];
}

/** Run inside the mutation queue after deleting source. All scans fail closed.
 * The caller supplies the normal deletion/indexing operation, never permanent=true.
 * For ask, return candidates to the UI; a subsequent confirmed call must recheck.
 */
export async function cleanupNoteAttachments({ sourcePath, candidates, policy, selected, deleteAttachment }: {
  sourcePath: string; candidates: string[]; policy: 'ask' | 'always' | 'never'; selected?: string[];
  deleteAttachment: (path: string) => Promise<unknown>;
}): Promise<{ deleted: string[]; kept: string[]; pending: string[] }> {
  if (await exists(sourcePath)) throw new Error('Source must be deleted before attachment cleanup');
  const result = { deleted: [] as string[], kept: [] as string[], pending: [] as string[] };
  const inventory = [...new Set(candidates)].filter(isAttachment);
  // Verify every candidate before deleting any: a partial/incomplete scan keeps files.
  const unlinked = new Set<string>();
  if (policy !== 'never') for (const target of inventory) {
    if (await exists(target) && (await findFileReferences(target)).length === 0) unlinked.add(target);
  }
  for (const target of inventory) {
    if (!unlinked.has(target) || policy === 'never') result.kept.push(target);
    else if (policy === 'ask' && selected === undefined) result.pending.push(target);
    else if (policy === 'ask' && !selected!.includes(target)) result.kept.push(target);
    else {
      // Recheck immediately before each destructive step as earlier mutations may emit hooks.
      if ((await findFileReferences(target)).length) { result.kept.push(target); continue; }
      await deleteAttachment(target);
      result.deleted.push(target);
    }
  }
  return result;
}
