import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { it, expect, vi } from 'vitest';
import { loadSnapshot, saveSnapshot } from './snapshot.js';
import { IndexProjection } from './projection.js';
import type { SnapshotPayload } from './types.js';
import { parseNote } from '../markdown.js';

it('roundtrips empty snapshots and rejects wrong identities or corrupted data', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-snapshot-')); const file = path.join(dir, 'index.json');
  const identity = { root: dir, policy: 'v1' };
  const payload: SnapshotPayload = { schemaVersion: 1, parserVersion: 1, identity, generation: 'test', revision: 0, savedAt: new Date().toISOString(), records: [], projection: new IndexProjection().exportState(), lastHashAuditAt: null, changesSinceBuild: 0 };
  try {
    await saveSnapshot(payload, file);
    expect(await loadSnapshot(identity, file)).toEqual(payload);
    expect(await loadSnapshot({ ...identity, policy: 'v2' }, file)).toBeNull();
    const previous = await fs.readFile(file, 'utf8');
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk failure'));
    await expect(saveSnapshot({ ...payload, revision: 1 }, file)).rejects.toThrow('disk failure');
    rename.mockRestore();
    expect(await fs.readFile(file, 'utf8')).toBe(previous);
    await fs.writeFile(file, previous.slice(0, -5));
    expect(await loadSnapshot(identity, file)).toBeNull();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

it('persists task metadata with all index records and rejects a different schema', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-snapshot-task-')); const file = path.join(dir, 'index.json');
  const identity = { root: dir, policy: 'v1' }; const projection = new IndexProjection();
  projection.applyNote('ЕЦП.md', parseNote('ЕЦП.md', '---\ntype: task\nstatus: done\n---\n# checklist'));
  const payload: SnapshotPayload = { schemaVersion: 1, parserVersion: 1, identity, generation: 'test', revision: 8, savedAt: new Date().toISOString(), records: [['ЕЦП.md', { stamp: { size: 55, mtimeMs: 1, ctimeMs: 1 }, sha256: 'a'.repeat(64) }]], projection: projection.exportState(), lastHashAuditAt: null, changesSinceBuild: 12 };
  try {
    await saveSnapshot(payload, file);
    const loaded = await loadSnapshot(identity, file);
    expect(loaded?.changesSinceBuild).toBe(12);
    expect((await IndexProjection.fromState(loaded!.projection).search.allTasks())[0].status).toBe('done');
    await saveSnapshot({ ...payload, schemaVersion: 2 } as unknown as SnapshotPayload, file);
    expect(await loadSnapshot(identity, file)).toBeNull();
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
