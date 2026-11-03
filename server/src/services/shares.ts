import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';

/** Public share links (FR-10) — persisted as a JSON array in data/shares.json. */
export interface ShareRecord {
  id: string;
  path: string; // vault-relative note path
  enabled: boolean;
  createdAt: string;
  /** Optional scrypt hash — set when the share is password-protected. */
  passwordHash?: string;
}

const SHARES_FILE = path.join(config.dataDir, 'shares.json');

let cache: ShareRecord[] | null = null;

async function load(): Promise<ShareRecord[]> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(SHARES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed)
      ? parsed.filter(
          (r): r is ShareRecord =>
            r && typeof r.id === 'string' && typeof r.path === 'string',
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Atomic write: tmp + rename (same pattern as settings.json). */
async function persist(shares: ShareRecord[]): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${SHARES_FILE}.tmp-${randomBytes(4).toString('hex')}`;
  await fs.writeFile(tmp, JSON.stringify(shares, null, 2), { mode: 0o600 });
  await fs.rename(tmp, SHARES_FILE);
}

export async function listShares(): Promise<ShareRecord[]> {
  return [...(await load())];
}

/** Look up an ENABLED share by token (used by the public route). */
export async function getActiveShare(id: string): Promise<ShareRecord | null> {
  const shares = await load();
  return shares.find((s) => s.id === id && s.enabled) ?? null;
}

/**
 * Create a share for a note. One record per note: if the note already has a
 * share, re-enable and return it (keeps the existing public URL stable).
 */
export async function createShare(relPath: string): Promise<ShareRecord> {
  const shares = await load();
  const existing = shares.find((s) => s.path === relPath);
  if (existing) {
    if (!existing.enabled) {
      existing.enabled = true;
      await persist(shares);
    }
    return existing;
  }
  const record: ShareRecord = {
    id: randomBytes(16).toString('base64url'),
    path: relPath,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  shares.push(record);
  await persist(shares);
  return record;
}

export async function setShareEnabled(id: string, enabled: boolean): Promise<ShareRecord | null> {
  const shares = await load();
  const rec = shares.find((s) => s.id === id);
  if (!rec) return null;
  if (rec.enabled !== enabled) {
    rec.enabled = enabled;
    await persist(shares);
  }
  return rec;
}

/** Set (hash) or clear (null) the password of a share. */
export async function setSharePassword(id: string, passwordHash: string | null): Promise<ShareRecord | null> {
  const shares = await load();
  const rec = shares.find((s) => s.id === id);
  if (!rec) return null;
  if (passwordHash) rec.passwordHash = passwordHash;
  else delete rec.passwordHash;
  await persist(shares);
  return rec;
}

export async function deleteShare(id: string): Promise<boolean> {
  const shares = await load();
  const next = shares.filter((s) => s.id !== id);
  if (next.length === shares.length) return false;
  cache = next;
  await persist(next);
  return true;
}

/** Keep share paths in sync when notes are renamed/deleted elsewhere. */
export async function onFileRenamed(from: string, to: string): Promise<void> {
  const shares = await load();
  const updated = shares.map(s => s.path === from || s.path.startsWith(from + '/')
    ? { ...s, path: to + s.path.slice(from.length) } : s);
  if (!updated.some((s, i) => s !== shares[i])) return;
  await persist(updated);
  cache = updated;
}
