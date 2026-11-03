import { describe, it, expect } from 'vitest';
import { contentVersion, checkVersion } from './noteversion.js';

/**
 * checkVersion is the shared compare-and-set check behind PUT /api/files/content
 * (web) and PUT /api/v1/notes/* (agent). Same base_version semantics as the
 * Agent API: a missing file only satisfies baseVersion === '' — otherwise a
 * write racing a delete must not silently recreate the note.
 */
describe('checkVersion', () => {
  it('ok when the file does not exist and baseVersion is the empty string (create-if-absent)', () => {
    expect(checkVersion(null, '')).toEqual({ ok: true });
  });

  it('conflict when the file does not exist and baseVersion is non-empty', () => {
    expect(checkVersion(null, 'deadbeef00000000')).toEqual({ ok: false, currentVersion: '' });
  });

  it('ok when the file exists and baseVersion matches its current content version', () => {
    const content = 'hello world';
    expect(checkVersion(content, contentVersion(content))).toEqual({ ok: true });
  });

  it('conflict when the file exists and baseVersion is stale, reporting the current version', () => {
    const content = 'hello world';
    expect(checkVersion(content, 'stale0000000000')).toEqual({
      ok: false,
      currentVersion: contentVersion(content),
    });
  });
});
