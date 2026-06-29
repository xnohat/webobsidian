import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { settings, getSettingsMock } = vi.hoisted(() => {
  const settings = { git: { enabled: true, autoCommitOnSave: false, remote: '' } };
  return { settings, getSettingsMock: vi.fn(async () => settings) };
});
vi.mock('./settings.js', () => ({ getSettings: getSettingsMock, updateSettings: vi.fn() }));

const { describeChanges, scheduleAutoCommitOnSave } = await import('./git.js');

/** Minimal StatusResult-like object — describeChanges only reads `.files`. */
const status = (files: Array<{ path: string; index?: string; working_dir?: string }>) =>
  ({ files }) as any;

describe('describeChanges', () => {
  it('returns "Vault sync" with empty body for no changes', () => {
    expect(describeChanges(status([]))).toEqual({ subject: 'Vault sync', body: '' });
  });

  it('names a single added note (basename, .md stripped)', () => {
    const r = describeChanges(status([{ path: 'Notes/Hello.md', index: 'A' }]));
    expect(r.subject).toBe('Add Hello');
    expect(r.body).toBe('Added (1):\n  Notes/Hello.md');
  });

  it('treats an untracked (?) file as added', () => {
    expect(describeChanges(status([{ path: 'New.md', index: '?', working_dir: '?' }])).subject).toBe(
      'Add New',
    );
  });

  it('uses the right verb for delete / rename / modify', () => {
    expect(describeChanges(status([{ path: 'Old.md', index: 'D' }])).subject).toBe('Delete Old');
    expect(describeChanges(status([{ path: 'R.md', index: 'R' }])).subject).toBe('Rename R');
    expect(describeChanges(status([{ path: 'M.md', index: 'M' }])).subject).toBe('Update M');
  });

  it('summarizes mixed changes with counts and the first three names', () => {
    const r = describeChanges(
      status([
        { path: 'a1.md', index: 'A' },
        { path: 'a2.md', index: 'A' },
        { path: 'm1.md', index: 'M' },
        { path: 'd1.md', index: 'D' },
      ]),
    );
    expect(r.subject).toBe('Sync 4 notes (2 new, 1 edited, 1 deleted): a1, a2, m1 +1 more');
    expect(r.body).toContain('Added (2):');
    expect(r.body).toContain('Modified (1):');
    expect(r.body).toContain('Deleted (1):');
  });

  it('caps the subject at 72 chars with an ellipsis', () => {
    const r = describeChanges(status([{ path: 'x'.repeat(80) + '.md', index: 'A' }]));
    expect(r.subject.length).toBe(72);
    expect(r.subject.endsWith('…')).toBe(true);
    expect(r.subject.startsWith('Add x')).toBe(true);
  });

  it('caps the body file list at 100 with an "…and N more" line', () => {
    const files = Array.from({ length: 101 }, (_, i) => ({ path: `n${i}.md`, index: 'A' }));
    const r = describeChanges(status(files));
    expect(r.body).toContain('Added (101):');
    expect(r.body).toContain('…and 1 more');
  });
});

describe('scheduleAutoCommitOnSave (5s debounce)', () => {
  // Observable: the callback always awaits getSettings() first. With
  // autoCommitOnSave=false it short-circuits before touching the same-module
  // sync()/commitAll() (which can't run without real git), so getSettings call
  // count is a clean proxy for "the debounced callback fired".
  beforeEach(() => {
    settings.git.enabled = true;
    settings.git.autoCommitOnSave = false;
    settings.git.remote = '';
    getSettingsMock.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not fire before 5s', async () => {
    scheduleAutoCommitOnSave();
    await vi.advanceTimersByTimeAsync(4999);
    expect(getSettingsMock).not.toHaveBeenCalled();
  });

  it('fires once at 5s', async () => {
    scheduleAutoCommitOnSave();
    await vi.advanceTimersByTimeAsync(5000);
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid calls into a single fire', async () => {
    scheduleAutoCommitOnSave();
    scheduleAutoCommitOnSave();
    scheduleAutoCommitOnSave();
    await vi.advanceTimersByTimeAsync(5000);
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
  });
});
