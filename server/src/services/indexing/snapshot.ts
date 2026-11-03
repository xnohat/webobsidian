import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { isVisiblePath } from './inventory.js';
import type { SnapshotPayload, VaultIdentity } from './types.js';

const defaultFile = () => path.join(config.dataDir, 'vault-index-v1.json');
const checksum = (text: string) => createHash('sha256').update(text).digest('hex');

function valid(payload: SnapshotPayload, identity: VaultIdentity): boolean {
  if (payload.schemaVersion !== 1 || payload.parserVersion !== 1 || payload.identity.root !== identity.root || payload.identity.policy !== identity.policy) return false;
  if (!Number.isSafeInteger(payload.revision) || payload.revision < 0 || !Number.isSafeInteger(payload.changesSinceBuild) || payload.changesSinceBuild < 0 || typeof payload.generation !== 'string' || typeof payload.savedAt !== 'string') return false;
  const files = payload.projection.files;
  if (!Array.isArray(files) || files.some(p => !isVisiblePath(p)) || new Set(files).size !== files.length) return false;
  const records = new Map(payload.records);
  if (records.size !== payload.records.length || records.size !== files.length || files.some(p => !records.has(p))) return false;
  for (const [rel, record] of records) {
    if (!isVisiblePath(rel) || !record || !record.stamp || ![record.stamp.size, record.stamp.mtimeMs, record.stamp.ctimeMs].every(Number.isFinite)) return false;
    if (record.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(record.sha256)) return false;
  }
  const notes = new Set(payload.projection.links.notes.map(([rel]) => rel));
  if (notes.size !== payload.projection.links.notes.length || [...notes].some(p => !records.has(p))) return false;
  // Validate serialized structure without allocating a second MiniSearch index.
  // Its actual deserializer is invoked once by the coordinator before publish.
  const search = payload.projection.search;
  if (search.mini.documentCount !== notes.size || search.tags.length !== notes.size) return false;
  for (const collection of [search.tags, search.snippets, search.propMeta]) {
    if (!Array.isArray(collection) || collection.length !== notes.size || new Set(collection.map(([rel]) => rel)).size !== notes.size || collection.some(([rel]) => !notes.has(rel))) return false;
  }
  if (!Array.isArray(search.tasks) || search.tasks.some(([rel]) => !notes.has(rel))) return false;
  return true;
}

export async function loadSnapshot(identity: VaultIdentity, filePath = defaultFile()): Promise<SnapshotPayload | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (raw[64] !== '\n' || checksum(raw.slice(65)) !== raw.slice(0, 64)) return null;
    const payload = JSON.parse(raw.slice(65)) as SnapshotPayload;
    return valid(payload, identity) ? payload : null;
  } catch { return null; }
}

export async function saveSnapshot(payload: SnapshotPayload, filePath = defaultFile()): Promise<void> {
  // Capture the entire consistent generation synchronously before the first await.
  const data = JSON.stringify(payload);
  const header = checksum(data) + '\n';
  const temp = `${filePath}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const handle = await fs.open(temp, 'wx');
    try { await handle.writeFile(header); await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, filePath);
  } finally { await fs.unlink(temp).catch(() => {}); }
}
