import { createHash } from 'node:crypto';

/**
 * Content version for the Agent API's optimistic lock (`base_version`).
 *
 * Deterministic over the UTF-8 bytes of the content — deliberately NOT mtime-based:
 * git autosync and the file watcher rewrite mtimes, so an mtime lock would report
 * false conflicts. The first 16 hex chars of the SHA-256 are plenty to detect a
 * concurrent edit in a personal vault and stay short enough to pass around in a
 * response body or a prompt.
 *
 * Adopted from the fork `blueberry6401/webobsidian` (their `services/noteversion.ts`);
 * see docs/UPSTREAM_PR_MERGES.md → "Adopted from other forks".
 */
export function contentVersion(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

export type VersionCheck = { ok: true } | { ok: false; currentVersion: string };

/**
 * Shared compare-and-set check behind the Agent API's PUT /notes/* (base_version)
 * and the web files route's PUT /content (baseVersion) — same semantics on both
 * surfaces:
 *  - `current` (the file's current content, or `null` if it doesn't exist) is
 *    compared against `baseVersion`.
 *  - File exists: ok iff `contentVersion(current) === baseVersion`.
 *  - File missing: ok iff `baseVersion === ''` (the caller expects a fresh
 *    note). Any other value is a conflict — without this, a write racing a
 *    delete could silently recreate the note.
 */
export function checkVersion(current: string | null, baseVersion: string): VersionCheck {
  if (current === null) {
    return baseVersion === '' ? { ok: true } : { ok: false, currentVersion: '' };
  }
  const currentVersion = contentVersion(current);
  return currentVersion === baseVersion ? { ok: true } : { ok: false, currentVersion };
}
