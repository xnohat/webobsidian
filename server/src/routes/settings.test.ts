import { describe, it, expect, vi } from 'vitest';

// Isolate the import chain — we only exercise the pure isWithinRoots predicate.
vi.mock('../services/settings.js', () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  redactSettings: vi.fn(),
  ensureVaultBrowsable: vi.fn(),
}));

import { isWithinRoots } from './settings.js';

describe('isWithinRoots — vault-path authorization boundary', () => {
  it('allows a path inside an allowed root', () => {
    expect(isWithinRoots('/vault/notes/a.md', ['/vault'])).toBe(true);
  });

  it('allows the root itself', () => {
    expect(isWithinRoots('/vault', ['/vault'])).toBe(true);
  });

  it('rejects escaping above the root (the {"path":"/","allowedRoots":["/"]} attack)', () => {
    expect(isWithinRoots('/', ['/vault'])).toBe(false);
    expect(isWithinRoots('/etc/passwd', ['/vault'])).toBe(false);
  });

  it('rejects a sibling that merely shares a name prefix', () => {
    expect(isWithinRoots('/vault-evil', ['/vault'])).toBe(false);
  });

  it('rejects traversal that resolves outside the root', () => {
    expect(isWithinRoots('/vault/../etc', ['/vault'])).toBe(false);
  });

  it('honours multiple roots', () => {
    expect(isWithinRoots('/data/x', ['/vault', '/data'])).toBe(true);
  });
});
