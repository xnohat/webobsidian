import { api } from '../api';
import { deleteDraftIfRevision } from './storage';
import type { DraftRecord } from './types';

/** Remove only snapshots whose complete text is confirmed in the same vault. */
export async function removeSavedDrafts(records: readonly DraftRecord[], canRemove: (record: DraftRecord) => boolean) {
  const files = new Map<string, DraftRecord[]>();
  for (const record of records) {
    if (!canRemove(record)) continue;
    const key = JSON.stringify([record.scopeId, record.path]);
    const group = files.get(key) ?? [];
    group.push(record); files.set(key, group);
  }
  for (const copies of files.values()) {
    const first = copies[0];
    if (!copies.some(canRemove)) continue;
    try {
      const remote = await api.read(first.path, first.scopeId);
      if (!remote.version || typeof remote.content !== 'string') continue;
      for (const record of copies) {
        if (record.content !== remote.content || !canRemove(record)) continue;
        // Recheck inside the IndexedDB transaction. Equal revision numbers do
        // not authorize deleting different text written by another tab.
        await deleteDraftIfRevision(record, record.revision, stored => canRemove(record) &&
          stored.content === record.content && stored.updatedAt === record.updatedAt &&
          stored.baseVersion === record.baseVersion && stored.state === record.state);
      }
    } catch { /* Missing/offline files and storage failures retain the copy. */ }
  }
}
